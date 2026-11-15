// scene.config.js — 65-op-art: "It was flat all along" — 1960s optical art on a gallery wall (style "op-art").
// Plain data + the style's pure pattern planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every cue in SCORE comes from the same plan the panel shader reads.
import { STYLE_SPEC as S } from "./_atlas/styles/op-art/spec.js";
import { createPlan, opVoices } from "./_atlas/styles/op-art/opplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, prepareKeys, sampleCameraKeys, screenExtent, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "65-op-art";
export const STYLE = "op-art";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "bulge", t: 0, dur: 3.0, label: "Flat stripes, flat wall" },
  { id: "travel", t: 3.0, dur: 3.0, label: "Your eye adds the bulge" },
  { id: "moire", t: 6.0, dur: 3.0, label: "Two layers make moiré" },
  { id: "grid", t: 9.0, dur: 3.0, label: "Same grid: dome or tunnel" },
  { id: "reveal", t: 12.0, dur: 3.0, label: "It was flat all along" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the plan (every time below derives from BEATS)
export const TIMES = {
  grow: B.bulge.t + 0.15, growDur: 0.9, start: [-0.1, 0.02],
  legs: [
    { t0: B.travel.t, t1: B.travel.t + 1.4, to: [0.95, 0.16] },
    { t0: B.travel.t + 1.5, t1: B.travel.t + 2.9, to: [-0.95, -0.12] },
  ],
  wipe: B.moire.t, wipeDur: 0.6,
  slideIn: [B.moire.t + 0.55, B.moire.t + 1.25],
  glide: [B.moire.t + 1.35, B.moire.t + 2.75],
  slideOut: [B.moire.t + 2.85, B.moire.t + 3.45],
  gridIn: B.grid.t + 0.05, revealStep: 0.07, domeDur: 0.9,
  flip: B.grid.t + 1.55, flipStep: 0.08, flipDur: 1.0,
  back: B.reveal.t + 0.1,             // the grid flips back to the dome as the camera starts to walk round
  reveal: [B.reveal.t, B.reveal.t + 2.0],
  end: DURATION,
};
export const PLAN = createPlan({ times: TIMES, pattern: S.pattern, panel: S.panel });

// ---------------------------------------------------------------- camera: locked front-on, one off-axis arc for the reveal
const PN = S.panel;
const PANEL = { box: [[-PN.w / 2, PN.y - PN.h / 2, PN.standoff], [PN.w / 2, PN.y + PN.h / 2, PN.standoff + PN.depth]] };
const WIN = { x0: -0.87, x1: 0.87, y0: -0.66, y1: 0.9 };            // caption card sits below y = -0.66
const FRONT = fitShot(PANEL, { azimuth: 0, elevation: 0, fov: S.camera.fov, window: WIN, fill: 1.0 });
// off-axis: ~33 deg round and a little above, so the top edge, the stretcher depth and the wall shadow show. The panel
// overlaps the caption card a little here (the card is opaque white, so the label still reads).
const SIDE = fitShot(PANEL, { azimuth: -0.58, elevation: 0.3, fov: S.camera.fov, window: { x0: -0.92, x1: 0.92, y0: -0.92, y1: 0.92 }, fill: 0.97 });
export const CAMERA = [
  { t: 0, pos: FRONT.pos, target: FRONT.target, fov: S.camera.fov },
  { t: TIMES.reveal[0], pos: FRONT.pos, target: FRONT.target, fov: S.camera.fov },
  { t: TIMES.reveal[1], pos: SIDE.pos, target: SIDE.target, fov: S.camera.fov, ease: "inOutCubic", path: "arc" },
  { t: DURATION, pos: SIDE.pos, target: SIDE.target, fov: S.camera.fov },
];

// ---------------------------------------------------------------- framing gate: whole panel in frame, >= 70 % of frame width
export const FRAMING = framingReport(() => [{ id: "panel", box: PANEL.box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, window: { x0: -0.95, x1: 0.95, y0: -0.95, y1: 0.95 },
});
const K = prepareKeys(CAMERA, { fov: S.camera.fov });
export const WIDTH = (() => {
  let min = { w: 9, t: 0 };
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, e = screenExtent(sampleCameraKeys(K, t, { fov: S.camera.fov }), boxCorners(...PANEL.box));
    const w = (e.x[1] - e.x[0]) / 2;
    if (w < min.w) min = { w: +w.toFixed(3), t };
  }
  return min;
})();
if ((!FRAMING.ok || WIDTH.w < 0.68) && !globalThis.process?.env?.OP_NOGATE) {
  throw new Error(`65-op-art framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), width: WIDTH })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, opVoices(S.sound), { seedBase: 165 });
export const DUCK = [];
export const NOTES = {
  mechanism: "opplan.js schedules the bulge path/radius, the stripes->rings wipe, the acetate offset (fringe ticks at each ring-period crossing), and per-ring grid reveal/flip; one fragment shader draws stripes, rings and the grid analytically with fwidth AA.",
  fringes: PLAN.fringes.length,
  alignAt: PLAN.alignAt,
  rings: PLAN.maxRing,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
  minPanelWidth: WIDTH,
  labels: "the captions describe what is on screen; no numbers or claims",
};
