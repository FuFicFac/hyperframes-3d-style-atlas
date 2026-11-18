// styles/neon-sign/style.js — "Neon Sign" look: glass tube lettering/icons on stand-offs over a dark
// painted brick wall, flicker-on lighting with coloured wall spill. See STYLE.md for the prop list.
// Everything is synchronous and seeded; time only enters through update(t)/flicker(t) helpers.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, TAU } from "../../kit/time.js";
import { fbm2, makeCanvas, canvasTexture } from "../../kit/textures.js";
import { flicker as kitFlicker } from "../../kit/motion.js";
import { vec3, expandStroke, filletPath, pathLength, pointAt, sweepGeometry } from "../../kit/paths.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const N = STYLE_SPEC.neon;
const FL = STYLE_SPEC.flicker;
const SP = STYLE_SPEC.spill;
const DEG = Math.PI / 180;
/** Luminance balance: bright gases (lime, warm white) get less, dim ones (violet) more, so spill and cores match. */
function lumaGain(c, exp = 1) {
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return Math.pow(clamp(SP.lumaRef / Math.max(1e-3, y), SP.lumaMin, SP.lumaMax), exp);
}

// ---------------------------------------------------------------- flicker (kit/motion.js) ---------
/** flicker(t, onTime, seed = 1, opts?) — kit/motion.js flicker with this style's STYLE_SPEC.flicker defaults. */
export function flicker(t, onTime, seed = 1, opts = {}) {
  return kitFlicker(t, onTime, seed, { ...FL, ...opts });
}

// ---------------------------------------------------------------- path helpers (kit/paths.js) -----
const { sub, add, mul, len, nrm } = vec3;
export { expandStroke, filletPath, pathLength, pointAt, sweepGeometry };

/** Orient a +Y cylinder geometry from point a to point b. */
function rod(a, b, r, seg = 10) {
  const d = sub(b, a), l = len(d);
  const g = new THREE.CylinderGeometry(r, r, l, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nrm(d)));
  g.applyQuaternion(q);
  g.translate(...mul(add(a, b), 0.5));
  return g;
}
const stripUV = (g) => { g.deleteAttribute("uv"); return g.index ? g : g; };
const merge = (gs) => (gs.length ? mergeGeometries(gs.map((g) => (g.index ? g : g)).map(stripUV), false) : null);

// ---------------------------------------------------------------- text layout (pure) ---------------
/**
 * layoutText(text, cap, opts?) -> { chars: [{ ch, i, x0, x1, line, strokes }], width, lines }
 *   opts: { letterSpacing, wordSpacing, lineHeight (× cap), align, gapBefore: { [charIndex]: metres } }
 *   Element-local metres, x centred per line (align), baseline of line 0 at y = 0, lines go down.
 *   strokes: expanded+filleted point lists ([x,y,0]) per glyph stroke. Unknown glyphs advance as space.
 */
export function layoutText(text, cap, o = {}) {
  const font = STYLE_SPEC.font.glyphs;
  const spacing = (o.letterSpacing ?? N.letterSpacing) * cap, space = (o.wordSpacing ?? N.wordSpacing) * cap;
  const lineH = (o.lineHeight ?? N.lineHeight) * cap, align = o.align ?? "center";
  const out = [];
  const lines = String(text).toUpperCase().split("\n");
  let i = 0, maxW = 0;
  lines.forEach((line, li) => {
    let x = 0;
    const row = [];
    for (const ch of line) {
      const g = font[ch];
      x += o.gapBefore?.[i] ?? 0; // extra space before char i (e.g. token boundaries)
      if (!g) { x += space; i++; continue; }
      const strokes = g.s.map((s) => filletPath(expandStroke(s, cap, [x, -li * lineH]), N.bendRadius * cap));
      row.push({ ch, i, x0: x, x1: x + g.w * cap, line: li, strokes });
      x += g.w * cap + spacing;
      i++;
    }
    const w = row.length ? row[row.length - 1].x1 : 0;
    const shift = align === "left" ? 0 : align === "right" ? -w : -w / 2;
    for (const c of row) {
      c.x0 += shift; c.x1 += shift;
      c.strokes = c.strokes.map((s) => s.map((p) => [p[0] + shift, p[1], p[2]]));
    }
    maxW = Math.max(maxW, w);
    out.push(...row);
    i++; // newline
  });
  return { chars: out, width: maxW, lines: lines.length };
}

// ---------------------------------------------------------------- icon strokes (pure) --------------
/** ICONS[name](o) -> strokes in metres, centred on the origin (x right, y up). Size via o.size. */
export const ICONS = {
  arrow: ({ size = 1, dir = 0 } = {}) => {
    const h = size * 0.32, rot = (p) => [p[0] * Math.cos(dir) - p[1] * Math.sin(dir), p[0] * Math.sin(dir) + p[1] * Math.cos(dir)];
    return [[[-size / 2, 0], [size / 2, 0]], [[size / 2 - h, h * 0.85], [size / 2, 0], [size / 2 - h, -h * 0.85]]].map((s) => s.map(rot));
  },
  circle: ({ size = 1, gap = 14 } = {}) => [[["a", 0, 0, size / 2, size / 2, 90 + gap / 2, 450 - gap / 2]]],
  ring: (o) => ICONS.circle(o),
  underBracket: ({ w = 1, h = 0.18 } = {}) => [[[-w / 2, h], [-w / 2, 0], [w / 2, 0], [w / 2, h]]],
  bracketL: ({ size = 1 } = {}) => [[[size * 0.12, size / 2], [-size * 0.12, size / 2], [-size * 0.12, -size / 2], [size * 0.12, -size / 2]]],
  bracketR: ({ size = 1 } = {}) => [[[-size * 0.12, size / 2], [size * 0.12, size / 2], [size * 0.12, -size / 2], [-size * 0.12, -size / 2]]],
  divider: ({ size = 1 } = {}) => [[[0, -size / 2], [0, size / 2]]],
  bolt: ({ size = 1 } = {}) => [[[0.12, 0.5], [-0.22, -0.02], [0.08, -0.02], [-0.12, -0.5]].map(([x, y]) => [x * size, y * size])],
  check: ({ size = 1 } = {}) => [[[-0.4, 0.02], [-0.12, -0.3], [0.42, 0.34]].map(([x, y]) => [x * size, y * size])],
  chevron: ({ size = 1 } = {}) => [[[-0.18, 0.4], [0.2, 0], [-0.18, -0.4]].map(([x, y]) => [x * size, y * size])],
  star: ({ size = 1 } = {}) => [Array.from({ length: 11 }, (_, k) => { const a = (90 + k * 36) * DEG, r = (k % 2 ? 0.2 : 0.5) * size; return [r * Math.cos(a), r * Math.sin(a)]; })],
  heart: ({ size = 1 } = {}) => [[[0, -0.42 * size], ["a", -0.22 * size, 0.14 * size, 0.24 * size, 0.24 * size, 220, 30], [0, 0.14 * size], ["a", 0.22 * size, 0.14 * size, 0.24 * size, 0.24 * size, 150, -40], [0, -0.42 * size]]],
  counter: ({ size = 1, digits = 3 } = {}) => {
    const w = size * 0.42 * digits, h = size * 0.62, s = [[[-w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2 + 0.02 * size, -h / 2]]];
    for (let k = 1; k < digits; k++) { const x = -w / 2 + (w * k) / digits; s.push([[x, -h / 2 + 0.08 * size], [x, h / 2 - 0.08 * size]]); }
    return s;
  },
};

// ---------------------------------------------------------------- canvas painters -----------------
function rectNoise(w, h, f) {
  const c = makeCanvas(w, h), ctx = c.getContext("2d"), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = clamp(f(x, y)) * 255, k = (y * w + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paint glow canvas for strokes (metres) inside bounds; returns { tex, w, h, cx, cy } (metres). */
function glowTexture(polys, cap, tubeR) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of polys) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const m = (SP.glowWidth * cap) / 2;
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  const ppm = SP.glowRes / cap;
  const W = Math.max(8, Math.ceil((x1 - x0) * ppm)), H = Math.max(8, Math.ceil((y1 - y0) * ppm));
  const c = makeCanvas(W, H), ctx = c.getContext("2d");
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  const K = 28;
  for (let k = K - 1; k >= 0; k--) {
    const f = k / (K - 1);
    ctx.lineWidth = Math.max(1, (tubeR * 2 + 2 * m * Math.pow(f, 1.6)) * ppm);
    ctx.strokeStyle = `rgba(255,255,255,${(0.018 + 0.03 * (1 - f) * (1 - f)).toFixed(4)})`;
    for (const s of polys) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (p[0] - x0) * ppm, (y1 - p[1]) * ppm));
      if (s.length === 1) ctx.lineTo((s[0][0] - x0) * ppm + 0.1, (y1 - s[0][1]) * ppm);
      ctx.stroke();
    }
  }
  const tex = canvasTexture(c, { srgb: false });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Brick wall maps: { map, bump } painted with seeded rng. Canvas top = wall top. */
function paintBrick(o) {
  const ppm = o.pxPerMetre, W = Math.round(o.width * ppm), H = Math.round(o.height * ppm);
  const r = rng(o.seed ?? 7);
  const c = makeCanvas(W, H), ctx = c.getContext("2d");
  const bW = Math.round(W / 2), bH = Math.round(H / 2), bc = makeCanvas(bW, bH), bx = bc.getContext("2d");
  ctx.fillStyle = o.mortarColor; ctx.fillRect(0, 0, W, H);
  bx.fillStyle = "#1a1a1a"; bx.fillRect(0, 0, bW, bH);
  const cw = o.brickW * ppm, ch = o.brickH * ppm, mo = o.mortar * ppm;
  const rows = Math.ceil(H / ch) + 1;
  const base = o.colors.map((h) => new THREE.Color(h));
  for (let row = 0; row < rows; row++) {
    const y = row * ch, off = (row % 2 ? cw / 2 : 0) + r.range(-0.04, 0.04) * cw;
    for (let x = -cw + off; x < W + cw; x += cw) {
      const col = r.pick(base).clone().multiplyScalar(r.range(0.86, 1.14));
      const bx0 = x + mo / 2, by0 = y + mo / 2, bw = cw - mo + r.range(-0.6, 0.6), bh = ch - mo + r.range(-0.5, 0.5);
      ctx.fillStyle = `#${col.getHexString()}`;
      ctx.beginPath(); ctx.roundRect(bx0, by0, bw, bh, 2); ctx.fill();
      if (r.chance(o.chip)) { // paint wear: older red brick shows through
        ctx.save(); ctx.beginPath(); ctx.rect(bx0, by0, bw, bh); ctx.clip();
        ctx.fillStyle = o.chipColor; ctx.globalAlpha = r.range(0.35, 0.7);
        for (let k = r.int(1, 3); k > 0; k--) { ctx.beginPath(); ctx.ellipse(bx0 + r.range(0, bw), by0 + r.range(0, bh), r.range(3, bw * 0.3), r.range(2, bh * 0.45), r.range(0, 3), 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      for (let k = 0; k < 10; k++) { // speckle
        ctx.fillStyle = r.chance(0.5) ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
        ctx.fillRect(bx0 + r.range(0, bw), by0 + r.range(0, bh), r.range(1, 3), r.range(1, 2));
      }
      const g = Math.round(r.range(150, 205));
      bx.fillStyle = `rgb(${g},${g},${g})`;
      bx.beginPath(); bx.roundRect(bx0 / 2 + 0.5, by0 / 2 + 0.5, bw / 2 - 1, bh / 2 - 1, 1.5); bx.fill();
      for (let k = 0; k < 6; k++) { bx.fillStyle = "rgba(0,0,0,0.25)"; bx.fillRect((bx0 + r.range(0, bw)) / 2, (by0 + r.range(0, bh)) / 2, 1.2, 1.2); }
    }
  }
  // large-scale grime (fbm, multiply) + vertical water streaks + soot near the bottom
  const gw = 240, gh = Math.round((240 * H) / W), seed = o.seed ?? 7;
  const gc = rectNoise(gw, gh, (x, y) => 1 - o.grime * Math.pow(fbm2((x / gw) * 6, (y / gh) * 6 * (gh / gw), { seed, octaves: 5, period: 64 }), 1.6) * 1.25);
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.imageSmoothingEnabled = true; ctx.drawImage(gc, 0, 0, W, H); ctx.restore();
  for (let k = 0; k < o.streaks; k++) {
    const x = r.range(0, W), y = r.range(-0.1, 0.5) * H, l = r.range(0.1, 0.5) * H, w = r.range(2, 14);
    const gr = ctx.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, `rgba(0,0,0,${r.range(0.05, 0.18).toFixed(3)})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, l);
  }
  const sg = ctx.createLinearGradient(0, H * 0.8, 0, H);
  sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = sg; ctx.fillRect(0, H * 0.8, W, H * 0.2);
  const map = canvasTexture(c, { srgb: true, anisotropy: 8 });
  const bump = canvasTexture(bc, { srgb: false, anisotropy: 8 });
  for (const t of [map, bump]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump };
}

// ---------------------------------------------------------------- createStyle ----------------------
/**
 * createStyle(stage, opts?) -> style   (opts: { post = true })
 * props: brickWall, neonText, neonIcon, neonPath, acrylicPlate, spillLight, cable, cableRun, transformer
 * Elements returned by neonText / neonIcon / neonPath are Groups with userData:
 *   parts[]          per letter / stroke group: { charIndex, ch, cx, level, color }
 *   setPart(i, level, color?)   set one part's intensity (0..~1.2) and optionally colour
 *   setAll(level, color?)       all parts
 *   update(t, { on, stagger = .07, seed = 1, off = null, color?, order? })   flicker-on sequence
 *   sync()           push part levels into spill lights (called by update; call after setPart)
 *   charRange(i0, i1) -> { x0, x1 }  local x extent of chars i0..i1 (text elements)
 *   feed / ends      local [x,y,0] wall feed-through points (first / all electrodes) for cable runs; width, height, cap
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const pal = spec.palette;
  const colorOf = (c) => new THREE.Color(pal[c] ?? c);
  const glassBase = new THREE.Color(spec.materials.glass.baseColor);
  materials.glass.envMapIntensity = 1.0;

  function neonMaterial(color) {
    const m = materials.glass.clone();
    m.emissive = color.clone();
    m.emissiveIntensity = 0;
    m.color = glassBase.clone().lerp(color, N.glassTint);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uCoreEdge = { value: N.coreEdge };
      sh.uniforms.uCorePow = { value: N.coreFalloff };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uCoreEdge; uniform float uCorePow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n{ float nv = abs(dot(normalize(normal), normalize(vViewPosition))); totalEmissiveRadiance *= mix(uCoreEdge, 1.0, pow(nv, uCorePow)); }");
    };
    m.customProgramCacheKey = () => "neon-core-v1";
    return m;
  }

  /** Build an element from part definitions: [{ polys: [[x,y,z]...][], ch?, charIndex? }] (z = 0 plane; tubes are lifted to standoff). */
  function buildElement(partDefs, o = {}) {
    const cap = o.cap ?? 0.5;
    const R = (o.tubeRadius ?? N.tubeRadius) * cap;
    const z = o.standoff ?? N.standoff;
    const baseColor = colorOf(o.color ?? "warmWhite");
    const group = new THREE.Group();
    group.name = o.name ?? "neon";
    const capGeoms = [], mountGeoms = [];
    const parts = [];
    const ends = [];
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;

    for (const pd of partDefs) {
      const polys = pd.polys.map((s) => s.map((p) => [p[0], p[1], z]));
      const tubeGeoms = [];
      for (const s of polys) {
        for (const p of s) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); }
        const L = pathLength(s);
        const short = L < 0.16 * cap;
        const pts = s.length === 1 ? [s[0], add(s[0], [1e-4, 0, 0])] : s;
        tubeGeoms.push(sweepGeometry(pts, R, N.radialSegments));
        if (short) {
          for (const p of [pts[0], pts[pts.length - 1]]) { const sg = new THREE.SphereGeometry(R, N.radialSegments, 8); sg.translate(...p); tubeGeoms.push(sg); }
          // single stand-off behind a dot
          const m = pointAt(pts, L / 2).p;
          mountGeoms.push(rod([m[0], m[1], 0], [m[0], m[1], z - R * 0.6], N.mountRadius));
          continue;
        }
        // electrode end caps + feed-through wires into the wall
        for (const [p, tv] of [[pts[0], nrm(sub(pts[0], pts[1]))], [pts[pts.length - 1], nrm(sub(pts[pts.length - 1], pts[pts.length - 2]))]]) {
          const cl = R * N.capLength, c0 = sub(p, mul(tv, R * 0.5)), c1 = add(c0, mul(tv, cl));
          capGeoms.push(rod(c0, c1, R * N.capRadius, 12));
          const tip = add(c1, mul(tv, R * 0.3));
          const wire = filletPath([c1, tip, add(tip, mul(tv, R * 0.8)), [tip[0] + tv[0] * R * 0.8, tip[1] + tv[1] * R * 0.8, 0.0]], R * 0.8);
          capGeoms.push(sweepGeometry(wire, N.cableRadius * 0.55, 6));
          ends.push([tip[0] + tv[0] * R * 0.8, tip[1] + tv[1] * R * 0.8, 0]);
        }
        // stand-offs every ~mountEvery metres
        const count = Math.max(1, Math.round(L / N.mountEvery));
        for (let k = 0; k < count; k++) {
          const m = pointAt(s, ((k + 0.5) / count) * L).p;
          mountGeoms.push(rod([m[0], m[1], 0.002], [m[0], m[1], z - R * 0.4], N.mountRadius));
          const base = new THREE.CylinderGeometry(N.mountRadius * 3, N.mountRadius * 3.4, 0.008, 12);
          base.rotateX(Math.PI / 2); base.translate(m[0], m[1], 0.004);
          mountGeoms.push(base);
          const clip = new THREE.TorusGeometry(R * 1.02, N.mountRadius * N.clipScale, 6, 14);
          const tg = pointAt(s, ((k + 0.5) / count) * L).t;
          clip.lookAt(new THREE.Vector3(...tg));
          clip.translate(m[0], m[1], z);
          mountGeoms.push(clip);
        }
      }
      const mat = neonMaterial(baseColor);
      const mesh = new THREE.Mesh(merge(tubeGeoms), mat);
      mesh.castShadow = true;
      mesh.name = `tube:${pd.ch ?? parts.length}`;
      group.add(mesh);
      // additive glow decal on the wall
      let decal = null;
      if (o.glow !== false) {
        const gt = glowTexture(polys, cap, R);
        const dm = new THREE.MeshBasicMaterial({ map: gt.tex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        decal = new THREE.Mesh(new THREE.PlaneGeometry(gt.w, gt.h), dm);
        decal.position.set(gt.cx, gt.cy, 0.006);
        decal.renderOrder = 1;
        group.add(decal);
      }
      let cx = 0, n = 0;
      for (const s of polys) for (const p of s) { cx += p[0]; n++; }
      parts.push({ mesh, decal, mat, ch: pd.ch, charIndex: pd.charIndex, cx: cx / n, level: 0, color: baseColor.clone() });
    }
    const capMesh = new THREE.Mesh(merge(capGeoms) ?? new THREE.BufferGeometry(), materials.cap);
    const mountMesh = new THREE.Mesh(merge(mountGeoms) ?? new THREE.BufferGeometry(), materials.mount);
    capMesh.castShadow = mountMesh.castShadow = true;
    group.add(capMesh, mountMesh);

    // spill point lights spread across the element
    const nL = o.spill ?? 1;
    const spills = [];
    for (let k = 0; k < nL; k++) {
      const x = nL === 1 ? (bx0 + bx1) / 2 : lerp(bx0 + (bx1 - bx0) * 0.2, bx1 - (bx1 - bx0) * 0.2, k / (nL - 1));
      const l = new THREE.PointLight(0x000000, SP.lightIntensity * (o.spillGain ?? 1), SP.lightDistance, 2);
      l.position.set(x, (by0 + by1) / 2, SP.lightZ);
      group.add(l);
      spills.push(l);
    }
    const halfW = Math.max(0.5, (bx1 - bx0) / Math.max(1, nL) * 1.2);
    const tmp = new THREE.Color();

    const ud = group.userData;
    Object.assign(ud, {
      parts, cap, width: bx1 - bx0, height: by1 - by0, bounds: { x0: bx0, x1: bx1, y0: by0, y1: by1 },
      feed: ends[0] ?? [bx0, by0, 0], ends, spills,
      setPart(i, level, color) {
        const p = parts[i];
        if (!p) return;
        if (color != null) {
          const c = color.isColor ? color : colorOf(color);
          if (!c.equals(p.color)) { p.color.copy(c); p.mat.emissive.copy(c); p.mat.color.copy(glassBase).lerp(c, N.glassTint); }
        }
        p.level = Math.max(0, level);
        p.mat.emissiveIntensity = p.level * N.emissive * (o.emissiveGain ?? 1) * lumaGain(p.color, N.lumaExp);
        if (p.decal) p.decal.material.color.copy(p.color).multiplyScalar(p.level * SP.glowStrength * (o.glowGain ?? 1) * lumaGain(p.color));
      },
      setAll(level, color) { parts.forEach((_, i) => ud.setPart(i, level, color)); ud.sync(); },
      sync() {
        for (const l of spills) {
          let w = 0; const acc = new THREE.Color(0, 0, 0);
          for (const p of parts) {
            const k = Math.max(0, 1 - Math.abs(p.cx - l.position.x) / halfW);
            if (k <= 0) continue;
            w += k;
            acc.add(tmp.copy(p.color).multiplyScalar(k * p.level * lumaGain(p.color)));
          }
          l.color.copy(w ? acc.multiplyScalar(1 / w) : acc);
        }
      },
      update(t, u = {}) {
        const { on = 0, stagger = 0.07, seed = 1, off = null, offStagger = 0, color, order } = u;
        parts.forEach((p, i) => {
          const k = order ? order[i] : i;
          ud.setPart(i, flicker(t, on + k * stagger, seed * 7919 + i * 131, { off: off == null ? null : off + k * offStagger }), color);
        });
        ud.sync();
      },
      charRange(i0, i1) {
        const ps = parts.filter((p) => p.charIndex >= i0 && p.charIndex <= i1);
        return { x0: Math.min(...ps.map((p) => p.x0)), x1: Math.max(...ps.map((p) => p.x1)), parts: ps.map((p) => parts.indexOf(p)) };
      },
    });
    ud.setAll(0);
    return group;
  }

  const props = {
    /** brickWall({ width, height, center:[x,y] }) -> Mesh (plane at z = 0 facing +Z) */
    brickWall(o = {}) {
      const w = { ...spec.wall, ...o };
      const { map, bump } = paintBrick(w);
      const mat = materials.wall;
      mat.map = map; mat.bumpMap = bump; mat.bumpScale = w.bumpStrength; mat.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), mat);
      m.position.set(...(o.center ?? [0, 0]), 0);
      m.receiveShadow = true;
      m.name = "brickWall";
      return m;
    },
    /** neonText(text, { height=cap m, color, align, spill=1, letterSpacing, wordSpacing, lineHeight, glow }) -> element (parts = letters) */
    neonText(text, o = {}) {
      const cap = o.height ?? 0.5;
      const lay = layoutText(text, cap, o);
      const el = buildElement(lay.chars.map((c) => ({ polys: c.strokes, ch: c.ch, charIndex: c.i })), { ...o, cap, name: `neon:${text.slice(0, 20)}` });
      el.userData.parts.forEach((p, i) => { p.x0 = lay.chars[i].x0; p.x1 = lay.chars[i].x1; });
      el.userData.text = text;
      return el;
    },
    /** neonIcon(name, { size, color, ...iconOpts, perStroke=false }) -> element (parts = 1, or 1 per stroke) */
    neonIcon(name, o = {}) {
      const strokes = ICONS[name](o).map((s) => filletPath(expandStroke(s), N.bendRadius * (o.cap ?? o.size ?? 0.5) * 0.6));
      const defs = o.perStroke ? strokes.map((s) => ({ polys: [s] })) : [{ polys: strokes }];
      return buildElement(defs, { cap: o.cap ?? Math.max(0.3, (o.size ?? 0.5) * 0.7), ...o, name: `icon:${name}` });
    },
    /** neonPath(strokes, opts) -> element from raw strokes (points [x,y] in metres and/or ["a",...] arcs) */
    neonPath(strokes, o = {}) {
      const cap = o.cap ?? 0.5;
      const polys = strokes.map((s) => filletPath(expandStroke(s), N.bendRadius * cap));
      return buildElement(o.perStroke ? polys.map((p) => ({ polys: [p] })) : [{ polys }], { ...o, cap });
    },
    /** acrylicPlate(text, { height, color, font, weight, padding }) -> Group: thick edge-lit acrylic slab with
     *  printed text; userData.setLevel(l) / update(t,{on,seed}). The polished edge is a thin glowing rim. */
    acrylicPlate(text, o = {}) {
      const P = spec.plate;
      const color = colorOf(o.color ?? "warmWhite");
      const label = createTextLabel(text, { ...textStyle, color: "#ffffff", height: o.height ?? 0.3, font: o.font ? FONTS[o.font] ?? o.font : textStyle.font, weight: o.weight ?? textStyle.weight, padding: o.padding ?? P.padding, letterSpacing: o.letterSpacing ?? 6 });
      const w = label.scale.x, h = label.scale.y, rad = Math.min(P.radius, h * 0.25);
      const slabMat = materials.acrylic.clone();
      slabMat.emissive = color.clone();
      slabMat.emissiveIntensity = 0;
      const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, P.depth, 4, rad), slabMat);
      const g = new THREE.Group();
      const z = o.standoff ?? N.standoff;
      slab.position.z = z; label.position.z = z + P.depth / 2 + 0.002;
      g.add(slab, label);
      // edge glow: light piped through the acrylic exits at the polished rim -> a rounded-rect "tube" on the
      // front and back edges of the slab, emissive like neon (same core shader), plus the side faces.
      const rimPts = [];
      const rw = w / 2 - rad * 0.35, rh = h / 2 - rad * 0.35, rr = rad * 0.65;
      for (const [cx, cy, a0] of [[rw - rr, rh - rr, 0], [-rw + rr, rh - rr, 90], [-rw + rr, -rh + rr, 180], [rw - rr, -rh + rr, 270]])
        for (let k = 0; k <= 6; k++) { const a = (a0 + k * 15) * DEG; rimPts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
      rimPts.push(rimPts[0], rimPts[1]);
      const rimGeo = [];
      for (const dz of [P.depth / 2 - P.rim, -P.depth / 2 + P.rim]) rimGeo.push(sweepGeometry(rimPts.map(([x, y]) => [x, y, z + dz]), P.rim, 8));
      const rimMat = neonMaterial(color);
      const rim = new THREE.Mesh(merge(rimGeo), rimMat);
      g.add(rim);
      const scr = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = sx * (w / 2 - 0.06), y = sy * (h / 2 - 0.05);
        scr.push(rod([x, y, 0.002], [x, y, z + P.depth / 2 + 0.006], 0.008, 10));
        const head = new THREE.CylinderGeometry(0.016, 0.016, 0.006, 14);
        head.rotateX(Math.PI / 2); head.translate(x, y, z + P.depth / 2 + 0.005);
        scr.push(head);
      }
      const screws = new THREE.Mesh(merge(scr), materials.mount);
      screws.castShadow = slab.castShadow = true;
      g.add(screws);
      const gt = glowTexture([[[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], [-w / 2, -h / 2, 0]]], h * 0.9, 0.01);
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(gt.w, gt.h), new THREE.MeshBasicMaterial({ map: gt.tex, color: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      decal.position.set(gt.cx, gt.cy, 0.006);
      g.add(decal);
      const light = new THREE.PointLight(0x000000, SP.lightIntensity * (o.spillGain ?? 0.4), SP.lightDistance, 2);
      light.position.set(0, -h * 0.9, SP.lightZ); // below centre: no specular hotspot on the glossy face
      if (o.spill !== false) g.add(light);
      g.userData = {
        width: w, height: h, label, slab, rim,
        setLevel(l) {
          const k = clamp(l, 0, 1.3);
          label.material.color.copy(color).multiplyScalar(lerp(P.unlit, P.emissive, k));
          slabMat.emissiveIntensity = k * P.body;
          rimMat.emissiveIntensity = k * P.edge * lumaGain(color, N.lumaExp);
          decal.material.color.copy(color).multiplyScalar(k * SP.glowStrength * 0.6);
          light.color.copy(color).multiplyScalar(k);
        },
        update(t, { on = 0, seed = 1, off = null } = {}) { g.userData.setLevel(flicker(t, on, seed, { off })); },
      };
      g.userData.setLevel(0);
      return g;
    },
    /** spillLight({ color, position:[x,y,z], intensity }) -> PointLight; set .intensity from a flicker level */
    spillLight(o = {}) {
      const l = new THREE.PointLight(colorOf(o.color ?? "warmWhite"), o.intensity ?? SP.lightIntensity, o.distance ?? SP.lightDistance, 2);
      l.position.set(...(o.position ?? [0, 0, SP.lightZ]));
      return l;
    },
    /** cable(points [[x,y,z]], { radius, bend }) -> Mesh: thin black cable along a filleted path */
    cable(points, o = {}) {
      const pts = filletPath(points.map((p) => [p[0], p[1], p[2] ?? N.cableRadius]), o.bend ?? 0.06);
      const m = new THREE.Mesh(sweepGeometry(pts, o.radius ?? N.cableRadius, 8), materials.cable);
      m.castShadow = true;
      return m;
    },
    /** cableRun(from [x,y], to [x,y], { viaY, viaX, clips=true }) -> Group: wall-hugging cable with clips (world coords on the wall) */
    cableRun(from, to, o = {}) {
      const z = N.cableRadius + 0.002;
      const pts = [[from[0], from[1], z]];
      if (o.viaY != null) pts.push([from[0], o.viaY, z], [o.viaX ?? to[0], o.viaY, z]);
      if (o.viaX != null) pts.push([o.viaX, to[1], z]);
      pts.push([to[0], to[1], z]);
      const g = new THREE.Group();
      g.add(props.cable(pts, o));
      if (o.clips !== false) {
        const path = filletPath(pts, 0.06), L = pathLength(path), cl = [];
        for (let s = 0.25; s < L - 0.1; s += 0.6) {
          const { p, t: tv } = pointAt(path, s);
          const b = new THREE.BoxGeometry(0.03, 0.03, 0.012);
          b.rotateZ(Math.atan2(tv[1], tv[0]) + Math.PI / 2);
          b.translate(p[0], p[1], z + 0.002);
          cl.push(b);
        }
        if (cl.length) g.add(new THREE.Mesh(merge(cl), materials.mount));
      }
      return g;
    },
    /** transformer({ w, h, d, label }) -> Group: wall-mounted neon transformer box (back face at z = 0) */
    transformer(o = {}) {
      const T = { ...spec.transformer, ...o };
      const g = new THREE.Group();
      const box = new THREE.Mesh(new RoundedBoxGeometry(T.w, T.h, T.d, 3, 0.015), materials.housing);
      box.position.z = T.d / 2;
      box.castShadow = box.receiveShadow = true;
      const plate = createTextLabel(o.label ?? "NEON TRANSFORMER\n12 kV  30 mA", { font: FONTS.sans, weight: 700, color: "#1a1a1a", background: "#b9b3a6", height: T.h * 0.13, padding: 0.4, lit: true, radius: 6, lineHeight: 1.2 });
      plate.position.set(0, T.h * 0.05, T.d + 0.002);
      const fl = [];
      for (const sx of [-1, 1]) { const f = new THREE.BoxGeometry(0.05, T.h + 0.08, 0.006); f.translate(sx * (T.w / 2 - 0.04), 0, 0.003); fl.push(f); }
      const gl = rod([-T.w * 0.25, T.h / 2 - 0.02, T.d / 2], [-T.w * 0.25, T.h / 2 + 0.04, T.d / 2], 0.022, 12);
      const gl2 = rod([T.w * 0.25, T.h / 2 - 0.02, T.d / 2], [T.w * 0.25, T.h / 2 + 0.04, T.d / 2], 0.022, 12);
      const hw = new THREE.Mesh(merge([...fl, gl, gl2]), materials.mount);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 10), new THREE.MeshStandardMaterial({ color: "#200000", emissive: colorOf(T.lamp), emissiveIntensity: T.lampGlow }));
      lamp.position.set(T.w * 0.32, -T.h * 0.32, T.d + 0.004);
      g.add(box, plate, hw, lamp);
      g.userData = { inputs: [[-T.w * 0.25, T.h / 2 + 0.04], [T.w * 0.25, T.h / 2 + 0.04]], w: T.w, h: T.h };
      return g;
    },
  };

  return {
    spec,
    palette: pal,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      brickWall: (s) => props.brickWall(s.dims ?? {}),
      neonText: (s) => props.neonText(s.text ?? "", s.textOpts ?? s.dims ?? {}),
      neonIcon: (s) => props.neonIcon(s.icon ?? "arrow", s.dims ?? {}),
      acrylicPlate: (s) => props.acrylicPlate(s.text ?? "", s.textOpts ?? s.dims ?? {}),
      transformer: (s) => props.transformer(s.dims ?? {}),
    },
    flicker,
    color: colorOf,
    sfx: spec.sfx,
  };
}
