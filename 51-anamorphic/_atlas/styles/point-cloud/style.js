// styles/point-cloud/style.js — "Point Cloud Scan (LiDAR)": a world made only of measured dots on near-black.
// The look lives in spec.js; WHICH dots exist, WHERE and WHEN lives in scan.js (THREE-free planner shared with SCORE).
// This file turns a scan into pictures: one THREE.Points per scan (dots sorted by reveal time, so drawRange = the dots
// measured so far; a shader sizes each dot by its range x angular step, colours it by range on a cyan -> yellow ->
// magenta ramp shaded by return intensity, and flashes it white on its first frames), a laser fan (additive lines from
// the laser origin to the current column's hits), a scanner head on a tripod (the only solid thing in the frame), and a
// caption chip + live dot counter on the overlay. Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { clamp } from "../../kit/time.js";
import * as scanPlanner from "./scan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const DOT_VS = /* glsl */ `
attribute float aReveal;
attribute float aRange;
attribute float aInten;
uniform float uTime, uScale, uMinPx, uMaxPx, uStep, uSplat;
varying float vRange, vInten, vAge;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.01);
  gl_PointSize = clamp(aRange * uStep * uSplat * uScale / depth, uMinPx, uMaxPx);
  vRange = aRange; vInten = aInten; vAge = uTime - aReveal;
}`;
const DOT_FS = /* glsl */ `
uniform vec3 uNear, uMid, uFar, uFlash;
uniform float uRampNear, uRampFar, uShade0, uShade1, uFlashDur, uFlashGain, uLevel;
varying float vRange, vInten, vAge;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  if (dot(q, q) > 1.0) discard;
  float u = clamp((vRange - uRampNear) / max(uRampFar - uRampNear, 1e-3), 0.0, 1.0);
  vec3 c = u < 0.5 ? mix(uNear, uMid, u * 2.0) : mix(uMid, uFar, u * 2.0 - 1.0);
  c *= mix(uShade0, uShade1, clamp(vInten, 0.0, 1.0));
  float f = 1.0 - smoothstep(0.0, uFlashDur, max(vAge, 0.0));
  c = mix(c, uFlash * uFlashGain, f * f);
  gl_FragColor = vec4(c * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const DT = spec.dots, SC = spec.scan;
  const angStep = Math.max((Math.PI * 2) / SC.nAz, (SC.elMax - SC.elMin) / (SC.nEl - 1));

  // ---------------------------------------------------------------- the cloud: one Points per scan
  /**
   * cloud(scan, { splat, level }) -> THREE.Points. userData.update(t): drawRange = dots revealed by t (dots are sorted
   *   by reveal), uniforms from t and the current camera; userData.setLevel(k) dims the whole scan.
   */
  function cloud(scan, o = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(scan.pos, 3));
    g.setAttribute("aReveal", new THREE.BufferAttribute(scan.reveal, 1));
    g.setAttribute("aRange", new THREE.BufferAttribute(scan.range, 1));
    g.setAttribute("aInten", new THREE.BufferAttribute(scan.inten, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...scan.origin), 60);
    const mat = new THREE.ShaderMaterial({
      vertexShader: DOT_VS, fragmentShader: DOT_FS,
      uniforms: {
        uTime: { value: 0 }, uScale: { value: 1 }, uMinPx: { value: DT.minPx }, uMaxPx: { value: DT.maxPx },
        uStep: { value: angStep }, uSplat: { value: o.splat ?? DT.splat },
        uNear: { value: new THREE.Color(P.near) }, uMid: { value: new THREE.Color(P.mid) }, uFar: { value: new THREE.Color(P.far) },
        uFlash: { value: new THREE.Color(P.flash) }, uRampNear: { value: DT.ramp.near }, uRampFar: { value: DT.ramp.far },
        uShade0: { value: DT.shade[0] }, uShade1: { value: DT.shade[1] }, uFlashDur: { value: DT.flash.dur }, uFlashGain: { value: DT.flash.gain },
        uLevel: { value: o.level ?? 1 },
      },
    });
    mat.name = `dots-${scan.id}`;
    const pts = new THREE.Points(g, mat);
    pts.name = `cloud-${scan.id}`;
    pts.frustumCulled = false;
    pts.userData.update = (t) => {
      const cam = stage.camera;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uScale.value = stage.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      g.setDrawRange(0, scan.countAt(t));
    };
    pts.userData.setSplat = (k) => { mat.uniforms.uSplat.value = k; };
    pts.userData.setLevel = (k) => { mat.uniforms.uLevel.value = k; };
    pts.userData.update(0);
    return pts;
  }

  // ---------------------------------------------------------------- the laser fan
  /**
   * laserFan(scan, { every, opacity }) -> Group (additive). userData.update(t): lines from the laser origin to every
   *   `every`-th hit of the column being measured at t, plus a brighter line along that column's hits; hidden outside
   *   the sweep. Rewritten from t each frame.
   */
  function laserFan(scan, o = {}) {
    const L = spec.laser, every = o.every ?? L.every;
    let maxCol = 0;
    for (let i = 0; i < scan.nAz; i++) maxCol = Math.max(maxCol, scan.col[i + 1] - scan.col[i]);
    const nFan = Math.ceil(maxCol / every) + 1;
    const fanPos = new Float32Array(nFan * 6), corePos = new Float32Array(maxCol * 3 + 3);
    const fanG = new THREE.BufferGeometry(); fanG.setAttribute("position", new THREE.BufferAttribute(fanPos, 3).setUsage(THREE.DynamicDrawUsage));
    const coreG = new THREE.BufferGeometry(); coreG.setAttribute("position", new THREE.BufferAttribute(corePos, 3).setUsage(THREE.DynamicDrawUsage));
    const col = new THREE.Color(P.laser);
    const fanM = new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: o.opacity ?? L.opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreM = new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.2), transparent: true, opacity: L.coreOpacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const fan = new THREE.LineSegments(fanG, fanM), core = new THREE.Line(coreG, coreM);
    fan.frustumCulled = core.frustumCulled = false;
    fan.renderOrder = core.renderOrder = 3;
    const grp = new THREE.Group(); grp.name = `laser-${scan.id}`; grp.add(fan, core);
    const O = scan.origin, S = scan.pos;
    grp.userData.update = (t) => {
      const c = scan.columnAt(t);
      grp.visible = c >= 0 && scan.col[c + 1] > scan.col[c];
      if (!grp.visible) return;
      const a = scan.col[c], b = scan.col[c + 1];
      let k = 0;
      for (let i = a; i < b; i += every) {
        fanPos.set(O, k * 6); fanPos[k * 6 + 3] = S[i * 3]; fanPos[k * 6 + 4] = S[i * 3 + 1]; fanPos[k * 6 + 5] = S[i * 3 + 2]; k++;
      }
      fanG.setDrawRange(0, k * 2); fanG.attributes.position.needsUpdate = true;
      corePos.set(S.subarray(a * 3, b * 3), 0);
      coreG.setDrawRange(0, b - a); coreG.attributes.position.needsUpdate = true;
    };
    grp.userData.update(-1);
    return grp;
  }

  // ---------------------------------------------------------------- the scanner on its tripod
  /**
   * scanner(scan, { height }) -> Group at the scan origin (laser at the origin). userData.update(t): head yaw follows
   *   the sweep (scan.headAz), the mirror drum spins while sweeping; userData.setShow(k) scales it in (0..1).
   */
  function scanner(scan, o = {}) {
    const T = spec.tripod, H = o.height ?? T.height;
    const root = new THREE.Group(); root.name = `scanner-${scan.id}`;
    root.position.set(scan.origin[0], scan.origin[1] - H, scan.origin[2]);   // root sits on the floor
    const body = new THREE.Group(); root.add(body);
    const apex = H - T.head[1] * 0.5 - 0.06;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3, foot = new THREE.Vector3(Math.sin(a) * T.legSpread, 0, Math.cos(a) * T.legSpread);
      const top = new THREE.Vector3(Math.sin(a) * 0.05, apex, Math.cos(a) * 0.05);
      const len = foot.distanceTo(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(T.legR, T.legR * 0.8, len, 8), materials.tripod);
      leg.position.copy(foot).add(top).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      body.add(leg);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 16), materials.tripod);
    hub.position.y = apex; body.add(hub);
    const head = new THREE.Group(); head.position.y = H; body.add(head);
    const [hw, hh, hd] = T.head;
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(hw, hh * 0.55, hd), materials.head);
    yoke.position.y = -hh * 0.2; head.add(yoke);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(hw * 0.55, hw * 0.6, 0.05, 24), materials.headTrim);
    base.position.y = -hh * 0.5 - 0.02; head.add(base);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, hh * 0.7, hd * 0.9), materials.head);
      arm.position.set(sx * (hw / 2 - 0.015), hh * 0.25, 0); head.add(arm);
    }
    const drum = new THREE.Group(); drum.position.y = 0.0; head.add(drum);
    const drumMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, hw - 0.07, 24), materials.headTrim);
    drumMesh.rotation.z = Math.PI / 2; drum.add(drumMesh);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.08, 0.018, 0.02), materials.lens);
    lens.position.z = 0.052; drum.add(lens);
    root.userData.update = (t) => {
      head.rotation.y = scan.headAz(t);
      const sweeping = t >= scan.t0 - 0.5 && t <= scan.t1 + 0.3;
      drum.rotation.x = sweeping ? (t * 37) % (Math.PI * 2) : 0;
    };
    root.userData.setShow = (k) => {
      const s = clamp(k);
      root.visible = s > 0.001;
      root.scale.setScalar(Math.max(0.001, s));
    };
    root.userData.update(0);
    return root;
  }

  // ---------------------------------------------------------------- overlay: caption chip + dot counter
  /** caption() -> overlay chip (dark plate, a three-dot range-ramp icon, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.42);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.5)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      const cx = ox + pad, cy = oy + Math.round(ph / 2), cols = [P.near, P.mid, P.far];
      for (let k = 0; k < 3; k++) { x.fillStyle = cols[k]; x.beginPath(); x.arc(cx + (k + 0.5) * (ic / 3), cy, ic * 0.13, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, cx + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** counter() -> overlay readout "DOTS MEASURED 123,456" (the real number of dots drawn); userData.show(n, alpha) */
  function counter(o = {}) {
    const Q = { ...spec.counter, ...o };
    const Wp = 640, Hp = Q.h + 12;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (st.n == null) return;
      const label = "DOTS MEASURED", num = String(st.n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      x.font = `700 ${Q.cap}px ${spec.caption.font}`; x.letterSpacing = "2px";
      const lw = Math.round(x.measureText(label).width);
      x.font = `700 ${Math.round(Q.cap * 1.25)}px ui-monospace, Menlo, monospace`; x.letterSpacing = "0px";
      const nw = Math.round(x.measureText(num).width);
      const pad = 18, pw = pad + lw + 16 + nw + pad, ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = Q.plate; x.globalAlpha = 0.85; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill(); x.globalAlpha = 1;
      x.textBaseline = "middle"; x.textAlign = "left";
      x.font = `700 ${Q.cap}px ${spec.caption.font}`; x.letterSpacing = "2px"; x.fillStyle = Q.ink;
      x.fillText(label, ox + pad, oy + ph / 2 + 1);
      x.font = `700 ${Math.round(Q.cap * 1.25)}px ui-monospace, Menlo, monospace`; x.letterSpacing = "0px"; x.fillStyle = Q.hi;
      x.fillText(num, ox + pad + lw + 16, oy + ph / 2 + 1);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (n, a) => { mesh.userData.set({ n: a > 0.003 ? n : null }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** scanScene(plan) -> { clouds, lasers, scanners, update(t) } (adds itself to the scene) */
  function scanScene(plan, o = {}) {
    const group = new THREE.Group(); group.name = "pointCloud";
    const clouds = plan.scans.map((s) => cloud(s, o));
    const lasers = plan.scans.map((s) => laserFan(s, o));
    const scanners = plan.scans.map((s) => scanner(s, o));
    group.add(...clouds, ...lasers, ...scanners);
    stage.scene.add(group);
    return {
      group, clouds, lasers, scanners,
      update(t) { for (const c of clouds) c.userData.update(t); for (const l of lasers) l.userData.update(t); for (const s of scanners) s.userData.update(t); },
    };
  }

  const props = { cloud, laserFan, scanner, caption, counter, scanScene };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: scanPlanner, motion: scanPlanner,
  };
}
