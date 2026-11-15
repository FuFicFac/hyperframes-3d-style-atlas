// fontoutline.js — real-font outlines -> extruded 3D type, and font loading before build. Promoted from the
// wam-house pilot (same tracing code). The face is rasterised at tracePx, traced with marching squares (sub-pixel
// interpolation), simplified (closed RDP), nested even/odd into THREE.Shapes and extruded with an outward bevel,
// so the front face keeps the true outline. Kerning comes from canvas shaping. All caches are keyed by inputs.
//
// FONT LOADING: fonts must be loaded BEFORE you trace (await loadFonts(...) at the top of scene.js, top-level
// await is fine), and named in index.html CSS so the HyperFrames compiler embeds them. Without that the trace
// silently uses a fallback face and the geometry differs between preview and render.
import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp } from "./time.js";
import { canvas2d } from "./canvas.js";

/** Default extrusion look (fractions of cap height): depth .3, bevel .02 (2 segments), crease .3 rad. */
export const EXTRUDE_TYPE = { tracePx: 420, simplify: 1.1, depth: 0.3, bevel: 0.02, bevelSegments: 2, crease: 0.3 };

/**
 * loadFonts({ load: ["400 120px 'League Gothic'", ...], families: ["League Gothic", ...], timeout = 4000 })
 *   -> Promise<{ [family]: true|false }>: waits (bounded) for document.fonts.load of each face, then reports which
 *   families really resolved. Use the report to warn — a false means the fallback stack will be traced.
 */
export async function loadFonts({ load = [], families = [], timeout = 4000 } = {}) {
  if (typeof document === "undefined" || !document.fonts) return {};
  let timer;
  await Promise.race([Promise.all(load.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => { timer = setTimeout(r, timeout); })]);
  clearTimeout(timer);
  const report = {};
  for (const fam of families) report[fam] = [...document.fonts].some((f) => f.family.replace(/["']/g, "") === fam && f.status === "loaded");
  return report;
}

// The display face is traced from the real font: raster at spec.type.tracePx, marching squares with
// sub-pixel interpolation, closed RDP simplification, even/odd nesting -> THREE.Shapes -> bevelled extrusion.
const glyphCache = new Map();

function traceLoops(alpha, W, H, thr = 0.5) {
  const v = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : alpha[y * W + x]);
  const W2 = W + 2;
  const key = (x, y, vert) => ((y + 1) * W2 + (x + 1)) * 2 + (vert ? 1 : 0);
  const pts = new Map();
  const point = (k, ax, ay, bx, by) => {
    if (!pts.has(k)) {
      const a = v(ax, ay), b = v(bx, by), u = clamp((thr - a) / (b - a || 1e-6));
      pts.set(k, [ax + (bx - ax) * u, ay + (by - ay) * u]);
    }
    return k;
  };
  const segs = [];
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const a = v(x, y) >= thr, b = v(x + 1, y) >= thr, c = v(x + 1, y + 1) >= thr, d = v(x, y + 1) >= thr;
    const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const e0 = () => point(key(x, y, false), x, y, x + 1, y);
    const e1 = () => point(key(x + 1, y, true), x + 1, y, x + 1, y + 1);
    const e2 = () => point(key(x, y + 1, false), x, y + 1, x + 1, y + 1);
    const e3 = () => point(key(x, y, true), x, y, x, y + 1);
    const centre = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= thr;
    switch (code) {
      case 1: segs.push([e3(), e0()]); break;
      case 2: segs.push([e0(), e1()]); break;
      case 3: segs.push([e3(), e1()]); break;
      case 4: segs.push([e1(), e2()]); break;
      case 5: if (centre) { segs.push([e0(), e1()]); segs.push([e2(), e3()]); } else { segs.push([e3(), e0()]); segs.push([e1(), e2()]); } break;
      case 6: segs.push([e0(), e2()]); break;
      case 7: segs.push([e3(), e2()]); break;
      case 8: segs.push([e2(), e3()]); break;
      case 9: segs.push([e0(), e2()]); break;
      case 10: if (centre) { segs.push([e3(), e0()]); segs.push([e1(), e2()]); } else { segs.push([e0(), e1()]); segs.push([e2(), e3()]); } break;
      case 11: segs.push([e1(), e2()]); break;
      case 12: segs.push([e1(), e3()]); break;
      case 13: segs.push([e0(), e1()]); break;
      case 14: segs.push([e3(), e0()]); break;
    }
  }
  const at = new Map();
  segs.forEach((s, i) => { for (const k of s) { if (!at.has(k)) at.set(k, []); at.get(k).push(i); } });
  const used = new Uint8Array(segs.length), loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const start = segs[i][0];
    let cur = segs[i][1], si = i;
    const loop = [pts.get(start)];
    for (let guard = 0; guard < segs.length + 2 && cur !== start; guard++) {
      loop.push(pts.get(cur));
      const nxt = (at.get(cur) ?? []).find((j) => j !== si && !used[j]);
      if (nxt == null) break;
      used[nxt] = 1;
      si = nxt;
      cur = segs[nxt][0] === cur ? segs[nxt][1] : segs[nxt][0];
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
  let best = -1, bi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
    if (d > best) { best = d; bi = i; }
  }
  if (best <= eps) return [pts[0], pts[pts.length - 1]];
  const l = rdp(pts.slice(0, bi + 1), eps), r = rdp(pts.slice(bi), eps);
  return [...l.slice(0, -1), ...r];
}
function simplifyClosed(loop, eps) {
  // split at the point farthest from loop[0], simplify both halves
  let far = 0, fd = -1;
  loop.forEach((p, i) => { const d = (p[0] - loop[0][0]) ** 2 + (p[1] - loop[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
  const a = rdp(loop.slice(0, far + 1), eps), b = rdp([...loop.slice(far), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
const area = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
function inside(pt, l) {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    const [xi, yi] = l[i], [xj, yj] = l[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * glyphOutline(ch, { font, tracePx, simplify }) -> { shapes:[{outer, holes}] in px around the pen origin (y up),
 *   advance, inkL, inkR, capPx } — cached per (ch, font, size). Uses the real embedded font when loaded.
 */
export function glyphOutline(ch, { font = '"Helvetica Neue", Helvetica, sans-serif', tracePx = 420, simplify = 1.1 } = {}) {
  const k = `${ch}|${font}|${tracePx}|${simplify}`;
  if (glyphCache.has(k)) return glyphCache.get(k);
  const c = document.createElement("canvas");
  const ctx = canvas2d(c); // pass 7: CPU raster (repeatable outline; getImageData below)
  const fs = `400 ${tracePx}px ${font}`;
  ctx.font = fs;
  const m = ctx.measureText(ch), mh = ctx.measureText("H");
  const pad = Math.ceil(tracePx * 0.12);
  const left = Math.ceil(m.actualBoundingBoxLeft), right = Math.ceil(m.actualBoundingBoxRight);
  const asc = Math.ceil(Math.max(m.actualBoundingBoxAscent, mh.actualBoundingBoxAscent)), desc = Math.ceil(Math.max(0, m.actualBoundingBoxDescent));
  const W = left + right + pad * 2, H = asc + desc + pad * 2;
  c.width = Math.max(4, W); c.height = Math.max(4, H);
  ctx.font = fs;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const ox = pad + left, base = pad + asc;
  ctx.fillText(ch, ox, base);
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const alpha = new Float32Array(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img[i * 4 + 3] / 255;
  const loops = traceLoops(alpha, c.width, c.height)
    .map((l) => simplifyClosed(l, simplify).map(([x, y]) => [x - ox, base - y]))
    .filter((l) => l.length >= 3 && Math.abs(area(l)) > 4);
  const depth = loops.map((l, i) => loops.reduce((n, o, j) => n + (j !== i && Math.abs(area(o)) > Math.abs(area(l)) && inside(l[0], o) ? 1 : 0), 0));
  const shapes = [];
  loops.forEach((l, i) => { if (depth[i] % 2 === 0) shapes.push({ outer: l, holes: [], idx: i }); });
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) return;
    let best = null;
    for (const s of shapes) if (depth[s.idx] === depth[i] - 1 && inside(l[0], s.outer) && (!best || Math.abs(area(s.outer)) < Math.abs(area(best.outer)))) best = s;
    if (best) best.holes.push(l);
  });
  const res = { shapes, advance: m.width, inkL: -left, inkR: right, capPx: mh.actualBoundingBoxAscent, font };
  glyphCache.set(k, res);
  return res;
}

/** kerning(a, b) in trace px (canvas shaping of the pair minus the two advances). */
const kernCache = new Map();
export function kerning(a, b, font, px) {
  const k = `${a}${b}|${font}|${px}`;
  if (kernCache.has(k)) return kernCache.get(k);
  const ctx = canvas2d(document.createElement("canvas"));
  ctx.font = `400 ${px}px ${font}`;
  const v = ctx.measureText(a + b).width - ctx.measureText(a).width - ctx.measureText(b).width;
  kernCache.set(k, v);
  return v;
}

const geoCache = new Map();
/**
 * glyphGeometry(ch, cap, T = spec.type) -> ExtrudeGeometry (groups: 0 = front/back caps, 1 = bevel + sides),
 *   baseline at y = 0, pen origin at x = 0, centred in z (front face at +depth/2). Cached.
 */
export function glyphGeometry(ch, cap, T = EXTRUDE_TYPE, font = '"Helvetica Neue", Helvetica, sans-serif') {
  const k = `${ch}|${cap}|${T.depth}|${T.bevel}|${font}`;
  if (geoCache.has(k)) return geoCache.get(k);
  const g = glyphOutline(ch, { font, tracePx: T.tracePx, simplify: T.simplify });
  const s = cap / g.capPx;
  const shapes = g.shapes.map(({ outer, holes }) => {
    const sh = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x * s, y * s)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * s, y * s))));
    return sh;
  });
  const D = cap * T.depth, b = cap * T.bevel;
  let geo = new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(1e-3, D - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: 0,
    bevelSegments: T.bevelSegments, curveSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -(D - 2 * b) / 2);
  geo = toCreasedNormals(geo, T.crease);
  geo.userData = { advance: g.advance * s, inkL: g.inkL * s, inkR: g.inkR * s, scale: s };
  geoCache.set(k, geo);
  return geo;
}

/** layoutLine(text, cap, { tracking }) -> { slots:[{ ch, i, x }], width (ink), x0 (ink left) } — pen positions with kerning. */
export function layoutLine(text, cap, { tracking = 0.035, T = EXTRUDE_TYPE, font = '"Helvetica Neue", Helvetica, sans-serif' } = {}) {
  const chars = [...text];
  let pen = 0;
  const slots = [];
  let inkL = Infinity, inkR = -Infinity;
  chars.forEach((ch, i) => {
    const g = glyphOutline(ch, { font, tracePx: T.tracePx, simplify: T.simplify });
    const s = cap / g.capPx;
    if (i > 0) pen += kerning(chars[i - 1], ch, font, T.tracePx) * s;
    slots.push({ ch, i, x: pen });
    if (ch !== " ") { inkL = Math.min(inkL, pen + g.inkL * s); inkR = Math.max(inkR, pen + g.inkR * s); }
    pen += g.advance * s + tracking * cap;
  });
  if (!isFinite(inkL)) { inkL = 0; inkR = 0; }
  return { slots, width: inkR - inkL, x0: inkL };
}

