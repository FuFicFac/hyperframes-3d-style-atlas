// scene.js — 06-blueprint-build: "Anatomy of an AI agent" plotted on a cyanotype sheet. Every frame is a pure function of t.
import * as THREE from "three";
import { createStage, clamp, lerp, ease, smoothstep } from "./_atlas/kit/core.js";
import { createStyle, shapes } from "./_atlas/styles/blueprint-build/style.js";
import { DURATION, SCORE, DUCK, PART, VIEW, PLOT, SHEET, DIMS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadows: false, toneMapping: "none", background: 0x1a5296 });
const style = createStyle(stage);
const { props, helpers, spec } = style;
const P = (w, t, e = "inOutSine") => ease[e](clamp((t - w[0]) / (w[1] - w[0])));

// ---------------------------------------------------------------- sheet layer
const sheet = props.sheet();
const border = props.border();
const tb = props.titleBlock(SHEET.titleBlock);

// ---------------------------------------------------------------- construction + axes
const construct = props.lines([
  [[-3.4, 0.68, 0], [3.4, 0.68, 0]], [[-3.4, -0.6, 0], [3.4, -0.6, 0]],
  [[-1, 1.15, 0], [-1, -2.55, 0]], [[1, 1.15, 0], [1, -2.55, 0]],
], { kind: "construction", order: "parallel" });
const axisV = props.centreLine([0, 1.3, 0], [0, -2.8, 0]);
const axes = props.lines([[[0, 0, 0], [-3.45, 0, 0]], [[0, 0, 0], [3.45, 0, 0]], [[0, 0, 0], [0, 0, -3.4]]], { kind: "centre", dash: "centre", order: "parallel" });
stage.scene.add(construct, axisV, axes);

// ---------------------------------------------------------------- MODEL core
const core = props.hiddenLine(shapes.lathe(PART.core.profile, PART.core.segments), { name: "core", hidden: "none" });
stage.scene.add(core);
const hatch = props.hatch(shapes.circle(PART.hatch.radius, 64, { u: [1, 0, 0], v: [0, 1, 0] }).map((p) => [p[0], p[1]]), { origin: [0, PART.hatch.y + 0.003, 0], u: [1, 0, 0], v: [0, 0, 1] });
stage.scene.add(hatch);

// ---------------------------------------------------------------- TOOLS
const T = PART.tool;
const ICON = {
  magnifier: [shapes.circle(0.13, 48, { center: [-0.05, 0.04, 0] }), [[0.045, -0.055], [0.2, -0.2]]],
  code: [[[-0.12, 0.13], [-0.27, 0], [-0.12, -0.13]], [[0.06, 0.17], [-0.06, -0.17]], [[0.12, 0.13], [0.27, 0], [0.12, -0.13]]],
  folder: [[[-0.26, -0.17], [0.26, -0.17], [0.26, 0.12], [0.0, 0.12], [-0.05, 0.18], [-0.26, 0.18], [-0.26, -0.17]], [[-0.26, 0.06], [0.26, 0.06]]],
};
const tools = PART.tools.map((d) => {
  const arm = new THREE.Group();
  arm.rotation.y = d.angle;
  const box = props.hiddenLine(shapes.chamferBox(T.w, T.h, T.d, T.chamfer), { name: `tool:${d.id}` });
  const top = T.h / 2 + 0.003;
  // icon frame faces the iso camera: icon-right = camera right, icon-up = away from camera on the top face; into box space
  const az = VIEW.iso.az, R = [Math.cos(az), -Math.sin(az)], Up = [-Math.sin(az), -Math.cos(az)], c = Math.cos(-d.angle), s = Math.sin(-d.angle);
  const toLocal = ([x, y]) => { const wx = (R[0] * x + Up[0] * y) * 1.25, wz = (R[1] * x + Up[1] * y) * 1.25; return [wx * c + wz * s, top, -wx * s + wz * c]; };
  const icon = props.lines(ICON[d.icon].map((st) => st.map(toLocal)), { kind: "detail", order: "sequential" });
  const panel = props.lines([shapes.rect(-0.38, -0.22, 0.38, 0.22).map(([x, y]) => [x, y, T.d / 2 + 0.003])], { kind: "detail" });
  box.add(icon, panel);
  const cg = new THREE.CylinderGeometry(T.connector, T.connector, 1, 40, 1, true);
  cg.rotateX(Math.PI / 2); cg.translate(0, 0, 0.5);
  const conn = props.hiddenLine(cg, { name: `conn:${d.id}`, hidden: "none", drawAxis: [0, 0, 1], silWindow: [0, 1] });
  conn.position.z = 0.98;
  arm.add(box, conn);
  stage.scene.add(arm);
  return { ...d, arm, box, icon, panel, conn };
});

// ---------------------------------------------------------------- MEMORY
const M = PART.memory;
const sg = new THREE.CylinderGeometry(M.shaft, M.shaft, 1, 40, 1, true);
const shaft = props.hiddenLine(sg, { name: "shaft", hidden: "none" });
shaft.position.y = (-0.6 + M.top) / 2; shaft.scale.y = -0.6 - M.top;
const discs = Array.from({ length: M.count }, (_, k) => props.hiddenLine(shapes.drum(M.r, M.h, M.chamfer, 80), { name: `memory:${k}`, hidden: "none" }));
stage.scene.add(shaft, ...discs);
const discY = (k, gap) => M.top - M.h / 2 - k * (M.h + gap);

// ---------------------------------------------------------------- LOOP + DIMENSIONS
const loop = props.loopArrow(PART.loop);
stage.scene.add(loop);
const dims = DIMS.map((d) => props.dimension(d.a, d.b, { offset: d.offset, text: d.text }));
stage.scene.add(...dims);

// ---------------------------------------------------------------- tags, captions, plotter head
const tag = (k) => props.callout(SHEET.tags[k].text, { ...SHEET.tags[k], cap: SHEET.tagCap });
const tags = { model: tag("model"), search: tag("search"), code: tag("code"), files: tag("files"), memory: tag("memory") };
const loopTags = SHEET.loopTags.map((o, k) => props.callout(o.text, { ...o, x: 0, y: 0, shoulder: 10, cap: SHEET.tagCap, anchor: loop.userData.pointAt(PART.loop.labels[k]) }));
const C = SHEET.caption;
const captions = SHEET.captions.map((c) => {
  const m = props.sheetText(c.text, { x: C.x, y: C.y, cap: C.cap });
  const dur = Math.max(spec.plot.minTime, [...c.text].filter((ch) => ch !== " ").length * spec.plot.charTime);
  return { ...c, m, w: [c.t, c.t + dur] };
});
const head = props.plotterHead();

// drawables the pen can be on, in priority order (later wins when windows overlap)
const PEN = [
  [border, PLOT.border], [tb.userData.frame, PLOT.titleFrame], [construct, PLOT.construct],
  ...captions.map((c) => [c.m, c.w]),
  [core, PLOT.core], [tags.model, PLOT.tagModel], [axes, PLOT.axes],
  ...tools.flatMap((x, k) => [[x.box, PLOT.tools[k]], [x.conn, PLOT.connectors[k]]]),
  ...["search", "code", "files"].map((k, i) => [tags[k], PLOT.tagTools[i]]),
  [discs[0], PLOT.memory], [tags.memory, PLOT.tagMemory],
  ...tools.map((x) => [x.icon, PLOT.icons]), [hatch, PLOT.hatch],
  [loop, PLOT.loop], ...loopTags.map((l, k) => [l, PLOT.loopTags[k]]),
  [dims[0], PLOT.dims[0]], [dims[1], PLOT.dims[1]], [tb.userData.title, PLOT.titleText], [tb.userData.fields, PLOT.titleFields],
];
const MEM_SPLIT = 1 / M.count; // memory discs plot one after another inside PLOT.memory

const zoomAt = (t) => {
  const Z = VIEW.zoom;
  if (t <= Z[0][0]) return Z[0][1];
  for (let i = 1; i < Z.length; i++) if (t < Z[i][0]) return lerp(Z[i - 1][1], Z[i][1], ease.inOutSine((t - Z[i - 1][0]) / (Z[i][0] - Z[i - 1][0])));
  return Z[Z.length - 1][1];
};

function renderAt(t) {
  // camera: spherical tilt from front elevation to isometric
  const u = P(VIEW.tilt, t, "inOutCubic"), F = VIEW.front, I = VIEW.iso;
  helpers.setCamera({
    az: lerp(F.az, I.az, u), el: lerp(F.el, I.el, u), dist: zoomAt(t), fov: lerp(F.fov, I.fov, u),
    target: F.target.map((x, i) => lerp(x, I.target[i], u)), shift: F.shift.map((x, i) => lerp(x, I.shift[i], u)),
  });

  // sheet
  sheet.userData.setGrid(P(PLOT.grid, t, "outCubic"));
  border.userData.setProgress(P(PLOT.border, t));
  tb.userData.frame.userData.setProgress(P(PLOT.titleFrame, t));
  tb.userData.title.userData.setProgress(P(PLOT.titleText, t, "linear"));
  tb.userData.fields.userData.setProgress(P(PLOT.titleFields, t, "linear"));
  construct.userData.setProgress(P(PLOT.construct, t));
  construct.userData.setLevel(1 - P(VIEW.tilt, t));   // construction lines belong to the elevation
  axisV.userData.setProgress(P(PLOT.construct, t));
  axes.userData.setProgress(P(PLOT.axes, t));

  // parts
  core.userData.setProgress(P(PLOT.core, t, "linear"));
  tools.forEach((x, k) => {
    const s = P(PLOT.slide[k], t, "inOutCubic"), R = lerp(T.r0, T.r1, s);
    x.box.position.z = R;
    x.box.userData.setProgress(P(PLOT.tools[k], t, "linear"));
    x.panel.userData.setProgress(P(PLOT.tools[k], t, "linear") >= 1 ? 1 : 0);
    x.icon.userData.setProgress(P(PLOT.icons, t, "linear"));
    x.conn.scale.z = Math.max(0.01, R - T.d / 2 - x.conn.position.z);
    x.conn.userData.setProgress(P(PLOT.connectors[k], t, "linear"));
  });
  const mp = P(PLOT.memory, t, "linear"), ex = P(PLOT.explode, t, "inOutCubic");
  shaft.userData.setProgress(clamp(mp / MEM_SPLIT));
  discs.forEach((d, k) => {
    d.position.y = discY(k, lerp(M.gap0, M.gap1, ex));
    d.userData.setProgress(clamp((mp - k * MEM_SPLIT) / MEM_SPLIT));
  });
  hatch.userData.setProgress(P(PLOT.hatch, t, "linear"));
  loop.userData.setProgress(P(PLOT.loop, t, "inOutSine"));
  dims.forEach((d, k) => d.userData.setProgress(P(PLOT.dims[k], t, "linear")));

  helpers.syncView();

  // annotation
  tags.model.userData.setProgress(P(PLOT.tagModel, t, "linear"));
  ["search", "code", "files"].forEach((k, i) => tags[k].userData.setProgress(P(PLOT.tagTools[i], t, "linear")));
  tags.memory.userData.setProgress(P(PLOT.tagMemory, t, "linear"));
  loopTags.forEach((l, k) => l.userData.setProgress(P(PLOT.loopTags[k], t, "linear")));
  const glide = smoothstep(0.2, 0.8, Math.abs(2 * u - 1)); // tags dip out while they glide to their iso spots
  for (const [k, c] of Object.entries(tags)) {
    const o = SHEET.tags[k];
    c.userData.moveTo(lerp(o.x, o.iso[0], u), lerp(o.y, o.iso[1], u));
    c.userData.setLevel(glide);
  }
  loopTags.forEach((c, k) => {
    const o = SHEET.loopTags[k], a = helpers.toSheet(loop.userData.pointAt(PART.loop.labels[k]));
    c.userData.moveTo(a[0] + o.dx, a[1] + o.dy + (o.dy < 0 ? 0 : SHEET.tagCap / 2));
  });
  for (const c of [...Object.values(tags), ...loopTags]) c.userData.sync();
  captions.forEach((c, k) => {
    const next = captions[k + 1];
    const fade = next ? 1 - clamp((t - (next.t - C.fadeOut)) / C.fadeOut) : 1;
    c.m.userData.setProgress(P(c.w, t, "linear"));
    c.m.userData.setLevel(fade);
  });

  // plotter head rides the last active pen
  let active = null;
  for (const [obj, w] of PEN) if (t >= w[0] && t < w[1] && obj.visible !== false) active = [obj, w];
  if (active && active[0] === discs[0]) {
    const k = Math.min(M.count - 1, Math.floor(mp / MEM_SPLIT));
    head.userData.place(helpers.headPx(discs[k], clamp((mp - k * MEM_SPLIT) / MEM_SPLIT)));
  } else if (active) {
    const [obj, w] = active;
    const e = obj === loop ? "inOutSine" : "linear";
    head.userData.place(helpers.headPx(obj, P(w, t, e)));
  } else head.userData.place(null);

  helpers.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
