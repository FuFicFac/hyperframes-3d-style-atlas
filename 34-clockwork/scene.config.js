// scene.config.js — 34-clockwork: "one small part paces the whole" inside a mechanical movement.
// Plain data + the planner (styles/clockwork/train.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The escapement plan gives every tick; the train gives every arbor's angle from the
// escape wheel through real tooth ratios; the cam plan gives the bell stroke. SCORE is generated from the same plans.
// Units: metres, Y-up, radians, seconds, sRGB hex. Main plate = XY plane at z = 0 facing +Z (toward the camera).
import { STYLE_SPEC as S } from "./_atlas/styles/clockwork/spec.js";
import { escapement, escapementLayout, planTrain, camFollower, alignCamPhase } from "./_atlas/styles/clockwork/train.js";

export const ID = "34-clockwork";
export const STYLE = "clockwork";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "pace", t: 0.2, dur: 3.4 },    // balance + escapement: every beat is a tick
  { id: "ratio", t: 3.8, dur: 3.6 },   // escape pinion (8) drives the fourth wheel (32): 4 : 1
  { id: "strike", t: 7.6, dur: 3.6 },  // the cam drops the lever, the hammer strikes the bell
  { id: "whole", t: 11.4, dur: 3.6 },  // wide: the whole train ticking together
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

export const CAPTIONS = [
  { text: "ONE BALANCE PACES IT ALL", in: at("pace", 0.3), out: at("pace", 3.25) },
  { text: "TEETH SET THE RATIO · 4:1", in: at("ratio", 0.45), out: at("ratio", 3.4) },
  { text: "A CAM RINGS THE BELL", in: at("strike", 0.35), out: at("strike", 3.4) },
  { text: "ONE TICK MOVES THEM ALL", in: at("whole", 0.6), out: DURATION + 1 },
];

// ---------------------------------------------------------------- the movement (planner)
const m = S.geometry.module;
export const ESC = { center: [1.69, 0.0], teeth: 15, rTip: 0.6, rRoot: 0.47, axisDeg: 20, pivotDist: 0.85 };
export const LAYOUT = escapementLayout({ center: ESC.center, teeth: ESC.teeth, rTip: ESC.rTip, axisDeg: ESC.axisDeg, pivotDist: ESC.pivotDist, lock: 0.13 });
export const OSC = { period: 1.0, t0: 0.25, amplitude: 2.2, pinAngle: 0.3, lift: 0.12 };
const esc = escapement({ teeth: ESC.teeth, theta0: LAYOUT.theta0, ...OSC });
export const ESCAPEMENT = esc;
// fork + roller: the fork tip moves lift·L, the impulse pin pinAngle·pinR — equal, so the pin stays in the notch
export const FORK = { length: 0.75 };
export const PIN_R = (FORK.length * OSC.lift) / OSC.pinAngle;
const ax = (ESC.axisDeg * Math.PI) / 180, u = [Math.cos(ax), Math.sin(ax)];
export const FORK_TIP = [LAYOUT.pivot[0] + u[0] * FORK.length, LAYOUT.pivot[1] + u[1] * FORK.length];
// escape wheel, anchor and roller sit LOW (z ≈ .27), under the fourth wheel's plane, so the 8-leaf escape pinion meshing
// the 32-tooth fourth wheel is in plain view from the front
export const ESC_Z = 0.27;
export const BALANCE = { center: [FORK_TIP[0] + u[0] * PIN_R, FORK_TIP[1] + u[1] * PIN_R], r: 0.85, z: 0.95, rollerZ: ESC_Z, pinDir: ax + Math.PI };

export const TRAIN = planTrain({
  module: m,
  driver: esc.wheel,
  arbors: [
    { id: "escape", pos: ESC.center },
    { id: "fourth", mesh: { with: "escape", theirs: 8, mine: 32, dirDeg: 160 } },
    { id: "third", mesh: { with: "fourth", theirs: 8, mine: 36, dirDeg: 215 } },
    { id: "second", mesh: { with: "third", theirs: 8, mine: 48, dirDeg: 150 } },
    { id: "barrel", mesh: { with: "second", theirs: 10, mine: 60, dirDeg: 200 } },
  ],
});
const A = TRAIN.arbors;
// what each arbor carries (z = bottom of each part above the plate)
export const WHEELS = {
  escape: { pinion: { leaves: 8, z0: 0.44, z1: 0.58 }, arbor: { z0: 0, z1: 0.72 } },
  fourth: { wheel: { teeth: 32, z: 0.48, spokes: 4 }, pinion: { leaves: 8, z0: 0.32, z1: 0.46 }, arbor: { z0: 0, z1: 0.72 } },
  third: { wheel: { teeth: 36, z: 0.36, spokes: 5 }, pinion: { leaves: 8, z0: 0.2, z1: 0.34 }, arbor: { z0: 0, z1: 0.72 } },
  second: { wheel: { teeth: 48, z: 0.24, spokes: 5 }, pinion: { leaves: 10, z0: 0.06, z1: 0.2 }, arbor: { z0: 0, z1: 0.45 } },
};
export const BARREL = { teeth: 60, z: 0.05, height: 0.3, ratchetZ: 0.57 };
export const RATIO = { driver: "escape", driven: "fourth", text: "4:1", value: Math.abs(1 / TRAIN.ratio("escape", "fourth")) }; // = 32 / 8

// ---------------------------------------------------------------- strike work: cam on the fourth arbor, lever, hammer, bell
export const CAM = { lobes: 6, rMin: 0.18, rMax: 0.37, rise: 0.97, z: 0.9, thickness: 0.06, contactDeg: 180 };
CAM.phase = alignCamPhase({ train: TRAIN, arbor: "fourth", contactDeg: CAM.contactDeg, esc, target: at("strike", 2.0) });
export const FOLLOW = camFollower({ train: TRAIN, arbor: "fourth", cam: CAM, contactDeg: CAM.contactDeg, phase: CAM.phase, esc, t0: 0, t1: DURATION });
const C4 = A.fourth.pos, gam = (CAM.contactDeg * Math.PI) / 180;
export const nosePoint = (r) => [C4[0] + r * Math.cos(gam), C4[1] + r * Math.sin(gam)];
export const LEVER = { pivot: [nosePoint(CAM.rMin)[0] + 0.12, C4[1] - 0.82], hammer: null, z: 0.96, headR: 0.09 };
LEVER.nose = nosePoint(CAM.rMin);
LEVER.hammer = [LEVER.pivot[0] + 0.42, LEVER.pivot[1] - 0.8];
const ang = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]);
/** lever angle for a follower radius r (0 at r = rMin, the pose the lever is built in) */
export const leverAngle = (r) => ang(LEVER.pivot, nosePoint(r)) - ang(LEVER.pivot, LEVER.nose);
// bell: placed so the hammer head just touches its rim when the follower is at rMin (the strike)
{
  const hv = [LEVER.hammer[0] - LEVER.pivot[0], LEVER.hammer[1] - LEVER.pivot[1]];
  const dropSign = Math.sign(leverAngle(CAM.rMin) - leverAngle(CAM.rMax)); // rotation direction of the fall
  const dir = [-hv[1] * dropSign, hv[0] * dropSign], dl = Math.hypot(...dir);
  LEVER.bellDir = [dir[0] / dl, dir[1] / dl];
}
export const BELL = { r: 0.34, h: 0.46, z: 0.94 };
// the bell lies in the plate plane (crown up): the hammer meets its flank just above the lip, so the mouth centre sits
// one lip radius (+ head radius) along the strike direction, lowered a touch so the contact is above the lip
BELL.center = [LEVER.hammer[0] + LEVER.bellDir[0] * (BELL.r * 0.97 + LEVER.headR + 0.004), LEVER.hammer[1] + LEVER.bellDir[1] * (BELL.r * 0.97 + LEVER.headR + 0.004) - 0.06];
export const STRIKE_BRIDGE = { path: [[-0.5, -1.45], LEVER.pivot], z: 0.84 };

// ---------------------------------------------------------------- plate, bridges, engraving
export const PLATE = { w: 10.2, h: 5.9, center: [0, -0.15] };
export const BRIDGES = [
  { id: "barrel", path: [[-4.35, -1.45], A.barrel.pos, A.second.pos, [-0.6, 1.62]], z: 0.45, width: 0.3, jewels: [A.second.pos], screws: [[-4.35, -1.45], [-0.6, 1.62]], text: "MAINSPRING", seg: 1, seed: 2 },
  { id: "train", path: [[-0.95, -1.2], A.third.pos, A.fourth.pos, [0.9, 1.38]], z: 0.72, width: 0.3, jewels: [A.third.pos], screws: [[-0.95, -1.2], [0.9, 1.38]], text: "GEAR TRAIN", seg: 0, seed: 3 },
  { id: "escape", path: [A.escape.pos, [1.95, -0.92]], z: 0.72, width: 0.24, jewels: [A.escape.pos], screws: [[1.95, -0.92]], seed: 7 },
  { id: "pallet", path: [LAYOUT.pivot, [2.66, -0.74]], z: 0.72, width: 0.22, jewels: [LAYOUT.pivot], screws: [[2.66, -0.74]], seed: 4 },
  { id: "cock", path: [BALANCE.center, [4.5, 1.95]], z: 1.15, width: 0.3, jewels: [BALANCE.center], screws: [[4.5, 1.95]], text: "BALANCE", seg: 0, seed: 5 },
  { id: "strike", path: STRIKE_BRIDGE.path, z: STRIKE_BRIDGE.z, width: 0.22, jewels: [], screws: [STRIKE_BRIDGE.path[0]], seed: 6 },
];
for (const b of BRIDGES) {
  if (!b.text) continue;
  const p = b.path[b.seg], q = b.path[b.seg + 1];
  let a = Math.atan2(q[1] - p[1], q[0] - p[0]);
  if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
  b.textAt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  b.textAngle = a;
  b.textSize = 0.095;
}
export const PLATE_JEWELS = [A.barrel.pos, A.second.pos, A.third.pos, A.fourth.pos, A.escape.pos, LAYOUT.pivot, BALANCE.center];

// ---------------------------------------------------------------- camera: macro dollies, one wide pull-back
const key = (t, tg, off, ease = "inOutSine") => ({ t, pos: [tg[0] + off[0], tg[1] + off[1], tg[2] + off[2]], target: tg, fov: 30, ease });
const T1 = [2.62, 0.3, 0.6], T2 = [1.25, 0.12, 0.5], T3 = [0.72, -0.62, 0.8], T4 = [-0.1, -0.1, 0.3];
export const CAMERA = [
  key(0, T1, [-0.3, 0.5, 4.3]),
  key(at("pace", 3.3), [2.6, 0.3, 0.6], [-0.25, 0.42, 3.95], "linear"),
  key(at("ratio", 1.0), T2, [0.3, 0.42, 2.9]),
  key(at("ratio", 3.4), [1.19, 0.15, 0.5], [0.27, 0.38, 2.72], "linear"),
  key(at("strike", 1.1), T3, [0.3, 0.38, 5.8]),
  key(at("strike", 3.5), [0.72, -0.7, 0.8], [0.27, 0.35, 5.6], "linear"),
  key(at("whole", 1.5), T4, [0.0, 0.5, 7.3]),
  key(DURATION, [-0.1, -0.1, 0.3], [0.0, 0.48, 7.65], "linear"),
];

export const OBJECTS = [
  { id: "plate", primitive: "procedural", factory: "plate", procedural: "anthracite main plate 10.2 × 5.9 m (top at z = 0), perlage graining, engraved gilt border", dims: { w: PLATE.w, h: PLATE.h }, position: [PLATE.center[0], PLATE.center[1], 0] },
];

// ---------------------------------------------------------------- SCORE (all from the plans)
const pan = (x) => Math.max(-0.6, Math.min(0.6, x / 6));
const TICKS = esc.tickTimes(0, DURATION - 0.05);
export const SCORE = [
  // warm bed: low pad (brightness is a low-pass cutoff in Hz)
  { t: 0, type: "pad", dur: DURATION, gain: 0.85, root: 110, chord: [0, 7, 12, 16], attack: 1.6, release: 2.2, brightness: 650 },
  // one tick per escapement beat: tick / tock alternate in pitch; a soft body clack under each
  ...TICKS.flatMap((k, i) => [
    { t: k.t, type: "tick", gain: 0.5, pitch: k.kind === "tick" ? 1.7 : 1.45, pan: pan(ESC.center[0]), seed: 100 + i },
    { t: k.t + 0.004, type: "clack", gain: 0.1, pitch: k.kind === "tick" ? 1.35 : 1.2, pan: pan(ESC.center[0]), seed: 200 + i },
  ]),
  // the bell: hammer knock + bell partials, at the planner's strike time
  ...FOLLOW.strikes.flatMap((s, i) => [
    { t: s.t, type: "clack", gain: 0.32, pitch: 1.7, pan: pan(BELL.center[0]), seed: 300 + i },
    { t: s.t, type: "chime", dur: 2.8, gain: 0.34, pitch: 0.9, pan: pan(BELL.center[0]), seed: 310 + i },
    { t: s.t, type: "chime", dur: 2.4, gain: 0.16, pitch: 0.45, pan: pan(BELL.center[0]), seed: 320 + i },
  ]),
  // the follower dropping off the cam edge
  ...FOLLOW.drops.map((d, i) => ({ t: d.t, type: "click", gain: 0.16, pitch: 0.75, pan: pan(C4[0]), seed: 330 + i })),
  // each caption plaque settling
  ...CAPTIONS.map((c, i) => ({ t: c.in + 0.12, type: "click", gain: 0.2, pitch: 0.8, seed: 400 + i })),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "escapement(): balance = A·sin(2π(t − t0)/T); each centre crossing is a beat — the anchor flips and the escape wheel steps half a tooth (+recoil). planTrain(): every arbor angle = c + k·(escape wheel angle), k from tooth counts (directions alternate). camFollower(): the fourth-arbor cam's drop edge passes the follower only on a step -> strike event. SCORE: ticks from escapement.tickTimes, bell from FOLLOW.strikes.",
  ratios: Object.fromEntries(TRAIN.list.map((id) => [id, TRAIN.ratio("escape", id)])),
  ticks: TICKS.length, drops: FOLLOW.drops, strikes: FOLLOW.strikes,
};
