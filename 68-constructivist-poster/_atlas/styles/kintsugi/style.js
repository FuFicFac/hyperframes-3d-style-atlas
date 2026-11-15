// styles/kintsugi/style.js — "Kintsugi": break and mend with gold. The look lives in spec.js; WHERE every crack runs,
// where every shard falls and rests, and WHEN the gold reaches each seam lives in fracture.js (THREE-free planner
// shared with SCORE). This file turns a plan into pictures:
//   - ONE lathe geometry for the whole bowl (closed wall profile: underside, foot ring, outer wall, rounded rim, inner
//     wall, floor) with per-vertex glaze/rim flags; every shard is a Mesh on that geometry with its own index buffer
//     (only triangles near the shard) and a shader that evaluates the SAME warped weighted spherical Voronoi per
//     fragment and discards what is not its own -> crisp, matching seams at any distance, no seam-polyline extraction;
//   - back faces render as unglazed bisque, so a separated shard's broken edge reads as solid clay;
//   - per fragment, the edge distance gives the crack hairline, the gold bead (width wobble, hot molten tip, raised
//     bead via an analytic normal tilt across the seam — no derivatives) and the gold-filled chips;
//   - the gold arrival field (Dijkstra along the seams) is a half-float texture sampled with textureLod;
//   - shadows: a matching customDepthMaterial per shard (same discard);
//   - pale oatmeal linen, soft window daylight, room environment for the gold reflections;
//   - an overlay caption chip (exact colours).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { paintPixels, canvasTexture, uploadTexture } from "../../kit/textures.js";
import { hash01, clamp } from "../../kit/time.js";
import * as fracture from "./fracture.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------ shared GLSL: the fracture field
const FIELD_GLSL = /* glsl */ `
uniform vec4 uSites[KS];
uniform vec4 uWaveK[KW];
uniform vec3 uWaveA[KW];
uniform vec4 uChips[KC];
uniform float uCY;
uniform float uShard;
uniform float uBroken;
uniform float uGoldFront;
uniform float uChipGold;
varying vec3 vRest;
vec3 kWarp(vec3 d) {
  vec3 o = d;
  for (int j = 0; j < KW; j++) o += uWaveA[j] * sin(dot(uWaveK[j].xyz, d) + uWaveK[j].w);
  return normalize(o);
}
// nearest site (ia), chord edge distance to the nearest other cell (e), unit direction from that cell to ours (g)
void kField(vec3 d, out int ia, out float e, out vec3 g) {
  vec3 dw = kWarp(d);
  float sa = -1e9; ia = 0;
  for (int i = 0; i < KS; i++) { float s = dot(dw, uSites[i].xyz) + uSites[i].w; if (s > sa) { sa = s; ia = i; } }
  e = 1e9; g = vec3(0.0, 1.0, 0.0);
  vec3 A = uSites[ia].xyz;
  for (int i = 0; i < KS; i++) {
    if (i == ia) continue;
    vec3 df = A - uSites[i].xyz; float L = max(length(df), 1e-4);
    float q = (sa - (dot(dw, uSites[i].xyz) + uSites[i].w)) / L;
    if (q < e) { e = q; g = df / L; }
  }
}
// signed chip distance in chord units (< 0 inside) and the nearest chip's centre
float kChip(vec3 d, out vec3 cc) {
  float best = 1e9; cc = vec3(0.0, 1.0, 0.0);
  for (int c = 0; c < KC; c++) {
    vec3 C = uChips[c].xyz;
    float wob = 1.0 + 0.22 * sin(dot(d, vec3(41.0, -29.0, 37.0)) + float(c) * 2.1) + 0.12 * sin(dot(d, vec3(-83.0, 61.0, 47.0)));
    float s = length(d - C) - uChips[c].w * wob;
    if (s < best) { best = s; cc = C; }
  }
  return best;
}
`;

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const GD = spec.gold;

  // ---------------------------------------------------------------- linen cloth
  /** linen({ size }) -> a large plane with a soft procedural oatmeal weave (low contrast: it is a backdrop) */
  function linen(o = {}) {
    const Ln = { ...spec.linen, ...o };
    const tile = 1.0, threads = Math.round(Ln.threadsPerMetre * tile);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); // canvas wants sRGB 0..1
    const base = hex(P.linen), thr = hex(P.linenThread);
    const canvas = paintPixels(512, (u, v) => {
      const iu = Math.floor(u * threads), iv = Math.floor(v * threads);
      const fu = u * threads - iu, fv = v * threads - iv;
      const slubU = (hash01(iu, 11, Ln.seed) - 0.5) * Ln.slub, slubV = (hash01(iv, 23, Ln.seed) - 0.5) * Ln.slub;
      const over = ((iu + iv) & 1) === 0;                      // plain weave: warp over / weft over
      const wu = Math.sin(Math.PI * fu), wv = Math.sin(Math.PI * fv);
      const k = over ? 0.6 * wu + 0.4 * wv : 0.4 * wu + 0.6 * wv;
      const fleck = (hash01(Math.floor(u * 512), Math.floor(v * 512), Ln.seed) - 0.5) * 0.025;
      const m = clamp(0.5 + (k - 0.5) * Ln.contrast * 4 + (over ? slubU : slubV) + fleck, 0, 1);
      return [0, 1, 2].map((ch) => base[ch] + (thr[ch] - base[ch]) * (1 - m));
    });
    const tex = canvasTexture(canvas, { repeat: [Ln.size / tile, Ln.size / tile] });
    const mat = materials.linen;
    mat.map = tex; mat.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Ln.size, Ln.size), mat);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "linen";
    return m;
  }

  // ---------------------------------------------------------------- bowl geometry (one lathe for every shard)
  /** bowlGeometry(plan) -> BufferGeometry: positions, normals, aGlaze, aRim; userData.vertexNear = per-vertex shard sets */
  function bowlGeometry(plan) {
    const segs = plan.profile.segs, NS = spec.bowl.segments, cy = plan.profile.cy;
    const pos = [], nor = [], glz = [], rim = [], index = [];
    let v0 = 0;
    for (const S of segs) {
      const rows = S.length;
      for (const p of S) for (let j = 0; j <= NS; j++) {
        const th = (j / NS) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        pos.push(p.r * c, p.y, p.r * s); nor.push(p.nr * c, p.ny, p.nr * s); glz.push(p.glaze); rim.push(p.rim);
      }
      for (let i = 0; i + 1 < rows; i++) for (let j = 0; j < NS; j++) {
        const a = v0 + i * (NS + 1) + j, b = a + NS + 1, c2 = b + 1, d = a + 1;
        index.push(a, b, d, b, c2, d);
      }
      v0 += rows * (NS + 1);
    }
    // winding check: the geometric normal of an outer-wall triangle must agree with its vertex normal
    const P3 = (k) => new THREE.Vector3(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]);
    const probe = index.length - 6 * NS * Math.floor(segs[segs.length - 1].length * 0.8);
    const [ia, ib, ic] = [index[probe], index[probe + 1], index[probe + 2]];
    const fn = P3(ib).sub(P3(ia)).cross(P3(ic).sub(P3(ia)));
    const vn = new THREE.Vector3(nor[3 * ia], nor[3 * ia + 1], nor[3 * ia + 2]);
    if (fn.dot(vn) < 0) for (let k = 0; k < index.length; k += 3) { const tmp = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = tmp; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("aGlaze", new THREE.Float32BufferAttribute(glz, 1));
    g.setAttribute("aRim", new THREE.Float32BufferAttribute(rim, 1));
    // per-shard index buffers: a triangle goes to every shard whose cell comes within `margin` of any of its vertices
    const nV = pos.length / 3, margin = 0.035, F = plan.field, N = plan.n;
    const near = new Array(nV);
    for (let k = 0; k < nV; k++) {
      const r = F.at(fracture.dirOf([pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]], cy));
      let mask = 1 << r.a;
      for (let i = 0; i < N; i++) if (i !== r.a && (r.sc[r.a] - r.sc[i]) / F.gap[r.a][i] < margin) mask |= 1 << i;
      near[k] = mask;
    }
    const lists = Array.from({ length: N }, () => []);
    for (let k = 0; k < index.length; k += 3) {
      const m = near[index[k]] | near[index[k + 1]] | near[index[k + 2]];
      for (let i = 0; i < N; i++) if (m & (1 << i)) lists[i].push(index[k], index[k + 1], index[k + 2]);
    }
    g.userData.shardIndex = lists;
    return g;
  }

  // ---------------------------------------------------------------- uniforms shared by every shard
  function sharedUniforms(plan) {
    const F = plan.field, G = plan.grid;
    // arrival field -> half-float texture (R), u = azimuth / 2pi (repeat), v = elevation (clamp)
    const data = new Uint16Array(G.nu * G.nv);
    for (let k = 0; k < data.length; k++) data[k] = THREE.DataUtils.toHalfFloat(Number.isFinite(G.dist[k]) ? G.dist[k] : 99);
    const tex = new THREE.DataTexture(data, G.nu, G.nv, THREE.RedFormat, THREE.HalfFloatType);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    uploadTexture(stage, tex);
    const col = (h) => new THREE.Color(h);
    return {
      uSites: { value: F.sites.map((s) => new THREE.Vector4(...s.d, s.w)) },
      uWaveK: { value: F.waves.map((w) => new THREE.Vector4(...w.k, w.ph)) },
      uWaveA: { value: F.waves.map((w) => new THREE.Vector3(...w.a)) },
      uChips: { value: plan.chips.map((c) => new THREE.Vector4(...c.d, c.r)) },
      uCY: { value: plan.profile.cy },
      uArrival: { value: tex },
      uElev: { value: new THREE.Vector2(G.e0, G.e1) },
      uCrack: { value: new THREE.Vector4(...plan.impactDir, -1) },
      uBroken: { value: 0 },
      uGoldFront: { value: -1 },
      uChipGold: { value: 0 },
      uGoldW: { value: GD.halfWidth }, uGrow: { value: GD.grow }, uHot: { value: GD.hot }, uBump: { value: GD.bump }, uCrackW: { value: GD.crackWidth },
      uRimY: { value: spec.bowl.rimY },
      uGlaze: { value: col(P.glaze) }, uGlazeDeep: { value: col(P.glazeDeep) }, uGlazeLight: { value: col(P.glazeLight) },
      uIron: { value: col(P.iron) }, uFoot: { value: col(P.foot) }, uBisque: { value: col(P.bisque) },
      uGold: { value: col(P.gold) }, uGoldDeep: { value: col(P.goldDeep) }, uHotCol: { value: col(P.hot) },
    };
  }
  const defs = (plan) => (src) => src.replace(/KS/g, String(plan.n)).replace(/KW/g, String(plan.field.waves.length)).replace(/KC/g, String(Math.max(1, plan.chips.length)));

  // ---------------------------------------------------------------- shard material (glaze + gold + bisque, one program)
  function shardMaterial(U, shardId, plan) {
    const mat = materials.glaze.clone();
    mat.side = THREE.DoubleSide;
    mat.name = `glaze-shard-${shardId}`;
    const own = { uShard: { value: shardId } };
    const D = defs(plan);
    mat.customProgramCacheKey = () => "kintsugi-shard";
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, own);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
attribute float aGlaze; attribute float aRim;
varying vec3 vRest; varying vec3 vObjN; varying float vGlz; varying float vRimF;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vRest = position; vObjN = normal; vGlz = aGlaze; vRimF = aRim;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
uniform mat3 normalMatrix;
uniform sampler2D uArrival; uniform vec2 uElev; uniform vec4 uCrack;
uniform float uGoldW, uGrow, uHot, uBump, uCrackW, uRimY;
uniform vec3 uGlaze, uGlazeDeep, uGlazeLight, uIron, uFoot, uBisque, uGold, uGoldDeep, uHotCol;
varying vec3 vObjN; varying float vGlz; varying float vRimF;
${D(FIELD_GLSL)}`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  // ---- kintsugi field (no derivatives anywhere below; the discard is at the very end of main)
  vec3 kRel = vRest - vec3(0.0, uCY, 0.0);
  float kRho = length(kRel);
  vec3 kD = kRel / max(kRho, 1e-5);
  int kA; float kE; vec3 kG;
  kField(kD, kA, kE, kG);
  float kEm = kE * kRho;                                   // metres from the seam
  vec3 kCC; float kCh = kChip(kD, kCC) * kRho;             // metres from the chip edge (< 0 inside)
  float kAz = atan(kD.z, (abs(kD.x) + abs(kD.z)) < 1e-6 ? 1.0 : kD.x);
  float kU = fract(kAz / 6.28318530718);
  float kV = clamp((asin(clamp(kD.y, -1.0, 1.0)) - uElev.x) / (uElev.y - uElev.x), 0.0, 1.0);
  float kArr = textureLod(uArrival, vec2(kU, kV), 0.0).r;
  float kSince = uGoldFront - kArr;
  float kHas = step(0.0, uGoldFront) * step(0.0, kSince);
  float kGrow = smoothstep(0.0, uGrow, kSince);
  float kWob = 0.75 + 0.5 * (0.5 + 0.5 * sin(dot(kD, vec3(17.0, -23.0, 29.0)) + 0.7 * sin(dot(kD, vec3(-51.0, 37.0, 43.0)))));
  float kHW = max(uGoldW * kWob * kGrow, 1e-5);
  float kX = kEm / kHW;
  float kSeamG = kHas * (1.0 - smoothstep(0.8, 1.0, kX));
  float kInChip = 1.0 - smoothstep(-0.002, 0.0, kCh);
  float kChipG = kInChip * kHas * smoothstep(0.0, uGrow * 1.5, kSince) * uChipGold;
  float kGoldM = max(kSeamG, kChipG);
  float kHeat = kHas * (1.0 - smoothstep(0.0, uHot, kSince));
  float kCrackOn = step(0.0, uCrack.w) * step(acos(clamp(dot(kD, normalize(uCrack.xyz)), -1.0, 1.0)), uCrack.w);
  float kCrack = kCrackOn * (1.0 - smoothstep(uCrackW * 0.5, uCrackW, kEm)) * (1.0 - kSeamG);
  bool kKill = (float(kA) != uShard) || (uBroken > 0.5 && kInChip > 0.5 && kChipG < 0.5);
  bool kFront = gl_FrontFacing;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
  {
    float y = vRest.y;
    vec3 gl = mix(uGlaze, uGlazeDeep, smoothstep(0.62, 0.1, y) * 0.85);       // glaze pools deeper low down
    gl = mix(gl, uGlazeLight, smoothstep(0.6, uRimY, y) * 0.45);               // thinner, paler toward the rim
    gl *= 1.0 + 0.035 * sin(dot(kD, vec3(7.0, 11.0, -5.0)) + 1.3) * sin(dot(kD, vec3(-9.0, 4.0, 13.0)));
    gl = mix(gl, uIron, vRimF * 0.6);                                          // iron shows through at the lip
    vec3 base = mix(uFoot, gl, step(0.5, vGlz));
    base = kFront ? base : uBisque;                                            // broken edges: the clay body
    base = mix(base, base * 0.28, kCrack);                                     // hairline cracks
    vec3 gold = mix(uGoldDeep, uGold, 0.55 + 0.45 * sin(dot(kD, vec3(31.0, 19.0, -27.0))));
    diffuseColor.rgb = mix(base, gold, kGoldM * float(kFront));
  }`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = mix(kFront ? (vGlz > 0.5 ? roughnessFactor : 0.85) : 0.92, 0.2 + 0.08 * sin(dot(kD, vec3(71.0, -53.0, 67.0))), kGoldM * float(kFront));`)
        .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 1.0, kGoldM * float(kFront));`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  {
    // raised bead: tilt the normal away from the seam centre line (analytic, no derivatives), plus a little lacquer lumpiness
    vec3 n0 = normalize(vObjN);
    vec3 gT = kG - n0 * dot(kG, n0);
    vec3 cT = (kD - kCC); cT = cT - n0 * dot(cT, n0);
    float sx = clamp(kX, 0.0, 1.0);
    vec3 tilt = normalize(gT + 1e-6) * uBump * sx * sx * kSeamG;
    float ce = clamp(1.0 + kCh / 0.012, 0.0, 1.0);
    tilt += normalize(cT + 1e-6) * uBump * 0.8 * ce * ce * kChipG * (1.0 - kSeamG);
    vec3 lump = 0.07 * vec3(sin(dot(kD, vec3(97.0, 13.0, -61.0))), sin(dot(kD, vec3(-41.0, 89.0, 23.0))), sin(dot(kD, vec3(29.0, -71.0, 83.0))));
    vec3 nb = normalize(n0 + tilt + lump * kGoldM);
    vec3 nv = normalize(normalMatrix * nb);
    normal = normalize(mix(normal, nv, kGoldM * float(kFront)));
  }`)
        .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
    material.clearcoat *= (1.0 - kGoldM) * float(kFront) * step(0.5, vGlz);
  #endif`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += mix(uGold, uHotCol, kHeat) * (kHeat * kHeat * 5.0) * kGoldM * float(kFront);`)
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  if (kKill) discard;`);
    };
    return mat;
  }

  function shardDepthMaterial(U, shardId, plan) {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    const own = { uShard: { value: shardId } };
    const D = defs(plan);
    m.customProgramCacheKey = () => "kintsugi-depth";
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, own);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRest;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${D(FIELD_GLSL)}`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  vec3 kRel = vRest - vec3(0.0, uCY, 0.0);
  vec3 kD = kRel / max(length(kRel), 1e-5);
  int kA; float kE; vec3 kG; kField(kD, kA, kE, kG);
  vec3 kCC; float kCh = kChip(kD, kCC);
  if (float(kA) != uShard || (uBroken > 0.5 && kCh < 0.0 && uChipGold < 0.5)) discard;`);
    };
    return m;
  }

  // ---------------------------------------------------------------- the bowl: every shard + its pivot
  /**
   * bowl(plan) -> { group, shards: [{ pivot, mesh }], update(t) } (adds itself to the scene)
   * update(t): poses every shard from plan.pose(i, t) and sets the crack / broken / gold uniforms from the plan.
   */
  function bowl(plan) {
    const group = new THREE.Group(); group.name = "kintsugi-bowl";
    const geo = bowlGeometry(plan);
    const U = sharedUniforms(plan);
    const shards = plan.shards.map((s, i) => {
      const g = geo.clone();
      g.setIndex(geo.userData.shardIndex[i]);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, shardMaterial(U, i, plan));
      mesh.customDepthMaterial = shardDepthMaterial(U, i, plan);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.position.set(-s.c[0], -s.c[1], -s.c[2]);
      mesh.name = `shard-${i}`;
      mesh.frustumCulled = false;
      const pivot = new THREE.Group(); pivot.name = `shard-pivot-${i}`;
      pivot.add(mesh); group.add(pivot);
      return { pivot, mesh };
    });
    stage.scene.add(group);
    return {
      group, shards, uniforms: U,
      update(t) {
        plan.shards.forEach((s, i) => {
          const p = plan.pose(i, t);
          shards[i].pivot.position.set(p.pos[0], p.pos[1], p.pos[2]);
          shards[i].pivot.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3]);
        });
        U.uCrack.value.w = plan.crackFront(t);
        U.uBroken.value = plan.broken(t);
        U.uGoldFront.value = plan.goldFront(t);
        U.uChipGold.value = plan.goldFront(t) >= 0 ? 1 : 0;
      },
    };
  }

  // ---------------------------------------------------------------- overlay caption chip (bottom-left)
  /** caption() -> overlay chip (dark plate, a short gold seam mark, light serif text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), mark = 34;
      const pw = Math.min(W - 16, pad + mark + pad * 0.8 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 12); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 12); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 11); x.stroke();
      // the mark: a short jagged gold seam
      x.strokeStyle = Q.gold; x.lineWidth = 5; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath();
      const mx = ox + pad, my = oy + ph / 2;
      [[0, -18], [9, -6], [4, 2], [15, 10], [11, 18]].forEach(([dx, dy], k) => (k ? x.lineTo(mx + dx + 6, my + dy) : x.moveTo(mx + dx + 6, my + dy)));
      x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, mx + mark + pad * 0.8, my + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { linen, bowlGeometry, bowl, caption };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: fracture, motion: fracture,
  };
}
