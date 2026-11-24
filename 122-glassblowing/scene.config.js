// scene.config.js — 122-glassblowing: "Breath and fire" (style "glassblowing").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set the shape keys, the turning rate, the sag, the swing, the reheats, the tool moves and the
// camera; the picture (glass, jacks, pipe, bench light) and every sound cue read the same plan.
import { STYLE_SPEC as S } from "./_atlas/styles/glassblowing/spec.js";
import { createGatherPlan } from "./_atlas/styles/glassblowing/gather.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "122-glassblowing";
export const STYLE = "glassblowing";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "Breath and fire";

// ---------------------------------------------------------------- beats (storyboard: times + labels as written)
export const BEATS = [
  { id: "gather", t: 0, dur: 2.8, label: "Molten glass on a pipe" },
  { id: "breath", t: 2.8, dur: 3.2, label: "One breath: a bubble" },
  { id: "shape", t: 6.0, dur: 3.0, label: "Turn, swing, pinch" },
  { id: "lip", t: 9.0, dur: 3.0, label: "Reheat, then open the lip" },
  { id: "cool", t: 12.0, dur: 3.0, label: "As it cools, it clears" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b.t]));
export const LABELS = BEATS.map((b) => ({ text: b.label, on: b.t }));

// ---------------------------------------------------------------- the plan (every time below is an offset from a beat)
const T = {
  pause: [B.gather + 0.85, B.gather + 1.05, B.gather + 1.6, B.gather + 1.85], // turn slows, stops, starts, back to speed
  pulse: [B.breath + 0.15, B.breath + 0.95],                                    // breath travels down the pipe
  swell: [B.breath + 0.9, B.breath + 2.75],                                     // the bubble swells
  swing: [B.shape + 0.1, B.shape + 0.72, B.shape + 0.92, B.shape + 1.5],        // down, hold, back
  pinchIn: [B.shape + 1.25, B.shape + 1.75], pinchClose: [B.shape + 1.75, B.shape + 2.0],
  pinch: [B.shape + 1.85, B.shape + 2.75], pinchRelease: [B.shape + 2.7, B.shape + 2.85], pinchAway: [B.shape + 2.85, B.shape + 3.35],
  reheat: [B.lip, B.lip + 0.3],
  lipIn: [B.lip + 0.55, B.lip + 1.05], spread: [B.lip + 1.05, B.lip + 2.15], lipOut: [B.lip + 2.3, B.lip + 2.85],
  cool: B.cool + 0.15,
};
export const TIMES = T;
const pings = [0.75, 1.3, 1.85, 2.4].map((o, i) => ({ t: B.cool + o, kind: "ping", pitch: 1 + 0.12 * i, i }));
export const PLAN_CFG = {
  shape: [
    [0, "gather"], [T.swell[0], "gather"], [T.swell[1], "bubble", "inOutSine"],
    [T.swing[0], "bubble"], [T.swing[1] + 0.1, "drop", "inOutSine"], [T.pinch[0], "drop"],
    [T.pinch[1], "necked", "inOutSine"], [T.spread[0], "necked"], [T.spread[0] + 0.35, "pierced", "inOutSine"], [T.spread[1], "vase", "inOutSine"],
  ],
  spin: [[0, 0.55], [T.pause[0], 0.55], [T.pause[1], 0], [T.pause[2], 0], [T.pause[3], 0.55], [B.cool, 0.55], [B.cool + 0.6, 0.32], [DURATION, 0.32]],
  sag: [[0, 0], [T.pause[0] + 0.1, 0], [T.pause[2] + 0.05, 0.03, "inOutSine"], [T.pause[3], 0.03], [T.pause[3] + 0.65, 0, "outCubic"]],
  swing: [[0, 0], [T.swing[0], 0], [T.swing[1], -0.26, "inOutSine"], [T.swing[2], -0.26], [T.swing[3], 0, "inOutSine"]],
  flare: [[0, 1], [B.shape, 1], [B.shape + 0.15, 1.6, "outCubic"], [B.shape + 0.7, 1, "inOutSine"], [B.lip - 0.05, 1], [B.lip + 0.12, 3.2, "outCubic"], [B.lip + 0.85, 1, "inOutSine"]],
  heat: { reheats: [{ t: B.shape + 0.05, dur: 0.4, to: 0.95, tau: 13 }, { t: T.reheat[0], dur: T.reheat[1] - T.reheat[0], to: 1.13, tau: 7 }], cool: { t: T.cool } },
  pulse: { t0: T.pulse[0], t1: T.pulse[1], x0: -0.36, x1: -0.03 },
  jacks: {
    pinch: { x: 0.024, in: T.pinchIn, close: T.pinchClose, release: T.pinchRelease, away: T.pinchAway, lift: 0.42, tipZ: 0.075, openExtra: 0.05 },
    lip: { in: T.lipIn, spread: T.spread, out: T.lipOut, depth: 0.016, reach: 0.42 },
  },
  sound: {
    cues: [
      { t: T.pause[1] - 0.05, kind: "settle" },
      { t: T.pulse[0] - 0.05, kind: "breath", dur: T.pulse[1] - T.pulse[0] + 0.35 },
      { t: T.swell[0], kind: "swell", dur: T.swell[1] - T.swell[0] },
      { t: T.swing[0], kind: "swing", dur: T.swing[1] - T.swing[0] + 0.1 },
      { t: T.swing[2], kind: "swing", dur: T.swing[3] - T.swing[2] + 0.1, up: 1 },
      { t: T.pinchClose[1] - 0.05, kind: "tap", pitch: 1.0 },
      { t: T.pinchClose[1] + 0.33, kind: "tap", pitch: 1.15, soft: 1 },
      { t: T.pinchClose[1] + 0.66, kind: "tap", pitch: 1.3, soft: 1 },
      { t: T.reheat[0], kind: "reheat" },
      { t: T.lipIn[1] - 0.03, kind: "tap", pitch: 1.4 },
      { t: T.spread[0] + 0.05, kind: "scrape", dur: T.spread[1] - T.spread[0] - 0.1 },
      { t: T.lipOut[0], kind: "tap", pitch: 1.6, soft: 1 },
      ...pings,
    ],
  },
};
export const PLAN = createGatherPlan(S, PLAN_CFG);

// ---------------------------------------------------------------- camera: one move per beat (orbit keys around a target)
const H = S.set.pipeY, fov = S.camera.fov;
/** shot(target, dist, az, el): camera on a bearing (az 0 = +z looking -z; az < 0 = toward the pipe side), el above horizontal */
const shot = (target, dist, az, el) => [[target[0] + dist * Math.sin(az) * Math.cos(el), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(az) * Math.cos(el)], target];
const k = (t, s, ease) => ({ t, pos: s[0], target: s[1], fov, ...(ease ? { ease } : {}) });
export const SHOTS = {
  open: shot([0.05, H - 0.004, 0], 0.5, -0.12, 0.1),
  close: shot([0.055, H - 0.008, 0], 0.43, -0.1, 0.1),
  pipe: shot([-0.045, H - 0.008, 0], 0.52, -0.1, 0.1),
  bubble: shot([0.075, H - 0.006, 0], 0.55, -0.12, 0.1),
  swing: shot([0.07, H - 0.045, 0], 0.6, -0.3, 0.13),
  pinch: shot([0.06, H - 0.01, 0], 0.6, -0.62, 0.3),
  lip: shot([0.13, H - 0.006, 0], 0.62, 0.06, 0.1),
  cool: shot([0.185, H + 0.01, 0.02], 0.64, 0.0, 0.75),
};
export const CAMERA = [
  k(0, SHOTS.open),
  k(B.breath - 0.1, SHOTS.close, "inOutSine"),
  k(B.breath + 0.6, SHOTS.pipe, "inOutSine"),
  k(T.swell[0] + 0.1, SHOTS.pipe),
  k(T.swell[1], SHOTS.bubble, "inOutSine"),
  k(B.shape, SHOTS.bubble),
  k(B.shape + 0.75, SHOTS.swing, "inOutSine"),
  k(T.swing[3], SHOTS.swing),
  k(T.pinch[0], SHOTS.pinch, "inOutSine"),
  k(B.lip - 0.15, SHOTS.pinch),
  k(B.lip + 0.75, SHOTS.lip, "inOutSine"),
  k(B.cool, SHOTS.lip),
  k(B.cool + 1.3, SHOTS.cool, "inOutCubic"),
  k(DURATION, SHOTS.cool),
];

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from the plan's keys
const SND = S.sound;
const flareAt = (t) => PLAN.flareAt(t);
export const EVENTS = [
  // furnace roar: overlapping rumble segments, louder where the furnace flares
  ...Array.from({ length: Math.ceil(DURATION / SND.bed.hop) }, (_, i) => {
    const t = i * SND.bed.hop, tc = Math.min(DURATION, t + SND.bed.seg / 2);
    return { t, kind: "roar", dur: Math.min(SND.bed.seg, DURATION - t), level: Math.min(1.6, flareAt(tc)) };
  }).filter((e) => e.dur > 0.4),
  { t: 0, kind: "drone", dur: DURATION },
  ...PLAN.events(),
].sort((a, b) => a.t - b.t);
const VOICES = {
  roar: (e) => [{ type: "rumble", dur: e.dur, gain: SND.bed.gain * (0.75 + 0.25 * e.level), pitch: 0.8 + 0.08 * e.level }],
  drone: (e) => [{ type: "pad", dur: e.dur, root: SND.pad.root, chord: [0, 7, 12], attack: 0.6, release: 1.2, brightness: SND.pad.brightness, gain: SND.pad.gain }],
  settle: () => [{ type: "whoosh", dir: "out", dur: 0.6, q: 0.7, pitch: 0.45, gain: 0.12 }],
  breath: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 0.6, pitch: 0.5, gain: SND.breath.gain }],
  swell: (e) => [{ type: "servo", dur: e.dur, hz: 150, hz2: 330, grit: 0.05, gain: SND.swell.gain }],
  swing: (e) => [{ type: "whoosh", dir: e.up ? "out" : "in", dur: e.dur, q: 1.0, pitch: e.up ? 0.75 : 0.62, gain: SND.swing.gain }],
  tap: (e) => [{ type: "clack", pitch: 1.6 * e.pitch, gain: SND.tap.gain * (e.soft ? 0.55 : 1) }],
  scrape: (e) => [{ type: "penScratch", dur: e.dur, speed: 0.6, pitch: 0.55, gain: SND.scrape.gain }],
  reheat: () => [{ type: "whoosh", dir: "in", dur: 0.85, q: 0.5, pitch: 0.42, gain: SND.reheat.gain }, { type: "rumble", dur: 1.4, gain: SND.reheat.gain * 0.8, pitch: 1.1 }],
  ping: (e) => [{ type: "chime", dur: 1.3, notes: 2, sparkle: 0.2, pitch: 2.2 * e.pitch, gain: SND.ping.gain * (0.85 + 0.1 * e.i) }],
};
export const SCORE = scoreFromEvents(EVENTS, VOICES, { seedBase: 122 });
export const DUCK = [];

// ---------------------------------------------------------------- framing: glass box vs frame + caption plate, per beat
const CAP = pxRect(S.caption.right - S.caption.maxW, S.caption.y, S.caption.maxW, S.caption.h);
function glassPoints(t) {
  const E = PLAN.extent(t), sw = PLAN.swingAt(t), piv = S.set.rails[0].x;
  const pts = [];
  for (const x of [E.x0, (E.x0 + E.x1) / 2, E.x1]) for (const a of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const ang = (a * Math.PI) / 4, yl = E.r * Math.cos(ang) - E.sag * ((x - E.x0) / (E.x1 - E.x0)) ** 2, zl = E.r * Math.sin(ang);
    // pipe frame -> world: rotate about the pivot (z axis) by the swing angle
    const dx = x - piv, c = Math.cos(sw), s = Math.sin(sw);
    pts.push([piv + dx * c - yl * s, H + dx * s + yl * c, zl]);
  }
  return pts;
}
function frameCheck() {
  const fill = {}, capHit = {}, edge = {};
  for (let i = 0; i <= DURATION * 30; i++) {
    const t = i / 30, cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov });
    let y0 = 9, y1 = -9, x0 = 9, x1 = -9;
    for (const p of glassPoints(t)) {
      const [x, y] = projectPoint(cam, p);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    }
    const beat = BEATS.filter((b) => b.t <= t).pop().id;
    const f = (Math.min(1, y1) - Math.max(-1, y0)) / 2;
    fill[beat] = Math.min(fill[beat] ?? 9, +f.toFixed(3));
    const over = x1 > CAP.x0 && x0 < CAP.x1 && y1 > CAP.y0 && y0 < CAP.y1;
    if (over) capHit[beat] = (capHit[beat] ?? 0) + 1;
    const e = Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1));
    edge[beat] = Math.max(edge[beat] ?? 0, +e.toFixed(3));
  }
  return { glassHeightFillMin: fill, framesUnderCaption: capHit, maxNdc: edge };
}
export const FRAMING = frameCheck();

export const NOTES = {
  title: TITLE,
  mechanism: "gather.js: a closed profile loop (outer + rim + inner) blended point by point between five named keys, radii scaled by sqrt(V0/V) so the glass volume stays constant; temperature = exponential cooling with two reheats, then a drain from the tip inward; glow from a hot-body ramp; jacks gap derived from the profile at the contact.",
  plan: PLAN.stats,
  fingerprint: PLAN.fingerprint(),
  framing: FRAMING,
};
