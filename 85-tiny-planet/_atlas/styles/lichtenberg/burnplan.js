// styles/lichtenberg/burnplan.js — the burn plan for "Lichtenberg" (fractal wood burning). Pure, Node-safe: no THREE, no
// window, no DOM. Imports only kit/time.js. style.js reads it for the picture, scene.config.js for SCORE and framing.
//
// What it plans, once, seeded:
//   1. a branching tree on the board (space colonisation from the question electrode: seeded attractor points pull the
//      nearest branch tip one step at a time, with a seeded wiggle, so the tree fills the board and leaves dead ends
//      wherever the attractors ran out), plus short side spurs; exactly one branch reaches the answer electrode;
//   2. a half-width for every node from its DOWNSTREAM length (river rule: trunks thick, twigs thin);
//   3. a burn time for every node: the winning path burns at a steady pace and leaps the last gap at `connect`;
//      every side branch starts when its fork burns and slows down until it dies (all dead before the connection);
//   4. events (crackles, fizzes, the strike, the connection) and smoke wisps, all read off the same node times.
// At time t a segment a -> b is burnt up to u = (t - ta) / (tb - ta): the picture needs nothing else.
//
// Board coordinates: metres, x right (0..w), y toward the viewer (0..h). World: X = x - w/2, Z = y - h/2.
import { rng, hash01, clamp, lerp } from "../../kit/time.js";

const hyp = Math.hypot;

/**
 * growTree({ board: { w, h }, q: [x, y], a: [x, y], keepOut: [{ x0, y0, x1, y1 }], seed, grow }) -> { nodes, winner }
 *   nodes: [{ p: [x, y], parent, spur }] (parent index < own index; node 0 = the question electrode).
 *   winner: index of the node that sits on the answer electrode.
 */
export function growTree(o) {
  const { w: W, h: H } = o.board, Q = o.q, A = o.a, G = o.grow, keep = o.keepOut ?? [];
  const r = rng(o.seed ?? 88);
  const inKeep = (x, y) => keep.some((k) => x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1);
  const inside = (x, y, m = G.margin) => x >= m && x <= W - m && y >= m && y <= H - m && !inKeep(x, y);

  // ---- attractors: a jittered grid over the free board, plus the answer electrode itself (last)
  const att = [];
  const sp = G.spacing, nx = Math.ceil(W / sp), ny = Math.ceil(H / sp);
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) {
    const x = (gx + r.range(0.12, 0.88)) * sp, y = (gy + r.range(0.12, 0.88)) * sp;
    if (!inside(x, y, G.margin + 0.004)) continue;
    if (hyp(x - Q[0], y - Q[1]) < G.rootClear || hyp(x - A[0], y - A[1]) < G.answerClear) continue;
    att.push([x, y]);
  }
  const AI = att.length;
  att.push([A[0], A[1]]);
  const n = att.length;
  const nn = new Int32Array(n).fill(-1), nd = new Float64Array(n).fill(Infinity), alive = new Uint8Array(n).fill(1);

  const nodes = [{ p: [Q[0], Q[1]], parent: -1, spur: false }];
  let winner = -1;
  const see = (k) => { // a new node: update every live attractor's nearest node, kill the ones it reaches
    const p = nodes[k].p;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const d = hyp(att[i][0] - p[0], att[i][1] - p[1]);
      if (d < nd[i]) { nd[i] = d; nn[i] = k; }
      if (d < (i === AI ? G.killAnswer : G.kill)) { alive[i] = 0; if (i === AI) winner = k; }
    }
  };
  const tooClose = (x, y, gap, skip = -1) => {
    for (let k = 0; k < nodes.length; k++) {
      if (k === skip) continue;
      const p = nodes[k].p;
      if (Math.abs(p[0] - x) < gap && Math.abs(p[1] - y) < gap && hyp(p[0] - x, p[1] - y) < gap) return true;
    }
    return false;
  };
  see(0);

  let stalled = 0;
  for (let it = 0; it < G.maxIter && stalled < 4; it++) {
    const acc = new Map();
    for (let i = 0; i < n; i++) {
      if (!alive[i] || nd[i] > (i === AI ? G.influenceAnswer : G.influence)) continue;
      const p = nodes[nn[i]].p, dx = att[i][0] - p[0], dy = att[i][1] - p[1], d = hyp(dx, dy) || 1;
      const v = acc.get(nn[i]) ?? [0, 0];
      const pull = i === AI ? G.answerPull : 1;
      v[0] += (dx / d) * pull; v[1] += (dy / d) * pull;
      acc.set(nn[i], v);
    }
    if (!acc.size) break;
    const fresh = [];
    for (const [k, v] of acc) {
      const len = hyp(v[0], v[1]);
      if (len < 1e-6) continue;
      const base = Math.atan2(v[1], v[0]), p = nodes[k].p;
      let placed = null;
      for (const wig of [r.gaussian(0, G.wiggle), 0]) {
        const a = base + clamp(wig, -1.1, 1.1);
        const x = p[0] + Math.cos(a) * G.step, y = p[1] + Math.sin(a) * G.step;
        if (!inside(x, y)) continue;
        if (winner >= 0 && hyp(x - A[0], y - A[1]) < G.answerClear * 0.85) continue; // the answer has ONE visitor
        if (tooClose(x, y, G.step * G.minGap)) continue;
        placed = [x, y]; break;
      }
      if (placed) fresh.push({ p: placed, parent: k, spur: false });
    }
    if (!fresh.length) { stalled++; continue; }
    stalled = 0;
    for (const f of fresh) {
      if (winner >= 0 && hyp(f.p[0] - A[0], f.p[1] - A[1]) < G.answerClear * 0.85) continue;
      nodes.push(f); see(nodes.length - 1);
    }
  }
  if (winner < 0) { // never reached (bad seed): take the node nearest the answer
    let best = Infinity;
    nodes.forEach((nd2, k) => { const d = hyp(nd2.p[0] - A[0], nd2.p[1] - A[1]); if (d < best) { best = d; winner = k; } });
  }
  // the last leap: from the winning tip onto the electrode (a slightly bent two-step jump)
  {
    const p = nodes[winner].p, dx = A[0] - p[0], dy = A[1] - p[1], d = hyp(dx, dy) || 1;
    const stop = Math.max(0, d - G.answerStop);
    const k = Math.max(1, Math.round(stop / G.step));
    let par = winner;
    for (let i = 1; i <= k; i++) {
      const u = (i / k) * (stop / d), side = i < k ? r.gaussian(0, G.step * 0.25) : 0;
      nodes.push({ p: [p[0] + dx * u - (dy / d) * side, p[1] + dy * u + (dx / d) * side], parent: par, spur: false });
      par = nodes.length - 1;
    }
    winner = par;
  }

  // ---- spurs: short dead-end side twigs that give the feathery fractal edge
  const SPR = G.spur, mainCount = nodes.length;
  for (let k = 1; k < mainCount; k++) {
    if (!r.chance(SPR.p)) continue;
    const nd2 = nodes[k], pp = nodes[nd2.parent].p;
    if (hyp(nd2.p[0] - A[0], nd2.p[1] - A[1]) < G.answerClear || hyp(nd2.p[0] - Q[0], nd2.p[1] - Q[1]) < G.rootClear) continue;
    let a = Math.atan2(nd2.p[1] - pp[1], nd2.p[0] - pp[0]) + r.sign() * r.range(SPR.angle[0], SPR.angle[1]);
    let par = k, p = nd2.p;
    const steps = r.int(SPR.steps[0], SPR.steps[1]);
    for (let s = 0; s < steps; s++) {
      const L = G.step * r.range(SPR.len[0], SPR.len[1]);
      const x = p[0] + Math.cos(a) * L, y = p[1] + Math.sin(a) * L;
      if (!inside(x, y, G.margin * 0.7) || hyp(x - A[0], y - A[1]) < G.answerClear || tooClose(x, y, G.step * SPR.gap, par)) break;
      nodes.push({ p: [x, y], parent: par, spur: true });
      par = nodes.length - 1; p = [x, y];
      a += r.gaussian(0, G.wiggle * 1.2);
    }
  }
  return { nodes, winner, attractors: n };
}

/**
 * createPlan({ board, q, a, keepOut, seed, grow, width, times, smoke, crackle }) -> plan
 *   times: { start, connect, leap, die, dieSpread, sweep, speed: [lo, hi], delay: [lo, hi], slow }
 *   plan.nodes[k] = { p, parent, t, w (half-width, m), win, s (0..1 along the winning path, win nodes only), leaf, dist }
 *   plan.segs     = one per node with a parent: { a, b, ax, ay, bx, by, ta, tb, wa, wb, win, sa, sb }
 *   plan.tipsAt(t, out) -> count; out = Float32Array [x, y, halfWidth, heat] per burning front (heat 1 = winning tip)
 *   plan.burnt(t) -> 0..1 share of the tree length burnt; plan.alive(t) -> number of burning fronts
 *   plan.events() -> [{ kind: "strike" | "crackle" | "fizz" | "sizzle" | "connect" | "glow", t, ... }]
 *   plan.wisps -> [{ t, x, y, life, size, seed }] smoke puffs; plan.winPath -> node indices root .. answer
 */
export function createPlan(o) {
  const { nodes: raw, winner, attractors } = growTree(o);
  const T = o.times, Wd = o.width, r = rng((o.seed ?? 88) + 1009);
  const N = raw.length;
  const nodes = raw.map((n, k) => ({ id: k, p: n.p, parent: n.parent, spur: n.spur, t: 0, w: 0, win: false, s: -1, leaf: true, dist: 0, len: 0, weight: 0 }));
  const kids = nodes.map(() => []);
  for (let k = 1; k < N; k++) {
    const n = nodes[k], p = nodes[n.parent];
    n.len = hyp(n.p[0] - p.p[0], n.p[1] - p.p[1]);
    n.dist = p.dist + n.len;
    kids[n.parent].push(k); p.leaf = false;
  }
  for (let k = N - 1; k >= 1; k--) { nodes[k].weight += nodes[k].len; nodes[nodes[k].parent].weight += nodes[k].weight; }

  // ---- the winning path
  const winPath = [];
  for (let k = winner; k >= 0; k = nodes[k].parent) winPath.push(k);
  winPath.reverse();
  const Lwin = nodes[winner].dist;
  for (const k of winPath) { nodes[k].win = true; nodes[k].s = nodes[k].dist / Lwin; }

  // ---- widths (half-width, metres) from downstream length
  const total = nodes[0].weight || 1;
  for (const n of nodes) n.w = Wd.min + (Wd.max - Wd.min) * Math.pow(clamp(n.weight / total), Wd.power);
  nodes[0].w = Wd.max;

  // ---- burn times. Winning path: steady crawl to the gap, then the leap.
  const leapLen = Math.min(T.leapLen, Lwin * 0.2), crawl = Lwin - leapLen, tLeap = T.connect - T.leap;
  const vWin = crawl / (tLeap - T.start);
  for (const k of winPath) {
    const d = nodes[k].dist;
    nodes[k].t = d <= crawl ? T.start + (d / crawl) * (tLeap - T.start) : tLeap + ((d - crawl) / leapLen) * T.leap;
  }
  // side branches: each subtree hanging off the winning path burns from its fork and slows until it dies
  let lastDeath = 0;
  for (const f of winPath) {
    for (const c of kids[f]) {
      if (nodes[c].win) continue;
      const sub = [], stack = [c];
      let dmax = 0;
      while (stack.length) {
        const k = stack.pop(); sub.push(k);
        dmax = Math.max(dmax, nodes[k].dist - nodes[f].dist);
        for (const j of kids[k]) stack.push(j);
      }
      const tf = nodes[f].t, delay = r.range(T.delay[0], T.delay[1]);
      const v = vWin * r.range(T.speed[0], T.speed[1]);
      const die = Math.min(T.die - r.range(0, T.dieSpread) * clamp(dmax / T.bigArm), T.connect - 0.25);
      const dur = Math.max(T.minLife, Math.min(dmax / v, die - tf - delay));
      for (const k of sub) {
        const u = dmax > 0 ? (nodes[k].dist - nodes[f].dist) / dmax : 1;
        nodes[k].t = Math.min(tf + delay + dur * Math.pow(u, T.slow), T.connect - 0.12 + 0.1 * u);
      }
      lastDeath = Math.max(lastDeath, tf + delay + dur);
    }
  }

  // ---- segments (typed arrays for the bake and the per-frame tip scan)
  const segs = [];
  for (let k = 1; k < N; k++) {
    const b = nodes[k], a = nodes[b.parent];
    const wa = Math.min(a.w, b.w * 1.3);
    segs.push({ a: a.id, b: b.id, ax: a.p[0], ay: a.p[1], bx: b.p[0], by: b.p[1], ta: a.t, tb: Math.max(b.t, a.t + 1e-4), wa, wb: b.leaf ? b.w * 0.55 : b.w, win: a.win && b.win, sa: a.s, sb: b.s, leaf: b.leaf });
  }
  const M = segs.length;
  const TA = Float32Array.from(segs, (s) => s.ta), TB = Float32Array.from(segs, (s) => s.tb);

  function tipsAt(t, out, max = out.length / 4) {
    let c = 0;
    for (let i = 0; i < M && c < max; i++) {
      if (t < TA[i] || t >= TB[i]) continue;
      const s = segs[i], u = (t - s.ta) / (s.tb - s.ta);
      out[4 * c] = lerp(s.ax, s.bx, u); out[4 * c + 1] = lerp(s.ay, s.by, u);
      out[4 * c + 2] = lerp(s.wa, s.wb, u); out[4 * c + 3] = s.win ? 1 : 0.6;
      c++;
    }
    return c;
  }
  const alive = (t) => { let c = 0; for (let i = 0; i < M; i++) if (t >= TA[i] && t < TB[i]) c++; return c; };
  const totalLen = segs.reduce((q, s) => q + hyp(s.bx - s.ax, s.by - s.ay), 0);
  const burnt = (t) => {
    let q = 0;
    for (const s of segs) q += hyp(s.bx - s.ax, s.by - s.ay) * clamp((t - s.ta) / (s.tb - s.ta));
    return q / totalLen;
  };

  // ---- dead ends worth hearing / seeing: leaves whose own twig is long enough
  const deaths = nodes.filter((n) => n.leaf && !n.win && n.id > 0).map((n) => ({ t: n.t, x: n.p[0], y: n.p[1], w: n.w, spur: n.spur })).sort((a, b) => a.t - b.t);

  // ---- smoke wisps: from dying tips, from the burning front at a steady seeded rate, and off the winning path after the flash
  const SM = o.smoke ?? {}, wisps = [];
  {
    let next = -Infinity;
    for (const d of deaths) { // dying tips puff (rate limited)
      if (d.spur || d.t < next) continue;
      next = d.t + SM.dieGap;
      wisps.push({ t: d.t, x: d.x, y: d.y, life: r.range(SM.life[0], SM.life[1]), size: r.range(SM.size[0], SM.size[1]), seed: wisps.length });
    }
    const order = segs.map((s, i) => i).sort((i, j) => segs[i].tb - segs[j].tb);
    let last = -Infinity;
    for (const i of order) { // the front leaves a trail of puffs
      const s = segs[i];
      if (s.tb < last + SM.trailGap || s.wb < SM.minWidth) continue;
      last = s.tb;
      wisps.push({ t: s.tb + 0.1, x: s.bx, y: s.by, life: r.range(SM.life[0], SM.life[1]), size: r.range(SM.size[0], SM.size[1]) * 1.2, seed: wisps.length });
    }
    for (let i = 2; i < winPath.length; i += SM.winEvery) { // the whole winning path smokes after the flash
      const n = nodes[winPath[i]];
      const at = T.connect + (1 - n.s) * T.sweep + r.range(0.08, 0.9);
      wisps.push({ t: at, x: n.p[0], y: n.p[1], life: r.range(SM.life[0], SM.life[1]) * 1.3, size: r.range(SM.size[0], SM.size[1]) * 1.5, seed: wisps.length });
    }
    wisps.sort((a, b) => a.t - b.t);
  }

  // ---- events for SCORE
  function events() {
    const C = o.crackle ?? {}, ev = [];
    const W = o.board.w;
    ev.push({ kind: "strike", t: T.start, x: nodes[0].p[0] / W, dur: T.connect - T.start });
    // crackles: one per time bin at most, picked from the nodes that ignite in that bin (thickest wins)
    const bins = new Map();
    for (const n of nodes) {
      if (n.id === 0 || n.t >= T.connect - 0.02) continue;
      const b = Math.floor(n.t / C.bin);
      const cur = bins.get(b);
      if (!cur || n.w > cur.w) bins.set(b, n);
    }
    for (const [b, n] of [...bins].sort((p, q) => p[0] - q[0])) {
      ev.push({ kind: "crackle", t: n.t, x: n.p[0] / W, w: clamp((n.w - Wd.min) / (Wd.max - Wd.min)), h: hash01(b, 17), big: hash01(b, 5) < C.popShare });
    }
    let next = -Infinity;
    for (const d of deaths) {
      if (d.spur || d.t < next) continue;
      next = d.t + C.fizzGap;
      ev.push({ kind: "fizz", t: d.t, x: d.x / W, h: hash01(Math.round(d.t * 1000), 3) });
    }
    for (let t = T.start + 0.1; t < T.connect - 0.3; t += C.sizzleEvery) {
      ev.push({ kind: "sizzle", t, dur: C.sizzleEvery + 0.35, level: clamp(alive(t + C.sizzleEvery / 2) / C.sizzleFull, 0.15, 1), x: 0.5 });
    }
    ev.push({ kind: "connect", t: T.connect, x: nodes[winner].p[0] / W });
    ev.push({ kind: "glow", t: T.connect + T.sweep + 0.25, x: 0.5, dur: Math.max(1, (o.end ?? 15) - T.connect) });
    return ev.sort((a, b) => a.t - b.t);
  }

  return {
    board: o.board, q: o.q, a: o.a, times: T, nodes, segs, kids, winPath, winner, winLength: Lwin, totalLen, attractors,
    deaths, wisps, lastDeath, tipsAt, alive, burnt, events,
    stats: { nodes: N, segs: M, leaves: nodes.filter((n) => n.leaf).length, winNodes: winPath.length, winLength: +Lwin.toFixed(3), totalLen: +totalLen.toFixed(2), lastDeath: +lastDeath.toFixed(2) },
  };
}

/**
 * bakeField(plan, { pxPerMetre, halo: { base, k }, winHalf, winGlow }) -> { w, h, burn: Float32Array(w*h*4), win: Float32Array(w*h*4) }
 *   burn texel = [ signed distance to the nearest groove edge (mm, < 0 inside), burn time (s) at the nearest groove
 *                  point, halo radius (mm) of that groove, 0 ]
 *   win texel  = [ signed distance to the widened winning channel (mm), s along the winning path (0 question .. 1 answer), 0, 0 ]
 *   Row 0 = board y 0 (far edge). Pure arithmetic: the shader turns it into arc / ember / char / scorch from one time uniform.
 */
export function bakeField(plan, o = {}) {
  const ppm = o.pxPerMetre ?? 1000, mm = 1000 / ppm; // mm per texel
  const w = Math.round(plan.board.w * ppm), h = Math.round(plan.board.h * ppm);
  const burn = new Float32Array(w * h * 4), win = new Float32Array(w * h * 4);
  const FAR = 80;
  for (let i = 0; i < w * h; i++) { burn[4 * i] = FAR; burn[4 * i + 1] = 999; burn[4 * i + 2] = 4; win[4 * i] = FAR; }
  const HB = (o.halo?.base ?? 0.004) * 1000, HK = o.halo?.k ?? 1.8;
  const winHalf = (o.winHalf ?? 0.005) * 1000, winGlow = (o.winGlow ?? 0.03) * 1000;
  for (const s of plan.segs) {
    const ax = s.ax * 1000, ay = s.ay * 1000, bx = s.bx * 1000, by = s.by * 1000; // mm
    const wa = s.wa * 1000, wb = s.wb * 1000, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const scan = (R, put) => {
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / mm)), x1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + R) / mm));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R) / mm)), y1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + R) / mm));
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const X = (px + 0.5) * mm, Y = (py + 0.5) * mm;
        const u = clamp(((X - ax) * dx + (Y - ay) * dy) / L2);
        put((py * w + px) * 4, hyp(X - ax - dx * u, Y - ay - dy * u), u);
      }
    };
    const hkA = HB + HK * wa, hkB = HB + HK * wb;
    scan(Math.max(wa, wb) + 3 * Math.max(hkA, hkB), (i, dist, u) => {
      const d = dist - lerp(wa, wb, u);
      if (d < burn[i]) { burn[i] = d; burn[i + 1] = lerp(s.ta, s.tb, u); burn[i + 2] = lerp(hkA, hkB, u); }
    });
    if (s.win) {
      const WA = Math.max(wa, winHalf), WB = Math.max(wb, winHalf);
      scan(Math.max(WA, WB) + winGlow * 3, (i, dist, u) => {
        const d = dist - lerp(WA, WB, u);
        if (d < win[i]) { win[i] = d; win[i + 1] = lerp(s.sa, s.sb, u); }
      });
    }
  }
  return { w, h, burn, win, mmPerTexel: mm };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function burnVoices(SND) {
  return {
    strike: (e) => [
      { type: "clack", gain: SND.strike.clack, pitch: 1.5 },
      { type: "buzz", dur: e.dur + 0.1, hz: SND.hum.hz, flicker: SND.hum.flicker, gain: SND.hum.gain },
      { type: "hum", dur: e.dur + 0.1, hz: SND.hum.hz / 2, gain: SND.hum.low },
    ],
    crackle: (e) => [
      e.big
        ? { type: "pop", gain: SND.crackle.pop * (0.6 + 0.6 * e.w), pitch: 1.5 + e.h * 1.2, dur: 0.07 }
        : { type: e.h < 0.5 ? "tick" : "click", gain: SND.crackle.gain * (0.45 + 0.9 * e.w + 0.4 * e.h), pitch: 1.1 + e.h * 2.2 },
    ],
    fizz: (e) => [{ type: "rustle", dur: 0.16 + e.h * 0.12, density: 0.85, pitch: 2 + e.h, gain: SND.fizz.gain }],
    sizzle: (e) => [{ type: "rustle", dur: e.dur, density: 0.3 + 0.4 * e.level, pitch: 1.7, gain: SND.sizzle.gain * e.level }],
    connect: () => [
      { type: "riser", dur: SND.connect.riserDur, offset: -SND.connect.riserDur, gain: SND.connect.riser },
      { type: "thud", gain: SND.connect.thud, dur: 0.6 },
      { type: "clack", gain: SND.connect.clack, pitch: 0.7 },
      { type: "buzz", dur: 0.55, hz: 190, flicker: 0.9, gain: SND.connect.zap },
      { type: "whoosh", dir: "out", dur: 1.0, q: 1.1, pitch: 1.3, gain: SND.connect.whoosh },
    ],
    glow: (e) => [
      { type: "chime", sparkle: true, dur: 1.8, gain: SND.glow.chime },
      { type: "pad", bus: "sfx", dur: e.dur, root: SND.glow.root, chord: SND.glow.chord, attack: 0.5, release: 1.5, brightness: SND.glow.brightness, gain: SND.glow.gain },
    ],
  };
}
