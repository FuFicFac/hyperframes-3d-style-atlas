// scene.js — 08-voxel: "How AI makes an image" (diffusion = step-by-step denoising) in the Voxel Studio style.
// Every frame is a pure function of t: all per-cube state comes from closed-form helpers and precomputed tables.
import { createStage, Timeline, THREE, clamp, hash01 } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec, animateObjects } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/voxel/style.js";
import {
  DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, LEGEND, RELIEF, PICTURE, LAYOUT, STEPS, DIFFUSION, RELIEF_PUSH,
  LABELS, CAPTION, TEXT_FLIGHT, CARD,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props, helpers: H, palette: P } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const G = style.spec.voxel.size;
const add = (m, p) => { m.position.set(p[0], p[1], p[2]); stage.scene.add(m); return m; };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// ---------------------------------------------------------------- plinths (stack up layer by layer)
const plinthVox = (w, h, d) => H.boxVoxels(w, h, d, (x, y) => (y === h - 1 ? P.wood : P.woodDark));
const L = LAYOUT;
const plinth = add(props.model(plinthVox(L.plinth.w, L.plinth.h, L.plinth.d)), L.plinth.origin);
const cardPlinth = add(props.model(plinthVox(L.cardPlinth.w, L.cardPlinth.h, L.cardPlinth.d)), L.cardPlinth.origin);

// ---------------------------------------------------------------- canvas: picture pixels (extruded columns) + frame ring
const CW = L.canvas.w, CH = L.canvas.h;
const pix = []; // per pixel: { px, py, key, depth, base (instance index of the j=0 cube) }
const canvasVox = [];
PICTURE.forEach((row, r) => [...row].forEach((key, px) => {
  const py = CH - 1 - r;
  const depth = RELIEF[key] ?? 1;
  const p = { px, py, key, depth, base: canvasVox.length, i: pix.length };
  pix.push(p);
  for (let j = 0; j < depth; j++) canvasVox.push({ x: px, y: py, z: 0, c: P[LEGEND[key]], pix: p.i, j });
}));
const frameStart = canvasVox.length;
for (let y = -1; y <= CH; y++) for (let x = -1; x <= CW; x++) {
  if (x !== -1 && x !== CW && y !== -1 && y !== CH) continue;
  for (let z = 0; z < 2; z++) canvasVox.push({ x, y, z, c: (x + y) % 2 ? P.wood : P.woodDark, frame: true });
}
const canvas = add(props.model(canvasVox), L.canvas.origin);
const board = props.gapBoard(CW + 1, CH + 1, 0.6);
board.position.set(L.canvas.origin[0] + 15.5 * G, L.canvas.origin[1] + 11.5 * G, L.canvas.origin[2] - 0.8 * G);
stage.scene.add(board);

// colour tables (linear RGB): target, block-averaged targets, seeded noise
const NP = pix.length;
const target = new Float32Array(NP * 3);
pix.forEach((p, i) => target.set(lin(P[LEGEND[p.key]]), i * 3));
const blockAvg = {};
for (const [, bs] of DIFFUSION.blocks) {
  const out = new Float32Array(NP * 3);
  for (const p of pix) {
    const bx = Math.floor(p.px / bs), by = Math.floor(p.py / bs);
    let r = 0, g = 0, b = 0, n = 0;
    for (const q of pix) if (Math.floor(q.px / bs) === bx && Math.floor(q.py / bs) === by) { r += target[q.i * 3]; g += target[q.i * 3 + 1]; b += target[q.i * 3 + 2]; n++; }
    out.set([r / n, g / n, b / n], p.i * 3);
  }
  blockAvg[bs] = out;
}
const hsl = new THREE.Color();
const noiseCol = (i, k) => {
  const S = DIFFUSION.noiseHSL, s = DIFFUSION.noiseSeed;
  hsl.setHSL(hash01(i, k, s), S.s[0] + (S.s[1] - S.s[0]) * hash01(i, k, s + 1), S.l[0] + (S.l[1] - S.l[0]) * hash01(i, k, s + 2));
  return [hsl.r, hsl.g, hsl.b];
};
const stepColour = new Float32Array((DIFFUSION.total + 1) * NP * 3); // [k][pixel][rgb]
for (let k = 0; k <= DIFFUSION.total; k++) {
  const a = 1 - (1 - k / DIFFUSION.total) ** DIFFUSION.signalPow;
  const bs = (DIFFUSION.blocks.find(([last]) => k <= last) ?? [0, 1])[1];
  const st = blockAvg[bs];
  for (let i = 0; i < NP; i++) {
    const n0 = noiseCol(i, 0), nk = noiseCol(i, k + 1);
    const f = k === 0 ? 0 : DIFFUSION.freshNoise;
    for (let c = 0; c < 3; c++) {
      const nz = n0[c] + (nk[c] - n0[c]) * f;
      stepColour[(k * NP + i) * 3 + c] = nz + (st[i * 3 + c] - nz) * a;
    }
  }
}
// per-pixel wave order and relief delay
const wave = pix.map((p) => H.waveKey(p.px, p.py, CW, CH, [1, -1]));
const reliefDelay = pix.map((p) => {
  const d = Math.hypot(p.px - RELIEF_PUSH.centre[0], p.py - RELIEF_PUSH.centre[1]) / 22;
  return RELIEF_PUSH.spread * (0.8 * clamp(d) + 0.2 * hash01(p.i, 77));
});
const D = DIFFUSION;
const stepParams = STEPS.map((t0, s) => {
  const slow = s < 3;
  return { t0, w: slow ? D.wave.slow : D.wave.fast, f: slow ? D.flip.slow : D.flip.fast, slow };
});
/** displayed step for pixel i at t, plus the in-progress flip */
function pixelState(i, t) {
  let k = 0, ry = 0, s = 1;
  for (let n = 0; n < stepParams.length; n++) {
    const sp = stepParams[n];
    const start = sp.t0 + wave[i] * sp.w;
    if (t < start) break;
    const u = (t - start) / sp.f;
    if (u >= 0.5) k = n + 1;
    if (u < 1) {
      if (sp.slow) { const f = H.flip(t, start, sp.f); ry = f.ry; s = f.s; }
      else s = 1 - D.flip.dip * Math.sin(Math.PI * u);
    }
  }
  return { k, ry, s };
}
const stepAt = (t) => STEPS.filter((s) => t >= s).length;

const CANVAS_IN = { start: tl.at("build", 0.45), dur: 0.42, spread: 0.75, seed: 3, order: "random", radius: 16, bias: [0, 3, 18] };
const FRAME_IN = { start: tl.at("build", 0.2), dur: 0.36, spread: 0.35, seed: 4, order: "y", jitter: 0.4, radius: 5, bias: [0, 6, 3] };

function updateCanvas(t) {
  const ud = canvas.userData;
  for (let i = frameStart; i < ud.n; i++) {
    const f = H.flight(canvas, i, t, FRAME_IN);
    ud.setPose(i, f.x, f.y, f.z, f.s, f.rx, f.ry, f.rz);
  }
  for (const p of pix) {
    const f = H.flight(canvas, p.base, t, CANVAS_IN);
    const st = pixelState(p.i, t);
    const push = p.depth > 1 ? H.cubeSteps(t, RELIEF_PUSH.at + reliefDelay[p.i], p.depth - 1, RELIEF_PUSH.stepDur) : 0;
    const o = (st.k * NP + p.i) * 3;
    for (let j = 0; j < p.depth; j++) {
      const i = p.base + j;
      ud.setPose(i, f.x, f.y, f.z + Math.min(j, push), f.s * st.s, f.rx, f.ry + st.ry, f.rz);
      ud.setColor(i, stepColour[o], stepColour[o + 1], stepColour[o + 2]);
    }
  }
  ud.commit();
}

// ---------------------------------------------------------------- prompt card (big-cube slab, small embossed text, cube progress bar)
const LC = L.card, LT = L.cardText, CC = LT.cube;
const cardVox = [];
for (let y = 0; y < LC.h; y++) for (let x = 0; x < LC.w; x++) {
  const edge = x === 0 || y === 0 || x === LC.w - 1 || y === LC.h - 1;
  const rule = y === LC.rule && x >= 2 && x <= LC.w - 3;
  const bar = y === LC.bar && x >= 1 && x <= 20 ? x - 1 : null;
  cardVox.push({ x, y, z: 0, c: edge || rule ? P.cardEdge : P.card, bar });
}
const card = add(props.model(cardVox), LC.origin);
const cardBoard = props.gapBoard(LC.w, LC.h, 0.6);
cardBoard.position.set(LC.origin[0] + ((LC.w - 1) / 2) * G, LC.origin[1] + ((LC.h - 1) / 2) * G, LC.origin[2] - 0.8 * G);
stage.scene.add(cardBoard);
const promptVox = [];
let gch = 0;
CARD.lines.forEach((line, li) => {
  const base = (CARD.lines.length - 1 - li) * LT.lineStep;
  for (const v of H.textVoxels(line, { depth: 1, color: P.ink })) promptVox.push({ ...v, y: v.y + base, g: gch + v.col });
  gch += line.length + 1;
});
const cursorX = CARD.lines[2].length * 6;
for (let y = 0; y < 7; y++) for (let x = 0; x < 2; x++) promptVox.push({ x: cursorX + x, y, z: 0, c: P.accent, cursor: true, g: gch });
const prompt = add(props.model(promptVox, { size: CC }), LT.origin);
const gMax = gch;
const CARD_BODY_IN = { start: tl.at("build", 0.3), dur: 0.34, spread: 0.45, seed: 5, order: "y", jitter: 0.3, radius: 5, bias: [0, 8, 4] };
const CARD_TEXT_IN = { start: CARD.typeAt, dur: 0.22, spread: CARD.typeSpread, seed: 6, order: (x, y, z, i) => promptVox[i].g / gMax, jitter: 0.08, radius: 5, bias: [0, 0, 10] };
const accent = lin(P.accent), barOff = lin(P.cardEdge);

function updateCard(t) {
  const ud = card.userData;
  for (let i = 0; i < ud.n; i++) {
    const v = cardVox[i];
    const f = H.flight(card, i, t, CARD_BODY_IN);
    let z = f.z;
    if (v.bar != null) {
      // step k lights bar cube k-1 and pushes it out one whole cube
      const tOn = STEPS[v.bar];
      const c = t >= tOn ? accent : barOff;
      ud.setColor(i, c[0], c[1], c[2]);
      z += H.cubeSteps(t, tOn, 1, 0.1);
    }
    ud.setPose(i, f.x, f.y, z, f.s, f.rx, f.ry, f.rz);
  }
  ud.commit();
  const pd = prompt.userData;
  for (let i = 0; i < pd.n; i++) {
    const f = H.flight(prompt, i, t, CARD_TEXT_IN);
    let s = f.s;
    if (promptVox[i].cursor) s *= Math.floor((t - CARD.typeAt) / 0.45) % 2 === 0 || t > tl.at("resolve") ? 1 : 0; // blinking cursor, solid at the end
    pd.setPose(i, f.x, f.y, f.z, s, f.rx, f.ry, f.rz);
  }
  pd.commit();
}
const counter = add(props.text("STEP 00", { size: CC, depth: 1, align: "left", colorFn: (ch, ci) => (ci >= 5 ? P.accent : null), capacity: 260 }), L.counter.origin);
const COUNTER_IN = { start: CARD.typeAt + 0.55, dur: 0.25, spread: 0.3, seed: 8, order: "x", jitter: 0.2, radius: 5, bias: [0, 0, 10] };

// ---------------------------------------------------------------- step labels + caption (voxel text, top centre)
const TF = TEXT_FLIGHT;
const labels = LABELS.map((l, n) => {
  const m = add(props.text(l.text, { size: L.label.cube, depth: 2, colorFn: (ch, ci) => (ci === 0 ? P.accent : null) }), L.label.pos);
  m.castShadow = false; // floating labels: a ghost copy on the back wall read as a second label
  m.userData.flightOpts = {
    start: tl.at(l.beat, l.in), dur: TF.dur, spread: TF.spread, seed: 20 + n, order: "x", jitter: 0.3, radius: TF.radius, bias: TF.bias,
    out: { at: tl.at(l.beat, l.out), dur: TF.outDur, spread: TF.outSpread, order: "x", to: "scatter" },
  };
  return m;
});
const capVox = H.textVoxels(CAPTION.text, { depth: 2, align: "center", color: P.ink }).map((v) => {
  if (v.ci < 5) { const keys = ["B", "b", "Y", "O", "g", "G", "c", "d", "p"]; return { ...v, c: P[LEGEND[keys[Math.floor(hash01(v.x, v.y, 91) * keys.length)]]] }; }
  if (v.ch === "→") return { ...v, c: P.accent };
  return v;
});
const caption = add(props.model(capVox, { size: L.caption.cube }), L.caption.pos);
caption.castShadow = false;
const CAPTION_IN = { start: tl.at(CAPTION.beat, CAPTION.in), dur: 0.4, spread: 0.5, seed: 31, order: "x", jitter: 0.35, radius: TF.radius, bias: TF.bias };

// ---------------------------------------------------------------- per-frame
const PLINTH_IN = { start: tl.at("build"), dur: 0.3, spread: 0.32, seed: 2, order: "y", jitter: 0.35, radius: 3, bias: [0, 8, 0] };
function renderAt(t) {
  animateObjects(objs, tl, t);
  H.assemble(plinth, t, PLINTH_IN);
  H.assemble(cardPlinth, t, { ...PLINTH_IN, seed: 9, start: PLINTH_IN.start + 0.1 });
  updateCanvas(t);
  const step = stepAt(t);
  updateCard(t);
  counter.userData.setText(`STEP ${String(step).padStart(2, "0")}`);
  H.assemble(counter, t, COUNTER_IN);
  for (const m of labels) H.assemble(m, t, m.userData.flightOpts);
  H.assemble(caption, t, CAPTION_IN);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
