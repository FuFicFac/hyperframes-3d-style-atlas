// scene.config.js — 115-caustics: "The glass hides a picture" (style "caustics").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set the glass height keys (the only optical input), the beam switch, the room dip and the
// camera; the picture (ray mesh + glass) and every sound cue read the same plan.
import { STYLE_SPEC as S } from "./_atlas/styles/caustics/spec.js";
import { createCausticPlan } from "./_atlas/styles/caustics/caustic.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "115-caustics";
export const STYLE = "caustics";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "The glass hides a picture";

// ---------------------------------------------------------------- beats (storyboard: times + labels as written)
export const BEATS = [
  { id: "glass", t: 0, dur: 2.6, label: "A lumpy piece of glass" },
  { id: "light", t: 2.6, dur: 2.8, label: "Shine a light through it" },
  { id: "raise", t: 5.4, dur: 3.6, label: "Raise it: light gathers" },
  { id: "focus", t: 9.0, dur: 3.0, label: "At one height: a picture" },
  { id: "hold", t: 12.0, dur: 3.0, label: "The bumps hold the picture" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, inDur: i ? 0.25 : 0.2, outDur: 0.25 }));

// ---------------------------------------------------------------- the plan (from the beats)
const F = S.optic.focus;
const T = {
  settle: [B.glass.t + 1.9, B.light.t - 0.05],       // the slab lowers to almost touching the table
  beamOn: B.light.t + 0.15,                           // switch click
  climb: [B.raise.t + 0.1, B.focus.t],                // slow climb: even -> swirl
  lock: [B.focus.t, B.focus.t + 0.8],                 // fast final approach that locks at the focus height
  over: [B.hold.t + 0.9, B.hold.t + 1.55],            // past focus: it smears
  back: [B.hold.t + 1.85, B.hold.t + 2.45],           // back to sharp
};
export const HEIGHTS = { rest: 0.05, low: 0.011, climbTop: 0.727 * F, focus: F, over: 1.118 * F };
export const PLAN_CFG = {
  target: S.target, stir: S.stir, rays: S.rays, glass: S.glass, focus: F, sharpWidth: S.optic.sharpWidth,
  height: [
    [0, HEIGHTS.rest],
    [T.settle[0], HEIGHTS.rest],
    [T.settle[1], HEIGHTS.low, "inOutSine"],
    [T.climb[0], HEIGHTS.low],
    [T.climb[1], HEIGHTS.climbTop, "inQuad"],
    [T.lock[1], HEIGHTS.focus, "outCubic"],
    [T.over[0], HEIGHTS.focus],
    [T.over[1], HEIGHTS.over, "inOutSine"],
    [T.back[0], HEIGHTS.over],
    [T.back[1], HEIGHTS.focus, "outCubic"],
  ],
  tilt: [[0, 0.085], [B.glass.t + 2.1, 0, "inOutSine"]],
  beam: { on: T.beamOn, rise: 0.12 },
  // room light: full while we meet the glass and the even patch, easing down as the light gathers, lowest at focus
  room: [[0, 1], [B.raise.t + 0.3, 1], [B.raise.t + 2.4, 0.4, "inOutSine"], [B.focus.t, 0.32, "inOutSine"], [B.focus.t + 0.75, 0.04, "inOutSine"], [B.hold.t, 0.04], [B.hold.t + 1.2, 0.14, "inOutSine"]],
  // glass reflections: full in the close-up, lower once we look through the slab at the light
  raysShow: [[0, 0], [B.hold.t + 0.7, 0], [B.hold.t + 1.4, 1, "inOutSine"]],
  sheen: [[0, 1], [B.light.t + 0.2, 1], [B.light.t + 1.3, 0.5, "inOutSine"], [B.raise.t + 0.2, 0.5], [B.raise.t + 1.6, 0.28, "inOutSine"], [B.hold.t + 0.4, 0.28], [B.hold.t + 1.3, 1, "inOutSine"]],
  events: [],
};
export const PLAN = createCausticPlan(PLAN_CFG);

// ---------------------------------------------------------------- camera: one move per beat
const fov = S.camera.fov;
const k = (t, pos, target, ease, f = fov) => ({ t, pos, target, fov: f, ...(ease ? { ease } : {}) });
export const SHOTS = {
  close0: [[0.4, 0.22, 0.56], [0.0, 0.03, -0.04]],
  close1: [[0.26, 0.2, 0.6], [0.0, 0.03, -0.04]],
  table: [[0.0, 0.5, 0.58], [0.0, 0.0, 0.025]],  // beats 2-3: the whole light square, sun ~67 % of frame height
  push: [[0.0, 0.49, 0.52], [0.0, 0.0, 0.021]],    // beat 4: sun ~75 % of frame height, below the caption
  wide: [[0.0, 0.7, 0.88], [0.0, 0.075, -0.075]], // beat 5: square ~56 % of width, slab front edge between caption and picture
};
export const CAMERA = [
  k(0, ...SHOTS.close0),
  k(B.light.t - 0.1, ...SHOTS.close1, "inOutSine"),
  k(B.light.t + 1.3, ...SHOTS.table, "inOutCubic"),
  k(B.raise.t + 2.7, ...SHOTS.table),
  k(B.focus.t + 0.6, ...SHOTS.push, "inOutSine"),
  k(B.hold.t, ...SHOTS.push),
  k(B.hold.t + 1.3, ...SHOTS.wide, "inOutCubic"),
  k(DURATION, ...SHOTS.wide),
];

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from the plan's keys
const SND = S.sound;
const sharpBeam = (t) => PLAN.sharpAt(t) * PLAN.beamAt(t);
export const EVENTS = [
  // glassy bed: overlapping pad segments whose brightness follows the focus sharpness at their centre
  ...Array.from({ length: Math.ceil(DURATION / SND.bed.hop) }, (_, i) => {
    const t = i * SND.bed.hop, tc = Math.min(DURATION, t + SND.bed.seg / 2);
    return { t, kind: "bed", dur: Math.min(SND.bed.seg, DURATION - t), bright: sharpBeam(tc) };
  }).filter((e) => e.dur > 0.3),
  { t: 0.3, kind: "glint", pitch: 1.0 },
  { t: 1.35, kind: "glint", pitch: 1.19 },
  { t: T.settle[0], kind: "servo", dur: T.settle[1] - T.settle[0], hz: 150, hz2: 120 },
  { t: T.beamOn - 0.03, kind: "switch" },
  { t: T.climb[0], kind: "servo", dur: T.climb[1] - T.climb[0], hz: 110, hz2: 170 },
  { t: T.lock[0], kind: "servo", dur: T.lock[1] - T.lock[0], hz: 170, hz2: 215 },
  { t: T.lock[0] + 0.62, kind: "focus" },
  { t: B.hold.t + 0.02, kind: "pull", dur: 1.25 },
  { t: T.over[0], kind: "servo", dur: T.over[1] - T.over[0], hz: 180, hz2: 200 },
  { t: T.over[0] + 0.35, kind: "detune", dur: T.back[1] - T.over[0] - 0.2 },
  { t: T.back[0], kind: "servo", dur: T.back[1] - T.back[0], hz: 200, hz2: 175 },
  { t: T.back[1] - 0.12, kind: "settle" },
].sort((a, b) => a.t - b.t);
const VOICES = {
  bed: (e) => [{ type: "pad", dur: e.dur, root: SND.bed.root, chord: [0, 7, 12, 16], attack: 0.9, release: 0.9, brightness: Math.round(SND.bed.dark + (SND.bed.bright - SND.bed.dark) * e.bright), gain: SND.bed.gain }],
  glint: (e) => [{ type: "chime", dur: 1.1, notes: 3, sparkle: 0.6, pitch: 1.6 * e.pitch, gain: SND.glint.gain }],
  servo: (e) => [{ type: "servo", dur: e.dur, hz: e.hz, hz2: e.hz2, grit: 0.2, gain: SND.servo.gain }],
  switch: () => [{ type: "click", pitch: 0.8, gain: SND.click.gain }, { type: "tick", pitch: 1.4, offset: 0.012, gain: SND.click.gain * 0.6 }],
  focus: () => [{ type: "chime", dur: 2.4, notes: 5, pitch: 1.0, gain: SND.focus.gain }],
  pull: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 0.8, pitch: 0.7, gain: 0.16 }],
  detune: (e) => [{ type: "pad", dur: e.dur, root: SND.bed.root * SND.detune.pitch, chord: [0, 7, 12], attack: 0.35, release: 0.5, brightness: 1400, gain: SND.detune.gain }],
  settle: () => [{ type: "chime", dur: 1.6, notes: 3, pitch: 1.5, gain: SND.settle.gain }],
};
export const SCORE = scoreFromEvents(EVENTS, VOICES, { seedBase: 115 });
export const DUCK = [];

// ---------------------------------------------------------------- framing report: the sun (ray tips + caps) vs the caption chip
// (longest label's plate), and how much of the frame height the sun fills, per beat from the light switching on
const CAP = pxRect(S.caption.right - 1330, S.caption.y, 1330, S.caption.h);
const SUN_R = (S.target.ray1 + S.target.rayW1) * S.target.scale * S.optic.W;
const SUN = Array.from({ length: 72 }, (_, i) => [SUN_R * Math.cos((i * Math.PI) / 36), 0, SUN_R * Math.sin((i * Math.PI) / 36)]);
function frameCheck() {
  let worstCap = -9;
  const fill = {};
  for (let i = Math.round(B.light.t * 30); i <= DURATION * 30; i++) {
    const t = i / 30, cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov });
    let ymin = 9, ymax = -9;
    for (const p of SUN) {
      const [x, y] = projectPoint(cam, p);
      ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      worstCap = Math.max(worstCap, Math.min(x - CAP.x0, CAP.x1 - x, y - CAP.y0, CAP.y1 - y));
    }
    const beat = BEATS.filter((b) => b.t <= t).pop().id, f = (Math.min(1, ymax) - Math.max(-1, ymin)) / 2;
    fill[beat] = Math.max(fill[beat] ?? 0, +f.toFixed(3));
  }
  return { sunUnderCaption: +worstCap.toFixed(3), sunHeightFillMax: fill };
}
export const FRAMING = frameCheck();

export const NOTES = {
  title: TITLE,
  mechanism: "caustic.js: a smiling-sun brightness map (8 % floor) -> cumulative-sum (Knothe–Rosenblatt) map from even light; the ray mesh is regular in a twisted (exactly area-preserving) space, so its glass points are swirled; ray lands at glass point + (d / focus) x deflection; brightness = glass area / table area per triangle (GPU derivatives, additive half-float target).",
  plan: PLAN.stats,
  framing: FRAMING,
};
