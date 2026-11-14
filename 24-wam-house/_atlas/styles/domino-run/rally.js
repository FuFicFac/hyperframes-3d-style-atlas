// styles/domino-run/rally.js — the domino rally planner (pure, THREE-free, Node-safe).
// Imported by style.js (picture) AND by the demo's scene.config.js (SCORE, camera chase, framing gate), so the clicks,
// the camera and the tiles all read one plan.
//
//   const R = createRally(STYLE_SPEC);
//   const A = R.line("A", R.path([[-6, 0], [-3, 0]]), { colors: [...] });          // tiles along a path
//   R.ball({ from: [-8, 0], into: A.first, at: 0.2 });                              // a rolling ball starts it
//   const [B1, B2] = [R.line("B1", ...), R.line("B2", ...)]; R.split(A, [B1, B2]);  // one tile triggers two lines
//   const F = R.field("F", ["#..#", ...], { origin, dir, order: "vee" }); R.link(B1.last, F.entry);
//   R.flag({ at, by: B2.last }); R.banner({ at, by: F.lastRow });
//   const plan = R.solve();      // trigger times (earliest arrival over the trigger graph), events, angle solver
//   plan.anglesAt(t, out)         // every tile's fall angle at t (pure; no state between calls)
//
// Topple model (2D, in the falling tile's vertical plane). A tile pivots about its FRONT bottom edge. Its free fall is
//   g(tau) = hit * G(tau / dt),  G(u) = push * u + (1 - push) * u^2      (tau = t - trigger)
// where hit = the angle at which its top corner touches the upright next tile, asin((d - T) / H), and dt = path gap /
// wave speed, so the next tile is struck exactly at trigger + dt (the wave runs at the set speed). After contact the
// tile cannot pass the next one: phi_i = min(g_i, c_ij(phi_j)) with the exact corner-on-face contact
//   c(psi) = psi + asin((d cos psi - T - dy sin psi) / H)
// (d = pivot gap along the tile's heading, dy = height step to the next tile). c is increasing, c(0) = hit, and on a
// straight run phi = psi solves d cos psi = T: tiles come to rest stacked at acos(T / d). A tile with no next tile falls
// flat (pi/2). Tiles are evaluated in descending trigger order, so each call is O(n) and depends only on t.
import { clamp, lerp } from "../../kit/time.js";
import { filletPath, arcTable } from "../../kit/pathmath.js";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** spiral(center [x,z], r0, r1, turns, { theta0 = pi/2, dir = -1, step = .05 }) -> [[x, z]...] (r linear in angle) */
export function spiral(center, r0, r1, turns, { theta0 = HALF_PI, dir = -1, step = 0.05 } = {}) {
  const out = [];
  const total = turns * TAU, n = Math.max(8, Math.ceil((total * Math.max(r0, r1)) / step));
  for (let k = 0; k <= n; k++) {
    const u = k / n, th = theta0 + dir * total * u, r = lerp(r0, r1, u);
    out.push([center[0] + r * Math.cos(th), center[1] + r * Math.sin(th)]);
  }
  return out;
}

/** a simple 5-row x N bitmap helper: rows of strings, '#' (or any char in `ink`) = ink cell */
export const bitmapRows = (rows, ink = "#") => rows.map((r) => [...r].map((ch) => ink.includes(ch)));

/**
 * createRally(STYLE_SPEC, { speed }) -> builder. All layout in metres on the floor (x right, z toward the viewer).
 */
export function createRally(S, o = {}) {
  const { W, H, T, spacing: SP } = S.tile;
  const speed0 = o.speed ?? S.wave.speed;
  const push = S.wave.push ?? 0.55;
  const margin = S.wave.margin ?? 0.004;
  const rise = S.stair.rise;
  const tiles = [];      // see addTile
  const lines = {};      // id -> line
  const links = [];      // { a, b, contact, delay }
  const sources = [];    // { tile, t, kind }
  const balls = [], gadgets = [], blocks = [], fields = [];

  /** path(points [[x,z]...], { fillet = .6, step = .03 }) -> arc table (3D, y = 0) with tangent(s) -> [x, z] */
  function path(pts2, { fillet = 0.6, step = 0.03 } = {}) {
    const P = pts2.map((p) => [p[0], 0, p[1]]);
    const bent = fillet > 0 ? filletPath(P, fillet) : P;
    const raw = arcTable(bent);
    const n = Math.max(2, Math.ceil(raw.length / step)), res = [];
    for (let i = 0; i <= n; i++) res.push(raw.at((raw.length * i) / n).p);
    const tab = arcTable(res);
    tab.tangent = (s) => {
      const e = 0.06, a = tab.at(s - e).p, b = tab.at(s + e).p;
      const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    };
    tab.point2 = (s) => { const p = tab.at(s).p; return [p[0], p[2]]; };
    return tab;
  }

  function addTile(t) {
    const i = tiles.length;
    tiles.push({ i, next: [], prev: [], maxLean: HALF_PI, trig: Infinity, dt: SP / speed0, hit: Math.asin(clamp((SP - T) / H, -1, 1)), ...t });
    return i;
  }

  /**
   * line(id, path, { s0 = 0, s1 = path.length, spacing, speed, colors, run = 1, back, colorAt(k, c), levels, bridge })
   *   colors: front colours cycled per `run` tiles; back: back-face colour (default = front); colorAt(k, [x, z]) ->
   *   { front, back } overrides. levels: [[k, L], ...] = from tile k on, stand on block level L (L x stair.rise high).
   *   bridge: [k0, k1] = render the raised run containing these tiles as a plank bridge on piers instead of a block.
   */
  function line(id, P, lo = {}) {
    const sp = lo.spacing ?? SP, speed = lo.speed ?? speed0;
    const s0 = lo.s0 ?? 0, s1 = lo.s1 ?? P.length;
    const colors = lo.colors ?? S.palette.tiles, run = lo.run ?? 1;
    const lev = (k) => { let L = 0; for (const [kk, LL] of lo.levels ?? []) if (k >= kk) L = LL; return L; };
    const L = { id, tiles: [], speed, spacing: sp, path: P, bridge: lo.bridge ?? null };
    for (let k = 0, s = s0; s <= s1 + 1e-9; k++, s = s0 + k * sp) {
      const [dx, dz] = P.tangent(s), c = P.point2(s);
      let front = colors[Math.floor(k / run) % colors.length], back = lo.back ?? front;
      if (lo.colorAt) ({ front, back } = { front, back, ...lo.colorAt(k, c) });
      const level = lev(k), y = level * rise;
      L.tiles.push(addTile({
        line: id, k, s, level, dir: [dx, dz], yaw: Math.atan2(dx, dz), front, back, speed,
        c: [c[0], y, c[1]], p: [c[0] + (dx * T) / 2, y, c[1] + (dz * T) / 2],
      }));
    }
    for (let k = 0; k < L.tiles.length - 1; k++) link(L.tiles[k], L.tiles[k + 1]);
    L.first = L.tiles[0];
    L.last = L.tiles[L.tiles.length - 1];
    lines[id] = L;
    if (lo.levels) stairBlocks(L);
    return L;
  }

  /** link(a, b, { contact = true, delay = 0 }): tile a triggers tile b (contact: a comes to rest leaning on b). */
  function link(a, b, { contact = true, delay = 0 } = {}) {
    links.push({ a, b, contact, delay });
    if (contact) { tiles[a].next.push(b); tiles[b].prev.push(a); }
  }
  /** split(lineA, [lineB, lineC]): A's last tile strikes the first tiles of both (place them side by side). */
  const split = (A, Bs) => Bs.forEach((B) => link(A.last, B.first));
  /** merge([lineA, lineB], lineC): both last tiles strike C's first tile; it falls at the first arrival. */
  const merge = (As, C) => As.forEach((A) => link(A.last, C.first));
  /** start(tile, t): a source (finger push, timed release). */
  const start = (tile, t, kind = "push") => sources.push({ tile, t, kind });

  // ---- stairs and bridges: one block per raised run of tiles (straight segments only)
  function stairBlocks(L) {
    const m = S.stair.margin, ids = L.tiles;
    let k = 0;
    while (k < ids.length) {
      const lv = tiles[ids[k]].level;
      if (lv <= 0) { k++; continue; }
      let e = k;
      while (e + 1 < ids.length && tiles[ids[e + 1]].level === lv) e++;
      const A = tiles[ids[k]], B = tiles[ids[e]];
      const sBack = A.s - T / 2 - m;
      const nxt = ids[e + 1] != null ? tiles[ids[e + 1]] : null;
      const sFront = !nxt ? B.s + T / 2 + 0.06 : nxt.level < lv ? B.s + T / 2 : nxt.s - T / 2 - m;
      const isBridge = L.bridge && L.bridge[0] <= e && L.bridge[1] >= k;
      const a = L.path.point2(sBack), b = L.path.point2(sFront);
      blocks.push({ kind: isBridge ? "bridge" : "step", line: L.id, level: lv, h: lv * rise, a, b, w: S.stair.width, deckT: S.stair.deckT, pier: S.stair.pier });
      k = e + 1;
    }
  }

  /**
   * field(id, bitmap (rows of strings or booleans; row 0 = the row hit first), { origin [x, z] = centre of row 0,
   *   dir [x, z] = fall direction (rows advance this way), pitch, spacing, paper, ink, front, order = "rows"|"vee"|"snake",
   *   entryCol = middle, spread, speed })
   *   Tiles fall toward dir: a camera on the dir side sees the plain FRONT faces standing and the picture (BACK faces:
   *   paper / ink) once fallen. rows/vee: one line per column; row 0 fans out from the entry tile (vee: delay grows with
   *   the column distance, spread x row step per column). snake: one serpentine line through the rows (slow, physical).
   */
  function field(id, bitmap, fo = {}) {
    const rowsB = bitmap.map((r) => (typeof r === "string" ? [...r].map((ch) => ch === "#") : r));
    const nr = rowsB.length, nc = Math.max(...rowsB.map((r) => r.length));
    const pitch = fo.pitch ?? S.field.pitch, sp = fo.spacing ?? SP, speed = fo.speed ?? speed0;
    const [dx, dz] = (() => { const d = fo.dir ?? [0, 1], l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; })();
    const ax = [dz, -dx];                                  // across the rows (screen right when looking along -dir)
    const ox = fo.origin ?? [0, 0];
    const paper = fo.paper ?? S.palette.cream, ink = fo.ink ?? S.palette.red, front = fo.front ?? S.palette.cream;
    const order = fo.order ?? "vee", c0 = fo.entryCol ?? Math.floor(nc / 2), spread = fo.spread ?? S.field.spread;
    const cell = (r, c) => {
      const off = (c - (nc - 1) / 2) * pitch;            // c = 0 on the left when viewed from the dir side
      return [ox[0] - ax[0] * off + dx * r * sp, ox[1] - ax[1] * off + dz * r * sp];
    };
    const grid = [];
    const F = { id, nr, nc, grid, order, speed, dir: [dx, dz] };
    if (order === "snake") {
      const pts = [];
      for (let r = 0; r < nr; r++) {
        const L2R = r % 2 === 0, a = cell(r, L2R ? -1 : nc), b = cell(r, L2R ? nc : -1);
        pts.push(a, b);
      }
      const P = path(pts, { fillet: sp * 0.5 });
      const Ln = line(id, P, {
        spacing: pitch, speed,
        colorAt: (k, p) => {
          // nearest cell
          const rx = (p[0] - ox[0]) * dx + (p[1] - ox[1]) * dz, cx = -((p[0] - ox[0]) * ax[0] + (p[1] - ox[1]) * ax[1]);
          const r = Math.round(rx / sp), c = Math.round(cx / pitch + (nc - 1) / 2);
          const on = rowsB[r]?.[c];
          return { front, back: on == null ? front : on ? ink : paper };
        },
      });
      F.entry = Ln.first; F.lastRow = [Ln.last]; F.lines = [id];
    } else {
      for (let c = 0; c < nc; c++) {
        const col = [];
        for (let r = 0; r < nr; r++) {
          const p2 = cell(r, c);
          col.push(addTile({
            line: `${id}:c${c}`, field: id, k: r, r, col: c, s: r * sp, level: 0, dir: [dx, dz], yaw: Math.atan2(dx, dz),
            front, back: rowsB[r][c] ? ink : paper, speed,
            c: [p2[0], 0, p2[1]], p: [p2[0] + (dx * T) / 2, 0, p2[1] + (dz * T) / 2],
          }));
        }
        for (let r = 0; r < nr - 1; r++) link(col[r], col[r + 1]);
        lines[`${id}:c${c}`] = { id: `${id}:c${c}`, tiles: col, speed, spacing: sp, first: col[0], last: col[nr - 1] };
        grid.push(col);
      }
      const rowStep = sp / speed;
      for (let c = 0; c < nc; c++) if (c !== c0) link(grid[c0][0], grid[c][0], { contact: false, delay: (order === "vee" ? spread * Math.abs(c - c0) : 0) * rowStep });
      F.entry = grid[c0][0];
      F.lastRow = grid.map((col) => col[nr - 1]);
      F.lines = grid.map((_, c) => `${id}:c${c}`);
    }
    const cs = [cell(0, -0.5), cell(0, nc - 0.5), cell(nr - 1, -0.5), cell(nr - 1, nc - 0.5)];
    F.box = { min: [Math.min(...cs.map((p) => p[0])), 0, Math.min(...cs.map((p) => p[1]))], max: [Math.max(...cs.map((p) => p[0])), H, Math.max(...cs.map((p) => p[1]))] };
    fields.push(F);
    return F;
  }

  /**
   * ball({ id, from [x, z], into: tile, at: release time | by: tile (struck by that tile), v0, decel, r, color })
   *   Rolls in a straight line to the back face of `into`, decelerating: s = v0 tau - decel tau^2 / 2. Its arrival time
   *   is that tile's trigger (a source). by: the ball sits at `from` until `by` falls onto it (trigger + dt).
   */
  function ball(bo) {
    const B = { id: bo.id ?? `ball${balls.length}`, r: bo.r ?? S.ball.r, v0: bo.v0 ?? S.ball.v0, decel: bo.decel ?? S.ball.decel, color: bo.color ?? S.ball.color, from: bo.from, into: bo.into, at: bo.at, by: bo.by };
    const tj = tiles[bo.into];
    const back = [tj.c[0] - (tj.dir[0] * T) / 2, tj.c[2] - (tj.dir[1] * T) / 2];
    // contact centre: touching the back face at the ball's equator height (or the tile's mid height if lower)
    const to = [back[0] - tj.dir[0] * B.r, back[1] - tj.dir[1] * B.r];
    const dx = to[0] - B.from[0], dz = to[1] - B.from[1], Ld = Math.hypot(dx, dz);
    B.to = to; B.dir = [dx / Ld, dz / Ld]; B.length = Ld; B.y = tj.c[1] + B.r;
    const disc = B.v0 * B.v0 - 2 * B.decel * Ld;
    if (disc <= 0) throw new Error(`rally.ball ${B.id}: stops short (v0 ${B.v0} too low for ${Ld.toFixed(2)} m)`);
    B.dur = (B.v0 - Math.sqrt(disc)) / B.decel;
    balls.push(B);
    return B;
  }

  /** flag({ id, at [x, z], yaw, by: tile }): springs up when `by` lands on its lever (the tile's landing time). */
  function flag(go) { const G = { kind: "flag", id: go.id ?? `flag${gadgets.length}`, ...go }; gadgets.push(G); return G; }
  /** banner({ id, at [x, z], yaw, by: tile | [tiles], delay }): drops when the last of `by` lands (+ delay). */
  function banner(go) { const G = { kind: "banner", id: go.id ?? `banner${gadgets.length}`, ...go }; gadgets.push(G); return G; }

  // ---------------------------------------------------------------- solve
  function solve() {
    const n = tiles.length;
    // contact geometry (in the falling tile's frame)
    for (const ti of tiles) {
      ti.contacts = ti.next.map((j) => {
        const tj = tiles[j];
        const rel = [tj.p[0] - ti.p[0], tj.p[2] - ti.p[2]];
        const along = rel[0] * ti.dir[0] + rel[1] * ti.dir[1];
        const dyaw = wrapPi(tj.yaw - ti.yaw);
        const d = along - (W / 2) * Math.abs(Math.sin(dyaw)) - margin;
        return { j, d, dy: tj.c[1] - ti.c[1], along };
      });
      if (ti.contacts.length) {
        const dmin = Math.min(...ti.contacts.map((c) => c.d));
        const gap = Math.max(...ti.contacts.map((c) => c.along));
        ti.hit = Math.asin(clamp((dmin - T) / H, 0.05, 1));
        ti.dt = gap / ti.speed;
      } else {
        ti.hit = Math.asin(clamp((SP - T) / H, 0.05, 1));
        ti.dt = SP / ti.speed;
      }
      // a tile right before a step up leans on the step edge at most
      for (const c of ti.contacts) if (c.dy > 1e-6) {
        const xc = c.along - T - S.stair.margin;
        ti.maxLean = Math.min(ti.maxLean, Math.atan2(xc, c.dy));
      }
    }
    // balls struck by a tile: release = that tile's hit time; ball arrivals are sources
    const trig = new Float64Array(n).fill(Infinity);
    const src = sources.map((s) => ({ ...s }));
    const edges = links.map((l) => ({ ...l, w: (l.contact ? tiles[l.a].dt : 0) + l.delay }));
    // earliest arrival (Dijkstra, O(n^2) is fine for a few hundred tiles); balls released by tiles resolve lazily
    const pendingBalls = balls.filter((b) => b.by != null);
    balls.filter((b) => b.by == null).forEach((b) => { b.start = b.at ?? 0; src.push({ tile: b.into, t: b.start + b.dur, kind: "ball", ball: b.id }); });
    const done = new Uint8Array(n);
    const best = new Float64Array(n).fill(Infinity);
    for (const s of src) best[s.tile] = Math.min(best[s.tile], s.t);
    for (;;) {
      let u = -1, bu = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && best[i] < bu) { bu = best[i]; u = i; }
      if (u < 0) break;
      done[u] = 1; trig[u] = bu;
      for (const e of edges) if (e.a === u && !done[e.b]) best[e.b] = Math.min(best[e.b], bu + e.w);
      for (const b of pendingBalls) if (b.by === u && b.start == null) {
        b.start = bu + tiles[u].dt;
        best[b.into] = Math.min(best[b.into], b.start + b.dur);
      }
    }
    tiles.forEach((t, i) => (t.trig = trig[i]));
    // landing times (tiles with no contact successor fall flat): solve hit * G(u) = maxLean
    const Ginv = (y) => (-push + Math.sqrt(push * push + 4 * (1 - push) * y)) / (2 * (1 - push));
    for (const t of tiles) {
      t.land = t.contacts.length ? Infinity : t.trig + t.dt * Ginv(Math.min(t.maxLean, HALF_PI) / t.hit);
    }
    const order = tiles.map((t) => t.i).filter((i) => isFinite(tiles[i].trig)).sort((a, b) => tiles[b].trig - tiles[a].trig);
    // gadgets
    const landOf = (by) => Math.max(...[].concat(by).map((i) => (isFinite(tiles[i].land) ? tiles[i].land : tiles[i].trig + tiles[i].dt)));
    for (const g of gadgets) g.t = landOf(g.by) + (g.delay ?? 0);

    // events: one 'topple' per struck tile (its trigger), 'land' for line ends, ball and gadget events
    const events = [];
    for (const t of tiles) {
      if (!isFinite(t.trig)) continue;
      events.push({ t: t.trig, kind: "topple", tile: t.i, line: t.line, field: t.field ?? null });
      if (isFinite(t.land)) events.push({ t: t.land, kind: "land", tile: t.i, line: t.line, field: t.field ?? null });
    }
    for (const b of balls) if (b.start != null) {
      events.push({ t: b.start, kind: "roll", ball: b.id, dur: b.dur });
      events.push({ t: b.start + b.dur, kind: "ballHit", ball: b.id });
    }
    for (const g of gadgets) events.push({ t: g.t, kind: g.kind, id: g.id });
    events.sort((a, b) => a.t - b.t);

    const G = (u) => push * u + (1 - push) * u * u;
    const contactAngle = (c, psi) => psi + Math.asin(clamp((c.d * Math.cos(psi) - T - c.dy * Math.sin(psi)) / H, -1, 1));
    /** anglesAt(t, out = new Float32Array(n)) -> fall angle of every tile at t (0 = upright). Pure. */
    function anglesAt(t, out = new Float32Array(n)) {
      out.fill(0);
      for (const i of order) {
        const ti = tiles[i];
        if (t <= ti.trig) continue;
        let phi = Math.min(ti.hit * G((t - ti.trig) / ti.dt), ti.maxLean, HALF_PI);
        for (const c of ti.contacts) phi = Math.min(phi, contactAngle(c, out[c.j]));
        out[i] = Math.max(0, phi);
      }
      return out;
    }
    /** gap(i, c, angles) -> signed clearance (m) between tile i's top corner and the next tile's back face (>= 0 ok) */
    function gap(i, c, A) {
      const phi = A[i], psi = A[c.j];
      return (c.d * Math.cos(psi) - T - c.dy * Math.sin(psi)) - H * Math.sin(phi - psi);
    }
    /** worstOverlap(times) -> most negative clearance over all contact pairs (Node check: no tile passes the next) */
    function worstOverlap(times) {
      let worst = { gap: 0 };
      const A = new Float32Array(n);
      for (const t of times) {
        anglesAt(t, A);
        for (const ti of tiles) for (const c of ti.contacts) {
          const g = gap(ti.i, c, A);
          if (g < worst.gap) worst = { gap: g, t, i: ti.i, j: c.j };
        }
      }
      return worst;
    }
    /** front(lineId, t) -> [x, y, z] wave front on a line (between the last struck tile and the next). */
    function front(id, t) {
      const L = lines[id], ids = L.tiles;
      if (t <= tiles[ids[0]].trig) return tiles[ids[0]].c.slice();
      for (let k = 0; k < ids.length - 1; k++) {
        const a = tiles[ids[k]], b = tiles[ids[k + 1]];
        if (t < b.trig) { const u = clamp((t - a.trig) / (b.trig - a.trig)); return [lerp(a.c[0], b.c[0], u), lerp(a.c[1], b.c[1], u), lerp(a.c[2], b.c[2], u)]; }
      }
      return tiles[ids[ids.length - 1]].c.slice();
    }
    /** chase(route [lineIds], t) -> front of the latest line in route that has started */
    function chase(route, t) {
      let id = route[0];
      for (const r of route) if (tiles[lines[r].first].trig <= t) id = r;
      return front(id, t);
    }
    /** ballAt(ball, t) -> { p: [x, y, z], s (m rolled), roll (rad about the axis across dir), moving } */
    function ballAt(B, t) {
      const st = B.start ?? Infinity;
      const tau = clamp(t - st, 0, B.dur);
      const s = B.v0 * tau - 0.5 * B.decel * tau * tau;
      return { p: [B.from[0] + B.dir[0] * s, B.y, B.from[1] + B.dir[1] * s], s, roll: s / B.r, moving: t > st && t < st + B.dur };
    }
    const lineSpan = (id) => { const L = lines[id]; return { start: tiles[L.first].trig, end: Math.max(...L.tiles.map((i) => (isFinite(tiles[i].land) ? tiles[i].land : tiles[i].trig))) }; };
    return { tiles, lines, links, balls, gadgets, blocks, fields, events, order, anglesAt, worstOverlap, front, chase, ballAt, lineSpan, count: n, dims: { W, H, T, spacing: SP } };
  }

  return { path, line, link, split, merge, start, field, ball, flag, banner, solve, tiles, lines, spiral };
}

// ---------------------------------------------------------------- sound: one click per topple, thinned
/**
 * toppleEvents(events, { bin = .035 }) -> events with the 'topple' ones grouped: one { kind: "clicks", n, t } per bin
 * (the bin opens at its first topple), so hundreds of tiles per second become a dense but bounded rattle. Others pass.
 */
export function toppleEvents(events, { bin = 0.035 } = {}) {
  const out = [];
  let cur = null;
  for (const e of events) {
    if (e.kind !== "topple") { out.push(e); continue; }
    if (cur && e.t - cur.t < bin) { cur.n++; if (e.field) cur.field = true; continue; }
    cur = { t: e.t, kind: "clicks", n: 1, field: !!e.field };
    out.push(cur);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** rallyVoices(S.sound) -> voices for kit/schedule.scoreFromEvents (seeded per event there). */
export function rallyVoices(snd) {
  return {
    clicks: (e, { index }) => {
      const k = Math.min(2.4, Math.sqrt(e.n));
      const wob = ((index * 7919) % 13) / 13 - 0.5;           // deterministic pitch wobble per event
      const v = [{ type: "click", gain: snd.click.gain * k, pitch: snd.click.pitch * (1 + 0.12 * wob), dur: 0.025 }];
      if (e.n >= 3 || e.field) v.push({ type: "clack", gain: snd.clack.gain * Math.min(1.8, k * 0.8), pitch: snd.clack.pitch * (1 + 0.08 * wob), dur: 0.09 });
      return v;
    },
    land: (e) => [{ type: "clack", gain: snd.land.gain * (e.field ? 0.35 : 1), pitch: 0.9, dur: 0.1 }],
    roll: (e) => [{ type: "rumble", gain: snd.roll.gain, dur: e.dur + 0.15, pitch: 1.8 }],
    ballHit: () => [{ type: "clack", gain: 0.38, pitch: 1.1, dur: 0.1 }, { type: "thud", gain: 0.2, pitch: 1.6, dur: 0.2 }],
    flag: () => [{ type: "pop", gain: snd.flag.gain, pitch: 1.0 }, { type: "whoosh", dir: "out", dur: 0.35, gain: 0.18, offset: -0.02 }],
    banner: () => [{ type: "whoosh", dir: "in", dur: 0.5, gain: snd.banner.gain * 0.6, offset: -0.05 }, { type: "paper", dur: 0.45, gain: snd.banner.gain, offset: 0.25 }, { type: "thud", gain: 0.25, pitch: 1.3, offset: 0.42 }],
  };
}

// ---------------------------------------------------------------- camera: chase the wave front
/**
 * chaseKeys(plan, { route, shots: [{ t, offset [dx,dy,dz], look [dx,dy,dz], fov, target? [x,y,z] (fixed) , mix? }],
 *            smooth = .35, dt = .1, t0, t1, ease }) -> CAMERA keys for kit createCameraRig (linear between dense samples)
 *   target = window-averaged wave front (closed form: the mean of front(t + k h)) + look; position = target + offset.
 *   Shot parameters blend smoothly (inOutSine) between consecutive shots; a shot with `target` pins the target there.
 */
export function chaseKeys(plan, o) {
  const { route, shots, smooth = 0.35, dt = 0.1, t0 = 0, t1 } = o;  // shots: parameters reached AT shot.t, eased between
  const avg = (t) => {
    const N = 6, acc = [0, 0, 0];
    for (let k = -N; k <= N; k++) { const p = plan.chase(route, t + (k / N) * smooth); acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; }
    return acc.map((v) => v / (2 * N + 1));
  };
  const sh = shots.slice().sort((a, b) => a.t - b.t);
  const param = (t) => {
    let a = sh[0], b = sh[0], u = 0;
    for (let i = 0; i < sh.length - 1; i++) if (t >= sh[i].t) { a = sh[i]; b = sh[i + 1]; u = clamp((t - a.t) / (b.t - a.t || 1)); }
    if (t >= sh[sh.length - 1].t) { a = b = sh[sh.length - 1]; u = 0; }
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const L3 = (p, q) => [lerp(p[0], q[0], e), lerp(p[1], q[1], e), lerp(p[2], q[2], e)];
    const fr = avg(t);
    const ta = a.target ?? [fr[0] + a.look[0], fr[1] + a.look[1], fr[2] + a.look[2]];
    const tb = b.target ?? [fr[0] + b.look[0], fr[1] + b.look[1], fr[2] + b.look[2]];
    const target = L3(ta, tb);
    const off = L3(a.offset, b.offset);
    return { target, pos: [target[0] + off[0], target[1] + off[1], target[2] + off[2]], fov: lerp(a.fov, b.fov, e) };
  };
  const end = t1 ?? sh[sh.length - 1].t;
  const keys = [];
  for (let t = t0; t <= end + 1e-9; t = +(t + dt).toFixed(6)) {
    const c = param(t);
    keys.push({ t, pos: c.pos.map((v) => +v.toFixed(4)), target: c.target.map((v) => +v.toFixed(4)), fov: +c.fov.toFixed(3), ease: "linear" });
  }
  return keys;
}
