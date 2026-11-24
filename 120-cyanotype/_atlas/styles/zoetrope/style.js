// styles/zoetrope/style.js — "3D Zoetrope": a bright toy turntable carrying rings of sculptures, one pose per station.
// The look lives in spec.js; WHEN the disc is where, and what the strobe does, lives in zoetrope.js (THREE-free planner
// shared with SCORE). This file builds the pictures:
//   * every station is a FIXED sculpture of one pose (geometry baked once and merged per ring + material: a handful of
//     draw calls for 48 sculptures); only the disc group's rotation changes with t;
//   * continuous-light motion blur = an accumulation pass (inserted before tone mapping) that re-renders the scene at the
//     planner's sub-frame disc angles and averages them (deterministic: no history, no rAF);
//   * lighting(t) darkens the room and raises the strobe lamp from the plan's strobe windows;
//   * a caption chip on the overlay (exact colours; light by day, dark under the strobe).
// Props never animate themselves: the scene calls update(t) / setAngles(angles).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { createCyclorama } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas } from "../../kit/canvas.js";
import { lerp } from "../../kit/time.js";
import * as zoe from "./zoetrope.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

/** a geometry bucket: add(geo, pos, rotEuler, scale) bakes the transform; merged() -> one geometry */
function bucket() {
  const list = [];
  return {
    add(geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], parent = null) {
      const g = geo.clone();
      _e.set(rot[0], rot[1], rot[2], "XYZ"); _q.setFromEuler(_e);
      _m.compose(_p.set(...pos), _q, _s.set(...scl));
      if (parent) _m.premultiply(parent);
      g.applyMatrix4(_m);
      list.push(g);
    },
    merged() { return list.length ? mergeGeometries(list, false) : null; },
  };
}

/**
 * Accumulation pass: averages the incoming render (disc at angles[0]) with re-renders at angles[1..K-1].
 * Linear HDR (inserted before the output pass), so the blur is a true exposure average.
 */
class AccumBlurPass extends Pass {
  constructor(stage, setAngle, width, height) {
    super();
    this.stage = stage; this.setAngle = setAngle; this.angles = [0];
    this.temp = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    this.accum = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
    const vs = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const fs = `uniform sampler2D tDiffuse; uniform float uW; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * uW, 1.0); }`;
    this.copy = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uW: { value: 1 } }, vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.add = this.copy.clone();
    this.add.blending = THREE.CustomBlending;
    this.add.blendEquation = THREE.AddEquation; this.add.blendSrc = THREE.OneFactor; this.add.blendDst = THREE.OneFactor;
    this.add.blendSrcAlpha = THREE.ZeroFactor; this.add.blendDstAlpha = THREE.OneFactor;
    this.add.transparent = true;
    this.quad = new FullScreenQuad(this.copy);
    this.needsSwap = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const A = this.angles, K = A.length, w = 1 / K;
    const keepAuto = renderer.autoClear;
    // sample 0 (already rendered) -> accum
    this.quad.material = this.copy;
    this.copy.uniforms.tDiffuse.value = readBuffer.texture; this.copy.uniforms.uW.value = K > 1 ? w : 1;
    renderer.setRenderTarget(K > 1 ? this.accum : (this.renderToScreen ? null : writeBuffer));
    renderer.autoClear = true;
    this.quad.render(renderer);
    if (K > 1) {
      for (let j = 1; j < K; j++) {
        this.setAngle(A[j]);
        renderer.setRenderTarget(this.temp);
        renderer.autoClear = true;
        renderer.render(this.stage.scene, this.stage.camera);
        renderer.setRenderTarget(this.accum);
        renderer.autoClear = false;
        this.quad.material = this.add;
        this.add.uniforms.tDiffuse.value = this.temp.texture; this.add.uniforms.uW.value = w;
        this.quad.render(renderer);
      }
      this.setAngle(A[0]);
      renderer.autoClear = true;
      this.quad.material = this.copy;
      this.copy.uniforms.tDiffuse.value = this.accum.texture; this.copy.uniforms.uW.value = 1;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
    }
    renderer.autoClear = keepAuto;
  }
}

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const T = spec.table;
  const platterTop = T.baseH + T.platterH, tierTop = platterTop + T.tierH;

  // ---------------------------------------------------------------- set
  /** sweep() -> cream cyclorama behind and under the turntable */
  function sweep(o = {}) {
    const m = createCyclorama({ width: o.width ?? 40, depth: o.depth ?? 22, height: o.height ?? 14, radius: o.radius ?? 5, material: materials.sweep });
    m.position.z = o.z ?? -2;
    return m;
  }

  // ---------------------------------------------------------------- printed platter top + edge band (canvas textures)
  function platterTopTexture(N, rings) {
    const S = 1024, c = newCanvas(S, S), x = c.getContext("2d");
    x.fillStyle = P.platter; x.fillRect(0, 0, S, S);
    const R = T.platterR, px = (S / 2) / R;
    const at = (r, a) => [S / 2 + Math.sin(a) * r * px, S / 2 + Math.cos(a) * r * px];
    x.strokeStyle = "#e6dccb"; x.lineWidth = 3;
    for (const r of [R - 0.06, R - 0.1, ...rings.filter((g) => g.tier === "platter").map((g) => g.radius)]) {
      x.beginPath(); x.arc(S / 2, S / 2, r * px, 0, Math.PI * 2); x.stroke();
    }
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const [x0, y0] = at(R - 0.03, a), [x1, y1] = at(R - 0.16, a);
      x.strokeStyle = P.stripes[k % P.stripes.length]; x.lineWidth = 7; x.lineCap = "round";
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }
  function stripeTexture(N) {
    const W = 1024, H = 32, c = newCanvas(W, H), x = c.getContext("2d");
    for (let k = 0; k <= N; k++) {
      x.fillStyle = P.stripes[k % P.stripes.length];
      const u0 = ((k - 0.5) / N) * W;
      x.fillRect(Math.floor(u0), 0, Math.ceil(W / N) + 1, H);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------------------------------------------------------------- sculptures (one fixed pose per station)
  const G = {
    sphere: new THREE.SphereGeometry(1, 28, 18),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 20, 1),
    pot: new THREE.CylinderGeometry(1, 0.74, 1, 24, 1),
    rim: new THREE.TorusGeometry(1, 0.12, 10, 28),
    disc: new THREE.CylinderGeometry(1, 1, 1, 24, 1),
  };
  /** flower station geometry into buckets (pot at local origin on the surface) */
  function addFlower(B, p, base, o = {}) {
    const F = { ...spec.flower, ...o };
    const q = zoe.flowerPose(p, { height: o.height ?? 0.34 });
    const s = o.scale ?? 1;
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(...base.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, base.yaw, 0)), new THREE.Vector3(s, s, s));
    const pr = F.potR, ph = F.potH;
    B.pot.add(G.pot, [0, ph / 2, 0], [0, 0, 0], [pr, ph, pr], mat);
    B.pot.add(G.rim, [0, ph, 0], [Math.PI / 2, 0, 0], [pr * 1.04, pr * 1.04, pr * 1.3], mat);
    B.soil.add(G.disc, [0, ph - 0.008, 0], [0, 0, 0], [pr * 0.92, 0.01, pr * 0.92], mat);
    const top = ph - 0.005 + q.stem;
    B.stem.add(G.cyl, [0, ph + q.stem / 2 - 0.005, 0], [0, 0, 0], [F.stemR, q.stem, F.stemR], mat);
    // two leaves, sideways (perpendicular to the ring tangent so they read from the front)
    const L = F.leafLen * q.leaf;
    if (L > 0.004) for (const sd of [-1, 1]) {
      const y = ph + Math.min(q.stem * 0.45, 0.12);
      B.leaf.add(G.sphere, [sd * L * 0.85, y + L * 0.25, 0], [0, 0, sd * -0.55], [L, L * 0.32, L * 0.12], mat);
    }
    // the head: a green bud tip when small, then a yellow centre + petals that spread with `open`, drooping as it closes
    const hs = q.head;
    const headM = new THREE.Matrix4().compose(new THREE.Vector3(0, top, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(q.droop * 0.5, 0, 0)), new THREE.Vector3(1, 1, 1)).premultiply(mat);
    const budR = 0.022 + 0.012 * hs * (1 - q.open);
    B.stem.add(G.sphere, [0, 0.004, 0], [0, 0, 0], [budR * 0.9, budR * 1.3, budR * 0.9], headM);
    if (hs > 0.02) {
      const tilt = lerp(0.22, 1.32, q.open);           // petal angle from vertical: closed bud -> open flower
      const len = F.petalLen * hs, wid = F.petalW * hs;
      for (let k = 0; k < F.petals; k++) {
        const a = (k / F.petals) * Math.PI * 2;
        const pm = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.01, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(1, 1, 1)).premultiply(headM);
        const tm = new THREE.Matrix4().makeRotationX(tilt).premultiply(pm);
        B.petal.add(G.sphere, [0, len * 0.95, 0], [0, 0, 0], [wid, len, wid * 0.35], tm);
      }
      const cr = F.centerR * Math.max(0.35, hs) * (0.5 + 0.5 * q.open);
      B.center.add(G.sphere, [0, 0.016, 0], [0, 0, 0], [cr, cr * 0.7, cr], headM);
    }
  }
  /** ball station geometry into buckets (pad at local origin on the surface) */
  function addBall(B, p, base, o = {}) {
    const Bs = { ...spec.ball, ...o };
    const r = o.ballR ?? 0.085;
    const q = zoe.ballPose(p, { height: o.height ?? 0.5, squash: Bs.squash, stretch: Bs.stretch });
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(...base.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, base.yaw, 0)), new THREE.Vector3(1, 1, 1));
    const lift = 0.012;
    B.rod.add(G.disc, [0, 0.006, 0], [0, 0, 0], [Bs.padR, 0.012, Bs.padR], mat);
    const cy = lift + q.y + r * q.sy;
    if (cy - r * q.sy > lift + 0.01) B.rod.add(G.cyl, [0, (lift + cy) / 2, 0], [0, 0, 0], [Bs.rodR, cy - lift, Bs.rodR], mat);
    B.ball.add(G.sphere, [0, cy, 0], [0, 0, 0], [r * q.sx, r * q.sy, r * q.sx], mat);
  }

  /**
   * ring({ pose, N, radius, tier, height, ... }) -> Group of merged meshes (one per material) for N stations
   *   station i at disc-local angle i * 2pi/N carries phase zoe.stationPhase(i, N).
   */
  function ring(R) {
    const names = R.pose === "flower" ? ["pot", "soil", "stem", "leaf", "petal", "center"] : ["rod", "ball"];
    const B = Object.fromEntries(names.map((n) => [n, bucket()]));
    const y = R.tier === "tier" ? tierTop : platterTop;
    for (let i = 0; i < R.N; i++) {
      const a = (i / R.N) * Math.PI * 2;
      const base = { pos: [Math.sin(a) * R.radius, y, Math.cos(a) * R.radius], yaw: a };
      const p = zoe.stationPhase(i, R.N);
      if (R.pose === "flower") addFlower(B, p, base, R); else addBall(B, p, base, R);
    }
    const g = new THREE.Group(); g.name = `ring:${R.id}`;
    for (const n of names) {
      const geo = B[n].merged(); if (!geo) continue;
      const m = new THREE.Mesh(geo, materials[n]); m.castShadow = m.receiveShadow = true; m.name = `${R.id}:${n}`;
      g.add(m);
    }
    return g;
  }

  // ---------------------------------------------------------------- the turntable
  /**
   * turntable({ rings }) -> { group, disc, setAngle(a) }   plinth (static) + disc (platter, tier, spindle, rings) that spins.
   */
  function turntable(o = {}) {
    const rings = o.rings ?? spec.rings;
    const group = new THREE.Group(); group.name = "turntable";
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(T.baseR, T.baseR * 1.03, T.baseH, 96), materials.base);
    plinth.position.y = T.baseH / 2; plinth.castShadow = plinth.receiveShadow = true; plinth.name = "plinth";
    group.add(plinth);
    const disc = new THREE.Group(); disc.name = "disc";
    const N = rings[0].N;
    const side = new THREE.MeshStandardMaterial({ map: stripeTexture(N), roughness: 0.45 }); side.name = "stripes";
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(T.platterR, T.platterR, T.platterH, 128, 1, true), side);
    platter.position.y = T.baseH + T.platterH / 2; platter.castShadow = true; platter.receiveShadow = true;
    disc.add(platter);
    const topMat = materials.platter.clone(); topMat.map = platterTopTexture(N, rings); topMat.name = "platterTop";
    const top = new THREE.Mesh(new THREE.CircleGeometry(T.platterR, 128), topMat);
    top.rotation.x = -Math.PI / 2; top.position.y = platterTop; top.receiveShadow = true;
    disc.add(top);
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(T.tierR, T.tierR, T.tierH, 96), materials.tier);
    tier.position.y = platterTop + T.tierH / 2; tier.castShadow = tier.receiveShadow = true;
    disc.add(tier);
    const tierTopMat = materials.platter.clone(); tierTopMat.name = "tierTop";
    const ttop = new THREE.Mesh(new THREE.CircleGeometry(T.tierR - 0.002, 96), tierTopMat);
    ttop.rotation.x = -Math.PI / 2; ttop.position.y = tierTop + 0.001; ttop.receiveShadow = true;
    disc.add(ttop);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(T.spindleR, T.spindleR, T.spindleH, 32), materials.cap);
    spindle.position.y = tierTop + T.spindleH / 2; spindle.castShadow = true; disc.add(spindle);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(T.spindleR * 1.5, 32, 16), materials.cap);
    cap.position.y = tierTop + T.spindleH; cap.castShadow = true; disc.add(cap);
    for (const R of rings) disc.add(ring(R));
    group.add(disc);
    return { group, disc, setAngle(a) { disc.rotation.y = a; } };
  }

  // ---------------------------------------------------------------- strobe lamp prop
  /** lamp() -> pendant strobe lamp aimed at the disc; userData.setGlow(k) */
  function lamp(o = {}) {
    const L = { ...spec.lamp, ...o };
    const g = new THREE.Group(); g.name = "strobeLamp";
    const s = L.size;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.55, s * 0.62, s * 0.8, 32), materials.lampBody);
    body.rotation.x = Math.PI / 2; g.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(s * 0.5, 32), materials.lampLens);
    lens.position.z = s * 0.41; g.add(lens);
    const Hs = L.position[1];                                  // a floor stand straight down from the head
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Hs, 12), materials.lampBody); g.add(cord);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.05, 32), materials.lampBody); g.add(foot);
    g.position.set(...L.position);
    g.lookAt(new THREE.Vector3(...(L.target ?? [0, 0.45, 0.2])));
    cord.quaternion.copy(g.quaternion).invert();             // keep the cord vertical in world space
    cord.position.set(0, -Hs / 2, 0).applyQuaternion(cord.quaternion);
    foot.quaternion.copy(cord.quaternion);
    foot.position.set(0, -Hs + 0.025, 0).applyQuaternion(cord.quaternion);
    g.traverse((m) => { m.castShadow = false; m.receiveShadow = true; });
    g.userData.setGlow = (k) => { materials.lampLens.emissiveIntensity = k; };
    return g;
  }

  // ---------------------------------------------------------------- lighting from the strobe plan
  /** lighting(strobeWindows) -> { update(t, frame) }: room level, strobe spot, lamp glow, background */
  function lighting(strobe, o = {}) {
    const Sp = { ...spec.spin, ...o };
    const base = {}; for (const id of ["sky", "key", "fill"]) base[id] = lights[id].intensity;
    const env0 = stage.scene.environmentIntensity ?? 1;
    const day = new THREE.Color(P.bg), night = new THREE.Color(P.night);
    const bg = stage.scene.background;
    const lampGlow = o.lamp;
    return {
      update(t) {
        const d = zoe.darkness(strobe, t, Sp.fade), fl = zoe.onsetFlash(strobe, t, Sp.onset);
        const room = lerp(1, Sp.darkRoom, d);
        for (const id of ["sky", "key", "fill"]) lights[id].intensity = base[id] * room;
        stage.scene.environmentIntensity = env0 * room;
        lights.strobe.intensity = Sp.strobePeak * d * (1 + 0.6 * fl);
        if (bg && bg.isColor) bg.copy(day).lerp(night, d);
        const f = Math.floor(t * 30 + 1e-6);
        const pulse = 1 - Sp.lampFlicker * (f % 2);           // gentle per-frame lens pulse (the lamp strobes)
        if (lampGlow) lampGlow.userData.setGlow(0.05 + Sp.lampGlow * d * pulse * (1 + fl));
        return { dark: d, flash: fl };
      },
    };
  }

  // ---------------------------------------------------------------- motion blur
  /** motionBlur(turntable) -> { pass, setAngles(angles) }  (needs the post stack) */
  function motionBlur(tt) {
    const pass = new AccumBlurPass(stage, (a) => tt.setAngle(a), stage.width, stage.height);
    post.insertBefore(pass, "output", "zoetropeBlur");
    return {
      pass,
      setAngles(angles) { pass.angles = angles; pass.enabled = angles.length > 1; tt.setAngle(angles[0]); },
    };
  }

  // ---------------------------------------------------------------- overlay caption
  /** caption() -> overlay chip with three toy dots; userData.show(text, alpha, night) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      const plate = st.night ? Q.nightPlate : Q.plate, edge = st.night ? Q.nightEdge : Q.edge, ink = st.night ? Q.nightInk : Q.ink;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), dot = Math.round(Q.h * 0.15), icW = dot * 2 * 3 + dot;
      const pw = Math.min(W - 16, pad + icW + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.18)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, ph / 2); x.fill();
      x.fillStyle = plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.strokeStyle = edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, ph / 2 - 1); x.stroke();
      for (let k = 0; k < 3; k++) {
        x.fillStyle = Q.dots[k]; x.beginPath(); x.arc(ox + pad + dot + k * dot * 2.5, oy + ph / 2, dot, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + icW + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a, night = false) => { mesh.userData.set({ text, night: !!night }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { sweep, turntable, ring, lamp, lighting, motionBlur, caption };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: zoe, motion: zoe,
  };
}
