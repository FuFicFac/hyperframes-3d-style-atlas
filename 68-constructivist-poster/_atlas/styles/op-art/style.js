// styles/op-art/style.js — "Op Art". The look lives in spec.js; WHEN each pattern changes lives in opplan.js (THREE-free,
// shared with SCORE). This file turns a plan into pictures: a white gallery wall + floor, one hard-edged panel (a box
// whose front face is an analytic pattern shader: stripes + travelling bulge, rings, Vasarely dome/tunnel grid), a
// separate clear acetate sheet of rings in front of it for the moiré, and an overlay gallery-label caption.
// Every pattern edge is antialiased with fwidth (a one-pixel box filter) and fades to its mean grey when a period
// drops below ~2 px, so nothing shimmers. Derivatives are taken unconditionally (no per-pixel branches).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as opplan from "./opplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// black coverage of the interval [0, duty) of a period-1 pattern at phase `ph`, box-filtered over `w` phase units/pixel;
// below Nyquist (w in nyq band) it fades to the mean (= duty) instead of aliasing.
const AA = /* glsl */ `
uniform vec2 uNyq;
float aaPulse(float ph, float duty, float w) {
  float sd = abs(fract(ph - duty * 0.5 + 0.5) - 0.5) - duty * 0.5;
  float cov = clamp(0.5 - sd / max(w, 1e-5), 0.0, 1.0);
  return mix(cov, duty, smoothstep(uNyq.x, uNyq.y, w));
}`;

const PANEL_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec2 uSize;
uniform vec3 uBlack, uWhite, uRed, uBlue;
uniform vec2 uStripe;           // period, duty
uniform vec4 uBulge;            // cx, cy, R, A
uniform vec4 uShade;            // strength, mid, dutyMin, dutyMax
uniform vec3 uLight;
uniform float uWipe;            // x of the stripes -> rings wipe
uniform vec2 uRings;            // period, duty
uniform vec4 uGrid;             // cell, lensR, rcBig, rcSmall
uniform float uDome;            // current lens strength (+ dome, - tunnel)
uniform vec2 uReveal, uFlip;    // (t0, step) per Chebyshev ring
uniform float uAccent;          // rings <= this get the accent colour
${AA}
void main() {
  vec2 p = (vUv - 0.5) * uSize;

  // ---- 1. stripes + bulge -----------------------------------------------------------------------------
  vec2 d = p - uBulge.xy;
  float R = max(uBulge.z, 1e-3);
  float u2 = dot(d, d) / (R * R);
  float g = 1.0 - min(u2, 1.0); g *= g;                       // C1 at the rim: the warp joins the flat field smoothly
  float phx = (uBulge.x + d.x * (1.0 - uBulge.w * g)) / uStripe.x;
  float wS = fwidth(phx);
  vec3 n = vec3(d / R, sqrt(max(0.0, 1.0 - u2)));
  float shade = dot(n, normalize(uLight)) - uShade.y;
  float ew = fwidth(u2) * 0.75 + 1e-5;
  float inside = (1.0 - smoothstep(1.0 - ew, 1.0 + ew, u2)) * step(0.002, uBulge.z);
  float duty = clamp(uStripe.y - uShade.x * shade * inside, uShade.z, uShade.w);
  float covS = aaPulse(phx, duty, wS);
  vec3 colS = mix(uWhite, uBlack, covS);

  // ---- 2. concentric rings ----------------------------------------------------------------------------
  float rr = length(p) / uRings.x;
  float covR = aaPulse(rr, uRings.y, fwidth(rr));
  vec3 colR = mix(uWhite, uBlack, covR);
  float wipeW = fwidth(p.x) * 0.5 + 1e-5;
  vec3 col = mix(colS, colR, 1.0 - smoothstep(uWipe - wipeW, uWipe + wipeW, p.x));

  // ---- 3. Vasarely grid: checker squares + circles, lens dome / tunnel ----------------------------------
  float lr = dot(p, p) / (uGrid.y * uGrid.y);
  float lg = max(0.0, 1.0 - lr); lg *= lg;
  vec2 q = p * (1.0 - uDome * lg) / uGrid.x + 0.5;            // cell coords; cell (0,0) centred on the panel
  vec2 wq = fwidth(q);
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float ring = max(abs(id.x), abs(id.y));
  float cx = aaPulse(q.x * 0.5, 0.5, wq.x * 0.5);
  float cy = aaPulse(q.y * 0.5, 0.5, wq.y * 0.5);
  float checker = cx * (1.0 - cy) + (1.0 - cx) * cy;          // black coverage (box-filtered XOR)
  float cellBlack = mod(id.x + id.y, 2.0);                    // 1 = this cell's square is black (matches checker)
  float tIn = uReveal.x + ring * uReveal.y;
  float tFl = uFlip.x + ring * uFlip.y;
  float shown = step(tIn, uTime);
  float fl = step(tFl, uTime);
  float flp = smoothstep(tFl, tFl + 0.28, uTime);
  float rn = clamp(ring / 7.0, 0.0, 1.0);
  float rcDome = mix(uGrid.z, uGrid.w, rn * rn);              // big circles at the centre -> dome
  float rcTun = mix(uGrid.w, uGrid.z, sqrt(rn));              // small at the centre -> tunnel
  float grow = smoothstep(tIn, tIn + 0.32, uTime);
  float rc = mix(rcDome, rcTun, flp) * grow;
  float sdC = length(f) - rc;
  float covC = clamp(0.5 - sdC / max(max(wq.x, wq.y), 1e-5), 0.0, 1.0) * step(0.001, rc);
  float sqBlack = abs(checker - fl);
  vec3 sqCol = mix(uWhite, uBlack, sqBlack);
  float cBlack = abs(1.0 - cellBlack - fl);                    // circle = the opposite of its square
  vec3 cCol = mix(uWhite, uBlack, cBlack);
  float acc = step(ring, uAccent + 0.5);
  cCol = mix(cCol, mix(uRed, uBlue, fl), acc);
  vec3 colG = mix(sqCol, cCol, covC);
  col = mix(col, colG, shown);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const ACETATE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 uSize;
uniform vec3 uBlack;
uniform vec2 uRings;            // period, duty
uniform vec3 uSheet;            // tint alpha, frame width (m), ink opacity
uniform float uOpacity;
${AA}
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float rr = length(p) / uRings.x;
  float cov = aaPulse(rr, uRings.y, fwidth(rr));
  vec2 e = 0.5 * uSize - abs(p);
  float ew = fwidth(p.x) + 1e-5;
  float frame = 1.0 - smoothstep(uSheet.y - ew, uSheet.y + ew, min(e.x, e.y));
  float a = max(cov * uSheet.z, max(uSheet.x, frame * 0.35));
  gl_FragColor = vec4(uBlack, a * uOpacity);
  #include <colorspace_fragment>
}`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const PAL = spec.palette, PT = spec.pattern, PN = spec.panel;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const lin = (hex) => new THREE.Color(hex); // THREE.Color stores linear (ColorManagement on)
  const panelFront = PN.standoff + PN.depth;

  // ---------------------------------------------------------------- room
  /** room() -> Group: white gallery wall (z = 0 plane) + pale floor; both receive the panel's shadow */
  function room(o = {}) {
    const g = new THREE.Group(); g.name = "room";
    const W = o.w ?? spec.wall.w, H = o.h ?? spec.wall.h;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), materials.wall);
    wall.position.set(0, H / 2, 0); wall.receiveShadow = true; wall.name = "wall"; g.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 16), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 8); floor.receiveShadow = true; floor.name = "floor"; g.add(floor);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 0.015), materials.edge);
    skirt.position.set(0, 0.05, 0.0075); skirt.receiveShadow = true; g.add(skirt);
    return g;
  }

  // ---------------------------------------------------------------- panel
  /** panel() -> Mesh: the hard-edged artwork board. Front face = analytic pattern shader. userData.update(state, t). */
  function panel() {
    const mat = new THREE.ShaderMaterial({
      name: "opPattern",
      vertexShader: VERT, fragmentShader: PANEL_FRAG, toneMapped: false,
      uniforms: {
        uTime: { value: 0 }, uSize: { value: new THREE.Vector2(PN.w, PN.h) }, uNyq: { value: new THREE.Vector2(...PT.nyquist) },
        uBlack: { value: lin(PAL.black) }, uWhite: { value: lin(PAL.white) }, uRed: { value: lin(PAL.red) }, uBlue: { value: lin(PAL.blue) },
        uStripe: { value: new THREE.Vector2(PT.stripe.period, PT.stripe.duty) },
        uBulge: { value: new THREE.Vector4(0, 0, 0, PT.bulge.A) },
        uShade: { value: new THREE.Vector4(PT.bulge.shade, PT.bulge.shadeMid, PT.bulge.dutyMin, PT.bulge.dutyMax) },
        uLight: { value: new THREE.Vector3(...PT.bulge.light) },
        uWipe: { value: -10 },
        uRings: { value: new THREE.Vector2(PT.rings.period, PT.rings.duty) },
        uGrid: { value: new THREE.Vector4(PT.grid.cell, PT.grid.lensR, PT.grid.rcBig, PT.grid.rcSmall) },
        uDome: { value: 0 },
        uReveal: { value: new THREE.Vector2(1e6, 0) }, uFlip: { value: new THREE.Vector2(1e6, 0) },
        uAccent: { value: PT.grid.accentRings },
      },
    });
    const E = materials.edge, Bk = materials.back;
    const geo = new THREE.BoxGeometry(PN.w, PN.h, PN.depth);
    const mesh = new THREE.Mesh(geo, [E, E, E, E, mat, Bk]); // groups: +x -x +y -y +z(front) -z
    mesh.position.set(0, PN.y, PN.standoff + PN.depth / 2);
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.name = "panel";
    const U = mat.uniforms;
    mesh.userData.update = (s, t) => {
      U.uTime.value = t;
      U.uBulge.value.set(s.bulge[0], s.bulge[1], s.bulge[2], s.bulge[3]);
      U.uWipe.value = s.wipe;
      U.uDome.value = s.dome;
      U.uReveal.value.set(s.gridReveal[0], s.gridReveal[1]);
      U.uFlip.value.set(s.flip[0], s.flip[1]);
    };
    mesh.userData.box = [[-PN.w / 2, PN.y - PN.h / 2, PN.standoff], [PN.w / 2, PN.y + PN.h / 2, panelFront]];
    return mesh;
  }

  // ---------------------------------------------------------------- acetate
  /** acetate() -> Mesh: clear sheet of black rings, `gap` in front of the panel. userData.update(state.acetate). */
  function acetate() {
    const A = PT.acetate;
    const mat = new THREE.ShaderMaterial({
      name: "opAcetate",
      vertexShader: VERT, fragmentShader: ACETATE_FRAG, toneMapped: false,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uSize: { value: new THREE.Vector2(A.w, A.h) }, uNyq: { value: new THREE.Vector2(...PT.nyquist) },
        uBlack: { value: lin(PAL.black) },
        uRings: { value: new THREE.Vector2(A.period, A.duty) },
        uSheet: { value: new THREE.Vector3(A.tint, A.frame, A.ink) },
        uOpacity: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(A.w, A.h), mat);
    mesh.position.set(0, PN.y, panelFront + A.gap);
    mesh.renderOrder = 2; mesh.name = "acetate"; mesh.visible = false;
    mesh.userData.update = (a) => { mesh.visible = a.on; mesh.position.x = a.x; };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay caption (gallery wall label)
  /** caption() -> overlay card centred at spec.caption.x; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.3)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), mk = Math.round(Q.cap * 0.42);
      const pw = Math.min(W - 12, pad + mk + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 4, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(0,0,0,0.10)"; x.fillRect(ox + 3, oy + 5, pw, ph);
      x.fillStyle = Q.card; x.fillRect(ox, oy, pw, ph);
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.strokeRect(ox + 1, oy + 1, pw - 2, ph - 2);
      x.fillStyle = Q.mark; x.fillRect(ox + pad, oy + Math.round((ph - mk) / 2), mk, mk);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + mk + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** gallery(plan) -> { group, panel, acetate, update(t) } (adds itself to the scene) */
  function gallery(plan) {
    const group = new THREE.Group(); group.name = "op-art";
    group.add(room());
    const pn = panel(); group.add(pn);
    const ac = acetate(); group.add(ac);
    stage.scene.add(group);
    return {
      group, panel: pn, acetate: ac,
      update(t) { const s = plan.stateAt(t); pn.userData.update(s, t); ac.userData.update(s.acetate); },
    };
  }

  const props = { room, panel, acetate, caption, gallery };
  return {
    spec, palette: PAL, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: opplan, motion: opplan,
  };
}
