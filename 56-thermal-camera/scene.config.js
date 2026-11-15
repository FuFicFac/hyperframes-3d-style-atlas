// scene.config.js — 56-thermal-camera: "Work shows up as heat" — a desk seen through a thermal imager (style "thermal-camera").
// Plain data + the style's pure heat planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every source switch, the hand's contact and the spot readings come from BEATS; SCORE comes from
// the same plan's events. Temperatures are INVENTED (SAMPLE DATA tag on screen the whole time).
import { STYLE_SPEC as S } from "./_atlas/styles/thermal-camera/spec.js";
import { createHeatPlan, towerPoints } from "./_atlas/styles/thermal-camera/heat.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, prepareKeys, sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "56-thermal-camera";
export const STYLE = "thermal-camera";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "same", t: 0, dur: 3.2, label: "Everything looks the same" },
  { id: "work", t: 3.2, dur: 3.9, label: "Work shows up as heat" },
  { id: "touch", t: 7.1, dur: 4.3, label: "Heat remembers a touch" },
  { id: "fade", t: 11.4, dur: 3.6, label: "Then it fades" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- where things are (from the spec) and the shots
const ST = S.set, TP = towerPoints(ST.tower), M = ST.monitor;
export const PRINT_AT = [0.46, 0.25];                                     // where the hand presses (desk x, z)
const POINTS = {
  monitor: [M.x, M.lift + M.h / 2, M.z + M.t / 2 + 0.002],
  fins: TP.world.fins,
  print: [PRINT_AT[0], 0, PRINT_AT[1]],
};
const MOVE = { work: [B.work.t + 0.15, B.work.t + 1.35], touch: [B.touch.t, B.touch.t + 1.0], fade: [B.fade.t + 0.1, B.fade.t + 1.5] };
// camera = the crosshair: every key's target is the spot being read (no drift)
const shot = (p, dist, el, az) => ({ pos: [+(p[0] + dist * Math.sin(az) * Math.cos(el)).toFixed(4), +(p[1] + dist * Math.sin(el)).toFixed(4), +(p[2] + dist * Math.cos(az) * Math.cos(el)).toFixed(4)], target: p });
// subjects of each shot (framing gate regions too)
const T = ST.tower;
const towerBox = [[T.x - T.len / 2, 0, T.z - T.thick / 2], [T.x + T.len / 2, T.h + 0.02, T.z + T.thick / 2]];
const setBox = [[T.x - T.len / 2, 0, -0.3], [ST.mug.x + ST.mug.r, M.lift + M.h, 0.2]];
const printBox = [[PRINT_AT[0] - 0.2, 0, PRINT_AT[1] - 0.2], [PRINT_AT[0] + 0.14, 0.02, PRINT_AT[1] + 0.12]];
const WINDOW = { x0: -0.9, x1: 0.76, y0: -0.9, y1: 0.78 };
// nearest distance (1 cm steps) at which the subject box sits inside the window with `fill` margin, target kept on the spot
function fit(p, box, el, az, fill = 0.94) {
  const pts = boxCorners(...box);
  const win = { x0: WINDOW.x0 * fill, x1: WINDOW.x1 * fill, y0: WINDOW.y0 * fill, y1: WINDOW.y1 * fill };
  for (let d = 0.4; d < 6; d += 0.01) {
    const k = shot(p, d, el, az);
    const cam = sampleCameraKeys(prepareKeys([{ t: 0, ...k, fov: S.camera.fov }], { fov: S.camera.fov }), 0, { fov: S.camera.fov });
    if (pts.every((q) => { const [x, y, z] = projectPoint(cam, q); return z > 0 && x >= win.x0 && x <= win.x1 && y >= win.y0 && y <= win.y1; })) return k;
  }
  return shot(p, 6, el, az);
}
const WIDE = fit(POINTS.monitor, setBox, 0.4, 0.12);
const WIDE_END = fit(POINTS.monitor, setBox, 0.44, 0.08);
const SINK = fit(POINTS.fins, towerBox, 0.24, 0.26);
const PRINT = fit(POINTS.print, printBox, 0.66, 0.16, 0.94);
export const CAMERA = [
  { t: 0, ...fit(POINTS.monitor, setBox, 0.4, 0.12, 0.97), fov: 34 },
  { t: MOVE.work[0], ...WIDE, fov: 34, ease: "outSine" },
  { t: MOVE.work[1], ...SINK, fov: 34, ease: "inOutCubic" },
  { t: MOVE.touch[0], ...SINK, fov: 34 },
  { t: MOVE.touch[1], ...PRINT, fov: 34, ease: "inOutCubic" },
  { t: MOVE.fade[0], ...PRINT, fov: 34 },
  { t: MOVE.fade[1], ...WIDE_END, fov: 34, ease: "inOutCubic" },
  { t: DURATION, ...WIDE_END, fov: 34 },
];

// ---------------------------------------------------------------- the heat plan
const on = B.work.t + 0.35, off = B.fade.t + 0.25;
const P0 = PRINT_AT, ht = S.hand.palm.t * S.hand.scale / 2;               // palm centre height when pressed
const contact = [B.touch.t + 1.3, B.touch.t + 2.3];
const fy = S.hand.yaw, away = [Math.sin(fy) * 0.62 + 0.18, 0.42, Math.cos(fy) * 0.62];   // enter/exit along the arm
export const PLAN = createHeatPlan(S, {
  sources: {
    cpu: { on, off },
    gpu: { on: on + 0.45, off },
    display: { on: on - 0.05, off: off + 0.05 },
    shell: { on, off },
    fan: { on: on + 0.3, off },
  },
  hand: {
    at: P0,
    show: [B.touch.t + 0.35, B.touch.t + 3.4],
    contact,
    keys: [
      { t: B.touch.t + 0.35, pos: [P0[0] + away[0], away[1], P0[1] + away[2]] },
      { t: contact[0] - 0.28, pos: [P0[0], 0.05, P0[1]], ease: "outCubic" },
      { t: contact[0], pos: [P0[0], ht, P0[1]], ease: "inQuad" },
      { t: contact[1], pos: [P0[0], ht, P0[1]] },
      { t: contact[1] + 0.35, pos: [P0[0], 0.07, P0[1]], ease: "outQuad" },
      { t: B.touch.t + 3.4, pos: [P0[0] + away[0], away[1], P0[1] + away[2]], ease: "inCubic" },
    ],
  },
  plume: { at: [TP.world.top[0], TP.world.top[1] + 0.02, TP.world.top[2]] },
  spots: [
    { id: "monitor", from: 0, to: MOVE.work[0], kind: "part", part: "screen", s: M.h / 2 - 0.015, standby: S.heat.standby.monitor, point: POINTS.monitor },
    { id: "fins", from: MOVE.work[1], to: MOVE.touch[0], kind: "part", part: "sink", s: Math.hypot(...TP.fins.map((v, k) => v - TP.base[k])), standby: S.heat.standby.tower, point: POINTS.fins },
    { id: "print", from: MOVE.touch[1], to: MOVE.fade[0], kind: "desk", point: POINTS.print },
    { id: "monitor", from: MOVE.fade[1], to: DURATION + 1, kind: "part", part: "screen", s: M.h / 2 - 0.015, standby: S.heat.standby.monitor, point: POINTS.monitor },
  ],
});

// ---------------------------------------------------------------- framing gate (subject of each shot inside the window)
// The window keeps clear of the scale bar (right) and the caption (top-left) on the overlay.
function regions(t) {
  if (t < MOVE.work[0] || t > MOVE.fade[1]) return [{ id: "set", pts: boxCorners(...setBox) }];
  if (t >= MOVE.work[1] && t <= MOVE.touch[0]) return [{ id: "tower", pts: boxCorners(...towerBox) }];
  if (t >= MOVE.touch[1] && t <= MOVE.fade[0]) return [{ id: "print", pts: boxCorners(...printBox) }];
  return [];
}
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, window: WINDOW });
if (!FRAMING.ok && globalThis.process?.versions?.node && !globalThis.process.env.THERMAL_NOGATE) { // Node only: render-sfx fails the build
  throw new Error(`56-thermal-camera framing: ${JSON.stringify(FRAMING.spans?.slice(0, 6) ?? FRAMING.fails?.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + imager beeps + a dark bed
const SN = S.sound;
export const EVENTS = [
  ...PLAN.events(),
  ...LABELS.map((L, i) => ({ t: L.on, kind: "beep", i })),
];
const voices = {
  spin: () => [{ type: "servo", gain: SN.spin.gain, hz: SN.spin.hz, hz2: SN.spin.hz2, dur: 1.3 }],
  fan: (e) => [{ type: "whir", gain: SN.fan.gain, hz: SN.fan.hz, hz2: SN.fan.hz * 1.04, dur: e.dur }],
  down: () => [{ type: "servo", gain: SN.down.gain, hz: SN.down.hz, hz2: SN.down.hz2, dur: 1.8 }],
  display: () => [{ type: "blip", gain: SN.beep.gain * 0.8, notes: [0, 7], pitch: 0.5 }],
  touch: () => [{ type: "thud", gain: SN.touch.gain, pitch: SN.touch.pitch, dur: 0.35 }],
  lift: () => [{ type: "paper", gain: SN.lift.gain, dur: 0.4 }],
  beep: () => [{ type: "blip", gain: SN.beep.gain, notes: SN.beep.notes }],
};
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SN.bed.gain, root: SN.bed.root, chord: [0, 7, 12, 15], attack: 1.6, release: 2.2, brightness: SN.bed.brightness },
  ...scoreFromEvents(EVENTS, voices, { seedBase: 211 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "heat.js: T(part, s, t) = ambient + dT * level(src, t) * exp(-s/lambda) * (1 - smoothstep(R-w, R+w, s)), R = k*sqrt(t - on); level = 1 - exp(-(t-on)/up), then exp(-(t-off)/down). Handprint = amp(t) * (1 - smoothstep(-w, w, sdf)), w = w0 + spread*sqrt(age).",
  sources: PLAN.src,
  contact,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
  sampleData: "every temperature on screen is invented (SAMPLE DATA tag)",
};
