// styles/terrarium/style.js — "Terrarium": a sealed glass bottle garden on a sunlit windowsill.
// Everything is synchronous and seeded. Time enters only through the update(t) hooks the scene calls from renderAt, and
// style.render(t) rebuilds the refraction source inside the same call (no state carried between frames).
//
// GLASS approach (after glass-light): the jar's OUTER surface is an OPAQUE custom shader. style.render() first renders
// the scene WITHOUT the outer glass into a half-float MSAA target (same frame, no feedback), then the frame: each glass
// fragment samples that target at a refracted screen offset (per-channel IOR), adds Fresnel reflection of an analytic
// room (window panels -> long vertical streaks), a thick-wall inner rim line, a green body tint at grazing angles and a
// condensation haze. The jar's FAR inner wall (back faces) and the droplets render in the pre-pass, so they are seen
// THROUGH the front glass. Glass writes depth: nothing inside can sort wrong.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, clamp, smoothstep, lerp, toEase, TAU } from "../../kit/time.js";
import { makeCanvas, fbm2 } from "../../kit/textures.js";
import { getOverlay } from "../../kit/overlay.js";
import { sagPoints } from "../../kit/pathmath.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import * as growth from "./growth.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, growth };

const lin = (hex) => new THREE.Color(hex);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ===================================================================== textures (seeded canvases) =======
function tex(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
/** strata texture: "pebbles" | "charcoal" | "soil" — tileable, drawn once. */
export function strataTexture(kind, seed = 1, size = 512) {
  const P = STYLE_SPEC.palette, r = rng(seed), c = makeCanvas(size, size), ctx = c.getContext("2d");
  const wrapDraw = (f) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) f(ox, oy); };
  if (kind === "pebbles") {
    ctx.fillStyle = "#3b352e"; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 230; i++) {
      const x = r.range(0, size), y = r.range(0, size), rx = r.range(10, 26), ry = rx * r.range(0.6, 0.95), a = r.range(0, TAU);
      const col = new THREE.Color(r.pick(P.pebble)).offsetHSL(0, 0, r.range(-0.05, 0.05));
      wrapDraw((ox, oy) => {
        const g = ctx.createRadialGradient(x + ox - rx * 0.3, y + oy - ry * 0.35, rx * 0.1, x + ox, y + oy, rx * 1.05);
        g.addColorStop(0, "#" + col.clone().offsetHSL(0, 0, 0.13).getHexString());
        g.addColorStop(0.65, "#" + col.getHexString());
        g.addColorStop(1, "#" + col.clone().offsetHSL(0, 0, -0.16).getHexString());
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rx, ry, a, 0, TAU); ctx.fill();
      });
    }
  } else if (kind === "charcoal") {
    ctx.fillStyle = "#121110"; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i++) {
      const x = r.range(0, size), y = r.range(0, size), s = r.range(6, 18), n = r.int(4, 6), a0 = r.range(0, TAU);
      const l = r.range(0.1, 0.24);
      const pts = Array.from({ length: n }, (_, k) => { const a = a0 + (k / n) * TAU + r.range(-0.3, 0.3), d = s * r.range(0.6, 1.1); return [Math.cos(a) * d, Math.sin(a) * d]; });
      wrapDraw((ox, oy) => {
        ctx.fillStyle = `hsl(30, 4%, ${(l * 100).toFixed(1)}%)`;
        ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(x + ox + px, y + oy + py) : ctx.moveTo(x + ox + px, y + oy + py))); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `hsla(40, 10%, ${(l * 100 + 22).toFixed(1)}%, .55)`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x + ox + pts[0][0], y + oy + pts[0][1]); ctx.lineTo(x + ox + pts[1][0], y + oy + pts[1][1]); ctx.stroke();
      });
    }
  } else {
    const img = ctx.createImageData(size, size), hx = parseInt(P.soil.slice(1), 16);
    const base = { r: (hx >> 16) / 255, g: ((hx >> 8) & 255) / 255, b: (hx & 255) / 255 };   // sRGB channels
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = fbm2(x / 22, y / 22, { seed, octaves: 4, period: size / 22 });
      const k = 0.72 + 0.55 * n, i = (y * size + x) * 4;
      img.data[i] = Math.min(255, base.r * 255 * k); img.data[i + 1] = Math.min(255, base.g * 255 * k); img.data[i + 2] = Math.min(255, base.b * 255 * k); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 160; i++) {
      const x = r.range(0, size), y = r.range(0, size), s = r.range(1.5, 4.5);
      const light = r.chance(0.35);
      wrapDraw((ox, oy) => { ctx.fillStyle = light ? "rgba(232,226,210,.8)" : "rgba(28,18,10,.7)"; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, s, s * 0.7, r.range(0, 3), 0, TAU); ctx.fill(); });
    }
    for (let i = 0; i < 40; i++) { // bark bits
      const x = r.range(0, size), y = r.range(0, size), w = r.range(6, 14), h = r.range(2, 4), a = r.range(0, 3);
      wrapDraw((ox, oy) => { ctx.fillStyle = "rgba(110,70,40,.75)"; ctx.save(); ctx.translate(x + ox, y + oy); ctx.rotate(a); ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore(); });
    }
  }
  return tex(c);
}
/** leaf-shadow gobo for the sun spot: white light with soft dark leaf silhouettes (not tiled). */
export function leafGobo(o = {}) {
  const G = { ...STYLE_SPEC.sun.gobo, ...o }, r = rng(G.seed), N = 512, c = makeCanvas(N, N), ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, N, N);
  ctx.filter = `blur(${G.blur}px)`;
  const dark = Math.round(255 * G.dark);
  ctx.fillStyle = `rgb(${dark},${dark + 6},${dark})`;
  // a few twigs entering from the upper-left corner with leaves along them
  for (let b = 0; b < 4; b++) {
    let x = r.range(-40, 120), y = r.range(-40, 160), a = r.range(0.2, 0.9);
    ctx.lineWidth = 6; ctx.strokeStyle = ctx.fillStyle;
    for (let k = 0; k < G.leaves / 4; k++) {
      const nx = x + Math.cos(a) * 26, ny = y + Math.sin(a) * 26;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      for (const sd of [-1, 1]) {
        const la = a + sd * r.range(0.6, 1.1), L = r.range(26, 44);
        ctx.save(); ctx.translate(nx, ny); ctx.rotate(la);
        ctx.beginPath(); ctx.ellipse(L / 2, 0, L / 2, L * 0.22, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
      x = nx; y = ny; a += r.range(-0.25, 0.3);
    }
  }
  ctx.filter = "none";
  const t = tex(c, { repeat: false });
  return t;
}
/** garden seen through the window: sky gradient, soft tree masses, a hedge line. Tinted by the scene for day/night. */
export function gardenTexture(seed = 3) {
  const W = 1024, H = 512, r = rng(seed), c = makeCanvas(W, H), ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#a9cbe6"); g.addColorStop(0.5, "#dcebf3"); g.addColorStop(0.78, "#f2efe2"); g.addColorStop(1, "#e9e6d6");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.filter = "blur(14px)";
  for (let i = 0; i < 30; i++) {         // distant, hazy tree masses in the lower third only
    const x = r.range(-60, W + 60), y = r.range(H * 0.66, H * 0.86), s = r.range(40, 110);
    ctx.fillStyle = `hsla(${r.range(85, 120)}, ${r.range(10, 22)}%, ${r.range(62, 74)}%, .75)`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = "hsla(95, 16%, 66%, .8)"; ctx.fillRect(-20, H * 0.84, W + 40, H * 0.2);
  ctx.filter = "none";
  return tex(c, { repeat: false });
}
function corkTexture(seed = 9) {
  const N = 256, r = rng(seed), c = makeCanvas(N, N), ctx = c.getContext("2d");
  ctx.fillStyle = STYLE_SPEC.palette.cork; ctx.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) {
    const x = r.range(0, N), y = r.range(0, N), s = r.range(0.6, 2.4);
    ctx.fillStyle = r.chance(0.5) ? "rgba(90,58,30,.55)" : "rgba(235,205,160,.45)";
    ctx.fillRect(x, y, s, s);
  }
  return tex(c);
}

// ===================================================================== glass material ===================
const GLASS_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vObj; varying vec4 vClip;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vObj = position; vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * wp; vClip = gl_Position;
}`;
const ENV_GLSL = /* glsl */ `
uniform vec3 uPD[4]; uniform vec3 uPU[4]; uniform vec3 uPV[4]; uniform vec3 uPC[4]; uniform vec2 uPS[4];
uniform float uPanelSoft; uniform vec3 uRoom; uniform vec3 uFloorC; uniform float uEnv;
vec3 envAt(vec3 R){
  vec3 c = mix(uFloorC, uRoom, smoothstep(-0.3, 0.3, R.y));
  for (int i = 0; i < 4; i++) {
    float dd = dot(R, uPD[i]);
    if (dd > 0.05) {
      float u = dot(R, uPU[i]) / dd, v = dot(R, uPV[i]) / dd;
      float m = (1.0 - smoothstep(uPS[i].x * (1.0 - uPanelSoft), uPS[i].x, abs(u))) * (1.0 - smoothstep(uPS[i].y * (1.0 - uPanelSoft), uPS[i].y, abs(v)));
      c += uPC[i] * m;
    }
  }
  return c * uEnv;
}`;
const GLASS_FRAG = /* glsl */ `
uniform sampler2D tBg; uniform float uRefractOn;
uniform vec3 uIor; uniform float uRefract; uniform vec3 uTint; uniform vec3 uEdgeTint; uniform float uEdgeDark; uniform float uEdgeK;
uniform float uFresPow; uniform float uFresMin; uniform float uRimLine; uniform float uRimAt; uniform float uRimW; uniform vec3 uRimC;
uniform vec3 uHazeC; uniform float uHaze; uniform float uHazeTop; uniform float uHazeBot;
varying vec3 vW; varying vec3 vN; varying vec3 vObj; varying vec4 vClip;
${GLSL_SAFE}
${ENV_GLSL}
float gh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1,0,0)), f.x), mix(gh(i + vec3(0,1,0)), gh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gh(i + vec3(0,0,1)), gh(i + vec3(1,0,1)), f.x), mix(gh(i + vec3(0,1,1)), gh(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 N = safeNorm(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = safeNorm(vW - cameraPosition);
  float ndv = clamp(-dot(N, V), 0.0, 1.0);
  float fres = mix(uFresMin, 1.0, safePow(1.0 - ndv, uFresPow));
  vec3 refl = envAt(reflect(V, N));
  vec3 trans;
  if (uRefractOn > 0.5) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec3 Nv = safeNorm((viewMatrix * vec4(N, 0.0)).xyz);
    vec3 Vv = safeNorm((viewMatrix * vec4(V, 0.0)).xyz);
    vec3 Tr = refract(Vv, Nv, 1.0 / uIor.r), Tg = refract(Vv, Nv, 1.0 / uIor.g), Tb = refract(Vv, Nv, 1.0 / uIor.b);
    vec2 oR = (Tr.xy - Vv.xy) * uRefract, oG = (Tg.xy - Vv.xy) * uRefract, oB = (Tb.xy - Vv.xy) * uRefract;
    float cl = 0.035;   // cap the offset: grazing heel/shoulder regions otherwise smear the sill into rainbows
    oR *= min(1.0, cl / max(length(oR), 1e-5)); oG *= min(1.0, cl / max(length(oG), 1e-5)); oB *= min(1.0, cl / max(length(oB), 1e-5));
    trans.r = texture2D(tBg, clamp(suv + oR, 0.002, 0.998)).r;
    trans.g = texture2D(tBg, clamp(suv + oG, 0.002, 0.998)).g;
    trans.b = texture2D(tBg, clamp(suv + oB, 0.002, 0.998)).b;
  } else {
    trans = uRoom;
  }
  float graze = safePow(1.0 - ndv, uEdgeK);
  vec3 body = mix(uTint, uEdgeTint, clamp(graze * 1.6, 0.0, 1.0));
  float tf = (1.0 - fres) * (1.0 - uEdgeDark * graze);
  // condensation: a mottled fog on the upper wall
  float hz = uHaze * smoothstep(uHazeBot, uHazeTop, vW.y) * (0.65 + 0.35 * gn(vObj * 26.0)) * (0.55 + 0.45 * ndv);
  vec3 col = mix(trans * body, uHazeC * (0.35 + 0.5 * uEnv), hz) * tf;
  col += refl * fres * (1.0 - 0.4 * hz);
  float rim = exp(-pow((ndv - uRimAt) / uRimW, 2.0));
  col += uRimC * rim * uRimLine * (0.35 + 0.65 * uEnv);
  gl_FragColor = vec4(col, 1.0);
}`;
const BACK_FRAG = /* glsl */ `
uniform float uLevel; uniform float uStreak;
varying vec3 vW; varying vec3 vN; varying vec3 vObj; varying vec4 vClip;
${GLSL_SAFE}
${ENV_GLSL}
void main(){
  vec3 N = -safeNorm(vN);                   // inner surface of the far wall faces the camera
  vec3 V = safeNorm(vW - cameraPosition);
  float ndv = clamp(-dot(N, V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * safePow(1.0 - ndv, 4.0);
  vec3 refl = envAt(reflect(V, N));
  float a = clamp((fres * uLevel + max(max(refl.r, refl.g), refl.b) * uStreak * 0.12) , 0.0, 0.6);
  gl_FragColor = vec4(refl * uStreak * 0.35 + vec3(0.9, 0.95, 0.93) * fres * uLevel, a);
}`;

function panelUniforms(G) {
  const PD = [], PU = [], PV = [], PC = [], PS = [];
  for (let i = 0; i < 4; i++) {
    const p = G.panels[i] ?? { dir: [0, 1, 0], size: [0, 0], intensity: 0, color: "#000000" };
    const d = V3(p.dir).normalize();
    const ref = Math.abs(d.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, ref).normalize();
    const v = new THREE.Vector3().crossVectors(u, d).normalize();
    PD.push(d); PU.push(u); PV.push(v); PC.push(lin(p.color).multiplyScalar(p.intensity)); PS.push(new THREE.Vector2(...p.size));
  }
  return { uPD: { value: PD }, uPU: { value: PU }, uPV: { value: PV }, uPC: { value: PC }, uPS: { value: PS } };
}

// ===================================================================== small geometry helpers ===========
/** taperedTube(n, radial, r0, r1, material) -> Mesh whose centreline is rewritten each frame: userData.set(pts, scale=1). */
export function taperedTube(n, radial, r0, r1, material) {
  const pos = new Float32Array(n * radial * 3), nor = new Float32Array(n * radial * 3), idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);   // outward winding
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false;
  m.userData.set = (pts, k = 1) => {
    let Nv = null;
    for (let i = 0; i < n; i++) {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
      let t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const tl = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / tl, t[1] / tl, t[2] / tl];
      if (!Nv) Nv = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
      const d = Nv[0] * t[0] + Nv[1] * t[1] + Nv[2] * t[2];
      Nv = [Nv[0] - t[0] * d, Nv[1] - t[1] * d, Nv[2] - t[2] * d];
      const nl = Math.hypot(Nv[0], Nv[1], Nv[2]) || 1; Nv = [Nv[0] / nl, Nv[1] / nl, Nv[2] / nl];
      const Bv = [t[1] * Nv[2] - t[2] * Nv[1], t[2] * Nv[0] - t[0] * Nv[2], t[0] * Nv[1] - t[1] * Nv[0]];
      const rad = lerp(r0, r1, i / (n - 1)) * k;
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * TAU, cs = Math.cos(th), sn = Math.sin(th);
        const dx = Nv[0] * cs + Bv[0] * sn, dy = Nv[1] * cs + Bv[1] * sn, dz = Nv[2] * cs + Bv[2] * sn;
        const q = (i * radial + j) * 3;
        pos[q] = pts[i][0] + dx * rad; pos[q + 1] = pts[i][1] + dy * rad; pos[q + 2] = pts[i][2] + dz * rad;
        nor[q] = dx; nor[q + 1] = dy; nor[q + 2] = dz;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  };
  return m;
}
/** resample a polyline to exactly n points by arc length. */
function resample(P, n) {
  const out = [];
  let L = 0; const acc = [0];
  for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], (P[i][2] ?? 0) - (P[i - 1][2] ?? 0)); acc.push(L); }
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (j < P.length - 1 && acc[j] < s) j++;
    const u = clamp((s - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1));
    const a = P[j - 1], b = P[j];
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2] ?? 0, b[2] ?? 0, u)]);
  }
  return out;
}
/** leafGeometry(kind): unit leaf along +X (0..1), face up (+Y), V-folded along the midrib, slightly arched. */
export function leafGeometry(kind = "ovate", seg = 14) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    let w;
    if (kind === "pinna") w = 0.16 * Math.sin(Math.PI * u) ** 0.8 * (1 - 0.3 * u);
    else if (kind === "heart") w = 0.36 * Math.sin(Math.PI * u ** 0.8) * (1 - 0.15 * u);
    else w = u < 0.18 ? 0.025 : 0.33 * Math.sin(Math.PI * ((u - 0.18) / 0.82) ** 0.85);    // ovate with a petiole
    pts.push([u, w]);
  }
  const P = [], I = [], UV = [];
  for (let i = 0; i <= seg; i++) {
    const [u, w] = pts[i];
    for (const s of [-1, 0, 1]) {
      const z = s * w, fold = Math.abs(z) * (kind === "pinna" ? 0.55 : 0.22), arch = -0.12 * u * u;
      P.push(u, fold + arch + (kind === "ovate" && u < 0.18 ? 0 : 0), z); UV.push(u, 0.5 + s * 0.5);
    }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, b = a + 1, c = a + 3, d = c + 1;
    I.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** set an instance from origin p, leaf axis X (dir) and an approximate up (face normal), uniform scale s. */
function setBasis(mesh, i, p, dir, up, s) {
  if (!(s > 1e-5)) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); return; }
  _x.set(dir[0], dir[1], dir[2]).normalize();
  _z.set(up[0], up[1], up[2]).cross(_x).normalize();
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  _y.crossVectors(_x, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _m.scale(_s.set(s, s, s));
  _m.setPosition(p[0], p[1], p[2]);
  mesh.setMatrixAt(i, _m);
}

// ===================================================================== createStyle ======================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 *   ALWAYS finish renderAt with style.render(t): it runs the refraction pre-pass (outer glass hidden) then stage.render(t).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, G = spec.glass, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const { renderer, scene } = stage;

  // ---- refraction source: same-frame pre-render without the outer glass ----
  const bgRT = new THREE.WebGLRenderTarget(Math.round(stage.width * G.prepass), Math.round(stage.height * G.prepass), { type: THREE.HalfFloatType, samples: G.samples ?? 0 });
  const envU = {
    uPanelSoft: { value: G.panelSoft }, uRoom: { value: lin(G.room) }, uFloorC: { value: lin(G.floor) }, uEnv: { value: G.env },
    ...panelUniforms(G),
  };
  const glassU = {
    ...envU,
    tBg: { value: bgRT.texture }, uRefractOn: { value: 1 },
    uIor: { value: new THREE.Vector3(G.ior - G.dispersion / 2, G.ior, G.ior + G.dispersion / 2) }, uRefract: { value: G.refract },
    uTint: { value: lin(G.tint) }, uEdgeTint: { value: lin(G.edgeTint) }, uEdgeDark: { value: G.edgeDark }, uEdgeK: { value: G.edgeK },
    uFresPow: { value: G.fresnelPow }, uFresMin: { value: G.fresnelMin },
    uRimLine: { value: G.rimLine }, uRimAt: { value: G.rimAt }, uRimW: { value: G.rimWidth }, uRimC: { value: lin(G.rimColor) },
    uHazeC: { value: lin(G.haze) }, uHaze: { value: 0 }, uHazeTop: { value: G.hazeTop }, uHazeBot: { value: G.hazeBottom },
  };
  const glassMat = new THREE.ShaderMaterial({ uniforms: glassU, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, side: THREE.FrontSide });
  glassMat.name = "glass:jar";
  const backMat = new THREE.ShaderMaterial({
    uniforms: { ...envU, uLevel: { value: G.back.level }, uStreak: { value: G.back.streak } },
    vertexShader: GLASS_VERT, fragmentShader: BACK_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false,
  });
  backMat.name = "glass:far-wall";
  const glassMeshes = [];

  // =================================================================== props ============================
  /**
   * jar({ kind, ...profile dims }) -> Group: outer glass (opaque refraction shader), far inner wall (pre-pass),
   *   rolled lip, (cloche: knob + wooden plate). userData: { profile, outer, back, lip }.
   */
  function jar(o = {}) {
    const J = { ...spec.jar, ...o };
    const prof = growth.jarProfile(J.kind, J);
    const grp = new THREE.Group(); grp.name = `jar:${J.kind}`;
    const ys = prof.samples;
    const outerPts = [], innerPts = [];
    if (prof.kind !== "cloche") outerPts.push(new THREE.Vector2(0.0001, 0));
    for (const y of ys) outerPts.push(new THREE.Vector2(Math.max(prof.rOut(y), prof.kind === "cloche" && y >= prof.top - 1e-6 ? 0.0001 : 0.0001), y));
    if (prof.kind === "cloche") outerPts.push(new THREE.Vector2(0.0001, prof.top));
    const yIn0 = prof.kind === "cloche" ? 0 : prof.floor;
    if (prof.kind !== "cloche") innerPts.push(new THREE.Vector2(0.0001, yIn0));
    for (const y of ys) if (y >= yIn0) { const r = prof.rIn(y); if (r > 0.002) innerPts.push(new THREE.Vector2(r, y)); }
    const outer = new THREE.Mesh(new THREE.LatheGeometry(outerPts, J.radial ?? 128), glassMat);
    outer.name = "glass:outer"; outer.castShadow = false; outer.receiveShadow = false;
    const back = new THREE.Mesh(new THREE.LatheGeometry(innerPts, J.radial ?? 128), backMat);
    back.name = "glass:back"; back.renderOrder = 4; back.castShadow = false;
    grp.add(outer, back);
    glassMeshes.push(outer);
    let lip = null;
    if (!prof.closedTop) {
      lip = new THREE.Mesh(new THREE.TorusGeometry(prof.rOut(prof.top) - prof.glass * 0.35, G.lipRadius, 16, J.radial ?? 128), glassMat);
      lip.rotation.x = Math.PI / 2; lip.position.y = prof.top; lip.name = "glass:lip";
      grp.add(lip); glassMeshes.push(lip);
    } else {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 16), glassMat);
      knob.position.y = prof.top + 0.08; grp.add(knob); glassMeshes.push(knob);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(prof.R + 0.14, prof.R + 0.18, prof.floor, 96), materials.wood);
      plate.position.y = prof.floor / 2; plate.castShadow = plate.receiveShadow = true; grp.add(plate);
    }
    grp.userData = { profile: prof, outer, back, lip };
    return grp;
  }

  /** cork({ profile, h }) -> Mesh (origin = seated position, top of the mouth); userData.update(t, plan) from growth.corkAt. */
  function cork(o = {}) {
    const prof = o.profile, h = o.h ?? 0.4, rTop = prof.rOut(prof.top) + 0.03, rBot = prof.mouth.r - 0.012;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 64, 1), new THREE.MeshStandardMaterial({ map: corkTexture(o.seed ?? 9), roughness: 0.92, color: "#ffffff" }));
    m.geometry.translate(0, h / 2 - h * 0.55, 0);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m); g.name = "cork";
    g.position.y = prof.top;
    g.userData.update = (t, plan) => {
      const c = growth.corkAt(plan, t);
      g.visible = c.on;
      g.position.y = prof.top + c.dy;
      g.rotation.z = c.tilt;
    };
    return g;
  }

  /**
   * strata(pours, { profile, seed }) -> Group of layer meshes (side wall band + top cap per pour) and grain streams.
   *   userData.update(t, { wet }) — levels, mounds and falling grains from the pour plan (pure f(t)).
   */
  function strata(pours, o = {}) {
    const prof = o.profile, L = spec.layers, RAD = 112, NY = 7, NR = 12;
    const _w = lin(P.soilWet), _d = lin(P.soil), WET = new THREE.Color(Math.min(1, _w.r / _d.r), Math.min(1, _w.g / _d.g), Math.min(1, _w.b / _d.b)); // map × WET = wet soil
    const grp = new THREE.Group(); grp.name = "strata";
    const layers = pours.map((p, k) => {
      const LS = L[p.id] ?? L.soil;
      const map = strataTexture(LS.tex ?? p.id, 11 + k * 7);
      const mat = new THREE.MeshStandardMaterial({ map, roughness: p.id === "charcoal" ? 0.7 : 0.95, color: "#ffffff" });
      mat.name = `strata:${p.id}`;
      const wseed = 5 + k * 13;
      const wave = (th) => (Math.sin(th * 3 + wseed) * 0.5 + Math.sin(th * 7 + wseed * 2.3) * 0.3 + Math.sin(th * 13 + wseed * 0.7) * 0.2) * L.wave;
      // side band
      const sideG = new THREE.BufferGeometry();
      const sp = new Float32Array(RAD * NY * 3), sn = new Float32Array(RAD * NY * 3), su = new Float32Array(RAD * NY * 2), si = [];
      for (let j = 0; j < NY - 1; j++) for (let i = 0; i < RAD; i++) {
        const a = j * RAD + i, b = j * RAD + ((i + 1) % RAD), c = a + RAD, d = b + RAD;
        si.push(a, b, c, b, d, c);
      }
      sideG.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sideG.setAttribute("normal", new THREE.BufferAttribute(sn, 3)); sideG.setAttribute("uv", new THREE.BufferAttribute(su, 2));
      sideG.setIndex(si);
      const side = new THREE.Mesh(sideG, mat); side.castShadow = side.receiveShadow = true; side.frustumCulled = false;
      // top cap
      const capG = new THREE.BufferGeometry();
      const cp = new Float32Array((NR * RAD + 1) * 3), cu = new Float32Array((NR * RAD + 1) * 2), ci = [];
      for (let i = 0; i < RAD; i++) ci.push(0, 1 + i, 1 + ((i + 1) % RAD));
      for (let k2 = 0; k2 < NR - 1; k2++) for (let i = 0; i < RAD; i++) {
        const a = 1 + k2 * RAD + i, b = 1 + k2 * RAD + ((i + 1) % RAD), c = a + RAD, d = b + RAD;
        ci.push(a, c, b, b, c, d);   // facing up
      }
      capG.setAttribute("position", new THREE.BufferAttribute(cp, 3)); capG.setAttribute("uv", new THREE.BufferAttribute(cu, 2));
      capG.setIndex(ci);
      const cap = new THREE.Mesh(capG, mat); cap.castShadow = cap.receiveShadow = true; cap.frustumCulled = false;
      const inset = 0.006 + 0.004 * k; // lower layers sit a hair further out: their wavy tops show in front of the next band
      const texK = L.texPerMetre;
      // grains
      const ggeo = p.id === "pebbles" ? new THREE.IcosahedronGeometry(1, 1) : p.id === "charcoal" ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
      const gmat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: p.id !== "pebbles" });
      const grains = new THREE.InstancedMesh(ggeo, gmat, p.grains.length);
      grains.castShadow = true; grains.frustumCulled = false;
      const gr = rng(77 + k);
      const gcol = new THREE.Color();
      p.grains.forEach((_, i) => {
        if (p.id === "pebbles") gcol.set(gr.pick(P.pebble));
        else if (p.id === "charcoal") gcol.setHSL(0.08, 0.05, gr.range(0.05, 0.12));
        else gcol.set(P.soil).offsetHSL(0, 0, gr.range(-0.05, 0.06));
        grains.setColorAt(i, gcol);
      });
      grp.add(side, cap, grains);
      return { p, mat, side, cap, sp, sn, su, cp, cu, capG, sideG, wave, inset, texK, grains };
    });

    grp.userData.update = (t, { wet = 0 } = {}) => {
      for (const Ly of layers) {
        const { p } = Ly;
        const started = t >= p.t0;
        Ly.side.visible = Ly.cap.visible = started;
        if (started) {
          const lvl = growth.pourLevel(p, t);
          const amp = smoothstep(p.t0, p.t0 + 0.4, t);
          // side band rings
          for (let j = 0; j < NY; j++) for (let i = 0; i < RAD; i++) {
            const th = (i / RAD) * TAU;
            const top = Math.max(p.yB + 0.002, lvl + Ly.wave(th) * amp);
            const y = lerp(p.yB, top, j / (NY - 1));
            const r = Math.max(0.01, prof.rIn(Math.max(y, prof.floor + 0.001)) - Ly.inset);
            const q = (j * RAD + i) * 3, s = Math.sin(th), c = Math.cos(th);
            Ly.sp[q] = s * r; Ly.sp[q + 1] = y; Ly.sp[q + 2] = c * r;
            Ly.sn[q] = s; Ly.sn[q + 1] = 0; Ly.sn[q + 2] = c;
            const uq = (j * RAD + i) * 2;
            Ly.su[uq] = (i / RAD) * Math.round(TAU * r * Ly.texK * 2); Ly.su[uq + 1] = y * Ly.texK * 2;
          }
          Ly.sideG.attributes.position.needsUpdate = true; Ly.sideG.attributes.normal.needsUpdate = true; Ly.sideG.attributes.uv.needsUpdate = true;
          Ly.sideG.computeBoundingSphere();
          // cap
          const Rt = Math.max(0.01, prof.rIn(Math.max(lvl, prof.floor + 0.001)) - Ly.inset);
          const yc = growth.surfaceY(p, t, 0, 0, prof);
          Ly.cp[0] = 0; Ly.cp[1] = yc; Ly.cp[2] = 0; Ly.cu[0] = 0; Ly.cu[1] = 0;
          for (let k2 = 0; k2 < NR; k2++) for (let i = 0; i < RAD; i++) {
            const th = (i / RAD) * TAU, rr = Rt * ((k2 + 1) / NR), x = Math.sin(th) * rr, z = Math.cos(th) * rr;
            const e = ((k2 + 1) / NR) ** 2;
            const y = Math.max(p.yB + 0.002, growth.surfaceY(p, t, x, z, prof) + Ly.wave(th) * amp * e);
            const q = (1 + k2 * RAD + i) * 3;
            Ly.cp[q] = x; Ly.cp[q + 1] = y; Ly.cp[q + 2] = z;
            Ly.cu[(1 + k2 * RAD + i) * 2] = x * Ly.texK * 2; Ly.cu[(1 + k2 * RAD + i) * 2 + 1] = z * Ly.texK * 2;
          }
          Ly.capG.attributes.position.needsUpdate = true; Ly.capG.attributes.uv.needsUpdate = true;
          Ly.capG.computeVertexNormals(); Ly.capG.computeBoundingSphere();
        }
        if (p.id === "soil") Ly.mat.color.setRGB(1, 1, 1).lerp(WET, wet);
        // grains in the air
        p.grains.forEach((g, i) => {
          const a = growth.grainAt(p, g, t);
          if (!a) { _m.makeScale(0, 0, 0); Ly.grains.setMatrixAt(i, _m); return; }
          _q.setFromEuler(new THREE.Euler(a.rot, a.rot * 0.7, 0));
          _m.compose(_p.set(a.x, a.y, a.z), _q, _s.set(g.s, g.s * 0.8, g.s));
          Ly.grains.setMatrixAt(i, _m);
        });
        Ly.grains.instanceMatrix.needsUpdate = true;
      }
    };
    grp.userData.layers = layers;
    return grp;
  }

  /** rock({ base, size, seed }) -> Mesh (flat-shaded, partly buried); userData.update(t, { t: drop time }). */
  function rock(o = {}) {
    const r = rng(o.seed ?? 12), s = o.size ?? 0.32;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pa, i);
      const k = 1 + 0.18 * Math.sin(v.x * 3.1 + 1.3) * Math.cos(v.z * 2.7) + 0.08 * Math.sin(v.y * 7.3 + v.x * 3);
      v.multiplyScalar(k); v.y *= 0.62; pa.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materials.rock);
    m.scale.setScalar(s); m.rotation.y = r.range(0, TAU);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m); g.name = "rock";
    const base = o.base ?? [0, 0, 0];
    g.position.set(base[0], base[1] - s * 0.12, base[2]);
    g.userData.update = (t, at) => {
      const u = clamp((t - at) / 0.45);
      g.visible = t >= at;
      const drop = (1 - toEase("outBounce")(u)) * 1.0;
      g.position.y = base[1] - s * 0.12 + drop;
    };
    return g;
  }

  /** moss(list, { soil }) -> InstancedMesh of cushions; userData.update(t, surfaceY(x,z)). */
  function moss(list, o = {}) {
    const r = rng(o.seed ?? 41);
    const geo = new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, Math.PI / 2);
    const pa = geo.attributes.position, cols = [];
    const C = spec.plants.mossColors.map(lin);
    for (let i = 0; i < pa.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pa, i);
      const k = 1 + 0.12 * Math.sin(v.x * 9 + 1) * Math.sin(v.z * 8 + 2) + 0.06 * Math.sin(v.y * 15);
      pa.setXYZ(i, v.x * k, v.y * k, v.z * k);
      const c = C[(i * 7) % C.length].clone().lerp(C[(i * 3 + 1) % C.length], 0.5).multiplyScalar(0.75 + 0.45 * v.y);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, materials.moss, list.length);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = "moss";
    const tint = new THREE.Color();
    list.forEach((m, i) => { tint.setHSL(0.2 + 0.08 * m.tone, 0.3 + 0.18 * r.next(), 0.5 + 0.2 * r.next()); mesh.setColorAt(i, tint.multiplyScalar(1.15)); });
    mesh.userData.update = (t, surf) => {
      list.forEach((m, i) => {
        const k = growth.mossScale(m, t);
        if (k <= 0) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); return; }
        _q.setFromAxisAngle(_y.set(0, 1, 0), m.spin);
        _m.compose(_p.set(m.x, surf(m.x, m.z) - 0.01, m.z), _q, _s.set(m.s * k, m.s * m.h * k, m.s * k * 0.9));
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    return mesh;
  }

  /** fern(fronds) -> Group: one tapered stem per frond + all leaflets in one InstancedMesh; userData.update(t). */
  function fern(fronds, o = {}) {
    const grp = new THREE.Group(); grp.name = "fern";
    const N = 36;
    const stemMat = new THREE.MeshStandardMaterial({ color: lin(spec.plants.fernColors[0]).multiplyScalar(0.8), roughness: 0.6 });
    const stems = fronds.map(() => { const m = taperedTube(N + 1, 6, spec.plants.frondRadius, spec.plants.frondRadius * 0.35, stemMat); grp.add(m); return m; });
    const per = Math.max(...fronds.map((f) => f.leaflets)) * 2;
    const leafMat = materials.leaf.clone();
    const leaflets = new THREE.InstancedMesh(leafGeometry("pinna"), leafMat, per * fronds.length);
    leaflets.castShadow = true; leaflets.receiveShadow = true; leaflets.frustumCulled = false;
    const r = rng(o.seed ?? 51), c = new THREE.Color();
    for (let i = 0; i < per * fronds.length; i++) { c.set(r.pick(spec.plants.fernColors)).offsetHSL(0, 0, r.range(-0.04, 0.05)); leaflets.setColorAt(i, c); }
    grp.add(leaflets);
    const pts3 = [];
    grp.userData.update = (t) => {
      fronds.forEach((f, fi) => {
        const vis = t >= f.t0;
        stems[fi].visible = vis;
        const O = [Math.sin(f.az), 0, Math.cos(f.az)], Np = [Math.cos(f.az), 0, -Math.sin(f.az)];
        const map = (x, y) => [f.base[0] + O[0] * x, f.base[1] + y, f.base[2] + O[2] * x];
        let sh = null;
        if (vis) {
          sh = growth.frondShape(f, t, N);
          pts3.length = 0;
          for (const [x, y] of sh.pts) pts3.push(map(x, y));
          stems[fi].userData.set(pts3, 0.6 + 0.4 * sh.grow);
        }
        for (let j = 0; j < per; j++) {
          const idx = fi * per + j, lf = sh?.leaflets[j >> 1];
          if (!lf) { _m.makeScale(0, 0, 0); leaflets.setMatrixAt(idx, _m); continue; }
          const sd = j & 1 ? 1 : -1;
          const T = [O[0] * lf.t[0], lf.t[1], O[2] * lf.t[0]];
          const Bn = [T[1] * Np[2] - T[2] * Np[1], T[2] * Np[0] - T[0] * Np[2], T[0] * Np[1] - T[1] * Np[0]]; // frond "up" side
          const sw = lerp(1.35, 0.55, lf.open);           // closed leaflets fold along the stem
          const droop = -0.25 * lf.open;
          const dir = [Np[0] * sd * Math.cos(sw) + T[0] * Math.sin(sw) + Bn[0] * droop, Np[1] * sd * Math.cos(sw) + T[1] * Math.sin(sw) + Bn[1] * droop, Np[2] * sd * Math.cos(sw) + T[2] * Math.sin(sw) + Bn[2] * droop];
          const p = map(lf.x, lf.y);
          setBasis(leaflets, idx, p, dir, Bn[1] < 0 ? [-Bn[0], -Bn[1], -Bn[2]] : Bn, lf.len);
        }
      });
      leaflets.instanceMatrix.needsUpdate = true;
    };
    return grp;
  }

  /** leafyPlant(stem) -> Group: tapered stem + ovate leaves on petioles that pop in at each node; userData.update(t). */
  function leafyPlant(st, o = {}) {
    const grp = new THREE.Group(); grp.name = `leafy:${st.id}`;
    const tube = taperedTube(21, 8, st.r0, st.r0 * 0.45, materials.stem);
    const leaves = new THREE.InstancedMesh(leafGeometry("ovate"), materials.leaf.clone(), st.nodes.length);
    leaves.castShadow = true; leaves.receiveShadow = true; leaves.frustumCulled = false;
    const r = rng(o.seed ?? st.nodes.length * 13 + 3), c = new THREE.Color();
    st.nodes.forEach((_, i) => { c.set(r.pick(spec.plants.leafColors)).offsetHSL(0, 0, r.range(-0.04, 0.06)); leaves.setColorAt(i, c); });
    grp.add(tube, leaves);
    grp.userData.update = (t) => {
      const vis = t >= st.t0;
      tube.visible = vis;
      if (!vis) { st.nodes.forEach((_, i) => { _m.makeScale(0, 0, 0); leaves.setMatrixAt(i, _m); }); leaves.instanceMatrix.needsUpdate = true; return; }
      const sh = growth.stemShape(st, t, 20);
      tube.userData.set(sh.pts);
      sh.leaves.forEach((lf, i) => {
        const a = lf.node.az, ti = lf.node.tilt;
        const dir = [Math.sin(a) * Math.cos(ti), Math.sin(ti), Math.cos(a) * Math.cos(ti)];
        setBasis(leaves, i, lf.p, dir, [0, 1, 0], lf.node.size * lf.scale);
      });
      leaves.instanceMatrix.needsUpdate = true;
    };
    return grp;
  }

  /** vine(v) -> Group: tapered stem growing along a path + heart leaves popping as the head passes; userData.update(t). */
  function vine(v, o = {}) {
    const grp = new THREE.Group(); grp.name = `vine:${v.id}`;
    const tube = taperedTube(41, 6, v.r0, v.r0 * 0.5, new THREE.MeshStandardMaterial({ color: spec.palette.vine, roughness: 0.6 }));
    const leaves = new THREE.InstancedMesh(leafGeometry("heart"), materials.leaf.clone(), v.leaves.length);
    leaves.castShadow = true; leaves.receiveShadow = true; leaves.frustumCulled = false;
    const r = rng(o.seed ?? 61), c = new THREE.Color();
    v.leaves.forEach((_, i) => { c.set(r.pick(spec.plants.leafColors)).offsetHSL(0.01, 0, r.range(-0.02, 0.08)); leaves.setColorAt(i, c); });
    grp.add(tube, leaves);
    grp.userData.update = (t) => {
      tube.visible = t >= v.t0;
      const sh = growth.vineShape(v, t, 40);
      if (tube.visible) tube.userData.set(sh.pts);
      sh.leaves.forEach((lf, i) => {
        const d = lf.d, sd = lf.leaf.side;
        const side = [d[2] * sd, 0, -d[0] * sd];
        const dir = [side[0] + d[0] * 0.35, 0.45, side[2] + d[2] * 0.35];
        setBasis(leaves, i, lf.p, dir, [0, 1, 0], lf.leaf.size * lf.scale);
      });
      leaves.instanceMatrix.needsUpdate = true;
    };
    return grp;
  }

  /**
   * droplets(drops, { profile }) -> InstancedMesh of water beads on the INNER glass (pre-pass, seen through the front);
   *   userData.update(t). Beads: dark Fresnel rim + bright specular point, flattened against the wall, stretched when running.
   */
  function droplets(drops, o = {}) {
    const prof = o.profile, D = spec.droplets;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: D.level }, uSpec: { value: D.spec }, uRim: { value: D.rim } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `uniform float uLevel; uniform float uSpec; uniform float uRim; varying vec3 vN; varying vec3 vV;
        ${GLSL_SAFE}
        void main(){ vec3 N = safeNorm(vN); vec3 V = safeNorm(vV);
          float ndv = clamp(-dot(N, V), 0.0, 1.0);
          float rim = safePow(1.0 - ndv, 2.2);
          vec3 L = safeNorm(vec3(-0.5, 0.75, 0.45));
          float sp = safePow(max(dot(reflect(V, N), L), 0.0), 60.0) * uSpec;
          float sp2 = safePow(max(dot(reflect(V, N), safeNorm(vec3(0.3, 0.4, -1.0))), 0.0), 8.0) * 0.35;
          vec3 col = vec3(0.06, 0.08, 0.07) * rim * uRim + vec3(1.0) * (sp + sp2) + vec3(0.85, 0.92, 0.9) * 0.12;
          float a = clamp(0.1 + rim * 0.75 * uRim + sp, 0.0, 0.95) * uLevel;
          gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false,
    });
    mat.name = "droplet";
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, drops.length);
    mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = "droplets";
    mesh.userData.noDepth = true;
    mesh.userData.update = (t) => {
      drops.forEach((d, i) => {
        const s = growth.dropletAt(d, t);
        if (!s.on) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); return; }
        const sn = Math.sin(s.theta), cs = Math.cos(s.theta);
        const rIn = prof.rIn(s.y) || prof.rIn(prof.floor + 0.2);
        const n = [-sn, 0, -cs];                                   // inward normal (local Z)
        const yc = s.y + s.r * (s.stretch - 1) * 0.5;
        _x.set(cs, 0, -sn); _y.set(0, 1, 0); _z.set(n[0], n[1], n[2]);
        _m.makeBasis(_x, _y, _z);
        _m.scale(_s.set(s.r, s.r * s.stretch, s.r * D.flatten));
        _m.setPosition(sn * (rIn - 0.004), yc, cs * (rIn - 0.004));
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    return mesh;
  }

  // ---- windowsill set + daylight -------------------------------------------------------------------
  const sun = lights.sun, moonL = lights.moon, fillL = lights.fill, room = lights.room;
  const gobo = leafGobo();
  if (sun) { sun.map = gobo; sun.castShadow = true; }
  let backdropMat = null;
  /**
   * windowsill(o) -> Group: painted sill, plaster wall with a deep window reveal, white frame + glazing bars, and the
   *   garden backdrop outside (tinted by setDaylight). Origin: sill top centre under the jar.
   */
  function windowsill(o = {}) {
    const S = { ...spec.set, ...o }, grp = new THREE.Group(); grp.name = "windowsill";
    const wz = S.windowZ, [x0, x1, y0, y1] = S.opening, th = 0.42;
    const sill = new THREE.Mesh(new RoundedBoxGeometry(S.sillW, 0.14, S.sillDepth, 3, 0.04), materials.sill);
    sill.position.set((x0 + x1) / 2, -0.07, wz - th + S.sillDepth / 2); sill.receiveShadow = true; sill.castShadow = true;
    grp.add(sill);
    const wall = (w, h, cx, cy) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, th), materials.plaster); m.position.set(cx, cy, wz - th / 2); m.receiveShadow = m.castShadow = true; grp.add(m); return m; };
    wall(12, 14, x0 - 6, 5);              // left
    wall(12, 14, x1 + 6, 5);              // right
    wall(x1 - x0, 6, (x0 + x1) / 2, y1 + 3); // over
    wall(x1 - x0 + 24, 3, (x0 + x1) / 2, -1.64); // under the sill (front face hidden by the sill nose)
    const bar = (w, h, cx, cy) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), materials.frame); m.position.set(cx, cy, wz - th + 0.06); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
    const fw = 0.13;
    bar(x1 - x0, fw, (x0 + x1) / 2, y0 + fw / 2);
    bar(x1 - x0, fw, (x0 + x1) / 2, y1 - fw / 2);
    bar(fw, y1 - y0, x0 + fw / 2, (y0 + y1) / 2);
    bar(fw, y1 - y0, x1 - fw / 2, (y0 + y1) / 2);
    bar(0.075, y1 - y0, S.mullionX, (y0 + y1) / 2);
    bar(x1 - x0, 0.075, (x0 + x1) / 2, S.transomY);
    backdropMat = new THREE.MeshBasicMaterial({ map: gardenTexture(S.seed ?? 3), color: lin(spec.sky.day).multiplyScalar(spec.sky.level) });
    backdropMat.name = "garden";
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(34, 17), backdropMat);
    bd.position.set((x0 + x1) / 2, 3.2, wz - 7.5); grp.add(bd);
    return grp;
  }
  const sunBase = sun ? sun.position.clone() : null;
  const sunTarget = sun ? sun.target.position.clone() : null;
  /** setDaylight({ sun, night, az, warm }) (from growth.dayCycle): sun level/colour/azimuth, moon, room, sky, glass env. */
  function setDaylight(d) {
    const day = clamp(d.sun);
    if (sun) {
      sun.intensity = spec.sun.day * day;
      sun.color.copy(lin(spec.sun.color)).lerp(lin(spec.sun.dusk), d.warm * 0.85 * (1 - day * 0.4));
      const p = sunBase.clone().sub(sunTarget).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.az);
      sun.position.copy(sunTarget).add(p);
    }
    if (moonL) moonL.intensity = 260 * d.night;
    if (fillL) fillL.intensity = 70 * (0.32 + 0.68 * day);
    if (room) {
      room.intensity = 1.25 * (0.38 + 0.62 * day);
      room.color.copy(lin("#f3efe6")).lerp(lin("#9fb0d6"), d.night * 0.85);
    }
    if (backdropMat) {
      const c = lin(spec.sky.day).multiplyScalar(spec.sky.level).lerp(lin(spec.sky.dusk).multiplyScalar(spec.sky.level * 0.85), d.warm * (1 - day * 0.6));
      backdropMat.color.copy(c.lerp(lin(spec.sky.night).multiplyScalar(spec.sky.nightLevel), d.night));
    }
    envU.uEnv.value = G.env * (0.3 + 0.7 * day);
  }
  /** setHaze(h) — condensation fog on the upper glass (0..1, × spec.glass.hazeAmount). */
  function setHaze(h) { glassU.uHaze.value = clamp(h) * G.hazeAmount; }

  // ---- labels: hand-lettered paper tags --------------------------------------------------------------
  const TG = spec.tag;
  /** draw a tag (paper, hole + ring, hand-lettered text) into a canvas; returns { canvas, w, h, hole:[x,y] } in px. */
  function drawTag(text, { px = 2, width = 470, cap = 54, shadow = true, seed = 3 } = {}) {
    const meas = makeCanvas(8, 8).getContext("2d");
    const lines = String(text).split("\n");
    meas.font = `${TG.weight} ${cap * px * 1.25}px ${TG.font}`;
    const tw = Math.max(...lines.map((l) => meas.measureText(l).width)) / px;
    const w = Math.max(width, tw + 170), h = 92 + lines.length * cap * 1.35;
    const pad = shadow ? 26 : 4;
    const W = Math.ceil((w + pad * 2) * px), H = Math.ceil((h + pad * 2) * px);
    const c = makeCanvas(W, H), ctx = c.getContext("2d");
    ctx.setTransform(px, 0, 0, px, 0, 0);
    const r = rng(seed);
    const notch = 34, x0 = pad, y0 = pad;
    // tag outline: rectangle with clipped LEFT corners (the hole end), slightly irregular
    const outline = () => { ctx.beginPath(); ctx.moveTo(x0 + notch, y0); ctx.lineTo(x0 + w, y0 + r.range(-1, 1)); ctx.lineTo(x0 + w + r.range(-1, 1), y0 + h); ctx.lineTo(x0 + notch, y0 + h); ctx.lineTo(x0, y0 + h - notch); ctx.lineTo(x0, y0 + notch); ctx.closePath(); };
    if (shadow) { ctx.save(); ctx.filter = "blur(9px)"; ctx.translate(6, 10); ctx.fillStyle = "rgba(40,28,14,.32)"; outline(); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = TG.paper; outline(); ctx.fill();
    // paper tooth + edge darkening
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
    grad.addColorStop(0, "rgba(255,250,235,.35)"); grad.addColorStop(1, "rgba(160,130,80,.18)");
    ctx.fillStyle = grad; outline(); ctx.fill();
    for (let i = 0; i < 260; i++) { ctx.fillStyle = r.chance(0.5) ? "rgba(120,95,55,.10)" : "rgba(255,255,255,.18)"; ctx.fillRect(x0 + r.range(4, w - 4), y0 + r.range(4, h - 4), r.range(1, 3), r.range(1, 2)); }
    ctx.strokeStyle = TG.edge; ctx.lineWidth = 2.2; outline(); ctx.stroke();
    // hole + reinforcement ring (left end)
    const hx = x0 + 34, hy = y0 + h / 2;
    ctx.fillStyle = TG.ring; ctx.beginPath(); ctx.arc(hx, hy, 17, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(120,95,55,.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(hx, hy, 8, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // hand lettering
    ctx.fillStyle = TG.ink; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `${TG.weight} ${cap * 1.25}px ${TG.font}`;
    lines.forEach((l, i) => {
      const ty = y0 + h / 2 + (i - (lines.length - 1) / 2) * cap * 1.35;
      ctx.save(); ctx.translate(x0 + 78, ty); ctx.rotate(r.range(-0.012, 0.012)); ctx.fillText(l, 0, 0); ctx.restore();
    });
    return { canvas: c, w: w + pad * 2, h: h + pad * 2, hole: [hx, hy], px };
  }
  const _tagCanvases = [];
  if (typeof document !== "undefined" && document.fonts?.ready) {
    document.fonts.ready.then(() => { for (const f of _tagCanvases) f(); });
  }

  /**
   * overlayTag(text, { x, y, width, cap, string, angle }) -> overlay Group (exact colours, drawn after post):
   *   a hand-lettered paper tag hanging on a string from (x, y) px (the tie point, usually above the frame top),
   *   swinging to rest. userData.update(t, { on, off }) — drops in on its string, damped swing, lifts out.
   */
  function overlayTag(text, o = {}) {
    const ov = getOverlay(stage);
    const U = 2 / stage.height;                                 // overlay units per px
    const opt = { width: o.width ?? 470, cap: o.cap ?? 54, seed: o.seed ?? 3 };
    const d0 = drawTag(text, opt);
    const T = new THREE.CanvasTexture(d0.canvas); T.colorSpace = THREE.SRGBColorSpace; T.minFilter = THREE.LinearFilter; T.generateMipmaps = false;
    _tagCanvases.push(() => { const d1 = drawTag(text, opt); d0.canvas.getContext("2d").reset?.(); d0.canvas.getContext("2d").drawImage(d1.canvas, 0, 0); T.needsUpdate = true; });
    const geo = new THREE.PlaneGeometry(d0.w * U, d0.h * U);
    // pivot at the hole: shift so the hole sits at the origin, tag hangs to the right/below along the string
    geo.translate(d0.w * U / 2 - d0.hole[0] * U, -d0.h * U / 2 + d0.hole[1] * U, 0);
    const card = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    card.renderOrder = 21;
    const strLen = (o.string ?? 160) * U;
    const strMat = new THREE.MeshBasicMaterial({ color: TG.string, transparent: true, depthTest: false, toneMapped: false });
    const str = new THREE.Mesh(new THREE.PlaneGeometry(3 * U, 1).translate(0, -0.5, 0), strMat); str.renderOrder = 20;
    const knot = new THREE.Mesh(new THREE.CircleGeometry(5.5 * U, 16), strMat); knot.renderOrder = 22;
    const pivot = new THREE.Group();
    pivot.add(str, card, knot);
    pivot.visible = false;
    ov.add(pivot);
    const ax = ((o.x ?? 330) / stage.width * 2 - 1) * ov.aspect, ay = 1 - (o.y ?? -20) / stage.height * 2;
    const a0 = o.stringAngle ?? 0.32;                            // string runs down-right from the tie point to the hole
    const tilt = o.angle ?? -0.05;                               // tag nearly level: the lettering stays readable
    const W = TG.swing;
    pivot.userData.update = (t, { on, off = Infinity } = {}) => {
      const vis = t >= on && t < off + 0.5;
      pivot.visible = vis;
      if (!vis) return;
      const din = toEase("outCubic")(clamp((t - on) / W.drop));
      const dout = Number.isFinite(off) ? toEase("inCubic")(clamp((t - off) / 0.45)) : 0;
      const tau = Math.max(0, t - on - W.drop * 0.7);
      const swing = t >= on + W.drop * 0.7 ? W.amp * Math.exp(-W.zeta * tau) * Math.sin(W.omega * tau) : 0;
      const L = strLen;
      pivot.position.set(ax, ay + (1 - din) * (L + d0.h * U) * 1.1 + dout * (L + d0.h * U * 1.3), 0);
      pivot.rotation.z = swing;
      str.rotation.z = a0; str.scale.set(1, L, 1);
      const hx = Math.sin(a0) * L, hy = -Math.cos(a0) * L;
      card.position.set(hx, hy, 0);
      card.rotation.z = tilt - swing * 0.5;
      knot.position.set(hx, hy, 0.01);
    };
    pivot.userData.size = { w: d0.w, h: d0.h };
    return pivot;
  }

  /**
   * tag(text, { tie:[x,y,z], hang, width, cap, seed }) -> Group (3D): a hand-lettered paper tag on a string tied at
   *   `tie`, hanging `hang` m below; faces +Z. userData.update(t, { on }) — damped pendulum after it is tied on.
   */
  function tag(text, o = {}) {
    const d = drawTag(text, { width: o.width ?? 330, cap: o.cap ?? 52, shadow: false, seed: o.seed ?? 5, px: 2 });
    const T = new THREE.CanvasTexture(d.canvas); T.colorSpace = THREE.SRGBColorSpace; T.anisotropy = 8;
    _tagCanvases.push(() => { const d1 = drawTag(text, { width: o.width ?? 330, cap: o.cap ?? 52, shadow: false, seed: o.seed ?? 5, px: 2 }); d.canvas.getContext("2d").reset?.(); d.canvas.getContext("2d").drawImage(d1.canvas, 0, 0); T.needsUpdate = true; });
    const S = (o.height ?? 0.3) / d.h;                       // metres per px
    const geo = new THREE.PlaneGeometry(d.w * S, d.h * S);
    geo.translate(d.w * S / 2 - d.hole[0] * S, -d.h * S / 2 + d.hole[1] * S, 0);
    const card = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T, transparent: true, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
    card.castShadow = false; card.receiveShadow = true;
    const hang = o.hang ?? 0.22;
    const a0 = o.stringAngle ?? 0.5, hx = Math.sin(a0) * hang, hy = -Math.cos(a0) * hang;
    const strPts = sagPoints([[0, 0, 0], [hx, hy, 0.01]], { sag: 0.04, step: 0.02 });
    const str = taperedTube(strPts.length, 5, 0.0045, 0.0045, materials.string);
    str.userData.set(strPts); str.castShadow = false;
    const pivot = new THREE.Group(); pivot.name = "tag";
    card.position.set(hx, hy, 0.012);
    card.rotation.z = o.angle ?? -0.12;
    pivot.add(str, card);
    if (o.tie) pivot.position.set(...o.tie);
    if (o.yaw != null) pivot.rotation.y = o.yaw;
    const W = TG.swing;
    pivot.userData.update = (t, { on = -Infinity } = {}) => {
      pivot.visible = t >= on;
      const tau = Math.max(0, t - on);
      pivot.rotation.z = Number.isFinite(on) ? W.amp * 1.3 * Math.exp(-W.zeta * tau) * Math.sin(W.omega * 0.8 * tau) : 0;
    };
    return pivot;
  }

  const props = {
    jar, cork, strata, rock, moss, fern, leafyPlant, vine, droplets, windowsill, tag, overlayTag,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }),
  };

  return {
    spec,
    palette: spec.palette,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      windowsill: (s) => windowsill(s.dims ?? {}),
      jar: (s) => jar(s.dims ?? {}),
    },
    plan: growth,
    setDaylight,
    setHaze,
    glassMeshes,
    helpers: { strataTexture, leafGobo, gardenTexture, leafGeometry, taperedTube, drawTag },
    /** render(t) — refraction pre-pass (outer glass hidden), then stage.render(t). */
    render(t) {
      const cam = stage.camera;
      cam.updateMatrixWorld();
      glassU.uRefractOn.value = 0;
      const vis = glassMeshes.map((m) => m.visible);
      glassMeshes.forEach((m) => (m.visible = false));
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(bgRT);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      glassMeshes.forEach((m, i) => (m.visible = vis[i]));
      glassU.uRefractOn.value = 1;
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
