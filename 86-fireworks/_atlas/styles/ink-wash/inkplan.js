// styles/ink-wash/inkplan.js — the brush-and-ink planner. PURE: no THREE, no window, no DOM (Node-safe).
// style.js reads the plan for the picture (the ink layer, the brush pose, the seal block, water ripples) and
// scene.config.js reads the SAME plan for BEATS, camera shots and SCORE (one swish per stroke with the stroke's own
// length, drips after every dip, a press for the seal) — sound is on the picture by construction.
//
// Paper coordinates: metres on the sheet, sheet centre = (0, 0), +x right, +y AWAY from the camera (world -Z).
// A program is a list of items. Each item starts when the brush gets there: after the previous item, plus `gap`, plus
// any travel / dip the brush needs (or at `at` if that is later). Types:
//   stroke   { path:[[x,y]...], smooth?, profile, width, tone, color, speed, load, dwell }
//   line     { a, b, bow }            arrow { a, b, head, bow }           circle { c, r, a0, sweep (deg) }  (ensō)
//   text     { text, x, y, cap, align, width (fraction of cap), tone, color, profile }   (kit stroke font, brushed)
//   wash     { shape:[[x,y]...] | ellipse:{ c, rx, ry }, dir (deg, sweep direction), tone, color, grade:[start,end],
//              mist:[a,b] (fraction of the sweep where it fades out), dur, bloom, inset }
//   bloom    { c, r, color, tone, tau, petals }     (wet-in-wet: a drop of colour into a wet wash)
//   splatter { c, dir (deg), n, reach, spread, size:[min,max], tone, color }
//   seal     { c, size, color, pattern }            (abstract geometric seal, pressed by the seal block)
//   pause    { dur }                     park { }  (brush back to its rest, lying down)
// All painting items accept: dip ("ink"|"water"|"vermilion"|"indigo" — visit that station first; "water" swirls),
// rinse (visit water first), gap, at, seed, id.
import { rng, hashString, clamp, lerp, smoothstep } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { filletPath } from "../../kit/pathmath.js";
import { noise3 } from "../../kit/noise.js";
import { projectPoint } from "../../kit/framing.js";

export const INK_DEFAULTS = {
  sheet: { w: 3.0, h: 1.7 },
  step: 0.006,          // stroke resample step (m)
  width: 0.06,          // full stroke width at pressure 1 (m)
  minWidth: 0.18,       // width fraction at pressure 0
  speed: 1.25,          // stroke peak speed (m/s)
  textSpeed: 1.0,
  vMin: 0.3,            // speed at landing / lift as a fraction of the peak
  dwell: 0.07,          // the brush presses before it moves (s): pooled dark at the start
  penUp: 0.12,          // brush hop between strokes of one item (s)
  itemGap: 0.06,
  travelSpeed: 3.2,     // brush flight between items (m/s)
  minTravel: 0.22,
  hop: 0.07,            // flight height (m)
  hover: 0.05,          // height of the brush tip above a station before it dips
  dipDur: 0.34, swirlDur: 0.55,
  dabDur: 0.24, flickDur: 0.26,
  consume: 6.0,         // ink load used per m² of stroke area (load 1 = a full brush)
  washRow: 0.085,       // wash zig-zag row spacing (m)
  washSpeed: 0.55,      // m² per second when dur is not given
  parkDur: 0.55,
  seal: { lift: 0.32, travel: 0.42, press: 0.16, ret: 0.4, hover: 0.12 },
  pool: { amount: 0.4, len: 0.05 },
  profiles: {
    "press-lift": [[0, 0.95], [0.08, 1], [0.55, 0.82], [0.88, 0.55], [1, 0.12]],
    swell: [[0, 0.18], [0.22, 0.7], [0.55, 1], [0.85, 0.62], [1, 0.1]],
    even: [[0, 0.7], [0.06, 0.88], [0.9, 0.85], [1, 0.3]],
    taper: [[0, 0.12], [0.35, 0.65], [0.8, 1], [1, 0.95]],
    sweep: [[0, 0.95], [0.2, 0.9], [0.7, 0.6], [1, 0.25]],
    dot: [[0, 1], [1, 1]],
  },
  stations: {
    ink: { x: -1.02, y: 1.14, h: 0.05 },
    water: { x: -0.32, y: 1.16, h: 0.062 },
    vermilion: { x: 0.2, y: 1.13, h: 0.024 },
    indigo: { x: 0.36, y: 1.1, h: 0.024 },
    rest: { x: 0.95, y: 1.13, h: 0.05 },
    seal: { x: 1.3, y: 1.1, h: 0.0 },
  },
};

const merge = (o = {}) => {
  const out = { ...INK_DEFAULTS, ...o };
  for (const k of ["sheet", "pool", "profiles", "stations", "seal"]) out[k] = { ...INK_DEFAULTS[k], ...(o[k] ?? {}) };
  return out;
};

// ------------------------------------------------------------------------------------------------ polyline helpers
const P2 = (p) => [p[0], p[1]];
export function cumLen(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}
/** resample(pts, step) -> points every ~step metres (ends kept). */
export function resample(pts, step) {
  pts = pts.map(P2);
  if (pts.length < 2) return [pts[0], pts[0]];
  const c = cumLen(pts), L = c[c.length - 1];
  if (L < 1e-6) return [pts[0], [pts[0][0] + 1e-4, pts[0][1]]];
  const n = Math.max(2, Math.ceil(L / step)), out = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * L;
    while (j < pts.length - 1 && c[j] < s) j++;
    const u = clamp((s - c[j - 1]) / ((c[j] - c[j - 1]) || 1));
    out.push([lerp(pts[j - 1][0], pts[j][0], u), lerp(pts[j - 1][1], pts[j][1], u)]);
  }
  return out;
}
/** smoothPath(ctrl, perSeg = 16) -> centripetal-ish Catmull-Rom through the control points. */
export function smoothPath(ctrl, perSeg = 16) {
  if (ctrl.length < 3) return ctrl.map(P2);
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]].map(P2), out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < perSeg; k++) {
      const u = k / perSeg, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3)));
    }
  }
  out.push(P2(ctrl[ctrl.length - 1]));
  return out;
}
/** atArc(pts, cum, s) -> [x, y] at arc length s (binary search). */
export function atArc(pts, cum, s) {
  const L = cum[cum.length - 1];
  if (s <= 0) return pts[0];
  if (s >= L) return pts[pts.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
  const u = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
  return [lerp(pts[lo][0], pts[hi][0], u), lerp(pts[lo][1], pts[hi][1], u)];
}
/** profileAt(profile [[u,p]...], u) -> piecewise-linear pressure. */
export function profileAt(prof, u) {
  if (u <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) return lerp(prof[i - 1][1], prof[i][1], (u - prof[i - 1][0]) / ((prof[i][0] - prof[i - 1][0]) || 1));
  return prof[prof.length - 1][1];
}
/** pointInPoly(p, poly) — even/odd. */
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}
/** polySdf(poly, x, y) -> signed distance (m), negative inside. */
export function polySdf(poly, x, y) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], ex = b[0] - a[0], ey = b[1] - a[1];
    const u = clamp(((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1e-12));
    d = Math.min(d, Math.hypot(x - a[0] - ex * u, y - a[1] - ey * u));
  }
  return pointInPoly([x, y], poly) ? -d : d;
}
const bboxOf = (pts, pad = 0) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};
const ellipsePoly = ({ c, rx, ry = rx }, n = 72, seed = 1, wob = 0.03) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, k = 1 + wob * (2 * noise3(Math.cos(a) * 1.3 + 3, Math.sin(a) * 1.3, seed * 0.13, 4) - 1);
    return [c[0] + Math.cos(a) * rx * k, c[1] + Math.sin(a) * ry * k];
  });

// ------------------------------------------------------------------------------------------------ subject helpers
/**
 * mountainShape({ x0, x1, base, peak:[x,y], seed, rough, shoulder }) -> { shape (polygon), ridge (left base -> peak -> right base) }
 *   A brushed mountain silhouette: concave flanks, fbm jaggedness, a softly waved base line (the wash's mist hides it).
 */
export function mountainShape(o) {
  const { x0, x1, base, peak, seed = 1, rough = 0.035, shoulder = 0.35 } = o;
  const n = 46, ridge = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = lerp(x0, x1, u);
    const left = x <= peak[0];
    const k = left ? (x - x0) / (peak[0] - x0 || 1) : (x1 - x) / (x1 - peak[0] || 1); // 0 at base, 1 at peak
    const prof = Math.pow(clamp(k), 1.6) * (1 - shoulder) + shoulder * Math.sin((Math.PI / 2) * clamp(k));
    const j = rough * (2 * noise3(x * 4.1, seed * 0.7, 0.3, 5) - 1) + rough * 0.5 * (2 * noise3(x * 11, seed * 1.3, 0.6, 3) - 1);
    ridge.push([x, base + (peak[1] - base) * prof + j * Math.sin(Math.PI * u)]);
  }
  const bottom = [];
  for (let i = n; i >= 0; i -= 2) { const x = lerp(x0, x1, i / n); bottom.push([x, base - 0.04 - 0.03 * noise3(x * 3, seed, 1.7, 2)]); }
  return { shape: [...ridge, ...bottom], ridge };
}
/** boatItems({ c:[x,y], len, tone, seed }) -> program items: hull, mast, sail. */
export function boatItems({ c, len = 0.3, tone = 1, seed = 1, width = 0.045 }) {
  const [x, y] = c, h = len * 0.16;
  return [
    { type: "stroke", id: "boatHull", path: smoothPath([[x - len / 2, y + h * 0.4], [x - len * 0.2, y - h * 0.35], [x + len * 0.25, y - h * 0.32], [x + len / 2, y + h * 0.55]], 10), profile: "press-lift", width, tone, seed },
    { type: "stroke", id: "boatMast", path: [[x - len * 0.02, y - h * 0.2], [x + len * 0.02, y + len * 0.62]], profile: "taper", width: width * 0.45, tone, seed: seed + 1 },
    { type: "stroke", id: "boatSail", path: smoothPath([[x + len * 0.04, y + len * 0.58], [x + len * 0.22, y + len * 0.3], [x + len * 0.3, y + len * 0.06]], 8), profile: "swell", width: width * 0.6, tone: tone * 0.75, seed: seed + 2 },
  ];
}
/** birdItem({ c, size, flip, tone }) -> one stroke: a gull "v" with curved wings. */
export function birdItem({ c, size = 0.12, flip = 1, tone = 1, id, width = 0.022 }) {
  const [x, y] = c, s = size;
  return { type: "stroke", id, path: smoothPath([[x - s * flip, y + s * 0.35], [x - s * 0.45 * flip, y + s * 0.42], [x, y], [x + s * 0.4 * flip, y + s * 0.5], [x + s * 0.95 * flip, y + s * 0.45]], 8), profile: "swell", width, tone, speed: 0.9 };
}

// ------------------------------------------------------------------------------------------------ planning
/**
 * planInk(program, opts) -> plan
 *   plan.strokes: [{ id, item, pts, cum, len, tt[], w[], load[], speed[], tone, color, seed, t0, t1, wet }]
 *   plan.washes:  [{ id, poly, bbox, dir, qMin, qMax, t0, t1, tone, color, grade, mist, bloom, tau, inset, seed }]
 *   plan.blots:   [{ id, kind "bloom"|"drop", c, r, t0, tau, tone, color, petals, seed, rim }]
 *   plan.seals:   [{ id, c, size, t0, color, seed, pattern }]
 *   plan.moves:   brush timeline segments (contiguous from 0 to end), read by brushPose(plan, t)
 *   plan.stamp:   seal-block timeline segments, read by stampPose(plan, t)
 *   plan.dips:    [{ t, station, swirl }] (water ripples)
 *   plan.items / byId: { id, type, start, end, box }
 *   plan.events:  sound events for scoreFromEvents (inkVoices)
 */
export function planInk(program, opts = {}) {
  const C = merge(opts), ST = C.stations;
  const strokes = [], washes = [], blots = [], seals = [], moves = [], stamp = [], dips = [], items = [], byId = {}, events = [];
  let t = 0;
  let pos = [ST.ink.x, ST.ink.y, ST.ink.h - 0.012]; // the brush starts dipped in the ink stone
  let color = "ink", load = 1, parked = false;
  const push = (m) => { moves.push(m); t = m.t1; };
  const hold = (dur, extra = {}) => { if (dur > 1e-6) push({ kind: parked ? "parked" : "hold", t0: t, t1: t + dur, pos: pos.slice(), color, load, ...extra }); };
  const fly = (to, o = {}) => {
    if (parked) { // stand the brush back up off its rest first
      const R = ST.rest, up = [R.x, R.y, R.h + 0.12];
      push({ kind: "park", rev: true, t0: t, t1: t + C.parkDur, from: up, at: pos.slice(), color, load });
      pos = up; parked = false;
    }
    const d = Math.hypot(to[0] - pos[0], to[1] - pos[1], to[2] - pos[2]);
    const dur = Math.max(o.min ?? C.minTravel, d / C.travelSpeed);
    push({ kind: "travel", t0: t, t1: t + dur, a: pos.slice(), b: to.slice(), hop: o.hop ?? Math.min(C.hop, 0.03 + d * 0.08), color, load });
    pos = to.slice();
  };
  const visit = (name) => {
    const S = ST[name];
    if (!S) throw new Error(`planInk: unknown station "${name}"`);
    fly([S.x, S.y, S.h + C.hover]);
    const swirl = name === "water", dur = swirl ? C.swirlDur : C.dipDur;
    const t0 = t;
    push({ kind: "dip", t0, t1: t0 + dur, at: [S.x, S.y, S.h], swirl, color, load, station: name });
    dips.push({ t: t0 + dur * 0.3, station: name, swirl, x: S.x, y: S.y, dur });
    events.push({ t: t0 + dur * 0.28, kind: swirl ? "rinse" : "dip", station: name, dur: dur * 0.5, x: S.x });
    events.push({ t: t0 + dur + 0.1, kind: "drip", station: name, x: S.x, n: 0 });
    if (swirl || name === "vermilion" || name === "indigo") events.push({ t: t0 + dur + 0.36, kind: "drip", station: name, x: S.x, n: 1 });
    if (!swirl) color = name;
    if (name !== "water") load = 1;
    else load = Math.max(load, 0.7);
    pos = [S.x, S.y, S.h + C.hover];
    moves[moves.length - 1].colorAfter = color;
  };
  const begin = (raw, idx) => {
    const id = raw.id ?? `${raw.type}${idx}`;
    const seed = hashString(String(raw.seed ?? id)) % 100003;
    if (raw.rinse) visit("water");
    if (raw.dip) visit(raw.dip);
    return { id, seed };
  };

  // one brushed stroke along pts (paper metres); returns the stroke record
  const addStroke = (pts, o, item, k) => {
    pts = resample(pts, C.step);
    const cum = cumLen(pts), L = cum[cum.length - 1], n = pts.length;
    const prof = typeof o.profile === "string" || !o.profile ? C.profiles[o.profile ?? "press-lift"] : o.profile;
    const width = o.width ?? C.width, vmax = o.speed ?? C.speed, seed = o.seed;
    // land: fly to the start, touching down at h = 0
    const start = [pts[0][0], pts[0][1], 0];
    if (Math.hypot(start[0] - pos[0], start[1] - pos[1]) > 1e-4 || pos[2] > 1e-4) fly(start, { min: o.hopTime ?? C.minTravel });
    const t0 = t, dwell = o.dwell ?? C.dwell;
    const tt = new Array(n), w = new Array(n), ld = new Array(n), sp = new Array(n);
    let time = t0 + dwell, lo = o.load ?? load;
    for (let i = 0; i < n; i++) {
      const u = L > 0 ? cum[i] / L : 0;
      const v = vmax * (C.vMin + (1 - C.vMin) * Math.pow(Math.sin(Math.PI * clamp(u, 0.02, 0.98)), 0.6));
      if (i > 0) time += (cum[i] - cum[i - 1]) / v;
      let p = profileAt(prof, u) * (1 + 0.1 * (2 * noise3(cum[i] * 7, seed * 0.011, 0.5, 9) - 1));
      p = clamp(p, 0, 1.15);
      const hw = 0.5 * width * (C.minWidth + (1 - C.minWidth) * p);
      if (i > 0) lo = Math.max(0.04, lo - C.consume * (hw + w[i - 1]) * (cum[i] - cum[i - 1]));
      tt[i] = time; w[i] = hw; ld[i] = lo; sp[i] = v;
    }
    load = lo;
    const st = { id: `${item.id}.${k}`, item: item.id, pts, cum, len: L, tt, w, load: ld, speed: sp, tone: o.tone ?? 1, color: o.color ?? color,
      seed, t0, t1: tt[n - 1], wet: o.wet ?? 1, pool: o.pool ?? C.pool.amount, poolLen: C.pool.len, width };
    strokes.push(st);
    push({ kind: "stroke", t0, t1: st.t1, stroke: strokes.length - 1, color: st.color, load });
    pos = [pts[n - 1][0], pts[n - 1][1], 0];
    const avgP = w.reduce((a, b) => a + b, 0) / n / (0.5 * width);
    events.push({ t: t0, kind: "stroke", dur: st.t1 - t0, len: L, width, pressure: avgP, x: pts[0][0], dry: 1 - ld[n - 1] });
    return st;
  };
  const liftAfter = (gapDur) => {
    // lift a little and hover (the next item's fly() takes it from here)
    const up = [pos[0], pos[1], C.hop * 0.6];
    push({ kind: "travel", t0: t, t1: t + gapDur, a: pos.slice(), b: up, hop: 0, color, load });
    pos = up;
  };

  program.forEach((raw, idx) => {
    const notBefore = raw.at ?? 0;
    if (idx > 0 && raw.type !== "pause") hold(raw.gap ?? C.itemGap);
    if (t < notBefore) hold(notBefore - t);
    const { id, seed } = begin(raw, idx);
    const it = { id, type: raw.type, start: t, raw };
    const pts = [];
    switch (raw.type) {
      case "stroke": case "line": case "arrow": case "circle": {
        const list = [];
        const bowed = (a, b, bow = 0) => smoothPath([a, [lerp(a[0], b[0], 0.5) - (b[1] - a[1]) * bow, lerp(a[1], b[1], 0.5) + (b[0] - a[0]) * bow], b], 12);
        if (raw.type === "stroke") list.push(raw.smooth ? smoothPath(raw.path, raw.smooth) : raw.path.map(P2));
        if (raw.type === "line") list.push(bowed(raw.a, raw.b, raw.bow ?? 0.03));
        if (raw.type === "arrow") {
          const shaft = bowed(raw.a, raw.b, raw.bow ?? 0.02);
          const e = shaft[shaft.length - 1], q = shaft[shaft.length - 4], ang = Math.atan2(e[1] - q[1], e[0] - q[0]), h = raw.head ?? 0.12;
          list.push(shaft, [[e[0] - Math.cos(ang + 0.55) * h, e[1] - Math.sin(ang + 0.55) * h], e], [[e[0] - Math.cos(ang - 0.55) * h, e[1] - Math.sin(ang - 0.55) * h], e]);
        }
        if (raw.type === "circle") {
          const a0 = ((raw.a0 ?? 200) * Math.PI) / 180, sw = ((raw.sweep ?? 330) * Math.PI) / 180, m = 90;
          list.push(Array.from({ length: m + 1 }, (_, i) => {
            const u = i / m, a = a0 - sw * u, k = 1 + 0.04 * u + 0.025 * (2 * noise3(u * 3, seed * 0.1, 0, 3) - 1);
            return [raw.c[0] + Math.cos(a) * raw.r * k, raw.c[1] + Math.sin(a) * raw.r * k];
          }));
        }
        list.forEach((p, k) => {
          if (k > 0) liftAfter(C.penUp * 0.5);
          const st = addStroke(p, { ...raw, profile: raw.type === "arrow" && k > 0 ? "press-lift" : raw.profile ?? (raw.type === "circle" ? "sweep" : "press-lift"), seed: seed + k * 131 }, it, k);
          pts.push(...st.pts.map((q, i) => [q[0], q[1], st.w[i]]));
        });
        break;
      }
      case "text": {
        const cap = raw.cap ?? 0.2;
        const lay = layoutStrokeText(raw.text, cap, { align: raw.align ?? "left", letterSpacing: raw.letterSpacing ?? 0.42, wordSpacing: 0.7, bendRadius: 0.12 });
        let k = 0;
        const r = rng(`text:${seed}`);
        for (const ch of lay.chars) {
          const rot = r.range(-0.035, 0.035), sx = 1 + r.range(-0.05, 0.05), dy = r.range(-0.03, 0.03) * cap;
          for (const s of ch.strokes) {
            const mid = (ch.x0 + ch.x1) / 2;
            const p = s.map(([x, y]) => {
              const lx = (x - mid) * sx, ly = y;
              return [raw.x + mid + lx * Math.cos(rot) - ly * Math.sin(rot), raw.y + dy + lx * Math.sin(rot) + ly * Math.cos(rot)];
            });
            if (k > 0) liftAfter(C.penUp * 0.4);
            const st = addStroke(p, { ...raw, profile: raw.profile ?? "press-lift", width: (raw.width ?? 0.16) * cap, speed: raw.speed ?? C.textSpeed, dwell: 0.05, seed: seed + k * 131, hopTime: 0.12 }, it, k);
            pts.push(...st.pts.map((q, i) => [q[0], q[1], st.w[i]]));
            k++;
          }
        }
        break;
      }
      case "wash": {
        const poly = raw.shape ? raw.shape.map(P2) : ellipsePoly(raw.ellipse, 80, seed, raw.wobble ?? 0.03);
        const a = ((raw.dir ?? -90) * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)], perp = [-dir[1], dir[0]];
        const qs = poly.map((p) => p[0] * dir[0] + p[1] * dir[1]);
        const qMin = Math.min(...qs), qMax = Math.max(...qs);
        let area = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
        area = Math.abs(area) / 2;
        const dur = raw.dur ?? Math.max(0.5, area / C.washSpeed);
        // zig-zag brush path: rows across the sweep direction
        const rows = Math.max(2, Math.ceil((qMax - qMin) / (raw.row ?? C.washRow)));
        const zig = [];
        for (let r = 0; r < rows; r++) {
          const q = qMin + ((r + 0.5) / rows) * (qMax - qMin);
          let lo = Infinity, hi = -Infinity;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const qa = qs[j], qb = qs[i];
            if ((qa - q) * (qb - q) > 0 || qa === qb) continue;
            const u = (q - qa) / (qb - qa), x = lerp(poly[j][0], poly[i][0], u), y = lerp(poly[j][1], poly[i][1], u);
            const s = x * perp[0] + y * perp[1];
            lo = Math.min(lo, s); hi = Math.max(hi, s);
          }
          if (!isFinite(lo)) continue;
          const inset = Math.min(0.04, (hi - lo) * 0.2);
          const ends = [lo + inset, hi - inset].map((s) => [dir[0] * q + perp[0] * s, dir[1] * q + perp[1] * s]);
          if (r % 2) ends.reverse();
          zig.push(...ends);
        }
        fly([zig[0][0], zig[0][1], 0]);
        const t0 = t;
        const wa = { id, poly, bbox: bboxOf(poly), dir, qMin, qMax, t0, t1: t0 + dur, tone: raw.tone ?? 0.35, color: raw.color ?? color,
          grade: raw.grade ?? [1, 1], mist: raw.mist ?? [2, 3], bloom: raw.bloom ?? 0.03, tau: raw.tau ?? 0.9, inset: raw.inset ?? 0.012, seed, edge: raw.edge ?? 0.5 };
        washes.push(wa);
        const zc = cumLen(zig);
        push({ kind: "wash", t0, t1: t0 + dur, zig, zc, color, load, wash: washes.length - 1 });
        pos = [zig[zig.length - 1][0], zig[zig.length - 1][1], 0];
        load = Math.max(load, 0.85);
        events.push({ t: t0, kind: "wash", dur, area, rows, x: zig[0][0] });
        pts.push(...poly.map((p) => [p[0], p[1], 0.03]));
        break;
      }
      case "bloom": {
        fly([raw.c[0], raw.c[1], 0.02]);
        const t0 = t, dur = C.dabDur;
        push({ kind: "dab", t0, t1: t0 + dur, at: [raw.c[0], raw.c[1]], color, load });
        blots.push({ id, kind: "bloom", c: raw.c.slice(), r: raw.r ?? 0.1, t0: t0 + dur * 0.45, tau: raw.tau ?? 0.7, tone: raw.tone ?? 0.6, color: raw.color ?? color, petals: raw.petals ?? 7, seed, rim: raw.rim ?? 0.6 });
        events.push({ t: t0 + dur * 0.45, kind: "dab", x: raw.c[0], r: raw.r ?? 0.1 });
        pos = [raw.c[0], raw.c[1], 0.02];
        pts.push([raw.c[0] - (raw.r ?? 0.1), raw.c[1] - (raw.r ?? 0.1), 0], [raw.c[0] + (raw.r ?? 0.1), raw.c[1] + (raw.r ?? 0.1), 0]);
        break;
      }
      case "splatter": {
        const a = ((raw.dir ?? 0) * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)], perp = [-dir[1], dir[0]];
        const back = [raw.c[0] - dir[0] * 0.12, raw.c[1] - dir[1] * 0.12, 0.08];
        fly(back);
        const t0 = t, dur = C.flickDur;
        push({ kind: "flick", t0, t1: t0 + dur, from: back, dir, c: raw.c.slice(), color, load });
        const r = rng(`splat:${seed}`), n = raw.n ?? 9, [s0, s1] = raw.size ?? [0.004, 0.016];
        for (let i = 0; i < n; i++) {
          const u = Math.pow(r.next(), 0.8), along = (raw.reach ?? 0.3) * u, side = r.gaussian(0, raw.spread ?? 0.05) * (0.4 + u);
          const c = [raw.c[0] + dir[0] * along + perp[0] * side, raw.c[1] + dir[1] * along + perp[1] * side];
          const rr = lerp(s1, s0, u) * r.range(0.6, 1.2), ti = t0 + dur * 0.55 + 0.02 + u * 0.07;
          blots.push({ id: `${id}.${i}`, kind: "drop", c, r: rr, t0: ti, tau: 0.05, tone: (raw.tone ?? 1) * r.range(0.8, 1.1), color: raw.color ?? color, petals: 5, seed: seed + i * 17, rim: 0.2 });
          events.push({ t: ti, kind: "splat", r: rr, x: c[0] });
          pts.push([c[0], c[1], rr]);
        }
        events.push({ t: t0 + dur * 0.3, kind: "flick", dur: dur * 0.5, x: raw.c[0] });
        pos = [raw.c[0] + dir[0] * 0.12, raw.c[1] + dir[1] * 0.12, 0.1];
        break;
      }
      case "seal": {
        // the brush stays where it is (parked or hovering); the seal block flies from its station
        const S = C.seal, rest = [ST.seal.x, ST.seal.y, ST.seal.h], top = [raw.c[0], raw.c[1], S.hover];
        const tA = t, tP = tA + S.lift + S.travel, tL = tP + S.press, tE = tL + S.ret + S.travel * 0.6;
        stamp.push({ kind: "travel", t0: tA, t1: tP, a: rest, b: [raw.c[0], raw.c[1], 0], hop: 0.18 },
          { kind: "press", t0: tP, t1: tL, at: [raw.c[0], raw.c[1], 0] },
          { kind: "travel", t0: tL, t1: tE, a: [raw.c[0], raw.c[1], 0], b: rest, hop: 0.16 });
        seals.push({ id, c: raw.c.slice(), size: raw.size ?? 0.1, t0: tP, color: raw.color ?? "vermilion", seed, pattern: raw.pattern ?? 0 });
        events.push({ t: tP, kind: "seal", x: raw.c[0] }, { t: tL + 0.02, kind: "sealLift", x: raw.c[0] }, { t: tE, kind: "sealRest", x: rest[0] });
        hold(tL - t); // the program waits until the seal has lifted (the block flies home on its own)
        pts.push([raw.c[0] - (raw.size ?? 0.1) / 2, raw.c[1] - (raw.size ?? 0.1) / 2, 0], [raw.c[0] + (raw.size ?? 0.1) / 2, raw.c[1] + (raw.size ?? 0.1) / 2, 0]);
        void top;
        break;
      }
      case "pause": hold(raw.dur ?? 0.5); break;
      case "park": {
        const R = ST.rest;
        fly([R.x, R.y, R.h + 0.12]);
        const t0 = t;
        push({ kind: "park", t0, t1: t0 + C.parkDur, from: [R.x, R.y, R.h + 0.12], at: [R.x, R.y, R.h], color, load });
        pos = [R.x, R.y, R.h];
        events.push({ t: t0 + C.parkDur * 0.85, kind: "park", x: R.x });
        it.parked = true; parked = true;
        break;
      }
      default: throw new Error(`planInk: unknown item type "${raw.type}"`);
    }
    if (raw.type !== "park" && raw.type !== "pause" && raw.type !== "seal" && pos[2] < 0.02) liftAfter(0.1);
    it.end = t;
    it.box = pts.length ? bboxOf(pts.map((p) => [p[0], p[1]]), Math.max(0.02, ...pts.map((p) => p[2] ?? 0)) + 0.015) : null;
    items.push(it);
    byId[id] = it;
  });
  // the brush holds its last pose forever (moves end with a hold to +Infinity)
  moves.push({ kind: parked ? "parked" : "hold", t0: t, t1: Infinity, pos: pos.slice(), color, load });
  events.sort((a, b) => a.t - b.t);
  return { C, strokes, washes, blots, seals, moves, stamp, dips, items, byId, events, end: t };
}

// ------------------------------------------------------------------------------------------------ evaluation (pure in t)
const segAt = (list, t) => {
  let lo = 0, hi = list.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].t0 <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return list[ans];
};
const sstep = (u) => u * u * (3 - 2 * u);
/** strokeHead(stroke, t) -> arc length the brush centre has reached (0..len); -1 before it lands. */
export function strokeHead(st, t) {
  if (t < st.t0) return -1;
  const T = st.tt;
  if (t <= T[0]) return 0;
  if (t >= T[T.length - 1]) return st.len;
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return lerp(st.cum[lo], st.cum[hi], (t - T[lo]) / ((T[hi] - T[lo]) || 1));
}
const sampleArr = (st, arr, s) => {
  const c = st.cum;
  if (s <= 0) return arr[0];
  if (s >= st.len) return arr[arr.length - 1];
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < s) lo = m; else hi = m; }
  return lerp(arr[lo], arr[hi], (s - c[lo]) / ((c[hi] - c[lo]) || 1));
};
const tangentAt = (pts, cum, s) => {
  const a = atArc(pts, cum, s - 0.012), b = atArc(pts, cum, s + 0.012), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};

/**
 * brushPose(plan, t) -> { x, y, h, dir:[dx,dy], press 0..1, speed (m/s), color, load, rest 0..1 (lying on the rest), swirl }
 *   x, y = tip position on the paper plane (metres), h = tip height. Pure in t.
 */
export function brushPose(plan, t) {
  const m = segAt(plan.moves, t), C = plan.C;
  const base = { color: m.color, load: m.load, rest: 0, speed: 0, press: 0, dir: [0, 1] };
  const u = m.t1 === Infinity ? 0 : clamp((t - m.t0) / ((m.t1 - m.t0) || 1));
  switch (m.kind) {
    case "hold": return { ...base, x: m.pos[0], y: m.pos[1], h: m.pos[2] + 0.004 * Math.sin(t * 1.7) * (m.pos[2] > 0.01 ? 1 : 0) };
    case "parked": return { ...base, x: m.pos[0], y: m.pos[1], h: m.pos[2], rest: 1 };
    case "travel": {
      const e = sstep(u), a = m.a, b = m.b;
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      return { ...base, x: lerp(a[0], b[0], e), y: lerp(a[1], b[1], e), h: lerp(a[2], b[2], e) + m.hop * Math.sin(Math.PI * u), dir: l > 1e-6 ? [dx / l, dy / l] : [0, 1],
        speed: l / ((m.t1 - m.t0) || 1) * 6 * u * (1 - u), press: b[2] < 0.005 ? 0.25 * smoothstep(0.75, 1, u) : 0 };
    }
    case "stroke": {
      const st = plan.strokes[m.stroke], s = strokeHead(st, t), p = atArc(st.pts, st.cum, s);
      const w = sampleArr(st, st.w, s), pr = clamp(w / (0.5 * st.width));
      const land = smoothstep(st.t0, st.tt[0], t); // dwell: the brush presses down before moving
      return { ...base, color: st.color, load: sampleArr(st, st.load, s), x: p[0], y: p[1], h: 0, dir: tangentAt(st.pts, st.cum, s), press: pr * (0.4 + 0.6 * land), speed: sampleArr(st, st.speed, s) * (t > st.tt[0] ? 1 : 0) };
    }
    case "dip": {
      const S = m.at, down = smoothstep(0, 0.3, u) * (1 - smoothstep(0.7, 1, u));
      let x = S[0], y = S[1];
      if (m.swirl) { const a = u * Math.PI * 4; x += Math.cos(a) * 0.035 * down; y += Math.sin(a) * 0.025 * down; }
      return { ...base, color: u > 0.5 ? m.colorAfter ?? m.color : m.color, load: u > 0.5 ? 1 : m.load, x, y, h: S[2] + C.hover * (1 - down) - 0.014 * down, press: 0.45 * down, swirl: m.swirl ? down : 0 };
    }
    case "wash": {
      const L = m.zc[m.zc.length - 1], s = sstep(u) * 0.06 * L + u * 0.94 * L, p = atArc(m.zig, m.zc, s);
      return { ...base, x: p[0], y: p[1], h: 0, dir: tangentAt(m.zig, m.zc, s), press: 0.85 + 0.15 * Math.sin(u * 40), speed: L / (m.t1 - m.t0) };
    }
    case "dab": {
      const down = Math.sin(Math.PI * u);
      return { ...base, x: m.at[0], y: m.at[1], h: 0.02 * (1 - down), press: 0.6 * down };
    }
    case "flick": {
      const e = sstep(u), a = m.from;
      return { ...base, x: a[0] + m.dir[0] * 0.24 * e, y: a[1] + m.dir[1] * 0.24 * e, h: a[2] - 0.06 * Math.sin(Math.PI * u) + 0.02 * e, dir: m.dir, speed: 2.5 * Math.sin(Math.PI * u), press: 0 };
    }
    case "park": {
      const e = sstep(m.rev ? 1 - u : u);
      return { ...base, x: lerp(m.from[0], m.at[0], e), y: lerp(m.from[1], m.at[1], e), h: lerp(m.from[2], m.at[2], e), rest: e };
    }
    default: return { ...base, x: 0, y: 0, h: 0.2 };
  }
}

/** stampPose(plan, t) -> { x, y, h, press 0..1, active } for the seal block (rests at its station otherwise). */
export function stampPose(plan, t) {
  const R = plan.C.stations.seal;
  if (!plan.stamp.length || t < plan.stamp[0].t0) return { x: R.x, y: R.y, h: R.h, press: 0, active: false };
  const m = segAt(plan.stamp, t), u = clamp((t - m.t0) / ((m.t1 - m.t0) || 1));
  if (t > plan.stamp[plan.stamp.length - 1].t1) return { x: R.x, y: R.y, h: R.h, press: 0, active: false };
  if (m.kind === "press") return { x: m.at[0], y: m.at[1], h: 0, press: Math.sin(Math.PI * u), active: true };
  const e = sstep(u);
  return { x: lerp(m.a[0], m.b[0], e), y: lerp(m.a[1], m.b[1], e), h: lerp(m.a[2], m.b[2], e) + m.hop * Math.sin(Math.PI * u), press: 0, active: true };
}

/** rippleAt(plan, station, t) -> [{ age, swirl }] dips at that station that started before t (for water rings). */
export const ripplesAt = (plan, station, t) => plan.dips.filter((d) => d.station === station && d.t <= t && t - d.t < 3.5).map((d) => ({ age: t - d.t, swirl: d.swirl, dur: d.dur }));

// ------------------------------------------------------------------------------------------------ camera shots (pure)
/** toWorld(x, y, h) -> world [x, h, -y] (paper plane = XZ, +y away from camera). */
export const toWorld = (x, y, h = 0) => [x, h, -y];
/**
 * sheetShot(box [x0,y0,x1,y1], { elev, yaw, fov, aspect, bounds:[xmin,xmax,ymin,ymax] (NDC), minDist, maxDist, anchor "center"|"bottom" })
 *   -> { pos, target, fov }. The camera looks down at `elev` rad (from horizontal) from the near side (yaw 0) and backs
 *   off until the paper box sits inside `bounds`, re-centred in them (so a caption corner can be kept clear).
 */
export function sheetShot(box, o = {}) {
  const { elev = 1.05, yaw = 0, fov = 30, aspect = 16 / 9, bounds = [-0.86, 0.86, -0.86, 0.86], minDist = 1.0, maxDist = 12, anchor = "center" } = o;
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(([x, y]) => toWorld(x, y, 0));
  let tg = toWorld((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, 0);
  const dirv = [Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev)];
  const cam = (d, tgt) => ({ pos: [tgt[0] + dirv[0] * d, tgt[1] + dirv[1] * d, tgt[2] + dirv[2] * d], target: tgt, fov });
  const ext = (c) => {
    const xs = [Infinity, -Infinity], ys = [Infinity, -Infinity];
    for (const p of corners) { const [x, y] = projectPoint(c, p, { aspect }); xs[0] = Math.min(xs[0], x); xs[1] = Math.max(xs[1], x); ys[0] = Math.min(ys[0], y); ys[1] = Math.max(ys[1], y); }
    return { xs, ys };
  };
  const fits = (c) => { const e = ext(c); return e.xs[0] >= bounds[0] && e.xs[1] <= bounds[1] && e.ys[0] >= bounds[2] && e.ys[1] <= bounds[3]; };
  let d = minDist;
  for (let pass = 0; pass < 4; pass++) {
    let lo = minDist * 0.5, hi = maxDist * 2;
    for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (fits(cam(mid, tg))) hi = mid; else lo = mid; }
    d = hi;
    // re-centre: move the target so the projected box centre lands on the bounds centre
    const e = ext(cam(d, tg)), th = Math.tan((fov * Math.PI) / 360);
    const ex = ((e.xs[0] + e.xs[1]) / 2 - (bounds[0] + bounds[1]) / 2) * th * aspect * d;
    const ey = (anchor === "bottom" ? e.ys[0] - bounds[2] : (e.ys[0] + e.ys[1]) / 2 - (bounds[2] + bounds[3]) / 2) * th * d;
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)], fwd = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const k = 1 / Math.sin(elev); // screen-up on the ground plane is stretched by 1/sin(elev)
    tg = [tg[0] + right[0] * ex + fwd[0] * ey * k, 0, tg[2] + right[2] * ex + fwd[2] * ey * k];
  }
  d = clamp(d, minDist, maxDist);
  const c = cam(d, tg);
  return { pos: c.pos.map((v) => +v.toFixed(4)), target: c.target.map((v) => +v.toFixed(4)), fov };
}

/** unionBox(boxes) -> [x0,y0,x1,y1]. */
export const unionBox = (bs) => bs.filter(Boolean).reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

// ------------------------------------------------------------------------------------------------ sound (pure)
/**
 * inkVoices(snd) -> voices for kit scoreFromEvents(plan.events, voices): a soft brush swish per stroke whose length is
 * the stroke's own duration (louder for wider, wetter strokes; airier as the brush runs dry), a long hushed swish per
 * wash, water drips after dips, a small wet dab for blooms, ticks for splatter drops, a soft press for the seal.
 */
export function inkVoices(snd = {}) {
  const sw = { pitch: 0.34, gain: 0.34, ...(snd.swish ?? {}) };
  const wa = { pitch: 0.26, gain: 0.3, ...(snd.wash ?? {}) };
  const dr = { pitch: 0.55, gain: 0.16, ...(snd.drip ?? {}) };
  const se = { pitch: 1.6, gain: 0.22, ...(snd.seal ?? {}) };
  return {
    stroke: (e, c) => [
      { type: "whoosh", dir: "out", dur: e.dur + 0.06, pitch: sw.pitch * (0.9 + 0.25 * e.dry) * (0.92 + 0.16 * ((c.index * 0.618) % 1)), q: 0.7, gain: sw.gain * c.k(0.45 + 0.7 * e.pressure * (e.width / 0.06), 0.25, 1.2) },
      { type: "paper", dur: e.dur + 0.04, pitch: 0.42 + 0.2 * e.dry, density: 0.18 + 0.4 * e.dry, gain: sw.gain * 0.22 },
    ],
    wash: (e) => [
      { type: "whoosh", dir: "in", dur: e.dur * 0.55, pitch: wa.pitch, q: 0.6, gain: wa.gain },
      { type: "whoosh", dir: "out", dur: e.dur * 0.6, pitch: wa.pitch * 0.9, q: 0.6, gain: wa.gain * 0.8, offset: e.dur * 0.42 },
    ],
    dip: () => [{ type: "squish", dur: 0.22, pitch: 1.5, gain: 0.08 }],
    rinse: (e) => [{ type: "squish", dur: 0.3, pitch: 1.2, gain: 0.1 }, { type: "bubble", dur: 0.08, pitch: 0.9, gain: dr.gain * 0.6, offset: e.dur * 0.6 }],
    drip: (e, c) => [{ type: "bubble", dur: 0.07, pitch: dr.pitch * (1 + 0.35 * ((c.index * 0.37) % 1)) * (e.n ? 1.3 : 1), gain: dr.gain * (e.n ? 0.7 : 1) }],
    dab: () => [{ type: "squish", dur: 0.26, pitch: 1.7, gain: 0.1 }],
    flick: (e) => [{ type: "whoosh", dir: "out", dur: 0.18, pitch: 0.9, q: 1.2, gain: 0.12 }],
    splat: (e, c) => [{ type: "click", dur: 0.02, pitch: 0.28 + 0.2 * ((c.index * 0.61) % 1), gain: 0.04 + 1.6 * e.r }],
    seal: () => [{ type: "thud", dur: 0.22, pitch: se.pitch, gain: se.gain }, { type: "click", dur: 0.03, pitch: 0.3, gain: 0.05 }],
    sealLift: () => [{ type: "paper", dur: 0.12, pitch: 0.8, density: 0.3, gain: 0.05 }],
    sealRest: () => [{ type: "click", dur: 0.03, pitch: 0.35, gain: 0.07 }],
    park: () => [{ type: "click", dur: 0.03, pitch: 0.4, gain: 0.08 }, { type: "thud", dur: 0.14, pitch: 2.2, gain: 0.05 }],
  };
}

/**
 * beatTones(t, { note, flute, pluck, seed }) -> SCORE entries for one beat: a breathy flute-like tone (a single soft
 * partial-rich pad note + a high airy noise breath) and a low plucked string (a pad with a 4 ms attack and a long
 * release on the sfx bus). note = semitones above the flute root.
 */
export function beatTones(t, o = {}) {
  const F = { root: 587.33, gain: 0.16, dur: 2.6, brightness: 1800, breath: 0.035, ...(o.flute ?? {}) };
  const P = { root: 73.42, gain: 0.32, dur: 2.2, brightness: 700, ...(o.pluck ?? {}) };
  const n = o.note ?? 0, seed = o.seed ?? 500;
  return [
    { t: t + 0.05, type: "pad", bus: "sfx", dur: F.dur, root: F.root * 2 ** (n / 12), chord: [0, 12], attack: 0.32, release: 1.5, brightness: F.brightness, gain: F.gain, seed },
    { t: t + 0.02, type: "whoosh", dir: "in", dur: 0.55, pitch: 1.9, q: 0.5, gain: F.breath, seed: seed + 1 },
    { t, type: "pad", bus: "sfx", dur: P.dur, root: P.root * 2 ** ((o.pluckNote ?? 0) / 12), chord: [0, 12, 19], attack: 0.004, release: P.dur - 0.05, brightness: P.brightness, gain: P.gain, seed: seed + 2 },
  ];
}
