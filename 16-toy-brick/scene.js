// scene.js — 16-toy-brick: "What's inside a large language model?" as a toy-brick tower you build.
// Every frame is a pure function of t: part poses from the build plan (bricks.brickPose), camera keys, stickers.
import * as THREE from "three";
import { createStage, Timeline, clamp, ease, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/toy-brick/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, BUILD, CHECK, PAIRS, FINALE, CAPTION, CAPTIONS, TAGS, COUNTER } from "./scene.config.js";

if (CHECK.overlaps.length || CHECK.floating.length) console.warn("[atlas] toy-brick layout:", JSON.stringify(CHECK));

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { props, plan, helpers } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const grid = objs.baseplate.userData.grid;
const tl = new Timeline(BEATS);
void tl;
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

// soft contact darkening under the baseplate edge on the table
const shadow = props.contactShadow({ w: 2.9, d: 2.1, opacity: 0.3, y: 0.002 });
stage.scene.add(shadow);
// contact darkening under the tower footprint and the peg (fake AO on the stud tops)
const towerAO = props.contactShadow({ w: 1.05, d: 0.42, opacity: 0.38 });
{ const c = grid.toWorld(12, 0, 7); towerAO.position.set(c[0], grid.studTop + 0.002, c[2]); }
stage.scene.add(towerAO);

// ---------------------------------------------------------------- the build (all parts, one plan)
const tower = props.build(null, { grid, plan: BUILD });
stage.scene.add(tower);
const transIdx = BUILD.parts.findIndex((p) => p.type === "trans");
const transMat = tower.userData.meshes[transIdx].material;

// the printed nameplate: swap the plain tile for a printed one at the same pose
const plaqueIdx = BUILD.parts.findIndex((p) => p.type === "tile");
{
  const old = tower.userData.meshes[plaqueIdx];
  const printed = props.printedTile({ size: FINALE.plaque.size, color: FINALE.plaque.color, text: FINALE.plaque.text });
  tower.remove(old);
  tower.add(printed);
  tower.userData.meshes[plaqueIdx] = printed;
}

// loose decorative pieces in the pile (static, resting on the stud tops)
const pile = props.pile({
  grid, center: [2.6, 12.6], radius: 2.2, seed: 11,
  parts: [
    { type: "brick", size: [2, 2], color: "yellow" }, { type: "slope", size: [2, 2], dir: "+z", color: "red" },
    { type: "plate", size: [2, 2], color: "white" }, { type: "brick", size: [1, 4], color: "blue" },
    { type: "trans", size: [1, 2], color: "transBlue", trans: true }, { type: "round", size: [1, 1], color: "mint" },
  ],
});
stage.scene.add(pile);

// a point light inside the glowing trans brick (spills warm light on the roof)
const glowLight = new THREE.PointLight("#ffc23a", 0, 1.2, 2);
stage.scene.add(glowLight);

// ---------------------------------------------------------------- peg figure
const F = FINALE.peg;
const peg = props.pegFigure({ body: F.body, head: F.head });
const pegHome = grid.toWorld(F.at[0] + 0.5, 0, F.at[1] + 0.5);
stage.scene.add(peg);
const pegAO = props.contactShadow({ w: 0.13, d: 0.13, opacity: 0.45 });
pegAO.position.set(pegHome[0], grid.studTop + 0.002, pegHome[2]);
stage.scene.add(pegAO);

// ---------------------------------------------------------------- stickers (overlay)
const caps = CAPTIONS.map((c) => ({ ...c, g: props.sticker(c.text, { color: c.color }) }));
const tags = TAGS.map((c) => ({ ...c, g: props.sticker(c.text, { color: c.color, align: "right" }) }));
// one sticker per count (kit text setText with a new canvas size was seek-order dependent: see STYLE.md)
const counters = COUNTER.steps.map((s) => props.sticker(s.text, { color: "darkGrey" }));
const lvlY = (lv) => grid.toWorld(0, lv, 0)[1];

function renderAt(t) {
  tower.userData.update(t);

  // glowing next word
  const g = smoothstep(FINALE.glowOn, FINALE.glowOn + FINALE.glowDur, t);
  const flick = 1 + 0.06 * Math.sin(t * 11) * g;
  transMat.emissiveIntensity = FINALE.glow * g * flick;
  const tm = tower.userData.meshes[transIdx];
  glowLight.position.set(tm.position.x, tm.position.y + 0.08, tm.position.z + 0.05);
  glowLight.intensity = 1.6 * g;

  // peg figure: drops onto its stud, then tips its head up toward the tower
  const d = plan.brickPose({ at: F.at, size: [1, 1], level: 0, t0: F.drop, dur: 0.4, land: F.drop + 0.4, press: 0.2, hover: 0.3, from: 14, mode: "drop", seed: 77, stepped: 0 }, t);
  peg.visible = d.visible;
  pegAO.visible = d.visible && d.phase !== "move";
  peg.position.set(pegHome[0], grid.toWorld(0, d.y, 0)[1], pegHome[2]);
  peg.scale.set(d.sx, d.sy, d.sz);
  peg.rotation.set(d.rx, -0.75 + d.ry, d.rz);
  const lk = ease.inOutCubic(clamp((t - F.look) / F.lookDur));
  peg.userData.look(F.yaw * lk + 0.04 * Math.sin(t * 2.1) * lk, F.pitch * lk);

  const cam = rig.update(t);
  stage.scene.updateMatrixWorld(true);

  // captions: one fixed region top-left
  for (const c of caps) {
    style.helpers.pin(c.g, { x: CAPTION.x, y: CAPTION.y, height: CAPTION.height });
    c.g.userData.set(t - c.on, clamp((t - c.off) / 0.3));
  }
  // tags: left of the tower at the first pair's arch / block
  for (const c of tags) {
    const lv = PAIRS[0].level + (c.anchor === "block" ? 4.5 : 1.5);
    style.helpers.pin(c.g, { world: grid.toWorld(8, lv, 7.5), offset: [-0.035, 0], height: c.height });
    c.g.userData.set(t - c.on, clamp((t - c.off) / 0.3));
  }
  // layer counter: right of the newest layer
  let step = -1;
  COUNTER.steps.forEach((s, k) => { if (t >= s.t) step = k; });
  counters.forEach((c, k) => {
    if (k !== step) { c.userData.set(-1); return; }
    const s = COUNTER.steps[k];
    style.helpers.pin(c, { world: grid.toWorld(16, s.level, 7), offset: [0.035, 0], height: COUNTER.height });
    // the first count slaps on; later counts swap in with a quick small pop
    c.userData.set(k === 0 ? t - s.t : 0.25 + (t - s.t), clamp((t - COUNTER.off) / 0.3));
  });
  // focus: the active part while building, the glowing brick, then the whole tower on the pull-back
  let focus = tower.userData.focus(t);
  const pullK = smoothstep(BEATS[4].t, BEATS[4].t + 1.6, t);
  if (pullK > 0) focus = focus.map((v, i) => v + ([0.0, lvlY(15), -0.1][i] - v) * pullK);
  style.render(t, { focus });
  void cam;
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
