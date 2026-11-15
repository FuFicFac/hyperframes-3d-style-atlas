// scene.config.js — 54-ferrofluid: "Invisible forces, visible" (style "ferrofluid").
// Plain data + the style's pure field plan (field.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The magnets' paths below drive BOTH the spikes in the picture and every hum
// swell, tick and plop in SCORE. Pool surface at y = 0; magnet y = height of its bottom face above the pool.
import { STYLE_SPEC as S } from "./_atlas/styles/ferrofluid/spec.js";
import { createField, fieldVoices } from "./_atlas/styles/ferrofluid/field.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "54-ferrofluid";
export const STYLE = "ferrofluid";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "calm", t: 0, dur: 3.0, label: "A pool of black liquid" },
  { id: "erupt", t: 3.0, dur: 3.4, label: "Bring a magnet close" },
  { id: "follow", t: 6.4, dur: 4.6, label: "It follows the field" },
  { id: "release", t: 11.0, dur: 4.0, label: "Invisible forces, visible" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.3), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the magnets (closed-form keyed paths)
const HIGH = 0.88, LOW = 0.42; // face height above the pool: far (no field) / close (full field)
export const MAGNETS = [
  {
    id: "A",
    keys: [
      { t: 0, pos: [0.0, HIGH, 0.0] },
      { t: at("erupt", 0.2), pos: [0.0, HIGH, 0.0] },
      { t: at("erupt", 2.0), pos: [0.0, LOW, 0.0], ease: "inOutCubic" },
      { t: at("follow", 0.2), pos: [0.0, LOW, 0.0] },
      { t: at("follow", 1.7), pos: [-0.44, LOW, 0.06], ease: "inOutSine" },
      { t: at("release", 0.25), pos: [-0.46, LOW + 0.01, 0.08], ease: "inOutSine" },
      { t: at("release", 2.0), pos: [-0.46, HIGH, 0.08], ease: "inOutSine" },
    ],
  },
  {
    id: "B",
    keys: [
      { t: 0, pos: [0.46, HIGH + 0.6, -0.06] },
      { t: at("follow", 1.6), pos: [0.46, HIGH + 0.6, -0.06] },
      { t: at("follow", 3.1), pos: [0.46, LOW, -0.06], ease: "inOutCubic" },
      { t: at("release", 0.5), pos: [0.46, LOW, -0.06] },
      { t: at("release", 2.3), pos: [0.46, HIGH, -0.06], ease: "inOutSine" },
    ],
  },
];
export const FIELD = createField(MAGNETS, S.field);

// ---------------------------------------------------------------- camera: low three-quarter macro; moves only with the fluid
export const CAMERA = [
  { t: 0, pos: [1.15, 1.08, 2.75], target: [0.0, 0.36, 0.0], fov: 30 },
  { t: at("erupt", 0.3), pos: [1.15, 1.08, 2.75], target: [0.0, 0.36, 0.0], fov: 30 },
  { t: at("erupt", 2.6), pos: [0.85, 0.72, 2.25], target: [0.0, 0.16, 0.0], fov: 30, ease: "inOutSine" },
  { t: at("follow", 0.2), pos: [0.85, 0.72, 2.25], target: [0.0, 0.16, 0.0], fov: 30 },
  { t: at("follow", 3.3), pos: [0.35, 0.8, 2.6], target: [0.0, 0.15, 0.0], fov: 30, ease: "inOutSine" },
  { t: at("release", 0.3), pos: [0.35, 0.8, 2.6], target: [0.0, 0.15, 0.0], fov: 30 },
  { t: at("release", 2.6), pos: [0.9, 0.95, 2.75], target: [0.0, 0.24, 0.0], fov: 30, ease: "inOutSine" },
  { t: DURATION, pos: [0.9, 0.95, 2.75], target: [0.0, 0.24, 0.0], fov: 30 },
];

// ---------------------------------------------------------------- framing gate (camera replay)
// Required: the crown(s) around every magnet with any field, and each magnet's body while it is low enough to act.
// The caption chip lives top-left; crowns must stay out of it.
const CAP = { id: "caption", x0: -0.9, x1: -0.2, y0: 0.7, y1: 0.95 };
function regions(t) {
  const out = [{ id: "pool", pts: boxCorners([-0.6, 0, -0.6], [0.6, 0.02, 0.6]) }];
  for (const m of FIELD.magnetsAt(t)) {
    if (m.s > 0.05) out.push({ id: `crown${m.id}`, pts: boxCorners([m.pos[0] - 0.25, 0, m.pos[2] - 0.25], [m.pos[0] + 0.25, 0.3, m.pos[2] + 0.25]) });
    if (m.s > 0.6) out.push({ id: `magnet${m.id}`, keepOut: false, pts: boxCorners([m.pos[0] - 0.09, m.pos[1], m.pos[2] - 0.09], [m.pos[0] + 0.09, m.pos[1] + 0.1, m.pos[2] + 0.09]) });
  }
  return out;
}
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.9, keepOut: [CAP] });
if (!FRAMING.ok && !globalThis.process?.env?.FERRO_NOGATE) {
  throw new Error(`54-ferrofluid framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [
  { id: "set", primitive: "procedural", factory: "set", procedural: "pale seamless bench sweeping up into a pale wall (kit cyclorama), floor at y = -0.12", dims: {} },
  { id: "dish", primitive: "procedural", factory: "dish", procedural: "glazed white ceramic dish, lathe profile, inner radius 1.04 m, rim top y = 0.035, foot on the bench", dims: {} },
];

// ---------------------------------------------------------------- SCORE: the field plan's events + a low bed
export const EVENTS = FIELD.events({ t0: 0, t1: DURATION, fps: 120, humStep: 0.4 });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 19], attack: 2.0, release: 2.5, brightness: S.sound.bed.brightness },
  ...scoreFromEvents(EVENTS, fieldVoices(S.sound), { seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "field.js: magnet strength = smoothstep of its face height above the pool; F(x,z) = sum s_m exp(-r^2/sigma^2). The shader reads the same magnets every frame; SCORE = the plan's erupt / tick / collapse / hum events.",
  events: EVENTS.filter((e) => e.kind !== "hum").map((e) => `${e.kind}:${e.id}@${e.t.toFixed(2)}`).join(" "),
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : "FAILS",
};
