// styles/mixing-console/style.js — "Mixing Console": a vintage analogue recording console, close and low across its
// surface. Every look number lives in spec.js; every control position, meter reading and sound comes from mixplan.js
// (pure, Node-safe). Props are synchronous and seeded; time enters only through userData.set(...) hooks and
// mixController(...).update(t), which the scene calls from renderAt.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { uploadTexture } from "../../kit/textures.js";
import { RoundedBoxGeometry, contactShadow } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { depthOfField as kitDepthOfField } from "../../kit/studio.js";
import { hash01, clamp, lerp } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as plan from "./mixplan.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------------------------------------ small helpers
const ctx2d = (c) => c.getContext("2d", { willReadFrequently: true });   // deterministic text raster (see brief)
function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w); c.height = Math.round(h);
  return c;
}
function texOf(canvas, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function rrPath(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}
const rgb = (hex) => new THREE.Color(hex);

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, dof = false } (dof: kit BokehPass — see STYLE.md limits)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, C = spec.console, Z = spec.strip.z, X = spec.strip.x;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const dof = !opts.dof || !post ? { pass: null, setFocus() {} } : kitDepthOfField(stage, { ...spec.dof });
  if (materials.walnut.map) materials.walnut.map.anisotropy = 8;
  if (materials.wall.map) { materials.wall.map.wrapS = materials.wall.map.wrapT = THREE.RepeatWrapping; materials.wall.map.repeat.set(3, 1); }

  // ---------------------------------------------------------------------------------------------- faceplate artwork
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const COND = '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif';
  /** brushed aluminium base: fine streaks along the strip (canvas columns), seeded */
  function brushed(x, w, h, seed) {
    const B = C.brush;
    x.fillStyle = P.alu; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i++) {
      const a = (hash01(i, seed) - 0.5) * 2 * B.streak + (hash01(Math.floor(i / 7), seed + 3) - 0.5) * B.streak;
      x.fillStyle = a > 0 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(40,36,30,${(-a).toFixed(3)})`;
      x.fillRect(i, 0, 1, h);
    }
    // a few long scuffs
    for (let k = 0; k < 6; k++) {
      const cx = hash01(k, seed + 11) * w, y0 = hash01(k, seed + 12) * h, len = h * (0.1 + 0.25 * hash01(k, seed + 13));
      x.fillStyle = `rgba(255,255,255,${(B.fine * (0.6 + hash01(k, seed + 14))).toFixed(3)})`;
      x.fillRect(Math.round(cx), Math.round(y0), 1, Math.round(len));
    }
  }
  function screw(x, cx, cy, r, seed) {
    const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#e9e7e2"); g.addColorStop(1, "#7d7a74");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "rgba(30,28,25,0.7)"; x.lineWidth = Math.max(1.5, r * 0.25);
    const a = hash01(seed, 5) * Math.PI;
    x.beginPath(); x.moveTo(cx - Math.cos(a) * r * 0.7, cy - Math.sin(a) * r * 0.7); x.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); x.stroke();
  }
  /** knob scale: tick ring + end dots around a knob centre (canvas px) */
  function knobTicks(x, cx, cy, ppm, kind) {
    const K = spec.knob, r0 = (K.skirt.r + 0.003) * ppm, r1 = (K.skirt.r + 0.0065) * ppm;
    x.strokeStyle = P.legend; x.lineWidth = Math.max(2, 0.0007 * ppm);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = -K.range / 2 + (K.range * i) / (n - 1);
      const big = i === 0 || i === n - 1 || i === (n - 1) / 2;
      const rr = big ? r1 + 0.002 * ppm : r1;
      x.beginPath(); x.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); x.lineTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); x.stroke();
    }
    if (kind !== "gain") {   // centre detent mark for the bipolar knobs
      x.fillStyle = P.legendRed; x.beginPath(); x.arc(cx, cy - r1 - 0.0045 * ppm, 0.0012 * ppm, 0, Math.PI * 2); x.fill();
    }
  }
  /** stripArtwork({ number, master }) -> CanvasTexture of one channel faceplate (legends, fader scale, LED window) */
  function stripArtwork(o = {}) {
    const ppm = C.ppm, w = (o.width ?? C.stripW) * ppm, h = C.depth * ppm;
    const cv = newCanvas(w, h), x = ctx2d(cv);
    const zy = (z) => Math.round((z + C.depth / 2) * ppm);            // panel z -> canvas y (top = back)
    const xx = (xl) => Math.round((xl + (o.width ?? C.stripW) / 2) * ppm);
    brushed(x, cv.width, cv.height, 31 + (o.number ?? 0) * 17);
    // separator grooves + screws
    x.fillStyle = "rgba(25,22,18,0.55)"; x.fillRect(0, 0, 3, cv.height); x.fillStyle = "rgba(255,255,255,0.35)"; x.fillRect(3, 0, 2, cv.height);
    screw(x, cv.width / 2, zy(-C.depth / 2 + 0.018), 0.0042 * ppm, (o.number ?? 0) * 2 + 1);
    screw(x, cv.width / 2, zy(C.depth / 2 - 0.012 - C.tapeH), 0.0042 * ppm, (o.number ?? 0) * 2 + 2);
    x.textAlign = "center"; x.textBaseline = "middle";
    const label = (text, xl, z, size, color = P.legend, font = COND, weight = 700) => {
      x.font = `${weight} ${Math.round(size * ppm)}px ${font}`;
      x.fillStyle = color;
      x.fillText(text, xx(xl), zy(z));
    };
    if (o.master) return masterArtwork(cv, x, zy, xx, label, ppm);
    // channel number badge (top)
    x.fillStyle = P.legend; rrPath(x, xx(-0.017), zy(-0.452), 0.034 * ppm, 0.022 * ppm, 0.004 * ppm); x.fill();
    label(String(o.number ?? ""), 0, -0.441, 0.016, P.alu, SANS);
    // knobs: legend above-left, tick ring
    for (const k of spec.strip.knobs) {
      knobTicks(x, xx(X.knob), zy(Z[k]), ppm, k);
      label(spec.strip.legends[k], -0.05, Z[k] - 0.012, 0.0095, k === "gain" ? P.legendRed : P.legend);
    }
    label("EQ", 0.052, Z.mid, 0.0085, P.legend);
    x.strokeStyle = P.legend; x.lineWidth = 2; x.beginPath(); x.moveTo(xx(0.052), zy(Z.hi - 0.02)); x.lineTo(xx(0.052), zy(Z.mid - 0.015)); x.moveTo(xx(0.052), zy(Z.mid + 0.015)); x.lineTo(xx(0.052), zy(Z.lo + 0.02)); x.stroke();
    // buttons: printed wells + legends
    for (const [k, xl] of [["MUTE", X.mute], ["SOLO", X.solo]]) {
      x.fillStyle = "rgba(20,18,16,0.85)"; const s = (spec.button.size + 0.005) * ppm;
      rrPath(x, xx(xl) - s / 2, zy(Z.buttons) - s / 2, s, s, 0.004 * ppm); x.fill();
      label(k, xl, Z.buttons + 0.024, 0.0078);
    }
    // fader: scale, numbers (dB, printed scale — not data), slot well
    const law = spec.mix.law;
    const zAt = (pos) => lerp(Z.faderBottom, Z.faderTop, pos);
    const sx = X.fader;
    x.fillStyle = "rgba(15,14,12,0.9)"; rrPath(x, xx(sx) - 0.0065 * ppm, zy(Z.faderTop - 0.016), 0.013 * ppm, (Z.faderBottom - Z.faderTop + 0.032) * ppm, 0.006 * ppm); x.fill();
    const marks = [10, 5, 0, -5, -10, -20, -30, -40, -60];
    x.strokeStyle = P.legend; x.lineWidth = Math.max(2, 0.0006 * ppm);
    for (const db of marks) {
      const z = zAt(plan.posForDb(db, law));
      const big = db === 0;
      x.beginPath(); x.moveTo(xx(sx - 0.0105), zy(z)); x.lineTo(xx(sx - (big ? 0.022 : 0.016)), zy(z)); x.stroke();
      x.beginPath(); x.moveTo(xx(sx + 0.0105), zy(z)); x.lineTo(xx(sx + (big ? 0.022 : 0.016)), zy(z)); x.stroke();
      label(db > 0 ? `+${db}` : db === 0 ? "0" : String(-db), sx - 0.03, z, 0.0082, big ? P.legendRed : P.legend);
    }
    label("∞", sx - 0.03, zAt(0.0) - 0.002, 0.011);
    // LED window
    const L = spec.led, zTop = Z.faderBottom - 0.025 - (L.n - 1) * (L.segH + L.gap) - L.segH / 2 - 0.004;
    x.fillStyle = "rgba(12,12,11,0.95)"; rrPath(x, xx(X.led) - (L.w / 2 + 0.003) * ppm, zy(zTop), (L.w + 0.006) * ppm, (Z.faderBottom - 0.025 + L.segH / 2 + 0.004 - zTop) * ppm, 0.003 * ppm); x.fill();
    return texOf(cv);
  }
  function masterArtwork(cv, x, zy, xx, label, ppm) {
    const W = C.masterW, M = masterLayout();
    label("MASTER", M.fader - W / 2 + W / 2 - W / 2 + 0.0, -0.44, 0.014, P.legend, COND);
    // master fader scale (same law)
    const law = spec.mix.law, zAt = (pos) => lerp(Z.faderBottom, Z.faderTop, pos), sx = M.fader;
    x.fillStyle = "rgba(15,14,12,0.9)"; rrPath(x, xx(sx) - 0.0065 * ppm, zy(Z.faderTop - 0.016), 0.013 * ppm, (Z.faderBottom - Z.faderTop + 0.032) * ppm, 0.006 * ppm); x.fill();
    x.strokeStyle = P.legend; x.lineWidth = Math.max(2, 0.0006 * ppm);
    for (const db of [10, 5, 0, -5, -10, -20, -30, -40, -60]) {
      const z = zAt(plan.posForDb(db, law));
      x.beginPath(); x.moveTo(xx(sx + 0.0105), zy(z)); x.lineTo(xx(sx + (db === 0 ? 0.024 : 0.017)), zy(z)); x.stroke();
      label(db > 0 ? `+${db}` : db === 0 ? "0" : String(-db), sx + 0.034, z, 0.0082, db === 0 ? P.legendRed : P.legend);
    }
    // stereo LED windows + L / R
    const L = spec.led, zTop = Z.faderBottom - 0.025 - (L.n - 1) * (L.segH + L.gap) - L.segH / 2 - 0.004;
    for (const [k, xl] of [["L", M.ledL], ["R", M.ledR]]) {
      x.fillStyle = "rgba(12,12,11,0.95)"; rrPath(x, xx(xl) - (L.w / 2 + 0.003) * ppm, zy(zTop), (L.w + 0.006) * ppm, (Z.faderBottom - 0.025 + L.segH / 2 + 0.004 - zTop) * ppm, 0.003 * ppm); x.fill();
      label(k, xl, Z.faderBottom + 0.004, 0.009);
    }
    // jog ring print + transport legends (icons)
    x.strokeStyle = "rgba(30,28,25,0.5)"; x.lineWidth = 3; x.beginPath(); x.arc(xx(M.jog[0]), zy(M.jog[1]), (spec.jog.r + 0.008) * ppm, 0, Math.PI * 2); x.stroke();
    label("SHUTTLE", M.jog[0], M.jog[1] - spec.jog.r - 0.018, 0.0085);
    const icon = (k, cx, cy, s) => {
      x.fillStyle = P.legend;
      if (k === "rew") { for (const o of [-0.5, 0.5]) { x.beginPath(); x.moveTo(cx + o * s + s * 0.5, cy - s * 0.5); x.lineTo(cx + o * s - s * 0.5, cy); x.lineTo(cx + o * s + s * 0.5, cy + s * 0.5); x.fill(); } }
      if (k === "play") { x.beginPath(); x.moveTo(cx - s * 0.45, cy - s * 0.55); x.lineTo(cx + s * 0.6, cy); x.lineTo(cx - s * 0.45, cy + s * 0.55); x.fill(); }
      if (k === "stop") x.fillRect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
    };
    M.transport.forEach((b) => {
      x.fillStyle = "rgba(20,18,16,0.85)"; const s = (spec.button.size + 0.005) * ppm;
      rrPath(x, xx(b.x) - s / 2, zy(b.z) - s / 2, s, s, 0.004 * ppm); x.fill();
      icon(b.icon, xx(b.x), zy(b.z + 0.025), 0.009 * ppm);
    });
    // aux knobs
    M.aux.forEach((a, i) => { knobTicks(x, xx(a.x), zy(a.z), ppm, "gain"); label(a.label, a.x, a.z - 0.034, 0.0085); });
    return texOf(cv);
  }
  /** master section positions (master-local x, panel z) */
  function masterLayout() {
    const W = C.masterW;
    return {
      fader: -W / 2 + 0.075, ledL: -W / 2 + 0.03, ledR: -W / 2 + 0.047,
      jog: [0.075, 0.24],
      transport: [{ icon: "rew", x: 0.02, z: 0.06 }, { icon: "play", x: 0.075, z: 0.06 }, { icon: "stop", x: 0.13, z: 0.06 }],
      aux: [
        { label: "AUX 1", x: 0.03, z: -0.14 }, { label: "AUX 2", x: 0.12, z: -0.14 },
        { label: "RETURN", x: 0.03, z: -0.3 }, { label: "PHONES", x: 0.12, z: -0.3 },
      ],
      vu: -W / 2 + 0.125, eq: W / 2 - 0.1,
    };
  }

  // ---------------------------------------------------------------------------------------------- controls
  /** knob({ color, kind }) -> Group (panel-local; up = panel normal). userData.set(angle) — angle from mixplan (rad, + = clockwise). */
  const capMats = new Map();
  function knob(o = {}) {
    const K = spec.knob, color = o.color ?? P.knobs[o.kind ?? "gain"] ?? P.knobs.gain;
    if (!capMats.has(color)) capMats.set(color, new THREE.MeshPhysicalMaterial({ color, metalness: 0, ...K.capFinish }));
    const g = new THREE.Group();
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(K.skirt.r, K.skirt.r * 1.04, K.skirt.h, 40), materials.skirt);
    skirt.position.y = K.skirt.h / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(K.cap.rTop, K.cap.r, K.cap.h, 40), capMats.get(color));
    cap.position.y = K.skirt.h + K.cap.h / 2;
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(K.pointer.w, K.pointer.h, K.cap.rTop * 0.95), materials.pointer);
    ptr.position.set(0, K.skirt.h + K.cap.h + K.pointer.h / 2 - 0.0002, -K.cap.rTop * 0.48);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(K.pointer.w * 1.2, K.skirt.h * 0.9, 0.004), materials.pointer);   // skirt index line
    tick.position.set(0, K.skirt.h / 2, -K.skirt.r - 0.0005);
    for (const m of [skirt, cap, ptr]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(skirt, cap, ptr, tick);
    g.userData.set = (a) => { g.rotation.y = -a; };
    g.name = `knob-${o.kind ?? "gain"}`;
    return g;
  }
  /** angle for a knob value (mixplan detented value -> rad, + = clockwise from 12 o'clock) */
  const knobAngle = (kind, v) => { const D = spec.knob.kinds[kind] ?? spec.knob.kinds.gain; return ((v - D.min) / (D.max - D.min) - 0.5) * spec.knob.range; };

  /** fader({ master }) -> Group: slot + cap on a stem; userData.set(pos 0..1) */
  function fader(o = {}) {
    const F = spec.fader, throwL = Z.faderBottom - Z.faderTop;
    const g = new THREE.Group();
    const slot = new THREE.Mesh(new THREE.BoxGeometry(F.slot.w, F.slot.d, throwL + F.cap.d), materials.slot);
    slot.position.set(0, -F.slot.d / 2 + 0.0003, (Z.faderBottom + Z.faderTop) / 2);
    g.add(slot);
    const cap = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(F.cap.w, F.cap.h, F.cap.d, 3, F.cap.radius), o.master ? materials.faderMaster : materials.faderCap);
    body.position.y = F.cap.h / 2 + 0.004;
    const line = new THREE.Mesh(new THREE.BoxGeometry(F.cap.w * 0.98, 0.0008, F.line), materials.pointer);
    line.position.y = F.cap.h + 0.004 + 0.0002;
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.006, 0.008), materials.slot);
    stem.position.y = 0.002;
    body.castShadow = body.receiveShadow = true;
    cap.add(body, line, stem);
    g.add(cap);
    g.userData = { cap, set(pos) { cap.position.z = lerp(Z.faderBottom, Z.faderTop, clamp(pos, -0.02, 1.02)); } };
    g.userData.set(0);
    g.name = o.master ? "fader-master" : "fader";
    return g;
  }

  /** litButton({ color, label }) -> Group: square lens cap; userData.set(on, press 0..1). Own material (emissive when lit). */
  function litButton(o = {}) {
    const Bt = spec.button, color = o.color ?? P.mute;
    const mat = new THREE.MeshStandardMaterial({ color: rgb(color).multiplyScalar(Bt.dim), roughness: 0.3, metalness: 0, emissive: rgb(color), emissiveIntensity: Bt.unlit });
    const g = new THREE.Group();
    const cap = new THREE.Mesh(new RoundedBoxGeometry(Bt.size, Bt.h, Bt.size, 3, Bt.radius), mat);
    cap.castShadow = true; cap.receiveShadow = true;
    g.add(cap);
    g.userData = {
      material: mat,
      set(on, press = 0) {
        cap.position.y = Bt.h / 2 - Bt.depth * press - (on ? Bt.latch : 0) + 0.001;
        mat.emissiveIntensity = on ? Bt.lit : Bt.unlit;
      },
    };
    g.userData.set(false, 0);
    g.name = "button";
    return g;
  }

  /** ledBar({ n }) -> InstancedMesh column (panel-local, segment 0 nearest the viewer); userData.set(lit, peak) (segments, fractional) */
  function ledBar(o = {}) {
    const L = spec.led, F = spec.mix.ledFace, n = o.n ?? L.n;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(L.w, L.d, L.segH), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const m4 = new THREE.Matrix4();
    const cols = [];
    for (let i = 0; i < n; i++) {
      m4.makeTranslation(0, L.d / 2 - 0.001, Z.faderBottom - 0.025 - i * (L.segH + L.gap));
      mesh.setMatrixAt(i, m4);
      cols.push(rgb(i >= F.red ? P.led.red : i >= F.amber ? P.led.amber : P.led.green));
      mesh.setColorAt(i, cols[i].clone().multiplyScalar(L.off));
    }
    mesh.instanceMatrix.needsUpdate = true;
    const c = new THREE.Color();
    mesh.userData = {
      set(lit, peak = -1) {
        const pk = Math.floor(peak - 1e-6);
        for (let i = 0; i < n; i++) {
          const f = clamp(lit - i, 0, 1);
          const k = i === pk && f < 0.5 ? L.peakLit : L.off + (L.lit - L.off) * (f > 0.5 ? 1 : f * 0.6);
          mesh.setColorAt(i, c.copy(cols[i]).multiplyScalar(k));
        }
        mesh.instanceColor.needsUpdate = true;
      },
    };
    mesh.userData.set(0);
    mesh.name = "led-bar";
    return mesh;
  }

  /** vuFaceTexture({ w, h, label }) -> CanvasTexture: cream face, arc scale, red zone, "VU" */
  function vuFaceTexture(o) {
    const V = spec.vu, F = spec.mix.vuFace;
    const pw = V.px, ph = Math.round((V.px * o.h) / o.w), s = pw / o.w;   // px per metre
    const cv = newCanvas(pw, ph), x = ctx2d(cv);
    const g = x.createRadialGradient(pw / 2, ph * 0.75, ph * 0.1, pw / 2, ph * 0.6, pw * 0.7);
    g.addColorStop(0, "#fbf0d2"); g.addColorStop(0.6, P.vuFace); g.addColorStop(1, "#d9c393");
    x.fillStyle = g; x.fillRect(0, 0, pw, ph);
    const pv = [pw / 2, ph + 0.012 * (o.h / 0.088) * s];               // pivot below the face
    const R = (0.058 * o.h) / 0.088 * s;
    const ang = (d) => -V.sweep + 2 * V.sweep * d;                     // deflection -> angle from vertical
    const pt = (a, r) => [pv[0] + Math.sin(a) * r, pv[1] - Math.cos(a) * r];
    // arcs: black main arc, red zone from 0 VU to the end
    x.lineCap = "butt";
    x.strokeStyle = P.vuInk; x.lineWidth = Math.max(2, 0.0009 * s);
    x.beginPath(); x.arc(pv[0], pv[1], R, -Math.PI / 2 - V.sweep, -Math.PI / 2 + ang(F.zero)); x.stroke();
    x.strokeStyle = P.vuRed; x.lineWidth = Math.max(6, 0.0034 * s);
    x.beginPath(); x.arc(pv[0], pv[1], R + 0.0016 * s, -Math.PI / 2 + ang(F.zero), -Math.PI / 2 + V.sweep); x.stroke();
    // marks + numbers
    x.textAlign = "center"; x.textBaseline = "middle";
    for (const m of plan.vuMarks(F)) {
      const a = ang(m.d), red = m.db > 0;
      x.strokeStyle = red ? P.vuRed : P.vuInk; x.lineWidth = Math.max(2, 0.0008 * s);
      const [ax, ay] = pt(a, R), [bx, by] = pt(a, R + (m.db % 5 === 0 || m.db === -7 ? 0.0075 : 0.005) * s * (o.h / 0.088));
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      if ([-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3].includes(m.db)) {
        const [tx, ty] = pt(a, R + 0.0135 * s * (o.h / 0.088));
        x.font = `600 ${Math.round(0.0072 * s * (o.h / 0.088))}px ${COND}`;
        x.fillStyle = red ? P.vuRed : P.vuInk;
        x.fillText(m.db > 0 ? `+${m.db}` : String(Math.abs(m.db)), Math.round(tx), Math.round(ty));
      }
    }
    // minus / plus signs and the VU legend
    x.font = `700 ${Math.round(0.011 * s * (o.h / 0.088))}px ${COND}`;
    x.fillStyle = P.vuInk; x.fillText("–", Math.round(pw * 0.1), Math.round(ph * 0.22));
    x.fillStyle = P.vuRed; x.fillText("+", Math.round(pw * 0.9), Math.round(ph * 0.22));
    x.fillStyle = P.vuInk;
    x.font = `700 ${Math.round(0.0125 * s * (o.h / 0.088))}px ${SANS}`;
    x.fillText("VU", Math.round(pw / 2), Math.round(ph * 0.66));
    if (o.label) { x.font = `600 ${Math.round(0.0068 * s * (o.h / 0.088))}px ${COND}`; x.fillText(o.label, Math.round(pw / 2), Math.round(ph * 0.82)); }
    // inner shadow at the top (the bezel lip)
    const sh = x.createLinearGradient(0, 0, 0, ph * 0.12);
    sh.addColorStop(0, "rgba(60,40,20,0.35)"); sh.addColorStop(1, "rgba(60,40,20,0)");
    x.fillStyle = sh; x.fillRect(0, 0, pw, ph * 0.12);
    return texOf(cv);
  }
  /**
   * vuMeter({ w, h, label }) -> Group (face-local: x across, y up the face, z out): bezel, backlit cream face, needle
   * on a pivot below the face, a peak lamp, glass. userData.set(deflection) (0..~1.06 from mixplan.vuDeflection).
   */
  function vuMeter(o = {}) {
    const V = spec.vu, w = o.w ?? V.w, h = o.h ?? V.h, b = V.bezel;
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new RoundedBoxGeometry(w + 2 * b, h + 2 * b, 0.01, 2, 0.003), materials.bezel);
    housing.position.z = 0.002;
    housing.castShadow = true; housing.receiveShadow = true;
    g.add(housing);
    const tex = vuFaceTexture({ w, h, label: o.label });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: rgb("#ffe7bf"), emissiveIntensity: V.backlight, roughness: 0.7, metalness: 0 }));
    face.position.z = 0.0075;
    g.add(face);
    // bottom lip covers the pivot; thin rims on the other three sides
    const lipH = h * 0.2;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.001, lipH, 0.004), materials.bezel);
    lip.position.set(0, -h / 2 + lipH / 2 - 0.0005, 0.0105);
    const rims = [[w + 0.002, 0.003, 0, h / 2], [0.003, h, -w / 2, 0], [0.003, h, w / 2, 0]].map(([rw, rh, rx, ry]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 0.003), materials.bezel);
      m.position.set(rx, ry, 0.009);
      return m;
    });
    g.add(lip, ...rims);
    // needle: pivot below the face bottom
    const pivotY = -h / 2 - 0.012 * (h / 0.088);
    const needle = new THREE.Group();
    needle.position.set(0, pivotY, 0.0088);
    const nl = V.needle.len * h;
    const nm = new THREE.Mesh(new THREE.BoxGeometry(V.needle.w * (h / 0.088), nl, 0.0006), new THREE.MeshStandardMaterial({ color: "#151311", roughness: 0.5 }));
    nm.position.y = nl / 2;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(V.needle.w * 0.6 * (h / 0.088), nl * 0.25, 0.0006), new THREE.MeshStandardMaterial({ color: "#a32a1f", roughness: 0.5 }));
    tip.position.y = nl * 0.88;
    needle.add(nm, tip);
    g.add(needle);
    // peak lamp (lights above 0 VU deflection 1.0)
    const lampMat = new THREE.MeshStandardMaterial({ color: "#5a1410", emissive: rgb(P.led.red), emissiveIntensity: 0.05, roughness: 0.4 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 16), lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(w / 2 - 0.009, h / 2 - 0.009, 0.0082);
    g.add(lamp);
    // glass: a faint reflective sheet
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.08, depthWrite: false }));
    glass.position.z = 0.0125;
    g.add(glass);
    g.userData = {
      needle, face,
      set(d) {
        needle.rotation.z = V.sweep - 2 * V.sweep * d;
        lampMat.emissiveIntensity = d > spec.mix.vuFace.zero * 1.41 ? 3.5 : 0.05;
      },
    };
    g.userData.set(0);
    g.name = "vu-meter";
    return g;
  }

  /** eqDisplay({ w, h }) -> Group (face-local): dark glass with grid + curve; userData.set({ lo, mid, hi }, label) (redraw on change + upload) */
  function eqDisplay(o = {}) {
    const E = spec.eqDisplay, w = o.w ?? E.w, h = o.h ?? E.h, Q = spec.mix.eq;
    const pw = E.px, ph = Math.round((E.px * h) / w);
    const cv = newCanvas(pw, ph);
    const tex = texOf(cv, { aniso: 4 });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    mat.color.setScalar(1);
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new RoundedBoxGeometry(w + 0.014, h + 0.014, 0.01, 2, 0.003), materials.bezel);
    housing.position.z = 0.002;
    housing.castShadow = true;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    scr.position.z = 0.0075;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.material.color.setScalar(E.glow - 1);
    glow.position.z = 0.0078;
    g.add(housing, scr, glow);
    let last = null;
    const draw = (k, label) => {
      const x = ctx2d(cv);
      x.reset?.();
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
      x.fillStyle = E.glass; x.fillRect(0, 0, pw, ph);
      const m = { l: pw * 0.08, r: pw * 0.96, t: ph * 0.2, b: ph * 0.84 };
      const fx = (f) => m.l + ((Math.log(f) - Math.log(Q.fMin)) / (Math.log(Q.fMax) - Math.log(Q.fMin))) * (m.r - m.l);
      const fy = (db) => (m.t + m.b) / 2 - (db / (Q.range * 1.25)) * ((m.b - m.t) / 2);
      x.strokeStyle = E.grid; x.lineWidth = 2;
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { x.beginPath(); x.moveTo(Math.round(fx(f)) + 0.5, m.t); x.lineTo(Math.round(fx(f)) + 0.5, m.b); x.stroke(); }
      for (const db of [-12, -6, 0, 6, 12]) { x.beginPath(); x.moveTo(m.l, Math.round(fy(db)) + 0.5); x.lineTo(m.r, Math.round(fy(db)) + 0.5); x.stroke(); }
      x.strokeStyle = "rgba(255,179,71,0.35)"; x.lineWidth = 2; x.beginPath(); x.moveTo(m.l, fy(0)); x.lineTo(m.r, fy(0)); x.stroke();
      const pts = plan.eqCurve(k, Q, 120);
      // filled area under the curve + the curve
      x.beginPath(); x.moveTo(fx(pts[0].f), fy(0));
      for (const p of pts) x.lineTo(fx(p.f), fy(p.db));
      x.lineTo(fx(pts[pts.length - 1].f), fy(0)); x.closePath();
      x.fillStyle = "rgba(255,170,60,0.18)"; x.fill();
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(fx(p.f), fy(p.db)) : x.moveTo(fx(p.f), fy(p.db))));
      x.strokeStyle = E.curve; x.lineWidth = 6; x.lineJoin = "round"; x.stroke();
      x.fillStyle = E.text; x.textBaseline = "middle"; x.textAlign = "left";
      x.font = `700 ${Math.round(ph * 0.1)}px ${COND}`;
      x.fillText(`EQ  ${label ?? ""}`, Math.round(m.l), Math.round(ph * 0.1));
      x.textAlign = "right"; x.font = `600 ${Math.round(ph * 0.075)}px ${COND}`;
      x.fillText("LO   MID   HI", Math.round(m.r), Math.round(ph * 0.1));
      x.textAlign = "center"; x.font = `600 ${Math.round(ph * 0.065)}px ${COND}`; x.fillStyle = "rgba(217,201,162,0.7)";
      for (const [f, s] of [[100, "100"], [1000, "1k"], [10000, "10k"]]) x.fillText(s, Math.round(fx(f)), Math.round(ph * 0.92));
    };
    g.userData = {
      canvas: cv, texture: tex,
      set(k, label) {
        const r3 = (v) => Math.round((v ?? 0) * 1000) / 1000;
        const key = JSON.stringify([r3(k.lo), r3(k.mid), r3(k.hi), label]);
        if (key === last) return;
        last = key;
        draw(k, label);
        uploadTexture(stage, tex);
      },
    };
    g.userData.set({ lo: 0, mid: 0, hi: 0 }, "");
    g.name = "eq-display";
    return g;
  }

  /** jogWheel() -> Group (panel-local): rubber rim, chrome face, finger dimple; userData.set(angle) */
  function jogWheel(o = {}) {
    const J = spec.jog, r = o.r ?? J.r;
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, J.h, 72), materials.rubber);
    rim.position.y = J.h / 2;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.003, 72), materials.chrome);
    face.position.y = J.h + 0.0012;
    const spin = new THREE.Group();
    const dimple = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.15, 0.004, 32), materials.rubber);
    dimple.position.set(r * 0.55, J.h + 0.002, 0);
    // knurl ribs on the rim
    const rib = new THREE.BoxGeometry(0.0018, J.h * 0.9, 0.003);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2, m = new THREE.Mesh(rib, materials.rubber);
      m.position.set(Math.cos(a) * r * 1.01, J.h / 2, Math.sin(a) * r * 1.01);
      m.rotation.y = -a;
      spin.add(m);
    }
    spin.add(face, dimple);
    rim.castShadow = true; rim.receiveShadow = true; face.receiveShadow = true;
    g.add(rim, spin);
    g.userData = { set(a) { spin.rotation.y = -a; } };
    g.name = "jog-wheel";
    return g;
  }

  /** consoleTape({ names: [{ text, x, w }], width }) -> Mesh: torn strips of white tape with marker-pen names (panel-local, lies on the panel) */
  function consoleTape(o) {
    const T = spec.tapeLabel, ppm = T.px / Math.max(1.2, o.width);
    const w = o.width, h = C.tapeH;
    const cv = newCanvas(w * ppm, h * ppm), x = ctx2d(cv);
    const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    o.names.forEach((nm, k) => {
      const cx = (nm.x + w / 2) * ppm, pw = nm.w * ppm, y0 = H * 0.08, y1 = H * 0.92;
      // torn ends: jagged polygon
      x.beginPath();
      const L = cx - pw / 2, R = cx + pw / 2, steps = 9;
      x.moveTo(L, y0);
      x.lineTo(R, y0 + (hash01(k, 3) - 0.5) * 2);
      for (let i = 1; i <= steps; i++) x.lineTo(R + (hash01(k, i, 7) - 0.5) * 0.004 * ppm, y0 + ((y1 - y0) * i) / steps);
      x.lineTo(L, y1);
      for (let i = steps - 1; i >= 1; i--) x.lineTo(L + (hash01(k, i, 9) - 0.5) * 0.004 * ppm, y0 + ((y1 - y0) * i) / steps);
      x.closePath();
      x.fillStyle = P.tape; x.fill();
      x.strokeStyle = "rgba(120,110,90,0.25)"; x.lineWidth = 2; x.stroke();
      // faint crepe texture
      for (let i = 0; i < pw; i += 3) { x.fillStyle = `rgba(150,140,120,${(hash01(k, i, 21) * 0.06).toFixed(3)})`; x.fillRect(Math.round(L + i), Math.round(y0), 2, Math.round(y1 - y0)); }
      // marker text (slightly rotated, integer origin)
      const fs = Math.round(T.cap * ppm);
      x.save();
      x.translate(Math.round(cx), Math.round(H * 0.54));
      x.rotate((hash01(k, 31) - 0.5) * 0.05);
      x.font = `${T.weight} ${fs}px ${T.font}`;
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = T.ink;
      let s = fs;
      while (x.measureText(nm.text).width > pw * 0.86 && s > 10) { s = Math.round(s * 0.92); x.font = `${T.weight} ${s}px ${T.font}`; }
      x.fillText(nm.text, 0, 0);
      x.restore();
    });
    const tex = texOf(cv);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.85, metalness: 0 }));
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.name = "console-tape";
    return m;
  }

  // ---------------------------------------------------------------------------------------------- channel strip
  /**
   * channelStrip({ number, label, colors }) -> Group (panel-local, centred on the strip): faceplate with legends,
   * fader, five knobs (gain, hi, mid, lo, pan), mute + solo buttons, LED column.
   * userData: { fader, knobs: { gain, hi, mid, lo, pan }, mute, solo, led }
   */
  function channelStrip(o = {}) {
    const g = new THREE.Group();
    const W = C.stripW;
    const plateMat = new THREE.MeshStandardMaterial({ map: stripArtwork({ number: o.number }), roughness: 0.4, metalness: 0.55 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, C.depth), plateMat);
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.0008, C.plate, C.depth), materials.alu);
    body.position.y = -C.plate / 2 - 0.0003;
    body.receiveShadow = true;
    g.add(top, body);
    const f = fader();
    f.position.x = X.fader;
    g.add(f);
    const knobs = {};
    for (const k of spec.strip.knobs) {
      const kn = knob({ kind: k, color: o.colors?.[k] });
      kn.position.set(X.knob, 0, Z[k]);
      g.add(kn);
      knobs[k] = kn;
    }
    const mute = litButton({ color: P.mute }), solo = litButton({ color: P.solo });
    mute.position.set(X.mute, 0, Z.buttons); solo.position.set(X.solo, 0, Z.buttons);
    g.add(mute, solo);
    const led = ledBar();
    led.position.x = X.led;
    g.add(led);
    g.userData = { fader: f, knobs, mute, solo, led };
    g.name = `strip-${o.number}`;
    return g;
  }

  /** masterSection() -> Group (panel-local, centred): faceplate, master fader, stereo LEDs, jog wheel, transport buttons, aux knobs */
  function masterSection() {
    const g = new THREE.Group(), M = masterLayout(), W = C.masterW;
    const plateMat = new THREE.MeshStandardMaterial({ map: stripArtwork({ master: true, width: W, number: 9 }), roughness: 0.4, metalness: 0.55 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, C.depth), plateMat);
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.0008, C.plate, C.depth), materials.alu);
    body.position.y = -C.plate / 2 - 0.0003;
    g.add(top, body);
    const f = fader({ master: true });
    f.position.x = M.fader;
    const ledL = ledBar(), ledR = ledBar();
    ledL.position.x = M.ledL; ledR.position.x = M.ledR;
    const jog = jogWheel();
    jog.position.set(M.jog[0], 0, M.jog[1]);
    const transport = M.transport.map((b) => {
      const bt = litButton({ color: b.icon === "play" ? P.play : b.icon === "stop" ? P.led.red : P.mute });
      bt.position.set(b.x, 0, b.z);
      g.add(bt);
      return bt;
    });
    const aux = M.aux.map((a) => { const k = knob({ kind: "aux", color: P.knobs.aux }); k.position.set(a.x, 0, a.z); g.add(k); return k; });
    g.add(f, ledL, ledR, jog);
    g.userData = { fader: f, ledL, ledR, jog, transport, aux, layout: M };
    g.name = "master-section";
    return g;
  }

  // ---------------------------------------------------------------------------------------------- console body
  function profileExtrude(pts, depth, mat) {
    // pts in panel (z, y); extruded along -x by depth, then shifted so it spans x in [0, depth]
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 8 });
    geo.rotateY(-Math.PI / 2);           // (a, b, e) -> (x = -e, y = b, z = a)
    geo.translate(depth, 0, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  /**
   * consoleDesk({ channels: [{ label, colors? }] }) -> Group placed in the world (panel tilted by spec.console.slope):
   * channel strips, master section, meter bridge with one VU per channel + master VU + EQ display, console tape,
   * armrest, walnut end-cheeks, fascia. userData: { layout, panel, strips[], master, vus[], masterVu, eq, tape }
   */
  function consoleDesk(o = {}) {
    const chans = o.channels ?? [];
    const L = plan.consoleLayout(spec, { channels: chans.length });
    const root = new THREE.Group();
    root.name = "console";
    const panel = new THREE.Group();
    panel.position.set(...C.origin);
    panel.rotation.x = C.slope;
    root.add(panel);
    // strips
    const strips = chans.map((c, i) => {
      const s = channelStrip({ number: i + 1, label: c.label, colors: c.colors });
      s.position.x = L.stripX(i);
      panel.add(s);
      return s;
    });
    const master = masterSection();
    master.position.x = L.master.cx;
    panel.add(master);
    // console tape across the front
    const names = chans.map((c, i) => ({ text: c.label, x: L.stripX(i), w: C.stripW * 0.9 }));
    names.push({ text: o.masterLabel ?? "MIX", x: L.master.x0 + masterLayout().fader + C.masterW / 2, w: C.stripW * 0.8 });
    const tape = consoleTape({ names, width: L.width });
    tape.position.set(0, 0.0007, Z.tape);
    panel.add(tape);
    // meter bridge hood
    const Bd = C.bridge, Bg = L.bridge;
    const hood = profileExtrude([[Bg.z0 + 0.004, -0.01], [Bg.topZ, Bd.h], [Bg.topZ - 0.012, Bd.h + Bd.thick], [Bg.z1, Bd.h + Bd.thick], [Bg.z1, -0.04], [Bg.z0 + 0.004, -0.04]], L.width, materials.bridge);
    hood.position.x = L.x0;
    panel.add(hood);
    // walnut trim along the bridge top
    const trim = new THREE.Mesh(new RoundedBoxGeometry(L.width + 2 * C.cheekW, 0.022, Bg.topZ - Bg.z1 + 0.03, 2, 0.006), materials.walnut);
    trim.position.set(0, Bd.h + Bd.thick + 0.011, (Bg.topZ + Bg.z1) / 2 - 0.01);
    trim.castShadow = trim.receiveShadow = true;
    panel.add(trim);
    // face group for meters
    const face = new THREE.Group();
    face.position.set(0, 0, Bg.z0);
    face.rotation.x = Bd.tilt - Math.PI / 2;
    panel.add(face);
    const faceU = Bd.h / 2;
    const vus = chans.map((c, i) => {
      const v = vuMeter({ label: c.label });
      v.position.set(L.stripX(i), faceU + 0.004, 0.0005);
      face.add(v);
      return v;
    });
    const M = masterLayout();
    const masterVu = vuMeter({ w: spec.vu.master.w, h: spec.vu.master.h, label: "MIX" });
    masterVu.position.set(L.master.cx + M.vu, faceU + 0.004, 0.0005);
    face.add(masterVu);
    const eq = eqDisplay();
    eq.position.set(L.master.cx + M.eq, faceU + 0.004, 0.0005);
    face.add(eq);
    // end cheeks (walnut), profile follows panel + bridge
    const fz = C.depth / 2 + C.armrest.gap + 2 * C.armrest.r + 0.01;
    const cheekPts = [[fz, -C.fascia], [fz, 0.0], [fz - 0.03, C.cheekRise], [Bg.z0 - 0.01, C.cheekRise], [Bg.topZ - 0.02, Bd.h + Bd.thick + 0.03], [Bg.z1 - 0.02, Bd.h + Bd.thick + 0.03], [Bg.z1 - 0.02, -C.fascia]];
    for (const sx of [-1, 1]) {
      const ch = profileExtrude(cheekPts, C.cheekW, materials.walnut);
      ch.position.x = sx < 0 ? L.x0 - C.cheekW : L.x1;
      panel.add(ch);
    }
    // armrest (leather roll) and fascia below it
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(C.armrest.r, L.width - 2 * C.armrest.r, 8, 24), materials.leather);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0, -C.armrest.r * 0.35, C.depth / 2 + C.armrest.gap + C.armrest.r);
    arm.castShadow = arm.receiveShadow = true;
    panel.add(arm);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(L.width, C.fascia, 0.04), materials.body);
    fascia.position.set(0, -C.fascia / 2 - C.armrest.r, C.depth / 2 + 0.03);
    fascia.receiveShadow = true;
    panel.add(fascia);
    const under = new THREE.Mesh(new THREE.BoxGeometry(L.width, C.fascia, C.depth + Bd.d), materials.body);
    under.position.set(0, -C.fascia / 2 - C.plate - 0.002, -Bd.d / 2);
    panel.add(under);
    root.userData = { layout: L, panel, strips, master, vus, masterVu, eq, tape, face };
    return root;
  }

  // ---------------------------------------------------------------------------------------------- background
  /** reel({ r, pack }) -> Group: two aluminium flanges with three windows, brown tape pack, hub; rotates about +z. userData.set(angle) */
  function reel(o = {}) {
    const R = spec.tapeMachine.reel, r = o.r ?? R.r, pack = o.pack ?? R.packMax;
    const g = new THREE.Group(), spin = new THREE.Group();
    const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, Math.PI * 2, false);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3, hp = new THREE.Path();
      const cx = Math.cos(a) * r * 0.55, cy = Math.sin(a) * r * 0.55;
      hp.absarc(cx, cy, r * 0.27, 0, Math.PI * 2, true);
      sh.holes.push(hp);
    }
    const hubHole = new THREE.Path(); hubHole.absarc(0, 0, R.hub * 0.35, 0, Math.PI * 2, true); sh.holes.push(hubHole);
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1, curveSegments: 48 });
    for (const z of [0.0, 0.03]) { const f = new THREE.Mesh(fg, materials.reelAlu); f.position.z = z; f.castShadow = true; spin.add(f); }
    const packM = new THREE.Mesh(new THREE.CylinderGeometry(pack, pack, 0.026, 64), materials.tapePack);
    packM.rotation.x = Math.PI / 2; packM.position.z = 0.017;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R.hub, R.hub, 0.04, 32), materials.chrome);
    hub.rotation.x = Math.PI / 2; hub.position.z = 0.017;
    spin.add(packM, hub);
    g.add(spin);
    g.userData = { set(a) { spin.rotation.z = -a; } };
    g.name = "tape-reel";
    return g;
  }
  /** tapeMachine() -> Group in the world behind the console: cabinet, faceplate, two reels, head block, tape path. userData.update(t) turns the reels. */
  function tapeMachine() {
    const T = spec.tapeMachine, R = T.reel;
    const g = new THREE.Group();
    g.position.set(...T.at);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(T.w + 0.08, T.h + 0.08, T.d, 3, 0.02), materials.walnut);
    cab.position.set(0, T.h / 2, -T.d / 2);
    const plateC = newCanvas(1024, Math.round((1024 * T.h) / T.w)), x = ctx2d(plateC);
    brushed(x, plateC.width, plateC.height, 77);
    x.fillStyle = "rgba(25,22,18,0.6)"; x.fillRect(0, Math.round(plateC.height * 0.8), plateC.width, 3);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(T.w, T.h), new THREE.MeshStandardMaterial({ map: texOf(plateC), roughness: 0.42, metalness: 0.6 }));
    plate.position.set(0, T.h / 2, 0.002);
    g.add(cab, plate);
    const reels = [-1, 1].map((sx, i) => {
      const rl = reel({ pack: i === 0 ? R.packMax : R.packMin + 0.05 });
      rl.position.set(sx * R.x, R.y, 0.01);
      g.add(rl);
      return rl;
    });
    // head block + guides + tape path
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.09, 0.05, 2, 0.008), materials.bezel);
    head.position.set(0, R.y - R.r - 0.02, 0.03);
    const guides = [-0.17, 0.17].map((gx) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 24), materials.chrome); m.rotation.x = Math.PI / 2; m.position.set(gx, R.y - R.r - 0.02, 0.04); return m; });
    const tapeMat = materials.tapePack;
    const seg = (a, b) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.0015, 0.024), tapeMat);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.035);
      m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
      return m;
    };
    const gy = R.y - R.r - 0.02 + 0.012;
    g.add(head, ...guides,
      seg([-R.x - R.packMax * 0.2, R.y - R.packMax * 0.98], [-0.17, gy]), seg([-0.17, gy + 0.004], [0.17, gy + 0.004]),
      seg([0.17, gy], [R.x + (R.packMin + 0.05) * 0.2, R.y - (R.packMin + 0.05) * 0.98]));
    // a row of transport lamps on the machine
    const lamps = [0, 1, 2, 3].map((k) => { const b = litButton({ color: k === 1 ? P.play : P.mute }); b.rotation.x = Math.PI / 2; b.position.set(-0.12 + k * 0.08, 0.12, 0.004); g.add(b); return b; });
    lamps[1].userData.set(true, 0);
    g.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
    g.userData = {
      reels,
      update(t) {
        reels[0].userData.set((T.speed / R.packMax) * t * 0.6);
        reels[1].userData.set((T.speed / (R.packMin + 0.05)) * t * 0.6);
      },
    };
    g.name = "tape-machine";
    return g;
  }
  /** studioRoom() -> Group: slatted walnut wall behind, a dark floor. */
  function studioRoom() {
    const Wd = spec.wall, g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(Wd.w, Wd.h), materials.wall);
    wall.position.set(0, Wd.h / 2 - 1, Wd.z);
    wall.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(Wd.w, 8), new THREE.MeshStandardMaterial({ color: "#2b2420", roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1;
    g.add(wall, floor);
    g.name = "studio-room";
    return g;
  }

  // ---------------------------------------------------------------------------------------------- controller
  /**
   * mixController({ desk, mix }) -> { update(t, { eqFor, jog }) }: sets every control and meter on the desk from a
   * mixplan.planMix plan at time t (faders, detented knobs, latched buttons, VU needles, LED columns + peak hold,
   * master VU / stereo LEDs, EQ display for channel `eqFor`, jog wheel angle).
   */
  function mixController({ desk, mix }) {
    const D = desk.userData, F = spec.mix;
    return {
      update(t, o = {}) {
        mix.ids.forEach((id, i) => {
          const s = D.strips[i]?.userData;
          if (!s) return;
          s.fader.userData.set(mix.fader(id, t));
          for (const k of spec.strip.knobs) s.knobs[k].userData.set(knobAngle(k, mix.knob(id, k, t)));
          const m = mix.button(id, "mute", t), so = mix.button(id, "solo", t);
          s.mute.userData.set(m.on, m.press);
          s.solo.userData.set(so.on, so.press);
          s.led.userData.set(plan.ledLit(mix.led(id, t), F.ledFace), plan.ledLit(mix.peak(id, t), F.ledFace));
          D.vus[i].userData.set(plan.vuDeflection(mix.vu(id, t), F.vuFace));
        });
        const Mu = D.master.userData;
        Mu.fader.userData.set(mix.fader("master", t));
        Mu.ledL.userData.set(plan.ledLit(mix.masterLedSide(t, -1), F.ledFace), plan.ledLit(mix.masterPeakSide(t, -1), F.ledFace));
        Mu.ledR.userData.set(plan.ledLit(mix.masterLedSide(t, 1), F.ledFace), plan.ledLit(mix.masterPeakSide(t, 1), F.ledFace));
        D.masterVu.userData.set(plan.vuDeflection(mix.masterVu(t), F.vuFace));
        if (o.eqFor) D.eq.userData.set(mix.eq(o.eqFor, t), mix.channels[mix.index(o.eqFor)].label);
        Mu.jog.userData.set(o.jog ?? 0);
        Mu.transport.forEach((b, k) => b.userData.set(k === 1, 0));
      },
    };
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
      x.fillStyle = "rgba(30,20,10,0.25)"; rrPath(x, ox + 2, oy + 6, pw, ph, 12); x.fill();
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 12); x.fill();
      x.fillStyle = Q.rule; rrPath(x, ox + 14, oy + 18, bar - 4, ph - 36, 4); x.fill();
      x.textAlign = "left"; x.textBaseline = "middle"; x.fillStyle = Q.ink;
      x.fillText(st.text, Math.round(ox + bar + pad), Math.round(oy + ph / 2 + 2));
    }, { upload: true });
    ctx2d(mesh.userData.canvas);
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** stamp({ text = "SAMPLE DATA" }) -> overlay tag at spec.stamp (align "left": left edge at x, else right edge at x), always visible. */
  function stamp(o = {}) {
    const Q = { ...spec.stamp, ...o };
    const Wp = 360, Hp = 64;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H) => {
      x.font = `700 ${Q.cap}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = `${Q.cap * 0.12}px`;
      const tw = x.measureText(Q.text).width + Q.cap * 0.12, pw = tw + Q.cap * 1.1, ph = Q.cap * 1.75;
      const ox = Q.align === "left" ? 4 : W - pw - 4, oy = (H - ph) / 2;
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 6); x.fill();
      x.strokeStyle = Q.color; x.lineWidth = 3; rrPath(x, ox, oy, pw, ph, 6); x.stroke();
      x.fillStyle = Q.color; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(Q.text, Math.round(ox + pw / 2 + Q.cap * 0.06), Math.round(oy + ph / 2 + 1));
    }, { upload: true });
    ctx2d(mesh.userData.canvas);
    mesh.userData.place(Q.align === "left" ? Q.x : Q.x - Wp, Q.y);
    mesh.userData.set({ text: Q.text });
    mesh.userData.opacity(1);
    return mesh;
  }

  const props = {
    consoleDesk, channelStrip, masterSection, fader, knob, litButton, ledBar, vuMeter, eqDisplay, jogWheel, consoleTape,
    reel, tapeMachine, studioRoom, mixController, caption, stamp,
  };
  const factories = {
    studioRoom: () => studioRoom(),
    tapeMachine: () => tapeMachine(),
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan, motion: plan, dof,
    helpers: { knobAngle, stripArtwork, vuFaceTexture, masterLayout, contactShadow },
  };
}
