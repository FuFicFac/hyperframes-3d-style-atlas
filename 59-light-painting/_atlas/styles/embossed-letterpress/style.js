// styles/embossed-letterpress/style.js — "Embossed Letterpress": one cotton sheet where every mark is relief.
// Per-layer height maps are rasterised ONCE at load (type + ornaments on a canvas, blurred for the press shoulder
// and again, wide, for the pillow) and packed one layer per channel. The sheet shader combines them with a 0..1
// press amount per layer, derives normals from the height gradient, marches the height field toward the raking
// key for the shadow inside each impression, mixes uneven spot ink / gold foil, and shades everything in the
// sheet's local frame. Time enters only through setters the scene calls from renderAt (press amounts, die pose,
// light direction, foil band) — nothing accumulates, height maps never change after load.
// Timing lives in ./pressplan.js (THREE-free; scene.config.js imports it for SCORE).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { rng, clamp, hash01, TAU } from "../../kit/time.js";
import { makeCanvas, fbm2 } from "../../kit/textures.js";
import * as plan from "./pressplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, plan };

const lin = (hex) => new THREE.Color(hex); // THREE.Color converts sRGB hex -> linear working space
const KINDS = ["deboss", "emboss", "ink", "foil"];

// ============================================================================ relief painter =================
/**
 * painter(ctx, W, H, ppm) -> h: draw in CARD METRES (origin at the card centre, y up). White = pressed.
 *   h.text(str, x, y, { size (em, m), font: "display"|"text"|"smallCaps"|css, weight, italic, align, tracking (em),
 *                       anchor: "baseline"|"cap" (cap = y is the cap-height centre) }) -> width (m)
 *   h.rule(x0, y0, x1, y1, w) · h.circle(x, y, r) · h.ring(x, y, r, w) · h.poly(pts, { w, closed, fill }) · h.diamond(x, y, rx, ry)
 */
export function painter(ctx, W, H, ppm, type = STYLE_SPEC.type) {
  const X = (x) => (x + W / 2) * ppm, Y = (y) => (H / 2 - y) * ppm;
  const fontOf = (f) => type[f] ?? FONTS[f] ?? f ?? type.display;
  const h = {
    X, Y, ppm, ctx,
    text(str, x, y, o = {}) {
      const size = o.size ?? 0.1, px = size * ppm;
      ctx.save();
      ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 400} ${px}px ${fontOf(o.font ?? "display")}`;
      ctx.letterSpacing = `${(o.tracking ?? 0) * px}px`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";
      const m = ctx.measureText(str);
      // letterSpacing adds trailing space after the last glyph: remove it from the width used for alignment
      const wpx = m.width - (o.tracking ?? 0) * px;
      const align = o.align ?? "center";
      const x0 = X(x) - (align === "center" ? wpx / 2 : align === "right" ? wpx : 0);
      const capH = m.actualBoundingBoxAscent ?? px * 0.7;
      const yb = o.anchor === "cap" ? Y(y) + capH / 2 : Y(y);
      ctx.fillText(str, x0, yb);
      ctx.restore();
      return wpx / ppm;
    },
    rule(x0, y0, x1, y1, w = 0.004) {
      ctx.save();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = w * ppm; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
      ctx.restore();
    },
    circle(x, y, r) {
      ctx.save(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(x), Y(y), r * ppm, 0, TAU); ctx.fill(); ctx.restore();
    },
    ring(x, y, r, w = 0.004) {
      ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = w * ppm; ctx.beginPath(); ctx.arc(X(x), Y(y), r * ppm, 0, TAU); ctx.stroke(); ctx.restore();
    },
    poly(pts, o = {}) {
      ctx.save();
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      if (o.closed || o.fill) ctx.closePath();
      if (o.fill) { ctx.fillStyle = "#fff"; ctx.fill(); }
      else { ctx.strokeStyle = "#fff"; ctx.lineWidth = (o.w ?? 0.003) * ppm; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); }
      ctx.restore();
    },
    diamond(x, y, rx, ry = rx) { h.poly([[x - rx, y], [x, y + ry], [x + rx, y], [x, y - ry]], { fill: true }); },
  };
  return h;
}

// ============================================================================ ornaments ======================
/** Classic stationery ornaments, drawn with a painter `h`. All sizes in card metres. Pure + seeded. */
export const ornaments = {
  /** border(h, { inset=.075, rules:[{ w, gap }], corner: { r, petals } | null }) — nested rules round the card */
  border(h, W, H, o = {}) {
    const inset = o.inset ?? 0.075;
    let d = inset;
    for (const r of o.rules ?? [{ w: 0.008, gap: 0 }, { w: 0.003, gap: 0.022 }]) {
      d += r.gap ?? 0;
      const x = W / 2 - d, y = H / 2 - d;
      h.poly([[-x, -y], [x, -y], [x, y], [-x, y]], { closed: true, w: r.w });
    }
    if (o.corner) {
      const x = W / 2 - inset - (o.corner.at ?? 0.011), y = H / 2 - inset - (o.corner.at ?? 0.011);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ornaments.rosette(h, sx * x, sy * y, o.corner.r ?? 0.05, o.corner);
    }
  },
  /** rosette(h, x, y, r, { lobes=12, loops=12, ratio=.36, w=.0012, hub }) — guilloche rosette: rotated epitrochoid strands */
  rosette(h, x, y, r, o = {}) {
    const lobes = o.lobes ?? 12, loops = o.loops ?? 12, k = o.ratio ?? 0.36, w = o.w ?? 0.0012;
    for (let j = 0; j < loops; j++) {
      const ph = (j / loops) * (TAU / lobes);       // each strand rotated by a fraction of one lobe -> woven mesh
      const pts = [];
      for (let i = 0; i <= 720; i++) {
        const a = (i / 720) * TAU;
        const rr = r * (1 - k + k * Math.cos(lobes * a));
        pts.push([x + Math.cos(a + ph) * rr, y + Math.sin(a + ph) * rr]);
      }
      h.poly(pts, { closed: true, w });
    }
    h.ring(x, y, r * 1.04, w * 1.4);
    if (o.hub !== false) { h.ring(x, y, r * 0.28, w * 1.6); h.circle(x, y, r * 0.1); }
  },
  /** guilloche(h, x0, x1, y, amp, { waves=18, strands=6, w=.0014 }) — interlaced sine band */
  guilloche(h, x0, x1, y, amp, o = {}) {
    const waves = o.waves ?? 18, strands = o.strands ?? 6, w = o.w ?? 0.0014;
    for (let s = 0; s < strands; s++) {
      const ph = (s / strands) * Math.PI;
      const pts = [];
      for (let i = 0; i <= 600; i++) {
        const u = i / 600, xx = x0 + (x1 - x0) * u;
        pts.push([xx, y + amp * Math.sin(u * waves * TAU + ph)]);
      }
      h.poly(pts, { w });
    }
    h.rule(x0, y + amp * 1.25, x1, y + amp * 1.25, w * 1.2);
    h.rule(x0, y - amp * 1.25, x1, y - amp * 1.25, w * 1.2);
  },
  /** seal(h, x, y, r, { letter="P", beads=36, font }) — monogram seal: rings, bead ring, a display-serif letter */
  seal(h, x, y, r, o = {}) {
    h.ring(x, y, r, r * 0.06);
    h.ring(x, y, r * 0.74, r * 0.03);
    const beads = o.beads ?? 36;
    for (let i = 0; i < beads; i++) {
      const a = (i / beads) * TAU;
      h.circle(x + Math.cos(a) * r * 0.87, y + Math.sin(a) * r * 0.87, r * 0.045);
    }
    if (o.letter) h.text(o.letter, x, y, { size: r * 1.05, font: o.font ?? "display", weight: o.weight ?? 400, italic: o.italic ?? true, anchor: "cap" });
  },
  /** fleuronRule(h, x0, x1, y, { w=.003, diamond=.018, gap=.03, dots=true }) — rule broken by a diamond fleuron */
  fleuronRule(h, x0, x1, y, o = {}) {
    const w = o.w ?? 0.003, d = o.diamond ?? 0.018, gap = o.gap ?? 0.03, cx = (x0 + x1) / 2;
    h.rule(x0, y, cx - d - gap, y, w);
    h.rule(cx + d + gap, y, x1, y, w);
    h.diamond(cx, y, d, d * 0.62);
    if (o.dots !== false) { h.circle(cx - d - gap * 0.5, y, w * 1.1); h.circle(cx + d + gap * 0.5, y, w * 1.1); }
  },
};

/**
 * drawItems(h, items, W, H) — plain-data layer content (JSON-safe, used by scene.config.js):
 *   { type: "text", text, x, y, size, font, weight, italic, tracking, align, anchor }
 *   { type: "rule", x0, y0, x1, y1, w } · { type: "fleuronRule", x0, x1, y, ... } · { type: "border", inset, rules, corner }
 *   { type: "rosette", x, y, r, ... } · { type: "guilloche", x0, x1, y, amp, ... } · { type: "seal", x, y, r, letter, ... }
 *   { type: "circle", x, y, r } · { type: "ring", x, y, r, w } · { type: "diamond", x, y, rx, ry }
 */
export function drawItems(h, items, W, H) {
  for (const it of items) {
    switch (it.type) {
      case "text": h.text(it.text, it.x ?? 0, it.y ?? 0, it); break;
      case "rule": h.rule(it.x0, it.y0, it.x1, it.y1 ?? it.y0, it.w); break;
      case "fleuronRule": ornaments.fleuronRule(h, it.x0, it.x1, it.y, it); break;
      case "border": ornaments.border(h, W, H, it); break;
      case "rosette": ornaments.rosette(h, it.x, it.y, it.r, it); break;
      case "guilloche": ornaments.guilloche(h, it.x0, it.x1, it.y, it.amp, it); break;
      case "seal": ornaments.seal(h, it.x, it.y, it.r, it); break;
      case "circle": h.circle(it.x, it.y, it.r); break;
      case "ring": h.ring(it.x, it.y, it.r, it.w); break;
      case "diamond": h.diamond(it.x, it.y, it.rx, it.ry); break;
      default: throw new Error(`embossed-letterpress drawItems: unknown item type "${it.type}"`);
    }
  }
}

// ============================================================================ textures =======================
/**
 * bakeRelief(layers, { width, height, pxPerMetre, shoulder, pillowRadius, wideDownsample, maxLayers })
 *   -> { sharp:[DataTexture, DataTexture], wide:[DataTexture, DataTexture], size:[w,h], bbox:[{x0,y0,x1,y1}] }
 *   Each layer i is drawn white-on-black, blurred by `shoulder` (the press shoulder) into channel i%4 of sharp[i>>2],
 *   and blurred by `pillowRadius` at 1/wideDownsample resolution into wide[i>>2]. Done once; never per frame.
 */
export function bakeRelief(layers, o = {}) {
  const S = { ...STYLE_SPEC.sheet, ...o };
  if (layers.length > S.maxLayers) throw new Error(`embossed-letterpress: at most ${S.maxLayers} relief layers (got ${layers.length})`);
  const ppm = S.pxPerMetre, Wp = Math.round(S.width * ppm), Hp = Math.round(S.height * ppm);
  const ds = S.wideDownsample, Ww = Math.ceil(Wp / ds), Hw = Math.ceil(Hp / ds);
  const mask = makeCanvas(Wp, Hp), mctx = mask.getContext("2d");
  const blur = makeCanvas(Wp, Hp), bctx = blur.getContext("2d", { willReadFrequently: true });
  const wide = makeCanvas(Ww, Hw), wctx = wide.getContext("2d", { willReadFrequently: true });
  const nTex = Math.ceil(S.maxLayers / 4);
  const sharpData = Array.from({ length: nTex }, () => new Uint8Array(Wp * Hp * 4));
  const wideData = Array.from({ length: nTex }, () => new Uint8Array(Ww * Hw * 4));
  layers.forEach((L, i) => {
    mctx.reset();
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, Wp, Hp);
    const h = painter(mctx, S.width, S.height, ppm);
    if (L.draw) L.draw(h, ornaments);
    if (L.items) drawItems(h, L.items, S.width, S.height);
    for (const [ctx, cw, ch, r, out, n] of [[bctx, Wp, Hp, S.shoulder * ppm, sharpData, Wp * Hp], [wctx, Ww, Hw, (S.pillowRadius * ppm) / ds, wideData, Ww * Hw]]) {
      ctx.reset();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      ctx.filter = `blur(${r.toFixed(3)}px)`;
      ctx.drawImage(mask, 0, 0, cw, ch);
      ctx.filter = "none";
      const src = ctx.getImageData(0, 0, cw, ch).data, dst = out[i >> 2], c = i & 3;
      for (let p = 0; p < n; p++) dst[p * 4 + c] = src[p * 4];
    }
  });
  const tex = (data, w, hh) => {
    const t = new THREE.DataTexture(data, w, hh, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { sharp: sharpData.map((d) => tex(d, Wp, Hp)), wide: wideData.map((d) => tex(d, Ww, Hw)), size: [Wp, Hp] };
}

/**
 * fibreTexture({ size, seed, fibres }) -> RepeatWrapping texture (linear data):
 *   R = cotton albedo variation (cloudy formation + short fibres), G = fibre height, B = slow mottle (ink density,
 *   deckle edge). Tileable; static (texture, not per-frame grain).
 */
export function fibreTexture(o = {}) {
  const F = { ...STYLE_SPEC.fibre, ...o }, N = F.size, R = rng(F.seed);
  const c = makeCanvas(N, N), ctx = c.getContext("2d");
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const cloud = fbm2(u * 5, v * 5, { seed: F.seed, octaves: 4, period: 5 });
    const fine = fbm2(u * 64, v * 64, { seed: F.seed + 3, octaves: 2, period: 64 });
    const mott = fbm2(u * 9, v * 9, { seed: F.seed + 7, octaves: 3, period: 9 });
    const i = (y * N + x) * 4;
    img.data[i] = clamp(0.5 + (cloud - 0.5) * 0.9 + (hash01(x, y, F.seed) - 0.5) * 0.08) * 255;
    img.data[i + 1] = clamp(0.5 + (fine - 0.5) * 0.7) * 255;
    img.data[i + 2] = clamp(mott) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // short cotton fibres: soft curved strokes, drawn into R (albedo) and G (height); wrapped for tiling
  ctx.globalCompositeOperation = "lighter";
  const n = Math.round(900 * F.fibres);
  for (let k = 0; k < n; k++) {
    const x = R.next() * N, y = R.next() * N, a = R.next() * TAU, len = R.range(6, 22), bend = R.range(-0.5, 0.5);
    const a2 = R.next() < 0.5 ? 0.06 : 0.035;
    ctx.strokeStyle = `rgba(${Math.round(a2 * 255)},${Math.round(a2 * 1.6 * 255)},0,1)`;
    ctx.lineWidth = R.range(0.6, 1.3);
    for (const [ox, oy] of [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N]]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + ox + Math.cos(a + bend) * len * 0.5, y + oy + Math.sin(a + bend) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ============================================================================ sheet shader ===================
const VERT = /* glsl */ `
uniform vec4 uDip;        // xy centre, zw half size (card m)
uniform vec2 uDipAmt;     // x depth (m), y softness (m)
varying vec2 vXY;
varying vec3 vPos;
varying vec2 vDipG;
float dipF(vec2 p) {
  vec2 d = abs(p - uDip.xy) - uDip.zw;
  float o = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-uDipAmt.y * 0.4, uDipAmt.y, o);
}
void main() {
  vec3 p = position;
  float e = 0.006;
  float f = dipF(p.xy);
  p.z -= uDipAmt.x * f;
  vDipG = uDipAmt.x * vec2(dipF(p.xy + vec2(e, 0.0)) - dipF(p.xy - vec2(e, 0.0)), dipF(p.xy + vec2(0.0, e)) - dipF(p.xy - vec2(0.0, e))) / (2.0 * e);
  vXY = position.xy;
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
#define NL 8
uniform vec2 uSize;            // card W, H (m)
uniform vec3 uPaper;
uniform vec3 uDeckleCol;
uniform sampler2D uFibre;
uniform vec3 uFibreP;          // perMetre, albedo amount, bump height (m)
uniform vec4 uDeckle;          // width, freq, edgeLighten, edgeDrop
#if RELIEF
uniform sampler2D uS0; uniform sampler2D uS1; uniform sampler2D uW0; uniform sampler2D uW1;
uniform vec2 uTexel;           // 1 / sharp size
uniform float uPress[NL]; uniform float uDepth[NL]; uniform float uPillow[NL];
uniform float uInkOn[NL]; uniform float uFoilOn[NL]; uniform vec3 uInkCol[NL];
uniform vec2 uCov; uniform vec3 uInkP;   // coverage edges; squash, mottle, skip
uniform vec3 uFoilCol; uniform vec4 uFoilP;  // roughness, brush, envBase, bandWidth
uniform vec3 uEnvLo; uniform vec3 uEnvHi;
uniform vec3 uBand;            // level, pos, strength
#endif
uniform vec3 uKeyL;            // key direction, SHEET-LOCAL (toward the light)
uniform vec3 uKeyCol;          // linear colour * intensity
uniform vec3 uFillCol; uniform float uFrontal;
uniform float uPaperSpec;
uniform vec4 uShadowP;         // steps(unused), reach, soft, strength
uniform vec3 uCam;             // camera position, sheet-local
uniform vec4 uDie; uniform vec4 uDieP;  // die rect (xy centre, zw half) ; z (face height), height, on, shadow fade height
uniform vec4 uDieShadow;       // strength, soft, softPerMetre, ao
uniform vec4 uCaster; uniform vec2 uCasterP; // rect casting a shadow onto THIS sheet (a sheet above): rect; gap, on
varying vec2 vXY; varying vec3 vPos; varying vec2 vDipG;

float softRect(vec2 p, vec4 r, float soft) {
  vec2 d = abs(p - r.xy) - r.zw;
  float o = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-soft, soft, o);
}
float edgeDist(vec2 xy) { return min(uSize.x * 0.5 - abs(xy.x), uSize.y * 0.5 - abs(xy.y)); }
float deckleN(vec2 xy) {
  float n = texture2D(uFibre, xy * uDeckle.y * 0.05).b;
  float n2 = texture2D(uFibre, xy * uDeckle.y * 0.21 + 0.37).b;
  return 0.25 + 0.75 * clamp((n * 0.7 + n2 * 0.5 - 0.1), 0.0, 1.0);
}
float edgeF(vec2 xy) { if (uDeckle.x <= 0.0) return 0.0; return 1.0 - smoothstep(0.0, uDeckle.x * 1.8, edgeDist(xy) - uDeckle.x * deckleN(xy)); }

#if RELIEF
float layerH(float s, float w, int i) { return uDepth[i] * uPress[i] * (s - uPillow[i] * max(w - s, 0.0)); }
float Hat(vec2 uv) {
  vec4 a = texture2D(uS0, uv), b = texture2D(uS1, uv), c = texture2D(uW0, uv), d = texture2D(uW1, uv);
  return layerH(a.x, c.x, 0) + layerH(a.y, c.y, 1) + layerH(a.z, c.z, 2) + layerH(a.w, c.w, 3)
       + layerH(b.x, d.x, 4) + layerH(b.y, d.y, 5) + layerH(b.z, d.z, 6) + layerH(b.w, d.w, 7);
}
#else
float Hat(vec2 uv) { return 0.0; }
#endif
vec2 toUV(vec2 xy) { return vec2(xy.x / uSize.x + 0.5, 0.5 - xy.y / uSize.y); }
float Hxy(vec2 xy) { return Hat(toUV(xy)) - uDeckle.w * edgeF(xy); }

void main() {
  vec2 xy = vXY;
  float ed = edgeDist(xy);
  if (uDeckle.x > 0.0 && ed < uDeckle.x * deckleN(xy)) discard;
  vec2 uv = toUV(xy);

  // ---- relief height + gradient (metres per metre), filter-width aware step
  vec2 fw = max(fwidth(xy), vec2(0.0005));
  vec2 e = max(fw * 0.75, vec2(0.0009));
  float h0 = Hxy(xy);
  float dhx = (Hxy(xy + vec2(e.x, 0.0)) - Hxy(xy - vec2(e.x, 0.0))) / (2.0 * e.x);
  float dhy = (Hxy(xy + vec2(0.0, e.y)) - Hxy(xy - vec2(0.0, e.y))) / (2.0 * e.y);
  // cotton fibre micro-relief (static texture, two rotated scales so the tile does not repeat visibly)
  vec2 fuv = xy * uFibreP.x;
  vec2 fuv2 = mat2(0.8, -0.6, 0.6, 0.8) * xy * uFibreP.x * 1.73 + 0.31;
  float fe = 1.0 / 512.0;
  vec3 f0 = texture2D(uFibre, fuv).rgb, f1 = texture2D(uFibre, fuv2).rgb;
  float fh = f0.g + f1.g * 0.6;
  float fhx = texture2D(uFibre, fuv + vec2(fe, 0.0)).g + texture2D(uFibre, fuv2 + vec2(fe * 0.8, fe * 0.6)).g * 0.6 - fh;
  float fhy = texture2D(uFibre, fuv + vec2(0.0, fe)).g + texture2D(uFibre, fuv2 + vec2(-fe * 0.6, fe * 0.8)).g * 0.6 - fh;
  float fs = uFibreP.z / (fe / uFibreP.x);   // height per texel step -> slope
  // surface z = H + fibre - A*dip  ->  N ~ (-dz/dx, -dz/dy, 1); vDipG = +A*grad(dip)
  vec3 N = normalize(vec3(-dhx - fhx * fs + vDipG.x, -dhy - fhy * fs + vDipG.y, 1.0));

  vec3 L = normalize(uKeyL);
  vec3 V = normalize(uCam - vPos);
  float NdL = max(dot(N, L), 0.0);

  // ---- self shadow: march the height field toward the key
  float occ = 0.0;
#if RELIEF
  vec2 ldir = normalize(L.xy + vec2(1e-5));
  float tanE = L.z / max(length(L.xy), 1e-4);
  for (int k = 1; k <= 7; k++) {
    float d = uShadowP.y * float(k) / 7.0;
    float hk = Hxy(xy + ldir * d);
    occ = max(occ, clamp((hk - (h0 + d * tanE)) / uShadowP.z, 0.0, 1.0));
  }
#endif
  float selfSh = 1.0 - occ * uShadowP.w;
  // ---- die shadow (analytic soft box shadow) + contact darkening
  float dieSh = 1.0, dieAO = 1.0;
  if (uDieP.z > 0.5) {
    vec2 sl = L.xy / max(L.z, 0.05);
    float zc = max(uDieP.x, 0.0) + uDieP.y * 0.5;
    vec4 r = vec4(uDie.xy - sl * zc, uDie.zw + abs(sl) * uDieP.y * 0.5);
    float soft = uDieShadow.y + max(uDieP.x, 0.0) * uDieShadow.z;
    dieSh = 1.0 - uDieShadow.x * (1.0 - smoothstep(0.0, uDieP.w, max(uDieP.x, 0.0))) * softRect(xy, r, soft);
    float near = 1.0 - smoothstep(0.0, 0.45, max(uDieP.x, 0.0));
    dieAO = 1.0 - uDieShadow.w * near * softRect(xy, uDie, 0.03 + max(uDieP.x, 0.0) * 0.5);
  }
  // ---- shadow of a sheet lying above this one
  float casterSh = 1.0;
  if (uCasterP.y > 0.5) {
    vec2 sl = L.xy / max(L.z, 0.05);
    casterSh = 1.0 - 0.8 * softRect(xy, vec4(uCaster.xy - sl * uCasterP.x, uCaster.zw), 0.004 + uCasterP.x * 0.6);
    float ao = softRect(xy, uCaster, 0.03);
    dieAO *= 1.0 - 0.35 * ao;
  }
  float sh = selfSh * dieSh * casterSh;

  // ---- paper albedo: cream * cloudy formation * fibres; lighter feathered deckle
  float form = (f0.r - 0.5) + (f1.r - 0.5) * 0.6;
  vec3 albedo = uPaper * (1.0 + form * uFibreP.y * 2.0);
  float eF = edgeF(xy);
  albedo = mix(albedo, uDeckleCol, eF * uDeckle.z * 8.0);
  float rough = 0.85;
  vec3 col;

#if RELIEF
  // ---- spot ink (in the impression) and foil coverage
  vec4 a = texture2D(uS0, uv), b = texture2D(uS1, uv);
  float sv[NL];
  sv[0] = a.x; sv[1] = a.y; sv[2] = a.z; sv[3] = a.w; sv[4] = b.x; sv[5] = b.y; sv[6] = b.z; sv[7] = b.w;
  float mott = texture2D(uFibre, xy * 0.9 + 0.13).b;
  float skip = texture2D(uFibre, xy * 9.0).r;
  vec3 inkCol = vec3(0.0); float ink = 0.0; float foil = 0.0;
  for (int i = 0; i < NL; i++) {
    float cov = smoothstep(uCov.x, uCov.y, sv[i]) * uPress[i];
    float ring = smoothstep(uCov.x, uCov.y, sv[i]) * (1.0 - smoothstep(uCov.y, 0.97, sv[i]));
    float dens = cov * (1.0 + uInkP.x * ring) * (1.0 - uInkP.y * (mott - 0.5) * 2.0) * (1.0 - uInkP.z * smoothstep(0.62, 0.8, skip));
    float k = uInkOn[i] * clamp(dens, 0.0, 1.3);
    inkCol += uInkCol[i] * k; ink += k;
    foil = max(foil, uFoilOn[i] * cov);
  }
  if (ink > 0.0) {
    vec3 ic = inkCol / ink;
    float over = max(ink - 1.0, 0.0);
    albedo = mix(albedo, ic * (1.0 - 0.45 * over), clamp(ink, 0.0, 1.0) * 0.96);
    rough = mix(rough, 0.62, clamp(ink, 0.0, 1.0));
  }
#endif

  // ---- paper / ink shading (local frame; hemispherical fill from the front)
  vec3 Hh = normalize(L + V);
  float fillT = 1.0 - uFrontal + uFrontal * max(N.z, 0.0);
  vec3 diffuse = albedo * (uKeyCol * NdL * sh + uFillCol * fillT * dieAO);
  float spec = uPaperSpec * pow(max(dot(N, Hh), 0.0), 18.0 / rough) * NdL * sh;
  col = diffuse + uKeyCol * spec;

#if RELIEF
  if (foil > 0.0) {
    // brushed micro-streaks along X (anisotropic-ish): perturb the normal across the stroke
    float br = texture2D(uFibre, vec2(xy.x * 0.35, xy.y * 38.0)).g - 0.5;
    vec3 Nf = normalize(N + vec3(0.0, br * uFoilP.y, 0.0));
    float NdV = max(dot(Nf, V), 0.05);
    float NdLf = max(dot(Nf, L), 0.0);
    float NdH = max(dot(Nf, normalize(L + V)), 0.0);
    float a2 = pow(uFoilP.x, 4.0);
    float dd = NdH * NdH * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * dd * dd);
    vec3 R = reflect(-V, Nf);
    float envT = smoothstep(-0.3, 0.9, R.y * 0.65 + R.z * 0.35 - R.x * 0.1);
    vec3 env = mix(uEnvLo, uEnvHi, envT) * uFoilP.z;
    float bandC = dot(R.xy, normalize(vec2(1.0, 0.42)));
    float band = uBand.x * exp(-((bandC - uBand.y) / uFoilP.w) * ((bandC - uBand.y) / uFoilP.w)) * uBand.z;
    vec3 F0 = uFoilCol;
    vec3 Fr = F0 + (1.0 - F0) * pow(clamp(1.0 - NdV, 0.0, 1.0), 5.0);
    vec3 fc = Fr * (env * (0.75 + 0.25 * fillT) * dieAO + band * uKeyCol / max(length(uKeyCol), 1e-3) * (0.7 + 0.6 * br + 0.3))
            + Fr * uKeyCol * D * NdLf * sh * 0.25 / NdV
            + F0 * uFillCol * 0.08;
    col = mix(col, fc, foil);
  }
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** paperMaterial({ relief?, color, deckle, fibre }) -> ShaderMaterial for a sheet (relief = bakeRelief() result or null) */
export function paperMaterial(o = {}) {
  const S = STYLE_SPEC, SH = S.sheet, LI = S.lighting, I = S.ink, F = S.foil;
  const relief = o.relief ?? null;
  const fib = o.fibreTexture ?? fibreTexture();
  const dk = o.deckle === false ? { ...SH.deckle, width: 0 } : { ...SH.deckle, ...(o.deckle ?? {}) };
  const zeros = new Array(SH.maxLayers).fill(0);
  const U = {
    uSize: { value: new THREE.Vector2(o.width ?? SH.width, o.height ?? SH.height) },
    uPaper: { value: lin(o.color ?? S.palette.paper) },
    uDeckleCol: { value: lin(o.deckleColor ?? S.palette.deckle) },
    uFibre: { value: fib },
    uFibreP: { value: new THREE.Vector3(S.fibre.perMetre, o.fibreAlbedo ?? S.fibre.albedo, o.fibreBump ?? S.fibre.bump) },
    uDeckle: { value: new THREE.Vector4(dk.width, dk.freq, dk.edgeLighten, dk.edgeDrop) },
    uKeyL: { value: new THREE.Vector3(-0.8, 0.5, 0.33) },
    uKeyCol: { value: lin(LI.key.color).multiplyScalar(LI.key.intensity) },
    uFillCol: { value: lin(LI.fill.color).multiplyScalar(LI.fill.intensity) },
    uFrontal: { value: LI.fill.frontal },
    uPaperSpec: { value: LI.paperSpec },
    uShadowP: { value: new THREE.Vector4(LI.selfShadow.steps, LI.selfShadow.reach, LI.selfShadow.soft, LI.selfShadow.strength) },
    uCam: { value: new THREE.Vector3(0, 0, 5) },
    uDie: { value: new THREE.Vector4(0, 0, 0.1, 0.1) },
    uDieP: { value: new THREE.Vector4(1, 0.2, 0, 0) },
    uDieShadow: { value: new THREE.Vector4(LI.dieShadow.strength, LI.dieShadow.soft, LI.dieShadow.softPerMetre, LI.dieShadow.ao) },
    uCaster: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCasterP: { value: new THREE.Vector2(0, 0) },
    uDip: { value: new THREE.Vector4(0, 0, 0.1, 0.1) },
    uDipAmt: { value: new THREE.Vector2(0, SH.dip.soft) },
  };
  if (relief) {
    Object.assign(U, {
      uS0: { value: relief.sharp[0] }, uS1: { value: relief.sharp[1] }, uW0: { value: relief.wide[0] }, uW1: { value: relief.wide[1] },
      uTexel: { value: new THREE.Vector2(1 / relief.size[0], 1 / relief.size[1]) },
      uPress: { value: zeros.slice() }, uDepth: { value: zeros.slice() }, uPillow: { value: zeros.slice() },
      uInkOn: { value: zeros.slice() }, uFoilOn: { value: zeros.slice() },
      uInkCol: { value: zeros.map(() => new THREE.Color(0, 0, 0)) },
      uCov: { value: new THREE.Vector2(...I.coverage) },
      uInkP: { value: new THREE.Vector3(I.squash, I.mottle, I.skip) },
      uFoilCol: { value: lin(o.foil ?? F.color) },
      uFoilP: { value: new THREE.Vector4(F.roughness, F.brush, F.env.base, F.band.width) },
      uEnvLo: { value: lin(F.env.low) }, uEnvHi: { value: lin(F.env.high) },
      uBand: { value: new THREE.Vector3(0, -9, F.band.strength) },
    });
  }
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, defines: { RELIEF: relief ? 1 : 0 } });
  m.name = relief ? "letterpressSheet" : "letterpressBoard";
  return m;
}

// ============================================================================ props ==========================
/**
 * createStyle(stage, opts?) -> style. Props:
 *   reliefSheet({ width, height, color, layers:[{ id, kind, ink, depth?, pillow?, items?|draw(h, ornaments) }], deckle })
 *   paperBoard({ width, height, color, deckle:false })   pressDie({ w, h, height, knob })   rakingLight()
 *   sheetStack([sheets], { gap })
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const fib = fibreTexture();
  const sheets = []; // registered for light/view sync

  /** sheet scaffolding shared by reliefSheet and paperBoard: pivot (turn) > content (slide) > mesh */
  function makeSheet(mat, w, h, segs) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, segs[0], segs[1]), mat);
    mesh.frustumCulled = false;
    const content = new THREE.Group();
    content.add(mesh);
    const pivot = new THREE.Group();
    pivot.add(content);
    const U = mat.uniforms;
    pivot.userData = {
      mesh, content, uniforms: U, width: w, height: h,
      /** setSlide([x, y, z]) — offset of the sheet within its stack (slide-in / slide-out) */
      setSlide(p) { content.position.set(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0); },
      /** setTurn(u, edge="left") — turn the sheet over an edge like a page: 0 flat .. 1 face down */
      setTurn(u, edge = "left") {
        const s = edge === "left" ? 1 : -1;
        pivot.position.x = -s * w / 2;
        content.position.x = s * w / 2;
        pivot.rotation.y = -s * Math.PI * clamp(u);
      },
      /** setDie(state, die) — analytic die shadow + contact darkening (state from plan.dieState) */
      setDie(st, die) {
        if (!st || !st.visible) { U.uDieP.value.z = 0; return; }
        const d = die.userData;
        U.uDie.value.set(st.offset[0], st.offset[1], d.w / 2, d.h / 2);
        U.uDieP.value.set(st.offset[2], d.height, 1, spec.lighting.dieShadow.fadeHeight);
      },
      /** setDip({ x, y, w, h }, amount 0..1) — the sheet sinks under the die */
      setDip(r, amount) {
        U.uDip.value.set(r.x, r.y, r.w / 2, r.h / 2);
        U.uDipAmt.value.x = spec.sheet.dip.depth * clamp(amount);
      },
      /** setCaster({ x, y, w, h }, gap) — a sheet lying `gap` above this one casts a raking shadow sliver */
      setCaster(r, gap) {
        if (!r) { U.uCasterP.value.y = 0; return; }
        U.uCaster.value.set(r.x, r.y, r.w / 2, r.h / 2);
        U.uCasterP.value.set(gap, 1);
      },
    };
    sheets.push(pivot);
    return pivot;
  }

  /**
   * reliefSheet({ width, height, color, foil, deckle, layers }) -> sheet (Group). layers (≤ 8):
   *   { id, kind: "deboss"|"emboss"|"ink"|"foil", ink: palette name|hex (kind "ink"), depth?, pillow?, items?|draw(h, ornaments) }
   *   sheet.userData.setPress(id, u 0..1) · press(id) · layerIds · plus setSlide/setTurn/setDie/setDip/setCaster/setFlash
   */
  function reliefSheet(o = {}) {
    const W = o.width ?? spec.sheet.width, H = o.height ?? spec.sheet.height;
    const layers = o.layers ?? [];
    const relief = bakeRelief(layers, { width: W, height: H });
    const mat = paperMaterial({ relief, width: W, height: H, color: o.color, foil: o.foil, deckle: o.deckle, fibreTexture: fib });
    const sheet = makeSheet(mat, W, H, o.segments ?? spec.sheet.segments);
    const U = mat.uniforms, ids = {};
    layers.forEach((L, i) => {
      if (!KINDS.includes(L.kind)) throw new Error(`embossed-letterpress: layer "${L.id}" kind must be one of ${KINDS.join("/")}`);
      ids[L.id] = i;
      const sign = L.kind === "emboss" ? 1 : -1;
      U.uDepth.value[i] = sign * (L.depth ?? spec.sheet.depth[L.kind]);
      U.uPillow.value[i] = L.pillow ?? spec.sheet.pillow[L.kind];
      U.uInkOn.value[i] = L.kind === "ink" ? 1 : 0;
      U.uFoilOn.value[i] = L.kind === "foil" ? 1 : 0;
      if (L.kind === "ink") U.uInkCol.value[i] = lin(spec.palette[L.ink] ?? L.ink ?? spec.palette.navy);
      U.uPress.value[i] = L.press ?? 0;
    });
    Object.assign(sheet.userData, {
      layerIds: Object.keys(ids),
      setPress(id, u) { if (id in ids) U.uPress.value[ids[id]] = clamp(u); },
      press(id) { return U.uPress.value[ids[id]]; },
      /** setFlash(level 0..1, pos) — travelling highlight band across the foil (plan.flashAt) */
      setFlash(level, pos) { U.uBand.value.x = level; U.uBand.value.y = pos; },
    });
    return sheet;
  }

  /** paperBoard({ width, height, color }) -> plain sheet with fibre relief only (a stack base / backdrop board) */
  function paperBoard(o = {}) {
    const W = o.width ?? 8, H = o.height ?? 5;
    const mat = paperMaterial({ width: W, height: H, color: o.color ?? spec.palette.board, deckle: o.deckle ?? false, fibreTexture: fib, fibreAlbedo: o.fibreAlbedo ?? 0.07 });
    return makeSheet(mat, W, H, [1, 1]);
  }

  /**
   * pressDie({ w, h, height=.16, plate=.035, knob=true }) -> Group (origin = centre of the brass face, face toward -Z).
   *   Brass block on a steel face plate with a turned ebony knob. userData.setState(dieState) poses + hides it.
   */
  function pressDie(o = {}) {
    const w = o.w ?? 0.9, h = o.h ?? 0.5, height = o.height ?? 0.16, plate = o.plate ?? 0.035;
    const g = new THREE.Group();
    const face = new THREE.Mesh(new RoundedBoxGeometry(w - 0.02, h - 0.02, plate, 3, 0.008), materials.dieFace);
    face.position.z = plate / 2;
    const block = new THREE.Mesh(new RoundedBoxGeometry(w, h, height - plate, 4, 0.022), materials.brass);
    block.position.z = plate + (height - plate) / 2;
    g.add(face, block);
    if (o.knob !== false) {
      const r = Math.min(w, h) * 0.16;
      const knob = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [r, 0], [r * 1.05, r * 0.25], [r * 0.7, r * 0.55], [r * 0.85, r * 1.1], [r * 0.5, r * 1.35], [0.001, r * 1.4]].map(([a, b]) => new THREE.Vector2(a, b)), 40), materials.knob);
      knob.rotation.x = Math.PI / 2;
      knob.position.z = height;
      g.add(knob);
    }
    g.visible = false;
    g.userData = {
      w, h, height,
      setState(st) {
        g.visible = !!st.visible;
        g.position.set(...st.offset);
      },
    };
    return g;
  }

  /**
   * rakingLight({ plane }) -> rig. rig.set({ azimuth, elevation, intensity }) points the key (azimuth around the
   *   plane's normal, 0 = from +x; elevation above the plane) for every registered sheet and the die's three.js light.
   *   rig.syncView(camera) updates each sheet's local camera position (call after the camera rig).
   */
  function rakingLight(o = {}) {
    const plane = o.plane ?? null;
    const key = lights.key, fill = lights.fill;
    const local = new THREE.Vector3(), world = new THREE.Vector3(), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
    const K = spec.lighting.key;
    return {
      set({ azimuth = K.azimuth, elevation = K.elevation, intensity = 1 } = {}) {
        local.set(Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation));
        world.copy(local);
        if (plane) { plane.updateWorldMatrix(true, false); plane.getWorldQuaternion(q); world.applyQuaternion(q); }
        key.position.copy(world).multiplyScalar(10);
        key.target.position.set(0, 0, 0);
        key.intensity = K.intensity * intensity;
        if (fill) fill.position.set(0, 0, 1);
        for (const s of sheets) {
          s.userData.mesh.updateWorldMatrix(true, false);
          s.userData.mesh.getWorldQuaternion(qi);
          s.userData.uniforms.uKeyL.value.copy(world).applyQuaternion(qi.invert());
          s.userData.uniforms.uKeyCol.value.copy(lin(K.color)).multiplyScalar(K.intensity * intensity);
        }
      },
      syncView(camera) {
        camera.updateWorldMatrix(true, false);
        for (const s of sheets) {
          s.userData.mesh.updateWorldMatrix(true, false);
          s.userData.uniforms.uCam.value.copy(camera.position);
          s.userData.mesh.worldToLocal(s.userData.uniforms.uCam.value);
        }
      },
    };
  }

  /** sheetStack(sheets[], { gap }) -> Group: sheets[0] on top, each next one `gap` lower (−Z) */
  function sheetStack(list, o = {}) {
    const gap = o.gap ?? spec.sheet.thickness;
    const g = new THREE.Group();
    list.forEach((s, i) => { s.position.z = -i * gap; g.add(s); });
    g.userData.sheets = list;
    return g;
  }

  const props = { reliefSheet, paperBoard, pressDie, rakingLight, sheetStack };
  const factories = {
    board: (o) => paperBoard(o.dims ?? {}),
    reliefSheet: (o) => reliefSheet({ ...(o.dims ?? {}), layers: o.layers ?? [] }),
  };
  return {
    spec, palette: spec.palette, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    ornaments, plan, motion: plan,
    helpers: { painter, drawItems, bakeRelief, fibreTexture, paperMaterial },
  };
}
