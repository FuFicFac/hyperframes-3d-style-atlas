// styles/chalkboard/chalk.js — the chalk "program" planner. PURE: no THREE, no window, no DOM (Node-safe).
// style.js reads the plan for the picture (board canvas, floating chalk, eraser, dust) and scene.config.js reads the
// SAME plan for the SCORE (one scratch per stroke, taps on landings, eraser wipes) — sound is on the picture by construction.
//
// A program is a list of items in board metres (board centre = 0,0; y up). Each item starts at `at`, or `gap` after
// item `after`, or `gap` after the previous item. Types:
//   text      { text, x, y (baseline of line 1), cap, align "left"|"center"|"right", color, heading?, lineHeight? }
//   line      { a:[x,y], b:[x,y], bow? }          arrow { a, b, head = .07, bow? }
//   circle    { c:[x,y], rx, ry, a0 = 110, sweep = 372 (deg; > 360 overshoots, never quite closes) }
//   box       { x0, y0, x1, y1 }                    bar  { x0, y0 (base), w, h, hatch?: { spacing, angle, color } }
//   hatch     { rect:[x0,y0,x1,y1], spacing = .03, angle = 62 }
//   underline { x0, x1, y, double = false, spacing = .035 }      strike { x0, x1, y, n = 2 }
//   tick / xmark { c:[x,y], size }
//   smudge    { pts:[[x,y]...], dur = .45, width?, strength? }     erase { rect:[x0,y0,x1,y1], dur?, strength? }
// All items accept color ("white"|"yellow"|"pink"|"blue"|"green" or a hex), seed, speed (m/s override), pressure.
import { rng, hashString, clamp, lerp, smoothstep, toEase } from "../../kit/time.js";
import { STROKE_FONT, layoutStrokeText } from "../../kit/strokefont.js";
import { pathLength } from "../../kit/pathmath.js";
import { noise3 } from "../../kit/noise.js";

/** CHALK_FONT = the kit stroke font, which now includes this style's glyphs _ ≠ ✗ ✓ (promoted 2026-11-13, identical). */
export const CHALK_FONT = { cap: 1, glyphs: { ...STROKE_FONT.glyphs } };

export const CHALK_DEFAULTS = {
  width: 0.0115, headingWidth: 1.25, speed: 5.0, hatchSpeed: 9.0, textSpeed: 54, minTextSpeed: 5.0, retrace: 3.2, minStroke: 0.018,
  penUp: 0.008, charGap: 0.014, wordGap: 0.035, lineGap: 0.07, itemGap: 0.07, step: 0.004,
  jitter: { wobble: 0.022, wobbleFreq: 1.3, baseline: 0.07, lineTilt: 0.012, scaleX: 0.11, scaleY: 0.07, slant: 0.07, slantVar: 0.05,
    rot: 0.035, lift: 0.035, letterSpacing: 0.24, wordSpacing: 0.58 },
  shape: { wobble: 0.0035, wobbleFreq: 4.5, bow: 0.012, overshoot: 0.025 },
  pressure: { text: 0.9, heading: 1.0, shape: 0.85, hatch: 0.55, landing: 0.25, taper: 0.4, skip: 0.13, skipLevel: 0.3 },
  heading: { offset: [0.009, -0.006] },
  eraser: { w: 0.15, h: 0.055, d: 0.04, band: 0.14, speed: 6.0, strength: 0.86, smear: 0.1, lift: 0.5, ret: 0.55 },
  smudge: { width: 0.05, strength: 0.55, smear: 0.1 },
};
const mergeChalk = (o = {}) => {
  const out = { ...CHALK_DEFAULTS, ...o };
  for (const k of ["jitter", "shape", "pressure", "heading", "eraser", "smudge"]) out[k] = { ...CHALK_DEFAULTS[k], ...(o[k] ?? {}) };
  return out;
};

// ---------------------------------------------------------------- polyline helpers (2D, board metres)
const P2 = (p) => [p[0], p[1]];
function cumLen(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}
/** resample(pts, step) -> points every `step` metres along the polyline (ends kept). */
export function resample(pts, step) {
  pts = pts.map(P2);
  if (pts.length < 2) return pts;
  const c = cumLen(pts), L = c[c.length - 1];
  if (L < 1e-6) return [pts[0], pts[0]];
  const n = Math.max(1, Math.ceil(L / step)), out = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * L;
    while (j < pts.length - 1 && c[j] < s) j++;
    const seg = c[j] - c[j - 1] || 1, u = clamp((s - c[j - 1]) / seg);
    out.push([lerp(pts[j - 1][0], pts[j][0], u), lerp(pts[j - 1][1], pts[j][1], u)]);
  }
  return out;
}
/** perpendicular low-frequency wobble (hand tremor) + optional bow (a straight line that sags like a real arm swing). */
function wobble(pts, { amp, freq, seed, bow = 0 }) {
  const c = cumLen(pts), L = c[c.length - 1] || 1, n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const u = c[i] / L;
    const w = amp * (2 * noise3(c[i] * freq, seed * 0.37, 0.5, 7) - 1) + bow * L * Math.sin(Math.PI * u);
    return [p[0] - ty * w, p[1] + tx * w];
  });
}
/** pointAtArc(stroke, s) -> [x, y] at arc length s (binary search on the stroke's cumulative lengths). */
export function pointAtArc(st, s) {
  const c = st.cum, P = st.pts;
  if (s <= 0) return P[0];
  if (s >= st.len) return P[P.length - 1];
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < s) lo = m; else hi = m; }
  const u = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
  return [lerp(P[lo][0], P[hi][0], u), lerp(P[lo][1], P[hi][1], u)];
}
/** Liang–Barsky: clip the infinite line p + d·s to a rect; returns [s0, s1] or null. */
function clipLine(p, d, [x0, y0, x1, y1]) {
  let a = -Infinity, b = Infinity;
  for (const [pp, dd, lo, hi] of [[p[0], d[0], x0, x1], [p[1], d[1], y0, y1]]) {
    if (Math.abs(dd) < 1e-9) { if (pp < lo || pp > hi) return null; continue; }
    let s0 = (lo - pp) / dd, s1 = (hi - pp) / dd;
    if (s0 > s1) [s0, s1] = [s1, s0];
    a = Math.max(a, s0); b = Math.min(b, s1);
  }
  return a < b ? [a, b] : null;
}
/** hatchPath(rect, spacing, angleDeg, seed) -> one continuous zig-zag scribble filling the rect (boustrophedon). */
export function hatchPath(rect, spacing = 0.03, angle = 62, seed = 1) {
  const r = rng(`hatch:${seed}`), A = (angle * Math.PI) / 180, d = [Math.cos(A), Math.sin(A)], nrm = [-d[1], d[0]];
  const corners = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[0], rect[3]], [rect[2], rect[3]]].map((q) => q[0] * nrm[0] + q[1] * nrm[1]);
  const lo = Math.min(...corners), hi = Math.max(...corners), out = [];
  let k = 0;
  for (let o = lo + spacing * 0.5; o < hi; o += spacing * r.range(0.85, 1.15), k++) {
    const p = [nrm[0] * o, nrm[1] * o], s = clipLine(p, d, rect);
    if (!s) continue;
    const inset = spacing * 0.15;
    let a = [p[0] + d[0] * (s[0] + inset * r.next()), p[1] + d[1] * (s[0] + inset * r.next())];
    let b = [p[0] + d[0] * (s[1] - inset * r.next()), p[1] + d[1] * (s[1] - inset * r.next())];
    if (k % 2) [a, b] = [b, a];
    out.push(a, b);
  }
  return out;
}

// ---------------------------------------------------------------- handwriting layout
/**
 * chalkText(item, chalkOpts) -> { strokes: [{ pts, charIndex, line, newWord }], bbox:[x0,y0,x1,y1] }
 * The kit stroke font laid out, then hand-jittered per character (width, height, slant, rotation, lift), with
 * baseline wander and a slight line tilt, then resampled and given a tremor wobble. Deterministic per item seed.
 */
export function chalkText(it, opts = {}) {
  const C = mergeChalk(opts), J = C.jitter, cap = it.cap ?? 0.12;
  const lineH = (it.lineHeight ?? 1.5) * cap;
  const lay = layoutStrokeText(it.text, cap, { font: CHALK_FONT, align: it.align ?? "left", letterSpacing: J.letterSpacing,
    wordSpacing: J.wordSpacing, lineHeight: it.lineHeight ?? 1.5, bendRadius: 0.07 });
  const seed = it.seed ?? it.id ?? it.text;
  const R = rng(`${seed}:line`);
  const tilts = Array.from({ length: lay.lines }, () => R.range(-1, 1) * J.lineTilt);
  const sh = hashString(String(seed)) % 997;
  const out = [];
  let shift = 0, line = -1, prevI = -2;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const c of lay.chars) {
    if (c.line !== line) { shift = 0; line = c.line; prevI = -2; }
    const r = rng(`${seed}:c${c.i}`);
    const sx = 1 + r.range(-1, 1) * J.scaleX, sy = 1 + r.range(-1, 1) * J.scaleY;
    const slant = J.slant + r.range(-1, 1) * J.slantVar, rot = r.range(-1, 1) * J.rot, dy = r.range(-1, 1) * J.lift * cap;
    const w = c.x1 - c.x0, mid = (c.x0 + c.x1) / 2, base = -c.line * lineH;
    const cx = mid + shift + (w * (sx - 1)) / 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const newWord = c.i - prevI > 1;
    prevI = c.i;
    c.strokes.forEach((s) => {
      const raw = s.map(([x, y]) => {
        let lx = (x - mid) * sx, ly = (y - base) * sy;
        lx += slant * ly;
        const rx = lx * cs - ly * sn, ry = lx * sn + ly * cs;
        const X = cx + rx;
        const wander = J.baseline * cap * (2 * noise3(X / cap * 0.33 + sh, c.line * 3.1, 0.25, 13) - 1);
        return [X + (it.x ?? 0), base + ry + dy + wander + tilts[c.line] * X + (it.y ?? 0)];
      });
      const pts = wobble(resample(raw, Math.min(C.step, cap * 0.04)), { amp: J.wobble * cap, freq: J.wobbleFreq / cap, seed: hashString(`${seed}:${c.i}:${out.length}`) % 9973 });
      for (const p of pts) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); }
      out.push({ pts, charIndex: c.i, line: c.line, newWord, first: out.length === 0 || out[out.length - 1].charIndex !== c.i });
    });
    shift += w * (sx - 1);
  }
  return { strokes: out, bbox: [bx0, by0, bx1, by1] };
}
/** textBox(item, chalkOpts) -> [x0, y0, x1, y1]: the jittered ink bounds (place blanks, circles, arrows from this). */
export const textBox = (it, opts) => chalkText(it, opts).bbox;

// ---------------------------------------------------------------- shapes -> raw polylines
function ellipsePts(c, rx, ry, a0, sweep, grow, seed) {
  const n = Math.max(24, Math.ceil(Math.abs(sweep) / 4)), out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = ((a0 + sweep * u) * Math.PI) / 180;
    const k = 1 + grow * u + 0.035 * (2 * noise3(u * 3.2, seed * 0.11, 0, 3) - 1);
    out.push([c[0] + Math.cos(a) * rx * k, c[1] + Math.sin(a) * ry * k]);
  }
  return out;
}

/** strokeProgress(stroke, t) -> 0..1 of arc length drawn (eased: slow landing, quick lift). */
export function strokeProgress(s, t) {
  if (t <= s.t0) return 0;
  if (t >= s.t1) return 1;
  const u = (t - s.t0) / (s.t1 - s.t0);
  return 0.3 * u + 0.7 * u * u * (3 - 2 * u);
}
/** pressureAt(stroke, s, P) -> 0..~1.3 at arc length s: base x grain noise x landing boost x lift taper x skips. */
export function pressureAt(st, s, P = CHALK_DEFAULTS.pressure) {
  const u = st.len > 0 ? s / st.len : 0;
  let p = st.pressure * (0.8 + 0.34 * noise3(s * 9, st.seed * 0.013, 0.5, 9));
  p *= 1 + P.landing * (1 - smoothstep(0, 0.12, u));
  p *= 1 - P.taper * smoothstep(0.82, 1, u);
  if (noise3(s * 38, st.seed * 0.017, 2.5, 5) < P.skip) p *= P.skipLevel;
  return p;
}

/** erasePath(rect, band, seed) -> eraser-centre polyline: boustrophedon rows of height ~band with a hand wave. */
export function erasePath(rect, band, seed = 1) {
  const [x0, y0, x1, y1] = rect, r = rng(`erase:${seed}`);
  const rows = Math.max(1, Math.ceil((y1 - y0) / (band * 0.78)));
  const out = [];
  for (let k = 0; k < rows; k++) {
    const y = rows === 1 ? (y0 + y1) / 2 : y1 - band * 0.45 - ((y1 - y0 - band * 0.9) * k) / (rows - 1);
    const xs = k % 2 ? [x1 - 0.03, x0 + 0.03] : [x0 + 0.03, x1 - 0.03];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      out.push([lerp(xs[0], xs[1], u), y + 0.018 * Math.sin(u * Math.PI * 2 + r.next() * 0.6) + r.range(-0.004, 0.004)]);
    }
  }
  return resample(out, 0.01);
}

const SHAPE_TYPES = new Set(["line", "arrow", "circle", "box", "bar", "hatch", "underline", "strike", "tick", "xmark"]);

/**
 * planChalk(program, chalkOpts) -> { C, items, byId, strokes, ops, events, end }
 *   strokes: [{ id, item, pts, cum, len, t0, t1, color, width, pressure, seed, lift }] in draw order
 *   ops:     strokes + { kind: "erase"|"smudge", path, cum, len, t0, t1, ... } sorted by t0 (the painter's op list)
 *   events:  [{ t, kind: "stroke"|"tap"|"erase"|"smudge"|"eraserLift"|"eraserDrop", ... }] for scoreFromEvents
 */
export function planChalk(program, opts = {}) {
  const C = mergeChalk(opts), J = C.jitter, S = C.shape, PR = C.pressure;
  const items = [], byId = {}, ops = [];
  let lastEnd = 0, order = 0;
  program.forEach((raw, idx) => {
    const it = { ...raw, id: raw.id ?? `${raw.type}${idx}` };
    const start = raw.at ?? (raw.after ? byId[raw.after].end : lastEnd) + (raw.gap ?? C.itemGap);
    const color = raw.color ?? "white";
    const seedBase = hashString(String(raw.seed ?? it.id)) % 100003;
    let t = start, n = 0;
    const addStroke = (pts, o = {}) => {
      pts = pts.length < 2 ? [pts[0], pts[0]] : pts;
      const cum = cumLen(pts), len = cum[cum.length - 1];
      const dur = Math.max(C.minStroke, len / (o.speed ?? C.speed));
      t += o.gap ?? 0;
      const st = { kind: "stroke", id: `${it.id}.${n}`, item: it.id, order: order++, pts, cum, len, t0: t, t1: t + dur, color: o.color ?? color,
        width: C.width * (o.width ?? 1), pressure: (raw.pressure ?? 1) * (o.pressure ?? PR.shape), seed: seedBase + n * 131, lift: o.gap ?? 0, first: n === 0 };
      n++;
      t += dur;
      ops.push(st);
      return st;
    };
    const shape = (pts, o = {}) => wobble(resample(pts, C.step), { amp: S.wobble, freq: S.wobbleFreq, seed: seedBase + n * 17 + 3, bow: o.bow ?? (rng(seedBase + n).range(-1, 1) * S.bow) });
    const spd = raw.speed;
    switch (raw.type) {
      case "text": {
        const { strokes } = chalkText(it, C);
        const cap = raw.cap ?? 0.12, v = spd ?? Math.max(C.textSpeed * cap, C.minTextSpeed), heading = !!raw.heading;
        let prevLine = 0;
        strokes.forEach((s, i) => {
          const gap = i === 0 ? 0 : s.line !== prevLine ? C.lineGap : s.first ? (s.newWord ? C.wordGap : C.charGap) : C.penUp;
          prevLine = s.line;
          addStroke(s.pts, { speed: v, gap, pressure: heading ? PR.heading : PR.text, width: heading ? C.headingWidth : 1 });
          if (heading) {
            const [ox, oy] = C.heading.offset;
            const again = wobble(s.pts.map((p) => [p[0] + ox, p[1] + oy]), { amp: J.wobble * cap * 0.5, freq: J.wobbleFreq / cap, seed: seedBase + i * 7 + 1 });
            addStroke(again, { speed: v * C.retrace, gap: C.penUp * 0.4, pressure: PR.heading * 0.8, width: C.headingWidth * 0.9 });
          }
        });
        break;
      }
      case "line": addStroke(shape([raw.a, raw.b], { bow: raw.bow }), { speed: spd }); break;
      case "arrow": {
        const shaft = shape([raw.a, raw.b], { bow: raw.bow });
        addStroke(shaft, { speed: spd });
        const e = shaft[shaft.length - 1], q = shaft[Math.max(0, shaft.length - 6)];
        const ang = Math.atan2(e[1] - q[1], e[0] - q[0]), h = raw.head ?? 0.07, spread = 0.5;
        const barb = (s) => [e[0] - Math.cos(ang + s * spread) * h, e[1] - Math.sin(ang + s * spread) * h];
        addStroke(shape([barb(1), e, barb(-1)], { bow: 0 }), { speed: spd, gap: C.penUp * 2 });
        break;
      }
      case "circle": addStroke(shape(ellipsePts(raw.c, raw.rx, raw.ry ?? raw.rx, raw.a0 ?? 110, raw.sweep ?? 372, raw.grow ?? 0.06, seedBase), { bow: 0 }), { speed: spd }); break;
      case "box": {
        const { x0, y0, x1, y1 } = raw, o = S.overshoot;
        addStroke(shape([[x0 - o * 0.3, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1 + o]], { bow: 0 }), { speed: spd });
        break;
      }
      case "bar": {
        const { x0, y0, w, h } = raw;
        addStroke(shape([[x0, y0 - 0.008], [x0, y0 + h], [x0 + w, y0 + h], [x0 + w, y0 - 0.008]], { bow: 0 }), { speed: spd });
        if (raw.hatch) {
          const hz = raw.hatch, pad = 0.012;
          const zig = hatchPath([x0 + pad, y0 + pad * 0.5, x0 + w - pad, y0 + h - pad], hz.spacing ?? 0.032, hz.angle ?? 62, seedBase);
          addStroke(shape(zig, { bow: 0 }), { speed: hz.speed ?? C.hatchSpeed, gap: C.penUp * 3, pressure: PR.hatch, color: hz.color ?? color, width: 0.85 });
        }
        break;
      }
      case "hatch": addStroke(shape(hatchPath(raw.rect, raw.spacing ?? 0.03, raw.angle ?? 62, seedBase), { bow: 0 }), { speed: spd ?? C.hatchSpeed, pressure: PR.hatch, width: 0.85 }); break;
      case "underline": {
        const g = raw.spacing ?? 0.035;
        addStroke(shape([[raw.x0, raw.y], [raw.x1, raw.y + 0.008]]), { speed: spd ?? C.speed * 1.3, pressure: PR.heading });
        if (raw.double) addStroke(shape([[raw.x0 + 0.04, raw.y - g], [raw.x1 - 0.02, raw.y - g + 0.006]]), { speed: spd ?? C.speed * 1.4, gap: C.penUp * 3, pressure: PR.heading });
        break;
      }
      case "strike": {
        for (let k = 0; k < (raw.n ?? 2); k++) {
          const dy = (k - ((raw.n ?? 2) - 1) / 2) * 0.03;
          addStroke(shape([[raw.x0, raw.y + dy - 0.012], [raw.x1, raw.y + dy + 0.018]]), { speed: spd ?? C.speed * 1.5, gap: k ? C.penUp * 2 : 0, pressure: PR.heading });
        }
        break;
      }
      case "tick": { const [x, y] = raw.c, z = raw.size ?? 0.1; addStroke(shape([[x - 0.3 * z, y + 0.02 * z], [x - 0.08 * z, y - 0.35 * z], [x + 0.35 * z, y + 0.45 * z]], { bow: 0 }), { speed: spd }); break; }
      case "xmark": {
        const [x, y] = raw.c, z = (raw.size ?? 0.1) / 2;
        addStroke(shape([[x - z, y + z], [x + z, y - z]]), { speed: spd });
        addStroke(shape([[x + z, y + z * 1.05], [x - z * 0.95, y - z]]), { speed: spd, gap: C.penUp * 2 });
        break;
      }
      case "erase": case "smudge": {
        const isE = raw.type === "erase", E = isE ? C.eraser : C.smudge;
        const path = isE ? erasePath(raw.rect, E.band, seedBase) : resample(raw.pts, 0.008);
        const cum = cumLen(path), len = cum[cum.length - 1];
        const dur = raw.dur ?? (isE ? Math.max(0.5, len / E.speed) : 0.45);
        ops.push({ kind: raw.type, id: it.id, item: it.id, order: order++, path, cum, len, pts: path, t0: t, t1: t + dur, rect: raw.rect,
          strength: raw.strength ?? E.strength, smear: raw.smear ?? E.smear, width: raw.width ?? E.width ?? E.w, seed: seedBase });
        t += dur;
        break;
      }
      default:
        if (!SHAPE_TYPES.has(raw.type)) throw new Error(`planChalk: unknown item type "${raw.type}"`);
    }
    it.start = start; it.end = t;
    items.push(it);
    byId[it.id] = it;
    lastEnd = t;
  });
  ops.sort((a, b) => a.t0 - b.t0 || a.order - b.order);
  const strokes = ops.filter((o) => o.kind === "stroke");
  const events = [];
  for (const o of ops) {
    if (o.kind === "stroke") {
      events.push({ t: o.t0, kind: "stroke", dur: o.t1 - o.t0, len: o.len, speed: o.len / (o.t1 - o.t0), pressure: o.pressure, x: o.pts[0][0] });
      if (o.first || o.lift > C.penUp * 1.2) events.push({ t: o.t0, kind: "tap", lift: o.first ? 0.3 : o.lift, x: o.pts[0][0] });
    } else {
      events.push({ t: o.t0, kind: o.kind, dur: o.t1 - o.t0, x: o.path[0][0] });
      if (o.kind === "erase") {
        events.push({ t: o.t0 - C.eraser.lift, kind: "eraserLift", x: o.path[0][0] });
        events.push({ t: o.t1 + C.eraser.ret, kind: "eraserDrop", x: o.path[o.path.length - 1][0] });
      }
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { C, items, byId, strokes, ops, events, end: lastEnd };
}

/** lastStartedIndex(list, t) -> index of the last entry with t0 <= t (-1 if none). list sorted by t0. */
export function lastStartedIndex(list, t) {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].t0 <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

/**
 * tipAt(plan, t, { hop, idle, fade, rest }) -> { x, y, z, down, level, color, dir:[dx,dy] } | null
 *   Where the floating chalk is: on the active stroke (z = 0, down = 1), hopping between strokes (z up to `hop`),
 *   or, in pauses longer than `idle`, lifting away (z -> rest) and fading (level 0..1). Pure in t.
 */
export function tipAt(plan, t, o = {}) {
  const { hop = 0.028, idle = 0.75, fade = 0.3, rest = 0.05 } = o;
  const S = plan.strokes;
  if (!S.length) return null;
  const i = lastStartedIndex(S, t);
  const tan = (s, a) => { const p = pointAtArc(s, Math.max(0, a - 0.01)), q = pointAtArc(s, Math.min(s.len, a + 0.01)); const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const away = (p, k, color, dir) => ({ x: p[0] + 0.05 * k, y: p[1] - 0.06 * k, z: hop + (rest - hop) * k, down: 0, level: 1 - k, color, dir });
  if (i < 0) {
    const s = S[0], k = smoothstep(s.t0, s.t0 - fade, t);
    return away(s.pts[0], k, s.color, [1, 0]);
  }
  const s = S[i];
  if (t <= s.t1) {
    const a = strokeProgress(s, t) * s.len;
    return { ...pt(pointAtArc(s, a)), z: 0, down: 1, level: 1, color: s.color, dir: tan(s, a) };
  }
  const end = s.pts[s.pts.length - 1], nx = S[i + 1];
  const gap = nx ? nx.t0 - s.t1 : Infinity;
  if (gap <= idle) {
    const u = (t - s.t1) / gap, e = u * u * (3 - 2 * u), st = nx.pts[0];
    return { x: lerp(end[0], st[0], e), y: lerp(end[1], st[1], e), z: hop * Math.sin(Math.PI * u) ** 0.7, down: 0, level: 1, color: u < 0.5 ? s.color : nx.color, dir: [st[0] - end[0], st[1] - end[1]] };
  }
  const kOut = smoothstep(s.t1, s.t1 + fade, t);
  if (!nx || t < nx.t0 - fade) return away(end, kOut, s.color, [1, 0]);
  return away(nx.pts[0], smoothstep(nx.t0, nx.t0 - fade, t), nx.color, [1, 0]);
}
const pt = (p) => ({ x: p[0], y: p[1] });

/**
 * eraserAt(plan, t, rest:[x,y,z]) -> { x, y, z, onBoard 0..1, wiping } | null (null = resting on the tray)
 *   The felt eraser lifts from `rest` `eraser.lift` s before each erase op, follows the op's path during the wipe,
 *   and returns over `eraser.ret` s. Pure in t.
 */
export function eraserAt(plan, t, rest) {
  const E = plan.C.eraser;
  for (const o of plan.ops) {
    if (o.kind !== "erase") continue;
    const a = o.t0 - E.lift, b = o.t1 + E.ret;
    if (t < a || t > b) continue;
    const zb = E.d / 2;
    const arc = (p, q, u, h) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u) + h * Math.sin(Math.PI * u), lerp(p[2], q[2], u) + h * 0.6 * Math.sin(Math.PI * u)];
    if (t < o.t0) {
      const u = smoothstep(a, o.t0, t), p0 = o.path[0];
      const [x, y, z] = arc(rest, [p0[0], p0[1], zb], u, 0.12);
      return { x, y, z, onBoard: u, wiping: false };
    }
    if (t > o.t1) {
      const u = smoothstep(o.t1, b, t), p1 = o.path[o.path.length - 1];
      const [x, y, z] = arc([p1[0], p1[1], zb], rest, u, 0.12);
      return { x, y, z, onBoard: 1 - u, wiping: false };
    }
    const p = pointAtArc(o, ((t - o.t0) / (o.t1 - o.t0)) * o.len);
    return { x: p[0], y: p[1], z: zb, onBoard: 1, wiping: true };
  }
  return null;
}

// ---------------------------------------------------------------- framing (pure; camera keys from board regions)
// The board is flat and faces +Z, so the readable shot is a near-straight-on camera at the height of what it frames
// ("eye level"), pulled back exactly far enough that the regions that matter sit inside the safe area. Shots are
// computed, not hand-typed, and framingReport() replays the camera exactly as the kit rig does (eases + drift) to
// prove the heading and every item being drawn stay inside |NDC| <= limit at every sample, mid-move included.
// Board coords = world coords (board group at the origin, as in every demo); pass `origin` otherwise.
export const FRAMING_DEFAULTS = {
  fov: 30, aspect: 16 / 9,
  safe: 0.84,      // regions are fitted to |NDC| <= safe (leaves room for drift + jitter inside the check limit)
  limit: 0.9,      // framingReport fails anything past this: the outer 5 % of the frame
  side: 0.16,      // lateral camera offset (m) for a little parallax on frame/tray; small so the board stays square-on
  up: 0.02,        // camera height above the framed centre (m): eye level, a hair above
  minDist: 2.4, maxDist: 5.4,
  pad: 0.03,       // added around item boxes (chalk width, dust, jitter)
  origin: [0, 0, 0],
};
const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const v3norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** itemBox(plan, id, pad?) -> [x0,y0,x1,y1] board-metre bounds of everything item `id` draws (stroke width included). */
export function itemBox(plan, id, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of plan.ops) {
    if (o.item !== id) continue;
    if (o.kind === "erase" && o.rect) { x0 = Math.min(x0, o.rect[0]); y0 = Math.min(y0, o.rect[1]); x1 = Math.max(x1, o.rect[2]); y1 = Math.max(y1, o.rect[3]); continue; }
    const r = (o.width ?? 0) / 2;
    for (const p of o.pts) { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); }
  }
  if (!isFinite(x0)) throw new Error(`itemBox: no ops for item "${id}"`);
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
/** unionBox(boxes) -> one [x0,y0,x1,y1] around all of them. */
export const unionBox = (boxes) => boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
const regionBox = (plan, r, pad) => (typeof r === "string" ? itemBox(plan, r, pad) : r);

/** projectPoint({pos,target,fov}, p:[x,y,z], aspect) -> [ndcX, ndcY] (perspective, up = +Y, no roll). Same maths as three's lookAt. */
export function projectPoint(cam, p, aspect = 16 / 9) {
  const f = v3norm(v3sub(cam.target, cam.pos)), r = v3norm(v3cross(f, [0, 1, 0])), u = v3cross(r, f);
  const v = v3sub(p, cam.pos), z = v3dot(v, f), th = Math.tan(((cam.fov ?? 30) * Math.PI) / 360);
  return [v3dot(v, r) / z / (th * aspect), v3dot(v, u) / z / th];
}
const boxExtent = (cam, b, aspect, origin) => {
  let m = 0, xs = [Infinity, -Infinity], ys = [Infinity, -Infinity];
  for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
    const [nx, ny] = projectPoint(cam, [x + origin[0], y + origin[1], origin[2]], aspect);
    m = Math.max(m, Math.abs(nx), Math.abs(ny));
    xs = [Math.min(xs[0], nx), Math.max(xs[1], nx)]; ys = [Math.min(ys[0], ny), Math.max(ys[1], ny)];
  }
  return { m, xs, ys };
};

/**
 * boardShot(regions, opts) -> { pos, target, fov } camera key (spread it into a CAMERA key with t/ease).
 *   regions: board boxes [x0,y0,x1,y1] and/or item ids (needs opts.plan). The camera sits `side` m to the right and `up` m
 *   above the regions' centre, looks at it, and backs off until every corner is inside |NDC| <= safe (then re-centres for the
 *   side offset). opts: { plan, fov, aspect, safe, side, up, minDist, maxDist, pad, origin, dist (force), nudge:[dx,dy] }.
 */
export function boardShot(regions, opts = {}) {
  const o = { ...FRAMING_DEFAULTS, ...opts }, org = o.origin;
  const b = unionBox(regions.map((r) => regionBox(o.plan, r, o.pad)));
  let cx = (b[0] + b[2]) / 2 + (o.nudge?.[0] ?? 0), cy = (b[1] + b[3]) / 2 + (o.nudge?.[1] ?? 0);
  const camAt = (d) => ({ pos: [org[0] + cx + o.side, org[1] + cy + o.up, org[2] + d], target: [org[0] + cx, org[1] + cy, org[2]], fov: o.fov });
  const fits = (d) => boxExtent(camAt(d), b, o.aspect, org).m <= o.safe;
  let d = o.dist;
  for (let pass = 0; pass < 3 && d == null; pass++) {
    let lo = 0.5, hi = 60;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    const e = boxExtent(camAt(hi), b, o.aspect, org), th = Math.tan((o.fov * Math.PI) / 360);
    const sx = ((e.xs[0] + e.xs[1]) / 2) * th * o.aspect * hi, sy = ((e.ys[0] + e.ys[1]) / 2) * th * hi;
    if (Math.abs(sx) < 1e-4 && Math.abs(sy) < 1e-4) { d = hi; break; }
    cx += sx; cy += sy; // centre the projected box (the side offset skews it slightly), then refit
    if (pass === 2) d = hi;
  }
  d = clamp(d, o.minDist, o.maxDist);
  const k = camAt(d);
  return { pos: k.pos.map((x) => +x.toFixed(4)), target: k.target.map((x) => +x.toFixed(4)), fov: o.fov };
}

/** sampleCameraKeys(keys, t, drift?) -> { pos, target, fov } exactly as kit/camera.js createCameraRig.sample (linear paths). */
export function sampleCameraKeys(keys, t, drift = null) {
  const K = [...keys].sort((a, b) => a.t - b.t);
  let a = K[0], b = K[0], u = 0;
  if (t >= K[K.length - 1].t) a = b = K[K.length - 1];
  else if (t > K[0].t) for (let i = 0; i < K.length - 1; i++) if (t >= K[i].t && t < K[i + 1].t) { a = K[i]; b = K[i + 1]; u = toEase(b.ease ?? "inOutCubic")(clamp((t - a.t) / (b.t - a.t))); break; }
  if (b.path === "arc") throw new Error("sampleCameraKeys: arc paths are not modelled; use linear keys for board shots");
  const L = (p, q) => p.map((x, i) => lerp(x, q[i], u));
  const pos = L(a.pos, b.pos), target = L(a.target ?? [0, 0, 0], b.target ?? [0, 0, 0]);
  const fov = lerp(a.fov ?? 30, b.fov ?? 30, u);
  if (drift) {
    const { amp = 0.15, speed = 0.25 } = drift;
    pos[0] += Math.sin(t * speed * 2.1) * amp; pos[1] += Math.sin(t * speed * 1.3 + 1.7) * amp * 0.5; pos[2] += Math.cos(t * speed * 1.7 + 0.4) * amp * 0.6;
  }
  return { pos, target, fov };
}

/**
 * framingReport(plan, keys, opts) -> { ok, worst:{t, ndc, id}, rows:[{t, ndc, id}], fails:[...] }
 *   Every `dt` s from 0 to `duration`, the regions that must be fully visible are: every heading item that has started
 *   (it stays on the board) + every item being drawn (start - lead .. end + tail; erase = its rect). opts.must(t) -> extra
 *   [id|box] adds more. Fails anything past `limit` (default .9 = outer 5 %). opts: { duration, dt=.1, drift, lead=.15,
 *   tail=.35, limit, aspect, pad, origin, must }.
 */
export function framingReport(plan, keys, opts = {}) {
  const o = { ...FRAMING_DEFAULTS, dt: 0.1, lead: 0.15, tail: 0.35, ...opts }, org = o.origin;
  const dur = o.duration ?? Math.max(plan.end, keys[keys.length - 1].t);
  const boxes = Object.fromEntries(plan.items.map((it) => [it.id, itemBox(plan, it.id, o.pad)]));
  const rows = [];
  for (let i = 0; i <= Math.round(dur / o.dt); i++) {
    const t = Math.min(dur, i * o.dt), cam = sampleCameraKeys(keys, t, o.drift);
    const need = plan.items.filter((it) => (it.heading && t >= it.start - o.lead) || (t >= it.start - o.lead && t <= it.end + o.tail)).map((it) => [it.id, boxes[it.id]]);
    for (const r of o.must?.(t) ?? []) need.push([typeof r === "string" ? r : "box", regionBox(plan, r, o.pad)]);
    let worst = { t: +t.toFixed(3), ndc: 0, id: null };
    for (const [id, b] of need) { const m = boxExtent(cam, b, o.aspect, org).m; if (m > worst.ndc) worst = { t: worst.t, ndc: +m.toFixed(3), id }; }
    rows.push(worst);
  }
  const fails = rows.filter((r) => r.ndc > o.limit);
  return { ok: !fails.length, worst: rows.reduce((w, r) => (r.ndc > w.ndc ? r : w), rows[0]), rows, fails };
}

/**
 * chalkVoices(sound) -> voices for kit scoreFromEvents(plan.events, voices): chalk scratch per stroke (pitch/speed from
 * the stroke), a low tap on landings (louder after a longer lift), a felt wipe per erase, soft knocks for the eraser.
 */
export function chalkVoices(snd = {}) {
  const sc = { pitch: 0.5, pitchVar: 0.12, gain: 0.3, speedRef: 1.6, ...(snd.scratch ?? {}) };
  const tp = { pitch: 0.3, gain: 0.1, liftGain: 0.22, ...(snd.tap ?? {}) };
  const er = { pitch: 0.36, density: 0.9, gain: 0.5, ...(snd.erase ?? {}) };
  const el = { pitch: 1.8, gain: 0.06, ...(snd.eraserLift ?? {}) }, ed = { pitch: 1.4, gain: 0.13, ...(snd.eraserDrop ?? {}) };
  return {
    stroke: (e, c) => [{ type: "penScratch", dur: e.dur + 0.03, pitch: sc.pitch + sc.pitchVar * (((c.index * 0.618) % 1) - 0.5), speed: c.k(e.speed / sc.speedRef, 0.5, 2), gain: sc.gain * c.k(0.55 + 0.5 * e.pressure, 0.4, 1.2) }],
    tap: (e, c) => [{ type: "click", dur: 0.03, pitch: tp.pitch * (0.9 + 0.2 * ((c.index * 0.37) % 1)), gain: tp.gain + tp.liftGain * c.k(e.lift / 0.25) }],
    erase: (e) => [{ type: "paper", dur: e.dur + 0.05, pitch: er.pitch, density: er.density, gain: er.gain }],
    smudge: (e) => [{ type: "paper", dur: e.dur, pitch: er.pitch * 0.8, density: 0.6, gain: er.gain * 0.5 }],
    eraserLift: () => [{ type: "thud", dur: 0.14, pitch: el.pitch, gain: el.gain }],
    eraserDrop: () => [{ type: "thud", dur: 0.2, pitch: ed.pitch, gain: ed.gain }, { type: "click", dur: 0.03, pitch: 0.45, gain: ed.gain * 0.5, offset: 0.004 }],
  };
}
