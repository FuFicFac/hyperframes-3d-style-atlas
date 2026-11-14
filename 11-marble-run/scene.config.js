// scene.config.js — 11-marble-run: "What is a context window?" as a wooden marble machine on a pegboard.
// Plain data + pure choreography. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every marble's motion is planned HERE with the style's closed-form scheduler
// (marbles.js), and the SCORE is generated from the same plans' impact/roll events.
// Units: metres, Y-up, radians, seconds, sRGB hex. Pegboard = XY plane at z = 0 facing +Z; bench top y = 0.
import { STYLE_SPEC as S } from "./_atlas/styles/marble-run/spec.js";
import { MarblePlan, funnelSpiral, overLip, invert, scoreFromEvents } from "./_atlas/styles/marble-run/marbles.js";

export const ID = "11-marble-run";
export const STYLE = "marble-run";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "tokens", t: 0.35, dur: 6.4 },   // marbles released one by one, counter ticks
  { id: "full", t: 6.75, dur: 2.0 },     // the tube holds 8
  { id: "push", t: 8.75, dur: 3.0 },     // 9th, 10th, 11th push the oldest out
  { id: "settle", t: 12.2, dur: 2.8 },   // AI REMEMBERS WHAT FITS
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- machine layout (marble-CENTRE paths)
const r = S.marble.r, g = S.physics.g;
export const Z = 0.45;                                   // plane of the rails / tube centre line
export const R = r;
const RAIL_LIFT = Math.sqrt(1 - S.rail.grooveHalfWidth ** 2) * r; // centre above a grooved rail's top

export const HOPPER = { x0: -3.75, x1: -1.0, y0: 4.42, y1: 5.32, depth: 0.85, outlet: [-1.0, 4.74, Z], start: [-1.38, 4.8, Z],
  label: "YOUR\nCONVERSATION", cap: 0.19, pile: 15, seed: 5 };
export const FUNNEL = { center: [3.3, 3.7, Z + 0.42], rMouth: 0.62, rNeck: 0.215, height: 0.34, neck: 0.14, turns: 1.6, rho0: 0.42, rho1: 0.0 };
export const RAIL1 = { pts: [HOPPER.outlet, [2.62, 4.22, Z]] };                       // maple, gate at the outlet
export const RAIL2_START = [FUNNEL.center[0], 3.12, FUNNEL.center[2]];                // brass wire track (landing point)
export const TUBE = { xL: -1.95, xR: 1.3, y: 2.35, z: Z, rIn: r + 0.04, wall: 0.026, sill: 0.3 * r };
const yc = TUBE.y - TUBE.rIn + r;                                                    // marble centre height inside the tube
export const RAIL2 = { pts: [RAIL2_START, [2.2, 2.62, 0.62], [1.62, yc + 0.01, Z], [TUBE.xR + 0.02, yc, Z]], bend: 0.35 };
export const FLAG = { x: 1.43, pivot: [1.43, yc + r + 0.28, Z], len: 0.3 };            // trip flag over the tube inlet
export const COUNTER = { pos: [2.55, 1.6, 0.32], digits: 2, label: "TOKENS" };
export const JAR = { pos: [-4.02, 0, Z], rIn: 1.45 * r, h: 1.3, glass: 0.03 };
export const CHUTE = { pts: [[-2.32, 2.02, Z], [JAR.pos[0] + 0.44, 1.76, Z]] };       // maple chute to the jar
export const BACKSTOP = { x: JAR.pos[0] - JAR.rIn, top: 1.92 };                     // brass plate on the jar's far rim
const sillC = [TUBE.xL, yc - r + TUBE.sill, Z];                                     // sill corner the oldest rolls over
const lip = overLip({ C: sillC, r });
const PHI0 = lip.phiRest(yc);
export const SLOT = (k) => sillC[0] + r * Math.cos(PHI0) + 2 * r * k;               // rest x of slot k (0 = oldest)
export const CAPACITY = 8;

// ---------------------------------------------------------------- release schedule (one per token)
// 11 tokens: the first 8 fill the window, then 3 more push the oldest out.
export const RELEASES = [0.35, 0.77, 1.19, 1.61, 2.03, 2.45, 2.87, 3.29, 5.35, 6.45, 7.55];
export const COLORS = S.palette.marbles;

// ---------------------------------------------------------------- choreography (pure)
const PUSH = { dur: 0.5, contactV: 1.3, tipAlpha: 0.55 * g / r, detachPhi: 2.25 };
const TUBE_V_IN = 3.1;      // speed entering the tube (wire track brakes it)
const TUBE_V_HIT = 0.95;    // speed when it clacks into the row

function plan() {
  const plans = RELEASES.map((t, i) => new MarblePlan({ id: i, r, g, start: t, at: HOPPER.start, visibleBefore: false }));
  const spiral = funnelSpiral({ ...FUNNEL, r, startAngle: -Math.PI / 2, dir: 1 });
  const marks = { flag: [], gate: [], push: [], jar: [] };
  // --- common run: bin -> gate -> rail 1 -> drop into funnel -> spiral -> neck -> wire track -> tube inlet
  for (const [i, p] of plans.entries()) {
    marks.gate.push(p.t);
    p.roll([HOPPER.start, HOPPER.outlet], { a: 4.2, surface: "wood" });
    p.roll(RAIL1.pts, { mu: 0, surface: "wood" });
    p.fall({ to: spiral.pts[0] }, { surface: "glass" });
    p.roll(spiral.pts, { v0: Math.hypot(p.v[0], p.v[2]) * 0.8, mu: 0.12, surface: "glass" });
    p.fall({ to: RAIL2_START }, { surface: "brass" });
    p.roll(RAIL2.pts.slice(0, -1).concat([[FLAG.x, yc, Z]]), { v0: 1.1, vEnd: TUBE_V_IN, bend: RAIL2.bend, surface: "brass", hop: { v: Math.abs(p.v[1]) * 0.6, e: 0.3, surface: "brass" } });
    marks.flag.push({ t: p.t, id: i });
  }
  // --- the tube: first 8 roll to their slots; from the 9th on, each pushes the row and the oldest pops out
  const row = []; // marble ids in the tube, oldest first
  let jarCount = 0;
  for (const [i, p] of plans.entries()) {
    if (row.length < CAPACITY) {
      const k = row.length;
      p.roll([[FLAG.x, yc, Z], [SLOT(k), yc, Z]], { vEnd: TUBE_V_HIT, surface: "glass" });
      p.impact(k === 0 ? "brass" : "glass", TUBE_V_HIT);           // first one clacks the brass sill
      p.rebound({ dir: [1, 0, 0], amp: 0.035, dur: 0.24, surface: "glass" });
      row.push(i);
      continue;
    }
    // arrival: roll to contact with the row's newest marble
    p.roll([[FLAG.x, yc, Z], [SLOT(CAPACITY), yc, Z]], { vEnd: PUSH.contactV, surface: "glass" });
    p.impact("glass", PUSH.contactV);
    const tc = p.t;
    marks.push.push({ t: tc, id: i, out: row[0] });
    const D = (tau) => 2 * r * (1 - (1 - Math.min(1, tau / PUSH.dur)) ** 2);   // row shift, eased out
    // the row (+ the arrival) slides one slot left
    const movers = [...row.slice(1), i];
    for (const [j, id] of movers.entries()) {
      const q = plans[id];
      q.hold(tc);
      const x0 = SLOT(j + 1);
      q.custom(PUSH.dur, { pos: (tau) => [x0 - D(tau), yc, Z], dist: (tau) => D(tau), axis: [0, 0, 1], kind: "push" });
    }
    // the oldest: pushed up over the sill (contact with its neighbour), tips over the corner, falls out
    const old = plans[row[0]];
    old.hold(tc);
    const x2 = (phi) => { const c = lip.at(phi); return c[0] + Math.sqrt(4 * r * r - (c[1] - yc) ** 2); };
    const Dapex = SLOT(1) - x2(Math.PI / 2);
    const uA = 1 - Math.sqrt(1 - Dapex / (2 * r)), tA = uA * PUSH.dur;
    const phiOf = (tau) => invert(x2, SLOT(1) - D(tau), PHI0, Math.PI / 2);
    old.custom(tA, { pos: (tau) => lip.at(phiOf(tau)), dist: (tau) => r * (phiOf(tau) - PHI0), axis: [0, 0, 1], kind: "lip" });
    old.impact("brass", 0.6);                                     // rides over the brass sill
    const w0 = (2 * 2 * r * (1 - uA)) / PUSH.dur / r;             // angular speed at the apex
    const al = PUSH.tipAlpha;
    const dphi = PUSH.detachPhi - Math.PI / 2;
    const tTip = (-w0 + Math.sqrt(w0 * w0 + 2 * al * dphi)) / al;
    const phT = (tau) => Math.PI / 2 + w0 * tau + 0.5 * al * tau * tau;
    const wEnd = w0 + al * tTip;
    old.custom(tTip, { pos: (tau) => lip.at(phT(tau)), dist: (tau) => r * (phT(tau) - Math.PI / 2), axis: [0, 0, 1], kind: "tip",
      velEnd: [-Math.sin(PUSH.detachPhi) * r * wEnd, Math.cos(PUSH.detachPhi) * r * wEnd, 0] });
    old.fall({ to: CHUTE.pts[0] }, { surface: "wood" });
    old.roll(CHUTE.pts, { v0: 0.6, mu: 0.0, surface: "wood", hop: { v: Math.abs(old.v[1]) * 0.5, e: 0.3, surface: "wood" } });
    old.fall({ toX: BACKSTOP.x + r }, { surface: "brass" });     // flies off the chute end into the brass backstop
    old.kick([0.25, Math.min(old.v[1], 0) * 0.5, 0]);
    const rest = [JAR.pos[0], JAR.glass + 0.04 + r + 2 * r * jarCount, Z];
    old.fall({ to: rest }, { surface: "glass" });
    old.bounce({ e: 0.32, min: 0.35, surface: "glass" });
    marks.jar.push({ t: old.t, id: old.id, n: jarCount + 1 });
    jarCount++;
    row.shift();
    row.push(i);
    // the arrival ends the push in slot 7 with a soft settle against its neighbour
    p.impact("glass", 0.4);
  }
  return { plans, marks, row };
}
export const PLAN = plan();   // built once; style/scene read PLAN.plans[i].at(t)

// counter: one count per marble passing the flag
export const COUNTS = PLAN.marks.flag.map((f) => f.t).sort((a, b) => a - b);

// ---------------------------------------------------------------- labels
export const LABELS = {
  tube: { text: "CONTEXT WINDOW", pos: [-0.32, 1.76, 0.3], cap: 0.2, kind: "brass" },
  jar: { text: "FORGOTTEN", pos: [-3.86, 2.33, 0.06], cap: 0.18, kind: "wood" },
};
// beat captions: stamped ply tags dropped onto a pegboard hook in the open space between rail 1 and the tube
// (damped pendulum on landing), one at a time; the last one is engraved brass
export const HOOK = [-0.32, 4.0, 0.62];   // long peg: tags hang in front of rail 1, so lifting them off never crosses it
export const CAPTIONS = [
  { text: "EVERY WORD\nIS A TOKEN", in: at("tokens", 3.05), out: at("tokens", 6.15), cap: 0.2 },
  { text: "THE WINDOW HOLDS\nONLY SO MANY", in: at("full", 0.2), out: at("full", 2.15), cap: 0.2 },
  { text: "NEW IN,\nOLDEST OUT", in: at("push", 0.75), out: at("push", 3.0), cap: 0.22 },
];
export const FINAL = { text: "AI REMEMBERS\nWHAT FITS", in: at("settle", 0.25), cap: 0.25, kind: "brass" };
export const SWING = { in: 0.55, out: 0.35, amp: 0.11, omega: 9.5, zeta: 3.4 };

// ---------------------------------------------------------------- camera: frontal, tracking the lead marble
export const CAMERA = [
  { t: 0.0, pos: [-1.55, 4.92, 7.2], target: [-1.55, 4.72, 0], fov: 30 },            // the hopper: YOUR CONVERSATION
  { t: 0.9, pos: [-1.45, 4.91, 7.2], target: [-1.45, 4.71, 0], fov: 30, ease: "linear" },
  { t: 1.65, pos: [0.6, 4.72, 7.2], target: [0.6, 4.52, 0], fov: 30, ease: "inSine" },
  { t: 2.4, pos: [2.3, 4.05, 7.4], target: [2.3, 3.85, 0], fov: 30, ease: "outSine" },   // follow the lead marble to the funnel
  { t: 3.9, pos: [1.05, 2.55, 7.6], target: [1.05, 2.3, 0], fov: 30, ease: "inOutSine" },  // down the wire track into the tube
  { t: 5.3, pos: [0.95, 2.55, 7.75], target: [0.95, 2.3, 0], fov: 30, ease: "linear" },
  { t: 7.1, pos: [-0.55, 3.0, 12.1], target: [-0.55, 2.75, 0], fov: 30, ease: "inOutSine" }, // the whole machine: full window
  { t: 8.7, pos: [-0.9, 2.15, 9.3], target: [-0.9, 1.9, 0], fov: 30, ease: "inOutSine" },  // tube + jar for the push-outs
  { t: 12.0, pos: [-0.95, 2.15, 9.45], target: [-0.95, 1.9, 0], fov: 30, ease: "linear" },
  { t: 15.0, pos: [-0.97, 2.02, 9.6], target: [-0.97, 1.82, 0], fov: 30, ease: "inOutSine" }, // slow push-in on the answer
];

// wall paint (hand-painted arrows in wall metres) + a pegboard sized to fill every shot
export const WALL = { w: 20, h: 12, cx: -0.3, y0: -1.0 };
export const ARROWS = [
  { from: [-0.4, 5.25], to: [1.2, 5.05], color: "paint" },  // along rail 1
  { from: [-2.45, 1.5], to: [-3.25, 1.15], color: "paint" },// out to the jar
];

export const OBJECTS = [
  { id: "wall", primitive: "procedural", factory: "wall", procedural: "tempered-hardboard pegboard 20 × 12 m at z = 0: hole grid 0.3 m, hand-painted red arrows", dims: { w: WALL.w, h: WALL.h }, position: [WALL.cx, WALL.y0 + WALL.h / 2, 0] },
  { id: "bench", primitive: "procedural", factory: "bench", procedural: "walnut workbench top (planks) at y = 0, 1.7 m deep, with a front apron", dims: { w: 20, d: 1.7 }, position: [WALL.cx, 0, 0] },
];

// ---------------------------------------------------------------- SCORE (all from the plans' events)
const pan = (x) => Math.max(-0.7, Math.min(0.7, x / 5));
const events = PLAN.plans.flatMap((p) => p.events);
const caps = CAPTIONS.flatMap((c, k) => [
  { t: c.in + SWING.in * 0.45, type: "clack", gain: 0.3, pitch: 0.55, pan: pan(HOOK[0]), seed: 300 + k },
  { t: c.in + SWING.in * 0.45, type: "thud", dur: 0.2, gain: 0.25, pitch: 2.2, pan: pan(HOOK[0]), seed: 310 + k },
  { t: c.out, type: "click", gain: 0.18, pitch: 0.7, pan: pan(HOOK[0]), seed: 320 + k },
]);
export const SCORE = [
  // warm, quiet workshop bed: low pad (brightness is a cutoff in Hz) + faint room rumble
  { t: 0, type: "pad", dur: DURATION, gain: 0.1, root: 130.81, chord: [0, 7, 12, 16, 19], attack: 2.0, release: 2.5, brightness: 700 },
  { t: 0, type: "rumble", dur: DURATION, gain: 0.05, pitch: 0.9, seed: 900 },
  ...scoreFromEvents(events, { pan, rollGain: 0.13, gain: { glass: 0.8, wood: 0.85, brass: 0.75 } }),
  // gate flap at every release, flag + counter tick at every token, a soft knock when the drums settle
  ...PLAN.marks.gate.flatMap((t, k) => [{ t, type: "click", gain: 0.22, pitch: 0.8, pan: pan(HOPPER.outlet[0]), seed: 400 + k }]),
  ...COUNTS.flatMap((t, k) => [
    { t, type: "tick", gain: 0.34, pitch: 1.6, pan: pan(FLAG.x), seed: 500 + k },
    { t: t + 0.09, type: "clack", gain: 0.2, pitch: 1.9, pan: pan(COUNTER.pos[0]), seed: 520 + k },
  ]),
  ...caps,
  // final plaque: brass knock + a warm two-note chime
  { t: FINAL.in + SWING.in * 0.45, type: "clack", gain: 0.36, pitch: 1.2, seed: 600 },
  { t: FINAL.in + SWING.in * 0.45, type: "chime", dur: 2.2, gain: 0.16, pitch: 0.75, notes: 4, seed: 601 },
  { t: FINAL.in + 0.9, type: "chime", dur: 2.4, gain: 0.12, pitch: 1.0, notes: 4, seed: 602 },
];
export const DUCK = [];
export const NOTES = {
  mechanism: "Every marble's position/rotation is MarblePlan.at(t) from marbles.js: closed-form segments (constant-acceleration rolls, ballistic falls, damped bounces, rebounds, coupled push). SCORE = scoreFromEvents(plan events) + counter ticks at the flag crossings.",
  releases: RELEASES, counts: COUNTS, pushes: PLAN.marks.push, jar: PLAN.marks.jar,
  layout: { HOPPER, FUNNEL, RAIL1, RAIL2, TUBE, FLAG, COUNTER, CHUTE, JAR },
};
