// styles/film-projector/style.js — "Film Projector": a dark screening room, a reel-to-reel projector throwing a dusty
// volumetric cone onto a pull-down screen, a sepia silent-film picture with weave / flicker / scratches / dust, a
// backlit sprocketed film strip the camera rides along, intertitle cards, a 3-2-1 sweep leader and a tail-out.
// Every number that defines the look is in spec.js; timing comes from the pure planner reel.js (style.plan).
// Props never animate themselves: the scene calls userData.update(...) / helpers.projection(...).update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { rng, clamp, lerp } from "../../kit/time.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { shapes } from "../../kit/shapes.js";
import { rodGeometry } from "../../kit/paths.js";
import { woodTexture } from "../../kit/textures.js";
import { createTextLabel } from "../../kit/text.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import { STYLE_SPEC } from "./spec.js";
import * as reel from "./reel.js";
export { STYLE_SPEC };

const S = STYLE_SPEC;
const lin = (hex) => new THREE.Color(hex); // working (linear) colour from sRGB hex

// =====================================================================================================
// 2D painters (grayscale pictures, leader, intertitles). Pure: each call draws only from its arguments.
// =====================================================================================================
const gv = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

function resetCtx(ctx, clear = true) {
  if (clear && ctx.reset) ctx.reset();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.letterSpacing = "0px";
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function vGrad(ctx, x, y, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, gv(top)); g.addColorStop(1, gv(bottom));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
function glow(ctx, cx, cy, r, v, a) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, gv(v, a)); g.addColorStop(1, gv(v, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}
const disc = (ctx, cx, cy, r, v, a = 1) => { ctx.fillStyle = gv(v, a); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
const poly = (ctx, pts, v, a = 1) => { ctx.fillStyle = gv(v, a); ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill(); };
const box = (ctx, x, y, w, h, v, a = 1) => { ctx.fillStyle = gv(v, a); ctx.fillRect(x, y, w, h); };
function puffs(ctx, ox, oy, a, { n = 9, life = 1.8, dx, dy, r0, r1, v = 225, seed = 3 }) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const jx = R.range(-0.4, 0.4), jy = R.range(-0.3, 0.3);
    const age = (((i / n) * life + a) % life) / life;
    const r = lerp(r0, r1, age);
    disc(ctx, ox + dx * age + jx * r, oy + dy * age + jy * r, r, v - age * 40, 0.85 * (1 - age * 0.8));
  }
}

/** Sample pictures (grayscale; the projector shader / strip tone them). painter(ctx, x, y, w, h, a = seconds of film). */
export const PICTURES = {
  writingDesk(ctx, x, y, w, h, a = 0) {
    const X = (u) => x + u * w, Y = (v) => y + v * h;
    vGrad(ctx, x, y, w, h * 0.68, 70, 38);
    box(ctx, X(0.08), Y(0.1), w * 0.26, h * 0.36, 200); glow(ctx, X(0.21), Y(0.28), w * 0.3, 230, 0.35);
    box(ctx, X(0.205), Y(0.1), w * 0.012, h * 0.36, 45); box(ctx, X(0.08), Y(0.27), w * 0.26, h * 0.014, 45);
    ctx.strokeStyle = gv(40); ctx.lineWidth = w * 0.012; ctx.strokeRect(X(0.08), Y(0.1), w * 0.26, h * 0.36);
    vGrad(ctx, x, Y(0.66), w, h * 0.34, 120, 72);
    box(ctx, x, Y(0.66), w, h * 0.012, 160);
    ctx.strokeStyle = gv(95, 0.6); ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x, Y(0.72 + i * 0.05)); ctx.bezierCurveTo(X(0.3), Y(0.71 + i * 0.05), X(0.7), Y(0.74 + i * 0.05), X(1), Y(0.72 + i * 0.05)); ctx.stroke(); }
    // candle + flame (flame flickers with the film frame)
    const fl = 1 + 0.08 * Math.sin(a * 23) + 0.05 * Math.sin(a * 41);
    glow(ctx, X(0.86), Y(0.42), w * 0.2 * fl, 255, 0.45);
    box(ctx, X(0.84), Y(0.46), w * 0.04, h * 0.22, 215);
    poly(ctx, [[X(0.86), Y(0.46 - 0.075 * fl)], [X(0.875), Y(0.44)], [X(0.86), Y(0.465)], [X(0.845), Y(0.44)]], 255);
    // ink pot
    ctx.fillStyle = gv(28); ctx.beginPath(); ctx.roundRect(X(0.66), Y(0.6), w * 0.09, h * 0.09, w * 0.012); ctx.fill();
    box(ctx, X(0.68), Y(0.575), w * 0.05, h * 0.03, 40);
    // the letter: lines of writing appear as the film runs, the quill follows the line being written
    ctx.save(); ctx.translate(X(0.4), Y(0.76)); ctx.rotate(-0.07);
    const pw = w * 0.36, ph = h * 0.21;
    box(ctx, -pw / 2 + 6, -ph / 2 + 6, pw, ph, 30, 0.5);
    box(ctx, -pw / 2, -ph / 2, pw, ph, 232);
    const lines = 5, prog = clamp(a / 1.8) * lines;
    ctx.strokeStyle = gv(55); ctx.lineWidth = Math.max(2, h * 0.005);
    let px = -pw / 2 + pw * 0.1, py = -ph / 2 + ph * 0.2;
    const R = rng(11);
    for (let l = 0; l < lines; l++) {
      const frac = clamp(prog - l), ly = -ph / 2 + ph * (0.2 + l * 0.15), lx0 = -pw / 2 + pw * 0.1, len = pw * (l === lines - 1 ? 0.45 : 0.8) * frac;
      if (frac <= 0) break;
      ctx.beginPath();
      for (let s = 0; s <= 40; s++) { const u = (s / 40) * len; const yy = ly + Math.sin(u * 0.35 + l) * ph * 0.025 * R.range(0.6, 1); s ? ctx.lineTo(lx0 + u, yy) : ctx.moveTo(lx0 + u, yy); }
      ctx.stroke();
      px = lx0 + len; py = ly;
    }
    // quill: feather tip at the pen point
    ctx.translate(px, py); ctx.rotate(-0.95);
    ctx.fillStyle = gv(245); ctx.beginPath(); ctx.ellipse(w * 0.11, 0, w * 0.1, h * 0.028, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gv(70); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.22, 0); ctx.stroke();
    ctx.restore();
  },
  steamTrain(ctx, x, y, w, h, a = 0) {
    const X = (u) => x + u * w, Y = (v) => y + v * h;
    vGrad(ctx, x, y, w, h * 0.7, 175, 238);
    glow(ctx, X(0.8), Y(0.24), w * 0.16, 255, 0.6); disc(ctx, X(0.8), Y(0.24), w * 0.045, 252);
    poly(ctx, [[x, Y(0.62)], [X(0.15), Y(0.48)], [X(0.35), Y(0.58)], [X(0.55), Y(0.45)], [X(0.78), Y(0.56)], [X(1), Y(0.5)], [X(1), Y(0.72)], [x, Y(0.72)]], 160);
    poly(ctx, [[x, Y(0.7)], [X(0.25), Y(0.6)], [X(0.5), Y(0.68)], [X(0.8), Y(0.6)], [X(1), Y(0.66)], [X(1), Y(0.76)], [x, Y(0.76)]], 125);
    vGrad(ctx, x, Y(0.75), w, h * 0.25, 105, 70);
    box(ctx, x, Y(0.795), w, h * 0.008, 40); box(ctx, x, Y(0.815), w, h * 0.008, 40);
    // telegraph poles passing
    for (let i = 0; i < 5; i++) {
      const u = (((i * 0.27 - a * 0.22) % 1.35) + 1.35) % 1.35 - 0.1;
      box(ctx, X(u), Y(0.5), w * 0.008, h * 0.3, 55); box(ctx, X(u) - w * 0.02, Y(0.52), w * 0.048, h * 0.008, 55);
    }
    // train (slow drift right), wheels turn
    const ox = X(0.08 + a * 0.015), base = Y(0.79), s = w * 0.0088;
    const T = (u, v) => [ox + u * s, base - v * s];
    const ink = 32;
    poly(ctx, [T(0, 3), T(26, 3), T(26, 13), T(0, 13)], ink); // carriages
    poly(ctx, [T(28, 3), T(54, 3), T(54, 13), T(28, 13)], ink);
    for (const c0 of [0, 28]) for (let k = 0; k < 6; k++) box(ctx, ...T(c0 + 2 + k * 4, 11), s * 2.4, s * 3.5, 180);
    poly(ctx, [T(56, 3), T(66, 3), T(66, 11), T(56, 11)], ink); // tender
    poly(ctx, [T(68, 3), T(90, 3), T(90, 9.5), T(68, 9.5)], ink); // boiler
    poly(ctx, [T(66, 3), T(74, 3), T(74, 15), T(66, 15)], ink); // cab
    poly(ctx, [T(65, 15), T(75, 15), T(75, 16), T(65, 16)], ink);
    box(ctx, ...T(68, 13), s * 4, s * 2.5, 190); // cab window
    poly(ctx, [T(85, 9.5), T(88, 9.5), T(88.6, 15), T(84.4, 15)], ink); // chimney
    poly(ctx, [T(90, 3), T(95, 1), T(90, 6)], ink); // cow-catcher
    for (const [wx, wr] of [[4, 2], [22, 2], [32, 2], [50, 2], [59, 2], [71, 3], [79, 3], [87, 2]]) {
      const [cx, cy] = T(wx, wr);
      disc(ctx, cx, cy, wr * s, 20);
      ctx.strokeStyle = gv(120); ctx.lineWidth = 1.5;
      const ang = (a * 9) / wr;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * wr * s * 0.8, cy + Math.sin(ang) * wr * s * 0.8); ctx.lineTo(cx - Math.cos(ang) * wr * s * 0.8, cy - Math.sin(ang) * wr * s * 0.8); ctx.stroke();
    }
    const [sx, sy] = T(86.5, 16);
    puffs(ctx, sx, sy, a, { n: 11, life: 1.6, dx: -w * 0.42, dy: -h * 0.22, r0: w * 0.018, r1: w * 0.07, v: 232, seed: 7 });
  },
  steamship(ctx, x, y, w, h, a = 0) {
    const X = (u) => x + u * w, Y = (v) => y + v * h;
    vGrad(ctx, x, y, w, h * 0.62, 120, 215);
    glow(ctx, X(0.24), Y(0.42), w * 0.22, 255, 0.55); disc(ctx, X(0.24), Y(0.42), w * 0.05, 250);
    vGrad(ctx, x, Y(0.6), w, h * 0.4, 110, 55);
    for (let r = 0; r < 9; r++) { // wave crests drift
      const yy = Y(0.63 + r * r * 0.0048), amp = h * (0.004 + r * 0.0012), k = 18 - r * 1.2;
      ctx.strokeStyle = gv(150 + r * 6, 0.55); ctx.lineWidth = 1.2 + r * 0.35; ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const u = i / 60; const yv = yy + Math.sin(u * k + a * (1.4 + r * 0.25) + r) * amp; i ? ctx.lineTo(X(u), yv) : ctx.moveTo(X(u), yv); }
      ctx.stroke();
    }
    box(ctx, X(0.2), Y(0.6), w * 0.08, h * 0.3, 230, 0.18); // sun path on the water
    const bob = Math.sin(a * 2.2) * h * 0.006, ox = X(0.36), base = Y(0.66) + bob, s = w * 0.0055;
    const T = (u, v) => [ox + u * s, base - v * s];
    const ink = 26;
    poly(ctx, [T(0, 8), T(84, 8), T(96, 14), T(92, 4), T(84, 0), T(6, 0), T(-2, 6)], ink);
    box(ctx, ...T(2, 7), s * 88, s * 1.2, 200);
    poly(ctx, [T(18, 8), T(70, 8), T(70, 15), T(18, 15)], 60);
    poly(ctx, [T(26, 15), T(62, 15), T(62, 20), T(26, 20)], 70);
    for (let k = 0; k < 10; k++) disc(ctx, ...T(21 + k * 5, 11.5), s * 0.9, 215);
    for (const fx of [34, 50]) { poly(ctx, [T(fx, 20), T(fx + 6, 20), T(fx + 6.6, 33), T(fx - 0.6, 33)], ink); box(ctx, ...T(fx - 0.6, 31), s * 7.2, s * 1.6, 180); }
    ctx.strokeStyle = gv(ink); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(...T(12, 8)); ctx.lineTo(...T(12, 40)); ctx.moveTo(...T(78, 8)); ctx.lineTo(...T(78, 36)); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...T(12, 40)); ctx.lineTo(...T(-2, 6)); ctx.moveTo(...T(12, 40)); ctx.lineTo(...T(78, 36)); ctx.lineTo(...T(96, 14)); ctx.stroke();
    for (const fx of [37, 53]) { const [sx, sy] = T(fx, 33); puffs(ctx, sx, sy, a + fx * 0.01, { n: 8, life: 2.2, dx: -w * 0.3, dy: -h * 0.16, r0: w * 0.012, r1: w * 0.05, v: 205, seed: fx }); }
    ctx.strokeStyle = gv(40); ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { // gulls
      const gx = X(0.62 + i * 0.09 + Math.sin(a * 0.8 + i) * 0.01), gy = Y(0.22 + i * 0.05), fl = 0.5 + 0.5 * Math.sin(a * 6 + i * 2);
      ctx.beginPath(); ctx.moveTo(gx - w * 0.018, gy - h * 0.01 * fl); ctx.quadraticCurveTo(gx - w * 0.008, gy - h * 0.012, gx, gy); ctx.quadraticCurveTo(gx + w * 0.008, gy - h * 0.012, gx + w * 0.018, gy - h * 0.01 * fl); ctx.stroke();
    }
  },
  cottage(ctx, x, y, w, h, a = 0) {
    const X = (u) => x + u * w, Y = (v) => y + v * h;
    vGrad(ctx, x, y, w, h * 0.72, 205, 245);
    for (let i = 0; i < 3; i++) { const cx = X(((0.2 + i * 0.33 + a * 0.012) % 1.2) - 0.05), cy = Y(0.14 + i * 0.06); for (let k = 0; k < 4; k++) disc(ctx, cx + (k - 1.5) * w * 0.03, cy - (k % 2) * h * 0.02, w * 0.035, 250, 0.9); }
    poly(ctx, [[x, Y(0.7)], [X(0.4), Y(0.62)], [X(1), Y(0.68)], [X(1), Y(1)], [x, Y(1)]], 140);
    poly(ctx, [[X(0.47), Y(0.66)], [X(0.53), Y(0.66)], [X(0.7), Y(1)], [X(0.32), Y(1)]], 205);
    // tree
    box(ctx, X(0.13), Y(0.42), w * 0.025, h * 0.26, 45);
    for (const [cx, cy, r, v] of [[0.14, 0.36, 0.085, 80], [0.09, 0.41, 0.065, 95], [0.19, 0.41, 0.065, 70], [0.14, 0.29, 0.065, 100]]) disc(ctx, X(cx), Y(cy), w * r, v);
    // cottage
    poly(ctx, [[X(0.36), Y(0.4)], [X(0.64), Y(0.4)], [X(0.64), Y(0.66)], [X(0.36), Y(0.66)]], 196);
    poly(ctx, [[X(0.33), Y(0.41)], [X(0.5), Y(0.22)], [X(0.67), Y(0.41)]], 52);
    box(ctx, X(0.57), Y(0.24), w * 0.035, h * 0.12, 60);
    puffs(ctx, X(0.587), Y(0.24), a, { n: 7, life: 2.4, dx: w * 0.12, dy: -h * 0.2, r0: w * 0.012, r1: w * 0.04, v: 235, seed: 21 });
    box(ctx, X(0.47), Y(0.53), w * 0.06, h * 0.13, 48);
    for (const wx of [0.39, 0.56]) { box(ctx, X(wx), Y(0.46), w * 0.06, h * 0.07, 245); box(ctx, X(wx + 0.027), Y(0.46), w * 0.006, h * 0.07, 60); box(ctx, X(wx), Y(0.49), w * 0.06, h * 0.006, 60); }
    for (let i = 0; i < 9; i++) box(ctx, X(0.68 + i * 0.026), Y(0.6), w * 0.01, h * 0.08, 225);
    box(ctx, X(0.68), Y(0.62), w * 0.23, h * 0.01, 225);
    // mailbox: the letter drops in over the first second
    box(ctx, X(0.79), Y(0.52), w * 0.012, h * 0.2, 45);
    ctx.fillStyle = gv(40); ctx.beginPath(); ctx.roundRect(X(0.75), Y(0.45), w * 0.095, h * 0.075, [w * 0.04, w * 0.04, 2, 2]); ctx.fill();
    box(ctx, X(0.84), Y(0.42), w * 0.006, h * 0.06, 40); box(ctx, X(0.84), Y(0.42), w * 0.028, h * 0.022, 200);
    const drop = clamp(a / 1.0), ly = lerp(0.3, 0.435, drop * drop);
    ctx.save(); ctx.translate(X(0.797), Y(ly)); ctx.rotate(-0.12 * (1 - drop));
    box(ctx, -w * 0.03, -h * 0.025, w * 0.06, h * 0.04, 252);
    ctx.strokeStyle = gv(120); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-w * 0.03, -h * 0.025); ctx.lineTo(0, -h * 0.005); ctx.lineTo(w * 0.03, -h * 0.025); ctx.stroke();
    ctx.restore();
    box(ctx, X(0.745), Y(0.448), w * 0.105, h * 0.012, 40); // slot lip over the letter
  },
};

/** Countdown leader frame (my own design): grey field, sweep wedge from 12 o'clock, rings, cross, big number. n = 0 -> start mark. */
export function paintLeader(ctx, x, y, w, h, { n = 3, sweep = 0 } = {}) {
  const L = S.leader, cx = x + w / 2, cy = y + h / 2, R = h * 0.36;
  ctx.fillStyle = L.ground; ctx.fillRect(x, y, w, h);
  if (n === 0) {
    ctx.fillStyle = L.dark; ctx.fillRect(x, y + h * 0.42, w, h * 0.16);
    ctx.fillStyle = L.ring; ctx.font = `700 ${h * 0.1}px ${L.font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.letterSpacing = `${h * 0.02}px`; ctx.fillText("SAMPLE", cx, cy + h * 0.004);
    ctx.fillStyle = L.dark; ctx.font = `700 ${h * 0.06}px ${L.font}`; ctx.fillText("START", cx, y + h * 0.28);
    ctx.beginPath(); ctx.moveTo(cx - h * 0.05, y + h * 0.66); ctx.lineTo(cx + h * 0.05, y + h * 0.66); ctx.lineTo(cx, y + h * 0.75); ctx.closePath(); ctx.fill();
    ctx.letterSpacing = "0px";
    return;
  }
  // swept sector (darker), clockwise from 12 o'clock
  if (sweep > 0) {
    ctx.fillStyle = "rgba(40,38,34,0.55)"; ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.hypot(w, h), -Math.PI / 2, -Math.PI / 2 + sweep * Math.PI * 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = L.ring; ctx.lineWidth = h * 0.006; ctx.beginPath(); ctx.moveTo(cx, cy);
    const ang = -Math.PI / 2 + sweep * Math.PI * 2; ctx.lineTo(cx + Math.cos(ang) * w, cy + Math.sin(ang) * w); ctx.stroke();
  }
  ctx.strokeStyle = L.dark; ctx.lineWidth = h * 0.004;
  ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); ctx.stroke();
  ctx.strokeStyle = L.ring; ctx.lineWidth = h * 0.012;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = h * 0.006; ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 12; k++) { const an = (k / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * R * 1.04, cy + Math.sin(an) * R * 1.04); ctx.lineTo(cx + Math.cos(an) * R * 1.12, cy + Math.sin(an) * R * 1.12); ctx.stroke(); }
  ctx.fillStyle = L.dark; ctx.font = `700 ${h * 0.46}px ${L.font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy + h * 0.02);
  ctx.strokeStyle = L.dark; ctx.lineWidth = h * 0.008; // corner marks
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const px = x + w * (0.06 + sx * 0.88), py = y + h * (0.08 + sy * 0.84), dx = sx ? -1 : 1, dy = sy ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(px, py + dy * h * 0.06); ctx.lineTo(px, py); ctx.lineTo(px + dx * h * 0.06, py); ctx.stroke();
  }
}

/** Intertitle card. layout "lower" = framed card over the lower part of the picture; "full" = whole frame. u = fade 0..1. */
export function paintIntertitle(ctx, x, y, w, h, text, { u = 1, layout = "lower", sub = "" } = {}) {
  if (u <= 0) return;
  const I = S.intertitle;
  const [x0, y0, x1, y1] = layout === "full" ? [0.0, 0.0, 1.0, 1.0] : I.panel;
  const px = x + x0 * w, py = y + y0 * h, pw = (x1 - x0) * w, ph = (y1 - y0) * h;
  ctx.save();
  ctx.globalAlpha = u;
  ctx.fillStyle = I.ground; ctx.fillRect(px, py, pw, ph);
  const b = I.border * h, m1 = h * (layout === "full" ? 0.06 : 0.02), m2 = m1 + b * 2.4;
  ctx.strokeStyle = I.ink; ctx.lineWidth = b; ctx.strokeRect(px + m1, py + m1, pw - 2 * m1, ph - 2 * m1);
  ctx.lineWidth = b * 0.45; ctx.strokeRect(px + m2, py + m2, pw - 2 * m2, ph - 2 * m2);
  ctx.fillStyle = I.ink;
  const dia = (cx, cy, r) => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); };
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dia(px + m1 + sx * (pw - 2 * m1), py + m1 + sy * (ph - 2 * m1), b * 2.6);
  // flourish on the top rule
  const fx = px + pw / 2, fy = py + m1;
  ctx.fillStyle = I.ground; ctx.fillRect(fx - h * 0.07, fy - b * 2, h * 0.14, b * 4);
  ctx.fillStyle = I.ink; dia(fx, fy, b * 2.2); dia(fx - h * 0.045, fy, b * 1.2); dia(fx + h * 0.045, fy, b * 1.2);
  // text, fitted to the inner width
  const size = (layout === "full" ? 1.7 : 1) * I.textSize * h;
  ctx.font = `400 ${size}px ${I.font}`;
  ctx.letterSpacing = `${size * I.tracking}px`;
  const maxW = pw - 2 * m2 - h * 0.06;
  const tw = ctx.measureText(text).width;
  const k = tw > maxW ? maxW / tw : 1;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = I.ink;
  ctx.save(); ctx.translate(px + pw / 2, py + ph / 2 + (sub ? -size * 0.25 : size * 0.04)); ctx.scale(k, 1); ctx.fillText(text, 0, 0); ctx.restore();
  if (sub) {
    const s2 = size * 0.28; ctx.font = `400 ${s2}px ${I.font}`; ctx.letterSpacing = `${s2 * 0.4}px`;
    ctx.fillText(sub, px + pw / 2, py + ph / 2 + size * 0.62);
  }
  ctx.restore();
  ctx.letterSpacing = "0px";
}

/** drawPicture: a picture painter composed for a lower intertitle card — drawn once, then again lifted by
 *  `intertitle.lift` so the subject sits above the card and the ground continues underneath it. */
export function drawPicture(ctx, W, H, painter, a) {
  const fn = typeof painter === "function" ? painter : PICTURES[painter] ?? PICTURES.cottage;
  const lift = S.intertitle.lift * H;
  ctx.save(); fn(ctx, 0, 0, W, H, a); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H - lift); ctx.clip(); ctx.translate(0, -lift); fn(ctx, 0, 0, W, H, a); ctx.restore();
}

// =====================================================================================================
// Shaders
// =====================================================================================================
const PROJECTED_SHADER = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uPic; uniform vec4 uImg; uniform vec2 uWeave; uniform float uFlicker, uLamp, uGain, uVig, uHot, uSoft, uSepia, uSpeckAlpha, uAspect;
    uniform vec3 uDark, uLight, uBase; uniform vec4 uSpecks[8]; uniform int uNSpecks; uniform vec4 uScr[3]; uniform int uNScr;
    varying vec2 vUv;
    void main(){
      vec2 iuv = (vUv - uImg.xy) / (uImg.zw - uImg.xy);
      vec2 e = min(iuv, 1.0 - iuv);
      float mask = smoothstep(-uSoft, uSoft, e.x) * smoothstep(-uSoft * 1.33, uSoft * 1.33, e.y);
      vec2 puv = iuv + uWeave;
      vec3 c = texture2D(uPic, clamp(puv, 0.001, 0.999)).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      for (int i = 0; i < 8; i++) {
        if (i >= uNSpecks) break;
        vec4 s = uSpecks[i];
        vec2 d = (puv - s.xy) * vec2(uAspect, 1.0);
        float a = (1.0 - smoothstep(s.z * 0.5, s.z, length(d))) * uSpeckAlpha;
        l = mix(l, s.w > 0.5 ? 0.95 : 0.01, a);
      }
      for (int i = 0; i < 3; i++) {
        if (i >= uNScr) break;
        vec4 s = uScr[i];
        float xx = s.x + 0.0025 * sin(puv.y * 7.0 + s.x * 40.0);
        float a = (1.0 - smoothstep(s.z * 0.5, s.z, abs(puv.x - xx))) * s.y;
        l = mix(l, s.w > 0.5 ? 0.9 : 0.02, a);
      }
      vec3 tone = mix(vec3(l), mix(uDark, uLight, l), uSepia);
      vec2 q = iuv - 0.5; float r = length(q * vec2(1.0, 0.82));
      float vig = 1.0 - uVig * smoothstep(0.16, 0.72, r) + uHot * (1.0 - smoothstep(0.0, 0.42, r));
      vec3 proj = tone * vig * uFlicker * uLamp * uGain * mask;
      gl_FragColor = vec4(uBase + proj, 1.0);
    }`,
};

const BEAM_SHADER = {
  vertexShader: /* glsl */ `varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    ${GLSL_SAFE}
    #define STEPS __STEPS__
    uniform vec3 uCam, uColor, uDrift; uniform float uTx, uTy, uNear, uFar, uDensity, uEdge, uDust, uDustScale, uStreaks, uStreakFreq, uImage, uLevel, uApex, uTime;
    uniform vec2 uWeave; uniform float uLum[__LN__];
    varying vec3 vLocal;
    // the picture's luminance on a coarse CPU-computed grid (bilinear), so the beam carries the image's light pattern
    float lumAt(int x, int y) { return uLum[clamp(y, 0, __LH__ - 1) * __LW__ + clamp(x, 0, __LW__ - 1)]; }
    float imgL(vec2 q) {
      vec2 g = clamp(q, 0.0, 1.0) * vec2(float(__LW__), float(__LH__)) - 0.5;
      vec2 i = floor(g), f = g - i; int x = int(i.x), y = int(i.y);
      return mix(mix(lumAt(x, y), lumAt(x + 1, y), f.x), mix(lumAt(x, y + 1), lumAt(x + 1, y + 1), f.x), f.y);
    }
    float hh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hh(i), hh(i+vec3(1,0,0)), f.x), mix(hh(i+vec3(0,1,0)), hh(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(hh(i+vec3(0,0,1)), hh(i+vec3(1,0,1)), f.x), mix(hh(i+vec3(0,1,1)), hh(i+vec3(1,1,1)), f.x), f.y), f.z); }
    void clipP(vec3 n, float c, vec3 ro, vec3 rd, inout float s0, inout float s1){
      float dn = dot(n, rd), on = dot(n, ro) + c;
      if (abs(dn) < 1e-6) { if (on > 0.0) s1 = -1.0; return; }
      float s = -on / dn;
      if (dn < 0.0) s0 = max(s0, s); else s1 = min(s1, s);
    }
    void main(){
      vec3 dv = vLocal - uCam; float sMax = length(dv); vec3 rd = dv / max(sMax, 1e-5);
      float s0 = 0.0, s1 = sMax;
      clipP(vec3(1.0, 0.0, uTx), 0.0, uCam, rd, s0, s1);
      clipP(vec3(-1.0, 0.0, uTx), 0.0, uCam, rd, s0, s1);
      clipP(vec3(0.0, 1.0, uTy), 0.0, uCam, rd, s0, s1);
      clipP(vec3(0.0, -1.0, uTy), 0.0, uCam, rd, s0, s1);
      clipP(vec3(0.0, 0.0, 1.0), uNear, uCam, rd, s0, s1);
      clipP(vec3(0.0, 0.0, -1.0), -uFar, uCam, rd, s0, s1);
      if (s1 <= s0 || uLevel <= 0.0) discard;
      float ds = (s1 - s0) / float(STEPS);
      float acc = 0.0;
      for (int i = 0; i < STEPS; i++) {
        float s = s0 + (float(i) + 0.5) * ds;
        vec3 p = uCam + rd * s;
        float d = max(-p.z, 1e-3);
        float u = p.x / (uTx * d), v = p.y / (uTy * d);
        float edge = (1.0 - smoothstep(1.0 - uEdge, 1.0, abs(u))) * (1.0 - smoothstep(1.0 - uEdge, 1.0, abs(v)));
        float img = imgL(vec2(u, v) * 0.5 + 0.5 + uWeave);
        float streak = vn(vec3(u * uStreakFreq, v * uStreakFreq, 0.5));
        float dust = vn(p * uDustScale + uDrift * uTime) * 0.6 + vn(p * uDustScale * 2.7 + uDrift * uTime * 1.7 + 11.0) * 0.4;
        float along = smoothstep(0.0, 0.5, d) * mix(uApex, 0.7, clamp(d / uFar, 0.0, 1.0));
        acc += edge * along * mix(1.0, img * 1.8, uImage) * mix(1.0, 0.35 + 1.3 * streak, uStreaks) * (1.0 - uDust + uDust * 2.0 * dust);
      }
      gl_FragColor = vec4(uColor * (acc * ds * uDensity * uLevel), 1.0);
    }`,
};

const MOTES_SHADER = {
  vertexShader: /* glsl */ `
    attribute vec3 aBase; attribute vec4 aPhase;
    uniform float uTime, uDrift, uSize, uScale, uTx, uTy, uNear, uFar, uMode; uniform vec3 uBox;
    varying float vLit;
    void main(){
      vec3 p;
      vec3 wob = vec3(sin(uTime * aPhase.w * 0.7 + aPhase.x), sin(uTime * aPhase.w * 0.5 + aPhase.y) + 0.35 * uTime * aPhase.w * 0.15, sin(uTime * aPhase.w * 0.6 + aPhase.z)) * uDrift;
      float inside = 1.0;
      if (uMode < 0.5) {
        float d = mix(uNear + 0.6, uFar - 0.2, aBase.z);
        p = vec3(aBase.x * uTx * d, aBase.y * uTy * d, -d) + wob * (0.3 + d * 0.08);
        float dd = max(-p.z, 1e-3);
        float u = p.x / (uTx * dd), v = p.y / (uTy * dd);
        inside = (1.0 - smoothstep(0.9, 1.0, abs(u))) * (1.0 - smoothstep(0.9, 1.0, abs(v)));
      } else {
        p = (aBase - 0.5) * uBox + wob;
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float px = uSize * uScale / max(-mv.z, 0.05);
      vLit = inside * (0.55 + 0.45 * sin(uTime * 3.0 * aPhase.w + aPhase.x * 5.0)) * clamp(px / 1.5, 0.15, 1.0);
      gl_PointSize = clamp(px, 1.0, 9.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uLevel; varying float vLit;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float r = length(c);
      float a = 1.0 - smoothstep(0.15, 0.5, r);
      gl_FragColor = vec4(uColor * (a * vLit * uLevel), 1.0);
    }`,
};

const STRIP_SHADER = {
  vertexShader: /* glsl */ `attribute float aArc; varying vec2 vUv; varying float vArc; void main(){ vUv = uv; vArc = aArc; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMap; uniform vec3 uLight; uniform float uFocus, uSigma, uFloor, uLevel;
    varying vec2 vUv; varying float vArc;
    void main(){
      vec3 c = texture2D(uMap, vUv).rgb;
      float dx = vArc - uFocus;
      float g = uFloor + (1.0 - uFloor) * exp(-dx * dx / (2.0 * uSigma * uSigma));
      gl_FragColor = vec4(c * uLight * (g * uLevel), 1.0);
    }`,
};

const TABLE_SHADER = {
  vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform vec2 uFocus; uniform float uSigma, uLevel; varying vec3 vP;
    void main(){ vec2 d = vP.xy - uFocus; float g = exp(-dot(d, d) / (2.0 * uSigma * uSigma)); gl_FragColor = vec4(uColor * (g * uLevel), 1.0); }`,
};

// =====================================================================================================
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const M = materials;
  const RM = S.room, SC = S.screen, P = S.projector, RL = S.reel;
  const shadow = (o, cast = true, receive = true) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = receive; } }); return o; };

  // ---------------------------------------------------------------- the projected programme (one canvas, keyed redraw)
  function programme({ pictures = [], titles = [], endTitle = "THE END", endSub = "SAMPLE", fps = S.wear.fps } = {}) {
    const W = S.programme.w, H = S.programme.h;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; // seen near 1:1; GPU mip generation was not repeatable bit-for-bit
    // the picture's luminance on a coarse grid (linear light, rows bottom-up) for the beam. Plain numbers, not a texture:
    // sampling a freshly uploaded texture in the beam pass differed by 1 level from the next render (ANGLE/Metal).
    const [LW, LH] = S.beam.lumGrid, K = 4;
    const sm = document.createElement("canvas"); sm.width = LW * K; sm.height = LH * K;
    const smx = sm.getContext("2d", { willReadFrequently: true });
    const lum = new Float32Array(LW * LH);
    const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    let key = null;
    const paint = (st) => {
      resetCtx(ctx);
      if (st.kind === "start") paintLeader(ctx, 0, 0, W, H, { n: 0 });
      else if (st.kind === "leader") paintLeader(ctx, 0, 0, W, H, { n: st.n, sweep: st.sweep });
      else if (st.kind === "picture") {
        drawPicture(ctx, W, H, pictures[st.beat], st.anim / fps);
        resetCtx(ctx, false);
        if (st.card > 0) paintIntertitle(ctx, 0, 0, W, H, titles[st.beat] ?? "", { u: st.card, layout: "lower" });
      } else if (st.kind === "end") {
        ctx.fillStyle = S.intertitle.ground; ctx.fillRect(0, 0, W, H);
        paintIntertitle(ctx, 0, 0, W, H, endTitle, { u: st.card, layout: "full", sub: endSub });
      } else if (st.kind === "runout") { ctx.fillStyle = "#e8e3d8"; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); }
    };
    const set = (st) => {
      const k = JSON.stringify(st);
      if (k === key) return false;
      key = k; paint(st); texture.needsUpdate = true;
      // upload now, outside the frame: an upload inside render() changed one pixel by 1 level vs the next render (ANGLE/Metal)
      stage.renderer.initTexture(texture);
      resetCtx(smx); smx.imageSmoothingEnabled = true; smx.imageSmoothingQuality = "high"; smx.drawImage(canvas, 0, 0, sm.width, sm.height);
      const d = smx.getImageData(0, 0, sm.width, sm.height).data;
      for (let gy = 0; gy < LH; gy++) for (let gx = 0; gx < LW; gx++) {
        let acc = 0;
        for (let yy = 0; yy < K; yy++) for (let xx = 0; xx < K; xx++) {
          const i = ((gy * K + yy) * sm.width + gx * K + xx) * 4;
          acc += 0.2126 * toLin(d[i] / 255) + 0.7152 * toLin(d[i + 1] / 255) + 0.0722 * toLin(d[i + 2] / 255);
        }
        lum[(LH - 1 - gy) * LW + gx] = Math.round((acc / (K * K)) * 1e4) / 1e4;
      }
      return true;
    };
    set({ kind: "start" });
    return { canvas, texture, lum, set, paint };
  }

  function projectedMaterial(texture) {
    const fw = SC.fabric[0], fh = SC.fabric[1];
    const ix = (fw - SC.width) / 2 / fw, iy = (fh - SC.height) / 2 / fh;
    const u = {
      uPic: { value: texture }, uImg: { value: new THREE.Vector4(ix, iy, 1 - ix, 1 - iy) }, uWeave: { value: new THREE.Vector2() },
      uFlicker: { value: 1 }, uLamp: { value: 1 }, uGain: { value: SC.gain }, uVig: { value: SC.vignette }, uHot: { value: SC.hotspot },
      uSoft: { value: SC.soft }, uSepia: { value: SC.sepia }, uSpeckAlpha: { value: S.wear.specks.alpha }, uAspect: { value: SC.width / SC.height },
      uDark: { value: lin(S.palette.sepiaDark) }, uLight: { value: lin(S.palette.sepiaLight) }, uBase: { value: lin(SC.base) },
      uSpecks: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uNSpecks: { value: 0 },
      uScr: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) }, uNScr: { value: 0 },
    };
    const m = new THREE.ShaderMaterial({ ...PROJECTED_SHADER, uniforms: u });
    m.userData.setWear = (w, lamp = 1) => {
      u.uWeave.value.set(w.weave[0], w.weave[1]);
      u.uFlicker.value = w.flicker; u.uLamp.value = lamp;
      u.uNSpecks.value = Math.min(8, w.specks.length);
      for (let i = 0; i < 8; i++) { const s = w.specks[i]; u.uSpecks.value[i].set(...(s ?? [0, 0, 0, 0])); }
      u.uNScr.value = Math.min(3, w.scratches.length);
      for (let i = 0; i < 3; i++) { const s = w.scratches[i]; u.uScr.value[i].set(...(s ?? [0, 0, 0, 0])); }
    };
    return m;
  }

  // ---------------------------------------------------------------- screen (pull-down, masking, roller case, bounce light)
  function screen({ texture } = {}) {
    const g = new THREE.Group();
    const [fw, fh] = SC.fabric, b = SC.border;
    const mat = projectedMaterial(texture ?? new THREE.Texture());
    const fabric = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), mat);
    g.add(fabric);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(fw + 2 * b, fh + 2 * b, 0.02), M.masking);
    mask.position.z = -0.015; g.add(mask);
    const caseG = new THREE.Mesh(new THREE.CylinderGeometry(SC.caseR, SC.caseR, fw + 2 * b + SC.caseOver, 24).rotateZ(Math.PI / 2), M.case);
    caseG.position.set(0, fh / 2 + b + SC.caseR * 0.9, 0.02); g.add(caseG);
    for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(SC.caseR * 1.15, SC.caseR * 1.15, 0.04, 20).rotateZ(Math.PI / 2), M.chrome); cap.position.set(sx * ((fw + 2 * b + SC.caseOver) / 2 + 0.02), caseG.position.y, 0.02); g.add(cap); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, fw + 2 * b + 0.06, 12).rotateZ(Math.PI / 2), M.case);
    bar.position.set(0, -fh / 2 - b - 0.02, 0.02); g.add(bar);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, SC.pull.drop, 6), M.dark);
    cord.position.set(0, bar.position.y - SC.pull.drop / 2, 0.03); g.add(cord);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(SC.pull.ring, 0.009, 8, 24), M.chrome);
    ring.position.set(0, bar.position.y - SC.pull.drop - SC.pull.ring, 0.03); g.add(ring);
    const bounce = new THREE.PointLight(RM.bounce.color, 0, RM.bounce.distance, 2);
    bounce.position.set(0, 0, RM.bounce.offset); g.add(bounce);
    shadow(g, false, true);
    g.userData = { fabric, material: mat, bounce, setWear: mat.userData.setWear, setBounce: (k) => { bounce.intensity = RM.bounce.intensity * k; } };
    return g;
  }

  // ---------------------------------------------------------------- volumetric light cone (raymarched pyramid)
  function lightCone({ length = RM.lensZ - RM.screenZ, width = SC.width, height = SC.height } = {}) {
    const B = S.beam, [LW, LH] = B.lumGrid;
    const far = length - 0.03, tx = width / 2 / length, ty = height / 2 / length;
    const geo = new THREE.BoxGeometry(2 * tx * far + 0.02, 2 * ty * far + 0.02, far).translate(0, 0, -far / 2);
    const u = {
      uCam: { value: new THREE.Vector3() }, uColor: { value: lin(B.color) }, uDrift: { value: new THREE.Vector3(...B.dustDrift) },
      uTx: { value: tx }, uTy: { value: ty }, uNear: { value: B.near }, uFar: { value: far }, uDensity: { value: B.density }, uEdge: { value: B.edge },
      uDust: { value: B.dust }, uDustScale: { value: B.dustScale }, uStreaks: { value: B.streaks }, uStreakFreq: { value: B.streakFreq },
      uImage: { value: B.image }, uLevel: { value: 0 }, uApex: { value: B.apexBoost }, uTime: { value: 0 },
      uWeave: { value: new THREE.Vector2() }, uLum: { value: new Float32Array(LW * LH).fill(0.5) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_SHADER.vertexShader,
      fragmentShader: BEAM_SHADER.fragmentShader.replace("__STEPS__", String(B.steps)).replaceAll("__LN__", String(LW * LH)).replaceAll("__LW__", String(LW)).replaceAll("__LH__", String(LH)),
      uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    const tmp = new THREE.Vector3();
    mesh.userData = {
      tx, ty, far, near: B.near,
      /** update({ t, camera, level, weave }) — camera world position into beam space (no rotation: beam looks down -Z). */
      update({ t, camera, level = 1, weave = [0, 0], lum = null }) {
        if (lum) u.uLum.value.set(lum);
        mesh.updateWorldMatrix(true, false);
        tmp.copy(camera.position); mesh.worldToLocal(tmp);
        u.uCam.value.copy(tmp); u.uTime.value = t; u.uLevel.value = level; u.uWeave.value.set(weave[0], weave[1]);
        mesh.visible = level > 1e-4;
      },
    };
    return mesh;
  }

  // ---------------------------------------------------------------- dust motes (seeded; positions are f(t) in the shader)
  function dustMotes({ count = S.motes.count, seed = S.motes.seed, beam = null, box: boxSize = null, color = S.beam.color, level = S.motes.level } = {}) {
    const R = rng(seed);
    const base = new Float32Array(count * 3), phase = new Float32Array(count * 4), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base.set(beam ? [R.range(-1, 1), R.range(-1, 1), R.next() ** 0.7] : [R.next(), R.next(), R.next()], i * 3);
      phase.set([R.range(0, 6.28), R.range(0, 6.28), R.range(0, 6.28), R.range(0.4, 1.4)], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 4));
    const u = {
      uTime: { value: 0 }, uDrift: { value: S.motes.drift }, uSize: { value: S.motes.size }, uScale: { value: 1000 },
      uTx: { value: beam?.tx ?? 0.2 }, uTy: { value: beam?.ty ?? 0.15 }, uNear: { value: beam?.near ?? 0.1 }, uFar: { value: beam?.far ?? 10 },
      uMode: { value: beam ? 0 : 1 }, uBox: { value: new THREE.Vector3(...(boxSize ?? [1, 1, 1])) }, uColor: { value: lin(color) }, uLevel: { value: level },
    };
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ ...MOTES_SHADER, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; pts.renderOrder = 6;
    pts.userData = {
      update({ t, camera, level: k = 1, height = 1080 }) {
        u.uTime.value = t; u.uLevel.value = level * k;
        u.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 32) / 2));
        pts.visible = k > 1e-4;
      },
    };
    return pts;
  }

  // ---------------------------------------------------------------- reel (two holed flanges, film pack, hub)
  function reelProp({ radius = RL.flangeR, hubR = RL.hubR, gap = RL.flangeGap, holes = RL.holes, holeR = RL.holeR } = {}) {
    const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
    const flangeShape = shapes.withHoles(shapes.circle(radius), Array.from({ length: holes }, (_, i) => {
      const a = (i / holes) * Math.PI * 2 + 0.4; return shapes.circle(holeR, { x: Math.cos(a) * radius * 0.58, y: Math.sin(a) * radius * 0.58 });
    }));
    const fg = new THREE.ExtrudeGeometry(flangeShape, { depth: 0.006, bevelEnabled: false, curveSegments: 40 }).rotateY(Math.PI / 2);
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(fg, M.reel); f.position.x = sx * gap / 2 - (sx > 0 ? 0 : 0.006); spin.add(f); }
    // film pack: concentric-ring canvas on the caps
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d"); const R0 = rng(5);
    x.fillStyle = S.palette.film; x.fillRect(0, 0, 256, 256);
    for (let r = 128; r > 4; r -= 1.6) { x.strokeStyle = `rgba(${R0.int(30, 70)},${R0.int(18, 40)},${R0.int(10, 24)},0.9)`; x.lineWidth = 1; x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke(); }
    const capTex = new THREE.CanvasTexture(c); capTex.colorSpace = THREE.SRGBColorSpace;
    const capMat = M.filmPack.clone(); capMat.map = capTex;
    const pack = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, gap - 0.004, 48).rotateZ(Math.PI / 2), [M.film, capMat, capMat]);
    spin.add(pack);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubR * 0.6, hubR * 0.6, gap + 0.04, 16).rotateZ(Math.PI / 2), M.chrome);
    spin.add(hub);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(hubR * 0.32, hubR * 0.32, gap + 0.07, 6).rotateZ(Math.PI / 2), M.dark);
    spin.add(nut);
    shadow(g);
    g.userData = { spin, pack, set(angle, packR) { spin.rotation.x = -angle; const r = Math.max(packR, hubR * 0.98); pack.scale.set(1, r, r); } };
    g.userData.set(0, RL.packR0);
    return g;
  }

  // ---------------------------------------------------------------- film ribbon helpers (a strip of film along a (y, z) path at fixed x)
  function ribbonGeometry(n) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    return geo;
  }
  function setRibbon(geo, pts, x, w) {
    const p = geo.attributes.position;
    pts.forEach(([y, z], i) => { p.setXYZ(i * 2, x - w / 2, y, z); p.setXYZ(i * 2 + 1, x + w / 2, y, z); });
    p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  const arcPts = (cy, cz, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return [cy + Math.sin(a) * r, cz + Math.cos(a) * r]; });
  /** tangent point on circle (cy, cz, r) seen from point (py, pz); side picks which of the two. */
  function tangent(cy, cz, r, py, pz, side = 1) {
    const dy = py - cy, dz = pz - cz, d = Math.hypot(dy, dz), phi = Math.atan2(dy, dz), off = Math.acos(clamp(r / d, -1, 1));
    const a = phi + side * off;
    return [cy + Math.sin(a) * r, cz + Math.cos(a) * r];
  }

  // ---------------------------------------------------------------- the projector (local: lens toward -Z, origin at the base centre)
  function projector({ seed = 1 } = {}) {
    const g = new THREE.Group();
    const [bw, bh, bd] = P.body, base = P.base;
    const plate = new THREE.Mesh(new RoundedBoxGeometry(base[0], base[1], base[2], 2, 0.015), M.dark); plate.position.y = base[1] / 2; g.add(plate);
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 12), M.dark); foot.position.set(fx * base[0] * 0.4, -0.012, fz * base[2] * 0.42); g.add(foot); }
    const body = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 4, 0.06), M.enamel); body.position.y = base[1] + bh / 2; g.add(body);
    const panel = new THREE.Mesh(new RoundedBoxGeometry(0.02, bh * 0.62, bd * 0.6, 2, 0.008), M.enamelLight); panel.position.set(-bw / 2 - 0.004, base[1] + bh * 0.5, 0.12); g.add(panel);
    for (let k = 0; k < 3; k++) { const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.035, 18).rotateZ(Math.PI / 2), M.chrome); knob.position.set(-bw / 2 - 0.03, base[1] + bh * 0.28, 0.0 + k * 0.12); g.add(knob); }
    const plaque = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 24).rotateZ(Math.PI / 2), M.chrome); plaque.scale.set(1, 1, 1.8); plaque.position.set(-bw / 2 - 0.016, base[1] + bh * 0.66, 0.2); g.add(plaque);
    // lamp house on the far side with glowing vents + a warm leak light
    const LH = P.lampHouse, top = base[1] + LH.h;
    const house = new THREE.Mesh(new THREE.CylinderGeometry(LH.r, LH.r * 1.05, LH.h, 28), M.enamel); house.position.set(LH.x, base[1] + LH.h / 2, LH.z); g.add(house);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(LH.r * 1.2, LH.r * 1.2, 0.04, 28), M.dark); cap.position.set(LH.x, top + 0.07, LH.z); g.add(cap);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(LH.r * 0.75, LH.r * 0.75, 0.07, 20), M.dark); neck.position.set(LH.x, top + 0.035, LH.z); g.add(neck);
    const vents = [];
    for (let i = 0; i < LH.vents; i++) {
      const a = (i / LH.vents) * Math.PI * 2;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.012, LH.h * 0.38, 0.03), M.vent.clone());
      v.position.set(LH.x + Math.cos(a) * (LH.r + 0.002), base[1] + LH.h * 0.62, LH.z + Math.sin(a) * (LH.r + 0.002)); v.rotation.y = -a; g.add(v); vents.push(v);
    }
    const leak = new THREE.PointLight(P.leak.color, 0, P.leak.distance, 2); leak.position.set(LH.x, top + 0.18, LH.z); g.add(leak);
    // lens
    const L = P.lens, lz0 = -bd / 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(L.r, L.r * 1.06, L.len, 28).rotateX(Math.PI / 2), M.chrome); barrel.position.set(0, L.y, lz0 - L.len / 2); g.add(barrel);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(L.ringR, L.ringR, 0.05, 32).rotateX(Math.PI / 2), M.dark); ring.position.set(0, L.y, lz0 - L.len * 0.55); g.add(ring);
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(L.r * 1.5, L.r * 1.5, 0.04, 28).rotateX(Math.PI / 2), M.dark); mount.position.set(0, L.y, lz0 - 0.01); g.add(mount);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(L.r * 0.82, 28).rotateY(Math.PI), M.lensGlass.clone()); glass.position.set(0, L.y, lz0 - L.len - 0.002); g.add(glass);
    const lensTip = [0, L.y, lz0 - L.len - 0.004];
    // reel arms + reels on the operator side (-X)
    const rx = P.reelX;
    const arm = (y0, z0, y1, z1) => { const m = new THREE.Mesh(rodGeometry([rx + 0.05, y0, z0], [rx + 0.05, y1, z1], 0.018, 10), M.dark); g.add(m); };
    arm(base[1] + bh, -0.22, P.feed[0], P.feed[1]); arm(base[1] + bh, 0.3, P.takeup[0], P.takeup[1]);
    const feed = reelProp(), take = reelProp();
    feed.position.set(rx, P.feed[0], P.feed[1]); take.position.set(rx, P.takeup[0], P.takeup[1]); g.add(feed, take);
    const drums = P.drums.map(([y, z]) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(P.drumR, P.drumR, 0.05, 16).rotateZ(Math.PI / 2), M.chrome); d.position.set(rx, y, z); g.add(d); return d; });
    const gateM = new THREE.Mesh(new THREE.BoxGeometry(0.06, P.gate[0] - P.gate[1] + 0.08, 0.05), M.dark); gateM.position.set(rx + 0.02, (P.gate[0] + P.gate[1]) / 2, P.gate[2] + 0.04); g.add(gateM);
    // film path: static loops + two strands whose tangent points follow the pack radii
    const fw = 0.035, dr = P.drumR + 0.004, [d1, d2] = P.drums, [gt, gb, gz] = P.gate;
    const loopPts = [
      ...arcPts(d1[0], d1[1], dr, Math.PI * 0.5, Math.PI * 1.5, 8).map(([y, z]) => [y, z]),
      [d1[0] - 0.12, d1[1] - 0.2], [gt + 0.03, gz - 0.02], [gt, gz], [gb, gz], [gb - 0.04, gz - 0.06], [d2[0] + 0.04, d2[1] - 0.14],
      ...arcPts(d2[0], d2[1], dr, Math.PI * 1.5, Math.PI * 2.4, 8),
      [0.07, 0.25],
    ];
    const loopGeo = ribbonGeometry(loopPts.length); setRibbon(loopGeo, loopPts, rx, fw);
    const filmMat = M.film;
    g.add(new THREE.Mesh(loopGeo, filmMat));
    const feedStrand = new THREE.Mesh(ribbonGeometry(2), filmMat), takeStrand = new THREE.Mesh(ribbonGeometry(2), filmMat);
    feedStrand.frustumCulled = takeStrand.frustumCulled = false;
    g.add(feedStrand, takeStrand);
    shadow(g);
    for (const m of [glass, ...vents]) { m.castShadow = false; }
    feedStrand.castShadow = takeStrand.castShadow = false;
    const loose = new THREE.Mesh(ribbonGeometry(6), filmMat); loose.frustumCulled = false; loose.castShadow = false; g.add(loose);

    g.userData = {
      lensTip, feed, take, drums, leak, vents, glass,
      /** update({ reels, lamp, film, flap }) — reels from plan.reels(t); lamp 0..1. */
      update({ reels, lamp = 1, t = 0 }) {
        feed.userData.set(reels.feed.angle, reels.feed.r);
        take.userData.set(reels.takeup.angle, reels.takeup.r);
        drums.forEach((d) => { d.rotation.x = -reels.film / P.drumR; });
        const fr = reels.feed.r + 0.002, tr = reels.takeup.r + 0.002;
        // feed strand: from the feed pack's rear tangent down onto drum 1 (left side of the drum)
        const fT = tangent(P.feed[0], P.feed[1], fr, d1[0], d1[1] + dr, 1);
        setRibbon(feedStrand.geometry, reels.loose ? [[d1[0] + dr, d1[1]], [d1[0] + dr, d1[1]]] : [fT, [d1[0], d1[1] + dr]], rx, fw);
        const tT = tangent(P.takeup[0], P.takeup[1], tr, 0.07, 0.25, -1);
        setRibbon(takeStrand.geometry, [[0.07, 0.25], tT], rx, fw);
        // the loose tail after run-out: a short flapping end on the take-up pack
        if (reels.loose) {
          const a0 = reels.takeup.angle;
          const pts = Array.from({ length: 6 }, (_, i) => { const a = -a0 + Math.PI * 0.5 + i * 0.07, r = tr + i * i * 0.004; return [P.takeup[0] + Math.sin(a) * r, P.takeup[1] + Math.cos(a) * r]; });
          setRibbon(loose.geometry, pts, rx, fw); loose.visible = true;
        } else loose.visible = false;
        for (const v of vents) v.material.emissiveIntensity = S.materials.vent.emission.strength * (0.15 + 0.85 * lamp);
        glass.material.emissiveIntensity = S.materials.lensGlass.emission.strength * lamp;
        glass.material.emissive.set(lamp > 0.01 ? S.palette.lens : "#000000");
        leak.intensity = P.leak.intensity * lamp;
      },
    };
    void seed;
    return g;
  }

  // ---------------------------------------------------------------- cabinet stand
  function cabinet({ height }) {
    const [w, d] = P.cabinet;
    const tex = woodTexture({ size: 512, boards: 4, seed: 7, dark: "#1a0f09", mid: "#2b1a10", light: "#3e2717" });
    const m = M.cabinet.clone(); m.map = tex;
    const g = new THREE.Group();
    const bodyM = new THREE.Mesh(new RoundedBoxGeometry(w, height - 0.06, d, 3, 0.02), m); bodyM.position.y = (height - 0.06) / 2; g.add(bodyM);
    const topM = new THREE.Mesh(new RoundedBoxGeometry(w + 0.08, 0.06, d + 0.08, 3, 0.02), m); topM.position.y = height - 0.03; g.add(topM);
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.02, height * 0.55, d * 0.7, 2, 0.008), m); door.position.set(-w / 2 - 0.006, height * 0.45, 0); g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), M.chrome); knob.position.set(-w / 2 - 0.025, height * 0.45, -d * 0.28); g.add(knob);
    return shadow(g);
  }

  // ---------------------------------------------------------------- the screening room (floor, walls, seats)
  function room() {
    const g = new THREE.Group();
    const [z0, z1] = RM.floorDepth;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RM.sideX * 2, z1 - z0).rotateX(-Math.PI / 2), M.floor); floor.position.z = (z0 + z1) / 2; g.add(floor);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(RM.sideX * 2, 7), M.wall); back.position.set(0, 3.5, RM.wallZ); g.add(back);
    for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 7), M.wall); side.rotation.y = -sx * Math.PI / 2; side.position.set(sx * RM.sideX, 3.5, (z0 + z1) / 2); g.add(side); }
    const SE = RM.seats, n = SE.rows.length * SE.perRow;
    const backG = new RoundedBoxGeometry(...SE.back, 3, 0.03), seatG = new RoundedBoxGeometry(SE.back[0] * 0.96, 0.1, 0.46, 2, 0.03);
    const backs = new THREE.InstancedMesh(backG, M.seat, n), seats = new THREE.InstancedMesh(seatG, M.seat, n);
    const o = new THREE.Object3D(); let k = 0;
    for (const z of SE.rows) for (let i = 0; i < SE.perRow; i++) {
      const half = SE.perRow / 2, xi = (i - (half - 0.5)) * SE.spacing + Math.sign(i - (half - 0.5)) * (SE.aisle - SE.spacing) / 2;
      o.position.set(xi, SE.seatH + SE.back[1] / 2 + 0.02, z + 0.24); o.rotation.set(-0.12, 0, 0); o.updateMatrix(); backs.setMatrixAt(k, o.matrix);
      o.position.set(xi, SE.seatH, z); o.rotation.set(0, 0, 0); o.updateMatrix(); seats.setMatrixAt(k, o.matrix);
      k++;
    }
    g.add(backs, seats);
    shadow(g, false, true); backs.castShadow = true;
    return g;
  }

  // ---------------------------------------------------------------- film strip (bent ribbon, sprockets, frame contents as canvases)
  function filmStrip({ frames, pictures = [], titles = [], endTitle = "THE END", endSub = "SAMPLE", anim = 0.6 } = {}) {
    const T = S.strip, ppm = T.pxPerMetre;
    const n = frames.length, x0 = -T.pitch * 0.75, x1 = (n - 1) * T.pitch + T.pitch * 0.75, len = x1 - x0;
    const Wpx = Math.round(len * ppm), Hpx = Math.round(T.height * ppm);
    const canvas = document.createElement("canvas"); canvas.width = Wpx; canvas.height = Hpx;
    const ctx = canvas.getContext("2d");
    resetCtx(ctx);
    ctx.fillStyle = T.base; ctx.fillRect(0, 0, Wpx, Hpx);
    const X = (xm) => (xm - x0) * ppm, Yc = (ym) => (T.height / 2 - ym) * ppm;
    const [iw, ih] = T.image;
    const PW = S.programme.w, PH = S.programme.h;
    const tmp = document.createElement("canvas"); tmp.width = PW; tmp.height = PH; const tc = tmp.getContext("2d");
    const dark = new THREE.Color(S.palette.sepiaDark), light = new THREE.Color(S.palette.sepiaLight); // sRGB-space toning of the strip print
    const dk = dark.clone().convertLinearToSRGB(), lt = light.clone().convertLinearToSRGB();
    frames.forEach((f, k) => {
      resetCtx(tc);
      if (f.kind === "start") paintLeader(tc, 0, 0, PW, PH, { n: 0 });
      else if (f.kind === "leader") paintLeader(tc, 0, 0, PW, PH, { n: f.n, sweep: 0.3 });
      else if (f.kind === "picture") { // intertitles are part of the print: the frame carries its card, as projected
        drawPicture(tc, PW, PH, pictures[f.beat], anim); resetCtx(tc, false);
        paintIntertitle(tc, 0, 0, PW, PH, titles[f.beat] ?? "", { layout: "lower" });
      }
      else { tc.fillStyle = S.intertitle.ground; tc.fillRect(0, 0, PW, PH); paintIntertitle(tc, 0, 0, PW, PH, endTitle, { layout: "full", sub: endSub }); }
      // tone to sepia (same mapping as the projector shader, in display space)
      const img = tc.getImageData(0, 0, PW, PH), d = img.data;
      const sep = SC.sepia;
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        d[i] = 255 * lerp(l, lerp(dk.r, lt.r, l), sep); d[i + 1] = 255 * lerp(l, lerp(dk.g, lt.g, l), sep); d[i + 2] = 255 * lerp(l, lerp(dk.b, lt.b, l), sep);
      }
      tc.putImageData(img, 0, 0);
      const cx = k * T.pitch;
      ctx.drawImage(tmp, X(cx - iw / 2), Yc(ih / 2), iw * ppm, ih * ppm);
      // frame line
      ctx.fillStyle = T.frameLine; ctx.fillRect(X(cx + T.pitch / 2) - 0.012 * ppm, Yc(ih / 2 + 0.02), 0.024 * ppm, (ih + 0.04) * ppm);
      // edge code (latent print) between the picture and the sprockets
      ctx.fillStyle = S.palette.edgeCode; ctx.font = `700 ${0.034 * ppm}px ${S.leader.font}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.globalAlpha = 0.75; ctx.fillText(`SAMPLE  ${String(k + 1).padStart(2, "0")}  ▸`, X(cx - iw / 2), Yc(ih / 2 + 0.045)); ctx.globalAlpha = 1;
    });
    // sprocket holes (bright: the light table shows through)
    const SP = T.sprocket;
    ctx.fillStyle = T.hole;
    for (let xm = x0 + SP.step / 2; xm < x1; xm += SP.step) for (const sy of [-1, 1]) {
      ctx.beginPath(); ctx.roundRect(X(xm - SP.w / 2), Yc(sy * SP.y + SP.h / 2), SP.w * ppm, SP.h * ppm, SP.r * ppm); ctx.fill();
    }
    // long base scratches (static)
    const R = rng(9); ctx.strokeStyle = "rgba(255,230,190,0.08)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { const yy = R.range(0.1, 0.9) * Hpx; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(Wpx, yy + R.range(-6, 6)); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;

    const geo = new THREE.PlaneGeometry(len, T.height, T.segs, 1).translate(x0 + len / 2, 0, 0);
    const pos = geo.attributes.position, arc = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const xs = pos.getX(i); arc[i] = xs;
      const a = xs / T.arcR; pos.setXYZ(i, T.arcR * Math.sin(a), pos.getY(i), T.arcR * (Math.cos(a) - 1));
    }
    geo.setAttribute("aArc", new THREE.BufferAttribute(arc, 1)); geo.computeVertexNormals();
    const u = { uMap: { value: tex }, uLight: { value: lin(T.glow.color) }, uFocus: { value: 0 }, uSigma: { value: T.glow.sigma }, uFloor: { value: T.glow.floor }, uLevel: { value: T.glow.level } };
    const strip = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...STRIP_SHADER, uniforms: u, side: THREE.DoubleSide }));
    const tu = { uColor: { value: lin(T.table.color) }, uFocus: { value: new THREE.Vector2() }, uSigma: { value: T.table.sigma }, uLevel: { value: T.table.level } };
    const table = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.ShaderMaterial({ ...TABLE_SHADER, uniforms: tu }));
    const g = new THREE.Group(); g.add(table, strip);
    g.userData = {
      strip, table, frames, frame: reel.stripFrame,
      /** setFocus(k): fractional frame index the light table is centred on. */
      setFocus(k) {
        u.uFocus.value = k * T.pitch;
        // the light table sits a fixed distance behind the frame in focus, facing it
        const f = reel.stripFrame(k);
        table.position.set(f.x - f.nx * T.table.back, 0, f.z - f.nz * T.table.back);
        table.rotation.y = f.angle;
      },
    };
    g.userData.setFocus(0);
    return g;
  }

  // ---------------------------------------------------------------- standalone props (an intertitle card and a leader card as meshes)
  function cardMesh(width, draw) {
    const PW = S.programme.w, PH = S.programme.h;
    const c = document.createElement("canvas"); c.width = PW; c.height = PH; const x = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * PH) / PW), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    let key = null;
    mesh.userData.setState = (st) => { const k = JSON.stringify(st); if (k === key) return; key = k; resetCtx(x); draw(x, PW, PH, st); tex.needsUpdate = true; };
    return mesh;
  }
  const intertitle = (text, { width = 2, sub = "", layout = "full" } = {}) => {
    const m = cardMesh(width, (x, W, H, st) => { x.fillStyle = S.intertitle.ground; x.fillRect(0, 0, W, H); paintIntertitle(x, 0, 0, W, H, st.text, { u: st.u, layout, sub: st.sub }); });
    m.userData.setState({ text, sub, u: 1 }); return m;
  };
  const countdownLeader = ({ width = 2 } = {}) => {
    const m = cardMesh(width, (x, W, H, st) => paintLeader(x, 0, 0, W, H, st));
    m.userData.setState({ n: 3, sweep: 0 }); return m;
  };

  // ---------------------------------------------------------------- one call wires the projector, screen, beam and motes to a plan
  function projection({ plan, programme: prog, screen: scr, beam, motes, projector: proj, camera, levels = {} }) {
    const LV = { start: 0.6, leader: 0.55, picture: 0.45, end: 0.12, runout: 0.85, blank: 1, ...levels };
    return {
      /** update(t, { beam = 1, motes = 1 }) — per-shot multipliers (a view straight down the cone needs far less haze). */
      update(t, { beam: kb = 1, motes: km = 1 } = {}) {
        const st = plan.programme(t);
        prog.set(st);
        const f = plan.frameAt(t), w = plan.wear(f, plan.wearMode(t)), lamp = plan.lamp(t);
        scr.userData.setWear(w, lamp);
        scr.userData.setBounce(lamp * w.flicker * (LV[st.kind] ?? 0.5));
        beam?.userData.update({ t, camera, level: lamp * w.flicker * kb, weave: w.weave, lum: prog.lum });
        motes?.userData.update({ t, camera, level: lamp * km });
        proj?.userData.update({ reels: plan.reels(t), lamp, t });
        return { state: st, wear: w, lamp };
      },
    };
  }

  const props = { projector, reel: reelProp, cabinet, screen, lightCone, dustMotes, filmStrip, room, programme, projectedMaterial, intertitle, countdownLeader,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }) };
  const factories = {
    room: () => room(),
    projector: (o) => { const g = new THREE.Group(); const c = cabinet({ height: o.dims?.standHeight ?? 1.8 }); const p = projector(o.dims ?? {}); p.position.y = o.dims?.standHeight ?? 1.8; g.add(c, p); g.userData = { ...p.userData, cabinet: c, projector: p }; return g; },
    screen: () => screen(),
  };

  return {
    spec, palette: spec.palette, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, sfx: spec.sfx,
    plan: reel, motion: reel,
    painters: { ...PICTURES, leader: paintLeader, intertitle: paintIntertitle },
    helpers: { projection, tangent },
  };
}
