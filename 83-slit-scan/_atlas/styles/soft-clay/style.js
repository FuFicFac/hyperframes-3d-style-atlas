// styles/soft-clay/style.js — "Soft Clay": stop-motion plasticine props on a paper sweep.
// Implements the style contract (references/kit-api.md §3).
//
// Every prop is built from a few clay primitives (lumpy blob, rolled coil, flattened puck, rounded slab,
// lathe) that all pass through `clayify()`: seeded low-frequency vertex wobble, thumb dents with a raised
// lip, and a flattened contact patch where they rest. Fine surface detail (fingertip grain + tool-mark
// streaks) is an object-space shader patch on the clay material, so it needs no UVs and sticks to the prop;
// a shared uniform shifts it on every new pose ("boil"). Props have their pivot at the centre of their
// base (y = 0 on the table), so scale.y squashes them INTO the table.
//
// Nothing animates itself. Scenes call `style.setPose(t)` once per frame, compute object motion from
// `tq = style.motion.onTwos(t)` with the pure helpers in `style.motion`, and call prop hooks
// (`setGlow(u)`, `setKnead(k, tq)`, `setOpen(u)`, `showLetters(n)`).
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createCyclorama, RoundedBoxGeometry } from "../../kit/builders.js";
import { tubeAlong } from "../../kit/paths.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { shapes } from "../../kit/shapes.js";
import { FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, ease, spring, TAU } from "../../kit/time.js";
import { noise3, fbm3 } from "../../kit/noise.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// noise3 / fbm3: kit/noise.js (promoted, identical code)
export { noise3, fbm3 };

// ---------------------------------------------------------------------------------------------
// GLSL: object-space micro-bump + tool marks + per-pose boil (patched into MeshPhysicalMaterial)
// ---------------------------------------------------------------------------------------------
const GLSL_NOISE = /* glsl */ `
varying vec3 vClayPos;
uniform vec3 uClayBoil;
uniform vec4 uClayBump; // microFreq, microStrength, toolFreq, toolStrength
uniform float uClayStretch;
float clayH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float clayN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clayH(i), clayH(i + vec3(1,0,0)), f.x), mix(clayH(i + vec3(0,1,0)), clayH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clayH(i + vec3(0,0,1)), clayH(i + vec3(1,0,1)), f.x), mix(clayH(i + vec3(0,1,1)), clayH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float clayHeight(vec3 p) {
  vec3 q = p * uClayBump.x + uClayBoil;
  float m = clayN(q) * 0.55 + clayN(q * 2.07 + 7.1) * 0.3 + clayN(q * 4.3 + 3.7) * 0.15;
  // tool marks: short streaks along a slowly varying diagonal, only where a second noise says "dragged here"
  vec3 r = p * uClayBump.z + uClayBoil * 0.5;
  vec3 d1 = normalize(vec3(0.62, 0.35, 0.7) + 0.6 * (vec3(clayN(r * 0.35), clayN(r * 0.35 + 5.0), clayN(r * 0.35 + 9.0)) - 0.5));
  vec3 d2 = normalize(cross(d1, vec3(0.0, 1.0, 0.2)));
  float tool = clayN(vec3(dot(r, d1), dot(r, d2) * uClayStretch, dot(r, cross(d1, d2))));
  tool = smoothstep(0.62, 0.92, tool) * smoothstep(0.45, 0.75, clayN(r * 0.5 + 21.0));
  return m * uClayBump.y / max(uClayBump.x, 0.001) - tool * uClayBump.w / max(uClayBump.z, 0.001);
}
vec3 clayPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float fd) {
  vec3 sX = dFdx(surfPos), sY = dFdy(surfPos);
  vec3 R1 = cross(sY, surfNorm), R2 = cross(surfNorm, sX);
  float det = dot(sX, R1) * fd;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

// ---------------------------------------------------------------------------------------------
// createStyle
// ---------------------------------------------------------------------------------------------
/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, C = spec.clay, TUNE = spec.tuning, LET = spec.lettering;
  const col = (c) => P[c] ?? c;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  const key = lights.key;
  if (key?.target && !key.target.parent) stage.scene.add(key.target);

  // ---- shared clay uniforms (one object: every clay material sees the same boil offset) ----
  const U = {
    uClayBoil: { value: new THREE.Vector3() },
    uClayBump: { value: new THREE.Vector4(C.microBump.freq, C.microBump.strength, C.toolMarks.freq, C.toolMarks.strength) },
    uClayStretch: { value: C.toolMarks.stretch },
  };
  function patchClay(m) {
    m.sheenColor = new THREE.Color(C.sheenColor);
    m.sheenRoughness = C.sheenRoughness;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vClayPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvClayPos = transformed;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${GLSL_NOISE}`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          { float hC = clayHeight(vClayPos); normal = clayPerturb(-vViewPosition, normal, vec2(dFdx(hC), dFdy(hC)), faceDirection); }`);
    };
    m.customProgramCacheKey = () => "soft-clay-v1";
    m.needsUpdate = true;
    return m;
  }
  patchClay(materials.clay);
  const clayMats = {};
  /** clay(name|hex, { glow }) -> shared material for that colour (clone of the clay template). */
  const clay = (name) => {
    const k = col(name);
    if (!clayMats[k]) { const m = patchClay(materials.clay.clone()); m.color.set(k); m.name = `clay:${name}`; clayMats[k] = m; }
    return clayMats[k];
  };
  for (const n of spec.clays) materials[n] = materials[`clay:${n}`] = clay(n);
  /** Own (unshared) clay material, e.g. for a prop that glows. */
  const clayOwn = (name) => { const m = patchClay(materials.clay.clone()); m.color.set(col(name)); m.name = `clay:${name}:own`; return m; };

  // ---------------------------------------------------------------------------------------------
  // Geometry: clayify = merge -> wobble -> dents -> flatten contact -> normals
  // ---------------------------------------------------------------------------------------------
  function prep(geo) {
    for (const a of ["uv", "uv1", "uv2", "normal"]) if (geo.attributes[a]) geo.deleteAttribute(a);
    const g = mergeVertices(geo, 1e-4);
    g.computeVertexNormals();
    return g;
  }
  /**
   * clayify(geo, { size, seed, wobble = 1, dents = 1, flatten = 0, dentFacing }) -> BufferGeometry
   *   size: characteristic size in metres (wobble amp + dent radius scale with it).
   *   wobble / dents: multipliers on spec.clay (0 = off). flatten: fraction of height pressed flat at the base
   *   (then the geometry is shifted so its base sits on y = 0). dentFacing: [x,y,z] bias dents toward a side.
   */
  function clayify(geo, o = {}) {
    const { size = 0.5, seed = 1, wobble = 1, dents = 1, flatten = 0, dentFacing = [0, 0.3, 1] } = o;
    const g = prep(geo);
    const pos = g.attributes.position, n = pos.count;
    const r = rng(`clay-${seed}`);
    const s1 = r.int(1, 1e6), s2 = r.int(1, 1e6), s3 = r.int(1, 1e6);
    if (wobble > 0) {
      const amp = C.wobble.amp * size * wobble, f = C.wobble.freq / size;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        pos.setXYZ(i,
          x + amp * (fbm3(x * f, y * f, z * f, s1, 2) - 0.5) * 2,
          y + amp * (fbm3(x * f, y * f, z * f, s2, 2) - 0.5) * 2,
          z + amp * (fbm3(x * f, y * f, z * f, s3, 2) - 0.5) * 2);
      }
      g.computeVertexNormals();
    }
    if (dents > 0) {
      const nor = g.attributes.normal;
      const k = r.int(C.dents.count[0], C.dents.count[1]);
      const face = new THREE.Vector3(...dentFacing).normalize();
      const P0 = new THREE.Vector3(), N0 = new THREE.Vector3(), V = new THREE.Vector3(), Nv = new THREE.Vector3(), T = new THREE.Vector3();
      const disp = new Float32Array(n);
      for (let d = 0; d < k; d++) {
        let idx = 0;
        for (let tries = 0; tries < 40; tries++) {
          idx = r.int(0, n - 1);
          N0.fromBufferAttribute(nor, idx);
          if (N0.dot(face) > 0.35) break;
        }
        P0.fromBufferAttribute(pos, idx);
        N0.fromBufferAttribute(nor, idx);
        T.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).cross(N0).normalize();
        const R = size * r.range(C.dents.radius[0], C.dents.radius[1]) * dents;
        const depth = C.dents.depth * size * dents * r.range(0.7, 1.2);
        for (let i = 0; i < n; i++) {
          V.fromBufferAttribute(pos, i).sub(P0);
          if (V.lengthSq() > R * R * 2.2) continue;
          Nv.fromBufferAttribute(nor, i);
          if (Nv.dot(N0) < 0.25) continue;
          const along = V.dot(T);
          const x = Math.sqrt(Math.max(0, V.lengthSq() - along * along * 0.45)) / R; // elongated along T
          if (x > 1.45) continue;
          const bowl = x < 1 ? -((1 - x * x) ** 2) : 0;
          const lip = 0.28 * Math.exp(-(((x - 1.05) / 0.2) ** 2));
          disp[i] += depth * (bowl + lip);
        }
      }
      for (let i = 0; i < n; i++) {
        if (!disp[i]) continue;
        Nv.fromBufferAttribute(nor, i);
        pos.setXYZ(i, pos.getX(i) + Nv.x * disp[i], pos.getY(i) + Nv.y * disp[i], pos.getZ(i) + Nv.z * disp[i]);
      }
    }
    if (flatten > 0) {
      g.computeBoundingBox();
      const { min, max } = g.boundingBox;
      const cut = min.y + (max.y - min.y) * flatten;
      for (let i = 0; i < n; i++) if (pos.getY(i) < cut) pos.setY(i, cut);
      g.translate(0, -cut, 0);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  // ---- raw clay geometries (centimetre-honest: metres, base on y = 0 unless noted) ----
  const SEG = C.segments;
  const geo = {
    /** ellipsoid of radius r stretched by [sx,sy,sz], base on y = 0 (contact flattened). */
    blob: (r, { stretch = [1, 1, 1], seed = 1, wobble = 1, dents = 1, flatten = C.contactFlatten, dentFacing } = {}) => {
      const g = new THREE.SphereGeometry(r, SEG, Math.round(SEG * 0.75));
      g.scale(...stretch);
      g.translate(0, r * stretch[1], 0);
      return clayify(g, { size: r * Math.max(...stretch), seed, wobble, dents, flatten, dentFacing });
    },
    /** rounded slab w x h x d, base on y = 0. */
    slab: (w, h, d, { radius, seed = 1, wobble = 1, dents = 1, flatten = 0, dentFacing } = {}) => {
      const rad = radius ?? Math.min(w, h, d) * 0.3;
      const g = new RoundedBoxGeometry(w, h, d, 5, rad);
      g.translate(0, h / 2, 0);
      return clayify(g, { size: Math.min(w, h, d) * 1.3, seed, wobble, dents, flatten, dentFacing });
    },
    /** flattened puck (disc with fully rounded edge) radius r, height h, base on y = 0. */
    puck: (r, h, { seed = 1, wobble = 1, dents = 1, dentFacing = [0, 1, 0] } = {}) => {
      const e = h / 2, pts = [new THREE.Vector2(0, 0)];
      for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, e + Math.sin(a) * e)); }
      pts.push(new THREE.Vector2(0, h));
      return clayify(new THREE.LatheGeometry(pts, SEG), { size: Math.max(r * 0.8, h), seed, wobble, dents, dentFacing });
    },
    /** lathe of a profile [[radius, y], ...] (bottom -> top). */
    lathe: (profile, { size = 0.5, seed = 1, wobble = 1, dents = 1, dentFacing } = {}) =>
      clayify(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), SEG), { size, seed, wobble, dents, dentFacing }),
    /** rolled snake along a stroke (points / arcs, see kit/paths). Radius r. No base shift. */
    coil: (stroke, r, { seed = 1, wobble = 1, bend = 0, radial = 12 } = {}) => {
      // kit tubes wind outward since 2026-11-13 (this style used to re-wind them locally; same triangles)
      const g = tubeAlong(stroke, { radius: r, bend: bend || r * 1.2, radial, caps: true });
      return clayify(g, { size: r * 2.2, seed, wobble: wobble * 1.4, dents: 0 });
    },
    /** extruded 2D shape (kit/shapes) with a fat rounded bevel, lying in XY, thickness t, centred on z. */
    extrude: (shape, t, { seed = 1, wobble = 1, size = 0.5 } = {}) => {
      const b = t * 0.42;
      const g = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 5, curveSegments: 24, steps: 1 });
      g.translate(0, 0, -(t - 2 * b) / 2);
      return clayify(g, { size, seed, wobble, dents: 0 });
    },
  };

  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };
  /** Wrap content in a base-pivot group with the standard userData. */
  const prop = (name, children, ud = {}) => {
    const g = new THREE.Group();
    g.name = name;
    for (const c of children) g.add(c);
    Object.assign(g.userData, { soft: true, ...ud });
    return g;
  };

  // ---------------------------------------------------------------------------------------------
  // Lettering: stroke font swept into rolled coils, pressed flat (z) onto whatever is behind
  // ---------------------------------------------------------------------------------------------
  /**
   * letters(text, { cap = .4, color = "ink", colors?(ch, i, word) , seed, align }) -> Group (centred on x,
   *   baseline of the LAST line at y = 0, faces +Z). userData.chars = [Group per glyph] (for pop-on), width, height.
   */
  function letters(text, o = {}) {
    const { cap = 0.4, color = "ink", seed = 1, align = "center", colors } = o;
    const r = cap * LET.coilRatio;
    const lay = layoutStrokeText(text, cap, { letterSpacing: LET.letterSpacing, wordSpacing: LET.wordSpacing, lineHeight: LET.lineHeight, align, bendRadius: LET.bendRadius });
    const root = new THREE.Group();
    root.name = `letters:${text}`;
    const lines = lay.lines, lineH = LET.lineHeight * cap;
    let word = 0, prevLine = 0, prevX1 = -Infinity;
    const chars = [];
    for (const ch of lay.chars) {
      if (ch.line !== prevLine || ch.x0 - prevX1 > LET.letterSpacing * cap * 1.6) word++;
      prevLine = ch.line; prevX1 = ch.x1;
      const g = new THREE.Group();
      const cx = (ch.x0 + ch.x1) / 2, cy = (lines - 1 - ch.line) * lineH; // glyph pivot: bottom centre
      const baseY = -ch.line * lineH;
      const m = clay(colors ? colors(ch.ch, ch.i, word) : color);
      ch.strokes.forEach((s, k) => {
        const pts = s.map((p) => [p[0] - cx, p[1] - baseY, 0]);
        const gg = geo.coil(pts, r * (1 + (hash01(seed, ch.i, k) - 0.5) * 0.12), { seed: seed * 977 + ch.i * 31 + k, radial: LET.radial });
        const me = mesh(gg, m);
        me.scale.z = LET.press;
        g.add(me);
      });
      g.position.set(cx, cy, 0);
      g.userData.ch = ch.ch;
      root.add(g);
      chars.push(g);
    }
    Object.assign(root.userData, { chars, width: lay.width + 2 * r, height: (lines - 1) * lineH + cap + 2 * r, cap, coil: r });
    return root;
  }

  /**
   * plaque({ text, cap = .4, color = "cream", letterColor = "ink", colors?, pad = .45, depth = .16, rim = "tangerine"|null,
   *          hang = 0 (string length up from the top corners), stringColor = "cocoa", seed })
   *   -> Group, base-centre pivot (bottom edge on y = 0), letters on the +Z face.
   *   userData: { w, h, letters, showLetters(n) (n = how many glyphs visible, fractional = popping) }
   */
  function plaque(o = {}) {
    const { text = "", cap = 0.4, color = "cream", letterColor = "ink", colors, pad = 0.42, depth = 0.16, rim = "tangerine", hang = 0, stringColor = "cocoa", seed = 3 } = o;
    const L = letters(text, { cap, color: letterColor, colors, seed });
    const w = L.userData.width + pad * 2, h = L.userData.height + pad * 1.5;
    const body = mesh(geo.slab(w, h, depth, { radius: Math.min(depth * 0.48, h * 0.2), seed, wobble: 0.5, dents: 0.6, dentFacing: [0, 0, 1] }), clay(color));
    const kids = [body];
    L.position.set(0, pad * 0.75 + L.userData.coil, depth / 2 + L.userData.coil * LET.press * 0.55);
    kids.push(L);
    if (rim) {
      const rr = Math.min(0.05, cap * 0.12), ix = w / 2 - rr * 2.4, iy = rr * 2.4;
      const loop = [[0, iy, 0], [ix, iy, 0], [ix, h - iy, 0], [-ix, h - iy, 0], [-ix, iy, 0], [-rr * 1.2, iy, 0]]; // seam mid-bottom
      const rimM = mesh(geo.coil(loop, rr, { seed: seed + 5, bend: rr * 3 }), clay(rim));
      rimM.position.z = depth / 2 + rr * 0.3;
      rimM.scale.z = 0.6;
      kids.push(rimM);
    }
    if (hang > 0) {
      for (const sx of [-1, 1]) {
        const x = sx * (w / 2 - 0.25);
        kids.push(mesh(geo.coil([[x, h - 0.05, 0], [x + sx * 0.04, h + hang * 0.5, 0.01], [x, h + hang, 0]], 0.028, { seed: seed + 9 + sx, wobble: 0.6 }), clay(stringColor)));
        const nub = mesh(geo.blob(0.07, { seed: seed + 20 + sx, dents: 0, flatten: 0 }), clay(stringColor));
        nub.position.set(x, h - 0.12, depth / 2 - 0.02);
        kids.push(nub);
      }
    }
    const g = prop("plaque", kids, { w, h, depth, letters: L });
    g.userData.showLetters = (nVis, popDur = 1) => {
      L.userData.chars.forEach((c, i) => {
        const u = clamp((nVis - i) / popDur);
        const k = u <= 0 ? 0 : ease.outBack(u, 2.4);
        const sy = 1 + 0.35 * Math.sin(u * Math.PI) * (1 - u);
        c.scale.set(Math.max(1e-4, k / Math.sqrt(sy)), Math.max(1e-4, k * sy), Math.max(1e-4, k));
        c.visible = u > 0;
      });
    };
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // Props — generic clay building blocks + common explainer icons. All synchronous + seeded.
  // ---------------------------------------------------------------------------------------------
  const props = {
    /** sweep({ width=40, depth=24, height=14, radius=6 }) paper backdrop: floor y = 0 curving into a wall at z = -depth/2. */
    sweep: (o = {}) => createCyclorama({ width: 40, depth: 24, height: 14, radius: 6, segments: 32, material: materials.sweep, ...o }),
    /** blob({ r=.4, color, stretch=[1,1,1], seed, dents=1 }) lumpy ball resting on the table. */
    blob: (o = {}) => prop("blob", [mesh(geo.blob(o.r ?? 0.4, o), clay(o.color ?? "tomato"))], { r: o.r ?? 0.4 }),
    /** coil({ stroke|points, r=.06, color, seed }) rolled snake along a path (no base shift). */
    coil: (o = {}) => prop("coil", [mesh(geo.coil(o.stroke ?? o.points, o.r ?? 0.06, o), clay(o.color ?? "sun"))]),
    /** puck({ r=.4, h=.14, color, seed }) flattened disc lying on the table. */
    puck: (o = {}) => prop("puck", [mesh(geo.puck(o.r ?? 0.4, o.h ?? 0.14, o), clay(o.color ?? "sky"))]),
    /** slab({ w, h, d, color, radius, seed }) chunky rounded block, base on the table. */
    slab: (o = {}) => prop("slab", [mesh(geo.slab(o.w ?? 1, o.h ?? 0.6, o.d ?? 0.6, o), clay(o.color ?? "teal"))]),
    letters: (text, o = {}) => letters(text, o),
    plaque,

    /** book({ w=.9, d=.66, h=.26, color, pages="cream", band="sun", seed }) closed book lying flat. */
    book(o = {}) {
      const { w = 0.9, d = 0.66, h = 0.26, color = "tomato", pages = "cream", band = "sun", seed = 11 } = o;
      const ct = h * 0.24;
      const lo = mesh(geo.slab(w, ct, d, { seed, dents: 0.5, wobble: 0.6 }), clay(color));
      const block = mesh(geo.slab(w * 0.9, h - ct * 1.6, d * 0.92, { seed: seed + 1, radius: 0.03, dents: 0, wobble: 0.5 }), clay(pages));
      block.position.set(w * 0.04, ct * 0.8, 0);
      const hi = mesh(geo.slab(w, ct, d, { seed: seed + 2, dents: 0.8, wobble: 0.6, dentFacing: [0, 1, 0.3] }), clay(color));
      hi.position.y = h - ct;
      const spine = mesh(geo.coil([[-w / 2 + 0.02, 0, -d / 2 + 0.02], [-w / 2 - 0.01, 0, 0], [-w / 2 + 0.02, 0, d / 2 - 0.02]], h * 0.5, { seed: seed + 3, wobble: 0.5 }), clay(color));
      spine.position.y = h / 2;
      spine.scale.set(0.55, 1, 1);
      const bandM = mesh(geo.coil([[-w * 0.38, 0, -d / 2 - 0.01], [-w * 0.38, 0, d / 2 + 0.01]], ct * 0.42, { seed: seed + 4 }), clay(band));
      bandM.position.y = h + ct * 0.05;
      bandM.scale.y = 0.55;
      return prop("book", [lo, block, hi, spine, bandM], { w, d, h });
    },
    /** photo({ w=.8, h=.66, frame="sun", sky="sky", hill="leaf", sunColor="tangerine", seed }) standing framed picture (leans back ~.12 rad). */
    photo(o = {}) {
      const { w = 0.8, h = 0.66, frame = "sun", sky = "sky", hill = "leaf", sunColor = "tangerine", seed = 21 } = o;
      const t = 0.12;
      const back = mesh(geo.slab(w, h, t, { seed, dents: 0.4, wobble: 0.5, dentFacing: [0, 0, 1] }), clay(sky));
      const fr = Math.min(w, h) * 0.075;
      const ix = w / 2 - fr * 0.9, iy0 = fr * 0.9, iy1 = h - fr * 0.9;
      const frameM = mesh(geo.coil([[0, iy0, 0], [ix, iy0, 0], [ix, iy1, 0], [-ix, iy1, 0], [-ix, iy0, 0], [-fr * 1.2, iy0, 0]], fr, { seed: seed + 1, bend: fr * 1.6 }), clay(frame));
      frameM.position.z = t / 2;
      frameM.scale.z = 0.7;
      const hillM = mesh(geo.blob(w * 0.36, { stretch: [1.2, 0.55, 0.18], seed: seed + 2, dents: 0, flatten: 0.5 }), clay(hill));
      hillM.position.set(-w * 0.08, iy0 + fr * 0.2, t / 2);
      const hill2 = mesh(geo.blob(w * 0.26, { stretch: [1.2, 0.6, 0.18], seed: seed + 6, dents: 0, flatten: 0.5 }), clay("teal"));
      hill2.position.set(w * 0.22, iy0 + fr * 0.2, t / 2 - 0.01);
      const sunM = mesh(geo.puck(h * 0.11, 0.05, { seed: seed + 3, dents: 0 }), clay(sunColor));
      sunM.rotation.x = Math.PI / 2;
      sunM.position.set(w * 0.2, h * 0.66, t / 2 + 0.03);
      const g = new THREE.Group();
      g.add(back, hillM, hill2, frameM, sunM);
      g.rotation.x = -0.12;
      const leg = mesh(geo.coil([[0, 0.02, -t / 2], [0, h * 0.45, -t / 2 - 0.02]], 0.035, { seed: seed + 4 }), clay(frame));
      leg.position.z = -0.12;
      return prop("photo", [g, leg], { w, h });
    },
    /** bubble({ w=.9, h=.62, color="mint", dots="ink", tail=-1|1, seed }) upright chat bubble with three dots. */
    bubble(o = {}) {
      const { w = 0.9, h = 0.62, color = "mint", dots = "ink", tail = -1, seed = 31 } = o;
      const t = 0.2;
      const body = mesh(geo.slab(w, h, t, { radius: Math.min(h * 0.45, t * 0.49), seed, dents: 0.6, dentFacing: [0, 0.2, 1] }), clay(color));
      body.position.y = h * 0.22;
      const tailG = geo.blob(h * 0.2, { stretch: [0.8, 1.2, 0.5], seed: seed + 1, dents: 0, flatten: 0 });
      const tailM = mesh(tailG, clay(color));
      tailM.position.set(tail * w * 0.28, h * 0.02, 0);
      tailM.rotation.z = tail * 0.6;
      const kids = [body, tailM];
      for (let i = 0; i < 3; i++) {
        const d = mesh(geo.blob(h * 0.085, { stretch: [1, 1, 0.6], seed: seed + 10 + i, dents: 0, flatten: 0 }), clay(dots));
        d.position.set((i - 1) * w * 0.24, h * 0.22 + h / 2 - h * 0.085, t / 2 - 0.02);
        kids.push(d);
      }
      return prop("bubble", kids, { w, h: h * 1.22 });
    },
    /** note({ h=.8, color="grape", seed }) upright double music note (two flattened heads, stems, beam). */
    note(o = {}) {
      const { h = 0.8, color = "grape", seed = 41 } = o;
      const hr = h * 0.17, sx = h * 0.42, kids = [];
      for (const [i, x] of [[0, -sx / 2], [1, sx / 2]]) {
        const head = mesh(geo.blob(hr, { stretch: [1.25, 0.85, 0.75], seed: seed + i, dents: 0.7, flatten: 0.08 }), clay(color));
        head.position.set(x, 0, 0);
        head.rotation.z = 0.35;
        const stem = mesh(geo.coil([[x + hr * 0.95, hr * 0.9, 0], [x + hr * 0.95, h - hr * 0.25, 0]], hr * 0.24, { seed: seed + 5 + i }), clay(color));
        kids.push(head, stem);
      }
      const beam = mesh(geo.coil([[-sx / 2 + hr * 0.95, h - hr * 0.3, 0], [sx / 2 + hr * 0.95, h - hr * 0.05, 0]], hr * 0.34, { seed: seed + 9 }), clay(color));
      beam.scale.y = 0.75;
      kids.push(beam);
      return prop("note", kids, { h });
    },
    /** star({ r=.35, t=.16, color="sun", points=5 }) puffy star standing upright on a point. */
    star(o = {}) {
      const { r = 0.35, t = 0.16, color = "sun", points = 5, seed = 51 } = o;
      const m = mesh(geo.extrude(shapes.star(r, r * 0.5, points), t, { seed, size: r }), clay(color));
      m.position.y = r * 0.95;
      return prop("star", [m], { r });
    },
    /** arrow({ length=1.2, r=.07, color="tomato" }) flat rolled arrow lying on the table, pointing +X. */
    arrow(o = {}) {
      const { length = 1.2, r = 0.07, color = "tomato", seed = 61 } = o;
      const shaft = mesh(geo.coil([[0, r, 0], [length - r * 3, r, 0]], r, { seed }), clay(color));
      const head = mesh(geo.lathe([[0, 0], [r * 3.2, r * 0.6], [r * 2.6, r * 1.4], [0, r * 4.4]], { size: r * 3, seed: seed + 1, dents: 0 }), clay(color));
      head.rotation.z = -Math.PI / 2;
      head.position.set(length - r * 4, r, 0);
      return prop("arrow", [shaft, head], { length });
    },
    /** marble({ r=.45, colors=[...], seed }) a lumpy ball of mixed, half-kneaded colours (vertex-colour swirl). */
    marble(o = {}) {
      const { r = 0.45, colors = ["tomato", "sky", "sun", "grape"], seed = 71, swirl = 2.4 } = o;
      const g = geo.blob(r, { seed, dents: 1.2, wobble: 1.6 });
      const pos = g.attributes.position, cs = colors.map((c) => new THREE.Color(col(c)));
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) / r, y = pos.getY(i) / r, z = pos.getZ(i) / r;
        const wv = fbm3(x * 1.3, y * 1.3, z * 1.3, seed, 3);
        const band = (y * 0.8 + x * 0.5 + wv * swirl) * 1.6;
        const f = band - Math.floor(band), k = Math.floor(band);
        const a = cs[((k % cs.length) + cs.length) % cs.length], b = cs[(((k + 1) % cs.length) + cs.length) % cs.length];
        const mix = THREE.MathUtils.smoothstep(f, 0.82, 0.98);
        const c = a.clone().lerp(b, mix);
        arr.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      const m = patchClay(materials.clay.clone());
      m.vertexColors = true;
      m.name = "clay:marble";
      return prop("marble", [mesh(g, m)], { r });
    },
    /** brain({ r=.55, color="bubblegum", folds="blush", seed }) two-lobed clay brain with rolled gyri.
     *  userData.setGlow(u) 0..1 lights it from inside (emissive, blooms above ~.6). */
    brain(o = {}) {
      const { r = 0.55, color = "bubblegum", folds = "blush", seed = 81, glow = "#ff8fb4" } = o;
      const st = [1.18, 0.92, 1.0];
      const base = new THREE.SphereGeometry(r, SEG + 16, SEG);
      base.scale(...st);
      base.translate(0, r * st[1], 0);
      // midline groove (top half, x ~ 0) before clayify so wobble rides on it
      const bp = base.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
        const gx = Math.exp(-((x / (r * 0.11)) ** 2)) * clamp((y - r * 0.55) / (r * 0.6));
        const k = 1 - 0.12 * gx;
        bp.setXYZ(i, x, r * st[1] + (y - r * st[1]) * k, z * (1 - 0.04 * gx));
      }
      const mBody = clayOwn(color), mFold = clayOwn(folds);
      const body = mesh(clayify(base, { size: r, seed, wobble: 0.7, dents: 0.5, flatten: 0.05 }), mBody);
      const kids = [body];
      const R = rng(`brain-${seed}`);
      // gyri: wiggly coils wrapping each lobe in latitude bands, projected onto the ellipsoid
      const cr = r * 0.075;
      for (const side of [-1, 1]) {
        for (let band = 0; band < 4; band++) {
          const lat = 0.25 + band * 0.32 + R.range(-0.04, 0.04);
          const pts = [];
          const n = 46;
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            const lon = side > 0 ? lerp(0.16, Math.PI - 0.16, u) : lerp(Math.PI + 0.16, TAU - 0.16, u);
            const wig = Math.sin(u * (9 + band * 2) + band + side) * 0.11;
            const la = clamp(lat + wig, 0.12, 1.45);
            const cx = Math.sin(lon) * Math.cos(la), cz = Math.cos(lon) * Math.cos(la), cy = Math.sin(la);
            const k = 1.0;
            pts.push([cx * r * st[0] * k, r * st[1] + cy * r * st[1] * k, cz * r * st[2] * k]);
          }
          const coilG = geo.coil(pts, cr * R.range(0.85, 1.15), { seed: seed + side * 10 + band, wobble: 0.6 });
          kids.push(mesh(coilG, mFold));
        }
      }
      const g = prop("brain", kids, { r, w: r * st[0] * 2, h: r * st[1] * 2 });
      const gc = new THREE.Color(glow);
      g.userData.setGlow = (u) => {
        for (const m of [mBody, mFold]) { m.emissive.copy(gc); m.emissiveIntensity = u * 1.3; }
      };
      g.userData.setGlow(0);
      return g;
    },
    /** hopper({ w=1.9, h=1.25, d=1.4, body="teal", funnel="sun", rim="tangerine", seed })
     *  chunky clay machine: rounded body, funnel on top, chute on the right (+X), crank on the left, buttons.
     *  userData: { mouth:[x,y,z] (funnel top centre, local), chute:[x,y,z] (chute exit, local), crank (Group),
     *              setKnead(k, tq) — k = squish amount -1..1 (+ = squashed), tq = posed time for the crank } */
    hopper(o = {}) {
      const { w = 1.9, h = 1.25, d = 1.4, body = "teal", funnel = "sun", rim = "tangerine", button = "tomato", seed = 91 } = o;
      const bodyM = mesh(geo.slab(w, h, d, { radius: 0.26, seed, dents: 1.2, dentFacing: [0, 0.2, 1] }), clay(body));
      const fH = 1.0, fR = 0.78, fr = 0.3, th = 0.07;
      const prof = [[fr, 0], [fr + 0.02, 0.15], [fR * 0.75, fH * 0.7], [fR, fH], [fR - th * 0.5, fH + th * 0.6], [fR - th, fH], [fR * 0.75 - th, fH * 0.7 - 0.02], [fr - th, 0.15], [fr - th, 0.02]];
      const funnelM = mesh(geo.lathe(prof, { size: 0.9, seed: seed + 1, dents: 0.7, dentFacing: [0, 0.4, 1] }), clay(funnel));
      funnelM.material = clay(funnel);
      const funnelG = new THREE.Group();
      funnelG.add(funnelM);
      const rimM = mesh(geo.coil(Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * TAU * 0.985; return [Math.cos(a) * (fR - th * 0.4), 0, Math.sin(a) * (fR - th * 0.4)]; }), 0.075, { seed: seed + 2 }), clay(rim));
      rimM.position.y = fH + 0.02;
      funnelG.add(rimM);
      // inner shadow disc so the throat reads as a hole
      const throat = new THREE.Mesh(new THREE.CircleGeometry(fr - th, 32), new THREE.MeshBasicMaterial({ color: col("ink") }));
      throat.rotation.x = -Math.PI / 2;
      throat.position.y = 0.04;
      funnelG.add(throat);
      funnelG.position.y = h - 0.06;
      // chute: a short tube out of the right side, sloping down
      const chuteM = mesh(geo.lathe([[0.3, 0], [0.33, 0.04], [0.33, 0.5], [0.38, 0.56], [0.33, 0.6], [0.27, 0.56], [0.27, 0.05]], { size: 0.4, seed: seed + 3, dents: 0.5 }), clay(rim));
      chuteM.rotation.z = -Math.PI / 2 - 0.18;
      chuteM.position.set(w / 2 - 0.25, 0.42, 0.05);
      const chuteDark = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), new THREE.MeshBasicMaterial({ color: col("ink") }));
      chuteDark.rotation.y = Math.PI / 2;
      chuteDark.rotation.x = 0.18;
      chuteDark.position.set(w / 2 + 0.33, 0.32, 0.05);
      // buttons + a little dial on the front face
      const kids = [bodyM, funnelG, chuteM, chuteDark];
      [[button, -0.45], ["sun", -0.05], ["sky", 0.35]].forEach(([c, x], i) => {
        const b = mesh(geo.puck(0.13, 0.09, { seed: seed + 10 + i, dents: 0 }), clay(c));
        b.rotation.x = Math.PI / 2;
        b.position.set(x, h * 0.42, d / 2 - 0.02);
        kids.push(b);
      });
      const slot = mesh(geo.coil([[-0.55, 0, 0], [0.45, 0, 0]], 0.045, { seed: seed + 15 }), clay("ink"));
      slot.position.set(0, h * 0.74, d / 2 + 0.01);
      slot.scale.z = 0.6;
      kids.push(slot);
      // feet
      for (const [x, z] of [[-w / 2 + 0.3, d / 2 - 0.3], [w / 2 - 0.3, d / 2 - 0.3], [-w / 2 + 0.3, -d / 2 + 0.3], [w / 2 - 0.3, -d / 2 + 0.3]]) {
        const f = mesh(geo.puck(0.2, 0.12, { seed: seed + 20 + x * 3 + z, dents: 0 }), clay("ink"));
        f.position.set(x, -0.1, z);
        kids.push(f);
      }
      // crank on the left side
      const crank = new THREE.Group();
      const arm = mesh(geo.coil([[0, 0, 0], [0, 0.42, 0]], 0.055, { seed: seed + 30 }), clay(rim));
      const knob = mesh(geo.blob(0.1, { seed: seed + 31, dents: 0, flatten: 0 }), clay(button));
      knob.position.set(-0.1, 0.36, 0);
      const hub = mesh(geo.puck(0.12, 0.1, { seed: seed + 32, dents: 0 }), clay(rim));
      hub.rotation.z = Math.PI / 2;
      hub.position.x = 0.05;
      crank.add(arm, knob, hub);
      crank.position.set(-w / 2 - 0.06, h * 0.52, 0);
      kids.push(crank);
      const inner = new THREE.Group();
      inner.position.y = 0.1;
      for (const k of kids) inner.add(k);
      const g = prop("hopper", [inner], { w, h: h + fH + 0.1, d, mouth: [0, h + fH + 0.04, 0], chute: [w / 2 + 0.42, 0.42, 0.05], crank, funnel: funnelG, inner });
      g.userData.setKnead = (k, tq = 0) => {
        const sy = 1 - 0.16 * k;
        inner.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
        funnelG.rotation.y = 0.12 * k;
        funnelG.scale.set(1 + 0.08 * k, 1 - 0.1 * k, 1 + 0.08 * k);
        crank.rotation.x = -tq * TAU * 0.9;
      };
      g.userData.setKnead(0, 0);
      return g;
    },
    /** rays({ n=8, r0=.75, r1=1.15, r=.045, color="sun", seed }) cartoon shine: short coils radiating in XY (faces +Z).
     *  userData.setOpen(u) 0..1 (0 = hidden). */
    rays(o = {}) {
      const { n = 8, r0 = 0.75, r1 = 1.15, r = 0.045, color = "sun", seed = 101 } = o;
      const g = new THREE.Group(), items = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.2;
        const len = (r1 - r0) * (0.75 + 0.5 * hash01(seed, i));
        const c = mesh(geo.coil([[0, 0, 0], [len, 0, 0]], r, { seed: seed + i }), clay(color));
        const pivot = new THREE.Group();
        pivot.rotation.z = a;
        c.position.x = r0;
        pivot.add(c);
        g.add(pivot);
        items.push(c);
      }
      g.name = "rays";
      g.userData.setOpen = (u) => {
        items.forEach((c, i) => {
          const k = clamp(u * 1.4 - (i % 3) * 0.12);
          c.scale.set(Math.max(1e-4, ease.outBack(k, 2)), 1, 1);
          c.visible = k > 0;
        });
      };
      g.userData.setOpen(0);
      return g;
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Motion (pure functions of time). Feed object motion `tq = onTwos(t)`; camera keeps raw t.
  // ---------------------------------------------------------------------------------------------
  const FPS = TUNE.fps;
  const motion = {
    /** onTwos(t, fps = spec.tuning.fps) -> t quantised to the pose rate (hold each pose 2 frames at 30 fps). */
    onTwos: (t, fps = FPS) => Math.floor(t * fps + 1e-6) / fps,
    /** poseIndex(t) -> integer pose number. */
    poseIndex: (t, fps = FPS) => Math.floor(t * fps + 1e-6),
    /** vol(sy) -> [sx, sy, sz] volume-preserving squash/stretch scale. */
    vol: (sy) => [1 / Math.sqrt(Math.max(sy, 0.05)), sy, 1 / Math.sqrt(Math.max(sy, 0.05))],
    /** jiggle(t, at, amount = squash) -> scaleY factor: splat to 1-amount at `at`, underdamped settle to 1. 1 before `at`. */
    jiggle: (t, at, amount = TUNE.squash) => (t < at ? 1 : 1 - amount * (1 - spring(t - at, TUNE.settle))),
    /** squashPop(t, start, dur = popDur) -> [sx, sy, sz] grow in from 0 with a stretch-then-splat, 0 before start. */
    squashPop(t, start, dur = TUNE.popDur) {
      if (t < start) return [0, 0, 0];
      const u = clamp((t - start) / dur);
      const k = ease.outBack(u, 2.2);
      const sy = 1 + 0.38 * Math.sin(u * Math.PI * 2.2) * (1 - u) ** 1.2;
      const v = motion.vol(sy);
      return [v[0] * k, v[1] * k, v[2] * k];
    },
    /** squashOut(t, start, dur = .3) -> [sx,sy,sz] squish flat and vanish (1 before start, 0 after). */
    squashOut(t, start, dur = 0.3) {
      if (t < start) return [1, 1, 1];
      const u = clamp((t - start) / dur);
      if (u >= 1) return [0, 0, 0];
      const sy = 1 - 0.85 * ease.inQuad(u), wide = 1 + 0.5 * Math.sin(u * Math.PI * 0.9);
      const k = 1 - ease.inBack(u, 1.4) * 0.6;
      return [wide * k, sy * k, wide * k];
    },
    /**
     * hop(t, start, dur, from, to, { height = 1, anticipation, land = true, spin = 0 }) ->
     *   { pos:[x,y,z], scale:[sx,sy,sz], rot:[x,y,z], phase: "wait"|"crouch"|"air"|"land" , u }
     *   crouch (anticipation s) BEFORE start, parabolic flight start..start+dur stretched along the arc,
     *   then a splat + jiggle at `to` (if land).
     */
    hop(t, start, dur, from, to, { height = 1, anticipation = TUNE.anticipation, land = true, spin = 0 } = {}) {
      const a0 = start - anticipation;
      if (t < a0) return { pos: from.slice(), scale: [1, 1, 1], rot: [0, 0, 0], phase: "wait", u: 0 };
      if (t < start) {
        const c = Math.sin(((t - a0) / anticipation) * Math.PI * 0.5);
        return { pos: from.slice(), scale: motion.vol(1 - 0.28 * c), rot: [0, 0, 0], phase: "crouch", u: 0 };
      }
      const u = (t - start) / dur;
      if (u < 1) {
        const p = [lerp(from[0], to[0], u), lerp(from[1], to[1], u) + 4 * height * u * (1 - u), lerp(from[2], to[2], u)];
        const vy = (to[1] - from[1]) + 4 * height * (1 - 2 * u), vx = to[0] - from[0];
        const speed = Math.min(1, Math.abs(vy) / (2 * height + 1e-6));
        const sy = 1 + TUNE.stretch * speed * (u < 0.15 ? u / 0.15 : 1);
        const lean = Math.atan2(vx, Math.abs(vy) + 1e-3) * 0.35 * Math.sign(vy || 1);
        return { pos: p, scale: motion.vol(sy), rot: [0, 0, -lean + spin * u * TAU], phase: "air", u };
      }
      if (!land) return { pos: to.slice(), scale: [1, 1, 1], rot: [0, 0, 0], phase: "land", u: 1 };
      const tl = t - (start + dur);
      const sy = 1 - TUNE.squash * (1 - spring(tl, TUNE.settle));
      return { pos: to.slice(), scale: motion.vol(sy), rot: [0, 0, 0], phase: "land", u: 1 };
    },
    /** morph(t, at, dur = morphDur) -> { a:[sx,sy,sz] (old shape), b:[sx,sy,sz] (new shape), swapped }
     *  old squishes flat, new rises from flat with a jiggle. Show `a` before the swap, `b` after. */
    morph(t, at, dur = TUNE.morphDur) {
      const half = dur * 0.45;
      if (t < at) return { a: [1, 1, 1], b: [0, 0, 0], swapped: false };
      if (t < at + half) {
        const u = ease.inQuad((t - at) / half);
        const sy = 1 - 0.82 * u;
        return { a: [1 + 0.55 * u, sy, 1 + 0.55 * u], b: [0, 0, 0], swapped: false };
      }
      const tt = t - at - half;
      const rise = ease.outBack(clamp(tt / (dur - half)), 2.6);
      const sy = 0.18 + 0.82 * rise;
      const w = 1 + 0.5 * (1 - clamp(tt / (dur - half)));
      return { a: [0, 0, 0], b: [w, sy, w], swapped: true };
    },
    /** knead(t, start, end, { cycles = 3 }) -> squish amount -1..1 (0 outside [start,end]), eased in and out. */
    knead(t, start, end, { cycles = 3 } = {}) {
      if (t < start || t > end) return 0;
      const u = (t - start) / (end - start);
      const env = Math.sin(u * Math.PI) ** 0.6;
      return env * Math.sin(u * cycles * TAU);
    },
    /** boil(t, seed, amount = boilJitter) -> [rx, ry, rz, dx, dz] tiny per-pose jitter (changes every pose). */
    boil(t, seed = 1, amount = TUNE.boilJitter) {
      const i = Math.floor(t * FPS + 1e-6);
      const h = (k) => (hash01(seed, i, k) - 0.5) * 2 * amount;
      return [h(1), h(2), h(3), h(4) * 0.4, h(5) * 0.4];
    },
  };
  /** setPose(t): shift the clay micro-surface for the current pose ("boil"). Call once per frame. */
  const boilAmt = C.boil.amount;
  function setPose(t) {
    const i = Math.floor(t * FPS + 1e-6);
    U.uClayBoil.value.set(hash01(7, i, 1) * boilAmt, hash01(7, i, 2) * boilAmt, hash01(7, i, 3) * boilAmt);
  }

  /** applyBoil(obj, t, seed) — add the per-pose jitter on top of obj.userData.base pose (rotation + x/z). */
  function applyBoil(obj, t, seed, amount) {
    const b = motion.boil(t, seed, amount);
    obj.rotation.x += b[0]; obj.rotation.y += b[1]; obj.rotation.z += b[2];
    obj.position.x += b[3]; obj.position.z += b[4];
  }

  return {
    spec,
    palette: P,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      sweep: (s) => props.sweep(s.dims ?? {}),
      hopper: (s) => props.hopper(s.dims ?? {}),
    },
    sfx: spec.sfx,
    motion,
    geo,
    clay,
    clayify,
    setPose,
    applyBoil,
    shapes,
  };
}
