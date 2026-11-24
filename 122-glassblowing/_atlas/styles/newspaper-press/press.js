// styles/newspaper-press/press.js — the press planner. Pure: no THREE, no window, no DOM (Node-safe).
// Imported by style.js (picture) AND scene.config.js (SCORE + camera), so every thud, roller hiss, pencil scratch
// and develop shimmer is derived from the same plan the picture reads.
//
//   layoutPage(content, S)        -> { W, H, items, rects }   front-page layout in page metres (origin = centre, y up)
//   photoFn({ kind, seed })        -> (u, v, aspect) => darkness 0..1   procedural greyscale "photographs"
//   circlePath(rect, o) / underlinePath(rect, o) -> [[x, y], ...]      hand-drawn grease-pencil paths (page metres)
//   planEdition(cfg, S)            -> { spin, turn, ink, develop, pencil, drop, moves, events }
//   spinPose / turnAt / inkHead / rollerAt / developAt / strokeAt / pencilPose / dropPose / kickAt   pure f(t)
//   shotFor(rect, o)               -> { pos, target, fov }   top-down camera key that frames a page rect
//   pressVoices(S.sound)           -> voices for kit/schedule.scoreFromEvents
import { clamp, lerp, smoothstep, ease, rng, hash01, TAU } from "../../kit/time.js";
import { noise3 } from "../../kit/noise.js";

// ------------------------------------------------------------------------------------------------ layout
const HEAD = { maxCap: 0.046, minCap: 0.034, leading: 0.98 };

function splitBalanced(text) {
  const w = text.split(/\s+/).filter(Boolean);
  if (w.length < 2) return [text];
  let best = null;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(" "), b = w.slice(i).join(" ");
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best.lines;
}

/**
 * layoutPage(content, S) -> { W, H, items, rects, seed }
 * content = { masthead = "THE DAILY SAMPLE", ears = ["SAMPLE EDITION", "VOL. 0 · NO. 0"], dateline = [l, c, r],
 *   headline, deck, byline = "BY SAMPLE STAFF", photo = { kind, seed }, caption = true,
 *   key = { text, col = 0, span = 2, at = .045 (m below the content top) } | null,
 *   story2 = true, photo2 = { kind, seed } | null, seed }
 * items (all rects [x0, y0, x1, y1] in page metres; text rects are CAP boxes: y0 = baseline, y1 = cap top):
 *   { kind: "text", role, text, rect, em, align, fit: "fill"|"max", italic?, font }
 *   { kind: "rule", a, b, w }   { kind: "box", rect, w }   { kind: "body", rect, seed, em, pitch, italic?, indent? }
 *   { kind: "greekHead", rect, em, lines, seed }   { kind: "photo", rect, photo: { kind, seed }, keyline }
 */
export function layoutPage(content = {}, S) {
  const P = S.page, F = S.fonts, Hd = { ...HEAD, ...(P.headline ?? {}) };
  const W = P.W, H = P.H, m = P.margin, seed = content.seed ?? P.seed;
  const L = -W / 2 + m, R = W / 2 - m, TW = R - L;
  const colW = (TW - (P.cols - 1) * P.gutter) / P.cols;
  const colX = (i) => L + i * (colW + P.gutter);
  const span = (i, n) => [colX(i), colX(i + n - 1) + colW];
  const items = [], rects = {};
  const text = (role, str, rect, em, o = {}) => { const it = { kind: "text", role, text: str, rect, em, align: "center", fit: "max", ...o }; items.push(it); return it; };
  const rule = (x0, x1, y, w = 0.0005) => items.push({ kind: "rule", a: [x0, y], b: [x1, y], w });
  const body = (x0, x1, y1, y0, s, o = {}) => { if (y1 - y0 > P.linePitch * 1.5) items.push({ kind: "body", rect: [x0, y0, x1, y1], seed: s, em: P.bodyEm, pitch: P.linePitch, ...o }); };
  const capOf = (em) => em * F.capRatio;

  // ---- masthead band
  const top = H / 2 - m;
  const earW = 0.088, earH = 0.036;
  const ears = content.ears ?? ["SAMPLE EDITION", "VOL. 0 · NO. 0"];
  [[L, L + earW], [R - earW, R]].forEach(([x0, x1], i) => {
    items.push({ kind: "box", rect: [x0, top - earH, x1, top], w: 0.0005 });
    const em = 0.0058;
    text("ear", ears[i] ?? "", [x0 + 0.004, top - earH / 2 - capOf(em) / 2, x1 - 0.004, top - earH / 2 + capOf(em) / 2], em, { fit: "max", font: "label", weight: 700 });
  });
  const mCap = 0.03, mBase = top - 0.005 - mCap;
  rects.masthead = [L + earW + 0.012, mBase, R - earW - 0.012, mBase + mCap];
  text("masthead", content.masthead ?? "THE DAILY SAMPLE", rects.masthead, mCap / 0.68, { fit: "fill", font: "masthead", weight: F.mastheadWeight });
  let y = mBase - 0.0085;
  rule(L, R, y, 0.0013); rule(L, R, y - 0.0024, 0.0005);
  // dateline strip (never a real date unless supplied)
  const dl = content.dateline ?? ["VOL. 0 · NO. 0", "SAMPLE EDITION", "PRICE: SAMPLE"];
  const dEm = 0.0062, dBase = y - 0.0024 - 0.0035 - capOf(dEm);
  const third = TW / 3;
  dl.forEach((s, i) => text("dateline", s, [L + i * third, dBase, L + (i + 1) * third, dBase + capOf(dEm)], dEm, { align: ["left", "center", "right"][i], font: "label", weight: 700 }));
  rects.dateline = [L, dBase, R, dBase + capOf(dEm)];
  y = dBase - 0.0035;
  rule(L, R, y, 0.0006);

  // ---- headline (1 or 2 lines, set to fill the measure, condensed by the painter if needed)
  const hl = String(content.headline ?? "SAMPLE HEADLINE").toUpperCase();
  let lines = [hl], em = TW / (hl.length * F.capWidth);
  if (capOf(em) < Hd.minCap) {
    lines = splitBalanced(hl);
    em = TW / (Math.max(...lines.map((l) => l.length)) * F.capWidth);
  }
  em = Math.min(em, Hd.maxCap / F.capRatio);
  const hCap = capOf(em);
  let base = y - 0.0075 - hCap;
  const hRects = [];
  lines.forEach((ln, i) => {
    const w = Math.min(TW, ln.length * F.capWidth * em);
    const r = [-w / 2, base, w / 2, base + hCap];
    text("headline", ln, r, em, { fit: "fill", font: "headline", weight: F.headlineWeight, line: i });
    hRects.push(r);
    if (i < lines.length - 1) base -= em * Hd.leading;
  });
  rects.headline = [Math.min(...hRects.map((r) => r[0])), base, Math.max(...hRects.map((r) => r[2])), hRects[0][3]];
  y = base - em * 0.12;
  if (content.deck) {
    const deEm = 0.0135, deBase = y - 0.0095 - capOf(deEm);
    rects.deck = [L + 0.02, deBase, R - 0.02, deBase + capOf(deEm)];
    text("deck", content.deck, rects.deck, deEm, { italic: true, font: "deck", weight: 400 });
    y = deBase - 0.0055;
  }
  rule(L, R, y, 0.0005);
  const yC = y - 0.0045;               // content top
  rects.contentTop = yC;
  const fold = P.foldY;

  // ---- above the fold: lead story (cols 0-1) + photo (cols 2-5)
  const blocks = [];                   // reserved rects that interrupt column rules
  const [px0, px1] = span(2, 4);
  const capH = content.caption === false ? 0 : 0.0095;
  const photoRect = [px0, fold + 0.012 + capH, px1, yC];
  rects.photo = photoRect;
  items.push({ kind: "photo", rect: photoRect, photo: content.photo ?? { kind: "skyline", seed: 3 }, keyline: 0.0005 });
  if (capH) items.push({ kind: "body", rect: [px0, fold + 0.011, px1, photoRect[1] - 0.0022], seed: seed + 91, em: P.bodyEm * 0.92, pitch: P.linePitch * 0.95, italic: true, ragged: true });
  blocks.push([px0, fold + 0.006, px1, yC + 0.001]);
  // byline
  const [c0x0] = span(0, 1);
  const byEm = 0.0042;
  const by = text("byline", content.byline ?? "BY SAMPLE STAFF", [c0x0, yC - capOf(byEm) - 0.001, c0x0 + colW, yC - 0.001], byEm, { align: "left", font: "label", weight: 700 });
  const bodyTop0 = by.rect[1] - 0.004;
  // key line / pull-quote box (cols key.col .. +span)
  const key = content.key === undefined ? null : content.key;
  let keyBox = null;
  if (key) {
    const [kx0, kx1] = span(key.col ?? 0, key.span ?? 2);
    const kTop = yC - (key.at ?? 0.045);
    const kText = String(key.text).toUpperCase();
    const kEm = Math.min(0.016, (kx1 - kx0 - 0.004) / (kText.length * F.capWidth));
    const kCap = capOf(kEm), padY = 0.0055;
    const kBase = kTop - padY - kCap;
    keyBox = [kx0, kBase - padY, kx1, kTop];
    rule(kx0, kx1, kTop, 0.0011); rule(kx0, kx1, keyBox[1], 0.0011);
    const kw = Math.min(kx1 - kx0 - 0.004, kText.length * F.capWidth * kEm);
    rects.key = [(kx0 + kx1) / 2 - kw / 2, kBase, (kx0 + kx1) / 2 + kw / 2, kBase + kCap];
    text("key", kText, rects.key, kEm, { fit: "fill", font: "headline", weight: F.headlineWeight });
    rects.keyBox = keyBox;
    blocks.push([kx0, keyBox[1] - 0.001, kx1, kTop + 0.001]);
  }
  for (let c = 0; c < 2; c++) {
    const [x0, x1] = span(c, 1);
    const t0 = c === 0 ? bodyTop0 : yC;
    const inKey = keyBox && x0 >= keyBox[0] - 1e-6 && x1 <= keyBox[2] + 1e-6;
    if (inKey) {
      body(x0, x1, t0, keyBox[3] + 0.003, seed + 11 + c, { indent: c === 0 });
      body(x0, x1, keyBox[1] - 0.003, fold + 0.006, seed + 21 + c);
    } else body(x0, x1, t0, fold + 0.006, seed + 11 + c, { indent: c === 0 });
  }
  rule(L, R, fold - 0.0035, 0.0005);

  // ---- below the fold: story 2 (cols 0-3) + photo 2 (cols 4-5)
  const yB = fold - 0.009, bottom = -H / 2 + m;
  if (content.story2 !== false) {
    const [sx0, sx1] = span(0, 4);
    const gEm = 0.0165, gLines = 2;
    const gRect = [sx0, yB - gLines * gEm * 1.02, sx1, yB];
    items.push({ kind: "greekHead", rect: gRect, em: gEm, lines: gLines, seed: seed + 5 });
    blocks.push([sx0, gRect[1] - 0.002, sx1, yB + 0.001]);
    for (let c = 0; c < 4; c++) { const [x0, x1] = span(c, 1); body(x0, x1, gRect[1] - 0.005, bottom + 0.03, seed + 31 + c, { indent: c === 0 }); }
    const p2 = content.photo2 === undefined ? { kind: "portrait", seed: 4 } : content.photo2;
    const [qx0, qx1] = span(4, 2);
    if (p2) {
      const pr = [qx0, yB - 0.13, qx1, yB];
      items.push({ kind: "photo", rect: pr, photo: p2, keyline: 0.0005 });
      items.push({ kind: "body", rect: [qx0, pr[1] - 0.0085, qx1, pr[1] - 0.0022], seed: seed + 93, em: P.bodyEm * 0.92, pitch: P.linePitch * 0.95, italic: true, ragged: true });
      blocks.push([qx0, pr[1] - 0.009, qx1, yB + 0.001]);
      for (let c = 4; c < 6; c++) { const [x0, x1] = span(c, 1); body(x0, x1, pr[1] - 0.012, bottom + 0.03, seed + 41 + c); }
    } else for (let c = 4; c < 6; c++) { const [x0, x1] = span(c, 1); body(x0, x1, yB, bottom + 0.03, seed + 41 + c); }
    // index strip at the foot
    rule(L, R, bottom + 0.026, 0.0011);
    const iEm = 0.0058;
    text("index", content.index ?? "INSIDE  ·  SAMPLE  ·  SAMPLE  ·  SAMPLE  ·  SAMPLE", [L, bottom + 0.009, R, bottom + 0.009 + capOf(iEm)], iEm, { font: "label", weight: 700 });
  }
  // ---- column rules (gutters), interrupted by anything that spans the gutter
  for (let g = 0; g < P.cols - 1; g++) {
    const gx = colX(g) + colW + P.gutter / 2;
    let segs = [[bottom + 0.028, yC]];
    for (const b of blocks) {
      if (gx < b[0] || gx > b[2]) continue;
      segs = segs.flatMap(([a, c]) => (b[3] <= a || b[1] >= c ? [[a, c]] : [[a, b[1]], [b[3], c]].filter(([p, q]) => q - p > 0.004)));
    }
    segs = segs.flatMap(([a, c]) => (fold - 0.0035 > a && fold - 0.0035 < c ? [[a, fold - 0.007], [fold, c]] : [[a, c]]));
    for (const [a, c] of segs) items.push({ kind: "rule", a: [gx, a], b: [gx, c], w: 0.0003 });
  }
  rects.aboveFold = [-W / 2, fold, W / 2, H / 2];
  rects.page = [-W / 2, -H / 2, W / 2, H / 2];
  rects.columns = Array.from({ length: P.cols }, (_, i) => span(i, 1));
  return { W, H, items, rects, seed };
}

/** cardLayout(kind, content, S) -> layout for small printed cards: "pullQuote" { quote, attribution } | "halftone" { photo, w, h }. */
export function cardLayout(kind, content = {}, S) {
  const F = S.fonts;
  if (kind === "halftone") {
    const w = content.w ?? 0.24, h = content.h ?? 0.16, mg = content.margin ?? 0.01;
    return { W: w, H: h, rects: { photo: [-w / 2 + mg, -h / 2 + mg, w / 2 - mg, h / 2 - mg] }, items: [{ kind: "photo", rect: [-w / 2 + mg, -h / 2 + mg, w / 2 - mg, h / 2 - mg], photo: content.photo ?? { kind: "skyline", seed: 3 }, keyline: 0.0005 }], seed: content.seed ?? 5 };
  }
  // pull-quote card: big quote marks, 1–3 lines of headline type, a rule and an attribution
  const w = content.w ?? 0.26, lines = String(content.quote ?? "A SAMPLE PULL QUOTE").toUpperCase().split("\n");
  const em = Math.min(0.022, (w - 0.03) / (Math.max(...lines.map((l) => l.length)) * F.capWidth));
  const cap = em * F.capRatio, pitch = em * 1.05, h = 0.05 + lines.length * pitch + 0.02;
  const items = [{ kind: "rule", a: [-w / 2 + 0.012, h / 2 - 0.012], b: [w / 2 - 0.012, h / 2 - 0.012], w: 0.0016 }];
  items.push({ kind: "text", role: "quoteMark", text: "“", rect: [-w / 2 + 0.012, h / 2 - 0.05, -w / 2 + 0.05, h / 2 - 0.016], em: 0.05, align: "left", fit: "max", font: "masthead", weight: 700 });
  let b = h / 2 - 0.036 - cap;
  const rects = { lines: [] };
  lines.forEach((ln) => {
    const lw = Math.min(w - 0.03, ln.length * F.capWidth * em);
    const r = [-lw / 2, b, lw / 2, b + cap];
    items.push({ kind: "text", role: "quote", text: ln, rect: r, em, align: "center", fit: "fill", font: "headline", weight: F.headlineWeight });
    rects.lines.push(r);
    b -= pitch;
  });
  items.push({ kind: "rule", a: [-0.03, b + pitch - cap - 0.008], b: [0.03, b + pitch - cap - 0.008], w: 0.0008 });
  const aEm = 0.0062;
  items.push({ kind: "text", role: "attribution", text: content.attribution ?? "— SAMPLE SOURCE", rect: [-w / 2, -h / 2 + 0.01, w / 2, -h / 2 + 0.01 + aEm * F.capRatio], em: aEm, align: "center", fit: "max", font: "label", weight: 700 });
  return { W: w, H: h, items, rects, seed: content.seed ?? 9 };
}

// ------------------------------------------------------------------------------------------------ photos
const _cache = new Map();
const sst = (a, b, x) => smoothstep(a, b, x);
const box = (x, y, x0, y0, x1, y1, s) => sst(x0 - s, x0 + s, x) * (1 - sst(x1 - s, x1 + s, x)) * sst(y0 - s, y0 + s, y) * (1 - sst(y1 - s, y1 + s, y));

function skylinePlan(seed) {
  const k = `sky:${seed}`;
  if (_cache.has(k)) return _cache.get(k);
  const r = rng(k), out = [];
  let x = -0.02;
  while (x < 1.02) {
    const w = r.range(0.035, 0.085), h = r.range(0.22, 0.62) * (r.chance(0.18) ? 1.25 : 1);
    out.push({ x0: x, x1: x + w, h, tone: r.range(0.72, 0.9), win: r.chance(0.7), spire: r.chance(0.12), s: r.int(1, 9999) });
    x += w + r.range(-0.006, 0.01);
  }
  _cache.set(k, out);
  return out;
}

/** photoFn({ kind = "skyline"|"notebook"|"press"|"portrait"|"gradient", seed }) -> (u, v, aspect) => darkness 0..1 (u right, v up). */
export function photoFn(p = {}) {
  const kind = p.kind ?? "skyline", seed = p.seed ?? 1;
  const edge = (u, v) => 0.1 * (1 - sst(0, 0.18, Math.min(u, 1 - u, v, 1 - v))); // old-photo edge falloff
  if (kind === "gradient") return (u) => u;
  if (kind === "skyline") {
    const B = skylinePlan(seed);
    return (u, v, a) => {
      let d = 0.12 + 0.2 * v;                                               // dawn sky: lighter at the horizon
      const sd = Math.hypot((u - 0.68) * a, v - 0.46);
      d = lerp(d, 0.02, 1 - sst(0.1, 0.115, sd));                           // sun
      d -= 0.05 * Math.exp(-sd * sd / 0.04);                                // halo
      for (const b of B) {
        const top = 0.16 + b.h * 0.72;
        const inB = box(u, v, b.x0, 0.1, b.x1, top, 0.0015);
        if (inB > 0) {
          let bd = b.tone - 0.08 * (u - b.x0) / (b.x1 - b.x0);
          if (b.win) {
            const gx = (u - b.x0) / 0.012, gy = (v - 0.18) / 0.03;
            const cx = gx - Math.floor(gx), cy = gy - Math.floor(gy);
            const lit = hash01(Math.floor(gx), Math.floor(gy), b.s) < 0.35;
            if (lit && cx > 0.3 && cx < 0.75 && cy > 0.3 && cy < 0.72 && v < top - 0.02 && u > b.x0 + 0.006 && u < b.x1 - 0.006) bd = 0.35;
          }
          d = lerp(d, bd, inB);
        }
        if (b.spire) {
          const mx = (b.x0 + b.x1) / 2, sp = box(u, v, mx - 0.004, top, mx + 0.004, top + 0.09, 0.0015);
          d = lerp(d, b.tone, sp);
        }
      }
      // water: dark with lighter ripple bands reflecting the sun
      const water = 1 - sst(0.095, 0.105, v);
      const rip = 0.5 + 0.5 * Math.sin(v * 210 + Math.sin(u * 30) * 2);
      const refl = Math.exp(-((u - 0.68) * (u - 0.68)) / 0.004) * rip;
      d = lerp(d, 0.62 - 0.45 * refl + 0.06 * rip, water);
      return clamp(d + edge(u, v));
    };
  }
  if (kind === "notebook") {
    return (u, v, a) => {
      const x = u * a, y = v;
      let d = 0.5 + 0.05 * Math.sin(y * 48 + Math.sin(x * 3) * 2) + 0.03 * Math.sin(y * 170);   // desk
      // notebook (rotated rectangle) with a soft shadow
      const c = Math.cos(-0.12), s = Math.sin(-0.12);
      const nx = (x - a * 0.36) * c - (y - 0.5) * s, ny = (x - a * 0.36) * s + (y - 0.5) * c;
      const sh = box(nx - 0.025, ny + 0.025, -0.36, -0.4, 0.36, 0.4, 0.04);
      d = lerp(d, d + 0.25, sh);
      const nb = box(nx, ny, -0.36, -0.4, 0.36, 0.4, 0.003);
      let pd = 0.06;
      const ly = (ny + 0.4) / 0.052, fy = ly - Math.floor(ly);
      if (fy < 0.09 && ny < 0.33) pd = 0.3;                                  // ruled lines
      if (Math.abs(nx + 0.25) < 0.004) pd = 0.42;                            // margin line
      if (Math.abs(nx + 0.33) < 0.012 && fy > 0.3 && fy < 0.7) pd = 0.9;     // spiral holes
      // a few scribbled "notes" (darker squiggle bands on the lines)
      const row = Math.floor(ly);
      if (row >= 2 && row <= 11 && nx > -0.22 && nx < 0.3 - 0.05 * hash01(row, 3, 9) * 4 && fy > 0.35 && fy < 0.72) {
        pd = lerp(pd, 0.55, 0.5 + 0.5 * Math.sin(nx * 260 + row));
      }
      d = lerp(d, pd, nb);
      // pen: capsule with a highlight
      const ax = a * 0.72, ay = 0.18, bx = a * 0.98, by = 0.82;
      const tx = bx - ax, ty = by - ay, L2 = tx * tx + ty * ty;
      const h = clamp(((x - ax) * tx + (y - ay) * ty) / L2);
      const px = ax + tx * h - x, py = ay + ty * h - y, dist = Math.hypot(px, py);
      const pen = 1 - sst(0.022, 0.026, dist);
      const shp = 1 - sst(0.022, 0.05, Math.hypot(px + 0.02, py - 0.02));
      d = lerp(d, d + 0.2, shp * (1 - pen));
      d = lerp(d, 0.86 - 0.5 * Math.exp(-((dist - 0.008) ** 2) / 0.00003), pen);
      // coffee cup from above
      const cd = Math.hypot(x - a * 0.86, y - 0.3);
      d = lerp(d, d + 0.22, 1 - sst(0.17, 0.24, Math.hypot(x - a * 0.86 + 0.03, y - 0.27)));
      d = lerp(d, 0.12, 1 - sst(0.165, 0.172, cd));                         // saucer
      d = lerp(d, 0.05, 1 - sst(0.12, 0.126, cd));                          // rim
      d = lerp(d, 0.82 - 0.25 * Math.exp(-((x - a * 0.83) ** 2 + (y - 0.33) ** 2) / 0.0012), 1 - sst(0.1, 0.106, cd));  // coffee + highlight
      return clamp(d + edge(u, v));
    };
  }
  if (kind === "press") {
    return (u, v, a) => {
      const x = u * a, y = v;
      let d = 0.78 + 0.06 * Math.sin(x * 9);
      const cyl = [[0.22, 0.15], [0.55, 0.17], [0.86, 0.13]];
      for (const [yc, r] of cyl) {
        const n = (y - yc) / r;
        if (Math.abs(n) < 1.0) {
          const k = 1 - sst(0.97, 1.0, Math.abs(n));
          let cd = 0.3 + 0.45 * (1 - Math.sqrt(1 - n * n)) + 0.18 * n;
          cd -= 0.28 * Math.exp(-((n - 0.42) ** 2) / 0.01);                 // specular band
          const g = (x * 14) % 1;
          if (g < 0.04) cd += 0.15;                                          // engraved rings
          d = lerp(d, clamp(cd), k);
        }
        // shaft bearings at both ends
        for (const ex of [0.06, a - 0.06]) d = lerp(d, 0.92, 1 - sst(r * 0.35, r * 0.38, Math.hypot(x - ex, y - yc)));
      }
      // the paper web: a light ribbon running between the rollers
      const wy = 0.38 + 0.08 * Math.sin(x * 2.2);
      const web = 1 - sst(0.03, 0.036, Math.abs(y - wy));
      d = lerp(d, 0.1 + 0.05 * Math.sin(x * 40), web);
      return clamp(d + edge(u, v));
    };
  }
  // portrait: an anonymous head-and-shoulders silhouette against a window (no features)
  return (u, v, a) => {
    const x = u * a, y = v;
    let d = 0.18 + 0.35 * u + 0.05 * Math.sin(v * 40);
    const cx = a * 0.5;
    const head = Math.hypot((x - cx) / 0.16, (y - 0.62) / 0.2);
    const sh = Math.hypot((x - cx) / 0.42, (y + 0.08) / 0.42);
    const fig = Math.max(1 - sst(0.97, 1.03, head), 1 - sst(0.97, 1.03, sh));
    const rim = Math.exp(-(((x - cx + 0.12) / 0.04) ** 2)) * 0.4;
    d = lerp(d, 0.84 - rim * (1 - sst(0.9, 1, head)), fig);
    return clamp(d + edge(u, v));
  };
}

// ------------------------------------------------------------------------------------------------ grease-pencil paths
/** circlePath(rect, { pad = .006, turns = 1.12, start = 2.5, wobble = .05, tilt = -.025, n = 120, seed = 1, ryMin }) -> hand-drawn loop. */
export function circlePath(rect, o = {}) {
  const { pad = 0.006, turns = 1.12, start = 2.5, wobble = 0.05, tilt = -0.025, n = 120, seed = 1 } = o;
  const cx = (rect[0] + rect[2]) / 2, cy = (rect[1] + rect[3]) / 2;
  const rx = (rect[2] - rect[0]) / 2 + pad * 1.6, ry = Math.max((rect[3] - rect[1]) / 2 + pad * 1.4, o.ryMin ?? 0);
  const c = Math.cos(tilt), s = Math.sin(tilt), pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = start + turns * TAU * f;
    const grow = 1 + 0.07 * f;                                      // the loop spirals slightly outward so the overlap shows
    const w = 1 + wobble * (noise3(f * 5, 0.3, 0.7, seed) - 0.5) * 2;
    const x = Math.cos(a) * rx * grow * w, y = Math.sin(a) * ry * grow * w;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}
/** underlinePath(rect, { under = .004, over = .006, sag = .0015, n = 40, seed }) -> a quick slightly curved stroke under the cap box. */
export function underlinePath(rect, o = {}) {
  const { under = 0.004, over = 0.006, sag = 0.0015, n = 40, seed = 2 } = o;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = lerp(rect[0] - over, rect[2] + over, f);
    pts.push([x, rect[1] - under - sag * Math.sin(Math.PI * f) + 0.0008 * (noise3(f * 4, 1, 2, seed) - 0.5) + 0.0015 * f]);
  }
  return pts;
}
function arc(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}
/** pointAt(stroke, s) -> [x, y] at arc length s. */
export function pointAt(st, s) {
  const { pts, cum } = st;
  if (s <= 0) return pts[0];
  if (s >= cum[cum.length - 1]) return pts[pts.length - 1];
  let i = 1;
  while (cum[i] < s) i++;
  const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
}

// ------------------------------------------------------------------------------------------------ the edition plan
/**
 * planEdition(cfg, S) -> plan
 * cfg = { spin: { at, dur }, turn: { at, dur }, ink: { at, dur }, develop: [{ id, at, dur }],
 *         pencil: [{ id, at, dur, path }], drop: { at, dur }, moves: [{ t, dur }] }   (any part optional)
 * plan.events: [{ t, kind, ... }] for scoreFromEvents(plan.events, pressVoices(S.sound)).
 */
export function planEdition(cfg, S) {
  const plan = { spin: null, turn: null, ink: null, develop: {}, pencil: {}, drop: null, kicks: [], events: [] };
  const ev = (t, kind, o = {}) => plan.events.push({ t, kind, ...o });
  if (cfg.spin) {
    plan.spin = { ...cfg.spin, land: cfg.spin.at + cfg.spin.dur };
    ev(cfg.spin.at, "spin", { dur: cfg.spin.dur });
    ev(plan.spin.land, "land");
    plan.kicks.push({ t: plan.spin.land, amp: 0.0022 });
  }
  if (cfg.turn) { plan.turn = { ...cfg.turn }; ev(cfg.turn.at, "turn", { dur: cfg.turn.dur }); }
  if (cfg.ink) {
    const R = S.roller;
    plan.ink = { ...cfg.ink, end: cfg.ink.at + cfg.ink.dur };
    ev(cfg.ink.at - R.approach * 0.15, "rollDown");
    ev(cfg.ink.at, "roll", { dur: cfg.ink.dur });
    const every = S.sound.press.every;
    for (let t = cfg.ink.at; t < plan.ink.end - 0.05; t += every) ev(+t.toFixed(4), "pressTick");
  }
  for (const d of cfg.develop ?? []) { plan.develop[d.id] = { ...d }; ev(d.at, "develop", { dur: d.dur, id: d.id }); }
  for (const p of cfg.pencil ?? []) {
    const cum = arc(p.path);
    plan.pencil[p.id] = { ...p, pts: p.path, cum, len: cum[cum.length - 1] };
    ev(p.at, "pencil", { dur: p.dur, id: p.id, len: plan.pencil[p.id].len });
  }
  if (cfg.drop) {
    plan.drop = { ...cfg.drop, land: cfg.drop.at + cfg.drop.dur };
    ev(cfg.drop.at, "dropStart", { dur: cfg.drop.dur });
    ev(plan.drop.land, "dropLand");
    plan.kicks.push({ t: plan.drop.land, amp: 0.006 });
  }
  for (const m of cfg.moves ?? []) ev(m.t, "move", { dur: m.dur });
  plan.events.sort((a, b) => a.t - b.t);
  return plan;
}

/** spinPose(t, spin, S) -> { visible, angle, scale, tiltX, tiltZ, shadow, u }: spins in from depth about the frame centre, lands flat. */
export function spinPose(t, sp, S) {
  const G = S.spin;
  if (!sp) return { visible: true, angle: 0, scale: 1, tiltX: 0, tiltZ: 0, shadow: 1, u: 1 };
  if (t < sp.at) return { visible: false, angle: 0, scale: G.startScale, tiltX: 0, tiltZ: 0, shadow: 0, u: 0 };
  const u = clamp((t - sp.at) / sp.dur), e = ease.outCubic(u);
  const dist = lerp(1 / G.startScale, 1, ease.outCubic(Math.min(1, u * 1.08)));   // perspective-like approach: scale = 1 / distance
  let scale = 1 / dist, tiltX = G.tilt * (1 - e) * (1 - e), tiltZ = 0.35 * G.tilt * (1 - e) * Math.sin(u * 5);
  const tau = t - sp.land;
  if (tau >= 0) {                                    // settle: tiny flutter of the sheet and a 0.6 % breath
    tiltX = G.wobble * Math.exp(-tau * 7) * Math.sin(tau * 26);
    scale = 1 + 0.005 * Math.exp(-tau * 9) * Math.sin(tau * 30);
  }
  const lift = scale * (0.75 * S.page.H * Math.sin(Math.abs(tiltX)) + 0.5 * S.page.W * Math.sin(Math.abs(tiltZ)));
  return { visible: true, angle: -G.turns * TAU * (1 - e), scale, tiltX, tiltZ, lift, shadow: smoothstep(0.55, 1, u), u };
}
/** turnAt(t, turn) -> 0..1 eased page-turn progress. */
export const turnAt = (t, tp) => (!tp ? 0 : ease.inOutSine(clamp((t - tp.at) / tp.dur)));
/** inkHead(t, ink, soft) -> page v (1 = top) of the ink-pass contact line; ink shows where v > head. */
export function inkHead(t, ink, soft = 0.004) {
  if (!ink) return -1;
  if (t <= ink.at) return 1 + soft * 2;
  if (t >= ink.end) return -soft * 2 - 0.01;
  return lerp(1 + soft * 2, -soft * 2 - 0.01, ease.inOutSine((t - ink.at) / ink.dur));
}
/** inkTimeAt(v, ink) -> the time the ink pass reaches page v (bisection on inkHead). Plan sounds/develops from this. */
export function inkTimeAt(v, ink) {
  let a = ink.at, b = ink.at + ink.dur;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (inkHead(m, ink) > v) a = m; else b = m; }
  return (a + b) / 2;
}
/** pageV(y, S) -> page v (0 bottom .. 1 top) of page y. */
export const pageV = (y, S) => y / S.page.H + 0.5;
/** rollerAt(t, ink, S) -> { visible, y (page m, contact line), lift (m), angle (rad) } */
export function rollerAt(t, ink, S) {
  const R = S.roller, H = S.page.H;
  if (!ink || t < ink.at - R.approach || t > ink.end + R.exit) return { visible: false, y: H, lift: 0, angle: 0 };
  let y, lift;
  if (t < ink.at) { const u = ease.outCubic((t - (ink.at - R.approach)) / R.approach); y = lerp(H / 2 + 0.2, H / 2 + 0.004, u); lift = lerp(0.03, 0, u); }
  else if (t <= ink.end) { y = (inkHead(t, ink) - 0.5) * H; lift = 0; }
  else { const u = ease.inCubic((t - ink.end) / R.exit); y = lerp(-H / 2 - 0.01, -H / 2 - 0.25, u); lift = lerp(0, 0.05, u); }
  return { visible: true, y, lift, angle: (H / 2 + 0.2 - y) / R.r };
}
/** developAt(t, dev) -> 0..1 halftone dot growth (0 = pin-prick, 1 = full tone). */
export const developAt = (t, d) => (!d ? 1 : ease.inOutSine(clamp((t - d.at) / d.dur)));
/** strokeAt(t, st) -> drawn arc length (m): quick start, steady middle, slight slow-down at the end. */
export function strokeAt(t, st) {
  if (!st || t <= st.at) return 0;
  const u = clamp((t - st.at) / st.dur);
  return st.len * (0.5 * u + 0.5 * ease.inOutSine(u));
}
/** pencilPose(t, st, S) -> { visible, x, y, lift } china-marker tip: approaches, rides the stroke head, lifts away. */
export function pencilPose(t, st, S) {
  const G = S.grease;
  if (!st || t < st.at - G.leadIn || t > st.at + st.dur + G.leadOut) return { visible: false, x: 0, y: 0, lift: G.lift };
  if (t < st.at) {
    const u = ease.outCubic((t - st.at + G.leadIn) / G.leadIn), p = st.pts[0];
    return { visible: true, x: p[0] + 0.03 * (1 - u), y: p[1] + 0.02 * (1 - u), lift: G.lift * (1 - u) };
  }
  if (t <= st.at + st.dur) { const p = pointAt(st, strokeAt(t, st)); return { visible: true, x: p[0], y: p[1], lift: 0 }; }
  const u = ease.inCubic((t - st.at - st.dur) / G.leadOut), p = st.pts[st.pts.length - 1];
  return { visible: true, x: p[0] + 0.14 * u, y: p[1] - 0.1 * u, lift: G.lift * u };
}
/** dropPose(t, drop, S) -> { visible, y, dx, dz, rx, rz, shadow }: a bundle falls (free fall), thumps and settles. */
export function dropPose(t, dr, S) {
  const K = S.stack;
  if (!dr || t < dr.at) return { visible: false, y: K.drop, dx: 0, dz: 0, rx: 0, rz: 0, shadow: 0 };
  const u = clamp((t - dr.at) / dr.dur);
  if (u < 1) {
    return { visible: true, y: K.drop * (1 - u * u), dx: -0.04 * (1 - u), dz: -0.16 * (1 - ease.outCubic(u)), rx: 0.07 * (1 - u), rz: -0.06 * (1 - u), shadow: smoothstep(0.2, 1, u) };
  }
  const tau = t - dr.land;
  const b = K.bounce * Math.exp(-tau * 14) * Math.abs(Math.sin(tau * 30));
  return { visible: true, y: b, dx: 0, dz: 0, rx: 0.004 * Math.exp(-tau * 10) * Math.sin(tau * 40), rz: 0, shadow: 1 };
}
/** kickAt(t, plan) -> camera dip (m) after thumps: a short damped shake toward the table. */
export function kickAt(t, plan) {
  let y = 0;
  for (const k of plan.kicks) { const tau = t - k.t; if (tau > 0 && tau < 0.6) y -= k.amp * Math.exp(-tau / 0.07) * Math.cos(tau * 45); }
  return y;
}

// ------------------------------------------------------------------------------------------------ camera
/**
 * shotFor(rect, { fov = 30, aspect = 16/9, margin = .05, tilt = .14 (rad, toward +page-down), surface = .002,
 *   origin = [0, 0] (world x, z of the page centre), dx = 0, dy = 0 (page-m nudges) }) -> { pos, target, fov }
 * Top-down camera framing a page rect (page metres) with a small forward tilt.
 */
export function shotFor(rect, o = {}) {
  const { fov = 30, aspect = 16 / 9, margin = 0.05, tilt = 0.14, surface = 0.002, origin = [0, 0] } = o;
  const cx = (rect[0] + rect[2]) / 2 + (o.dx ?? 0), cy = (rect[1] + rect[3]) / 2 + (o.dy ?? 0);
  const rw = rect[2] - rect[0], rh = (rect[3] - rect[1]) * Math.cos(tilt);
  const fh = Math.max(rh, rw / aspect) * (1 + margin);
  const dist = fh / 2 / Math.tan((fov * Math.PI) / 360);
  const target = [origin[0] + cx, surface, origin[1] - cy];
  return { pos: [target[0], surface + dist * Math.cos(tilt), target[2] + dist * Math.sin(tilt)], target, fov };
}

// ------------------------------------------------------------------------------------------------ sound
/** pressVoices(S.sound) -> voices for scoreFromEvents(plan.events, voices). */
export function pressVoices(snd = {}) {
  const g = (k) => snd[k] ?? {};
  return {
    spin: (e) => [
      { type: "whoosh", dir: "in", dur: e.dur * 1.05, gain: g("spin").gain ?? 0.4, pitch: g("spin").pitch ?? 0.9 },
      { type: "paper", dur: e.dur * 0.9, density: 0.28, pitch: 1.15, gain: (g("spin").gain ?? 0.4) * 0.45, offset: 0.1 },
    ],
    land: () => [
      { type: "thud", dur: 0.38, pitch: g("land").pitch ?? 0.7, gain: g("land").gain ?? 0.6 },
      { type: "paper", dur: 0.2, density: 0.85, pitch: 0.75, gain: 0.32 },
    ],
    turn: (e) => [
      { type: "paper", fold: true, dur: e.dur, density: 0.42, pitch: g("turn").pitch ?? 0.8, gain: g("turn").gain ?? 0.5 },
      { type: "whoosh", dur: e.dur * 0.9, gain: 0.14, pitch: 1.3 },
    ],
    rollDown: () => [{ type: "thud", dur: 0.18, pitch: 1.35, gain: 0.2 }],
    roll: (e) => [
      { type: "whir", dur: e.dur + 0.1, hz: g("roll").hz ?? 62, hz2: g("roll").hz2 ?? 70, grit: 0.55, gain: g("roll").gain ?? 0.36 },
      { type: "rustle", dur: e.dur, density: 0.75, pitch: 0.42, gain: (g("roll").gain ?? 0.36) * 0.7 },
    ],
    pressTick: (e, c) => [{ type: "clack", dur: 0.1, pitch: 0.48 + 0.04 * (c.index % 2), gain: g("press").gain ?? 0.07 }],
    develop: (e) => [
      { type: "riser", dur: e.dur, gain: g("develop").gain ?? 0.16, pitch: 1.5 },
      { type: "chime", dur: 1.0, notes: 3, gain: (g("develop").gain ?? 0.16) * 0.6, pitch: 1.2, offset: e.dur * 0.92 },
    ],
    pencil: (e) => [
      { type: "click", dur: 0.03, pitch: 0.6, gain: 0.14 },
      { type: "penScratch", dur: e.dur + 0.04, speed: g("pencil").speed ?? 0.75, pitch: g("pencil").pitch ?? 0.55, gain: g("pencil").gain ?? 0.5 },
    ],
    dropStart: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.06, gain: 0.28, pitch: 0.7 }],
    dropLand: () => [
      { type: "thud", dur: 0.55, pitch: g("drop").pitch ?? 0.55, gain: g("drop").gain ?? 0.75 },
      { type: "paper", dur: 0.28, density: 0.95, pitch: 0.6, gain: 0.4 },
    ],
    move: (e) => [{ type: "whoosh", dur: e.dur, gain: 0.1, pitch: 1.4 }],
  };
}
