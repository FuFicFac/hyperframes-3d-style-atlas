// styles/felt-stitch/stitches.js — the pure stitch planner + fabric motion for "Felt & Stitch".
// NO THREE, no window, no DOM: imports only kit/time.js, kit/pathmath.js, kit/strokefont.js and this style's
// spec (plain data), so scene.config.js can import it too and derive SFX (one thread tick per stitch, a pat per
// landing) from the SAME plan the picture uses. Exposed as `style.plan`.
//
// A stitch plan is an ordered list of segments { a:[x,y,h], b:[x,y,h], arch?, color? } in the 2D plane of a
// felt surface (x, y in metres; h = extra height above the surface, usually 0). Order = sewing order.
// keyed(segs) adds `key` (0..1, cumulative needle travel) so a reveal progress p shows every stitch with
// key < p; the 3D builder (style.js stitchMesh) turns a plan into raised thread geometry.
import { clamp, lerp, ease, spring, hash01 } from "../../kit/time.js";
import { expandStroke, filletPath, pathLength, pointAt } from "../../kit/pathmath.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { STYLE_SPEC } from "./spec.js";

const TH = STYLE_SPEC.thread, TUNE = STYLE_SPEC.tuning, TXT = STYLE_SPEC.text;
const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const P3 = (p) => [p[0], p[1], p[2] ?? 0];

/** toPoints(points | stroke, { closed }) -> [[x,y,0]...] (arcs expanded; closed repeats the first point). */
export function toPoints(src, { closed = false } = {}) {
  const pts = expandStroke(src).map((p) => [p[0], p[1], 0]);
  if (closed && pts.length > 2 && d2(pts[0], pts[pts.length - 1]) > 1e-6) pts.push(pts[0].slice());
  return pts;
}

/** signedArea(poly) (> 0 = counter-clockwise). */
export function signedArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return s / 2;
}

/** walk(pts, step, offset = 0) -> samples every `step` metres: [{ p, t (tangent), n (left normal), s }]. */
export function walk(pts, step, offset = 0) {
  const L = pathLength(pts), out = [];
  for (let s = offset; s <= L + 1e-9; s += step) {
    const { p, t } = pointAt(pts, s);
    out.push({ p, t, n: [-t[1], t[0], 0], s });
  }
  return out;
}

/** runningStitch(points|stroke, { len, gap, closed, offset, fit = true }) -> segments (dashes along the path).
 *  fit: stretch len/gap slightly so the path holds a whole number of stitches (no stub at the end). */
export function runningStitch(src, o = {}) {
  const { closed = false, offset = 0, fit = true } = o;
  let len = o.len ?? TH.run.len, gap = o.gap ?? TH.run.gap;
  const pts = toPoints(src, { closed });
  const L = pathLength(pts) - offset;
  if (fit && L > len) {
    const n = Math.max(1, Math.round((L + (closed ? 0 : gap)) / (len + gap)));
    const k = (L + (closed ? 0 : gap)) / (n * (len + gap));
    len *= k; gap *= k;
  }
  const segs = [];
  for (let s = offset; s + len <= offset + L + 1e-6; s += len + gap) {
    segs.push({ a: P3(pointAt(pts, s).p), b: P3(pointAt(pts, s + len).p) });
  }
  return segs;
}

/** backstitch(points|stroke, { len, gapRatio }) -> continuous stitches along a path (lettering, outlines). */
export function backstitch(src, o = {}) {
  const pts = Array.isArray(src[0]) && typeof src[0][0] === "number" && src.every((p) => typeof p[0] === "number") ? src.map(P3) : toPoints(src);
  const L = pathLength(pts);
  const len0 = o.len ?? TH.back.len, gr = o.gapRatio ?? TH.back.gapRatio;
  const n = Math.max(1, Math.round(L / len0));
  const step = L / n, gap = step * gr;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const s0 = i * step + (i ? gap / 2 : 0), s1 = (i + 1) * step - (i < n - 1 ? gap / 2 : 0);
    segs.push({ a: P3(pointAt(pts, s0).p), b: P3(pointAt(pts, Math.max(s0 + 1e-4, s1)).p) });
  }
  if (L < 1e-4 && pts.length) segs.push({ a: pts[0], b: [pts[0][0], pts[0][1] - 0.02, 0] }); // a dot
  return segs;
}

/**
 * blanketStitch(polygon|stroke, { step, depth, closed = true, wrap = .6 }) -> segments: a perpendicular leg
 * from `depth` inside the edge out to the edge, then a loop along the edge to the next leg (legs and loops
 * alternate in sewing order). Loops sit on the rim (h = -wrap x thread radius x 2, i.e. rolled over the edge).
 */
export function blanketStitch(src, o = {}) {
  const { closed = true, wrap = 0.6 } = o;
  const step = o.step ?? TH.blanket.step, depth = o.depth ?? TH.blanket.depth;
  const pts = toPoints(src, { closed });
  const inward = signedArea(pts) > 0 ? 1 : -1; // CCW: left normal points inside
  const L = pathLength(pts);
  const n = Math.max(3, Math.round(L / step));
  const st = L / n, segs = [];
  const rim = -wrap * TH.radius * 2;
  const legs = closed ? n : n + 1;
  const at = (i) => {
    const q = pointAt(pts, (closed ? i % n : i) * st);
    const nI = [-q.t[1] * inward, q.t[0] * inward];
    return { p: q.p, nI, edge: [q.p[0] - nI[0] * TH.radius * 0.6, q.p[1] - nI[1] * TH.radius * 0.6, rim] };
  };
  for (let i = 0; i < legs; i++) {
    const A = at(i);
    segs.push({ a: [A.p[0] + A.nI[0] * depth, A.p[1] + A.nI[1] * depth, 0], b: A.edge, kind: "leg" });
    if (closed || i < n) segs.push({ a: A.edge, b: at(i + 1).edge, kind: "loop", arch: 0.35 });
  }
  return segs;
}

/** crossStitch(points [[x,y]...], { size }) -> two diagonals per point ("/" then "\"). */
export function crossStitch(points, o = {}) {
  const s = (o.size ?? TH.cross.size) / 2, segs = [];
  for (const p of points) {
    segs.push({ a: [p[0] - s, p[1] - s, 0], b: [p[0] + s, p[1] + s, 0] });
    segs.push({ a: [p[0] - s, p[1] + s, 0], b: [p[0] + s, p[1] - s, 0], h: 0.5 });
  }
  return segs;
}

/** satinFill(polygon [[x,y]...], { spacing (m), angle (rad) }) -> long parallel stitches covering the shape,
 *  zig-zag sewing order (scanlines clipped to the polygon; concave shapes give several stitches per line). */
export function satinFill(poly, o = {}) {
  const spacing = o.spacing ?? TH.radius * TH.satin.spacing, ang = o.angle ?? 0.7;
  const c = Math.cos(ang), s = Math.sin(ang);
  const rot = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];   // into scan frame
  const back = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const P = poly.map(rot);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const segs = [];
  let k = 0;
  for (let y = y0 + spacing / 2; y < y1; y += spacing, k++) {
    const xs = [];
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[j], b = P[i];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((u, v) => u - v);
    const row = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > spacing * 0.6) row.push([xs[i], xs[i + 1]]);
    if (k % 2) row.reverse();
    for (const [xa, xb] of row) {
      const A = back([xa, y]), B = back([xb, y]);
      segs.push(k % 2 ? { a: [B[0], B[1], 0], b: [A[0], A[1], 0], arch: 0.3 } : { a: [A[0], A[1], 0], b: [B[0], B[1], 0], arch: 0.3 });
    }
  }
  return segs;
}

/**
 * embroideredText(text, cap, { len, gapRatio, align, letterSpacing, wordSpacing, lineHeight, bendRadius })
 *   -> { segs (backstitch, each tagged { char: i }), chars, width, lines, height, cap, radius }
 *   Element-local metres: x centred (align), baseline of line 0 at y = 0, lines go down.
 */
export function embroideredText(text, cap, o = {}) {
  const lay = layoutStrokeText(text, cap, {
    letterSpacing: o.letterSpacing ?? TXT.letterSpacing, wordSpacing: o.wordSpacing ?? TXT.wordSpacing,
    lineHeight: o.lineHeight ?? TXT.lineHeight, align: o.align ?? "center", bendRadius: o.bendRadius ?? TXT.bendRadius,
  });
  const len = o.len ?? Math.max(0.06, cap * 0.3);
  const segs = [];
  lay.chars.forEach((ch, ci) => {
    for (const st of ch.strokes) for (const sg of backstitch(st, { len, gapRatio: o.gapRatio ?? TH.back.gapRatio })) segs.push({ ...sg, char: ci });
  });
  const lineH = (o.lineHeight ?? TXT.lineHeight) * cap;
  return { segs, chars: lay.chars, width: lay.width, lines: lay.lines, height: cap + (lay.lines - 1) * lineH, cap, radius: cap * (o.threadRatio ?? TXT.threadRatio) };
}

// strokeOutline: kit/pathmath.js (promoted, identical)
export { strokeOutline } from "../../kit/pathmath.js";

/** keyed(segs, { travel = .35 }) -> segs with key (0..1) by cumulative stitch + needle travel length. */
export function keyed(segs, { travel = 0.35 } = {}) {
  let acc = 0;
  const lens = segs.map((s, i) => {
    const prev = i ? segs[i - 1].b : s.a;
    const l = d2(s.a, s.b) + travel * d2(prev, s.a);
    return l;
  });
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  return segs.map((s, i) => { const k0 = acc / total; acc += lens[i]; return { ...s, key: k0, key1: acc / total }; });
}

/** concat(...plans) -> one sewing order (each plan's stitches after the previous). */
export const concat = (...plans) => plans.flat();

// ------------------------------------------------------------------------------- timing (for picture + SFX)
/** sewTimes(count, start, dur) -> onset time of each stitch when `count` stitches are sewn evenly over dur. */
export const sewTimes = (count, start, dur) => Array.from({ length: count }, (_, i) => start + ((i + 0.5) / count) * dur);
/** sewProgress(t, start, dur) -> reveal progress 0..1 (linear: a needle sews at a steady pace). */
export const sewProgress = (t, start, dur) => clamp((t - start) / Math.max(1e-6, dur));
/** sewDur(count, rate = stitchesPerSecond) -> seconds to sew `count` stitches. */
export const sewDur = (count, rate = TUNE.stitchesPerSecond) => count / rate;

// ------------------------------------------------------------------------------- fabric motion (pure f(t))
/** onTwos(t, fps = tuning.fps) -> t quantised to the pose rate. */
export const onTwos = (t, fps = TUNE.fps) => Math.floor(t * fps + 1e-6) / fps;
/** vol(sy) -> [sx, sy, sz] volume-preserving squash (z kept flat-ish: felt is thin). */
export const vol = (sy) => { const k = 1 / Math.sqrt(Math.max(sy, 0.05)); return [k, sy, 1]; };

/** flop(t, start, { from, stiffness, damping }) -> hinge angle: `from` before start, soft underdamped fall to 0
 *  (a piece of felt laid onto the board flaps down and settles). */
export function flop(t, start, o = {}) {
  const f = { ...TUNE.flop, ...o };
  if (t < start) return f.from;
  return f.from * (1 - spring(t - start, f));
}
/** peel(t, start, dur = peelDur, to = flop.from) -> hinge angle 0 -> `to` (lifting off), eased. */
export function peel(t, start, dur = TUNE.peelDur, to = TUNE.flop.from) {
  if (t < start) return 0;
  return to * ease.inOutCubic(clamp((t - start) / dur));
}
/**
 * hop(t, start, { dur = .5, height, squash, stretch, anticipation, settle }) -> { y, scale:[sx,sy,sz], phase }
 *   crouch before start, stretched parabolic hop, squashy landing with an underdamped settle.
 */
export function hop(t, start, o = {}) {
  const H = { ...TUNE.hop, dur: 0.5, ...o };
  const a0 = start - H.anticipation;
  if (t < a0) return { y: 0, scale: [1, 1, 1], phase: "wait" };
  if (t < start) { const c = Math.sin(((t - a0) / H.anticipation) * Math.PI * 0.5); return { y: 0, scale: vol(1 - H.squash * 0.8 * c), phase: "crouch" }; }
  const u = (t - start) / H.dur;
  if (u < 1) {
    const sy = 1 + H.stretch * Math.sin(Math.PI * Math.min(1, u * 1.6)) ;
    return { y: 4 * H.height * u * (1 - u), scale: vol(sy), phase: "air" };
  }
  const sy = 1 - H.squash * (1 - spring(t - start - H.dur, H.settle));
  return { y: 0, scale: vol(sy), phase: "land" };
}
/** hopLand(start, dur = .5) -> time of the landing (for the SFX pat). */
export const hopLand = (start, dur = 0.5) => start + dur;
/** wobble(t, start, end, { amp, hz, seed }) -> rotation (rad), enveloped in/out: a soft toy "working". */
export function wobble(t, start, end, o = {}) {
  if (t < start || t > end) return 0;
  const amp = o.amp ?? TUNE.wobble.amp, hz = o.hz ?? TUNE.wobble.hz;
  const u = (t - start) / (end - start);
  const env = Math.sin(Math.PI * u) ** 0.5;
  return amp * env * Math.sin((t - start) * hz * Math.PI * 2 + (o.seed ?? 0));
}
/** travel(t, start, dur, pathPts) -> { p:[x,y,z], t (tangent), u } eased position along a path (inOutSine). */
export function travel(t, start, dur, pts) {
  const u = ease.inOutSine(clamp((t - start) / dur));
  const L = pathLength(pts);
  const q = pointAt(pts, u * L);
  return { p: q.p, t: q.t, u };
}
/** sparks(t, start, { n, seed, spread, up, gravity, life }) -> [{ p:[x,y], s (scale), r (rot), i }] ballistic felt
 *  bits popping out of a working character (closed form; nothing accumulates). Empty before start. */
export function sparks(t, start, o = {}) {
  const { n = 6, seed = 1, spread = 1.1, up = 2.6, gravity = 6.5, life = 0.9, every = 0.22 } = o;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = start + i * every;
    const tau = t - t0;
    if (tau < 0 || tau > life) continue;
    const vx = (hash01(seed, i, 1) - 0.5) * 2 * spread, vy = up * (0.75 + 0.5 * hash01(seed, i, 2));
    const k = tau / life;
    out.push({ i, p: [vx * tau, vy * tau - 0.5 * gravity * tau * tau], s: Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.6, r: (hash01(seed, i, 3) - 0.5) * 6 * tau, k });
  }
  return out;
}
/** smoothPath(points [[x,y]...], bend) -> filleted polyline [[x,y,0]...] (for stitched routes). */
export const smoothPath = (pts, bend = 0.6) => filletPath(pts.map(P3), bend);
export { lerp };
