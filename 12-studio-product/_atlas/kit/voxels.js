// voxels.js — instanced-cube ("voxel") helpers. Promoted from the voxel pilot (identical code).
//  * occupancyMasks: per-cube 26-neighbour occupancy as two 13-bit float words (exact in a float attribute)
//  * voxelMaterial: patches a standard/physical material so each cube face darkens toward occupied neighbours
//    (smooth crevice AO, no ray tracing). Geometry: a unit (bevelled) cube scaled by `fill`; instance attribute
//    `voxMask` (vec2) = occupancyMasks output; recompute masks whenever cubes move (cubes off-grid get none).
//  * cubeSteps / waveKey: closed-form staircase motion and diagonal sweep order.
//  * flightPose: closed-form scatter -> assemble pose for one cube (pure version of the voxel style's flight).
import { clamp, lerp, ease, hash01, smoothstep } from "./time.js";

// Neighbour (dx,dy,dz) in {-1,0,1}^3 -> bit. Index (dx+1)+(dy+1)*3+(dz+1)*9 skipping 13 (self), split into
// two 13-bit words so each is exact in a float attribute. The shader decodes the same layout.
const cellKey = (x, y, z) => (x + 1024) + (y + 1024) * 2048 + (z + 1024) * 4194304;
/**
 * occupancyMasks(pos, active, tol, out) -> Float32Array(2n)
 *   pos: Float32Array(3n) current grid positions; active(i) -> bool. A cube occupies a cell only when it
 *   is within `tol` of an integer cell (cubes in flight never cast AO and receive none).
 */
export function occupancyMasks(pos, n, active, tol = 0.15, out = new Float32Array(n * 2)) {
  const set = new Set();
  const snapped = new Int32Array(n * 3);
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!active(i)) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    if (Math.abs(x - rx) > tol || Math.abs(y - ry) > tol || Math.abs(z - rz) > tol) continue;
    on[i] = 1;
    snapped[i * 3] = rx; snapped[i * 3 + 1] = ry; snapped[i * 3 + 2] = rz;
    set.add(cellKey(rx, ry, rz));
  }
  for (let i = 0; i < n; i++) {
    let a = 0, b = 0;
    if (on[i]) {
      const x = snapped[i * 3], y = snapped[i * 3 + 1], z = snapped[i * 3 + 2];
      let bit = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        if (set.has(cellKey(x + dx, y + dy, z + dz))) { if (bit < 13) a += 1 << bit; else b += 1 << (bit - 13); }
        bit++;
      }
    }
    out[i * 2] = a; out[i * 2 + 1] = b;
  }
  return out;
}

const AO_VERT_HEAD = /* glsl */ `
attribute vec2 voxMask;
varying vec3 vVoxP;
varying vec3 vVoxN;
flat varying vec2 vVoxM;
uniform float uVoxFill;`;
const AO_VERT_BODY = /* glsl */ `
vVoxP = position / uVoxFill;
vVoxN = normal;
vVoxM = voxMask;`;
const AO_FRAG_HEAD = /* glsl */ `
varying vec3 vVoxP;
varying vec3 vVoxN;
flat varying vec2 vVoxM;
uniform float uAO;
uniform float uAORad;
uniform float uAOCorner;
float voxOcc(ivec3 o) {
  int idx = (o.x + 1) + (o.y + 1) * 3 + (o.z + 1) * 9;
  if (idx == 13) return 0.0;
  int b = idx > 13 ? idx - 1 : idx;
  int w = b < 13 ? int(vVoxM.x + 0.5) : int(vVoxM.y + 0.5);
  int bit = b < 13 ? b : b - 13;
  return float((w >> bit) & 1);
}
float voxW(float x) { return smoothstep(0.5 - uAORad, 0.5, x); }
float voxAO() {
  vec3 n = vVoxN, a = abs(n), p = vVoxP;
  ivec3 f, u, v; float pu, pv;
  if (a.x >= a.y && a.x >= a.z) { f = ivec3(n.x > 0.0 ? 1 : -1, 0, 0); u = ivec3(0, 1, 0); v = ivec3(0, 0, 1); pu = p.y; pv = p.z; }
  else if (a.y >= a.z) { f = ivec3(0, n.y > 0.0 ? 1 : -1, 0); u = ivec3(1, 0, 0); v = ivec3(0, 0, 1); pu = p.x; pv = p.z; }
  else { f = ivec3(0, 0, n.z > 0.0 ? 1 : -1); u = ivec3(1, 0, 0); v = ivec3(0, 1, 0); pu = p.x; pv = p.y; }
  if (voxOcc(f) > 0.5) return 1.0 - min(1.0, uAO * 1.5); // a face pressed against a neighbour = the dark gap wall
  float up = voxOcc(f + u), un = voxOcc(f - u), vp = voxOcc(f + v), vn = voxOcc(f - v);
  float wu = voxW(pu), wun = voxW(-pu), wv = voxW(pv), wvn = voxW(-pv);
  float s = up * wu + un * wun + vp * wv + vn * wvn;
  s += uAOCorner * ((1.0 - up) * (1.0 - vp) * voxOcc(f + u + v) * wu * wv
                  + (1.0 - un) * (1.0 - vp) * voxOcc(f - u + v) * wun * wv
                  + (1.0 - up) * (1.0 - vn) * voxOcc(f + u - v) * wu * wvn
                  + (1.0 - un) * (1.0 - vn) * voxOcc(f - u - v) * wun * wvn);
  return 1.0 - uAO * clamp(s, 0.0, 1.0);
}`;

/** voxelMaterial(base, { fill, ao }) -> a clone of `base` whose fragment colour is multiplied by the per-face AO. */
export function voxelMaterial(base, { fill = 0.92, ao = { strength: 0.45, radius: 0.35, corner: 0.6 } } = {}) {
  const m = base.clone();
  const u = { uVoxFill: { value: fill }, uAO: { value: ao.strength }, uAORad: { value: ao.radius }, uAOCorner: { value: ao.corner } };
  m.userData.uniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${AO_VERT_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${AO_VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${AO_FRAG_HEAD}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb *= voxAO();");
  };
  m.customProgramCacheKey = () => "voxel-ao-v1";
  return m;
}

/**
 * cubeSteps(t, start, n, stepDur = .12, overshoot = 1.6) -> 0..n: a staircase that advances one whole cube
 * per stepDur, each step snapping in with a tiny outBack overshoot. Use for pushes, extrusions, slides.
 */
export function cubeSteps(t, start, n, stepDur = 0.12, overshoot = 1.6) {
  let s = 0;
  for (let m = 0; m < n; m++) s += ease.outBack(clamp((t - start - m * stepDur) / stepDur), overshoot);
  return s;
}
/** waveKey(x, y, w, h, dir = [1, -1]) -> 0..1 diagonal sweep order (default: top-left first). */
export const waveKey = (x, y, w, h, dir = [1, -1]) => {
  const a = dir[0] >= 0 ? x / Math.max(1, w - 1) : 1 - x / Math.max(1, w - 1);
  const b = dir[1] >= 0 ? y / Math.max(1, h - 1) : 1 - y / Math.max(1, h - 1);
  return (a + b) / 2;
};


/**
 * flightPose(home [x,y,z], i, t, { key = hash, start = 0, dur = .6, spread = 1.2, seed = 1, radius = 8,
 *   bias = [0,0,0], overshoot = 1.4, spin = 2.5, out: { at, dur = .35, spread = .25, key, to: "scatter"|"drop", radius } })
 *   -> { x, y, z, s, rx, ry, rz, settled }. Cube i flies from a seeded point on a squashed sphere around home
 *   and snaps in (outBack + decaying tumble) at start + key x spread; `out` reverses it (inBack). key: 0..1
 *   order (e.g. normalised height for bottom-up builds); default a seeded hash (random order).
 */
export function flightPose(home, i, t, o = {}) {
  const { start = 0, dur = 0.6, spread = 1.2, seed = 1, radius = 8, bias = [0, 0, 0], overshoot = 1.4, spin = 2.5 } = o;
  const [hx, hy, hz] = home;
  const key = o.key ?? hash01(i, seed, 7);
  const u = clamp((t - start - key * spread) / dur);
  const a = hash01(i, seed, 1) * Math.PI * 2, b = Math.acos(2 * hash01(i, seed, 2) - 1), r = radius * (0.45 + 0.55 * hash01(i, seed, 3));
  const sx = hx + Math.sin(b) * Math.cos(a) * r + bias[0], sy = hy + Math.cos(b) * r * 0.8 + bias[1], sz = hz + Math.sin(b) * Math.sin(a) * r * 0.6 + bias[2];
  const e = ease.outBack(u, overshoot);
  let x = lerp(sx, hx, e), y = lerp(sy, hy, e), z = lerp(sz, hz, e);
  let s = smoothstep(0, 0.3, u);
  const tum = spin * (1 - ease.outCubic(u)) * (hash01(i, seed, 4) < 0.5 ? -1 : 1);
  let rx = tum * hash01(i, seed, 5), ry = tum, rz = tum * hash01(i, seed, 6);
  let settled = u >= 1;
  if (o.out && t > o.out.at) {
    const O = o.out;
    const ok = O.key ?? hash01(i, seed + 11, 7);
    const v = clamp((t - O.at - ok * (O.spread ?? 0.25)) / (O.dur ?? 0.35));
    if (v > 0) {
      settled = false;
      const R = O.radius ?? radius;
      const k = ease.inBack(v, 1.4);
      if ((O.to ?? "scatter") === "drop") { y = lerp(hy, hy - R * (0.6 + hash01(i, seed, 8)), k); x = hx; z = hz + k * R * 0.3 * (hash01(i, seed, 9) - 0.5); }
      else { x = lerp(hx, sx, k); y = lerp(hy, sy, k); z = lerp(hz, sz, k); }
      s = 1 - smoothstep(0.55, 1, v);
      const sp = spin * ease.inCubic(v);
      rx = sp * hash01(i, seed, 5); ry = sp; rz = sp * hash01(i, seed, 6);
    }
  }
  return { x, y, z, s, rx, ry, rz, settled };
}
