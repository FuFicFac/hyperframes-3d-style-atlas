// styles/card-table/style.js — "Card Table": baize, a wooden rail, a hanging lamp, original information cards on thick
// linen stock, chips and a dealer button. Every look number lives in spec.js; every move is planned by dealer.js.
// Props are synchronous and seeded; time enters only through card.userData.setPose(pose) / chip.userData.setPose(pose),
// which the scene calls from renderAt with poses from dealer tracks (pure functions of t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { makeCanvas, canvasTexture, paintPixels, fbm2, woodTexture, softRectTexture, blobTexture } from "../../kit/textures.js";
import { screenCanvas } from "../../kit/overlay.js";
import { rng, clamp, lerp, smoothstep } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as dealer from "./dealer.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------------------------------------ 2D helpers
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
 * ICONS[name](ctx, s) — line icons drawn in a box of size s centred on (0, 0), in the current strokeStyle/fillStyle.
 * All written for this style (no third-party glyphs). Lines are s * .075 wide, round caps.
 */
export const ICONS = {
  book(c, s) {
    const w = s * 0.46, h = s * 0.34;
    c.beginPath();
    c.moveTo(0, -h * 0.75); c.quadraticCurveTo(-w * 0.5, -h * 1.05, -w, -h * 0.85); c.lineTo(-w, h * 0.95); c.quadraticCurveTo(-w * 0.5, h * 0.75, 0, h * 1.05);
    c.quadraticCurveTo(w * 0.5, h * 0.75, w, h * 0.95); c.lineTo(w, -h * 0.85); c.quadraticCurveTo(w * 0.5, -h * 1.05, 0, -h * 0.75); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(0, -h * 0.75); c.lineTo(0, h * 1.05); c.stroke();
    c.lineWidth *= 0.6;
    for (let i = 0; i < 3; i++) {
      const y = -h * 0.35 + i * h * 0.42;
      c.beginPath(); c.moveTo(-w * 0.78, y); c.quadraticCurveTo(-w * 0.45, y - h * 0.12, -w * 0.18, y); c.stroke();
      c.beginPath(); c.moveTo(w * 0.18, y); c.quadraticCurveTo(w * 0.45, y - h * 0.12, w * 0.78, y); c.stroke();
    }
  },
  gear(c, s) {
    const R = s * 0.42, r = s * 0.32, n = 8;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, d = (Math.PI / n) * 0.55;
      c.lineTo(Math.cos(a - d) * R, Math.sin(a - d) * R); c.lineTo(Math.cos(a + d) * R, Math.sin(a + d) * R);
      const b = a + Math.PI / n;
      c.lineTo(Math.cos(b - d * 0.9) * r, Math.sin(b - d * 0.9) * r); c.lineTo(Math.cos(b + d * 0.9) * r, Math.sin(b + d * 0.9) * r);
    }
    c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.13, 0, Math.PI * 2); c.stroke();
  },
  people(c, s) {
    const head = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); };
    const body = (x, y, w) => { c.beginPath(); c.moveTo(x - w, y + w * 0.95); c.quadraticCurveTo(x - w, y, x, y); c.quadraticCurveTo(x + w, y, x + w, y + w * 0.95); c.stroke(); };
    head(-s * 0.17, -s * 0.16, s * 0.1); body(-s * 0.17, s * 0.02, s * 0.17);
    head(s * 0.2, -s * 0.2, s * 0.115); body(s * 0.2, s * 0.0, s * 0.2);
    c.beginPath(); c.moveTo(-s * 0.42, s * 0.3); c.lineTo(s * 0.42, s * 0.3); c.stroke();
  },
  bulb(c, s) {
    c.beginPath(); c.arc(0, -s * 0.1, s * 0.22, Math.PI * 0.78, Math.PI * 2.22); c.lineTo(s * 0.09, s * 0.2); c.lineTo(-s * 0.09, s * 0.2); c.closePath(); c.stroke();
    for (const y of [0.27, 0.34]) { c.beginPath(); c.moveTo(-s * 0.08, s * y); c.lineTo(s * 0.08, s * y); c.stroke(); }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.1 + i * 0.2);
      c.beginPath(); c.moveTo(Math.cos(a) * s * 0.31, -s * 0.1 + Math.sin(a) * s * 0.31); c.lineTo(Math.cos(a) * s * 0.42, -s * 0.1 + Math.sin(a) * s * 0.42); c.stroke();
    }
  },
  compass(c, s) {
    c.beginPath(); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.stroke();
    c.save(); c.rotate(Math.PI / 4);
    c.beginPath(); c.moveTo(0, -s * 0.3); c.lineTo(s * 0.08, 0); c.lineTo(0, s * 0.3); c.lineTo(-s * 0.08, 0); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(0, -s * 0.3); c.lineTo(s * 0.08, 0); c.lineTo(-s * 0.08, 0); c.closePath(); c.fill();
    c.restore();
  },
  leaf(c, s) {
    c.beginPath(); c.moveTo(-s * 0.32, s * 0.32); c.quadraticCurveTo(-s * 0.36, -s * 0.3, s * 0.34, -s * 0.34); c.quadraticCurveTo(s * 0.3, s * 0.34, -s * 0.32, s * 0.32); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.4, s * 0.4); c.lineTo(s * 0.12, -s * 0.12); c.stroke();
  },
  clock(c, s) {
    c.beginPath(); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.26); c.moveTo(0, 0); c.lineTo(s * 0.18, s * 0.08); c.stroke();
    for (let i = 0; i < 12; i += 3) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.31, Math.sin(a) * s * 0.31); c.lineTo(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36); c.stroke(); }
  },
  flag(c, s) {
    c.beginPath(); c.moveTo(-s * 0.28, s * 0.42); c.lineTo(-s * 0.28, -s * 0.4); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.28, -s * 0.38); c.quadraticCurveTo(-s * 0.05, -s * 0.48, s * 0.1, -s * 0.36); c.quadraticCurveTo(s * 0.24, -s * 0.26, s * 0.36, -s * 0.34);
    c.lineTo(s * 0.36, s * 0.02); c.quadraticCurveTo(s * 0.24, s * 0.1, s * 0.1, s * 0.0); c.quadraticCurveTo(-s * 0.05, -s * 0.12, -s * 0.28, -s * 0.02); c.stroke();
  },
  key(c, s) {
    c.beginPath(); c.arc(-s * 0.2, 0, s * 0.15, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.05, 0); c.lineTo(s * 0.4, 0); c.moveTo(s * 0.28, 0); c.lineTo(s * 0.28, s * 0.13); c.moveTo(s * 0.38, 0); c.lineTo(s * 0.38, s * 0.1); c.stroke();
  },
  bolt(c, s) {
    c.beginPath(); c.moveTo(s * 0.08, -s * 0.42); c.lineTo(-s * 0.22, s * 0.05); c.lineTo(-s * 0.01, s * 0.05); c.lineTo(-s * 0.1, s * 0.42); c.lineTo(s * 0.24, -s * 0.07); c.lineTo(s * 0.02, -s * 0.07); c.closePath(); c.stroke();
  },
  check(c, s) {
    c.beginPath(); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.18, s * 0.01); c.lineTo(-s * 0.04, s * 0.15); c.lineTo(s * 0.2, -s * 0.13); c.stroke();
  },
  star(c, s) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? s * 0.17 : s * 0.42; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.stroke();
  },
  pin(c, s) {
    c.beginPath(); c.arc(0, -s * 0.12, s * 0.24, Math.PI * 0.82, Math.PI * 2.18); c.lineTo(0, s * 0.42); c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, -s * 0.12, s * 0.09, 0, Math.PI * 2); c.stroke();
  },
  hammer(c, s) {
    c.beginPath(); c.moveTo(-s * 0.3, s * 0.38); c.lineTo(s * 0.12, -s * 0.04); c.stroke();
    c.save(); c.translate(s * 0.16, -s * 0.16); c.rotate(Math.PI / 4);
    rrPath(c, -s * 0.24, -s * 0.09, s * 0.44, s * 0.18, s * 0.03); c.stroke();
    c.restore();
  },
};
export const ICON_NAMES = Object.keys(ICONS);
export function drawIcon(ctx, name, x, y, s, color, width = 0.075) {
  const f = ICONS[name] ?? ICONS.star;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = s * width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  f(ctx, s);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ card art
function linen(ctx, W, H, k, seed) {
  if (!k) return;
  const r = rng(`linen:${seed}`);
  for (let y = 0; y < H; y += 3) { ctx.fillStyle = `rgba(110,92,60,${(k * (0.55 + 0.45 * r.next())).toFixed(3)})`; ctx.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { ctx.fillStyle = `rgba(255,252,240,${(k * 1.2 * (0.55 + 0.45 * r.next())).toFixed(3)})`; ctx.fillRect(x, 0, 1, H); }
}
/** paintFace(face, S) -> canvas: stock, accent border, corner index (+ mini icon, both corners), icon medallion, title, rule, caption. */
export function paintFace(face, S) {
  const C = S.card, P = S.palette, F = C.fonts;
  const W = C.px, H = Math.round(C.px * C.H / C.W), m = W / C.W;   // px per metre
  const c = makeCanvas(W, H), x = c.getContext("2d");
  const acc = face.accent ?? P.accents[0];
  x.fillStyle = P.stock; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H * 0.42, W * 0.1, W / 2, H / 2, W * 0.8);
  g.addColorStop(0, "rgba(255,255,250,0.35)"); g.addColorStop(1, "rgba(200,185,155,0.18)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  linen(x, W, H, C.linen, face.seed ?? 1);
  // borders
  const inset = 0.0075 * m, r = Math.max(4, C.radius * m - inset);
  x.strokeStyle = acc; x.lineWidth = 0.0013 * m; rrPath(x, inset, inset, W - 2 * inset, H - 2 * inset, r); x.stroke();
  x.lineWidth = 0.0005 * m; rrPath(x, inset + 0.0026 * m, inset + 0.0026 * m, W - 2 * inset - 0.0052 * m, H - 2 * inset - 0.0052 * m, Math.max(3, r - 0.0026 * m)); x.stroke();
  if (!face.title) return c;                                            // blank stock (deck filler)
  // corner index + mini icon, top-left and (rotated) bottom-right
  const corner = () => {
    x.fillStyle = acc; x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.font = `${F.indexWeight} ${0.024 * m}px ${F.index}`;
    x.fillText(String(face.index ?? ""), 0.0205 * m, 0.0355 * m);
    drawIcon(x, face.icon, 0.0205 * m, 0.0475 * m, 0.0135 * m, acc, 0.1);
  };
  corner();
  x.save(); x.translate(W, H); x.rotate(Math.PI); corner(); x.restore();
  // medallion
  const cx = W / 2, cy = H * 0.375, R = 0.05 * m;
  x.fillStyle = acc; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  const hl = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  hl.addColorStop(0, "rgba(255,255,255,0.22)"); hl.addColorStop(1, "rgba(0,0,0,0.12)");
  x.fillStyle = hl; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  x.strokeStyle = P.stock; x.lineWidth = 0.0009 * m; x.beginPath(); x.arc(cx, cy, R * 0.88, 0, Math.PI * 2); x.stroke();
  // little ticks around the medallion: a compass-rose collar in the accent
  x.strokeStyle = acc; x.lineWidth = 0.0007 * m;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r0 = R * 1.1, r1 = R * (i % 6 === 0 ? 1.26 : 1.17);
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.stroke();
  }
  drawIcon(x, face.icon, cx, cy, 0.064 * m, P.stock, 0.08);
  // title
  const title = String(face.title).toUpperCase();
  x.fillStyle = P.ink; x.textAlign = "center"; x.textBaseline = "alphabetic";
  if ("letterSpacing" in x) x.letterSpacing = `${(0.0012 * m).toFixed(1)}px`;
  fitFont(x, title, F.title, F.titleWeight, 0.032 * m, 0.14 * m, 0.018 * m);
  x.fillText(title, W / 2, H * 0.675);
  if ("letterSpacing" in x) x.letterSpacing = "0px";
  x.fillStyle = acc; x.fillRect(W / 2 - 0.016 * m, H * 0.703, 0.032 * m, 0.0011 * m);
  // caption (one line; shrinks to fit, wraps to two only if it must)
  const cap = String(face.caption ?? "");
  x.fillStyle = P.muted;
  const capW = 0.128 * m;                                              // clear of the corner indices
  const s = fitFont(x, cap, F.caption, F.captionWeight, 0.0118 * m, capW, 0.0092 * m);
  x.font = `${F.captionWeight} ${s}px ${F.caption}`;
  if (x.measureText(cap).width <= capW) x.fillText(cap, W / 2, H * 0.755);
  else {
    const w = cap.split(" "), half = Math.ceil(w.length / 2);
    x.fillText(w.slice(0, half).join(" "), W / 2, H * 0.745);
    x.fillText(w.slice(half).join(" "), W / 2, H * 0.745 + s * 1.2);
  }
  return c;
}
/** paintBack(S, o) -> canvas: cream margin, oxblood field, diagonal lattice with studs, rosette medallion (point-symmetric). */
export function paintBack(S, o = {}) {
  const C = S.card, B = { ...S.back, ...o }, P = S.palette;
  const W = C.px, H = Math.round(C.px * C.H / C.W), m = W / C.W;
  const c = makeCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = P.stock; x.fillRect(0, 0, W, H);
  linen(x, W, H, C.linen, 77);
  const bi = B.border * m, fr = Math.max(4, C.radius * m - bi);
  x.fillStyle = B.field; rrPath(x, bi, bi, W - 2 * bi, H - 2 * bi, fr); x.fill();
  x.save(); rrPath(x, bi, bi, W - 2 * bi, H - 2 * bi, fr); x.clip();
  const fw = W - 2 * bi, n = B.lattice, step = fw / n, cx = W / 2, cy = H / 2;
  x.strokeStyle = B.ink; x.globalAlpha = 0.55; x.lineWidth = 0.0006 * m;
  for (let k = -n * 3; k <= n * 3; k++) {
    const o2 = k * step;
    x.beginPath(); x.moveTo(cx + o2 - H, cy - H); x.lineTo(cx + o2 + H, cy + H); x.stroke();
    x.beginPath(); x.moveTo(cx + o2 + H, cy - H); x.lineTo(cx + o2 - H, cy + H); x.stroke();
  }
  x.globalAlpha = 0.85; x.fillStyle = B.ink;                           // studs where the diagonals cross
  for (let i = -n * 4; i <= n * 4; i++) for (let j = -n * 6; j <= n * 6; j++) {
    if ((i + j) % 2) continue;
    x.beginPath(); x.arc(cx + (i * step) / 2, cy + (j * step) / 2, 0.0011 * m, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  x.restore();
  x.strokeStyle = B.ink; x.lineWidth = 0.0007 * m; rrPath(x, bi + 0.0035 * m, bi + 0.0035 * m, W - 2 * bi - 0.007 * m, H - 2 * bi - 0.007 * m, Math.max(3, fr - 0.0035 * m)); x.stroke();
  // medallion
  const R = 0.036 * m;
  x.fillStyle = B.field; x.beginPath(); x.arc(cx, cy, R * 1.12, 0, Math.PI * 2); x.fill();
  x.strokeStyle = B.ink; x.lineWidth = 0.0009 * m; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 0.0005 * m; x.beginPath(); x.arc(cx, cy, R * 0.86, 0, Math.PI * 2); x.stroke();
  x.fillStyle = B.ink;
  for (let i = 0; i < 8; i++) {
    x.save(); x.translate(cx, cy); x.rotate((i / 8) * Math.PI * 2);
    x.beginPath(); x.ellipse(0, -R * 0.42, R * 0.13, R * 0.36, 0, 0, Math.PI * 2); x.globalAlpha = 0.9; x.fill(); x.restore();
  }
  x.globalAlpha = 1;
  x.fillStyle = B.field; x.beginPath(); x.arc(cx, cy, R * 0.16, 0, Math.PI * 2); x.fill();
  x.strokeStyle = B.ink; x.lineWidth = 0.0006 * m; x.beginPath(); x.arc(cx, cy, R * 0.16, 0, Math.PI * 2); x.stroke();
  // corner diamonds on the field's long axis
  for (const sy of [-1, 1]) {
    const yy = cy + sy * (H / 2 - bi - 0.016 * m);
    x.beginPath(); x.moveTo(cx, yy - 0.006 * m); x.lineTo(cx + 0.006 * m, yy); x.lineTo(cx, yy + 0.006 * m); x.lineTo(cx - 0.006 * m, yy); x.closePath();
    x.fillStyle = B.field; x.fill(); x.stroke();
  }
  return c;
}

// ------------------------------------------------------------------------------------------------ card geometry
/**
 * cardGeometry(S) -> BufferGeometry with userData { base, deform(params) }: a rounded-rect card on a column grid that
 * follows the corner arcs exactly (so the card can bend anywhere), front (+Z, group 0), back (-Z, group 1, mirrored UVs),
 * edge band (group 2). deform({ bend, curl, peel, peelEnd, s }) rewrites z from the stored base (pure, no carry-over).
 */
export function cardGeometry(S) {
  const C = S.card, hw = C.W / 2, hh = C.H / 2, r = C.radius, th = C.th;
  const arcN = 6, inner = Math.max(2, C.cols - 2 * arcN);
  const xs = [];
  for (let k = 0; k <= arcN; k++) { const a = (Math.PI / 2) * (k / arcN); xs.push([-hw + r - r * Math.cos(a), hh - r + r * Math.sin(a)]); }
  for (let k = 1; k < inner; k++) xs.push([lerp(-hw + r, hw - r, k / inner), hh]);
  for (let k = arcN; k >= 0; k--) { const a = (Math.PI / 2) * (k / arcN); xs.push([hw - r + r * Math.cos(a), hh - r + r * Math.sin(a)]); }
  const NX = xs.length, NY = C.rows;
  const pos = [], uv = [], idx = [];
  const grid = (z, back) => {
    const o = pos.length / 3;
    for (let i = 0; i < NX; i++) for (let j = 0; j <= NY; j++) {
      const [x, e] = xs[i], y = lerp(-e, e, j / NY);
      pos.push(x, y, z);
      const u = (x + hw) / C.W, v = (y + hh) / C.H;
      uv.push(back ? 1 - u : u, v);
    }
    return o;
  };
  const f0 = grid(th / 2, false), b0 = grid(-th / 2, true);
  const at = (o, i, j) => o + i * (NY + 1) + j;
  const groups = [];
  let start = idx.length;
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NY; j++) {
    const a = at(f0, i, j), b = at(f0, i + 1, j), c = at(f0, i + 1, j + 1), d = at(f0, i, j + 1);
    idx.push(a, b, c, a, c, d);
  }
  groups.push([start, idx.length - start, 0]); start = idx.length;
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NY; j++) {
    const a = at(b0, i, j), b = at(b0, i + 1, j), c = at(b0, i + 1, j + 1), d = at(b0, i, j + 1);
    idx.push(a, c, b, a, d, c);
  }
  groups.push([start, idx.length - start, 1]); start = idx.length;
  // outline (counter-clockwise seen from +Z): bottom row left->right, right column up, top row right->left, left column down
  const ring = [];
  for (let i = 0; i < NX; i++) ring.push([i, 0]);
  for (let j = 1; j <= NY; j++) ring.push([NX - 1, j]);
  for (let i = NX - 2; i >= 0; i--) ring.push([i, NY]);
  for (let j = NY - 1; j >= 1; j--) ring.push([0, j]);
  const e0 = pos.length / 3;
  ring.forEach(([i, j]) => {
    const fi = at(f0, i, j), bi = at(b0, i, j);
    pos.push(pos[fi * 3], pos[fi * 3 + 1], pos[fi * 3 + 2]); uv.push(i / NX, 1);
    pos.push(pos[bi * 3], pos[bi * 3 + 1], pos[bi * 3 + 2]); uv.push(i / NX, 0);
  });
  const L = ring.length;
  for (let k = 0; k < L; k++) {
    const k2 = (k + 1) % L, a = e0 + k * 2, b = e0 + k2 * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  groups.push([start, idx.length - start, 2]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  for (const [s0, n, m] of groups) geo.addGroup(s0, n, m);
  geo.computeVertexNormals();
  const base = Float32Array.from(pos);
  let last = "0|0|0|0|1";
  geo.userData.deform = ({ bend = 0, curl = 0, peel = 0, peelEnd = 1, s = 1 }) => {
    const key = `${bend}|${curl}|${peel}|${peelEnd}|${s}`;
    if (key === last) return;                                   // memo keyed by the FULL input: seek-safe
    last = key;
    const P = geo.attributes.position.array;
    for (let v = 0; v < P.length; v += 3) {
      const xn = base[v] / hw, yn = base[v + 1] / hh, q = Math.max(0, peelEnd * yn);
      P[v + 2] = base[v + 2] + bend * hw * xn * xn + s * (curl * hh * yn * yn + peel * hh * q * q);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  return geo;
}

// ------------------------------------------------------------------------------------------------ chips
function chipTop(body, insert, kind = "chip", label = "") {
  const N = 512, c = makeCanvas(N), x = c.getContext("2d"), h = N / 2;
  x.fillStyle = body; x.fillRect(0, 0, N, N);
  if (kind === "button") {
    x.strokeStyle = insert; x.lineWidth = N * 0.025; x.beginPath(); x.arc(h, h, N * 0.44, 0, Math.PI * 2); x.stroke();
    x.lineWidth = N * 0.008; x.beginPath(); x.arc(h, h, N * 0.39, 0, Math.PI * 2); x.stroke();
    x.fillStyle = insert; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `700 ${N * 0.13}px Georgia, "Times New Roman", serif`;
    if ("letterSpacing" in x) x.letterSpacing = `${N * 0.012}px`;
    x.save(); x.translate(h, h); x.rotate(-Math.PI / 2);              // reads upright on a CylinderGeometry cap
    x.fillText(label, 0, N * 0.01);
    x.restore();
    for (const s of [-1, 1]) { x.beginPath(); x.arc(h + s * N * 0.2, h, N * 0.022, 0, Math.PI * 2); x.fill(); }
    return c;
  }
  // rim inserts (six), inlay ring and a small geometric inlay
  x.fillStyle = insert;
  for (let i = 0; i < 6; i++) {
    x.save(); x.translate(h, h); x.rotate((i / 6) * Math.PI * 2);
    x.fillRect(-N * 0.055, -N * 0.5, N * 0.11, N * 0.12); x.restore();
  }
  x.strokeStyle = insert; x.lineWidth = N * 0.012; x.beginPath(); x.arc(h, h, N * 0.32, 0, Math.PI * 2); x.stroke();
  x.fillStyle = insert; x.globalAlpha = 0.92; x.beginPath(); x.arc(h, h, N * 0.27, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
  x.strokeStyle = body; x.lineWidth = N * 0.012;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.beginPath(); x.moveTo(h, h); x.lineTo(h + Math.cos(a) * N * 0.17, h + Math.sin(a) * N * 0.17); x.stroke();
  }
  x.beginPath(); x.arc(h, h, N * 0.17, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(h, h, N * 0.06, 0, Math.PI * 2); x.fillStyle = body; x.fill();
  return c;
}
function chipSide(body, insert, plain = false) {
  const c = makeCanvas(512, 32), x = c.getContext("2d");
  x.fillStyle = body; x.fillRect(0, 0, 512, 32);
  if (!plain) { x.fillStyle = insert; for (let i = 0; i < 6; i++) x.fillRect((i + 0.5) * (512 / 6) - 18, 0, 36, 32); }
  x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(0, 0, 512, 3); x.fillRect(0, 29, 512, 3);
  return c;
}

// ------------------------------------------------------------------------------------------------ createStyle
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, baize = "green" | "blue" | "red" | "charcoal" }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, S = spec, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const cloth = spec.baizes[opts.baize ?? "green"] ?? spec.baizes.green;
  if (lights.lamp?.isSpotLight) {
    // tight perspective shadow around the cloth; softness via the spec (pcf)
    lights.lamp.shadow.camera.near = spec.lights.find((l) => l.id === "lamp").shadow.near;
    lights.lamp.shadow.camera.far = spec.lights.find((l) => l.id === "lamp").shadow.far;
  }

  // ---- shared textures/materials
  const T = spec.table, CD = spec.card;
  const baizeTex = (() => {
    const N = T.texture.px, k = T.texture.contrast, sc = T.texture.scale;
    const a = new THREE.Color(cloth.dark), b = new THREE.Color(cloth.cloth);
    const cnv = paintPixels([N, Math.round(N * T.D / T.W)], (u, v) => {
      const n = fbm2(u * sc * (T.W / T.D), v * sc, { seed: T.texture.seed, octaves: 3, period: 256 });
      const w = clamp(0.82 + (n - 0.5) * 2 * k * 6) ;
      return [lerp(a.r, b.r, w), lerp(a.g, b.g, w), lerp(a.b, b.b, w)];
    });
    const t = canvasTexture(cnv, { anisotropy: 4 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  const baizeMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: baizeTex, roughness: T.roughness, metalness: 0, sheen: T.sheen, sheenRoughness: T.sheenRoughness, sheenColor: new THREE.Color(cloth.sheen) });
  baizeMat.name = "baize";
  const woodTex = woodTexture({ size: 512, boards: 3, seed: 41, grainFreq: 16, contrast: 0.45, dark: "#3a1d10", mid: "#5d3220", light: "#80492d", seam: "#3a1d10" });
  woodTex.repeat.set(2.2, 2.2);
  materials.rail.map = woodTex; materials.rail.envMapIntensity = spec.table.rail.env ?? 0.25; materials.rail.needsUpdate = true;
  const backTex = canvasTexture(paintBack(S), { anisotropy: 8 });
  backTex.wrapS = backTex.wrapT = THREE.ClampToEdgeWrapping;
  const blankTex = canvasTexture(paintFace({}, S), { anisotropy: 8 });
  blankTex.wrapS = blankTex.wrapT = THREE.ClampToEdgeWrapping;
  const faceTexCache = new Map();
  const faceTex = (face) => {
    const k = JSON.stringify(face);
    if (!faceTexCache.has(k)) { const t = canvasTexture(paintFace(face, S), { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; faceTexCache.set(k, t); }
    return faceTexCache.get(k);
  };
  const stockMat = (map) => new THREE.MeshPhysicalMaterial({ color: "#ffffff", map, roughness: CD.roughness, metalness: 0, sheen: CD.sheen, sheenRoughness: 0.6, sheenColor: new THREE.Color("#fff6e6") });
  const shadowTex = softRectTexture({ soft: 0.3, radius: 0.12 });
  const blob = blobTexture();

  // ---- table
  function table(o = {}) {
    const g = new THREE.Group(); g.name = "table";
    const W = o.W ?? T.W, D = o.D ?? T.D, rc = T.corner, R = T.rail;
    const rr = (w, d, r) => {
      const s = new THREE.Shape(), l = -w / 2, b = -d / 2;
      s.moveTo(l + r, b); s.lineTo(l + w - r, b); s.absarc(l + w - r, b + r, r, -Math.PI / 2, 0); s.lineTo(l + w, b + d - r);
      s.absarc(l + w - r, b + d - r, r, 0, Math.PI / 2); s.lineTo(l + r, b + d); s.absarc(l + r, b + d - r, r, Math.PI / 2, Math.PI);
      s.lineTo(l, b + r); s.absarc(l + r, b + r, r, Math.PI, Math.PI * 1.5);
      return s;
    };
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(rr(W, D, rc), 24), baizeMat);
    // ShapeGeometry UVs are in metres: remap to 0..1 over the cloth
    const uvA = cloth.geometry.attributes.uv;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) / W + 0.5, uvA.getY(i) / D + 0.5);
    cloth.rotation.x = -Math.PI / 2; cloth.receiveShadow = true; cloth.name = "baize";
    g.add(cloth);
    // rail: a bevelled ring (outer rounded rect minus the cloth) extruded upward
    const outer = rr(W + 2 * R.width, D + 2 * R.width, rc + R.width);
    const hole = rr(W - 0.002, D - 0.002, rc);
    outer.holes.push(new THREE.Path(hole.getPoints(48)));
    const rg = new THREE.ExtrudeGeometry(outer, { depth: R.height - R.bevel, bevelEnabled: true, bevelThickness: R.bevel, bevelSize: R.bevel * 0.9, bevelSegments: 5, curveSegments: 32 });
    const rail = new THREE.Mesh(rg, materials.rail);
    rail.rotation.x = -Math.PI / 2; rail.position.y = R.bevel * 0.2;
    rail.castShadow = true; rail.receiveShadow = true; rail.name = "rail";
    g.add(rail);
    // apron below the rail and a dark floor far below (never really seen; keeps silhouettes solid)
    const apron = new THREE.Mesh(new THREE.ExtrudeGeometry(rr(W + 2 * R.width - 0.02, D + 2 * R.width - 0.02, rc + R.width), { depth: 0.12, bevelEnabled: false, curveSegments: 24 }), materials.floor);
    apron.rotation.x = Math.PI / 2; apron.position.y = -0.001; g.add(apron);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.75; floor.receiveShadow = true; g.add(floor);
    g.userData.cloth = cloth;
    return g;
  }

  // ---- lamp (shade, bulb, cord) — mostly above frame; its light is the spec's "lamp" spot
  function lamp(o = {}) {
    const L = spec.lamp, g = new THREE.Group(); g.name = "lamp";
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(L.shadeR * 0.32, L.shadeR, L.shadeH, 48, 1, true), materials.shade);
    shade.material.side = THREE.DoubleSide; shade.position.y = L.shadeH / 2; shade.castShadow = false;
    const bulbM = new THREE.MeshStandardMaterial({ color: L.bulb, emissive: L.bulb, emissiveIntensity: L.bulbStrength, roughness: 0.4 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), bulbM); bulb.position.y = L.shadeH * 0.35;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, L.cord, 8), materials.shade); cord.position.y = L.shadeH + L.cord / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.04, 24), materials.brass); cap.position.y = L.shadeH + 0.01;
    g.add(shade, bulb, cord, cap);
    g.position.set(o.x ?? 0, (o.y ?? L.y) - L.shadeH * 0.2, o.z ?? 0.12);
    return g;
  }

  // ---- card
  /**
   * card({ face: { icon, title, caption, accent, index, seed } | null, back: { field, ink } | null, name })
   *   -> Group with userData.setPose(pose) (dealer pose: p, yaw, flip, bend, curl, peel, peelEnd, dim, vis), .geo, .mats
   */
  function card(o = {}) {
    const root = new THREE.Group(); root.name = o.name ?? "card";
    const pivot = new THREE.Group(); root.add(pivot);
    const geo = cardGeometry(S);
    const front = stockMat(o.face ? faceTex(o.face) : blankTex);
    const back = stockMat(o.back ? (() => { const t = canvasTexture(paintBack(S, o.back), { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })() : backTex);
    const edge = new THREE.MeshStandardMaterial({ color: P.stockEdge, roughness: 0.85 });
    const mesh = new THREE.Mesh(geo, [front, back, edge]);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true; mesh.receiveShadow = true;
    pivot.add(mesh);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(CD.W * 1.25, CD.H * 1.18), new THREE.MeshBasicMaterial({ map: shadowTex, color: "#000000", transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1; sh.name = "contact";
    root.add(sh);
    const y0 = dealer.restY(S, 0);
    root.userData = {
      geo, mesh, mats: { front, back, edge }, contact: sh,
      setPose(q) {
        root.visible = (q.vis ?? 1) > 0;
        root.position.set(q.p[0], q.p[1], q.p[2]);
        root.rotation.set(0, q.yaw, 0);
        pivot.rotation.set(0, 0, q.flip);
        const s = Math.cos(q.flip) >= 0 ? 1 : -1;
        geo.userData.deform({ bend: q.bend ?? 0, curl: q.curl ?? 0, peel: q.peel ?? 0, peelEnd: q.peelEnd ?? 1, s });
        const k = lerp(1, CD.dim, clamp(q.dim ?? 0));
        front.color.setScalar(k); back.color.setScalar(k); edge.color.set(P.stockEdge).multiplyScalar(k);
        // contact darkening only for a card on (or just above) the cloth
        const hgt = q.p[1] - y0;
        sh.position.y = -q.p[1] + 0.0006;
        sh.scale.set(Math.max(0.05, Math.abs(Math.cos(q.flip))), 1, 1);
        sh.material.opacity = 0.42 * (1 - smoothstep(0.0015, 0.05, hgt));
        sh.visible = sh.material.opacity > 0.004;
      },
    };
    return root;
  }
  /** deck({ n, faces: { [layer]: face } }) -> { group, cards } — n cards (index = starting pile layer, 0 = bottom). */
  function deck(o = {}) {
    const group = new THREE.Group(); group.name = "deck";
    const cards = Array.from({ length: o.n ?? 24 }, (_, i) => { const c = card({ face: o.faces?.[i] ?? null, name: `card${i}` }); group.add(c); return c; });
    return { group, cards };
  }

  // ---- chips + dealer button
  const chipMatsCache = new Map();
  function chipMats(ci) {
    if (chipMatsCache.has(ci)) return chipMatsCache.get(ci);
    const c = spec.chipColors[ci % spec.chipColors.length];
    const top = canvasTexture(chipTop(c.body, c.insert), { anisotropy: 8 });
    const side = canvasTexture(chipSide(c.body, c.insert), { anisotropy: 4 });
    const mk = (map) => new THREE.MeshPhysicalMaterial({ color: "#ffffff", map, roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35 });
    const m = [mk(side), mk(top), mk(top)];
    chipMatsCache.set(ci, m);
    return m;
  }
  const chipGeo = new THREE.CylinderGeometry(spec.chip.r, spec.chip.r, spec.chip.h, 48, 1, false);
  function puck(geo, mats, r, name) {
    const root = new THREE.Group(); root.name = name;
    const m = new THREE.Mesh(geo, mats); m.castShadow = true; m.receiveShadow = true; root.add(m);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6), new THREE.MeshBasicMaterial({ map: blob, color: "#000000", transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1; root.add(sh);
    root.userData = {
      mesh: m, contact: sh,
      setPose(q) {
        root.visible = (q.vis ?? 1) > 0;
        root.position.set(q.p[0], q.p[1], q.p[2]);
        root.rotation.set(0, q.yaw ?? 0, 0);
        sh.position.y = -q.p[1] + 0.0006;
        const hgt = q.p[1] - geo.parameters.height / 2;
        sh.material.opacity = 0.45 * (1 - smoothstep(0.002, 0.08, hgt));
        sh.visible = sh.material.opacity > 0.004 && hgt < 0.006;
      },
    };
    return root;
  }
  /** chip({ color: index into spec.chipColors }) -> Group with userData.setPose(pose) */
  const chip = (o = {}) => puck(chipGeo, chipMats(o.color ?? 0), spec.chip.r, "chip");
  /** chipStack({ count, colors: [i...] }) -> { group, chips } (pose each chip from its own dealer track) */
  function chipStack(o = {}) {
    const group = new THREE.Group(); group.name = "chipStack";
    const n = o.count ?? 5, cols = o.colors ?? [0];
    const chips = Array.from({ length: n }, (_, i) => { const c = chip({ color: cols[i % cols.length] }); group.add(c); return c; });
    return { group, chips };
  }
  /** dealerButton() -> Group with userData.setPose(pose): a thick white puck reading spec.button.text */
  function dealerButton(o = {}) {
    const B = spec.button;
    const top = canvasTexture(chipTop("#f4efe4", "#1d1b19", "button", o.text ?? B.text), { anisotropy: 8 });
    const side = canvasTexture(chipSide("#ece6da", "#1d1b19", true), { anisotropy: 4 });
    const mk = (map) => new THREE.MeshPhysicalMaterial({ color: "#ffffff", map, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    return puck(new THREE.CylinderGeometry(B.r, B.r, B.h, 64), [mk(side), mk(top), mk(top)], B.r, "dealerButton");
  }

  // ---- the beat label: brass plaque on the overlay (exact colours, never blurred)
  /** plaque() -> overlay mesh with userData.show(text, alpha). One plaque per scene, fixed position (spec.plaque). */
  function plaque(o = {}) {
    const Q = { ...spec.plaque, ...o };
    const Wp = 1300, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.32}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = `${Q.cap * 0.1}px`;
      const tw = x.measureText(st.text).width, pw = Math.min(W - 16, tw + Q.cap * 2.6), ph = Q.h, ox = 8, oy = 6;
      // drop shadow
      x.fillStyle = "rgba(0,0,0,0.45)"; rrPath(x, ox + 3, oy + 6, pw, ph, 10); x.fill();
      const g = x.createLinearGradient(0, oy, 0, oy + ph);
      g.addColorStop(0, Q.brass[0]); g.addColorStop(0.55, Q.brass[1]); g.addColorStop(1, Q.brass[2]);
      x.fillStyle = g; rrPath(x, ox, oy, pw, ph, 10); x.fill();
      // brushed streaks (seeded)
      const r = rng("plaque");
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${r.chance(0.5) ? "255,244,210" : "90,60,20"},${r.range(0.04, 0.1).toFixed(3)})`; x.fillRect(ox + r.range(0, pw - 60), oy + r.range(3, ph - 3), r.range(30, 160), 1); }
      x.strokeStyle = "rgba(60,38,12,0.85)"; x.lineWidth = 2.5; rrPath(x, ox + 7, oy + 7, pw - 14, ph - 14, 6); x.stroke();
      x.strokeStyle = "rgba(255,236,190,0.5)"; x.lineWidth = 1.5; rrPath(x, ox + 1, oy + 1, pw - 2, ph - 2, 9); x.stroke();
      for (const sx of [ox + 20, ox + pw - 20]) {                    // screws
        x.fillStyle = "#7a5524"; x.beginPath(); x.arc(sx, oy + ph / 2, 6.5, 0, Math.PI * 2); x.fill();
        x.strokeStyle = "#3a2510"; x.lineWidth = 2; x.beginPath(); x.moveTo(sx - 4.5, oy + ph / 2 - 1.5); x.lineTo(sx + 4.5, oy + ph / 2 + 1.5); x.stroke();
      }
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = "rgba(255,240,200,0.75)"; x.fillText(st.text, ox + pw / 2 + 1.5, oy + ph / 2 + 3.5);
      x.fillStyle = Q.ink; x.fillText(st.text, ox + pw / 2, oy + ph / 2 + 2);
    });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => {
      mesh.userData.set({ text });
      mesh.userData.opacity(a);
      stage.renderer.initTexture(mesh.material.map);                  // upload now: never render last state's canvas
    };
    return mesh;
  }

  const props = { table, lamp, card, deck, chip, chipStack, dealerButton, plaque };
  const factories = {
    table: (o) => table(o.dims ?? {}),
    lamp: (o) => lamp(o.dims ?? {}),
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: dealer, motion: dealer,
    helpers: { paintFace, paintBack, drawIcon, ICON_NAMES, cardGeometry },
  };
}
