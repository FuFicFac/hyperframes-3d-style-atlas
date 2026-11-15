// styles/exploded-view/style.js — Exploded View (see STYLE.md and references/kit-api.md).
// A premium product teardown: precise bevelled hard-surface parts in a restrained material set, each outlined
// with thin dark screen-space ink (kit lines.js + edges.js), separating along an assembly axis on a pure-f(t)
// schedule (./explode.js), joined by dash-dot centre lines, with overlay callouts and a parts legend.
// Every prop is synchronous and seeded (rng only). Props never animate themselves: time enters through
// userData hooks (assembly.update(t), setFocus(...), wheel.roll(a), callout.set(...)) that the scene calls.
// Part geometry convention: Y is the assembly axis; a part's base sits at y = 0 unless noted.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { blobTexture } from "../../kit/textures.js";
import { createGround } from "../../kit/builders.js";
import { screenLines } from "../../kit/lines.js";
import { outlineMesh } from "../../kit/edges.js";
import { analyseEdges, chainEdges } from "../../kit/edges.js";
import { getOverlay, pinToScreen, projectToScreen } from "../../kit/overlay.js";
import { rng, hashString, clamp, lerp, ease, TAU } from "../../kit/time.js";
import { explodePlan, explodeAmount, screwAngle, explodeCues } from "./explode.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, explodePlan, explodeAmount, screwAngle, explodeCues };

const seedOf = (s) => (typeof s === "string" ? hashString(s) : (s ?? 1) >>> 0);
const V2 = (x, y) => new THREE.Vector2(x, y);

// ======================================================================== geometry builders (pure) ======
/** chamfered drum profile for lathe(): [[r, y]...] from the axis at the bottom to the axis at the top. */
export function drumProfile(r, h, c = 0.03, r0 = 0) {
  c = Math.min(c, r / 2, h / 2);
  return [[r0, 0], [r - c, 0], [r, c], [r, h - c], [r - c, h], [r0, h]];
}
/** filleted cup/shell profile (open at the bottom): outer radius r, height h, wall, top fillet f. */
export function shellProfile(r, h, wall = 0.06, f = 0.15, steps = 6) {
  const pts = [[0, h]];
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * (Math.PI / 2); pts.push([r - f + Math.sin(a) * f, h - f + Math.cos(a) * f]); }
  pts.push([r, 0], [r - wall, 0]);
  const fi = Math.max(0.01, f - wall);
  for (let i = 0; i <= steps; i++) { const a = (1 - i / steps) * (Math.PI / 2); pts.push([r - wall - fi + Math.sin(a) * fi, h - wall - fi + Math.cos(a) * fi]); }
  pts.push([0, h - wall]);
  return pts;
}
function roundRectShape(w, d, r) {
  r = Math.min(r, w / 2 - 1e-3, d / 2 - 1e-3);
  const s = new THREE.Shape(), l = -w / 2, b = -d / 2, R = w / 2, T = d / 2;
  s.moveTo(l + r, b); s.lineTo(R - r, b); s.absarc(R - r, b + r, r, -Math.PI / 2, 0, false);
  s.lineTo(R, T - r); s.absarc(R - r, T - r, r, 0, Math.PI / 2, false);
  s.lineTo(l + r, T); s.absarc(l + r, T - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(l, b + r); s.absarc(l + r, b + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function circlePath(x, y, r, seg = 40, hole = true) {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  p.absarc(x, y, r, 0, TAU, !hole);
  return p;
}
/** extrude a 2D shape (x, z-plane; shape y = -z) into a plate of thickness h along +Y with a small bevel. */
function extrudeFlat(shape, h, bevel = 0.02, curveSegments = 32) {
  const b = Math.min(bevel, h / 2.5);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-3, h - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, b, 0);
  return geo;
}

// ======================================================================== createStyle ==================
/** createStyle(stage, opts?) -> style      opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, OL = spec.outline, FO = spec.focus, U = spec.ui;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const box = lights.softbox;
  if (box) box.shadow.radius = spec.lights.find((l) => l.id === "softbox")?.shadow?.softness ?? 6;
  // solids sit a hair behind their own outlines
  for (const m of Object.values(materials)) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  materials.smoke.depthWrite = false;
  const accentLin = new THREE.Color(P.accent);
  const TMP = new THREE.Color(), inkCol = new THREE.Color(), silCol = new THREE.Color(), dimLineCol = new THREE.Color(FO.dimLine);
  /** dimColorOf(linear colour) -> linear colour: desaturated, luminance pulled toward FO.mid and capped at FO.maxL (sRGB). */
  const dimColorOf = (lin) => {
    const s = lin.clone().convertLinearToSRGB();
    const L = 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
    const Ld = Math.min(FO.maxL, L + (FO.mid - L) * FO.flatten);
    const ch = (v) => clamp(L + (v - L) * FO.keepSat + (Ld - L));
    return new THREE.Color().setRGB(ch(s.r), ch(s.g), ch(s.b), THREE.SRGBColorSpace);
  };
  const uiFont = FONTS[U.font] ?? U.font;

  const mat = (m) => (typeof m === "string" ? materials[m] ?? (() => { throw new Error(`exploded-view: no material "${m}"`); })() : m);
  const mesh = (geo, m, o = {}) => {
    const x = new THREE.Mesh(geo, mat(m));
    x.castShadow = o.cast ?? true;
    x.receiveShadow = o.receive ?? true;
    if (o.outline === false) x.userData.noOutline = true;
    if (o.name) x.name = o.name;
    return x;
  };

  // ------------------------------------------------------------ part builders (props)
  /** roundedBox({ w, h, d, radius = .05, material }) -> Mesh, base at y = 0. */
  function roundedBox(o = {}) {
    const { w = 1, h = 0.3, d = 1, radius = 0.05, segments = 3 } = o;
    const g = new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    g.translate(0, h / 2, 0);
    return mesh(g, o.material ?? "plasticGrey", o);
  }
  /**
   * plate({ shape: "rect"|"circle", w, d, r, radius (corner), h = .08, bevel = .02, holes: [{x, z, r} | {x, z, w, d, radius}],
   *         material }) -> Mesh: an extruded plate with a bevelled edge and through-holes (slots allowed), base at y = 0.
   */
  function plate(o = {}) {
    const { h = 0.08, bevel = 0.02 } = o;
    const shape = o.shape === "circle" ? (() => { const s = new THREE.Shape(); s.absarc(0, 0, o.r ?? 1, 0, TAU, false); return s; })() : roundRectShape(o.w ?? 2, o.d ?? 1.4, o.radius ?? 0.12);
    for (const hl of o.holes ?? []) {
      if (hl.w) {
        const s = roundRectShape(hl.w, hl.d, hl.radius ?? Math.min(hl.w, hl.d) / 2);
        const pts = s.getPoints(12).map((p) => V2(p.x + hl.x, p.y - hl.z)).reverse();
        shape.holes.push(new THREE.Path(pts));
      } else shape.holes.push(circlePath(hl.x, -hl.z, hl.r));
    }
    return mesh(extrudeFlat(shape, h, bevel, o.curveSegments ?? (o.shape === "circle" ? 128 : 24)), o.material ?? "plasticGrey", o);
  }
  /** lathe(profile [[r, y]...], { segments = 64, phiStart, phiLength, material }) -> Mesh (axis = Y). */
  function lathe(profile, o = {}) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => V2(Math.max(0, r), y)), o.segments ?? 64, o.phiStart ?? 0, o.phiLength ?? TAU);
    return mesh(g, o.material ?? "metal", o);
  }
  /** drum({ r, h, chamfer, material }) = lathe(drumProfile). */
  const drum = (o = {}) => lathe(drumProfile(o.r ?? 0.5, o.h ?? 0.2, o.chamfer ?? 0.025, o.r0 ?? 0), o);
  /** shell({ r, h, wall, fillet, material, phiLength }) -> rounded cup (open bottom), axis Y. */
  const shell = (o = {}) => lathe(shellProfile(o.r ?? 1, o.h ?? 0.3, o.wall ?? 0.05, o.fillet ?? 0.12), { material: "plasticWhite", ...o });
  /** ring({ r, h, wall, chamfer, phiStart, phiLength, material }) -> chamfered tube wall (bumpers, skirts, bezels). */
  function ring(o = {}) {
    const { r = 1, h = 0.2, wall = 0.06, chamfer = 0.015 } = o, c = Math.min(chamfer, wall / 3, h / 3), ri = r - wall;
    return lathe([[ri + c, 0], [r - c, 0], [r, c], [r, h - c], [r - c, h], [ri + c, h], [ri, h - c], [ri, c], [ri + c, 0]], o);
  }
  /** gear({ teeth = 18, r = .4, tooth = .06, h = .08, bore = .08, material = "metal" }) -> extruded spur gear, axis Y. */
  function gear(o = {}) {
    const { teeth = 18, r = 0.4, tooth = 0.06, h = 0.08, bore = 0.08 } = o;
    const s = new THREE.Shape();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * TAU, st = TAU / teeth;
      const pts = [[r - tooth, a0], [r - tooth, a0 + st * 0.18], [r, a0 + st * 0.32], [r, a0 + st * 0.62], [r - tooth, a0 + st * 0.78]];
      pts.forEach(([rr, a], k) => (i === 0 && k === 0 ? s.moveTo(rr * Math.cos(a), rr * Math.sin(a)) : s.lineTo(rr * Math.cos(a), rr * Math.sin(a))));
    }
    s.closePath();
    if (bore > 0) s.holes.push(circlePath(0, 0, bore));
    if (o.windows) for (let k = 0; k < o.windows; k++) { const a = (k / o.windows) * TAU; s.holes.push(circlePath(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.16)); }
    return mesh(extrudeFlat(s, h, Math.min(0.012, h / 4), 6), o.material ?? "metal", o);
  }
  /** fan({ blades = 7, r = .5, hub = .16, h = .12, pitch = .5, material }) -> Group (hub drum + pitched blades), axis Y; userData.spin(a). */
  function fan(o = {}) {
    const { blades = 7, r = 0.5, hub = 0.16, h = 0.12, pitch = 0.5 } = o;
    const g = new THREE.Group(), rot = new THREE.Group();
    g.add(rot);
    rot.add(drum({ r: hub, h: h * 1.15, chamfer: 0.02, material: o.hubMaterial ?? o.material ?? "plasticBlack" }));
    const bladeGeo = new RoundedBoxGeometry(r - hub * 0.6, 0.018, h * 1.6, 2, 0.008);
    for (let i = 0; i < blades; i++) {
      const piv = new THREE.Group();
      piv.rotation.y = (i / blades) * TAU;
      const b = mesh(bladeGeo, o.material ?? "plasticBlack");
      b.position.set(hub * 0.7 + (r - hub * 0.6) / 2, h * 0.55, 0);
      b.rotation.x = Math.PI / 2 - pitch;
      piv.add(b);
      rot.add(piv);
    }
    g.userData.spin = (a) => (rot.rotation.y = a);
    return g;
  }
  /** coil({ r = .12, turns = 8, wire = .018, length = .3, material = "copper", core = true }) -> Group, axis Y, base y = 0. */
  function coil(o = {}) {
    const { r = 0.12, turns = 8, wire = 0.018, length = 0.3 } = o;
    const pts = [];
    const n = Math.max(16, Math.round(turns * 20));
    for (let i = 0; i <= n; i++) { const u = i / n, a = u * turns * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, wire + u * (length - 2 * wire), Math.sin(a) * r)); }
    const g = new THREE.Group();
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 8, false), o.material ?? "copper", { outline: o.outlineWire ?? true }));
    if (o.core !== false) g.add(drum({ r: r - wire * 1.3, h: length, chamfer: 0.01, material: o.coreMaterial ?? "darkMetal" }));
    return g;
  }
  /**
   * screw({ r = .05, length = .32, head = .085, headH = .05, material = "brass" }) -> Group. Origin = underside of the head,
   *   shank points -Y; pan head with a cross recess, threaded shank. userData.turn(a) spins it about Y.
   */
  function screw(o = {}) {
    const { r = 0.05, length = 0.32, head = 0.085, headH = 0.05 } = o;
    const g = new THREE.Group(), rot = new THREE.Group();
    g.add(rot);
    const prof = [[0, 0], [head, 0]];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); prof.push([head * (0.55 + 0.45 * Math.cos(a)), headH * Math.sin(a) * (0.45 + 0.55 * Math.cos(a * 0.3))]); }
    prof.push([0, headH * 0.98]);
    rot.add(lathe(prof, { material: o.material ?? "brass", segments: 32 }));
    const recess = new THREE.BoxGeometry(head * 1.1, 0.012, head * 0.22);
    for (const a of [0, Math.PI / 2]) { const m = mesh(recess, "plasticBlack", { outline: false, cast: false }); m.position.y = headH * 0.93; m.rotation.y = a; rot.add(m); }
    rot.add(drum({ r: r * 0.78, h: length, chamfer: r * 0.3, material: o.material ?? "brass", segments: 20 }).translateY(-length));
    const th = [];
    const turns = Math.round(length / (r * 0.7));
    for (let i = 0; i <= turns * 12; i++) { const u = i / (turns * 12), a = u * turns * TAU; th.push(new THREE.Vector3(Math.cos(a) * r * 0.82, -length * 0.92 + u * length * 0.82, Math.sin(a) * r * 0.82)); }
    rot.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(th), turns * 12, r * 0.2, 5, false), o.material ?? "brass", { outline: false }));
    g.userData.turn = (a) => (rot.rotation.y = a);
    g.userData.length = length;
    return g;
  }
  /**
   * wheel({ r = .4, w = .22, hub = .2, spokes = 5, tread = 9, tyre = "rubber", rim = "metal" }) -> Group. Axle along X
   *   (rolls about X), centred at the origin. userData.roll(a).
   */
  function wheel(o = {}) {
    const { r = 0.4, w = 0.22, hub = 0.2, spokes = 5, tread = 9 } = o;
    const g = new THREE.Group(), rot = new THREE.Group();
    g.add(rot);
    // tyre cross-section (lathe about Y, then turned so Y -> X): grooved crown
    const ri = r * 0.7, prof = [[ri, -w / 2], [r - 0.04, -w / 2], [r, -w / 2 + 0.04]];
    for (let i = 1; i < tread; i++) { const y = -w / 2 + 0.04 + ((w - 0.08) * i) / tread; prof.push([r, y - 0.008], [r - 0.018, y - 0.004], [r - 0.018, y + 0.004], [r, y + 0.008]); }
    prof.push([r, w / 2 - 0.04], [r - 0.04, w / 2], [ri, w / 2]);
    const tyre = lathe(prof, { material: o.tyre ?? "rubber", segments: 64 });
    const rim = ring({ r: ri + 0.005, h: w * 0.84, wall: 0.05, chamfer: 0.012, material: o.rim ?? "metal", segments: 48 });
    rim.position.y = -w * 0.42;
    rot.add(tyre, rim);
    const r0 = hub * 0.55, r1 = ri - 0.03, spokeGeo = new RoundedBoxGeometry(0.07, w * 0.32, r1 - r0, 2, 0.015);
    for (let i = 0; i < spokes; i++) {
      const sp = mesh(spokeGeo, o.rim ?? "metal");
      sp.position.set(0, 0, (r0 + r1) / 2);
      const piv = new THREE.Group();
      piv.rotation.y = (i / spokes) * TAU;
      piv.add(sp);
      rot.add(piv);
    }
    rot.add(drum({ r: hub * 0.6, h: w * 1.05, chamfer: 0.02, material: o.rim ?? "metal" }).translateY(-w * 0.52));
    rot.rotation.z = -Math.PI / 2; // lathe axis Y -> X
    g.userData.roll = (a) => (rot.rotation.x = a);
    return g;
  }
  /** roller({ r = .2, length = 1.6, flights = 2, turns = 1.5, core = "plasticBlack", vanes = "rubber", caps = "plasticGrey" }) ->
   *  Group: core tube + helical vanes + end caps. Axle along X, centred. userData.roll(a). */
  function roller(o = {}) {
    const { r = 0.2, length = 1.6, flights = 2, turns = 1.5 } = o;
    const g = new THREE.Group(), rot = new THREE.Group();
    g.add(rot);
    const core = drum({ r: r * 0.62, h: length, chamfer: 0.02, material: o.core ?? "plasticBlack", segments: 40 });
    core.position.y = -length / 2;
    rot.add(core);
    for (let f = 0; f < flights; f++) {
      const pts = [], n = Math.round(turns * 40);
      for (let i = 0; i <= n; i++) { const u = i / n, a = u * turns * TAU + (f / flights) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.8, -length / 2 + 0.1 + u * (length - 0.2), Math.sin(a) * r * 0.8)); }
      rot.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, r * 0.2, 8, false), o.vanes ?? "rubber"));
    }
    for (const s of [-1, 1]) { const c = drum({ r: r * 0.95, h: 0.09, chamfer: 0.02, material: o.caps ?? "plasticGrey", segments: 40 }); c.position.y = s > 0 ? length / 2 - 0.09 : -length / 2; rot.add(c); }
    rot.rotation.z = -Math.PI / 2;
    g.userData.roll = (a) => (rot.rotation.x = a);
    return g;
  }
  /**
   * pcb({ w = 2, d = 1.4, h = .05, radius = .1, holes (mounting, default 4 corners), seed, chips = 4, caps = 6, leds = 3,
   *       coils = 1, connectors = 2, shield = true }) -> Group: solder-mask board with gold pads and seeded components
   *   (black packages with pins, a metal RF shield, electrolytic caps, an inductor coil, white connectors, LEDs).
   *   userData.setLeds(k) drives LED emission; userData.chip = local centre of the biggest package (callout anchor).
   */
  function pcb(o = {}) {
    const { w = 2, d = 1.4, h = 0.05, radius = 0.1 } = o;
    const r = rng(seedOf(o.seed ?? "pcb"));
    const g = new THREE.Group();
    const mh = o.holes ?? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * (w / 2 - 0.12), z: sz * (d / 2 - 0.12), r: 0.045 }));
    g.add(plate({ w, d, h, radius, bevel: 0.008, holes: mh, material: "pcb" }));
    for (const m of mh) { const ring_ = ring({ r: m.r + 0.035, h: 0.006, wall: 0.035, material: "pad", segments: 24, outline: false }); ring_.position.set(m.x, h, m.z); g.add(ring_); }
    // occupancy grid so components never overlap or cover holes
    const cell = 0.05, nx = Math.floor(w / cell), nz = Math.floor(d / cell), occ = new Uint8Array(nx * nz);
    const mark = (x, z, sw, sd, pad = 0.04) => {
      const x0 = Math.floor((x - sw / 2 - pad + w / 2) / cell), x1 = Math.ceil((x + sw / 2 + pad + w / 2) / cell);
      const z0 = Math.floor((z - sd / 2 - pad + d / 2) / cell), z1 = Math.ceil((z + sd / 2 + pad + d / 2) / cell);
      for (let i = Math.max(0, x0); i < Math.min(nx, x1); i++) for (let k = Math.max(0, z0); k < Math.min(nz, z1); k++) { if (occ[k * nx + i]) return false; }
      for (let i = Math.max(0, x0); i < Math.min(nx, x1); i++) for (let k = Math.max(0, z0); k < Math.min(nz, z1); k++) occ[k * nx + i] = 1;
      return true;
    };
    for (const m of mh) mark(m.x, m.z, 0.2, 0.2, 0);
    const place = (sw, sd, tries = 60, prefer = null) => {
      for (let i = 0; i < tries; i++) {
        const x = prefer && i < 10 ? prefer[0] + r.range(-0.1, 0.1) : r.range(-w / 2 + sw / 2 + 0.08, w / 2 - sw / 2 - 0.08);
        const z = prefer && i < 10 ? prefer[1] + r.range(-0.1, 0.1) : r.range(-d / 2 + sd / 2 + 0.08, d / 2 - sd / 2 - 0.08);
        if (mark(x, z, sw, sd)) return [x, z];
      }
      return null;
    };
    const top = h;
    // main package: big chip with gold pins on all four sides (+ optional shield can next to it)
    const sz = Math.min(w, d) * 0.36;
    const main = place(sz, sz, 60, o.mainAt ?? [-w * 0.12, 0]) ?? [0, 0];
    {
      const c = roundedBox({ w: sz, h: 0.07, d: sz, radius: 0.012, material: "plasticBlack" });
      c.position.set(main[0], top, main[1]);
      g.add(c);
      const lid = roundedBox({ w: sz * 0.62, h: 0.025, d: sz * 0.62, radius: 0.01, material: "metal" });
      lid.position.set(main[0], top + 0.07, main[1]);
      g.add(lid);
      const pinGeo = new THREE.BoxGeometry(0.018, 0.012, 0.05);
      const n = 9;
      for (let side = 0; side < 4; side++) for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n - 0.5) * sz * 0.85, pin = mesh(pinGeo, "pad", { outline: false, cast: false });
        const out = (side < 2 ? 1 : -1) * (sz / 2 + 0.02);
        if (side % 2 === 0) { pin.position.set(main[0] + out, top + 0.006, main[1] + u); pin.rotation.y = Math.PI / 2; }
        else pin.position.set(main[0] + u, top + 0.006, main[1] + out);
        g.add(pin);
      }
    }
    g.userData.chip = [main[0], top + 0.1, main[1]];
    if (o.shield !== false) {
      const sp = place(sz * 0.9, sz * 0.7);
      if (sp) { const s = roundedBox({ w: sz * 0.9, h: 0.06, d: sz * 0.7, radius: 0.008, material: "metal" }); s.position.set(sp[0], top, sp[1]); g.add(s); }
    }
    for (let i = 0; i < (o.chips ?? 4); i++) {
      const cw = r.range(0.14, 0.26), cd = cw * r.range(0.6, 1);
      const p = place(cw, cd);
      if (!p) continue;
      const c = roundedBox({ w: cw, h: 0.045, d: cd, radius: 0.008, material: "plasticBlack" });
      c.position.set(p[0], top, p[1]);
      g.add(c);
    }
    for (let i = 0; i < (o.caps ?? 6); i++) {
      const cr = r.range(0.04, 0.07), p = place(cr * 2, cr * 2);
      if (!p) continue;
      const c = drum({ r: cr, h: r.range(0.1, 0.18), chamfer: 0.012, material: "metal", segments: 24 });
      c.position.set(p[0], top, p[1]);
      g.add(c);
    }
    for (let i = 0; i < (o.coils ?? 1); i++) {
      const p = place(0.24, 0.24);
      if (!p) continue;
      const c = coil({ r: 0.09, turns: 6, wire: 0.016, length: 0.16 });
      c.position.set(p[0], top, p[1]);
      g.add(c);
    }
    for (let i = 0; i < (o.connectors ?? 2); i++) {
      const cw = r.range(0.28, 0.42), p = place(cw, 0.12);
      if (!p) continue;
      const c = roundedBox({ w: cw, h: 0.09, d: 0.12, radius: 0.01, material: "plasticWhite" });
      c.position.set(p[0], top, p[1]);
      g.add(c);
    }
    const leds = [];
    for (let i = 0; i < (o.leds ?? 3); i++) {
      const p = place(0.06, 0.04);
      if (!p) continue;
      const c = roundedBox({ w: 0.06, h: 0.03, d: 0.04, radius: 0.008, material: "led", outline: false });
      c.position.set(p[0], top, p[1]);
      c.userData.led = true;
      leds.push(c);
      g.add(c);
    }
    // gold pads/traces as small flat rectangles scattered in the empty cells
    const padGeo = new THREE.BoxGeometry(0.035, 0.004, 0.06);
    for (let i = 0; i < (o.pads ?? 40); i++) {
      const p = place(0.04, 0.06, 6);
      if (!p) continue;
      const m = mesh(padGeo, "pad", { outline: false, cast: false });
      m.position.set(p[0], top + 0.002, p[1]);
      m.rotation.y = r.chance(0.5) ? Math.PI / 2 : 0;
      g.add(m);
    }
    g.userData.setLeds = (k) => { for (const l of leds) if (l.material.emissive) l.material.emissiveIntensity = k; }; // call AFTER assembly.setFocus (it resets emission)
    g.userData.height = top + 0.18;
    return g;
  }

  // ------------------------------------------------------------ outlines: kit edges.outlineMesh (promoted, same code)
  const inkLines = (polys, o = {}) => screenLines(stage, polys, { blending: "normal", bias: OL.bias, order: "parallel", ...o });
  /** outline(mesh) -> creases + per-frame silhouettes (sync(camera)); mesh.userData.outline = { crease, sil, sync, style }. */
  const outline = (m) => {
    const rec = outlineMesh(stage, m, { creaseDeg: OL.creaseDeg, color: OL.color, width: OL.width, creaseWidth: OL.creaseWidth, level: 1, creaseLevel: OL.creaseLevel, bias: OL.bias });
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    rec.size = m.geometry.boundingSphere.radius; // hero accent width scales with this (thin sub-parts would flood orange)
    return rec;
  };
  /** outlineAll(root) -> [rec]: outline every mesh under root (skips userData.noOutline and line meshes). */
  function outlineAll(root) {
    const list = [];
    root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && !o.userData.outline && !(o.material?.isShaderMaterial)) list.push(o); });
    return list.map(outline);
  }

  // ------------------------------------------------------------ assembly
  /**
   * assembly(parts, { plan }) -> Group (the assembly root; the scene positions it). Children: `pivot` (orient it with
   *   setPose(quaternion)) holding one holder per part. parts: [{ id, object, rest: [x,y,z] (pivot-local, assembled),
   *   offset (exploded distance along local +Y; sign = direction) | dir: [x,y,z] (unit) with offset, spin?: bool (screw:
   *   object.userData.turn(a) while travelling), seat?: id (axis lines run from this part to its seat), axes?: [[x,z]] (axis
   *   line positions, part-local; default [[0,0]]), anchor?: [x,y,z] (callout point, part-local), footprint?: r (floor blob) }]
   *   plan: explodePlan(parts, ...) result (style.explodePlan). Every part's materials are cloned per part (for focus/dim).
   *   userData:
   *     update(t)            schedule-driven amounts (pure f(t)); returns the amounts map
   *     explode(a | {id: a}) set amounts directly (0 rest .. 1 exploded) — for stills / custom timing
   *     setPose(q)           pivot quaternion (orient the assembly axis in the world)
   *     setFocus({id: w}, k) focus weight per part (1 = hero) applied with strength k (0 = no focus at all)
   *     worldOf(id, local)   world position of a part-local point (callout anchors)
   *     sync(camera)         recompute silhouettes + axis lines (call after the camera moves, before render)
   *     parts, byId, axis (Mesh), shadows (Group: add to the scene), setFloor(y)
   */
  function assembly(parts, o = {}) {
    const plan = o.plan ?? explodePlan(parts, {});
    const root = new THREE.Group(), pivot = new THREE.Group();
    root.name = o.name ?? "assembly";
    root.add(pivot);
    const recs = parts.map((p) => {
      const holder = new THREE.Group();
      holder.name = `part:${p.id}`;
      holder.add(p.object);
      pivot.add(holder);
      // per-part material clones (focus/dim must not leak to other parts)
      const clones = new Map(), mats = [];
      p.object.traverse((x) => {
        if (!x.isMesh || x.material?.isShaderMaterial) return;
        let c = clones.get(x.material);
        if (!c) {
          c = x.material.clone();
          c.userData.baseEI = x.material.emissiveIntensity ?? 1;
          clones.set(x.material, c);
          mats.push({ m: c, color: c.color.clone(), dimColor: dimColorOf(c.color), metalness: c.metalness ?? 0, emissive: c.emissive ? c.emissive.clone().multiplyScalar(c.emissiveIntensity ?? 1) : null });
        }
        x.material = c;
      });
      const lines = outlineAll(p.object);
      // local Y extent of the part (axis-line endpoints)
      holder.updateWorldMatrix(true, true);
      const bb = new THREE.Box3();
      p.object.traverse((x) => { if (x.isMesh && !x.material?.isShaderMaterial) { x.geometry.computeBoundingBox(); const b = x.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().copy(holder.matrixWorld).invert().multiply(x.matrixWorld)); bb.union(b); } });
      const pr = plan.byId[p.id] ?? { out: { start: Infinity, dur: 1 }, back: { start: Infinity, dur: 1 }, offset: p.offset };
      const dir = new THREE.Vector3(...(p.dir ?? [0, 1, 0])).normalize();
      return { ...p, holder, mats, lines, bb, plan: pr, dir, amount: 0, focus: 0 };
    });
    const byId = Object.fromEntries(recs.map((r) => [r.id, r]));

    // dash-dot centre lines between each part and its seat (pivot-local; endpoints rewritten per frame)
    const AX = spec.axis;
    const axisPairs = [];
    for (const r of recs) {
      if (!r.seat || !byId[r.seat]) continue;
      for (const [x, z] of r.axes ?? [[0, 0]]) axisPairs.push({ r, s: byId[r.seat], x, z });
    }
    const axis = inkLines(axisPairs.map(() => [[0, 0, 0], [0, 0.001, 0]]), { width: AX.width, color: AX.color, dash: AX.dash, level: AX.level, capacity: Math.max(1, axisPairs.length), name: "axisLines", bias: 0 });
    axis.renderOrder = 1;
    pivot.add(axis);

    // floor shadows: one soft blob per part that slides with it (the shadow "stretches" as parts separate)
    const SH = spec.shadow;
    const blobTex = blobTexture();
    const shadows = new THREE.Group();
    shadows.name = "partShadows";
    let floorY = o.floorY ?? -3;
    const blobs = recs.filter((r) => r.footprint).map((r) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, color: P.shadow, transparent: true, opacity: SH.blobOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      shadows.add(m);
      return { r, m };
    });
    const ground = createGround({ size: 80, shadowOnly: true, shadowOpacity: SH.floorOpacity });
    shadows.add(ground);

    const V = new THREE.Vector3();
    const apply = () => {
      for (const r of recs) {
        r.holder.position.set(...r.rest).addScaledVector(r.dir, r.offset * r.amount);
        if (r.spin && r.object.userData.turn) r.object.userData.turn(r.angle ?? 0);
      }
    };
    const setFloor = (y) => { floorY = y; ground.position.y = y; };
    setFloor(floorY);
    Object.assign(root.userData, {
      parts: recs, byId, axis, shadows, plan, pivot,
      update(t) {
        for (const r of recs) { r.amount = explodeAmount(t, r.plan, plan); r.angle = r.spin ? screwAngle(t, r.plan, plan) : 0; }
        apply();
        return Object.fromEntries(recs.map((r) => [r.id, r.amount]));
      },
      explode(a) {
        for (const r of recs) { r.amount = typeof a === "number" ? a : a[r.id] ?? 0; r.angle = r.spin ? clamp(r.amount) * spec.explode.screwTurns * TAU : 0; }
        apply();
      },
      setPose(q) { pivot.quaternion.copy(q); },
      setFloor,
      setFocus(weights = {}, k = 1) {
        for (const r of recs) {
          const w = clamp(weights[r.id] ?? 0), d = k * (1 - w), dim = d * FO.dim, hl = k * w;
          for (const x of r.mats) {
            x.m.color.copy(x.color).lerp(x.dimColor, dim);
            if ("metalness" in x.m) x.m.metalness = x.metalness * (1 - dim * (1 - FO.metalness));
            if (x.m.emissive) {
              x.m.emissive.setRGB(0, 0, 0);
              if (x.emissive) x.m.emissive.copy(x.emissive).multiplyScalar(1 - 0.7 * dim);
              x.m.emissive.add(TMP.copy(accentLin).multiplyScalar(hl * FO.glow));
              x.m.emissiveIntensity = 1;
            }
          }
          // silhouette: ink -> accent on the hero; creases stay ink (accent creases flooded small dark parts orange)
          inkCol.set(OL.color).lerp(dimLineCol, d);
          const level = lerp(1, FO.dimLineLevel, d);
          for (const l of r.lines) {
            silCol.copy(inkCol).lerp(accentLin, hl * clamp((l.size ?? 1) / 0.12)); // tiny bits (pins, pads) stay ink
            l.style(inkCol, lerp(OL.width, OL.highlightWidth, hl * clamp((l.size ?? 1) / OL.highlightSize)), level);
            if (l.crease) l.crease.userData.materials[0].uniforms.uWidth.value = OL.creaseWidth; // creases keep their width
            for (const m of l.sil.userData.materials) m.uniforms.uColor.value.copy(silCol);
          }
        }
      },
      worldOf(id, local = [0, 0, 0]) {
        const r = byId[id];
        r.holder.updateWorldMatrix(true, false);
        return r.object.localToWorld(V.set(...local)).toArray();
      },
      sync(camera) {
        root.updateMatrixWorld(true);
        for (const r of recs) for (const l of r.lines) l.sync(camera);
        // axis lines: from this part's facing end to the seat's facing end, at (x, z) part-local
        const polys = axisPairs.map(({ r, s, x, z }) => {
          const up = r.dir.y * r.offset * r.amount >= s.dir.y * s.offset * s.amount; // part above its seat along the axis
          if (Math.abs(r.dir.y) < 0.999) {
            // off-axis travel: from the docking point (rest pose, carried by the seat) to the part's facing end
            const ey = up ? r.bb.min.y : r.bb.max.y, sd = s.dir.clone().multiplyScalar(s.offset * s.amount);
            const Q = [r.rest[0] + x + sd.x, r.rest[1] + ey + sd.y, r.rest[2] + z + sd.z];
            const Pp = [r.holder.position.x + x, r.holder.position.y + ey, r.holder.position.z + z];
            return Math.hypot(Pp[0] - Q[0], Pp[1] - Q[1], Pp[2] - Q[2]) > 0.08 ? [Q, Pp] : [Pp, [Pp[0], Pp[1] + 1e-4, Pp[2]]];
          }
          const ry = r.holder.position.y + (up ? r.bb.min.y : r.bb.max.y);
          const sy = s.holder.position.y + (up ? s.bb.max.y : s.bb.min.y);
          const px = r.holder.position.x + x, pz = r.holder.position.z + z;
          const gap = up ? ry - sy : sy - ry;
          return gap > 0.05 ? [[px, sy + (up ? 0.04 : -0.04), pz], [px, ry - (up ? 0.04 : -0.04), pz]] : [[px, ry, pz], [px, ry + 1e-4, pz]];
        });
        axis.userData.setPolys(polys);
        const open = Math.max(0, ...recs.map((r) => Math.abs(r.amount)));
        axis.userData.setLevel(clamp(open * 1.5));
        // floor blobs
        for (const { r, m } of blobs) {
          r.holder.getWorldPosition(V);
          const hgt = Math.max(0, V.y - floorY);
          const s = r.footprint * 2 * SH.blobSpread * (1 + hgt * 0.06);
          m.scale.set(s, s, 1);
          m.position.set(V.x, floorY + 0.005, V.z);
          m.material.opacity = SH.blobOpacity / (1 + hgt * 0.12);
        }
      },
    });
    root.userData.explode(0);
    return root;
  }

  // ------------------------------------------------------------ overlay UI (exact colours, never blurred)
  const flat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
  const ord = (m, n) => ((m.renderOrder = n), m);
  /** uiText(text, color, h, weight) -> label mesh (white glyphs tinted by material.color, so it can be recoloured). */
  const uiText = (text, color, h, weight = 700, spacing = 1) => {
    const m = createTextLabel(text, { font: uiFont, weight, color: "#ffffff", height: h, padding: 0.06, letterSpacing: spacing });
    m.material.depthTest = false;
    m.material.color.set(color);
    return m;
  };
  const leftAlign = (m, x = 0, y = 0) => (m.position.set(x + m.scale.x / 2, y, 0), m);
  const aspect = stage.width / stage.height;
  const ov = getOverlay(stage);

  /**
   * callout({ n, title, sub, side = "right", anchors = 1 }) -> handle (overlay): numbered dot(s) on the part, a thin leader
   *   with an elbow, and a label (bold title + lighter sub line) set in the grotesque.
   *   handle.place({ anchors: [[x,y,z] world...], label: [ndcX, ndcY] }) every frame (after the camera moves);
   *   handle.set(reveal 0..1, hide 0..1) — dots pop, leaders draw on, label slides in; hide fades it all.
   *   Label origin = the leader's end (left end of the text for side "right", right end for "left").
   */
  function callout(o = {}) {
    const nA = o.anchors ?? 1, side = o.side === "left" ? -1 : 1;
    const H = o.height ?? 0.05; // title line height, fraction of frame height
    const dots = Array.from({ length: nA }, (_, i) => {
      const g = new THREE.Group();
      g.add(ord(new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), flat(U.paper)), 40));
      const disc = ord(new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), flat(U.dot)), 41);
      g.add(disc);
      if (o.n != null && i === 0) g.add(ord(uiText(String(o.n), U.dotText, 0.62, 800, 0), 42));
      else g.add(ord(new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), flat(U.dotText)), 42));
      g.userData.disc = disc;
      ov.add(g);
      return g;
    });
    const lab = new THREE.Group();
    const t1 = ord(uiText(o.title ?? "", U.ink, 1, 800, 2), 44);
    const t2 = o.sub ? ord(uiText(o.sub, U.inkSoft, 0.58, 500, 3), 44) : null;
    const bar = ord(new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.55), flat(U.accent)), 43);
    const inner = new THREE.Group();
    lab.add(inner);
    const tw = Math.max(t1.scale.x, t2?.scale.x ?? 0);
    const x0 = 0.32;
    if (side > 0) { bar.position.set(0.12, -0.28, 0); leftAlign(t1, x0, 0.08); if (t2) leftAlign(t2, x0 + 0.02, -0.72); }
    else { bar.position.set(-0.12, -0.28, 0); t1.position.set(-x0 - t1.scale.x / 2, 0.08, 0); if (t2) t2.position.set(-x0 - 0.02 - t2.scale.x / 2, -0.72, 0); }
    inner.add(bar, t1);
    if (t2) inner.add(t2);
    ov.add(lab);
    const leaders = inkLines(Array.from({ length: nA }, () => [[0, 0, 0], [0.01, 0, 0], [0.02, 0, 0]]), { width: U.leaderWidth, color: U.ink, depth: "none", capacity: nA * 2, order: "parallel", name: "leaders" });
    ord(leaders, 39);
    ov.add(leaders);
    let reveal = 0, hide = 0;
    const handle = {
      group: lab, dots, leaders, width: tw,
      set(rv, hd = 0) { reveal = rv; hide = hd; },
      setActive(k) { const c = new THREE.Color(U.dot).lerp(new THREE.Color(U.accent), k); for (const d of dots) d.userData.disc.material.color.copy(c); },
      place({ anchors, label }) {
        const vis = reveal > 0 && hide < 1;
        const fade = 1 - ease.inCubic(clamp(hide));
        const lx = label[0] * aspect, ly = label[1];
        const polys = [];
        anchors.forEach((a, i) => {
          const p = projectToScreen(stage, a), d = dots[i];
          const k = reveal <= 0 ? 0 : ease.outBack(clamp((reveal - i * 0.08) / 0.3), 2.2);
          pinToScreen(stage, d, { x: p.x, y: p.y, height: o.dotSize ?? 0.024 });
          d.scale.multiplyScalar(Math.max(1e-4, k));
          d.visible = vis && k > 1e-3 && !p.behind;
          d.traverse((x) => x.material && (x.material.opacity = fade));
          // leader: dot -> elbow (horizontal run into the label) -> label
          const ax = p.x * aspect, ay = p.y;
          const ex = lx - side * 0.06;
          polys.push([[ax, ay, 0], [ex, ly, 0], [lx, ly, 0]]);
        });
        leaders.userData.setPolys(polys);
        leaders.userData.setProgress(ease.inOutCubic(clamp((reveal - 0.12) / 0.45)));
        leaders.userData.setLevel(fade);
        leaders.visible = vis;
        // label: slides in from the leader end, accent bar first
        const lr = ease.outCubic(clamp((reveal - 0.45) / 0.45));
        pinToScreen(stage, lab, { x: label[0], y: label[1], height: H });
        inner.position.x = side * (1 - lr) * -0.6;
        t1.material.opacity = lr * fade;
        if (t2) t2.material.opacity = clamp((reveal - 0.6) / 0.35) * fade;
        bar.material.opacity = clamp((reveal - 0.4) / 0.2) * fade;
        bar.scale.y = Math.max(1e-4, ease.outCubic(clamp((reveal - 0.4) / 0.35)));
        lab.visible = vis;
      },
    };
    handle.set(0);
    return handle;
  }

  /**
   * legend(items: [{ n, name }], { title = "PARTS" }) -> Group (overlay; pin it with pinToScreen, origin = top-left,
   *   1 unit = one row height). userData.set(reveal) staggers rows in; userData.setActive({ n: weight }) turns a
   *   row's number accent and its name to full ink (others soften).
   */
  function legend(items, o = {}) {
    const g = new THREE.Group();
    g.name = "legend";
    const head = ord(uiText(o.title ?? "PARTS", U.inkSoft, 0.62, 700, 6), 50);
    leftAlign(head, 0, -0.35);
    const rule = ord(new THREE.Mesh(new THREE.PlaneGeometry(o.width ?? 6, 0.04), flat(U.ink)), 50);
    rule.position.set((o.width ?? 6) / 2, -0.82, 0);
    g.add(head, rule);
    const rows = items.map((it, i) => {
      const y = -1.45 - i * (o.rowGap ?? 0.98);
      const num = ord(uiText(String(it.n).padStart(2, "0"), U.inkSoft, 0.7, 700, 1), 51);
      leftAlign(num, 0, y);
      const name = ord(uiText(it.name, U.ink, 0.7, 500, 1), 51);
      leftAlign(name, 0.95, y);
      const tick = ord(new THREE.Mesh(new THREE.PlaneGeometry(o.width ?? 6, 0.02), flat(U.rule)), 50);
      tick.position.set((o.width ?? 6) / 2, y - 0.46, 0);
      g.add(num, name, tick);
      return { n: it.n, num, name, tick };
    });
    const ink = new THREE.Color(U.ink), soft = new THREE.Color(U.inkSoft), acc = new THREE.Color(U.accent);
    let rv = 0;
    g.userData.set = (reveal) => {
      rv = reveal;
      const hk = clamp(reveal * 3);
      head.material.opacity = hk; rule.material.opacity = hk;
      rule.scale.x = Math.max(1e-4, ease.outCubic(hk)); rule.position.x = ((o.width ?? 6) / 2) * rule.scale.x;
      rows.forEach((r, i) => {
        const k = clamp((reveal - 0.15 - i * Math.min(0.07, 0.5 / Math.max(1, rows.length - 1))) / 0.3);
        for (const m of [r.num, r.name, r.tick]) m.material.opacity = k;
        r.name.position.x = 0.95 + r.name.scale.x / 2 - (1 - ease.outCubic(k)) * 0.4;
      });
      g.visible = reveal > 0;
    };
    g.userData.setActive = (w = {}) => {
      const any = Math.max(0, ...Object.values(w));
      for (const r of rows) {
        const k = clamp(w[r.n] ?? 0);
        r.num.material.color.copy(soft).lerp(acc, k);
        r.name.material.color.copy(ink).lerp(soft, any * (1 - k) * 0.7);
      }
    };
    g.userData.setActive({});
    g.userData.set(0);
    return g;
  }

  /** titleBlock(title, { kicker }) -> Group (overlay, origin = top-left of the title; 1 unit = title line). userData.set(reveal, hide). */
  function titleBlock(title, o = {}) {
    const g = new THREE.Group();
    const kick = o.kicker ? ord(uiText(o.kicker, U.accent, 0.42, 700, 7), 60) : null;
    const t = ord(uiText(title, U.ink, 1, 800, 1), 60);
    const bar = ord(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.07), flat(U.ink)), 60);
    if (kick) leftAlign(kick, 0.02, 0.62);
    leftAlign(t, 0, -0.1);
    bar.position.set(0.7, -0.78, 0);
    const inner = new THREE.Group();
    inner.add(t, bar);
    if (kick) inner.add(kick);
    g.add(inner);
    g.userData.width = t.scale.x;
    g.userData.set = (reveal, hide = 0) => {
      const k = ease.outCubic(clamp(reveal)), f = 1 - clamp(hide);
      inner.position.x = (1 - k) * -0.5;
      t.material.opacity = clamp(reveal * 1.6 - 0.2) * f;
      if (kick) kick.material.opacity = clamp(reveal * 2) * f;
      bar.material.opacity = f;
      bar.scale.x = Math.max(1e-4, ease.outCubic(clamp(reveal * 1.3 - 0.3)));
      bar.position.x = 0.7 * bar.scale.x;
      g.visible = reveal > 0 && hide < 1;
    };
    g.userData.set(0);
    return g;
  }

  /** studio({ floorY }) -> nothing to add: background is the spec sky; floor shadows come with each assembly (assembly.userData.shadows). */
  const pin = (obj, opts) => pinToScreen(stage, obj, opts);

  const props = { roundedBox, plate, lathe, drum, shell, ring, gear, fan, coil, screw, wheel, roller, pcb, assembly, callout, legend, titleBlock, outline, outlineAll };
  const P_ = (fn) => (os) => fn(os.params ?? {});
  const factories = {
    roundedBox: P_(roundedBox), plate: P_(plate), drum: P_(drum), shell: P_(shell), ring: P_(ring), gear: P_(gear), fan: P_(fan),
    coil: P_(coil), screw: P_(screw), wheel: P_(wheel), roller: P_(roller), pcb: P_(pcb),
    lathe: (os) => lathe(os.params.profile, os.params),
  };
  return {
    spec,
    palette: P,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories,
    shapes: { drumProfile, shellProfile },
    plan: { explodePlan, explodeAmount, screwAngle, explodeCues },
    helpers: { pin, uiText, projectToScreen: (p) => projectToScreen(stage, p) },
    sfx: spec.sfx,
  };
}
