// paths.js — 3D polylines and tubes swept along them (wires, neon, pipes, cables, rails, routes).
// Pure point math lives in pathmath.js (re-exported here); this file adds the BufferGeometry builders.
// Promoted from the neon-sign pilot.
// A "stroke" is a list of [x, y] / [x, y, z] points and/or arcs ["a", cx, cy, rx, ry, deg0, deg1]
// (degrees CCW from +x; deg1 < deg0 runs clockwise; arcs are sampled every ~5 degrees).
import * as THREE from "three";
import { TAU } from "./time.js";
import { vec3, expandStroke, filletPath, pathLength, pointAt } from "./pathmath.js";
export * from "./pathmath.js";

const { sub, add, mul, dot, len, nrm } = vec3;

/**
 * sweepGeometry(pts, radius, radial = 12) -> indexed BufferGeometry: a round tube along a 3D polyline,
 * parallel-transport frames (no twist flips), open ends, no UVs, explicit outward normals.
 * Triangles wind OUTWARD (front faces outside; computeVertexNormals agrees with the explicit normals).
 * (The temporary `inward` legacy option was removed once no style used it.)
 */
export function sweepGeometry(pts, radius, radial = 12) {
  const n = pts.length;
  const T = pts.map((p, i) => {
    if (i === 0) return nrm(sub(pts[1], pts[0]));
    if (i === n - 1) return nrm(sub(pts[n - 1], pts[n - 2]));
    return nrm(add(nrm(sub(pts[i + 1], p)), nrm(sub(p, pts[i - 1]))));
  });
  let Nv = Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  Nv = nrm(sub(Nv, mul(T[0], dot(Nv, T[0]))));
  const pos = new Float32Array(n * radial * 3), nor = new Float32Array(n * radial * 3);
  for (let i = 0; i < n; i++) {
    if (i > 0) Nv = nrm(sub(Nv, mul(T[i], dot(Nv, T[i]))));
    const t = T[i];
    const Bv = [t[1] * Nv[2] - t[2] * Nv[1], t[2] * Nv[0] - t[0] * Nv[2], t[0] * Nv[1] - t[1] * Nv[0]];
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * TAU, c = Math.cos(th), s = Math.sin(th);
      const d = [Nv[0] * c + Bv[0] * s, Nv[1] * c + Bv[1] * s, Nv[2] * c + Bv[2] * s];
      const k = (i * radial + j) * 3;
      pos[k] = pts[i][0] + d[0] * radius; pos[k + 1] = pts[i][1] + d[1] * radius; pos[k + 2] = pts[i][2] + d[2] * radius;
      nor[k] = d[0]; nor[k + 1] = d[1]; nor[k + 2] = d[2];
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * tubeAlong(points | stroke, { radius = .02, bend = 0 (corner radius, m), radial = 12, caps = true }) -> BufferGeometry
 * Convenience: expand arcs, fillet corners, sweep, and (caps) close both ends with spheres.
 */
export function tubeAlong(points, { radius = 0.02, bend = 0, radial = 12, caps = true } = {}) {
  let pts = expandStroke(points);
  if (pts.length === 1) pts = [pts[0], add(pts[0], [1e-4, 0, 0])];
  pts = filletPath(pts, bend);
  const g = sweepGeometry(pts, radius, radial);
  if (!caps) return g;
  const parts = [g.toNonIndexed()];
  for (const p of [pts[0], pts[pts.length - 1]]) {
    const s = new THREE.SphereGeometry(radius, radial, Math.max(4, radial >> 1)).toNonIndexed();
    s.deleteAttribute("uv");
    s.translate(...p);
    parts.push(s);
  }
  const total = parts.reduce((n, q) => n + q.attributes.position.count, 0);
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3);
  let o = 0;
  for (const q of parts) {
    P.set(q.attributes.position.array, o * 3);
    N.set(q.attributes.normal.array, o * 3);
    o += q.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  return out;
}

/** rodGeometry(a, b, r, seg = 10) -> cylinder from point a to point b (stand-offs, posts, axles). */
export function rodGeometry(a, b, r, seg = 10) {
  const d = sub(b, a), l = len(d);
  const g = new THREE.CylinderGeometry(r, r, l, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nrm(d)));
  g.applyQuaternion(q);
  g.translate(...mul(add(a, b), 0.5));
  return g;
}

/**
 * roadGeometry(points [[x, z], ...], { width = .8, bend = 1.2, y = 0, curb = .035, step = .12 })
 *   -> { geometry, path, length, at(s) -> { p, dir, yaw } }. A flat ribbon (top + both side walls) along a
 *   filleted, evenly resampled XZ path, raised `curb` above y. Roads, rivers, tracks, conveyor belts, rails,
 *   paths on a map. Use a DoubleSide material; add caps/dashes yourself (see tiny-diorama road()).
 */
export function roadGeometry(points, { width = 0.8, bend = 1.2, y = 0, curb = 0.035, step = 0.12 } = {}) {
  let pts = filletPath(points.map(([x, z]) => [x, y + curb, z]), bend);
  const L0 = pathLength(pts), n = Math.max(2, Math.ceil(L0 / step));
  pts = Array.from({ length: n + 1 }, (_, i) => pointAt(pts, (L0 * i) / n).p);
  const pos = [], nor = [], idx = [], hw = width / 2, left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    left.push([p[0] - tz * hw, p[2] + tx * hw]);
    right.push([p[0] + tz * hw, p[2] - tx * hw]);
  });
  const N = pts.length;
  for (let i = 0; i < N; i++) { pos.push(left[i][0], y + curb, left[i][1], right[i][0], y + curb, right[i][1]); nor.push(0, 1, 0, 0, 1, 0); }
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  for (const [side, sgn] of [[left, 1], [right, -1]]) {
    const base = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const c = pts[i];
      let nx = side[i][0] - c[0], nz = side[i][1] - c[2];
      const l = Math.hypot(nx, nz) || 1;
      pos.push(side[i][0], y + curb, side[i][1], side[i][0], y - 0.01, side[i][1]);
      nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
    }
    for (let i = 0; i < N - 1; i++) {
      const a = base + i * 2;
      if (sgn > 0) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geometry.setIndex(idx);
  const length = pathLength(pts);
  const at = (s) => { const { p, t } = pointAt(pts, Math.min(Math.max(s, 0), length)); return { p, dir: t, yaw: Math.atan2(-t[2], t[0]) }; };
  return { geometry, path: pts, length, at };
}

/**
 * pathFrames(pts, upHint = [0, 1, 0]) -> [{ p, T, N, B }]: a frame per point (T tangent, N = upHint made
 * perpendicular to T, B = T x N). Good for paths that never run parallel to upHint (tracks, rails, gutters). (marble-run)
 */
export function pathFrames(pts, upHint = [0, 1, 0]) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const T = nrm(sub(b, a));
    const N = nrm(sub(upHint, mul(T, dot(upHint, T))));
    const Bv = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    return { p, T, N, B: Bv };
  });
}

/**
 * profileSweep(frames, profile [[b, n], ...] closed CCW, { uScale = 1, caps = true }) -> BufferGeometry: a HARD-EDGED
 * extrusion of a 2D cross-section (b = across, n = up, metres) along framed points (pathFrames), with triangulated
 * end caps. UV u = metres along the path / uScale. Rails, gutters, channels, trim, mouldings, I-beams. (marble-run)
 */
export function profileSweep(frames, profile, { uScale = 1, caps = true } = {}) {
  const pos = [], uv = [], idx = [];
  const S = [0];
  for (let i = 1; i < frames.length; i++) S.push(S[i - 1] + len(sub(frames[i].p, frames[i - 1].p)));
  const at = (f, q) => add(f.p, add(mul(f.B, q[0]), mul(f.N, q[1])));
  let per = 0;
  for (let e = 0; e < profile.length; e++) {
    const q0 = profile[e], q1 = profile[(e + 1) % profile.length];
    const el = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
    const base = pos.length / 3;
    frames.forEach((f, i) => {
      for (const [q, vv] of [[q0, per], [q1, per + el]]) { pos.push(...at(f, q)); uv.push(S[i] / uScale, vv * 3); }
    });
    for (let i = 0; i < frames.length - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    per += el;
  }
  if (caps) {
    const tris = THREE.ShapeUtils.triangulateShape(profile.map((q) => new THREE.Vector2(q[0], q[1])), []);
    for (const [fi, flip] of [[0, true], [frames.length - 1, false]]) {
      const base = pos.length / 3;
      for (const q of profile) { pos.push(...at(frames[fi], q)); uv.push(q[0] * 2, q[1] * 2); }
      for (const t of tris) idx.push(...(flip ? [base + t[0], base + t[1], base + t[2]] : [base + t[0], base + t[2], base + t[1]]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * liveTube(n, radial, radius, material) -> Mesh whose centreline (n points) is rewritten by userData.set(points):
 *   threads, cables, ropes and tentacles that MOVE (geometry rebuilt in place from the points every call: pure if the
 *   points are). Parallel-transport frames, explicit normals, outward winding. frustumCulled off. (felt-stitch)
 */
export function liveTube(n, radial, radius, material) {
  const pos = new Float32Array(n * radial * 3), nor = new Float32Array(n * radial * 3), idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false;
  m.userData.set = (pts) => {
    let Nv = null;
    for (let i = 0; i < n; i++) {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
      let t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
      if (!Nv) Nv = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const d = Nv[0] * t[0] + Nv[1] * t[1] + Nv[2] * t[2];
      Nv = [Nv[0] - t[0] * d, Nv[1] - t[1] * d, Nv[2] - t[2] * d];
      const nl = Math.hypot(...Nv) || 1; Nv = Nv.map((v) => v / nl);
      const Bv = [t[1] * Nv[2] - t[2] * Nv[1], t[2] * Nv[0] - t[0] * Nv[2], t[0] * Nv[1] - t[1] * Nv[0]];
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * TAU, cs = Math.cos(th), sn = Math.sin(th);
        const dx = Nv[0] * cs + Bv[0] * sn, dy = Nv[1] * cs + Bv[1] * sn, dz = Nv[2] * cs + Bv[2] * sn;
        const k = (i * radial + j) * 3;
        pos[k] = pts[i][0] + dx * radius; pos[k + 1] = pts[i][1] + dy * radius; pos[k + 2] = pts[i][2] + dz * radius;
        nor[k] = dx; nor[k + 1] = dy; nor[k + 2] = dz;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  };
  return m;
}
