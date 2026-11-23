// styles/thermal-camera/style.js — "Thermal Camera": a handheld thermal imager's view of ordinary objects.
// The look lives in spec.js; WHAT TEMPERATURE every point has lives in heat.js (THREE-free planner shared with SCORE).
// This file turns a heat plan into pictures:
//   - ONE unlit ShaderMaterial for every surface. Each vertex carries its temperature (attribute aTemp, degrees C) written
//     from the plan every frame; the fragment shader lowers it toward the reflected surroundings at grazing angles
//     (emissivity), adds a whisker on up-facing faces, and writes the NORMALISED temperature into the red channel of
//     the HDR target. The render target holds temperature, not colour.
//   - A sensor pass (inserted before tone mapping): gaussian blur (optics), seeded temporal + fixed-pattern noise
//     (hash of sensor cell and frame), a faint pixel grid, then the ironbow palette (sRGB stops -> linear for OutputPass).
//   - Plume puffs: soft transparent billboards that blend temperature (alpha-blending a scalar is exact).
//   - The imager HUD on the overlay (exact colours, crisp): crosshair + spot reading, colour scale + marker, caption,
//     SAMPLE DATA tag. Every canvas is CPU-rasterised (willReadFrequently) and uploaded right after its redraw.
// Props never animate themselves: the scene calls set.update(t) and hud.update(...).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as heat from "./heat.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const VERT = /* glsl */ `
  attribute float aTemp;
  varying float vT; varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * normal;
    vV = cameraPosition - wp.xyz;
    vT = aTemp;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */ `
  uniform float uMin, uMax, uRefl, uEpsG, uEpsP, uTop;
  varying float vT; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = vN / max(length(vN), 1e-6);
    vec3 v = vV / max(length(vV), 1e-6);
    float c = clamp(abs(dot(n, v)), 1e-4, 1.0);
    float eps = mix(uEpsG, 1.0, pow(c, uEpsP));
    float T = vT + uTop * max(n.y, 0.0);
    float Ta = mix(uRefl, T, eps);
    gl_FragColor = vec4((Ta - uMin) / (uMax - uMin), 0.0, 0.0, 1.0);
  }`;
const PUFF_FRAG = /* glsl */ `
  uniform float uU, uAlpha; varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float a = exp(-dot(q, q) * 3.2) * (1.0 - smoothstep(0.85, 1.0, length(q)));
    gl_FragColor = vec4(uU, 0.0, 0.0, a * uAlpha);
  }`;

function sensorShader(spec, width, height) {
  const st = spec.palette.ironbow;
  const N = st.length;
  const stops = st.map(([, h]) => new THREE.Color(h)).map((c) => { const o = {}; c.getRGB(o, THREE.SRGBColorSpace); return new THREE.Vector3(o.r, o.g, o.b); });
  const pos = st.map(([u]) => u);
  return {
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(width, height) },
      uCell: { value: spec.sensor.cell }, uSigma: { value: spec.sensor.blur }, uGrid: { value: spec.sensor.grid },
      uNoise: { value: spec.sensor.noise }, uFixed: { value: spec.sensor.fixed }, uFrame: { value: 0 },
      uStops: { value: stops }, uPos: { value: pos },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      #define NS ${N}
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uCell, uSigma, uGrid, uNoise, uFixed, uFrame;
      uniform vec3 uStops[NS]; uniform float uPos[NS];
      varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main(){
        vec2 px = vUv * uRes;
        float acc = 0.0, ws = 0.0;
        for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
          vec2 o = vec2(float(i), float(j));
          float w = exp(-dot(o, o) / (2.0 * uSigma * uSigma));
          acc += texture2D(tDiffuse, (px + o) / uRes).r * w; ws += w;
        }
        float u = acc / ws;
        vec2 cell = floor(px / uCell);
        u += (h(cell + vec2(uFrame * 17.0, uFrame * 31.0)) - 0.5) * uNoise;
        u += (h(vec2(cell.x, 7.0)) - 0.5) * uFixed;
        u = clamp(u, 0.0, 1.0);
        vec3 col = uStops[0];
        for (int k = 1; k < NS; k++) {
          float f = clamp((u - uPos[k - 1]) / max(uPos[k] - uPos[k - 1], 1e-5), 0.0, 1.0);
          col = mix(col, uStops[k], f);
        }
        vec2 g = fract(px / uCell);
        float grid = max(step(g.x, 0.999 / uCell), step(g.y, 0.999 / uCell));
        col *= 1.0 - uGrid * grid;
        gl_FragColor = vec4(toLin(col), 1.0);
      }`,
  };
}

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const R = spec.range, A = spec.ambient;
  const toU = (T) => (T - R.min) / (R.max - R.min);
  stage.scene.background = new THREE.Color().setRGB(toU(A.reflected), 0, 0, THREE.LinearSRGBColorSpace);

  // ---------------------------------------------------------------- the sensor pass (temperature -> ironbow)
  const sensor = new ShaderPass(sensorShader(spec, stage.width, stage.height));
  if (post) post.insertBefore(sensor, "output", "sensor");
  const sensorFrame = (t) => { sensor.uniforms.uFrame.value = Math.floor(t * spec.sensor.fps + 1e-6) % 4096; };

  // ---------------------------------------------------------------- the one thermal material
  const thermalMat = new THREE.ShaderMaterial({
    uniforms: {
      uMin: { value: R.min }, uMax: { value: R.max }, uRefl: { value: A.reflected },
      uEpsG: { value: spec.emissivity.grazing }, uEpsP: { value: spec.emissivity.power }, uTop: { value: spec.form.top },
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
  thermalMat.name = "thermal";

  /** thermal mesh: geometry (already placed in its parent's frame) + per-vertex temperature from fn(t, s) */
  const entries = [];
  function tmesh(geo, name, temp, sOf) {
    const g = geo.index ? geo : geo; // indexed or not: aTemp is per vertex either way
    const n = g.attributes.position.count;
    const arr = new Float32Array(n);
    const attr = new THREE.BufferAttribute(arr, 1); attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aTemp", attr);
    let s = null;
    if (sOf) {
      s = new Float32Array(n);
      const p = g.attributes.position;
      for (let i = 0; i < n; i++) s[i] = sOf(p.getX(i), p.getY(i), p.getZ(i), i);
    }
    const mesh = new THREE.Mesh(g, thermalMat);
    mesh.name = name;
    let last = NaN;
    const e = {
      mesh,
      update(t) {
        if (!s) { // uniform part: one value
          const T = temp(t, 0);
          if (T === last) return;
          last = T; arr.fill(T); attr.needsUpdate = true; return;
        }
        for (let i = 0; i < n; i++) arr[i] = temp(t, s[i], i);
        attr.needsUpdate = true;
      },
    };
    entries.push(e);
    return mesh;
  }
  const box = (w, h, d, x, y, z, seg = [1, 1, 1]) => new THREE.BoxGeometry(w, h, d, ...seg).translate(x, y, z);
  const dist3 = (ax, ay, az) => (x, y, z) => Math.hypot(x - ax, y - ay, z - az);

  // ---------------------------------------------------------------- the set (one plan)
  /**
   * deskSet(plan) -> { group, hand, puffs, update(t) }  builds wall, floor, desk, PC tower (side open), monitor,
   * keyboard, mug and the hand; adds itself to the scene. update(t) writes every temperature from the plan.
   */
  function deskSet(plan) {
    const S = spec.set, SB = spec.heat.standby;
    const root = new THREE.Group(); root.name = "deskSet";
    const room = A.room;

    // wall + floor (uniform)
    root.add(tmesh(new THREE.PlaneGeometry(S.wall.w, S.wall.h).translate(0, S.floor.y + S.wall.h / 2, S.wall.z), "wall", () => A.wall));
    root.add(tmesh(new THREE.PlaneGeometry(S.floor.size, S.floor.size).rotateX(-Math.PI / 2).translate(0, S.floor.y, 0), "floor", () => A.floor));

    // desk top: fine grid; per-vertex distance to the print outline and to the tower footprint, precomputed once
    const D = S.desk, T0 = S.tower;
    const deskGeo = new THREE.PlaneGeometry(D.w, D.d, D.segX, D.segZ).rotateX(-Math.PI / 2);
    const n = deskGeo.attributes.position.count, dP = new Float32Array(n), dT = new Float32Array(n);
    {
      const p = deskGeo.attributes.position;
      for (let i = 0; i < n; i++) {
        const x = p.getX(i), z = p.getZ(i);
        dP[i] = plan.printSDF(x, z);
        const qx = Math.abs(x - T0.x) - T0.len / 2, qz = Math.abs(z - T0.z) - T0.thick / 2;
        dT[i] = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
      }
    }
    root.add(tmesh(deskGeo, "deskTop", (t, s, i) => plan.desk(dP[i], dT[i], t), () => 0));
    // slab sits 3 mm under the top plane (no z-fighting with the print); its front face is the visible desk edge
    root.add(tmesh(box(D.w, D.t, D.d, 0, -D.t / 2 - 0.003, 0), "deskSlab", () => room - 0.4));

    // ---- PC tower, open side toward +z (the camera); local frame: origin at bottom centre
    const tw = new THREE.Group(); tw.name = "tower"; tw.position.set(T0.x, 0, T0.z); root.add(tw);
    const L = T0.len, H = T0.h, W = T0.thick, wt = T0.wallT, tb = room + SB.tower;
    const shellT = (t, s) => plan.part("shell", s, t, tb);
    const fromTop = (x, y) => Math.max(0, H - y);
    tw.add(tmesh(box(L, wt, W, 0, wt / 2, 0, [6, 1, 4]), "shellBottom", shellT, fromTop));
    tw.add(tmesh(box(L, wt, W, 0, H - wt / 2, 0, [8, 1, 4]), "shellTop", shellT, fromTop));
    tw.add(tmesh(box(L, H, wt, 0, H / 2, -W / 2 + wt / 2, [8, 10, 1]), "shellBack", shellT, fromTop));
    tw.add(tmesh(box(wt, H, W, -L / 2 + wt / 2, H / 2, 0, [1, 10, 4]), "shellRear", shellT, fromTop));
    tw.add(tmesh(box(wt * 1.6, H, W, L / 2 - wt * 0.8, H / 2, 0, [1, 10, 4]), "shellFront", shellT, fromTop));
    // the open side's rim: a thin frame so the opening reads as a case edge
    tw.add(tmesh(box(L, 0.016, 0.006, 0, H - 0.008, W / 2 - 0.003), "rimTop", shellT, fromTop));
    tw.add(tmesh(box(L, 0.016, 0.006, 0, 0.008, W / 2 - 0.003), "rimBottom", shellT, fromTop));
    // motherboard on the inside of the back panel
    const TP = heat.towerPoints(T0);
    const bz = TP.bz, [cx, cy] = T0.cpu;
    tw.add(tmesh(new THREE.PlaneGeometry(L - 0.04, H - 0.04, 44, 46).translate(0, H / 2, bz), "board",
      (t, s) => plan.part("board", s, t, tb), (x, y) => Math.hypot(x - cx, y - cy)));
    // CPU cooler: base block on the CPU, heat pipes, a vertical stack of horizontal fins sticking out toward the opening
    const baseZ = TP.base[2];
    const sB = dist3(...TP.base);
    tw.add(tmesh(box(0.064, 0.056, 0.03, cx, cy, baseZ, [4, 4, 2]), "sinkBase", (t, s) => plan.part("sinkBase", s, t, tb), sB));
    const fins = [];
    const FN = 12, f0 = cy - 0.085, f1 = cy + 0.1;
    for (let k = 0; k < FN; k++) fins.push(box(0.13, 0.0042, 0.13, cx, f0 + (k / (FN - 1)) * (f1 - f0), baseZ + 0.08, [6, 1, 6]));
    for (const ox of [-0.034, -0.012, 0.012, 0.034]) fins.push(new THREE.CylinderGeometry(0.0045, 0.0045, f1 - f0 + 0.02, 8, 12).translate(cx + ox, (f0 + f1) / 2, baseZ + 0.05));
    tw.add(tmesh(mergeGeometries(fins), "sink", (t, s) => plan.part("sink", s, t, tb), sB));
    // GPU card below the CPU (die near its middle)
    const [gx, gy, gz] = TP.gpu;
    tw.add(tmesh(box(0.31, 0.032, 0.115, -0.015, gy, gz, [30, 2, 12]), "gpu", (t, s) => plan.part("gpu", s, t, tb), dist3(gx, gy, gz)));
    // PSU at the bottom rear
    tw.add(tmesh(box(0.16, 0.085, W - 0.03, -L / 2 + 0.095, wt + 0.045, 0, [4, 3, 4]), "psu", (t, s) => plan.part("psu", s, t, tb), dist3(-L / 2 + 0.1, 0.05, 0)));
    // exhaust fan on the top panel (ring, hub, blades)
    const fx = cx, fz = 0.0;
    const fanParts = [new THREE.TorusGeometry(0.058, 0.007, 8, 32).rotateX(Math.PI / 2).translate(fx, H + 0.006, fz),
      new THREE.CylinderGeometry(0.018, 0.018, 0.01, 20).translate(fx, H + 0.005, fz)];
    for (let k = 0; k < 6; k++) fanParts.push(new THREE.BoxGeometry(0.048, 0.004, 0.016).translate(0.034, 0, 0).rotateZ(0.25).rotateY((k / 6) * Math.PI * 2).translate(fx, H + 0.006, fz));
    tw.add(tmesh(mergeGeometries(fanParts.map((g) => g.toNonIndexed())), "fan", (t) => plan.part("fan", 0, t, tb)));

    // ---- monitor
    const M = S.monitor, mon = new THREE.Group(); mon.name = "monitor"; mon.position.set(M.x, 0, M.z); root.add(mon);
    const mb = room + SB.monitor;
    const backT = (t) => plan.part("monitorBack", 0, t, mb);
    mon.add(tmesh(box(0.24, 0.012, 0.16, 0, 0.006, 0.0), "monitorBase", (t) => room + 0.2));
    mon.add(tmesh(box(0.055, M.lift + 0.1, 0.025, 0, (M.lift + 0.1) / 2, -0.04), "monitorNeck", backT));
    mon.add(tmesh(box(M.w, M.h, M.t, 0, M.lift + M.h / 2, 0, [12, 8, 1]), "monitorBezel", backT));
    mon.add(tmesh(box(M.w * 0.55, M.h * 0.6, 0.04, 0, M.lift + M.h * 0.52, -M.t / 2 - 0.02, [4, 4, 1]), "monitorBack", backT));
    const sw = M.w - 0.03, sh = M.h - 0.03, sy0 = M.lift + 0.015;
    mon.add(tmesh(new THREE.PlaneGeometry(sw, sh, 40, 24).translate(0, M.lift + M.h / 2, M.t / 2 + 0.0015), "screen",
      (t, s) => plan.part("screen", s, t, mb), (x, y) => Math.max(0, y - sy0) + 0.25 * Math.abs(x) ));

    // ---- keyboard
    const K = S.keyboard, kb = room + SB.keyboard;
    const keyGeos = [new RoundedBoxGeometry(K.w, K.h, K.d, 2, 0.006).translate(0, K.h / 2, 0)];
    const kw = (K.w - 0.02) / K.cols, kd = (K.d - 0.02) / K.rows;
    for (let r = 0; r < K.rows; r++) for (let c = 0; c < K.cols; c++) {
      if (r === K.rows - 1 && c > 3 && c < 10) { if (c === 4) keyGeos.push(new THREE.BoxGeometry(kw * 6 - 0.004, 0.008, kd - 0.004).translate(-K.w / 2 + 0.01 + kw * 7, K.h + 0.004, -K.d / 2 + 0.01 + kd * (r + 0.5))); continue; }
      keyGeos.push(new THREE.BoxGeometry(kw - 0.004, 0.008, kd - 0.004).translate(-K.w / 2 + 0.01 + kw * (c + 0.5), K.h + 0.004, -K.d / 2 + 0.01 + kd * (r + 0.5)));
    }
    const kbMesh = tmesh(mergeGeometries(keyGeos.map((g) => (g.index ? g.toNonIndexed() : g))), "keyboard", (t) => plan.part("keyboard", 0, t, kb));
    kbMesh.position.set(K.x, 0, K.z); root.add(kbMesh);

    // ---- mug (room temperature: an empty mug)
    const G = S.mug, wallW = 0.006;
    const prof = [[0, 0], [G.r, 0], [G.r, G.h], [G.r - wallW, G.h], [G.r - wallW, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y));
    const mugGeo = mergeGeometries([
      new THREE.LatheGeometry(prof, 36).toNonIndexed(),
      new THREE.TorusGeometry(0.03, 0.0075, 8, 18, Math.PI).rotateZ(-Math.PI / 2).translate(G.r, G.h * 0.52, 0).toNonIndexed(),
    ]);
    const mug = tmesh(mugGeo, "mug", () => room + SB.mug);
    mug.position.set(G.x, 0, G.z); mug.rotation.y = -0.5; root.add(mug);

    // ---- the hand (same outline the print uses)
    const shape = plan.shape, hand = new THREE.Group(); hand.name = "hand";
    const pm = shape.palm, HS = spec.hand;
    const ht = plan.handTemp(0);
    hand.add(tmesh(new RoundedBoxGeometry(pm.w, pm.t, pm.l, 3, pm.r), "palm", () => ht.palm));
    const up = new THREE.Vector3(0, 1, 0);
    const capsule = (a, b, r, y) => {
      const ax = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), len = ax.length();
      const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 10);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, ax.normalize()));
      return g.translate((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    };
    hand.add(tmesh(mergeGeometries([...shape.fingers, shape.thumb].map((f) => capsule(f.a, f.b, f.r, -pm.t / 2 + f.r))), "fingers", () => ht.fingers));
    {
      const ar = HS.arm.r * HS.scale, al = HS.arm.len, rise = HS.arm.rise;
      const dir = new THREE.Vector3(0, Math.sin(rise), Math.cos(rise));
      const g = new THREE.CapsuleGeometry(ar, al, 4, 12);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      const c = new THREE.Vector3(0, 0, pm.l / 2 - ar * 0.6).addScaledVector(dir, al / 2);
      g.translate(c.x, c.y, c.z);
      hand.add(tmesh(g, "arm", () => ht.arm));
    }
    hand.rotation.y = plan.yaw;
    root.add(hand);

    // ---- plume puffs (transparent billboards that blend temperature)
    const puffGeo = new THREE.PlaneGeometry(1, 1);
    const puffs = [];
    for (let i = 0; i < spec.heat.plume.puffs; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.ShaderMaterial({
        uniforms: { uU: { value: 0 }, uAlpha: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: PUFF_FRAG, transparent: true, depthWrite: false,
      }));
      m.name = `puff${i}`; m.visible = false; m.renderOrder = 3;
      puffs.push(m); root.add(m);
    }

    stage.scene.add(root);
    return {
      group: root, hand, puffs,
      update(t) {
        sensorFrame(t);
        for (const e of entries) e.update(t);
        const hp = plan.handPose(t);
        hand.visible = hp.visible;
        hand.position.set(hp.pos[0], hp.pos[1], hp.pos[2]);
        // billboards face the camera: call AFTER rig.update(t)
        const list = plan.puffs(t);
        for (const m of puffs) m.visible = false;
        for (const p of list) {
          const m = puffs[p.i];
          m.visible = p.alpha > 0.002;
          m.position.set(p.x, p.y, p.z);
          m.quaternion.copy(stage.camera.quaternion);
          m.scale.setScalar(p.size);
          m.material.uniforms.uU.value = toU(p.T);
          m.material.uniforms.uAlpha.value = p.alpha;
        }
      },
    };
  }

  // ---------------------------------------------------------------- imager HUD (overlay)
  const HUD = spec.hud;
  const hex = (rgb) => "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  const fmt = (T) => (T == null ? "--.-" : T.toFixed(1));
  const CAN = { upload: true, willReadFrequently: true };

  /** static frame: corner brackets, colour scale bar with max/min, SAMPLE DATA tag, info line (drawn once) */
  function hudFrame() {
    const W = stage.width, Hh = stage.height;
    const m = screenCanvas(stage, W, Hh, (x) => {
      // viewfinder corner brackets (inside the safe area)
      x.strokeStyle = "rgba(244,241,234,0.75)"; x.lineWidth = 3; x.lineCap = "square";
      const bx0 = 100, by0 = 60, bx1 = W - 100, by1 = Hh - 60, k = 44;
      for (const [cx, cy, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
        x.beginPath(); x.moveTo(cx, cy + sy * k); x.lineTo(cx, cy); x.lineTo(cx + sx * k, cy); x.stroke();
      }
      // scale bar
      const B = HUD.bar;
      x.fillStyle = "rgba(10,6,20,0.55)"; x.beginPath(); x.roundRect(B.x - 132, B.y - 64, B.w + 152, B.h + 128, 12); x.fill();
      for (let py = 0; py < B.h; py++) { x.fillStyle = hex(heat.ironbow(P.ironbow, 1 - py / (B.h - 1))); x.fillRect(B.x, B.y + py, B.w, 1); }
      x.strokeStyle = "rgba(244,241,234,0.85)"; x.lineWidth = 2; x.strokeRect(B.x - 1, B.y - 1, B.w + 2, B.h + 2);
      x.fillStyle = P.hud; x.font = `700 26px ${HUD.font}`; x.textAlign = "right"; x.textBaseline = "middle";
      x.fillText(spec.range.max.toFixed(1), B.x - 36, B.y + 12);
      x.fillText(spec.range.min.toFixed(1), B.x - 36, B.y + B.h - 12);
      x.font = `600 22px ${HUD.font}`; x.fillStyle = P.hudDim; x.textAlign = "center";
      x.fillText("°C", B.x + B.w / 2, B.y - 34);
      x.fillText("MAX", B.x - 68, B.y - 16); x.fillText("MIN", B.x - 68, B.y + B.h + 16);
      // SAMPLE DATA tag (top-right, always on: every reading is invented)
      const Tg = HUD.tag;
      x.font = `800 ${Tg.cap}px ${HUD.uiFont}`; x.letterSpacing = "2px";
      const tw = Math.round(x.measureText(Tg.text).width), pw = tw + 40;
      x.fillStyle = P.amber; x.beginPath(); x.roundRect(Tg.x - pw, Tg.y, pw, Tg.h, 9); x.fill();
      x.fillStyle = "#1a1206"; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(Tg.text, Tg.x - pw + 20, Tg.y + Tg.h / 2 + 1);
      x.letterSpacing = "0px";
      // info line (bottom-left)
      const I = HUD.info;
      x.font = `600 ${I.cap}px ${HUD.font}`; x.fillStyle = P.hudDim; x.textAlign = "left"; x.textBaseline = "middle";
      x.fillText(I.text, I.x, I.y);
    }, CAN);
    m.userData.place(0, 0);
    m.userData.set({ v: 1 });
    m.userData.opacity(1);
    return m;
  }

  /** crosshair at the frame centre + spot reading; userData.show(T|null) */
  function crosshair() {
    const C = HUD.cross, Wc = 560, Hc = 220, ox = 110, oy = 110;
    const m = screenCanvas(stage, Wc, Hc, (x, W, Hh, st) => {
      const seg = (x0, y0, x1, y1) => {
        x.lineCap = "round";
        x.strokeStyle = "rgba(0,0,0,0.6)"; x.lineWidth = C.line + 3; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
        x.strokeStyle = P.hud; x.lineWidth = C.line; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      };
      const s = C.size, g = C.gap;
      seg(ox - s, oy, ox - g, oy); seg(ox + g, oy, ox + s, oy); seg(ox, oy - s, ox, oy - g); seg(ox, oy + g, ox, oy + s);
      x.strokeStyle = "rgba(0,0,0,0.6)"; x.lineWidth = 5; x.beginPath(); x.arc(ox, oy, 4, 0, Math.PI * 2); x.stroke();
      x.fillStyle = P.hud; x.beginPath(); x.arc(ox, oy, 3, 0, Math.PI * 2); x.fill();
      // reading box
      const bx = ox + 40, by = oy + 26, bw = 300, bh = 64;
      x.fillStyle = P.plate; x.beginPath(); x.roundRect(bx, by, bw, bh, 10); x.fill();
      x.strokeStyle = P.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(bx + 1, by + 1, bw - 2, bh - 2, 9); x.stroke();
      x.font = `700 20px ${HUD.font}`; x.fillStyle = P.hudDim; x.textAlign = "left"; x.textBaseline = "middle";
      x.fillText("SP1", bx + 16, by + bh / 2 + 1);
      x.font = `700 36px ${HUD.font}`; x.fillStyle = P.hud; x.textAlign = "right";
      x.fillText(`${st.v} °C`, bx + bw - 16, by + bh / 2 + 2);
    }, CAN);
    m.userData.place(stage.width / 2 - ox, stage.height / 2 - oy);
    m.userData.show = (T) => { m.userData.set({ v: fmt(T) }); m.userData.opacity(1); };
    return m;
  }

  /** marker beside the scale bar at the spot temperature; userData.show(T|null) */
  function barMarker() {
    const B = HUD.bar, Wm = 44, Hm = B.h + 40;
    const m = screenCanvas(stage, Wm, Hm, (x, W, Hh, st) => {
      if (st.y == null) return;
      const y = st.y + 20;
      x.fillStyle = "rgba(0,0,0,0.6)"; x.beginPath(); x.moveTo(W - 2, y); x.lineTo(W - 26, y - 14); x.lineTo(W - 26, y + 14); x.closePath(); x.fill();
      x.fillStyle = P.hud; x.beginPath(); x.moveTo(W - 5, y); x.lineTo(W - 24, y - 11); x.lineTo(W - 24, y + 11); x.closePath(); x.fill();
    }, CAN);
    m.userData.place(B.x - Wm - 2, B.y - 20);
    m.userData.show = (T) => {
      const y = T == null ? null : Math.round((1 - Math.min(1, Math.max(0, toU(T)))) * (B.h - 1));
      m.userData.set({ y }); m.userData.opacity(T == null ? 0 : 1);
    };
    return m;
  }

  /** beat caption chip (top-left); userData.show(text, alpha) */
  function caption() {
    const Q = HUD.caption, Wp = 1060, Hp = Q.h + 20;
    const m = screenCanvas(stage, Wp, Hp, (x, W, Hh, st) => {
      if (!st.text) return;
      x.font = `700 ${Q.cap}px ${HUD.uiFont}`;
      const tw = Math.round(x.measureText(st.text).width), pad = 28, dot = 14;
      const pw = Math.min(W - 12, pad + dot + 18 + tw + pad), ph = Q.h;
      x.fillStyle = P.plate; x.beginPath(); x.roundRect(4, 4, pw, ph, 12); x.fill();
      x.strokeStyle = P.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(5, 5, pw - 2, ph - 2, 11); x.stroke();
      // a small record dot in the hottest palette colour
      x.fillStyle = P.ironbow[P.ironbow.length - 2][1]; x.beginPath(); x.arc(4 + pad + dot / 2, 4 + ph / 2, dot / 2, 0, Math.PI * 2); x.fill();
      x.fillStyle = P.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, 4 + pad + dot + 18, 4 + ph / 2 + 2);
    }, CAN);
    m.userData.place(Q.x, Q.y);
    m.userData.show = (text, a) => { m.userData.set({ text }); m.userData.opacity(a); };
    return m;
  }

  /** the whole HUD: update(T, captionText, captionAlpha) */
  function hud() {
    const frame = hudFrame(), cross = crosshair(), marker = barMarker(), cap = caption();
    return {
      frame, cross, marker, caption: cap,
      update(T, text, a) { cross.userData.show(T); marker.userData.show(T); cap.userData.show(text, a); },
    };
  }

  const props = { deskSet, hud, hudFrame, crosshair, barMarker, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    thermalMat, sensor, plan: heat, motion: heat,
  };
}
