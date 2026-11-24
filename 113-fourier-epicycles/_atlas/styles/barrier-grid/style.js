// styles/barrier-grid/style.js — "Barrier Grid" (scanimation): a cream card with an interlaced print of six frames of a
// flapping bird on a light wooden desk, and a clear acetate sheet of black stripes a hair above it. The look lives in
// spec.js; the bird frames, the interlace and WHEN the sheet moves live in barrier.js (THREE-free planner shared with SCORE).
// This file turns the plan into pictures:
//   * The PRINT: one ShaderMaterial on the card's face. For each pixel: strip i = floor((x + picW/2)/w), frame i mod 6,
//     that frame's bird evaluated analytically (uneven capsules, circles, triangles from the planner), anti-aliased per
//     pixel, with an analytic box-filter blend across strip boundaries; an index comb under the picture; a keyline; paper
//     mottling; and the acetate's soft shadow, computed exactly (the acetate point on the light ray from this pixel).
//     The print never depends on t.
//   * The BARRIER: one ShaderMaterial on a real second plane a hair above the card: opaque stripes (N − slit strips) and
//     clear slits (slit strips), analytic AA, a faint film sheen and a lit cut edge. Its x position = offset·w is the only
//     animated input; the picture moves because the slits uncover different strips.
//   * The desk (light maple), card body with an edge, soft drop shadows, the acetate rim, and an overlay caption chip.
// Props never animate themselves: the scene calls grid.update(t) and rig.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { softRectTexture } from "../../kit/textures.js";
import * as barrier from "./barrier.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, G = spec.grid, C = spec.card, AC = spec.acetate, PU = spec.pulse;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const N = G.frames, W = G.strip;
  const nStrips = Math.round(C.picW / W);
  const lin = (hex) => new THREE.Color(hex);           // ColorManagement: hex (sRGB) -> linear working colour
  const L = new THREE.Vector3(...AC.shadow.light).normalize();

  /** cardRect() -> { x0, x1, y0, y1 } of the whole card (picture centred on the origin) */
  const cardRect = () => ({
    x0: -C.picW / 2 - C.margin.side, x1: C.picW / 2 + C.margin.side,
    y0: -C.picH / 2 - C.margin.bottom, y1: C.picH / 2 + C.margin.top,
  });

  // ---------------------------------------------------------------- desk
  /** desk() -> Mesh: a big light-maple plane at z = 0 (the card lies on it) */
  function desk(o = {}) {
    const size = o.size ?? [9, 6];
    const mat = materials.desk;
    if (mat.map) { mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(size[0] / 1.3, size[1] / 1.3); mat.map.anisotropy = 8; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
    m.position.set(0, -0.1, 0); m.name = "desk";
    return m;
  }

  /** softShadow(w, h, soft, opacity) -> Mesh: a blurred rounded-rect shadow quad (kit softRectTexture), black */
  function softShadow(w, h, soft, opacity) {
    const tex = softRectTexture({ soft: 0.18, radius: 0.04 });
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * soft, h + 2 * soft), mat);
    m.renderOrder = 1;
    return m;
  }

  // ---------------------------------------------------------------- the print (card face shader)
  /** printMaterial(frames) -> ShaderMaterial for the card face; userData.setAcetate(x, gap, visible) feeds the shadow */
  function printMaterial(frames) {
    const pk = barrier.packFrames(frames);
    const PA = [], PB = [];
    for (let i = 0; i < pk.A.length; i += 4) {
      PA.push(new THREE.Vector4(pk.A[i], pk.A[i + 1], pk.A[i + 2], pk.A[i + 3]));
      PB.push(new THREE.Vector4(pk.B[i], pk.B[i + 1], pk.B[i + 2], pk.B[i + 3]));
    }
    const mat = new THREE.ShaderMaterial({
      name: "barrierPrint",
      uniforms: {
        uPA: { value: PA }, uPB: { value: PB },
        uPic: { value: new THREE.Vector2(C.picW, C.picH) }, uW: { value: W }, uNS: { value: nStrips },
        uBand: { value: new THREE.Vector4(C.band.y0, C.band.y1, C.meter.y0, C.meter.h) }, uKey: { value: new THREE.Vector2(C.keyline, C.keylineGap ?? 0.005) },
        uPaper: { value: lin(P.paper) }, uTeal: { value: lin(P.teal) }, uInk: { value: lin(P.ink) },
        uLevel: { value: C.level }, uGrain: { value: C.grain }, uGrad: { value: C.gradient ?? 0.04 },
        uRing: { value: new THREE.Vector4(PU.centre[0], PU.centre[1], PU.spacing, PU.width) },
        uRing2: { value: new THREE.Vector4(PU.tint, PU.fadeFrom, PU.fadeTo, PU.fade) }, uRingY: { value: PU.yMin },
        uAcX: { value: 0 }, uAcRect: { value: new THREE.Vector4(AC.left, AC.right, AC.bottom, AC.top) },
        uGap: { value: G.gap }, uL: { value: L.clone() }, uShStr: { value: 0 }, uPen: { value: AC.shadow.penumbra },
        uSlit: { value: G.slit }, uClear: { value: AC.clear },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${barrier.printGLSL(pk.slots, N)}
        uniform vec2 uPic, uKey; uniform float uW, uNS; uniform vec4 uBand;
        uniform vec3 uPaper, uTeal, uInk; uniform float uLevel, uGrain, uGrad;
        uniform vec4 uRing, uRing2; uniform float uRingY;
        uniform float uAcX, uGap, uShStr, uPen, uSlit, uClear; uniform vec4 uAcRect; uniform vec3 uL;
        varying vec3 vW;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
        }
        // signed distance (in strips) from strip-coordinate u to the nearest clear slit [0, uSlit) of a period of BG_N
        float slitSD(float u) {
          float m = mod(u, float(BG_N));
          float inside = min(m, uSlit - m), outside = -min(m - uSlit, float(BG_N) - m);
          return m < uSlit ? inside : outside;
        }
        // wing-beat pulse rings of frame k (twin of barrier.pulseRing): radius (n + k/N)·spacing, faded outward
        float pulseRing(float k, vec2 p, float aa) {
          float d = length(p - uRing.xy);
          float ph = d / uRing.z - k / float(BG_N);
          float e = abs(fract(ph + 0.5) - 0.5) * uRing.z - uRing.w * 0.5;
          float cov = 1.0 - smoothstep(-aa, aa, e);
          float fade = 1.0 - uRing2.w * clamp((d - uRing2.y) / (uRing2.z - uRing2.y), 0.0, 1.0);
          return cov * fade * clamp((p.y - uRingY) / 0.015, 0.0, 1.0);
        }
        // colour of print strip i at p (no derivatives in here: aa widths come from main)
        vec3 stripColour(float i, vec2 p, float aa, float aay) {
          float inX = step(0.0, i) * step(i, uNS - 1.0);
          float k = mod(i, float(BG_N));
          float dT, dK;
          frameSD(int(k + 0.5), p, dT, dK);
          float inPic = inX * step(abs(p.y), uPic.y * 0.5);
          vec3 c = uPaper;
          c = mix(c, mix(uPaper, uTeal, uRing2.x), inPic * pulseRing(k, p, aa));
          c = mix(c, uTeal, inPic * (1.0 - smoothstep(-aa, aa, dT)));
          c = mix(c, uInk, inPic * (1.0 - smoothstep(-aa, aa, dK)));
          float mtop = uBand.z + (k + 1.0) / float(BG_N) * uBand.w;
          float inMeter = inX * smoothstep(uBand.z - aay, uBand.z + aay, p.y) * (1.0 - smoothstep(mtop - aay, mtop + aay, p.y));
          c = mix(c, uTeal, inMeter);
          float top = uBand.x + (k + 1.0) / float(BG_N) * (uBand.y - uBand.x);
          float inBand = inX * smoothstep(uBand.x - aay, uBand.x + aay, p.y) * (1.0 - smoothstep(top - aay, top + aay, p.y));
          return mix(c, uInk, inBand);
        }
        void main() {
          vec2 p = vW.xy;
          float s = (p.x + uPic.x * 0.5) / uW;
          float fw = max(fwidth(s), 1e-4);
          vec2 fp = fwidth(p);
          float aa = max(0.7 * max(fp.x, fp.y), 2e-5);
          float aay = max(0.7 * fp.y, 1e-5);
          // box-filtered strip boundary: blend this strip with the nearer neighbour by the pixel's overlap
          float i = floor(s), f = s - i;
          float dir = f < 0.5 ? -1.0 : 1.0;
          float wN = clamp(0.5 - min(f, 1.0 - f) / fw, 0.0, 0.5);
          vec3 col = mix(stripColour(i, p, aa, aay), stripColour(i + dir, p, aa, aay), wN);
          // keyline: a printed frame around the picture, uKey.y outside it
          vec2 q = abs(p) - uPic * 0.5;
          float dBox = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float kd = abs(dBox - uKey.y) - uKey.x * 0.5;
          col = mix(col, uInk, 1.0 - smoothstep(-aa, aa, kd));
          // paper: low-frequency mottling + a gentle light gradient (brighter top-left)
          float g = (vnoise(p * 18.0) - 0.5) + 0.5 * (vnoise(p * 55.0 + 7.0) - 0.5);
          float lit = uLevel * (1.0 + uGrain * g) * (1.0 + uGrad * clamp(-p.x * 0.45 + p.y * 0.6, -1.0, 1.0));
          // the acetate's shadow: the acetate point on the light ray from this pixel, its stripes/slits + edges, soft
          vec2 a = p + uL.xy * (uGap / uL.z);
          float ax = a.x - uAcX;
          float pen = max(uPen * uGap, aa);
          float inRect = smoothstep(uAcRect.x - pen, uAcRect.x + pen, ax) * (1.0 - smoothstep(uAcRect.y - pen, uAcRect.y + pen, ax))
                       * smoothstep(uAcRect.z - pen, uAcRect.z + pen, a.y) * (1.0 - smoothstep(uAcRect.w - pen, uAcRect.w + pen, a.y));
          float open = clamp(0.5 + slitSD(ax / uW) / max(pen / uW, fw), 0.0, 1.0);
          float shade = uShStr * inRect * mix(1.0, uClear * 2.0, open);
          col *= lit * (1.0 - shade);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    mat.userData.setAcetate = (x, gap, on) => {
      const U = mat.uniforms;
      U.uAcX.value = x; U.uGap.value = gap; U.uShStr.value = on ? AC.shadow.strength : 0;
    };
    return mat;
  }

  /** card(frames) -> Group: card body (extruded rounded rect, edge only), the print face, a soft drop shadow on the desk */
  function card(frames, o = {}) {
    const g = new THREE.Group(); g.name = "card";
    const R = cardRect(), r = o.radius ?? 0.018;
    const shape = new THREE.Shape();
    shape.moveTo(R.x0 + r, R.y0); shape.lineTo(R.x1 - r, R.y0); shape.quadraticCurveTo(R.x1, R.y0, R.x1, R.y0 + r);
    shape.lineTo(R.x1, R.y1 - r); shape.quadraticCurveTo(R.x1, R.y1, R.x1 - r, R.y1); shape.lineTo(R.x0 + r, R.y1);
    shape.quadraticCurveTo(R.x0, R.y1, R.x0, R.y1 - r); shape.lineTo(R.x0, R.y0 + r); shape.quadraticCurveTo(R.x0, R.y0, R.x0 + r, R.y0);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: C.thick, bevelEnabled: false, curveSegments: 8 }),
      [new THREE.MeshBasicMaterial({ visible: false }), materials.cardEdge]);
    body.name = "cardBody"; g.add(body);
    const face = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), printMaterial(frames));
    face.position.z = C.thick; face.name = "print"; g.add(face);
    const SC = C.shadowCard;
    const sh = softShadow(R.x1 - R.x0, R.y1 - R.y0, SC.soft, SC.opacity);
    sh.position.set((R.x0 + R.x1) / 2 + SC.offset[0], (R.y0 + R.y1) / 2 + SC.offset[1], 0.0006); sh.name = "cardShadow";
    g.add(sh);
    g.userData.face = face;
    return g;
  }

  // ---------------------------------------------------------------- the barrier (acetate)
  /** barrierMaterial() -> transparent ShaderMaterial: black stripes, clear slits, film sheen, lit cut edge (local coords) */
  function barrierMaterial() {
    return new THREE.ShaderMaterial({
      name: "barrierSheet",
      transparent: true, depthWrite: true,
      uniforms: {
        uW: { value: W }, uSlit: { value: G.slit }, uBar: { value: lin(P.barrier) },
        uClear: { value: AC.clear }, uSheen: { value: AC.sheen }, uEdge: { value: AC.edgeGlow },
        uRect: { value: new THREE.Vector4(AC.left, AC.right, AC.bottom, AC.top) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec2 vL;
        void main() { vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        #define BG_N ${N}
        uniform float uW, uSlit, uClear, uSheen, uEdge; uniform vec3 uBar; uniform vec4 uRect;
        varying vec3 vW; varying vec2 vL;
        void main() {
          float u = vL.x / uW;
          float fw = max(fwidth(u), 1e-4);
          vec2 fl = fwidth(vL);
          float m = mod(u, float(BG_N));
          float sd = m < uSlit ? min(m, uSlit - m) : -min(m - uSlit, float(BG_N) - m);
          float open = clamp(0.5 + sd / fw, 0.0, 1.0);
          // film sheen: a broad soft highlight fixed to the room (world space), brighter toward the top right
          float band = (vW.x * 0.5 + vW.y * 0.85 - 0.18) / 0.42;
          float sheen = uSheen * (0.3 + 0.7 * exp(-band * band));
          // the cut edge catches the light: a thin bright line along the sheet's boundary
          float de = min(min(vL.x - uRect.x, uRect.y - vL.x), min(vL.y - uRect.z, uRect.w - vL.y));
          float ew = max(max(fl.x, fl.y) * 1.2, 0.0007);
          float edge = uEdge * (1.0 - smoothstep(0.0, ew, de));
          vec3 stripe = uBar + vec3(sheen * 0.9) + vec3(edge);
          vec3 film = vec3(1.0);
          float aStripe = 1.0;
          float aFilm = clamp(uClear + sheen * 0.6 + edge, 0.0, 1.0);
          vec3 col = mix(stripe, film, open);
          float alpha = mix(aStripe, aFilm, open);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  /** acetate() -> Group: the striped sheet (local x from the picture's left edge), its rim, its soft shadow on the desk.
   *  userData.set(offsetStrips, gap, visible) */
  function acetate(o = {}) {
    const g = new THREE.Group(); g.name = "acetate";
    const w = AC.right - AC.left, h = AC.top - AC.bottom;
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(AC.left + w / 2, AC.bottom + h / 2, 0);
    const sheet = new THREE.Mesh(geo, barrierMaterial()); sheet.renderOrder = 4; sheet.name = "barrierSheet";
    const sheetG = new THREE.Group(); sheetG.add(sheet);
    // rim: the sheet's thickness, seen in the oblique macro
    const t = AC.thick;
    const rimMat = materials.acetateRim;
    const rims = [
      [w, 0.0012, AC.left + w / 2, AC.bottom], [w, 0.0012, AC.left + w / 2, AC.top],
      [0.0012, h, AC.left, AC.bottom + h / 2], [0.0012, h, AC.right, AC.bottom + h / 2],
    ];
    for (const [bw, bh, x, y] of rims) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), rimMat);
      rim.position.set(x, y, -t / 2); rim.renderOrder = 3; sheetG.add(rim);
    }
    g.add(sheetG);
    const DS = AC.deskShadow;
    const dsh = softShadow(w, h, DS.soft, DS.opacity); dsh.name = "acetateDeskShadow";
    g.add(dsh);
    const x0 = -C.picW / 2;
    g.userData.sheet = sheet;
    g.userData.set = (off, gap, on) => {
      g.visible = on;
      const x = x0 + off * W, z = C.thick + gap;
      sheetG.position.set(x, 0, z);
      dsh.position.set(x + AC.left + w / 2 - (L.x / L.z) * z, AC.bottom + h / 2 - (L.y / L.z) * z, 0.0004);
    };
    g.userData.set(0, G.gap, false);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (dark plate, small barrier icon, cream text), bottom centre; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.38)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(Wc - 16, pad + ic + pad + tw + pad), ph = Q.h;
      const ox = Math.round((Wc - pw) / 2), oy = 6;
      x.fillStyle = "rgba(0,0,0,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.globalAlpha = 0.35; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 15); x.stroke(); x.globalAlpha = 1;
      // icon: a little card behind a striped sheet, one clear teal slit
      const ix = ox + pad, iy = oy + Math.round((ph - ic) / 2);
      x.fillStyle = Q.iconPaper; x.beginPath(); x.roundRect(ix, iy, ic, ic, 6); x.fill();
      const bw = ic / 6;
      for (let j = 0; j < 6; j++) {
        x.fillStyle = j === 3 ? Q.accent : Q.iconBar;
        x.fillRect(ix + j * bw + (j === 3 ? 1 : 0.5), iy + 3, bw - (j === 3 ? 2 : 1), ic - 6);
      }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ix + ic + pad, oy + Math.round(ph / 2) + 1);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.cx - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * barrierGrid(plan) -> { group, card, print, acetate, frames, update(t) } (adds itself to the scene)
   *   update(t): the barrier's x (plan.offset), its height (plan.gap: hovering while it slides in) and visibility, and
   *   the matching analytic shadow on the print. Nothing else moves: the card never changes.
   */
  function barrierGrid(plan, o = {}) {
    const group = new THREE.Group(); group.name = "barrierGrid";
    const frames = barrier.birdFrames(spec.bird, N);
    group.add(desk());
    const cd = card(frames); group.add(cd);
    const ac = acetate(); group.add(ac);
    stage.scene.add(group);
    const printMat = cd.userData.face.material;
    return {
      group, card: cd, print: cd.userData.face, acetate: ac, frames,
      update(t) {
        const u = plan.uniformsAt(t);
        ac.userData.set(u.offset, u.gap, u.visible);
        printMat.userData.setAcetate(-C.picW / 2 + u.offset * W, u.gap, u.visible);
        return u;
      },
    };
  }

  const props = { desk, card, printMaterial, acetate, barrierMaterial, softShadow, caption, barrierGrid };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: barrier, motion: barrier, cardRect,
  };
}
