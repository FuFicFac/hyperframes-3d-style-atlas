// styles/cross-section/slice.js — the planner for "Cross-Section" (pure: no THREE, no window, no DOM; Node-safe).
// It owns everything that decides WHAT is cut WHEN:
//   - the model: a flat list of analytic solids (boxes, capsules, one hollow shell) with colours and groups;
//   - the slicing plane as a pure function of t (planeAt(keys, t)): offset along its normal + yaw + pitch, eased keys;
//   - cutEvents(): the first moment the plane touches each solid (one sound tick per part, in SCORE);
//   - flowPlan(): the band of light that runs through the model (pulse positions for the picture, events for SCORE);
//   - blackBoxModel(): the reference model of the demo (tokens in -> stacked layers -> answer out, inside a shell).
// style.js draws the same list twice: as clipped meshes and as an SDF list on the cut plane (the solid cut faces).
import { clamp, lerp, toEase, rng, smoothstep } from "../../kit/time.js";

// ---------------------------------------------------------------- colour helpers (sRGB, 0..1)
export const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const rgbHex = (c) => "#" + c.map((x) => Math.round(clamp(x) * 255).toString(16).padStart(2, "0")).join("");
export const mixHex = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]); };

// ---------------------------------------------------------------- solids
// box:     { type: "box", c: [x,y,z] centre, h: [hx,hy,hz] half size, round }
// capsule: { type: "capsule", a, b, r }           (a === b is a sphere)
// shell:   { type: "shell", c, h, round, wall, innerRound }   (a box with a box cavity)
// common:  id, kind (what it is: used for sound + anchors), group (focus group; 0 = never dimmed, no pulse),
//          color (outside), cut (cut-face colour), hatch (section hatching on the cut face), mesh (false = embedded:
//          it only exists on the cut face)
export const box = (id, c, h, o = {}) => ({ id, type: "box", c, h, round: 0, group: 0, mesh: true, hatch: false, ...o });
export const capsule = (id, a, b, r, o = {}) => ({ id, type: "capsule", a, b, r, group: 0, mesh: true, hatch: false, ...o });
export const shell = (id, c, h, o = {}) => ({ id, type: "shell", c, h, round: 0, wall: 0.2, innerRound: 0, group: 0, mesh: true, hatch: true, ...o });
export const centreOf = (p) => (p.type === "capsule" ? [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2] : p.c);

// ---------------------------------------------------------------- the plane
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/**
 * planeAt(keys, t, origin) -> { n, d, u, v, origin, point, yaw, pitch }
 *   keys: [{ t, d, yaw = 0, pitch = 0, ease = "inOutCubic" }] (sorted; a key's ease applies to the segment arriving at it).
 *   The plane is { p : n·(p − origin) = d }; the KEPT half is n·(p − origin) <= d, the removed half is the n side.
 *   yaw turns n around +Y from +Z, pitch lifts it toward +Y. u (right) and v (up) span the plane.
 */
export function planeAt(keys, t, origin = [0, 0, 0]) {
  let i = 0;
  while (i < keys.length - 1 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const s = b.t > a.t ? toEase(b.ease ?? "inOutCubic")(clamp((t - a.t) / (b.t - a.t))) : 0;
  const d = lerp(a.d, b.d, s), yaw = lerp(a.yaw ?? 0, b.yaw ?? 0, s), pitch = lerp(a.pitch ?? 0, b.pitch ?? 0, s);
  const cp = Math.cos(pitch);
  const n = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  const ul = Math.hypot(n[2], n[0]) || 1;
  const u = [n[2] / ul, 0, -n[0] / ul];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { n, d, u, v, origin, yaw, pitch, point: [origin[0] + n[0] * d, origin[1] + n[1] * d, origin[2] + n[2] * d] };
}
/** signed distance of a point from the plane (> 0 = removed side). */
export const sideOf = (p, plane) => dot([p[0] - plane.origin[0], p[1] - plane.origin[1], p[2] - plane.origin[2]], plane.n) - plane.d;
/** the point of the plane nearest to p (where a label about p should point once p is cut). */
export const onPlane = (p, plane) => { const s = sideOf(p, plane); return [p[0] - plane.n[0] * s, p[1] - plane.n[1] * s, p[2] - plane.n[2] * s]; };
/** support(prim, plane) -> [lo, hi]: the range of n·(p − origin) over the solid. Cut while lo < d < hi; gone when d <= lo. */
export function support(prim, plane) {
  const { n, origin: o } = plane;
  if (prim.type === "capsule") {
    const a = dot([prim.a[0] - o[0], prim.a[1] - o[1], prim.a[2] - o[2]], n), b = dot([prim.b[0] - o[0], prim.b[1] - o[1], prim.b[2] - o[2]], n);
    return [Math.min(a, b) - prim.r, Math.max(a, b) + prim.r];
  }
  const c = dot([prim.c[0] - o[0], prim.c[1] - o[1], prim.c[2] - o[2]], n);
  const e = Math.abs(n[0]) * prim.h[0] + Math.abs(n[1]) * prim.h[1] + Math.abs(n[2]) * prim.h[2];
  return [c - e, c + e];
}
/** how much of the solid is on the removed side, 0..1 (by support range; exact for the plane's own direction). */
export const cutAmount = (prim, plane) => { const [lo, hi] = support(prim, plane); return clamp((hi - plane.d) / Math.max(1e-9, hi - lo)); };
/** half extents of the plane's visible sheet so it frames a box of half size h (+ margin), in (u, v). */
export function sheetHalf(h, plane, margin = 0.3) {
  const ext = (a) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];
  return [ext(plane.u) + margin, ext(plane.v) + margin];
}
/**
 * cutEvents(prims, keys, { origin, t0 = 0, t1, dt = 1/120 }) -> [{ t, kind, id, group, x }] sorted by t:
 *   the first time the plane touches each solid. One event per solid; solids never touched get none.
 */
export function cutEvents(prims, keys, { origin = [0, 0, 0], t0 = 0, t1 = keys[keys.length - 1].t, dt = 1 / 120 } = {}) {
  const out = [], open = new Set(prims.map((_, i) => i));
  const n = Math.round((t1 - t0) / dt);
  for (let k = 0; k <= n && open.size; k++) {
    const t = t0 + k * dt, plane = planeAt(keys, t, origin);
    for (const i of [...open]) {
      if (plane.d < support(prims[i], plane)[1]) {
        open.delete(i);
        out.push({ t: +t.toFixed(4), kind: prims[i].kind ?? prims[i].type, id: prims[i].id, group: prims[i].group ?? 0, x: centreOf(prims[i])[0] });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- the signal: a band of light running along x
/**
 * flowPlan({ starts, travel, x0, x1, hold = .8, rise = .15, stops: [{ x, kind, i }] })
 *   -> { starts, travel, arrivals, events: [{ t, kind, i, pulse }], pulses(t) -> [[x, amp], [x, amp]] (the two newest) }
 *   Each pulse leaves x0 at its start, reaches x1 after `travel` seconds, sits there and fades over `hold`.
 */
export function flowPlan({ starts, travel, x0, x1, hold = 0.8, rise = 0.15, stops = [] }) {
  const events = [];
  starts.forEach((s, pulse) => { for (const st of stops) events.push({ t: +(s + (travel * (st.x - x0)) / (x1 - x0)).toFixed(4), kind: st.kind, i: st.i ?? 0, x: st.x, pulse }); });
  events.sort((a, b) => a.t - b.t);
  const pulses = (t) => {
    const live = [];
    for (const s of starts) {
      const tau = t - s;
      if (tau < 0 || tau > travel + hold) continue;
      live.push([lerp(x0, x1, clamp(tau / travel)), smoothstep(0, rise, tau) * (1 - smoothstep(travel, travel + hold, tau))]);
    }
    const two = live.slice(-2);
    while (two.length < 2) two.push([x0 - 99, 0]);
    return two;
  };
  return { starts, travel, x0, x1, hold, events, arrivals: starts.map((s) => +(s + travel).toFixed(4)), pulses };
}

// ---------------------------------------------------------------- the reference model: a black-box AI model
/**
 * blackBoxModel(M, palette) -> { prims, origin, half, shell, anchors: { tokens, layers, answer }, stops, M }
 *   M = STYLE_SPEC.model. The box stands on y = 0, centred on x = z = 0; flow runs along +x.
 *   Order matters: on the cut face a later solid is drawn over an earlier one (embedded cores last).
 */
export function blackBoxModel(M, P) {
  const [W, H, D] = M.size, cy = H / 2;
  const R = rng(M.wires.seed);
  const prims = [];
  const sh = shell("shell", [0, cy, 0], [W / 2, H / 2, D / 2], { round: M.round, wall: M.wall, innerRound: M.innerRound, kind: "shell", color: P.shell, cut: P.cut, hatch: true });
  prims.push(sh);

  // layers: slabs standing across the flow, each with a column of embedded "neurons" (capsules along z)
  const L = M.layers, slabs = [], neurons = [];
  const levelY = (k) => cy + (k - (L.neurons - 1) / 2) * L.neuronDy;
  for (let i = 0; i < L.n; i++) {
    const x = L.x0 + i * L.pitch, col = P.layers[i % P.layers.length];
    slabs.push(box(`layer${i}`, [x, cy, 0], [L.thick / 2, L.h / 2, L.d / 2], { kind: "layer", group: 2, color: col, cut: col, i }));
    for (let k = 0; k < L.neurons; k++) {
      const z0 = -L.neuronZ + R.range(0, 0.25), z1 = L.neuronZ - R.range(0, 0.8);
      neurons.push(capsule(`neuron${i}_${k}`, [x, levelY(k), z0], [x, levelY(k), z1], L.neuronR, { kind: "neuron", group: 2, mesh: false, color: mixHex(col, "#ffffff", 0.72), cut: mixHex(col, "#ffffff", 0.72), i }));
    }
  }

  // tokens: a small block of cubes at the input end
  const T = M.tokens, tokens = [];
  for (let c = 0; c < T.cols; c++) for (let j = 0; j < T.rows; j++) for (let k = 0; k < T.deep; k++) {
    const col = (c + j + k) % 2 ? P.tokenAlt : P.token;
    tokens.push(box(`token${c}_${j}_${k}`, [T.x0 + c * T.dx, cy + (j - (T.rows - 1) / 2) * T.dy, (k - (T.deep - 1) / 2) * T.dz], [T.size / 2, T.size / 2, T.size / 2], { kind: "token", group: 1, color: col, cut: col }));
  }

  // the answer: one block with a bright core at the output end
  const A = M.answer;
  const answer = box("answer", [A.x, cy, 0], A.half, { kind: "answer", group: 3, color: P.answer, cut: P.answer });
  const core = capsule("answerCore", [A.x, cy, 0], [A.x, cy, 0], A.coreR, { kind: "core", group: 3, mesh: false, color: P.core, cut: P.core });

  // wiring: capsules across every gap, at several depths, joining neuron levels (ends sunk into the solids they join)
  const Wr = M.wires, wires = [];
  const wire = (a, b) => wires.push(capsule(`wire${wires.length}`, a, b, Wr.r, { kind: "wire", group: 2, color: P.wire, cut: P.wire }));
  const zAt = (j) => (Wr.perGap > 1 ? -Wr.z + (2 * Wr.z * j) / (Wr.perGap - 1) : 0);
  const xTok = T.x0 + (T.cols - 1) * T.dx + T.size / 2 - Wr.sink, xL0 = L.x0 - L.thick / 2 + Wr.sink;
  for (let j = 0; j < T.rows; j++) for (let k = 0; k < T.deep; k++) {
    if ((j + k) % 2 && T.rows * T.deep > 6) continue; // every other token is wired: enough to read as a bundle
    const y = cy + (j - (T.rows - 1) / 2) * T.dy, z = (k - (T.deep - 1) / 2) * T.dz;
    wire([xTok, y, z], [xL0, levelY(clamp(j + R.int(0, 1), 0, L.neurons - 1)), z]);
  }
  for (let i = 0; i < L.n - 1; i++) for (let j = 0; j < Wr.perGap; j++) {
    const ka = R.int(0, L.neurons - 1), kb = clamp(ka + R.int(-2, 2), 0, L.neurons - 1), z = zAt(j) + R.range(-0.07, 0.07);
    wire([L.x0 + i * L.pitch + L.thick / 2 - Wr.sink, levelY(ka), z], [L.x0 + (i + 1) * L.pitch - L.thick / 2 + Wr.sink, levelY(kb), z]);
  }
  const xLn = L.x0 + (L.n - 1) * L.pitch + L.thick / 2 - Wr.sink;
  for (let k = 0; k < L.neurons; k++) {
    const z = (k - (L.neurons - 1) / 2) * 0.5;
    wire([xLn, levelY(k), z], [A.x - A.half[0] + Wr.sink, cy + (k - (L.neurons - 1) / 2) * 0.22, z * 0.6]);
  }

  prims.push(...wires, ...tokens, ...slabs, answer, ...neurons, core);
  const tokX = T.x0 + ((T.cols - 1) * T.dx) / 2;
  return {
    M, prims, origin: [0, cy, 0], half: [W / 2, H / 2, D / 2], shell: sh,
    box: [[-W / 2, 0, -D / 2], [W / 2, H, D / 2]],
    anchors: { tokens: [tokX, cy, 0], layers: [L.x0 + Math.floor(L.n / 2) * L.pitch, cy, 0], answer: [A.x, cy, 0] },
    stops: [{ x: tokX, kind: "token", i: 0 }, ...slabs.map((s, i) => ({ x: s.c[0], kind: "layer", i })), { x: A.x, kind: "answer", i: 0 }],
    flowX: [-W / 2 + M.wall, A.x],
  };
}

/**
 * outside(model, flow, t) -> { tokens: [{ c, half, scale }], answer: { c, half, scale }, rails: [{ c, half }] }
 *   What happens OUTSIDE the box (all the uncut box ever shows): tokens ride a rail into the input wall at a steady
 *   rate; each time a pulse arrives an answer block slides out of the output wall, waits, and is taken away.
 */
export function outside(model, flow, t) {
  const M = model.M, Rl = M.rails, hx = M.size[0] / 2;
  const tokens = [];
  for (let j = 0; j < Rl.tokens; j++) {
    const u = (((j / Rl.tokens + t * Rl.rate) % 1) + 1) % 1;
    const scale = smoothstep(0, 0.1, u) * (1 - smoothstep(0.9, 1, u));
    tokens.push({ c: [lerp(-hx - Rl.len, -hx + Rl.size * 0.2, u), Rl.y, Rl.zIn], half: Rl.size / 2, scale });
  }
  let answer = { c: [hx, Rl.y, Rl.zOut], half: Rl.answerSize / 2, scale: 0 };
  for (const a of flow.arrivals) {
    const tau = t - a;
    if (tau < 0 || tau > 1.55) continue;
    const s = toEase("outCubic")(clamp(tau / 0.6));
    answer = { c: [hx - Rl.answerSize / 2 + s * Rl.out, Rl.y, Rl.zOut], half: Rl.answerSize / 2, scale: smoothstep(0, 0.12, tau) * (1 - smoothstep(1.25, 1.5, tau)) };
  }
  const rh = 0.025, ry = Rl.y - Rl.size / 2 - rh - 0.02;
  return {
    tokens, answer,
    rails: [
      { c: [-hx - Rl.len / 2, ry, Rl.zIn], half: [Rl.len / 2, rh, Rl.size * 0.62] },
      { c: [hx + (Rl.out + 0.3) / 2, ry - (Rl.answerSize - Rl.size) / 2, Rl.zOut], half: [(Rl.out + 0.3) / 2, rh, Rl.answerSize * 0.62] },
    ],
  };
}
