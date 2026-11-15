// styles/light-painting/style.js — "Light Painting": a long-exposure night photograph made of time, not matter.
// The look lives in spec.js; WHERE and WHEN the light went lives in strokes.js (THREE-free planner shared with SCORE).
// This file turns a plan into pictures:
//   - trails: ONE camera-facing ribbon mesh for every stroke. Each vertex carries its plan time T, brightness B and
//     width W; the shader shows T <= uTime (closed form, no accumulation buffer), a coloured body + white-hot core
//     that only over-exposes where the pen was slow. Additive, HDR, bloom gives the halo.
//   - blobs: billboards at pauses / starts / corners that appear (and swell while the pen dwells) at their plan time.
//   - pen: a flare billboard + a point light at the pen tip (the only light on the painter and the wet ground).
//   - painter: a faint smeared ghost (several time-lagged translucent poses) lit only by spill.
//   - location: wet asphalt, a curved night backdrop (sky gradient, tree line, distant windows, sodium haze) and
//     3D bokeh lights; trails, blobs, bokeh and the flare are mirrored under the ground with a puddle mask.
//   - overlay: caption chip, exposure indicator (SHUTTER OPEN + elapsed seconds), focal-plane shutter blades.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { rng, clamp, lerp, smoothstep, TAU } from "../../kit/time.js";
import { fbm2 } from "../../kit/noise.js";
import { newCanvas } from "../../kit/canvas.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as strokes from "./strokes.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const NOISE_GLSL = /* glsl */ `
float lpHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lpNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lpHash(i), lpHash(i + vec2(1.0, 0.0)), f.x), mix(lpHash(i + vec2(0.0, 1.0)), lpHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// puddle mask for a mirrored fragment: where the eye ray meets the ground (y = 0)
float lpPuddle(vec3 w, float scale, float cut) {
  float k = cameraPosition.y / max(1e-3, cameraPosition.y - w.y);
  vec2 g = (cameraPosition + (w - cameraPosition) * k).xz;
  float n = lpNoise(g * scale) * 0.65 + lpNoise(g * scale * 2.7 + 3.1) * 0.35;
  return 0.22 + 0.78 * smoothstep(cut, cut + 0.18, n);
}`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, TR = spec.trail, PEN = spec.pen;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const lin = (hex) => new THREE.Color(hex);

  // a root under the ground, flipped in y: everything that should show in the wet asphalt goes in here too
  const mirrorRoot = new THREE.Group(); mirrorRoot.name = "mirror"; mirrorRoot.scale.y = -1;
  stage.scene.add(mirrorRoot);

  // ---------------------------------------------------------------- trails
  const trailVS = /* glsl */ `
    attribute vec3 aTan; attribute float aSide; attribute float aT; attribute float aW; attribute float aB; attribute vec3 aCol;
    uniform float uTime; uniform float uWidth; uniform float uMirror; uniform float uWiden;
    varying float vSide; varying float vB; varying vec3 vCol; varying float vDT; varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec3 tw = mat3(modelMatrix) * aTan;
      vec3 sd = cross(tw, cameraPosition - wp.xyz);
      float l = length(sd);
      sd = l > 1e-6 ? sd / l : vec3(0.0, 1.0, 0.0);
      wp.xyz += sd * aSide * aW * uWidth * mix(1.0, uWiden, uMirror);
      vSide = aSide; vB = aB; vCol = aCol; vDT = uTime - aT; vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const trailFS = /* glsl */ `
    uniform float uHalo; uniform float uCore; uniform float uCoreFrom; uniform float uCoreSharp; uniform float uHeadFade;
    uniform float uMirror; uniform float uMirrorLevel; uniform float uPuddleScale; uniform float uPuddleCut; uniform float uLevel;
    varying float vSide; varying float vB; varying vec3 vCol; varying float vDT; varying vec3 vWorld;
    ${NOISE_GLSL}
    void main() {
      float a = clamp(abs(vSide), 0.0, 1.0);
      float body = pow(max(0.0, 1.0 - a * a), 1.6);
      float core = pow(max(0.0, 1.0 - a), uCoreSharp);
      float hot = smoothstep(uCoreFrom, uCoreFrom + 1.1, vB);
      vec3 c = vCol * body * uHalo * vB + vec3(1.0, 0.94, 0.86) * core * uCore * hot * vB * 0.6;
      c *= smoothstep(-uHeadFade, 0.0, vDT) * uLevel;
      float m = uMirror > 0.5 ? uMirrorLevel * lpPuddle(vWorld, uPuddleScale, uPuddleCut) : 1.0;
      gl_FragColor = vec4(c * m, 1.0);
    }`;
  function trailMaterial(mirror) {
    return new THREE.ShaderMaterial({
      name: mirror ? "trailMirror" : "trail",
      vertexShader: trailVS, fragmentShader: trailFS,
      uniforms: {
        uTime: { value: -1 }, uWidth: { value: TR.width }, uMirror: { value: mirror ? 1 : 0 }, uWiden: { value: TR.mirror.widen },
        uHalo: { value: TR.halo }, uCore: { value: TR.core }, uCoreFrom: { value: TR.coreFrom }, uCoreSharp: { value: TR.coreSharp },
        uHeadFade: { value: TR.headFade }, uMirrorLevel: { value: TR.mirror.level }, uPuddleScale: { value: TR.mirror.puddleScale },
        uPuddleCut: { value: TR.mirror.puddleCut }, uLevel: { value: 1 },
      },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
    });
  }

  /** trails(plan) -> { mesh, mirror, update(t) }: one ribbon geometry for every stroke in the plan */
  function trails(plan) {
    let nv = 0, ni = 0;
    for (const s of plan.strokes) { nv += s.pts.length * 2; ni += (s.pts.length - 1) * 6; }
    const pos = new Float32Array(nv * 3), tan = new Float32Array(nv * 3), side = new Float32Array(nv), T = new Float32Array(nv);
    const W = new Float32Array(nv), B = new Float32Array(nv), col = new Float32Array(nv * 3);
    const idx = new Uint32Array(ni);
    let v = 0, q = 0;
    for (const s of plan.strokes) {
      const c = lin(s.color), v0 = v;
      for (let i = 0; i < s.pts.length; i++) {
        for (const sd of [-1, 1]) {
          pos.set(s.pts[i], v * 3); tan.set(s.tan[i], v * 3); side[v] = sd; T[v] = s.T[i];
          W[v] = s.W[i]; B[v] = s.B[i] * s.on[i]; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
          v++;
        }
      }
      for (let i = 0; i < s.pts.length - 1; i++) {
        const a = v0 + i * 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], q); q += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aTan", new THREE.BufferAttribute(tan, 3));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setAttribute("aT", new THREE.BufferAttribute(T, 1));
    g.setAttribute("aW", new THREE.BufferAttribute(W, 1));
    g.setAttribute("aB", new THREE.BufferAttribute(B, 1));
    g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1;
    const mesh = new THREE.Mesh(g, trailMaterial(false)); mesh.name = "trails"; mesh.frustumCulled = false; mesh.renderOrder = 3;
    const mirror = new THREE.Mesh(g, trailMaterial(true)); mirror.name = "trailsMirror"; mirror.frustumCulled = false; mirror.renderOrder = 2;
    stage.scene.add(mesh); mirrorRoot.add(mirror);
    return {
      mesh, mirror,
      update(t, level = 1) {
        for (const m of [mesh, mirror]) { m.material.uniforms.uTime.value = t; m.material.uniforms.uLevel.value = level; }
      },
    };
  }

  // ---------------------------------------------------------------- billboards (blobs, bokeh, pen flare)
  const bbVS = /* glsl */ `
    attribute vec2 aCorner; attribute float aT; attribute float aTF; attribute float aB; attribute float aSize; attribute vec3 aCol;
    uniform float uTime; uniform float uMirror; uniform float uWiden; uniform float uScale;
    varying vec2 vUv; varying float vLevel; varying vec3 vCol; varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float grow = clamp((uTime - aT) / max(1e-3, aTF - aT), 0.0, 1.0);
      float on = step(aT, uTime);
      float sz = aSize * uScale * (0.55 + 0.45 * grow) * mix(1.0, uWiden, uMirror);
      wp.xyz += (right * aCorner.x + up * aCorner.y) * sz;
      vUv = aCorner; vLevel = aB * on * (0.35 + 0.65 * grow); vCol = aCol; vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const bbFS = /* glsl */ `
    uniform float uMirror; uniform float uMirrorLevel; uniform float uPuddleScale; uniform float uPuddleCut;
    uniform float uLevel; uniform float uStreak;
    varying vec2 vUv; varying float vLevel; varying vec3 vCol; varying vec3 vWorld;
    ${NOISE_GLSL}
    void main() {
      float r = length(vUv);
      float edge = 1.0 - smoothstep(0.82, 1.0, r);
      vec3 c;
    #if KIND == 0
      // pause blob: hot white centre, coloured soft glow
      c = (vCol * exp(-r * r * 5.0) * 0.9 + vec3(1.0, 0.95, 0.88) * exp(-r * r * 38.0) * 1.6) * vLevel;
    #elif KIND == 1
      // bokeh: soft disc with a slightly brighter rim (an out-of-focus street light)
      float disc = 1.0 - smoothstep(0.78, 0.98, r);
      c = vCol * disc * (0.7 + 0.3 * smoothstep(0.45, 0.92, r)) * vLevel;
    #else
      // pen flare: tiny white-hot point, coloured glow, two thin star streaks
      float ax = abs(vUv.x), ay = abs(vUv.y);
      float streak = exp(-ay * 70.0) * exp(-ax * 3.2) + exp(-ax * 70.0) * exp(-ay * 3.6) * 0.7;
      c = vec3(1.0, 0.96, 0.9) * exp(-r * r * 120.0) * 1.0 + vCol * exp(-r * r * 9.0) * 0.18 + mix(vCol, vec3(1.0), 0.4) * streak * uStreak * 0.25;
      c *= vLevel;
    #endif
      c *= edge * uLevel;
      float m = uMirror > 0.5 ? uMirrorLevel * lpPuddle(vWorld, uPuddleScale, uPuddleCut) : 1.0;
      gl_FragColor = vec4(c * m, 1.0);
    }`;
  function bbMaterial(kind, mirror, o = {}) {
    return new THREE.ShaderMaterial({
      name: `bb${kind}${mirror ? "Mirror" : ""}`,
      defines: { KIND: kind },
      vertexShader: bbVS, fragmentShader: bbFS,
      uniforms: {
        uTime: { value: -1 }, uMirror: { value: mirror ? 1 : 0 }, uWiden: { value: o.widen ?? 1.4 }, uScale: { value: 1 },
        uMirrorLevel: { value: o.mirrorLevel ?? TR.mirror.level }, uPuddleScale: { value: TR.mirror.puddleScale }, uPuddleCut: { value: TR.mirror.puddleCut },
        uLevel: { value: 1 }, uStreak: { value: PEN.streak },
      },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
  }
  /** billboardGeometry(items [{ p, t, tFull, b, size, color }]) */
  function billboardGeometry(items) {
    const n = items.length;
    const pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), T = new Float32Array(n * 4), TF = new Float32Array(n * 4);
    const Bv = new Float32Array(n * 4), S = new Float32Array(n * 4), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    items.forEach((it, k) => {
      const c = lin(it.color);
      for (let j = 0; j < 4; j++) {
        const v = k * 4 + j;
        pos.set(it.p, v * 3); cor.set(C4[j], v * 2); T[v] = it.t ?? -1e3; TF[v] = it.tFull ?? (it.t ?? -1e3) + 1e-3;
        Bv[v] = it.b; S[v] = it.size; col.set([c.r, c.g, c.b], v * 3);
      }
      idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aCorner", new THREE.BufferAttribute(cor, 2));
    g.setAttribute("aT", new THREE.BufferAttribute(T, 1));
    g.setAttribute("aTF", new THREE.BufferAttribute(TF, 1));
    g.setAttribute("aB", new THREE.BufferAttribute(Bv, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(S, 1));
    g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  function billboardPair(items, kind, o = {}) {
    const g = billboardGeometry(items);
    const mesh = new THREE.Mesh(g, bbMaterial(kind, false, o)); mesh.frustumCulled = false; mesh.renderOrder = 4;
    const mirror = new THREE.Mesh(g, bbMaterial(kind, true, o)); mirror.frustumCulled = false; mirror.renderOrder = 2;
    stage.scene.add(mesh); mirrorRoot.add(mirror);
    return { mesh, mirror, set(name, value) { mesh.material.uniforms[name].value = value; mirror.material.uniforms[name].value = value; } };
  }

  /** blobs(plan) -> { update(t, level) }: pause / start / corner blobs from the plan */
  function blobs(plan) {
    const items = [];
    for (const s of plan.strokes) for (const b of s.blobs) items.push({ p: b.p, t: b.t, tFull: b.tFull, b: b.b * spec.blobs.level, size: b.size, color: s.color });
    const bp = billboardPair(items, 0, { widen: 1.6 });
    bp.mesh.name = "blobs";
    return { ...bp, update(t, level = 1) { bp.set("uTime", t); bp.set("uLevel", level); } };
  }

  /** pen() -> { update(state, level) }: flare billboard + point light at the pen tip (state from plan.penAt) */
  function pen() {
    const bp = billboardPair([{ p: [0, 0, 0], t: -1e3, tFull: -1e3 + 1e-3, b: 1, size: PEN.flare, color: "#ffffff" }], 2, { widen: 1.5, mirrorLevel: TR.mirror.level * 0.8 });
    bp.mesh.name = "penFlare";
    const light = new THREE.PointLight("#ffffff", 0, PEN.lightDistance, 2);
    light.name = "penLight";
    stage.scene.add(light);
    const colAttr = bp.mesh.geometry.getAttribute("aCol");
    const c = new THREE.Color();
    return {
      ...bp, light,
      update(st, level = 1) {
        const on = st.on * level;
        bp.mesh.position.set(...st.p); bp.mirror.position.set(...st.p);
        bp.mesh.visible = bp.mirror.visible = on > 0.001;
        c.set(st.color);
        for (let j = 0; j < 4; j++) colAttr.setXYZ(j, c.r, c.g, c.b);
        colAttr.needsUpdate = true;
        // the flare breathes with pen speed the way the trail does (slow = hotter)
        const b = clamp(st.bright ?? 1.6, 0.6, 2.2);
        bp.set("uLevel", on * PEN.level * (0.5 + 0.3 * b));
        light.position.set(st.p[0], st.p[1], st.p[2]);
        light.color.copy(c);
        light.intensity = on * PEN.light;
      },
    };
  }

  // ---------------------------------------------------------------- the painter's ghost
  /** painter(plan) -> { group, update(t, { freezeAt, level }) }: time-lagged translucent poses, lit only by spill */
  function painter(plan) {
    const PT = spec.painter;
    const group = new THREE.Group(); group.name = "painter";
    const base = materials.ghost;
    const copies = [];
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12);
    const geo = { torso: cap(0.17, 0.5), head: new THREE.SphereGeometry(0.115, 16, 12), leg: cap(0.075, 0.72), arm: cap(0.05, 1) };
    for (let k = 0; k < PT.copies; k++) {
      const m = base.clone();
      m.transparent = true; m.depthWrite = false; m.opacity = PT.opacity * (1 - k / (PT.copies + 1));
      m.name = `ghost${k}`;
      const g = new THREE.Group();
      const torso = new THREE.Mesh(geo.torso, m); torso.position.y = 1.18;
      const head = new THREE.Mesh(geo.head, m); head.position.y = 1.66;
      const legL = new THREE.Mesh(geo.leg, m); legL.position.set(-0.11, 0.45, 0);
      const legR = new THREE.Mesh(geo.leg, m); legR.position.set(0.11, 0.45, 0);
      const armFree = new THREE.Mesh(geo.arm, m); armFree.scale.y = 0.6; armFree.position.set(-0.24, 1.08, 0.02); armFree.rotation.z = -0.12;
      const arm = new THREE.Mesh(geo.arm, m);
      g.add(torso, head, legL, legR, armFree);
      group.add(g);
      group.add(arm); // the drawing arm is posed in world space (shoulder -> pen)
      copies.push({ g, arm, m });
    }
    stage.scene.add(group);
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), sh = new THREE.Vector3(), hd = new THREE.Vector3();
    return {
      group,
      update(t, o = {}) {
        const tt = Math.min(t, o.freezeAt ?? Infinity), level = o.level ?? 1;
        group.visible = level > 0.002;
        copies.forEach((cp, k) => {
          const tk = tt - k * PT.smear;
          const pose = strokes.painterAt(plan, tk, PT);
          // the painter never stands still for the length of an exposure: a slow sway smears the copies apart
          const sw = PT.sway * Math.sin(TAU * PT.swayHz * tk + 0.7) + PT.sway * 0.5 * Math.sin(TAU * PT.swayHz * 2.3 * tk);
          pose.body[0] += sw;
          cp.g.position.set(pose.body[0], 0, pose.body[2] + 0.3 * sw);
          cp.g.rotation.z = -pose.lean * 0.06;
          cp.g.rotation.y = pose.lean * 0.25;
          cp.m.opacity = PT.opacity * (1 - k / (PT.copies + 1)) * level;
          sh.set(pose.body[0] + 0.22, 1.43, pose.body[2]);
          hd.set(...pose.hand);
          d.subVectors(hd, sh);
          const L = Math.max(0.2, d.length() - 0.05);
          cp.arm.position.copy(sh).addScaledVector(d, 0.5 * (L / d.length()));
          cp.arm.quaternion.setFromUnitVectors(up, d.normalize());
          cp.arm.scale.set(1, L / 1.1, 1);
        });
      },
    };
  }

  // ---------------------------------------------------------------- location
  /** backdrop() -> curved night horizon (sky gradient, tree line, far buildings with a few lit windows, sodium haze) */
  function backdrop() {
    const L = spec.location.backdrop, R0 = -L.z, H = 40, thetaLen = (220 * Math.PI) / 180;
    const Wpx = 4096, Hpx = Math.round(Wpx * H / (R0 * thetaLen));
    const cv = newCanvas(Wpx, Hpx), x = cv.getContext("2d");
    const R = rng(L.seed);
    const hy = Hpx - 1; // horizon at the bottom edge of the canvas (y = 0 in the world)
    const pxm = Hpx / H;
    const sky = x.createLinearGradient(0, 0, 0, Hpx);
    sky.addColorStop(0, P.skyTop); sky.addColorStop(0.7, "#070910"); sky.addColorStop(0.9, P.skyHorizon); sky.addColorStop(1, P.glow);
    x.fillStyle = sky; x.fillRect(0, 0, Wpx, Hpx);
    // sodium haze pools above two towns
    for (const [cx, w, a] of [[0.36, 0.14, 0.38], [0.62, 0.1, 0.32], [0.5, 0.4, 0.16]]) {
      const g = x.createRadialGradient(cx * Wpx, hy, 0, cx * Wpx, hy, w * Wpx);
      g.addColorStop(0, `rgba(120,78,52,${a})`); g.addColorStop(1, "rgba(120,78,52,0)");
      x.fillStyle = g; x.fillRect(0, 0, Wpx, Hpx);
    }
    // far buildings (dark blocks) with a few warm windows
    x.filter = "blur(3px)"; // the far town is out of focus
    for (let i = 0; i < 90; i++) {
      const bx = R.range(0.2, 0.8) * Wpx, bw = R.range(0.8, 2.6) * pxm, bh = R.range(0.5, 2.4) * pxm * (1 - Math.abs(bx / Wpx - 0.5) * 1.2);
      x.fillStyle = "#06070c"; x.fillRect(bx, hy - bh, bw, bh);
      const nw = Math.floor(R.range(0, 5));
      for (let j = 0; j < nw; j++) {
        x.fillStyle = R.pick(["rgba(255,196,120,0.55)", "rgba(255,224,170,0.4)", "rgba(170,200,255,0.35)"]);
        x.fillRect(bx + R.range(0.1, 0.8) * bw, hy - R.range(0.15, 0.9) * bh, 0.22 * pxm, 0.28 * pxm);
      }
    }
    // tree line in front of the town
    x.filter = "blur(2px)";
    x.fillStyle = "#030305";
    x.beginPath(); x.moveTo(0, Hpx);
    for (let px = 0; px <= Wpx; px += 4) {
      const u = px / Wpx;
      const h = (0.3 + 1.3 * fbm2(u * 60, 0.5, { seed: L.seed, octaves: 4 }) ** 1.6) * pxm * (0.6 + 0.8 * fbm2(u * 6, 2.5, { seed: L.seed + 1, octaves: 2 }));
      x.lineTo(px, hy - h);
    }
    x.lineTo(Wpx, Hpx); x.closePath(); x.fill();
    x.filter = "none";
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.CylinderGeometry(R0, R0, H, 96, 1, true, Math.PI - thetaLen / 2, thetaLen);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = H / 2; mesh.name = "backdrop"; mesh.renderOrder = -1;
    // CylinderGeometry theta 0 is +Z; the window above is centred on -Z (pi). Inside view mirrors u: flip it back.
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1;
    stage.scene.add(mesh);
    return mesh;
  }
  /** ground() -> wet asphalt plane */
  function ground() {
    const [w, d] = spec.location.groundSize;
    const mat = materials.ground;
    if (mat.bumpMap) { mat.bumpMap.wrapS = mat.bumpMap.wrapT = THREE.RepeatWrapping; mat.bumpMap.repeat.set(w / 2.5, d / 2.5); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.z = spec.location.groundZ; m.name = "ground";
    m.receiveShadow = false; m.renderOrder = 0;
    // transparent-free, but it must not hide the mirrored world under it: draw it first, write no depth
    mat.depthWrite = false;
    stage.scene.add(m);
    return m;
  }
  /** bokeh() -> distant out-of-focus lights (3D, so they parallax during the camera arc) + their reflections */
  function bokeh() {
    const B = spec.location.bokeh, R = rng(B.seed), items = [];
    for (let i = 0; i < B.count; i++) {
      items.push({ p: [R.sign() * R.range(...B.xRange), R.range(...B.yRange), R.range(...B.zRange)], // the sides: never behind the drawing t: -1e3, tFull: -1e3 + 1e-3,
        b: R.range(...B.level), size: R.range(...B.size), color: R.pick(B.colors) });
    }
    const bp = billboardPair(items, 1, { widen: 1.3, mirrorLevel: 0.5 });
    bp.mesh.name = "bokeh"; bp.mesh.renderOrder = 1;
    return bp;
  }
  /** spill(plan, groups [{ id, color }]) -> point lights that fill in as each group's trails get drawn */
  function spill(plan, groups) {
    const S = spec.spill;
    const ls = groups.map((g) => {
      const c = plan.centroid(g.id);
      const l = new THREE.PointLight(g.color, 0, S.distance, 2);
      l.position.set(c[0], Math.max(0.6, c[1] - 0.6), c[2] + S.lift);
      l.name = `spill_${g.id}`;
      stage.scene.add(l);
      return { l, id: g.id };
    });
    return { lights: ls, update(t, level = 1) { for (const s of ls) s.l.intensity = S.light * plan.drawnFraction(s.id, t) * level; } };
  }

  // ---------------------------------------------------------------- overlay
  /** caption() -> chip top-left (amber dot, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1000, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width), pad = 30, dot = 12;
      const pw = Math.min(W - 12, pad + dot * 2 + 20 + tw + pad), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 15); x.stroke();
      const cy = oy + ph / 2;
      const g = x.createRadialGradient(ox + pad + dot, cy, 0, ox + pad + dot, cy, dot * 2);
      g.addColorStop(0, "#fff3dc"); g.addColorStop(0.35, Q.dot); g.addColorStop(1, "rgba(255,154,60,0)");
      x.fillStyle = g; x.beginPath(); x.arc(ox + pad + dot, cy, dot * 2, 0, TAU); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + dot * 2 + 20, cy + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** indicator() -> exposure chip top-right; userData.show({ mode: "closed"|"open"|"done", secs }) */
  function indicator(o = {}) {
    const Q = { ...spec.indicator, ...o };
    const Wp = 560, Hp = Q.h + 12;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      x.font = `700 ${Q.cap}px ${Q.font}`;
      const label = st.mode === "open" ? "SHUTTER OPEN" : st.mode === "done" ? "EXPOSURE" : "SHUTTER CLOSED";
      const secs = `${st.secs.toFixed(1).padStart(4, "0")} s`;
      const lw = Math.round(x.measureText(label).width), sw = Math.round(x.measureText(secs).width);
      const pad = 22, dot = 9, gap = 18;
      const pw = pad + dot * 2 + gap + lw + gap + sw + pad, ph = Q.h, ox = W - pw - 4, oy = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 12); x.fill();
      x.fillStyle = st.mode === "open" ? Q.rec : Q.dim;
      x.beginPath(); x.arc(ox + pad + dot, oy + ph / 2, dot, 0, TAU); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(label, ox + pad + dot * 2 + gap, oy + ph / 2 + 1);
      x.fillStyle = st.mode === "open" ? Q.ink : Q.dim;
      x.fillText(secs, ox + pad + dot * 2 + gap + lw + gap, oy + ph / 2 + 1);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp, Q.y);
    mesh.userData.show = (st) => { mesh.userData.set(st); mesh.userData.opacity(1); };
    return mesh;
  }
  /** shutter() -> focal-plane blades; userData.close(c) with c = 0 (open) .. 1 (closed) */
  function shutter() {
    const W = stage.width, H = Math.ceil(stage.height / 2);
    const blade = (top) => {
      const m = screenCanvas(stage, W, H, (x, w, h) => {
        x.fillStyle = "#000000"; x.fillRect(0, 0, w, h);
        x.fillStyle = "#121318"; x.fillRect(0, top ? h - 3 : 0, w, 3); // the blade edge catches a little light
      }, { upload: true, willReadFrequently: true });
      m.userData.set({ v: 1 });
      m.renderOrder = 9;
      return m;
    };
    const top = blade(true), bot = blade(false);
    return {
      top, bot,
      close(c) {
        const k = clamp(c);
        top.userData.place(0, -H + H * k); bot.userData.place(0, stage.height - H * k);
        top.userData.opacity(k > 0.001 ? 1 : 0); bot.userData.opacity(k > 0.001 ? 1 : 0);
      },
    };
  }
  /** shutterClosure(t, { open, close }, spec.shutter) -> 0..1 (pure): closed until `open`, blades snap shut at `close`, reopen on the photo */
  function shutterClosure(t, at) {
    const S = spec.shutter;
    if (t < at.open) return 1;
    if (t < at.open + S.openDur) return 1 - smoothstep(at.open, at.open + S.openDur, t);
    if (t < at.close) return 0;
    if (t < at.close + S.closeDur) return smoothstep(at.close, at.close + S.closeDur, t);
    const r = at.close + S.closeDur + S.hold;
    if (t < r) return 1;
    return 1 - smoothstep(r, r + S.openDur, t);
  }
  const tintA = new THREE.Color("#ffffff"), tintB = new THREE.Color(spec.develop.tint), tintC = new THREE.Color();
  /** develop(t, at) -> 0..1 and sets exposure + warm tint (the finished print is a touch brighter, warmer) */
  function develop(t, at) {
    const r = at.close + spec.shutter.closeDur + spec.shutter.hold;
    const d = smoothstep(r, r + spec.develop.dur, t);
    stage.renderer.toneMappingExposure = lerp(spec.world.exposure, spec.develop.exposure, d);
    if (post) post.set({ tint: tintC.copy(tintA).lerp(tintB, d) });
    return d;
  }

  const props = { trails, blobs, pen, painter, backdrop, ground, bokeh, spill, caption, indicator, shutter };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    helpers: { shutterClosure, develop, mirrorRoot }, plan: strokes, motion: strokes,
  };
}
