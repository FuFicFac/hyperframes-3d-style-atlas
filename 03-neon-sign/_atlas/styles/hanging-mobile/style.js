// styles/hanging-mobile/style.js — "Hanging Mobile": a kinetic mobile in a bright skylit gallery. Implements the style
// contract (references/kit-api.md §3). All timing and balance maths live in the THREE-free planner balance.js
// (style.plan / style.motion); this file only turns a plan into wire, thread and sheet metal and sets transforms from t.
//
// Hierarchy per arm (mirrors balance.js pose() exactly, so overlay anchors and camera planning agree with the picture):
//   armGroup (origin = pivot loop)  -> yaw (rotation.y)  -> tilt (rotation.z)  -> stirrup + pivot loop
//                                                                              -> bar (x = -p, y = -h): wire, loops
//                                                                                   -> hanger at (at*len, 0) rotation.z = -tilt + lag
//                                                                                        -> thread (down to -L), child at (0, -L, 0)
//   shapeGroup (origin = hang hole) -> yaw -> plate (scaled about the hole), wire ring through the hole, tag on a thread.
// Nothing animates itself: mobile.userData.update(t) sets every transform from the plan.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { cardMesh } from "../../kit/shapes.js";
import { sweepGeometry } from "../../kit/paths.js";
import { canvasTexture } from "../../kit/textures.js";
import { getOverlay } from "../../kit/overlay.js";
import { overlayText } from "../../kit/callouts.js";
import { FONTS } from "../../kit/text.js";
import { clamp, smoothstep, toEase } from "../../kit/time.js";
import * as balance from "./balance.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/** mobilePlan(spec, mobile, events, extra) -> balance.planMobile with the style's knobs (also usable from Node). */
export const mobilePlan = (mobile, events = [], extra = {}) => balance.mobilePlan(STYLE_SPEC, mobile, events, extra);

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, shadowQuality = spec.shadows.quality ("draft" | "good" | "best") }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const W = spec.wire, TH = spec.thread, SH = spec.sheet, TG = spec.tag, G = spec.gallery;

  // ---------------------------------------------------------------- wall shadow quality knob
  function setShadowQuality(q = spec.shadows.quality) {
    const pr = spec.shadows.presets[q] ?? spec.shadows.presets.good, key = lights.key;
    if (!key) return;
    const ext = (spec.lights.find((l) => l.id === "key")?.shadow?.extent ?? 4.6) * (pr.extentScale ?? 1);
    if (key.shadow.mapSize.x !== pr.mapSize) { key.shadow.map?.dispose(); key.shadow.map = null; key.shadow.mapSize.set(pr.mapSize, pr.mapSize); }
    key.shadow.radius = pr.softness;
    const c = key.shadow.camera; c.left = c.bottom = -ext; c.right = c.top = ext; c.updateProjectionMatrix();
  }
  setShadowQuality(opts.shadowQuality ?? spec.shadows.quality);

  const paint = (name) => materials[spec.colors[name] ?? name] ?? materials[name] ?? materials.paintWhite;

  // ---------------------------------------------------------------- small parts
  const unitThread = new THREE.CylinderGeometry(TH.r, TH.r, 1, TH.radial, 1, true).translate(0, -0.5, 0);
  /** thread({ length, r }) -> Mesh hanging DOWN from its origin; userData.setLength(L). */
  function thread(o = {}) {
    const geo = o.r ? new THREE.CylinderGeometry(o.r, o.r, 1, TH.radial, 1, true).translate(0, -0.5, 0) : unitThread;
    const m = new THREE.Mesh(geo, materials.thread);
    m.castShadow = true;
    m.userData.setLength = (L) => { m.visible = L > 1e-4; m.scale.y = Math.max(L, 1e-4); };
    m.userData.setLength(o.length ?? 1);
    return m;
  }
  const loopGeo = new THREE.TorusGeometry(W.loopR, W.loopTube, 8, 20);
  /** wireLoop() -> small closed wire ring in the XY plane (end loops, pivot loop, clips). */
  function wireLoop(r = W.loopR, tube = W.loopTube) {
    const m = new THREE.Mesh(r === W.loopR && tube === W.loopTube ? loopGeo : new THREE.TorusGeometry(r, tube, 8, 20), materials.wire);
    m.castShadow = true;
    return m;
  }
  function rod(a, b, r, mat = materials.wire) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8, 1), mat);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    return m;
  }

  /** hook({ y }) -> ceiling rose + open hook at the origin (hangs its thread from y = 0 downward). */
  function hook() {
    const g = new THREE.Group();
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.018, 28), materials.hook);
    rose.position.y = 0.06;
    const stem = rod([0, 0.06, 0], [0, 0.02, 0], 0.005, materials.hook);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0045, 8, 24, Math.PI * 1.6), materials.hook);
    h.rotation.z = Math.PI * 0.7; h.position.y = 0.002;
    g.add(rose, stem, h);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /**
   * arm({ len, h, loads: [at...] }) -> { group, yaw, tilt, bar, loops } static wire arm: a gently bowed wire with a loop at
   * each end, extra clip loops at `loads` positions, a stirrup up to the pivot loop at the origin.
   */
  function arm(o = {}) {
    const len = o.len ?? 1.5, h = o.h ?? spec.balance.h, group = new THREE.Group(), yaw = new THREE.Group(), tilt = new THREE.Group(), bar = new THREE.Group();
    group.add(yaw); yaw.add(tilt); tilt.add(bar);
    const n = 28, pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([u * len, W.bow * Math.sin(Math.PI * u) * Math.min(1, len / 2), 0]); }
    // ends curl down into the end loops
    pts.unshift([-W.loopR * 0.2, -W.loopR * 0.9, 0]);
    pts.push([len + W.loopR * 0.2, -W.loopR * 0.9, 0]);
    const wire = new THREE.Mesh(sweepGeometry(pts, W.r, 8), materials.wire);
    wire.castShadow = true;
    bar.add(wire);
    const loops = {};
    const addLoop = (at) => {
      const k = at.toFixed(4);
      if (loops[k]) return loops[k];
      const l = wireLoop();
      const isEnd = at <= 1e-3 || at >= 1 - 1e-3;
      l.position.set(at * len, isEnd ? -W.loopR * 1.05 : -W.loopR * 0.95, 0);
      bar.add(l);
      return (loops[k] = l);
    };
    addLoop(0); addLoop(1);
    for (const at of o.loads ?? []) addLoop(at);
    const pivotLoop = wireLoop(W.loopR * 0.8, W.loopTube);
    pivotLoop.position.y = -W.loopR * 0.8;
    const stirrup = rod([0, -W.loopR * 1.5, 0], [0, -h + W.r * 0.5, 0], W.stirrupR);
    const clip = new THREE.Mesh(new THREE.SphereGeometry(W.clipR, 12, 8), materials.wire);
    clip.position.y = -h; clip.castShadow = true;
    tilt.add(pivotLoop, stirrup, clip);
    bar.position.y = -h;
    return { group, yaw, tilt, bar, loops, addLoop, len, h };
  }

  /** plate(shapeSpec, { color }) -> Group with the sheet-metal plate in the HANG frame (hole at origin), userData.info. */
  function plate(s, o = {}) {
    const info = o.info ?? balance.shapeInfo(s, { density: SH.density });
    const shape = new THREE.Shape(info.pts.map((p) => new THREE.Vector2(p[0], p[1])));
    const m = cardMesh(shape, { thickness: SH.thickness * (s.gauge ?? 1), front: paint(o.color ?? s.color ?? "red"), edge: materials.edge, curveSegments: SH.curveSegments });
    const g = new THREE.Group();
    g.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(SH.holeR, W.loopTube * 0.9, 6, 16), materials.wire);
    ring.rotation.y = Math.PI / 2; ring.position.y = -SH.holeR * 0.2; ring.castShadow = true;
    g.add(ring);
    // optional painted inlay (a second, thinner disc glued on both faces): makes a white plate read against a white wall
    if (s.inlay) {
      const ir = s.inlay.r ?? 0.08, c = info.centroid;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(ir, ir, SH.thickness * (s.gauge ?? 1) + 0.003, 40), paint(s.inlay.color ?? "black"));
      disc.rotation.x = Math.PI / 2; disc.position.set(c[0] + (s.inlay.offset?.[0] ?? 0), c[1] + (s.inlay.offset?.[1] ?? 0), 0);
      disc.castShadow = true;
      g.add(disc);
    }
    g.userData.info = info;
    g.userData.mesh = m;
    return g;
  }

  /** tagCanvas(text) -> { canvas, w, h }: brushed-aluminium tag with engraved (dark-filled) letters, sized in metres. */
  function tagCanvas(text, seed = 3) {
    const cap = TG.cap, ppm = TG.ppm, px = cap * ppm * 1.36, font = `${TG.weight} ${px}px ${TG.font}`;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = font;
    const track = TG.tracking * px, tw = probe.measureText(text).width + track * Math.max(0, text.length - 1);
    const w = tw / ppm + cap * 1.4, h = cap * 2.1, cw = Math.ceil(w * ppm), ch = Math.ceil(h * ppm);
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const x = c.getContext("2d");
    x.fillStyle = TG.metal; x.fillRect(0, 0, cw, ch);
    let r = (seed * 9301 + 49297) % 233280;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    x.globalAlpha = 0.18; x.fillStyle = TG.brush;
    for (let i = 0; i < 160; i++) x.fillRect(rnd() * cw - 20, rnd() * ch, 30 + rnd() * cw * 0.6, 1);
    x.globalAlpha = 1;
    x.strokeStyle = TG.border; x.lineWidth = Math.max(1, cap * ppm * 0.05);
    x.strokeRect(x.lineWidth, x.lineWidth, cw - 2 * x.lineWidth, ch - 2 * x.lineWidth);
    x.font = font; x.textBaseline = "middle"; x.textAlign = "left";
    if ("letterSpacing" in x) x.letterSpacing = `${track}px`;
    x.fillStyle = TG.ink;
    x.fillText(text, (cw - tw) / 2, ch / 2 + px * 0.04);
    return { canvas: c, w, h };
  }
  /** tag(text) -> small engraved aluminium tag hanging DOWN from its origin on a short thread (text reads from both sides). */
  function tag(text, o = {}) {
    const pc = tagCanvas(text, o.seed ?? 3);
    const tex = canvasTexture(pc.canvas, { anisotropy: 8 });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.25 });
    const edge = new THREE.MeshStandardMaterial({ color: TG.metal, roughness: 0.35, metalness: 0.5 });
    const geo = new THREE.BoxGeometry(pc.w, pc.h, TG.thickness);
    const uv = geo.attributes.uv;               // back face (group 5): un-mirror so the text reads from behind too
    for (let i = 20; i < 24; i++) uv.setX(i, 1 - uv.getX(i));
    const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, face, face]);
    mesh.castShadow = true;
    const g = new THREE.Group();
    const th = thread({ length: TG.drop });
    mesh.position.y = -TG.drop - pc.h / 2;
    g.add(th, mesh);
    g.userData = { w: pc.w, h: pc.h, mesh };
    return g;
  }

  // ---------------------------------------------------------------- the mobile
  /**
   * mobile(plan, { tags = true }) -> Group (origin = ROOT PIVOT LOOP; place it at [x, gallery.rootY, z]).
   *   userData.update(t) — sets every arm's pivot slide, tilt, yaw; every load's thread length, lean and visibility;
   *   every plate's scale and yaw. userData.world(id, local?) -> world [x,y,z] of an arm pivot / shape hole
   *   (matrices refreshed first). userData.arms / shapes / loads: the built parts by id.
   */
  function mobile(plan, o = {}) {
    const root = new THREE.Group();
    const A = {}, S = {}, L = {};
    const buildArm = (a) => {
      const parts = arm({ len: a.len, h: a.h, loads: a.loads.map((l) => l.at) });
      A[a.id] = { node: a, ...parts };
      for (const l of a.loads) {
        const hanger = new THREE.Group();
        hanger.position.x = l.at * a.len;
        parts.bar.add(hanger);
        const th = thread();
        th.position.y = -W.loopR * 2;
        hanger.add(th);
        const child = l.child.kind === "arm" ? buildArm(l.child) : buildShape(l.child);
        hanger.add(child);
        L[l.id] = { node: l, hanger, thread: th, child, loop: parts.loops[l.at.toFixed(4)] };
      }
      return parts.group;
    };
    const buildShape = (s) => {
      const g = new THREE.Group(), yaw = new THREE.Group();
      g.add(yaw);
      const p = plate(s.spec, { info: s.info });
      yaw.add(p);
      let tg = null;
      if (s.spec.tag && o.tags !== false) { tg = tag(s.spec.tag, { seed: 5 + Object.keys(S).length }); yaw.add(tg); }
      S[s.id] = { node: s, group: g, yaw, plate: p, tag: tg };
      return g;
    };
    root.add(buildArm(plan.root));

    root.userData.update = (t) => {
      for (const id in A) {
        const a = A[id], st = plan.armAt(a.node, t);
        a.yaw.rotation.y = st.yaw;
        a.tilt.rotation.z = st.tilt;
        a.bar.position.x = -st.p;
      }
      for (const id in L) {
        const l = L[id], ls = plan.loadAt(l.node, t), tilt = plan.armAt(l.node.arm, t).tilt;
        const vis = ls.shown > 0.001;
        l.hanger.visible = vis;
        if (l.loop && Number.isFinite(l.node.from)) l.loop.visible = vis;
        if (!vis) continue;
        l.hanger.rotation.z = -tilt + ls.lag;
        l.thread.userData.setLength(Math.max(0, ls.L - W.loopR * 2));
        l.child.position.y = -ls.L;
        // a newly hung load grows in as it spools out (it slides down its thread from the loop)
        const k = Number.isFinite(l.node.from) || Number.isFinite(l.node.until) ? toEase("outBack")(ls.shown) : 1;
        l.child.scale.setScalar(Math.max(1e-3, k));
      }
      for (const id in S) {
        const s = S[id], ss = plan.shapeAt(s.node, t);
        s.yaw.rotation.y = ss.yaw;
        s.plate.scale.setScalar(ss.scale);
        if (s.tag) s.tag.position.set(s.node.info.bottom[0] * ss.scale, s.node.info.bottom[1] * ss.scale, 0);
      }
    };
    root.userData.world = (id, local = [0, 0, 0]) => {
      const obj = A[id]?.group ?? S[id]?.group;
      obj.updateWorldMatrix(true, false);
      return new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld).toArray();
    };
    root.userData.arms = A; root.userData.shapes = S; root.userData.loads = L; root.userData.plan = plan;
    root.userData.update(0);
    return root;
  }

  // ---------------------------------------------------------------- gallery set
  /** gallery({ wallZ, ceilingY, ... }) -> Group: white wall, concrete floor, shadow-gap reveal, ceiling with a skylight panel. */
  function gallery(o = {}) {
    const g = new THREE.Group(), q = { ...G, ...o };
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(q.wallW, q.wallH), materials.wall);
    wall.position.set(0, q.wallH / 2 + q.shadowGap, q.wallZ);
    wall.receiveShadow = true;
    const gap = new THREE.Mesh(new THREE.BoxGeometry(q.wallW, q.shadowGap, 0.02), materials.shadowGap);
    gap.position.set(0, q.shadowGap / 2, q.wallZ - 0.008);
    const floorD = q.floorD[1] - q.floorD[0];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(q.floorW, floorD), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, q.floorD[0] + floorD / 2);
    floor.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(q.wallW, floorD), materials.ceiling);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, q.ceilingY, q.floorD[0] + floorD / 2);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(q.skylight.w, q.skylight.d), materials.skylight);
    sky.rotation.x = Math.PI / 2; sky.position.set(o.skylightX ?? 0, q.ceilingY - 0.005, q.skylight.z);
    g.add(wall, gap, floor, ceil, sky);
    g.userData = { wall, floor, ceiling: ceil, skylight: sky };
    return g;
  }

  // ---------------------------------------------------------------- the label system (overlay)
  /**
   * wallLabel(stage, beats, { x, y, height, card, dot, colors }) -> Group on the overlay: a museum wall label (white card,
   * coloured square, one line of text), one beat at a time. beats: [{ t, dur, label }]. userData.update(t).
   * The last label holds to the end (holdLast: false to fade it). The in-world tags turn with the plates, so anything
   * that must be READ goes here.
   */
  function wallLabel(stage, beats, o = {}) {
    const LB = { ...spec.label, ...o }, ov = getOverlay(stage), g = new THREE.Group();
    const colors = o.colors ?? [P.red, P.yellow, P.blue, P.black, P.red];
    const font = LB.font, H = LB.height;
    const items = beats.filter((b) => b.label).map((b, i) => {
      const txt = overlayText(b.label, { height: H, weight: LB.weight, tracking: LB.tracking, color: P.labelInk, font });
      const padX = H * LB.pad[0], padY = H * LB.pad[1], dotS = H * 0.42, gapX = H * 0.38;
      const w = padX * 2 + (LB.dot ? dotS + gapX : 0) + txt.userData.w - H * 0.24, h = txt.userData.h * 0.62 + padY * 2;
      const item = new THREE.Group();
      const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: P.labelCard, transparent: true, depthTest: false }));
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.08, depthTest: false }));
      const rule = new THREE.Mesh(new THREE.PlaneGeometry(w, 2 / 1080), new THREE.MeshBasicMaterial({ color: P.labelRule, transparent: true, depthTest: false }));
      const dot = new THREE.Mesh(new THREE.PlaneGeometry(dotS, dotS), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, depthTest: false }));
      card.position.set(w / 2, 0, 0); shadow.position.set(w / 2 + 3 / 1080, -4 / 1080, -0.01);
      rule.position.set(w / 2, -h / 2, 0.005);
      dot.position.set(padX + dotS / 2, 0, 0.01);
      txt.position.set(padX + (LB.dot ? dotS + gapX : 0) + txt.userData.w / 2 - H * 0.12, -H * 0.02, 0.02);
      card.renderOrder = 1; shadow.renderOrder = 0; rule.renderOrder = 2; dot.renderOrder = 3; txt.renderOrder = 4;
      if (!LB.card) { card.visible = false; shadow.visible = false; rule.visible = false; }
      item.add(shadow, card, rule, dot, txt);
      item.userData = { b, w, h, mats: [card.material, shadow.material, rule.material, dot.material, txt.material], base: [1, 0.08, 1, 1, 1] };
      g.add(item);
      return item;
    });
    ov.add(g);
    g.userData.items = items;
    g.userData.update = (t) => {
      const x0 = LB.x * ov.aspect, y0 = LB.y;
      for (const it of items) {
        const { b } = it.userData, off = it === items[items.length - 1] && LB.holdLast !== false ? Infinity : b.t + b.dur - LB.fadeOut - 0.05;
        const a = smoothstep(b.t, b.t + LB.fadeIn, t) * (Number.isFinite(off) ? 1 - smoothstep(off, off + LB.fadeOut, t) : 1);
        it.visible = a > 0.002;
        if (!it.visible) continue;
        const rise = (1 - toEase("outCubic")(clamp((t - b.t) / (LB.fadeIn * 1.6)))) * LB.rise;
        it.position.set(x0, y0 - rise, 0);
        it.userData.mats.forEach((m, k) => { m.opacity = a * it.userData.base[k]; });
      }
    };
    g.userData.update(0);
    return g;
  }

  const props = { hook, thread, wireLoop, arm, plate, tag, mobile, gallery, wallLabel };
  const factories = {
    gallery: (s) => gallery(s.dims ?? {}),
    hook: () => hook(),
  };

  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, sfx: spec.sfx,
    plan: (mobileSpec, events, extra) => mobilePlan(mobileSpec, events, extra),
    motion: balance,
    helpers: { setShadowQuality, wallLabel, paint, shapeInfo: balance.shapeInfo, shapeOutline: balance.shapeOutline },
    setShadowQuality,
  };
}
