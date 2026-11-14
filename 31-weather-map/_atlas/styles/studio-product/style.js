// styles/studio-product/style.js — "Studio Product": a hero object on a black seamless sweep, lit by a
// PROCEDURAL studio environment (emissive softboxes/strips/cards → PMREM, no image files), with a blurred
// mirror floor, rim/strip light rig, brushed metal, glass, ceramic, one accent, thin-line callouts.
// Everything is synchronous and seeded; time enters only through update(t)/set(...) calls from renderAt.
// The schedule helpers (sweeps, shots, waves) live in ./lightplan.js (THREE-free, Node-safe).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createCyclorama, contactShadow } from "../../kit/builders.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, clamp, smoothstep, lerp, toEase, hash01 } from "../../kit/time.js";
import { paintPixels, canvasTexture, softRectTexture, gradientTexture, makeCanvas } from "../../kit/textures.js";
import { sweepGeometry } from "../../kit/paths.js";
import { getOverlay, projectToScreen } from "../../kit/overlay.js";
import * as plan from "./lightplan.js";
import { studioEnvironment, reflectiveSweep as kitReflectiveSweep, depthOfField as kitDepthOfField } from "../../kit/studio.js";
import { callout as kitCallout, titleLockup as kitTitleLockup } from "../../kit/callouts.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, plan };

const col = (c) => new THREE.Color(c);
const V3 = (a) => new THREE.Vector3(...a);

// ======================================================================= studio environment ==========
// studioEnvironment: kit/studio.js (promoted, identical code)
export { studioEnvironment };

// ======================================================================= brushed metal ===============
/**
 * brushedMaps({ size, seed, streaks, fine, roughness:[lo,hi], perMetre, radial }) -> { roughnessMap, bumpMap }
 *   Tileable linear streak maps: rows of 1-D fractal noise (brushing runs along U), a little along-stroke
 *   modulation. On ExtrudeGeometry caps (UV in metres) streaks run along X; on a LatheGeometry they become
 *   concentric (spun) rings.
 */
export function brushedMaps(o = {}) {
  const B = { ...STYLE_SPEC.brushed, ...o };
  const N = B.size, R = rng(B.seed);
  const octs = [[8, 0.12], [32, 0.2], [128, 0.3], [N, 0.38]].map(([cells, a]) => ({ cells, a, v: Array.from({ length: cells }, () => R.next()) }));
  const ph = Array.from({ length: 64 }, () => R.next() * Math.PI * 2);
  const row = new Float32Array(N);
  for (let y = 0; y < N; y++) {
    let s = 0;
    for (const o2 of octs) {
      const f = (y / N) * o2.cells, i = Math.floor(f), u = f - i, w = u * u * (3 - 2 * u);
      s += o2.a * lerp(o2.v[i % o2.cells], o2.v[(i + 1) % o2.cells], w);
    }
    row[y] = s;
  }
  const val = (x, y) => {
    const m = 1 + B.fine * 0.5 * Math.sin((x / N) * Math.PI * 2 * 3 + ph[y % 64]);
    return clamp(0.5 + (row[y] - 0.5) * 2 * B.streaks * m + (hash01(x >> 4, y, B.seed) - 0.5) * 0.08 * B.fine);
  };
  const [r0, r1] = B.roughness;
  const rough = paintPixels(N, (u, v, x, y) => r0 + (r1 - r0) * val(x, y));
  const bump = paintPixels(N, (u, v, x, y) => val(x, y));
  const rep = [B.perMetre, B.perMetre];
  return { roughnessMap: canvasTexture(rough, { repeat: rep, srgb: false }), bumpMap: canvasTexture(bump, { repeat: rep, srgb: false }) };
}

// ======================================================================= reflective floor ============
// reflectiveSweep: kit/studio.js; this style's floor defaults come from spec.floor
export const reflectiveSweep = (stage, material, o = {}) => kitReflectiveSweep(stage, material, { ...STYLE_SPEC.floor, ...o });

// ======================================================================= product geometry ===========
/** roundRectShape(w, d, r) -> THREE.Shape centred on the origin (x = width, y = depth before extrusion). */
export function roundRectShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + d - r); s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + d); s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

/**
 * bevelSlab({ w, d, h, radius, bevel, holes:[{ w, d, radius, x = 0, z = 0 }], segments = 3, material | [cap, side] })
 *   -> Mesh: a rounded-rectangle slab lying on y = 0 (top at y = h) with a chamfer-like bevel that catches strip
 *   highlights. UVs are in metres (brushed maps tile per metre). Groups: 0 = top/bottom caps, 1 = sides.
 */
export function bevelSlab(o = {}) {
  const { w = 1, d = 1, h = 0.1, radius = 0.05, bevel = 0.01, holes = [], segments = 3, curveSegments = 12 } = o;
  const shape = roundRectShape(w, d, radius);
  for (const hl of holes) {
    const hs = roundRectShape(hl.w, hl.d, hl.radius ?? 0.02);
    const path = new THREE.Path(hs.getPoints(curveSegments).map((pt) => new THREE.Vector2(pt.x + (hl.x ?? 0), pt.y - (hl.z ?? 0))).reverse());
    shape.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, h - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segments, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, o.material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** lathedBody(profile [[r, y], ...], { segments = 96, material }) -> Mesh: a turned/spun body (knob, can, lens barrel, pedestal). */
export function lathedBody(profile, { segments = 96, material } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * contactPads({ w, d, perSide, length, width, height, inset, rows = 1, rowGap, material }) -> InstancedMesh
 *   Rows of small rounded pads around the edge of a w × d rectangle (lying on y = 0), long axis pointing
 *   inward. rows = 2 staggers a second, inner row. Use for chip pads, connector pins, speaker grilles, buttons.
 */
export function contactPads(o = {}) {
  const { w = 2, d = 2, perSide = 16, length = 0.14, width = 0.05, height = 0.01, inset = 0.05, rows = 1, rowGap = 0.04, material } = o;
  const geo = new RoundedBoxGeometry(width, height, length, 2, Math.min(width, height) * 0.45);
  geo.translate(0, height / 2, 0);
  const placements = [];
  for (let r = 0; r < rows; r++) {
    const off = inset + length / 2 + r * (length + rowGap);
    const n = perSide - r;
    for (let side = 0; side < 4; side++) {
      const along = side % 2 === 0 ? w : d, across = side % 2 === 0 ? d : w;
      const span = along - 2 * (inset + length + 0.04);
      for (let i = 0; i < n; i++) {
        const a = -span / 2 + (n === 1 ? span / 2 : (i * span) / (n - 1));
        const c = across / 2 - off;
        const rot = side * Math.PI / 2;
        // side 0: +z edge, 1: +x, 2: -z, 3: -x
        const x = [a, c, -a, -c][side], z = [c, -a, -c, a][side];
        placements.push({ x, z, rot });
      }
    }
  }
  const im = new THREE.InstancedMesh(geo, material, placements.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  placements.forEach((pl, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot);
    im.setMatrixAt(i, m4.compose(new THREE.Vector3(pl.x, 0, pl.z), q, s));
  });
  im.castShadow = im.receiveShadow = true;
  return im;
}

/**
 * ballGrid({ w, d, pitch, radius, keepOut = 0, material }) -> InstancedMesh: a grid of spheres hanging below
 *   y = 0 (solder balls / BGA, rivets, feet, speaker-grille domes). keepOut: half-size of an empty centre square.
 *   Metal spheres reflect the whole studio, so they sparkle in the mirror floor under a floating object.
 */
export function ballGrid(o = {}) {
  const { w = 2, d = 2, pitch = 0.14, radius = 0.03, keepOut = 0, material, segments = 12 } = o;
  const geo = new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.66));
  const pts = [];
  const nx = Math.floor(w / pitch), nz = Math.floor(d / pitch);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = (i - (nx - 1) / 2) * pitch, z = (j - (nz - 1) / 2) * pitch;
    if (Math.abs(x) < keepOut && Math.abs(z) < keepOut) continue;
    pts.push([x, -radius * 0.7, z]);
  }
  const im = new THREE.InstancedMesh(geo, material, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, k) => im.setMatrixAt(k, m4.makeTranslation(...p)));
  im.castShadow = true;
  return im;
}

/**
 * etchedPanel({ w, d, cols, rows, gap, seed, px }) -> Mesh (plane facing +Y, centred) — polished black glass
 *   with an etched pattern of cols × rows "cells" under the clearcoat; each cell can glow in the accent.
 *   Pattern per cell (seeded): memory array, logic blocks or bus lines. Base map = faint etch; emissive map
 *   = the same etch, gated per cell by a cols × rows level texture.
 *   userData: setCell(i, j, level), setAll(level), commit(), cellCenter(i, j) -> local Vector3, cols, rows.
 */
export function etchedPanel(o = {}, G = STYLE_SPEC.glow) {
  const { w = 1.2, d = 1.2, cols = 6, rows = 6, gap = 0.08, seed = 5, px = 1024 } = o;
  const R = rng(seed);
  const base = makeCanvas(px), emis = makeCanvas(px);
  const bc = base.getContext("2d"), ec = emis.getContext("2d");
  bc.fillStyle = "#06070a"; bc.fillRect(0, 0, px, px);
  ec.fillStyle = "#000"; ec.fillRect(0, 0, px, px);
  const cw = px / cols, chh = px / rows;
  // inter-cell bus traces (base only)
  bc.strokeStyle = "#14171c"; bc.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    const y = Math.round(R.range(0, px)) + 0.5;
    bc.beginPath(); bc.moveTo(0, y); bc.lineTo(px, y); bc.stroke();
  }
  const draw = (fn) => { fn(bc, "#1b1f26", "#22272f"); fn(ec, "#ffffff", "#9a9a9a"); };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x0 = i * cw + cw * gap / 2, y0 = j * chh + chh * gap / 2, ww = cw * (1 - gap), hh = chh * (1 - gap);
    const kind = R.pick(["array", "array", "logic", "bus"]);
    draw((c, hi, mid) => {
      c.strokeStyle = hi; c.lineWidth = 2;
      c.strokeRect(x0 + 1, y0 + 1, ww - 2, hh - 2);
      c.fillStyle = mid;
      const r2 = rng(seed * 1000 + j * cols + i);
      if (kind === "array") {
        const n = r2.int(5, 8), m = r2.int(5, 8), pad = ww * 0.1;
        for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
          const bw = (ww - 2 * pad) / n, bh = (hh - 2 * pad) / m;
          c.fillRect(x0 + pad + a * bw + bw * 0.14, y0 + pad + b * bh + bh * 0.14, bw * 0.72, bh * 0.72);
        }
      } else if (kind === "logic") {
        // standard-cell style: rows of snapped rectangles of varying width
        const nRow = r2.int(5, 7), pad = ww * 0.1, rh = (hh - 2 * pad) / nRow;
        for (let k = 0; k < nRow; k++) {
          let x = 0;
          while (x < 1) {
            const len = Math.min(1 - x, r2.pick([0.12, 0.18, 0.25, 0.37]));
            if (r2.chance(0.78)) c.fillRect(x0 + pad + x * (ww - 2 * pad) + 2, y0 + pad + k * rh + rh * 0.16, len * (ww - 2 * pad) - 4, rh * 0.68);
            x += len;
          }
        }
      } else {
        const n = r2.int(9, 14);
        for (let k = 0; k < n; k++) c.fillRect(x0 + ww * 0.1, y0 + hh * (0.1 + (0.8 * k) / n), ww * 0.8, hh * 0.022);
      }
    });
  }
  const map = canvasTexture(base, { srgb: true });
  const emissiveMap = canvasTexture(emis, { srgb: true });
  for (const t of [map, emissiveMap]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  const levels = new Uint8Array(cols * rows * 4);
  const lt = new THREE.DataTexture(levels, cols, rows, THREE.RGBAFormat);
  lt.magFilter = lt.minFilter = THREE.NearestFilter;
  lt.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({
    color: "#ffffff", map, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.025,
    emissive: G.color, emissiveIntensity: G.strength, emissiveMap,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLevels = { value: lt };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uLevels;")
      .replace("#include <emissivemap_fragment>", `#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
  float lvl = texture2D( uLevels, vEmissiveMapUv ).r;
  totalEmissiveRadiance *= emissiveColor.rgb * lvl;
  diffuseColor.rgb += emissiveColor.rgb * lvl * 0.04;
#endif`);
  };
  mat.customProgramCacheKey = () => "studio-product-etched";
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  // canvas row j (top = back, -z) <-> data row rows-1-j (DataTexture is not flipped)
  const idx = (i, j) => ((rows - 1 - j) * cols + i) * 4;
  mesh.userData = {
    cols, rows, levels: lt,
    setCell(i, j, v) { levels[idx(i, j)] = Math.round(clamp(v) * 255); },
    setAll(v) { for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) levels[idx(i, j)] = Math.round(clamp(v) * 255); },
    commit() { lt.needsUpdate = true; },
    cellCenter(i, j) { return new THREE.Vector3(-w / 2 + ((i + 0.5) * w) / cols, 0, -d / 2 + ((j + 0.5) * d) / rows); },
  };
  return mesh;
}

/** roundRectLoop(w, d, r, y = 0, perCorner = 10, startAt = 0) -> closed [[x,y,z]] loop (first point repeated at the end). */
export function roundRectLoop(w, d, r, y = 0, perCorner = 10) {
  const pts = [];
  // start mid front edge (+z), run clockwise seen from above
  pts.push([0, y, d / 2]);
  const arc = (cx, cz, a0) => { for (let k = 0; k <= perCorner; k++) { const a = a0 + (Math.PI / 2) * (k / perCorner); pts.push([cx + Math.sin(a) * r, y, cz + Math.cos(a) * r]); } };
  // corners in order: front-right, back-right, back-left, front-left (angle measured from +z toward +x)
  arc(w / 2 - r, d / 2 - r, 0);
  arc(w / 2 - r, -d / 2 + r, Math.PI / 2);
  arc(-w / 2 + r, -d / 2 + r, Math.PI);
  arc(-w / 2 + r, d / 2 - r, Math.PI * 1.5);
  pts.push([0, y, d / 2]);
  return pts;
}

/**
 * edgeTrace(points, { radius, color, intensity, tail }) -> Mesh: a hair-thin HDR light running along a path
 *   (the "rim light traces the edge" reveal). userData.set(head, { level = 1, tail, full = 0 }): head 0..1+tail
 *   is the bright front along the path's length; `full` lights the whole path (after the trace completes).
 */
export function edgeTrace(points, o = {}) {
  const T = { ...STYLE_SPEC.trace, ...o };
  const g = sweepGeometry(points, T.radius, 8);
  const radial = 8, n = points.length;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
  const total = lens[n - 1];
  const s = new Float32Array(n * radial);
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) s[i * radial + j] = lens[i] / total;
  g.setAttribute("aS", new THREE.BufferAttribute(s, 1));
  const c = col(T.color).multiplyScalar(T.intensity);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uTail: { value: T.tail }, uLevel: { value: 0 }, uFull: { value: 0 }, uColor: { value: c } },
    vertexShader: "attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uHead, uTail, uLevel, uFull; uniform vec3 uColor; varying float vS;
      void main(){ float d = uHead - vS; float a = d < 0.0 ? 0.0 : pow(clamp(1.0 - d / uTail, 0.0, 1.0), 1.6);
        a = max(a, uFull); a *= uLevel; gl_FragColor = vec4(uColor * a, 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 5;
  mesh.userData.set = (head, { level = 1, tail = T.tail, full = 0 } = {}) => {
    mat.uniforms.uHead.value = head; mat.uniforms.uTail.value = tail; mat.uniforms.uLevel.value = level; mat.uniforms.uFull.value = full;
    mesh.visible = level > 0.001;
  };
  mesh.userData.set(0, { level: 0 });
  return mesh;
}

/** turntable({ keys:[{t, v (rad), ease}] | speed (rad/s), phase }) -> Group; userData.update(t) sets rotation.y. Invisible. */
export function turntable(o = {}) {
  const g = new THREE.Group();
  g.name = "turntable";
  const speed = o.speed ?? STYLE_SPEC.turntable.speed, phase = o.phase ?? 0;
  g.userData.angle = (t) => (o.keys ? plan.keyed(t, o.keys) : phase + speed * t);
  g.userData.update = (t) => { g.rotation.y = g.userData.angle(t); };
  return g;
}

// overlay type, hairline, callout, titleLockup: kit/callouts.js with this style's spec.overlay as the look
export const callout = (stage, label, o = {}) => kitCallout(stage, label, { ...o, look: { ...STYLE_SPEC.overlay, ...o.look } });
export const titleLockup = (stage, title, o = {}) => kitTitleLockup(stage, title, { ...o, look: { ...STYLE_SPEC.overlay, ...o.look } });

// ======================================================================= depth of field =============
/** depthOfField: kit/studio.js with spec.dof */
/** depthOfField: kit/studio.js with spec.dof (corrected depth pre-pass; legacyPrepass dropped after a look review, 2026-11-13) */
export const depthOfField = (stage, o = {}) => kitDepthOfField(stage, { ...STYLE_SPEC.dof, ...o });

// ======================================================================= createStyle ================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, dof = true, studio: { ...overrides of spec.studio } }
 *   style.render(t, { focus:[x,y,z] }) = floor reflection pass + DOF focus + stage.render(t). Use it instead
 *   of stage.render in renderAt.
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = spec.palette;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // brushed aluminium: procedural streak maps + anisotropy
  const bm = brushedMaps();
  Object.assign(materials.brushedMetal, { roughnessMap: bm.roughnessMap, bumpMap: bm.bumpMap, bumpScale: spec.brushed.bump, roughness: 1, anisotropy: spec.brushed.anisotropy });
  materials.brushedMetal.needsUpdate = true;
  for (const k of Object.keys(materials)) if (materials[k].isMeshStandardMaterial) materials[k].envMapIntensity = 1;

  const studio = studioEnvironment(stage, { ...spec.studio, ...(opts.studio ?? {}) }, { lights });
  const dof = opts.dof === false ? { pass: null, setFocus() {} } : depthOfField(stage);
  let floor = null;

  const props = {
    /** reflectiveSweep({ width, depth, height, radius, center }) — black cyclorama with the blurred-mirror floor. */
    sweep(o = {}) { floor = reflectiveSweep(stage, materials.floor, o); return floor; },
    bevelSlab: (o = {}) => bevelSlab({ material: materials[o.materialName ?? "ceramic"], ...o }),
    lathedBody: (profile, o = {}) => lathedBody(profile, { material: materials[o.materialName ?? "brushedMetal"], ...o }),
    etchedPanel: (o = {}) => etchedPanel(o),
    contactPads: (o = {}) => contactPads({ material: materials[o.materialName ?? "gold"], ...o }),
    ballGrid: (o = {}) => ballGrid({ material: materials[o.materialName ?? "gold"], ...o }),
    edgeTrace: (points, o = {}) => edgeTrace(points, o),
    turntable: (o = {}) => turntable(o),
    contactShadow: (o = {}) => contactShadow({ opacity: 0.55, ...o }),
    callout: (label, o = {}) => callout(stage, label, o),
    titleLockup: (title, o = {}) => titleLockup(stage, title, o),
    /** brushedMaterial({ perMetre, seed, ... }) -> a new brushed-metal material with its own streak maps (e.g. for lathed parts). */
    brushedMaterial(o = {}) {
      const m = materials.brushedMetal.clone();
      const mp = brushedMaps(o);
      Object.assign(m, { roughnessMap: mp.roughnessMap, bumpMap: mp.bumpMap });
      if (o.color) m.color.set(o.color);
      return m;
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
      sweep: (s) => props.sweep(s.dims ?? {}),
      bevelSlab: (s, mats) => bevelSlab({ ...(s.dims ?? {}), material: mats[s.material ?? "ceramic"] }),
      lathedBody: (s, mats) => lathedBody(s.dims?.profile ?? [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], { ...(s.dims ?? {}), material: mats[s.material ?? "brushedMetal"] }),
      etchedPanel: (s) => etchedPanel(s.dims ?? {}),
      contactPads: (s, mats) => contactPads({ ...(s.dims ?? {}), material: mats[s.material ?? "gold"] }),
    },
    studio,
    dof,
    plan,
    helpers: { ballGrid, studioEnvironment, brushedMaps, reflectiveSweep, roundRectShape, roundRectLoop, depthOfField },
    /** render(t, { focus }) — mirror pass for the floor, DOF focus on a world point, then stage.render(t). */
    render(t, { focus } = {}) {
      if (focus) dof.setFocus(stage.camera.position.distanceTo(V3(focus)));
      if (floor) floor.userData.renderReflection(stage.renderer, stage.scene, stage.camera);
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
