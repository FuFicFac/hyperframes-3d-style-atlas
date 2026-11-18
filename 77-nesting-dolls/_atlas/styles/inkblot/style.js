// styles/inkblot/style.js — "Inkblot": a folded-card inkblot in bright daylight, and pencil readings of it.
// The card is two thin boxes (the inked half and a hinged flap). Their top faces share ONE fragment program that evaluates
// the blot plan's ink field per pixel in half-space (a = distance from the crease, b = up the sheet), so the two halves
// are mirror images by construction. Ink = sum of elliptical blobs (uniform arrays written from plan.blobState(t)), warped
// by a baked noise texture: feathered edge, pale capillary halo, darker pooled rim; wet ink is glossy with a domed normal.
// Readings are baked once into textures (R = pencil coverage, G = draw order) and revealed by a progress uniform.
// Props never animate themselves: the scene calls blot.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { paintPixels, uploadTexture } from "../../kit/textures.js";
import { contactShadow } from "../../kit/builders.js";
import { hingeGroup } from "../../kit/shapes.js";
import { newCanvas } from "../../kit/canvas.js";
import { fbm2 } from "../../kit/noise.js";
import { clamp } from "../../kit/time.js";
import * as blotplan from "./blotplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const lin = (hex) => new THREE.Color(hex); // three converts sRGB hex to linear working space

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, SH = spec.sheet, INK = spec.ink, PC = spec.pencil;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const Wh = SH.width / 2, H = SH.height, th = SH.thickness;
  const NB = INK.maxBlobs;

  // ---------------------------------------------------------------- baked noise (tileable; R low, G mid, B fine)
  const st = (v, k) => clamp((v - 0.5) * k + 0.5);
  const noiseTex = new THREE.CanvasTexture(paintPixels(512, (u, v) => [
    st(fbm2(u * 4, v * 4, { seed: 811, octaves: 4, period: 4 }), 1.9),
    st(fbm2(u * 8 + 3.3, v * 8 + 1.7, { seed: 812, octaves: 4, period: 8 }), 1.9),
    st(fbm2(u * 32 + 5.1, v * 32 + 2.9, { seed: 813, octaves: 3, period: 32 }), 1.8),
  ]));
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.colorSpace = THREE.NoColorSpace;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.magFilter = THREE.LinearFilter;
  uploadTexture(stage, noiseTex);

  // ---------------------------------------------------------------- reading textures (half-space; R coverage, G draw order)
  function readingTexture(reading, k) {
    const ppm = PC.pxPerMetre, W = Math.round(Wh * ppm), Hp = Math.round(H * ppm);
    const cv = newCanvas(W, Hp), x = cv.getContext("2d");
    const X = (a) => a * ppm, Y = (b) => (H / 2 - b) * ppm;
    x.fillStyle = "#000"; x.fillRect(0, 0, W, Hp);
    x.lineCap = "round"; x.lineJoin = "round";
    // order pass: fat strokes, last first, so the EARLIEST stroke owns shared pixels
    x.lineWidth = (PC.width + 0.022) * ppm;
    for (let s = reading.strokes.length - 1; s >= 0; s--) {
      const S = reading.strokes[s], pts = S.pts;
      let cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const L = cum[cum.length - 1] || 1;
      for (let i = pts.length - 1; i >= 1; i--) {
        const g = S.g0 + (S.g1 - S.g0) * (cum[i] / L);
        x.strokeStyle = `rgb(0,${Math.round(clamp(g) * 255)},0)`;
        x.beginPath(); x.moveTo(X(pts[i - 1][0]), Y(pts[i - 1][1])); x.lineTo(X(pts[i][0]), Y(pts[i][1])); x.stroke();
      }
    }
    // coverage pass (adds red only): a firm line plus a lighter, slightly wandering second pass = sketched pencil
    x.globalCompositeOperation = "lighter";
    reading.strokes.forEach((S, si) => {
      const pts = S.pts;
      const path = (wob) => {
        x.beginPath();
        pts.forEach((p, i) => {
          let a = p[0], b = p[1];
          if (wob) {
            const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
            const tx = q[0] - r[0], ty = q[1] - r[1], l = Math.hypot(tx, ty) || 1;
            const o = wob * Math.sin(i * 0.55 + si * 2.3 + k * 1.1);
            a = Math.max(0, a - (ty / l) * o); b += (tx / l) * o;
          }
          if (i) x.lineTo(X(a), Y(b)); else x.moveTo(X(a), Y(b));
        });
        x.stroke();
      };
      x.lineWidth = PC.width * ppm; x.strokeStyle = "rgba(255,0,0,0.8)"; path(0);
      x.lineWidth = PC.width * 0.55 * ppm; x.strokeStyle = "rgba(255,0,0,0.45)"; path(PC.sketch);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    uploadTexture(stage, tex);
    return tex;
  }

  // ---------------------------------------------------------------- the inked card face material
  const GLSL_HEAD = `
#define NB ${NB}
varying vec2 vHalf; varying vec2 vSheet; varying vec3 vTx; varying vec3 vTz;
uniform vec4 uBlobA[NB]; uniform vec4 uBlobB[NB];
uniform vec3 uInkCol[3]; uniform vec3 uGraphite; uniform vec3 uChalk;
uniform sampler2D uNoise; uniform sampler2D uRead0; uniform sampler2D uRead1; uniform sampler2D uRead2;
uniform vec3 uReadProg; uniform vec3 uReadAlpha;
uniform float uInkOn, uWet, uBleed, uPress, uSide;
uniform vec4 uInkA, uInkB, uInkC, uInkD, uMisc;
uniform vec3 uNoiseScale; uniform vec2 uHalfSize; uniform vec2 uPencil;
float gInk = 0.0; float gGloss = 0.0; vec2 gGrad = vec2(0.0); float gPencil = 0.0;`;
  const GLSL_INK = `
{
  vec2 hp = vHalf;
  vec3 nLow = texture2D(uNoise, hp * uNoiseScale.x).rgb;
  vec3 nLow2 = texture2D(uNoise, hp * uNoiseScale.x + vec2(0.37, 0.61)).rgb;
  vec3 nMid = texture2D(uNoise, hp * uNoiseScale.y + vec2(0.11, 0.53)).rgb;
  vec3 nFine = texture2D(uNoise, hp * uNoiseScale.z).rgb;
  vec3 nPaper = texture2D(uNoise, vSheet * 1.7 + vec2(0.2, 0.7)).rgb;
  // paper: faint mottling (not mirrored) and the centre crease
  diffuseColor.rgb *= 1.0 + uMisc.w * ((nPaper.g - 0.5) * 1.2 + (nPaper.b - 0.5) * 0.8);
  float ca = hp.x / uMisc.y;
  diffuseColor.rgb *= 1.0 - uMisc.z * exp(-ca * ca);
  // the ink field: sum of elliptical blobs (and voids), domain-warped
  float spread = mix(0.3, 1.0, uPress);
  vec2 q = hp + (vec2(nLow.r, nLow2.r) - 0.5) * 2.0 * uInkA.z * spread;
  float F = 0.0; float wsum = 1e-4; vec3 csum = vec3(0.0); vec2 dF = vec2(0.0);
  for (int i = 0; i < NB; i++) {
    vec4 A = uBlobA[i]; vec4 B = uBlobB[i];
    vec2 d = q - A.xy;
    vec2 r = vec2(d.x * A.z + d.y * A.w, -d.x * A.w + d.y * A.z);
    float e = B.z * exp(-uInkA.x * (r.x * r.x * B.x + r.y * r.y * B.y - 1.0));
    F += e;
    vec2 gl = vec2(r.x * B.x, r.y * B.y);
    dF += e * (-2.0 * uInkA.x) * vec2(gl.x * A.z - gl.y * A.w, gl.x * A.w + gl.y * A.z);
    float ep = max(e, 0.0); ep *= ep;
    float isA = step(0.5, B.w) * (1.0 - step(1.5, B.w)); float isB = step(1.5, B.w);
    vec3 c = uInkCol[0] * (1.0 - isA - isB) + uInkCol[1] * isA + uInkCol[2] * isB;
    float wgt = ep * mix(1.7, 1.0, isA + isB);
    wsum += wgt; csum += wgt * c;
  }
  float Fc = max(F, 1e-3);
  float S = log(Fc) * uInkA.y;                       // pseudo distance (m), > 0 inside the ink
  float edge = S + (nMid.g - 0.5) * 2.0 * uInkA.w * spread + (nFine.b - 0.5) * 2.0 * uInkB.x * (0.25 + 0.75 * uBleed);
  float feather = mix(uInkB.y, uInkB.z, uBleed);
  float dns = smoothstep(-feather, feather, edge);
  float halo = smoothstep(-uInkB.w * (0.3 + 1.5 * nFine.g * nMid.r), 0.0, edge) * uInkC.x * uBleed;
  float er = edge / uInkC.y;
  float rim = exp(-er * er) * dns * uInkC.z;
  float body = mix(uInkC.w, 1.0, smoothstep(0.25, 0.75, nMid.b * 0.6 + nLow.g * 0.4));
  float op = clamp(max(dns * body, halo) + rim, 0.0, 1.0) * uInkOn;
  vec3 inkCol = csum / wsum;
  diffuseColor.rgb *= mix(vec3(1.0), inkCol, op);
  gInk = dns * uInkOn;
  // pencil readings: coverage (r) revealed in draw order (g); graphite on paper, chalk-white over ink
  vec2 ruv = vec2(hp.x / uHalfSize.x, hp.y / uHalfSize.y + 0.5);
  vec2 s0 = texture2D(uRead0, ruv).rg; vec2 s1 = texture2D(uRead1, ruv).rg; vec2 s2 = texture2D(uRead2, ruv).rg;
  float p0 = s0.r * smoothstep(s0.g, s0.g + 0.012, uReadProg.x * 1.02) * uReadAlpha.x;
  float p1 = s1.r * smoothstep(s1.g, s1.g + 0.012, uReadProg.y * 1.02) * uReadAlpha.y;
  float p2 = s2.r * smoothstep(s2.g, s2.g + 0.012, uReadProg.z * 1.02) * uReadAlpha.z;
  float pc = max(p0, max(p1, p2));
  pc *= (1.0 - uPencil.x * smoothstep(0.4, 0.8, nFine.r)) * uPencil.y;
  vec3 pcol = mix(uGraphite, uChalk, smoothstep(0.3, 0.7, op));
  diffuseColor.rgb = mix(diffuseColor.rgb, pcol, clamp(pc, 0.0, 1.0));
  gPencil = clamp(pc, 0.0, 1.0);
  gGloss = gInk * uWet * (1.0 - gPencil);
  // wet relief: a dome whose slope is steep at the edge (beads), much flatter once pressed
  float hs = uInkD.z * mix(1.0, uMisc.x, uPress);
  float dh = hs / uInkD.w * exp(-max(S, 0.0) / uInkD.w) * dns;
  vec2 g = dF / Fc * uInkA.y * dh * uWet * uInkOn;
  float gm = length(g);
  gGrad = g * (min(gm, 1.6) / max(gm, 1e-5));
}`;
  const shared = {
    uBlobA: { value: new Float32Array(NB * 4) }, uBlobB: { value: new Float32Array(NB * 4) },
    uInkCol: { value: INK.colors.map(lin) }, uGraphite: { value: lin(P.graphite) }, uChalk: { value: lin(P.chalk) },
    uNoise: { value: noiseTex }, uRead0: { value: null }, uRead1: { value: null }, uRead2: { value: null },
    uReadProg: { value: new THREE.Vector3() }, uReadAlpha: { value: new THREE.Vector3() },
    uWet: { value: 1 }, uBleed: { value: 0 }, uPress: { value: 0 },
    uInkA: { value: new THREE.Vector4(INK.k, INK.distScale, INK.warp, INK.edgeLow) },
    uInkB: { value: new THREE.Vector4(INK.edgeFine, INK.feather[0], INK.feather[1], INK.halo.width) },
    uInkC: { value: new THREE.Vector4(INK.halo.strength, INK.rim.width, INK.rim.strength, INK.body[0]) },
    uInkD: { value: new THREE.Vector4(INK.wetRoughness, INK.dryRoughness, INK.bead.height, INK.bead.falloff) },
    uMisc: { value: new THREE.Vector4(INK.bead.pressed, SH.crease.width, SH.crease.shade, SH.mottle) },
    uNoiseScale: { value: new THREE.Vector3(...INK.noiseScale) }, uHalfSize: { value: new THREE.Vector2(Wh, H) },
    uPencil: { value: new THREE.Vector2(PC.tooth, PC.opacity) },
  };
  function faceMaterial(side) {
    const m = new THREE.MeshStandardMaterial({ color: lin(P.paper), roughness: materials.paper.roughness, metalness: 0 });
    m.name = side > 0 ? "inkFaceFlap" : "inkFace";
    const own = { uSide: { value: side }, uInkOn: { value: side > 0 ? 0 : 1 } };
    m.userData.uniforms = { ...shared, ...own };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, m.userData.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vHalf; varying vec2 vSheet; varying vec3 vTx; varying vec3 vTz; uniform float uSide;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vHalf = vec2(uSide * position.x, -position.z);
vSheet = vec2(position.x + uSide * 3.1, position.z);
vTx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
vTz = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + GLSL_HEAD)
        .replace("#include <map_fragment>", "#include <map_fragment>\n" + GLSL_INK)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(uInkD.y, uInkD.x, uWet), gInk * (1.0 - gPencil));")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(normal - gGrad.x * uSide * vTx + gGrad.y * vTz);");
    };
    m.customProgramCacheKey = () => "inkblot-face";
    return m;
  }

  const shadowed = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  // ---------------------------------------------------------------- props
  function desk() {
    const g = new THREE.Group();
    const m = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(16, 10), materials.desk), false, true);
    m.rotation.x = -Math.PI / 2;
    g.add(m);
    const cs = contactShadow({ w: SH.width + 0.9, d: H + 0.9, opacity: 0.34, y: 0.003 });
    g.add(cs);
    return g;
  }

  /** card(plan) -> Group { userData: { left, flap, pivot, update(t) } }: the inked half + the hinged flap. */
  function card(plan) {
    const g = new THREE.Group();
    const mats = (face) => [materials.paperEdge, materials.paperEdge, face, materials.paperBack, materials.paperEdge, materials.paperEdge];
    const faceL = faceMaterial(-1), faceR = faceMaterial(1);
    const texs = plan.readings.slice(0, 3).map(readingTexture);
    while (texs.length < 3) texs.push(texs[0]);
    shared.uRead0.value = texs[0]; shared.uRead1.value = texs[1]; shared.uRead2.value = texs[2];
    const gl = new THREE.BoxGeometry(Wh, th, H); gl.translate(-Wh / 2, th / 2, 0);
    const left = shadowed(new THREE.Mesh(gl, mats(faceL)));
    const gr = new THREE.BoxGeometry(Wh, th, H); gr.translate(Wh / 2, -th / 2, 0);
    const flap = shadowed(new THREE.Mesh(gr, mats(faceR)));
    const pivot = hingeGroup(flap, { axis: "z", closed: Math.PI, open: 0 });
    pivot.position.y = th + SH.gap;
    pivot.userData.setAngle(0);
    g.add(left, pivot);
    g.userData = {
      left, flap, pivot, faceL, faceR,
      update(t) {
        const S = plan.blobState(t, shared.uBlobA.value, shared.uBlobB.value);
        shared.uWet.value = S.wet; shared.uBleed.value = S.bleed; shared.uPress.value = S.press;
        faceR.userData.uniforms.uInkOn.value = S.printed ? 1 : 0;
        for (let k = 0; k < 3; k++) {
          const r = k < plan.readings.length ? plan.readingState(k, t) : { progress: 0, alpha: 0 };
          shared.uReadProg.value.setComponent(k, r.progress); shared.uReadAlpha.value.setComponent(k, r.alpha);
        }
        pivot.userData.setAngle(plan.hingeAngle(t));
      },
    };
    return g;
  }

  /** droplets(plan) -> Group of falling ink drops on the inked (left) half; userData.update(t). */
  function droplets(plan) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const mat = INK.colors.map((c) => { const m = materials.drop.clone(); m.color = lin(c); return m; });
    const list = plan.drops.map((d) => { const m = shadowed(new THREE.Mesh(geo, mat[d.col ?? 0]), true, false); m.visible = false; g.add(m); return m; });
    g.userData.update = (t) => {
      list.forEach((m, i) => {
        const a = plan.dropAir(i, t);
        m.visible = !!a;
        if (!a) return;
        m.position.set(-a.a, th + a.y + a.r, -a.b);
        m.scale.set(a.r / Math.sqrt(a.stretch), a.r * a.stretch, a.r / Math.sqrt(a.stretch));
      });
    };
    return g;
  }

  /** press(plan) -> a wooden rubbing disc with a knob; userData.update(t) follows plan.pressPose. */
  function press(plan) {
    const D = spec.press, g = new THREE.Group();
    const pad = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D.radius * 0.97, D.radius * 0.97, 0.012, 48), materials.felt));
    pad.position.y = 0.006;
    const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D.radius * 0.94, D.radius, D.height, 48), materials.wood));
    disc.position.y = 0.012 + D.height / 2;
    const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D.knob * 0.45, D.knob * 0.6, 0.07, 24), materials.woodDark));
    stem.position.y = 0.012 + D.height + 0.035;
    const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(D.knob, 24, 16), materials.woodDark));
    knob.scale.y = 0.62; knob.position.y = 0.012 + D.height + 0.07 + D.knob * 0.4;
    // a grain mark so the spin reads
    const mark = new THREE.Mesh(new THREE.BoxGeometry(D.radius * 1.5, 0.004, 0.02), materials.woodDark);
    mark.position.y = 0.012 + D.height + 0.002;
    g.add(pad, disc, stem, knob, mark);
    g.visible = false;
    const top = 2 * th + SH.gap; // the shut card's upper face
    g.userData.update = (t) => {
      const p = plan.pressPose(t);
      g.visible = !!p;
      if (!p) return;
      g.position.set(-p.a, top + (1 - p.down) * 0.1, -p.b);
      g.rotation.y = p.spin;
    };
    return g;
  }

  /** blot(plan) -> { group, card, update(t) }: desk + card + droplets + press, added to the stage scene. */
  function blot(plan) {
    const group = new THREE.Group();
    const c = card(plan), d = droplets(plan), p = press(plan);
    group.add(desk(), c, d, p);
    stage.scene.add(group);
    return { group, card: c, droplets: d, press: p, update(t) { c.userData.update(t); d.userData.update(t); p.userData.update(t); } };
  }

  // ---------------------------------------------------------------- overlay caption: an ink-dark pill, cream serif text
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1400, Hp = Q.h + 16;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, s) => {
      if (!s.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(s.text).width);
      const pw = Math.min(Wc - 16, tw + Math.round(Q.cap * 1.7)), ph = Q.h, ox = Math.round((Wc - pw) / 2), oy = 8, r = ph / 2;
      x.fillStyle = P.caption;
      x.beginPath(); x.moveTo(ox + r, oy); x.lineTo(ox + pw - r, oy); x.arc(ox + pw - r, oy + r, r, -Math.PI / 2, Math.PI / 2);
      x.lineTo(ox + r, oy + ph); x.arc(ox + r, oy + r, r, Math.PI / 2, (3 * Math.PI) / 2); x.closePath(); x.fill();
      x.fillStyle = P.captionText; x.textBaseline = "middle"; x.textAlign = "center";
      x.fillText(s.text, Wc / 2, oy + ph / 2 + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place((stage.width - Wp) / 2, Q.y - 8);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { desk, card, droplets, press, blot, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: blotplan, motion: blotplan,
  };
}
