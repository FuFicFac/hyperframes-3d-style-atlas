// styles/floating-screens/style.js — "Floating Screens": UI cards floating in soft 3D space over a luminous
// mesh-gradient backdrop (modern software-launch look). Everything is synchronous and seeded; time enters only
// through update/set calls from renderAt. Choreography (poses, layouts, typing, paths) is in ./choreo.js
// (THREE-free, also imported by scene.config.js for the SCORE).
//
//   card       rounded slab, canvas UI face (static or redrawn from a state object), optional back face,
//              accent focus ring, haze (recede), presence fade; registered as shadow caster + receiver
//   ui         the 2D design-system painter used by card faces (chrome, bubbles, search, rows, code, chart,
//              doc pages, pills, tags, avatars, icons, buttons, toggles, progress, greeked text)
//   backdrop   big plane with drifting colour blobs + dither; receives the soft shadows
//   frosted    milky translucent glass panel with a bright inner rim (fake blur: gradient + fresnel edge)
//   shadows    fake key-light shadows: every receiver draws the projected rounded footprints of the casters
//              in front of it, blur/offset/fade grow with the gap (card -> card and card -> backdrop)
//   connector  screen-space line on a bezier between two points, draw-on, arrowhead, travelling data dots
//   cursor     pointer with click dip + ripple · pulseRings · stepLabel (overlay, exact colours)
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { cardMesh, shapes } from "../../kit/shapes.js";
import { makeCanvas, canvasTexture } from "../../kit/textures.js";
import { getOverlay, pinToScreen } from "../../kit/overlay.js";
import { screenLines } from "../../kit/lines.js";
import { depthOfField as kitDepthOfField } from "../../kit/studio.js";
import { rng, clamp, lerp, smoothstep, toEase } from "../../kit/time.js";
import * as choreo from "./choreo.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, choreo };

const S = STYLE_SPEC;
const P = S.palette;
const FONT = S.ui.fonts;
const col = (c) => new THREE.Color(c);

// =========================================================================== UI painter (canvas 2D, dp units)
const font = (weight, size, fam = "ui") => `${weight} ${size}px ${FONT[fam] ?? fam}`;
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
/** wrap(ctx, text, maxW) -> lines (ctx.font must be set). */
function wrap(ctx, text, maxW) {
  if (!maxW) return [text];
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * ui — the design-system painter. Every function draws into a 2D context already scaled to dp
 * (design points; the card face is W x H dp). Colours default to the spec palette. Pure: same args, same pixels.
 */
export const ui = {
  palette: P,
  font,
  roundRect: rr,
  wrap,
  /** text(ctx, str, x, y, { size, weight, color, fam, align, maxW, lineH, count, tracking }) -> { w, h, lines, caret:[x,y] }
   *  y is the TOP of the first line. Wraps the FULL string first, then draws only `count` characters, so typing never reflows. */
  text(ctx, str, x, y, o = {}) {
    const { size = 16, weight = 500, color = P.ink, fam = "ui", align = "left", maxW = 0, lineH = 1.38, count = Infinity, tracking = 0 } = o;
    ctx.font = font(weight, size, fam);
    ctx.letterSpacing = `${tracking * size}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    const lines = wrap(ctx, str, maxW);
    let left = count, caret = [x, y + size * 0.15], w = 0;
    lines.forEach((ln, i) => {
      const by = y + size * 1.0 + i * size * lineH - size * 0.08;
      w = Math.max(w, ctx.measureText(ln).width);
      if (left <= 0) return;
      const part = ln.slice(0, left);
      ctx.fillText(part, x, by);
      const pw = ctx.measureText(part).width;
      caret = [align === "center" ? x + pw / 2 : x + pw, by - size * 0.86];
      left -= ln.length + 1; // the wrapped space
    });
    ctx.letterSpacing = "0px";
    return { w, h: size * lineH * lines.length, lines, caret, lineHeight: size * lineH };
  },
  /** caps(ctx, str, x, y, { size = 10.5, color, tracking = .1, weight = 650 }) — small tracked caps label (y = top). */
  caps(ctx, str, x, y, o = {}) {
    return ui.text(ctx, String(str).toUpperCase(), x, y, { size: o.size ?? 10.5, weight: o.weight ?? 650, color: o.color ?? P.muted, tracking: o.tracking ?? 0.1, align: o.align ?? "left" });
  },
  /** caret(ctx, x, y, h, color) — text caret (2 dp bar). */
  caret(ctx, x, y, h, color = P.accent) {
    ctx.fillStyle = color;
    rr(ctx, x + 1, y, 2, h, 1);
    ctx.fill();
  },
  /** greek(ctx, x, y, w, { lines = 3, seed = 1, color, h, gap, last = .55, min = .78 }) -> height. Greeked text bars. */
  greek(ctx, x, y, w, o = {}) {
    const G = S.ui.greek, R = rng(o.seed ?? 1), n = o.lines ?? 3, h = o.h ?? G.h, gap = o.gap ?? G.gap;
    ctx.fillStyle = o.color ?? P.line;
    for (let i = 0; i < n; i++) {
      const f = i === n - 1 ? (o.last ?? 0.55) * R.range(0.8, 1.15) : R.range(o.min ?? 0.78, 1);
      rr(ctx, x, y + i * (h + gap), w * Math.min(1, f), h, Math.min(h / 2, G.radius));
      ctx.fill();
    }
    return n * (h + gap) - gap;
  },
  /** icon(ctx, kind, cx, cy, size, color, { width }) — line icons: search doc spark send check user plus arrow bolt chat sliders cmd lock clock globe book. */
  icon(ctx, kind, cx, cy, s, color = P.ink2, o = {}) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s / 24, s / 24);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = o.width ?? 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const L = (pts, close) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); if (close) ctx.closePath(); ctx.stroke(); };
    switch (kind) {
      case "search": ctx.beginPath(); ctx.arc(-2, -2, 6.5, 0, Math.PI * 2); ctx.stroke(); L([[3, 3], [8, 8]]); break;
      case "doc": L([[-6, -9], [2, -9], [7, -4], [7, 9], [-6, 9]], true); L([[2, -9], [2, -4], [7, -4]]); L([[-2.5, 1], [3.5, 1]]); L([[-2.5, 4.8], [3.5, 4.8]]); break;
      case "spark":
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(1.2, -1.2, 9, 0); ctx.quadraticCurveTo(1.2, 1.2, 0, 9); ctx.quadraticCurveTo(-1.2, 1.2, -9, 0); ctx.quadraticCurveTo(-1.2, -1.2, 0, -9); ctx.closePath(); ctx.fill();
        break;
      case "send": L([[-7, 0], [7, 0]]); L([[1, -6], [7, 0], [1, 6]]); break;
      case "up": L([[0, 7], [0, -7]]); L([[-6, -1], [0, -7], [6, -1]]); break;
      case "check": L([[-6, 0.5], [-1.5, 5], [7, -5]]); break;
      case "user": ctx.beginPath(); ctx.arc(0, -3.5, 4, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 10, 8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
      case "plus": L([[-6, 0], [6, 0]]); L([[0, -6], [0, 6]]); break;
      case "arrow": L([[-6, 0], [6, 0]]); L([[1, -5], [6, 0], [1, 5]]); break;
      case "bolt": L([[2, -9], [-5, 1], [0, 1], [-2, 9], [5, -1], [0, -1]], true); break;
      case "chat": rr(ctx, -8, -7, 16, 12, 4); ctx.stroke(); L([[-3, 5], [-5, 9], [1, 5]]); break;
      case "sliders": L([[-8, -4], [8, -4]]); L([[-8, 4], [8, 4]]); ctx.beginPath(); ctx.arc(-2, -4, 2.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(3, 4, 2.4, 0, 7); ctx.fill(); break;
      case "lock": rr(ctx, -6, -1, 12, 9, 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -3, 4, Math.PI, 0); ctx.stroke(); break;
      case "clock": ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.stroke(); L([[0, -4.5], [0, 0], [3.5, 2]]); break;
      case "globe": ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 8, 0, 0, 7); ctx.stroke(); L([[-8, 0], [8, 0]]); break;
      case "book": L([[0, -6], [0, 8]]); L([[0, -6], [-8, -8], [-8, 6], [0, 8], [8, 6], [8, -8], [0, -6]]); break;
      case "cmd": ctx.font = font(600, 15); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⌘", 0, 1); break;
      default: ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
    }
    ctx.restore();
  },
  /** avatar(ctx, cx, cy, r, { initials, fill, color, gradient:[a,b], icon }) — round avatar / bot badge. */
  avatar(ctx, cx, cy, r, o = {}) {
    if (o.gradient) {
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, o.gradient[0]); g.addColorStop(1, o.gradient[1]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = o.fill ?? P.accentSoft;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (o.icon) ui.icon(ctx, o.icon, cx, cy, r * 1.05, o.color ?? "#fff");
    else if (o.initials) {
      ctx.font = font(650, r * 0.82); ctx.fillStyle = o.color ?? P.accentDark; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(o.initials, cx, cy + r * 0.04);
    }
  },
  /** pill(ctx, x, y, text, { size = 13, h, fill, color, border, icon, iconColor, padX, weight }) -> width (x,y = top-left). */
  pill(ctx, x, y, text, o = {}) {
    const size = o.size ?? 13, h = o.h ?? size * 2.05, padX = o.padX ?? size * 0.85, ic = o.icon ? size * 1.25 : 0;
    ctx.font = font(o.weight ?? 600, size);
    const tw = ctx.measureText(text).width, w = tw + padX * 2 + (ic ? ic + size * 0.4 : 0);
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = o.fill ?? P.accentSoft; ctx.fill();
    if (o.border) { ctx.lineWidth = o.borderWidth ?? 1; ctx.strokeStyle = o.border; ctx.stroke(); }
    if (ic) ui.icon(ctx, o.icon, x + padX + ic / 2, y + h / 2, ic, o.iconColor ?? o.color ?? P.accentDark, { width: 2.2 });
    ctx.fillStyle = o.color ?? P.accentDark; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX + (ic ? ic + size * 0.4 : 0), y + h / 2 + size * 0.04);
    return w;
  },
  /** tag(ctx, x, y, text, opts) -> width: small caps chip (neutral by default). */
  tag(ctx, x, y, text, o = {}) {
    return ui.pill(ctx, x, y, String(text).toUpperCase(), { size: 9.5, h: 20, padX: 8, weight: 700, fill: o.fill ?? P.surface2, color: o.color ?? P.ink2, border: o.border ?? P.line, ...o });
  },
  /** button(ctx, x, y, w, h, label, { primary = true, pressed = 0, icon }) */
  button(ctx, x, y, w, h, label, o = {}) {
    const pr = o.pressed ?? 0, prim = o.primary ?? true;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(1 - 0.06 * pr, 1 - 0.06 * pr); ctx.translate(-w / 2, -h / 2);
    rr(ctx, 0, 0, w, h, o.radius ?? h / 2);
    ctx.fillStyle = prim ? (pr > 0.5 ? P.accentDark : P.accent) : P.surface; ctx.fill();
    if (!prim) { ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke(); }
    if (o.icon && !label) ui.icon(ctx, o.icon, w / 2, h / 2, h * 0.5, prim ? "#fff" : P.ink2, { width: 2.4 });
    else {
      ctx.font = font(600, h * 0.38); ctx.fillStyle = prim ? "#fff" : P.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, w / 2, h / 2 + 1);
    }
    ctx.restore();
  },
  /** toggle(ctx, x, y, u, { w = 34 }) — switch, u = 0 off .. 1 on (animate u from t). */
  toggle(ctx, x, y, u, o = {}) {
    const w = o.w ?? 34, h = w * 0.58;
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = u > 0.5 ? P.accent : P.line; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + h / 2 + (w - h) * clamp(u), y + h / 2, h / 2 - 2.5, 0, 7); ctx.fill();
  },
  /** progress(ctx, x, y, w, u, { h = 6, track, fill }) */
  progress(ctx, x, y, w, u, o = {}) {
    const h = o.h ?? 6;
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = o.track ?? P.lineSoft; ctx.fill();
    if (u > 0.001) { rr(ctx, x, y, Math.max(h, w * clamp(u)), h, h / 2); ctx.fillStyle = o.fill ?? P.accent; ctx.fill(); }
  },
  /** dots(ctx, x, y, t, { r = 3.2, color }) — "typing…" indicator, three dots bouncing (t = seconds). */
  dots(ctx, x, y, t, o = {}) {
    const r = o.r ?? 3.2;
    for (let i = 0; i < 3; i++) {
      const ph = Math.max(0, Math.sin((t * 1.6 - i * 0.18) * Math.PI * 2));
      ctx.fillStyle = o.color ?? P.muted; ctx.globalAlpha = 0.45 + 0.55 * ph;
      ctx.beginPath(); ctx.arc(x + i * r * 3, y - ph * r * 0.9, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  /** chrome(ctx, W, H, { title, icon, right, bar = 46 }) -> content top (dp). Window top bar: three neutral dots, centred title, hairline. */
  chrome(ctx, W, H, o = {}) {
    const bar = o.bar ?? 46;
    [0, 1, 2].forEach((i) => { ctx.fillStyle = ["#e9e9ee", "#e9e9ee", "#e9e9ee"][i]; ctx.beginPath(); ctx.arc(22 + i * 17, bar / 2, 5.2, 0, 7); ctx.fill(); });
    if (o.title) {
      ctx.font = font(650, 14);
      const tw = ctx.measureText(o.title).width, ic = o.icon ? 20 : 0;
      if (o.icon) ui.icon(ctx, o.icon, W / 2 - tw / 2 - 6, bar / 2, 14, P.accent);
      ui.text(ctx, o.title, W / 2 - tw / 2 + ic / 2 + 2, bar / 2 - 9, { size: 14, weight: 650, color: P.ink });
    }
    if (o.right === "avatar") ui.avatar(ctx, W - 28, bar / 2, 12, { initials: "JL", fill: "#ffe7d6", color: "#b54708" });
    else if (o.right) ui.tag(ctx, W - 20 - 70, bar / 2 - 10, o.right);
    ctx.fillStyle = P.line; ctx.fillRect(0, bar, W, 1);
    return bar + 1;
  },
  /** bubble(ctx, x, y, maxW, text, { side = "user"|"bot", size = 18, count, caret, grow (height follows the typed lines) }) -> { w, h } — chat bubble; user = accent, bot = surface2. x/y = top-right (user) or top-left (bot). */
  bubble(ctx, x, y, maxW, text, o = {}) {
    const user = (o.side ?? "user") === "user", size = o.size ?? 18, pad = [size * 0.85, size * 0.62];
    ctx.font = font(500, size);
    const lines = wrap(ctx, text, maxW - pad[0] * 2);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    let nl = lines.length;
    if (o.grow && o.count != null) { let left = o.count; nl = 0; for (const ln of lines) { if (left <= 0) break; nl++; left -= ln.length + 1; } nl = Math.max(1, nl); }
    const w = tw + pad[0] * 2, h = nl * size * 1.38 + pad[1] * 2 - size * 0.12;
    const bx = user ? x - w : x, r = size * 0.95;
    ctx.beginPath();
    ctx.roundRect(bx, y, w, h, user ? [r, r, size * 0.3, r] : [r, r, r, size * 0.3]);
    ctx.fillStyle = user ? P.accent : P.surface2; ctx.fill();
    const tr = ui.text(ctx, text, bx + pad[0], y + pad[1] - size * 0.08, { size, weight: 500, color: user ? "#ffffff" : P.ink, maxW: maxW - pad[0] * 2 + 0.5, count: o.count ?? Infinity });
    if (o.caret) ui.caret(ctx, tr.caret[0], tr.caret[1], size * 1.05, user ? "#fff" : P.accent);
    return { w, h, x: bx };
  },
  /** searchBar(ctx, x, y, w, h, { query, count, caret, placeholder, kbd = true, focus = 0 }) */
  searchBar(ctx, x, y, w, h, o = {}) {
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = P.surface; ctx.fill();
    ctx.lineWidth = 1 + (o.focus ?? 0) * 1.2; ctx.strokeStyle = (o.focus ?? 0) > 0.5 ? P.accentMid : P.line; ctx.stroke();
    ui.icon(ctx, "search", x + h * 0.55, y + h / 2, h * 0.42, P.accent, { width: 2.4 });
    const size = h * 0.36, tx = x + h * 0.98, ty = y + h / 2 - size * 0.62;
    if (o.query && (o.count ?? 1) > 0) {
      const r = ui.text(ctx, o.query, tx, ty, { size, weight: 550, color: P.ink, count: o.count ?? Infinity });
      if (o.caret) ui.caret(ctx, r.caret[0] + 1, y + h * 0.27, h * 0.46);
    } else ui.text(ctx, o.placeholder ?? "Search", tx, ty, { size, weight: 450, color: P.muted });
    if (o.kbd !== false) ui.tag(ctx, x + w - h * 0.5 - 34, y + h / 2 - 10, "⌘K");
  },
  /** listRow(ctx, x, y, w, { icon, title, sub, meta, selected, h = 52, iconFill }) -> h */
  listRow(ctx, x, y, w, o = {}) {
    const h = o.h ?? 52;
    if (o.selected) { rr(ctx, x - 8, y, w + 16, h, 12); ctx.fillStyle = P.accentSoft; ctx.fill(); }
    rr(ctx, x, y + h / 2 - 16, 32, 32, 9); ctx.fillStyle = o.iconFill ?? (o.selected ? "#fff" : P.surface2); ctx.fill();
    ui.icon(ctx, o.icon ?? "doc", x + 16, y + h / 2, 17, o.selected ? P.accent : P.ink2);
    ui.text(ctx, o.title ?? "", x + 44, y + h / 2 - (o.sub ? 17 : 9), { size: 14, weight: 600, color: P.ink });
    if (o.sub) ui.text(ctx, o.sub, x + 44, y + h / 2 + 1, { size: 11.5, weight: 450, color: P.muted });
    if (o.meta) { ctx.font = font(500, 11.5); ctx.fillStyle = P.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(o.meta, x + w, y + h / 2); }
    return h;
  },
  /** code(ctx, x, y, w, { lines: [[[text, tone], ...], ...], size = 12.5, lineNumbers = true }) -> height. tone: kw str fn com num plain. */
  code(ctx, x, y, w, o = {}) {
    const size = o.size ?? 12.5, lh = size * 1.6, lines = o.lines ?? [], pad = 12;
    const h = lines.length * lh + pad * 2;
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = o.fill ?? "#f7f7fc"; ctx.fill(); ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke();
    const tone = { kw: P.accent, str: "#0e9384", fn: "#c4320a", com: P.muted, num: "#b54708", plain: P.ink };
    ctx.font = font(500, size, "mono"); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    lines.forEach((ln, i) => {
      const by = y + pad + (i + 0.78) * lh;
      let cx = x + pad;
      if (o.lineNumbers !== false) { ctx.fillStyle = "#c5cad5"; ctx.fillText(String(i + 1), cx, by); cx += size * 1.9; }
      for (const [txt, tn] of ln) { ctx.fillStyle = tone[tn] ?? tone.plain; ctx.fillText(txt, cx, by); cx += ctx.measureText(txt).width; }
    });
    return h;
  },
  /** chart(ctx, x, y, w, h, { values, kind = "bars"|"line", u = 1, highlight }) — mini chart; u grows it in. */
  chart(ctx, x, y, w, h, o = {}) {
    const v = o.values ?? [0.3, 0.5, 0.4, 0.7, 0.6, 0.9], n = v.length, u = o.u ?? 1;
    ctx.fillStyle = P.lineSoft;
    for (let k = 0; k <= 3; k++) ctx.fillRect(x, y + (h * k) / 3, w, 1);
    if ((o.kind ?? "bars") === "bars") {
      const bw = (w / n) * 0.56;
      v.forEach((a, i) => {
        const bh = h * a * toEase("outCubic")(clamp(u * 1.4 - i * 0.08));
        rr(ctx, x + (w / n) * (i + 0.22), y + h - bh, bw, bh, Math.min(5, bw / 2));
        ctx.fillStyle = i === (o.highlight ?? n - 1) ? P.accent : P.accentMid; ctx.fill();
      });
    } else {
      ctx.beginPath();
      v.forEach((a, i) => { const px = x + (w * i) / (n - 1), py = y + h - h * a; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - 8, w * clamp(u) + 8, h + 16); ctx.clip();
      ctx.beginPath(); v.forEach((a, i) => { const px = x + (w * i) / (n - 1), py = y + h - h * a; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6; ctx.lineJoin = "round"; ctx.stroke();
      ctx.restore();
    }
  },
  /**
   * docPage(ctx, W, H, { title, meta, seed, icon = "doc", paragraphs = [3, 4, 2, 3], highlight: { para, u, text } })
   *   A document page: header with icon + title + meta, then greeked paragraphs (a heading bar + lines).
   *   highlight.para = paragraph index to mark; u 0..1 sweeps an accent highlight across it; with `text`, that
   *   paragraph is real (legible) text instead of greeked bars.
   */
  docPage(ctx, W, H, o = {}) {
    const pad = 18, R = rng(o.seed ?? 1);
    rr(ctx, pad, pad, 30, 30, 8); ctx.fillStyle = o.iconFill ?? P.accentSoft; ctx.fill();
    ui.icon(ctx, o.icon ?? "doc", pad + 15, pad + 15, 18, P.accent);
    const tt = ui.text(ctx, o.title ?? "Document", pad + 40, pad - 1, { size: 14.5, weight: 700, color: P.ink, maxW: W - pad * 2 - 40, lineH: 1.18 });
    const my = pad - 1 + tt.h + 1;
    if (o.meta) ui.text(ctx, o.meta, pad + 40, my, { size: 10.5, weight: 500, color: P.muted });
    const div = Math.max(pad + 44, my + 22);
    ctx.fillStyle = P.line; ctx.fillRect(pad, div, W - pad * 2, 1);
    let y = div + 14;
    const paras = o.paragraphs ?? [3, 4, 2, 3];
    paras.forEach((n, i) => {
      if (y > H - pad - 10) return;
      const hl = o.highlight && o.highlight.para === i ? o.highlight : null;
      if (i > 0) { ctx.fillStyle = "#d5d9e2"; rr(ctx, pad, y, (W - pad * 2) * R.range(0.32, 0.5), 8, 4); ctx.fill(); y += 16; }
      if (hl && hl.text) {
        const size = hl.size ?? 12;
        ctx.font = font(560, size);
        const lines = wrap(ctx, hl.text, W - pad * 2 - 12);
        const bh = lines.length * size * 1.36 + 10;
        const u = clamp(hl.u ?? 1);
        if (u > 0) { rr(ctx, pad - 5, y - 4, (W - pad * 2 + 10) * toEase("outCubic")(u), bh, 6); ctx.fillStyle = P.accentSoft; ctx.fill(); ctx.fillStyle = P.accent; rr(ctx, pad - 5, y - 4, 3, bh, 1.5); ctx.fill(); }
        ui.text(ctx, hl.text, pad + 3, y + 1, { size, weight: 560, color: u > 0.3 ? P.accentDark : P.ink2, maxW: W - pad * 2 - 12, lineH: 1.36 });
        y += bh + 10;
      } else {
        if (hl) { const u = clamp(hl.u ?? 1); rr(ctx, pad - 5, y - 4, (W - pad * 2 + 10) * u, n * 15.5 + 3, 6); ctx.fillStyle = P.accentSoft; ctx.fill(); }
        y += ui.greek(ctx, pad, y, W - pad * 2, { lines: n, seed: (o.seed ?? 1) * 31 + i, color: hl ? P.accentMid : P.line }) + 14;
      }
    });
  },
};

// =========================================================================== canvas faces ==================
/** faceCanvas(wM, hM, { pxPerDp }) -> { canvas, ctx, W, H, s } — a canvas for a w x h metre face, ctx pre-scaled to dp. */
export function faceCanvas(wM, hM, o = {}) {
  const dpm = S.ui.dpPerMetre, W = wM * dpm, H = hM * dpm;
  const s = Math.min(o.pxPerDp ?? S.ui.pxPerDp, S.ui.maxPx / Math.max(W, H));
  const canvas = makeCanvas(Math.round(W * s), Math.round(H * s));
  const ctx = canvas.getContext("2d");
  return { canvas, ctx, W, H, s };
}
/** paintFaceBase(ctx, W, H, { fill, border, sheen, radius }) — card face background: fill, 1 dp border, top-edge inner highlight. */
export function paintFaceBase(ctx, W, H, o = {}) {
  const r = o.radius ?? S.ui.radius;
  ctx.fillStyle = o.fill ?? P.surface;
  ctx.fillRect(0, 0, W, H);
  if (o.wash) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, o.wash[0]); g.addColorStop(1, o.wash[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const sh = o.sheen ?? S.ui.sheen;
  if (sh > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, 26);
    g.addColorStop(0, `rgba(255,255,255,${sh})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; rr(ctx, 1.5, 1.5, W - 3, 26, [r - 1.5, r - 1.5, 0, 0]); ctx.fill();
  }
  rr(ctx, 0.75, 0.75, W - 1.5, H - 1.5, r - 0.75);
  ctx.lineWidth = 1.5; ctx.strokeStyle = o.border ?? S.ui.border; ctx.stroke();
}

// =========================================================================== shadows =======================
const MAXC = S.shadow.maxCasters;
const SHADOW_GLSL = /* glsl */ `
uniform int uSCount;
uniform vec4 uSA[${MAXC}];  // centre.xy, axis-u (unit).xy   (receiver-local metres)
uniform vec4 uSB[${MAXC}];  // half-size.xy, corner radius, blur
uniform float uSO[${MAXC}]; // opacity
float fsRR(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float fsShadow(vec2 p) {
  float keep = 1.0;
  for (int i = 0; i < ${MAXC}; i++) {
    if (i >= uSCount) break;
    vec2 d = p - uSA[i].xy, u = uSA[i].zw;
    vec2 l = vec2(dot(d, u), dot(d, vec2(-u.y, u.x)));
    float sd = fsRR(l, uSB[i].xy, uSB[i].z);
    float a = 1.0 - smoothstep(-uSB[i].w, uSB[i].w, sd);
    keep *= 1.0 - a * a * (3.0 - 2.0 * a) * uSO[i];
  }
  return 1.0 - keep;
}`;
const shadowUniforms = () => ({
  uSCount: { value: 0 },
  uSA: { value: Array.from({ length: MAXC }, () => new THREE.Vector4()) },
  uSB: { value: Array.from({ length: MAXC }, () => new THREE.Vector4()) },
  uSO: { value: new Array(MAXC).fill(0) },
});

/** catcherMesh(w, h, r, z) -> transparent plane that draws the shadows falling on a card face (clipped to its rounded rect). */
function catcherMesh(w, h, r, z) {
  const uniforms = { ...shadowUniforms(), uHalf: { value: new THREE.Vector2(w / 2, h / 2) }, uRad: { value: r }, uColor: { value: col(S.shadow.color) }, uMul: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: "varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `${SHADOW_GLSL}
      uniform vec2 uHalf; uniform float uRad, uMul; uniform vec3 uColor; varying vec2 vL;
      void main(){ float sd = fsRR(vL, uHalf, uRad); float aa = fwidth(sd); float m = 1.0 - smoothstep(-aa, aa, sd);
        float a = fsShadow(vL) * m * uMul; if (a < 0.002) discard; gl_FragColor = vec4(uColor, a); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.z = z;
  m.renderOrder = 1;
  m.name = "shadowCatcher";
  return m;
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
const L = new THREE.Vector3(...S.shadow.dir).normalize();
/**
 * shadowSystem() -> { casters, receivers, add(card), addReceiver(obj, { w, h, z, uniforms }), update() }
 *   Fake key-light shadows. A caster = { node, w, h, r, strength, presence() }; a receiver = { node, z (face
 *   offset), uniforms, w, h, presence() }. update(): for each receiver, project every caster in front of it along
 *   spec.shadow.dir onto the receiver plane, keep the nearest MAXC, write centre/axes/half-size/blur/opacity.
 */
export function shadowSystem() {
  const SH = S.shadow, casters = [], receivers = [];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const sys = {
    casters, receivers,
    addCaster(c) { casters.push(c); return c; },
    addReceiver(r) { receivers.push(r); return r; },
    update() {
      for (const R of receivers) {
        const U = R.uniforms;
        const rp = R.presence ? R.presence() : 1;
        if (!R.node.visible || rp <= 0.001) { U.uSCount.value = 0; continue; }
        R.node.updateWorldMatrix(true, false);
        _inv.copy(R.node.matrixWorld).invert();
        _o.set(0, 0, R.z ?? 0).applyMatrix4(R.node.matrixWorld);
        _n.set(0, 0, 1).transformDirection(R.node.matrixWorld);
        const dn = L.dot(_n);
        const list = [];
        if (dn < -0.15) for (const C of casters) {
          if (C.node === R.node || C.skip?.(R) || !C.node.visible) continue;
          let vis = true; for (let p = C.node; p; p = p.parent) if (!p.visible) { vis = false; break; }
          if (!vis) continue;
          const cp = (C.presence ? C.presence() : 1) * (C.strength ?? 1);
          if (cp <= 0.002) continue;
          C.node.updateWorldMatrix(true, false);
          _c.set(0, 0, 0).applyMatrix4(C.node.matrixWorld);
          const gap = _v.copy(_c).sub(_o).dot(_n);
          if (gap < 0.012 || gap > SH.maxGap) continue;
          const pts = corners.map(([a, b]) => {
            const P0 = new THREE.Vector3((a * C.w) / 2, (b * C.h) / 2, 0).applyMatrix4(C.node.matrixWorld);
            const s = _v.copy(_o).sub(P0).dot(_n) / dn;
            return P0.addScaledVector(L, s).applyMatrix4(_inv);
          });
          const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
          const ux = (pts[1].x + pts[2].x - pts[0].x - pts[3].x) / 4, uy = (pts[1].y + pts[2].y - pts[0].y - pts[3].y) / 4;
          const vx = (pts[2].x + pts[3].x - pts[0].x - pts[1].x) / 4, vy = (pts[2].y + pts[3].y - pts[0].y - pts[1].y) / 4;
          const hx = Math.hypot(ux, uy), hy = Math.hypot(vx, vy);
          if (hx < 1e-4 || hy < 1e-4) continue;
          const blur = SH.blur0 + SH.blurPerM * gap, grow = SH.spreadPerM * gap;
          // reject footprints entirely outside the receiver (+ blur)
          if (R.w && (Math.abs(cx) - hx - hy - blur > R.w / 2 || Math.abs(cy) - hx - hy - blur > R.h / 2)) continue;
          const op = (SH.opacity * cp) / (1 + SH.fade * gap);
          list.push({ gap, a: [cx, cy, ux / hx, uy / hx], b: [hx + grow, hy + grow, Math.min(C.r ?? 0.1, hx, hy) + grow, blur], o: op });
        }
        list.sort((p, q) => p.gap - q.gap);
        const n = Math.min(MAXC, list.length);
        for (let i = 0; i < n; i++) { U.uSA.value[i].set(...list[i].a); U.uSB.value[i].set(...list[i].b); U.uSO.value[i] = list[i].o; }
        U.uSCount.value = n;
        if (U.uMul) U.uMul.value = rp;
      }
    },
  };
  return sys;
}

// =========================================================================== backdrop ======================
/**
 * backdrop({ z, size, blobs, base, strength, grain }) -> Mesh: big plane at z facing +Z, a mesh-gradient of soft
 *   colour blobs that drift slowly (pure f(t)), linear-space dither, and the shadow receiver for everything in
 *   front of it. userData.update(t). Defaults: spec.backdrop.
 */
export function backdrop(o = {}) {
  const B = { ...S.backdrop, ...o };
  const n = B.blobs.length;
  const uniforms = {
    ...shadowUniforms(),
    uTime: { value: 0 }, uBase: { value: col(B.base) }, uStrength: { value: B.strength }, uGrain: { value: B.grain },
    uShadowColor: { value: col(S.shadow.color) },
    uBC: { value: B.blobs.map((b) => col(b.color)) },
    uBP: { value: B.blobs.map((b) => new THREE.Vector4(b.pos[0], b.pos[1], b.r, b.speed)) },
    uBA: { value: B.blobs.map((b, i) => new THREE.Vector4(b.amp[0], b.amp[1], i * 1.7 + 0.3, i * 2.3 + 1.1)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: "varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `${SHADOW_GLSL}
      uniform float uTime, uStrength, uGrain; uniform vec3 uBase, uShadowColor; uniform vec3 uBC[${n}]; uniform vec4 uBP[${n}], uBA[${n}];
      varying vec2 vL;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        vec3 c = uBase;
        for (int i = 0; i < ${n}; i++) {
          vec2 ctr = uBP[i].xy + uBA[i].xy * vec2(sin(uTime * uBP[i].w * 6.2832 + uBA[i].z), cos(uTime * uBP[i].w * 5.1 + uBA[i].w));
          float d = length(vL - ctr) / uBP[i].z;
          float w = exp(-d * d * 1.6) * uStrength;
          c = mix(c, uBC[i], w);
        }
        float sh = fsShadow(vL);
        c = mix(c, uShadowColor, sh);
        c += (h21(gl_FragCoord.xy + floor(uTime * 30.0) * 7.0) - 0.5) * uGrain;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(B.size[0], B.size[1]), mat);
  m.position.z = B.z;
  m.name = "backdrop";
  m.userData.uniforms = uniforms;
  m.userData.update = (t) => { uniforms.uTime.value = t; };
  return m;
}

// =========================================================================== card ==========================
let _edgeMat = null, _backMat = null;
/** hazeMaterial(params) -> MeshBasicMaterial with uHaze (0..1 mix toward the backdrop haze colour) and uShade. */
function faceMaterial(map) {
  const m = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
  const U = { uHaze: { value: 0 }, uHazeColor: { value: col(S.backdrop.base) } };
  m.userData.face = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uHaze; uniform vec3 uHazeColor;")
      .replace("#include <opaque_fragment>", "outgoingLight = mix(outgoingLight, uHazeColor, uHaze);\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => "floating-screens-face-1";
  return m;
}

/**
 * card({ w, h, depth, radius, draw(ctx, W, H, state, ui), back(ctx, W, H, state, ui) | null, base = true,
 *        baseOpts, backBase, state, pxPerDp, cast = true, receive = true, shadowStrength = 1, name }) -> Group
 *   A floating UI card: rounded slab (front = canvas UI face, back = optional canvas, edge = lit material),
 *   sized in metres; faces are designed in dp (W x H = metres x spec.ui.dpPerMetre).
 *   Hierarchy: group (pose) -> flip (rotation.y for flips) -> slab + shadow catcher + focus ring.
 *   userData:
 *     setState(state)     redraws the face only when JSON(state) changes (memo keyed by inputs = deterministic)
 *     setPose(pose)       choreo pose { p, r, s, o } (o = presence: fades materials, scales 0.9..1)
 *     setFlip(angle)      rotation about the card's Y axis (back face shows past PI/2)
 *     setRing(u, { color })  accent focus ring (0..1)
 *     setHaze(k)          0..1 mix toward the backdrop colour (receding cards)
 *     setShade(k)         face brightness multiplier (key-light shading; style.render sets it from the normal)
 *     w, h, W, H, flip, slab, presence
 */
export function card(o = {}) {
  const w = o.w ?? 3, h = o.h ?? 2, d = o.depth ?? S.card.thickness, r = o.radius ?? S.card.radius;
  const C = S.card;
  const fc = faceCanvas(w, h, o);
  const tex = canvasTexture(fc.canvas, { srgb: true, anisotropy: S.ui.anisotropy });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const front = faceMaterial(tex);
  let backFc = null, backMat;
  if (o.back) {
    backFc = faceCanvas(w, h, o);
    const bt = canvasTexture(backFc.canvas, { srgb: true, anisotropy: S.ui.anisotropy });
    bt.wrapS = bt.wrapT = THREE.ClampToEdgeWrapping;
    backMat = faceMaterial(bt);
  } else backMat = (_backMat ??= new THREE.MeshStandardMaterial({ color: S.materials.cardBack.baseColor, roughness: 0.6 })).clone();
  const edge = (o.edgeMaterial ?? (_edgeMat ??= new THREE.MeshStandardMaterial({ color: S.materials.cardEdge.baseColor, roughness: S.materials.cardEdge.roughness }))).clone();
  const slab = cardMesh(shapes.roundRect(w, h, r, { y: -h / 2 }), { thickness: d, front, back: backMat, edge, curveSegments: C.curveSegments, normalizedUV: true });
  slab.castShadow = slab.receiveShadow = false;
  slab.name = `${o.name ?? "card"}:slab`;
  const flip = new THREE.Group();
  flip.add(slab);
  const group = new THREE.Group();
  group.name = o.name ?? "card";
  group.add(flip);
  const mats = [front, backMat, edge];

  // focus ring: rounded-rect band just outside the card + soft glow, in the face plane
  const OL = C.outline;
  const ringShape = shapes.roundRect(w + 2 * (OL.gap + OL.width), h + 2 * (OL.gap + OL.width), r + OL.gap + OL.width, { y: -(h / 2 + OL.gap + OL.width) });
  ringShape.holes.push(new THREE.Path(shapes.roundRect(w + 2 * OL.gap, h + 2 * OL.gap, r + OL.gap, { y: -(h / 2 + OL.gap) }).getPoints(C.curveSegments * 2).reverse()));
  const ring = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, C.curveSegments * 2), new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0, depthWrite: false }));
  ring.position.z = d / 2 - 0.004;
  ring.renderOrder = 2;
  ring.visible = false;
  flip.add(ring);

  const catcher = o.receive === false ? null : catcherMesh(w, h, r, d / 2 + 0.0015);
  if (catcher) flip.add(catcher);

  let key = null, backKey = null, presence = 1;
  const draw = (state) => {
    const k = JSON.stringify(state ?? null);
    if (k !== key) {
      key = k;
      const { ctx, W, H, s } = fc;
      ctx.reset?.(); // full state reset: a redraw must not depend on the previous draw (seek-order determinism)
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (o.base !== false) paintFaceBase(ctx, W, H, o.baseOpts);
      o.draw?.(ctx, W, H, state ?? {}, ui);
      tex.needsUpdate = true;
    }
    if (backFc) {
      const kb = JSON.stringify(o.backState?.(state) ?? null);
      if (kb !== backKey) {
        backKey = kb;
        const { ctx, W, H, s } = backFc;
        ctx.reset?.(); // full state reset: a redraw must not depend on the previous draw (seek-order determinism)
      ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, W, H);
        paintFaceBase(ctx, W, H, o.backBase ?? { fill: P.accent, border: P.accentDark, sheen: 0.25 });
        o.back(ctx, W, H, state ?? {}, ui);
        backMat.map.needsUpdate = true;
      }
    }
  };
  draw(o.state ?? {});

  group.userData = {
    w, h, W: fc.W, H: fc.H, flip, slab, ring, catcher, materials: mats, isCard: true,
    get presence() { return presence; },
    setState: draw,
    setPose(pz) {
      applyPose(group, pz);
      presence = clamp(pz.o ?? 1);
      group.visible = presence > 0.003;
      const tr = presence < 0.999;
      // OPAQUE is baked into the program: a transparent flip must bump the material version, or the shader
      // compiled for whichever state was seen first sticks (seek-order dependent frames)
      for (const m of mats) { if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = presence; }
      return group;
    },
    setFlip(a) { flip.rotation.y = a; },
    setRing(u, { color } = {}) {
      ring.visible = u > 0.002;
      ring.material.opacity = clamp(u) * presence;
      if (color) ring.material.color.set(color);
      const s = 1 + 0.03 * (1 - clamp(u));
      ring.scale.set(s, s, 1);
    },
    setHaze(k) { for (const m of [front, backMat]) if (m.userData.face) m.userData.face.uHaze.value = clamp(k); },
    setShade(k) { front.color.setScalar(k); if (backMat.userData.face) backMat.color.setScalar(k); },
  };
  group.userData.caster = { node: flip, w, h, r, strength: o.shadowStrength ?? 1, presence: () => presence };
  group.userData.receiver = catcher ? { node: flip, z: d / 2, uniforms: catcher.material.uniforms, w, h, presence: () => presence } : null;
  if (o.cast === false) group.userData.caster = null;
  return group;
}

/** applyPose(obj, pose) — position, rotation (XYZ), uniform scale. Presence handled by the caller / card.setPose. */
export function applyPose(obj, pz) {
  obj.position.set(...pz.p);
  obj.rotation.set(pz.r[0], pz.r[1], pz.r[2]);
  const k = pz.s * lerp(0.9, 1, clamp(pz.o ?? 1));
  obj.scale.setScalar(Math.max(1e-4, k));
}

// =========================================================================== frosted panel =================
/**
 * frosted({ w, h, radius, color, alphaTop, alphaBottom, rim, rimWidth, tint }) -> Group: milky translucent glass
 *   (no real blur: a vertical alpha gradient, a faint diagonal sheen, a bright inner rim and a Fresnel edge lift).
 *   Same userData as card for posing (setPose) + shadow receiver/caster (strength .35).
 */
export function frosted(o = {}) {
  const F = { ...S.frosted, ...o };
  const w = o.w ?? 4, h = o.h ?? 3, r = o.radius ?? S.card.radius * 1.3;
  const U = {
    uHalf: { value: new THREE.Vector2(w / 2, h / 2) }, uRad: { value: r }, uColor: { value: col(F.color) }, uTint: { value: col(F.tint) },
    uA: { value: new THREE.Vector2(F.alphaBottom, F.alphaTop) }, uRim: { value: new THREE.Vector2(F.rim, F.rimWidth) }, uPresence: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: "varying vec2 vL; varying vec3 vN, vV; void main(){ vL = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * vec3(0.0, 0.0, 1.0); gl_Position = projectionMatrix * mv; }",
    fragmentShader: `uniform vec2 uHalf, uA, uRim; uniform float uRad, uPresence; uniform vec3 uColor, uTint; varying vec2 vL; varying vec3 vN, vV;
      float rr(vec2 p, vec2 h, float r){ vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        float sd = rr(vL, uHalf, uRad); float aa = fwidth(sd); float m = 1.0 - smoothstep(-aa, aa, sd);
        float v = vL.y / (2.0 * uHalf.y) + 0.5, u = vL.x / (2.0 * uHalf.x) + 0.5;
        float a = mix(uA.x, uA.y, v);
        float sheen = smoothstep(0.0, 0.25, 0.5 - abs(u * 0.7 + v * 0.6 - 0.75)) * 0.08;
        float rim = (1.0 - smoothstep(0.0, uRim.y, -sd)) * uRim.x * (0.45 + 0.55 * v);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0) * 0.35;
        vec3 c = mix(uTint, uColor, v);
        float alpha = clamp(a + sheen + fres, 0.0, 1.0);
        c = mix(c, vec3(1.0), rim);
        alpha = max(alpha, rim * 0.9);
        gl_FragColor = vec4(c, alpha * m * uPresence);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 0;
  const flip = new THREE.Group();
  flip.add(mesh);
  const catcher = catcherMesh(w, h, r, 0.002);
  flip.add(catcher);
  const group = new THREE.Group();
  group.name = o.name ?? "frosted";
  group.add(flip);
  let presence = 1;
  group.userData = {
    w, h, flip, isCard: true,
    get presence() { return presence; },
    setPose(pz) { applyPose(group, pz); presence = clamp(pz.o ?? 1); U.uPresence.value = presence; group.visible = presence > 0.003; return group; },
    setHaze() {}, setShade() {}, setRing() {}, setState() {}, setFlip(a) { flip.rotation.y = a; },
    caster: { node: flip, w, h, r, strength: o.shadowStrength ?? 0.35, presence: () => presence },
    receiver: { node: flip, z: 0, uniforms: catcher.material.uniforms, w, h, presence: () => presence * 0.8 },
  };
  return group;
}

// =========================================================================== small parts ===================
function radialCanvasTex(N, paint) {
  const c = makeCanvas(N), ctx = c.getContext("2d");
  paint(ctx, N);
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
let _dotTex = null;
/** dataDot({ size, color }) -> Mesh billboard: a small glowing data packet (white core, accent ring, soft halo). userData.face(camera). */
export function dataDot(o = {}) {
  const size = o.size ?? S.connector.chipSize;
  const tex = o.color ? null : (_dotTex ??= radialCanvasTex(128, (ctx, N) => {
    const h = N / 2, g = ctx.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, "rgba(91,77,245,0.55)"); g.addColorStop(0.45, "rgba(91,77,245,0.22)"); g.addColorStop(1, "rgba(91,77,245,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, N, N);
    ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(h, h, N * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(h, h, N * 0.085, 0, 7); ctx.fill();
  }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 3, size * 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: o.color ?? 0xffffff }));
  m.renderOrder = 4;
  m.userData.noDepth = true;
  m.userData.face = (cam) => m.quaternion.copy(cam.quaternion);
  return m;
}

/**
 * connector(stage, { width, color, level, dash, arrow, depth = "visible" (cards hide it) | "none", steps = 40, dots = 2 }) -> Group
 *   A thin screen-space line on a soft bezier between two world points (kit screenLines, exact px width),
 *   drawn on with `progress`, an arrowhead billboard at the head, and `dots` glowing data packets travelling it.
 *   userData.update({ a, b, progress = 1, level = 1, dots: [u...], camera, bend, lift }) — call every frame.
 */
export function connector(stage, o = {}) {
  const K = { ...S.connector, ...o };
  const steps = o.steps ?? 40;
  const group = new THREE.Group();
  group.name = o.name ?? "connector";
  const seed = choreo.bezierPath([0, 0, 0], [1, 0, 0], { steps });
  const line = screenLines(stage, [seed], { width: K.width, color: K.color, level: K.level, dash: K.dash ?? null, depth: K.depth ?? "visible", bias: K.bias ?? 0.004, blending: "normal", capacity: steps + 2, renderOrder: 3 });
  line.userData.noDepth = true;
  group.add(line);
  const a = K.arrow;
  const arrowShape = shapes.poly([[0, 0], [-a, a * 0.62], [-a * 0.72, 0], [-a, -a * 0.62]]);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: K.color, transparent: true, depthTest: false, depthWrite: false }));
  arrow.renderOrder = 3;
  arrow.userData.noDepth = true;
  group.add(arrow);
  const dots = Array.from({ length: o.dots ?? 2 }, () => { const d = dataDot({ size: K.chipSize }); d.material.depthTest = false; group.add(d); return d; });
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  group.userData = {
    line, arrow, dots,
    path: seed,
    update({ a: A, b: B, progress = 1, level = 1, dots: du = [], camera, bend = 0.35, lift = [0, 0.5, 0.9], arrowOn = true }) {
      const pts = choreo.bezierPath(A, B, { steps, bend, lift });
      group.userData.path = pts;
      line.userData.setPolys([pts]);
      line.userData.setProgress(progress);
      line.userData.setLevel(level);
      group.visible = level > 0.002 && progress > 0.001;
      const head = choreo.along(pts, progress);
      const prev = choreo.along(pts, Math.max(0, progress - 0.03));
      arrow.visible = arrowOn && progress > 0.02;
      arrow.position.set(...head.p);
      arrow.material.opacity = level;
      if (camera) {
        camera.updateMatrixWorld(); // the stage camera is not in the scene graph: refresh matrixWorldInverse before project()
        arrow.quaternion.copy(camera.quaternion);
        v0.set(...prev.p).project(camera); v1.set(...head.p).project(camera);
        arrow.rotateZ(Math.atan2((v1.y - v0.y), (v1.x - v0.x) * (stage.width / stage.height)));
      }
      dots.forEach((dm, i) => {
        const u = du[i];
        dm.visible = u != null && u > 0 && u < 1 && level > 0.01;
        if (!dm.visible) return;
        dm.position.set(...choreo.along(pts, u).p);
        dm.material.opacity = level * Math.min(1, u * 8, (1 - u) * 8);
        if (camera) dm.userData.face(camera);
      });
    },
  };
  return group;
}

/**
 * cursor({ size, fill, stroke, ripple }) -> Group: a pointer (tip at the origin, in the XY plane) drawn to a canvas,
 *   with a ripple ring for clicks. userData.set({ pos:[x,y,z], click = 0 (0..1 click progress), presence = 1 }).
 */
export function cursor(o = {}) {
  const K = { ...S.cursor, ...o };
  const N = 256, c = makeCanvas(N), ctx = c.getContext("2d");
  const pts = [[0, 0], [0, 17], [4.2, 13.2], [7.2, 19.6], [10, 18.4], [7.1, 12.2], [12.6, 12.2]];
  ctx.scale(N / 24, N / 24);
  ctx.translate(4, 2);
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = K.stroke; ctx.stroke();
  ctx.fillStyle = K.fill; ctx.fill();
  const tex = canvasTexture(c, { srgb: true, anisotropy: 8 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const s = K.size;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  // canvas tip at (4,2)/24 from the top-left -> put it on the group origin
  plane.position.set(s / 2 - (4 / 24) * s, -s / 2 + (2 / 24) * s, 0);
  plane.renderOrder = 5;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: K.ripple, transparent: true, depthWrite: false }));
  ring.renderOrder = 4;
  const g = new THREE.Group();
  g.name = "cursor";
  g.add(ring, plane);
  g.userData = {
    plane, ring,
    caster: { node: plane, w: s * 0.45, h: s * 0.7, r: 0.04, strength: 0.7, presence: () => g.userData.presenceV ?? 1 },
    presenceV: 1,
    set({ pos, click = 0, presence = 1 }) {
      g.userData.presenceV = presence;
      g.visible = presence > 0.003;
      g.position.set(...pos);
      const dip = click > 0 && click < 1 ? Math.sin(Math.PI * clamp(click / 0.35)) * 0.16 : 0;
      plane.scale.setScalar(1 - dip);
      plane.material.opacity = presence;
      const rp = clamp((click - 0.1) / 0.9);
      ring.visible = click > 0.1 && click < 1;
      ring.scale.setScalar(0.04 + 0.32 * toEase("outCubic")(rp));
      ring.material.opacity = 0.75 * (1 - rp) * presence;
    },
  };
  return g;
}

/** pulseRings({ r = 1, count = 3, color, width = .025 }) -> Group of thin rings; userData.set(t, start, { period = .9, level }) expands + fades each. */
export function pulseRings(o = {}) {
  const g = new THREE.Group();
  const n = o.count ?? 3, wdt = o.width ?? 0.025;
  const rings = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - wdt, 1, 96), new THREE.MeshBasicMaterial({ color: o.color ?? P.accent, transparent: true, depthWrite: false }));
    m.userData.noDepth = true;
    m.renderOrder = 1;
    g.add(m);
    return m;
  });
  g.userData.set = (t, start, { period = 0.9, level = 1, reach = 0.7 } = {}) => {
    rings.forEach((m, i) => {
      const u = (t - start - i * period * 0.33) / period;
      m.visible = u > 0 && u < 1 && level > 0.001;
      const k = toEase("outCubic")(clamp(u));
      m.scale.setScalar((o.r ?? 1) * (1 + reach * k));
      m.material.opacity = (1 - k) * 0.55 * level;
    });
  };
  return g;
}

// =========================================================================== overlay step label ============
/**
 * stepLabel(stage, text, { number, icon = "check" when no number, x, y, height }) -> Mesh on the overlay
 *   (exact colours, crisp, never blurred). A white pill: accent number badge + tracked caps text.
 *   userData.update(t, { on, off }) — rises + fades in, holds, fades out. Left edge pinned at NDC x.
 */
export function stepLabel(stage, text, o = {}) {
  const K = { ...S.step, ...o };
  const fs = 64, pad = fs * 0.42, badge = fs * 1.18, gap = fs * 0.36;
  const mc = makeCanvas(8), mctx = mc.getContext("2d");
  mctx.font = font(K.weight, fs); mctx.letterSpacing = `${K.tracking * fs}px`;
  const tw = mctx.measureText(text).width;
  const H = Math.round(badge + pad * 2), Wd = Math.round(pad + badge + gap + tw + pad * 1.6), sh = 24;
  const c = makeCanvas(Wd + sh * 2, H + sh * 2), ctx = c.getContext("2d");
  ctx.translate(sh, sh * 0.7);
  ctx.shadowColor = "rgba(29,27,79,0.16)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
  rr(ctx, 0, 0, Wd, H, H / 2); ctx.fillStyle = K.pill; ctx.globalAlpha = K.pillAlpha; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = K.badge; ctx.beginPath(); ctx.arc(pad + badge / 2, H / 2, badge / 2, 0, 7); ctx.fill();
  if (o.number != null) {
    ctx.font = font(750, fs * 0.72); ctx.fillStyle = K.badgeText; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(o.number), pad + badge / 2, H / 2 + fs * 0.03);
  } else ui.icon(ctx, o.icon ?? "check", pad + badge / 2, H / 2, badge * 0.62, K.badgeText, { width: 2.6 });
  ctx.font = font(K.weight, fs); ctx.letterSpacing = `${K.tracking * fs}px`;
  ctx.fillStyle = K.text; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(text, pad + badge + gap, H / 2 + fs * 0.04);
  const tex = canvasTexture(c, { srgb: true, anisotropy: 8 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const aspect = c.width / c.height;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  m.scale.set(aspect, 1, 1);
  m.name = `step:${text}`;
  const ov = getOverlay(stage);
  // pill height on screen = K.height; the canvas includes a shadow margin -> scale the pin height up
  const hPin = K.height * (c.height / H);
  const halfWndc = (aspect * hPin * 2) / 2 / ov.aspect;
  const leftShift = (sh / c.width) * aspect * hPin * 2 / ov.aspect;
  m.userData.update = (t, { on, off = Infinity }) => {
    const a = choreo.window01(t, on, off, { inDur: K.inDur, outDur: K.outDur });
    m.visible = a > 0.002;
    const rise = (1 - toEase("outCubic")(clamp((t - on) / K.inDur))) * K.rise;
    pinToScreen(stage, m, { x: K.x + halfWndc - leftShift, y: K.y - rise, height: hPin });
    m.visible = a > 0.002;
    m.material.opacity = a;
  };
  m.visible = false;
  ov.add(m);
  return m;
}

// =========================================================================== depth of field ================
/** depthOfField(stage, { aperture, maxblur }) — kit BokehPass, with objects flagged userData.noDepth hidden in its depth pre-pass. */
export function depthOfField(stage, o = {}) {
  const dof = kitDepthOfField(stage, { ...S.dof, ...o });
  if (dof.pass) {
    const orig = dof.pass.render.bind(dof.pass);
    dof.pass.render = (...args) => {
      const hidden = [];
      stage.scene.traverseVisible((ob) => { if (ob.userData?.noDepth || ob.isLine || ob.material?.transparent) hidden.push(ob); });
      hidden.forEach((h) => (h.visible = false));
      orig(...args);
      hidden.forEach((h) => (h.visible = true));
    };
  }
  return dof;
}

// =========================================================================== createStyle ===================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, dof = true }
 *   style.render(t, { focus:[x,y,z] }) = shadows.update + face shading + DOF focus + stage.render(t).
 *   Every card / frosted panel made through style.props is registered as shadow caster + receiver.
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  stage.renderer.shadowMap.enabled = false; // all shadows are the fake key-light system
  const textStyle = { font: FONT.ui, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadows = shadowSystem();
  const dof = opts.dof === false || !post ? { pass: null, setFocus() {} } : depthOfField(stage);
  const cards = [];
  const register = (g) => {
    if (g.userData.caster) shadows.addCaster(g.userData.caster);
    if (g.userData.receiver) shadows.addReceiver(g.userData.receiver);
    cards.push(g);
    return g;
  };
  let bd = null;
  const keyDir = new THREE.Vector3(...spec.lights[0].position).normalize();
  const nrm = new THREE.Vector3();

  const props = {
    backdrop(o = {}) {
      bd = backdrop(o);
      shadows.addReceiver({ node: bd, z: 0, uniforms: bd.userData.uniforms });
      return bd;
    },
    card: (o = {}) => register(card(o)),
    frosted: (o = {}) => register(frosted(o)),
    /** chip({ text, w, h, icon, fill, color, border }) -> small pill card (slab) with an icon + label, e.g. a retrieved snippet. */
    chip(o = {}) {
      const w = o.w ?? 1.6, h = o.h ?? 0.34;
      return register(card({
        w, h, depth: o.depth ?? 0.035, radius: h / 2, name: o.name ?? "chip", shadowStrength: 0.8, receive: false,
        edgeMaterial: new THREE.MeshStandardMaterial({ color: spec.materials.chipEdge.baseColor, roughness: 0.4 }),
        baseOpts: { fill: o.fill ?? P.accentSoft, border: o.border ?? P.accentMid, radius: (h / 2) * spec.ui.dpPerMetre, sheen: 0.6 },
        draw(ctx, W, H, st, U) {
          const ic = H * 0.62;
          if (o.icon !== null) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(H / 2, H / 2, ic / 2, 0, 7); ctx.fill(); U.icon(ctx, o.icon ?? "doc", H / 2, H / 2, ic * 0.6, P.accent); }
          U.text(ctx, o.text ?? "", H * (o.icon === null ? 0.5 : 1.0), H / 2 - (o.size ?? H * 0.36) * 0.64, { size: o.size ?? H * 0.36, weight: 620, color: o.color ?? P.accentDark });
        },
        ...o,
      }));
    },
    connector: (o = {}) => connector(stage, o),
    cursor: (o = {}) => { const c = cursor(o); shadows.addCaster(c.userData.caster); return c; },
    dataDot: (o = {}) => dataDot(o),
    pulseRings: (o = {}) => pulseRings(o),
    stepLabel: (text, o = {}) => stepLabel(stage, text, o),
  };

  return {
    spec,
    palette: spec.palette,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    ui,
    choreo,
    plan: choreo,
    motion: choreo,
    shadows,
    dof,
    cards,
    helpers: { applyPose, faceCanvas, paintFaceBase, shadowSystem, card, frosted, backdrop, connector, cursor, dataDot, pulseRings, stepLabel, depthOfField },
    factories: {
      backdrop: (s) => props.backdrop(s.dims ?? {}),
      card: (s) => props.card(s.dims ?? {}),
      frosted: (s) => props.frosted(s.dims ?? {}),
      chip: (s) => props.chip(s.dims ?? {}),
    },
    /** render(t, { focus }) — shadows, key-light face shading, DOF focus, then stage.render(t). */
    render(t, { focus } = {}) {
      stage.scene.updateMatrixWorld(true);
      for (const g of cards) {
        if (!g.visible) continue;
        nrm.set(0, 0, 1).transformDirection(g.userData.flip.matrixWorld);
        const k = clamp(1 + 0.22 * (nrm.dot(keyDir) - 0.62), 0.86, 1);
        g.userData.setShade(k);
      }
      shadows.update();
      if (bd) bd.userData.update(t);
      if (focus) dof.setFocus(stage.camera.position.distanceTo(new THREE.Vector3(...focus)));
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
