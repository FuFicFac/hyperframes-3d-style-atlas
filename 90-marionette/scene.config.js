// scene.config.js — 90-marionette: "Who pulls the strings?" — a painted string puppet and its control bar (style "marionette").
// Plain data + the style's pure string-rig planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The CONTROL plan below is the only animation input: the bar's pose and the pull on
// each tagged string. Every joint, every taut or slack string and every sound in SCORE follows from it.
// World: the puppet stands at the origin facing +Z (the audience); the bar hangs at y = 3.5.
import { STYLE_SPEC as S } from "./_atlas/styles/marionette/spec.js";
import { createPlan, rigVoices, panOf } from "./_atlas/styles/marionette/strings.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "90-marionette";
export const STYLE = "marionette";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "hello", t: 0, dur: 3.25, label: "A wooden puppet says hello", lines: "A wooden puppet\nsays hello" },
  { id: "bow", t: 3.25, dur: 3.0, label: "It bows. It walks.", lines: "It bows.\nIt walks." },
  { id: "reveal", t: 6.25, dur: 3.15, label: "Who pulls the strings?", lines: "Who pulls\nthe strings?" },
  { id: "pull", t: 9.4, dur: 3.0, label: "Pull PROMPT: one arm waves", lines: "Pull PROMPT:\none arm waves" },
  { id: "all", t: 12.4, dur: 2.6, label: "Know who holds the strings", lines: "Know who holds\nthe strings" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.lines, on: b.t + (i ? 0.05 : 0.12), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.22 : Infinity }));

// ---------------------------------------------------------------- the control plan (offsets from the rest pose)
const T = { land: 0.85, wave: 1.35, bow: B.bow.t + 0.1, walk: B.bow.t + 1.6, rise: B.reveal.t + 0.05, arrive: B.reveal.t + 1.6, pull: B.pull.t + 1.1, dance: B.all.t + 0.1, tada: 14.15 };
export const CONTROL = {
  keys: {
    // lowered onto the stage, a little knee-bend on landing; the bow lowers the bar while the back string is drawn in
    y: [
      { t: 0, v: 0.5 }, { t: T.land, v: 0, ease: "inQuad" }, { t: T.land + 0.14, v: -0.07, ease: "outQuad" }, { t: T.land + 0.42, v: 0 },
      { t: T.bow, v: 0 }, { t: T.bow + 0.6, v: -0.5 }, { t: T.bow + 0.95, v: -0.5 }, { t: T.bow + 1.4, v: 0 },
    ],
    "pull:data": [{ t: T.bow, v: 0 }, { t: T.bow + 0.6, v: 0.482 }, { t: T.bow + 0.95, v: 0.482 }, { t: T.bow + 1.4, v: 0 }],
    x: [{ t: 0, v: -0.3 }, { t: T.land + 0.1, v: 0, ease: "outCubic" }],
    pitch: [{ t: T.bow, v: 0 }, { t: T.bow + 0.6, v: 0.1 }, { t: T.bow + 0.95, v: 0.1 }, { t: T.bow + 1.4, v: 0 }],
    // one tag is pulled: the PROMPT string is drawn in and only that arm answers
    "pull:prompt": [
      { t: T.wave, v: 0 }, { t: T.wave + 0.45, v: 0.62, ease: "outCubic" }, { t: T.wave + 1.4, v: 0.62 }, { t: T.wave + 1.75, v: 0 },   // the first wave: same string, its tag still out of sight
      { t: T.pull, v: 0 }, { t: T.pull + 0.45, v: 0.62, ease: "outCubic" }, { t: T.pull + 1.4, v: 0.62 }, { t: T.pull + 1.75, v: 0 },
      { t: T.tada, v: 0 }, { t: T.tada + 0.4, v: 0.62, ease: "outBack" },
    ],
    "pull:rules": [{ t: T.tada, v: 0 }, { t: T.tada + 0.4, v: 0.62, ease: "outBack" }],
  },
  waves: [
    { ch: "pull:prompt", from: T.wave + 0.5, to: T.wave + 1.45, amp: 0.1, hz: 2.5, fade: 0.2 },
    // walk: rock the leg bar, the bar yaws and bobs with each step
    { ch: "rock", from: T.walk, to: T.walk + 2.2, amp: 0.6, hz: 1.15, fade: 0.35 },
    { ch: "yaw", from: T.walk, to: T.walk + 2.2, amp: 0.1, hz: 1.15, phase: Math.PI / 2, fade: 0.35 },
    { ch: "y", from: T.walk, to: T.walk + 2.2, amp: 0.022, hz: 2.3, fade: 0.35 },
    { ch: "pull:prompt", from: T.pull + 0.5, to: T.pull + 1.45, amp: 0.1, hz: 2.5, fade: 0.2 },
    // finale: everything at once
    { ch: "roll", from: T.dance, to: T.tada + 0.05, amp: 0.2, hz: 0.95, fade: 0.35 },
    { ch: "rock", from: T.dance, to: T.tada + 0.1, amp: 0.6, hz: 1.9, fade: 0.3 },
    { ch: "y", from: T.dance, to: T.tada, amp: 0.02, hz: 1.9, fade: 0.3 },
  ],
  // the name tags drop down their strands as the camera reaches the bar
  tagDrops: { rules: T.arrive - 0.45, feedback: T.arrive - 0.2, training: T.arrive + 0.05, data: T.arrive + 0.3, prompt: T.arrive + 0.55 },
};
export const PLAN = createPlan({ puppet: S.puppet, rig: S.rig, strings: S.strings, tags: S.tags, control: CONTROL, end: DURATION });

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.95, x1: 0.95, y0: -0.93, y1: 0.94 };            // the caption plate sits in the bottom-left corner
const WINBAR = { x0: -0.95, x1: 0.95, y0: -0.5, y1: 0.92 };
const BOX = {
  puppet: [[-1.2, 0, -0.25], [1.2, 2.52, 0.45]],
  puppetHi: [[-1.2, 0.3, -0.25], [1.2, 2.98, 0.45]],
  bar: [[-2.82, 2.42, -0.85], [2.82, 3.84, 1.0]],
  full: [[-2.82, 0, -0.85], [2.82, 3.86, 1.0]],
};
const shot = (box, az, el, o = {}) => {
  const k = fitShot({ box }, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const HI = shot(BOX.puppetHi, 0.5, 0.07), PUPPET = shot(BOX.puppet, 0.5, 0.07);
const BAR = shot(BOX.bar, 0.12, -0.08, { window: WINBAR }), FULL = shot(BOX.full, 0.1, 0.06);
export const CAMERA = [
  { t: 0, ...HI },
  { t: T.land + 0.25, ...PUPPET, ease: "inOutSine" },
  { t: T.rise, ...PUPPET },
  { t: T.arrive, ...BAR, ease: "inOutSine" },                      // the crane up the strings
  { t: B.pull.t, ...BAR },
  { t: B.pull.t + 1.0, ...FULL, ease: "inOutSine" },
  { t: DURATION, ...FULL },
];

// ---------------------------------------------------------------- framing gate
const LOOSE = { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.97 };
export const FRAMING = framingReport([
  { id: "puppet", box: BOX.puppet, from: T.land + 0.25, to: T.rise, required: true },
  { id: "bar", box: BOX.bar, from: T.arrive, to: B.pull.t, required: true },
  { id: "rig", box: BOX.full, from: B.pull.t + 1.0, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: LOOSE });
if (!FRAMING.ok && !globalThis.process?.env?.MR_NOGATE) {
  throw new Error(`90-marionette framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + the camera cues
const SND = S.sound;
export const EVENTS = [
  { t: 0, kind: "bed", dur: DURATION },
  ...PLAN.events(),
  { t: T.rise, kind: "rise", dur: T.arrive - T.rise },
  { t: T.arrive + 0.05, kind: "reveal" },
  { t: B.pull.t, kind: "back", dur: 1.0 },
  { t: T.tada + 0.3, kind: "tada" },
].sort((a, b) => a.t - b.t);
export const SCORE = scoreFromEvents(EVENTS, {
  ...rigVoices(SND),
  bed: (e) => [{ type: "pad", dur: e.dur, root: SND.pad.root, chord: SND.pad.chord, attack: 0.5, release: 1.2, brightness: SND.pad.brightness, gain: SND.pad.gain, pan: 0 }],
  rise: (e) => [{ type: "riser", dur: e.dur, gain: 0.2 }, { type: "whoosh", dur: e.dur, dir: "in", gain: 0.16 }],
  reveal: () => [{ type: "chime", dur: 1.6, notes: 5, gain: 0.3 }],
  back: (e) => [{ type: "whoosh", dur: e.dur, dir: "out", gain: 0.16 }],
  tada: () => [{ type: "chime", dur: 1.4, sparkle: true, notes: 6, gain: 0.3 }, { type: "marimba", hz: 392, notes: [0, 4, 7, 12], step: 0.07, dur: 1.0, decay: 0.25, gain: 0.22 }],
}, { seedBase: 190, pan: panOf });
export const DUCK = [];
export const NOTES = {
  mechanism: "strings.js: bar pose + per-string pull are the only inputs; fixed string lengths; torso = pendulum under the head eyelet, wrists under their eyelets (two-bone IK), knees on sphere-sphere intersections, shins hang, feet stop on the floor; planned damped sway; slack strings sag by their spare length.",
  events: `${EVENTS.length} sound events from the control plan (steps, taut strings, creaks, tag drops, pulls)`,
  framing: FRAMING.ok ? "ok" : "FAILS",
  numbers: "no data shown; the tag names (TRAINING, DATA, PROMPT, RULES, FEEDBACK) are a metaphor, not a model diagram",
};
