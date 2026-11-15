// styles/thermal-camera/spec.js — STYLE_SPEC for "Thermal Camera". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the heat plan + score) and the browser.
// Units: metres (a desk set, ~1.4x toy scale so a hand and a heat sink read at 1080p), Y-up, sRGB hex, radians,
// temperatures in degrees C (INVENTED: every reading on screen sits under a SAMPLE DATA tag).
//
// The look: a handheld thermal imager's view of ordinary objects. Geometry is plain; what changes is what is measured.
// Every part carries a temperature that is a closed-form function of t (heat.js: sources with on/off times, exponential
// approach and cooling, a conduction front that creeps along a part with sqrt(t), residual prints that spread and fade).
// The scene renders TEMPERATURE, not light: an unlit shader writes a normalised temperature (lower at grazing angles,
// like real emissivity), and a sensor pass blurs it a little, adds a faint pixel grid and seeded noise, then maps it
// through an ironbow palette. The imager HUD (crosshair + spot reading, colour scale bar, SAMPLE DATA) is overlay text.

export const STYLE_SPEC = {
  id: "thermal-camera",
  name: "Thermal Camera",
  description:
    "A handheld thermal imager's view of ordinary objects: the picture is temperature, not light. Plain geometry (a desk, a PC tower with its side open, a monitor, a keyboard, a mug, a hand) rendered with an unlit temperature shader through an ironbow palette (black, deep purple, magenta, orange, yellow, white). Things glow because work is happening in them: heat sources switch on and approach their temperature exponentially, a conduction front creeps along heat sinks and boards with sqrt(t), exhaust air rises as a warm plume, a hand pressed on the desk leaves a print that spreads and fades, and everything slides back down the palette when the work stops. Slightly cooler at grazing angles (emissivity) so forms still read. Sensor character: soft low-resolution blur, a faint pixel grid, gentle seeded noise. Imager HUD on the overlay: centre crosshair with a spot reading, a vertical colour scale with min/max, and a SAMPLE DATA tag because every temperature is invented.",
  palette: {
    bg: "#0a0614",
    ink: "#f4f1ea",
    hud: "#f4f1ea",
    hudDim: "#b9b3c9",
    plate: "rgba(10,6,20,0.62)",
    edge: "rgba(244,241,234,0.35)",
    amber: "#ffc23d",
    // ironbow: [u, sRGB hex], u = (T - range.min) / (range.max - range.min); interpolated in sRGB (the designed look)
    ironbow: [
      [0.0, "#04020c"],
      [0.1, "#140a46"],
      [0.22, "#3b0f80"],
      [0.36, "#82148c"],
      [0.5, "#c8285f"],
      [0.62, "#ec5a25"],
      [0.75, "#fb9a1a"],
      [0.88, "#fedb45"],
      [1.0, "#fffcec"],
    ],
  },
  world: {
    background: null,      // style.js clears to the wall's normalised temperature (the target holds temperature, not colour)
    fog: null,
    environment: null,
    toneMapping: "none",   // the sensor pass writes the palette colour exactly; OutputPass only converts to sRGB
    exposure: 1.0,
  },
  materials: {},           // every surface uses the one thermal shader (style.js); temperature is a vertex attribute
  lights: [],              // unlit: a thermal image has no lighting
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },   // a lens falloff; the sensor pass is inserted before tone mapping
  },
  camera: { fov: 34, near: 0.05, far: 20, drift: { amp: 0, speed: 0.2 } },   // no drift: the crosshair IS the camera target
  text: { font: "sans", weight: 700, color: "#f4f1ea", height: 0.05 },

  // ---- what is measured --------------------------------------------------------------------------------------
  range: { min: 14, max: 50 },          // degrees C mapped to the ironbow; fixed (not auto-ranging) so the story reads
  ambient: { room: 22, desk: 21.2, wall: 17.2, floor: 19, reflected: 14 },  // reflected = what a grazing surface mirrors
  emissivity: { face: 1.0, grazing: 0.62, power: 0.6 },  // eps = mix(grazing, face, |N.V|^power): cooler at silhouettes
  form: { top: 0.7 },                  // degrees C added on up-facing surfaces (warm air rises): faces separate a little

  // ---- sensor character (deterministic: noise = hash(sensor cell, frame)) ----------------------------------------
  sensor: {
    cell: 3,            // output px per sensor pixel (a 640x360 detector upscaled)
    blur: 1.35,         // gaussian sigma in output px (optics + detector softness)
    grid: 0.035,        // darkening at sensor-cell borders (faint pixel grid)
    noise: 0.0045,      // temporal noise amplitude in normalised temperature (per cell, per frame)
    fixed: 0.003,       // fixed-pattern column noise (static)
    fps: 30,
  },

  // ---- the set (style.js props) ------------------------------------------------------------------------------
  set: {
    desk: { w: 1.9, d: 0.95, t: 0.04, segX: 300, segZ: 150 },
    wall: { z: -0.5, w: 4.5, h: 2.2 },
    floor: { y: -0.75, size: 6 },
    tower: { x: -0.55, z: -0.13, len: 0.44, h: 0.46, thick: 0.22, wallT: 0.012, cpu: [0.05, 0.29] },
    monitor: { x: 0.08, z: -0.27, w: 0.58, h: 0.34, t: 0.024, lift: 0.13 },
    keyboard: { x: 0.08, z: 0.06, w: 0.44, d: 0.15, h: 0.018, cols: 14, rows: 5 },
    mug: { x: 0.66, z: -0.08, r: 0.05, h: 0.11 },
  },
  hand: {
    scale: 1.45,        // toy exaggeration of a real hand
    yaw: 0.62,          // fingers point back-left, wrist toward front-right
    palm: { w: 0.084, l: 0.094, t: 0.028, r: 0.02 },
    fingers: [          // [x at palm front, length, radius, splay rad] index -> little (thumb side is -x)
      [-0.031, 0.072, 0.0092, -0.09],
      [-0.0105, 0.082, 0.0095, -0.03],
      [0.0105, 0.077, 0.0092, 0.03],
      [0.031, 0.062, 0.0085, 0.1],
    ],
    thumb: { from: [-0.036, 0.018], to: [-0.078, -0.03], r: 0.0115 },
    arm: { r: 0.032, len: 0.5, rise: 0.55 },
    skin: 33.5, fingerSkin: 31.5,
  },

  // ---- heat feel (heat.js) ------------------------------------------------------------------------------------
  heat: {
    sources: {
      cpu: { up: 0.9, down: 1.8 },
      gpu: { up: 1.1, down: 1.9 },
      display: { up: 0.8, down: 1.7 },
      shell: { up: 2.6, down: 3.5 },
      fan: { up: 1.3, down: 1.0 },
    },
    // dT = peak rise over ambient; lambda = decay length along the part (m); k = conduction front speed (m / sqrt(s))
    parts: {
      cpu: { src: "cpu", dT: 50 },
      sinkBase: { src: "cpu", dT: 42, lambda: 0.5 },
      sink: { src: "cpu", dT: 38, lambda: 0.32, k: 0.11, w: 0.022 },
      board: { src: "cpu", dT: 16, lambda: 0.1, k: 0.09, w: 0.03 },
      gpu: { src: "gpu", dT: 34, lambda: 0.13, k: 0.1, w: 0.03 },
      psu: { src: "shell", dT: 9, lambda: 0.5 },
      shell: { src: "shell", dT: 6, lambda: 0.35 },
      fan: { src: "fan", dT: 17, lambda: 0.5 },
      screen: { src: "display", dT: 13, lambda: 0.3 },
      monitorBack: { src: "display", dT: 6, lambda: 0.3 },
      keyboard: { src: "shell", dT: 1.6, lambda: 1 },
      deskHalo: { src: "shell", dT: 7, lambda: 0.05 },
    },
    standby: { tower: 0.6, monitor: 1.0, mug: 0.9, keyboard: 0.6 },   // tiny offsets: objects are not all identical
    print: { dT: 11.5, rise: 0.35, fade: 2.6, width: 0.004, spread: 0.009 },   // handprint: contact warms, lift fades + blurs (sqrt t)
    plume: { puffs: 16, rate: 4, rise: 0.4, size: [0.09, 0.26], dT: 20, alpha: 0.42, wobble: 0.03 },
  },

  // ---- imager HUD (overlay = exact colours, crisp, inside the safe area) ------------------------------------------
  hud: {
    font: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
    uiFont: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    caption: { x: 110, y: 72, h: 84, cap: 36 },
    tag: { text: "SAMPLE DATA", x: 1810, y: 76, h: 54, cap: 24 },
    bar: { x: 1752, y: 210, w: 30, h: 600 },
    cross: { size: 46, gap: 12, line: 3 },
    info: { x: 110, y: 980, cap: 22, text: "IRONBOW   ε 0.95   SPOT" },
  },

  sound: {
    bed: { gain: 0.55, root: 98, brightness: 650 },
    fan: { gain: 0.16, hz: 92 },
    spin: { gain: 0.32, hz: 70, hz2: 210 },
    down: { gain: 0.26, hz: 200, hz2: 55 },
    beep: { gain: 0.13, notes: [12, 19] },
    touch: { gain: 0.42, pitch: 0.7 },
    lift: { gain: 0.14 },
  },
  sfx: { enter: "blip", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "servo", ui: "blip", bed: "pad" },
  motion: [
    "Nothing moves to tell the story: temperature does. Each part's temperature is a closed form of t (heat.js); the picture reads it every frame.",
    "Sources switch on and approach their target exponentially; after switch-off they cool exponentially.",
    "Conduction: a front creeps along heat sinks and boards with reach k*sqrt(t - on); temperature falls off with distance from the source.",
    "Residual heat: a hand pressed on the desk leaves a print that keeps the shape, blurs with sqrt(t) and fades over seconds.",
    "Camera holds still during holds; the centre crosshair is the camera target, so the spot reading is the thing in the middle.",
  ],
};
