// styles/cymatics/chladni.js — the Chladni-plate planner for "Cymatics". PURE: no THREE, no window, no DOM (Node-safe),
// so scene.config.js imports it for SCORE and framing, and style.js reads the very same plan for the picture.
//
// Plate: a square free-edged plate, plate coords x, y in [0, 1]. Mode (m, n, sign) displacement:
//   w(x, y) = cos(n pi x) cos(m pi y) + sign * cos(m pi x) cos(n pi y)        (|w| <= 2; nodal lines where w = 0)
//
// Grains: a seeded scatter (stage 0), then for every mode k a SETTLED position P_k,i, precomputed once: a seeded start
// projected onto the zero set of w_k by damped Newton steps (p -= w grad w / |grad w|^2, step-clamped), then pushed a
// seeded gaussian distance across the line so lines have width. Grain i at time t (closed form, nothing accumulated):
//   k = last mode started by t;  u = clamp((t - t_k - delay_k,i) / dur_k,i)
//   p = lerp(S_k,i, P_k,i, outCubic(u)) + perpendicular dance * sin(pi u)
//   S_k,i = the grain's position at t_k under the previous stage (precomputed from the plan, so mid-flight retargets are
//           continuous); hop = toneEnv(t) * |w_k(p)| / 2 * |sin(pi (hopHz_i t + phase_i))| — antinodes bounce, nodes sit still.
// A seeded few "stragglers" start late and travel slowly, so a locked figure still has a few grains walking in.
// Sound comes from the same mode list: one sustained tone per mode at its hz, a sand hiss over each gather, a tick + a
// soft chime when the figure locks (lockAt = when `lockShare` of the grains have arrived).
import { clamp, lerp, smoothstep, rng, ease } from "../../kit/time.js";

const PI = Math.PI;

/** w(mode, x, y) -> displacement (|w| <= 2) */
export function displacement(md, x, y) {
  const { m, n } = md, s = md.sign ?? 1;
  return Math.cos(n * PI * x) * Math.cos(m * PI * y) + s * Math.cos(m * PI * x) * Math.cos(n * PI * y);
}
/** grad w -> [dw/dx, dw/dy] */
export function gradient(md, x, y) {
  const { m, n } = md, s = md.sign ?? 1;
  const cnx = Math.cos(n * PI * x), snx = Math.sin(n * PI * x), cmy = Math.cos(m * PI * y), smy = Math.sin(m * PI * y);
  const cmx = Math.cos(m * PI * x), smx = Math.sin(m * PI * x), cny = Math.cos(n * PI * y), sny = Math.sin(n * PI * y);
  return [
    -n * PI * snx * cmy - s * m * PI * smx * cny,
    -m * PI * cnx * smy - s * n * PI * cmx * sny,
  ];
}

/** settle one start point onto the nodal set of `md`; returns [x, y, residual|w|] */
export function settlePoint(md, x, y, { iters = 32, maxStep = 0.025, margin = 0.012 } = {}) {
  for (let k = 0; k < iters; k++) {
    const w = displacement(md, x, y), [gx, gy] = gradient(md, x, y);
    const g2 = gx * gx + gy * gy + 1e-6;
    let dx = (-w * gx) / g2, dy = (-w * gy) / g2;
    const L = Math.hypot(dx, dy);
    if (L > maxStep) { dx *= maxStep / L; dy *= maxStep / L; }
    x = clamp(x + dx * 0.85, margin, 1 - margin);
    y = clamp(y + dy * 0.85, margin, 1 - margin);
  }
  return [x, y, Math.abs(displacement(md, x, y))];
}

/**
 * createPlan(opts) -> plan
 *   opts: { grains, seed, margin, spread (plate units, gaussian sd across a line), modes: [{ id, m, n, sign, t, hz }],
 *           move: { delay: [a, b], dur: [a, b], dance, danceHz: [a, b] }, straggle: { share, delay: [a, b], dur: [a, b] },
 *           hop: { hz: [a, b], attack }, lockShare, end }
 */
export function createPlan(o) {
  const N = o.grains, r = rng(o.seed ?? 53);
  const margin = o.margin ?? 0.012;
  const modes = o.modes.map((md, k) => ({ sign: 1, ...md, k: k + 1 }));
  const mv = { delay: [0, 0.35], dur: [0.9, 1.5], dance: 0.012, danceHz: [5, 9], ...(o.move ?? {}) };
  const st = { share: 0.04, delay: [0.6, 2.4], dur: [1.6, 3.2], ...(o.straggle ?? {}) };
  const hp = { hz: [3.5, 7.5], attack: 0.25, ...(o.hop ?? {}) };
  const end = o.end ?? Infinity;
  const K = modes.length;

  // stage 0: seeded scatter
  const P = [new Float32Array(N * 2)];
  for (let i = 0; i < N; i++) { P[0][2 * i] = r.range(margin, 1 - margin); P[0][2 * i + 1] = r.range(margin, 1 - margin); }
  // settled positions per mode
  for (const md of modes) {
    const rr = r.fork(1000 + md.k), A = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      let best = null;
      for (let tries = 0; tries < 5; tries++) {
        const p = settlePoint(md, rr.range(0, 1), rr.range(0, 1), { margin });
        if (!best || p[2] < best[2]) best = p;
        if (p[2] < 0.01) break;
      }
      // push across the line (along the gradient) so lines have width
      const [gx, gy] = gradient(md, best[0], best[1]), gl = Math.hypot(gx, gy) + 1e-6;
      const off = rr.gaussian(0, o.spread ?? 0.006);
      A[2 * i] = clamp(best[0] + (gx / gl) * off, margin, 1 - margin);
      A[2 * i + 1] = clamp(best[1] + (gy / gl) * off, margin, 1 - margin);
    }
    P.push(A);
  }
  // per grain per mode timing + per grain dance/hop constants
  const delay = modes.map(() => new Float32Array(N)), dur = modes.map(() => new Float32Array(N));
  const rt = r.fork(7);
  const strag = new Uint8Array(N);
  for (let i = 0; i < N; i++) strag[i] = rt.chance(st.share) ? 1 : 0;
  for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) {
    if (strag[i]) { delay[k][i] = rt.range(st.delay[0], st.delay[1]); dur[k][i] = rt.range(st.dur[0], st.dur[1]); }
    else { delay[k][i] = rt.range(mv.delay[0], mv.delay[1]); dur[k][i] = rt.range(mv.dur[0], mv.dur[1]); }
  }
  const danceHz = new Float32Array(N), dancePh = new Float32Array(N), hopHz = new Float32Array(N), hopPh = new Float32Array(N), danceAmp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    danceHz[i] = rt.range(mv.danceHz[0], mv.danceHz[1]); dancePh[i] = rt.next();
    hopHz[i] = rt.range(hp.hz[0], hp.hz[1]); hopPh[i] = rt.next();
    danceAmp[i] = rt.range(0.4, 1.2) * mv.dance;
  }
  // start positions S_k (position at t_k under the previous stage), computed in order
  const S = [null];
  const posAt = (k, i, t) => {
    // position under stage k (k >= 1) at time t, plus the dance offset; k = 0 -> scatter
    if (k === 0) return [P[0][2 * i], P[0][2 * i + 1], 0];
    const md = modes[k - 1], s = S[k];
    const u = clamp((t - md.t - delay[k - 1][i]) / dur[k - 1][i]);
    const e = ease.outCubic(u);
    const sx = s[2 * i], sy = s[2 * i + 1], tx = P[k][2 * i], ty = P[k][2 * i + 1];
    let x = lerp(sx, tx, e), y = lerp(sy, ty, e);
    if (u > 0 && u < 1) {
      const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy) + 1e-6;
      const a = danceAmp[i] * Math.sin(PI * u) * Math.sin(2 * PI * (danceHz[i] * t + dancePh[i]));
      x += (-dy / L) * a; y += (dx / L) * a;
    }
    return [x, y, u];
  };
  for (let k = 1; k <= K; k++) {
    const A = new Float32Array(N * 2), tk = modes[k - 1].t;
    for (let i = 0; i < N; i++) { const p = posAt(k - 1, i, tk); A[2 * i] = p[0]; A[2 * i + 1] = p[1]; }
    S.push(A);
  }
  // lock times: when lockShare of the grains have arrived
  const lockShare = o.lockShare ?? 0.9;
  for (let k = 0; k < K; k++) {
    const arr = Array.from({ length: N }, (_, i) => delay[k][i] + dur[k][i]).sort((a, b) => a - b);
    modes[k].lockAt = +(modes[k].t + arr[Math.floor(lockShare * (N - 1))]).toFixed(4);
    modes[k].off = k + 1 < K ? modes[k + 1].t : end;
  }

  const stageAt = (t) => { let k = 0; for (let j = 0; j < K; j++) if (t >= modes[j].t) k = j + 1; return k; };
  /** tone envelope 0..1 of the plate drive at t (rises over hop.attack from each mode start, falls at `end`) */
  const toneEnv = (t) => {
    const k = stageAt(t);
    if (!k) return 0;
    return smoothstep(modes[0].t, modes[0].t + hp.attack, t) * (1 - smoothstep(end - 0.4, end, t));
  };

  /**
   * positionsAt(t, out Float32Array(3N)) -> out: [x, y, hop] per grain; x, y plate coords [0,1], hop 0..1
   * (multiply by the style's hop height). Pure function of t.
   */
  function positionsAt(t, out = new Float32Array(N * 3)) {
    const k = stageAt(t), env = toneEnv(t), md = k ? modes[k - 1] : null;
    for (let i = 0; i < N; i++) {
      const p = posAt(k, i, t);
      out[3 * i] = p[0]; out[3 * i + 1] = p[1];
      if (md && env > 0) {
        const a = Math.min(1, Math.abs(displacement(md, p[0], p[1])) / 2);
        out[3 * i + 2] = env * a * Math.abs(Math.sin(PI * (hopHz[i] * t + hopPh[i])));
      } else out[3 * i + 2] = 0;
    }
    return out;
  }

  /** mode shape blend at t for the plate flex: [{ mode, weight }] (crossfades over `fade` s after each mode start) */
  function shapeAt(t, fade = 0.35) {
    const k = stageAt(t);
    if (!k) return [];
    const env = toneEnv(t), cur = modes[k - 1], f = smoothstep(cur.t, cur.t + fade, t);
    const out = [{ mode: cur, weight: env * f }];
    if (k > 1 && f < 1) out.push({ mode: modes[k - 2], weight: env * (1 - f) });
    return out;
  }

  /** the mode whose tone is sounding at t (null before the first) */
  const modeAt = (t) => { const k = stageAt(t); return k ? modes[k - 1] : null; };

  /** sound events: tone per mode, hiss over each gather, lock per figure */
  function events() {
    const ev = [];
    for (const md of modes) {
      ev.push({ kind: "tone", t: md.t, hz: md.hz, dur: Math.min(md.off, end) - md.t, last: md.k === K });
      ev.push({ kind: "hiss", t: md.t + 0.04, dur: Math.max(0.4, md.lockAt - md.t), k: md.k });
      ev.push({ kind: "lock", t: md.lockAt, hz: md.hz, k: md.k });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  return { n: N, modes, settled: P, start: S, straggler: strag, positionsAt, shapeAt, modeAt, toneEnv, stageAt, events, displacement };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function chladniVoices(SND) {
  return {
    tone: (e) => [{ type: "pad", bus: "sfx", root: e.hz, chord: [0], dur: e.dur + SND.tone.overlap, attack: SND.tone.attack, release: e.last ? SND.tone.releaseLast : SND.tone.release, brightness: SND.tone.brightness, gain: SND.tone.gain * Math.pow(220 / e.hz, SND.tone.tilt) }],
    hiss: (e) => [
      { type: "rustle", dur: e.dur, density: SND.hiss.density, pitch: SND.hiss.pitch, gain: SND.hiss.gain },
      { type: "whoosh", dir: "out", dur: Math.min(1.2, e.dur), q: 0.8, pitch: 1.4, gain: SND.hiss.whoosh },
    ],
    lock: (e) => [
      { type: "tick", gain: SND.lock.tick, pitch: 1.6 },
      { type: "chime", dur: 1.6, pitch: (e.hz * 2) / 880, gain: SND.lock.chime },
    ],
  };
}
