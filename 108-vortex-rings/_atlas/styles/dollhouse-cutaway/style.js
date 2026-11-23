// styles/dollhouse-cutaway/style.js — "Dollhouse Cutaway": a toy house seen straight on with its front swung open.
// The look lives in spec.js; WHAT happens WHEN lives in rooms.js (THREE-free planner shared with SCORE).
// How it is drawn (cheap, seek-safe, exact colours):
//   - ONE unlit room shader for every surface of the house. Each vertex carries its sRGB colour, a room index (0..5 =
//     a room, 6 = outside) and an "emit" flag (bulbs, marquee lamps). Uniform arrays uLevel[7] / uLamp[7] give each
//     room its light level and lamp point: a dark room shows its own colours quieter, greyer and cooler (never black);
//     a lit room warms up with a soft falloff from its lamp; >1 is the finale's extra gain. No lights, no shadows, no
//     post stack, tone mapping "none": what is written is what reaches the screen.
//   - All static geometry (shell, liners, furniture, roof, sign) is merged into ONE mesh; the few moving parts (front
//     halves, door, stamp, blade, books, presses, gears, lens arm, bellows) are small meshes on the same material.
//   - Additive glow quads give lit rooms a warm haze and the courier a halo; the caption is a flip sign on the roof.
// Props never animate themselves: the scene calls update(t) / show(...) with values that are pure functions of t.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, clamp, lerp } from "../../kit/time.js";
import * as rooms from "./rooms.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const { hexRgb, mixHex } = rooms;
const EXT = 6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const v3 = (hex) => new THREE.Vector3(...hexRgb(hex));

/** Geo: a flat-shaded triangle soup with per-vertex colour (sRGB), room index and emit flag; coordinates minus `origin`. */
class Geo {
  constructor(origin = [0, 0, 0]) { this.o = origin; this.P = []; this.N = []; this.C = []; this.R = []; this.E = []; }
  tri(a, b, c, n, col, room, emit) {
    for (const v of [a, b, c]) {
      this.P.push(v[0] - this.o[0], v[1] - this.o[1], v[2] - this.o[2]);
      this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]); this.R.push(room); this.E.push(emit);
    }
  }
  /** quad a b c d; `hint` = outward direction (winding is fixed to face it). */
  quad(a, b, c, d, col, room, emit, hint) {
    let n = cross(sub(b, a), sub(c, a));
    if (hint && dot(n, hint) < 0) { const tmp = b; b = d; d = tmp; n = cross(sub(b, a), sub(c, a)); }
    n = nrm(n);
    this.tri(a, b, c, n, col, room, emit); this.tri(a, c, d, n, col, room, emit);
  }
  fan(pts, col, room, emit, hint) {
    let n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    const P = dot(n, hint) < 0 ? pts.slice().reverse() : pts;
    n = nrm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
    for (let i = 1; i < P.length - 1; i++) this.tri(P[0], P[i], P[i + 1], n, col, room, emit);
  }
  /** box(min, max, colour, room, { rz, emit }) — rz rotates about the box centre around z. */
  box(a, b, col, room = EXT, o = {}) {
    const c3 = typeof col === "string" ? hexRgb(col) : col, e = o.emit ?? 0;
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rz = o.rz ?? 0, cs = Math.cos(rz), sn = Math.sin(rz);
    const T = (x, y, z) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs, z];
    const R = (d) => [d[0] * cs - d[1] * sn, d[0] * sn + d[1] * cs, d[2]];
    const v = (i, j, k) => T(i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]);
    this.quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1), c3, room, e, R([1, 0, 0]));
    this.quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0), c3, room, e, R([-1, 0, 0]));
    this.quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0), c3, room, e, R([0, 1, 0]));
    this.quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1), c3, room, e, R([0, -1, 0]));
    if (!o.noFront) this.quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1), c3, room, e, [0, 0, 1]);
    if (!o.noBack) this.quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0), c3, room, e, [0, 0, -1]);
  }
  /** prism(convex [[x,y]...], z0, z1, colour, room) — an xy outline extruded along z. */
  prism(pts, z0, z1, col, room = EXT, o = {}) {
    const c3 = typeof col === "string" ? hexRgb(col) : col, e = o.emit ?? 0;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    this.fan(pts.map((p) => [p[0], p[1], z1]), c3, room, e, [0, 0, 1]);
    if (!o.noBack) this.fan(pts.map((p) => [p[0], p[1], z0]), c3, room, e, [0, 0, -1]);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
      this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], c3, room, e, [mx, my, 0]);
    });
  }
  /** disc(centre [x,y], r, z0, z1, colour, room, seg) — a cylinder along z (a prism with a round outline). */
  disc(c, r, z0, z1, col, room = EXT, seg = 20, o = {}) {
    const pts = Array.from({ length: seg }, (_, i) => [c[0] + r * Math.cos((i / seg) * Math.PI * 2), c[1] + r * Math.sin((i / seg) * Math.PI * 2)]);
    this.prism(pts, z0, z1, col, room, o);
  }
  /** ring(centre, r, w, z0, z1, ...) — a flat ring made of `seg` small boxes. */
  ring(c, r, w, z0, z1, col, room = EXT, seg = 18, o = {}) {
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI * 2, x = c[0] + r * Math.cos(a), y = c[1] + r * Math.sin(a), l = (2 * Math.PI * r) / seg * 0.56;
      this.box([x - w / 2, y - l, z0], [x + w / 2, y + l, z1], col, room, { ...o, rz: a });
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute("aRoom", new THREE.Float32BufferAttribute(this.R, 1));
    g.setAttribute("aEmit", new THREE.Float32BufferAttribute(this.E, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const ROOM_VS = /* glsl */ `
attribute vec3 aCol; attribute float aRoom; attribute float aEmit;
uniform float uLevel[7]; uniform vec3 uLamp[7];
varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying float vLevel; varying vec3 vLampP; varying float vExt; varying float vEmit;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = mat3(modelMatrix) * normal;
  int r = int(aRoom + 0.5);
  vLevel = uLevel[r]; vLampP = uLamp[r];
  vExt = step(5.5, aRoom); vEmit = aEmit; vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ROOM_FS = /* glsl */ `
uniform vec4 uShade; uniform vec4 uDim; uniform vec3 uCool; uniform vec3 uWarm; uniform vec3 uLit;
varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying float vLevel; varying vec3 vLampP; varying float vExt; varying float vEmit;
void main() {
  vec3 n = normalize(vN);
  vec3 n2 = n * n;
  float tone = n2.y * (n.y > 0.0 ? uShade.x : uShade.w) + n2.z * uShade.y + n2.x * uShade.z;
  vec3 base = vCol * tone;
  float L = vLevel;
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 dimC = mix(vec3(lum), base, uDim.y) * uDim.x * uCool;                 // unlit: own colours, quieter, cooler
  float d = distance(vW, vLampP);
  vec3 litC = base * uWarm * (uLit.x + uLit.y / (1.0 + uLit.z * d * d));     // lit: warm, brightest near the lamp
  vec3 roomC = mix(dimC, litC, clamp(L, 0.0, 1.0)) * (1.0 + uDim.z * max(L - 1.0, 0.0));
  vec3 col = mix(roomC, base * L, vExt);
  vec3 emitC = vCol * mix(uDim.w, 1.0, clamp(L, 0.0, 1.0));
  col = mix(col, emitC, vEmit);
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

const FLAT_VS = /* glsl */ `
varying vec3 vN;
void main() { vN = mat3(modelMatrix) * normal; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const FLAT_FS = /* glsl */ `
uniform vec3 uColor; uniform vec4 uShade; uniform float uRim;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN); vec3 n2 = n * n;
  float tone = n2.y * (n.y > 0.0 ? uShade.x : uShade.w) + n2.z * uShade.y + n2.x * uShade.z;
  vec3 c = uColor * tone + uRim * (1.0 - n2.z) * 0.18;
  gl_FragColor = vec4(min(c, vec3(1.0)), 1.0);
}`;

const GLOW_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_FS = /* glsl */ `
uniform vec3 uColor; uniform float uK; uniform vec2 uC; uniform vec2 uR;
varying vec2 vUv;
void main() {
  vec2 q = (vUv - uC) / uR;
  float r = clamp(length(q), 0.0, 1.0);
  float f = (1.0 - r * r) * (1.0 - r * r) * (1.0 - r * r);   // soft, and exactly 0 at r = 1 (no quad edges)
  gl_FragColor = vec4(uColor * f * uK, 1.0);
}`;

const SKY_VS = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SKY_FS = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uTopN; uniform vec3 uMidN; uniform vec3 uLowN;
uniform float uNight; uniform vec3 uY;   // y of low, mid, top
varying vec3 vW;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float y = vW.y;
  float a = clamp((y - uY.x) / (uY.y - uY.x), 0.0, 1.0), b = clamp((y - uY.y) / (uY.z - uY.y), 0.0, 1.0);
  vec3 day = mix(mix(uLow, uMid, a), uTop, b);
  vec3 night = mix(mix(uLowN, uMidN, a), uTopN, b);
  vec3 col = mix(day, night, uNight);
  // a sparse field of stars that only exists at night (cell hash; one soft dot per lucky cell)
  vec2 cell = floor(vW.xy / 1.6);
  vec2 f = fract(vW.xy / 1.6) - 0.5;
  float lucky = step(0.86, h21(cell));
  vec2 o = vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5;
  float s = lucky * (1.0 - smoothstep(0.03, 0.09, length(f - o * 0.6))) * smoothstep(uY.y, uY.z, y);
  col += vec3(1.0, 0.95, 0.85) * s * uNight * 0.85;
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;
const GROUND_FS = /* glsl */ `
uniform vec3 uGround; uniform vec3 uFar; uniform vec3 uShadow; uniform vec4 uFoot; uniform float uNight;
varying vec3 vW;
float sdRect(vec2 p, vec2 h) { vec2 q = abs(p) - h; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
void main() {
  vec2 p = vW.xz;
  vec3 col = mix(uGround, uFar, smoothstep(2.0, -30.0, p.y));
  float d = sdRect(p - uFoot.xy, uFoot.zw);
  col = mix(col, uShadow, (1.0 - smoothstep(-0.2, 1.6, d)) * 0.7);
  col *= mix(1.0, 0.62, uNight);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const Lt = spec.light, Sh = spec.shade;

  // ---------------------------------------------------------------- materials
  const roomU = {
    uLevel: { value: [0, 0, 0, 0, 0, 0, Lt.exterior] },
    uLamp: { value: Array.from({ length: 7 }, () => new THREE.Vector3(0, -50, 0)) },
    uShade: { value: new THREE.Vector4(Sh.top, Sh.front, Sh.side, Sh.bottom) },
    uDim: { value: new THREE.Vector4(Lt.dim, Lt.dimSat, Lt.over, Lt.emitOff) },
    uCool: { value: new THREE.Vector3(...Lt.cool) }, uWarm: { value: new THREE.Vector3(...Lt.warm) },
    uLit: { value: new THREE.Vector3(Lt.bounce, Lt.direct, Lt.falloff) },
  };
  const roomMat = new THREE.ShaderMaterial({ uniforms: roomU, vertexShader: ROOM_VS, fragmentShader: ROOM_FS });
  const flatMat = (hex, rim = 0) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: v3(hex) }, uShade: { value: new THREE.Vector4(Sh.top, Sh.front, Sh.side, Sh.bottom) }, uRim: { value: rim } },
      vertexShader: FLAT_VS, fragmentShader: FLAT_FS,
    });
    m.userData.setRGB = (rgb) => m.uniforms.uColor.value.set(rgb[0], rgb[1], rgb[2]);
    return m;
  };
  const glowMat = (hex, o = {}) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: v3(hex) }, uK: { value: 0 }, uC: { value: new THREE.Vector2(...(o.c ?? [0.5, 0.5])) }, uR: { value: new THREE.Vector2(...(o.r ?? [0.5, 0.5])) } },
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true, blending: THREE.AdditiveBlending,
  });
  const unitQuad = new THREE.PlaneGeometry(1, 1);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // ---------------------------------------------------------------- the house
  /**
   * house(layout) -> Group with userData.update(t, plan)
   *   Static shell + liners + furniture (one mesh), the swinging front, the door, the moving furniture and the glows.
   */
  function house(L) {
    const Hs = L.H, G = new THREE.Group();
    const g = new Geo();
    const { W, base, zB, zF, wall, roomH, topY } = L;
    const zBack = zB - wall;
    // ---- skeleton (plywood): slabs, outer and inner walls, back wall — its cut front edges are the cream grid
    for (let f = 0; f <= Hs.floors; f++) { const y = L.floorY(f); g.box([-W / 2, y - wall, zBack], [W / 2, y, zF], P.shell); }
    g.box([-W / 2, base, zBack], [-W / 2 + wall, topY, zF], P.shell);
    g.box([W / 2 - wall, base, zBack], [W / 2, topY, zF], P.shell);
    for (let c = 1; c < Hs.cols; c++) { const x = -W / 2 + c * (L.roomW + wall); g.box([x, base, zBack], [x + wall, topY, zF], P.shell); }
    g.box([-W / 2, base, zBack], [W / 2, topY, zB], P.shell);
    // ---- per-room liners and lamp
    const rand = rng("dollhouse-cutaway");
    const B = (rm, dx0, dx1, y0, y1, z0, z1, col, o) => g.box([rm.cx + dx0, rm.fy + y0, z0], [rm.cx + dx1, rm.fy + y1, z1], col, rm.i, o);
    for (const rm of L.rooms) {
      const hw = L.roomW / 2, wc = rm.wall;
      B(rm, -hw, hw, 0, roomH, zB, zB + 0.02, wc);                                        // back wall
      B(rm, -hw, hw, 0, 0.95, zB, zB + 0.035, mixHex(wc, P.ink, 0.16));                   // wainscot
      B(rm, -hw, hw, 0.95, 1.01, zB, zB + 0.05, P.trim);                                  // chair rail
      B(rm, -hw, -hw + 0.02, 0, roomH, zB, zF, mixHex(wc, P.ink, 0.08));                  // side walls
      B(rm, hw - 0.02, hw, 0, roomH, zB, zF, mixHex(wc, P.ink, 0.08));
      B(rm, -hw, hw, 0, 0.02, zB, zF, rm.floorCol);                                       // floor
      for (let k = 1; k < 9; k++) B(rm, -hw + k * 0.6 - 0.01, -hw + k * 0.6 + 0.01, 0.02, 0.026, zB, zF, mixHex(rm.floorCol, P.ink, 0.18));
      B(rm, -hw, hw, roomH - 0.02, roomH, zB, zF, P.ceiling);                             // ceiling
      B(rm, -hw, hw, 0.02, 0.13, zB + 0.035, zB + 0.07, P.trim);                          // skirting
      // lamp: cord, shade, bulb
      const lx = rm.lamp[0] - rm.cx, ly = rm.lamp[1] - rm.fy, lz = rm.lamp[2];
      B(rm, lx - 0.015, lx + 0.015, ly + 0.3, roomH, lz - 0.015, lz + 0.015, P.ink);
      g.prism([[rm.lamp[0] - 0.36, rm.lamp[1] + 0.04], [rm.lamp[0] + 0.36, rm.lamp[1] + 0.04], [rm.lamp[0] + 0.15, rm.lamp[1] + 0.32], [rm.lamp[0] - 0.15, rm.lamp[1] + 0.32]], lz - 0.26, lz + 0.26, P.shade, rm.i);
      B(rm, lx - 0.13, lx + 0.13, ly - 0.12, ly + 0.05, lz - 0.13, lz + 0.13, P.bulb, { emit: 1 });
    }
    const m = L.byId.mail, tk = L.byId.tokens, lb = L.byId.library, wk = L.byId.workshop, ck = L.byId.check, an = L.byId.answer;
    const tz = L.trackZ;

    // ---- mail room: counter, belt, pigeonholes, stamp gantry, clock, stacked parcels
    B(m, -0.7, 2.3, 0, 0.88, -1.1, 0.4, P.wood);
    B(m, -0.8, 2.4, 0.88, 0.95, -1.15, 0.45, P.woodLight);
    B(m, -0.5, 2.1, 0.14, 0.74, 0.4, 0.43, P.woodDark);
    B(m, 2.3, 2.7, 0.89, 0.95, -0.55, -0.05, P.rubber);
    B(m, -2.45, -0.25, 1.3, 2.9, zB + 0.02, zB + 0.12, P.woodDark);
    for (let cx = 0; cx <= 4; cx++) B(m, -2.45 + cx * 0.55 - 0.025, -2.45 + cx * 0.55 + 0.025, 1.3, 2.9, zB + 0.12, zB + 0.34, P.trim);
    for (let ry = 0; ry <= 3; ry++) B(m, -2.45, -0.25, 1.3 + ry * 0.533 - 0.025, 1.3 + ry * 0.533 + 0.025, zB + 0.12, zB + 0.34, P.trim);
    for (let cx = 0; cx < 4; cx++) for (let ry = 0; ry < 3; ry++) {
      if (rand.chance(0.25)) continue;
      const x0 = -2.45 + cx * 0.55 + 0.08, y0 = 1.3 + ry * 0.533 + 0.06;
      B(m, x0, x0 + 0.39, y0, y0 + 0.22 + rand.range(0, 0.12), zB + 0.14, zB + 0.3, rand.pick([P.paper, P.paper, P.parcel, "#cfe3ff"]));
    }
    B(m, 1.3, 1.45, 0.95, 2.85, -0.42, -0.18, P.steelDark);
    B(m, -0.05, 1.45, 2.72, 2.88, -0.42, -0.18, P.steelDark);
    g.disc([m.cx + 1.95, m.fy + 2.35], 0.34, zB + 0.02, zB + 0.1, P.trim, m.i, 22);
    g.ring([m.cx + 1.95, m.fy + 2.35], 0.34, 0.06, zB + 0.1, zB + 0.13, P.ink, m.i, 22);
    B(m, 1.94, 1.96, 2.35, 2.6, zB + 0.1, zB + 0.14, P.ink);
    B(m, 1.95, 2.13, 2.34, 2.36, zB + 0.1, zB + 0.14, P.ink);
    B(m, -2.6, -1.95, 0, 0.55, -1.25, -0.55, P.woodLight);
    B(m, -2.5, -2.02, 0.55, 0.92, -1.15, -0.65, P.parcel);
    B(m, -2.5, -2.02, 0.7, 0.76, -1.16, -0.64, P.parcelTape);

    // ---- tokens room: chopping table, gantry, letter tiles, riser rail
    B(tk, -2.7, 2.2, 0.85, 0.95, -0.85, 0.25, P.steel);
    B(tk, -2.7, 2.2, 0.68, 0.85, 0.2, 0.26, P.steelDark);
    for (const x of [-2.4, -0.2, 1.95]) B(tk, x - 0.06, x + 0.06, 0, 0.7, 0.05, 0.17, P.steelDark);
    B(tk, -2.7, -1.0, 0.95, 0.96, -0.55, -0.05, P.rubber);
    B(tk, -1.45, -1.33, 0.95, 3.0, -0.75, -0.6, P.steelDark);
    B(tk, -0.37, -0.25, 0.95, 3.0, -0.75, -0.6, P.steelDark);
    B(tk, -1.45, -0.25, 2.88, 3.0, -0.75, 0.15, P.steelDark);
    P.tokens.forEach((c, k) => { const x = 0.25 + k * 0.62; B(tk, x - 0.26, x + 0.26, 1.85, 2.37, zB + 0.02, zB + 0.07, c); B(tk, x - 0.1, x + 0.1, 2.02, 2.2, zB + 0.07, zB + 0.09, P.trim); });
    const rail = (x0, x1, y0, y1, z0 = tz - 0.34, z1 = tz - 0.26) => g.box([x0, y0, z0], [x1, y1, z1], P.steelDark, EXT);
    // riser (tokens room), high shelf rail across the wall, drop (library): open rails the train slides along
    rail(tk.cx + Hs.riserDx - 0.06, tk.cx + Hs.riserDx + 0.06, tk.fy + 0.95, tk.fy + Hs.pipeHigh + 0.1);
    g.box([tk.cx + Hs.riserDx - 0.1, tk.fy + Hs.pipeHigh - 0.3, tz - 0.3], [lb.cx + Hs.dropDx + 0.1, tk.fy + Hs.pipeHigh - 0.22, tz + 0.28], P.steel, EXT);
    g.box([tk.cx + Hs.riserDx - 0.1, tk.fy + Hs.pipeHigh + 0.24, tz - 0.3], [lb.cx + Hs.dropDx + 0.1, tk.fy + Hs.pipeHigh + 0.3, tz - 0.22], P.steelDark, EXT);
    rail(lb.cx + Hs.dropDx - 0.06, lb.cx + Hs.dropDx + 0.06, lb.fy + 0.95, lb.fy + Hs.pipeHigh + 0.1);

    // ---- library: shelves full of books, reading table, lift rails, ladder
    const shelf = (dx0, dx1) => {
      B(lb, dx0, dx1, 0, 2.95, zB + 0.02, zB + 0.06, P.woodDark);
      B(lb, dx0, dx0 + 0.08, 0, 2.95, zB + 0.02, zB + 0.46, P.wood);
      B(lb, dx1 - 0.08, dx1, 0, 2.95, zB + 0.02, zB + 0.46, P.wood);
      for (const y of [0.25, 0.95, 1.6, 2.25, 2.88]) B(lb, dx0, dx1, y - 0.06, y, zB + 0.02, zB + 0.46, P.wood);
    };
    shelf(-2.65, -0.45); shelf(-0.15, 1.3);
    const hero = [[-2.0, 1.6], [-0.95, 2.25], [0.25, 1.6], [0.85, 2.25]];
    for (const [dx0, dx1] of [[-2.57, -0.53], [-0.07, 1.22]]) for (const y of [0.25, 0.95, 1.6, 2.25]) {
      let x = dx0;
      while (x < dx1 - 0.08) {
        const w = rand.range(0.08, 0.15), h = rand.range(0.36, 0.56);
        if (x + w > dx1) break;
        const isHero = hero.some(([hx, hy]) => Math.abs(hy - y) < 0.01 && x + w > hx - 0.11 && x < hx + 0.11);
        if (!isHero) B(lb, x, x + w - 0.012, y, y + Math.min(h, 0.6), zB + 0.07, zB + 0.42, rand.pick(P.books));
        x += w;
      }
    }
    B(lb, -2.3, 2.3, 0.85, 0.95, -0.85, 0.25, P.woodLight);
    for (const x of [-2.15, 0.2, 2.15]) B(lb, x - 0.06, x + 0.06, 0, 0.85, 0.05, 0.17, P.woodDark);
    for (const dx of [-0.32, 0.32]) B(lb, Hs.liftDx + dx - 0.05, Hs.liftDx + dx + 0.05, 0.95, roomH, tz - 0.36, tz - 0.26, P.steelDark);
    for (let y = 1.4; y < roomH; y += 0.6) B(lb, Hs.liftDx - 0.37, Hs.liftDx + 0.37, y - 0.03, y + 0.03, tz - 0.38, tz - 0.3, P.steel);
    for (const dx of [-0.32, 0.32]) B(wk, Hs.liftDx + dx - 0.05, Hs.liftDx + dx + 0.05, 0, 1.05, tz - 0.36, tz - 0.26, P.steelDark);
    g.box([lb.cx - 0.38, lb.fy + 0.95, zB + 0.5], [lb.cx - 0.3, lb.fy + 3.1, zB + 0.56], P.woodDark, lb.i, { rz: -0.12 });
    g.box([lb.cx - 0.02, lb.fy + 0.95, zB + 0.5], [lb.cx + 0.06, lb.fy + 3.1, zB + 0.56], P.woodDark, lb.i, { rz: -0.12 });
    for (let y = 1.25; y < 3.0; y += 0.32) g.box([lb.cx - 0.36 + (y - 2) * 0.12, lb.fy + y, zB + 0.5], [lb.cx + 0.06 + (y - 2) * 0.12, lb.fy + y + 0.05, zB + 0.56], P.wood, lb.i);

    // ---- workshop: conveyor, press gantry, gears go on moving meshes
    B(wk, -2.6, 2.3, 1.06, 1.2, -0.6, 0.0, P.rubber);
    B(wk, -2.65, 2.35, 0.94, 1.06, -0.66, 0.06, P.steelDark);
    for (const x of [-2.4, 0, 2.1]) B(wk, x - 0.06, x + 0.06, 0, 0.94, -0.4, -0.28, P.steelDark);
    for (const x of [-2.6, 2.3]) g.disc([wk.cx + x, wk.fy + 1.13], 0.11, 0.0, 0.08, P.steel, wk.i, 12);
    B(wk, -1.78, -1.66, 1.2, 3.0, -0.78, -0.62, P.steelDark);
    B(wk, 1.16, 1.28, 1.2, 3.0, -0.78, -0.62, P.steelDark);
    B(wk, -1.78, 1.28, 2.86, 3.02, -0.78, 0.1, P.steelDark);
    Hs.layers.forEach((c, k) => { const x = wk.stations[k]; B(wk, x - 0.2, x + 0.2, 2.98, 3.06, -0.3, 0.12, c); });

    // ---- check room: pedestal, tick board, magnifier stand, steps, plant
    B(ck, -0.35, 0.75, 0, 0.92, -0.75, 0.15, P.shade);
    B(ck, -0.45, 0.85, 0.92, 1.0, -0.85, 0.25, P.steel);
    g.disc([ck.cx + 0.2, ck.fy + 2.38], 0.62, zB + 0.02, zB + 0.1, P.ink, ck.i, 28);
    g.ring([ck.cx + 0.2, ck.fy + 2.38], 0.62, 0.07, zB + 0.1, zB + 0.13, P.trim, ck.i, 28);
    B(ck, 1.33, 1.47, 0, 2.95, -0.62, -0.5, P.steelDark);
    B(ck, 1.1, 1.7, 0, 0.08, -0.85, -0.3, P.steelDark);
    B(ck, -1.6, -1.0, 0, 0.75, -0.8, 0.2, P.woodLight);
    B(ck, -2.7, -1.6, 0, 0.5, -0.8, 0.2, P.wood);
    B(ck, 2.05, 2.45, 0, 0.42, -1.3, -0.9, P.chimney);
    g.disc([ck.cx + 2.25, ck.fy + 0.72], 0.3, -1.25, -0.95, "#3f9b5a", ck.i, 10);
    g.disc([ck.cx + 2.1, ck.fy + 0.95], 0.2, -1.2, -1.0, "#4fb56a", ck.i, 10);

    // ---- answer room: platform, tube to the chimney, bellows base + nozzle, speech-bubble poster
    B(an, -2.0, 1.45, 0, 0.5, -0.85, 0.25, P.shade);
    B(an, -2.0, 1.45, 0.44, 0.5, 0.25, 0.27, mixHex(an.wall, P.ink, 0.2));
    for (const dx of [-0.34, 0.34]) B(an, an.tube + dx - 0.05, an.tube + dx + 0.05, 0.5, roomH, tz - 0.36, tz - 0.26, P.steelDark);
    for (let y = 1.1; y < roomH; y += 0.55) B(an, an.tube - 0.39, an.tube + 0.39, y - 0.03, y + 0.03, tz - 0.38, tz - 0.3, P.steel);
    g.ring([an.cx + an.tube, an.fy + 0.53], 0.36, 0.08, tz - 0.05, tz + 0.05, P.answerRing, an.i, 16, { emit: 1 });
    B(an, 1.6, 2.5, 0, 0.5, -0.8, 0.2, P.steelDark);
    B(an, 1.0, 1.6, 0.6, 0.74, -0.38, -0.22, P.steel);
    const bub = [[0.1, 1.9], [1.3, 1.9], [1.45, 2.1], [1.45, 2.6], [1.3, 2.8], [0.1, 2.8], [-0.05, 2.6], [-0.05, 2.1]];
    g.prism(bub.map(([x, y]) => [an.cx + x, an.fy + y]), zB + 0.02, zB + 0.08, P.paper, an.i);
    g.prism([[an.cx + 0.25, an.fy + 1.92], [an.cx + 0.6, an.fy + 1.92], [an.cx + 0.15, an.fy + 1.62]], zB + 0.02, zB + 0.08, P.paper, an.i);
    for (let k = 0; k < 3; k++) g.disc([an.cx + 0.38 + k * 0.32, an.fy + 2.35], 0.08, zB + 0.08, zB + 0.1, an.wall, an.i, 10);

    // ---- outside: plinth, front step, roof, chimney, sign board with marquee bulbs
    const xo = W / 2 + Hs.plinth.out, zPf = zF + Hs.plinth.out, zPb = zBack - Hs.plinth.back;
    g.box([-xo, 0, zPb], [xo, base - 0.06, zPf], P.plinth);
    g.box([-xo - 0.03, base - 0.06, zPb], [xo + 0.03, base, zPf + 0.03], P.plinthTop);
    g.box([L.doorX - 0.75, base, zF + 0.25], [L.doorX + 0.75, base + 0.14, zF + 0.75], P.plinthTop);
    const R0 = Hs.roof, rb = W / 2 + R0.eave, rt = R0.top / 2, rz0 = zBack - R0.eave, rz1 = L.roofFront;
    g.prism([[-rb, topY], [rb, topY], [rt, topY + R0.h], [-rt, topY + R0.h]], rz0, rz1, P.roof);
    for (let y = topY + 0.3; y < topY + R0.h - 0.05; y += 0.34) {
      const hwy = rb - ((y - topY) / R0.h) * (rb - rt) - 0.05;
      g.box([-hwy, y - 0.035, rz1], [hwy, y + 0.035, rz1 + 0.025], P.roofAlt);
    }
    g.box([-rb - 0.05, topY - 0.02, rz0], [rb + 0.05, topY + 0.16, rz1 + 0.06], P.trim);
    g.box([-rt - 0.1, topY + R0.h, rz0], [rt + 0.1, topY + R0.h + 0.12, rz1], P.roofAlt);
    const cw = Hs.chimney.w / 2, cz = L.chimZ;
    g.box([L.chimX - cw, topY, cz - cw], [L.chimX + cw, L.chimTop - 0.16, cz + cw], P.chimney);
    for (let y = topY + 0.9; y < L.chimTop - 0.2; y += 0.3) g.box([L.chimX - cw, y, cz + cw], [L.chimX + cw, y + 0.035, cz + cw + 0.01], mixHex(P.chimney, P.ink, 0.25));
    g.box([L.chimX - cw - 0.1, L.chimTop - 0.16, cz - cw - 0.1], [L.chimX + cw + 0.1, L.chimTop, cz + cw + 0.1], P.chimneyCap);
    const sg = L.sign, sx = sg.w / 2, sy0 = sg.c[1] - sg.h / 2, sy1 = sg.c[1] + sg.h / 2, sz = sg.c[2];
    for (const x of [-sx * 0.6, sx * 0.6]) g.box([x - Hs.sign.post, topY, sz - 0.3], [x + Hs.sign.post, sy0, sz - 0.14], P.steelDark);
    g.box([-sx, sy0, sz - 0.14], [sx, sy1, sz], P.sign);
    const tw = 0.07;
    g.box([-sx - tw, sy1, sz - 0.14], [sx + tw, sy1 + tw, sz + 0.02], P.signTrim);
    g.box([-sx - tw, sy0 - tw, sz - 0.14], [sx + tw, sy0, sz + 0.02], P.signTrim);
    g.box([-sx - tw, sy0, sz - 0.14], [-sx, sy1, sz + 0.02], P.signTrim);
    g.box([sx, sy0, sz - 0.14], [sx + tw, sy1, sz + 0.02], P.signTrim);
    for (let x = -sx + 0.3; x <= sx - 0.29; x += 0.58) g.box([x - 0.05, sy1 + tw, sz - 0.08], [x + 0.05, sy1 + tw + 0.1, sz + 0.02], P.bulb, EXT, { emit: 1 });

    const shell = new THREE.Mesh(g.build(), roomMat);
    G.add(shell);

    // ---------------------------------------------------------------- moving parts (same room material)
    const part = (build, pos) => { const pg = new Geo(); build(pg); const mesh = new THREE.Mesh(pg.build(), roomMat); mesh.position.set(...pos); G.add(mesh); return mesh; };
    // stamp (mail): rod + red head, local y = 0 at the head's bottom
    const stamp = part((q) => { q.box([-0.05, 0.2, -0.05], [0.05, 1.2, 0.05], P.steel, m.i); q.box([-0.32, 0, -0.28], [0.32, 0.22, 0.28], P.door, m.i); q.box([-0.12, 0.22, -0.1], [0.12, 0.34, 0.1], P.woodDark, m.i); }, [m.cx + m.spot[0], 0, tz]);
    // blade (tokens): weight + blade + rod, local y = 0 at the cutting edge
    const blade = part((q) => {
      q.box([-0.05, 0.75, -0.04], [0.05, 2.0, 0.04], P.steel, tk.i);
      q.box([-0.24, 0.5, -0.32], [0.24, 0.78, 0.32], P.door, tk.i);
      q.prism([[-0.07, 0], [0.07, 0.08], [0.07, 0.5], [-0.07, 0.5]], -0.46, 0.46, "#e8eef7", tk.i);
    }, [tk.cx - 0.85, 0, tz]);
    // books (library): four hero books that slide out of the shelves
    const bookC = [P.tokens[0], P.tokens[1], P.tokens[2], P.tokens[3]];
    const books = hero.map(([dx, y], k) => part((q) => { q.box([-0.085, 0, -0.17], [0.085, 0.52, 0.17], bookC[k], lb.i); q.box([-0.087, 0.36, -0.172], [0.087, 0.41, 0.172], P.trim, lb.i); }, [lb.cx + dx, lb.fy + y, zB + 0.25]));
    const bookGlow = hero.map(([dx, y], k) => { const q = new THREE.Mesh(unitQuad, glowMat(bookC[k])); q.position.set(lb.cx + dx, lb.fy + y + 0.3, zB + 0.75); q.scale.set(1.3, 1.3, 1); G.add(q); return q; });
    // presses (workshop): rod + coloured head, local y = 0 at the head's bottom
    const presses = wk.stations.map((dx, k) => part((q) => { q.box([-0.05, 0.3, -0.05], [0.05, 1.3, 0.05], P.steel, wk.i); q.box([-0.26, 0, -0.3], [0.26, 0.36, 0.3], Hs.layers[k], wk.i); q.box([-0.27, 0.0, -0.31], [0.27, 0.05, 0.31], mixHex(Hs.layers[k], P.ink, 0.35), wk.i); }, [wk.cx + dx, 0, tz]));
    // gears (workshop back wall)
    const gear = (r, teeth, col, pos) => part((q) => {
      q.disc([0, 0], r, 0, 0.08, col, wk.i, 24);
      for (let k = 0; k < teeth; k++) {
        const a = (k / teeth) * Math.PI * 2, x = Math.cos(a) * (r + 0.05), y = Math.sin(a) * (r + 0.05);
        q.box([x - 0.07, y - 0.06, 0], [x + 0.07, y + 0.06, 0.08], col, wk.i, { rz: a });   // box rotates about its centre
      }
      q.disc([0, 0], r * 0.32, 0.08, 0.12, P.steelDark, wk.i, 12);
      q.box([-r * 0.8, -0.04, 0.08], [r * 0.8, 0.04, 0.1], P.steelDark, wk.i);
    }, pos);
    const gearA = gear(0.46, 12, P.steel, [wk.cx + 1.78, wk.fy + 2.4, zB + 0.03]);
    const gearB = gear(0.3, 8, P.woodLight, [wk.cx + 2.3, wk.fy + 1.72, zB + 0.03]);
    // magnifier arm (check): pivot group, arm along local +x, lens ring at the end
    const lensLen = 1.92;
    const lensArm = part((q) => {
      q.box([0, -0.05, -0.05], [lensLen - 0.5, 0.05, 0.05], P.steelDark, ck.i);
      q.ring([lensLen, 0], 0.5, 0.09, -0.06, 0.06, P.ink, ck.i, 22);
      q.disc([0, 0], 0.1, -0.08, 0.08, P.steel, ck.i, 10);
    }, [ck.cx + 1.4, ck.fy + 2.9, tz + 0.5]);
    const lensGlass = new THREE.Mesh(unitQuad, glowMat(P.glass));
    lensGlass.scale.set(1.0, 1.0, 1);
    G.add(lensGlass);
    // tick mark (check): its own flat material so it can light up green
    const tickMat = flatMat(P.tickOff);
    const tq = new Geo();
    tq.box([-0.36, -0.07, 0], [0.0, 0.07, 0.05], "#ffffff", EXT, { rz: -0.8 });
    tq.box([-0.12, -0.07, 0], [0.62, 0.07, 0.05], "#ffffff", EXT, { rz: 0.9 });
    const tick = new THREE.Mesh(tq.build(), tickMat);
    tick.position.set(ck.cx + 0.12, ck.fy + 2.28, zB + 0.13);
    G.add(tick);
    // bellows (answer): three slabs; local y = 0 at the platform top
    const bellows = part((q) => {
      q.box([-0.42, 0, -0.45], [0.42, 0.18, 0.45], mixHex(an.wall, P.ink, 0.3), an.i);
      q.box([-0.38, 0.18, -0.4], [0.38, 0.42, 0.4], mixHex(an.wall, P.ink, 0.12), an.i);
      q.box([-0.42, 0.42, -0.45], [0.42, 0.6, 0.45], mixHex(an.wall, P.ink, 0.3), an.i);
      q.box([-0.06, 0.6, -0.06], [0.06, 0.85, 0.06], P.steel, an.i);
      q.box([-0.25, 0.85, -0.08], [0.25, 0.95, 0.08], P.woodDark, an.i);
    }, [an.cx + 2.05, an.fy + 0.5, -0.3]);

    // ---------------------------------------------------------------- the front: two half-fronts on side hinges + the door
    const thick = Hs.front.thick, zFF = zF + thick;
    const halves = [-1, 1].map((side) => {
      const hingeX = side * W / 2;
      const q = new Geo([hingeX, 0, zFF]);
      const xa = side < 0 ? -W / 2 : 0, xb = side < 0 ? 0 : W / 2;
      const D = Hs.door, dx0 = L.doorX - D.w / 2, dx1 = L.doorX + D.w / 2, dy0 = m.fy, dy1 = m.fy + D.h;
      const panel = (z0, z1, col) => {
        if (side < 0) {
          q.box([xa, base, z0], [dx0, topY, z1], col);
          q.box([dx1, base, z0], [xb, topY, z1], col);
          q.box([dx0, base, z0], [dx1, dy0, z1], col);
          q.box([dx0, dy1, z0], [dx1, topY, z1], col);
        } else q.box([xa, base, z0], [xb, topY, z1], col);
      };
      panel(zF, zF + 0.1, P.inside);
      panel(zF + 0.1, zFF, P.facade);
      // the inside of the front: each room's wallpaper continues onto it (same room index: it lights with its room)
      for (const rm of L.rooms) {
        const x0 = Math.max(rm.x0, xa), x1 = Math.min(rm.x1, xb);
        if (x1 - x0 < 0.2) continue;
        const zi0 = zF - 0.014, zi1 = zF;
        const inX0 = x0 + (x0 === rm.x0 ? 0.06 : 0), inX1 = x1 - (x1 === rm.x1 ? 0.06 : 0);
        if (side < 0 && rm.id === "mail") {
          q.box([inX0, rm.fy, zi0], [dx0 - 0.08, rm.y1, zi1], rm.wall, rm.i);
          q.box([dx1 + 0.08, rm.fy, zi0], [inX1, rm.y1, zi1], rm.wall, rm.i);
          q.box([dx0 - 0.08, dy1 + 0.08, zi0], [dx1 + 0.08, rm.y1, zi1], rm.wall, rm.i);
        } else q.box([inX0, rm.fy, zi0], [inX1, rm.y1, zi1], rm.wall, rm.i);
        q.box([inX0, rm.fy, zi0 - 0.01], [inX1, rm.fy + 0.95, zi0], mixHex(rm.wall, P.ink, 0.16), rm.i);
        q.box([inX0, rm.fy + 0.95, zi0 - 0.02], [inX1, rm.fy + 1.01, zi0], P.trim, rm.i);
        const wins = rm.id === "mail" ? [Hs.window.dx] : [-Hs.window.dx, Hs.window.dx];
        for (const wdx of wins) {
          const wx = rm.cx + wdx;
          if (wx < x0 + 0.5 || wx > x1 - 0.5) continue;
          const ww = Hs.window.w, wh = Hs.window.h, wy0 = rm.fy + Hs.window.sill;
          q.box([wx - ww / 2 - 0.08, wy0 - 0.08, zi0 - 0.03], [wx + ww / 2 + 0.08, wy0 + wh + 0.08, zi0 - 0.01], P.trim, rm.i);
          q.box([wx - ww / 2, wy0, zi0 - 0.035], [wx + ww / 2, wy0 + wh, zi0 - 0.03], P.skyMid, rm.i);
          q.box([wx - 0.03, wy0, zi0 - 0.05], [wx + 0.03, wy0 + wh, zi0 - 0.035], P.trim, rm.i);
          q.box([wx - ww / 2, wy0 + wh / 2 - 0.03, zi0 - 0.05], [wx + ww / 2, wy0 + wh / 2 + 0.03, zi0 - 0.035], P.trim, rm.i);
        }
      }
      const fz = zFF;
      for (let y = base + 0.5; y < topY - 0.1; y += 0.42) q.box([xa + (side < 0 ? 0.3 : 0), y - 0.02, fz], [xb - (side > 0 ? 0.3 : 0), y + 0.02, fz + 0.012], P.facadeLine);
      q.box([xa, base, fz], [xb, base + 0.3, fz + 0.05], P.plinthTop);
      q.box([xa, L.floorY(1) - wall - 0.04, fz], [xb, L.floorY(1) + 0.04, fz + 0.05], P.trim);
      q.box([xa, topY - 0.22, fz], [xb, topY, fz + 0.05], P.trim);
      q.box(side < 0 ? [xa, base, fz] : [xb - 0.3, base, fz], side < 0 ? [xa + 0.3, topY, fz + 0.06] : [xb, topY, fz + 0.06], P.trim);
      q.box(side < 0 ? [-0.1, base, fz] : [0, base, fz], side < 0 ? [0, topY, fz + 0.04] : [0.1, topY, fz + 0.04], P.trim);
      if (side < 0) {
        q.box([dx0 - 0.12, dy0, fz], [dx0, dy1 + 0.12, fz + 0.06], P.trim);
        q.box([dx1, dy0, fz], [dx1 + 0.12, dy1 + 0.12, fz + 0.06], P.trim);
        q.box([dx0 - 0.12, dy1, fz], [dx1 + 0.12, dy1 + 0.12, fz + 0.06], P.trim);
        q.prism([[dx0 - 0.3, dy1 + 0.12], [dx1 + 0.3, dy1 + 0.12], [L.doorX, dy1 + 0.55]], fz, fz + 0.3, P.door);
      }
      const glass = [];
      for (const rm of L.rooms) {
        const wins = rm.id === "mail" ? [Hs.window.dx] : [-Hs.window.dx, Hs.window.dx];
        for (const wdx of wins) {
          const wx = rm.cx + wdx;
          if ((side < 0) !== (wx < 0)) continue;
          const ww = Hs.window.w, wh = Hs.window.h, wy0 = rm.fy + Hs.window.sill, wy1 = wy0 + wh;
          q.box([wx - ww / 2 - 0.1, wy0 - 0.1, fz], [wx + ww / 2 + 0.1, wy1 + 0.1, fz + 0.05], P.trim);
          q.box([wx - ww / 2 - 0.2, wy0 - 0.2, fz], [wx + ww / 2 + 0.2, wy0 - 0.08, fz + 0.12], P.trim);
          q.box([wx - 0.035, wy0, fz + 0.06], [wx + 0.035, wy1, fz + 0.09], P.trim);
          q.box([wx - ww / 2, wy0 + wh * 0.5 - 0.035, fz + 0.06], [wx + ww / 2, wy0 + wh * 0.5 + 0.035, fz + 0.09], P.trim);
          for (const s of [-1, 1]) q.box([wx + s * (ww / 2 + 0.12) - (s < 0 ? ww * 0.42 : 0), wy0, fz], [wx + s * (ww / 2 + 0.12) + (s > 0 ? ww * 0.42 : 0), wy1, fz + 0.04], P.shutter);
          glass.push({ room: rm.i, c: [wx - hingeX, (wy0 + wy1) / 2, fz + 0.055 - zFF], w: ww, h: wh });
        }
      }
      const piv = new THREE.Group();
      piv.position.set(hingeX, 0, zFF);
      piv.add(new THREE.Mesh(q.build(), roomMat));
      const panes = glass.map((gl) => { const mat = flatMat(P.glassOff); const pane = new THREE.Mesh(unitQuad, mat); pane.position.set(...gl.c); pane.scale.set(gl.w, gl.h, 1); pane.userData.room = gl.room; piv.add(pane); return pane; });
      G.add(piv);
      return { piv, panes, side };
    });
    // the door: a leaf in the left half, hinged on its left edge, swings inward
    const D = Hs.door, doorPiv = new THREE.Group();
    {
      const q = new Geo();
      q.box([0, 0, -0.12], [D.w, D.h, -0.02], P.door);
      q.box([0.14, D.h * 0.55, -0.02], [D.w - 0.14, D.h - 0.16, 0.0], mixHex(P.door, P.ink, 0.22));
      q.box([0.14, 0.18, -0.02], [D.w - 0.14, D.h * 0.45, 0.0], mixHex(P.door, P.ink, 0.22));
      q.box([D.w - 0.22, D.h * 0.48 - 0.06, -0.02], [D.w - 0.1, D.h * 0.48 + 0.06, 0.04], P.knob);
      doorPiv.add(new THREE.Mesh(q.build(), roomMat));
      doorPiv.position.set(L.doorX - D.w / 2 - (-W / 2), m.fy, 0);
      halves[0].piv.add(doorPiv);
    }

    // ---------------------------------------------------------------- glows: a warm haze over each lit room
    const roomGlow = L.rooms.map((rm) => {
      const q = new THREE.Mesh(unitQuad, glowMat(P.halo, { c: [0.5, (rm.lamp[1] - rm.fy) / roomH], r: [0.42, 0.55] }));
      q.position.set(rm.cx, rm.fy + roomH / 2, zF + 0.02);
      q.scale.set(L.roomW, roomH, 1);
      q.renderOrder = 5;
      G.add(q);
      return q;
    });
    L.rooms.forEach((rm) => roomU.uLamp.value[rm.i].set(...rm.lamp));
    stage.scene.add(G);

    const glassOff = hexRgb(P.glassOff), glassOn = hexRgb(P.glassOn);
    G.userData.update = (t, plan) => {
      const lv = L.rooms.map((rm) => plan.lightAt(rm.i, t));
      lv.forEach((v, i) => { roomU.uLevel.value[i] = v; });
      roomU.uLevel.value[EXT] = plan.exteriorAt(t);
      const ang = plan.frontAt(t);
      halves[0].piv.rotation.y = -ang;
      halves[1].piv.rotation.y = ang;
      for (const h of halves) for (const pane of h.panes) pane.material.userData.setRGB(rooms.mixRgb(glassOff, glassOn, clamp(lv[pane.userData.room])));
      doorPiv.rotation.y = 1.45 * plan.doorAt(t);
      const fl = spec.levels.finale;
      roomGlow.forEach((q, i) => { q.material.uniforms.uK.value = Lt.glow * clamp(lv[i]) + (Lt.glowFinale - Lt.glow) * clamp((lv[i] - 1) / (fl - 1)); });

      const A = plan.actionsAt(t);
      stamp.position.y = m.fy + lerp(2.28, m.spot[1] + 2 * spec.courier.token * 0.8, A.mail.stamp);   // meets the squashed parcel
      blade.position.y = tk.fy + lerp(1.98, 0.97, A.tokens.blade);
      books.forEach((b, k) => { const u = A.library.books[k]; b.position.z = zB + 0.25 + 0.55 * u; b.rotation.x = 0.25 * u; bookGlow[k].material.uniforms.uK.value = 0.55 * u; });
      presses.forEach((p, k) => { p.position.y = wk.fy + lerp(2.3, 1.2 + spec.courier.token * 0.65, A.workshop.press[k]); });
      gearA.rotation.z = -A.workshop.gear * 2.4;
      gearB.rotation.z = A.workshop.gear * 2.4 * (0.46 / 0.3) + 0.2;
      const aRest = -1.25, aOn = Math.atan2(-1.5, -1.2);   // parked hanging down beside the stand -> swung over the orb
      lensArm.rotation.z = lerp(aRest, aOn, A.check.lens) + 0.08 * Math.sin(t * 5) * A.check.scan;
      const la = lensArm.rotation.z;
      lensGlass.position.set(lensArm.position.x + Math.cos(la) * lensLen, lensArm.position.y + Math.sin(la) * lensLen, lensArm.position.z + 0.02);
      lensGlass.material.uniforms.uK.value = 0.12 + 0.25 * A.check.lens;
      tickMat.userData.setRGB(rooms.mixRgb(hexRgb(P.tickOff), hexRgb(P.tick), Math.max(A.check.tick, A.check.scan)));
      const ts = 1 + 0.35 * A.check.tickFlash;
      tick.scale.set(ts, ts, 1);
      const pu = A.answer.pump;
      bellows.scale.y = 1 - 0.4 * pu;
    };
    return G;
  }

  // ---------------------------------------------------------------- the courier
  /**
   * courier(layout) -> Group. userData.update(state) with state = plan.courierAt(t):
   *   four pieces (parcel quarters -> tokens), the parcel's tape, the answer orb (-> speech bubble with a tick), a halo.
   */
  function courier(L) {
    const G = new THREE.Group();
    const pieceMats = [0, 1, 2, 3].map(() => flatMat(P.parcel, 1));
    const pieces = pieceMats.map((mat) => { const q = new THREE.Mesh(unitBox, mat); G.add(q); return q; });
    const tok = spec.courier.token;
    const tape = new THREE.Group();
    const tapeMat = flatMat(P.parcelTape);
    const t1 = new THREE.Mesh(unitBox, tapeMat); t1.scale.set(2 * tok + 0.02, 0.14, 2 * tok + 0.02); tape.add(t1);
    const t2 = new THREE.Mesh(unitBox, tapeMat); t2.scale.set(0.14, 2 * tok + 0.02, 2 * tok + 0.02); tape.add(t2);
    G.add(tape);
    const orbMat = flatMat(P.answer, 1);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), orbMat);
    G.add(orb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 48), flatMat(P.answerRing));
    G.add(ring);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4), flatMat(P.answer));
    G.add(tail);
    const bTick = new THREE.Group();
    const btMat = flatMat(P.tick);
    for (const [a, b, rz] of [[[-0.36, -0.08], [0.0, 0.08], -0.8], [[-0.1, -0.08], [0.62, 0.08], 0.9]]) {
      const q = new THREE.Mesh(unitBox, btMat);
      q.scale.set(b[0] - a[0], b[1] - a[1], 0.06);
      q.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
      q.rotation.z = rz;
      bTick.add(q);
    }
    G.add(bTick);
    const halo = new THREE.Mesh(unitQuad, glowMat(P.halo));
    halo.renderOrder = 6;
    G.add(halo);
    stage.scene.add(G);
    const B = spec.courier.bubble, O = spec.courier.orb;
    G.userData.update = (s) => {
      s.pieces.forEach((pc, j) => {
        const q = pieces[j];
        q.visible = pc.vis && pc.s[1] > 0.004;
        q.position.set(...pc.p);
        q.scale.set(Math.max(pc.s[0], 1e-3), Math.max(pc.s[1], 1e-3), Math.max(pc.s[2], 1e-3));
        pieceMats[j].userData.setRGB(pc.rgb);
      });
      tape.visible = s.block.vis;
      tape.position.set(s.block.p[0], s.block.p[1] - tok + tok * s.block.squash, s.block.p[2]);
      tape.scale.set(1 + (1 - s.block.squash) * 0.5, s.block.squash, 1);
      const o = s.orb, k = o.bubble;
      orb.visible = o.vis && o.scale > 0.004;
      ring.visible = tail.visible = orb.visible;
      orb.position.set(...o.p);
      const sq = o.squash ?? 1;
      const sx = lerp(O, B[0], k) * o.scale, sy = lerp(O, B[1], k) * o.scale * sq, sz = lerp(O, B[2], k) * o.scale;
      orb.scale.set(Math.max(sx, 1e-3), Math.max(sy, 1e-3), Math.max(sz, 1e-3));
      orbMat.userData.setRGB(o.rgb);
      ring.position.set(o.p[0], o.p[1], o.p[2]);
      ring.scale.set(Math.max(sx * 1.04, 1e-3), Math.max(sy * 1.04, 1e-3), Math.max(o.scale * (1 - k * 0.3), 1e-3));
      tail.visible = orb.visible && k > 0.02;   // points down-right, at the chimney it came out of
      tail.position.set(o.p[0] + sx * 0.28, o.p[1] - sy * 0.42 - 0.12 * k, o.p[2]);
      tail.rotation.set(0, 0, Math.PI + 0.6);
      tail.scale.setScalar(Math.max(k, 1e-3));
      bTick.visible = orb.visible && k > 0.4;
      bTick.position.set(o.p[0] - 0.12 * k, o.p[1], o.p[2] + sz * 0.5 + 0.04);
      bTick.scale.setScalar(Math.max(clamp((k - 0.4) / 0.6) * 1.35, 1e-3));
      // the halo sits just BEHIND the courier: depth-tested, so the courier itself stays crisp and only its rim glows
      halo.visible = s.halo.k > 0.01;
      halo.position.set(s.halo.p[0], s.halo.p[1], s.halo.p[2] - 0.45 - 0.3 * k);
      const hs = spec.courier.halo * (1 + k * 1.1);
      halo.scale.set(hs, hs, 1);
      halo.material.uniforms.uK.value = Lt.halo * s.halo.k;
    };
    return G;
  }

  // ---------------------------------------------------------------- the caption: a flip sign on the roof
  /** caption(layout, labels) -> Group. userData.show(index, flip) — flip 0..1 = the card's vertical scale mid-flip. */
  function caption(L, labels) {
    const G = new THREE.Group();
    const maxW = L.sign.w - 0.7;
    const cards = labels.map((text) => {
      const lab = createTextLabel(text, { ...textStyle, color: P.signInk });
      if (lab.scale.x > maxW) lab.scale.multiplyScalar(maxW / lab.scale.x);
      lab.userData.base = [lab.scale.x, lab.scale.y];
      lab.position.set(L.sign.c[0], L.sign.c[1] - 0.02, L.sign.c[2] + 0.03);
      lab.visible = false;
      G.add(lab);
      return lab;
    });
    stage.scene.add(G);
    G.userData.cards = cards;
    G.userData.show = (index, flip = 1) => {
      cards.forEach((c, k) => {
        c.visible = k === index && flip > 0.01;
        c.scale.set(c.userData.base[0], Math.max(c.userData.base[1] * flip, 1e-3), 1);
      });
    };
    return G;
  }

  // ---------------------------------------------------------------- sky + ground
  /** backdrop(layout) -> Group. userData.update(night 0..1): a dusk gradient that deepens to night with stars. */
  function backdrop(L) {
    const G = new THREE.Group();
    const skyU = {
      uTop: { value: v3(P.skyTop) }, uMid: { value: v3(P.skyMid) }, uLow: { value: v3(P.skyLow) },
      uTopN: { value: v3(P.skyTopNight) }, uMidN: { value: v3(P.skyMidNight) }, uLowN: { value: v3(P.skyLowNight) },
      uNight: { value: 0 }, uY: { value: new THREE.Vector3(0, 9, 22) },
    };
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(240, 90), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS }));
    sky.position.set(0, 30, -40);
    G.add(sky);
    const gU = {
      uGround: { value: v3(P.ground) }, uFar: { value: v3(P.groundFar) }, uShadow: { value: v3(P.groundShadow) }, uNight: { value: 0 },
      uFoot: { value: new THREE.Vector4(0, (L.box[0][2] + L.box[1][2]) / 2, L.box[1][0], (L.box[1][2] - L.box[0][2]) / 2) },
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 80).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: gU, vertexShader: SKY_VS, fragmentShader: GROUND_FS }));
    ground.position.set(0, -0.001, -20);
    G.add(ground);
    stage.scene.add(G);
    G.userData.update = (night) => { skyU.uNight.value = night; gU.uNight.value = night; };
    return G;
  }

  const props = { house, courier, caption, backdrop };
  return {
    spec, palette: P, materials, lights, post, textStyle, props, sfx: spec.sfx, camera: spec.camera,
    factories: {},
    plan: rooms,   // the Node-safe planner (houseLayout, planRoute, plan, pulse, hexRgb ...)
  };
}
