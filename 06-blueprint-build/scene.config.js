// scene.config.js — 06-blueprint-build: "Anatomy of an AI agent" as a plotted blueprint. Plain data only (Node-importable).
// Units: 3D drawing in metres (Y-up, assembly centred on the MODEL core); sheet layer in PIXELS (1920x1080, y down).
export const ID = "06-blueprint-build";
export const STYLE = "blueprint-build";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "sheet", t: 0.0, dur: 1.3 },   // grid fades up, border + title-block frame + construction lines plot
  { id: "model", t: 1.3, dur: 2.2 },   // MODEL core plots
  { id: "tools", t: 3.5, dur: 2.9 },   // three TOOL modules plot, slide out along their axes, connectors
  { id: "memory", t: 6.4, dur: 2.0 },  // MEMORY drum stack plots, then explodes along the centre-line
  { id: "tilt", t: 8.45, dur: 2.0 },   // front elevation -> isometric; hatch + top-face icons plot
  { id: "loop", t: 10.45, dur: 2.0 },  // loop arrow traces round the assembly: THINK -> ACT -> CHECK
  { id: "dims", t: 12.45, dur: 2.55 }, // dimensions + title block lettering complete
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---- the assembly (metres) ----
export const PART = {
  core: { profile: [[0, -0.6], [0.86, -0.6], [1.0, -0.46], [1.0, 0.1], [0.94, 0.15], [0.94, 0.22], [1.0, 0.27], [1.0, 0.46], [0.86, 0.6], [0.56, 0.6], [0.56, 0.68], [0, 0.68]], segments: 96 },
  tools: [
    { id: "search", label: "SEARCH", angle: -Math.PI / 2, icon: "magnifier" },
    { id: "code", label: "CODE", angle: Math.PI / 2, icon: "code" },
    { id: "files", label: "FILES", angle: Math.PI, icon: "folder" },
  ],
  tool: { w: 1.0, h: 0.72, d: 0.72, chamfer: 0.06, r0: 1.95, r1: 2.55, connector: 0.09 },
  memory: { r: 0.82, h: 0.26, chamfer: 0.035, top: -0.98, gap0: 0.035, gap1: 0.27, shaft: 0.16, count: 3 },
  loop: { center: [0, 0.2, 0], radius: 3.3, start: 1.0, sweep: 5.2, labels: [0.23, 0.53, 0.83] }, // THINK right, ACT back, CHECK left (iso)
  hatch: { radius: 0.5, y: 0.682 },
};

// ---- camera: spherical pose (az from +Z toward +X, el up), long lens, lens shift in px ----
export const VIEW = {
  front: { az: 0, el: 0, dist: 46, target: [0, -0.72, 0], fov: 9, shift: [-50, 20] },
  iso: { az: 0.62, el: 0.5, dist: 46, target: [0, -0.5, 0], fov: 9, shift: [-50, 20] },
  tilt: [at("tilt"), at("tilt", 1.95)],
  // ortho "distance" (frustum size) keys: tight on the lone core, easing out as parts arrive, settling in iso
  zoom: [[0, 34], [at("tools", 0.3), 34], [at("memory", 0.6), 43], [at("tilt"), 43], [at("tilt", 1.95), 46]],
};
const pose = (v) => {
  const { az, el, dist, target: g } = v;
  return [g[0] + dist * Math.cos(el) * Math.sin(az), g[1] + dist * Math.sin(el), g[2] + dist * Math.cos(el) * Math.cos(az)];
};
// exported for spec/Blender translators (scene.js drives the camera spherically from VIEW, not by lerping these)
export const CAMERA = [
  { t: 0, pos: pose(VIEW.front), target: VIEW.front.target, fov: 9 },
  { t: VIEW.tilt[0], pos: pose(VIEW.front), target: VIEW.front.target, fov: 9 },
  { t: VIEW.tilt[1], pos: pose(VIEW.iso), target: VIEW.iso.target, fov: 9, ease: "inOutCubic" },
];

// ---- plotting schedule: [start, end] seconds per drawable (one pen at a time where it matters) ----
const tw = (a, b) => [a, b];
export const PLOT = {
  grid: tw(0.05, 0.85),
  border: tw(0.1, 1.05),
  titleFrame: tw(0.35, 1.2),
  construct: tw(0.55, 1.4),
  core: tw(at("model", 0.05), at("model", 1.35)),
  tagModel: tw(at("model", 1.2), at("model", 1.85)),
  axes: tw(at("tools", 0.0), at("tools", 0.45)),
  tools: [0, 1, 2].map((k) => tw(at("tools", 0.35 + k * 0.32), at("tools", 1.15 + k * 0.32))),
  slide: [0, 1, 2].map((k) => tw(at("tools", 1.25 + k * 0.32), at("tools", 1.75 + k * 0.32))),
  connectors: [0, 1, 2].map((k) => tw(at("tools", 1.75 + k * 0.32), at("tools", 2.1 + k * 0.32))),
  tagTools: [0, 1, 2].map((k) => tw(at("tools", 1.5 + k * 0.3), at("tools", 2.05 + k * 0.3))),
  memory: tw(at("memory", 0.05), at("memory", 0.95)),
  explode: tw(at("memory", 0.95), at("memory", 1.45)),
  tagMemory: tw(at("memory", 1.2), at("memory", 1.8)),
  hatch: tw(at("tilt", 1.35), at("tilt", 1.95)),
  icons: tw(at("tilt", 1.05), at("tilt", 1.95)),
  loop: tw(at("loop", 0.1), at("loop", 1.45)),
  dims: [tw(at("dims", 0.0), at("dims", 0.8)), tw(at("dims", 0.35), at("dims", 1.1))],
  titleText: tw(at("dims", 0.55), at("dims", 1.5)),
  titleFields: tw(at("dims", 1.2), at("dims", 1.9)),
};
PLOT.loopTags = PART.loop.labels.map((u) => tw(PLOT.loop[0] + u * (PLOT.loop[1] - PLOT.loop[0]) + 0.05, PLOT.loop[0] + u * (PLOT.loop[1] - PLOT.loop[0]) + 0.5));

// ---- sheet layer (px) ----
export const SHEET = {
  caption: { x: 118, y: 152, cap: 46, fadeOut: 0.35 },
  captions: [
    { text: "MODEL", t: at("model", 0.0) },
    { text: "TOOLS: SEARCH · CODE · FILES", t: at("tools", 0.0) },
    { text: "MEMORY", t: at("memory", 0.0) },
    { text: "LOOP: THINK → ACT → CHECK", t: at("loop", 0.0) },
    { text: "AI AGENT — ASSEMBLY VIEW", t: at("dims", 0.15) },
  ],
  titleBlock: { x: 1196, y: 866, w: 604, h: 140, titleCap: 26, title: "AI AGENT — ASSEMBLY VIEW",
    fields: [["DRAWN", "ATLAS"], ["SCALE", "1:20"], ["SHEET", "1 OF 1"], ["DWG NO.", "AA-06"]] },
  tags: {
    // x, y = label baseline in the front elevation; iso = where it glides to during the tilt
    model: { text: "MODEL", x: 1270, y: 262, iso: [236, 580], anchor: [0, 0.32, 1.0] },
    search: { text: "SEARCH", x: 268, y: 330, iso: [262, 296], anchor: [-2.55, 0.36, 0.0] },
    code: { text: "CODE", x: 1470, y: 392, iso: [1478, 384], anchor: [2.55, 0.36, 0.0] },
    files: { text: "FILES", x: 560, y: 252, iso: [1300, 214], anchor: [-0.3, 0.36, -2.55] },
    memory: { text: "MEMORY", x: 1120, y: 802, iso: [1110, 822], anchor: [0.64, -2.05, 0.5] },
  },
  // loop stations: label offset (px) from the projected ring point; the leader is a short stub
  loopTags: [
    { text: "THINK", dx: 34, dy: 14, align: "left" },
    { text: "ACT", dx: 0, dy: -24, align: "center" },
    { text: "CHECK", dx: -34, dy: 14, align: "right" },
  ],
  tagCap: 28,
};

// ---- dimensions (3D, metres) ----
export const DIMS = [
  { a: [-0.82, -2.36, 0.9], b: [0.82, -2.36, 0.9], offset: [0, -0.48, 0], text: "Ø1640" },
  { a: [-0.82, -2.28, 0.0], b: [-0.82, -0.98, 0.0], offset: [-1.05, 0, 0], text: "1300" },
];

// ---- objects for export-spec / translators (built in scene.js with style factories) ----
export const OBJECTS = [
  { id: "sheet", primitive: "procedural", factory: "sheet", procedural: "full-frame cyanotype paper: Prussian-blue wash with fbm mottling, fibres, two fold creases, vignette, per-pixel grain; 27 px drafting grid (major every 135 px) that fades in" },
  { id: "core", primitive: "procedural", factory: "lathe", procedural: "MODEL core: lathe-turned chamfered cylinder Ø2.0 x 1.28 m with a groove band and a Ø1.12 boss, drawn as hidden-line edges (feature creases > 24°, view-dependent silhouettes)" },
  { id: "tools", primitive: "procedural", factory: "chamferBox", procedural: "three TOOL modules 1.0 x 0.72 x 0.72 m chamfered boxes at r = 2.55 m (left, right, back), each on a Ø0.18 connector shaft, top-face icons" },
  { id: "memory", primitive: "procedural", factory: "drum", procedural: "MEMORY stack: three chamfered drums Ø1.64 x 0.26 m on a Ø0.32 shaft under the core; explodes along the vertical centre-line" },
  { id: "loop", primitive: "procedural", factory: "loopArrow", procedural: "loop arrow: R 3.3 m ring at y = 0.2 sweeping 310° with a filled arrowhead; hidden stretches dashed" },
];

// ---- SCORE: every cue derives from BEATS / PLOT ----
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
let tickId = 0;
const pen = (w, { gain = 1, pan = 0, motor = false } = {}) => {
  const [a, b] = w, d = Math.max(0.08, b - a), out = [
    { t: a, type: "click", gain: 0.34 * gain, pitch: 1.25, pan },                       // pen down
    { t: a + 0.01, type: "paper", dur: d, density: 0.62, pitch: 1.7, gain: 0.2 * gain, pan }, // nib scratch
    { t: b, type: "click", gain: 0.2 * gain, pitch: 0.85, pan },                        // pen up
  ];
  for (let s = a + 0.05; s < b - 0.02; s += 0.075) out.push({ t: s, type: "tick", gain: 0.11 * gain, pitch: 0.8 + hash(tickId++) * 0.5, pan });
  if (motor) out.push({ t: a, type: "buzz", dur: d, hz: 150, flicker: 0, gain: 0.035 * gain, pan });
  return out;
};
export const SCORE = [
  { t: 0, type: "hum", dur: DURATION, gain: 0.03, pitch: 0.9 },                       // plotter idle room tone
  { t: 0.02, type: "fold", dur: 0.55, gain: 0.5 },                                     // sheet laid on the table
  ...pen(PLOT.border, { gain: 0.7 }),
  ...pen(PLOT.construct, { gain: 0.6, pan: -0.2 }),
  ...pen(PLOT.core, { motor: true }),
  ...pen(PLOT.tagModel, { gain: 0.6, pan: 0.4 }),
  ...pen(PLOT.axes, { gain: 0.5 }),
  ...PLOT.tools.flatMap((w, k) => pen(w, { gain: 0.8, pan: [-0.5, 0.5, 0][k], motor: true })),
  ...PLOT.slide.flatMap((w, k) => [
    { t: w[0], type: "whoosh", dir: "in", dur: w[1] - w[0], gain: 0.13, pitch: 0.7, pan: [-0.5, 0.5, 0][k] },
    { t: w[1], type: "clack", gain: 0.42, pitch: 1.1, pan: [-0.5, 0.5, 0][k] },
  ]),
  ...PLOT.tagTools.flatMap((w, k) => pen(w, { gain: 0.45, pan: [-0.5, 0.5, 0][k] })),
  ...pen(PLOT.memory, { motor: true }),
  { t: PLOT.explode[0], type: "whoosh", dir: "in", dur: PLOT.explode[1] - PLOT.explode[0], gain: 0.15, pitch: 0.6 },
  { t: PLOT.explode[1] - 0.12, type: "clack", gain: 0.35, pitch: 1.3 },
  { t: PLOT.explode[1], type: "clack", gain: 0.45, pitch: 1.0 },
  ...pen(PLOT.tagMemory, { gain: 0.5, pan: -0.4 }),
  { t: at("tilt", 0.0), type: "whoosh", dir: "in", dur: 1.9, gain: 0.24, pitch: 0.55 },
  { t: at("tilt", 1.85), type: "thud", gain: 0.22, pitch: 1.4 },
  ...pen(PLOT.icons, { gain: 0.5 }),
  ...pen(PLOT.loop, { motor: true }),
  ...PLOT.loopTags.map((w, k) => ({ t: w[0], type: "blip", notes: [0], dur: 0.06, gain: 0.16, pitch: [1.0, 1.26, 1.5][k] })),
  ...PLOT.dims.flatMap((w) => [...pen(w, { gain: 0.6 }), { t: w[0] + 0.66 * (w[1] - w[0]), type: "tick", gain: 0.45 }, { t: w[0] + 0.7 * (w[1] - w[0]), type: "tick", gain: 0.45 }]),
  ...pen(PLOT.titleText, { gain: 0.8, motor: true }),
  ...pen(PLOT.titleFields, { gain: 0.45 }),
  { t: PLOT.titleFields[1] + 0.12, type: "clack", gain: 0.55, pitch: 0.75 },              // rubber stamp
  { t: PLOT.titleFields[1] + 0.13, type: "thud", gain: 0.3, pitch: 1.6 },
  ...SHEET.captions.map((c, k) => ({ t: c.t, type: "fold", dur: 0.35, gain: 0.1 + (k === 4 ? 0.06 : 0), pitch: 1.3 })), // page-turn whisper on each note
];
export const DUCK = [];
export const NOTES = "Assembly geometry, plot windows and sheet layout are data here; scene.js builds them with blueprint-build props and drives progress from PLOT.";
