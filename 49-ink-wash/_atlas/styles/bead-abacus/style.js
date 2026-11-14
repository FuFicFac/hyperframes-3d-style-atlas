// styles/bead-abacus/style.js — "Bead Abacus": a hardwood counting frame with steel rods and lacquered wooden beads on a
// bright tabletop. Every look number lives in spec.js; every bead move is planned by beads.js (pure, Node-safe).
// Props are synchronous and seeded; time enters only through controller.update(t) / plate.userData.update(...) /
// divider.userData.update(t, at) / caption.userData.show(text, a), which the scene calls from renderAt.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { uploadTexture } from "../../kit/textures.js";
import { contactShadow, RoundedBoxGeometry } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fbm3 } from "../../kit/noise.js";
import { clamp, smoothstep, ease } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as beads from "./beads.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------------------------------------ small helpers
const hexMul = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.round(clamp(((n >> s) & 255) * k, 0, 255)).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitFont(ctx, text, family, weight, px, maxW, minPx) {
  let s = px;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW || s <= minPx) return s;
    s = Math.max(minPx, s * 0.95);
  }
}

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, shape = spec.bead.shape }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  materials.wood.map.anisotropy = 8;

  // ---------------------------------------------------------------------------------------------- surface
  /** surface({ size = 30 }) -> the bright tabletop (receives the soft daylight shadows). */
  function surface(o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 30, o.size ?? 30), materials.surface);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.name = "surface";
    return m;
  }

  // ---------------------------------------------------------------------------------------------- beads
  const geoCache = new Map();
  /**
   * beadGeometry({ shape = "round" | "bicone" | "disc", color = hex, variant = 0 }) -> BufferGeometry (memoised by inputs)
   * A lathe of a superellipse profile with a bore, axis along +X, vertex colours = lacquer paint worn back to bare
   * wood on the rim (seeded per variant).
   */
  function beadGeometry(o = {}) {
    const B = spec.bead, shape = o.shape ?? opts.shape ?? B.shape, color = o.color ?? P.beads[0], variant = o.variant ?? 0;
    const key = `${shape}|${color}|${variant}`;
    if (geoCache.has(key)) return geoCache.get(key);
    const p = B.exponents[shape] ?? 2;
    const pts = [];
    for (let k = 0; k <= B.profile; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / B.profile;
      const c = Math.cos(a), s = Math.sin(a);
      const rx = Math.pow(Math.abs(c), 2 / p), ys = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      pts.push(new THREE.Vector2(B.hole + (B.R - B.hole) * rx, (B.T / 2) * ys));
    }
    pts.push(new THREE.Vector2(B.hole * 0.999, B.T / 2 - 0.0006), new THREE.Vector2(B.hole * 0.999, -B.T / 2 + 0.0006));   // the bore
    const g = new THREE.LatheGeometry(pts, B.radial);
    g.rotateZ(-Math.PI / 2);                                      // lathe axis +Y -> rod axis +X
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const paint = new THREE.Color(color), bare = new THREE.Color(P.bare), c = new THREE.Color();
    const W = B.wear, seed = W.seed + variant * 13;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(y, z), phi = Math.atan2(z, y);
      const rf = clamp((r - B.hole) / (B.R - B.hole));
      const n = fbm3(Math.cos(phi) * W.freq, Math.sin(phi) * W.freq, (x / B.T) * W.freq * 0.6 + variant * 5.3, seed, 3);
      // wear lives on the shoulders (where neighbours knock and fingers push), as sparse chips, never a band
      const sh = Math.abs(x) / (B.T / 2);
      const rim = smoothstep(W.rim, 0.98, rf) * smoothstep(0.25, 0.6, sh);
      const thr = 0.78 - 0.18 * W.amount;
      const worn = rim * smoothstep(thr, thr + 0.05, n);
      const m = 1 + (fbm3(Math.cos(phi) * 2.2, Math.sin(phi) * 2.2, x * 30, seed + 101, 2) - 0.5) * 2 * B.mottle;
      c.copy(paint).multiplyScalar(m).lerp(bare, worn * 0.75);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geoCache.set(key, g);
    return g;
  }
  /** bead({ shape, color, variant }) -> Mesh (axis +X, centred on its bore). */
  function bead(o = {}) {
    const m = new THREE.Mesh(beadGeometry(o), materials.bead);
    m.castShadow = m.receiveShadow = true;
    m.name = "bead";
    return m;
  }
  /** rod({ length }) -> polished steel rod Mesh along +X, centred. */
  function rod(o = {}) {
    const g = new THREE.CylinderGeometry(spec.rod.r, spec.rod.r, o.length ?? 1, 20, 1);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, materials.steel);
    m.castShadow = true; m.receiveShadow = true;
    m.name = "rod";
    return m;
  }

  // ---------------------------------------------------------------------------------------------- nameplates
  /**
   * nameplate({ w = spec.plate.W, d = spec.plate.d, kind = "number" | "label", state }) -> Group
   * A desk nameplate (wooden wedge, cream enamel face sloping toward a high camera). The face is a canvas redrawn
   * only when its state changes and uploaded immediately (uploadTexture), so frames never depend on seek order.
   *   userData.set(state)   number: { main, sub?, color? }  label: { text, swatch? }
   *   userData.update(t, state, since)   set + a small bump `since` s after a change (pass row.lastLand(t))
   */
  function nameplate(o = {}) {
    const Q = spec.plate;
    const w = o.w ?? Q.W, d = o.d ?? Q.d, kind = o.kind ?? "number";
    const slope = Math.atan((Q.h - Q.lip) / (Q.d - Q.top));
    const h = Q.lip + (d - Q.top) * Math.tan(slope);
    const top = Q.top * (d / Q.d);
    const sh = new THREE.Shape();
    sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(d / 2, Q.lip); sh.lineTo(-d / 2 + top, h); sh.lineTo(-d / 2, h); sh.closePath();
    const bev = 0.004;
    const g = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -(w - 2 * bev) / 2);
    g.rotateY(-Math.PI / 2);                                       // shape x -> world z (front = +z), extrusion -> x
    const body = new THREE.Mesh(g, materials.plateBody);
    body.castShadow = body.receiveShadow = true;
    const grp = new THREE.Group();
    grp.add(body);
    // the enamel face on the slope
    const faceL = Math.hypot(d - top, h - Q.lip) - 0.014, faceW = w - 0.022;
    const cw = Q.px, ch = Math.round((Q.px * faceL) / faceW);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(faceW, faceL), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0 }));
    const mid = [(d / 2 + (-d / 2 + top)) / 2, (Q.lip + h) / 2];
    const off = bev + 0.0015;                                      // the bevel pushes the slope out by `bev`
    face.position.set(0, mid[1] + Math.cos(slope) * off, mid[0] + Math.sin(slope) * off);
    face.rotation.x = -(Math.PI / 2 - slope);
    face.receiveShadow = true;
    grp.add(face);
    const cs = contactShadow({ w: w * 1.25, d: d * 1.5, opacity: 0.22, color: "#3a2a1c" });
    grp.add(cs);
    let last = null;
    const draw = (st) => {
      const x = canvas.getContext("2d");
      x.reset?.();
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
      if ("letterSpacing" in x) x.letterSpacing = "0px";
      x.clearRect(0, 0, cw, ch);
      x.fillStyle = P.enamel; x.fillRect(0, 0, cw, ch);
      // a soft enamel sheen and an inset printed rule
      const gr = x.createLinearGradient(0, 0, 0, ch);
      gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(0.5, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(120,100,70,0.10)");
      x.fillStyle = gr; x.fillRect(0, 0, cw, ch);
      x.strokeStyle = "rgba(35,32,28,0.75)"; x.lineWidth = Math.max(3, ch * 0.022);
      rrPath(x, ch * 0.06, ch * 0.08, cw - ch * 0.12, ch * 0.84, ch * 0.08); x.stroke();
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = st.color ?? P.ink;
      if (kind === "number") {
        const mainPx = st.sub ? ch * 0.5 : ch * 0.7;
        const fs = fitFont(x, String(st.main ?? ""), Q.font, Q.weight, mainPx, cw * 0.8, 20);
        x.font = `${Q.weight} ${fs}px ${Q.font}`;
        x.fillText(String(st.main ?? ""), cw / 2, st.sub ? ch * 0.4 : ch * 0.53);
        if (st.sub) {
          x.fillStyle = P.muted;
          const ss = fitFont(x, st.sub, Q.labelFont, 600, ch * 0.22, cw * 0.8, 12);
          x.font = `600 ${ss}px ${Q.labelFont}`;
          x.fillText(st.sub, cw / 2, ch * 0.75);
        }
      } else {
        const text = String(st.text ?? "");
        const sw = st.swatch ? ch * 0.22 : 0;
        const fs = fitFont(x, text, Q.labelFont, Q.weight, ch * 0.4, cw * 0.86 - sw * 2.6, 16);
        x.font = `${Q.weight} ${fs}px ${Q.labelFont}`;
        const tw = x.measureText(text).width, tot = tw + (sw ? sw * 2.6 : 0);
        const x0 = cw / 2 - tot / 2;
        if (sw) {
          x.fillStyle = st.swatch; x.beginPath(); x.arc(x0 + sw, ch * 0.52, sw, 0, Math.PI * 2); x.fill();
          x.strokeStyle = "rgba(35,32,28,0.6)"; x.lineWidth = 2; x.stroke();
        }
        x.fillStyle = P.ink; x.textAlign = "left";
        x.fillText(text, x0 + (sw ? sw * 2.6 : 0), ch * 0.54);
      }
    };
    const set = (st) => {
      const k = JSON.stringify(st);
      if (k === last) return;
      last = k;
      draw(st);
      uploadTexture(stage, tex);
    };
    grp.userData = {
      w, d, h, kind, face, canvas, texture: tex,
      set,
      update(t, st, since = -Infinity) {
        set(st);
        const u = (t - since) / Q.pop.dur;
        const k = u >= 0 && u < 1 ? Q.pop.amp * Math.sin(Math.PI * u) * (1 - u) : 0;
        grp.scale.setScalar(1 + k);
      },
    };
    if (o.state) set(o.state);
    else uploadTexture(stage, tex);
    grp.name = `nameplate-${kind}`;
    return grp;
  }

  // ---------------------------------------------------------------------------------------------- frame
  /**
   * frame({ rows = 3, beads = 10, travel, rowPitch, shape, colors = [hex|index per row], orientation = "horizontal" |
   *   "vertical", labels = [text per row] | false, plates = true | "total" | false, initial = [counts], fives,
   *   plateW, labelW }) -> Group (frame-local: rods along +X, origin = frame centre on the table)
   *   userData: layout (beads.frameLayout), beads[r][i] (meshes), setRow(r, positions s[]), labels[r], plates[r] | total,
   *   rowColor(r), rodWorld(r, s) -> frame-local [x, y, z]
   * Vertical: the group turns +90 degrees about +Y so rods run away from the camera (counted beads near the viewer,
   * bars grow up the screen); tags and plates turn back to face the camera. Needs a wider rowPitch (>= tag width).
   */
  function frame(o = {}) {
    const F = spec.frame, B = spec.bead;
    const vertical = o.orientation === "vertical";
    const plateMode = o.plates === false ? false : o.plates === "total" ? "total" : "rows";
    const L = beads.frameLayout(spec, { rows: o.rows, beads: o.beads, travel: o.travel, rowPitch: o.rowPitch ?? (vertical ? Math.max(F.rowPitch, spec.plate.labelW + 0.04) : undefined), labels: !!o.labels, plates: plateMode === "rows" ? true : plateMode, plateW: o.plateW, labelW: o.labelW });
    const grp = new THREE.Group();
    grp.name = "abacus";
    const depthOut = L.outer.z1 - L.outer.z0, depthIn = L.inner.z1 - L.inner.z0;
    // posts + rails (hardwood, rounded)
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new RoundedBoxGeometry(F.postW, F.postH, depthOut, 3, F.radius), materials.wood);
      post.position.set(sx * (L.L / 2 + F.postW / 2), F.postH / 2, 0);
      post.castShadow = post.receiveShadow = true;
      grp.add(post);
    }
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(L.L + 0.01, F.railH, F.railD, 3, F.radius * 0.8), materials.wood);
      rail.position.set(0, F.railH / 2, sz * (depthIn / 2 + F.railD / 2));
      rail.castShadow = rail.receiveShadow = true;
      grp.add(rail);
    }
    const cs = contactShadow({ w: (L.outer.x1 - L.outer.x0) * 1.08, d: depthOut * 1.14, opacity: F.contact, color: "#3a2a1c" });
    grp.add(cs);
    // rods, brass ferrules and beads
    const colors = (o.colors ?? L.rowZ.map((_, r) => r)).map((c) => (typeof c === "number" ? P.beads[c % P.beads.length] : c));
    const fives = o.fives ?? B.fives;
    const ferruleG = new THREE.CylinderGeometry(0.014, 0.014, 0.006, 20);
    ferruleG.rotateZ(Math.PI / 2);
    const beadRows = [];
    L.rowZ.forEach((z, r) => {
      const rd = rod({ length: L.L + F.postW * 1.2 });
      rd.position.set(0, L.rodY, z);
      grp.add(rd);
      for (const sx of [-1, 1]) {
        const f = new THREE.Mesh(ferruleG, materials.brass);
        f.position.set(sx * (L.L / 2 - 0.003), L.rodY, z);
        grp.add(f);
      }
      const row = [];
      for (let i = 0; i < L.n; i++) {
        const col = fives < 1 && Math.floor(i / 5) % 2 === 1 ? hexMul(colors[r], fives) : colors[r];
        const b = bead({ shape: o.shape, color: col, variant: (i * 7 + r * 3) % B.variants });
        b.position.set(L.inner.x0 + (i + 0.5) * L.pitch, L.rodY, z);
        grp.add(b);
        row.push(b);
      }
      beadRows.push(row);
    });
    const face = vertical ? -Math.PI / 2 : 0;                  // tags / plates turn back toward the camera
    // row tags (labels) and number plates
    const labels = [], plates = [];
    if (o.labels) L.rowZ.forEach((z, r) => {
      if (o.labels[r] == null) return;
      const d = Math.min(spec.plate.d, L.rowPitch - 0.016);
      const tag = nameplate({ kind: "label", w: L.label.w, d, state: { text: o.labels[r], swatch: colors[r] } });
      tag.position.set(L.label.x, 0, z);
      tag.rotation.y = face;
      grp.add(tag);
      labels[r] = tag;
    });
    let total = null;
    if (plateMode === "rows") L.rowZ.forEach((z, r) => {
      const d = Math.min(spec.plate.d, L.rowPitch - 0.016);
      const pl = nameplate({ kind: "number", w: L.plate.w, d, state: { main: String(o.initial?.[r] ?? 0) } });
      pl.position.set(L.plate.x, 0, z);
      pl.rotation.y = face;
      grp.add(pl);
      plates[r] = pl;
    });
    else if (plateMode === "total") {
      total = nameplate({ kind: "number", w: L.plate.w, d: spec.plate.d * 1.4, state: { main: "0" } });
      total.position.set(L.plate.x, 0, 0);
      total.rotation.y = face;
      grp.add(total);
    }
    if (vertical) grp.rotation.y = Math.PI / 2;
    grp.userData = {
      layout: L, beads: beadRows, labels, plates, total, colors,
      rowColor: (r) => colors[r],
      rodWorld: (r, s) => [L.inner.x0 + s, L.rodY, L.rowZ[r]],
      setRow(r, xs) { const row = beadRows[r]; for (let i = 0; i < row.length; i++) row[i].position.x = L.inner.x0 + xs[i]; },
    };
    return grp;
  }

  /** hundredFrame({ shape, colors = [top half, bottom half], plate = true, plateW }) -> frame() with 10 x 10 beads and one total plate. */
  function hundredFrame(o = {}) {
    const c = o.colors ?? [P.beads[0], P.beads[1]];
    return frame({
      rows: 10, beads: 10, rowPitch: spec.hundred.rowPitch, shape: o.shape, travel: o.travel,
      colors: Array.from({ length: 10 }, (_, r) => (r < 5 ? c[0] : c[1])), labels: false, plates: o.plate === false ? false : "total", plateW: o.plateW,
    });
  }

  // ---------------------------------------------------------------------------------------------- controllers
  /**
   * rowController({ frame, row, plan, format = (count) => ({ main: String(count) }) }) -> { update(t) }
   * Reads a beads.planRow plan: bead positions (the pushed block, the clack, the settle) and the row's number plate,
   * which changes on the landing frame and bumps.
   */
  function rowController({ frame: fr, row, plan, format }) {
    const fmt = format ?? ((c) => ({ main: String(c) }));
    const pl = fr.userData.plates[row];
    return {
      plan,
      update(t) {
        fr.userData.setRow(row, plan.positions(t));
        if (pl) pl.userData.update(t, fmt(plan.countAt(t)), plan.lastLand(t));
      },
    };
  }
  /** hundredController({ frame, plan, format = (v) => ({ main: `${v}`, sub: "of 100" }) }) -> { update(t) } for beads.planHundred. */
  function hundredController({ frame: fr, plan, format }) {
    const fmt = format ?? ((v) => ({ main: `${v}`, sub: "of 100" }));
    return {
      plan,
      /** update(t, state?, since?) — state/since override the plate (e.g. switch to a percentage at a beat). */
      update(t, st, since) {
        plan.rows.forEach((R, r) => fr.userData.setRow(r, R.positions(t)));
        if (fr.userData.total) fr.userData.total.userData.update(t, st ?? fmt(plan.valueAt(t)), since ?? plan.lastLand(t));
      },
    };
  }

  // ---------------------------------------------------------------------------------------------- divider
  /**
   * divider({ frame, between: [r, r + 1], nudge = 0 }) — a brass bar resting on the two posts between two rows (marks a line in a
   * 10 x 10 frame or splits groups); or divider({ frame, at: s }) — a bar across the rods at rod position s, raised on
   * two blocks so beads pass under it. Hidden until it drops: userData.update(t, at) (drop + settle, from t).
   */
  function divider(o = {}) {
    const Dv = spec.divider, F = spec.frame;
    const L = o.frame.userData.layout;
    const grp = new THREE.Group();
    let restY;
    if (o.at != null) {
      const len = L.outer.z1 - L.outer.z0;
      const bar = new THREE.Mesh(new RoundedBoxGeometry(Dv.w, Dv.h, len, 2, 0.006), materials.brass);
      restY = F.postH + Dv.h / 2;
      bar.castShadow = true;
      grp.add(bar);
      for (const sz of [-1, 1]) {
        const blk = new THREE.Mesh(new RoundedBoxGeometry(Dv.block, F.postH - F.railH, F.railD * 0.8, 2, 0.006), materials.wood);
        blk.position.set(0, -Dv.h / 2 - (F.postH - F.railH) / 2, sz * (len / 2 - F.railD / 2));
        blk.castShadow = true;
        grp.add(blk);
      }
      grp.position.set(L.inner.x0 + o.at, restY, 0);
    } else {
      const [r0, r1] = o.between ?? [0, 1];
      const len = L.outer.x1 - L.outer.x0;
      const bar = new THREE.Mesh(new RoundedBoxGeometry(len, Dv.h, Dv.w, 2, 0.006), materials.brass);
      bar.castShadow = true;
      grp.add(bar);
      restY = F.postH + Dv.h / 2;
      // nudge (m, +z = toward the viewer): a bar above the rods projects up the screen from a high camera; nudging it
      // by (restY - rodY) / tan(elevation) puts it visually in the gap between the two rows instead of over the far row
      grp.position.set(0, restY, (L.rowZ[r0] + L.rowZ[r1]) / 2 + (o.nudge ?? 0));
    }
    grp.visible = false;
    grp.userData = {
      restY,
      update(t, at) {
        if (!(t >= at)) { grp.visible = false; return; }
        grp.visible = true;
        const u = (t - at) / Dv.dur;
        grp.position.y = restY + (u < 1 ? Dv.drop * (1 - ease.inQuad(u)) : beads.settle(t - at - Dv.dur, { ...spec.slide, bounce: 0.006 }));
      },
      landAt: (at) => at + Dv.dur,
    };
    o.frame.add(grp);
    return grp;
  }

  // ---------------------------------------------------------------------------------------------- overlay
  /** caption() -> overlay card for the beat label: userData.show(text, alpha). One fixed place per scene (spec.caption). */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1400, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = x.measureText(st.text).width, pad = Q.cap * 0.62, bar = 12;
      const pw = Math.min(W - 16, tw + pad * 2 + bar), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = "rgba(60,40,20,0.16)"; rrPath(x, ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = "rgba(35,32,28,0.14)"; x.lineWidth = 2; rrPath(x, ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      x.fillStyle = Q.rule; rrPath(x, ox + 14, oy + 18, bar - 4, ph - 36, 4); x.fill();
      x.textAlign = "left"; x.textBaseline = "middle"; x.fillStyle = Q.ink;
      x.fillText(st.text, ox + bar + pad, oy + ph / 2 + 2);
    }, { upload: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** stamp({ text = "SAMPLE DATA" }) -> overlay rubber-stamp tag (right-aligned at spec.stamp.x), always visible. */
  function stamp(o = {}) {
    const Q = { ...spec.stamp, ...o };
    const Wp = 360, Hp = 64;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H) => {
      x.font = `700 ${Q.cap}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = `${Q.cap * 0.12}px`;
      const tw = x.measureText(Q.text).width + Q.cap * 0.12, pw = tw + Q.cap * 1.1, ph = Q.cap * 1.75;
      const ox = W - pw - 4, oy = (H - ph) / 2;
      x.globalAlpha = 0.9;
      x.strokeStyle = Q.color; x.lineWidth = 3; rrPath(x, ox, oy, pw, ph, 6); x.stroke();
      x.lineWidth = 1.2; rrPath(x, ox + 5, oy + 5, pw - 10, ph - 10, 4); x.stroke();
      x.fillStyle = Q.color; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(Q.text, ox + pw / 2 + Q.cap * 0.06, oy + ph / 2 + 1);
    }, { upload: true });
    mesh.userData.place(Q.x - Wp, Q.y);
    mesh.userData.set({ text: Q.text });
    mesh.userData.opacity(1);
    return mesh;
  }

  const props = { surface, bead, rod, frame, hundredFrame, nameplate, rowController, hundredController, divider, caption, stamp };
  const factories = {
    surface: (o) => surface(o.dims ?? {}),
    frame: (o) => frame(o.dims ?? {}),
    hundredFrame: (o) => hundredFrame(o.dims ?? {}),
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: beads, motion: beads,
    helpers: { beadGeometry, hexMul },
  };
}
