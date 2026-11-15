// scene.config.js — 67-mosaic: a fish leaping over waves, set tile by tile in the "mosaic" style (opus vermiculatum).
// Plain data + the style's pure tile planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every click, scratch, glint and the grout rustle in SCORE come from the same tile plan the picture reads.
// Panel = 8 x 4.5 m on the XZ plane centred on the origin; panel x -> +X, panel y (picture up) -> -Z (away from camera).
import { STYLE_SPEC as S } from "./_atlas/styles/mosaic/spec.js";
import { planMosaic, fishAndWaves, mosaicVoices } from "./_atlas/styles/mosaic/tessera.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "67-mosaic";
export const STYLE = "mosaic";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every phase window comes from these)
export const BEATS = [
  { id: "sinopia", t: 0, dur: 2.8, label: "Red lines on wet plaster" },
  { id: "rows", t: 2.8, dur: 3.5, label: "Rows follow the outline" },
  { id: "gold", t: 6.3, dur: 4.2, label: "Gold glass catches light" },
  { id: "border", t: 10.5, dur: 2.1, label: "A border closes it in" },
  { id: "grout", t: 12.6, dur: 2.4, label: "Grout seals the picture" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const end = (id) => B[id].t + B[id].dur;
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the tile plan (the one schedule)
const PW = S.panel.width, PH = S.panel.height, p = S.tile.pitch;
export const PICTURE = fishAndWaves({ width: PW, height: PH, pitch: p, border: S.panel.border, palette: S.tesserae });
const FISH = ["back", "belly", "stripe", "tail", "dorsal", "ventral", "pectoral", "gill", "eye", "pupil"];
export const PLAN = planMosaic(PICTURE, {
  pitch: p, gap: S.tile.gap, seed: S.tile.seed, tiltGold: S.tile.tiltGold, tiltStone: S.tile.tiltStone, setDur: S.set.dur,
  phases: {
    outline: { t0: B.sinopia.t + 0.35, t1: end("sinopia") - 0.1, mode: "rows", anchor: [2.6, 0.6], spread: 0.03 },
    fill: { t0: B.rows.t, t1: B.rows.t + 2.5, mode: "rows", rowDur: 1.1, anchor: [2.6, 0.6] },
    sea: { t0: B.rows.t + 0.5, t1: end("rows") - 0.1, mode: "rows", rowDur: 1.7, anchor: [-4, -1.6] },
    gold: { t0: B.gold.t, t1: B.gold.t + 3.6, mode: "radial", from: [...FISH, "seaLight"], gamma: 0.9, along: 0.35, spread: 0.3 },
    border: { t0: B.border.t, t1: end("border") - 0.2, mode: "rows", rowDur: 1.5, anchor: [-4, 2.25] },
  },
  sinopia: { t0: 0.0, t1: 1.5 },
  sweep: { t0: B.gold.t + 1.7, t1: end("gold") + 0.1, x0: -10, x1: 10 },
  grout: { t0: B.grout.t - 0.1, t1: B.grout.t + 1.3 },
  binHz: 24,
});

// ---------------------------------------------------------------- camera: three still shots joined by three moves
const fov = S.camera.fov;
const box2 = (x0, y0, x1, y1, h = 0.05) => ({ box: [[x0, 0, -y1], [x1, h, -y0]] });     // panel rect -> world box
const PANEL = box2(-PW / 2 - S.panel.frame, -PH / 2 - S.panel.frame, PW / 2 + S.panel.frame, PH / 2 + S.panel.frame);
const CAP = pxRect(S.caption.x - S.caption.maxW / 2, S.caption.y, S.caption.maxW, S.caption.h);
const [[fx0, fy0], [fx1, fy1]] = PICTURE.fishBox;
const OPEN = fitShot(box2(fx0 - 0.1, fy0 - 0.25, fx1 + 0.1, fy1 + 0.05), { azimuth: -0.12, elevation: 0.98, fov, fill: 1.0, window: { y1: 0.78, y0: -0.97, x0: -0.97, x1: 0.97 } });
const RAKE = fitShot(box2(-2.9, -1.1, 2.9, 2.3), { azimuth: 0.18, elevation: 0.66, fov, fill: 1.0, window: { y1: 0.95, y0: -0.98, x0: -0.98, x1: 0.98 } });
const WIDE = fitShot(PANEL, { azimuth: 0, elevation: 1.22, fov, fill: 0.96, window: { y1: 0.8, y0: -0.96, x0: -0.96, x1: 0.96 } });
// sweep light: put it where the RAKE camera's mirror ray from the panel centre (picture y = 0.6) meets z = SWEEP_Z, so the
// specular band of flat tiles crosses the middle of the gold ground; tilted gold tiles then glint around that band.
const SWEEP_Z = -6.0, QZ = -0.6;
const SWEEP_H = +(RAKE.pos[1] * (QZ - SWEEP_Z) / (RAKE.pos[2] - QZ)).toFixed(3);
export const SWEEP = { z: SWEEP_Z, height: SWEEP_H };
export const CAMERA = [
  { t: 0, pos: OPEN.pos, target: OPEN.target, fov },
  { t: end("rows") - 0.2, pos: OPEN.pos, target: OPEN.target, fov },
  { t: B.gold.t + 1.3, pos: RAKE.pos, target: RAKE.target, fov, ease: "inOutSine" },
  { t: end("gold"), pos: RAKE.pos, target: RAKE.target, fov },
  { t: B.border.t + 2.2, pos: WIDE.pos, target: WIDE.target, fov, ease: "inOutSine" },
  { t: DURATION, pos: WIDE.pos, target: WIDE.target, fov },
];
// framing gate: the wide shot holds the whole panel inside the safe area
export const FRAMING = framingReport(
  (t) => (t >= B.border.t + 2.2 ? [{ id: "panel", box: PANEL.box }] : []),
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.97 },
);
if (!FRAMING.ok && !globalThis.process?.env?.MOS_NOGATE) throw new Error(`67-mosaic framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a bed + one whoosh per move
export const EVENTS = PLAN.events();
const SND = S.sound;
export const SCORE = [
  ...scoreFromEvents(EVENTS, mosaicVoices(SND), { seedBase: 167 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: DURATION, attack: 0.6, release: 1.5, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  { t: CAMERA[1].t, type: "whoosh", dir: "in", dur: CAMERA[2].t - CAMERA[1].t, gain: 0.22, seed: 5 },
  { t: CAMERA[3].t, type: "whoosh", dir: "out", dur: CAMERA[4].t - CAMERA[3].t, gain: 0.25, seed: 7 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "tessera.js: picture regions -> label grid -> exact EDT from every outline -> rows = iso-contours of the distance at (j + 0.5) x pitch (marching squares, chained, resampled at pitch) -> tiles; set times by phase (rows progressively from an anchor, or radial from the figure).",
  tiles: PLAN.stats,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  captionRect: CAP,
  sound: "one click per 1/24 s bin of tile landings (gain ~ sqrt(count), pitch by stone/glass/gold share); penScratch per sinopia line; chimes across the light sweep; rustle for the grout wipe; low pad bed.",
};
