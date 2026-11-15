// styles/ukiyo-e/style.js — "Ukiyo-e": woodblock printing in passes. The look lives in spec.js; WHEN each block swings,
// presses and lifts lives in prints.js (THREE-free planner shared with SCORE); WHAT each block prints lives in
// artwork.js (2D canvas painter, one function per layer). This file turns a plan into pictures:
//   - a washi sheet (canvas: cream base, soft blotches, grain, seeded kozo fibres) on a pale hinoki bench, against two
//     low wooden kento guides (an L at the near-right corner, a straight guide on the near edge);
//   - one flat plane per printed layer just above the paper, drawn with MULTIPLY blending (dst * mix(1, ink, a)), so
//     the lit paper, its fibres and the block shadows show through every colour and the black key line survives every
//     pass, like transparent water-based ink. Each layer canvas gets wood-grain streaks and baren mottling knocked out;
//   - one carved cherry block per pass, hinged on the sheet's far edge; its underside carries that layer's inked relief
//     on darker carved-away wood plus kento marks, mapped so it is mirror-correct when it swings open;
//   - a baren (bamboo-sheath disc with a twisted handle) that rubs the key block's back; a stone seal;
//   - an overlay caption chip (exact colours).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas, woodTexture } from "../../kit/textures.js";
import { fbm2 } from "../../kit/noise.js";
import { rng, clamp, smoothstep } from "../../kit/time.js";
import * as prints from "./prints.js";
import { paintLayer, DESIGN, SEAL_BOX } from "./artwork.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const SH = spec.sheet, BL = spec.block;
  const imgW = SH.w - 2 * SH.margin, imgD = SH.d - 2 * SH.margin;
  const paperTop = SH.thickness;
  const blockW = SH.w + 2 * BL.pad, blockD = SH.d + 2 * BL.pad;
  const blockRest = paperTop + spec.kento.h + 0.002;           // the block rests on the kento guides, just above the paper
  const layerSpec = Object.fromEntries(spec.layers.map((l, i) => [l.id, { ...l, order: i }]));

  /** design px (artwork space) -> world xz on the sheet */
  const designToWorld = (x, y) => [(x / DESIGN[0] - 0.5) * imgW, (y / DESIGN[1] - 0.5) * imgD];

  // ---------------------------------------------------------------- shared canvases (built once, seeded)
  /** wood-grain knock-out tile: horizontal streaks + flecks as alpha (used to break up every flat colour) */
  const grainTile = (() => {
    const W = 1024, H = 512, c = newCanvas(W, H), x = c.getContext("2d");
    const img = x.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = j / H;
      const warp = fbm2(u * 3, v * 5, { seed: 71, octaves: 3, period: 3 });
      const g = 0.5 + 0.5 * Math.sin((v * 90 + warp * 7) * Math.PI * 2);
      const streak = smoothstep(0.5, 1, g);
      const fleck = fbm2(u * 64, v * 160, { seed: 72, octaves: 2, period: 64 });
      const a = clamp(streak * 0.75 + smoothstep(0.55, 0.8, fleck) * 0.6);
      const k = (j * W + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    return c;
  })();

  /** washi sheet canvas: cream base, soft blotches, fine grain, seeded kozo fibres */
  function washiCanvas(o = {}) {
    const W = o.W ?? 2048, H = Math.round(W * SH.d / SH.w);
    const c = newCanvas(W, H), x = c.getContext("2d");
    x.fillStyle = P.paper; x.fillRect(0, 0, W, H);
    // soft blotches: a low-res fbm field, scaled up smoothly
    const bw = 160, bh = Math.round(bw * H / W), b = newCanvas(bw, bh), bx = b.getContext("2d");
    const bi = bx.createImageData(bw, bh);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const n = fbm2(i / bw * 8, j / bh * 5, { seed: 81, octaves: 3, period: 64 }) - 0.5;
      const k = (j * bw + i) * 4;
      if (n > 0) { bi.data[k] = 255; bi.data[k + 1] = 252; bi.data[k + 2] = 240; bi.data[k + 3] = Math.round(n * 150); }
      else { bi.data[k] = 150; bi.data[k + 1] = 125; bi.data[k + 2] = 90; bi.data[k + 3] = Math.round(-n * 70); }
    }
    bx.putImageData(bi, 0, 0);
    x.imageSmoothingEnabled = true; x.drawImage(b, 0, 0, W, H);
    // fibres: long thin curved kozo strands, mostly lighter than the sheet, a few darker
    const r = rng(83);
    x.lineCap = "round";
    for (let i = 0; i < (o.fibres ?? SH.fibres); i++) {
      const px = r.range(0, W), py = r.range(0, H), ang = r.range(0, Math.PI * 2), len = r.range(30, 170) * (W / 2048);
      const bend = r.range(-0.6, 0.6);
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      const cx = (px + ex) / 2 + Math.cos(ang + Math.PI / 2) * len * bend * 0.4, cy = (py + ey) / 2 + Math.sin(ang + Math.PI / 2) * len * bend * 0.4;
      const dark = r.chance(0.22);
      x.strokeStyle = dark ? "rgba(120,98,70,0.22)" : "rgba(255,253,246,0.75)";
      x.lineWidth = r.range(0.8, 2.2) * (W / 2048);
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(cx, cy, ex, ey); x.stroke();
    }
    // fine grain (deterministic hash speckle)
    const gi = x.getImageData(0, 0, W, H), gd = gi.data, gr = rng(84);
    for (let k = 0; k < gd.length; k += 4) {
      const n = (gr.next() - 0.5) * 9;
      gd[k] = clamp(gd[k] + n, 0, 255); gd[k + 1] = clamp(gd[k + 1] + n, 0, 255); gd[k + 2] = clamp(gd[k + 2] + n * 1.1, 0, 255);
    }
    x.putImageData(gi, 0, 0);
    return c;
  }

  /** one printed layer's canvas (artwork + wood grain + baren mottling knocked out) */
  function layerCanvas(id) {
    const L = layerSpec[id], [W, H] = SH.px;
    const c = newCanvas(W, H), x = c.getContext("2d");
    paintLayer(id, x, W, H, L.color);
    if (L.grain > 0) {
      x.save();
      x.globalCompositeOperation = "destination-out";
      x.globalAlpha = L.grain;
      // each block has its own grain: offset + flip the tile per layer
      const o = L.order;
      x.translate(o % 2 ? W : 0, 0); x.scale(o % 2 ? -1 : 1, 1);
      const off = (o * 173) % 512;
      x.drawImage(grainTile, 0, off * 0.5, 1024, 512 - off * 0.5, 0, 0, W, H);
      // goma-zuri: fine sesame mottling from the baren
      const r = rng(900 + o);
      x.globalAlpha = L.grain * 0.5; x.fillStyle = "#000";
      for (let i = 0; i < 2600; i++) { x.beginPath(); x.arc(r.range(0, W), r.range(0, H), r.range(0.8, 2.2), 0, Math.PI * 2); x.fill(); }
      x.restore();
    }
    return c;
  }

  const tex = (canvas, aniso = 8) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  const upload = (...ts) => { for (const t of ts) stage.renderer.initTexture(t); };

  // ---------------------------------------------------------------- multiply ink material
  /** inkMaterial(texture) -> ShaderMaterial: dst * mix(1, ink, a * amount). uniforms.amount 0..1 */
  function inkMaterial(map, rank = 0) {
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, amount: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D map; uniform float amount; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv); float a = clamp(c.a * amount, 0.0, 1.0); gl_FragColor = vec4(mix(vec3(1.0), c.rgb, a), 1.0); }",
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -1 - rank * 0.2, polygonOffsetUnits: -2 - rank,
      fog: false, toneMapped: false,
    });
  }

  // ---------------------------------------------------------------- set pieces
  /** bench({ size }) -> pale hinoki bench top */
  function bench(o = {}) {
    const size = o.size ?? spec.bench.size, mat = materials.bench;
    if (mat.map) { mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(size / 4.5, size / 4.5); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "bench";
    return m;
  }

  /** sheet() -> Group: the washi sheet (box edge + fibre-textured top plane) */
  function sheet(o = {}) {
    const g = new THREE.Group(); g.name = "sheet";
    const edge = new THREE.Mesh(new THREE.BoxGeometry(SH.w, SH.thickness, SH.d), new THREE.MeshStandardMaterial({ color: P.paper, roughness: 0.9 }));
    edge.position.y = SH.thickness / 2; edge.receiveShadow = true; edge.castShadow = true; g.add(edge);
    const t = tex(washiCanvas(o)); upload(t);
    const mat = materials.paper; mat.map = t; mat.needsUpdate = true;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(SH.w, SH.d), mat);
    top.rotation.x = -Math.PI / 2; top.position.y = paperTop + 0.0002; top.receiveShadow = true; g.add(top);
    return g;
  }

  /** kento() -> Group: low wooden registration guides on the bench: an L at the sheet's near-right corner, a bar on the near edge */
  function kento() {
    const K = spec.kento, g = new THREE.Group(); g.name = "kento";
    const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, K.h, d), materials.kento); m.position.set(x, K.h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m); };
    const hw = SH.w / 2, hd = SH.d / 2;
    add(K.len, K.w, hw - K.len / 2 + K.w, hd + K.w / 2);          // L: along the near edge
    add(K.w, K.len, hw + K.w / 2, hd - K.len / 2 + K.w);          // L: along the right edge
    add(K.len, K.w, -hw * 0.45, hd + K.w / 2);                    // hikitsuke: straight guide on the near edge
    return g;
  }

  /** layers(ids) -> { group, meshes: { id: Mesh }, set(printed, lifts) } : one multiply plane per layer */
  function layers(ids) {
    const group = new THREE.Group(); group.name = "printLayers";
    const meshes = {};
    ids.forEach((id, k) => {
      const c = layerCanvas(id), t = tex(c); upload(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(imgW, imgD), inkMaterial(t, k));
      m.rotation.x = -Math.PI / 2;
      m.userData.baseY = paperTop + 0.0005 + (k + 1) * SH.layerGap;
      m.position.y = m.userData.baseY;
      m.renderOrder = 5 + k; m.name = `layer-${id}`;
      m.userData.canvas = c;
      group.add(m); meshes[id] = m;
    });
    return {
      group, meshes,
      set(printed, lift = () => 0) {
        for (const id of ids) {
          const m = meshes[id];
          m.material.uniforms.amount.value = printed[id] ?? 0;
          m.visible = (printed[id] ?? 0) > 0;
          m.position.y = m.userData.baseY + lift(id);
        }
      },
    };
  }

  const woodSide = (() => {
    const t = woodTexture({ size: 512, boards: 1, seed: 63, grainFreq: 18, grainWarp: 2, contrast: 0.45, dark: P.blockDark, mid: P.blockMid, light: P.blockLight, seam: P.cut });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; upload(t);
    return t;
  })();

  /** block face canvas: carved-away (darker) wood, the layer's inked relief in the image area, kento marks */
  function blockFaceCanvas(id, layerC) {
    const [W, H] = BL.facePx, c = newCanvas(W, H), x = c.getContext("2d");
    x.drawImage(woodSide.image, 0, 0, W, H);
    x.fillStyle = `rgba(40,20,10,${1 - BL.carveDark})`; x.fillRect(0, 0, W, H);
    const r = rng(700 + layerSpec[id].order);
    x.strokeStyle = "rgba(25,12,6,0.35)"; x.lineCap = "round";
    for (let i = 0; i < 220; i++) { // chisel gouges
      const px = r.range(0, W), py = r.range(0, H), a = r.range(-0.4, 0.4), l = r.range(6, 22);
      x.lineWidth = r.range(1, 2.5); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    const sx = W / blockW, sy = H / blockD;
    const ix = (blockW - imgW) / 2 * sx, iy = (blockD - imgD) / 2 * sy;
    // raised, inked relief: light wood under the ink, then the ink
    const tmp = newCanvas(W, H), tx = tmp.getContext("2d");
    tx.drawImage(layerC, ix, iy, imgW * sx, imgD * sy);
    tx.globalCompositeOperation = "source-in"; tx.fillStyle = P.blockLight; tx.fillRect(0, 0, W, H);
    x.drawImage(tmp, 0, 0);
    x.globalAlpha = 0.92; x.drawImage(layerC, ix, iy, imgW * sx, imgD * sy); x.globalAlpha = 1;
    // kento marks carved on the block: L at the near-right paper corner, bar on the near edge
    const K = spec.kento, cx = (blockW / 2 + SH.w / 2) * sx, cy = (blockD / 2 + SH.d / 2) * sy;
    x.fillStyle = P.blockLight; x.strokeStyle = "rgba(30,15,8,0.6)"; x.lineWidth = 2;
    const rect = (a, b, w, h) => { x.fillRect(a, b, w, h); x.strokeRect(a, b, w, h); };
    rect(cx - K.len * sx + K.w * sx, cy, K.len * sx, K.w * sy);
    rect(cx, cy - K.len * sy + K.w * sy, K.w * sx, K.len * sy);
    rect((blockW / 2 - SH.w / 2 * 0.45 - K.len / 2) * sx, cy, K.len * sx, K.w * sy);
    return c;
  }

  /** block(id, layerCanvas) -> pivot Group hinged at the far edge; userData.setPose(pose) */
  function block(id, layerC) {
    const pivot = new THREE.Group(); pivot.name = `block-${id}`;
    const body = new THREE.Mesh(new THREE.BoxGeometry(blockW, BL.thickness, blockD), materials.blockSide);
    if (!materials.blockSide.map) { materials.blockSide.map = woodSide; materials.blockSide.needsUpdate = true; }
    body.position.set(0, BL.thickness / 2, blockD / 2); body.castShadow = true; body.receiveShadow = true;
    pivot.add(body);
    const ft = tex(blockFaceCanvas(id, layerC), 8); upload(ft);
    const fg = new THREE.PlaneGeometry(blockW, blockD);
    fg.rotateX(Math.PI / 2);                     // normal -> -y (faces the paper)
    const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // v = 1 at the far edge, as on the paper
    const face = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55 }));
    face.position.set(0, -0.0006, blockD / 2); pivot.add(face);
    pivot.position.set(0, blockRest, -blockD / 2);
    pivot.userData.setPose = (p) => {
      pivot.visible = p.visible;
      pivot.rotation.x = -p.angle;
      pivot.position.set(0, blockRest + p.y - 0.004 * (p.press ?? 0), -blockD / 2 + p.z);
    };
    pivot.visible = false;
    return pivot;
  }

  /** baren() -> Group: bamboo-sheath disc with a lacquered rim and a twisted handle; userData.setPose({ on, u, v, press, rise }) */
  function baren() {
    const B = spec.baren, g = new THREE.Group(); g.name = "baren";
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 1.02, B.h, 48), materials.bamboo);
    disc.position.y = B.h / 2; disc.castShadow = true; g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(B.r * 1.0, 0.012, 10, 48), materials.baren);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.012; g.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(B.r * 0.55, 0.028, 10, 32, Math.PI), materials.bamboo);
    handle.position.y = B.h; handle.castShadow = true; g.add(handle);
    for (const s of [-1, 1]) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), materials.bamboo);
      knot.scale.set(1, 0.6, 1); knot.position.set(s * B.r * 0.55, B.h + 0.01, 0); g.add(knot);
    }
    // twist stripes on the handle
    for (let i = 0; i < 7; i++) {
      const a = (i + 0.5) / 7 * Math.PI, rr = B.r * 0.55;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), materials.baren);
      band.position.set(Math.cos(a) * rr, B.h + Math.sin(a) * rr, 0); band.rotation.y = Math.PI / 2; band.rotation.x = a; g.add(band);
    }
    g.visible = false;
    const top = blockRest + BL.thickness;
    g.userData.setPose = (p) => {
      g.visible = p.on;
      if (!p.on) return;
      g.position.set(p.u * SH.w, top + 0.002 + p.rise * 0.35, p.v * SH.d);
      g.rotation.set(0.04 * Math.sin(p.u * 9), p.u * 1.2, -0.06 * p.rise);
    };
    return g;
  }

  /** sealStone() -> Group at the seal reserve; userData.setPose({ visible, y }) */
  function sealStone() {
    const S = spec.sealStone, g = new THREE.Group(); g.name = "sealStone";
    const body = new THREE.Mesh(new RoundedBoxGeometry(S.size, S.h, S.size, 3, 0.02), materials.sealStone);
    body.position.y = S.h / 2 + 0.004; body.castShadow = true; g.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(S.size * 0.9, S.size * 0.9), new THREE.MeshStandardMaterial({ color: P.seal, roughness: 0.6 }));
    face.rotation.x = Math.PI / 2; face.position.y = 0.003; g.add(face);
    const s = SEAL_BOX, [x, z] = designToWorld(s.x + s.s / 2, s.y + s.s / 2);
    g.userData.setPose = (p) => { g.visible = p.visible; g.position.set(x, paperTop + 0.006 + p.y, z); };
    g.visible = false;
    return g;
  }

  // ---------------------------------------------------------------- overlay caption
  /** caption() -> overlay chip (paper plate, ink border, a red seal square); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.25}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.42);
      const pw = Math.min(W - 16, pad + ic + pad * 0.8 + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(40,28,15,0.25)"; x.fillRect(ox + 3, oy + 6, pw, ph);
      x.fillStyle = Q.plate; x.fillRect(ox, oy, pw, ph);
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.strokeRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3);
      x.lineWidth = 1.2; x.strokeRect(ox + 7, oy + 7, pw - 14, ph - 14);
      x.fillStyle = Q.accent; x.fillRect(ox + pad, oy + (ph - ic) / 2, ic, ic);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad * 0.8, oy + ph / 2 + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- the whole printing session for one plan
  /**
   * printSession(plan) -> { group, layers, blocks, baren, seal, update(t) } (adds itself to the scene)
   *   plan = prints.createPrintPlan(...); every pass's `layer` must be an artwork layer id (spec.layers).
   *   update(t): block poses, baren, seal stone, which layers are printed, and the finale lift (parallax).
   */
  function printSession(plan) {
    const group = new THREE.Group(); group.name = "ukiyo-e";
    group.add(bench()); group.add(sheet()); group.add(kento());
    const ids = plan.layers;
    // stacking + lift rank: colours in print order, then the key line and the seal on top
    const order = ids.filter((id) => id !== "key" && id !== "seal").concat(ids.includes("key") ? ["key"] : [], ids.includes("seal") ? ["seal"] : []);
    const lay = layers(order); group.add(lay.group);
    const blocks = plan.passes.map((p) => { const b = block(p.layer, lay.meshes[p.layer].userData.canvas); group.add(b); return b; });
    const br = baren(); group.add(br);
    const seal = sealStone(); group.add(seal);
    stage.scene.add(group);
    const nColour = order.length - (ids.includes("seal") ? 1 : 0);
    const rank = (id) => (id === "seal" ? nColour - 1 : order.indexOf(id));
    return {
      group, layers: lay, blocks, baren: br, seal,
      update(t) {
        plan.passes.forEach((p, i) => blocks[i].userData.setPose(plan.blockPose(i, t)));
        br.userData.setPose(plan.barenAt(t));
        seal.userData.setPose(plan.sealPose(t));
        lay.set(plan.printed(t), (id) => plan.liftAt(t, rank(id), nColour));
      },
    };
  }

  const props = { bench, sheet, kento, layers, block, baren, sealStone, caption, printSession, washiCanvas, layerCanvas, inkMaterial };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: prints, motion: prints, designToWorld, dims: { imgW, imgD, blockW, blockD, paperTop, blockRest },
  };
}
