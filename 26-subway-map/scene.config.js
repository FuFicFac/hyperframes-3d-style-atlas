// scene.config.js — 26-subway-map: "Idea to launch" — a neutral five-step process drawn as a transit map.
// One main route (gather -> plan -> review -> build -> ship), a rework loop branching back from review to plan,
// and a feedback line from ship back to ideas. Plain data + the style's pure planner (transit.js) + kit schedule:
// imported by scene.js (browser) and by render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex.
// Map coordinates: [x, z] on the panel top (y = 0); +z is toward the viewer (screen-down in the overview).
import { routePath, layPlan, layEvents, timetable, gapBehindHead, glideKey } from "./_atlas/styles/subway-map/transit.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { STYLE_SPEC } from "./_atlas/styles/subway-map/spec.js";

export const ID = "26-subway-map";
export const STYLE = "subway-map";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "intro", t: 0.0, dur: 1.9 },   // first station + "you are here" pin
  { id: "ideas", t: 1.9, dur: 2.0 },   // 1 main line starts laying from IDEAS
  { id: "plan", t: 3.9, dur: 2.0 },    // 2 head reaches PLAN
  { id: "review", t: 5.9, dur: 2.2 },  // 3 REVIEW: rework loop branches back to PLAN
  { id: "build", t: 8.1, dur: 2.0 },   // 4 BUILD
  { id: "ship", t: 10.1, dur: 4.9 },   // 5 SHIP: feedback line runs back to IDEAS; camera pulls up to the whole map
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => +(B[id].t + off).toFixed(4);
const end = (id) => +(B[id].t + B[id].dur).toFixed(4);

// ---------------------------------------------------------------- map (grid waypoints; transit.octilinear inserts the 45-degree elbows)
const R = STYLE_SPEC.route;
const opt = { bend: R.bend, step: R.step };
export const LINES = {
  main: { color: 0, name: "Main line", way: [[-9.5, 2], [-4, -1.5], [1.5, -1.5], [5, 2], [9.5, 2]] },
  rework: { color: 1, name: "Rework loop", way: [[0.6, -2.6], [-0.6, -3.8], [-1.6, -3.8], [-2.8, -2.6]] },
  feedback: { color: 2, name: "Feedback", way: [[9.5, 0.9], [9.5, -3.3], [8, -4.8], [-8, -4.8], [-9.5, -3.3], [-9.5, 0.9]] },
};
const PATH = Object.fromEntries(Object.entries(LINES).map(([k, l]) => [k, routePath(l.way, opt)]));
export const ROUTES = Object.fromEntries(Object.entries(LINES).map(([k, l]) => [k, { ...l, length: PATH[k].length }]));

// stations on the main line (grid points; s = arc length on the filleted path)
export const STATIONS = [
  { id: "ideas", name: "IDEAS", at: [-9.5, 2] },
  { id: "plan", name: "PLAN", at: [-2.8, -1.5] },
  { id: "review", name: "REVIEW", at: [0.6, -1.5] },
  { id: "build", name: "BUILD", at: [3.25, 0.25] },
  { id: "ship", name: "SHIP", at: [9.5, 2] },
].map((s) => ({ ...s, s: PATH.main.stationS(s.at) }));
const S = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

// ---------------------------------------------------------------- track-laying clocks (transit.layPlan)
// The main head arrives at each station exactly on its beat; the branch lines lay inside their beats.
export const LAY = {
  main: [{ t: at("ideas"), s: 0 }, { t: at("plan"), s: S.plan.s }, { t: at("review"), s: S.review.s }, { t: at("build"), s: S.build.s }, { t: at("ship"), s: S.ship.s }],
  rework: [{ t: at("review", 0.65), s: 0 }, { t: at("review", 1.95), s: ROUTES.rework.length }],
  feedback: [{ t: at("ship", 0.45), s: 0 }, { t: at("ship", 2.45), s: ROUTES.feedback.length }],
};
const LP = Object.fromEntries(Object.entries(LAY).map(([k, keys]) => [k, layPlan(keys)]));

// interchanges: a = the end that appears first, b = the end it stretches to (grow window [t0, t1])
export const INTERCHANGES = [
  { id: "review", a: [0.6, -1.5], b: [0.6, -2.6], t0: at("review", 0.3), t1: LAY.rework[0].t },            // branch leaves REVIEW
  { id: "plan", a: [-2.8, -2.6], b: [-2.8, -1.5], t0: LAY.rework[1].t, t1: +(LAY.rework[1].t + 0.3).toFixed(4) }, // loop lands on PLAN
  { id: "ship", a: [9.5, 2], b: [9.5, 0.9], t0: at("ship", 0.12), t1: LAY.feedback[0].t },                // feedback leaves SHIP
  { id: "ideas", a: [-9.5, 0.9], b: [-9.5, 2], t0: LAY.feedback[1].t, t1: +(LAY.feedback[1].t + 0.3).toFixed(4) },
];
// station pop times = when the laying head reaches them (IDEAS pops on its own in the intro)
export const STATION_POP = { ideas: 0.3, ...Object.fromEntries(STATIONS.slice(1).map((s) => [s.id, +LP.main.timeAt(s.s).toFixed(4)])) };

// ---------------------------------------------------------------- timetables (transit.timetable; closed form)
const mainStops = STATIONS.map((s) => s.s);
const RW = ROUTES.rework.length, FB = ROUTES.feedback.length;
export const TRAINS = [
  { id: "m1", line: "main", color: 0, tt: { stops: mainStops, depart: at("plan", 0.35), vmax: 4.2, accel: 4, dwell: 0.55 } },
  { id: "m2", line: "main", color: 0, tt: { stops: mainStops, depart: at("build", 0.7), vmax: 4.2, accel: 4, dwell: 0.55 } },
  { id: "r1", line: "rework", color: 1, tt: { stops: [0, RW, 0, RW, 0], depart: at("build", 0.05), vmax: 3, accel: 4, dwell: 0.5 } },
  { id: "f1", line: "feedback", color: 2, tt: { stops: [0, FB], depart: at("ship", 1.5), vmax: 5, accel: 3.5, dwell: 0.5 } },
];
const TT = Object.fromEntries(TRAINS.map((tr) => [tr.id, timetable(tr.tt)]));
// a train must never run onto track that is still being laid
for (const tr of TRAINS) {
  const w = gapBehindHead(TT[tr.id], LP[tr.line], tr.tt.depart, DURATION, { front: STYLE_SPEC.train.length / 2 + 0.2 });
  if (w.gap < 0) throw new Error(`train ${tr.id} outruns the laying head by ${(-w.gap).toFixed(2)} m at t=${w.t.toFixed(2)}`);
}

// ---------------------------------------------------------------- overlay copy (one sign at a time, fixed region top-left)
export const CAPTIONS = [
  { beat: "ideas", n: 1, text: "Gather ideas" },
  { beat: "plan", n: 2, text: "Sketch a plan" },
  { beat: "review", n: 3, text: "Review: go or rework" },
  { beat: "build", n: 4, text: "Build and test" },
  { beat: "ship", n: 5, text: "Ship, then listen" },
].map((c, i, a) => ({ ...c, on: at(c.beat, 0.15), off: i < a.length - 1 ? at(a[i + 1].beat, -0.3) : at("ship", 2.2) }));
export const HERE = { pinAt: 0.45, tag: { on: 0.75, off: at("ideas", -0.15) } };
export const FINAL = { legendAt: at("ship", 2.3), tagsOn: at("ship", 2.65), tagStep: 0.08 };
export const LEGEND = { at: [-6.9, -2.8], w: 4.3 };

// ---------------------------------------------------------------- camera: low glide behind the laying head, then pull up
const G = (t, xz, o) => glideKey(t, xz, o);
export const OVERVIEW = { pos: [0, 23.6, 13.8], target: [0, 0, -1.3], fov: 32 };
export const CAMERA = [
  G(0, [-9.0, 1.6], { back: 5.4, up: 2.9, side: -3.6, lead: 1.6 }),
  G(at("ideas", -0.1), [-8.6, 1.4], { back: 5.6, up: 3.0, side: -3.8, lead: 1.8 }),
  G(at("plan"), [-4.6, -0.6], { back: 6.6, up: 3.5, side: -4.6, lead: 2.0, ease: "inOutSine" }),
  G(at("review", 0.9), [-1.4, -2.0], { back: 7.4, up: 4.4, side: -3.6, lead: 1.6, ease: "inOutSine" }),
  G(at("build"), [1.6, -0.6], { back: 8.4, up: 5.0, side: -4.0, lead: 1.6, ease: "inOutSine" }),
  G(at("ship", -0.2), [5.6, 0.9], { back: 8.6, up: 5.2, side: -4.2, lead: 1.4, ease: "inOutSine" }),
  { t: at("ship", 2.5), pos: OVERVIEW.pos, target: OVERVIEW.target, fov: OVERVIEW.fov, ease: "inOutCubic" },
];

export const OBJECTS = []; // the map is built procedurally in scene.js from style.props (see NOTES)

// ---------------------------------------------------------------- SCORE: every cue from BEATS / the lay plans / the timetables
const layEv = [
  ...layEvents(LP.main, { id: "main", stations: STATIONS.slice(1), tieEvery: 1 }),
  ...layEvents(LP.rework, { id: "rework", tieEvery: 1 }),
  ...layEvents(LP.feedback, { id: "feedback", tieEvery: 2 }),
];
const ttEv = TRAINS.flatMap((tr, k) => TT[tr.id].events.filter((e) => e.t < DURATION).map((e) => ({ ...e, train: k })));
const icEv = INTERCHANGES.map((c, i) => ({ kind: "interchange", t: c.t0, i }));
const VOICES = {
  layStart: (e) => [{ type: "whir", dur: e.dur, hz: 150, hz2: 230, grit: 0.12, gain: e.route === "feedback" ? 0.07 : 0.05 }],
  tie: (e) => [{ type: "tick", gain: 0.05, pitch: 1.5 + (e.n % 4) * 0.08 }],
  station: (e) => [{ type: "pop", gain: 0.3, pitch: 1.0 }, { type: "blip", notes: [0, 7], dur: 0.06, gain: 0.12, pitch: 1.1, offset: 0.04 }],
  interchange: () => [{ type: "clack", gain: 0.22, pitch: 1.3 }, { type: "chime", dur: 0.9, gain: 0.1, pitch: 1.5, offset: 0.05 }],
  depart: (e) => [{ type: "servo", dur: Math.max(0.3, e.dur), hz: 90, hz2: 190, grit: 0.15, gain: 0.06 }],
  arrive: (e) => [
    { type: "servo", t: e.brakeAt, dur: Math.max(0.3, e.dur), hz: 190, hz2: 90, grit: 0.15, gain: 0.05 },
    { type: "click", gain: 0.12, pitch: 0.9 },
    { type: "blip", notes: [4, 0], dur: 0.07, gain: 0.07, pitch: 1.3, offset: 0.12 },
  ],
};
export const SCORE = [
  // bed: warm major-7 pad (brightness = low-pass cutoff in Hz), a lift for the finale
  { t: 0, type: "pad", dur: at("ship", 0.4), gain: 1.0, root: 196, chord: [0, 4, 7, 11, 14], attack: 1.0, release: 1.2, brightness: 900 },
  { t: at("ship", 0.3), type: "pad", dur: DURATION - at("ship", 0.3), gain: 1.0, root: 220, chord: [0, 4, 7, 12, 16], attack: 0.8, release: 1.4, brightness: 1200 },
  // intro: IDEAS station + pin drop (outBounce first contact at 0.364 of the 0.5 s drop) + tag
  { t: STATION_POP.ideas, type: "pop", gain: 0.3, pitch: 1.0, seed: 3 },
  { t: +(HERE.pinAt + 0.364 * 0.5).toFixed(4), type: "thud", gain: 0.3, pitch: 1.8, seed: 5 },
  { t: HERE.tag.on, type: "blip", notes: [0, 4, 7], dur: 0.05, gain: 0.14, pitch: 1.2, seed: 7 },
  // captions
  ...CAPTIONS.map((c, i) => ({ t: c.on, type: "tick", gain: 0.16, pitch: 1.2 + i * 0.05, seed: 20 + i })),
  // track, stations, interchanges, trains
  ...scoreFromEvents([...layEv, ...icEv, ...ttEv].sort((a, b) => a.t - b.t), VOICES, { seedBase: 101 }),
  // pull-up + finale
  { t: at("ship", 0.3), type: "whoosh", dir: "in", dur: 2.0, gain: 0.16, pitch: 0.8, seed: 41 },
  { t: FINAL.legendAt, type: "pop", gain: 0.22, pitch: 0.8, seed: 43 },
  ...STATIONS.map((s, i) => ({ t: +(FINAL.tagsOn + i * FINAL.tagStep).toFixed(4), type: "tick", gain: 0.1, pitch: 1.7 + i * 0.1, seed: 50 + i })),
  { t: +(FINAL.tagsOn + 0.4).toFixed(4), type: "chime", dur: 1.6, gain: 0.14, pitch: 1.0, seed: 61 },
].filter((e) => e.t < DURATION).sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = "Three routes built with subway-map props (route/station/interchange/train/youAreHere/legend + overlay sign/tag). Track laying = transit.layPlan per route (head reaches each station on its beat); trains = transit.timetable (closed form), asserted never to outrun the laying head. SCORE derives from the same plans (layEvents + timetable events). Generic design: no real network, names or brand colours.";
