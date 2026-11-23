// styles/city-lights/style.js — "City Lights": an invented skyline at blue hour across water. Windows are pixels.
// createStyle(stage, opts) -> style. The skyline is ONE InstancedMesh of boxes whose facade shader draws every window
// from a per-window state atlas (RGBA8 DataTexture, one texel per window) that the THREE-free planner (cityplan.js)
// fills for time t each frame. The water re-renders the whole world mirrored (root.scale.y = -1) into a half-res
// HDR target and smears it vertically with wave-driven wobble. Nothing is carried between frames.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { uploadTexture } from "../../kit/textures.js";
import { getOverlay } from "../../kit/overlay.js";
import { clamp, smoothstep, lerp } from "../../kit/time.js";
import { bitmapTextCells, measureBitmapText } from "../../kit/bitmapfont.js";
import * as cityplan from "./cityplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, cityplan };

const col = (hex) => new THREE.Color(hex);
const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// a 2D canvas that will be baked into a texture: willReadFrequently keeps Chrome on the CPU raster path, which is
// identical across page loads (the GPU canvas path rasterises large text slightly differently each load)
function bakeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true }) };
}

/**
 * createStyle(stage, opts?) -> style
 *   style.root: the mirrored world group (add every reflected prop to it). The water is NOT in it.
 *   style.props: sky, skyline, beacons, leds, ledSign, bridge, quay, traffic, water, blimp, ferry, caption, tag
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const { renderer } = stage;
  const root = new THREE.Group();
  root.name = "cityRoot";
  stage.scene.add(root);
  const C = spec.city;

  // ---------------------------------------------------------------- sky dome (gradient + stars), pure f(t)
  function sky() {
    const S = spec.sky;
    const u = {
      uStops: { value: S.stops.slice() },
      uEarly: { value: S.early.map(col) },
      uLate: { value: S.late.map(col) },
      uDusk: { value: 0 },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uGlow: { value: new THREE.Vector2(S.glowAzimuth, S.glowWidth) },
      uStar: { value: new THREE.Vector4(S.stars.density, S.stars.size, S.stars.twinkle, S.stars.minElev) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uStops[8]; uniform vec3 uEarly[8]; uniform vec3 uLate[8];
        uniform float uDusk, uStars, uTime; uniform vec2 uGlow; uniform vec4 uStar;
        varying vec3 vDir;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec3 stopCol(int i) { return mix(uEarly[i], uLate[i], uDusk); }
        void main() {
          vec3 d = normalize(vDir);
          float e = d.y;
          vec3 c = stopCol(0);
          for (int i = 1; i < 8; i++) {
            float a = uStops[i - 1], b = uStops[i];
            if (e > a) c = mix(stopCol(i - 1), stopCol(i), clamp((e - a) / (b - a), 0.0, 1.0));
          }
          // the sunset glow sits behind the city: brighter toward its azimuth, low down
          float az = atan(d.x, -d.z);
          float g = exp(-pow((az - uGlow.x) / uGlow.y, 2.0));
          float low = exp(-max(e, 0.0) * 7.0);
          c *= mix(0.78, 1.0 + 0.35 * g, mix(0.35, 1.0, g)) * (1.0 - 0.0 * low) ;
          c *= mix(1.0, 0.82 + 0.3 * g, low);
          // stars: one hashed candidate per cell of a stereographic grid, AA by fwidth
          // (no branches: derivatives must be taken in uniform control flow)
          vec2 sp = d.xz / (1.0 + max(d.y, 0.0)) * 1100.0;
          vec2 fwS = fwidth(sp);
          vec2 ci = floor(sp), f = fract(sp) - 0.5;
          float h = h21(ci);
          vec2 o = vec2(h21(ci + 7.1), h21(ci + 3.3)) - 0.5;
          float r = length(f - o * 0.5);
          float fw = 0.5 * (fwS.x + fwS.y) + 1e-4;
          float s = 1.0 - smoothstep(uStar.y * 0.5 - fw, uStar.y * 0.5 + fw, r);
          float tw = 1.0 - uStar.z + uStar.z * (0.5 + 0.5 * sin(uTime * (2.0 + 5.0 * h21(ci + 1.7)) + h * 60.0));
          float mag = 0.35 + 1.1 * pow(h21(ci + 9.2), 3.0);
          c += vec3(0.95, 0.97, 1.0) * s * tw * mag * uStars * step(h, uStar.x) * smoothstep(uStar.w, uStar.w + 0.12, e);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(S.radius, 64, 32), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    m.userData.update = (t, plan) => { u.uDusk.value = plan.duskAt(t); u.uStars.value = plan.starsAt(t); u.uTime.value = t; };
    return m;
  }

  // ---------------------------------------------------------------- the skyline: one InstancedMesh, windows from an atlas
  function skyline(plan) {
    const lots = plan.lots, n = lots.length, A = plan.atlas, F = spec.facade, W = spec.windows;
    const data = new Uint8Array(A.W * A.H * 4);
    const tex = new THREE.DataTexture(data, A.W, A.H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const aAtlas = new Float32Array(n * 4), aDims = new Float32Array(n * 4), aMisc = new Float32Array(n * 4);
    lots.forEach((l, i) => {
      aAtlas.set([l.ax, l.ay, l.colsF, l.colsS], i * 4);
      aDims.set([l.w, l.h, l.d, l.floors], i * 4);
      aMisc.set([(l.seed % 997) + 0.5, l.type, l.haze, 0], i * 4);
    });
    geo.setAttribute("aAtlas", new THREE.InstancedBufferAttribute(aAtlas, 4));
    geo.setAttribute("aDims", new THREE.InstancedBufferAttribute(aDims, 4));
    geo.setAttribute("aMisc", new THREE.InstancedBufferAttribute(aMisc, 4));
    const WT = spec.windowTypes;
    const u = {
      uWin: { value: tex },
      uBase: { value: col(F.base) }, uTop: { value: col(F.top) }, uGlass: { value: col(F.glass) }, uHaze: { value: col(F.haze) },
      uSide: { value: F.side }, uGain: { value: W.gain }, uGlassSky: { value: F.glassSky },
      uHazeP: { value: new THREE.Vector4(F.hazeNear, F.hazeK, F.hazeMax, F.windowHaze) },
      uTypeM: { value: WT.map((w) => new THREE.Vector3(...w.m)) },
      uMull: { value: WT.map((w) => w.mullion) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        attribute vec4 aAtlas; attribute vec4 aDims; attribute vec4 aMisc;
        varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld;
        varying vec4 vAtlas; varying vec4 vDims; varying vec4 vMisc;
        void main() {
          vLocal = position; vN = normal; vAtlas = aAtlas; vDims = aDims; vMisc = aMisc;
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 wp = modelMatrix * p;
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uWin;
        uniform vec3 uBase, uTop, uGlass, uHaze; uniform float uSide, uGain, uGlassSky; uniform vec4 uHazeP;
        uniform vec3 uTypeM[4]; uniform float uMull[4];
        varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld;
        varying vec4 vAtlas; varying vec4 vDims; varying vec4 vMisc;
        float Ip(float x, float a, float b) { return floor(x) * (b - a) + clamp(fract(x), a, b) - a; }
        float boxF(float x, float a, float b, float w) { w = max(w, 1e-3); return (Ip(x + 0.5 * w, a, b) - Ip(x - 0.5 * w, a, b)) / w; }
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main() {
          vec3 n = vN;
          float floors = floor(vDims.w + 0.5), colsF = floor(vAtlas.z + 0.5), colsS = floor(vAtlas.w + 0.5);
          int type = int(vMisc.y + 0.5);
          float y = clamp(vLocal.y, 0.0, 1.0);
          vec3 facade = mix(uBase, uTop, pow(y, 1.6) * 0.45);
          // NO divergent branches around fwidth/texelFetch: a 2x2 quad straddling a building edge (front + side face)
          // would take different branches and the derivatives become undefined (seen: edge pixels changed between
          // page loads). Face selection is arithmetic instead.
          float fz = step(0.5, n.z), bz = step(0.5, -n.z), rx = step(0.5, n.x), lx = step(0.5, -n.x);
          float side = rx + lx, hasWin = fz + bz + side;
          float u = fz * (vLocal.x + 0.5) * colsF + bz * (0.5 - vLocal.x) * colsF + rx * (0.5 - vLocal.z) * colsS + lx * (vLocal.z + 0.5) * colsS;
          float cols = mix(colsF, colsS, side);
          facade *= mix(1.0, uSide, side);
          vec2 cell = vec2(u, y * floors);
          vec2 fw = fwidth(cell);
          vec2 ci = clamp(floor(cell), vec2(0.0), vec2(cols - 1.0, floors - 1.0));
          vec2 f = cell - ci;
          vec4 w = texelFetch(uWin, ivec2(int(vAtlas.x + ci.x + side * colsF + 0.5), int(vAtlas.y + ci.y + 0.5)), 0);
          vec3 m = uTypeM[type];
          float mask = boxF(cell.x, m.x, 1.0 - m.x, fw.x) * boxF(cell.y, m.y, 1.0 - m.z, fw.y) * hasWin;
          float hh = h21(ci + vec2(vMisc.x * 1.7, side * 31.0));
          float wy = clamp((f.y - m.y) / (1.0 - m.y - m.z), 0.0, 1.0);
          float interior = (0.8 + 0.3 * (1.0 - wy)) * mix(1.0, mix(1.0, 0.5, smoothstep(0.55, 0.6, wy)), step(hh, 0.3));
          float mull = uMull[type] * step(fw.x, 0.2);
          interior *= mix(1.0, smoothstep(0.0, 0.035 + fw.x, abs(f.x - 0.5)), mull);
          vec3 glass = uGlass * (0.7 + 0.6 * hh) + uTop * uGlassSky * wy;
          vec3 wc = pow(w.rgb, vec3(2.2));
          vec3 emit = wc * (w.a * 2.0) * uGain * interior * mask;
          vec3 c = mix(facade, glass, mask);
          c = mix(c, uBase * 0.85, step(0.5, n.y));
          float d = length(vWorld - cameraPosition);
          float hz = clamp(vMisc.z * uHazeP.z + (1.0 - exp(-max(d - uHazeP.x, 0.0) * uHazeP.y)) * 0.25, 0.0, uHazeP.z);
          c = mix(c, uHaze, hz);
          c += emit * (1.0 - hz * uHazeP.w);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion();
    lots.forEach((l, i) => mesh.setMatrixAt(i, M.compose(new THREE.Vector3(l.x, C.groundY, l.z), q, new THREE.Vector3(l.w, l.h, l.d))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = "skyline";
    mesh.userData.atlas = tex;
    /** update(t): every window's state from the plan, uploaded before the frame renders */
    mesh.userData.update = (t) => { plan.fillWindows(t, data); uploadTexture(stage, tex); };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- beacons + antennas on the tall roofs
  function beacons(plan) {
    const B = spec.beacon, list = plan.lots.filter((l) => l.beacon);
    const geo = new THREE.SphereGeometry(B.r, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color: hdr("#ffffff", B.gain) });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const masts = [];
    const M = new THREE.Matrix4();
    list.forEach((l, i) => {
      const mast = l.antenna ? 9 + 6 * cityplan.ih(l.seed, 41) : 1.2;
      const top = C.groundY + l.h + mast;
      M.makeTranslation(l.x, top + B.r * 0.6, l.z);
      mesh.setMatrixAt(i, M);
      const g = new THREE.CylinderGeometry(0.18, 0.35, mast, 6).translate(l.x, C.groundY + l.h + mast / 2, l.z);
      masts.push(g);
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, list.length) * 3), 3);
    mesh.frustumCulled = false;
    const g = new THREE.Group();
    g.add(mesh);
    if (masts.length) g.add(new THREE.Mesh(mergeGeometries(masts), new THREE.MeshBasicMaterial({ color: "#0a0d22" })));
    const red = col(B.color);
    g.userData.update = (t) => {
      list.forEach((l, i) => {
        const k = 0.08 + 0.92 * plan.beaconLevel(l.i, t);
        mesh.instanceColor.setXYZ(i, red.r * k, red.g * k, red.b * k);
      });
      mesh.instanceColor.needsUpdate = true;
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- LED dot-matrix panels (signs, banners)
  /** leds(plan) -> { panel(id, cols, rows, pitch) -> Mesh, update(t), texture } — one shared LED atlas */
  function leds(plan) {
    const L = spec.led, AW = L.atlasW, AH = L.atlasH;
    const data = new Uint8Array(AW * AH * 4);
    const tex = new THREE.DataTexture(data, AW, AH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const panels = [];
    let px = 0, py = 0, sh = 0;
    function panel(id, cols, rows, pitch, o = {}) {
      if (px + cols > AW) { px = 0; py += sh; sh = 0; }
      const region = [px, py, cols, rows];
      px += cols; sh = Math.max(sh, rows);
      if (py + rows > AH) throw new Error("city-lights leds: LED atlas full");
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uLed: { value: tex }, uRegion: { value: new THREE.Vector4(...region) },
          uOn: { value: hdr(o.color ?? L.color, L.gain) }, uOff: { value: hdr(o.color ?? L.color, L.off) }, uDot: { value: L.dot },
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uLed; uniform vec4 uRegion; uniform vec3 uOn, uOff; uniform float uDot;
          varying vec2 vUv;
          void main() {
            vec2 cell = vUv * uRegion.zw;
            vec2 ci = clamp(floor(cell), vec2(0.0), uRegion.zw - 1.0);
            float lv = texelFetch(uLed, ivec2(uRegion.xy + ci + 0.5), 0).r;
            float r = length(fract(cell) - 0.5);
            float fw = fwidth(r) + 1e-4;
            float dotm = 1.0 - smoothstep(uDot - fw, uDot + fw, r);
            vec3 c = mix(vec3(0.006, 0.007, 0.02), uOff + uOn * lv, dotm);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cols * pitch, rows * pitch), mat);
      mesh.userData.led = { id, region, cols, rows, align: o.align ?? "center" };
      panels.push(mesh);
      return mesh;
    }
    function draw(p, t) {
      const { id, region, cols, rows } = p.userData.led;
      const [x0, y0] = region;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) data[((y0 + y) * AW + x0 + x) * 4] = 0;
      const text = plan.ledText(id, t);
      if (!text) return;
      const m = measureBitmapText(text, { spacing: 1 });
      const yb = Math.floor((rows - 7) / 2);
      const off = plan.bannerOffset(id, t);
      const cells = bitmapTextCells(text, { spacing: 1 });
      if (off) {
        const period = m.width + 8, shift = Math.floor(off) % period;
        for (const c of cells) for (let rep = -1; rep <= Math.ceil(cols / period) + 1; rep++) {
          const x = c.x + rep * period - shift;
          if (x >= 0 && x < cols) data[((y0 + yb + c.y) * AW + x0 + x) * 4] = 255;
        }
      } else {
        const xs = Math.floor((cols - m.width) / 2);
        for (const c of cells) { const x = xs + c.x; if (x >= 0 && x < cols) data[((y0 + yb + c.y) * AW + x0 + x) * 4] = 255; }
      }
    }
    return {
      texture: tex, panel, panels,
      update(t) { for (const p of panels) draw(p, t); uploadTexture(stage, tex); },
    };
  }

  /** ledSign(ledSys, lot, { id, cols, rows = 9, pitch, legs = 2.4 }) -> Group: a framed LED panel on a lot's roof */
  function ledSign(sys, l, o = {}) {
    const cols = o.cols ?? 13, rows = o.rows ?? 9, pitch = o.pitch ?? Math.min(0.8, (l.w * 0.92) / cols);
    const g = new THREE.Group();
    const w = cols * pitch, h = rows * pitch, legs = o.legs ?? 2.4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + pitch, h + pitch, 0.5), materials.signFrame);
    frame.position.set(0, legs + h / 2, 0);
    const p = sys.panel(o.id ?? l.id, cols, rows, pitch, o);
    p.position.set(0, legs + h / 2, 0.26);
    const legGeo = mergeGeometries([-0.32, 0.32].map((s) => new THREE.BoxGeometry(0.3, legs, 0.3).translate(s * w, legs / 2, 0)));
    g.add(frame, p, new THREE.Mesh(legGeo, materials.signFrame));
    g.position.set(l.x, C.groundY + l.h, l.z + l.d / 2 - 1.2);
    g.userData.size = [w, h + legs];
    /** update(t, plan): the sign rises out of the roof just before its program starts (scale y from 0) */
    g.userData.update = (t, plan) => {
      const k = plan.signOn(o.id ?? l.id, t);
      g.visible = k > 0.001;
      g.scale.set(1, Math.max(0.001, k), 1);
    };
    return g;
  }

  // ---------------------------------------------------------------- bridge, quay, ground
  function softDash() {
    const { c, ctx } = bakeCanvas(64, 16);
    const gr = ctx.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.2, "rgba(255,255,255,1)"); gr.addColorStop(0.8, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gr; ctx.fillRect(0, 4, 64, 8);
    ctx.globalAlpha = 0.35; ctx.fillRect(0, 2, 64, 12);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.NoColorSpace;
    return tx;
  }
  function lampDots(points, color, gain, r = 0.45) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: hdr(color, gain) }), Math.max(1, points.length));
    const M = new THREE.Matrix4();
    points.forEach((p, i) => mesh.setMatrixAt(i, M.makeTranslation(p[0], p[1], p[2])));
    mesh.frustumCulled = false;
    return mesh;
  }
  function bridge() {
    const Bs = spec.bridge, g = new THREE.Group();
    g.name = "bridge";
    const [x0, x1] = Bs.x, L = x1 - x0, z = Bs.z, yD = Bs.deckY, hw = Bs.width / 2;
    const parts = [new THREE.BoxGeometry(L, 1.1, Bs.width).translate((x0 + x1) / 2, yD - 0.55, z)];
    parts.push(new THREE.BoxGeometry(L, 0.9, 0.35).translate((x0 + x1) / 2, yD + 0.45, z + hw), new THREE.BoxGeometry(L, 0.9, 0.35).translate((x0 + x1) / 2, yD + 0.45, z - hw));
    const lamps = [];
    for (let px = x0; px <= x1 + 1e-6; px += Bs.span) {
      parts.push(new THREE.BoxGeometry(3.2, yD, Bs.width + 1.5).translate(px, yD / 2, z));
      if (px + Bs.span > x1 + 1e-6) break;
      // two arch ribs (front, back) springing from the piers up to just under the deck, with spandrel posts
      const arch = new THREE.Shape(), a = Bs.span / 2 - 1.6, rise = Bs.archRise, th = 1.1, base = yD - 1.1 - rise;
      const N = 18;
      for (let i = 0; i <= N; i++) { const u = -1 + (2 * i) / N; const x = u * a, y = base + rise * (1 - u * u); i ? arch.lineTo(x, y) : arch.moveTo(x, y); }
      for (let i = N; i >= 0; i--) { const u = -1 + (2 * i) / N; arch.lineTo(u * a, base + rise * (1 - u * u) - th - 0.6 * u * u); }
      const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.7, bevelEnabled: false });
      parts.push(ag.clone().translate(px + Bs.span / 2, 0, z + hw - 1.2), ag.clone().translate(px + Bs.span / 2, 0, z - hw + 0.5));
      for (let k = -3; k <= 3; k++) {
        const x = (k / 3.6) * a, ya = base + rise * (1 - (x / a) ** 2);
        if (yD - 1.1 - ya > 0.3) for (const zz of [z + hw - 0.85, z - hw + 0.85]) parts.push(new THREE.BoxGeometry(0.45, yD - 1.1 - ya, 0.45).translate(px + Bs.span / 2 + x, (ya + yD - 1.1) / 2, zz));
      }
    }
    for (let px = x0 + 6; px < x1; px += Bs.lampEvery) for (const s of [1, -1]) {
      parts.push(new THREE.CylinderGeometry(0.12, 0.16, Bs.lampY, 5).translate(px, yD + Bs.lampY / 2, z + s * (hw - 0.3)));
      lamps.push([px, yD + Bs.lampY + 0.2, z + s * (hw - 0.3)]);
    }
    g.add(new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), materials.deck));
    g.add(lampDots(lamps, P.sodium, spec.traffic.sodiumGain, 0.42));
    return g;
  }
  function quay() {
    const Q = spec.quay, g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(900, Q.y, Q.depth), materials.stone);
    wall.position.set(0, Q.y / 2, Q.z);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 520).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#0b0f27" }));
    ground.position.set(0, C.groundY - 0.02, Q.z - Q.depth / 2 - 260 + 2);
    const pts = [];
    for (let x = -440; x <= 440; x += Q.lampEvery) pts.push([x, Q.y + 2.2, Q.z + Q.depth / 2 - 0.3]);
    g.add(wall, ground, lampDots(pts, P.sodium, spec.traffic.sodiumGain, 0.38));
    return g;
  }

  /** traffic(plan, lanes) -> InstancedMesh of soft additive dashes; lanes: [{ id, y, z, kind }] (plan lanes by id) */
  function traffic(plan, lanes) {
    const T = spec.traffic;
    const total = lanes.reduce((s, L) => s + plan.carsAt(L.id, 0).length, 0);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", map: softDash(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, Math.max(1, total));
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, total) * 3), 3);
    mesh.frustumCulled = false;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const head = hdr(P.head, T.headGain), tail = hdr(P.tail, T.tailGain);
    mesh.userData.update = (t) => {
      let k = 0;
      for (const L of lanes) {
        const c = L.kind === "tail" ? tail : head;
        for (const car of plan.carsAt(L.id, t)) {
          const a = car.a;
          v.set(car.x, L.y, L.z);
          s.set(a > 0.001 ? T.dash[0] : 0.0001, T.dash[1], 1);
          mesh.setMatrixAt(k, M.compose(v, q, s));
          mesh.instanceColor.setXYZ(k, c.r * a, c.g * a, c.b * a);
          k++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- water: mirrored re-render, smeared + wobbled
  function water() {
    const Wt = spec.water;
    const rt = new THREE.WebGLRenderTarget(Math.round(stage.width * Wt.rtScale), Math.round(stage.height * Wt.rtScale), {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    });
    rt.texture.generateMipmaps = false;
    const u = {
      uRefl: { value: rt.texture }, uRes: { value: new THREE.Vector2(stage.width, stage.height) }, uTime: { value: 0 },
      uDeep: { value: col(Wt.color) }, uFres: { value: new THREE.Vector2(...Wt.fresnel) },
      uP: { value: new THREE.Vector4(Wt.distort, Wt.smear, Wt.sparkle, 0) },
      uWaves: { value: Wt.waves.map((w) => new THREE.Vector4(...w)) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `varying vec3 vWorld; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uRefl; uniform vec2 uRes; uniform float uTime; uniform vec3 uDeep; uniform vec2 uFres; uniform vec4 uP; uniform vec4 uWaves[4];
        varying vec3 vWorld;
        void main() {
          vec2 suv = gl_FragCoord.xy / uRes;
          vec3 V = cameraPosition - vWorld;
          float d = length(V);
          vec2 p = vWorld.xz;
          // analytic wave slope (sum of directional sines), pure f(t)
          vec2 g = vec2(0.0);
          for (int i = 0; i < 4; i++) {
            vec4 w = uWaves[i];
            vec2 dir = vec2(cos(w.y), sin(w.y));
            float ph = dot(p, dir) * w.x + uTime * w.w;
            g += dir * cos(ph) * w.z;
          }
          float persp = clamp(70.0 / d, 0.12, 1.0);
          vec3 acc = vec3(0.0); float ws = 0.0;
          for (int i = 0; i < 9; i++) {
            float k = float(i) / 8.0 - 0.35;
            float yy = suv.y + k * uP.y;
            float wob = sin(yy * 70.0 + uTime * 1.4 + g.y * 1.2) * 0.55 + sin(yy * 29.0 - uTime * 0.9 + g.x) * 0.45;
            vec2 o = vec2((g.x * 0.6 + wob) * uP.x * persp, k * uP.y);
            float wt = 1.0 - abs(k) * 0.9;
            acc += texture2D(uRefl, suv + o).rgb * wt; ws += wt;
          }
          vec3 refl = acc / ws;
          float cosV = abs(V.y) / max(d, 1e-3);
          float fres = mix(uFres.x, uFres.y, pow(1.0 - cosV, 4.0));
          vec3 c = mix(uDeep, refl, fres);
          // faint glints on wave crests catching the sky
          float crest = pow(max(0.0, 0.5 + 0.5 * sin(dot(p, vec2(0.9, 0.35)) * 1.7 + g.x * 3.0 + uTime * 1.1)), 24.0);
          c += vec3(0.5, 0.42, 0.6) * crest * uP.z * persp * 0.15;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const Q = spec.quay;
    const zFar = Q.z + Q.depth / 2, zNear = 900;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2400, zNear - zFar).rotateX(-Math.PI / 2), mat);
    m.position.set(0, 0, (zFar + zNear) / 2);
    m.name = "water";
    m.frustumCulled = false;
    m.userData.target = rt;
    m.userData.update = (t) => { u.uTime.value = t; };
    /** renderReflection(world): re-render the world mirrored in y = 0 into the half-res target (call before stage.render) */
    m.userData.renderReflection = (world) => {
      const prev = renderer.getRenderTarget();
      m.visible = false;
      world.scale.y = -1;
      world.updateMatrixWorld(true);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(stage.scene, stage.camera);
      renderer.setRenderTarget(prev);
      world.scale.y = 1;
      world.updateMatrixWorld(true);
      m.visible = true;
    };
    return m;
  }

  // ---------------------------------------------------------------- blimp + ferry (in-world LED banner labels)
  function blimp(sys, o = {}) {
    const Bl = spec.blimp, len = o.len ?? Bl.len, r = len * 0.17, g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), materials.blimp);
    body.scale.set(len / 2, r, r);
    const fins = mergeGeometries([0, 1, 2, 3].map((k) => {
      const f = new THREE.BoxGeometry(len * 0.16, r * 0.9, 0.3).translate(-len * 0.4, r * 0.7, 0);
      return f.rotateX((k * Math.PI) / 2);
    }));
    const gond = new THREE.Mesh(new THREE.BoxGeometry(len * 0.18, r * 0.35, r * 0.4), materials.signFrame);
    gond.position.set(len * 0.03, -r * 1.05, 0);
    const [bw, bh] = o.banner ?? Bl.banner, pitch = o.ledPitch ?? Bl.ledPitch;
    const cols = Math.round(bw / pitch), rows = Math.max(9, Math.round(bh / pitch));
    const panel = sys.panel(o.id ?? "blimp", cols, rows, pitch, { color: o.color });
    panel.position.set(0, 0, r * 1.02);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(cols * pitch + 0.6, rows * pitch + 0.6), new THREE.MeshBasicMaterial({ color: "#05060f" }));
    back.position.set(0, 0, r * 1.0);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: hdr(Bl.nav, 6) }));
    nav.position.set(len * 0.5, 0, 0);
    g.add(body, new THREE.Mesh(fins, materials.blimp), gond, back, panel, nav);
    g.userData.update = (t) => { nav.visible = ((t * 0.9) % 1) < 0.15; };
    return g;
  }
  function ferry(sys, o = {}) {
    const Fe = spec.ferry, len = o.len ?? Fe.len, g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 6.5), materials.hull);
    hull.position.y = 1.2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.62, 2.4, 5), materials.deck);
    cabin.position.set(-len * 0.05, 3.6, 0);
    const { c, ctx } = bakeCanvas(256, 32);
    ctx.fillStyle = "#0a0c18"; ctx.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 18; i++) { ctx.fillStyle = i % 5 === 3 ? "#5a4a30" : "#ffd79a"; ctx.fillRect(6 + i * 13.8, 8, 9, 14); }
    const wt = new THREE.CanvasTexture(c);
    wt.colorSpace = THREE.SRGBColorSpace;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.6, 1.6), new THREE.MeshBasicMaterial({ map: wt, color: hdr("#ffffff", 2.4) }));
    win.position.set(-len * 0.05, 3.6, 2.52);
    g.add(hull, cabin, win);
    if (o.banner) {
      const pitch = Fe.ledPitch, cols = Math.round((len * 0.55) / pitch);
      const p = sys.panel(o.banner, cols, 9, pitch);
      p.position.set(-len * 0.05, 6.4, 0.2);
      g.add(p);
    }
    g.add(lampDots([[len / 2 - 0.5, 2.8, 0], [-len / 2 + 0.5, 4.2, 0]], "#fff1d6", 4, 0.35));
    return g;
  }

  // ---------------------------------------------------------------- overlay caption + tag (exact colours, 1:1 px)
  function overlayCard(stg, wPx, hPx, paint) {
    const ov = getOverlay(stg);
    const { c, ctx } = bakeCanvas(wPx, hPx);
    paint(ctx, wPx, hPx);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.minFilter = tx.magFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    uploadTexture(stg, tx);
    const k = 2 / stg.height;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wPx * k, hPx * k), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 20;
    ov.add(mesh);
    mesh.userData.place = (xPx, yPx) => mesh.position.set((xPx + wPx / 2) * k - ov.aspect, 1 - (yPx + hPx / 2) * k, 0);
    return mesh;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  /** caption(stage, beats) -> overlay group; one beat label at a time in one fixed region (bottom-left); update(t) */
  function caption(stg, beats, o = {}) {
    const K = { ...spec.caption, ...o }, g = new THREE.Group();
    const probe = bakeCanvas(8, 8).ctx;
    probe.font = `${K.weight} ${K.fontPx}px ${K.font}`;
    const items = beats.filter((b) => b.label).map((b) => {
      const tw = Math.ceil(probe.measureText(b.label).width);
      const wPx = 2 * Math.round((tw + K.padPx * 2 + K.rulePx + 12) / 2), hPx = K.hPx;
      const card = overlayCard(stg, wPx, hPx, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = K.cardAlpha; ctx.fillStyle = P.captionCard; roundRect(ctx, 0, 0, W, H, 14); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = P.captionRule; ctx.fillRect(18, 20, K.rulePx, H - 40);
        ctx.font = `${K.weight} ${K.fontPx}px ${K.font}`; ctx.fillStyle = P.captionInk; ctx.textBaseline = "middle";
        ctx.fillText(b.label, Math.round(18 + K.rulePx + K.padPx * 0.7), Math.round(H / 2 + 2));
      });
      g.add(card);
      return { b, card };
    });
    getOverlay(stg).add(g);
    g.userData.update = (t) => {
      items.forEach(({ b, card }, i) => {
        const last = i === items.length - 1;
        const off = last ? Infinity : b.t + b.dur - K.fadeOut - 0.05;
        const a = smoothstep(b.t, b.t + K.fadeIn, t) * (Number.isFinite(off) ? 1 - smoothstep(off, off + K.fadeOut, t) : 1);
        card.visible = a > 0.002;
        card.material.opacity = a;
        card.userData.place(K.xPx, K.yPx + Math.round((1 - smoothstep(b.t, b.t + K.fadeIn, t)) * K.slide));
      });
    };
    g.userData.update(0);
    return g;
  }
  /** tag(stage, text, { from, to }) -> small amber caps pill above the caption region ("SAMPLE DATA"); update(t) */
  function tag(stg, text, o = {}) {
    const K = spec.caption, S = K.sub;
    const probe = bakeCanvas(8, 8).ctx;
    probe.font = `${S.weight} ${S.fontPx}px ${K.font}`;
    probe.letterSpacing = `${S.tracking}px`;
    const tw = Math.ceil(probe.measureText(text).width);
    const wPx = 2 * Math.round((tw + 36) / 2), hPx = 40;
    const card = overlayCard(stg, wPx, hPx, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.82; ctx.fillStyle = P.captionCard; roundRect(ctx, 0, 0, W, H, 8); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = P.captionSub; ctx.lineWidth = 2; roundRect(ctx, 1, 1, W - 2, H - 2, 8); ctx.stroke();
      ctx.font = `${S.weight} ${S.fontPx}px ${K.font}`; ctx.letterSpacing = `${S.tracking}px`; ctx.fillStyle = P.captionSub; ctx.textBaseline = "middle";
      ctx.fillText(text, 18, Math.round(H / 2 + 1));
    });
    card.userData.update = (t) => {
      const from = o.from ?? 0, to = o.to ?? Infinity;
      const a = smoothstep(from, from + 0.3, t) * (Number.isFinite(to) ? 1 - smoothstep(to, to + 0.3, t) : 1);
      card.visible = a > 0.002;
      card.material.opacity = a;
      card.userData.place(o.xPx ?? K.xPx, o.yPx ?? K.yPx - hPx - S.gapPx);
    };
    card.userData.update(0);
    return card;
  }

  const props = { sky, skyline, beacons, leds, ledSign, bridge, quay, traffic, water, blimp, ferry, caption, tag, lampDots };
  return {
    spec, palette: P, materials, lights, post, root,
    textStyle: { font: spec.caption.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height },
    camera: spec.camera, props,
    factories: {},
    plan: (o) => cityplan.planCity(spec, o),
    motion: cityplan,
    sfx: spec.sfx,
  };
}
