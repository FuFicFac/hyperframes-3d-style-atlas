// styles/lichtenberg/style.js — "Lichtenberg": fractal wood burning. The look lives in spec.js; WHERE every groove is,
// how thick, and WHEN it burns lives in burnplan.js (THREE-free planner shared with SCORE). This file turns a plan into
// pictures: the plan is baked ONCE into two float textures (distance to the nearest groove + its burn time + halo
// radius; distance to the widened winning channel + position along it) and one MeshStandardMaterial with an injected
// fragment block draws arc / ember / char / scorch / return-stroke from a single time uniform. Tip flares and smoke
// wisps are two small InstancedMeshes rewritten from the plan each frame. Props never animate themselves: the scene
// calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS, createTextLabel } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { paintPixels, canvasTexture } from "../../kit/textures.js";
import { fbm2 } from "../../kit/noise.js";
import { pulse } from "../../kit/schedule.js";
import { hash01, clamp, lerp, smoothstep } from "../../kit/time.js";
import * as burnplan from "./burnplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const BURN_PARS = /* glsl */ `
uniform sampler2D uBurn; uniform sampler2D uWin;
uniform float uTime; uniform float uFrame;
uniform vec3 uChar; uniform vec3 uScorch; uniform vec3 uEmberHot; uniform vec3 uEmberCool; uniform vec3 uArcCol; uniform vec3 uFlashCol; uniform vec3 uWinHot;
uniform vec4 uHalo;   // fall, amount, time, char grain
uniform vec4 uEmber;  // tau, tau per mm of halo radius, gain, spill
uniform vec4 uArc;    // tau, gain, spill, -
uniform vec4 uWinT;   // connect time, sweep, -, -
uniform vec4 uWinA;   // flash tau, flash gain, inner (mm), hot gain
uniform vec4 uWinB;   // glow radius (mm), sustain, cool tau, -
varying vec2 vBurnUv;
`;
const BURN_FRAG = /* glsl */ `
{
  vec4 bf = texture2D(uBurn, vBurnUv);
  float bd = bf.r, bAge = uTime - bf.g, bh = max(bf.b, 1.0);
  float bAA = max(fwidth(bd), 0.02) * 0.75;
  float bOn = smoothstep(0.0, 0.04, bAge);
  float bPos = max(bAge, 0.0), bOut = max(bd, 0.0);
  float core = (1.0 - smoothstep(-bAA, bAA, bd)) * bOn;
  float halo = exp(-bOut / (bh * uHalo.x)) * smoothstep(0.0, uHalo.z, bAge) * uHalo.y;
  vec3 woodLin = diffuseColor.rgb;
  float woodLum = dot(woodLin, vec3(0.3333));
  vec3 charCol = uChar * (1.0 + uHalo.w * (woodLum - 0.5));
  diffuseColor.rgb = mix(woodLin, woodLin * uScorch, halo * (1.0 - core));
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, core);
  float ember = bOn * exp(-bPos / (uEmber.x + bh * uEmber.y));
  float spill = exp(-bOut / (bh * uEmber.w));
  vec3 emberCol = mix(uEmberCool, uEmberHot, pow(ember, 0.6));
  totalEmissiveRadiance += emberCol * ember * uEmber.z * (core + 0.4 * spill * (1.0 - core));
  float arc = bOn * exp(-bPos / uArc.x) * (0.7 + 0.3 * sin(bf.g * 61.0 + uFrame * 2.399));
  totalEmissiveRadiance += uArcCol * arc * uArc.y * exp(-bOut / (bh * uArc.z));

  vec4 wf = texture2D(uWin, vBurnUv);
  float fa = uTime - (uWinT.x + (1.0 - wf.g) * uWinT.y);
  float won = smoothstep(0.0, 0.03, fa);
  float fPos = max(fa, 0.0);
  float flash = won * exp(-fPos / uWinA.x);
  float wAA = max(fwidth(wf.r), 0.02) * 0.75;
  float coreW = (1.0 - smoothstep(-wAA, wAA, wf.r)) * won;
  float innerW = (1.0 - smoothstep(-uWinA.z, -uWinA.z * 0.72, wf.r)) * won;
  float glowW = exp(-max(wf.r, 0.0) / (uWinB.x * (0.3 + flash))) * won;
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, coreW);
  roughnessFactor = mix(roughnessFactor, 0.92, max(core, coreW));
  float hot = uWinB.y + (1.0 - uWinB.y) * exp(-fPos / uWinB.z);
  totalEmissiveRadiance += uFlashCol * flash * uWinA.y * (coreW + 0.3 * glowW * (1.0 - coreW));
  totalEmissiveRadiance += uWinHot * hot * uWinA.w * (1.0 - flash) * (innerW + 0.2 * glowW * (1.0 - coreW));
}
`;

const PUFF_VERT = /* glsl */ `
attribute vec4 aTint; varying vec4 vTint; varying vec2 vUv;
void main() { vUv = uv; vTint = aTint; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }
`;
const GLINT_FRAG = /* glsl */ `
varying vec4 vTint; varying vec2 vUv;
void main() {
  float r = min(length(vUv - 0.5) * 2.0, 1.0);
  float a = (1.0 - r) * (1.0 - r) * (1.0 - r) * 0.35 + pow(max(0.0, 1.0 - r * 3.2), 2.0) * 2.4;
  gl_FragColor = vec4(vTint.rgb * a * vTint.a, 1.0);
}
`;
const SMOKE_FRAG = /* glsl */ `
varying vec4 vTint; varying vec2 vUv;
void main() {
  vec2 q = vUv - 0.5;
  float r = min(length(q) * 2.0, 1.0);
  float lobes = 0.82 + 0.18 * sin(atan(q.y, q.x + 1e-5) * 3.0 + vTint.r * 40.0);
  float a = (1.0 - smoothstep(0.15 * lobes, lobes, r));
  gl_FragColor = vec4(vTint.gbb * vec3(1.0, 1.0, 1.12), a * vTint.a);
}
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, BD = spec.board, EL = spec.electrodes;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const W = BD.w, H = BD.h, TOP = BD.y;
  const toWorld = (x, y, lift = 0) => [x - W / 2, TOP + lift, y - H / 2];
  const lin = (hex) => new THREE.Color(hex);

  // ---------------------------------------------------------------- pale maple, painted once (seeded)
  function woodMap(seed = BD.seed) {
    const cl = [P.woodDark, P.woodMid, P.wood].map((h) => { const c = new THREE.Color(h); return c.convertLinearToSRGB(), [c.r, c.g, c.b]; });
    const canvas = paintPixels(BD.woodPx, (u, v) => {
      const warp = fbm2(u * 2.4, v * 2.6, { seed, octaves: 3 });
      const ring = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (v * 21 + warp * 5.5));
      const line = smoothstep(0.7, 1, ring);
      const streak = fbm2(u * 5, v * 90, { seed: seed + 3, octaves: 3 });
      const fleck = fbm2(u * 260, v * 60, { seed: seed + 5, octaves: 2 });
      const broad = fbm2(u * 1.6, v * 2.2, { seed: seed + 9, octaves: 2 });
      const k = clamp(0.74 + (streak - 0.5) * 0.42 + (fleck - 0.5) * 0.14 + (broad - 0.5) * 0.3 - line * 0.26);
      const a = k < 0.5 ? cl[0] : cl[1], z = k < 0.5 ? cl[1] : cl[2], kk = k < 0.5 ? k * 2 : (k - 0.5) * 2;
      return [lerp(a[0], z[0], kk), lerp(a[1], z[1], kk), lerp(a[2], z[2], kk)];
    });
    const tex = canvasTexture(canvas, { repeat: [1, 1] });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // ---------------------------------------------------------------- the plan as two float textures
  function fieldTextures(plan) {
    const f = burnplan.bakeField(plan, { pxPerMetre: BD.pxPerMetre, halo: spec.burn.halo, winHalf: spec.width.win, winGlow: spec.burn.win.glow });
    const floatLinear = stage.renderer.extensions.has("OES_texture_float_linear");
    const make = (arr) => {
      let data = arr, type = THREE.FloatType;
      if (!floatLinear) { // half floats filter linearly everywhere
        data = new Uint16Array(arr.length);
        for (let i = 0; i < arr.length; i++) data[i] = THREE.DataUtils.toHalfFloat(clamp(arr[i], -60000, 60000));
        type = THREE.HalfFloatType;
      }
      const t = new THREE.DataTexture(data, f.w, f.h, THREE.RGBAFormat, type);
      t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      stage.renderer.initTexture(t);
      return t;
    };
    return { burn: make(f.burn), win: make(f.win), w: f.w, h: f.h };
  }

  /** burnMaterial(plan) -> MeshStandardMaterial (wood + the burn block); userData.setTime(t) */
  function burnMaterial(plan) {
    const B = spec.burn, T = plan.times;
    const tex = fieldTextures(plan);
    const mat = materials.wood.clone();
    mat.name = "woodBurn";
    mat.map = woodMap();
    const U = {
      uBurn: { value: tex.burn }, uWin: { value: tex.win }, uTime: { value: 0 }, uFrame: { value: 0 },
      uChar: { value: lin(P.char) }, uScorch: { value: lin(P.scorch) }, uEmberHot: { value: lin(P.ember) }, uEmberCool: { value: lin(P.emberCool) },
      uArcCol: { value: lin(P.arc) }, uFlashCol: { value: lin(P.flash) }, uWinHot: { value: lin(P.winHot) },
      uHalo: { value: new THREE.Vector4(B.halo.fall, B.halo.amount, B.halo.time, B.char.grain) },
      uEmber: { value: new THREE.Vector4(B.ember.tau, B.ember.widthTau, B.ember.gain, B.ember.spill) },
      uArc: { value: new THREE.Vector4(B.arc.tau, B.arc.gain, B.arc.spill, 0) },
      uWinT: { value: new THREE.Vector4(T.connect, T.sweep, 0, 0) },
      uWinA: { value: new THREE.Vector4(B.win.flashTau, B.win.flashGain, B.win.inner, B.win.hotGain) },
      uWinB: { value: new THREE.Vector4(B.win.glow * 1000, B.win.sustain, B.win.cool, 0) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vBurnUv;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvBurnUv = vec2(uv.x, 1.0 - uv.y);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + BURN_PARS)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + BURN_FRAG);
    };
    mat.customProgramCacheKey = () => "lichtenberg-burn-1";
    mat.userData.uniforms = U;
    mat.userData.setTime = (t) => { U.uTime.value = t; U.uFrame.value = Math.floor(t * 30 + 1e-6); };
    return mat;
  }

  // ---------------------------------------------------------------- set pieces
  /** bench() -> dark slate cutting mat under the board */
  function bench(o = {}) {
    const size = o.size ?? spec.bench.size;
    const mat = materials.bench;
    if (mat.map) mat.map.repeat.set(size / spec.bench.gridMetres, size / spec.bench.gridMetres);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "bench";
    return m;
  }

  /** board(plan) -> Group: the slab + the burn-shaded top; userData.setTime(t) */
  function board(plan) {
    const g = new THREE.Group(); g.name = "board";
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, BD.thickness - 0.001, H), materials.woodEdge);
    slab.position.y = TOP - BD.thickness + (BD.thickness - 0.001) / 2;
    slab.castShadow = slab.receiveShadow = true; g.add(slab);
    const mat = burnMaterial(plan);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    top.rotation.x = -Math.PI / 2; top.position.y = TOP; top.receiveShadow = true; top.name = "boardTop";
    g.add(top);
    g.userData.setTime = mat.userData.setTime; g.userData.top = top; g.userData.material = mat;
    return g;
  }

  /** electrode({ at: [x, y] board coords, side: -1 | 1, lead: material name, tag }) -> Group (copper puck, bolt, ring terminal, lead off the board, stamped tag) */
  function electrode(o = {}) {
    const g = new THREE.Group(); g.name = "electrode";
    const [X, , Z] = toWorld(o.at[0], o.at[1]), side = o.side ?? -1;
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(EL.r, EL.r * 1.06, EL.h, 40), materials.copper);
    puck.position.set(X, TOP + EL.h / 2, Z); g.add(puck);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(EL.bolt, EL.bolt, 0.012, 6), materials.steel);
    bolt.position.set(X, TOP + EL.h + 0.006, Z); g.add(bolt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(EL.bolt * 1.5, 0.0045, 10, 28), materials.steel);
    ring.rotation.x = Math.PI / 2; ring.position.set(X, TOP + EL.h + 0.003, Z); g.add(ring);
    const y1 = TOP + EL.h + 0.006, edge = side * (W / 2);
    const pts = [
      [X + side * EL.bolt * 1.6, y1, Z], [X + side * 0.06, y1 + 0.012, Z + 0.004], [edge + side * 0.03, TOP + 0.004, Z + 0.02],
      [edge + side * 0.16, EL.lead, Z + 0.1], [edge + side * 0.5, EL.lead, Z + 0.34], [edge + side * 1.4, EL.lead, Z + 0.5],
    ].map((p) => new THREE.Vector3(...p));
    const lead = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, EL.lead, 10, false), materials[o.lead ?? "leadQ"]);
    g.add(lead);
    const crimp = new THREE.Mesh(new THREE.CylinderGeometry(EL.lead * 1.25, EL.lead * 1.25, 0.03, 12), materials.steel);
    crimp.rotation.z = Math.PI / 2; crimp.position.set(X + side * (EL.bolt * 1.6 + 0.012), y1, Z); g.add(crimp);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (o.tag) {
      const tg = createTextLabel(o.tag, { height: EL.tag.cap * 1.5, font: textStyle.font, weight: textStyle.weight, color: P.ink, letterSpacing: 6, lit: false });
      tg.rotation.x = -Math.PI / 2;
      tg.position.set(X + (o.tagDx ?? 0), TOP + 0.0006, Z + EL.tag.dy);
      tg.material.transparent = true; tg.material.opacity = EL.tag.opacity; tg.material.depthWrite = false;
      tg.castShadow = false; tg.renderOrder = 1; tg.name = "tag";
      g.add(tg); g.userData.tag = tg;
    }
    return g;
  }

  // ---------------------------------------------------------------- tip flares (additive) and smoke wisps
  const puffMesh = (max, frag, blending) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    const mat = new THREE.ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false; mesh.count = 0; mesh.userData.noDepth = true;
    return mesh;
  };

  /** glints(plan) -> InstancedMesh of flat additive flares at every burning front + both electrodes; userData.update(t) */
  function glints(plan) {
    const G = spec.glints, T = plan.times, F = spec.flash;
    const mesh = puffMesh(G.max + 4, GLINT_FRAG, THREE.AdditiveBlending);
    mesh.name = "glints"; mesh.renderOrder = 3;
    const tips = new Float32Array(G.max * 4), M = mesh.instanceMatrix.array, tint = mesh.geometry.attributes.aTint;
    const arc = lin(P.arc), flashC = lin(P.flash);
    const put = (i, x, y, size, c, a) => {
      const [X, Y, Z] = toWorld(x, y, 0.004 + i * 1e-5), b = i * 16;
      // a flat quad lying on the board: local x -> world X, local y -> world -Z
      M[b] = size; M[b + 1] = 0; M[b + 2] = 0; M[b + 3] = 0;
      M[b + 4] = 0; M[b + 5] = 0; M[b + 6] = -size; M[b + 7] = 0;
      M[b + 8] = 0; M[b + 9] = 1; M[b + 10] = 0; M[b + 11] = 0;
      M[b + 12] = X; M[b + 13] = Y; M[b + 14] = Z; M[b + 15] = 1;
      tint.setXYZW(i, c.r, c.g, c.b, a);
    };
    mesh.userData.update = (t) => {
      const fr = Math.floor(t * 30 + 1e-6);
      let n = 0;
      const c = plan.tipsAt(t, tips, G.max);
      for (let i = 0; i < c; i++) {
        const fl = 1 - G.flicker * hash01(fr, i, 7);
        put(n++, tips[4 * i], tips[4 * i + 1], (G.size + G.sizeW * tips[4 * i + 2]) * (0.8 + 0.4 * hash01(fr, i, 11)), arc, G.gain * tips[4 * i + 3] * fl);
      }
      // question electrode: faint pre-sparks, then a steady flicker while anything burns
      const pre = smoothstep(0.05, T.start, t) * (1 - smoothstep(T.start, T.start + 0.3, t)) * G.pre * 4, on = smoothstep(T.start - 0.02, T.start + 0.1, t) * (1 - smoothstep(T.connect + 0.5, T.connect + 1.4, t));
      const qa = (pre + on) * (0.55 + 0.45 * hash01(fr, 91));
      if (qa > 0.002) put(n++, plan.q[0], plan.q[1], G.electrode * (0.75 + 0.5 * hash01(fr, 93)), arc, G.gain * 0.16 * qa);
      // both electrodes flare on the connection
      const fz = pulse(t, T.connect, { rise: 0.03, hold: 0.12, fall: 1.0 });
      if (fz > 0.002) {
        put(n++, plan.a[0], plan.a[1], G.electrode * 2.4 * (0.8 + 0.2 * hash01(fr, 95)), flashC, G.gain * 1.3 * fz);
        put(n++, plan.q[0], plan.q[1], G.electrode * 2.0, flashC, G.gain * 1.0 * pulse(t, T.connect + T.sweep, { rise: 0.03, hold: 0.1, fall: 0.9 }));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true; tint.needsUpdate = true;
    };
    return mesh;
  }

  /** smoke(plan) -> InstancedMesh of camera-facing wisps; userData.update(t, camera) (call after the camera rig) */
  function smoke(plan) {
    const SM = spec.smoke;
    const mesh = puffMesh(SM.max, SMOKE_FRAG, THREE.NormalBlending);
    mesh.name = "smoke"; mesh.renderOrder = 4;
    const tint = mesh.geometry.attributes.aTint, col = lin(P.smoke);
    const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    mesh.userData.update = (t, camera) => {
      let n = 0;
      for (const w of plan.wisps) {
        if (w.t > t) break;
        const age = t - w.t;
        if (age >= w.life || n >= SM.max) continue;
        const u = age / w.life, sway = Math.sin(age * 2.1 + w.seed * 1.7) * 0.012 * u;
        const [X, Y, Z] = toWorld(w.x, w.y, 0.03 + SM.rise * age);
        pos.set(X + SM.drift[0] * age + sway, Y, Z + SM.drift[1] * age);
        const s = w.size * (1 + SM.grow * u);
        sc.set(s, s, s);
        m4.compose(pos, camera.quaternion, sc);
        m4.toArray(mesh.instanceMatrix.array, n * 16);
        tint.setXYZW(n, hash01(w.seed, 3), col.g, col.b, SM.alpha * smoothstep(0, 0.14, u) * Math.pow(1 - u, 1.2));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true; tint.needsUpdate = true;
    };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay: caption chip (top-left)
  /** caption() -> overlay chip (char plate, a small burnt-branch icon, cream text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.3)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(Wc - 16, pad + ic + Math.round(pad * 0.7) + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.3)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2.5; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 15); x.stroke();
      // icon: a tiny branching burn
      const cx = ox + pad, cy = oy + ph / 2;
      x.strokeStyle = Q.icon; x.lineCap = "round"; x.lineJoin = "round";
      const seg = (w, pts) => { x.lineWidth = w; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(cx + p[0] * ic, cy + p[1] * ic) : x.moveTo(cx + p[0] * ic, cy + p[1] * ic))); x.stroke(); };
      seg(5, [[0, 0.05], [0.28, -0.02], [0.52, 0.06], [0.98, -0.04]]);
      seg(3.2, [[0.28, -0.02], [0.44, -0.26], [0.7, -0.36]]);
      seg(3.2, [[0.52, 0.06], [0.66, 0.3], [0.9, 0.36]]);
      seg(2.2, [[0.44, -0.26], [0.4, -0.42]]);
      seg(2.2, [[0.66, 0.3], [0.56, 0.42]]);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.7), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * burnBoard(plan, { tags = true }) -> { group, board, glints, smoke, update(t, camera), shake(t) } (adds itself)
   *   update(t, camera): burn uniforms, tip flares, smoke (camera-facing: call AFTER the camera rig), the key-light dip
   *   and bloom lift on the connection. shake(t) -> [dx, dy, dz] metres to ADD to the rig's camera position (assigned from t).
   */
  function burnBoard(plan, o = {}) {
    const group = new THREE.Group(); group.name = "lichtenberg";
    group.add(bench());
    const bd = board(plan); group.add(bd);
    const tags = o.tags ?? true;
    group.add(electrode({ at: plan.q, side: -1, lead: "leadQ", tag: tags ? EL.tag.q : null, tagDx: 0.038 }));
    group.add(electrode({ at: plan.a, side: 1, lead: "leadA", tag: tags ? EL.tag.a : null, tagDx: -0.012 }));
    const gl = glints(plan); group.add(gl);
    const sm = smoke(plan); group.add(sm);
    stage.scene.add(group);
    const F = spec.flash, T = plan.times;
    const base = { key: lights.key?.intensity ?? 0, fill: lights.fill?.intensity ?? 0, env: stage.scene.environmentIntensity ?? 1, bloom: spec.post.bloom?.strength ?? 0 };
    const flashAt = (t) => pulse(t, T.connect, { rise: F.rise, hold: F.hold, fall: F.fall });
    return {
      group, board: bd, glints: gl, smoke: sm, flashAt,
      update(t, camera) {
        bd.userData.setTime(t);
        gl.userData.update(t);
        sm.userData.update(t, camera ?? stage.camera);
        const f = flashAt(t), k = 1 - F.dim * f;
        if (lights.key) lights.key.intensity = base.key * k;
        if (lights.fill) lights.fill.intensity = base.fill * k;
        stage.scene.environmentIntensity = base.env * k;
        if (post?.set && spec.post.bloom) post.set({ bloom: { strength: base.bloom + F.bloom * f } });
      },
      shake(t) {
        const a = t - T.connect;
        if (a < 0 || a > F.shakeDur) return [0, 0, 0];
        const fr = Math.floor(t * 30 + 1e-6), k = F.shake * (1 - a / F.shakeDur);
        return [(hash01(fr, 201) - 0.5) * 2 * k, 0, (hash01(fr, 203) - 0.5) * 2 * k];
      },
    };
  }

  const props = { bench, board, electrode, glints, smoke, caption, burnBoard, burnMaterial, woodMap };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: burnplan, motion: burnplan, toWorld,
  };
}
