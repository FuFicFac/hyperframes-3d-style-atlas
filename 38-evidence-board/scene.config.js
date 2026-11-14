// scene.config.js — 38-evidence-board: "Why does the fern keep wilting?" — an everyday office mystery on a cork board.
// Plain data + the style's pure thread planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every pin thunk, paper flutter, string draw, wrap, twang, flag pop and marker stroke in SCORE comes
// from the same plan the picture reads; camera keys are computed from board regions and the build fails if a required
// region leaves the frame (the caption band at the top included).
import { STYLE_SPEC as S } from "./_atlas/styles/evidence-board/spec.js";
import { planBoard, threadVoices, boardShot, framingGate, itemBox, linkBox, unionBox, boxFill } from "./_atlas/styles/evidence-board/threads.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys } from "./_atlas/kit/framing.js";

export const ID = "38-evidence-board";
export const STYLE = "evidence-board";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats (one short label each)
export const BEATS = [
  { id: "ask", t: 0, dur: 3.4, label: "Why does the fern wilt?" },
  { id: "gather", t: 3.4, dur: 3.6, label: "Pin up what we know" },
  { id: "follow", t: 7.0, dur: 3.6, label: "Follow the thread" },
  { id: "link", t: 10.6, dur: 4.4, label: "The link: a warm vent" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
/** label windows: in with the beat, out 0.4 s before the next one (one at a time) */
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.12 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---- the board content (neutral, invented; no numbers, no people)
export const CONTENT = {
  fern: { picture: "fern", caption: "the fern, desk 4" },
  log: { title: "WATERING LOG", lines: ["Mon + Thu, one jug", "soil dry again by Wed", "leaves droop by 3 pm"] },
  window: { picture: "window", caption: "west window" },
  note: { lines: ["worse since the", "heating came on?"] },
  plan: { title: "LARKSPUR ANNEX" },
  vent: { picture: "vent", caption: "vent under desk 4" },
  hub: {},
  link: { lines: ["warm air from the vent", "blows right at the pot"] },
};

// ---- the plan: items pinned one at a time, then string pin to pin
const at = (id, dt) => B[id].t + dt;
export const PLAN = planBoard(S, {
  items: [
    { id: "fern", kind: "photo", at: at("ask", 0.3), pos: [-0.56, 0.19], rot: -0.05, pinColor: 0, pin: [-0.1, 0.138], from: [0.22, -0.1] },
    { id: "log", kind: "card", at: at("ask", 0.95), pos: [-0.55, -0.22], rot: 0.04, pinColor: 1, pin: [-0.12, 0.088], from: [0.2, -0.16] },
    { id: "window", kind: "photo", at: at("gather", 0.12), pos: [-0.07, 0.29], rot: 0.035, pinColor: 2 },
    { id: "note", kind: "scrap", at: at("gather", 0.68), pos: [0.53, 0.28], rot: -0.06, pinColor: 3, pin: [0.098, 0.064] },
    { id: "plan", kind: "map", at: at("gather", 1.24), pos: [0.53, -0.2], rot: 0.025, pinColor: 4, pin: [0.115, 0.106] },
    { id: "vent", kind: "photo", at: at("follow", 0.05), pos: [0.12, -0.3], rot: -0.03, pinColor: 5 },
    { id: "hub", kind: "pin", at: at("follow", 1.0), pos: [-0.04, 0.105], pinColor: 0 },
    { id: "link", kind: "link", at: at("link", 1.25), pos: [-0.04 - 0.12, 0.105 - 0.088], rot: 0, pin: [0.12, 0.088], noPin: true, layer: 2, hover: 0.004, from: [-0.12, 0.16] },
  ],
  links: [
    { a: "fern", b: "log", at: at("ask", 1.85) },
    { a: "fern", b: "window", at: at("gather", 1.95) },
    { a: "note", b: "plan", at: at("gather", 2.55) },
    { a: "plan", b: "vent", at: at("follow", 0.8) },
    { a: "vent", b: "hub", at: at("follow", 1.85) },
    { a: "note", b: "hub", at: at("follow", 2.1) },
    { a: "fern", b: "hub", at: at("follow", 2.35) },
  ],
  flags: [
    { item: "log", at: at("ask", 2.95), local: [0.125, -0.035], rot: 0.05, color: 0 },
    { item: "plan", at: at("gather", 2.2), local: [0.128, -0.07], rot: 0.04, color: 2 },
  ],
  marker: { item: "vent", at: at("link", 0.35), center: [0.003, -0.012], rx: 0.072, ry: 0.05, rot: 0.04 },
});
const I = PLAN.items, LK = PLAN.links;

// ---- camera: computed shots (boardShot fits a board box in the frame below the caption band)
const FOV = S.camera.fov;
const box = (...ids) => unionBox(ids.map((id) => itemBox(PLAN, id, 0.03)));
const shot = (b, o = {}) => boardShot(b, { fov: FOV, ...o });
const SHOTS = {
  open: shot(box("fern"), { y: [-0.8, 0.6] }),
  ask: shot(box("fern", "log"), { x: [-0.7, 0.3], y: [-0.88, 0.68] }),
  gather: shot(box("fern", "window", "note"), { y: [-0.84, 0.62] }),
  gather2: shot(box("fern", "window", "note", "plan"), { y: [-0.86, 0.64] }),
  follow: shot(unionBox([box("plan", "vent"), itemBox(PLAN, "hub", 0.04)]), { y: [-0.84, 0.62] }),
  web: shot(unionBox([box("fern", "note", "vent"), [-0.1, 0, 0.05, 0.1]]), { y: [-0.86, 0.64] }),
  link: shot(box("vent", "link"), { y: [-0.84, 0.6], side: 0.06 }),
  wide: shot(box("fern", "log", "window", "note", "plan", "vent"), { x: [-0.9, 0.9], y: [-0.88, 0.66], side: 0.06, up: 0.03 }),
};
const key = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), pos: s.pos, target: s.target, fov: s.fov, ease });
export const CAMERA = [
  key(0, SHOTS.open),
  key(I.fern.land - 0.1, SHOTS.open),
  key(I.log.land + 0.1, SHOTS.ask),
  key(at("gather", -0.2), SHOTS.ask),
  key(I.window.land + 0.1, SHOTS.gather),
  key(I.plan.land, SHOTS.gather2),
  key(at("follow", -0.1), SHOTS.gather2),
  key(I.vent.land + 0.25, SHOTS.follow),
  key(LK[3].arrive, SHOTS.follow),
  key(LK[5].at + 0.1, SHOTS.web),
  key(LK[6].tautEnd + 0.3, SHOTS.web),
  key(PLAN.marker.at + 0.55, SHOTS.link),
  key(I.link.home + 0.35, SHOTS.link),
  key(I.link.home + 1.55, SHOTS.wide),
  key(DURATION, SHOTS.wide),
];

// ---- framing gate: what must be on screen, when (the caption band stays clear: y <= .7)
const REGIONS = (t) => {
  const out = [];
  for (const it of PLAN.list) if (t >= it.land && t <= it.home + 0.5) out.push({ id: it.id, box: itemBox(PLAN, it.id, 0.01) });
  LK.forEach((lk, i) => { if (t >= lk.at + 0.15 && t <= lk.tautEnd + 0.3) out.push({ id: `string${i}`, box: linkBox(PLAN, i, 0.02) }); });
  if (t >= PLAN.marker.at && t <= PLAN.marker.at + PLAN.marker.dur + 0.5) out.push({ id: "marked", box: itemBox(PLAN, "vent", 0.01) });
  if (t >= I.link.home + 1.6) out.push({ id: "board", box: box("fern", "log", "window", "note", "plan", "vent", "link") });
  return out;
};
export const FRAMING = framingGate(CAMERA, REGIONS, { duration: DURATION, drift: S.camera.drift, fov: FOV, x: [-0.92, 0.92], y: [-0.92, 0.72] });
if (!FRAMING.ok) throw new Error(`38-evidence-board framing gate failed: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
/** how much of the frame the subject fills in each held shot (keep it large) */
export const FILL = Object.fromEntries(Object.entries({ ask: [1.5, box("fern", "log")], gather2: [6.0, box("fern", "window", "note", "plan")], follow: [8.4, box("plan", "vent")], link: [12.0, box("vent", "link")], wide: [14.5, [-0.9, -0.55, 0.9, 0.55]] })
  .map(([k, [t, b]]) => [k, +boxFill(sampleCameraKeys(CAMERA, t, { fov: FOV }), b).toFixed(2)]));

export const OBJECTS = [
  { id: "board", primitive: "procedural", factory: "board", procedural: "1.8 x 1.1 m cork panel (calm canvas cork: blotches, granules, pits, old pin holes; bump from the same canvas) in a bevelled dark-oak frame, on a dark office wall", dims: {} },
  { id: "lampSet", primitive: "procedural", factory: "lampSet", procedural: "desk-lamp head (enamel cone shade, emissive bulb, arm) at the 'lamp' spot light, aimed at the board; out of shot", dims: {} },
];

// ---- SCORE: the thread plan + a warm low bed and a faint lamp hum
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 10, 15], attack: 1.6, release: 1.8, brightness: S.sound.bed.brightness },
  { t: 0, type: "hum", dur: DURATION, gain: 0.03, seed: 77 },
  { t: I.link.home + 0.05, type: "chime", dur: 1.8, notes: 3, gain: 0.14, pitch: 0.9, seed: 91 },
  ...scoreFromEvents(PLAN.events, threadVoices(S.sound), { seedBase: 101, pan: (e) => {
    const x = e.id ? I[e.id]?.anchor?.[0] ?? 0 : e.i != null && LK[e.i] ? (LK[e.i].A[0] + LK[e.i].B[0]) / 2 : 0;
    return Math.max(-0.5, Math.min(0.5, x * 0.6));
  } }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "threads.js plans every item (fly-in, hover, pin drive + bounce, swing about the pin) and every string (free end carried pin to pin, drawn length grows, exact catenary sag, wraps, pulls taut, twangs). style.js only reads poses/points; strings are kit liveTubes rewritten from t.",
  framing: FRAMING.ok ? `ok (worst margin ${FRAMING.worst.over} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
  fill: FILL,
  events: PLAN.events.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind })),
};
