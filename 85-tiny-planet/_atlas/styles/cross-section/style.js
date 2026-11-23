// styles/cross-section/style.js — "Cross-Section": a technical-illustration cutaway where a slicing plane does the
// revealing. The look lives in spec.js; WHAT is cut WHEN lives in slice.js (THREE-free planner shared with SCORE).
// How the cut is made solid (no stencil buffer, no clipping-plane state, one program per kind):
//   - every solid of the model is an analytic primitive (box / capsule / hollow shell). The MESHES (instanced boxes and
//     cylinders, a rounded shell, the cavity walls) discard their fragments on the removed side of the plane;
//   - the CUT FACES are ONE quad lying in the plane. Its fragment shader walks the same primitive list as signed
//     distance functions: a pixel inside a solid gets that solid's flat cut colour (shell: hatched), a pixel near any
//     solid's boundary gets the ink outline (distance measured IN the plane, so grazing faces do not flood with ink).
//     So the cut is exact for every plane position and tilt, embedded parts (neurons, cores) exist only on the cut
//     face, and a frame costs one extra draw call.
// Everything is unlit and written straight in sRGB (tone mapping "none"): palette colours reach the screen exactly.
// Props never animate themselves: the scene calls set*/show from renderAt with values that are pure functions of t.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas, getOverlay, projectToScreen } from "../../kit/overlay.js";
import { clamp } from "../../kit/time.js";
import * as slice from "./slice.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const NP = 80; // capacity of the cut-face primitive list
const v3 = (hex) => new THREE.Vector3(...slice.hexRgb(hex));

const COMMON = /* glsl */ `
uniform vec3 uN; uniform float uD; uniform vec3 uO;   // plane: dot(p - uO, uN) = uD; the kept half is <= uD
uniform vec3 uP1; uniform vec3 uP2;                   // two signal pulses: x, width, amp
uniform vec2 uFocus;                                  // focus group, dim amount
float xsSide(vec3 w) { return dot(w - uO, uN) - uD; }
vec3 xsStyle(vec3 col, float group, float wx) {
  float isPart = step(0.5, group);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float off = isPart * step(0.5, uFocus.x) * step(0.5, abs(group - uFocus.x));
  col = mix(col, mix(vec3(lum), vec3(0.42), 0.35), off * uFocus.y);   // non-focus: toward its own grey mid-tone
  float a = (wx - uP1.x) / uP1.y, b = (wx - uP2.x) / uP2.y;
  float p = max(exp(-a * a) * uP1.z, exp(-b * b) * uP2.z) * isPart;
  return mix(col, vec3(1.0), p);
}`;

const PART_VS = /* glsl */ `
attribute vec3 iC; attribute vec3 iH; attribute vec3 iCol; attribute vec3 iInfo; attribute vec3 iAxis;
varying vec3 vW; varying vec3 vL; varying vec3 vN; varying vec3 vH; varying vec3 vCol; varying vec3 vInfo;
void main() {
  vec3 ax = iAxis;
  vec3 up = abs(ax.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 bz = normalize(cross(ax, up));
  vec3 by = cross(bz, ax);
  mat3 R = mat3(ax, by, bz);
  vec3 l = position * iH * iInfo.z;
  vec3 w = iC + R * l;
  vW = w; vL = l; vH = iH * iInfo.z; vCol = iCol; vInfo = iInfo;
  vN = R * (normal / max(iH, vec3(1e-4)));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const PART_FS = /* glsl */ `
${COMMON}
uniform vec4 uTone; uniform vec3 uShade; uniform vec3 uInk; uniform vec3 uInkP;
varying vec3 vW; varying vec3 vL; varying vec3 vN; varying vec3 vH; varying vec3 vCol; varying vec3 vInfo;
void main() {
  vec3 fw = fwidth(vW);
  float px = max(fw.x, max(fw.y, fw.z));
  float side = xsSide(vW);
  if (vInfo.y > 0.5 && side > 0.0) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 n2 = n * n;
  float tone = n2.y * (n.y > 0.0 ? uTone.x : uTone.w) + n2.z * uTone.y + n2.x * uTone.z;
  vec3 col = xsStyle(vCol, vInfo.x, vW.x);
  col = mix(col, vec3(1.0), uShade.x * n2.y * step(0.0, n.y)) * tone;
  col *= mix(1.0, uShade.z, clamp(-side / uShade.y, 0.0, 1.0) * vInfo.y);   // deeper behind the plane = quieter
  float e = 1e3;
#ifndef CYL
  vec3 dd = vH - abs(vL);
  vec3 an = abs(n);
  e = min(mix(dd.x, 1e3, step(0.5, an.x)), min(mix(dd.y, 1e3, step(0.5, an.y)), mix(dd.z, 1e3, step(0.5, an.z))));
#endif
  e = min(e, mix(1e3, -side, vInfo.y));
  float w = max(uInkP.x, uInkP.z * px);
  float ink = 1.0 - smoothstep(w - px, w + px, e);
  col = mix(col, uInk, ink * uInkP.y);
  gl_FragColor = vec4(col, 1.0);
}`;

const SHELL_VS = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SHELL_FS = /* glsl */ `
${COMMON}
uniform vec3 uShell; uniform vec3 uShellHi; uniform vec4 uLook; uniform vec3 uLight;
varying vec3 vW; varying vec3 vN;
void main() {
  if (xsSide(vW) > 0.0) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float top = max(n.y, 0.0);
  float fres = 1.0 - clamp(dot(n, v), 0.0, 1.0);
  float sp = clamp(dot(n, normalize(normalize(uLight) + v)), 0.0, 1.0);
  float k = top * top * uLook.z + fres * fres * fres * uLook.w + pow(sp, uLook.x) * uLook.y;
  gl_FragColor = vec4(mix(uShell, uShellHi, clamp(k, 0.0, 1.0)), 1.0);
}`;

const PLANE_VS = /* glsl */ `
uniform vec3 uN; uniform float uD; uniform vec3 uO; uniform vec3 uU; uniform vec3 uV; uniform vec2 uHalf; uniform float uEps;
varying vec3 vW; varying vec2 vUV;
void main() {
  vUV = position.xy * uHalf;
  vec3 w = uO + uN * (uD + uEps) + uU * vUV.x + uV * vUV.y;
  vW = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const CAP_FS = /* glsl */ `
#define NP ${NP}
${COMMON}
uniform vec4 uPA[NP]; uniform vec4 uPB[NP]; uniform vec4 uPC[NP]; uniform int uCount;
uniform vec3 uShC; uniform vec3 uShH; uniform vec3 uShR;   // shell centre, half size, (outer round, inner round, wall)
uniform vec3 uInk; uniform vec2 uInkP; uniform vec3 uHatch; uniform vec2 uHatchP;
varying vec3 vW; varying vec2 vUV;
// signed distance + its gradient for a rounded box
vec4 sdgBox(vec3 p, vec3 h, float r) {
  vec3 q = abs(p) - h + r;
  vec3 s = vec3(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0, p.z < 0.0 ? -1.0 : 1.0);
  float m = max(q.x, max(q.y, q.z));
  vec3 qp = max(q, 0.0);
  float l = length(qp);
  vec3 gi = vec3(q.x >= m ? 1.0 : 0.0, (q.y >= m && q.x < m) ? 1.0 : 0.0, (q.z >= m && q.x < m && q.y < m) ? 1.0 : 0.0);
  vec3 g = m > 0.0 ? qp / max(l, 1e-6) : gi;
  return vec4(s * g, (m > 0.0 ? l : m) - r);
}
vec4 sdgCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  vec3 q = pa - ba * h;
  float l = length(q);
  return vec4(q / max(l, 1e-6), l - r);
}
void main() {
  vec2 fw = fwidth(vUV);
  float px = max(fw.x, fw.y);
  float w = max(uInkP.x, uInkP.y * px);
  vec4 outer = sdgBox(vW - uShC, uShH, uShR.x);
  if (outer.w > w + px) discard;            // everything that can be cut lives inside the shell
  vec3 col = vec3(0.0);
  float meta = 0.0, hit = 0.0, lineD = 1e3;
  for (int i = 0; i < NP; i++) {
    if (i >= uCount) break;
    vec4 A = uPA[i], B = uPB[i];
    vec4 g;
    if (A.w < 0.5) g = sdgBox(vW - A.xyz, B.xyz, B.w);
    else if (A.w < 1.5) g = sdgCapsule(vW, A.xyz, B.xyz, B.w);
    else {
      vec4 o = sdgBox(vW - A.xyz, B.xyz, B.w);
      vec4 c = sdgBox(vW - A.xyz, B.xyz - uShR.z, uShR.y);
      g = (-c.w > o.w) ? vec4(-c.xyz, -c.w) : o;
    }
    float gn = dot(g.xyz, uN);
    float inPlane = abs(g.w) / max(sqrt(max(1.0 - gn * gn, 0.0)), 0.06);   // distance to the boundary measured in the plane
    if (g.w < 0.0) { col = uPC[i].rgb; meta = uPC[i].w; hit = 1.0; lineD = inPlane; }
    else lineD = min(lineD, inPlane);
  }
  float ink = 1.0 - smoothstep(w - px, w + px, lineD);
  float alpha = max(hit, ink);
  if (alpha < 0.004) discard;
  float group = floor(meta + 0.01);
  float hatchOn = step(0.25, meta - group);
  float hs = abs(fract((vUV.x + vUV.y) * uHatchP.x) - 0.5) * 2.0;
  float hpx = px * uHatchP.x * 2.9;
  float hm = 1.0 - smoothstep(uHatchP.y - hpx, uHatchP.y + hpx, hs);
  col = mix(col, uHatch, hm * hatchOn);
  col = xsStyle(col, group, vW.x);
  col = mix(col, uInk, ink);
  gl_FragColor = vec4(col, alpha);
}`;

const SHEET_FS = /* glsl */ `
uniform vec2 uHalf; uniform vec3 uFrame; uniform vec3 uGlass; uniform vec4 uSheet; uniform float uAlpha;   // uSheet: frame width, fill, frame level, corner tick
varying vec3 vW; varying vec2 vUV;
void main() {
  vec2 fw = fwidth(vUV);
  float px = max(fw.x, fw.y);
  vec2 dd = uHalf - abs(vUV);
  float e = min(dd.x, dd.y);
  float w = max(uSheet.x, 1.4 * px);
  float frame = 1.0 - smoothstep(w - px, w + px, e);
  float tick = (1.0 - smoothstep(w * 2.4 - px, w * 2.4 + px, e)) * step(max(dd.x, dd.y), uSheet.w);   // heavier corners
  float f = max(frame, tick) * uSheet.z;
  float a = max(f, uSheet.y) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uGlass, uFrame, f / max(max(f, uSheet.y), 1e-4)), a);
}`;

const GROUND_VS = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FS = /* glsl */ `
uniform vec3 uPaper; uniform vec3 uGrid; uniform vec3 uShadowCol; uniform vec4 uFoot; uniform vec4 uGridP; uniform vec4 uFade; uniform vec4 uShadow;
varying vec3 vW;
float gridLine(vec2 p, float cell, float w, vec2 fw) {
  vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell;
  vec2 a = 1.0 - smoothstep(vec2(w) , vec2(w) + fw * 1.2, g);
  float thin = clamp(1.0 - max(fw.x, fw.y) / (cell * 0.22), 0.0, 1.0);   // fade before it turns to moire
  return max(a.x, a.y) * thin;
}
float sdRect(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = vW.xz;
  vec2 fw = fwidth(p);
  float far = 1.0 - smoothstep(uFade.x, uFade.y, length(p));
  float g = max(gridLine(p, uGridP.x, uGridP.z, fw) * uGridP.w, gridLine(p, uGridP.x * uGridP.y, uGridP.z * 1.6, fw) * uFade.z);
  vec3 col = mix(uPaper, uGrid, g * far);
  float tight = 1.0 - smoothstep(-0.06, 0.16, sdRect(p - uFoot.xy, uFoot.zw, 0.16));
  float soft = 1.0 - smoothstep(-0.2, uShadow.y, sdRect(p - uFoot.xy - uShadow.zw, uFoot.zw, 0.3));
  col = mix(col, uShadowCol, max(tight * 0.55, soft * uShadow.x));
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // uniforms shared by every material that knows about the plane / the signal / the focus
  const shared = {
    uN: { value: new THREE.Vector3(0, 0, 1) }, uD: { value: 1e3 }, uO: { value: new THREE.Vector3() },
    uP1: { value: new THREE.Vector3(-99, spec.pulse.width, 0) }, uP2: { value: new THREE.Vector3(-99, spec.pulse.width, 0) },
    uFocus: { value: new THREE.Vector2(0, 0) },
  };
  const planeU = { uU: { value: new THREE.Vector3(1, 0, 0) }, uV: { value: new THREE.Vector3(0, 1, 0) } };
  const partUniforms = () => ({
    ...shared,
    uTone: { value: new THREE.Vector4(spec.shade.top, spec.shade.front, spec.shade.side, spec.shade.bottom) },
    uShade: { value: new THREE.Vector3(spec.shade.topLift, spec.shade.fadeDist, spec.shade.fadeMin) },
    uInk: { value: v3(P.ink) }, uInkP: { value: new THREE.Vector3(spec.ink.width, spec.ink.level, spec.ink.minPx) },
  });
  const partMat = (o = {}) => new THREE.ShaderMaterial({ uniforms: partUniforms(), vertexShader: PART_VS, fragmentShader: PART_FS, defines: o.cyl ? { CYL: 1 } : {}, side: o.side ?? THREE.FrontSide });

  const unitBox = new THREE.BoxGeometry(2, 2, 2);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 2, 20, 1, false).rotateZ(-Math.PI / 2); // axis along +x

  /** batch(base, items, material): one instanced draw call. items: [{ c, h, color, group, clip, axis, scale }] */
  function batch(base, items, material) {
    const n = items.length;
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("normal", base.attributes.normal);
    const A = { iC: new Float32Array(n * 3), iH: new Float32Array(n * 3), iCol: new Float32Array(n * 3), iInfo: new Float32Array(n * 3), iAxis: new Float32Array(n * 3) };
    for (const k in A) g.setAttribute(k, new THREE.InstancedBufferAttribute(A[k], 3));
    g.instanceCount = n;
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    const set = (i, it) => {
      A.iC.set(it.c, i * 3); A.iH.set(it.h, i * 3); A.iCol.set(slice.hexRgb(it.color), i * 3);
      A.iInfo.set([it.group ?? 0, it.clip === false ? 0 : 1, it.scale ?? 1], i * 3); A.iAxis.set(it.axis ?? [1, 0, 0], i * 3);
    };
    items.forEach((it, i) => set(i, it));
    mesh.userData.set = (i, it) => { set(i, it); for (const k in A) g.attributes[k].needsUpdate = true; };
    return mesh;
  }

  // ---------------------------------------------------------------- the solid: clipped meshes + the cut-face quad
  /**
   * solid(model) -> Group. model = { prims, origin, shell } from slice.js (blackBoxModel or your own list).
   *   userData.setPlane(plane)            plane from slice.planeAt(keys, t, model.origin)
   *   userData.setSignal(pulses, focus, dim)   pulses = flow.pulses(t); focus = group id (0 = none); dim 0..1
   */
  function solid(model) {
    const G = new THREE.Group();
    const prims = model.prims;
    if (prims.length > NP) throw new Error(`cross-section: ${prims.length} solids, the cut face holds ${NP}`);
    const sh = model.shell;
    // shell outside
    const shellGeo = new RoundedBoxGeometry(sh.h[0] * 2, sh.h[1] * 2, sh.h[2] * 2, 5, sh.round);
    const L = spec.shellLook;
    const shellMesh = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({
      uniforms: { ...shared, uShell: { value: v3(P.shell) }, uShellHi: { value: v3(P.shellHi) }, uLook: { value: new THREE.Vector4(L.gloss, L.spec, L.top, L.fresnel) }, uLight: { value: new THREE.Vector3(...L.light) } },
      vertexShader: SHELL_VS, fragmentShader: SHELL_FS,
    }));
    shellMesh.position.set(...sh.c);
    G.add(shellMesh);
    // cavity walls (seen from inside)
    const inner = sh.h.map((x) => x - sh.wall);
    G.add(batch(unitBox, [{ c: sh.c, h: inner, color: P.cavity, group: 0 }], partMat({ side: THREE.BackSide })));
    // parts
    const boxes = prims.filter((p) => p.type === "box" && p.mesh);
    const caps = prims.filter((p) => p.type === "capsule" && p.mesh && (p.a[0] !== p.b[0] || p.a[1] !== p.b[1] || p.a[2] !== p.b[2]));
    if (boxes.length) G.add(batch(unitBox, boxes.map((p) => ({ c: p.c, h: p.h, color: p.color, group: p.group })), partMat()));
    if (caps.length) G.add(batch(unitCyl, caps.map((p) => {
      const d = [p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]], len = Math.hypot(...d);
      return { c: slice.centreOf(p), h: [len / 2, p.r, p.r], color: p.color, group: p.group, axis: d.map((x) => x / len) };
    }), partMat({ cyl: true })));

    // the cut faces: one quad in the plane, shaded from the primitive list
    const PA = new Float32Array(NP * 4), PB = new Float32Array(NP * 4), PC = new Float32Array(NP * 4);
    prims.forEach((p, i) => {
      if (p.type === "capsule") { PA.set([...p.a, 1], i * 4); PB.set([...p.b, p.r], i * 4); }
      else { PA.set([...p.c, p.type === "shell" ? 2 : 0], i * 4); PB.set([...p.h, p.round ?? 0], i * 4); }
      PC.set([...slice.hexRgb(p.cut ?? p.color), (p.group ?? 0) + (p.hatch ? 0.5 : 0)], i * 4);
    });
    const capU = {
      ...shared, ...planeU, uHalf: { value: new THREE.Vector2(1, 1) }, uEps: { value: 0.0006 },
      uPA: { value: PA }, uPB: { value: PB }, uPC: { value: PC }, uCount: { value: prims.length },
      uShC: { value: new THREE.Vector3(...sh.c) }, uShH: { value: new THREE.Vector3(...sh.h) }, uShR: { value: new THREE.Vector3(sh.round, sh.innerRound, sh.wall) },
      uInk: { value: v3(P.ink) }, uInkP: { value: new THREE.Vector2(spec.capInk.width, spec.capInk.minPx) },
      uHatch: { value: v3(P.hatch) }, uHatchP: { value: new THREE.Vector2(spec.hatch.freq, spec.hatch.duty) },
    };
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: capU, vertexShader: PLANE_VS, fragmentShader: CAP_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide }));
    cap.frustumCulled = false;
    cap.renderOrder = 2;
    G.add(cap);
    stage.scene.add(G);

    G.userData.setPlane = (plane) => {
      shared.uN.value.set(...plane.n); shared.uD.value = plane.d; shared.uO.value.set(...plane.origin);
      planeU.uU.value.set(...plane.u); planeU.uV.value.set(...plane.v);
      capU.uHalf.value.set(...slice.sheetHalf(sh.h, plane, 0.1));
      // nothing is cut while the plane is still in front of the whole shell: skip the cut-face pass
      cap.visible = plane.d < slice.support(sh, plane)[1] + 0.05;
    };
    G.userData.setSignal = (pulses, focus = 0, dim = 0) => {
      shared.uP1.value.set(pulses[0][0], spec.pulse.width, pulses[0][1] * spec.pulse.amp);
      shared.uP2.value.set(pulses[1][0], spec.pulse.width, pulses[1][1] * spec.pulse.amp);
      shared.uFocus.value.set(focus, clamp(dim) * spec.focus.dim);
    };
    return G;
  }

  /** sheet(model) -> Mesh: the visible slicing plane (thin frame, faint glass). userData.set(plane, alpha) */
  function sheet(model) {
    const Q = spec.sheet;
    const U = {
      ...shared, ...planeU, uHalf: { value: new THREE.Vector2(1, 1) }, uEps: { value: 0.004 },
      uFrame: { value: v3(P.sheet) }, uGlass: { value: v3(P.glass) }, uSheet: { value: new THREE.Vector4(Q.frame, Q.fill, Q.frameLevel, Q.tick) }, uAlpha: { value: 1 },
    };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANE_VS, fragmentShader: SHEET_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.renderOrder = 3;
    stage.scene.add(m);
    m.userData.set = (plane, alpha = 1) => { U.uHalf.value.set(...slice.sheetHalf(model.shell.h, plane, Q.margin)); U.uAlpha.value = alpha; m.visible = alpha > 0.003; };
    return m;
  }

  /** floaters(n) -> instanced unclipped boxes for things outside the solid. userData.set(i, { c, h, color, scale }) */
  function floaters(n) {
    const m = batch(unitBox, Array.from({ length: n }, () => ({ c: [0, -50, 0], h: [0.1, 0.1, 0.1], color: P.rail, clip: false, scale: 0 })), partMat());
    const set = m.userData.set;
    m.userData.set = (i, it) => set(i, { clip: false, group: 0, ...it, h: Array.isArray(it.h) ? it.h : [it.h, it.h, it.h] });
    stage.scene.add(m);
    return m;
  }

  /** ground(model) -> drafting paper with a fading grid and the solid's soft contact shadow. */
  function ground(model) {
    const Q = spec.ground, h = model.half;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: {
        uPaper: { value: v3(P.bg) }, uGrid: { value: v3(P.grid) }, uShadowCol: { value: v3(slice.mixHex(P.grid, P.ink, 0.45)) },
        uFoot: { value: new THREE.Vector4(model.origin[0], model.origin[2], h[0], h[2]) },
        uGridP: { value: new THREE.Vector4(Q.cell, Q.major, Q.line, Q.minor) }, uFade: { value: new THREE.Vector4(Q.fadeNear, Q.fadeFar, Q.majorLevel, 0) },
        uShadow: { value: new THREE.Vector4(Q.shadow, Q.shadowSoft, Q.shadowOffset[0], Q.shadowOffset[1]) },
      },
      vertexShader: GROUND_VS, fragmentShader: GROUND_FS,
    }));
    m.frustumCulled = false;
    stage.scene.add(m);
    return m;
  }

  // ---------------------------------------------------------------- overlay: caption chip + leader to a 3D anchor
  /**
   * caption() -> Mesh. userData.show(text, alpha, anchor?)
   *   One chip in one band at the bottom (exact colours, drawn after everything). With `anchor` ([x,y,z], world) the
   *   chip slides under the anchor's screen x (clamped) and a hairline + dot leads from the chip to it.
   */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o }, Ld = Q.leader;
    const Wp = 1200, Hp = Q.h + 8;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width), pad = 40, dot = 11;
      const pw = Math.min(W - 8, pad + dot * 2 + 22 + tw + pad), ph = Q.h, ox = Math.round((W - pw) / 2), oy = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      const cy = oy + ph / 2;
      x.fillStyle = Q.dot; x.beginPath(); x.arc(ox + pad + dot, cy, dot, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + dot * 2 + 22, cy + 2);
    }, { upload: true, willReadFrequently: true });
    const ov = getOverlay(stage);
    const mk = (geo, color, order) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false })); m.renderOrder = order; m.visible = false; ov.add(m); return m; };
    const quad = new THREE.PlaneGeometry(1, 1), disc = new THREE.CircleGeometry(1, 40);
    const lineHalo = mk(quad, Ld.halo2, 5), dotHalo = mk(disc, Ld.halo2, 6), line = mk(quad, Ld.color, 7), dotCore = mk(disc, Ld.color, 8);
    const topY = Q.y + Q.h / stage.height; // NDC y of the chip's top edge
    mesh.userData.show = (text, a, anchor = null) => {
      mesh.userData.set({ text });
      mesh.userData.opacity(a);
      let cx = 0;
      const on = !!anchor && a > 0.003 && !!text;
      let p = null;
      if (on) { p = projectToScreen(stage, anchor); cx = clamp(p.x, -Q.xMax, Q.xMax); }
      mesh.userData.place(((cx + 1) / 2) * stage.width - Wp / 2, ((1 - Q.y) / 2) * stage.height - Hp / 2);
      for (const m of [lineHalo, dotHalo, line, dotCore]) { m.visible = on; m.material.opacity = a; }
      if (!on) return;
      const A = ov.aspect, x0 = cx * A, y0 = topY - 0.004, x1 = p.x * A, y1 = p.y;
      const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      for (const [m, wd] of [[lineHalo, Ld.halo], [line, Ld.width]]) { m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = ang; m.scale.set(len, wd * 2, 1); }
      dotHalo.position.set(x1, y1, 0); dotHalo.scale.setScalar(Ld.dot + (Ld.halo - Ld.width));
      dotCore.position.set(x1, y1, 0); dotCore.scale.setScalar(Ld.dot);
    };
    return mesh;
  }

  const props = { solid, sheet, floaters, ground, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, props, sfx: spec.sfx, camera: spec.camera,
    factories: {},
    plan: slice,   // the Node-safe planner (planeAt, cutEvents, flowPlan, blackBoxModel, outside, onPlane ...)
  };
}
