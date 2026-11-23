// styles/split-flap-board/spec.js — STYLE_SPEC for "Split-Flap Board". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the score) and the browser.
// Units: metres, Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: a mechanical departure board hanging in a dim hall. The board face is the XY plane at z = 0
// (the flap hinge plane), the board faces +Z (the camera). Every cell is a real split-flap mechanism:
// static top half + static bottom half + one flap that falls about the centre axle.

export const STYLE_SPEC = {
  id: "split-flap-board",
  name: "Split-Flap Board",
  description:
    "A mechanical railway/airport departure board in a dim hall: rows of black split flaps with off-white characters in a dark powder-coated housing with a brushed-metal header, row lamps, and a warm raking key light; every character cycles forward through the alphabet to arrive.",
  palette: {
    bg: "#07080a",          // hall darkness
    wall: "#16181b",        // back wall
    housing: "#25282c",     // powder-coated face plate
    housingDark: "#0d0e10", // slot interiors
    brushed: "#8e9297",     // brushed aluminium header / trims
    flap: "#141416",        // flap face
    flapLight: "#1d1e21",   // flap face highlight band
    glyph: "#ebe5d4",       // off-white characters
    paint: "#cbbf9f",       // printed column / row labels on the housing
    edge: "#7d7f82",        // flap edge (light plastic)
    spool: "#5b5f64",
    amber: "#ffad2e",
    green: "#44e07a",
    red: "#ff3b30",
  },
  world: {
    background: "#07080a",
    fog: { color: "#07080a", near: 16, far: 34 },
    environment: "room",
    environmentIntensity: 0.22, // just enough for the metal to read; the hall stays dark
    toneMapping: "aces",
    exposure: 1.25,
    shadowType: "pcf",
  },
  // Cell + board geometry (metres). A cell is pitch wide; the flap is cellW x cellH split at the axle.
  board: {
    pitch: 0.3,           // cell centre spacing in a row
    cellW: 0.268,         // flap width
    cellH: 0.42,          // full flap height (both halves)
    axleGap: 0.009,       // visible gap between the two halves (the axle line)
    flapCorner: 0.018,    // outer corner radius of a flap half
    flapThickness: 0.004,
    rowPitch: 0.585,
    slotPad: [0.07, 0.07], // [x, y] clearance between cells and the slot walls
    blockGap: 0.36,       // gap between column blocks in a row
    labelW: 0.56,         // row-label column at the left
    lampW: 0.66,          // lamp column at the right
    lampSpacing: 0.15,    // centre spacing of the lamps in a row
    colLabelH: 0.34,      // printed column-label strip under the header
    footerGap: 0.14,
    margin: [0.32, 0.3],  // frame margin [x, y]
    recess: 0.085,        // face plate front sits this far in front of the hinge plane
    plateDepth: 0.06,
    frameBar: 0.16,       // brushed outer frame bar width
    housingDepth: 0.55,   // box behind the face plate (sides read under parallax)
    spoolR: 0.034,
    misalign: { x: 0.0025, y: 0.003, rot: 0.006 }, // per-cell seeded jitter (m, m, rad)
    seed: 7,
  },
  // Glyph atlas (canvas): every character rendered as a whole flap face; halves sample its top/bottom.
  atlas: {
    charset: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.:/&'",
    cellPx: [168, 264],
    cols: 8,
    font: '"DIN Condensed", "DIN Alternate", "Helvetica Neue", Arial, sans-serif',
    weight: 700,
    capHeight: 0.66,     // glyph cap height / flap height
    glyphWidth: 0.86,    // max glyph advance / flap width (condensed fallback squeezes to this)
    hingeShade: 0.32,    // darkening toward the axle on both halves
  },
  textures: {
    brushed: { size: [512, 512], streak: 90, seed: 31, contrast: 0.22, description: "horizontal brushed-metal streaks (fbm stretched along x)" },
    powder: { size: 256, scale: 48, octaves: 3, seed: 12, description: "fine powder-coat orange-peel bump" },
    wall: { size: 512, scale: 6, octaves: 5, seed: 4, colorA: "#1a1d21", colorB: "#2c3036", description: "concrete-ish hall wall" },
  },
  materials: {
    housing: { type: "standard", baseColor: "#25282c", roughness: 0.62, metalness: 0.55, bump: { scale: 48, octaves: 3, seed: 12, strength: 0.35, description: "powder-coat orange peel" } },
    slot: { type: "standard", baseColor: "#0d0e10", roughness: 0.85, metalness: 0.2 },
    brushed: { type: "physical", baseColor: "#8e9297", roughness: 0.34, metalness: 1.0 },
    frame: { type: "standard", baseColor: "#7d8187", roughness: 0.46, metalness: 1.0 }, // outer bars: no anisotropy (beaded highlights on rounded edges)
    flap: { type: "standard", baseColor: "#ffffff", roughness: 0.48, metalness: 0.15 },
    spool: { type: "standard", baseColor: "#5b5f64", roughness: 0.38, metalness: 0.9 },
    axle: { type: "standard", baseColor: "#2b2d30", roughness: 0.4, metalness: 0.9 },
    paint: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0 },
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    lampOff: { type: "physical", baseColor: "#1b1b1b", roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 },
    bezel: { type: "standard", baseColor: "#9a9ea4", roughness: 0.25, metalness: 1 },
  },
  brushedAnisotropy: 0.75,   // MeshPhysicalMaterial.anisotropy on brushed parts
  lamps: { colors: ["amber", "green", "red"], r: 0.052, spacing: 0.15, onStrength: 1.5, offStrength: 0.02, offTint: 0.035, blinkHz: 2.2, blinkDuty: 0.58 },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#9fb0c8", groundColor: "#120d08", intensity: 0.32 },
    { id: "key", type: "directional", color: "#ffd7a3", intensity: 3.4, position: [-7.5, 7.5, 6.5], target: [0.4, -0.3, 0],
      shadow: { softness: 3, mapSize: 4096, extent: 6.2, near: 2, far: 30, bias: -0.0003, normalBias: 0.01 } },
    { id: "fill", type: "directional", color: "#8ea6c9", intensity: 0.35, position: [8, -1, 7], target: [0, 0, 0] },
    { id: "rim", type: "directional", color: "#ffcf96", intensity: 0.6, position: [3, 9, -4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.55, radius: 0.5, threshold: 0.95 },
    vignette: { darkness: 0.55, offset: 1.0 },
    grain: { amount: 0.022, fps: 30 },
  },
  camera: { fov: 28, near: 0.5, far: 60, drift: { amp: 0.02, speed: 0.25 } },
  text: { font: '"DIN Condensed", "Helvetica Neue", Arial, sans-serif', weight: 700, color: "#cbbf9f", height: 0.18 },
  // Signature motion (all read by the pure planner in flaps.js).
  tuning: {
    rate: 15,              // flips per second (base)
    rateJitter: 0.09,      // ± fraction per cell (non-integer rates so 30 fps samples sweep the fall)
    colStagger: 0.034,     // s between neighbouring columns -> left-to-right ripple
    startJitter: 0.022,    // ± s per cell
    fallFrac: 0.78,        // fraction of a flip period spent falling
    fallKick: 0.28,        // initial angular velocity share (rest is gravity-like u^2)
    bounceAmp: 0.17,       // rad, first rebound off the stop
    bounceHalf: 0.07,      // s, half-period of the rebound
    bounceDecay: 13,       // 1/s
    bounceHold: 0.4,       // s the final flip keeps bouncing before the flap is parked
  },
  sfx: { enter: "clack", exit: "clack", move: "tick", land: "click", emphasis: "chime", ui: "tick", bed: "rumble" },
  motion: [
    "Characters never cut: each cell steps forward through the charset (blank, A-Z, 0-9, punctuation) one flap at a time, ~15 flips/s.",
    "Cells in a row start ~0.034 s apart left to right with seeded jitter, so rows resolve as a ripple with different arrival times.",
    "Each flap falls gravity-style about the centre axle (front = top of the old character, back = bottom of the new) and rebounds off the stop.",
    "Lamps switch when a row's status settles; NOW BOARDING blinks green.",
    "Camera: slow push-in with gentle lateral drift so the recessed slots and housing depth parallax; never cut.",
  ],
};
