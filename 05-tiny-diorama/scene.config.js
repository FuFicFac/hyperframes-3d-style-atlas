// scene.config.js — 05-tiny-diorama: "Where does your prompt go?" on one floating diorama tile.
// Plain data only (no THREE, no window): imported by scene.js (browser), render-sfx.mjs and export-spec.mjs (Node).
// Units: metres, Y-up, radians, seconds, sRGB hex. Tile-local coordinates: tile top at y = 0, camera on the +x/+z side.
export const ID = "05-tiny-diorama";
export const STYLE = "tiny-diorama";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "intro", t: 0.0, dur: 1.4 },    // tile drops in, house + data centre drop, trees pop
  { id: "type", t: 1.4, dur: 3.0 },     // 1 YOU TYPE A PROMPT — laptop on, typing ticks, packet charges
  { id: "travel", t: 4.4, dur: 2.8 },   // 2 IT TRAVELS TO A DATA CENTRE — packet rides the cable
  { id: "predict", t: 7.2, dur: 3.2 },  // 3 THE MODEL PREDICTS WORD BY WORD — racks pulse, fans, tokens pop
  { id: "stream", t: 10.4, dur: 2.6 },  // 4 THE ANSWER STREAMS BACK — tokens ride the cable home
  { id: "done", t: 13.0, dur: 2.0 },    // window + laptop glow, settle
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// 16:10 footprint: the whole tile (layered front edges included) fits 16:9 under the caption at 33-39 m, azimuth ~25 deg
export const TILE = { size: 14, depth: 8.75, dropAt: 0.1, dropDur: 1.1, dropFrom: 7, seed: 7 };
const landAt = (s) => s.at + s.dur / 2.75; // first ground contact of an outBounce drop

// Set pieces (tile-local). House front faces +z (toward camera), data centre likewise.
// The story sits 1 m forward of centre (+z) so the cable runs mid-frame and pins stay clear of the caption.
export const HOUSE = { pos: [-4.3, 0, 1.9], rot: 0, drop: { at: 0.85, dur: 0.7, from: 3.2 }, params: { roofColor: "#ff7b6b", color: "#fff4e6" } };
export const DC = { pos: [3.9, 0, -0.3], rot: 0, drop: { at: 1.05, dur: 0.75, from: 3.6 }, params: { w: 3.2, d: 2.2, h: 1.65, racks: 4, fans: 2 } };
export const DESK = { pos: [-2.35, 0, 3.4], rot: 0.44, scale: 1.6, popAt: 1.5, user: { color: "#6c8cf5", height: 1.05, local: [-0.62, 0, -0.5] } };
export const ROAD = { points: [[-6.95, 0.0], [0.6, 0.0], [0.6, -4.33]], width: 0.85, bend: 1.5 };
export const POLES = [[-1.8, 0.8], [1.6, 0.65]];
export const POLE_H = 2.1;
// cable anchors: house right wall -> pole tops -> data centre left wall
export const CABLE = { houseAnchor: [-3.32, 0.95, 1.9], dcAnchor: [2.27, 1.2, -0.2], sag: 0.22, revealAt: 1.6, revealDur: 0.8 };
export const CARS = [
  { seed: 11, color: "#ffd25a", speed: 1.15, offset: 0.0 },   // loops along the road
  { seed: 12, color: "#4fc9c2", park: [4.6, 0, 1.75], yaw: 0.25 },
];
// the desk prop is built at scale 1 and shown at DESK.scale (toy-scale exaggeration so "you" reads at 1080p)
export const PEGS = [
  { pos: [2.35, 0, 1.4], color: "#ff7b6b", seed: 1 },
  { pos: [5.85, 0, 1.3], color: "#ffd25a", seed: 2 },
  { pos: [-6.0, 0, 3.3], color: "#4fbf7a", seed: 3 },
];
export const SCATTER = {
  trees: { count: 14, seed: 21, spacing: 1.1, margin: 0.55 },
  bushes: { count: 12, seed: 33, spacing: 0.8, margin: 0.45 },
  popAt: 1.0, spread: 0.9, dur: 0.5,
};

// Story timing
export const PACKET = { chargeAt: at("type", 1.9), launch: at("travel", 0.15), arrive: at("travel", 2.45) };
export const TYPING = [0.75, 0.93, 1.05, 1.24, 1.37, 1.55, 1.66, 1.88, 2.0, 2.16].map((o) => at("type", o));
export const SCREEN_ON = at("type", 0.45);
export const POWER = { at: PACKET.arrive, fanRate: 9, fanRamp: 1.2 };
export const TOKENS = {
  n: 8, first: at("predict", 0.45), step: 0.32, row: { y: 2.95, spread: 3.7, forward: 0.4 }, size: 0.5, travelScale: 1.0,
  colors: ["#ff7b6b", "#ffd25a", "#6c8cf5", "#4fbf7a", "#c58cf2", "#4fc9c2", "#ff9e5e", "#ffd25a"],
  leave: at("stream", 0.0), leaveStep: 0.26, travel: 1.75,
};
export const GLOW_DONE = at("done", 0.0);

// Pin markers (overlay, anchored to tile-local points) and caption pills (overlay, top centre)
export const PINS = [
  { n: 1, tag: "YOU", anchor: "user", side: "right", in: at("type", 0.2), out: at("travel", -0.3) },
  { n: 2, tag: "YOUR PROMPT", side: "right", anchor: "packet", in: at("travel", 0.3), out: at("predict", -0.25) },
  { n: 3, tag: "DATA CENTRE", anchor: [5.5, 1.05, 0.75], side: "right", in: at("predict", 0.1), out: at("stream", -0.25) },
  { n: 4, tag: "THE ANSWER", side: "right", anchor: "stream", in: at("stream", 0.3), out: at("done", -0.2) },
];
export const CAPTIONS = [
  { n: 1, text: "YOU TYPE A PROMPT", in: at("type", 0.1), out: at("travel", -0.35) },
  { n: 2, text: "IT TRAVELS TO A DATA CENTRE", in: at("travel", 0.15), out: at("predict", -0.3) },
  { n: 3, text: "THE MODEL PREDICTS WORD BY WORD", in: at("predict", 0.1), out: at("stream", -0.3) },
  { n: 4, text: "THE ANSWER STREAMS BACK", in: at("stream", 0.15), out: at("done", -0.3) },
  { n: null, text: "AND LANDS ON YOUR SCREEN", in: at("done", 0.2), out: null },
];
export const UI = { kicker: "WHERE DOES YOUR PROMPT GO?", kickerAt: 0.35, kickerY: 0.877, kickerH: 0.036, capY: 0.76, capH: 0.082, revealDur: 0.7, hideDur: 0.35, pinH: 0.062 };

// Camera: orbit a few degrees around the tile, push in on the active part. orbitKey builds pos from
// (azimuth deg from +z toward +x, elevation deg, distance, target). The look target doubles as the tilt-shift focus.
const orbitKey = (t, az, el, dist, target, fov = 20, ease) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const pos = [target[0] + dist * Math.cos(e) * Math.sin(a), target[1] + dist * Math.sin(e), target[2] + dist * Math.cos(e) * Math.cos(a)];
  return { t, pos: pos.map((v) => +v.toFixed(3)), target, fov, ...(ease ? { ease } : {}) };
};
export const CAMERA = [
  orbitKey(0.0, 27, 32, 39, [0, -0.6, 0]),
  orbitKey(1.4, 25, 30, 35.5, [0, -0.7, 0], 20, "inOutSine"),
  orbitKey(3.6, 22, 30, 34, [-0.4, -0.8, 0.1], 20, "inOutCubic"),
  orbitKey(6.0, 25, 30, 34.5, [0, -0.75, 0], 20, "inOutCubic"),
  orbitKey(8.6, 28, 30, 34, [0.4, -0.8, -0.1], 20, "inOutCubic"),
  orbitKey(11.0, 25, 30, 33, [0, -0.9, 0], 20, "inOutCubic"), // beat 4: push in on the stream
  orbitKey(13.8, 23, 30, 34, [-0.3, -0.8, 0.1], 20, "inOutCubic"),
  orbitKey(15.0, 24, 30, 34.5, [-0.3, -0.8, 0.05], 20, "inOutSine"),
];

// Tilt-shift focus: the active subject (tile-local), eased between keys; "packet" follows the travelling packet.
export const FOCUS = [
  { t: 0, p: [0, 0, 0] }, { t: 1.6, p: [-2.4, 0.9, 3.3] }, { t: 4.6, p: [-2.4, 0.9, 3.3] }, { t: 6.8, p: [3.9, 1.6, -0.3] },
  { t: 10.4, p: [3.9, 1.8, -0.3] }, { t: 11.4, p: [-0.1, 1.6, 0.7] }, { t: 12.8, p: [-0.1, 1.6, 0.7] }, { t: 13.6, p: [-3.4, 0.9, 2.6] },
];
// screen-horizontal direction on the tile for the camera's ~25 deg azimuth (token row), and the toward-camera direction
export const VIEW = { right: [0.906, 0, -0.423], toward: [0.423, 0, 0.906] };

export const OBJECTS = [
  { id: "tile", primitive: "procedural", factory: "tile", procedural: "14 x 8.75 m slab: 3 stacked rounded boxes (grass 0.34 / soil 0.95 / rock 0.62, each inset 5 cm) + half-buried pebbles; soft square drop shadow 1.4 m below", params: { size: TILE.size, depth: TILE.depth, seed: TILE.seed } },
  { id: "road", parent: "tile", primitive: "procedural", factory: "road", procedural: "raised 3.5 cm ribbon along a filleted L path, round end caps, cream centre dashes", params: ROAD },
  { id: "house", parent: "tile", primitive: "procedural", factory: "house", procedural: "rounded-box house, bevelled extruded gable roof, chimney, door, 2 glowing windows", params: HOUSE.params, position: HOUSE.pos },
  { id: "dc", parent: "tile", primitive: "procedural", factory: "dataCentre", procedural: "rounded-box data centre: 4 front racks with LED rows, status strip, 2 roof fans with 3-blade rotors", params: DC.params, position: DC.pos },
  { id: "desk", parent: "tile", primitive: "procedural", factory: "desk", procedural: "small table with an open laptop (emissive screen)", params: {}, position: DESK.pos, rotation: [0, DESK.rot, 0] },
  { id: "pole1", parent: "tile", primitive: "procedural", factory: "pole", procedural: "capsule pole + crossbar + 2 insulators", params: { height: POLE_H }, position: [POLES[0][0], 0, POLES[0][1]], rotation: [0, -0.7, 0] },
  { id: "pole2", parent: "tile", primitive: "procedural", factory: "pole", procedural: "capsule pole + crossbar + 2 insulators", params: { height: POLE_H }, position: [POLES[1][0], 0, POLES[1][1]], rotation: [0, -0.7, 0] },
  { id: "packet", parent: "tile", primitive: "procedural", factory: "packet", procedural: "emissive yellow sphere, 0.46 m (blooms)", params: { size: 0.46 } },
  { id: "ringHouse", parent: "tile", primitive: "procedural", factory: "pulseRing", procedural: "flat torus pulse", params: { r: 1.3 }, position: [HOUSE.pos[0], 0.05, HOUSE.pos[2]] },
  { id: "ringDC", parent: "tile", primitive: "procedural", factory: "pulseRing", procedural: "flat torus pulse", params: { r: 2.2, color: "#9ff3ff" }, position: [DC.pos[0], 0.05, DC.pos[2]] },
];

// SCORE: every cue derives from BEATS / the timing tables above, so retiming a beat retimes its sound.
const tokLeave = (k) => TOKENS.leave + k * TOKENS.leaveStep;
export const SCORE = [
  { t: 0, type: "pad", dur: 12.9, gain: 0.19, root: 261.6, chord: [0, 7, 12, 16], attack: 1.0, release: 1.4, brightness: 750 },
  { t: at("done", -0.2), type: "pad", dur: 2.2, gain: 0.21, root: 293.7, chord: [0, 4, 7, 12, 16], attack: 0.4, release: 1.0, brightness: 900 },
  // intro: tile falls and lands with a bounce; buildings drop; trees pop
  { t: TILE.dropAt, type: "whoosh", dir: "in", dur: 0.55, gain: 0.3 },
  { t: landAt({ at: TILE.dropAt, dur: TILE.dropDur }), type: "thud", gain: 0.95, pitch: 0.7 },
  { t: TILE.dropAt + TILE.dropDur * 0.727, type: "thud", gain: 0.35, pitch: 0.95 },
  { t: landAt(HOUSE.drop), type: "thud", gain: 0.5, pitch: 1.3, pan: -0.45 },
  { t: landAt(HOUSE.drop) + 0.02, type: "pop", gain: 0.35, pitch: 1.1, pan: -0.45 },
  { t: landAt(DC.drop), type: "thud", gain: 0.55, pitch: 1.05, pan: 0.45 },
  { t: landAt(DC.drop) + 0.02, type: "clack", gain: 0.3, pan: 0.45 },
  ...[0.05, 0.22, 0.4, 0.58, 0.75].map((o, i) => ({ t: SCATTER.popAt + o, type: "bubble", gain: 0.32, pitch: 1.3 + i * 0.15, pan: [-0.6, 0.4, -0.2, 0.6, 0][i] })),
  { t: DESK.popAt, type: "pop", gain: 0.4, pitch: 1.5, pan: -0.3 },
  { t: CABLE.revealAt, type: "whoosh", dir: "in", dur: CABLE.revealDur, gain: 0.18, pitch: 1.4 },
  // captions + pins
  ...CAPTIONS.map((c) => ({ t: c.in, type: "blip", notes: [0, 7], dur: 0.06, gain: 0.3 })),
  ...PINS.map((p) => ({ t: p.in, type: "pop", gain: 0.42, pitch: 1.8, pan: 0.1 })),
  // 1: laptop wakes, typing, packet charges
  { t: SCREEN_ON, type: "blip", notes: [0, 4, 7], dur: 0.05, gain: 0.25, pitch: 1.5, pan: -0.35 },
  ...TYPING.map((t, i) => ({ t, type: "click", gain: 0.42, pitch: 0.9 + ((i * 7) % 5) * 0.08, pan: -0.35 })),
  { t: PACKET.chargeAt, type: "riser", dur: PACKET.launch - PACKET.chargeAt, gain: 0.18, pitch: 1.6 },
  // 2: packet launches, rides the cable, arrives
  { t: PACKET.launch, type: "bubble", gain: 0.6, pitch: 0.9, pan: -0.4 },
  { t: PACKET.launch + 0.05, type: "whoosh", dir: "in", dur: PACKET.arrive - PACKET.launch, gain: 0.25, pitch: 1.2 },
  { t: PACKET.arrive, type: "pop", gain: 0.55, pitch: 0.9, pan: 0.45 },
  // 3: data centre powers up, fans spin, racks pulse word by word
  { t: POWER.at + 0.05, type: "blip", notes: [0, 4, 7, 12], dur: 0.06, gain: 0.3, pan: 0.45 },
  { t: POWER.at + 0.1, type: "hum", dur: TOKENS.leave - POWER.at, gain: 0.12, hz: 110, pan: 0.45 },
  { t: POWER.at + 0.15, type: "rumble", dur: 1.6, gain: 0.2, pitch: 1.6, pan: 0.45 },
  ...Array.from({ length: TOKENS.n }, (_, k) => ({ t: TOKENS.first + k * TOKENS.step, type: "blip", notes: [[0, 2, 4, 5, 7, 9, 11, 12][k]], dur: 0.07, gain: 0.3, pitch: 1.0, pan: 0.4 })),
  // 4: tokens stream back
  ...Array.from({ length: TOKENS.n }, (_, k) => ({ t: tokLeave(k), type: "bubble", gain: 0.28, pitch: 1.2 + k * 0.06, pan: 0.35 })),
  ...Array.from({ length: TOKENS.n }, (_, k) => ({ t: tokLeave(k) + TOKENS.travel, type: "tick", gain: 0.3, pitch: 1.3 + k * 0.05, pan: -0.45 })),
  // 5: window + laptop glow
  { t: GLOW_DONE, type: "chime", sparkle: true, dur: 1.8, gain: 0.38, pan: -0.3 },
  { t: GLOW_DONE + 0.05, type: "pop", gain: 0.35, pitch: 1.2, pan: -0.3 },
];
export const DUCK = [];
export const NOTES = "Everything sits on one floating tile (tile-local coords). Packet + tokens follow precomputed polylines (laptop -> house anchor -> sagging cable -> data centre and back). Labels are overlay pin markers anchored to 3D points + one caption pill at a time; tilt-shift focus follows the camera target.";
