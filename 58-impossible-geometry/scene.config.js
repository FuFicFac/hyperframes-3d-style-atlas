// scene.config.js — 58-impossible-geometry: "The endless stair" — a little walker climbs a stone staircase that loops
// for ever, until the camera swings off the one angle where the loop is true.
// Plain data + the style's pure planner (impossible.js) + kit framing/schedule (no THREE, no window): imported by
// scene.js (browser) and by render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex.
import { STYLE_SPEC } from "./_atlas/styles/impossible-geometry/spec.js";
import { penroseStairs, cellBox, stepTimes, seamCrossings, shepard, orbitKey, magicDir, viewAngle, sealFade } from "./_atlas/styles/impossible-geometry/impossible.js";
import { fitShot, sampleCameraKeys, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "58-impossible-geometry";
export const STYLE = "impossible-geometry";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "climb", t: 0.0, dur: 4.4 },  // magic view: the walker climbs, and climbs ("Always climbing")
  { id: "back", t: 4.4, dur: 3.0 },   // it reaches the flag it started at, still climbing ("Back where it started")
  { id: "reveal", t: 7.4, dur: 3.8 }, // camera orbits off: the loop splits open, the walker jumps the gap ("It only works from here")
  { id: "seal", t: 11.2, dur: 3.8 },  // camera returns: the loop seals with a bell ("One angle makes it true")
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => +(B[id].t + off).toFixed(4);

// ---------------------------------------------------------------- the stair (one plan for picture + sound)
const S = STYLE_SPEC.stairs;
export const PLAN = penroseStairs({ flights: S.flights, run: S.run, thick: S.thick, el: (S.elevationDeg * Math.PI) / 180 });
export const LAP = 6.0; // s per lap of the loop
export const WALK = { s0: 8, rate: PLAN.n / LAP, t0: 0 }; // starts on cell 8, beside the flag
export const FLAG_CELL = 8;
// hanging towers under the four corners of the apparent square (cell 0 = the seam corner, an "A" piece)
export const TOWERS = [
  { cell: 0, len: 2.2, door: "+z" },
  { cell: 7, len: 2.6, door: ["+z", "+x"] },
  { cell: 10, len: 2.0, door: "+x" },
  { cell: 13, len: 1.6, door: "+z" },
];
export const TOWER = { w: 0.86, cap: 1.0 };
const towerBottom = (tw) => PLAN.cells[tw.cell].y - PLAN.thick - 0.3 - tw.len - TOWER.cap;
export const TREE_LEDGE = { cell: 13, min: [2.72, -0.52, -3.42], max: [3.5, -0.3, -2.58] }; // relative to the cell top (y)

// ---------------------------------------------------------------- framing: subject = every block + tower
const subject = [
  ...PLAN.cells.flatMap((c, i) => boxCorners(...cellBox(PLAN, i))),
  ...TOWERS.flatMap((tw) => { const c = PLAN.cells[tw.cell]; return boxCorners([c.x - 0.5, towerBottom(tw), c.z - 0.5], [c.x + 0.5, c.y, c.z + 0.5]); }),
];
export const SUBJECT = subject;
const MAGIC = PLAN.magic;
export const OFF = { az: MAGIC.az - (32 * Math.PI) / 180, el: (24 * Math.PI) / 180 };
export const CAPTION = { x: 0, y: 0.82 };
const WINDOW = { x0: -0.9, x1: 0.9, y0: -0.92, y1: 0.66 }; // keep the top band for the caption
const shotMagic = fitShot(subject, { azimuth: MAGIC.az, elevation: MAGIC.el, ortho: true, fill: 0.97, window: WINDOW });
const shotOff = fitShot(subject, { azimuth: OFF.az, elevation: OFF.el, ortho: true, fill: 0.95, window: WINDOW });
const kMagic = (t, ease) => orbitKey(t, shotMagic.target, MAGIC.az, MAGIC.el, shotMagic.viewHeight, { ease, path: "arc" });
const kOff = (t, ease) => orbitKey(t, shotOff.target, OFF.az, OFF.el, shotOff.viewHeight, { ease, path: "arc" });
export const MOVE = { out: [at("reveal", 0.0), at("reveal", 1.7)], back: [at("seal", 0.0), at("seal", 1.6)] };
export const CAMERA = [
  kMagic(0),
  kMagic(MOVE.out[0]),
  kOff(MOVE.out[1], "inOutSine"),
  kOff(MOVE.back[0]),
  kMagic(MOVE.back[1], "inOutSine"),
  kMagic(DURATION),
];
/** toCamera(t) -> unit direction subject -> camera from the SAME keys the rig plays (framing.sampleCameraKeys is bit-identical). */
export function toCamera(t) {
  const s = sampleCameraKeys(CAMERA, t, { fov: STYLE_SPEC.camera.fov });
  const d = s.pos.map((v, i) => v - s.target[i]), L = Math.hypot(...d);
  return d.map((v) => v / L);
}
// the instants the loop visibly splits (seam fade reaches 0 going out) and seals (fade back to 1 coming home)
const fadeAt = (t) => sealFade(viewAngle(toCamera(t), MAGIC.dir), { full: (STYLE_SPEC.seam.fullDeg * Math.PI) / 180, gone: (STYLE_SPEC.seam.goneDeg * Math.PI) / 180 });
const firstWhere = (t0, t1, f) => { for (let t = t0; t <= t1; t += 1 / 240) if (f(t)) return +t.toFixed(4); return t1; };
export const fadeOf = fadeAt;
export const SPLIT_AT = firstWhere(MOVE.out[0], MOVE.out[1], (t) => fadeAt(t) < 0.02);
export const SEAL_AT = firstWhere(MOVE.back[0], MOVE.back[1] + 0.5, (t) => fadeAt(t) > 0.999);

// ---------------------------------------------------------------- captions (overlay; one at a time)
export const LABELS = [
  { text: "Always climbing", on: at("climb", 0.35), off: at("climb", 4.2) },
  { text: "Back where it started", on: at("back", 0.25), off: at("back", 2.85) },
  { text: "It only works from here", on: at("reveal", 0.3), off: at("reveal", 3.6) },
  { text: "One angle makes it true", on: at("seal", 0.3), off: DURATION + 1 },
];

export const OBJECTS = []; // the architecture is built procedurally in scene.js from style.props + PLAN (see NOTES)

// ---------------------------------------------------------------- SCORE (every cue from BEATS / PLAN / WALK / CAMERA)
export const STEPS = stepTimes(PLAN, WALK, 0, DURATION);
export const SEAMS = seamCrossings(PLAN, WALK, 0, DURATION);
const FOOT = { base: 130.81, octaves: 4, width: 0.85, gain: 0.3 }; // Shepard marimba: one octave per lap, for ever
const footsteps = STEPS.flatMap((e, k) =>
  shepard(e.i, PLAN.n, { octaves: FOOT.octaves, width: FOOT.width })
    .filter((p) => p.gain > 0.04)
    .map((p, o) => ({ t: e.t, type: "marimba", hz: +(FOOT.base * p.ratio).toFixed(3), decay: 0.22, mallet: 0.35, dur: 0.5, gain: +(FOOT.gain * p.gain).toFixed(4), pan: +(((e.i % 10) / 10 - 0.45) * 0.5).toFixed(3), seed: 1000 + k * 8 + o })),
);
export const SCORE = [
  // calm bed (brightness = low-pass cutoff in Hz)
  { t: 0, type: "pad", dur: DURATION, gain: 0.42, root: 196, chord: [0, 7, 12, 16], attack: 1.2, release: 1.5, brightness: 1100 },
  ...footsteps,
  // the teleport at the seam: a tiny soft bubble
  ...SEAMS.map((t, i) => ({ t, type: "bubble", gain: 0.12, pitch: 0.9, seed: 300 + i })),
  // the camera turns: a low woody creak (gritty slow whir) + a soft rumble, out and back
  { t: MOVE.out[0], type: "whir", dur: MOVE.out[1] - MOVE.out[0], hz: 62, hz2: 88, grit: 0.7, gain: 0.16, seed: 401 },
  { t: MOVE.out[0], type: "rumble", dur: MOVE.out[1] - MOVE.out[0] + 0.3, gain: 0.14, seed: 402 },
  { t: SPLIT_AT, type: "whoosh", dir: "out", dur: 0.7, gain: 0.12, pitch: 0.7, seed: 403 },
  { t: MOVE.back[0], type: "whir", dur: MOVE.back[1] - MOVE.back[0], hz: 88, hz2: 60, grit: 0.7, gain: 0.16, seed: 404 },
  { t: MOVE.back[0], type: "rumble", dur: MOVE.back[1] - MOVE.back[0] + 0.3, gain: 0.14, seed: 405 },
  // the loop seals: a gentle bell
  { t: SEAL_AT, type: "chime", dur: 2.2, gain: 0.3, pitch: 0.9, seed: 406 },
  // captions
  ...LABELS.map((l, i) => ({ t: l.on, type: "blip", notes: [0, 7], dur: 0.05, gain: 0.08, pitch: 1.1, seed: 500 + i })),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES =
  "A Penrose-style staircase built as a REAL open chain (impossible.penroseStairs): flights of 7/3/3/7 steps whose closing step lands exactly k·v from the first step, v = the magic orthographic view direction. The far end of the chain is cut in-shader where it lies between the first steps and their virtual copy (the seam), so from the magic view the loop is seamless; the cut fades out off-axis. The walker's position is closed-form from t (impossible.walkerAt); footsteps are a Shepard marimba (one octave per lap) from the same step list.";
