// styles/guilloche/style.js — "Guilloche": a rose engine engraving a silver dial. The look lives in spec.js; WHEN and
// WHERE every ring is cut, what the dials say and when the enamel flows live in guilloche.js (THREE-free planner shared
// with SCORE). This file turns a plan into pictures:
//   - disc(): ONE MeshPhysicalMaterial (metal + clear coat) whose fragment shader, per pixel, finds the nearby cut rings
//     from the closed form r_k(θ) = R_k + a·w(θ) (same formula as the planner), takes the deepest V-groove (union of
//     cuts, antialiased ridges), tilts the normal by the groove wall and lowers roughness on the bright-cut walls. Only
//     the arc already swept by the graver exists on the ring being cut (round ends). Enamel: a wavy front, a tint that
//     deepens with groove depth, and the clear coat + bead switched on behind the front.
//   - chuck with 8 clamp screws, polished hub, bench, a brass post + slide arm + carriage + steel graver, a swarf curl,
//     a brass box with two dials (canvas faces baked once) and an overlay caption chip.
// Props never animate themselves: the scene calls engine.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { studioEnvironment } from "../../kit/studio.js";
import { newCanvas, canvas2d } from "../../kit/canvas.js";
import { uploadTexture } from "../../kit/textures.js";
import { clamp } from "../../kit/time.js";
import * as guilloche from "./guilloche.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const studio = studioEnvironment(stage, spec.studio, { lights: {} });
  const DK = spec.disc, CU = spec.cutter, GR = spec.groove, EN = spec.enamel, LB = spec.lightBar;
  const Y0 = DK.top;
  /** world [x, z] of a point at radius r, world angle phi (CCW seen from above, 0 = +X) */
  const polar = (r, phi) => [r * Math.cos(phi), -r * Math.sin(phi)];

  // ---------------------------------------------------------------- bench
  function bench(o = {}) {
    const size = o.size ?? 16;
    const mat = materials.bench;
    if (mat.bumpMap) mat.bumpMap.repeat.set(size / 2.5, size / 2.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "bench";
    return m;
  }

  // ---------------------------------------------------------------- the silver disc (the shader is the style)
  /**
   * disc(plan) -> Mesh (the disc's top face) with userData.update(state):
   *   state = { theta, cut: {done, cur, arc, seam}, design: {nA, nB, b, s}, enamel: 0..1 }
   */
  function disc(plan) {
    const lay = plan.lay;
    const w = GR.width * lay.dR;
    const NC = Math.ceil((2 * (lay.aMax + w)) / lay.dR) + 2;
    const mat = new THREE.MeshPhysicalMaterial({
      color: P.silver, metalness: 1, roughness: GR.roughFlat, clearcoat: 1, clearcoatRoughness: EN.clearcoatRoughness, envMapIntensity: 1,
    });
    mat.name = "guillocheDisc";
    const U = {
      uTheta: { value: 0 },
      uCut: { value: new THREE.Vector4(0, -1, 0, 0) },
      uDesign: { value: new THREE.Vector4(8, 9, 0, 0.45) },
      uRings: { value: new THREE.Vector4(lay.r0, lay.dR, lay.amp, lay.ampPow) },
      uGroove: { value: new THREE.Vector4(w, GR.slope, GR.tip, lay.ampRef) },
      uOcc: { value: GR.occlusion },
      uRough: { value: new THREE.Vector4(GR.roughCut, GR.roughFlat, GR.detail[0], GR.detail[1]) },
      uRough2: { value: new THREE.Vector2(GR.aaTip, GR.aaRidge) },
      uAMax: { value: lay.aMax },
      uEnamel: { value: new THREE.Vector4(-9, EN.edge, EN.bead, EN.wobble) },
      uEnDir: { value: new THREE.Vector2(...EN.dir).normalize() },
      uSigma: { value: new THREE.Vector3(...EN.sigma) },
      uEnDepth: { value: new THREE.Vector2(EN.base, EN.grooveDepth) },
      uBar: { value: new THREE.Vector4(-9, LB.width, 0, 0) },
      uBarDir: { value: new THREE.Vector2(...LB.dir).normalize() },
      uBarK: { value: new THREE.Vector2(LB.gloss, LB.glint) },
      uBarColor: { value: new THREE.Color(LB.color) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vDisc; varying vec3 vTX; varying vec3 vTY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDisc = position.xy;\nvTX = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);\nvTY = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
#define GNC ${NC}
uniform float uTheta, uAMax, uOcc;
uniform vec4 uCut, uDesign, uRings, uGroove, uRough, uEnamel;
uniform vec2 uRough2;
uniform vec2 uEnDir, uEnDepth, uBarDir, uBarK;
uniform vec4 uBar;
uniform vec3 uBarColor;
uniform vec3 uSigma;
varying vec2 vDisc; varying vec3 vTX; varying vec3 vTY;
vec2 gGrad; float gCut; float gDepth; float gDetail; float gEnamel; vec2 gBead; float gPx;
// groove field at disc point P (m); fp = pixel footprint (m). Same closed form as guilloche.js ringRadius().
void guillocheField(vec2 P, float fp) {
  float r = max(length(P), 1e-4);
  float th = atan(P.y, P.x) - uTheta;
  vec2 rh = P / r, thh = vec2(-rh.y, rh.x);
  float w = uGroove.x, slope = uGroove.y;
  float tipR = max(uGroove.z * w, uRough2.x * fp);
  float nRings = uCut.x + step(-0.5, uCut.y);
  float kStart = floor((r - uRings.x - uAMax - w) / uRings.y);
  float p1 = 0.0, p2 = 0.0; vec2 g1 = vec2(0.0), g2 = vec2(0.0);
  for (int i = 0; i < GNC; i++) {
    float fk = kStart + float(i);
    if (fk < -0.5 || fk > nRings - 0.5) continue;
    float Rk = uRings.x + fk * uRings.y;
    float ak = uRings.z * pow(Rk / uGroove.w, uRings.w);
    float ph = fk * uDesign.w;
    float aA = uDesign.x * th + ph, aB = uDesign.y * th + ph;
    float f = ak * mix(sin(aA), sin(aB), uDesign.z);
    float df = ak * mix(uDesign.x * cos(aA), uDesign.y * cos(aB), uDesign.z);
    float q = df / r;
    float nr = sqrt(1.0 + q * q);
    float d = (r - Rk - f) / nr;
    vec2 gd = (rh - q * thh) / nr;
    float e = 0.0; vec2 ge = vec2(0.0);
    if (abs(fk - uCut.y) < 0.5) {
      float beta = mod(uCut.w - th, 6.28318530718);
      if (beta > uCut.z) {
        float e1 = (beta - uCut.z) * r, e2 = (6.28318530718 - beta) * r;
        if (e1 < e2) { e = e1; ge = -thh; } else { e = e2; ge = thh; }
      }
    }
    float dd = sqrt(d * d + e * e);
    vec2 gdd = (d * gd + e * ge) / max(dd, 1e-7);
    float sq = sqrt(dd * dd + tipR * tipR);
    float p = 1.0 - (sq - tipR) / w;
    vec2 g = slope * (dd / sq) * gdd;
    if (p > p1) { p2 = p1; g2 = g1; p1 = p; g1 = g; } else if (p > p2) { p2 = p; g2 = g; }
  }
  float fpP = uRough2.y * fp / w;
  float wr = smoothstep(0.0, fpP, p1 - p2);
  gPx = w / max(fp, 1e-7);
  gDetail = smoothstep(uRough.z, uRough.w, gPx);
  gGrad = mix(0.5 * (g1 + g2), g1, wr) * gDetail;
  gCut = smoothstep(0.0, fpP, p1);
  gDepth = clamp(p1, 0.0, 1.0);
  // enamel: a wavy front moving along uEnDir; 1 behind it
  float along = dot(P, uEnDir), perp = dot(P, vec2(-uEnDir.y, uEnDir.x));
  float fr = uEnamel.x + uEnamel.w * (0.55 * sin(perp * 2.3 + 0.7) + 0.3 * sin(perp * 5.9 + 2.1) + 0.15 * sin(perp * 13.0));
  gEnamel = 1.0 - smoothstep(fr - uEnamel.y, fr, along);
  float bx = (along - (fr - 0.9 * uEnamel.y)) / (0.7 * uEnamel.y);
  float bead = exp(-bx * bx);
  gBead = uEnDir * (uEnamel.z * bx * bead);
  gEnamel = max(gEnamel, bead * step(-8.0, uEnamel.x) * step(uEnamel.x, 8.0)); // the rolling bead is clear-coated too
}`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec2 fw = fwidth(vDisc);
  guillocheField(vDisc, max(fw.x, fw.y));
  vec3 tint = exp(-uSigma * (uEnDepth.x + uEnDepth.y * gDepth));
  // groove-bottom occlusion grows with the groove's size on screen: close-ups read as a cut channel, wide shots stay light
  float occ = uOcc * mix(0.6, 1.9, smoothstep(5.0, 16.0, gPx));
  diffuseColor.rgb *= mix(vec3(1.0), tint, gEnamel) * (1.0 - occ * gDepth * gDepth * gDetail);
}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(uRough.y, uRough.x, gCut) + (1.0 - gDetail) * 0.18;`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
normal = normalize(normal - gGrad.x * vTX - gGrad.y * vTY);`)
        .replace("#include <clearcoat_normal_fragment_maps>", `#include <clearcoat_normal_fragment_maps>
clearcoatNormal = normalize(clearcoatNormal - gBead.x * vTX - gBead.y * vTY);`)
        .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
material.clearcoat *= gEnamel;`)
        .replace("#include <opaque_fragment>", `{
  // the light bar: a soft band gliding over the dial; a sheen on the glossy enamel + a brighter glint on the cut walls
  float bx = (dot(vDisc, uBarDir) - uBar.x) / uBar.y;
  float band = uBar.z * exp(-bx * bx);
  float wall = clamp(length(gGrad) / uGroove.y, 0.0, 1.0);
  outgoingLight += band * uBarColor * (uBarK.x * gEnamel + uBarK.y * diffuseColor.rgb * (0.25 + 0.75 * wall));
}
#include <opaque_fragment>`);
    };
    const geo = new THREE.CircleGeometry(DK.radius, DK.segments);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = Y0;
    mesh.receiveShadow = true; mesh.name = "disc";
    mesh.userData.uniforms = U;
    mesh.userData.update = (st) => {
      U.uTheta.value = ((st.theta % TAU) + TAU) % TAU;
      U.uCut.value.set(st.cut.done, st.cut.cur, st.cut.arc, ((st.cut.seam % TAU) + TAU) % TAU);
      U.uDesign.value.set(st.design.nA, st.design.nB, st.design.b, st.design.s);
      // enamel front travels across the whole disc (with margin for the wobble and the edge)
      const m = DK.radius + EN.wobble + EN.edge + 0.05;
      U.uEnamel.value.x = st.enamel <= 0 ? -9 : st.enamel >= 1 ? 9 : -m + 2 * m * st.enamel;
      const bar = st.bar ?? { u: 0, level: 0 }, bm = DK.radius + 3 * LB.width;
      U.uBar.value.x = -bm + 2 * bm * bar.u; U.uBar.value.z = LB.level * bar.level;
    };
    return mesh;
  }

  // ---------------------------------------------------------------- chuck, rim, hub, screws
  function chuck() {
    const C = DK.chuck, g = new THREE.Group(); g.name = "chuck";
    const body = new THREE.Mesh(new THREE.CylinderGeometry(C.radius, C.radius + 0.03, C.height, 160), materials.brassSatin);
    body.position.y = C.height / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(C.radius - 0.004, 0.008, 10, 160), materials.brass);
    lip.rotation.x = Math.PI / 2; lip.position.y = C.height; g.add(lip);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(DK.radius, DK.radius, DK.thickness, DK.segments, 1, true), materials.silverRim);
    rim.position.y = Y0 - DK.thickness / 2; g.add(rim);
    // rotating parts: clamp screws (8-fold, like the pattern) and the hub
    const rot = new THREE.Group(); rot.name = "chuckRot"; g.add(rot);
    const headGeo = new THREE.SphereGeometry(0.03, 20, 10, 0, TAU, 0, Math.PI / 2);
    const slotGeo = new THREE.BoxGeometry(0.05, 0.012, 0.008);
    const slotMat = new THREE.MeshStandardMaterial({ color: "#3a3f44", roughness: 0.6, metalness: 0.6 });
    for (let i = 0; i < C.screws; i++) {
      const a = (i / C.screws) * TAU + Math.PI / C.screws;
      const [x, z] = polar((DK.radius + C.radius) / 2 + 0.002, a);
      const head = new THREE.Mesh(headGeo, materials.steel);
      head.scale.y = 0.55; head.position.set(x, C.height, z); head.castShadow = true; rot.add(head);
      const slot = new THREE.Mesh(slotGeo, slotMat);
      slot.position.set(x, C.height + 0.014, z); slot.rotation.y = a; rot.add(slot);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(DK.hub * 0.82, DK.hub, 0.035, 64), materials.steel);
    hub.position.y = Y0 + 0.0175; hub.castShadow = true; rot.add(hub);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DK.hub * 0.55, 40, 16, 0, TAU, 0, Math.PI / 2), materials.brass);
    dome.scale.y = 0.45; dome.position.y = Y0 + 0.035; rot.add(dome);
    g.userData.setTheta = (th) => { rot.rotation.y = th; };
    return g;
  }

  // ---------------------------------------------------------------- cutter: post, slide arm, carriage, graver, swarf
  /** cutterArm() -> Group; userData.update({ r, lift, swing, cutting, curl, spin }) poses everything */
  function cutterArm() {
    const g = new THREE.Group(); g.name = "cutterArm";
    const [px, pz] = polar(CU.postR, CU.phi);
    const armTop = Y0 + CU.armY;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, armTop + 0.04, 40), materials.brass);
    post.position.set(px, (armTop + 0.04) / 2, pz); post.castShadow = true; g.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 48), materials.brassSatin);
    foot.position.set(px, 0.02, pz); foot.castShadow = true; foot.receiveShadow = true; g.add(foot);
    const pivot = new THREE.Group(); pivot.position.set(px, armTop, pz); g.add(pivot);
    const armLen = CU.postR - 0.12;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(armLen + 0.08, 0.035, 0.05), materials.brass);
    rail.position.set(-(armLen + 0.08) / 2 + 0.04, 0, 0); rail.castShadow = true; pivot.add(rail);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 40), materials.brassSatin);
    cap.castShadow = true; pivot.add(cap);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12), materials.darkSteel);
    knob.position.y = 0.05; pivot.add(knob);
    // carriage: slides along the rail (local -X), holds the graver
    const car = new THREE.Group(); pivot.add(car);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.09), materials.brassSatin);
    block.castShadow = true; car.add(block);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), materials.steel);
    screw.rotation.x = Math.PI / 2; screw.position.set(0, 0.012, 0.06); car.add(screw);
    const tool = new THREE.Group(); car.add(tool);
    const shankLen = CU.armY - 0.035;
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.026, shankLen, 0.026), materials.steel);
    shank.position.y = -shankLen / 2 + 0.02; shank.castShadow = true; tool.add(shank);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0185, 0.05, 4), materials.steel);
    tip.rotation.y = Math.PI / 4; tip.rotation.x = Math.PI; tip.position.y = -CU.armY + 0.025; tip.castShadow = true; tool.add(tip);
    // swarf: a bright helical curl growing from the tip (draw range = how much is visible)
    const SW = spec.swarf, pts = [];
    for (let i = 0; i <= 120; i++) {
      const u = i / 120, a = u * SW.turns * TAU, rr = SW.radius * (0.35 + 0.65 * u);
      pts.push(new THREE.Vector3(-0.012 + u * SW.length * 0.35 + rr * Math.cos(a), 0.004 + u * SW.length * 0.6 + rr * Math.sin(a) * 0.6, 0.02 + u * SW.length * 0.55 + rr * Math.sin(a)));
    }
    const swGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, SW.wire, 6, false);
    const swarf = new THREE.Mesh(swGeo, materials.steel);
    swarf.castShadow = true;
    const swarfHolder = new THREE.Group(); swarfHolder.position.y = -CU.armY; swarfHolder.add(swarf); tool.add(swarfHolder);
    const perSeg = 6 * 6;
    g.userData.update = (st) => {
      pivot.rotation.y = CU.phi + st.swing * CU.swing;
      car.position.x = -(CU.postR - st.r);
      tool.position.y = st.lift * CU.lift;
      const n = Math.round(clamp(st.curl) * 120);
      swarf.visible = n > 0;
      swGeo.setDrawRange(0, n * perSeg);
      swarfHolder.rotation.y = st.spin;
      swarf.position.y = -st.drop * 0.06; // the curl drops off when the work is done
    };
    return g;
  }

  // ---------------------------------------------------------------- the dial box (two brass dials, faces baked once)
  function dialFace(kind) {
    const S = 512, c = newCanvas(S, S), x = canvas2d(c);
    const D = spec.dials;
    x.fillStyle = P.dialFace; x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, TAU); x.fill();
    x.strokeStyle = "#c9bc9c"; x.lineWidth = 6; x.beginPath(); x.arc(S / 2, S / 2, S * 0.47, 0, TAU); x.stroke();
    const [a0, a1] = D.sweep;
    const ticks = kind === "n" ? D.nRange[1] - D.nRange[0] : 12;
    x.strokeStyle = P.dialInk; x.lineCap = "round";
    for (let i = 0; i <= ticks; i++) {
      const u = i / ticks, ang = a0 + (a1 - a0) * u; // canvas: angle measured like the pointer (0 = up, + = clockwise)
      const big = kind === "n" ? (i % 4 === 0) : (i % 4 === 0);
      const r0 = S * (big ? 0.31 : 0.35), r1 = S * 0.43;
      x.lineWidth = big ? 9 : 5;
      x.beginPath(); x.moveTo(S / 2 + Math.sin(ang) * r0, S / 2 - Math.cos(ang) * r0); x.lineTo(S / 2 + Math.sin(ang) * r1, S / 2 - Math.cos(ang) * r1); x.stroke();
    }
    // icon in the lower half: dial "n" = a lobed ring; dial "s" = two waves shifted against each other
    x.strokeStyle = P.dialInk; x.lineWidth = 7; x.lineJoin = "round";
    const cx = S / 2, cy = S * 0.7;
    if (kind === "n") {
      x.beginPath();
      for (let i = 0; i <= 160; i++) { const a = (i / 160) * TAU, rr = S * (0.085 + 0.022 * Math.sin(8 * a)); const X = cx + rr * Math.cos(a), Y = cy + rr * Math.sin(a); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
      x.closePath(); x.stroke();
    } else {
      for (const [dy, ph, col] of [[-S * 0.03, 0, P.dialInk], [S * 0.03, 1.2, P.pointer]]) {
        x.strokeStyle = col; x.beginPath();
        for (let i = 0; i <= 80; i++) { const u = i / 80, X = cx - S * 0.13 + u * S * 0.26, Y = cy + dy + Math.sin(u * TAU * 1.5 + ph) * S * 0.025; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
        x.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    uploadTexture(stage, tex);
    return tex;
  }
  /** dialBox() -> Group of two brass dial pedestals; userData.update({ n, s }) turns the pointers (dial units) */
  function dialBox() {
    const D = spec.dials, PD = D.pedestal, g = new THREE.Group(); g.name = "dials";
    const pointers = [];
    [["n", D.pos[0]], ["s", D.pos[1]]].forEach(([kind, [px, pz]]) => {
      const ped = new THREE.Group(); ped.position.set(px, 0, pz); g.add(ped);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(PD.r, PD.r + 0.02, PD.h, 64), materials.brassSatin);
      base.position.y = PD.h / 2; base.castShadow = true; base.receiveShadow = true; ped.add(base);
      const x = 0, Bh = PD.h;
      const bez = new THREE.Mesh(new THREE.TorusGeometry(D.radius, 0.014, 12, 64), materials.brass);
      bez.rotation.x = Math.PI / 2; bez.position.set(x, Bh + 0.004, 0); bez.castShadow = true; ped.add(bez);
      const face = new THREE.Mesh(new THREE.CircleGeometry(D.radius, 64), new THREE.MeshStandardMaterial({ map: dialFace(kind), roughness: 0.55, metalness: 0 }));
      face.rotation.x = -Math.PI / 2; face.position.set(x, Bh + 0.002, 0); face.receiveShadow = true; ped.add(face);
      const pv = new THREE.Group(); pv.position.set(x, Bh + 0.012, 0); ped.add(pv);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.008, D.radius * 0.86), materials.pointer);
      needle.position.z = -D.radius * 0.4; needle.castShadow = true; pv.add(needle);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, D.radius * 0.22), materials.darkSteel);
      tail.position.z = D.radius * 0.12; pv.add(tail);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 24), materials.brass);
      knob.position.y = 0.02; knob.castShadow = true; pv.add(knob);
      const kc = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16), materials.darkSteel);
      kc.position.y = 0.05; pv.add(kc);
      pointers.push([kind, pv]);
    });
    const ang = (v, lo, hi) => D.sweep[0] + (D.sweep[1] - D.sweep[0]) * clamp((v - lo) / (hi - lo));
    g.userData.update = (st) => {
      for (const [kind, pv] of pointers) {
        // the canvas face is seen from above with -Z up: a pointer rotation of -a (about +Y) points to canvas angle a
        pv.rotation.y = -(kind === "n" ? ang(st.n, ...D.nRange) : ang(st.s, ...D.sRange));
      }
    };
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (deep-teal plate, brass edge + a wavy-ring icon, cream text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.42)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.52);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(5,20,20,0.35)"; x.beginPath(); x.roundRect(ox + 3, oy + 8, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 13); x.stroke();
      const cx = ox + pad + ic / 2, cy = oy + ph / 2; // icon: a wavy ring
      x.strokeStyle = Q.icon; x.lineWidth = 3.5; x.beginPath();
      for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU, rr = ic * (0.36 + 0.07 * Math.sin(8 * a)); const X = cx + rr * Math.cos(a), Y = cy + rr * Math.sin(a); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
      x.closePath(); x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * roseEngine(plan) -> { group, disc, chuck, arm, dials, update(t) } (adds itself to the scene)
   *   update(t): disc angle, cut state and design from the plan; graver radius/lift/swing; swarf; dial pointers;
   *   enamel front; the studio light sweep.
   */
  function roseEngine(plan) {
    const group = new THREE.Group(); group.name = "roseEngine";
    group.add(bench());
    const ch = chuck(); group.add(ch);
    const dc = disc(plan); group.add(dc);
    const arm = cutterArm(); group.add(arm);
    const dials = dialBox(); group.add(dials);
    stage.scene.add(group);
    const dN = plan.dials.n, dS = plan.dials.s;
    const ts0 = plan.ts[0], end = plan.cutEnd;
    return {
      group, disc: dc, chuck: ch, arm, dials,
      update(t) {
        const theta = plan.Theta(t);
        const cut = plan.cutAt(t), design = plan.designAt(t), en = plan.enamelAt(t);
        const sw = plan.sweepAt(t);
        dc.userData.update({ theta, cut, design, enamel: en, bar: sw });
        ch.userData.setTheta(theta);
        const c = plan.cutterAt(t);
        // swarf: grows during ring 0, stays while cutting, drops off when the work is done
        const curl = clamp((t - ts0) / 1.6) * (1 - clamp((t - end - 0.25) / 0.35));
        arm.userData.update({ r: c.r, lift: c.lift, swing: c.swing, curl, spin: plan.apparent(t) * 0.5, drop: clamp((t - end) / 0.5) });
        dials.userData.update({ n: dN ? dN.pointer(t) : plan.nGear, s: dS ? dS.pointer(t) : plan.cfg.s0 });
        studio.set({ level: 1 }); // static: memoised, never re-baked (the light bar is drawn by the disc shader)
      },
    };
  }

  const props = { bench, disc, chuck, cutterArm, dialBox, caption, roseEngine };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: guilloche, motion: guilloche, studio, polar,
  };
}
