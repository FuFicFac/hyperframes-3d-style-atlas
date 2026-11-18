// styles/newspaper-press/style.js — "Newspaper Press": a broadsheet front page as a physical object.
// Each sheet is baked ONCE at load into one RGBA data texture (R = black ink, G = photo tone, B = the other side's
// print, mirrored, A = photo mask); a newsprint shader does the rest from a few uniforms: the live ink pass (uHead),
// halftone dots computed per pixel from the tone (uDevelop grows them), show-through (B at a blurred mip), fold
// creases and edge yellowing. Nothing is redrawn per frame, so seeking is free and deterministic. The sheet mesh is
// rewritten from t only when it turns (pure deformation) — props never animate themselves; the scene calls
// sheet.userData.setInk / setDevelop / setTurn / setSpin, roller.userData.set, pencil.userData.update.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { makeCanvas, paintPixels, fbm2, softRectTexture, canvasTexture } from "../../kit/textures.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, clamp, smoothstep, hash01 } from "../../kit/time.js";
import { noise3 } from "../../kit/noise.js";
import * as PRESS from "./press.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const { layoutPage, cardLayout, photoFn } = PRESS;

// ------------------------------------------------------------------------------------------------ greeked copy
const LETTERS = "eeeeeeeeeeeettttttttaaaaaaaaooooooiiiiiiinnnnnnnssssssshhhhhrrrrrrddddlllllcccuuummmwwffggyyppbbvk";
const WLEN = [1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 10, 11];
function greekWord(r, cap = false) {
  const n = r.pick(WLEN);
  let w = "";
  for (let i = 0; i < n; i++) w += LETTERS[r.int(0, LETTERS.length - 1)];
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

// ------------------------------------------------------------------------------------------------ painter + bake
/**
 * bakeSheet(layout, S, { ppm }) -> { texture, W, H, Wp, Hp }
 * Paints the layout once into canvases and packs one RGBA DataTexture (see file header for channels).
 */
export function bakeSheet(layout, S, o = {}) {
  const { W, H } = layout, ppm = o.ppm ?? S.page.ppm, F = S.fonts;
  const Wp = Math.round(W * ppm), Hp = Math.round(H * ppm);
  // willReadFrequently pins both bake canvases to Skia's CPU rasterizer. With GPU raster (HyperFrames runs Chrome with
  // --enable-gpu-rasterization) the large masthead glyphs came out ±1–2 alpha levels different on each page load, so the
  // baked ink channel — and the masthead/headline pixels of every frame — changed between loads (not between seeks).
  const cv = makeCanvas(Wp, Hp), ctx = cv.getContext("2d", { willReadFrequently: true });
  const X = (x) => (x + W / 2) * ppm, Y = (y) => (H / 2 - y) * ppm;
  const fam = (k) => F[k] ?? F.body;
  ctx.fillStyle = "#000"; ctx.strokeStyle = "#000"; ctx.lineCap = "butt"; ctx.textBaseline = "alphabetic";
  const R = rng(`sheet:${layout.seed}`);
  const font = (it, em) => `${it.italic ? "italic " : ""}${it.weight ?? 400} ${em.toFixed(2)}px ${fam(it.font ?? "body")}`;

  function drawText(it) {
    const em = it.em * ppm;
    ctx.font = font(it, em);
    const nat = ctx.measureText(it.text).width || 1;
    const tw = (it.rect[2] - it.rect[0]) * ppm;
    let s = tw / nat;
    s = it.fit === "fill" ? clamp(s, F.fitRange[0], F.fitRange[1]) : Math.min(1, s);
    const w = nat * s;
    const x0 = it.align === "left" ? X(it.rect[0]) : it.align === "right" ? X(it.rect[2]) - w : (X(it.rect[0]) + X(it.rect[2])) / 2 - w / 2;
    ctx.save();
    ctx.translate(x0, Y(it.rect[1]));
    ctx.scale(s, 1);
    ctx.fillText(it.text, 0, 0);
    ctx.restore();
  }
  function drawBody(it) {
    const r = rng(`body:${it.seed}`);
    const em = it.em * ppm, pitch = it.pitch * ppm;
    ctx.font = font({ italic: it.italic, weight: 400, font: "body" }, em);
    const x0 = X(it.rect[0]), x1 = X(it.rect[2]), top = Y(it.rect[3]), bot = Y(it.rect[1]);
    const space = ctx.measureText(" ").width;
    let y = top + pitch * 0.8, para = 0, inPara = 0, sentenceStart = true;
    const nLines = Math.floor((bot - top) / pitch);
    for (let li = 0; li < nLines; li++, y += pitch) {
      if (inPara === 0) para = r.int(3, 9);
      const first = inPara === 0, last = inPara === para - 1 || li === nLines - 1;
      const ind = first && (it.indent || li > 0) ? em * 1.1 : 0;
      const avail = x1 - x0 - ind;
      const words = [], widths = [];
      let sum = 0;
      for (;;) {
        let w = greekWord(r, sentenceStart);
        sentenceStart = false;
        if (r.chance(0.09)) { w += "."; sentenceStart = true; } else if (r.chance(0.06)) w += ",";
        const ww = ctx.measureText(w).width;
        if (sum + ww + words.length * space * 0.85 > avail) break;
        words.push(w); widths.push(ww); sum += ww;
      }
      if (!words.length) continue;
      const lastW = last && !it.ragged ? Math.max(1, Math.floor(words.length * r.range(0.35, 0.85))) : words.length;
      const n = lastW;
      const used = widths.slice(0, n).reduce((a, b) => a + b, 0);
      const gap = it.ragged || last || n < 2 ? space : clamp((avail - used) / (n - 1), space * 0.6, space * 2.2);
      let x = x0 + ind;
      for (let k = 0; k < n; k++) { ctx.fillText(words[k], x, y); x += widths[k] + gap; }
      if (last) { inPara = 0; sentenceStart = true; } else inPara++;
    }
  }
  function drawGreekHead(it) {
    const r = rng(`gh:${it.seed}`);
    const em = it.em * ppm;
    ctx.font = font({ weight: F.headlineWeight, font: "headline" }, em);
    const w = (it.rect[2] - it.rect[0]) * ppm;
    for (let l = 0; l < it.lines; l++) {
      let s = "";
      while (s.length < 22 + l * 4) s += (s ? " " : "") + greekWord(r, true);
      const nat = ctx.measureText(s).width, k = Math.min(1, (w * (l === it.lines - 1 ? 0.8 : 1)) / nat);
      ctx.save();
      ctx.translate(X(it.rect[0]), Y(it.rect[3]) + em * (0.78 + l * 1.02));
      ctx.scale(k, 1);
      ctx.fillText(s, 0, 0);
      ctx.restore();
    }
  }
  const photos = [];
  for (const it of layout.items) {
    if (it.kind === "text") drawText(it);
    else if (it.kind === "body") drawBody(it);
    else if (it.kind === "greekHead") drawGreekHead(it);
    else if (it.kind === "rule") {
      ctx.lineWidth = Math.max(1, it.w * ppm);
      ctx.beginPath(); ctx.moveTo(X(it.a[0]), Y(it.a[1])); ctx.lineTo(X(it.b[0]), Y(it.b[1])); ctx.stroke();
    } else if (it.kind === "box") {
      ctx.lineWidth = Math.max(1, it.w * ppm);
      ctx.strokeRect(X(it.rect[0]), Y(it.rect[3]), (it.rect[2] - it.rect[0]) * ppm, (it.rect[3] - it.rect[1]) * ppm);
    } else if (it.kind === "photo") {
      photos.push(it);
      if (it.keyline) { ctx.lineWidth = Math.max(1, it.keyline * ppm); ctx.strokeRect(X(it.rect[0]), Y(it.rect[3]), (it.rect[2] - it.rect[0]) * ppm, (it.rect[3] - it.rect[1]) * ppm); }
    }
  }

  // ---- the other side of the sheet (half resolution, mirrored left-right so it reads correctly from behind)
  const Wb = Math.ceil(Wp / 2), Hb = Math.ceil(Hp / 2), bp = ppm / 2;
  const bcv = makeCanvas(Wb, Hb), b = bcv.getContext("2d", { willReadFrequently: true });
  if (o.back !== false) {
    const r = rng(`back:${layout.seed}`), m = S.page.margin * bp;
    b.translate(Wb, 0); b.scale(-1, 1);
    b.fillStyle = "rgba(0,0,0,0.9)";
    b.fillRect(m, m, Wb - 2 * m, 0.012 * bp);                                     // section flag
    b.fillRect(m, m + 0.02 * bp, (Wb - 2 * m) * r.range(0.6, 0.9), 0.03 * bp);    // a headline
    const cols = S.page.cols, cw = (Wb - 2 * m) / cols;
    const ph = { c: r.int(0, 2), n: r.int(2, 3), y: r.range(0.1, 0.25) * Hb, h: r.range(0.15, 0.22) * Hb };
    for (let c = 0; c < cols; c++) {
      for (let y = m + 0.07 * bp; y < Hb - m; y += S.page.linePitch * bp) {
        const inPh = c >= ph.c && c < ph.c + ph.n && y > ph.y && y < ph.y + ph.h;
        if (inPh) continue;
        b.fillStyle = `rgba(0,0,0,${0.55 + 0.25 * r.next()})`;
        b.fillRect(m + c * cw + 2, y, cw * (r.chance(0.12) ? r.range(0.3, 0.8) : 1) - 6, Math.max(1, S.page.bodyEm * 0.45 * bp));
      }
    }
    b.fillStyle = "rgba(0,0,0,0.6)";
    b.fillRect(m + ph.c * cw + 2, ph.y, ph.n * cw - 6, ph.h);
  }

  // ---- pack
  const ink = ctx.getImageData(0, 0, Wp, Hp).data, bk = b.getImageData(0, 0, Wb, Hb).data;
  const data = new Uint8Array(Wp * Hp * 4);
  for (let y = 0; y < Hp; y++) {
    const ty = Hp - 1 - y, by = (y >> 1) * Wb;
    for (let x = 0; x < Wp; x++) {
      const i = (y * Wp + x) * 4, o4 = (ty * Wp + x) * 4;
      data[o4] = ink[i + 3];
      data[o4 + 2] = bk[(by + (x >> 1)) * 4 + 3];
    }
  }
  for (const it of photos) {
    const f = photoFn(it.photo);
    const x0 = Math.round(X(it.rect[0])), x1 = Math.round(X(it.rect[2])), y0 = Math.round(Y(it.rect[3])), y1 = Math.round(Y(it.rect[1]));
    const a = (x1 - x0) / (y1 - y0);
    for (let y = y0; y < y1; y++) {
      const v = 1 - (y + 0.5 - y0) / (y1 - y0), ty = Hp - 1 - y;
      for (let x = x0; x < x1; x++) {
        const o4 = (ty * Wp + x) * 4;
        data[o4 + 1] = Math.round(255 * clamp(f((x + 0.5 - x0) / (x1 - x0), v, a)));
        data[o4 + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, Wp, Hp, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return { texture: tex, W, H, Wp, Hp };
}

// ------------------------------------------------------------------------------------------------ newsprint shader
const SHEET_VERT_HEAD = `#include <common>
varying vec2 vPageUv;`;
const SHEET_FRAG_HEAD = `#include <common>
varying vec2 vPageUv;
uniform sampler2D inkMap; uniform vec2 pageSize;
uniform float uHead, uHeadSoft, uDevelop, uDevFloor, uPitch, uAngle; uniform vec2 uFlat;
uniform vec3 inkColor; uniform float inkDensity, inkRough, showThrough, showBias;
uniform float foldV, foldDark, foldWidth, qFoldDark, uWet, uWetBand, uWetRough, edgeDark;
float nkK = 0.0; float nkWet = 0.0;`;
const SHEET_FRAG_BODY = `#include <map_fragment>
{
  vec4 ink = texture2D(inkMap, vPageUv);
  vec2 pm = vPageUv * pageSize;
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 q = vec2(ca * pm.x - sa * pm.y, sa * pm.x + ca * pm.y) / uPitch;
  float spot = 0.5 - 0.25 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  float aw = fwidth(spot) * 0.75 + 1e-4;
  float cellPx = 1.0 / max(max(fwidth(q.x), fwidth(q.y)), 1e-5);
  float printed = smoothstep(uHead, uHead + uHeadSoft, vPageUv.y);
  float k = 0.0;
  if (gl_FrontFacing) {
    float tone = clamp(ink.g * mix(uDevFloor, 1.0, uDevelop), 0.0, 1.0);
    float dotC = (1.0 - smoothstep(tone - aw, tone + aw, spot)) * smoothstep(0.0, 0.025, tone);
    dotC = mix(tone, dotC, smoothstep(uFlat.x, uFlat.y, cellPx));
    k = (1.0 - (1.0 - ink.r) * (1.0 - dotC * ink.a)) * printed;
    float back = texture2D(inkMap, vPageUv, showBias).b;
    diffuseColor.rgb *= 1.0 - showThrough * back;
    nkWet = (1.0 - smoothstep(0.0, uWetBand, vPageUv.y - uHead)) * k * uWet;
  } else {
    k = ink.b * 0.62;
    float thru = texture2D(inkMap, vPageUv, showBias).r;
    diffuseColor.rgb *= 1.0 - showThrough * thru;
  }
  float dy = (vPageUv.y - foldV) * pageSize.y, dx = (vPageUv.x - 0.5) * pageSize.x;
  float crease = foldDark * exp(-dy * dy / (foldWidth * foldWidth)) + qFoldDark * exp(-dx * dx / (foldWidth * foldWidth * 2.0));
  float e = min(min(pm.x, pageSize.x - pm.x), min(pm.y, pageSize.y - pm.y));
  diffuseColor.rgb *= (1.0 - crease) * (1.0 - edgeDark * (1.0 - smoothstep(0.0, 0.006, e)));
  nkK = k;
  diffuseColor.rgb = mix(diffuseColor.rgb, inkColor, k * inkDensity);
}`;

// ------------------------------------------------------------------------------------------------ grease shader
const WAX_NOISE = `
float npH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float npV(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(npH(i), npH(i + vec2(1.0, 0.0)), u.x), mix(npH(i + vec2(0.0, 1.0)), npH(i + vec2(1.0, 1.0)), u.x), u.y); }`;

/**
 * createStyle(stage, opts?) -> style
 *   props: frontPage(content, o), halftoneImage(o), pullQuoteCard(o), inkRoller(o), greasePencil(path, o), paperStack(o),
 *          desk(o), label(text, o)
 *   helpers: bakeSheet, inkPass(sheet, roller), spinIn(sheet, pivot), layoutPage, cardLayout, photoFn
 *   plan / motion: the press.js planner
 */
export function createStyle(stage, opts = {}) {
  const S = STYLE_SPEC, P = S.palette, PG = S.page;
  const { materials, lights, post } = applyStyleSpec(stage, S, opts);
  const textStyle = { font: FONTS[S.text.font] ?? S.text.font, weight: S.text.weight, color: S.text.color, height: S.text.height };
  stage.renderer.shadowMap.enabled = true;
  const maxAniso = stage.renderer.capabilities.getMaxAnisotropy?.() ?? 8;

  // ---- shared textures
  const paperCache = new Map();
  function paperMap(W, H) {
    const k = `${W.toFixed(4)}x${H.toFixed(4)}`;
    if (!paperCache.has(k)) {
      const t = newsprintTexture(W, H);
      t.anisotropy = Math.min(8, maxAniso);
      paperCache.set(k, t);
    }
    return paperCache.get(k);
  }
  // isotropic newsprint: soft cloudy formation + short fibres + fine grain (tileable)
  function newsprintTexture(W, H) {
    const b = new THREE.Color(S.paper.base), r0 = toSrgb(b.r), g0 = toSrgb(b.g), b0 = toSrgb(b.b), sd = S.paper.seed;
    const cv = paintPixels(512, (u, v, x, y) => {
      const blot = fbm2(u * 5, v * 5, { seed: sd, octaves: 4, period: 5 }) - 0.5;
      const fine = fbm2(u * 48, v * 48, { seed: sd + 3, octaves: 2, period: 48 }) - 0.5;
      const fib = Math.max(0, fbm2(u * 160, v * 40, { seed: sd + 7, octaves: 1, period: 160 }) - 0.62) + Math.max(0, fbm2(u * 40, v * 160, { seed: sd + 9, octaves: 1, period: 40 }) - 0.62);
      const gr = hash01(x, y, sd) - 0.5;
      const d = blot * S.paper.fiber * 1.3 + fine * S.paper.fiber * 0.7 - fib * S.paper.fiber * 1.2 + gr * S.paper.grain;
      return [r0 + d, g0 + d, b0 + d * 1.2];
    });
    return canvasTexture(cv, { srgb: true, repeat: [W / S.paper.tile, H / S.paper.tile] });
  }
  const shadowTex = softRectTexture({ soft: 0.28, radius: 0.04 });

  // rest shape of a sheet: fold tent + gentle undulation + corners lifting (same for every sheet of a size,
  // so stacked sheets keep a constant gap)
  function restZ(x, y, W, H) {
    let z = PG.ridge * Math.exp(-((y - PG.foldY) ** 2) / (PG.ridgeWidth ** 2)) + 0.35 * PG.ridge * Math.exp(-(x * x) / (PG.ridgeWidth ** 2));
    z += PG.waviness * (noise3(x * 5, y * 5, 0.5, PG.seed) - 0.5) * 2;
    for (const [cx, cy] of [[-W / 2, H / 2], [W / 2, H / 2], [-W / 2, -H / 2], [W / 2, -H / 2]]) {
      const d = Math.hypot(x - cx, y - cy);
      z += PG.cornerLift * Math.max(0, 1 - d / 0.1) ** 2;
    }
    return z + PG.waviness + 0.0002;
  }

  function sheetMaterial(tex, W, H) {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", map: paperMap(W, H), roughness: S.ink.roughness, metalness: 0, side: THREE.DoubleSide });
    m.name = "newsprint";
    const U = {
      inkMap: { value: tex }, pageSize: { value: new THREE.Vector2(W, H) },
      uHead: { value: -1 }, uHeadSoft: { value: S.ink.headSoft }, uDevelop: { value: 1 }, uDevFloor: { value: S.halftone.developFloor },
      uPitch: { value: S.halftone.pitch }, uAngle: { value: S.halftone.angle }, uFlat: { value: new THREE.Vector2(...S.halftone.flatBelowPx) },
      inkColor: { value: new THREE.Color(S.ink.color) }, inkDensity: { value: S.ink.density }, inkRough: { value: S.ink.roughness },
      showThrough: { value: S.paper.showThrough }, showBias: { value: S.paper.showBias },
      foldV: { value: PG.foldY / H + 0.5 }, foldDark: { value: S.paper.foldDark }, foldWidth: { value: S.paper.foldWidth }, qFoldDark: { value: S.paper.quarterFoldDark },
      uWet: { value: S.ink.wet }, uWetBand: { value: S.ink.wetBand }, uWetRough: { value: S.ink.wetRough }, edgeDark: { value: 0.07 },
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", SHEET_VERT_HEAD).replace("#include <uv_vertex>", "#include <uv_vertex>\nvPageUv = uv;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", SHEET_FRAG_HEAD)
        .replace("#include <map_fragment>", SHEET_FRAG_BODY)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, inkRough, nkK);\nroughnessFactor = mix(roughnessFactor, uWetRough, nkWet);");
    };
    m.customProgramCacheKey = () => "newspaper-sheet";
    m.userData.uniforms = U;
    return m;
  }

  /**
   * printedSheet(layout, { ppm, back, segments }) -> Group (world placement)
   *   userData: layout, rects, uniforms, local (page frame: x right, y up the page, z = up from the paper; attach props here),
   *   setInk(head v), setDevelop(u), setTurn(u), setSpin(pose, pivot=[px,py]), setShadow(level), surfaceAt(x, y), toLocal(x, y, lift)
   */
  function printedSheet(layout, o = {}) {
    const { W, H } = layout;
    const baked = bakeSheet(layout, S, o);
    const mat = sheetMaterial(baked.texture, W, H);
    const [nx, ny] = o.segments ?? PG.segments;
    const geo = new THREE.PlaneGeometry(W, H, nx, ny);
    const pos = geo.attributes.position;
    const flat = Float32Array.from(pos.array);
    const rest = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) rest[i] = restZ(flat[i * 3], flat[i * 3 + 1], W, H);
    const T = S.turn;
    let lastTurn = null;
    function shape(u) {
      if (u === lastTurn) return;
      lastTurn = u;
      const th = Math.PI * u, kap = T.bend * Math.sin(Math.PI * u), ds = W / nx;
      for (let iy = 0; iy <= ny; iy++) {
        const row = iy * (nx + 1), y = flat[row * 3 + 1], yn = y / (H / 2);
        let X = -W / 2, Z = 0;
        for (let ix = 0; ix <= nx; ix++) {
          if (ix > 0 && u > 0) {
            const sm = (ix - 0.5) * ds, a = th + kap * Math.pow(sm / W, 1.6) * (1 + T.cornerLead * yn);
            X += Math.cos(a) * ds; Z += Math.sin(a) * ds;
          } else if (ix > 0) X += ds;
          const i = row + ix;
          pos.array[i * 3] = X;
          pos.array[i * 3 + 1] = y;
          pos.array[i * 3 + 2] = Math.max(0, Z) + rest[i] + T.lift * Math.sin(Math.PI * u) * (ix / nx);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }
    shape(0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.name = "sheet";
    const local = new THREE.Group(); local.rotation.x = -Math.PI / 2; local.add(mesh);
    const unpivot = new THREE.Group(); unpivot.add(local);
    const spin = new THREE.Group(); spin.add(unpivot);
    const g = new THREE.Group(); g.add(spin);
    // soft drop shadow on whatever is below (desk level = sheet origin)
    const shm = new THREE.MeshBasicMaterial({ map: shadowTex, color: "#000000", transparent: true, opacity: 0.3, depthWrite: false });
    shm.name = "sheetShadow";
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.07, H * 1.05), shm);
    sh.rotation.x = -Math.PI / 2; sh.position.set(0.006, -0.0003, 0.008); sh.renderOrder = 1;
    g.add(sh);
    const U = mat.userData.uniforms;
    if (o.fold === false) { U.foldDark.value = 0; U.qFoldDark.value = 0; }
    const shadowBase = o.shadow ?? 0.3;
    Object.assign(g.userData, {
      layout, rects: layout.rects, uniforms: U, local, mesh, shadow: sh,
      setInk: (head) => { U.uHead.value = head; },
      setDevelop: (u) => { U.uDevelop.value = u; },
      setTurn: (u) => { shape(clamp(u)); mesh.castShadow = u > 0 && u < 1; sh.material.opacity = shadowBase * (1 - smoothstep(0, 0.25, u)); },
      setShadow: (k) => { sh.material.opacity = shadowBase * k; },
      setSpin: (p, pivot = [0, 0]) => {
        g.visible = p.visible;
        spin.position.set(pivot[0], p.lift ?? 0, -pivot[1]);
        unpivot.position.set(-pivot[0], 0, pivot[1]);
        spin.rotation.set(p.tiltX, p.angle, p.tiltZ, "YXZ");
        spin.scale.setScalar(p.scale);
        sh.scale.setScalar(p.scale);
        sh.position.set(pivot[0] * (1 - p.scale) + 0.006 + 0.05 * (1 - p.shadow), -0.0003, -pivot[1] * (1 - p.scale) + 0.008 + 0.04 * (1 - p.shadow));
        sh.material.opacity = shadowBase * p.shadow;
      },
      surfaceAt: (x, y) => restZ(x, y, W, H),
      toLocal: (x, y, lift = 0) => new THREE.Vector3(x, y, restZ(x, y, W, H) + lift),
    });
    return g;
  }

  // ---- props
  function frontPage(content = {}, o = {}) {
    const g = printedSheet(layoutPage(content, S), o);
    g.name = "frontPage";
    return g;
  }
  function halftoneImage(o = {}) { const g = printedSheet(cardLayout("halftone", o, S), { ppm: o.ppm ?? 4000, back: false, fold: false, segments: [12, 10], shadow: 0.35 }); g.name = "halftoneImage"; return g; }
  function pullQuoteCard(o = {}) { const g = printedSheet(cardLayout("pullQuote", o, S), { ppm: o.ppm ?? 4000, back: false, fold: false, segments: [12, 10], shadow: 0.35 }); g.name = "pullQuoteCard"; return g; }

  const rod = (a, b, r, mat, seg = 12) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
    m.position.copy(A).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  /** inkRoller(o) -> Group in PAGE-LOCAL coords (attach to sheet.userData.local). Origin = contact line centre.
   *  userData.set({ visible, y, lift, angle }) from press.rollerAt(t). */
  function inkRoller(o = {}) {
    const Rr = S.roller, r = o.r ?? Rr.r, len = o.len ?? Rr.len, hl = o.handle ?? Rr.handle;
    const g = new THREE.Group(); g.name = "inkRoller";
    const drum = new THREE.Group(); drum.position.z = r; g.add(drum);
    const rub = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 48, 1), materials.rubber);
    rub.rotation.z = Math.PI / 2; rub.castShadow = true; drum.add(rub);
    // a faint seam so the roll reads
    const seam = new THREE.Mesh(new THREE.BoxGeometry(len * 0.998, 0.0012, 0.0012), new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.5 }));
    seam.position.z = r; drum.add(seam);
    const ex = len / 2 + 0.012;
    g.add(rod([-len / 2 - 0.002, 0, r], [-ex, 0, r], 0.005, materials.steel), rod([len / 2 + 0.002, 0, r], [ex, 0, r], 0.005, materials.steel));
    const hy = -hl, hz = r + 0.055;
    g.add(rod([-ex, 0, r], [-0.05, hy, hz], 0.0042, materials.steel), rod([ex, 0, r], [0.05, hy, hz], 0.0042, materials.steel));
    g.add(rod([-0.055, hy, hz], [0.055, hy, hz], 0.0045, materials.steel));
    g.add(rod([0, hy, hz], [0, hy - 0.12, hz + 0.035], 0.012, materials.grip, 20));
    g.userData.set = (p) => { g.visible = p.visible; g.position.set(0, p.y, (o.surface ?? 0.0025) + p.lift); drum.rotation.x = -p.angle; };
    g.visible = false;
    return g;
  }

  /** greasePencil(path, o) -> Group in PAGE-LOCAL coords: a waxy red stroke along `path` (page metres) + a china marker.
   *  userData.update(drawn arc length, pencilPose). surfaceAt(x, y) lifts the stroke onto the sheet surface. */
  function greasePencil(path, o = {}) {
    const G = S.grease, hw = (o.width ?? G.width) / 2, surf = o.surfaceAt ?? (() => 0.002);
    const n = path.length, posA = new Float32Array(n * 2 * 3), sA = new Float32Array(n * 2), vA = new Float32Array(n * 2), idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      if (i > 0) s += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      for (let k = 0; k < 2; k++) {
        const side = k ? -1 : 1, j = i * 2 + k;
        const x = p[0] - ty * hw * 1.6 * side, y = p[1] + tx * hw * 1.6 * side;
        posA[j * 3] = x; posA[j * 3 + 1] = y; posA[j * 3 + 2] = surf(x, y) + 0.0007;
        sA[j] = s; vA[j] = side * 1.6;
      }
      if (i < n - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const len = s;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posA, 3));
    geo.setAttribute("aS", new THREE.BufferAttribute(sA, 1));
    geo.setAttribute("aV", new THREE.BufferAttribute(vA, 1));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 2 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: P.red, roughness: 0.5, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    mat.name = "greaseWax";
    const U = { uDrawn: { value: 0 }, uHalfW: { value: hw }, uLen: { value: len }, uWax: { value: G.wax } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aS; attribute float aV; varying float vS; varying float vV; varying vec2 vP;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvS = aS; vV = aV; vP = position.xy;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying float vS; varying float vV; varying vec2 vP; uniform float uDrawn, uHalfW, uLen, uWax;${WAX_NOISE}`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  float hv = abs(vV);
  float wS = 0.75 + 0.25 * smoothstep(0.0, 0.012, vS) * smoothstep(0.0, 0.01, uLen - vS);
  float n = npV(vP / 0.00032) * 0.55 + npV(vP / 0.0011) * 0.45;
  float edge = 1.0 - smoothstep(wS - 0.22, wS - 0.02, hv + (n - 0.5) * 0.35);
  float hd = vS - uDrawn;
  float cap = hd <= 0.0 ? 1.0 : 1.0 - smoothstep(0.8, 1.0, length(vec2(hd / (uHalfW * wS), hv / wS)));
  float cov = smoothstep(uWax - 0.3, uWax + 0.05, n + 0.3);
  diffuseColor.a *= edge * cap * cov;
  diffuseColor.rgb *= 0.85 + 0.25 * n;
  if (diffuseColor.a < 0.01) discard;
}`);
    };
    mat.customProgramCacheKey = () => "newspaper-grease";
    const stroke = new THREE.Mesh(geo, mat); stroke.renderOrder = 2; stroke.name = "greaseStroke";
    // the china marker: red paper wrapper + exposed wax tip, leaning back toward the lower right
    const pen = new THREE.Group(); pen.name = "chinaMarker";
    const dir = new THREE.Vector3(0.42, -0.5, 0.76).normalize();
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0016, 0.014, 20), materials.wax); tip.position.y = 0.007;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.12, 20), materials.wrapper); body.position.y = 0.014 + 0.06;
    const lineM = new THREE.Mesh(new THREE.CylinderGeometry(0.00585, 0.00585, 0.0015, 20), new THREE.MeshStandardMaterial({ color: "#6e1712", roughness: 0.8 }));
    const stripes = new THREE.Group(); stripes.add(tip, body);
    for (let k = 0; k < 6; k++) { const l = lineM.clone(); l.position.y = 0.03 + k * 0.016; stripes.add(l); }
    stripes.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    stripes.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pen.add(stripes);
    const g = new THREE.Group(); g.add(stroke, pen); g.name = "greasePencil";
    g.userData.len = len;
    g.userData.update = (drawn, pose) => {
      U.uDrawn.value = drawn;
      stroke.visible = drawn > 0;
      pen.visible = !!pose?.visible;
      if (pen.visible) pen.position.set(pose.x, pose.y, surf(pose.x, pose.y) + 0.0004 + pose.lift);
    };
    g.userData.update(0, null);
    return g;
  }

  // stack edge stripes: sheet edges seen side-on
  function edgeTexture(n, vertical) {
    const r = rng("edges"), N = 256;
    const cv = vertical ? makeCanvas(N, 4) : makeCanvas(4, N), c = cv.getContext("2d");
    for (let i = 0; i < N; i++) {
      const k = Math.floor((i / N) * n), sh = 0.86 + 0.1 * ((k * 7919) % 13) / 13, gap = (i / N) * n - k < 0.16;
      const L = Math.round(225 * (gap ? 0.62 : sh)), col = `rgb(${L},${Math.round(L * 0.96)},${Math.round(L * 0.86)})`;
      c.fillStyle = col;
      if (vertical) c.fillRect(i, 0, 1, 4); else c.fillRect(0, i, 4, 1);
    }
    r.next();
    const t = canvasTexture(cv, { srgb: true });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  /** paperStack({ sheets, thick, top: content, ppm }) -> Group (world placement on the desk). The top sheet is a frontPage.
   *  userData.top (the printed sheet), setDrop(press.dropPose(t)). */
  function paperStack(o = {}) {
    const K = S.stack, W = PG.W, H = PG.H, thick = o.thick ?? K.thick, n = o.sheets ?? K.sheets;
    const g = new THREE.Group(); g.name = "paperStack";
    const mover = new THREE.Group(); g.add(mover);
    const body = new THREE.Group(); mover.add(body);
    const eU = new THREE.MeshStandardMaterial({ map: edgeTexture(n / 3, true), roughness: 0.95 });
    const eV = new THREE.MeshStandardMaterial({ map: edgeTexture(n / 3, false), roughness: 0.95 });
    const face = new THREE.MeshStandardMaterial({ color: P.paperEdge, roughness: 0.95 });
    const r = rng("stack");
    for (let k = 0; k < 3; k++) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(W * 0.994, H * 0.994, thick / 3), [eU, eU, eV, eV, face, face]);
      blk.position.set(r.range(-0.003, 0.003), r.range(-0.003, 0.003), thick / 6 + (k * thick) / 3);
      blk.rotation.z = r.range(-0.012, 0.012);
      blk.castShadow = true; blk.receiveShadow = true;
      body.add(blk);
    }
    body.rotation.x = -Math.PI / 2;
    const top = frontPage(o.top ?? {}, { ppm: o.ppm, shadow: 0 });
    top.position.y = thick + 0.0002;
    top.userData.shadow.visible = false;
    mover.add(top);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.1, H * 1.08), new THREE.MeshBasicMaterial({ map: shadowTex, color: "#000000", transparent: true, opacity: 0, depthWrite: false }));
    sh.material.name = "stackShadow";
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1;
    g.add(sh);
    g.userData.top = top;
    g.userData.setDrop = (p) => {
      g.visible = p.visible;
      mover.position.set(p.dx, p.y, p.dz);
      mover.rotation.set(p.rx, 0, p.rz);
      sh.position.set(0.012 + p.dx * 0.5, 0.0003, 0.014 + p.dz * 0.5);
      sh.material.opacity = 0.42 * p.shadow;
      sh.scale.setScalar(1 + 0.25 * (1 - p.shadow));
    };
    return g;
  }

  /** desk({ w = 3.2, d = 2.2 }) -> the imposing table: dark grey steel-and-stone top with old ink smudges. */
  function desk(o = {}) {
    const w = o.w ?? 3.2, d = o.d ?? 2.2;
    const base = new THREE.Color(P.desk);
    const cv = paintPixels(1024, (u, v) => {
      const n = fbm2(u * 9, v * 9, { seed: 4, octaves: 5, period: 9 }) - 0.5;
      const sm = Math.max(0, fbm2(u * 3, v * 3, { seed: 8, octaves: 3, period: 3 }) - 0.55) * 2.4;
      const sc = fbm2(u * 90, v * 4, { seed: 12, octaves: 2, period: 90 }) - 0.5;
      const k = 1 + n * 0.32 + sc * 0.08 - sm * 0.3;
      return [toSrgb(base.r) * k, toSrgb(base.g) * k, toSrgb(base.b) * k * 1.02];
    });
    const map = canvasTexture(cv, { srgb: true, repeat: [w / 1.2, d / 1.2] });
    materials.desk.map = map; materials.desk.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), materials.desk);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "desk";
    return m;
  }

  // ---- helpers that tie plan -> props (call from renderAt)
  /** inkPass(sheet, roller) -> update(t, ink): sets the sheet's ink head and the roller pose from press.inkHead / rollerAt. */
  const inkPass = (sheet, roller) => (t, ink) => {
    sheet.userData.setInk(PRESS.inkHead(t, ink, S.ink.headSoft));
    if (roller) roller.userData.set(PRESS.rollerAt(t, ink, S));
  };
  /** spinIn(sheet, pivot) -> update(t, spin): applies press.spinPose about a page-coords pivot (the frame centre). */
  const spinIn = (sheet, pivot = [0, 0]) => (t, sp) => sheet.userData.setSpin(PRESS.spinPose(t, sp, S), pivot);

  const props = {
    frontPage, halftoneImage, pullQuoteCard, inkRoller, greasePencil, paperStack, desk,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }),
  };
  const factories = {
    desk: (o) => desk(o.dims ?? {}),
    frontPage: (o) => frontPage(o.dims?.content ?? {}, o.dims ?? {}),
    paperStack: (o) => paperStack(o.dims ?? {}),
    inkRoller: (o) => inkRoller(o.dims ?? {}),
    pullQuoteCard: (o) => pullQuoteCard(o.dims ?? {}),
    halftoneImage: (o) => halftoneImage(o.dims ?? {}),
  };
  return {
    spec: S, palette: P, materials, lights, post, textStyle, camera: S.camera, props, factories, sfx: S.sfx,
    plan: PRESS, motion: PRESS,
    helpers: { bakeSheet: (layout, o) => bakeSheet(layout, S, o), printedSheet, inkPass, spinIn, layoutPage: (c) => layoutPage(c, S), cardLayout: (k, c) => cardLayout(k, c, S), photoFn, restZ },
  };
}

function toSrgb(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
