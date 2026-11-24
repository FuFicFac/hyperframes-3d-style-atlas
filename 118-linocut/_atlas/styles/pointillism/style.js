// styles/pointillism/style.js — "Pointillism": a painting made only of dots of pure, unmixed paint.
// The look lives in spec.js; WHERE every dot sits, which pure colour it takes and WHEN it appears live in dots.js
// (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   - studio(): a warm wall, the stretched canvas (box body + a front face with an analytic canvas-weave shader that
//     fades out once the threads are smaller than ~3 px on screen);
//   - dots(plan): ONE mesh, ~10,000 instanced quads, ONE shader: an irregular oval dab per instance with a raised-dome
//     shading (light from the studio window), a darker rim, a wet highlight, bristle streaks (faded when tiny), a soft
//     cast shadow beside it and an analytic anti-aliased edge. Each instance pops from nothing to full size at its
//     planned time (uTime uniform: a pure function of t, no per-frame JS loop over dots);
//   - brushes(plan): two round brushes (pale lacquered handle, steel ferrule, bristles loaded with orange or blue paint)
//     posed from plan.brushPose(b, t), with a soft contact shadow on the canvas;
//   - defocus(): two separable gaussian passes in DISPLAY space (after tone mapping/sRGB, before the finish pass):
//     the squint. set(sigmaPx) — 0 disables both passes;
//   - caption(): a fixed bottom-centre overlay plate (exact colours) whose label rolls like a counter wheel.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { clamp, smoothstep } from "../../kit/time.js";
import * as dotsPlanner from "./dots.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------------------------------------ shaders
const WEAVE_VS = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WEAVE_FS = /* glsl */ `
uniform vec3 uCol; uniform float uPeriod; uniform float uAmp; uniform vec2 uHalf; uniform float uGrad;
varying vec3 vW;
void main() {
  vec2 p = vW.xy / uPeriod;
  vec2 f = fract(p) - 0.5;
  vec2 cell = floor(p);
  float over = mod(cell.x + cell.y, 2.0);          // plain weave: which thread is on top in this cell
  float tx = 1.0 - 4.0 * f.y * f.y;                // a horizontal thread (bright along its middle)
  float ty = 1.0 - 4.0 * f.x * f.x;                // a vertical thread
  float h = mix(tx, ty, over);
  float fw = fwidth(p.x) + fwidth(p.y);
  float amp = uAmp * (1.0 - smoothstep(0.22, 0.55, fw));
  float g = 1.0 + uGrad * (-vW.x / uHalf.x * 0.5 + vW.y / uHalf.y * 0.5);
  gl_FragColor = vec4(uCol * g * (1.0 - 0.55 * amp + amp * h), 1.0);
  #include <colorspace_fragment>
}`;

const DOT_VS = /* glsl */ `
attribute vec3 aOff;      // x, y on the canvas (m), relief height factor
attribute vec4 aShape;    // radius (m), rotation (rad), aspect, seed
attribute vec3 aCol;      // linear paint colour
attribute float aT;       // appear time (s)
uniform float uTime; uniform float uPop; uniform float uLift;
varying vec2 vL; varying vec3 vCol; varying vec4 vShape; varying float vH; varying float vAge; varying vec3 vW;
float popScale(float a) {
  float u = clamp(a / uPop, 0.0, 1.0);
  float s = 1.5;
  float v = u - 1.0;
  return a <= 0.0 ? 0.0 : 1.0 + (s + 1.0) * v * v * v + s * v * v;
}
void main() {
  float age = uTime - aT;
  float sc = popScale(age);
  vec2 l = position.xy * 1.5;                      // the quad reaches 1.5 x radius (edge wobble + cast shadow)
  vL = l;
  float c = cos(aShape.y), s = sin(aShape.y);
  vec2 q = vec2(l.x * aShape.z, l.y);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec3 p = vec3(aOff.xy + q * aShape.x * sc, uLift);
  vCol = aCol; vShape = aShape; vH = aOff.z; vAge = age;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const DOT_FS = /* glsl */ `
uniform vec3 uLight; uniform float uFlat; uniform float uRelief; uniform float uRim; uniform float uGloss;
uniform float uShadow; uniform float uStreak; uniform float uEdge; uniform vec2 uHalf; uniform float uGrad;
uniform vec3 uShadowCol;
varying vec2 vL; varying vec3 vCol; varying vec4 vShape; varying float vH; varying float vAge; varying vec3 vW;
float wobble(float ang, float sd) {
  return 1.0 + uEdge * (0.6 * sin(2.0 * ang + sd * 6.2832) + 0.4 * sin(3.0 * ang + sd * 19.1) + 0.25 * sin(5.0 * ang + sd * 41.7));
}
void main() {
  float rot = vShape.y, asp = vShape.z, sd = vShape.w;
  float c = cos(rot), s = sin(rot);
  // ---- the dab
  float ang = atan(vL.y, vL.x + 1e-6);
  float d = length(vL) / wobble(ang, sd);
  float fw = max(fwidth(d), 1e-5);
  float a = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, d);
  // dome normal in canvas space: outward direction of the (rotated, stretched) ellipse, slope steeper toward the edge
  vec2 g = vec2(vL.x / asp, vL.y);
  g = vec2(c * g.x - s * g.y, s * g.x + c * g.y);
  float gl = length(g);
  vec2 gd = gl > 1e-5 ? g / gl : vec2(0.0);
  float dd = min(d, 1.0);
  float slope = uRelief * vH * (0.25 * dd + 0.95 * dd * dd * dd);
  vec3 n = normalize(vec3(gd * slope, 1.0));
  vec3 L = normalize(uLight);
  float lit = uFlat + 0.5 * (dot(n, L) - L.z);
  vec3 V = normalize(cameraPosition - vW);
  vec3 Hh = normalize(L + V);
  float spec = pow(max(dot(n, Hh), 0.0), 24.0) * uGloss * vH;
  // bristle streaks along the dab (fade when they would be finer than ~3 px)
  float sp = vL.y * (5.0 + 3.0 * sd) + sd * 13.0 + 0.4 * sin(vL.x * 2.3 + sd * 7.0);
  float sw = fwidth(sp);
  float streak = sin(sp * 3.14159) * uStreak * (1.0 - smoothstep(0.12, 0.4, sw));
  float rim = uRim * smoothstep(0.8, 1.02, d);
  float grad = 1.0 + uGrad * (-vW.x / uHalf.x * 0.5 + vW.y / uHalf.y * 0.5);
  vec3 col = vCol * clamp(lit, 0.0, 1.2) * (1.0 + streak) * (1.0 - rim) * grad + vec3(spec);
  // ---- its soft cast shadow (offset away from the light), on whatever lies under it
  vec2 Ll = vec2(c * L.x + s * L.y, -s * L.x + c * L.y);
  Ll.x /= asp;
  vec2 ls = vL + Ll * (0.2 * vH);
  float ds = length(ls) / wobble(atan(ls.y, ls.x + 1e-6), sd);
  float sh = uShadow * (1.0 - smoothstep(0.82, 1.22, ds));
  // ---- combine (dab over its own shadow) and clip to the canvas
  float A = a + sh * (1.0 - a);
  vec3 outc = (col * a + uShadowCol * sh * (1.0 - a)) / max(A, 1e-4);
  float inside = step(abs(vW.x), uHalf.x) * step(abs(vW.y), uHalf.y);
  A *= inside * step(0.0, vAge);
  if (A < 0.002) discard;
  gl_FragColor = vec4(outc, A);
  #include <colorspace_fragment>
}`;

const BLUR_FS = /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; uniform float uSigma; varying vec2 vUv;
void main() {
  float st = uSigma * 3.0 / float(TAPS);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = -TAPS; i <= TAPS; i++) {
    float x = float(i) * st;
    float w = exp(-0.5 * x * x / max(uSigma * uSigma, 1e-4));
    acc += texture2D(tDiffuse, vUv + uDir * x / uRes) * w;
    ws += w;
  }
  gl_FragColor = acc / ws;
}`;
const BLUR_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const CV = spec.canvas, D = spec.dots, BR = spec.brush;
  const lin = (hex) => new THREE.Color(hex); // THREE.Color(hex) converts sRGB -> linear working space

  // ---------------------------------------------------------------- studio + canvas
  /** studio() -> Group: wall, stretched canvas body, canvas face (weave shader, paint surface at z = 0) */
  function studio() {
    const g = new THREE.Group(); g.name = "studio";
    const back = -(CV.depth + CV.wallGap);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), materials.wall);
    wall.position.set(0, 0, back); wall.receiveShadow = true; wall.name = "wall";
    g.add(wall);
    const body = new THREE.Mesh(new THREE.BoxGeometry(CV.w, CV.h, CV.depth), materials.canvasEdge);
    body.position.set(0, 0, -CV.depth / 2 - 0.0004); body.castShadow = true; body.receiveShadow = true; body.name = "canvas-body";
    g.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(CV.w, CV.h), new THREE.ShaderMaterial({
      vertexShader: WEAVE_VS, fragmentShader: WEAVE_FS,
      uniforms: {
        uCol: { value: lin(P.canvas) }, uPeriod: { value: CV.weave }, uAmp: { value: CV.weaveAmp },
        uHalf: { value: new THREE.Vector2(CV.w / 2, CV.h / 2) }, uGrad: { value: D.grad ?? 0.05 },
      },
    }));
    face.name = "canvas-face";
    g.add(face);
    return g;
  }

  // ---------------------------------------------------------------- the dots
  /** dots(plan) -> Mesh (one draw call). userData.update(t) sets the clock; nothing else changes per frame. */
  function dots(plan) {
    const n = plan.n;
    const base = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.getAttribute("position"));
    geo.setAttribute("uv", base.getAttribute("uv"));
    const off = new Float32Array(n * 3), shape = new Float32Array(n * 4), cols = new Float32Array(n * 3), at = new Float32Array(n);
    const paint = plan.paint.map((p) => lin(p.hex));
    plan.order.forEach((q, k) => {
      off[k * 3] = plan.x[q]; off[k * 3 + 1] = plan.y[q]; off[k * 3 + 2] = plan.hgt[q];
      shape[k * 4] = plan.r[q]; shape[k * 4 + 1] = plan.rot[q]; shape[k * 4 + 2] = plan.asp[q]; shape[k * 4 + 3] = plan.seed[q];
      const c = paint[plan.col[q]];
      cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      at[k] = plan.t[q];
    });
    geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute("aShape", new THREE.InstancedBufferAttribute(shape, 4));
    geo.setAttribute("aCol", new THREE.InstancedBufferAttribute(cols, 3));
    geo.setAttribute("aT", new THREE.InstancedBufferAttribute(at, 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: DOT_VS, fragmentShader: DOT_FS,
      uniforms: {
        uTime: { value: 0 }, uPop: { value: D.pop }, uLift: { value: D.lift },
        uLight: { value: new THREE.Vector3(...D.light) }, uFlat: { value: D.flat }, uRelief: { value: D.relief },
        uRim: { value: D.rim }, uGloss: { value: D.gloss }, uShadow: { value: D.shadow }, uStreak: { value: D.streaks },
        uEdge: { value: D.edgeWobble }, uHalf: { value: new THREE.Vector2(CV.w / 2, CV.h / 2) }, uGrad: { value: D.grad ?? 0.05 },
        uShadowCol: { value: lin(D.shadowColor ?? "#3a2a6a") },
      },
      transparent: true, depthWrite: false, depthTest: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "dots"; mesh.frustumCulled = false; mesh.renderOrder = 2;
    mesh.userData.update = (t) => { mat.uniforms.uTime.value = t; };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- brushes
  function brushMesh(paintHex, bandHex) {
    const g = new THREE.Group();
    // bristles: a lathe (tip at y = 0, belly, then into the ferrule), paint on the lower `load` of its length
    const L = BR.tipLen, R = BR.belly, prof = [];
    const NS = 14;
    for (let i = 0; i <= NS; i++) {
      const u = i / NS;                                       // 0 tip .. 1 ferrule
      const rr = u < 0.12 ? BR.tipR + (R * 0.7 - BR.tipR) * Math.sqrt(u / 0.12) : R * (0.7 + 0.3 * Math.sin(Math.min(1, (u - 0.12) / 0.5) * Math.PI / 2)) * (u > 0.75 ? 1 - 0.18 * (u - 0.75) / 0.25 : 1);
      prof.push(new THREE.Vector2(i === 0 ? 0.0001 : rr, u * L));
    }
    const lathe = new THREE.LatheGeometry(prof, 28);
    const pc = lin(paintHex), bc = lin(P.bristle);
    const pos = lathe.getAttribute("position"), vc = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getY(i) / L;
      const k = smoothstep(BR.load - 0.08, BR.load + 0.08, u);
      vc[i * 3] = pc.r + (bc.r - pc.r) * k; vc[i * 3 + 1] = pc.g + (bc.g - pc.g) * k; vc[i * 3 + 2] = pc.b + (bc.b - pc.b) * k;
    }
    lathe.setAttribute("color", new THREE.BufferAttribute(vc, 3));
    const bristles = new THREE.Mesh(lathe, materials.bristle);
    bristles.castShadow = true; bristles.name = "bristles";
    const upper = new THREE.Group(); upper.name = "ferrule+handle";
    const fer = new THREE.Mesh(new THREE.CylinderGeometry(BR.ferruleR, BR.ferruleR * 0.92, BR.ferruleLen, 28).translate(0, BR.ferruleLen / 2, 0), materials.ferrule);
    const crimp = new THREE.Mesh(new THREE.TorusGeometry(BR.ferruleR * 0.98, 0.0012, 8, 28).rotateX(Math.PI / 2).translate(0, BR.ferruleLen * 0.72, 0), materials.ferrule);
    const bandMat = materials.handle.clone(); bandMat.color = lin(bandHex); bandMat.name = "brush-band";
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(BR.handleR * 0.7, BR.handleR, BR.handleLen, 24).translate(0, BR.ferruleLen + BR.handleLen / 2, 0), materials.handle);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(BR.handleR * 1.01, BR.handleR * 1.02, 0.03, 24).translate(0, BR.ferruleLen + 0.03, 0), bandMat);
    for (const m of [fer, crimp, handle, band]) { m.castShadow = true; upper.add(m); }
    g.add(bristles, upper);
    g.userData = { bristles, upper };
    return g;
  }

  /** brushes(plan) -> Group of two brushes + their contact shadows. userData.update(t) poses them from the plan. */
  function brushes(plan) {
    const g = new THREE.Group(); g.name = "brushes";
    const hexes = [[P.paint.orange, P.paint.orange], [P.paint.ultramarine, P.paint.ultramarine]];
    const blobMat = (o) => new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uO; uniform vec3 uC; varying vec2 vU;
void main() {
  float r = length(vU);
  float a = uO * (1.0 - smoothstep(0.0, 1.0, r));
  if (a < 0.002) discard;
  gl_FragColor = vec4(uC, a);
  #include <colorspace_fragment>
}`,
      uniforms: { uO: { value: o }, uC: { value: lin(D.shadowColor ?? "#3a2a6a") } },
      transparent: true, depthWrite: false,
    });
    const items = hexes.map(([paintHex, bandHex], b) => {
      const brush = brushMesh(paintHex, bandHex); brush.name = `brush-${b}`;
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat(0)); blob.name = `brush-shadow-${b}`; blob.renderOrder = 3;
      g.add(brush, blob);
      return { brush, blob };
    });
    const Y = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3();
    const Lv = new THREE.Vector3(...D.light).normalize();
    g.userData.update = (t) => {
      items.forEach(({ brush, blob }, b) => {
        const p = plan.brushPose(b, t);
        brush.visible = p.visible; blob.visible = p.visible;
        A.set(...p.axis);
        brush.quaternion.setFromUnitVectors(Y, A);
        brush.position.set(p.x, p.y, D.lift + 0.0006 + p.z);
        const k = 1 - BR.squash * p.press;
        brush.userData.bristles.scale.set(1 + 0.75 * BR.squash * p.press, k, 1 + 0.75 * BR.squash * p.press);
        brush.userData.upper.position.y = BR.tipLen * k;
        // contact shadow: under the tip, pushed away from the light by the tip height, grows and fades as it lifts
        const h = p.z + BR.tipLen * 0.35;
        blob.position.set(p.x - (Lv.x / Lv.z) * h * 0.8, p.y - (Lv.y / Lv.z) * h * 0.8, D.lift + 0.0003);
        const sz = 0.03 + 0.5 * p.z;
        blob.scale.set(sz * 1.5, sz, 1);
        blob.rotation.z = Math.atan2(p.axis[1], p.axis[0]);
        blob.material.uniforms.uO.value = 0.5 * clamp(1 - p.z / 0.08);
      });
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- the squint (display-space defocus)
  function defocus() {
    const taps = spec.defocus.taps;
    const mk = (dir) => {
      const p = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(...dir) }, uRes: { value: new THREE.Vector2(stage.width, stage.height) }, uSigma: { value: 0 } },
        vertexShader: BLUR_VS, fragmentShader: BLUR_FS, defines: { TAPS: taps },
      });
      p.enabled = false;
      return p;
    };
    const h = mk([1, 0]), v = mk([0, 1]);
    post.insertBefore(h, "finish", "squintH");
    post.insertBefore(v, "finish", "squintV");
    return {
      passes: [h, v],
      set(sigma) {
        const on = sigma > 0.05;
        h.enabled = on; v.enabled = on;
        h.uniforms.uSigma.value = sigma; v.uniforms.uSigma.value = sigma;
      },
    };
  }

  // ---------------------------------------------------------------- caption plate (overlay, bottom centre)
  /** caption() -> { plate, texts, show(labels, t, { roll, lead }) } — labels: [{ text, on }] in order */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const m = 16, Wc = Q.w + 2 * m, Hc = Q.h + 2 * m;
    const iconX = m + 64;
    const plate = screenCanvas(stage, Wc, Hc, (x) => {
      x.save();
      x.shadowColor = "rgba(30, 24, 60, 0.3)"; x.shadowBlur = 14; x.shadowOffsetY = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(m, m, Q.w, Q.h, Q.radius); x.fill();
      x.restore();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(m + 6, m + 6, Q.w - 12, Q.h - 12, Q.radius - 6); x.stroke();
      // icon: a little cluster of pure-colour dots
      const cy = m + Q.h / 2;
      const pts = [[-14, -10], [4, -14], [16, 4], [-6, 8], [-20, 10]];
      pts.forEach(([dx, dy], i) => { x.fillStyle = Q.icon[i % Q.icon.length]; x.beginPath(); x.arc(iconX + dx, cy + dy, 9, 0, Math.PI * 2); x.fill(); });
    }, { upload: true, willReadFrequently: true });
    plate.userData.place(Q.x - m, Q.y - m);
    plate.userData.set({ v: 1 });
    plate.userData.opacity(1);
    plate.renderOrder = 10;
    const textX = (iconX + 44 + Wc - m - 36) / 2;
    const rollH = Math.round(Q.h * 0.72);
    const texts = [0, 1].map(() => {
      const c = screenCanvas(stage, Wc, Hc, (x, W, H, st) => {
        if (!st.text) return;
        x.save();
        x.beginPath(); x.roundRect(m + 8, m + 8, Q.w - 16, Q.h - 16, Q.radius - 8); x.clip();   // the plate's window
        x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
        x.fillStyle = Q.text; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(st.text, textX, m + Q.h / 2 + 2 + (st.dy ?? 0));
        x.restore();
      }, { upload: true, willReadFrequently: true });
      c.renderOrder = 11;
      c.userData.place(Q.x - m, Q.y - m);
      return c;
    });
    /**
     * show(labels, t, { roll = .26, lead = .04 }): label i holds until the roll to label i+1, which runs over
     * [on - lead - roll, on - lead] like a counter wheel: the old line rolls up out of the plate's window while the new
     * one rolls up into it (clipped, never overprinted). Exactly one label is readable at every instant.
     */
    function show(labels, t, o2 = {}) {
      const roll = o2.roll ?? 0.26, lead = o2.lead ?? 0.04;
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

  const props = { studio, dots, brushes, defocus, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: dotsPlanner, motion: dotsPlanner,
  };
}
