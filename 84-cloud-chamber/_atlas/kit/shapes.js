// shapes.js — 2D outlines (THREE.Shape, metres) and thin "card" solids built from them: die-cut paper,
// signage, stickers, badges, flat cut-out characters, tokens. Promoted from the paper-pop-up pilot.
// Convention: rect/roundRect/bubble are BOTTOM-CENTRE anchored at (x, y) so a stand-up piece built
// from them hinges at y = 0; circle/ellipse/scallop/star are centred at (x, y).
import * as THREE from "three";
import { lerp } from "./time.js";

export const shapes = {
  /** Rectangle, bottom-centre at (x, y). */
  rect(w, h, { x = 0, y = 0 } = {}) {
    return shapes.poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + h], [x - w / 2, y + h]]);
  },
  /** Rounded rectangle, bottom-centre at (x, y). */
  roundRect(w, h, r, { x = 0, y = 0 } = {}) {
    r = Math.min(r, w / 2, h / 2);
    const s = new THREE.Shape(), l = x - w / 2, b = y, R = x + w / 2, T = y + h;
    s.moveTo(l + r, b);
    s.lineTo(R - r, b); s.quadraticCurveTo(R, b, R, b + r);
    s.lineTo(R, T - r); s.quadraticCurveTo(R, T, R - r, T);
    s.lineTo(l + r, T); s.quadraticCurveTo(l, T, l, T - r);
    s.lineTo(l, b + r); s.quadraticCurveTo(l, b, l + r, b);
    return s;
  },
  /** Circle centred at (x, y). */
  circle(r, { x = 0, y = 0 } = {}) {
    const s = new THREE.Shape();
    s.absarc(x, y, r, 0, Math.PI * 2, false);
    return s;
  },
  /** Ellipse centred at (x, y). */
  ellipse(rx, ry, { x = 0, y = 0, rot = 0 } = {}) {
    const s = new THREE.Shape();
    s.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, rot);
    return s;
  },
  /** Polygon from [[x,y], ...] (any winding). */
  poly(pts) {
    const s = new THREE.Shape();
    pts.forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py)));
    s.closePath();
    return s;
  },
  /** Scalloped disc (rosette / badge edge): n bumps, depth = fraction of r. Centred at (x, y). */
  scallop(r, n = 18, depth = 0.08, { x = 0, y = 0, steps = 360 } = {}) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r * (1 - depth * (1 - Math.abs(Math.cos((n * a) / 2))));
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    return shapes.poly(pts);
  },
  /** Star / sparkle: n points. Centred at (x, y). */
  star(rOuter, rInner, n = 4, { x = 0, y = 0, rot = Math.PI / 2 } = {}) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? rInner : rOuter;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    return shapes.poly(pts);
  },
  /** Speech bubble: rounded rect (bottom-centre at x, y + tail.len) with a tail ending at (x + tail.x, y). */
  bubble(w, h, r, { x = 0, y = 0, tail = { x: -0.25, w: 0.28, len: 0.3, at: -0.15 } } = {}) {
    const b = y + tail.len, l = x - w / 2, R = x + w / 2, T = b + h;
    r = Math.min(r, w / 2, h / 2);
    const t0 = x + tail.at - tail.w / 2, t1 = x + tail.at + tail.w / 2;
    const s = new THREE.Shape();
    s.moveTo(l + r, b);
    s.lineTo(t0, b); s.lineTo(x + tail.x, y); s.lineTo(t1, b);
    s.lineTo(R - r, b); s.quadraticCurveTo(R, b, R, b + r);
    s.lineTo(R, T - r); s.quadraticCurveTo(R, T, R - r, T);
    s.lineTo(l + r, T); s.quadraticCurveTo(l, T, l, T - r);
    s.lineTo(l, b + r); s.quadraticCurveTo(l, b, l + r, b);
    return s;
  },
  /**
   * Add holes (any winding) to a shape and return it. A hole may touch the outline (measured: an arch whose
   * bottom lies on the outer edge cuts correctly), but a hole that CROSSES the outline makes three's
   * triangulator silently fill the whole shape (measured: area unchanged = renders solid). That case is
   * detected and warned; fix it by notching the outline instead (one polygon that walks around the opening).
   */
  withHoles(shape, holes) {
    const outer = shape.getPoints(24);
    for (const h of holes) {
      const path = h instanceof THREE.Path ? h : new THREE.Path(h.getPoints());
      const bad = path.getPoints(24).find((p) => !insideOrOn(p, outer));
      if (bad && typeof console !== "undefined") console.warn(`[atlas] shapes.withHoles: hole point (${bad.x.toFixed(3)}, ${bad.y.toFixed(3)}) lies outside the outline — three will render the shape SOLID; notch the outline instead`);
      shape.holes.push(path);
    }
    return shape;
  },
};
/** point inside polygon (ray cast) or within 1e-6 of its boundary. */
function insideOrOn(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    if (Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy) < 1e-6) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export const { rect, roundRect, circle, ellipse, poly, scallop, star, bubble, withHoles } = shapes;

/**
 * cardGeometry(shape, thickness, curveSegments = 24, normalizedUV = false) -> { geo, bbox }
 *   Extrudes `shape` by `thickness` (centred on z = 0, front face +Z) and regroups the triangles into
 *   three material groups: 0 = front cap, 1 = back cap, 2 = cut edge. Front UVs are normalised to the
 *   shape bbox when normalizedUV (for a printed canvas covering the face) or in metres otherwise (for a
 *   tiled texture). Back UVs are mirrored in x so a print on the back reads correctly from behind.
 *   bbox = { minX, maxX, minY, maxY, w, h } in metres.
 */
export function cardGeometry(shape, t, curveSegments = 24, normalized = false) {
  const src = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments });
  src.translate(0, 0, -t / 2);
  const P = src.attributes.position.array, N = src.attributes.normal.array, U = src.attributes.uv.array;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    minX = Math.min(minX, P[i]); maxX = Math.max(maxX, P[i]);
    minY = Math.min(minY, P[i + 1]); maxY = Math.max(maxY, P[i + 1]);
  }
  const bw = Math.max(1e-6, maxX - minX), bh = Math.max(1e-6, maxY - minY);
  const tris = [[], [], []];
  for (let k = 0; k < P.length / 9; k++) {
    const nz = (N[k * 9 + 2] + N[k * 9 + 5] + N[k * 9 + 8]) / 3;
    tris[nz > 0.9 ? 0 : nz < -0.9 ? 1 : 2].push(k);
  }
  const pos = [], nor = [], uv = [], geo = new THREE.BufferGeometry();
  let start = 0;
  tris.forEach((list, g) => {
    for (const k of list) {
      for (let v = 0; v < 3; v++) {
        const i = k * 3 + v, x = P[i * 3], y = P[i * 3 + 1];
        pos.push(x, y, P[i * 3 + 2]);
        nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        if (g === 0) uv.push(normalized ? (x - minX) / bw : x, normalized ? (y - minY) / bh : y);
        else if (g === 1) uv.push(normalized ? (maxX - x) / bw : -x, normalized ? (y - minY) / bh : y);
        else uv.push(U[i * 2], U[i * 2 + 1]);
      }
    }
    geo.addGroup(start, list.length * 3, g);
    start += list.length * 3;
  });
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  src.dispose();
  return { geo, bbox: { minX, maxX, minY, maxY, w: bw, h: bh } };
}

/**
 * cardMesh(shape, { thickness = .012, front, back = front, edge = front, curveSegments = 24, normalizedUV = false })
 *   -> Mesh with materials [front, back, edge] (see cardGeometry). castShadow/receiveShadow on.
 *   userData: { thickness, bbox }.
 */
export function cardMesh(shape, { thickness = 0.012, front, back, edge, curveSegments = 24, normalizedUV = false } = {}) {
  const { geo, bbox } = cardGeometry(shape, thickness, curveSegments, normalizedUV);
  const f = front ?? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const m = new THREE.Mesh(geo, [f, back ?? f, edge ?? f]);
  m.castShadow = m.receiveShadow = true;
  m.userData.thickness = thickness;
  m.userData.bbox = bbox;
  return m;
}

/**
 * hingeGroup(content, { axis = "x", closed = Math.PI / 2, open = 0 }) -> Group (the pivot)
 *   Rotates `content` about the pivot's local axis through its origin. Build content so the hinge line
 *   passes through the origin (e.g. a bottom-centre shape for a pop-up: closed = PI/2 lies flat forward).
 *   userData.setOpen(u): angle = lerp(closed, open, u) (u > 1 overshoots; feed it motion.hinge(t, ...)).
 *   userData.setAngle(a) sets the raw angle.
 */
export function hingeGroup(content, { axis = "x", closed = Math.PI / 2, open = 0 } = {}) {
  const pivot = new THREE.Group();
  pivot.add(content);
  pivot.userData.setAngle = (a) => { pivot.rotation[axis] = a; };
  pivot.userData.setOpen = (u) => { pivot.rotation[axis] = lerp(closed, open, u); };
  pivot.userData.setOpen(0);
  return pivot;
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 4, origami)
/**
 * slabGeometry(poly [[x,z]...] CONVEX, thickness, uvOf([x,z]) -> [u,v], colorOf([x,z]) -> k = () => 1) -> BufferGeometry
 *   A flat two-sided facet lying in XZ (front faces +Y): groups 0 front / 1 back / 2 edge (give it [front, back, edge]
 *   materials), per-vertex grey colour k (shading gradients, fake AO), explicit normals. Paper facets, tiles, cards.
 */
export function slabGeometry(poly, th, uvOf, colorOf = () => 1) {
  const P = [], N = [], UV = [], C = [], idx = [];
  const groups = [];
  const h = th / 2;
  let base = 0;
  const push = (x, y, z, n, uv, k) => { P.push(x, y, z); N.push(...n); UV.push(...uv); C.push(k, k, k); };
  // orientation: make the fan counter-clockwise seen from +y
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0);
  const ring = area < 0 ? poly : poly.slice().reverse(); // in XZ with y up, CCW-from-above = negative xz-area
  const n = ring.length;
  // front
  ring.forEach((p) => push(p[0], h, p[1], [0, 1, 0], uvOf(p), colorOf(p)));
  for (let i = 1; i < n - 1; i++) idx.push(base, base + i, base + i + 1);
  groups.push([0, (n - 2) * 3, 0]);
  base += n;
  // back
  ring.forEach((p) => push(p[0], -h, p[1], [0, -1, 0], uvOf(p), colorOf(p)));
  const s1 = idx.length;
  for (let i = 1; i < n - 1; i++) idx.push(base, base + i + 1, base + i);
  groups.push([s1, (n - 2) * 3, 1]);
  base += n;
  // edges
  const s2 = idx.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    const nn = [-ez / l, 0, ex / l]; // outward for this winding
    push(a[0], h, a[1], nn, uvOf(a), colorOf(a)); push(b[0], h, b[1], nn, uvOf(b), colorOf(b));
    push(b[0], -h, b[1], nn, uvOf(b), colorOf(b)); push(a[0], -h, a[1], nn, uvOf(a), colorOf(a));
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    base += 4;
  }
  groups.push([s2, idx.length - s2, 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(idx);
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  g.computeBoundingSphere();
  return g;
}

