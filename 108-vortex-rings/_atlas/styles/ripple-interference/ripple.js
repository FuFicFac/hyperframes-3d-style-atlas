// styles/ripple-interference/ripple.js — the ONE plan of the "Ripple Interference" style (pure: no THREE, no window,
// no DOM; Node-safe). Two point sources in a shallow tank; the water height is their exact sum, a closed form in t:
//
//   h(x, z, t) = sum_i  A(r_i) * env_i(tau_i) * cos(psi_i(tau_i)),     tau_i = t - r_i / c   (retarded time)
//   A(r)       = A0 / sqrt(1 + r / r0)                                 (ring spreading; no wall reflections)
//   psi_i(t)   = omega * t - phi_i(t)                                  (drive phase; phi_1 = 0, phi_2 slides 0 -> pi)
//   env_i(t)   = smooth ramp from the source's start time                (the first ring is the wave front)
//
// The SAME numbers are injected into the water shader as GLSL (glsl()), so the picture, the corks, the dippers and every
// tap of the score come from one function. Because the phase slide is evaluated at the retarded time, a change of timing
// at the dipper travels outward at the wave speed: the calm lines sweep across the tank from the sources.
import { clamp, TAU } from "../../kit/time.js";

const smooth01 = (u) => { const c = clamp(u, 0, 1); return c * c * (3 - 2 * c); };   // = GLSL smoothstep(0, 1, u)

/**
 * createPlan({ wave, tank, timing: { starts: [t1, t2], slide: { t0, t1, to } }, corks: { z }, end }) -> plan
 *   wave = spec.wave { freq, lambda, A0, r0, ramp, sep, srcZ, dipAmp }   tank = spec.tank (inner half sizes, water level)
 *   plan = { omega, k, c, sources: [{ i, x, z, start }], phi(i, t), psi(i, t), env(i, t), height(x, z, t),
 *            grad(x, z, t) -> [dh/dx, dh/dz], dipper(i, t) -> 0..1 stroke (0 top, 1 bottom) and its amplitude,
 *            corks: [{ id, x, z, role }], taps: [[t...] per source], ampAt(x, z, t0, t1) -> max |h| over a window,
 *            events(), glsl(), timing, end }
 */
export function createPlan({ wave: W, tank: T, timing, corks: CK, end }) {
  const omega = TAU * W.freq, c = W.lambda * W.freq, k = TAU / W.lambda;
  const sources = timing.starts.map((start, i) => ({ i, x: (i ? 1 : -1) * W.sep / 2, z: W.srcZ, start }));
  const S = timing.slide;
  const phi = (i, t) => (i === 1 ? S.to * smooth01((t - S.t0) / (S.t1 - S.t0)) : 0);
  const psi = (i, t) => omega * t - phi(i, t);
  const env = (i, t) => smooth01((t - sources[i].start) / W.ramp);
  const amp = (r) => W.A0 / Math.sqrt(1 + r / W.r0);
  const height = (x, z, t) => {
    let h = 0;
    for (const s of sources) {
      const r = Math.hypot(x - s.x, z - s.z), tau = t - r / c;
      h += amp(r) * env(s.i, tau) * Math.cos(psi(s.i, tau));
    }
    return h;
  };
  const E = 0.01;
  const grad = (x, z, t) => [(height(x + E, z, t) - height(x - E, z, t)) / (2 * E), (height(x, z + E, t) - height(x, z - E, t)) / (2 * E)];

  // the dipper rides the drive phase: top at psi = 0, bottom (the tap) at psi = pi; it rests at the top before its start
  const dipper = (i, t) => ({ stroke: 0.5 - 0.5 * Math.cos(psi(i, t)), on: env(i, t) });

  // corks: A on the centre line (equal paths: adds up in step, cancels out of step); B on the first calm line of the
  // in-step pattern (paths differ by half a wavelength: cancels in step, adds up once source 2 is half a cycle late)
  const [s1, s2] = sources;
  const dr = (x, z) => Math.hypot(x - s1.x, z - s1.z) - Math.hypot(x - s2.x, z - s2.z);
  let lo = 0, hi = T.halfX;
  for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (dr(m, CK.z) < W.lambda / 2) lo = m; else hi = m; }
  const corks = [
    { id: "A", x: 0, z: CK.z, role: "centre line: equal paths" },
    { id: "B", x: (lo + hi) / 2, z: CK.z, role: "half-wavelength line" },
  ];

  // taps: the bottom of each stroke, psi_i(t) = pi + 2 pi m (psi is monotonic: the slide is slower than the drive)
  const taps = sources.map((s) => {
    const out = [], dt = 1 / 240;
    let tPrev = Math.max(s.start, -1), fPrev = Math.floor((psi(s.i, tPrev) - Math.PI) / TAU);
    for (let t = tPrev + dt; t <= end + 1e-9; t += dt) {
      const f = Math.floor((psi(s.i, t) - Math.PI) / TAU);
      if (f !== fPrev) {
        let a = t - dt, b = t;                                  // refine the crossing by bisection
        for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if (Math.floor((psi(s.i, m) - Math.PI) / TAU) === fPrev) a = m; else b = m; }
        const tt = (a + b) / 2;
        if (tt >= 0 && env(s.i, tt) > 0.05) out.push(+tt.toFixed(4));
        fPrev = f;
      }
    }
    return out;
  });

  /** ampAt(x, z, t0, t1): the largest |h| at a point over [t0, t1] (a check: does a cork bob or sit still?) */
  const ampAt = (x, z, t0, t1) => { let m = 0; for (let t = t0; t <= t1; t += 1 / 120) m = Math.max(m, Math.abs(height(x, z, t))); return m; };

  const events = () => {
    const ev = [{ t: 0, kind: "bed", dur: end }];
    taps.forEach((list, i) => list.forEach((t) => ev.push({ t, kind: "tap", i, x: sources[i].x })));
    ev.push({ t: sources[1].start, kind: "join", x: sources[1].x });
    ev.push({ t: S.t0, kind: "slide", dur: S.t1 - S.t0, x: sources[1].x });
    return ev.sort((a, b) => a.t - b.t);
  };

  // GLSL twin of height(): constants baked in, uT supplied per frame
  const f = (x) => { const s = String(+x.toPrecision(9)); return /[.eE]/.test(s) ? s : s + ".0"; };
  const glsl = () => /* glsl */ `
float rippleSmooth(float u) { float c = clamp(u, 0.0, 1.0); return c * c * (3.0 - 2.0 * c); }
float rippleSrc(vec2 p, vec2 s, float start, float slide, float t) {
  float r = length(p - s), tau = t - r / ${f(c)};
  float ph = slide * ${f(S.to)} * rippleSmooth((tau - ${f(S.t0)}) / ${f(S.t1 - S.t0)});
  float a = ${f(W.A0)} / sqrt(1.0 + r / ${f(W.r0)});
  return a * rippleSmooth((tau - start) / ${f(W.ramp)}) * cos(${f(omega)} * tau - ph);
}
float rippleH(vec2 p, float t) {
  return rippleSrc(p, vec2(${f(s1.x)}, ${f(s1.z)}), ${f(s1.start)}, 0.0, t) + rippleSrc(p, vec2(${f(s2.x)}, ${f(s2.z)}), ${f(s2.start)}, 1.0, t);
}`;

  return { omega, k, c, sources, phi, psi, env, amp, height, grad, dipper, corks, taps, ampAt, events, glsl, timing, end, wave: W, tank: T };
}

/** rippleVoices(spec.sound) -> voices for kit/schedule.scoreFromEvents */
export function rippleVoices(S) {
  return {
    bed: (e) => [{ type: "pad", dur: e.dur, gain: S.pad.gain, root: S.pad.root, chord: S.pad.chord, brightness: S.pad.brightness, attack: 0.6, release: 1.4 }],
    tap: (e) => [
      { type: "marimba", hz: S.tap.hz[e.i], gain: S.tap.gain, dur: S.tap.dur, decay: S.tap.decay, mallet: S.tap.mallet },
      { type: "bubble", gain: S.tap.drip, pitch: e.i ? 1.25 : 1, offset: 0.005 },
    ],
    join: () => [{ type: "clack", gain: S.join.gain, pitch: 1.3 }],
    slide: (e) => [{ type: "whir", dur: e.dur, hz: S.slide.hz, hz2: S.slide.hz2, gain: S.slide.gain }],
  };
}

/** panOf(tank) -> event -> stereo pan from the source's x */
export const panOf = (T) => (e) => (e.x === undefined ? 0 : clamp(e.x / T.halfX, -1, 1) * 0.6);
