// sandplan.js — the zen-sand planner and height-field engine. Pure JS: no THREE, no window, no DOM (Node-safe), so
// scene.config.js can import it to derive SCORE from exactly the tool schedule the picture uses.
//
// Plan coordinates: metres on the sand, origin at the tray centre, +x right, +y AWAY from the camera (world z = -y).
//
//   planSand(program, opts) -> { items, ops, events, byId, end, opts }
//     program = [{ id, type, at? | gap?, tool?, pre?, ... }]  (types below). Items run one after another, one tool at a
//     time. `pre: true` items happen before t = 0 (the sand is already raked/scribbled when the clip starts; no tool,
//     no sound). Every op is a single tool contact with the sand: { kind: "stroke"|"smooth", tool, pts, cum, L, start,
//     end, ... }. The tool's travel along an op is planned closed-form (trapezoid speed), so the groove at time t is
//     exactly as long as the tool has travelled.
//   toolPose(plan, tool, t) -> { x, y, z, heading, rest (0 working .. 1 at rest), visible, s, opId } for each tool.
//   createSandField(plan, opts) -> { W, H, ppm, at(t) -> { h, normal, color, dirty } }: rebuilds the height field for t
//     (completed-op prefix cache keyed ONLY by op count; the in-progress op is applied on a copy), then shades it
//     (normals + a short height-field march toward the low sun for self-shadow + static grain/AO) into RGBA8 arrays.
//
// Item types (all lengths in metres):
//   rake    { path: stroke, tines = 5, spacing = .07 }               multi-tine corrugation along any path
//   rings   { c:[x,y], r, tines, spacing, a0 = -90, sweep = 380, enter?: [[x,y],...] }  rake circling a stone -> concentric rings
//   line    { path: stroke }                                          single groove (stylus, or tool:"ball")
//   circle  { c, r, ry?, a0 = 90, sweep = 350 }                       single groove ring
//   arrow   { a:[x,y], b:[x,y], head = .16, bow = 0 }                  shaft + two-stroke head
//   text    { text, x, y, cap, align = "center", letterSpacing }      stroke-font words traced as grooves
//   scribble{ rect:[x0,y0,x1,y1], n = 6, len = 1.6, seed }            messy crossing grooves ("noise")
//   smooth  { rect:[x0,y0,x1,y1] }                                    a flat board dragged along +x erases the rect to flat
//   (a stroke = [[x,y], ...] and/or arcs ["a", cx, cy, rx, ry, deg0, deg1], as kit/pathmath expandStroke)
import { clamp, lerp, smoothstep, rng, hash01, ease } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { expandStroke, filletPath } from "../../kit/pathmath.js";

export const SAND_DEFAULTS = {
  tray: { w: 4.4, d: 2.5 },
  speed: { stylus: 1.8, ball: 1.6, rake: 1.7, board: 1.9 }, // m/s while in the sand
  textSpeed: 2.3,           // stylus speed for lettering
  accel: 0.1,               // s of speed ramp at each end of a contact
  hop: { speed: 4.0, min: 0.08, height: 0.07 }, // pen-up hop between contacts of one item
  lift: 0.1, land: 0.1,     // s to raise / lower the tool at the ends of each contact
  approach: 0.45, depart: 0.4, // s from / to the rest pose at an item's start / end
  itemGap: 0.15,
  resample: 0.03,           // m between path points
  // groove profiles (metres). reach = how far a contact rewrites the sand.
  profile: {
    stylus: { depth: 0.013, sigma: 0.012, ridge: 0.0055, ridgeAt: 0.024, ridgeSigma: 0.009, reach: 0.045 },
    ball:   { depth: 0.012, sigma: 0.019, ridge: 0.0045, ridgeAt: 0.034, ridgeSigma: 0.012, reach: 0.06 },
    rake:   { amp: 0.0075, edge: 0.6, capSoft: 0.012 },
    board:  { pile: 0.009, pileAt: 0.03, pileSigma: 0.02, feather: 0.03, lead: 0.12 },
  },
  rest: {                    // where each tool lies when idle (plan coords; heading radians; z = height of its contact point)
    rake: { x: -0.6, y: 1.42, z: 0.06, heading: 0 },
    stylus: { x: 1.2, y: 1.42, z: 0.07, heading: 0 },
    ball: { x: 2.0, y: -1.22, z: 0.1, heading: 0 },
    board: { x: -2.42, y: 0, z: 0.06, heading: 0 },
  },
  baseNoise: { amp: 0.0012, scale: 3.2, seed: 5 },
};

const merge = (o = {}) => {
  const D = SAND_DEFAULTS;
  return {
    ...D, ...o,
    tray: { ...D.tray, ...o.tray }, speed: { ...D.speed, ...o.speed }, hop: { ...D.hop, ...o.hop },
    profile: Object.fromEntries(Object.keys({ ...D.profile, ...o.profile }).map((k) => [k, { ...D.profile[k], ...o.profile?.[k] }])),
    rest: Object.fromEntries(Object.keys({ ...D.rest, ...o.rest }).map((k) => [k, { ...D.rest[k], ...o.rest?.[k] }])),
    baseNoise: { ...D.baseNoise, ...o.baseNoise },
  };
};

// ------------------------------------------------------------------------------------------------ path helpers
const P2 = (p) => [p[0], p[1]];
export function resample(pts, step) {
  if (pts.length < 2) return pts.map(P2);
  const out = [P2(pts[0])];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s < l) { out.push([a[0] + ((b[0] - a[0]) * s) / l, a[1] + ((b[1] - a[1]) * s) / l]); s += step; }
    carry = l - (s - step);
  }
  const last = pts[pts.length - 1], q = out[out.length - 1];
  if (Math.hypot(last[0] - q[0], last[1] - q[1]) > step * 0.2) out.push(P2(last));
  else out[out.length - 1] = P2(last);
  return out;
}
const cumLen = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
/** pointAtS(op, s) -> { x, y, heading } on an op's path at arc length s (clamped). */
export function pointAtS(op, s) {
  const { pts, cum } = op, n = pts.length;
  if (n === 1) return { x: pts[0][0], y: pts[0][1], heading: op.heading0 ?? 0 };
  s = clamp(s, 0, op.L);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], l = cum[hi] - cum[lo] || 1, u = (s - cum[lo]) / l;
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
/** Trapezoid speed profile: fraction of the path covered at u in 0..1 with ramp fraction a. */
export function travel01(u, a) {
  u = clamp(u); a = clamp(a, 1e-4, 0.5);
  const tot = 1 - a;
  if (u < a) return (0.5 * u * u) / a / tot;
  if (u < 1 - a) return (a / 2 + (u - a)) / tot;
  const w = 1 - u;
  return (tot - (0.5 * w * w) / a) / tot;
}
/** opProgress(op, t) -> arc length travelled at t (0 before start, L after end). */
export function opProgress(op, t) {
  if (t <= op.start) return 0;
  if (t >= op.end) return op.L;
  return op.L * travel01((t - op.start) / (op.end - op.start), op.accel / (op.end - op.start));
}

function scribblePaths(rect, n, len, seed) {
  const R = rng(seed), out = [];
  const [x0, y0, x1, y1] = rect;
  for (let k = 0; k < n; k++) {
    let x = R.range(x0 + 0.15, x1 - 0.15), y = R.range(y0 + 0.15, y1 - 0.15), h = R.range(0, Math.PI * 2);
    const f1 = R.range(1.5, 3.5), f2 = R.range(4, 7), a1 = R.range(1.2, 2.6), a2 = R.range(0.6, 1.6), ph = R.range(0, 6.28);
    const pts = [[x, y]], step = 0.03, N = Math.round(R.range(0.7, 1.3) * len / step);
    for (let i = 0; i < N; i++) {
      const s = i * step;
      h += (a1 * Math.sin(f1 * s + ph) + a2 * Math.sin(f2 * s * 1.3 + ph * 2)) * step * 2.2;
      x += Math.cos(h) * step; y += Math.sin(h) * step;
      // steer back inside the rect
      if (x < x0 + 0.08 || x > x1 - 0.08 || y < y0 + 0.08 || y > y1 - 0.08) {
        const cx = (x0 + x1) / 2 - x, cy = (y0 + y1) / 2 - y, want = Math.atan2(cy, cx);
        let d = want - h; d = Math.atan2(Math.sin(d), Math.cos(d)); h += d * 0.35;
        x = clamp(x, x0 + 0.05, x1 - 0.05); y = clamp(y, y0 + 0.05, y1 - 0.05);
      }
      pts.push([x, y]);
    }
    out.push(pts);
  }
  return out;
}

// item -> list of contacts [{ tool, pts, kind, ...extra }]
function contactsOf(it, o) {
  const tool = it.tool;
  const S = (stroke) => filletPath(expandStroke(stroke, 1, [0, 0], 0), 0.02).map(P2);
  switch (it.type) {
    case "rake": return [{ tool: tool ?? "rake", pts: S(it.path), tines: it.tines ?? 5, spacing: it.spacing ?? 0.07 }];
    case "rings": {
      const [cx, cy] = it.c, a0 = it.a0 ?? -90, sweep = it.sweep ?? 380;
      const arc = expandStroke([["a", cx, cy, it.r, it.r, a0, a0 + sweep]], 1, [0, 0], 0).map(P2);
      const pts = it.enter ? [...S(it.enter), ...arc] : arc;
      return [{ tool: tool ?? "rake", pts, tines: it.tines ?? 5, spacing: it.spacing ?? 0.07 }];
    }
    case "line": return [{ tool: tool ?? "stylus", pts: S(it.path) }];
    case "circle": {
      const a0 = it.a0 ?? 90, sw = it.sweep ?? 350;
      return [{ tool: tool ?? "stylus", pts: expandStroke([["a", it.c[0], it.c[1], it.r, it.ry ?? it.r, a0, a0 + sw]], 1, [0, 0], 0).map(P2) }];
    }
    case "arrow": {
      const [ax, ay] = it.a, [bx, by] = it.b, hd = it.head ?? 0.16, ang = Math.atan2(by - ay, bx - ax), sp = 0.5;
      const mid = [(ax + bx) / 2 - Math.sin(ang) * (it.bow ?? 0), (ay + by) / 2 + Math.cos(ang) * (it.bow ?? 0)];
      const shaft = it.bow ? resample([[ax, ay], mid, [bx, by]], 0.05) : [[ax, ay], [bx, by]];
      const tip = (s) => [bx - hd * Math.cos(ang + s * sp), by - hd * Math.sin(ang + s * sp)];
      // two contacts: shaft running on into one barb, then the other barb drawn in to the tip
      return [{ tool: tool ?? "stylus", pts: [...shaft, tip(1)] }, { tool: tool ?? "stylus", pts: [tip(-1), [bx, by]] }];
    }
    case "text": {
      const L = layoutStrokeText(it.text, it.cap, { align: it.align ?? "center", letterSpacing: it.letterSpacing ?? 0.3, bendRadius: 0.06 });
      const out = [];
      for (const c of L.chars) for (const s of c.strokes) out.push({ tool: tool ?? "stylus", pts: s.map((p) => [p[0] + it.x, p[1] + it.y]), text: true, ch: c.ch });
      return out;
    }
    case "scribble": return scribblePaths(it.rect, it.n ?? 6, it.len ?? 1.6, it.seed ?? 7).map((pts) => ({ tool: tool ?? "stylus", pts }));
    case "smooth": {
      const [x0, y0, x1, y1] = it.rect, cy = (y0 + y1) / 2, lead = o.profile.board.lead;
      return [{ tool: "board", kind: "smooth", rect: it.rect, pts: [[x0 - lead, cy], [x1, cy]] }];
    }
    default: throw new Error(`planSand: unknown item type "${it.type}"`);
  }
}

/** planSand(program, opts?) -> plan (see header). */
export function planSand(program, opts = {}) {
  const o = merge(opts);
  const items = [], ops = [], events = [];
  // pre items: packed before t = 0 in program order (no tool shown, no sound)
  let t = -1000, preT = -1000;
  for (const it of program) {
    const contacts = contactsOf(it, o);
    const pre = !!it.pre;
    let start;
    if (pre) start = preT;
    else if (it.at != null) start = it.at;
    else start = Math.max(0, t + (it.gap ?? o.itemGap));
    let cur = start + (pre ? 0 : o.approach);
    const itemOps = [];
    let prevEnd = null;
    contacts.forEach((c, ci) => {
      const pts = c.kind === "smooth" ? c.pts : resample(c.pts, o.resample);
      const cum = cumLen(pts), L = cum[cum.length - 1];
      const speed = c.text ? o.textSpeed : o.speed[c.tool];
      if (prevEnd) {
        const d = Math.hypot(pts[0][0] - prevEnd[0], pts[0][1] - prevEnd[1]);
        cur += o.lift + Math.max(o.hop.min, d / o.hop.speed) + o.land;
      }
      const dur = L / speed + o.accel;
      const op = {
        id: `${it.id}.${ci}`, item: it.id, idx: ops.length, kind: c.kind ?? "stroke", tool: c.tool, pts, cum, L,
        start: cur, end: cur + dur, accel: Math.min(o.accel, dur * 0.4), pre,
        tines: c.tines, spacing: c.spacing, rect: c.rect, first: ci === 0, last: ci === contacts.length - 1,
      };
      ops.push(op); itemOps.push(op);
      if (!pre) {
        const p0 = pts[0];
        events.push({ t: op.start, kind: "land", tool: c.tool, item: it.id, x: p0[0], y: p0[1], first: op.first });
        events.push({ t: op.start, kind: "move", tool: c.tool, item: it.id, dur, L, speed, x: p0[0], y: p0[1], text: !!c.text });
        const pe = pts[pts.length - 1];
        events.push({ t: op.end, kind: "lift", tool: c.tool, item: it.id, x: pe[0], y: pe[1], last: op.last });
      }
      cur = op.end;
      prevEnd = pts[pts.length - 1];
    });
    const end = cur + (pre ? 0 : o.depart);
    const rec = { id: it.id, type: it.type, tool: itemOps[0].tool, pre, start, end, firstOp: itemOps[0].idx, lastOp: itemOps[itemOps.length - 1].idx, src: it };
    items.push(rec);
    if (pre) preT = cur + 0.01; else t = end;
  }
  // ops must be in time order for the prefix cache (pre items are always before t = 0)
  ops.sort((a, b) => a.start - b.start).forEach((op, i) => { op.idx = i; });
  for (const it of items) {
    const mine = ops.filter((op) => op.item === it.id);
    it.firstOp = mine[0].idx; it.lastOp = mine[mine.length - 1].idx;
  }
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  events.sort((a, b) => a.t - b.t);
  return { items, ops, events, byId, end: Math.max(0, t), opts: o };
}

/** itemBox(plan, id, pad?) -> [x0, y0, x1, y1] plan bounds of an item's contacts (plus tine swath / reach). */
export function itemBox(plan, id, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const op of plan.ops) {
    if (op.item !== id) continue;
    const r = op.kind === "smooth" ? 0 : op.tool === "rake" ? (op.tines * op.spacing) / 2 + op.spacing : plan.opts.profile[op.tool].reach;
    if (op.rect) { x0 = Math.min(x0, op.rect[0]); y0 = Math.min(y0, op.rect[1]); x1 = Math.max(x1, op.rect[2]); y1 = Math.max(y1, op.rect[3]); continue; }
    for (const p of op.pts) { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); }
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

// ------------------------------------------------------------------------------------------------ tool poses
const angLerp = (a, b, u) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * u; };
const restPose = (o, tool) => ({ ...o.rest[tool], rest: 1, visible: true, s: 0, opId: null, working: false });
/**
 * toolPose(plan, tool, t) -> { x, y, z, heading, rest, visible, s, opId, working }
 *   z = height of the tool's contact point above the sand (0 = in the sand). rest = 0 working .. 1 lying at rest.
 *   Between items the tool lies at its rest pose; it arcs out to the first contact (approach), hops between contacts
 *   (lift / hop / land) and arcs back to rest (depart). Pure function of t.
 */
export function toolPose(plan, tool, t) {
  const pose = toolPose0(plan, tool, t);
  let dist = 0; // total distance this tool has rolled/dragged through the sand by t (ball spin)
  for (const op of plan.ops) if (!op.pre && op.tool === tool) dist += opProgress(op, t);
  pose.dist = dist;
  return pose;
}
function toolPose0(plan, tool, t) {
  const o = plan.opts;
  const items = plan.items.filter((it) => !it.pre && it.tool === tool);
  for (const it of items) {
    if (t < it.start || t > it.end) continue;
    const ops = plan.ops.slice(it.firstOp, it.lastOp + 1);
    const f = ops[0], l = ops[ops.length - 1];
    const R = restPose(o, tool);
    if (t < f.start) { // approach from rest
      const u = ease.inOutCubic((t - it.start) / (f.start - it.start));
      const p = pointAtS(f, 0), lift = Math.sin(Math.PI * u) * 0.35;
      return { x: lerp(R.x, p.x, u), y: lerp(R.y, p.y, u), z: lerp(R.z, 0, u) + lift, heading: angLerp(R.heading, p.heading, u), rest: 1 - u, visible: true, s: 0, opId: f.id, working: false };
    }
    if (t > l.end) { // depart to rest
      const u = ease.inOutCubic((t - l.end) / (it.end - l.end));
      const p = pointAtS(l, l.L), lift = Math.sin(Math.PI * u) * 0.35;
      return { x: lerp(p.x, R.x, u), y: lerp(p.y, R.y, u), z: lerp(0, R.z, u) + lift, heading: angLerp(p.heading, R.heading, u), rest: u, visible: true, s: l.L, opId: l.id, working: false };
    }
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (t >= op.start && t <= op.end) {
        const s = opProgress(op, t), p = pointAtS(op, s);
        return { x: p.x, y: p.y, z: 0, heading: op.kind === "smooth" ? 0 : p.heading, rest: 0, visible: true, s, opId: op.id, working: true };
      }
      const nx = ops[i + 1];
      if (nx && t > op.end && t < nx.start) { // hop
        const a = pointAtS(op, op.L), b = pointAtS(nx, 0), T = nx.start - op.end;
        const uu = (t - op.end) / T;
        const up = clamp((t - op.end) / o.lift), down = clamp((nx.start - t) / o.land);
        const z = o.hop.height * Math.min(ease.outCubic(up), ease.outCubic(down));
        const mv = ease.inOutSine(clamp((t - op.end - o.lift * 0.5) / Math.max(1e-3, T - (o.lift + o.land) * 0.5)));
        return { x: lerp(a.x, b.x, mv), y: lerp(a.y, b.y, mv), z, heading: angLerp(a.heading, b.heading, mv), rest: 0, visible: true, s: 0, opId: nx.id, working: false, hop: uu };
      }
    }
  }
  return restPose(o, tool);
}

// ------------------------------------------------------------------------------------------------ height field
/**
 * createSandField(plan, { ppm = 200, stones = [{x,y,rx,ry}], light: { azimuth, elevation }, shade: {...}, palette }) ->
 *   { W, H, ppm, cell, at(t) }
 *   at(t) -> { h: Float32Array, normal: Uint8Array RGBA (tangent-space normal map, +x / +y(plan) / up), color: Uint8Array RGBA
 *   (sRGB sand albedo x self-shadow x AO x grain) } — the buffers are reused, their CONTENT is a pure function of t.
 */
export function createSandField(plan, opts = {}) {
  const o = plan.opts;
  const ppm = opts.ppm ?? 200;
  const TW = o.tray.w, TD = o.tray.d;
  const W = Math.round(TW * ppm), H = Math.round(TD * ppm), N = W * H, cell = TW / W;
  const X0 = -TW / 2, Y0 = -TD / 2;
  const SH = {
    azimuth: 2.35, elevation: 0.27, steps: 10, stepCells: 1.6, soft: 0.004, strength: 0.6,
    grain: 0.05, grainFine: 0.035, mottle: 0.05, ao: 0.42, aoReach: 0.07, grooveTone: 0.06, slopeExag: 1.0,
    ...opts.shade,
  };
  const sand = hexRgb(opts.sandColor ?? "#e7dcc8"), sandDeep = hexRgb(opts.sandDeep ?? "#d4c6ae");
  const stones = opts.stones ?? [];
  const cx = (i) => X0 + (i + 0.5) * cell, cy = (j) => Y0 + (j + 0.5) * cell;

  // static base: gentle undulation (height) + albedo grain/mottle + stone AO (colour multipliers)
  const base = new Float32Array(N), albedo = new Float32Array(N);
  const bn = o.baseNoise;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = cx(i), y = cy(j), k = j * W + i;
    base[k] = bn.amp * (vnoise(x * bn.scale, y * bn.scale, bn.seed) - 0.5) * 2 + bn.amp * 0.5 * (vnoise(x * bn.scale * 3.1, y * bn.scale * 3.1, bn.seed + 3) - 0.5);
    let a = 1 + SH.mottle * (vnoise(x * 1.7, y * 1.7, 31) - 0.5) * 2 + SH.grain * (hash01(i, j, 77) - 0.5) * 2 + SH.grainFine * (hash01(i >> 1, j >> 1, 78) - 0.5) * 2;
    for (const s of stones) {
      const dx = (x - s.x) / s.rx, dy = (y - s.y) / s.ry, r = Math.sqrt(dx * dx + dy * dy), edge = (r - 1) * Math.min(s.rx, s.ry);
      if (edge < SH.aoReach) a *= 1 - SH.ao * (1 - smoothstep(0, SH.aoReach, Math.max(0, edge)));
    }
    albedo[k] = a;
  }

  // scratch for one contact's distance raster
  const dmin = new Float32Array(N).fill(1e9), lat = new Float32Array(N), cap = new Float32Array(N);
  const touched = [];

  function rasterise(op, sNow, reach) {
    // nearest point on the drawn part of the path for every cell within `reach`
    const pts = [];
    const { cum } = op;
    for (let i = 0; i < op.pts.length; i++) { if (cum[i] < sNow) pts.push(op.pts[i]); else break; }
    const e = pointAtS(op, sNow); pts.push([e.x, e.y]);
    if (pts.length < 2) return [Infinity, Infinity, -Infinity, -Infinity];
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    const nSeg = pts.length - 1;
    for (let s = 0; s < nSeg; s++) {
      const a = pts[s], b = pts[s + 1];
      const ux0 = b[0] - a[0], uy0 = b[1] - a[1], l = Math.hypot(ux0, uy0);
      if (l < 1e-6) continue;
      const ux = ux0 / l, uy = uy0 / l, nx = -uy, ny = ux;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - X0) / cell)), i1 = Math.min(W - 1, Math.ceil((Math.max(a[0], b[0]) + reach - X0) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - Y0) / cell)), j1 = Math.min(H - 1, Math.ceil((Math.max(a[1], b[1]) + reach - Y0) / cell));
      bx0 = Math.min(bx0, i0); by0 = Math.min(by0, j0); bx1 = Math.max(bx1, i1); by1 = Math.max(by1, j1);
      const isFirst = s === 0, isLast = s === nSeg - 1;
      for (let j = j0; j <= j1; j++) {
        const py = cy(j) - a[1];
        for (let i = i0; i <= i1; i++) {
          const px = cx(i) - a[0];
          const along = px * ux + py * uy, perp = px * nx + py * ny;
          let c = 0, tcl = along;
          if (along < 0) { tcl = 0; if (isFirst) c = -along; }
          else if (along > l) { tcl = l; if (isLast) c = along - l; }
          const qx = px - ux * tcl, qy = py - uy * tcl, d = Math.sqrt(qx * qx + qy * qy);
          if (d > reach) continue;
          const k = j * W + i;
          if (dmin[k] > 1e8) touched.push(k);
          if (d < dmin[k]) { dmin[k] = d; lat[k] = (along >= 0 && along <= l) ? perp : (perp >= 0 ? d : -d); cap[k] = c; }
        }
      }
    }
    return [bx0, by0, bx1, by1];
  }
  function clearScratch() { for (const k of touched) dmin[k] = 1e9; touched.length = 0; }

  function applyOp(h, op, sNow) {
    if (sNow <= 0) return null;
    if (op.kind === "smooth") {
      const P = o.profile.board, [x0, y0, x1, y1] = op.rect;
      const front = x0 - P.lead + sNow;
      const i0 = Math.max(0, Math.floor((x0 - X0) / cell)), i1 = Math.min(W - 1, Math.ceil((Math.min(x1, front + P.pileAt + 3 * P.pileSigma) - X0) / cell));
      const j0 = Math.max(0, Math.floor((y0 - P.feather - Y0) / cell)), j1 = Math.min(H - 1, Math.ceil((y1 + P.feather - Y0) / cell));
      for (let j = j0; j <= j1; j++) {
        const y = cy(j), wy = smoothstep(y0 - P.feather, y0 + P.feather, y) * (1 - smoothstep(y1 - P.feather, y1 + P.feather, y));
        if (wy <= 0) continue;
        for (let i = i0; i <= i1; i++) {
          const x = cx(i), k = j * W + i;
          const wx = smoothstep(x0 - P.feather, x0 + P.feather, x) * (1 - smoothstep(front - 0.006, front + 0.006, x));
          const w = wy * wx;
          let v = h[k] + (base[k] - h[k]) * w;
          const pd = (x - front - P.pileAt) / P.pileSigma;
          if (x > front - 0.02) v += P.pile * Math.exp(-pd * pd) * wy * smoothstep(x0 - P.feather, x0 + P.feather, x);
          h[k] = v;
        }
      }
      return [i0, j0, i1, j1];
    }
    const P = o.profile[op.tool];
    const isRake = op.tool === "rake";
    const half = isRake ? (op.tines * op.spacing) / 2 : 0;
    const reach = isRake ? half + op.spacing * (P.edge + 0.6) : P.reach;
    const box = rasterise(op, sNow, reach);
    for (const k of touched) {
      const d = dmin[k];
      let prof, w;
      if (isRake) {
        const L = lat[k], aL = Math.abs(L);
        prof = -P.amp * Math.cos((2 * Math.PI * (L + half - op.spacing / 2)) / op.spacing);
        if (aL > half) { const cq = Math.cos(clamp((aL - half) / (op.spacing * P.edge)) * Math.PI * 0.5); prof = P.amp * cq * cq; }
        w = 1 - smoothstep(half + op.spacing * P.edge * 0.6, half + op.spacing * (P.edge + 0.5), aL);
        const c = cap[k];
        if (c > 0) { const q = c / P.capSoft; w *= Math.exp(-q * q); }
      } else {
        const g = d / P.sigma, r = (d - P.ridgeAt) / P.ridgeSigma;
        prof = -P.depth * Math.exp(-g * g) + P.ridge * Math.exp(-r * r);
        w = 1 - smoothstep(P.reach * 0.62, P.reach, d);
      }
      h[k] = h[k] + (base[k] + prof - h[k]) * w;
    }
    clearScratch();
    return box;
  }

  // ---- completed-prefix cache: field after the first k ops (pure function of k)
  const cache = new Map();
  const CACHE_MAX = 6;
  function prefix(k) {
    if (cache.has(k)) return cache.get(k);
    let from = -1;
    for (const key of cache.keys()) if (key <= k && key > from) from = key;
    const h = from >= 0 ? cache.get(from).h.slice() : base.slice();
    for (let i = Math.max(0, from); i < k; i++) applyOp(h, plan.ops[i], plan.ops[i].L);
    const entry = { h, normal: new Uint8Array(N * 4), color: new Uint8Array(N * 4) };
    shadeRect(h, entry.normal, entry.color, 0, 0, W - 1, H - 1);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(k, entry);
    return entry;
  }

  // ---- shading: tangent-space normals + self-shadow march toward the sun + albedo
  const lx = Math.cos(SH.azimuth), ly = Math.sin(SH.azimuth), tanE = Math.tan(SH.elevation);
  const stepC = SH.stepCells, stepM = stepC * cell;
  const marchCells = Math.ceil(SH.steps * stepC) + 2;
  function sampleH(h, fx, fy) {
    const i = clamp(Math.floor(fx), 0, W - 2), j = clamp(Math.floor(fy), 0, H - 2), u = clamp(fx - i, 0, 1), v = clamp(fy - j, 0, 1), k = j * W + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + W] * (1 - u) + h[k + W + 1] * u) * v;
  }
  function shadeRect(h, nOut, cOut, i0, j0, i1, j1) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(W - 1, i1); j1 = Math.min(H - 1, j1);
    const inv2c = (SH.slopeExag) / (2 * cell);
    for (let j = j0; j <= j1; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(H - 1, j + 1);
      for (let i = i0; i <= i1; i++) {
        const k = j * W + i, im = Math.max(0, i - 1), ip = Math.min(W - 1, i + 1);
        const hx = (h[j * W + ip] - h[j * W + im]) * inv2c, hy = (h[jp * W + i] - h[jm * W + i]) * inv2c;
        const il = 1 / Math.sqrt(hx * hx + hy * hy + 1);
        nOut[k * 4] = Math.round((-hx * il * 0.5 + 0.5) * 255);
        nOut[k * 4 + 1] = Math.round((-hy * il * 0.5 + 0.5) * 255);
        nOut[k * 4 + 2] = Math.round((il * 0.5 + 0.5) * 255);
        nOut[k * 4 + 3] = 255;
        // self-shadow: march toward the sun; occluded when the sand rises above the light ray
        const h0 = h[k];
        let occ = 0;
        for (let s = 1; s <= SH.steps; s++) {
          const hs = sampleH(h, i + lx * stepC * s, j + ly * stepC * s);
          const over = hs - h0 - s * stepM * tanE;
          if (over > 0) { const q = over / SH.soft; if (q > occ) occ = q; }
        }
        occ = Math.min(1, occ);
        const lit = 1 - SH.strength * occ * occ * (3 - 2 * occ);
        const deep = clamp(-(h0 - base[k]) / 0.012) * SH.grooveTone; // groove floors a touch darker (compacted sand)
        const a = albedo[k] * lit;
        cOut[k * 4] = toByte(lerp(sand[0], sandDeep[0], deep * 4) * a);
        cOut[k * 4 + 1] = toByte(lerp(sand[1], sandDeep[1], deep * 4) * a);
        cOut[k * 4 + 2] = toByte(lerp(sand[2], sandDeep[2], deep * 4) * a);
        cOut[k * 4 + 3] = 255;
      }
    }
  }

  const cur = { h: new Float32Array(N), normal: new Uint8Array(N * 4), color: new Uint8Array(N * 4) };
  /** at(t): field + shading for time t. */
  function at(t) {
    const ops = plan.ops;
    let k = 0;
    while (k < ops.length && ops[k].end <= t) k++;
    const P = prefix(k);
    cur.h.set(P.h); cur.normal.set(P.normal); cur.color.set(P.color);
    const op = ops[k];
    if (op && t > op.start) {
      const box = applyOp(cur.h, op, opProgress(op, t));
      if (box && box[2] >= box[0]) shadeRect(cur.h, cur.normal, cur.color, box[0] - marchCells, box[1] - marchCells, box[2] + marchCells, box[3] + marchCells);
    }
    return cur;
  }
  /** heightAt(t, x, y) for props that sit on the sand (bilinear; reads the last at() result). */
  return { W, H, N, ppm, cell, X0, Y0, at, base, sampleCur: (x, y) => sampleH(cur.h, (x - X0) / cell - 0.5, (y - Y0) / cell - 0.5) };
}

function toByte(lin) { return Math.max(0, Math.min(255, Math.round(lin * 255))); }
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash01(xi, yi, seed), b = hash01(xi + 1, yi, seed), c = hash01(xi, yi + 1, seed), d = hash01(xi + 1, yi + 1, seed);
  const u = s(xf), v = s(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// ------------------------------------------------------------------------------------------------ sound
/**
 * sandVoices(snd) -> voices for kit scoreFromEvents(plan.events, voices): a soft sand hiss for every contact (pitch and
 * density by tool, length = the contact), a quiet wooden tick when a tool hops, a wooden knock when it is lifted off at
 * the end of an item. The per-beat bowl tone is added by the scene from BEATS (bowlTone()).
 */
export function sandVoices(snd = {}) {
  const S = {
    hiss: { rake: { pitch: 0.42, density: 0.85, gain: 0.5 }, stylus: { pitch: 0.62, density: 0.7, gain: 0.32 }, ball: { pitch: 0.3, density: 0.9, gain: 0.36 }, board: { pitch: 0.24, density: 0.95, gain: 0.55 } },
    knock: { type: "clack", pitch: 0.42, gain: 0.42 }, tick: { type: "clack", pitch: 0.62, gain: 0.12 }, land: { type: "thud", pitch: 1.9, gain: 0.12 },
    ...snd,
  };
  return {
    move: (e) => { const v = S.hiss[e.tool] ?? S.hiss.stylus; return [{ type: "paper", dur: Math.max(0.2, e.dur), pitch: v.pitch, density: v.density, gain: v.gain }]; },
    lift: (e) => [e.last ? { type: S.knock.type, pitch: S.knock.pitch, gain: S.knock.gain, offset: 0.12 } : { type: S.tick.type, pitch: S.tick.pitch, gain: S.tick.gain, offset: 0.05 }],
    land: (e) => (e.first ? [{ type: S.land.type, pitch: S.land.pitch, gain: S.land.gain, dur: 0.25 }] : []),
  };
}
/** bowlTone(t, o) -> a low struck-bowl tone (inharmonic chime pitched down) as SCORE entries. */
export function bowlTone(t, { pitch = 0.25, gain = 0.3, dur = 4, seed = 2 } = {}) {
  return [{ t, type: "chime", pitch, gain, dur, seed }, { t, type: "chime", pitch: pitch * 1.006, gain: gain * 0.5, dur, seed: seed + 1, pan: 0.2 }];
}
