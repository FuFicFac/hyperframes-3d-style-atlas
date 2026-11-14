// scene.config.js — 43-pinball-table: "Finish a project" as one ball's run on an electro-mechanical pinball table.
// The playfield is the diagram: GOAL lane, TASKS bumpers, DONE drop targets, SHIP ramp; the ball is attention moving
// between them; lit inserts are progress. Plain data + the style's pure planner (pinplan.js). No THREE, no window:
// imported by scene.js (browser) and by render-sfx / export-spec (Node). Every flip, bumper thwack, target drop, reel
// pulse, chime and bell in SCORE comes from the same plan the picture reads. Scores are made up: "SAMPLE DATA".
import { STYLE_SPEC as S } from "./_atlas/styles/pinball-table/spec.js";
import {
  planBall, lampPlan, reelPlan, awardsFromEvents, pinballVoices, rollScore, clearance,
  fieldToWorld, fieldShot, backglassFrame, framingReport, sampleCameraKeys, projectPoint,
} from "./_atlas/styles/pinball-table/pinplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "43-pinball-table";
export const STYLE = "pinball-table";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the contact schedule (durations only; every absolute time below is derived from it) -------------------------
const F = S.flipper;
const CATCH = { fly: 0.6, sit: 0.7 };   // right-flipper cradle catch after the drop targets
const SCRIPT = [
  // GOAL: plunger, shooter lane, around the orbit, down the left lane over four rollovers, into the left inlane
  { do: "plunger", pull: [0.35, 1.05], release: 1.15 },
  { do: "fly", to: { orbit: 0 }, dur: 0.52 },
  { do: "orbit", to: 180, dur: 0.85, k: 0.45 },
  { do: "fly", to: { lane: 1.04 }, dur: 0.42, marks: [
    { v: 1.46, kind: "rollover", id: "G" }, { v: 1.34, kind: "rollover", id: "O1" },
    { v: 1.22, kind: "rollover", id: "A" }, { v: 1.10, kind: "rollover", id: "L", last: true },
  ] },
  { do: "fly", to: { inlane: "L", v: 0.78 }, dur: 0.18 },
  { do: "fly", to: { inlane: "L", v: 0.52 }, dur: 0.15 },
  { do: "fly", to: { flipper: "L", d: 0.03 }, dur: 0.13 },
  { do: "fly", to: { flipper: "L", d: 0.11 }, dur: 0.2 },
  // TASKS: left flipper into the pop bumpers (contact angles chosen so each rebound reads as a kick), out to the right sling
  { do: "flip", side: "L", event: { shot: "tasks" } },
  { do: "fly", to: { bumper: "A", ang: 290 }, dur: 0.42, end: { kind: "bumper", id: "A" } },
  { do: "fly", to: { bumper: "C", ang: 115 }, dur: 0.2, end: { kind: "bumper", id: "C" } },
  { do: "fly", to: { bumper: "A", ang: 310 }, dur: 0.2, end: { kind: "bumper", id: "A" } },
  { do: "fly", to: { bumper: "C", ang: 60 }, dur: 0.24, end: { kind: "bumper", id: "C" } },
  { do: "fly", to: { bumper: "B", ang: 285 }, dur: 0.2, end: { kind: "bumper", id: "B", last: true } },
  { do: "fly", to: { sling: "R", u: 0.3 }, dur: 0.45, end: { kind: "sling", id: "R" } },
  { do: "fly", to: { flipper: "L", d: 0.06 }, dur: 0.6 },
  { do: "fly", to: { flipper: "L", d: 0.12 }, dur: 0.28 },
  // DONE: two left-flipper shots, each knocks down two drop targets one after the other
  { do: "flip", side: "L", event: { shot: "done" } },
  { do: "fly", to: { bank: 0.5 }, dur: 0.34, end: [{ kind: "target", id: "D" }, { kind: "target", id: "O2", dt: 0.07 }] },
  { do: "fly", to: { flipper: "L", d: 0.08 }, dur: 0.62 },
  { do: "fly", to: { flipper: "L", d: 0.115 }, dur: 0.18 },
  { do: "flip", side: "L" },
  { do: "fly", to: { bank: 2.5 }, dur: 0.34, end: [{ kind: "target", id: "N" }, { kind: "target", id: "E", dt: 0.07, last: true }] },
  { do: "raise", side: "R", dt: 0.14, hold: CATCH.fly + CATCH.sit - 0.14 - F.rise },   // cradle catch on the right flipper
  { do: "fly", to: { flipper: "R", d: 0.045 }, dur: CATCH.fly },
  { do: "ride", side: "R", dur: CATCH.sit + F.fall },
  { do: "fly", to: { flipper: "R", d: 0.12 }, dur: 0.25 },
  // SHIP: right flipper up the ramp, round the hairpin, down the wire return, cradled on the left flipper to the end
  { do: "flip", side: "R", event: { shot: "ship" } },
  { do: "fly", to: { ramp: 0 }, dur: 0.3, end: { kind: "rampEnter" } },
  { do: "ramp", from: 0, to: "top", dur: 0.55, k: 0.5, end: { kind: "rampTop" } },
  { do: "ramp", from: "top", to: 1, dur: 0.78, k: -0.45, marks: [{ at: "wire", kind: "wire" }], end: { kind: "ramp" } },
  { do: "fly", to: { inlane: "L", v: 0.66 }, dur: 0.12, end: { kind: "land" } },
  { do: "raise", side: "L", hold: Infinity, quiet: true },
  { do: "fly", to: { inlane: "L", v: 0.52 }, dur: 0.14 },
  { do: "fly", to: { flipper: "L", d: 0.035 }, dur: 0.2 },
  { do: "hold" },
];
export const PLAN = planBall(S, SCRIPT);
const EV = PLAN.events;
const first = (f) => EV.find(f), all = (f) => EV.filter(f);
const shot = (name) => first((e) => e.kind === "flip" && e.shot === name).t;

// completions (derived events): word lit -> award + bell
const goalT = first((e) => e.id === "L" && e.kind === "rollover").t + 0.12;
const tasksT = first((e) => e.kind === "bumper" && e.last).t + 0.1;
const doneT = first((e) => e.id === "E").t + 0.12;
const shipT = first((e) => e.kind === "ramp").t;
const landT = first((e) => e.kind === "land").t;
const BONUS = [0, 1, 2, 3].map((i) => landT + 0.55 + i * 0.5);   // multiplier lamps 2X..5X, one bonus each
const FINALE = BONUS[3] + 0.55;

// ---- beats: one label each, in a little before each shot -------------------------------------------------------
const tTasks = shot("tasks") - 0.15, tDone = shot("done") - 0.15, tShip = shot("ship") - 0.15;
export const BEATS = [
  { id: "goal", t: 0, dur: tTasks, label: "Set the goal" },
  { id: "tasks", t: tTasks, dur: tDone - tTasks, label: "Bump through the tasks" },
  { id: "done", t: tDone, dur: tShip - tDone, label: "Finish the list" },
  { id: "ship", t: tShip, dur: DURATION - tShip, label: "Ship it!" },
];

// ---- derived event list (plan + completions + bonus) ------------------------------------------------------------
export const EVENTS = [
  ...EV,
  { t: goalT, kind: "goal" }, { t: doneT, kind: "done" },
  ...BONUS.map((t, i) => ({ t, kind: "bonus", i })),
  ...[goalT, doneT, shipT + 0.05, FINALE].map((t, i) => ({ t, kind: "bell", i })),
].sort((a, b) => a.t - b.t);

// ---- score reels: every award pulses the reels through the score motor (SAMPLE DATA) ------------------------------
export const REELS = reelPlan(awardsFromEvents(EVENTS, S), S.score);

// ---- lamps: rules from the events ---------------------------------------------------------------------------------
const ids = (g) => S.lamps.filter((l) => l.group === g).map((l) => l.id);
const R = [];
const on = (id, t, amt = 1.3) => { R.push({ id, type: "on", t }, { id, type: "flash", t, amt, dur: 0.2 }); };
// attract: ring chase + shooter triangle until the launch
const launchT = first((e) => e.kind === "launch").t;
R.push({ type: "chase", ids: ids("ring"), from: 0, to: launchT, rate: 9, tail: 2 });
R.push({ id: "sk", type: "blink", from: 0, to: launchT, hz: 3 }, { id: "sk", type: "flash", t: launchT, amt: 2, dur: 0.3 });
// GOAL: lane arrow blinks until the word is done; one letter per rollover; completion blink; ladder step
R.push({ id: "la", type: "blink", from: launchT, to: goalT, hz: 3.5 });
all((e) => e.kind === "rollover").forEach((e) => on(e.id, e.t));
R.push({ ids: ids("goal"), type: "blink", from: goalT, to: goalT + 0.6, hz: 7, floor: 0.15 });
on("pGOAL", goalT + 0.55, 1.6);
// TASKS: bumper caps idle lit and flash on every hit; the sling plastic flashes on its kick
for (const id of ["A", "B", "C"]) R.push({ id: `bump${id}`, type: "base", level: 0.55 });
all((e) => e.kind === "bumper").forEach((e) => R.push({ id: `bump${e.id}`, type: "flash", t: e.t, amt: 2.2, dur: 0.16 }));
all((e) => e.kind === "sling").forEach((e) => R.push({ id: `sling${e.id}`, type: "flash", t: e.t, amt: 2.0, dur: 0.14 }));
R.push({ id: "slingL", type: "base", level: 0.35 }, { id: "slingR", type: "base", level: 0.35 });
on("pTASKS", tasksT, 1.6);
// DONE: bank arrows blink until the bank is down; one letter per falling target; completion blink; ladder step
R.push({ ids: ids("bankArrows"), type: "blink", from: tasksT + 0.3, to: doneT, hz: 3.5 });
all((e) => e.kind === "target").forEach((e) => on(e.id, e.t));
R.push({ ids: ids("done"), type: "blink", from: doneT, to: doneT + 0.7, hz: 7, floor: 0.15 });
on("pDONE", doneT + 0.65, 1.6);
// SHIP: ramp chevrons chase toward the ramp, faster as the ball goes up, then stay lit; ladder step
const rampEnterT = first((e) => e.kind === "rampEnter").t;
R.push({ type: "chase", ids: ids("rampArrows"), from: doneT + 0.7, to: rampEnterT, rate: 6, tail: 1.2 });
R.push({ type: "chase", ids: ids("rampArrows"), from: rampEnterT, to: shipT, rate: 16, tail: 1 });
ids("rampArrows").forEach((id) => R.push({ id, type: "on", t: shipT }));
on("pSHIP", shipT + 0.05, 1.8);
// bonus: multipliers light one by one; finale: everything blinks once, then the attract ring runs over the lit field
BONUS.forEach((t, i) => on(ids("mult")[i], t, 1.8));
const everything = S.lamps.map((l) => l.id).filter((id) => !ids("ring").includes(id));
R.push({ ids: everything, type: "blink", from: FINALE, to: FINALE + 0.5, hz: 6, floor: 0.2 });
R.push({ type: "chase", ids: ids("ring"), from: FINALE, to: Infinity, rate: 8, tail: 3, keep: false });
for (const id of ["A", "B", "C"]) R.push({ id: `bump${id}`, type: "flash", t: FINALE, amt: 1.6, dur: 0.35 });
export const LAMPS = lampPlan(R);

// ---- verification: the ball never passes THROUGH a bumper or a post off-schedule ---------------------------------
export const CLEAR = clearance(PLAN, S, { t1: DURATION });

// ---- camera: computed shots from the player's end (field regions fitted inside the safe area) ---------------------
const W = (x, v, h = 0) => fieldToWorld(S, [x, v, h]);
const boxPts = (x0, v0, x1, v1, h = 0.06) => [W(x0, v0), W(x1, v0), W(x0, v1), W(x1, v1), W(x0, v0, h), W(x1, v1, h)];
const BG = backglassFrame(S);
const bgPts = [[-BG.w / 2, BG.bottom[1], BG.bottom[2]], [BG.w / 2, BG.bottom[1] + BG.h, BG.bottom[2]], [BG.w / 2, BG.bottom[1], BG.bottom[2]], [-BG.w / 2, BG.bottom[1] + BG.h, BG.bottom[2]]];
const bgTitle = [[-BG.w / 2, BG.bottom[1], BG.bottom[2]], [BG.w / 2, BG.bottom[1] + BG.h * 0.8, BG.bottom[2]], [BG.w / 2, BG.bottom[1], BG.bottom[2]], [-BG.w / 2, BG.bottom[1] + BG.h * 0.8, BG.bottom[2]]];   // keep the title + reels, let the top edge go
const fov = S.camera.fov;
const SHOTS = {
  open: fieldShot(boxPts(-0.36, -0.02, 0.56, 1.0), { elev: 0.56, azim: 0.1, fov, safe: 0.88, shift: [0.04, -0.06] }),
  top: fieldShot(boxPts(-0.52, 0.95, 0.52, 2.1), { elev: 0.62, fov, safe: 0.9, shift: [0.04, -0.1] }),
  lane: fieldShot(boxPts(-0.52, 0.22, 0.52, 1.6), { elev: 0.62, azim: -0.06, fov, safe: 0.9, shift: [0.04, -0.08] }),
  bumpers: fieldShot(boxPts(-0.45, 0.9, 0.5, 1.8), { elev: 0.62, azim: 0.05, fov, safe: 0.9, shift: [0.04, -0.1] }),
  lower: fieldShot(boxPts(-0.5, 0.15, 0.5, 1.15), { elev: 0.58, azim: 0.06, fov, safe: 0.9, shift: [0.04, -0.1] }),
  ship: fieldShot(boxPts(-0.5, 0.2, 0.5, 1.55), { elev: 0.6, azim: -0.12, fov, safe: 0.9, shift: [0.04, -0.08] }),
  wide: fieldShot([...boxPts(-0.56, 0.35, 0.56, 2.15), ...bgTitle], { elev: 0.3, azim: -0.82, fov, safe: 0.92, shift: [0, 0] }),
};
const key = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), pos: s.pos, target: s.target, fov: s.fov, ease });
const laneT = first((e) => e.id === "G" && e.kind === "rollover").t;
const bump1 = first((e) => e.kind === "bumper").t;
const slingT = first((e) => e.kind === "sling").t;
export const CAMERA = [
  key(0, SHOTS.open),
  key(launchT, SHOTS.open),
  key(launchT + 0.9, SHOTS.top),
  key(laneT - 0.15, SHOTS.top),
  key(goalT + 0.35, SHOTS.lane),
  key(tTasks + 0.1, SHOTS.lane),
  key(bump1 - 0.05, SHOTS.bumpers),
  key(slingT - 0.45, SHOTS.bumpers),
  key(slingT + 0.35, SHOTS.lower),
  key(tShip, SHOTS.lower),
  key(tShip + 0.7, SHOTS.ship),
  key(landT + 0.25, SHOTS.ship),
  key(DURATION - 0.4, SHOTS.wide),
];

// ---- framing replay: the ball (always) and the area it is in must stay in frame, clear of the caption corner -------
export const FRAMING = framingReport((t) => {
  const p = PLAN.pos(t), r = S.table.ballR;
  return [{ id: "ball", pts: [W(p[0] - r, p[1] - r, p[2]), W(p[0] + r, p[1] + r, p[2] + 2 * r)] }];
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.9 });
// caption corner (top-left, see spec.caption): the ball must not pass under it
const CAP = { x0: -1, x1: -1 + (2 * (S.caption.x + 760)) / 1920, y1: 1, y0: 1 - (2 * (S.caption.y + S.caption.h + 10)) / 1080 };
export const UNDER_CAPTION = (() => {
  const hits = [];
  for (let t = 0; t <= DURATION; t += 1 / 30) {
    const cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov });
    const p = PLAN.pos(t), [x, y] = projectPoint(cam, W(p[0], p[1], p[2] + S.table.ballR));
    if (x > CAP.x0 && x < CAP.x1 && y > CAP.y0 && y < CAP.y1) hits.push(+t.toFixed(2));
  }
  return hits;
})();

export const OBJECTS = [
  { id: "cabinet", primitive: "procedural", factory: "cabinet", procedural: "pinball cabinet: wooden side walls and back wall around a tilted playfield, chrome side rails, a lockdown bar, legs and a dark floor", dims: {} },
];

// ---- SCORE: plan events + reel pulses + bells + rolling noise over a warm bed and the transformer hum ---------------
const SND = S.sound;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: [0, 7, 12, 16], attack: 1.2, release: 1.6, brightness: SND.bed.brightness },
  { t: 0, type: "hum", dur: DURATION, gain: SND.hum.gain, seed: 77 },
  ...scoreFromEvents(EVENTS.filter((e) => !e.quiet), pinballVoices(SND), { seedBase: 101 }),
  ...scoreFromEvents(REELS.pulses.map((p) => ({ t: p.t, kind: "pulse", reel: p.reel })), pinballVoices(SND), { seedBase: 3001 }),
  ...rollScore(PLAN, SND, { end: DURATION }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "pinplan.js: contact schedule -> piecewise ballistic arcs on the tilted field, orbit/ramp rolls with quadratic speed profiles, flipper rides; lamps from rules on the events; reels from queued score-motor pulses.",
  clearance: CLEAR.ok ? "ok" : `HITS: ${JSON.stringify(CLEAR.hits.slice(0, 6))}`,
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : `FAILS: ${JSON.stringify(FRAMING.spans)}`,
  underCaption: UNDER_CAPTION.length ? UNDER_CAPTION.slice(0, 10) : "none",
  finalScore: `${REELS.final} (SAMPLE DATA)`,
  events: EVENTS.map((e) => `${e.t.toFixed(2)} ${e.kind}${e.id ? ":" + e.id : ""}`),
};
