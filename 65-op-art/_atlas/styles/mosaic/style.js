// styles/mosaic/style.js — "Mosaic": tesserae set tile by tile along contour rows (opus vermiculatum). The look lives in
// spec.js; WHICH tile goes WHERE and WHEN lives in tessera.js (THREE-free planner shared with SCORE). This file turns a
// plan into pictures: InstancedMeshes of irregular extruded chips (stone / smalti glass / gold-leaf glass, a few cut
// variants each; per-tile size, yaw along the row, small random tilt and colour baked once into a REST matrix), a wet
// plaster bed whose shader draws the red-ochre sinopia on (baked mask: R = ink, G = draw order) and later darkens to
// grout in a wipe, a wooden tray frame on an oak bench, a travelling low point light for the gold glints, and an overlay
// caption chip (exact colours). Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas, canvas2d } from "../../kit/canvas.js";
import { uploadTexture } from "../../kit/textures.js";
import { rng, clamp, hash01 } from "../../kit/time.js";
import * as tessera from "./tessera.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const PN = spec.panel, TL = spec.tile, ST = spec.set;
  const PW = PN.width, PH = PN.height;
  /** panel (x right, y up) -> world [X, Z] (panel lies on the bench, picture-up points away from the camera) */
  const toWorld = (x, y) => [x, -y];

  // ---------------------------------------------------------------- bench + tray
  /** bench({ size }) -> oak workbench top (plane just below the bed) */
  function bench(o = {}) {
    const size = o.size ?? 40;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.table);
    if (materials.table.map) materials.table.map.repeat.set(size / 4, size / 4);
    m.rotation.x = -Math.PI / 2; m.position.y = -0.002; m.receiveShadow = true; m.name = "bench";
    return m;
  }
  /** tray() -> Group: the wooden frame boxing the plaster bed */
  function tray() {
    const g = new THREE.Group(); g.name = "tray";
    const f = PN.frame, h = PN.frameH;
    const parts = [[PW + 2 * f, f, 0, -(PH / 2 + f / 2)], [PW + 2 * f, f, 0, PH / 2 + f / 2], [f, PH, -(PW / 2 + f / 2), 0], [f, PH, PW / 2 + f / 2, 0]];
    for (const [w, d, x, z] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.frame);
      m.position.set(x, h / 2 - 0.002, z); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    return g;
  }

  // ---------------------------------------------------------------- plaster bed with sinopia + grout
  /** sinopiaCanvas(plan) -> canvas: R = ink amount, G = draw order (0..1) along the underdrawing */
  function sinopiaCanvas(plan, o = {}) {
    const cw = o.width ?? 2048, ch = Math.round((cw * PH) / PW);
    const cv = newCanvas(cw, ch), x = canvas2d(cv);
    x.fillStyle = "#000"; x.fillRect(0, 0, cw, ch);
    x.lineCap = "round"; x.lineJoin = "round";
    const px = (q) => [((q[0] + PW / 2) / PW) * cw, ((PH / 2 - q[1]) / PH) * ch];
    plan.sinopia.forEach((s, li) => {
      const pts = s.pts, n = pts.length - 1;
      const base = s.region === "guide" ? 3.2 : 5.5 + 2 * hash01(li, 5);
      for (let k = 0; k < n; k++) {
        const ord = s.a + ((s.b - s.a) * (k + 0.5)) / n;
        const a = px(pts[k]), b = px(pts[k + 1]);
        x.strokeStyle = `rgb(255,${Math.round(clamp(ord) * 255)},0)`;
        x.lineWidth = base * (0.8 + 0.4 * hash01(li, k, 9));
        x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
      }
    });
    return cv;
  }
  /** bed(plan) -> Mesh: wet plaster plane; userData.update(reveal 0..1, grout 0..1) */
  function bed(plan, o = {}) {
    const mat = materials.plaster.clone();
    if (mat.bumpMap) mat.bumpMap.repeat.set(PW / 2, PH / 2);
    const tex = new THREE.CanvasTexture(sinopiaCanvas(plan, o));
    tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
    const U = {
      uSino: { value: tex }, uReveal: { value: 0 }, uGrout: { value: 0 },
      uSinoColor: { value: new THREE.Color(P.sinopia) }, uGroutColor: { value: new THREE.Color(P.grout) },
      uPanel: { value: new THREE.Vector2(PW, PH) }, uSoft: { value: spec.grout.soft },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSPos = (modelMatrix * vec4(transformed, 1.0)).xz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSPos;\nuniform sampler2D uSino;\nuniform float uReveal, uGrout, uSoft;\nuniform vec3 uSinoColor, uGroutColor;\nuniform vec2 uPanel;")
        .replace("#include <map_fragment>", `#include <map_fragment>
          vec2 sUv = vec2((vSPos.x + uPanel.x * 0.5) / uPanel.x, (-vSPos.y + uPanel.y * 0.5) / uPanel.y);
          vec4 sino = texture2D(uSino, sUv);
          float ink = sino.r * clamp((uReveal - sino.g) * 40.0, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSinoColor, ink * 0.78);
          float gFront = mix(-uPanel.x * 0.5 - uSoft, uPanel.x * 0.5 + uSoft, uGrout);
          float gAmt = 1.0 - smoothstep(gFront - uSoft, gFront + uSoft, vSPos.x);
          gAmt *= step(0.0001, uGrout);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGroutColor, gAmt);`)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, gAmt);");
    };
    mat.customProgramCacheKey = () => "mosaic-bed-v1";
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0; m.receiveShadow = true; m.name = "bed";
    uploadTexture(stage, tex);
    m.userData.update = (reveal, grout) => { U.uReveal.value = reveal; U.uGrout.value = grout; };
    return m;
  }

  // ---------------------------------------------------------------- tesserae
  const NOM = TL.pitch * (1 - TL.gap);
  /** chipGeometry(seed) -> irregular hand-cut chip: extruded jittered quad, top at y = 0, nominal footprint NOM x NOM */
  function chipGeometry(seed) {
    const r = rng(seed), j = TL.jitter * NOM, h = NOM / 2;
    const shape = new THREE.Shape();
    const c = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [x + r.range(-j, j), y + r.range(-j, j)]);
    shape.moveTo(c[0][0], c[0][1]); for (let k = 1; k < 4; k++) shape.lineTo(c[k][0], c[k][1]); shape.closePath();
    const bev = TL.bevel, depth = Math.max(0.005, TL.thickness - 2 * bev);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 1, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -(depth + bev), 0);
    g.computeVertexNormals();
    return g;
  }
  /**
   * tiles(plan) -> Group of InstancedMeshes (kind x variant); userData.update(t) writes every tile from plan.stateAt(i, t):
   * hidden below the bed, dropping + pressing, or its precomputed REST matrix (bit-identical every frame once set).
   */
  function tiles(plan, o = {}) {
    const g = new THREE.Group(); g.name = "tesserae";
    const mats = [materials.stone, materials.glass, materials.gold];
    const V = TL.variants, n = plan.n;
    const slot = new Int32Array(n), meshOf = new Int32Array(n);
    const groups = [];
    for (let k = 0; k < 3; k++) for (let v = 0; v < V; v++) groups.push([]);
    for (let i = 0; i < n; i++) { const gi = plan.kind[i] * V + (plan.variant[i] % V); meshOf[i] = gi; slot[i] = groups[gi].length; groups[gi].push(i); }
    const meshes = groups.map((list, gi) => {
      const k = Math.floor(gi / V), v = gi % V;
      const m = new THREE.InstancedMesh(chipGeometry((TL.seed ?? 67) * 31 + gi * 7 + 1), mats[k], Math.max(1, list.length));
      m.name = `tesserae-${plan.kinds[k]}-${v}`; m.count = list.length; m.frustumCulled = false;
      m.castShadow = true; m.receiveShadow = true;
      const c = new THREE.Color();
      list.forEach((i, s) => { c.set(plan.color[i]); m.setColorAt(s, c); });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      g.add(m);
      return m;
    });
    // rest matrices
    const restY = TL.protrude;
    const REST = new Float32Array(n * 16), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ");
    const pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const restOf = (i, dy, dyaw, dtilt, s, out, off) => {
      const [X, Z] = toWorld(plan.x[i], plan.y[i]);
      pos.set(X, restY + dy - plan.sink[i] * 0.004, Z);
      e.set(plan.tiltX[i] * (1 + dtilt), plan.yaw[i] + dyaw, plan.tiltZ[i] * (1 + dtilt));
      q.setFromEuler(e);
      sc.set((plan.w[i] / NOM) * s, 1, (plan.h[i] / NOM) * s);
      M.compose(pos, q, sc);
      M.toArray(out, off);
    };
    for (let i = 0; i < n; i++) restOf(i, 0, 0, 0, 1, REST, i * 16);
    const HIDDEN = new THREE.Matrix4().compose(new THREE.Vector3(0, -1, 0), new THREE.Quaternion(), new THREE.Vector3(1e-5, 1e-5, 1e-5)).toArray();
    const tmp = new Float32Array(16);
    g.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        const u = plan.stateAt(i, t), A = meshes[meshOf[i]].instanceMatrix.array, off = slot[i] * 16;
        if (u >= 1) { for (let k = 0; k < 16; k++) A[off + k] = REST[i * 16 + k]; continue; }
        if (u < 0) { for (let k = 0; k < 16; k++) A[off + k] = HIDDEN[k]; continue; }
        const sgn = hash01(i, 13) < 0.5 ? -1 : 1;
        if (u < 0.72) {
          const v = u / 0.72;
          restOf(i, ST.drop * (1 - v * v), sgn * ST.spin * (1 - v), 2.5 * (1 - v), 0.8 + 0.2 * Math.min(1, v * 1.6), tmp, 0);
        } else {
          const v = (u - 0.72) / 0.28;
          restOf(i, -ST.press * Math.sin(Math.PI * v), 0, 0, 1, tmp, 0);
        }
        for (let k = 0; k < 16; k++) A[off + k] = tmp[k];
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    };
    g.userData.update(-1);
    g.userData.meshes = meshes;
    return g;
  }

  // ---------------------------------------------------------------- the travelling low light
  /** sweepLight() -> PointLight; userData.update({ x, level }) moves it along x at spec height/z */
  function sweepLight(o = {}) {
    const S = { ...spec.sweep, ...o };
    const l = new THREE.PointLight(S.color, 0, 0, S.decay);
    l.name = "sweep"; l.castShadow = false;
    l.position.set(-20, S.height, S.z);
    l.userData.update = (sw) => { l.position.set(sw.x, S.height, S.z); l.intensity = S.intensity * sw.level; };
    return l;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (dark plate, gold rule, a tiny tile-cluster icon, cream serif text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.2}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.46);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(0,0,0,0.3)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 10); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2.5; x.beginPath(); x.roundRect(ox + 3, oy + 3, pw - 6, ph - 6, 8); x.stroke();
      // icon: 3 x 3 little tesserae, gold centre
      const cx = ox + pad, cy = oy + (ph - ic) / 2, s = ic / 3;
      const cols = ["#2a7f87", "#c8452e", "#2a7f87", "#c8452e", Q.gem, "#c8452e", "#2a7f87", "#c8452e", "#2a7f87"];
      for (let k = 0; k < 9; k++) { x.fillStyle = cols[k]; x.fillRect(cx + (k % 3) * s + 1.5, cy + Math.floor(k / 3) * s + 1.5, s - 3, s - 3); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * mosaicPanel(plan) -> { group, bed, tiles, light, update(t) } (adds itself to the scene)
   *   update(t): sinopia reveal + grout wipe from the plan, every tile from plan.stateAt, the sweep light from plan.sweepAt.
   */
  function mosaicPanel(plan, o = {}) {
    const group = new THREE.Group(); group.name = "mosaic";
    group.add(bench(o.bench));
    group.add(tray());
    const b = bed(plan, o); group.add(b);
    const tl = tiles(plan, o); group.add(tl);
    const light = sweepLight(o.sweep); group.add(light);
    stage.scene.add(group);
    return {
      group, bed: b, tiles: tl, light,
      update(t) {
        b.userData.update(plan.sinopiaReveal(t), plan.groutAt(t));
        tl.userData.update(t);
        light.userData.update(plan.sweepAt(t));
      },
    };
  }

  const props = { bench, tray, bed, tiles, sweepLight, caption, mosaicPanel, chipGeometry, sinopiaCanvas };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: tessera, motion: tessera, toWorld,
  };
}
