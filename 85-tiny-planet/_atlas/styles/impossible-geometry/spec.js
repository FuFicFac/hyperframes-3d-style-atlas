// styles/impossible-geometry/spec.js — STYLE_SPEC for Impossible Geometry. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians.
//
// Look: sunlit pastel-stone architecture seen through an ORTHOGRAPHIC camera that lies. A real, open chain of stone
// steps is built so that from one "magic" direction its two ends coincide on screen and the stair climbs for ever;
// the camera then swings off that direction and the loop splits open. Flat three-tone faces (top / +Z / +X, fixed to
// the SUN, not the camera, so they stay true while the camera turns), fine screen-space edge lines on every block,
// a soft flat ground shadow and a calm two-colour sky. No lights, no tone mapping, no post.

export const STYLE_SPEC = {
  id: "impossible-geometry",
  name: "Impossible Geometry",
  description:
    "Sunlit pastel-stone architecture under an orthographic camera that lies: a real open staircase whose two ends line up from one magic angle into an endless loop, with a little walker climbing for ever, then the camera swings off-axis and the loop splits open to show the trick. Flat three-tone faces, fine edge lines, a soft ground shadow, a calm sky.",
  palette: {
    skyTop: "#b9dfe0",
    skyBottom: "#f6ead9",
    stone: "#ecd2ad", // stair blocks (base = the +Z face tone)
    stoneAlt: "#e3c49c", // every other block, for a masonry rhythm
    tower: "#e7a98f", // corner towers (terracotta)
    trim: "#8fc3b4", // caps, ledges (sage)
    door: "#5f6f8f", // doors / arches (deep slate, the darkest tone in frame)
    roof: "#7fa7d6",
    flag: "#f0624d",
    leaf: "#8cc9a0",
    trunk: "#b88a6a",
    walker: "#f0624d",
    walkerHead: "#fbe3cf",
    ink: "#3b3f5c",
    shadow: "#6f7fa0",
    label: "#33384f",
  },
  // three face tones from one base, fixed to the sun (upper left): tone = mix(base, toward, k) in sRGB
  tones: {
    top: { toward: "#ffffff", k: 0.45 },
    left: { toward: "#ffffff", k: 0.0 }, // +Z face (sunlit side)
    right: { toward: "#5c5a8a", k: 0.26 }, // +X face (shade side)
    back: { toward: "#5c5a8a", k: 0.4 }, // -X / -Z / underside (rarely seen)
  },
  edges: { widthPx: 1.35, toward: "#4a4470", k: 0.5 }, // fine edge lines on every block border (screen pixels)
  shadow: { color: "#6f7fa0", opacity: 0.26, spread: 1.15, lift: 0.002 },
  stairs: {
    flights: [["+x", 7], ["-z", 3], ["-x", 3], ["+z", 7]], // moves per flight, in walking order
    run: 1, // m per step (square treads)
    thick: 1.15, // stone depth under each tread
    elevationDeg: 50, // magic-view elevation; the rise per step is solved from it
    seamCells: 6, // first cells treated as the "A" end of the seam (their tunnels cut the far end)
    farFrom: 10, // cells >= this are the "B" end (cut where they sit between A and its virtual copy)
  },
  gap: { widthPx: 3, color: "#4a4470", dash: [0.22, 0.16, 0, 0], level: 0.85 }, // the dashed gap line (along v: a dot from the magic view)
  seam: { fullDeg: 0.25, goneDeg: 7 }, // the seam cut fades out as the camera leaves the magic direction
  world: { background: "#f6ead9", sky: { top: "#b9dfe0", horizon: "#f6ead9", horizonAt: 1 }, toneMapping: "none", exposure: 1, shadowType: "auto" },
  materials: {}, // unlit three-tone ShaderMaterials are built in style.js from the palette (exact sRGB)
  lights: [], // none: tones never depend on lighting
  post: {}, // none: exact colours, crisp edges
  camera: { projection: "orthographic", fov: 30, near: 1, far: 200, viewHeight: 14, dist: 40, drift: null },
  text: { font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700, color: "#33384f", height: 0.05 },
  overlay: { labelH: 0.056, tracking: 0.02, inDur: 0.35, outDur: 0.3, rise: 0.025, plate: "#fdf8f0", plateAlpha: 0.0 },
  sfx: { enter: "pop", exit: "whooshOut", move: "whir", land: "marimba", emphasis: "chime", ui: "blip", bed: "pad" },
  motion: [
    "The camera holds still on the magic view while the walker climbs; one slow orbit (path 'arc') swings 30-45 deg off it to reveal the gap, then returns and the loop seals.",
    "The walker hops one step at a time on a fixed clock (stand, then a quick arc); at the top it steps onto the bottom step — a teleport along the view direction.",
    "Nothing else moves: the architecture is stone; the flag ripples on the same clock as the steps.",
  ],
};
