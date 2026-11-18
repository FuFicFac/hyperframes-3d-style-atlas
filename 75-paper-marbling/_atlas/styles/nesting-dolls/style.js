// styles/nesting-dolls/style.js — "Nesting Dolls": lathe-turned, hand-painted wooden nesting dolls on a pale table in
// window daylight. The look lives in spec.js; the profile, the schedule, every pose and every sound event live in
// nest.js (THREE-free planner shared with SCORE). This file turns a plan into pictures: ONE set of unit-height lathe
// geometries (lid, cup, solid) shared by every doll, one painted canvas per level, a gobo window light, an overlay
// caption and the flat colour cover the camera dives through. Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas, getOverlay } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture, woodTexture, paintPixels } from "../../kit/textures.js";
import { hash01, smoothstep, TAU } from "../../kit/time.js";
import * as nest from "./nest.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, N = spec.nest, PT = spec.paint;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- window light (gobo spot = the shadow caster)
  const WN = spec.window;
  const gobo = canvasTexture(paintPixels(256, (u, v) => {
    const bar = (x, n) => { const f = (x * n) % 1, d = Math.min(f, 1 - f) * (1 / n); return smoothstep(WN.bar / 2 / n, WN.bar / 2 / n + WN.soft / n, d); };
    const frame = smoothstep(0.02, 0.02 + WN.soft, Math.min(u, 1 - u, v, 1 - v));
    return WN.dark + (1 - WN.dark) * bar(u, WN.panes[0]) * bar(v, WN.panes[1]) * frame;
  }), { srgb: false, anisotropy: 4 });
  const windowLight = new THREE.SpotLight(WN.color, WN.intensity, 0, WN.angle, WN.penumbra, 0);
  windowLight.name = "window";
  windowLight.position.fromArray(WN.position);
  windowLight.target.position.fromArray(WN.target);
  windowLight.map = gobo;
  windowLight.castShadow = true;
  windowLight.shadow.mapSize.set(WN.shadow.mapSize, WN.shadow.mapSize);
  windowLight.shadow.camera.near = WN.shadow.near; windowLight.shadow.camera.far = WN.shadow.far;
  windowLight.shadow.bias = WN.shadow.bias; windowLight.shadow.normalBias = WN.shadow.normalBias;
  stage.scene.add(windowLight, windowLight.target);
  lights.window = windowLight;

  // ---------------------------------------------------------------- table
  /** table({ size }) -> pale birch table top (kit woodTexture) */
  function table(o = {}) {
    const W = spec.tableWood, size = o.size ?? W.size;
    if (!materials.table.map) {
      materials.table.map = woodTexture({ size: 1024, boards: W.boards, seed: W.seed, dark: W.dark, mid: W.mid, light: W.light, seam: W.seam, contrast: W.contrast, grainFreq: W.grainFreq, repeat: [size / W.tile, size / W.tile] });
      materials.table.needsUpdate = true;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.table);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "table";
    return m;
  }

  // ---------------------------------------------------------------- lathe geometry (analytic normals, v = height)
  /**
   * lathe(points, seg) -> BufferGeometry: [r, y] points turned about Y. The visible side is the one whose normal is
   * (dy, -dr) while walking the points (nest.shellSections is written that way). u = 0.5 faces +Z (the seam is at the back).
   */
  function lathe(points, seg = N.segments) {
    const n = points.length, pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j < n; j++) {
      const a = points[Math.max(0, j - 1)], b = points[Math.min(n - 1, j + 1)];
      let nr = b[1] - a[1], ny = -(b[0] - a[0]);
      const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
      const [r, y] = points[j];
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, phi = Math.PI + u * TAU, s = Math.sin(phi), c = Math.cos(phi);
        pos.push(r * s, y, r * c); nor.push(nr * s, ny, nr * c); uv.push(u, y);
      }
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const SEC = nest.shellSections(N);
  const GEO = {
    cupOuter: lathe(SEC.cupOuter),
    cupInside: mergeGeometries([lathe(SEC.foot), ...SEC.cupInside.map((s) => lathe(s))]),
    lidOuter: lathe(SEC.lidOuter),
    lidInside: mergeGeometries(SEC.lidInside.map((s) => lathe(s))),
    solidOuter: lathe(SEC.solidOuter),
    foot: lathe(SEC.foot),
  };

  // ---------------------------------------------------------------- bare turned wood (inside the shells)
  function bareMap() {
    const cv = makeCanvas(64, 512), x = cv.getContext("2d");
    x.fillStyle = P.wood; x.fillRect(0, 0, 64, 512);
    for (let row = 0; row < 512; row++) {             // lathe marks: faint rings
      const k = hash01(row, 77) - 0.5;
      x.fillStyle = k > 0 ? `rgba(255,244,214,${(k * 0.5).toFixed(3)})` : `rgba(120,78,30,${(-k * 0.34).toFixed(3)})`;
      x.fillRect(0, row, 64, 1);
    }
    return canvasTexture(cv, { anisotropy: 8 });
  }
  materials.bare.map = bareMap(); materials.bare.needsUpdate = true;

  // ---------------------------------------------------------------- the paint: one canvas per level
  /**
   * paintDoll(k, n) -> CanvasTexture. u = around (0.5 = front), v = height. Sizes are in doll heights; widths are
   * corrected by the local radius so circles stay round on the turned surface.
   */
  function paintDoll(k, n) {
    const [W, H] = k === 0 ? PT.canvasBig : PT.canvas, cv = makeCanvas(W, H), x = cv.getContext("2d");
    const body = P.dolls[k % P.dolls.length], accent = P.dolls[(k + 1) % P.dolls.length];
    const X = (u) => u * W, Y = (y) => (1 - y) * H;
    const wpx = (w, y) => (w / (TAU * nest.radiusAt(y))) * W, hpx = (h) => h * H;
    const disc = (u, y, r, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(X(u), Y(y), wpx(r, y), hpx(r), 0, 0, TAU); x.fill(); };
    const D = PT.detail, on = (item) => k <= D[item];
    x.fillStyle = body; x.fillRect(0, 0, W, H);

    if (on("hem")) {                                   // hem: a cream band with a zigzag of the accent colour
      const [y0, y1] = PT.hem.y, nT = PT.hem.teeth;
      x.fillStyle = P.cream; x.fillRect(0, Y(y1), W, Y(y0) - Y(y1));
      x.fillStyle = accent; x.beginPath();
      for (let i = 0; i < nT; i++) { x.moveTo(X(i / nT), Y(y0)); x.lineTo(X((i + 0.5) / nT), Y(y1 - 0.012)); x.lineTo(X((i + 1) / nT), Y(y0)); }
      x.fill();
    }
    if (on("polka")) {                                 // polka dots on the sides and back (the front belongs to the emblem)
      PT.polka.rows.forEach((y, row) => {
        for (let i = 0; i < PT.polka.count; i++) {
          const u = (i + (row % 2) * 0.5) / PT.polka.count;
          if (Math.abs(u - 0.5) < PT.polka.keepOut) continue;
          disc(u, y, PT.polka.r, P.cream);
        }
      });
    }
    if (on("belt")) {                                  // belt under the seam: accent band with cream beads
      const [y0, y1] = PT.belt.y;
      x.fillStyle = accent; x.fillRect(0, Y(y1), W, Y(y0) - Y(y1));
      for (let i = 0; i < PT.belt.dots; i++) disc((i + 0.5) / PT.belt.dots, (y0 + y1) / 2, PT.belt.r, P.cream);
    }
    if (on("collar")) {                                // collar: bunting of triangles hanging from the neck line
      const [y0, y1] = PT.collar.y, nC = PT.collar.count;
      for (let i = 0; i < nC; i++) {
        x.fillStyle = i % 2 ? P.sun : P.cream; x.beginPath();
        x.moveTo(X(i / nC), Y(y1)); x.lineTo(X((i + 1) / nC), Y(y1)); x.lineTo(X((i + 0.5) / nC), Y(y0)); x.fill();
      }
    }
    if (on("cap")) {                                   // cap: accent crown with a scalloped edge
      x.fillStyle = accent; x.fillRect(0, 0, W, Y(PT.cap.y));
      for (let i = 0; i < PT.cap.scallops; i++) disc((i + 0.5) / PT.cap.scallops, PT.cap.y, PT.cap.r, accent);
    }
    if (k < n - 1) {                                   // the seam where lid meets cup
      x.fillStyle = "rgba(43,42,51,0.55)"; x.fillRect(0, Y(N.split) - hpx(PT.seam) / 2, W, hpx(PT.seam));
    }
    // emblem: one ring per doll still inside this one (in that doll's colour), around the yellow dot
    const E = PT.emblem, inside = n - 1 - k;
    disc(0.5, E.y, E.dot + inside * E.ring + E.edge, P.cream);
    for (let j = 0; j < inside; j++) disc(0.5, E.y, E.dot + (inside - j) * E.ring, P.dolls[(k + 1 + j) % P.dolls.length]);
    disc(0.5, E.y, E.dot, P.sun);
    // face: cream disc, two eyes, a smile, two cheeks
    const F = PT.face;
    disc(0.5, F.y, F.r + 0.012, P.ink);
    disc(0.5, F.y, F.r, P.cream);
    const du = (w) => w / (TAU * nest.radiusAt(F.y));
    for (const s of [-1, 1]) {
      disc(0.5 + s * du(F.eye[0]), F.y + F.eye[1], F.eye[2], P.ink);
      disc(0.5 + s * du(F.cheek[0]), F.y - F.cheek[1], F.cheek[2], P.cheek);
    }
    x.strokeStyle = P.ink; x.lineWidth = hpx(F.smile[2]); x.lineCap = "round"; x.beginPath();
    x.ellipse(X(0.5), Y(F.y - F.smile[1] + 0.012), wpx(F.smile[0], F.y), hpx(F.smile[0] * 0.75), 0, 0.12 * Math.PI, 0.88 * Math.PI);
    x.stroke();
    return canvasTexture(cv, { anisotropy: 16 });
  }

  // ---------------------------------------------------------------- one doll
  const mesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.name = name; return m; };
  /**
   * doll(level, n) -> Group (origin at the foot, unit geometry scaled to the level's height).
   *   userData.set(pose, lidPose): pose from plan.dollPose, lidPose from plan.lidPose. userData.lid = the lid group.
   */
  function doll(level, n) {
    const g = new THREE.Group(); g.name = `doll-${level.k}`;
    const paint = materials.paint.clone(); paint.name = `paint-${level.k}`;
    paint.map = paintDoll(level.k, n);
    let lid = null;
    if (level.solid) {
      g.add(mesh(GEO.solidOuter, paint, "solid"), mesh(GEO.foot, materials.bare, "foot"));
    } else {
      g.add(mesh(GEO.cupOuter, paint, "cup"), mesh(GEO.cupInside, materials.bare, "cup-inside"));
      lid = new THREE.Group(); lid.name = "lid";
      lid.add(mesh(GEO.lidOuter, paint, "lid-outer"), mesh(GEO.lidInside, materials.bare, "lid-inside"));
      g.add(lid);
    }
    const H = level.H;
    g.userData.lid = lid; g.userData.level = level; g.userData.paint = paint;
    g.userData.set = (p, lp) => {
      g.visible = p.visible;
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(0, p.turn, p.lean);
      const w = 1 / Math.sqrt(Math.max(0.2, p.sy));
      g.scale.set(H * w, H * p.sy, H * w);
      if (lid && lp) { lid.position.set(lp.x, lp.y, lp.z); lid.rotation.y = lp.turn; }
    };
    return g;
  }

  /** family(plan) -> { group, dolls, update(t) } (adds itself to the scene): every doll posed from the plan */
  function family(plan) {
    const group = new THREE.Group(); group.name = "nesting-dolls";
    const dolls = plan.levels.map((L) => { const d = doll(L, plan.n); group.add(d); return d; });
    stage.scene.add(group);
    const update = (t) => { dolls.forEach((d, k) => d.userData.set(plan.dollPose(k, t), plan.lidPose(k, t))); };
    update(0);
    return { group, dolls, update };
  }

  // ---------------------------------------------------------------- overlay: caption plate and the dive cover
  /** caption() -> overlay plate (cream pill, ink outline, a nested-rings icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const m = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(43,42,51,0.22)"; x.beginPath(); x.roundRect(ox + 3, oy + 9, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, ph / 2 - 2); x.stroke();
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;       // icon: rings inside rings
      [P.dolls[0], P.dolls[1], P.dolls[2], P.sun].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, (ic / 2) * (1 - i * 0.24), 0, TAU); x.fill(); });
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    m.userData.place(Q.x - Wp / 2, Q.y);
    m.userData.show = (text, a) => { m.userData.set({ text }); m.userData.opacity(a); };
    return m;
  }

  /** cover(color = palette.sun) -> full-frame flat colour on the overlay, under the caption; userData.set(alpha) */
  function cover(color = P.sun) {
    const ov = getOverlay(stage);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ov.aspect * 2.02, 2.02), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    m.renderOrder = 5; m.name = "dive-cover"; m.visible = false;
    ov.add(m);
    m.userData.set = (a) => { m.material.opacity = a; m.visible = a > 0.003; };
    return m;
  }

  const props = { table, doll, family, caption, cover };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: nest, motion: nest, geometry: GEO, helpers: { lathe, paintDoll },
  };
}
