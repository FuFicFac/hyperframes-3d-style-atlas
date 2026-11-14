// scene.config.js — 09-spotlight-stage: "The Turing Test" played on a toy-theatre stage.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec / export-blender (Node). Units: metres, Y-up, radians, s, sRGB hex / palette names.
// Stage frame: x across, y up from the boards, z toward the audience; proscenium at z = 0.
import { drop, slide } from "./_atlas/styles/spotlight-stage/cues.js";

export const ID = "09-spotlight-stage";
export const STYLE = "spotlight-stage";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "open", t: 0.5, dur: 1.8 },      // 1 curtain opens; title sign drops
  { id: "title", t: 1.45, dur: 2.55 },
  { id: "judge", t: 2.75, dur: 1.5 },    // 2 special snaps onto the judge
  { id: "screens", t: 4.3, dur: 1.1 },   // 3 screens A / B slide in, bubbles pop
  { id: "bubbles", t: 5.55, dur: 1.75 },
  { id: "which", t: 7.25, dur: 3.0 },    // 4 follow-spot swings A <-> B; question sign
  { id: "reveal", t: 10.35, dur: 1.2 },  // 5 B slides away: robot; caption sign
  { id: "caption", t: 11.7, dur: 1.6 },
  { id: "close", t: 13.35, dur: 1.65 },  //   curtain begins to close
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// Where things stand (stage metres). Hang points are the top-centre of each sign.
export const SET = {
  tracks: [-1.9, -2.5],
  judge: { x: 0, z: -1.05 }, desk: { x: 0, z: -0.75 },
  screenA: { x: -2.65, z: -1.9, from: -8.2 }, screenB: { x: 2.65, z: -1.9, from: 8.2, away: 8.4 },
  human: { x: -2.65, z: -2.5 }, robot: { x: 2.65, z: -2.5 },
  bubbleA: { x: -2.45, y: 2.6, z: -1.75, text: "I'M HUMAN!" }, bubbleB: { x: 2.45, y: 2.6, z: -1.75, text: "ME TOO!" },
  signZ: 0.25, wireTop: 9,
  title: { text: "THE TURING TEST", sub: "1950", w: 6.0, h: 1.5, hang: 4.05 },
  which: { text: "WHICH ONE IS\nTHE MACHINE?", w: 5.4, h: 1.75, hang: 4.3 },
  caption: { text: "IF YOU CAN'T TELL,\nIT PASSES.", w: 6.3, h: 1.8, hang: 4.35 },
  special: { from: [0, 7.8, -1.6], to: [0, 0.6, -0.95], angle: 0.2, intensity: 260 },
  follow: { from: [-5.0, 9.0, -0.7], angle: 0.11, intensity: 900 },
};

// Cue sheet: every motion time in one place (scene.js and SCORE both read it).
export const CUE = {
  curtainOpen: at("open"), curtainClose: at("close"),
  titleDrop: at("title"), titleOut: at("title", 2.55),
  judgeSpot: at("judge"), specialDim: at("which"),
  slideA: at("screens"), slideB: at("screens", 0.22),
  bubbleA: at("bubbles"), bubbleB: at("bubbles", 0.45), bubblesOut: at("which", 0.05),
  followOn: at("which"), whichDrop: at("which", 0.3), whichOut: at("reveal", -0.15),
  aims: [ // follow-spot operator: from A to B and back, then onto the robot
    { t: at("which"), p: "A" }, { t: at("which", 0.8), p: "B" }, { t: at("which", 1.5), p: "A" },
    { t: at("which", 2.15), p: "B" }, { t: at("which", 2.65), p: "mid" }, { t: at("reveal", 0.35), p: "robot" },
  ],
  followOff: at("close", 0.7),
  slideBAway: at("reveal"), robotHop: at("reveal", 0.95),
  captionDrop: at("caption"),
};
export const AIM_POINTS = { A: [-2.65, 1.15, -1.9], B: [2.65, 1.15, -1.9], mid: [0, 1.0, -1.8], robot: [2.65, 1.0, -2.5], curtain: [0, 1.3, -0.35] };

// Stalls camera: one slow push-in with a slight lateral drift toward the reveal; never cut.
export const CAMERA = [
  { t: 0, pos: [0.45, 2.85, 13.6], target: [0.05, 2.2, -1], fov: 30 },
  { t: 7.5, pos: [-0.1, 2.75, 12.2], target: [0, 2.2, -1], fov: 30, ease: "inOutSine" },
  { t: 15, pos: [0.35, 2.6, 11.0], target: [0.2, 2.15, -1], fov: 30, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "theatre", primitive: "procedural", factory: "theatre", procedural: "toy-theatre house: damask wall, gilded proscenium arch + columns, plank stage with apron, black masking legs, painted night backdrop, two-half pleated velvet curtain, swagged valance with fringe, footlight trough", dims: { tracks: [-1.9, -2.5], paint: "night", seed: 3 } },
  { id: "audience", primitive: "procedural", factory: "audience", procedural: "two rows of front-row head-and-shoulder silhouettes (top hats, bowlers, bonnets) below the stage lip", dims: { perRow: 9, rows: 2, width: 11.5, z: 3.3, rowGap: 1.1, scale: 1.3, seed: 9 } },
];

// ---- SCORE: every cue derives from BEATS / CUE (cues.js gives landing / arrival times) ----
const land = (start, from, to) => drop(0, start, { from, to }).landAt;
const arrive = (start, from, to) => slide(0, start, from, to).arriveAt;
const thunk = (t, pan = 0, g = 1) => [
  { t, type: "thud", gain: 0.55 * g, pitch: 0.55, pan, seed: 11 },
  { t: t + 0.004, type: "clack", gain: 0.42 * g, pitch: 0.5, pan, seed: 12 },
  { t: t + 0.02, type: "hum", dur: 0.9, gain: 0.05 * g, hz: 100, pan },
];
const swish = (t, dur, pan = 0, g = 1) => [
  { t, type: "whoosh", dir: "in", dur, q: 0.7, pitch: 0.45, gain: 0.55 * g, pan },
  { t: t + 0.05, type: "rustle", dur: dur * 0.9, density: 0.75, pitch: 0.55, gain: 0.32 * g, pan, seed: 21 },
];
const signDrop = (start, hang, pan = 0) => {
  const l = land(start, 9, hang);
  return [
    { t: start, type: "whoosh", dir: "in", dur: 0.4, q: 2.2, pitch: 1.1, gain: 0.25, pan },
    { t: l, type: "thud", gain: 0.45, pitch: 1.15, pan, seed: 31 },
    { t: l + 0.02, type: "clack", gain: 0.22, pitch: 1.3, pan, seed: 32 },
  ];
};
const slideIn = (start, from, to) => {
  const pan = Math.sign(to) * 0.55;
  return [
    { t: start, type: "rustle", dur: 0.8, density: 0.5, pitch: 0.4, gain: 0.35, pan, seed: 41 },
    { t: start, type: "whoosh", dir: "in", dur: 0.85, q: 1.4, pitch: 0.7, gain: 0.32, pan },
    { t: arrive(start, from, to), type: "clack", gain: 0.4, pitch: 0.75, pan, seed: 42 },
    { t: arrive(start, from, to) + 0.01, type: "thud", gain: 0.3, pitch: 1.3, pan, seed: 43 },
  ];
};
const murmur = [0.0, 0.35, 0.8, 1.3, 1.9].map((t, i) => ({ t, type: "rustle", dur: 0.9, density: 0.18, pitch: 0.35 + 0.05 * (i % 3), gain: 0.16 - i * 0.022, pan: (i % 2 ? 0.4 : -0.4), seed: 60 + i }));

export const SCORE = [
  // bed: warm low pad (brightness = low-pass cutoff in Hz) + house murmur that hushes as the curtain goes up
  { t: 0, type: "pad", dur: DURATION, gain: 0.14, root: 110, chord: [0, 7, 12, 16], attack: 1.8, release: 2.2, brightness: 700 },
  { t: 0, type: "rumble", dur: 2.4, gain: 0.16, pitch: 0.7 },
  ...murmur,
  // 1 curtain opens, title drops
  ...swish(CUE.curtainOpen, 1.8),
  ...signDrop(CUE.titleDrop, SET.title.hang),
  { t: CUE.titleOut, type: "whoosh", dir: "out", dur: 0.5, q: 2, pitch: 1.2, gain: 0.2 },
  // 2 the special strikes the judge
  ...thunk(CUE.judgeSpot),
  // 3 screens slide in on their tracks, bubbles pop
  ...slideIn(CUE.slideA, SET.screenA.from, SET.screenA.x),
  ...slideIn(CUE.slideB, SET.screenB.from, SET.screenB.x),
  { t: CUE.bubbleA, type: "pop", gain: 0.5, pitch: 0.9, pan: -0.5, seed: 51 },
  { t: CUE.bubbleB, type: "pop", gain: 0.5, pitch: 1.05, pan: 0.5, seed: 52 },
  { t: CUE.bubblesOut, type: "pop", gain: 0.25, pitch: 1.5, pan: -0.4, seed: 53 },
  { t: CUE.bubblesOut + 0.05, type: "pop", gain: 0.25, pitch: 1.6, pan: 0.4, seed: 54 },
  // 4 follow-spot strikes and swings; the question drops
  ...thunk(CUE.followOn, -0.4, 0.9),
  ...signDrop(CUE.whichDrop, SET.which.hang),
  ...CUE.aims.slice(1, 4).map((a, i) => ({ t: a.t, type: "whoosh", dir: "in", dur: 0.35, q: 3, pitch: 1.6, gain: 0.16, pan: i % 2 ? -0.4 : 0.4 })),
  ...CUE.aims.slice(1, 4).map((a, i) => ({ t: a.t + 0.28, type: "tick", gain: 0.25, pan: i % 2 ? -0.4 : 0.4, seed: 70 + i })),
  { t: CUE.whichOut, type: "whoosh", dir: "out", dur: 0.5, q: 2, pitch: 1.2, gain: 0.2 },
  // 5 screen B slides away: the robot; the spot settles; caption; curtain begins to close
  { t: CUE.slideBAway, type: "rustle", dur: 0.85, density: 0.5, pitch: 0.4, gain: 0.35, pan: 0.6, seed: 81 },
  { t: CUE.slideBAway, type: "whoosh", dir: "out", dur: 0.8, q: 1.4, pitch: 0.7, gain: 0.32, pan: 0.6 },
  { t: CUE.robotHop, type: "blip", notes: [0, 7, 12], dur: 0.09, gain: 0.3, pitch: 1.0, pan: 0.5 },
  { t: CUE.robotHop + 0.3, type: "thud", gain: 0.3, pitch: 1.4, pan: 0.5, seed: 91 },
  { t: CUE.aims[5].t + 0.45, type: "chime", dur: 1.6, gain: 0.2, pitch: 0.9 },
  ...signDrop(CUE.captionDrop, SET.caption.hang),
  ...swish(CUE.curtainClose, 2.0, 0, 0.9),
];
export const DUCK = []; // duckFromBeats(beatsFromSrt(vo_srt)) once a voiceover exists
export const NOTES = { set: SET, cues: CUE, aimPoints: AIM_POINTS, frame: "x across, y up from the boards, z toward the audience; proscenium at z = 0" };
