// optics.js — pure geometric optics (THREE-free, Node-safe): rays through convex glass pieces (planes, spheres,
// cylinders), refraction/reflection with per-wavelength IOR (dispersion), spectrum fans, path clipping. Promoted from
// the glass-light pilot (identical code). Pair with a render-side beam mesh; trace once per frame from t.
// styles/glass-light/optics.js — closed-form ray optics for the Glass & Light style. PURE: no THREE, no window,
// no DOM (Node-safe, so scene.config.js and render-sfx can import it). Every function is a pure function of its
// inputs: style.js calls trace() each frame with the pieces' CURRENT transforms, so beams re-route live and seek
// in any order.
//
// Shapes are CONVEX sets in a piece's local frame (metres, Y-up), described as the intersection of primitives:
//   { planes: [{ n:[x,y,z], d }],          inside where n·p <= d   (n unit, outward)
//     spheres: [{ c:[x,y,z], r }],         inside where |p - c| <= r
//     cylinders: [{ c, a:[x,y,z], r }] }   inside where the distance to the axis line (c, a) <= r
// A piece = { id, shape, pos:[x,y,z], rot:[x,y,z] (Euler XYZ, same as three.js), glass:{ A, B, boost } }.
// Snell's law at every surface, total internal reflection inside, per-wavelength IOR (Cauchy n = A + B/λ²).

// ------------------------------------------------------------------ small vector maths -----------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vec = { add, sub, mul, dot, cross, len, nrm };

/** rotMat([rx, ry, rz]) -> 3x3 row-major matrix for Euler order XYZ (three.js: M = Rx · Ry · Rz). */
export function rotMat([x = 0, y = 0, z = 0] = []) {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}
const mv = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];

// ------------------------------------------------------------------ glass + light ---------------------
/** Glass types (Cauchy A, B in µm²). boost exaggerates dispersion about 550 nm (1 = physical). */
export const GLASS = {
  crown: { A: 1.5046, B: 0.0042 },
  flint: { A: 1.6200, B: 0.0100 },
  dense: { A: 1.7200, B: 0.0130 },
};
/** ior(glass, nm) -> refractive index. glass = { A, B, boost = 1 }; boost scales only the dispersion. */
export function ior(g, nm = 550) {
  const l = nm / 1000, l0 = 0.55, boost = g.boost ?? 1;
  return g.A + g.B / (l0 * l0) + g.B * boost * (1 / (l * l) - 1 / (l0 * l0));
}
/** Spectral bands used for dispersion fans (nm). */
export const BANDS = [415, 450, 485, 520, 560, 595, 640];
/** nmToRGB(nm) -> sRGB [r,g,b] 0..1 (piecewise visible-spectrum approximation, saturated, edge-falloff). */
export function nmToRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  const f = nm < 420 ? 0.35 + 0.65 * (nm - 380) / 40 : nm > 700 ? 0.35 + 0.65 * (780 - nm) / 80 : 1;
  return [r, g, b].map((c) => Math.pow(Math.max(0, c * f), 0.8));
}

// ------------------------------------------------------------------ shapes (local frames) --------------
/** extrudedPoly(pts2D [[x,z]...] convex CCW-from-above or CW — either works, y0, y1) -> shape (vertical prism). */
export function extrudedPoly(pts, y0 = 0, y1 = 1) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x / n; cz += z / n; }
  const planes = [{ n: [0, 1, 0], d: y1 }, { n: [0, -1, 0], d: -y0 }];
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    let nx = bz - az, nz = -(bx - ax);
    const l = Math.hypot(nx, nz);
    nx /= l; nz /= l;
    if (nx * (cx - ax) + nz * (cz - az) > 0) { nx = -nx; nz = -nz; } // outward
    planes.push({ n: [nx, 0, nz], d: nx * ax + nz * az });
  }
  return { planes, spheres: [], cylinders: [] };
}
/** prismShape({ side = .8, height = .7, apex = 60° }) -> isoceles triangular prism standing on y = 0, apex toward -x. */
export function prismShape({ side = 0.8, height = 0.7, apex = Math.PI / 3 } = {}) {
  // isoceles triangle: apex at -x, base (length `side`) parallel to z at +x; legs meet at `apex` angle
  const h = (side / 2) / Math.tan(apex / 2);
  const c = h / 3; // centroid-ish offset so the piece rotates about its middle
  return extrudedPoly([[-h + c, 0], [c, side / 2], [c, -side / 2]], 0, height);
}
/** boxShape({ w, h, d }) -> box on y = 0. */
export const boxShape = ({ w = 0.5, h = 0.5, d = 0.5 } = {}) => extrudedPoly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0, h);
/** gemShape({ w, h, d, edge, corner }) -> faceted block on y = 0: a box with chamfered vertical edges and cut corners. */
export function gemShape({ w = 1.3, h = 1.1, d = 1.3, edge = 0.28, corner = 0.32 } = {}) {
  const hx = w / 2, hz = d / 2, cy = h / 2;
  const planes = [
    { n: [1, 0, 0], d: hx }, { n: [-1, 0, 0], d: hx }, { n: [0, 0, 1], d: hz }, { n: [0, 0, -1], d: hz },
    { n: [0, 1, 0], d: h }, { n: [0, -1, 0], d: 0 },
  ];
  const s2 = Math.SQRT1_2, s3 = 1 / Math.sqrt(3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    planes.push({ n: [sx * s2, 0, sz * s2], d: (hx + hz - edge) * s2 });
    for (const sy of [-1, 1]) {
      // corner cut, measured from the box corner; offset along y around the block centre
      const nn = [sx * s3, sy * s3, sz * s3];
      planes.push({ n: nn, d: (hx + cy + hz - corner) * s3 + sy * s3 * cy });
    }
  }
  return { planes, spheres: [], cylinders: [] };
}
/** sphereShape({ r }) -> ball whose bottom touches y = 0. */
export const sphereShape = ({ r = 0.3 } = {}) => ({ planes: [], spheres: [{ c: [0, r, 0], r }], cylinders: [] });
/**
 * lensShape({ radius, R, thick }) -> biconvex lens, optical axis = local +X, centred at the origin (mount it at beam height).
 *   radius = rim radius, R = surface curvature radius (both faces), thick = centre thickness. Focal length ≈ R / (2(n-1)).
 */
export function lensShape({ radius = 0.42, R = 0.9, thick } = {}) {
  const sag = R - Math.sqrt(Math.max(0, R * R - radius * radius));
  const t = thick ?? 2 * sag + 0.02;
  const off = R - t / 2; // sphere centres at ±off on the axis
  return {
    planes: [],
    spheres: [{ c: [off, 0, 0], r: R }, { c: [-off, 0, 0], r: R }],
    cylinders: [{ c: [0, 0, 0], a: [1, 0, 0], r: radius }],
    lens: { radius, R, thick: t, off },
  };
}
/** rodShape({ r, length }) -> cylinder along local X, centred at the origin. */
export function rodShape({ r = 0.08, length = 1.2 } = {}) {
  return { planes: [{ n: [1, 0, 0], d: length / 2 }, { n: [-1, 0, 0], d: length / 2 }], spheres: [], cylinders: [{ c: [0, 0, 0], a: [1, 0, 0], r }] };
}

/** worldShape(piece) -> the piece's shape in world space (pure). */
export function worldShape(piece) {
  const M = rotMat(piece.rot), P = piece.pos ?? [0, 0, 0], S = piece.shape;
  return {
    planes: S.planes.map((p) => { const n = mv(M, p.n); return { n, d: p.d + dot(n, P) }; }),
    spheres: S.spheres.map((s) => ({ c: add(mv(M, s.c), P), r: s.r })),
    cylinders: S.cylinders.map((c) => ({ c: add(mv(M, c.c), P), a: nrm(mv(M, c.a)), r: c.r })),
  };
}

// ------------------------------------------------------------------ intersection ----------------------
const EPS = 1e-6;
/** span(o, d, W) -> { t0, n0, t1, n1 } | null: the interval where the line o + t·d is inside the convex world shape W. */
export function span(o, d, W) {
  let t0 = -Infinity, t1 = Infinity, n0 = null, n1 = null;
  for (const p of W.planes) {
    const den = dot(p.n, d), num = p.d - dot(p.n, o);
    if (Math.abs(den) < EPS) { if (num < 0) return null; continue; }
    const t = num / den;
    if (den < 0) { if (t > t0) { t0 = t; n0 = p.n; } }
    else if (t < t1) { t1 = t; n1 = p.n; }
  }
  for (const s of W.spheres) {
    const oc = sub(o, s.c), b = dot(oc, d), c = dot(oc, oc) - s.r * s.r, disc = b * b - c;
    if (disc < 0) return null;
    const q = Math.sqrt(disc), ta = -b - q, tb = -b + q;
    if (ta > t0) { t0 = ta; n0 = nrm(sub(add(o, mul(d, ta)), s.c)); }
    if (tb < t1) { t1 = tb; n1 = nrm(sub(add(o, mul(d, tb)), s.c)); }
  }
  for (const cy of W.cylinders) {
    const oc = sub(o, cy.c);
    const dp = sub(d, mul(cy.a, dot(d, cy.a))), op = sub(oc, mul(cy.a, dot(oc, cy.a)));
    const A = dot(dp, dp), B = dot(op, dp), C = dot(op, op) - cy.r * cy.r;
    if (A < EPS) { if (C > 0) return null; continue; }
    const disc = B * B - A * C;
    if (disc < 0) return null;
    const q = Math.sqrt(disc), ta = (-B - q) / A, tb = (-B + q) / A;
    const radial = (t) => { const p = sub(add(o, mul(d, t)), cy.c); return nrm(sub(p, mul(cy.a, dot(p, cy.a)))); };
    if (ta > t0) { t0 = ta; n0 = radial(ta); }
    if (tb < t1) { t1 = tb; n1 = radial(tb); }
  }
  if (!(t0 < t1)) return null;
  return { t0, n0, t1, n1 };
}

/** refract(I, N, eta) -> T | null (TIR). N must face against I (dot(N, I) < 0). eta = n1 / n2. */
export function refract(I, N, eta) {
  const ci = -dot(N, I), k = 1 - eta * eta * (1 - ci * ci);
  if (k < 0) return null;
  return nrm(add(mul(I, eta), mul(N, eta * ci - Math.sqrt(k))));
}
export const reflect = (I, N) => sub(I, mul(N, 2 * dot(I, N)));

/**
 * trace({ o, d }, pieces, { nm = 550, maxLen = 14, floorY = 0, maxSegs = 16, stop }) -> { segments, events, end, length }
 *   Follows one ray through the pieces: refracts on entry/exit (Snell, per-wavelength ior), reflects on TIR inside
 *   (≤ 4 bounces), ends on the floor plane (y = floorY, when going down), at maxLen, or at `stop`.
 *   segments: [{ a, b, s0, s1, inside: pieceId|null }]   (s = distance along the path from the source)
 *   events:   [{ kind: "enter"|"exit"|"tir"|"floor"|"stop", p, n, piece, s }]
 *   end:      { p, d, kind: "floor"|"far"|"stop", s }
 *   stop = { piece: id, point:[x,y,z] }: when the ray is INSIDE that piece, end at the point of the inside segment
 *          closest to `point` (used to make several beams meet in one block).
 *   Each piece may carry `ior(nm)` (a function) or `glass: { A, B, boost }`.
 */
export function trace(ray, pieces, o = {}) {
  const { nm = 550, maxLen = 14, floorY = 0, maxSegs = 16, stop = null } = o;
  const W = pieces.map((p) => ({ p, W: worldShape(p), n: p.ior ? p.ior(nm) : ior(p.glass ?? GLASS.crown, nm) }));
  const segments = [], events = [];
  let org = ray.o.slice(), dir = nrm(ray.d), s = 0, inside = null;
  // does the ray START inside a piece?
  for (const w of W) { const sp = span(org, dir, w.W); if (sp && sp.t0 < 0 && sp.t1 > 0) { inside = w; break; } }
  const push = (a, b, ins) => { const L = len(sub(b, a)); segments.push({ a, b, s0: s, s1: s + L, inside: ins }); s += L; };
  for (let guard = 0; guard < maxSegs && s < maxLen; guard++) {
    if (inside) {
      const sp = span(org, dir, inside.W);
      if (!sp || sp.t1 <= EPS) { inside = null; continue; }
      const tOut = sp.t1, pOut = add(org, mul(dir, tOut));
      if (stop && stop.piece === inside.p.id) {
        const tc = Math.max(0, Math.min(tOut, dot(sub(stop.point, org), dir)));
        const pc = add(org, mul(dir, tc));
        push(org, pc, inside.p.id);
        events.push({ kind: "stop", p: pc, n: null, piece: inside.p.id, s });
        return { segments, events, end: { p: pc, d: dir, kind: "stop", s }, length: s };
      }
      push(org, pOut, inside.p.id);
      const T = refract(dir, mul(sp.n1, -1), inside.n);
      if (T) {
        events.push({ kind: "exit", p: pOut, n: sp.n1, piece: inside.p.id, s });
        org = add(pOut, mul(T, 1e-4)); dir = T; inside = null;
      } else {
        events.push({ kind: "tir", p: pOut, n: sp.n1, piece: inside.p.id, s });
        dir = nrm(reflect(dir, sp.n1)); org = add(pOut, mul(dir, 1e-4));
      }
      continue;
    }
    // in air: nearest entry
    let best = null;
    for (const w of W) {
      const sp = span(org, dir, w.W);
      if (sp && sp.t0 > EPS && (!best || sp.t0 < best.t)) best = { t: sp.t0, n: sp.n0, w };
    }
    const tFloor = dir[1] < -EPS ? (floorY - org[1]) / dir[1] : Infinity;
    const tFar = maxLen - s;
    if (!best || best.t > Math.min(tFloor, tFar)) {
      const t = Math.min(tFloor, tFar), p = add(org, mul(dir, t));
      push(org, p, null);
      const kind = tFloor <= tFar ? "floor" : "far";
      if (kind === "floor") events.push({ kind: "floor", p, n: [0, 1, 0], piece: null, s });
      return { segments, events, end: { p, d: dir, kind, s }, length: s };
    }
    const pIn = add(org, mul(dir, best.t));
    push(org, pIn, null);
    events.push({ kind: "enter", p: pIn, n: best.n, piece: best.w.p.id, s });
    const T = refract(dir, best.n, 1 / best.w.n) ?? dir;
    org = add(pIn, mul(T, 1e-4)); dir = T; inside = best.w;
  }
  const last = segments[segments.length - 1];
  return { segments, events, end: { p: last ? last.b : org, d: dir, kind: "far", s }, length: s };
}

/**
 * spectrum(ray, pieces, { bands = BANDS, ...traceOpts }) -> [{ nm, rgb, path }]: one trace per wavelength band.
 * splitAt(path, s) -> segments clipped to [s, ∞) (draw the white part up to the prism, colours after it).
 */
export function spectrum(ray, pieces, o = {}) {
  return (o.bands ?? BANDS).map((nm) => ({ nm, rgb: nmToRGB(nm), path: trace(ray, pieces, { ...o, nm }) }));
}
export function clipPath(segments, sA = 0, sB = Infinity) {
  const out = [];
  for (const g of segments) {
    if (g.s1 <= sA || g.s0 >= sB) continue;
    const L = g.s1 - g.s0 || 1;
    const u0 = Math.max(0, (sA - g.s0) / L), u1 = Math.min(1, (sB - g.s0) / L);
    const at = (u) => add(g.a, mul(sub(g.b, g.a), u));
    out.push({ ...g, a: at(u0), b: at(u1), s0: g.s0 + u0 * L, s1: g.s0 + u1 * L });
  }
  return out;
}
/** firstEvent(path, kind, piece) -> event | null */
export const firstEvent = (path, kind, piece) => path.events.find((e) => e.kind === kind && (piece == null || e.piece === piece)) ?? null;

// ------------------------------------------------------------------ mesh faces from planes ------------
/**
 * polyFaces(planes, size = 20) -> [{ n, pts:[[x,y,z]...] }]: the faces of the convex polyhedron ∩{n·p <= d}
 * (Sutherland–Hodgman clipping of a big square on each plane). Vertices are CCW seen from outside.
 */
export function polyFaces(planes, size = 20) {
  const faces = [];
  planes.forEach((P, i) => {
    const n = P.n, c = mul(n, P.d);
    const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = nrm(cross(ref, n)), v = cross(n, u);
    let poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, add(mul(u, a * size), mul(v, b * size))));
    planes.forEach((Q, j) => {
      if (j === i || poly.length === 0) return;
      const out = [], f = (p) => Q.d - dot(Q.n, p);
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length], fa = f(A), fb = f(B);
        if (fa >= -1e-9) out.push(A);
        if ((fa >= -1e-9) !== (fb >= -1e-9)) out.push(add(A, mul(sub(B, A), fa / (fa - fb))));
      }
      poly = out;
    });
    // drop near-duplicate points
    const clean = poly.filter((p, k) => len(sub(p, poly[(k + 1) % poly.length])) > 1e-6);
    if (clean.length >= 3) {
      // ensure CCW about n
      const e = cross(sub(clean[1], clean[0]), sub(clean[2], clean[0]));
      faces.push({ n, pts: dot(e, n) < 0 ? clean.reverse() : clean });
    }
  });
  return faces;
}
