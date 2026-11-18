// styles/cubism/style.js — "Cubism": simultaneous viewpoints. The look lives in spec.js; WHICH facet shows WHICH
// viewpoint, and when it cracks, swings, slides, flips and settles, lives in facets.js (THREE-free, shared with SCORE).
// This file turns a plan into pictures:
//   - a real 3D café still life (guitar, bottle with a stencilled label, wine glass, fruit bowl, folded newspaper on a
//     round walnut table, in a warm room) in its OWN scene, rendered every frame by one camera per viewpoint into a
//     half-float multisampled render target (deterministic: every camera is a pure function of t through a kit rig);
//   - the picture plane in the stage scene: a base sheet + one flat convex mesh per facet. Each facet's shader samples
//     its viewpoint's render target at the facet's REST frame position (so the image travels with the facet), then
//     grades it: plain render -> analytic (soft posterised ochre/umber/grey bands, facet passage shading, sobel ink
//     lines) -> synthetic (flat 3-tone paper colours). The BACK face is collage (coloured paper, faux-bois wood grain,
//     newsprint with stencilled letters, charcoal drawing of the view, wallpaper), shown when a facet flips over.
//     Dark brushy contour lines on every facet edge (analytic distance to the polygon's edges), canvas weave in screen
//     space, brush grain in facet space.
//   - an overlay caption strip (exact colours).
// Props never animate themselves: the scene calls picture.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { createCameraRig } from "../../kit/camera.js";
import { woodTexture, paintPixels, canvasTexture, gradientTexture, uploadTexture } from "../../kit/textures.js";
import { newCanvas } from "../../kit/canvas.js";
import { fbm2 } from "../../kit/noise.js";
import { rng, clamp } from "../../kit/time.js";
import * as facets from "./facets.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const MAX_EDGES = 10;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, ST = spec.still, LK = spec.look;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const renderer = stage.renderer;

  // ---------------------------------------------------------------- the still-life scene (rendered per viewpoint)
  const still = new THREE.Scene();
  still.name = "still-life";
  still.add(lights.group);                       // the spec lights belong to the still life, not the picture plane
  still.environment = stage.scene.environment;   // room reflections for the bottle / glass
  stage.scene.environment = null;
  still.background = new THREE.Color(P.wall);

  const lin = (hex) => new THREE.Color(hex); // THREE.Color(hex) = linear working-space values

  // ---------------------------------------------------------------- canvases (built once, seeded)
  /** stencil(ctx, text, x, y, size, color, bg) -> stencilled capitals: condensed bold type cut by paper bridges */
  function stencil(x, text, cx, cy, size, color, bg, o = {}) {
    x.save();
    x.font = `800 ${size}px "Futura", "Avenir Next Condensed", "Helvetica Neue", sans-serif`;
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = color;
    if (o.spacing) x.letterSpacing = `${o.spacing}px`;
    x.fillText(text, cx, cy);
    const w = x.measureText(text).width;
    // bridges: a horizontal cut at mid-height + a vertical cut per letter (the stencil ties)
    x.fillStyle = bg;
    x.fillRect(cx - w / 2 - 4, cy - size * 0.035, w + 8, size * 0.07);
    const n = [...text].length;
    for (let i = 0; i < n; i++) {
      if (text[i] === " ") continue;
      const lx = cx - w / 2 + (i + 0.5) * (w / n);
      x.fillRect(lx - size * 0.02, cy - size * 0.5, size * 0.04, size * 0.22);
    }
    x.restore();
  }

  /** newsprint canvas: columns of grey type-lines, a masthead and one large stencilled word */
  function newsCanvas(seed = 3, word = "LE JOUR") {
    const N = 1024, c = newCanvas(N, N), x = c.getContext("2d"), r = rng(seed);
    x.fillStyle = P.news; x.fillRect(0, 0, N, N);
    // paper tone blotches
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(150,120,70,${r.range(0.02, 0.05)})`; x.beginPath(); x.arc(r.range(0, N), r.range(0, N), r.range(30, 160), 0, Math.PI * 2); x.fill(); }
    stencil(x, word, N / 2, 120, 150, P.ink, P.news, { spacing: 8 });
    x.fillStyle = P.ink; x.fillRect(40, 214, N - 80, 6); x.fillRect(40, 226, N - 80, 2);
    const cols = 4, gw = (N - 80) / cols;
    for (let k = 0; k < cols; k++) {
      let y = 250;
      const x0 = 40 + k * gw + 10, wcol = gw - 20;
      while (y < N - 30) {
        if (r.chance(0.08)) { x.fillStyle = "rgba(28,23,18,0.85)"; x.fillRect(x0, y, wcol * r.range(0.5, 0.95), 18); y += 32; continue; }
        const len = r.chance(0.12) ? r.range(0.3, 0.7) : r.range(0.88, 1);
        x.fillStyle = `rgba(40,34,28,${r.range(0.45, 0.7)})`;
        // a line of "words": short dashes
        let px = x0;
        while (px < x0 + wcol * len) { const ww = r.range(10, 38); x.fillRect(px, y, Math.min(ww, x0 + wcol * len - px), 7); px += ww + r.range(5, 8); }
        y += 15;
      }
      if (k < cols - 1) { x.fillStyle = "rgba(28,23,18,0.5)"; x.fillRect(40 + (k + 1) * gw - 1, 250, 2, N - 290); }
    }
    return c;
  }
  /** wallpaper canvas: cream ground, ochre diamond lattice, small rosette dots */
  function wallCanvas() {
    const N = 512, c = newCanvas(N, N), x = c.getContext("2d");
    x.fillStyle = "#eadcbc"; x.fillRect(0, 0, N, N);
    x.strokeStyle = "#b98a4a"; x.lineWidth = 6;
    const s = 128;
    for (let i = -4; i <= 8; i++) {
      x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s + N, N); x.stroke();
      x.beginPath(); x.moveTo(i * s, N); x.lineTo(i * s + N, 0); x.stroke();
    }
    x.fillStyle = "#7b4f2c";
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { x.beginPath(); x.arc(i * s, j * s + s / 2, 11, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(i * s + s / 2, j * s, 11, 0, Math.PI * 2); x.fill(); }
    return c;
  }
  /** bottle label canvas */
  function labelCanvas() {
    const W = 512, H = 256, c = newCanvas(W, H), x = c.getContext("2d");
    x.fillStyle = P.news; x.fillRect(0, 0, W, H);
    x.strokeStyle = P.ink; x.lineWidth = 8; x.strokeRect(14, 14, W - 28, H - 28);
    stencil(x, "VIN", W * 0.5, H / 2 + 6, 150, P.vermilion, P.news, { spacing: 4 });
    return c;
  }
  const tex = (c, o = {}) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const newsTex = tex(newsCanvas(3, spec.collage.words[0]));
  const newsTex2 = tex(newsCanvas(11, spec.collage.words[1]), { clamp: true });
  const wallTex = tex(wallCanvas());
  const woodCollage = woodTexture({ size: 512, boards: 3, seed: 19, dark: "#6a4223", mid: "#a8743f", light: "#d3a467", grainFreq: 26, contrast: 0.45 });
  woodCollage.wrapS = woodCollage.wrapT = THREE.RepeatWrapping;
  const labelTex = tex(labelCanvas(), { clamp: true });
  // canvas weave (screen space, linear grey): over-under threads with slub noise; 8 px period tiles 256 exactly
  const weaveTex = canvasTexture(paintPixels(256, (u, v, X, Y) => {
    const cx = Math.floor(X / 8), cy = Math.floor(Y / 8), fx = (X % 8) / 8, fy = (Y % 8) / 8;
    const warpTop = (cx + cy) % 2 === 0;
    const thread = warpTop ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
    const slub = fbm2(u * 16, v * 16, { seed: 5, octaves: 2, period: 16 });
    return clamp(0.5 + 0.32 * (thread - 0.64) + 0.25 * (slub - 0.5));
  }), { srgb: false });
  weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping;
  // brush grain (facet space): streaky fbm stretched along one axis
  const strokeTex = canvasTexture(paintPixels(256, (u, v) => clamp(0.5 + 0.9 * (fbm2(u * 3, v * 28, { seed: 9, octaves: 3, period: 3 }) - 0.5) + 0.35 * (fbm2(u * 8, v * 64, { seed: 4, octaves: 2, period: 8 }) - 0.5))), { srgb: false });
  strokeTex.wrapS = strokeTex.wrapT = THREE.RepeatWrapping;
  uploadTexture(renderer, newsTex, newsTex2, wallTex, woodCollage, labelTex, weaveTex, strokeTex);

  // ---------------------------------------------------------------- still-life props
  const T = ST.table;
  function room() {
    const g = new THREE.Group(); g.name = "room";
    const back = gradientTexture({ size: 256, stops: [[0, P.wallLow], [0.45, P.wall], [1, "#efe6d2"]], angle: 90 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(7, 48, 24), new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide }));
    sphere.position.y = 1.5; g.add(sphere);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6.5, 64), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    return g;
  }
  function table() {
    const g = new THREE.Group(); g.name = "table";
    const top = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.th, 96), [materials.tableDark, materials.tableTop, materials.tableDark]);
    top.position.y = T.y - T.th / 2; top.receiveShadow = true; top.castShadow = true; g.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(T.r, T.th * 0.5, 10, 96), materials.tableDark);
    rim.rotation.x = Math.PI / 2; rim.position.y = T.y - T.th / 2; g.add(rim);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, T.y - T.th, 24), materials.tableDark);
    leg.position.y = (T.y - T.th) / 2; leg.castShadow = true; g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.04, 48), materials.tableDark);
    foot.position.y = 0.02; foot.castShadow = foot.receiveShadow = true; g.add(foot);
    return g;
  }
  /** guitar() -> classical guitar lying face-up: figure-eight body (smooth union of two bouts), sound hole, rosette,
   *  bridge, neck, fretboard with frets, headstock with pegs, six strings. Local: body centre at origin, neck along -Z. */
  function guitar() {
    const g = new THREE.Group(); g.name = "guitar";
    const cA = -0.11, rA = 0.19, cB = 0.15, rB = 0.145, k = 0.06, D = 0.08, bev = 0.006;
    const yMin = cA - rA, yMax = cB + rB;
    const half = (y) => {
      const a = Math.sqrt(Math.max(0, rA * rA - (y - cA) ** 2)), b = Math.sqrt(Math.max(0, rB * rB - (y - cB) ** 2));
      const h = clamp(0.5 + (0.5 * (b - a)) / k);
      return a * (1 - h) + b * h - k * h * (1 - h) * 0.6;
    };
    const N = 56, right = [];
    for (let i = 0; i <= N; i++) { const y = yMin + (yMax - yMin) * (1 - Math.cos((Math.PI * i) / N)) / 2; right.push([Math.max(0.0005, half(y)), y]); }
    const pts = [...right.map(([x, y]) => new THREE.Vector2(x, y)), ...right.slice(1, -1).reverse().map(([x, y]) => new THREE.Vector2(-x, y))];
    const shape = new THREE.Shape(pts);
    const hy = 0.085, hr = 0.05;
    shape.holes.push(new THREE.Path().absarc(0, hy, hr, 0, Math.PI * 2, true));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 32 });
    const body = new THREE.Mesh(geo, [materials.spruce, materials.guitarSide]);
    body.rotation.x = -Math.PI / 2; body.position.y = bev; body.castShadow = body.receiveShadow = true; g.add(body);
    const top = D + 2 * bev;
    const inside = new THREE.Mesh(new THREE.CircleGeometry(hr * 1.02, 32), materials.hole);
    inside.rotation.x = -Math.PI / 2; inside.position.set(0, top * 0.35, -hy); g.add(inside);
    const ros = new THREE.Mesh(new THREE.TorusGeometry(hr + 0.012, 0.007, 8, 48), materials.fretboard);
    ros.rotation.x = -Math.PI / 2; ros.position.set(0, top, -hy); g.add(ros);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.028), materials.fretboard);
    bridge.position.set(0, top + 0.006, 0.12); bridge.castShadow = true; g.add(bridge);
    const n0 = yMax - 0.02, n1 = n0 + 0.42;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.03, n1 - n0), materials.guitarSide);
    neck.position.set(0, top - 0.015, -(n0 + n1) / 2); neck.castShadow = true; g.add(neck);
    const f0 = 0.2;
    const fb = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.007, n1 - f0), materials.fretboard);
    fb.position.set(0, top + 0.0035, -(f0 + n1) / 2); fb.castShadow = true; g.add(fb);
    for (let i = 1; i <= 12; i++) {
      const s = n1 - (n1 - f0) * (1 - Math.pow(2, -i / 12)) * 1.9;
      if (s < f0 + 0.01) continue;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.003, 0.003), materials.string);
      fr.position.set(0, top + 0.0085, -s); g.add(fr);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.022, 0.17), materials.guitarSide);
    head.position.set(0, top - 0.02, -(n1 + 0.085)); head.rotation.x = -0.18; head.castShadow = true; g.add(head);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 10), materials.string);
      peg.rotation.z = Math.PI / 2; peg.position.set(sx * 0.055, top - 0.02 + 0.012 * (i + 0.5) * 0.3, -(n1 + 0.04 + i * 0.045)); g.add(peg);
    }
    for (let i = 0; i < 6; i++) {
      const u = (i - 2.5) / 2.5;
      const a = new THREE.Vector3(u * 0.026, top + 0.012, 0.12), b = new THREE.Vector3(u * 0.02, top + 0.012, -n1);
      const len = a.distanceTo(b);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0011 + 0.0003 * (5 - i) / 5, 0.0011 + 0.0003 * (5 - i) / 5, len, 6), materials.string);
      s.position.copy(a).lerp(b, 0.5); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(s);
    }
    g.traverse((m) => { if (m.isMesh && m !== inside) m.castShadow = true; });
    return g;
  }
  function bottle() {
    const g = new THREE.Group(); g.name = "bottle";
    const prof = [[0, 0], [0.046, 0], [0.05, 0.006], [0.05, 0.19], [0.046, 0.225], [0.024, 0.262], [0.016, 0.29], [0.016, 0.325], [0.019, 0.33], [0.019, 0.342], [0, 0.342]];
    const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48), materials.bottle);
    m.castShadow = m.receiveShadow = true; g.add(m);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0508, 0.0508, 0.085, 48, 1, true, -1.25, 2.5), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.7 }));
    lab.position.y = 0.105; g.add(lab);
    return g;
  }
  function wineGlass() {
    const g = new THREE.Group(); g.name = "glass";
    const prof = [[0, 0], [0.04, 0], [0.042, 0.004], [0.006, 0.012], [0.005, 0.085], [0.02, 0.095], [0.038, 0.12], [0.042, 0.15], [0.037, 0.19], [0.036, 0.192]];
    const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48), materials.glass);
    materials.glass.side = THREE.DoubleSide; materials.glass.depthWrite = false; materials.glass.transparent = true;
    m.renderOrder = 2; m.castShadow = true; g.add(m);
    const wine = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.098], [0.02, 0.1], [0.034, 0.12], [0.038, 0.14], [0, 0.14]].map(([r, y]) => new THREE.Vector2(r, y)), 40), materials.wine);
    g.add(wine);
    return g;
  }
  function fruitBowl() {
    const g = new THREE.Group(); g.name = "bowl";
    const prof = [[0, 0.002], [0.06, 0], [0.07, 0.012], [0.15, 0.05], [0.165, 0.075], [0.158, 0.077], [0.14, 0.055], [0.06, 0.02], [0, 0.018]];
    const b = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 56), materials.ceramic);
    b.castShadow = b.receiveShadow = true; g.add(b);
    const lemon = new THREE.Mesh(new THREE.SphereGeometry(0.048, 32, 20), materials.lemon);
    lemon.scale.set(1.35, 1, 1); lemon.position.set(-0.05, 0.065, 0.03); lemon.rotation.y = 0.5; g.add(lemon);
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.052, 32, 20), materials.apple);
    apple.scale.set(1, 0.9, 1); apple.position.set(0.06, 0.07, -0.02); g.add(apple);
    const pearProf = [[0, 0], [0.03, 0.006], [0.046, 0.03], [0.04, 0.06], [0.024, 0.09], [0.018, 0.115], [0, 0.125]];
    const pear = new THREE.Mesh(new THREE.LatheGeometry(pearProf.map(([r, y]) => new THREE.Vector2(r, y)), 32), materials.pear);
    pear.position.set(0.0, 0.03, -0.075); pear.rotation.z = 0.35; g.add(pear);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function newspaper() {
    const W = 0.44, H = 0.31;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: newsTex2, roughness: 0.85 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "newspaper";
    return m;
  }
  /** stillLife() -> Group: everything placed from spec.still */
  function stillLife() {
    const g = new THREE.Group(); g.name = "still";
    g.add(room(), table());
    const gt = guitar(); gt.position.set(ST.guitar.at[0], T.y, ST.guitar.at[1]); gt.rotation.y = ST.guitar.yaw; gt.scale.setScalar(ST.guitar.scale); g.add(gt);
    const bt = bottle(); bt.position.set(ST.bottle.at[0], T.y + 0.002, ST.bottle.at[1]); g.add(bt);
    const gl = wineGlass(); gl.position.set(ST.glass.at[0], T.y, ST.glass.at[1]); g.add(gl);
    const bw = fruitBowl(); bw.position.set(ST.bowl.at[0], T.y, ST.bowl.at[1]); g.add(bw);
    const np = newspaper(); np.position.set(ST.news.at[0], T.y + 0.002, ST.news.at[1]); np.rotation.z = ST.news.yaw + Math.PI; g.add(np);
    still.add(g);
    return g;
  }

  // ---------------------------------------------------------------- the facet shader
  const VERT = /* glsl */ `
    attribute vec2 frameUv;
    varying vec2 vUv;
    varying vec2 vLocal;
    void main() {
      vUv = frameUv;
      vLocal = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const FRAG = /* glsl */ `
    precision highp float;
    uniform sampler2D uView;
    uniform vec2 uTexel;
    uniform float uA, uS, uB;
    uniform float uLine, uLineW, uLineJit;
    uniform vec3 uInk;
    uniform vec3 uEdges[${MAX_EDGES}];
    uniform int uEdgeN;
    uniform vec2 uShadeDir;
    uniform float uShadeAmt;
    uniform vec3 uTint;
    uniform vec3 uR0, uR1, uR2, uR3;
    uniform vec3 uS0, uS1, uS2;
    uniform float uFrontCollage, uKind, uFlipShade, uBands;
    uniform vec3 uPaper;
    uniform vec2 uFlipAxis, uInk2, uSeed2;
    uniform sampler2D uWood, uNews, uWall, uCanvas, uStroke;
    uniform float uWeave, uBrush;
    uniform vec2 uCUv, uAim;
    uniform float uRecentre, uZoom;
    varying vec2 vUv;
    varying vec2 vLocal;

    float lum(vec3 c) { return sqrt(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0)); }   // ~perceptual
    vec3 ramp(float x) {
      vec3 a = mix(uR0, uR1, smoothstep(0.0, 0.36, x));
      a = mix(a, uR2, smoothstep(0.36, 0.68, x));
      return mix(a, uR3, smoothstep(0.68, 1.0, x));
    }
    void main() {
      // ---- the viewpoint image (front)
      vec2 vuv = (vUv - uCUv) * mix(1.0, uZoom, uRecentre) + mix(uCUv, uAim, uRecentre);
      vec3 orig = texture2D(uView, vuv).rgb;
      float L = lum(orig);
      vec2 o = uTexel * 1.5;
      float Lr = lum(texture2D(uView, vuv + vec2(o.x, 0.0)).rgb), Ll = lum(texture2D(uView, vuv - vec2(o.x, 0.0)).rgb);
      float Lu = lum(texture2D(uView, vuv + vec2(0.0, o.y)).rgb), Ld = lum(texture2D(uView, vuv - vec2(0.0, o.y)).rgb);
      float edge = abs(Lr - Ll) + abs(Lu - Ld);
      float inner = smoothstep(uInk2.x, uInk2.y, edge);
      // analytic: soft posterised bands on an ochre/umber/grey ramp, tinted, with passage shading across the facet
      float q = L * uBands;
      float Lp = (floor(q) + smoothstep(0.3, 0.7, fract(q))) / uBands;
      vec3 anal = ramp(Lp) * mix(vec3(1.0), uTint, 0.45);
      float g = clamp(dot(vLocal, uShadeDir), -1.0, 1.0);
      anal *= 1.0 + uShadeAmt * g;
      anal *= 1.0 - 0.8 * inner;
      // synthetic: three flat paper tones
      float t1 = smoothstep(0.30, 0.33, L), t2 = smoothstep(0.58, 0.61, L);
      vec3 syn = mix(mix(uS0, uS1, t1), uS2, t2);
      syn *= 1.0 - 0.9 * inner * (0.6 + 0.4 * uB);
      vec3 front = mix(mix(orig, anal, uA), syn, uS);

      // ---- collage (back face, or the front of a cut-out); all candidates computed, then selected arithmetically
      float isBack = 1.0 - float(gl_FrontFacing);
      vec2 pr = 2.0 * dot(vLocal, uFlipAxis) * uFlipAxis - vLocal;     // mirror back-face coords so print reads right
      vec2 p = mix(vLocal, pr, isBack);
      float fib = texture2D(uStroke, p * 1.7 + uSeed2).r;
      vec3 cPaper = uPaper * (0.9 + 0.16 * fib);
      vec3 cWood = texture2D(uWood, p * vec2(1.1, 1.6) + uSeed2).rgb;
      vec3 cNews = texture2D(uNews, p * 0.95 + vec2(0.5, 0.74) + vec2(uSeed2.x * 0.2, 0.0)).rgb;
      vec3 cDraw = mix(uS0 * 0.45 + vec3(0.012), vec3(0.86, 0.80, 0.68), inner);
      vec3 cWall = texture2D(uWall, p * 1.8 + uSeed2).rgb;
      float k = uKind;
      vec3 coll = cPaper * (1.0 - step(0.5, abs(k - 0.0))) + cWood * (1.0 - step(0.5, abs(k - 1.0)))
                + cNews * (1.0 - step(0.5, abs(k - 2.0))) + cDraw * (1.0 - step(0.5, abs(k - 3.0)))
                + cWall * (1.0 - step(0.5, abs(k - 4.0)));
      float cm = max(uFrontCollage, isBack);
      vec3 col = mix(front, coll, cm) * uFlipShade;

      // ---- paint: brush grain in facet space, canvas weave in screen space
      float br = texture2D(uStroke, mat2(0.8, -0.6, 0.6, 0.8) * vLocal * 2.2 + uSeed2).r - 0.5;
      col *= 1.0 + uBrush * br * 2.0;
      float wv = texture2D(uCanvas, gl_FragCoord.xy / 256.0).r - 0.5;
      col *= 1.0 + uWeave * wv * 2.0;

      // ---- dark contour on the facet's edges (analytic distance to the convex polygon's edges, metres)
      float d = 1e3;
      for (int i = 0; i < ${MAX_EDGES}; i++) {
        if (i >= uEdgeN) break;
        vec3 e = uEdges[i];
        d = min(d, dot(e.xy, vLocal) + e.z);
      }
      float jit = texture2D(uStroke, vLocal * vec2(0.6, 4.0) + uSeed2.yx).r - 0.5;
      float w = uLineW * (1.0 + uLineJit * jit * 2.0);
      float aa = fwidth(d) * 1.2 + 1e-6;
      float ink = 1.0 - smoothstep(w - aa, w + aa, d);
      col = mix(col, uInk, ink * uLine);
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }`;

  const SYN_SETS = [
    [P.black, P.blue, P.cream],
    [P.brown, P.ochre, P.cream],
    [P.black, P.green, P.yellow],
    [P.umber, P.vermilion, P.cream],
  ];
  const TINTS = [P.tintGreen, P.tintBlue, P.tintWarm];

  /** facetMaterial({ view, edges, tint, synth, kind, paper, flipAxis, frontCollage, seed }) -> ShaderMaterial */
  function facetMaterial(o) {
    const edges = [];
    for (let i = 0; i < MAX_EDGES; i++) { const e = o.edges[i] ?? [0, 0, 1e3]; edges.push(new THREE.Vector3(e[0], e[1], e[2])); }
    const syn = SYN_SETS[(o.synth ?? 0) % SYN_SETS.length];
    const r = rng(o.seed ?? 1);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: {
        uView: { value: o.view }, uTexel: { value: new THREE.Vector2(1 / spec.frame.rt[0], 1 / spec.frame.rt[1]) },
        uA: { value: 0 }, uS: { value: 0 }, uB: { value: 0 },
        uLine: { value: 0 }, uLineW: { value: LK.lineW }, uLineJit: { value: LK.lineJitter }, uInk: { value: lin(P.ink) },
        uEdges: { value: edges }, uEdgeN: { value: Math.min(MAX_EDGES, o.edges.length) },
        uShadeDir: { value: new THREE.Vector2(...(o.shadeDir ?? [1, 0])) }, uShadeAmt: { value: 0 },
        uTint: { value: lin(TINTS[(o.tint ?? 0) % TINTS.length]).multiplyScalar(1.15) },
        uR0: { value: lin(P.umber) }, uR1: { value: lin(P.sienna) }, uR2: { value: lin(P.ochre) }, uR3: { value: lin(P.greyLight) },
        uS0: { value: lin(syn[0]) }, uS1: { value: lin(syn[1]) }, uS2: { value: lin(syn[2]) },
        uFrontCollage: { value: o.frontCollage ? 1 : 0 }, uKind: { value: o.kind ?? 0 }, uFlipShade: { value: 1 }, uBands: { value: LK.bands },
        uPaper: { value: lin(o.paper ?? P.blue) }, uFlipAxis: { value: new THREE.Vector2(...(o.flipAxis ?? [1, 0])) },
        uInk2: { value: new THREE.Vector2(LK.innerInk[0], LK.innerInk[1]) }, uSeed2: { value: new THREE.Vector2(r.range(0, 1), r.range(0, 1)) },
        uWood: { value: woodCollage }, uNews: { value: o.news ?? newsTex }, uWall: { value: wallTex }, uCanvas: { value: weaveTex }, uStroke: { value: strokeTex },
        uWeave: { value: LK.weave[0] }, uBrush: { value: 0 },
        uCUv: { value: new THREE.Vector2(...(o.cUv ?? [0.5, 0.5])) }, uAim: { value: new THREE.Vector2(...(o.aim ?? [0.5, 0.5])) },
        uRecentre: { value: 0 }, uZoom: { value: o.zoom ?? 1 },
      },
    });
    m.name = o.name ?? "facet";
    return m;
  }

  /** facetMesh(pts, centroid, frameW, frameH, material) -> Mesh built centred on the centroid; frameUv = rest frame UV */
  function facetMesh(pts, c, FW, FH, material) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - c[0], y - c[1])));
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[2 * i] = (pos.getX(i) + c[0]) / FW + 0.5; uv[2 * i + 1] = (pos.getY(i) + c[1]) / FH + 0.5; }
    geo.setAttribute("frameUv", new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, material);
    m.position.set(c[0], c[1], 0);
    m.frustumCulled = false;
    return m;
  }

  // ---------------------------------------------------------------- the picture: views + facets + cut-outs
  /**
   * picture(plan, viewCams) -> { group, views, facets, extras, update(t) } (adds itself to stage.scene)
   *   plan: facets.createPlan(...) on the OVERSCANNED frame; viewCams[k] = kit camera-rig keys for viewpoint k.
   */
  function picture(plan, viewCams, o = {}) {
    const FW = plan.frame.w, FH = plan.frame.h;
    const [rw, rh] = spec.frame.rt;
    stillLife();
    const views = viewCams.map((keys, k) => {
      const cam = new THREE.PerspectiveCamera(keys[0].fov ?? 34, rw / rh, 0.05, 30);
      const rt = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, samples: spec.frame.rtSamples, depthBuffer: true });
      rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false;
      rt.texture.name = `view${k}`;
      return { k, cam, rt, rig: createCameraRig(cam, keys, { drift: { amp: 0 } }) };
    });
    const group = new THREE.Group(); group.name = "picture";
    // base sheet: the whole frame in view 0 (what shows through the gaps); never moves, never inked
    const base = facetMesh([[-FW / 2, -FH / 2], [FW / 2, -FH / 2], [FW / 2, FH / 2], [-FW / 2, FH / 2]], [0, 0], FW, FH,
      facetMaterial({ view: views[0].rt.texture, edges: [], tint: 2, synth: 1, seed: 999, name: "base" }));
    base.position.z = -0.002; group.add(base);
    const papers = spec.collage.papers;
    const fm = plan.facets.map((f, i) => {
      const mat = facetMaterial({
        view: views[f.view].rt.texture, edges: f.edges, tint: f.tint, synth: f.synth, shadeDir: f.shadeDir.map((v) => v / f.radius),
        kind: f.flip ? f.flip.kind : 0, paper: papers[i % papers.length], flipAxis: f.flip ? f.flip.axis : [1, 0], seed: 100 + i,
        news: i % 2 ? newsTex : newsTex2, name: `facet${i}`, cUv: f.cUv, aim: f.aim, zoom: f.zoom,
      });
      const m = facetMesh(f.pts, f.c, FW, FH, mat); m.name = `facet${i}`;
      group.add(m);
      return m;
    });
    const xm = plan.extras.map((e, j) => {
      const mat = facetMaterial({ view: views[0].rt.texture, edges: e.edges, kind: e.kind, paper: papers[(j + 1) % papers.length], frontCollage: true, seed: 300 + j, news: newsTex, name: `cutout${j}` });
      const m = facetMesh(e.pts, e.c, FW, FH, mat); m.name = `cutout${j}`;
      group.add(m);
      return m;
    });
    stage.scene.add(group);
    const qz = new THREE.Quaternion(), qf = new THREE.Quaternion(), ax = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);

    const setLook = (mat, st, line) => {
      const u = mat.uniforms;
      u.uA.value = st.analytic; u.uS.value = st.synth; u.uB.value = st.bold;
      u.uLine.value = line; u.uLineW.value = LK.lineW + LK.lineBold * st.bold;
      u.uShadeAmt.value = LK.passage * st.analytic * (1 - st.synth);
      u.uWeave.value = LK.weave[0] + (LK.weave[1] - LK.weave[0]) * st.analytic;
      u.uBrush.value = LK.brush * st.analytic;
    };
    return {
      group, views, base, facets: fm, extras: xm,
      update(t) {
        // 1. every viewpoint: camera from t, render the still life into its target
        for (const v of views) {
          v.rig.update(t);
          renderer.setRenderTarget(v.rt);
          renderer.render(still, v.cam);
        }
        renderer.setRenderTarget(null);
        // 2. the picture plane
        const st = plan.stateAt(t);
        setLook(base.material, st, 0);
        plan.facets.forEach((f, i) => {
          const m = fm[i], ps = plan.facetPose(i, t);
          m.position.set(f.c[0] + ps.x, f.c[1] + ps.y, ps.z);
          qz.setFromAxisAngle(Z, ps.rz);
          const fa = f.flip ? f.flip.axis : [1, 0];
          qf.setFromAxisAngle(ax.set(fa[0], fa[1], 0), ps.flip);
          m.quaternion.copy(qz).multiply(qf);
          m.scale.setScalar(ps.s);
          setLook(m.material, st, plan.lineAt(i, t));
          m.material.uniforms.uRecentre.value = plan.recentreAt(i, t);
          m.material.uniforms.uFlipShade.value = 0.72 + 0.28 * Math.abs(Math.cos(ps.flip));
        });
        plan.extras.forEach((e, j) => {
          const m = xm[j], ps = plan.extraPose(j, t);
          m.visible = ps.visible;
          m.position.set(e.c[0] + ps.x, e.c[1] + ps.y, ps.z);
          m.quaternion.setFromAxisAngle(Z, ps.rz);
          setLook(m.material, st, 1);
        });
      },
    };
  }

  // ---------------------------------------------------------------- overlay caption: a torn-paper strip with ink type
  /** caption() -> overlay strip (cream paper, ink border, a vermilion square); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, s) => {
      if (!s.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      x.letterSpacing = "3px";
      const tw = Math.round(x.measureText(s.text.toUpperCase()).width);
      const pad = Math.round(Q.cap * 0.75), sq = Math.round(Q.h * 0.34);
      const pw = Math.min(W - 16, pad + sq + pad * 0.8 + tw + pad), ph = Q.h, oy = 6;
      const ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(20,14,8,0.30)"; x.fillRect(ox + 5, oy + 7, pw, ph);
      // a slightly irregular paper edge (fixed jag, not random per frame)
      x.fillStyle = Q.paper; x.beginPath();
      x.moveTo(ox, oy + 3); x.lineTo(ox + pw * 0.4, oy); x.lineTo(ox + pw, oy + 2); x.lineTo(ox + pw - 2, oy + ph); x.lineTo(ox + pw * 0.55, oy + ph - 2); x.lineTo(ox + 2, oy + ph); x.closePath(); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.stroke();
      x.fillStyle = Q.accent; x.fillRect(ox + pad, oy + (ph - sq) / 2, sq, sq);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(s.text.toUpperCase(), ox + pad + sq + pad * 0.8, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { stillLife, guitar, bottle, wineGlass, fruitBowl, newspaper, table, room, picture, caption, facetMaterial, facetMesh };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: facets, motion: facets, stillScene: still,
  };
}
