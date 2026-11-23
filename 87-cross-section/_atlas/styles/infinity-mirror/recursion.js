// styles/infinity-mirror/recursion.js — the reflection planner. Pure functions: NO THREE, no window, no DOM (imports
// only kit/time.js), so style.js (picture), scene.config.js (camera keys + SCORE) and Node tools read the SAME plan.
//
// Geometry. The real layer hangs in the plane z = 0, the rear mirror is at z = -D/2 and the half-silvered front
// glass at z = +D/2 (D = cavity depth). Looking in through the glass you see the real layer (generation 0), its image
// in the rear mirror (1), the image of that in the glass seen in the rear mirror (2), ... Generation n is the real
// layer reflected n times:  T_n = B F B F ... (n factors),  B = rear-mirror reflection, F = front-glass reflection.
// With a tilt `th` between the mirrors (each leans th/2, hinged on the vertical line x = -D/th in the layer's plane):
//     B = Rot(-th) Flip,  F = Rot(+th) Flip   (Flip: z -> -z; Rot: rotation about the hinge line)
//     T_n = Rot(-n th) Flip^n
// so every generation is one more step of th round the hinge: parallel mirrors (th = 0) give the straight tunnel
// z_n = -n D; a tilt bends it into a circle of radius D/th, and th = pi / ringCells closes it after 2 x ringCells
// steps. All formulas below are written with sinc() so they are exact and stable at th = 0.
//
// Light. Generation n has bounced ceil(n/2) times off the rear mirror and floor(n/2) times off the glass:
//     atten(n) = mirror^ceil(n/2) x glass^floor(n/2)   per colour channel  (the glass keeps green best).
// Exposure follows the generation the camera is at (a camera inside the tunnel adapts), by optics.exposure (0..1).
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";

const sinc = (a) => (Math.abs(a) < 1e-4 ? 1 - (a * a) / 6 : Math.sin(a) / a);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hexLin = (h) => [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });

/** monotone(keys [[t, v]...]) -> { at(t), inv(v) }: monotone cubic (Fritsch-Carlson) through the keys, flat ends. */
export function monotone(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  m[0] = 0; m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  const at = (t) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], u = (t - x[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h * m[i + 1];
  };
  const inv = (v) => { let a = x[0], b = x[n - 1]; if (v <= y[0]) return a; if (v >= y[n - 1]) return b; for (let k = 0; k < 50; k++) { const c = (a + b) / 2; if (at(c) < v) a = c; else b = c; } return (a + b) / 2; };
  return { at, inv };
}

/** centre(g, th, D) -> [x, z] of the tunnel centreline at generation coordinate g (continuous) for tilt th. */
export function centre(g, th, D) {
  const a = g * th;
  return [-D * g * (a / 2) * sinc(a / 2) ** 2, -g * D * sinc(a)];
}
/** genMatrix(n, th, D) -> row-major 4x4 of T_n (real layer -> generation n). Odd generations are mirror images. */
export function genMatrix(n, th, D) {
  const ph = -n * th, c = Math.cos(ph), s = Math.sin(ph), f = n % 2 ? -1 : 1, [tx, tz] = centre(n, th, D);
  return [c, 0, -f * s, tx, 0, 1, 0, 0, s, 0, f * c, tz, 0, 0, 0, 1];
}
/** apply(m, p) -> p transformed by a row-major 4x4. */
export const apply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];

/** hoopPath(S.hoop, n) -> n points [x, y] evenly spaced by arc length round the rounded rectangle (start: top centre, clockwise). */
export function hoopPath(H, n) {
  const w = H.w / 2, h = H.h / 2, r = Math.min(H.corner, w, h), sx = w - r, sy = h - r, q = (Math.PI / 2) * r;
  const segs = [sx, q, 2 * sy, q, 2 * sx, q, 2 * sy, q, sx], L = segs.reduce((a, b) => a + b, 0);
  const at = (s) => {
    s = ((s % L) + L) % L;
    let k = 0; while (s > segs[k]) { s -= segs[k]; k++; }
    const arc = (cx, cy, a0) => { const a = a0 - s / r; return [cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)]; };
    switch (k) {
      case 0: return [s, h, 0, 1];
      case 1: return arc(sx, sy, Math.PI / 2);
      case 2: return [w, sy - s, 1, 0];
      case 3: return arc(sx, -sy, 0);
      case 4: return [sx - s, -h, 0, -1];
      case 5: return arc(-sx, -sy, -Math.PI / 2);
      case 6: return [-w, -sy + s, -1, 0];
      case 7: return arc(-sx, sy, Math.PI);
      default: return [-sx + s, h, 0, 1];
    }
  };
  return { length: L, points: Array.from({ length: n }, (_, i) => at((i / n) * L)) };   // [x, y, nx, ny]
}

/**
 * createPlan(S, T) -> plan.   S = STYLE_SPEC.   T (seconds; every one comes from the scene's BEATS):
 *   { light: { t, dur },                      the real bulbs switch on round the hoop
 *     grow:  { t, step, slow, rushT, rushDur }, generations 1..slow arrive `step` apart, the rest rush in from rushT
 *     place: { t, ripple },                   the figure pops into the real layer; generation n follows n x ripple later
 *     exterior: [{ t, pos, target }],         camera keys outside the box (the last one head-on, level, at dive.t)
 *     dive:  { t, keys: [[t, g] ...] },       generation coordinate of the camera from dive.t (g < 0 = still outside)
 *     tilt:  { t0, t1, bank },                the mirrors lean from 0 to pi / ringCells
 *     exit:  { t0, t1 },                      leave the ring, swing round to the end pose
 *     end:   { pos, target }, fov: { out, fly }, lead, flyY, duration }
 */
export function createPlan(S, T) {
  const C = S.cavity, O = S.optics, D = C.depth, N = C.generations, M = C.ringCells, TH = Math.PI / M;
  const duration = T.duration ?? 15;

  // ---- when each generation exists ---------------------------------------------------------------------------
  const genT = [-Infinity];
  for (let n = 1; n <= N; n++) {
    if (n <= T.grow.slow) genT.push(T.grow.t + (n - 1) * T.grow.step);
    else genT.push(T.grow.rushT + T.grow.rushDur * ((n - T.grow.slow) / (N - T.grow.slow)) ** 0.8);
  }
  const depth = (t) => { let k = 0; for (let n = 1; n <= N; n++) if (t >= genT[n]) k = n; return k; };

  // ---- tilt -----------------------------------------------------------------------------------------------------
  const tiltU = (t) => ease.inOutSine(clamp((t - T.tilt.t0) / (T.tilt.t1 - T.tilt.t0)));
  const tilt = (t) => TH * tiltU(t);

  // ---- light: attenuation per generation, exposure ------------------------------------------------------------------
  const atten = (n) => [0, 1, 2].map((k) => O.mirror[k] ** Math.ceil(n / 2) * O.glass[k] ** Math.floor(n / 2));
  const perGen = [0, 1, 2].map((k) => Math.sqrt(O.mirror[k] * O.glass[k]));
  const ATT = Array.from({ length: N + 1 }, (_, n) => atten(n));

  // ---- camera ----------------------------------------------------------------------------------------------------
  const gCurve = monotone(T.dive.keys);
  const X = T.exterior[T.exterior.length - 1];                 // head-on pose at dive.t
  const gX = -X.pos[2] / D;
  if (Math.abs(T.dive.keys[0][1] - gX) > 1e-6) throw new Error(`recursion: dive.keys must start at g = ${gX}`);
  const gOf = (t) => (t <= T.dive.t ? gX : gCurve.at(Math.min(t, T.exit.t0)));
  const lead = T.lead ?? 4, flyY = T.flyY ?? 0;
  const linePoint = (g, th, x0, y0) => {                       // centreline; outside the box (g < 0) the straight approach
    if (g <= 0) { const u = smoothstep(gX, -lead, g); return [lerp(x0, 0, u), lerp(y0, flyY, u), -g * D]; }
    const [x, z] = centre(g, th, D); return [x, flyY, z];
  };
  const flight = (t) => {
    const g = gOf(t), th = tilt(t);
    const pos = linePoint(g, th, X.pos[0], X.pos[1]);
    const target = g + lead <= 0 ? [pos[0], pos[1], -(g + lead) * D] : linePoint(g + lead, th, 0, flyY);
    const fov = lerp(T.fov.out, T.fov.fly, smoothstep(-3.5, 1.5, g));
    return { pos, target, fov, roll: -(T.tilt.bank ?? 0) * tiltU(t) * smoothstep(0, 2, g), g };
  };
  const exterior = (t) => {
    const K = T.exterior;
    if (t <= K[0].t) return { pos: K[0].pos, target: K[0].target, fov: T.fov.out, roll: 0, g: gX };
    let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
    const a = K[i], b = K[i + 1], u = ease.inOutSine(clamp((t - a.t) / (b.t - a.t)));
    const mix = (p, q) => p.map((v, k) => lerp(v, q[k], u));
    return { pos: mix(a.pos, b.pos), target: mix(a.target, b.target), fov: T.fov.out, roll: 0, g: gX };
  };
  // exit: cubic Hermite from the ring pose (with its velocity) to the end pose (at rest)
  const F0 = flight(T.exit.t0), Fm = flight(T.exit.t0 - 0.01), dur = T.exit.t1 - T.exit.t0;
  const vel = (k) => F0[k].map((v, i) => ((v - Fm[k][i]) / 0.01) * dur);
  const V = { pos: vel("pos"), target: vel("target") };
  const exit = (t) => {
    const u = clamp((t - T.exit.t0) / dur), u2 = u * u, u3 = u2 * u;
    const h = (k) => F0[k].map((p, i) => (2 * u3 - 3 * u2 + 1) * p + (u3 - 2 * u2 + u) * V[k][i] + (-2 * u3 + 3 * u2) * T.end[k][i]);
    const s = smoothstep(0, 1, u);
    return { pos: h("pos"), target: h("target"), fov: lerp(F0.fov, T.fov.out, s), roll: F0.roll * (1 - smoothstep(0, 0.6, u)), g: F0.g };
  };
  /** camera(t) -> { pos, target, fov, roll, g }  (g = generation coordinate while flying) */
  const camera = (t) => (t <= T.dive.t ? exterior(t) : t < T.exit.t0 ? flight(t) : exit(t));
  const tGlass = gCurve.inv(-0.5), tInside = gCurve.inv(0);
  /** phase(t): "outside" (in front of the box), "inside" (flying the tunnel), "back" (out of the ring, in the gallery again) */
  const phase = (t) => (t < tInside ? "outside" : t < T.exit.t0 ? "inside" : "back");

  // exposure: the generation the camera is at (0 outside; eases back to 0 just before it leaves the ring)
  const camGen = (t) => (t < tInside ? 0 : gOf(t) * (1 - smoothstep(T.exit.t0 - 0.35, T.exit.t0 - 0.05, t)));
  const gain = (t) => Math.min(O.maxGain, lum(perGen.map((r) => r ** camGen(t))) ** -O.exposure);

  // ---- visibility and tint of generation n ---------------------------------------------------------------------------
  const vis = (n, t) => {
    let v = n === 0 ? 1 : smoothstep(genT[n], genT[n] + O.appear, t);
    v *= lerp(1, C.tailLevel ?? 0.4, clamp((n - (N - C.tail)) / C.tail));
    if (phase(t) === "inside") {
      v *= smoothstep(gOf(t) - 4, gOf(t) - 2.5, n);                                    // copies well behind the camera (seen across the ring) are off
      if (n > M) v *= 1 - smoothstep(T.exit.t0 - 0.35, T.exit.t0 - 0.05, t);           // the far half-ring fades before the gallery returns
    }
    // back in the gallery with tilted mirrors, only the half-ring BEHIND the wall can be seen through the glass
    if (phase(t) === "back" && n * tilt(t) > Math.PI) v = 0;
    return v;
  };
  const flash = (n, t) => (n === 0 || t < genT[n] ? 0 : O.flash * Math.exp(-(t - genT[n]) / O.flashDur));
  /** tint(n, t) -> [r, g, b] multiplier for everything in generation n */
  const tint = (n, t) => { const k = gain(t) * vis(n, t) * (1 + flash(n, t)); return ATT[n].map((a) => a * k); };

  // ---- the real layer ---------------------------------------------------------------------------------------------------
  const path = hoopPath(S.hoop, S.bulbs.count);
  const bulbs = path.points.map((p, i) => ({ i, x: p[0], y: p[1], colour: S.bulbs.pattern[i % S.bulbs.pattern.length], on: T.light.t + (i / S.bulbs.count) * T.light.dur }));
  /** lit(t) -> how many bulbs are on (fractional = the next one warming up) */
  const lit = (t) => clamp(((t - T.light.t) / T.light.dur) * S.bulbs.count + 1, 0, S.bulbs.count + 1);
  /** figureScale(n, t) -> 0..1 (overshoots) pop of the figure in generation n */
  const figureAt = (n) => T.place.t + n * T.place.ripple;
  const figureScale = (n, t) => (t <= figureAt(n) ? 0 : ease.outBack(clamp((t - figureAt(n)) / S.figure.pop), S.figure.overshoot));

  // ---- counter chip ------------------------------------------------------------------------------------------------------
  const counter = (t) => {
    const ph = phase(t);
    if (ph === "outside") { const d = depth(t); return d > 0 && t < tGlass - 0.2 ? { label: "COPIES", n: d } : null; }
    if (ph === "inside") { const g = gOf(t); return t < T.exit.t0 - 0.35 ? { label: "COPY", n: Math.min(N, Math.max(1, Math.ceil(g))) } : null; }
    return null;
  };

  // ---- events (-> SCORE) ---------------------------------------------------------------------------------------------------
  const events = () => {
    const ev = [];
    bulbs.forEach((b) => { if (b.i % 2 === 0) ev.push({ t: b.on, kind: "bulb", i: b.i, pan: clamp(b.x / (S.hoop.w / 2)) * 0.6 }); });
    for (let n = 1; n <= N; n++) ev.push({ t: genT[n], kind: n <= T.grow.slow ? "gen" : "rush", n, level: lum(ATT[n]) });
    ev.push({ t: T.place.t, kind: "place" });
    for (let n = 1; n <= 9; n++) ev.push({ t: figureAt(n), kind: "echo", n, level: lum(ATT[n]) });
    ev.push({ t: T.dive.t, kind: "dive", dur: tGlass - T.dive.t });
    ev.push({ t: tGlass, kind: "glass" });
    for (let n = 1; n <= N; n++) { const t = gCurve.inv(n); if (t < T.exit.t0) ev.push({ t, kind: "pass", n, level: lum(ATT[n]) }); }
    ev.push({ t: T.tilt.t0, kind: "tilt", dur: T.tilt.t1 - T.tilt.t0 });
    ev.push({ t: T.exit.t0, kind: "exit", dur });
    ev.push({ t: T.exit.t1 - 0.15, kind: "arrive" });
    return ev.sort((a, b) => a.t - b.t);
  };

  return {
    D, N, M, TH, duration, genT, depth, tilt, tiltU, atten, ATT, perGen, camera, phase, tGlass, tInside, gOf, camGen, gain, vis, tint,
    bulbs, path, lit, figureAt, figureScale, counter, events,
    matrix: (n, t) => genMatrix(n, tilt(t), D),
    /** glassLevel(t): the front glass sheen, gone by the time the camera reaches it */
    glassLevel: (t) => (phase(t) === "back" ? smoothstep(T.exit.t0 + 0.2, T.exit.t1, t) : 1 - smoothstep(tGlass - 0.55, tGlass - 0.05, t)),
    /** galleryOn(t): the wall, frame and floor exist only while the camera is in the gallery */
    galleryOn: (t) => (phase(t) === "inside" ? 0 : 1),
  };
}

/** mirrorVoices(S.sound) -> voices for kit/schedule.scoreFromEvents: one voice list per event kind. */
export function mirrorVoices(Q) {
  const G = Q.gen;
  const genVoice = (n, gain) => ({ type: "pluck", hz: G.hz * 2 ** ((G.semis * (n - 1)) / 12), gain: gain * G.gainFall ** (n - 1), bright: G.bright * G.brightFall ** (n - 1), decay: G.decay, dur: 1.4 });
  return {
    bulb: () => [{ type: "tick", gain: Q.bulb.gain, pitch: Q.bulb.pitch }],
    gen: (e) => [genVoice(e.n, G.gain)],
    rush: (e) => [{ ...genVoice(e.n, G.gain * G.rushGain), dur: 0.7 }],
    place: () => [{ type: "pop", gain: Q.place.pop }, { type: "pluck", hz: G.hz * 1.5, gain: 0.5, bright: 0.9, decay: 1.2, dur: 1.3 }],
    echo: (e) => [{ type: "pop", gain: Q.place.echoGain * Q.place.echoFall ** e.n, pitch: 0.97 ** e.n }],
    dive: (e) => [{ type: "riser", dur: e.dur, gain: Q.dive.riser }],
    glass: () => [{ type: "whoosh", dur: 0.9, dir: "out", gain: Q.dive.whoosh }, { type: "chime", gain: Q.dive.glass, pitch: 1.2, dur: 1.2 }],
    pass: (e) => [{ type: "tick", gain: Q.pass.gain * Q.pass.fall ** e.n, pitch: Q.pass.pitch * Q.pass.pitchFall ** e.n, pan: e.n % 2 ? -0.35 : 0.35 }],
    tilt: (e) => [{ type: "servo", dur: e.dur, hz: 90, hz2: 150, gain: Q.tilt.gain }],
    exit: (e) => [{ type: "whoosh", dur: e.dur * 0.9, dir: "out", gain: 0.4 }],
    arrive: () => [{ type: "chime", gain: Q.arrive.chime, dur: 1.6 }, { type: "pluck", hz: G.hz / 2, notes: [0, 7, 12], step: 0.07, gain: Q.arrive.pluck, bright: 0.8, decay: 1.6, dur: 1.6 }],
  };
}
export { hexLin, lum };
