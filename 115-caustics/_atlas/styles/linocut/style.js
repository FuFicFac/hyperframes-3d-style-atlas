// styles/linocut/style.js — "Linocut": carve, ink, press, peel. The look lives in spec.js; WHAT is carved, WHEN each
// groove is cut, where the roller, paper and baren are, live in lino.js (a THREE-free planner shared with the SCORE).
// This file turns the plan into pictures:
//   * the lino top is ONE dense plane with a patched MeshStandardMaterial: the vertex shader lowers it by depth(t) read
//     from a baked carve texture (first-pass time/depth + deepest-stroke time/depth per texel), the fragment shader
//     re-derives the groove normal from the same texture, shades cut lino paler and warmer, and inks texels that are
//     still on the raised top once the roller's contact line has passed them (glossy, with roller streaks);
//   * the paper is one plane whose vertex shader does the corner curl (cylinder roll), the hinge and a rigid "present"
//     matrix; the back face shows the print (ink transferred where the baren has rubbed, with salt-and-pepper specks),
//     the front face shows the faint ghost of the image through the sheet;
//   * gouge (lathe handle, brass ferrule, steel shaft, V blade), lino curls (one instanced mesh), brayer, baren, bench,
//     birch-ply block base, and an overlay caption whose old line rolls up and out as the new one rolls in.
// Props never animate themselves: the scene calls bench.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, paperTexture, canvasTexture, paintPixels } from "../../kit/textures.js";
import { valueNoise2 } from "../../kit/noise.js";
import { hash01, clamp, lerp, ease } from "../../kit/time.js";
import { rodGeometry } from "../../kit/paths.js";
import * as lino from "./lino.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const col = (h) => new THREE.Color(h);

/** GLSL shared by the lino top and the paper: depth(t) from the carve bake (depths stored in mm) */
const CARVE_GLSL = /* glsl */ `
uniform sampler2D uCarve;
uniform float uT;
uniform float uSoft;
float carveDepthLod(vec2 uv) {
  vec4 c = textureLod(uCarve, uv, 0.0);
  return max(c.y * smoothstep(c.x, c.x + uSoft, uT), c.w * smoothstep(c.z, c.z + uSoft, uT)) * 0.001;
}
float finalDepthLod(vec2 uv) { vec4 c = textureLod(uCarve, uv, 0.0); return max(c.y, c.w) * 0.001; }
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const BK = spec.block, LS = spec.linoShade, IS = spec.inkShade, PS = spec.print;
  const TOP = BK.ply + BK.lino; // lino top height above the bench
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };

  // ---------------------------------------------------------------- bench
  function bench() {
    const B = spec.bench;
    const tex = woodTexture({ ...spec.wood, repeat: B.woodRepeat });
    tex.anisotropy = 8;
    const m = materials.bench.clone();
    m.map = tex;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.d), m);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    g.name = "bench";
    return g;
  }

  // ---------------------------------------------------------------- textures from the plan
  function carveTexture(plan) {
    const B = plan.bake(BK.bakeX, BK.bakeY);
    const half = new Uint16Array(B.data.length);
    for (let i = 0; i < B.data.length; i++) {
      const v = i % 2 ? B.data[i] * 1000 : B.data[i]; // channels 1 and 3 are depths -> mm
      half[i] = THREE.DataUtils.toHalfFloat(v);
    }
    const tex = new THREE.DataTexture(half, B.nx, B.ny, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    tex.userData.uncovered = B.uncovered;
    return tex;
  }
  /** aux RGBA8 over the block: R fine speck noise, G "thin ink" field, B roller streaks (along x), A lino mottle */
  function auxTexture() {
    const W = 1024, H = 768, data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const bx = (i / W) * BK.w, by = (j / H) * BK.h, k = (j * W + i) * 4;
      data[k] = 255 * valueNoise2(bx * 900, by * 900, 31);
      data[k + 1] = 255 * (0.65 * valueNoise2(bx * 45, by * 45, 32) + 0.35 * valueNoise2(bx * 110, by * 110, 33));
      data[k + 2] = 255 * (0.6 * valueNoise2(bx * 14, by * 520, 34) + 0.4 * valueNoise2(bx * 40, by * 1400, 35));
      data[k + 3] = 255 * (0.6 * valueNoise2(bx * 70, by * 70, 36) + 0.4 * valueNoise2(bx * 300, by * 300, 37));
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  function rubTexture(plan) {
    const R = plan.rubBake(160, 124);
    const half = new Uint16Array(R.data.length);
    for (let i = 0; i < R.data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(R.data[i]);
    const tex = new THREE.DataTexture(half, R.nx, R.ny, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    tex.userData.missFrac = R.missFrac;
    return tex;
  }

  // ---------------------------------------------------------------- the block (ply base + lino walls + carved top)
  function block(plan, U) {
    const g = new THREE.Group(); g.name = "block";
    const plyTex = woodTexture({ size: 512, boards: 1, seed: 77, grainFreq: 10, grainWarp: 1.2, contrast: 0.22, dark: "#d6bf98", mid: "#e6d4b2", light: "#f2e6cc", seam: "#d6bf98" });
    const plyMat = materials.ply.clone(); plyMat.map = plyTex;
    const ply = shadow(new THREE.Mesh(new THREE.BoxGeometry(BK.w, BK.ply, BK.h), plyMat));
    ply.position.y = BK.ply / 2;
    g.add(ply);
    // lino walls: a box without its top face (the carved plane is the top)
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const walls = shadow(new THREE.Mesh(new THREE.BoxGeometry(BK.w, BK.lino, BK.h), [materials.linoSide, materials.linoSide, hidden, materials.linoSide, materials.linoSide, materials.linoSide]));
    walls.position.y = BK.ply + BK.lino / 2 - 0.00005;
    g.add(walls);
    // the carved top
    const geo = new THREE.PlaneGeometry(BK.w, BK.h, BK.segX, BK.segY);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: LS.roughTop, metalness: 0 });
    const vtx = (s) => s
      .replace("#include <common>", `#include <common>\n${CARVE_GLSL}\nvarying vec2 vLUv;`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vLUv = uv;\n  transformed.z -= carveDepthLod(uv);");
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = vtx(sh.vertexShader);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${CARVE_GLSL}
varying vec2 vLUv;
uniform sampler2D uAux;
uniform float uInkFront;
uniform vec2 uTexel, uSize;
uniform vec3 cTop, cCut, cCutDeep, cInk;
uniform float uMottle, rTop, rCut, rInk, rInkVar, inkMax, inkMin, streakN, uNormalGain, uAO;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
  float D = carveDepthLod(vLUv);
  float Dx = carveDepthLod(vLUv + vec2(uTexel.x, 0.0)) - carveDepthLod(vLUv - vec2(uTexel.x, 0.0));
  float Dy = carveDepthLod(vLUv + vec2(0.0, uTexel.y)) - carveDepthLod(vLUv - vec2(0.0, uTexel.y));
  vec2 gD = vec2(Dx / (2.0 * uTexel.x * uSize.x), Dy / (2.0 * uTexel.y * uSize.y));
  vec4 aux = textureLod(uAux, vLUv, 0.0);
  float sA = textureLod(uAux, vLUv + vec2(0.0, 2.0 * uTexel.y), 0.0).b - textureLod(uAux, vLUv - vec2(0.0, 2.0 * uTexel.y), 0.0).b;
  float cutK = smoothstep(0.00004, 0.00026, D);
  vec3 topC = cTop * (1.0 + uMottle * (aux.a - 0.5) * 2.0);
  vec3 cutC = mix(cCut, cCutDeep, smoothstep(0.0008, 0.0027, D)) * (0.97 + 0.06 * aux.r);
  float bxw = (vLUv.x - 0.5) * uSize.x;
  float rolled = 1.0 - smoothstep(uInkFront - 0.0016, uInkFront + 0.0004, bxw);
  float inkA = rolled * (1.0 - smoothstep(inkMin, inkMax, D)) * (0.94 + 0.06 * aux.b);
  float ao = 1.0 - uAO * smoothstep(0.0, 0.0027, D);
  diffuseColor.rgb = mix(mix(topC, cutC * ao, cutK), cInk, inkA);`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = mix(mix(rTop, rCut, cutK), rInk + rInkVar * (aux.b - 0.5) * 2.0, inkA);`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  vec3 nW = normalize(vec3(gD.x * uNormalGain, 1.0, -gD.y * uNormalGain) + vec3(0.0, 0.0, -sA * streakN * inkA));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
    };
    mat.customProgramCacheKey = () => "linocut-top";
    const top = new THREE.Mesh(geo, mat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = TOP;
    top.receiveShadow = true;
    top.castShadow = true;
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); sh.vertexShader = vtx(sh.vertexShader); };
    depthMat.customProgramCacheKey = () => "linocut-top-depth";
    top.customDepthMaterial = depthMat;
    top.name = "linoTop";
    g.add(top);
    g.userData.top = top;
    return g;
  }

  // ---------------------------------------------------------------- gouge (tip at the group origin, body behind along -X)
  function gouge() {
    const G = spec.gouge;
    const root = new THREE.Group(); root.name = "gouge";
    const tilt = new THREE.Group(); tilt.rotation.z = -G.tilt; root.add(tilt);
    // V blade: a thin V cross-section extruded backwards from the cutting edge
    const w = G.bladeW, h = G.bladeH, th = 0.0006;
    const s = new THREE.Shape();
    s.moveTo(-w, h); s.lineTo(0, 0); s.lineTo(w, h); s.lineTo(w - th * 1.4, h); s.lineTo(0, th * 1.7); s.lineTo(-w + th * 1.4, h); s.closePath();
    const bg = new THREE.ExtrudeGeometry(s, { depth: G.blade, bevelEnabled: false });
    bg.rotateY(-Math.PI / 2);
    tilt.add(shadow(new THREE.Mesh(bg, materials.steel)));
    const x1 = -G.blade, x2 = x1 - G.shaft, x3 = x2 - G.ferrule;
    const shaft = shadow(new THREE.Mesh(rodGeometry([x1 + 0.002, h * 0.55, 0], [x2, h * 0.55, 0], G.shaftR, 16), materials.steel));
    tilt.add(shaft);
    const fer = shadow(new THREE.Mesh(rodGeometry([x2 + 0.0005, h * 0.55, 0], [x3, h * 0.55, 0], G.handleR * 0.52, 24), materials.brass));
    tilt.add(fer);
    // mushroom handle (lathe profile along +Y, turned to run along -X)
    const prof = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const r = G.handleR * (0.5 + 0.5 * Math.sin(Math.min(1, u * 1.35) * Math.PI * 0.5)) * (u > 0.82 ? Math.sqrt(Math.max(0, 1 - ((u - 0.82) / 0.18) ** 2)) : 1);
      prof.push(new THREE.Vector2(Math.max(0.0004, r), u * G.handleLen));
    }
    const hg = new THREE.LatheGeometry(prof, 28);
    hg.rotateZ(Math.PI / 2);
    hg.translate(x3, h * 0.55, 0);
    const hm = materials.handle.clone();
    hm.map = woodTexture({ size: 256, boards: 1, seed: 5, grainFreq: 8, grainWarp: 1, contrast: 0.3, dark: "#9a5c2c", mid: "#bd7d45", light: "#d39a5e", seam: "#9a5c2c" });
    tilt.add(shadow(new THREE.Mesh(hg, hm)));
    root.userData.tilt = tilt;
    return root;
  }

  // ---------------------------------------------------------------- lino curls (one instanced mesh)
  function chipGeometry() {
    const C = spec.chip, N = 44, pos = [], idx = [];
    const turns = C.turns;
    for (let i = 0; i <= N; i++) {
      const u = i / N, th = u * turns * Math.PI * 2, r = C.r * (1 - 0.55 * u);
      const x = -r * Math.sin(th), y = C.r - r * Math.cos(th);
      const wv = C.width * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
      pos.push(x, y, -wv / 2, x, y, wv / 2);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function chips(plan) {
    const n = plan.strokes.length;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.cOut = { value: col(LS.top) }; sh.uniforms.cIn = { value: col(LS.cut) };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 cOut, cIn;")
        .replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb = mix(cIn, cOut, float(gl_FrontFacing));");
    };
    mat.customProgramCacheKey = () => "linocut-chip";
    const m = new THREE.InstancedMesh(chipGeometry(), mat, n);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    m.name = "chips";
    return m;
  }

  // ---------------------------------------------------------------- brayer (roller): origin on the axle, drum along Z
  function roller() {
    const R = spec.roller;
    const g = new THREE.Group(); g.name = "roller";
    const drumTex = canvasTexture(paintPixels([512, 64], (u, v) => {
      const s = 0.55 * valueNoise2(u * 40, v * 3, 51, 40) + 0.45 * valueNoise2(u * 160, v * 9, 52, 160);
      return [s, s, s];
    }), { srgb: false });
    const drumMat = materials.rubber.clone();
    drumMat.roughnessMap = drumTex; drumMat.roughness = 0.55;
    const drum = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R.r, R.r, R.len, 64, 1), drumMat));
    drum.rotation.x = Math.PI / 2;
    const spin = new THREE.Group(); spin.add(drum); g.add(spin);
    for (const z of [-1, 1]) {
      const hub = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R.r * 0.42, R.r * 0.42, 0.004, 24), materials.steel));
      hub.rotation.x = Math.PI / 2; hub.position.z = z * (R.len / 2 + 0.002);
      g.add(hub);
    }
    // bent steel frame: from both axle ends up and back to a crossbar, then the handle (trailing to -X)
    const zE = R.len / 2 + 0.006, A = [-0.032, 0.05, 0.018];
    const rods = [
      [[0, 0, zE], [0, 0.012, zE]], [[0, 0.012, zE], [A[0], A[1], A[2]]],
      [[0, 0, -zE], [0, 0.012, -zE]], [[0, 0.012, -zE], [A[0], A[1], -A[2]]],
      [[A[0], A[1], A[2]], [A[0], A[1], -A[2]]],
      [[A[0], A[1], 0], [A[0] - 0.012, A[1] + 0.009, 0]],
    ];
    for (const [a, b] of rods) g.add(shadow(new THREE.Mesh(rodGeometry(a, b, R.frame, 10), materials.steel)));
    const hd = [-1 * 0.707, 0.707, 0];
    const h0 = [A[0] - 0.012, A[1] + 0.009, 0], h1 = [h0[0] + hd[0] * R.handleLen, h0[1] + hd[1] * R.handleLen, 0];
    const hm = materials.handle.clone();
    g.add(shadow(new THREE.Mesh(rodGeometry(h0, h1, R.handleR, 20), hm)));
    const cap = shadow(new THREE.Mesh(new THREE.SphereGeometry(R.handleR * 1.02, 20, 12), hm));
    cap.position.set(...h1); g.add(cap);
    g.userData.spin = spin;
    return g;
  }

  // ---------------------------------------------------------------- baren: dark lacquered disc, bamboo face, knot handle
  function baren() {
    const B = spec.barenShape;
    const g = new THREE.Group(); g.name = "baren";
    const disc = shadow(new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 0.985, B.h, 64), materials.baren));
    disc.position.y = B.h / 2; g.add(disc);
    const face = shadow(new THREE.Mesh(new THREE.CylinderGeometry(B.r * 0.9, B.r * 0.9, 0.0016, 64), materials.bamboo));
    face.position.y = B.h + 0.0008; g.add(face);
    const knot = shadow(new THREE.Mesh(new THREE.TorusGeometry(B.r * 0.36, 0.0045, 12, 40), materials.bamboo));
    knot.rotation.y = Math.PI / 2; knot.position.y = B.h + 0.0016 + B.r * 0.2; knot.scale.set(1, 0.62, 1);
    g.add(knot);
    const bar = shadow(new THREE.Mesh(rodGeometry([-B.r * 0.62, B.h + 0.003, 0], [B.r * 0.62, B.h + 0.003, 0], 0.004, 12), materials.bamboo));
    g.add(bar);
    return g;
  }

  // ---------------------------------------------------------------- paper (curl + hinge + present in the vertex shader)
  const PAPER_GLSL = /* glsl */ `
uniform float uHinge, uRise, uFoldS, uCurlR, uPW, uPH;
uniform vec2 uFoldN;
uniform mat4 uPM;
varying vec2 vQ;
vec3 paperPos(vec2 q) {
  vec3 p = vec3(q.x, 0.0, q.y);
  float d = dot(q, uFoldN) - uFoldS;
  if (d > 0.0) {
    float th = d / uCurlR;
    vec2 f = q - uFoldN * d;
    if (th < 3.14159265) { p.xz = f + uFoldN * (uCurlR * sin(th)); p.y = uCurlR * (1.0 - cos(th)); }
    else { p.xz = f - uFoldN * (d - 3.14159265 * uCurlR); p.y = 2.0 * uCurlR; }
  }
  float zp = p.z + 0.5 * uPH, c = cos(uHinge), s = sin(uHinge);
  p = vec3(p.x, p.y * c + zp * s, -p.y * s + zp * c - 0.5 * uPH);
  p.y += uRise;
  return (uPM * vec4(p, 1.0)).xyz;
}`;
  function paper(plan, U) {
    const PA = plan.cfg.paper;
    const geo = new THREE.PlaneGeometry(PA.w, PA.h, 132, 102);
    geo.rotateX(-Math.PI / 2); // local (qx, 0, qz), front face up
    const fib = paperTexture({ size: 512, base: "#ffffff", fiber: 0.09, grain: 0.05, seed: 19, variant: "even" });
    fib.wrapS = fib.wrapT = THREE.RepeatWrapping; fib.colorSpace = THREE.NoColorSpace;
    U.uFibre = { value: fib };
    const vtx = (sh) => sh
      .replace("#include <common>", `#include <common>\n${PAPER_GLSL}`)
      .replace("#include <beginnormal_vertex>", `vec2 q0 = position.xz;
  vec3 P0 = paperPos(q0);
  vec3 objectNormal = normalize(cross(paperPos(q0 + vec2(0.0, 0.0015)) - P0, paperPos(q0 + vec2(0.0015, 0.0)) - P0));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif`)
      .replace("#include <begin_vertex>", "vec3 transformed = P0;\n  vQ = q0;");
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = vtx(sh.vertexShader);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
uniform sampler2D uCarve, uAux, uRub, uFibre;
uniform float uT, uPW, uPH, uBW, uBH, inkMax, inkMin, uSpeck, uGhost, uTrSoft;
uniform vec3 cPaper, cPInk;
varying vec2 vQ;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
  vec2 buv = vec2(vQ.x / uBW + 0.5, -vQ.y / uBH + 0.5);
  float inB = step(0.0, buv.x) * step(buv.x, 1.0) * step(0.0, buv.y) * step(buv.y, 1.0);
  vec4 cc = textureLod(uCarve, clamp(buv, 0.0, 1.0), 0.0);
  float ink = (1.0 - smoothstep(inkMin, inkMax, max(cc.y, cc.w) * 0.001)) * inB;
  float rubT = textureLod(uRub, vec2(vQ.x / uPW + 0.5, -vQ.y / uPH + 0.5), 0.0).r;
  float tr = smoothstep(rubT, rubT + uTrSoft, uT);
  vec4 ax = textureLod(uAux, clamp(buv, 0.0, 1.0), 0.0);
  float speck = smoothstep(0.73, 0.8, ax.r) * smoothstep(0.55, 0.85, ax.g) * uSpeck;
  float fibre = texture2D(uFibre, vQ * 3.0 + 0.5).r;
  vec3 pc = cPaper * (0.93 + 0.09 * fibre);
  vec3 printSide = mix(pc, cPInk, ink * tr * (1.0 - speck));
  vec3 topSide = pc * (1.0 - uGhost * ink * tr);
  float front = float(gl_FrontFacing);
  diffuseColor.rgb = mix(printSide, topSide, front);
  float inkHere = ink * tr * (1.0 - front);`)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.92, 0.7, inkHere);");
    };
    mat.customProgramCacheKey = () => "linocut-paper";
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    // the depth shader has no normal chunk outside #ifdef USE_DISPLACEMENTMAP: deform in begin_vertex only
    dm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>\n${PAPER_GLSL}`)
        .replace("#include <begin_vertex>", "vec3 transformed = paperPos(position.xz);\n  vQ = position.xz;");
    };
    dm.customProgramCacheKey = () => "linocut-paper-depth";
    m.customDepthMaterial = dm;
    m.position.y = TOP + 0.0007;
    m.name = "paper";
    return m;
  }

  // ---------------------------------------------------------------- overlay caption: one plate; old line rolls out up, new rolls in
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      const font = `${Q.weight} ${Math.round(Q.cap * 1.38)}px ${Q.font}`;
      x.font = font;
      const pad = Math.round(Q.cap * 0.62), bar = 10;
      const wOf = (s) => (s ? Math.round(x.measureText(s).width) : 0);
      const wa = wOf(st.a), wb = wOf(st.b), e = st.u;
      const tw = Math.round(lerp(wa, wb, e));
      const pw = Math.min(W - 14, bar + pad + tw + pad), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = Q.shadow; x.beginPath(); x.roundRect(ox + 3, oy + 6, pw, ph, 10); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill();
      x.fillStyle = Q.accent; x.beginPath(); x.roundRect(ox, oy, bar, ph, [10, 0, 0, 10]); x.fill();
      x.save();
      x.beginPath(); x.rect(ox + bar, oy + 3, pw - bar - 3, ph - 6); x.clip();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      const cy = oy + Math.round(ph / 2) + 2, tx = ox + bar + pad;
      if (st.a && e < 1) x.fillText(st.a, tx, cy - Math.round(e * ph));
      if (st.b) x.fillText(st.b, tx, cy + Math.round((1 - e) * ph));
      x.restore();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    /** show(prev, text, u): u = 0 shows prev, 1 shows text; in between prev rolls up and out while text rolls in */
    mesh.userData.show = (a, b, u) => {
      const q = Math.round(clamp(u) * 48) / 48; // 48 roll steps: identical canvas for identical (a, b, q)
      mesh.userData.set(q >= 1 ? { a: "", b, u: 1 } : { a, b, u: +ease.inOutCubic(q).toFixed(4) });
      mesh.userData.opacity(1);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- everything, from one plan
  /**
   * linocutBench(plan, { present: { pos, tilt, yaw } }) -> { group, block, gouge, chips, roller, paper, baren, uniforms, update(t) }
   *   present.pos: paper centre offset (world, from its rest on the block) when facing the camera; tilt: lean back (rad);
   *   yaw: turn about +Y (rad). Adds itself to the scene.
   */
  function linocutBench(plan, o = {}) {
    const group = new THREE.Group(); group.name = "linocut";
    group.add(bench());
    const carve = carveTexture(plan), aux = auxTexture(), rub = rubTexture(plan);
    const U = {
      uCarve: { value: carve }, uAux: { value: aux }, uRub: { value: rub },
      uT: { value: 0 }, uSoft: { value: LS.frontSoft }, uInkFront: { value: -1 },
      uTexel: { value: new THREE.Vector2(1 / BK.bakeX, 1 / BK.bakeY) }, uSize: { value: new THREE.Vector2(BK.w, BK.h) },
      cTop: { value: col(LS.top) }, cCut: { value: col(LS.cut) }, cCutDeep: { value: col(LS.cutDeep) }, cInk: { value: col(IS.color) },
      uMottle: { value: LS.mottle }, rTop: { value: LS.roughTop }, rCut: { value: LS.roughCut }, rInk: { value: IS.rough }, rInkVar: { value: IS.roughVar },
      inkMax: { value: IS.inkMaxDepth }, inkMin: { value: IS.inkMinDepth }, streakN: { value: IS.streakNormal }, uNormalGain: { value: LS.normalGain }, uAO: { value: LS.ao },
      // paper
      uHinge: { value: 0 }, uRise: { value: 0 }, uFoldS: { value: 1 }, uCurlR: { value: 0.03 }, uFoldN: { value: new THREE.Vector2(1, 0) },
      uPM: { value: new THREE.Matrix4() }, uPW: { value: plan.cfg.paper.w }, uPH: { value: plan.cfg.paper.h }, uBW: { value: BK.w }, uBH: { value: BK.h },
      uSpeck: { value: PS.speck }, uGhost: { value: PS.ghost }, uTrSoft: { value: PS.transferSoft }, cPaper: { value: col(PS.paper) }, cPInk: { value: col(PS.ink) },
    };
    const blk = block(plan, U); group.add(blk);
    const gg = gouge(); group.add(gg);
    const ch = chips(plan); group.add(ch);
    const rl = roller(); group.add(rl);
    const pp = paper(plan, U); group.add(pp);
    const br = baren(); group.add(br);
    stage.scene.add(group);

    // paper fold geometry
    const PA = plan.cfg.paper;
    const fn = new THREE.Vector2(PA.w, PA.h).normalize();
    const sMax = 0.5 * (PA.w * fn.x + PA.h * fn.y) + 0.002;
    U.uFoldN.value.copy(fn);
    const pres = o.present ?? { pos: [-0.2, 0.12, 0.1], tilt: 0.5, yaw: 0 };
    const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, -1).normalize(), Math.PI);
    const qT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pres.yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pres.tilt))
      .multiply(qFlip);
    const qI = new THREE.Quaternion(), qN = new THREE.Quaternion(), vP = new THREE.Vector3(), vS = new THREE.Vector3(1, 1, 1);
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3();
    const chipBenchY = (s) => spec.chip.r * s * 0.95;

    function update(t) {
      U.uT.value = t;
      U.uInkFront.value = plan.inkFront(t);
      // gouge
      const tl = plan.toolAt(t);
      gg.visible = tl.visible;
      gg.position.set(tl.x, TOP - tl.dig * plan.cfg.clear.depth * 0.62 + tl.lift, -tl.y);
      gg.rotation.set(0, tl.yaw, 0);
      // chips
      for (let i = 0; i < plan.strokes.length; i++) {
        const c = plan.chipAt(i, t);
        if (!c) { tmpM.makeScale(0, 0, 0); ch.setMatrixAt(i, tmpM); continue; }
        const sz = c.size * (c.flying > 0 ? 1 : 0.3 + 0.7 * c.grow);
        let y;
        if (c.flying <= 0) y = TOP + 0.0006;
        else { const e = ease.inQuad(c.flying); y = lerp(TOP + 0.0006, chipBenchY(c.size), e) + 4 * c.flying * (1 - c.flying) * 0.045; }
        tmpE.set(c.flying > 0 ? c.roll + c.flying * 2.4 : 0, c.yaw, c.flying > 0 ? -c.flying * 3.1 : 0, "YXZ");
        tmpQ.setFromEuler(tmpE);
        tmpV.set(sz, sz, sz);
        // riding chips sit just behind the cutting edge
        const back = c.flying > 0 ? 0 : 0.003;
        tmpM.compose(new THREE.Vector3(c.x - Math.cos(c.yaw) * back, y, -c.y + Math.sin(c.yaw) * back), tmpQ, tmpV);
        ch.setMatrixAt(i, tmpM);
      }
      ch.instanceMatrix.needsUpdate = true;
      // roller
      const r = plan.rollerAt(t);
      rl.visible = r.visible;
      rl.position.set(r.x, TOP + spec.roller.r + r.lift, 0);
      rl.userData.spin.rotation.z = r.spin;
      // paper
      const pa = plan.paperAt(t);
      pp.visible = pa.visible;
      U.uHinge.value = pa.hinge;
      U.uRise.value = pa.rise;
      U.uCurlR.value = pa.curlR;
      const span = 2 * sMax;
      U.uFoldS.value = lerp(sMax - pa.fold * span, sMax + 0.004, pa.flatten);
      qN.copy(qI).slerp(qT, pa.present);
      vP.set(pres.pos[0] * pa.present, pres.pos[1] * pa.present + Math.sin(Math.PI * pa.present) * 0.05, pres.pos[2] * pa.present);
      U.uPM.value.compose(vP, qN, vS);
      // baren
      const b = plan.barenAt(t);
      br.visible = b.visible;
      br.position.set(b.x, TOP + 0.0014 + b.lift, -b.y);
      br.rotation.y = b.spin;
    }
    return { group, block: blk, gouge: gg, chips: ch, roller: rl, paper: pp, baren: br, uniforms: U, carve, update };
  }

  const props = { bench, block, gouge, chips, roller, baren, paper, caption, linocutBench };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: lino, motion: lino, top: TOP,
  };
}
