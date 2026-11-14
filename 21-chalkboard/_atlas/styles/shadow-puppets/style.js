// styles/shadow-puppets/style.js — a shadow theatre. The cloth is a self-lit shader surface; what it shows is a
// TRANSMISSION MAP rendered every frame by the shadow projector: one full-cloth quad per caster (puppet part, scenery,
// title, rod), multiplied together. Each caster's quad maps every cloth point back along the ray to the lamp into the
// caster's own plane and reads a baked signed-distance field of its outline; the soft-edge width there is 2 r (1 - s)
// (lamp radius r, s = where the ray crosses the caster), i.e. the true disc-lamp penumbra. Gel windows carry a colour.
// Everything is a pure function of the poses the scene passes in (planner: puppetry.js). No shadow maps are used.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { uploadTexture } from "../../kit/textures.js";
import { clamp, smoothstep, toEase } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as puppetry from "./puppetry.js";
export { STYLE_SPEC };

const D2R = Math.PI / 180;
const INF = 1e20;

// ------------------------------------------------------------------ exact Euclidean distance transform (Felzenszwalb) with nearest-site index
function edt1d(f, n, d, arg, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    arg[q] = v[k];
  }
}
/** edt(sites Uint8Array, w, h) -> { dist Float32Array (px), near Int32Array (index of nearest site pixel, -1 if none) } */
function edt(sites, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), arg = new Int32Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const d1 = new Float64Array(w * h), ax = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = sites[y * w + x] ? 0 : INF;
    edt1d(f, w, d, arg, v, z);
    for (let x = 0; x < w; x++) { d1[y * w + x] = d[x]; ax[y * w + x] = arg[x]; }
  }
  const dist = new Float32Array(w * h), near = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d1[y * w + x];
    edt1d(f, h, d, arg, v, z);
    for (let y = 0; y < h; y++) {
      const yy = arg[y];
      dist[y * w + x] = d[y] >= INF * 0.5 ? INF : Math.sqrt(d[y]);
      near[y * w + x] = d[y] >= INF * 0.5 ? -1 : yy * w + ax[yy * w + x];
    }
  }
  return { dist, near };
}

/**
 * createStyle(stage, opts?) -> style
 *   style.props: screen, lamp, puppet, scenery, titleCut, caption, label
 *   style.projector (the shadow projector), style.plan (puppetry.js), style.update({ t, lamp, ripple }), style.render(t)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const S = spec.screen, P = spec.projector, C = spec.cloth;
  const clothCY = S.bottom + S.height / 2;
  const gelColour = (g) => (g == null ? spec.gels.plain : spec.gels[g] ?? g);

  // ---------------------------------------------------------------- shared lamp state (uniform objects shared by every caster + the cloth)
  const lampU = { pos: { value: new THREE.Vector3(spec.lamp.x, spec.lamp.y, spec.lamp.z) }, r: { value: spec.lamp.r } };
  const lampState = { ...spec.lamp };

  // ================================================================= bake: cut-out -> SDF textures
  /**
   * bakeCut(cut, { margin }) -> { sdf (HalfFloat RGBA: r = outline SDF, g = hole SDF, metres, negative inside), gel (RGBA8 sRGB:
   *   colour of the nearest window), bounds [x0,y0,x1,y1] (local metres), alpha (canvas: card with windows cut), gelCanvas, holeMask }
   *   cut = { fill: [poly], strokes: [{ pts, w }], holes: [{ poly, gel }] }  (puppetry.cut helpers)
   */
  function bakeCut(cut, o = {}) {
    const margin = o.margin ?? 0.08;
    const b = puppetry.cutBounds(cut, margin);
    const w = b[2] - b[0], h = b[3] - b[1];
    const ppm = Math.min(P.bakePxPerMetre, P.bakeMax / Math.max(w, h));
    const W = Math.max(8, Math.ceil(w * ppm)), H = Math.max(8, Math.ceil(h * ppm));
    const X = (x) => (x - b[0]) * ppm, Y = (y) => (b[3] - y) * ppm;
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const path = (ctx, poly) => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath(); };
    const drawSil = (ctx, color) => {
      ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const poly of cut.fill ?? []) { path(ctx, poly); ctx.fill("nonzero"); }
      for (const s of cut.strokes ?? []) {
        ctx.lineWidth = s.w * ppm; ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
        ctx.stroke();
      }
    };
    // silhouette (no windows)
    const sil = mk(), sctx = sil.getContext("2d");
    sctx.fillStyle = "#000"; sctx.fillRect(0, 0, W, H); drawSil(sctx, "#fff");
    // windows with their gel colours
    const holes = mk(), hctx = holes.getContext("2d");
    for (const hl of cut.holes ?? []) { hctx.fillStyle = gelColour(hl.gel); path(hctx, hl.poly); hctx.fill(); }
    const sd = sctx.getImageData(0, 0, W, H).data, hd = hctx.getImageData(0, 0, W, H).data;
    const N = W * H, inS = new Uint8Array(N), outS = new Uint8Array(N), inH = new Uint8Array(N), outH = new Uint8Array(N);
    let anyHole = false;
    for (let i = 0; i < N; i++) {
      const s = sd[i * 4] >= 128, hh = hd[i * 4 + 3] >= 128 && s;
      inS[i] = s ? 1 : 0; outS[i] = s ? 0 : 1; inH[i] = hh ? 1 : 0; outH[i] = hh ? 0 : 1; if (hh) anyHole = true;
    }
    const toIn = edt(inS, W, H), toOut = edt(outS, W, H);
    const hIn = anyHole ? edt(inH, W, H) : null, hOut = anyHole ? edt(outH, W, H) : null;
    const f32 = new Float32Array(N * 4), rgba = new Uint8Array(N * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, j = (H - 1 - y) * W + x; // texture row 0 = bottom (v up)
      let dS = inS[i] ? -(toOut.dist[i] - 0.5) : toIn.dist[i] - 0.5;
      let dH = !anyHole ? 10 * ppm : inH[i] ? -(hOut.dist[i] - 0.5) : hIn.dist[i] - 0.5;
      // sub-pixel edge from the canvas anti-aliasing (removes the EDT staircase on crisp, near-cloth shadows)
      const aS = sd[i * 4] / 255, aH = sd[i * 4] >= 128 ? hd[i * 4 + 3] / 255 : 0;
      if (aS > 0.02 && aS < 0.98 && Math.abs(dS) <= 1) dS = 0.5 - aS;
      if (anyHole && aH > 0.02 && aH < 0.98 && Math.abs(dH) <= 1) dH = 0.5 - aH;
      f32[j * 4] = dS / ppm; f32[j * 4 + 1] = Math.min(dH / ppm, 10); f32[j * 4 + 2] = 0; f32[j * 4 + 3] = 1;
      const k = anyHole ? (inH[i] ? i : hIn.near[i]) : -1;
      if (k >= 0) { rgba[j * 4] = hd[k * 4]; rgba[j * 4 + 1] = hd[k * 4 + 1]; rgba[j * 4 + 2] = hd[k * 4 + 2]; }
      else { rgba[j * 4] = rgba[j * 4 + 1] = rgba[j * 4 + 2] = 255; }
      rgba[j * 4 + 3] = 255;
    }
    const u16 = new Uint16Array(N * 4);
    for (let i = 0; i < N * 4; i++) u16[i] = THREE.DataUtils.toHalfFloat(f32[i]);
    const sdf = new THREE.DataTexture(u16, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    const gel = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    for (const t of [sdf, gel]) {
      t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    }
    gel.colorSpace = THREE.SRGBColorSpace;
    uploadTexture(stage, sdf, gel); // upload at build, never lazily mid-seek
    // the physical card (alpha: card with windows cut) and its gel film, for the real cut-out meshes behind the cloth
    const alpha = mk(), actx = alpha.getContext("2d");
    actx.fillStyle = "#000"; actx.fillRect(0, 0, W, H); drawSil(actx, "#fff");
    for (const hl of cut.holes ?? []) { actx.fillStyle = "#000"; path(actx, hl.poly); actx.fill(); }
    const mask = mk(), mctx = mask.getContext("2d");
    mctx.fillStyle = "#000"; mctx.fillRect(0, 0, W, H);
    for (const hl of cut.holes ?? []) if (hl.gel && hl.gel !== "plain") { mctx.fillStyle = "#fff"; path(mctx, hl.poly); mctx.fill(); }
    return { sdf, gel, bounds: b, W, H, ppm, alpha, gelCanvas: holes, holeMask: mask, anyGel: (cut.holes ?? []).some((hl) => hl.gel && hl.gel !== "plain") };
  }

  // ================================================================= the shadow projector
  const casterVS = /* glsl */ `
    varying vec2 vW;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xy; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const casterFS = /* glsl */ `
    uniform mat4 uInv; uniform vec3 uLamp; uniform float uLampR, uMinW, uDensity, uCardT, uGelGain;
    uniform sampler2D uSdf; uniform sampler2D uGel; uniform vec4 uBounds; uniform int uMode; uniform vec4 uSeg; uniform float uRodR;
    varying vec2 vW;
    void main() {
      vec3 lp = (uInv * vec4(uLamp, 1.0)).xyz;
      vec3 pp = (uInv * vec4(vW, 0.0, 1.0)).xyz;
      float den = pp.z - lp.z;
      if (abs(den) < 1e-6) { gl_FragColor = vec4(1.0); return; }
      float s = -lp.z / den;                       // where the lamp->cloth ray crosses the caster plane (0 lamp .. 1 cloth)
      if (s <= 0.0 || s >= 1.0) { gl_FragColor = vec4(1.0); return; }
      vec2 q = (lp + s * (pp - lp)).xy;            // caster-local hit point
      float w = max(2.0 * uLampR * (1.0 - s), uMinW * s); // full penumbra width in caster metres (min = cloth diffusion)
      vec3 T;
      if (uMode == 1) {
        vec2 a = uSeg.xy, b = uSeg.zw, pa = q - a, ba = b - a;
        float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
        float d = length(pa - ba * hh) - uRodR;
        float occ = 1.0 - smoothstep(-0.5 * w, 0.5 * w, d);
        T = vec3(1.0 - occ * (1.0 - uCardT));
      } else {
        vec2 size = uBounds.zw - uBounds.xy;
        vec2 uv = (q - uBounds.xy) / size;
        vec2 uvc = clamp(uv, 0.0, 1.0);
        float ext = length((uv - uvc) * size);
        vec4 sd = texture2D(uSdf, uvc);
        float inO = 1.0 - smoothstep(-0.5 * w, 0.5 * w, sd.r + ext);
        float inH = 1.0 - smoothstep(-0.5 * w, 0.5 * w, sd.g + ext);
        vec3 gel = texture2D(uGel, uvc).rgb * uGelGain;
        T = mix(vec3(1.0), mix(vec3(uCardT), gel, inH), inO);
      }
      gl_FragColor = vec4(mix(vec3(1.0), T, uDensity), 1.0);
    }`;

  function createProjector() {
    const Wr = S.width + 2 * P.margin, Hr = S.height + 2 * P.margin;
    const rt = new THREE.WebGLRenderTarget(P.rt[0], P.rt[1], { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    rt.texture.name = "shadow-transmission";
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-Wr / 2, Wr / 2, Hr / 2, -Hr / 2, -10, 10);
    cam.position.set(0, clothCY, 5);
    cam.lookAt(0, clothCY, 0);
    scene.add(cam);
    const quad = new THREE.PlaneGeometry(Wr, Hr);
    const casters = [];
    const white = new THREE.Color(1, 1, 1);
    const rect = new THREE.Vector4(-Wr / 2, clothCY - Hr / 2, Wr, Hr);
    function addCaster({ obj, bake = null, rod = null, density = () => 1, name = "caster" }) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: casterVS, fragmentShader: casterFS,
        uniforms: {
          uInv: { value: new THREE.Matrix4() }, uLamp: lampU.pos, uLampR: lampU.r, uMinW: { value: P.minWidth },
          uDensity: { value: 1 }, uCardT: { value: P.cardT }, uGelGain: { value: P.gelGain },
          uSdf: { value: bake?.sdf ?? null }, uGel: { value: bake?.gel ?? null },
          uBounds: { value: new THREE.Vector4(...(bake?.bounds ?? [0, 0, 1, 1])) },
          uMode: { value: rod ? 1 : 0 }, uSeg: { value: new THREE.Vector4(0, 0, 0, -1) }, uRodR: { value: rod?.r ?? 0.006 },
        },
        transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      });
      const mesh = new THREE.Mesh(quad, mat);
      mesh.position.set(0, clothCY, 0);
      mesh.frustumCulled = false;
      mesh.name = `${name}-shadow`;
      scene.add(mesh);
      const c = { obj, mesh, mat, rod, density };
      casters.push(c);
      return c;
    }
    const inv = new THREE.Matrix4();
    function render() {
      const r = stage.renderer;
      for (const c of casters) {
        const k = clamp(c.density());
        c.mesh.visible = k > 0.002;
        if (!c.mesh.visible) continue;
        c.obj.updateWorldMatrix(true, false);
        inv.copy(c.obj.matrixWorld).invert();
        c.mat.uniforms.uInv.value.copy(inv);
        c.mat.uniforms.uDensity.value = k;
        if (c.rod) c.mat.uniforms.uSeg.value.set(0, 0, 0, -c.rod.len());
      }
      const prevT = r.getRenderTarget(), prevC = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
      r.setRenderTarget(rt);
      r.setClearColor(white, 1);
      r.clear(true, false, false);
      r.render(scene, cam);
      r.setRenderTarget(prevT);
      r.setClearColor(prevC, prevA);
    }
    return { rt, scene, cam, casters, addCaster, render, rect };
  }
  const projector = createProjector();

  // ================================================================= the screen: cloth + frame + wall
  const clothVS = /* glsl */ `
    uniform float uSag, uTime, uRipAmp, uRipLevel, uRipSpeed; uniform vec3 uWaves[3]; uniform vec2 uSize;
    varying vec2 vXY; varying vec3 vWorld; varying vec2 vUv; varying float vRipS; varying vec2 vRipC;
    void main() {
      vUv = uv;
      vec3 p = position;
      vec2 xy = (modelMatrix * vec4(p, 1.0)).xy;
      // travelling ripple (pure f(t)): height sum s, slope c (used for silhouette wobble + faint shading)
      float s = 0.0; vec2 c = vec2(0.0);
      for (int i = 0; i < 3; i++) {
        vec2 d = normalize(uWaves[i].xy); float lam = 1.6 / (1.0 + float(i) * 0.75);
        float ph = 6.2831853 * (dot(d, xy) - uRipSpeed * uTime) / lam + float(i) * 1.7;
        s += uWaves[i].z * sin(ph); c += uWaves[i].z * cos(ph) * d;
      }
      vRipS = s; vRipC = c;
      float edge = sin(3.14159265 * uv.x) * sin(3.14159265 * uv.y);
      p.z += -uSag * sin(3.14159265 * uv.x) * (0.55 + 0.45 * sin(3.14159265 * uv.y)) + uRipAmp * uRipLevel * s * edge;
      vec4 w = modelMatrix * vec4(p, 1.0);
      vWorld = w.xyz; vXY = xy;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const clothFS = /* glsl */ `
    uniform sampler2D uTrans; uniform vec4 uRect; uniform vec2 uSize; uniform vec2 uCenter;
    uniform vec3 uLampPos; uniform vec3 uLampCol; uniform float uLampLevel, uHomeD;
    uniform float uGain, uFalloff, uHotGain, uHotExp, uFloorLevel; uniform vec3 uFloor, uTint;
    uniform float uRipAmp, uRipLevel, uRipShade; uniform vec4 uWeave; uniform float uDrapeFreq; uniform vec2 uHem;
    varying vec2 vXY; varying vec3 vWorld; varying vec2 vUv; varying float vRipS; varying vec2 vRipC;
    float h1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
    void main() {
      float amp = uRipAmp * uRipLevel;
      vec2 sxy = vXY + vRipC * amp;                         // the cloth ripple bends the shadows slightly
      vec3 T = texture2D(uTrans, (sxy - uRect.xy) / uRect.zw).rgb;
      vec3 Ld = vec3(vXY, 0.0) - uLampPos; float dist = max(length(Ld), 1e-3);
      float E = max(Ld.z, 0.0) / dist / (dist * dist) * uHomeD * uHomeD;
      E = pow(max(E, 1e-4), uFalloff);
      vec3 V = normalize(cameraPosition - vWorld);
      float hot = uHotGain * pow(max(dot(Ld / dist, V), 0.0), uHotExp);
      // weave: backlit cloth glows brighter in the gaps between threads; slubbed threads; hanging drape folds
      vec2 lp = vXY - uCenter;
      float pitch = uWeave.x;
      float wx = 0.5 + 0.5 * cos(6.2831853 * lp.x / pitch), wy = 0.5 + 0.5 * cos(6.2831853 * lp.y / pitch);
      float gap = (1.0 - wx) * (1.0 - wy);
      float sx = h1(floor(lp.x / pitch)), sy = h1(floor(lp.y / pitch) + 91.0);
      float weave = 1.0 + uWeave.y * (gap * 2.0 - 0.5) - uWeave.z * ((sx - 0.5) * wx + (sy - 0.5) * wy);
      float top = smoothstep(0.35, 1.0, vUv.y);
      float drape = 1.0 + uWeave.w * top * sin(6.2831853 * uDrapeFreq * lp.x + 1.3 * sin(2.1 * lp.x + 0.4));
      float shade = 1.0 + uRipShade * amp * vRipS;
      // hem: double layer along the edges transmits less
      vec2 e = min(vUv, 1.0 - vUv) * uSize;
      float hem = mix(uHem.y, 1.0, smoothstep(uHem.x - 0.004, uHem.x + 0.004, min(e.x, e.y)));
      vec3 light = uLampCol * (uLampLevel * uGain) * E * (1.0 + hot);
      vec3 col = light * T * uTint * weave * drape * shade * hem + uFloor * uFloorLevel * weave;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const clothUniforms = {
    uTrans: { value: projector.rt.texture }, uRect: { value: projector.rect },
    uSize: { value: new THREE.Vector2(S.width, S.height) }, uCenter: { value: new THREE.Vector2(0, clothCY) },
    uLampPos: lampU.pos, uLampCol: { value: new THREE.Color(spec.lamp.color) }, uLampLevel: { value: spec.lamp.level },
    uHomeD: { value: -spec.lamp.z },
    uGain: { value: C.gain }, uFalloff: { value: C.falloff }, uHotGain: { value: C.hotGain }, uHotExp: { value: C.hotExp },
    uFloor: { value: new THREE.Color(C.floor) }, uFloorLevel: { value: C.floorLevel }, uTint: { value: new THREE.Color(spec.palette.cloth) },
    uSag: { value: S.sag }, uTime: { value: 0 }, uRipAmp: { value: C.ripple.amp }, uRipLevel: { value: 0.35 }, uRipSpeed: { value: C.ripple.speed },
    uRipShade: { value: C.ripple.shade },
    uWaves: { value: C.ripple.waves.map((w) => new THREE.Vector3(...w)) },
    uWeave: { value: new THREE.Vector4(C.weave.pitch, C.weave.amp, C.weave.slub, C.weave.drape) }, uDrapeFreq: { value: C.weave.drapeFreq },
    uHem: { value: new THREE.Vector2(S.hem.width, S.hem.density) },
  };

  /**
   * screen() -> Group: the cloth (self-lit shader showing the projector's transmission map), the wooden frame (side/top
   *   rails, a deep bottom playboard, a cap moulding), tie knots along the hem, a dark wall around the frame and a floor.
   *   userData.cloth (Mesh), userData.box = { min, max } (frame outer box, for framing checks).
   */
  function screen() {
    const g = new THREE.Group();
    g.name = "screen";
    const clothMat = new THREE.ShaderMaterial({ vertexShader: clothVS, fragmentShader: clothFS, uniforms: clothUniforms, side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.height, 96, 52), clothMat);
    cloth.position.set(0, clothCY, 0);
    cloth.name = "cloth";
    g.add(cloth);
    const F = S.frame, dep = F.depth;
    const rail = (w, h, d, x, y, z, m = materials.wood) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z); g.add(mesh); return mesh;
    };
    const top = S.bottom + S.height, outerW = S.width + 2 * F.rail;
    rail(F.rail, S.height + F.rail + F.playboard, dep, -(S.width + F.rail) / 2, (top + F.rail + S.bottom - F.playboard) / 2, 0.0);
    rail(F.rail, S.height + F.rail + F.playboard, dep, (S.width + F.rail) / 2, (top + F.rail + S.bottom - F.playboard) / 2, 0.0);
    rail(outerW, F.rail, dep, 0, top + F.rail / 2, 0.0);
    rail(outerW + 0.08, F.cap, dep + 0.06, 0, top + F.rail + F.cap / 2, 0.01, materials.woodDark);
    rail(outerW + 0.04, F.playboard, dep + 0.08, 0, S.bottom - F.playboard / 2, 0.03);
    rail(outerW + 0.1, F.cap, dep + 0.14, 0, S.bottom - F.playboard + F.cap / 2, 0.04, materials.woodDark);
    rail(outerW + 0.02, 0.03, 0.02, 0, S.bottom - 0.015, dep / 2 + 0.045, materials.woodDark); // lip under the cloth
    // tie knots along the hem (left/right/top edges)
    const knotGeo = new THREE.SphereGeometry(S.ties.size, 8, 6), knotMat = materials.woodDark;
    const knots = [];
    for (let x = -S.width / 2 + 0.2; x <= S.width / 2 - 0.19; x += S.ties.every) knots.push([x, top - 0.012]);
    for (let y = S.bottom + 0.25; y <= top - 0.2; y += S.ties.every) knots.push([-S.width / 2 + 0.012, y], [S.width / 2 - 0.012, y]);
    const inst = new THREE.InstancedMesh(knotGeo, knotMat, knots.length);
    const m4 = new THREE.Matrix4();
    knots.forEach((k, i) => inst.setMatrixAt(i, m4.makeScale(1, 1, 0.5).setPosition(k[0], k[1], 0.012)));
    g.add(inst);
    // wall around the frame (a hole where the frame is, so the space behind the screen stays open) + floor
    const ow = outerW + 0.1, y0 = S.bottom - F.playboard, y1 = top + F.rail + F.cap;
    const wallZ = dep / 2 - 0.006, big = 30; // flush with the frame front: what is behind the screen is only seen through the cloth
    const wallPiece = (x0, x1, ya, yb) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, yb - ya), materials.wall); m.position.set((x0 + x1) / 2, (ya + yb) / 2, wallZ); g.add(m); };
    wallPiece(-big, -ow / 2, 0, 14); wallPiece(ow / 2, big, 0, 14); wallPiece(-ow / 2, ow / 2, y1, 14); wallPiece(-ow / 2, ow / 2, 0, y0);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), materials.woodDark);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0); g.add(floor);
    g.userData = { cloth, box: { min: [-ow / 2, y0, 0], max: [ow / 2, y1, 0] }, clothBox: { min: [-S.width / 2, S.bottom, 0], max: [S.width / 2, top, 0] } };
    return g;
  }

  // ================================================================= the lamp
  /** lamp() -> Group (brass hood + glowing bulb on a stand) placed from the lamp state each frame by style.update. */
  function lamp() {
    const g = new THREE.Group();
    g.name = "lamp";
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.lamp.color).multiplyScalar(3) }));
    g.add(bulb);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.22, 24, 1, true), materials.brass);
    hood.rotation.x = Math.PI / 2; hood.position.z = -0.08; g.add(hood);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8), materials.brass);
    g.add(stand);
    g.userData.place = (st) => {
      g.position.set(st.x, st.y, st.z);
      bulb.scale.setScalar(Math.max(0.02, st.r));
      stand.scale.y = Math.max(0.1, st.y); stand.position.y = -st.y / 2 - 0.1;
    };
    g.userData.place(lampState);
    return g;
  }

  // ================================================================= cut-out puppets
  const D = (a) => (a ?? 0) * D2R;
  /**
   * puppet(design, { name }) -> Group (root: x, y, -depth; rotation z = rot, y = yaw)
   *   design = { parts: { [id]: { cut, parent?, joint:[x,y], rod?:[x,y], rodLean? (deg), rodR? } } }  — every part is drawn in the
   *   puppet's own frame (metres); `joint` is where it hinges on its parent; `rod` is where a control rod attaches.
   *   Each part becomes a real flat card (alpha-cut) with a gel film in its windows AND a caster in the projector.
   *   userData.update(pose) with pose = planner pose { x, y, z, rot, yaw, op, scale, limbs: { part: deg } }.
   *   userData.parts[id] = { pivot, content, bake }.
   */
  function puppet(design, o = {}) {
    const root = new THREE.Group();
    root.name = o.name ?? design.name ?? "puppet";
    const parts = {};
    let op = 1;
    const rods = [];
    for (const [id, pd] of Object.entries(design.parts)) {
      const bake = bakeCut(pd.cut, { margin: pd.margin });
      const parent = pd.parent ? parts[pd.parent] : null;
      const j = pd.joint ?? [0, 0], pj = parent ? parent.joint : [0, 0];
      const pivot = new THREE.Group(); pivot.name = `${root.name}-${id}`;
      pivot.position.set(j[0] - pj[0], j[1] - pj[1], pd.layer ?? 0);
      (parent ? parent.pivot : root).add(pivot);
      const content = new THREE.Group(); content.position.set(-j[0], -j[1], 0); pivot.add(content);
      const [x0, y0, x1, y1] = bake.bounds;
      const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0); geo.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
      const aTex = new THREE.CanvasTexture(bake.alpha); aTex.colorSpace = THREE.NoColorSpace;
      const card = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: spec.palette.card, roughness: 0.85, alphaMap: aTex, alphaTest: 0.5, side: THREE.DoubleSide }));
      card.name = `${root.name}-${id}-card`;
      content.add(card);
      if (bake.anyGel) {
        const gTex = new THREE.CanvasTexture(bake.gelCanvas); gTex.colorSpace = THREE.SRGBColorSpace;
        const mTex = new THREE.CanvasTexture(bake.holeMask); mTex.colorSpace = THREE.NoColorSpace;
        const film = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: gTex, alphaMap: mTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        film.position.z = 0.002; film.name = `${root.name}-${id}-gel`;
        content.add(film);
      }
      parts[id] = { pivot, content, bake, joint: j };
      const cst = projector.addCaster({ obj: content, bake, density: () => op, name: `${root.name}-${id}` });
      if (pd.cardT != null || design.cardT != null) cst.mat.uniforms.uCardT.value = pd.cardT ?? design.cardT; // thin/translucent card
      const rodList = pd.rods ?? (pd.rod ? [{ at: pd.rod, lean: pd.rodLean }] : []);
      for (const rd of rodList) rods.push({ part: id, at: rd.at, lean: rd.lean ?? 6, r: rd.r ?? pd.rodR ?? 0.007 });
    }
    // control rods: from the attach point down past the bottom of the cloth, in the part's depth plane
    const rodObjs = rods.map((rd) => {
      const obj = new THREE.Group(); obj.name = `${root.name}-rod-${rd.part}`;
      stage.scene.add(obj);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rd.r, rd.r, 1, 6), materials.rod);
      mesh.geometry.translate(0, -0.5, 0);
      obj.add(mesh);
      const state = { len: 1 };
      projector.addCaster({ obj, rod: { r: rd.r, len: () => state.len }, density: () => op * (rd.visible ?? 1), name: obj.name });
      return { ...rd, obj, mesh, state };
    });
    const A = new THREE.Vector3();
    root.userData = {
      parts,
      rods: rodObjs,
      update(pose) {
        root.position.set(pose.x ?? 0, pose.y ?? 0, pose.z ?? -(pose.d ?? 0.1));
        root.rotation.set(0, D(pose.yaw), D(pose.rot));
        root.scale.setScalar(pose.scale ?? 1);
        op = pose.op ?? 1;
        root.visible = op > 0.002;
        for (const [id, a] of Object.entries(pose.limbs ?? {})) if (parts[id]) parts[id].pivot.rotation.z = D(a);
        root.updateWorldMatrix(true, true);
        const floorY = S.bottom - 0.9;
        for (const r of rodObjs) {
          A.set(r.at[0], r.at[1], 0);
          parts[r.part].content.localToWorld(A);
          const lean = D(r.lean);
          const len = Math.max(0.2, (A.y - floorY) / Math.cos(lean));
          r.obj.position.copy(A);
          r.obj.rotation.set(0, root.rotation.y, lean);
          r.state.len = len;
          r.mesh.scale.y = len;
          r.obj.visible = op > 0.002;
        }
      },
    };
    stage.scene.add(root);
    return root;
  }

  /** scenery(design, o) — a puppet with no limbs (hills, trees, buildings, moon); same pose API (slides in from the sides). */
  const scenery = (design, o = {}) => puppet(design.parts ? design : { parts: { body: { cut: design } }, cardT: o.cardT }, o);

  /**
   * titleCut(text, { cap = .42, weight = .2, rods = true, border }) -> puppet: the words as one cut-out in the kit stroke font
   *   (thick monoline letters on a thin bar), held on two rods. Same pose API.
   */
  function titleCut(text, o = {}) {
    const cap = o.cap ?? 0.42;
    const T = puppetry.cut.title(text, cap, { weight: o.weight ?? 0.2, letterSpacing: o.letterSpacing ?? 0.32, y: -cap / 2 });
    const half = T.width / 2;
    const bar = o.bar === false ? [] : [{ pts: [[-half - 0.1, -cap / 2 - 0.12], [half + 0.1, -cap / 2 - 0.12]], w: 0.035 }];
    const holes = o.holes ?? [];
    const cut = { fill: o.fill ?? [], strokes: [...T.strokes, ...bar], holes };
    const barY = -cap / 2 - 0.12;
    const rods = o.rods === false ? [] : [{ at: [-half * 0.62, barY], lean: -5 }, { at: [half * 0.62, barY], lean: 5 }];
    const p = puppet({ parts: { body: { cut, rods } } }, { name: o.name ?? "title" });
    p.userData.width = T.width;
    return p;
  }

  // ================================================================= captions (overlay, exact colour)
  const OV = spec.overlay;
  const serif = FONTS[OV.font] ?? OV.font;
  /**
   * caption(text, { x, y (frame px, centre of the plaque), px }) -> overlay canvas: a dark wooden plaque with a thin gold
   *   inlay line and cream serif capitals, like the board a storyteller hangs under the screen. userData.update(t, { on, off }).
   */
  function caption(text, o = {}) {
    const px = o.px ?? OV.px;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `${spec.text.weight} ${px}px ${serif}`;
    probe.letterSpacing = `${OV.tracking}px`;
    const tw = Math.ceil(probe.measureText(text).width);
    const Wp = tw + 2 * Math.round(px * 1.1), Hp = Math.round(px * 1.85);
    const cv = screenCanvas(stage, Wp + 20, Hp + 20, (ctx, w, h) => {
      const x0 = 10, y0 = 10, W = w - 20, H = h - 20, r = H * 0.18;
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = OV.plaque;
      ctx.beginPath(); ctx.roundRect(x0, y0, W, H, r); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = OV.edge; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(x0 + 7, y0 + 7, W - 14, H - 14, r * 0.7); ctx.stroke();
      // small diamonds at the ends of the inlay (folk-neutral ornament)
      ctx.fillStyle = OV.edge;
      for (const dx of [x0 + 26, x0 + W - 26]) { ctx.beginPath(); ctx.moveTo(dx, y0 + H / 2 - 7); ctx.lineTo(dx + 7, y0 + H / 2); ctx.lineTo(dx, y0 + H / 2 + 7); ctx.lineTo(dx - 7, y0 + H / 2); ctx.closePath(); ctx.fill(); }
      ctx.font = `${spec.text.weight} ${px}px ${serif}`;
      ctx.letterSpacing = `${OV.tracking}px`;
      ctx.fillStyle = OV.color; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(text, x0 + (W - tw) / 2 + OV.tracking / 2, y0 + H / 2 + px * 0.04);
    }, { upload: true });
    const cx = o.x ?? stage.width / 2, cy = o.y ?? stage.height * 0.88;
    cv.userData.size = [Wp + 20, Hp + 20];
    cv.userData.update = (t, { on, off = Infinity }) => {
      const a = smoothstep(on, on + OV.fadeDur, t) * (1 - smoothstep(off, off + OV.outDur, t));
      cv.userData.opacity(a);
      if (a <= 0.003) return;
      const rise = (1 - toEase("outCubic")(clamp((t - on) / (OV.fadeDur * 2)))) * OV.rise;
      cv.userData.place(cx - (Wp + 20) / 2, cy - (Hp + 20) / 2 + rise);
      cv.userData.set({ k: 1 });
    };
    return cv;
  }

  // ================================================================= per-frame
  /** update({ t, lamp: { x, y, z, r, level }, ripple }) — lamp uniforms + lamp prop + cloth ripple. Call before render. */
  let lampProp = null;
  function update({ t = 0, lamp: L = null, ripple = null } = {}) {
    if (L) Object.assign(lampState, L);
    lampU.pos.value.set(lampState.x, lampState.y, lampState.z);
    lampU.r.value = lampState.r;
    clothUniforms.uLampLevel.value = lampState.level ?? 1;
    clothUniforms.uTime.value = t;
    if (ripple != null) clothUniforms.uRipLevel.value = ripple;
    if (lampProp) lampProp.userData.place(lampState);
  }
  /** render(t): the projector's transmission map FIRST (render target), then the frame. */
  function render(t) {
    projector.render();
    stage.render(t);
  }

  const props = {
    screen,
    lamp: (o = {}) => { lampProp = lamp(o); stage.scene.add(lampProp); return lampProp; },
    puppet,
    scenery,
    titleCut,
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
    plan: puppetry,
    projector,
    update,
    render,
    bakeCut,
    sfx: spec.sfx,
    factories: {
      screen: () => screen(),
    },
  };
}
