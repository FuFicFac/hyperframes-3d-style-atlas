// styles/pin-art/style.js — "Pin Art": a giant pinscreen of polished metal pins on a dark desk, low raking key light.
// The look lives in spec.js; WHEN and HOW HIGH every pin is lives in pins.js (THREE-free planner shared with SCORE).
// This file turns a plan into pictures: ONE InstancedMesh for every pin (lathe pin: slim shaft + domed head) whose
// per-instance extension is written into an instance attribute from plan.heightsAt(t) and applied in the vertex
// shader (the shadow depth material gets the same displacement, so shadows follow the relief), a clear acrylic frame
// (kit fresnelGlass) round a dark base plate, a matte desk, a procedural studio environment for the metal, and a
// caption chip + SAMPLE DATA tag on the overlay. Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { studioEnvironment } from "../../kit/studio.js";
import { fresnelGlass } from "../../kit/materials.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as pins from "./pins.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const _m = new THREE.Matrix4();

/**
 * createStyle(stage, opts?) -> style   opts: { post = true, finish = "steel" }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const F = spec.field, FR = spec.frame;
  const studio = studioEnvironment(stage, spec.studio, {});

  // ---------------------------------------------------------------- pin geometry (one lathe, instanced)
  function pinGeometry(o = {}) {
    const R = o.headR ?? F.headR, Hh = o.headH ?? F.headH, rs = o.shaftR ?? F.shaftR, L = o.length ?? F.length;
    const pts = [];
    pts.push(new THREE.Vector2(0, -L), new THREE.Vector2(rs, -L), new THREE.Vector2(rs, -Hh - 0.004));
    pts.push(new THREE.Vector2(R * 0.82, -Hh), new THREE.Vector2(R, -Hh * 0.82), new THREE.Vector2(R, -Hh * 0.62));
    const domeH = Hh * 0.62, rings = o.domeRings ?? F.domeRings;
    for (let k = 1; k <= rings; k++) {
      const a = (k / rings) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * R + (k === rings ? 0 : 0), -domeH + Math.sin(a) * domeH));
    }
    pts[pts.length - 1].x = 0;
    const g = new THREE.LatheGeometry(pts, o.radial ?? F.radial);
    g.computeVertexNormals();
    return g;
  }

  const lin = (hex) => new THREE.Color(hex);
  function patchPin(mat, key, withColour) {
    mat.onBeforeCompile = (sh) => {
      if (withColour) sh.uniforms.uFinish = mat.userData.uFinish;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>\nattribute float aExt;${withColour ? "\nattribute vec3 aTint; attribute float aMix; attribute float aAO; varying vec3 vPin; varying float vMix; varying float vAO;" : ""}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\ntransformed.y += aExt;${withColour ? "\nvPin = aTint; vMix = aMix; vAO = aAO;" : ""}`);
      if (withColour) {
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uFinish; varying vec3 vPin; varying float vMix; varying float vAO;")
          .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(uFinish, vPin, clamp(vMix, 0.0, 1.0));")
          .replace("#include <opaque_fragment>", "outgoingLight *= vAO;\n#include <opaque_fragment>");
      }
    };
    mat.customProgramCacheKey = () => key;
  }

  /**
   * pinField(plan, { finish = opts.finish ?? "steel", palette = P.anodised }) -> InstancedMesh of every pin.
   *   userData.update(t): extensions from plan.heightsAt(t); anodised tints fade in with any step whose source
   *   carries a tint (bars) and fade out with the next step that moves that pin.
   *   userData.setFinish(name) switches steel / brass / blackChrome / anodised.
   */
  function pinField(plan, o = {}) {
    const grid = plan.grid, n = grid.n;
    const geo = pinGeometry(o);
    const ext = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); ext.setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); tint.setUsage(THREE.DynamicDrawUsage);
    const mix = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); mix.setUsage(THREE.DynamicDrawUsage);
    const ao = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1); ao.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aExt", ext); geo.setAttribute("aTint", tint); geo.setAttribute("aMix", mix); geo.setAttribute("aAO", ao);
    const finishName = o.finish ?? opts.finish ?? "steel";
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff" });
    mat.userData.uFinish = { value: new THREE.Color() };
    patchPin(mat, "pin-art-pin", true);
    mat.name = "pins";
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchPin(depth, "pin-art-pin-depth", false);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = "pins";
    const y0 = (o.headH ?? F.headH) + (o.rest ?? F.rest);
    for (let i = 0; i < n; i++) { _m.makeTranslation(grid.x[i], y0, grid.z[i]); mesh.setMatrixAt(i, _m); }
    mesh.instanceMatrix.needsUpdate = true;
    const palette = (o.palette ?? P.anodised).map(lin);
    const tintSteps = plan.steps.filter((s) => s.tint);
    const setFinish = (name) => {
      const f = spec.finishes[name] ?? spec.finishes.steel;
      mat.userData.uFinish.value.copy(lin(f.color));
      mat.roughness = f.roughness; mat.metalness = f.metalness; mat.envMapIntensity = f.envIntensity;
      mesh.userData.finish = name;
    };
    setFinish(finishName);
    const A = ext.array, T = tint.array, X = mix.array;
    const AOk = o.ao ?? F.ao, AO2 = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    mesh.userData.update = (t) => {
      plan.heightsAt(t, A);
      ext.needsUpdate = true;
      // neighbour occlusion: sum of how far the 8 neighbours (and the 4 two steps away, half weight) rise above this pin
      const C = grid.cols, R = grid.rows, O = ao.array, k = AOk.strength, mx = AOk.max, dT = AOk.depthTone ?? 1, dR = AOk.depthRange ?? 0.2;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const i = c + r * C, hi = A[i];
        let s = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const cc = c + dc, rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= C || rr >= R) continue;
          const d = A[cc + rr * C] - hi; if (d > 0) s += d;
        }
        for (const [dc, dr] of AO2) {
          const cc = c + dc, rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= C || rr >= R) continue;
          const d = A[cc + rr * C] - hi; if (d > 0) s += 0.5 * d;
        }
        const lift = hi >= dR ? 1 : hi <= 0 ? 0 : (hi / dR) * (hi / dR) * (3 - 2 * (hi / dR));
        O[i] = (1 - Math.min(mx, k * s / 6)) * (dT + (1 - dT) * lift);
      }
      ao.needsUpdate = true;
      if (!tintSteps.length) return;
      X.fill(0);
      for (const s of plan.steps) {
        if (t <= s.first) continue;
        if (s.tint) {
          for (let q = 0; q < s.idx.length; q++) {
            const i = s.idx[q], c = s.tint[i];
            if (c < 0) continue;
            const p = plan.progressAt(s.k, i, t);
            X[i] = X[i] + (1 - X[i]) * p;
            const col = palette[c % palette.length];
            T[i * 3] = col.r; T[i * 3 + 1] = col.g; T[i * 3 + 2] = col.b;
          }
        } else {
          for (let q = 0; q < s.idx.length; q++) { const i = s.idx[q]; if (X[i] > 0) X[i] *= 1 - plan.progressAt(s.k, i, t); }
        }
      }
      tint.needsUpdate = true; mix.needsUpdate = true;
    };
    mesh.userData.setFinish = setFinish;
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- frame, plate and desk
  /** frame(grid) -> Group: dark base plate under the pins + a clear acrylic border (fresnel glass) with corner screws */
  function frame(grid, o = {}) {
    const g = new THREE.Group(); g.name = "frame";
    const m = o.margin ?? FR.margin, H = o.height ?? FR.height, B = o.base ?? FR.base;
    const W = grid.w + 2 * m, D = grid.d + 2 * m;
    // opaque base: plate + plinth over the full frame footprint (hides every shaft below y = 0)
    const plate = new THREE.Mesh(new RoundedBoxGeometry(W, B, D, 2, 0.012), materials.plate);
    plate.position.y = -B / 2 - 0.001; plate.receiveShadow = true; plate.castShadow = true; plate.name = "plate";
    g.add(plate);
    const glass = fresnelGlass({ color: "#dcebff", alphaFace: FR.alphaFace, alphaRim: FR.alphaRim, rim: "#cfe0ff", rimStrength: 0.3, toLight: [-1, 0.4, 0.6] });
    const bar = (w, d, x, z) => {
      const b = new THREE.Mesh(new RoundedBoxGeometry(w, H, d, 3, FR.radius), glass);
      b.position.set(x, H / 2, z);
      b.renderOrder = 2;
      g.add(b);
      // a bright polished top edge (the acrylic catching the key light)
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.006, d - 0.02), materials.acrylicEdge);
      edge.position.set(x, H + 0.002, z);
      g.add(edge);
      return b;
    };
    bar(W, m, 0, -(grid.d + m) / 2);
    bar(W, m, 0, (grid.d + m) / 2);
    bar(m, grid.d, -(grid.w + m) / 2, 0);
    bar(m, grid.d, (grid.w + m) / 2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), materials.screw);
      s.position.set(sx * (W / 2 - m / 2), H + 0.006, sz * (D / 2 - m / 2));
      g.add(s);
    }
    return g;
  }

  /** desk({ size, y }) -> matte dark desk plane under the toy */
  function desk(o = {}) {
    const size = o.size ?? spec.desk.size;
    const mat = materials.desk;
    if (mat.bumpMap) mat.bumpMap.repeat.set(size / 2, size / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = o.y ?? spec.desk.y;
    m.receiveShadow = true; m.name = "desk";
    return m;
  }

  // ---------------------------------------------------------------- overlay: caption chip + SAMPLE DATA tag
  /** caption() -> overlay chip (dark machined plate, a 3x3 pin-head icon, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.42);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.45)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      const cx = ox + pad, cy = oy + Math.round((ph - ic) / 2), step = ic / 3;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const px = cx + step * (c + 0.5), py = cy + step * (r + 0.5);
        x.fillStyle = Q.dot; x.beginPath(); x.arc(px, py, step * 0.36, 0, Math.PI * 2); x.fill();
        x.fillStyle = Q.dotHi; x.beginPath(); x.arc(px - step * 0.1, py - step * 0.1, step * 0.12, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, cx + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** sampleTag() -> amber "SAMPLE DATA" chip, right-aligned at spec.sampleTag.x; userData.show(alpha) */
  function sampleTag(o = {}) {
    const Q = { ...spec.sampleTag, ...o };
    const Wp = 420, Hp = Q.h + 16;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.on) return;
      x.font = `800 ${Q.cap}px ${spec.caption.font}`;
      x.letterSpacing = "2px";
      const tw = Math.round(x.measureText(Q.text).width), pad = 22, pw = tw + pad * 2, ph = Q.h;
      const ox = W - pw - 6, oy = 4;
      x.fillStyle = "rgba(0,0,0,0.4)"; x.beginPath(); x.roundRect(ox + 2, oy + 5, pw, ph, 10); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(Q.text, ox + pad, oy + Math.round(ph / 2) + 1);
    }, { upload: true });
    mesh.userData.place(Q.x - Wp, Q.y);
    mesh.userData.show = (a) => { mesh.userData.set({ on: a > 0.003 }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** pinScreen(plan, { finish }) -> { group, pins, frame, desk, update(t) } (adds itself to the scene) */
  function pinScreen(plan, o = {}) {
    const group = new THREE.Group(); group.name = "pinScreen";
    const d = desk(); stage.scene.add(d);
    const fr = frame(plan.grid, o); group.add(fr);
    const pf = pinField(plan, o); group.add(pf);
    stage.scene.add(group);
    return { group, pins: pf, frame: fr, desk: d, update(t) { pf.userData.update(t); } };
  }

  const props = { pinField, frame, desk, caption, sampleTag, pinScreen, pinGeometry };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    studio, plan: pins, motion: pins,
  };
}
