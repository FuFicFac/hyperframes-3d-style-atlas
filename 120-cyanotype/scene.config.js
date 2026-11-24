// scene.config.js — 120-cyanotype: "Sunlight makes the print" — a sun print on sensitised paper (style "cyanotype").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The SAME plan gives the picture and the sound: a thud per landing, a pad that brightens while the
// sun is out, a whoosh per lift, pin clicks, a paper slide, the water slosh and a rising chime with the blue.
// World: the drawing board lies at the origin, the sheet (1.7 x 1.1 m) on it; the tray sits at x = 2.25. Seen from
// the front (+Z) and high above: -Z is up on screen.
import { STYLE_SPEC as S } from "./_atlas/styles/cyanotype/spec.js";
import { createPlan, fingerprint, fernFrond, keyOutline, featherOutline, laceLayout, placeLocal, bboxOf } from "./_atlas/styles/cyanotype/exposure.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "120-cyanotype";
export const STYLE = "cyanotype";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 120: times + labels verbatim)
export const BEATS = [
  { id: "lay", t: 0, dur: 2.6, label: "Lay things on the paper" },
  { id: "sun", t: 2.6, dur: 3.4, label: "Sunlight changes the paper" },
  { id: "less", t: 6.0, dur: 2.6, label: "Less time: a paler mark" },
  { id: "lift", t: 8.6, dur: 3.0, label: "Lift them: shadows stay" },
  { id: "rinse", t: 11.6, dur: 3.4, label: "Rinse: it turns deep blue" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// exactly one label at all times. At a beat change the old label ROLLS up and out of the plate while the new one rolls
// in from below (never two texts on top of each other), over S.caption.roll seconds centred on the beat start.
const ROLL = S.caption.roll;
export const labelAt = (t) => {
  let i = 0;
  while (i + 1 < BEATS.length && t >= BEATS[i + 1].t - ROLL / 2) i++;
  const b = BEATS[i];
  if (i > 0 && t < b.t + ROLL / 2) {
    const u = (t - (b.t - ROLL / 2)) / ROLL;
    return { a: BEATS[i - 1].label, b: b.label, u: Math.min(1, Math.max(0, u)) };
  }
  return { a: b.label, b: "", u: 0 };
};

// ---------------------------------------------------------------- the plan (exposure.js)
const yBoard = S.board.h + S.sheet.lift, yTray = S.tray.floor + S.sheet.lift;
export const PLAN = createPlan({
  duration: DURATION,
  // sun level: shade while things are laid; out at 2.75 s (bright by 3.35); goes in again as beat 4 starts
  sun: [[0, 0], [2.75, 0], [3.35, 1], [8.45, 1], [8.8, 0]],
  tau: S.print.tau,
  objects: [
    { id: "fern", ch: 0, pos: S.objects.fern.pos, rot: S.objects.fern.rot,
      drop: { t0: 0.05, dur: 0.55, from: [-1.05, 0.35, 0.12], spin: 0.45, tilt: 0.3, settle: 0.45, bounce: 0.008 },
      lift: { t0: 9.05, dur: 0.8, to: [-1.3, 0.4, -0.3], spin: -0.5 } },
    { id: "key", ch: 1, pos: S.objects.key.pos, rot: S.objects.key.rot,
      drop: { t0: 0.62, dur: 0.42, from: [0.15, 0.3, -0.75], spin: -0.8, tilt: 0.2, settle: 0.35, bounce: 0.006 },
      lift: { t0: 9.35, dur: 0.7, to: [0.25, 0.4, -1.0], spin: 0.6 } },
    { id: "feather", ch: 2, pos: S.objects.feather.pos, rot: S.objects.feather.rot,
      drop: { t0: 0.95, dur: 0.95, from: [1.1, 0.4, -0.25], spin: 0.6, kind: "glide", sway: 0.35, settle: 0.3, bounce: 0.003 },
      lift: { t0: 6.75, dur: 0.95, to: [1.15, 0.2, -0.12], spin: 0.6, kind: "flutter", leave: 0.2 } },
    { id: "lace", ch: 3, pos: S.objects.lace.pos, rot: S.objects.lace.rot,
      drop: { t0: 1.58, dur: 0.5, from: [0.25, 0.3, 0.6], spin: 0.3, tilt: 0.25, settle: 0.4, bounce: 0.006 },
      lift: { t0: 9.65, dur: 0.8, to: [0.6, 0.35, 0.9], spin: 0.2 } },
  ],
  pins: { t0: 11.66, step: 0.06, dur: 0.35, rise: 0.3, to: [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]] },
  slide: { t0: 11.95, dur: 0.85, dx: S.tray.x, rise: 0.1, y0: yBoard, y1: yTray },
  wash: { t0: 13.0, dur: 1.15, x0: -0.95, x1: 0.95 },
  chimes: [13.35, 13.9],
});
// The plan runs in Node (sound) and in the page (picture); its event times must agree. Recorded from this code in
// Node and headless Chrome; any other value fails here in BOTH environments instead of shipping picture != sound.
export const PLAN_HASH = "0cd040e1";
export const PLAN_HASH_NOW = fingerprint(PLAN);
if (typeof globalThis.window !== "undefined") globalThis.window.__cyanotypeHash = PLAN_HASH_NOW;
if (PLAN_HASH_NOW !== PLAN_HASH && !globalThis.process?.env?.CYANO_RECORD) {
  throw new Error(`120-cyanotype: plan hash ${PLAN_HASH_NOW} != recorded ${PLAN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

// ---------------------------------------------------------------- object footprints on the sheet (for framing)
const O = S.objects;
const shapes = {
  fern: (() => { const f = fernFrond(O.fern); return [f.rachis, ...f.pinnae.map((p) => p.poly)]; })(),
  key: [keyOutline(O.key).outer],
  // the print of the feather: vane + the rachis + a box around the downy barbs at the base (they print too)
  feather: [featherOutline(O.feather).vane, featherOutline(O.feather).rachis, [[0.02, -0.065], [0.16, -0.065], [0.16, 0.065], [0.02, 0.065]]],
  lace: (() => { const l = laceLayout(O.lace); return [[[0, 0], [l.w, 0], [l.w, l.h], [0, l.h]]]; })(),
};
/** world points of an object's silhouette (decimated), on the sheet at rest (dx = sheet offset) */
const footprint = (id, y, dx = 0) => shapes[id].flatMap((poly) => poly.filter((_, i) => i % 3 === 0).map((p) => { const [x, z] = placeLocal(O[id].pos, O[id].rot, p); return [x + dx, y, z]; }));
const featherPts = footprint("feather", yBoard);
const fb = bboxOf([featherPts.map(([x, , z]) => [x, z])]);

// ---------------------------------------------------------------- camera: one move per beat, still holds
const fov = S.camera.fov;
const W = S.sheet.w / 2, D = S.sheet.d / 2;
const sheetBox = (dx, y) => ({ box: [[dx - W, y, -D], [dx + W, y + 0.004, D]] });
const EL = 1.2;
const shot = (sub, o) => { const s = fitShot(sub, { fov, ...o }); return { pos: s.pos, target: s.target, fov }; };
// the wide: the sheet fills the frame height (its white paper border just inside), the board shows at the sides
const WIDE = shot(sheetBox(0, yBoard), { elevation: EL, azimuth: 0, fill: 1.0, window: { x0: -0.99, x1: 0.99, y0: -1.0, y1: 1.0 } });
// beat 3: push in toward the feather. The lace runs along the bottom of any close shot, so the push stops at ~1.5x and
// sits the feather right of centre: the caption (bottom left) then lies over open paper left of the lace's end.
const FEATHER = shot({ box: [[-0.6, yBoard, -0.26], [fb.maxX + 0.06, yBoard + 0.01, 0.4]] },
  { elevation: EL + 0.05, azimuth: 0, fill: 1.0, window: { x0: -1.0, x1: 1.0, y0: -1.0, y1: 1.0 } });
// beat 5: the print in the tray fills the frame
const TRAY = shot(sheetBox(S.tray.x, yTray), { elevation: EL + 0.04, azimuth: 0, fill: 1.0, window: { x0: -1.0, x1: 1.0, y0: -1.03, y1: 1.03 } });
// beat 5 transition: a pull-back that shows the board AND the tray, so the slide reads as "into the tray"
const MID = shot({ box: [[0.2, 0, -0.74], [S.tray.x + S.tray.w / 2 + 0.02, 0.1, 0.74]] }, { elevation: EL - 0.02, azimuth: 0, fill: 1.0, window: { x0: -0.99, x1: 0.99, y0: -0.99, y1: 0.99 } });
export const SHOTS = { WIDE, FEATHER, MID, TRAY };
export const CAMERA = [
  { t: 0, ...WIDE },
  { t: B.less.t, ...WIDE },
  { t: B.less.t + 0.85, ...FEATHER, ease: "inOutCubic" },
  { t: B.lift.t, ...FEATHER },
  { t: B.lift.t + 0.8, ...WIDE, ease: "inOutCubic" },
  { t: 12.1, ...WIDE },
  { t: 12.6, ...MID, ease: "inOutCubic" },
  { t: 13.1, ...TRAY, ease: "inOutCubic" },
  { t: DURATION, ...TRAY },
];

// ---------------------------------------------------------------- framing gate (camera replay; kit/framing.js)
const C = S.caption;
// the plate (drawn 6 px in from the overlay canvas corner) + its drop shadow, at its widest label
export const CAPTION_RECT = pxRect(C.x + 6, C.y + 6, C.plateW + 4, C.h + 8);
export const FRAMING = framingReport((t) => {
  const R = [];
  const coat = (dx, y) => ({ box: [[dx - W + S.sheet.coat.inset[0], y, -D + S.sheet.coat.inset[1]], [dx + W - S.sheet.coat.inset[0], y, D - S.sheet.coat.inset[1]]] });
  if (t < B.less.t || (t >= B.lift.t + 0.8 && t < 12.1)) {
    R.push({ id: "coat", ...coat(0, yBoard), keepOut: false });
    // the fern must be in frame; its stem end may pass under the caption (the caption keeps clear of key, feather, lace)
    if (t > 2.2) R.push({ id: "fern", pts: footprint("fern", yBoard), keepOut: false });
  }
  if (t >= B.less.t + 0.85 && t < B.lift.t) R.push({ id: "featherPrint", pts: featherPts });
  if (t >= 13.1) R.push({ id: "print", ...coat(S.tray.x, yTray), keepOut: false });
  // the key, the feather (print) and the lace (print) are never under the caption, in any shot or move, from the moment
  // they lie on the sheet (the sheet's slide into the tray included); being outside the frame is fine here
  if (t > 2.2) {
    const sl = PLAN.sheetAt(t), y = sl.y + 0.002;
    for (const id of ["key", "feather", "lace"]) R.push({ id: `${id}Clear`, pts: footprint(id, y, sl.x), window: { x0: -99, x1: 99, y0: -99, y1: 99 } });
  }
  return R;
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov, window: { x0: -1.0, x1: 1.0, y0: -1.0, y1: 1.0 }, keepOut: [{ id: "caption", ...CAPTION_RECT }] });
if (!FRAMING.ok && !globalThis.process?.env?.CYANO_NOGATE) {
  throw new Error(`120-cyanotype framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const pitchOf = { fern: 1.05, key: 1.55, feather: 1.2, lace: 0.85 };
const VOICES = {
  land: (e) => e.obj === "feather"
    ? [{ type: "rustle", dur: 0.35, density: 0.2, pitch: 1.3, gain: 0.16 }, { type: "thud", dur: 0.3, pitch: 1.6, gain: 0.12 }]
    : e.obj === "key"
      ? [{ type: "thud", dur: 0.35, pitch: pitchOf.key, gain: SND.land.gain * 0.8 }, { type: "clack", dur: 0.08, pitch: 1.8, gain: 0.16 }]
      : [{ type: "thud", dur: 0.4, pitch: pitchOf[e.obj], gain: SND.land.gain }, { type: "rustle", dur: 0.25, density: 0.3, pitch: 1.0, gain: 0.14 }],
  settle: (e) => [{ type: "tick", dur: 0.03, pitch: 1.2, gain: 0.1 }],
  lift: (e) => [{ type: "whoosh", dir: "out", dur: e.dur * 0.8, pitch: e.obj === "feather" ? 1.3 : 0.9, gain: SND.lift.gain * (e.obj === "feather" ? 0.8 : 1) }],
  sunOn: (e) => [{ type: "whoosh", dir: "in", dur: 1.4, pitch: 0.45, q: 0.7, gain: 0.18, offset: -0.6 }],
  sunOff: (e) => [{ type: "whoosh", dir: "out", dur: 0.9, pitch: 0.4, q: 0.7, gain: 0.12 }],
  pin: (e) => [{ type: "click", dur: 0.03, pitch: 1.3 + 0.1 * e.i, gain: SND.pin.gain }],
  slide: (e) => [{ type: "paper", dur: e.dur, density: 0.4, gain: SND.slide.gain }, { type: "whoosh", dir: "in", dur: e.dur, pitch: 0.7, gain: 0.14 }],
  tray: () => [{ type: "thud", dur: 0.3, pitch: 0.75, gain: 0.26 }],
  wash: (e) => [
    { type: "whoosh", dir: "in", dur: e.dur + 0.4, pitch: 0.35, q: 0.6, gain: SND.wash.gain },
    { type: "rustle", dur: e.dur, density: 0.22, pitch: 0.45, gain: 0.16, offset: 0.1 },
    ...[0.15, 0.4, 0.62, 0.85, 1.05].map((o, j) => ({ type: "bubble", dur: 0.1, pitch: 0.8 + 0.15 * j, gain: 0.12, offset: o })),
  ],
  chime: (e) => [{ type: "chime", dur: 1.8, pitch: e.i === 0 ? 1.0 : 1.5, gain: SND.chime.gain * (e.i === 0 ? 0.9 : 1) }],
};
export const EVENTS = PLAN.events;
const sunOn = EVENTS.find((e) => e.kind === "sunOn"), sunOff = EVENTS.find((e) => e.kind === "sunOff");
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: SND.bed.chord, brightness: SND.bed.brightness, attack: SND.bed.attack, release: SND.bed.release, seed: 7 },
  // the warm pad brightens with the dose: a brighter voicing swells in while the sun is out
  { t: sunOn.t, type: "pad", dur: sunOff.t + sunOff.dur - sunOn.t, gain: SND.sun.gain, root: SND.bed.root * 2, chord: [0, 4, 7, 11, 14], brightness: SND.sun.brightness, attack: 1.8, release: 0.9, seed: 9 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 120, pan: (e) => (e.kind === "pin" ? (e.i % 2 ? 0.4 : -0.4) : e.obj === "fern" ? -0.3 : e.obj === "lace" || e.obj === "feather" ? 0.25 : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "exposure.js: dose(p,t) = S(t) - sum_i mask_i(p) * (S(min(t,off_i)) - S(min(t,on_i))), S = closed-form integral of a piecewise-linear sun level; colour = table(k(dose), washed). Masks baked once from the same silhouettes as the meshes.",
  dose: `S full = ${PLAN.Sfull.toFixed(3)}, feather ghost k = ${PLAN.kAt("feather", DURATION).toFixed(3)}, open k at 6 s = ${PLAN.kAt(null, 6).toFixed(3)}`,
  planHash: PLAN_HASH_NOW,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  captionRect: CAPTION_RECT,
};
