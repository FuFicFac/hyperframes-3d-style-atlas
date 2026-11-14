// styles/paper-pop-up/style.js — "Paper Pop-Up": die-cut card pieces hinged on the pages of an open
// pop-up book on a wood table. Implements the style contract (references/kit-api.md §3).
//
// Book frame (every anchor): x right, y up off the page, z toward the reader. The spine is the line
// z = 0. Far-page content uses z < 0, near-page content z > 0. Stand-up pieces face +Z, hinge on a
// line parallel to X, and fold FORWARD (+Z) to lie flat. Nothing animates itself: scenes call
// piece.userData.setOpen(u), book.userData.pose(thetas), tab.userData.setPull(u) from renderAt(t),
// with u / theta computed by the pure helpers in `style.motion`.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { paperTexture, paintPixels, canvasTexture, fbm2, makeCanvas } from "../../kit/textures.js";
import { FONTS } from "../../kit/text.js";
import { hash01, clamp, lerp, smoothstep, spring, toEase } from "../../kit/time.js";
import { shapes, cardGeometry } from "../../kit/shapes.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const HALF_PI = Math.PI / 2;

// Shape helpers + card geometry: promoted to kit/shapes.js (identical code).
export { shapes };

/** Bounding box of obj expressed in its parent's frame. */
function boxInParent(obj) {
  const parent = obj.parent;
  parent?.updateMatrixWorld(true);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (parent) box.applyMatrix4(parent.matrixWorld.clone().invert());
  return box;
}

// ---------------------------------------------------------------------------------------------
// Leaf bend: a travelling curl applied in the vertex shader, in the turning leaf's own frame
// (x across, y = page normal, z = distance from the spine). Everything riding the leaf (the leaf mesh
// and the flattened pieces on both faces) uses the same uniforms, so the pieces bend WITH the page.
// Constant curvature k from z0 to the free edge; z0 travels from the spine outward during the turn.
// ---------------------------------------------------------------------------------------------
const BEND_GLSL = /* glsl */ `
uniform mat4 uLbW2L; uniform mat4 uLbL2W; uniform float uLbK; uniform float uLbZ0;
vec3 lbMap(vec3 p) {
  if (abs(uLbK) < 1e-5 || p.z <= uLbZ0) return p;
  float a = uLbK * (p.z - uLbZ0);
  return vec3(p.x, (1.0 - cos(a)) / uLbK + p.y * cos(a), uLbZ0 + sin(a) / uLbK - p.y * sin(a));
}
vec4 lbBend(vec4 wp) {
  if (abs(uLbK) < 1e-5) return wp;
  return uLbL2W * vec4(lbMap((uLbW2L * wp).xyz), 1.0);
}
vec3 lbNormal(vec3 posObj, vec3 nView) {
  if (abs(uLbK) < 1e-5) return nView;
  vec3 p = (uLbW2L * (modelMatrix * vec4(posObj, 1.0))).xyz;
  if (p.z <= uLbZ0) return nView;
  float a = uLbK * (p.z - uLbZ0);
  vec3 nl = mat3(uLbW2L) * (transpose(mat3(viewMatrix)) * nView);
  nl = vec3(nl.x, nl.y * cos(a) + nl.z * sin(a), -nl.y * sin(a) + nl.z * cos(a));
  return mat3(viewMatrix) * (mat3(uLbL2W) * nl);
}
`;
const WORLDPOS_COND = "#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0";
/**
 * tessellate(geo, maxEdge) -> new non-indexed geometry whose triangles are 4-split until every edge is
 * <= maxEdge (groups kept). Lets flat cards bend with a curling leaf in the vertex shader; the chord
 * error at a T-junction is maxEdge^2 * k / 8 (~6 mm at 0.3 m, k = 0.5/m) — invisible at book scale.
 */
function tessellate(geo, maxEdge) {
  if (geo.index) return geo;
  const names = ["position", "normal", "uv"].filter((n) => geo.attributes[n]);
  const A = Object.fromEntries(names.map((n) => [n, geo.attributes[n]]));
  const out = Object.fromEntries(names.map((n) => [n, []]));
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: A.position.count, materialIndex: 0 }];
  const vert = (i) => Object.fromEntries(names.map((n) => [n, Array.from(A[n].array.slice(i * A[n].itemSize, (i + 1) * A[n].itemSize))]));
  const mid = (a, b) => Object.fromEntries(names.map((n) => [n, a[n].map((v, k) => (v + b[n][k]) / 2)]));
  const len = (a, b) => Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
  const ng = [];
  let start = 0;
  for (const g of groups) {
    let count = 0;
    const emit = (a, b, c, depth) => {
      if (depth < 6 && Math.max(len(a, b), len(b, c), len(c, a)) > maxEdge) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1); emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
        return;
      }
      for (const v of [a, b, c]) for (const n of names) out[n].push(...v[n]);
      count += 3;
    };
    for (let i = g.start; i < g.start + g.count; i += 3) emit(vert(i), vert(i + 1), vert(i + 2), 0);
    ng.push({ start, count, materialIndex: g.materialIndex });
    start += count;
  }
  const res = new THREE.BufferGeometry();
  for (const n of names) res.setAttribute(n, new THREE.Float32BufferAttribute(out[n], A[n].itemSize));
  for (const g of ng) res.addGroup(g.start, g.count, g.materialIndex);
  res.computeBoundingBox();
  res.computeBoundingSphere();
  return res;
}

function patchLeafBend(m, U, depth = false) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let v = sh.vertexShader.replace("#include <common>", "#include <common>\n" + BEND_GLSL);
    v = v.replace("#include <project_vertex>", "vec4 mvPosition = viewMatrix * lbBend(modelMatrix * vec4(transformed, 1.0));\ngl_Position = projectionMatrix * mvPosition;");
    v = v.replace("#include <worldpos_vertex>", `#include <worldpos_vertex>\n${WORLDPOS_COND}\n  worldPosition = lbBend(worldPosition);\n#endif`);
    if (!depth) v = v.replace("#include <defaultnormal_vertex>", "#include <defaultnormal_vertex>\ntransformedNormal = lbNormal(position, transformedNormal);");
    sh.vertexShader = v;
  };
  m.customProgramCacheKey = () => (depth ? "paperLeafBendDepth" : "paperLeafBend");
  m.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------------------------------------
// createStyle
// ---------------------------------------------------------------------------------------------
/**
 * createStyle(stage, opts?) -> style        opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, PAPER = spec.paper, TUNE = spec.tuning;
  const T = PAPER.cardThickness;
  const col = (c) => P[c] ?? c;
  const serif = FONTS[spec.text.font] ?? spec.text.font;

  // camera near/far from the spec (applyStyleSpec only applies fov)
  stage.camera.near = spec.camera.near;
  stage.camera.far = spec.camera.far;
  stage.camera.updateProjectionMatrix();

  // key-light shadow camera: keep its target in the scene graph
  const key = lights.key;
  if (key?.target && !key.target.parent) stage.scene.add(key.target);

  // ---- shared paper fibre (multiplied under every printed colour, tiled on plain faces) ----
  const fibreTex = paperTexture({ ...PAPER.fibre });
  const fibreCanvas = fibreTex.image;
  fibreTex.repeat.set(PAPER.fibre.repeatPerMetre, PAPER.fibre.repeatPerMetre);
  const card = materials.card;
  card.map = fibreTex;
  card.needsUpdate = true;
  materials.cardBack.map = fibreTex;
  materials.cardBack.bumpMap = card.bumpMap;
  materials.cardBack.bumpScale = card.bumpScale;

  // ink materials: one per palette colour, cloned from the card template (named "ink:<name>" and "<name>")
  const inkMats = {};
  const ink = (name) => {
    const key = col(name);
    if (!inkMats[key]) {
      const m = card.clone();
      m.color.set(key);
      inkMats[key] = m;
    }
    return inkMats[key];
  };
  for (const n of spec.inks) materials[n] = materials[`ink:${n}`] = ink(n);

  // ---- card backs: faint wash of the face colour + printed diagonal hatch (tileable, metres UV) ----
  const BK = PAPER.back, hatchTile = BK.hatchEvery * 10; // 10 hatch lines per tile -> seamless
  const hatchTex = (() => {
    const N = 256, c = makeCanvas(N, N), ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, N, N);
    const hc = new THREE.Color(BK.hatchColor);
    ctx.strokeStyle = `rgba(${Math.round(hc.r * 255)},${Math.round(hc.g * 255)},${Math.round(hc.b * 255)},${BK.hatchAlpha})`;
    ctx.lineWidth = (BK.hatchWidth / hatchTile) * N;
    const sp = N / 10;
    for (let k = -10; k <= 20; k++) { ctx.beginPath(); ctx.moveTo(k * sp, 0); ctx.lineTo(k * sp - N, N); ctx.stroke(); }
    return canvasTexture(c, { repeat: [1 / hatchTile, 1 / hatchTile] });
  })();
  const backMats = {};
  /** backMat(color, bbox?) -> tinted, hatched card-back material (bbox given = normalised UVs). */
  const backMat = (color, bbox = null) => {
    const key = `${col(color)}|${bbox ? `${bbox.w.toFixed(3)}x${bbox.h.toFixed(3)}` : "m"}`;
    if (!backMats[key]) {
      const m = materials.cardBack.clone();
      const c = new THREE.Color(P.cardBack).lerp(new THREE.Color(col(color)), BK.tint);
      m.color.copy(c);
      m.emissive.copy(c);
      m.emissiveIntensity = BK.glow;
      m.map = hatchTex;
      if (bbox) {
        m.map = hatchTex.clone();
        m.map.repeat.set(bbox.w / hatchTile, bbox.h / hatchTile);
        m.map.needsUpdate = true;
      }
      backMats[key] = m;
    }
    return backMats[key];
  };

  // ---- printing: draw onto a canvas covering a card face's bbox, multiply fibre, make material ----
  function printMaterial(color, bbox, draw, res = 1) {
    const s = Math.min(PAPER.printPxPerMetre * res, 4096 / Math.max(bbox.w, bbox.h));
    const W = Math.max(8, Math.ceil(bbox.w * s)), H = Math.max(8, Math.ceil(bbox.h * s));
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = col(color);
    ctx.fillRect(0, 0, W, H);
    const h = {
      s, W, H, ctx,
      X: (x) => (x - bbox.minX) * s,
      Y: (y) => (bbox.maxY - y) * s,
      /** text(str, x, y, sizeM, {color, weight, font, align, baseline, italic, spacing}) — sizeM = cap-ish em height in metres */
      text(str, x, y, sizeM, o = {}) {
        ctx.save();
        ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? spec.text.weight} ${sizeM * s}px ${o.font ?? serif}`;
        if ("letterSpacing" in ctx && o.spacing) ctx.letterSpacing = `${o.spacing * s}px`;
        ctx.fillStyle = col(o.color ?? spec.text.color);
        ctx.textAlign = o.align ?? "center";
        ctx.textBaseline = o.baseline ?? "middle";
        ctx.fillText(str, h.X(x), h.Y(y));
        ctx.restore();
      },
      /** width in metres of str at sizeM */
      measure(str, sizeM, o = {}) {
        ctx.save();
        ctx.font = `${o.weight ?? spec.text.weight} ${sizeM * s}px ${o.font ?? serif}`;
        const w = ctx.measureText(str).width / s;
        ctx.restore();
        return w;
      },
      fill(color, pathFn) { ctx.fillStyle = col(color); ctx.beginPath(); pathFn(ctx); ctx.fill(); },
      stroke(color, widthM, pathFn) { ctx.strokeStyle = col(color); ctx.lineWidth = widthM * s; ctx.beginPath(); pathFn(ctx); ctx.stroke(); },
      circle(x, y, r, color) { h.fill(color, (g) => g.arc(h.X(x), h.Y(y), r * s, 0, Math.PI * 2)); },
      rect(x, y, w, hh, color) { ctx.fillStyle = col(color); ctx.fillRect(h.X(x), h.Y(y + hh), w * s, hh * s); },
      roundRect(x, y, w, hh, r, color) { h.fill(color, (g) => g.roundRect(h.X(x), h.Y(y + hh), w * s, hh * s, r * s)); },
    };
    draw(h);
    ctx.globalCompositeOperation = "multiply";
    const pat = ctx.createPattern(fibreCanvas, "repeat");
    const k = s / (fibreCanvas.width * PAPER.fibre.repeatPerMetre);
    pat.setTransform(new DOMMatrix().scale(k, k));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    const tex = canvasTexture(c, { anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = card.clone();
    m.color.set("#ffffff");
    m.map = tex;
    if (card.bumpMap) {
      m.bumpMap = card.bumpMap.clone();
      m.bumpMap.repeat.set(bbox.w, bbox.h);
      m.bumpMap.needsUpdate = true;
    }
    return m;
  }

  // ---------------------------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------------------------

  /**
   * cardPiece({ shape, color = "cream", print?: (h) => void, thickness, back = "auto", printRes = 1 }) -> Mesh
   * A die-cut card: front face in `color` (or printed), back = cream washed with the face colour + hatch
   * ("auto"), "cardBack" (plain) or an ink name; lighter, faintly self-lit cut edge.
   * print(h): h.text / h.circle / h.rect / h.roundRect / h.fill / h.stroke in shape coordinates (metres).
   */
  function cardPiece({ shape, color = "cream", print = null, thickness = T, back = "auto", printRes = 1, castShadow = true } = {}) {
    const { geo, bbox } = cardGeometry(shape, thickness, PAPER.curveSegments, !!print);
    const front = print ? printMaterial(color, bbox, print, printRes) : ink(color);
    const bm = back === "auto" ? backMat(color, print ? bbox : null) : back === "cardBack" ? materials.cardBack : ink(back);
    const m = new THREE.Mesh(geo, [front, bm, materials.cutEdge]);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.userData.thickness = thickness;
    m.userData.bbox = bbox;
    return m;
  }

  /** glue(parent, child, { x = 0, y = 0, back = false }) — stick child card onto parent's front (or back) face. */
  function glue(parent, child, { x = 0, y = 0, back = false } = {}) {
    const z = (parent.userData.thickness ?? T) / 2 + PAPER.glueGap + (child.userData.thickness ?? T) / 2;
    child.position.set(x, y, back ? -z : z);
    parent.add(child);
    return child;
  }

  /**
   * standUp(content, { x = 0, z = 0, rest = -lean, stem = 0.18, stemColor = "cream" }) -> Group (pivot)
   * Hinges `content` (built standing in its own XY plane, bottom at y = 0, facing +Z) on the line
   * (y = hinge height, z) of the page. userData: setOpen(u) (0 = flat forward, 1 = rest, >1 = overshoot),
   * setAngle(a), setHeight(h) (done by stackPage), kind = "hinge".
   * The stem is a card tab that joins the hinge to the page (it scales with the hinge height).
   */
  function standUp(content, { x = 0, z = 0, rest = -TUNE.lean, stem = 0.18, stemColor = "cream" } = {}) {
    const pivot = new THREE.Group();
    pivot.add(content);
    let stemMesh = null;
    if (stem > 0) {
      stemMesh = cardPiece({ shape: shapes.rect(stem, 1, { y: -1 }), color: stemColor });
      stemMesh.scale.y = 1e-4;
      pivot.add(stemMesh);
    }
    pivot.position.set(x, 0, z);
    pivot.userData = {
      kind: "hinge", rest, hingeHeight: 0,
      setAngle(a) { pivot.rotation.x = a; },
      setOpen(u) { pivot.rotation.x = lerp(HALF_PI, rest, u); },
      setHeight(hgt) {
        pivot.userData.hingeHeight = hgt;
        pivot.position.y = hgt;
        if (stemMesh) {
          stemMesh.scale.y = Math.max(1e-4, hgt);
          stemMesh.visible = hgt > 1e-3;
        }
      },
    };
    pivot.userData.setOpen(0);
    return pivot;
  }

  /** flat(content, { x = 0, z = 0, rotY = 0 }) -> Group: content lies printed-side-up on the page; its +y points away from the reader (-Z). */
  function flat(content, { x = 0, z = 0, rotY = 0 } = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.x = -HALF_PI;
    inner.add(content);
    g.add(inner);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.userData = { kind: "flat" };
    return g;
  }

  /**
   * stackPage(anchor, items, { gap }) -> top height
   * Adds `items` (standUp pivots and flat groups) to `anchor` and lifts each so that, when every hinge is
   * folded flat, overlapping pieces stack without intersecting. `items` is in POP ORDER (first pops first,
   * so it lies on top); flats go to the bottom. Pop back-to-front where folded footprints overlap.
   */
  function stackPage(anchor, items, { gap = PAPER.stackGap } = {}) {
    for (const it of items) anchor.add(it);
    const order = [...items.filter((i) => i.userData.kind !== "hinge"), ...items.filter((i) => i.userData.kind === "hinge").reverse()];
    const placed = [];
    let maxTop = 0;
    for (const it of order) {
      if (it.userData.kind === "hinge") { it.userData.setHeight(0); it.userData.setOpen(0); }
      else it.position.y = 0;
      const b = boxInParent(it);
      let floor = 0;
      for (const p of placed) {
        if (b.max.x > p.min.x && b.min.x < p.max.x && b.max.z > p.min.z && b.min.z < p.max.z) floor = Math.max(floor, p.top);
      }
      const lift = floor + gap - b.min.y;
      if (it.userData.kind === "hinge") it.userData.setHeight(lift);
      else it.position.y = lift;
      const top = b.max.y + lift;
      placed.push({ min: b.min, max: b.max, top });
      maxTop = Math.max(maxTop, top);
    }
    return maxTop;
  }

  /** table({ size = 40 }) -> Mesh: procedural plank wood, receives shadows. */
  function table({ size = 40 } = {}) {
    const W = spec.textures.wood;
    const dark = new THREE.Color(P.woodDark), mid = new THREE.Color(P.wood), light = new THREE.Color(P.woodLight), seam = new THREE.Color(W.seamColor);
    const nb = W.boards;
    const c = paintPixels(W.size, (u, v) => {
      const b = Math.floor(v * nb), bv = v * nb - b;
      const joint = hash01(b, W.seed, 3);
      const du = Math.abs(((u - joint + 1.5) % 1) - 0.5);
      if (bv < 0.006 || bv > 0.994 || du > 0.4985) return [seam.r, seam.g, seam.b];
      const tone = (hash01(b, W.seed) - 0.5) * 0.3;
      const warpP = fbm2(u * 3, bv * 2, { seed: W.seed + b * 7, octaves: 3, period: 3 });
      const g = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (bv * W.grainFreq / nb + warpP * W.grainWarp + hash01(b, 9)));
      const line = smoothstep(0.82, 1, g);                       // thin dark late-wood lines
      const streak = fbm2(u * 6, v * nb * 6, { seed: W.seed + 3, octaves: 3, period: 6 }); // long soft streaks
      const fleck = fbm2(u * 48, v * 24, { seed: W.seed + 5, octaves: 2, period: 48 });
      let k = 0.58 + tone + (streak - 0.5) * W.contrast + (fleck - 0.5) * 0.12 - line * 0.32;
      k = clamp(k);
      const a = k < 0.5 ? dark : mid, z = k < 0.5 ? mid : light, kk = k < 0.5 ? k * 2 : (k - 0.5) * 2;
      return [lerp(a.r, z.r, kk), lerp(a.g, z.g, kk), lerp(a.b, z.b, kk)];
    });
    const tex = canvasTexture(c, { repeat: [size / W.metres, size / W.metres] });
    const m = materials.table;
    m.map = tex;
    if (m.bumpMap) m.bumpMap.repeat.set(size / 2, size / 2);
    m.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    mesh.rotation.x = -HALF_PI;
    mesh.receiveShadow = true;
    mesh.name = "table";
    return mesh;
  }

  // ---- page print (cream + fibre + border + gutter shade). v = 0 at the spine. ----
  function pageTexture(width, depth) {
    const B = PAPER.pageBorder, s = 240;
    const Wp = Math.ceil(width * s), Hp = Math.ceil(depth * s);
    const c = makeCanvas(Wp, Hp), ctx = c.getContext("2d");
    ctx.fillStyle = P.page;
    ctx.fillRect(0, 0, Wp, Hp);
    // gutter shade at the bottom of the canvas (v = 0)
    const g = ctx.createLinearGradient(0, Hp, 0, Hp - B.gutterShadeWidth * s);
    g.addColorStop(0, `rgba(90,60,30,${B.gutterShade})`);
    g.addColorStop(1, "rgba(90,60,30,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, Wp, Hp);
    ctx.strokeStyle = B.color;
    ctx.lineWidth = B.width * s;
    const i = B.inset * s;
    ctx.strokeRect(i, i, Wp - 2 * i, Hp - 2 * i);
    ctx.lineWidth = B.width * s * 0.5;
    ctx.strokeRect(i + 0.04 * s, i + 0.04 * s, Wp - 2 * i - 0.08 * s, Hp - 2 * i - 0.08 * s);
    ctx.globalCompositeOperation = "multiply";
    const pat = ctx.createPattern(fibreCanvas, "repeat");
    const k = s / (fibreCanvas.width * PAPER.fibre.repeatPerMetre);
    pat.setTransform(new DOMMatrix().scale(k, k));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, Wp, Hp);
    const tex = canvasTexture(c, { anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function pageEdgeTexture() {
    const E = spec.textures.pageEdge;
    const a = new THREE.Color(E.light), b = new THREE.Color(E.dark);
    const c = paintPixels(E.size, (u, v, x, y) => {
      const line = Math.abs(Math.sin(Math.PI * v * E.lines)) < 0.25 ? 1 : 0;
      const n = hash01(x >> 3, y, 77) * 0.15;
      const k = line * 0.8 + n;
      return [lerp(a.r, b.r, k), lerp(a.g, b.g, k), lerp(a.b, b.b, k)];
    });
    return canvasTexture(c, { repeat: [8, 1] });
  }

  /** Set uv on ±Y faces of a geometry to (x across width, |z - spineZ| / depth). */
  function pageUV(geo, width, depth, spineZ) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i) / width + 0.5, Math.abs(p.getZ(i) - spineZ) / depth);
    }
    uv.needsUpdate = true;
  }

  /**
   * book({ width = 6.4, depth = 2.4, leaves = 3, block = 0.07, coverMargin = 0.14, coverThickness = 0.05 }) -> Group
   * An open hardback lying flat, spine on z = 0, with `leaves` turnable leaves stacked on the near side.
   * Spreads 0..leaves. userData:
   *   anchor(spread, "far"|"near") -> Group  (book frame, origin on the spine at page height)
   *   pose(thetas[, curls])  thetas[i] = leaf i angle 0 (near) .. PI (far); curls[i] = { amount (rad), start (0..1 of depth) } from motion.curl
   *   top = page height above table.  Content under a leaf is hidden automatically.
   */
  function book({ width = 6.4, depth = 2.4, leaves = 3, block = 0.07, coverMargin = 0.14, coverThickness = 0.05 } = {}) {
    const g = new THREE.Group();
    g.name = "book";
    const LT = PAPER.leafThickness, step = PAPER.leafStep;
    const pageTex = pageTexture(width, depth);
    const pageMat = materials.page.clone();
    pageMat.map = pageTex;
    const edgeMat = materials.pageEdge.clone();
    edgeMat.map = pageEdgeTexture();
    // cover boards
    const cover = new THREE.Mesh(new THREE.BoxGeometry(width + 2 * coverMargin, coverThickness, 2 * depth + 2 * coverMargin), materials.cover);
    cover.position.y = coverThickness / 2;
    cover.receiveShadow = cover.castShadow = true;
    g.add(cover);
    const top = coverThickness + block;
    // page blocks
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(width, block, depth);
      geo.translate(0, 0, (side * depth) / 2);
      pageUV(geo, width, depth, 0);
      const m = new THREE.Mesh(geo, [edgeMat, edgeMat, pageMat, edgeMat, edgeMat, edgeMat]);
      m.position.y = coverThickness + block / 2;
      m.receiveShadow = m.castShadow = true;
      g.add(m);
    }
    const yNear = (i) => top + (leaves - i) * step;
    const yFar = (i) => top + (i + 1) * step;
    const L = [];
    for (let i = 0; i < leaves; i++) {
      const geo = new THREE.BoxGeometry(width, LT, depth, 1, 1, 40);
      geo.translate(0, 0, depth / 2);
      pageUV(geo, width, depth, 0);
      const mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, pageMat, pageMat, edgeMat, edgeMat]);
      mesh.castShadow = mesh.receiveShadow = true;
      const pivot = new THREE.Group();
      pivot.position.y = yNear(i) - LT / 2;
      pivot.add(mesh);
      const topA = new THREE.Group();
      topA.position.y = LT / 2;
      const backA = new THREE.Group();
      backA.position.y = -LT / 2;
      backA.rotation.x = Math.PI;
      pivot.add(topA, backA);
      g.add(pivot);
      const U = { uLbW2L: { value: new THREE.Matrix4() }, uLbL2W: { value: new THREE.Matrix4() }, uLbK: { value: 0 }, uLbZ0: { value: 0 } };
      L.push({ pivot, mesh, topA, backA, U, mats: new Map(), depthMat: patchLeafBend(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), U, true) });
    }
    const baseFar = new THREE.Group(), baseNear = new THREE.Group();
    baseFar.position.y = baseNear.position.y = top;
    g.add(baseFar, baseNear);
    // Route every mesh riding leaf i (leaf, flattened pieces on both faces) through leaf i's bend.
    function attachBend(leaf) {
      const fix = (o) => {
        if (!o.isMesh || o.userData.leafBend) return;
        const swap = (m) => {
          if (!leaf.mats.has(m)) leaf.mats.set(m, patchLeafBend(m.clone(), leaf.U));
          return leaf.mats.get(m);
        };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
        if (o !== leaf.mesh) o.geometry = tessellate(o.geometry, PAPER.bendMaxEdge);
        o.customDepthMaterial = leaf.depthMat;
        o.frustumCulled = false;
        o.userData.leafBend = true;
      };
      leaf.mesh.traverse(fix);
      leaf.topA.traverse(fix);
      leaf.backA.traverse(fix);
    }
    function bend(leaf, c) {
      const amount = typeof c === "number" ? c : c?.amount ?? 0;
      const start = (typeof c === "number" ? TUNE.curlTo : c?.start ?? TUNE.curlTo) * depth;
      attachBend(leaf);
      leaf.pivot.updateWorldMatrix(true, false);
      leaf.U.uLbL2W.value.copy(leaf.pivot.matrixWorld);
      leaf.U.uLbW2L.value.copy(leaf.pivot.matrixWorld).invert();
      leaf.U.uLbK.value = Math.abs(amount) < 1e-5 ? 0 : amount / Math.max(0.05, depth - start);
      leaf.U.uLbZ0.value = start;
    }

    g.userData = {
      top, width, depth, leaves,
      anchor(spread, side) {
        if (side === "far") return spread === 0 ? baseFar : L[spread - 1].backA;
        return spread === leaves ? baseNear : L[spread].topA;
      },
      /** pose(thetas, curls) — leaf angles (0..PI) and travelling curls; also hides covered content. Pure: rewrites everything from its inputs. */
      pose(thetas = [], curls = []) {
        L.forEach((leaf, i) => {
          const th = clamp(thetas[i] ?? 0, 0, Math.PI);
          leaf.pivot.rotation.x = -th;
          leaf.pivot.position.y = lerp(yNear(i), yFar(i), smoothstep(0, Math.PI, th)) - LT / 2;
          bend(leaf, curls[i] ?? 0);
        });
        for (let s = 0; s <= leaves; s++) {
          const prev = s > 0 ? clamp(thetas[s - 1] ?? 0, 0, Math.PI) : Math.PI;
          const next = s < leaves ? clamp(thetas[s] ?? 0, 0, Math.PI) : 0;
          // near(s) rides leaf s's top: revealed once leaf s-1 lifts, hidden once leaf s faces away.
          g.userData.anchor(s, "near").visible = prev > 0.22 && next < 0.62 * Math.PI;
          // far(s) rides leaf s-1's back: shown once that back faces the reader, hidden once leaf s covers it.
          g.userData.anchor(s, "far").visible = prev > 0.58 && next < 0.72 * Math.PI;
        }
      },
    };
    g.userData.pose([]);
    return g;
  }

  /**
   * ribbon({ text, height = 0.62, maxWidth = 4.8, pad = 0.38, color = "mustard", tail = "mustardDark",
   *          textColor = "ink", textScale = 0.6, tailLen = 0.5, drop = 0.17 }) -> Group
   * Swallowtail banner card with serif text printed on it; bottom of the tails at y = 0.
   */
  function ribbon({ text, height = 0.62, maxWidth = 4.8, pad = 0.38, color = "mustard", tail = "mustardDark", textColor = "ink", textScale = 0.6, tailLen = 0.5, drop = 0.17, font = serif, weight = spec.text.weight } = {}) {
    const mc = makeCanvas(8, 8).getContext("2d");
    mc.font = `${weight} 100px ${font}`;
    const per = mc.measureText(text).width / 100; // width per metre of font size
    let size = height * textScale;
    if (per * size > maxWidth - 2 * pad) size = (maxWidth - 2 * pad) / per;
    const bw = per * size + 2 * pad;
    const g = new THREE.Group();
    const band = cardPiece({
      shape: shapes.rect(bw, height, { y: drop }), color,
      print: (h) => {
        const inset = 0.06;
        h.stroke(textColor, 0.012, (c) => c.rect(h.X(-bw / 2 + inset), h.Y(drop + height - inset), (bw - 2 * inset) * h.s, (height - 2 * inset) * h.s));
        h.text(text, 0, drop + height * 0.5 - size * 0.04, size, { color: textColor, font, weight });
      },
    });
    g.add(band);
    // post behind the band so the hinge stem reads as one connected tab
    const post = cardPiece({ shape: shapes.rect(0.4, drop + 0.12), color: tail });
    post.position.z = -(T + PAPER.glueGap);
    g.add(post);
    for (const sgn of [-1, 1]) {
      const x0 = bw / 2 - 0.3, x1 = bw / 2 + tailLen, n = 0.18;
      const pts = [[x0, 0], [x1, 0], [x1 - n, height / 2], [x1, height], [x0, height]].map(([px, py]) => [px * sgn, py]);
      const tl = cardPiece({ shape: shapes.poly(pts), color: tail });
      tl.position.z = -(T + PAPER.glueGap);
      g.add(tl);
    }
    g.userData.textSize = size;
    g.userData.width = bw + 2 * tailLen;
    return g;
  }

  /**
   * dateBadge({ text, r = 0.6, color = "coral", inner = "cream", textColor = "ink", scallops = 20, ring = "coral" }) -> Mesh
   * Scalloped rosette with a glued printed disc; bottom of the rosette near y = 0.
   */
  function dateBadge({ text, r = 0.6, color = "coral", inner = "cream", textColor = "ink", scallops = 20, ring = color, font = serif, weight = spec.text.weight } = {}) {
    const outer = cardPiece({ shape: shapes.scallop(r, scallops, 0.07, { y: r }), color });
    const ri = r * 0.8;
    const mc = makeCanvas(8, 8).getContext("2d");
    mc.font = `${weight} 100px ${font}`;
    const per = mc.measureText(text).width / 100;
    const size = Math.min(ri * 0.64, (ri * 1.66) / per); // fill the disc inside the printed rings
    const disc = cardPiece({
      shape: shapes.circle(ri, { y: r }), color: inner,
      print: (h) => {
        h.stroke(ring, 0.018, (c) => c.arc(h.X(0), h.Y(r), (ri - 0.05) * h.s, 0, Math.PI * 2));
        h.stroke(ring, 0.008, (c) => c.arc(h.X(0), h.Y(r), (ri - 0.085) * h.s, 0, Math.PI * 2));
        h.text(text, 0, r - size * 0.03, size, { color: textColor, font, weight });
      },
    });
    glue(outer, disc);
    outer.userData.textSize = size;
    return outer;
  }

  /**
   * pullTab({ length = 1.15, width = 0.56, travel = 0.34, color = "mustard", arrow = "ink", label = "PULL", cover = "page" }) -> Group
   * Lies flat on the page; the grip points at the reader (+Z) and the tab slides out of a cover strip.
   * Place its origin where the grip end rests. userData.setPull(u) (0..1). kind = "flat".
   */
  function pullTab({ length = 1.15, width = 0.56, travel = 0.34, color = "mustard", arrow = "ink", label = "PULL", coverColor = "page", coverLen = 0.52 } = {}) {
    const g = new THREE.Group();
    const vis = length - coverLen;
    const tab = cardPiece({
      shape: shapes.roundRect(width, length, width * 0.48), color,
      print: (h) => {
        const cw = width * 0.26;
        for (let i = 0; i < 2; i++) {
          const y = 0.06 + i * 0.09;
          h.stroke(arrow, 0.035, (c) => { c.moveTo(h.X(-cw), h.Y(y + 0.07)); c.lineTo(h.X(0), h.Y(y)); c.lineTo(h.X(cw), h.Y(y + 0.07)); });
        }
        const sz = Math.min(0.17, (width * 0.86) / Math.max(0.1, h.measure(label, 1, { font: FONTS.sans, weight: 800 })));
        h.text(label, 0, Math.min(vis - 0.1, 0.36), sz, { color: arrow, font: FONTS.sans, weight: 800 });
      },
    });
    const tabFlat = flat(tab);
    const coverStrip = cardPiece({ shape: shapes.roundRect(width + 0.22, coverLen, 0.04), color: coverColor });
    const slotLine = cardPiece({ shape: shapes.rect(width + 0.1, 0.025), color: "slot", thickness: 0.002 });
    glue(coverStrip, slotLine, { y: 0.015 });
    const visible = length - coverLen; // grip length showing in front of the slot at rest
    const coverFlat = flat(coverStrip, { z: -visible });
    tabFlat.position.y = T / 2;
    coverFlat.position.y = T * 1.5 + PAPER.glueGap;
    g.add(tabFlat, coverFlat);
    g.userData = {
      kind: "flat",
      setPull(u) { tabFlat.position.z = clamp(u, 0, 1.2) * travel; },
    };
    return g;
  }

  /** sparkle({ r = 0.18, color = "mustard" }) -> Mesh: small 4-point star card (decoration). */
  const sparkle = ({ r = 0.18, color = "mustard" } = {}) => cardPiece({ shape: shapes.star(r, r * 0.32, 4, { y: r }), color });

  // ---------------------------------------------------------------------------------------------
  // Motion helpers (pure functions of t)
  // ---------------------------------------------------------------------------------------------
  const motion = {
    /** Hinge open amount: 0 before popAt, spring to 1 (overshoot) after, then fold to 0 from foldAt. */
    hinge(t, popAt, foldAt = Infinity, { foldDur = TUNE.foldDur, foldEase = TUNE.foldEase, pop = TUNE.pop } = {}) {
      if (t < popAt) return 0;
      if (t < foldAt) return spring(t - popAt, pop);
      const u0 = spring(foldAt - popAt, pop);
      return lerp(u0, 0, toEase(foldEase)(clamp((t - foldAt) / foldDur)));
    },
    /** Leaf angle 0..PI for a page turn starting at `at`. */
    turn(t, at, { dur = TUNE.turnDur, ease = TUNE.turnEase } = {}) {
      return Math.PI * toEase(ease)(clamp((t - at) / dur));
    },
    /** Travelling curl during a turn -> { amount (rad, negative = lags), start (0..1 of the leaf depth) }. */
    curl(t, at, { dur = TUNE.turnDur, amount = TUNE.curl, from = TUNE.curlFrom, to = TUNE.curlTo } = {}) {
      const p = clamp((t - at) / dur);
      return { amount: -amount * Math.sin(Math.PI * p) * (1 - 0.3 * p), start: lerp(from, to, smoothstep(0, 1, p)) };
    },
    /** Air from a turning leaf lifts nearby flat pieces a little (add to a hinge's u while it is flat). */
    breath(t, at, { dur = TUNE.turnDur, amount = TUNE.breath } = {}) {
      const p = clamp((t - at) / dur);
      return amount * Math.pow(Math.sin(Math.PI * p), 2);
    },
    /** Pull-tab travel 0..1. */
    pull(t, at, { dur = TUNE.pullDur, ease = TUNE.pullEase } = {}) {
      return toEase(ease)(clamp((t - at) / dur));
    },
    /** i-th stagger offset. */
    stagger: (i, step = TUNE.popStagger) => i * step,
  };

  const props = { table, book, cardPiece, glue, standUp, flat, stackPage, ribbon, dateBadge, pullTab, sparkle };

  const factories = {
    table: (o) => table(o.dims ?? {}),
    book: (o) => book(o.dims ?? {}),
  };

  const textStyle = { font: serif, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, shapes, motion, ink, printMaterial, sfx: spec.sfx,
  };
}
