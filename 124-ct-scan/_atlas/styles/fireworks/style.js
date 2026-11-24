// styles/fireworks/style.js — "Fireworks": night-sky fireworks over a harbour whose bursts form planned shapes.
// The look lives in spec.js; WHERE every star is lives in shells.js (THREE-free closed form shared with SCORE).
// This file turns a plan into pictures:
//   - sky(): a back-side dome with an unlit night gradient (horizon glow -> deep blue), its lower half is the water
//   - skyline(city): two layers of buildings with procedural lit windows + their mirror images in the water
//   - barges(): launch barges on the water
//   - show(plan): ONE instanced draw of glowing sprites (lift comets, sparks, burst stars + streak ghosts, flashes,
//     sky stars, lamps). The vertex shader evaluates the planner's closed form from uTime, so a frame costs nothing in
//     JS. A second mesh on the same geometry draws the squashed, streaked reflection in the water.
//   - caption(): caption + temperature gauge on the overlay (exact colours).
// All shaders here write DISPLAY values (no tone mapping, no colour-space conversion): sprites add in display space.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as shellPlan from "./shells.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const raw = (hex) => new THREE.Vector3(...shellPlan.hexRGB(hex));   // display-space colour (no linear conversion)
const HASH = /* glsl */ `float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const flash = { value: new THREE.Vector3() };   // shared uniform: the light the bursts throw (plan.flashAt(t))
  const time = { value: 0 };

  // ---------------------------------------------------------------- sky dome (+ water below the horizon)
  /** sky(o) -> Mesh: back-side sphere around the camera; night gradient above the horizon, water gradient below */
  function sky(o = {}) {
    const K = { ...spec.sky, ...o };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      uniforms: {
        uZenith: { value: raw(P.zenith) }, uMid: { value: raw(P.mid) }, uLow: { value: raw(P.low) }, uGlow: { value: raw(P.glow) },
        uWater: { value: raw(P.water) }, uWaterFar: { value: raw(P.waterFar) }, uFlash: flash,
        uBands: { value: new THREE.Vector3(K.bands.low, K.bands.mid, K.bands.zenith) },
        uK: { value: new THREE.Vector4(K.glowHeight, K.flashSky, K.flashWater, K.waterFade) }, uVig: { value: K.vignette }, uDither: { value: K.dither },
        uRes: { value: new THREE.Vector2(stage.width, stage.height) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uMid, uLow, uGlow, uWater, uWaterFar, uFlash, uBands; uniform vec4 uK; uniform float uVig, uDither; uniform vec2 uRes;
        varying vec3 vW;
        ${HASH}
        void main() {
          vec3 d = normalize(vW - cameraPosition);
          float e = d.y;
          vec3 c = mix(uGlow, uLow, smoothstep(0.0, uK.x, e));
          c = mix(c, uMid, smoothstep(uBands.x, uBands.y, e));
          c = mix(c, uZenith, smoothstep(uBands.y, uBands.z, e));
          c += uFlash * uK.y * (0.55 + 0.45 * smoothstep(0.5, 0.0, e));
          vec3 w = mix(uWaterFar, uWater, smoothstep(0.0, uK.w, -e));
          w += uFlash * uK.z * (0.35 + 0.65 * smoothstep(uK.w, 0.0, -e));
          c = mix(c, w, smoothstep(0.0005, -0.0015, e));
          vec2 q = gl_FragCoord.xy / uRes - 0.5;
          c *= 1.0 - uVig * dot(q, q) * 1.6;
          c += (h21(gl_FragCoord.xy) - 0.5) * uDither / 255.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(K.radius, 48, 24), mat);
    m.name = "sky"; m.renderOrder = -10; m.frustumCulled = false;
    return m;
  }

  // ---------------------------------------------------------------- skyline
  function layerGeometry(layer) {
    const pos = [], uv = [], size = [], info = [];
    const quad = (x, y, w, h, z, seed, tone) => {
      const v = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
      for (const [a, b] of v) { pos.push(x + a * w, y + b * h, z); uv.push(a * w, b * h); size.push(w, h); info.push(seed, tone); }
    };
    for (const b of layer.buildings) {
      quad(b.x, 0, b.w, b.h, layer.z, b.seed, b.tone);
      if (b.cap) quad(b.x + (b.w - b.cap.w) / 2, b.h, b.cap.w, b.cap.h, layer.z, b.seed + 0.37, b.tone);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 2));
    g.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 2));
    return g;
  }
  function skylineMaterial(K, { far = 0, refl = 0 } = {}) {
    const W = K.window, R = K.reflection;
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: false,
      uniforms: {
        uBody: { value: raw(P.building) }, uBodyLit: { value: raw(P.buildingLit) }, uGlow: { value: raw(P.glow) },
        uWarm: { value: raw(P.windowWarm) }, uCool: { value: raw(P.windowCool) }, uFlash: flash, uTime: time,
        uWin: { value: new THREE.Vector4(W.cell[0], W.cell[1], W.lit, W.coolShare) },
        uFar: { value: far * K.farTone }, uLevel: { value: W.level * (far ? 0.6 : 1) }, uFlashK: { value: K.flash * (far ? 0.5 : 1) },
        uRefl: { value: refl }, uReflK: { value: new THREE.Vector2(R.level, R.ripple) }, uWob: { value: new THREE.Vector3(...R.wobble) },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aUv, aSize, aInfo;
        varying vec2 vUv, vSize, vInfo;
        void main() { vUv = aUv; vSize = aSize; vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBody, uBodyLit, uGlow, uWarm, uCool, uFlash, uWob; uniform vec4 uWin; uniform vec2 uReflK;
        uniform float uFar, uLevel, uFlashK, uRefl, uTime;
        varying vec2 vUv, vSize, vInfo;
        ${HASH}
        void main() {
          vec2 uv = vUv;
          uv.x += sin(uv.y * uWob.x + uTime * uWob.y) * uWob.z * uRefl;      // the mirror image ripples
          float cells = floor(vSize.x / uWin.x);
          float off = (vSize.x - cells * uWin.x) * 0.5;
          vec2 g = vec2((uv.x - off) / uWin.x, (uv.y - 1.0) / uWin.y);
          vec2 id = floor(g), f = fract(g);
          float inside = step(0.0, id.x) * step(id.x, cells - 1.0) * step(0.0, id.y) * step(uv.y, vSize.y - 1.3);
          float wx = smoothstep(0.2, 0.3, f.x) * (1.0 - smoothstep(0.7, 0.8, f.x));
          float wy = smoothstep(0.24, 0.34, f.y) * (1.0 - smoothstep(0.66, 0.76, f.y));
          float lit = step(1.0 - uWin.z, h21(id + vInfo.x * 57.3));
          float cool = step(h21(id * 1.7 + vInfo.x * 13.1), uWin.w);
          float lvl = 0.5 + 0.5 * h21(id * 3.1 + vInfo.x * 7.7);
          vec3 win = mix(uWarm, uCool, cool) * lvl * uLevel;
          vec3 body = mix(mix(uBody, uBodyLit, vInfo.y), uGlow, uFar);
          float hf = clamp(uv.y / vSize.y, 0.0, 1.0);
          body += uFlash * uFlashK * (0.2 + 0.8 * hf * hf);
          vec3 c = mix(body, win, inside * wx * wy * lit);
          c *= mix(1.0, uReflK.x * (1.0 - uReflK.y * (0.5 + 0.5 * sin(vUv.y * 2.6 + uTime * 1.7))), uRefl);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }
  /** skyline(city, o) -> Group: far + near building layers and their mirror images below y = 0 */
  function skyline(city, o = {}) {
    const K = { ...spec.skyline, ...o };
    const g = new THREE.Group(); g.name = "skyline";
    [["far", 1, -9], ["near", 0, -8]].forEach(([id, far, order]) => {
      const geo = layerGeometry(city[id]);
      const up = new THREE.Mesh(geo, skylineMaterial(K, { far })); up.renderOrder = order; up.name = `${id}Skyline`;
      const down = new THREE.Mesh(geo, skylineMaterial(K, { far, refl: 1 })); down.scale.y = -1; down.renderOrder = order; down.name = `${id}Reflection`;
      up.frustumCulled = down.frustumCulled = false;
      g.add(up, down);
    });
    return g;
  }

  // ---------------------------------------------------------------- barges
  /** barges(o) -> Group: dark launch barges on the water (one per spec.barges.xs) */
  function barges(o = {}) {
    const K = { ...spec.barges, ...o };
    const g = new THREE.Group(); g.name = "barges";
    const mat = new THREE.MeshBasicMaterial({ color: P.barge, fog: false });
    for (const x of K.xs) {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(K.w, K.h, K.d), mat); hull.position.set(x, K.h / 2 - 0.2, K.z);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(K.w * 0.22, K.h * 0.9, K.d * 0.6), mat); cabin.position.set(x + K.w * 0.32, K.h + 0.2, K.z);
      const tubes = new THREE.Mesh(new THREE.BoxGeometry(K.w * 0.3, K.h * 0.7, K.d * 0.5), mat); tubes.position.set(x - K.w * 0.12, K.h + 0.1, K.z);
      g.add(hull, cabin, tubes);
    }
    g.traverse((c) => { if (c !== g) c.renderOrder = -4; });
    return g;
  }

  // ---------------------------------------------------------------- the show: one instanced draw of sprites
  function spriteMaterial(K, mirror) {
    const R = K.reflection;
    return new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: {
        uTime: time, uTwFrame: { value: 0 }, uRes: { value: new THREE.Vector2(stage.width, stage.height) },
        uMirror: { value: mirror ? 1 : 0 }, uSquash: { value: R.squash }, uDim: { value: R.dim },
        uStretch: { value: new THREE.Vector2(...R.stretch) }, uWob: { value: new THREE.Vector3(...R.wobble) },
        uGlow: { value: new THREE.Vector4(K.halo, K.haloFall, K.core, K.coreFall) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aC, aD; attribute vec4 aK, aCol, aM, aE;
        uniform float uTime, uTwFrame, uMirror, uSquash, uDim; uniform vec2 uRes, uStretch; uniform vec3 uWob;
        varying vec2 vUv; varying vec3 vCol; varying float vB;
        ${HASH}
        void main() {
          float tau = uTime - aK.x - aM.y;
          float life = aK.y;
          float on = step(0.0, tau) * step(tau, life) * (1.0 - uMirror * aE.w);
          float tt = max(tau, 0.0);
          float e = 1.0 - exp(-aK.z * tt);
          vec3 p = aC + aD * e;                                    // flight to the target under linear drag
          p.y -= aK.w / aK.z * (tt - e / aK.z);                    // droop: gravity against the same drag
          float u = clamp(tt / life, 0.0, 1.0);
          float fade = pow(max(1.0 - u * u, 1e-4), aM.w);
          float hot = 1.0 + aE.x * exp(-tt * 7.0);
          float fl = step(0.5, h21(vec2(aM.x * 91.7, uTwFrame + aM.x * 13.0)));
          float tw = 1.0 - aM.z * fl * smoothstep(aE.y, aE.y + 0.25, u + 0.0001);
          float b = on * fade * hot * tw * aE.z * mix(1.0, uDim, uMirror);
          p.x += uMirror * sin(p.y * uWob.x + uTime * uWob.y) * uWob.z;
          p.y = mix(p.y, -p.y * uSquash, uMirror);
          vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
          float size = aCol.w * (1.0 + 0.5 * exp(-tt * 8.0));
          vec2 s = size * mix(vec2(1.0), uStretch, uMirror);
          clip.xy += position.xy * s / uRes * clip.w;
          if (b <= 0.0005) clip = vec4(2.0, 2.0, 2.0, 1.0);        // dead or unborn: off screen
          gl_Position = clip;
          vUv = position.xy; vCol = aCol.rgb; vB = b;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec4 uGlow;
        varying vec2 vUv; varying vec3 vCol; varying float vB;
        void main() {
          float r2 = dot(vUv, vUv);
          float halo = max(exp(-r2 * uGlow.y) - exp(-uGlow.y), 0.0);
          float core = exp(-r2 * uGlow.w);
          vec3 c = (vCol * halo * uGlow.x + mix(vCol, vec3(1.0), 0.7) * core * uGlow.z) * vB;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }
  /**
   * show(plan, o) -> Group { sprites, reflection }: userData.update(t) sets the clock + flash light.
   *   plan = shells.planShow(...). All motion is evaluated in the vertex shader from plan.buffers.
   */
  function show(plan, o = {}) {
    const K = { ...spec.stars, ...o };
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    const B = plan.buffers;
    geo.setAttribute("aC", new THREE.InstancedBufferAttribute(B.C, 3));
    geo.setAttribute("aD", new THREE.InstancedBufferAttribute(B.D, 3));
    geo.setAttribute("aK", new THREE.InstancedBufferAttribute(B.K, 4));
    geo.setAttribute("aCol", new THREE.InstancedBufferAttribute(B.Col, 4));
    geo.setAttribute("aM", new THREE.InstancedBufferAttribute(B.M, 4));
    geo.setAttribute("aE", new THREE.InstancedBufferAttribute(B.E, 4));
    geo.instanceCount = plan.n;
    const mats = [spriteMaterial(K, true), spriteMaterial(K, false)];
    const g = new THREE.Group(); g.name = "show";
    const reflection = new THREE.Mesh(geo, mats[0]); reflection.name = "starReflections"; reflection.renderOrder = 1;
    const sprites = new THREE.Mesh(geo, mats[1]); sprites.name = "stars"; sprites.renderOrder = 2;
    reflection.frustumCulled = sprites.frustumCulled = false;
    g.add(reflection, sprites);
    g.userData.update = (t) => {
      time.value = t;
      const fr = Math.floor(t * K.twinkleHz + 1e-4);
      mats[0].uniforms.uTwFrame.value = fr; mats[1].uniforms.uTwFrame.value = fr;
      const f = plan.flashAt(t);
      flash.value.set(f[0], f[1], f[2]);
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- caption + temperature gauge (overlay)
  /** caption() -> overlay panel: userData.show(text, alpha, T) — one caption line over a cold-to-hot temperature slider */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o }, G = Q.gauge;
    const mesh = screenCanvas(stage, Q.w, Q.h, (x, W, H, st) => {
      x.fillStyle = Q.panel;
      x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, Q.radius); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.stroke();
      // caption line
      x.globalAlpha = (st.a ?? 0) / 12;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      x.letterSpacing = `${Q.spacing}px`;
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = Q.ink;
      x.fillText(st.text ?? "", W / 2, 50, W - 60);
      x.globalAlpha = 1;
      // gauge: title, track, knob
      x.font = `600 ${G.small}px ${Q.font}`;
      x.letterSpacing = "3px";
      const title = G.title, tw = x.measureText(title).width, gap = 26;
      const x0 = Math.round((W - (tw + gap + G.w)) / 2), tx = x0 + tw + gap;
      x.textAlign = "left";
      x.fillStyle = "rgba(251,243,226,0.78)";
      x.fillText(title, x0, G.y + 1);
      const grad = x.createLinearGradient(tx, 0, tx + G.w, 0);
      grad.addColorStop(0, G.cold); grad.addColorStop(0.5, G.warm); grad.addColorStop(1, G.hot);
      x.fillStyle = grad;
      x.beginPath(); x.roundRect(tx, G.y - G.h / 2, G.w, G.h, G.h / 2); x.fill();
      const kx = tx + G.w * Math.min(1, Math.max(0, (st.v ?? 0) / 400));
      x.fillStyle = "#ffffff"; x.strokeStyle = "rgba(6,8,24,0.9)"; x.lineWidth = 4;
      x.beginPath(); x.arc(kx, G.y, G.knob, 0, Math.PI * 2); x.fill(); x.stroke();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    /** show(text, alpha 0..1, T): alpha fades the caption line only; the panel and gauge stay */
    mesh.userData.show = (text, a, T = 0) => {
      mesh.userData.set({ text, a: Math.round(Math.min(1, Math.max(0, a)) * 12), v: Math.round((T / G.max) * 400) });
      mesh.userData.opacity(1);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one show
  /** harbour(plan, city) -> { sky, skyline, barges, show, update(t) } (adds itself to the scene) */
  function harbour(plan, city, o = {}) {
    const s = sky(o.sky), k = skyline(city, o.skyline), b = barges(o.barges), w = show(plan, o.stars);
    stage.scene.add(s, k, b, w);
    return { sky: s, skyline: k, barges: b, show: w, update(t) { s.position.copy(stage.camera.position); w.userData.update(t); } };
  }

  const props = { sky, skyline, barges, show, caption, harbour };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: shellPlan, motion: shellPlan,
  };
}
