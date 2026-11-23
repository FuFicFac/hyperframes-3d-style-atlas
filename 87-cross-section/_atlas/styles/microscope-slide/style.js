// styles/microscope-slide/style.js — "Microscope slide": the view down a light-microscope eyepiece (style contract, kit-api §3).
//
// A brightfield image is a transmitted projection, so the specimen is drawn by ONE full-screen fragment shader in specimen
// micrometres (not a lit 3D set): every cell is a 2D signed-distance body (two lobes joined by a smooth union — the
// division pinch comes free as the blend k shrinks to 0, the technique liquid-chrome uses in 3D), shaded like DIC/phase
// contrast: a dark membrane line, a relief term that is bright on one side of every edge and dark on the other (gradient of
// the SDF · shear direction), a faint phase halo, thickness-weighted cytoplasm absorption, a stained nucleus with chromatin
// texture and nucleolus, refractile granules, and condensed chromosomes (threads -> equatorial band -> two sets at the poles).
// Depth of field is per body: blur width = base + dofK·|z − focus| (µm), applied to every edge width with the contrast
// spread accordingly, so cells off the focal plane are soft low-contrast discs and a focus rack swims through depths.
// Eyepiece: circular field stop with a per-channel chromatic fringe, illumination falloff, dark tube surround, objective
// blink. Overlay (exact colours, after post): caption, scale bar + magnification tag, SAMPLE DATA chip.
//
// Nothing animates itself: the scene calls field.userData.update(t) which reads culture.js plans (pure f(t)).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import { rng } from "../../kit/time.js";
import * as culture from "./culture.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const MAXC = 32; // cells drawn at once (the nearest to the field centre win)
const lin = (hex) => new THREE.Color(hex);

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = (MAXD) => /* glsl */ `
precision highp float;
#define MAXC ${MAXC}
#define MAXD ${MAXD}
varying vec2 vUv;
uniform vec2 uRes;
uniform vec4 uField;   // centre px x, y, radius px, edge px
uniform vec4 uView;    // specimen centre x, y (µm), µm per px, t
uniform vec4 uFocus;   // focal z, dofK, base blur, extra blur (µm)
uniform vec4 uOpt;     // blink darkness, fringe px, falloff, surround glow
uniform int uCount;
uniform vec4 uA[MAXC]; // x, y, angle, sep
uniform vec4 uB[MAXC]; // rL, z, k, seed
uniform vec4 uC[MAXC]; // elong, wobble, nucA, nucOffX
uniform vec4 uD[MAXC]; // proA, bandA, bandX, dNucA
uniform vec4 uE[MAXC]; // glow, r (body radius), nucR, nucOffY
uniform vec4 uDeb[MAXD]; // x, y, z, size
uniform vec3 uBg, uStainA, uStainB, uCyto, uRim, uNuc, uNucleolus, uChrom, uGran, uSurround;
uniform vec4 uLook;  // relief, halo, rimDark, cytoAbsorb
uniform vec4 uLook2; // nucAbsorb, chromAbsorb, granules, stain
uniform vec4 uLook3; // domeShade, glow, shear x, shear y
uniform vec4 uW;     // widths: rim, relief, haloOffset, halo (µm)
${GLSL_SAFE}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 x) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(x); x = x * 2.03 + 17.1; a *= 0.5; } return s; }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / max(k, 1e-5); return min(a, b) - h * h * k * 0.25; }
float sq(float x) { return x * x; }
float kc(float w, float b) { return w / (w + b); } // contrast left after spreading a feature of width w by blur b

float cellSD(vec2 l, float sep, float rL, float k, float elong, float wob, float seed, float t) {
  vec2 e = vec2(l.x / (1.0 + elong), l.y * (1.0 + elong * 0.3));
  float th = dot(e, e) > 1e-8 ? atan(e.y, e.x) : 0.0;
  float w = 1.0 + wob * (0.55 * sin(2.0 * th + seed * 6.283 + t * 0.55) + 0.32 * sin(3.0 * th + seed * 11.0 - t * 0.71) + 0.2 * sin(5.0 * th + seed * 17.0 + t * 0.93));
  float d1 = length(e - vec2(sep, 0.0)) - rL * w;
  float d2 = length(e + vec2(sep, 0.0)) - rL * w;
  return smin(d1, d2, k) * (1.0 + elong * 0.45);
}

// one stained nucleus (interphase or re-forming); returns the multiplier and adds the envelope line
vec3 nucleus(vec2 nl, float rad, float alpha, float seed, float b, float nucleolus) {
  if (alpha < 0.002) return vec3(1.0);
  float dn = length(nl) - rad;
  float bb = b * 1.2 + 0.25;
  float m = smoothstep(bb, -bb, dn) * alpha;
  float tex = fbm(nl * 1.25 + seed * 9.0);
  vec3 mul = mix(vec3(1.0), uNuc, uLook2.x * m * (0.7 + 0.6 * tex * kc(0.7, b)));
  float env = exp(-sq(dn / (0.32 + b))) * kc(0.32, b) * alpha;
  mul *= mix(vec3(1.0), uRim, 0.28 * env);
  vec2 off = (hash22(vec2(seed * 31.0, 7.0)) - 0.5) * rad * 0.7;
  float dl = length(nl - off) - rad * 0.26;
  float lm = smoothstep(bb * 0.8, -bb * 0.8, dl) * alpha * nucleolus;
  mul *= mix(vec3(1.0), uNucleolus, 0.75 * lm * kc(0.5, b));
  return mul;
}

void main() {
  vec2 fc = vUv * uRes;
  vec2 dpx = fc - uField.xy;
  float rr = length(dpx);
  float R = uField.z;
  float t = uView.w;
  float pxum = uView.z;
  vec2 p = uView.xy + dpx * pxum; // specimen µm
  vec2 shear = uLook3.zw;
  vec3 col = vec3(0.0);

  if (rr < R * 1.03) {
    // ---- luminous background with faint stain blotches drifting in the fluid
    vec2 q = p * 0.02 + vec2(t * 0.012, -t * 0.007);
    float n1 = fbm(q), n2 = fbm(q * 1.6 + 5.2);
    col = uBg;
    col = mix(col, col * uStainA, uLook2.w * smoothstep(0.36, 0.72, n1));
    col = mix(col, col * uStainB, uLook2.w * smoothstep(0.42, 0.78, n2));
    col *= 0.985 + 0.03 * vnoise(p * 0.35 + t * 0.05);

    // ---- out-of-focus specks and in-focus debris at every depth
    for (int j = 0; j < MAXD; j++) {
      vec4 dd = uDeb[j];
      float fj = float(j);
      vec2 pos = dd.xy + vec2(sin(t * (0.3 + 0.05 * mod(fj, 5.0)) + fj), cos(t * (0.27 + 0.04 * mod(fj, 7.0)) + fj * 1.7)) * 0.6;
      float b = uFocus.z + uFocus.w + uFocus.y * abs(dd.z - uFocus.x);
      b = max(b, pxum * 0.9);
      vec2 rel = p - pos;
      float reach = dd.w + 3.0 * b + 2.5;
      if (dot(rel, rel) > reach * reach) continue;
      float d = length(rel) - dd.w;
      float core = smoothstep(b + 0.12, -b - 0.12, d) * sq(kc(dd.w, b));
      float ring = exp(-sq((d - 0.25) / (0.35 + b))) * kc(0.35, b);
      vec2 nW = rel / max(length(rel), 1e-4);
      col *= 1.0 - 0.5 * core;
      col += 0.05 * ring + 0.12 * dot(nW, shear) * exp(-sq(d / (0.4 + b))) * kc(0.4, b);
    }

    // ---- cells
    for (int i = 0; i < MAXC; i++) {
      if (i >= uCount) break;
      vec4 A = uA[i], B = uB[i], C = uC[i], D = uD[i], E = uE[i];
      float b = uFocus.z + uFocus.w + uFocus.y * abs(B.y - uFocus.x);
      b = max(b, pxum * 0.9);
      vec2 rel = p - A.xy;
      float reach = (A.w + B.x) * (1.0 + C.x) * (1.0 + C.y) + 3.0 * b + uW.z + 2.0 * uW.w + 1.0;
      if (dot(rel, rel) > reach * reach) continue;
      float ca = cos(A.z), sa = sin(A.z);
      vec2 l = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
      float seed = B.w;
      float d = cellSD(l, A.w, B.x, B.z, C.x, C.y, seed, t);
      float ee = 0.3;
      float dx = cellSD(l + vec2(ee, 0.0), A.w, B.x, B.z, C.x, C.y, seed, t) - d;
      float dy = cellSD(l + vec2(0.0, ee), A.w, B.x, B.z, C.x, C.y, seed, t) - d;
      vec2 nL = safeNorm(vec3(dx, dy, 0.0)).xy;
      vec2 nW = vec2(ca * nL.x - sa * nL.y, sa * nL.x + ca * nL.y);
      float sh = dot(nW, shear);
      float rc = max(E.y, 1.0);
      float m = smoothstep(b, -b, d);
      float depth = clamp(-d / (rc * 0.8), 0.0, 1.0);
      float dome = sqrt(depth * (2.0 - depth));
      float glow = E.x;

      // cytoplasm: thickness-weighted absorption + phase-bright when rounded
      col *= mix(vec3(1.0), uCyto, uLook.w * m * (0.35 + 0.65 * dome));
      col *= 1.0 + uLook3.y * glow * m * (0.4 + 0.6 * dome);
      // body relief (rounded thickness lit from the shear side)
      col += uLook3.x * sh * m * (1.0 - dome * 0.6) * kc(1.0, b);

      // granules / organelles (cytoplasm only)
      vec2 nl = l - vec2(C.w, E.w);
      nl.x /= 1.0 + 0.5 * C.x;
      float nucMask = max(C.z * smoothstep(-0.6, 0.6, E.z + 0.5 - length(nl)),
                          D.w * max(smoothstep(-0.6, 0.6, E.z + 0.5 - length(l - vec2(D.z, 0.0))), smoothstep(-0.6, 0.6, E.z + 0.5 - length(l + vec2(D.z, 0.0)))));
      float inner = m * smoothstep(0.4, 2.2, -d) * (1.0 - nucMask);
      // cytoplasm mottling (living texture, slow)
      col *= 1.0 - 0.07 * m * kc(1.2, b) * (fbm(l * 0.45 + seed * 19.0 + vec2(t * 0.04, -t * 0.03)) - 0.35);
      if (inner > 0.01) {
        vec2 gl = l * 0.47 + vec2(seed * 41.0, seed * 13.0) + vec2(sin(t * 0.21 + seed * 6.0), cos(t * 0.17 + seed * 4.0)) * 0.5;
        vec2 gi = floor(gl), gf = fract(gl);
        float fmin = 9.0; vec2 fv = vec2(0.0); float pres = 0.0;
        for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
          vec2 o = vec2(float(xx), float(yy));
          vec2 h = hash22(gi + o);
          vec2 v = o + 0.2 + 0.6 * h - gf;
          float dv = dot(v, v);
          if (dv < fmin) { fmin = dv; fv = v; pres = hash12(gi + o + 3.7); }
        }
        float gr = 0.08 + 0.2 * fract(pres * 7.13);
        float gb = b * 0.62 + 0.04;
        float g = smoothstep(gr + gb, gr - gb * 0.5 - 0.02, sqrt(fmin)) * step(0.58, pres) * inner * kc(0.25, b);
        float gh = dot(-fv / max(length(fv), 1e-4), shear);
        col *= 1.0 - uLook2.z * g * (0.75 - 0.35 * gh);
        col += 0.1 * g * max(gh, 0.0);
      }

      // nucleus (interphase) and the two re-forming daughter nuclei
      vec3 nm = nucleus(nl, E.z, C.z * m, seed, b, 1.0);
      nm *= nucleus(l - vec2(D.z, 0.0), E.z, D.w * m, seed + 0.31, b, 0.7);
      nm *= nucleus(l + vec2(D.z, 0.0), E.z, D.w * m, seed + 0.67, b, 0.7);
      col *= nm;

      // condensed chromatin threads (prophase) inside the old nucleus
      if (D.x > 0.002) {
        float w = abs(fbm(nl * 0.55 + seed * 23.0 + vec2(t * 0.03, 0.0)) - 0.5);
        float thr = smoothstep(0.075 + b * 0.05, 0.03, w) * smoothstep(E.z * 1.05 + b, E.z * 0.6, length(nl)) * kc(0.4, b);
        col *= mix(vec3(1.0), uChrom, uLook2.y * 0.8 * thr * D.x * m);
      }
      // chromosomes: discrete rods in slots along the plate. Mirrored about the equator (|x|), so at metaphase each rod and
      // its mirror read as a pair of sister chromatids; as bandX grows the two sets separate and are pulled to the poles.
      if (D.y > 0.002) {
        float ext = B.x * 0.6;
        float nS = 10.0, slotH = 2.0 * ext / nS;
        float k0 = floor((l.y + ext) / slotH);
        float cd = 1e3;
        for (int j = -1; j <= 1; j++) {
          float kk = k0 + float(j);
          if (kk < 0.0 || kk > nS - 1.0) continue;
          vec2 h = hash22(vec2(kk + 3.0, seed * 57.0));
          float yc = -ext + (kk + 0.5) * slotH + (h.x - 0.5) * slotH * 0.5;
          float ay = abs(yc) / ext;
          float trail = D.z * 0.3 * ay * ay;            // arms of the outer chromosomes trail toward the equator
          float pull = clamp(D.z / max(B.x * 0.35, 0.5), 0.0, 1.0); // 0 at the plate, 1 once the sets have separated
          vec2 c0 = vec2(D.z - trail + mix(0.42, 0.25, pull) + (h.y - 0.5) * mix(0.15, 0.5, pull), yc);
          // at the plate the chromatids lie along it (each with its mirror = a sister pair); pulled, the arms trail behind
          float ang = mix(1.45 * (h.x > 0.5 ? 1.0 : -1.0), 0.0, pull) + (h.x - 0.5) * 0.7 + (h.y - 0.5) * 0.3;
          float len = 1.1 + 0.9 * h.y;
          vec2 c1 = c0 + vec2(-cos(ang), sin(ang)) * len;  // arm points back toward the equator
          vec2 q = vec2(abs(l.x), l.y);
          vec2 pa = q - c0, ba = c1 - c0;
          float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          cd = min(cd, length(pa - ba * hh) - 0.4);
        }
        float dens = smoothstep(b * 0.9 + 0.12, -b * 0.9 - 0.12, cd) * kc(0.4, b) * D.y * m;
        col *= mix(vec3(1.0), uChrom, uLook2.y * dens);
        col += 0.06 * dens * max(sh, 0.0);
      }

      // membrane line, edge relief, halo
      float rim = exp(-sq((d + 0.12) / (uW.x + b))) * kc(uW.x, b);
      float relief = sh * exp(-sq((d + 0.45 * uW.y) / (uW.y + b))) * kc(uW.y, b);
      float halo = exp(-sq((d - uW.z) / (uW.w + b))) * kc(uW.w, b);
      col = mix(col, col * uRim, uLook.z * rim);
      col += uLook.x * relief;
      col += uLook.y * halo * (1.0 + 0.5 * glow);
    }
    col = max(col, vec3(0.0));
    col *= 1.0 - uOpt.z * safePow(rr / R, 4.0);
    col *= 1.0 - uOpt.x;
  }
  // ---- eyepiece: field stop with a chromatic fringe, dark tube surround with a faint scattered glow
  float e = uField.w, fr = uOpt.y * 0.5;
  vec3 mask = vec3(smoothstep(R + fr + e, R + fr - e, rr), smoothstep(R + e, R - e, rr), smoothstep(R - fr + e, R - fr - e, rr));
  float tube = exp(-sq(max(rr - R, 0.0) / (R * 0.16)));
  vec3 surround = uSurround * (1.0 + uOpt.w * 6.0 * tube * (1.0 - uOpt.x));
  gl_FragColor = vec4(mix(surround, col, mask), 1.0);
}`;

/**
 * createStyle(stage, opts?) -> style
 *   props.microscopeField(plan, optics) -> full-screen mesh; userData.update(t) writes every uniform from the plans
 *   props.caption() / props.scaleBar() / props.sampleTag() -> overlay chips
 *   plan: culture.js (createCulture, createOptics, fieldFit, cultureVoices)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const W = stage.width, H = stage.height;
  const F = spec.field;
  const fieldPx = { cx: F.center[0] * W, cy: F.center[1] * H, R: F.radius * H };

  function debrisList() {
    const D = spec.debris, r = rng(D.seed).next;
    return Array.from({ length: D.count }, () => new THREE.Vector4(
      (r() * 2 - 1) * D.spread, (r() * 2 - 1) * D.spread * 0.7, (r() * 2 - 1) * D.zRange, D.size[0] + r() ** 2 * (D.size[1] - D.size[0])));
  }

  function microscopeField(plan, optics) {
    const deb = debrisList();
    const L = spec.look;
    const v4 = () => Array.from({ length: MAXC }, () => new THREE.Vector4());
    const uniforms = {
      uRes: { value: new THREE.Vector2(W, H) },
      uField: { value: new THREE.Vector4(fieldPx.cx, H - fieldPx.cy, fieldPx.R, F.edge) },
      uView: { value: new THREE.Vector4() },
      uFocus: { value: new THREE.Vector4() },
      uOpt: { value: new THREE.Vector4(0, F.fringe, F.falloff, F.surroundGlow) },
      uCount: { value: 0 },
      uA: { value: v4() }, uB: { value: v4() }, uC: { value: v4() }, uD: { value: v4() }, uE: { value: v4() },
      uDeb: { value: deb },
      uBg: { value: lin(P.bg) }, uStainA: { value: lin(P.stainTeal) }, uStainB: { value: lin(P.stainPink) },
      uCyto: { value: lin(P.cyto) }, uRim: { value: lin(P.rim) }, uNuc: { value: lin(P.nucleus) }, uNucleolus: { value: lin(P.nucleolus) },
      uChrom: { value: lin(P.chromosome) }, uGran: { value: lin(P.granule) }, uSurround: { value: lin(P.surround) },
      uLook: { value: new THREE.Vector4(L.relief, L.halo, L.rimDark, L.cytoAbsorb) },
      uLook2: { value: new THREE.Vector4(L.nucAbsorb, L.chromAbsorb, L.granules, L.stain) },
      uLook3: { value: new THREE.Vector4(L.domeShade, L.glow, L.shear[0], L.shear[1]) },
      uW: { value: new THREE.Vector4(L.widths.rim, L.widths.relief, L.widths.haloOffset, L.widths.halo) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag(deb.length), uniforms, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    mesh.name = "microscopeField";
    mesh.userData.procedural = "full-screen brightfield shader: 2D SDF cells (smooth-union lobes) with DIC relief, stained nuclei, chromosomes, per-body depth of field, eyepiece field stop";

    mesh.userData.update = (t) => {
      const o = optics.at(t);
      const umPerPx = o.umR / fieldPx.R;
      uniforms.uView.value.set(o.center[0], o.center[1], umPerPx, t);
      const O = spec.optics;
      uniforms.uFocus.value.set(o.focusZ, O.dofK * (o.umR / O.dofRef) ** 0.5 * (O.dofRef / o.umR), O.baseBlur, o.blur);
      uniforms.uOpt.value.x = o.blink;
      // nearest cells to the field centre, then drawn far-z first (sorted by z for a stable composite)
      const reachF = o.umR * 1.08;
      const live = plan.at(t)
        .map((s) => ({ s, d: Math.hypot(s.x - o.center[0], s.y - o.center[1]) - (s.sep + s.rL) * 1.3 }))
        .filter((e) => e.d < reachF)
        .sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : 1))
        .slice(0, MAXC)
        .map((e) => e.s)
        .sort((a, b) => Math.abs(b.z - o.focusZ) - Math.abs(a.z - o.focusZ) || (a.id < b.id ? -1 : 1));
      const U = uniforms;
      live.forEach((s, i) => {
        U.uA.value[i].set(s.x, s.y, s.angle, s.sep);
        U.uB.value[i].set(s.rL, s.z, s.k, s.seed);
        U.uC.value[i].set(s.elong, s.wob, s.nucA, s.nox);
        U.uD.value[i].set(s.proA, s.bandA, s.bandX, s.dNucA);
        U.uE.value[i].set(s.glow, s.r, s.nucR, s.noy);
      });
      for (let i = live.length; i < MAXC; i++) for (const k of ["uA", "uB", "uC", "uD", "uE"]) U[k].value[i].set(0, 0, 0, 0);
      U.uCount.value = live.length;
      return { optics: o, live };
    };
    stage.scene.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- overlay
  const CV = { willReadFrequently: true, upload: true };
  /** caption() -> left-side caption (wraps to maxW), a short amber rule above it; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Math.round(Q.cap * 3.6);
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      x.textBaseline = "alphabetic"; x.textAlign = "left";
      const lines = []; // explicit "\n" breaks first, then wrap each paragraph to maxW
      for (const para of st.text.split("\n")) {
        let line = "";
        for (const w of para.split(" ")) {
          const tryL = line ? `${line} ${w}` : w;
          if (x.measureText(tryL).width > Q.maxW && line) { lines.push(line); line = w; } else line = tryL;
        }
        if (line) lines.push(line);
      }
      x.fillStyle = Q.rule; x.fillRect(4, 8, 64, 6);
      x.fillStyle = Q.ink;
      lines.forEach((ln, i) => x.fillText(ln, 2, 30 + Q.cap * (i + 1) * 1.12));
    }, CV);
    mesh.userData.place(Q.x, Q.y - Hp / 2);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** scaleBar() -> right-aligned bar + "10 µm" label; userData.show({ um, px }, alpha) */
  function scaleBar(o = {}) {
    const Q = { ...spec.scaleBar, ...o };
    const Wp = 340, Hp = Q.cap + Q.h + 30;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.px) return;
      const len = Math.round(st.px);
      x.fillStyle = Q.ink;
      x.fillRect(Wc - 6 - len, Hc - Q.h - 6, len, Q.h);
      x.font = `600 ${Q.cap}px ${Q.font}`;
      x.textAlign = "right"; x.textBaseline = "alphabetic";
      x.fillText(`${st.um} µm`, Wc - 6, Hc - Q.h - 18);
    }, CV);
    mesh.userData.place(Q.right - Wp, Q.y - Hp);
    mesh.userData.show = (st, a) => { mesh.userData.set(st); mesh.userData.opacity(a); };
    return mesh;
  }
  /** magTag() -> "40×" objective tag; userData.show(mag, alpha) */
  function magTag(o = {}) {
    const Q = { ...spec.magTag, ...o };
    const Wp = 300, Hp = Q.cap + 44;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.mag) return;
      x.textAlign = "right"; x.textBaseline = "alphabetic";
      x.font = `700 ${Q.cap}px ${spec.caption.font}`;
      x.fillStyle = Q.ink; x.fillText(st.mag, Wc - 6, Q.cap + 4);
      x.font = `500 ${Math.round(Q.cap * 0.42)}px ${spec.caption.font}`;
      x.fillStyle = Q.sub; x.fillText("OBJECTIVE", Wc - 6, Q.cap + 34);
    }, CV);
    mesh.userData.place(Q.right - Wp, Q.y);
    mesh.userData.show = (mag, a) => { mesh.userData.set({ mag }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** sampleTag() -> amber "SAMPLE DATA" chip (the scale bar and magnification are illustrative); userData.show(alpha) */
  function sampleTag(o = {}) {
    const Q = { ...spec.sampleTag, ...o };
    const Wp = 300, Hp = Q.h + 12;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.on) return;
      x.font = `800 ${Q.cap}px ${spec.caption.font}`;
      x.letterSpacing = "2px";
      const tw = Math.round(x.measureText(Q.text).width), pad = 16, pw = tw + pad * 2, ph = Q.h;
      const ox = Wc - pw - 6, oy = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 8); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(Q.text, ox + pad, oy + Math.round(ph / 2) + 1);
    }, CV);
    mesh.userData.place(Q.right - Wp, Q.y);
    mesh.userData.show = (a) => { mesh.userData.set({ on: a > 0.003 }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { microscopeField, caption, scaleBar, magTag, sampleTag };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    field: fieldPx, plan: culture, motion: culture,
  };
}
