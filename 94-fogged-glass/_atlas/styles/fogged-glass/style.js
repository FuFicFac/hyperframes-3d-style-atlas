// styles/fogged-glass/style.js — "Fogged Glass": a steamed-up window pane you can write on. The look lives in spec.js;
// WHAT is wiped when, where the drops run and when the fog creeps back lives in fogplan.js (THREE-free, shared with SCORE).
// This file turns a plan into pictures:
//   * the scene behind the glass, painted ONCE into a sharp canvas, and ONCE more into the "fogged" canvas
//     (pre-blurred + milk + bokeh discs of the scene's lights) — no per-frame blur passes;
//   * the fog mask: a small canvas redrawn from plan.segmentsAt(t) every frame ("lighten" = max over strokes), uploaded at once;
//   * the pane shader: fogged texture where the mask is 0, sharp scene where it is 1, a beaded boundary, a lit/shaded
//     refracting water rim along wiped edges, wet sheen on fresh strokes, lens drops from plan.dropsAt(t), parallax
//     between the glass and the scene (the backdrop sits `pane.backdrop` metres behind the pane);
//   * the wooden frame, wall and sill, and the overlay caption chip.
// Props never animate themselves: the scene calls set.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas } from "../../kit/canvas.js";
import { paintPixels, uploadTexture, woodTexture } from "../../kit/textures.js";
import { valueNoise2, fbm2 } from "../../kit/noise.js";
import { rng, clamp, lerp, smoothstep } from "../../kit/time.js";
import * as fogplan from "./fogplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const N_DROPS = fogplan.MAX_DROPS;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const PN = spec.pane, F = spec.fog, SC = spec.scene, DR = spec.drop;

  // ---------------------------------------------------------------- the scene behind the glass (painted once)
  /** paintScene(ctx, W, H) -> lights [{ x, y, r, c: "r,g,b", a }] (the points that turn into bokeh discs in the fog) */
  function paintScene(x, W, H) {
    const R = rng(SC.seed), out = [];
    const hz = H * SC.horizon;
    const disc = (cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
    // ---- sky
    let g = x.createLinearGradient(0, 0, 0, hz);
    for (const [p, c] of SC.sky) g.addColorStop(p, c);
    x.fillStyle = g; x.fillRect(0, 0, W, hz + 4);
    // ---- sun: wide glow + disc (half sunk behind the hills)
    const sx = SC.sun.u * W, sy = hz - 44;
    g = x.createRadialGradient(sx, sy, 0, sx, sy, SC.sun.glow);
    g.addColorStop(0, `rgba(${SC.sun.glowColor},0.95)`); g.addColorStop(0.22, `rgba(${SC.sun.glowColor},0.5)`); g.addColorStop(1, `rgba(${SC.sun.glowColor},0)`);
    x.fillStyle = g; x.fillRect(0, 0, W, hz + 4);
    x.fillStyle = SC.sun.color; disc(sx, sy, SC.sun.r);
    out.push({ x: sx, y: sy - 20, r: 150, c: "255,238,180", a: 0.75 });
    // ---- clouds: flat streaks, violet on top, coral underneath
    for (let i = 0; i < SC.cloud.count; i++) {
      const cx = R.range(-0.05, 1.05) * W, cy = R.range(0.07, 0.55) * H, w = R.range(240, 580), th = R.range(14, 36);
      for (let k = 0; k < 7; k++) {
        const ex = cx + R.range(-0.5, 0.5) * w, ey = cy + R.range(-0.5, 0.5) * th, rx = w * R.range(0.2, 0.45), ry = th * R.range(0.5, 1);
        g = x.createLinearGradient(0, ey - ry, 0, ey + ry);
        g.addColorStop(0, SC.cloud.top); g.addColorStop(1, SC.cloud.bottom);
        x.globalAlpha = 0.8; x.fillStyle = g; x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); x.fill();
      }
    }
    x.globalAlpha = 1;
    // ---- birds
    x.strokeStyle = SC.bird; x.lineCap = "round"; x.lineWidth = 3.5;
    for (let i = 0; i < 9; i++) {
      const bx = 0.33 * W + (i % 5) * 46 + R.range(-12, 12), by = 0.3 * H + Math.floor(i / 5) * 40 - (i % 5) * 16 + R.range(-8, 8), s = R.range(0.7, 1.1);
      x.beginPath(); x.moveTo(bx - 15 * s, by - 5 * s); x.quadraticCurveTo(bx - 6 * s, by - 10 * s, bx, by); x.quadraticCurveTo(bx + 6 * s, by - 10 * s, bx + 15 * s, by - 5 * s); x.stroke();
    }
    // ---- hot-air balloons (generic, striped)
    for (const b of SC.balloons) {
      const cx = b.u * W, cy = b.v * H, r = b.r;
      const env = () => { x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.bezierCurveTo(cx + r, cy + r * 0.72, cx + r * 0.3, cy + r * 1.1, cx + r * 0.2, cy + r * 1.42); x.lineTo(cx - r * 0.2, cy + r * 1.42); x.bezierCurveTo(cx - r * 0.3, cy + r * 1.1, cx - r, cy + r * 0.72, cx - r, cy); x.closePath(); };
      x.save(); env(); x.clip();
      x.fillStyle = b.a; x.fillRect(cx - r, cy - r, r * 2, r * 2.5);
      for (let k = 3; k >= 0; k--) { x.fillStyle = k % 2 ? b.a : b.b; x.beginPath(); x.ellipse(cx, cy + r * 0.25, r * Math.sin(((k + 0.5) / 4.5) * Math.PI * 0.5), r * 1.3, 0, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = "rgba(20,10,60,0.22)"; x.fillRect(cx - r, cy + r * 0.62, r * 2, r * 0.12);   // a band
      g = x.createRadialGradient(cx - r * 0.5, cy + r * 0.5, r * 0.1, cx, cy, r * 1.5);
      g.addColorStop(0, "rgba(255,225,170,0.55)"); g.addColorStop(0.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(30,20,90,0.5)");
      x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2.5);
      x.restore();
      x.strokeStyle = "rgba(42,35,88,0.9)"; x.lineWidth = Math.max(1.5, r * 0.02);
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.2, cy + r * 1.42); x.lineTo(cx + s * r * 0.12, cy + r * 1.7); x.stroke(); }
      x.fillStyle = "#6b4426"; x.beginPath(); x.roundRect(cx - r * 0.15, cy + r * 1.68, r * 0.3, r * 0.22, r * 0.04); x.fill();
      x.fillStyle = "#ffd26a"; disc(cx, cy + r * 1.5, r * 0.07);
      out.push({ x: cx, y: cy + r * 1.5, r: 16 + r * 0.16, c: "255,190,90", a: 0.9 });
    }
    // ---- far hills
    SC.hills.forEach((c, k) => {
      x.fillStyle = c; x.beginPath(); x.moveTo(0, hz + 30);
      for (let i = 0; i <= 128; i++) { const u = i / 128; x.lineTo(u * W, hz - [62, 30][k] - [30, 20][k] * (Math.sin(u * [7.3, 11.1][k] + [0.6, 2.4][k]) + 0.5 * Math.sin(u * [17, 23][k] + k))); }
      x.lineTo(W, hz + 30); x.closePath(); x.fill();
    });
    // ---- skyline on the far bank
    const base = hz + 18, C = SC.city;
    const windows = (bx, top, bw, bh, hot) => {
      for (let wy = top + 9; wy < top + bh - 10; wy += 13) for (let wx = bx + 6; wx < bx + bw - 9; wx += 11) {
        if (!R.chance(C.lit)) continue;
        x.fillStyle = R.chance(hot) ? C.windowHot : C.window; x.fillRect(wx, wy, 5, 7);
        if (R.chance(0.1)) out.push({ x: wx + 2, y: wy + 3, r: R.range(13, 24), c: R.chance(0.25) ? "150,220,255" : "255,214,120", a: 0.8 });
      }
    };
    let bx = -30;
    while (bx < W + 30) {
      const bw = R.range(34, 92), cl = Math.exp(-(((bx - 0.62 * W) / (0.22 * W)) ** 2));
      const bh = R.range(40, 105) + cl * R.range(70, 230), top = base - bh;
      x.fillStyle = R.chance(0.5) ? C.dark : C.light; x.fillRect(bx, top, bw, bh + 2);
      if (R.chance(0.3)) { x.strokeStyle = C.dark; x.lineWidth = 2.5; x.beginPath(); x.moveTo(bx + bw / 2, top); x.lineTo(bx + bw / 2, top - R.range(14, 44)); x.stroke(); }
      if (R.chance(0.3)) { x.fillStyle = C.dark; x.fillRect(bx + bw * 0.2, top - 10, bw * 0.35, 11); }
      x.fillStyle = C.rim; x.globalAlpha = 0.75; x.fillRect(bx, top, 3, bh); x.globalAlpha = 1;
      windows(bx, top, bw, bh, 0.3);
      bx += bw + R.range(-4, 7);
    }
    {   // a clock tower with a spire, and a dome
      const tx = 0.43 * W, tw = 54, th = 300, top = base - th;
      x.fillStyle = C.dark; x.fillRect(tx, top, tw, th); x.beginPath(); x.moveTo(tx - 6, top); x.lineTo(tx + tw / 2, top - 96); x.lineTo(tx + tw + 6, top); x.closePath(); x.fill();
      x.fillStyle = C.rim; x.globalAlpha = 0.8; x.fillRect(tx, top, 3.5, th); x.globalAlpha = 1;
      x.fillStyle = "#fff0c0"; disc(tx + tw / 2, top + 40, 17);
      x.strokeStyle = C.dark; x.lineWidth = 3; x.beginPath(); x.moveTo(tx + tw / 2, top + 40); x.lineTo(tx + tw / 2, top + 28); x.moveTo(tx + tw / 2, top + 40); x.lineTo(tx + tw / 2 + 9, top + 44); x.stroke();
      out.push({ x: tx + tw / 2, y: top + 40, r: 30, c: "255,236,180", a: 0.9 });
      windows(tx, top + 70, tw, th - 70, 0.5);
      const dx = 0.905 * W, dr = 62;
      x.fillStyle = C.light; x.fillRect(dx - dr - 14, base - 96, dr * 2 + 28, 98); x.beginPath(); x.arc(dx, base - 96, dr, Math.PI, 0); x.fill();
      x.fillRect(dx - 4, base - 96 - dr - 30, 8, 34);
      x.strokeStyle = C.rim; x.globalAlpha = 0.8; x.lineWidth = 3.5; x.beginPath(); x.arc(dx, base - 96, dr - 1, Math.PI, Math.PI * 1.45); x.stroke(); x.globalAlpha = 1;
      windows(dx - dr - 14, base - 90, dr * 2 + 28, 92, 0.5);
    }
    // ---- river
    const RV = SC.river, yb = H * 0.845;
    g = x.createLinearGradient(0, base, 0, yb);
    g.addColorStop(0, RV.far); g.addColorStop(0.3, RV.mid); g.addColorStop(1, RV.near);
    x.fillStyle = g; x.fillRect(0, base, W, yb - base + 2);
    g = x.createLinearGradient(0, base, 0, base + 80);
    g.addColorStop(0, "rgba(44,38,96,0.62)"); g.addColorStop(1, "rgba(44,38,96,0)");
    x.fillStyle = g; x.fillRect(0, base, W, 80);
    for (let i = 0; i < 520; i++) {   // ripples
      const v = R.next() ** 1.4, y = lerp(base + 4, yb - 3, v), len = lerp(10, 70, v) * R.range(0.5, 1.4);
      x.fillStyle = R.chance(0.5) ? RV.ripple : "#ffe2b8"; x.globalAlpha = R.range(0.12, 0.32);
      x.fillRect(R.range(-40, W), y, len, lerp(1.5, 4, v));
    }
    for (let i = 0; i < 210; i++) {   // the sun's glitter path
      const v = R.next(), y = lerp(base + 3, yb - 3, v), half = lerp(28, 190, v), len = lerp(10, 64, v) * R.range(0.5, 1.3);
      const gx = sx + R.gaussian(0, 0.42) * half;
      x.fillStyle = RV.glitter; x.globalAlpha = R.range(0.5, 0.95);
      x.fillRect(gx - len / 2, y, len, lerp(2, 5, v));
      if (i % 14 === 0) out.push({ x: gx, y, r: lerp(12, 26, v), c: "255,244,200", a: 0.75 });
    }
    x.globalAlpha = 1;
    {   // a small boat with a lantern
      const bx0 = 0.6 * W, by0 = lerp(base, yb, 0.52);
      x.fillStyle = "#2a2358"; x.beginPath(); x.moveTo(bx0 - 46, by0 - 8); x.lineTo(bx0 + 52, by0 - 8); x.lineTo(bx0 + 38, by0 + 8); x.lineTo(bx0 - 36, by0 + 8); x.closePath(); x.fill();
      x.fillRect(bx0 - 2, by0 - 52, 3.5, 46);
      x.fillStyle = "#ef6a5a"; x.beginPath(); x.moveTo(bx0 + 3, by0 - 52); x.lineTo(bx0 + 34, by0 - 14); x.lineTo(bx0 + 3, by0 - 14); x.closePath(); x.fill();
      x.fillStyle = "#ffe9a8"; disc(bx0 - 30, by0 - 14, 5);
      out.push({ x: bx0 - 30, y: by0 - 14, r: 22, c: "255,220,140", a: 0.9 });
    }
    // ---- the near bank: promenade, railing, trees, lamps
    const BK = SC.bank;
    x.fillStyle = BK.color; x.fillRect(0, yb, W, H - yb);
    x.strokeStyle = BK.rail; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, yb - 16); x.lineTo(W, yb - 16); for (let px = 6; px < W; px += 26) { x.moveTo(px, yb - 16); x.lineTo(px, yb + 2); } x.stroke();
    for (let i = 0; i < 6; i++) {
      const tx = ((i + 0.5 + R.range(-0.25, 0.25)) / 6) * W, ty = yb + 10, s = R.range(0.85, 1.2);
      x.fillStyle = "#33204a"; x.fillRect(tx - 5 * s, ty - 70 * s, 10 * s, 76 * s);
      for (const [ox, oy, rr] of [[-26, -92, 36], [22, -98, 40], [0, -128, 42]]) {
        x.fillStyle = BK.tree; disc(tx + ox * s, ty + oy * s, rr * s);
        x.strokeStyle = BK.treeRim; x.globalAlpha = 0.75; x.lineWidth = 4; x.beginPath(); x.arc(tx + ox * s, ty + oy * s, rr * s - 2, Math.PI * 0.85, Math.PI * 1.35); x.stroke(); x.globalAlpha = 1;
      }
    }
    for (let i = 0; i < 9; i++) {
      const lx = ((i + 0.5) / 9) * W + R.range(-30, 30), ly = yb + 12, top = ly - 104;
      x.strokeStyle = BK.rail; x.lineWidth = 5; x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx, top + 8); x.stroke();
      g = x.createRadialGradient(lx, top, 0, lx, top, 78);
      g.addColorStop(0, `rgba(${BK.lampGlow},0.85)`); g.addColorStop(0.3, `rgba(${BK.lampGlow},0.3)`); g.addColorStop(1, `rgba(${BK.lampGlow},0)`);
      x.fillStyle = g; disc(lx, top, 78);
      x.fillStyle = BK.lamp; disc(lx, top, 10);
      out.push({ x: lx, y: top, r: R.range(26, 48), c: BK.lampGlow, a: 1 });
    }
    // ---- foreground roofs
    const RF = SC.roofs;
    let rx0 = -60, k = 0;
    while (rx0 < W + 40) {
      const w = R.range(180, 290), ridge = H * R.range(0.85, 0.9), eave = ridge + w * 0.24;
      x.fillStyle = k++ % 2 ? RF.a : RF.b;
      x.beginPath(); x.moveTo(rx0 - 8, eave); x.lineTo(rx0 + w / 2, ridge); x.lineTo(rx0 + w + 8, eave); x.lineTo(rx0 + w + 8, H); x.lineTo(rx0 - 8, H); x.closePath(); x.fill();
      x.strokeStyle = RF.rim; x.lineWidth = 5; x.lineCap = "round"; x.beginPath(); x.moveTo(rx0 - 6, eave); x.lineTo(rx0 + w / 2, ridge); x.stroke();
      const cxr = rx0 + w * 0.72, cyr = lerp(ridge, eave, 0.44);
      x.fillStyle = RF.chimney; x.fillRect(cxr - 13, cyr - 58, 26, 60); x.fillStyle = RF.rim; x.fillRect(cxr - 13, cyr - 58, 4, 56);
      x.strokeStyle = "rgba(255,214,206,0.4)"; x.lineWidth = 12;
      x.beginPath(); x.moveTo(cxr, cyr - 64); x.bezierCurveTo(cxr + 26, cyr - 96, cxr - 12, cyr - 124, cxr + 30, cyr - 168); x.stroke();
      const wx = rx0 + w * 0.42, wy = lerp(ridge, eave, 0.62);
      x.fillStyle = RF.window; x.beginPath(); x.roundRect(wx - 15, wy - 19, 30, 38, 6); x.fill();
      x.strokeStyle = RF.chimney; x.lineWidth = 3; x.beginPath(); x.moveTo(wx, wy - 19); x.lineTo(wx, wy + 19); x.moveTo(wx - 15, wy); x.lineTo(wx + 15, wy); x.stroke();
      if (k % 2) out.push({ x: wx, y: wy, r: R.range(30, 58), c: "255,206,110", a: 0.9 });
      rx0 += w - R.range(6, 30);
    }
    return out;
  }

  /** bakeFogged(sharp canvas, lights) -> canvas: the view through condensation (blur + milk + bokeh), done once */
  function bakeFogged(sharp, lts) {
    const [W, H] = SC.size, c = newCanvas(W, H), x = c.getContext("2d");
    const small = newCanvas(W / 16, H / 16), sx = small.getContext("2d");
    sx.imageSmoothingEnabled = true; sx.drawImage(sharp, 0, 0, W / 16, H / 16);
    x.imageSmoothingEnabled = true; x.drawImage(small, 0, 0, W, H);          // soft underlay (keeps the blur's edges opaque)
    x.filter = `blur(${F.blur}px)`; x.drawImage(sharp, 0, 0); x.filter = "none";
    const g = x.createLinearGradient(0, 0, 0, H);
    const hx = F.milk.replace("#", ""), rgb = [0, 2, 4].map((i) => parseInt(hx.slice(i, i + 2), 16)).join(",");
    g.addColorStop(0, `rgba(${rgb},${F.milkAmount})`); g.addColorStop(1, `rgba(${rgb},${F.milkAmount + F.milkBottom})`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = "screen";
    const B = F.bokeh;
    for (const L of lts) {
      const r = L.r * B.scale, a = L.a * B.gain;
      const q = x.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      q.addColorStop(0, `rgba(${L.c},${a * (1 - B.rim)})`); q.addColorStop(0.76, `rgba(${L.c},${a * (1 - B.rim)})`); q.addColorStop(0.9, `rgba(${L.c},${a})`); q.addColorStop(1, `rgba(${L.c},0)`);
      x.fillStyle = q; x.beginPath(); x.arc(L.x, L.y, r, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = "source-over";
    return c;
  }

  const picTex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    stage.renderer.initTexture(t);
    return t;
  };

  // ---------------------------------------------------------------- props
  /**
   * pane(plan) -> Mesh (the glass, 3.2 x 1.8 m in the XY plane at z = 0, facing +Z).
   * userData.update(t) repaints the fog mask from plan.segmentsAt(t), uploads it and writes the drop + reveal uniforms.
   */
  function pane(plan) {
    const [W, H] = SC.size;
    const sharp = newCanvas(W, H);
    const lts = paintScene(sharp.getContext("2d"), W, H);
    const fogged = bakeFogged(sharp, lts);
    const sharpTex = picTex(sharp), fogTex = picTex(fogged);
    // micro-droplet grain: R fine beads, G low-frequency patches, B sparse specks (tileable)
    const beadCanvas = paintPixels(512, (u, v) => [
      smoothstep(0.3, 0.75, valueNoise2(u * 110, v * 110, 31, 110)),
      fbm2(u * 3, v * 3, { seed: 47, octaves: 4, period: 3 }),
      smoothstep(0.74, 0.86, valueNoise2(u * 34, v * 34, 59, 34)),
    ]);
    const beadTex = new THREE.CanvasTexture(beadCanvas);
    beadTex.colorSpace = THREE.NoColorSpace; beadTex.wrapS = beadTex.wrapT = THREE.RepeatWrapping;
    beadTex.minFilter = THREE.LinearFilter; beadTex.magFilter = THREE.LinearFilter; beadTex.generateMipmaps = false;
    stage.renderer.initTexture(beadTex);
    // the fog mask (R clear by finger/palm, G clear by drip trails, B fresh/wet)
    const [MW, MH] = PN.mask;
    const mc = newCanvas(MW, MH), mx = mc.getContext("2d");
    mx.fillStyle = "#000"; mx.fillRect(0, 0, MW, MH);
    const maskTex = new THREE.CanvasTexture(mc);
    maskTex.colorSpace = THREE.NoColorSpace; maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
    maskTex.minFilter = THREE.LinearFilter; maskTex.magFilter = THREE.LinearFilter; maskTex.generateMipmaps = false;
    stage.renderer.initTexture(maskTex);

    const mag = (1 + PN.backdrop / PN.restDistance) / PN.zoom;
    const U = {
      uSharp: { value: sharpTex }, uFog: { value: fogTex }, uMask: { value: maskTex }, uBead: { value: beadTex },
      uBack: { value: new THREE.Vector2(PN.w * mag, PN.h * mag) },
      uMaskPx: { value: new THREE.Vector2(1.5 / MW, 1.5 / MH) },
      uD: { value: PN.backdrop }, uAspect: { value: PN.w / PN.h }, uReveal: { value: 0 },
      uDrops: { value: Array.from({ length: N_DROPS }, () => new THREE.Vector4()) },
      uBeadScale: { value: F.bead.scale }, uBeadAmt: { value: F.bead.amount }, uBeadEdge: { value: F.bead.edge },
      uRimLight: { value: F.rim.light }, uRimDark: { value: F.rim.dark }, uRefract: { value: F.rim.refract },
      uRimDir: { value: new THREE.Vector2(...F.rim.dir).normalize() },
      uGain: { value: F.wiped.gain }, uResidue: { value: F.wiped.residue }, uSheen: { value: F.wiped.sheen },
      uEvapNoise: { value: F.evaporate.noise }, uReflect: { value: F.reflection },
      uLens: { value: DR.lens }, uDropRim: { value: DR.rimDark }, uDropHi: { value: DR.highlight }, uSquash: { value: DR.squash },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec2 vP;
        void main() { vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSharp; uniform sampler2D uFog; uniform sampler2D uMask; uniform sampler2D uBead;
        uniform vec2 uBack; uniform vec2 uMaskPx; uniform vec2 uRimDir;
        uniform float uD; uniform float uAspect; uniform float uReveal;
        uniform vec4 uDrops[${N_DROPS}];
        uniform float uBeadScale; uniform float uBeadAmt; uniform float uBeadEdge; uniform float uRimLight; uniform float uRimDark;
        uniform float uRefract; uniform float uGain; uniform float uResidue; uniform float uSheen; uniform float uEvapNoise;
        uniform float uReflect; uniform float uLens; uniform float uDropRim; uniform float uDropHi; uniform float uSquash;
        varying vec2 vUv; varying vec2 vP;
        // a point p on the glass (pane metres) -> uv of the scene uD metres behind it, seen from the camera (parallax)
        vec2 sceneUv(vec2 p) { vec2 q = p + (p - cameraPosition.xy) * (uD / max(cameraPosition.z, 0.2)); return q / uBack + 0.5; }
        float clearOf(vec3 m) { return max(m.r, m.g); }
        void main() {
          vec3 m0 = texture2D(uMask, vUv).rgb;
          float cx1 = clearOf(texture2D(uMask, vUv + vec2(uMaskPx.x, 0.0)).rgb), cx0 = clearOf(texture2D(uMask, vUv - vec2(uMaskPx.x, 0.0)).rgb);
          float cy1 = clearOf(texture2D(uMask, vUv + vec2(0.0, uMaskPx.y)).rgb), cy0 = clearOf(texture2D(uMask, vUv - vec2(0.0, uMaskPx.y)).rgb);
          float cl = (clearOf(m0) * 2.0 + cx1 + cx0 + cy1 + cy0) / 6.0;
          vec2 grad = vec2(cx1 - cx0, cy1 - cy0);
          float gl = length(grad);
          vec2 gn = grad / max(gl, 1e-4);
          float fresh = m0.b;
          vec3 bd = texture2D(uBead, vUv * vec2(uAspect, 1.0) * uBeadScale).rgb;
          vec3 bd2 = texture2D(uBead, vUv * vec2(uAspect, 1.0) * 0.5 + 0.37).rgb;
          cl *= 1.0 - uResidue * bd.b * (1.0 - fresh);
          float ev = smoothstep(0.0, 0.3, uReveal * (uEvapNoise + 0.3) - bd2.g * uEvapNoise);
          // the edge threshold wobbles with fine beads AND mid-size patches, so a stroke that fogs over clouds up in
          // soft patches instead of a pixel-grid dissolve; the burn-off (ev) is applied after, with its own smooth edge
          float mottle = texture2D(uBead, vUv * vec2(uAspect, 1.0) * 4.0 + vec2(0.11, 0.53)).g;
          float nz = (bd.r - 0.5) * 0.25 + (mottle - 0.5) * 1.1;
          float cb = smoothstep(0.5 - uBeadEdge * 0.75, 0.5 + uBeadEdge * 0.75, cl + nz * uBeadEdge);
          cb = max(cb, ev);
          cl = max(cl, ev);
          float band = smoothstep(0.12, 0.5, cl) * (1.0 - smoothstep(0.5, 0.92, cl)) * (1.0 - ev);
          float lit = dot(gn, uRimDir) * smoothstep(0.02, 0.12, gl);
          vec3 sharp = texture2D(uSharp, sceneUv(vP + gn * band * uRefract)).rgb * mix(uGain, 1.04, uReveal);
          vec3 fog = texture2D(uFog, sceneUv(vP)).rgb * (1.0 + (bd.r - 0.5) * uBeadAmt);
          vec3 col = mix(fog, sharp, cb);
          col += band * max(lit, 0.0) * uRimLight;
          col *= 1.0 - band * max(-lit, 0.0) * uRimDark;
          col += fresh * cb * uSheen * (0.4 + bd2.g);
          col += uReflect * smoothstep(0.25, 0.85, vUv.x * 0.55 + vUv.y * 0.6);
          for (int i = 0; i < ${N_DROPS}; i++) {
            vec4 dp = uDrops[i];
            vec2 d = vP - dp.xy;
            d.y *= mix(1.0, uSquash, step(0.0, d.y));
            float r = max(dp.z, 1e-4);
            float q = length(d) / r;
            float inside = (1.0 - smoothstep(0.84, 1.0, q)) * step(2e-4, dp.z);
            vec3 dc = texture2D(uSharp, sceneUv(dp.xy - d * uLens)).rgb;
            dc *= 1.0 - uDropRim * smoothstep(0.4, 1.0, q);
            dc += uDropHi * (1.0 - smoothstep(0.0, 0.34, length(d / r - vec2(-0.36, 0.4))));
            col = mix(col, dc, inside);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      toneMapped: false,
    });
    mat.name = "foggedPane";
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PN.w, PN.h), mat);
    mesh.name = "pane";
    const k = MW / fogplan.PANE.W, segs = [], drops = [];
    const ppm = fogplan.PANE.W / PN.w;
    mesh.userData = {
      uniforms: U, material: mat, textures: { sharp: sharpTex, fogged: fogTex, mask: maskTex, bead: beadTex }, lights: lts,
      update(t) {
        // the mask is redrawn from the plan every frame: no state survives from the previous frame
        mx.reset?.();
        mx.setTransform(1, 0, 0, 1, 0, 0); mx.globalAlpha = 1; mx.filter = "none";
        mx.globalCompositeOperation = "source-over";
        mx.fillStyle = "#000"; mx.fillRect(0, 0, MW, MH);
        mx.globalCompositeOperation = "lighten"; mx.lineCap = "round"; mx.lineJoin = "round";
        for (const g of plan.segmentsAt(t, segs)) {
          const L = Math.round(g.level * 255), Fr = Math.round(g.fresh * g.level * 255);
          mx.strokeStyle = g.kind === "trail" ? `rgb(0,${L},0)` : `rgb(${L},0,${Fr})`;
          mx.lineWidth = g.w * k;
          mx.beginPath(); mx.moveTo(g.x0 * k, g.y0 * k); mx.lineTo(g.x1 * k + 0.01, g.y1 * k); mx.stroke();
        }
        uploadTexture(stage, maskTex);
        U.uReveal.value = plan.revealAt(t);
        const ds = plan.dropsAt(t, drops);
        for (let i = 0; i < N_DROPS; i++) {
          const d = ds[i];
          if (d) U.uDrops.value[i].set((d.x / fogplan.PANE.W - 0.5) * PN.w, (0.5 - d.y / fogplan.PANE.H) * PN.h, d.r / ppm, d.v);
          else U.uDrops.value[i].set(0, 0, 0, 0);
        }
      },
    };
    return mesh;
  }

  /** frame() -> Group: four wooden bars around the pane, the wall behind and a sill */
  function frame() {
    const g = new THREE.Group(); g.name = "frame";
    const fw = PN.frame, fd = PN.frameDepth, WG = spec.woodGrain;
    // painted wood grain (baked once): along the bar on the horizontals, turned 90 degrees on the uprights
    const grain = woodTexture({ size: 512, boards: 1, seed: 41, grainFreq: WG.freq, contrast: WG.contrast, dark: WG.dark, mid: WG.mid, light: WG.light, seam: WG.dark, repeat: [2, 0.5] });
    const grainV = grain.clone(); grainV.center.set(0.5, 0.5); grainV.rotation = Math.PI / 2;
    for (const t of [grain, grainV]) { t.colorSpace = THREE.SRGBColorSpace; stage.renderer.initTexture(t); }
    const woodH = materials.wood.clone(); woodH.color.set("#ffffff"); woodH.map = grain;
    const woodV = woodH.clone(); woodV.map = grainV;
    const bar = (w, h, x, y, m0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, fd), m0); m.position.set(x, y, fd * 0.3); g.add(m); };
    bar(PN.w + fw * 2, fw, 0, PN.h / 2 + fw / 2, woodH); bar(PN.w + fw * 2, fw, 0, -PN.h / 2 - fw / 2, woodH);
    bar(fw, PN.h, -PN.w / 2 - fw / 2, 0, woodV); bar(fw, PN.h, PN.w / 2 + fw / 2, 0, woodV);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), materials.wall); wall.position.z = -0.03; wall.name = "wall"; g.add(wall);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(PN.w + fw * 3, 0.07, 0.34), materials.sill); sill.position.set(0, -PN.h / 2 - fw - 0.035, 0.17); g.add(sill);
    return g;
  }

  /** caption() -> overlay chip (dark plate, amber edge, a dot, white text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.3);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(10,14,40,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, 22); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 22); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 20.5); x.stroke();
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;
      x.fillStyle = Q.edge; x.beginPath(); x.arc(cx, cy, ic / 2, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.dot; x.beginPath(); x.arc(cx - ic * 0.12, cy - ic * 0.12, ic / 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  /** windowSet(plan) -> { group, pane, frame, update(t) }: the pane in its frame, added to the scene */
  function windowSet(plan) {
    const group = new THREE.Group(); group.name = "window";
    const pn = pane(plan), fr = frame();
    group.add(fr, pn);
    stage.scene.add(group);
    return { group, pane: pn, frame: fr, update: (t) => pn.userData.update(t) };
  }

  void clamp;
  const props = { pane, frame, caption, windowSet };
  const factories = {};
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx, plan: fogplan, motion: fogplan };
}
