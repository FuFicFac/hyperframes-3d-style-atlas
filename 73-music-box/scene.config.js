// scene.config.js — 73-music-box: "The pins are the program" — the open movement of a music box (style "music-box").
// Plain data + the style's pure tune planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every note in SCORE comes from the same note list that places the pins and moves the teeth.
// World: cylinder axis = X at y = 0.78; the comb lies in front (+Z); low teeth on the left, high on the right.
import { STYLE_SPEC as S } from "./_atlas/styles/music-box/spec.js";
import { createPlan, tuneVoices, panOf, TUNE, SCALE } from "./_atlas/styles/music-box/tune.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "73-music-box";
export const STYLE = "music-box";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (the tune's sections line up with them)
export const BEATS = [
  { id: "drum", t: 0, dur: 3.0, label: "A drum studded with pins" },
  { id: "pluck", t: 3.0, dur: 3.0, label: "Each pin plucks one tooth" },
  { id: "across", t: 6.0, dur: 3.2, label: "Across: which note" },
  { id: "around", t: 9.2, dur: 3.0, label: "Around: when it plays" },
  { id: "program", t: 12.2, dur: 2.8, label: "The pins are the program" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the one plan: tune -> pins, teeth, notes
export const PLAN = createPlan({ movement: S.movement, tune: TUNE, scale: SCALE, end: DURATION });

// ---------------------------------------------------------------- camera: one short move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.95, x1: 0.95, y0: -0.95, y1: 0.66 };           // the caption plate owns the top band
const WHOLE = { box: [[-1.6, 0.3, -0.55], [2.12, 1.3, 1.75]] };       // cylinder, comb, crank (the bedplate may bleed a little)
const shot = (box, az, el, o = {}) => {
  const k = fitShot({ box }, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const WIDE = shot(WHOLE.box, -0.3, 0.5);
const MACRO = shot([[-0.1, 0.55, -0.35], [1.25, 1.3, 1.1]], 0.42, 0.5);       // where pins meet the melody teeth
const FRONT = shot([[-1.36, 0.6, -0.5], [1.36, 1.3, 1.6]], 0, 0.98);          // straight on, high: the diagonal run
const SIDE = shot([[-1.0, 0.45, -0.5], [1.32, 1.3, 1.25]], 0.8, 0.42);        // along the drum: rows of pins arriving
const FINAL = shot(WHOLE.box, 0.3, 0.48);           // from the right of centre: the rim light flares the steel from the left
export const CAMERA = [
  { t: 0, ...WIDE },
  { t: B.pluck.t - 0.5, ...WIDE },
  { t: B.pluck.t + 0.8, ...MACRO, ease: "inOutSine", path: "arc" },
  { t: B.across.t - 0.6, ...MACRO },
  { t: B.across.t + 0.6, ...FRONT, ease: "inOutSine", path: "arc" },
  { t: B.around.t - 0.3, ...FRONT },
  { t: B.around.t + 0.9, ...SIDE, ease: "inOutSine", path: "arc" },
  { t: B.program.t - 0.2, ...SIDE },
  { t: B.program.t + 1.2, ...FINAL, ease: "inOutSine", path: "arc" },
  { t: DURATION, ...FINAL },
];

// ---------------------------------------------------------------- framing gate: the whole movement in frame in both wides
export const FRAMING = framingReport([
  { id: "movement", box: WHOLE.box, from: 0, to: B.pluck.t - 0.5, required: true },
  { id: "movement-end", box: WHOLE.box, from: B.program.t + 1.2, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.7 } });
if (!FRAMING.ok && !globalThis.process?.env?.MB_NOGATE) {
  throw new Error(`73-music-box framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events (one note per pin)
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, tuneVoices(S.sound), { seedBase: 173, pan: panOf(S.movement) });
export const DUCK = [];
export const NOTES = {
  mechanism: "tune.js: pin angle psi = PI/2 + aRel - omega * T (T = note time), pin x = tooth x; tooth tip = min(-A exp(-s/tau) cos(2 pi f s), pin stop); cylinder angle = omega t. SCORE = one marimba + pluck per pin at T.",
  tune: `${TUNE.name} (original, C-major pentatonic), ${PLAN.notes.length} pins on ${PLAN.teeth.length} teeth, one cylinder turn = ${S.movement.cylinder.period} s`,
  contact: `a pin holds its tooth ${PLAN.contact.toFixed(2)} s, tip travel ${(PLAN.amp * 1000).toFixed(0)} mm (toy scale), closest re-pluck ${PLAN.minGap.toFixed(2)} s`,
  framing: FRAMING.ok ? "ok" : "FAILS",
  numbers: "no data shown; the visible vibration frequency (6.5-10.5 Hz) is a stand-in for the audible pitch, which would alias at 30 fps",
};
