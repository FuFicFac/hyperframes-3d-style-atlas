// scene.js — 13-wireframe-hologram: "How a neural network reads a digit". Every frame is a pure function of t.
import * as THREE from "three";
import { createStage, clamp, lerp, ease, smoothstep, hash01 } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/wireframe-hologram/style.js";
import { DURATION, SCORE, DUCK, CAMERA, NET, LAYERS, GRAPH, PLAN, SHOW, CAPTIONS, at } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadows: false });
const style = createStyle(stage, { forcedGlitches: [[at("hidden", -0.12), 0.1], [at("output", -0.1), 0.07], [at("title", -0.08), 0.1]] });
const { props } = style;
const W = (w, t, e = "inOutSine") => ease[e](clamp((t - w[0]) / (w[1] - w[0])));

// ---------------------------------------------------------------- room furniture
const table = props.table();
const projector = props.projector();
const top = projector.userData.top;
const beam = props.beam(); beam.position.y = top;
const dust = props.dust(); dust.position.y = top;
const ringA = props.hudRing({ radius: 2.85, ticks: 96, major: 8, tickLen: 0.09, arcs: [[0.2, 1.4, 0.25], [2.4, 3.1, 0.25], [4.0, 5.6, 0.25]], rate: 0.12 });
const ringB = props.hudRing({ radius: 3.6, ticks: 48, major: 4, tickLen: 0.14, arcs: [[1.0, 2.6, -0.12], [3.8, 4.4, -0.12]], rate: -0.07, phase: 0.6, level: 0.55 });
ringA.position.y = ringB.position.y = 0.012;
const gizmo = props.gizmo({ size: 0.26 }); gizmo.position.set(-3.2, 0.5, 2.0);
stage.scene.add(table, projector, beam, dust, ringA, ringB, gizmo);

// ---------------------------------------------------------------- the network (one hologram group)
const net = new THREE.Group();
stage.scene.add(net);
const input = props.pointGrid({ cols: NET.input.cols, rows: NET.input.rows, pitch: NET.input.pitch, cube: NET.input.cube, mask: NET.mask });
input.position.set(...NET.input.pos);
const hidden = NET.hidden.map((h) => {
  const l = props.nodeLayer({ cols: h.cols, rows: h.rows, pitch: h.pitch });
  l.position.set(...h.pos);
  return l;
});
const O = NET.output;
const outPos = LAYERS[LAYERS.length - 1].positions.map((p) => [0, p[1] - O.pos[1], 0]);
const output = props.nodeLayer({ positions: outPos, frame: false, pad: 0.16, nodeSize: 0.11 });
output.position.set(...O.pos);
const marker = output.userData.marker(NET.answer, 0.13);
const bars = outPos.map((p) => {
  const b = props.barReadout({ w: O.barW, h: O.barH, ticks: 10 });
  b.position.set(O.barDx, p[1], 0);
  output.add(b);
  return b;
});
const web = props.connectionWeb(GRAPH.edges.map((e) => [GRAPH.nodes[e.a].p, GRAPH.nodes[e.b].p]), { level: 0.5, seed: 7 });
net.add(web, input, ...hidden, output);
const layerProps = [input, ...hidden, output];

// ---------------------------------------------------------------- overlay
const caption = props.caption({ x: -0.86, y: 0.8, maxText: "NEURAL NETWORK · FORWARD PASS" });
const tele = props.readout({ x: 0.86, y: 0.82, maxText: "HOLO-NET 07 · INFER · T+00.00" });
const tele2 = props.readout({ x: 0.86, y: 0.76, maxText: "LAYER 5/5 · 154 NODES · 435 LINKS", color: "hud" });
const digitTags = outPos.map((_, d) => props.tag(String(d), { height: 0.03, color: "textDim", align: "left" }));
const pct = props.tag("97%", { height: 0.036, color: "accent", align: "left" });
const leaders = NET.hidden.map((h, k) => props.leader(`L${k + 1} · ${h.cols * h.rows}`, { dir: [1, 1], knee: 0.05, run: 0.1 }));

// ---------------------------------------------------------------- helpers
const nodeIdx = (layer, i) => GRAPH.base[layer] + i;
const nIn = LAYERS[0].positions.length;
const REPLAY = SHOW.replay - at("flow", 0.15);
const answerNode = nodeIdx(LAYERS.length - 1, NET.answer);
const fireEnv = (t, f, a) => (t < f ? 0 : a * (1.6 * Math.exp(-(t - f) / 0.32) + 0.75));
const _v = new THREE.Vector3();
const worldOf = (obj, p) => (obj.updateWorldMatrix(true, false), _v.set(...p).applyMatrix4(obj.matrixWorld).toArray());
const stageName = (t) => (t < at("input") ? "BOOT" : t < at("hidden") ? "LOAD" : t < at("flow") ? "BUILD" : t < at("output") ? "INFER" : t < at("title") ? "RESULT" : "HOLD");

function renderAt(t) {
  // ---- projector power-up ----
  const pw = style.powerLevel(t, SHOW.power, 5);
  const beamU = W(SHOW.beam, t, "outCubic");
  projector.userData.setLevel(pw);
  beam.userData.setLevel(pw * beamU);
  beam.scale.y = lerp(0.15, 1, beamU);
  dust.userData.setLevel(pw * beamU);
  table.userData.setGlow(pw * (0.35 + 0.65 * beamU));
  const ringsU = W(SHOW.rings, t, "inOutCubic");
  for (const r of [ringA, ringB]) { r.userData.setProgress(ringsU); r.userData.update(t); }
  gizmo.userData.setLevel(smoothstep(SHOW.rings[0], SHOW.rings[1], t) * (1 - smoothstep(at("output", -0.4), at("output", 0.1), t) + smoothstep(at("title", 0.6), at("title", 1.2), t)));
  gizmo.userData.update(t);
  style.update(t, { power: pw });

  // ---- hologram volume: slow yaw ----
  net.rotation.y = 0.05 * Math.sin(t * 0.32 + 0.4);

  // ---- materialise ----
  input.userData.setMaterialise(W(SHOW.input, t, "linear"));
  hidden.forEach((h, k) => h.userData.setMaterialise(W(SHOW.hidden[k], t, "linear")));
  output.userData.setMaterialise(W(SHOW.output, t, "linear"));
  web.userData.setMaterialise(W(SHOW.web, t, "inOutSine"));

  // ---- forward pass: input cells flash, nodes fire ----
  const flareU = smoothstep(SHOW.flare, SHOW.flare + 0.35, t);
  input.userData.cells.forEach((c, i) => {
    const f = PLAN.fire[i];
    const boost = Number.isFinite(f) ? fireEnv(t, f, 1) * 0.6 + fireEnv(t, f + REPLAY, 0.5) * 0.4 : 0;
    input.userData.setCell(i, boost, 0);
  });
  input.userData.sync();
  [...hidden, output].forEach((L, li) => {
    const layer = li + 1;
    LAYERS[layer].positions.forEach((_, i) => {
      const k = nodeIdx(layer, i), f = PLAN.fire[k], a = PLAN.act[k];
      let lvl = 0.85 + (Number.isFinite(f) ? fireEnv(t, f, a) + fireEnv(t, f + REPLAY, a * 0.45) : 0);
      const isAns = k === answerNode;
      if (isAns) lvl += flareU * 1.4;
      L.userData.setNode(i, lvl, isAns ? flareU : 0, isAns ? lerp(0.11, 0.16, flareU) : null);
    });
    L.userData.sync();
  });
  marker.userData.setOwn(flareU * (1.6 + 0.25 * Math.sin(t * 5)));
  marker.rotation.z = 0;

  // ---- pulses + carried path ----
  const pulses = [], carried = [], carriedA = [];
  GRAPH.edges.forEach((e, i) => {
    const T = PLAN.edgeT[i];
    if (!T) return;
    const acc = e.b === answerNode;
    const h = hash01(i, 77);
    for (const off of [0, REPLAY]) {
      if (!acc && h > (off ? SHOW.replayShare : SHOW.pulseShare)) continue;
      const u = (t - T.t0 - off) / T.dur;
      if (u >= 0 && u <= 1.22) pulses.push({ i, u, accent: acc && t > SHOW.flare });
    }
    if (t >= T.t0 + T.dur) (acc && t >= SHOW.flare ? carriedA : carried).push(i);
  });
  web.userData.setPulses(pulses);
  web.userData.setCarried(carried, carriedA);
  web.userData.setCarriedLevel(1 - 0.45 * smoothstep(at("output", 0.3), at("output", 1.5), t));

  // ---- output bars ----
  const barsOn = smoothstep(SHOW.bars[0] - 0.2, SHOW.bars[0] + 0.1, t);
  const fillU = W(SHOW.bars, t, "outCubic");
  bars.forEach((b, d) => {
    b.userData.setLevel(barsOn * (d === NET.answer ? 1 : 0.55));
    b.userData.setValue(Math.max(NET.probs[d], 0.012) * fillU);
    b.userData.setAccent(d === NET.answer ? flareU : 0);
  });

  // ---- camera ----
  rig.update(t);

  // ---- overlay ----
  caption.userData.update(t, CAPTIONS);
  const teleOn = SHOW.power + 0.3;
  tele.userData.update(t, `HOLO-NET 07 · ${stageName(t).padEnd(6)} · T+${t.toFixed(2).padStart(5, "0")}`, { on: teleOn });
  const shown = 1 + (t >= SHOW.hidden[0][0]) + (t >= SHOW.hidden[1][0]) + (t >= SHOW.hidden[2][0]) + (t >= SHOW.output[0]);
  const links = Math.round(GRAPH.edges.length * clamp((t - SHOW.web[0]) / (SHOW.web[1] - SHOW.web[0])));
  tele2.userData.update(t, `LAYER ${t >= SHOW.input[0] ? shown : 0}/5 · ${String(links).padStart(3, "0")} LINKS`, { on: teleOn + 0.2 });
  const digitsOn = SHOW.output[0] + 0.5;
  outPos.forEach((p, d) => {
    digitTags[d].userData.update(t, { world: worldOf(output, [O.labelDx, p[1], 0]), on: digitsOn + d * 0.03, color: d === NET.answer && t > SHOW.flare ? "accent" : null });
  });
  const ap = outPos[NET.answer];
  pct.userData.update(t, { world: worldOf(output, [O.barDx + O.barW + 0.08, ap[1], 0]), on: SHOW.pct });
  hidden.forEach((h, k) => {
    const b = h.userData.bounds;
    leaders[k].userData.update(t, { anchor: worldOf(h, [b.x0 + 0.04, b.y1, 0]), on: at("hidden", 0.95 + k * 0.18), off: at("flow", 0.25) });
  });

  style.render(t);
}
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
