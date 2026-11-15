// styles/star-chart/style.js — "Star Chart": a planetarium night with antique celestial-atlas graphics in gold line.
// Every look number lives in spec.js; every move (sky spin, star highlights, line draws, figure fades, name write-ons,
// pointer sweeps, links, shooting stars) is planned by skyplan.js (pure, Node-safe) and only READ here.
// Props are synchronous and seeded. All text is rasterised ONCE at build (await document.fonts first — FONT_FACES), on
// canvases created with willReadFrequently (CPU raster = identical across page loads) and uploaded at build; renderAt
// only sets uniforms, matrices and line buffers (no canvas redraws, no texture uploads per frame).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { screenLines } from "../../kit/lines.js";
import { screenCanvas } from "../../kit/overlay.js";
import { uploadTexture } from "../../kit/textures.js";
import { fbm2 } from "../../kit/noise.js";
import { rng, clamp, smoothstep } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as sky from "./skyplan.js";
export { STYLE_SPEC };

/** Font faces to load (document.fonts.load) before createStyle: macOS system faces only, nothing fetched. */
export const FONT_FACES = [
  `600 40px "Hoefler Text"`, `400 40px "Hoefler Text"`, `italic 400 40px "Hoefler Text"`,
  `600 40px Baskerville`, `italic 400 40px Baskerville`,
];

const { D2R, v3 } = sky;
const R0 = Math.round;

// ------------------------------------------------------------------------------------------------ GLSL
const NOISE_GLSL = /* glsl */ `
float h3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

const lin = (hex) => new THREE.Color(hex);   // THREE.Color from sRGB hex = linear working colour

/**
 * createStyle(stage, opts?) -> style
 *   props: skyDome, turningSphere, milkyWay, catalogue, trails, grid, ecliptic, horizon, heroStars, constellation, link,
 *          pointer, shootingStar, caption, starChart (assembles everything from a skyplan plan)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, S = spec, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const RAD = S.sky.radius;
  const pxScale = stage.height / 1080;
  const textStyle = { font: S.text.font, weight: S.text.weight, color: S.text.color, height: S.text.height };

  // -------------------------------------------------------------------------------------------- sky dome (world)
  /** skyDome() -> Mesh: the gradient dome (zenith -> mid -> horizon, a faint warm afterglow low in the west). */
  function skyDome() {
    const G = S.gradient, ga = G.horizonGlowAz * D2R;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uZen: { value: lin(P.zenith) }, uMid: { value: lin(P.mid) }, uHor: { value: lin(P.horizon) }, uGlow: { value: lin(P.glow) },
        uGlowDir: { value: new THREE.Vector2(Math.sin(ga), -Math.cos(ga)) }, uGlowW: { value: G.glowWidth }, uGlowH: { value: G.glowHeight }, uGlowL: { value: G.glowLevel },
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vDir = normalize(wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZen, uMid, uHor, uGlow; uniform vec2 uGlowDir; uniform float uGlowW, uGlowH, uGlowL; varying vec3 vDir;
        void main(){
          float h = max(vDir.y, 0.0);
          vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.3, h));
          c = mix(c, uZen, smoothstep(0.22, 0.95, h));
          vec2 hz = normalize(vDir.xz + vec2(1e-5));
          float g = max(dot(hz, uGlowDir), 0.0);
          c += uGlow * uGlowL * pow(g, 1.0 / max(uGlowW, 0.05)) * exp(-h / uGlowH);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(RAD.gradient, 64, 40), mat);
    m.renderOrder = -10; m.name = "skyDome"; m.frustumCulled = false;
    return m;
  }

  // -------------------------------------------------------------------------------------------- the turning sphere
  /** turningSphere() -> { outer, inner, update(t) }: outer tilts local +Y to the pole, inner spins by -θ(t). */
  function turningSphere() {
    const outer = new THREE.Group(), inner = new THREE.Group();
    outer.name = "celestialTilt"; inner.name = "celestialSpin";
    outer.rotation.x = sky.tilt(S);
    outer.add(inner);
    return { outer, inner, update(t) { inner.rotation.y = -sky.spinAngle(S, t); } };
  }

  // -------------------------------------------------------------------------------------------- Milky Way
  /** milkyWay(pole) -> Mesh (child of the spinning group): a procedural band with clumps, knots and dark lanes. */
  function milkyWay(pole) {
    const M = S.milkyWay;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPole: { value: new THREE.Vector3(...pole) }, uWidth: { value: M.width * D2R }, uLevel: { value: M.level }, uLanes: { value: M.lanes },
        uKnots: { value: M.knots }, uCore: { value: lin(M.core) }, uEdge: { value: lin(M.edge) },
      },
      vertexShader: /* glsl */ `varying vec3 vLocal; varying float vAlt;
        void main(){ vLocal = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); vAlt = normalize(wp.xyz).y; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uPole, uCore, uEdge; uniform float uWidth, uLevel, uLanes, uKnots; varying vec3 vLocal; varying float vAlt;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vLocal);
          float lat = asin(clamp(dot(d, uPole), -1.0, 1.0));
          float n1 = fbm(d * 4.0), n2 = fbm(d * 12.0 + 5.0);
          float l2 = lat + (n1 - 0.5) * uWidth * 1.3;
          float w = uWidth;
          float band = exp(-l2 * l2 / (2.0 * w * w));
          float wide = exp(-l2 * l2 / (2.0 * 6.0 * w * w)) * 0.28;
          float lw = w * 0.42;
          float lanes = smoothstep(0.48, 0.7, fbm(d * 7.0 + 11.0)) * exp(-lat * lat / (2.0 * lw * lw));
          float I = band * (0.5 + 0.95 * n2) * (1.0 - uLanes * lanes) + wide * (0.55 + 0.7 * n1);
          float knots = pow(max(n2 - 0.52, 0.0) * 2.4, 3.0) * band * uKnots;
          vec3 c = mix(uEdge, uCore, band) * (I + knots);
          float ext = smoothstep(-0.02, 0.28, vAlt);
          gl_FragColor = vec4(c * uLevel * ext, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(RAD.milkyWay, 128, 64), mat);
    m.renderOrder = -5; m.name = "milkyWay"; m.frustumCulled = false;
    return m;
  }

  // -------------------------------------------------------------------------------------------- star catalogue
  /** catalogue(cat) -> Points (child of the spinning group); userData.update(t) sets the twinkle clock. */
  function catalogue(cat) {
    const n = cat.n, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), rate = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const d = cat.dir[i], L = sky.starLook(S, cat.mag[i]);
      pos.set([d[0] * RAD.stars, d[1] * RAD.stars, d[2] * RAD.stars], i * 3);
      c.set(cat.color[i]).multiplyScalar(L.flux);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = L.size; ph[i] = cat.phase[i]; rate[i] = cat.rate[i];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("aRate", new THREE.BufferAttribute(rate, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmp: { value: S.twinkle.amp }, uBoost: { value: S.twinkle.horizonBoost }, uScale: { value: pxScale }, uLevel: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uAmp, uBoost, uScale, uLevel;
        attribute vec3 aColor; attribute float aSize, aPhase, aRate;
        varying vec3 vCol; varying float vPx;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float alt = normalize(wp.xyz).y;
          float ext = smoothstep(-0.01, 0.12, alt);
          float low = 1.0 - smoothstep(0.0, 0.4, alt);
          float tw = sin(uTime * aRate * 6.2831853 + aPhase) * sin(uTime * aRate * 10.166 + aPhase * 2.3);
          float k = max(0.15, 1.0 + uAmp * (1.0 + uBoost * low) * tw);
          vCol = aColor * k * mix(0.25, 1.0, ext) * uLevel;
          vPx = aSize * uScale * (0.88 + 0.12 * k);
          gl_PointSize = vPx;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vPx;
        void main(){
          vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d);
          if (r2 > 1.0) discard;
          float rp = sqrt(r2) * vPx * 0.5;
          float core = exp(-rp * rp / 1.1);
          float halo = exp(-r2 * 3.0) * 0.22;
          gl_FragColor = vec4(vCol * (core + halo) * (1.0 - r2), 1.0);
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(g, mat);
    pts.name = "catalogue"; pts.frustumCulled = false; pts.renderOrder = -2;
    pts.userData.update = (t) => { mat.uniforms.uTime.value = t; };
    return pts;
  }

  // -------------------------------------------------------------------------------------------- star trails
  /** trails(cat) -> Group of screenLines tiers (child of the spinning group): bright stars trail by θ(t) - θ(t - τ). */
  function trails(cat) {
    const T = S.trails, ids = [];
    for (let i = 0; i < cat.n; i++) if (cat.mag[i] < T.mag) ids.push(i);
    const N = 4, rr = RAD.stars * 0.998;
    const tierPolys = (k, delta) => ids.map((i) => {
      const d = cat.dir[i], out = [];
      for (let q = 0; q <= N; q++) {
        const s = (k + q / N) / T.pieces, a = s * delta, ca = Math.cos(a), sa = Math.sin(a);
        out.push([(d[0] * ca + d[2] * sa) * rr, d[1] * rr, (-d[0] * sa + d[2] * ca) * rr]);
      }
      return out;
    });
    const g = new THREE.Group(); g.name = "trails";
    const tiers = [];
    for (let k = 0; k < T.pieces; k++) {
      const l = screenLines(stage, tierPolys(k, 0.02), { width: T.width * (1 - k * 0.2), color: T.color, level: T.level * Math.pow(1 - k / T.pieces, 1.4), order: "parallel", depth: "visible", name: `trail${k}` });
      tiers.push(l); g.add(l);
    }
    g.userData.update = (t) => {
      const delta = sky.spinAngle(S, t) - sky.spinAngle(S, t - T.tau);
      const fade = smoothstep(T.minRate, T.minRate * 2.2, sky.spinRate(S, t) / D2R);
      tiers.forEach((l, k) => { l.userData.setPolys(tierPolys(k, delta)); l.userData.setLevel(fade); });
    };
    return g;
  }

  // -------------------------------------------------------------------------------------------- grid + ecliptic
  /** grid() -> Group (child of the spinning group): hour circles + declination circles; userData.setDraw(p). */
  function grid() {
    const Gd = S.grid, r = RAD.grid;
    const dir = (ra, dec) => [Math.cos(dec * D2R) * Math.sin(ra * D2R) * r, Math.sin(dec * D2R) * r, -Math.cos(dec * D2R) * Math.cos(ra * D2R) * r];
    const meridians = [], circles = [];
    for (let ra = 0; ra < 360; ra += Gd.raStep) { const pl = []; for (let dec = -62; dec <= 84; dec += 2) pl.push(dir(ra, dec)); meridians.push(pl); }
    for (const dec of Gd.decs) { if (dec === 0) continue; const pl = []; for (let ra = 0; ra <= 360; ra += 2) pl.push(dir(ra, dec)); circles.push(pl); }
    const eq = []; for (let ra = 0; ra <= 360; ra += 1.5) eq.push(dir(ra, 0));
    const g = new THREE.Group(); g.name = "grid";
    const a = screenLines(stage, [...meridians, ...circles], { width: Gd.width, color: Gd.color, level: Gd.level, order: "parallel", name: "gridLines" });
    const b = screenLines(stage, [eq], { width: Gd.width * 1.4, color: Gd.color, level: Gd.equatorLevel, order: "parallel", name: "equator" });
    g.add(a, b);
    g.userData.setDraw = (p, level = 1) => { for (const l of [a, b]) { l.userData.setProgress(p); l.userData.setLevel(level); } };
    return g;
  }
  /** ecliptic(pole) -> Group (child of the spinning group): ticked great circle; userData.setDraw(p). */
  function ecliptic(pole) {
    const E = S.ecliptic, r = RAD.grid * 0.995;
    const circle = sky.greatCircle(pole, 360);
    const ticks = [];
    for (let i = 0; i < 360; i += E.tickEvery) {
      const d = circle[i], len = (i % E.majorEvery === 0 ? E.majorDeg : E.tickDeg) * D2R;
      ticks.push([v3.mul(v3.norm(v3.add(d, v3.mul(pole, -len))), r), v3.mul(v3.norm(v3.add(d, v3.mul(pole, len))), r)]);
    }
    const g = new THREE.Group(); g.name = "ecliptic";
    const a = screenLines(stage, [circle.map((d) => v3.mul(d, r))], { width: E.width, color: E.color, level: E.level, name: "eclipticLine" });
    const b = screenLines(stage, ticks, { width: E.width * 0.7, color: E.color, level: E.level * 0.8, order: "parallel", name: "eclipticTicks" });
    g.add(a, b);
    g.userData.setDraw = (p, level = 1) => { a.userData.setProgress(p); a.userData.setLevel(level); b.userData.setProgress(clamp(p * 1.4 - 0.4)); b.userData.setLevel(level); };
    return g;
  }

  // -------------------------------------------------------------------------------------------- horizon set (world)
  const H = S.horizon;
  const ridge = (L, az) => {
    const u = ((az / 360) % 1 + 1) % 1;
    const n = fbm2(u * 14, 0.5, { seed: L.seed, octaves: 4, period: 14 });
    const n2 = fbm2(u * 5, 3.5, { seed: L.seed + 9, octaves: 2, period: 5 });
    return L.alt[0] + (L.alt[1] - L.alt[0]) * clamp(0.15 + 0.7 * n * 0.9 + 0.5 * (n2 - 0.5));
  };
  function band(L, top, bottom) {
    const N = 540, pos = [], colr = [], idx = [];
    const ct = lin(top), cb = lin(bottom);
    for (let i = 0; i <= N; i++) {
      const az = (i / N) * 360 - 180, A = az * D2R, alt = ridge(L, az) * D2R;
      const x = Math.sin(A) * L.radius, z = -Math.cos(A) * L.radius;
      pos.push(x, Math.tan(alt) * L.radius, z, x, -L.radius * 2.5, z);
      colr.push(ct.r, ct.g, ct.b, cb.r, cb.g, cb.b);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    return m;
  }
  /** a flat silhouette standing on the near ridge at az, facing the observer; shape units = degrees. */
  function standee(shape, az, altBase, material, r = H.near.radius - 1.5) {
    const k = r * D2R;
    const g = new THREE.ShapeGeometry(shape, 12);
    g.scale(k, k, 1);
    const m = new THREE.Mesh(g, material);
    const A = az * D2R;
    m.position.set(Math.sin(A) * r, Math.tan(altBase * D2R) * r, -Math.cos(A) * r);
    m.lookAt(0, m.position.y, 0);
    m.frustumCulled = false;
    return m;
  }
  /** horizon() -> Group: far hills (haze-lit), near hills, firs + round trees, an observatory with a warm slit. */
  function horizon() {
    const g = new THREE.Group(); g.name = "horizon";
    g.add(band(H.far, H.far.color, P.hillNear));
    g.add(band(H.near, H.near.color, H.near.color));
    const black = new THREE.MeshBasicMaterial({ color: lin(H.near.color), side: THREE.DoubleSide });
    for (const tr of H.trees) {
      const s = new THREE.Shape(), h = tr.h, base = ridge(H.near, tr.az) - 0.4;
      if (tr.kind === "fir") {
        const w = h * 0.34;
        s.moveTo(-0.06 * w, 0); s.lineTo(-0.06 * w, h * 0.12);
        for (let k = 0; k < 4; k++) { const y0 = h * (0.12 + k * 0.2), ww = w * (1 - k * 0.22); s.lineTo(-ww, y0); s.lineTo(-ww * 0.35, y0 + h * 0.2); }
        s.lineTo(0, h);
        for (let k = 3; k >= 0; k--) { const y0 = h * (0.12 + k * 0.2), ww = w * (1 - k * 0.22); s.lineTo(ww * 0.35, y0 + h * 0.2); s.lineTo(ww, y0); }
        s.lineTo(0.06 * w, h * 0.12); s.lineTo(0.06 * w, 0); s.closePath();
      } else {
        const rr = h * 0.3;
        s.moveTo(-0.05 * h, 0); s.lineTo(0.05 * h, 0); s.lineTo(0.05 * h, h * 0.5); s.lineTo(-0.05 * h, h * 0.5); s.closePath();
        const crown = [[0, h - rr, rr], [-rr * 0.75, h - rr * 1.5, rr * 0.8], [rr * 0.8, h - rr * 1.45, rr * 0.75]].map(([cx, cy, cr]) => { const c = new THREE.Shape(); c.absarc(cx, cy, cr, 0, Math.PI * 2, false); return c; });
        for (const c of crown) g.add(standee(c, tr.az, base, black));
      }
      g.add(standee(s, tr.az, base, black));
    }
    // observatory: drum building + dome with an open, warmly lit slit and two small windows
    const O = H.observatory, w = O.size, base = ridge(H.near, O.az) - 0.3;
    const bld = new THREE.Shape();
    bld.moveTo(-w * 0.62, 0); bld.lineTo(-w * 0.62, w * 0.55); bld.lineTo(-w * 0.5, w * 0.55);
    bld.absarc(0, w * 0.55, w * 0.5, Math.PI, 0, true);
    bld.lineTo(w * 0.62, w * 0.55); bld.lineTo(w * 0.62, w * 0.3);
    bld.lineTo(w * 1.5, w * 0.3); bld.lineTo(w * 1.5, 0); bld.closePath();
    g.add(standee(bld, O.az, base, black));
    const glow = new THREE.MeshBasicMaterial({ color: lin(O.slit).multiplyScalar(O.slitLevel), side: THREE.DoubleSide });
    const slit = new THREE.Shape();
    slit.moveTo(-w * 0.055, w * 0.6); slit.lineTo(w * 0.055, w * 0.6); slit.lineTo(w * 0.07, w * 1.02); slit.lineTo(-w * 0.04, w * 1.03); slit.closePath();
    const sm = standee(slit, O.az, base, glow, H.near.radius - 1.6); sm.renderOrder = 1; g.add(sm);
    const win = new THREE.MeshBasicMaterial({ color: lin(O.window).multiplyScalar(0.9), side: THREE.DoubleSide });
    for (const wx of [0.85, 1.2]) {
      const q = new THREE.Shape(); q.moveTo(w * wx, w * 0.1); q.lineTo(w * (wx + 0.12), w * 0.1); q.lineTo(w * (wx + 0.12), w * 0.2); q.lineTo(w * wx, w * 0.2); q.closePath();
      const qm = standee(q, O.az, base, win, H.near.radius - 1.6); qm.renderOrder = 1; g.add(qm);
    }
    return g;
  }

  // -------------------------------------------------------------------------------------------- text on the sky
  /** textCanvas(text, { font, px, weight, italic, tracking, rule }) -> { canvas, w, h }: white glyphs, integer positions. */
  function textCanvas(text, o) {
    const fontStr = `${o.italic ? "italic " : ""}${o.weight ?? 400} ${o.px}px ${o.font}`;
    const scratch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    scratch.font = fontStr;
    const tr = (o.tracking ?? 0) * o.px;
    const chars = [...text], widths = chars.map((ch) => scratch.measureText(ch).width);
    const tw = widths.reduce((s, w) => s + w, 0) + tr * (chars.length - 1);
    const pad = R0(o.px * 0.35), ruleH = o.rule ? R0(o.px * 0.42) : 0;
    const W = Math.ceil(tw + pad * 2), Hh = Math.ceil(o.px * 1.32 + ruleH + pad * 0.6);
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = Hh;
    const x = canvas.getContext("2d", { willReadFrequently: true });
    x.clearRect(0, 0, W, Hh);
    x.font = fontStr; x.fillStyle = "#ffffff"; x.textBaseline = "alphabetic"; x.textAlign = "left";
    let cx = pad;
    const base = R0(pad * 0.3 + o.px * 1.0);
    chars.forEach((ch, i) => { x.fillText(ch, R0(cx), base); cx += widths[i] + tr; });
    if (o.rule) {
      const y = R0(base + o.px * 0.3), mid = R0(W / 2), d = R0(o.px * 0.12);
      x.fillRect(pad, y, mid - pad - d * 2, Math.max(1, R0(o.px * 0.04)));
      x.fillRect(mid + d * 2, y, W - pad - mid - d * 2, Math.max(1, R0(o.px * 0.04)));
      x.beginPath(); x.moveTo(mid, y - d); x.lineTo(mid + d, y); x.lineTo(mid, y + d); x.lineTo(mid - d, y); x.closePath(); x.fill();
    }
    return { canvas, w: W, h: Hh };
  }
  const LABEL_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const LABEL_FS = /* glsl */ `
    uniform sampler2D uMap; uniform vec3 uColor; uniform float uLevel, uReveal, uSoft; varying vec2 vUv;
    void main(){
      float a = texture2D(uMap, vUv).a;
      float m = 1.0 - smoothstep(uReveal - uSoft, uReveal, vUv.x);
      float e = (vUv.x - (uReveal - uSoft * 0.5)) / (uSoft * 0.5);
      float pen = exp(-e * e);
      gl_FragColor = vec4(uColor * uLevel * a * m * (1.0 + 1.6 * pen), 1.0);
      #include <colorspace_fragment>
    }`;
  /**
   * skyLabel(text, { font, px, weight, italic, tracking, rule, heightDeg, color, level }) -> Mesh (plane, 1 x 1 scaled to the
   *   label's angular size at RAD.labels). userData: { aspect, widthDeg, setReveal(u 0..1), setLevel(k), place(dir, up, anchor) }.
   */
  function skyLabel(text, o) {
    const { canvas, w, h } = textCanvas(text, o);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
    uploadTexture(stage, tex);
    const soft = o.soft ?? 0.06;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uColor: { value: lin(o.color) }, uLevel: { value: o.level ?? 1 }, uReveal: { value: 1 + soft * 3 }, uSoft: { value: soft } },
      vertexShader: LABEL_VS, fragmentShader: LABEL_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 4; mesh.frustumCulled = false; mesh.name = `label:${text}`;
    const hDeg = o.heightDeg * (h / (o.px * 1.32)), aspect = w / h, base = o.level ?? 1;
    const r = RAD.labels;
    const m4 = new THREE.Matrix4();
    Object.assign(mesh.userData, {
      aspect, heightDeg: hDeg, widthDeg: hDeg * aspect,
      setReveal(u) { mat.uniforms.uReveal.value = u >= 1 ? 1 + soft * 3 : -soft + u * (1 + soft * 2); },
      setLevel(k) { mat.uniforms.uLevel.value = base * k; mesh.visible = k > 0.002; },
      /** place on the sphere: dir = label anchor (celestial local), up = local up hint, anchor: "c" centre | "l" left edge | "r" right edge */
      place(dir, up, anchor = "c") {
        let d = v3.norm(dir);
        const U0 = v3.norm(v3.sub(up, v3.mul(d, v3.dot(up, d)))), Z0 = v3.mul(d, -1), X0 = v3.cross(U0, Z0);
        const half = (hDeg * aspect * D2R) / 2;
        if (anchor === "l") d = v3.norm(v3.add(d, v3.mul(X0, Math.tan(half))));
        if (anchor === "r") d = v3.norm(v3.add(d, v3.mul(X0, -Math.tan(half))));
        const U = v3.norm(v3.sub(U0, v3.mul(d, v3.dot(U0, d)))), Z = v3.mul(d, -1), X = v3.cross(U, Z);
        m4.makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...U), new THREE.Vector3(...Z));
        mesh.quaternion.setFromRotationMatrix(m4);
        mesh.position.set(d[0] * r, d[1] * r, d[2] * r);
        const k = r * D2R;
        mesh.scale.set(hDeg * aspect * k, hDeg * k, 1);
        return mesh;
      },
    });
    return mesh;
  }

  // -------------------------------------------------------------------------------------------- hero stars
  /** heroStars(plan) -> Points (child of the spinning group): every constellation star; userData.update(t). */
  function heroStars(plan) {
    const Hh = S.hero, list = plan.constellations.flatMap((c) => c.stars.map((st) => ({ c, st })));
    const n = list.length, pos = new Float32Array(n * 3), hi = new Float32Array(n), base = new Float32Array(n), ph = new Float32Array(n);
    list.forEach(({ st }, i) => {
      pos.set(v3.mul(st.dir, RAD.stars * 0.996), i * 3);
      base[i] = clamp(1.25 - 0.18 * st.mag, 0.6, 1.5); ph[i] = i * 1.731;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const aHi = new THREE.BufferAttribute(hi, 1); aHi.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aHi", aHi);
    g.setAttribute("aBase", new THREE.BufferAttribute(base, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uScale: { value: pxScale }, uBaseSize: { value: Hh.base }, uSize: { value: Hh.size },
        uI0: { value: Hh.baseIntensity }, uI1: { value: Hh.intensity }, uCore: { value: lin(Hh.color) }, uHalo: { value: lin(Hh.halo) }, uSpk: { value: Hh.spikes },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uScale, uBaseSize, uSize; attribute float aHi, aBase, aPhase;
        varying float vHi, vBase, vPx, vTw;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vHi = aHi; vBase = aBase;
          vTw = 1.0 + 0.12 * sin(uTime * 2.1 + aPhase) * sin(uTime * 3.37 + aPhase * 1.9);
          vPx = (uBaseSize * aBase + 6.0 + uSize * min(aHi, 1.7)) * uScale;
          gl_PointSize = vPx;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uI0, uI1, uSpk; uniform vec3 uCore, uHalo; varying float vHi, vBase, vPx, vTw;
        void main(){
          vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d);
          if (r2 > 1.0) discard;
          vec2 p = d * vPx * 0.5; float rp = length(p);
          float hi = min(vHi, 1.7);
          float coreR = 1.1 + 1.6 * min(hi, 1.0);
          float core = exp(-rp * rp / (coreR * coreR));
          float halo = exp(-r2 * 5.0) * 0.5 * hi;
          float spk = (exp(-abs(p.y) / 0.7) * exp(-abs(p.x) / (vPx * 0.16)) + exp(-abs(p.x) / 0.7) * exp(-abs(p.y) / (vPx * 0.16))) * uSpk * hi;
          vec3 c = uCore * core * (uI0 * vBase + uI1 * hi) * vTw + uHalo * (halo + spk) * (0.6 + 0.4 * vTw);
          gl_FragColor = vec4(c * (1.0 - smoothstep(0.7, 1.0, r2)), 1.0);
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(g, mat);
    pts.name = "heroStars"; pts.frustumCulled = false; pts.renderOrder = 3;
    pts.userData.update = (t) => {
      mat.uniforms.uTime.value = t;
      list.forEach(({ st }, i) => { hi[i] = sky.starHighlight(plan, st, t); });
      aHi.needsUpdate = true;
    };
    return pts;
  }

  // -------------------------------------------------------------------------------------------- constellation
  /** constellation(plan, con) -> Group (child of the spinning group): rings, stick lines, engraved figure, plate, star names. */
  function constellation(plan, con) {
    const Ls = S.lines, g = new THREE.Group(); g.name = `constellation:${con.id}`;
    const r = RAD.lines;
    const lineClock = sky.plotClock(con.lines), ringClock = sky.plotClock(con.rings);
    const lines = screenLines(stage, con.lines.map((l) => l.pts.map((d) => v3.mul(d, r))), { width: Ls.width, color: Ls.color, level: Ls.level, windows: lineClock.windows, name: "starLines" });
    const rings = screenLines(stage, con.rings.map((l) => l.pts.map((d) => v3.mul(d, r))), { width: Ls.ringWidth, color: Ls.color, level: Ls.ringLevel, windows: ringClock.windows, name: "starRings" });
    const F = S.figure;
    const figure = screenLines(stage, con.figure.map((pl) => pl.map((d) => v3.mul(d, r * 1.002))), { width: F.width, color: F.color, level: F.level, order: "parallel", name: "figure" });
    g.add(figure, rings, lines);
    const up = con.frame.U;
    const Pl = S.plate;
    const plate = skyLabel(con.name, { font: Pl.font, px: 96, weight: Pl.weight, tracking: Pl.tracking, rule: true, heightDeg: Pl.heightDeg, color: Pl.color, level: Pl.level, soft: Pl.soft });
    plate.userData.place(con.plate.dir, up, "c");
    g.add(plate);
    const Nm = S.names;
    const names = con.stars.map((st) => {
      if (!st.name) return null;
      const lab = skyLabel(st.name, { font: Nm.font, px: 72, weight: Nm.weight, italic: Nm.italic, heightDeg: Nm.heightDeg, color: Nm.color, level: Nm.level });
      const side = st.side === "l" ? -1 : 1;
      const right = v3.norm(v3.cross(st.dir, up));   // screen-right at the star for a viewer at the centre (as tangentBasis)
      const off = Math.tan((Nm.offsetDeg + (st.mag < 1 ? 0.25 : 0)) * D2R) * side;
      const anchor = v3.norm(v3.add(v3.add(st.dir, v3.mul(right, off)), v3.mul(up, -Math.tan(Nm.heightDeg * 0.12 * D2R))));
      lab.userData.place(anchor, up, side > 0 ? "l" : "r");
      lab.userData.setLevel(0);
      g.add(lab);
      return lab;
    });
    g.userData = {
      lines, rings, figure, plate, names,
      update(t) {
        const fin = smoothstep(plan.finale, plan.finale + 0.8, t);
        lines.userData.setProgress(lineClock.p(t)); lines.userData.setLevel(1 + 0.2 * fin);
        rings.userData.setProgress(ringClock.p(t)); rings.userData.setLevel(1 + 0.2 * fin);
        const fs = sky.figureState(plan, con, t);
        figure.userData.setProgress(fs.draw); figure.userData.setLevel(fs.level * (1 + 0.25 * fin));
        const pw = sky.plateState(plan, con, t);
        plate.userData.setReveal(pw); plate.userData.setLevel(t >= con.plateAt ? 1 + 0.15 * fin : 0);
        con.stars.forEach((st, i) => { if (names[i]) names[i].userData.setLevel(smoothstep(st.lit + 0.1, st.lit + 0.1 + Nm.fade, t)); });
      },
    };
    return g;
  }

  /** link(plan, lk) -> screenLines (child of the spinning group): a dashed gold great circle between two constellations. */
  function link(plan, lk) {
    const Lk = S.link;
    const l = screenLines(stage, [lk.pts.map((d) => v3.mul(d, RAD.lines))], { width: Lk.width, color: Lk.color, level: Lk.level, dash: Lk.dash, name: `link${lk.k}` });
    l.userData.update = (t) => { l.userData.setProgress(sky.progress(t, lk.at, lk.end)); l.userData.setLevel(1 + 0.2 * smoothstep(plan.finale, plan.finale + 0.8, t)); };
    return l;
  }

  // -------------------------------------------------------------------------------------------- pointer (world)
  /** pointer(plan) -> Group (world): the presenter's arrow spot on the dome + a faint beam back to the presenter. */
  function pointer(plan) {
    const Pt = S.pointer, L = Pt.lengthDeg, hl = L * 0.42, hw = Pt.widthDeg / 2, sw = Pt.widthDeg * 0.17;
    const sh = new THREE.Shape();
    const pts = [[0, 0], [-hl, hw], [-hl, sw], [-L, sw], [-L, -sw], [-hl, -sw], [-hl, -hw]];
    const ang = 38 * D2R, ca = Math.cos(ang), sa = Math.sin(ang);
    const rot = ([x, y]) => [x * ca - y * sa, x * sa + y * ca];
    pts.map(rot).forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const r = RAD.labels * 0.98, k = r * D2R;
    const geo = new THREE.ShapeGeometry(sh); geo.scale(k, k, 1);
    const mat = new THREE.MeshBasicMaterial({ color: lin(Pt.color).multiplyScalar(Pt.intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const arrow = new THREE.Mesh(geo, mat);
    arrow.renderOrder = 6; arrow.frustumCulled = false; arrow.name = "pointerArrow";
    const tailLocal = rot([-L, 0]);
    const beam = screenLines(stage, [[Pt.beam.origin, [0, 0, -r]]], { width: Pt.beam.width, color: Pt.color, level: Pt.beam.level, depth: "none", name: "pointerBeam" });
    const g = new THREE.Group(); g.name = "pointer"; g.add(arrow, beam);
    const m4 = new THREE.Matrix4();
    g.userData.update = (t) => {
      const ps = sky.pointerState(plan, t);
      arrow.visible = ps.vis > 0.002; beam.visible = arrow.visible;
      if (!arrow.visible) return;
      const w = sky.toWorld(S, ps.dir, t);
      const { R, U } = sky.tangentBasis(w);
      const wob = Pt.wobbleDeg * D2R;
      const ox = Math.sin(t * 5.3) * wob + Math.sin(t * 8.9 + 1.3) * wob * 0.5, oy = Math.sin(t * 6.1 + 0.7) * wob;
      const gp = Math.tan(Pt.gapDeg * D2R) * 0.7071;
      const tip = v3.norm(v3.add(w, v3.add(v3.mul(R, -gp + ox), v3.mul(U, -gp + oy))));
      const tb = sky.tangentBasis(tip);
      m4.makeBasis(new THREE.Vector3(...tb.R), new THREE.Vector3(...tb.U), new THREE.Vector3(...v3.mul(tip, -1)));
      arrow.quaternion.setFromRotationMatrix(m4);
      arrow.position.set(tip[0] * r, tip[1] * r, tip[2] * r);
      mat.opacity = ps.vis;
      const tail = v3.add(v3.mul(tip, r), v3.add(v3.mul(tb.R, tailLocal[0] * k), v3.mul(tb.U, tailLocal[1] * k)));
      beam.userData.setPolys([[Pt.beam.origin, tail]]);
      beam.userData.setLevel(ps.vis * (0.55 + 0.45 * ps.moving));
    };
    return g;
  }

  /** shootingStar(plan, k) -> screenLines (world): a short bright streak on a great circle, planned in skyplan. */
  function shootingStar(plan, k) {
    const Sh = S.shooting, N = 24, r = RAD.stars * 0.99;
    const l = screenLines(stage, [Array.from({ length: N + 1 }, () => [0, 0, -r])], { width: Sh.width, color: Sh.color, level: Sh.level, capacity: N, name: `shooting${k}` });
    l.userData.update = (t) => {
      const s = sky.shootingState(plan, k, t);
      l.visible = !!s;
      if (!s) return;
      const pts = Array.from({ length: N + 1 }, (_, q) => v3.mul(sky.slerp(s.tail, s.head, q / N), r));
      l.userData.setPolys([pts]);
      l.userData.setLevel(s.vis);
    };
    return l;
  }

  // -------------------------------------------------------------------------------------------- caption (overlay)
  /** caption(texts[]) -> { meshes, show(index | -1, alpha) }: an atlas cartouche (dark panel, double gold rule, star). */
  function caption(texts) {
    const Q = S.caption;
    const meshes = texts.map((text, i) => {
      const fontStr = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const scratch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      scratch.font = fontStr;
      const tr = Q.cap * 0.06, chars = [...text], widths = chars.map((c) => scratch.measureText(c).width);
      const tw = widths.reduce((s, w) => s + w, 0) + tr * (chars.length - 1);
      const Wp = Math.min(1700, R0(tw + Q.cap * 3.4)), Hp = Q.h;
      const m = screenCanvas(stage, Wp, Hp, (x, W, Hh) => {
        x.fillStyle = Q.panel; x.fillRect(0, 0, W, Hh);
        x.strokeStyle = Q.rule; x.lineWidth = 2; x.strokeRect(5, 5, W - 10, Hh - 10);
        x.lineWidth = 1; x.globalAlpha = 0.7; x.strokeRect(11, 11, W - 22, Hh - 22); x.globalAlpha = 1;
        // four-point star ornament on the left
        const sx = R0(Q.cap * 0.95), sy = R0(Hh / 2), a = R0(Q.cap * 0.32), b = R0(Q.cap * 0.08);
        x.fillStyle = Q.star; x.beginPath();
        x.moveTo(sx, sy - a); x.lineTo(sx + b, sy - b); x.lineTo(sx + a, sy); x.lineTo(sx + b, sy + b); x.lineTo(sx, sy + a); x.lineTo(sx - b, sy + b); x.lineTo(sx - a, sy); x.lineTo(sx - b, sy - b); x.closePath(); x.fill();
        x.font = fontStr; x.fillStyle = Q.ink; x.textBaseline = "alphabetic"; x.textAlign = "left";
        let cx = R0(Q.cap * 1.75);
        const by = R0(Hh / 2 + Q.cap * 0.34);
        chars.forEach((ch, k) => { x.fillText(ch, R0(cx), by); cx += widths[k] + tr; });
      }, { upload: true });
      m.userData.place(Q.x, Q.y);
      m.userData.set({ text });
      m.userData.opacity(0);
      return m;
    });
    return { meshes, show(index, a) { meshes.forEach((m, i) => m.userData.opacity(i === index ? a : 0)); } };
  }

  // -------------------------------------------------------------------------------------------- assembly
  /**
   * starChart(plan) -> { group, sphere, parts, update(t) }: the whole planetarium from one skyplan plan — dome, turning
   *   sphere (Milky Way, catalogue, trails, grid, ecliptic, hero stars, constellations, links), horizon, pointer,
   *   shooting stars. update(t) only reads the plan.
   */
  function starChart(plan) {
    const group = new THREE.Group(); group.name = "starChart";
    const dome = skyDome();
    const sphere = turningSphere();
    const cat = sky.catalogue(S);
    const mw = milkyWay(plan.milkyWayPole);
    const stars = catalogue(cat);
    const tr = trails(cat);
    const gr = grid();
    const ec = ecliptic(plan.eclipticPole);
    const hero = heroStars(plan);
    const cons = plan.constellations.map((c) => constellation(plan, c));
    const links = plan.links.map((lk) => link(plan, lk));
    sphere.inner.add(mw, stars, tr, gr, ec, ...cons, ...links, hero);
    const hz = horizon();
    const ptr = pointer(plan);
    const shoots = plan.shooting.map((_, k) => shootingStar(plan, k));
    group.add(dome, sphere.outer, hz, ptr, ...shoots);
    stage.scene.add(group);
    function update(t) {
      sphere.update(t);
      stars.userData.update(t);
      tr.userData.update(t);
      const G = plan.grid, E = plan.ecliptic, fin = smoothstep(plan.finale, plan.finale + 0.8, t);
      gr.userData.setDraw(G ? sky.progress(t, G.at, G.at + G.dur) : 1, 1 + 0.15 * fin);
      ec.userData.setDraw(E ? sky.progress(t, E.at, E.at + E.dur) : 1, 1 + 0.15 * fin);
      hero.userData.update(t);
      cons.forEach((c) => c.userData.update(t));
      links.forEach((l) => l.userData.update(t));
      ptr.userData.update(t);
      shoots.forEach((s) => s.userData.update(t));
    }
    return { group, sphere, catalogue: cat, parts: { dome, mw, stars, trails: tr, grid: gr, ecliptic: ec, hero, constellations: cons, links, horizon: hz, pointer: ptr, shooting: shoots }, update };
  }

  const props = { skyDome, turningSphere, milkyWay, catalogue, trails, grid, ecliptic, horizon, heroStars, constellation, link, pointer, shootingStar, skyLabel, caption, starChart };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props,
    factories: {},
    sfx: spec.sfx,
    plan: sky, motion: sky,
    helpers: { textCanvas, FONT_FACES, FIGURES: sky.FIGURES },
  };
}
