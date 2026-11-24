// styles/ct-scan/style.js — "CT Scan": slice by slice. The look lives in spec.js; the hidden object (box + robot as
// SDF primitives), the voxel bake and every time-dependent quantity live in volume.js (THREE-free planner shared with
// SCORE). This file turns a plan into pictures:
//   - room(): white floor, a teal wall cylinder (unlit gradient + soft panel seams, white cove).
//   - scanner(): a white ring on two legs, a spinning detector band in its bore, a glowing teal scan sheet; the kraft
//     box (printed handling marks, paper tape) rides a lift column up through it; a teal line loop wraps the box at the
//     scan plane.
//   - panel(): a floating white-bezelled screen with a grid of cells (7 x 3 in the demo).
//   - slice cards: ONE ShaderMaterial per card samples the baked 3D texture at the card's slice height (exact
//     cross-section) + the analytic turning metal; grey = dot(coverage, grey weights) + static seeded grain. On the
//     panel the card is opaque (dark screen, grey image, draw-in wipe); peeled it becomes a translucent film card with a
//     thin glowing frame (frame bars keep it visible edge-on).
//   - volume: a unit box ray-marched in its own space (64 steps, front-to-back emission/absorption, gradient shading on
//     card + plastic), per-material visibility from the dial; tips upright and turns on a turntable with a faint shadow
//     baked from a top-down projection of the volume.
//   - caption() (overlay, a vertical roll: the old label rolls up and out of the plate as the new one rolls in from
//     below) and dial() (overlay knob with three material detents).
// Props never animate themselves: the scene calls ct.update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas, canvas2d } from "../../kit/canvas.js";
import { uploadTexture } from "../../kit/textures.js";
import { clamp, ease } from "../../kit/time.js";
import { fbm2 } from "../../kit/noise.js";
import * as volume from "./volume.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const PI = Math.PI, TAU = Math.PI * 2;
const BOX = volume.BOX;

// ------------------------------------------------------------------------------------------------ shared GLSL
const GLSL_VOL = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uVol;
uniform vec3 uBox;
uniform vec4 uGA; uniform vec4 uGAp; uniform vec4 uGAh;
uniform vec4 uGB; uniform vec4 uGBp; uniform vec4 uGBh;
uniform vec4 uKey; uniform vec4 uKeyP; uniform float uKeyBar;
uniform vec3 uMovMin; uniform vec3 uMovMax; uniform vec3 uAx; uniform vec3 uKS;
uniform float uSoft;
vec3 toTex(vec3 p) { return vec3(p.x / uBox.x + 0.5, p.y / uBox.y, p.z / uBox.z + 0.5); }
float gearSd(vec3 p, vec4 G, vec4 Gp, vec4 Gh) {
  vec3 q = p - G.xyz;
  float r = length(q.xy);
  float a = atan(q.y, q.x) - G.w - Gh.w;
  float tooth = clamp(cos(Gp.w * a) * 1.8, -1.0, 1.0);
  float d = r - (Gp.x - Gp.y * 0.5 + Gp.y * 0.5 * tooth);
  float sector = 6.28318530718 / Gh.x;
  float k = floor(a / sector + 0.5);
  float ha = k * sector + G.w + Gh.w;
  d = max(d, -(length(q.xy - Gh.z * vec2(cos(ha), sin(ha))) - Gh.y));
  return max(d, abs(q.z) - Gp.z);
}
float keySd(vec3 p) {
  vec2 q = p.xy - uKey.xy;
  float c = cos(uKey.w), s = sin(uKey.w);
  float u = c * q.x + s * q.y, w = -s * q.x + c * q.y, z = p.z - uKey.z;
  float lb = length(vec2(abs(u) - uKeyP.y, z));
  float d = max(min(lb - uKeyP.x, max(abs(u) - uKeyP.y, abs(z) - uKeyBar)), -(lb - uKeyP.z));
  return max(d, abs(w) - uKeyP.w);
}
float rodZ(vec3 p, vec2 c, vec3 R) { return max(length(p.xy - c) - R.x, abs(p.z - 0.5 * (R.y + R.z)) - 0.5 * abs(R.z - R.y)); }
float movMetal(vec3 p) {
  vec3 o = step(uMovMin, p) * step(p, uMovMax);
  float inside = o.x * o.y * o.z;
  float d = min(min(gearSd(p, uGA, uGAp, uGAh), gearSd(p, uGB, uGBp, uGBh)), keySd(p));
  d = min(d, min(min(rodZ(p, uGA.xy, uAx), rodZ(p, uGB.xy, uAx)), rodZ(p, uKey.xy, uKS)));
  return inside * clamp(0.5 - d / uSoft, 0.0, 1.0);
}
vec3 matAt(vec3 p) {
  vec3 v = textureLod(uVol, toTex(p), 0.0).rgb;
  float m = movMetal(p);
  return vec3(v.r * (1.0 - m), v.g * (1.0 - m), max(v.b, m));
}
`;

const CARD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const CARD_FS = /* glsl */ `
${GLSL_VOL}
varying vec2 vUv;
uniform float uH; uniform float uZoom; uniform float uDraw; uniform float uBase; uniform float uOpacity; uniform float uSeed;
uniform float uGrain; uniform float uFilmA; uniform float uEdge; uniform float uSharpC; uniform float uFilmInk;
uniform vec3 uScreen; uniform vec3 uInk; uniform vec3 uFilm; uniform vec3 uLine; uniform vec3 uFrameC; uniform vec3 uGreyW;
float hash2(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 4096) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / 4294967296.0);
}
void main() {
  vec3 p = vec3(-(vUv.y - 0.5) * uBox.x / uZoom, uH, (vUv.x - 0.5) * uBox.z / uZoom);
  vec3 m = clamp((matAt(p) - 0.5) * uSharpC + 0.5, 0.0, 1.0);
  float g = clamp(dot(m, uGreyW), 0.0, 1.0);
  float nz = hash2(vec2(p.x, p.z) / 0.00625 + uSeed * 131.0) - 0.5;   // grain at voxel scale (same in hero and thumbnail)
  g = clamp(g + nz * uGrain * (0.35 + g), 0.0, 1.0);
  float wipe = uDraw * 1.06 - 0.03;
  float y = 1.0 - vUv.y;
  float shown = 1.0 - smoothstep(wipe - 0.004, wipe + 0.004, y);
  float gv = g * shown;
  float front = (1.0 - smoothstep(0.0, 0.02, abs(y - wipe))) * step(0.0005, uDraw) * (1.0 - step(0.9995, uDraw));
  vec3 cPanel = mix(uScreen, uInk, gv);
  vec3 cFilm = mix(uFilm, uInk * uFilmInk, smoothstep(0.0, 0.6, gv));
  float aFilm = max(clamp(gv * 1.35, 0.0, 1.0), uFilmA);
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float border = (1.0 - smoothstep(uEdge * 0.55, uEdge, e)) * (1.0 - uBase);
  cFilm = mix(cFilm, uFrameC, border);
  aFilm = max(aFilm, border * 0.95);
  vec3 col = mix(cFilm, cPanel, uBase);
  float a = mix(aFilm, 1.0, uBase);
  col = mix(col, uLine * 1.8, front);
  a = max(a, front);
  gl_FragColor = vec4(col, a * uOpacity);
}
`;

const VOL_VS = /* glsl */ `
varying vec3 vOrigin;
varying vec3 vDir;
void main() {
  vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vDir = position - vOrigin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const volFS = (steps) => /* glsl */ `
${GLSL_VOL}
varying vec3 vOrigin;
varying vec3 vDir;
uniform vec3 uVis; uniform vec3 uCCard; uniform vec3 uCPlastic; uniform vec3 uCMetal;
uniform vec3 uSigma; uniform vec3 uEmit; uniform vec3 uLight;
uniform float uFade; uniform float uShade; uniform float uSharp; uniform vec3 uSpec; uniform vec3 uOutline;
uniform vec3 uBMin; uniform vec3 uBMax;   // march bounds (unit-cube space): the whole box, or the robot once the card is gone
vec2 softCov(vec3 p) { vec3 v = textureLod(uVol, toTex(p), 0.0).rgb; float m = movMetal(p); return clamp((vec2(v.r, v.g) * (1.0 - m) - 0.5) * uSharp + 0.5, 0.0, 1.0) * uVis.xy; }
float metalAt(vec3 p) { return max(textureLod(uVol, toTex(p), 0.0).b, movMetal(p)); }
float dens2(vec3 p) { vec3 v = textureLod(uVol, toTex(p), 0.0).rgb; return dot(clamp((v.rg - 0.5) * uSharp + 0.5, 0.0, 1.0) * uVis.xy, uSigma.xy); }
vec3 toLocal(vec3 pu) { return pu * uBox + vec3(0.0, 0.5 * uBox.y, 0.0); }
void main() {
  vec3 rd = normalize(vDir);
  vec3 rs = vec3(abs(rd.x) < 1e-5 ? 1e-5 : rd.x, abs(rd.y) < 1e-5 ? 1e-5 : rd.y, abs(rd.z) < 1e-5 ? 1e-5 : rd.z);
  vec3 inv = 1.0 / rs;
  vec3 t0 = (uBMin - vOrigin) * inv, t1 = (uBMax - vOrigin) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float tN = max(max(max(tn.x, tn.y), tn.z), 0.0);
  float tF = min(min(tf.x, tf.y), tf.z);
  if (tF <= tN || uFade <= 0.0) discard;
  float dt = (tF - tN) / float(${steps});
  float ds = dt * length(rd * uBox);
  vec3 vw = -normalize(rd * uBox);          // view vector in local metres
  vec3 col = vec3(0.0);
  float T = 1.0;
  float prev = 0.0;
  float mMax = 0.0;
  bool hit = false;
  for (int i = 0; i < ${steps}; i++) {
    float tt = tN + (float(i) + 0.5) * dt;
    vec3 p = toLocal(vOrigin + rd * tt);
    // ---- metal: an opaque iso-surface (coverage 0.5), refined by bisection, lit with a gradient normal
    float mv = metalAt(p) * uVis.z;
    mMax = max(mMax, mv);
    if (mv > 0.5) {
      float lo = tt - dt, hi = tt;
      for (int j = 0; j < 5; j++) {
        float mid = 0.5 * (lo + hi);
        if (metalAt(toLocal(vOrigin + rd * mid)) > 0.5) hi = mid; else lo = mid;
      }
      vec3 ph = toLocal(vOrigin + rd * hi);
      // card + plastic between the last sample and the surface
      vec2 cv = softCov(ph) * uSigma.xy;
      float sg = cv.x + cv.y;
      if (sg > 0.05) {
        float a0 = 1.0 - exp(-sg * ds * clamp((hi - (tt - 0.5 * dt)) / dt, 0.0, 1.0));
        col += T * (cv.x * uCCard * uEmit.x + cv.y * uCPlastic * uEmit.y) / sg * a0;
        T *= 1.0 - a0;
      }
      float e = 0.0032;
      vec3 g = vec3(metalAt(ph + vec3(e, 0.0, 0.0)) - metalAt(ph - vec3(e, 0.0, 0.0)),
                    metalAt(ph + vec3(0.0, e, 0.0)) - metalAt(ph - vec3(0.0, e, 0.0)),
                    metalAt(ph + vec3(0.0, 0.0, e)) - metalAt(ph - vec3(0.0, 0.0, e)));
      float gl = length(g);
      vec3 n = gl > 1e-5 ? -g / gl : vw;
      if (dot(n, vw) < 0.0) n = -n;
      float dl = max(dot(n, uLight), 0.0);
      float nv = max(dot(n, vw), 0.0);
      float sp = pow(max(dot(reflect(-vw, n), uLight), 0.0), 24.0);
      float fill = max(dot(n, normalize(vec3(0.6, 0.2, 0.75))), 0.0);
      vec3 mc = uCMetal * uEmit.z * (0.22 + 0.95 * dl + 0.25 * fill) + uSpec * sp;
      mc *= mix(0.18, 1.0, smoothstep(0.04, 0.42, nv));   // dark silhouette edge (outline)
      col += T * mc;
      T = 0.0;
      hit = true;
      break;
    }
    // ---- card + plastic: emission / absorption
    vec2 cv = softCov(p) * uSigma.xy;
    float sig = cv.x + cv.y;
    if (sig > 0.05) {
      float frac = 1.0;
      if (prev <= 0.05) {   // entering: weight this step by the part of its interval that is really inside
        float lo = tt - dt, hi = tt;
        for (int j = 0; j < 3; j++) {
          float mid = 0.5 * (lo + hi);
          vec2 cm = softCov(toLocal(vOrigin + rd * mid)) * uSigma.xy;
          if (cm.x + cm.y > 0.05) hi = mid; else lo = mid;
        }
        frac = clamp((tt + 0.5 * dt - 0.5 * (lo + hi)) / dt, 0.0, 1.5);
      }
      float e = 0.0085;
      float d0 = dens2(p);
      vec3 gr = vec3(dens2(p + vec3(e, 0.0, 0.0)), dens2(p + vec3(0.0, e, 0.0)), dens2(p + vec3(0.0, 0.0, e))) - vec3(d0);
      float gl = length(gr);
      vec3 nrm = -gr / max(gl, 1e-4);
      float lit = 1.0 + uShade * (max(dot(nrm, uLight), 0.0) - 0.45) * clamp(gl * 0.05, 0.0, 1.0);
      vec3 c = (cv.x * uCCard * uEmit.x + cv.y * uCPlastic * (uEmit.y * lit)) / sig;
      float a = 1.0 - exp(-sig * ds * frac);
      col += T * c * a;
      T *= 1.0 - a;
      if (T < 0.01) break;
    }
    prev = sig;
  }
  // soft metal silhouette: rays that grazed a metal part without crossing the iso level get a fringe (anti-aliasing)
  if (!hit) {   // rays that grazed metal without crossing the iso level: a dark outline fringe
    float f = smoothstep(0.16, 0.5, mMax) * 0.9;
    col += T * uOutline * f;
    T *= 1.0 - f;
  }
  gl_FragColor = vec4(col * uFade, (1.0 - T) * uFade);
}
`;

const SHADOW_FS = /* glsl */ `
varying vec2 vXZ;
uniform sampler2D uProj; uniform vec2 uSize; uniform vec2 uOff; uniform vec3 uVis; uniform vec3 uSig;
uniform vec3 uColor; uniform float uK;
void main() {
  vec2 st = vec2((vXZ.x - uOff.x) / uSize.x + 0.5, (vXZ.y - uOff.y) / uSize.y + 0.5);
  vec2 inb = step(vec2(0.0), st) * step(st, vec2(1.0));
  vec3 pr = texture2D(uProj, clamp(st, 0.0, 1.0)).rgb * inb.x * inb.y;
  float a = uK * (1.0 - exp(-dot(pr * uVis, uSig)));
  gl_FragColor = vec4(uColor, a);
}
`;
const SHADOW_VS = /* glsl */ `
varying vec2 vXZ;
void main() { vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const col = (hex, k = 1) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };
  const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  // ---------------------------------------------------------------- room
  function room() {
    const R = spec.room;
    const g = new THREE.Group(); g.name = "room";
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R.floorR, 96), materials.floor);
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; g.add(floor);
    // wall: unlit vertical gradient (exact teal), soft seams, a white cove at the floor
    const Wc = 1024, Hc = 512, c = newCanvas(Wc, Hc), x = canvas2d(c);
    const gr = x.createLinearGradient(0, 0, 0, Hc);
    gr.addColorStop(0, R.wallTop); gr.addColorStop(0.62, R.wallBottom); gr.addColorStop(1, R.wallBottom);
    x.fillStyle = gr; x.fillRect(0, 0, Wc, Hc);
    x.globalAlpha = 0.55; x.fillStyle = R.seamColor;
    for (let i = 0; i < R.seams; i++) x.fillRect(Math.round((i / R.seams) * Wc), 0, 3, Hc);
    x.globalAlpha = 1;
    const coveH = Math.round((R.coveH / R.wallH) * Hc);
    x.fillStyle = R.cove; x.fillRect(0, Hc - coveH, Wc, coveH);
    x.fillStyle = "rgba(0,0,0,0.08)"; x.fillRect(0, Hc - coveH - 2, Wc, 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R.wallR, R.wallR, R.wallH, 128, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
    wall.position.y = R.wallH / 2; g.add(wall);
    uploadTexture(stage, tex);
    return g;
  }

  // ---------------------------------------------------------------- the cardboard box (beat 1)
  function kraftCanvas(wM, hM, kind, seed) {
    const B = spec.box, ppm = B.px;
    const W = Math.round(wM * ppm), H = Math.round(hM * ppm);
    const c = newCanvas(W, H), x = canvas2d(c);
    const img = x.createImageData(W, H);
    const base = new THREE.Color(B.kraft), dark = new THREE.Color(B.kraftDark);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const n = fbm2((i / W) * 3.2, (j / H) * 3.2 * (hM / wM), { seed, octaves: 3 });
      const e = Math.min(i, W - 1 - i, j, H - 1 - j) / (0.05 * ppm);
      const k = clamp(0.45 + 0.5 * (n - 0.5) * 1.6, 0, 1) * 0.5 + (1 - clamp(e, 0, 1)) * 0.35;
      const r = base.r + (dark.r - base.r) * k, gg = base.g + (dark.g - base.g) * k, b = base.b + (dark.b - base.b) * k;
      const o = (j * W + i) * 4;
      img.data[o] = Math.round(r * 255); img.data[o + 1] = Math.round(gg * 255); img.data[o + 2] = Math.round(b * 255); img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const m = (v) => v * ppm;
    if (kind === "top") {
      x.fillStyle = "rgba(90,60,30,0.55)"; x.fillRect(0, H / 2 - 1.5, W, 3);              // flap seam
      x.fillStyle = B.tape; x.globalAlpha = 0.92; x.fillRect(0, H / 2 - m(0.05), W, m(0.1)); x.globalAlpha = 1;
      x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(0, H / 2 - m(0.05), W, m(0.012));
    } else if (kind === "side") {
      x.fillStyle = B.tape; x.globalAlpha = 0.92; x.fillRect(W / 2 - m(0.05), 0, m(0.1), m(0.13)); x.globalAlpha = 1;
    } else if (kind === "front") {
      // handling marks (generic): two up arrows in a box, and a glass icon; a blank white label
      x.strokeStyle = B.ink; x.fillStyle = B.ink; x.lineWidth = m(0.007); x.lineJoin = "round";
      const ax = W - m(0.2), ay = m(0.08);
      x.strokeRect(ax, ay, m(0.15), m(0.13));
      for (const dx of [0.045, 0.105]) {
        const cx = ax + m(dx);
        x.fillRect(cx - m(0.007), ay + m(0.045), m(0.014), m(0.07));
        x.beginPath(); x.moveTo(cx - m(0.022), ay + m(0.05)); x.lineTo(cx, ay + m(0.02)); x.lineTo(cx + m(0.022), ay + m(0.05)); x.closePath(); x.fill();
      }
      const gx = m(0.06), gy = m(0.08);
      x.strokeRect(gx, gy, m(0.13), m(0.13));
      x.beginPath(); x.moveTo(gx + m(0.035), gy + m(0.025)); x.lineTo(gx + m(0.095), gy + m(0.025)); x.quadraticCurveTo(gx + m(0.095), gy + m(0.07), gx + m(0.065), gy + m(0.075)); x.quadraticCurveTo(gx + m(0.035), gy + m(0.07), gx + m(0.035), gy + m(0.025)); x.fill();
      x.fillRect(gx + m(0.062), gy + m(0.075), m(0.006), m(0.03)); x.fillRect(gx + m(0.045), gy + m(0.103), m(0.04), m(0.006));
      x.fillStyle = "#f2ede2"; x.fillRect(W / 2 - m(0.15), H - m(0.27), m(0.3), m(0.17));
      x.fillStyle = "rgba(107,74,43,0.5)";
      for (let i = 0; i < 3; i++) x.fillRect(W / 2 - m(0.12), H - m(0.235) + i * m(0.045), m(i === 2 ? 0.14 : 0.24), m(0.012));
      x.fillStyle = B.tape; x.globalAlpha = 0.92; x.fillRect(0, 0, W, m(0.012)); x.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    uploadTexture(stage, t);
    return t;
  }
  function cardboardBox() {
    const mk = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.86, metalness: 0 });
    const front = mk(kraftCanvas(BOX.w, BOX.h, "front", 31)), back = mk(kraftCanvas(BOX.w, BOX.h, "back", 32));
    const side = mk(kraftCanvas(BOX.d, BOX.h, "side", 33)), side2 = mk(kraftCanvas(BOX.d, BOX.h, "side", 34));
    const top = mk(kraftCanvas(BOX.w, BOX.d, "top", 35)), bottom = mk(kraftCanvas(BOX.w, BOX.d, "plain", 36));
    const m = new THREE.Mesh(new RoundedBoxGeometry(BOX.w, BOX.h, BOX.d, 2, 0.008), [side, side2, top, bottom, front, back]);
    m.castShadow = true; m.receiveShadow = true; m.name = "box";
    return m;
  }

  // ---------------------------------------------------------------- the scanner (ring, legs, lift, scan sheet + line)
  function scanner() {
    const S = spec.scanner;
    const g = new THREE.Group(); g.name = "scanner"; g.position.set(S.pos[0], S.pos[1], S.pos[2]);
    const ringBottom = S.scanY - S.thick;
    // the ring: an annulus extruded with a soft bevel
    const sh = new THREE.Shape(); sh.absarc(0, 0, S.rOut - 0.02, 0, TAU, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, S.rIn + 0.02, 0, TAU, true); sh.holes.push(hole);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: S.thick - 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 4, curveSegments: 120 });
    rg.rotateX(-PI / 2); rg.translate(0, ringBottom + 0.02, 0);
    const ring = new THREE.Mesh(rg, materials.white); ring.castShadow = true; ring.receiveShadow = true; g.add(ring);
    // a teal band round the outside and a glowing teal lip on the inner top edge (where the scan plane leaves the ring)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(S.rOut + 0.002, S.rOut + 0.002, 0.032, 120, 1, true), materials.teal);
    band.position.y = ringBottom + S.thick * 0.5; g.add(band);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(S.rIn + 0.012, 0.007, 8, 120), materials.tealGlow);
    lip.rotation.x = PI / 2; lip.position.y = S.scanY + 0.001; g.add(lip);
    // detector band inside the bore (segments; spins)
    const D = S.detector;
    const dc = newCanvas(1024, 32), dx = canvas2d(dc);
    dx.fillStyle = "#c9d6d7"; dx.fillRect(0, 0, 1024, 32);
    for (let i = 0; i < D.segments; i++) {
      const x0 = (i / D.segments) * 1024;
      dx.fillStyle = i % 2 ? "#33545a" : "#5c7b80"; dx.fillRect(x0 + 2, 6, 1024 / D.segments - 4, 20);
      dx.fillStyle = "#5ff3e6"; dx.fillRect(x0 + 1024 / D.segments / 2 - 2, 13, 4, 6);
    }
    const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace; uploadTexture(stage, dt);
    const det = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.h, 96, 1, true), new THREE.MeshStandardMaterial({ map: dt, roughness: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color("#0b3337"), emissiveIntensity: 0.6 }));
    det.position.y = ringBottom + D.h / 2 + 0.012; g.add(det);
    // legs + floor base + lift column + tray
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(S.leg.w, ringBottom + 0.02, S.leg.d, 2, 0.03), materials.white);
      leg.position.set(s * S.leg.x, (ringBottom + 0.02) / 2, 0); shadowAll(leg); g.add(leg);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(S.leg.w + 0.08, 0.04, S.leg.d + 0.12, 2, 0.015), materials.whiteMatte);
      foot.position.set(s * S.leg.x, 0.02, 0); shadowAll(foot); g.add(foot);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(S.leg.w * 0.4, 0.42, 0.006), materials.teal);
      stripe.position.set(s * S.leg.x, 0.5, S.leg.d / 2 + 0.003); g.add(stripe);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(S.base.r, S.base.r + 0.02, S.base.h, 64), materials.whiteMatte);
    base.position.y = S.base.h / 2; shadowAll(base); g.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(S.column.r, S.column.r, 1, 32), materials.grey);
    shadowAll(column); g.add(column);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(S.tray.r, S.tray.r, S.tray.h, 64), materials.white);
    shadowAll(tray); g.add(tray);
    const box = cardboardBox(); g.add(box);
    // scan sheet: a translucent teal disc filling the bore at the scan plane (additive, radial falloff)
    const sc = newCanvas(256, 256), sx = canvas2d(sc);
    const rgd = sx.createRadialGradient(128, 128, 0, 128, 128, 128);
    rgd.addColorStop(0, "rgba(255,255,255,0.35)"); rgd.addColorStop(0.75, "rgba(255,255,255,0.6)"); rgd.addColorStop(0.97, "rgba(255,255,255,1)"); rgd.addColorStop(1, "rgba(255,255,255,0)");
    sx.fillStyle = rgd; sx.fillRect(0, 0, 256, 256);
    const st = new THREE.CanvasTexture(sc); uploadTexture(stage, st);
    const sheetMat = new THREE.MeshBasicMaterial({ map: st, color: col(S.sheet.color, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const sheet = new THREE.Mesh(new THREE.CircleGeometry(S.rIn + 0.01, 96), sheetMat);
    sheet.rotation.x = -PI / 2; sheet.position.y = S.scanY + 0.0015; g.add(sheet);
    // the scan line: a loop of four glowing bars hugging the box at the scan plane
    const L = S.line, pw = BOX.w / 2 + L.pad, pd = BOX.d / 2 + L.pad;
    const bars = [
      new THREE.BoxGeometry(2 * pw + L.width, L.width, L.width).translate(0, 0, pd),
      new THREE.BoxGeometry(2 * pw + L.width, L.width, L.width).translate(0, 0, -pd),
      new THREE.BoxGeometry(L.width, L.width, 2 * pd + L.width).translate(pw, 0, 0),
      new THREE.BoxGeometry(L.width, L.width, 2 * pd + L.width).translate(-pw, 0, 0),
    ];
    const loop = new THREE.Mesh(mergeGeometries(bars), new THREE.MeshBasicMaterial({ color: col(L.color, L.strength) }));
    loop.position.y = S.scanY + L.width / 2; g.add(loop);
    g.userData = { box, column, tray, sheet, loop, det, base };
    return g;
  }

  // ---------------------------------------------------------------- the floating panel
  function panelDims() { return volume.panelLayout(spec.panel, BOX); }
  function panel() {
    const Q = spec.panel, L = panelDims();
    const g = new THREE.Group(); g.name = "panel"; g.position.set(Q.c[0], Q.c[1], Q.c[2]);
    const bez = new THREE.Mesh(new RoundedBoxGeometry(L.outerW, L.outerH, Q.depth, 3, 0.03), materials.white);
    bez.position.z = -Q.depth / 2; bez.castShadow = true; g.add(bez);
    const ppm = 420, Wc = Math.round(L.screenW * ppm), Hc = Math.round(L.screenH * ppm);
    const c = newCanvas(Wc, Hc), x = canvas2d(c);
    const X = (m) => (m + L.screenW / 2) * ppm, Y = (m) => (L.screenH / 2 - m) * ppm;   // panel metres -> canvas px
    x.fillStyle = Q.screen; x.fillRect(0, 0, Wc, Hc);
    const vg = x.createRadialGradient(Wc / 2, Hc / 2, Hc * 0.2, Wc / 2, Hc / 2, Wc * 0.62);
    vg.addColorStop(0, "rgba(40,110,125,0.0)"); vg.addColorStop(1, "rgba(0,0,0,0.25)");
    x.fillStyle = vg; x.fillRect(0, 0, Wc, Hc);
    const ticks = (x0, y0, w, h, tk, col, lw) => {
      x.strokeStyle = col; x.lineWidth = lw;
      for (const [px, py, sx2, sy2] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]]) {
        x.beginPath(); x.moveTo(px + sx2 * tk, py); x.lineTo(px, py); x.lineTo(px, py + sy2 * tk); x.stroke();
      }
    };
    // hero view: flat screen colour inside a teal frame, faint crosshair, corner ticks
    const H = L.hero, hx = X(H.cx - H.w / 2), hy = Y(H.cy + H.h / 2), hw = H.w * ppm, hh = H.h * ppm;
    x.fillStyle = Q.screen; x.fillRect(hx, hy, hw, hh);
    x.strokeStyle = Q.cellLine; x.lineWidth = 4; x.strokeRect(hx - 6, hy - 6, hw + 12, hh + 12);
    x.globalAlpha = 0.35; x.lineWidth = 2; x.setLineDash([10, 12]);
    x.beginPath(); x.moveTo(hx + hw / 2, hy); x.lineTo(hx + hw / 2, hy + hh); x.moveTo(hx, hy + hh / 2); x.lineTo(hx + hw, hy + hh / 2); x.stroke();
    x.setLineDash([]); x.globalAlpha = 1;
    ticks(hx - 6, hy - 6, hw + 12, hh + 12, 34, Q.glow, 5);
    // gauge: a side view of the box (thin outline) the scan marker moves down
    const G = L.gauge, gx = X(G.cx - G.w / 2), gy = Y(G.cy + G.h / 2), gw = G.w * ppm, gh = G.h * ppm;
    x.strokeStyle = Q.cellLine; x.lineWidth = 3; x.strokeRect(gx + gw * 0.18, gy, gw * 0.64, gh);
    x.globalAlpha = 0.5;
    for (let i = 0; i <= 10; i++) { const yy = gy + (gh * i) / 10; x.beginPath(); x.moveTo(gx + gw * 0.82, yy); x.lineTo(gx + gw, yy); x.stroke(); }
    x.globalAlpha = 1;
    // thumbnail cells
    L.cells.forEach(([cx0, cy0]) => {
      const cx = X(cx0 - L.cellW / 2), cy = Y(cy0 + L.cellH / 2), cw = L.cellW * ppm, ch = L.cellH * ppm;
      x.fillStyle = Q.screen; x.fillRect(cx, cy, cw, ch);
      x.strokeStyle = Q.cellLine; x.lineWidth = 3; x.strokeRect(cx - 4, cy - 4, cw + 8, ch + 8);
      ticks(cx - 4, cy - 4, cw + 8, ch + 8, 12, Q.glow, 3);
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; uploadTexture(stage, tex);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(L.screenW, L.screenH), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.z = 0.001; g.add(screen);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(L.outerW * 0.3, 0.012, 0.01), materials.tealGlow);
    glow.position.set(0, -L.outerH / 2 + Q.bezel * 0.45, 0.004); g.add(glow);
    // gauge marker (bright bar + arrow) and the scanned part of the box (a teal fill from the top down to the marker)
    const gaugeFill = new THREE.Mesh(new THREE.PlaneGeometry(G.w * 0.64, 1), new THREE.MeshBasicMaterial({ color: col(Q.glow, 0.9), transparent: true, opacity: 0.32, depthWrite: false }));
    gaugeFill.position.set(G.cx, 0, 0.003); g.add(gaugeFill);
    const mk = new THREE.Shape(); mk.moveTo(-G.w * 0.5, 0.012); mk.lineTo(G.w * 0.5, 0.012); mk.lineTo(G.w * 0.5, -0.012); mk.lineTo(-G.w * 0.5, -0.012); mk.closePath();
    const arrow = new THREE.Shape(); arrow.moveTo(-G.w * 0.5 - 0.05, 0.035); arrow.lineTo(-G.w * 0.5 - 0.005, 0); arrow.lineTo(-G.w * 0.5 - 0.05, -0.035); arrow.closePath();
    const marker = new THREE.Mesh(new THREE.ShapeGeometry([mk, arrow]), new THREE.MeshBasicMaterial({ color: col(Q.glow, 1.6) }));
    marker.position.set(G.cx, 0, 0.004); g.add(marker);
    g.userData = { dims: L, layout: L, gaugeFill, marker,
      setGauge(on, hN) { // hN = slice height / box height (1 = top)
        marker.visible = gaugeFill.visible = on > 0.001;
        const yTop = G.cy + G.h / 2, y = G.cy - G.h / 2 + G.h * hN;
        marker.position.y = y; marker.scale.setScalar(on);
        gaugeFill.scale.y = Math.max(0.001, yTop - y); gaugeFill.position.y = (yTop + y) / 2;
      } };
    return g;
  }

  // ---------------------------------------------------------------- plinth + turntable
  function plinth() {
    const L = spec.plinth;
    const g = new THREE.Group(); g.name = "plinth"; g.position.set(L.c[0], 0, L.c[2]);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(L.r, L.r + 0.03, L.h, 96), materials.white);
    body.position.y = L.h / 2; shadowAll(body); g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(L.r + 0.004, L.r + 0.004, 0.03, 96, 1, true), materials.teal);
    band.position.y = L.h - 0.1; g.add(band);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(L.tableR + 0.018, 0.007, 8, 120), materials.tealGlow);
    lip.rotation.x = PI / 2; lip.position.y = L.h + 0.004; g.add(lip);
    // turntable: pale disc with rim ticks (shows the turn)
    const c = newCanvas(512, 512), x = canvas2d(c);
    x.fillStyle = spec.materials.turntable.baseColor; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = "rgba(214,250,247,0.55)"; x.lineWidth = 3;
    x.beginPath(); x.arc(256, 256, 236, 0, TAU); x.stroke();
    x.beginPath(); x.arc(256, 256, 120, 0, TAU); x.stroke();
    for (let i = 0; i < L.ticks; i++) {
      const a = (i / L.ticks) * TAU, r0 = i % 9 === 0 ? 200 : 218;
      x.lineWidth = i % 9 === 0 ? 6 : 3;
      x.beginPath(); x.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0); x.lineTo(256 + Math.cos(a) * 236, 256 + Math.sin(a) * 236); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; uploadTexture(stage, tex);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(L.tableR, L.tableR, L.table, 96), [materials.turntable, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }), materials.turntable]);
    top.position.y = L.h + L.table / 2; top.receiveShadow = true; g.add(top);
    g.userData = { top, y0: L.h + L.table };
    return g;
  }

  // ---------------------------------------------------------------- the volume texture + shared uniforms
  function volumeUniforms(plan) {
    const V = plan.volume, VS = spec.volume;
    const tex = new THREE.Data3DTexture(V.data, V.nx, V.ny, V.nz);
    tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1; tex.generateMipmaps = false; tex.needsUpdate = true;
    uploadTexture(stage, tex);
    const [GA, GB] = volume.GEARS, K = volume.KEY;
    const vox = Math.max(...V.vox);
    // bounds of the turning metal (gears + key bow sweep), with a margin
    const reach = K.bow.lobeAt + K.bow.lobeR + 0.006;
    const mn = [Math.min(GA.c[0] - GA.R, GB.c[0] - GB.R, K.axis[0] - reach) - 0.006, Math.min(GA.c[1] - GA.R, GB.c[1] - GB.R, K.axis[1] - reach) - 0.006, K.bow.z - K.bow.lobeR - 0.006];
    const mx = [Math.max(GA.c[0] + GA.R, GB.c[0] + GB.R, K.axis[0] + reach) + 0.006, Math.max(GA.c[1] + GA.R, GB.c[1] + GB.R, K.axis[1] + reach) + 0.006, Math.max(GA.c[2] + GA.th / 2, volume.AXLES.z1) + 0.006];
    const gp = plan.gearPhase;
    return {
      uVol: { value: tex },
      uBox: { value: new THREE.Vector3(BOX.w, BOX.h, BOX.d) },
      uGA: { value: new THREE.Vector4(GA.c[0], GA.c[1], GA.c[2], 0) },
      uGAp: { value: new THREE.Vector4(GA.R, GA.depth, GA.th / 2, GA.teeth) },
      uGAh: { value: new THREE.Vector4(GA.holes, GA.holeR, GA.holeAt, gp.A) },
      uGB: { value: new THREE.Vector4(GB.c[0], GB.c[1], GB.c[2], 0) },
      uGBp: { value: new THREE.Vector4(GB.R, GB.depth, GB.th / 2, GB.teeth) },
      uGBh: { value: new THREE.Vector4(GB.holes, GB.holeR, GB.holeAt, gp.B) },
      uKey: { value: new THREE.Vector4(K.axis[0], K.axis[1], K.bow.z, 0) },
      uKeyP: { value: new THREE.Vector4(K.bow.lobeR, K.bow.lobeAt, K.bow.holeR, K.bow.th) },
      uKeyBar: { value: K.bow.bar },
      uMovMin: { value: new THREE.Vector3(...mn) },
      uMovMax: { value: new THREE.Vector3(...mx) },
      uSoft: { value: VS.soft * vox },
      uAx: { value: new THREE.Vector3(volume.AXLES.r, volume.AXLES.z0, volume.AXLES.z1) },
      uKS: { value: new THREE.Vector3(K.shaft.r, K.shaft.z0, K.shaft.z1) },
    };
  }

  // ---------------------------------------------------------------- slice card (panel cell -> film card)
  function sliceCard(U, k, h) {
    const SL = spec.slice;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        uH: { value: h }, uZoom: { value: 1 }, uDraw: { value: 0 }, uBase: { value: 1 }, uOpacity: { value: 1 }, uSeed: { value: k + 1 },
        uGrain: { value: SL.grain }, uFilmA: { value: SL.filmAlpha }, uEdge: { value: SL.edge }, uSharpC: { value: SL.sharpen }, uFilmInk: { value: SL.filmInk },
        uScreen: { value: col(spec.panel.screen) }, uInk: { value: col(SL.ink) }, uFilm: { value: col(SL.film) },
        uLine: { value: col(SL.line) }, uFrameC: { value: col(SL.frame, 1.3) }, uGreyW: { value: new THREE.Vector3(...SL.grey) },
      },
      vertexShader: CARD_VS, fragmentShader: CARD_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(BOX.d, BOX.w), mat);
    // thin glowing frame bars (visible edge-on)
    const fw = SL.frameW, hw = BOX.d / 2, hh = BOX.w / 2;
    const fr = mergeGeometries([
      new THREE.BoxGeometry(BOX.d + fw, fw, fw).translate(0, hh, 0), new THREE.BoxGeometry(BOX.d + fw, fw, fw).translate(0, -hh, 0),
      new THREE.BoxGeometry(fw, BOX.w + fw, fw).translate(hw, 0, 0), new THREE.BoxGeometry(fw, BOX.w + fw, fw).translate(-hw, 0, 0),
    ]);
    const frameMat = new THREE.MeshBasicMaterial({ color: col(SL.frame, 1.25), transparent: true, opacity: 0, depthWrite: false });
    const frame = new THREE.Mesh(fr, frameMat);
    const g = new THREE.Group(); g.name = `slice${k}`; g.add(plane, frame);
    g.userData = { mat, frameMat, plane, frame };
    plane.renderOrder = 2; frame.renderOrder = 3;
    return g;
  }

  // ---------------------------------------------------------------- the ray-marched volume
  function volumeMesh(U) {
    const VS = spec.volume;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        uVis: { value: new THREE.Vector3(1, 1, 1) },
        uCCard: { value: col(VS.colors.card) }, uCPlastic: { value: col(VS.colors.plastic) }, uCMetal: { value: col(VS.colors.metal) },
        uSigma: { value: new THREE.Vector3(...VS.sigma) }, uEmit: { value: new THREE.Vector3(...VS.emission) },
        uLight: { value: new THREE.Vector3(...VS.light).normalize() },
        uFade: { value: 0 }, uShade: { value: VS.shade }, uSharp: { value: VS.sharpen },
        uSpec: { value: col(VS.metalSpec) }, uOutline: { value: col(VS.outline) },
        uBMin: { value: new THREE.Vector3(-0.5, -0.5, -0.5) }, uBMax: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      },
      vertexShader: VOL_VS, fragmentShader: volFS(VS.steps),
      transparent: true, depthWrite: false, side: THREE.BackSide, premultipliedAlpha: true,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.scale.set(BOX.w, BOX.h, BOX.d); m.renderOrder = 4; m.name = "volume";
    m.userData = { mat };
    return m;
  }
  function volumeShadow(plan) {
    const V = plan.volume, SH = spec.shadow;
    const tex = new THREE.DataTexture(V.proj, V.nx, V.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true; uploadTexture(stage, tex);
    const geo = new THREE.PlaneGeometry(BOX.w * 1.4, BOX.d * 1.4); geo.rotateX(-PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uProj: { value: tex }, uSize: { value: new THREE.Vector2(BOX.w, BOX.d) }, uOff: { value: new THREE.Vector2(...SH.offset) },
        uVis: { value: new THREE.Vector3(1, 1, 1) }, uSig: { value: new THREE.Vector3(...SH.sigma) },
        uColor: { value: col(SH.color) }, uK: { value: 0 },
      },
      vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.name = "volumeShadow";
    return m;
  }

  // ---------------------------------------------------------------- overlay caption: a vertical roll
  /** caption() -> overlay chip; userData.show({ a, b, u }) — a = current, b = next, u = 0..1 transition.
   *  The old label rolls UP and out of the plate while the new one rolls up into it from below (clipped to the plate),
   *  the plate width easing between the two; the roll is short, so one label is readable at almost every instant. */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 28;
    const font = `${Q.weight} ${Math.round(Q.cap / Q.capRatio)}px ${Q.font}`;
    const mc = newCanvas(8, 8), mx = canvas2d(mc);
    const widths = new Map();
    const widthOf = (s) => { if (!s) return 0; if (!widths.has(s)) { mx.font = font; widths.set(s, Math.ceil(mx.measureText(s).width)); } return widths.get(s); };
    const pad = Math.round(Q.h * 0.26), ic = Math.round(Q.h * 0.46);
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.a) return;
      const pw = Math.min(W - 16, pad + ic + pad + st.w + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(4,30,34,0.35)"; x.beginPath(); x.roundRect(ox + 4, oy + 9, pw, ph, 20); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 20); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 18); x.stroke();
      // icon: a slice square with a scan line through it
      const ix = ox + pad, iy = oy + (ph - ic) / 2;
      x.strokeStyle = Q.icon; x.lineWidth = 6; x.beginPath(); x.roundRect(ix, iy, ic, ic, 10); x.stroke();
      x.fillStyle = Q.icon; x.fillRect(ix - 8, iy + ic * 0.55 - 3, ic + 16, 6);
      x.globalAlpha = 0.55; x.fillRect(ix + ic * 0.22, iy + ic * 0.22, ic * 0.56, ic * 0.2); x.globalAlpha = 1;
      // text window: old label rolls up and out, new label rolls in from below
      const tx = ox + pad + ic + pad;
      x.save(); x.beginPath(); x.rect(tx - 4, oy + 6, pw - (tx - ox) - 6, ph - 12); x.clip();
      x.font = font; x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      const ty = oy + Math.round(ph / 2) + 3, roll = ph * 0.9;
      if (st.e < 1) x.fillText(st.a, tx, ty - st.e * roll);
      if (st.b) x.fillText(st.b, tx, ty + (1 - st.e) * roll);
      x.restore();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (L) => {
      const u = Math.round(clamp(L.u) * 1000) / 1000;
      const b = u > 0 ? L.b : "";
      const e = b ? Math.round(ease.inOutExpo(u) * 1000) / 1000 : 0;   // a quick crossing: each label readable for most of the roll
      const wa = widthOf(L.a), wb = b ? widthOf(b) : wa;
      mesh.userData.set({ a: L.a, b, e, w: Math.round(wa + (wb - wa) * e) });
      mesh.userData.opacity(1);
    };
    mesh.userData.widthOf = widthOf;
    mesh.userData.plateWidth = (s) => pad + ic + pad + widthOf(s) + pad;
    return mesh;
  }

  // ---------------------------------------------------------------- overlay dial (beat 5)
  function dial(o = {}) {
    const Q = { ...spec.dial, ...o };
    const S2 = Math.round(Q.r * 2 + 56);
    const mesh = screenCanvas(stage, S2, S2, (x, W, H, st) => {
      const cx = W / 2, cy = H / 2 + 4, r = Q.r;
      x.fillStyle = "rgba(4,30,34,0.28)"; x.beginPath(); x.arc(cx + 3, cy + 6, r + 6, 0, TAU); x.fill();
      x.fillStyle = Q.ring; x.beginPath(); x.arc(cx, cy, r + 6, 0, TAU); x.fill();
      // detents: three coloured dots on the upper arc; removed materials turn hollow
      Q.detents.forEach((dg, i) => {
        const a = ((dg - 90) * PI) / 180, R = r - 10;
        const on = st.pos < i + 0.5 || i === Q.detents.length - 1 ? 1 : 0;
        x.beginPath(); x.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 9, 0, TAU);
        if (on) { x.fillStyle = Q.colors[i]; x.fill(); } else { x.strokeStyle = Q.colors[i]; x.lineWidth = 3; x.stroke(); }
      });
      // knob
      const kr = r * 0.62;
      x.fillStyle = Q.knob; x.beginPath(); x.arc(cx, cy, kr, 0, TAU); x.fill();
      x.strokeStyle = "rgba(10,79,87,0.25)"; x.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + st.ang;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * kr * 0.84, cy + Math.sin(a) * kr * 0.84); x.lineTo(cx + Math.cos(a) * kr * 0.97, cy + Math.sin(a) * kr * 0.97); x.stroke();
      }
      x.strokeStyle = Q.pointer; x.lineWidth = 8; x.lineCap = "round";
      x.beginPath(); x.moveTo(cx + Math.cos(st.ang) * kr * 0.12, cy + Math.sin(st.ang) * kr * 0.12); x.lineTo(cx + Math.cos(st.ang) * kr * 0.78, cy + Math.sin(st.ang) * kr * 0.78); x.stroke();
    }, { upload: true, willReadFrequently: true });
    const place = (s) => mesh.userData.place(Q.x - (S2 / 2) * s, Q.y - (S2 / 2) * s, s);
    mesh.userData.show = (d) => {
      const on = Math.round(clamp(d.on) * 1000) / 1000;
      if (on <= 0) { mesh.userData.opacity(0); return; }
      const pos = Math.round(d.pos * 1000) / 1000;
      const deg = Q.detents[0] + (Q.detents[1] - Q.detents[0]) * pos;
      mesh.userData.set({ pos, ang: Math.round((((deg - 90) * PI) / 180) * 1000) / 1000 });
      const s = Math.round((0.75 + 0.25 * on) * 1000) / 1000;
      place(s);
      mesh.userData.opacity(on);
    };
    place(1);
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * ctScan(plan) -> { group, update(t) } (adds itself to the scene). update(t) poses the box, lift, scan sheet and
   * line, the panel, all slice cards, the volume (fade, tip, turn, dial visibility, gear and key angles), the shadow.
   */
  function ctScan(plan) {
    const group = new THREE.Group(); group.name = "ctScan";
    group.add(room());
    const sc = scanner(); group.add(sc);
    const pn = panel(); group.add(pn);
    const pl = plinth(); group.add(pl);
    const U = volumeUniforms(plan);
    const cards = plan.heights.map((h, k) => { const c = sliceCard(U, k, h); group.add(c); return c; });
    const reco = new THREE.Group(); reco.name = "reco"; group.add(reco);
    const vol = volumeMesh(U); reco.add(vol);
    const shadowYaw = new THREE.Group(); group.add(shadowYaw);
    const shadow = volumeShadow(plan); shadowYaw.add(shadow);
    stage.scene.add(group);
    const S = spec.scanner, Q = spec.panel;
    const y0 = pl.userData.y0;
    shadowYaw.position.set(spec.plinth.c[0], y0 + 0.002, spec.plinth.c[2]);
    const sub = sc.userData;
    return {
      group, scanner: sc, panel: pn, plinth: pl, cards, volume: vol, reco, shadow,
      update(t) {
        // ---- scanner: box on its lift, scan sheet, scan line, detector spin
        const by = plan.boxY(t), s = plan.scanAt(t);
        sub.box.position.set(0, by + BOX.h / 2, 0);
        sub.tray.position.set(0, by - S.tray.h / 2, 0);
        const colH = Math.max(0.01, by - S.tray.h - S.base.h);
        sub.column.scale.set(1, colH, 1); sub.column.position.set(0, S.base.h + colH / 2, 0);
        const edge = clamp(Math.min(s.frac, 1 - s.frac) * 25, 0, 1);
        sub.loop.visible = s.on; sub.loop.scale.setScalar(1);
        sub.sheet.material.opacity = S.sheet.alpha * (s.on ? edge : 0);
        sub.sheet.visible = s.on;
        sub.det.rotation.y = S.detector.speed * t;
        // ---- panel (lifts away after the cards have gone)
        pn.position.y = Q.c[1] + plan.panelLiftAt(t);
        pn.visible = plan.panelLiftAt(t) < plan.cfg.panelLift.dy - 0.01;
        const gg = plan.gaugeAt(t);
        pn.userData.setGauge(gg.on, gg.h / BOX.h);
        // ---- volume state
        const fade = plan.fadeAt(t);
        const b = plan.blockAt(t);
        const d = plan.dialAt(t);
        const ga = plan.gearsAt(t);
        U.uGA.value.w = ga.A; U.uGB.value.w = ga.B; U.uKey.value.w = ga.key;
        // ---- slice cards
        cards.forEach((c, k) => {
          const p = plan.cardAt(k, t);
          c.position.set(p.pos[0], p.pos[1] + plan.panelLiftAt(t) * (p.onPanel ? 1 : 0), p.pos[2]);
          c.rotation.set(0, p.ry, p.rz);
          c.scale.setScalar(p.s);
          const op = 1 - fade;
          c.visible = op > 0.001 && p.visible;
          c.userData.mat.uniforms.uDraw.value = plan.drawAt(k, t);
          c.userData.mat.uniforms.uZoom.value = p.zoom;
          c.userData.mat.uniforms.uBase.value = p.base;
          c.userData.mat.uniforms.uOpacity.value = op;
          c.userData.mat.uniforms.uFilmA.value = spec.slice.filmAlpha + (spec.slice.filmClosed - spec.slice.filmAlpha) * plan.closeAt(t);
          c.userData.frameMat.opacity = spec.slice.frameAlpha * clamp(p.peel * 2.5, 0, 1) * op;
          c.userData.frame.visible = c.userData.frameMat.opacity > 0.001;
        });
        // ---- the volume: lying -> upright, turn, fade, dial
        reco.position.set(b.c[0], b.c[1], b.c[2]);
        reco.rotation.set(0, b.yaw, b.rz, "YXZ");
        vol.visible = fade > 0.001;
        const vm = vol.userData.mat.uniforms;
        vm.uFade.value = fade;
        const RS = spec.volume.residual;
        const vis = d.vis.map((v, i) => RS[i] + (1 - RS[i]) * v);
        vm.uVis.value.set(vis[0], vis[1], vis[2]);
        // once the cardboard is invisible, march only the robot's bounds (finer steps for the same 64)
        const tight = vis[0] < 0.001;
        const RB = spec.volume.robotBounds;
        if (tight) { vm.uBMin.value.set(RB[0][0] / BOX.w, RB[0][1] / BOX.h - 0.5, RB[0][2] / BOX.d); vm.uBMax.value.set(RB[1][0] / BOX.w, RB[1][1] / BOX.h - 0.5, RB[1][2] / BOX.d); }
        else { vm.uBMin.value.set(-0.5, -0.5, -0.5); vm.uBMax.value.set(0.5, 0.5, 0.5); }
        shadowYaw.rotation.y = b.yaw;
        shadow.material.uniforms.uK.value = spec.shadow.strength * fade * b.tip;
        shadow.material.uniforms.uVis.value.set(vis[0], vis[1], vis[2]);
        shadow.visible = shadow.material.uniforms.uK.value > 0.001;
        pl.userData.top.rotation.y = b.yaw;
      },
    };
  }

  const props = { room, scanner, cardboardBox, panel, plinth, sliceCard, volumeMesh, volumeShadow, caption, dial, ctScan };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: volume, motion: volume, helpers: { panelDims },
  };
}
