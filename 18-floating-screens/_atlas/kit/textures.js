// textures.js — seeded procedural CanvasTextures. All tileable (RepeatWrapping) unless noted.
import * as THREE from "three";
import { hash01, rng, clamp, lerp, smoothstep } from "./time.js";
import { valueNoise2, fbm2 } from "./noise.js";
import { CANVAS_DEFAULTS, canvas2d, newCanvas } from "./canvas.js";

// ---------- noise (pure) ----------
// valueNoise2 / fbm2 live in noise.js since pass 6 (Node-safe, no THREE) and are re-exported here unchanged.
export { valueNoise2, fbm2 };

// ---------- canvas plumbing ----------

/**
 * makeCanvas(w, h = w, { willReadFrequently = CANVAS_DEFAULTS.willReadFrequently }) -> HTMLCanvasElement.
 * Pass 7: the 2D context is created here with { willReadFrequently: true } (CPU rasteriser — repeatable across page
 * loads; see kit/canvas.js), so every texture painter below and any caller's later getContext("2d") use it.
 * { willReadFrequently: false } restores the old lazily-created (GPU) context.
 */
export function makeCanvas(w, h = w, opts = {}) {
  return newCanvas(w, h, opts);
}
export { CANVAS_DEFAULTS, canvas2d, newCanvas };

/** Wrap a canvas as a CanvasTexture. opts: { repeat:[x,y], srgb = true, anisotropy = 8 } */
export function canvasTexture(canvas, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * uploadTexture(stage | renderer, ...textures) -> the first texture. Marks each texture dirty (needsUpdate) and uploads
 * it to the GPU NOW with renderer.initTexture, instead of lazily inside the next render. Call it in renderAt right after
 * you redraw a CanvasTexture / DataTexture and BEFORE stage.render: on ANGLE/Metal a texture redrawn in renderAt and
 * left to the lazy upload has been seen to differ by one level on a pixel between seek orders (zen-sand, card-table,
 * weather-map, film-projector all hit it and called initTexture themselves). Nulls are skipped. (pass 6)
 */
export function uploadTexture(target, ...textures) {
  const renderer = target?.renderer ?? target;
  for (const tex of textures) {
    if (!tex) continue;
    tex.needsUpdate = true;
    renderer.initTexture(tex);
  }
  return textures[0];
}

const col = (c) => new THREE.Color(c);

/**
 * paintPixels(size | [width, height], f) -> HTMLCanvasElement — NOT a texture (wrap it: canvasTexture(paintPixels(...))).
 * Fills per pixel from f(u, v, x, y) -> [r,g,b] in 0..1 (or a number for grayscale); u = x / width, v = y / height
 * (v = 0 is the canvas top).
 */
export function paintPixels(size, f) {
  const [W, H] = Array.isArray(size) ? size : [size, size];
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = f(x / W, y / H, x, y);
      const i = (y * W + x) * 4;
      const [R, G, B] = typeof r === "number" ? [r, r, r] : r;
      img.data[i] = clamp(R) * 255;
      img.data[i + 1] = clamp(G) * 255;
      img.data[i + 2] = clamp(B) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- texture factories ----------

/**
 * noiseTexture({ size = 256, scale = 8, octaves = 4, seed = 1, colorA = 0x000000, colorB = 0xffffff,
 *                contrast = 1, repeat = [1,1], srgb = true }) -> CanvasTexture (tileable fbm)
 */
export function noiseTexture(o = {}) {
  const { size = 256, scale = 8, octaves = 4, seed = 1, colorA = 0x000000, colorB = 0xffffff, contrast = 1, repeat, srgb = true } = o;
  const a = col(colorA), b = col(colorB);
  const c = paintPixels(size, (u, v) => {
    let n = fbm2(u * scale, v * scale, { seed, octaves, period: scale });
    n = clamp((n - 0.5) * contrast + 0.5);
    return [lerp(a.r, b.r, n), lerp(a.g, b.g, n), lerp(a.b, b.b, n)];
  });
  return canvasTexture(c, { repeat, srgb });
}

/**
 * paperTexture({ size = 512, base = 0xf4efe6, fiber = 0.06, grain = 0.05, seed = 7, repeat }) ->
 * warm paper with soft blotches + fine grain. Pair with bumpFromNoise for tactile paper.
 * variant: "classic" (default, unchanged) has fibres stretched 16:1 along V (48 cells across U, 3 along V) and 6-cell
 *   blotches — repeated across a large sheet they read as streaks running along V and a visible tile grid. "even" (opt-in, pass 6): isotropic fibre noise
 *   (40 cells) and smaller, weaker blotches (12 cells), same mean tone — no direction and nothing large enough to
 *   show the repeat. Use it for big sheets / many repeats.
 */
export function paperTexture(o = {}) {
  const { size = 512, base = 0xf4efe6, fiber = 0.06, grain = 0.05, seed = 7, repeat, variant = "classic" } = o;
  const b = col(base);
  const even = variant === "even";
  const c = paintPixels(size, (u, v, x, y) => {
    const g = hash01(x, y, seed) - 0.5;
    let d;
    if (even) {
      const blot = fbm2(u * 12, v * 12, { seed, octaves: 3, period: 12 }) - 0.5;
      const fib = fbm2(u * 40, v * 40, { seed: seed + 9, octaves: 2, period: 40 }) - 0.5;
      d = blot * fiber * 0.7 + fib * fiber * 0.9 + g * grain;
    } else {
      const blot = fbm2(u * 6, v * 6, { seed, octaves: 4, period: 6 }) - 0.5;
      const fib = fbm2(u * 48, v * 3, { seed: seed + 9, octaves: 2, period: 48 }) - 0.5;
      d = blot * fiber * 1.5 + fib * fiber + g * grain;
    }
    return [b.r + d, b.g + d, b.b + d * 1.1];
  });
  return canvasTexture(c, { repeat });
}

/**
 * gridTexture({ size = 512, cells = 8, line = 2, bg = 0xffffff, fg = 0xd0d4dc, major = 0, majorColor, repeat })
 * major: every Nth line drawn thicker/darker (0 = off).
 */
export function gridTexture(o = {}) {
  const { size = 512, cells = 8, line = 2, bg = 0xffffff, fg = 0xd0d4dc, major = 0, majorColor = fg, repeat } = o;
  const c = makeCanvas(size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = `#${col(bg).getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    const isMajor = major && i % major === 0;
    ctx.fillStyle = `#${col(isMajor ? majorColor : fg).getHexString()}`;
    const w = isMajor ? line * 2 : line;
    const p = Math.round(i * step - w / 2);
    ctx.fillRect(p, 0, w, size);
    ctx.fillRect(0, p, size, w);
  }
  return canvasTexture(c, { repeat });
}

/**
 * gradientTexture({ size = 512, stops = [[pos, color, alpha?], ...], type = "linear"|"radial",
 *                   angle = 90 (deg, linear: 90 = top->bottom), cx = .5, cy = .5 (radial) })
 * A stop's optional third value is its alpha (0..1): fades, vignettes, light shafts, sky-to-transparent.
 * Not tileable; wrap is clamped. Use for backdrops, sky domes, sprite glows.
 */
export function gradientTexture(o = {}) {
  const { size = 512, stops = [[0, 0x000000], [1, 0xffffff]], type = "linear", angle = 90, cx = 0.5, cy = 0.5 } = o;
  const c = makeCanvas(size);
  const ctx = c.getContext("2d");
  let g;
  if (type === "radial") g = ctx.createRadialGradient(cx * size, cy * size, 0, cx * size, cy * size, size * 0.71);
  else {
    const a = (angle * Math.PI) / 180, h = size / 2;
    g = ctx.createLinearGradient(h - Math.cos(a) * h, h - Math.sin(a) * h, h + Math.cos(a) * h, h + Math.sin(a) * h);
  }
  for (const [p, cc, al] of stops) {
    if (al == null) g.addColorStop(p, `#${col(cc).getHexString()}`);
    else { const h = parseInt(col(cc).getHexString(), 16); g.addColorStop(p, `rgba(${h >> 16},${(h >> 8) & 255},${h & 255},${al})`); }
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * bumpFromNoise({ size = 256, scale = 16, octaves = 3, seed = 3, repeat }) -> linear (non-sRGB) grayscale
 * texture for material.bumpMap / roughnessMap.
 */
export function bumpFromNoise(o = {}) {
  const { size = 256, scale = 16, octaves = 3, seed = 3, repeat } = o;
  const c = paintPixels(size, (u, v) => fbm2(u * scale, v * scale, { seed, octaves, period: scale }));
  return canvasTexture(c, { repeat, srgb: false });
}

/** speckleTexture({ size = 256, density = 0.02, base, dot, seed }) — terrazzo / confetti dots. */
export function speckleTexture(o = {}) {
  const { size = 256, density = 0.02, base = 0xffffff, dot = 0x222222, radius = [1, 3], seed = 5, repeat } = o;
  const c = makeCanvas(size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = `#${col(base).getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  const r = rng(seed);
  const n = Math.floor(size * size * density * 0.05);
  const dots = Array.isArray(dot) ? dot : [dot];
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `#${col(r.pick(dots)).getHexString()}`;
    ctx.beginPath();
    ctx.arc(r.range(0, size), r.range(0, size), r.range(radius[0], radius[1]), 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c, { repeat });
}

/**
 * woodTexture({ size = 1024, boards = 5, seed = 23, grainFreq = 22, grainWarp = 2.2, contrast = .5,
 *               dark = "#472c1d", mid = "#7a5034", light = "#9e6d46", seam = "#2e1c12", repeat }) -> CanvasTexture
 * Planks running along U (x): per-board tone shift, fbm-warped sine grain with thin dark late-wood
 * lines, long streaks, fine flecks, dark seams between boards and at a seeded butt joint per board.
 * Tileable. Set repeat = [sizeMetres / metresPerTile, ...] on a floor/table plane.
 */
export function woodTexture(o = {}) {
  const { size = 1024, boards: nb = 5, seed = 23, grainFreq = 22, grainWarp = 2.2, contrast = 0.5, repeat } = o;
  const dark = col(o.dark ?? "#472c1d"), mid = col(o.mid ?? "#7a5034"), light = col(o.light ?? "#9e6d46"), seam = col(o.seam ?? "#2e1c12");
  const c = paintPixels(size, (u, v) => {
    const b = Math.floor(v * nb), bv = v * nb - b;
    const joint = hash01(b, seed, 3);
    const du = Math.abs(((u - joint + 1.5) % 1) - 0.5);
    if (bv < 0.006 || bv > 0.994 || du > 0.4985) return [seam.r, seam.g, seam.b];
    const tone = (hash01(b, seed) - 0.5) * 0.3;
    const warpP = fbm2(u * 3, bv * 2, { seed: seed + b * 7, octaves: 3, period: 3 });
    const g = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (bv * grainFreq / nb + warpP * grainWarp + hash01(b, 9)));
    const line = smoothstep(0.82, 1, g);
    const streak = fbm2(u * 6, v * nb * 6, { seed: seed + 3, octaves: 3, period: 6 });
    const fleck = fbm2(u * 48, v * 24, { seed: seed + 5, octaves: 2, period: 48 });
    let k = 0.58 + tone + (streak - 0.5) * contrast + (fleck - 0.5) * 0.12 - line * 0.32;
    k = clamp(k);
    const a = k < 0.5 ? dark : mid, z = k < 0.5 ? mid : light, kk = k < 0.5 ? k * 2 : (k - 0.5) * 2;
    return [lerp(a.r, z.r, kk), lerp(a.g, z.g, kk), lerp(a.b, z.b, kk)];
  });
  return canvasTexture(c, { repeat });
}

/**
 * printTexture(bbox, draw(h), { pxPerMetre = 420, maxPx = 4096, background = "#ffffff", colors = {},
 *              font = '"Georgia", serif', weight = 700, textColor = "#000000", multiply }) -> { texture, canvas, s }
 * "Print" flat artwork onto a face whose extent in metres is bbox = { minX, maxX, minY, maxY, w, h }
 * (cardGeometry returns one; pair it with normalizedUV). Drawing uses face metres, y up:
 *   h.text(str, x, y, sizeM, { color, weight, font, align, baseline, italic, spacing })   h.measure(str, sizeM)
 *   h.fill(color, ctx => path)  h.stroke(color, widthM, ctx => path)  h.circle(x, y, r, color)
 *   h.rect(x, y, w, hh, color)  h.roundRect(x, y, w, hh, r, color)   h.X(x) / h.Y(y) -> canvas px, h.s = px/m
 * Colour names resolve through `colors` (e.g. a style palette). `multiply: { canvas, repeatPerMetre }`
 * multiplies a tiling canvas (paper fibre, halftone, grain) over the print.
 */
export function printTexture(bbox, draw, o = {}) {
  const { pxPerMetre = 420, maxPx = 4096, background = "#ffffff", colors = {}, font = '"Georgia", serif', weight = 700, textColor = "#000000", multiply } = o;
  const cc = (c) => colors[c] ?? c;
  const s = Math.min(pxPerMetre, maxPx / Math.max(bbox.w, bbox.h));
  const W = Math.max(8, Math.ceil(bbox.w * s)), H = Math.max(8, Math.ceil(bbox.h * s));
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = cc(background);
  ctx.fillRect(0, 0, W, H);
  const h = {
    s, W, H, ctx,
    X: (x) => (x - bbox.minX) * s,
    Y: (y) => (bbox.maxY - y) * s,
    text(str, x, y, sizeM, q = {}) {
      ctx.save();
      ctx.font = `${q.italic ? "italic " : ""}${q.weight ?? weight} ${sizeM * s}px ${q.font ?? font}`;
      if ("letterSpacing" in ctx && q.spacing) ctx.letterSpacing = `${q.spacing * s}px`;
      ctx.fillStyle = cc(q.color ?? textColor);
      ctx.textAlign = q.align ?? "center";
      ctx.textBaseline = q.baseline ?? "middle";
      ctx.fillText(str, h.X(x), h.Y(y));
      ctx.restore();
    },
    measure(str, sizeM, q = {}) {
      ctx.save();
      ctx.font = `${q.weight ?? weight} ${sizeM * s}px ${q.font ?? font}`;
      const w = ctx.measureText(str).width / s;
      ctx.restore();
      return w;
    },
    fill(color, pathFn) { ctx.fillStyle = cc(color); ctx.beginPath(); pathFn(ctx); ctx.fill(); },
    stroke(color, widthM, pathFn) { ctx.strokeStyle = cc(color); ctx.lineWidth = widthM * s; ctx.beginPath(); pathFn(ctx); ctx.stroke(); },
    circle(x, y, r, color) { h.fill(color, (g) => g.arc(h.X(x), h.Y(y), r * s, 0, Math.PI * 2)); },
    rect(x, y, w, hh, color) { ctx.fillStyle = cc(color); ctx.fillRect(h.X(x), h.Y(y + hh), w * s, hh * s); },
    roundRect(x, y, w, hh, r, color) { h.fill(color, (g) => g.roundRect(h.X(x), h.Y(y + hh), w * s, hh * s, r * s)); },
  };
  draw(h);
  if (multiply?.canvas) {
    ctx.globalCompositeOperation = "multiply";
    const pat = ctx.createPattern(multiply.canvas, "repeat");
    const k = s / (multiply.canvas.width * (multiply.repeatPerMetre ?? 1));
    pat.setTransform(new DOMMatrix().scale(k, k));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  const texture = canvasTexture(c, { anisotropy: 8 });
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return { texture, canvas: c, s };
}

/**
 * printedMaterial(template, bbox, draw, opts) -> material: template.clone() with colour white and the
 * printTexture() result as its map (a bumpMap on the template is cloned with repeat = bbox metres).
 * The "printed card face" material: use it as the front material of cardMesh(..., { normalizedUV: true }).
 */
export function printedMaterial(template, bbox, draw, opts = {}) {
  const { texture } = printTexture(bbox, draw, opts);
  const m = template.clone();
  m.color.set("#ffffff");
  m.map = texture;
  if (template.bumpMap) {
    m.bumpMap = template.bumpMap.clone();
    m.bumpMap.repeat.set(bbox.w, bbox.h);
    m.bumpMap.needsUpdate = true;
  }
  return m;
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 2)
/**
 * blobTexture({ size = 128, stops = [[0,1],[.35,.75],[.7,.22],[1,0]] }) -> clamped CanvasTexture: white RGB,
 * radial ALPHA falloff. For contact shadows / AO blobs / glows (use as `map` with transparent: true; the
 * material colour tints it). (tiny-diorama)
 */
export function blobTexture({ size = 128, stops = [[0, 1], [0.35, 0.75], [0.7, 0.22], [1, 0]] } = {}) {
  const c = makeCanvas(size), ctx = c.getContext("2d"), h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  for (const [p, a] of stops) g.addColorStop(p, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/**
 * softRectTexture({ soft = .32, radius = .08, size = 256 }) -> clamped CanvasTexture: white RGB, alpha = a
 * rounded-square SDF falloff (soft drop shadow under a tile / card / slab). (tiny-diorama)
 */
export function softRectTexture({ soft = 0.32, radius: r = 0.08, size: N = 256 } = {}) {
  const c = makeCanvas(N), ctx = c.getContext("2d"), img = ctx.createImageData(N, N);
  const half = 0.5 / (1 + soft * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = Math.abs((x + 0.5) / N - 0.5), py = Math.abs((y + 0.5) / N - 0.5);
    const qx = Math.max(px - half + r, 0), qy = Math.max(py - half + r, 0);
    const d = Math.hypot(qx, qy) + Math.min(Math.max(px - half + r, py - half + r), 0) - r;
    const a = 1 - THREE.MathUtils.smoothstep(d, -soft * 0.35, soft * 0.5);
    const k = (y * N + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(255 * a * a);
  }
  ctx.putImageData(img, 0, 0);
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 3, marble-run)
/**
 * plaqueCanvas(text, { kind = "engraved"|"stamped", cap = .2 (m), ppm = 360, pad = [.28, .2], seed = 1,
 *   font = '"Copperplate", Georgia, serif', weight = 700, metal = "#b8893a", ink = "#2b1a10", wood, glintScale }) -> { canvas, rm, w, h }
 *   A label plate texture in metres (w x h): "engraved" = brushed metal, engraved border, dark-filled letters
 *   with a bevel glint, plus `rm` = a roughness(G)/metalness(B) map; "stamped" = wood (woodTexture opts in
 *   `wood`) with worn, flecked ink letters. Multi-line text with "\n". Seeded wear: deterministic.
 *   glintScale (engraved only, opt-in since pass 6): the bevel glint's offset = glintScale x cap instead of the fixed
 *   6 mm, which doubles lettering below ~0.1 m cap. 0.02-0.03 reads as a bevel at any size (0.03 at cap .2 = 6 mm).
 */
export function plaqueCanvas(text, o = {}) {
  const { kind = "engraved", cap = 0.2, ppm = 360, pad = [0.28, 0.2], seed = 1, weight = 700, metal = "#b8893a", ink = "#2b1a10" } = o;
  const font = o.font ?? (kind === "engraved" ? '"Copperplate", Georgia, serif' : '"DIN Condensed", "Arial Narrow", sans-serif');
  const lines = String(text).split("\n");
  const probe = makeCanvas(8, 8).getContext("2d");
  const px = cap * ppm * 1.38;
  probe.font = `${weight} ${px}px ${font}`;
  const spacing = kind === "engraved" ? 0.08 * px : 0.04 * px;
  const lw = lines.map((l) => probe.measureText(l).width + spacing * Math.max(0, l.length - 1));
  const lineH = cap * 1.65;
  const w = Math.max(...lw) / ppm + 2 * pad[0], h = lines.length * lineH - (lineH - cap) + 2 * pad[1] + cap * 0.25;
  const cw = Math.ceil(w * ppm), ch = Math.ceil(h * ppm);
  const c = makeCanvas(cw, ch), x = c.getContext("2d");
  const m = makeCanvas(cw, ch), mx = m.getContext("2d");
  const R = rng(seed);
  if (kind === "engraved") {
    x.fillStyle = metal; x.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${R.chance(0.5) ? "255,240,200" : "90,60,20"},${R.range(0.03, 0.09)})`; x.fillRect(R.range(-50, cw), R.range(0, ch), R.range(40, 260), 1); }
    mx.fillStyle = "rgb(0,80,255)"; mx.fillRect(0, 0, cw, ch);
    x.strokeStyle = "rgba(60,40,15,0.9)"; x.lineWidth = 0.012 * ppm;
    x.strokeRect(0.07 * ppm, 0.07 * ppm, cw - 0.14 * ppm, ch - 0.14 * ppm);
    mx.strokeStyle = "rgb(0,200,0)"; mx.lineWidth = 0.012 * ppm; mx.strokeRect(0.07 * ppm, 0.07 * ppm, cw - 0.14 * ppm, ch - 0.14 * ppm);
  } else {
    const wt = woodTexture({ size: 512, boards: 1, seed: 60 + seed, grainFreq: 6, contrast: 0.3, dark: "#c9a877", mid: "#e2c79a", light: "#f0dcb4", seam: "#e2c79a", ...o.wood });
    x.drawImage(wt.image, 0, 0, cw, ch);
    x.strokeStyle = "rgba(43,26,16,0.85)"; x.lineWidth = 0.02 * ppm;
    x.strokeRect(0.08 * ppm, 0.08 * ppm, cw - 0.16 * ppm, ch - 0.16 * ppm);
  }
  const draw = (ctx, style, dx = 0, dy = 0) => {
    ctx.font = `${weight} ${px}px ${font}`;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillStyle = style;
    lines.forEach((l, i) => ctx.fillText(l, (cw - lw[i]) / 2 + dx, pad[1] * ppm + cap * 1.12 * ppm + i * lineH * ppm + dy));
  };
  if (kind === "engraved") {
    // bevel glint offset: fixed 6 mm by default (unchanged); glintScale (pass 6, opt-in) = offset as a fraction of cap
    // height, so small lettering does not read doubled (0.03 x the default cap .2 = the same 6 mm)
    const go = o.glintScale != null ? o.glintScale * cap : 0.006;
    draw(x, "rgba(255,236,190,0.9)", go * ppm, go * ppm);
    draw(x, ink);
    x.lineWidth = px * 0.03; x.strokeStyle = ink;
    lines.forEach((l, i) => x.strokeText(l, (cw - lw[i]) / 2, pad[1] * ppm + cap * 1.12 * ppm + i * lineH * ppm));
    draw(mx, "rgb(0,230,0)");
  } else {
    const inkC = makeCanvas(cw, ch), ix = inkC.getContext("2d");
    draw(ix, "rgba(43,26,16,0.94)");
    ix.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 3200; i++) { ix.fillStyle = `rgba(0,0,0,${R.range(0.3, 0.8)})`; ix.fillRect(R.range(0, cw), R.range(0, ch), R.range(1, 4), R.range(1, 3)); }
    x.drawImage(inkC, 0, 0);
  }
  return { canvas: c, rm: kind === "engraved" ? m : null, w, h };
}

/**
 * digitDrumTexture({ font = '"DIN Condensed", sans-serif', ink = "#1d130b", paper = "#f1e6cc" }) -> CanvasTexture: digits 0-9
 * side by side, rotated, for an odometer drum (CylinderGeometry rotated z = -PI/2; set drum.rotation.x =
 * -2 PI (value + .5) / 10 with values from schedule.odometerValues). (marble-run counter)
 */
export function digitDrumTexture({ font = '"DIN Condensed", sans-serif', ink = "#1d130b", paper = "#f1e6cc" } = {}) {
  const cw = 1280, ch = 200, c = makeCanvas(cw, ch), x = c.getContext("2d");
  x.fillStyle = paper; x.fillRect(0, 0, cw, ch);
  x.fillStyle = ink;
  x.font = `700 118px ${font}`;
  x.textAlign = "center"; x.textBaseline = "middle";
  for (let d = 0; d < 10; d++) {
    x.save();
    x.translate((d + 0.5) * (cw / 10), ch / 2);
    x.rotate(-Math.PI / 2);
    x.fillText(String(d), 0, 6);
    x.restore();
  }
  return canvasTexture(c);
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 4, origami)
/**
 * chiyogamiCanvas({ pattern: "seigaiha"|"shippo"|"kanoko"|"asanoha", ground, ink, accent, px = 256, seed })
 * -> seamless tile canvas (repeat it `tiles` times per sheet). Fine hash grain is printed in.
 */
export function chiyogamiCanvas(o = {}) {
  const { pattern = "seigaiha", ground = "#d4472f", ink = "#f5ead2", accent = "#e2b45e", px = 256, seed = 3 } = o;
  const R = px / 2;
  let W = px, H = px;
  if (pattern === "seigaiha") { W = 2 * R; H = R; }
  if (pattern === "asanoha") { W = px; H = Math.round(px * Math.sqrt(3)); }
  const c = makeCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = ground; x.fillRect(0, 0, W, H);
  if (pattern === "seigaiha") {
    const rings = 5;
    for (let k = -3; k <= 4; k++) {
      const y = (k * R) / 2, off = ((k % 2) + 2) % 2 ? R : 0;
      for (let i = -2; i <= 3; i++) {
        const cx = i * 2 * R + off;
        x.beginPath(); x.arc(cx, y, R * 0.995, 0, Math.PI * 2); x.fillStyle = ground; x.fill();
        x.lineWidth = (R / rings) * 0.36; x.strokeStyle = ink;
        for (let r = 0; r < rings; r++) { x.beginPath(); x.arc(cx, y, R * (1 - (r + 0.45) / rings), 0, Math.PI * 2); x.stroke(); }
        x.beginPath(); x.arc(cx, y, R * 0.11, 0, Math.PI * 2); x.fillStyle = accent; x.fill();
      }
    }
  } else if (pattern === "shippo") {
    const s = W, r = s / Math.SQRT2;
    x.lineWidth = s * 0.035; x.strokeStyle = ink;
    for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) for (const [dx, dy] of [[0, 0], [0.5, 0.5]]) {
      x.beginPath(); x.arc((i + dx) * s, (j + dy) * s, r / 2 * 1.0, 0, Math.PI * 2); x.stroke();
    }
    x.fillStyle = accent;
    for (const [px0, py0] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) { x.beginPath(); x.arc(px0, py0, s * 0.06, 0, Math.PI * 2); x.fill(); }
  } else if (pattern === "kanoko") {
    const s = W / 2;
    for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) {
      const cx = i * s + ((j % 2 + 2) % 2 ? s / 2 : 0), cy = j * s;
      x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
      x.fillStyle = ink; x.fillRect(-s * 0.26, -s * 0.26, s * 0.52, s * 0.52);
      x.fillStyle = accent; x.fillRect(-s * 0.08, -s * 0.08, s * 0.16, s * 0.16);
      x.restore();
    }
  } else if (pattern === "asanoha") {
    const s = W, h = (s * Math.sqrt(3)) / 2;
    x.lineWidth = s * 0.022; x.strokeStyle = ink; x.lineCap = "round";
    const line = (a, b) => { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
    for (let j = -1; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const ox = i * s + (j % 2 ? s / 2 : 0), oy = j * h;
      const tris = [[[ox, oy], [ox + s, oy], [ox + s / 2, oy + h]], [[ox + s / 2, oy + h], [ox + s, oy], [ox + 1.5 * s, oy + h]]];
      for (const T of tris) {
        const cc = [(T[0][0] + T[1][0] + T[2][0]) / 3, (T[0][1] + T[1][1] + T[2][1]) / 3];
        for (let e = 0; e < 3; e++) { line(T[e], T[(e + 1) % 3]); line(T[e], cc); }
      }
    }
  }
  // fine print grain (seeded)
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < W * H; i++) {
    const g = (hash01(i % W, (i / W) | 0, seed) - 0.5) * 14;
    d[i * 4] = clamp(d[i * 4] + g, 0, 255); d[i * 4 + 1] = clamp(d[i * 4 + 1] + g, 0, 255); d[i * 4 + 2] = clamp(d[i * 4 + 2] + g, 0, 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}

