// scene.config.js — 18-floating-screens: "How RAG works" as a software-launch explainer.
// Plain data only (Node-importable). Units: metres (cards around z = 0..2, backdrop at z = -3.2), Y-up, seconds.
// Poses, layouts and typing schedules come from the style's THREE-free choreo module, so the SCORE ticks
// land on the same characters / arrivals the picture shows.
import { pose, flyFrom, recede, offsetPose, fanLayout, typePlan, keyTimes } from "./_atlas/styles/floating-screens/choreo.js";

export const ID = "18-floating-screens";
export const STYLE = "floating-screens";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "question", t: 0.0, dur: 3.1 },  // chat card flies in, the question types: 1 QUESTION
  { id: "search", t: 3.1, dur: 3.0 },    // search card + a fan of 7 documents: 2 SEARCH YOUR DOCUMENTS
  { id: "pull", t: 6.1, dur: 2.8 },      // two docs highlight + lift, snippets detach as chips: 3 PULL THE RELEVANT PARTS
  { id: "answer", t: 8.9, dur: 3.0 },    // chips stack into the prompt, prompt slides into the model: 4 ANSWER USING THEM
  { id: "grounded", t: 11.9, dur: 3.1 }, // the answer streams into the chat with two source pills: GROUNDED IN YOUR DATA
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// ---- content ---------------------------------------------------------------------------------------------
export const QUESTION = "What's our refund policy?";
export const ANSWER = "Refunds are available within 30 days of purchase. Items must be unused, and the money goes back to your original payment method.";
export const DOCS = [
  { title: "Shipping FAQ", meta: "Support · 6 pages", seed: 11, paragraphs: [3, 4, 3, 2] },
  { title: "Refund Policy", meta: "Policy · Updated May", seed: 12, paragraphs: [3, 2, 4, 2], hit: { para: 1, text: "Refunds are issued within 30 days of purchase." } },
  { title: "Pricing Plans", meta: "Sales · 3 pages", seed: 13, paragraphs: [2, 4, 3, 3] },
  { title: "Onboarding Guide", meta: "Product · 9 pages", seed: 14, paragraphs: [4, 3, 3, 2] },
  { title: "Returns & Exchanges", meta: "Policy · Updated Apr", seed: 15, paragraphs: [3, 2, 3, 3], hit: { para: 1, text: "Items must be unused. Money returns to the original payment." } },
  { title: "Security Overview", meta: "Trust · 5 pages", seed: 16, paragraphs: [3, 3, 4, 2] },
  { title: "Warranty Terms", meta: "Legal · 4 pages", seed: 17, paragraphs: [2, 3, 4, 3] },
];
export const HITS = [1, 4]; // doc indices that are relevant
export const CHIPS = [
  { text: "Refunds within 30 days", doc: 1 },
  { text: "Unused · original payment", doc: 4 },
];
export const SOURCES = ["Refund Policy", "Returns & Exchanges"];

// ---- sizes (m) ---------------------------------------------------------------------------------------------
export const SIZE = { chat: [3.6, 2.9], search: [3.6, 1.22], doc: [1.45, 1.9], chip: [2.2, 0.36], prompt: [3.2, 2.62], model: [2.3, 2.3], frosted: [4.7, 3.55] };

// ---- typing plans (shared with the SCORE) ----------------------------------------------------------------
export const TYPE_Q = typePlan(QUESTION, at("question", 1.5), { cps: 19, seed: 5 });
export const SEND_AT = TYPE_Q.end + 0.22;                            // cursor clicks send
export const TYPE_SEARCH = typePlan(QUESTION, at("search", 0.95), { cps: 60, jitter: 0.2, seed: 9 }); // query lands in the search bar
export const ANSWER_ON = at("grounded", 0.5);
export const TYPE_A = typePlan(ANSWER, ANSWER_ON, { cps: 100, jitter: 0.5, seed: 21, pause: 0.07 });
export const SOURCES_AT = [TYPE_A.end + 0.12, TYPE_A.end + 0.28];

// ---- poses / choreography ---------------------------------------------------------------------------------
const chatHero = pose([0, -0.05, 0.6], [0.03, -0.1, 0]);
const chatLeft = pose([-3.55, 0.3, -0.3], [0.02, 0.26, 0], 0.82);
const chatFinal = pose([-0.25, -0.12, 1.15], [0.02, 0.07, 0], 1.04);
export const TRACKS = {
  frosted: [
    { t: 0, pose: flyFrom(pose([0.5, -0.32, -0.3], [0.03, -0.1, 0]), { depth: 3, dy: -0.4 }) },
    { t: at("question", 0.0), pose: pose([0.5, -0.32, -0.3], [0.03, -0.1, 0]), spring: "soft" },
    { t: at("search", 0.15), pose: pose([1.7, -0.45, -1.3], [0, -0.05, 0], 1.3), spring: "soft" },
    { t: at("answer", 0.0), pose: pose([0.75, -0.15, -0.55], [0.02, 0, 0], 1.32), spring: "soft" },
    { t: at("grounded", 0.0), pose: pose([0.3, -0.42, 0.45], [0.03, 0.07, 0], 1.05), spring: "soft" },
  ],
  chat: [
    { t: 0, pose: flyFrom(chatHero, { depth: 5.5, dx: 0.8, dy: -1.0 }) },
    { t: at("question", 0.12), pose: chatHero, spring: "settle" },
    { t: at("search", 0.0), pose: chatLeft, spring: "soft" },
    { t: at("pull", 0.1), pose: recede(chatLeft, { depth: 1.0, dx: -0.3 }), spring: "soft" },
    { t: at("answer", 0.05), pose: pose([-4.7, 1.35, -2.4], [0, 0.3, 0], 0.8), spring: "soft" },
    { t: at("grounded", 0.0), pose: chatFinal, spring: "settle" },
  ],
  search: [
    { t: 0, pose: flyFrom(pose([1.45, 1.78, 0.5], [0.02, -0.08, 0]), { depth: 5, dy: 0.8, tilt: [-0.4, -0.3, 0.05] }) },
    { t: at("search", 0.2), pose: pose([1.45, 1.78, 0.5], [0.02, -0.08, 0]), spring: "settle" },
    { t: at("pull", 0.1), pose: pose([1.4, 2.0, -1.6], [0.02, -0.08, 0], 0.85), spring: "soft" },
    { t: at("answer", 0.0), pose: pose([2.0, 3.3, -2.2], [0.02, -0.08, 0], 0.9, 0), ease: "inOutCubic", dur: 0.7 },
  ],
  prompt: [
    { t: 0, pose: flyFrom(pose([-1.15, 0.02, 1.0], [0.02, 0.12, 0]), { depth: 5.5, dx: -0.6, dy: -0.9 }) },
    { t: at("answer", 0.05), pose: pose([-1.15, 0.02, 1.0], [0.02, 0.12, 0]), spring: "settle" },
    { t: at("answer", 1.65), pose: pose([2.35, 0.05, 0.25], [0.0, -0.1, 0], 0.5, 0), ease: "inOutCubic", dur: 0.62 },
  ],
  model: [
    { t: 0, pose: flyFrom(pose([2.55, 0.05, 0.6], [0.02, -0.2, 0]), { depth: 5.5, dx: 1.0, dy: -0.5, tilt: [0.4, 0.4, -0.06] }) },
    { t: at("answer", 0.2), pose: pose([2.55, 0.05, 0.6], [0.02, -0.2, 0]), spring: "settle" },
    { t: at("grounded", 0.0), pose: pose([3.05, 1.15, -0.9], [0.02, -0.22, 0], 0.72), spring: "soft" },
  ],
};
// doc fan: 7 cards in a hand behind/below the search card
export const FAN = fanLayout(DOCS.length, { center: [1.35, -0.88, -0.15], radius: 7.0, spread: 0.84, depthStep: 0.075, tilt: 1 });
export const DOC_LIFT = { 1: pose([-0.05, -0.62, 1.45], [0.02, 0.06, 0.02], 1.12), 4: pose([2.35, -0.7, 1.55], [0.02, -0.08, -0.025], 1.12) };
TRACKS.docs = FAN.map((p, i) => {
  const keys = [
    { t: 0, pose: offsetPose(pose([1.45, 1.6, -0.4], [0, 0, 0], 0.45), { o: 0 }) },
    { t: at("search", 0.85 + i * 0.075), pose: p, spring: "settle" },
  ];
  if (HITS.includes(i)) keys.push({ t: at("pull", 0.25 + HITS.indexOf(i) * 0.1), pose: DOC_LIFT[i], spring: "settle" });
  else keys.push({ t: at("pull", 0.2 + i * 0.02), pose: recede(p, { depth: 1.3 }), spring: "soft" });
  keys.push({ t: at("answer", HITS.includes(i) ? 0.1 + HITS.indexOf(i) * 0.06 : i * 0.03), pose: offsetPose(HITS.includes(i) ? DOC_LIFT[i] : p, { dp: [0, -1.4, -2.6], ds: 0.85, o: 0 }), ease: "inOutCubic", dur: 0.55 });
  return keys;
});
// chips: detach from the highlighted snippet (pose derived from the lifted doc in scene.js), spring to OUT,
// then fly along a bezier into their slot on the prompt card
export const CHIP_OUT = [pose([-0.2, 0.75, 2.05], [0.0, 0.05, 0.03]), pose([2.4, 1.28, 2.15], [0.0, -0.06, -0.03])];
export const CHIP_T = { detach: [at("pull", 1.1), at("pull", 1.3)], fly: [at("answer", 0.45), at("answer", 0.65)], flyDur: 0.75 };
export const SNIPPET_U = [[at("pull", 0.55), at("pull", 1.0)], [at("pull", 0.7), at("pull", 1.15)]]; // highlight sweep per hit doc
export const RINGS = {
  scan: DOCS.map((_, i) => at("search", 1.55 + i * 0.16)), // a light ring pings across the fan while searching
  hit: [at("pull", 0.15), at("pull", 0.25)],
  hitOff: at("answer", 0.3),
};
export const SEARCH = { progress: [at("search", 1.5), at("search", 2.65)], done: at("search", 2.7) };
export const PROMPT_FOLD = at("answer", 1.65);      // prompt slides into the model
export const MODEL = { flip: at("answer", 2.0), pulse: at("answer", 2.1), done: at("grounded", 0.45) };
export const LINKS = {
  query: { draw: [at("search", 0.25), at("search", 0.7)], dot: [at("search", 0.4), at("search", 0.95)], off: at("search", 1.6) },
  answer: { draw: [at("grounded", 0.12), at("grounded", 0.5)], dot: [at("grounded", 0.18), at("grounded", 0.6)], off: at("grounded", 1.2) },
};
export const CURSOR = {
  on: at("question", 0.9),
  keys: [ // [t, target: "start" | "input" | "send" | "away"]
    [at("question", 0.9), "start"], [at("question", 1.3), "input"], [TYPE_Q.end - 0.25, "input"], [SEND_AT - 0.02, "send"], [at("search", 0.35), "away"],
  ],
  clicks: [at("question", 1.32), SEND_AT],
  off: at("search", 0.05),
};
export const SENT_AT = SEND_AT + 0.08;
export const BOT_DOTS = at("grounded", 0.25);
export const HAZE = {
  chat: [[at("search", 0.1), 0], [at("search", 0.9), 0.12], [at("pull", 0.2), 0.12], [at("pull", 0.9), 0.32], [at("grounded", 0.0), 0.35], [at("grounded", 0.6), 0]],
  search: [[at("pull", 0.2), 0], [at("pull", 0.9), 0.3]],
  docs: [[at("pull", 0.2), 0], [at("pull", 0.9), 0.38]],
  model: [[at("grounded", 0.1), 0], [at("grounded", 0.8), 0.28]],
};
// depth-of-field focus point (the hero) per beat
export const FOCUS = [
  [0, [0, 0, 0.6]], [at("search", 0.2), [0, 0, 0.6]], [at("search", 0.9), [1.4, 0.4, 0.3]], [at("pull", 0.3), [1.4, 0.4, 0.3]],
  [at("pull", 0.9), [1.1, -0.6, 1.5]], [at("answer", 0.2), [1.1, -0.6, 1.5]], [at("answer", 0.8), [-0.6, 0, 1.0]],
  [at("answer", 1.7), [-0.6, 0, 1.0]], [at("answer", 2.1), [2.55, 0, 0.6]], [at("grounded", 0.1), [2.55, 0, 0.6]], [at("grounded", 0.7), [-0.25, 0, 1.15]],
];

// ---- labels (one fixed region: top-left) --------------------------------------------------------------------
export const LABELS = [
  { id: "q", number: 1, text: "QUESTION", on: at("question", 0.45), off: at("question", 2.75) },
  { id: "s", number: 2, text: "SEARCH YOUR DOCUMENTS", on: at("search", 0.35), off: at("search", 2.6) },
  { id: "p", number: 3, text: "PULL THE RELEVANT PARTS", on: at("pull", 0.3), off: at("pull", 2.4) },
  { id: "a", number: 4, text: "ANSWER USING THEM", on: at("answer", 0.25), off: at("answer", 2.55) },
  { id: "g", number: null, text: "GROUNDED IN YOUR DATA", on: at("grounded", 0.4), off: Infinity },
];

// ---- camera: one slow move per beat, drift during holds ------------------------------------------------------
export const CAMERA = [
  { t: 0, pos: [0.9, 0.45, 9.7], target: [0.1, -0.02, 0.6], fov: 30 },
  { t: at("question", 3.0), pos: [0.45, 0.3, 9.0], target: [0.05, -0.05, 0.6], fov: 30, ease: "inOutSine" },
  { t: at("search", 1.0), pos: [-0.35, 0.45, 13.4], target: [0.25, 0.15, 0], fov: 30, ease: "inOutCubic" },
  { t: at("search", 2.9), pos: [-0.15, 0.35, 13.0], target: [0.3, 0.1, 0], fov: 30, ease: "inOutSine" },
  { t: at("pull", 0.95), pos: [1.95, 0.35, 9.4], target: [1.15, -0.15, 0.9], fov: 30, ease: "inOutCubic", path: "arc" },
  { t: at("pull", 2.75), pos: [1.75, 0.3, 9.1], target: [1.15, -0.15, 0.9], fov: 30, ease: "inOutSine" },
  { t: at("answer", 0.95), pos: [0.55, 0.4, 11.0], target: [0.55, 0.0, 0.7], fov: 30, ease: "inOutCubic", path: "arc" },
  { t: at("answer", 1.75), pos: [0.75, 0.32, 10.6], target: [0.7, 0.0, 0.7], fov: 30, ease: "inOutSine" },
  { t: at("answer", 2.95), pos: [2.2, 0.25, 7.9], target: [2.3, 0.0, 0.6], fov: 30, ease: "inOutCubic" },
  { t: at("grounded", 1.0), pos: [0.05, 0.2, 9.1], target: [-0.15, -0.05, 1.1], fov: 30, ease: "inOutCubic", path: "arc" },
  { t: DURATION, pos: [-0.05, 0.15, 8.75], target: [-0.18, -0.05, 1.1], fov: 30, ease: "inOutSine" },
];

// The backdrop is the only spec object; cards are built in scene.js from the style's props (UI faces are topic code).
export const OBJECTS = [
  { id: "backdrop", primitive: "procedural", factory: "backdrop", procedural: "46x26 m plane at z=-3.2: five drifting soft colour blobs (mesh gradient) + dither; receives the fake key-light card shadows", dims: {} },
];

// ---- sound: every cue derives from BEATS / typing plans / choreography times ---------------------------------
const keyTicks = (plan, { gain = 0.11, pitch = 1.9, every = 1, seed0 = 100, type = "click", dur = 0.022 } = {}) =>
  keyTimes(plan, { every }).map((t, i) => ({ t, type, dur, gain: gain * (0.8 + 0.4 * ((i * 37) % 10) / 10), pitch: pitch * (0.9 + 0.2 * ((i * 53) % 10) / 10), pan: -0.15 + 0.3 * ((i * 71) % 10) / 10, seed: seed0 + i }));
export const SCORE = [
  // airy optimistic bed: maj9 pad (brightness = low-pass cutoff in Hz) + a high shimmer layer for the answer
  { t: 0, type: "pad", dur: DURATION, root: 196, chord: [0, 4, 7, 11, 14], brightness: 2400, attack: 1.4, release: 2.5, gain: 0.5 },
  { t: at("answer", 0), type: "pad", dur: DURATION - at("answer"), root: 392, chord: [0, 7, 11, 16], brightness: 3200, attack: 2.0, release: 2.5, gain: 0.16, seed: 3 },
  // 1 question
  { t: 0.0, type: "whoosh", dir: "in", dur: 0.7, pitch: 1.35, gain: 0.25, pan: 0.2, seed: 4 },
  { t: 0.08, type: "whoosh", dir: "in", dur: 0.85, pitch: 1.05, gain: 0.42, seed: 5 },
  { t: 0.68, type: "tick", gain: 0.12, pitch: 1.2, seed: 6 },
  { t: LABELS[0].on, type: "blip", notes: [0, 7], gain: 0.12, pitch: 1.5, seed: 7 },
  { t: CURSOR.clicks[0], type: "click", gain: 0.32, pitch: 1.0, seed: 8 },
  ...keyTicks(TYPE_Q),
  { t: SEND_AT, type: "click", gain: 0.34, pitch: 0.9, seed: 9 },
  { t: SENT_AT, type: "pop", gain: 0.28, pitch: 1.5, seed: 10 },
  { t: SENT_AT + 0.02, type: "whoosh", dir: "out", dur: 0.35, pitch: 1.8, gain: 0.14, seed: 11 },
  // 2 search
  { t: at("search", 0), type: "whoosh", dir: "out", dur: 1.0, pitch: 0.85, gain: 0.3, seed: 12 },
  { t: at("search", 0.2), type: "whoosh", dir: "in", dur: 0.6, pitch: 1.3, gain: 0.32, pan: 0.3, seed: 13 },
  { t: LINKS.query.draw[0], type: "tick", gain: 0.12, pitch: 1.6, seed: 14 },
  { t: LINKS.query.dot[1], type: "blip", notes: [0, 7, 12], dur: 0.06, gain: 0.14, pitch: 1.4, seed: 15 },
  { t: LABELS[1].on, type: "blip", notes: [0, 7], gain: 0.12, pitch: 1.5, seed: 16 },
  ...DOCS.map((_, i) => ({ t: at("search", 0.85 + i * 0.075), type: "paper", dur: 0.22, gain: 0.1, pitch: 1.3 + i * 0.05, pan: -0.3 + i * 0.1, seed: 20 + i })),
  { t: at("search", 0.85), type: "whoosh", dir: "in", dur: 0.6, pitch: 1.1, gain: 0.2, pan: 0.2, seed: 29 },
  ...RINGS.scan.map((t, i) => ({ t, type: "tick", gain: 0.07, pitch: 2.4 + i * 0.08, pan: -0.3 + i * 0.1, seed: 30 + i })),
  { t: SEARCH.done, type: "blip", notes: [0, 4, 7], dur: 0.07, gain: 0.13, pitch: 1.3, seed: 38 },
  // 3 pull
  { t: at("pull", 0), type: "whoosh", dir: "in", dur: 1.0, pitch: 0.95, gain: 0.22, seed: 39 },
  ...RINGS.hit.map((t, i) => ({ t, type: "chime", dur: 1.6, pitch: 1.0 + i * 0.26, gain: 0.2, pan: i ? 0.3 : -0.2, seed: 40 + i })),
  { t: at("pull", 0.25), type: "whoosh", dir: "in", dur: 0.55, pitch: 1.5, gain: 0.25, seed: 42 },
  { t: LABELS[2].on, type: "blip", notes: [0, 7], gain: 0.12, pitch: 1.5, seed: 43 },
  { t: SNIPPET_U[0][0], type: "sparkle", dur: 0.8, gain: 0.08, pitch: 1.3, seed: 44 },
  ...CHIP_T.detach.map((t, i) => ({ t, type: "pop", gain: 0.24, pitch: 1.7 + i * 0.2, pan: i ? 0.3 : -0.2, seed: 45 + i })),
  // 4 answer
  { t: at("answer", 0.05), type: "whoosh", dir: "in", dur: 0.7, pitch: 1.15, gain: 0.32, pan: -0.25, seed: 50 },
  { t: at("answer", 0.2), type: "whoosh", dir: "in", dur: 0.7, pitch: 1.3, gain: 0.26, pan: 0.3, seed: 51 },
  { t: LABELS[3].on, type: "blip", notes: [0, 7], gain: 0.12, pitch: 1.5, seed: 52 },
  ...CHIP_T.fly.map((t, i) => ({ t, type: "whoosh", dir: "in", dur: CHIP_T.flyDur, pitch: 1.7 + i * 0.15, gain: 0.16, pan: i ? 0.2 : -0.1, seed: 53 + i })),
  ...CHIP_T.fly.map((t, i) => ({ t: t + CHIP_T.flyDur, type: "tick", gain: 0.2, pitch: 1.3, seed: 55 + i })),
  { t: PROMPT_FOLD, type: "whoosh", dir: "in", dur: 0.6, pitch: 1.2, gain: 0.3, seed: 57 },
  { t: MODEL.flip - 0.05, type: "whoosh", dir: "out", dur: 0.4, pitch: 1.6, gain: 0.18, seed: 58 },
  { t: MODEL.pulse - 1.3, type: "riser", dur: 1.3, pitch: 1.2, gain: 0.08, seed: 59 },
  { t: MODEL.pulse, type: "chime", dur: 2.2, pitch: 0.75, gain: 0.26, seed: 60 },
  { t: MODEL.pulse + 0.02, type: "sparkle", dur: 1.1, gain: 0.1, pitch: 1.1, seed: 61 },
  // 5 grounded
  { t: at("grounded", 0), type: "whoosh", dir: "in", dur: 0.8, pitch: 1.0, gain: 0.34, pan: -0.15, seed: 62 },
  { t: LINKS.answer.dot[1], type: "blip", notes: [0, 7, 12], dur: 0.06, gain: 0.13, pitch: 1.4, seed: 63 },
  { t: LABELS[4].on, type: "blip", notes: [0, 4, 7], gain: 0.13, pitch: 1.5, seed: 64 },
  ...keyTicks(TYPE_A, { gain: 0.07, pitch: 2.6, every: 3, seed0: 300, type: "tick", dur: 0.018 }),
  ...SOURCES_AT.map((t, i) => ({ t, type: "pop", gain: 0.2, pitch: 1.8 + i * 0.25, pan: -0.1 + i * 0.2, seed: 70 + i })),
  { t: SOURCES_AT[1] + 0.1, type: "chime", dur: 2.4, pitch: 1.0, gain: 0.22, seed: 72 },
  { t: SOURCES_AT[1] + 0.12, type: "sparkle", dur: 1.2, gain: 0.1, pitch: 1.2, seed: 73 },
];
export const DUCK = [];
export const NOTES = "Cards, UI faces and choreography are built in scene.js from floating-screens props (card, frosted, chip, connector, cursor, pulseRings, stepLabel) and choreo.js poses/typing plans. Generic UI, no real products or logos.";
