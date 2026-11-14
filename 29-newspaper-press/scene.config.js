// scene.config.js — 29-newspaper-press: "How news gets made" (a neutral SAMPLE explainer) on a broadsheet front page.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// The edition is planned HERE with the style's pure planner (press.js), so every thud, roller hiss, pencil scratch and
// develop shimmer in SCORE comes from exactly the plan the picture reads. Page coords: metres, page centre = (0,0), y up.
// World: desk at y = 0, page B centred at the origin; page "up" = world -Z; the camera looks down from +Z.
import { STYLE_SPEC as S } from "./_atlas/styles/newspaper-press/spec.js";
import { layoutPage, planEdition, pressVoices, shotFor, circlePath, inkTimeAt, pageV } from "./_atlas/styles/newspaper-press/press.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "29-newspaper-press";
export const STYLE = "newspaper-press";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the copy (all placeholders are marked SAMPLE; no dates, no statistics, no real titles)
export const PAGES = {
  A: { headline: "HOW NEWS GETS MADE", deck: "A sample explainer in three plain steps", photo: { kind: "skyline", seed: 3 },
    key: { text: "WHO, WHAT, WHERE, WHEN", at: 0.05 }, photo2: { kind: "portrait", seed: 4 }, seed: 11 },
  B: { headline: "FIRST, GATHER THE FACTS", deck: "Reporters ask, listen and write it all down", photo: { kind: "notebook", seed: 2 },
    key: { text: "CHECK EVERY CLAIM", at: 0.045 }, photo2: { kind: "skyline", seed: 8 }, seed: 23 },
  C: { headline: "THEN THE PRESSES ROLL", deck: "Ink, paper and one long night", photo: { kind: "press", seed: 5 },
    key: { text: "READ ALL ABOUT IT", at: 0.05 }, photo2: { kind: "notebook", seed: 6 }, seed: 37 },
};
const LAY = { A: layoutPage(PAGES.A, S), B: layoutPage(PAGES.B, S), C: layoutPage(PAGES.C, S) };
const { W, H } = S.page;

// ---- beats
export const BEATS = [
  { id: "spin", t: 0, dur: 3.7 },     // the front page spins in and lands; its photo develops
  { id: "print", t: 3.7, dur: 3.7 },  // the page turns away; a blank sheet is printed live by the ink roller
  { id: "check", t: 7.4, dur: 3.8 },  // push into a column; the key line is circled in red grease pencil
  { id: "press", t: 11.2, dur: 3.8 }, // pull back; a bundle of the finished edition thumps down
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

// ---- the edition plan (picture + sound read the same object)
const ink = { at: B.print.t + 1.25, dur: 2.1 };
const KEY = LAY.B.rects.key;
export const PLAN = planEdition({
  spin: { at: B.spin.t + 0.2, dur: 1.7 },
  develop: [
    { id: "A", at: B.spin.t + 2.15, dur: 1.2 },
    { id: "B", at: inkTimeAt(pageV(LAY.B.rects.photo[1], S), ink) + 0.05, dur: 1.2 },
  ],
  turn: { at: B.print.t + 0.05, dur: 1.05 },
  ink,
  pencil: [{ id: "circle", at: B.check.t + 1.2, dur: 0.95, path: circlePath(KEY, { seed: 3, pad: 0.007 }) }],
  drop: { at: B.press.t + 0.8, dur: 0.5 },
  moves: [{ t: B.check.t, dur: 1.1 }, { t: B.press.t, dur: 1.1 }],
}, S);

// ---- camera: computed top-down shots (shotFor) with a small forward tilt
const STACK_AT = [0.035, 0.025];                       // world x, z of the stack centre
const TOP = [-W / 2, -0.014, W / 2, H / 2];            // above the fold
export const PIVOT = [0, (TOP[1] + TOP[3]) / 2];        // the spin-in turns about the frame centre
const SHOTS = {
  top: shotFor(TOP, { fov: S.camera.fov, tilt: 0.12, margin: 0.03 }),
  turnUp: shotFor(TOP, { fov: S.camera.fov, tilt: 0.12, margin: 0.75, dx: -0.12 }),   // rise while the page stands up
  col: shotFor([KEY[0] - 0.05, KEY[1] - 0.07, KEY[2] + 0.07, KEY[3] + 0.06], { fov: S.camera.fov, tilt: 0.2, margin: 0.02 }),
  final: shotFor([-W / 2, -H / 2, W / 2, H / 2], { fov: S.camera.fov, tilt: 0.55, margin: 0.1, origin: STACK_AT, surface: 0.018, dx: -0.02, dy: 0.05 }),
  finalPush: shotFor([-W / 2, -H / 2, W / 2, H / 2], { fov: S.camera.fov, tilt: 0.6, margin: 0.03, origin: STACK_AT, surface: 0.018, dx: -0.01, dy: 0.08 }),
};
const key = (t, s, ease = "inOutCubic") => ({ t, ...s, ease });
export const CAMERA = [
  key(0, SHOTS.top),
  key(PLAN.turn.at, SHOTS.top),
  key(PLAN.turn.at + PLAN.turn.dur * 0.5, SHOTS.turnUp, "inOutSine"),
  key(PLAN.turn.at + PLAN.turn.dur + 0.15, SHOTS.top, "inOutSine"),
  key(B.check.t, SHOTS.top),
  key(B.check.t + 1.1, SHOTS.col),
  key(B.press.t, SHOTS.col),
  key(B.press.t + 1.1, SHOTS.final),
  key(DURATION, SHOTS.finalPush, "inOutSine"),
];

export const OBJECTS = [
  { id: "desk", primitive: "procedural", factory: "desk", procedural: "3.2 x 2.2 m imposing-table top: dark grey steel/stone with fbm mottling and old ink smudges", dims: { w: 3.2, d: 2.2 } },
  { id: "pageB", primitive: "procedural", factory: "frontPage", procedural: "0.58 x 0.74 m newsprint sheet (baked ink/tone/back texture + newsprint shader); printed live by the ink pass", dims: { content: PAGES.B, ppm: 5000 }, position: [0, 0.0006, 0] },
  { id: "pageA", primitive: "procedural", factory: "frontPage", procedural: "0.58 x 0.74 m newsprint sheet; spins in, then turns over to the left", dims: { content: PAGES.A, ppm: 4200 }, position: [0, 0.0013, 0] },
  { id: "stack", primitive: "procedural", factory: "paperStack", procedural: "bundle of ~36 sheets (3 offset blocks with striped edges) topped by a printed front page", dims: { top: PAGES.C, ppm: 4200 }, position: [STACK_AT[0], 0.004, STACK_AT[1]], rotation: [0, -0.09, 0] },
  { id: "roller", primitive: "procedural", factory: "inkRoller", procedural: "rubber ink roller (brayer) with steel frame and wooden grip; child of pageB's page frame", dims: {} },
];

// ---- SCORE: everything from the plan + a warm bed
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 1.2, release: 1.5, brightness: S.sound.bed.brightness },
  { t: 0, type: "rumble", dur: DURATION, gain: 0.05, pitch: 0.8, seed: 404 },
  ...scoreFromEvents(PLAN.events, pressVoices(S.sound), { seedBase: 101, pan: (e) => (e.kind === "pencil" ? -0.25 : e.kind === "turn" ? -0.3 : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "Sheets are baked once into one RGBA texture each (ink / photo tone / back print / photo mask); the newsprint shader reveals ink behind the roller (uHead) and grows halftone dots (uDevelop). All motion = press.js pose functions of t.",
  events: PLAN.events.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind })),
};
