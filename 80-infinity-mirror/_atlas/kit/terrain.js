// terrain.js — JSON-describable height fields, a faceted terrain mesh with exact surface queries,
// and per-face colouring. Promoted from the low-poly pilot (generalised: colours come from a callback).
import * as THREE from "three";
import { heightField, descentPath } from "./heightfield.js";
import { hash01, clamp, smoothstep } from "./time.js";

// heightField / descentPath moved to heightfield.js in pass 6 (pure, Node-safe: planners and scene.config.js can import
// them without THREE); re-exported here unchanged.
export { heightField, descentPath };

/**
 * facetize(geometry, tone | (faceIndex, centroid, normal) => color, { jitter = { lightness: 0, hue: 0 }, seed = 1 })
 *   -> non-indexed geometry with flat normals (UVs removed) and ONE vertex colour per triangle, each
 *   jittered in HSL by a seeded hash. Render with a material that has vertexColors: true (base "#ffffff").
 */
export function facetize(geometry, tone, { jitter = { lightness: 0, hue: 0 }, seed = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute?.("uv");
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const base = typeof tone === "function" ? null : new THREE.Color(tone);
  const cen = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f = 0; f < pos.count / 3; f++) {
    cen.set(0, 0, 0);
    for (let k = 0; k < 3; k++) cen.x += pos.getX(f * 3 + k) / 3, cen.y += pos.getY(f * 3 + k) / 3, cen.z += pos.getZ(f * 3 + k) / 3;
    n.set(nor.getX(f * 3), nor.getY(f * 3), nor.getZ(f * 3));
    const c = (base ?? new THREE.Color(tone(f, cen, n))).clone();
    c.offsetHSL((hash01(f, seed, 11) - 0.5) * 2 * (jitter.hue ?? 0), 0, (hash01(f, seed, 23) - 0.5) * 2 * (jitter.lightness ?? 0));
    for (let k = 0; k < 3; k++) c.toArray(col, (f * 3 + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * terrainMesh({ width = 32, depth = 24, segX = 52, segZ = 40, height(x,z) | field (heightField spec), seed = 3,
 *               jitter = .32, color?: (f, centroid, normal, hNorm) => color, range?: [lo, hi], floor = 0,
 *               faceJitter = { lightness: .045, hue: .012 }, material }) -> Mesh
 *   A displaced grid (inner vertices jittered by `jitter` x cell size, alternating diagonals), faceted.
 *   color() gets hNorm = (centroid.y - lo) / (hi - lo), with [lo, hi] = range ?? [floor, max height];
 *   default colour = a grey ramp. Pass a vertexColors material (default: flat-shaded standard).
 *   userData.heightAt(x, z)  exact height of the faceted surface (barycentric on its triangle)
 *   userData.normalAt(x, z)  face normal (Vector3, y >= 0) under (x, z)
 *   userData.field, userData.bounds = { x0, z0, x1, z1 }
 */
export function terrainMesh(o = {}) {
  const { width = 32, depth = 24, segX = 52, segZ = 40, seed = 3, jitter = 0.32, floor = 0 } = o;
  const h = o.height ?? heightField(o.field ?? { noise: { amp: 1.5, scale: 6, seed } });
  const dx = width / segX, dz = depth / segZ, x0 = -width / 2, z0 = -depth / 2;
  const V = [];
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const edge = i === 0 || j === 0 || i === segX || j === segZ;
      const x = x0 + i * dx + (edge ? 0 : (hash01(i, j, seed, 5) - 0.5) * 2 * jitter * dx);
      const z = z0 + j * dz + (edge ? 0 : (hash01(i, j, seed, 9) - 0.5) * 2 * jitter * dz);
      V.push([x, h(x, z), z]);
    }
  }
  const vid = (i, j) => j * (segX + 1) + i;
  const tris = [];
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
      if ((i + j) % 2) tris.push([a, c, b], [b, c, d]);
      else tris.push([a, c, d], [a, d, b]);
    }
  }
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, f) => t.forEach((v, k) => pos.set(V[v], f * 9 + k * 3)));
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const ys = V.map((v) => v[1]).filter((y) => y > floor);
  const [lo, hi] = o.range ?? [floor, Math.max(...ys)];
  const color = o.color ?? ((f, cen, n, hn) => new THREE.Color().setScalar(0.35 + 0.5 * clamp(hn)));
  geo = facetize(geo, (f, cen, n) => color(f, cen, n, (cen.y - lo) / (hi - lo || 1)), { seed, jitter: o.faceJitter ?? { lightness: 0.045, hue: 0.012 } });
  const m = new THREE.Mesh(geo, o.material ?? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.95 }));
  m.castShadow = m.receiveShadow = true;
  m.name = "terrain";
  const cellTris = (i, j) => { const k = (j * segX + i) * 2; return [tris[k], tris[k + 1]]; };
  const hit = (x, z) => {
    const ci = Math.floor((x - x0) / dx), cj = Math.floor((z - z0) / dz);
    for (let s = 0; s < 9; s++) {
      const i = ci + (s % 3) - 1, j = cj + Math.floor(s / 3) - 1;
      if (i < 0 || j < 0 || i >= segX || j >= segZ) continue;
      for (const t of cellTris(i, j)) {
        const [A, B, Cc] = t.map((v) => V[v]);
        const det = (B[2] - Cc[2]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[2] - Cc[2]);
        const l1 = ((B[2] - Cc[2]) * (x - Cc[0]) + (Cc[0] - B[0]) * (z - Cc[2])) / det;
        const l2 = ((Cc[2] - A[2]) * (x - Cc[0]) + (A[0] - Cc[0]) * (z - Cc[2])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return { A, B, C: Cc, y: l1 * A[1] + l2 * B[1] + l3 * Cc[1] };
      }
    }
    return null;
  };
  m.userData.heightAt = (x, z) => hit(x, z)?.y ?? h(x, z);
  m.userData.normalAt = (x, z) => {
    const r = hit(x, z);
    if (!r) return new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3(...r.A), b = new THREE.Vector3(...r.B), c = new THREE.Vector3(...r.C);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    return n.y < 0 ? n.negate() : n;
  };
  m.userData.field = h;
  m.userData.bounds = { x0, z0, x1: -x0, z1: -z0 };
  return m;
}
