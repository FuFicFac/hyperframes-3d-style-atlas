// styles/glassblowing/style.js — "Glassblowing": a daylit hot shop. A steel blowpipe lies across two bench rails, turning,
// with glass on its end; a furnace mouth glows at the back. The look lives in spec.js; the glass shapes, heat, turning, sag,
// swing and tool moves live in gather.js (THREE-free, shared with SCORE). This file turns the plan into pictures:
//   * glassPiece(plan): ONE surface-of-revolution geometry (profile loop x 97 columns) rewritten from the plan each frame,
//     drawn as two meshes (inner cavity first, then outer + rim) with one custom shader. Hot: emission from a hot-body ramp
//     scaled by the glass PATH along the view ray (computed analytically from the outer and cavity radii at that point), so a
//     bubble glows as a bright shell with a dimmer middle. Clear: Beer-Lambert tint from the same path (thin wall = pale,
//     wall seen edge-on = the dark refracted edge line), fresnel reflections of a procedural shop environment, a bright rim,
//     and two spiral canes (cobalt, saffron) whose angle turns with the pipe. Temperature blends hot -> amber -> clear per
//     vertex, so the glow drains from the tip inward.
//   * marverMaterial: the dark steel marver under the glass; its shader traces each point's ray to the sun past the glass
//     (closest approach to the pipe axis, radii from a 48-sample table) -> honey shadow when hot, aqua light with a dark
//     outline, a bright lens line and coloured cane light when clear.
//   * blowpipe (marked so the turn reads), rails, oak bench, jacks (two hinged blades + spring bow), breath pulse, paddle,
//     furnace with a flaring mouth, window, an overlay caption that rolls its text at beat changes.
// Props never animate themselves: the scene calls shop.update(t, camera) and caption.userData.show(...).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { uploadTexture } from "../../kit/textures.js";
import { newCanvas } from "../../kit/canvas.js";
import { clamp, smoothstep } from "../../kit/time.js";
import * as gather from "./gather.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const SEG = 96; // columns around the axis (+1 seam column)

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, ST = spec.set, LK = spec.look, HT = spec.heat;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; };
  const col = (hex) => new THREE.Color(hex);
  const base = { sky: lights.sky.intensity, sun: lights.sun.intensity, fill: lights.fill.intensity };

  // ---------------------------------------------------------------- hot-body ramp (CPU copy for lights / accents)
  const RAMP = HT.ramp.map(([T, c, I]) => ({ T, c: col(c), I }));
  /** hotBody(T) -> THREE.Color (linear, x intensity): piecewise-linear through spec.heat.ramp */
  function hotBody(T, out = new THREE.Color()) {
    out.setRGB(0, 0, 0);
    if (T <= RAMP[0].T) return out;
    for (let i = 0; i < RAMP.length - 1; i++) {
      const a = RAMP[i], b = RAMP[i + 1];
      if (T <= b.T) {
        const u = (T - a.T) / (b.T - a.T);
        return out.setRGB(
          a.c.r * a.I + (b.c.r * b.I - a.c.r * a.I) * u,
          a.c.g * a.I + (b.c.g * b.I - a.c.g * a.I) * u,
          a.c.b * a.I + (b.c.b * b.I - a.c.b * a.I) * u);
      }
    }
    const z = RAMP[RAMP.length - 1];
    return out.setRGB(z.c.r * z.I, z.c.g * z.I, z.c.b * z.I);
  }

  // ---------------------------------------------------------------- procedural shop environment (glass reflections)
  const ENV = LK.env;
  const envUniforms = () => ({
    uEnvSky: { value: col(ENV.sky) }, uEnvGround: { value: col(ENV.ground) },
    uEnvStrip: { value: col(ENV.strip).multiplyScalar(ENV.stripLevel) }, uEnvWindow: { value: col(ENV.window).multiplyScalar(ENV.windowLevel) },
    uEnvFront: { value: col(ENV.front).multiplyScalar(ENV.frontLevel) }, uEnvFurnace: { value: col(ENV.furnace).multiplyScalar(ENV.furnaceLevel) },
    uFlare: { value: 1 },
  });
  const ENV_GLSL = /* glsl */ `
    uniform vec3 uEnvSky, uEnvGround, uEnvStrip, uEnvWindow, uEnvFront, uEnvFurnace; uniform float uFlare;
    vec3 envAt(vec3 R) {
      vec3 c = mix(uEnvGround, uEnvSky, smoothstep(-0.3, 0.5, R.y));
      c += uEnvStrip * smoothstep(0.80, 0.93, R.y) * (1.0 - smoothstep(0.25, 0.6, abs(R.x)));
      c += uEnvWindow * smoothstep(0.90, 0.95, dot(R, normalize(vec3(-0.5, 0.42, -0.76))));
      c += uEnvFront * smoothstep(0.92, 0.965, dot(R, normalize(vec3(0.55, 0.45, 0.7))));
      c += uEnvFurnace * uFlare * smoothstep(0.93, 0.975, dot(R, normalize(vec3(0.45, 0.1, -0.89))));
      return c;
    }`;

  // ---------------------------------------------------------------- the glass material
  /** glassMaterial(inner) -> ShaderMaterial (premultiplied alpha). inner = 1 for the cavity pass. userData.u = uniforms */
  function glassMaterial(inner) {
    const S = LK.stripe;
    const U = {
      uCamL: { value: new THREE.Vector3() }, uSpin: { value: 0 }, uInner: { value: inner },
      uSunW: { value: new THREE.Vector3(...ST.sunDir ?? [0, 1, 0]) }, uSunCol: { value: col("#fff1dc") },
      uAqua: { value: col(LK.aqua) }, uDeep: { value: col(LK.deep) }, uAmber: { value: col(LK.amber) }, uRimCol: { value: col(LK.rim) },
      uCaneA: { value: col(P.caneA) }, uCaneB: { value: col(P.caneB) },
      uLook: { value: new THREE.Vector4(LK.sigma, LK.alphaMin, LK.edgePath[0], LK.edgePath[1]) },
      uLook2: { value: new THREE.Vector4(LK.rimStrength, LK.specStrength, LK.sunSpec, LK.sunShine) },
      uLook3: { value: new THREE.Vector4(LK.throughGlow, LK.hotSpec, LK.hotPath, LK.hotFloor) },
      uStripe: { value: new THREE.Vector4(S.width, S.twist, S.hotDark, S.alpha) },
      uStripe2: { value: new THREE.Vector4(S.farAlpha, LK.innerAlpha, HT.clearHi, HT.clearLo) },
      uRampT: { value: HT.ramp.map((r) => r[0]) }, uRampC: { value: HT.ramp.map((r) => col(r[1])) }, uRampI: { value: HT.ramp.map((r) => r[2]) },
      ...envUniforms(),
    };
    const m = new THREE.ShaderMaterial({
      name: inner ? "glassInner" : "glassOuter",
      uniforms: U,
      vertexShader: /* glsl */ `
        attribute vec4 aGeo;   // outer radius, cavity radius (at this x), sag offset (y), temperature
        attribute vec3 aMat;   // material coord m (0 pipe .. 1 tip), angle, part
        varying vec3 vWN, vWP, vL, vP; varying vec4 vGeo; varying vec3 vMat;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWP = wp.xyz;
          vWN = normalize(mat3(modelMatrix) * normal);
          vP = position;
          vL = position - vec3(0.0, aGeo.z, 0.0);
          vGeo = aGeo; vMat = aMat;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCamL; uniform float uSpin, uInner;
        uniform vec3 uSunW, uSunCol, uAqua, uDeep, uAmber, uRimCol, uCaneA, uCaneB;
        uniform vec4 uLook, uLook2, uLook3, uStripe, uStripe2;
        uniform float uRampT[7]; uniform vec3 uRampC[7]; uniform float uRampI[7];
        ${ENV_GLSL}
        varying vec3 vWN, vWP, vL, vP; varying vec4 vGeo; varying vec3 vMat;
        vec3 hotBody(float T) {
          vec3 c = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            float a = uRampT[i], b = uRampT[i + 1];
            float u = clamp((T - a) / (b - a), 0.0, 1.0);
            float inSeg = step(a, T) * (1.0 - step(b, T));
            c += inSeg * mix(uRampC[i] * uRampI[i], uRampC[i + 1] * uRampI[i + 1], u);
          }
          c += step(uRampT[6], T) * uRampC[6] * uRampI[6];
          return c;
        }
        void main() {
          vec3 N = normalize(vWN);
          vec3 V = normalize(cameraPosition - vWP);
          float NV = clamp(dot(N, V), 0.0, 1.0);
          float T = vGeo.w, ro = vGeo.x, ri = vGeo.y;
          // ---- glass path along the view ray (circular cross-sections about the pipe axis)
          vec3 dirL = vP - uCamL;
          dirL *= inversesqrt(max(dot(dirL, dirL), 1e-12));
          vec2 v2 = dirL.yz;
          float v2l = length(v2);
          vec2 v2n = v2 / max(v2l, 1e-5);
          float d = abs(vL.y * v2n.y - vL.z * v2n.x);
          float co = 2.0 * sqrt(max(ro * ro - d * d, 0.0));
          float ci = 2.0 * sqrt(max(ri * ri - d * d, 0.0));
          float inside = step(d, ri);
          float pathOuter = mix(co, 0.5 * (co - ci), inside);
          float path = mix(pathOuter, 0.5 * (co - ci), uInner) / max(v2l, 0.3);
          float pathHot = (co - ci) / max(v2l, 0.3);   // both walls: continuous across the cavity edge
          // ---- lighting terms
          vec3 L = normalize(uSunW);
          float ndl = dot(N, L);
          float diff = 0.55 + 0.45 * max(ndl, 0.0);
          vec3 R = reflect(-V, N);
          float F = 0.04 + 0.96 * pow(1.0 - NV, 5.0);
          vec3 Hh = normalize(L + V);
          float sunSpec = pow(max(dot(N, Hh), 0.0), uLook2.w);
          vec3 env = envAt(R);
          // ---- canes: two helical bands, half a turn apart, turning with the pipe (chord distance: wrap-free)
          float aA = vMat.y - uSpin - 6.2831853 * uStripe.y * vMat.x;
          float dA = 2.0 * abs(sin(0.5 * aA));
          float dB = 2.0 * abs(cos(0.5 * aA));
          float w = uStripe.x;
          float fA = fwidth(dA) + 1e-4, fB = fwidth(dB) + 1e-4;
          float mA = 1.0 - smoothstep(w - fA, w + fA, dA);
          float mB = 1.0 - smoothstep(w - fB, w + fB, dB);
          float caneM = clamp(mA + mB, 0.0, 1.0);
          vec3 caneC = (uCaneA * mA + uCaneB * mB) * (0.62 + 0.5 * max(ndl, 0.0));
          // ---- clear glass: Beer-Lambert tint from the path, deepening where the wall is seen edge-on
          float clar = smoothstep(uStripe2.z, uStripe2.w, T);
          float absorb = 1.0 - exp(-uLook.x * path);
          float aTint = mix(max(absorb, uLook.y), uStripe2.y + 0.6 * absorb, uInner);
          vec3 tintC = mix(uAqua, uDeep, smoothstep(uLook.z, uLook.w, path));
          tintC = mix(uAmber, tintC, smoothstep(0.15, 0.85, clar));
          vec3 body = tintC * diff + uAqua * uLook3.x * smoothstep(0.0, 0.8, -ndl) * (0.35 + 0.65 * absorb);
          vec3 C = body * aTint; float A = aTint;
          float aCane = caneM * uStripe.w * mix(1.0, uStripe2.x, uInner);
          C = caneC * aCane + (1.0 - aCane) * C; A = aCane + (1.0 - aCane) * A;
          vec3 refl = env * F * uLook2.y * mix(1.0, 0.6, uInner) + uSunCol * uLook2.z * sunSpec * mix(1.0, 0.3, uInner) + uRimCol * uLook2.x * pow(1.0 - NV, 3.0) * mix(1.0, 0.45, uInner);
          C += refl;
          // ---- hot glass: emission saturating with the path (a bubble = a bright shell), canes as darker streaks
          // thin paths (limbs, a blown wall seen face-on) glow less and redder; thick paths hotter and brighter
          float hp = 1.0 - exp(-pathHot / uLook3.z);
          hp = mix(hp, 0.8, uInner);
          float glowK = uLook3.w + (1.0 - uLook3.w) * hp;
          vec3 E = hotBody(T + 0.1 * hp - 0.24 * (1.0 - hp)) * glowK * (1.0 - uStripe.z * caneM);
          vec3 hotC = E + env * F * uLook3.y + uSunCol * uLook2.z * 0.25 * sunSpec;
          hotC += uAmber * 0.3 * diff * (1.0 - smoothstep(0.4, 0.7, T));
          gl_FragColor = vec4(mix(hotC, C, clar), mix(1.0, A, clar));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.FrontSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    m.userData.u = U;
    return m;
  }

  /** glowMaterial() -> additive ShaderMaterial for the heat halo: the outer surface pushed out along its normals by
   *  uWidth, back faces only; brightest next to the glass, zero at the halo's own silhouette; x hot-body(T) x (1 - clarity) */
  function glowMaterial() {
    const GW = LK.halo;
    const U = {
      uWidth: { value: GW.width }, uLevel: { value: GW.level },
      uRampT: { value: HT.ramp.map((r) => r[0]) }, uRampC: { value: HT.ramp.map((r) => col(r[1])) }, uRampI: { value: HT.ramp.map((r) => r[2]) },
      uClear: { value: new THREE.Vector2(HT.clearHi, HT.clearLo) },
    };
    const m = new THREE.ShaderMaterial({
      name: "glassHalo",
      uniforms: U,
      vertexShader: /* glsl */ `
        attribute vec4 aGeo; attribute vec3 aMat;
        uniform float uWidth;
        varying vec3 vWN, vWP; varying float vT, vM, vR;
        void main() {
          // push outward RADIALLY only (an offset of r(x) never folds at a concave neck; the open ends are faded below)
          vec3 radial = vec3(0.0, position.y - aGeo.z, position.z);
          float rl = length(radial);
          radial = rl > 1e-5 ? radial / rl : normalize(vec3(0.0, normal.y, normal.z) + vec3(0.0, 1e-4, 0.0));
          vec3 p = position + radial * uWidth;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWP = wp.xyz; vWN = normalize(mat3(modelMatrix) * normal); vT = aGeo.w; vM = aMat.x; vR = aGeo.x;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLevel; uniform vec2 uClear;
        uniform float uRampT[7]; uniform vec3 uRampC[7]; uniform float uRampI[7];
        varying vec3 vWN, vWP; varying float vT, vM, vR;
        vec3 hotBody(float T) {
          vec3 c = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            float a = uRampT[i], b = uRampT[i + 1];
            float u = clamp((T - a) / (b - a), 0.0, 1.0);
            c += step(a, T) * (1.0 - step(b, T)) * mix(uRampC[i] * uRampI[i], uRampC[i + 1] * uRampI[i + 1], u);
          }
          return c + step(uRampT[6], T) * uRampC[6] * uRampI[6];
        }
        void main() {
          vec3 V = normalize(cameraPosition - vWP);
          float k = smoothstep(0.0, 0.75, abs(dot(normalize(vWN), V)));
          float hot = (1.0 - smoothstep(uClear.x, uClear.y, vT)) * smoothstep(0.02, 0.16, vM) * (1.0 - smoothstep(0.9, 0.99, vM)) * smoothstep(0.036, 0.062, vR); // no halo round the thin neck / collar
          gl_FragColor = vec4(hotBody(vT) * uLevel * k * k * hot, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.BackSide,
    });
    m.userData.u = U;
    return m;
  }

  // ---------------------------------------------------------------- the glass piece (geometry rewritten from the plan)
  /** glassPiece(plan) -> Group { outer, inner } with userData.update(t, camera) */
  function glassPiece(plan) {
    const { no, nr, n } = plan.counts;
    const cols = SEG + 1, nv = n * cols;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), geoA = new Float32Array(nv * 4), matA = new Float32Array(nv * 3);
    const cosT = new Float64Array(cols), sinT = new Float64Array(cols);
    for (let j = 0; j < cols; j++) { const a = (2 * Math.PI * j) / SEG; cosT[j] = Math.cos(a); sinT[j] = Math.sin(a); }
    const P0 = plan.profileAt(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) {
      const v = i * cols + j;
      matA[3 * v] = P0.m[i]; matA[3 * v + 1] = (2 * Math.PI * j) / SEG; matA[3 * v + 2] = P0.part[i];
    }
    const attrs = {
      position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3),
      aGeo: new THREE.BufferAttribute(geoA, 4), aMat: new THREE.BufferAttribute(matA, 3),
    };
    attrs.position.setUsage(THREE.DynamicDrawUsage); attrs.normal.setUsage(THREE.DynamicDrawUsage); attrs.aGeo.setUsage(THREE.DynamicDrawUsage);
    const strips = (i0, i1) => {
      const idx = [];
      for (let i = i0; i < i1; i++) for (let j = 0; j < SEG; j++) {
        const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      return idx;
    };
    const mkGeo = (idx) => {
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(attrs)) g.setAttribute(k, a);
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.12, 0, 0), 0.5);
      return g;
    };
    const outerMat = glassMaterial(0), innerMat = glassMaterial(1);
    const outer = new THREE.Mesh(mkGeo(strips(0, no + nr)), outerMat);
    const inner = new THREE.Mesh(mkGeo(strips(no + nr, n - 1)), innerMat);
    outer.name = "glass-outer"; inner.name = "glass-inner";
    outer.renderOrder = 6; inner.renderOrder = 5;
    outer.frustumCulled = inner.frustumCulled = false;
    const haloGeo = mkGeo(strips(0, no - 1));
    const halo = new THREE.Mesh(haloGeo, glowMaterial());
    halo.name = "glass-halo"; halo.renderOrder = 4; halo.frustumCulled = false;
    const g = new THREE.Group(); g.name = "glass";
    g.add(halo, inner, outer);
    const nx = new Float64Array(n), nrr = new Float64Array(n), ro = new Float64Array(n), ri = new Float64Array(n), dy = new Float64Array(n), T = new Float64Array(n);
    const camL = new THREE.Vector3();
    g.userData = {
      outer, inner, outerMat, innerMat, halo,
      /** update(t, camera): rewrite geometry + attributes from the plan; uniforms (camera in glass frame, spin) */
      update(t, camera) {
        const Pr = plan.profileAt(t), sag = plan.sagAt(t);
        const x = Pr.x, r = Pr.r, x0 = Pr.x[0], span = Math.max(1e-6, Pr.L - x0);
        let pnx = 1, pnr = 0;
        for (let i = 0; i < n; i++) {
          const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
          let tx = x[ib] - x[ia], tr = r[ib] - r[ia];
          const l = Math.sqrt(tx * tx + tr * tr);
          if (l > 1e-9) { tx /= l; tr /= l; pnx = -tr; pnr = tx; }
          nx[i] = pnx; nrr[i] = pnr;
          const R = plan.radiiAt(Pr, x[i]);
          const part = Pr.part[i];
          ro[i] = part === 2 ? Math.max(R.ro, r[i]) : r[i];
          ri[i] = part === 2 ? r[i] : Math.min(R.ri, r[i]);
          const xi = clamp((x[i] - x0) / span);
          dy[i] = -sag * xi * xi;
          T[i] = plan.tempAt(t, Pr.m[i]);
        }
        for (let i = 0; i < n; i++) {
          const xi = x[i], rr = r[i], ny = nrr[i], nxx = nx[i];
          for (let j = 0; j < cols; j++) {
            const v = i * cols + j, c = cosT[j], s = sinT[j];
            pos[3 * v] = xi; pos[3 * v + 1] = rr * c + dy[i]; pos[3 * v + 2] = rr * s;
            nor[3 * v] = nxx; nor[3 * v + 1] = ny * c; nor[3 * v + 2] = ny * s;
            geoA[4 * v] = ro[i]; geoA[4 * v + 1] = ri[i]; geoA[4 * v + 2] = dy[i]; geoA[4 * v + 3] = T[i];
          }
        }
        attrs.position.needsUpdate = true; attrs.normal.needsUpdate = true; attrs.aGeo.needsUpdate = true;
        g.updateWorldMatrix(true, false);
        camL.copy(camera.position);
        g.worldToLocal(camL);
        const spin = plan.spinAt(t);
        for (const M of [outerMat, innerMat]) { M.userData.u.uCamL.value.copy(camL); M.userData.u.uSpin.value = spin; }
      },
    };
    return g;
  }

  // ---------------------------------------------------------------- the marver: light through the glass
  const BN = spec.bench, NS = BN.samples;
  /** marverMaterial() -> MeshStandardMaterial patched to darken / tint / brighten direct light by the glass. userData.u */
  function marverMaterial() {
    const MV = ST.marver;
    const m = new THREE.MeshStandardMaterial({ color: MV.color, roughness: MV.roughness, metalness: MV.metalness });
    m.name = "marver";
    const U = {
      uGInv: { value: new THREE.Matrix4() }, uSunL: { value: new THREE.Vector3(0, 1, 0) },
      uProf: { value: Array.from({ length: NS }, () => new THREE.Vector4()) }, uProfX: { value: new THREE.Vector2(0, 1) },
      uSpinB: { value: 0 }, uCane: { value: new THREE.Vector4(LK.stripe.width, LK.stripe.twist, BN.caneTint, 0) },
      uTint: { value: col(BN.tint) }, uCaneAB: { value: col(P.caneA) }, uCaneBB: { value: col(P.caneB) },
      uBn: { value: new THREE.Vector4(BN.hotShadow, BN.edgeDark, BN.caustic, BN.ring) },
      uSunColI: { value: col("#fff1dc") }, uOn: { value: 1 },
    };
    m.userData.u = U;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vGW;
          uniform mat4 uGInv; uniform vec3 uSunL; uniform vec4 uProf[${NS}]; uniform vec2 uProfX;
          uniform float uSpinB, uOn; uniform vec4 uCane, uBn; uniform vec3 uTint, uCaneAB, uCaneBB, uSunColI;
          float caneMask(float ang, float mm, out float which) {
            float a = ang - uSpinB - 6.2831853 * uCane.y * mm;
            float dA = 2.0 * abs(sin(0.5 * a)), dB = 2.0 * abs(cos(0.5 * a));
            float w = uCane.x * 1.15;
            float mA = 1.0 - smoothstep(w * 0.7, w * 1.15, dA), mB = 1.0 - smoothstep(w * 0.7, w * 1.15, dB);
            which = mB / max(mA + mB, 1e-4);
            return clamp(mA + mB, 0.0, 1.0);
          }`)
        .replace("#include <aomap_fragment>", `
          {
            vec3 Pg = (uGInv * vec4(vGW, 1.0)).xyz;
            vec3 Ls = uSunL;
            float lyz = max(Ls.y * Ls.y + Ls.z * Ls.z, 1e-6);
            float s = -(Pg.y * Ls.y + Pg.z * Ls.z) / lyz;
            vec3 Q = Pg + s * Ls;
            float d = length(Q.yz);
            float fx = (Q.x - uProfX.x) / max(uProfX.y - uProfX.x, 1e-4) * ${NS - 1}.0;
            float fi = clamp(floor(fx), 0.0, ${NS - 2}.0);
            float fu = clamp(fx - fi, 0.0, 1.0);
            int i0 = int(fi);
            vec4 pr = mix(uProf[i0], uProf[i0 + 1], fu);
            float inX = step(0.0, fx) * step(fx, ${NS - 1}.0) * step(0.0, s) * uOn;
            float ro = pr.x, ri = pr.y, clar = pr.w;
            float inG = inX * (1.0 - smoothstep(ro - 0.0025, ro + 0.0015, d));
            float co = 2.0 * sqrt(max(ro * ro - d * d, 0.0)), ci = 2.0 * sqrt(max(ri * ri - d * d, 0.0));
            float path = (co - ci) / sqrt(lyz);
            vec3 trans = mix(vec3(1.0), uTint, 1.0 - exp(-14.0 * path));
            float edge = smoothstep(ri - 0.007, ri + 0.002, d);
            trans *= 1.0 - uBn.y * edge;
            float phc = atan(Q.z, Q.y);
            float ac = acos(clamp(d / max(ro, 1e-4), 0.0, 1.0));
            float wA, wB;
            float cA = caneMask(phc + ac, pr.z, wA), cB = caneMask(phc - ac, pr.z, wB);
            vec3 caneCol = mix(uCaneAB, uCaneBB, clamp(cA > cB ? wA : wB, 0.0, 1.0));
            float caneK = clamp(max(cA, cB), 0.0, 1.0) * uCane.z;
            trans = mix(trans, caneCol * 1.4, caneK);
            float lens = uBn.z * exp(-pow(d / max(0.24 * ri + 0.006, 1e-3), 2.0)) + uBn.w * exp(-pow((d - 0.8 * ri) / max(0.08 * ri + 0.002, 1e-3), 2.0));
            vec3 F = mix(vec3(1.0), mix(vec3(uBn.x), trans, clar), inG);
            reflectedLight.directDiffuse *= F;
            reflectedLight.directSpecular *= F;
            reflectedLight.directDiffuse += uSunColI * (uTint * lens * (1.0 - caneK) + caneCol * caneK * 0.6) * (inG * clar * (1.0 - edge * 0.85)) * 0.35;
          }
          #include <aomap_fragment>`);
    };
    m.customProgramCacheKey = () => "glassblowing-marver-1";
    return m;
  }

  // ---------------------------------------------------------------- room: floor, back wall, window, furnace
  /** furnace() -> Group (brick body, steel band, glowing mouth); userData = { mouthMat, light } */
  function furnace() {
    const F = ST.furnace, zf = ST.wall.z + F.d;
    const g = new THREE.Group(); g.name = "furnace";
    const yb = ST.floor.y, h = F.h;
    g.add(box(F.w, h, F.d, materials.furnaceBody, F.x, yb + h / 2, ST.wall.z + F.d / 2));
    g.add(box(F.w + 0.04, 0.06, F.d + 0.04, materials.furnaceSteel, F.x, yb + h + 0.03, ST.wall.z + F.d / 2));
    g.add(box(F.w + 0.04, 0.05, F.d + 0.04, materials.furnaceSteel, F.x, F.mouthY - F.mouthR - 0.16, ST.wall.z + F.d / 2));
    // refractory brick panel around the mouth, with darker joints
    const bw = 2.6 * F.mouthR + 0.1;
    g.add(box(bw, bw, 0.02, materials.brick, F.x, F.mouthY, zf + 0.01));
    for (let k = 0; k < 6; k++) {
      const y = F.mouthY - bw / 2 + ((k + 0.5) * bw) / 6;
      if (Math.abs(y - F.mouthY) < F.mouthR + 0.03) continue;
      const j = box(bw * 0.98, 0.006, 0.004, materials.brickDark, F.x, y, zf + 0.021); j.castShadow = false; g.add(j);
    }
    // steel ring around the mouth
    const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(F.mouthR + 0.025, 0.022, 14, 48), materials.furnaceSteel));
    ring.position.set(F.x, F.mouthY, zf + 0.03);
    g.add(ring);
    // the mouth: radial glow (core -> glow -> rim), flickering a little (pure function of t), scaled by the flare
    const mouthMat = new THREE.ShaderMaterial({
      name: "furnaceMouth",
      uniforms: { uCore: { value: col(F.core) }, uGlow: { value: col(F.glow) }, uRim: { value: col(F.rim) }, uLevel: { value: F.level }, uT: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCore, uGlow, uRim; uniform float uLevel, uT; varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float fl = 0.92 + 0.05 * sin(uT * 11.0 + p.y * 7.0) + 0.03 * sin(uT * 23.0 - p.x * 9.0);
          vec3 c = mix(uCore, uGlow, smoothstep(0.0, 0.75, r));
          c = mix(c, uRim, smoothstep(0.7, 1.0, r));
          float a = 1.0 - smoothstep(0.96, 1.0, r);
          gl_FragColor = vec4(c * uLevel * fl * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
    });
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(F.mouthR, 48), mouthMat);
    mouth.position.set(F.x, F.mouthY, zf + 0.024); mouth.name = "furnace-mouth";
    g.add(mouth);
    const light = new THREE.PointLight(F.light.color, F.light.intensity, F.light.distance, 2);
    light.position.set(F.x + F.light.offset[0], F.mouthY + F.light.offset[1], zf + F.light.offset[2]);
    g.add(light);
    g.userData = { mouthMat, light };
    return g;
  }
  /** room() -> Group: concrete floor, plaster back wall with a daylit window, the furnace */
  function room() {
    const g = new THREE.Group(); g.name = "room";
    const W = ST.wall;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6).rotateX(-Math.PI / 2), materials.concrete);
    floor.position.set(0, ST.floor.y, 0.5); floor.receiveShadow = true; floor.name = "floor";
    g.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W.w, W.h), materials.plaster);
    wall.position.set(0, ST.floor.y + W.h / 2, W.z); wall.receiveShadow = true; wall.name = "wall";
    g.add(wall);
    // window: bright panes + a pale frame (the daylight's source)
    const WN = ST.window;
    const paneMat = new THREE.MeshBasicMaterial({ color: col(WN.sky).multiplyScalar(WN.level) });
    paneMat.name = "windowPane";
    const frameMat = new THREE.MeshStandardMaterial({ color: WN.frame, roughness: 0.6 });
    const [cx, cy] = WN.panes, pw = WN.w / cx, ph = WN.h / cy;
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw - WN.mullion, ph - WN.mullion), paneMat);
      p.position.set(WN.x - WN.w / 2 + (i + 0.5) * pw, WN.y - WN.h / 2 + (j + 0.5) * ph, W.z + 0.003);
      g.add(p);
    }
    const fr = 0.05;
    for (const [w, h, x, y] of [[WN.w + 2 * fr, fr, WN.x, WN.y + WN.h / 2 + fr / 2], [WN.w + 2 * fr, fr, WN.x, WN.y - WN.h / 2 - fr / 2], [fr, WN.h, WN.x - WN.w / 2 - fr / 2, WN.y], [fr, WN.h, WN.x + WN.w / 2 + fr / 2, WN.y]]) {
      g.add(box(w, h, 0.03, frameMat, x, y, W.z + 0.015));
    }
    const fu = furnace(); g.add(fu);
    g.userData = { furnace: fu };
    return g;
  }

  // ---------------------------------------------------------------- bench, rails, marver, paddle
  /** bench(marverMat) -> Group: oak top, legs, two steel rails on posts, the marver plate */
  function bench(marverMat) {
    const g = new THREE.Group(); g.name = "bench";
    const BE = ST.bench, MV = ST.marver, RL = ST.rail;
    const w = BE.x1 - BE.x0, d = BE.z1 - BE.z0;
    g.add(box(w, BE.thick, d, materials.oak, (BE.x0 + BE.x1) / 2, -BE.thick / 2, (BE.z0 + BE.z1) / 2));
    for (const [x, z] of [[BE.x0 + 0.08, BE.z0 + 0.08], [BE.x1 - 0.08, BE.z0 + 0.08], [BE.x0 + 0.08, BE.z1 - 0.08], [BE.x1 - 0.08, BE.z1 - 0.08]]) {
      g.add(box(0.07, BE.legH - BE.thick, 0.07, materials.oakDark, x, -BE.thick - (BE.legH - BE.thick) / 2, z));
    }
    const mv = shadow(new THREE.Mesh(new THREE.BoxGeometry(MV.x1 - MV.x0, MV.thick, MV.z1 - MV.z0), [materials.darkSteel, materials.darkSteel, marverMat, materials.darkSteel, materials.darkSteel, materials.darkSteel]), false, true);
    mv.position.set((MV.x0 + MV.x1) / 2, MV.thick / 2, (MV.z0 + MV.z1) / 2); mv.name = "marver";
    g.add(mv);
    const top = ST.pipeY - ST.pipe.r;
    for (const R of ST.rails) {
      g.add(box(RL.w, RL.h, RL.z1 - RL.z0, materials.steel, R.x, top - RL.h / 2, (RL.z0 + RL.z1) / 2));
      for (const z of [RL.z0 + 0.05, RL.z1 - 0.05]) g.add(box(RL.post, top - RL.h, RL.post, materials.darkSteel, R.x, (top - RL.h) / 2, z));
    }
    return g;
  }
  /** paddle() -> Group: a wooden shaping paddle lying on the bench (dressing) */
  function paddle() {
    const PD = ST.paddle;
    const g = new THREE.Group(); g.name = "paddle";
    g.add(box(PD.len, PD.t, PD.w, materials.oak, 0, PD.t / 2, 0));
    const h = shadow(new THREE.Mesh(new THREE.CylinderGeometry(PD.handleR, PD.handleR, PD.handleL, 16).rotateZ(Math.PI / 2), materials.oakDark));
    h.position.set(-PD.len / 2 - PD.handleL / 2 + 0.01, PD.handleR, 0); g.add(h);
    g.position.set(PD.x, 0, PD.z); g.rotation.y = 0.18;
    return g;
  }

  // ---------------------------------------------------------------- blowpipe
  /** blowpipe() -> Mesh along +x ending at x = 0 (tip), marked so its turning reads; spin with rotation.x */
  function blowpipe() {
    const PP = ST.pipe, len = -PP.x0;
    const c = newCanvas(256, 256), x = c.getContext("2d");
    const gr = x.createLinearGradient(0, 0, 0, 256); // canvas y = v reversed: v = 1 (tip) at the top row
    gr.addColorStop(0, "#3a3640"); gr.addColorStop(0.03, "#5b5560"); gr.addColorStop(0.08, "#a9adb4"); gr.addColorStop(1, "#c9ced3");
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    x.fillStyle = PP.markColor;
    for (let k = 0; k < PP.marks; k++) x.fillRect(Math.round((k / PP.marks) * 256), 0, 7, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    uploadTexture(stage, tex);
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.32, metalness: 0.8, clearcoat: 0.2 });
    mat.name = "blowpipe";
    const geo = new THREE.CylinderGeometry(PP.r, PP.r, len, 28, 1, false).rotateZ(-Math.PI / 2);
    geo.translate(-len / 2, 0, 0);
    const pipe = shadow(new THREE.Mesh(geo, mat));
    pipe.name = "blowpipe";
    // wooden grip and a collar (they turn with the pipe)
    const G = PP.grip;
    const grip = shadow(new THREE.Mesh(new THREE.CylinderGeometry(PP.r * 1.6, PP.r * 1.6, G.x1 - G.x0, 20).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: G.color, roughness: 0.6 })));
    grip.position.x = (G.x0 + G.x1) / 2; pipe.add(grip);
    const CL = PP.collar;
    const collar = shadow(new THREE.Mesh(new THREE.CylinderGeometry(CL.r, CL.r, CL.w, 24).rotateZ(-Math.PI / 2), materials.darkSteel));
    collar.position.x = CL.x; pipe.add(collar);
    return pipe;
  }

  // ---------------------------------------------------------------- breath pulse
  /** breathPulse() -> Mesh: a soft additive sleeve that travels along the pipe; userData.set(x, level) */
  function breathPulse() {
    const PU = spec.pulse;
    const mat = new THREE.ShaderMaterial({
      name: "breathPulse",
      uniforms: { uCol: { value: col(PU.color) }, uA: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vN, vV; varying float vX;
        void main() { vX = position.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; uniform float uA; varying vec3 vN, vV; varying float vX;
        void main() {
          float along = exp(-pow(vX / ${(PU.len * 0.32).toFixed(4)}, 2.0));
          float nv = abs(dot(normalize(vN), normalize(vV)));
          float k = along * (0.35 + 0.65 * nv) * uA;
          gl_FragColor = vec4(uCol * k, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(PU.r, PU.r, PU.len, 24, 1, true).rotateZ(-Math.PI / 2), mat);
    m.name = "breath-pulse"; m.renderOrder = 7;
    m.userData.set = (x, level) => { m.position.x = x; mat.uniforms.uA.value = PU.level * level; m.visible = level > 0.002; };
    m.userData.set(0, 0);
    return m;
  }

  // ---------------------------------------------------------------- jacks
  /** jacks() -> Group (tool frame: tips at the origin, blades along +x to the spring bow, gap along y).
   *  userData.setGap(gapAt, sAt): gap measured sAt metres from the tips (blades hinge at the bow) */
  function jacks() {
    const J = spec.jacks;
    const g = new THREE.Group(); g.name = "jacks";
    const bladeMat = new THREE.MeshPhysicalMaterial({ color: "#aab1b8", roughness: 0.28, metalness: 0.9, clearcoat: 0.3 });
    bladeMat.name = "jacksBlade";
    const gripMat = new THREE.MeshStandardMaterial({ color: "#6a4426", roughness: 0.6 });
    const blades = [0, 1].map((k) => {
      const b = new THREE.Group();
      const geo = new THREE.BoxGeometry(1, J.bladeT, J.bladeW);
      geo.translate(0.5, 0, 0);
      // taper: thinner and narrower toward the tip (x = 0)
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) { const u = pa.getX(i); pa.setZ(i, pa.getZ(i) * (0.6 + 0.4 * u)); }
      const blade = shadow(new THREE.Mesh(geo, bladeMat));
      blade.name = `jacks-blade-${k}`;
      b.add(blade);
      const gr = shadow(new THREE.Mesh(new THREE.CylinderGeometry(J.grip.r, J.grip.r, 1, 16).rotateZ(-Math.PI / 2), gripMat));
      gr.name = `jacks-grip-${k}`;
      b.add(gr);
      b.userData = { blade, grip: gr };
      g.add(b);
      return b;
    });
    const bow = shadow(new THREE.Mesh(new THREE.TorusGeometry(J.bowGap / 2, J.bowTube, 12, 32, Math.PI), bladeMat));
    bow.rotation.z = -Math.PI / 2; bow.position.x = J.bladeL; bow.name = "jacks-bow";
    g.add(bow);
    g.userData.setGap = (gapAt, sAt = 0) => {
      const Lb = J.bladeL, gb = J.bowGap, s = clamp(sAt / Lb, 0, 0.9);
      const gt = Math.max(0, (gapAt - gb * s) / (1 - s));
      blades.forEach((b, k) => {
        const sg = k === 0 ? 1 : -1;
        const y0 = (sg * gt) / 2, y1 = (sg * gb) / 2;
        const dx = Lb, dyv = y1 - y0, len = Math.sqrt(dx * dx + dyv * dyv), ang = Math.atan2(dyv, dx);
        b.position.set(0, y0, 0); b.rotation.set(0, 0, ang);
        b.userData.blade.scale.set(len, 1, 1);
        const gl = (J.grip.to - J.grip.from) * len / Lb;
        b.userData.grip.scale.set(gl, 1, 1);
        b.userData.grip.position.set((J.grip.from + J.grip.to) / 2 * len / Lb, sg * (J.bladeT / 2 + J.grip.r * 0.55), 0);
      });
    };
    g.userData.setGap(0.02, 0);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption (top right, rolls at beat changes)
  /** caption() -> overlay chip; userData.show({ a, b, u, acc }) — text a rolls up and out as b rolls in (u 0..1) */
  function caption() {
    const Q = spec.caption;
    const Wp = Q.maxW + 40, Hp = Q.h + 30;
    const font = `${Q.weight} ${Q.cap}px ${Q.font}`;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.a) return;
      x.font = font;
      const wa = x.measureText(st.a).width, wb = st.b ? x.measureText(st.b).width : wa;
      const u = st.u, ue = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const pad = Math.round(Q.cap * 0.5), acc = 16;
      const tw = wa + (wb - wa) * ue;
      const pw = Math.round(Math.min(W - 20, tw + 2 * pad + acc)), ph = Q.h, ox = W - 12 - pw, oy = 8, rr = 18;
      x.fillStyle = "rgba(0,0,0,0.28)"; x.beginPath(); x.roundRect(ox + 5, oy + 9, pw, ph, rr); x.fill();
      x.globalAlpha = Q.plateAlpha; x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, rr); x.fill();
      x.globalAlpha = 1;
      x.fillStyle = st.acc; x.beginPath(); x.roundRect(ox, oy, acc, ph, [rr, 0, 0, rr]); x.fill();
      x.save();
      x.beginPath(); x.rect(ox + acc, oy + 4, pw - acc, ph - 8); x.clip();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      const cy = oy + ph / 2 + Math.round(Q.cap * 0.04);
      x.fillText(st.a, ox + acc + pad, cy - ue * ph);
      if (st.b) x.fillText(st.b, ox + acc + pad, cy + (1 - ue) * ph);
      x.restore();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.right - Wp, Q.y - 8);
    mesh.userData.show = (st) => { mesh.userData.set(st); mesh.userData.opacity(1); };
    mesh.userData.measure = (text) => { const c = mesh.userData.canvas.getContext("2d"); c.font = font; return c.measureText(text).width; };
    return mesh;
  }

  // ---------------------------------------------------------------- the whole shop for one plan
  /**
   * hotShop(plan) -> { group, pipe, glass, jacks, pulse, room, update(t, camera) } (adds itself to the scene)
   *   update(t, camera): swing + spin, glass geometry, jacks pose, breath pulse, furnace flare, glow light, marver light.
   */
  function hotShop(plan) {
    const group = new THREE.Group(); group.name = "hot-shop";
    const rm = room(); group.add(rm);
    const mvMat = marverMaterial();
    const bn = bench(mvMat); group.add(bn);
    group.add(paddle());
    const pivX = ST.rails[0].x, H = ST.pipeY;
    const swingG = new THREE.Group(); swingG.name = "swing"; swingG.position.set(pivX, H, 0);
    const pipeF = new THREE.Group(); pipeF.name = "pipe-frame"; pipeF.position.set(-pivX, 0, 0);
    swingG.add(pipeF); group.add(swingG);
    const pipe = blowpipe(); pipeF.add(pipe);
    const glass = glassPiece(plan); pipeF.add(glass);
    const pulse = breathPulse(); pipeF.add(pulse);
    const jk = jacks(); pipeF.add(jk);
    const glow = new THREE.PointLight(spec.glowLight.color, 0, 0, 2); glow.name = "glass-glow"; pipeF.add(glow);
    stage.scene.add(group);
    // sun direction (world, toward the sun) for the glass shader and the marver
    const sunDir = new THREE.Vector3().subVectors(lights.sun.position, lights.sun.target.position).normalize();
    for (const M of [glass.userData.outerMat, glass.userData.innerMat]) { M.userData.u.uSunW.value.copy(sunDir); M.userData.u.uSunCol.value.copy(lights.sun.color).multiplyScalar(1); }
    const mvU = mvMat.userData.u;
    mvU.uSunColI.value.copy(lights.sun.color).multiplyScalar(base.sun);
    const fu = rm.userData.furnace.userData, F = ST.furnace;
    const qPinch = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
    const qLip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spec.jacks.lipTilt);
    const tmpC = new THREE.Color(), gInv = new THREE.Matrix4(), sunL = new THREE.Vector3();
    return {
      group, pipe, glass, jacks: jk, pulse, room: rm, swing: swingG, pipeFrame: pipeF,
      update(t, camera) {
        swingG.rotation.z = plan.swingAt(t);
        pipe.rotation.x = plan.spinAt(t);
        swingG.updateWorldMatrix(true, true);
        glass.userData.update(t, camera);
        // breath pulse
        const pu = plan.pulseAt(t);
        pulse.userData.set(pu.x, pu.level);
        // jacks
        const J = plan.jacksAt(t);
        jk.visible = J.on;
        if (J.on) {
          jk.position.set(J.tip[0], J.tip[1], J.tip[2]);
          jk.quaternion.copy(J.mode === "pinch" ? qPinch : qLip);
          jk.userData.setGap(J.gapAt, J.sAt);
        }
        // furnace flare (mouth level + its light), glass reflections of it
        const fl = plan.flareAt(t);
        fu.mouthMat.uniforms.uLevel.value = F.level * (0.75 + 0.25 * fl);
        fu.mouthMat.uniforms.uT.value = t;
        fu.light.intensity = F.light.intensity * fl;
        for (const M of [glass.userData.outerMat, glass.userData.innerMat]) M.userData.u.uFlare.value = fl;
        // glow light from the glass's mean temperature
        const P = plan.profileAt(t);
        const Tm = plan.tempAt(t, 0.45);
        hotBody(Tm, tmpC);
        const lum = 0.3 * tmpC.r + 0.55 * tmpC.g + 0.15 * tmpC.b;
        glow.color.copy(tmpC).multiplyScalar(1 / Math.max(1e-3, Math.max(tmpC.r, tmpC.g, tmpC.b)));
        glow.intensity = spec.glowLight.intensity * lum;
        glow.position.set((P.x[0] + P.L) / 2, -0.01, 0.02);
        // marver: glass frame + sun direction + profile table (radii, material, clarity)
        glass.updateWorldMatrix(true, false);
        gInv.copy(glass.matrixWorld).invert();
        mvU.uGInv.value.copy(gInv);
        sunL.copy(sunDir).transformDirection(gInv);
        mvU.uSunL.value.copy(sunL);
        const tb = plan.table(t, NS);
        mvU.uProfX.value.set(tb.x0, tb.x1);
        for (let j = 0; j < NS; j++) mvU.uProf.value[j].set(tb.ro[j], tb.ri[j], tb.m[j], smoothstep(HT.clearHi, HT.clearLo, plan.tempAt(t, tb.m[j])));
        mvU.uSpinB.value = plan.spinAt(t);
        // room light warms a little with the flare
        lights.sky.intensity = base.sky * (1 + 0.04 * (fl - 1));
      },
    };
  }

  const props = { glassMaterial, glassPiece, marverMaterial, furnace, room, bench, paddle, blowpipe, breathPulse, jacks, caption, hotShop, hotBody };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: gather, motion: gather,
  };
}
