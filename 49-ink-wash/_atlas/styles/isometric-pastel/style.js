// styles/isometric-pastel/style.js — Isometric Pastel: flat three-tone isometric illustration in true 3D.
// Every surface uses an UNLIT tone shader that picks one of three exact sRGB colours from the world normal
// (top = +Y, left = +Z, right = +X under the locked 45 deg / 35.264 deg orthographic camera). No lights, no post.
// Long shadows are planar projections of the casters onto a receiver plane (ground or a slab top) at a fixed
// angle, drawn in one flat tone and clipped to the receiver. Props are synchronous + seeded; time enters only via
// userData.update(t) hooks the scene calls (packets, LEDs, fans, screens, ripples, the stack).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { getOverlay, projectToScreen } from "../../kit/overlay.js";
import { hairline } from "../../kit/callouts.js";
import { sweepGeometry, profileSweep, pathFrames } from "../../kit/paths.js";
import { filletPath, pathLength, pointAt } from "../../kit/pathmath.js";
import { rng, clamp, smoothstep, ease } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as plan from "./iso.js";
export { STYLE_SPEC };

const { hexToRgb, mixHex, threeTones, floorOffset } = plan;
const PX = 2 / 1080; // overlay units per frame pixel

// ---------------------------------------------------------------- shaders (exact sRGB out: no colorspace/tonemap includes)
const TONE_VS = /* glsl */ `
varying vec3 vN;
void main() {
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const TONE_FS = /* glsl */ `
uniform vec3 uTop; uniform vec3 uLeft; uniform vec3 uRight; uniform float uCut;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN + vec3(0.0, 1e-6, 0.0));
  vec3 c = n.y > uCut ? uTop : (n.y < -uCut ? uRight : (dot(n.xz, vec2(0.70710678, -0.70710678)) > 0.0 ? uRight : uLeft));
  gl_FragColor = vec4(c, 1.0);
}`;
const SHADOW_VS = /* glsl */ `
uniform mat4 uM; uniform float uY0; uniform vec2 uK;
varying vec2 vP;
void main() {
  vec4 p = uM * vec4(position, 1.0);
  float h = max(p.y - uY0, 0.0);
  vec3 q = vec3(p.x + h * uK.x, uY0, p.z + h * uK.y);
  vP = q.xz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(q, 1.0);
}`;
const SHADOW_FS = /* glsl */ `
uniform vec3 uColor; uniform vec4 uBounds;
varying vec2 vP;
void main() {
  if (vP.x < uBounds.x || vP.y < uBounds.y || vP.x > uBounds.z || vP.y > uBounds.w) discard;
  gl_FragColor = vec4(uColor, 1.0);
}`;
const GRID_VS = /* glsl */ `
varying vec2 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GRID_FS = /* glsl */ `
uniform vec3 uBg; uniform vec3 uDot; uniform float uCell; uniform float uR; uniform float uMajor; uniform float uMajorR;
varying vec2 vW;
float dotMask(vec2 p, float cell, float r) {
  vec2 q = p / cell; vec2 f = (fract(q + 0.5) - 0.5) * cell;
  float d = length(f); float aa = fwidth(d) * 0.75 + 1e-5;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}
void main() {
  float m = max(dotMask(vW, uCell, uR), dotMask(vW, uCell * uMajor, uMajorR));
  gl_FragColor = vec4(mix(uBg, uDot, m), 1.0);
}`;
const v3 = (hex) => new THREE.Vector3(...hexToRgb(hex));

/**
 * createStyle(stage, opts?) -> style   (opts: { post = true } — the spec has no post stack anyway)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const col = (c) => (c == null ? P.cloud : P[c] ?? c); // palette name or hex
  const OUT = spec.outline;

  // ---------------------------------------------------------------- tone materials
  const toneCache = new Map();
  /** toneMat(base, { unique }) -> ShaderMaterial; userData.setBase(hex), setMix(toward, k) (flashes), tones. */
  function toneMat(base, o = {}) {
    const hex = col(base);
    if (!o.unique && toneCache.has(hex)) return toneCache.get(hex);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Vector3() }, uLeft: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3() }, uCut: { value: 0.55 } },
      vertexShader: TONE_VS, fragmentShader: TONE_FS,
      polygonOffset: OUT.enabled, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    m.name = `tone:${hex}`;
    let cur = null;
    const apply = (h) => {
      if (h === cur) return;
      cur = h;
      const T = threeTones(h, spec.tones);
      m.uniforms.uTop.value.copy(v3(T.top)); m.uniforms.uLeft.value.copy(v3(T.left)); m.uniforms.uRight.value.copy(v3(T.right));
      m.userData.tones = T;
    };
    apply(hex);
    m.userData = { ...m.userData, isTone: true, base: hex, tones: threeTones(hex, spec.tones) };
    m.userData.setBase = (h) => apply(col(h));
    m.userData.setMix = (toward, k) => apply(k > 0.002 ? mixHex(hex, col(toward), clamp(k)) : hex);
    if (!o.unique) toneCache.set(hex, m);
    return m;
  }
  const lineCache = new Map();
  function addOutline(mesh, hex) {
    if (!OUT.enabled) return;
    const c = mixHex(col(hex), OUT.toward, OUT.k);
    if (!lineCache.has(c)) lineCache.set(c, new THREE.LineBasicMaterial({ color: c }));
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), lineCache.get(c));
    l.userData.noShadow = true;
    mesh.add(l);
  }
  /** mesh(geometry, color, { unique, shadow = true }) -> Mesh with the three-tone material (+ optional outline). */
  function mesh(geo, color, o = {}) {
    const m = new THREE.Mesh(geo, toneMat(color, o));
    if (o.shadow === false) m.userData.noShadow = true;
    addOutline(m, color);
    return m;
  }
  const place = (obj, at) => { if (at) obj.position.set(at[0] ?? 0, at[1] ?? 0, at[2] ?? 0); return obj; };

  // ---------------------------------------------------------------- primitive builders (origin = bottom centre)
  const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  /** block({ w, h, d, color, at, unique, shadow }) -> Mesh (bottom-centre origin; userData.dims). Rise it with scale.y. */
  function block(o = {}) {
    const { w = 1, h = 1, d = 1 } = o;
    const m = place(mesh(boxGeo(w, h, d), o.color ?? "cloud", o), o.at);
    m.userData.dims = { w, h, d };
    return m;
  }
  /** prism({ w, h, d, color, axis = "x" }) -> gable/triangular prism (ridge along axis), bottom-centre origin. */
  function prism(o = {}) {
    const { w = 1, h = 0.6, d = 1, axis = "x" } = o;
    const s = new THREE.Shape([new THREE.Vector2(-(axis === "x" ? d : w) / 2, 0), new THREE.Vector2((axis === "x" ? d : w) / 2, 0), new THREE.Vector2(0, h)]);
    const L = axis === "x" ? w : d;
    const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }).translate(0, 0, -L / 2);
    if (axis === "x") g.rotateY(Math.PI / 2);
    const m = place(mesh(g, o.color ?? "rose", o), o.at);
    m.userData.dims = { w, h, d };
    return m;
  }
  /** ramp({ w, h, d, color, up = "+x" }) -> wedge rising toward `up` ("+x"|"-x"|"+z"|"-z"). */
  function ramp(o = {}) {
    const { w = 1, h = 0.5, d = 1, up = "+x" } = o;
    const along = up.endsWith("x") ? w : d, across = up.endsWith("x") ? d : w;
    const s = new THREE.Shape([new THREE.Vector2(-along / 2, 0), new THREE.Vector2(along / 2, 0), new THREE.Vector2(along / 2, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: across, bevelEnabled: false }).translate(0, 0, -across / 2);
    g.rotateY({ "+x": 0, "-x": Math.PI, "+z": -Math.PI / 2, "-z": Math.PI / 2 }[up]);
    return place(mesh(g, o.color ?? "butter", o), o.at);
  }
  /** cylinder({ r, h, color, segments = 40, rTop }) -> Mesh; sides split into left/right tones at the camera line. */
  function cylinder(o = {}) {
    const { r = 0.5, h = 1, segments = 40 } = o;
    const g = new THREE.CylinderGeometry(o.rTop ?? r, r, h, segments, 1).translate(0, h / 2, 0);
    return place(mesh(g, o.color ?? "sky", o), o.at);
  }
  /**
   * inset(parent, { face = "left"|"right"|"top", u = 0, v = 0, w, h, color, depth = .02 }) -> Mesh: a flat detail panel
   *   (window, vent, screen, LED, icon) proud of a block's face by `depth`. (u, v) = centre on the face in metres from
   *   the face centre: left (+Z face): u along +X, v up; right (+X face): u along -Z, v up; top: u along +X, v along -Z.
   */
  function inset(parent, o = {}) {
    const D = parent.userData.dims ?? { w: 1, h: 1, d: 1 };
    const { face = "left", u = 0, v = 0, w = 0.2, h = 0.2, depth = 0.02 } = o;
    let m;
    if (face === "left") { m = mesh(new THREE.BoxGeometry(w, h, depth), o.color ?? "ink", { ...o, shadow: false }); m.position.set(u, D.h / 2 + v, D.d / 2 + depth / 2); }
    else if (face === "right") { m = mesh(new THREE.BoxGeometry(depth, h, w), o.color ?? "ink", { ...o, shadow: false }); m.position.set(D.w / 2 + depth / 2, D.h / 2 + v, -u); }
    else { m = mesh(new THREE.BoxGeometry(w, depth, h), o.color ?? "ink", { ...o, shadow: false }); m.position.set(u, D.h + depth / 2, -v); }
    parent.add(m);
    return m;
  }
  /** isoLabel(text, { plane = "left"|"right"|"top", height = .4, color, weight, font }) -> text plane aligned to an iso plane. */
  function isoLabel(text, o = {}) {
    const m = createTextLabel(text, { ...textStyle, height: o.height ?? 0.4, color: col(o.color ?? spec.text.color), weight: o.weight ?? textStyle.weight, font: o.font ?? textStyle.font, padding: 0.08 });
    if (o.plane === "right") m.rotation.y = Math.PI / 2;
    else if (o.plane === "top") m.rotation.x = -Math.PI / 2;
    m.userData.noShadow = true;
    return place(m, o.at);
  }

  // ---------------------------------------------------------------- composite props
  /**
   * slab({ w, d, h = .5, color, posts = 0 (clearance height above the top), postSize = .28, number, numberColor }) -> Group
   *   A floor plate; corner posts stand on its top (the next floor rests on them). userData: { top, bounds [x0,z0,x1,z1],
   *   body (slab mesh: setMix for flashes), posts[] }. number -> iso label printed on the slab's left (+Z) face.
   */
  function slab(o = {}) {
    const { w = 7, d = 5, h = 0.5, posts = 0, postSize = 0.28 } = o;
    const g = new THREE.Group();
    const body = block({ w, h, d, color: o.color ?? "sky", unique: true });
    g.add(body);
    g.userData = { top: h, w, d, bounds: [-w / 2, -d / 2, w / 2, d / 2], body, posts: [] };
    if (posts > 0) {
      const ins = postSize / 2 + 0.12;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const p = block({ w: postSize, h: posts, d: postSize, color: o.postColor ?? o.color ?? "sky", unique: true, at: [sx * (w / 2 - ins), h, sz * (d / 2 - ins)] });
        g.add(p);
        g.userData.posts.push(p);
      }
    }
    if (o.number != null) {
      const lab = isoLabel(String(o.number), { plane: "left", height: h * 0.72, color: o.numberColor ?? "ink", at: [-w / 2 + h * 0.9, h / 2, d / 2 + 0.006] });
      g.add(lab);
      g.userData.label = lab;
    }
    return g;
  }
  /** chip({ size = .9, h = .16, color = "slate", die = "lilac", pins = "butter", pinCount = 4 }) -> Group: package + die + pins. */
  function chip(o = {}) {
    const { size = 0.9, h = 0.16, pinCount = 4 } = o;
    const g = new THREE.Group();
    const body = block({ w: size, h, d: size, color: o.color ?? "slate" });
    g.add(body);
    inset(body, { face: "top", w: size * 0.5, h: size * 0.5, color: o.die ?? "lilac", depth: 0.03 });
    const pw = size * 0.08, step = size / (pinCount + 1);
    for (let i = 1; i <= pinCount; i++) {
      const s = -size / 2 + i * step;
      for (const [x, z, w, d] of [[s, size / 2 + pw * 0.9, pw, pw * 1.8], [s, -size / 2 - pw * 0.9, pw, pw * 1.8], [size / 2 + pw * 0.9, s, pw * 1.8, pw], [-size / 2 - pw * 0.9, s, pw * 1.8, pw]]) {
        const p = block({ w, h: h * 0.35, d, color: o.pins ?? "butter", shadow: false, at: [x, 0, z] });
        g.add(p);
      }
    }
    g.userData.body = body;
    return g;
  }
  /**
   * serverRack({ w = .8, h = 1.8, d = .9, color = "cloud", units = 6, led = "mint", ledOff = "slate", seed, rate = 4 }) -> Group
   *   Front (left, +Z) face: unit slots + LEDs. userData.update(t): LEDs chase on a fixed clock (mechanical, seeded phase).
   */
  function serverRack(o = {}) {
    const { w = 0.8, h = 1.8, d = 0.9, units = 6, rate = 4 } = o;
    const g = new THREE.Group(), body = block({ w, h, d, color: o.color ?? "cloud" });
    g.add(body);
    const r = rng(o.seed ?? 7), leds = [];
    const uh = (h - 0.24) / units;
    for (let i = 0; i < units; i++) {
      const v = -h / 2 + 0.14 + uh * (i + 0.5);
      inset(body, { face: "left", u: -w * 0.08, v, w: w * 0.62, h: uh * 0.52, color: o.slot ?? "lilac", depth: 0.015 });
      const led = inset(body, { face: "left", u: w * 0.34, v, w: 0.09, h: 0.09, color: o.ledOff ?? "slate", depth: 0.03, unique: true });
      led.userData.phase = r.int(0, 5);
      leds.push(led);
    }
    inset(body, { face: "right", u: 0, v: h * 0.28, w: d * 0.6, h: 0.08, color: o.vent ?? "lilac", depth: 0.012 });
    inset(body, { face: "right", u: 0, v: h * 0.18, w: d * 0.6, h: 0.08, color: o.vent ?? "lilac", depth: 0.012 });
    const on = col(o.led ?? "mint"), off = col(o.ledOff ?? "slate");
    g.userData = { body, leds, dims: { w, h, d } };
    g.userData.update = (t) => {
      const tick = Math.floor(t * rate + 1e-6);
      leds.forEach((l, i) => l.material.userData.setBase((tick + l.userData.phase + i) % 3 === 0 ? on : off));
    };
    return g;
  }
  /** coolingUnit({ w = 1, h = .9, d = 1, color = "sky", fan = "cloud", rate = 3 }) -> Group: box + fan ring + blades; update(t) spins (rad/s·2π). */
  function coolingUnit(o = {}) {
    const { w = 1, h = 0.9, d = 1, rate = 1.2 } = o;
    const g = new THREE.Group(), body = block({ w, h, d, color: o.color ?? "sky" });
    g.add(body);
    const R = Math.min(w, d) * 0.38;
    g.add(place(cylinder({ r: R, h: 0.05, color: o.well ?? "slate", segments: 40, shadow: false }), [0, h, 0]));
    const rotor = new THREE.Group();
    rotor.position.set(0, h + 0.05, 0);
    for (let i = 0; i < 3; i++) {
      const b = block({ w: R * 1.8, h: 0.03, d: R * 0.32, color: o.fan ?? "cloud", shadow: false });
      b.rotation.y = (i / 3) * Math.PI;
      rotor.add(b);
    }
    rotor.add(cylinder({ r: R * 0.22, h: 0.06, color: o.fan ?? "cloud", shadow: false }));
    g.add(rotor);
    for (let i = 0; i < 3; i++) inset(body, { face: "left", u: 0, v: -h * 0.22 + i * 0.13, w: w * 0.7, h: 0.06, color: o.vent ?? "slate", depth: 0.012 });
    g.userData = { body, rotor, dims: { w, h, d } };
    g.userData.update = (t) => { rotor.rotation.y = -t * rate * Math.PI * 2; };
    return g;
  }
  /**
   * device({ kind = "phone"|"tablet"|"monitor", w, h, d, color = "cloud", screen = "sky", ui = [...colors], seed, period = 1.2 })
   *   -> Group standing upright, screen on the left (+Z) face. UI = inset bars/cards; update(t): a progress bar grows along
   *   the screen width and a notification dot pops on a fixed loop (staggered by seed).
   */
  function device(o = {}) {
    const kind = o.kind ?? "phone";
    const dims = { phone: [0.62, 1.15, 0.1], tablet: [1.1, 0.8, 0.08], monitor: [1.5, 0.95, 0.1] }[kind];
    const [w, h, d] = [o.w ?? dims[0], o.h ?? dims[1], o.d ?? dims[2]];
    const g = new THREE.Group();
    const lift = kind === "monitor" ? 0.35 : 0;
    if (kind === "monitor") { g.add(block({ w: 0.12, h: lift, d: 0.12, color: o.color ?? "cloud" })); g.add(block({ w: 0.6, h: 0.04, d: 0.36, color: o.color ?? "cloud" })); }
    const body = block({ w, h, d, color: o.color ?? "cloud", at: [0, lift, 0] });
    g.add(body);
    const bez = Math.min(w, h) * 0.08;
    const sw = w - bez * 2, sh = h - bez * 2.6;
    inset(body, { face: "left", u: 0, v: bez * 0.2, w: sw, h: sh, color: o.screen ?? "sky", depth: 0.012 });
    const ui = o.ui ?? ["butter", "rose", "cloud"];
    const r = rng(o.seed ?? 3), bars = [];
    const rows = kind === "phone" ? 3 : 2;
    for (let i = 0; i < rows; i++) {
      const bw = sw * (0.5 + r.next() * 0.3), v = sh / 2 - bez * 0.2 - (i + 0.8) * (sh / (rows + 1.6));
      bars.push(inset(body, { face: "left", u: -sw / 2 + bw / 2 + bez * 0.6, v: v + bez * 0.2, w: bw, h: sh / (rows + 1.6) * 0.55, color: ui[i % ui.length], depth: 0.022 }));
    }
    const pbW = sw - bez * 1.2;
    const prog = inset(body, { face: "left", u: 0, v: -sh / 2 + bez * 0.9, w: pbW, h: bez * 0.55, color: o.progress ?? "accent", depth: 0.024 });
    prog.geometry = prog.geometry.clone().translate(pbW / 2, 0, 0);
    prog.position.x -= pbW / 2;
    const dot = inset(body, { face: "left", u: sw / 2 - bez * 0.5, v: sh / 2 - bez * 0.3, w: bez * 1.1, h: bez * 1.1, color: o.notify ?? "accent", depth: 0.03 });
    const period = o.period ?? 1.2, rp = r.next() * period, phase = o.phase ?? rp;
    g.userData = { body, bars, prog, dot, dims: { w, h, d }, lift };
    g.userData.update = (t, on = -Infinity) => {
      const k = t - on;
      const u = k < 0 ? 0 : ((k + phase) % period) / period;
      prog.scale.x = Math.max(0.001, ease.outCubic(clamp(u / 0.8)));
      const pu = clamp((u - 0.82) / 0.12);
      dot.scale.setScalar(k < 0 ? 0.001 : Math.max(0.001, pu > 0 ? ease.outBack(pu, 2.2) : 0.001));
    };
    return g;
  }
  /** person({ h = .9, color, skin, hair, seed }) -> Group: capsule body + round head + hair cap (tiny iso figure). */
  function person(o = {}) {
    const h = o.h ?? 0.9, r = rng(o.seed ?? 1);
    const g = new THREE.Group();
    const bodyR = h * 0.17, bodyL = h * 0.46;
    const body = mesh(new THREE.CapsuleGeometry(bodyR, bodyL, 6, 20).translate(0, bodyR + bodyL / 2, 0), o.color ?? r.pick(P.people));
    g.add(body);
    const headR = h * 0.13, hy = bodyR * 2 + bodyL + headR * 1.05;
    g.add(place(mesh(new THREE.SphereGeometry(headR, 24, 16), o.skin ?? "skin"), [0, hy, 0]));
    g.add(place(mesh(new THREE.SphereGeometry(headR * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), o.hair ?? "hair", { shadow: false }), [0, hy + headR * 0.08, 0]));
    g.userData = { body, height: hy + headR };
    return g;
  }
  /** tree({ h = 1.2, r = .45, color = "mint", trunk = "peach", kind = "ball"|"cone" }) -> Group. */
  function tree(o = {}) {
    const { h = 1.2, r = 0.45, kind = "ball" } = o;
    const g = new THREE.Group();
    g.add(cylinder({ r: r * 0.16, h: h * 0.45, color: o.trunk ?? "peach", segments: 16 }));
    if (kind === "cone") g.add(place(cylinder({ r, rTop: 0.001, h: h * 0.75, color: o.color ?? "mint", segments: 32 }), [0, h * 0.3, 0]));
    else g.add(place(mesh(new THREE.SphereGeometry(r, 28, 18), o.color ?? "mint"), [0, h * 0.45 + r * 0.8, 0]));
    return g;
  }
  /**
   * route(points [[x,y,z]...], { kind = "cable"|"pipe"|"conveyor", radius, width, height, bend, color }) -> Mesh
   *   Axis-aligned path (give corners only) with rounded bends. cable/pipe = round tube; conveyor = flat belt (box profile).
   *   userData: { path (filleted, resampled), length, at(s) -> [x,y,z] }.
   */
  function route(points, o = {}) {
    const kind = o.kind ?? "cable";
    const radius = o.radius ?? (kind === "pipe" ? 0.12 : 0.06);
    const bend = o.bend ?? Math.max(radius * 3, 0.3);
    let pts = filletPath(points, bend);
    const L0 = pathLength(pts), n = Math.max(2, Math.ceil(L0 / 0.08));
    pts = Array.from({ length: n + 1 }, (_, i) => pointAt(pts, (L0 * i) / n).p);
    let geo;
    if (kind === "conveyor") {
      const w = (o.width ?? 0.6) / 2, hh = o.height ?? 0.14;
      geo = profileSweep(pathFrames(pts), [[-w, 0], [w, 0], [w, hh], [-w, hh]], { caps: true });
      geo = geo.toNonIndexed(); geo.computeVertexNormals();
    } else geo = sweepGeometry(pts, radius, 20);
    const m = mesh(geo, o.color ?? (kind === "conveyor" ? "slate" : "lilac"), o);
    m.frustumCulled = false;
    const length = pathLength(pts);
    m.userData = { ...m.userData, path: pts, length, kind, radius, top: kind === "conveyor" ? o.height ?? 0.14 : radius, at: (s) => pointAt(pts, clamp(s, 0, length)).p };
    const rings = pts.length - 1, per = kind === "conveyor" ? 0 : 20 * 6;
    /** setDraw(u 0..1): draw the route on from its start (tubes; conveyors just show/hide). Shadows follow (shared geometry). */
    m.userData.setDraw = (u) => {
      m.visible = u > 0.001;
      if (per) geo.setDrawRange(0, Math.max(0, Math.round(clamp(u) * rings)) * per);
    };
    return m;
  }
  /**
   * packets(route, { count, size = .16, color = "accent", speed = 1.6 (m/s), spacing (m), start = 0 }) -> Group
   *   Little blocks travelling the route at constant speed, entering one by one then looping (closed form).
   *   update(t): packets scale in/out over the first/last 0.2 m. Arrival k at start + (L + k·spacing)/speed.
   */
  function packets(rt, o = {}) {
    const size = o.size ?? 0.16, speed = o.speed ?? 1.6, L = rt.userData.length;
    const spacing = o.spacing ?? L / (o.count ?? 4), count = o.count ?? Math.max(1, Math.round(L / spacing));
    const g = new THREE.Group(), items = [];
    for (let k = 0; k < count; k++) {
      const b = block({ w: size, h: size, d: size, color: o.color ?? "accent", shadow: false });
      g.add(b); items.push(b);
    }
    const lift = rt.userData.kind === "conveyor" ? rt.userData.top : -size / 2;
    g.userData = { items, length: L, speed, spacing };
    g.userData.update = (t, start = o.start ?? 0, stop = Infinity) => {
      items.forEach((b, k) => {
        const run = (Math.min(t, stop) - start) * speed - k * spacing;
        if (run < 0 || t < start) { b.visible = false; return; }
        const s = run % (count * spacing);
        if (s > L) { b.visible = false; return; }
        const p = rt.userData.at(s);
        b.visible = true;
        b.position.set(p[0], p[1] + lift, p[2]);
        b.scale.setScalar(Math.max(0.001, Math.min(smoothstep(0, 0.2, s), 1 - smoothstep(L - 0.2, L, s), t > stop ? 0 : 1)));
      });
    };
    return g;
  }
  /** ripple({ size = 2, grow = 1.6, bar = .08, color = "accent", fadeTo }) -> flat square frame on a surface; set(u 0..1). */
  function ripple(o = {}) {
    const g = new THREE.Group(), bar = o.bar ?? 0.08, m = toneMat(o.color ?? "accent", { unique: true });
    const parts = [0, 1, 2, 3].map(() => { const b = new THREE.Mesh(boxGeo(1, 0.012, 1), m); b.userData.noShadow = true; g.add(b); return b; });
    const s0 = o.size ?? 2, s1 = s0 + (o.grow ?? 1.6);
    g.userData.set = (u) => {
      g.visible = u > 0 && u < 1;
      const s = s0 + (s1 - s0) * ease.outCubic(u), hs = s / 2;
      parts[0].position.set(0, 0, -hs); parts[0].scale.set(s + bar, 1, bar);
      parts[1].position.set(0, 0, hs); parts[1].scale.set(s + bar, 1, bar);
      parts[2].position.set(-hs, 0, 0); parts[2].scale.set(bar, 1, s);
      parts[3].position.set(hs, 0, 0); parts[3].scale.set(bar, 1, s);
      m.userData.setMix(o.fadeTo ?? "cloud", smoothstep(0.35, 1, u));
    };
    g.userData.set(0);
    return g;
  }
  /** groundMark({ w, d, bar = .06, color = "dot", dash = .35 }) -> dashed rectangle printed flat (plots, footprints). set(u) draws it on. */
  function groundMark(o = {}) {
    const { w = 6, d = 4, bar = 0.06, dash = 0.35 } = o;
    const g = new THREE.Group(), dashes = [];
    const edges = [[[-w / 2, -d / 2], [w / 2, -d / 2]], [[w / 2, -d / 2], [w / 2, d / 2]], [[w / 2, d / 2], [-w / 2, d / 2]], [[-w / 2, d / 2], [-w / 2, -d / 2]]];
    let acc = 0;
    for (const [a, b] of edges) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / (dash * 2)));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * (f0 + f1) / 2, z = a[1] + (b[1] - a[1]) * (f0 + f1) / 2;
        const len = L * (f1 - f0), horiz = Math.abs(b[0] - a[0]) > 1e-6;
        const m = block({ w: horiz ? len : bar, h: 0.01, d: horiz ? bar : len, color: o.color ?? "dot", shadow: false, at: [x, 0.002, z] });
        m.userData.order = acc + L * f0; dashes.push(m); g.add(m);
      }
      acc += L;
    }
    g.userData.set = (u) => dashes.forEach((m) => (m.visible = m.userData.order <= u * acc + 1e-6));
    g.userData.set(1);
    return g;
  }

  // ---------------------------------------------------------------- ground + long shadows
  /** ground({ size }) -> dot-grid plane (exact palette; anti-aliased dots in world space, shimmer-free). Receiver for shadows. */
  function ground(o = {}) {
    const G = spec.grid;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? G.size, o.size ?? G.size).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uBg: { value: v3(col(o.color ?? "ground")) }, uDot: { value: v3(col(o.dot ?? "dot")) }, uCell: { value: G.cell }, uR: { value: G.dotRadius }, uMajor: { value: G.majorEvery }, uMajorR: { value: G.majorRadius } },
      vertexShader: GRID_VS, fragmentShader: GRID_FS,
    }));
    m.userData = { top: 0, bounds: null, tone: col(o.color ?? "ground"), noShadow: true };
    return m;
  }
  const shadowPairs = [];
  const SH = spec.shadow, KX = SH.dir[0] * SH.length, KZ = SH.dir[1] * SH.length;
  const _m = new THREE.Matrix4();
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  /**
   * castShadows(caster, receiver, { y = receiver.userData.top, bounds = receiver.userData.bounds, tone, only }) -> shadow meshes
   *   Every tone mesh under caster (except userData.noShadow) gets a flat planar long shadow on the receiver's plane y
   *   (receiver-local), clipped to bounds [x0,z0,x1,z1], in tone = mix(receiver top tone, shadow.toward, shadow.k).
   *   Call style.updateShadows() in renderAt after everything has moved.
   */
  function castShadows(caster, receiver, o = {}) {
    const R = receiver.userData;
    const baseTone = o.tone ?? R.tone ?? R.body?.material.userData.tones.top ?? P.ground;
    const c = v3(mixHex(baseTone, SH.toward, SH.k));
    const b = o.bounds ?? R.bounds ?? [-1e4, -1e4, 1e4, 1e4];
    const y0 = (o.y ?? R.top ?? 0) + SH.lift;
    const out = [];
    caster.updateMatrixWorld(true);
    caster.traverse((src) => {
      if (!src.isMesh || src.userData.noShadow || !src.material?.userData?.isTone) return;
      if (o.only && !o.only(src)) return;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uM: { value: new THREE.Matrix4() }, uY0: { value: y0 }, uK: { value: new THREE.Vector2(KX, KZ) }, uColor: { value: c }, uBounds: { value: new THREE.Vector4(...b) } },
        vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      });
      const s = new THREE.Mesh(src.geometry, mat);
      s.frustumCulled = false; s.renderOrder = 1; s.userData.noShadow = true; s.userData.src = src;
      receiver.add(s);
      shadowPairs.push({ s, src, receiver });
      out.push(s);
    });
    return out;
  }
  /** updateShadows(): refresh every shadow's caster->receiver matrix and visibility (call after moving things). */
  function updateShadows() {
    stage.scene.updateMatrixWorld(true);
    for (const { s, src, receiver } of shadowPairs) {
      s.visible = shown(src) && shown(receiver);
      if (!s.visible) continue;
      _m.copy(receiver.matrixWorld).invert().multiply(src.matrixWorld);
      s.material.uniforms.uM.value.copy(_m);
    }
  }

  // ---------------------------------------------------------------- stack / explode
  /**
   * stack(floors [Object3D], plan (iso.stackPlan)) -> Group; update(t) places floor i at floorOffset(t, plan, i).y,
   *   hides it before its entry; userData.open(t) = explode amount 0..1; userData.flash(t) -> per-floor pulse 0..1.
   */
  function stack(floors, pl) {
    const g = new THREE.Group();
    floors.forEach((f) => g.add(f));
    g.userData = { floors, plan: pl };
    g.userData.update = (t) => {
      floors.forEach((f, i) => { const s = floorOffset(t, pl, i); f.position.y = s.y; f.visible = s.shown; });
    };
    g.userData.pulse = (t, i, { rise = 0.08, fall = 0.55 } = {}) => {
      const on = pl.pulseAt[i];
      return t < on ? 0 : smoothstep(on, on + rise, t) * (1 - smoothstep(on + rise, on + rise + fall, t));
    };
    return g;
  }

  // ---------------------------------------------------------------- overlay UI (screen-flat, exact colours)
  const OV = spec.overlay, ovFont = FONTS[spec.text.font] ?? spec.text.font;
  const otext = (text, { h, color, weight = 800, font = ovFont, bg = null, radius = 0, padding = 0.12, tracking = 0 }) => {
    const m = createTextLabel(text, { font, weight, color: col(color), height: 1, fontSize: 128, padding, background: bg ? col(bg) : null, radius, letterSpacing: tracking * 128, align: "left" });
    m.material.depthTest = false;
    m.scale.multiplyScalar(h * 2);
    m.userData.w = m.scale.x; m.userData.h = m.scale.y;
    return m;
  };
  const disc = (color, r) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, depthTest: false })); m.scale.setScalar(r); return m; };
  const fadeAll = (g, a) => g.traverse((o) => { if (o.material) { o.material.opacity = a; } });
  const popIn = (t, on, off) => {
    if (t < on || t > off + OV.outDur) return null;
    const a = smoothstep(on, on + OV.popDur * 0.6, t) * (1 - smoothstep(off, off + OV.outDur, t));
    const s = 0.86 + 0.14 * ease.outBack(clamp((t - on) / OV.popDur), 2.4);
    return { a, s, drop: smoothstep(off, off + OV.outDur, t) * 0.02 };
  };
  /**
   * caption({ n, title, sub, color = badge colour, x = -.86, y = .62, size = 1 }) -> overlay Group: number badge + big word
   *   (+ optional sub line). userData.update(t, { on, off }). Left-aligned at NDC (x, y). userData.width (NDC).
   */
  function caption(o = {}) {
    const ov = getOverlay(stage), g = new THREE.Group(), H = OV.captionH * (o.size ?? 1);
    const inner = new THREE.Group(); g.add(inner);
    let x = 0;
    if (o.n != null) {
      const r = H * OV.badgeScale * 0.5 * 2;
      const b = disc(o.color ?? "accent", r); b.position.set(r, 0, 0); inner.add(b);
      const num = otext(String(o.n), { h: H * 0.78, color: o.numColor ?? "ink" }); num.position.set(r + 0.004, -H * 0.02, 0.01); inner.add(num);
      x = r * 2 + H * 0.35;
    }
    const lines = String(o.title).split("\n");
    lines.forEach((ln, i) => {
      const tt = otext(ln, { h: H, color: o.ink ?? "ink" });
      tt.position.set(x + tt.userData.w / 2 - H * 0.12, -i * H * 2 * 1.08, 0); inner.add(tt);
    });
    if (o.sub) {
      const st = otext(o.sub, { h: H * 0.34, color: "inkSoft", weight: 800, tracking: 0.06 });
      st.position.set(x + st.userData.w / 2 - H * 0.04, -(lines.length - 1) * H * 2 * 1.08 - H * 1.45, 0); inner.add(st);
    }
    ov.add(g);
    g.visible = false;
    g.userData.update = (t, { on, off = Infinity }) => {
      const p = popIn(t, on, off);
      g.visible = !!p;
      if (!p) return;
      g.position.set((o.x ?? -0.86) * ov.aspect, (o.y ?? 0.62) - p.drop, 0);
      inner.scale.setScalar(p.s);
      fadeAll(g, p.a);
    };
    return g;
  }
  /** kicker(text, { x, y, color }) -> small tracked overlay line (series title). update(t, { on, off }). */
  function kicker(text, o = {}) {
    const ov = getOverlay(stage), g = new THREE.Group();
    const tt = otext(text, { h: OV.kickerH, color: o.color ?? "inkSoft", weight: 800, tracking: 0.18 });
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: col(o.bar ?? "accent"), transparent: true, depthTest: false }));
    bar.scale.set(OV.kickerH * 2 * 1.3, OV.kickerH * 2 * 0.28, 1);
    bar.position.set(bar.scale.x / 2, -OV.kickerH * 1.45, 0);
    tt.position.set(tt.userData.w / 2 - OV.kickerH * 0.24, 0, 0);
    g.add(tt, bar); ov.add(g); g.visible = false;
    g.userData.update = (t, { on, off = Infinity }) => {
      const p = popIn(t, on, off); g.visible = !!p; if (!p) return;
      g.position.set((o.x ?? -0.86) * ov.aspect, (o.y ?? 0.84) - p.drop, 0);
      fadeAll(g, p.a);
    };
    return g;
  }
  /**
   * tag({ n, title, color, side = "right" }) -> overlay Group: pill label with a number badge + a leader to a 3D anchor.
   *   update(t, { on, off, anchor:[x,y,z] world, at:[ndcX, ndcY] (pill's near end) }).
   */
  function tag(o = {}) {
    const ov = getOverlay(stage), g = new THREE.Group(), H = OV.tagH;
    const pill = otext("\u00a0".repeat(5) + o.title, { h: H, color: "ink", bg: o.bg ?? "paper", radius: 80, padding: 0.3 }); // NBSPs leave room for the badge
    const r = pill.userData.h * 0.5;
    const badge = disc(o.color ?? "accent", r * 0.78);
    const num = otext(String(o.n ?? ""), { h: H * 0.8, color: "ink" });
    const line = hairline(col(o.line ?? "ink")), dot = disc(o.line ?? "ink", 5.5 * PX), ring = disc(o.color ?? "accent", 9 * PX);
    g.add(line, ring, dot, pill, badge, num);
    ov.add(g); g.visible = false;
    const side = o.side ?? "right";
    g.userData.width = pill.userData.w / ov.aspect;
    g.userData.update = (t, { on, off = Infinity, anchor, at }) => {
      const p = popIn(t, on, off); g.visible = !!p; if (!p) return;
      const A = projectToScreen(stage, anchor), ax = A.x * ov.aspect, ay = A.y;
      const px = at[0] * ov.aspect, py = at[1] ?? ay;
      const draw = ease.outCubic(clamp((t - on) / (OV.popDur * 1.2)));
      const sgn = side === "right" ? 1 : -1;
      const ex = ax + (px - ax) * draw, ey = ay + (py - ay) * draw;
      line.userData.set([ax, ay], [ex, ey], OV.leaderPx, p.a);
      dot.position.set(ax, ay, 0.02); ring.position.set(ax, ay, 0.01);
      const bx = px + sgn * r * 1.02;
      badge.position.set(bx, py, 0.03); num.position.set(bx + 0.002, py - r * 0.03, 0.04);
      pill.position.set(px + sgn * pill.userData.w / 2, py, 0.02);
      const k = p.s;
      [pill, badge, num].forEach((m) => { m.userData.s0 ??= m.scale.clone(); m.scale.copy(m.userData.s0).multiplyScalar(k); });
      fadeAll(g, p.a);
    };
    return g;
  }

  // ---------------------------------------------------------------- factories (objectsFromSpec, primitive "procedural")
  const fromSpec = (fn) => (s) => fn({ ...(s.dims ?? {}), color: s.material ?? s.dims?.color });
  const factories = {
    isoBlock: fromSpec(block), isoPrism: fromSpec(prism), isoCylinder: fromSpec(cylinder), isoSlab: fromSpec(slab),
    isoChip: fromSpec(chip), isoRack: fromSpec(serverRack), isoCooler: fromSpec(coolingUnit), isoDevice: fromSpec(device),
    isoPerson: fromSpec(person), isoTree: fromSpec(tree),
  };

  const props = {
    toneMat, mesh, block, prism, ramp, cylinder, inset, isoLabel, slab, chip, serverRack, coolingUnit, device, person, tree,
    route, packets, ripple, groundMark, ground, stack, caption, kicker, tag,
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    castShadows, updateShadows, helpers: { col, mixHex, threeTones: (b) => threeTones(col(b), spec.tones) }, plan, motion: plan,
  };
}
