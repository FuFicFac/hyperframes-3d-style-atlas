// styles/blueprint-build/style.js — "Blueprint Build": cyanotype drafting sheet + hidden-line 3D linework that
// plots on stroke by stroke. See STYLE.md for the prop list. Everything is synchronous and seeded; time only
// enters through userData.setProgress(p) / setLevel(k) / setView(camera) / sync(stage), which the scene calls.
//
// Rendering model (why it looks like ink and not like GL lines):
//  * Every line is a screen-space ribbon (one instanced quad per segment) with analytic anti-aliasing and round
//    caps, so weights are exact pixels at 1080p and stay crisp while the camera moves (no 1px GL lines).
//  * Lines blend with MAX (lighten): light ink on dark paper never doubles where strokes overlap or join.
//  * Solids are drawn as an invisible depth-only fill (colorWrite off, slope-scaled polygonOffset) so back edges
//    are hidden; a second pass of the same edges with depthFunc GREATER draws them dashed and dim (hidden lines).
//  * Silhouettes of curved surfaces are recomputed from the camera every frame (setView), feature edges are static.
//  * Annotation (leaders, callouts, captions, title block, border) lives on a "sheet layer" in the kit overlay,
//    in PIXELS (1920x1080, y down), so it stays flat to the page while the drawing tilts.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, TAU } from "../../kit/time.js";
import { fbm2, makeCanvas, canvasTexture } from "../../kit/textures.js";
import { getOverlay, projectToScreen } from "../../kit/overlay.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { expandStroke, pathLength, pointAt, vec3 } from "../../kit/pathmath.js";
import { lineMaterial, plotWindows, fillBuffers, quadGeometry, MAXBLEND } from "../../kit/lines.js";
import { analyseEdges, chainEdges } from "../../kit/edges.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const LN = STYLE_SPEC.line;
const { sub, add, mul, dot, len, nrm } = vec3;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// line shader, quadGeometry, lineMaterial, plotWindows, fillBuffers: kit/lines.js (promoted, identical code)
const segCount = (polys) => polys.reduce((s, p) => s + Math.max(1, p.length - 1), 0);
const to3 = (p) => [p[0], p[1], p[2] ?? 0];

// ======================================================================== canvas painters ==============
function paintPaper(S, pal) {
  const W = S.width, H = S.height, r = rng(S.seed);
  const c = makeCanvas(W, H), ctx = c.getContext("2d");
  const cDark = new THREE.Color(pal.paperDark), cMid = new THREE.Color(pal.paper), cLight = new THREE.Color(pal.paperLight);
  // low-frequency mottling (cyanotype wash) at 1/8 res, upscaled smoothly
  const lw = Math.ceil(W / 8), lh = Math.ceil(H / 8), lc = makeCanvas(lw, lh), lx = lc.getContext("2d"), li = lx.createImageData(lw, lh);
  const tmp = new THREE.Color();
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const n = fbm2((x / lw) * S.mottleScale * (W / H), (y / lh) * S.mottleScale, { seed: S.seed, octaves: 5 });
      const v = clamp(0.5 + (n - 0.5) * 2 * S.mottle);
      v < 0.5 ? tmp.copy(cDark).lerp(cMid, v * 2) : tmp.copy(cMid).lerp(cLight, (v - 0.5) * 2);
      const k = (y * lw + x) * 4;
      li.data[k] = tmp.r * 255; li.data[k + 1] = tmp.g * 255; li.data[k + 2] = tmp.b * 255; li.data[k + 3] = 255;
    }
  lx.putImageData(li, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(lc, 0, 0, W, H);
  // sun-faded patches
  for (const f of S.fade) {
    const g = ctx.createRadialGradient(f.x * W, f.y * H, 0, f.x * W, f.y * H, f.r * W);
    g.addColorStop(0, `rgba(170,205,245,${f.a})`); g.addColorStop(1, "rgba(170,205,245,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // fibres: short pale and dark hairs
  ctx.lineCap = "round";
  for (let i = 0; i < S.fibres; i++) {
    const x = r.range(0, W), y = r.range(0, H), a = r.range(0, TAU), l = r.range(4, 16);
    ctx.strokeStyle = r.chance(0.6) ? `rgba(190,220,255,${r.range(0.03, 0.08).toFixed(3)})` : `rgba(4,20,48,${r.range(0.05, 0.12).toFixed(3)})`;
    ctx.lineWidth = r.range(0.6, 1.3);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  // fold creases: worn light ridge + shadowed valley
  const C = S.creases;
  for (const fx of C.x) {
    const x = fx * W;
    let g = ctx.createLinearGradient(x - C.width, 0, x + C.width, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.46, `rgba(0,10,30,${C.dark})`); g.addColorStop(0.5, `rgba(200,225,255,${C.light})`);
    g.addColorStop(0.56, `rgba(200,225,255,${C.light * 0.35})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x - C.width, 0, C.width * 2, H);
  }
  for (const fy of C.y) {
    const y = fy * H;
    const g = ctx.createLinearGradient(0, y - C.width, 0, y + C.width);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.46, `rgba(0,10,30,${C.dark})`); g.addColorStop(0.5, `rgba(200,225,255,${C.light})`);
    g.addColorStop(0.56, `rgba(200,225,255,${C.light * 0.35})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y - C.width, W, C.width * 2);
  }
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  vg.addColorStop(0, "rgba(2,12,32,0)"); vg.addColorStop(1, `rgba(2,12,32,${S.vignette})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  // per-pixel grain (stateless hash)
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4, g = (hash01(x, y, S.seed) - 0.5) * 2 * S.grain;
      d[k] += g; d[k + 1] += g; d[k + 2] += g * 1.2;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

function paintGrid(S, pal) {
  const W = S.width, H = S.height;
  const c = makeCanvas(W, H), ctx = c.getContext("2d");
  const col = new THREE.Color(pal.grid), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  const ox = (W / 2) % S.gridMinor, oy = (H / 2) % S.gridMinor; // grid centred on the frame
  for (let x = ox, i = Math.round(-(W / 2 - ox) / S.gridMinor); x < W; x += S.gridMinor, i++) {
    const major = i % Math.round(S.gridMajor / S.gridMinor) === 0;
    ctx.fillStyle = `rgba(${rgb},${major ? S.gridMajorAlpha : S.gridMinorAlpha})`;
    ctx.fillRect(Math.round(x), 0, S.gridLine * (major ? 1.6 : 1), H);
  }
  for (let y = oy, i = Math.round(-(H / 2 - oy) / S.gridMinor); y < H; y += S.gridMinor, i++) {
    const major = i % Math.round(S.gridMajor / S.gridMinor) === 0;
    ctx.fillStyle = `rgba(${rgb},${major ? S.gridMajorAlpha : S.gridMinorAlpha})`;
    ctx.fillRect(0, Math.round(y), W, S.gridLine * (major ? 1.6 : 1));
  }
  return c;
}

// ======================================================================== geometry helpers ============
/** Convex solid from a list of planar convex faces (point lists, any order). Centred-ish at the origin. */
function convexFromFaces(faces) {
  const P = [];
  for (const f of faces) {
    const c = f.reduce((s, p) => add(s, p), [0, 0, 0]).map((x) => x / f.length);
    let n = [0, 0, 0];
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) for (let k = j + 1; k < f.length; k++) {
      const q = cross(sub(f[j], f[i]), sub(f[k], f[i]));
      if (len(q) > len(n)) n = q;
    }
    n = nrm(n);
    if (dot(n, c) < 0) n = mul(n, -1);
    const ax = nrm(sub(f[0], c)), ay = cross(n, ax);
    const sorted = f.slice().sort((p, q) => Math.atan2(dot(sub(p, c), ay), dot(sub(p, c), ax)) - Math.atan2(dot(sub(q, c), ay), dot(sub(q, c), ax)));
    for (let i = 1; i < sorted.length - 1; i++) P.push(...sorted[0], ...sorted[i], ...sorted[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
  g.computeVertexNormals();
  return g;
}

export const shapes = {
  /** chamferBox(w, h, d, c) -> BufferGeometry: box with 45° chamfered edges and corner facets (centred). */
  chamferBox(w, h, d, c = 0.05) {
    const X = w / 2, Y = h / 2, Z = d / 2, faces = [];
    const S = [-1, 1];
    const px = (sx, sy, sz) => [sx * X, sy * (Y - c), sz * (Z - c)];
    const py = (sx, sy, sz) => [sx * (X - c), sy * Y, sz * (Z - c)];
    const pz = (sx, sy, sz) => [sx * (X - c), sy * (Y - c), sz * Z];
    for (const s of S) {
      faces.push(S.flatMap((a) => S.map((b) => px(s, a, b))));
      faces.push(S.flatMap((a) => S.map((b) => py(a, s, b))));
      faces.push(S.flatMap((a) => S.map((b) => pz(a, b, s))));
    }
    for (const a of S) for (const b of S) {
      faces.push([px(a, b, -1), px(a, b, 1), py(a, b, 1), py(a, b, -1)]); // x-y edges along z
      faces.push([px(a, -1, b), px(a, 1, b), pz(a, 1, b), pz(a, -1, b)]); // x-z edges along y
      faces.push([py(-1, a, b), py(1, a, b), pz(1, a, b), pz(-1, a, b)]); // y-z edges along x
    }
    for (const a of S) for (const b of S) for (const e of S) faces.push([px(a, b, e), py(a, b, e), pz(a, b, e)]);
    return convexFromFaces(faces);
  },
  /** lathe(profile [[r, y], ...], segments = 72) -> LatheGeometry around +Y (profile bottom to top). */
  lathe(profile, segments = 72) {
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  },
  /** drum(r, h, chamfer, segments) -> chamfered cylinder centred on the origin, axis +Y. */
  drum(r, h, ch = 0.04, segments = 72) {
    const y = h / 2;
    return shapes.lathe([[0, -y], [r - ch, -y], [r, -y + ch], [r, y - ch], [r - ch, y], [0, y]], segments);
  },
  /** circle(r, n, { center, u, v }) -> closed point list in the plane spanned by u, v. */
  circle(r, n = 96, { center = [0, 0, 0], u = [1, 0, 0], v = [0, 1, 0], a0 = 0, a1 = TAU } = {}) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push(add(center, add(mul(u, r * Math.cos(a)), mul(v, r * Math.sin(a)))));
    }
    return out;
  },
  /** rect(x0, y0, x1, y1) -> closed 2D point list (sheet px or plane coords). */
  rect: (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
};

// analyseEdges, chainEdges: kit/edges.js (promoted, identical code)

// ======================================================================== createStyle =================
/**
 * createStyle(stage, opts?) -> style      (opts: { post = true } — this style declares no post)
 * props (3D, metres): hiddenLine, lines, polyline, constructionLine, centreLine, dimension, hatch, loopArrow, text3d
 * props (sheet layer, pixels, y down): sheet, sheetLines, sheetText, border, titleBlock, callout, plotterHead
 * Every drawable has userData.setProgress(p 0..1), setLevel(k), headLocal(p) -> [x,y,z] pen position.
 * helpers: syncView() (silhouettes from stage.camera), setCamera({ az, el, dist, target, fov, shift }),
 *          toSheet(world) -> [px, py], headPx(obj, p) -> [px, py] | null, layer (the sheet Group)
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = spec.palette;
  const colorOf = (c) => new THREE.Color(pal[c] ?? c);
  const W = stage.width, H = stage.height, pxScale = H / 1080;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const views = [];

  // ---- true orthographic camera (elevations need back edges to coincide exactly with front edges).
  // stage.render() follows a replaced stage.camera since 2026-11-13 (kit also has makeOrthoCamera /
  // setProjection / spec.camera.projection); this style keeps its own ortho frame maths in setCamera().
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, spec.camera.near, spec.camera.far);
  stage.camera = ortho;

  // ---- sheet layer: overlay group in pixel units, origin top-left, y down ----
  const ov = getOverlay(stage);
  const layer = new THREE.Group();
  layer.name = "sheetLayer";
  layer.position.set(-ov.aspect, 1, 0);
  layer.scale.set(2 / H, -2 / H, 1);
  ov.add(layer);

  const kindOpts = (kind = "outline") => ({
    width: (LN.weights[kind] ?? LN.weights.outline) * pxScale,
    color: colorOf(LN.colors[kind] ?? "ink"),
    level: LN.levels[kind] ?? 1,
  });
  const dashFor = (d, sheet) => (d == null ? null : Array.isArray(d) ? d : (sheet ? LN.dashPx : LN.dash)[d] ?? null);

  /**
   * lines(polys, { kind="outline", width, color, level, dash, depth="visible"|"none", hidden=false, order, windows, gap, bias, sheet=false })
   *   -> Mesh (instanced ribbons). polys: [[x,y,z]...] (sheet: [x,y] px). hidden:true adds a dashed GREATER-depth pass.
   *   userData: setProgress(p), setLevel(k), setPolys(polys) (same topology; for moving leaders), headLocal(p), polys, windows
   */
  function lines(polysIn, o = {}) {
    const sheet = !!o.sheet;
    let polys = polysIn.map((p) => p.map(to3)).filter((p) => p.length);
    const ko = kindOpts(o.kind);
    const width = (o.width ?? ko.width / pxScale) * pxScale;
    const color = o.color != null ? colorOf(o.color) : ko.color;
    const level = o.level ?? ko.level;
    const cap = o.capacity ?? segCount(polys);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quadGeometry().index;
    geo.setAttribute("position", quadGeometry().attributes.position);
    const A = new Float32Array(cap * 3), B = new Float32Array(cap * 3), U = new Float32Array(cap * 2), S = new Float32Array(cap * 2);
    const attrs = { iA: new THREE.InstancedBufferAttribute(A, 3), iB: new THREE.InstancedBufferAttribute(B, 3), iU: new THREE.InstancedBufferAttribute(U, 2), iS: new THREE.InstancedBufferAttribute(S, 2) };
    for (const [k, a] of Object.entries(attrs)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
    let windows = plotWindows(polys, o);
    geo.instanceCount = fillBuffers(polys, windows, A, B, U, S);
    const mat = lineMaterial({ width, color, level, dash: dashFor(o.dash, sheet), depth: sheet ? "none" : o.depth ?? "visible", bias: o.bias ?? LN.bias, res: [W, H] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = o.renderOrder ?? (sheet ? 10 : 2);
    mesh.name = o.name ?? `lines:${o.kind ?? "outline"}`;
    const mats = [mat];
    if (o.hidden && !sheet) {
      const hk = kindOpts("hidden");
      const hm = lineMaterial({ width: hk.width, color: hk.color, level: hk.level, dash: dashFor(o.hiddenDash ?? "hidden"), depth: "hidden", bias: o.bias ?? LN.bias, res: [W, H] });
      const hmesh = new THREE.Mesh(geo, hm);
      hmesh.frustumCulled = false; hmesh.renderOrder = mesh.renderOrder; hmesh.name = `${mesh.name}:hidden`;
      mesh.add(hmesh);
      mats.push(hm);
    }
    const base = mats.map((m) => m.uniforms.uLevel.value);
    let lvl = 1, prog = 1;
    const vis = () => { mesh.visible = prog > 0 && lvl > 0.001; };
    Object.assign(mesh.userData, {
      polys, materials: mats,
      get windows() { return windows; },
      setProgress(p) { prog = p; for (const m of mats) m.uniforms.uProgress.value = p >= 1 ? 1.0001 : p; vis(); return mesh; },
      setLevel(k) { lvl = k; mats.forEach((m, i) => (m.uniforms.uLevel.value = base[i] * k)); vis(); return mesh; },
      setPolys(np) {
        polys = np.map((p) => p.map(to3));
        mesh.userData.polys = polys;
        windows = plotWindows(polys, o);
        geo.instanceCount = fillBuffers(polys, windows, A, B, U, S);
        for (const a of Object.values(attrs)) a.needsUpdate = true;
        return mesh;
      },
      headLocal(p) {
        if (!polys.length) return null;
        let k = 0;
        for (let i = 0; i < polys.length; i++) if (p >= windows[i][0]) k = i;
        const [a, b] = windows[k], pts = polys[k];
        const L = pathLength(pts);
        return pointAt(pts, clamp((p - a) / Math.max(1e-6, b - a)) * L).p;
      },
    });
    return mesh;
  }

  // depth-only occluder (slope-scaled offset keeps grazing faces from eating their own silhouettes)
  const fillMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 2 });
  fillMaterial.name = "fill";

  /**
   * hiddenLine(geometry, { hidden="dashed"|"none", featureAngle, drawAxis=[0,-1,0], silWindow=[0.08,0.92], kind="outline" })
   *   -> Group { fill, features (+hidden pass), silhouettes }.  Feature edges (creases > featureAngle, boundaries)
   *   are chained into polylines and plotted top-to-bottom; silhouettes of smooth surfaces are recomputed per
   *   frame from the camera by syncView() and reveal along drawAxis. userData: setProgress, setLevel, setView, headLocal.
   */
  function hiddenLine(geometry, o = {}) {
    const g = new THREE.Group();
    g.name = o.name ?? "hiddenLine";
    const fill = new THREE.Mesh(geometry, fillMaterial);
    fill.renderOrder = 0;
    g.add(fill);
    const { verts, feature, cand } = analyseEdges(geometry, o.featureAngle ?? LN.featureAngle);
    const axis = nrm(o.drawAxis ?? [0, -1, 0]);
    let chains = chainEdges(verts, feature);
    const mid = (c) => c.reduce((s, p) => add(s, p), [0, 0, 0]).map((x) => x / c.length);
    chains.sort((p, q) => dot(mid(p), axis) - dot(mid(q), axis) || pathLength(q) - pathLength(p));
    const features = lines(chains, { kind: o.kind ?? "outline", hidden: o.hidden !== "none", order: "sequential", gap: o.gap ?? 0.01 });
    g.add(features);
    // silhouette candidates
    const proj = verts.map((p) => dot(p, axis));
    const pMin = Math.min(...proj), pMax = Math.max(...proj);
    const [s0, s1] = o.silWindow ?? [0.08, 0.92];
    const uOf = (vi) => lerp(s0, s1, (proj[vi] - pMin) / Math.max(1e-6, pMax - pMin));
    const C = cand.map((e) => ({ a: e.a, b: e.b, n1: e.n[0], n2: e.n[1], m: mul(add(verts[e.a], verts[e.b]), 0.5) }));
    const sil = lines([], { kind: "silhouette", capacity: Math.max(1, C.length), name: "silhouettes" });
    const sg = sil.geometry, SA = sg.attributes.iA, SB = sg.attributes.iB, SU = sg.attributes.iU, SS = sg.attributes.iS;
    g.add(sil);
    const inv = new THREE.Matrix4(), cam = new THREE.Vector3();
    let progress = 1;
    Object.assign(g.userData, {
      fill, features, silhouettes: sil, chains,
      setView(camera) {
        g.updateWorldMatrix(true, false);
        inv.copy(g.matrixWorld).invert();
        const isOrtho = !!camera.isOrthographicCamera;
        if (isOrtho) cam.copy(camera.getWorldDirection(new THREE.Vector3()).negate()).transformDirection(inv);
        else cam.copy(camera.getWorldPosition(new THREE.Vector3())).applyMatrix4(inv);
        const cp = [cam.x, cam.y, cam.z];
        let k = 0;
        for (const e of C) {
          const v = isOrtho ? cp : sub(cp, e.m);
          if ((dot(e.n1, v) > 0) === (dot(e.n2, v) > 0)) continue;
          let a = e.a, b = e.b, ua = uOf(a), ub = uOf(b);
          if (ua > ub) { [a, b] = [b, a]; [ua, ub] = [ub, ua]; }
          SA.array.set(verts[a], k * 3); SB.array.set(verts[b], k * 3);
          SU.array.set([ua, ub], k * 2); SS.array.set([0, len(sub(verts[b], verts[a]))], k * 2);
          k++;
        }
        sg.instanceCount = k;
        SA.needsUpdate = SB.needsUpdate = SU.needsUpdate = SS.needsUpdate = true;
        sil.userData.setProgress(progress);
        return g;
      },
      setProgress(p) { progress = p; features.userData.setProgress(p); sil.userData.setProgress(p); fill.visible = p > 0; return g; },
      setLevel(k) { features.userData.setLevel(k); sil.userData.setLevel(k); return g; },
      headLocal: (p) => features.userData.headLocal(p),
    });
    views.push(g);
    return g;
  }

  /** filled arrowhead (triangle, MAX-blended) with its tip at the origin pointing along +dir, lying in plane (dir, side). */
  function arrowHead(dir, side, length, width, o = {}) {
    const d = nrm(dir), s = nrm(side);
    const b1 = add(mul(d, -length), mul(s, width)), b2 = add(mul(d, -length), mul(s, -width));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, ...b1, ...b2]), 3));
    const m = new THREE.MeshBasicMaterial({ color: colorOf(o.color ?? "inkSoft").multiplyScalar(o.level ?? LN.levels.dimension), side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: !o.sheet, ...MAXBLEND });
    m.toneMapped = false;
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 3;
    mesh.userData.baseColor = m.color.clone();
    return mesh;
  }

  /** text3d(text, { cap=.2, origin, u=[1,0,0], v=[0,1,0], align="center", kind="text", order }) -> lines in a 3D plane */
  function text3d(text, o = {}) {
    const cap = o.cap ?? 0.2, L = spec.lettering;
    const lay = layoutStrokeText(text, cap, { ...L, align: o.align ?? "center", font: spec.font });
    const org = o.origin ?? [0, 0, 0], u = o.u ?? [1, 0, 0], v = o.v ?? [0, 1, 0];
    const polys = lay.chars.flatMap((c) => c.strokes.map((s) => s.map(([x, y]) => add(org, add(mul(u, x + y * (L.slant ?? 0)), mul(v, y))))));
    const m = lines(polys, { kind: o.kind ?? "text", order: "sequential", gap: 0.004, depth: o.depth ?? "visible", ...o.lineOpts });
    m.userData.width = lay.width;
    return m;
  }

  /** sheetText(text, { x, y (baseline, px), cap=40, align="left", kind="text", order }) -> lines on the sheet layer */
  function sheetText(text, o = {}) {
    const cap = (o.cap ?? 40) * pxScale, L = spec.lettering;
    const lay = layoutStrokeText(text, cap, { ...L, align: o.align ?? "left", font: spec.font, lineHeight: o.lineHeight ?? L.lineHeight });
    const x0 = o.x ?? 0, y0 = o.y ?? 0;
    const polys = lay.chars.flatMap((c) => c.strokes.map((s) => s.map(([x, y]) => [x0 + x + y * (L.slant ?? 0), y0 - y, 0])));
    const m = lines(polys, { kind: o.kind ?? "text", sheet: true, order: "sequential", gap: 0.004, width: o.width, level: o.level });
    m.userData.width = lay.width;
    m.userData.box = { x0: o.align === "center" ? x0 - lay.width / 2 : o.align === "right" ? x0 - lay.width : x0, y0: y0 - cap, cap };
    m.userData.box.x1 = m.userData.box.x0 + lay.width;
    layer.add(m);
    return m;
  }

  /** composite progress: parts = [[obj, a, b], ...] -> setProgress(p) maps p into each part's [a, b] window */
  function sequence(group, parts) {
    let lvl = 1;
    Object.assign(group.userData, {
      parts,
      setProgress(p) { for (const [o, a, b] of parts) o.userData.setProgress ? o.userData.setProgress(clamp((p - a) / Math.max(1e-6, b - a))) : null; return group; },
      setLevel(k) { lvl = k; for (const [o] of parts) o.userData.setLevel?.(k); return group; },
      // parts are direct children (translation only, e.g. a moved label), so offset by the part's position
      headLocal(p) {
        let cur = null;
        for (const [o, a, b] of parts) if (p >= a && p <= b && o.userData.headLocal) cur = [o, clamp((p - a) / Math.max(1e-6, b - a))];
        const h = cur ? cur[0].userData.headLocal(cur[1]) : null;
        return h ? add(h, cur[0].position.toArray()) : null;
      },
    });
    return group;
  }

  const props = {
    // ------------------------------------------------------------------ 3D drawing (metres) -----------
    hiddenLine,
    lines,
    /** polyline(points | stroke with arcs, opts) -> lines (one poly). */
    polyline: (pts, o = {}) => lines([expandStroke(pts)], o),
    /** constructionLine(a, b, opts) -> thin dim line (draws a -> b). */
    constructionLine: (a, b, o = {}) => lines([[a, b]], { kind: "construction", ...o }),
    /** centreLine(a, b, opts) -> dash-dot centre-line. */
    centreLine: (a, b, o = {}) => lines([[a, b]], { kind: "centre", dash: "centre", ...o }),
    text3d,
    /**
     * dimension(a, b, { offset:[x,y,z], text, cap, normal=[0,0,1], ends="arrow"|"tick" }) -> Group
     *   extension lines (0-.3) -> dimension line (.2-.7) -> arrowheads (.62-.78) -> value text (.65-1)
     */
    dimension(a, b, o = {}) {
      const D = { ...spec.dimension, ...o.dims };
      const g = new THREE.Group();
      g.name = "dimension";
      const off = o.offset ?? [0, -0.5, 0], offN = nrm(off), dir = nrm(sub(b, a));
      const n = o.normal ?? [0, 0, 1];
      let v = nrm(cross(n, dir));
      if (o.flipText) v = mul(v, -1);
      const a2 = add(a, off), b2 = add(b, off);
      const ext = lines([[add(a, mul(offN, D.extGap)), add(a2, mul(offN, D.extOver))], [add(b, mul(offN, D.extGap)), add(b2, mul(offN, D.extOver))]], { kind: "construction", order: "parallel", level: 0.75 });
      const dl = lines([[a2, b2]], { kind: "dimension" });
      g.add(ext, dl);
      const heads = [];
      if ((o.ends ?? "arrow") === "arrow") {
        for (const [p, d] of [[a2, mul(dir, -1)], [b2, dir]]) {
          const h = arrowHead(d, v, D.arrowLen, D.arrowWidth);
          h.position.set(...p);
          g.add(h); heads.push(h);
        }
      } else {
        const tk = (p) => [add(p, mul(nrm(add(dir, v)), -D.tickLen / 2)), add(p, mul(nrm(add(dir, v)), D.tickLen / 2))];
        const ticks = lines([tk(a2), tk(b2)], { kind: "outline", order: "parallel", width: LN.weights.dimension * 1.5 });
        g.add(ticks); heads.push(ticks);
      }
      const mid = mul(add(a2, b2), 0.5);
      const txt = o.text ? text3d(o.text, { cap: o.cap ?? D.textCap, origin: add(mid, mul(v, D.textGap)), u: o.flipText ? mul(dir, -1) : dir, v, kind: "dimension", lineOpts: { level: 0.95 } }) : null;
      if (txt) g.add(txt);
      const parts = [[ext, 0, 0.3], [dl, 0.2, 0.7], ...(txt ? [[txt, 0.65, 1]] : [])];
      sequence(g, parts);
      const setP = g.userData.setProgress, setL = g.userData.setLevel;
      let lv = 1;
      g.userData.setProgress = (p) => {
        setP(p);
        const s = clamp((p - 0.62) / 0.16);
        for (const h of heads) {
          if (h.userData.setProgress) h.userData.setProgress(s);
          else { h.scale.setScalar(Math.max(1e-4, s)); h.visible = s > 0 && lv > 0; }
        }
        return g;
      };
      g.userData.setLevel = (k) => {
        lv = k; setL(k);
        for (const h of heads) h.userData.baseColor ? h.material.color.copy(h.userData.baseColor).multiplyScalar(k) : h.userData.setLevel(k);
        return g;
      };
      return g;
    },
    /** hatch(polygon2D [[x,y]...], { origin, u, v, spacing, angle, kind="hatch" }) -> parallel section-hatch strokes clipped to the polygon */
    hatch(poly, o = {}) {
      const sp = o.spacing ?? spec.hatch.spacing, ang = o.angle ?? spec.hatch.angle;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rot = (p) => [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca];   // into hatch frame (lines along x)
      const unrot = (p) => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca];
      const P = poly.map(rot);
      const ys = P.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const org = o.origin ?? [0, 0, 0], u = o.u ?? [1, 0, 0], v = o.v ?? [0, 1, 0];
      const to3d = ([x, y]) => add(org, add(mul(u, x), mul(v, y)));
      const segs = [];
      let flip = false;
      for (let y = y0 + sp / 2; y < y1; y += sp) {
        const xs = [];
        for (let i = 0; i < P.length; i++) {
          const p = P[i], q = P[(i + 1) % P.length];
          if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
        }
        xs.sort((m, n) => m - n);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const s = [to3d(unrot([xs[k], y])), to3d(unrot([xs[k + 1], y]))];
          segs.push(flip ? s.reverse() : s); // boustrophedon, like a plotter
        }
        flip = !flip;
      }
      return lines(segs, { kind: o.kind ?? "hatch", order: "sequential", gap: 0.002, ...o.lineOpts });
    },
    /**
     * loopArrow({ center, radius, start=0 (rad, from +Z toward +X), sweep=TAU*.88, axis="y", hidden=true }) -> Group
     *   ring path drawn on with a filled arrowhead riding the tip; hidden stretches dash. userData.pointAt(u) -> world-local point.
     */
    loopArrow(o = {}) {
      const g = new THREE.Group();
      g.name = "loopArrow";
      const c = o.center ?? [0, 0, 0], R = o.radius ?? 3, a0 = o.start ?? 0, sw = o.sweep ?? TAU * 0.88, n = 160;
      const P = (a) => add(c, [R * Math.sin(a), 0, R * Math.cos(a)]);
      const pts = Array.from({ length: n + 1 }, (_, i) => P(a0 + (sw * i) / n));
      const ring = lines([pts], { kind: "outline", hidden: o.hidden !== false, width: o.width });
      g.add(ring);
      const LA = spec.loopArrow;
      const head = arrowHead([1, 0, 0], [0, 0, 1], LA.headLen, LA.headWidth, { color: "ink", level: 1 });
      head.material.depthTest = true;
      g.add(head);
      const angAt = (u) => a0 + sw * u;
      const tang = (a) => [Math.cos(a) * Math.sign(sw), 0, -Math.sin(a) * Math.sign(sw)];
      let lvl = 1;
      Object.assign(g.userData, {
        ring, head, pts,
        pointAt: (u) => P(angAt(u)),
        setProgress(p) {
          ring.userData.setProgress(p);
          const a = angAt(clamp(p)), d = tang(a);
          head.position.set(...add(P(a), mul(d, LA.headLen * 0.55)));
          head.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...d));
          head.visible = p > 0.02 && lvl > 0;
          return g;
        },
        setLevel(k) { lvl = k; ring.userData.setLevel(k); head.material.color.copy(colorOf("ink")).multiplyScalar(k); return g; },
        headLocal: (p) => P(angAt(clamp(p))),
      });
      return g;
    },

    // ------------------------------------------------------------------ sheet layer (pixels) ----------
    /** sheet() -> Mesh: full-frame cyanotype paper (painted, seeded) with a fadeable grid. userData.setGrid(k) */
    sheet(o = {}) {
      const S = { ...spec.sheet, ...o };
      const paper = canvasTexture(paintPaper(S, pal), { srgb: true });
      const grid = canvasTexture(paintGrid(S, pal), { srgb: true });
      for (const t of [paper, grid]) { t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
      const m = new THREE.ShaderMaterial({
        uniforms: { uPaper: { value: paper }, uGrid: { value: grid }, uGridK: { value: 1 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
        fragmentShader: `uniform sampler2D uPaper; uniform sampler2D uGrid; uniform float uGridK; varying vec2 vUv;
          void main(){ vec3 p = texture2D(uPaper, vUv).rgb; vec4 g = texture2D(uGrid, vUv);
            gl_FragColor = vec4(mix(p, max(p, g.rgb), g.a * uGridK), 1.0);
            #include <colorspace_fragment>
          }`,
        depthTest: false, depthWrite: false,
      });
      m.toneMapped = false;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      mesh.frustumCulled = false;
      mesh.renderOrder = -100;
      mesh.name = "sheet";
      mesh.userData.setGrid = (k) => { m.uniforms.uGridK.value = k; return mesh; };
      stage.scene.add(mesh);
      return mesh;
    },
    /** sheetLines(polys px, opts) -> lines on the sheet layer */
    sheetLines(polys, o = {}) { const m = lines(polys, { ...o, sheet: true }); layer.add(m); return m; },
    sheetText,
    /** border({ outer, inner, zones, rows }) -> Group: double rule + zone ticks/letters (drawing-frame margin) */
    border(o = {}) {
      const B = { ...spec.sheet.border, ...o };
      const g = new THREE.Group();
      const r1 = B.outer * pxScale, r2 = B.inner * pxScale;
      const outer = props.sheetLines([shapes.rect(r1, r1, W - r1, H - r1)], { kind: "border", width: 1.2, level: 0.55 });
      const inner = props.sheetLines([shapes.rect(r2, r2, W - r2, H - r2)], { kind: "border" });
      const ticks = [], labels = [];
      for (let i = 1; i < B.zones; i++) { const x = (W * i) / B.zones; ticks.push([[x, r1], [x, r2]], [[x, H - r1], [x, H - r2]]); }
      for (let i = 1; i < B.rows; i++) { const y = (H * i) / B.rows; ticks.push([[r1, y], [r2, y]], [[W - r1, y], [W - r2, y]]); }
      const tk = props.sheetLines(ticks, { kind: "border", width: 1.2, level: 0.55, order: "parallel" });
      for (let i = 0; i < B.zones; i++) {
        const x = (W * (i + 0.5)) / B.zones;
        labels.push(sheetText(String(B.zones - i), { x, y: (r1 + r2) / 2 + 5 * pxScale, cap: 10, align: "center", kind: "border", width: 1.2, level: 0.55 }));
      }
      for (let i = 0; i < B.rows; i++) {
        const y = (H * (i + 0.5)) / B.rows;
        labels.push(sheetText("ABCDEFGH"[i], { x: (r1 + r2) / 2, y: y + 5 * pxScale, cap: 10, align: "center", kind: "border", width: 1.2, level: 0.55 }));
      }
      g.add(outer, inner, tk);
      layer.add(g);
      return sequence(g, [[outer, 0, 0.6], [inner, 0.1, 0.8], [tk, 0.5, 0.9], ...labels.map((l, i) => [l, 0.6 + i * 0.03, 0.75 + i * 0.03])]);
    },
    /**
     * titleBlock({ x, y, w, h, title, titleCap, fields: [[label, value], ...] }) -> Group, userData.frame / fields / title
     *   (frame + field rules, small field lettering, then the big title row; drive each part's setProgress)
     */
    titleBlock(o = {}) {
      const { x, y, w, h } = { x: 1180, y: 860, w: 620, h: 150, ...o };
      const titleH = o.titleH ?? h * 0.52, fieldsY = y + titleH, cols = (o.fields ?? []).length || 1;
      const rules = [shapes.rect(x, y, x + w, y + h), [[x, fieldsY], [x + w, fieldsY]]];
      for (let i = 1; i < cols; i++) rules.push([[x + (w * i) / cols, fieldsY], [x + (w * i) / cols, y + h]]);
      const frame = props.sheetLines(rules, { kind: "border", width: LN.weights.border, level: 0.9 });
      const cw = w / cols, fh = y + h - fieldsY;
      const fields = new THREE.Group();
      const fparts = [];
      (o.fields ?? []).forEach(([lab, val], i) => {
        const fx = x + cw * i + 12 * pxScale;
        const l = sheetText(lab, { x: fx, y: fieldsY + fh * 0.36, cap: 11, kind: "construction", width: 1.2, level: 0.75 });
        const v = sheetText(val, { x: fx, y: fieldsY + fh * 0.82, cap: o.fieldCap ?? 19, kind: "detail" });
        fields.add(l, v);
        fparts.push([l, i / cols, (i + 0.5) / cols], [v, (i + 0.3) / cols, (i + 1) / cols]);
      });
      sequence(fields, fparts);
      const cap = o.titleCap ?? 34;
      const title = sheetText(o.title ?? "", { x: x + w / 2, y: y + titleH / 2 + (cap * pxScale) / 2, cap, align: "center", kind: "title" });
      const g = new THREE.Group();
      g.add(frame, fields, title);
      layer.add(g);
      Object.assign(g.userData, { frame, fields, title });
      return g;
    },
    /**
     * callout(text, { x, y (label baseline-left px), cap=30, anchor:[x,y,z] world, dot=true }) -> Group on the sheet layer.
     *   Leader: dot at the 3D anchor -> knee -> shoulder under the label side. Call userData.sync() every frame (camera moves).
     *   setProgress(p): leader 0-.45, label .35-1.
     */
    callout(text, o = {}) {
      const cap = o.cap ?? 30;
      const label = sheetText(text, { x: o.x, y: o.y, cap, align: o.align ?? "left", kind: o.kind ?? "text" });
      const box0 = { ...label.userData.box };
      let bx = { ...box0 }, ymid = o.y - (cap * pxScale) / 2;
      const leader = props.sheetLines([[[0, 0], [1, 0], [2, 0]]], { kind: "leader" });
      const dot = props.sheetLines([[[0, 0]]], { kind: "leader", width: 7.5, level: 0.95 });
      const g = new THREE.Group();
      g.add(label, leader, dot);
      layer.add(g);
      const shoulder = (o.shoulder ?? 34) * pxScale, pad = 12 * pxScale;
      let anchor = o.anchor;
      /** moveTo(x, y): move the label (baseline point given at creation) — e.g. to re-layout for another view. */
      g.userData.moveTo = (x, y) => {
        const dx = x - o.x, dy = y - o.y;
        label.position.set(dx, dy, 0);
        bx = { ...box0, x0: box0.x0 + dx, x1: box0.x1 + dx, y0: box0.y0 + dy };
        ymid = y - (cap * pxScale) / 2;
        return g;
      };
      g.userData.setAnchor = (a) => { anchor = a; return g; };
      const sync = () => {
        const a = toSheet(anchor);
        const left = a[0] < (bx.x0 + bx.x1) / 2;
        const p2 = left ? [bx.x0 - pad, ymid] : [bx.x1 + pad, ymid];
        const p1 = [p2[0] + (left ? -shoulder : shoulder), ymid];
        leader.userData.setPolys([[a, p1, p2]]);
        dot.userData.setPolys([[a]]);
        return g;
      };
      sync();
      sequence(g, [[dot, 0, 0.05], [leader, 0, 0.45], [label, 0.35, 1]]);
      g.userData.sync = sync;
      g.userData.label = label;
      return g;
    },
    /** plotterHead() -> Group on the sheet layer: amber ring + crosshair. userData.place([px,py] | null) */
    plotterHead(o = {}) {
      const Hd = { ...spec.head, ...o }, r = Hd.radius * pxScale, cr = Hd.cross * pxScale;
      const ring = shapes.circle(r, 40, { center: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] });
      const m = lines([ring, [[-cr, 0], [-r * 0.45, 0]], [[r * 0.45, 0], [cr, 0]], [[0, -cr], [0, -r * 0.45]], [[0, r * 0.45], [0, cr]]], { sheet: true, color: "accent", width: Hd.weight, level: 1, order: "parallel" });
      const dot = lines([[[0, 0]]], { sheet: true, color: "accent", width: 5, level: 1 });
      const g = new THREE.Group();
      g.add(m, dot);
      g.renderOrder = 20;
      layer.add(g);
      g.userData.place = (p) => { g.visible = !!p; if (p) g.position.set(p[0], p[1], 0); return g; };
      g.visible = false;
      return g;
    },
  };

  // ---- helpers ----
  function toSheet(world) {
    const p = projectToScreen(stage, world.isVector3 ? world : new THREE.Vector3(...world));
    return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
  }
  /** pen position of a drawable at progress p in sheet px (3D objects are projected), or null. */
  function headPx(obj, p) {
    const h = obj.userData.headLocal?.(p);
    if (!h) return null;
    let o = obj, inLayer = false;
    while (o) { if (o === layer) { inLayer = true; break; } o = o.parent; }
    if (inLayer) {
      obj.updateWorldMatrix(true, false);
      const v = new THREE.Vector3(...h).applyMatrix4(obj.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(layer.matrixWorld).invert());
      return [v.x, v.y];
    }
    obj.updateWorldMatrix(true, false);
    return toSheet(obj.localToWorld(new THREE.Vector3(...h)));
  }
  /** Spherical camera: az (rad, from +Z toward +X), el (rad up), dist, target, fov, shift [px,px] lens shift. */
  function setCamera({ az = 0, el = 0, dist = spec.camera.distance, target = [0, 0, 0], fov = spec.camera.fov, shift = [0, 0] }) {
    const cam = stage.camera;
    cam.position.set(target[0] + dist * Math.cos(el) * Math.sin(az), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(el) * Math.cos(az));
    cam.up.set(0, 1, 0);
    cam.lookAt(...target);
    if (cam.isOrthographicCamera) {
      const h = dist * Math.tan((fov * Math.PI) / 360), a = W / H;
      const sx = (shift[0] / (H / 2)) * h, sy = (shift[1] / (H / 2)) * h;
      Object.assign(cam, { left: -h * a - sx, right: h * a - sx, top: h + sy, bottom: -h + sy });
    } else {
      cam.fov = fov;
      cam.setViewOffset(W, H, -shift[0], -shift[1], W, H);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
  function syncView() { stage.camera.updateMatrixWorld(); for (const v of views) v.userData.setView(stage.camera); }
  /** render(t) = stage.render(t) (kept for scene.js compatibility; this style has no post stack). */
  function render(t) {
    stage.render(t);
  }

  return {
    spec,
    palette: pal,
    materials: { ...materials, fill: fillMaterial },
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      // objectsFromSpec hooks (procedural OBJECTS); most demo geometry is built in scene.js from scene.config data
      chamferBox: (s) => hiddenLine(shapes.chamferBox(s.dims?.w ?? 1, s.dims?.h ?? 1, s.dims?.d ?? 1, s.dims?.c ?? 0.05), s.dims ?? {}),
      drum: (s) => hiddenLine(shapes.drum(s.dims?.r ?? 0.5, s.dims?.h ?? 0.3, s.dims?.chamfer ?? 0.04), s.dims ?? {}),
      lathe: (s) => hiddenLine(shapes.lathe(s.dims?.profile ?? [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], s.dims?.segments ?? 72), s.dims ?? {}),
    },
    shapes,
    helpers: { syncView, setCamera, render, toSheet, headPx, layer, sequence, lineMaterial },
    color: colorOf,
    sfx: spec.sfx,
  };
}
