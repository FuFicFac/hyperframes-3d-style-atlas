// edges.js — hidden-line / technical-drawing edge extraction (pure geometry, no rendering).
// Promoted from the blueprint-build pilot (identical code).
//   const { verts, feature, cand } = analyseEdges(geometry, 24);   // welded verts, crease/boundary edges, smooth edges
//   const chains = chainEdges(verts, feature);                      // feature edges chained into polylines
//   const sil = silhouetteSegments(verts, cand, camera, object);    // per frame: smooth edges on the silhouette
// Draw them with lines.screenLines (+ a depth-only fill of the same geometry so back edges are hidden).
import * as THREE from "three";
import { vec3 } from "./pathmath.js";
import { screenLines } from "./lines.js";

const { sub, add, mul, dot, len, nrm } = vec3;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * analyseEdges(geometry, featureDeg = 24) -> { verts, feature, cand }
 *   Welds vertices (1e-4), builds the edge graph. feature = boundary edges + creases sharper than featureDeg;
 *   cand = smooth edges (silhouette candidates, each with its two face normals n[0], n[1]); coplanar
 *   triangulation diagonals are dropped.
 * chainEdges(verts, edges) -> [[x,y,z]...] polylines (open chains first, then loops).
 */
export function analyseEdges(geometry, featureDeg = 24) {
  const pos = geometry.attributes.position, idx = geometry.index;
  const verts = [], vmap = new Map(), weld = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    if (!vmap.has(k)) { vmap.set(k, verts.length); verts.push([x, y, z]); }
    weld[i] = vmap.get(k);
  }
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const edges = new Map();
  for (let t = 0; t < triCount; t++) {
    const ids = [0, 1, 2].map((j) => weld[idx ? idx.getX(t * 3 + j) : t * 3 + j]);
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    const [a, b, c] = ids.map((i) => verts[i]);
    const n = cross(sub(b, a), sub(c, a)), ar = len(n);
    if (ar < 1e-10) continue;
    const nn = mul(n, 1 / ar);
    for (const [p, q] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      if (!edges.has(key)) edges.set(key, { a: Math.min(p, q), b: Math.max(p, q), n: [] });
      edges.get(key).n.push(nn);
    }
  }
  const cosF = Math.cos((featureDeg * Math.PI) / 180);
  const feature = [], cand = [];
  for (const e of edges.values()) {
    if (e.n.length !== 2) { feature.push(e); continue; }
    const c = dot(e.n[0], e.n[1]);
    if (c > 1 - 1e-6) continue;            // coplanar triangulation diagonal
    if (c < cosF) feature.push(e);         // crease
    else cand.push(e);                     // smooth: silhouette candidate
  }
  return { verts, feature, cand };
}

/** Chain feature edges into polylines (open chains first, then loops). */
export function chainEdges(verts, edges) {
  const adj = new Map();
  edges.forEach((e, i) => { for (const v of [e.a, e.b]) { if (!adj.has(v)) adj.set(v, []); adj.get(v).push(i); } });
  const used = new Uint8Array(edges.length), chains = [];
  const walk = (start) => {
    const out = [start];
    let v = start;
    for (;;) {
      const next = (adj.get(v) ?? []).find((i) => !used[i]);
      if (next == null) break;
      used[next] = 1;
      v = edges[next].a === v ? edges[next].b : edges[next].a;
      out.push(v);
      if (v === start) break;
    }
    return out;
  };
  for (const [v, list] of adj) if (list.length !== 2) while (list.some((i) => !used[i])) chains.push(walk(v));
  for (const [v, list] of adj) while (list.some((i) => !used[i])) chains.push(walk(v));
  return chains.filter((c) => c.length > 1).map((c) => c.map((i) => verts[i]));
}

/**
 * silhouetteSegments(verts, cand, camera, object?) -> [[a, b], ...] smooth edges whose two faces point
 * opposite ways relative to the camera (object-local coordinates; pass the Object3D the geometry belongs to).
 * Works for perspective (camera position) and orthographic (view direction) cameras. Call after the camera moves.
 */
export function silhouetteSegments(verts, cand, camera, object = null) {
  const inv = new THREE.Matrix4();
  if (object) { object.updateWorldMatrix(true, false); inv.copy(object.matrixWorld).invert(); }
  const isOrtho = !!camera.isOrthographicCamera;
  const c = isOrtho ? camera.getWorldDirection(new THREE.Vector3()).negate().transformDirection(inv) : camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const cp = [c.x, c.y, c.z], out = [];
  for (const e of cand) {
    const m = mul(add(verts[e.a], verts[e.b]), 0.5);
    const v = isOrtho ? cp : sub(cp, m);
    if ((dot(e.n[0], v) > 0) === (dot(e.n[1], v) > 0)) continue;
    out.push([verts[e.a], verts[e.b]]);
  }
  return out;
}

/**
 * outlineMesh(stage, mesh, { creaseDeg = 30, color = "#1b1d22", width = 2.2, creaseWidth = 1.4, level = 1,
 *   creaseLevel = .8, bias = .01, blending = "normal" }) -> { crease, sil, sync(camera), style(color, width, level) }
 *   Ink outlines for SHADED meshes (exploded-view): static crease lines (edges sharper than creaseDeg, chained) +
 *   silhouettes recomputed by sync(camera) every frame after the camera moves (perspective). Lines are kit
 *   screenLines children of the mesh (straight alpha under normal blending: dark ink on light grounds).
 */
const _edgeCache = new Map();
export function outlineMesh(stage, m, o = {}) {
  const { creaseDeg = 30, color = "#1b1d22", width = 2.2, creaseWidth = 1.4, level = 1, creaseLevel = 0.8, bias = 0.01, blending = "normal" } = o;
  let d = _edgeCache.get(m.geometry.uuid + "|" + creaseDeg);
  if (!d) {
    const { verts, feature, cand } = analyseEdges(m.geometry, creaseDeg);
    const C = [...cand, ...feature.filter((e) => e.n.length === 2)].map((e) => ({ a: e.a, b: e.b, n1: e.n[0], n2: e.n[1], m: [(verts[e.a][0] + verts[e.b][0]) / 2, (verts[e.a][1] + verts[e.b][1]) / 2, (verts[e.a][2] + verts[e.b][2]) / 2] }));
    d = { verts, chains: chainEdges(verts, feature), C };
    _edgeCache.set(m.geometry.uuid + "|" + creaseDeg, d);
  }
  const ink = (polys, q) => screenLines(stage, polys, { blending, bias, order: "parallel", color, ...q });
  const crease = d.chains.length ? ink(d.chains, { width: creaseWidth, level: creaseLevel, name: "crease" }) : null;
  const sil = ink([], { width, level, capacity: Math.max(1, d.C.length), name: "silhouette" });
  if (crease) m.add(crease);
  m.add(sil);
  const sg = sil.geometry, SA = sg.attributes.iA, SB = sg.attributes.iB, SU = sg.attributes.iU, SS = sg.attributes.iS;
  const inv = new THREE.Matrix4(), cam = new THREE.Vector3();
  const mats = [...(crease?.userData.materials ?? []), ...sil.userData.materials];
  const rec = {
    crease, sil,
    sync(camera) {
      m.updateWorldMatrix(true, false);
      inv.copy(m.matrixWorld).invert();
      const ortho = !!camera.isOrthographicCamera;
      if (ortho) cam.copy(camera.getWorldDirection(new THREE.Vector3()).negate()).transformDirection(inv);
      else cam.copy(camera.getWorldPosition(new THREE.Vector3())).applyMatrix4(inv);
      let k = 0;
      for (const e of d.C) {
        const vx = ortho ? cam.x : cam.x - e.m[0], vy = ortho ? cam.y : cam.y - e.m[1], vz = ortho ? cam.z : cam.z - e.m[2];
        const s1 = e.n1[0] * vx + e.n1[1] * vy + e.n1[2] * vz > 0, s2 = e.n2[0] * vx + e.n2[1] * vy + e.n2[2] * vz > 0;
        if (s1 === s2) continue;
        const A = d.verts[e.a], B = d.verts[e.b];
        SA.array.set(A, k * 3); SB.array.set(B, k * 3); SU.array.set([0, 1], k * 2);
        SS.array.set([0, Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2])], k * 2);
        k++;
      }
      sg.instanceCount = k;
      SA.needsUpdate = SB.needsUpdate = SU.needsUpdate = SS.needsUpdate = true;
    },
    style(c, w, l = 1) {
      for (const x of mats) x.uniforms.uColor.value.set(c);
      sil.userData.materials[0].uniforms.uWidth.value = w;
      sil.userData.materials[0].uniforms.uLevel.value = l;
      if (crease) { crease.userData.materials[0].uniforms.uWidth.value = creaseWidth * (w / width); crease.userData.materials[0].uniforms.uLevel.value = creaseLevel * l; }
    },
  };
  m.userData.outline = rec;
  return rec;
}
