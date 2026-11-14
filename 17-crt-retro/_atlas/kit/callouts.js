// callouts.js — thin-line overlay annotation: hairline elbow callouts anchored to 3D points and a tracked
// title lockup. Promoted from the studio-product pilot. Drawn on the kit overlay (exact colours, after post).
// Pass a `look` to restyle (defaults = the studio-product look): { font, titleWeight, titleTracking, labelWeight,
// labelTracking, titleHeight, subHeight, labelHeight, lineWidthPx, dotPx, ringPx, lineColor, labelColor, subColor,
// dotColor, drawDur, fadeDur, outDur, rise } — heights are fractions of frame height, tracking in em.
import * as THREE from "three";
import { createTextLabel, FONTS } from "./text.js";
import { clamp, smoothstep, lerp, toEase } from "./time.js";
import { getOverlay, projectToScreen } from "./overlay.js";

export const CALLOUT_LOOK = {
  font: "sans", titleWeight: 300, titleTracking: 0.32, labelWeight: 500, labelTracking: 0.3,
  titleHeight: 0.078, subHeight: 0.034, labelHeight: 0.036, lineWidthPx: 1.6, dotPx: 4.5, ringPx: 11,
  lineColor: "#d6d9de", labelColor: "#f1f1ee", subColor: "#8d939c", dotColor: "#2f74ff",
  drawDur: 0.45, fadeDur: 0.4, outDur: 0.45, rise: 0.012,
};
const PX = 2 / 1080; // overlay units per frame pixel (frame height = 2 units)
export function overlayText(text, { height, weight, tracking, color, font }) {
  const fontSize = 112;
  const m = createTextLabel(text, { font, weight, color, height: 1, fontSize, padding: 0.12, letterSpacing: tracking * fontSize, align: "center" });
  m.material.depthTest = false;
  m.scale.multiplyScalar(height * 2);
  m.userData.w = m.scale.x;
  m.userData.h = m.scale.y;
  return m;
}
export function hairline(color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
  m.userData.set = (a, b, wPx, op) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    m.visible = L > 1e-5 && op > 0.001;
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    m.rotation.z = Math.atan2(dy, dx);
    m.scale.set(Math.max(L, 1e-5), wPx * PX, 1);
    m.material.opacity = op;
  };
  return m;
}
/** 1 -> 0 fade starting at `off` (off = Infinity = never; kit smoothstep is also safe for that now). */
const outF = (t, off, dur) => (Number.isFinite(off) ? 1 - smoothstep(off, off + dur, t) : 1);

/**
 * callout(stage, label, { dir = [1, 1], knee = .1, run = .32, sub, look }) -> Group on the overlay
 *   A dot + ring at a 3D anchor, an ultra-thin elbow line (diagonal `knee`, horizontal `run`, in frame-height
 *   units, `dir` = which way), a small-caps label above the run and an optional dim sub-label below it.
 *   userData.update(t, { anchor:[x,y,z] (world), on, off }) — draws on (spec.overlay.drawDur), holds, fades.
 *   Keep the run inside the safe area (|x| ≤ .9 of half-width).
 */
export function callout(stage, label, o = {}) {
  const OV = { ...CALLOUT_LOOK, ...o.look }, ov = getOverlay(stage), font = FONTS[OV.font] ?? OV.font;
  const g = new THREE.Group();
  const l1 = hairline(OV.lineColor), l2 = hairline(OV.lineColor);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: OV.dotColor, transparent: true, depthTest: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: OV.lineColor, transparent: true, depthTest: false }));
  const txt = overlayText(label, { height: OV.labelHeight, weight: OV.labelWeight, tracking: OV.labelTracking, color: OV.labelColor, font });
  const sub = o.sub ? overlayText(o.sub, { height: OV.subHeight, weight: 400, tracking: OV.labelTracking * 0.8, color: OV.subColor, font }) : null;
  g.add(l1, l2, dot, ring, txt);
  if (sub) g.add(sub);
  ov.add(g);
  const dir = o.dir ?? [1, 1], knee = o.knee ?? 0.1, run = o.run ?? 0.32;
  g.userData.update = (t, { anchor, on, off = Infinity }) => {
    const vis = t >= on && t < off + OV.outDur;
    g.visible = vis;
    if (!vis) return;
    const p = projectToScreen(stage, anchor);
    const A = [p.x * ov.aspect, p.y];
    const B = [A[0] + dir[0] * knee * 0.75, A[1] + dir[1] * knee];
    const C = [B[0] + dir[0] * run, B[1]];
    const u = clamp((t - on) / OV.drawDur), out = outF(t, off, OV.outDur);
    const e = toEase("outCubic")(u);
    const s1 = clamp(e / 0.4), s2 = clamp((e - 0.4) / 0.6);
    l1.userData.set(A, [lerp(A[0], B[0], s1), lerp(A[1], B[1], s1)], OV.lineWidthPx, out);
    l2.userData.set(B, [lerp(B[0], C[0], s2), B[1]], OV.lineWidthPx, out * (s2 > 0 ? 1 : 0));
    const pop = toEase("outBack")(clamp((t - on) / 0.35));
    dot.position.set(A[0], A[1], 0); dot.scale.setScalar(OV.dotPx * PX * pop); dot.material.opacity = out;
    ring.position.set(A[0], A[1], 0); ring.scale.setScalar(OV.ringPx * PX * (0.6 + 0.4 * pop)); ring.material.opacity = out * 0.85;
    const lf = smoothstep(on + OV.drawDur * 0.55, on + OV.drawDur * 0.55 + OV.fadeDur, t) * out;
    const rise = (1 - toEase("outCubic")(clamp((t - on - OV.drawDur * 0.55) / OV.fadeDur))) * OV.rise;
    const left = dir[0] > 0 ? B[0] : C[0];
    txt.position.set(left + txt.userData.w / 2 - 0.006, B[1] + txt.userData.h * 0.42 - rise, 0);
    txt.material.opacity = lf;
    if (sub) { sub.position.set(left + sub.userData.w / 2 - 0.004, B[1] - sub.userData.h * 0.5 + rise, 0); sub.material.opacity = lf; }
  };
  g.visible = false;
  return g;
}

/**
 * titleLockup(stage, title, { sub, x = 0, y = -.62, size = 1, rule = .16, look }) -> Group on the overlay
 *   Light-weight, widely tracked caps title; a hairline rule draws out from the centre under it; optional dim
 *   small-caps sub line. (x, y) in NDC. userData.update(t, { on, off }).
 */
export function titleLockup(stage, title, o = {}) {
  const OV = { ...CALLOUT_LOOK, ...o.look }, ov = getOverlay(stage), font = FONTS[OV.font] ?? OV.font;
  const g = new THREE.Group();
  const tt = overlayText(title, { height: OV.titleHeight * (o.size ?? 1), weight: OV.titleWeight, tracking: OV.titleTracking, color: OV.labelColor, font });
  const sub = o.sub ? overlayText(o.sub, { height: OV.subHeight, weight: 400, tracking: OV.labelTracking, color: OV.subColor, font }) : null;
  const rule = hairline(OV.lineColor);
  g.add(tt, rule);
  if (sub) g.add(sub);
  ov.add(g);
  const cx = (o.x ?? 0) * ov.aspect, cy = o.y ?? -0.62, rw = (o.rule ?? 0.16) * ov.aspect;
  g.userData.width = tt.userData.w;
  g.userData.update = (t, { on, off = Infinity }) => {
    const vis = t >= on && t < off + OV.outDur;
    g.visible = vis;
    if (!vis) return;
    const out = outF(t, off, OV.outDur);
    const a = smoothstep(on, on + OV.fadeDur * 1.6, t) * out;
    const rise = (1 - toEase("outCubic")(clamp((t - on) / (OV.fadeDur * 2)))) * OV.rise * 1.5;
    tt.position.set(cx, cy + tt.userData.h * 0.32 - rise, 0);
    tt.material.opacity = a;
    const r = toEase("inOutCubic")(clamp((t - on - 0.15) / 0.6)) * rw;
    rule.userData.set([cx - r, cy - tt.userData.h * 0.2], [cx + r, cy - tt.userData.h * 0.2], OV.lineWidthPx, out);
    if (sub) {
      sub.position.set(cx, cy - tt.userData.h * 0.2 - sub.userData.h * 0.62 + rise * 0.5, 0);
      sub.material.opacity = smoothstep(on + 0.35, on + 0.35 + OV.fadeDur * 1.5, t) * out;
    }
  };
  g.visible = false;
  return g;
}

