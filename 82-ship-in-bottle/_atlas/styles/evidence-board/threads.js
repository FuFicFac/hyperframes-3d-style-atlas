// styles/evidence-board/threads.js — the evidence-board planner. PURE: no THREE, no window, no DOM (Node-safe).
// Imported by style.js (picture) AND by a scene's scene.config.js (SCORE), so every pin thunk, paper flutter, string
// draw, wrap, twang, flag pop and marker stroke in the sound comes from exactly the plan the picture reads.
//
//   const plan = planBoard(STYLE_SPEC, { items, links, flags, marker });
//   itemPose(plan, id, t)   -> pose of an item (origin = its pin) at time t
//   stringPoints(plan, i, t)-> the i-th string's centreline (fixed point count) at time t
//   markerProgress(plan, t) -> 0..1 of the marker stroke
//   plan.events             -> [{ t, kind, ... }] for kit/schedule.scoreFromEvents(plan.events, threadVoices(S.sound))
//
// Board frame: cork surface = z = 0 plane, x right, y up (gravity -y), viewer at +z.
import { clamp, lerp, ease, smoothstep } from "../../kit/time.js";
import { sampleCameraKeys, screenExtent, cameraBasis, projectPoint } from "../../kit/framing.js";

const TAU = Math.PI * 2;
const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

// ------------------------------------------------------------------------------------------------ catenary
/**
 * catenary(P0, P1, L, m) -> m points [x,y,z] of a uniform cable of length L hanging between P0 and P1 under gravity -y.
 * Solved exactly in the vertical plane through both ends (a by bisection on 2a·sinh(h/2a) = sqrt(L² - v²)); falls back
 * to a straight line when L <= chord or the ends are vertically aligned. Pure.
 */
export function catenary(P0, P1, L, m) {
  const dx = P1[0] - P0[0], dy = P1[1] - P0[1], dz = P1[2] - P0[2];
  const h = Math.hypot(dx, dz), v = dy, chord = Math.hypot(h, v);
  const out = [];
  if (h < 1e-5 || !(L > chord * 1.000001)) {
    for (let k = 0; k < m; k++) { const u = k / (m - 1); out.push([P0[0] + dx * u, P0[1] + dy * u, P0[2] + dz * u]); }
    return out;
  }
  const target = Math.sqrt(L * L - v * v);
  let lo = Math.log(1e-5), hi = Math.log(1e4);
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2, a = Math.exp(mid);
    const f = 2 * a * Math.sinh(h / (2 * a)) - target;   // decreasing in a (Infinity for tiny a is fine)
    if (f > 0) lo = mid; else hi = mid;
  }
  const a = Math.exp((lo + hi) / 2);
  const x1 = h / 2 - a * Math.atanh(clamp(v / L, -0.999999, 0.999999));
  const c0 = a * Math.cosh(x1 / a);
  const hx = dx / h, hz = dz / h;
  for (let k = 0; k < m; k++) {
    const x = (h * k) / (m - 1);
    let y = a * Math.cosh((x - x1) / a) - c0;
    if (k === m - 1) y = v;                                    // exact end (no drift from the solve)
    out.push([P0[0] + hx * x, P0[1] + y, P0[2] + hz * x]);
  }
  return out;
}
/** catenarySag(chord, L) -> approximate mid-span sag (m) of a level cable: sqrt(3/8 · chord · (L - chord)). */
export const catenarySag = (chord, L) => Math.sqrt(Math.max(0, (3 / 8) * chord * (L - chord)));

// ------------------------------------------------------------------------------------------------ plan
/**
 * planBoard(S, { items, links, flags, marker }) -> plan
 *   items: [{ id, kind: "card"|"photo"|"scrap"|"map"|"link"|"pin", at, pos: [x,y] (item centre), rot (rad),
 *             size: [w,h] (defaults from S per kind), pin: [lx,ly] (pin point in item coords, default near the top),
 *             from: [dx,dy] (flight start offset, default S.fly.from), layer (int, default order), hover (m), pinColor }]
 *   links: [{ a, b, at }]   string from item a's pin to item b's pin, starting at `at` (both must be pinned by then)
 *   flags: [{ item, at, local: [x,y], rot, color }]  sticky flags popping onto an item
 *   marker: { item, center: [x,y] (item coords), at, rx, ry, rot, turns, dur }  red marker loop drawn on the key item
 * Throws if a string starts before both of its pins are home (the plan is the contract).
 */
export function planBoard(S, { items = [], links = [], flags = [], marker = null } = {}) {
  const F = S.fly, PN = S.pin, ST = S.string;
  const sizeOf = (k) => (k === "photo" ? [S.photo.W, S.photo.H] : k === "scrap" ? [S.scrap.W, S.scrap.H] : k === "map" ? [S.map.W, S.map.H] : k === "pin" ? [0, 0] : [S.card.W, S.card.H]);
  const byId = {};
  const list = items.map((it, i) => {
    const size = it.size ?? sizeOf(it.kind);
    const pin = it.pin ?? [0, size[1] / 2 - 0.012];               // in the top margin, clear of the text
    const rot = it.rot ?? 0;
    const anchor = [it.pos[0] + rot2(pin, rot)[0], it.pos[1] + rot2(pin, rot)[1]];
    const layer = it.layer ?? i;
    const bare = it.kind === "pin";
    const fly = bare ? 0.22 : it.flyDur ?? F.dur;
    const land = it.at + fly, pinT = land + (bare ? 0 : F.pinDelay), home = pinT + PN.drive;
    const rec = { ...it, size, pin, rot, anchor, layer, z: bare ? 0 : 0.0006 + layer * S.paper.layer, bare, fly, land, pinT, home, from: it.from ?? F.from, hover: it.hover ?? F.hover };
    byId[it.id] = rec;
    return rec;
  });
  const events = [];
  for (const it of list) {
    if (!it.bare) events.push({ t: it.at, kind: "flutter", id: it.id, dur: it.fly });
    events.push({ t: it.home, kind: "thunk", id: it.id, bare: it.bare });
  }
  const L = links.map((lk, i) => {
    const a = byId[lk.a], b = byId[lk.b];
    if (!a || !b) throw new Error(`planBoard: link ${i} names unknown items ${lk.a} / ${lk.b}`);
    if (lk.at < Math.max(a.home, b.home)) throw new Error(`planBoard: link ${lk.a}->${lk.b} starts at ${lk.at} before both pins are home (${Math.max(a.home, b.home).toFixed(2)})`);
    const A = [a.anchor[0], a.anchor[1], ST.z], B = [b.anchor[0], b.anchor[1], ST.z];
    const chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const dur = clamp(chord / ST.speed, ST.minDraw, ST.maxDraw);
    const arrive = lk.at + dur, wrapEnd = arrive + ST.wrapDur, tautEnd = wrapEnd + ST.tighten;
    const phi = Math.atan2(B[1] - A[1], B[0] - A[0]);
    // steep strings sag less (a slack string between vertically aligned pins would fold into a U)
    const horiz = Math.abs(B[0] - A[0]) / Math.max(1e-6, chord);
    const slack = ST.slack * (0.25 + 0.75 * horiz * horiz);
    const rec = { ...lk, i, A, B, chord, dur, arrive, wrapEnd, tautEnd, phi, slack };
    events.push({ t: lk.at, kind: "draw", i, dur, chord });
    events.push({ t: lk.at + 0.02, kind: "wrap", i, end: "a" });
    events.push({ t: arrive, kind: "wrap", i, end: "b" });
    events.push({ t: tautEnd, kind: "twang", i, chord });
    return rec;
  });
  const FL = flags.map((f, i) => {
    const it = byId[f.item];
    if (!it) throw new Error(`planBoard: flag ${i} names unknown item ${f.item}`);
    events.push({ t: f.at + S.flagPop.dur * 0.6, kind: "flag", i });
    return { ...f, i, layerZ: it.z + S.paper.layer * 0.6 };
  });
  let M = null;
  if (marker) {
    // the marker is drawn ON an item (circling a detail in its picture): centre/radii in item coordinates (metres from
    // the item centre). Without `item`, centre is in board coordinates.
    const it = marker.item ? byId[marker.item] : null;
    if (marker.item && !it) throw new Error(`planBoard: marker names unknown item ${marker.item}`);
    const center = marker.center ?? [0, 0];
    const rx = marker.rx ?? (it ? it.size[0] * 0.3 : 0.15), ry = marker.ry ?? (it ? it.size[1] * 0.22 : 0.12);
    const dur = marker.dur ?? S.marker.dur;
    M = { ...marker, center, rx, ry, dur, turns: marker.turns ?? S.marker.turns, rot: marker.rot ?? 0, local: !!it };
    M.path = markerPath(M, S);
    events.push({ t: marker.at, kind: "marker", dur });
  }
  events.sort((x, y) => x.t - y.t);
  const end = Math.max(0, ...events.map((e) => e.t + (e.dur ?? 0)));
  return { S, items: byId, list, links: L, flags: FL, marker: M, events, end };
}

// ------------------------------------------------------------------------------------------------ item poses
/**
 * itemPose(plan, id, t) -> { vis, p: [x,y,z] (pin anchor = item origin), r: [rx,ry,rz], pinLift (m above home), press }
 *   fly-in (tumble + flutter) -> hover with a landing tilt -> pin drive (accelerating) -> pin bounce + swing about the pin.
 */
export function itemPose(plan, id, t) {
  const it = plan.items[id], S = plan.S, F = S.fly, PN = S.pin;
  if (!it || t < it.at) return { vis: 0, p: [0, 0, 0], r: [0, 0, 0], pinLift: PN.raise, press: 0 };
  const base = [it.anchor[0], it.anchor[1], it.z];
  if (it.bare) {
    // a bare pin: drops in from just in front of the board and drives home
    const u = clamp((t - it.at) / it.fly), d = clamp((t - it.pinT) / PN.drive);
    const lift = t < it.pinT ? lerp(0.09, PN.raise, ease.outCubic(u)) : PN.raise * (1 - ease.inQuad(d));
    const tau = t - it.home;
    const bounce = tau > 0 ? PN.bounce * Math.exp(-tau / PN.bounceDecay) * Math.abs(Math.sin(TAU * PN.bounceHz * tau)) : 0;
    return { vis: 1, p: base, r: [0, 0, 0], pinLift: lift + bounce, press: 0 };
  }
  const side = it.anchor[0] >= 0 ? 1 : -1;
  if (t < it.land) {
    const u = (t - it.at) / it.fly, e = ease.outCubic(u), w = 1 - e;
    const fl = Math.sin(u * Math.PI * 3.2) * (1 - u);                       // paper flutter, dies on landing
    const p = [
      base[0] + it.from[0] * side * w,
      base[1] + it.from[1] * w + Math.sin(u * Math.PI) * 0.03,
      base[2] + it.hover + (F.z - it.hover) * w,
    ];
    const r = [F.tilt[0] * w + 0.16 * fl, F.tilt[1] * side * w + 0.12 * fl, it.rot + F.landTilt * side + F.tilt[2] * side * w];
    return { vis: 1, p, r, pinLift: PN.raise, press: 0 };
  }
  if (t < it.pinT) return { vis: 1, p: [base[0], base[1], base[2] + it.hover], r: [0, 0, it.rot + F.landTilt * side], pinLift: PN.raise, press: 0 };
  if (t < it.home) {
    const d = ease.inQuad((t - it.pinT) / PN.drive);
    return { vis: 1, p: [base[0], base[1], base[2] + it.hover * (1 - d)], r: [0, 0, it.rot + F.landTilt * side], pinLift: PN.raise * (1 - d), press: d };
  }
  const tau = t - it.home;
  const bounce = PN.bounce * Math.exp(-tau / PN.bounceDecay) * Math.abs(Math.sin(TAU * PN.bounceHz * tau));
  const swing = F.landTilt * side * Math.exp(-tau / F.swingDecay) * Math.cos(TAU * F.swingHz * tau);
  return { vis: 1, p: [base[0], base[1], base[2] + bounce * 0.35], r: [0, 0, it.rot + swing], pinLift: bounce, press: 1 - smoothstep(0, 0.25, tau) };
}

// ------------------------------------------------------------------------------------------------ strings
function wrapArc(c, startAng, sweep, r, z0, z1, m) {
  const out = [];
  for (let k = 0; k < m; k++) {
    const u = k / (m - 1), a = startAng + sweep * u;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), lerp(z0, z1, u)]);
  }
  return out;
}
/** stringState(plan, i, t) -> { vis, phase: "draw"|"wrap"|"tight"|"taut", head: [x,y,z], length, wrapA, wrapB, twang } */
export function stringState(plan, i, t) {
  const lk = plan.links[i], ST = plan.S.string;
  if (!lk || t < lk.at) return { vis: false };
  const off = [ST.wrapR * Math.cos(lk.phi - Math.PI / 2), ST.wrapR * Math.sin(lk.phi - Math.PI / 2)];
  const P0 = [lk.A[0] + off[0], lk.A[1] + off[1], lk.A[2]];
  const P1 = [lk.B[0] + off[0], lk.B[1] + off[1], lk.B[2]];
  const chord = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
  let head, length, phase, twang = 0;
  if (t < lk.arrive) {
    const e = ease.inOutSine((t - lk.at) / lk.dur), s = Math.sin(Math.PI * e);
    head = [lerp(P0[0], P1[0], e), lerp(P0[1], P1[1], e) + s * ST.lift * 0.35, P0[2] + s * ST.lift];
    length = Math.hypot(head[0] - P0[0], head[1] - P0[1], head[2] - P0[2]) * (1 + lk.slack) + 1e-4;
    phase = "draw";
  } else {
    head = P1;
    if (t < lk.wrapEnd) { length = chord * (1 + lk.slack); phase = "wrap"; }
    else if (t < lk.tautEnd) { length = chord * (1 + lerp(lk.slack, ST.taut, ease.outCubic((t - lk.wrapEnd) / ST.tighten))); phase = "tight"; }
    else {
      length = chord * (1 + ST.taut); phase = "taut";
      const tau = t - lk.tautEnd;
      twang = ST.twang.amp * Math.exp(-tau / ST.twang.decay) * Math.sin(TAU * ST.twang.hz * tau);
    }
  }
  return {
    vis: true, phase, head, length, P0, P1, twang,
    wrapA: clamp((t - lk.at) / ST.wrapDur), wrapB: clamp((t - lk.arrive) / ST.wrapDur),
  };
}
/**
 * stringPoints(plan, i, t, n = S.string.n) -> { vis, pts: n × [x,y,z], phase }
 *   wrap round pin A (spiral under the head) + catenary span (A to the carried free end, or A to B) + wrap round pin B.
 *   Fixed point count (for kit paths.liveTube); partial wraps are compressed, never collapsed to one point.
 */
export function stringPoints(plan, i, t, n) {
  const ST = plan.S.string, N = n ?? ST.n, W = ST.wrapPts;
  const s = stringState(plan, i, t);
  if (!s.vis) return { vis: false, pts: null };
  const lk = plan.links[i];
  const startA = lk.phi - Math.PI / 2;            // angle of the leaving point on pin A (CCW wrap, tangent = phi)
  const sweep = ST.wrapTurns * TAU;
  const pa = Math.max(0.02, s.wrapA), pb = Math.max(0.02, s.wrapB);
  const wa = wrapArc(lk.A, startA - sweep * pa, sweep * pa, ST.wrapR, ST.z - 0.004, ST.z, W);   // ends at P0
  const span = catenary(s.P0, s.head, s.length, N - 2 * W + 2);
  let wb;
  if (s.phase === "draw") {
    // free end: a short loose tail beyond the head (the hand still holds it), points spread along the chord direction
    const dir = [Math.cos(lk.phi), Math.sin(lk.phi)];
    wb = Array.from({ length: W }, (_, k) => [s.head[0] + dir[0] * 0.0015 * (k + 1), s.head[1] + dir[1] * 0.0015 * (k + 1) - 0.0005 * k, s.head[2]]);
  } else {
    wb = wrapArc(lk.B, startA, sweep * pb, ST.wrapR, ST.z, ST.z - 0.004, W);                    // starts at P1
  }
  const pts = wa.concat(span.slice(1, -1), wb);
  if (s.twang) {
    const m = span.length - 1;
    for (let k = 0; k < span.length - 2; k++) {
      const u = (k + 1) / m, d = Math.sin(Math.PI * u) * s.twang;
      const q = pts[W + k];
      q[2] += d; q[1] += d * 0.35;
    }
  }
  return { vis: true, pts, phase: s.phase };
}

// ------------------------------------------------------------------------------------------------ marker + flags
/** markerPath(M, S) -> [[x,y], ...] a hand-drawn loop (slightly more than one turn, wobbling radius) around M.center. */
export function markerPath(M, S) {
  const n = 120, out = [], wob = S.marker.wobble, a0 = 2.3;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), a = a0 + u * M.turns * TAU;
    const rr = 1 + wob * (Math.sin(a * 2.0 + 0.7) * 0.6 + Math.sin(a * 3.3 + 2.1) * 0.4) * (0.4 + u * 0.6) + u * 0.04;
    const p = rot2([Math.cos(a) * M.rx * rr, Math.sin(a) * M.ry * rr], M.rot ?? 0);
    out.push([M.center[0] + p[0], M.center[1] + p[1]]);
  }
  return out;
}
/** markerProgress(plan, t) -> 0..1 of the marker stroke (fast start, slows into the overlap like a real hand). */
export function markerProgress(plan, t) {
  const M = plan.marker;
  if (!M) return 0;
  return ease.inOutSine(clamp((t - M.at) / M.dur));
}
/** flagPose(plan, i, t) -> { vis, s (scale 0..1 with overshoot), press } */
export function flagPose(plan, i, t) {
  const f = plan.flags[i], d = plan.S.flagPop.dur;
  if (!f || t < f.at) return { vis: 0, s: 0 };
  return { vis: 1, s: ease.outBack(clamp((t - f.at) / d)) };
}

// ------------------------------------------------------------------------------------------------ regions + camera
/** itemBox(plan, id, pad = 0) -> [x0,y0,x1,y1] board-metre bounds of the item at rest (rotation included). */
export function itemBox(plan, id, pad = 0) {
  const it = plan.items[id];
  const [w, h] = it.size, pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map((q) => rot2(q, it.rot));
  const xs = pts.map((q) => q[0] + it.pos[0]).concat([it.anchor[0]]), ys = pts.map((q) => q[1] + it.pos[1]).concat([it.anchor[1]]);
  const hr = plan.S.pin.head;
  return [Math.min(...xs) - pad - hr, Math.min(...ys) - pad - hr, Math.max(...xs) + pad + hr, Math.max(...ys) + pad + hr];
}
export const unionBox = (boxes) => boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
/** linkBox(plan, i, pad) -> bounds of a string at rest (both pins + the sag while drawing). */
export function linkBox(plan, i, pad = 0.03) {
  const lk = plan.links[i];
  const sag = catenarySag(lk.chord, lk.chord * (1 + lk.slack));
  return [Math.min(lk.A[0], lk.B[0]) - pad, Math.min(lk.A[1], lk.B[1]) - pad - sag, Math.max(lk.A[0], lk.B[0]) + pad, Math.max(lk.A[1], lk.B[1]) + pad];
}

/**
 * boardShot(box, { fov, aspect, x: [lo, hi], y: [lo, hi], side, up, minDist, maxDist }) -> { pos, target, fov }
 *   A near square-on camera (offset `side` m right and `up` m above its target for a little parallax) pulled back just far
 *   enough that the board box [x0,y0,x1,y1] (z = 0) fits the NDC window x × y, then re-centred inside that window. The
 *   window is asymmetric on purpose: the top band is the caption's (overlay label), so y defaults to [-0.88, 0.66].
 */
export function boardShot(box, o = {}) {
  const fov = o.fov ?? 30, aspect = o.aspect ?? 16 / 9, X = o.x ?? [-0.88, 0.88], Y = o.y ?? [-0.88, 0.66];
  const side = o.side ?? 0.1, up = o.up ?? 0.05;
  const corners = [[box[0], box[1], 0], [box[2], box[1], 0], [box[0], box[3], 0], [box[2], box[3], 0]];
  let cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, d = 1.5;
  const cam = (dd) => { const c = { pos: [cx + side * dd / 1.5, cy + up * dd / 1.5, dd], target: [cx, cy, 0], fov }; c._basis = cameraBasis(c); return c; };
  const fits = (dd) => {
    const e = screenExtent(cam(dd), corners, { aspect });
    return e.x[1] - e.x[0] <= X[1] - X[0] && e.y[1] - e.y[0] <= Y[1] - Y[0];
  };
  for (let pass = 0; pass < 6; pass++) {
    let lo = o.minDist ?? 0.3, hi = o.maxDist ?? 20;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    d = hi;
    const c = cam(d), e = screenExtent(c, corners, { aspect });
    // shift the target so the projected box centre lands on the window centre (small-angle: ndc offset -> metres)
    const th = Math.tan((fov * Math.PI) / 360);
    const ox = ((e.x[0] + e.x[1]) / 2 - (X[0] + X[1]) / 2) * th * aspect * d;
    const oy = ((e.y[0] + e.y[1]) / 2 - (Y[0] + Y[1]) / 2) * th * d;
    if (Math.abs(ox) < 1e-5 && Math.abs(oy) < 1e-5) break;
    cx += ox; cy += oy;
  }
  const c = cam(d);
  return { pos: c.pos.map((x) => +x.toFixed(4)), target: c.target.map((x) => +x.toFixed(4)), fov };
}

/**
 * framingGate(keys, regions(t) -> [{ id, box }], opts) -> { ok, worst, fails, spans }
 *   Replays the camera exactly as kit/camera.js plays it (kit/framing.sampleCameraKeys: eases + drift) and checks every
 *   required board box against an ASYMMETRIC window (x: [lo,hi], y: [lo,hi]) — the caption band at the top is kept clear.
 */
export function framingGate(keys, regions, o = {}) {
  const { duration, dt = 1 / 30, drift = null, fov = 30, aspect = 16 / 9 } = o;
  const X = o.x ?? [-0.9, 0.9], Y = o.y ?? [-0.9, 0.7];
  const fails = [];
  let worst = { t: 0, id: null, over: -Infinity };
  for (let k = 0; k <= Math.round(duration / dt); k++) {
    const t = +Math.min(duration, k * dt).toFixed(6);
    const cam = sampleCameraKeys(keys, t, { drift, fov });
    cam._basis = cameraBasis(cam);
    for (const r of regions(t)) {
      const b = r.box, pts = [[b[0], b[1], 0], [b[2], b[1], 0], [b[0], b[3], 0], [b[2], b[3], 0]];
      const e = screenExtent(cam, pts, { aspect });
      const over = Math.max(X[0] - e.x[0], e.x[1] - X[1], Y[0] - e.y[0], e.y[1] - Y[1]);
      if (over > worst.over) worst = { t, id: r.id, over: +over.toFixed(4) };
      if (over > 0 || e.behind) fails.push({ t, id: r.id, over: +over.toFixed(4) });
    }
  }
  const spans = [];
  for (const f of fails) {
    const s = spans.find((q) => q.id === f.id && f.t - q.to <= dt * 1.5 + 1e-9);
    if (s) { s.to = f.t; s.worst = Math.max(s.worst, f.over); } else spans.push({ id: f.id, from: f.t, to: f.t, worst: f.over });
  }
  return { ok: fails.length === 0, worst, fails, spans };
}
/** boxFill(cam, box, aspect) -> fraction of the frame AREA the box covers (keep the subject large: report it). */
export function boxFill(cam, box, aspect = 16 / 9) {
  const c = { ...cam, _basis: cameraBasis(cam) };
  const pts = [[box[0], box[1], 0], [box[2], box[1], 0], [box[0], box[3], 0], [box[2], box[3], 0]].map((p) => projectPoint(c, p, { aspect }));
  const xs = pts.map((p) => clamp(p[0], -1, 1)), ys = pts.map((p) => clamp(p[1], -1, 1));
  return ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 4;
}

// ------------------------------------------------------------------------------------------------ sound
/**
 * threadVoices(sound = S.sound) -> voices for kit/schedule.scoreFromEvents(plan.events, voices):
 *   flutter = short paper rustle + soft whoosh; thunk = pin prick click + small high thud; draw = quiet rustle for the
 *   whole draw (string sliding through fingers); wrap = tiny tick; twang = short gliding tone + pluck click (pitch
 *   rises for shorter strings); flag = tick + paper; marker = pen scratch for the stroke.
 */
export function threadVoices(snd = {}) {
  const g = (k, d) => ({ ...d, ...(snd[k] ?? {}) });
  const fl = g("flutter", { gain: 0.22, pitch: 1.5 }), th = g("thunk", { gain: 0.5, pitch: 1.7 }), pr = g("prick", { gain: 0.16, pitch: 0.7 });
  const dr = g("draw", { gain: 0.12, pitch: 2.2 }), wr = g("wrap", { gain: 0.12, pitch: 1.3 }), tw = g("twang", { gain: 0.3, hz: 196, hz2: 182 });
  const fg = g("flag", { gain: 0.2, pitch: 1.9 }), mk = g("marker", { gain: 0.28, pitch: 1.15 });
  return {
    flutter: (e) => [
      { type: "paper", dur: Math.max(0.25, e.dur * 0.8), pitch: fl.pitch, density: 0.55, gain: fl.gain },
      { type: "whoosh", dir: "in", dur: e.dur * 0.9, pitch: 1.6, gain: fl.gain * 0.55 },
    ],
    thunk: (e) => [
      { type: "click", dur: 0.03, pitch: pr.pitch, gain: pr.gain, offset: -0.012 },
      { type: "thud", dur: 0.22, pitch: e.bare ? th.pitch * 1.25 : th.pitch, gain: e.bare ? th.gain * 0.75 : th.gain },
    ],
    draw: (e) => [{ type: "rustle", dur: e.dur, pitch: dr.pitch, density: 0.2, gain: dr.gain }],
    wrap: () => [{ type: "tick", dur: 0.025, pitch: wr.pitch, gain: wr.gain }],
    twang: (e) => {
      const k = clamp(0.45 / Math.max(0.15, e.chord), 0.7, 1.6);
      return [
        { type: "click", dur: 0.03, pitch: 1.6, gain: tw.gain * 0.5 },
        { type: "servo", dur: 0.26, hz: tw.hz * k, hz2: tw.hz2 * k, grit: 0.04, gain: tw.gain },
      ];
    },
    flag: () => [{ type: "tick", dur: 0.03, pitch: fg.pitch, gain: fg.gain }, { type: "paper", dur: 0.12, pitch: 2.4, density: 0.3, gain: fg.gain * 0.6 }],
    marker: (e) => [{ type: "penScratch", dur: e.dur, pitch: mk.pitch, speed: 1.4, gain: mk.gain }],
  };
}
