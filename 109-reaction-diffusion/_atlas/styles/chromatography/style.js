// styles/chromatography/style.js — "Chromatography". The look lives in spec.js; WHEN the front climbs and WHERE each
// dye is lives in chromaplan.js (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   - the strip: one material (MeshStandard + injected GLSL): code-baked fibre texture, damp region + tide line under a
//     wobbly solvent front, dye bands as soft Gaussians that subtract light per RGB channel (Beer–Lambert),
//   - bench, tiled wall, glass jar + solvent, clamp stand + arm, steel rule, binder clips, felt pen, drying rack with
//     two finished strips, and an overlay caption chip.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fresnelGlass, GLSL_SAFE } from "../../kit/materials.js";
import { newCanvas, canvasTexture } from "../../kit/textures.js";
import { rng } from "../../kit/time.js";
import * as chromaplan from "./chromaplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const MAX_DYES = 4;

const STRIP_COMMON = /* glsl */ `
${GLSL_SAFE}
#define MAX_DYES ${MAX_DYES}
uniform vec4 uDyeA[MAX_DYES];   // u, v, sigmaU, sigmaV (m)
uniform vec4 uDyeB[MAX_DYES];   // absorbance r, g, b, amplitude
uniform vec4 uDyeC[MAX_DYES];   // crisp exponent, tail, origin v, -
uniform vec4 uFront;            // front v (-1 = dry), solvent v (-1 = not dipped), tide, wetness
uniform vec4 uPaperK;           // 1/tile, fibre contrast, wobble, wet roughness
uniform vec3 uPaperCol;
uniform vec4 uEdge;            // half width, length, edge darkening, edge width
uniform vec3 uWetCol;
uniform vec3 uSoakCol;
uniform sampler2D uFibre;
varying vec2 vStrip;
float gWet;
`;
const STRIP_APPLY = /* glsl */ `
#include <map_fragment>
{
  vec2 sp = vStrip;
  vec3 fib = texture2D(uFibre, sp * uPaperK.x).rgb;          // r fibre tone, g formation, b fine noise
  vec3 fib2 = texture2D(uFibre, sp * uPaperK.x * 0.23 + vec2(0.37, 0.61)).rgb;
  vec3 paper = uPaperCol * (1.0 - uPaperK.y * (1.0 - fib.r));
  // ---- damp region under the solvent front (front wobbles with the paper's formation)
  float hasFront = step(-0.5, uFront.x);
  float fv = uFront.x + uPaperK.z * (fib2.g - 0.5) * 2.0;
  float wet = hasFront * (1.0 - smoothstep(fv - 0.006, fv + 0.002, sp.y));
  float tide = hasFront * exp(-pow((sp.y - fv + 0.002) / 0.0035, 2.0)) * uFront.z;
  float fresh = hasFront * exp(-max(fv - sp.y, 0.0) / 0.05) * wet;  // just behind the front: most solvent
  float soak = step(-0.5, uFront.y) * (1.0 - smoothstep(uFront.y - 0.004, uFront.y + 0.004, sp.y));
  vec3 wetMul = mix(vec3(1.0), uWetCol, wet * uFront.w * (0.75 + 0.25 * fib2.g)) * (1.0 - 0.06 * fresh * uFront.w);
  wetMul = mix(wetMul, uSoakCol, soak);
  wetMul *= 1.0 - tide;
  gWet = max(wet * uFront.w, soak);
  // ---- dyes: soft Gaussians + a faint streak back to the origin; absorbance summed, light subtracted
  vec3 A = vec3(0.0);
  for (int i = 0; i < MAX_DYES; i++) {
    vec4 a = uDyeA[i];
    vec4 b = uDyeB[i];
    vec4 c = uDyeC[i];
    vec2 d = (sp - a.xy) / max(a.zw, vec2(1e-4));
    float q = dot(d, d) * (1.0 + 0.1 * (fib.b - 0.5));
    float g = exp(-0.5 * safePow(q, c.x));
    float du = (sp.x - a.x) / max(a.z * 0.75, 1e-4);
    float span = max(a.y - c.z, 1e-4);
    float along = clamp((sp.y - c.z) / span, 0.0, 1.0);
    float inTail = smoothstep(c.z - 0.012, c.z + 0.006, sp.y) * (1.0 - smoothstep(a.y - 1.5 * a.w, a.y, sp.y));
    float tail = c.y * inTail * exp(-0.5 * du * du) * (0.35 + 0.65 * along) * smoothstep(0.0, 0.05, span);
    A += b.rgb * b.w * (g + tail) * (0.85 + 0.3 * fib.g) * (1.0 + 0.5 * (1.0 - fib.r));
  }
  vec3 trans = exp(-A);
  float eD = min(uEdge.x - abs(sp.x), min(sp.y, uEdge.y - sp.y));
  float edge = uEdge.z * (1.0 - smoothstep(0.0, uEdge.w, eD));
  diffuseColor.rgb = paper * wetMul * trans * (1.0 - edge);
}
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadowed = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  // ---------------------------------------------------------------- fibre texture (baked once, seeded)
  /** fibreTexture() -> tileable CanvasTexture: r = fibre tone, g = formation (cloudy) noise, b = fine noise */
  function fibreTexture(seed = 104) {
    const N = 512, cv = newCanvas(N, N), x = cv.getContext("2d");
    const R = rng(seed);
    // r channel: fibres (short curved strokes), wrapped so the tile is seamless
    const fib = newCanvas(N, N), fx = fib.getContext("2d");
    fx.fillStyle = "#fff"; fx.fillRect(0, 0, N, N);
    fx.lineCap = "round";
    for (let i = 0; i < spec.paper.fibres; i++) {
      const px = R.next() * N, py = R.next() * N, a = R.next() * Math.PI, len = R.range(5, 22), bend = R.range(-0.5, 0.5);
      const dark = R.chance(0.7);
      fx.strokeStyle = dark ? `rgba(0,0,0,${R.range(0.05, 0.16).toFixed(3)})` : `rgba(255,255,255,${R.range(0.2, 0.5).toFixed(3)})`;
      fx.lineWidth = R.range(0.6, 1.6);
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        const sx = px + ox, sy = py + oy;
        if (sx < -30 || sx > N + 30 || sy < -30 || sy > N + 30) continue;
        fx.beginPath();
        fx.moveTo(sx - Math.cos(a) * len / 2, sy - Math.sin(a) * len / 2);
        fx.quadraticCurveTo(sx + Math.sin(a) * bend * len * 0.3, sy - Math.cos(a) * bend * len * 0.3, sx + Math.cos(a) * len / 2, sy + Math.sin(a) * len / 2);
        fx.stroke();
      }
    }
    const fibData = fx.getImageData(0, 0, N, N).data;
    // g: formation noise (periodic value noise, 6 cells), b: fine noise (32 cells)
    const lattice = (cells, s) => { const r2 = rng(s); return Array.from({ length: cells * cells }, () => r2.next()); };
    const L6 = lattice(6, seed + 1), L3 = lattice(3, seed + 3), L32 = lattice(32, seed + 2);
    const vn = (Lt, cells, u, v) => {
      const X = u * cells, Y = v * cells, xi = Math.floor(X), yi = Math.floor(Y), fxx = X - xi, fyy = Y - yi;
      const g = (i, j) => Lt[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
      const sx = fxx * fxx * (3 - 2 * fxx), sy = fyy * fyy * (3 - 2 * fyy);
      return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy;
    };
    const img = x.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4, u = i / N, v = j / N;
      img.data[k] = fibData[k];
      img.data[k + 1] = Math.round(255 * (0.6 * vn(L6, 6, u, v) + 0.4 * vn(L3, 3, u, v)));
      img.data[k + 2] = Math.round(255 * vn(L32, 32, u, v));
      img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const tex = canvasTexture(cv, { srgb: false });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const fibreTex = fibreTexture();

  // ---------------------------------------------------------------- strip material
  /** stripMaterial() -> MeshStandardMaterial with the chromatography shader; userData.chroma.set(dyes, front, solvent, wetness) */
  function stripMaterial() {
    const PK = spec.paper;
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: materials.paper.roughness, metalness: 0, side: THREE.DoubleSide });
    const U = {
      uDyeA: { value: Array.from({ length: MAX_DYES }, () => new THREE.Vector4(0, -10, 1, 1)) },
      uDyeB: { value: Array.from({ length: MAX_DYES }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uDyeC: { value: Array.from({ length: MAX_DYES }, () => new THREE.Vector4(1, 0, 0, 0)) },
      uFront: { value: new THREE.Vector4(-1, -1, PK.tide, 1) },
      uPaperK: { value: new THREE.Vector4(1 / PK.tile, PK.fibre, PK.wobble, PK.wetRough) },
      uPaperCol: { value: new THREE.Color(P.paper) },
      uEdge: { value: new THREE.Vector4(spec.strip.W / 2, spec.strip.L, PK.edge ?? 0, PK.edgeW ?? 0.004) },
      uWetCol: { value: new THREE.Color(PK.wet) },
      uSoakCol: { value: new THREE.Color(PK.soaked) },
      uFibre: { value: fibreTex },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aStrip;\nvarying vec2 vStrip;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStrip = aStrip;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + STRIP_COMMON)
        .replace("#include <map_fragment>", STRIP_APPLY)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uPaperK.w, gWet);");
    };
    mat.customProgramCacheKey = () => "chromatography-strip-2";
    const setDyes = (dyes) => {
      for (let i = 0; i < MAX_DYES; i++) {
        const d = dyes[i];
        if (!d) { U.uDyeB.value[i].set(0, 0, 0, 0); U.uDyeA.value[i].set(0, -10, 1, 1); continue; }
        const ab = spec.dyes[d.name];
        U.uDyeA.value[i].set(d.u, d.v, d.su, d.sv);
        U.uDyeB.value[i].set(ab[0], ab[1], ab[2], d.amp);
        U.uDyeC.value[i].set(d.crisp, d.tail, d.origin, 0);
      }
    };
    mat.userData.chroma = {
      uniforms: U,
      set(dyes, front, solvent, wetness = 1) {
        setDyes(dyes);
        U.uFront.value.set(front ?? -1, solvent ?? -1, spec.paper.tide, wetness);
      },
    };
    return mat;
  }

  // ---------------------------------------------------------------- strip mesh
  /** strip() -> Group with origin at the strip's TOP centre (where the clip holds it); child mesh carries the shader */
  function strip(o = {}) {
    const S = spec.strip, g = new THREE.Group(); g.name = o.name ?? "strip";
    const geo = new THREE.PlaneGeometry(S.W, S.L, S.segW, S.segL);
    geo.translate(0, -S.L / 2, 0);
    const pos = geo.attributes.position, st = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, S.bow * (1 - (2 * x / S.W) ** 2)); // slight curl across the width so light reads the paper
      st[2 * i] = x; st[2 * i + 1] = y + S.L;
    }
    geo.setAttribute("aStrip", new THREE.BufferAttribute(st, 2));
    geo.computeVertexNormals();
    const mat = stripMaterial();
    const mesh = shadowed(new THREE.Mesh(geo, mat)); mesh.name = "paper";
    g.add(mesh);
    const c = clip(); g.add(c);
    g.userData.material = mat;
    g.userData.chroma = mat.userData.chroma;
    return g;
  }

  // ---------------------------------------------------------------- small props
  /** clip() -> binder clip + S-hook, origin at the strip top centre; hook top at y = clip.h + clip.hook */
  function clip() {
    const C = spec.clip, g = new THREE.Group(); g.name = "clip";
    const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(C.w, C.h, C.d), materials.clip));
    body.position.set(0, C.h * 0.25, 0); g.add(body);
    const jaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(C.w * 1.02, C.h * 0.14, C.d * 1.08), materials.clip));
    jaw.position.set(0, -C.h * 0.22, 0); g.add(jaw);
    for (const s of [-1, 1]) {
      const wire = shadowed(new THREE.Mesh(new THREE.TorusGeometry(C.w * 0.28, C.wire, 8, 28, Math.PI), materials.steel));
      wire.position.set(0, C.h * 0.7, s * C.d * 0.5); wire.rotation.y = s * 0.25; g.add(wire);
    }
    const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(C.hook * 0.45, C.wire * 1.1, 8, 24), materials.steel));
    hook.position.set(0, C.h * 0.75 + C.hook * 0.45 + C.w * 0.28 - 0.01, 0); hook.rotation.y = Math.PI / 2; g.add(hook);
    return g;
  }
  /** bench() + wall() -> Group: grey resin bench with a darker front edge, white tiled wall */
  function room() {
    const B = spec.bench, Wl = spec.wall, g = new THREE.Group(); g.name = "room";
    const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.w, B.thick, B.d), materials.bench), false, true);
    top.position.set(0, -B.thick / 2, B.front - B.d / 2); g.add(top);
    const edge = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.w, 0.05, 0.02), materials.benchEdge), false, true);
    edge.position.set(0, -B.thick - 0.02, B.front - 0.01); g.add(edge);
    const wm = materials.wall;
    if (wm.map) { wm.map.wrapS = wm.map.wrapT = THREE.RepeatWrapping; wm.map.repeat.set(Wl.w / (Wl.tile * 4), Wl.h / (Wl.tile * 4)); }
    const wall = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(Wl.w, Wl.h), wm), false, true);
    wall.position.set(0, Wl.h / 2 - B.thick, Wl.z); g.add(wall);
    return g;
  }
  /** jar() -> Group: short wide glass jar with a little clear solvent (fresnel glass, no transmission pass) */
  function jar() {
    const J = spec.jar, g = new THREE.Group(); g.name = "jar";
    const glass = fresnelGlass({ ...spec.glass });
    const solv = fresnelGlass({ ...spec.solventGlass });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(J.r, J.r, J.h - J.base, J.segments, 1, true), glass);
    wall.position.y = J.base + (J.h - J.base) / 2; wall.renderOrder = 4; g.add(wall);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(J.r - J.glass, J.r - J.glass, J.h - J.base, J.segments, 1, true), glass);
    inner.position.y = wall.position.y; inner.renderOrder = 3; g.add(inner);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(J.r, J.r * 0.98, J.base, J.segments), glass);
    base.position.y = J.base / 2; base.renderOrder = 2; g.add(base);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(J.r - J.glass / 2, J.glass * 0.6, 10, J.segments), glass);
    lip.rotation.x = Math.PI / 2; lip.position.y = J.h; lip.renderOrder = 4; g.add(lip);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(J.r - J.glass * 1.1, J.r - J.glass * 1.1, J.solventY - J.base, J.segments, 1, false), solv);
    liq.position.y = J.base + (J.solventY - J.base) / 2; liq.renderOrder = 1; g.add(liq);
    const meniscus = new THREE.Mesh(new THREE.TorusGeometry(J.r - J.glass * 1.6, 0.004, 8, J.segments), solv);
    meniscus.rotation.x = Math.PI / 2; meniscus.position.y = J.solventY + 0.002; meniscus.renderOrder = 1; g.add(meniscus);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(J.r * 1.06, J.segments), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.08, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; g.add(shadow);
    return g;
  }
  /** stand() -> { group, arm }: clamp stand behind the jar; arm (a Group at the arm's height) reaches over the jar centre */
  function stand() {
    const S = spec.stand, g = new THREE.Group(); g.name = "stand";
    const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(...S.base), materials.darkSteel));
    base.position.set(0, S.base[1] / 2, S.z - 0.02); g.add(base);
    const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(S.rodR, S.rodR, S.rodH, 20), materials.steel));
    rod.position.set(0, S.rodH / 2, S.z); g.add(rod);
    const arm = new THREE.Group(); arm.name = "arm"; g.add(arm);
    const boss = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.boss, S.boss, S.boss), materials.darkSteel));
    boss.position.set(0, 0, S.z); arm.add(boss);
    const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 12), materials.steel));
    screw.rotation.z = Math.PI / 2; screw.position.set(-S.boss * 0.75, 0, S.z); arm.add(screw);
    const len = -S.z + 0.04;
    const bar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(S.armR, S.armR, len, 16), materials.steel));
    bar.rotation.x = Math.PI / 2; bar.position.set(0, 0, S.z + len / 2); arm.add(bar);
    return { group: g, arm };
  }
  /** rule() -> steel rule (ticks every rule.tick m, no numerals), origin at its top centre */
  function rule() {
    const R = spec.rule, H = 2048, Wp = 96;
    const cv = newCanvas(Wp, H), x = cv.getContext("2d");
    const grd = x.createLinearGradient(0, 0, Wp, 0);
    grd.addColorStop(0, "#d9dee3"); grd.addColorStop(0.5, "#eef1f3"); grd.addColorStop(1, "#cfd5da");
    x.fillStyle = grd; x.fillRect(0, 0, Wp, H);
    x.fillStyle = "#2a2f35";
    const n = Math.round(R.len / R.tick);
    for (let i = 0; i <= n; i++) {
      const y = H - (i * R.tick / R.len) * H;
      const L = i % 10 === 0 ? 0.62 : i % 5 === 0 ? 0.44 : 0.26;
      x.fillRect(0, Math.round(y) - 2, Math.round(Wp * L), i % 10 === 0 ? 5 : 3);
    }
    const tex = canvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = materials.rule.clone(); mat.map = tex;
    const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.len, R.thick), [materials.steel, materials.steel, materials.steel, materials.steel, mat, materials.steel]));
    m.position.y = -R.len / 2;
    const g = new THREE.Group(); g.name = "rule"; g.add(m);
    const hanger = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w * 0.6, R.top, 0.01), materials.darkSteel));
    hanger.position.y = R.top / 2 - 0.005; g.add(hanger);
    return g;
  }
  /** pen() -> felt-tip marker, origin at the nib tip; local +Y runs up the barrel. userData.aim(axis) */
  function pen() {
    const Pn = spec.pen, g = new THREE.Group(); g.name = "pen";
    const nib = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(Pn.nibR, Pn.nibR * 0.55, Pn.nibLen, 14), materials.nib));
    nib.position.y = Pn.nibLen / 2; g.add(nib);
    const cone = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(Pn.r * 0.85, Pn.nibR * 1.6, Pn.cone, 28), materials.penBand));
    cone.position.y = Pn.nibLen + Pn.cone / 2; g.add(cone);
    const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(Pn.r, Pn.r * 0.92, Pn.len, 32), materials.pen));
    body.position.y = Pn.nibLen + Pn.cone + Pn.len / 2; g.add(body);
    const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(Pn.r * 1.01, Pn.r * 1.01, Pn.len * 0.12, 32), materials.penBand));
    band.position.y = Pn.nibLen + Pn.cone + Pn.len * 0.3; g.add(band);
    const end = shadowed(new THREE.Mesh(new THREE.SphereGeometry(Pn.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), materials.pen));
    end.position.y = Pn.nibLen + Pn.cone + Pn.len; g.add(end);
    const up = new THREE.Vector3(0, 1, 0);
    g.userData.aim = (axis) => g.quaternion.setFromUnitVectors(up, new THREE.Vector3(...axis).normalize());
    return g;
  }
  /** rack(slots) -> drying rack: two uprights and a rod at rack.y; strips hang from it */
  function rack() {
    const R = spec.rack, g = new THREE.Group(); g.name = "rack";
    for (const x of [R.x0, R.x1]) {
      const up = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R.r * 1.2, R.r * 1.2, R.y + 0.04, 16), materials.steel));
      up.position.set(x, (R.y + 0.04) / 2, R.z); g.add(up);
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R.footR, R.footR * 1.1, 0.025, 28), materials.darkSteel));
      foot.position.set(x, 0.0125, R.z); g.add(foot);
    }
    const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R.r, R.r, R.x1 - R.x0, 16), materials.steel));
    rod.rotation.z = Math.PI / 2; rod.position.set((R.x0 + R.x1) / 2, R.y, R.z); g.add(rod);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (dark plate, three-band icon, light text) top-left; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const bands = [P.yellow, P.magenta, P.blue];
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.3)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), icW = Math.round(Q.h * 0.3), icH = Math.round(Q.h * 0.62);
      const pw = Math.min(W - 16, pad + icW + pad + tw + pad), ph = Q.h, oy = 6, ox = 6;
      x.fillStyle = "rgba(20,24,30,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      // icon: a tiny paper strip with three bands
      const ix = ox + pad, iy = oy + (ph - icH) / 2;
      x.fillStyle = P.paper; x.beginPath(); x.roundRect(ix, iy, icW, icH, 3); x.fill();
      bands.forEach((c, i) => { x.fillStyle = c; x.fillRect(ix + 3, iy + icH * (0.16 + i * 0.24), icW - 6, icH * 0.12); });
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ix + icW + pad, oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * bench(plan, { slots }) -> { group, strip, pen, update(t) } (adds itself to the scene)
   *   slots = [{ x, yTop, z }] rack positions for the finished strips (spec.finished, in order).
   */
  function labBench(plan, o = {}) {
    const group = new THREE.Group(); group.name = "chromatography";
    group.add(room(), jar(), rack());
    const st = stand(); group.add(st.group);
    const rl = rule(); rl.position.set(spec.rule.x, -0.04, 0); st.arm.add(rl);
    const S = strip({ name: "strip" }); group.add(S);
    const pn = pen(); group.add(pn);
    const done = (o.slots ?? []).map((slot, i) => {
      const f = spec.finished[i];
      const s = strip({ name: `finished-${i}` });
      s.position.set(slot.x, slot.yTop, slot.z);
      s.userData.chroma.set(chromaplan.finishedDyes(f.ink, { dotV: spec.strip.dotV, frontV: f.frontV, spread: spec.spread }), f.frontV, -1, 0.0);
      group.add(s);
      return s;
    });
    stage.scene.add(group);
    return {
      group, strip: S, pen: pn, stand: st, finished: done,
      update(t) {
        st.arm.position.y = plan.stripPose(Math.min(t, plan.t.stop)).top[1] + plan.clipDrop;
        const ps = plan.stripPose(t);
        S.position.set(...ps.top); S.rotation.z = ps.sway * 0.25; S.rotation.x = -ps.sway * 0.35;
        S.userData.chroma.set(plan.dyesAt(t), plan.front(t), plan.solventV(t), plan.wetness(t));
        const pp = plan.penAt(t);
        pn.visible = pp.visible; pn.position.set(...pp.tip); pn.userData.aim(pp.axis);
      },
    };
  }

  const props = { strip, stripMaterial, fibreTexture, clip, room, jar, stand, rule, pen, rack, caption, labBench };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: chromaplan, motion: chromaplan,
  };
}
