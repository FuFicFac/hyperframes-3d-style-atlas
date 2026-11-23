// styles/flip-dot/style.js — "Flip-Dot Display": a giant electromechanical flip-disc sign on a blue wall.
// The look lives in spec.js; WHICH disc flips WHEN lives in flipplan.js (THREE-free planner shared with SCORE).
// This file turns a plan into pictures: ONE InstancedMesh for every disc. Each frame the scene calls update(t), which
// writes every disc's flip angle (plan.anglesAt(t), a closed form) into an instance attribute; the vertex shader
// turns the disc about its diagonal axle (position and normal), and the fragment shader picks the yellow or the black
// side from a per-face attribute. A printed back plate (pocket + axle nubs per cell), a metal housing and a wall make
// the set; the beat label is a caption chip on the overlay. Props never animate themselves.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { makeCanvas, canvasTexture } from "../../kit/textures.js";
import { screenCanvas } from "../../kit/overlay.js";
import { hash01 } from "../../kit/time.js";
import * as flipplan from "./flipplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const _m = new THREE.Matrix4();

/**
 * createStyle(stage, opts?) -> style   opts: { post = true, bright = palette.bright (disc colour, e.g. palette.brightAlt) }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, B = spec.board, H = spec.housing;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- one disc (instanced)
  /** discGeometry() -> a thin round disc facing +Z; attribute aFace = 1 on the front (bright) cap, 0 elsewhere */
  function discGeometry(o = {}) {
    const g = new THREE.CylinderGeometry(o.r ?? B.discR, o.r ?? B.discR, o.t ?? B.discT, o.radial ?? B.radial, 1);
    g.rotateX(Math.PI / 2);
    const nrm = g.getAttribute("normal"), face = new Float32Array(nrm.count);
    for (let i = 0; i < nrm.count; i++) face[i] = nrm.getZ(i) > 0.5 ? 1 : 0;
    g.setAttribute("aFace", new THREE.BufferAttribute(face, 1));
    return g;
  }

  /**
   * discField(plan, { bright, dark }) -> InstancedMesh of every disc. userData.update(t) writes the flip angles.
   */
  function discField(plan, o = {}) {
    const grid = plan.grid, n = grid.n;
    const geo = discGeometry(o);
    const ang = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); ang.setUsage(THREE.DynamicDrawUsage);
    const tone = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    const tilt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      tone.array[i] = 1 - B.tone * hash01(3, 11, i);
      tilt[i] = (hash01(3, 13, i) - 0.5) * 2 * B.tilt;
    }
    geo.setAttribute("aAngle", ang); geo.setAttribute("aTone", tone);
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0, roughness: B.roughBright });
    mat.name = "discs";
    const U = {
      uBright: { value: new THREE.Color(o.bright ?? opts.bright ?? P.bright) },
      uDark: { value: new THREE.Color(o.dark ?? P.dark) },
      uRough: { value: new THREE.Vector2(B.roughDark, B.roughBright) },
      uAxis: { value: new THREE.Vector3(...B.axis).normalize() },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
attribute float aAngle; attribute float aTone; attribute float aFace;
uniform vec3 uAxis; varying float vFace; varying float vTone;
vec3 fdTurn(vec3 p, float a) { float c = cos(a), s = sin(a); return p * c + cross(uAxis, p) * s + uAxis * dot(uAxis, p) * (1.0 - c); }`)
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = fdTurn(objectNormal, aAngle);")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = fdTurn(transformed, aAngle); vFace = aFace; vTone = aTone;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uBright; uniform vec3 uDark; uniform vec2 uRough; varying float vFace; varying float vTone;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(uDark, uBright, step(0.5, vFace)) * vTone;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(uRough.x, uRough.y, step(0.5, vFace));");
    };
    mat.customProgramCacheKey = () => "flip-dot-disc";
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.name = "discs";
    for (let i = 0; i < n; i++) { _m.makeTranslation(grid.x[i], grid.y[i], 0); mesh.setMatrixAt(i, _m); }
    mesh.instanceMatrix.needsUpdate = true;
    const A = ang.array;
    mesh.userData.update = (t) => {
      plan.anglesAt(t, A);
      for (let i = 0; i < n; i++) A[i] += tilt[i];
      ang.needsUpdate = true;
    };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- back plate, housing, wall
  /** plateTexture(): one cell = a round pocket and two axle nubs on the diagonal; tiled cols x rows */
  function plateTexture(grid) {
    const px = B.tilePx, c = makeCanvas(px, px), x = c.getContext("2d");
    x.fillStyle = P.plate; x.fillRect(0, 0, px, px);
    x.fillStyle = P.pocket; x.beginPath(); x.arc(px / 2, px / 2, px * (B.discR / B.pitch) * 1.06, 0, Math.PI * 2); x.fill();
    x.fillStyle = P.pivot;
    const k = px * (B.discR / B.pitch) * 1.12 * Math.SQRT1_2;   // nubs at the ends of the axle (canvas y is down: the axle runs bottom-left -> top-right)
    for (const s of [-1, 1]) { x.beginPath(); x.arc(px / 2 + s * k, px / 2 - s * k, px * 0.035, 0, Math.PI * 2); x.fill(); }
    return canvasTexture(c, { repeat: [grid.cols, grid.rows], anisotropy: 8 });
  }
  /** housing(grid) -> Group: printed back plate + a metal bezel with a bright inner lip */
  function housing(grid, o = {}) {
    const g = new THREE.Group(); g.name = "housing";
    const m = o.margin ?? H.margin, bz = o.bezel ?? H.bezel;
    const W = grid.w + 2 * m, Ht = grid.h + 2 * m;
    const plateMat = new THREE.MeshStandardMaterial({ color: "#ffffff", map: plateTexture(grid), roughness: 0.85, metalness: 0 });
    plateMat.name = "plate";
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(grid.w, grid.h), plateMat);
    plate.position.z = B.plateZ; plate.name = "plate";
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, Ht), new THREE.MeshStandardMaterial({ color: P.plate, roughness: 0.85 }));
    back.position.z = B.plateZ - 0.002; back.name = "plateMargin";
    g.add(back, plate);
    const zc = H.front - H.depth / 2;
    const bar = (w, h, x, y) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, H.depth), materials.bezel);
      b.position.set(x, y, zc); b.castShadow = true; b.receiveShadow = true;
      g.add(b);
    };
    bar(W + 2 * bz, bz, 0, (Ht + bz) / 2); bar(W + 2 * bz, bz, 0, -(Ht + bz) / 2);
    bar(bz, Ht, -(W + bz) / 2, 0); bar(bz, Ht, (W + bz) / 2, 0);
    const lipT = 0.018;
    const lip = (w, h, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), materials.bezelLip); b.position.set(x, y, H.front + 0.004); g.add(b); };
    lip(W + lipT * 2, lipT, 0, Ht / 2 + lipT / 2); lip(W + lipT * 2, lipT, 0, -Ht / 2 - lipT / 2);
    lip(lipT, Ht, -W / 2 - lipT / 2, 0); lip(lipT, Ht, W / 2 + lipT / 2, 0);
    g.userData.size = [W + 2 * bz, Ht + 2 * bz];
    return g;
  }
  /** wall() -> the painted wall behind the sign */
  function wall(o = {}) {
    const s = o.size ?? H.wallSize;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), materials.wall);
    w.position.z = o.z ?? H.wallZ; w.receiveShadow = true; w.name = "wall";
    return w;
  }

  // ---------------------------------------------------------------- overlay: caption chip
  /** caption() -> overlay chip (black plate, yellow edge, a 3x3 disc icon, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1000, Hp = Q.h + 24;
    const ICON = [1, 0, 1, 0, 1, 1, 1, 1, 0];
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, Hh, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.4)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 12.5); x.stroke();
      const cx = ox + pad, cy = oy + Math.round((ph - ic) / 2), step = ic / 3;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        x.fillStyle = ICON[c + r * 3] ? Q.dot : Q.dotOff;
        x.beginPath(); x.arc(cx + step * (c + 0.5), cy + step * (r + 0.5), step * 0.41, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, cx + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** sign(plan, { bright }) -> { group, discs, housing, wall, update(t) } (adds itself to the scene) */
  function sign(plan, o = {}) {
    const group = new THREE.Group(); group.name = "sign";
    const hs = housing(plan.grid, o); group.add(hs);
    const df = discField(plan, o); group.add(df);
    const wl = wall(o);
    stage.scene.add(wl, group);
    return { group, discs: df, housing: hs, wall: wl, update(t) { df.userData.update(t); } };
  }

  const props = { sign, discField, housing, wall, caption, discGeometry };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: flipplan, motion: flipplan,
  };
}
