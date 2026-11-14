// styles/stained-glass/style.js — "Stained Glass": a cathedral leaded window seen from a dim stone nave.
// The window is ONE merged pane mesh (custom glass shader: thickness, ripple, seeds, darker edges at the lead; per-pane
// flight into its cell driven by uTime) + instanced lead came, soldered joints and iron saddle bars. Every frame the style
// renders a LIGHT COOKIE (the window as the sun sees it: transmitted colour, lead in black) into a small HDR target; the
// floor shader and the raymarched light shafts look the cookie up along the sun direction, so the coloured patches and
// shafts carry the real pane pattern, lead lines and all. Time enters only through update(t) hooks and style.render(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import { rng, clamp, smoothstep, toEase } from "../../kit/time.js";
import * as glazing from "./glazing.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const lin = (hex) => new THREE.Color(hex); // sRGB hex -> linear working colour

// ===================================================================== stone textures (seeded, tileable)
function hash2i(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function tileNoise(x, y, period, seed) { // x, y in cell units, wraps at `period`
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (a, p) => ((a % p) + p) % p;
  const a = hash2i(w(xi, period[0]), w(yi, period[1]), seed), b = hash2i(w(xi + 1, period[0]), w(yi, period[1]), seed);
  const c = hash2i(w(xi, period[0]), w(yi + 1, period[1]), seed), d = hash2i(w(xi + 1, period[0]), w(yi + 1, period[1]), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** masonryCanvas({ tile:[w, h] m, block:[bw, bh], ppm, seed, base, dark, mortar, joint }) — ashlar courses / flagstones. */
function masonryCanvas(o) {
  const R = rng(o.seed ?? 1), ppm = o.ppm ?? 180;
  const cw = Math.round(o.tile[0] * ppm), ch = Math.round(o.tile[1] * ppm);
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = o.mortar; ctx.fillRect(0, 0, cw, ch);
  const rows = Math.max(1, Math.round(o.tile[1] / o.block[1])), rh = ch / rows, J = o.joint ?? 3;
  const base = new THREE.Color(o.base), dark = new THREE.Color(o.dark);
  for (let r = 0; r < rows; r++) {
    let x = -R.range(0, o.block[0] * ppm);
    while (x < cw) {
      const bw = o.block[0] * ppm * R.range(0.7, 1.35);
      const c = base.clone().lerp(dark, R.range(0, 0.55));
      for (const dx of [0, cw]) {
        const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        g.addColorStop(0, `#${c.clone().offsetHSL(0, 0, 0.03).getHexString()}`);
        g.addColorStop(1, `#${c.clone().offsetHSL(0, 0, -0.04).getHexString()}`);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx + J, r * rh + J, bw - 2 * J, rh - 2 * J);
      }
      x += bw;
    }
  }
  // two-scale speckle + mottling (tileable value noise)
  const img = ctx.getImageData(0, 0, cw, ch), d = img.data;
  const p1 = [Math.round(cw / 6), Math.round(ch / 6)], p2 = [Math.round(cw / 40), Math.round(ch / 40)], s = (o.seed ?? 1) * 7;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const n1 = tileNoise((x / cw) * p1[0], (y / ch) * p1[1], p1, s), n2 = tileNoise((x / cw) * p2[0], (y / ch) * p2[1], p2, s + 3);
    const k = 0.78 + 0.22 * n1 + 0.28 * (n2 - 0.5) + (hash2i(x, y, s + 9) - 0.5) * 0.08;
    const i = (y * cw + x) * 4;
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
function tileTexture(cv, tile, srgb = true) {
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tile[0], 1 / tile[1]); // geometry UVs are in metres
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===================================================================== shared GLSL
const NOISE_GLSL = /* glsl */ `
float sgH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float sgN2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sgH2(i), sgH2(i + vec2(1, 0)), f.x), mix(sgH2(i + vec2(0, 1)), sgH2(i + vec2(1, 1)), f.x), f.y); }
float sgH3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float sgN3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sgH3(i), sgH3(i + vec3(1,0,0)), f.x), mix(sgH3(i + vec3(0,1,0)), sgH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sgH3(i + vec3(0,0,1)), sgH3(i + vec3(1,0,1)), f.x), mix(sgH3(i + vec3(0,1,1)), sgH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// The cookie lookup: walk from world point P back along the sun direction to the glass plane.
const COOKIE_GLSL = /* glsl */ `
uniform sampler2D uCookie;
uniform vec3 uSunDir;   // direction the light travels (into the room: +z, downward)
uniform vec3 uWin;      // window origin in world (sill centre x, sill y, glass z)
uniform vec4 uCookieB;  // cookie bounds in window space (x0, y0, x1, y1)
vec3 sgCookie(vec3 P, float lod) {
  if (P.z <= uWin.z) return vec3(0.0);
  float s = (uWin.z - P.z) / max(uSunDir.z, 1e-3);
  vec2 w = (P + uSunDir * s).xy - uWin.xy;
  vec2 uv = (w - uCookieB.xy) / (uCookieB.zw - uCookieB.xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return textureLod(uCookie, uv, lod).rgb;
}
`;

// ===================================================================== the glass shader
const GLASS_VERT = /* glsl */ `
attribute vec2 aC; attribute float aE; attribute vec3 aCol; attribute float aReg; attribute float aSeed; attribute float aSet;
uniform float uTime;
uniform vec4 uSet; // dur, fly (m toward the nave), turn (rad), start scale
varying vec2 vW; varying float vE; varying vec3 vCol; varying float vReg; varying float vSeed;
void main() {
  float u = clamp((uTime - (aSet - uSet.x)) / uSet.x, 0.0, 1.0);
  float e = 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);
  float sgn = fract(aSeed * 7.13) - 0.5;
  float ang = (1.0 - e) * uSet.z * sgn * 2.0;
  float s = mix(uSet.w, 1.0, e) * step(1e-4, u);
  vec2 d = position.xy - aC;
  vec2 r = vec2(cos(ang) * d.x - sin(ang) * d.y, sin(ang) * d.x + cos(ang) * d.y) * s;
  vec3 p = vec3(aC + r, (1.0 - e) * uSet.y + (1.0 - e) * r.y * 0.9 * (fract(aSeed * 3.71) - 0.5));
  vW = position.xy; vE = aE; vCol = aCol; vReg = aReg; vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const GLASS_FRAG = /* glsl */ `
${GLSL_SAFE}
${NOISE_GLSL}
uniform float uGlow[24];
uniform float uGain, uAmbient, uSheen, uEdgeDark, uThick, uThickScale, uRipple, uRippleFreq, uBubbles, uBubbleScale, uBubbleCover;
varying vec2 vW; varying float vE; varying vec3 vCol; varying float vReg; varying float vSeed;
void main() {
  float glow = uGlow[int(vReg + 0.5)];
  vec2 p = vW;
  float th = 0.6 * sgN2(p * uThickScale + vSeed * 17.0) + 0.4 * sgN2(p * uThickScale * 2.7 + vSeed * 5.0);
  float thick = (th - 0.5) * 2.0 * uThick;                       // -thick..thick
  float a = vSeed * 6.2831853;
  vec2 dir = vec2(cos(a), sin(a));
  float rip = sin(dot(p, dir) * uRippleFreq + sgN2(p * 5.0 + vSeed * 9.0) * 5.0);
  vec2 bq = p * uBubbleScale + vSeed * 31.0, bi = floor(bq), bf = fract(bq);
  float has = step(sgH2(bi), uBubbleCover);
  vec2 bc = vec2(sgH2(bi + 7.1), sgH2(bi + 3.3)) * 0.5 + 0.25;
  float br = mix(0.08, 0.22, sgH2(bi + 5.5));
  float bd = length(bf - bc) / br;
  float core = has * (1.0 - smoothstep(0.45, 0.8, bd));
  float rim = has * smoothstep(0.6, 0.85, bd) * (1.0 - smoothstep(0.9, 1.1, bd));
  float edge = mix(uEdgeDark, 1.0, smoothstep(0.0, 1.0, vE));
  vec3 tone = safePow(vCol, 1.0 + thick * 0.9);
  float trans = max(0.0, (1.0 - thick * 0.45) * (1.0 + rip * uRipple) * edge * (1.0 + core * uBubbles - rim * uBubbles * 0.7));
  vec3 lit = tone * trans * glow;
#ifdef COOKIE
  gl_FragColor = vec4(lit, 1.0);
#else
  vec3 col = lit * uGain + vCol * uAmbient * edge * (1.0 + 0.3 * rip) + vec3(uSheen) * (0.5 + 0.5 * rip) * edge * (1.0 - min(glow, 1.0));
  gl_FragColor = vec4(col, 1.0);
#endif
}`;

// ===================================================================== shafts (raymarched through the cookie)
const SHAFT_VERT = /* glsl */ `
varying vec3 vWp;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHAFT_FRAG = (steps) => /* glsl */ `
${GLSL_SAFE}
${NOISE_GLSL}
${COOKIE_GLSL}
uniform vec3 uBoxMin, uBoxMax, uDrift;
uniform float uTime, uDensity, uGain, uLod, uDust, uDustScale, uForward;
varying vec3 vWp;
void main() {
  vec3 ro = cameraPosition, rd = safeNorm(vWp - ro);
  vec3 inv = vec3(safeDiv(1.0, rd.x), safeDiv(1.0, rd.y), safeDiv(1.0, rd.z));
  vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float tmin = max(max(max(tn.x, tn.y), tn.z), 0.0), tmax = min(min(tf.x, tf.y), tf.z);
  if (tmax <= tmin) discard;
  float dt = (tmax - tmin) / float(${steps});
  float j = sgH2(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${steps}; i++) {
    vec3 P = ro + rd * (tmin + (float(i) + j) * dt);
    vec3 c = sgCookie(P, uLod);
    if (c.r + c.g + c.b <= 0.0) continue;
    float n = sgN3(P * uDustScale + uDrift * uTime) * 0.65 + sgN3(P * uDustScale * 2.9 - uDrift * uTime * 1.7) * 0.35;
    acc += c * mix(1.0 - uDust, 1.0 + uDust, n);
  }
  float phase = 1.0 + uForward * safePow(max(dot(rd, -uSunDir), 0.0), 5.0);
  gl_FragColor = vec4(acc * dt * uDensity * uGain * phase, 1.0);
}`;

/**
 * createStyle(stage, opts?) -> style
 *   props: room, window, shafts, caption, plaque, label        plan: glazing.js (outline, figures, layoutWindow, planGlazing,
 *   regionLevel, lightEvents, sunDir, landing)                 style.setSun(dir), style.render(t) (cookie pass + stage.render)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const { renderer } = stage;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const G = spec.glass, W = spec.window;

  // ---- shared light state: cookie target + sun direction ----
  const [cwPx, chPx] = W.cookie;
  const cookieRT = new THREE.WebGLRenderTarget(cwPx, chPx, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const cookieScene = new THREE.Scene();
  cookieScene.background = new THREE.Color(0, 0, 0);
  const cookieCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);
  cookieCam.position.set(0, 0, 6);
  const LU = {
    uCookie: { value: cookieRT.texture },
    uSunDir: { value: new THREE.Vector3(0, -0.6, 0.8).normalize() },
    uWin: { value: new THREE.Vector3(0, W.sill, W.glassZ) },
    uCookieB: { value: new THREE.Vector4(-1, 0, 1, 1) },
  };
  let theWindow = null;

  // ===================================================================== window
  /**
   * window(plan, { regions }) -> Group placed at the sill centre on the glass plane. plan = glazing.planGlazing(...).
   *   userData.update(t, levelOf(region) -> backlight level)   (sets pane flight, glow, lead draw-on, joints, spill light)
   *   userData.regions (index order), userData.anchor(region) -> world [x, y, z] of that region's centroid.
   */
  function windowProp(plan, o = {}) {
    const L = spec.lead, panes = plan.panes;
    const regions = o.regions ?? [...new Set(panes.map((p) => p.region))];
    const regionIdx = Object.fromEntries(regions.map((r, i) => [r, i]));
    const R = rng(o.seed ?? 9);
    // ---- merged pane geometry: outer ring (edge 0) -> inset ring (edge 1) -> centroid fan ----
    const pos = [], aC = [], aE = [], aCol = [], aReg = [], aSeed = [], aSet = [];
    const regionSum = regions.map(() => new THREE.Vector3()), regionArea = regions.map(() => 0), regionCen = regions.map(() => [0, 0]);
    let totalArea = 0;
    const cellSeed = new Map();
    for (const p of panes) {
      const c = glazing.centroid(p.pts), rin = glazing.inradius(p.pts, c), e = G.edgeWidth;
      const k = rin > e * 1.15 ? 1 - e / rin : 0.25;
      const eIn = clamp(((1 - k) * rin) / e), eC = clamp(rin / e);
      const inner = p.pts.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
      const col = lin(spec.tones[p.tone] ?? p.tone ?? "#ffffff"), ri = regionIdx[p.region] ?? 0;
      if (p.cell && !cellSeed.has(p.cell)) cellSeed.set(p.cell, R.next());
      const seed = p.cell ? cellSeed.get(p.cell) : R.next();
      const v = (q, ed) => { pos.push(q[0], q[1], 0); aC.push(c[0], c[1]); aE.push(ed); aCol.push(col.r, col.g, col.b); aReg.push(ri); aSeed.push(seed); aSet.push(p.set ?? 0); };
      const n = p.pts.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const e0 = p.seams?.includes(i) ? eIn : 0; // a seam (same sheet, no lead) is not darkened
        v(p.pts[i], e0); v(p.pts[j], e0); v(inner[j], eIn);
        v(p.pts[i], e0); v(inner[j], eIn); v(inner[i], eIn);
        v(inner[i], eIn); v(inner[j], eIn); v(c, eC);
      }
      const A = Math.abs(glazing.area(p.pts));
      regionSum[ri].add(new THREE.Vector3(col.r, col.g, col.b).multiplyScalar(A));
      regionArea[ri] += A; totalArea += A;
      regionCen[ri][0] += c[0] * A; regionCen[ri][1] += c[1] * A;
    }
    regionCen.forEach((c, i) => { if (regionArea[i] > 0) { c[0] /= regionArea[i]; c[1] /= regionArea[i]; } });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aC", new THREE.Float32BufferAttribute(aC, 2));
    geo.setAttribute("aE", new THREE.Float32BufferAttribute(aE, 1));
    geo.setAttribute("aCol", new THREE.Float32BufferAttribute(aCol, 3));
    geo.setAttribute("aReg", new THREE.Float32BufferAttribute(aReg, 1));
    geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(aSeed, 1));
    geo.setAttribute("aSet", new THREE.Float32BufferAttribute(aSet, 1));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += G.setFly + 1; // flying panes stay inside the cull sphere
    const U = {
      uTime: { value: 0 }, uSet: { value: new THREE.Vector4(G.setDur, G.setFly, G.setTurn, G.setScale) },
      uGlow: { value: new Array(24).fill(0) }, uGain: { value: G.gain }, uAmbient: { value: G.ambient }, uSheen: { value: G.sheen },
      uEdgeDark: { value: G.edgeDark }, uThick: { value: G.thick }, uThickScale: { value: G.thickScale },
      uRipple: { value: G.ripple }, uRippleFreq: { value: G.rippleFreq },
      uBubbles: { value: G.bubbles }, uBubbleScale: { value: G.bubbleScale }, uBubbleCover: { value: G.bubbleCover },
    };
    const glassMat = new THREE.ShaderMaterial({ name: "stainedGlass", uniforms: U, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, side: THREE.DoubleSide });
    const cookieMat = new THREE.ShaderMaterial({ name: "stainedGlassCookie", uniforms: U, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, side: THREE.DoubleSide, defines: { COOKIE: 1 } });
    const glass = new THREE.Mesh(geo, glassMat);
    glass.name = "panes";
    const glassC = new THREE.Mesh(geo, cookieMat);
    glassC.frustumCulled = false;

    // ---- lead came, frame came and saddle bars: one instanced rounded bead ----
    const bead = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false);
    bead.rotateZ(Math.PI / 2);
    const leads = plan.leads;
    const leadMesh = new THREE.InstancedMesh(bead, materials.lead, leads.length);
    leadMesh.name = "lead";
    leadMesh.castShadow = false; leadMesh.receiveShadow = true;
    const leadC = new THREE.InstancedMesh(bead, new THREE.MeshBasicMaterial({ color: 0x000000 }), leads.length);
    leadC.instanceMatrix = leadMesh.instanceMatrix; leadC.frustumCulled = false;
    const dims = (l) => (l.kind === "frame" ? [L.frameWidth, L.frameDepth] : l.kind === "bar" ? [L.barWidth, L.barDepth] : [L.width, L.depth]);
    const ball = new THREE.SphereGeometry(1, 10, 6);
    const joints = new THREE.InstancedMesh(ball, materials.lead, plan.joints.length);
    joints.name = "joints";
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    function setLeads(t) {
      leads.forEach((l, i) => {
        const p = toEase("outCubic")(clamp((t - l.t0) / l.dur));
        const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], len = Math.hypot(dx, dy), [w, d] = dims(l);
        const zc = l.kind === "bar" ? 0.07 : d * 0.18;
        Q.setFromAxisAngle(Z, Math.atan2(dy, dx));
        T.set(l.a[0] + (dx * p) / 2, l.a[1] + (dy * p) / 2, zc);
        S.set(p > 0 ? Math.max(len * p + (l.kind === "came" ? w * 0.6 : 0) * p, 1e-4) : 0, p > 0 ? w : 0, p > 0 ? d : 0);
        leadMesh.setMatrixAt(i, M.compose(T, Q, S));
      });
      leadMesh.instanceMatrix.needsUpdate = true;
      plan.joints.forEach((j, i) => {
        const s = L.joint * toEase("outBack")(clamp((t - j.t) / 0.25));
        T.set(j.p[0], j.p[1], L.depth * 0.25); Q.identity(); S.set(s, s, s * 0.55);
        joints.setMatrixAt(i, M.compose(T, Q, s > 0 ? S : S.set(0, 0, 0)));
      });
      joints.instanceMatrix.needsUpdate = true;
    }
    setLeads(0);
    cookieScene.add(glassC, leadC);

    // the outdoors behind the glass: a dim plane so the lead reads as a silhouette before the panes are set
    const [bx0, by0, bx1, by1] = plan.layout.bounds;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0 + 0.6, by1 - by0 + 0.6),
      new THREE.MeshBasicMaterial({ color: lin(W.outside), fog: false }));
    backdrop.position.set((bx0 + bx1) / 2, (by0 + by1) / 2, -0.25);
    backdrop.name = "outside";
    const g = new THREE.Group();
    g.name = "window";
    g.position.set(0, W.sill, W.glassZ);
    g.add(backdrop, glass, leadMesh, joints);

    // ---- coloured spill: one light in front of the window, one bouncing off the floor patch ----
    const SP = spec.spill;
    const spill = new THREE.PointLight(0xffffff, 0, SP.distance, 2);
    spill.position.set(...SP.pos);
    const bounce = new THREE.PointLight(0xffffff, 0, SP.floorDistance, 2);
    stage.scene.add(spill, bounce);

    const [x0, y0, x1, y1] = plan.layout.bounds;
    cookieCam.left = x0; cookieCam.right = x1; cookieCam.bottom = y0; cookieCam.top = y1;
    cookieCam.updateProjectionMatrix();
    LU.uCookieB.value.set(x0, y0, x1, y1);
    LU.uWin.value.set(g.position.x, g.position.y, g.position.z);
    const mid = [(x0 + x1) / 2, (y0 + y1) / 2];

    g.userData = {
      plan, regions, regionIdx, glass, backdrop, lead: leadMesh, joints, spill, bounce, material: glassMat,
      anchor: (region) => { const c = regionCen[regionIdx[region]] ?? mid; return [g.position.x + c[0], g.position.y + c[1], g.position.z]; },
      update(t, levelOf = () => 1) {
        U.uTime.value = t;
        const avg = new THREE.Vector3();
        regions.forEach((r, i) => { const v = levelOf(r, t); U.uGlow.value[i] = v; avg.addScaledVector(regionSum[i], v); });
        avg.multiplyScalar(1 / Math.max(totalArea, 1e-6));
        setLeads(t);
        const lum = Math.max(avg.x, avg.y, avg.z, 1e-6);
        spill.color.setRGB(avg.x / lum, avg.y / lum, avg.z / lum);
        spill.intensity = SP.intensity * lum;
        bounce.color.copy(spill.color);
        bounce.intensity = SP.floorIntensity * lum;
        const d = LU.uSunDir.value;
        const land = glazing.landing([g.position.x + mid[0], g.position.y + mid[1], g.position.z], [d.x, d.y, d.z], 0);
        bounce.position.set(land[0], SP.floorHeight, land[2]); // high and soft: a glow, not a hot spot
      },
    };
    theWindow = g;
    return g;
  }

  // ===================================================================== room: flagstone floor + wall with a splayed reveal
  /** room({ layout }) -> Group: wall (z = 0, window hole), splayed stone reveal down to the glass, flagstone floor that
   *  receives the coloured window light (cookie lookup along the sun). */
  function room(o = {}) {
    const RM = spec.room, pal = spec.palette;
    const g = new THREE.Group();
    g.name = "room";
    const wallTile = [RM.block[0] * 8, RM.block[1] * 8];
    const wallCv = masonryCanvas({ tile: wallTile, block: RM.block, seed: RM.seed, base: pal.stone, dark: pal.stoneDark, mortar: pal.mortar, ppm: 170, joint: 2 });
    const wallMap = tileTexture(wallCv, wallTile), wallBump = tileTexture(wallCv, wallTile, false);
    const stoneMat = materials.stone.clone();
    stoneMat.map = wallMap; stoneMat.bumpMap = wallBump; stoneMat.bumpScale = 2.2; stoneMat.color.set("#ffffff");
    stoneMat.name = "stoneWall";
    const outer = o.layout?.outer ?? glazing.resample(glazing.outline("arch"), 0.22);
    const sill = W.sill, gz = W.glassZ;
    const innerRing = glazing.offsetPoly(outer, -W.splay); // wider toward the nave
    const hw = RM.width / 2;
    const shape = new THREE.Shape([[-hw, 0], [hw, 0], [hw, RM.height], [-hw, RM.height]].map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes.push(new THREE.Path(innerRing.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y + sill))));
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), stoneMat);
    wall.name = "wall"; wall.receiveShadow = true;
    // reveal: loft between the inner ring (z = 0) and the glass ring (z = glassZ)
    const n = outer.length, rp = [], ruv = [], idx = [];
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      const a = outer[i % n], b = innerRing[i % n];
      if (i > 0) acc += Math.hypot(outer[i % n][0] - outer[i - 1][0], outer[i % n][1] - outer[i - 1][1]);
      rp.push(a[0], a[1] + sill, gz, b[0], b[1] + sill, 0);
      ruv.push(acc, 0, acc, Math.hypot(W.splay, gz));
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    rgeo.setAttribute("uv", new THREE.Float32BufferAttribute(ruv, 2));
    rgeo.setIndex(idx);
    rgeo.computeVertexNormals();
    const reveal = new THREE.Mesh(rgeo, stoneMat);
    reveal.material = stoneMat.clone(); reveal.material.side = THREE.DoubleSide; reveal.material.name = "stoneReveal";
    reveal.name = "reveal"; reveal.receiveShadow = true;
    // floor
    const flagTile = [RM.flag[0] * 4, RM.flag[1] * 5];
    const flagCv = masonryCanvas({ tile: flagTile, block: RM.flag, seed: RM.seed + 5, base: pal.floor, dark: pal.stoneDark, mortar: pal.mortar, ppm: 140, joint: 3 });
    const floorMat = materials.floor.clone();
    floorMat.map = tileTexture(flagCv, flagTile); floorMat.bumpMap = tileTexture(flagCv, flagTile, false); floorMat.bumpScale = 1.6;
    floorMat.color.set("#ffffff"); floorMat.name = "flagstones";
    const FL = spec.floorLight;
    floorMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, LU, { uFloorGain: { value: FL.gain }, uFloorLod: { value: FL.lod } });
      floorMat.userData.shader = sh;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSgW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvSgW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vSgW;\nuniform float uFloorGain, uFloorLod;\n${COOKIE_GLSL}`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * sgCookie(vSgW, uFloorLod) * uFloorGain * max(-uSunDir.y, 0.0);");
    };
    floorMat.customProgramCacheKey = () => "sg-floor-cookie";
    const floorGeo = new THREE.PlaneGeometry(RM.width, RM.depth);
    // UVs in metres
    const fp = floorGeo.attributes.position, fuv = floorGeo.attributes.uv;
    for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) + RM.width / 2, fp.getY(i) + RM.depth / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, RM.depth / 2);
    floor.name = "floor"; floor.receiveShadow = true;
    g.add(wall, reveal, floor);
    g.userData = { wall, reveal, floor };
    return g;
  }

  // ===================================================================== shafts
  /** shafts(o) -> additive raymarched volume (box) that reads the window cookie along the sun: coloured shafts in dusty air. */
  function shafts(o = {}) {
    const SH = { ...spec.shafts, ...o };
    const [bmin, bmax] = SH.box;
    const geo = new THREE.BoxGeometry(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]);
    geo.translate((bmin[0] + bmax[0]) / 2, (bmin[1] + bmax[1]) / 2, (bmin[2] + bmax[2]) / 2);
    const U = {
      ...LU,
      uBoxMin: { value: new THREE.Vector3(...bmin) }, uBoxMax: { value: new THREE.Vector3(...bmax) },
      uDrift: { value: new THREE.Vector3(...SH.dustDrift) }, uTime: { value: 0 },
      uDensity: { value: SH.density }, uGain: { value: SH.gain }, uLod: { value: SH.lod },
      uDust: { value: SH.dust }, uDustScale: { value: SH.dustScale }, uForward: { value: SH.forward },
    };
    const mat = new THREE.ShaderMaterial({ name: "lightShafts", uniforms: U, vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG(SH.steps | 0),
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const m = new THREE.Mesh(geo, mat);
    m.name = "shafts"; m.renderOrder = 5; m.frustumCulled = false;
    m.userData.noDepth = true;
    m.userData.update = (t, level = 1) => { U.uTime.value = t; U.uGain.value = SH.gain * level; m.visible = level > 0; };
    return m;
  }

  // ===================================================================== labels
  const OV = spec.overlay;
  const serif = FONTS[OV.font] ?? OV.font;
  /**
   * caption(text, { x, y, align: "center"|"left", swatch: tone key|hex|null, sub }) -> overlay canvas (exact colour, after post):
   * cream serif capitals with wide tracking over a lead-grey rule set with small diamond quarries (the swatch colour in the
   * middle: ties the caption to the region that glows). userData.update(t, { on, off }).
   */
  function caption(text, o = {}) {
    const Wp = o.width ?? 1500, Hp = o.height ?? 170, px = o.px ?? OV.px;
    const sw = o.swatch ? (spec.tones[o.swatch] ?? o.swatch) : null;
    const cv = screenCanvas(stage, Wp, Hp, (ctx, w, h, st) => {
      ctx.font = `400 ${px}px ${serif}`;
      ctx.letterSpacing = `${OV.tracking}px`;
      ctx.textBaseline = "alphabetic";
      const tw = ctx.measureText(text).width - OV.tracking;
      const cx = o.align === "left" ? 40 + tw / 2 : w / 2;
      ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = 18;
      ctx.fillStyle = OV.color;
      ctx.textAlign = "left";
      ctx.fillText(text, cx - tw / 2, px * 1.05);
      ctx.shadowBlur = 0;
      // the rule: lead line with quarries; it draws out from the centre
      const ry = px * 1.05 + 30, half = (tw / 2 + 26) * st.rule;
      ctx.strokeStyle = OV.rule; ctx.lineWidth = OV.ruleWidth; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx - half, ry); ctx.lineTo(cx + half, ry); ctx.stroke();
      const q = OV.quarry;
      const diamond = (x, s, fill) => {
        ctx.beginPath(); ctx.moveTo(x, ry - s); ctx.lineTo(x + s, ry); ctx.lineTo(x, ry + s); ctx.lineTo(x - s, ry); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1c1a18"; ctx.stroke();
      };
      if (st.rule > 0.05) { diamond(cx - half, q * 0.7, spec.tones.gold); diamond(cx + half, q * 0.7, spec.tones.gold); }
      if (sw && st.rule > 0.3) diamond(cx, q * (0.6 + 0.4 * st.rule), sw);
      if (o.sub) { ctx.font = `400 ${Math.round(px * 0.42)}px ${serif}`; ctx.letterSpacing = `${OV.tracking * 0.6}px`; ctx.fillStyle = OV.sub;
        const sw2 = ctx.measureText(o.sub).width; ctx.fillText(o.sub, cx - sw2 / 2, ry + 52); }
    });
    const x = o.x ?? stage.width / 2, y = o.y ?? stage.height * 0.8;
    const X = o.align === "left" ? x - 40 : x - Wp / 2;
    cv.userData.update = (t, { on, off = Infinity }) => {
      const a = smoothstep(on, on + OV.fadeDur, t) * (1 - smoothstep(off, off + OV.outDur, t));
      const rule = toEase("outCubic")(clamp((t - on - 0.1) / 0.7));
      cv.userData.opacity(a);
      if (a <= 0.003) return;
      const rise = (1 - toEase("outCubic")(clamp((t - on) / (OV.fadeDur * 2)))) * OV.rise;
      cv.userData.place(X, y + rise);
      cv.userData.set({ rule: Math.round(rule * 60) / 60 });
    };
    return cv;
  }

  const props = {
    room,
    window: windowProp,
    shafts,
    caption,
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
    plan: glazing,
    factories: {
      room: (s) => room({ layout: glazing.layoutWindow(s.dims.design) }),
      window: (s) => windowProp(glazing.planGlazing(glazing.layoutWindow(s.dims.design), s.dims.plan ?? {}), s.dims),
      shafts: (s) => shafts(s.dims ?? {}),
    },
    sfx: spec.sfx,
    /** setSun([dx, dy, dz]) — direction the light travels (glazing.sunDir(t, keys)). */
    setSun(d) { LU.uSunDir.value.set(d[0], d[1], d[2]).normalize(); },
    /** render(t) — the light-cookie pass (window as the sun sees it), then stage.render(t). ALWAYS use this. */
    render(t) {
      if (theWindow) {
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(cookieRT);
        renderer.render(cookieScene, cookieCam); // scene.background = black clears it
        renderer.setRenderTarget(prev);
      }
      stage.render(t);
    },
  };
}
