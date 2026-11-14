// scene.config.js — 49-ink-wash: "a short journey" painted in brush and ink (style "ink-wash").
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// The painting is planned HERE with the style's pure planner (inkplan.js); BEATS, the camera shots, the captions and
// every swish / drip / press / flute / pluck in SCORE derive from that one plan. Paper coords: metres, +y away from camera.
import { STYLE_SPEC } from "./_atlas/styles/ink-wash/spec.js";
import { planInk, mountainShape, boatItems, sheetShot, unionBox, inkVoices, beatTones, toWorld } from "./_atlas/styles/ink-wash/inkplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, projectPoint, sampleCameraKeys } from "./_atlas/kit/framing.js";

export const ID = "49-ink-wash";
export const STYLE = "ink-wash";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the subject (all original, simple): two mountains, a boat on a river, a warm sun in a circle, one brushed word
const FAR = mountainShape({ x0: -1.22, x1: 0.24, base: 0.02, peak: [-0.5, 0.44], seed: 3, rough: 0.03, shoulder: 0.3 });
const NEAR = mountainShape({ x0: -0.62, x1: 1.38, base: -0.06, peak: [0.36, 0.66], seed: 8, rough: 0.042, shoulder: 0.42 });
const RIDGE = NEAR.ridge.filter((p, i, a) => i >= Math.round(a.length * 0.3) && i <= Math.round(a.length * 0.76));
const RIVER = (() => {
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, x = -1.3 + 2.66 * u, y = -0.28 - 0.06 * Math.sin(u * 3.1 + 0.4) - 0.03 * u;
    const hw = (0.03 + 0.05 * Math.sin(u * 2.3 + 1.1) ** 2) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.45) + 0.004;
    const wob = 0.012 * Math.sin(u * 23 + 1.3) + 0.008 * Math.sin(u * 51);
    top.push([x, y + hw + wob]); bot.push([x, y - hw * 0.8 + wob * 0.6]);
  }
  return [...top, ...bot.reverse()];
})();
const BOAT = boatItems({ c: [0.64, -0.29], len: 0.34, tone: 1.05, seed: 5, width: 0.05 }).slice(0, 2);
const SUN = [-1.04, 0.56];

export const PROGRAM = [
  // beat 1 — mountains: two washes laid top-down (graded, misty base), then one dry ridge line
  { id: "far", type: "wash", shape: FAR.shape, dir: -90, tone: 0.2, grade: [1, 0.75], mist: [0.42, 0.95], dur: 0.5, bloom: 0.028, edge: 0.55 },
  { id: "near", type: "wash", shape: NEAR.shape, dir: -90, tone: 0.44, grade: [1.05, 0.55], mist: [0.5, 1.0], dur: 0.6, bloom: 0.03, edge: 0.6 },
  { id: "ridge", type: "stroke", path: RIDGE, smooth: 0, profile: "sweep", width: 0.05, tone: 1.0, load: 0.66, speed: 1.8 },
  // beat 2 — the boat (black), then indigo: a river wash and a drop of deeper indigo into it while it is wet
  ...BOAT.map((b, i) => ({ ...b, speed: 1.3, ...(i ? {} : { dip: "ink" }) })),
  { id: "river", type: "wash", shape: RIVER, dir: 0, tone: 0.22, color: "indigo", grade: [0.8, 1.15], mist: [0.82, 1.02], dur: 0.5, bloom: 0.022, edge: 0.7, dip: "indigo" },
  { id: "drop", type: "bloom", c: [-0.42, -0.3], r: 0.13, color: "indigo", tone: 0.55, tau: 0.9, petals: 7, rim: 0.7, gap: 0.02 },
  // beat 3 — take vermilion, drop a warm sun; back to the ink stone for one open circle around it
  { id: "sun", type: "bloom", c: SUN, r: 0.14, color: "vermilion", tone: 0.85, tau: 0.8, petals: 9, rim: 0.45, dip: "vermilion" },
  { id: "enso", type: "circle", c: SUN, r: 0.23, a0: 205, sweep: 318, width: 0.06, tone: 1.0, profile: [[0, 0.95], [0.1, 1], [0.5, 0.75], [0.85, 0.5], [1, 0.3]], speed: 2.1, dip: "ink" },
  // beat 4 — one brushed word, then the seal
  { id: "word", type: "text", text: "GO", x: 0.42, y: -0.66, cap: 0.27, width: 0.17, tone: 1.0, align: "left", speed: 1.7 },
  { id: "seal", type: "seal", c: [1.18, -0.55], size: 0.1, color: "vermilion", gap: 0.0 },
  { id: "park", type: "park", gap: 0.05 },
];
export const PLAN = planInk(PROGRAM, STYLE_SPEC.plan);
const I = PLAN.byId;

// ---- beats (derived from the plan: retiming the program retimes the camera, captions and sound)
export const BEATS = [
  { id: "mountain", t: 0, dur: I.boatHull.start, label: "START WITH THE MOUNTAIN" },
  { id: "river", t: I.boatHull.start, dur: I.sun.start - I.boatHull.start, label: "LET THE RIVER CARRY YOU" },
  { id: "light", t: I.sun.start, dur: I.word.start - I.sun.start, label: "KEEP ONE WARM LIGHT" },
  { id: "go", t: I.word.start, dur: DURATION - I.word.start, label: "THEN SIMPLY GO" },
];
if (I.seal.end > DURATION - 1.3) throw new Error(`plan overruns: seal ends ${I.seal.end.toFixed(2)} s`);
const CAP = STYLE_SPEC.caption;
export const LABELS = BEATS.map((b, i) => ({ text: b.label, t0: b.t + (i ? 0.05 : 0.25), t1: i < BEATS.length - 1 ? BEATS[i + 1].t - CAP.lead : DURATION + 1 }));

// ---- camera: high three-quarter shots fitted to plan boxes, kept above the caption band (bottom-left)
const FOV = STYLE_SPEC.camera.fov;
// shot boxes reach down to empty paper so the bottom of frame (and the caption, bottom-left) is always on the sheet
const FILL = [-0.9, 0.9, -1.0, 0.88];
const shot = (box, o = {}) => sheetShot(box, { fov: FOV, elev: 1.02, bounds: FILL, anchor: "bottom", ...o });
const SHOTS = {
  open: shot([-1.5, -0.84, 1.5, 0.98], { elev: 1.2 }),
  mountain: shot([-1.32, -0.5, 1.42, 0.8], { elev: 1.18 }),
  river: shot([-1.38, -0.8, 1.38, 0.36], { elev: 1.15 }),
  light: shot([-1.42, -0.06, 0.08, 1.32], { elev: 1.02 }),
  go: shot([-0.5, -0.8, 1.44, 0.1], { elev: 1.12 }),
  end: shot([-1.5, -0.86, 1.5, 1.04], { elev: 1.2, bounds: [-0.96, 0.96, -1.0, 0.92] }),
};
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const key = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), ...s, ease });
export const CAMERA = [
  key(0, SHOTS.open),
  key(0.9, SHOTS.mountain),
  key(B.river.t - 0.2, SHOTS.mountain),
  key(B.river.t + 0.9, SHOTS.river),
  key(B.light.t - 0.1, SHOTS.river),
  key(B.light.t + 0.9, SHOTS.light),
  key(B.go.t - 0.15, SHOTS.light),
  key(B.go.t + 0.85, SHOTS.go),
  key(I.word.end + 0.15, SHOTS.go),
  key(Math.min(DURATION - 0.6, I.word.end + 1.55), SHOTS.end),
];

// framing gate: the subject of each beat stays inside the safe area at every sample, mid-move included
const BOXES = { mountain: unionBox([I.far.box, I.near.box]), river: unionBox([I.river.box, I.boatMast.box]), light: unionBox([I.sun.box, I.enso.box]), go: unionBox([I.word.box, I.seal.box]) };
const flat = (b) => boxCorners(toWorld(b[0], b[1], 0), toWorld(b[2], b[3], 0));
export const FRAMING = framingReport(BEATS.map((b) => ({ id: b.id, pts: flat(BOXES[b.id]), from: b.t + 1.0, to: b.t + b.dur - 0.3 })), CAMERA,
  { duration: DURATION, drift: STYLE_SPEC.camera.drift, fov: FOV, safe: 0.9 });
if (!FRAMING.ok) throw new Error(`framing: ${JSON.stringify(FRAMING.spans)}`);
// caption gate: the beat subject never sits under the caption box (bottom-left) while the caption shows
const capBox = [(CAP.x / 1920) * 2 - 1, ((CAP.x + 760) / 1920) * 2 - 1, 1 - ((CAP.y + CAP.h) / 1080) * 2, 1 - (CAP.y / 1080) * 2];
export const CAPTION_CLASH = [];
for (const b of BEATS) for (let t = b.t + 1.0; t <= b.t + b.dur - 0.3; t += 0.1) {
  const cam = sampleCameraKeys(CAMERA, t, { drift: STYLE_SPEC.camera.drift, fov: FOV });
  const xs = [], ys = [];
  for (const p of flat(BOXES[b.id])) { const [x, y] = projectPoint(cam, p); xs.push(x); ys.push(y); }
  const hit = Math.min(...xs) < capBox[1] && Math.max(...xs) > capBox[0] && Math.min(...ys) < capBox[3] && Math.max(...ys) > capBox[2];
  if (hit && b.id !== "mountain" && b.id !== "river") CAPTION_CLASH.push({ beat: b.id, t: +t.toFixed(2) });
}
if (CAPTION_CLASH.length) throw new Error(`caption clash: ${JSON.stringify(CAPTION_CLASH.slice(0, 4))}`);

export const OBJECTS = [
  {
    id: "painting", primitive: "procedural", factory: "painting",
    procedural: "3.0 x 1.7 m sheet of fibrous off-white paper with deckled edges on a charcoal felt mat; an ink layer re-rendered every frame from the ink-wash plan (washes, strokes with pressure/ink load/bleed/drying, wet-in-wet blooms, a seal) and absorbed by the paper shader; ink stone, ink stick, celadon water bowl with ripples, two colour dishes, porcelain brush rest, a bamboo brush posed from the plan, a soapstone seal block",
    dims: { plan: PLAN },
  },
];

// ---- SCORE: brush swishes / drips / presses from the plan, a flute tone + low pluck per beat, a quiet low bed
const SND = STYLE_SPEC.sound;
const pan = (e) => Math.max(-0.5, Math.min(0.5, (e.x ?? 0) * 0.25));
const FLUTE = [0, 4, 7, 2], PLUCK = [0, -5, 3, 0];
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: SND.bed.chord, attack: SND.bed.attack, release: SND.bed.release, brightness: SND.bed.brightness },
  ...BEATS.flatMap((b, i) => beatTones(b.t + (i ? 0 : 0.1), { note: FLUTE[i], pluckNote: PLUCK[i], flute: SND.flute, pluck: SND.pluck, seed: 600 + i * 10 })),
  ...scoreFromEvents(PLAN.events, inkVoices(SND), { pan, seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  items: PLAN.items.map((it) => ({ id: it.id, type: it.type, start: +it.start.toFixed(3), end: +it.end.toFixed(3) })),
  strokes: PLAN.strokes.length, washes: PLAN.washes.length, blots: PLAN.blots.length, end: +PLAN.end.toFixed(3),
  framing: { ok: FRAMING.ok, worst: FRAMING.worst },
  mechanism: "Ink = half-float texture re-rendered every frame from planInk(PROGRAM) and t (stroke ribbons, wash SDF quads, blots, seal) and absorbed by the paper shader; brush/seal/ripples posed from the same plan; SCORE = scoreFromEvents(PLAN.events, inkVoices()) + beatTones per BEATS entry.",
};
