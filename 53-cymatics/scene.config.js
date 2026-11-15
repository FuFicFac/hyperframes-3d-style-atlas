// scene.config.js — 53-cymatics: "Sound has a shape" — a Chladni plate (style "cymatics").
// Plain data + the style's pure grain planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every tone, hiss and lock chime in SCORE comes from the same mode list the sand reads.
// Plate = XZ square centred on the origin, plate coords x -> +X, y -> +Z (toward the viewer).
import { STYLE_SPEC as S } from "./_atlas/styles/cymatics/spec.js";
import { createPlan, chladniVoices } from "./_atlas/styles/cymatics/chladni.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect, prepareKeys, sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "53-cymatics";
export const STYLE = "cymatics";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (mode start times come from these)
export const BEATS = [
  { id: "plate", t: 0, dur: 3.0, label: "Sand on a metal plate" },
  { id: "note", t: 3.0, dur: 3.3, label: "Play one note" },
  { id: "raise", t: 6.3, dur: 5.1, label: "Raise the pitch" },
  { id: "shape", t: 11.4, dur: 3.6, label: "Sound has a shape" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the mode list (the one plan)
// Tones rise a perfect fifth each step (220 -> 330 -> 495 Hz); the readout shows exactly these numbers.
export const MODES = [
  { id: "diamond", m: 0, n: 2, sign: 1, t: B.note.t + 0.2, hz: 220 },
  { id: "ring", m: 2, n: 4, sign: 1, t: B.raise.t + 0.2, hz: 330 },
  { id: "flower", m: 2, n: 8, sign: 1, t: B.raise.t + 3.2, hz: 495 },
];
export const PLAN = createPlan({
  grains: S.sand.grains, seed: S.sand.seed, spread: S.sand.spread, margin: S.sand.margin, kick: S.sand.kick, mix: S.sand.mix,
  modes: MODES, move: S.move, straggle: S.straggle, hop: S.hopFeel, lockShare: S.lockShare, end: DURATION,
});

// ---------------------------------------------------------------- camera: locked three-quarter top-down, one lowering move
const PLATE = { box: [[-S.plate.size / 2, S.plate.y - 0.02, -S.plate.size / 2], [S.plate.size / 2, S.plate.y + 0.04, S.plate.size / 2]] };
const CHIPS = [
  { id: "caption", ...pxRect(S.caption.x - S.caption.maxW / 2, S.caption.y, S.caption.maxW, S.caption.h) },
  { id: "readout", ...pxRect(S.readout.x - 300, S.readout.y, 300, S.readout.h) },
];
const TOP = fitShot(PLATE, { elevation: 1.1, fov: S.camera.fov, window: { y1: 0.7, y0: -0.95 }, fill: 1.0, align: [0, 0] });
const LOW = fitShot(PLATE, { elevation: 0.86, fov: S.camera.fov, window: { y1: 0.7, y0: -0.94 }, fill: 1.0, align: [0, 0] });
export const CAMERA = [
  { t: 0, pos: TOP.pos, target: TOP.target, fov: S.camera.fov },
  { t: B.shape.t, pos: TOP.pos, target: TOP.target, fov: S.camera.fov },
  { t: B.shape.t + 2.0, pos: LOW.pos, target: LOW.target, fov: S.camera.fov, ease: "inOutSine" },
  { t: DURATION, pos: LOW.pos, target: LOW.target, fov: S.camera.fov },
];

// ---------------------------------------------------------------- framing gate: the whole plate in frame, clear of both chips
// framingReport tests the plate's screen BOX; the chips sit in the top corners beside the (perspective-narrowed) far
// edge, so the chip test below uses the projected plate QUAD instead (dense edge samples in the chip rects + chip
// corners in the quad).
export const FRAMING = framingReport(() => [{ id: "plate", box: PLATE.box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.97 },
});
const K = prepareKeys(CAMERA, { fov: S.camera.fov });
export const CHIP_CLEAR = (() => {
  const h = S.plate.size / 2, y = S.plate.y + 0.03, corners = [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]];
  const inRect = (p, r) => p[0] > r.x0 && p[0] < r.x1 && p[1] > r.y0 && p[1] < r.y1;
  const inQuad = (p, q) => { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); s += c > 0 ? 1 : -1; } return Math.abs(s) === 4; };
  const hits = [];
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, cam = sampleCameraKeys(K, t, { fov: S.camera.fov });
    const q = corners.map((c) => projectPoint(cam, c));
    for (const r of CHIPS) {
      let hit = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].some((p) => inQuad(p, q));
      for (let i = 0; i < 4 && !hit; i++) for (let k = 0; k <= 40; k++) {
        const a = q[i], b = q[(i + 1) % 4], u = k / 40;
        if (inRect([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], r)) { hit = true; break; }
      }
      if (hit) hits.push({ t, id: r.id });
    }
  }
  return { ok: hits.length === 0, hits: hits.slice(0, 4) };
})();
if ((!FRAMING.ok || !CHIP_CLEAR.ok) && !globalThis.process?.env?.CYM_NOGATE) {
  throw new Error(`53-cymatics framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), chips: CHIP_CLEAR })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, chladniVoices(S.sound), { seedBase: 131 });
export const DUCK = [];
export const NOTES = {
  mechanism: "chladni.js: w = cos(n pi x)cos(m pi y) + sign cos(m pi x)cos(n pi y); settled grain positions per mode by seeded Newton steps onto w = 0 plus spread; grain(t) = lerp(start_k, settled_k, outCubic(u)) + dance, hop = drive x |w| / 2 x |sin|.",
  grains: PLAN.n,
  modes: PLAN.modes.map((m) => ({ id: m.id, m: m.m, n: m.n, sign: m.sign, t: m.t, hz: m.hz, lockAt: m.lockAt })),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
  chips: CHIP_CLEAR,
  frequencies: "the readout shows exactly the tone frequencies SCORE plays (220, 330, 495 Hz); the plate is toy-scale, real plate modes depend on size and material",
};
