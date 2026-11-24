// styles/string-art/style.js — "String Art": curve stitching on a nail board. The look lives in spec.js; WHICH nail joins
// WHICH nail and WHEN each thread is laid lives in winding.js (THREE-free planner shared with SCORE). This file turns a
// plan into pictures:
//   - an upright dark walnut-stained board (kit woodTexture, darkened palette) in a slim moulded frame, on a workshop wall;
//   - brass nails: two InstancedMeshes (shaft + head), a seeded hair of tilt each so the rows look hammered by hand;
//   - threads: ONE InstancedMesh of thin cylinders, each drawn from nail a toward nail b up to the plan's fraction at t,
//     per-instance colour, a little self-light so a thread in shadow keeps its hue; they cast thin shadows on the board;
//   - wraps: a small instanced ring round the nail shaft wherever a thread turns on (or starts at) a nail;
//   - needles: one per winder, a steel needle trailing its motion with a glowing bead of thread colour at the point;
//   - an overlay caption tag (exact colours, top-left).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture } from "../../kit/textures.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { hash01, clamp, ease } from "../../kit/time.js";
import * as winding from "./winding.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const B = spec.board, T = spec.thread, Nd = spec.needle, Nl = spec.nail;
  const colorOf = (name) => new THREE.Color(P[name] ?? name);

  // ---------------------------------------------------------------- board, frame, wall
  /** board() -> Group: the stained board (front face at z = 0), a slim frame, and the wall behind */
  function board() {
    const g = new THREE.Group(); g.name = "board";
    const tex = woodTexture({ ...spec.wood, dark: P.woodDark, mid: P.woodMid, light: P.woodLight, seam: P.woodSeam });
    const mat = materials.board; mat.map = tex; mat.needsUpdate = true;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 3, B.radius), mat);
    slab.position.z = -B.d / 2; slab.receiveShadow = true; slab.castShadow = true; slab.name = "board-slab";
    g.add(slab);
    // frame: four bevel-less strips proud of the face
    const fw = B.frame, fd = B.frameD;
    const strip = (w, h, x, y) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, fd, 2, 0.012), materials.frame);
      m.position.set(x, y, -B.d + fd / 2); m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    strip(B.w + 2 * fw, fw, 0, B.h / 2 + fw / 2);
    strip(B.w + 2 * fw, fw, 0, -B.h / 2 - fw / 2);
    strip(fw, B.h, B.w / 2 + fw / 2, 0);
    strip(fw, B.h, -B.w / 2 - fw / 2, 0);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(B.wallSize, B.wallSize), materials.wall);
    wall.position.z = B.wallZ; wall.receiveShadow = true; wall.name = "wall";
    g.add(wall);
    return g;
  }

  // ---------------------------------------------------------------- nails
  /** nails(L) -> Group of two InstancedMeshes (shaft, head) at every nail of the layout */
  function nails(L) {
    const g = new THREE.Group(); g.name = "nails";
    const n = L.nails.length;
    const shaftG = new THREE.CylinderGeometry(Nl.shaftR, Nl.shaftR * 0.8, Nl.height, Nl.segments, 1);
    shaftG.rotateX(Math.PI / 2); shaftG.translate(0, 0, Nl.height / 2);
    const headG = new THREE.CylinderGeometry(Nl.headR, Nl.headR * 0.92, Nl.headH, Nl.segments * 2, 1);
    headG.rotateX(Math.PI / 2); headG.translate(0, 0, Nl.height + Nl.headH / 2);
    const shaft = new THREE.InstancedMesh(shaftG, materials.brass, n);
    const head = new THREE.InstancedMesh(headG, materials.brass, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    L.nails.forEach((nl, i) => {
      e.set((hash01(i, 3, 97) - 0.5) * 0.05, (hash01(i, 5, 97) - 0.5) * 0.05, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(nl.p[0], nl.p[1], 0), q, new THREE.Vector3(1, 1, 1));
      shaft.setMatrixAt(i, m); head.setMatrixAt(i, m);
    });
    for (const im of [shaft, head]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; g.add(im); }
    shaft.name = "nail-shafts"; head.name = "nail-heads";
    return g;
  }

  // ---------------------------------------------------------------- threads
  function threadMaterial() {
    const mat = materials.thread.clone();
    mat.name = "thread";
    mat.sheenColor = new THREE.Color(T.sheenColor);
    mat.sheenRoughness = 0.5;
    const glow = { value: T.glow };
    mat.customProgramCacheKey = () => "string-art-thread";
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = glow;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;");
    };
    return mat;
  }

  /** threads(plan) -> InstancedMesh (one cylinder per planned thread); userData.update(t) draws each up to its fraction */
  function threads(plan) {
    const geo = new THREE.CylinderGeometry(T.radius, T.radius, 1, 7, 1, true);
    geo.translate(0, 0.5, 0);                          // spans y 0..1: scale y = drawn length
    const n = plan.threads.length;
    const im = new THREE.InstancedMesh(geo, threadMaterial(), n);
    im.name = "threads"; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    const c = new THREE.Color();
    plan.threads.forEach((th, i) => im.setColorAt(i, c.copy(colorOf(th.color))));
    im.instanceColor.needsUpdate = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // overlap the nail by the shaft radius at both ends so a thread visibly wraps rather than stopping short
    const quats = plan.threads.map((th) => {
      d.set(th.b[0] - th.a[0], th.b[1] - th.a[1], 0).normalize();
      return new THREE.Quaternion().setFromUnitVectors(up, d);
    });
    im.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        const th = plan.threads[i], f = plan.threadAt(i, t);
        if (f <= 0) { im.setMatrixAt(i, zero); continue; }
        const len = th.len * f;
        pos.set(th.a[0], th.a[1], th.z);
        q.copy(quats[i]);
        scl.set(1, Math.max(1e-4, len), 1);
        m.compose(pos, q, scl);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    im.userData.update(-1);
    return im;
  }

  /** wraps(plan) -> InstancedMesh of small rings round nail shafts where threads turn on / start at a nail */
  function wraps(plan) {
    const list = [];
    for (const th of plan.threads) {
      if (th.strandStart) list.push({ nail: th.na, p: th.a, z: th.z, t: th.t0, color: th.color });
      list.push({ nail: th.nb, p: th.b, z: th.z, t: th.t1, color: th.color });
    }
    const geo = new THREE.TorusGeometry(T.wrapR, T.wrapTube, 6, 14);
    const im = new THREE.InstancedMesh(geo, threadMaterial(), list.length);
    im.name = "wraps"; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
    const c = new THREE.Color();
    list.forEach((w, i) => im.setColorAt(i, c.copy(colorOf(w.color))));
    im.instanceColor.needsUpdate = true;
    const m = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    im.userData.update = (t) => {
      list.forEach((w, i) => {
        const u = clamp((t - w.t) / 0.08);
        if (u <= 0) { im.setMatrixAt(i, zero); return; }
        const s = 0.4 + 0.6 * ease.outBack(u);
        m.makeScale(s, s, 1).setPosition(w.p[0], w.p[1], w.z);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    };
    im.userData.update(-1);
    return im;
  }

  // ---------------------------------------------------------------- needles (one per winder)
  /** needles(plan) -> Group; userData.update(t) places each winder's needle at plan.tipAt(w, t) */
  function needles(plan) {
    const g = new THREE.Group(); g.name = "needles";
    const items = plan.winders.map((w) => {
      const pivot = new THREE.Group(); pivot.name = `needle-${w}`;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(Nd.radius, Nd.radius * 0.35, Nd.length, 10, 1), materials.needle);
      body.geometry.translate(0, -Nd.length / 2, 0); body.geometry.rotateX(Math.PI); // point at the origin, body along +Y
      body.castShadow = true;
      const eye = new THREE.Mesh(new THREE.TorusGeometry(Nd.radius * 1.3, Nd.radius * 0.45, 6, 12), materials.needle);
      eye.position.y = Nd.length * 0.94; eye.rotation.y = Math.PI / 2;
      const beadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: Nd.beadGlow });
      const bead = new THREE.Mesh(new THREE.SphereGeometry(Nd.bead, 14, 10), beadMat);
      const tilt = new THREE.Group();
      tilt.add(body, eye);
      pivot.add(tilt, bead);
      g.add(pivot);
      return { w, pivot, tilt, bead, beadMat };
    });
    const zAxis = new THREE.Vector3(0, 0, 1);
    g.userData.update = (t) => {
      for (const it of items) {
        const tip = plan.tipAt(it.w, t);
        if (!tip || tip.alpha <= 0.002) { it.pivot.visible = false; continue; }
        it.pivot.visible = true;
        it.pivot.position.set(tip.p[0], tip.p[1], tip.p[2]);
        const s = ease.outCubic(tip.alpha);
        it.pivot.scale.setScalar(s);
        // needle leans back against the motion: body axis = +Z tilted toward -dir
        const back = new THREE.Vector3(-tip.dir[0], -tip.dir[1], 0);
        const axis = new THREE.Vector3().crossVectors(zAxis, back).normalize();
        it.tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), zAxis);
        if (axis.lengthSq() > 1e-6) it.tilt.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, Nd.tilt));
        const col = colorOf(tip.color);
        it.beadMat.color.copy(col); it.beadMat.emissive.copy(col);
        it.beadMat.emissiveIntensity = Nd.beadGlow * (tip.drawing ? 1 : 0.6);
      }
    };
    g.userData.update(-1);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption tag (top-left)
  /** caption() -> overlay tag (cream card, a brass nail dot and a thread tail, dark sans text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), mark = 30;
      const pw = Math.min(W - 16, pad + mark + pad * 0.7 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.35)"; x.beginPath(); x.roundRect(ox + 3, oy + 7, pw, ph, 10); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 9); x.stroke();
      // the mark: a brass nail head with a short thread tail
      const mx = ox + pad + 12, my = oy + ph / 2;
      x.strokeStyle = st.thread || P.threadC; x.lineWidth = 5; x.lineCap = "round";
      x.beginPath(); x.moveTo(mx - 14, my + 16); x.lineTo(mx, my); x.lineTo(mx + 14, my + 16); x.stroke();
      x.fillStyle = Q.nail; x.beginPath(); x.arc(mx, my, 8, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + mark + pad * 0.7, my + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a, thread) => { mesh.userData.set({ text: a > 0.003 ? text : "", thread: thread ?? "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { board, nails, threads, wraps, needles, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: winding, motion: winding,
  };
}
