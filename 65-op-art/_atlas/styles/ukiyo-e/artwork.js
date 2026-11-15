// styles/ukiyo-e/artwork.js — the demo print, painted layer by layer into 2D canvases (browser only; no THREE).
// An ORIGINAL composition in the yoko-e seascape genre (not a copy of any historical print): a tall breaking wave on
// the left whose lip curls right into foam claws, a smaller swell bottom-right, two rowing boats, a snow-capped
// mountain on the right third on a low horizon, a pink sun, long cloud bands, a blank cartouche and a reserved seal
// square top-left. Each layer function draws ONLY what that block prints (in its ink colour, alpha = coverage).
// Design space 2048 x 1280 (y down, top = the sheet's far edge); everything is scaled to the canvas.
import { rng } from "../../kit/time.js";

export const DESIGN = [2048, 1280];
export const SEAL_BOX = { x: 64, y: 372, s: 124 };   // design px; the seal reserve and the seal itself

// ---------------------------------------------------------------- shapes (design px)
const HORIZON = 778;
const BACK = [[0, 900], [60, 620], [300, 270], [640, 225]];                 // big wave: back up to crest
const LIP = [[640, 225], [800, 200], [950, 250], [1010, 330]];              // lip top curling right
const TIP = [[1010, 330], [1050, 390], [1030, 442], [990, 452]];            // lip tip curling down
const UNDER = [[990, 452], [950, 457], [920, 422], [905, 402]];             // under the lip, back toward the face
const FACE = [[905, 402], [840, 470], [860, 700], [1100, 830]];             // concave face down to the trough
const BACK2 = [[1180, 1280], [1300, 1100], [1450, 942], [1640, 902]];       // small swell
const LIP2 = [[1640, 902], [1760, 882], [1850, 922], [1902, 982]];
const TIP2 = [[1902, 982], [1932, 1022], [1912, 1052], [1880, 1052]];
const UNDER2 = [[1880, 1052], [1862, 1052], [1852, 1034], [1846, 1018]];
const FACE2 = [[1846, 1018], [1822, 1100], [1900, 1200], [2048, 1232]];
const BOATS = [
  { a: [300, 1022], b: [930, 940], sag: 46, rowers: 7 },
  { a: [1170, 850], b: [1610, 826], sag: 30, rowers: 5 },
];
const CLOUDS = [[1010, 362, 560, 30], [1230, 300, 340, 20], [1560, 138, 430, 26]];
const SUN = [1700, 248, 64];
const CART = [70, 60, 112, 290];

const bez = (P, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]);
};
const bezD = (P, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]));
};
const cto = (p, P) => p.bezierCurveTo(P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]);
const shift = (P, dx, dy) => P.map(([x, y]) => [x + dx, y + dy]);

function waveBody() {
  const p = new Path2D();
  p.moveTo(0, 1280); p.lineTo(...BACK[0]);
  for (const S of [BACK, LIP, TIP, UNDER, FACE]) cto(p, S);
  p.lineTo(1240, 1280); p.closePath();
  return p;
}
function waveOutline() {
  const p = new Path2D();
  p.moveTo(...BACK[0]);
  for (const S of [BACK, LIP, TIP, UNDER, FACE]) cto(p, S);
  return p;
}
function wave2Body() {
  const p = new Path2D();
  p.moveTo(...BACK2[0]);
  for (const S of [BACK2, LIP2, TIP2, UNDER2, FACE2]) cto(p, S);
  p.lineTo(2048, 1280); p.closePath();
  return p;
}
function wave2Outline() {
  const p = new Path2D();
  p.moveTo(...BACK2[0]);
  for (const S of [BACK2, LIP2, TIP2, UNDER2, FACE2]) cto(p, S);
  return p;
}
function mountain() {
  const p = new Path2D();
  p.moveTo(1095, HORIZON);
  p.bezierCurveTo(1250, 664, 1338, 562, 1394, 480);
  p.bezierCurveTo(1414, 466, 1446, 466, 1466, 480);
  p.bezierCurveTo(1510, 540, 1545, 600, 1580, 598);   // a second, lower shoulder peak on the right
  p.bezierCurveTo(1612, 592, 1650, 640, 1700, 700);
  p.bezierCurveTo(1730, 735, 1760, 760, 1810, HORIZON);
  p.closePath();
  return p;
}
const SNOW = [[1300, 560], [1326, 604], [1342, 584], [1362, 628], [1384, 592], [1404, 646], [1424, 600], [1446, 636], [1466, 594], [1490, 624], [1508, 590], [1540, 570]];
function snowCap() {
  const p = new Path2D();
  p.moveTo(...SNOW[0]);
  for (const q of SNOW.slice(1)) p.lineTo(...q);
  p.lineTo(1560, 420); p.lineTo(1280, 420); p.closePath();
  return p;
}
function snowLine() {
  const p = new Path2D();
  p.moveTo(...SNOW[0]);
  for (const q of SNOW.slice(1)) p.lineTo(...q);
  return p;
}
function hills() {
  const p = new Path2D();
  p.moveTo(880, HORIZON); p.bezierCurveTo(930, 756, 990, 752, 1030, 762); p.bezierCurveTo(1060, 754, 1100, 756, 1130, HORIZON); p.closePath();
  p.moveTo(1770, HORIZON); p.bezierCurveTo(1820, 758, 1880, 750, 1930, 760); p.bezierCurveTo(1970, 752, 2010, 758, 2034, HORIZON); p.closePath();
  return p;
}
function boatHull(B) {
  const p = new Path2D();
  const [ax, ay] = B.a, [bx, by] = B.b;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  p.moveTo(ax, ay);
  p.lineTo(bx + 18, by - 14);                      // raised bow
  p.quadraticCurveTo(mx + 20, my + B.sag * 2, ax, ay);
  p.closePath();
  return p;
}
function boats() { const p = new Path2D(); for (const B of BOATS) p.addPath(boatHull(B)); return p; }
function rowerSpots(B) {
  const out = [];
  for (let i = 0; i < B.rowers; i++) {
    const f = 0.16 + (0.68 * i) / Math.max(1, B.rowers - 1);
    out.push([B.a[0] + (B.b[0] - B.a[0]) * f, B.a[1] + (B.b[1] - B.a[1]) * f - 9]);
  }
  return out;
}
function clouds() {
  const p = new Path2D();
  for (const [x, y, w, h] of CLOUDS) p.roundRect(x, y, w, h, h / 2);
  return p;
}
function sun() { const p = new Path2D(); p.arc(SUN[0], SUN[1], SUN[2], 0, Math.PI * 2); return p; }
function cartouche() { const p = new Path2D(); p.rect(...CART); return p; }
function sealReserve() { const p = new Path2D(); p.rect(SEAL_BOX.x - 6, SEAL_BOX.y - 6, SEAL_BOX.s + 12, SEAL_BOX.s + 12); return p; }

/** foam: a band along the lip, hooked claws reaching forward/down off it, and seeded spray dots. Returns { band, claws, dots } */
function foam(segs, { n, len, bw, band, seed, sprayN, spray }) {
  const claws = new Path2D(), dots = new Path2D(), bandP = new Path2D();
  bandP.moveTo(...segs[0][0]);
  for (const S of segs) cto(bandP, S);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const g = (i + 0.5) / n * segs.length, si = Math.min(segs.length - 1, Math.floor(g)), t = g - si;
    const S = segs[si], p = bez(S, t), d = bezD(S, t), L = Math.hypot(d[0], d[1]) || 1;
    const tx = d[0] / L, ty = d[1] / L;
    // outward normal (right of travel = away from the body), bent toward screen-down for the hook
    let nx = -ty, ny = tx;
    nx = nx * 0.8 + 0.25; ny = ny * 0.8 + 0.55;
    const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
    const l = len * r.range(0.65, 1.15), w = bw * r.range(0.8, 1.2);
    const b1 = [p[0] - tx * w, p[1] - ty * w], b2 = [p[0] + tx * w, p[1] + ty * w];
    const tip = [p[0] + nx * l + tx * l * 0.35, p[1] + ny * l + ty * l * 0.35];
    claws.moveTo(...b1);
    claws.quadraticCurveTo(p[0] + nx * l * 0.9 - tx * w * 0.3, p[1] + ny * l * 0.9 - ty * w * 0.3, ...tip);
    claws.quadraticCurveTo(p[0] + nx * l * 0.35 + tx * w * 1.6, p[1] + ny * l * 0.35 + ty * w * 1.6, ...b2);
    claws.closePath();
  }
  for (let i = 0; i < sprayN; i++) {
    const g = r.range(0.35, 1) * segs.length, si = Math.min(segs.length - 1, Math.floor(g)), t = g - si;
    const S = segs[si], p = bez(S, t), d = bezD(S, t), L = Math.hypot(d[0], d[1]) || 1;
    const off = r.range(spray[0], spray[1]), rad = r.range(4, 11);
    const x = p[0] - (d[1] / L) * off + r.range(-20, 40), y = p[1] + (d[0] / L) * off + r.range(-10, 30);
    dots.moveTo(x + rad, y); dots.arc(x, y, rad, 0, Math.PI * 2);
  }
  return { band: bandP, bandW: band, claws, dots };
}
const FOAM2 = foam([LIP2, TIP2], { n: 11, len: 44, bw: 11, band: 26, seed: 612, sprayN: 12, spray: [24, 90] });
// the first foam segment starts part-way up the back: rebuild its control points so it is a proper sub-curve
function subCurve(P, t0) {
  // de Casteljau split at t0, keep [t0, 1]
  const l = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const p01 = l(P[0], P[1], t0), p12 = l(P[1], P[2], t0), p23 = l(P[2], P[3], t0);
  const p012 = l(p01, p12, t0), p123 = l(p12, p23, t0), p0123 = l(p012, p123, t0);
  return [p0123, p123, p23, P[3]];
}
const FOAM1B = foam([subCurve(BACK, 0.62), LIP, TIP], { n: 26, len: 74, bw: 15, band: 40, seed: 611, sprayN: 34, spray: [40, 150] });

function fillFoam(ctx, F, color, grow = 0) {
  ctx.save();
  ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineWidth = F.bandW + grow * 2; ctx.stroke(F.band);
  ctx.fill(F.claws); ctx.fill(F.dots);
  if (grow > 0) { ctx.lineWidth = grow * 2; ctx.stroke(F.claws); ctx.stroke(F.dots); }
  ctx.restore();
}
function punch(ctx, paths, { foams = [], stroke = 0 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000"; ctx.strokeStyle = "#000";
  for (const p of paths) { ctx.fill(p); if (stroke) { ctx.lineWidth = stroke; ctx.stroke(p); } }
  for (const F of foams) fillFoam(ctx, F, "#000", 0);
  ctx.restore();
}

// stripe families inside the waves: the back curve slid down-right, extended along the lip
function stripePaths(base, lip, n, step, dir) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = (i + 1) * step;
    const P = shift(base, d * dir[0], d * dir[1]), Q = shift(lip, d * dir[0] * 0.4, d * dir[1] * 1.1);
    const p = new Path2D();
    p.moveTo(...P[0]); cto(p, P); p.lineTo(...Q[0]); cto(p, Q);
    out.push(p);
  }
  return out;
}

/** distant swell chevrons on the open sea (seeded), avoiding boat 2 and the swell */
const CHEVRONS = (() => {
  const r = rng(617), out = [];
  for (let k = 0; k < 40 && out.length < 22; k++) {
    const x = r.range(1110, 2010), y = r.range(796, 890), w = r.range(26, 54);
    if (x > 1140 && x < 1650 && y > 806 && y < 880) continue;
    if (x > 1560 && y > 868) continue;
    out.push([x, y, w]);
  }
  return out;
})();

// ---------------------------------------------------------------- the layers
const L = {
  key(ctx, C) {
    ctx.strokeStyle = C; ctx.fillStyle = C; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = 6; ctx.strokeRect(16, 16, 2016, 1248);
    ctx.lineWidth = 2.5; ctx.strokeRect(28, 28, 1992, 1224);
    // striations inside the waves
    ctx.save(); ctx.clip(waveBody());
    ctx.lineWidth = 2;
    for (const p of stripePaths(shift(BACK, 6, 4), shift(LIP, 3, 4), 16, 34, [0.85, 0.5])) ctx.stroke(p);
    ctx.restore();
    ctx.save(); ctx.clip(wave2Body()); ctx.lineWidth = 2.4;
    for (const p of stripePaths(shift(BACK2, 5, 5), shift(LIP2, 2, 5), 7, 30, [0.7, 0.7])) ctx.stroke(p);
    ctx.restore();
    ctx.lineWidth = 5.5; ctx.stroke(waveOutline()); ctx.stroke(wave2Outline());
    // foam outlines: fill the grown union in ink, then knock the foam itself out
    fillFoam(ctx, FOAM1B, C, 3.2); fillFoam(ctx, FOAM2, C, 3);
    punch(ctx, [], { foams: [FOAM1B, FOAM2] });
    // mountain, snow line, hills, horizon
    ctx.lineWidth = 4.5; ctx.stroke(mountain());
    ctx.lineWidth = 3; ctx.stroke(snowLine()); ctx.stroke(hills());
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1100, HORIZON); ctx.lineTo(2020, HORIZON); ctx.stroke();
    // clouds, chevrons
    ctx.lineWidth = 2.5; ctx.stroke(clouds());
    ctx.lineWidth = 2.6;
    for (const [x, y, w] of CHEVRONS) { ctx.beginPath(); ctx.moveTo(x - w / 2, y + 6); ctx.quadraticCurveTo(x, y - 9, x + w / 2, y + 6); ctx.stroke(); }
    // boats + rowers
    ctx.lineWidth = 4; for (const B of BOATS) ctx.stroke(boatHull(B));
    ctx.lineWidth = 2.5;
    for (const B of BOATS) for (const [x, y] of rowerSpots(B)) { ctx.beginPath(); ctx.ellipse(x, y, 13, 10, -0.15, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + 34, y + 30); ctx.stroke(); }
    // cartouche + abstract brush marks (not text)
    ctx.lineWidth = 4; ctx.strokeRect(...CART);
    ctx.lineWidth = 2; ctx.strokeRect(CART[0] + 9, CART[1] + 9, CART[2] - 18, CART[3] - 18);
    const r = rng(618);
    ctx.lineWidth = 6;
    for (let i = 0; i < 7; i++) {
      const y = CART[1] + 34 + i * 33, x = CART[0] + CART[2] / 2;
      ctx.beginPath(); ctx.moveTo(x - r.range(10, 22), y); ctx.quadraticCurveTo(x, y + r.range(-8, 8), x + r.range(10, 22), y + r.range(4, 12)); ctx.stroke();
    }
  },
  sky(ctx, C) {
    const g = ctx.createLinearGradient(0, 24, 0, 600);
    g.addColorStop(0, C); g.addColorStop(0.2, C); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.globalAlpha = 0.95; ctx.fillStyle = g; ctx.fillRect(0, 0, 2048, 620); ctx.restore();
    // re-colour the gradient (rgba(0,0,0,0) end would darken mid alphas): paint colour through the alpha
    ctx.save(); ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = C; ctx.fillRect(0, 0, 2048, 1280); ctx.restore();
    punch(ctx, [clouds(), sun(), waveBody(), mountain(), cartouche(), sealReserve()], { foams: [FOAM1B], stroke: 6 });
  },
  prussian(ctx, C) {
    ctx.strokeStyle = C; ctx.fillStyle = C; ctx.lineCap = "round"; ctx.lineJoin = "round";
    // the big wave: deep blue body, darkest along the lip and the face, fading toward its foot (bokashi) ...
    ctx.save(); ctx.clip(waveBody());
    const gw = ctx.createLinearGradient(0, 1060, 0, 260);
    gw.addColorStop(0, "rgba(31,63,120,0)"); gw.addColorStop(0.45, "rgba(31,63,120,0.85)"); gw.addColorStop(1, C);
    ctx.fillStyle = gw; ctx.fillRect(0, 150, 1300, 1130);
    // ... cut by fine light lines that follow the back of the wave
    ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = 9;
    for (const p of stripePaths(BACK, LIP, 16, 34, [0.85, 0.5])) ctx.stroke(p);
    ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = C;
    ctx.lineWidth = 60; const f = new Path2D(); f.moveTo(...UNDER[0]); cto(f, UNDER); cto(f, FACE); ctx.stroke(f);
    ctx.restore();
    ctx.save(); ctx.clip(wave2Body());
    const g2 = ctx.createLinearGradient(1400, 1250, 1750, 900);
    g2.addColorStop(0, "rgba(31,63,120,0.3)"); g2.addColorStop(1, C);
    ctx.fillStyle = g2; ctx.fillRect(1150, 860, 900, 420);
    ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = 8;
    for (const p of stripePaths(BACK2, LIP2, 7, 30, [0.7, 0.7])) ctx.stroke(p);
    ctx.restore();
    // mountain: dark band under the snow fading down (bokashi)
    ctx.save(); ctx.clip(mountain());
    const g = ctx.createLinearGradient(0, 560, 0, 760); g.addColorStop(0, C); g.addColorStop(1, "rgba(31,63,120,0)");
    ctx.fillStyle = g; ctx.fillRect(1080, 440, 740, 340); ctx.restore();
    // chevron crests
    ctx.lineWidth = 7; for (const [x, y, w] of CHEVRONS) { ctx.beginPath(); ctx.moveTo(x - w / 2 + 4, y + 9); ctx.quadraticCurveTo(x, y - 3, x + w / 2 - 4, y + 9); ctx.stroke(); }
    // sea darkening toward the bottom edge
    const gs = ctx.createLinearGradient(0, 1090, 0, 1280); gs.addColorStop(0, "rgba(31,63,120,0)"); gs.addColorStop(1, "rgba(31,63,120,0.75)");
    ctx.fillStyle = gs; ctx.fillRect(0, 1080, 2048, 200);
    punch(ctx, [boats(), snowCap()], { foams: [FOAM1B, FOAM2] });
    ctx.fillStyle = C;
    for (const B of BOATS) for (const [x, y] of rowerSpots(B)) { ctx.beginPath(); ctx.ellipse(x, y, 13, 10, -0.15, 0, Math.PI * 2); ctx.fill(); }
  },
  blue2(ctx, C) {
    ctx.fillStyle = C;
    ctx.fillRect(0, HORIZON, 2048, 1280 - HORIZON);
    ctx.fill(waveBody()); ctx.fill(wave2Body()); ctx.fill(mountain());
    punch(ctx, [boats(), snowCap()], { foams: [FOAM1B, FOAM2] });
  },
  ochre(ctx, C) {
    ctx.fillStyle = C; ctx.fill(boats()); ctx.fill(hills());
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillRect(CART[0] + 9, CART[1] + 9, CART[2] - 18, 22); ctx.restore();
  },
  pink(ctx, C) {
    const g = ctx.createLinearGradient(0, 540, 0, HORIZON);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = g; ctx.fillRect(0, 520, 2048, HORIZON - 520);
    ctx.globalAlpha = 0.95; ctx.fillStyle = "#000"; ctx.fill(sun());
    ctx.globalAlpha = 0.85; ctx.fillRect(CART[0] + 9, CART[1] + 34, CART[2] - 18, CART[3] - 43);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = C; ctx.fillRect(0, 0, 2048, 1280); ctx.restore();
    punch(ctx, [waveBody(), mountain(), clouds()], { foams: [FOAM1B] });
  },
  seal(ctx, C) {
    const { x, y, s } = SEAL_BOX;
    ctx.fillStyle = C;
    ctx.beginPath(); ctx.roundRect(x, y, s, s, 8); ctx.fill();
    // carved (white) design: border, a mountain chevron and two wave curls — an abstract mark, not lettering
    ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.strokeStyle = "#000"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = 6; ctx.strokeRect(x + 11, y + 11, s - 22, s - 22);
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x + 28, y + 64); ctx.lineTo(x + s / 2, y + 30); ctx.lineTo(x + s - 28, y + 64); ctx.stroke();
    for (const k of [0, 1]) {
      const yy = y + 80 + k * 18;
      ctx.beginPath(); ctx.moveTo(x + 26, yy); ctx.quadraticCurveTo(x + 44, yy - 14, x + 62, yy); ctx.quadraticCurveTo(x + 80, yy + 14, x + s - 26, yy); ctx.stroke();
    }
    ctx.restore();
  },
};

/**
 * paintLayer(id, ctx, W, H, color) — draws one block's layer into ctx (cleared first by the caller), scaled from the
 * design space. Returns false for an unknown id.
 */
export function paintLayer(id, ctx, W, H, color) {
  const f = L[id];
  if (!f) return false;
  ctx.save();
  ctx.setTransform(W / DESIGN[0], 0, 0, H / DESIGN[1], 0, 0);
  f(ctx, color);
  ctx.restore();
  return true;
}
export const LAYER_IDS = Object.keys(L);
