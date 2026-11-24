// styles/tiny-diorama/style.js — Tiny Diorama (see STYLE.md and references/kit-api.md).
// A whole little world on one floating bevelled tile. Every prop is synchronous and seeded (rng /
// hash01 only). Props never animate themselves: time enters only through userData hooks
// (update(t), setGlow(u), setFan(angle), set(reveal, hide) ...) that the scene calls from renderAt.
// Smooth forms = RoundedBoxGeometry / spheres / capsules / bevelled extrusions, never flat shading.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { makeCanvas, canvasTexture, blobTexture, softRectTexture } from "../../kit/textures.js";
import { tubeAlong, filletPath, pathLength, pointAt } from "../../kit/paths.js";
import { getOverlay, pinToScreen, projectToScreen } from "../../kit/overlay.js";
import { pop, dropIn, spinAngle } from "../../kit/motion.js";
import { rng, hashString, clamp, lerp, ease, TAU } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const seedOf = (s) => (typeof s === "string" ? hashString(s) : (s ?? 1) >>> 0);

// dropIn, spinAngle: kit/motion.js; blob + soft-square shadow textures: kit/textures.js (promoted, identical)
export { dropIn, spinAngle };
const softSquareTexture = (soft = 0.32) => softRectTexture({ soft });

// ---------------------------------------------------------------- createStyle
/** createStyle(stage, opts?) -> style      opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const sun = lights.sun;
  if (sun) sun.shadow.radius = spec.lights.find((l) => l.id === "sun")?.shadow?.softness ?? 4;

  // ------------------------------------------------------------ material helpers
  const tintCache = new Map();
  /** tint(color, base = "plastic") -> shared clone of a spec material in another colour (cached). */
  function tint(color, base = "plastic") {
    const key = `${base}|${color}`;
    let m = tintCache.get(key);
    if (!m) {
      m = materials[base].clone();
      m.color.set(color);
      m.name = `${base}:${color}`;
      tintCache.set(key, m);
    }
    return m;
  }
  const mesh = (geo, mat, cast = true, receive = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  };
  /** rounded box with its BASE at y = 0 (centre in x/z). */
  const rbox = (w, h, d, r = 0.08, seg = 4) => {
    const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    g.translate(0, h / 2, 0);
    return g;
  };
  const capsule = (r, len, seg = 16) => {
    const g = new THREE.CapsuleGeometry(r, len, 6, seg);
    g.translate(0, len / 2 + r, 0);
    return g;
  };

  const BLOB = blobTexture();
  const blobMats = new Map();
  /**
   * contactShadow({ w = 1, d = w, opacity = spec.contact.opacity }) -> Mesh: soft radial dark blob lying on
   * y = 0.006 (fake ambient occlusion / contact darkening). Size already includes spec.contact.spread.
   */
  function contactShadow(o = {}) {
    const op = o.opacity ?? spec.contact.opacity;
    const key = op.toFixed(3);
    let mat = blobMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map: BLOB, color: P.shadow, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      mat.name = "contactShadow";
      blobMats.set(key, mat);
    }
    const sp = spec.contact.spread;
    const w = (o.w ?? 1) * sp, d = (o.d ?? o.w ?? 1) * sp;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    m.renderOrder = 1;
    m.name = "contact";
    return m;
  }

  // ------------------------------------------------------------ the tile
  /**
   * tile({ size = 14, depth = size * .625 (16:10), layers = spec.tile.layers | "urban", radius, inset, pebbles, seed })
   *   -> Group. Top surface at local y = 0; the layered slab hangs below. Add the world's pieces as
   *   children so they ride the bob. userData:
   *     thickness, half: [size/2, depth/2], dropShadow (Mesh — add it to the SCENE, not the tile)
   *     update(t, { dropAt = 0, dropDur = 1, dropFrom = 7, baseY = 0 }) -> y   drop-in + gentle bob
   */
  function tile(o = {}) {
    const T = spec.tile;
    const S = o.size ?? 14, D = o.depth ?? S * 0.625, R = o.radius ?? T.radius, ins = o.inset ?? T.inset;
    const layers = o.layers === "urban" ? T.urbanLayers : (o.layers ?? T.layers);
    const r = rng(seedOf(o.seed ?? 7));
    const g = new THREE.Group();
    g.name = "tile";
    const slab = new THREE.Group();
    slab.name = "slab";
    g.add(slab);
    let y = 0;
    const bands = [];
    layers.forEach(([name, th], i) => {
      const mat = materials[name] ?? tint(P[name] ?? "#cccccc", "soil");
      const w = S - ins * 2 * i, d = D - ins * 2 * i;
      const extra = i ? R * 1.5 : 0; // lower layers tuck up inside the wider layer above
      const m = mesh(rbox(w, th + extra, d, R), mat, true, true);
      m.position.y = y - th;
      m.name = `layer:${name}`;
      slab.add(m);
      bands.push({ name, top: y, bottom: y - th, w, d });
      y -= th;
    });
    const thickness = -y;
    // half-buried pebbles on the side faces of the lower layers (seeded)
    const pebbleBands = bands.slice(1);
    for (let k = 0; k < (o.pebbles ?? T.pebbles) && pebbleBands.length; k++) {
      const b = pebbleBands[r.int(0, pebbleBands.length - 1)];
      const side = r.int(0, 3);
      const rad = r.range(0.1, 0.2);
      const along = r.range(-0.44, 0.44);
      const py = r.range(b.bottom + rad + 0.06, b.top - rad - 0.04);
      const dark = b.name === "rock" ? P.rockDark : b.name === "soil" ? P.soilDark : P.concrete;
      const pm = mesh(new THREE.SphereGeometry(rad, 16, 12), tint(r.chance(0.6) ? dark : P.rock, "rock"), false, true);
      const hw = b.w / 2 - rad * 0.45, hd = b.d / 2 - rad * 0.45;
      if (side === 0) pm.position.set(along * b.w, py, hd);
      else if (side === 1) pm.position.set(hw, py, along * b.d);
      else if (side === 2) pm.position.set(along * b.w, py, -hd);
      else pm.position.set(-hw, py, along * b.d);
      pm.scale.set(1, r.range(0.6, 0.85), 1);
      slab.add(pm);
    }
    // drop shadow far below (separate object: it must not bob with the tile)
    const DS = T.dropShadow;
    const dsMat = new THREE.MeshBasicMaterial({ map: softSquareTexture(), color: P.shadow, transparent: true, opacity: DS.opacity, depthWrite: false });
    dsMat.name = "dropShadow";
    const ds = new THREE.Mesh(new THREE.PlaneGeometry(S * DS.scale, D * DS.scale), dsMat);
    ds.rotation.x = -Math.PI / 2;
    ds.position.y = -thickness - DS.below;
    ds.name = "tileDropShadow";
    ds.renderOrder = -1;
    g.userData = { thickness, half: [S / 2, D / 2], bands, dropShadow: ds, slab };
    const ph = r.range(0, TAU);
    g.userData.update = (t, u = {}) => {
      const { dropAt = 0, dropDur = 1, dropFrom = 7, baseY = 0 } = u;
      const dr = dropIn(t, dropAt, dropDur, dropFrom);
      const bobOn = clamp((t - dropAt - dropDur) / 1.2);
      const bob = Math.sin(t * T.bob.speed * TAU * 0.5 + ph) * T.bob.amp * bobOn;
      const yy = baseY + dr.y + bob;
      g.position.y = yy;
      g.rotation.z = Math.sin(t * T.bob.speed * 1.7 + ph) * 0.004 * bobOn;
      g.rotation.x = Math.cos(t * T.bob.speed * 1.3 + ph) * 0.003 * bobOn;
      g.scale.set(1 + dr.squash * 0.25, 1 - dr.squash, 1 + dr.squash * 0.25);
      g.visible = dr.started;
      // drop shadow: big and faint while high, tightens and darkens on landing
      const h = clamp((yy - baseY) / dropFrom);
      ds.scale.setScalar(1 + h * 0.6);
      ds.material.opacity = DS.opacity * (dr.started ? 1 - h * 0.85 : 0);
      ds.position.y = baseY - thickness - DS.below;
      return yy;
    };
    return g;
  }

  // ------------------------------------------------------------ buildings
  /**
   * building({ w = 2, d = 1.6, h = 1.3, color = P.wall, roof = "gable"|"flat"|"none", roofColor = P.roof,
   *            roofH = .7, windows = [[x, y], ...] (front face, metres from base centre) | n, door = true,
   *            doorColor, chimney = false, seed }) -> Group (origin at ground, front = +Z)
   *   userData.setGlow(u)  windows go from pale glass to warm emissive (u 0..1)
   *   userData.height      top of the roof
   */
  function building(o = {}) {
    const { w = 2, d = 1.6, h = 1.3, roof = "gable", roofH = 0.7, door = true, chimney = false } = o;
    const color = o.color ?? P.wall, roofColor = o.roofColor ?? P.roof;
    const g = new THREE.Group();
    g.name = "building";
    g.add(mesh(rbox(w, h, d, 0.12), tint(color)));
    let top = h;
    if (roof === "gable") {
      const ow = w + 0.28, sh = new THREE.Shape();
      sh.moveTo(-ow / 2, 0);
      sh.lineTo(ow / 2, 0);
      sh.lineTo(0.12, roofH);
      sh.quadraticCurveTo(0, roofH + 0.06, -0.12, roofH);
      sh.lineTo(-ow / 2, 0);
      const depth = d + 0.12;
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 4, curveSegments: 8 });
      geo.translate(0, 0, -depth / 2);
      geo.computeVertexNormals();
      const rm = mesh(geo, tint(roofColor));
      rm.position.y = h - 0.02;
      g.add(rm);
      top = h + roofH + 0.1;
      if (chimney) {
        const c = mesh(rbox(0.26, 0.55, 0.26, 0.06), tint(o.chimneyColor ?? P.wall));
        c.position.set(w * 0.24, h + roofH * 0.35, -d * 0.15);
        g.add(c);
      }
    } else if (roof === "flat") {
      const cap = mesh(rbox(w + 0.14, 0.16, d + 0.14, 0.07), tint(roofColor));
      cap.position.y = h - 0.04;
      g.add(cap);
      top = h + 0.12;
    }
    // windows: one material per building so each can glow on its own
    const winMat = new THREE.MeshStandardMaterial({ color: "#cfe0fb", roughness: 0.25, emissive: P.glow, emissiveIntensity: 0 });
    winMat.name = "window";
    const wins = Array.isArray(o.windows) ? o.windows
      : Array.from({ length: o.windows ?? 2 }, (_, i, a) => [((i + 0.5) / a.length - 0.5) * w * 0.8 + (door ? (i < a.length / 2 ? -0.12 : 0.12) : 0), h * 0.55]);
    for (const [x, y] of wins) {
      const wm = mesh(rbox(0.36, 0.36, 0.08, 0.04), winMat, false, false);
      wm.position.set(x, y - 0.18, d / 2 - 0.01);
      g.add(wm);
      const sill = mesh(rbox(0.46, 0.06, 0.12, 0.025), tint(P.trim), false, false);
      sill.position.set(x, y - 0.24, d / 2 + 0.01);
      g.add(sill);
    }
    if (door) {
      const dm = mesh(rbox(0.38, 0.62, 0.08, 0.06), tint(o.doorColor ?? roofColor), false, false);
      dm.position.set(o.doorX ?? 0, 0, d / 2 - 0.01);
      g.add(dm);
    }
    g.add(contactShadow({ w: w * 1.05, d: d * 1.05 }));
    g.userData.height = top;
    g.userData.winMat = winMat;
    const cold = new THREE.Color("#cfe0fb"), warm = new THREE.Color("#fff1b8");
    g.userData.setGlow = (u) => {
      const k = clamp(u);
      winMat.color.copy(cold).lerp(warm, k);
      winMat.emissiveIntensity = k * 6;
    };
    return g;
  }

  /** house(o) = building with a gable roof, chimney and door (same options/hooks as building). */
  const house = (o = {}) => building({ w: 1.9, d: 1.6, h: 1.25, roof: "gable", chimney: true, windows: [[-0.5, 0.78], [0.5, 0.78]], ...o });

  /**
   * dataCentre({ w = 3.2, d = 2.2, h = 1.6, racks = 4, fans = 2, color = P.tech, seed })
   *   -> Group (origin at ground, front = +Z). userData:
   *     setRack(i, level 0..1)  LED rows of rack i glow;  racks (count)
   *     setFan(angle)           roof fan rotors (radians)
   *     setPower(u)             front status strip + roof lights glow
   */
  function dataCentre(o = {}) {
    const { w = 3.2, d = 2.2, h = 1.6, racks = 4, fans = 2 } = o;
    const g = new THREE.Group();
    g.name = "dataCentre";
    g.add(mesh(rbox(w, h, d, 0.14), tint(o.color ?? P.tech)));
    const cap = mesh(rbox(w + 0.12, 0.14, d + 0.12, 0.06), tint(P.metal, "metal"));
    cap.position.y = h - 0.04;
    g.add(cap);
    // front racks: dark panels with LED rows (one emissive material per rack)
    const rackMats = [];
    const pw = Math.min(0.52, (w * 0.86) / racks - 0.12);
    for (let i = 0; i < racks; i++) {
      const x = ((i + 0.5) / racks - 0.5) * w * 0.86;
      const panel = mesh(rbox(pw, h * 0.66, 0.1, 0.05), tint(P.techDark), false, true);
      panel.position.set(x, h * 0.12, d / 2 - 0.02);
      g.add(panel);
      const lm = new THREE.MeshStandardMaterial({ color: "#3d4a8a", roughness: 0.4, emissive: P.screen, emissiveIntensity: 0 });
      lm.name = `rack${i}`;
      rackMats.push(lm);
      for (let k = 0; k < 4; k++) {
        const led = mesh(rbox(pw * 0.72, 0.07, 0.06, 0.03), lm, false, false);
        led.position.set(x, h * 0.18 + k * h * 0.15, d / 2 + 0.03);
        g.add(led);
      }
    }
    // status strip under the cap
    const stripMat = new THREE.MeshStandardMaterial({ color: "#9fb3ff", roughness: 0.4, emissive: P.screen, emissiveIntensity: 0 });
    stripMat.name = "statusStrip";
    const strip = mesh(rbox(w * 0.86, 0.08, 0.06, 0.03), stripMat, false, false);
    strip.position.set(0, h * 0.86, d / 2 + 0.02);
    g.add(strip);
    // roof fans
    const rotors = [];
    for (let i = 0; i < fans; i++) {
      const x = ((i + 0.5) / fans - 0.5) * w * 0.6;
      const housing = mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.24, 32), tint(P.metal, "metal"));
      housing.position.set(x, h + 0.2, -d * 0.12);
      g.add(housing);
      const well = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 32), tint(P.techDark), false, true);
      well.position.set(x, h + 0.31, -d * 0.12);
      g.add(well);
      const rotor = new THREE.Group();
      rotor.position.set(x, h + 0.34, -d * 0.12);
      for (let b = 0; b < 3; b++) {
        const blade = mesh(rbox(0.32, 0.03, 0.13, 0.015), tint(P.paper), true, false);
        blade.geometry.translate(0.17, 0, 0); // stays inside the 0.35 m well
        blade.rotation.y = (b / 3) * TAU;
        blade.rotation.x = 0.25;
        rotor.add(blade);
      }
      rotor.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), tint(P.trim)));
      g.add(rotor);
      rotors.push(rotor);
    }
    g.add(contactShadow({ w: w * 1.05, d: d * 1.05 }));
    g.userData.height = h + 0.5;
    g.userData.racks = racks;
    g.userData.setRack = (i, level) => { if (rackMats[i]) rackMats[i].emissiveIntensity = clamp(level, 0, 2) * 5.5; };
    g.userData.setFan = (a) => rotors.forEach((r, i) => (r.rotation.y = a * (i % 2 ? -1 : 1) + i));
    g.userData.setPower = (u) => (stripMat.emissiveIntensity = clamp(u) * 2.4);
    return g;
  }

  // ------------------------------------------------------------ nature, vehicles, people
  /** tree({ seed, height = 1.3, kind: "round"|"tall"|"duo"|"auto", color }) -> Group (origin at ground) */
  function tree(o = {}) {
    const r = rng(seedOf(o.seed ?? 1));
    const H = o.height ?? r.range(1.05, 1.5);
    const kind = o.kind && o.kind !== "auto" ? o.kind : r.pick(["round", "round", "tall", "duo"]);
    const col = o.color ?? (r.chance(0.65) ? P.foliage : P.foliageAlt);
    const g = new THREE.Group();
    g.name = `tree:${kind}`;
    const trunkH = H * 0.38;
    g.add(mesh(capsule(H * 0.06, trunkH), tint(P.trunk)));
    const leaf = tint(col);
    if (kind === "tall") {
      const c = mesh(capsule(H * 0.26, H * 0.42, 20), leaf);
      c.position.y = trunkH * 0.75;
      g.add(c);
    } else if (kind === "duo") {
      const a = mesh(new THREE.SphereGeometry(H * 0.3, 24, 16), leaf);
      a.position.y = trunkH + H * 0.22;
      const b = mesh(new THREE.SphereGeometry(H * 0.21, 24, 16), leaf);
      b.position.y = trunkH + H * 0.56;
      g.add(a, b);
    } else {
      const a = mesh(new THREE.SphereGeometry(H * 0.34, 28, 20), leaf);
      a.position.y = trunkH + H * 0.28;
      g.add(a);
    }
    g.add(contactShadow({ w: H * 0.62 }));
    g.rotation.y = r.range(0, TAU);
    return g;
  }

  /** bush({ seed, size = .35, color }) -> Group: 2-3 merged spheres hugging the ground. */
  function bush(o = {}) {
    const r = rng(seedOf(o.seed ?? 2));
    const s = o.size ?? 0.35;
    const g = new THREE.Group();
    g.name = "bush";
    const mat = tint(o.color ?? (r.chance(0.5) ? P.foliage : P.foliageAlt));
    const n = r.int(2, 3);
    for (let i = 0; i < n; i++) {
      const rr = s * r.range(0.65, 1);
      const m = mesh(new THREE.SphereGeometry(rr, 20, 14), mat);
      m.position.set((i - (n - 1) / 2) * s * 0.8, rr * 0.7, r.range(-0.1, 0.1) * s);
      g.add(m);
    }
    g.add(contactShadow({ w: s * 2.4, d: s * 1.6 }));
    return g;
  }

  /**
   * car({ color, seed, length = .9 }) -> Group facing +X (origin at ground centre)
   *   userData.setRoll(distance)  spins the wheels for a distance travelled (m)
   */
  function car(o = {}) {
    const r = rng(seedOf(o.seed ?? 3));
    const L = o.length ?? 0.9, W = L * 0.52;
    const col = o.color ?? r.pick(P.car);
    const g = new THREE.Group();
    g.name = "car";
    const body = mesh(rbox(L, L * 0.26, W, L * 0.09), tint(col));
    body.position.y = L * 0.1;
    g.add(body);
    const cabin = mesh(rbox(L * 0.5, L * 0.24, W * 0.84, L * 0.08), tint("#e6efff", "metal"));
    cabin.position.set(-L * 0.06, L * 0.33, 0);
    g.add(cabin);
    const roof = mesh(rbox(L * 0.54, L * 0.06, W * 0.9, L * 0.03), tint(col));
    roof.position.set(-L * 0.06, L * 0.55, 0);
    g.add(roof);
    const wheels = [];
    const wr = L * 0.13;
    for (const [x, z] of [[L * 0.3, W / 2], [-L * 0.3, W / 2], [L * 0.3, -W / 2], [-L * 0.3, -W / 2]]) {
      const wgeo = new THREE.CylinderGeometry(wr, wr, L * 0.1, 20);
      wgeo.rotateX(Math.PI / 2);
      const wm = mesh(wgeo, tint(P.ink), true, false);
      wm.position.set(x, wr, z);
      g.add(wm);
      wheels.push(wm);
    }
    for (const z of [-W * 0.3, W * 0.3]) {
      const lamp = mesh(new THREE.SphereGeometry(L * 0.05, 12, 8), tint(P.trim), false, false);
      lamp.position.set(L * 0.5, L * 0.22, z);
      g.add(lamp);
    }
    g.add(contactShadow({ w: L * 1.1, d: W * 1.3 }));
    g.userData.setRoll = (dist) => wheels.forEach((w) => (w.rotation.z = -dist / wr));
    return g;
  }

  /** peg({ color, height = .6, seed }) -> Group: wooden-peg person (capsule body + ball head), origin at ground. */
  function peg(o = {}) {
    const r = rng(seedOf(o.seed ?? 4));
    const H = o.height ?? 0.6;
    const g = new THREE.Group();
    g.name = "peg";
    g.add(mesh(capsule(H * 0.2, H * 0.34), tint(o.color ?? r.pick(P.peg))));
    const head = mesh(new THREE.SphereGeometry(H * 0.17, 24, 16), tint(P.skin));
    head.position.y = H * 0.9;
    g.add(head);
    g.add(contactShadow({ w: H * 0.6 }));
    g.userData.head = head;
    return g;
  }

  /**
   * desk({ laptop = true, w = .7 }) -> Group: little table with an open laptop (screen faces +Z... toward the user at -Z).
   *   userData.setScreen(u)  laptop screen glow 0..1
   */
  function desk(o = {}) {
    const W = o.w ?? 0.7;
    const g = new THREE.Group();
    g.name = "desk";
    const top = mesh(rbox(W, 0.06, W * 0.6, 0.025), tint(P.trunk));
    top.position.y = 0.4;
    g.add(top);
    for (const x of [-W * 0.4, W * 0.4]) {
      const leg = mesh(rbox(0.06, 0.4, W * 0.5, 0.02), tint(P.trunk));
      leg.position.x = x;
      g.add(leg);
    }
    const scrMat = materials.screen.clone();
    scrMat.name = "laptopScreen";
    if (o.laptop !== false) {
      const base = mesh(rbox(0.36, 0.025, 0.24, 0.01), tint(P.metal, "metal"));
      base.position.y = 0.46;
      g.add(base);
      const lid = new THREE.Group();
      lid.position.set(0, 0.48, -0.12);
      lid.rotation.x = -0.32;
      const back = mesh(rbox(0.36, 0.24, 0.02, 0.01), tint(P.metal, "metal"));
      lid.add(back);
      const scr = mesh(new THREE.PlaneGeometry(0.31, 0.19), scrMat, false, false);
      scr.position.set(0, 0.12, 0.012);
      lid.add(scr);
      g.add(lid);
    }
    g.add(contactShadow({ w: W * 1.1, d: W * 0.8 }));
    g.userData.setScreen = (u) => (scrMat.emissiveIntensity = clamp(u, 0, 2) * 2.2);
    g.userData.setScreen(0);
    return g;
  }

  // ------------------------------------------------------------ roads, poles, cables
  /**
   * road(points [[x, z], ...], { width = .8, bend = 1.2, y = 0, color = P.road, dashes = true, curb = .035 })
   *   -> Group: a slightly raised rounded ribbon with round end caps and dashed centre line.
   *   userData.path (3D polyline at the road surface), userData.length, userData.at(s) -> { p:[x,y,z], dir:[x,y,z], yaw }
   */
  function road(points, o = {}) {
    const { width = 0.8, bend = 1.2, y = 0, dashes = true, curb = 0.035 } = o;
    const g = new THREE.Group();
    g.name = "road";
    let pts = filletPath(points.map(([x, z]) => [x, y + curb, z]), bend);
    // resample evenly (0.12 m)
    const L0 = pathLength(pts), n = Math.max(2, Math.ceil(L0 / 0.12));
    pts = Array.from({ length: n + 1 }, (_, i) => pointAt(pts, (L0 * i) / n).p);
    const pos = [], nor = [], idx = [];
    const hw = width / 2;
    const left = [], right = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      left.push([p[0] - tz * hw, p[2] + tx * hw]);
      right.push([p[0] + tz * hw, p[2] - tx * hw]);
    });
    const N = pts.length;
    // top
    for (let i = 0; i < N; i++) {
      pos.push(left[i][0], y + curb, left[i][1], right[i][0], y + curb, right[i][1]);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    // side walls
    for (const [side, sgn] of [[left, 1], [right, -1]]) {
      const base = pos.length / 3;
      for (let i = 0; i < N; i++) {
        const c = pts[i];
        let nx = side[i][0] - c[0], nz = side[i][1] - c[2];
        const l = Math.hypot(nx, nz) || 1;
        pos.push(side[i][0], y + curb, side[i][1], side[i][0], y - 0.01, side[i][1]);
        nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
      }
      for (let i = 0; i < N - 1; i++) {
        const a = base + i * 2;
        if (sgn > 0) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const mat = o.color ? tint(o.color, "road") : materials.road;
    const rm = mesh(geo, mat, false, true);
    rm.material.side = THREE.DoubleSide;
    g.add(rm);
    for (const p of [pts[0], pts[N - 1]]) {
      const cap = mesh(new THREE.CylinderGeometry(hw, hw, curb + 0.01, 32), mat, false, true);
      cap.position.set(p[0], y + (curb - 0.01) / 2, p[2]);
      g.add(cap);
    }
    const L = pathLength(pts);
    if (dashes) {
      const dm = tint(P.roadLine);
      for (let s = 0.5; s < L - 0.4; s += 0.6) {
        const { p, t } = pointAt(pts, s);
        const dsh = mesh(rbox(0.3, 0.012, 0.06, 0.006, 2), dm, false, true);
        dsh.position.set(p[0], y + curb, p[2]);
        dsh.rotation.y = Math.atan2(-t[2], t[0]);
        g.add(dsh);
      }
    }
    g.userData.path = pts;
    g.userData.length = L;
    g.userData.at = (s) => {
      const { p, t } = pointAt(pts, clamp(s, 0, L));
      return { p, dir: t, yaw: Math.atan2(-t[2], t[0]) };
    };
    return g;
  }

  /** pole({ height = 2.1, arm = .5 }) -> Group: wooden utility pole + crossbar + insulators. userData.top = [0, y, 0] cable anchor. */
  function pole(o = {}) {
    const H = o.height ?? 2.1, A = o.arm ?? 0.5;
    const g = new THREE.Group();
    g.name = "pole";
    g.add(mesh(capsule(0.05, H - 0.1, 12), tint(P.pole)));
    const bar = mesh(rbox(A, 0.07, 0.08, 0.03), tint(P.pole));
    bar.position.y = H - 0.25;
    g.add(bar);
    for (const x of [-A * 0.38, A * 0.38]) {
      const ins = mesh(new THREE.SphereGeometry(0.05, 12, 8), tint(P.screen), false, false);
      ins.position.set(x, H - 0.15, 0);
      g.add(ins);
    }
    g.add(contactShadow({ w: 0.35 }));
    g.userData.top = [0, H - 0.12, 0];
    return g;
  }

  /**
   * cable(anchors [[x,y,z], ...], { sag = .22, radius = .028, color = P.cable }) -> Mesh: a tube that sags
   *   (parabola, deeper on longer spans) between consecutive anchors. userData.pts, userData.length,
   *   userData.at(u 0..1) -> [x,y,z] along the whole cable.
   */
  function cable(anchors, o = {}) {
    const { sag = 0.22, radius = 0.028 } = o;
    const pts = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(6, Math.ceil(span / 0.15));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const u = k / n;
        pts.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u) - sag * span * 0.25 * 4 * u * (1 - u), lerp(a[2], b[2], u)]);
      }
    }
    const mat = tint(o.color ?? P.cable);
    const m = mesh(tubeAlong(pts, { radius, radial: 10, caps: false }), mat, true, false);
    m.name = "cable";
    const L = pathLength(pts);
    m.userData.pts = pts;
    m.userData.length = L;
    m.userData.at = (u) => pointAt(pts, clamp(u) * L).p;
    // round caps as separate spheres: start cap shows with the first segment, a moving head cap rounds the
    // growing end during the reveal, the end cap appears exactly when the tube reaches it (no pop at u = 1)
    const capGeo = new THREE.SphereGeometry(radius, 10, 6);
    const [c0, head, c1] = [0, 1, 2].map(() => mesh(capGeo, mat, false, false));
    c0.position.set(...pts[0]);
    c1.position.set(...pts[pts.length - 1]);
    m.add(c0, head, c1);
    // setReveal(u): draw the tube from its first anchor up to fraction u of its length (index order follows the path)
    const idxCount = m.geometry.index.count, perSeg = 10 * 6, segs = idxCount / perSeg;
    m.userData.setReveal = (u) => {
      const k = clamp(u);
      m.visible = k > 0;
      m.geometry.setDrawRange(0, k >= 1 ? Infinity : Math.round(k * segs) * perSeg);
      head.visible = k > 0 && k < 1;
      if (head.visible) head.position.set(...pts[Math.min(pts.length - 1, Math.round(k * segs))]); // ring i sits on pts[i]
      c1.visible = k >= 1;
    };
    return m;
  }

  /** packet({ size = .2, color }) -> Mesh: glowing rounded capsule (blooms). Place with cable.userData.at(u). */
  function packet(o = {}) {
    const s = o.size ?? 0.2;
    const mat = o.color ? (() => { const m = materials.glow.clone(); m.color.set(o.color); m.emissive.set(o.color); return m; })() : materials.glow;
    const m = mesh(new THREE.SphereGeometry(s / 2, 20, 14), mat, true, false);
    m.name = "packet";
    return m;
  }

  /**
   * token({ color = P.glow, size = .26, glow = 1.1 }) -> Mesh: a rounded candy cube with a soft self-glow
   * (words, data blocks, coins). Materials are cached per colour.
   */
  const tokenMats = new Map();
  function token(o = {}) {
    const s = o.size ?? 0.26, col = o.color ?? P.glow, gl = o.glow ?? 1.1;
    const key = `${col}|${gl}`;
    let mat = tokenMats.get(key);
    if (!mat) {
      mat = materials.plastic.clone();
      mat.color.set(col);
      mat.emissive = new THREE.Color(col);
      mat.emissiveIntensity = gl;
      mat.name = `token:${col}`;
      tokenMats.set(key, mat);
    }
    const g = new RoundedBoxGeometry(s, s, s, 4, s * 0.28);
    const m = mesh(g, mat, true, false);
    m.name = "token";
    return m;
  }

  /** pulseRing({ r = .6, color = P.glow, width = .06 }) -> Mesh: flat ring; userData.setPulse(u) expands and fades it. */
  function pulseRing(o = {}) {
    const R = o.r ?? 0.6;
    const mat = new THREE.MeshBasicMaterial({ color: o.color ?? P.glow, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.name = "pulseRing";
    const geo = new THREE.TorusGeometry(R, o.width ?? 0.05, 8, 48);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.name = "pulseRing";
    m.userData.setPulse = (u) => {
      m.visible = u > 0 && u < 1;
      m.scale.setScalar(lerp(0.4, 1.6, ease.outCubic(clamp(u))));
      mat.opacity = (1 - clamp(u)) * 0.9;
    };
    m.userData.setPulse(0);
    return m;
  }

  /**
   * scatter({ size = [w, d] | n, count = 10, seed, make(r, i), avoid: [{x, z, r}], margin = .6, spacing = .9, tries = 40 })
   *   -> Group of pieces on a tile's top (y = 0). Children get userData.delay (0..1) and baseScale.
   */
  function scatter(o = {}) {
    const r = rng(seedOf(o.seed ?? 5));
    const [W, D] = Array.isArray(o.size) ? o.size : [o.size ?? 14, o.size ?? 8.75];
    const { count = 10, avoid = [], margin = 0.6, spacing = 0.9, tries = 40 } = o;
    const g = new THREE.Group();
    g.name = "scatter";
    const placed = [];
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < tries; k++) {
        const x = r.range(-W / 2 + margin, W / 2 - margin), z = r.range(-D / 2 + margin, D / 2 - margin);
        if (avoid.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r)) continue;
        if (placed.some((p) => (x - p[0]) ** 2 + (z - p[1]) ** 2 < spacing * spacing)) continue;
        const obj = o.make(r.fork(i), i);
        obj.position.set(x, 0, z);
        obj.userData.delay = r.next();
        obj.userData.baseScale = obj.scale.toArray();
        placed.push([x, z]);
        g.add(obj);
        break;
      }
    }
    return g;
  }

  // ------------------------------------------------------------ overlay UI (exact colours, never blurred)
  const U = spec.ui;
  const uiFont = FONTS[U.font] ?? U.font;
  const flat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
  const roundRectGeo = (w, h, r, segs = 10) => {
    r = Math.min(r, w / 2, h / 2);
    const s = new THREE.Shape(), l = -w / 2, b = -h / 2, R = w / 2, T = h / 2;
    s.moveTo(l + r, b); s.lineTo(R - r, b); s.absarc(R - r, b + r, r, -Math.PI / 2, 0, false);
    s.lineTo(R, T - r); s.absarc(R - r, T - r, r, 0, Math.PI / 2, false);
    s.lineTo(l + r, T); s.absarc(l + r, T - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(l, b + r); s.absarc(l + r, b + r, r, Math.PI, Math.PI * 1.5, false);
    return new THREE.ShapeGeometry(s, segs);
  };
  const uiText = (text, color, h) => {
    const m = createTextLabel(text, { font: uiFont, weight: 800, color, height: h, padding: 0.04, letterSpacing: 2 });
    m.material.depthTest = false;
    return m;
  };
  const fadeable = (g) => {
    const mats = [];
    g.traverse((o) => o.material && mats.push([o.material, o.material.opacity]));
    return (k) => mats.forEach(([m, o0]) => (m.opacity = o0 * k));
  };
  const ord = (m, n) => ((m.renderOrder = n), m);

  /**
   * pinMarker({ number, tag = null, color = ui.badge, side = "right" }) -> Group for the overlay.
   *   Origin = the pin's tip (anchor it with pinToScreen(stage, pin, { world, height })); 1 unit ≈ head diameter.
   *   userData.set(reveal 0..1, hide 0..1, t)  pops up from the tip (outBack), bobs gently, shrinks away.
   */
  function pinMarker(o = {}) {
    const g = new THREE.Group();
    g.name = `pin:${o.number ?? ""}`;
    const body = new THREE.Group();
    g.add(body);
    const col = o.color ?? U.badge;
    const headY = 1.25;
    const tail = (r, c, z) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(r * 0.78, headY - r * 0.55);
      sh.lineTo(-r * 0.78, headY - r * 0.55);
      sh.lineTo(0, 0);
      return ord(new THREE.Mesh(new THREE.ShapeGeometry(sh), flat(c)), z);
    };
    const disc = (r, c, z, y = headY, x = 0) => {
      const m = ord(new THREE.Mesh(new THREE.CircleGeometry(r, 48), flat(c)), z);
      m.position.set(x, y, 0);
      return m;
    };
    // soft ground dot under the tip
    const dot = ord(new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), flat(U.pillShadow, 0.22)), 20);
    dot.scale.y = 0.4;
    g.add(dot);
    const headShadow = disc(0.6, U.pillShadow, 21, headY - 0.08, 0.06);
    headShadow.material.opacity = U.pillShadowOpacity;
    body.add(headShadow);
    body.add(tail(0.62, U.pinRing, 22), disc(0.62, U.pinRing, 22));
    body.add(tail(0.5, col, 23), disc(0.5, col, 23));
    if (o.number != null) {
      const n = ord(uiText(String(o.number), U.badgeText, 0.62), 24);
      n.position.set(0, headY + 0.01, 0);
      body.add(n);
    }
    if (o.tag) {
      const t = ord(uiText(o.tag, U.ink, 0.42), 26);
      const tw = t.scale.x + 0.5;
      const sgn = o.side === "left" ? -1 : 1;
      const px = sgn * (0.62 + 0.12 + tw / 2);
      const pill = ord(new THREE.Mesh(roundRectGeo(tw, 0.7, 0.35), flat(U.pill)), 25);
      pill.position.set(px, headY, 0);
      const psh = ord(new THREE.Mesh(roundRectGeo(tw, 0.7, 0.35), flat(U.pillShadow, U.pillShadowOpacity)), 24);
      psh.position.set(px + 0.05, headY - 0.07, 0);
      t.position.set(px, headY, 0);
      body.add(psh, pill, t);
    }
    const fade = fadeable(g);
    g.userData.set = (reveal, hide = 0, t = 0) => {
      const k = reveal <= 0 ? 0 : ease.outBack(clamp(reveal), 2.4);
      const hd = ease.inBack(clamp(hide), 1.4);
      const s = Math.max(1e-4, k * (1 - hd));
      body.scale.set(s, s, 1);
      body.position.y = Math.sin(t * 3.1) * 0.06 * clamp(reveal * 2) + hd * 0.5;
      dot.scale.set(Math.max(1e-4, s), Math.max(1e-4, s * 0.4), 1);
      fade(1 - clamp(hide * 1.4 - 0.4));
      g.visible = reveal > 0 && hide < 1;
      g.userData.pinScale = [1, 1, 1];
    };
    g.userData.set(0);
    return g;
  }

  /**
   * caption(text, { number = null, badgeColor = ui.badge }) -> Group for the overlay: a cream pill with a
   *   numbered badge. Origin = pill centre; 1 unit = pill height. userData.width (units).
   *   userData.set(reveal, hide)  badge pops, pill stretches open (outBack), text fades in; hide lifts + fades.
   */
  function caption(text, o = {}) {
    const g = new THREE.Group();
    g.name = `caption:${text.slice(0, 20)}`;
    const t = ord(uiText(text, U.ink, 0.5), 33);
    const hasN = o.number != null;
    const padL = hasN ? 1.05 : 0.45, W = padL + t.scale.x + 0.45;
    const inner = new THREE.Group();
    g.add(inner);
    const pill = ord(new THREE.Mesh(roundRectGeo(W, 1, 0.5), flat(U.pill)), 31);
    const psh = ord(new THREE.Mesh(roundRectGeo(W, 1, 0.5), flat(U.pillShadow, U.pillShadowOpacity)), 30);
    psh.position.set(0.05, -0.09, 0);
    inner.add(psh, pill);
    t.position.set(-W / 2 + padL + t.scale.x / 2, 0.0, 0);
    inner.add(t);
    const badge = new THREE.Group();
    if (hasN) {
      badge.add(ord(new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), flat(o.badgeColor ?? U.badge)), 34));
      const n = ord(uiText(String(o.number), U.badgeText, 0.44), 35);
      badge.add(n);
      badge.position.set(-W / 2 + 0.52, 0, 0);
      g.add(badge);
    }
    const fade = fadeable(g);
    g.userData.width = W;
    g.userData.set = (reveal, hide = 0) => {
      const b = reveal <= 0 ? 0 : ease.outBack(clamp(reveal / 0.5), 2.2);
      badge.scale.setScalar(Math.max(1e-4, b));
      const pw = ease.outBack(clamp((reveal - 0.1) / 0.7), 1.3);
      inner.scale.set(Math.max(1e-4, pw), Math.max(1e-4, Math.min(1, pw * 1.6)), 1);
      inner.position.x = (1 - pw) * (-W / 2 + 0.52);
      const hd = ease.inCubic(clamp(hide));
      g.userData.lift = hd * 0.6;
      fade(1 - hd);
      t.material.opacity = Math.min(clamp((reveal - 0.45) / 0.35), 1 - hd);
      g.visible = reveal > 0 && hide < 1;
    };
    g.userData.set(0);
    return g;
  }

  /** kicker(text) -> overlay text (small caps line, ui.kicker colour); userData.set(reveal) fades it. */
  function kicker(text, o = {}) {
    // kit pinToScreen keeps the label's own aspect (userData.pinBase), so no wrapper group is needed
    const m = ord(uiText(text, o.color ?? U.kicker, 0.5), 36);
    m.name = `kicker:${text.slice(0, 20)}`;
    m.userData.set = (k) => { m.material.opacity = clamp(k); m.visible = k > 0; };
    m.userData.set(0);
    return m;
  }

  // ------------------------------------------------------------ helpers
  /**
   * focusOn(worldPoint, { range, min = .3, max = .7 }) — aim tilt-shift at a 3D point (call after the camera moves).
   * Keeps the active subject sharp while the top/bottom of frame go soft.
   */
  function focusOn(p, o = {}) {
    if (!post?.passes?.tiltH) return;
    const s = projectToScreen(stage, p);
    const f = clamp((s.y + 1) / 2, o.min ?? 0.3, o.max ?? 0.7);
    post.set({ tiltShift: { focus: f, ...(o.range != null ? { range: o.range } : {}) } });
  }
  /** pin(obj, opts) = kit overlay pinToScreen(stage, obj, opts) (exact colours, after post). */
  const pin = (obj, o) => pinToScreen(stage, obj, o);
  getOverlay(stage);

  const props = { tile, building, house, dataCentre, tree, bush, car, peg, desk, road, pole, cable, packet, token, pulseRing, contactShadow, scatter, pinMarker, caption, kicker };
  const P_ = (fn) => (os) => fn(os.params ?? {});
  const factories = {
    tile: P_(tile), building: P_(building), house: P_(house), dataCentre: P_(dataCentre), tree: P_(tree), bush: P_(bush),
    car: P_(car), peg: P_(peg), desk: P_(desk), pole: P_(pole), packet: P_(packet), token: P_(token), pulseRing: P_(pulseRing),
    road: (os) => road(os.params.points, os.params),
    cable: (os) => cable(os.params.anchors, os.params),
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
    helpers: { dropIn, spinAngle, pop, focusOn, pin, tint },
    sfx: spec.sfx,
  };
}
