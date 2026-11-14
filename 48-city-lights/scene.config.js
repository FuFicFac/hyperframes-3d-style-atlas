// scene.config.js — 48-city-lights: "Every window, a pixel". An invented harbour skyline at blue hour: windows come on
// in waves, five towers become a bar chart (SAMPLE DATA), one tower fills floor by floor (SAMPLE DATA), a wide block
// spells ALWAYS ON while a heartbeat runs across the skyline, then a tower counts down floor by floor and relights.
// Plain data + the style's pure planner (cityplan.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex. The city faces +Z across the water.
import { planCity, cityVoices, cityBed, lotBox, fitShot } from "./_atlas/styles/city-lights/cityplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { STYLE_SPEC } from "./_atlas/styles/city-lights/spec.js";

export const ID = "48-city-lights";
export const STYLE = "city-lights";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats: one caption line each (<= 26 chars)
export const BEATS = [
  { id: "dusk", t: 0, dur: 3.2, label: "Dusk settles on the bay" },
  { id: "bars", t: 3.2, dur: 3.4, label: "Five districts, compared" },
  { id: "fill", t: 6.6, dur: 2.8, label: "One tower, floor by floor" },
  { id: "word", t: 9.4, dur: 2.9, label: "The city never sleeps" },
  { id: "count", t: 12.3, dur: 2.7, label: "Countdown to midnight" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, k = 0) => B[id].t + k;

// ---- hand-placed feature buildings (front row z = -40 unless row 1); the planner fills the rest of every row
const BAR_X0 = 26.8, BAR_STEP = 11.2;
export const BAR_VALUES = [38, 61, 47, 82, 70];          // SAMPLE DATA (out of 100), labelled on screen
export const FEATURES = [
  { id: "slab", row: 0, x: -47.5, cols: 116, cellW: 0.7, floors: 20, type: "slab", depth: 18 },
  { id: "fill", row: 0, x: 7, cols: 14, cellW: 1.15, floors: 40, type: "office", depth: 16 },
  ...BAR_VALUES.map((v, i) => ({ id: `bar${i}`, row: 0, x: BAR_X0 + i * BAR_STEP, cols: 8, cellW: 1.2, floors: 32, type: "glass", depth: 14 })),
  { id: "count", row: 1, x: -24, cols: 16, cellW: 1.2, floors: 56, type: "glass", depth: 18, beacon: true, antenna: true },
];
const COUNT_STEPS = [0, 1, 2].map((i) => at("count", 0.5 + i * 0.5));
export const PROGRAMS = {
  ...Object.fromEntries(BAR_VALUES.map((v, i) => [`bar${i}`, [{ mode: "bar", tIn: at("bars", 0.15 + i * 0.12), value: v, max: 100 }]])),
  fill: [{ mode: "fill", tIn: at("fill", 0.05), t0: at("fill", 0.6), t1: at("fill", 2.4), to: 0.75 }],
  slab: [{ mode: "bitmap", tIn: at("word", 0.05), text: "ALWAYS ON", scale: 2, wipe: 0.9 }],
  count: [{ mode: "countdown", tIn: at("count", 0.0), steps: COUNT_STEPS, stepFloor: 0.024, relight: at("count", 2.05), final: "0" }],
};
export const PULSES = [{ t: at("word", 1.0), x0: -200 }, { t: at("count", 2.1), x0: -200 }];
const BR = STYLE_SPEC.bridge, Q = STYLE_SPEC.quay;
export const LANES = [
  { id: "bridgeHead", kind: "head", x: BR.x, dir: -1, speed: 21, count: 150, seed: 31, y: BR.deckY + 0.55, z: BR.z + BR.lane[1],
    density: [[0, 0.35], [at("bars"), 0.7], [at("word"), 0.95], [at("count"), 0.6], [DURATION, 0.85]] },
  { id: "bridgeTail", kind: "tail", x: BR.x, dir: 1, speed: 19, count: 150, seed: 37, y: BR.deckY + 0.55, z: BR.z + BR.lane[0],
    density: [[0, 0.3], [at("bars"), 0.65], [at("word"), 0.9], [at("count"), 0.55], [DURATION, 0.8]] },
  { id: "quayHead", kind: "head", x: [-440, 440], dir: 1, speed: 13, count: 110, seed: 41, y: 1.75, z: Q.z - Q.depth / 2 - 0.6,
    density: [[0, 0.3], [at("word"), 0.8], [DURATION, 0.6]] },
  { id: "quayTail", kind: "tail", x: [-440, 440], dir: -1, speed: 12, count: 110, seed: 43, y: 1.75, z: Q.z - Q.depth / 2 - 1.4,
    density: [[0, 0.3], [at("word"), 0.75], [DURATION, 0.6]] },
];
export const BANNERS = { blimp: { text: "GOOD EVENING · CITY OF LIGHTS ·", scroll: 9 } };
export const BLIMP = { from: [-150, 112, -95], to: [-40, 116, -95], t0: 0, t1: DURATION };

// ---- the plan: every window, sign, car and sound cue comes from it
export const PLAN = planCity(STYLE_SPEC, { features: FEATURES, programs: PROGRAMS, pulses: PULSES, lanes: LANES, banners: BANNERS, duration: DURATION, seed: 7 });
export const SIGNS = [
  ...BAR_VALUES.map((v, i) => ({ lot: `bar${i}`, cols: 13 })),
  { lot: "fill", cols: 19 },
  { lot: "count", cols: 9, pitch: 1.3, legs: 3 },
];

// ---- framing boxes (feature buildings + 12 m of roof sign) and the camera fitted to them (cityplan.fitShot)
const box = (id) => lotBox(PLAN.byId[id], STYLE_SPEC);
const join = (...bs) => [[Math.min(...bs.map((b) => b[0][0])), Math.min(...bs.map((b) => b[0][1])), Math.min(...bs.map((b) => b[0][2]))], [Math.max(...bs.map((b) => b[1][0])), Math.max(...bs.map((b) => b[1][1])) + 12, Math.max(...bs.map((b) => b[1][2]))]];
const BOX = {
  bars: join(...BAR_VALUES.map((v, i) => box(`bar${i}`))),
  fill: join(box("fill")),
  slab: box("slab"),
  all: join(box("slab"), box("fill"), box("count"), ...BAR_VALUES.map((v, i) => box(`bar${i}`))),
};
const shot = (b, o, t, ease, dz = 0) => { const s = fitShot(b, o); return { t, pos: [s.pos[0], s.pos[1], s.pos[2] + dz], target: s.target, fov: s.fov, ease }; };
const WIDE = { fov: 30, y: [-0.42, 0.8], x: 0.86, elev: 0.075 };
export const CAMERA = [
  shot(BOX.all, { ...WIDE, pad: 1.18 }, 0),
  shot(BOX.all, { ...WIDE, pad: 1.1 }, at("dusk", 2.9), "inOutSine"),
  shot(BOX.bars, { fov: 30, y: [-0.5, 0.78], x: 0.8, elev: 0.06, az: 0.08 }, at("bars", 0.9), "inOutCubic"),
  shot(BOX.bars, { fov: 30, y: [-0.5, 0.78], x: 0.8, elev: 0.06, az: 0.08 }, at("bars", 3.2), "inOutSine", 0),
  shot(BOX.fill, { fov: 30, y: [-0.55, 0.8], x: 0.8, elev: 0.07, az: -0.06 }, at("fill", 0.8), "inOutCubic"),
  shot(BOX.fill, { fov: 30, y: [-0.55, 0.8], x: 0.8, elev: 0.07, az: -0.06 }, at("fill", 2.7), "inOutSine", 0),
  shot(BOX.slab, { fov: 30, y: [-0.3, 0.5], x: 0.6, elev: 0.08 }, at("word", 0.8), "inOutCubic"),
  shot(BOX.slab, { fov: 30, y: [-0.3, 0.5], x: 0.6, elev: 0.08 }, at("word", 2.8), "inOutSine", 0),
  shot(BOX.all, { ...WIDE, pad: 1.06 }, at("count", 1.2), "inOutCubic"),
  shot(BOX.all, { ...WIDE, pad: 1.06 }, DURATION, "inOutSine"),
];
export const REGIONS = [
  { id: "bars", box: BOX.bars, from: at("bars", 1.0), to: at("bars", 3.3), required: true },
  { id: "fill", box: BOX.fill, from: at("fill", 0.9), to: at("fill", 2.7), required: true },
  { id: "slab", box: BOX.slab, from: at("word", 0.9), to: at("word", 2.8), required: true },
  { id: "all", box: BOX.all, from: at("count", 1.3), to: DURATION, required: true },
];

export const OBJECTS = [];  // everything is built from style props in scene.js (skyline, bridge, quay, water, sky)

// ---- SCORE: city hush + warm pad bed, a warm synth swell into the close, a distant horn, and every cue from the plan
export const SCORE = [
  ...cityBed(DURATION, STYLE_SPEC.sound, { swellAt: at("count", 0.15), hornAt: at("dusk", 1.7) }),
  ...scoreFromEvents(PLAN.events, cityVoices(STYLE_SPEC.sound), { pan: (e) => (e.kind === "wave" ? ((e.t * 7.3) % 1) * 0.8 - 0.4 : 0) }),
];
export const DUCK = []; // duckFromBeats(beatsFromSrt(vo_srt)) once a voiceover exists
export const NOTES = {
  sample: "Bar values (38, 61, 47, 82, 70 of 100) and the 75 % fill are SAMPLE DATA, tagged on screen.",
  windows: PLAN.table.count,
  buildings: PLAN.lots.length,
  events: PLAN.events.length,
};
