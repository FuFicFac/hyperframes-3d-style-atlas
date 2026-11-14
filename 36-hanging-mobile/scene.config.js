// scene.config.js — 36-hanging-mobile: "Add one thing and everything shifts" — a gallery mobile of four priorities
// (made-up tags, no data). Plain data + the style's pure planner (balance.js). No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec / export-blender (Node). Units: metres, Y-up, radians, s, sRGB hex.
// Frame: mobile hangs in the plane z = 0, root pivot at (ROOT[0], gallery.rootY, 0); wall at z = gallery.wallZ; floor y = 0.
import { planMobile, mobileVoices, mobileBed } from "./_atlas/styles/hanging-mobile/balance.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { STYLE_SPEC } from "./_atlas/styles/hanging-mobile/spec.js";

export const ID = "36-hanging-mobile";
export const STYLE = "hanging-mobile";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats: one wall-label line each (<= 26 chars)
export const BEATS = [
  { id: "open", t: 0, dur: 3.0, label: "Everything in balance" },
  { id: "add", t: 3.0, dur: 3.2, label: "Add one thing" },
  { id: "centre", t: 6.2, dur: 3.0, label: "Find the new centre" },
  { id: "heavy", t: 9.2, dur: 2.9, label: "Make one thing heavier" },
  { id: "settle", t: 12.1, dur: 2.9, label: "And it settles again" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, k) => B[id].t + k;

// ---- the mobile (root arm). Pivots are SOLVED from the plate areas; tags are decoration that turns with the plates.
export const MOBILE = {
  id: "top", len: 3.4, h: 0.16, yaw: { swing: 0.16, period: 22, phase: 0.4 },
  loads: [
    { at: 0, drop: 0.5, shape: { id: "sun", kind: "disc", r: 0.42, color: "red", tag: "WORK", yaw: { base: 0.1, swing: 0.3, period: 13, phase: 0.5 } } },
    { at: 1, drop: 0.3, arm: { id: "mid", len: 2.5, h: 0.17, yaw: { base: 0.12, swing: 0.3, period: 17, phase: 1.3 },
      loads: [
        { at: 0, drop: 0.36, arm: { id: "low", len: 1.8, h: 0.12, yaw: { base: -0.15, swing: 0.38, period: 12, phase: 2.4 },
          loads: [
            { at: 0, drop: 0.4, shape: { id: "leaf", kind: "leaf", len: 0.7, w: 0.33, rot: 0.5, color: "yellow", tag: "PLAY", yaw: { swing: 0.45, period: 9, phase: 1 } } },
            { at: 1, drop: 0.3, shape: { id: "tri", kind: "triangle", w: 0.52, h: 0.56, round: 0.03, color: "blue", tag: "REST", yaw: { base: -0.1, swing: 0.4, period: 11, phase: 4 } } },
          ] } },
        { at: 1, drop: 0.5, shape: { id: "moon", kind: "crescent", r: 0.38, cut: 0.8, shift: 0.42, rot: 0.3, color: "black", tag: "HOME", yaw: { swing: 0.35, period: 14, phase: 2.2 } } },
      ] } },
  ],
};

// ---- events, all from BEATS: hang a new plate on the lowest arm, re-balance deepest first, grow one plate, re-balance
const NEW = { id: "new", at: 0.7, drop: 0.28, shape: { id: "dot", kind: "disc", r: 0.21, color: "white", inlay: { r: 0.075, color: "black" }, tag: "NEW", yaw: { swing: 0.5, period: 8, phase: 0.3 } } };
export const EVENTS = [
  { t: at("add", 0.25), kind: "hang", arm: "low", dur: 0.85, load: NEW },
  ...["low", "mid", "top"].map((arm, i) => ({ t: at("centre", 0.2 + i * 0.3), kind: "rebalance", arm, dur: 1.0 })),
  { t: at("heavy", 0.25), kind: "weight", shape: "moon", scale: 1.25, dur: 0.7 },
  ...["mid", "top"].map((arm, i) => ({ t: at("settle", 0.1 + i * 0.3), kind: "rebalance", arm, dur: 1.0 })),
];

export const PLAN = planMobile(MOBILE, EVENTS, { ...STYLE_SPEC.balance, density: STYLE_SPEC.sheet.density, duration: DURATION });

// ---- set: centre the resting mobile on x = 0 (from the plan, never hand-typed)
const G = STYLE_SPEC.gallery;
const EXT = PLAN.bounds(0, DURATION, 0.25);           // swept extent over the clip (vertical framing)
const REST = PLAN.bounds(0, 0, 1);                       // the balanced mobile at rest (horizontal centring)
export const ROOT = [-(REST.min[0] + REST.max[0]) / 2, G.rootY, 0];
const W = (local) => [ROOT[0] + local[0], ROOT[1] + local[1], ROOT[2] + local[2]];
const pivotOf = (id, t) => W(PLAN.pose(t).arms[id].pivot);
const MIDY = ROOT[1] + (EXT.min[1] + Math.min(0, EXT.max[1])) / 2;   // vertical centre of the swept mobile
const RESTY = ROOT[1] + REST.min[1] / 2;                              // vertical centre of the resting mobile

// ---- camera: one slow move per beat; targets come from the plan (the arm where the action is)
const lowP = pivotOf("low", at("add", 1)), midP = pivotOf("mid", at("heavy", 1));
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const C0 = [0, MIDY, 0];
export const CAMERA = [
  { t: 0, pos: [-0.35, 2.75, 6.0], target: [-0.4, RESTY, 0], fov: 34 },
  { t: B.add.t, pos: [-0.2, 2.7, 5.8], target: [0, RESTY - 0.05, 0], fov: 34, ease: "inOutSine" },
  { t: at("add", 1.3), pos: [lowP[0] - 0.4, 2.55, 6.7], target: mix([0, MIDY - 0.1, 0], lowP, 0.2), fov: 34, ease: "inOutSine" },
  { t: B.centre.t + 0.3, pos: [lowP[0] - 0.4, 2.5, 6.3], target: mix([0, MIDY - 0.2, 0], lowP, 0.3), fov: 34, ease: "inOutSine" },
  { t: B.heavy.t, pos: [1.1, 2.5, 6.6], target: C0, fov: 34, ease: "inOutSine" },
  { t: at("heavy", 1.4), pos: [midP[0] + 0.1, 2.3, 6.9], target: mix([0, MIDY - 0.6, 0], midP, 0.3), fov: 34, ease: "inOutSine" },
  { t: B.settle.t + 0.2, pos: [midP[0] * 0.3, 2.5, 5.7], target: C0, fov: 34, ease: "inOutSine" },
  { t: DURATION, pos: [-0.15, 2.65, 5.65], target: [-0.1, MIDY + 0.05, 0], fov: 34, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "gallery", primitive: "procedural", factory: "gallery", procedural: "white gallery: matte plaster wall plane, polished concrete floor, dark shadow-gap reveal at the wall base, white ceiling with an emissive skylight panel" },
  { id: "hook", primitive: "procedural", factory: "hook", procedural: "ceiling rose + small open steel hook the mobile's top thread hangs from", position: [ROOT[0], G.ceilingY - 0.08, 0] },
];

// ---- SCORE: a calm pad bed + every cue from the plan's events (hook clinks, slides, swing ticks, settles)
export const SCORE = [
  ...mobileBed(DURATION, STYLE_SPEC.sound),
  ...scoreFromEvents(PLAN.events, mobileVoices(STYLE_SPEC.sound)),
];
export const DUCK = []; // duckFromBeats(beatsFromSrt(vo_srt)) once a voiceover exists
export const NOTES = { root: ROOT, extent: EXT, events: EVENTS, planEvents: PLAN.events.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind, arm: e.arm ?? null })), frame: "mobile in plane z = 0; wall at gallery.wallZ; root pivot at ROOT" };
