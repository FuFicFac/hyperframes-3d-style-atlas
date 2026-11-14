// builders.js — common set pieces: ground, cyclorama backdrop, floating tile.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { blobTexture } from "./textures.js";
export { RoundedBoxGeometry };

/**
 * createGround({ size = 40, material, color = "#d9d6cf", roughness = 0.9, shadowOnly = false,
 *                shadowOpacity = 0.25 }) -> Mesh (XZ plane at y=0, receives shadows)
 * shadowOnly: invisible plane that only shows shadows (ShadowMaterial) — for floating-on-background looks.
 */
export function createGround(o = {}) {
  const { size = 40, material, color = "#d9d6cf", roughness = 0.9, shadowOnly = false, shadowOpacity = 0.25 } = o;
  const mat = material ?? (shadowOnly ? new THREE.ShadowMaterial({ opacity: shadowOpacity }) : new THREE.MeshStandardMaterial({ color, roughness }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  m.name = "ground";
  return m;
}

/**
 * createCyclorama({ width = 40, depth = 20, height = 14, radius = 5, segments = 24, material, color })
 * Seamless studio sweep: floor (z from +depth/2 toward the back) curving up into a back wall at
 * z = -depth/2. Centered on x; floor at y = 0.
 */
export function createCyclorama(o = {}) {
  const { width = 40, depth = 20, height = 14, radius = 5, segments = 24, material, color = "#e8e4dc" } = o;
  // profile in (z, y): front edge -> curve -> top of wall
  const pts = [];
  const zBack = -depth / 2, zFront = depth / 2;
  pts.push([zFront, 0]);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    pts.push([zBack + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]);
  }
  pts.push([zBack, height]);
  const xs = [-width / 2, width / 2];
  const pos = [], uv = [], idx = [];
  let len = 0;
  const lens = pts.map((p, i) => (i ? (len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])) : 0));
  pts.forEach((p, i) => {
    xs.forEach((x, j) => {
      pos.push(x, p[1], p[0]);
      uv.push(j, lens[i] / len);
    });
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.receiveShadow = true;
  m.name = "cyclorama";
  return m;
}

/**
 * createTile({ w = 1.6, h = 1, d = 0.12, radius = 0.06, material, color = "#ffffff" }) -> Mesh
 * Rounded slab (card / UI tile) facing +Z. Pair with floatAt() for a gentle hover.
 */
export function createTile(o = {}) {
  const { w = 1.6, h = 1, d = 0.12, radius = 0.06, material, color = "#ffffff" } = o;
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  m.castShadow = m.receiveShadow = true;
  m.name = "tile";
  return m;
}

/** floatAt(t, { amp = 0.08, speed = 1, phase = 0 }) -> { y, rx, rz } deterministic hover offsets. */
export function floatAt(t, { amp = 0.08, speed = 1, phase = 0 } = {}) {
  return {
    y: Math.sin(t * speed * 1.6 + phase) * amp,
    rx: Math.sin(t * speed * 1.1 + phase * 1.7) * amp * 0.5,
    rz: Math.cos(t * speed * 0.9 + phase * 0.6) * amp * 0.4,
  };
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 2)
let _blob = null;
/**
 * contactShadow({ w = 1, d = w, opacity = .35, color = "#000000", y = .006, texture }) -> Mesh: a soft
 * radial dark blob lying flat (fake ambient occlusion / contact darkening under props). MeshBasic,
 * transparent, depthWrite off, polygonOffset -2/-2, renderOrder 1. Shared blob texture (kit textures.blobTexture).
 * (tiny-diorama) Tip: size it ~1.3x the footprint; it doesn't receive or cast real shadows.
 */
export function contactShadow(o = {}) {
  const { w = 1, opacity = 0.35, color = "#000000", y = 0.006 } = o;
  const d = o.d ?? w;
  const map = o.texture ?? (_blob ??= blobTexture());
  const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.name = "contactShadow";
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 1;
  m.name = "contact";
  return m;
}
