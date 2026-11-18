// styles/evidence-board/style.js — "Evidence Board": a cork board on a dim office wall under a desk lamp; index cards,
// instant-photo prints of code-drawn pictures, torn scraps, a map fragment, sticky flags, map pins and red string.
// Every look number lives in spec.js; every move (pin-in, string draw / wrap / twang, flag pop, marker stroke) is planned
// by threads.js (pure, Node-safe) and only READ here. Props are synchronous and seeded. All text is rasterised at build
// (await document.fonts before createStyle — FONT_FACES lists what to load), at integer pixel positions; nothing is
// redrawn inside renderAt, so there are no texture uploads per frame.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { makeCanvas, canvasTexture, paintPixels, fbm2, woodTexture } from "../../kit/textures.js";
import { screenCanvas } from "../../kit/overlay.js";
import { liveTube } from "../../kit/paths.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { rng, clamp, lerp } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as threads from "./threads.js";
export { STYLE_SPEC };

/** Font faces to load (document.fonts.load) before createStyle: all macOS system faces, nothing fetched. */
export const FONT_FACES = [
  `700 40px "American Typewriter"`, `400 40px "American Typewriter"`, `400 40px "Marker Felt"`, `400 40px "Noteworthy"`, `700 40px "Noteworthy"`,
];

// ------------------------------------------------------------------------------------------------ 2D helpers
const R = Math.round;
function grainPaper(x, W, H, base, amt, seed) {
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  const r = rng(seed);
  const n = R((W * H) / 900);
  for (let i = 0; i < n; i++) {
    const d = r.chance(0.5);
    x.fillStyle = d ? `rgba(90,70,40,${(amt * r.range(0.3, 1)).toFixed(3)})` : `rgba(255,255,250,${(amt * r.range(0.3, 1)).toFixed(3)})`;
    x.fillRect(R(r.range(0, W)), R(r.range(0, H)), R(r.range(1, 4)), R(r.range(1, 3)));
  }
  // faint age blotch toward one corner
  const g = x.createRadialGradient(W * r.range(0.6, 1), H * r.range(0.6, 1), 0, W * 0.8, H * 0.8, Math.max(W, H) * 0.9);
  g.addColorStop(0, "rgba(160,120,60,0.10)"); g.addColorStop(1, "rgba(160,120,60,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}
/** typed(x, text, X, Y, px, opts): typewriter text glyph by glyph, integer positions, seeded ink weight + baseline wobble. */
function typed(x, text, X, Y, px, { font, weight = 400, ink = "#1f1b17", seed = 1, spacing = 0 } = {}) {
  x.font = `${weight} ${px}px ${font}`;
  x.textBaseline = "alphabetic"; x.textAlign = "left";
  const r = rng(seed);
  let cx = X;
  for (const ch of text) {
    const a = r.range(0.78, 1);
    x.globalAlpha = a; x.fillStyle = ink;
    x.fillText(ch, R(cx), R(Y + (r.chance(0.15) ? r.sign() : 0)));
    if (r.chance(0.25)) { x.globalAlpha = a * 0.25; x.fillText(ch, R(cx) + 1, R(Y)); }   // double-strike smear
    cx += x.measureText(ch).width + spacing;
  }
  x.globalAlpha = 1;
  return cx - X;
}
function hand(x, text, X, Y, px, { font, weight = 400, ink = "#2a2a30", rot = 0, align = "left" } = {}) {
  x.save(); x.translate(R(X), R(Y)); x.rotate(rot);
  x.font = `${weight} ${px}px ${font}`; x.fillStyle = ink; x.textAlign = align; x.textBaseline = "alphabetic";
  x.fillText(text, 0, 0); x.restore();
}
/** tornPath(x, W, H, edges, tear, seed): closed path of a sheet with jagged torn edges ("t","r","b","l" in `edges`). */
function tornPath(x, W, H, edges, tear, seed) {
  const r = rng(seed), pts = [];
  const step = 10;
  const j = () => r.range(0, tear);
  const edge = (x0, y0, x1, y1, torn, nx, ny) => {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / step));
    for (let i = 0; i < n; i++) {
      const u = i / n, d = torn ? j() : 0;
      pts.push([x0 + (x1 - x0) * u + nx * d, y0 + (y1 - y0) * u + ny * d]);
    }
  };
  edge(0, 0, W, 0, edges.includes("t"), 0, 1);
  edge(W, 0, W, H, edges.includes("r"), -1, 0);
  edge(W, H, 0, H, edges.includes("b"), 0, -1);
  edge(0, H, 0, 0, edges.includes("l"), 1, 0);
  x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
}
function rrPath(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

/**
 * PICTURES[name](x, w, h, r) — the instant-photo "photos": simple scenes drawn in code. Objects, places and diagrams only —
 * never people or faces. Each paints the full w × h picture area.
 */
export const PICTURES = {
  fern(x, w, h, r) {
    let g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#d9cdb2"); g.addColorStop(1, "#9c8f78"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,240,200,0.35)"; x.beginPath(); x.moveTo(w * 0.05, 0); x.lineTo(w * 0.45, 0); x.lineTo(w * 0.7, h * 0.62); x.lineTo(w * 0.25, h * 0.62); x.fill();
    g = x.createLinearGradient(0, h * 0.62, 0, h); g.addColorStop(0, "#7a5a3c"); g.addColorStop(1, "#4d3523");
    x.fillStyle = g; x.fillRect(0, h * 0.62, w, h);                                       // desk top
    x.fillStyle = "rgba(0,0,0,0.25)"; x.beginPath(); x.ellipse(w * 0.52, h * 0.8, w * 0.26, h * 0.04, 0, 0, Math.PI * 2); x.fill();
    // pot
    x.fillStyle = "#b5603a"; x.beginPath(); x.moveTo(w * 0.33, h * 0.56); x.lineTo(w * 0.69, h * 0.56); x.lineTo(w * 0.64, h * 0.8); x.lineTo(w * 0.38, h * 0.8); x.closePath(); x.fill();
    x.fillStyle = "#c97850"; x.fillRect(R(w * 0.31), R(h * 0.53), R(w * 0.4), R(h * 0.06));
    x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(R(w * 0.33), R(h * 0.59), R(w * 0.36), R(h * 0.015));
    // drooping fronds
    const fr = [[-1.2, 0.9], [-0.7, 1.0], [-0.25, 1.05], [0.2, 1.05], [0.65, 1.0], [1.15, 0.9]];
    fr.forEach(([dx, L], i) => {
      const x0 = w * 0.51, y0 = h * 0.54;
      const tipX = x0 + dx * w * 0.3, tipY = y0 + h * (0.05 + 0.18 * Math.abs(dx)) * L;
      const cX = x0 + dx * w * 0.16, cY = y0 - h * 0.28 * L;
      x.strokeStyle = "#556b2f"; x.lineWidth = Math.max(2, w * 0.008);
      x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(cX, cY, tipX, tipY); x.stroke();
      for (let k = 1; k < 14; k++) {
        const u = k / 14, mx = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cX + u * u * tipX, my = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * cY + u * u * tipY;
        const s = (1 - u * 0.7) * w * 0.045, droop = u * 0.9;
        x.fillStyle = i % 2 ? "#6f8a3a" : "#7d9a42";
        if (u > 0.55) x.fillStyle = "#a39a4a";                                              // yellowing tips
        for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(mx + sd * s * 0.5, my + s * droop * 0.6, s * 0.55, s * 0.2, sd * 0.9 + droop, 0, Math.PI * 2); x.fill(); }
      }
    });
    // fallen leaflets
    x.fillStyle = "#9c8a3e";
    for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(w * r.range(0.15, 0.85), h * r.range(0.84, 0.94), w * 0.018, w * 0.007, r.range(0, 3), 0, Math.PI * 2); x.fill(); }
  },
  window(x, w, h, r) {
    x.fillStyle = "#cfc3a8"; x.fillRect(0, 0, w, h);
    const fx = w * 0.14, fy = h * 0.1, fw = w * 0.72, fh = h * 0.68;
    const g = x.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, "#9cc4df"); g.addColorStop(1, "#e9e1c4");
    x.fillStyle = g; x.fillRect(fx, fy, fw, fh);
    const sg = x.createRadialGradient(fx + fw * 0.78, fy + fh * 0.25, 0, fx + fw * 0.78, fy + fh * 0.25, fw * 0.5);
    sg.addColorStop(0, "rgba(255,250,220,1)"); sg.addColorStop(0.25, "rgba(255,240,190,0.7)"); sg.addColorStop(1, "rgba(255,240,190,0)");
    x.fillStyle = sg; x.fillRect(fx, fy, fw, fh);
    x.fillStyle = "#e8e2d4";                                                                   // blinds (half up)
    for (let k = 0; k < 9; k++) x.fillRect(R(fx), R(fy + k * fh * 0.045), R(fw), R(fh * 0.03));
    x.strokeStyle = "#f2efe8"; x.lineWidth = w * 0.03; x.strokeRect(fx, fy, fw, fh);
    x.lineWidth = w * 0.018; x.beginPath(); x.moveTo(fx + fw / 2, fy); x.lineTo(fx + fw / 2, fy + fh); x.stroke();
    x.fillStyle = "#efe9dc"; x.fillRect(R(fx - w * 0.05), R(fy + fh), R(fw + w * 0.1), R(h * 0.05));   // sill
    x.fillStyle = "rgba(255,240,190,0.4)";                                                     // sun patch on the wall
    x.beginPath(); x.moveTo(fx, fy + fh + h * 0.05); x.lineTo(fx + fw, fy + fh + h * 0.05); x.lineTo(fx + fw * 0.8, h); x.lineTo(fx - w * 0.2, h); x.fill();
    x.fillStyle = "#7d8c96"; x.beginPath(); x.moveTo(fx, fy + fh);                            // distant rooftops
    [[0, 0.82], [0.12, 0.74], [0.24, 0.82], [0.4, 0.82], [0.46, 0.7], [0.52, 0.82], [0.7, 0.8], [0.82, 0.72], [1, 0.8]].forEach(([a, b2]) => x.lineTo(fx + fw * a, fy + fh * b2));
    x.lineTo(fx + fw, fy + fh); x.closePath(); x.fill();
    x.fillStyle = "#5f7a52";                                                                   // a tree
    for (const [a, b2, rr] of [[0.2, 0.62, 0.09], [0.28, 0.56, 0.1], [0.34, 0.65, 0.08]]) { x.beginPath(); x.arc(fx + fw * a, fy + fh * b2, fw * rr, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "#4a3c2e"; x.fillRect(R(fx + fw * 0.26), R(fy + fh * 0.66), R(fw * 0.03), R(fh * 0.2));
  },
  vent(x, w, h, r) {
    let g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#8b7a63"); g.addColorStop(1, "#5d5142");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#b9ad97"; x.fillRect(0, R(h * 0.5), w, R(h * 0.5));                         // floor
    for (let k = 0; k < 7; k++) { x.fillStyle = `rgba(0,0,0,${0.04 + (k % 2) * 0.03})`; x.fillRect(0, R(h * (0.5 + k * 0.075)), w, 2); }
    x.fillStyle = "#3d342b"; x.fillRect(R(w * 0.06), 0, R(w * 0.06), R(h * 0.62));              // desk legs
    x.fillRect(R(w * 0.86), 0, R(w * 0.06), R(h * 0.58));
    x.fillStyle = "#4a3c2e"; x.fillRect(0, 0, w, R(h * 0.08));                                   // desk underside
    x.fillStyle = "#b5603a"; x.beginPath(); x.moveTo(w * 0.62, h * 0.08); x.lineTo(w * 0.82, h * 0.08); x.lineTo(w * 0.8, h * 0.12); x.lineTo(w * 0.64, h * 0.12); x.fill();   // pot base peeking over
    // the floor vent grille (perspective)
    const gx = w * 0.3, gy = h * 0.62, gw = w * 0.42, gh = h * 0.2, sk = w * 0.06;
    x.fillStyle = "#d6d2c8"; x.beginPath(); x.moveTo(gx + sk, gy); x.lineTo(gx + gw - sk, gy); x.lineTo(gx + gw, gy + gh); x.lineTo(gx, gy + gh); x.closePath(); x.fill();
    x.fillStyle = "#2b2622";
    for (let k = 0; k < 6; k++) {
      const u0 = 0.12 + k * 0.135, u1 = u0 + 0.07;
      const ya = gy + gh * u0, yb = gy + gh * u1, ia = sk * (1 - u0), ib = sk * (1 - u1);
      x.beginPath(); x.moveTo(gx + ia + w * 0.02, ya); x.lineTo(gx + gw - ia - w * 0.02, ya); x.lineTo(gx + gw - ib - w * 0.02, yb); x.lineTo(gx + ib + w * 0.02, yb); x.closePath(); x.fill();
    }
    // warm air rising
    x.strokeStyle = "rgba(230,110,50,0.75)"; x.lineWidth = Math.max(2, w * 0.012); x.lineCap = "round";
    for (let k = 0; k < 3; k++) {
      const x0 = gx + gw * (0.25 + k * 0.25);
      x.beginPath(); x.moveTo(x0, gy - h * 0.02);
      for (let s = 1; s <= 8; s++) x.lineTo(x0 + Math.sin(s * 1.3 + k) * w * 0.025, gy - h * 0.02 - s * h * 0.055);
      x.stroke();
    }
  },
  mug(x, w, h, r) {
    x.fillStyle = "#c9bca2"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#6e4f35"; x.fillRect(0, R(h * 0.66), w, R(h * 0.34));
    x.fillStyle = "#e7e3da"; rrPath(x, w * 0.3, h * 0.32, w * 0.36, h * 0.4, w * 0.04); x.fill();
    x.strokeStyle = "#e7e3da"; x.lineWidth = w * 0.05; x.beginPath(); x.arc(w * 0.68, h * 0.5, w * 0.09, -1.2, 1.2); x.stroke();
    x.fillStyle = "#3b2618"; x.beginPath(); x.ellipse(w * 0.48, h * 0.34, w * 0.16, h * 0.025, 0, 0, Math.PI * 2); x.fill();
  },
  clock(x, w, h, r) {
    x.fillStyle = "#cbbfa6"; x.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.48, rr = Math.min(w, h) * 0.32;
    x.fillStyle = "#f3efe6"; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#2a2622"; x.lineWidth = w * 0.025; x.stroke();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.lineWidth = w * 0.012; x.beginPath(); x.moveTo(cx + Math.cos(a) * rr * 0.8, cy + Math.sin(a) * rr * 0.8); x.lineTo(cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92); x.stroke(); }
    x.lineWidth = w * 0.02; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + rr * 0.45, cy + rr * 0.2); x.stroke();
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - rr * 0.1, cy - rr * 0.7); x.stroke();
  },
};
export const PICTURE_NAMES = Object.keys(PICTURES);

// ------------------------------------------------------------------------------------------------ createStyle
/**
 * createStyle(stage, opts?) -> style       opts: { post = true }
 * Call `await loadFonts({ load: FONT_FACES })` (kit/fontoutline.js) BEFORE createStyle so every canvas uses the real faces.
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, S = spec, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const ppm = S.paper.pxPerM;
  if (lights.lamp?.isSpotLight) {
    const L = spec.lights.find((l) => l.id === "lamp");
    lights.lamp.shadow.camera.near = L.shadow.near; lights.lamp.shadow.camera.far = L.shadow.far;
  }
  const tex = (canvas, o = {}) => { const t = canvasTexture(canvas, { anisotropy: 8, ...o }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };

  // ---- board: calm cork, dark oak frame, wall
  function corkCanvas() {
    const B = S.board, C = B.cork, W = C.px, H = R((W * B.H) / B.W);
    const c = makeCanvas(W, H), x = c.getContext("2d");
    const base = new THREE.Color(P.cork);
    const bw = 320, bh = R((bw * H) / W);
    const bl = paintPixels([bw, bh], (u, v) => {
      const n = fbm2(u * C.blotchScale * (W / H), v * C.blotchScale, { seed: C.seed, octaves: 3 }) - 0.5;
      const d = n * C.blotch * 3;
      return [base.r + d, base.g + d * 0.92, base.b + d * 0.8];
    });
    x.imageSmoothingEnabled = true; x.drawImage(bl, 0, 0, W, H);
    const r = rng(C.seed * 7 + 1), cell = W / C.grainCells, n = R(C.grainCells * C.grainCells * (H / W) * 1.6);
    for (let i = 0; i < n; i++) {
      const light = r.chance(0.5);
      x.fillStyle = light ? P.corkLight : P.corkDark;
      x.globalAlpha = C.grain * r.range(1.5, 4.5);
      x.beginPath(); x.ellipse(r.range(0, W), r.range(0, H), cell * r.range(0.25, 0.6), cell * r.range(0.2, 0.45), r.range(0, Math.PI), 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = "#3d2a17";
    for (let i = 0; i < n * 0.12; i++) { x.globalAlpha = C.pits * r.range(2, 6); x.beginPath(); x.arc(r.range(0, W), r.range(0, H), r.range(0.6, 1.6), 0, Math.PI * 2); x.fill(); }
    for (let i = 0; i < C.pinholes; i++) {                                        // old pin holes
      const px = r.range(20, W - 20), py = r.range(20, H - 20);
      x.globalAlpha = 0.35; x.fillStyle = P.corkLight; x.beginPath(); x.arc(px, py, 3.4, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 0.85; x.fillStyle = "#2a1a0c"; x.beginPath(); x.arc(px, py, 1.6, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    return c;
  }
  /** board({ W, H }) -> Group: cork plane (z = 0 surface), bevelled oak frame proud of the cork, wall behind. */
  function board(o = {}) {
    const B = S.board, W = o.W ?? B.W, H = o.H ?? B.H, Fr = B.frame;
    const g = new THREE.Group(); g.name = "board";
    const cc = corkCanvas();
    const map = tex(cc, { anisotropy: 4 });
    const bump = tex(cc, { anisotropy: 4, srgb: false });
    const corkMat = new THREE.MeshStandardMaterial({ color: "#ffffff", map, bumpMap: bump, bumpScale: B.cork.bumpScale ?? 1, roughness: 0.92, metalness: 0 });
    corkMat.name = "cork";
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(W, H), corkMat);
    cork.receiveShadow = true; cork.name = "cork";
    g.add(cork);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * Fr.width, H + 2 * Fr.width, 0.02), materials.wall);
    back.position.z = -0.0101; back.receiveShadow = true; g.add(back);
    const wood = woodTexture({ size: 512, boards: 1, seed: 23, grainFreq: 22, contrast: 0.5, dark: "#22140b", mid: "#3b2416", light: "#5a3823", seam: "#22140b" });
    materials.frame.map = wood; materials.frame.needsUpdate = true;
    const fz = Fr.depth / 2 - 0.012;
    const bar = (w, h, x, y, rotTex) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, Fr.depth, 3, Fr.bevel), materials.frame);
      m.position.set(x, y, fz); m.castShadow = true; m.receiveShadow = true; g.add(m);
      if (rotTex) m.rotation.z = 0; return m;
    };
    bar(W + 2 * Fr.width, Fr.width, 0, H / 2 + Fr.width / 2);
    bar(W + 2 * Fr.width, Fr.width, 0, -H / 2 - Fr.width / 2);
    bar(Fr.width, H, -W / 2 - Fr.width / 2, 0);
    bar(Fr.width, H, W / 2 + Fr.width / 2, 0);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(B.wall.w, B.wall.h), materials.wall);
    wall.position.z = B.wall.z; wall.receiveShadow = true; g.add(wall);
    g.userData = { cork, W, H };
    return g;
  }

  // ---- paper: static curl away from the pin, canvas face
  function paperGeometry(w, h, pin, curl, seed) {
    const sx = S.paper.seg, sy = Math.max(3, R((sx * h) / w));
    const geo = new THREE.PlaneGeometry(w, h, sx, sy);
    const p = geo.attributes.position, r = rng(seed);
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const maxD = Math.max(...corners.map((c) => Math.hypot(c[0] - pin[0], c[1] - pin[1])));
    const ph = r.range(0, 6.28), k = r.range(0.6, 1.0);
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), d = Math.hypot(X - pin[0], Y - pin[1]) / maxD;
      const a = Math.atan2(Y - pin[1], X - pin[0]);
      p.setZ(i, curl * d * d * (k + (1 - k) * Math.sin(a * 2 + ph)));
    }
    geo.computeVertexNormals();
    return geo;
  }
  const paperMat = (map, { gloss = false, alpha = false } = {}) => {
    const m = gloss
      ? new THREE.MeshPhysicalMaterial({ color: "#ffffff", map, roughness: S.paper.gloss.roughness, clearcoat: S.paper.gloss.clearcoat, clearcoatRoughness: 0.4, metalness: 0 })
      : new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: S.paper.roughness, metalness: 0 });
    m.side = THREE.DoubleSide;
    if (alpha) m.alphaTest = 0.5;
    return m;
  };
  /** sheet(canvas, { w, h, pin, curl, gloss, alpha, seed }) -> Group (origin = pin point) holding the curled paper mesh. */
  function sheet(canvas, o) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(paperGeometry(o.w, o.h, o.pin, o.curl ?? S.paper.curl, o.seed ?? 1), paperMat(tex(canvas), o));
    mesh.position.set(-o.pin[0], -o.pin[1], 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    g.userData.paper = mesh;
    return g;
  }
  const defPin = (w, h) => [0, h / 2 - 0.012];

  // ---- canvases
  /** paintCard({ title, lines, seed, link }) -> canvas: ruled index card with typewriter text (title on the red rule). */
  function paintCard(o = {}) {
    const C = S.card, W = R(C.W * ppm), H = R(C.H * ppm), m = R(C.margin * ppm);
    const c = makeCanvas(W, H), x = c.getContext("2d");
    grainPaper(x, W, H, P.card, 0.05, (o.seed ?? 1) * 13);
    const line = R(C.line * ppm), top = R(m + C.titleCap * ppm * 1.55);
    x.fillStyle = P.cardRule; x.globalAlpha = 0.55;
    for (let y = top + line; y < H - 4; y += line) x.fillRect(0, y, W, 2);
    x.globalAlpha = 0.75; x.fillStyle = P.cardRed; x.fillRect(0, top, W, 3); x.globalAlpha = 1;
    const tpx = R((C.titleCap / 0.68) * ppm), lpx = R((C.lineCap / 0.68) * ppm);
    if (o.link) {
      // stamped header box
      x.font = `700 ${tpx}px ${C.font}`;
      const tw = x.measureText(o.title).width;
      x.strokeStyle = P.marker; x.lineWidth = 5; x.globalAlpha = 0.9;
      x.strokeRect(m - 12, R(top - tpx * 1.02), R(tw + 26), R(tpx * 1.2));
      x.globalAlpha = 1;
      typed(x, o.title ?? "", m, top - R(tpx * 0.18), tpx, { font: C.font, weight: 700, ink: P.marker, seed: (o.seed ?? 1) * 7 });
    } else typed(x, o.title ?? "", m, top - R(tpx * 0.18), tpx, { font: C.font, weight: 700, ink: P.ink, seed: (o.seed ?? 1) * 7 });
    (o.lines ?? []).forEach((s, i) => typed(x, s, m, top + line * (i + 1) - R(lpx * 0.2), lpx, { font: C.font, ink: P.ink, seed: (o.seed ?? 1) * 31 + i }));
    return c;
  }
  /** paintPhoto({ picture, caption, seed }) -> canvas: instant-print frame, code-drawn picture, handwritten caption strip. */
  function paintPhoto(o = {}) {
    const F = S.photo, W = R(F.W * ppm), H = R(F.H * ppm), b = R(F.border * ppm), bb = R(F.bottom * ppm);
    const c = makeCanvas(W, H), x = c.getContext("2d");
    grainPaper(x, W, H, P.photoBorder, 0.03, (o.seed ?? 1) * 17);
    const pw = W - 2 * b, ph = H - b - bb;
    const pic = makeCanvas(pw, ph), px = pic.getContext("2d");
    (PICTURES[o.picture] ?? PICTURES.mug)(px, pw, ph, rng(o.seed ?? 3));
    // print fade + warm cast + soft vignette
    px.fillStyle = `rgba(255,214,150,${F.fade})`; px.fillRect(0, 0, pw, ph);
    const vg = px.createRadialGradient(pw / 2, ph / 2, Math.min(pw, ph) * 0.3, pw / 2, ph / 2, Math.max(pw, ph) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(30,20,10,0.35)");
    px.fillStyle = vg; px.fillRect(0, 0, pw, ph);
    x.drawImage(pic, b, b);
    x.fillStyle = "rgba(0,0,0,0.12)"; x.fillRect(b, b, pw, 2); x.fillRect(b, b, 2, ph);
    const cpx = R((F.cap / 0.7) * ppm);
    hand(x, o.caption ?? "", W / 2, H - R(bb * 0.36), cpx, { font: F.font, ink: "#26323f", rot: (rng(o.seed ?? 1).next() - 0.5) * 0.04, align: "center" });
    return c;
  }
  /** paintScrap({ lines, seed }) -> canvas with alpha: torn notebook scrap, blue rules, red margin, pencil handwriting. */
  function paintScrap(o = {}) {
    const C = S.scrap, W = R(C.W * ppm), H = R(C.H * ppm), tear = R(C.tear * ppm);
    const c = makeCanvas(W, H), x = c.getContext("2d");
    x.save(); tornPath(x, W, H, "tr", tear, (o.seed ?? 1) * 5 + 2); x.clip();
    grainPaper(x, W, H, P.scrap, 0.04, (o.seed ?? 1) * 23);
    x.fillStyle = P.scrapRule; x.globalAlpha = 0.6;
    const line = R(0.024 * ppm);
    for (let y = R(0.034 * ppm); y < H; y += line) x.fillRect(0, y, W, 2);
    x.fillStyle = P.cardRed; x.globalAlpha = 0.5; x.fillRect(R(0.028 * ppm), 0, 2, H); x.globalAlpha = 1;
    const cpx = R((C.cap / 0.62) * ppm);
    (o.lines ?? []).forEach((s, i) => hand(x, s, R(0.038 * ppm), R(0.034 * ppm) + line * (i + 1) - 6, cpx, { font: C.font, weight: 700, ink: P.pencil, rot: -0.015 }));
    x.restore();
    return c;
  }
  /** paintMap({ title, labels, seed }) -> canvas with alpha: torn floor-plan fragment of an invented building. */
  function paintMap(o = {}) {
    const C = S.map, W = R(C.W * ppm), H = R(C.H * ppm), tear = R(C.tear * ppm);
    const c = makeCanvas(W, H), x = c.getContext("2d");
    x.save(); tornPath(x, W, H, "rbl", tear, (o.seed ?? 1) * 3 + 9); x.clip();
    grainPaper(x, W, H, P.mapPaper, 0.05, (o.seed ?? 1) * 29);
    x.strokeStyle = P.mapInk; x.globalAlpha = 0.18; x.lineWidth = 1;                       // survey grid
    for (let gx = 0; gx < W; gx += 40) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
    for (let gy = 0; gy < H; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
    x.globalAlpha = 1; x.lineWidth = 7; x.lineJoin = "miter";
    const u = (f) => R(f * W), v = (f) => R(f * H);
    x.beginPath();                                                                            // outer walls + rooms
    x.moveTo(u(0.06), v(0.22)); x.lineTo(u(0.94), v(0.22)); x.lineTo(u(0.94), v(0.9)); x.lineTo(u(0.06), v(0.9)); x.closePath();
    x.moveTo(u(0.42), v(0.22)); x.lineTo(u(0.42), v(0.5)); x.moveTo(u(0.42), v(0.64)); x.lineTo(u(0.42), v(0.9));
    x.moveTo(u(0.06), v(0.6)); x.lineTo(u(0.2), v(0.6)); x.moveTo(u(0.3), v(0.6)); x.lineTo(u(0.42), v(0.6));
    x.stroke();
    x.lineWidth = 3; x.beginPath(); x.arc(u(0.42), v(0.5), v(0.14), Math.PI / 2, Math.PI); x.stroke();   // door swing
    x.lineWidth = 10; x.strokeStyle = "#7fa9c9";                                                // windows
    x.beginPath(); x.moveTo(u(0.94), v(0.32)); x.lineTo(u(0.94), v(0.52)); x.moveTo(u(0.94), v(0.62)); x.lineTo(u(0.94), v(0.8)); x.stroke();
    x.strokeStyle = P.mapInk; x.lineWidth = 3;                                                  // desks
    [[0.52, 0.3], [0.72, 0.3], [0.52, 0.68], [0.72, 0.68]].forEach(([a, b2], i) => { x.strokeRect(u(a), v(b2), u(0.15), v(0.14)); });
    x.fillStyle = "rgba(60,90,120,0.12)"; x.fillRect(u(0.72), v(0.68), u(0.15), v(0.14));
    // vent symbol (hatched box) beside desk 4
    x.strokeRect(u(0.76), v(0.84), u(0.08), v(0.04));
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(u(0.765 + k * 0.02), v(0.84)); x.lineTo(u(0.765 + k * 0.02), v(0.88)); x.stroke(); }
    const cpx = R((C.cap / 0.68) * ppm);
    const lab = (s, a, b2, wgt = 400, size = cpx) => typed(x, s, u(a), v(b2), size, { font: C.font, weight: wgt, ink: P.mapInk, seed: s.length * 7 + R(a * 100) });
    lab(o.title ?? "LARKSPUR ANNEX", 0.06, 0.14, 700, cpx);
    (o.labels ?? [["DESK 4", 0.705, 0.66], ["VENT", 0.55, 0.885], ["WINDOW", 0.66, 0.58], ["STORE", 0.12, 0.8]]).forEach(([s, a, b2]) => lab(s, a, b2));
    x.restore();
    return c;
  }

  // ---- props: items
  function item(canvas, w, h, o) {
    const pin = o.pin ?? defPin(w, h);
    const root = new THREE.Group(); root.name = o.name ?? "item";
    const sh = sheet(canvas, { w, h, pin, curl: o.curl, gloss: o.gloss, alpha: o.alpha, seed: o.seed });
    root.add(sh);
    const p = o.noPin ? new THREE.Group() : pinProp({ color: o.pinColor ?? 0 });   // noPin: held by a pin already there
    root.add(p);
    root.userData = { sheet: sh, paper: sh.userData.paper, pin: p, size: [w, h], pinLocal: pin };
    return root;
  }
  /** card({ title, lines, pin, pinColor, seed }) -> item Group (origin = pin). Ruled index card, typewriter text. */
  const card = (o = {}) => item(paintCard(o), S.card.W, S.card.H, { ...o, name: o.name ?? "card" });
  /** linkCard({ title = "THE LINK", lines }) -> item Group: index card with a red stamped header. */
  const linkCard = (o = {}) => item(paintCard({ title: "THE LINK", ...o, link: true }), S.card.W, S.card.H, { curl: 0.002, ...o, name: o.name ?? "link" });
  /** photo({ picture: PICTURE_NAMES, caption, pin, pinColor, seed }) -> item Group: glossy instant print. */
  const photo = (o = {}) => item(paintPhoto(o), S.photo.W, S.photo.H, { gloss: true, ...o, name: o.name ?? "photo" });
  /** scrap({ lines, pin, pinColor, seed }) -> item Group: torn notebook scrap (alpha-tested edges). */
  const scrap = (o = {}) => item(paintScrap(o), S.scrap.W, S.scrap.H, { alpha: true, ...o, name: o.name ?? "scrap" });
  /** mapFragment({ title, labels: [[text, u, v]], pin, pinColor, seed }) -> item Group: torn floor plan of an invented place. */
  const mapFragment = (o = {}) => item(paintMap(o), S.map.W, S.map.H, { alpha: true, ...o, name: o.name ?? "map" });

  // ---- pin: ball-head map pin (head at z = S.pin.length when home; the root's z is the lift)
  const pinGeo = (() => {
    const N = S.pin;
    const head = new THREE.SphereGeometry(N.head, 24, 16); head.translate(0, 0, N.length);
    const neck = new THREE.CylinderGeometry(N.neck * 0.7, N.neck, N.head * 0.9, 16); neck.rotateX(Math.PI / 2); neck.translate(0, 0, N.length - N.head * 0.95);
    const needle = new THREE.CylinderGeometry(N.needle, N.needle * 0.4, N.length + 0.012, 8); needle.rotateX(Math.PI / 2); needle.translate(0, 0, (N.length - 0.012) / 2 - N.head * 0.5);
    return { head, neck, needle };
  })();
  const pinMats = new Map();
  /** pin({ color: index into palette.pins | hex }) -> Group (z of the group = lift above home). */
  function pinProp(o = {}) {
    const col = typeof o.color === "string" ? o.color : P.pins[(o.color ?? 0) % P.pins.length];
    if (!pinMats.has(col)) pinMats.set(col, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15, metalness: 0 }));
    const g = new THREE.Group(); g.name = "pin";
    const hm = new THREE.Mesh(pinGeo.head, pinMats.get(col));
    const nk = new THREE.Mesh(pinGeo.neck, pinMats.get(col));
    const nd = new THREE.Mesh(pinGeo.needle, materials.needle);
    for (const m of [hm, nk, nd]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    return g;
  }

  // ---- string: a live tube (centreline from threads.stringPoints)
  const stringMat = new THREE.MeshStandardMaterial({ color: P.string, roughness: S.string.roughness, metalness: 0 });
  stringMat.name = "redString";
  /** string() -> Mesh (kit liveTube) with userData.set(points); hidden until its first set. */
  function string(o = {}) {
    const m = liveTube(S.string.n, S.string.radial, o.radius ?? S.string.radius, stringMat);
    m.name = "string"; m.visible = false;
    return m;
  }

  // ---- sticky flag: translucent page flag with an arrow end
  /** flag({ color }) -> Mesh (origin = the stuck end; points +x). Scale it for the pop. */
  function flag(o = {}) {
    const F = S.flag, w = F.W, h = F.H;
    const s = new THREE.Shape();
    s.moveTo(0, -h / 2); s.lineTo(w - h * 0.5, -h / 2); s.lineTo(w, 0); s.lineTo(w - h * 0.5, h / 2); s.lineTo(0, h / 2); s.closePath();
    const col = typeof o.color === "string" ? o.color : P.flags[(o.color ?? 0) % P.flags.length];
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, transparent: true, opacity: F.alpha, side: THREE.DoubleSide, depthWrite: false }));
    m.castShadow = true; m.renderOrder = 2; m.name = "flag";
    return m;
  }

  // ---- marker: a felt-tip ribbon drawn on with setDrawRange
  const markerMat = new THREE.MeshStandardMaterial({ color: P.marker, roughness: 0.55, metalness: 0, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
  /** ribbon(path [[x,y]], width, z) -> Mesh with userData.setProgress(p) (draw-on). Tapered ends, slight width wobble. */
  function ribbon(path, width, z = 0) {
    const n = path.length, pos = [], idx = [];
    for (let k = 0; k < n; k++) {
      const a = path[Math.max(0, k - 1)], b = path[Math.min(n - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const u = k / (n - 1), wv = width * (0.55 + 0.45 * Math.min(1, u * 8, (1 - u) * 8)) * (0.9 + 0.1 * Math.sin(k * 0.7));
      pos.push(path[k][0] - ty * wv / 2, path[k][1] + tx * wv / 2, z, path[k][0] + ty * wv / 2, path[k][1] - tx * wv / 2, z);
    }
    for (let k = 0; k < n - 1; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, markerMat); m.renderOrder = 3; m.name = "marker";
    m.userData.setProgress = (p) => { const seg = Math.floor(clamp(p) * (n - 1)); g.setDrawRange(0, seg * 6); m.visible = seg > 0; };
    m.userData.setProgress(0);
    return m;
  }
  /** markerCircle(plan.marker) -> ribbon around the marker path (item coords when the plan's marker names an item). */
  const markerCircle = (M) => ribbon(M.path, S.marker.width, S.marker.z);
  /** markerArrow(from [x,y], to [x,y], { bend }) -> ribbon: a hand-drawn arrow (shaft then head), drawn on in one stroke. */
  function markerArrow(a, b, o = {}) {
    const bend = o.bend ?? 0.12, n = 40, pts = [];
    const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
    for (let k = 0; k < n; k++) { const u = k / (n - 1); pts.push([(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * mx + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * my + u * u * b[1]]); }
    const ang = Math.atan2(b[1] - my, b[0] - mx), hl = o.head ?? 0.035;
    for (const s of [1, -1]) {
      const e = [b[0] - Math.cos(ang - s * 0.5) * hl, b[1] - Math.sin(ang - s * 0.5) * hl];
      for (let k = 1; k <= 6; k++) { const u = k / 6; pts.push(s === 1 ? [lerp(b[0], e[0], u), lerp(b[1], e[1], u)] : [lerp(e[0], b[0], u), lerp(e[1], b[1], u)]); }
      if (s === 1) for (let k = 1; k <= 6; k++) { const u = k / 6; pts.push([lerp(e[0], b[0], u), lerp(e[1], b[1], u)]); }
    }
    return ribbon(pts, o.width ?? S.marker.width, o.z ?? S.marker.z);
  }

  // ---- lamp set: articulated desk lamp head (the light is the spec's "lamp" spot) — normally just out of shot
  /** lampSet() -> Group: enamel cone shade + warm emissive bulb + arm, placed at the lamp light and aimed at its target. */
  function lampSet() {
    const L = spec.lights.find((l) => l.id === "lamp");
    const g = new THREE.Group(); g.name = "lampSet";
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 40, 1, true), materials.lampShade);
    shade.material.side = THREE.DoubleSide; shade.rotation.x = Math.PI; shade.position.y = -0.02;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 14), new THREE.MeshStandardMaterial({ color: "#fff2d6", emissive: "#ffe2b0", emissiveIntensity: 2.2 }));
    bulb.position.y = -0.07;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 10), materials.lampShade); arm.position.set(0, 0.32, 0); arm.rotation.z = 0.5;
    const head = new THREE.Group(); head.add(shade, bulb); g.add(head, arm);
    for (const m of [shade, bulb, arm]) m.castShadow = false;
    g.position.set(...L.position);
    const dir = new THREE.Vector3(...L.target).sub(new THREE.Vector3(...L.position)).normalize();
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    return g;
  }

  // ---- caption: one masking-tape strip per label, each baked at build (overlay = exact colours; no per-frame redraw)
  /** caption(texts[]) -> { meshes, show(index | -1, alpha) } — one label at a time, fixed screen position (spec.caption). */
  function caption(texts) {
    const Q = S.caption, Hp = Q.h + 30;
    const meshes = texts.map((text, i) => {
      const scratch = makeCanvas(8, 8).getContext("2d");
      scratch.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const Wp = Math.min(1700, R(scratch.measureText(text).width + Q.cap * 3.2));
      const m = screenCanvas(stage, Wp, Hp, (x, W, H) => {
        const r = rng(`tape${i}`);
        const pw = W - 16, ph = Q.h, ox = 8, oy = 8;
        x.save(); x.translate(0, 0);
        // torn tape ends + soft drop shadow
        const path = (dx, dy) => {
          x.beginPath(); x.moveTo(ox + dx, oy + dy);
          x.lineTo(ox + pw + dx, oy + dy);
          for (let k = 1; k <= 8; k++) x.lineTo(ox + pw + dx - (k % 2 ? 7 : 0) - r.range(0, 3), oy + dy + (ph * k) / 8);
          x.lineTo(ox + dx, oy + ph + dy);
          for (let k = 7; k >= 1; k--) x.lineTo(ox + dx + (k % 2 ? 7 : 0) + r.range(0, 3), oy + dy + (ph * k) / 8);
          x.closePath();
        };
        x.fillStyle = "rgba(0,0,0,0.4)"; path(3, 6); x.fill();
        x.fillStyle = Q.tape; path(0, 0); x.fill();
        x.globalAlpha = 0.5; x.strokeStyle = Q.tapeEdge; x.lineWidth = 2; x.stroke(); x.globalAlpha = 1;
        for (let k = 0; k < 140; k++) { x.fillStyle = `rgba(${r.chance(0.5) ? "255,250,235" : "150,130,90"},${r.range(0.05, 0.14).toFixed(3)})`; x.fillRect(R(ox + r.range(10, pw - 40)), R(oy + r.range(4, ph - 4)), R(r.range(10, 60)), 1); }
        x.restore();
        typed(x, text, ox + R(Q.cap * 1.4), oy + R(ph / 2 + Q.cap * 0.47), R(Q.cap * 1.3), { font: Q.font, weight: Q.weight, ink: Q.ink, seed: 100 + i });
      }, { upload: true });
      m.userData.place(Q.x, Q.y);
      m.userData.set({ text });          // drawn + uploaded NOW, at build
      m.userData.opacity(0);
      return m;
    });
    return {
      meshes,
      show(index, a) { meshes.forEach((m, i) => m.userData.opacity(i === index ? a : 0)); },
    };
  }

  // ---- the whole board from a plan
  /**
   * evidence(plan, content, { parent }) -> { group, items, strings, flags, marker, update(t) }
   *   content: { [itemId]: { title, lines } (card / link) | { picture, caption } (photo) | { lines } (scrap) |
   *              { title, labels } (map) | {} (pin) } (+ seed, pinColor). Builds every planned item, string, flag and
   *   the marker; update(t) poses everything from the plan (pure in t; no canvas redraws).
   */
  function evidence(plan, content = {}, o = {}) {
    const group = new THREE.Group(); group.name = "evidence";
    (o.parent ?? stage.scene).add(group);
    const items = {};
    for (const it of plan.list) {
      const c = { pin: it.pin, pinColor: it.pinColor, noPin: it.noPin, seed: it.seed ?? it.layer + 1, ...(content[it.id] ?? {}) };
      let g;
      if (it.kind === "pin") { g = new THREE.Group(); const p = pinProp({ color: it.pinColor ?? 0 }); g.add(p); g.userData = { pin: p, size: [0, 0] }; }
      else if (it.kind === "photo") g = photo(c);
      else if (it.kind === "scrap") g = scrap(c);
      else if (it.kind === "map") g = mapFragment(c);
      else if (it.kind === "link") g = linkCard(c);
      else g = card(c);
      g.name = it.id; g.visible = false;
      group.add(g); items[it.id] = g;
    }
    const strings = plan.links.map(() => { const m = string(); group.add(m); return m; });
    const flags = plan.flags.map((f) => {
      const m = flag({ color: f.color });
      const host = items[f.item].userData.sheet;
      const pl = plan.items[f.item].pin;
      m.position.set(f.local[0] - pl[0], f.local[1] - pl[1], S.paper.curl * 0.9 + 0.0012);
      m.rotation.z = f.rot ?? 0;
      host.add(m);
      return m;
    });
    let marker = null;
    if (plan.marker) {
      marker = markerCircle(plan.marker);
      if (plan.marker.local) {
        const pl = plan.items[plan.marker.item].pin;
        marker.position.set(-pl[0], -pl[1], 0);
        items[plan.marker.item].userData.sheet.add(marker);
      } else group.add(marker);
    }
    function update(t) {
      for (const it of plan.list) {
        const g = items[it.id], q = threads.itemPose(plan, it.id, t);
        g.visible = q.vis > 0;
        if (!g.visible) continue;
        g.position.set(q.p[0], q.p[1], q.p[2]);
        g.rotation.set(q.r[0], q.r[1], q.r[2]);
        g.userData.pin.position.z = q.pinLift;
      }
      plan.links.forEach((lk, i) => {
        const s = threads.stringPoints(plan, i, t);
        strings[i].visible = s.vis;
        if (s.vis) strings[i].userData.set(s.pts);
      });
      plan.flags.forEach((f, i) => { const q = threads.flagPose(plan, i, t); flags[i].visible = q.vis > 0 && q.s > 0.001; flags[i].scale.setScalar(Math.max(0.001, q.s)); });
      if (marker) marker.userData.setProgress(threads.markerProgress(plan, t));
    }
    return { group, items, strings, flags, marker, update };
  }

  const props = { board, card, linkCard, photo, scrap, mapFragment, pin: pinProp, string, flag, markerCircle, markerArrow, lampSet, caption, evidence };
  const factories = { board: (o) => board(o.dims ?? {}), lampSet: () => lampSet() };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: threads, motion: threads,
    helpers: { paintCard, paintPhoto, paintScrap, paintMap, PICTURES, PICTURE_NAMES, ribbon, FONT_FACES },
  };
}
