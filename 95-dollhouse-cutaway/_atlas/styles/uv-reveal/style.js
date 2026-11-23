// styles/uv-reveal/style.js — "UV Reveal": a two-layer sheet and a UV torch. The look lives in spec.js; WHERE the torch
// pool is, how big it is, how bright the room is and what the afterglow remembers lives in torchplan.js (THREE-free,
// shared with SCORE). This file turns a plan into pictures:
//   * the sheet: one MeshStandardMaterial whose `map` is the VISIBLE print (baked once to a canvas) and whose emission
//     gets the HIDDEN fluorescent layer (a second canvas baked once) multiplied by the torch masks — pool + afterglow
//     samples passed as uniforms every frame. With the lamp off every mask is exactly 0: no trace of the hidden layer.
//   * the torch (body, head, lens, button), its violet SpotLight and an additive cone beam,
//   * the oak desk, a pencil and a highlighter (which fluoresces too), and the overlay caption chip.
// Props never animate themselves: the scene calls rig.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas } from "../../kit/canvas.js";
import { canvasTexture } from "../../kit/textures.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import { rng, clamp, lerp, ease } from "../../kit/time.js";
import * as torchplan from "./torchplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TRAIL_N = 20;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const PG = spec.page, PR = spec.print, HD = spec.hidden, TC = spec.torch;
  if (PG.w !== torchplan.PAGE.w || PG.h !== torchplan.PAGE.h || PG.pxPerMetre !== torchplan.PAGE.ppm) throw new Error("uv-reveal: spec.page and torchplan.PAGE disagree");
  if (TC.afterglow.samples !== TRAIL_N) throw new Error(`uv-reveal: spec.torch.afterglow.samples must be ${TRAIL_N}`);
  const base = { fill: lights.fill.intensity, key: lights.key.intensity };
  const bgLit = new THREE.Color(P.bg), bgDark = new THREE.Color(P.bgDark);

  // ---------------------------------------------------------------- shared illustration geometry (both layers)
  /** hill line k (0 far .. 2 near) at u = 0..1 across the illustration -> y as a fraction of its height */
  const hillY = (k, u) => [
    0.56 + 0.07 * Math.sin(u * 5.2 + 0.4) + 0.03 * Math.sin(u * 11 + 1.3),
    0.68 + 0.08 * Math.sin(u * 3.6 + 2.2) + 0.02 * Math.sin(u * 9 + 0.2),
    0.83 + 0.06 * Math.sin(u * 2.7 + 4.4) + 0.015 * Math.sin(u * 13),
  ][k];
  const SUN = { u: 0.7, v: 0.33, r: 0.115 };   // fractions of the illustration width / height / height
  const hillPath = (x, R, k, close) => {
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, px = R.x + u * R.w, py = R.y + hillY(k, u) * R.h;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    if (close) { x.lineTo(R.x + R.w, R.y + R.h); x.lineTo(R.x, R.y + R.h); x.closePath(); }
  };

  // ---------------------------------------------------------------- layer 1: the visible print
  function drawVisible(x, L) {
    const { W, H, illus: R, column: C } = L;
    x.fillStyle = PR.paper; x.fillRect(0, 0, W, H);
    // heading + rule
    x.fillStyle = PR.ink; x.textBaseline = "alphabetic"; x.textAlign = "left";
    x.font = `700 78px ${PR.font}`;
    x.fillText(PR.heading, 96, 128);
    x.fillStyle = PR.barDark; x.fillRect(W - 96 - 300, 100, 300, 12);
    x.fillStyle = PR.bar; x.fillRect(W - 96 - 190, 74, 190, 10);
    x.fillStyle = PR.rule; x.fillRect(96, 156, W - 192, 4);
    // ---- illustration: sunrise over three hills, a house, trees, a river, birds (original, generic)
    x.save();
    x.beginPath(); x.rect(R.x, R.y, R.w, R.h); x.clip();
    const sky = x.createLinearGradient(0, R.y, 0, R.y + R.h * 0.75);
    sky.addColorStop(0, PR.sky[0]); sky.addColorStop(1, PR.sky[1]);
    x.fillStyle = sky; x.fillRect(R.x, R.y, R.w, R.h);
    const sx = R.x + SUN.u * R.w, sy = R.y + SUN.v * R.h, sr = SUN.r * R.h;
    x.fillStyle = "rgba(255,238,190,0.55)"; x.beginPath(); x.arc(sx, sy, sr * 1.7, 0, Math.PI * 2); x.fill();
    x.fillStyle = PR.sun; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#ffffff";   // clouds
    for (const [u, v, s] of [[0.2, 0.2, 1], [0.44, 0.13, 0.7], [0.9, 0.16, 0.8]]) {
      const cx = R.x + u * R.w, cy = R.y + v * R.h;
      for (const [dx, dy, r] of [[-46, 6, 30], [-12, -8, 40], [28, 2, 34], [58, 10, 24]]) { x.beginPath(); x.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2); x.fill(); }
      x.fillRect(cx - 60 * s, cy + 6 * s, 124 * s, 28 * s);
    }
    x.strokeStyle = PR.bird; x.lineWidth = 4; x.lineCap = "round";   // birds
    for (const [u, v, s] of [[0.33, 0.33, 1], [0.4, 0.28, 0.8], [0.27, 0.27, 0.7]]) {
      const cx = R.x + u * R.w, cy = R.y + v * R.h;
      x.beginPath(); x.moveTo(cx - 16 * s, cy - 6 * s); x.quadraticCurveTo(cx - 6 * s, cy - 10 * s, cx, cy); x.quadraticCurveTo(cx + 6 * s, cy - 10 * s, cx + 16 * s, cy - 6 * s); x.stroke();
    }
    PR.hills.forEach((c, k) => {
      x.fillStyle = c; hillPath(x, R, k, true); x.fill();
      if (k === 1) {   // house + trees stand on the middle hill
        const hx = R.x + 0.24 * R.w, hy = R.y + hillY(1, 0.24) * R.h + 8;
        x.fillStyle = PR.wall; x.fillRect(hx - 44, hy - 62, 88, 62);
        x.fillStyle = PR.roof; x.beginPath(); x.moveTo(hx - 58, hy - 60); x.lineTo(hx, hy - 112); x.lineTo(hx + 58, hy - 60); x.closePath(); x.fill();
        x.fillStyle = PR.trunk; x.fillRect(hx - 9, hy - 34, 18, 34);
        x.fillStyle = PR.sky[0]; x.fillRect(hx + 18, hy - 48, 16, 16);
        for (const [u, s] of [[0.42, 1], [0.5, 0.75], [0.11, 0.85]]) {
          const tx = R.x + u * R.w, ty = R.y + hillY(1, u) * R.h + 6;
          x.fillStyle = PR.trunk; x.fillRect(tx - 6 * s, ty - 50 * s, 12 * s, 50 * s);
          x.fillStyle = PR.leaf; x.beginPath(); x.arc(tx, ty - 72 * s, 36 * s, 0, Math.PI * 2); x.fill();
        }
      }
    });
    // river winding down the near hill
    x.fillStyle = PR.river; x.beginPath();
    const ry0 = R.y + hillY(2, 0.62) * R.h + 2;
    x.moveTo(R.x + 0.6 * R.w, ry0); x.bezierCurveTo(R.x + 0.52 * R.w, ry0 + 50, R.x + 0.78 * R.w, ry0 + 70, R.x + 0.6 * R.w, R.y + R.h);
    x.lineTo(R.x + 0.84 * R.w, R.y + R.h); x.bezierCurveTo(R.x + 0.9 * R.w, ry0 + 70, R.x + 0.6 * R.w, ry0 + 50, R.x + 0.66 * R.w, ry0); x.closePath(); x.fill();
    x.restore();
    x.strokeStyle = PR.ink; x.lineWidth = 5; x.strokeRect(R.x, R.y, R.w, R.h);
    // caption bars under the illustration
    x.fillStyle = PR.bar; x.fillRect(R.x, R.y + R.h + 30, R.w * 0.72, 12); x.fillRect(R.x, R.y + R.h + 58, R.w * 0.46, 12);
    // text column: dummy lines
    for (const l of L.lines) { x.fillStyle = l.para === 0 ? PR.barDark : PR.bar; x.fillRect(l.x, l.y, l.w, l.h); }
    // page number
    x.fillStyle = PR.bar; x.fillRect(W / 2 - 24, H - 62, 48, 10);
    void C;
  }

  // ---------------------------------------------------------------- layer 2: the hidden fluorescent ink (on black)
  function drawHidden(x, L) {
    const { W, H, illus: R, stamp: S } = L;
    const tint = [HD.cyan, HD.green, HD.lime];
    x.fillStyle = "#000000"; x.fillRect(0, 0, W, H);
    x.lineCap = "round"; x.lineJoin = "round";
    // guilloche band across the top margin
    for (let k = 0; k < 4; k++) {
      x.strokeStyle = k & 1 ? HD.magenta : HD.cyan; x.lineWidth = 3.5; x.beginPath();
      for (let i = 0; i <= 240; i++) {
        const u = i / 240, px = 96 + u * (W - 192), py = 58 + 24 * Math.sin(u * 46 + k * 1.57) * Math.cos(u * 7 + k);
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.stroke();
    }
    // neon contours over the illustration
    x.save();
    x.beginPath(); x.rect(R.x, R.y, R.w, R.h); x.clip();
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 3; j++) {
        x.save(); x.translate(0, j * 26);
        x.strokeStyle = k === 1 ? HD.cyan : HD.green; x.lineWidth = j ? 3 : 7; x.globalAlpha = j ? 0.6 : 1;
        hillPath(x, R, k, false); x.stroke();
        x.restore();
      }
    }
    const sx = R.x + SUN.u * R.w, sy = R.y + SUN.v * R.h, sr = SUN.r * R.h;
    x.strokeStyle = HD.lime; x.lineWidth = 7;
    for (const m of [1, 1.45, 1.9]) { x.beginPath(); x.arc(sx, sy, sr * m, 0, Math.PI * 2); x.stroke(); }
    x.lineWidth = 6;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      x.beginPath(); x.moveTo(sx + Math.cos(a) * sr * 2.2, sy + Math.sin(a) * sr * 2.2); x.lineTo(sx + Math.cos(a) * sr * 2.75, sy + Math.sin(a) * sr * 2.75); x.stroke();
    }
    x.restore();
    x.strokeStyle = HD.cyan; x.lineWidth = 6; x.setLineDash([26, 18]); x.strokeRect(R.x - 14, R.y - 14, R.w + 28, R.h + 28); x.setLineDash([]);
    // the repeating watermark lattice
    x.textAlign = "center"; x.textBaseline = "middle";
    for (const q of L.tiles) {
      x.save(); x.translate(q.px, q.py); x.rotate(q.rot);
      x.fillStyle = x.strokeStyle = tint[q.tint];
      if (q.kind === "glyph") {
        x.font = `800 64px ${HD.font}`;
        x.fillText(HD.mark, 0, 4);
        x.lineWidth = 5; x.beginPath(); x.roundRect(-58, -44, 116, 88, 18); x.stroke();
      } else {
        x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 26, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.arc(0, 0, 8, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; x.beginPath(); x.moveTo(Math.cos(a) * 36, Math.sin(a) * 36); x.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); x.stroke(); }
      }
      x.restore();
    }
    // code strip along the bottom margin
    for (const b of L.strip) { x.fillStyle = [HD.cyan, HD.magenta, HD.green][b.tint]; x.fillRect(b.x, H - 78 - (b.tall ? 14 : 0), b.w, 40 + (b.tall ? 14 : 0)); }
    // corner registration marks
    x.strokeStyle = HD.magenta; x.lineWidth = 5;
    for (const [cx, cy] of [[48, 48], [W - 48, 48], [48, H - 48], [W - 48, H - 48]]) {
      x.beginPath(); x.arc(cx, cy, 20, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(cx - 32, cy); x.lineTo(cx + 32, cy); x.moveTo(cx, cy - 32); x.lineTo(cx, cy + 32); x.stroke();
    }
    // the stamp
    x.save(); x.translate(S.cx, S.cy); x.rotate(S.rot);
    x.fillStyle = "#000000"; x.beginPath(); x.roundRect(-S.w / 2 - 34, -S.h / 2 - 34, S.w + 68, S.h + 68, 60); x.fill();
    x.strokeStyle = HD.magenta; x.lineWidth = 20; x.beginPath(); x.roundRect(-S.w / 2, -S.h / 2, S.w, S.h, 44); x.stroke();
    x.lineWidth = 6; x.beginPath(); x.roundRect(-S.w / 2 + 30, -S.h / 2 + 30, S.w - 60, S.h - 60, 24); x.stroke();
    let fs = 210;
    x.font = `800 ${fs}px ${HD.font}`;
    const tw = x.measureText(HD.stamp).width, maxW = S.w - 150;
    if (tw > maxW) { fs = Math.floor((fs * maxW) / tw); x.font = `800 ${fs}px ${HD.font}`; }
    x.fillStyle = HD.magenta; x.fillText(HD.stamp, 0, -30);
    x.font = `700 46px ${HD.font}`; x.fillStyle = HD.lime;
    const sub = HD.stampSub.split("").join(" ");
    x.fillText(sub, 0, S.h / 2 - 74);
    const sw = x.measureText(sub).width;
    for (const s of [-1, 1]) { x.beginPath(); x.arc(s * (sw / 2 + 44), S.h / 2 - 76, 11, 0, Math.PI * 2); x.fill(); x.fillRect(s * (sw / 2 + 170) - 90, S.h / 2 - 80, 180, 7); }
    // worn-rubber-stamp speckle (seeded knock-outs)
    const R2 = rng(913);
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 520; i++) { x.beginPath(); x.arc(R2.range(-S.w / 2, S.w / 2), R2.range(-S.h / 2, S.h / 2), R2.range(1.2, 4.2), 0, Math.PI * 2); x.fill(); }
    x.globalCompositeOperation = "source-over";
    x.restore();
    // destination-out leaves transparent holes: flatten onto black so the texture stays opaque
    x.globalCompositeOperation = "destination-over"; x.fillStyle = "#000000"; x.fillRect(0, 0, W, H); x.globalCompositeOperation = "source-over";
  }

  // ---------------------------------------------------------------- props
  /** desk() -> the oak desk top (XZ plane at y = 0) */
  function desk(o = {}) {
    const w = o.w ?? 12, d = o.d ?? 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), materials.desk);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "desk";
    return m;
  }

  /**
   * sheet(plan) -> Group (the two-layer page). userData.update(t) writes the pool + afterglow uniforms and the drop-in pose;
   * userData.uniforms exposes them. The hidden layer is emission x mask: mask is exactly 0 while the lamp is off.
   */
  function sheet(plan) {
    const L = plan.layout;
    const cv = newCanvas(L.W, L.H), ch = newCanvas(L.W, L.H);
    drawVisible(cv.getContext("2d"), L);
    drawHidden(ch.getContext("2d"), L);
    const visTex = canvasTexture(cv, { anisotropy: 8 }), hidTex = canvasTexture(ch, { anisotropy: 8 });
    for (const tx of [visTex, hidTex]) { tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; stage.renderer.initTexture(tx); }
    const U = {
      uHidden: { value: hidTex },
      uSheet: { value: new THREE.Vector2(PG.w, PG.h) },
      uPool: { value: new THREE.Vector3(0, 0, 1) },
      uOn: { value: 0 },
      uSoft: { value: TC.poolSoft },
      uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector3()) },
      uTrailR: { value: 0.4 },
      uGain: { value: HD.gain },
      uPaperGlow: { value: new THREE.Vector3(...HD.paperGlow) },
      uPoolTint: { value: new THREE.Vector3(...HD.poolTint) },
    };
    const mat = new THREE.MeshStandardMaterial({ map: visTex, roughness: PG.roughness, metalness: 0 });
    mat.name = "sheet";
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", /* glsl */ `
          uniform sampler2D uHidden; uniform vec2 uSheet; uniform vec3 uPool; uniform float uOn; uniform float uSoft;
          uniform vec3 uTrail[${TRAIL_N}]; uniform float uTrailR; uniform float uGain; uniform vec3 uPaperGlow; uniform vec3 uPoolTint;
          float uvG = 0.0;
          float uvMask(float d, float r) { return 1.0 - smoothstep(r * uSoft, r, d); }
          void main() {`)
        .replace("#include <map_fragment>", /* glsl */ `
          #include <map_fragment>
          {
            vec2 pm = vMapUv * uSheet;
            uvG = uOn * uvMask(distance(pm, uPool.xy), uPool.z);
            for (int i = 0; i < ${TRAIL_N}; i++) uvG = max(uvG, uTrail[i].z * uvMask(distance(pm, uTrail[i].xy), uTrailR));
            diffuseColor.rgb *= mix(vec3(1.0), uPoolTint, uvG);   // under UV the visible print sinks to deep violet
          }`)
        .replace("#include <emissivemap_fragment>", /* glsl */ `
          #include <emissivemap_fragment>
          totalEmissiveRadiance += (texture2D(uHidden, vMapUv).rgb * uGain + uPaperGlow) * uvG;`);
    };
    mat.customProgramCacheKey = () => "uv-reveal-sheet";
    const g = new THREE.Group(); g.name = "sheet";
    const top = new THREE.Mesh(new THREE.PlaneGeometry(PG.w, PG.h), mat);
    top.rotation.x = -Math.PI / 2; top.position.y = PG.thickness + 0.0005; top.receiveShadow = true;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PG.w, PG.thickness, PG.h), materials.paperEdge);
    slab.position.y = PG.thickness / 2; slab.castShadow = true; slab.receiveShadow = true;
    g.add(slab, top);
    const D = PG.drop, SH = HD.shimmer;
    g.userData = {
      uniforms: U, material: mat, textures: { visible: visTex, hidden: hidTex },
      update(t) {
        const e = ease.outCubic(clamp(t / D.dur)), k = 1 - e;
        g.position.set(-D.slide * k, D.from * k, 0.2 * k);
        g.rotation.set(D.tilt * k, D.yaw * k, -D.tilt * 0.7 * k);
        const p = plan.poolAt(t), s = torchplan.worldToSheet(p.x, p.z);
        U.uPool.value.set(s[0], s[1], p.r);
        U.uOn.value = plan.onAt(t);
        U.uTrailR.value = TC.afterglow.radius * Math.min(p.r, 1.2);
        const tr = plan.trailAt(t);
        for (let i = 0; i < TRAIL_N; i++) { const q = tr[i], w = torchplan.worldToSheet(q.x, q.z); U.uTrail.value[i].set(w[0], w[1], q.w); }
        U.uGain.value = HD.gain * (1 + SH.amp * Math.sin(2 * Math.PI * SH.hz * t));
      },
    };
    return g;
  }

  /** torch(plan) -> Group { torch body, SpotLight, beam }; userData.update(t) poses it from plan.torchAt(t). */
  function torch(plan) {
    const g = new THREE.Group(); g.name = "torch";
    const body = new THREE.Group();
    const cyl = (rT, rB, h, y, mat, seg = 40) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), mat); m.position.y = y + h / 2; m.castShadow = true; body.add(m); return m; };
    const lensMat = materials.torchLens;
    cyl(TC.headRadius * 0.86, TC.headRadius, TC.headLength, 0, materials.torchBody);                       // head (lens end at y = 0)
    cyl(TC.headRadius * 0.9, TC.headRadius * 0.9, 0.03, TC.headLength - 0.01, materials.torchRing);        // bezel ring
    cyl(TC.radius, TC.radius, TC.length - TC.headLength, TC.headLength, materials.torchBody);              // barrel
    for (let i = 0; i < 4; i++) cyl(TC.radius * 1.07, TC.radius * 1.07, 0.06, TC.headLength + 0.2 + i * 0.1, materials.torchGrip, 24); // grip bands
    cyl(TC.radius * 0.8, TC.radius * 1.02, 0.05, TC.length, materials.torchGrip);                           // tail cap
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.05), new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.5 }));
    btn.position.set(0, TC.headLength + 0.09, TC.radius); btn.castShadow = true; body.add(btn);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(TC.headRadius * 0.86, 40), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.y = -0.002; body.add(lens);
    g.add(body);
    const spot = new THREE.SpotLight(TC.spot.color, 0, 0, 0.7, TC.spot.penumbra, 2);
    spot.name = "uvSpot";
    g.add(spot, spot.target);
    // additive cone beam: unit truncated cone hanging from the lens along -Y, scaled to the pool every frame
    const bgeo = new THREE.CylinderGeometry(0.16, 1, 1, 56, 1, true); bgeo.translate(0, -0.5, 0);
    const bmat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(TC.beam.color) }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vH;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; vH = uv.y; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        ${GLSL_SAFE}
        uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vH;
        void main() {
          float rim = abs(dot(safeNorm(vN), safeNorm(vV)));
          float a = uOpacity * safePow(rim, 1.6) * mix(0.3, 1.0, vH);
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const beam = new THREE.Mesh(bgeo, bmat); beam.name = "uvBeam"; beam.userData.noDepth = true; beam.renderOrder = 3;
    g.add(beam);
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    const E0 = TC.spot.candela;   // candela at 1 m: the spot keeps the same irradiance on the sheet at any lens distance
    g.userData = {
      spot, beam, body,
      update(t) {
        const s = plan.torchAt(t), on = plan.onAt(t), fl = plan.floodAt(t);
        dir.set(...s.dir); q.setFromUnitVectors(up, dir);
        body.position.set(...s.lens); body.quaternion.copy(q);
        spot.position.set(...s.lens); spot.target.position.set(s.pool.x, 0, s.pool.z);
        const half = Math.atan2(s.pool.r, s.dist);
        spot.angle = Math.min(half * 1.18, 1.45);
        spot.intensity = E0 * on * (1 - fl) * s.dist * s.dist;
        beam.position.set(...s.lens); beam.quaternion.copy(q);
        const len = s.dist * 1.3, rad = len * Math.tan(Math.min(half, 1.2));
        beam.scale.set(rad, len, rad);
        bmat.uniforms.uOpacity.value = TC.beam.opacity * on * (1 - fl);
        beam.visible = bmat.uniforms.uOpacity.value > 0.002;
        lensMat.emissiveIntensity = 0.001 + TC.lensGlow * on;
      },
    };
    return g;
  }

  /** pencil() -> a hexagonal pencil lying on the desk (length along local X) */
  function pencil(o = {}) {
    const len = o.length ?? 1.1, r = o.radius ?? 0.035;
    const g = new THREE.Group(); g.name = "pencil";
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), materials.pencilPaint);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 3.2, 6), materials.pencilWood); cone.position.y = len / 2 + r * 1.6;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.34, r * 1.1, 6), materials.graphite); tip.position.y = len / 2 + r * 2.66;
    const inner = new THREE.Group(); inner.add(shaft, cone, tip); inner.rotation.z = -Math.PI / 2; inner.position.y = r * 0.9;
    inner.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(inner);
    return g;
  }
  /** marker() -> a highlighter pen (fluoresces under UV: the scene sets materials.marker.emissiveIntensity) */
  function marker(o = {}) {
    const len = o.length ?? 0.7, r = o.radius ?? 0.06;
    const g = new THREE.Group(); g.name = "marker";
    const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), materials.marker);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, len * 0.3, 24), materials.markerCap); cap.position.y = len * 0.5;
    const inner = new THREE.Group(); inner.add(bodyM, cap); inner.rotation.z = -Math.PI / 2; inner.position.y = r * 1.08;
    inner.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(inner);
    return g;
  }

  /** caption() -> overlay chip (dark plate, violet edge, a glowing dot, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.36);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.7) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(0,0,0,0.3)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 18); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 18); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 16.5); x.stroke();
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;
      x.fillStyle = Q.edge; x.beginPath(); x.arc(cx, cy, ic / 2, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.dot; x.beginPath(); x.arc(cx, cy, ic / 4, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.7), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  /**
   * uvDesk(plan, { marker: [x, z], pencil: [x, z] }) -> { group, sheet, torch, update(t) }
   * The whole set: desk, sheet, torch, pencil, highlighter. update(t) also drives the room: key/fill x roomAt(t),
   * the violet uvFill, the background colour, bloom strength and the highlighter's fluorescence.
   */
  function uvDesk(plan, o = {}) {
    const group = new THREE.Group(); group.name = "uvDesk";
    const sh = sheet(plan), tc = torch(plan);
    const pc = pencil(), mk = marker();
    const mp = o.marker ?? [2.25, 0.55], pp = o.pencil ?? [-2.3, -0.2];
    mk.position.set(mp[0], 0, mp[1]); mk.rotation.y = 1.1;
    pc.position.set(pp[0], 0, pp[1]); pc.rotation.y = 1.35;
    group.add(desk(), sh, tc, pc, mk);
    stage.scene.add(group);
    const update = (t) => {
      const room = plan.roomAt(t), on = plan.onAt(t), fl = plan.floodAt(t);
      sh.userData.update(t); tc.userData.update(t);
      lights.fill.intensity = base.fill * room;
      lights.key.intensity = base.key * room;
      lights.uvFill.intensity = lerp(TC.uvFill.torch, TC.uvFill.flood, fl) * on;
      stage.scene.background.copy(bgLit).lerp(bgDark, 1 - room);
      materials.marker.emissiveIntensity = 0.001 + 1.5 * Math.max(plan.maskAt(t, mp[0], mp[1]), fl * on);
      if (post) post.set({ bloom: { strength: TC.bloom * on } });
    };
    return { group, sheet: sh, torch: tc, pencil: pc, marker: mk, update };
  }

  const props = { desk, sheet, torch, pencil, marker, caption, uvDesk };
  const factories = {};
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx, plan: torchplan, motion: torchplan };
}
