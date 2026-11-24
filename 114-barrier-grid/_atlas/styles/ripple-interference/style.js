// styles/ripple-interference/style.js — "Ripple Interference": a shallow ripple tank on a dark walnut bench, two brass
// dippers on one bar, two flagged corks. The look lives in spec.js; WHERE the water is at any t lives in ripple.js
// (THREE-free planner shared with SCORE). This file turns a plan into pictures: bench + backdrop, the tank, ONE water
// mesh with one ShaderMaterial (height + normals from plan.glsl(), refraction to an analytic tiled floor, caustic bands,
// Fresnel reflection of an analytic studio), the bar + dippers, the corks, an overlay caption plate.
// Props never animate themselves: the scene calls update(t), and every update assigns from t (no accumulation).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { createCyclorama } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, speckleTexture } from "../../kit/textures.js";
import { TAU } from "../../kit/time.js";
import * as ripple from "./ripple.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const g3 = (a) => `vec3(${a.map((x) => { const s = String(+(+x).toPrecision(7)); return /[.eE]/.test(s) ? s : s + ".0"; }).join(", ")})`;
const g1 = (x) => g3([x]).slice(5, -1);

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, TK = spec.tank, R = spec.rig, WA = spec.water;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

  // walnut bench top (kit woodTexture), speckled cork
  const Wn = spec.walnut;
  materials.bench.map = woodTexture({ size: 512, boards: Wn.boards, seed: Wn.seed, dark: Wn.dark, mid: Wn.mid, light: Wn.light, seam: Wn.seam, contrast: Wn.contrast, grainFreq: Wn.grainFreq, repeat: [Wn.perMetre * 9, Wn.perMetre * 6] });
  materials.bench.needsUpdate = true;
  materials.cork.map = speckleTexture({ size: 256, density: 0.3, base: P.cork, dots: ["#a07246", "#b88a55", "#e3bd8a"], radius: [0.6, 1.6], seed: 1011 });
  materials.cork.needsUpdate = true;

  // ---------------------------------------------------------------- bench + backdrop
  /** bench() -> Group: a dark walnut bench top (top face at y = 0) in a pale studio sweep */
  function bench() {
    const g = new THREE.Group(); g.name = "bench";
    const top = shadow(new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.9, 6.8), [materials.bench, materials.bench, materials.bench, materials.bench, materials.bench, materials.bench]), false, true);
    top.position.y = -0.45; g.add(top);
    const cyc = createCyclorama({ width: 60, depth: 30, height: 18, radius: 6, segments: 24, material: materials.wall });
    cyc.position.set(0, -0.9, -6); cyc.receiveShadow = true; g.add(cyc);
    return g;
  }

  // ---------------------------------------------------------------- tank walls (the water is its own mesh)
  /** tank() -> Group: four walls with a pale glossy rim and a base slab; inner box = +-halfX, +-halfZ */
  function tank() {
    const g = new THREE.Group(); g.name = "tank";
    const w = TK.wall, H = TK.rimY, X = TK.halfX + w, Z = TK.halfZ + w;
    const wallMats = [materials.tankSide, materials.tankSide, materials.tankRim, materials.tankSide, materials.tankSide, materials.tankSide];
    const add = (sx, sz, px, pz) => { const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), wallMats)); m.position.set(px, H / 2, pz); g.add(m); };
    add(2 * X, w, 0, -TK.halfZ - w / 2); add(2 * X, w, 0, TK.halfZ + w / 2);
    add(w, 2 * TK.halfZ, -TK.halfX - w / 2, 0); add(w, 2 * TK.halfZ, TK.halfX + w / 2, 0);
    return g;
  }

  // ---------------------------------------------------------------- the water: one mesh, one shader
  /** water(plan) -> Mesh with userData.update(t). Height and normals come from plan.glsl() (the twin of plan.height). */
  function water(plan) {
    const geo = new THREE.PlaneGeometry(2 * TK.halfX, 2 * TK.halfZ, TK.segX, TK.segZ);
    geo.rotateX(-Math.PI / 2);
    const nrm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
    const common = /* glsl */ `
uniform float uT;
varying vec3 vW;
${plan.glsl()}`;
    const vertexShader = /* glsl */ `${common}
#include <common>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += rippleH(wp.xz, uT);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
    const fragmentShader = /* glsl */ `${common}
#include <common>
float softPanel(vec3 d, vec3 c, vec2 hs, float soft) {
  vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), c)), v = cross(c, u);
  float z = dot(d, c);
  vec2 q = abs(vec2(dot(d, u), dot(d, v)) / max(z, 1e-3)) - hs;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return step(0.0, z) * (1.0 - smoothstep(-soft, soft, sd));
}
vec3 studioEnv(vec3 d) {
  vec3 sky = mix(${g3(WA.sky.horizon)}, ${g3(WA.sky.top)}, smoothstep(0.0, 0.7, d.y));
  sky = mix(${g3(WA.below)}, sky, smoothstep(-0.04, 0.02, d.y));
  sky += ${g3(WA.panel.color.map((x) => x * WA.panel.power))} * softPanel(d, ${g3(nrm(WA.panel.dir))}, vec2(${g1(WA.panel.size[0])}, ${g1(WA.panel.size[1])}), ${g1(WA.panel.soft)});
  sky += ${g3(WA.strip.color.map((x) => x * WA.strip.power))} * softPanel(d, ${g3(nrm(WA.strip.dir))}, vec2(${g1(WA.strip.size[0])}, ${g1(WA.strip.size[1])}), ${g1(WA.strip.soft)});
  return sky;
}
vec3 tankFloor(vec2 q) {
  vec2 inner = vec2(${g1(TK.halfX)}, ${g1(TK.halfZ)});
  vec2 g = abs(fract(q / ${g1(TK.tile)} + 0.5) - 0.5) * ${g1(TK.tile)};       // distance to the nearest grout line (m)
  vec2 w = fwidth(q) * 0.75 + 0.004;
  float grout = 1.0 - smoothstep(0.0, 1.0, min(g.x / w.x, g.y / w.y) * 0.9);
  vec3 c = mix(${g3(hexLin(P.floor))}, ${g3(hexLin(P.grout))}, grout * 0.85);
  float outside = step(0.0, max(abs(q.x) - inner.x, abs(q.y) - inner.y));
  return mix(c, ${g3(hexLin(P.tankSide))} * 0.8, outside);
}
void main() {
  vec2 p = vW.xz;
  const float e = 0.006;
  float hx = (rippleH(p + vec2(e, 0.0), uT) - rippleH(p - vec2(e, 0.0), uT)) / (2.0 * e);
  float hz = (rippleH(p + vec2(0.0, e), uT) - rippleH(p - vec2(0.0, e), uT)) / (2.0 * e);
  vec3 N = normalize(vec3(-hx, 1.0, -hz));
  vec3 V = normalize(vW - cameraPosition);
  float cosi = clamp(dot(-V, N), 0.0, 1.0);
  float F = ${g1(WA.f0)} + (1.0 - ${g1(WA.f0)}) * pow(1.0 - cosi, 5.0);
  vec3 Rr = reflect(V, N);
  vec3 refl = studioEnv(Rr);
  refl += ${g1(WA.sun.power)} * pow(max(dot(Rr, ${g3(nrm(WA.sun.dir))}), 0.0), ${g1(WA.sun.shine)});
  // crest light (art-directed, camera-relative): a lamp just above and to the right of the flat-water mirror direction,
  // so only slopes tilted a few degrees toward it — the faces of the crests — catch it, from any camera height
  vec3 R0 = reflect(V, vec3(0.0, 1.0, 0.0));
  vec3 glint = ${g3(WA.glint.color.map((x) => x * WA.glint.power))} * pow(max(dot(Rr, normalize(R0 + ${g3(WA.glint.lift)})), 0.0), ${g1(WA.glint.shine)});
  vec3 r1 = refract(V, N, 1.0 / ${g1(WA.ior)});
  float h = rippleH(p, uT);
  float s = (${g1(TK.depth)} + h) / max(-r1.y, 0.05);
  vec3 Q = vW + r1 * s;
  float hc = rippleH(Q.xz, uT);
  float I = clamp(exp(${g1(WA.caustic)} * hc), ${g1(WA.causticMin)}, ${g1(WA.causticMax)});
  float L = s + ${g1(TK.depth)};
  vec3 trans = exp(-${g3(WA.absorb)} * L);
  vec3 through = tankFloor(Q.xz) * ${g1(WA.floorLight)} * I * trans + ${g3(WA.scatter)} * (1.0 - exp(-L * ${g1(WA.scatterDensity)}));
  vec3 col = mix(through, refl, F) + glint;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
    const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader, fragmentShader });
    mat.name = "water";
    const m = new THREE.Mesh(geo, mat);
    m.name = "water"; m.position.y = TK.waterY; m.frustumCulled = false;
    m.userData.update = (t) => { mat.uniforms.uT.value = t; };
    return m;
  }

  // ---------------------------------------------------------------- bar, drivers, dippers
  /** dippers(plan) -> Group: two posts, one brass bar, a driver housing and a moving rod + brass ball per source */
  function dippers(plan) {
    const g = new THREE.Group(); g.name = "dippers";
    const z = plan.sources[0].z;
    for (const sx of [-1, 1]) {
      const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R.postR, R.postR * 1.15, R.barY + 0.06, 24), materials.brass));
      post.position.set(sx * R.postX, (R.barY + 0.06) / 2, z); g.add(post);
      const foot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R.postR * 2.4, R.postR * 2.6, 0.04, 32), materials.brass));
      foot.position.set(sx * R.postX, 0.02, z); g.add(foot);
    }
    const bar = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R.barR, R.barR, 2 * R.postX + 0.12, 24), materials.brass));
    bar.rotation.z = Math.PI / 2; bar.position.set(0, R.barY, z); g.add(bar);
    const rodLen = R.barY - TK.waterY + 0.05;
    const parts = plan.sources.map((s) => {
      const [dw, dh, dd] = R.driver;
      const box = shadow(new THREE.Mesh(new THREE.BoxGeometry(dw, dh, dd), materials.driver));
      box.position.set(s.x, R.barY, z); g.add(box);
      const knob = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24), materials.brass));
      knob.rotation.x = Math.PI / 2; knob.position.set(s.x, R.barY + 0.02, z + dd / 2 + 0.012); g.add(knob);
      const rod = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R.rodR, R.rodR, rodLen, 12), materials.brass));
      const ball = shadow(new THREE.Mesh(new THREE.SphereGeometry(R.ballR, 40, 24), materials.brass));
      g.add(rod, ball);
      return { s, rod, ball };
    });
    g.userData.update = (t) => {
      for (const { s, rod, ball } of parts) {
        const d = plan.dipper(s.i, t);
        const y = TK.waterY + R.dipTop + (1 - d.on) * 0.1 - d.stroke * spec.wave.dipAmp * d.on;
        ball.position.set(s.x, y, z);
        rod.position.set(s.x, y + rodLen / 2, z);
      }
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- corks
  /** corks(plan) -> Group: one cork + pin + flag per plan.corks entry; userData.update(t) floats them on plan.height */
  function corks(plan) {
    const g = new THREE.Group(); g.name = "corks";
    const C = R.cork;
    const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(C.flag[0], -C.flag[1] / 2), new THREE.Vector2(0, -C.flag[1])]);
    const flagGeo = new THREE.ShapeGeometry(flagShape);
    const list = plan.corks.map((ck, j) => {
      const holder = new THREE.Group(); holder.name = `cork${ck.id}`;
      const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r * 0.94, C.h, 40), materials.cork));
      const pin = shadow(new THREE.Mesh(new THREE.CylinderGeometry(C.pinR, C.pinR, C.pin, 8), materials.pin));
      pin.position.y = C.h / 2 + C.pin / 2;
      const flag = shadow(new THREE.Mesh(flagGeo, j ? materials.flagB : materials.flagA));
      flag.position.set(C.pinR, C.h / 2 + C.pin - 0.005, 0);
      const knob = shadow(new THREE.Mesh(new THREE.SphereGeometry(C.pinR * 2.6, 16, 10), j ? materials.flagB : materials.flagA));
      knob.position.y = C.h / 2 + C.pin;
      holder.add(body, pin, flag, knob);
      g.add(holder);
      return { ck, holder };
    });
    const Y = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    g.userData.update = (t) => {
      for (const { ck, holder } of list) {
        const h = plan.height(ck.x, ck.z, t), [gx, gz] = plan.grad(ck.x, ck.z, t);
        holder.position.set(ck.x, TK.waterY + h + C.h / 2 - C.float, ck.z);
        holder.quaternion.setFromUnitVectors(Y, n.set(-gx * C.tilt, 1, -gz * C.tilt).normalize());
      }
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (white, ink edge, a two-ring icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.72);
      const pw = Math.min(Wc - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((Wc - pw) / 2);
      x.fillStyle = "rgba(23,36,43,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 22); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 22); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 20); x.stroke();
      const cy = oy + ph / 2, cx0 = ox + pad + ic * 0.3, cx1 = ox + pad + ic * 0.7;
      x.strokeStyle = Q.ring; x.lineWidth = 3.5;
      for (const cx of [cx0, cx1]) for (const r of [6, 15, 24]) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** rig(plan) -> { group, water, dippers, corks, update(t) } (adds itself to the scene) */
  function rig(plan) {
    const group = new THREE.Group(); group.name = "ripple-tank";
    const bn = bench(), tk = tank(), wt = water(plan), dp = dippers(plan), ck = corks(plan);
    group.add(bn, tk, wt, dp, ck);
    stage.scene.add(group);
    const update = (t) => { wt.userData.update(t); dp.userData.update(t); ck.userData.update(t); };
    update(0);
    return { group, bench: bn, tank: tk, water: wt, dippers: dp, corks: ck, update };
  }

  const props = { bench, tank, water, dippers, corks, caption, rig };
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx, plan: ripple, motion: ripple };
}

/** sRGB hex -> linear [r, g, b] (the shader works in linear light) */
function hexLin(hex) {
  const c = new THREE.Color(hex);   // THREE.Color stores linear components under ColorManagement
  return [c.r, c.g, c.b];
}
