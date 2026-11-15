// scene.config.js — 70-art-deco: "Art Deco" — doors part, a sunburst fans open, a ziggurat rises terrace by terrace,
// the crown ornaments click into place, a framed title panel unfolds (style "art-deco").
// Plain data + the style's pure planner (deco.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Every chord, ray note and click in SCORE comes from the same PLAN the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/art-deco/spec.js";
import { createPlan, decoVoices } from "./_atlas/styles/art-deco/deco.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, prepareKeys, sampleCameraKeys } from "./_atlas/kit/framing.js";

export const ID = "70-art-deco";
export const STYLE = "art-deco";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "doors", t: 0, dur: 2.5, label: "BEHIND BRONZE DOORS" },
  { id: "fan", t: 2.5, dur: 2.7, label: "A SUNBURST UNFOLDS" },
  { id: "tower", t: 5.2, dur: 3.6, label: "TERRACE BY TERRACE" },
  { id: "crown", t: 8.8, dur: 3.0, label: "CROWNED IN GOLD" },
  { id: "title", t: 11.8, dur: 3.2, label: "ART DECO" },   // the title panel's own lettering is this beat's label
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// overlay caption for the first four beats (one at a time); the title beat's label is the panel lettering
export const LABELS = BEATS.slice(0, 4).map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.15), off: BEATS[i + 1].t - 0.4 }));

// ---------------------------------------------------------------- the one plan
const TIER_STEP = 0.58;
export const PLAN = createPlan({
  doors: { start: B.doors.t + 0.2, dur: 2.0 },
  fan: { start: B.doors.t + 1.35, dur: 2.5,   // overlaps the door opening: the fan starts to spread as soon as the gap is wide
    rays: S.sunburst.rays, spread: 172, ease: "inOutQuad" },
  tiers: {
    start: B.tower.t + 0.15, step: TIER_STEP, dur: 1.0, count: S.tower.tiers.length,
    // one chord per tier, roots stepping up the D major scale: D, Em, F#m, G, A
    roots: [146.83, 164.81, 185.0, 196.0, 220.0],
    chords: [[0, 4, 7, 12], [0, 3, 7, 12], [0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12]],
  },
  spire: { start: B.tower.t + 0.15 + S.tower.tiers.length * TIER_STEP + 0.1, dur: 0.6 },
  ornaments: { ids: ["finials", "chevrons", "sunfans", "scallops", "keystone", "crest"], start: B.crown.t + 0.35, step: 0.4, dur: 0.5 },
  panel: { start: B.title.t + 0.1, dur: 0.9 },
  lights: { on: B.tower.t + 0.3, tilt: S.searchlight.tilt, sweep: S.searchlight.sweep, hz: S.searchlight.hz },
  end: DURATION,
});

// ---------------------------------------------------------------- camera: doors -> through the doorway -> crane up -> crown -> wide
const DOORS = { pos: [0, 3.4, 14.8], target: [0, 3.4, 4] };
const FAN = { pos: [0, 4.2, 3.0], target: [0, 6.6, -21] };
const WIDE = { pos: [0, 4.6, 20], target: [0, 8.4, -12] };
const CROWN_A = { pos: [0, 9.0, 1.5], target: [0, 10.0, -12] };
const CROWN_B = { pos: [0, 11.4, 0.5], target: [0, 12.2, -12] };
export const CAMERA = [
  { t: 0, ...DOORS },
  { t: 1.0, ...DOORS },
  { t: 4.4, ...FAN, ease: "inOutCubic" },
  { t: B.tower.t + 0.1, ...FAN },
  { t: 8.6, ...WIDE, ease: "inOutSine" },
  { t: B.crown.t + 0.2, ...WIDE },
  { t: 10.1, ...CROWN_A, ease: "inOutCubic" },
  { t: 11.5, ...CROWN_B, ease: "inOutSine" },
  { t: B.title.t + 0.1, ...CROWN_B },
  { t: 13.9, ...WIDE, ease: "inOutCubic" },
  { t: DURATION, ...WIDE },
];

// the doorway wall is shown until the camera has passed through it (then hidden for good, from t)
const K = prepareKeys(CAMERA, { fov: S.camera.fov });
export const DOOR_HIDE = (() => {
  const zPass = S.doors.z - S.doors.wallThickness / 2 - 0.35;
  for (let f = 0; f <= DURATION * 30; f++) { const t = f / 30; if (sampleCameraKeys(K, t, { fov: S.camera.fov }).pos[2] < zPass) return +t.toFixed(4); }
  return Infinity;
})();

// ---------------------------------------------------------------- framing gate (subject inside the 90 % safe area per shot)
const TZ = S.tower.z, T0 = S.tower.tiers[0];
let top = 0; for (const tr of S.tower.tiers) top += tr.h + S.tower.cap;
const SPIRE_TOP = top + S.tower.spire.h;
const TOWER_BOX = [[-T0.w / 2, 0, TZ - T0.d / 2], [T0.w / 2, SPIRE_TOP, TZ + T0.d / 2]];
const CROWN_BOX = [[-S.tower.tiers[3].w / 2 - 1.6, top - S.tower.tiers[4].h - S.tower.cap - 0.6, TZ], [S.tower.tiers[3].w / 2 + 1.6, SPIRE_TOP - 0.6, TZ]];
const PANEL_BOX = [[-S.panel.w / 2 - 0.5, S.panel.y - 0.3, S.panel.z], [S.panel.w / 2 + 0.5, S.panel.y + S.panel.h + 1.0, S.panel.z]];
export const FRAMING = framingReport([
  { id: "tower", box: TOWER_BOX, from: 13.9, to: DURATION, required: true },
  { id: "towerTowerBeat", box: TOWER_BOX, from: 8.6, to: 9.0, required: true },
  { id: "crown", box: CROWN_BOX, from: 11.3, to: 11.9, required: true },   // the crane up reveals the spire before 11.3
  { id: "panel", box: PANEL_BOX, from: 13.9, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.92 });

if (!FRAMING.ok && !globalThis.process?.env?.DECO_NOGATE) throw new Error(`70-art-deco framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: a bed + the plan's events
export const EVENTS = PLAN.events();
const BED = S.sound.bed;
export const SCORE = [
  { t: 0, type: "pad", root: BED.root, chord: BED.chord, dur: DURATION, attack: 0.3, release: 1.6, brightness: BED.brightness, gain: BED.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, decoVoices(S.sound), { seedBase: 171 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "deco.js: doors open(t); folding fan: ray pair j at 90° ± min(j*slot, A(t)) so the outer blade leads and each ray stops in its slot (one marimba note per settle); tiers telescope up out of the tier below (one chord per tier, D-Em-F#m-G-A); spire last; crown ornaments in mirrored pairs (one click per landing); title frame unfolds from the centre line.",
  rays: PLAN.fan.rays.length, tiers: PLAN.tiers.map((t) => ({ k: t.k, start: t.start, root: t.root })),
  ornaments: PLAN.ornaments.map((o) => ({ id: o.id, start: o.start, land: o.land })),
  doorHide: DOOR_HIDE,
  framing: FRAMING.ok ? "ok" : { fails: FRAMING.spans.slice(0, 6) },
};
