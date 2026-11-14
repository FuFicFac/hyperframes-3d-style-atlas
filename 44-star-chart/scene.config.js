// scene.config.js — 44-star-chart: "How a song comes together", told as two invented constellations on a planetarium dome.
// Plain data + the style's pure sky planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every star ping, line breath, figure shimmer, name bell, pointer swish, link riser and shooting-star
// streak in SCORE comes from the same plan the picture reads. Camera keys are FITTED to the constellations where the
// turning sky will have carried them, and the build fails if a required region leaves the frame or enters the caption band.
import { STYLE_SPEC as S } from "./_atlas/styles/star-chart/spec.js";
import { planSky, skyVoices, constellationPoints, linkPoints, fitShot, framingGate, altAz, toWorld, toAltAz } from "./_atlas/styles/star-chart/skyplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "44-star-chart";
export const STYLE = "star-chart";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats (one short label each)
export const BEATS = [
  { id: "sky", t: 0, dur: 3.2, label: "A sky of scattered parts" },
  { id: "drum", t: 3.2, dur: 3.5, label: "Rhythm: the Drum" },
  { id: "lyre", t: 6.7, dur: 3.5, label: "Melody: the Lyre" },
  { id: "link", t: 10.2, dur: 2.5, label: "Link them: a song" },
  { id: "whole", t: 12.7, dur: 2.3, label: "Many stars, one pattern" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, dt) => B[id].t + dt;
/** label windows: in with the beat, out 0.4 s before the next one (one at a time) */
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.12 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---- the plan: two original constellations (concept = constellation, part = star), one link, a pointer, shooting stars
export const PLAN = planSky(S, {
  constellations: [
    {
      id: "drum", name: "THE DRUM", centre: [-25, 31], at: at("drum", 1.6), scale: 11.5,
      stars: [
        { name: "Pulse", xy: [-1.02, 0.3], mag: 1.2, side: "l" },
        { name: "Tempo", xy: [0.0, 0.76], mag: 1.6 },
        { name: "Accent", xy: [1.02, 0.3], mag: 0.6 },
        { name: "Rest", xy: [0.62, -0.96], mag: 2.0 },
        { name: "Groove", xy: [-0.62, -0.96], mag: 1.9, side: "l" },
        { name: "Fill", xy: [1.27, 1.12], mag: 2.3 },
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 5]],
      light: at("drum", 0.25), step: 0.34,
      figure: "drum", figureAt: at("drum", 2.15), plateAt: at("drum", 2.45), plateXY: [0, -1.42],
    },
    {
      id: "lyre", name: "THE LYRE", centre: [22, 32], at: at("lyre", 1.6), scale: 11.5,
      stars: [
        { name: "Key", xy: [0.0, -0.85], mag: 0.9 },
        { name: "Verse", xy: [-0.62, -0.1], mag: 1.7, side: "l" },
        { name: "Hook", xy: [-0.86, 0.86], mag: 1.3, side: "l" },
        { name: "Chorus", xy: [0.86, 0.86], mag: 1.1 },
        { name: "Bridge", xy: [0.62, -0.1], mag: 1.9 },
      ],
      lines: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 3]],
      light: at("lyre", 0.25), step: 0.38,
      figure: "lyre", figureAt: at("lyre", 2.0), plateAt: at("lyre", 2.3), plateXY: [0, -1.4],
    },
  ],
  links: [{ a: [0, 2], b: [1, 1], at: at("link", 0.3), dur: 1.3 }],
  pointer: [
    { t: at("drum", 0.25), star: [0, 0] }, { t: at("drum", 0.59), star: [0, 1] }, { t: at("drum", 0.93), star: [0, 2] },
    { t: at("drum", 1.27), star: [0, 3] }, { t: at("drum", 1.61), star: [0, 4] }, { t: at("drum", 1.95), star: [0, 5] },
    { t: at("lyre", 0.25), star: [1, 0] }, { t: at("lyre", 0.63), star: [1, 1] }, { t: at("lyre", 1.01), star: [1, 2] },
    { t: at("lyre", 1.39), star: [1, 3] }, { t: at("lyre", 1.77), star: [1, 4] },
    { t: at("link", 0.3), link: 0, dur: 1.3 },
  ],
  pointerOff: at("link", 2.0),
  shooting: [
    { t: at("sky", 1.7), dur: 0.8, from: [-14, 50], to: [14, 38] },
    { t: at("whole", 0.6), dur: 0.7, from: [-6, 56], to: [-30, 47] },
  ],
  grid: { at: 0.2, dur: 2.2 },
  ecliptic: { at: 0.8, dur: 2.0 },
  finale: at("whole", 0.15),
});
const [DRUM, LYRE] = PLAN.constellations;

// ---- camera: the observer stands at the origin; shots are fitted to where the turning sky puts each region
const POS = [0, 0, 0];
const FOV = S.camera.fov;
const horizonAnchor = (az, t = 0) => [altAz(az, 3.2).map((v) => v * 100)];
const R = 100;
const pts = (ci, t, o) => constellationPoints(PLAN, ci, t, { R, ...o });
const azOf = (ci, t) => toAltAz(toWorld(S, PLAN.constellations[ci].frame.C, t)).az;
const fit = (points, o = {}) => fitShot(points, { pos: POS, x: [-0.8, 0.8], y: [-0.93, 0.82], minFov: 30, maxFov: 66, ...o });
const SHOTS = {
  open: { pos: POS, target: altAz(-2, 27).map((v) => v * 100), fov: 58 },
  open2: { pos: POS, target: altAz(-4, 26.5).map((v) => v * 100), fov: 55 },
  drum: fit([...pts(0, 5.0), ...horizonAnchor(azOf(0, 5.0))]),
  drum2: fit([...pts(0, 6.6), ...horizonAnchor(azOf(0, 6.6))]),
  lyre: fit([...pts(1, 8.6), ...horizonAnchor(azOf(1, 8.6))]),
  lyre2: fit([...pts(1, 10.1), ...horizonAnchor(azOf(1, 10.1))]),
  link: fit([...pts(0, 11.4, { figure: false }), ...pts(1, 11.4, { figure: false }), ...horizonAnchor(0)], { x: [-0.84, 0.84] }),
  link2: fit([...pts(0, 12.6, { figure: false }), ...pts(1, 12.6, { figure: false }), ...horizonAnchor(0)], { x: [-0.84, 0.84] }),
  wide: fit([...pts(0, 14.2), ...pts(1, 14.2), ...horizonAnchor(0)], { x: [-0.85, 0.85], y: [-0.94, 0.86] }),
  wide2: fit([...pts(0, 15), ...pts(1, 15), ...horizonAnchor(0)], { x: [-0.85, 0.85], y: [-0.94, 0.86] }),
};
const key = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), pos: s.pos, target: s.target.map((v) => +v.toFixed(4)), fov: s.fov, ease });
export const CAMERA = [
  key(0, SHOTS.open),
  key(at("drum", -0.35), SHOTS.open2),
  key(at("drum", 0.6), SHOTS.drum, "inOutCubic"),
  key(at("lyre", -0.2), SHOTS.drum2, "linear"),
  key(at("lyre", 0.75), SHOTS.lyre, "inOutCubic"),
  key(at("link", -0.45), SHOTS.lyre2, "linear"),
  key(at("link", 0.5), SHOTS.link, "inOutCubic"),
  key(at("whole", -0.1), SHOTS.link2, "linear"),
  key(at("whole", 1.1), SHOTS.wide, "inOutCubic"),
  key(DURATION, SHOTS.wide2, "linear"),
];

// ---- framing gate: what must be on screen, when (caption band at the bottom-left stays clear: y >= -0.6)
const REGIONS = (t) => {
  const out = [];
  if (t >= DRUM.stars[0].lit && t <= at("lyre", -0.2)) out.push({ id: "drum", pts: pts(0, t, { figure: t >= DRUM.figureAt, plate: t >= DRUM.plateAt }) });
  if (t >= LYRE.stars[0].lit && t <= at("link", -0.45)) out.push({ id: "lyre", pts: pts(1, t, { figure: t >= LYRE.figureAt, plate: t >= LYRE.plateAt }) });
  if (t >= at("link", 0.5) && t <= at("whole", 0)) out.push({ id: "link", pts: [...linkPoints(PLAN, 0, t, R), ...pts(0, t, { figure: false, plate: false }), ...pts(1, t, { figure: false, plate: false })] });
  if (t >= at("whole", 1.1)) out.push({ id: "whole", pts: [...pts(0, t), ...pts(1, t)] });
  return out;
};
export const FRAMING = framingGate(CAMERA, REGIONS, { duration: DURATION, fov: FOV, x: [-0.9, 0.9], y: [-0.6, 0.9] });
if (!FRAMING.ok) throw new Error(`44-star-chart framing gate failed: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---- SCORE: the sky plan + a bowed pad, a low dome hum
const panOf = (e) => {
  const d = e.kind === "star" ? PLAN.constellations[e.ci].stars[e.si].dir : e.ci != null ? PLAN.constellations[e.ci].frame.C : null;
  if (!d) return 0;
  return Math.max(-0.6, Math.min(0.6, toAltAz(toWorld(S, d, e.t)).az / 55));
};
const SN = S.sound;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SN.bed.gain, root: SN.bed.root, chord: SN.bed.chord, attack: 2.2, release: 2.0, brightness: SN.bed.brightness },
  { t: 0, type: "pad", dur: DURATION, gain: SN.dome.gain, root: SN.dome.root, chord: SN.dome.chord, attack: 1.0, release: 2.0, brightness: SN.dome.brightness, seed: 23 },
  { t: 0, type: "hum", dur: DURATION, gain: SN.hum.gain, seed: 77 },
  ...scoreFromEvents(PLAN.events, skyVoices(SN), { seedBase: 101, pan: panOf }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "skyplan.js turns an invented seeded sky about a pole (closed-form spin), places two original constellations authored in alt/az at their reveal times, and schedules every highlight, line, figure, name, pointer stop, link and shooting star; style.js only reads it.",
  framing: FRAMING.ok ? `ok (worst margin ${FRAMING.worst.over} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
  shots: Object.fromEntries(Object.entries(SHOTS).map(([k, s]) => [k, s.fov])),
  events: PLAN.events.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind })),
};
