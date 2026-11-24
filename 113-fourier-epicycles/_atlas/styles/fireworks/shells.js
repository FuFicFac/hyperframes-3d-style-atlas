// styles/fireworks/shells.js — the closed-form ballistic shell planner (pure: no THREE, no window, no DOM; Node-safe).
// Imported by style.js (picture) AND scene.config.js (SCORE, framing gate), so sound and picture share one plan.
//
// One formula moves everything (lift, comet sparks, burst stars, flashes):
//     tau  = t - t0 - lag
//     p(t) = C + D (1 - e^(-k tau)) - y^ (g / k) (tau - (1 - e^(-k tau)) / k)        for 0 <= tau <= life
// i.e. a particle thrown from C with velocity k D under LINEAR DRAG k and gravity g: it flies toward C + D (its
// TARGET), reaches 95 % of the way after 3 / k seconds, then sinks at the terminal speed g / k. Brightness is
// (1 - (tau / life)^2)^fadePow, hotter right after t0, twinkling near the end. The vertex shader in style.js evaluates
// the same expression from the packed buffers (plan.buffers); starAt() here is the JS twin used for framing checks.
//
// A shell = { id, burst (s), x, y, z (burst centre), R (m), T (temperature), layers: [{ shape | points, scale, color, n }] }.
// planShow(shells, defaults) turns shells into star instances + sound events + the flash light curve.
import { rng, clamp, lerp, smoothstep, TAU } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";

// ------------------------------------------------------------------------------------------------ small helpers
/** hexRGB("#ff8800") -> [r, g, b] in 0..1 (display values: the sprites add in display space) */
export function hexRGB(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
const E = (x) => 1 - Math.exp(-x);

/** resample(points, n, closed) -> n points at equal arc-length steps along a polyline ([x, y] pairs) */
export function resample(pts, n, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1], out = [];
  if (L <= 0 || n <= 1) return [[P[0][0], P[0][1]]];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = closed ? (i / n) * L : (i / (n - 1)) * L;
    while (j < P.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push([lerp(P[j - 1][0], P[j][0], u), lerp(P[j - 1][1], P[j][1], u)]);
  }
  return out;
}
/** pathLength(points, closed) */
export function pathLength(pts, closed = false) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return L;
}

// ------------------------------------------------------------------------------------------------ planned shapes
// Each outline is a list of polylines in UNIT space (the shape fits |x|, |y| <= 1): { lines: [{ pts, closed }] }.
const circle = (r = 1, n = 96) => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * TAU + Math.PI / 2), r * Math.sin((i / n) * TAU + Math.PI / 2)]);
function heartLine(n = 160) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = 16 * Math.sin(a) ** 3;
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    out.push([x / 16, (y + 2.5) / 16]);
  }
  return out;
}
function starLine(points = 5, inner = 0.42) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1, a = Math.PI / 2 + (i / (points * 2)) * TAU;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}
export const SHAPES = {
  ring: () => ({ lines: [{ pts: circle(1), closed: true }] }),
  heart: () => ({ lines: [{ pts: heartLine(), closed: true }] }),
  star: (o = {}) => ({ lines: [{ pts: starLine(o.points ?? 5, o.inner ?? 0.42), closed: true }] }),
  /** letter / short text: single-stroke glyphs from the kit stroke font, fitted to the unit box */
  text: (o = {}) => {
    const lay = layoutStrokeText(o.text ?? "A", 1, { letterSpacing: o.letterSpacing ?? 0.28 });
    const lines = lay.chars.flatMap((c) => c.strokes.map((s) => ({ pts: s.map((p) => [p[0], p[1] - 0.5]), closed: false })));
    const half = Math.max(0.5, lay.width / 2);
    return { lines: lines.map((l) => ({ ...l, pts: l.pts.map((p) => [p[0] / half, p[1] / half]) })) };
  },
};
/**
 * shapePoints(shape, { n, R, spacing, ...shapeOpts }) -> [[x, y], ...] in unit space, evenly spaced along the outline.
 *   n = number of stars; if omitted it comes from the outline length x R / spacing.
 */
export function shapePoints(shape, o = {}) {
  const def = typeof shape === "string" ? SHAPES[shape]?.(o) : shape;
  if (!def) throw new Error(`fireworks: unknown shape "${shape}"`);
  const lens = def.lines.map((l) => pathLength(l.pts, l.closed));
  const total = lens.reduce((a, b) => a + b, 0);
  const n = o.n ?? Math.max(6, Math.round((total * (o.R ?? 30)) / (o.spacing ?? 1.5)));
  const out = [];
  def.lines.forEach((l, i) => {
    const k = Math.max(2, Math.round((n * lens[i]) / total));
    out.push(...resample(l.pts, k, l.closed));
  });
  return out;
}

/**
 * wordShells(text, { cap, center: [x, y], z, letterSpacing, colors, burst, stagger, id, ...shell }) -> shells
 *   One shell per letter: its burst centre is the middle of the letter, its stars the letter's strokes. Together the
 *   shells write the word. `burst` is the first burst time, `stagger` the delay per letter (left to right).
 */
export function wordShells(text, o = {}) {
  const { cap = 40, center = [0, 50], z = 0, letterSpacing = 0.3, colors = ["#ffc64a"], burst = 1, stagger = 0.12, id = "w", spacing = 1.5, ...rest } = o;
  const lay = layoutStrokeText(text, cap, { letterSpacing });
  return lay.chars.map((c, i) => {
    const cx = (c.x0 + c.x1) / 2, cy = cap / 2, R = cap / 2;
    const pts = [];
    for (const s of c.strokes) {
      const line = s.map((p) => [(p[0] - cx) / R, (p[1] - cy) / R]);
      const L = pathLength(line) * R;
      pts.push(...resample(line, Math.max(2, Math.round(L / spacing) + 1)));
    }
    return {
      ...rest, id: `${id}${i}`, glyph: c.ch, x: center[0] + cx, y: center[1], z, R, burst: burst + i * stagger,
      layers: [{ points: pts, color: colors[i % colors.length] }],
    };
  });
}

// ------------------------------------------------------------------------------------------------ temperature
/**
 * heat(T, H) -> what a temperature does to a shell: { sigma, scatter, take, hue, speed, crackle }
 *   sigma   per-star target noise (x R)             take    size of the per-shell turn / stretch / shear
 *   scatter 0..1 blend from the plan to a random ball   hue  share of stars in another palette colour
 */
export function heat(T, H) {
  return {
    sigma: H.sigma * T ** H.sigmaPow,
    scatter: smoothstep(H.scatter[0], H.scatter[1], T),
    take: T ** H.take.pow,
    hue: clamp((T - H.hue[0]) / (H.hue[1] - H.hue[0])) ** H.hue[2],
    speed: H.speed * T,
    crackle: T >= H.crackle,
  };
}

// ------------------------------------------------------------------------------------------------ the plan
const FIELDS = 22;   // floats per instance: C3 D3 K4 Col4 M4 E4

/**
 * planShow(shells, S, { palette, extras }) -> plan
 *   S = STYLE_SPEC.shells (defaults; every shell may override rise, drag, gravity, life, size, spacing, ghosts ...).
 *   shell: { id, burst, x, y, z = 0, R, T = 0.2, from: [x, y, z] (launch point), layers, color, take = 1, lift = true }
 *   plan = { shells (resolved), n, buffers { C, D, K, Col, M, E }, events, starAt(i, t), flashAt(t), shellBox(id), end }
 */
export function planShow(shells, S, o = {}) {
  const palette = o.palette ?? {};
  const colour = (c) => hexRGB(palette[c] ?? c);
  const inst = [];   // flat instance records
  const push = (r) => { inst.push(r); return inst.length - 1; };
  const out = [], events = [];

  shells.forEach((raw, si) => {
    const sh = {
      z: 0, T: 0.2, take: 1, lift: true, rise: S.rise, drag: S.drag, gravity: S.gravity, life: S.life, size: S.size,
      spacing: S.spacing, ghosts: S.ghosts, fadePow: S.fadePow, color: "#ffc64a", ...raw,
    };
    const r = rng(`${S.seed}:${sh.id ?? si}:${sh.seed ?? 0}`);
    const H = heat(sh.T, S.heat);
    const C = [sh.x, sh.y, sh.z];
    const launch = sh.burst - sh.rise;
    const from = sh.from ?? [sh.x * 0.8, 1.4, sh.z];
    const first = inst.length;

    // ---- lift: the shell head + its comet sparks (same formula; D is scaled so the head is exactly at C at the burst)
    if (sh.lift) {
      const kr = S.riseDrag, norm = E(kr * sh.rise);
      const D = [(C[0] - from[0]) / norm, (C[1] - from[1]) / norm, (C[2] - from[2]) / norm];
      const cm = S.comet, cc = colour(cm.color);
      for (let g = 0; g <= cm.ghosts; g++) {
        push({ C: from, D, t0: launch, life: sh.rise, k: kr, g: 0, col: cc, size: cm.size * (1 - 0.09 * g), seed: r.next(), lag: g * cm.ghostStep, tw: 0, fadePow: 0, hot: 0, twStart: 0, gain: 0.9 * 0.72 ** g, flag: 0, shell: si, kind: "head" });
      }
      const sc = colour(cm.sparkColor);
      for (let j = 0; j < cm.sparks; j++) {
        const te = (j + r.next()) / cm.sparks * sh.rise, e = E(kr * te);
        const p = [from[0] + D[0] * e, from[1] + D[1] * e, from[2] + D[2] * e];
        push({
          C: p, D: [r.gaussian(0, cm.sparkDrift * 0.5), -Math.abs(r.gaussian(0, cm.sparkDrift)), 0], t0: launch + te,
          life: r.range(cm.sparkLife[0], cm.sparkLife[1]), k: 3, g: cm.sparkGravity, col: sc, size: cm.sparkSize * r.range(0.7, 1.2),
          seed: r.next(), lag: 0, tw: 0.6, fadePow: 1.4, hot: 0.6, twStart: 0, gain: 0.8, flag: 0, shell: si, kind: "spark",
        });
      }
      events.push({ t: launch, kind: "launch", x: from[0], rise: sh.rise, u: r.next(), shell: sh.id });
    }

    // ---- the "take": this shell's own turn / stretch / shear of the planned shape (grows with temperature)
    const tk = S.heat.take, a = H.take * sh.take;
    const turn = r.gaussian(0, tk.turn) * a, sx = 1 + r.gaussian(0, tk.stretch) * a, sy = 1 + r.gaussian(0, tk.stretch) * a, shear = r.gaussian(0, tk.shear) * a;
    const co = Math.cos(turn), sn = Math.sin(turn);
    const confetti = (S.confetti ?? []).map(colour);

    // ---- burst stars
    const stars = [];
    (sh.layers ?? [{ shape: "ring" }]).forEach((ly) => {
      const sc = (ly.scale ?? 1) * sh.R;
      const pts = ly.points ?? shapePoints(ly.shape, { ...ly, R: sc, spacing: ly.spacing ?? sh.spacing });
      const base = colour(ly.color ?? sh.color);
      for (const q of pts) {
        // planned target, with this shell's take
        const ux = q[0] * sx + q[1] * shear, uy = q[1] * sy;
        const px = (ux * co - uy * sn) * sc, py = (ux * sn + uy * co) * sc, pz = r.gaussian(0, S.depth) * sh.R;
        // temperature noise on the target
        const nx = r.gaussian(0, H.sigma) * sh.R, ny = r.gaussian(0, H.sigma) * sh.R, nz = r.gaussian(0, H.sigma) * sh.R * 0.5;
        // plain scatter: a random direction, radius biased to the outside (a round "chrysanthemum")
        const cz = r.range(-1, 1), ca = r.range(0, TAU), cr = Math.sqrt(1 - cz * cz), rr = sh.R * (0.3 + 0.75 * Math.sqrt(r.next()));
        const bx = cr * Math.cos(ca) * rr, by = cr * Math.sin(ca) * rr, bz = cz * rr;
        const m = H.scatter;
        const D = [lerp(px + nx, bx, m), lerp(py + ny, by, m), lerp(pz + nz, bz, m)];
        const k = sh.drag * clamp(1 + r.gaussian(0, H.speed), 0.45, 1.8);
        const life = (ly.life ?? sh.life) * (1 + (r.next() - 0.5) * (0.12 + 0.35 * Math.min(1, sh.T)));
        const col = r.next() < H.hue && confetti.length ? r.pick(confetti) : base;
        const seed = r.next(), size = (ly.size ?? sh.size) * r.range(0.9, 1.12);
        const crack = H.crackle;
        const head = push({ C, D, t0: sh.burst, life, k, g: sh.gravity, col, size, seed, lag: 0, tw: crack ? 0.75 : S.glitter, fadePow: sh.fadePow, hot: S.hot, twStart: crack ? 0 : (sh.glitterStart ?? S.glitterStart), gain: 1, flag: 0, shell: si, kind: "star" });
        stars.push(head);
        for (let g = 1; g <= sh.ghosts; g++) {
          push({ C, D, t0: sh.burst, life, k, g: sh.gravity, col, size: size * (1 - 0.13 * g), seed, lag: g * S.ghostStep, tw: 0, fadePow: sh.fadePow + 2.5, hot: 0, twStart: 0, gain: S.ghostFall ** g, flag: 0, shell: si, kind: "ghost" });
        }
      }
    });

    // ---- flash at the burst (one big short-lived sprite)
    const fc = colour(sh.layers?.[0]?.color ?? sh.color), F = S.flash, power = clamp(sh.R / 30, 0.4, 1.4);
    push({ C, D: [0, 0, 0], t0: sh.burst, life: F.life, k: 1, g: 0, col: fc.map((c) => lerp(c, 1, 0.55)), size: F.size * power, seed: r.next(), lag: 0, tw: 0, fadePow: 2, hot: 0, twStart: 0, gain: F.level, flag: 1, shell: si, kind: "flash" });

    events.push({ t: sh.burst, kind: "burst", x: sh.x, size: power, T: sh.T, crisp: sh.T < S.heat.scatter[0] * 0.6, shell: sh.id });
    if (H.crackle) {
      events.push({ t: sh.burst + 0.2, kind: "hiss", x: sh.x, shell: sh.id });
      for (let j = 0; j < (o.crackles ?? 12); j++) events.push({ t: sh.burst + r.range(0.25, 1.5), kind: "crackle", x: sh.x + r.range(-1, 1) * sh.R, u: r.next(), shell: sh.id });
    }
    out.push({ ...sh, index: si, launch, from, first, count: inst.length - first, stars, heat: H, flashColor: fc, power });
  });

  // ---- extras: fixed lamps / sky stars etc. ({ C, col, size, gain, life?, t0?, flag? })
  for (const x of o.extras ?? []) {
    push({ C: x.C, D: x.D ?? [0, 0, 0], t0: x.t0 ?? -100, life: x.life ?? 1e5, k: 1, g: 0, col: colour(x.color ?? "#ffffff"), size: x.size ?? 4, seed: x.seed ?? 0.5, lag: 0, tw: x.tw ?? 0, fadePow: 0, hot: 0, twStart: 0, gain: x.gain ?? 1, flag: x.flag ?? 1, shell: -1, kind: "extra" });
  }

  // ---- pack
  const n = inst.length;
  const B = { C: new Float32Array(n * 3), D: new Float32Array(n * 3), K: new Float32Array(n * 4), Col: new Float32Array(n * 4), M: new Float32Array(n * 4), E: new Float32Array(n * 4) };
  inst.forEach((s, i) => {
    B.C.set(s.C, i * 3); B.D.set(s.D, i * 3);
    B.K.set([s.t0, s.life, s.k, s.g], i * 4);
    B.Col.set([s.col[0], s.col[1], s.col[2], s.size], i * 4);
    B.M.set([s.seed, s.lag, s.tw, s.fadePow], i * 4);
    B.E.set([s.hot, s.twStart, s.gain, s.flag], i * 4);
  });
  events.sort((a, b) => a.t - b.t);

  /** starAt(i, t) -> { p: [x, y, z], b } : the JS twin of the vertex shader (b = brightness before twinkle) */
  function starAt(i, t) {
    const s = inst[i], tau = t - s.t0 - s.lag;
    if (tau < 0 || tau > s.life) return { p: [s.C[0], s.C[1], s.C[2]], b: 0 };
    const e = E(s.k * tau), drop = (s.g / s.k) * (tau - e / s.k);
    const u = tau / s.life;
    return { p: [s.C[0] + s.D[0] * e, s.C[1] + s.D[1] * e - drop, s.C[2] + s.D[2] * e], b: Math.max(1 - u * u, 1e-4) ** s.fadePow * (1 + s.hot * Math.exp(-tau * 7)) * s.gain };
  }
  /** flashAt(t) -> [r, g, b]: the light the bursts throw on sky, skyline and water (a hit that decays + a hang glow) */
  function flashAt(t) {
    const L = S.light, c = [0, 0, 0];
    for (const sh of out) {
      const tau = t - sh.burst;
      if (tau < 0 || tau > sh.life) continue;
      const a = (L.hit * Math.exp(-L.hitFall * tau) + L.hang * (1 - tau / sh.life)) * sh.power;
      c[0] += sh.flashColor[0] * a; c[1] += sh.flashColor[1] * a; c[2] += sh.flashColor[2] * a;
    }
    return c.map((v) => Math.min(v, 1.6));
  }
  /** shellBox(id, tau = 3 / k, pad = 0) -> [min, max] of the shell's stars `tau` seconds after its burst */
  function shellBox(id, tau, pad = 0) {
    const sh = out.find((s) => s.id === id);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const i of sh.stars) {
      const { p } = starAt(i, sh.burst + (tau ?? 3 / sh.drag));
      for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a] - pad); mx[a] = Math.max(mx[a], p[a] + pad); }
    }
    return [mn, mx];
  }
  return { shells: out, n, fields: FIELDS, buffers: B, instances: inst, events, starAt, flashAt, shellBox, end: Math.max(...out.map((s) => s.burst + s.life)) };
}

/** showVoices(sound) -> voices for kit/schedule.scoreFromEvents(plan.events, voices): thump + whistle, boom, crackle */
export function showVoices(S) {
  const pan = (e) => clamp((e.x ?? 0) / 110, -0.7, 0.7);
  return {
    launch: (e) => [
      { type: "thud", gain: S.lift.gain, pitch: S.lift.pitch, dur: S.lift.dur, pan: pan(e) },
      { type: "riser", offset: 0.04, dur: Math.max(0.3, e.rise - 0.1), gain: S.whistle.gain, pitch: lerp(S.whistle.pitch[0], S.whistle.pitch[1], e.u), pan: pan(e) },
    ],
    burst: (e) => [
      { type: "thud", gain: S.boom.gain * e.size, pitch: S.boom.pitch / Math.sqrt(e.size), dur: S.boom.dur, pan: pan(e) },
      { type: "rumble", gain: S.tail.gain * e.size, dur: S.tail.dur, pitch: S.tail.pitch, pan: pan(e) * 0.5 },
      { type: "whoosh", dir: "out", gain: S.air.gain * e.size, dur: S.air.dur, pitch: S.air.pitch, q: 0.8, pan: pan(e) },
      ...(e.crisp ? [{ type: "sparkle", offset: 0.12, gain: S.shimmer.gain, pitch: S.shimmer.pitch, pan: pan(e) }] : []),
    ],
    hiss: (e) => [{ type: "rustle", dur: 1.4, density: 0.8, pitch: 1.5, gain: S.crackle.hiss, pan: pan(e) }],
    crackle: (e) => [{ type: "click", dur: 0.035, gain: lerp(S.crackle.gain[0], S.crackle.gain[1], e.u), pitch: lerp(S.crackle.pitch[0], S.crackle.pitch[1], (e.u * 7.3) % 1), pan: pan(e) }],
  };
}

// ------------------------------------------------------------------------------------------------ the set (pure layout)
/**
 * cityPlan(K = STYLE_SPEC.skyline) -> { far: { z, buildings }, near: { z, buildings }, beacons }
 *   buildings: [{ x (left edge), w, h, seed, tone, cap?: { w, h } }]; beacons = extras for planShow (red roof lamps).
 */
export function cityPlan(K) {
  const r = rng(K.seed), out = { beacons: [] };
  for (const id of ["far", "near"]) {
    const L = K[id], list = [];
    let x = L.x[0];
    while (x < L.x[1]) {
      const w = r.range(L.width[0], L.width[1]), tower = r.chance(L.towers.share);
      const h = tower ? r.range(L.towers.height[0], L.towers.height[1]) : r.range(L.height[0], L.height[1]);
      const b = { x, w, h, seed: r.next(), tone: r.next(), tower };
      if (tower && r.chance(0.65)) b.cap = { w: w * r.range(0.4, 0.65), h: r.range(3, 7) };
      list.push(b);
      if (tower && id === "near") out.beacons.push({ C: [x + w / 2, h + (b.cap?.h ?? 0) + 0.9, L.z], color: K.beacons.color, size: K.beacons.size, gain: K.beacons.level, flag: 0 });
      x += w + r.range(L.gap[0], L.gap[1]);
    }
    out[id] = { z: L.z, buildings: list };
  }
  return out;
}
/** skyStars(K = STYLE_SPEC.sky.stars) -> extras for planShow: tiny fixed stars far behind the skyline (not mirrored) */
export function skyStars(K) {
  const r = rng(`stars:${K.seed}`), out = [];
  for (let i = 0; i < K.count; i++) {
    out.push({ C: [r.range(-640, 640), r.range(150, 560), -700], color: r.chance(0.3) ? "#cfe0ff" : "#fff1d8", size: r.range(K.size[0], K.size[1]), gain: r.range(K.level[0], K.level[1]), flag: 1 });
  }
  return out;
}
/** bargeLamps(K = STYLE_SPEC.barges) -> extras: one small warm lamp per barge */
export function bargeLamps(K) {
  return K.xs.map((x) => ({ C: [x + K.w * 0.32, K.h + 1.1, K.z], color: K.lamp, size: 8, gain: 0.8, flag: 0 }));
}
