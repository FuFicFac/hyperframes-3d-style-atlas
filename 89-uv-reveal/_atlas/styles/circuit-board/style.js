// styles/circuit-board/style.js — "Circuit Board": a macro photograph of a printed circuit board.
// The board top is ONE baked canvas (mask over laminate / copper pour, covered decorative traces with
// clearance gaps, tented vias, silkscreen outlines + reference designators in a single-stroke font), plus a
// matching height/roughness canvas. Exposed copper (signal traces, pads, vias) is real geometry in gold or
// copper; parts are built from boxes/extrusions; signals are additive HDR ribbons driven by the THREE-free
// planner ./signals.js (shared with scene.config.js, so SCORE and camera keys come from the same plan).
// Everything is synchronous and seeded; time enters only through userData.set*/update calls from renderAt.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { rng, clamp, hash01 } from "../../kit/time.js";
import { makeCanvas, canvasTexture, paintPixels } from "../../kit/textures.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { depthOfField as kitDepthOfField } from "../../kit/studio.js";
import * as plan from "./signals.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, plan };

const col = (c) => new THREE.Color(c);

// ======================================================================= stroke-font drawing ========
/**
 * drawStrokeText(ctx, text, { x, y, cap, align = "left", width, color }) — single-stroke silkscreen lettering
 * on a 2D canvas (px units; y = baseline). Measure first with strokeTextWidth(text, cap).
 */
export function drawStrokeText(ctx, text, { x, y, cap, align = "left", width, color }) {
  const L = layoutStrokeText(text, cap, { align, letterSpacing: 0.3, wordSpacing: 0.6 });
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const c of L.chars) for (const s of c.strokes) {
    ctx.beginPath();
    s.forEach((p, k) => (k ? ctx.lineTo(x + p[0], y - p[1]) : ctx.moveTo(x + p[0], y - p[1])));
    if (s.length === 1) ctx.lineTo(x + s[0][0] + 0.01, y - s[0][1]);
    ctx.stroke();
  }
  ctx.restore();
  return L.width;
}
export const strokeTextWidth = (text, cap) => layoutStrokeText(text, cap, { letterSpacing: 0.3, wordSpacing: 0.6 }).width;

// ======================================================================= trace geometry =============
const nrm2 = (d) => [-d[1], d[0]];
function miterOffsets(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    const d1 = i > 0 ? dirOf(a, b) : dirOf(b, c), d2 = i < n - 1 ? dirOf(b, c) : d1;
    const n1 = nrm2(d1), n2 = nrm2(d2);
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const l = Math.hypot(m[0], m[1]) || 1; m = [m[0] / l, m[1] / l];
    const k = 1 / Math.max(0.35, m[0] * n2[0] + m[1] * n2[1]);
    out.push([m[0] * k, m[1] * k]);
  }
  return out;
}
function dirOf(a, b) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }

/**
 * traceGeometry(pts [[x,z]], { width, height, topInset }) -> BufferGeometry: an exposed copper trace with a
 * flat top and sloped walls (trapezoid section), mitered at the 45° bends, flat end caps. Non-indexed
 * (faceted normals = crisp glints on every wall).
 */
export function traceGeometry(pts, { width = STYLE_SPEC.trace.width, height = STYLE_SPEC.trace.height, topInset = STYLE_SPEC.trace.topInset } = {}) {
  const hw = width / 2, ht = hw * (1 - topInset), off = miterOffsets(pts);
  const P = [];
  const V = (p, o, s, y) => [p[0] + o[0] * s, y, p[1] + o[1] * s];
  const quad = (a, b, c, d, hint) => {
    // a-b-c-d around a quad; flip so the face normal points along hint
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ok = nn[0] * hint[0] + nn[1] * hint[1] + nn[2] * hint[2] >= 0;
    const tri = ok ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const q of tri) P.push(...q);
  };
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], o0 = off[i - 1], o1 = off[i];
    const nn = nrm2(dirOf(p0, p1));
    const L0 = V(p0, o0, hw, 0), L1 = V(p1, o1, hw, 0), R0 = V(p0, o0, -hw, 0), R1 = V(p1, o1, -hw, 0);
    const lt0 = V(p0, o0, ht, height), lt1 = V(p1, o1, ht, height), rt0 = V(p0, o0, -ht, height), rt1 = V(p1, o1, -ht, height);
    quad(lt0, lt1, rt1, rt0, [0, 1, 0]);
    quad(L0, L1, lt1, lt0, [nn[0], 0.3, nn[1]]);
    quad(R0, R1, rt1, rt0, [-nn[0], 0.3, -nn[1]]);
  }
  const cap = (i, sgn) => {
    const p = pts[i], o = off[i], d = i === 0 ? dirOf(pts[0], pts[1]) : dirOf(pts[i - 1], pts[i]);
    quad(V(p, o, hw, 0), V(p, o, -hw, 0), V(p, o, -ht, height), V(p, o, ht, height), [d[0] * sgn, 0, d[1] * sgn]);
  };
  cap(0, -1); cap(pts.length - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

/** ribbonGeometry(pts, cum, width, y) -> flat mitered strip with attributes aS (arc length, m) and aV (-1..1 across). */
export function ribbonGeometry(pts, cum, width, y) {
  const off = miterOffsets(pts), hw = width / 2;
  const pos = [], aS = [], aV = [], idx = [];
  pts.forEach((p, i) => {
    for (const s of [1, -1]) {
      pos.push(p[0] + off[i][0] * hw * s, y, p[1] + off[i][1] * hw * s);
      aS.push(cum[i]); aV.push(s);
    }
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute("aV", new THREE.Float32BufferAttribute(aV, 1));
  g.setIndex(idx);
  return g;
}

// ======================================================================= pulse / flash shaders ======
const PULSE_VS = /* glsl */ `attribute float aS; attribute float aV; varying float vS; varying float vV;
void main(){ vS = aS; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PULSE_FS = /* glsl */ `uniform float uHead, uTail, uLevel, uPowered, uCore, uLen; uniform vec3 uColor, uAfter; varying float vS; varying float vV;
void main(){
  float d = uHead - vS;
  float behind = step(0.0, d);
  float tail = behind * (1.0 - smoothstep(0.0, uTail, d)); tail *= tail;
  float tip = exp(-abs(d) * 30.0);
  float a = abs(vV);
  float core = 1.0 - smoothstep(uCore * 0.55, uCore, a);
  float halo = exp(-a * a * 7.0);
  float pulse = (tail + tip * 0.9) * uLevel * (core + halo * 0.45);
  float after = behind * step(vS, uLen) * uPowered * (core * 0.85 + halo * 0.2);
  gl_FragColor = vec4(uColor * pulse + uAfter * after, 1.0);
}`;

const FLASH_FS = /* glsl */ `uniform vec3 uColor; uniform float uLevel; varying vec2 vUv;
void main(){ vec2 q = vUv * 2.0 - 1.0; float r2 = dot(q, q); float a = exp(-r2 * 6.0) * (1.0 - smoothstep(0.8, 1.0, r2)); gl_FragColor = vec4(uColor * a * uLevel, 1.0); }`;
const FLASH_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ======================================================================= createStyle ================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, dof = true, palette = "green" | "blue" | "black" | "red" | "purple" | "copper" }
 *   style.render(t, { focus: [x,y,z] }) = DOF focus on a world point + stage.render(t).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = { ...spec.palette, ...(spec.palettes[opts.palette ?? "green"] ?? {}) };
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: pal.silk, height: spec.text.height };
  materials.metal.color.set(pal.metal);
  materials.edge.color.set(pal.edge);
  for (const k of Object.keys(materials)) if (materials[k].isMeshStandardMaterial) materials[k].envMapIntensity = 1;
  materials.epoxy.envMapIntensity = 0.35;
  const dof = opts.dof === false || !post ? { pass: null, setFocus() {} } : kitDepthOfField(stage, { ...spec.dof });

  const B = spec.board, T = spec.trace;
  const shadowed = (m) => { m.castShadow = m.receiveShadow = true; return m; };

  // ------------------------------------------------------------------ board ------------------------
  /**
   * board({ seed, w, d }) -> Group (board top at y = 0). userData:
   *   place(obj, [x, z], rotY = 0)  add a part; its userData.footprint (clear/silk/keep, part-local) is registered
   *   addTrace(route)               register exposed copper (mask clearance + no decorative traces nearby)
   *   reserve([cx, cz, w, d])       keep decorative traces out (caption areas)
   *   silk(item)                    extra baked silkscreen: { text, at, cap, align } | { rect } | { line } | { dot }
   *   bake()                        paint the board canvases ONCE, after everything is placed
   */
  function board(o = {}) {
    const w = o.w ?? B.w, d = o.d ?? B.d, th = B.thickness, seed = o.seed ?? 7;
    const g = new THREE.Group();
    g.name = "board";
    const shape = new THREE.Shape(), r = B.corner, x = -w / 2, y = -d / 2;
    shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
    shape.lineTo(x + w, y + d - r); shape.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2);
    shape.lineTo(x + r, y + d); shape.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI);
    shape.lineTo(x, y + r); shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2); // shape y -> -z; extrude +z -> +y
    geo.translate(0, -th, 0);
    const mask = materials.mask;
    const body = new THREE.Mesh(geo, [mask, materials.edge]);
    body.receiveShadow = true; body.castShadow = true;
    g.add(body);

    const clears = [], silks = [], keeps = [];
    const H = B.holes;
    const holes = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - H.inset), sz * (d / 2 - H.inset)]);
    // plated mounting holes: gold ring + dark hole
    for (const [hx, hz] of holes) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(H.r, H.ring, 40), materials.metal);
      ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.003, hz); ring.receiveShadow = true;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(H.r, 32), materials.hole);
      hole.rotation.x = -Math.PI / 2; hole.position.set(hx, 0.0025, hz);
      g.add(ring, hole);
      clears.push({ circle: [hx, hz, H.ring + B.clearance] });
      silks.push({ circle: [hx, hz, H.ring + 0.07] });
    }
    // fiducials (bare gold dots in a clear ring)
    for (const [fx, fz] of [[-w / 2 + 0.62, d / 2 - 0.3], [w / 2 - 0.62, -d / 2 + 0.3]]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(B.fiducial.r, 24), materials.metal);
      f.rotation.x = -Math.PI / 2; f.position.set(fx, 0.003, fz);
      g.add(f);
      clears.push({ circle: [fx, fz, B.fiducial.clear] });
    }

    const tf = (it, at, rot) => {
      // part-local -> board coordinates (rot about +Y, multiples of 90° expected)
      const c = Math.cos(rot), s = Math.sin(rot);
      const P = (p) => [at[0] + p[0] * c + p[1] * s, at[1] - p[0] * s + p[1] * c];
      const out = { ...it };
      if (it.rect) { const q = P(it.rect); const sw = Math.abs(c) > 0.5; out.rect = [q[0], q[1], sw ? it.rect[2] : it.rect[3], sw ? it.rect[3] : it.rect[2]]; }
      if (it.circle) out.circle = [...P(it.circle), it.circle[2]];
      if (it.dot) out.dot = [...P(it.dot), it.dot[2]];
      if (it.at) out.at = P(it.at);
      if (it.line) out.line = it.line.map(P);
      return out;
    };

    g.userData = {
      w, d,
      place(obj, at, rot = 0) {
        obj.position.set(at[0], 0, at[1]);
        obj.rotation.y = rot;
        g.add(obj);
        const F = obj.userData.footprint ?? {};
        for (const it of F.clear ?? []) clears.push(tf(it, at, rot));
        for (const it of F.silk ?? []) silks.push(tf(it, at, rot));
        for (const it of F.keep ?? []) keeps.push(tf(it, at, rot));
        return obj;
      },
      addTrace(route, width = T.width) { clears.push({ line: route.pts, width: width + 2 * B.clearance }); keeps.push({ line: route.pts, width: width + 0.24 }); },
      reserve(rect) { keeps.push({ rect }); },
      silk(item) { silks.push(item); },
      bake() {
        const ppm = B.pxPerMetre, bpm = B.bumpPerMetre;
        const deco = decoTraces({ w, d, seed, keeps, clears });
        const colorCanvas = makeCanvas(Math.round(w * ppm), Math.round(d * ppm));
        paintBoard(colorCanvas.getContext("2d"), ppm, { w, d, clears, silks, deco, mode: "color", seed });
        const bumpCanvas = makeCanvas(Math.round(w * bpm), Math.round(d * bpm));
        paintBoard(bumpCanvas.getContext("2d"), bpm, { w, d, clears, silks, deco, mode: "bump", seed });
        const map = canvasTexture(colorCanvas, { srgb: true, anisotropy: 8 });
        const bump = canvasTexture(bumpCanvas, { srgb: false, anisotropy: 8 });
        for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / w, 1 / d); t.offset.set(0.5, 0.5); }
        Object.assign(mask, { map, roughnessMap: bump, bumpMap: bump, bumpScale: B.bumpScale, roughness: 1 });
        mask.color.set("#ffffff");
        mask.needsUpdate = true;
        g.userData.decoCount = deco.length;
      },
    };
    return g;
  }

  // decorative covered traces: seeded octilinear random walks on a coarse grid that never cross each other,
  // the exposed copper, the parts, or reserved caption areas. Pure function of the inputs.
  function decoTraces({ w, d, seed, keeps, clears }) {
    const cell = 0.06, nx = Math.floor(w / cell), nz = Math.floor(d / cell);
    const occ = new Uint8Array(nx * nz);
    const toC = (x, z) => [Math.floor((x + w / 2) / cell), Math.floor((z + d / 2) / cell)];
    const mark = (i, j) => { if (i >= 0 && j >= 0 && i < nx && j < nz) occ[j * nx + i] = 1; };
    const markRect = (cx, cz, rw, rd) => {
      const [i0, j0] = toC(cx - rw / 2, cz - rd / 2), [i1, j1] = toC(cx + rw / 2, cz + rd / 2);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mark(i, j);
    };
    const markLine = (pts, width) => {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / (cell * 0.4)) + 1;
        for (let q = 0; q <= n; q++) { const u = q / n; markRect(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, width, width); }
      }
    };
    const inset = B.pourInset + 0.08;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = -w / 2 + (i + 0.5) * cell, z = -d / 2 + (j + 0.5) * cell;
      if (Math.abs(x) > w / 2 - inset || Math.abs(z) > d / 2 - inset) occ[j * nx + i] = 1;
    }
    for (const k of keeps) { if (k.rect) markRect(k.rect[0], k.rect[1], k.rect[2] + 0.1, k.rect[3] + 0.1); if (k.line) markLine(k.line, k.width ?? 0.2); }
    for (const c of clears) { if (c.rect) markRect(c.rect[0], c.rect[1], c.rect[2] + 0.12, c.rect[3] + 0.12); if (c.circle) markRect(c.circle[0], c.circle[1], c.circle[2] * 2 + 0.12, c.circle[2] * 2 + 0.12); }
    const R = rng(seed * 31 + 5);
    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && !occ[j * nx + i];
    const out = [];
    let tries = 0;
    while (out.length < B.decoTraces && tries++ < B.decoTraces * 40) {
      let i = R.int(0, nx - 1), j = R.int(0, nz - 1);
      if (!free(i, j)) continue;
      let dir = R.int(0, 3) * 2; // start straight
      const cells = [[i, j]], seen = new Set([`${i},${j}`]);
      const target = R.int(10, 44);
      let run = R.int(3, 10);
      while (cells.length < target) {
        if (run-- <= 0) { dir = (dir + (R.chance(0.5) ? 1 : 7)) % 8; run = R.int(2, 9); }
        const [di, dj] = DIRS[dir], ni = i + di, nj = j + dj;
        let ok = free(ni, nj) && !seen.has(`${ni},${nj}`);
        // no touching own earlier path (keep a one-cell gap except the last two cells)
        if (ok) for (let q = 0; q < cells.length - 2 && ok; q++) if (Math.abs(cells[q][0] - ni) <= 1 && Math.abs(cells[q][1] - nj) <= 1) ok = false;
        if (di && dj && ok) ok = free(i + di, j) || free(i, j + dj) ? ok : false;
        if (!ok) break;
        i = ni; j = nj; cells.push([i, j]); seen.add(`${i},${j}`);
      }
      if (cells.length < 6) continue;
      for (const [ci, cj] of cells) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) mark(ci + a, cj + b);
      const pts = cells.map(([ci, cj]) => [-w / 2 + (ci + 0.5) * cell, -d / 2 + (cj + 0.5) * cell]);
      out.push({ pts: simplify(pts), width: R.range(B.decoWidth[0], B.decoWidth[1]), vias: [R.chance(0.7), R.chance(0.7)] });
    }
    return out;
  }
  const simplify = (pts) => pts.filter((p, k) => {
    if (k === 0 || k === pts.length - 1) return true;
    const a = pts[k - 1], c = pts[k + 1];
    return Math.abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 1e-9;
  });

  function paintBoard(ctx, ppm, { w, d, clears, silks, deco, mode, seed }) {
    const W = ctx.canvas.width, Hh = ctx.canvas.height;
    const X = (x) => (x + w / 2) * ppm, Z = (z) => (z + d / 2) * ppm, M = (m) => m * ppm;
    const C = mode === "color"
      ? { bare: pal.maskBare, pour: pal.maskCopper, trace: pal.maskTrace, silk: pal.silk, via: pal.maskTrace }
      : Object.fromEntries(["bare", "pour", "trace", "silk"].map((k) => [k, `rgb(${Math.round(B.height[k] * 255)},${Math.round(B.roughness[k] * 255)},0)`]));
    if (mode !== "color") C.via = C.trace;
    ctx.reset?.();
    ctx.fillStyle = C.bare; ctx.fillRect(0, 0, W, Hh);
    // copper pour (mask over copper reads lighter)
    const pi = B.pourInset;
    ctx.fillStyle = C.pour;
    ctx.beginPath(); ctx.roundRect(X(-w / 2 + pi), Z(-d / 2 + pi), M(w - 2 * pi), M(d - 2 * pi), M(0.12)); ctx.fill();
    if (mode === "color") {
      // low-frequency mottle in the mask coat (seeded value noise, scaled up = soft)
      const nz = paintPixels([128, 72], (u, v, x, y) => 0.5 + (hash01(x >> 2, y >> 2, seed) - 0.5) * 0.5 + (hash01(x, y, seed + 1) - 0.5) * 0.25);
      ctx.save(); ctx.globalAlpha = B.mottle; ctx.globalCompositeOperation = "overlay"; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nz, 0, 0, W, Hh); ctx.restore();
    }
    // decorative covered traces: clearance gap, then the trace (lighter), tented via rings at the ends
    const polyline = (pts) => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1])))); };
    ctx.lineCap = "round"; ctx.lineJoin = "miter";
    for (const t of deco) { ctx.strokeStyle = C.bare; ctx.lineWidth = M(t.width + 2 * B.clearance * 0.8); polyline(t.pts); ctx.stroke(); }
    for (const t of deco) { ctx.strokeStyle = C.trace; ctx.lineWidth = M(t.width); polyline(t.pts); ctx.stroke(); }
    for (const t of deco) t.vias.forEach((v, k) => {
      if (!v) return;
      const p = k ? t.pts[t.pts.length - 1] : t.pts[0];
      ctx.fillStyle = C.bare; ctx.beginPath(); ctx.arc(X(p[0]), Z(p[1]), M(0.06), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.via; ctx.beginPath(); ctx.arc(X(p[0]), Z(p[1]), M(0.042), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.bare; ctx.beginPath(); ctx.arc(X(p[0]), Z(p[1]), M(0.016), 0, Math.PI * 2); ctx.fill();
    });
    // clearance around exposed copper (traces, pads, rings)
    ctx.fillStyle = C.bare; ctx.strokeStyle = C.bare;
    for (const c of clears) {
      if (c.rect) { const [cx, cz, rw, rd] = c.rect; ctx.beginPath(); ctx.roundRect(X(cx - rw / 2), Z(cz - rd / 2), M(rw), M(rd), M(Math.min(rw, rd) * 0.2)); ctx.fill(); }
      if (c.circle) { ctx.beginPath(); ctx.arc(X(c.circle[0]), Z(c.circle[1]), M(c.circle[2]), 0, Math.PI * 2); ctx.fill(); }
      if (c.line) { ctx.lineWidth = M(c.width); ctx.lineJoin = "round"; polyline(c.line); ctx.stroke(); }
    }
    // silkscreen
    const sw = M(0.014);
    ctx.strokeStyle = C.silk; ctx.fillStyle = C.silk; ctx.lineWidth = sw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of silks) {
      if (s.rect) { const [cx, cz, rw, rd] = s.rect; ctx.strokeRect(X(cx - rw / 2), Z(cz - rd / 2), M(rw), M(rd)); }
      if (s.circle) { ctx.beginPath(); ctx.arc(X(s.circle[0]), Z(s.circle[1]), M(s.circle[2]), 0, Math.PI * 2); ctx.stroke(); }
      if (s.dot) { ctx.beginPath(); ctx.arc(X(s.dot[0]), Z(s.dot[1]), M(s.dot[2]), 0, Math.PI * 2); ctx.fill(); }
      if (s.line) { ctx.lineWidth = M(s.width ?? 0.014); polyline(s.line); ctx.stroke(); ctx.lineWidth = sw; }
      if (s.text) {
        const cap = M(s.cap ?? 0.07);
        drawStrokeText(ctx, s.text, { x: X(s.at[0]), y: Z(s.at[1]) + cap / 2, cap, align: s.align ?? "center", width: cap * spec.silk.stroke, color: C.silk });
      }
    }
  }

  // ------------------------------------------------------------------ copper -----------------------
  /** trace(route, { width, metal }) -> Mesh (exposed copper along an octiRoute). Register it: pcb.userData.addTrace(route). */
  function trace(route, o = {}) {
    const m = new THREE.Mesh(traceGeometry(route.pts, { width: o.width ?? T.width }), o.material ?? materials.metal);
    m.castShadow = false; m.receiveShadow = true;
    m.userData.route = route;
    return m;
  }
  /** vias(list [[x,z]]) -> Group: gold annular rings with a dark drill hole (instanced). */
  function vias(list) {
    const V = spec.via, g = new THREE.Group();
    const ring = new THREE.InstancedMesh(new THREE.CylinderGeometry(V.ring, V.ring, T.height, 24, 1, false), materials.metal, list.length);
    const hole = new THREE.InstancedMesh(new THREE.CircleGeometry(V.drill, 20), materials.hole, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    list.forEach((p, k) => {
      ring.setMatrixAt(k, m4.makeTranslation(p[0], T.height / 2, p[1]));
      hole.setMatrixAt(k, m4.compose(new THREE.Vector3(p[0], T.height + 0.0006, p[1]), q, new THREE.Vector3(1, 1, 1)));
    });
    ring.receiveShadow = true;
    g.add(ring, hole);
    g.userData.footprint = { clear: list.map((p) => ({ circle: [p[0], p[1], V.ring + spec.board.clearance] })) };
    g.userData.local = true; // positions already in board coordinates: place at [0, 0]
    return g;
  }
  /** pad({ w, d, round }) -> Mesh (gold SMD pad, lying on the board). */
  function pad({ w = 0.1, d = 0.15, round = false } = {}) {
    const h = spec.pad.height;
    const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, h, 24) : new RoundedBoxGeometry(w, h, d, 1, Math.min(w, d) * 0.12);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, materials.metal);
    m.receiveShadow = true;
    return m;
  }

  // ------------------------------------------------------------------ labels -----------------------
  function labelCanvas(text, cap, ppm, { lines = null, pad = 0.4 } = {}) {
    const L = lines ?? [text];
    const capPx = cap * ppm, wPx = Math.max(...L.map((s) => strokeTextWidth(s, capPx))) + capPx * pad * 2;
    const lh = capPx * 1.6, hPx = lh * L.length + capPx * pad * 2 - (lh - capPx);
    const c = makeCanvas(Math.ceil(wPx), Math.ceil(hPx)), ctx = c.getContext("2d");
    L.forEach((s, k) => drawStrokeText(ctx, s, { x: wPx / 2, y: capPx * pad + capPx + k * lh, cap: capPx, align: "center", width: capPx * spec.silk.stroke * 1.05, color: "#ffffff" }));
    return { canvas: c, w: c.width / ppm, h: c.height / ppm };
  }

  /**
   * silkLabel(text, { cap, align = "left"|"center", lines }) -> Mesh lying on the board (origin = left/centre of
   * the text block). userData.setReveal(u) prints it on left -> right (0 = hidden), with a faint warm glow at
   * the printing edge. Also returns userData.size = [w, d] for pcb.userData.reserve.
   */
  function silkLabel(text, o = {}) {
    const S = spec.silk, cap = o.cap ?? S.cap;
    const { canvas, w, h } = labelCanvas(text, cap, S.pxPerMetre, { lines: o.lines });
    const tex = canvasTexture(canvas, { srgb: true, anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({ color: S.color, map: tex, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.envMapIntensity = 0.5;
    const U = { uReveal: { value: 0 }, uEdge: { value: col(pal.pulse).multiplyScalar(S.edgeGlow) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uReveal; uniform vec3 uEdge;")
        .replace("#include <map_fragment>", `#include <map_fragment>
  float rvX = uReveal * 1.08 - 0.04;
  float rv = 1.0 - smoothstep(rvX - 0.03, rvX + 0.01, vMapUv.x);
  diffuseColor.a *= rv;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += uEdge * exp(-abs(vMapUv.x - rvX) * 40.0) * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));`);
    };
    mat.customProgramCacheKey = () => "circuit-board-silk";
    const geo = new THREE.PlaneGeometry(w, h);
    geo.rotateX(-Math.PI / 2);
    if ((o.align ?? "left") === "left") geo.translate(w / 2 - cap * 0.4, 0, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.0012;
    m.renderOrder = 2;
    m.receiveShadow = true;
    m.userData.size = [w, h];
    m.userData.setReveal = (u) => { U.uReveal.value = u; m.visible = u > 0.001; };
    m.userData.setReveal(0);
    return m;
  }

  // ------------------------------------------------------------------ parts ------------------------
  /**
   * chip({ kind: "qfp"|"soic", body: [w, d, h], perSide, pitch, name, ref }) -> Group (origin = body centre on
   *   the board). Black epoxy body, gull-wing tin pins on gold pads, a laser-etched label (stroke font) that
   *   glows when powered, pin-1 dimple, silkscreen outline + reference designator in its footprint.
   *   userData.setPower(p) (0..1; >1 flares), pinAt(side, i) (part-local [x, z]).
   */
  function chip(part) {
    const C = spec.chip, [w, d, h] = part.body, n = part.perSide, standoff = 0.012;
    const g = new THREE.Group();
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, C.corner), materials.epoxy));
    body.position.y = standoff + h / 2;
    g.add(body);
    const sides = part.kind === "soic" ? ["N", "S"] : ["W", "E", "N", "S"];
    const local = { ...part, at: [0, 0] };
    // pin: gull-wing profile in (outward, up), extruded across
    const t = C.pinThickness, hb = standoff + h * 0.45, padH = spec.pad.height, reach = C.padOut + C.padLen * 0.32;
    const ps = new THREE.Shape([
      [-0.01, hb + t / 2], [0.028, hb + t / 2], [0.058, padH + t], [reach, padH + t], [reach, padH], [0.05, padH], [0.02, hb - t / 2], [-0.01, hb - t / 2],
    ].map(([a, b]) => new THREE.Vector2(a, b)));
    const pinW = part.pitch * 0.45;
    const pinGeo = new THREE.ExtrudeGeometry(ps, { depth: pinW, bevelEnabled: false });
    pinGeo.translate(0, 0, -pinW / 2);
    const padGeo = new RoundedBoxGeometry(C.padLen, padH, part.pitch * C.padWidthFrac, 1, 0.006);
    padGeo.translate(0, padH / 2, 0);
    const count = sides.length * n;
    const pins = new THREE.InstancedMesh(pinGeo, materials.tin, count);
    const pads = new THREE.InstancedMesh(padGeo, materials.metal, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const ROT = { E: 0, W: Math.PI, N: Math.PI / 2, S: -Math.PI / 2 };
    let k = 0;
    const clear = [];
    for (const side of sides) for (let i = 0; i < n; i++) {
      const pp = plan.partPin(local, side, i);
      q.setFromAxisAngle(Y, ROT[side]);
      const out = side === "E" ? [1, 0] : side === "W" ? [-1, 0] : side === "N" ? [0, -1] : [0, 1];
      const edge = [pp[0] - out[0] * C.padOut, pp[1] - out[1] * C.padOut];
      pins.setMatrixAt(k, m4.compose(new THREE.Vector3(edge[0], 0, edge[1]), q, one));
      pads.setMatrixAt(k, m4.compose(new THREE.Vector3(pp[0], 0, pp[1]), q, one));
      k++;
    }
    for (const side of sides) {
      const a = plan.partPin(local, side, 0), b = plan.partPin(local, side, n - 1);
      const horiz = side === "N" || side === "S";
      const rw = horiz ? Math.abs(b[0] - a[0]) + part.pitch : C.padLen, rd = horiz ? C.padLen : Math.abs(b[1] - a[1]) + part.pitch;
      clear.push({ rect: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, rw + 0.05, rd + 0.05] });
    }
    pins.castShadow = true; pins.receiveShadow = true; pads.receiveShadow = true;
    g.add(pins, pads);
    // laser-etched label (stroke font), emissive when powered
    const lab = labelCanvas(part.name ?? "", C.labelCap, 1600, { lines: part.lines });
    const tex = canvasTexture(lab.canvas, { srgb: true });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const lmat = new THREE.MeshStandardMaterial({ color: pal.chipInk, map: tex, transparent: true, roughness: 0.75, depthWrite: false,
      emissive: pal.glow, emissiveMap: tex, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const lg = new THREE.PlaneGeometry(lab.w, lab.h); lg.rotateX(-Math.PI / 2);
    const label = new THREE.Mesh(lg, lmat);
    label.position.set(0, standoff + h + 0.0008, part.labelZ ?? 0);
    const fit = Math.min(1, (w * 0.86) / lab.w);
    label.scale.set(fit, 1, fit);
    g.add(label);
    // pin-1 dimple
    const dim = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.06, 24), new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 0.35 }));
    dim.rotation.x = -Math.PI / 2;
    dim.position.set(-w / 2 + Math.min(w, d) * 0.16, standoff + h + 0.0006, -d / 2 + Math.min(w, d) * 0.16);
    g.add(dim);
    const span = (s) => (s === "N" || s === "S" ? d : w);
    const outlineW = w + (sides.includes("W") ? 0.05 : 0.06), outlineD = d + (sides.includes("N") ? 0.05 : 0.06);
    const silk = [
      { rect: [0, 0, outlineW, outlineD] },
      { dot: [-w / 2 - 0.12, -d / 2 - 0.12, 0.028] },
    ];
    if (part.ref) silk.push({ text: part.ref, at: part.refAt ?? [-w / 2 - 0.02, -d / 2 - C.padOut - 0.24], cap: 0.075, align: "left" });
    void span;
    g.userData.footprint = { clear, silk, keep: [{ rect: [0, 0, w + 2 * (C.padOut + C.padLen), d + 2 * (C.padOut + C.padLen)] }] };
    g.userData.setPower = (p) => { lmat.emissiveIntensity = clamp(p, 0, 3) * C.glow.strength; };
    g.userData.pinAt = (side, i) => plan.partPin(local, side, i);
    g.userData.top = standoff + h;
    return g;
  }

  /**
   * passive({ kind: "resistor"|"capacitor", axis: "x"|"z", ref }) -> Group (0805-size two-pad part on gold
   *   pads with tinned end caps; resistor = black top, capacitor = tan ceramic).
   */
  function passive(part) {
    const P = spec.passive, kind = part.kind ?? "resistor";
    const g = new THREE.Group();
    const L = P.length, W = P.width, H = P.height[kind] ?? 0.06, ce = P.cap;
    const inner = new THREE.Group();
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(L - 2 * ce + 0.004, H, W, 2, 0.006), kind === "resistor" ? materials.resistor : materials.ceramic));
    body.position.y = H / 2 + 0.006;
    inner.add(body);
    if (kind === "resistor") {
      const under = new THREE.Mesh(new THREE.BoxGeometry(L - 2 * ce, H * 0.5, W * 0.98), materials.ceramic);
      under.material = new THREE.MeshStandardMaterial({ color: "#e8e2d2", roughness: 0.7 });
      under.position.y = H * 0.25 + 0.006;
      inner.add(under);
    }
    for (const s of [-1, 1]) {
      const capm = shadowed(new THREE.Mesh(new RoundedBoxGeometry(ce, H + 0.004, W + 0.004, 2, 0.008), materials.tin));
      capm.position.set(s * (L / 2 - ce / 2), (H + 0.004) / 2 + 0.004, 0);
      const pd = pad({ w: P.padLen, d: P.padWidth });
      pd.position.x = s * (L / 2 - 0.01);
      inner.add(capm, pd);
    }
    if (part.axis === "z") inner.rotation.y = Math.PI / 2;
    g.add(inner);
    const rot = part.axis === "z";
    const fw = rot ? P.padWidth : L + P.padLen, fd = rot ? L + P.padLen : P.padWidth;
    g.userData.footprint = {
      clear: [{ rect: [0, 0, fw + 0.03, fd + 0.03] }],
      silk: part.ref ? [{ text: part.ref, at: part.refAt ?? (rot ? [0.17, 0] : [0, -0.21]), cap: 0.06, align: rot ? "left" : "center" }] : [],
      keep: [{ rect: [0, 0, fw + 0.1, fd + 0.1] }],
    };
    return g;
  }

  /**
   * led({ axis, ref, color }) -> Group: 0805 LED (white body, clear resin lens) on gold pads. userData.setPower(p)
   *   lights the lens (HDR emissive); userData.lightAt = [x, y, z] part-local spill-light position.
   */
  function led(part) {
    const E = spec.led, color = part.color ?? pal.led;
    const g = new THREE.Group(), inner = new THREE.Group();
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(E.length * 0.8, E.body, E.width, 1, 0.004), materials.ledBody));
    body.position.y = E.body / 2 + 0.006;
    const lm = materials.ledLens.clone();
    lm.emissive = col(color); lm.emissiveIntensity = 0;
    const lens = new THREE.Mesh(new RoundedBoxGeometry(E.length * 0.62, E.lens, E.width * 0.86, 3, 0.018), lm);
    lens.position.y = E.body + 0.006 + E.lens / 2 - 0.004;
    lens.castShadow = true;
    inner.add(body, lens);
    for (const s of [-1, 1]) {
      const pd = pad({ w: spec.passive.padLen, d: spec.passive.padWidth });
      pd.position.x = s * (E.length / 2 - 0.01);
      const capm = new THREE.Mesh(new THREE.BoxGeometry(0.03, E.body * 0.8, E.width * 0.9), materials.tin);
      capm.position.set(s * (E.length * 0.4 + 0.012), E.body * 0.4 + 0.006, 0);
      inner.add(pd, capm);
    }
    // cathode mark: a green dash on the body edge (real parts have one) — tiny, silkscreen bar instead
    if (part.axis === "z") inner.rotation.y = Math.PI / 2;
    g.add(inner);
    const rot = part.axis === "z";
    const fw = rot ? spec.passive.padWidth : E.length + spec.passive.padLen, fd = rot ? E.length + spec.passive.padLen : spec.passive.padWidth;
    g.userData.footprint = {
      clear: [{ rect: [0, 0, fw + 0.03, fd + 0.03] }],
      silk: [
        { line: rot ? [[-0.11, 0.2], [0.11, 0.2]] : [[0.2, -0.11], [0.2, 0.11]], width: 0.02 },
        ...(part.ref ? [{ text: part.ref, at: part.refAt ?? (rot ? [0.17, 0] : [0, -0.21]), cap: 0.06, align: rot ? "left" : "center" }] : []),
      ],
      keep: [{ rect: [0, 0, fw + 0.1, fd + 0.1] }],
    };
    g.userData.color = color;
    g.userData.lightAt = [0, 0.12, 0];
    g.userData.setPower = (p) => { lm.emissiveIntensity = clamp(p, 0, 2) * E.strength; };
    return g;
  }

  /** connector({ pins, axis: "x"|"z", ref }) -> Group: through-hole pin header (black base, tall gold posts, square pin 1). */
  function connector(part) {
    const Hd = spec.header, n = part.pins ?? 4, g = new THREE.Group();
    const along = n * Hd.pitch;
    const rot = part.axis === "x";
    const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(rot ? along : Hd.pitch, Hd.base, rot ? Hd.pitch : along, 1, 0.012), materials.plastic));
    base.position.y = Hd.base / 2;
    g.add(base);
    const clear = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = plan.partPin({ ...part, at: [0, 0] }, null, i);
      const pinGeo = new THREE.BoxGeometry(Hd.pin, Hd.pinHeight, Hd.pin);
      const pin = shadowed(new THREE.Mesh(pinGeo, materials.metal));
      pin.position.set(x, Hd.pinHeight / 2, z);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(Hd.pin * 0.7, Hd.pin * 0.9, 4), materials.metal);
      tip.rotation.y = Math.PI / 4; tip.position.set(x, Hd.pinHeight + Hd.pin * 0.4, z);
      const ring = i === 0
        ? new THREE.Mesh(new THREE.BoxGeometry(Hd.pad, spec.pad.height, Hd.pad), materials.metal)
        : new THREE.Mesh(new THREE.CylinderGeometry(Hd.pad / 2, Hd.pad / 2, spec.pad.height, 28), materials.metal);
      ring.position.set(x, spec.pad.height / 2, z); ring.receiveShadow = true;
      g.add(pin, tip, ring);
      clear.push({ circle: [x, z, Hd.pad / 2 + 0.03] });
    }
    const fw = rot ? along + 0.08 : Hd.pitch + 0.08, fd = rot ? Hd.pitch + 0.08 : along + 0.08;
    g.userData.footprint = {
      clear,
      silk: [{ rect: [0, 0, fw, fd] }, ...(part.ref ? [{ text: part.ref, at: part.refAt ?? (rot ? [0, -0.28] : [-0.3, -along / 2 - 0.12]), cap: 0.075, align: "center" }] : [])],
      keep: [{ rect: [0, 0, fw + 0.12, fd + 0.12] }],
    };
    return g;
  }

  /** crystal({ axis, ref }) -> Group: a low metal-can resonator on two pads (generic, unmarked). */
  function crystal(part) {
    const g = new THREE.Group(), inner = new THREE.Group();
    const can = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.13, 0.19, 3, 0.06), materials.tin));
    can.position.y = 0.065 + 0.008;
    inner.add(can);
    for (const s of [-1, 1]) { const pd = pad({ w: 0.14, d: 0.2 }); pd.position.x = s * 0.24; inner.add(pd); }
    if (part.axis === "z") inner.rotation.y = Math.PI / 2;
    g.add(inner);
    const rot = part.axis === "z";
    g.userData.footprint = {
      clear: [{ rect: [0, 0, rot ? 0.24 : 0.66, rot ? 0.66 : 0.24] }],
      silk: [{ rect: [0, 0, rot ? 0.28 : 0.6, rot ? 0.6 : 0.28] }, ...(part.ref ? [{ text: part.ref, at: part.refAt ?? [0, -0.25], cap: 0.06, align: "center" }] : [])],
      keep: [{ rect: [0, 0, rot ? 0.4 : 0.8, rot ? 0.8 : 0.4] }],
    };
    return g;
  }

  /** part(spec) -> dispatch on spec.kind (qfp/soic/header/resistor/capacitor/led/crystal). */
  const part = (p) => ({ qfp: chip, soic: chip, header: connector, resistor: passive, capacitor: passive, led, crystal }[p.kind])(p);

  // ------------------------------------------------------------------ signals ----------------------
  /**
   * pulse(route, { color, width }) -> Mesh: additive HDR ribbon over a trace. userData.set(state) with a
   *   plan.pulseAt(t, p) state ({ head, level, powered }).
   */
  function pulse(route, o = {}) {
    const P = spec.pulse, width = (o.width ?? T.width) * P.halo;
    const geo = ribbonGeometry(route.pts, route.cum, width, T.height + 0.0015);
    const c = col(o.color ?? pal.pulse);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHead: { value: 0 }, uTail: { value: P.tail }, uLevel: { value: 0 }, uPowered: { value: 0 }, uLen: { value: route.length },
        uCore: { value: 1 / P.halo }, uColor: { value: c.clone().multiplyScalar(P.intensity) }, uAfter: { value: c.clone().multiplyScalar(P.afterglow) },
      },
      vertexShader: PULSE_VS, fragmentShader: PULSE_FS,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 4;
    m.userData.noDepth = true;
    m.userData.set = ({ head = 0, level = 0, powered = 0 } = {}, after = 1) => {
      mat.uniforms.uHead.value = head; mat.uniforms.uLevel.value = level; mat.uniforms.uPowered.value = powered * after;
      m.visible = level > 0.001 || powered * after > 0.001;
    };
    m.userData.set();
    return m;
  }

  /** flash({ color, radius }) -> Mesh: additive glow disc lying on the board (via / pad flashes). userData.set(level). */
  function flash(o = {}) {
    const F = spec.pulse.viaFlash, r = o.radius ?? F.radius;
    const geo = new THREE.PlaneGeometry(r * 2, r * 2); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: col(o.color ?? pal.pulse).multiplyScalar(F.intensity) }, uLevel: { value: 0 } },
      vertexShader: FLASH_VS, fragmentShader: FLASH_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = T.height + 0.003; m.renderOrder = 5; m.userData.noDepth = true;
    m.userData.set = (v) => { mat.uniforms.uLevel.value = v; m.visible = v > 0.001; };
    m.userData.set(0);
    return m;
  }

  /**
   * lightPool(n = spec.pulse.light.pool) -> Group of n point lights that never change count (no shader
   *   recompiles). userData.assign([{ at:[x,y,z], color, intensity }]) — extras switched off.
   */
  function lightPool(n = spec.pulse.light.pool) {
    const g = new THREE.Group(), L = spec.pulse.light, list = [];
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight("#ffffff", 0, L.distance, 2); l.castShadow = false; list.push(l); g.add(l); }
    g.userData.assign = (items) => list.forEach((l, i) => {
      const it = items[i];
      if (!it) { l.intensity = 0; return; }
      l.position.set(...it.at); l.color.set(it.color); l.intensity = it.intensity; l.distance = it.distance ?? L.distance;
    });
    return g;
  }

  /** bench({ y, size }) -> Mesh: the dark work surface the board stands over (out of focus in macro shots). */
  function bench(o = {}) {
    const size = o.size ?? 40;
    const geo = new THREE.PlaneGeometry(size, size); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, materials.bench);
    m.position.y = o.y ?? -(B.thickness + 0.35);
    m.receiveShadow = true;
    return m;
  }

  const props = { board, trace, vias, pad, chip, passive, led, connector, crystal, part, pulse, flash, lightPool, silkLabel, bench };

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
      bench: (s) => bench(s.dims ?? {}),
    },
    dof,
    plan,
    motion: plan,
    helpers: { traceGeometry, ribbonGeometry, drawStrokeText, strokeTextWidth },
    /** render(t, { focus }) — DOF focus on a world point, then stage.render(t). */
    render(t, { focus } = {}) {
      if (focus) dof.setFocus(stage.camera.position.distanceTo(new THREE.Vector3(...focus)));
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
