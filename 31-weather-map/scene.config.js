// scene.config.js — 31-weather-map: "What's coming" — a low rolls in off the sea over an invented landmass, its cold front
// sweeps east across five invented towns (each town's icon and temperature band flip as the front reaches it), and it
// clears behind. Plain data + the style's pure planner (weather.js) + kit schedule: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex. Map coords [x, z], +x east, +z south.
// Every place name is invented; every pressure / temperature is SAMPLE DATA (labelled on screen).
import { weatherPlan } from "./_atlas/styles/weather-map/weather.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { STYLE_SPEC } from "./_atlas/styles/weather-map/spec.js";

export const ID = "31-weather-map";
export const STYLE = "weather-map";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "calm", t: 0.0, dur: 3.0 },   // high pressure, sun everywhere, bands + isobars draw in
  { id: "low", t: 3.0, dur: 3.6 },    // the low rolls in from the west sea; fronts grow out of it
  { id: "front", t: 6.6, dur: 4.0 },  // the cold front sweeps east across the towns (icons flip)
  { id: "clear", t: 10.6, dur: 4.4 }, // it clears behind; rise to the wide
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => +(B[id].t + off).toFixed(4);

// ---------------------------------------------------------------- the weather (SAMPLE DATA) — one plan for picture and sound
export const WEATHER = {
  base: 1012, grad: [0.15, 0.25],
  low: { keys: [{ t: at("low"), at: [-11.2, -4.0] }, { t: at("front"), at: [-4.6, -4.3], ease: "linear" }, { t: DURATION, at: [10.2, -4.3], ease: "linear" }],
    appear: at("low"), deepen: 1.4, amp: 26, sigma: 4.2 },
  high: { keys: [{ t: 0, at: [2.6, -0.4] }, { t: DURATION, at: [8.4, 3.5], ease: "inOutSine" }], appear: 0.45, amp: 12, sigma: 5.5 },
  fronts: [
    { id: "cold", kind: "cold", axis: [-0.2, 1], c1: 0, c2: -0.03, len: 11, grow: [at("low", 0.35), at("low", 2.8)] },
    { id: "warm", kind: "warm", axis: [1, 0.45], c1: 0, c2: 0.03, len: 7.5, grow: [at("low", 0.6), at("low", 3.0)] },
  ],
  bands: { cloudAhead: 1.6, stormBehind: 1.6, lowRadius: 2.2 },
  temp: { base: 12, perZ: 0.55, perX: 0.12, warm: 4, cold: -4, soft: 0.5 },
  stateTemp: { sun: 0, cloud: -1, rain: 1, storm: -4, clear: -5 },
  places: [
    { id: "wren", name: "PORT WREN", at: [-7.2, 1.8], base: 15 },
    { id: "ashby", name: "ASHBY FELL", at: [-3.6, -1.8], base: 12 },
    { id: "marrow", name: "MARROWGATE", at: [0.6, 0.8], base: 16 },
    { id: "tullin", name: "TULLIN BAY", at: [3.6, 3.3], base: 18 },
    { id: "hollow", name: "HOLLOW CROSS", at: [6.2, -1.4], base: 14 },
  ],
};
const P = weatherPlan(WEATHER, STYLE_SPEC);
export const WEATHER_EVENTS = P.placeEvents(0, DURATION);   // [{ t, place, from, to }] — icon swaps AND their sounds

// ---------------------------------------------------------------- graphics timing (from BEATS)
export const SHOW = {
  isobars: [0.3, 1.3],            // fade-in window
  bands: [0.9, 2.2],
  arrows: [1.5, 2.6],
  places: { start: 1.0, step: 0.16 },
  barOn: 0.15,
  lowPop: at("low", 0.05),
  highPop: WEATHER.high.appear,
};

// ---------------------------------------------------------------- lower-third copy (one at a time, fixed region bottom-left)
export const CAPTIONS = [
  { beat: "calm", text: "A CALM START", sub: "TODAY · HIGH PRESSURE" },
  { beat: "low", text: "LOW PRESSURE ROLLS IN", sub: "TONIGHT" },
  { beat: "front", text: "THE FRONT SWEEPS EAST", sub: "TOMORROW" },
  { beat: "clear", text: "CLEARER SKIES BEHIND IT", sub: "THE WEEKEND" },
].map((c, i, a) => ({ ...c, i, on: i === 0 ? 0.45 : at(c.beat, 0.12), off: i < a.length - 1 ? at(a[i + 1].beat, -0.02) : DURATION + 1 }));

// ---------------------------------------------------------------- camera: broadcast fly-over
export const CAMERA = [
  { t: 0, pos: [-1.5, 14.6, 15.2], target: [0, 0.2, 0.9], fov: 34 },
  { t: at("low", -0.3), pos: [-3.5, 12.4, 13.4], target: [-1.6, 0.3, 0.4], fov: 34, ease: "inOutSine" },
  { t: at("low", 2.6), pos: [-12.6, 7.4, 8.6], target: [-5.6, 0.8, -1.4], fov: 34, ease: "inOutCubic" },
  { t: at("front", 0.6), pos: [-9.6, 7.6, 10.4], target: [-3.6, 0.6, 0.2], fov: 34, ease: "inOutSine" },
  { t: at("clear", -0.2), pos: [-1.8, 8.4, 10.6], target: [1.8, 0.6, -0.5], fov: 34, ease: "linear" },
  { t: at("clear", 3.0), pos: [0.8, 15.4, 13.0], target: [0.8, 0.0, 0.1], fov: 34, ease: "inOutCubic" },
];

export const OBJECTS = []; // the map is built procedurally in scene.js from style.props (see NOTES)

// ---------------------------------------------------------------- SCORE: every cue from BEATS / the weather plan / CAMERA
const VOICES = {
  weather: (e) => ({
    rain: [{ type: "paper", dur: 0.9, density: 0.85, gain: 0.1, pitch: 1.4 }, { type: "pop", gain: 0.2, pitch: 1.1 }],
    cloud: [{ type: "pop", gain: 0.16, pitch: 0.9 }],
    storm: [{ type: "rumble", dur: 1.7, gain: 0.34, pitch: 0.9 }, { type: "thud", gain: 0.22, pitch: 0.7, offset: 0.02 }],
    clear: [{ type: "chime", dur: 0.9, gain: 0.08, pitch: 1.6 }, { type: "pop", gain: 0.14, pitch: 1.3 }],
    sun: [{ type: "pop", gain: 0.14, pitch: 1.3 }],
  }[e.to] ?? []),
};
const camMoves = CAMERA.slice(1).map((k, i) => ({ t: CAMERA[i].t, dur: k.t - CAMERA[i].t }));
export const SCORE = [
  // bed: warm D add9 pad (brightness = low-pass cutoff in Hz), lifting for the clear-skies finale
  { t: 0, type: "pad", dur: at("clear", 0.5), gain: 1.0, root: 146.83, chord: [0, 7, 12, 14, 16], attack: 1.2, release: 1.4, brightness: 750 },
  { t: at("clear", 0.2), type: "pad", dur: DURATION - at("clear", 0.2), gain: 1.0, root: 164.81, chord: [0, 7, 12, 16, 19], attack: 1.0, release: 1.6, brightness: 1100 },
  // lower-third stings
  ...CAPTIONS.map((c, i) => ({ t: c.on, type: "blip", notes: [0, 7], dur: 0.07, gain: 0.16, pitch: 1.0 + i * 0.06, seed: 20 + i })),
  ...CAPTIONS.map((c, i) => ({ t: +(c.on - 0.05).toFixed(4), type: "whoosh", dir: "in", dur: 0.35, gain: 0.08, pitch: 1.6, seed: 30 + i })),
  // pressure centres
  { t: SHOW.highPop, type: "pop", gain: 0.24, pitch: 0.8, seed: 41 },
  { t: +(SHOW.highPop + 0.05).toFixed(4), type: "chime", dur: 1.0, gain: 0.08, pitch: 1.2, seed: 42 },
  { t: SHOW.lowPop, type: "pop", gain: 0.26, pitch: 0.55, seed: 43 },
  { t: SHOW.lowPop, type: "thud", gain: 0.24, pitch: 0.8, seed: 44 },
  { t: SHOW.lowPop, type: "rumble", dur: 2.6, gain: 0.2, pitch: 0.7, seed: 45 },
  // fronts grow out of the low
  ...WEATHER.fronts.map((f, i) => ({ t: f.grow[0], type: "whoosh", dir: "in", dur: +(f.grow[1] - f.grow[0]).toFixed(4), gain: 0.1, pitch: 0.7 + i * 0.15, seed: 50 + i })),
  // wind arrows start to flow
  { t: SHOW.arrows[0], type: "whoosh", dir: "in", dur: 1.2, gain: 0.07, pitch: 0.6, seed: 55 },
  // place cards pop in (staggered), then every weather change at its solved time
  ...WEATHER.places.map((p, i) => ({ t: +(SHOW.places.start + i * SHOW.places.step).toFixed(4), type: "tick", gain: 0.12, pitch: 1.3 + i * 0.08, seed: 60 + i })),
  ...scoreFromEvents(WEATHER_EVENTS, VOICES, { seedBase: 101 }),
  // camera sweeps
  ...camMoves.map((m, i) => ({ t: m.t, type: "whoosh", dir: "in", dur: +Math.min(2.2, m.dur).toFixed(4), gain: 0.06, pitch: 0.55, seed: 80 + i })),
  { t: CAMERA[CAMERA.length - 1].t, type: "chime", dur: 1.6, gain: 0.1, pitch: 1.0, seed: 90 },
].filter((e) => e.t < DURATION).sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = "Invented landmass (style landField, seeded). One weather plan (weather.weatherPlan) drives the low/high tracks, the isobar shader, fronts, clouds, wind arrows, temperature bands and each town's state; WEATHER_EVENTS (solved state changes) drive both the icon swaps and their sounds. All names invented; all numbers SAMPLE DATA.";
