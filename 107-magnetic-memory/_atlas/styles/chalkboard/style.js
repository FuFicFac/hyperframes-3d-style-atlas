// styles/chalkboard/style.js — "Chalkboard": a real slate chalkboard in a room, chalk that writes itself.
// The board picture is a canvas painted as a PURE function of t from a chalk plan (chalk.js): every stroke is stamped
// with grainy, pressure-varying chalk dabs along its length; erase/smudge ops cut it back with destination-out. Completed
// ops are cached in a "committed" canvas that only ever holds a PREFIX of the op list (extended forward, rebuilt from
// the baked ghost layer on any backward seek), so the frame never depends on which frames were drawn before.
// The slate shader turns chalk alpha into coverage against a "tooth" texture: light pressure only catches the peaks.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { makeCanvas, canvasTexture, paintPixels, fbm2, noiseTexture, woodTexture } from "../../kit/textures.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, smoothstep } from "../../kit/time.js";
import * as CHALK from "./chalk.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const { planChalk, strokeProgress, pressureAt, pointAtArc, tipAt, eraserAt, lastStartedIndex } = CHALK;
const colourOf = (palette, c) => palette.chalk[c] ?? c;

// ---------------------------------------------------------------- sprites
function dabSprites(hex, n, seed, size = 32) {
  const out = [];
  const c3 = new THREE.Color(hex);
  const R = Math.round(c3.r * 255), G = Math.round(c3.g * 255), B = Math.round(c3.b * 255);
  for (let k = 0; k < n; k++) {
    const cv = makeCanvas(size), ctx = cv.getContext("2d"), img = ctx.createImageData(size, size), h = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - h) / h, dy = (y + 0.5 - h) / h;
      const ang = Math.atan2(dy, dx), edge = 0.78 + 0.22 * Math.sin(ang * 3 + k * 1.7) * hash01(k, seed, 1);
      const d = Math.hypot(dx, dy) / edge;
      const g = hash01(x, y, k * 31 + seed);
      let a = smoothstep(1, 0.45, d) * (0.45 + 0.55 * g);
      if (g < 0.16) a *= 0.15; // tiny holes = broken chalk
      const i = (y * size + x) * 4;
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = Math.round(clamp(a) * 255);
    }
    ctx.putImageData(img, 0, 0);
    out.push(cv);
  }
  return out;
}
function softSprite(w, h, { round = false, soft = 0.35, hex = "#ffffff", seed = 3 } = {}) {
  const cv = makeCanvas(w, h), ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), c3 = new THREE.Color(hex);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
    const d = round ? Math.hypot(u, v) : Math.max(Math.abs(u), Math.abs(v) * 0.8 + Math.abs(u) * 0.2);
    const a = smoothstep(1, 1 - soft, d) * (0.75 + 0.25 * hash01(x, y, seed));
    const i = (y * w + x) * 4;
    img.data[i] = c3.r * 255; img.data[i + 1] = c3.g * 255; img.data[i + 2] = c3.b * 255; img.data[i + 3] = Math.round(clamp(a) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * chalkPainter({ w, h, ppm, chalk, palette, flow, stampSpacing, dabs }) -> { canvas size helpers, drawOp(ctx, op, p) }
 * Stateless stamping of one op at progress p (0..1) into any 2D context. Pure in (op, p).
 */
export function chalkPainter(o) {
  const { w, h, ppm, chalk: C, palette } = o;
  const W = Math.round(w * ppm), H = Math.round(h * ppm);
  const toPx = (x, y) => [(x + w / 2) * ppm, (h / 2 - y) * ppm];
  const sets = {};
  const dabs = (c) => (sets[c] ??= dabSprites(colourOf(palette, c), o.dabs ?? 8, 17 + Object.keys(sets).length * 101));
  const E = C.eraser;
  const eraseSprite = softSprite(48, Math.round(48 * E.w / E.h * 0.5) * 2, { soft: 0.45, seed: 5 });
  const roundSprite = softSprite(64, 64, { round: true, soft: 0.8, seed: 9 });
  const dustHex = colourOf(palette, "white");
  const smearSprite = softSprite(64, 64, { round: true, soft: 0.9, hex: dustHex, seed: 13 });
  const smearRect = softSprite(48, Math.round(48 * E.w / E.h * 0.5) * 2, { soft: 0.6, hex: dustHex, seed: 15 });

  function drawStroke(ctx, st, p) {
    const L = st.len * p, D = dabs(st.color), r0 = st.width / 2;
    const step = Math.max(0.0008, r0 * (o.stampSpacing ?? 0.36));
    const n = Math.floor(L / step);
    const P = st.pts, c = st.cum;
    let seg = 1;
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i <= n; i++) {
      const s = i * step;
      while (seg < c.length - 1 && c[seg] < s) seg++;
      const u = clamp((s - c[seg - 1]) / ((c[seg] - c[seg - 1]) || 1));
      const x = lerp(P[seg - 1][0], P[seg][0], u), y = lerp(P[seg - 1][1], P[seg][1], u);
      const pr = pressureAt(st, s, C.pressure);
      const r = r0 * (0.72 + 0.4 * Math.min(pr, 1.25));
      const j1 = hash01(st.seed, i, 1) - 0.5, j2 = hash01(st.seed, i, 2) - 0.5;
      const [px, py] = toPx(x + j1 * r * 0.55, y + j2 * r * 0.55);
      const rp = r * ppm * 1.25;
      ctx.globalAlpha = clamp((o.flow ?? 0.3) * Math.min(pr, 1.3));
      ctx.drawImage(D[Math.floor(hash01(st.seed, i, 3) * D.length)], px - rp, py - rp, rp * 2, rp * 2);
    }
  }
  function drawWipe(ctx, op, p) {
    const isE = op.kind === "erase";
    const fw = isE ? E.h : op.width, fh = isE ? E.w : op.width;
    const step = 0.01, k = Math.max(1, fw / step);
    const aCut = 1 - Math.pow(1 - clamp(op.strength, 0, 0.999), 1 / k);
    const aSmear = 1 - Math.pow(1 - clamp(op.smear, 0, 0.999), 1 / k);
    const n = Math.floor((op.len * p) / step);
    const cut = isE ? eraseSprite : roundSprite, smear = isE ? smearRect : smearSprite;
    const wpx = fw * ppm * 1.15, hpx = fh * ppm * 1.05;
    for (let i = 0; i <= n; i++) {
      const q = pointAtArc(op, i * step), [px, py] = toPx(q[0], q[1]);
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = aCut;
      ctx.drawImage(cut, px - wpx / 2, py - hpx / 2, wpx, hpx);
      ctx.globalCompositeOperation = "source-over";
      // feather the dusty smear toward the wiped rect's border so the haze has no hard rectangular edge
      const R = op.rect, edge = R ? smoothstep(0, 0.09, Math.min(q[0] - R[0], R[2] - q[0], q[1] - R[1], R[3] - q[1])) : 1;
      ctx.globalAlpha = aSmear * (0.7 + 0.6 * hash01(op.seed, i, 7)) * (0.25 + 0.75 * edge);
      ctx.drawImage(smear, px - wpx / 2, py - hpx / 2, wpx, hpx);
    }
  }
  const drawOp = (ctx, op, p) => (op.kind === "stroke" ? drawStroke(ctx, op, p) : drawWipe(ctx, op, p));
  const resetCtx = (ctx) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
  };
  return { W, H, toPx, drawOp, resetCtx };
}

/** ghostProgram(S) -> a seeded "previous lessons" chalk program: fragments, then old wipes and eraser arcs over them. */
export function ghostProgram(S) {
  const r = rng(`ghost:${S.slate.seed}`), B = S.board, items = [];
  const words = ["2X + 3 = 11", "PHOTOSYNTHESIS", "HOMEWORK P.42", "QUIZ FRIDAY!", "NOUNS & VERBS", "1066", "Y = MX + B", "7 × 8 = 56", "H2O", "DATES →"];
  for (let k = 0; k < S.slate.ghosts; k++) {
    items.push({ type: "text", text: words[(k * 3 + r.int(0, 9)) % words.length], cap: r.range(0.07, 0.14), x: r.range(-1.5, 0.5), y: r.range(-0.75, 0.42),
      color: r.chance(0.2) ? "yellow" : "white", at: 0, seed: `g${k}` });
  }
  items.push({ type: "circle", c: [r.range(-1, 1), r.range(-0.4, 0.4)], rx: 0.22, ry: 0.18, at: 0 });
  items.push({ type: "arrow", a: [r.range(-1.2, 0), r.range(-0.6, 0.6)], b: [r.range(0.3, 1.4), r.range(-0.6, 0.6)], at: 0 });
  items.push({ type: "box", x0: 0.6, y0: -0.7, x1: 1.3, y1: -0.35, at: 0 });
  // old wipes: horizontal bands across the whole board
  const bands = 4;
  for (let k = 0; k < bands; k++) {
    const y1 = B.h / 2 - (k * B.h) / bands, y0 = y1 - B.h / bands - 0.05;
    items.push({ type: "erase", rect: [-B.w / 2 + 0.05, y0, B.w / 2 - 0.05, y1], strength: 1 - r.range(...S.slate.erasedTo), smear: S.slate.smearLevel, at: 0, seed: `w${k}` });
  }
  for (let k = 0; k < S.slate.smears; k++) {
    const cx = r.range(-1.5, 1.5), cy = r.range(-0.8, 0.8), R0 = r.range(0.25, 0.6), a0 = r.range(0, 6.28), sw = r.range(1.2, 2.4);
    const pts = Array.from({ length: 24 }, (_, i) => { const a = a0 + (sw * i) / 23; return [cx + Math.cos(a) * R0, cy + Math.sin(a) * R0 * 0.6]; });
    items.push({ type: "smudge", pts, width: r.range(0.08, 0.14), strength: 0.2, smear: S.slate.smearLevel * r.range(0.6, 1.4), at: 0, seed: `s${k}` });
  }
  return items;
}

/**
 * createStyle(stage, opts?) -> style
 *   props:     board(o) (slate + frame + tray + props + chalk layer; userData.setPlan(plan), update(t)), wall(o), windowMullions(o),
 *              chalkStick(color, len), eraser(), floatingChalk(), dust()
 *   plan:      the chalk.js module (planChalk, chalkText, textBox, chalkVoices, tipAt, eraserAt, CHALK_FONT ...)
 *   helpers:   chalkPainter, ghostProgram, boardCoords
 */
export function createStyle(stage, opts = {}) {
  const S = STYLE_SPEC, P = S.palette, BD = S.board;
  const { materials, lights, post } = applyStyleSpec(stage, S, opts);
  const textStyle = { font: FONTS[S.text.font] ?? S.text.font, weight: S.text.weight, color: S.text.color, height: S.text.height };
  stage.renderer.shadowMap.enabled = true;

  // ---- textures
  materials.wall.map = noiseTexture({ ...S.textures.wall, repeat: [4, 2.5] });
  materials.wall.needsUpdate = true;
  materials.oak.map = woodTexture({ ...S.textures.oak, repeat: [1, 1] });
  materials.oak.needsUpdate = true;
  const slateTex = slateTexture();
  materials.slate.map = slateTex;
  const toothTex = toothTexture();

  function slateTexture() {
    const L = S.slate, w = Math.round(BD.w * BD.slatePpm), h = Math.round(BD.h * BD.slatePpm);
    const base = new THREE.Color(P.slate), dk = new THREE.Color(P.slateDark), dust = new THREE.Color(P.chalk.white);
    const asp = BD.w / BD.h;
    const cv = paintPixels([w, h], (u, v) => {
      const n = fbm2(u * L.mottleScale * asp, v * L.mottleScale, { seed: L.seed, octaves: 5, period: 64 });
      const st = fbm2(u * 2 * asp, v * 60, { seed: L.seed + 3, octaves: 2, period: 64 });
      let k = 1 + L.mottle * (n - 0.5) * 2 + L.streak * (st - 0.5) * 2;
      const edge = Math.min(u, 1 - u, v * asp, (1 - v) * asp);
      k *= 0.86 + 0.14 * smoothstep(0, 0.02, edge);
      const mixDk = clamp(0.5 - (n - 0.5) * 2.2);
      const c = [lerp(base.r, dk.r, mixDk * 0.5) * k, lerp(base.g, dk.g, mixDk * 0.5) * k, lerp(base.b, dk.b, mixDk * 0.5) * k];
      const fromBottom = (1 - v);
      const dd = L.dustLevel * (1 - smoothstep(0, L.dustEdge, fromBottom)) * (0.5 + fbm2(u * 30, v * 8, { seed: 5, octaves: 3, period: 64 }));
      // sRGB components (paintPixels writes sRGB bytes); Color() gave linear -> convert back
      return c.map((x, i) => toSrgb(lerp(x, [dust.r, dust.g, dust.b][i], clamp(dd))));
    });
    return canvasTexture(cv, { srgb: true });
  }
  function toothTexture() {
    const T = S.tooth;
    const cv = paintPixels(T.size, (u, v, x, y) => {
      const f = fbm2(u * 64, v * 64, { seed: T.seed, octaves: 3, period: 64 });
      const g = hash01(x, y, T.seed);
      return clamp((0.65 * f + 0.35 * g - 0.5) * 2.4 + 0.5);
    });
    return canvasTexture(cv, { srgb: false });
  }

  // ---- the chalk layer (canvas -> texture) + slate material with the tooth shader
  const painter = chalkPainter({ w: BD.w, h: BD.h, ppm: BD.ppm, chalk: S.chalk, palette: P, flow: S.chalk.flow, stampSpacing: S.chalk.stampSpacing, dabs: S.chalk.dabs });
  const ghost = makeCanvas(painter.W, painter.H), gctx = ghost.getContext("2d");
  const dustRgb = new THREE.Color(P.chalk.white);
  const baseFill = `rgba(${Math.round(toSrgb(dustRgb.r) * 255)},${Math.round(toSrgb(dustRgb.g) * 255)},${Math.round(toSrgb(dustRgb.b) * 255)},${1 / 255})`;
  gctx.fillStyle = baseFill; // near-transparent chalk colour (not black) so filtered edges don't darken
  gctx.fillRect(0, 0, painter.W, painter.H);
  {
    const gp = planChalk(ghostProgram(S), S.chalk);
    gctx.globalAlpha = 1;
    for (const op of [...gp.ops].sort((x, y) => x.order - y.order)) { // program order: all ghosts at t=0, wipes after
      if (op.kind === "stroke") op.pressure *= S.slate.ghostLevel;
      painter.drawOp(gctx, op, 1);
    }
    painter.resetCtx(gctx);
  }
  const committed = makeCanvas(painter.W, painter.H), cctx = committed.getContext("2d");
  const display = makeCanvas(painter.W, painter.H), dctx = display.getContext("2d");
  const chalkTex = canvasTexture(display, { srgb: true, anisotropy: 8 });
  chalkTex.wrapS = chalkTex.wrapT = THREE.ClampToEdgeWrapping;
  const T = S.tooth;
  materials.slate.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      chalkMap: { value: chalkTex }, toothMap: { value: toothTex }, toothRepeat: { value: new THREE.Vector2(...T.repeat) },
      toothSoft: { value: T.soft }, toothFloor: { value: T.floor ?? 0 }, toothGain: { value: T.gain }, hazeMix: { value: T.haze }, microAmt: { value: T.micro },
    });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vChalkUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvChalkUv = uv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vChalkUv;
uniform sampler2D chalkMap; uniform sampler2D toothMap; uniform vec2 toothRepeat;
uniform float toothSoft; uniform float toothFloor; uniform float toothGain; uniform float hazeMix; uniform float microAmt;
float chalkK = 0.0;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
{
  float tooth = toothFloor + (1.0 - toothFloor) * texture2D(toothMap, vChalkUv * toothRepeat).r;
  diffuseColor.rgb *= 1.0 - microAmt + 2.0 * microAmt * tooth;
  vec4 ck = texture2D(chalkMap, vChalkUv);
  float cov = smoothstep(tooth - toothSoft, tooth + toothSoft, ck.a * toothGain);
  chalkK = clamp(cov + ck.a * hazeMix, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, ck.rgb, chalkK);
}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.97, chalkK);");
  };
  materials.slate.customProgramCacheKey = () => "chalkboard-slate";
  materials.slate.needsUpdate = true;

  // painter state: committed = ghost + ops[0..ck) fully drawn (a PREFIX of the op list); rebuilt on backward seeks.
  let plan = null, ck = -1, lastKey = null;
  function resetCommitted() {
    painter.resetCtx(cctx);
    cctx.clearRect(0, 0, painter.W, painter.H);
    cctx.drawImage(ghost, 0, 0);
    ck = 0;
  }
  function paintBoard(t) {
    if (!plan) return;
    const ops = plan.ops;
    let k = 0;
    while (k < ops.length && ops[k].t1 <= t) k++;
    if (ck < 0 || k < ck) resetCommitted();
    for (let i = ck; i < k; i++) { painter.drawOp(cctx, ops[i], 1); }
    painter.resetCtx(cctx);
    ck = k;
    const act = [];
    for (let i = k; i < ops.length && ops[i].t0 <= t; i++) {
      const op = ops[i];
      act.push([i, op.kind === "stroke" ? strokeProgress(op, t) : clamp((t - op.t0) / (op.t1 - op.t0))]);
    }
    const key = `${k}|${act.map(([i, p]) => `${i}:${p.toFixed(6)}`).join(",")}`;
    if (key === lastKey) return;
    lastKey = key;
    painter.resetCtx(dctx);
    dctx.clearRect(0, 0, painter.W, painter.H);
    dctx.drawImage(committed, 0, 0);
    for (const [i, p] of act) painter.drawOp(dctx, ops[i], p);
    painter.resetCtx(dctx);
    chalkTex.needsUpdate = true;
  }

  // ---- geometry helpers
  const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const box = (w, h, d, mat, r = 0) => shadowed(new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat));
  const F = BD.frame, TR = BD.tray;
  const trayTop = -BD.h / 2 - 0.05; // the bottom rail is 5 cm; the tray shelf sits under it

  function chalkStick(color = "white", len = 0.07) {
    const r = S.floatChalk.r * 0.95;
    const m = new THREE.MeshStandardMaterial({ color: colourOf(P, color), roughness: 0.95, metalness: 0 });
    const g = new THREE.CylinderGeometry(r, r * 0.97, len, 12, 1);
    return shadowed(new THREE.Mesh(g, m));
  }
  function eraser() {
    const E = S.chalk.eraser, g = new THREE.Group();
    const felt = box(E.w, E.d * 0.38, E.h, materials.felt, 0.004); felt.position.y = -E.d * 0.31;
    const back = box(E.w * 0.98, E.d * 0.62, E.h * 0.96, materials.eraserBack, 0.008); back.position.y = E.d * 0.19;
    g.add(felt, back);
    return g;
  }
  function floatingChalk() {
    const C = S.floatChalk, g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: P.chalk.white, roughness: 0.95, metalness: 0, transparent: true, opacity: 1 });
    const tip = new THREE.CylinderGeometry(C.r, C.r * 0.5, 0.014, 12, 1); tip.translate(0, 0.007, 0);
    const body = new THREE.CylinderGeometry(C.r, C.r, C.len - 0.014, 12, 1); body.translate(0, 0.014 + (C.len - 0.014) / 2, 0);
    g.add(shadowed(new THREE.Mesh(tip, m), true, false), shadowed(new THREE.Mesh(body, m), true, false));
    g.userData.material = m;
    return g;
  }
  function dust() {
    const D = S.dust, geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(D.capacity * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(D.capacity * 3), 3));
    geo.setDrawRange(0, 0);
    const sprite = canvasTexture(softSprite(32, 32, { round: true, soft: 0.9 }), { srgb: true });
    sprite.wrapS = sprite.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.PointsMaterial({ size: D.size, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }
  function wall(o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w ?? 8, o.h ?? 5), materials.wall);
    m.position.z = -BD.backing - 0.001;
    m.receiveShadow = true;
    return m;
  }
  function windowMullions() {
    const Wd = S.window, g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    if (!Wd.enabled) return g;
    const bar = (w, h, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), m); b.position.set(x, y, 0); b.castShadow = true; g.add(b); };
    const [nx, ny] = Wd.bars;
    for (let i = 1; i < nx; i++) bar(Wd.bar, Wd.h, -Wd.w / 2 + (Wd.w * i) / nx, 0);
    for (let j = 1; j < ny; j++) bar(Wd.w, Wd.bar * 0.8, 0, -Wd.h / 2 + (Wd.h * j) / ny);
    g.position.set(...Wd.at);
    g.rotation.y = Wd.yaw;
    return g;
  }

  function board(o = {}) {
    const g = new THREE.Group();
    const slate = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(BD.w, BD.h), materials.slate), false, true);
    g.add(slate);
    const back = box(BD.w + 2 * F.width, BD.h + 2 * F.width, BD.backing, new THREE.MeshStandardMaterial({ color: "#151a17", roughness: 0.9 }));
    back.position.z = -BD.backing / 2 - 0.002; g.add(back);
    const zR = F.front - F.depth / 2;
    const top = box(BD.w + 2 * F.width, F.width, F.depth, materials.oak, F.radius); top.position.set(0, BD.h / 2 + F.width / 2, zR);
    const left = box(F.width, BD.h + 2 * F.width, F.depth, materials.oak, F.radius); left.position.set(-(BD.w / 2 + F.width / 2), 0, zR);
    const right = left.clone(); right.position.x *= -1;
    const bottom = box(BD.w + 2 * F.width, 0.05, F.depth, materials.oak, F.radius); bottom.position.set(0, -BD.h / 2 - 0.025, zR);
    g.add(top, left, right, bottom);
    // tray: shelf + front lip + two brackets
    const trayW = BD.w + 2 * F.width + 2 * TR.overhang;
    const shelf = box(trayW, TR.thick, TR.depth, materials.oak, 0.005);
    shelf.position.set(0, trayTop - TR.thick / 2, -BD.backing + TR.depth / 2);
    const lip = box(trayW, TR.lip, TR.lipThick, materials.oak, 0.004);
    lip.position.set(0, trayTop + TR.lip / 2 - 0.002, -BD.backing + TR.depth - TR.lipThick / 2);
    g.add(shelf, lip);
    for (const x of [-1.2, 1.2]) { const br = box(0.04, 0.12, TR.depth * 0.8, materials.oak, 0.004); br.position.set(x, trayTop - TR.thick - 0.06, -BD.backing + TR.depth * 0.4); g.add(br); }
    // dust on the tray (a speckle/haze decal)
    const R = rng("tray-dust");
    const dcv = makeCanvas(1024, 64), dx = dcv.getContext("2d");
    dx.fillStyle = "rgba(0,0,0,0)"; dx.fillRect(0, 0, 1024, 64);
    for (let i = 0; i < 1400; i++) {
      const x = R.range(0, 1024), y = R.range(0, 64), r = R.range(0.5, 2.6), a = R.range(0.1, 0.5) * (0.4 + 0.6 * Math.sin((x / 1024) * 9 + 1) ** 2);
      dx.fillStyle = `rgba(235,232,222,${a})`; dx.beginPath(); dx.arc(x, y, r, 0, Math.PI * 2); dx.fill();
    }
    const dmat = new THREE.MeshStandardMaterial({ map: canvasTexture(dcv), transparent: true, roughness: 1, depthWrite: false });
    const dplane = new THREE.Mesh(new THREE.PlaneGeometry(trayW - 0.04, TR.depth - TR.lipThick - 0.01), dmat);
    dplane.rotation.x = -Math.PI / 2; dplane.position.set(0, trayTop + 0.0006, -BD.backing + (TR.depth - TR.lipThick) / 2); dplane.receiveShadow = true;
    g.add(dplane);
    // chalk sticks lying on the tray
    const sticks = o.sticks ?? ["white", "white", "yellow", "pink", "blue", "green"];
    const SR = rng("sticks");
    let sx = -1.25;
    for (const c of sticks) {
      const len = SR.range(0.045, 0.085), st = chalkStick(c, len);
      st.rotation.z = Math.PI / 2; st.rotation.y = SR.range(-0.25, 0.25);
      st.position.set(sx, trayTop + S.floatChalk.r * 0.95, -BD.backing + SR.range(0.03, 0.07));
      sx += SR.range(0.09, 0.2);
      g.add(st);
    }
    // the eraser (rests on the tray; lifts to wipe)
    const E = S.chalk.eraser, er = eraser();
    const rest = [o.eraserRest?.[0] ?? 1.15, trayTop + E.d / 2 + 0.0005, -BD.backing + 0.06];
    er.position.set(...rest);
    g.add(er);
    // floating chalk + dust particles
    const fc = floatingChalk(); fc.visible = false; g.add(fc);
    const dp = dust(); g.add(dp);

    const qBoard = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, "ZYX"));
    const qRest = new THREE.Quaternion();
    const tilt = new THREE.Vector3(...S.floatChalk.tilt).normalize();
    const yAxis = new THREE.Vector3(0, 1, 0), qTilt = new THREE.Quaternion(), qSway = new THREE.Quaternion();
    const col = new THREE.Color();
    const dustCols = Object.fromEntries(Object.keys(P.chalk).map((k) => [k, new THREE.Color(P.chalk[k])]));

    g.userData.setPlan = (pl) => { plan = pl; ck = -1; lastKey = null; };
    g.userData.rest = rest;
    g.userData.update = (t) => {
      paintBoard(t);
      if (!plan) return;
      // floating chalk
      const tip = tipAt(plan, t, S.floatChalk);
      fc.visible = !!tip && tip.level > 0.01;
      if (fc.visible) {
        fc.position.set(tip.x, tip.y, tip.z + 0.001);
        const sway = clamp(tip.dir[0], -1, 1) * 0.12;
        qTilt.setFromUnitVectors(yAxis, tilt);
        qSway.setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway);
        fc.quaternion.copy(qSway).multiply(qTilt);
        fc.userData.material.color.set(colourOf(P, tip.color));
        fc.userData.material.opacity = tip.level;
      }
      // eraser
      const e = eraserAt(plan, t, rest);
      if (e) { er.position.set(e.x, e.y, e.z); er.quaternion.copy(qRest).slerp(qBoard, e.onBoard); }
      else { er.position.set(...rest); er.quaternion.copy(qRest); }
      // dust: closed-form particles shed along recent strokes
      const D = S.dust, pos = dp.geometry.attributes.position.array, cl = dp.geometry.attributes.color.array;
      let n = 0;
      const SS = plan.strokes;
      for (let i = lastStartedIndex(SS, t); i >= 0 && n < D.capacity; i--) {
        const s = SS[i];
        if (s.t0 < t - D.life - 1.5) break;
        if (s.t1 < t - D.life) continue;
        const m = Math.ceil(s.len * D.perMetre * s.pressure);
        for (let j = 0; j < m && n < D.capacity; j++) {
          const ts = s.t0 + ((j + hash01(s.seed, j, 1)) / m) * (s.t1 - s.t0);
          const age = t - ts;
          if (age < 0 || age > D.life) continue;
          const p = pointAtArc(s, strokeProgress(s, ts) * s.len);
          const h2 = hash01(s.seed, j, 2), h3 = hash01(s.seed, j, 3), h4 = hash01(s.seed, j, 4);
          pos[n * 3] = p[0] + (h2 - 0.5) * 2 * D.drift * age + 0.006 * Math.sin(age * 8 + h3 * 6);
          pos[n * 3 + 1] = p[1] - 0.5 * D.gravity * age * age - 0.02 * age;
          pos[n * 3 + 2] = 0.004 + (0.03 + 0.05 * h3) * age;
          const a = Math.pow(1 - age / D.life, 1.5) * D.level * (0.35 + 0.65 * h4);
          const c = dustCols[s.color] ?? col.set(colourOf(P, s.color));
          cl[n * 3] = c.r * a; cl[n * 3 + 1] = c.g * a; cl[n * 3 + 2] = c.b * a;
          n++;
        }
      }
      dp.geometry.setDrawRange(0, n);
      dp.geometry.attributes.position.needsUpdate = true;
      dp.geometry.attributes.color.needsUpdate = true;
    };
    g.userData.parts = { slate, eraser: er, floatingChalk: fc, dust: dp };
    return g;
  }

  const props = { board, wall, windowMullions, chalkStick, eraser, floatingChalk, dust,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }) };
  const factories = {
    chalkboard: (o) => board(o.dims ?? {}),
    wall: (o) => wall(o.dims ?? {}),
    windowMullions: () => windowMullions(),
  };
  return {
    spec: S, palette: P, materials, lights, post, textStyle, camera: S.camera, props, factories, sfx: S.sfx,
    plan: CHALK, motion: CHALK,
    helpers: { chalkPainter, ghostProgram, boardCoords: (x, y) => [x, y, 0], trayTop },
  };
}

function toSrgb(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
