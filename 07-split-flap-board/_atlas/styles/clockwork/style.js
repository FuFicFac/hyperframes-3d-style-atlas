// styles/clockwork/style.js — "Clockwork": the inside of a fine mechanical movement, shot macro.
// Implements the style contract (references/kit-api.md §3).
//
// Geometry comes from the THREE-free planner ./train.js (gear/escape/cam outlines, hairspring points) so the picture,
// the Node mesh check (train.meshReport) and the SCORE agree. Nothing animates itself: the scene computes angles with
// the planner (train.angle(id, t), esc.balance(t), esc.anchor(t), follower lift) and calls setAngle(...) / update(...).
//
// Finishes: wheels = brass with a circular-grain roughness map + RADIAL anisotropy (stretched "sunburst" glints);
// plate = anthracite with perlage; bridges = gilt brass with Côtes de Genève stripes and engraved, ink-filled lettering;
// screws and hairspring heat-blued; jewels = ruby in polished gold chatons. Reflections come from a procedural warm
// studio (kit studio.studioEnvironment); depth of field from kit studio.depthOfField. Captions: an enamel plaque with a
// brass bezel on the overlay (exact colours, after post).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { makeCanvas, canvasTexture, paintPixels } from "../../kit/textures.js";
import { studioEnvironment, depthOfField } from "../../kit/studio.js";
import { liveTube } from "../../kit/paths.js";
import { strokeOutline } from "../../kit/pathmath.js";
import { pinToScreen } from "../../kit/overlay.js";
import { rng, hash01, clamp, TAU, ease } from "../../kit/time.js";
import * as TRAIN from "./train.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/** createStyle(stage, opts?) -> style        opts: { post = true, dof = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, G = spec.geometry, F = spec.finish;
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  if (lights.key?.target && !lights.key.target.parent) stage.scene.add(lights.key.target);
  if (lights.rim?.target && !lights.rim.target.parent) stage.scene.add(lights.rim.target);
  const shadow = (o, cast = true, recv = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; };

  // ---------------------------------------------------------------- environment + depth of field
  const studio = studioEnvironment(stage, spec.studio, { lights: {} });
  const dof = opts.dof === false || !post ? { setFocus() {} } : depthOfField(stage, spec.dof);

  // ---------------------------------------------------------------- finishes
  // circular grain: roughness (G) rings; anisotropy direction = radial (RG), strength B
  const grainRough = (() => {
    const g = F.grain, R = rng(g.seed);
    const rings = Array.from({ length: g.rings }, () => R.next());
    const cnv = paintPixels(g.size, (u, v) => {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const k = Math.min(g.rings - 1, Math.floor(r * g.rings));
      const n = rings[k] * 0.7 + rings[(k * 7 + 3) % g.rings] * 0.3;
      return clamp(g.roughness[0] + (g.roughness[1] - g.roughness[0]) * (0.5 + (n - 0.5) * g.contrast * 4));
    });
    return canvasTexture(cnv, { srgb: false });
  })();
  const anisoMap = (() => {
    // canvas row 0 is uv v = 1 (flipY), so the v direction is flipped here
    const cnv = paintPixels(256, (u, v) => {
      // sample at pixel centres: the exact centre would encode a zero vector (normalize -> NaN in the shader)
      let x = u + 0.5 / 256 - 0.5, y = 0.5 - (v + 0.5 / 256);
      const l = Math.hypot(x, y) || 1;
      x /= l; y /= l;
      return [x * 0.5 + 0.5, y * 0.5 + 0.5, 1];
    });
    return canvasTexture(cnv, { srgb: false });
  })();
  const brushed = (base) => {
    const m = base.clone();
    m.roughness = 1;
    m.roughnessMap = grainRough;
    if ("anisotropy" in m) { m.anisotropy = F.anisotropy; m.anisotropyMap = anisoMap; }
    m.envMapIntensity = spec.envIntensity;
    return m;
  };
  // flanks / side walls of extruded parts: rougher and dimmer than the faces — fine teeth otherwise throw hot,
  // flickering glints (every tooth flank is a little mirror aimed at the softboxes)
  const sideOf = (base) => {
    const m = base.clone();
    m.roughness = F.side.roughness;
    m.roughnessMap = null;
    m.envMapIntensity = F.side.env;
    // no anisotropy on side walls: their UVs are degenerate, and the derivative-based tangent frame turns into NaN
    // (one NaN pixel and bloom blacks out half the frame)
    if ("anisotropy" in m) { m.anisotropy = 0; m.anisotropyMap = null; }
    m.name = `${base.name}:side`;
    return m;
  };
  const sides = new Map();
  const withSides = (mat) => { if (!sides.has(mat)) sides.set(mat, sideOf(mat)); return [mat, sides.get(mat)]; };
  // RULE: anisotropic (brushed) materials only on the CAPS of geometry made by extrude() (explicit +X tangents), always
  // via withSides(mat) so side walls get a plain material. On primitives the derivative tangent frame, and on ±X side
  // walls the +X tangent, are degenerate -> NaN -> bloom blacks out part of the frame.
  const M = {
    brass: brushed(materials.brass),
    brassPolished: materials.brassPolished,
    gilt: materials.gilt,
    plate: materials.plate,
    gold: brushed(materials.gold),
    goldPolished: materials.gold,
    steel: materials.steel,
    steelBrushed: brushed(materials.steel),
    blued: materials.blued,
    ruby: materials.ruby,
    spring: materials.spring,
    dark: new THREE.MeshStandardMaterial({ color: "#0d0c0b", roughness: 0.6, metalness: 0.2 }),
  };
  for (const m of Object.values(M)) if (m.envMapIntensity !== undefined) m.envMapIntensity = spec.envIntensity;
  M.steel.envMapIntensity = M.steelBrushed.envMapIntensity = spec.steelEnv ?? 1;

  // ---------------------------------------------------------------- geometry helpers
  const shapeOf = (poly, holes = []) => {
    const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  };
  const circlePoly = (r, n = 48, ccw = true) => Array.from({ length: n }, (_, i) => { const a = ((ccw ? i : -i) / n) * TAU; return [r * Math.cos(a), r * Math.sin(a)]; });
  /** extrude a 2D shape along +Z (0..depth) with a bevel that stays INSIDE the outline; planar UVs over ±uvR. */
  const extrude = (shape, depth, { bevel = G.bevel, uvR = 1, uvBox = null, curveSegments = 6 } = {}) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments });
    geo.translate(0, 0, bevel);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      if (uvBox) uv.setXY(i, (x - uvBox.minX) / uvBox.w, (y - uvBox.minY) / uvBox.h);
      else uv.setXY(i, x / (2 * uvR) + 0.5, y / (2 * uvR) + 0.5);
    }
    uv.needsUpdate = true;
    geo.computeVertexNormals();
    // explicit tangents (planar UVs: u runs along +X). Without them the anisotropic brass uses screen-derivative
    // tangent frames, which go NaN on faces seen edge-on — and bloom spreads one NaN pixel over half the frame.
    const tan = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) { tan[i * 4] = 1; tan[i * 4 + 3] = 1; }
    geo.setAttribute("tangent", new THREE.BufferAttribute(tan, 4));
    return geo;
  };
  const geoCache = new Map();
  const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
  const cylZ = (r, h, seg = 24, rTop = r) => new THREE.CylinderGeometry(rTop, r, h, seg).rotateX(Math.PI / 2).translate(0, 0, h / 2);

  // ---------------------------------------------------------------- small parts
  /** screw({ r }) -> heat-blued screw head (slot seeded), sits on z = 0 of its parent surface. */
  function screw(o = {}) {
    const r = o.r ?? G.screw.r, g = new THREE.Group();
    const head = new THREE.Mesh(cached(`screw${r}`, () => cylZ(r, r * 0.42, 28, r * 0.86)), M.blued);
    const slot = new THREE.Mesh(cached(`slot${r}`, () => new THREE.BoxGeometry(r * 1.9, r * 0.2, r * 0.3)), M.dark);
    slot.position.z = r * 0.36;
    slot.rotation.z = hash01(o.seed ?? 1, 77) * Math.PI;
    g.add(head, slot);
    return shadow(g);
  }
  /** jewel({ r, chaton }) -> ruby in a polished gold chaton with the pivot showing, on z = 0 of its parent. */
  function jewel(o = {}) {
    const r = o.r ?? G.jewel.r, rc = o.chaton ?? G.jewel.chaton, g = new THREE.Group();
    const ring = new THREE.Mesh(cached(`chaton${rc}`, () => extrude(shapeOf(circlePoly(rc, 48), [circlePoly(r * 0.96, 40, false)]), 0.035, { bevel: 0.006, uvR: rc })), M.goldPolished);
    const stone = new THREE.Mesh(cached(`ruby${r}`, () => cylZ(r, 0.026, 32)), M.ruby);
    const dome = new THREE.Mesh(cached(`rubyDome${r}`, () => new THREE.SphereGeometry(r * 0.62, 24, 10, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.35)), M.ruby);
    dome.position.z = 0.024;
    const pivot = new THREE.Mesh(cached(`pivot${r}`, () => cylZ(r * 0.2, 0.05, 12)), M.steel);
    g.add(ring, stone, dome, pivot);
    return shadow(g);
  }
  /** arbor({ z0, z1, r }) -> polished steel staff along Z. */
  function arbor(o = {}) {
    const r = o.r ?? G.arborRadius, z0 = o.z0 ?? 0, z1 = o.z1 ?? 1;
    const m = new THREE.Mesh(cached(`arbor${r}:${z1 - z0}`, () => cylZ(r, z1 - z0, 16)), M.steel);
    m.position.z = z0;
    return shadow(m);
  }

  // ---------------------------------------------------------------- wheels
  /**
   * gear({ teeth, module, spokes = 5, thickness, material = "brass", hubR, rimW, spokeW }) -> Mesh (XY, z 0..thickness)
   *   Involute wheel from train.gearOutline with a rim, straight spokes and a hub; planar UVs for the circular grain.
   */
  function gear(o) {
    const m = o.module ?? G.module, z = o.teeth, th = o.thickness ?? G.wheelThickness;
    const r = (m * z) / 2, rf = r - 1.25 * m, rimIn = rf - (o.rimW ?? G.rimWidth) * m;
    const hub = Math.max(o.hubR ?? G.hubRadius * m, 0.09);
    const n = o.spokes ?? 5;
    const key = `gear${z}:${m}:${n}:${th}:${hub}:${rimIn}`;
    const geo = cached(key, () => {
      const holes = n > 0 && rimIn > hub + 0.06 ? TRAIN.spokeHoles(rimIn, hub, n, (o.spokeW ?? G.spokeWidth) * m, { phase: 0.3 }) : [];
      holes.push(circlePoly(G.arborRadius * 1.02, 20, false));
      return extrude(shapeOf(TRAIN.gearOutline(z, m), holes), th, { uvR: r + m });
    });
    const mesh = new THREE.Mesh(geo, withSides(M[o.material ?? "brass"] ?? o.material));
    return shadow(mesh);
  }
  /** pinion({ leaves, module, length }) -> polished steel pinion (XY, z 0..length). */
  function pinion(o) {
    const m = o.module ?? G.module, z = o.leaves, L = o.length ?? 0.12;
    const geo = cached(`pinion${z}:${m}:${L}`, () => extrude(shapeOf(TRAIN.gearOutline(z, m, { addendum: 0.95, dedendum: 1.3 })), L, { bevel: 0.004, uvR: (m * z) / 2 + m }));
    return shadow(new THREE.Mesh(geo, withSides(M.steel)));
  }
  /**
   * wheelSet({ wheel:{ teeth, z, spokes, material }, pinion:{ leaves, z0, z1 }, arbor:{ z0, z1 }, module, collet = true })
   *   -> Group at the arbor centre: arbor + pinion + wheel (+ polished collet). userData.setAngle(a).
   */
  function wheelSet(o) {
    const g = new THREE.Group(), spin = new THREE.Group();
    g.add(spin);
    const m = o.module ?? G.module;
    if (o.arbor) spin.add(arbor({ z0: o.arbor.z0, z1: o.arbor.z1 }));
    if (o.pinion) { const p = pinion({ leaves: o.pinion.leaves, module: o.pinion.module ?? m, length: o.pinion.z1 - o.pinion.z0 }); p.position.z = o.pinion.z0; spin.add(p); }
    if (o.wheel) {
      const w = gear({ teeth: o.wheel.teeth, module: o.wheel.module ?? m, spokes: o.wheel.spokes, material: o.wheel.material, thickness: o.wheel.thickness });
      w.position.z = o.wheel.z;
      spin.add(w);
      if (o.collet !== false) {
        const c = new THREE.Mesh(cached("collet", () => cylZ(0.085, 0.05, 28, 0.07)), M.steel);
        c.position.z = o.wheel.z + (o.wheel.thickness ?? G.wheelThickness);
        spin.add(shadow(c));
      }
    }
    g.userData.spin = spin;
    g.userData.setAngle = (a) => { spin.rotation.z = a; };
    return g;
  }

  /** escapeWheel({ teeth = 15, rTip, rRoot, thickness, spokes = 5, material = "steel" }) -> Mesh (XY) */
  function escapeWheel(o) {
    const z = o.teeth ?? 15, rT = o.rTip, rR = o.rRoot ?? rT * 0.78, th = o.thickness ?? 0.045;
    const rimIn = rR - 0.05, hub = 0.1;
    const geo = cached(`esc${z}:${rT}:${rR}:${th}`, () => {
      const holes = TRAIN.spokeHoles(rimIn, hub, o.spokes ?? 5, 0.045, { phase: 0.2 });
      holes.push(circlePoly(G.arborRadius * 1.02, 20, false));
      return extrude(shapeOf(TRAIN.ratchetOutline(z, rT, rR), holes), th, { bevel: 0.004, uvR: rT });
    });
    return shadow(new THREE.Mesh(geo, withSides(o.material === "brass" ? M.brass : M.steelBrushed)));
  }

  /**
   * anchor({ layout, wheelCenter, rTip, forkTo:[x,y], z, thickness }) -> Group with its origin at the anchor PIVOT
   *   (place it at layout.pivot). Steel body, two ruby pallet stones whose inner faces sit at the escape wheel's tip
   *   radius at angle 0 (± lift moves one in, the other out), a fork with horns reaching the balance roller.
   *   userData.setAngle(a). userData.forkTip = fork notch (anchor-local).
   */
  function anchor(o) {
    const L = o.layout, E = o.wheelCenter, rT = o.rTip, th = o.thickness ?? 0.05;
    const piv = L.pivot;
    const loc = (p) => [p[0] - piv[0], p[1] - piv[1]];
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const pal = (ang) => {
      const u = [Math.cos(ang), Math.sin(ang)];
      return { u, inner: loc([E[0] + u[0] * (rT + 0.006), E[1] + u[1] * (rT + 0.006)]), outer: loc([E[0] + u[0] * (rT + 0.2), E[1] + u[1] * (rT + 0.2)]) };
    };
    const en = pal(L.entry.angle), ex = pal(L.exit.angle);
    // arms: thick strokes from the pivot to each pallet's outer end, and the fork to the balance roller
    const forkTip = loc(o.forkTo);
    const fl = Math.hypot(...forkTip), fu = [forkTip[0] / fl, forkTip[1] / fl];
    const armPoly = (a, b, w) => strokeOutline([[a[0], a[1]], [b[0], b[1]]], w, { cap: 8 });
    const arms = [armPoly([0, 0], en.outer, 0.06), armPoly([0, 0], ex.outer, 0.06), armPoly([0, 0], [forkTip[0] - fu[0] * 0.07, forkTip[1] - fu[1] * 0.07], 0.035)];
    for (const a of arms) body.add(shadow(new THREE.Mesh(extrude(shapeOf(a), th, { bevel: 0.005, uvR: 1 }), withSides(M.steelBrushed))));
    // fork horns: a U at the fork end (notch facing the roller)
    const nrm = [-fu[1], fu[0]], hw = 0.05, hl = 0.11;
    const base = [forkTip[0] - fu[0] * 0.09, forkTip[1] - fu[1] * 0.09];
    const horn = (s) => strokeOutline([[base[0] + nrm[0] * hw * s, base[1] + nrm[1] * hw * s], [base[0] + nrm[0] * hw * s + fu[0] * hl, base[1] + nrm[1] * hw * s + fu[1] * hl]], 0.022, { cap: 6 });
    const bar = strokeOutline([[base[0] + nrm[0] * hw, base[1] + nrm[1] * hw], [base[0] - nrm[0] * hw, base[1] - nrm[1] * hw]], 0.024, { cap: 6 });
    for (const h of [horn(1), horn(-1), bar]) body.add(shadow(new THREE.Mesh(extrude(shapeOf(h), th, { bevel: 0.004 }), withSides(M.steelBrushed))));
    // pallet stones (ruby boxes, radial)
    for (const p of [en, ex]) {
      const c = [(p.inner[0] + p.outer[0]) / 2, (p.inner[1] + p.outer[1]) / 2];
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.065, th * 1.3), M.ruby);
      s.position.set(c[0], c[1], th * 0.5);
      s.rotation.z = Math.atan2(p.u[1], p.u[0]);
      body.add(shadow(s));
    }
    // pivot staff + jewelled cap
    const hubm = new THREE.Mesh(cached("anchorHub", () => cylZ(0.06, th * 1.1, 24)), M.steel);
    body.add(shadow(hubm));
    g.userData.forkTip = forkTip;
    g.userData.setAngle = (a) => { body.rotation.z = a; };
    return g;
  }

  /**
   * balance({ r, arms = 3, screws = 14, roller, pinR, hairspring:{ r0, r1, turns, z, studAngle }, z, rimW }) -> Group at
   *   the balance centre. Gold rim + arms + timing screws, steel roller with a ruby impulse pin (pointing toward
   *   `pinDir` at angle 0), blued breathing hairspring. userData.update(angle).
   */
  function balance(o) {
    const r = o.r ?? 0.9, rimW = o.rimW ?? 0.07, zr = o.z ?? 0.35, g = new THREE.Group(), spin = new THREE.Group();
    g.add(spin);
    const th = 0.07;
    const rim = new THREE.Mesh(extrude(shapeOf(circlePoly(r, 96), [...TRAIN.spokeHoles(r - rimW, 0.12, o.arms ?? 3, 0.07, { phase: 0.5, seg: 16 }), circlePoly(0.03, 16, false)]), th, { bevel: 0.006, uvR: r }), withSides(M.gold));
    rim.position.z = zr;
    spin.add(shadow(rim));
    const nS = o.screws ?? 14;
    for (let i = 0; i < nS; i++) {
      const a = (i / nS) * TAU + 0.11;
      const s = new THREE.Mesh(cached("tscrew", () => new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14)), M.goldPolished);
      s.position.set(Math.cos(a) * (r + 0.03), Math.sin(a) * (r + 0.03), zr + th / 2);
      s.rotation.z = a - Math.PI / 2;
      const slot = new THREE.Mesh(cached("tslot", () => new THREE.BoxGeometry(0.012, 0.074, 0.05)), M.dark);
      slot.position.copy(s.position).add(new THREE.Vector3(Math.cos(a) * 0.033, Math.sin(a) * 0.033, 0));
      slot.rotation.z = a;
      spin.add(shadow(s), slot);
    }
    const staffZ0 = o.staffZ0 ?? 0;
    spin.add(arbor({ z0: staffZ0, z1: zr + 0.32, r: 0.03 }));
    // roller + impulse pin
    const rollerZ = o.rollerZ ?? zr - 0.3;
    const rollerR = (o.pinR ?? 0.3) + 0.05;
    const roller = new THREE.Mesh(extrude(shapeOf(circlePoly(rollerR, 48), [circlePoly(0.03, 12, false)]), 0.035, { bevel: 0.004, uvR: rollerR }), withSides(M.steelBrushed));
    roller.position.z = rollerZ;
    spin.add(shadow(roller));
    const pinA = o.pinDir ?? Math.PI;
    const pin = new THREE.Mesh(cached("ipin", () => cylZ(0.028, 0.11, 16)), M.ruby);
    pin.position.set(Math.cos(pinA) * (o.pinR ?? 0.3), Math.sin(pinA) * (o.pinR ?? 0.3), rollerZ - 0.02);
    spin.add(shadow(pin));
    // hairspring: blued spiral, inner end on the collet (turns with the balance), outer end at the stud (fixed)
    const H = { r0: 0.08, r1: r * 0.62, turns: 10, n: 520, z: zr - 0.12, studAngle: 0.6, ...o.hairspring };
    const spring = liveTube(H.n, 5, 0.007, M.blued);
    spring.castShadow = false;
    g.add(spring);
    const stud = new THREE.Mesh(cached("stud", () => new THREE.BoxGeometry(0.06, 0.06, 0.22)), M.steel);
    stud.position.set(Math.cos(H.studAngle) * H.r1, Math.sin(H.studAngle) * H.r1, H.z + 0.08);
    g.add(shadow(stud));
    g.userData.update = (angle) => {
      spin.rotation.z = angle;
      spring.userData.set(TRAIN.hairspringPoints(angle, H));
    };
    g.userData.update(0);
    return g;
  }

  /** pendulum({ length = 3, bobR = .45, rodR = .03 }) -> Group hanging from its origin (suspension), swings in XY. userData.setAngle(a). */
  function pendulum(o = {}) {
    const L = o.length ?? 3, br = o.bobR ?? 0.45, g = new THREE.Group(), swing = new THREE.Group();
    g.add(swing);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(o.rodR ?? 0.03, o.rodR ?? 0.03, L, 12), M.steel);
    rod.position.y = -L / 2;
    const bob = new THREE.Mesh(new THREE.SphereGeometry(br, 48, 24).scale(1, 1, 0.32), M.brassPolished);
    bob.position.y = -L;
    const spring = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.01), M.blued);
    spring.position.y = 0.05;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6), M.brassPolished);
    nut.position.y = -L - br - 0.06;
    swing.add(shadow(rod), shadow(bob), shadow(spring), shadow(nut));
    g.userData.setAngle = (a) => { swing.rotation.z = a; };
    return g;
  }

  /**
   * barrel({ teeth = 60, module, z = 0.05, height = .3, windows = 5, ratchetZ }) -> Group (XY at the barrel centre):
   *   toothed brass drum, cover with windows onto the coiled blued-grey mainspring, steel ratchet wheel with a
   *   blued click, big blued centre screw. userData.setAngle(drum) and userData.setRatchet(a).
   */
  function barrel(o = {}) {
    const m = o.module ?? G.module, z = o.teeth ?? 60, R = (m * z) / 2, rf = R - 1.25 * m, z0 = o.z ?? 0.05, H = o.height ?? 0.3;
    const g = new THREE.Group(), drum = new THREE.Group(), arb = new THREE.Group();
    g.add(drum, arb);
    const ring = new THREE.Mesh(extrude(shapeOf(TRAIN.gearOutline(z, m), [circlePoly(rf - 0.09, 96, false)]), 0.07, { uvR: R + m }), withSides(M.brass));
    ring.position.z = z0 + 0.03;
    const wallGeo = new THREE.CylinderGeometry(rf - 0.02, rf - 0.02, H, 96, 1, true).rotateX(Math.PI / 2).translate(0, 0, z0 + H / 2);
    const wall = new THREE.Mesh(wallGeo, materials.brass); // NOT the anisotropic brass: no tangents on a cylinder
    const cover = new THREE.Mesh(extrude(shapeOf(circlePoly(rf - 0.02, 96), [...TRAIN.spokeHoles(rf - 0.2, 0.42, o.windows ?? 5, 0.16, { phase: 0.1, seg: 14 }), circlePoly(0.06, 16, false)]), 0.035, { uvR: rf }), withSides(M.brass));
    cover.position.z = z0 + H;
    // mainspring: Archimedean ribbon inside the drum (seen through the windows)
    const sp = [];
    for (let i = 0; i <= 900; i++) { const s = i / 900, rr = 0.36 + (rf - 0.1 - 0.36) * s, a = s * 7.5 * TAU; sp.push([rr * Math.cos(a), rr * Math.sin(a)]); }
    const springMesh = new THREE.Mesh(extrude(shapeOf(strokeOutline(sp, 0.012, { cap: 2 })), H * 0.7, { bevel: 0, uvR: rf }), M.spring);
    springMesh.position.z = z0 + 0.05;
    const floor = new THREE.Mesh(cylZ(rf - 0.02, 0.02, 64), M.dark);
    floor.position.z = z0;
    drum.add(shadow(ring), shadow(wall), shadow(cover), shadow(springMesh), floor);
    // ratchet wheel + centre screw (turn with the barrel arbor)
    const rw = new THREE.Mesh(extrude(shapeOf(TRAIN.ratchetOutline(o.ratchetTeeth ?? 30, 0.62, 0.55, { lean: 0.35, tipW: 0.04, back: 3 }), [circlePoly(0.05, 16, false)]), 0.06, { bevel: 0.004, uvR: 0.62 }), withSides(M.steelBrushed));
    const rz = o.ratchetZ ?? z0 + H + 0.06;   // put it above the barrel bridge when there is one
    rw.position.z = rz;
    const cs = screw({ r: 0.15, seed: 3 });
    cs.position.z = rz + 0.06;
    arb.add(shadow(rw), cs, arbor({ z0: 0, z1: rz + 0.06, r: 0.06 }));
    // click (blued pawl), fixed
    const click = new THREE.Mesh(extrude(shapeOf([[0.0, 0.0], [0.34, 0.05], [0.42, 0.0], [0.36, -0.06], [0.0, -0.06]]), 0.05, { bevel: 0.004 }), M.blued);
    click.position.set(0.56, 0.18, (o.ratchetZ ?? z0 + H + 0.06) + 0.005);
    click.rotation.z = 1.9;
    g.add(shadow(click));
    g.userData.setAngle = (a) => { drum.rotation.z = a; };
    g.userData.setRatchet = (a) => { arb.rotation.z = a; };
    return g;
  }

  /** cam({ lobes, rMin, rMax, rise, thickness }) -> Mesh (steel snail cam, XY). Turn it with its arbor angle + phase. */
  function cam(o) {
    const C = { lobes: o.lobes, rMin: o.rMin, rMax: o.rMax, rise: o.rise ?? 0.88, dir: o.dir ?? 1 };
    const geo = extrude(shapeOf(TRAIN.camOutline(C, 64), [circlePoly(G.arborRadius * 1.02, 16, false)]), o.thickness ?? 0.06, { bevel: 0.004, uvR: C.rMax });
    const m = shadow(new THREE.Mesh(geo, withSides(M.steelBrushed)));
    const hub = new THREE.Mesh(cylZ(0.09, (o.thickness ?? 0.06) + 0.03, 28), M.steel);
    m.add(shadow(hub));
    return m;
  }

  /**
   * strikeLever({ pivot, nose, hammer, headR = .1, width = .07 }) -> Group with origin at the pivot (world coords given;
   *   place the group at pivot). Blued steel arm from the follower nose through the pivot to a polished hammer head.
   *   userData.setAngle(a) rotates about the pivot (a = 0 is the pose it was built in).
   */
  function strikeLever(o) {
    const piv = o.pivot, loc = (p) => [p[0] - piv[0], p[1] - piv[1]];
    const g = new THREE.Group(), arm = new THREE.Group();
    g.add(arm);
    const n = loc(o.nose), h = loc(o.hammer), th = o.thickness ?? 0.05;
    // two straight strokes (a bent 3-point stroke outline can self-intersect and triangulate into a huge sliver)
    for (const seg of [[n, [0, 0]], [[0, 0], h]]) arm.add(shadow(new THREE.Mesh(extrude(shapeOf(strokeOutline(seg, o.width ?? 0.06, { cap: 8 })), th, { bevel: 0.005 }), M.blued)));
    const noseM = new THREE.Mesh(cylZ(0.045, th * 1.3, 20), M.steel);
    noseM.position.set(n[0], n[1], 0);
    const head = new THREE.Mesh(cylZ(o.headR ?? 0.1, o.headH ?? 0.16, 28), M.brassPolished);
    head.position.set(h[0], h[1], o.headZ ?? -0.05);
    const pv = screw({ r: 0.07, seed: 9 });
    pv.position.z = th;
    arm.add(shadow(noseM), shadow(head), pv);
    g.userData.setAngle = (a) => { arm.rotation.z = a; };
    return g;
  }

  /**
   * bell({ r = .34, h = .44, thick = .022, z = .9 }) -> Group: polished brass bell lying in the plate plane — crown up
   *   (+Y), mouth down — so a frontal camera sees its silhouette. The group origin is the centre of the MOUTH (lip
   *   level); `z` is the bell's axis height above the plate. A steel bracket post runs from the plate into the crown.
   */
  function bell(o = {}) {
    const r = o.r ?? 0.34, h = o.h ?? 0.44, t = o.thick ?? 0.022, zc = o.z ?? 0.9, g = new THREE.Group();
    // classic bell curve (radius, height) from the lip to the crown
    const outer = [[1.0, 0], [0.97, 0.06], [0.84, 0.2], [0.68, 0.42], [0.6, 0.62], [0.56, 0.8], [0.48, 0.93], [0.3, 1.0], [0.001, 1.01]];
    const prof = outer.map(([u, v]) => new THREE.Vector2(u * r, v * h));
    for (let i = outer.length - 1; i >= 0; i--) { const [u, v] = outer[i]; prof.push(new THREE.Vector2(Math.max(0.001, u * r - t), Math.max(0.004, v * h - t))); }
    const geo = new THREE.LatheGeometry(prof, 72);
    const bellMat = M.brassPolished.clone();
    bellMat.envMapIntensity = 1.7;
    const body = new THREE.Mesh(geo, bellMat);
    body.position.z = zc;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 20, 12), M.brassPolished);
    knob.position.set(0, h * 1.03, zc);
    const post = new THREE.Mesh(cylZ(0.05, zc, 16), M.steel);
    post.position.set(0, h * 0.8, 0);
    g.add(shadow(body), shadow(knob), shadow(post));
    g.userData.body = body;
    return g;
  }

  // ---------------------------------------------------------------- plate (perlage) + bridges (Geneva stripes)
  /**
   * plate({ w, h, radius = .35, thickness = .3, jewels:[[x,y]], engrave:[{ text, x, y, size, angle }] }) -> Group:
   *   anthracite main plate (top at z = 0) with perlage, an engraved border line, plate jewels and engravings.
   */
  function plate(o = {}) {
    const W = o.w ?? 10, H = o.h ?? 5.6, rad = o.radius ?? 0.35, T = o.thickness ?? 0.3, pl = F.perlage;
    const box = { minX: -W / 2, minY: -H / 2, w: W, h: H };
    const cw = Math.round(W * pl.ppm), ch = Math.round(H * pl.ppm);
    const c = makeCanvas(cw, ch), x = c.getContext("2d");
    x.fillStyle = P.plate; x.fillRect(0, 0, cw, ch);
    const R = rng(pl.seed);
    const pr = pl.radius * pl.ppm, step = pl.pitch * pl.ppm;
    for (let row = 0, y = -pr; y < ch + pr; y += step * 0.87, row++) {
      for (let xx = -pr + (row % 2) * step * 0.5; xx < cw + pr; xx += step) {
        const cx = xx + R.range(-0.04, 0.04) * pr, cy = y + R.range(-0.04, 0.04) * pr;
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, pr);
        const k = pl.contrast;
        for (let i = 0; i <= 8; i++) {
          const s = i / 8, l = (i % 2 ? 1 : -1) * k * (1 - s * 0.6);
          gr.addColorStop(s, l > 0 ? `rgba(255,240,215,${l.toFixed(3)})` : `rgba(0,0,0,${(-l).toFixed(3)})`);
        }
        x.fillStyle = P.plate; x.beginPath(); x.arc(cx, cy, pr, 0, TAU); x.fill();
        x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, pr, 0, TAU); x.fill();
        x.strokeStyle = "rgba(0,0,0,0.18)"; x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, pr, 0, TAU); x.stroke();
      }
    }
    // engraved border + engravings (gilt-filled)
    const X = (v) => (v - box.minX) * pl.ppm, Y = (v) => (box.minY + H - v) * pl.ppm;
    x.strokeStyle = "rgba(212,170,90,0.85)"; x.lineWidth = 0.02 * pl.ppm;
    x.beginPath(); x.roundRect(X(-W / 2 + 0.16), Y(H / 2 - 0.16), (W - 0.32) * pl.ppm, (H - 0.32) * pl.ppm, 0.22 * pl.ppm); x.stroke();
    for (const e of o.engrave ?? []) engraveText(x, e.text, X(e.x), Y(e.y), e.size * pl.ppm, e.angle ?? 0, "rgba(220,178,96,0.95)");
    const tex = canvasTexture(c, { anisotropy: 8 });
    const mat = M.plate.clone();
    mat.color.set("#ffffff");
    mat.map = tex;
    const outline = roundRectPoly(W, H, rad);
    const holes = (o.holes ?? []).map(([hx, hy, hr]) => circlePoly(hr, 32, false).map(([a, b]) => [a + hx, b + hy]));
    const geo = extrude(shapeOf(outline, holes), T, { bevel: 0.02, uvBox: box });
    geo.translate(0, 0, -T);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    const g = new THREE.Group();
    g.add(mesh);
    for (const [jx, jy] of o.jewels ?? []) { const j = jewel(); j.position.set(jx, jy, 0); g.add(j); }
    return g;
  }
  const roundRectPoly = (W, H, r, n = 8) => {
    const pts = [], cs = [[W / 2 - r, H / 2 - r, 0], [-W / 2 + r, H / 2 - r, 1], [-W / 2 + r, -H / 2 + r, 2], [W / 2 - r, -H / 2 + r, 3]];
    for (const [cx, cy, q] of cs) for (let i = 0; i <= n; i++) { const a = (q + i / n) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  };
  function engraveText(x, text, px, py, sizePx, angle, fill) {
    x.save();
    x.translate(px, py);
    x.rotate(-angle);
    x.font = `700 ${sizePx}px ${F.engraving.font}`;
    x.textAlign = "center"; x.textBaseline = "middle";
    if ("letterSpacing" in x) x.letterSpacing = `${(sizePx * 0.12).toFixed(1)}px`;
    x.fillStyle = "rgba(0,0,0,0.55)"; x.fillText(text, -sizePx * 0.04, -sizePx * 0.04);   // cut shadow
    x.fillStyle = F.engraving.glint; x.fillText(text, sizePx * 0.035, sizePx * 0.035);    // bevel glint
    x.fillStyle = fill; x.fillText(text, 0, 0);
    x.restore();
  }

  /**
   * bridge({ path:[[x,y]...], width = .34, z = .7, thickness = .1, jewels:[[x,y]], screws:[[x,y]], feet:[[x,y]],
   *          text, textAt:[x,y], textSize, textAngle, seed }) -> Group: gilt brass bar following `path` (round ends)
   *   at height z above the plate, Côtes de Genève stripes, engraved ink-filled lettering, ruby jewels in chatons at
   *   arbor points, blued screws over steel feet (pillars down to the plate).
   */
  function bridge(o) {
    const hw = (o.width ?? 0.34) / 2, z = o.z ?? 0.7, T = o.thickness ?? 0.1;
    const outline = strokeOutline(o.path, hw, { cap: 14 });
    const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
    const box = { minX: Math.min(...xs) - 0.02, minY: Math.min(...ys) - 0.02 };
    box.w = Math.max(...xs) + 0.02 - box.minX; box.h = Math.max(...ys) + 0.02 - box.minY;
    const S = F.stripes, ppm = S.ppm;
    const cw = Math.ceil(box.w * ppm), ch = Math.ceil(box.h * ppm);
    const c = makeCanvas(cw, ch), x = c.getContext("2d");
    x.fillStyle = P.gilt; x.fillRect(0, 0, cw, ch);
    // Côtes de Genève: parallel bands, each a light-to-dark sweep with a crisp edge
    x.save();
    x.translate(cw / 2, ch / 2);
    x.rotate((S.angleDeg * Math.PI) / 180);
    const span = Math.hypot(cw, ch), bw = S.pitch * ppm;
    for (let k = -Math.ceil(span / bw); k <= Math.ceil(span / bw); k++) {
      const x0 = k * bw;
      const gr = x.createLinearGradient(x0, 0, x0 + bw, 0);
      gr.addColorStop(0, `rgba(255,244,214,${S.contrast})`);
      gr.addColorStop(0.45, "rgba(255,244,214,0)");
      gr.addColorStop(0.75, `rgba(60,38,10,${(S.contrast * 0.6).toFixed(3)})`);
      gr.addColorStop(1, `rgba(60,38,10,${S.contrast})`);
      x.fillStyle = gr;
      x.fillRect(x0, -span, bw, 2 * span);
    }
    x.restore();
    // polished bevel line along the outline (anglage)
    x.strokeStyle = "rgba(255,246,220,0.85)"; x.lineWidth = 0.014 * ppm;
    x.beginPath();
    outline.forEach(([px, py], i) => { const X = (px - box.minX) * ppm, Y = (box.minY + box.h - py) * ppm; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
    x.closePath(); x.stroke();
    if (o.text) {
      const at = o.textAt ?? o.path[0];
      engraveText(x, o.text, (at[0] - box.minX) * ppm, (box.minY + box.h - at[1]) * ppm, (o.textSize ?? 0.1) * ppm, o.textAngle ?? 0, F.engraving.fill);
    }
    const mat = M.gilt.clone();
    mat.color.set("#ffffff");
    mat.map = canvasTexture(c, { anisotropy: 8 });
    const holes = [...(o.jewels ?? []), ...(o.screws ?? [])].length ? [] : [];
    const geo = extrude(shapeOf(outline, holes), T, { bevel: 0.012, uvBox: box });
    const mesh = shadow(new THREE.Mesh(geo, withSides(mat)));
    mesh.position.z = z;
    const g = new THREE.Group();
    g.add(mesh);
    for (const [jx, jy] of o.jewels ?? []) { const j = jewel(); j.position.set(jx, jy, z + T); g.add(j); }
    for (const [i, [sx, sy]] of (o.screws ?? []).entries()) { const s = screw({ seed: (o.seed ?? 1) * 13 + i }); s.position.set(sx, sy, z + T); g.add(s); }
    for (const [fx, fy] of o.feet ?? o.screws ?? []) { const f = new THREE.Mesh(cylZ(0.08, z, 20), M.steel); f.position.set(fx, fy, 0); g.add(shadow(f)); }
    return g;
  }

  // ---------------------------------------------------------------- caption plaque (overlay, exact colours)
  /**
   * plaque(text, { heightFrac, x, y }) -> Mesh on the overlay: white enamel field, brass bezel, black roman capitals.
   *   userData.show(t, tIn, tOut) sets rise + opacity from t (in over spec.plaque.inDur, out over outDur).
   */
  function plaque(text, o = {}) {
    const S = { ...spec.plaque, ...o };
    const Hpx = 200, pad = 64, fontPx = 82;
    const probe = makeCanvas(8, 8).getContext("2d");
    probe.font = `${S.weight} ${fontPx}px ${S.font}`;
    if ("letterSpacing" in probe) probe.letterSpacing = `${fontPx * S.tracking}px`;
    const tw = probe.measureText(text).width;
    const Wpx = Math.ceil(tw + 2 * pad + 40);
    const c = makeCanvas(Wpx, Hpx), x = c.getContext("2d");
    const rr = 34;
    // bezel: brass with a top-lit gradient
    const bg = x.createLinearGradient(0, 0, 0, Hpx);
    bg.addColorStop(0, "#f2d79a"); bg.addColorStop(0.35, P.bezel); bg.addColorStop(0.7, "#8a6326"); bg.addColorStop(1, "#d4a95a");
    x.fillStyle = bg; x.beginPath(); x.roundRect(2, 2, Wpx - 4, Hpx - 4, rr); x.fill();
    x.strokeStyle = "rgba(60,40,10,0.9)"; x.lineWidth = 3; x.stroke();
    // enamel field with a soft sheen
    const ins = 16;
    const eg = x.createLinearGradient(0, ins, 0, Hpx - ins);
    eg.addColorStop(0, "#fbf8f0"); eg.addColorStop(0.5, P.enamel); eg.addColorStop(1, "#e3dccb");
    x.fillStyle = eg; x.beginPath(); x.roundRect(ins, ins, Wpx - 2 * ins, Hpx - 2 * ins, rr - 12); x.fill();
    x.strokeStyle = "rgba(90,70,40,0.55)"; x.lineWidth = 2; x.stroke();
    // thin inner rule
    x.strokeStyle = "rgba(27,26,23,0.5)"; x.lineWidth = 2;
    x.beginPath(); x.roundRect(ins + 12, ins + 12, Wpx - 2 * ins - 24, Hpx - 2 * ins - 24, rr - 20); x.stroke();
    // lettering
    x.font = `${S.weight} ${fontPx}px ${S.font}`;
    if ("letterSpacing" in x) x.letterSpacing = `${fontPx * S.tracking}px`;
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = P.ink;
    x.fillText(text, Wpx / 2 + (fontPx * S.tracking) / 2, Hpx / 2 + 4);
    const tex = canvasTexture(c, { anisotropy: 4 });
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Wpx / Hpx, 1), mat);
    mesh.renderOrder = 10;
    mesh.userData.show = (t, tIn, tOut) => {
      const a = clamp((t - tIn) / S.inDur) * (1 - clamp((t - tOut) / S.outDur));
      mesh.visible = a > 0.001;
      mat.opacity = ease.outCubic(a);
      const rise = (1 - ease.outCubic(clamp((t - tIn) / S.inDur))) * S.rise - clamp((t - tOut) / S.outDur) * S.rise * 0.5;
      pinToScreen(stage, mesh, { x: S.x, y: S.y - rise, height: S.heightFrac });
      if (!mesh.visible) mesh.visible = false;
    };
    mesh.visible = false;
    return mesh;
  }

  const props = { gear, pinion, wheelSet, escapeWheel, anchor, balance, pendulum, barrel, cam, strikeLever, bell, plate, bridge, jewel, screw, arbor, plaque };
  const factories = {
    plate: (os) => plate(os.dims ?? {}),
  };
  return {
    spec,
    palette: P,
    materials: { ...materials, ...M },
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories,
    sfx: spec.sfx,
    plan: TRAIN,
    helpers: { studio, dof, extrude, shapeOf, circlePoly },
  };
}
