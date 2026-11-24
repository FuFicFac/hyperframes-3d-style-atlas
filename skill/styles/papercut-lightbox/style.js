// styles/papercut-lightbox/style.js — "Papercut Lightbox". The look lives in spec.js; WHAT is cut, WHEN each sheet slides
// in and where the backlight sits live in layers.js (a THREE-free planner shared with the SCORE). This file turns the
// plan into pictures:
//   * seven sheets: each is the planner's cut outline extruded 0.6 mm (real cut edges that throw real shadow-map shadows
//     under the raking room light). One patched MeshStandardMaterial program for all seven: under the backlight a sheet
//     EMITS  backlight(p) × tau × Π_j (1 − (1 − tau) · mask_j(q_j)),  where q_j is the point where the line from the lamp
//     to p crosses sheet j behind it. The masks are the same outlines rasterised once into a 7-layer array texture
//     (sharp / soft / softer coverage), so a projected edge softens with distance and sweeps when the lamp moves;
//   * the diffuser panel behind the back sheet (seen only through the moon and the star holes), the walnut box with its
//     slot grooves, the slate wall, the window lamp between the forest and the house sheets;
//   * an overlay caption whose new line slides in from the right (like a sheet into its slot) and pushes the old one out.
// Props never animate themselves: the scene calls box.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, uploadTexture } from "../../kit/textures.js";
import { valueNoise2 } from "../../kit/noise.js";
import { clamp, lerp, ease } from "../../kit/time.js";
import * as layers from "./layers.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const col = (h) => new THREE.Color(h);

const LIGHT_GLSL = /* glsl */ `
uniform highp sampler2DArray uMask;
uniform sampler2D uForm;
uniform float uBack, uHotS2, uSoftK, uRoomSoftK, uShadowK, uFrameK, uLipZ, uZ[7], uSlide[7];
uniform vec3 uLight, uTau, uBaseCol, uHotCol, uKeyDir;
uniform vec2 uSize, uOpenHalf;
vec3 panelAt(vec2 p) {
  vec2 d = p - uLight.xy;
  return uBaseCol + uHotCol * exp(-dot(d, d) / uHotS2);
}
// coverage of sheet j at world point q, blended sharp -> softest by w in 0..1 (0 outside the sheet)
float coverAt(int j, vec2 q, float w) {
  vec2 uv = vec2((q.x - uSlide[j]) / uSize.x + 0.5, q.y / uSize.y + 0.5);
  vec4 m = textureLod(uMask, vec3(uv, float(j)), 0.0);
  float s = clamp(w, 0.0, 1.0) * 3.0;
  float c = mix(mix(m.r, m.g, clamp(s, 0.0, 1.0)), mix(m.b, m.a, clamp(s - 2.0, 0.0, 1.0)), clamp(s - 1.0, 0.0, 1.0));
  return c * step(0.0, uv.x) * step(uv.x, 1.0);
}
// BACKLIGHT: light left after every sheet j < k between the lamp and p (sheet k at depth zk)
vec3 throughStack(vec2 p, float k, float zk) {
  vec3 T = vec3(1.0);
  for (int j = 0; j < 7; j++) {
    if (float(j) < k) {
      float dz = zk - uZ[j];
      vec2 q = p + (uLight.xy - p) * (dz / (zk - uLight.z));
      T *= mix(vec3(1.0), uTau, coverAt(j, q, dz * uSoftK));
    }
  }
  return T;
}
// ROOM LIGHT: the raking key is blocked by every sheet j > k in front (shadow softens with distance) and by the lip
float roomShadow(vec2 p, float k, float zk) {
  float s = 1.0;
  vec2 dxy = uKeyDir.xy / uKeyDir.z;
  for (int j = 0; j < 7; j++) {
    if (float(j) > k) {
      float dz = uZ[j] - zk;
      s *= 1.0 - uShadowK * coverAt(j, p + dxy * dz, dz * uRoomSoftK);
    }
  }
  float dzl = uLipZ - zk;
  vec2 e = uOpenHalf - abs(p + dxy * dzl);
  float pen = 0.003 + dzl * 0.3;
  return s * (1.0 - uFrameK * (1.0 - smoothstep(-pen, pen, min(e.x, e.y))));
}
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  stage.renderer.localClippingEnabled = true;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const FR = spec.frame, PA = spec.paper, BL = spec.backlight, RM = spec.room;
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };

  // ---------------------------------------------------------------- textures from the plan
  function maskTexture(plan) {
    const [SW] = plan.cfg.box.sheet;
    const nx = 522, ny = Math.round((nx * plan.cfg.box.sheet[1]) / SW);
    const M = plan.bakeMasks(nx, ny);
    const tex = new THREE.DataArrayTexture(M.data, M.nx, M.ny, M.n);
    tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    uploadTexture(stage, tex);
    return tex;
  }
  /** cloudy paper formation (R) + fine fibre (G), tileable, seeded */
  function formationTexture() {
    const N = 256, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N, k = (j * N + i) * 4;
      const cloud = 0.5 * valueNoise2(u * 6, v * 6, 71, 6) + 0.3 * valueNoise2(u * 16, v * 16, 72, 16) + 0.2 * valueNoise2(u * 40, v * 40, 73, 40);
      data[k] = Math.round(255 * cloud);
      data[k + 1] = Math.round(255 * valueNoise2(u * 96, v * 96, 74, 96));
      data[k + 2] = 128; data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    uploadTexture(stage, tex);
    return tex;
  }

  // ---------------------------------------------------------------- the walnut box, its slots, the wall
  function frameBox(plan) {
    const B = plan.cfg.box, g = new THREE.Group(); g.name = "frame";
    const iw = B.sheet[0] - 0.004, ih = B.sheet[1] - 0.004;
    const ow = iw + 2 * FR.wallT, oh = ih + 2 * FR.wallT;
    const zBackFront = plan.z[0] - 0.02, zBack = zBackFront - FR.backT, zLip0 = B.frontZ + 0.003, zLip1 = zLip0 + FR.lipDepth;
    const wood = woodTexture(FR.wood); wood.anisotropy = 8;
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(1 / FR.woodTile, 1 / FR.woodTile);
    const wm = materials.walnut.clone(); wm.map = wood;
    const depth = zLip0 - zBack, zc = (zLip0 + zBack) / 2;
    /** BoxGeometry with UVs in metres (per face), so the grain keeps its scale on thin walls. On the ±x faces the
     *  grain is turned to run along y, parallel to the slot grooves (crossed, they read as a brick grid). */
    const meterBox = (w, h, d) => {
      const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz, 4 verts each
      for (let i = 0; i < uv.count; i++) {
        const fi = Math.floor(i / 4), f = dims[fi], u = uv.getX(i) * f[0], v = uv.getY(i) * f[1];
        if (fi < 2) uv.setXY(i, v, u); else uv.setXY(i, u, v);
      }
      return geo;
    };
    const box = (w, h, d, x, y, z, mat, cast = FR.castShadow) => {
      const m = shadow(new THREE.Mesh(meterBox(w, h, d), mat), cast, true);
      m.position.set(x, y, z); g.add(m); return m;
    };
    box(FR.wallT, oh, depth, -(iw / 2 + FR.wallT / 2), 0, zc, wm);
    box(FR.wallT, oh, depth, iw / 2 + FR.wallT / 2, 0, zc, wm);
    box(iw, FR.wallT, depth, 0, ih / 2 + FR.wallT / 2, zc, wm);
    box(iw, FR.wallT, depth, 0, -(ih / 2 + FR.wallT / 2), zc, wm);
    box(ow, oh, FR.backT, 0, 0, zBack + FR.backT / 2, materials.backboard);
    // front lip: a walnut border around the opening, slightly bevelled
    const [opw, oph] = FR.opening;
    const v2 = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const s = new THREE.Shape(v2([[-ow / 2, -oh / 2], [ow / 2, -oh / 2], [ow / 2, oh / 2], [-ow / 2, oh / 2]]));
    s.holes.push(new THREE.Path(v2([[-opw / 2, -oph / 2], [-opw / 2, oph / 2], [opw / 2, oph / 2], [opw / 2, -oph / 2]])));
    const bev = 0.0018;
    const lipGeo = new THREE.ExtrudeGeometry(s, { depth: FR.lipDepth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 1 });
    const lip = shadow(new THREE.Mesh(lipGeo, wm), FR.castShadow, true); // ExtrudeGeometry UVs are already in metres
    lip.position.z = zLip0 + bev;
    g.add(lip);
    // slot grooves on the four inner walls, one per sheet
    const sm = materials.slot;
    plan.z.forEach((zk) => {
      const zc2 = zk - B.thick / 2;
      box(iw, 0.0004, 0.0018, 0, ih / 2 - 0.0002, zc2, sm, false);
      box(iw, 0.0004, 0.0018, 0, -ih / 2 + 0.0002, zc2, sm, false);
      box(0.0004, ih, 0.0018, -iw / 2 + 0.0002, 0, zc2, sm, false);
      box(0.0004, ih, 0.0018, iw / 2 - 0.0002, 0, zc2, sm, false);
    });
    // the wall the box hangs on
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), materials.wall);
    wall.position.z = zBack - 0.0005; wall.receiveShadow = true; wall.name = "wall";
    g.add(wall);
    g.userData = { iw, ih, ow, oh, zBack, zLip1 };
    return g;
  }

  // ---------------------------------------------------------------- the paper sheets
  function sheetGeometry(S, thick) {
    const v2 = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const shape = new THREE.Shape(v2(S.outer));
    for (const h of S.holes) shape.holes.push(new THREE.Path(v2(h)));
    return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1, steps: 1 });
  }
  function sheetMaterial(U, k, zk, lampAmp, lampR) {
    const m = new THREE.MeshStandardMaterial({ color: col(PA.color), roughness: PA.roughness, metalness: 0 });
    const own = {
      uK: { value: k }, uZk: { value: zk }, uFormOff: { value: new THREE.Vector2(0.137 * k, 0.311 * k) },
      uLampAmp: { value: lampAmp }, uLampR2: { value: lampR * lampR },
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, own);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSheet;\nvarying vec2 vW;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vSheet = position;\n  vW = (modelMatrix * vec4(position, 1.0)).xy;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
${LIGHT_GLSL}
uniform float uK, uZk, uFormAmt, uFormScale, uRoomMottle, uLamp, uLampAmp, uLampR2;
uniform vec2 uFormOff;
uniform vec3 uLampPos, uLampCol;
varying vec3 vSheet;
varying vec2 vW;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
  vec4 formT = texture(uForm, vSheet.xy * uFormScale + uFormOff);
  float form = formT.r - 0.5 + 0.35 * (formT.g - 0.5);
  diffuseColor.rgb *= 1.0 + uRoomMottle * form * 2.0;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  vec3 Tself = uTau * (1.0 + uFormAmt * form * 2.0);
  vec3 glowL = uBack * panelAt(vW) * throughStack(vW, uK, uZk) * Tself;
  vec2 dl = vW - uLampPos.xy;
  glowL += uLamp * uLampAmp * uLampCol * exp(-dot(dl, dl) / uLampR2);
  totalEmissiveRadiance += glowL;`)
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
  float roomS = roomShadow(vW, uK, uZk);
  reflectedLight.directDiffuse *= roomS;
  reflectedLight.directSpecular *= roomS;`);
    };
    m.customProgramCacheKey = () => "papercut-sheet";
    return m;
  }

  // ---------------------------------------------------------------- the diffuser panel (seen through the moon and stars)
  function panelMesh(plan, U, w, h) {
    const m = new THREE.MeshStandardMaterial({ color: col(P.panel), roughness: 0.9, metalness: 0 });
    const own = { uPanelZ: { value: plan.z[0] - 0.01 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, own);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vPan;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPan = position;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${LIGHT_GLSL}\nuniform float uPanelGain, uPanelZ;\nvarying vec3 vPan;`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += uBack * uPanelGain * panelAt(vPan.xy);")
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
  float roomS = roomShadow(vPan.xy, -1.0, uPanelZ);
  reflectedLight.directDiffuse *= roomS;
  reflectedLight.directSpecular *= roomS;`);
    };
    m.customProgramCacheKey = () => "papercut-panel";
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.z = own.uPanelZ.value;
    mesh.receiveShadow = false; // shadows on the panel and the sheets are analytic (roomShadow), not shadow-mapped
    mesh.name = "diffuser";
    return mesh;
  }

  // ---------------------------------------------------------------- overlay caption: new line slides in from the right
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wc = Q.maxW + 40, Hc = Q.h + 28;
    const fontPx = Math.round(Q.cap * 1.36), capH = Math.round(fontPx * 0.7);
    const mesh = screenCanvas(stage, Wc, Hc, (x, W, H, st) => {
      x.font = `${Q.weight} ${fontPx}px ${Q.font}`;
      x.textBaseline = "alphabetic"; x.textAlign = "left";
      const pad = Math.round(Q.cap * 0.62), bar = 12, ox = 4, oy = 4, ph = Q.h;
      const wOf = (s) => (s ? Math.round(x.measureText(s).width) : 0);
      const e = st.u, tw = Math.round(lerp(wOf(st.a), wOf(st.b), e));
      const pw = Math.min(W - 14, bar + pad + tw + pad);
      x.fillStyle = Q.shadow; x.beginPath(); x.roundRect(ox + 4, oy + 7, pw, ph, 12); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 12); x.fill();
      x.fillStyle = Q.accent; x.beginPath(); x.roundRect(ox, oy, bar, ph, [12, 0, 0, 12]); x.fill();
      x.save();
      x.beginPath(); x.rect(ox + bar, oy, pw - bar, ph); x.clip();
      x.fillStyle = Q.ink;
      const tx = ox + bar + pad, base = oy + Math.round(ph / 2 + capH / 2), run = pw - bar, shift = Math.round(e * run);
      if (st.a && e < 1) x.fillText(st.a, tx - shift, base);
      x.fillText(st.b, tx + run - shift, base);
      x.restore();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    /** show(prev, text, u): u = 0 shows prev, 1 shows text; between, text slides in from the right and pushes prev out */
    mesh.userData.show = (a, b, u) => {
      const q = Math.round(clamp(u) * 40) / 40; // 40 steps: identical canvas for identical (a, b, q)
      mesh.userData.set(q >= 1 ? { a: "", b, u: 1 } : { a, b, u: +ease.inOutCubic(q).toFixed(4) });
      mesh.userData.opacity(1);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- everything, from one plan
  /** lightbox(plan) -> { group, frame, sheets, panel, uniforms, update(t) }. Adds itself to the scene. */
  function lightbox(plan) {
    const group = new THREE.Group(); group.name = "lightbox";
    const B = plan.cfg.box;
    const frame = frameBox(plan); group.add(frame);
    const U = {
      uMask: { value: maskTexture(plan) }, uForm: { value: formationTexture() },
      uBack: { value: 0 }, uHotS2: { value: BL.hotSigma * BL.hotSigma }, uSoftK: { value: BL.soft },
      uZ: { value: plan.z.slice() }, uLight: { value: new THREE.Vector3(...plan.lightAt(0)) },
      uTau: { value: new THREE.Vector3(...BL.tau) }, uBaseCol: { value: new THREE.Color() }, uHotCol: { value: new THREE.Color() },
      uSize: { value: new THREE.Vector2(...B.sheet) },
      uFormAmt: { value: PA.formation }, uFormScale: { value: PA.formationScale }, uRoomMottle: { value: PA.roomMottle },
      uLamp: { value: 0 }, uLampPos: { value: new THREE.Vector3(...plan.lamp) }, uLampCol: { value: col(BL.lamp) },
      uPanelGain: { value: BL.panelGain },
      // room light: analytic soft shadows from the same masks
      uKeyDir: { value: new THREE.Vector3() }, uRoomSoftK: { value: RM.soft }, uShadowK: { value: RM.shadow }, uFrameK: { value: RM.frame },
      uLipZ: { value: B.frontZ + 0.003 }, uOpenHalf: { value: new THREE.Vector2(FR.opening[0] / 2, FR.opening[1] / 2) },
      uSlide: { value: plan.z.map(() => 1) },
    };
    if (lights.key) U.uKeyDir.value.subVectors(lights.key.position, lights.key.target.position).normalize();
    const clipX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), frame.userData.ow / 2);
    const sheets = plan.shapes.map((S, k) => {
      const lampAmp = k === 3 ? BL.lampGain : k === 4 ? BL.lampHaloGain : 0;
      const lampR = k === 3 ? BL.lampR : BL.lampHalo;
      const mat = sheetMaterial(U, k, plan.z[k], lampAmp, lampR);
      mat.clippingPlanes = [clipX];
      const m = shadow(new THREE.Mesh(sheetGeometry(S, B.thick), mat), false, false);
      m.position.z = plan.z[k] - B.thick;
      m.name = `sheet-${S.id}`;
      group.add(m);
      return m;
    });
    const panel = panelMesh(plan, U, frame.userData.iw, frame.userData.ih); group.add(panel);
    stage.scene.add(group);

    const dawn = col(BL.dawn), dawnGlow = col(BL.dawnGlow), sunset = col(BL.sunset), sunsetGlow = col(BL.sunsetGlow);
    function update(t) {
      for (let k = 0; k < sheets.length; k++) {
        const s = plan.slideAt(k, t);
        sheets[k].visible = s.visible;
        sheets[k].position.x = s.x;
        U.uSlide.value[k] = s.visible ? s.x : 1; // 1 m = out of the box: casts nothing
      }
      const room = plan.roomAt(t), back = plan.backAt(t), warm = plan.warmAt(t);
      if (lights.key) lights.key.intensity = spec.room.key * room;
      if (lights.fill) lights.fill.intensity = lerp(spec.room.fillDark, spec.room.fill, room);
      U.uBack.value = back;
      U.uLight.value.set(...plan.lightAt(t));
      U.uBaseCol.value.lerpColors(dawn, sunset, warm).multiplyScalar(BL.base * BL.gain);
      U.uHotCol.value.lerpColors(dawnGlow, sunsetGlow, warm).multiplyScalar(BL.hot * BL.gain);
      U.uLamp.value = plan.lampAt(t);
      if (post) post.set({ bloom: { strength: BL.bloom * back } });
    }
    return { group, frame, sheets, panel, uniforms: U, update };
  }

  const props = { frameBox, lightbox, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: layers, motion: layers,
  };
}
