// styles/differential-growth/style.js — "Differential Growth". The look lives in spec.js; the SHAPE of the ribbon at
// any t lives in growth.js (THREE-free simulation, run once at load and shared with SCORE). This file turns a plan into
// pictures:
//   - the ribbon: one mesh (two paper faces + a lighter cut top edge) whose vertices are rewritten from the stored
//     curve each frame; colour drifts gently along the ribbon's length and a light band can run along it,
//   - a low clear glass hoop, a round warm-white table on a mint sweep, and an overlay caption chip.
// Props never animate themselves: the scene calls update(t, ...).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fresnelGlass } from "../../kit/materials.js";
import { createCyclorama } from "../../kit/builders.js";
import * as growth from "./growth.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const RIBBON_COMMON = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uEdge;
uniform vec3 uSweepCol;
uniform vec4 uRib;      // gradient, glow, -, -
uniform vec4 uSweep;    // centre m, width, gain, -
varying float vM;
varying float vPart;
vec3 gRib;
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadowed = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  // ---------------------------------------------------------------- set
  /** room() -> Group: mint cyclorama sweep (floor a hair below the table) + round warm-white table, top at y = 0 */
  function room() {
    const g = new THREE.Group(); g.name = "room";
    const Sw = spec.sweepWall, T = spec.table;
    const cyc = createCyclorama({ width: Sw.width, depth: Sw.depth, height: Sw.height, radius: Sw.radius, material: materials.sweep });
    cyc.position.set(0, -T.thick - 0.002, Sw.z); cyc.receiveShadow = true; g.add(cyc);
    const top = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.thick, T.segments), [materials.tableEdge, materials.table, materials.tableEdge]), false, true);
    top.position.y = -T.thick / 2; g.add(top);
    return g;
  }

  /** hoop() -> Group: low clear glass ring (inner wall at hoop.r), fresnel glass, faint contact shade */
  function hoop() {
    const H = spec.hoop, g = new THREE.Group(); g.name = "hoop";
    const glass = fresnelGlass({ ...spec.glass });
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(H.r + H.wall, H.r + H.wall, H.h, H.segments, 1, true), glass);
    outer.position.y = H.h / 2; outer.renderOrder = 4; g.add(outer);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(H.r, H.r, H.h, H.segments, 1, true), glass);
    inner.position.y = H.h / 2; inner.renderOrder = 3; g.add(inner);
    const lip = new THREE.Mesh(new THREE.RingGeometry(H.r, H.r + H.wall, H.segments, 1), glass);
    lip.rotation.x = -Math.PI / 2; lip.position.y = H.h; lip.renderOrder = 5; g.add(lip);
    const shade = new THREE.Mesh(new THREE.RingGeometry(H.r - 0.01, H.r + H.wall + 0.03, H.segments, 1),
      new THREE.MeshBasicMaterial({ color: "#3a5a52", transparent: true, opacity: 0.08, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.0015; g.add(shade);
    return g;
  }

  // ---------------------------------------------------------------- ribbon
  /** ribbonMaterial() -> MeshStandardMaterial with the paper shader (needs aM, aPart attributes); userData.rib.set(...) */
  function ribbonMaterial() {
    const Rb = spec.ribbon;
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: Rb.roughness, metalness: 0, side: THREE.FrontSide });
    const U = {
      uColA: { value: new THREE.Color(P.ribbon) },
      uColB: { value: new THREE.Color(P.ribbonB) },
      uEdge: { value: new THREE.Color(P.ribbonEdge) },
      uSweepCol: { value: new THREE.Color(P.sweepLight) },
      uRib: { value: new THREE.Vector4(Rb.gradient, Rb.glow, 0, 0) },
      uSweep: { value: new THREE.Vector4(-1, Rb.sweepWidth, 0, 0) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aM;\nattribute float aPart;\nvarying float vM;\nvarying float vPart;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvM = aM;\nvPart = aPart;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + RIBBON_COMMON)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float gG = 0.5 - 0.5 * cos(6.2831853 * vM);
          gRib = mix(uColA, uColB, gG * uRib.x);
          gRib = mix(gRib, uEdge, vPart);
          diffuseColor.rgb = gRib;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float gD = (vM - uSweep.x) / max(uSweep.y, 1e-4);
          float gS = exp(-gD * gD) * uSweep.z;
          totalEmissiveRadiance += gRib * uRib.y + uSweepCol * gS;`);
    };
    mat.customProgramCacheKey = () => "differential-growth-ribbon-1";
    mat.userData.rib = { uniforms: U, sweep(m, gain) { U.uSweep.value.x = m; U.uSweep.value.z = gain; } };
    return mat;
  }

  /**
   * ribbon(plan) -> Mesh: the plan's curve extruded upward. Three strips of 2 × M vertices (face +n, face −n, top edge).
   *   userData.update(t, { rise = 1, sweep = -1, sweepGain = 0 })  rewrites positions + normals from plan.curveAt(t).
   */
  function ribbon(plan) {
    const M = plan.M, Rb = spec.ribbon;
    const nV = 6 * M;
    const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), am = new Float32Array(nV), ap = new Float32Array(nV);
    const idx = new Uint32Array(3 * M * 6);
    // vertex v(strip, k, j): strip 0 = face +n, 1 = face −n, 2 = top edge; j = 0 bottom/outer, 1 top/inner
    const v = (s, k, j) => s * 2 * M + 2 * k + j;
    let q = 0;
    for (let k = 0; k < M; k++) {
      const k1 = (k + 1) % M;
      for (let s = 0; s < 3; s++) { am[v(s, k, 0)] = am[v(s, k, 1)] = k / M; ap[v(s, k, 0)] = ap[v(s, k, 1)] = s === 2 ? 1 : 0; }
      const b0 = v(0, k, 0), t0 = v(0, k, 1), b1 = v(0, k1, 0), t1 = v(0, k1, 1);
      idx.set([b0, t0, b1, t0, t1, b1], q); q += 6;                 // faces +n
      const c0 = v(1, k, 0), u0 = v(1, k, 1), c1 = v(1, k1, 0), u1 = v(1, k1, 1);
      idx.set([c0, c1, u0, u0, c1, u1], q); q += 6;                 // faces −n
      const o0 = v(2, k, 0), i0 = v(2, k, 1), o1 = v(2, k1, 0), i1 = v(2, k1, 1);
      idx.set([o0, i0, o1, i0, i1, o1], q); q += 6;                 // faces up
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aM", new THREE.BufferAttribute(am, 1));
    geo.setAttribute("aPart", new THREE.BufferAttribute(ap, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = ribbonMaterial();
    const mesh = shadowed(new THREE.Mesh(geo, mat)); mesh.name = "ribbon";
    mesh.frustumCulled = false;
    const C = new Float32Array(M * 2), half = Rb.thick / 2;
    mesh.userData.material = mat;
    mesh.userData.update = (t, o = {}) => {
      plan.curveAt(t, C);
      const h = Rb.h * (o.rise ?? 1), y1 = Math.max(h, 1e-4);
      for (let k = 0; k < M; k++) {
        const a = (k - 1 + M) % M, b = (k + 1) % M;
        let tx = C[2 * b] - C[2 * a], tz = C[2 * b + 1] - C[2 * a + 1];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const nx = tz, nz = -tx;                // right-hand normal in the (x, z) plane
        const x = C[2 * k], z = C[2 * k + 1];
        const put = (vi, px, py, pz, qx, qy, qz) => { pos[3 * vi] = px; pos[3 * vi + 1] = py; pos[3 * vi + 2] = pz; nor[3 * vi] = qx; nor[3 * vi + 1] = qy; nor[3 * vi + 2] = qz; };
        const ax = x + nx * half, az = z + nz * half, bx = x - nx * half, bz = z - nz * half;
        put(v(0, k, 0), ax, 0, az, nx, 0, nz); put(v(0, k, 1), ax, y1, az, nx, 0, nz);
        put(v(1, k, 0), bx, 0, bz, -nx, 0, -nz); put(v(1, k, 1), bx, y1, bz, -nx, 0, -nz);
        put(v(2, k, 0), ax, y1, az, 0, 1, 0); put(v(2, k, 1), bx, y1, bz, 0, 1, 0);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      mesh.visible = (o.rise ?? 1) > 0.001;
      mat.userData.rib.sweep(o.sweep ?? -1, o.sweepGain ?? 0);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (plum plate, coral wave icon, cream text) top-left; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.3)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), icW = Math.round(Q.h * 0.46), icH = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + icW + pad + tw + pad), ph = Q.h, oy = 6, ox = 6;
      x.fillStyle = "rgba(30,20,34,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      // icon: a coral ring with a wavy rim
      const cx = ox + pad + icW / 2, cy = oy + ph / 2, r = icH / 2;
      x.strokeStyle = P.ribbon; x.lineWidth = 4; x.lineJoin = "round"; x.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2, rr = r * (0.82 + 0.16 * Math.cos(a * 7));
        const px = cx + rr * Math.cos(a), py = cy + rr * Math.sin(a);
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + icW + pad, oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** growthTable(plan) -> { group, ribbon, update(t, o) } (adds itself to the scene) */
  function growthTable(plan) {
    const group = new THREE.Group(); group.name = "differential-growth";
    group.add(room(), hoop());
    const rb = ribbon(plan); group.add(rb);
    stage.scene.add(group);
    return { group, ribbon: rb, update(t, o = {}) { rb.userData.update(t, o); } };
  }

  const props = { room, hoop, ribbon, ribbonMaterial, caption, growthTable };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: growth, motion: growth,
  };
}
