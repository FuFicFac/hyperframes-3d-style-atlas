// styles/stained-glass/glazing.js — the GLAZIER'S PLAN for "Stained Glass" (pure, THREE-free, Node-safe).
// Window outlines, a convex-polygon toolkit (clip / subtract / inset), a seeded Voronoi pane layout, figures built
// from convex panes (sun, cloud, drop, tree, star, heart, person, rings, petals), and the TIME PLAN: when each lead
// came is laid, when each pane is set, when the light comes up and which region glows when. style.js reads the plan
// for the picture; scene.config.js imports the same plan so SCORE (one glass tick per bin of set panes, a chime per
// named region) is derived from it. Units: metres in WINDOW SPACE (x right, y up, origin at the sill centre).
import { rng, clamp, smoothstep, ease } from "../../kit/time.js";

// ------------------------------------------------------------------ polygon toolkit (pts CCW: [[x, y], ...])
export function area(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}
export function centroid(p) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-12) { const n = p.length; return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]; }
  return [cx / (3 * a), cy / (3 * a)];
}
export const ccw = (p) => (area(p) < 0 ? p.slice().reverse() : p);
export function bbox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
/** clipHalf(poly, nx, ny, d) — keep the part where nx·x + ny·y <= d (Sutherland–Hodgman, one plane). */
export function clipHalf(poly, nx, ny, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  }
  return dedupe(out);
}
function dedupe(p, eps = 1e-7) {
  const out = [];
  for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > eps) out.push(q); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out.length >= 3 ? out : [];
}
/** Outward edge planes of a convex CCW polygon: [nx, ny, d] with inside = n·q <= d. */
export function edgePlanes(poly) {
  const P = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
    if (L < 1e-9) continue;
    const nx = ey / L, ny = -ex / L;
    P.push([nx, ny, nx * a[0] + ny * a[1]]);
  }
  return P;
}
/** clipConvex(poly, convexClipper) — poly ∩ clipper. */
export function clipConvex(poly, clipper) {
  let r = poly;
  for (const [nx, ny, d] of edgePlanes(clipper)) { r = clipHalf(r, nx, ny, d); if (!r.length) break; }
  return r;
}
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** subtractConvex(poly, hole) — poly minus a convex hole as DISJOINT convex pieces (one per hole edge). */
export function subtractConvex(poly, hole) {
  if (!overlaps(bbox(poly), bbox(hole))) return [poly];
  const pieces = [];
  let rest = poly;
  for (const [nx, ny, d] of edgePlanes(hole)) {
    const outside = clipHalf(rest, -nx, -ny, -d);
    if (outside.length && Math.abs(area(outside)) > 1e-7) pieces.push(outside);
    rest = clipHalf(rest, nx, ny, d);
    if (!rest.length) break;
  }
  return pieces;
}
/** hull(points) -> convex hull CCW (monotone chain). */
export function hull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-12) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** mergeConvex(pieces) — greedily re-join disjoint convex pieces whose union is still convex (undoes needless cuts). */
export function mergeConvex(pieces) {
  let L = pieces.map((p) => ccw(p));
  for (let again = true; again;) {
    again = false;
    outer: for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const h = hull([...L[i], ...L[j]]), s = Math.abs(area(L[i])) + Math.abs(area(L[j]));
      if (Math.abs(area(h) - s) <= 1e-6 + s * 1e-4) { L[i] = h; L.splice(j, 1); again = true; break outer; }
    }
  }
  return L;
}
/** offsetPoly(poly, d) — move every vertex along its corner bisector so each edge shifts d INWARD (d < 0 = outward). */
export function offsetPoly(poly, d) {
  const n = poly.length, N = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    N.push([-ey / L, ex / L]); // inward (left) normal of edge i
  }
  return poly.map((p, i) => {
    const n1 = N[(i - 1 + n) % n], n2 = N[i], k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    const s = d / Math.max(k, 0.15);
    return [p[0] + (n1[0] + n2[0]) * s, p[1] + (n1[1] + n2[1]) * s];
  });
}
export function insideConvex(q, poly) {
  for (const [nx, ny, d] of edgePlanes(poly)) if (nx * q[0] + ny * q[1] > d + 1e-9) return false;
  return true;
}
/** inradius from a point: smallest distance to the polygon's edge lines. */
export function inradius(poly, c = centroid(poly)) {
  let m = Infinity;
  for (const [nx, ny, d] of edgePlanes(poly)) m = Math.min(m, d - (nx * c[0] + ny * c[1]));
  return Math.max(m, 0);
}
const circlePts = (cx, cy, r, n, a0 = 0, a1 = Math.PI * 2, closed = true) => {
  const out = [], m = closed ? n : n + 1;
  for (let i = 0; i < m; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
};

// ------------------------------------------------------------------ window outlines (convex, CCW, sill at y = 0)
/**
 * outline(kind, o) -> CCW polygon in window space.
 *   "arch"  pointed (gothic) arch: { w, spring (jamb height), k (arc radius / w: .5 = round, .75 default, 1 = lancet), seg }
 *   "round" round-headed (romanesque) arch = arch with k .5
 *   "rose"  circle: { r, seg } (bottom at y = 0)        "rect": { w, h }
 */
export function outline(kind = "arch", o = {}) {
  if (kind === "rect") { const w = o.w ?? 3, h = o.h ?? 4; return [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]]; }
  if (kind === "rose") { const r = o.r ?? 2.2; return circlePts(0, r, r, o.seg ?? 64, -Math.PI / 2, Math.PI * 1.5); }
  const w = o.w ?? 3.6, s = o.spring ?? 2.6, k = kind === "round" ? 0.5 : o.k ?? 0.75, seg = o.seg ?? 16;
  const r = Math.max(k, 0.5) * w, cx = w / 2 - r;
  const th = Math.acos(clamp((0 - cx) / r, -1, 1));
  const pts = [[-w / 2, 0], [w / 2, 0]];
  for (let i = 0; i <= seg; i++) { const a = (th * i) / seg; pts.push([cx + r * Math.cos(a), s + r * Math.sin(a)]); }
  for (let i = k <= 0.5 ? 1 : 0; i <= seg; i++) { const a = Math.PI - th + (th * i) / seg; pts.push([-cx + r * Math.cos(a), s + r * Math.sin(a)]); }
  return dedupe(pts, 1e-6);
}
/** resample(poly, step) — subdivide long edges (corners kept). */
export function resample(poly, step = 0.25) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
  }
  return out;
}

// ------------------------------------------------------------------ figures built from convex panes
// Each returns [{ pts, tone, region }]; tones are palette KEYS resolved by style.js (spec.glass.tones).
const P = (pts, tone, region) => ({ pts: ccw(pts), tone, region });
export const figures = {
  /** sun: a disc of wedge panes + triangular rays. */
  sun(c, r, { rays = 8, region = "sun", tones = ["sunA", "sunB"], ray = "ray", rayIn = 1.18, rayOut = 1.8, rot = 0 } = {}) {
    const out = [], n = rays, seg = 3;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      out.push(P([[c[0], c[1]], ...circlePts(c[0], c[1], r, seg, a0, a1, false)], tones[i % tones.length], region));
      const am = (a0 + a1) / 2, hw = (Math.PI / n) * 0.42;
      out.push(P([[c[0] + r * rayIn * Math.cos(am - hw), c[1] + r * rayIn * Math.sin(am - hw)],
        [c[0] + r * rayOut * Math.cos(am), c[1] + r * rayOut * Math.sin(am)],
        [c[0] + r * rayIn * Math.cos(am + hw), c[1] + r * rayIn * Math.sin(am + hw)]], ray, region));
    }
    return out;
  },
  /** cloud: a stadium base and two domes (three disjoint convex panes). */
  cloud(c, s = 1, { region = "cloud", tones = ["cloudA", "cloudB", "cloudC"] } = {}) {
    const [x, y] = c, hw = 0.55 * s, h = 0.26 * s, rr = h / 2;
    const base = [...circlePts(x + hw - rr, y + rr - h, rr, 6, -Math.PI / 2, Math.PI / 2, false).map(([a, b]) => [a, b]),
      ...circlePts(x - hw + rr, y + rr - h, rr, 6, Math.PI / 2, Math.PI * 1.5, false)];
    const top = y; // flat top of the base
    const d1 = [[x - 0.12 * s, top], [x + 0.42 * s, top], ...circlePts(x + 0.15 * s, top, 0.27 * s, 8, 0, Math.PI, false).slice(1, -1)];
    const d2 = [[x - 0.47 * s, top], [x - 0.13 * s, top], ...circlePts(x - 0.3 * s, top, 0.17 * s, 6, 0, Math.PI, false).slice(1, -1)];
    return [P(base, tones[0], region), P(d1, tones[1], region), P(d2, tones[2], region)];
  },
  /** drop: a convex teardrop (point up). */
  drop(c, s = 0.2, { region = "rain", tone = "drop" } = {}) {
    const r = s * 0.5, pts = [[c[0], c[1] + s * 1.15]];
    for (let i = 0; i <= 6; i++) { const a = (150 + (240 * i) / 6) * (Math.PI / 180); pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return [P(pts, tone, region)];
  },
  /** crown: a leafy tree crown = inner wedge fan + outer ring of trapezoids, slightly irregular (seeded). */
  crown(c, r, { n = 9, seed = 7, region = "crown", tones = ["leafA", "leafB", "leafC", "leafD"], inner = 0.48, wobble = 0.08 } = {}) {
    const R = rng(seed), out = [];
    const ro = Array.from({ length: n }, () => r * (1 + R.range(-wobble, wobble)));
    const ri = Array.from({ length: n }, () => r * inner * (1 + R.range(-wobble, wobble)));
    const pt = (rad, i) => { const a = Math.PI / 2 + (i / n) * Math.PI * 2; return [c[0] + rad * Math.cos(a), c[1] + rad * Math.sin(a)]; };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(P([[c[0], c[1]], pt(ri[i], i), pt(ri[j], i + 1)], tones[(i + 1) % tones.length], region));
      out.push(P([pt(ri[i], i), pt(ro[i], i), pt(ro[j], i + 1), pt(ri[j], i + 1)], tones[(i * 3) % tones.length], region));
    }
    return out;
  },
  /** blob: an irregular convex outline (for shaped fields: a leafy crown, a hill, a halo). Returns POINTS, not panes. */
  blob(c, r, { n = 14, wobble = 0.08, seed = 7, squash = 1 } = {}) {
    const R = rng(seed);
    return hull(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, k = r * (1 + R.range(-wobble, wobble)); return [c[0] + k * Math.cos(a), c[1] + k * squash * Math.sin(a)]; }));
  },
  /** trunk: a tapered trunk split into two staves. */
  trunk(base, top, { w0 = 0.42, w1 = 0.26, region = "trunk", tones = ["barkA", "barkB"] } = {}) {
    const [bx, by] = base, [tx, ty] = top;
    return [P([[bx - w0 / 2, by], [bx, by], [tx, ty], [tx - w1 / 2, ty]], tones[0], region),
      P([[bx, by], [bx + w0 / 2, by], [tx + w1 / 2, ty], [tx, ty]], tones[1], region)];
  },
  /** roots: thin triangles fanning down from a point. */
  roots(base, { n = 5, len = 0.7, spread = 1.9, width = 0.09, seed = 3, region = "roots", tone = "root" } = {}) {
    const R = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * spread + R.range(-0.08, 0.08), L = len * R.range(0.75, 1.05);
      const px = -Math.sin(a), py = Math.cos(a);
      out.push(P([[base[0] + px * width, base[1] + py * width], [base[0] - px * width, base[1] - py * width],
        [base[0] + Math.cos(a) * L, base[1] + Math.sin(a) * L]], tone, region));
    }
    return out;
  },
  /** star: centre polygon + tip triangles. */
  star(c, r, { points = 5, inner = 0.42, region = "star", tones = ["sunA", "sunB"] } = {}) {
    const out = [], ins = [];
    for (let i = 0; i < points; i++) { const a = Math.PI / 2 + ((i + 0.5) / points) * Math.PI * 2; ins.push([c[0] + r * inner * Math.cos(a), c[1] + r * inner * Math.sin(a)]); }
    out.push(P(ins, tones[1], region));
    for (let i = 0; i < points; i++) {
      const a = Math.PI / 2 + (i / points) * Math.PI * 2;
      out.push(P([ins[(i - 1 + points) % points], ins[i], [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]].reverse(), tones[0], region));
    }
    return out;
  },
  /** heart: two convex halves. */
  heart(c, s = 0.5, { region = "heart", tones = ["ruby", "rubyB"] } = {}) {
    const half = (sg) => {
      const pts = [[c[0], c[1] - s * 0.95], [c[0], c[1] + s * 0.28]];
      const lc = [c[0] + sg * s * 0.27, c[1] + s * 0.3], lr = s * 0.28;
      for (let i = 1; i <= 10; i++) { const a = (sg > 0 ? Math.PI : 0) - sg * (i / 10) * Math.PI * 1.15; pts.push([lc[0] + lr * Math.cos(a), lc[1] + lr * Math.sin(a)]); }
      return P(pts, tones[sg > 0 ? 0 : 1], region);
    };
    return [half(-1), half(1)];
  },
  /** person: head, body, two arms, two legs (disjoint convex panes). */
  person(c, s = 1, { region = "person", tones = { head: "skin", body: "ruby", limb: "rubyB" } } = {}) {
    const [x, y] = c, k = s;
    return [
      P(circlePts(x, y + 1.42 * k, 0.15 * k, 10), tones.head, region),
      P([[x - 0.2 * k, 0.62 * k + y], [x + 0.2 * k, 0.62 * k + y], [x + 0.17 * k, 1.22 * k + y], [x - 0.17 * k, 1.22 * k + y]], tones.body, region),
      P([[x - 0.21 * k, 1.2 * k + y], [x - 0.27 * k, 1.12 * k + y], [x - 0.42 * k, 0.72 * k + y], [x - 0.34 * k, 0.7 * k + y]].reverse(), tones.limb, region),
      P([[x + 0.21 * k, 1.2 * k + y], [x + 0.34 * k, 0.7 * k + y], [x + 0.42 * k, 0.72 * k + y], [x + 0.27 * k, 1.12 * k + y]].reverse(), tones.limb, region),
      P([[x - 0.18 * k, y], [x - 0.03 * k, y], [x - 0.03 * k, 0.6 * k + y], [x - 0.19 * k, 0.6 * k + y]], tones.limb, region),
      P([[x + 0.03 * k, y], [x + 0.18 * k, y], [x + 0.19 * k, 0.6 * k + y], [x + 0.03 * k, 0.6 * k + y]], tones.limb, region),
    ];
  },
  /** ring: an annulus as n convex segments (rose windows, haloes). */
  ring(c, r0, r1, { n = 12, region = "ring", tones = ["ruby", "gold"], rot = 0 } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      out.push(P([...circlePts(c[0], c[1], r0, 2, a0, a1, false), ...circlePts(c[0], c[1], r1, 2, a1, a0, false)], tones[i % tones.length], region));
    }
    return out;
  },
  /** petals: n rhombus petals around a centre (rose windows). */
  petals(c, r, { n = 8, width = 0.32, inner = 0.18, region = "petals", tones = ["skyA", "ruby"], rot = 0 } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2, px = -Math.sin(a), py = Math.cos(a), ca = Math.cos(a), sa = Math.sin(a);
      const m = r * (inner + 1) / 2, w = r * width / 2;
      out.push(P([[c[0] + ca * r * inner, c[1] + sa * r * inner], [c[0] + ca * m + px * w, c[1] + sa * m + py * w],
        [c[0] + ca * r, c[1] + sa * r], [c[0] + ca * m - px * w, c[1] + sa * m - py * w]].reverse(), tones[i % tones.length], region));
    }
    return out;
  },
};

// ------------------------------------------------------------------ seeded sites + Voronoi
/** sites(poly, { count, seed, minDist, mode: "random"|"rings"|"grid", center }) -> [[x, y]] inside the convex poly. */
export function sites(poly, o = {}) {
  const R = rng(o.seed ?? 1), [x0, y0, x1, y1] = bbox(poly), A = Math.abs(area(poly));
  const count = o.count ?? Math.max(4, Math.round(A * (o.density ?? 6)));
  const out = [];
  if (o.mode === "rings") {
    const c = o.center ?? centroid(poly), rmax = Math.max(x1 - x0, y1 - y0) * 0.75, rings = o.rings ?? 5;
    out.push([c[0] + R.range(-0.01, 0.01), c[1]]);
    for (let k = 1; k <= rings; k++) {
      const r = (rmax * k) / rings, n = Math.max(5, Math.round((o.perRing ?? 6) * k));
      for (let i = 0; i < n; i++) { const a = (i + 0.5 * (k % 2)) / n * Math.PI * 2 + R.range(-0.05, 0.05); const q = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; if (insideConvex(q, poly)) out.push(q); }
    }
    return out;
  }
  const md = o.minDist ?? Math.sqrt(A / count) * 0.72;
  let tries = 0;
  while (out.length < count && tries < count * 400) {
    tries++;
    const q = [R.range(x0, x1), R.range(y0, y1)];
    if (!insideConvex(q, poly)) continue;
    if (out.some((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) < md)) continue;
    out.push(q);
  }
  return out;
}
/** voronoi(poly, sites) -> convex cells (one per site) clipped to the convex poly. */
export function voronoi(poly, S) {
  return S.map((s, i) => {
    let cell = poly;
    for (let j = 0; j < S.length && cell.length; j++) {
      if (j === i) continue;
      const t = S[j], nx = t[0] - s[0], ny = t[1] - s[1];
      cell = clipHalf(cell, nx, ny, (t[0] * t[0] + t[1] * t[1] - s[0] * s[0] - s[1] * s[1]) / 2);
    }
    return cell;
  }).filter((c) => c.length >= 3);
}

// ------------------------------------------------------------------ the window layout
/**
 * layoutWindow(design) -> { outline, inner, panes:[{ id, pts, tone, region, kind }], leads:[{ a, b, w, kind }], bars, bounds }
 * design = {
 *   frame: { kind, ...outline opts, resample },
 *   border: { width, step, tones, region } | null      (a band of alternating panes around the edge)
 *   fields: [{ id, region, clip: [[nx, ny, d]], tones, sites: { count|density, seed, mode, minDist } }]
 *            (background regions = the inner outline clipped by half-planes nx·x + ny·y <= d, filled with Voronoi panes)
 *   figures: [{ pts, tone, region }]   (convex pieces; cut out of the fields, clipped to the inner outline)
 *   bars: [y, ...]                      (horizontal iron saddle bars)
 *   seed, minArea
 * }
 */
export function layoutWindow(design) {
  const R = rng(design.seed ?? 1);
  const fr = design.frame ?? { kind: "arch" };
  const out0 = outline(fr.kind, fr);
  const outer = resample(out0, fr.resample ?? 0.22);
  const bw = design.border?.width ?? 0;
  const inner = bw > 0 ? offsetPoly(outer, bw) : outer;
  const panes = [];
  const push = (pts, tone, region, kind, extra = {}) => { if (pts.length >= 3 && Math.abs(area(pts)) > (design.minArea ?? 2e-4)) panes.push({ id: panes.length, pts: ccw(pts), tone, region, kind, ...extra }); };
  const onBoundary = (m, poly) => edgePlanes(poly).some(([nx, ny, d]) => Math.abs(nx * m[0] + ny * m[1] - d) < 1e-6) && insideConvex(m, offsetPoly(poly, -1e-5));

  // border band: chunks of the ring between outer and inner, cut at corners and every ~step metres
  if (bw > 0) {
    const B = design.border, step = B.step ?? 0.4, tones = B.tones ?? ["ruby", "gold"], n = outer.length;
    const corner = (i) => {
      const a = outer[(i - 1 + n) % n], b = outer[i], c = outer[(i + 1) % n];
      const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
      return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) > 0.35;
    };
    let start = 0;
    for (let i = 0; i < n; i++) if (corner(i)) { start = i; break; }
    let k = 0, cur = [start], len = 0;
    for (let s = 1; s <= n; s++) {
      const i = (start + s) % n, p = outer[(start + s - 1) % n];
      len += Math.hypot(outer[i][0] - p[0], outer[i][1] - p[1]);
      cur.push(i);
      if (len >= step || corner(i) || s === n) {
        push([...cur.map((j) => outer[j]), ...cur.slice().reverse().map((j) => inner[j])], tones[k % tones.length], B.region ?? "border", "border");
        k++; cur = [i]; len = 0;
      }
    }
  }

  // figures clipped to the inner outline
  const figs = [];
  for (const f of design.figures ?? []) { const c = clipConvex(ccw(f.pts), inner); if (c.length >= 3) figs.push({ ...f, pts: c }); }
  // shaped fields (F.poly: a convex area filled with its own Voronoi panes, e.g. a leafy crown) cut the plain fields too
  const shaped = (design.fields ?? []).filter((F) => F.poly).map((F) => ({ pts: clipConvex(ccw(F.poly), inner) })).filter((f) => f.pts.length >= 3);

  // fields: Voronoi panes minus every figure piece. The pieces of ONE cell are one piece of glass wrapped around the
  // figure: the cuts between them are SEAMS (no lead, no edge darkening, same seed) — real glaziers cut one sheet so.
  (design.fields ?? []).forEach((F, fi) => {
    let poly = F.poly ? clipConvex(ccw(F.poly), inner) : inner;
    for (const [nx, ny, d] of F.clip ?? []) poly = clipHalf(poly, nx, ny, d);
    if (!poly.length) return;
    const cutters = F.poly ? figs : [...figs, ...shaped];
    const cells = voronoi(poly, sites(poly, { seed: (design.seed ?? 1) * 31 + (F.sites?.seed ?? 0), ...(F.sites ?? {}) }));
    cells.forEach((cell, ci) => {
      let parts = [cell];
      for (const f of cutters) parts = parts.flatMap((p) => subtractConvex(p, f.pts));
      if (parts.length > 1) parts = mergeConvex(parts);
      const tone = R.pick(F.tones ?? ["skyA"]), cellId = `${fi}:${ci}`, cellC = centroid(cell);
      for (const p of parts) {
        const q = ccw(p), seams = [];
        if (parts.length > 1) q.forEach((a, i) => {
          const b = q[(i + 1) % q.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (!onBoundary(m, cell) && !cutters.some((f) => onBoundary(m, f.pts))) seams.push(i);
        });
        push(q, tone, F.region ?? F.id, "field", { cell: cellId, cellC, seams });
      }
    });
  });
  for (const f of figs) push(f.pts, f.tone, f.region, "figure");

  // leads: every pane edge once (rounded-endpoint key) + the frame came + saddle bars
  const leads = [], seen = new Set(), key = (p) => `${Math.round(p[0] * 500)},${Math.round(p[1] * 500)}`;
  for (const p of panes) for (let i = 0; i < p.pts.length; i++) {
    if (p.seams?.includes(i)) continue;
    const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.006) continue;
    const k1 = key(a) + "|" + key(b), k2 = key(b) + "|" + key(a);
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);
    leads.push({ a, b, kind: "came" });
  }
  for (let i = 0; i < outer.length; i++) leads.push({ a: outer[i], b: outer[(i + 1) % outer.length], kind: "frame" });
  const bars = [];
  for (const y of design.bars ?? []) {
    const seg = clipHalf(clipHalf(outer, 0, 1, y + 0.001), 0, -1, -(y - 0.001));
    if (!seg.length) continue;
    const [bx0, , bx1] = bbox(seg);
    bars.push({ a: [bx0, y], b: [bx1, y], kind: "bar" });
  }
  return { outline: out0, outer, inner, panes, leads, bars, bounds: bbox(outer) };
}

// ------------------------------------------------------------------ time plan
/**
 * planGlazing(layout, { lead:[t0, t1], set:[t0, t1], leadDur, setDur, order: "rise"|"centre"|"regions", regionOrder, seed, bin })
 *   -> { panes:[{ ...pane, set }], leads:[{ ...lead, t0, dur }], joints:[{ p, t }], events:[{ t, kind, n }] }
 *   A pane's `set` = the moment it LANDS in the leading (the picture's flight ends there; one glass tick per `bin` s).
 */
export function planGlazing(layout, o = {}) {
  const R = rng(o.seed ?? 5);
  const [l0, l1] = o.lead ?? [0.2, 1.8], [s0, s1] = o.set ?? [1.0, 3.4];
  const leadDur = o.leadDur ?? 0.35, bin = o.bin ?? 0.12;
  const [bx0, by0, bx1, by1] = layout.bounds, cx = (bx0 + bx1) / 2, H = by1 - by0;
  const rank = (p) => {
    if (o.order === "centre") return Math.hypot(p[0] - cx, p[1] - (by0 + H / 2));
    return p[1] + Math.abs(p[0] - cx) * 0.35; // "rise": bottom up, centre first
  };
  const jit = o.jitter ?? 0.25;
  const cellJit = new Map();
  const pr = layout.panes.map((p) => {
    // the pieces of one cell land together (same rank, same jitter)
    const k = p.cell ?? `p${p.id}`;
    if (!cellJit.has(k)) cellJit.set(k, R.range(-jit, jit) * (H / 10));
    return { p, r: rank(p.cellC ?? centroid(p.pts)) + cellJit.get(k) };
  });
  if (o.order === "regions" && o.regionOrder) pr.forEach((q) => { q.r += Math.max(0, o.regionOrder.indexOf(q.p.region)) * 1000; });
  pr.sort((a, b) => a.r - b.r);
  const panes = layout.panes.map((p) => ({ ...p }));
  pr.forEach((q, i) => { panes[q.p.id].set = s0 + ((s1 - s0) * i) / Math.max(1, pr.length - 1); });

  const all = [...layout.leads, ...layout.bars];
  const lr = all.map((l, i) => ({ i, r: (l.kind === "frame" ? -1e3 : 0) + rank([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]) + R.range(-jit, jit) * (H / 10) * 0.5 }));
  lr.sort((a, b) => a.r - b.r);
  const leads = all.map((l) => ({ ...l }));
  const span = Math.max(0.01, l1 - l0 - leadDur);
  lr.forEach((q, k) => { leads[q.i].t0 = l0 + (span * k) / Math.max(1, lr.length - 1); leads[q.i].dur = leadDur; });

  const jm = new Map(), jkey = (p) => `${Math.round(p[0] * 200)},${Math.round(p[1] * 200)}`;
  for (const l of leads) if (l.kind === "came") for (const p of [l.a, l.b]) {
    const k = jkey(p), t = l.t0 + l.dur;
    if (!jm.has(k) || jm.get(k).t > t) jm.set(k, { p, t });
  }
  const joints = [...jm.values()];

  const events = [];
  const binEvents = (times, kind) => {
    const m = new Map();
    for (const t of times) { const b = Math.round(t / bin); m.set(b, (m.get(b) ?? 0) + 1); }
    for (const [b, n] of [...m.entries()].sort((a, c) => a[0] - c[0])) events.push({ t: +(b * bin).toFixed(4), kind, n });
  };
  binEvents(panes.map((p) => p.set), "set");
  binEvents(leads.filter((l) => l.kind !== "frame").map((l) => l.t0), "lead");
  events.sort((a, b) => a.t - b.t);
  return { panes, leads, joints, events, layout };
}

/**
 * Light plan. light = { up:[t0, t1], base, pre, named:[{ t, regions:[...], peak, settle, rise, fall, label }], all:{ t, level, regions, peak } }
 * regionLevel(light, region, t) -> backlight level for that region at t (pure, closed form).
 */
export function regionLevel(L, region, t) {
  const up = smoothstep(L.up[0], L.up[1], t);
  let v = (L.pre ?? 0.06) + ((L.base ?? 0.4) - (L.pre ?? 0.06)) * up;
  for (const g of L.named ?? []) {
    if (!g.regions.includes(region)) continue;
    const rise = smoothstep(g.t - (g.rise ?? 0.25), g.t + (g.rise ?? 0.25) + 0.3, t);
    const settle = smoothstep(g.t + (g.hold ?? 1.2), g.t + (g.hold ?? 1.2) + (g.fall ?? 0.9), t);
    const target = (g.peak ?? 1.35) * (1 - settle) + (g.settle ?? 0.75) * settle;
    v = v + (Math.max(v, target) - v) * rise;
  }
  if (L.all) {
    const a = smoothstep(L.all.t - 0.3, L.all.t + 0.9, t);
    const lvl = (L.all.regions ?? []).includes(region) ? L.all.peak ?? 1.3 : L.all.level ?? 1.0;
    v = v + (Math.max(v, lvl) - v) * a;
  }
  return v;
}
/** lightEvents(light) -> [{ t, kind: "up"|"named"|"all", ... }] for SCORE. */
export function lightEvents(L) {
  return [{ t: L.up[0], kind: "up", dur: L.up[1] - L.up[0] },
    ...(L.named ?? []).map((g, i) => ({ t: g.t, kind: "named", i, regions: g.regions })),
    ...(L.all ? [{ t: L.all.t, kind: "all" }] : [])].sort((a, b) => a.t - b.t);
}

/** sunDir(t, keys [{ t, el, az, ease }]) -> unit vector the light TRAVELS along (into the room: +z, downward). Degrees. */
export function sunDir(t, keys) {
  let el = keys[0].el, az = keys[0].az;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= a.t) break;
    const u = (ease[b.ease ?? "inOutSine"] ?? ease.inOutSine)(clamp((t - a.t) / (b.t - a.t)));
    el = a.el + (b.el - a.el) * u; az = a.az + (b.az - a.az) * u;
  }
  const e = (el * Math.PI) / 180, z = (az * Math.PI) / 180;
  return [Math.sin(z) * Math.cos(e), -Math.sin(e), Math.cos(z) * Math.cos(e)];
}
/** landing(p, d, y = 0) -> where a ray from p along d meets the plane y (floor patches, framing checks). */
export const landing = (p, d, y = 0) => { const s = (y - p[1]) / d[1]; return [p[0] + d[0] * s, y, p[2] + d[2] * s]; };
