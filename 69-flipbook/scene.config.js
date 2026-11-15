// scene.config.js — 69-flipbook: "Drawings come alive" — a pencil flipbook riffled under a thumb (style "flipbook").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every page-flip tick, slap and bounce note in SCORE comes from the same release plan the pages read.
// Pad: page 1.6 x 1.0 m centred on the origin, binding (clamp bar) along the far edge z = -0.5, pages fall toward +z.
import { STYLE_SPEC as S } from "./_atlas/styles/flipbook/spec.js";
import { createRiffle, events as riffleEvents, riffleVoices, bendPage } from "./_atlas/styles/flipbook/riffle.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "69-flipbook";
export const STYLE = "flipbook";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "draw", t: 0, dur: 2.4, label: "Draw one pose" },
  { id: "flip", t: 2.4, dur: 3.0, label: "Flip it, page by page" },
  { id: "riffle", t: 5.4, dur: 3.4, label: "12 drawings a second" },
  { id: "close", t: 8.8, dur: 3.4, label: "The lines come alive" },
  { id: "land", t: 12.2, dur: 2.8, label: "The last page lands" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the release plan (the one schedule)
// Slow page-by-page flips in "flip", a 1 s ramp to 12 pages/s in "riffle", 12/s through "close", easing off in "land".
export const PLAN = createRiffle({
  slow: [0.2, 0.9, 1.5, 2.0, 2.4, 2.75].map((d) => +(B.flip.t + d).toFixed(3)),
  rate: [[B.riffle.t, 4], [B.riffle.t + 1.0, 12], [B.land.t + 0.6, 12], [B.land.t + 1.4, 3]],
  stopAt: B.land.t + 1.5,
  flip: S.flip, bounce: S.bounce, held: S.held, fall: S.fall, pool: S.page.pool,
});

// ---------------------------------------------------------------- the opening pencil stroke (page 0's body outline)
export const PENCIL = { p0: 0.38, t0: 0.0, t1: 1.75, lift: [1.75, 2.15], out: [1.95, 2.75] };
export const PENCIL_STROKES = [{ t: 0.03, dur: 0.85 }, { t: 0.95, dur: 0.8 }];

// ---------------------------------------------------------------- camera
const W = S.page.width, D = S.page.depth, top = S.pad.board + S.pad.base + PLAN.n * S.page.thickness;
const PAGE = { box: [[-W / 2, 0.02, -D / 2], [W / 2, top + 0.01, D / 2]] };
// the held fan: bend one page in the held pose (Node-side, same function as the picture)
const fanPts = (() => {
  const nx = S.page.nx, ns = S.page.ns, out = new Float32Array(3 * (nx + 1) * (ns + 1));
  bendPage({ phi: S.held.phi0, kappa: S.held.free - S.held.phi0, twist: 0 }, { W, D, nx, ns, y0: top, z0: -D / 2 }, out);
  const pts = [];
  for (let i = 0; i < out.length; i += 3) pts.push([out[i], out[i + 1], out[i + 2]]);
  return pts;
})();
const WIDE_SUBJ = [...fanPts, [-W / 2, 0.02, D / 2], [W / 2, 0.02, D / 2]];
const OPEN = fitShot(PAGE, { elevation: 1.0, azimuth: 0, fov: S.camera.fov, window: { y0: -0.94, y1: 0.8 }, fill: 0.98 });
// wide shots frame the PAGE (not the whole fan): the page fills the lower frame, the fan rises into the top band
const WIDE_A = fitShot(PAGE, { elevation: 0.78, azimuth: -0.14, fov: S.camera.fov, window: { y0: -0.94, y1: 0.36, x0: -0.92, x1: 0.92 }, fill: 1.0 });
const WIDE_B = fitShot(PAGE, { elevation: 0.84, azimuth: 0.1, fov: S.camera.fov, window: { y0: -0.94, y1: 0.36, x0: -0.92, x1: 0.92 }, fill: 1.0 });
const CLOSE = fitShot(PAGE, { elevation: 1.36, azimuth: 0, fov: S.camera.fov, window: { x0: -1, x1: 1, y0: -1, y1: 1 }, fill: 0.93 });
const END = fitShot(PAGE, { elevation: 0.95, azimuth: -0.05, fov: S.camera.fov, window: { y0: -0.94, y1: 0.62, x0: -0.94, x1: 0.94 }, fill: 1.0 });
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov: S.camera.fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  key(0, OPEN),
  key(B.flip.t - 0.1, OPEN),
  key(B.flip.t + 1.1, WIDE_A, "inOutSine"),
  key(B.riffle.t, WIDE_A),
  key(B.close.t - 0.2, WIDE_B, "inOutSine"),
  { ...key(B.close.t + 1.0, CLOSE, "inOutCubic"), path: "arc" },
  key(B.land.t, CLOSE),
  { ...key(B.land.t + 1.5, END, "inOutCubic"), path: "arc" },
  key(DURATION, END),
];
export const SHOTS = { OPEN, WIDE_A, WIDE_B, CLOSE, END };

// ---------------------------------------------------------------- framing gate: the whole page always in frame
export const FRAMING = framingReport(() => [{ id: "page", box: PAGE.box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, window: { x0: -1, x1: 1, y0: -1, y1: 1 },
});
if (!FRAMING.ok && !globalThis.process?.env?.FLIP_NOGATE) {
  throw new Error(`69-flipbook framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a warm bed + two camera whooshes
export const EVENTS = riffleEvents(PLAN, { pencil: PENCIL_STROKES });
const SND = S.sound;
export const SCORE = [
  ...scoreFromEvents(EVENTS, riffleVoices(SND), { seedBase: 169 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12, 16], dur: DURATION, attack: 0.8, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  { t: B.close.t - 0.2, type: "whoosh", dir: "in", dur: 1.1, q: 0.9, pitch: 0.8, gain: 0.14, seed: 5 },
  { t: B.land.t + 0.1, type: "whoosh", dir: "out", dur: 1.2, q: 0.9, pitch: 0.7, gain: 0.12, seed: 7 },
  { t: PLAN.pages[PLAN.n - 1].land, type: "thud", dur: 0.4, pitch: 1.4, gain: 0.3, seed: 9 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "riffle.js: release times = explicit slow flips + integrated rate curve; pageState(k,t) = held fan / fall (hinge angle, bend, twist) / bounce / flat; bendPage integrates the angle along each page; drawingFor(k) = the ball->bird story at drawing k with page-seeded line boil.",
  pages: PLAN.n,
  maxVisibleDrawings: PLAN.maxDrawn,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
  rate: "the riffle runs at 12 pages (drawings) per second — the plan's own number, shown in the label",
};
