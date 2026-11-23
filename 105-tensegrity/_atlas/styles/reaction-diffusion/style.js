// styles/reaction-diffusion/style.js — "Reaction-Diffusion": a Gray–Scott pattern growing in a petri dish of gel.
// The look lives in spec.js; WHAT the pattern is at any time lives in grayscott.js (THREE-free planner shared with
// SCORE, run once at load). This file turns a plan into pictures:
//   - gel(plan): ONE shader mesh. The stored activator states are a DataArrayTexture (one R8 layer per stored state,
//     uploaded once at build); the shader blends the two layers around t, samples them with a 4-tap B-spline filter,
//     raises the surface from the same value (vertex displacement + normals from the same height function in the
//     fragment shader), adds drop ripples and drop shadows from uniforms, and shades it with the spec's key/fill
//     (wet glint, wrap light). A colony texture (which drop's pattern reached each cell first) can tint territories.
//   - dish (fresnel glass wall + rim), bench, falling drops, a dropper bottle and a lid, and an overlay caption chip.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fresnelGlass, GLSL_SAFE } from "../../kit/materials.js";
import { uploadTexture } from "../../kit/textures.js";
import { clamp, smoothstep, ease } from "../../kit/time.js";
import * as grayscott from "./grayscott.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const MAXD = 5; // drops (shader uniform arrays)

const GEL_COMMON = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uStates;
uniform sampler2D uColony;
uniform float uL0, uL1, uMix, uN, uScale, uRgel, uRelief, uMenH, uMenW, uSeedR;
uniform vec4 uDrops[${MAXD}];   // x, z, height above gel (<0 = none), radius
uniform vec4 uRip[${MAXD}];     // x, z, age since landing (s; <0 = not landed), amp
uniform vec4 uRipK;             // speed, width, decay, life
${GLSL_SAFE}
// fast B-spline bicubic from 4 bilinear taps (smooth contours from a 160-cell grid)
vec4 bsW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v; vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x, w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}
float bsample(vec2 uv, float layer) {
  vec2 st = uv * uN - 0.5; vec2 f = fract(st); st -= f;
  vec4 xc = bsW(f.x), yc = bsW(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) / uN;
  float s0 = texture(uStates, vec3(o.x, o.z, layer)).r, s1 = texture(uStates, vec3(o.y, o.z, layer)).r;
  float s2 = texture(uStates, vec3(o.x, o.w, layer)).r, s3 = texture(uStates, vec3(o.y, o.w, layer)).r;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
// activator 0..1 at world xz: two stored states blended; each drop's ring is hidden until it lands and then
// opens from the drop's centre (the drop spreading into its ring)
float fieldAt(vec2 xz) {
  vec2 uv = xz * uScale + 0.5;
  float f = mix(bsample(uv, uL0), bsample(uv, uL1), uMix);
  for (int i = 0; i < ${MAXD}; i++) {
    float d = length(xz - uRip[i].xy);
    float open = uSeedR * (0.25 + 0.95 * smoothstep(0.0, 0.45, uRip[i].z));
    float hide = (1.0 - step(0.0, uRip[i].z)) + step(0.0, uRip[i].z) * smoothstep(open - 0.02, open + 0.03, d) * (1.0 - step(0.6, uRip[i].z));
    f *= mix(1.0, 1.0 - hide, 1.0 - smoothstep(uSeedR * 1.35, uSeedR * 1.6, d));
  }
  return f;
}
float ripples(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < ${MAXD}; i++) {
    float a = uRip[i].z;
    float live = step(0.0, a) * (1.0 - step(uRipK.w, a));
    float x = length(xz - uRip[i].xy) - uRipK.x * a;
    h += live * uRip[i].w * exp(-uRipK.z * a) * exp(-x * x / (uRipK.y * uRipK.y)) * cos(x / uRipK.y * 2.2);
  }
  return h;
}
float heightOf(vec2 xz, float f) {
  float r = length(xz);
  float m = smoothstep(uRgel - uMenW, uRgel, r);
  return uRelief * smoothstep(0.12, 0.75, f) + uMenH * m * m + ripples(xz);
}
`;

const GEL_VERT = /* glsl */ `
${GEL_COMMON}
uniform float uGelTop;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  float f = fieldAt(p.xz);
  p.y = uGelTop + heightOf(p.xz, f);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const GEL_FRAG = /* glsl */ `
${GEL_COMMON}
uniform vec3 uGel, uGelDeep, uInk, uInkDeep, uKeyDir, uKey, uRimDir, uRimC, uSky, uGround, uAmb;
uniform vec2 uEdge, uCore;
uniform float uGloss, uSpec, uSheen, uMottle, uColonyAmt, uSss;
varying vec3 vWorld;
float gh(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float gn(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 xz = vWorld.xz;
  float r = length(xz);
  if (r > uRgel) { gl_FragColor = vec4(4.0, 0.0, 0.0, 1.0); return; }
  float e = 0.6 / (uN * uScale);
  float f = fieldAt(xz);
  float h = heightOf(xz, f);
  float hx = heightOf(xz + vec2(e, 0.0), fieldAt(xz + vec2(e, 0.0)));
  float hz = heightOf(xz + vec2(0.0, e), fieldAt(xz + vec2(0.0, e)));
  vec3 N = safeNorm(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
  vec3 V = safeNorm(cameraPosition - vWorld);
  vec3 L = safeNorm(uKeyDir);
  // colour: cream gel (static mottling) -> teal ink (optionally each drop's own hue) -> deeper core
  vec2 uv = xz * uScale + 0.5;
  vec3 col = safePow(texture(uColony, uv).rgb, 2.2);
  float cov = smoothstep(uEdge.x, uEdge.y, f), core = smoothstep(uCore.x, uCore.y, f);
  vec3 ink = mix(uInk, col, uColonyAmt);
  vec3 inkD = mix(uInkDeep, col * 0.55, uColonyAmt);
  float mot = gn(xz * 9.0) * 0.6 + gn(xz * 23.0 + 5.0) * 0.4;
  vec3 gel = mix(uGel, uGelDeep, clamp(mot * 2.0 - 0.5, 0.0, 1.0) * uMottle * 10.0);
  vec3 alb = mix(gel, mix(ink, inkD, core), cov);
  // drop shadows: a soft disc under each falling drop, pushed away from the key light
  float sh = 1.0;
  for (int i = 0; i < ${MAXD}; i++) {
    float H = uDrops[i].z;
    vec2 c = uDrops[i].xy - L.xz / max(L.y, 0.2) * max(H, 0.0);
    float rs = uDrops[i].w * (1.0 + 1.4 * max(H, 0.0));
    float k = step(0.0, H) * 0.5 / (1.0 + 2.5 * max(H, 0.0));
    sh *= 1.0 - k * exp(-dot(xz - c, xz - c) / (rs * rs));
  }
  float ndl = dot(N, L);
  float wrapK = mix(uSss, uSss * 0.3, cov);
  float diff = max((ndl + wrapK) / (1.0 + wrapK), 0.0) * sh;
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 rimL = uRimC * max(dot(N, safeNorm(uRimDir)), 0.0);
  vec3 c3 = alb * (uKey * diff + hemi + rimL + uAmb);
  vec3 H2 = safeNorm(L + V);
  float gl = safePow(max(dot(N, H2), 0.0), uGloss) * (0.55 + 0.45 * cov);
  float fr = safePow(1.0 - max(dot(N, V), 0.0), 5.0);
  c3 += uKey * gl * uSpec * sh + uSky * fr * uSheen;
  gl_FragColor = vec4(c3, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, DS = spec.dish, G = spec.gel;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const lin = (hex) => new THREE.Color(hex); // THREE.Color converts sRGB hex to linear working space
  const lightSpec = (id) => spec.lights.find((l) => l.id === id);

  /** dish coords (0..1 of the sim grid, x -> +X, y -> +Z) -> world [x, z] */
  const dishToWorld = (plan, x, y) => {
    const c = (plan.n - 1) / 2;
    return [((x * (plan.n - 1) - c) / plan.radius) * DS.radius, ((y * (plan.n - 1) - c) / plan.radius) * DS.radius];
  };

  // ---------------------------------------------------------------- bench
  function bench(o = {}) {
    const size = o.size ?? 24, mat = materials.bench;
    if (mat.bumpMap) mat.bumpMap.repeat.set(size / 2, size / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "bench";
    return m;
  }

  // ---------------------------------------------------------------- dish: glass floor ring, wall, rim
  function dish(o = {}) {
    const g = new THREE.Group(); g.name = "dish";
    const R = DS.radius, Ro = R + DS.wall;
    const glass = fresnelGlass({ color: DS.glass.color, alphaFace: DS.glass.alphaFace, alphaRim: DS.glass.alphaRim, fresnelPower: DS.glass.fresnelPower, rimStrength: DS.glass.rimStrength, toLight: lightSpec("key").position });
    glass.name = "dishGlass";
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro, DS.height, 128, 1, true), glass);
    outer.position.y = DS.height / 2; outer.renderOrder = 3; g.add(outer);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.002, R + 0.002, DS.height - DS.gelTop, 128, 1, true), glass);
    inner.position.y = DS.gelTop + (DS.height - DS.gelTop) / 2; inner.renderOrder = 3; g.add(inner);
    const rimMat = new THREE.MeshPhysicalMaterial({ color: P.rim, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85 });
    rimMat.name = "dishRim";
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + DS.wall / 2, DS.wall / 2, 10, 160), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = DS.height; rim.renderOrder = 4; g.add(rim);
    // glass foot: the floor's thick edge seen below the gel
    const footMat = new THREE.MeshPhysicalMaterial({ color: "#d7e6e3", roughness: 0.15, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.6 });
    footMat.name = "dishFoot";
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(Ro + 0.004, Ro + 0.01, DS.floor, 128), footMat);
    foot.position.y = DS.floor / 2; g.add(foot);
    // a soft contact shadow ring around the base (the glass throws light; the gel throws a faint shadow)
    const cs = new THREE.Mesh(new THREE.RingGeometry(Ro, Ro + 0.28, 128, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uR: { value: new THREE.Vector2(Ro, Ro + 0.28) } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec2 uR; varying vec2 vP; void main(){ float u = clamp((length(vP) - uR.x) / (uR.y - uR.x), 0.0, 1.0); gl_FragColor = vec4(0.18, 0.16, 0.13, 0.32 * (1.0 - u) * (1.0 - u)); }",
    }));
    cs.material.name = "dishContact";
    cs.rotation.x = -Math.PI / 2; cs.position.y = 0.002; g.add(cs);
    if (o.position) g.position.set(...o.position);
    return g;
  }

  // ---------------------------------------------------------------- the gel (the hero)
  /**
   * gel(plan) -> Mesh. userData.update(t, { colony, drops: [{ x, z, h, r }], rips: [{ x, z, age, amp }] })
   *   Uploads the plan's stored states once (DataArrayTexture, R8, linear) and the colony map (RGBA8).
   */
  function gel(plan, o = {}) {
    const N = plan.n;
    const tex = new THREE.DataArrayTexture(plan.states, N, N, plan.layers);
    tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    // colony map: every cell gets its drop's colour; unclaimed cells take the nearest claimed cell's (BFS) so the
    // filtered colour never blends toward a default at stripe edges
    const lab = Int16Array.from(plan.labels), queue = [];
    for (let i = 0; i < N * N; i++) if (lab[i] > 0) queue.push(i);
    for (let qh = 0; qh < queue.length; qh++) {
      const p = queue[qh], x = p % N, y = (p - x) / N;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const q = Y * N + X;
        if (lab[q] === 0) { lab[q] = lab[p]; queue.push(q); }
      }
    }
    const pal = P.colonies.map((h) => new THREE.Color(h)), cd = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const c = pal[(Math.max(1, lab[i]) - 1) % pal.length];
      const s = c.clone().convertLinearToSRGB();
      cd[4 * i] = Math.round(s.r * 255); cd[4 * i + 1] = Math.round(s.g * 255); cd[4 * i + 2] = Math.round(s.b * 255); cd[4 * i + 3] = 255;
    }
    const ctex = new THREE.DataTexture(cd, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    ctex.minFilter = THREE.LinearFilter; ctex.magFilter = THREE.LinearFilter; ctex.generateMipmaps = false; ctex.needsUpdate = true;
    const key = lightSpec("key"), rimL = lightSpec("rim"), fill = lightSpec("fill");
    const PI = Math.PI;
    const U = {
      uStates: { value: tex }, uColony: { value: ctex },
      uL0: { value: 0 }, uL1: { value: 1 }, uMix: { value: 0 }, uN: { value: N },
      uScale: { value: plan.radius / (N * DS.radius) }, uRgel: { value: DS.radius }, uRelief: { value: 0 },
      uMenH: { value: DS.meniscus }, uMenW: { value: DS.meniscusW }, uGelTop: { value: DS.gelTop },
      uSeedR: { value: ((spec.sim.ring.r + 1.5) / plan.radius) * DS.radius },
      uDrops: { value: Array.from({ length: MAXD }, () => new THREE.Vector4(0, 0, -1, 0.05)) },
      uRip: { value: Array.from({ length: MAXD }, () => new THREE.Vector4(9, 9, -1, 0)) },
      uRipK: { value: new THREE.Vector4(spec.drop.ripple.speed, spec.drop.ripple.width, spec.drop.ripple.decay, spec.drop.ripple.life) },
      uGel: { value: lin(P.gel) }, uGelDeep: { value: lin(P.gelDeep) }, uInk: { value: lin(P.ink) }, uInkDeep: { value: lin(P.inkDeep) },
      uKeyDir: { value: new THREE.Vector3(...key.position).sub(new THREE.Vector3(...key.target)).normalize() },
      uKey: { value: lin(key.color).multiplyScalar(key.intensity / PI * (o.keyGain ?? 2.2)) },
      uRimDir: { value: new THREE.Vector3(...rimL.position).normalize() },
      uRimC: { value: lin(rimL.color).multiplyScalar(rimL.intensity / PI * (o.keyGain ?? 2.2)) },
      uSky: { value: lin(fill.color).multiplyScalar(fill.intensity / PI * (o.fillGain ?? 1.6)) },
      uGround: { value: lin(fill.groundColor).multiplyScalar(fill.intensity / PI * (o.fillGain ?? 1.6)) },
      uAmb: { value: new THREE.Color(1, 1, 1).multiplyScalar(spec.world.environmentIntensity * (o.ambGain ?? 0.35)) },
      uEdge: { value: new THREE.Vector2(...G.edge) }, uCore: { value: new THREE.Vector2(...G.core) },
      uGloss: { value: G.gloss }, uSpec: { value: G.spec }, uSheen: { value: G.sheen }, uMottle: { value: G.mottle },
      uColonyAmt: { value: G.colonyBase }, uSss: { value: G.sss },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: GEL_VERT, fragmentShader: GEL_FRAG, side: THREE.DoubleSide });
    mat.name = "gel";
    const geo = new THREE.PlaneGeometry(2 * DS.radius, 2 * DS.radius, DS.segments, DS.segments);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "gel"; mesh.frustumCulled = false;
    if (stage.renderer) { stage.renderer.initTexture(tex); stage.renderer.initTexture(ctex); }
    mesh.userData.update = (t, s = {}) => {
      const { i, f } = plan.layerAt(t);
      U.uL0.value = i; U.uL1.value = i + 1; U.uMix.value = f;
      U.uColonyAmt.value = s.colony ?? G.colonyBase;
      for (let k = 0; k < MAXD; k++) {
        const d = s.drops?.[k], r = s.rips?.[k];
        if (d) U.uDrops.value[k].set(d.x, d.z, d.h, d.r); else U.uDrops.value[k].set(0, 0, -1, 0.05);
        if (r) U.uRip.value[k].set(r.x, r.z, r.age, r.amp); else U.uRip.value[k].set(9, 9, -1, 0);
      }
    };
    mesh.userData.textures = [tex, ctex];
    return mesh;
  }

  // ---------------------------------------------------------------- drops
  /** drops(seedsWorld) -> Group of teal spheres; userData.state(t) -> { drops, rips } for the gel; update(t) poses them */
  function drops(seeds, o = {}) {
    const D = spec.drop, g = new THREE.Group(); g.name = "drops";
    const geo = new THREE.SphereGeometry(D.radius, 40, 24);
    const meshes = seeds.map((s, k) => {
      const m = new THREE.Mesh(geo, materials.drop);
      m.name = `drop${k + 1}`; m.castShadow = false; m.visible = false;
      g.add(m);
      return m;
    });
    const top = DS.gelTop;
    const state = (t) => {
      const ds = [], rs = [];
      seeds.forEach((s, k) => {
        const u = (t - (s.t - D.fall)) / D.fall; // 0..1 while falling
        const H = u < 1 ? D.height * (1 - u * u) : 0;
        ds.push(u >= 0 && u < 1 ? { x: s.x, z: s.z, h: H, r: D.radius } : null);
        rs.push({ x: s.x, z: s.z, age: t - s.t, amp: D.ripple.amp });
      });
      return { drops: ds, rips: rs };
    };
    g.userData.state = state;
    g.userData.update = (t) => {
      seeds.forEach((s, k) => {
        const m = meshes[k], u = (t - (s.t - D.fall)) / D.fall;
        if (u < 0 || t > s.t + 0.2) { m.visible = false; return; }
        m.visible = true;
        if (u < 1) {
          const H = D.height * (1 - u * u);
          const st = 1 + 0.25 * u * u; // stretches a little as it speeds up
          m.position.set(s.x, top + D.radius * 0.9 + H, s.z);
          m.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
        } else {
          const a = clamp((t - s.t) / 0.2); // squash into the gel and vanish
          const sy = (1 - ease.outCubic(a)) * D.squash + 0.02, sx = 1 + 1.6 * ease.outCubic(a);
          m.position.set(s.x, top + D.radius * sy * 0.6, s.z);
          m.scale.set(sx * (1 - a * 0.6), sy, sx * (1 - a * 0.6));
        }
      });
    };
    g.userData.update(-1);
    return g;
  }

  // ---------------------------------------------------------------- bench props
  /** bottle({ position }) -> dropper bottle: amber-free clear glass, teal liquid, black cap, rust bulb */
  function bottle(o = {}) {
    const g = new THREE.Group(); g.name = "bottle";
    const r = 0.19, h = 0.42;
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * 0.62, 48), materials.bottleLiquid);
    liq.position.y = h * 0.31 + 0.01; liq.castShadow = true; g.add(liq);
    const gl = fresnelGlass({ color: DS.glass.color, alphaFace: 0.08, alphaRim: 0.6, rimStrength: 0.3, toLight: lightSpec("key").position });
    gl.name = "bottleGlass";
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), gl);
    body.position.y = h / 2; body.renderOrder = 3; g.add(body);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), gl);
    shoulder.scale.y = 0.45; shoulder.position.y = h; shoulder.renderOrder = 3; g.add(shoulder);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 32), materials.cap);
    cap.position.y = h + r * 0.45 + 0.03; cap.castShadow = true; g.add(cap);
    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 6, 24), materials.bulb);
    bulb.position.y = h + r * 0.45 + 0.17; bulb.castShadow = true; g.add(bulb);
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.12, 48, 1, true, -0.9, 1.8), materials.tape);
    tape.position.y = h * 0.45; g.add(tape);
    if (o.position) g.position.set(...o.position);
    return g;
  }
  /** lid({ position }) -> the dish lid lying on the bench: a flat glass disc with a short wall */
  function lid(o = {}) {
    const g = new THREE.Group(); g.name = "lid";
    const R = (o.radius ?? DS.radius + DS.wall + 0.03);
    const gl = fresnelGlass({ color: DS.glass.color, alphaFace: 0.06, alphaRim: 0.55, rimStrength: 0.35, toLight: lightSpec("key").position });
    gl.name = "lidGlass";
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.016, 128), gl);
    top.position.y = 0.09; top.renderOrder = 3; g.add(top);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.09, 128, 1, true), gl);
    wall.position.y = 0.045; wall.renderOrder = 3; g.add(wall);
    const rimMat = new THREE.MeshPhysicalMaterial({ color: P.rim, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.8 });
    rimMat.name = "lidRim";
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.01, 8, 160), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.098; g.add(rim);
    if (o.position) g.position.set(...o.position);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (deep-teal plate, a ring-of-spots icon, cream text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.36}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(20,30,30,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 15); x.stroke();
      const cx = ox + pad + ic / 2, cy = oy + ph / 2, rr = ic * 0.36; // icon: a ring pinched into six spots
      x.fillStyle = Q.dot;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; x.beginPath(); x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ic * 0.12, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * petriDish(plan, { bottle: [x, z], lid: [x, z] }) -> { group, gel, drops, seeds, update(t, { colony }) } (adds itself)
   */
  function petriDish(plan, o = {}) {
    const group = new THREE.Group(); group.name = "petri";
    group.add(bench());
    group.add(dish());
    const gm = gel(plan); group.add(gm);
    const seeds = plan.seeds.map((s) => { const [x, z] = dishToWorld(plan, s.x, s.y); return { x, z, t: s.t }; });
    const dr = drops(seeds); group.add(dr);
    const bp = o.bottle ?? [-1.75, -0.85];
    group.add(bottle({ position: [bp[0], 0, bp[1]] }));
    const lp = o.lid ?? [2.55, -0.2];
    group.add(lid({ position: [lp[0], 0, lp[1]] }));
    stage.scene.add(group);
    if (stage.renderer) uploadTexture(stage, ...gm.userData.textures);
    return {
      group, gel: gm, drops: dr, seeds,
      update(t, s = {}) {
        dr.userData.update(t);
        gm.userData.update(t, { ...dr.userData.state(t), colony: s.colony });
      },
    };
  }

  const props = { bench, dish, gel, drops, bottle, lid, caption, petriDish };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: grayscott, motion: grayscott, dishToWorld,
  };
}
