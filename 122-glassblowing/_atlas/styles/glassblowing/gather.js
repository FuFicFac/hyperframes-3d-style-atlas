// styles/glassblowing/gather.js — the GATHER PLAN (pure, Node-safe: no THREE, no window, no DOM).
// Plain data in (STYLE_SPEC.gather + a timed config from the scene), plain data out. style.js reads it for the picture and
// scene.config.js reads it for the camera fits and SCORE, so every breath, tap and ping comes from the same plan as the glass.
//
// The glass is a surface of revolution around the pipe axis (local +x, pipe tip at x = 0). Its profile is ONE closed loop:
//   outer (collar on the pipe -> far end) + rim (far end of the outer -> far end of the inner) + inner (cavity, far end -> bore)
// Five named keys (gather blob, bubble, long drop, necked bulb, opened vase) are splined and resampled to the same point
// counts, each scaled so its glass volume equals the gather's; between keys the loop is blended point by point and scaled
// again (radii x sqrt(V0 / V)), so the volume stays constant and the wall thins as the bubble grows.
//
//   createGatherPlan(S, cfg) -> plan
//     plan.counts                    { no, nr, ni, n }
//     plan.profileAt(t)              { x, r, m, part, k, L, x0, rMax }  (Float64Array x/r/m; m = material coord 0 pipe .. 1 tip)
//     plan.radiiAt(prof, x)          { ro, ri }  outer / cavity radius at axial x (for the glow path and the bench light)
//     plan.table(t, n)               { x0, x1, ro[], ri[], m[] } n samples along the axis (bench shader uniforms)
//     plan.spinAt(t)                 pipe turn angle (rad, closed-form integral of a piecewise-linear rate)
//     plan.sagAt(t)                  droop of the far end (m, world down) while the turn pauses
//     plan.swingAt(t)                pipe pitch (rad, negative = glass end down) about the near rail
//     plan.tempAt(t, m)              temperature 0 (cold) .. ~1.15 (white-hot) at material coord m
//     plan.clarityAt(t)              0 hot .. 1 fully clear (whole piece, for lights / bench / caption accent)
//     plan.pulseAt(t)                { on, x, level } breath pulse travelling down the pipe
//     plan.flareAt(t)                furnace flare level (1 = idle)
//     plan.jacksAt(t)                { on, mode: "pinch" | "lip", tip:[x,y,z] (pipe frame), gapTip, gapBow, ... }
//     plan.extent(t)                 { x0, x1, r, sag } pipe-frame bounds of the glass (framing)
//     plan.events()                  [{ t, kind, ... }] for kit/schedule.scoreFromEvents
//     plan.fingerprint()             short hash of key results (Node vs page check)
import { clamp, smoothstep, ease as EASE } from "../../kit/time.js";

const toE = (e) => (typeof e === "function" ? e : EASE[e] || EASE.inOutSine);

/** keyed(keys) -> f(t): keys = [[t, value, ease?]] (value number); holds before the first / after the last key */
export function keyed(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
        return v0 + (v1 - v0) * toE(e)(u);
      }
    }
    return keys[keys.length - 1][1];
  };
}

// uniform Catmull-Rom through pts (open), `per` samples per span
function spline(pts, per = 20) {
  const out = [];
  const P = (k) => pts[Math.max(0, Math.min(pts.length - 1, k))];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    for (let s = 0; s < per; s++) {
      const u = s / per, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
const dist = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
// resample a polyline at n points evenly spaced by arc length (ends included)
function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const L = cum[cum.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1, u = clamp((s - cum[j]) / seg);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]);
  }
  return out;
}

/** glass volume of a closed loop (x[], r[]) revolved about the axis (Pappus on the polygon, closed back to the start) */
export function loopVolume(x, r) {
  let a = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += (r[i] + r[j]) * (x[i] * r[j] - x[j] * r[i]);
  }
  return Math.abs((2 * Math.PI * a) / 6);
}

/** keyLoop(G, name, c) -> { x, r } with counts.outer + counts.rim + counts.inner points; cavity radii scaled by c */
function keyLoop(G, name, c = 1) {
  const K = G.keys[name], C = G.counts;
  const outer = resample(spline(K.outer, 24), C.outer);
  const inner = resample(spline(K.inner, 24), C.inner).map((p, i, a) => (i === a.length - 1 ? p : [p[0], p[1] * c]));
  const Eo = outer[outer.length - 1], Ei = inner[0];
  const rim = [];
  if (K.open) {
    // semicircle from the outer end to the inner end, bulging along the outer surface's exit direction
    const c = [(Eo[0] + Ei[0]) / 2, (Eo[1] + Ei[1]) / 2], rho = dist(Eo, Ei) / 2;
    const e1 = [(Eo[0] - c[0]) / rho, (Eo[1] - c[1]) / rho];
    const pe = outer[outer.length - 2], tx = Eo[0] - pe[0], tr = Eo[1] - pe[1];
    let e2 = [-e1[1], e1[0]];
    if (e2[0] * tx + e2[1] * tr < 0) e2 = [e1[1], -e1[0]];
    for (let k = 1; k <= C.rim; k++) {
      const th = (k / (C.rim + 1)) * Math.PI;
      rim.push([c[0] + rho * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]), c[1] + rho * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1])]);
    }
  } else {
    for (let k = 1; k <= C.rim; k++) rim.push([Eo[0], 0]); // closed far end: the rim collapses onto the axis
  }
  const pts = [...outer, ...rim, ...inner];
  return { x: pts.map((p) => p[0]), r: pts.map((p) => Math.max(0, p[1])) };
}

/** scale radii by k, keeping the collar on the pipe and the bore at the bore radius */
function scaleLoop(x, r, k, G, C) {
  const out = new Float64Array(r.length);
  for (let i = 0; i < r.length; i++) out[i] = r[i] * k;
  out[0] = G.pipeR;
  out[C.outer + C.rim + C.inner - 1] = G.boreR;
  return out;
}

/**
 * createGatherPlan(S, cfg) -> plan (see header). S = STYLE_SPEC (uses S.gather, S.heat), cfg = timed config from the scene:
 *   { shape: [[t, keyName, ease]], spin: [[t, revPerSec]], sag: [[t, m, ease]], swing: [[t, rad, ease]],
 *     heat: { reheats: [{ t, dur, to }], cool: { t } }, pulse: { t0, t1, x0, x1 }, flare: [[t, level, ease]],
 *     jacks: { pinch: {...}, lip: {...} }, sound: {...} }
 */
export function createGatherPlan(S, cfg) {
  const G = S.gather, H = S.heat, C = G.counts;
  const no = C.outer, nr = C.rim, ni = C.inner, n = no + nr + ni;
  const part = new Uint8Array(n);
  const m = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i < no) { part[i] = 0; m[i] = i / (no - 1); }
    else if (i < no + nr) { part[i] = 1; m[i] = 1; }
    else { part[i] = 2; m[i] = 1 - (i - no - nr) / (ni - 1); }
  }
  // keys: the outer shape is designed; the CAVITY of each key is scaled (radially, factor c) so its glass volume equals the
  // gather's — the wall thickness is what the volume leaves. Bisection, fixed 40 steps (deterministic).
  const g0 = keyLoop(G, G.volumeKey);
  const V0 = loopVolume(g0.x, g0.r);
  const keys = {}, cavityScale = {}, minWall = {};
  for (const name of Object.keys(G.keys)) {
    let c = 1;
    if (name !== G.volumeKey) {
      let lo = 0.2, hi = 1.8;
      for (let it = 0; it < 40; it++) {
        const md = 0.5 * (lo + hi), L = keyLoop(G, name, md);
        if (loopVolume(L.x, L.r) > V0) lo = md; else hi = md; // more cavity -> less glass
      }
      c = 0.5 * (lo + hi);
    }
    const L = keyLoop(G, name, c);
    keys[name] = { x: Float64Array.from(L.x), r: Float64Array.from(L.r), V: loopVolume(L.x, L.r) };
    cavityScale[name] = c;
  }
  // smallest wall (outer minus cavity radius at the same x, where there is a cavity) per key, for the stats
  const wallOf = (K) => {
    let w = 9;
    for (let i = no + nr; i < n - 1; i++) {
      const xq = K.x[i], ri = K.r[i];
      if (ri < 0.004) continue;
      let j = 0;
      while (j < no - 2 && K.x[j + 1] < xq) j++;
      const u = clamp((xq - K.x[j]) / ((K.x[j + 1] - K.x[j]) || 1));
      w = Math.min(w, K.r[j] + (K.r[j + 1] - K.r[j]) * u - ri);
    }
    return w;
  };
  for (const name of Object.keys(keys)) minWall[name] = wallOf(keys[name]);
  const keyScale = cavityScale;

  // ---------------------------------------------------------------- shape over time
  const shape = cfg.shape; // [[t, key, ease]]
  function shapeMix(t) {
    if (t <= shape[0][0]) return [shape[0][1], shape[0][1], 0];
    for (let i = 1; i < shape.length; i++) {
      const [t1, k1, e] = shape[i];
      if (t <= t1) {
        const [t0, k0] = shape[i - 1];
        return [k0, k1, toE(e)(t1 > t0 ? (t - t0) / (t1 - t0) : 1)];
      }
    }
    const last = shape[shape.length - 1][1];
    return [last, last, 0];
  }
  // between keys the blended cavity is rescaled (factor c, the rim blending from 1 at the outer end to c at the inner end)
  // so the glass volume stays V0; the cavity is kept at least G.minWall inside the outer surface.
  const minW = G.minWall ?? 0.002;
  function cavityScaled(x, r0, c, out) {
    for (let i = 0; i < no; i++) out[i] = r0[i];
    for (let j = 0; j < nr; j++) out[no + j] = r0[no + j] * (1 + (c - 1) * ((j + 1) / (nr + 1)));
    let lo = 0;
    for (let i = no + nr; i < n - 1; i++) {
      let ri = r0[i] * c;
      const xq = x[i];
      if (xq >= x[0] && xq <= x[no - 1]) {
        // outer radius at xq (outer x ascending; inner x descending, so restart the scan from the left)
        lo = 0;
        let hi = no - 1;
        while (hi - lo > 1) { const md = (lo + hi) >> 1; if (x[md] <= xq) lo = md; else hi = md; }
        const ro = r0[lo] + (r0[hi] - r0[lo]) * clamp((xq - x[lo]) / ((x[hi] - x[lo]) || 1));
        ri = Math.min(ri, Math.max(0, ro - minW));
      }
      out[i] = ri;
    }
    out[n - 1] = r0[n - 1];
    return out;
  }
  let memoT = NaN, memoP = null;
  function profileAt(t) {
    if (t === memoT) return memoP;
    const [a, b, u] = shapeMix(t);
    const A = keys[a], B = keys[b];
    const x = new Float64Array(n), r0 = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = A.x[i] + (B.x[i] - A.x[i]) * u; r0[i] = A.r[i] + (B.r[i] - A.r[i]) * u; }
    let r = r0, k = 1;
    if (u > 0 && u < 1) {
      const tmp = new Float64Array(n);
      let lo = 0.3, hi = 3.0;
      for (let it = 0; it < 40; it++) {
        const md = 0.5 * (lo + hi);
        if (loopVolume(x, cavityScaled(x, r0, md, tmp)) > V0) lo = md; else hi = md;
      }
      k = 0.5 * (lo + hi);
      r = cavityScaled(x, r0, k, new Float64Array(n));
    }
    let L = -1e9, x0 = 1e9, rMax = 0;
    for (let i = 0; i < n; i++) { L = Math.max(L, x[i]); x0 = Math.min(x0, x[i]); rMax = Math.max(rMax, r[i]); }
    memoT = t;
    memoP = { x, r, m, part, k, L, x0, rMax, keys: [a, b, u] };
    return memoP;
  }
  /** radiiAt(prof, x) -> { ro, ri }: outer radius (outer curve, x ascending) and cavity radius (inner curve, x descending) */
  function radiiAt(P, xq) {
    let ro = 0, ri = 0;
    // outer: indices 0..no-1, x ascending (by design of the keys)
    if (xq >= P.x[0] && xq <= P.x[no - 1]) {
      let lo = 0, hi = no - 1;
      while (hi - lo > 1) { const md = (lo + hi) >> 1; if (P.x[md] <= xq) lo = md; else hi = md; }
      const s = P.x[hi] - P.x[lo] || 1, u = clamp((xq - P.x[lo]) / s);
      ro = P.r[lo] + (P.r[hi] - P.r[lo]) * u;
    } else if (xq > P.x[no - 1]) ro = P.r[no - 1];
    // inner: indices no+nr .. n-1, x descending
    const i0 = no + nr, i1 = n - 1;
    if (xq <= P.x[i0] && xq >= P.x[i1]) {
      let lo = i0, hi = i1;
      while (hi - lo > 1) { const md = (lo + hi) >> 1; if (P.x[md] >= xq) lo = md; else hi = md; }
      const s = P.x[lo] - P.x[hi] || 1, u = clamp((P.x[lo] - xq) / s);
      ri = P.r[lo] + (P.r[hi] - P.r[lo]) * u;
    }
    return { ro, ri: Math.min(ri, ro) };
  }
  /** materialAt(prof, x) -> m on the outer curve at axial x */
  function materialAt(P, xq) {
    if (xq <= P.x[0]) return 0;
    if (xq >= P.x[no - 1]) return 1;
    let lo = 0, hi = no - 1;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (P.x[md] <= xq) lo = md; else hi = md; }
    const s = P.x[hi] - P.x[lo] || 1;
    return m[lo] + (m[hi] - m[lo]) * clamp((xq - P.x[lo]) / s);
  }
  /** table(t, N) -> N samples of outer/cavity radius + material coord along the axis (for the bench light shader) */
  function table(t, N) {
    const P = profileAt(t);
    const x0 = P.x[0], x1 = P.L, ro = new Float64Array(N), ri = new Float64Array(N), mm = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const xq = x0 + ((x1 - x0) * j) / (N - 1);
      const R = radiiAt(P, xq);
      ro[j] = R.ro; ri[j] = R.ri; mm[j] = materialAt(P, xq);
    }
    return { x0, x1, ro, ri, m: mm };
  }

  // ---------------------------------------------------------------- turning: angle = closed-form integral of a piecewise-linear rate
  const SP = cfg.spin; // [[t, revPerSec]]
  const spinCum = [0];
  for (let i = 1; i < SP.length; i++) spinCum.push(spinCum[i - 1] + 0.5 * (SP[i][1] + SP[i - 1][1]) * (SP[i][0] - SP[i - 1][0]));
  function spinRev(t) {
    if (t <= SP[0][0]) return SP[0][1] * (t - SP[0][0]);
    for (let i = 1; i < SP.length; i++) {
      if (t <= SP[i][0]) {
        const [t0, w0] = SP[i - 1], [t1, w1] = SP[i];
        const d = t - t0, a = t1 > t0 ? (w1 - w0) / (t1 - t0) : 0;
        return spinCum[i - 1] + w0 * d + 0.5 * a * d * d;
      }
    }
    const [tl, wl] = SP[SP.length - 1];
    return spinCum[SP.length - 1] + wl * (t - tl);
  }
  const spinAt = (t) => 2 * Math.PI * spinRev(t);
  const spinRate = keyed(SP.map(([t, w]) => [t, w, "linear"]));

  const sagAt = keyed(cfg.sag);
  const swingAt = keyed(cfg.swing);
  const flareAt = keyed(cfg.flare);

  // ---------------------------------------------------------------- heat: exponential cooling, two reheats, a final drain from the tip
  const HT = cfg.heat;
  const reheats = HT.reheats.slice().sort((a, b) => a.t - b.t);
  // base temperature (before the final cool-down): exponential decay toward H.floor; each reheat eases up to `to`, then decays
  function baseTemp(t) {
    let T0 = H.start, ts = 0, tau = H.tau;
    for (const R of reheats) {
      if (t < R.t) break;
      const peak = R.t + R.dur;
      if (t < peak) {
        const free = H.floor + (T0 - H.floor) * Math.exp(-(t - ts) / tau);
        return free + (R.to - free) * smoothstep(R.t, peak, t);
      }
      T0 = R.to; ts = peak; tau = R.tau ?? H.tau;
    }
    return H.floor + (T0 - H.floor) * Math.exp(-(t - ts) / tau);
  }
  const coolT = HT.cool.t, coolDelay = H.drain, coolTau = H.coolTau;
  const Tc = baseTemp(coolT);
  /** tempAt(t, mq): mq = material coord (0 at the pipe, 1 at the far end) */
  function tempAt(t, mq) {
    const tip = 1 - H.tipCool * mq * mq;
    if (t <= coolT) return baseTemp(t) * tip;
    const lag = coolDelay * (1 - mq);
    const dt = Math.max(0, t - coolT - lag);
    return Tc * tip * Math.exp(-dt / coolTau);
  }
  /** clarityAt(t): 0 (glowing) .. 1 (clear) averaged over the piece */
  function clarityAt(t) {
    let s = 0;
    for (let j = 0; j <= 8; j++) s += smoothstep(H.clearHi, H.clearLo, tempAt(t, j / 8));
    return s / 9;
  }

  // ---------------------------------------------------------------- breath pulse down the pipe
  const PU = cfg.pulse;
  function pulseAt(t) {
    const u = (t - PU.t0) / (PU.t1 - PU.t0);
    if (u < -0.05 || u > 1.25) return { on: false, x: PU.x1, level: 0 };
    const uc = clamp(u);
    const x = PU.x0 + (PU.x1 - PU.x0) * uc;
    const level = smoothstep(-0.05, 0.1, u) * (1 - smoothstep(1.0, 1.25, u));
    return { on: level > 0.001, x, level };
  }

  // ---------------------------------------------------------------- jacks: pinch the neck, then open the lip
  const J = cfg.jacks, JS = S.jacks;
  /** neckX(t) -> x of the narrowest outer point between the collar and the bulb (the jack line) */
  function neckX() { return J.pinch.x; }
  function jacksAt(t) {
    const P = profileAt(t);
    const half = JS.bladeT / 2;
    // --- pinch: blades along -z (bow behind the glass), straddling the neck above and below
    const PJ = J.pinch;
    if (t >= PJ.in[0] && t <= PJ.away[1]) {
      const xN = PJ.x, ro = radiiAt(P, xN).ro;
      const contact = 2 * (ro + half);
      const openGap = contact + PJ.openExtra;
      // descend from above, close to contact, follow the neck, open, rise away
      const down = smoothstep(PJ.in[0], PJ.in[1], t), up = smoothstep(PJ.away[0], PJ.away[1], t);
      const close = smoothstep(PJ.close[0], PJ.close[1], t) * (1 - smoothstep(PJ.release[0], PJ.release[1], t));
      const gap = openGap + (contact - openGap) * close;
      const lift = (1 - EASE.outCubic(down)) * PJ.lift + EASE.inCubic(up) * PJ.lift;
      return { on: true, mode: "pinch", tip: [xN, lift, PJ.tipZ], gapAt: gap, sAt: PJ.tipZ, contact: close > 0.98 };
    }
    // --- lip: blades along +x (bow to the right), entering the far end, spreading the opening
    const LJ = J.lip;
    if (t >= LJ.in[0] && t <= LJ.out[1]) {
      const L = P.L;
      const inn = EASE.outCubic(smoothstep(LJ.in[0], LJ.in[1], t)), out = EASE.inCubic(smoothstep(LJ.out[0], LJ.out[1], t));
      // the closed tips touch the closed end, then push in as the opening forms
      const push = smoothstep(LJ.spread[0], LJ.spread[0] + 0.45 * (LJ.spread[1] - LJ.spread[0]), t) * (1 - smoothstep(LJ.out[0], LJ.out[0] + 0.3, t));
      const xTip = L - LJ.depth * push + (1 - inn) * LJ.reach + out * LJ.reach;
      // spread = the cavity radius just inside the lip (outer blade faces touch the inside of the opening)
      const ri = radiiAt(P, Math.min(xTip + 0.004, L - 0.001)).ri;
      const spread = smoothstep(LJ.spread[0], LJ.spread[1], t) * (1 - smoothstep(LJ.out[0], LJ.out[0] + 0.25, t) * 0.4);
      const gap = Math.max(0, 2 * (ri - half) * spread);
      return { on: true, mode: "lip", tip: [xTip, 0, 0], gapAt: gap, sAt: 0, contact: spread > 0.05 };
    }
    return { on: false, mode: "none", tip: [0, 1, 0], gapAt: 0, sAt: 0, contact: false };
  }

  // ---------------------------------------------------------------- bounds (pipe frame)
  function extent(t) {
    const P = profileAt(t);
    return { x0: P.x[0], x1: P.L, r: P.rMax, sag: sagAt(t) };
  }

  // ---------------------------------------------------------------- sound events (times from the config keys only)
  function events() {
    const E = [], SN = cfg.sound;
    for (const e of SN.cues) E.push({ ...e });
    return E.sort((a, b) => a.t - b.t);
  }

  function fingerprint() {
    let h = 2166136261 >>> 0;
    const mix = (v) => { const q = Math.round(v * 1e6) | 0; h = Math.imul(h ^ q, 16777619) >>> 0; };
    for (const t of [0, 2.0, 4.6, 7.0, 8.5, 10.6, 13.0, 14.9]) {
      const P = profileAt(t);
      for (let i = 0; i < n; i += 7) { mix(P.x[i]); mix(P.r[i]); }
      mix(spinAt(t)); mix(tempAt(t, 0.5)); mix(sagAt(t)); mix(swingAt(t));
    }
    return h.toString(16);
  }

  const stats = {
    V0_cm3: +(V0 * 1e6).toFixed(1),
    cavityScale: Object.fromEntries(Object.entries(keyScale).map(([k, v]) => [k, +v.toFixed(3)])),
    minWall_mm: Object.fromEntries(Object.entries(minWall).map(([k, v]) => [k, +(v * 1000).toFixed(1)])),
    Tcool: +Tc.toFixed(3),
  };

  return {
    counts: { no, nr, ni, n }, V0, keys, stats,
    profileAt, radiiAt, materialAt, table, spinAt, spinRate, sagAt, swingAt, tempAt, baseTemp, clarityAt, pulseAt, flareAt,
    jacksAt, neckX, extent, events, fingerprint,
  };
}
