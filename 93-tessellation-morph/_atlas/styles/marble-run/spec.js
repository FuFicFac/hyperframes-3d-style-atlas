// styles/marble-run/spec.js — STYLE_SPEC for "Marble Run". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (a ~1:20 toy-scale workshop machine: marbles r = 0.18 m), Y-up right-handed, sRGB hex,
// radians, three.js light units. The back wall is the XY plane at z = 0 facing +Z; parts stand off it.
//
// The look: a handmade wooden marble machine screwed to a workshop pegboard. Glass marbles roll down
// grooved maple rails and brass wire tracks, spiral through glass funnels, trip flags and brass counters
// and collect in jars. Warm key light from upper left throws the rails' and marbles' shadows onto the
// pegboard — those shadows carry the depth. Labels are engraved brass plaques and ink-stamped plywood tags.

export const STYLE_SPEC = {
  id: "marble-run",
  name: "Marble Run",
  description:
    "A handmade wooden marble machine on a workshop pegboard: glass marbles roll down grooved maple rails and brass wire tracks, spiral through glass funnels, trip flags and brass counters, and collect in jars. Warm upper-left light casts the machine's shadows onto the wall.",
  palette: {
    bg: "#24170f",
    pegboard: "#a6825a",       // tempered hardboard
    pegboardDark: "#9c7149",
    hole: "#3a2717",
    maple: "#d7ab72",          // rails (light wood)
    mapleDark: "#a8763f",
    mapleLight: "#ecc994",
    walnut: "#6b4428",         // bench and bins (dark wood)
    walnutDark: "#3f2716",
    walnutLight: "#8d5e38",
    ply: "#e3c99b",            // stamped tags (birch ply)
    brass: "#c9a14a",
    brassDark: "#6f5220",
    ink: "#2b1a10",            // stamp ink / engraving fill
    paint: "#c8452f",          // hand-painted arrows (signal red)
    paintCream: "#f1e6cc",
    string: "#d9c7a0",
    glassTint: "#e8f4f2",
    // eleven token colours (one per marble, in release order); reuse cyclically
    marbles: ["#e63946", "#f4a12a", "#f2d02b", "#7cc242", "#18a999", "#36b4e5", "#3f5fe0", "#8338ec", "#e754b5", "#ff7a33", "#14c98b"],
  },
  world: {
    background: "#24170f",
    environment: "room",
    environmentIntensity: 0.55,  // brass + glass need something to reflect
    toneMapping: "neutral",      // keeps maple / brass / marble hues as designed
    exposure: 1.0,
    shadowType: "pcf",           // pcf so key shadow.softness applies
  },
  materials: {
    pegboard: { type: "standard", baseColor: "#ffffff", roughness: 0.86, metalness: 0 },  // map + bump painted in style.js (wall)
    maple: { type: "standard", baseColor: "#ffffff", roughness: 0.52, metalness: 0 },     // map: wood grain along the rail
    walnut: { type: "standard", baseColor: "#ffffff", roughness: 0.6, metalness: 0 },
    ply: { type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0 },
    brass: { type: "physical", baseColor: "#c9a14a", roughness: 0.3, metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.35 },
    brassDark: { type: "physical", baseColor: "#8a6a2c", roughness: 0.42, metalness: 1 },
    steel: { type: "standard", baseColor: "#9aa1a6", roughness: 0.35, metalness: 1 },
    string: { type: "standard", baseColor: "#d9c7a0", roughness: 0.95, metalness: 0 },
    paint: { type: "standard", baseColor: "#c8452f", roughness: 0.55, metalness: 0 },
    ribbon: { type: "standard", baseColor: "#ffffff", roughness: 0.35, metalness: 0, side: "double" },
  },
  // glass (marbles, tubes, funnels, jars): physical material with a premultiplied fresnel-alpha patch —
  // face alpha low, rim alpha high, specular/reflections added at full strength (no transmission pass).
  glass: {
    marble: { alphaFace: 0.22, alphaRim: 0.95, fresnelPower: 2.0, rim: "#ffffff", rimStrength: 0.1, roughness: 0.04, clearcoat: 1, envIntensity: 1.4, tintMix: 0.8, innerGlow: 0.55 },
    vessel: { alphaFace: 0.05, alphaRim: 0.55, fresnelPower: 2.6, rim: "#eaf6f4", rimStrength: 0.18, roughness: 0.06, clearcoat: 1, envIntensity: 1.2 },
    caustic: { opacity: 0.5, size: 0.45, boost: 1.1 },  // bright focused spot inside each marble's wall shadow (× r)
  },
  marble: {
    r: 0.18,                 // big enough to read (≈ 55 px at the wide shot)
    ribbon: { vanes: 3, width: 0.62, length: 1.76, twist: 1.25, emissive: 0.22 }, // × r; cat's-eye vanes
    coreAlpha: 0.12,
  },
  rail: { grooveHalfWidth: 0.62, height: 1.3, wall: 0.55, standoff: 0.42 },  // × r; marble centre sits sqrt(1−w²)·r above the top
  wire: { radius: 0.022, halfGap: 0.55, standoffEvery: 1.1 },                 // metres / × r
  physics: { g: 30, rollK: 0.7142857, mu: 0.02, restitution: { glass: 0.35, wood: 0.3, brass: 0.4 } }, // g scaled for toy pace
  plaque: { metalness: 0.55, env: 0.8 },                                      // engraved face: part-diffuse so letters read under warm light
  wall: { holePitch: 0.3, holeRadius: 0.03, pxPerMetre: 110, screwRadius: 0.05 },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#ffe9cf", groundColor: "#4a3020", intensity: 0.5 },
    // warm workshop key from upper left-front: long soft shadows of rails and marbles on the pegboard
    { id: "key", type: "directional", color: "#ffd6a0", intensity: 3.8, position: [-7, 9.5, 10], target: [0.3, 2.4, 0],
      shadow: { softness: 4, mapSize: 4096, extent: 7.5, near: 2, far: 40, bias: -0.0004, normalBias: 0.02 } },
    { id: "fill", type: "directional", color: "#cfdcff", intensity: 0.35, position: [9, 3, 8], target: [0, 2.5, 0] },
  ],
  post: {
    bloom: { strength: 0.28, radius: 0.35, threshold: 1.9 },   // only glints on glass and brass
    vignette: { darkness: 0.42, offset: 1.05 },
    grain: { amount: 0.014, fps: 30 },
  },
  camera: { fov: 30, near: 0.5, far: 60, drift: { amp: 0.02, speed: 0.2 } },
  text: {
    engraved: '"Copperplate", "Copperplate Gothic Bold", "Didot", Georgia, serif',
    stamped: '"Rockwell", "American Typewriter", "Courier New", Georgia, serif',
    font: "serif", weight: 700, color: "#2b1a10", height: 0.4,
  },
  sfx: {
    glass: "clack (pitch ~2.1) + chime (pitch ~2.4, 0.22 s)",
    wood: "clack (pitch ~0.6) + thud (pitch 2.6, 0.16 s)",
    brass: "clack (pitch 1.45) + chime (pitch 1.25, 0.35 s)",
    roll: "rumble (pitch 3–5 by speed) + faint paper grit",
    counter: "tick + small clack",
    bed: "pad",
    enter: "clack", exit: "clack", move: "rumble", land: "thud", emphasis: "chime", ui: "tick",
  },
  motion: [
    "Marbles are the only actors. Each marble's position is a closed-form function of time along pre-authored segments (marbles.js): constant-acceleration rolls, ballistic falls, damped bounces, rebounds, holds.",
    "Rolling rotation is exact: angle = distance / r about up × direction, so the inner swirl visibly rolls.",
    "Every impact in the schedule becomes a sound: glass clacks, wooden knocks, brass tonks; rolls become rumble.",
    "Mechanisms react only to marble events: gates drop, flags trip, counters roll their drums, tags swing on their hooks (damped pendulum).",
    "Camera: frontal, slow tracking pans that follow the lead marble, slight parallax; no orbits.",
  ],
};
