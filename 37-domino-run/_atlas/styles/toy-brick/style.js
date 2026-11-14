// styles/toy-brick/style.js — "Toy Brick": generic interlocking plastic bricks (plain studs, no brand marks),
// toy-photography macro on a studio table. Glossy moulded ABS (physical clearcoat + object-space roughness
// variation and micro-scratches + warm sheen on light colours), tinted transmissive trans pieces, a studded
// baseplate (instanced studs), procedural soft-box studio reflections (kit studio.js), DoF + tilt-shift.
// Everything is synchronous and seeded; time enters only through update(t) hooks and style.render(t, { focus }).
// The build schedule (drop / fly / snap / unbuild timing) lives in ./bricks.js (THREE-free, Node-safe).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createCyclorama, contactShadow } from "../../kit/builders.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, clamp, ease, smoothstep, lerp } from "../../kit/time.js";
import { getOverlay, pinToScreen, projectToScreen } from "../../kit/overlay.js";
import { studioEnvironment, depthOfField } from "../../kit/studio.js";
import { plasticSurface } from "../../kit/materials.js";
import { focusOn } from "../../kit/post.js";
import * as plan from "./bricks.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, plan };

const { heightOf } = plan;

// ======================================================================= plastic surface patch ======
// Object-space (UV-free) roughness blotches + fine directional micro-scratches + a faint moulding ripple.
// (kit promotion candidate: materials.objectSpaceBump only perturbs normals; this also varies roughness.)
// plastic surface patch: kit/materials.js plasticSurface (promoted, identical shader)
const patchPlastic = plasticSurface;

// ======================================================================= geometry ===================
/**
 * BrickGeometry factory (cached). Every geometry has its origin at the FOOTPRINT CENTRE, BASE (y = 0), sized
 * from the spec's stud grid. Pieces: brick / plate / tile (no studs) / slope (studs on the high row, `dir`
 * = descends toward) / round (1x1 lathe) / roundPlate / arch (notched elliptical openings along its long axis).
 */
function geometryKit(B) {
  const P = B.pitch, PH = B.plate * P, G = B.gap * P, TG = B.topGap * P, BV = B.bevel * P;
  const SR = B.studR * P, SH = B.studH * P, SB = B.studBevel * P;
  const cache = new Map();
  const clean = (g) => {
    let n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
    n.clearGroups();
    return n;
  };
  // stud: lathe bottom -> side -> rounded top edge -> top cap (outward normals)
  const studProfile = () => {
    const pts = [new THREE.Vector2(SR, -TG - 0.002)];
    pts.push(new THREE.Vector2(SR, SH - SB));
    for (let k = 1; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(SR - SB + Math.cos(a) * SB, SH - SB + Math.sin(a) * SB)); }
    pts.push(new THREE.Vector2(0, SH));
    return pts;
  };
  const studGeo = clean(new THREE.LatheGeometry(studProfile(), B.studSegments));
  const studsAt = (cells, y) => cells.map(([x, z]) => studGeo.clone().translate(x, y, z));
  const grid = (w, d) => { const out = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([(i + 0.5 - w / 2) * P, (j + 0.5 - d / 2) * P]); return out; };
  const body = (w, d, hPl) => {
    const H = hPl * PH - TG;
    const g = new RoundedBoxGeometry(w * P - 2 * G, H, d * P - 2 * G, B.bevelSegments, Math.min(BV, H / 2 - 1e-4));
    g.translate(0, H / 2, 0);
    return clean(g);
  };
  // extrude a profile shape (x along `len`, y up) through `depth`, centred, base at y = 0
  const extrude = (shape, depth) => {
    const bv = Math.min(BV, depth / 4);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, depth - 2 * bv), bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: B.bevelSegments, curveSegments: B.arch.segments });
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    return g;
  };
  const dirAngle = { "+z": 0, "+x": Math.PI / 2, "-z": Math.PI, "-x": -Math.PI / 2 };

  function make(type, size, o = {}) {
    const [sx, sz] = size;
    const hPl = o.h ?? plan.TYPE_H[type] ?? 3;
    const key = `${type}|${sx}x${sz}|${hPl}|${o.dir ?? ""}|${o.arches ?? ""}`;
    if (cache.has(key)) return cache.get(key);
    const H = hPl * PH - TG;
    let parts = [];
    if (type === "brick" || type === "plate" || type === "tile" || type === "trans") {
      parts.push(body(sx, sz, hPl));
      if (type !== "tile") parts.push(...studsAt(grid(sx, sz), H + TG));
    } else if (type === "round" || type === "roundPlate") {
      const r = B.roundR * P, b = Math.min(BV, H / 3);
      const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r - b, 0)];
      for (let k = 1; k <= 3; k++) { const a = -Math.PI / 2 + (k / 3) * (Math.PI / 2); pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, b + Math.sin(a) * b)); }
      pts.push(new THREE.Vector2(r, H - b));
      for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, H - b + Math.sin(a) * b)); }
      pts.push(new THREE.Vector2(SR + 0.004, H));
      pts.push(new THREE.Vector2(SR, H));
      pts.push(new THREE.Vector2(SR, H + SH - SB));
      for (let k = 1; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(SR - SB + Math.cos(a) * SB, H + SH - SB + Math.sin(a) * SB)); }
      pts.push(new THREE.Vector2(0, H + SH));
      parts.push(clean(new THREE.LatheGeometry(pts, B.studSegments + 8)));
    } else if (type === "slope") {
      const dir = o.dir ?? "+z";
      const alongX = dir === "+x" || dir === "-x";
      const run = alongX ? sx : sz, wid = alongX ? sz : sx;
      const lip = Math.max(PH * 0.5, H * B.slopeLip);
      const L = run * P - 2 * G;
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, lip); s.lineTo(Math.min(P - G, L * 0.5), H); s.lineTo(0, H); s.lineTo(0, 0);
      const g = extrude(s, wid * P - 2 * G);
      // shape x (run, high end at 0) -> +z after rotateY(-90°): the slope descends toward +z
      g.rotateY(-Math.PI / 2);
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
      parts.push(clean(g));
      const back = []; for (let i = 0; i < wid; i++) back.push([(i + 0.5 - wid / 2) * P, (0.5 - run / 2) * P]);
      parts.push(...studsAt(back, H + TG));
      parts = parts.map((p) => p.rotateY(dirAngle[dir]));
    } else if (type === "arch") {
      const alongX = sx >= sz;
      const len = alongX ? sx : sz, dep = alongX ? sz : sx;
      const L = len * P - 2 * G, pw = B.arch.pillar * P;
      const n = o.arches ?? Math.max(1, Math.floor((len - B.arch.pillar) / 2.5));
      const span = (L - (n + 1) * pw) / n;
      const rise = Math.min(B.arch.rise * P, H - 0.3 * P);
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      for (let k = 0; k < n; k++) {
        const x0 = pw + k * (span + pw), cx = x0 + span / 2, a = span / 2;
        s.lineTo(x0, 0);
        const seg = B.arch.segments;
        for (let j = 1; j < seg; j++) { const th = Math.PI - (j / seg) * Math.PI; s.lineTo(cx + Math.cos(th) * a, Math.sin(th) * rise); }
        s.lineTo(x0 + span, 0);
      }
      s.lineTo(L, 0); s.lineTo(L, H); s.lineTo(0, H); s.lineTo(0, 0);
      const g = extrude(s, dep * P - 2 * G);
      if (!alongX) g.rotateY(Math.PI / 2);
      parts.push(clean(g));
      parts.push(...studsAt(grid(sx, sz), H + TG));
    } else {
      throw new Error(`toy-brick: unknown part type "${type}"`);
    }
    const merged = mergeGeometries(parts.map(clean), false);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    cache.set(key, merged);
    return merged;
  }
  return { make, studGeo, P, PH, SH, SR, G, TG };
}

// ======================================================================= createStyle ================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, dof = true, studio: { ...overrides of spec.studio } }
 *   style.render(t, { focus: [x,y,z] }) = DoF focus distance + tilt-shift aimed at `focus`, then stage.render(t).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = spec.palette, B = spec.brick, S = spec.plastic, T = spec.trans, UI = spec.ui;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const key = lights.key;
  if (key) key.shadow.radius = spec.lights.find((l) => l.id === "key")?.shadow?.softness ?? 4;

  const studio = studioEnvironment(stage, { ...spec.studio, ...(opts.studio ?? {}) }, { lights });
  const dof = opts.dof === false || !post ? { pass: null, setFocus() {} } : depthOfField(stage, spec.dof); // corrected depth pre-pass (legacyPrepass dropped after a look review, 2026-11-13)
  const K = geometryKit(B);

  // ------------------------------------------------------------ colours -> materials (cached)
  const hex = (c) => (typeof c === "string" && c[0] === "#" ? c : pal[c] ?? "#ff00ff");
  const luma = (c) => { const k = new THREE.Color(hex(c)); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };
  const matCache = new Map();
  /** color(c) -> shared glossy ABS material in palette name / hex `c` (warm sheen on light colours). */
  function color(c) {
    const h = hex(c);
    if (matCache.has(h)) return matCache.get(h);
    const m = materials.plastic.clone();
    m.color.set(h);
    m.envMapIntensity = S.envIntensity;
    if (luma(h) > S.lightLum * S.lightLum) { // colour is linear: compare against linearised threshold
      m.sheen = S.sheen; m.sheenRoughness = S.sheenRoughness; m.sheenColor = new THREE.Color(S.sheenColor);
      m.emissive = new THREE.Color(S.sheenColor); m.emissiveIntensity = S.warmEmissive;
    }
    patchPlastic(m, S);
    m.name = `plastic:${h}`;
    matCache.set(h, m);
    return m;
  }
  /** transMaterial(c, { glow = 0 }) -> tinted transmissive ABS (new material: glow is per piece). */
  function transMaterial(c, o = {}) {
    const h = hex(c);
    const tint = new THREE.Color(h);
    const m = new THREE.MeshPhysicalMaterial({
      color: tint.clone().lerp(new THREE.Color("#ffffff"), 0.6), transmission: T.transmission, roughness: T.roughness, thickness: T.thickness,
      ior: T.ior, attenuationColor: tint, attenuationDistance: T.attenuationDistance, clearcoat: T.clearcoat, clearcoatRoughness: 0.05,
      metalness: 0, emissive: tint, emissiveIntensity: o.glow ?? 0, specularIntensity: 1,
    });
    m.name = `trans:${h}`;
    return m;
  }
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; };

  // ------------------------------------------------------------ props
  /** part({ type, size:[sx,sz], color, dir?, h?, trans?, glow?, arches? }) -> Mesh, origin at footprint centre base. */
  function part(p) {
    const geo = K.make(p.type === "trans" ? "brick" : p.type, p.size, p);
    const mat = p.trans || p.type === "trans" ? transMaterial(p.color, p) : color(p.color);
    const m = mesh(geo, mat);
    m.name = `${p.type}:${p.size.join("x")}:${hex(p.color)}`;
    return m;
  }

  /**
   * baseplate({ w = 24, d = 16, color = "baseplate", thickness = .3 (P), center = [0, 0, 0] (world, table level) })
   *   -> Group: thin rounded slab + w x d INSTANCED studs. userData.grid = { P, PH, top, origin, w, d,
   *   toWorld(gx, gyPlates, gz) -> [x, y, z] } (grid origin = back-left stud corner on the top surface).
   */
  function baseplate(o = {}) {
    const { w = 24, d = 16, thickness = 0.3, center = [0, 0, 0] } = o;
    const g = new THREE.Group();
    g.name = "baseplate";
    const th = thickness * K.P;
    const mat = materials.baseplate.clone();
    if (o.color) mat.color.set(hex(o.color));
    mat.envMapIntensity = S.envIntensity;
    patchPlastic(mat, { ...S, scratchCover: S.scratchCover * 0.6 });
    const slab = mesh(new RoundedBoxGeometry(w * K.P, th, d * K.P, 2, th * 0.3), mat);
    slab.position.y = th / 2;
    g.add(slab);
    const studs = new THREE.InstancedMesh(K.studGeo, mat, w * d);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) studs.setMatrixAt(k++, m4.makeTranslation((i + 0.5 - w / 2) * K.P, th + K.TG, (j + 0.5 - d / 2) * K.P));
    studs.castShadow = studs.receiveShadow = true;
    g.add(studs);
    g.position.set(...center);
    const origin = [center[0] - (w * K.P) / 2, center[1] + th, center[2] - (d * K.P) / 2];
    g.userData.grid = {
      P: K.P, PH: K.PH, w, d, top: origin[1], origin, studTop: origin[1] + K.SH,
      toWorld: (gx, gy, gz) => [origin[0] + gx * K.P, origin[1] + gy * K.PH, origin[2] + gz * K.P],
    };
    return g;
  }

  /**
   * build(layout, { grid, ...planBuild opts (start, step, dur, order, mode, from, stepped) }) -> Group
   *   layout: parts as objects or compact strings ("brick 2x4 red @3,4 ^0"), see bricks.parseLayout.
   *   userData: { plan (bricks.planBuild: parts + events), meshes, update(t) (closed-form poses), focus(t) -> world [x,y,z] }
   *   Parts start hidden and are posed purely from t (seek in any order).
   */
  function build(layout, o = {}) {
    const grid = o.grid;
    const P = o.plan ?? plan.planBuild(layout, o);
    const g = new THREE.Group();
    g.name = "build";
    const meshes = P.parts.map((p) => { const m = part(p); g.add(m); m.visible = false; return m; });
    const toW = (x, y, z) => grid.toWorld(x, y, z);
    g.userData = {
      plan: P, meshes,
      update(t) {
        P.parts.forEach((p, i) => {
          const s = plan.brickPose(p, t), m = meshes[i];
          m.visible = s.visible;
          if (!s.visible) return;
          m.position.set(...toW(s.x, s.y, s.z));
          m.rotation.set(s.rx, s.ry, s.rz);
          m.scale.set(s.sx, s.sy, s.sz);
        });
      },
      focus(t) { const a = plan.activePart(P, t); return toW(a.x, a.y, a.z); },
    };
    return g;
  }

  /**
   * pegFigure({ body = "red", head = "#f4dcc0", height = 2.6 (P) }) -> Group, origin at its base (put it on a stud:
   *   the hollow foot hides the stud). A turned cylinder body with a flared foot, a round head, two dot eyes.
   *   userData.look(yaw, pitch) turns the head (rad); userData.head = the head pivot.
   */
  function pegFigure(o = {}) {
    const P = K.P, s = (o.height ?? 2.6) / 2.6;
    const g = new THREE.Group();
    g.name = "peg";
    const bodyMat = color(o.body ?? "red"), headMat = color(o.head ?? "#f4dcc0");
    const r0 = 0.42 * P * s, r1 = 0.33 * P * s, hb = 1.55 * P * s;
    const prof = [[0, 0], [r0 - 0.02 * P, 0], [r0, 0.03 * P], [r0, 0.16 * P * s], [r1 + 0.02 * P, 0.3 * P * s], [r1, hb - 0.16 * P * s], [r1 - 0.05 * P, hb - 0.04 * P * s], [r1 - 0.12 * P, hb], [0.15 * P * s, hb], [0.15 * P * s, hb + 0.12 * P * s], [0, hb + 0.12 * P * s]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const bodyM = mesh(new THREE.LatheGeometry(prof, 40), bodyMat);
    g.add(bodyM);
    const head = new THREE.Group();
    head.position.y = hb + 0.1 * P * s;
    const hr = 0.46 * P * s;
    const hm = mesh(new THREE.SphereGeometry(hr, 40, 28), headMat);
    hm.scale.set(1, 0.94, 1);
    hm.position.y = hr * 0.92;
    head.add(hm);
    for (const sgn of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(0.095 * P * s, 16, 12), materials.eye);
      const a = sgn * 0.33, el = 0.12;
      e.position.set(Math.sin(a) * Math.cos(el) * hr * 0.97, hr * 0.92 + Math.sin(el) * hr * 0.94, Math.cos(a) * Math.cos(el) * hr * 0.97);
      e.scale.set(1, 1.25, 0.5);
      e.lookAt(e.position.clone().multiplyScalar(2).sub(new THREE.Vector3(0, hr * 0.92, 0)));
      e.castShadow = false;
      head.add(e);
    }
    g.add(head);
    g.userData.head = head;
    g.userData.look = (yaw = 0, pitch = 0) => head.rotation.set(-pitch, yaw, 0, "YXZ");
    return g;
  }

  /**
   * printedTile({ size = [2, 4], color = "white", text, ink = pal.ink, font, weight }) -> Mesh (a tile: no studs)
   *   with the text printed flat on its top face (in-world, lit, matte ink). Origin at footprint centre base.
   */
  function printedTile(o = {}) {
    const size = o.size ?? [4, 2];
    const m = part({ type: "tile", size, color: o.color ?? "white" });
    if (o.text) {
      const L = createTextLabel(o.text, { font: FONTS[o.font ?? "rounded"], weight: o.weight ?? 800, color: o.ink ?? pal.ink, height: 1, lit: true, padding: 0.1 });
      const maxW = size[0] * K.P * 0.86, maxH = size[1] * K.P * 0.62;
      const k = Math.min(maxW / L.scale.x, maxH / L.scale.y);
      L.scale.multiplyScalar(k);
      L.rotation.x = -Math.PI / 2;
      L.position.y = K.PH - K.TG + 0.0008;
      L.material.polygonOffset = true; L.material.polygonOffsetFactor = -2;
      L.receiveShadow = true;
      m.add(L);
    }
    return m;
  }

  /**
   * pile({ grid, center:[gx,gz], radius = 3 (studs), parts:[{type,size,color,trans?}], seed }) -> Group of LOOSE
   *   pieces resting on the stud tops (off-grid, random yaw, some on their side), non-overlapping (rejection
   *   sampled). Decoration for toy-photo realism; static.
   */
  function pile(o = {}) {
    const { grid, center = [0, 0], radius = 3, seed = 7 } = o;
    const R = rng(seed);
    const g = new THREE.Group();
    g.name = "pile";
    const placed = [];
    for (const p of o.parts ?? []) {
      const m = part(p);
      const side = R.chance(p.side ?? (p.type === "plate" || p.type === "tile" ? 0 : 0.35));
      const rad = Math.hypot(p.size[0], p.size[1]) * 0.5 + 0.35;
      let x = 0, z = 0;
      for (let tries = 0; tries < 60; tries++) {
        const a = R.range(0, Math.PI * 2), d = Math.sqrt(R.next()) * radius;
        x = center[0] + Math.cos(a) * d; z = center[1] + Math.sin(a) * d;
        if (placed.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + rad)) break;
      }
      placed.push({ x, z, r: rad });
      m.rotation.set(side ? Math.PI / 2 : 0, R.range(0, Math.PI * 2), 0, "YXZ");
      const w = grid.toWorld(x, 0, z);
      m.position.set(w[0], 0, w[2]);
      m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m);
      // re-centre the (possibly tipped-over) piece on the sampled point and rest it on the surface
      m.position.x += w[0] - (bb.min.x + bb.max.x) / 2;
      m.position.z += w[2] - (bb.min.z + bb.max.z) / 2;
      m.position.y += (o.surface ?? grid.studTop) - bb.min.y;
      g.add(m);
    }
    return g;
  }

  /** table({ width = 14, depth = 9, height = 6, radius = 2.5 }) -> pale satin studio sweep (kit cyclorama). */
  const table = (o = {}) => {
    const c = createCyclorama({ width: 14, depth: 9, height: 6, radius: 2.5, ...o, material: materials.table });
    c.receiveShadow = true;
    return c;
  };

  // ------------------------------------------------------------ overlay stickers (exact colour, after post)
  const ov = getOverlay(stage);
  const flat = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthTest: false, toneMapped: false });
  const roundRect = (w, h, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    return new THREE.ShapeGeometry(s, 10);
  };
  /**
   * sticker(text, { color = "red" (stud badge), align = "left"|"center"|"right", lines }) -> Group for the overlay
   *   (pin it with style.pin(obj, { x, y, height })). A white rounded sticker card with a stud-top badge and heavy
   *   rounded caps; 1 unit = one card line height. userData.set(age (s since on, <0 = hidden), hide 0..1) slaps it
   *   on (outBack + tilt settle) and peels it off; userData.setText(str) re-lays it out (multi-line with "\n").
   */
  function sticker(text, o = {}) {
    const g = new THREE.Group();
    g.name = `sticker:${String(text).slice(0, 20)}`;
    const inner = new THREE.Group();
    g.add(inner);
    const font = FONTS[UI.font] ?? UI.font;
    const label = createTextLabel(text, { font, weight: UI.weight, color: UI.ink, height: 0.56, padding: 0.12, align: "left", lineHeight: 1.12 });
    label.material.depthTest = false;
    label.renderOrder = 33;
    const badge = new THREE.Group();
    const bc = new THREE.Color(hex(o.color ?? "red"));
    const bd = new THREE.Mesh(new THREE.CircleGeometry(UI.badge / 2, 40), flat(bc)); bd.renderOrder = 32;
    const ring = new THREE.Mesh(new THREE.RingGeometry(UI.badge * 0.3, UI.badge * 0.38, 40), flat(bc.clone().multiplyScalar(0.72))); ring.renderOrder = 33;
    const hi = new THREE.Mesh(new THREE.RingGeometry(UI.badge * 0.2, UI.badge * 0.27, 40, 1, Math.PI * 0.55, Math.PI * 0.7), flat("#ffffff", 0.55)); hi.renderOrder = 34;
    badge.add(bd, ring, hi);
    let card = null, shadow = null, W = 1, Hc = 1;
    const layout = () => {
      const nl = label.userData.lines?.length ?? 1;
      Hc = 1 + (nl - 1) * 0.62;
      const pad = UI.pad;
      W = pad * 0.55 + UI.badge + pad * 0.45 + label.scale.x - 0.1 + pad * 0.55;
      if (card) { inner.remove(card, shadow); card.geometry.dispose(); shadow.geometry.dispose(); }
      card = new THREE.Mesh(roundRect(W, Hc, UI.radius), flat(UI.card)); card.renderOrder = 31;
      shadow = new THREE.Mesh(roundRect(W, Hc, UI.radius), flat(UI.shadow, UI.shadowOpacity)); shadow.renderOrder = 30;
      shadow.position.set(0.05, -0.08, 0);
      inner.add(shadow, card);
      badge.position.set(-W / 2 + pad * 0.55 + UI.badge / 2, Hc / 2 - 0.5, 0);
      label.position.set(-W / 2 + pad * 0.55 + UI.badge + pad * 0.45 + label.scale.x / 2 - 0.05, 0, 0);
      const al = o.align ?? "left";
      inner.position.x = al === "left" ? W / 2 : al === "right" ? -W / 2 : 0;
      g.userData.width = W;
      g.userData.height = Hc;
    };
    inner.add(badge, label);
    layout();
    const mats = () => { const out = []; g.traverse((n) => n.material && out.push(n.material)); return out; };
    for (const m of mats()) m.userData.baseOpacity = m.opacity;
    let cur = String(text);
    g.userData.setText = (s) => {
      s = String(s);
      // also re-draw when the kit's fonts.ready callback reverted the canvas to the ORIGINAL text (see STYLE.md)
      if (s === cur && (label.userData.lines ?? []).join("\n") === s) return;
      cur = s;
      label.userData.setText(s);
      layout();
      for (const m of mats()) if (m.userData.baseOpacity == null) m.userData.baseOpacity = m.opacity;
    };
    g.userData.set = (age, hide = 0) => {
      g.visible = age >= 0 && hide < 1;
      if (!g.visible) return;
      const e = ease.outBack(clamp(age / UI.popDur), 2.2);
      const h = ease.inCubic(clamp(hide));
      const s = Math.max(1e-4, e * (1 - 0.25 * h));
      inner.scale.set(s, s, 1);
      inner.rotation.z = UI.tilt * Math.exp(-age * 7) * Math.cos(age * 16) * (o.align === "right" ? -1 : 1);
      const a = clamp(age / (UI.popDur * 0.4)) * (1 - h);
      for (const m of mats()) m.opacity = (m.userData.baseOpacity ?? 1) * a;
    };
    g.userData.set(-1);
    ov.add(g);
    return g;
  }
  /** pin(obj, opts) = kit overlay pinToScreen (exact colours, drawn after post, never blurred). */
  const pin = (obj, o) => pinToScreen(stage, obj, o);

  const props = { part, baseplate, build, pegFigure, printedTile, pile, table, sticker, contactShadow: (o = {}) => contactShadow({ opacity: 0.4, ...o }) };

  return {
    spec,
    palette: pal,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      baseplate: (s) => baseplate(s.params ?? s.dims ?? {}),
      table: (s) => table(s.params ?? s.dims ?? {}),
      part: (s) => part(s.params),
      pegFigure: (s) => pegFigure(s.params ?? {}),
      printedTile: (s) => printedTile(s.params ?? {}),
    },
    studio,
    dof,
    plan,
    motion: plan,
    helpers: { color, transMaterial, pin, geometry: K.make, hex, projectToScreen: (p) => projectToScreen(stage, p) },
    /** render(t, { focus:[x,y,z], tilt = true }) — DoF focus distance + tilt-shift band on `focus`, then stage.render(t). */
    render(t, { focus, tilt = true } = {}) {
      if (focus) {
        stage.camera.updateMatrixWorld();
        dof.setFocus(stage.camera.position.distanceTo(new THREE.Vector3(...focus)));
        if (tilt) focusOn(stage, focus, { min: 0.35, max: 0.65 });
      }
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
