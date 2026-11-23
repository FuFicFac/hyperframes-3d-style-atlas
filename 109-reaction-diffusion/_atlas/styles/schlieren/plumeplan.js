// styles/schlieren/plumeplan.js — the Node-safe planner for "Schlieren". Plain data in, plain data out: no THREE, no
// window, no DOM. Imported by style.js (the picture) AND scene.config.js (SCORE), so the disc and every sound cue come
// from the same schedule: blade travel, knife cut, plume reveal, the breath puff, the split seam.
//
// What it holds:
//   1. createPlumePlan(cfg): the schedule. Everything is a closed form of t (eased keys, smoothsteps, erf).
//      plan.uniformsAt(t) is what the disc shader needs; plan.events() is the sound plan.
//   2. puffDisplacement(y, t, puff, v): the sideways displacement of the plume caused by a gaussian breath puff, in
//      closed form. A parcel of hot air leaves the flame and rises at speed v; the puff pushes sideways with a velocity
//      A·exp(−((τ−tp)/σt)²)·exp(−((y'−yp)/σy)²) (a gaussian pulse in time × a gaussian band in height). Integrating that
//      along the parcel's path y' = y − v(t − τ) is a product of two gaussians in τ, so
//         D(y, t) = A · √π / (2√(a+b)) · exp(−ab/(a+b) · (tp − τ*)²) · (1 + erf(√(a+b) · (t − μ)))
//      with a = 1/σt², b = v²/σy², τ* = t − (y − yp)/v (when the parcel crossed the jet's height), μ = (a·tp + b·τ*)/(a+b).
//      The same formula is in PLUME_GLSL (per pixel) and in JS here (notes + tests).
//   3. PLUME_GLSL: the density of the candle plume as a closed form of position and t (a rising gaussian column that
//      widens and fades with height, a slow sway, rolling = a domain warp by 3D value noise advected upward at the rise
//      speed, with travelling "puffing" bulges; the puff's displacement D; the breath jet's own warm streak) and the
//      schlieren signal = the SIDEWAYS rate of change ∂n/∂x of that density (central difference), which is what a
//      vertical knife edge selects.
// Coordinates: plume space is the vertical plane through the candle (z = const), x to the right, y up, origin at the
// flame tip, metres. Motion type: art-directed (procedural flow, not a fluid solve).
import { clamp, smoothstep, ease, lerp } from "../../kit/time.js";

/** Abramowitz–Stegun 7.1.26 erf (|error| < 1.5e-7); the GLSL twin is erfA() in PLUME_GLSL */
export function erf(x) {
  const s = x < 0 ? -1 : 1, a = Math.abs(x), k = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-a * a);
  return s * y;
}

/** piecewise eased keys [[t, v, ease?], ...] -> v(t); holds before the first and after the last key */
export function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i], [t0, v0] = keys[i - 1];
    if (t <= t1) return lerp(v0, v1, ease[e ?? "inOutCubic"](clamp((t - t0) / Math.max(1e-6, t1 - t0))));
  }
  return keys[keys.length - 1][1];
}

/**
 * puffDisplacement(y, t, puff, v) -> metres of sideways push of the plume parcel at height y (above the flame) at t.
 * puff = { t: centre time, sigT, y: band height above the flame, sigY, A: push velocity peak (m/s) }
 */
export function puffDisplacement(y, t, puff, v) {
  const a = 1 / (puff.sigT * puff.sigT), b = (v * v) / (puff.sigY * puff.sigY), ab = a + b;
  const tau = t - (Math.max(0, y) - puff.y) / v;
  const mu = (a * puff.t + b * tau) / ab;
  const g = Math.exp((-(a * b) / ab) * (puff.t - tau) * (puff.t - tau));
  return puff.A * (Math.sqrt(Math.PI) / (2 * Math.sqrt(ab))) * g * (1 + erf(Math.sqrt(ab) * (t - mu)));
}

/** flameTip(spec) -> [x, y, z] world position of the flame tip = plume-space origin (same formula as the candle prop) */
export function flameTip(S) {
  const C = S.candle, F = S.flame;
  return [C.x, C.y0 + C.h + 0.01 + F.h - F.tipInside, C.z];
}

/** flame flicker (deterministic sum of incommensurate sines): { sy (height scale), sx, lean (rad) } */
export function flicker(t, amt = 1) {
  const s = Math.sin, k = amt;
  return {
    sy: 1 + k * (0.05 * s(11.3 * t) + 0.035 * s(23.1 * t + 1.7) + 0.02 * s(37.9 * t + 0.4)),
    sx: 1 + k * (0.03 * s(9.1 * t + 2.2) + 0.02 * s(29.3 * t + 0.9)),
    lean: k * (0.035 * s(5.3 * t + 0.3) + 0.02 * s(17.7 * t + 2.9)),
  };
}

/**
 * createPlumePlan(cfg) -> plan
 * cfg = {
 *   plume: spec.plume (v, w0, spread, decay, rollScale, rollAmp, rollGrow, gain, h, ...),
 *   blade: { from, to, slide: [t0, t1], focusX, spot },            blade edge x travel; cut = how much of the focal spot it hides
 *   cutField: 0..1 how far the field dims at full cut (to grey),
 *   reveal: [t0, t1]                                               plume contrast ramps in (beat 3)
 *   roll: { keys: [[t, yT], ...] }                                 the height where the column starts rolling (falls in beat 3)
 *   straw: { in: [t0, t1], out: [t0, t1] }                         straw slides in / back
 *   puff: { t, sigT, y, sigY, A, jet: { U, life } }                breath puff
 *   seam: { in: [t0, t1], from, to }                               beat 5 split seam (disc-local x)
 * }
 */
export function createPlumePlan(cfg) {
  const PL = cfg.plume, BL = cfg.blade, PF = cfg.puff, SM = cfg.seam, ST = cfg.straw;

  const bladeX = (t) => keyed([[BL.slide[0], BL.from], [BL.slide[1], BL.to, "inOutSine"]], t);
  /** fraction of the focal spot the knife hides: 0 (out) .. 0.5 (edge at the spot centre, where it stops) .. 1 */
  const cut = (t) => {
    const e = bladeX(t); // edge x (moving toward −x); spot centre at focusX, radius spot
    return clamp((BL.focusX + BL.spot - e) / (2 * BL.spot), 0, 1);
  };
  /** 0 = ordinary view (full bright field), 1 = schlieren grey (half the light cut) */
  const field = (t) => clamp(2 * cut(t));
  const gain = (t) => ease.inOutSine(clamp((t - cfg.reveal[0]) / (cfg.reveal[1] - cfg.reveal[0])));
  const rollY = (t) => keyed(cfg.roll.keys, t);
  const strawX = (t) => {
    const i = ease.outCubic(clamp((t - ST.in[0]) / (ST.in[1] - ST.in[0])));
    const o = ease.inOutCubic(clamp((t - ST.out[0]) / (ST.out[1] - ST.out[0])));
    return lerp(ST.hidden, ST.tip, i * (1 - o));
  };
  /** jet strength (breath streak): rises with the puff, decays after */
  const jet = (t) => {
    const u = t - (PF.t - 2 * PF.sigT);
    if (u <= 0) return 0;
    return smoothstep(0, 1.4 * PF.sigT, u) * Math.exp(-Math.max(0, u - 2 * PF.sigT) / PF.jet.life);
  };
  /** jet front distance from the straw tip (m): fast, then slowing (√ law) */
  const jetFront = (t) => {
    const u = Math.max(0, t - (PF.t - 2 * PF.sigT));
    return PF.jet.U * Math.sqrt(u);
  };
  const seamX = (t) => {
    const u = ease.inOutCubic(clamp((t - SM.in[0]) / (SM.in[1] - SM.in[0])));
    return u <= 0 ? -99 : lerp(SM.from, SM.to, u);
  };
  const D = (y, t) => puffDisplacement(y, t, PF, PL.v);
  /** the pinhole lamp switches on at the start: the disc glows up from a dim level (something happens in the first second) */
  const lamp = (t) => { const L = cfg.lamp ?? { on: [0, 0.01], from: 1 }; return lerp(L.from, 1, ease.outCubic(clamp((t - L.on[0]) / (L.on[1] - L.on[0])))); };

  function uniformsAt(t) {
    const f = flicker(t, PL.flickerAmt ?? 1);
    return {
      lamp: lamp(t), bladeX: bladeX(t), cut: cut(t), field: field(t), gain: gain(t), rollY: rollY(t),
      strawX: strawX(t), strawOn: t >= ST.in[0] && t <= ST.out[1] + 0.05,
      jet: jet(t), jetFront: jetFront(t), seam: seamX(t), flicker: f,
      sway: PL.sway * (Math.sin(0.9 * t + 0.4) + 0.5 * Math.sin(2.3 * t + 1.1)),
    };
  }

  /** the score plan: one event list; scene.config.js turns it into SCORE with kit/schedule.scoreFromEvents */
  function events({ end }) {
    const ev = [];
    if (cfg.lamp) ev.push({ t: cfg.lamp.on[0], type: "lamp", dur: cfg.lamp.on[1] - cfg.lamp.on[0] });
    ev.push({ t: BL.slide[0], type: "slide", dur: BL.slide[1] - BL.slide[0] });
    // the knife reaches the spot: field starts to dim -> a soft tick when the edge crosses the spot centre
    let tc = BL.slide[0];
    for (let k = 0; k < 400; k++) { const tt = lerp(BL.slide[0], BL.slide[1], k / 399); if (cut(tt) >= 0.25) { tc = tt; break; } }
    ev.push({ t: tc, type: "cut" });
    ev.push({ t: BL.slide[1], type: "stop" });
    // airy texture: overlapping noise swells from the reveal on; denser and wider once it rolls
    const a0 = cfg.reveal[0];
    for (let tt = a0, i = 0; tt < end - 0.6; tt += 0.9, i++) {
      const roll = clamp((PL.rollTop - rollY(tt + 0.5)) / (PL.rollTop - PL.rollLow));
      ev.push({ t: tt, type: "air", dur: Math.min(2.4, end - tt), level: 0.45 + 0.55 * Math.max(gain(tt + 0.6), 0) * (0.6 + 0.4 * roll), pan: (i % 2 ? 0.25 : -0.1) });
    }
    ev.push({ t: ST.in[0], type: "straw", dur: ST.in[1] - ST.in[0] });
    ev.push({ t: PF.t - 1.6 * PF.sigT, type: "puff" });
    // swirl: eddies shed as the pushed segment rises (one per 0.45 s for ~2 s)
    for (let k = 0; k < 4; k++) ev.push({ t: PF.t + 0.35 + 0.45 * k, type: "swirl", pan: k % 2 ? 0.45 : 0.15, k });
    ev.push({ t: SM.in[0], type: "seam", dur: SM.in[1] - SM.in[0] });
    ev.push({ t: SM.in[1], type: "settle" });
    return ev.sort((p, q) => p.t - q.t);
  }

  return { lamp, bladeX, cut, field, gain, rollY, strawX, jet, jetFront, seamX, D, uniformsAt, events, cfg };
}

/**
 * PLUME_GLSL — the plume density and its sideways derivative. Needs these uniforms (set from plan.uniformsAt(t)):
 *   uTime; uPl0 = (v, w0, spread, decay); uPl1 = (rollScale, rollAmp, rollGrow, rollY); uPl2 = (sway, h, evolve, pulseLen)
 *   uPuff = (t, sigT, y, sigY); uPuffA = A; uJet = (strength, front, yRel, tipRel); uJetW = (w0, spread, amp, turb)
 */
export const PLUME_GLSL = /* glsl */ `
uniform float uTime;
uniform vec4 uPl0, uPl1, uPl2, uPuff, uJet, uJetW;
uniform float uPuffA;
float hash31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i), n100 = hash31(i + vec3(1,0,0)), n010 = hash31(i + vec3(0,1,0)), n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1)), n101 = hash31(i + vec3(1,0,1)), n011 = hash31(i + vec3(0,1,1)), n111 = hash31(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm3n(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.9375; }
float erfA(float x) {
  float s = sign(x), a = abs(x), k = 1.0 / (1.0 + 0.3275911 * a);
  float y = 1.0 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * exp(-a * a);
  return s * y;
}
// closed-form sideways displacement of the parcel at height y by the breath puff (see plumeplan.js)
float puffD(float y, float t) {
  float v = uPl0.x;
  float a = 1.0 / (uPuff.y * uPuff.y), b = v * v / (uPuff.w * uPuff.w), ab = a + b;
  float tau = t - (max(y, 0.0) - uPuff.z) / v;
  float mu = (a * uPuff.x + b * tau) / ab;
  float g = exp(-(a * b / ab) * (uPuff.x - tau) * (uPuff.x - tau));
  return uPuffA * (0.8862269 / sqrt(ab)) * g * (1.0 + erfA(sqrt(ab) * (t - mu)));
}
// warm-air "density" (index deficit) of the plume + breath at plume-plane point p (flame tip = origin), time t
float plumeN(vec2 p, float t, vec2 warp, float roll, float D) {
  float v = uPl0.x, w0 = uPl0.y, spread = uPl0.z, decay = uPl0.w;
  float y = max(p.y, 0.0);
  float x = p.x - D - uPl2.x * smoothstep(0.0, 0.6, y) - roll * uPl1.y * warp.x * (0.35 + 0.9 * y);
  float yw = max(0.0, y + roll * uPl1.y * 0.5 * warp.y);
  float w = w0 + spread * yw;
  float amp = 1.0 / (1.0 + yw / decay);
  float bulge = 1.0 + 0.45 * roll * sin(6.2831853 * (y - v * t) / uPl2.w + 3.0 * warp.y);
  w *= 1.0 + 0.3 * roll * (warp.y);
  float core = exp(-(x * x) / (w * w * bulge * bulge));
  float base = smoothstep(-0.05, 0.03, p.y);
  return amp * core * base * (0.75 + 0.25 * bulge);
}
float jetN(vec2 p, float t, float turb) {
  float xr = p.x - uJet.w;                       // distance downstream of the straw tip
  float along = smoothstep(-0.01, 0.03, xr) * (1.0 - smoothstep(uJet.y - 0.3, uJet.y + 0.05, xr)) * exp(-max(xr, 0.0) / 0.8);
  float w = uJetW.x + uJetW.y * max(xr, 0.0);
  float dy = p.y - uJet.z + 0.05 * (turb - 0.5) * (0.3 + xr);
  return uJet.x * uJetW.z * along * exp(-(dy * dy) / (w * w)) * (0.55 + 0.9 * turb);
}
// schlieren signal: sideways derivative of (plume + jet) at p, in units of 1/m, before gain
float schlierenS(vec2 p, float t) {
  float v = uPl0.x, rs = uPl1.x;
  float y = max(p.y, 0.0);
  float D = puffD(y, t);
  float Dd = (puffD(y + 0.05, t) - puffD(max(y - 0.05, 0.0), t)) / 0.1;           // vertical shear of the push -> eddies
  float roll = smoothstep(uPl1.w, uPl1.w + uPl1.z, y) + clamp(abs(Dd) * 1.6, 0.0, 1.6);
  roll = clamp(roll, 0.0, 1.9);
  vec3 q = vec3((p.x - D) * rs, (y - v * t) * rs, t * uPl2.z);
  vec2 warp = vec2(fbm3n(q) - 0.5, fbm3n(q + vec3(5.2, 1.3, 2.7)) - 0.5) * 2.0;
  float hh = uPl2.y;
  float turb = fbm3n(vec3((p.x - uJet.w - 0.6 * t) * 9.0, p.y * 9.0, t * 1.3));
  float nR = plumeN(p + vec2(hh, 0.0), t, warp, roll, D) + jetN(p + vec2(hh, 0.0), t, turb);
  float nL = plumeN(p - vec2(hh, 0.0), t, warp, roll, D) + jetN(p - vec2(hh, 0.0), t, turb);
  return (nR - nL) / (2.0 * hh);
}
`;
