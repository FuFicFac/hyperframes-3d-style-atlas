// scene.config.js — 119-pointillism: "Only dots" (style "pointillism"). Plain data + the style's pure planner. No THREE,
// no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// One plan (dots.js) is the single source of truth: every dot's place, pure colour and appear time, the two brushes'
// dabs, the camera checks and every sound cue (a dab per brush touch, a patter whose density follows the dot schedule,
// a marimba note as each region completes) all read it.
import { STYLE_SPEC as S } from "./_atlas/styles/pointillism/spec.js";
import { createPlan } from "./_atlas/styles/pointillism/dots.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys, cameraBasis } from "./_atlas/kit/framing.js";
import { smoothstep } from "./_atlas/kit/time.js";

export const ID = "119-pointillism";
export const STYLE = "pointillism";
export const TITLE = "Only dots";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 119, labels word for word)
export const BEATS = [
  { id: "close", t: 0.0, dur: 2.8, label: "Up close: only dots" },
  { id: "flood", t: 2.8, dur: 3.2, label: "No colour is ever mixed" },
  { id: "back", t: 6.0, dur: 3.0, label: "Step back: a scene forms" },
  { id: "squint", t: 9.0, dur: 3.0, label: "Your eye does the mixing" },
  { id: "green", t: 12.0, dur: 3.0, label: "Green? Blue plus yellow" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b) => ({ text: b.label, on: b.t }));
// label change: a 0.26 s counter-wheel roll that completes 0.04 s before each beat start (always exactly one label)
export const LABEL_ROLL = { roll: 0.26, lead: 0.04 };

// ---------------------------------------------------------------- the one plan
// canvas units: X in [0, 1.75] left to right, Y in [0, 1] bottom to top (dots.js SCENE)
export const MACRO = [1.36, 0.305];                   // the first dabs: in the sun's glitter on the lake
export const DABS = { at: MACRO, times: [0.35, 0.65, 0.95, 1.25, 1.55, 1.85, 2.15, 2.45], hop: S.brush.hop, contact: 0.05 };
export const REGION_TIMES = {
  // water spreads out from the first dabs, just ahead of the rising camera, then races across the rest of the lake
  water: { t0: B.flood.t + 0.05, t1: 6.9, origin: MACRO, jitS: 0.3,
    front: [[0, B.flood.t + 0.05], [0.15, 3.5], [0.3, 4.4], [0.45, 5.2], [1.0, 5.75], [1.9, 6.25], [2.8, 6.6]] },
  sky: { t0: 3.7, t1: 5.6, origin: [1.42, 0.565] },                                 // rises from the horizon below the sun
  hills: { t0: 4.0, t1: 5.1, origin: [1.75, 0.6] },
  grass: { t0: 4.5, t1: 6.0, origin: [1.75, 0.0] },
  boat: { t0: B.back.t + 0.2, t1: 7.35, origin: [0.99, 0.3] },                    // the scene forms during the step back
  tree: { t0: B.back.t + 0.45, t1: 7.8, origin: [0.36, 0.2] },
  sun: { t0: 7.65, t1: 8.3, origin: [1.42, 0.84] },
};
export const PLAN = createPlan({ seed: 119, regions: REGION_TIMES, dabs: DABS });
// Node (sound) and Chrome (picture) each build the plan; it uses only + - * / sqrt, comparisons and integer hashes, and
// RUN_HASH (recorded in Node, confirmed in the page via window.__ptHash) guards that they agree.
export const RUN_HASH = "279004bc";
if (typeof globalThis.window !== "undefined") globalThis.window.__ptHash = PLAN.hash;
if (RUN_HASH !== "pending" && PLAN.hash !== RUN_HASH && !globalThis.process?.env?.PT_RECORD) {
  throw new Error(`119-pointillism: plan hash ${PLAN.hash} != recorded ${RUN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

// ---------------------------------------------------------------- the squint (display-space defocus, beat 4)
export const SQUINT = { t0: B.squint.t + 0.3, t1: B.squint.t + 1.1, t2: B.squint.t + 1.85, t3: B.squint.t + 2.65, sigma: S.defocus.sigmaMax };
export const squintAt = (t) => SQUINT.sigma * smoothstep(SQUINT.t0, SQUINT.t1, t) * (1 - smoothstep(SQUINT.t2, SQUINT.t3, t));

// ---------------------------------------------------------------- camera
const FOV = S.camera.fov, ASPECT = 16 / 9, TH = Math.tan((FOV * Math.PI) / 360);
const W = S.canvas.w, H = S.canvas.h;
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
/** a key looking at target (canvas plane, z = 0) from direction dir at distance d; shift moves the target in-plane */
const key = (t, target, d, dir = [0, 0, 1], ease = "inOutCubic") => {
  const n = norm(dir);
  return { t, pos: [target[0] + n[0] * d, target[1] + n[1] * d, n[2] * d], target: [target[0], target[1], 0], fov: FOV, ease };
};
const dabC = PLAN.dabs.reduce((a, d) => [a[0] + d.x / PLAN.dabs.length, a[1] + d.y / PLAN.dabs.length], [0, 0]);
export const DAB_CENTRE = dabC;
const MACRO_DIR = [0.1, -0.32, 1];
const FULL_D = (H / 0.962) / 2 / TH;                    // the canvas height just inside the frame
const TREE = [0.84 - W / 2, 0.6];                       // crown centre (X 0.42, Y 0.80) in metres
const CLOSE_W = 0.95;                                   // frame width (m) in the closing tree shot
export const CAMERA = [
  key(0, [dabC[0] + 0.004, dabC[1] - 0.025], 0.36, MACRO_DIR),
  key(B.flood.t - 0.1, [dabC[0] + 0.012, dabC[1] - 0.022], 0.335, MACRO_DIR, "inOutSine"),
  key(B.back.t, [1.1, -0.28], 0.86, [0.04, -0.12, 1], "inOutCubic"),          // track right and rise along the glitter
  key(B.back.t + 2.7, [0, -0.004], FULL_D, [0, 0, 1], "inOutCubic"),          // the step back
  key(B.green.t, [0, -0.004], FULL_D, [0, 0, 1], "linear"),                   // locked through the squint
  key(B.green.t + 1.9, TREE, CLOSE_W / (2 * TH * ASPECT), [0, 0, 1], "inOutCubic"),
  key(DURATION, [TREE[0] + 0.01, TREE[1]], CLOSE_W / (2 * TH * ASPECT) * 0.96, [0, 0, 1], "linear"),
];

// ---------------------------------------------------------------- framing gate (replays the rig exactly)
// Before the canvas edge is due in the step back the whole frame must be canvas (no wall); in the full view the canvas
// edge must sit just inside the frame on every side; in the closing shot the whole frame (above the caption) must be
// tree crown.
const footprint = (cam, nx, ny) => {
  const Bs = cameraBasis(cam);
  const d = [0, 1, 2].map((i) => -Bs.back[i] + Bs.right[i] * nx * TH * ASPECT + Bs.up[i] * ny * TH);
  const s = -cam.pos[2] / d[2];
  return [cam.pos[0] + s * d[0], cam.pos[1] + s * d[1]];
};
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]];
const fails = [];
let fullFill = 1;
for (let t = 0; t <= DURATION + 1e-9; t += 1 / 30) {
  const cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov: FOV });
  const pts = CORNERS.map(([a, b]) => footprint(cam, a, b));
  if (t < B.back.t + 1.5) {
    for (const [x, y] of pts) if (Math.abs(x) > W / 2 - 0.005 || Math.abs(y) > H / 2 - 0.005) { fails.push({ t: +t.toFixed(2), why: "wall", x, y }); break; }
  } else if (t >= B.back.t + 2.7 && t < B.green.t) {
    const [x0, y0] = pts[0], [x1, y1] = pts[2];
    const fillX = W / (x1 - x0), fillY = H / (y1 - y0);
    fullFill = Math.min(fullFill, Math.max(fillX, fillY));
    if (fillX > 0.995 || fillY > 0.995 || Math.max(fillX, fillY) < 0.93) fails.push({ t: +t.toFixed(2), why: "full", fillX, fillY });
  } else if (t >= B.green.t + 1.9) {
    const [Xc, Yc] = [(px) => (px + W / 2) / H, (py) => (py + H / 2) / H];
    for (const [a, b] of [[-1, -0.6], [1, -0.6], [1, 1], [-1, 1], [0, 0]]) {
      const [x, y] = footprint(cam, a, b);
      if (!PLAN.inCrown(Xc(x), Yc(y))) { fails.push({ t: +t.toFixed(2), why: "crown", x, y }); break; }
    }
  }
}
export const FRAMING = { ok: fails.length === 0, fails: fails.slice(0, 6), fullFill: +fullFill.toFixed(3) };
if (!FRAMING.ok && !globalThis.process?.env?.PT_NOGATE) throw new Error(`119-pointillism framing: ${JSON.stringify(FRAMING.fails)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from the PLAN
const SND = S.sound;
export const EVENTS = PLAN.events();
const voices = {
  dab: (e) => [
    { type: "pop", dur: 0.1, pitch: e.b === 0 ? 0.46 : 0.4, gain: SND.dab.gain },
    { type: "tick", dur: 0.02, pitch: 0.55, gain: SND.dab.gain * 0.25, offset: 0.006 },
  ],
  patter: (e, ctx) => [{
    type: ctx.index % 3 === 0 ? "pop" : "tick", dur: ctx.index % 3 === 0 ? 0.06 : 0.025,
    pitch: (ctx.index % 3 === 0 ? 0.55 : 0.6) + 0.5 * ((ctx.index * 0.618) % 1),
    gain: SND.patter.gain * Math.min(1.2, Math.sqrt(e.n / 10)),
  }],
  region: (e) => [{ type: "marimba", hz: SND.region.notes[e.step % SND.region.notes.length], decay: 0.45, dur: 1.2, gain: SND.region.gain }],
};
export const SCORE = [
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12, 16], dur: DURATION, attack: 1.2, release: 1.8, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, voices, { seedBase: 119, pan: (e) => (e.kind === "dab" ? (e.b === 0 ? 0.25 : -0.25) : 0) }),
  // the squint: a bright pad opens with the defocus and closes as it sharpens
  { t: SQUINT.t0 - 0.15, type: "pad", root: SND.open.root, chord: [0, 4, 7, 11, 14], dur: SQUINT.t3 - SQUINT.t0 + 0.5, attack: 0.75, release: 0.9, brightness: SND.open.brightness, gain: SND.open.gain, seed: 7 },
  // beat 5: a soft push-in whoosh, then blue + yellow as a two-note marimba
  { t: B.green.t + 0.05, type: "whoosh", dir: "in", dur: 1.6, gain: SND.push.gain, pitch: 0.7, seed: 9 },
  { t: B.green.t + 1.85, type: "marimba", hz: 523.25, notes: [0, 7], step: 0.14, decay: 0.6, dur: 1.4, gain: SND.region.gain * 0.8, seed: 11 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "dots.js: an original lake scene from gradients and shapes; 132 x 76 jittered, row-offset grid of dabs; each dab one pure palette colour from the best pair of allowed hues for the local scene colour (display sRGB), plus complementary dots in shadow; regions flood as ragged fronts; the first 8 dabs are placed by two brushes.",
  hash: PLAN.hash,
  stats: PLAN.stats(),
  framing: FRAMING.ok ? `ok (full-view fill ${FRAMING.fullFill})` : `FAILS ${JSON.stringify(FRAMING.fails)}`,
};
