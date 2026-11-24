// styles/photoelastic-stress/stressplan.js — the Node-safe planner for "Photoelastic Stress". Plain data in, plain
// data out: no THREE, no window, no DOM. Imported by style.js (picture) AND scene.config.js (SCORE), so the bands on
// screen and every sound cue come from the same load / support schedule.
//
// Two things live here:
//   1. interferenceTable(): the colour of a dark-field circular polariscope for every retardation R (nm). For each R
//      it integrates I(λ) = sin²(πR/λ) × a blackbody light-box spectrum × the CIE 1931 colour-matching functions
//      (Wyman–Sloan–Shirley 2013 multi-lobe fit) over 380–780 nm, converts XYZ to linear sRGB and white-balances it
//      to the light box. R = 0 is black; ~250 nm first-order white; ~530 nm red; ~575 nm violet "tint of passage";
//      then blue, green, yellow, red again, fading to pale pink/green at high orders (the Michel-Lévy sequence).
//   2. createStressPlan(): an ANALYTICAL APPROXIMATION of the in-plane stress in a notched beam (not a finite-element
//      solve). Stress tensor = Flamant point-load (half-plane) solutions for the press and each support, contact
//      smoothed over a half-width a, + elementary beam bending σxx = −M(x)(y − H/2)/I with M(x) from the support
//      reactions (statics), + a notch term: a simple concentration factor Kt on the net-section bending stress that
//      decays away from the notch root. Retardation R = Cf × (σ1 − σ2). The shader in style.js evaluates the same
//      formula per pixel from the uniforms this plan returns for time t.
// Beam coordinates: x along the beam (centre 0, ends ±L/2), y up from the beam's bottom edge (0..H). Units: metres
// for geometry, an arbitrary load unit for P (the press load), so stress is in "load per metre²" — only Cf × stress
// (nm) matters on screen.
import { clamp, smoothstep, ease, lerp } from "../../kit/time.js";

// ------------------------------------------------------------------------------------------- interference colours
const lobe = (l, mu, s1, s2) => { const s = l < mu ? s1 : s2; const u = (l - mu) / s; return Math.exp(-0.5 * u * u); };
/** CIE 1931 2° colour-matching functions, analytic multi-lobe fit (Wyman, Sloan & Shirley 2013). */
export function cmf(l) {
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ];
}
/** relative blackbody spectral radiance at λ nm, temperature K (normalised at 560 nm) */
export function planck(l, K) {
  const c2 = 1.4388e7; // nm·K
  const f = (x) => Math.pow(x, -5) / (Math.exp(c2 / (x * K)) - 1);
  return f(l) / f(560);
}
const XYZ2RGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.204, 1.057]];
const toRGB = (X) => XYZ2RGB.map((r) => r[0] * X[0] + r[1] * X[1] + r[2] * X[2]);

/**
 * interferenceTable({ n = 512, rMax = 4200, kelvin = 5600, l0 = 380, l1 = 780, step = 2, dispersion = 0 })
 *   -> { n, rMax, rgb: Float32Array(3n) linear, white-balanced so the light box itself = (1,1,1); dark-field value
 *        at R = rMax·i/(n−1). Averages 0.5 at high order. dispersion: optional relative change of the fringe constant
 *        per 100 nm (0 = none). }
 */
export function interferenceTable(o = {}) {
  const n = o.n ?? 512, rMax = o.rMax ?? 4200, K = o.kelvin ?? 5600, l0 = o.l0 ?? 380, l1 = o.l1 ?? 780, step = o.step ?? 2;
  const disp = o.dispersion ?? 0;
  const ls = [];
  for (let l = l0; l <= l1 + 1e-9; l += step) ls.push(l);
  const w = ls.map((l) => { const c = cmf(l), s = planck(l, K); return [c[0] * s, c[1] * s, c[2] * s]; });
  const Wxyz = w.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
  const Wrgb = toRGB(Wxyz);
  const rgb = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const R = (rMax * i) / (n - 1);
    const X = [0, 0, 0];
    for (let k = 0; k < ls.length; k++) {
      const l = ls[k], Rl = R * (1 + disp * (560 - l) / 100);
      const s = Math.sin((Math.PI * Rl) / l), I = s * s;
      X[0] += w[k][0] * I; X[1] += w[k][1] * I; X[2] += w[k][2] * I;
    }
    const c = toRGB(X);
    for (let j = 0; j < 3; j++) rgb[3 * i + j] = Math.max(0, c[j] / Wrgb[j]);
  }
  return { n, rMax, rgb };
}

/** colourAt(table, R) -> [r,g,b] linear (linear interpolation in the table) */
export function colourAt(T, R) {
  const f = clamp(R / T.rMax) * (T.n - 1), i = Math.min(T.n - 2, Math.floor(f)), u = f - i;
  return [0, 1, 2].map((j) => lerp(T.rgb[3 * i + j], T.rgb[3 * (i + 1) + j], u));
}

// ------------------------------------------------------------------------------------------- the stress plan
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
 * createStressPlan(cfg) -> plan
 * cfg = {
 *   beam: { L, H }, press: { x, a }, supports: [{ x, a }, { x, a }] (fixed, under the beam),
 *   third: { x, from, a, share, slide: [t0, t1], lift: [t0, t1], take: [t0, t1], visibleFrom },
 *   load: [[t, P, ease], ...] press load keys (P in load units), plunger: { gap, touch: [t0, t1] },
 *   notch: { x, depth, width, rho, Kt }, Cf (nm per stress unit), analyser: { slide: [t0, t1] }
 * }
 * plan.uniformsAt(t) gives the shader everything it needs; plan.stress(x, y, t) is the same formula in JS.
 */
export function createStressPlan(cfg) {
  const { beam, press, supports, third, notch } = cfg;
  const H = beam.H, L = beam.L, I = (H * H * H) / 12;

  const load = (t) => keyed(cfg.load, t);
  /** third support: x position, lift 0..1 (1 = seated against the beam), share of P it carries */
  const thirdAt = (t) => {
    const sx = keyed([[third.slide[0], third.from], [third.slide[1], third.x, "inOutCubic"]], t);
    const lift = smoothstep(third.lift[0], third.lift[1], t);
    const take = ease.inOutSine(clamp((t - third.take[0]) / (third.take[1] - third.take[0])));
    return { x: sx, lift, take, share: third.share * take, visible: t >= third.visibleFrom };
  };

  /** point forces on the beam at t: press down at the top, reactions up at the bottom (statics, ΣF = ΣM = 0) */
  function forces(t) {
    const P = load(t), th = thirdAt(t);
    const R3 = P * th.share;
    const [s1, s2] = supports;
    // moments about s2: R1 (s2 − s1) = P (s2 − xp) − R3 (s2 − x3)
    const R1 = (P * (s2.x - press.x) - R3 * (s2.x - th.x)) / (s2.x - s1.x);
    const R2 = P - R1 - R3;
    return [
      { x: press.x, y: H, P, dir: -1, a: press.a, id: "press" },
      { x: s1.x, y: 0, P: R1, dir: 1, a: s1.a, id: "s1" },
      { x: s2.x, y: 0, P: R2, dir: 1, a: s2.a, id: "s2" },
      { x: th.x, y: 0, P: R3, dir: 1, a: third.a, id: "s3" },
    ];
  }

  /** bending moment M(x) (sagging positive) from the point forces: Σ_{xi < x} Fi (x − xi), Fi up-positive */
  const momentOf = (F, x) => {
    let M = 0;
    for (const f of F) { const Fi = f.dir > 0 ? f.P : -f.P; M += Fi * Math.max(0, x - f.x); }
    return M;
  };

  // notch geometry: V cut up from the bottom edge, round root of radius rho; root circle centre (x, depth - rho)
  const hNet = H - notch.depth, yRoot = notch.depth;
  /** stress amplitude added at the notch root: Kt × net-section bending stress minus what plain bending already gives */
  const notchAmp = (F) => {
    const M = momentOf(F, notch.x);
    const sNet = (6 * M) / (hNet * hNet); // tension at the root for sagging M
    const sGross = (-M * (yRoot - H / 2)) / I; // plain beam bending at the root height
    return notch.Kt * sNet - sGross;
  };
  const notchFall = (x, y) => {
    const dx = x - notch.x, dy = y - (notch.depth - notch.rho);
    const d = Math.max(0, Math.hypot(dx, dy) - notch.rho);
    return Math.pow(notch.rho / (notch.rho + d), notch.decay ?? 1.4);
  };

  /** stress tensor at beam point (x, y), time t (same formula as the shader) */
  function stress(x, y, t, F = forces(t)) {
    let sxx = 0, syy = 0, txy = 0;
    for (const f of F) {
      if (f.P === 0) continue;
      const s = x - f.x, dy = y - f.y, d = Math.max(0, f.dir * dy);
      const r2 = s * s + dy * dy + f.a * f.a;
      const sr = (-2 * f.P * d) / (Math.PI * r2);
      sxx += (sr * s * s) / r2; syy += (sr * dy * dy) / r2; txy += (sr * s * dy) / r2;
    }
    sxx += (-momentOf(F, x) * (y - H / 2)) / I;
    sxx += notchAmp(F) * notchFall(x, y);
    const diff = Math.sqrt((sxx - syy) * (sxx - syy) + 4 * txy * txy);
    return { sxx, syy, txy, diff };
  }
  const retard = (x, y, t) => cfg.Cf * stress(x, y, t).diff;
  /** fringe order N = R / 560 nm (roughly the "tint of passage" per order) */
  const order = (x, y, t) => retard(x, y, t) / 560;

  /** peak fringe order at the notch root and at mid-span bottom (what the glassy tone tracks) */
  const peakOrder = (t) => Math.max(order(notch.x, yRoot + 0.004, t), order(press.x, 0.004, t));

  /** plunger nose height above the beam top (m, 0 = touching) and handwheel turn (rad) */
  const plungerGap = (t) => cfg.plunger.gap * (1 - ease.inOutCubic(clamp((t - cfg.plunger.touch[0]) / (cfg.plunger.touch[1] - cfg.plunger.touch[0]))));
  const wheelAngle = (t) => (cfg.plunger.gap - plungerGap(t)) * cfg.plunger.turnsPerM * Math.PI * 2 + load(t) * cfg.plunger.turnsPerLoad * Math.PI * 2;
  const analyser = (t) => ease.outCubic(clamp((t - cfg.analyser.slide[0]) / (cfg.analyser.slide[1] - cfg.analyser.slide[0])));

  /** everything the beam shader needs at t */
  function uniformsAt(t) {
    const F = forces(t);
    return {
      loads: F.map((f) => [f.x, f.y, f.P, f.a]), dirs: F.map((f) => f.dir), notchAmp: notchAmp(F), load: load(t),
      third: thirdAt(t), plungerGap: plungerGap(t), wheel: wheelAngle(t), analyser: analyser(t),
    };
  }

  /** sound events (kinds: slide, servo, touch, tone, glide, seat, settle) — every time comes from cfg */
  function events(o = {}) {
    const ev = [];
    ev.push({ kind: "slide", t: cfg.analyser.slide[0], dur: cfg.analyser.slide[1] - cfg.analyser.slide[0] });
    // press servo: one glide per load ramp (plunger travel + each rising load key)
    ev.push({ kind: "servo", t: cfg.plunger.touch[0], dur: cfg.plunger.touch[1] - cfg.plunger.touch[0], hz: 62, hz2: 78 });
    for (let i = 1; i < cfg.load.length; i++) {
      const [t1, v1] = cfg.load[i], [t0, v0] = cfg.load[i - 1];
      if (v1 > v0 && t1 > t0) ev.push({ kind: "servo", t: t0, dur: t1 - t0, hz: 70 + v0 * 30, hz2: 70 + v1 * 30 });
    }
    ev.push({ kind: "touch", t: cfg.plunger.touch[1] });
    // the glassy tone: overlapping short segments whose pitch follows the peak fringe order
    const seg = o.toneSeg ?? 0.5, t0 = cfg.plunger.touch[1], end = o.end ?? 15;
    for (let t = t0; t < end - 0.05; t += seg / 2) {
      const N = peakOrder(t + seg / 2);
      ev.push({ kind: "tone", t, dur: Math.min(seg, end - t), order: N, first: t === t0, last: t + seg / 2 >= end - 0.05 });
    }
    ev.push({ kind: "glide", t: third.slide[0], dur: third.slide[1] - third.slide[0] });
    ev.push({ kind: "lift", t: third.lift[0], dur: third.lift[1] - third.lift[0] });
    ev.push({ kind: "seat", t: third.lift[1] });
    ev.push({ kind: "settle", t: third.take[1] });
    return ev.sort((a, b) => a.t - b.t);
  }

  return { cfg, H, L, I, load, thirdAt, forces, momentOf, notchAmp, notchFall, stress, retard, order, peakOrder, plungerGap, wheelAngle, analyser, uniformsAt, events };
}

/**
 * notchOutline(beam, notch, segs = 10) -> [[x, y], ...] closed CCW outline of the beam with a V notch cut up from
 *   the bottom edge (flank half-width notch.width / 2 at the edge, round root of radius rho at height depth).
 */
export function notchOutline(beam, notch, segs = 10) {
  const { L, H } = beam, { x: xn, depth, width, rho } = notch;
  const half = width / 2, cy = depth - rho;
  // flank direction from the edge point up to the root circle: tangent points of the circle
  const ang = Math.atan2(depth, half); // flank angle vs horizontal (approx; the sharp tip is replaced by an arc)
  const pts = [[-L / 2, 0], [xn - half, 0]];
  // left flank up to its tangent point, the arc over the top of the root, then the right flank down
  const a0 = Math.PI / 2 + ang, a1 = Math.PI / 2 - ang;
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push([xn + rho * Math.cos(a), cy + rho * Math.sin(a)]);
  }
  pts.push([xn + half, 0], [L / 2, 0], [L / 2, H], [-L / 2, H]);
  return pts;
}
