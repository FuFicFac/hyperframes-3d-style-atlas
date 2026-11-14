// styles/voxel/style.js — Voxel Studio. Every object is an InstancedMesh of same-size bevelled cubes on an
// integer grid, with per-instance colour and per-face ambient occlusion computed from neighbour occupancy
// (26-neighbour bit mask per cube, decoded in the fragment shader -> smooth crevice gradients).
//
// Authoring model: voxels are plain data { x, y, z, c } (integer grid coords, c = sRGB hex or a legend key).
// Make them from ASCII sprites (spriteVoxels / layerVoxels), procedural fills (boxVoxels, sphereVoxels,
// heightVoxels) or the 5x7 bitmap font (textVoxels), then hand them to props.model(). Time enters only
// through the closed-form helpers (assemble, cubeSteps, flip) that the scene calls from renderAt(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createCyclorama } from "../../kit/builders.js";
import { clamp, lerp, ease, hash01, smoothstep } from "../../kit/time.js";
import { FONT_5X7, FONT_W, FONT_H } from "../../kit/bitmapfont.js";
import { occupancyMasks, voxelMaterial, cubeSteps, waveKey } from "../../kit/voxels.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// 5x7 bitmap font data: kit/bitmapfont.js (promoted, identical data)
export { FONT_5X7, FONT_W, FONT_H };

/** measureText(str, { spacing = 1, lineGap = 3 }) -> { width, height, lines } in cubes. */
export function measureText(str, { spacing = 1, lineGap = 3 } = {}) {
  const lines = String(str).toUpperCase().split("\n");
  const width = Math.max(...lines.map((l) => (l.length ? l.length * (FONT_W + spacing) - spacing : 0)));
  return { width, height: lines.length * FONT_H + (lines.length - 1) * lineGap, lines };
}

/**
 * textVoxels(str, { spacing = 1, lineGap = 3, depth = 1, align = "left"|"center"|"right", color = "#2b2d42",
 *                   colorFn(ch, charIndex, lineIndex) -> hex|null }) -> voxels
 * Origin: x = 0 at the left of the block ("center": block centred on x = 0), y = 0 at the bottom row of the
 * last line, z = 0..depth-1. Each voxel carries { ch, ci (char index in the whole string), line }.
 */
export function textVoxels(str, o = {}) {
  const { spacing = 1, lineGap = 3, depth = 1, align = "left", color = "#2b2d42", colorFn = null } = o;
  const { width, lines } = measureText(str, { spacing, lineGap });
  const out = [];
  let ci = 0;
  lines.forEach((line, li) => {
    const lw = line.length ? line.length * (FONT_W + spacing) - spacing : 0;
    const x0 = align === "center" ? -Math.floor(lw / 2) : align === "right" ? width - lw : 0;
    const yTop = (lines.length - 1 - li) * (FONT_H + lineGap) + FONT_H - 1;
    [...line].forEach((ch, k) => {
      const g = FONT_5X7[ch] ?? FONT_5X7["?"];
      const c = (colorFn && colorFn(ch, ci, li)) || color;
      for (let r = 0; r < FONT_H; r++) for (let x = 0; x < FONT_W; x++) {
        if (g[r][x] !== "#") continue;
        for (let z = 0; z < depth; z++) out.push({ x: x0 + k * (FONT_W + spacing) + x, y: yTop - r, z, c, ch, ci, line: li, col: k });
      }
      ci++;
    });
    ci++; // the newline
  });
  return out;
}

// ---------------------------------------------------------------- sprite + procedural voxel sources (pure)
/**
 * spriteVoxels(rows, legend, { depth = 1, x0 = 0, y0 = 0, z0 = 0 }) -> voxels
 *   rows: strings, top row first; legend: { char: hex } ('.' or ' ' or missing = empty).
 *   depth: number or { char: depth } — the sprite is extruded toward +z (z0 .. z0+depth-1).
 *   Each voxel carries { px, py, key, j } (pixel coords, legend key, extrusion index).
 */
export function spriteVoxels(rows, legend, { depth = 1, x0 = 0, y0 = 0, z0 = 0 } = {}) {
  const out = [];
  const H = rows.length;
  rows.forEach((row, r) => {
    [...row].forEach((key, x) => {
      const c = legend[key];
      if (!c) return;
      const d = typeof depth === "number" ? depth : depth[key] ?? 1;
      for (let j = 0; j < d; j++) out.push({ x: x0 + x, y: y0 + H - 1 - r, z: z0 + j, c, key, px: x, py: H - 1 - r, j });
    });
  });
  return out;
}

/**
 * layerVoxels(layers, legend, { axis = "y" }) -> voxels — classic voxel-art authoring: a stack of 2D ASCII
 * slices. axis "y": layers[0] is the bottom slice, each slice is a top-down grid (rows = -z .. +z).
 * axis "z": layers[0] is the back slice, each slice is a front view (rows top-first).
 */
export function layerVoxels(layers, legend, { axis = "y" } = {}) {
  const out = [];
  layers.forEach((rows, k) => {
    const H = rows.length;
    rows.forEach((row, r) => [...row].forEach((key, x) => {
      const c = legend[key];
      if (!c) return;
      if (axis === "y") out.push({ x, y: k, z: r - Math.floor(H / 2), c, key });
      else out.push({ x, y: H - 1 - r, z: k, c, key });
    }));
  });
  return out;
}

const colorOf = (c, x, y, z) => (typeof c === "function" ? c(x, y, z) : c);
/** boxVoxels(w, h, d, color | (x,y,z)=>hex, { hollow = false }) -> voxels; x 0..w-1, y 0..h-1, z 0..d-1. */
export function boxVoxels(w, h, d, color, { hollow = false } = {}) {
  const out = [];
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    if (hollow && x > 0 && y > 0 && z > 0 && x < w - 1 && y < h - 1 && z < d - 1) continue;
    out.push({ x, y, z, c: colorOf(color, x, y, z) });
  }
  return out;
}
/** sphereVoxels(r, color | fn, { shell = 1.2 }) -> voxels centred on 0 (only the outer shell, for cube economy). */
export function sphereVoxels(r, color, { shell = 1.2 } = {}) {
  const out = [];
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y, z);
    if (d <= r && d > r - shell) out.push({ x, y, z, c: colorOf(color, x, y, z) });
  }
  return out;
}
/** heightVoxels(w, d, h(x,z) -> cubes, color(x, y, z, top) -> hex) -> columns of cubes on y >= 0 (terrain, bar charts). */
export function heightVoxels(w, d, h, color) {
  const out = [];
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const n = Math.max(0, Math.round(h(x, z)));
    for (let y = 0; y < n; y++) out.push({ x, y, z, c: color(x, y, z, n - 1) });
  }
  return out;
}

// occupancyMasks + voxelMaterial (AO shader): kit/voxels.js (promoted, identical code)
export { occupancyMasks };

// ---------------------------------------------------------------- closed-form motion (pure)
export { cubeSteps, waveKey }; // kit/voxels.js

// ---------------------------------------------------------------- the style
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const V = spec.voxel;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: spec.text.font, color: spec.text.color, height: spec.text.height, size: V.size * V.textSize };
  const tmpC = new THREE.Color();
  const toLinear = (c) => (Array.isArray(c) ? c : (tmpC.set(c), [tmpC.r, tmpC.g, tmpC.b]));

  /**
   * model(voxels, { size = V.size, fill, bevel, capacity, anchor = "none"|"bottom-center"|"center", ao, castShadow = true,
   *                 receiveShadow = true, material }) -> InstancedMesh (scaled by `size`; instance coords = grid cells)
   * userData:
   *   n, capacity, voxels, home Float32Array(3n), base Float32Array(3n) linear colours, pos (current, grid units),
   *   setPose(i, x, y, z, s = 1, rx = 0, ry = 0, rz = 0)   grid units, radians
   *   setColor(i, r, g, b) linear | setHex(i, hex) | setVoxels(voxels) (re-home, recolour, hide the rest)
   *   rest()           every cube at home, scale 1, base colour
   *   commit({ ao = true })  upload matrices/colours and recompute AO from the current snapped positions
   */
  function model(voxels, o = {}) {
    const size = o.size ?? V.size, fill = o.fill ?? V.fill, bevel = o.bevel ?? V.bevel;
    const ao = { ...V.ao, ...(o.ao ?? {}) };
    const cap = Math.max(1, o.capacity ?? voxels.length);
    const geo = new RoundedBoxGeometry(fill, fill, fill, V.bevelSegments, bevel * fill);
    const maskAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    maskAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("voxMask", maskAttr);
    const mat = voxelMaterial(o.material ?? materials.voxel, { fill, ao });
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.scale.setScalar(size);
    mesh.castShadow = o.castShadow ?? true;
    mesh.receiveShadow = o.receiveShadow ?? true;
    mesh.frustumCulled = false; // cubes fly far from the bind-time bounds
    const ud = mesh.userData;
    ud.capacity = cap;
    ud.size = size;
    ud.home = new Float32Array(cap * 3);
    ud.base = new Float32Array(cap * 3);
    ud.pos = new Float32Array(cap * 3);
    ud.scale = new Float32Array(cap);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();

    ud.setVoxels = (vox) => {
      let off = [0, 0, 0];
      if (o.anchor && vox.length) {
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (const v of vox) { mn[0] = Math.min(mn[0], v.x); mn[1] = Math.min(mn[1], v.y); mn[2] = Math.min(mn[2], v.z); mx[0] = Math.max(mx[0], v.x); mx[1] = Math.max(mx[1], v.y); mx[2] = Math.max(mx[2], v.z); }
        const cx = Math.round((mn[0] + mx[0]) / 2), cz = Math.round((mn[2] + mx[2]) / 2);
        off = o.anchor === "center" ? [-cx, -Math.round((mn[1] + mx[1]) / 2), -cz] : [-cx, -mn[1], -cz];
      }
      ud.n = Math.min(cap, vox.length);
      ud.voxels = vox;
      for (let i = 0; i < cap; i++) {
        const v = vox[i];
        if (v) {
          ud.home[i * 3] = v.x + off[0]; ud.home[i * 3 + 1] = v.y + off[1]; ud.home[i * 3 + 2] = v.z + off[2];
          const l = toLinear(v.c);
          ud.base[i * 3] = l[0]; ud.base[i * 3 + 1] = l[1]; ud.base[i * 3 + 2] = l[2];
        }
      }
      ud.rest();
    };
    ud.setPose = (i, x, y, z, s = 1, rx = 0, ry = 0, rz = 0) => {
      ud.pos[i * 3] = x; ud.pos[i * 3 + 1] = y; ud.pos[i * 3 + 2] = z; ud.scale[i] = s;
      P.set(x, y, z);
      S.setScalar(Math.max(s, 1e-5));
      if (rx || ry || rz) Q.setFromEuler(E.set(rx, ry, rz)); else Q.identity();
      mesh.setMatrixAt(i, M.compose(P, Q, S));
    };
    ud.setColor = (i, r, g, b) => mesh.setColorAt(i, C.setRGB(r, g, b));
    ud.setHex = (i, hex) => mesh.setColorAt(i, C.set(hex));
    ud.rest = () => {
      for (let i = 0; i < cap; i++) {
        if (i < ud.n) {
          ud.setPose(i, ud.home[i * 3], ud.home[i * 3 + 1], ud.home[i * 3 + 2], 1);
          ud.setColor(i, ud.base[i * 3], ud.base[i * 3 + 1], ud.base[i * 3 + 2]);
        } else {
          ud.setPose(i, 0, -1e4, 0, 0);
          ud.setColor(i, 0, 0, 0);
        }
      }
    };
    ud.commit = ({ ao: doAO = true } = {}) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (doAO) {
        occupancyMasks(ud.pos, cap, (i) => i < ud.n && ud.scale[i] > 0.9, V.snapTolerance, maskAttr.array);
        maskAttr.needsUpdate = true;
      }
    };
    ud.setVoxels(voxels);
    ud.commit();
    return mesh;
  }

  // per-model memo of order keys (pure: depends only on the model's home layout + options)
  function orderKeys(mesh, order, seed, jitter) {
    const ud = mesh.userData;
    const k = `${typeof order === "function" ? "fn" : order}|${seed}|${jitter}|${ud.n}`;
    ud._keys = ud._keys ?? {};
    if (ud._keys[k] && ud._keys[k].src === ud.voxels) return ud._keys[k].keys;
    const n = ud.n, H = ud.home, keys = new Float32Array(n);
    const ax = { x: 0, y: 1, z: 2, "-x": 0, "-y": 1, "-z": 2 }[order];
    let mn = Infinity, mx = -Infinity;
    if (ax != null) for (let i = 0; i < n; i++) { mn = Math.min(mn, H[i * 3 + ax]); mx = Math.max(mx, H[i * 3 + ax]); }
    for (let i = 0; i < n; i++) {
      const h = hash01(i, seed, 7);
      let base;
      if (typeof order === "function") base = order(H[i * 3], H[i * 3 + 1], H[i * 3 + 2], i);
      else if (ax != null) { base = (H[i * 3 + ax] - mn) / Math.max(1, mx - mn); if (order[0] === "-") base = 1 - base; }
      else base = h;
      keys[i] = clamp(order === "random" ? h : base * (1 - jitter) + h * jitter);
    }
    ud._keys[k] = { src: ud.voxels, keys };
    return keys;
  }

  /**
   * flight(mesh, i, t, o) -> { x, y, z, s, rx, ry, rz, settled } — closed-form pose of cube i (grid units).
   *   o = { start, dur, spread, seed = 1, order = "random"|"x"|"y"|"z"|"-x"|"-y"|"-z"|fn(x,y,z,i)->0..1, jitter = .25,
   *         radius, bias = [0, 0, 0] (added to the scatter start, cubes), overshoot, spin,
   *         out: { at, dur = .35, spread = .25, order, to = "scatter"|"drop", radius } }
   *   In: each cube flies from a seeded point in a cloud around its home (radius cubes, plus bias) and snaps
   *   into its cell with a small outBack overshoot and a decaying tumble. Out: falls / bursts away (inBack).
   */
  function flight(mesh, i, t, o) {
    const A = V.assemble;
    const { start = 0, dur = A.dur, spread = A.spread, seed = 1, order = "random", jitter = 0.25, radius = A.radius, bias = [0, 0, 0], overshoot = A.overshoot, spin = A.spin } = o;
    const ud = mesh.userData;
    const hx = ud.home[i * 3], hy = ud.home[i * 3 + 1], hz = ud.home[i * 3 + 2];
    const keys = orderKeys(mesh, order, seed, jitter);
    const u = clamp((t - start - keys[i] * spread) / dur);
    // seeded scatter point on a squashed sphere around home
    const a = hash01(i, seed, 1) * Math.PI * 2, b = Math.acos(2 * hash01(i, seed, 2) - 1), r = radius * (0.45 + 0.55 * hash01(i, seed, 3));
    const sx = hx + Math.sin(b) * Math.cos(a) * r + bias[0], sy = hy + Math.cos(b) * r * 0.8 + bias[1], sz = hz + Math.sin(b) * Math.sin(a) * r * 0.6 + bias[2];
    const e = ease.outBack(u, overshoot);
    let x = lerp(sx, hx, e), y = lerp(sy, hy, e), z = lerp(sz, hz, e);
    let s = smoothstep(0, 0.3, u);
    const tum = spin * (1 - ease.outCubic(u)) * (hash01(i, seed, 4) < 0.5 ? -1 : 1);
    let rx = tum * hash01(i, seed, 5), ry = tum, rz = tum * hash01(i, seed, 6);
    let settled = u >= 1;
    if (o.out && t > o.out.at) {
      const O = o.out;
      const ok = orderKeys(mesh, O.order ?? order, seed + 11, jitter);
      const v = clamp((t - O.at - ok[i] * (O.spread ?? 0.25)) / (O.dur ?? 0.35));
      if (v > 0) {
        settled = false;
        const R = O.radius ?? radius;
        const k = ease.inBack(v, 1.4);
        if ((O.to ?? "scatter") === "drop") { y = lerp(hy, hy - R * (0.6 + hash01(i, seed, 8)), k); x = hx; z = hz + k * R * 0.3 * (hash01(i, seed, 9) - 0.5); }
        else { x = lerp(hx, sx, k); y = lerp(hy, sy, k); z = lerp(hz, sz, k); }
        s = 1 - smoothstep(0.55, 1, v);
        const sp = spin * ease.inCubic(v);
        rx = sp * hash01(i, seed, 5); ry = sp; rz = sp * hash01(i, seed, 6);
      }
    }
    return { x, y, z, s, rx, ry, rz, settled };
  }

  /** assemble(mesh, t, o) — poses every cube with flight(); commits (AO from settled cubes). Returns fraction settled. */
  function assemble(mesh, t, o = {}) {
    const ud = mesh.userData;
    let settled = 0;
    for (let i = 0; i < ud.n; i++) {
      const p = flight(mesh, i, t, o);
      ud.setPose(i, p.x, p.y, p.z, p.s, p.rx, p.ry, p.rz);
      settled += p.settled ? 1 : 0;
    }
    mesh.visible = anyVisible(ud);
    ud.commit();
    return settled / Math.max(1, ud.n);
  }
  const anyVisible = (ud) => { for (let i = 0; i < ud.n; i++) if (ud.scale[i] > 1e-3) return true; return false; };

  /**
   * text(str, { size = V.size * V.textSize, depth = 2, align = "center", color = palette.ink, colorFn, capacity, spacing, lineGap })
   *   -> voxel-text model (anchor: bottom-centre of the block); userData.setText(str) re-lays it out (deterministic),
   *   userData.width / height in world metres.
   */
  function text(str, o = {}) {
    const size = o.size ?? textStyle.size;
    const opt = { depth: o.depth ?? 2, align: o.align ?? "center", color: o.color ?? spec.palette.ink, colorFn: o.colorFn, spacing: o.spacing ?? 1, lineGap: o.lineGap ?? 3 };
    const build = (s) => textVoxels(s, opt);
    const vox = build(str);
    const m = model(vox, { size, capacity: o.capacity ?? vox.length, ao: o.ao });
    const ud = m.userData;
    const measure = (s) => {
      const mm = measureText(s, opt);
      ud.width = mm.width * size;
      ud.height = mm.height * size;
    };
    measure(str);
    ud.text = str;
    ud.setText = (s) => {
      if (s === ud.text) return;
      ud.text = s;
      ud.setVoxels(build(s));
      measure(s);
      ud.commit();
    };
    return m;
  }

  /** gapBoard(w, h, d = .6) -> dark box (grid units) to put behind thin voxel panels so the gaps read dark. */
  function gapBoard(w, h, d = 0.6, size = V.size) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * size, h * size, d * size), materials.gap);
    m.receiveShadow = true;
    return m;
  }

  /** studio({ width = 30, depth = 16, height = 12, radius = 4 }) -> seamless pale cyclorama (floor + back wall). */
  const studio = (o = {}) => createCyclorama({ width: 30, depth: 16, height: 12, radius: 4, material: materials.floor, ...o });

  /**
   * flip(t, at, dur = .16) -> { k, ry, s }: split-flap recolour at time `at`. k = 0 before the midpoint, 1 after
   * (swap colours on k); ry turns the cube a half-turn about Y; s dips slightly while edge-on.
   */
  function flip(t, at, dur = 0.16) {
    const u = clamp((t - at) / dur);
    return { k: u >= 0.5 ? 1 : 0, ry: u > 0 && u < 1 ? Math.PI * ease.inOutSine(u) : 0, s: 1 - 0.12 * Math.sin(Math.PI * u) };
  }

  const props = { model, text, gapBoard, studio };
  const helpers = {
    flight, assemble, cubeSteps, waveKey, flip, occupancyMasks,
    textVoxels, measureText, spriteVoxels, layerVoxels, boxVoxels, sphereVoxels, heightVoxels, FONT_5X7,
  };
  const factories = {
    voxBox: (os) => model(boxVoxels(os.params.w, os.params.h, os.params.d, os.params.color ?? spec.palette.wood), os.params),
    voxSprite: (os) => model(spriteVoxels(os.params.rows, os.params.legend, os.params), os.params),
    voxSphere: (os) => model(sphereVoxels(os.params.r, os.params.color ?? spec.palette.accent), os.params),
    voxText: (os) => text(os.params.text, os.params),
    studio: (os) => studio(os.params ?? {}),
  };

  return { spec, palette: spec.palette, materials, lights, post, textStyle, camera: spec.camera, props, factories, helpers, sfx: spec.sfx };
}
