// styles/risograph/riso.js — the risograph planner. Plain data in, plain data out: no THREE, no window, no DOM.
// Imported by style.js (picture) AND by the demo's scene.config.js (SCORE, camera targets) so sound and picture
// read one plan. Everything here is closed-form in t; nothing steps.
//
//   POSTER                 the original artwork: a big sun over sea and mountains with one bird, as shapes with a tone
//                          (0..1 dot value) per ink [pink, blue, yellow]. Sheet-local metres, y = picture up.
//   posterTones(P, x, y)   -> [pink, blue, yellow] tones at a sheet point (hard edges; the JS twin of the shader)
//   posterGLSL(P)          -> GLSL source of `vec3 posterTone(vec2 p, float aa)` built from the SAME numbers
//                             (anti-aliased edges, aa = one pixel in sheet metres)
//   planRiso(spec, timing) -> { passes, drumAt(t), lineAt(i, t), regAt(i, t), uniformsAt(t), events(), stats, fingerprint }
//   risoVoices(spec)       -> kit/schedule.scoreFromEvents voice table
//   sheetToWorld(spec, sx, sy, h) -> world [x, y, z] of a sheet point (sheet x -> +X, sheet y -> -Z, tilted about Y)
//
// Colour model (art-directed, the standard multiply approximation of overprinting transparent inks):
//   colour = paper x PRODUCT_i (1 - coverage_i x density_i x (1 - ink_i)), in linear RGB.
import { clamp, lerp, ease, spring } from "../../kit/time.js";

export const INK_IDS = ["pink", "blue", "yellow"];

/** The poster. Tones are [pink, blue, yellow]; every number here is also baked into the GLSL (posterGLSL). */
export const POSTER = {
  area: [-1.4, -0.84, 1.4, 0.84], // printed picture area (x0, y0, x1, y1); paper margin outside
  horizon: -0.12,
  sky: {
    // 6 stepped bands from the horizon up (7 edges); stepped bands give crisp horizontal edges that show misregistration
    edges: [-0.12, -0.01, 0.11, 0.25, 0.41, 0.6, 0.84],
    tones: [
      [0.78, 0.0, 0.9],
      [0.66, 0.0, 0.72],
      [0.54, 0.0, 0.52],
      [0.42, 0.14, 0.34],
      [0.32, 0.3, 0.16],
      [0.24, 0.46, 0.0],
    ],
  },
  // sun; gaps = retro stripes [offset below the centre in radii, half thickness] across its visible lower part
  sun: { c: [0.42, 0.17], r: 0.5, gaps: [[-0.24, 0.006], [-0.08, 0.009], [0.06, 0.012], [0.18, 0.015]], tone: [1, 0, 1] },
  // ridges: peaks [x, height above horizon, slope]; the shaded facet lies right of a fold line that runs from the peak
  // down and to the right (x_fold = x_peak + foldSlant * (peak top - y))
  foldSlant: 0.42,
  far: { peaks: [[-1.15, 0.19, 0.55], [-0.5, 0.29, 0.72], [0.12, 0.21, 0.6], [0.78, 0.33, 0.78], [1.3, 0.22, 0.62]], lit: [0.4, 0.52, 0.3], shade: [0.5, 0.72, 0.3] },
  near: { peaks: [[-1.3, 0.33, 0.95], [-0.8, 0.45, 0.85], [-0.32, 0.17, 0.8]], lit: [0.0, 0.86, 0.86], shade: [0.52, 0.94, 0.86] },
  // sea: body tone + wave lines in rows that widen toward the viewer (rho = rows * (depth / D)^k)
  sea: { tone: [0.14, 0.74, 0.26], line: [0.6, 0.32, 0.24], rows: 12, k: 0.7, lineFrac: 0.22, wobble: 0.16, wobbleFreq: 6.5 },
  glint: { tone: [1, 0, 0.95], halfW: 0.3, near: 0.25, jitter: 0.1, skip: 0.18 }, // sun's reflection: dashes between the lines
  bird: { c: [0.05, 0.42], span: 0.17, tone: [1, 1, 1] },
  marks: { at: [[-1.5, 0.0], [1.5, 0.0]], r: 0.042, w: 0.0048, arm: 0.078, tone: [1, 1, 1] },
};

// ---------------------------------------------------------------- shared little maths (same formulas in GLSL)
const fract = (x) => x - Math.floor(x);
/** golden-ratio row hash: identical in JS and GLSL to float precision (no sin-based hash) */
const rowHash = (r, s) => fract(r * 0.6180339887 + s);
const ridge = (peaks, x) => {
  let best = -1e9, bx = 0, bh = 0;
  for (const [px, h, s] of peaks) { const v = h - s * Math.abs(x - px); if (v > best) { best = v; bx = px; bh = h; } }
  return [best, bx, bh];
};
const seaRho = (S, P, y) => {
  const D = P.horizon - P.area[1];
  const d = Math.max(P.horizon - y, 0);
  return S.rows * Math.pow(Math.max(d / D, 1e-4), S.k);
};

/** posterTones(P, x, y) -> [pink, blue, yellow] at sheet point (x, y). Hard edges (planning, stats, tests). */
export function posterTones(P, x, y) {
  const M = P.marks;
  let mark = 0;
  for (const [mx, my] of M.at) {
    const dx = x - mx, dy = y - my, r = Math.hypot(dx, dy);
    if (Math.abs(r - M.r) < M.w || (Math.abs(dy) < M.w && Math.abs(dx) < M.arm) || (Math.abs(dx) < M.w && Math.abs(dy) < M.arm)) mark = 1;
  }
  const [x0, y0, x1, y1] = P.area;
  if (x < x0 || x > x1 || y < y0 || y > y1) return mark ? M.tone.slice() : [0, 0, 0];
  // sky bands
  const E = P.sky.edges;
  let k = 0;
  while (k < P.sky.tones.length - 1 && y >= E[k + 1]) k++;
  let t = P.sky.tones[k].slice();
  // sun with gaps
  const S = P.sun;
  let inSun = Math.hypot(x - S.c[0], y - S.c[1]) < S.r;
  for (const [g, h] of S.gaps) if (Math.abs(y - (S.c[1] - S.r * g)) < h) inSun = false;
  if (inSun) t = S.tone.slice();
  // far + near ranges (faceted)
  for (const R of [P.far, P.near]) {
    const [h, bx, bh] = ridge(R.peaks, x);
    const fold = bx + P.foldSlant * (P.horizon + bh - y);
    if (y < P.horizon + h) t = (x > fold ? R.shade : R.lit).slice();
  }
  // sea, wave lines, glint
  if (y < P.horizon) {
    const Q = P.sea, G = P.glint;
    const rho = seaRho(Q, P, y);
    const rw = rho + Q.wobble * Math.sin(x * Q.wobbleFreq + rho * 2.3);
    const dist = Math.abs(fract(rw + 0.5) - 0.5);
    const line = dist < Q.lineFrac / 2;
    t = (line ? Q.line : Q.tone).slice();
    const row = Math.floor(rw), depth = (P.horizon - y) / (P.horizon - P.area[1]);
    const hw = G.halfW * (G.near + (1 - G.near) * depth) * (0.55 + 0.45 * rowHash(row, 0.37));
    const off = (rowHash(row, 0.71) - 0.5) * 2 * G.jitter;
    if (!line && rowHash(row, 0.13) > G.skip && Math.abs(x - S.c[0] - off) < hw) t = G.tone.slice();
  }
  // bird: two lune wings + body
  if (birdInside(P.bird, x, y)) t = P.bird.tone.slice();
  if (mark) t = M.tone.slice();
  return t;
}

function birdInside(B, x, y) {
  const s = B.span, [bx, by] = B.c;
  for (const side of [-1, 1]) {
    const cx = bx + side * 0.5 * s;
    const inA = Math.hypot(x - cx, y - (by - 0.3 * s)) < 0.58 * s;
    const outB = Math.hypot(x - cx, y - (by - 0.62 * s)) > 0.62 * s;
    if (inA && outB) return true;
  }
  return ((x - bx) / (0.1 * s)) ** 2 + ((y - (by - 0.33 * s)) / (0.14 * s)) ** 2 < 1;
}

// ---------------------------------------------------------------- the same artwork as GLSL
const f = (v) => {
  const s = (+v).toFixed(5);
  return s.includes(".") ? s : s + ".0";
};
const v3 = (a) => `vec3(${a.map(f).join(", ")})`;

/**
 * posterGLSL(P) -> GLSL defining `vec3 posterTone(vec2 p, float aa)`: [pink, blue, yellow] tones at sheet point p with
 * edges anti-aliased over `aa` metres (one pixel). No derivatives inside (the caller passes aa), branch-free selects.
 */
export function posterGLSL(P) {
  const S = P.sun, Q = P.sea, G = P.glint, B = P.bird, M = P.marks, E = P.sky.edges, T = P.sky.tones;
  const D = P.horizon - P.area[1];
  const ridgeFn = (name, peaks) => `
  vec3 ${name}(float x) {
    float best = -1e9; float bx = 0.0; float bh = 0.0; float v; float k;
    ${peaks.map(([px, h, s]) => `v = ${f(h)} - ${f(s)} * abs(x - ${f(px)}); k = step(best, v); best = mix(best, v, k); bx = mix(bx, ${f(px)}, k); bh = mix(bh, ${f(h)}, k);`).join("\n    ")}
    return vec3(best, bx, bh);
  }`;
  return /* glsl */ `
  float rsAA(float sd, float aa) { return clamp(0.5 + sd / aa, 0.0, 1.0); }
  float rsRowHash(float r, float s) { return fract(r * 0.6180339887 + s); }
  ${ridgeFn("rsFar", P.far.peaks)}
  ${ridgeFn("rsNear", P.near.peaks)}
  float rsMarks(vec2 p, float aa) {
    float m = 0.0; vec2 d; float r;
    ${M.at.map(([mx, my]) => `d = p - vec2(${f(mx)}, ${f(my)}); r = length(d);
    m = max(m, rsAA(${f(M.w)} - abs(r - ${f(M.r)}), aa));
    m = max(m, min(rsAA(${f(M.w)} - abs(d.y), aa), rsAA(${f(M.arm)} - abs(d.x), aa)));
    m = max(m, min(rsAA(${f(M.w)} - abs(d.x), aa), rsAA(${f(M.arm)} - abs(d.y), aa)));`).join("\n    ")}
    return m;
  }
  float rsBird(vec2 p, float aa) {
    float s = ${f(B.span)}; vec2 c = vec2(${f(B.c[0])}, ${f(B.c[1])});
    float m = 0.0;
    for (int i = 0; i < 2; i++) {
      float side = i == 0 ? -1.0 : 1.0;
      vec2 cx = vec2(c.x + side * 0.5 * s, 0.0);
      float inA = rsAA(0.58 * s - length(p - vec2(cx.x, c.y - 0.3 * s)), aa);
      float outB = rsAA(length(p - vec2(cx.x, c.y - 0.62 * s)) - 0.62 * s, aa);
      m = max(m, min(inA, outB));
    }
    vec2 q = (p - vec2(c.x, c.y - 0.33 * s)) / vec2(0.1 * s, 0.14 * s);
    m = max(m, rsAA((1.0 - length(q)) * 0.1 * s, aa));
    return m;
  }
  vec3 posterTone(vec2 p, float aa) {
    // sky: stepped bands
    vec3 t = ${v3(T[0])};
    ${T.slice(1).map((tone, i) => `t = mix(t, ${v3(tone)}, rsAA(p.y - ${f(E[i + 1])}, aa));`).join("\n    ")}
    // sun with horizontal gaps
    float mSun = rsAA(${f(S.r)} - length(p - vec2(${f(S.c[0])}, ${f(S.c[1])})), aa);
    ${S.gaps.map(([g, h]) => `mSun *= 1.0 - rsAA(${f(h)} - abs(p.y - ${f(S.c[1] - S.r * g)}), aa);`).join("\n    ")}
    t = mix(t, ${v3(S.tone)}, mSun);
    // far and near ranges, faceted (shade = right of the dominant peak)
    vec3 rf = rsFar(p.x);
    float foldF = rf.y + ${f(P.foldSlant)} * (${f(P.horizon)} + rf.z - p.y);
    t = mix(t, mix(${v3(P.far.lit)}, ${v3(P.far.shade)}, rsAA(p.x - foldF, aa)), rsAA(${f(P.horizon)} + rf.x - p.y, aa));
    vec3 rn = rsNear(p.x);
    float foldN = rn.y + ${f(P.foldSlant)} * (${f(P.horizon)} + rn.z - p.y);
    t = mix(t, mix(${v3(P.near.lit)}, ${v3(P.near.shade)}, rsAA(p.x - foldN, aa)), rsAA(${f(P.horizon)} + rn.x - p.y, aa));
    // sea: rows widening toward the viewer, wavy lines, the sun's broken reflection between the lines
    float depthM = max(${f(P.horizon)} - p.y, 0.0);
    float dn = max(depthM / ${f(D)}, 1e-4);
    float rho = ${f(Q.rows)} * pow(dn, ${f(Q.k)});
    float rw = rho + ${f(Q.wobble)} * sin(p.x * ${f(Q.wobbleFreq)} + rho * 2.3);
    float drho = ${f(Q.rows * Q.k)} * pow(dn, ${f(Q.k - 1)}) / ${f(D)};       // d rho / d depth (per metre)
    float dist = abs(fract(rw + 0.5) - 0.5);
    float mLine = rsAA((${f(Q.lineFrac / 2)} - dist) / max(drho, 1e-3), aa);
    vec3 sea = mix(${v3(Q.tone)}, ${v3(Q.line)}, mLine);
    float row = floor(rw);
    float hw = ${f(G.halfW)} * (${f(G.near)} + ${f(1 - G.near)} * dn) * (0.55 + 0.45 * rsRowHash(row, 0.37));
    float off = (rsRowHash(row, 0.71) - 0.5) * ${f(2 * G.jitter)};
    float mGl = rsAA(hw - abs(p.x - ${f(S.c[0])} - off), aa) * step(${f(G.skip)}, rsRowHash(row, 0.13)) * (1.0 - mLine);
    sea = mix(sea, ${v3(G.tone)}, mGl);
    t = mix(t, sea, rsAA(${f(P.horizon)} - p.y, aa));
    // bird over everything
    t = mix(t, ${v3(B.tone)}, rsBird(p, aa));
    // picture area, then the registration marks in the margin
    float mArea = rsAA(min(min(p.x - ${f(P.area[0])}, ${f(P.area[2])} - p.x), min(p.y - ${f(P.area[1])}, ${f(P.area[3])} - p.y)), aa);
    t *= mArea;
    t = max(t, ${v3(M.tone)} * rsMarks(p, aa));
    return t;
  }`;
}

/** sheetToWorld(spec, sx, sy, h = 0) -> [x, y, z]: sheet x -> +X, sheet y -> -Z, the whole print rig turned by tilt about +Y */
export function sheetToWorld(spec, sx, sy, h = 0) {
  const a = spec.sheet.tilt, c = Math.cos(a), s = Math.sin(a);
  const lx = sx, lz = -sy;
  return [lx * c + lz * s, spec.sheet.y + h, -lx * s + lz * c];
}

// ---------------------------------------------------------------- the pass / registration plan
/**
 * planRiso(spec, timing) -> plan
 *   timing = {
 *     passes: [{ ink, t0, t1, dir }]          one drum pass per ink (dir +1 = left to right)
 *     reink:  [{ from, to, t0, t1 }]           parked drum spins and changes sleeve colour
 *     lift:   { t0, t1, h }                    drum rises out of the shot after the last pass
 *     reg:    [[dx, dy, rot] per ink]          registration error each layer lands with (m, m, rad)
 *     shift, nudges: [{ t, dur, k }], snap: { t, stiffness, damping }   paper slide, eased nudges, sprung snap (k = remaining fraction)
 *   }
 */
export function planRiso(spec, timing) {
  const W = spec.sheet.width, R = spec.drum.radius;
  const park = W / 2 + R + spec.drum.park;
  const passes = timing.passes.map((p) => ({ ...p, x0: p.x0 ?? (p.dir > 0 ? -park : park), x1: p.x1 ?? (p.dir > 0 ? park : -park), dur: p.t1 - p.t0 }));
  const reinks = timing.reink ?? [];
  const lift = timing.lift ?? { t0: Infinity, t1: Infinity, h: 0 };
  const drop = timing.drop ?? null; // { t0, t1, h }: the drum falls onto the sheet before the first pass
  const passEase = ease.inOutSine;

  /** drum centre x (sheet metres) */
  function drumX(t) {
    let x = passes[0].x0;
    for (const p of passes) {
      if (t >= p.t1) x = p.x1;
      else if (t >= p.t0) return lerp(p.x0, p.x1, passEase((t - p.t0) / p.dur));
    }
    return x;
  }
  /** sleeve colour weights [pink, blue, yellow] */
  function drumInk(t) {
    let cur = passes[0].ink;
    const w = [0, 0, 0];
    for (const r of reinks) {
      if (t >= r.t1) cur = r.to;
      else if (t >= r.t0) {
        const u = ease.inOutSine((t - r.t0) / (r.t1 - r.t0));
        w[r.from] = 1 - u; w[r.to] = u;
        return w;
      }
    }
    w[cur] = 1;
    return w;
  }
  /** drum roll angle (rad): rolling without slip + one full spin per re-ink, closed form */
  function drumSpin(t) {
    let a = (drumX(t) - passes[0].x0) / R;
    for (const r of reinks) a += 2 * Math.PI * ease.inOutSine((t - r.t0) / (r.t1 - r.t0));
    return a;
  }
  const drumLift = (t) =>
    (Number.isFinite(lift.t0) ? lift.h * ease.inOutCubic((t - lift.t0) / (lift.t1 - lift.t0)) : 0) +
    (drop ? drop.h * (1 - ease.inQuad((t - drop.t0) / (drop.t1 - drop.t0))) : 0);
  /** drumAt(t) -> { x, lift, spin, ink: [w0, w1, w2], visible } */
  const drumAt = (t) => ({ x: drumX(t), lift: drumLift(t), spin: drumSpin(t), ink: drumInk(t), visible: !(t >= lift.t1) });

  /** lineAt(i, t) -> [L, dir]: ink i is on the sheet where (L - x) * dir > 0 */
  function lineAt(i, t) {
    const p = passes.find((q) => q.ink === i);
    if (!p || t < p.t0) return [p?.dir > 0 ? -99 : 99, p?.dir ?? 1];
    if (t >= p.t1) return [p.dir > 0 ? 99 : -99, p.dir];
    return [drumX(t), p.dir];
  }

  /** registration fraction left (1 = as printed, 0 = in register): two eased nudges then a sprung snap */
  const nudges = timing.nudges ?? [], snap = timing.snap ?? { t: Infinity };
  function regFrac(t) {
    let fr = 1, prev = 1;
    for (const n of nudges) {
      if (t >= n.t) fr = lerp(prev, n.k, ease.outBack((t - n.t) / n.dur));
      prev = n.k;
    }
    if (t >= snap.t) fr = prev * (1 - spring(t - snap.t, { stiffness: snap.stiffness ?? 520, damping: snap.damping ?? 20 }));
    return fr;
  }
  /** regAt(i, t) -> [dx, dy, rot] of ink layer i (sheet metres, radians about the sheet centre) */
  const regAt = (i, t) => { const k = regFrac(t); const r = timing.reg[i]; return [r[0] * k, r[1] * k, r[2] * k]; };

  const uniformsAt = (t) => ({
    line: [0, 1, 2].map((i) => lineAt(i, t)),
    reg: [0, 1, 2].map((i) => regAt(i, t)),
    drum: drumAt(t),
    regFrac: regFrac(t),
  });

  function events() {
    const ev = [];
    for (const p of passes) {
      ev.push({ t: drop && p === passes[0] ? drop.t1 : p.t0, kind: "land", ink: p.ink });
      ev.push({ t: p.t0 + 0.04, kind: "roll", ink: p.ink, dur: p.dur });
      ev.push({ t: p.t0 + 0.1, kind: "slide", dur: Math.min(1.2, p.dur * 0.6) });
      ev.push({ t: p.t1, kind: "stop", ink: p.ink });
    }
    for (const r of reinks) {
      ev.push({ t: r.t0, kind: "spin", dur: r.t1 - r.t0 });
      ev.push({ t: r.t1 - 0.08, kind: "ink", ink: r.to });
    }
    if (Number.isFinite(lift.t0)) ev.push({ t: lift.t0, kind: "lift", dur: lift.t1 - lift.t0 });
    if (timing.shift != null) ev.push({ t: timing.shift, kind: "shift" });
    nudges.forEach((n, j) => ev.push({ t: n.t, kind: "nudge", j }));
    if (Number.isFinite(snap.t)) {
      ev.push({ t: snap.t, kind: "snap" });
      ev.push({ t: snap.t + 0.02, kind: "chord", hz: spec.inks.map((k) => k.pitch) });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  // mean tone per ink over the picture (Node check that pink alone carries the picture)
  function stats(n = 120) {
    const P = POSTER, [x0, y0, x1, y1] = P.area, acc = [0, 0, 0];
    let c = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tt = posterTones(P, lerp(x0, x1, (i + 0.5) / n), lerp(y0, y1, (j + 0.5) / n));
      acc[0] += tt[0]; acc[1] += tt[1]; acc[2] += tt[2]; c++;
    }
    return Object.fromEntries(INK_IDS.map((id, i) => [id, +(acc[i] / c).toFixed(3)]));
  }
  const fingerprint = () => passes.map((p) => `${p.ink}:${p.t0.toFixed(3)}-${p.t1.toFixed(3)}`).join(",") + `|snap ${snap.t}`;

  return { passes, park, drumAt, drumX, lineAt, regAt, regFrac, uniformsAt, events, stats, fingerprint, timing };
}

/** risoVoices(spec) -> voices for kit/schedule.scoreFromEvents; every gain from spec.sound, pitch from the ink */
export function risoVoices(spec) {
  const S = spec.sound, pitch = (i) => spec.inks[i].pitch;
  return {
    land: (e) => [{ type: "thud", gain: S.land, pitch: 0.75 + 0.25 * (pitch(e.ink) / 220), dur: 0.4 }],
    roll: (e) => [{ type: "whir", gain: S.roll, hz: pitch(e.ink) / 2, hz2: (pitch(e.ink) / 2) * 1.04, dur: e.dur, grit: 0.22 }],
    slide: (e) => [{ type: "paper", gain: S.slide, dur: e.dur, density: 0.3 }],
    stop: () => [{ type: "clack", gain: 0.2, dur: 0.1 }],
    spin: (e) => [{ type: "whir", gain: 0.12, hz: 160, hz2: 240, dur: e.dur, grit: 0.1 }],
    ink: (e) => [{ type: "pluck", gain: S.pluck, hz: pitch(e.ink), dur: 1.1, decay: 0.9, bright: 0.55 }],
    lift: (e) => [{ type: "whoosh", dir: "out", gain: S.lift, dur: e.dur + 0.2 }],
    shift: () => [{ type: "paper", gain: S.slide * 1.3, dur: 0.6, density: 0.4 }],
    nudge: (e) => [{ type: "clack", gain: S.nudge * (e.j ? 0.85 : 1), dur: 0.1, pitch: e.j ? 1.12 : 1 }, { type: "thud", gain: 0.12, dur: 0.18, pitch: 1.4 }],
    snap: () => [{ type: "click", gain: S.snap, dur: 0.03 }, { type: "clack", gain: S.snap * 0.6, dur: 0.12, pitch: 1.3 }, { type: "thud", gain: 0.2, dur: 0.25 }],
    chord: () => [
      { type: "marimba", gain: S.chord, hz: spec.inks[0].pitch * 2, notes: [0, 4, 7, 12], step: 0.035, dur: 1.6, decay: 0.45 },
      { type: "chime", gain: S.chord * 0.45, dur: 1.6, notes: 5, offset: 0.08 },
    ],
  };
}
