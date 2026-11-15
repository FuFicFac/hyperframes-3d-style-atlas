// styles/felt-stitch/style.js — "Felt & Stitch": a handmade felt story board with real embroidery stitches.
// Implements the style contract (references/kit-api.md §3).
//
// Felt = MeshPhysicalMaterial (roughness 1, velvet sheen) + an object-space shader patch: streaky fibres in four
// directions and a fine grain drive both a bump and the albedo (light/dark fibre speckle, dye mottling), so felt
// needs no UVs. Every felt mesh also carries 3 transparent "fuzz shells" (smooth-normal copies pushed out a few cm,
// alpha = fibre noise x fresnel) that make a soft halo at silhouettes. Cut pieces are extruded with a rounded
// bevel and a hand-cut outline wobble; stuffed forms are pillow domes (rings around the outline) with a zAt(x,y).
// Stitches are real geometry: each stitch is a short arched tube (ends sunk into the felt, twist stripes in vertex
// colour) merged into ONE mesh per plan in sewing order, so a reveal is just geometry.drawRange (the current stitch
// is drawn partially = the thread being pulled through). Plans come from stitches.js (pure, also used for SFX).
//
// Nothing animates itself: scenes call prop hooks (setProgress(p), sew(p), needle.update(...)) from renderAt with
// tq = style.plan.onTwos(t) for object motion.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { shapes } from "../../kit/shapes.js";
import { blobTexture } from "../../kit/textures.js";
import { FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, TAU } from "../../kit/time.js";
import { fbm3 } from "../../kit/noise.js";
import { pathLength, pointAt } from "../../kit/pathmath.js";
import * as plan from "./stitches.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ---------------------------------------------------------------------------------------------
// GLSL: felt fibres (shared by the felt surface patch and the fuzz shells)
// ---------------------------------------------------------------------------------------------
const GLSL_FELT = /* glsl */ `
varying vec3 vFeltPos;
uniform vec4 uFeltA; // fibreFreq, stretch, fibreBump (m), fineFreq
uniform vec4 uFeltB; // fineBump (m), mottleFreq, mottleAmt, fibreTone
uniform float uFeltSharp;
float fH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float fN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fH(i), fH(i + vec3(1,0,0)), f.x), mix(fH(i + vec3(0,1,0)), fH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fH(i + vec3(0,0,1)), fH(i + vec3(1,0,1)), f.x), mix(fH(i + vec3(0,1,1)), fH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fibreDir(vec3 q, vec3 d, float st) {
  vec3 e1 = normalize(cross(d, abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(d, e1);
  float n = fN(vec3(dot(q, d) / st, dot(q, e1), dot(q, e2)));
  return pow(1.0 - abs(2.0 * n - 1.0), uFeltSharp);
}
float feltFibre(vec3 p, float seed) {
  vec3 q = p * uFeltA.x + seed;
  float f = fibreDir(q, normalize(vec3(1.0, 0.35, 0.2)), uFeltA.y);
  f = max(f, fibreDir(q + 11.3, normalize(vec3(-0.3, 1.0, 0.25)), uFeltA.y));
  f = max(f, fibreDir(q + 23.7, normalize(vec3(0.75, -0.7, 0.3)), uFeltA.y));
  f = max(f, fibreDir(q + 37.1, normalize(vec3(0.2, 0.5, -1.0)), uFeltA.y));
  return f;
}
vec3 feltPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float fd) {
  vec3 sX = dFdx(surfPos), sY = dFdy(surfPos);
  vec3 R1 = cross(sY, surfNorm), R2 = cross(surfNorm, sX);
  float det = dot(sX, R1) * fd;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, F = spec.felt, TH = spec.thread, TX = spec.text;
  const col = (c) => P[c] ?? c;
  const textStyle = { font: FONTS[TX.font] ?? TX.font, weight: TX.weight, color: TX.color, height: TX.height };
  if (lights.key?.target && !lights.key.target.parent) stage.scene.add(lights.key.target);

  // ---- felt uniforms (shared object: every felt material sees the same values) ----
  const U = {
    uFeltA: { value: new THREE.Vector4(F.fibre.freq, F.fibre.stretch, F.fibre.bump, F.fibre.fine) },
    uFeltB: { value: new THREE.Vector4(F.fibre.fineBump, F.mottle.freq, F.mottle.amount, F.mottle.fibreTone) },
    uFeltSharp: { value: F.fibre.sharp },
  };
  function patchFelt(m) {
    m.sheen = 1;
    m.sheenRoughness = F.sheenRoughness;
    m.sheenColor = m.color.clone().lerp(new THREE.Color("#ffffff"), F.sheenColor);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vFeltPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFeltPos = transformed;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${GLSL_FELT}`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float feltL = feltFibre(vFeltPos, 0.0), feltD = feltFibre(vFeltPos, 51.0);
          float feltFine = fN(vFeltPos * uFeltA.w);
          float feltMot = fN(vFeltPos * uFeltB.y + 7.0) * 0.65 + fN(vFeltPos * uFeltB.y * 2.3 + 3.0) * 0.35;
          diffuseColor.rgb *= (1.0 + uFeltB.z * (2.0 * feltMot - 1.0)) * (1.0 + uFeltB.w * (feltL - 0.85 * feltD) + 0.05 * (feltFine - 0.5));
          float feltHgt = (feltL + 0.6 * feltD) * uFeltA.z + feltFine * uFeltB.x;`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          normal = feltPerturb(-vViewPosition, normal, vec2(dFdx(feltHgt), dFdy(feltHgt)), faceDirection);`);
    };
    m.customProgramCacheKey = () => "felt-stitch-felt-v1";
    m.needsUpdate = true;
    return m;
  }
  const feltMats = {};
  /** felt(name|hex) -> shared felt material for that colour. */
  const felt = (name) => {
    const k = col(name);
    if (!feltMats[k]) { const m = patchFelt(materials.felt.clone()); m.color.set(k); m.name = `felt:${name}`; feltMats[k] = m; }
    return feltMats[k];
  };
  for (const n of spec.felts) materials[n] = materials[`felt:${n}`] = felt(n);
  // floss: pull its DEPTH toward the camera along the view ray by thread.depthLift (screen position unchanged), so the
  // translucent fuzz shells of the felt underneath never haze over the thread; real felt layers (>= 1 thickness above)
  // still occlude it.
  materials.floss.onBeforeCompile = (sh) => {
    sh.uniforms.uDepthLift = { value: TH.depthLift };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uDepthLift;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n{ vec4 mvL = mvPosition; mvL.xyz += normalize(-mvPosition.xyz) * uDepthLift; vec4 cl = projectionMatrix * mvL; gl_Position.z = cl.z / cl.w * gl_Position.w; }");
  };
  materials.floss.customProgramCacheKey = () => "felt-stitch-floss-v1";

  // ---- fuzz shells: one material per colour x layer ----
  const FZ = F.fuzz;
  const shellMats = {};
  function shellMat(name, layer) {
    const k = `${col(name)}|${layer}`;
    if (shellMats[k]) return shellMats[k];
    const kk = (layer + 1) / FZ.shells;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(col(name)).lerp(new THREE.Color("#ffffff"), FZ.brighten), roughness: 1, metalness: 0, transparent: true, depthWrite: false });
    const SU = { uShell: { value: new THREE.Vector4(FZ.offset * kk, FZ.density * (1 - 0.45 * kk), FZ.freq, FZ.rimPower) }, uShellFace: { value: FZ.face } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, SU);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vFeltPos;\nuniform vec4 uShell;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(objectNormal) * uShell.x;\nvFeltPos = transformed;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${GLSL_FELT}\nuniform vec4 uShell;\nuniform float uShellFace;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          {
            vec3 sp = vFeltPos * uShell.z;
            float strand = max(fN(sp), fN(sp * vec3(0.45, 1.6, 1.0) + 17.0));
            float dens = smoothstep(1.0 - uShell.y, 1.0 - uShell.y * 0.35, strand);
            float fres = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), uShell.w);
            diffuseColor.a *= dens * mix(uShellFace, 1.0, fres);
            if (diffuseColor.a < 0.02) discard;
          }`);
    };
    m.customProgramCacheKey = () => "felt-stitch-shell-v1";
    m.name = `fuzz:${name}:${layer}`;
    shellMats[k] = m;
    return m;
  }
  /** smooth-normal copy of a geometry (shells push out along it without cracking at the bevel). */
  function smoothCopy(geo) {
    const g = geo.clone();
    for (const a of ["uv", "uv1", "normal", "color"]) if (g.attributes[a]) g.deleteAttribute(a);
    g.clearGroups();
    const m = mergeVertices(g, 1e-3);
    m.computeVertexNormals();
    return m;
  }
  /** addFuzz(mesh, colorName, { shells }) -> adds fuzz shell children to a felt mesh. */
  function addFuzz(mesh, name, o = {}) {
    const n = o.shells ?? FZ.shells;
    if (!n) return mesh;
    const sg = smoothCopy(mesh.geometry);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(sg, shellMat(name, i));
      s.castShadow = false; s.receiveShadow = true;
      s.renderOrder = 2 + i;
      s.name = "fuzz";
      mesh.add(s);
    }
    return mesh;
  }

  // ---------------------------------------------------------------------------------------------
  // Felt geometry
  // ---------------------------------------------------------------------------------------------
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };
  function prep(geo) {
    for (const a of ["uv", "uv1", "normal"]) if (geo.attributes[a]) geo.deleteAttribute(a);
    geo.clearGroups();
    const g = mergeVertices(geo, 1e-4);
    g.computeVertexNormals();
    return g;
  }
  /** outlineOf(shape|pts) -> [[x,y]...] CCW polygon (shape sampled every ~2 cm). */
  function outlineOf(src, n) {
    let pts;
    if (src instanceof THREE.Shape || src instanceof THREE.Path) {
      const len = src.getLength();
      pts = src.getSpacedPoints(n ?? Math.max(24, Math.ceil(len / 0.025))).map((v) => [v.x, v.y]);
    } else pts = src.map((p) => [p[0], p[1]]);
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
    if (plan.signedArea(pts) < 0) pts.reverse();
    return pts;
  }
  /** handCut(pts, { seed, amp, pinked }) -> wobbly (and optionally zig-zag pinked) outline. */
  function handCut(pts, { seed = 1, amp = F.cutJitter, freq = F.cutJitterFreq, pinked = 0 } = {}) {
    const n = pts.length, out = [];
    const r = rng(`cut-${seed}`), s1 = r.int(1, 1e6);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n];
      if (i) acc += Math.hypot(p[0] - a[0], p[1] - a[1]);
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      let off = amp * (fbm3(acc * freq, s1 * 1e-3, 0.5, s1, 2) - 0.5) * 2;
      if (pinked) off += pinked * (Math.abs(((acc / (pinked * 3.2)) % 1) * 2 - 1) - 0.5); // triangle wave
      out.push([p[0] + ty * off, p[1] - tx * off]); // outward normal of a CCW outline = (ty, -tx)
    }
    return out;
  }
  const toShape = (pts) => shapes.poly(pts);
  const resample = (pts, step) => {
    const closed = [...pts.map((p) => [p[0], p[1], 0]), [pts[0][0], pts[0][1], 0]];
    const L = pathLength(closed), n = Math.max(12, Math.round(L / step)), out = [];
    for (let i = 0; i < n; i++) { const q = pointAt(closed, (i / n) * L).p; out.push([q[0], q[1]]); }
    return out;
  };

  /**
   * piece(shape | pts, { color, thickness, seed, pinked, jitter, holes, fuzz = true, bevel }) -> Group
   *   A cut felt piece lying in XY: back face on z = 0, front face at z = thickness (rounded, pillowy cut edge).
   *   userData: { top (front z), outline (2D CCW cut outline, use it for blanket/running stitches), zAt(x,y), mesh, color }
   */
  function piece(src, o = {}) {
    const { color = "cream", thickness = F.thickness, seed = 1, pinked = 0, jitter = 1, holes = [], fuzz = true } = o;
    const t = thickness, b = Math.min(t * (o.bevel ?? F.bevel), 0.06);
    const base = resample(outlineOf(src), 0.02);
    const out = handCut(base, { seed, amp: F.cutJitter * jitter, pinked });
    const sh = toShape(out);
    for (const h of holes) sh.holes.push(new THREE.Path(outlineOf(h).slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-3, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: F.curveSegments, steps: 1 });
    g.translate(0, 0, b);
    const m = mesh(prep(g), felt(color));
    m.name = `felt:${color}`;
    if (fuzz) addFuzz(m, color, typeof fuzz === "object" ? fuzz : {});
    const grp = new THREE.Group();
    grp.add(m);
    grp.name = "piece";
    Object.assign(grp.userData, { top: t, outline: out, zAt: () => t, mesh: m, color, felt: true });
    return grp;
  }

  /**
   * stuffed(shape | pts, { color, puff, thickness, profile = 4, seed, jitter, seam: "blanket"|"running"|null, seamColor, fuzz })
   *   -> Group: a puffed, stuffed felt form (two layers sewn round the edge): a side band 0..thickness/2 and a pillow dome
   *   rising `puff` m above it. Outline must be star-shaped around its centroid (blobs, bodies, hearts, clouds).
   *   userData: { zAt(x,y) (front surface height), outline, top (max z), centre, mesh, seam (stitch Group) }
   */
  function stuffed(src, o = {}) {
    const { color = "cream", thickness = F.thickness, profile = 4, seed = 1, jitter = 1, fuzz = true } = o;
    const pts = handCut(resample(outlineOf(src), 0.03), { seed, amp: F.cutJitter * jitter });
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    let minR = Infinity;
    for (const p of pts) minR = Math.min(minR, Math.hypot(p[0] - cx, p[1] - cy));
    const puff = o.puff ?? F.stuffedPuff * minR;
    const K = F.stuffedRings, z0 = thickness * 0.5;
    const h = (r) => z0 + puff * Math.pow(Math.max(0, 1 - Math.pow(r, profile)), 0.5);
    const pos = [], idx = [];
    // band bottom ring (z = 0) then band top ring (z = z0) then dome rings r_k
    for (const p of pts) pos.push(p[0], p[1], 0);
    const rs = [];
    for (let k = 0; k <= K; k++) rs.push(Math.cos((Math.PI / 2) * (k / (K + 0.6))));
    for (const r of rs) for (const p of pts) pos.push(cx + (p[0] - cx) * r, cy + (p[1] - cy) * r, r >= 0.9999 ? z0 : h(r));
    const ci = pos.length / 3;
    pos.push(cx, cy, h(0));
    const rings = 1 + rs.length;
    for (let k = 0; k < rings - 1; k++) for (let i = 0; i < n; i++) {
      const a = k * n + i, b2 = k * n + ((i + 1) % n), c = a + n, d = b2 + n;
      idx.push(a, b2, c, b2, d, c);
    }
    const last = (rings - 1) * n;
    for (let i = 0; i < n; i++) idx.push(last + i, last + ((i + 1) % n), ci);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = mesh(g, felt(color));
    m.name = `stuffed:${color}`;
    if (fuzz) addFuzz(m, color);
    // polar boundary table for zAt
    const NA = 256, Rt = new Float32Array(NA);
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * TAU, dx = Math.cos(a), dy = Math.sin(a);
      let best = minR;
      for (let i = 0; i < n; i++) {
        const A = pts[i], B = pts[(i + 1) % n];
        const ex = B[0] - A[0], ey = B[1] - A[1], wx = A[0] - cx, wy = A[1] - cy;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const tt = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
        if (tt > 0 && u >= 0 && u <= 1) { best = tt; break; }
      }
      Rt[k] = best;
    }
    const zAt = (x, y) => {
      const a = (Math.atan2(y - cy, x - cx) + TAU) % TAU;
      const f = (a / TAU) * NA, k0 = Math.floor(f) % NA, k1 = (k0 + 1) % NA;
      const R = lerp(Rt[k0], Rt[k1], f - Math.floor(f));
      const r = Math.hypot(x - cx, y - cy) / Math.max(R, 1e-6);
      return r >= 1 ? z0 : h(r);
    };
    const grp = new THREE.Group();
    grp.add(m);
    grp.name = "stuffed";
    Object.assign(grp.userData, { zAt, outline: pts, top: h(0), centre: [cx, cy], mesh: m, color, felt: true });
    if (o.seam) {
      const sp = o.seam === "running" ? plan.runningStitch(pts, { closed: true, len: TH.run.len * 0.8, gap: TH.run.gap * 0.8 }).map(insetSeg(pts, 0.07))
        : plan.blanketStitch(pts, { step: TH.blanket.step * 0.9, depth: TH.blanket.depth * 0.9 });
      const seam = stitchMesh(sp, { color: o.seamColor ?? "cream", zAt });
      seam.userData.setProgress(1);
      grp.add(seam);
      grp.userData.seam = seam;
    }
    return grp;
  }
  /** move a stitch segment `d` m toward the centroid side of the outline (keeps running seams off the very edge). */
  function insetSeg(pts, d) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
    const mv = (p) => { const dx = cx - p[0], dy = cy - p[1], l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * d, p[1] + (dy / l) * d, p[2] ?? 0]; };
    return (s) => ({ ...s, a: mv(s.a), b: mv(s.b) });
  }

  // ---------------------------------------------------------------------------------------------
  // Stitches: one merged mesh per plan, revealed by drawRange in sewing order
  // ---------------------------------------------------------------------------------------------
  let _blob = null;
  const puckerMat = new THREE.MeshBasicMaterial({ color: "#1a1418", transparent: true, opacity: TH.pucker.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  puckerMat.name = "pucker";
  /**
   * stitchMesh(segs, { radius = thread.radius, color | colors(seg, i), zAt(x,y) = 0, arch, sink, z = 0 }) -> Group
   *   segs: a plan from style.plan (runningStitch/blanketStitch/crossStitch/satinFill/backstitch/embroideredText().segs),
   *   keyed if they have no key. Each stitch = an arched tube whose ends sink into the surface given by zAt.
   *   userData.setProgress(p): show stitches with key < p (the current one partially, as if being pulled through).
   *   userData.headAt(p) -> { p:[x,y,z], dir:[x,y,z], i } needle position for progress p (local coords).
   *   userData.count, userData.segs.
   */
  function stitchMesh(segs0, o = {}) {
    const segs = segs0.length && segs0[0].key == null ? plan.keyed(segs0) : segs0;
    const r = o.radius ?? TH.radius, arch = o.arch ?? TH.arch, sink = o.sink ?? TH.sink, zb = o.z ?? 0;
    const zAt = o.zAt ?? (() => 0);
    const NR = TH.radial, NL = TH.lengthSegs, VPS = (NL + 1) * NR, IPS = NL * NR * 6;
    const N = segs.length;
    const pos = new Float32Array(N * VPS * 3), colA = new Float32Array(N * VPS * 3), idx = new Uint32Array(N * IPS);
    const ppos = new Float32Array(N * 8 * 3), puv = new Float32Array(N * 8 * 2), pidx = new Uint32Array(N * 12);
    const c = new THREE.Color();
    const heads = [];
    const ps = r * TH.pucker.size;
    segs.forEach((s, si) => {
      c.set(col(o.colors ? o.colors(s, si) : s.color ?? o.color ?? "cream"));
      const ax = s.a[0], ay = s.a[1], bx = s.b[0], by = s.b[1];
      const ha = s.a[2] ?? 0, hb = s.b[2] ?? 0;
      const L = Math.hypot(bx - ax, by - ay) || 1e-4;
      const dx = (bx - ax) / L, dy = (by - ay) / L;
      const side = [-dy, dx, 0];
      const ar = (s.arch ?? arch) * r;
      const cl = [];
      for (let k = 0; k <= NL; k++) {
        const u = k / NL, x = lerp(ax, bx, u), y = lerp(ay, by, u);
        const z = zb + zAt(x, y) + lerp(ha, hb, u) - sink * r + (ar + sink * r + r * 0.15) * Math.pow(Math.sin(Math.PI * u), 0.45);
        cl.push([x, y, z]);
      }
      heads.push(cl);
      for (let k = 0; k <= NL; k++) {
        const pA = cl[Math.max(0, k - 1)], pB = cl[Math.min(NL, k + 1)];
        let tx = pB[0] - pA[0], ty = pB[1] - pA[1], tz = pB[2] - pA[2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        // up = side x tangent
        let ux = side[1] * tz - side[2] * ty, uy = side[2] * tx - side[0] * tz, uz = side[0] * ty - side[1] * tx;
        const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
        if (uz < 0) { ux = -ux; uy = -uy; uz = -uz; }
        for (let j = 0; j < NR; j++) {
          const th = (j / NR) * TAU, cs = Math.cos(th), sn = Math.sin(th);
          const nx = side[0] * cs + ux * sn, ny = side[1] * cs + uy * sn, nz = side[2] * cs + uz * sn;
          const vi = si * VPS + k * NR + j;
          pos[vi * 3] = cl[k][0] + nx * r; pos[vi * 3 + 1] = cl[k][1] + ny * r; pos[vi * 3 + 2] = cl[k][2] + nz * r;
          const ph = (k / NL) * (L / (r * TH.twist)) * TAU + th;
          const shade = 1 - TH.stripe * (0.5 + 0.5 * Math.sin(ph)) - 0.08 * (1 - Math.abs(sn)) * (sn < 0 ? 1 : 0);
          colA[vi * 3] = c.r * shade; colA[vi * 3 + 1] = c.g * shade; colA[vi * 3 + 2] = c.b * shade;
        }
      }
      for (let k = 0; k < NL; k++) for (let j = 0; j < NR; j++) {
        const a = si * VPS + k * NR + j, b = si * VPS + k * NR + ((j + 1) % NR), cc = a + NR, d = b + NR;
        const ii = si * IPS + (k * NR + j) * 6;
        idx[ii] = a; idx[ii + 1] = cc; idx[ii + 2] = b; idx[ii + 3] = b; idx[ii + 4] = cc; idx[ii + 5] = d;
      }
      // puckers at both ends (dark soft dimples on the felt where the thread goes in)
      [[ax, ay], [bx, by]].forEach(([px, py], e) => {
        const z = zb + zAt(px, py) + (e ? hb : ha) + 0.004;
        const base = si * 8 + e * 4;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([qx, qy], q) => {
          ppos[(base + q) * 3] = px + qx * ps; ppos[(base + q) * 3 + 1] = py + qy * ps; ppos[(base + q) * 3 + 2] = z;
          puv[(base + q) * 2] = (qx + 1) / 2; puv[(base + q) * 2 + 1] = (qy + 1) / 2;
        });
        const pi = si * 12 + e * 6;
        pidx.set([base, base + 1, base + 2, base, base + 2, base + 3], pi);
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colA, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const thread = mesh(g, materials.floss);
    thread.name = "thread";
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
    pg.setAttribute("uv", new THREE.BufferAttribute(puv, 2));
    pg.setIndex(new THREE.BufferAttribute(pidx, 1));
    if (!puckerMat.map) { puckerMat.map = (_blob ??= blobTexture()); puckerMat.needsUpdate = true; }
    const puck = new THREE.Mesh(pg, puckerMat);
    puck.renderOrder = 1;
    puck.name = "puckers";
    const grp = new THREE.Group();
    grp.name = "stitches";
    grp.add(puck, thread);
    const find = (p) => {
      // index of the stitch being sewn at progress p and how far along it is
      let lo = 0, hi = N - 1;
      if (!N || p <= segs[0].key) return { i: 0, f: 0 };
      if (p >= 1) return { i: N - 1, f: 1 };
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].key <= p) lo = mid; else hi = mid - 1; }
      const s = segs[lo];
      // the needle spends the first part of [key, key1] travelling, the rest pulling the stitch
      const span = Math.max(1e-6, s.key1 - s.key);
      return { i: lo, f: clamp((p - s.key) / span) };
    };
    grp.userData = {
      count: N, segs, radius: r,
      setProgress(p) {
        if (p <= 0 || !N) { thread.visible = puck.visible = false; return; }
        thread.visible = puck.visible = true;
        const { i, f } = find(p);
        const kf = Math.floor(f * NL);
        g.setDrawRange(0, i * IPS + kf * NR * 6);
        pg.setDrawRange(0, i * 12 + (f > 0 ? 6 : 0) + (f >= 1 ? 6 : 0));
      },
      headAt(p) {
        const { i, f } = find(clamp(p));
        const cl = heads[i] ?? [[0, 0, 0], [0, 0, 0]];
        const k = Math.min(NL, Math.floor(f * NL));
        const q = cl[k], q2 = cl[Math.min(NL, k + 1)], q0 = cl[Math.max(0, k - 1)];
        return { p: q.slice(), dir: [q2[0] - q0[0], q2[1] - q0[1], 0], i, f };
      },
      /** end point of the last COMPLETED stitch (thread anchor for the needle). */
      anchorAt(p) {
        const { i } = find(clamp(p));
        const s = segs[Math.max(0, i - 1)];
        const x = s.b[0], y = s.b[1];
        return [x, y, zb + zAt(x, y) + (s.b[2] ?? 0)];
      },
    };
    grp.userData.setProgress(0);
    return grp;
  }

  // ---------------------------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------------------------
  /** embroidery(text, { cap = text.height, color, zAt, len, align, radius }) -> stitch Group (backstitch letters,
   *  centred on x, baseline of line 0 at y = 0). userData also: width, height, lines, plan. */
  function embroidery(text, o = {}) {
    const cap = o.cap ?? TX.height;
    const e = plan.embroideredText(text, cap, { align: o.align, len: o.len, threadRatio: o.threadRatio });
    const g = stitchMesh(e.segs, { radius: o.radius ?? e.radius, color: o.color ?? TX.color, zAt: o.zAt, arch: o.arch ?? 0.55, sink: 0.7 });
    Object.assign(g.userData, { width: e.width, height: e.height, lines: e.lines, plan: e, cap });
    g.name = `embroidery:${text}`;
    return g;
  }
  /** feltLetters(text, { cap, color, colors(ch, i), thickness, width = text.feltWidth, seed }) -> Group of glyph
   *  Groups (userData.chars) cut from felt along the stroke font (rounded ends), each stroke a separate felt strip. */
  function feltLetters(text, o = {}) {
    const cap = o.cap ?? TX.height, hw = cap * (o.width ?? TX.feltWidth) / 2;
    const lay = plan.embroideredText(text, cap, { align: o.align });
    const root = new THREE.Group(), chars = [];
    lay.chars.forEach((ch, ci) => {
      const g = new THREE.Group();
      ch.strokes.forEach((st, si) => {
        const pc = piece(plan.strokeOutline(st, hw), { color: o.colors ? o.colors(ch.ch, ci) : o.color ?? "cream", thickness: o.thickness ?? F.thickness * 0.8, seed: (o.seed ?? 1) + ci * 13 + si, jitter: 0.4 });
        pc.position.z = si * 0.004;
        g.add(pc);
      });
      g.userData.ch = ch.ch;
      root.add(g);
      chars.push(g);
    });
    Object.assign(root.userData, { chars, width: lay.width, height: lay.height });
    root.name = `feltLetters:${text}`;
    return root;
  }

  // ---------------------------------------------------------------------------------------------
  // Small things: buttons, beads, sequins, pom-poms, ric-rac, needle
  // ---------------------------------------------------------------------------------------------
  const tinted = (tpl, hex) => { const m = materials[tpl].clone(); m.color.set(col(hex)); return m; };
  const tintCache = {};
  const tint = (tpl, hex) => (tintCache[`${tpl}|${hex}`] ??= tinted(tpl, hex));
  /** button({ r = .14, color, holes = 4|2, thread = "cream" }) -> Group: domed disc with a rim, holes, and floss through
   *  the holes (cross for 4, bar for 2). Back on z = 0. */
  function button(o = {}) {
    const { r = 0.14, color = "coral", holes = 4, thread = "cream" } = o;
    const h = r * 0.32;
    const prof = [[0, h * 0.75], [r * 0.55, h * 0.7], [r * 0.72, h * 0.95], [r * 0.9, h], [r, h * 0.7], [r, h * 0.2], [r * 0.95, 0], [0, 0]];
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), 40);
    g.rotateX(Math.PI / 2);
    const m = mesh(g, tint("button", color));
    const grp = new THREE.Group();
    grp.add(m);
    const hp = holes === 2 ? [[-0.28, 0], [0.28, 0]] : [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]];
    for (const [x, y] of hp) {
      const hm = new THREE.Mesh(new THREE.CircleGeometry(r * 0.1, 16), new THREE.MeshBasicMaterial({ color: "#20161c" }));
      hm.position.set(x * r, y * r, h * 0.76);
      grp.add(hm);
    }
    const sp = holes === 2 ? [{ a: [hp[0][0] * r, 0, 0], b: [hp[1][0] * r, 0, 0] }]
      : [{ a: [hp[0][0] * r, hp[0][1] * r, 0], b: [hp[2][0] * r, hp[2][1] * r, 0] }, { a: [hp[1][0] * r, hp[1][1] * r, 0], b: [hp[3][0] * r, hp[3][1] * r, 0] }];
    const th = stitchMesh(sp, { color: thread, radius: TH.radius * 0.8, z: h * 0.76, arch: 0.9, sink: 0.6 });
    th.userData.setProgress(1);
    th.children[0].visible = false; // no puckers on a button
    grp.add(th);
    grp.name = "button";
    grp.userData.top = h;
    return grp;
  }
  /** bead({ r = .05, color }) -> glossy round bead (back at z = 0). */
  function bead(o = {}) {
    const { r = 0.05, color = "ink" } = o;
    const m = mesh(new THREE.SphereGeometry(r, 20, 14), tint("bead", color));
    m.scale.z = 0.8;
    m.position.z = r * 0.8;
    const g = new THREE.Group(); g.add(m); g.name = "bead"; return g;
  }
  /** sequin({ r = .08, color }) -> shallow iridescent cup with a centre bead. */
  function sequin(o = {}) {
    const { r = 0.08, color = "mustard" } = o;
    const g = new THREE.Group();
    const cup = new THREE.LatheGeometry([[0.0001, 0.006], [r * 0.6, 0.01], [r, 0.02], [r, 0.012], [r * 0.6, 0.002], [0.0001, 0]].map(([x, y]) => new THREE.Vector2(x, y)).reverse(), 32);
    cup.rotateX(Math.PI / 2);
    g.add(mesh(cup, tint("sequin", color)));
    const b = bead({ r: r * 0.28, color });
    b.position.z = 0.01;
    g.add(b);
    g.name = "sequin";
    return g;
  }
  /** pomPom({ r = .14, color, seed }) -> lumpy yarn ball with heavy fuzz (centre at origin). */
  function pomPom(o = {}) {
    const { r = 0.14, color = "coral", seed = 1 } = o;
    const geo = new THREE.SphereGeometry(r, 28, 20);
    const p = geo.attributes.position, s = rng(`pom-${seed}`).int(1, 1e6);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 9 / r * 0.1;
      const k = 1 + 0.16 * (fbm3(x * f * 10, y * f * 10, z * f * 10, s, 3) - 0.5) * 2;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    const m = mesh(prep(geo), felt(color));
    addFuzz(m, color, { shells: 3 });
    m.children.forEach((c, i) => { c.scale.setScalar(1 + (i + 1) * 0.11); });
    const g = new THREE.Group(); g.add(m); g.name = "pomPom"; return g;
  }
  /** ricRac({ length = 2, amp = .05, period = .16, width = .05, color }) -> wavy braid tape along +X (back at z = 0). */
  function ricRac(o = {}) {
    const { length = 2, amp = 0.05, period = 0.16, width = 0.05, color = "coral" } = o;
    const pts = [];
    const n = Math.ceil((length / period) * 12);
    for (let i = 0; i <= n; i++) { const x = (i / n) * length - length / 2; pts.push(new THREE.Vector3(x, amp * Math.sin((x / period) * TAU), 0)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, width / 2, 8, false);
    g.scale(1, 1, 0.45);
    g.translate(0, 0, width * 0.22);
    const m = mesh(prep(g), felt(color));
    m.name = "ricRac";
    const grp = new THREE.Group(); grp.add(m); return grp;
  }

  /** liveTube(n, radial, radius) -> Mesh whose centreline is rewritten by userData.set(points) (n points). */
  function liveTube(n, radial, radius, material) {
    const pos = new Float32Array(n * radial * 3), nor = new Float32Array(n * radial * 3), idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = mesh(g, material);
    m.frustumCulled = false;
    m.userData.set = (pts) => {
      let Nv = null;
      for (let i = 0; i < n; i++) {
        const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
        let t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
        if (!Nv) Nv = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const d = Nv[0] * t[0] + Nv[1] * t[1] + Nv[2] * t[2];
        Nv = [Nv[0] - t[0] * d, Nv[1] - t[1] * d, Nv[2] - t[2] * d];
        const nl = Math.hypot(...Nv) || 1; Nv = Nv.map((v) => v / nl);
        const Bv = [t[1] * Nv[2] - t[2] * Nv[1], t[2] * Nv[0] - t[0] * Nv[2], t[0] * Nv[1] - t[1] * Nv[0]];
        for (let j = 0; j < radial; j++) {
          const th = (j / radial) * TAU, cs = Math.cos(th), sn = Math.sin(th);
          const dx = Nv[0] * cs + Bv[0] * sn, dy = Nv[1] * cs + Bv[1] * sn, dz = Nv[2] * cs + Bv[2] * sn;
          const k = (i * radial + j) * 3;
          pos[k] = pts[i][0] + dx * radius; pos[k + 1] = pts[i][1] + dy * radius; pos[k + 2] = pts[i][2] + dz * radius;
          nor[k] = dx; nor[k + 1] = dy; nor[k + 2] = dz;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
    };
    return m;
  }
  /**
   * needle({ length = .9, thread = "coral", lean = [.42, .5, .76] }) -> Group: steel needle with an eye and a trailing floss.
   *   userData.update({ tip:[x,y,z], anchor:[x,y,z], dip = 0 (0..1, how far the tip is pushed into the felt), visible })
   *   in the coordinates of the needle's parent (put it in the same group as the stitches it sews).
   *   userData.dipAt(f) -> dip for a stitch fraction f (in at the end of each stitch, out at the start of the next).
   */
  function needle(o = {}) {
    const { length = 0.9, thread = "coral" } = o;
    const lean = new THREE.Vector3(...(o.lean ?? [0.42, 0.5, 0.76])).normalize();
    const R = 0.02;
    const prof = [[0, 0], [R * 0.35, length * 0.05], [R, length * 0.2], [R, length * 0.86], [R * 1.25, length * 0.93], [R * 0.9, length], [0, length * 1.005]];
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 20);
    const shaft = mesh(g, materials.needle);
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.32, length * 0.05, 4, 8), new THREE.MeshBasicMaterial({ color: "#1d1a1c" }));
    eye.position.y = length * 0.93;
    eye.scale.z = 1.6;
    shaft.add(eye);
    const body = new THREE.Group();
    body.add(shaft);
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    const tube = liveTube(24, 7, TH.radius * 0.95, (() => { const m = materials.floss.clone(); m.vertexColors = false; m.color.set(col(thread)); return m; })());
    tube.castShadow = true;
    const grp = new THREE.Group();
    grp.add(body, tube);
    grp.name = "needle";
    const eyeLocal = lean.clone().multiplyScalar(length * 0.93);
    grp.userData.update = ({ tip, anchor, dip = 0, visible = true }) => {
      grp.visible = visible;
      if (!visible) return;
      const d = dip * (spec.tuning.needleDip);
      const tp = new THREE.Vector3(...tip).addScaledVector(lean, -d);
      body.position.copy(tp);
      const e = tp.clone().add(eyeLocal);
      const a = new THREE.Vector3(...(anchor ?? tip));
      // floss: from the anchor (where the last stitch ended) up and over to the needle's eye, with a soft sag
      const pts = [];
      for (let i = 0; i < 24; i++) {
        const u = i / 23;
        const p = a.clone().lerp(e, u);
        const lift = Math.sin(Math.PI * u) * (0.18 + 0.25 * a.distanceTo(e));
        p.z += lift * 0.9 + 0.03;
        p.y -= Math.sin(Math.PI * u) * 0.12 * a.distanceTo(e);
        pts.push([p.x, p.y, p.z]);
      }
      tube.userData.set(pts);
    };
    grp.userData.dipAt = (f) => Math.max(0, 1 - Math.min(f, 1 - f) * 6) ** 1.5;
    return grp;
  }

  // ---------------------------------------------------------------------------------------------
  // Sets: backdrop board, hoop, patches/banners, cards, paths
  // ---------------------------------------------------------------------------------------------
  /**
   * board({ w = 15, h = 9, color = "board", frame = .5, frameColor = "frame", stitch = "cream", ground, groundColor = "forest" })
   *   -> Group: a big felt backdrop (back at z = 0, front at z = thickness) with a felt border band held by a running stitch,
   *   and an optional scalloped felt ground strip (ground = height in m from the bottom of the board).
   *   userData.top = front z of the backdrop (lay pieces at z >= top).
   */
  function board(o = {}) {
    const { w = 15, h = 9, color = "board", frame = 0.5, frameColor = "frame", stitch = "cream", ground = 0, groundColor = "forest", seed = 3 } = o;
    const grp = new THREE.Group();
    grp.name = "board";
    const t = F.thickness;
    const back = piece(shapes.rect(w, h, { y: -h / 2 }), { color, thickness: t, seed, jitter: 0, fuzz: false });
    grp.add(back);
    const z = t;
    if (frame > 0) {
      const outer = shapes.rect(w + 0.4, h + 0.4, { y: -h / 2 - 0.2 });
      const iw = w - 2 * frame, ih = h - 2 * frame;
      const inner = shapes.roundRect(iw, ih, 0.25, { y: -ih / 2 });
      const band = piece(outer, { color: frameColor, seed: seed + 1, holes: [inner], jitter: 0.6 });
      band.position.z = z;
      grp.add(band);
      const ring = outlineOf(shapes.roundRect(iw + 0.36, ih + 0.36, 0.4, { y: -(ih + 0.36) / 2 }));
      const st = stitchMesh(plan.runningStitch(ring, { closed: true, len: 0.24, gap: 0.14 }), { color: stitch, radius: TH.radius * 1.15, z: z + F.thickness });
      st.userData.setProgress(1);
      grp.add(st);
    }
    if (ground > 0) {
      const gw = w - 2 * frame + 0.1, y0 = -h / 2 + frame - 0.05;
      const pts = [[-gw / 2, y0], [gw / 2, y0]];
      const n = 26;
      for (let i = 0; i <= n; i++) {
        const x = gw / 2 - (i / n) * gw;
        pts.push([x, y0 + ground + 0.09 * Math.sin((i / n) * Math.PI * 9 + 0.6) + 0.05 * Math.sin(i * 1.7)]);
      }
      const gp = piece(pts, { color: groundColor, seed: seed + 2, jitter: 0.8 });
      gp.position.z = z + 0.002;
      grp.add(gp);
      grp.userData.groundTop = y0 + ground;
      const run = plan.runningStitch(pts.slice(2).map(([x, y]) => [x, y - 0.14]), { len: 0.2, gap: 0.13 });
      const st = stitchMesh(run, { color: "leaf", radius: TH.radius, z: z + 0.002 + F.thickness });
      st.userData.setProgress(1);
      grp.add(st);
    }
    grp.userData.top = z;
    return grp;
  }
  /** hoop({ r = 3, color = "cream", seed }) -> Group: felt stretched in a wooden embroidery hoop (two rings + screw clasp
   *  at the top), facing +Z, centred. userData.top = felt front z. */
  function hoop(o = {}) {
    const { r = 3, color = "cream", seed = 5 } = o;
    const grp = new THREE.Group();
    const f = piece(shapes.circle(r + 0.05), { color, seed, jitter: 0, fuzz: false });
    grp.add(f);
    const wood = materials.wood;
    const ring1 = mesh(new THREE.TorusGeometry(r + 0.1, 0.11, 16, 128), wood);
    ring1.scale.z = 1.6; ring1.position.z = F.thickness * 0.5;
    const ring2 = mesh(new THREE.TorusGeometry(r + 0.3, 0.1, 16, 128), wood);
    ring2.scale.z = 1.7; ring2.position.z = F.thickness * 0.5;
    const clasp = mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), wood);
    clasp.position.set(0, r + 0.5, F.thickness * 0.5);
    const screw = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 12), materials.needle);
    screw.rotation.z = Math.PI / 2; screw.position.copy(clasp.position);
    grp.add(ring1, ring2, clasp, screw);
    grp.name = "hoop";
    grp.userData.top = F.thickness;
    return grp;
  }
  /** bannerShape(w, h, notch) -> felt banner outline with swallow-tail ends, bottom-centre at 0. */
  const bannerShape = (w, h, notch = 0.35) => [[-w / 2, 0], [w / 2, 0], [w / 2 - notch, h / 2], [w / 2, h], [-w / 2, h], [-w / 2 + notch, h / 2]];
  /**
   * patch({ text, cap, w, h, color = "cream", thread = text colour, border = "running"|"blanket"|null, borderColor,
   *         shape = "round"|"banner"|"rect", pinked, seed, align }) -> Group (centred, back on z = 0)
   *   A felt label with embroidered text and a stitched border. Auto-sizes w/h to the text if not given.
   *   userData.sew(pBorder, pText) reveal; userData.text / border (stitch Groups); userData.felt (piece); w, h.
   */
  function patch(o = {}) {
    const { text = "", cap = TX.height, color = "cream", border = "running", shape = "round", pinked = 0, seed = 7 } = o;
    const e = text ? plan.embroideredText(text, cap, { align: o.align }) : { width: 0, height: 0, lines: 0 };
    const w = o.w ?? e.width + cap * 2.2, h = o.h ?? e.height + cap * 1.7;
    const sh = shape === "banner" ? bannerShape(w, h, o.notch ?? h * 0.32) : shape === "rect" ? outlineOf(shapes.rect(w, h)) : outlineOf(shapes.roundRect(w, h, Math.min(w, h) * 0.18));
    const shp = sh.map(([x, y]) => [x, y - h / 2]);
    const pc = piece(shp, { color, seed, pinked });
    const grp = new THREE.Group();
    grp.add(pc);
    const top = pc.userData.top;
    let bd = null;
    if (border) {
      const ring = shape === "banner" ? bannerShape(w - 0.34, h - 0.3, (o.notch ?? h * 0.32) * 0.75).map(([x, y]) => [x, y - (h - 0.3) / 2]) : outlineOf(shapes.roundRect(w - 0.3, h - 0.3, Math.min(w, h) * 0.14, { y: -(h - 0.3) / 2 }));
      const segs = border === "blanket" ? plan.blanketStitch(pc.userData.outline) : plan.runningStitch(ring, { closed: true });
      bd = stitchMesh(segs, { color: o.borderColor ?? o.thread ?? TX.color, z: top });
      grp.add(bd);
    }
    let tx = null;
    if (text) {
      tx = embroidery(text, { cap, color: o.thread ?? TX.color, align: o.align });
      tx.position.set(0, e.height / 2 - cap, top);
      grp.add(tx);
    }
    grp.name = `patch:${text}`;
    Object.assign(grp.userData, {
      w, h, top, felt: pc, text: tx, border: bd,
      sew(pb = 1, pt = 1) { bd?.userData.setProgress(pb); tx?.userData.setProgress(pt); },
    });
    grp.userData.sew(0, 0);
    return grp;
  }
  /**
   * stitchedPath(points [[x,y]...], { color, bend = .5, len, gap, z }) -> stitch Group of a dashed running-stitch route.
   *   userData.path = smoothed polyline [[x,y,z]...] (feed it to plan.travel for an item riding the route).
   */
  function stitchedPath(points, o = {}) {
    const path = plan.smoothPath(points, o.bend ?? 0.5);
    const g = stitchMesh(plan.runningStitch(path, { len: o.len ?? 0.2, gap: o.gap ?? 0.14 }), { color: o.color ?? "cream", z: o.z ?? 0, radius: o.radius });
    g.userData.path = path.map((p) => [p[0], p[1], (o.z ?? 0)]);
    g.name = "stitchedPath";
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // Characters and emblems
  // ---------------------------------------------------------------------------------------------
  /** superellipse outline (bottom-centre at 0): a soft toy body. */
  const bodyOutline = (w, h, n = 3.2, flatBottom = 0.2) => {
    const pts = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      let x = Math.sign(c) * Math.abs(c) ** (2 / n) * (w / 2), y = Math.sign(s) * Math.abs(s) ** (2 / n) * (h / 2);
      if (y < 0) { y *= 1 - flatBottom; x *= 1 + flatBottom * 0.1 * Math.abs(s); }
      pts.push([x, y + h / 2 - flatBottom * 0]);
    }
    const minY = Math.min(...pts.map((p) => p[1]));
    return pts.map(([x, y]) => [x, y - minY]);
  };
  /**
   * emblem(kind, { size = .8, seed }) -> Group (centred, back on z = 0): a small felt appliqué icon.
   *   kinds: "clipboard" | "magnifier" | "pencil" | "tick" | "star" | "heart". userData.tick (tick emblem: stitch Group).
   */
  function emblem(kind, o = {}) {
    const s = o.size ?? 0.8, seed = o.seed ?? 11, T = F.thickness * 0.7;
    const g = new THREE.Group();
    const lay = (pc, z = 0) => { pc.position.z = z; g.add(pc); return pc; };
    if (kind === "clipboard") {
      const b = lay(piece(shapes.roundRect(s * 0.78, s, s * 0.08, { y: -s / 2 }), { color: "cocoa", thickness: T, seed }));
      const pp = lay(piece(shapes.rect(s * 0.6, s * 0.72, { y: -s * 0.42 }), { color: "white", thickness: T * 0.7, seed: seed + 1 }), b.userData.top);
      const clip = lay(piece(shapes.roundRect(s * 0.34, s * 0.16, s * 0.05, { y: s * 0.38 }), { color: "silver", thickness: T, seed: seed + 2 }), b.userData.top + 0.01);
      void clip;
      const z0 = b.userData.top + pp.userData.top;
      const lines = [0.16, 0.0, -0.16].map((y) => plan.runningStitch([[-s * 0.22, y * s], [s * 0.22, y * s]], { len: s * 0.09, gap: s * 0.05 }));
      const ticks = plan.crossStitch([[-s * 0.2, -s * 0.3]], { size: s * 0.1 });
      const st = stitchMesh([...lines.flat(), ...ticks], { color: "ink", radius: TH.radius * 0.85, z: z0 });
      st.userData.setProgress(1);
      g.add(st);
    } else if (kind === "magnifier") {
      const R = s * 0.32, cxy = [-s * 0.08, s * 0.1];
      const handle = lay(piece(plan.strokeOutline([[cxy[0] + R * 0.8, cxy[1] - R * 0.8, 0], [s * 0.38, -s * 0.42, 0]], s * 0.08), { color: "cocoa", thickness: T, seed: seed + 3 }));
      void handle;
      const lens = lay(piece(shapes.circle(R * 0.86, { x: cxy[0], y: cxy[1] }), { color: "sky", thickness: T * 0.7, seed: seed + 4 }), 0.004);
      const ring = lay(piece(shapes.circle(R * 1.12, { x: cxy[0], y: cxy[1] }), { color: "mustardDark", thickness: T, seed: seed + 5, holes: [shapes.circle(R * 0.82, { x: cxy[0], y: cxy[1] })] }), 0.01);
      void ring;
      const hl = plan.satinFill(plan.strokeOutline([[cxy[0] - R * 0.45, cxy[1] + R * 0.05, 0], [cxy[0] - R * 0.12, cxy[1] + R * 0.45, 0]], s * 0.035), { spacing: TH.radius * 1.9, angle: 2.3 });
      const st = stitchMesh(hl, { color: "white", radius: TH.radius * 0.8, z: 0.004 + lens.userData.top });
      st.userData.setProgress(1);
      g.add(st);
    } else if (kind === "pencil") {
      const L = s * 1.1, W = s * 0.24;
      const pg = new THREE.Group();
      const body = piece(shapes.rect(W, L * 0.62, { y: -L * 0.3 }), { color: "mustard", thickness: T, seed });
      const tip = piece([[-W / 2, -L * 0.3], [0, -L * 0.56], [W / 2, -L * 0.3]], { color: "oat", thickness: T, seed: seed + 1 });
      const lead = piece([[-W * 0.17, -L * 0.48], [0, -L * 0.56], [W * 0.17, -L * 0.48]], { color: "ink", thickness: T, seed: seed + 2, jitter: 0.2 });
      lead.position.z = 0.012;
      const band = piece(shapes.rect(W * 1.04, L * 0.08, { y: L * 0.32 }), { color: "silver", thickness: T, seed: seed + 3 });
      const eraser = piece(shapes.roundRect(W, L * 0.13, W * 0.3, { y: L * 0.39 }), { color: "blush", thickness: T, seed: seed + 4 });
      pg.add(body, tip, lead, band, eraser);
      const st = stitchMesh(plan.runningStitch([[0, -L * 0.26], [0, L * 0.29]], { len: s * 0.1, gap: s * 0.06 }), { color: "mustardDark", radius: TH.radius * 0.85, z: T });
      st.userData.setProgress(1);
      pg.add(st);
      pg.rotation.z = -0.62;
      g.add(pg);
    } else if (kind === "tick" || kind === "badge") {
      const b = lay(piece(shapes.scallop(s * 0.5, 14, 0.08), { color: o.color ?? "leaf", thickness: T, seed }));
      const tk = stitchMesh(plan.satinFill(plan.strokeOutline(tickPts(s * 0.62), s * 0.07), { spacing: TH.radius * 2, angle: 0.4 }), { color: "white", z: b.userData.top, arch: 0.35 });
      tk.userData.setProgress(kind === "tick" ? 1 : 0);
      g.add(tk);
      g.userData.tick = tk;
    } else if (kind === "star") {
      lay(piece(shapes.star(s * 0.5, s * 0.24, 5), { color: o.color ?? "mustard", thickness: T, seed }));
    } else if (kind === "heart") {
      const pts = [];
      for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; pts.push([16 * Math.sin(a) ** 3 / 34 * s, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 34 * s]); }
      lay(piece(pts, { color: o.color ?? "coral", thickness: T, seed }));
    }
    g.name = `emblem:${kind}`;
    return g;
  }
  /** tick mark polyline (centred), for felt ticks and satin ticks. */
  const tickPts = (s) => [[-0.42 * s, 0.02 * s, 0], [-0.12 * s, -0.3 * s, 0], [0.45 * s, 0.36 * s, 0]];

  /**
   * character({ color, w = 1.7, h = 2, emblem, emblemSize, seam = "blanket", seamColor = "cream", cheeks = "blush",
   *             feet, seed }) -> Group, pivot at the bottom centre (stand it on a ground line; scale it for squash).
   *   A stuffed felt toy: puffy body, bead eyes on felt whites, cross-stitch... smile, felt cheeks, an emblem appliqué
   *   on the belly. userData: { body, face, emblem, w, h, zAt }.
   */
  function character(o = {}) {
    const { color = "mustard", w = 1.7, h = 2, seam = "blanket", seamColor = "cream", cheeks = "blush", seed = 21 } = o;
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const f = piece(shapes.ellipse(w * 0.16, h * 0.07, { x: sx * w * 0.22, y: h * 0.035 }), { color: o.feet ?? (P[`${color}Dark`] ? `${color}Dark` : "ink"), seed: seed + (sx > 0 ? 1 : 2) });
      f.position.z = -0.01;
      g.add(f);
    }
    const body = stuffed(bodyOutline(w, h * 0.96).map(([x, y]) => [x, y + h * 0.04]), { color, seam, seamColor, seed, profile: 3.5 });
    g.add(body);
    const zAt = body.userData.zAt;
    const face = new THREE.Group();
    const ey = h * 0.72, ex = w * 0.2;
    for (const sx of [-1, 1]) {
      const x = sx * ex;
      const wh = piece(shapes.ellipse(w * 0.105, h * 0.075, { x, y: ey }), { color: "white", thickness: F.thickness * 0.6, seed: seed + 5 + sx });
      wh.position.z = zAt(x, ey) - 0.02;
      const pupil = bead({ r: w * 0.05, color: "ink" });
      pupil.position.set(x + w * 0.012, ey - h * 0.01, wh.position.z + wh.userData.top - 0.01);
      const glint = new THREE.Mesh(new THREE.CircleGeometry(w * 0.014, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      glint.position.set(x + w * 0.03, ey + h * 0.012, pupil.position.z + w * 0.05 * 0.8 * 2 + 0.002);
      face.add(wh, pupil, glint);
      if (cheeks) {
        const ck = piece(shapes.ellipse(w * 0.075, h * 0.035, { x: sx * w * 0.32, y: ey - h * 0.12 }), { color: cheeks, thickness: F.thickness * 0.5, seed: seed + 8 + sx, fuzz: { shells: 2 } });
        ck.position.z = zAt(sx * w * 0.32, ey - h * 0.12) - 0.03;
        face.add(ck);
      }
    }
    const smile = [];
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (1.15 + 0.7 * (i / 10)); smile.push([Math.cos(a) * w * 0.13, ey - h * 0.06 + Math.sin(a) * h * 0.06]); }
    const sm = stitchMesh(plan.backstitch(smile.map((p) => [p[0], p[1], 0]), { len: w * 0.06 }), { color: "ink", zAt, radius: TH.radius * 1.05 });
    sm.userData.setProgress(1);
    face.add(sm);
    g.add(face);
    let em = null;
    if (o.emblem) {
      em = typeof o.emblem === "string" ? emblem(o.emblem, { size: o.emblemSize ?? w * 0.46, seed: seed + 30 }) : o.emblem;
      const ey2 = h * 0.33;
      em.position.set(0, ey2, zAt(0, ey2) - 0.035);
      g.add(em);
    }
    g.name = "character";
    Object.assign(g.userData, { body, face, emblem: em, w, h, zAt, top: body.userData.top });
    return g;
  }

  /** card({ w = 2.4, h = 1.5, color = "mustard", text, cap, thread, pinked = .035, lines = 0, seed }) -> patch-like felt card
   *  (pinked edge, running-stitch border, embroidered text or `lines` dashed "text" lines). userData.sew(pb, pt). */
  function card(o = {}) {
    const { w = 2.4, h = 1.5, color = "mustard", pinked = 0.035, lines = 0, seed = 31 } = o;
    if (o.text) return patch({ text: o.text, cap: o.cap ?? 0.3, w, h, color, thread: o.thread ?? "ink", border: "running", borderColor: o.borderColor ?? o.thread ?? "ink", pinked, seed, shape: "round" });
    const p = patch({ w, h, color, border: "running", borderColor: o.thread ?? "ink", pinked, seed });
    if (lines) {
      const segs = [];
      for (let i = 0; i < lines; i++) {
        const y = h * 0.28 - (i * h * 0.56) / Math.max(1, lines - 1);
        const x1 = w * (i === lines - 1 ? 0.12 : 0.3);
        segs.push(...plan.runningStitch([[-w * 0.3, y], [x1, y]], { len: 0.13, gap: 0.07 }));
      }
      const st = stitchMesh(segs, { color: o.thread ?? "ink", z: p.userData.top });
      p.add(st);
      p.userData.text = st;
    }
    p.userData.sew(0, 0);
    return p;
  }
  /** rosette({ r = .42, color = "coral", tail = "coralDark", center = "mustard" }) -> felt prize ribbon (scalloped disc, two
   *  notched tails, a button in the middle). Centred on the disc; back on z = 0. */
  function rosette(o = {}) {
    const { r = 0.42, color = "coral", tail = "coralDark", center = "mustard", seed = 41 } = o;
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const tl = piece([[0, 0], [sx * r * 0.55, -r * 1.7], [sx * r * 0.32, -r * 1.5], [sx * r * 0.12, -r * 1.75], [sx * r * 0.08 - sx * r * 0.3, -r * 0.2]].map(([x, y]) => [x + sx * r * 0.1, y]), { color: tail, seed: seed + sx });
      tl.position.z = -0.01;
      g.add(tl);
    }
    const disc = piece(shapes.scallop(r, 16, 0.12), { color, seed });
    g.add(disc);
    const inner = piece(shapes.circle(r * 0.6), { color: "cream", seed: seed + 3, thickness: F.thickness * 0.7 });
    inner.position.z = disc.userData.top;
    g.add(inner);
    const st = stitchMesh(plan.runningStitch(outlineOf(shapes.circle(r * 0.72)), { closed: true, len: 0.09, gap: 0.06 }), { color: "cream", z: disc.userData.top, radius: TH.radius * 0.85 });
    st.userData.setProgress(1);
    g.add(st);
    const b = button({ r: r * 0.36, color: center, holes: 4, thread: "coral" });
    b.position.z = disc.userData.top + inner.userData.top;
    g.add(b);
    g.name = "rosette";
    return g;
  }
  /** report({ w = 2.3, h = 2.9, color = "white", title = "REPORT", accent = "coral" }) -> a finished felt document: folded
   *  corner, embroidered title, running-stitch text lines, a rosette. userData.rosette, userData.sew(p). */
  function report(o = {}) {
    const { w = 2.3, h = 2.9, color = "white", title = "REPORT", accent = "coral", seed = 51 } = o;
    const g = new THREE.Group();
    const fold = 0.42;
    const outline = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2 - fold], [w / 2 - fold, h / 2], [-w / 2, h / 2]];
    const doc = piece(outline, { color, seed });
    g.add(doc);
    const T = doc.userData.top;
    const corner = piece([[w / 2 - fold, h / 2], [w / 2 - fold, h / 2 - fold], [w / 2, h / 2 - fold]], { color: "oat", seed: seed + 1, thickness: F.thickness * 0.6 });
    corner.position.z = T;
    g.add(corner);
    const tt = embroidery(title, { cap: o.cap ?? 0.3, color: accent });
    tt.position.set(-fold * 0.33, h / 2 - 0.6, T);
    g.add(tt);
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const y = h / 2 - 1.05 - i * 0.27, x1 = w * (i === 3 ? 0.05 : 0.33);
      segs.push(...plan.runningStitch([[-w * 0.36, y], [x1, y]], { len: 0.12, gap: 0.07 }));
    }
    const lines = stitchMesh(segs, { color: "plum", z: T });
    g.add(lines);
    const bd = stitchMesh(plan.blanketStitch(doc.userData.outline, { step: 0.16, depth: 0.12 }), { color: accent, zAt: () => T });
    g.add(bd);
    const ro = rosette({ r: o.rosetteR ?? 0.4, color: accent });
    ro.position.set(w * 0.3, -h * 0.28, T);
    g.add(ro);
    g.name = "report";
    Object.assign(g.userData, {
      w, h, top: T, rosette: ro, title: tt, lines, border: bd,
      sew(p = 1) { tt.userData.setProgress(p); lines.userData.setProgress(p); bd.userData.setProgress(p); },
    });
    g.userData.sew(1);
    return g;
  }
  /** feltTick({ size = 1, color = "leaf", stitch = "white" }) -> Group: a felt tick cut-out with a running-stitch outline
   *  (userData.stitch, userData.setProgress(p) sews it). Centred. */
  function feltTick(o = {}) {
    const { size = 1, color = "leaf", stitch = "white", seed = 61 } = o;
    const pts = tickPts(size);
    const outline = plan.strokeOutline(pts, size * 0.12);
    const pc = piece(outline, { color, seed });
    const g = new THREE.Group();
    g.add(pc);
    const inner = plan.backstitch(pts, { len: 0.11, gapRatio: 0.55 });
    const st = stitchMesh(inner, { color: stitch, z: pc.userData.top, radius: TH.radius * 1.1 });
    g.add(st);
    g.name = "feltTick";
    Object.assign(g.userData, { stitch: st, setProgress: (p) => st.userData.setProgress(p), top: pc.userData.top });
    st.userData.setProgress(0);
    return g;
  }
  /** spark({ size = .2, color }) -> a tiny 4-point felt star (for "work" sparkles). */
  const spark = (o = {}) => piece(shapes.star((o.size ?? 0.2) * 0.5, (o.size ?? 0.2) * 0.2, 4), { color: o.color ?? "mustard", seed: o.seed ?? 71, thickness: F.thickness * 0.6, fuzz: { shells: 2 } });

  /** hinged(content, { at = "top", w, h }) -> pivot Group to flop/peel a piece about one of its edges (content is
   *  re-centred so the edge passes through the pivot). userData.setAngle(a) (a < 0 lifts toward the camera). */
  function hinged(content, { at = "top", h = 1, w = 1 } = {}) {
    const pivot = new THREE.Group();
    const off = at === "top" ? [0, -h / 2] : at === "bottom" ? [0, h / 2] : at === "left" ? [w / 2, 0] : [-w / 2, 0];
    content.position.x += off[0]; content.position.y += off[1];
    pivot.add(content);
    const axis = at === "top" || at === "bottom" ? "x" : "y";
    const sign = at === "top" ? 1 : at === "bottom" ? -1 : at === "left" ? 1 : -1;
    pivot.userData.setAngle = (a) => { pivot.rotation[axis] = a * sign; };
    pivot.userData.content = content;
    return pivot;
  }

  const props = {
    piece, stuffed, stitchMesh, embroidery, feltLetters, button, bead, sequin, pomPom, ricRac, needle,
    board, hoop, patch, stitchedPath, emblem, character, card, rosette, report, feltTick, spark, hinged,
  };
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
      board: (s) => props.board(s.dims ?? {}),
      hoop: (s) => props.hoop(s.dims ?? {}),
    },
    sfx: spec.sfx,
    plan,
    motion: plan,
    felt,
    addFuzz,
    outlineOf,
    shapes,
  };
}
