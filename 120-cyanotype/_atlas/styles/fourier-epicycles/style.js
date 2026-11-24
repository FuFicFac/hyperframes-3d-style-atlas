// styles/fourier-epicycles/style.js — "Fourier Epicycles": a chain of spinning brass arms whose pen draws a picture.
// The look lives in spec.js; WHICH arms exist, how long they are, how fast they turn and where the pen is at any t live in
// epicycles.js (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   - table(): a pale maple drafting table (kit woodTexture, pale palette), a cream paper sheet, four tape corners;
//   - chain(plan): a brass pivot post, ONE InstancedMesh of arm bars, ONE of pivot hubs, ONE of rings (a flat quad per
//     ring with an analytic anti-aliased ring shader: minimum on-screen line width, brass sheen round the ring) and a
//     coral-tipped pen at the end of the chain. update(t, { ppm, lift, alpha }) poses everything from plan.joints(t);
//   - inkLines(plan): one kit screenLines ribbon per drawing stage (the stage's K-term curve as one segment per phase
//     step, so draw progress = phase exactly); earlier outlines fade to faint grey and thinner;
//   - caption(): a fixed bottom-centre overlay plate (exact colours) with two text layers that roll like a counter
//     wheel at each label change (clipped to the plate, so two labels never overprint).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, paperTexture } from "../../kit/textures.js";
import { screenLines } from "../../kit/lines.js";
import { clamp, smoothstep } from "../../kit/time.js";
import * as epicycles from "./epicycles.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const RING_VS = /* glsl */ `
attribute float aHalf;
varying vec2 vL;
varying float vHalf;
void main() {
  vL = position.xz;
  #ifdef USE_INSTANCING
    vec4 p = instanceMatrix * vec4(position, 1.0);
    float R = length(instanceMatrix[0].xyz);
  #else
    vec4 p = vec4(position, 1.0);
    float R = 1.0;
  #endif
  vHalf = aHalf / max(R, 1e-6);
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const RING_FS = /* glsl */ `
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uLight;
uniform float uAlpha; uniform float uMinPx; uniform float uMaxLocal; uniform float uSheen;
varying vec2 vL;
varying float vHalf;
void main() {
  float d = length(vL);
  float fw = max(fwidth(d), 1e-6);
  float h = max(min(vHalf, uMaxLocal), 0.5 * uMinPx * fw);
  float e = abs(d - 1.0);
  float a = 1.0 - smoothstep(h - 0.5 * fw, h + 0.5 * fw, e);
  float ang = atan(vL.y, vL.x + 1e-6);
  float s = 0.5 + 0.5 * cos(ang - uSheen);
  vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.55, s));
  col = mix(col, uLight, smoothstep(0.72, 1.0, s));
  float xs = clamp(e / max(h, 1e-6), 0.0, 1.0);
  col *= 0.82 + 0.18 * (1.0 - xs * xs);
  a *= uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const C = spec.chain, I = spec.ink, Pp = spec.paper;

  // ---------------------------------------------------------------- table, paper, tape
  /** table({ center }) -> Group: maple table top (y = -paper thickness), the paper sheet (top face at y = 0), tape */
  function table(o = {}) {
    const [cx, cz] = o.center ?? [0, 0];
    const g = new THREE.Group(); g.name = "table";
    const wood = woodTexture({ ...spec.table.wood, dark: P.tableDark, mid: P.table, light: "#f2e3c4", seam: "#b9996c" });
    materials.table.map = wood; materials.table.needsUpdate = true;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(spec.table.size[0], spec.table.size[1]).rotateX(-Math.PI / 2), materials.table);
    top.position.set(cx, -Pp.thick, cz); top.receiveShadow = true; top.name = "table-top";
    g.add(top);
    materials.paper.map = paperTexture({ ...Pp.texture, base: P.paper }); materials.paper.needsUpdate = true;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(Pp.w, Pp.thick, Pp.h), materials.paper);
    sheet.position.set(cx, -Pp.thick / 2, cz); sheet.receiveShadow = true; sheet.name = "paper";
    g.add(sheet);
    const [tl, tw] = Pp.tape;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(tl, 0.0012, tw), materials.tape);
      tape.position.set(cx + sx * (Pp.w / 2 - 0.02), 0.0006, cz + sz * (Pp.h / 2 - 0.02));
      tape.rotation.y = sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4;
      tape.receiveShadow = true; tape.name = "tape";
      g.add(tape);
    }
    return g;
  }

  // ---------------------------------------------------------------- the chain
  function ringMaterial() {
    const col = (h) => new THREE.Color(h);
    return new THREE.ShaderMaterial({
      vertexShader: RING_VS,
      fragmentShader: RING_FS,
      uniforms: {
        uDeep: { value: col(P.brassDeep) }, uMid: { value: col(P.brass) }, uLight: { value: col(P.brassLight) },
        uAlpha: { value: 1 }, uMinPx: { value: C.minRingPx }, uMaxLocal: { value: C.ringMaxLocal }, uSheen: { value: C.sheenAngle },
      },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
  }

  /**
   * chain(plan) -> Group (pivot post, arms, hubs, rings, pen). userData.update(t, { ppm, lift = 0, alpha = 1 }):
   *   ppm = screen pixels per metre at the paper (sets the minimum drawn arm width); lift (m) raises the whole chain;
   *   alpha fades it out. userData.dims = per-arm { r, w, h, y } (y = underside of the bar).
   */
  function chain(plan) {
    const g = new THREE.Group(); g.name = "chain";
    const K = plan.maxK, r0 = plan.radius(0);
    const dims = [];
    let y = C.base;
    for (let j = 0; j < K; j++) {
      const r = plan.radius(j);
      const w = Math.min(C.armW * Math.sqrt(r / r0), C.armWRatio * r);
      const h = Math.max(C.minH, w * C.armH);
      dims.push({ r, w, h, y });
      y += h + C.gap + C.gapK * h;
    }
    const stackTop = (k) => dims[k - 1].y + dims[k - 1].h;
    // own material copies (transparent from the start: the beat-5 fade never flips a program)
    const brass = materials.brass.clone(); brass.transparent = true; brass.name = "chain-brass";
    const brassDark = materials.brassDark.clone(); brassDark.transparent = true; brassDark.name = "chain-brass-dark";
    const steel = materials.steel.clone(); steel.transparent = true; steel.name = "chain-steel";
    const coral = materials.coral.clone(); coral.transparent = true; coral.name = "pen-coral";
    const nibMat = materials.nib.clone(); nibMat.transparent = true; nibMat.name = "pen-nib";
    const fadeMats = [brass, brassDark, steel, coral, nibMat];

    // pivot post (at the DFT's c_0, the centroid of the outline)
    const [px, pz] = plan.joints(0)[0];
    const post = new THREE.Group(); post.name = "pivot-post";
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(C.post.base, C.post.base * 1.04, C.post.plate, 40), brass);
    plate.position.y = C.post.plate / 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(C.post.r * 0.62, C.post.r * 0.8, dims[0].y, 28), brass);
    pillar.position.y = dims[0].y / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(C.post.r * 0.55, C.post.r * 0.55, 0.008, 28), steel);
    cap.position.y = dims[0].y + dims[0].h + 0.004;
    for (const m of [plate, pillar, cap]) { m.castShadow = true; m.receiveShadow = true; post.add(m); }
    post.position.set(px, 0, pz);
    g.add(post);

    // arms: unit box spanning x 0..1, y -.5..5, z -.5...5
    const armGeo = new THREE.BoxGeometry(1, 1, 1); armGeo.translate(0.5, 0, 0);
    const arms = new THREE.InstancedMesh(armGeo, brass, K);
    arms.name = "arms"; arms.castShadow = true; arms.receiveShadow = true; arms.frustumCulled = false; arms.renderOrder = 3;
    const hubGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    const hubs = new THREE.InstancedMesh(hubGeo, brassDark, K);
    hubs.name = "hubs"; hubs.castShadow = true; hubs.frustumCulled = false; hubs.renderOrder = 4;
    const ringGeo = new THREE.PlaneGeometry(2.7, 2.7).rotateX(-Math.PI / 2);
    const ringMat = ringMaterial();
    const rings = new THREE.InstancedMesh(ringGeo, ringMat, K);
    rings.name = "rings"; rings.frustumCulled = false; rings.renderOrder = 3;
    const half = new Float32Array(K);
    dims.forEach((d, j) => (half[j] = 0.5 * C.ringW * d.w));
    rings.geometry.setAttribute("aHalf", new THREE.InstancedBufferAttribute(half, 1));
    g.add(arms, hubs, rings);

    // pen: a coral barrel with a rounded top, held in a thin brass clamp at the last joint, down to a dark nib
    const pen = new THREE.Group(); pen.name = "pen";
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0), coral);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(C.pen.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), coral);
    const nib = new THREE.Mesh(new THREE.ConeGeometry(C.pen.r * 0.92, C.pen.nib, 24).rotateX(Math.PI).translate(0, C.pen.nib / 2, 0), nibMat);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(C.pen.collar, C.pen.collar, 1, 24), brass);
    for (const m of [barrel, dome, nib, collar]) { m.castShadow = true; pen.add(m); }
    g.add(pen);

    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    const shadowLight = lights.key;
    g.userData.dims = dims;
    g.userData.update = (t, o = {}) => {
      const ppm = o.ppm ?? 800, lift = o.lift ?? 0, alpha = o.alpha ?? 1;
      const st = plan.state(t);
      const J = plan.joints(t);
      g.position.y = lift;
      g.visible = alpha > 0.002;
      for (const m of fadeMats) m.opacity = alpha;
      ringMat.uniforms.uAlpha.value = alpha;
      if (shadowLight?.shadow) shadowLight.shadow.intensity = alpha;
      const minW = C.minArmPx / ppm;
      for (let j = 0; j < K; j++) {
        if (j >= st.K) { arms.setMatrixAt(j, ZERO); hubs.setMatrixAt(j, ZERO); rings.setMatrixAt(j, ZERO); continue; }
        const a = J[j], b = J[j + 1], d = dims[j];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz);
        const gr = st.grow[j];
        if (gr <= 1e-4 || len < 1e-6) { arms.setMatrixAt(j, ZERO); hubs.setMatrixAt(j, ZERO); rings.setMatrixAt(j, ZERO); continue; }
        const w = Math.max(d.w, minW) * Math.min(1, gr * 3);
        Q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
        T.set(a[0], d.y + d.h / 2, a[1]); S.set(len, d.h, w);
        arms.setMatrixAt(j, M.compose(T, Q, S));
        const hr = Math.max(C.hub * w, minW * 0.9);
        Q.identity(); T.set(a[0], d.y + d.h / 2, a[1]); S.set(hr, d.h * 1.5 + 0.0012, hr);
        hubs.setMatrixAt(j, M.compose(T, Q, S));
        const R = d.r * Math.max(0, gr);
        T.set(a[0], d.y - 0.0008, a[1]); S.set(R, 1, R);
        rings.setMatrixAt(j, M.compose(T, Q, S));
      }
      arms.instanceMatrix.needsUpdate = true; hubs.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true;
      // pen at the tip; lifted between drawings
      const tip = J[st.K], top = stackTop(st.K);
      let down = 0; // the nib touches the paper only while a drawing runs (smooth 0.18 s lift/drop at its ends)
      for (const s of plan.stages) down = Math.max(down, smoothstep(s.draw[0] - 0.2, s.draw[0] - 0.02, t) * (1 - smoothstep(s.draw[1] + 0.02, s.draw[1] + 0.2, t)));
      const penLift = C.pen.lift * (1 - down);
      pen.position.set(tip[0], penLift, tip[1]);
      const H = Math.max(0.01, top - C.pen.nib + C.pen.above);
      barrel.scale.set(C.pen.r, H, C.pen.r); barrel.position.y = C.pen.nib;
      dome.position.y = C.pen.nib + H;
      collar.scale.set(1, C.pen.collarH, 1); collar.position.y = top - C.pen.collarH / 2 - penLift;
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- ink
  /**
   * inkLines(plan) -> Group of one screenLines ribbon per stage. userData.update(t, ppm): stage i is drawn up to its
   * phase at t (one segment per phase step, so progress == phase), in ink while it is the current drawing, then faint
   * grey and thinner once the next stage starts.
   */
  function inkLines(plan) {
    const g = new THREE.Group(); g.name = "ink";
    const ink = new THREE.Color(P.ink), grey = new THREE.Color(P.grey);
    const lines = plan.stages.map((s, i) => {
      const c = plan.curve(i), M = c.length - 1;
      const polys = [], windows = [];
      for (let m = 0; m < M; m++) {
        polys.push([[c[m][0], I.lift, c[m][1]], [c[m + 1][0], I.lift, c[m + 1][1]]]);
        windows.push([m / M, (m + 1) / M]);
      }
      const l = screenLines(stage, polys, { windows, width: I.minPx, color: P.ink, blending: "normal", depth: "visible", bias: I.bias, renderOrder: 2 + i * 0.01, name: `ink-${s.id ?? i}` });
      l.userData.setProgress(0);
      g.add(l);
      return l;
    });
    const tmp = new THREE.Color();
    g.userData.lines = lines;
    g.userData.update = (t, ppm = 800) => {
      const inkPx = clamp(I.world * ppm, I.minPx, I.maxPx);
      const greyPx = Math.max(I.greyMinPx, inkPx * I.greyScale);
      plan.stages.forEach((s, i) => {
        const l = lines[i];
        const p = t < s.draw[0] ? 0 : plan.phaseAt(i, t);
        l.userData.setProgress(p);
        const nx = plan.stages[i + 1];
        const gk = nx ? smoothstep(nx.grow ? nx.grow[0] : nx.draw[0], (nx.grow ? nx.grow[0] : nx.draw[0]) + 0.5, t) : 0;
        const m = l.userData.materials[0];
        m.uniforms.uColor.value.copy(tmp.copy(ink).lerp(grey, gk));
        m.uniforms.uWidth.value = inkPx + (greyPx - inkPx) * gk;
      });
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- caption plate (overlay, bottom centre)
  /** caption() -> { plate, texts, show(labels, t, { roll, lead }) } — labels: [{ text, on }] in order */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const m = 14, Wc = Q.w + 2 * m, Hc = Q.h + 2 * m;
    const iconX = m + 58;
    const plate = screenCanvas(stage, Wc, Hc, (x) => {
      x.save();
      x.shadowColor = "rgba(40, 28, 10, 0.28)"; x.shadowBlur = 12; x.shadowOffsetY = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(m, m, Q.w, Q.h, Q.radius); x.fill();
      x.restore();
      x.strokeStyle = Q.edge; x.lineWidth = 2.5; x.beginPath(); x.roundRect(m + 5, m + 5, Q.w - 10, Q.h - 10, Q.radius - 5); x.stroke();
      // the icon: one epicycle — a ring, its arm, a smaller ring on the end and the coral pen dot
      const cy = m + Q.h / 2, R = 24, a = -0.6;
      x.strokeStyle = Q.ring; x.lineWidth = 3; x.beginPath(); x.arc(iconX, cy, R, 0, Math.PI * 2); x.stroke();
      const ex = iconX + R * Math.cos(a), ey = cy + R * Math.sin(a);
      x.lineWidth = 4; x.lineCap = "round"; x.beginPath(); x.moveTo(iconX, cy); x.lineTo(ex, ey); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(ex, ey, 10, 0, Math.PI * 2); x.stroke();
      x.fillStyle = Q.dot; x.beginPath(); x.arc(ex + 10 * Math.cos(1.1), ey + 10 * Math.sin(1.1), 6, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ring; x.beginPath(); x.arc(iconX, cy, 4.5, 0, Math.PI * 2); x.fill();
    }, { upload: true, willReadFrequently: true });
    plate.userData.place(Q.x - m, Q.y - m);
    plate.userData.set({ v: 1 });
    plate.userData.opacity(1);
    const textX = (iconX + 40 + Wc - m - 34) / 2;
    const rollH = Math.round(Q.h * 0.7);
    const texts = [0, 1].map(() => {
      const c = screenCanvas(stage, Wc, Hc, (x, W, H, st) => {
        if (!st.text) return;
        x.save();
        x.beginPath(); x.roundRect(m + 7, m + 7, Q.w - 14, Q.h - 14, Q.radius - 7); x.clip();   // the plate's window
        x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
        x.fillStyle = Q.text; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(st.text, textX, m + Q.h / 2 + 2 + (st.dy ?? 0));
        x.restore();
      }, { upload: true, willReadFrequently: true });
      c.renderOrder = 11;
      c.userData.place(Q.x - m, Q.y - m);
      return c;
    });
    plate.renderOrder = 10;
    /**
     * show(labels, t, { roll = .24, lead = .04 }): label i holds until the roll to label i+1, which runs over
     * [on - lead - roll, on - lead] like a counter wheel: the old line rolls up out of the plate's window while the new
     * one rolls up into it (clipped, so the two never overprint). Always exactly one label (mid-roll: one leaving, one
     * arriving); returns the index of the arriving/shown label.
     */
    function show(labels, t, o = {}) {
      const roll = o.roll ?? 0.24, lead = o.lead ?? 0.04;
      let i = 0;
      for (let k = 1; k < labels.length; k++) if (t >= labels[k].on - lead - roll) i = k;
      const u = i === 0 ? 1 : smoothstep(labels[i].on - lead - roll, labels[i].on - lead, t);
      const cur = texts[i % 2], prev = texts[(i + 1) % 2];
      if (u >= 1) {
        cur.userData.set({ text: labels[i].text, dy: 0 }); cur.userData.opacity(1);
        prev.userData.set({ text: "" }); prev.userData.opacity(0);
      } else {
        const q = (v) => Math.round(v * 2) / 2;
        prev.userData.set({ text: labels[i - 1].text, dy: q(-u * rollH) }); prev.userData.opacity(1);
        cur.userData.set({ text: labels[i].text, dy: q((1 - u) * rollH) }); cur.userData.opacity(1);
      }
      return i;
    }
    return { plate, texts, show };
  }

  const props = { table, chain, inkLines, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: epicycles, motion: epicycles,
  };
}
