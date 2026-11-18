// styles/cloud-chamber/style.js — "Cloud Chamber": invisible traffic made visible as condensation trails in side-lit mist.
// The look lives in spec.js; WHICH particle crosses WHEN and WHERE lives in tracks.js (THREE-free planner shared with
// SCORE). This file turns a plan into pictures:
//   - trails: ONE camera-facing ribbon mesh for every planned trail. Each vertex carries its own appear time (birth +
//     u × reveal), life, width, brightness and a seeded sideways drift; the shader computes age = uTime − appear and
//     from it alone the reveal, the widening, the sinking, the beading and the fade. No per-frame rebuilds, no buffers.
//   - mist: stacked additive sheets of drifting noise, brighter toward the lamp (the light sheet).
//   - chamber: black cold plate, base, glass panes + edge lines, the sheet lamp; room: a table and a wall that are only
//     seen while the room light is on. helpers.room(level, lampOn) dims the room and re-aims bloom.
//   - source: a rod lowered into the mist with a glowing bead; magnet: a coil outline on the plate that lights up.
//   - overlay caption chip (exact colours, drawn after post).
// Props never animate themselves: the scene calls update(t) / set*(…) from renderAt.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { clamp, lerp, TAU } from "../../kit/time.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as tracks from "./tracks.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const NOISE_GLSL = /* glsl */ `
float ccHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ccNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ccHash(i), ccHash(i + vec2(1.0, 0.0)), f.x), mix(ccHash(i + vec2(0.0, 1.0)), ccHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float ccFbm(vec2 p) { return ccNoise(p) * 0.55 + ccNoise(p * 2.13 + 7.7) * 0.3 + ccNoise(p * 4.7 + 19.1) * 0.15; }`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, TK = spec.tank, TR = spec.trail, MS = spec.mist;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const baseLight = Object.fromEntries(spec.lights.map((l) => [l.id, l.intensity]));
  const bgDark = new THREE.Color(P.bg), bgRoom = new THREE.Color(P.room), bg = new THREE.Color(P.bg);
  stage.scene.background = bg;
  const hx = TK.w / 2, hz = TK.d / 2;

  // ---------------------------------------------------------------- trails
  const trailVS = /* glsl */ `
    attribute vec3 aTan; attribute vec3 aWander; attribute float aSide; attribute float aBirth; attribute float aLife;
    attribute float aW; attribute float aB; attribute float aS; attribute float aSeed; attribute float aWarm;
    uniform float uTime; uniform float uWidth; uniform float uWiden; uniform float uFall; uniform float uWander; uniform float uFloor;
    varying float vSide; varying float vB; varying float vAge; varying float vA; varying float vS; varying float vSeed; varying float vWarm;
    void main() {
      float age = uTime - aBirth;
      float ag = max(age, 0.0);
      float a = clamp(ag / aLife, 0.0, 1.0);
      vec3 p = position;
      p.y = max(uFloor, p.y - uFall * ag);
      p += aWander * (uWander * ag);
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vec3 sd = cross(mat3(modelMatrix) * aTan, cameraPosition - wp.xyz);
      float l = length(sd);
      sd = l > 1e-6 ? sd / l : vec3(0.0, 1.0, 0.0);
      wp.xyz += sd * aSide * aW * uWidth * (1.0 + uWiden * a);
      vSide = aSide; vB = aB; vAge = age; vA = a; vS = aS; vSeed = aSeed; vWarm = aWarm;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const trailFS = /* glsl */ `
    uniform float uLevel; uniform float uFlash; uniform float uFlashRate; uniform float uBeadFreq; uniform float uFadeExp;
    uniform float uHeadFade; uniform float uGain; uniform vec3 uCold; uniform vec3 uWarm;
    varying float vSide; varying float vB; varying float vAge; varying float vA; varying float vS; varying float vSeed; varying float vWarm;
    ${NOISE_GLSL}
    void main() {
      float x = clamp(abs(vSide), 0.0, 1.0);
      float soft = exp(-x * x * 3.6) * (1.0 - smoothstep(0.8, 1.0, x));
      float core = exp(-x * x * 30.0);
      float born = smoothstep(0.0, uHeadFade, vAge);
      float ag = max(vAge, 0.0);
      float fade = pow(max(0.0, 1.0 - vA), uFadeExp);
      float flash = 1.0 + uFlash * exp(-ag * uFlashRate);
      // the vapour curdles into droplets: more and more of the trail falls below the threshold as it ages
      float n = ccNoise(vec2(vS * uBeadFreq + vSeed * 13.7, vSeed)) * 0.7 + ccNoise(vec2(vS * uBeadFreq * 3.1 + vSeed * 5.1, 3.3)) * 0.3;
      float cut = vA * 0.72;
      float bead = mix(1.0, smoothstep(cut - 0.1, cut + 0.3, n + 0.12), smoothstep(0.04, 0.4, vA));
      float lvl = vB * uLevel * uGain * born * fade * flash * bead * (soft * 0.5 + core * 0.5 * (1.0 - 0.6 * vA));
      gl_FragColor = vec4(mix(uCold, uWarm, vWarm) * lvl, 1.0);
    }`;

  /** trails(plan) -> { mesh, update(t, gain = 1) }: one ribbon geometry for every planned trail */
  function trails(plan) {
    let nv = 0, ni = 0;
    for (const s of plan.tracks) { nv += s.pts.length * 2; ni += (s.pts.length - 1) * 6; }
    const A = (n) => new Float32Array(nv * n);
    const pos = A(3), tan = A(3), wan = A(3), side = A(1), birth = A(1), life = A(1), W = A(1), B = A(1), S = A(1), seed = A(1), warm = A(1);
    const idx = new Uint32Array(ni);
    let v = 0, q = 0;
    for (const s of plan.tracks) {
      const v0 = v, m = s.pts.length;
      for (let i = 0; i < m; i++) {
        // the two ends taper to a point, the way a real trail thins out where the particle stops
        const taper = Math.min(1, 0.25 + (i / 3), 0.25 + (m - 1 - i) / 5);
        for (const sd of [-1, 1]) {
          pos.set(s.pts[i], v * 3); tan.set(s.tan[i], v * 3); wan.set(s.wander[i], v * 3);
          side[v] = sd; birth[v] = s.t + s.u[i] * s.reveal; life[v] = s.life; W[v] = s.width * taper; B[v] = s.bright;
          S[v] = s.s[i]; seed[v] = s.seed; warm[v] = s.warm;
          v++;
        }
      }
      for (let i = 0; i < m - 1; i++) { const a = v0 + i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], q); q += 6; }
    }
    const g = new THREE.BufferGeometry();
    const put = (name, arr, n) => g.setAttribute(name, new THREE.BufferAttribute(arr, n));
    put("position", pos, 3); put("aTan", tan, 3); put("aWander", wan, 3); put("aSide", side, 1); put("aBirth", birth, 1);
    put("aLife", life, 1); put("aW", W, 1); put("aB", B, 1); put("aS", S, 1); put("aSeed", seed, 1); put("aWarm", warm, 1);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.ShaderMaterial({
      name: "trail", vertexShader: trailVS, fragmentShader: trailFS,
      uniforms: {
        uTime: { value: -1 }, uWidth: { value: TR.width }, uWiden: { value: TR.widen }, uFall: { value: TR.fall },
        uWander: { value: TR.wander }, uFloor: { value: 0.03 }, uLevel: { value: TR.level }, uFlash: { value: TR.flash },
        uFlashRate: { value: TR.flashRate }, uBeadFreq: { value: TR.beadFreq }, uFadeExp: { value: TR.fadeExp },
        uHeadFade: { value: TR.headFade }, uGain: { value: 1 }, uCold: { value: new THREE.Color(P.trail) }, uWarm: { value: new THREE.Color(P.trailWarm) },
      },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.name = "trails"; mesh.frustumCulled = false; mesh.renderOrder = 5;
    stage.scene.add(mesh);
    return { mesh, update(t, gain = 1) { mat.uniforms.uTime.value = t; mat.uniforms.uGain.value = gain; } };
  }

  // ---------------------------------------------------------------- mist (the light sheet)
  /** mist() -> { group, update(t, level = 1) }: stacked additive noise sheets inside the tank */
  function mist() {
    const group = new THREE.Group(); group.name = "mist";
    const geo = new THREE.PlaneGeometry(TK.w - 0.04, TK.d - 0.04); geo.rotateX(-Math.PI / 2);
    const mats = [];
    for (let k = 0; k < MS.layers; k++) {
      const mat = new THREE.ShaderMaterial({
        name: `mist${k}`,
        uniforms: {
          uTime: { value: 0 }, uLevel: { value: MS.level }, uLayer: { value: k }, uScale: { value: MS.scale },
          uDrift: { value: new THREE.Vector2(...MS.drift) }, uContrast: { value: MS.contrast }, uFalloff: { value: MS.lampFalloff },
          uEdge: { value: MS.edge }, uHalf: { value: new THREE.Vector2(hx, hz) }, uCol: { value: new THREE.Color(P.mist) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uLevel; uniform float uLayer; uniform float uScale; uniform vec2 uDrift;
          uniform float uContrast; uniform float uFalloff; uniform float uEdge; uniform vec2 uHalf; uniform vec3 uCol;
          varying vec3 vW;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vW.xz * uScale + uDrift * uTime * (1.0 + 0.25 * uLayer) + vec2(uLayer * 7.31, uLayer * 3.17);
            float n = ccFbm(p);
            float wisp = pow(clamp(n * 1.25, 0.0, 1.0), uContrast);
            float lamp = 0.35 + 0.65 * exp(-(vW.x + uHalf.x) / uFalloff);
            vec2 e = smoothstep(vec2(0.0), vec2(uEdge), uHalf - abs(vW.xz));
            gl_FragColor = vec4(uCol * (uLevel * (0.3 + 1.5 * wisp) * lamp * (0.25 + 0.75 * e.x * e.y)), 1.0);
          }`,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = lerp(TK.mist[0], TK.mist[1], MS.layers > 1 ? k / (MS.layers - 1) : 0.5);
      m.renderOrder = 3; m.frustumCulled = false;
      group.add(m); mats.push(mat);
    }
    stage.scene.add(group);
    return { group, update(t, level = 1) { for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.uLevel.value = MS.level * level; } } };
  }

  // ---------------------------------------------------------------- the instrument
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
  const glow = (hex, level) => { const c = new THREE.Color(hex).multiplyScalar(level); return new THREE.MeshBasicMaterial({ color: c, toneMapped: true, fog: false }); };
  const paneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.mist).multiplyScalar(spec.glass.pane), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  paneMat.name = "pane";
  const edgeMat = glow(P.lamp, spec.glass.edge); edgeMat.name = "glassEdge";
  const lampMat = glow(P.lamp, spec.lamp.level); lampMat.name = "lamp";
  const paneBase = new THREE.Color(P.mist), lampBase = new THREE.Color(P.lamp);

  /** chamber() -> Group: cold plate, base, glass tank (panes + edge lines), the sheet lamp on the left wall */
  function chamber() {
    const G = new THREE.Group(); G.name = "chamber";
    const baseH = 0.7, lip = 0.35;
    const plate = box(TK.w + 0.1, 0.06, TK.d + 0.1, materials.plate, 0, -0.03, 0); plate.name = "plate"; plate.receiveShadow = true;
    const base = box(TK.w + lip * 2, baseH, TK.d + lip * 2, materials.base, 0, -0.06 - baseH / 2, 0); base.name = "base";
    base.castShadow = base.receiveShadow = true;
    G.add(plate, base);
    // glass: four panes (additive, a whisper) and thin bright edge lines where the glass catches light
    const r = spec.glass.rail * 0.5, H = TK.h;
    const pane = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paneMat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; return m; };
    G.add(pane(TK.w, H, 0, H / 2, -hz, 0), pane(TK.w, H, 0, H / 2, hz, 0), pane(TK.d, H, -hx, H / 2, 0, Math.PI / 2), pane(TK.d, H, hx, H / 2, 0, Math.PI / 2));
    for (const z of [-hz, hz]) G.add(box(TK.w + r, r, r, edgeMat, 0, H, z));
    for (const x of [-hx, hx]) G.add(box(r, r, TK.d + r, edgeMat, x, H, 0));
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) G.add(box(r, H, r, edgeMat, x, H / 2, z));
    // metal foot rail round the glass
    for (const z of [-hz, hz]) G.add(box(TK.w + 0.16, 0.08, 0.08, materials.frame, 0, 0.04, z + Math.sign(z) * 0.04));
    for (const x of [-hx, hx]) G.add(box(0.08, 0.08, TK.d + 0.16, materials.frame, x + Math.sign(x) * 0.04, 0.04, 0));
    // the sheet lamp: a light bar outside the left wall at mist height, in a dark housing
    const [lw, lh, ld] = spec.lamp.size;
    const bar = box(lw * 0.4, lh * 0.55, ld, lampMat, -hx - 0.14, (TK.mist[0] + TK.mist[1]) / 2, 0); bar.name = "lampBar";
    const house = box(lw, lh, ld + 0.2, materials.frame, -hx - 0.14 - lw * 0.6, (TK.mist[0] + TK.mist[1]) / 2, 0); house.name = "lampHousing";
    G.add(bar, house);
    stage.scene.add(G);
    return G;
  }

  /** room() -> Group: the table the instrument stands on and the wall behind it (only seen with the room light on) */
  function room() {
    const G = new THREE.Group(); G.name = "room";
    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), materials.table);
    table.rotation.x = -Math.PI / 2; table.position.set(0, -0.76, -4); table.receiveShadow = true; table.name = "table";
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), materials.wall);
    wall.position.set(0, 12, -13); wall.name = "wall";
    G.add(table, wall);
    stage.scene.add(G);
    return G;
  }

  /**
   * helpers.room(level, lampOn = 1): level 1 = ordinary lit room, 0 = lights off. Scales the room lights, the
   * background, the glass reflections and the bloom threshold (a lit room must not haze); lampOn switches the sheet lamp.
   */
  function roomLevel(level, lampOn = 1) {
    const L = lerp(spec.room.dark, 1, clamp(level));
    lights.roomSky.intensity = baseLight.roomSky * L;
    lights.roomKey.intensity = baseLight.roomKey * L;
    lights.sheet.intensity = baseLight.sheet * lampOn;
    bg.copy(bgDark).lerp(bgRoom, clamp(level));
    paneMat.color.copy(paneBase).multiplyScalar(lerp(spec.glass.pane, spec.glass.paneLit, clamp(level)));
    edgeMat.color.copy(lampBase).multiplyScalar(lerp(spec.glass.edge, 0.9, clamp(level)));
    lampMat.color.copy(lampBase).multiplyScalar(lerp(0.12, spec.lamp.level, clamp(lampOn)));
    if (post) post.set({ bloom: { threshold: lerp(spec.post.bloom.threshold, spec.room.bloomBright, clamp(level)) } });
    return L;
  }

  /** source({ p: [x, z] }) -> { group, update(u, level = 1) }: a rod lowered from above (u 0 = out of frame, 1 = in the mist) with a glowing bead */
  function source(o = {}) {
    const Q = spec.source, [sx, sz] = o.p ?? [0, 0];
    const yTip = (TK.mist[0] + TK.mist[1]) / 2;
    const G = new THREE.Group(); G.name = "source";
    const rodL = 5;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(Q.rodR, Q.rodR, rodL, 16), materials.rod); rod.position.y = rodL / 2 + Q.beadR * 0.6;
    const beadMat = glow(P.source, Q.level); beadMat.name = "sourceBead";
    const bead = new THREE.Mesh(new THREE.SphereGeometry(Q.beadR, 24, 16), beadMat);
    const light = new THREE.PointLight(P.source, 0, 5, 2); light.name = "sourceLight"; light.position.y = 0.15;
    G.add(rod, bead, light);
    G.position.set(sx, yTip, sz);
    stage.scene.add(G);
    const cBase = new THREE.Color(P.source);
    return {
      group: G, tip: [sx, yTip, sz],
      update(u, level = 1) {
        const k = clamp(u);
        G.visible = k > 0.001;
        G.position.y = yTip + Q.drop * (1 - k);
        beadMat.color.copy(cBase).multiplyScalar(Q.level * level);
        light.intensity = Q.light * level * k;
      },
    };
  }

  /** magnet() -> { group, setLevel(k) }: a coil outline on the plate that glows when the field is on */
  function magnet() {
    const Q = spec.magnet, G = new THREE.Group(); G.name = "magnet";
    const mat = glow(P.magnet, 0); mat.name = "coil";
    const w = TK.w - Q.inset * 2, d = TK.d - Q.inset * 2, y = 0.012;
    for (const z of [-d / 2, d / 2]) G.add(box(w + Q.width, 0.02, Q.width, mat, 0, y, z));
    for (const x of [-w / 2, w / 2]) G.add(box(Q.width, 0.02, d + Q.width, mat, x, y, 0));
    stage.scene.add(G);
    const cBase = new THREE.Color(P.magnet);
    return { group: G, setLevel(k) { G.visible = k > 0.002; mat.color.copy(cBase).multiplyScalar(Q.level * clamp(k, 0, 2)); } };
  }

  // ---------------------------------------------------------------- overlay
  /** caption() -> chip top-left (cold dot, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width), pad = 34, dot = 13;
      const pw = Math.min(W - 12, pad + dot * 2 + 22 + tw + pad), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 18); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 17); x.stroke();
      const cy = oy + ph / 2;
      const g = x.createRadialGradient(ox + pad + dot, cy, 0, ox + pad + dot, cy, dot * 2);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, Q.dot); g.addColorStop(1, "rgba(143,184,255,0)");
      x.fillStyle = g; x.beginPath(); x.arc(ox + pad + dot, cy, dot * 2, 0, TAU); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + dot * 2 + 22, cy + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { trails, mist, chamber, room, source, magnet, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    helpers: { room: roomLevel }, plan: tracks, motion: tracks,
  };
}
