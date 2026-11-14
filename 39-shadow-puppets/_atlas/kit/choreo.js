// choreo.js — THREE-free choreography (pure, Node-safe). Promoted from the floating-screens pilot (identical code).
// Pure functions of time (no THREE, no window, no DOM): pose tracks with springy settles, layout helpers
// (fan / stack / grid / row) that return target poses, typing plans (per-character times, also used by
// scene.config.js to place one key tick per character), flips and bezier connector paths.
// A POSE is plain data: { p:[x,y,z], r:[rx,ry,rz] (rad), s: scale, o: presence 0..1 }.
import { clamp, lerp, spring, toEase, rng } from "./time.js";
import { pathLength, pointAt } from "./pathmath.js";

export const POSE = { p: [0, 0, 0], r: [0, 0, 0], s: 1, o: 1 };
export const pose = (p = [0, 0, 0], r = [0, 0, 0], s = 1, o = 1) => ({ p: [...p], r: [...r], s, o });
const full = (q = {}) => ({ p: q.p ?? [0, 0, 0], r: q.r ?? [0, 0, 0], s: q.s ?? 1, o: q.o ?? 1 });

/** mixPose(a, b, u) — u may leave 0..1 (spring overshoot); presence is clamped. */
export function mixPose(a, b, u) {
  a = full(a); b = full(b);
  return {
    p: a.p.map((v, i) => lerp(v, b.p[i], u)),
    r: a.r.map((v, i) => lerp(v, b.r[i], u)),
    s: lerp(a.s, b.s, u),
    o: clamp(lerp(a.o, b.o, clamp(u))),
  };
}
/** offsetPose(base, { dp, dr, ds (multiplier), o }) — relative pose (fly-in origins, recede targets). */
export function offsetPose(base, { dp = [0, 0, 0], dr = [0, 0, 0], ds = 1, o } = {}) {
  base = full(base);
  return { p: base.p.map((v, i) => v + dp[i]), r: base.r.map((v, i) => v + dr[i]), s: base.s * ds, o: o ?? base.o };
}

/** SPRINGS: named spring presets (stiffness, damping). "settle" overshoots ~5 % (settles ~.6 s), "snappy" ~6 % (.45 s), "soft" ~2 % (.85 s), "pop" ~20 %. */
export const SPRINGS = {
  settle: { stiffness: 90, damping: 13 },
  snappy: { stiffness: 160, damping: 17 },
  soft: { stiffness: 60, damping: 12 },
  pop: { stiffness: 210, damping: 14 },
};
/** progress(t, start, { ease = "inOutCubic", dur = .8, spring }) -> 0..1 (spring: may overshoot past 1). */
export function progress(t, start, { ease = "inOutCubic", dur = 0.8, spring: sp } = {}) {
  if (t <= start) return 0;
  if (sp) {
    const S = typeof sp === "string" ? SPRINGS[sp] : sp;
    return spring(t - start, S);
  }
  return toEase(ease)(clamp((t - start) / dur));
}

/**
 * track(t, keys) -> pose. keys = [{ t, pose, spring? | ease?, dur? }] sorted by t. Before the first key the
 * first pose holds; at key k the object moves from the pose it had then to key k's pose (spring or ease).
 * Springs are evaluated in closed form, so seeking in any order gives the same pose.
 */
export function track(t, keys) {
  let cur = full(keys[0].pose);
  for (let k = 1; k < keys.length; k++) {
    const K = keys[k];
    if (t <= K.t) break;
    // pose at the moment this key starts = previous segment evaluated at K.t
    const u = progress(t, K.t, { ease: K.ease, dur: K.dur ?? 0.8, spring: K.spring });
    const startPose = k === 1 ? full(keys[0].pose) : track(K.t, keys.slice(0, k));
    cur = mixPose(startPose, K.pose, u);
  }
  return cur;
}

/** flyFrom(target, { depth = 5, dy = -.6, dx = 0, tilt = [.5, -.35, .08], scale = .7 }) -> pose: where a card flies in FROM (behind, below, tilted, hidden). */
export function flyFrom(target, { depth = 5, dx = 0, dy = -0.6, tilt = [0.5, -0.35, 0.08], scale = 0.7 } = {}) {
  return offsetPose(target, { dp: [dx, dy, -depth], dr: tilt, ds: scale, o: 0 });
}
/** recede(target, { depth = 1.6, dim }) -> pose pushed back in depth (DoF blurs it), presence kept. */
export const recede = (target, { depth = 1.6, dx = 0, dy = 0, ds = 0.92 } = {}) => offsetPose(target, { dp: [dx, dy, -depth], ds });

/** flipAngle(t, start, { spring = "settle", from = 0, to = PI }) -> rad about Y (back face shows past PI/2). */
export const flipAngle = (t, start, { spring: sp = "settle", from = 0, to = Math.PI } = {}) => lerp(from, to, progress(t, start, { spring: sp }));

// ------------------------------------------------------------------ layouts (return target poses) --------
/**
 * fanLayout(n, { center, radius = 6, spread = .9, depthStep = .08, tilt = 1, lift = 0 }) -> poses
 *   A hand of cards: card i sits on an arc of `radius` (pivot below the centre), rotated about Z to follow
 *   it (× tilt), each later card a little nearer the camera (depthStep). spread = total angle (rad).
 */
export function fanLayout(n, { center = [0, 0, 0], radius = 6, spread = 0.9, depthStep = 0.08, tilt = 1, lift = 0, yaw = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const a = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    return pose([center[0] + Math.sin(a) * radius, center[1] + (Math.cos(a) - 1) * radius + lift, center[2] + i * depthStep], [0, yaw, -a * tilt]);
  });
}
/** stackLayout(n, { center, offset = [.06, -.06, .05], rot = .03, seed }) -> poses (a loose pile; card 0 at the back). */
export function stackLayout(n, { center = [0, 0, 0], offset = [0.06, -0.06, 0.05], rot = 0.03, seed = 3 } = {}) {
  const R = rng(seed);
  return Array.from({ length: n }, (_, i) => pose(center.map((v, k) => v + offset[k] * i), [0, 0, R.range(-rot, rot)]));
}
/** gridLayout(n, { center, cols = 3, cell = [2, 1.4], gap = .25, depth = 0, stagger = 0 }) -> poses (row-major, top-left first). */
export function gridLayout(n, { center = [0, 0, 0], cols = 3, cell = [2, 1.4], gap = 0.25, depth = 0, stagger = 0 } = {}) {
  const rows = Math.ceil(n / cols), W = cols * cell[0] + (cols - 1) * gap, H = rows * cell[1] + (rows - 1) * gap;
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return pose([center[0] - W / 2 + cell[0] / 2 + c * (cell[0] + gap), center[1] + H / 2 - cell[1] / 2 - r * (cell[1] + gap) + (c % 2) * stagger, center[2] + depth * (c + r)]);
  });
}
/** rowLayout(n, { center, step = 2.2, arc = 0, depthArc = 0, yawArc = 0 }) -> poses on a (curved) row: a flow / carousel. */
export function rowLayout(n, { center = [0, 0, 0], step = 2.2, arc = 0, depthArc = 0, yawArc = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const k = n === 1 ? 0 : i / (n - 1) * 2 - 1;
    return pose([center[0] + (i - (n - 1) / 2) * step, center[1] - arc * k * k, center[2] - depthArc * k * k], [0, -yawArc * k, 0]);
  });
}

// ------------------------------------------------------------------ typing -------------------------------
/**
 * typePlan(text, start, { cps = 16, jitter = .45, seed = 7, pauseAfter = ",.?!", pause = .12 }) -> plan
 *   plan = { text, start, end, times: [t of char i] }. Spaces type faster, punctuation pauses. Deterministic.
 *   Use the same plan in renderAt (typedCount) and in scene.config.js (one `click` per non-space char).
 */
export function typePlan(text, start, { cps = 16, jitter = 0.45, seed = 7, pauseAfter = ",.?!", pause = 0.12 } = {}) {
  const R = rng(seed), times = [];
  let t = start;
  for (let i = 0; i < text.length; i++) {
    times.push(t);
    const ch = text[i];
    let dt = (1 / cps) * (1 + R.range(-jitter, jitter));
    if (ch === " ") dt *= 0.7;
    if (pauseAfter.includes(ch)) dt += pause;
    t += dt;
  }
  return { text, start, end: t, times };
}
/** typedCount(t, plan) -> chars visible at t (0..text.length). */
export function typedCount(t, plan) {
  let n = 0;
  while (n < plan.times.length && plan.times[n] <= t) n++;
  return n;
}
/** keyTimes(plan, { every = 1 }) -> times of non-space characters (for SCORE key ticks). */
export const keyTimes = (plan, { every = 1 } = {}) => plan.times.filter((_, i) => plan.text[i] !== " " && i % every === 0);
/** caretOn(t, { rate = 1.1, typingUntil }) -> bool: solid while typing, then blinks (pure f(t)). */
export const caretOn = (t, { rate = 1.1, typingUntil = -Infinity } = {}) => t < typingUntil + 0.35 || (t * rate) % 1 < 0.55;

// ------------------------------------------------------------------ connector paths ----------------------
/**
 * bezierPath(a, b, { bend = .35, lift = [0, .6, .8], steps = 40 }) -> [[x,y,z]...]: a cubic from a to b whose
 *   handles are pushed by `lift` (scaled by distance × bend) — a soft arc between two cards.
 */
export function bezierPath(a, b, { bend = 0.35, lift = [0, 0.6, 0.8], steps = 40 } = {}) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * bend;
  const c1 = a.map((v, i) => v + (b[i] - v) * 0.25 + lift[i] * d);
  const c2 = a.map((v, i) => v + (b[i] - v) * 0.75 + lift[i] * d);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const u = k / steps, w = 1 - u;
    return a.map((_, i) => w * w * w * a[i] + 3 * w * w * u * c1[i] + 3 * w * u * u * c2[i] + u * u * u * b[i]);
  });
}
/** along(pts, u) -> { p, t } at fraction u of the path length (u clamped). */
export const along = (pts, u) => pointAt(pts, clamp(u) * pathLength(pts));

/** window01(t, on, off, { inDur = .35, outDur = .35 }) -> 0..1 presence of something shown between on and off. */
export function window01(t, on, off = Infinity, { inDur = 0.35, outDur = 0.35, ease = "outCubic" } = {}) {
  const a = toEase(ease)(clamp((t - on) / inDur));
  const b = Number.isFinite(off) ? 1 - toEase("inCubic")(clamp((t - off) / outDur)) : 1;
  return Math.min(a, b);
}

/** ramp(t, [[t, v], ...], ease = "inOutSine") -> v (number or array) eased between keyed values; holds outside. */
export function ramp(t, keys, ease = "inOutSine") {
  const mix = (a, b, u) => (Array.isArray(a) ? a.map((x, i) => lerp(x, b[i], u)) : lerp(a, b, u));
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t < t1) return mix(v0, v1, toEase(ease)(clamp((t - t0) / Math.max(1e-6, t1 - t0))));
  }
  return keys[keys.length - 1][1];
}
