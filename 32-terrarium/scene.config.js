// scene.config.js — 32-terrarium: "a small world that sustains itself". Plain data + the style's pure planner
// (growth.js): no THREE, no window. Imported by scene.js (browser) and by render-sfx / export-spec (Node), so every
// pour, sprout, leaf, droplet and light change in the picture has its sound from the SAME plan.
// Units: metres, Y-up, radians, seconds, sRGB hex. Jar axis = +Y at the origin, sill top y = 0.
import { STYLE_SPEC as S } from "./_atlas/styles/terrarium/spec.js";
import * as G from "./_atlas/styles/terrarium/growth.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "32-terrarium";
export const STYLE = "terrarium";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "layers", t: 0.0, dur: 3.9 },   // pebbles, charcoal, soil pour in and settle
  { id: "grow", t: 3.9, dur: 3.6 },     // stone, moss, fern unfurls, leafy stems, a vine; the cork seals it
  { id: "water", t: 7.5, dur: 3.7 },    // condensation beads, runs down, feeds the soil
  { id: "loop", t: 11.2, dur: 3.8 },    // day -> night -> dawn, it keeps going
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- the plan (pure)
export const JAR = G.jarProfile(S.jar.kind, S.jar);
export const POURS = G.planPours(JAR, ["pebbles", "charcoal", "soil"].map((id) => ({ id, ...S.layers[id], pour: id === "charcoal" ? 0.6 : id === "soil" ? 1.0 : 0.9 })),
  { start: at("layers", 1.0), gap: 0.15, settle: 0.6, mouthY: JAR.top + 0.9, g: 7.5, seed: 7 });
export const SOIL_Y = POURS[POURS.length - 1].yT;                        // settled soil level (flat part)

export const ROCK = { at: [0.42, 0.12], size: 0.3, t: at("grow", 0.05), seed: 12 };
export const GROWTH = G.planGrowth(JAR, {
  soilY: SOIL_Y, seed: 23,
  ferns: [{ at: [-0.18, -0.22], t0: at("grow", 0.25), dur: 2.7, fronds: 7, L: 0.95, stagger: 0.75, leaflets: 18, width: 0.2, az0: 0.3 }],
  leafy: [
    { at: [-0.62, 0.28], t0: at("grow", 0.45), dur: 2.5, H: 0.78, nodes: 7, leaf: 0.32, r0: 0.014, lean: [-0.12, 0.05], az: 0.4 },
    { at: [0.58, -0.32], t0: at("grow", 0.8), dur: 2.3, H: 0.62, nodes: 6, leaf: 0.29, r0: 0.013, lean: [0.08, -0.04], az: 2.1 },
  ],
  vine: { pts: [[0.05, SOIL_Y + 0.02, 0.62], [0.26, SOIL_Y + 0.06, 0.42], [0.38, SOIL_Y + 0.27, 0.2], [0.52, SOIL_Y + 0.25, 0.02], [0.72, SOIL_Y + 0.05, -0.1]], t0: at("grow", 0.6), dur: 2.4, every: 0.075, leaf: 0.075 },
  moss: { t0: at("grow", 0.15), count: 220, seeds: [[0.1, 0.45], [-0.5, -0.1]], speed: 0.75, size: [0.045, 0.095], avoid: [[ROCK.at[0], ROCK.at[1], 0.26]] },
  rock: ROCK,
});
export const CORK = { tIn: at("grow", 3.15), tSeat: at("grow", 3.5), lift: 1.4 };
// condensation: one wave by day (water beat), one at night (loop beat) — droplets on the camera side of the inner wall
export const WAVES = [
  { t0: at("water", 0.15), t1: at("water", 1.6), count: 95, theta: [-1.15, 0.95], y: [SOIL_Y + 0.35, 2.15], size: [0.012, 0.03], run: 9, runAt: at("water", 1.75), runSpacing: 0.17, accel: 1.5, haze: 0.75, seed: 31 },
  { t0: at("loop", 1.0), t1: at("loop", 2.1), count: 55, theta: [-1.1, 0.9], y: [SOIL_Y + 0.35, 2.1], size: [0.012, 0.028], run: 5, runAt: at("loop", 2.0), runSpacing: 0.2, accel: 1.6, haze: 0.5, seed: 47 },
];
export const DROPS = G.planDroplets(JAR, WAVES, { soilY: SOIL_Y });
export const DAY = [
  { t: 0, sun: 1, az: -0.2 },
  { t: at("loop", 0.0), sun: 1, az: 0.15 },
  { t: at("loop", 0.9), sun: 0.42, az: 0.3 },     // dusk
  { t: at("loop", 1.5), sun: 0.0, az: 0.35 },     // night
  { t: at("loop", 2.2), sun: 0.0, az: -0.35 },
  { t: at("loop", 3.1), sun: 1, az: -0.25 },      // dawn
  { t: DURATION, sun: 1, az: -0.2 },
];
export const EVENTS = G.events({ pours: POURS, growth: GROWTH, drops: DROPS, day: DAY, cork: CORK, grainEvery: 3 });

// ---------------------------------------------------------------- labels: one overlay paper tag per beat
export const TAGS = [
  { text: "Start with layers", on: at("layers", 0.35), off: at("layers", 3.45) },
  { text: "Let life take root", on: at("grow", 0.3), off: at("grow", 3.25) },
  { text: "Water cycles back", on: at("water", 0.3), off: at("water", 3.3) },
  { text: "A world that keeps itself", on: at("loop", 0.3) },
];
export const TAG_POS = { x: 250, y: -24, string: 175, width: 470, cap: 54 };
export const NECK_TAG = { text: "moss & fern", on: CORK.tSeat + 0.05 };   // tied on the neck once it is sealed

// ---------------------------------------------------------------- camera: the jar stays big; final shot fills the frame
export const CAMERA = [
  { t: 0.0, pos: [-0.95, 1.95, 6.7], target: [-0.95, 1.28, 0], fov: 30 },                       // whole jar: strata pour in
  { t: at("layers", 3.6), pos: [-0.85, 1.9, 6.25], target: [-0.85, 1.25, 0], fov: 30, ease: "linear" },
  { t: at("grow", 2.1), pos: [-0.5, 1.72, 4.7], target: [-0.45, 1.22, 0], fov: 30, ease: "inOutSine" },   // into the garden
  { t: at("grow", 3.55), pos: [-0.6, 2.05, 5.0], target: [-0.55, 1.55, 0], fov: 30, ease: "inOutSine" },  // up: the cork seals it
  { t: at("water", 2.2), pos: [-0.38, 1.66, 3.9], target: [-0.32, 1.42, 0], fov: 30, ease: "inOutSine" }, // close: droplets run
  { t: at("water", 3.6), pos: [-0.4, 1.64, 3.85], target: [-0.34, 1.4, 0], fov: 30, ease: "linear" },
  { t: at("loop", 1.2), pos: [-0.9, 1.9, 6.0], target: [-0.88, 1.32, 0], fov: 30, ease: "inOutSine" },    // back out: day -> night
  { t: at("loop", 2.4), pos: [-0.88, 1.88, 5.9], target: [-0.86, 1.3, 0], fov: 30, ease: "linear" },
  { t: DURATION, pos: [-0.2, 1.78, 3.55], target: [-0.14, 1.42, 0], fov: 30, ease: "inOutSine" },        // dawn: fill the frame
];

export const OBJECTS = [
  { id: "set", primitive: "procedural", factory: "windowsill", procedural: "painted windowsill, plaster wall with a deep window reveal, white frame and glazing bars, blurred garden backdrop outside", position: [0, 0, 0] },
  { id: "jar", primitive: "procedural", factory: "jar", procedural: "thick clear apothecary bottle (lathe: flat base, heel, belly, shoulder, neck, rolled lip), refraction pre-pass glass", dims: { kind: "bottle" }, position: [0, 0, 0] },
];

// ---------------------------------------------------------------- SCORE (all from the plan's events)
const pan = (e) => Math.max(-0.6, Math.min(0.6, (e.x ?? 0) * 0.6));
const LAYER_SND = { pebbles: { pitch: 1.25, density: 0.55, gain: 0.3 }, charcoal: { pitch: 0.8, density: 0.45, gain: 0.26 }, soil: { pitch: 0.55, density: 0.8, gain: 0.3 } };
const voices = {
  pour: (e) => [{ type: "rustle", dur: e.dur, gain: LAYER_SND[e.layer].gain, pitch: LAYER_SND[e.layer].pitch, density: LAYER_SND[e.layer].density }],
  grain: (e) => e.layer === "soil" ? [] : [{ type: e.layer === "pebbles" ? "click" : "clack", gain: e.layer === "pebbles" ? 0.13 : 0.08, pitch: e.layer === "pebbles" ? 1.5 : 0.75 }],
  settle: () => [{ type: "thud", dur: 0.35, gain: 0.22, pitch: 1.4 }],
  rock: () => [{ type: "thud", dur: 0.45, gain: 0.4, pitch: 0.9, offset: 0.16 }, { type: "clack", gain: 0.12, pitch: 0.5, offset: 0.17 }],
  sprout: () => [{ type: "pop", gain: 0.12, pitch: 0.55 }],
  unfurl: (e) => [{ type: "paper", dur: Math.min(0.7, e.dur), gain: 0.07, pitch: 1.5, density: 0.25 }],
  leaf: (e) => [{ type: "pop", gain: e.small ? 0.05 : 0.08, pitch: e.small ? 2.2 : 1.6 }],
  moss: () => [{ type: "rustle", dur: 0.3, gain: 0.05, pitch: 1.8, density: 0.2 }],
  cork: () => [{ type: "squish", gain: 0.3, pitch: 0.8 }, { type: "thud", dur: 0.3, gain: 0.3, pitch: 1.1 }],
  bead: () => [{ type: "blip", gain: 0.035, pitch: 2.2, notes: [12] }],
  run: () => [{ type: "whoosh", dur: 0.45, gain: 0.04, pitch: 2.4 }],
  drip: () => [{ type: "bubble", gain: 0.22, pitch: 0.85 }],
  dusk: (e) => [{ type: "pad", dur: e.dur + 2.2, gain: 0.12, root: 98, chord: [0, 3, 7, 10], attack: 0.6, release: 1.4, brightness: 520 }],
  night: (e) => [{ type: "pad", dur: e.dur + 1.6, gain: 0.1, root: 73.4, chord: [0, 7, 15], attack: 0.5, release: 1.2, brightness: 420 }],
  dawn: (e) => [{ type: "chime", dur: 2.2, gain: 0.12, pitch: 1.0, notes: 5, offset: e.dur * 0.6 }, { type: "sparkle", dur: 1.4, gain: 0.06, pitch: 1.3, offset: e.dur * 0.85 }],
};
const tagCues = TAGS.flatMap((g, k) => [
  { t: g.on + 0.18, type: "paper", dur: 0.35, gain: 0.12, pitch: 1.2, density: 0.3, seed: 700 + k },
  { t: g.on + 0.32, type: "tick", gain: 0.1, pitch: 1.4, seed: 710 + k },
]);
export const SCORE = [
  // warm, quiet windowsill bed (brightness is a cutoff in Hz)
  { t: 0, type: "pad", dur: DURATION, gain: 0.8, root: 110, chord: [0, 7, 12, 16, 19], attack: 1.6, release: 2.0, brightness: 850 },
  ...scoreFromEvents(EVENTS, voices, { pan, seedBase: 101, seedStep: 7 }),
  ...tagCues,
  { t: NECK_TAG.on + 0.1, type: "tick", gain: 0.08, pitch: 2.0, seed: 790 },
];
export const DUCK = [];
export const NOTES = {
  mechanism: "growth.js plans everything: planPours (level, mound, grains), planGrowth (fern fronds uncoil, stems, vine, moss), planDroplets (condense, bead, run, land), dayCycle; SCORE = scoreFromEvents(events(plan)).",
  soilY: SOIL_Y, pours: POURS.map((p) => ({ id: p.id, t0: p.t0, t1: p.t1, tS: p.tS, yB: p.yB, yT: p.yT })), cork: CORK, waves: WAVES, day: DAY,
};
