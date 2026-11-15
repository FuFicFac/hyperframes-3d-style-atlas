// scene.config.js — 55-point-cloud: "How a machine sees a room" — a LiDAR scan made only of dots (style "point-cloud").
// Plain data + the style's pure scan planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every dot, the laser fan, the motor whir, the tick density and the completion tones come from
// the same plan (scan.js casts every ray at module load in both places).
import { STYLE_SPEC as S } from "./_atlas/styles/point-cloud/spec.js";
import { objects as O, roomCorner, createPlan, scanVoices } from "./_atlas/styles/point-cloud/scan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, pxRect } from "./_atlas/kit/framing.js";

export const ID = "55-point-cloud";
export const STYLE = "point-cloud";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "scan", t: 0, dur: 5.0, label: "A laser measures the room" },
  { id: "solid", t: 5.0, dur: 2.8, label: "Only dots. No surfaces." },
  { id: "shadow", t: 7.8, dur: 3.4, label: "It can't see behind things" },
  { id: "fill", t: 11.2, dur: 3.8, label: "Scan again. Fill the gaps." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.3), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the room (ray targets only — never drawn)
export const ROOM = roomCorner({ x: [-4, 4.2], z: [-3.4, 3.4], h: 2.7, window: [-1.3, 0.5, 1.0, 2.0], door: [2.3, 3.3, 0, 2.1] });
export const WORLD = [
  ROOM,
  O.figure([0.1, 0, -0.5], 0.75),
  O.chair([-1.6, 0, 0.6], 0.7),
  O.plant([-3.25, 0, -2.75]),
  O.table([-1.4, 0, -2.2]),
  O.bicycle([1.25, 0, -2.75], 0.08),
];
export const SCANNERS = [
  { id: "s1", pos: [2.6, S.tripod.height, 2.3], t0: B.scan.t + 0.7, dur: 4.0, az0: Math.PI * 1.25, dir: 1, seed: 3 },
  { id: "s2", pos: [-2.9, S.tripod.height, 1.7], t0: B.fill.t + 0.55, dur: 2.5, az0: Math.PI * 0.75, dir: -1, seed: 5 },
];
export const PLAN = createPlan(WORLD, SCANNERS, S.scan);
const [S1, S2] = PLAN.scans;
/** tripod 2 appears with the fill beat */
export const SHOW2 = { on: B.fill.t + 0.05, dur: 0.4 };

// ---------------------------------------------------------------- camera: hold while dots appear, one move per beat
// Beat 2 goes INTO the scanner's own eye (its tripod is hidden while the camera is inside it): from there every dot
// sits exactly where the laser saw it and the scan shadows are invisible. Beat 3 orbits out and above to show them.
const ORBIT = 1.5;
const eye = [S1.origin[0], S1.origin[1] + 0.02, S1.origin[2]];
export const CAMERA = [
  { t: 0, pos: [6.0, 3.3, 7.2], target: [-0.4, 0.75, -0.9], fov: 40 },
  { t: B.solid.t, pos: [6.0, 3.3, 7.2], target: [-0.4, 0.75, -0.9], fov: 40 },
  { t: B.solid.t + 0.9, pos: eye, target: [-1.3, 0.8, -1.9], fov: 52, ease: "inOutSine" },
  { t: B.shadow.t, pos: eye, target: [-1.3, 0.8, -1.9], fov: 52 },
  // one orbit out and above to the final wide (both tripods); moves are short because a moving camera over 100k+
  // dots is what costs bitrate
  { t: B.shadow.t + ORBIT, pos: [-3.2, 7.0, 6.2], target: [-0.3, 0.45, -0.6], fov: 46, ease: "inOutSine" },
  { t: DURATION, pos: [-3.2, 7.0, 6.2], target: [-0.3, 0.45, -0.6], fov: 46 },
];
/** the scanner prop is hidden while the camera is closer than this to its laser (inside the head) */
export const HIDE_NEAR = 0.9;

// ---------------------------------------------------------------- framing gate (replays the rig exactly)
// Required: the furnished part of the room in every shot outside the scanner's eye, each tripod while shown; the
// caption chip (top-left) must not cover the objects.
const OBJ_BOX = [[-3.6, 0, -3.4], [2.0, 1.8, 1.0]];
function regions(t) {
  const out = [];
  const inEye = t > B.solid.t + 0.1 && t < B.shadow.t + ORBIT;   // camera inside the scanner head, or orbiting out of it (the room overfills the frame mid-orbit; checked in stills)
  if (!inEye) out.push({ id: "objects", pts: boxCorners(...OBJ_BOX) });
  if (t < B.solid.t + 0.1) out.push({ id: "tripod1", pts: boxCorners([S1.origin[0] - 0.45, 0, S1.origin[2] - 0.45], [S1.origin[0] + 0.45, S1.origin[1] + 0.15, S1.origin[2] + 0.45]) });
  if (t > SHOW2.on + SHOW2.dur) out.push({ id: "tripod2", pts: boxCorners([S2.origin[0] - 0.45, 0, S2.origin[2] - 0.45], [S2.origin[0] + 0.45, S2.origin[1] + 0.15, S2.origin[2] + 0.45]) });
  return out;
}
const CAPTION_BOX = pxRect(S.caption.x, S.caption.y, 760, S.caption.h);
export const FRAMING = framingReport(regions, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.92,
  keepOut: [{ id: "caption", ...CAPTION_BOX }],
});
if (!FRAMING.ok && !globalThis.process?.env?.PC_NOGATE) {
  throw new Error(`55-point-cloud framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a low bed
export const EVENTS = PLAN.events(S.sound, { fps: FPS });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 19], attack: 1.5, release: 2.0, brightness: S.sound.bed.brightness },
  ...scoreFromEvents(EVENTS, scanVoices(S.sound), { seedBase: 101 }),
];
export const DUCK = [];
const cov = PLAN.coverage(0.1, [ROOM.X[0], ROOM.X[1], ROOM.Z[0], ROOM.Z[1]]);
export const NOTES = {
  mechanism: "scan.js: rays cast analytically (floor, walls with door/window holes, boxes, cylinders, spheres, capsules) from each tripod in vertical columns; a dot's reveal time = sweep start + column/nAz x dur; dots sorted by reveal so drawRange = dots measured by t.",
  dots: PLAN.scans.map((s) => ({ id: s.id, n: s.n, t0: s.t0, t1: s.t1 })),
  total: PLAN.total,
  floorCoverage: { cells: cov.cells, scan1: cov.seen[0], scan2: cov.seen[1], both: cov.union },
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
  counter: "the on-screen counter shows the real number of dots drawn at that frame",
};
