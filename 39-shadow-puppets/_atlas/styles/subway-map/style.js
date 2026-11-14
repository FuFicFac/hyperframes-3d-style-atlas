// styles/subway-map/style.js — "Subway Map": a transit diagram made physical.
// createStyle(stage, opts) -> { spec, palette, materials, lights, post, textStyle, camera, props, factories, sfx, plan, helpers }
// Every look number lives in spec.js; timing lives in transit.js (THREE-free planner, also imported by scene.config.js).
// Props are synchronous and seeded; time enters only through userData hooks the scene calls from renderAt.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { clamp, ease } from "../../kit/time.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { screenCanvas, projectToScreen } from "../../kit/overlay.js";
import { pop as popU } from "../../kit/motion.js";
import { makeCanvas } from "../../kit/textures.js";
import * as plan from "./transit.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;

/** Rounded-top cross-section as [b, n, nb, nn] (across, up, normal across, normal up), left bottom -> right bottom. */
function stripProfile(hw, hh, re, arcSeg = 4) {
  const P = [[-hw, 0, -1, 0], [-hw, hh - re, -1, 0]];
  for (let k = 1; k < arcSeg; k++) { const a = Math.PI - (k / arcSeg) * (Math.PI / 2); P.push([-hw + re + Math.cos(a) * re, hh - re + Math.sin(a) * re, Math.cos(a), Math.sin(a)]); }
  P.push([-hw + re, hh, 0, 1], [hw - re, hh, 0, 1]);
  for (let k = 1; k < arcSeg; k++) { const a = Math.PI / 2 - (k / arcSeg) * (Math.PI / 2); P.push([hw - re + Math.cos(a) * re, hh - re + Math.sin(a) * re, Math.cos(a), Math.sin(a)]); }
  P.push([hw, hh - re, 1, 0], [hw, 0, 1, 0]);
  return P;
}

/**
 * stripGeometry(pts [[x,y,z]...] on the XZ plane, { hw, hh, re }) -> BufferGeometry with userData { segs, perSeg }
 *   Indices are ordered SEGMENT BY SEGMENT, so setDrawRange(0, k * perSeg) draws exactly the first k segments
 *   (the depth/shadow pass respects it too — no shader clip needed).
 */
function stripGeometry(pts, { hw, hh, re }) {
  const prof = stripProfile(hw, hh, re);
  const P = prof.length, n = pts.length;
  const pos = new Float32Array(n * P * 3), nor = new Float32Array(n * P * 3), uv = new Float32Array(n * P * 2);
  let S = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const Bx = -tz, Bz = tx; // T x up
    if (i) S += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    for (let j = 0; j < P; j++) {
      const [pb, pn, nb, nn] = prof[j], k = (i * P + j);
      pos[k * 3] = pts[i][0] + Bx * pb; pos[k * 3 + 1] = pts[i][1] + pn; pos[k * 3 + 2] = pts[i][2] + Bz * pb;
      nor[k * 3] = Bx * nb; nor[k * 3 + 1] = nn; nor[k * 3 + 2] = Bz * nb;
      uv[k * 2] = S; uv[k * 2 + 1] = j / (P - 1);
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < P - 1; j++) {
    const a = i * P + j, b = a + 1, c = a + P, d = c + 1;
    idx.push(a, b, c, b, d, c); // front faces outward (B x T = up on the top face)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData = { segs: n - 1, perSeg: (P - 1) * 6 };
  return g;
}

/** Round puck with a rounded top edge (lathe), base at y = 0. */
function puckGeometry(r, h, re, seg = 40) {
  const pts = [new THREE.Vector2(r, 0), new THREE.Vector2(r, h - re)];
  for (let k = 1; k < 5; k++) { const a = (k / 5) * (Math.PI / 2); pts.push(new THREE.Vector2(r - re + Math.cos(a) * re, h - re + Math.sin(a) * re)); }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, seg);
}

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = spec.palette;
  const font = spec.text.stack ?? FONTS.sans;
  const textStyle = { font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const R = spec.route, ST = spec.station, IC = spec.interchange, TR = spec.train, PN = spec.panel;
  const colour = (c, i = 0) => (typeof c === "number" ? pal.lines[c % pal.lines.length] : c ?? pal.lines[i]);
  const enamelCache = new Map();
  const enamel = (hex) => {
    if (!enamelCache.has(hex)) { const m = materials.enamel.clone(); m.color.set(hex); m.name = `enamel ${hex}`; enamelCache.set(hex, m); }
    return enamelCache.get(hex);
  };
  const shadowy = (o, cast = true, receive = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; };
  const popScale = (obj, u, base = 1) => { obj.visible = u > 0.002; obj.scale.setScalar(Math.max(0.001, u) * base); };

  // ---------------------------------------------------------------- panel + table
  /** panel({ w, d, h, dots }) -> Group; panel TOP at y = 0 (routes, stations and trains sit on y = 0). */
  function panel(o = {}) {
    const w = o.w ?? PN.w, d = o.d ?? PN.d, h = o.h ?? PN.h;
    const g = new THREE.Group();
    g.name = "panel";
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, PN.radius), materials.panelEdge);
    body.position.y = -h / 2;
    g.add(body);
    // printed top: off-white with a faint 1 m dot grid (low contrast: a moving camera + fine detail costs bitrate)
    const ppm = 64, cw = Math.round((w - 0.5) * ppm), ch = Math.round((d - 0.5) * ppm);
    const cv = makeCanvas(cw, ch), ctx = cv.getContext("2d");
    ctx.fillStyle = pal.panel; ctx.fillRect(0, 0, cw, ch);
    if (o.dots !== false) {
      ctx.fillStyle = pal.grid;
      const every = PN.dotEvery * ppm, r = PN.dot * ppm;
      const ox = ((cw / 2) % every), oz = ((ch / 2) % every);
      for (let y = oz; y < ch; y += every) for (let x = ox; x < cw; x += every) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const topMat = materials.panel.clone();
    topMat.map = tex; topMat.color.set("#ffffff");
    topMat.polygonOffset = true; topMat.polygonOffsetFactor = -1; topMat.polygonOffsetUnits = -1;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), topMat);
    top.rotation.x = -Math.PI / 2; top.position.y = 0.0005;
    g.add(top);
    shadowy(g, true, true);
    top.castShadow = false;
    g.userData = { w, d, h, top };
    return g;
  }
  const table = (o = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 140, o.size ?? 140), materials.table);
    m.rotation.x = -Math.PI / 2; m.position.y = -(o.h ?? PN.h);
    m.receiveShadow = true;
    return m;
  };

  // ---------------------------------------------------------------- routes
  /**
   * route(routeOrWaypoints, { color, width, height, bend, grid, origin }) -> Group
   *   Accepts a transit.routePath() result or raw grid waypoints. userData: { path, length, at(s), setDraw(s) }
   *   setDraw(s): drawn length in metres from the start (-1 = hidden). Rounded head and tail caps.
   */
  function route(r, o = {}) {
    const path = Array.isArray(r) ? plan.routePath(r, { bend: o.bend ?? R.bend, grid: o.grid, origin: o.origin, step: R.step }) : r;
    const hw = (o.width ?? R.width) / 2, hh = o.height ?? R.height, re = Math.min(R.edge, hh * 0.6);
    const mat = enamel(colour(o.color));
    const geo = stripGeometry(path.pts, { hw, hh, re });
    const strip = new THREE.Mesh(geo, mat);
    const capGeo = puckGeometry(hw, hh, re, 32);
    const tail = new THREE.Mesh(capGeo, mat), head = new THREE.Mesh(capGeo, mat);
    const g = new THREE.Group();
    g.name = "route";
    g.add(strip, tail, head);
    shadowy(g);
    const segLen = path.length / geo.userData.segs;
    const p0 = path.pts[0];
    tail.position.set(p0[0], p0[1], p0[2]);
    const setDraw = (s) => {
      const on = s >= 0;
      g.visible = on;
      if (!on) return;
      const sc = Math.min(s, path.length);
      const k = Math.min(geo.userData.segs, Math.floor(sc / segLen + 1e-6));
      geo.setDrawRange(0, k * geo.userData.perSeg);
      const p = path.at(sc).p;
      head.position.set(p[0], p[1], p[2]);
    };
    setDraw(-1);
    g.userData = { path, length: path.length, at: path.at, setDraw, color: colour(o.color), material: mat };
    return g;
  }

  // ---------------------------------------------------------------- stations + interchanges
  /** station({ r, ring, h }) -> Group (white puck with an ink ring), base on the panel. userData.set(u) = pop scale. */
  function station(o = {}) {
    const r = o.r ?? ST.r, ring = o.ring ?? ST.ring, h = o.h ?? ST.h;
    const g = new THREE.Group();
    g.name = "station";
    const inner = new THREE.Group();
    const inkP = new THREE.Mesh(puckGeometry(r, h, ST.edge), materials.ink);
    const white = new THREE.Mesh(puckGeometry(r - ring, h + 0.012, ST.edge * 0.8), materials.stationWhite);
    inner.add(inkP, white);
    g.add(inner);
    shadowy(g);
    g.userData = { set: (u) => popScale(inner, u), top: h + 0.012, r };
    g.userData.set(0);
    return g;
  }

  /**
   * interchange({ a: [x, z], b: [x, z], r, ring, h }) -> Group: a capsule linking stations on two routes.
   *   userData.set(u, grow = 1): u = pop scale of the first end; grow 0..1 stretches the capsule from a to b.
   */
  function interchange(o) {
    const r = o.r ?? IC.r, ring = o.ring ?? IC.ring, h = o.h ?? IC.h;
    const [ax, az] = o.a, [bx, bz] = o.b;
    const L = Math.hypot(bx - ax, bz - az);
    const g = new THREE.Group();
    g.name = "interchange";
    g.position.set(ax, 0, az);
    g.rotation.y = Math.atan2(-(bz - az), bx - ax); // local +X toward b
    const inner = new THREE.Group();
    g.add(inner);
    const layer = (rad, hh, mat, re) => {
      const bar = new THREE.Mesh(stripGeometry([[0, 0, 0], [1, 0, 0]], { hw: rad, hh, re }), mat);
      const pa = new THREE.Mesh(puckGeometry(rad, hh, re), mat), pb = new THREE.Mesh(puckGeometry(rad, hh, re), mat);
      inner.add(bar, pa, pb);
      return { bar, pb };
    };
    const A = layer(r, h, materials.ink, ST.edge), B = layer(r - ring, h + 0.012, materials.stationWhite, ST.edge * 0.8);
    shadowy(g);
    const set = (u, grow = 1) => {
      popScale(inner, u);
      const l = Math.max(0.001, clamp(grow) * L);
      for (const Ly of [A, B]) { Ly.bar.scale.x = l; Ly.pb.position.x = l; }
    };
    set(0);
    g.userData = { set, length: L, top: h + 0.012 };
    return g;
  }

  // ---------------------------------------------------------------- trains
  /**
   * train({ color, length, width, height }) -> Group: a rounded capsule car (white enamel body, ink window band,
   *   route-colour skirt). userData.place(path, s, dir, grow): sits on top of the station pucks, faces along the route.
   */
  function train(o = {}) {
    const len = o.length ?? TR.length, w = o.width ?? TR.width, h = o.height ?? TR.height;
    const r = w / 2;
    const g = new THREE.Group();
    g.name = "train";
    const inner = new THREE.Group();
    g.add(inner);
    // body: flatten vertically by scaling the parent of the rotated capsule
    const body = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 24), materials.trainBody);
    bm.rotation.z = Math.PI / 2;
    body.add(bm); body.scale.y = h / w; body.position.y = h / 2;
    const band = new THREE.Group();
    const wm = new THREE.Mesh(new THREE.CapsuleGeometry(r * 1.035, Math.max(0.01, len - 2 * r) * 0.96, 6, 24), materials.trainWindow);
    wm.rotation.z = Math.PI / 2;
    band.add(wm); band.scale.y = (TR.window / w); band.position.y = h * 0.6;
    const skirt = new THREE.Group();
    const sm = new THREE.Mesh(new THREE.CapsuleGeometry(r * 1.03, Math.max(0.01, len - 2 * r) * 0.99, 6, 24), enamel(colour(o.color)));
    sm.rotation.z = Math.PI / 2;
    skirt.add(sm); skirt.scale.y = 0.05 / w; skirt.position.y = h * 0.26;
    inner.add(body, band, skirt);
    shadowy(g, true, false);
    const lift = o.lift ?? TR.lift; // rides on the strip; at a stop it sits down into the station puck
    g.userData = {
      place(path, s, dir = 1, grow = 1) {
        const { p, t } = path.at(s);
        g.position.set(p[0], lift, p[2]);
        g.rotation.y = Math.atan2(-t[2] * dir, t[0] * dir);
        popScale(inner, grow);
      },
    };
    return g;
  }

  // ---------------------------------------------------------------- "you are here" pin
  /** youAreHere({ color, ring }) -> Group: ink pin with a coloured head + pulse ring on the panel. userData.update(t, at, { period }) */
  function youAreHere(o = {}) {
    const g = new THREE.Group();
    g.name = "youAreHere";
    const pin = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.9, 16), materials.ink);
    stem.position.y = 0.45;
    const headMat = enamel(o.color ?? pal.pinRing);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), headMat);
    head.position.y = 0.98;
    const collar = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), materials.stationWhite);
    collar.position.set(-0.07, 1.05, 0.13);
    pin.add(stem, head, collar);
    shadowy(pin, true, false);
    const ringMat = new THREE.MeshBasicMaterial({ color: o.ring ?? pal.pinRing, transparent: true, opacity: 0.6, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 64), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.renderOrder = 2;
    g.add(pin, ring);
    g.userData = {
      update(t, at, { period = 1.1, drop = 1.6, dur = 0.5 } = {}) {
        const u = clamp((t - at) / dur);
        g.visible = t >= at;
        const y = (1 - ease.outBounce(u)) * drop;
        pin.position.y = y;
        pin.scale.setScalar(Math.max(0.001, Math.min(1, (t - at) / 0.12)));
        const k = t - at - dur;
        if (k < 0) { ring.visible = false; return; }
        const ph = (k % period) / period;
        ring.visible = true;
        ring.position.y = 0.004 - g.position.y; // on the panel, under the strips (the pin itself stands on the station top)
        ring.scale.setScalar(0.6 + ph * 1.4);
        ringMat.opacity = 0.65 * (1 - ph);
      },
    };
    g.userData.update(-1, 0);
    return g;
  }

  // ---------------------------------------------------------------- legend / key plate (in-world)
  /**
   * legend({ items: [{ color, text }], title = "KEY", w, row, cap }) -> Group: a raised white plate lying on the panel
   *   with a mini enamel strip + printed name per route. Origin = plate centre; userData.set(u) rises it in.
   */
  function legend(o = {}) {
    const items = o.items ?? [];
    const row = o.row ?? 0.62, cap = o.cap ?? 0.36, w = o.w ?? 5.2, pad = 0.42;
    const d = pad * 2 + (o.title !== null ? row * 0.95 : 0) + items.length * row;
    const g = new THREE.Group();
    g.name = "legend";
    const inner = new THREE.Group();
    g.add(inner);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.1, d, 3, 0.08), materials.plate);
    plate.position.y = 0.05;
    inner.add(plate);
    let z = -d / 2 + pad;
    const flat = (lab, x, zz) => { lab.rotation.x = -Math.PI / 2; lab.position.set(x, 0.102, zz); lab.castShadow = false; inner.add(lab); return lab; };
    if (o.title !== null) {
      const t = createTextLabel(o.title ?? "KEY", { ...textStyle, height: cap * 0.8, weight: 800, letterSpacing: 6, padding: 0.05 });
      flat(t, -w / 2 + pad + t.scale.x / 2, z + row * 0.4);
      t.material.toneMapped = true;
      z += row * 0.95;
    }
    for (const it of items) {
      const sw = 1.1;
      const strip = new THREE.Mesh(stripGeometry([[0, 0, 0], [sw, 0, 0]], { hw: 0.13, hh: 0.05, re: 0.02 }), enamel(colour(it.color)));
      strip.position.set(-w / 2 + pad, 0.1, z + row * 0.45);
      const caps = [0, sw].map((x) => { const c = new THREE.Mesh(puckGeometry(0.13, 0.05, 0.02, 24), enamel(colour(it.color))); c.position.set(-w / 2 + pad + x, 0.1, z + row * 0.45); return c; });
      inner.add(strip, ...caps);
      const lab = createTextLabel(it.text, { ...textStyle, height: cap, padding: 0.05 });
      lab.material.toneMapped = true;
      flat(lab, -w / 2 + pad + sw + 0.35 + lab.scale.x / 2, z + row * 0.45);
      z += row;
    }
    shadowy(plate);
    g.userData = { w, d, set: (u) => { inner.visible = u > 0.002; inner.scale.setScalar(Math.max(0.001, u)); } };
    g.userData.set(0);
    return g;
  }

  // ---------------------------------------------------------------- labels (overlay: exact colours, never blurred)
  const W = stage.width, H = stage.height;
  const fontPx = (px, wgt = 700) => `${wgt} ${px}px ${font}`;
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const fadeIO = (t, on, off, inD = 0.3, outD = 0.3) => clamp(Math.min((t - on) / inD, (off - t) / outD));

  /**
   * sign({ x, y, px }) -> overlay Mesh: the beat caption as a station sign — white pill, a short route-colour strip
   *   with a white station dot, an optional step number, then the text. ONE fixed region per scene.
   *   userData.update(t, { on, off, text, color, n })
   */
  function sign(o = {}) {
    const px = o.px ?? spec.text.signPx, Hc = Math.round(px * 2.3), Wc = Math.round(px * 19);
    const m = screenCanvas(stage, Wc, Hc, (ctx, w, h, s) => {
      if (!s.text) return;
      ctx.font = fontPx(px, 700);
      const tw = ctx.measureText(s.text).width;
      const lead = px * 2.9, nW = s.n != null ? px * 1.05 : 0;
      const bw = Math.min(w - 8, lead + nW + tw + px * 0.9), bh = h - 14;
      ctx.save(); ctx.shadowColor = "rgba(20,24,28,0.22)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = pal.white; rr(ctx, 4, 4, bw, bh, bh / 2); ctx.fill(); ctx.restore();
      // route strip + station dot
      const cy = 4 + bh / 2;
      ctx.lineCap = "round"; ctx.strokeStyle = s.color; ctx.lineWidth = px * 0.42;
      ctx.beginPath(); ctx.moveTo(4 + bh * 0.42, cy); ctx.lineTo(4 + lead - px * 0.35, cy); ctx.stroke();
      ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(4 + lead * 0.52, cy, px * 0.36, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.white; ctx.beginPath(); ctx.arc(4 + lead * 0.52, cy, px * 0.22, 0, TAU); ctx.fill();
      let x = 4 + lead;
      if (s.n != null) { ctx.font = fontPx(px * 0.62, 800); ctx.fillStyle = s.color; ctx.textBaseline = "middle"; ctx.fillText(String(s.n).padStart(2, "0"), x, cy + 1); x += nW; }
      ctx.font = fontPx(px, 700); ctx.fillStyle = pal.ink; ctx.textBaseline = "middle"; ctx.fillText(s.text, x, cy + px * 0.04);
    });
    const ox = o.x ?? 0.055 * W, oy = o.y ?? 0.075 * H;
    m.userData.update = (t, c) => {
      const a = fadeIO(t, c.on, c.off, c.inDur ?? 0.35, c.outDur ?? 0.3);
      if (a <= 0) { m.userData.opacity(0); return; }
      m.userData.set({ text: c.text, color: c.color, n: c.n });
      const slide = (1 - ease.outCubic(clamp((t - c.on) / 0.4))) * -24;
      m.userData.place(ox + slide, oy);
      m.userData.opacity(a);
    };
    m.userData.opacity(0);
    return m;
  }

  /**
   * tag(text, { kind: "name" | "here", px }) -> overlay Mesh anchored to a 3D point (station name / "you are here").
   *   userData.update(t, { on, off, anchor: [x,y,z], dx, dy (px from the anchor), align: "left"|"right"|"center" })
   */
  function tag(text, o = {}) {
    const kind = o.kind ?? "name", px = o.px ?? spec.text.tagPx;
    const probe = makeCanvas(8, 8).getContext("2d");
    probe.font = fontPx(px, kind === "here" ? 800 : 700);
    const tw = Math.ceil(probe.measureText(text).width);
    const Wc = tw + Math.round(px * 1.4) + 8, Hc = Math.round(px * 1.75) + 8;
    const m = screenCanvas(stage, Wc, Hc, (ctx, w, h) => {
      ctx.font = fontPx(px, kind === "here" ? 800 : 700);
      ctx.save(); ctx.shadowColor = "rgba(20,24,28,0.18)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = kind === "here" ? (o.color ?? pal.ink) : pal.white;
      rr(ctx, 4, 4, w - 8, h - 8, (h - 8) / 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = kind === "here" ? pal.white : pal.ink; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.fillText(text, w / 2, h / 2 + px * 0.04);
    });
    m.userData.set({ text });
    m.userData.update = (t, c) => {
      const a = fadeIO(t, c.on, c.off ?? Infinity, c.inDur ?? 0.3, c.outDur ?? 0.3);
      if (a <= 0) { m.userData.opacity(0); return; }
      const p = projectToScreen(stage, c.anchor);
      const sx = (p.x * 0.5 + 0.5) * W, sy = (0.5 - p.y * 0.5) * H;
      const al = c.align ?? "left";
      const x0 = al === "left" ? sx + (c.dx ?? 18) : al === "right" ? sx - Wc - (c.dx ?? 18) : sx - Wc / 2 + (c.dx ?? 0);
      const rise = (1 - ease.outCubic(clamp((t - c.on) / 0.35))) * 10;
      m.userData.place(x0, sy - Hc / 2 + (c.dy ?? 0) + rise);
      m.userData.opacity(p.behind ? 0 : a);
    };
    m.userData.opacity(0);
    return m;
  }

  const props = { panel, table, route, station, interchange, train, youAreHere, legend, sign, tag };
  return {
    spec,
    palette: pal,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {},
    sfx: spec.sfx,
    plan,
    motion: plan,
    helpers: { enamel, colour, stripGeometry, puckGeometry, popU },
  };
}
