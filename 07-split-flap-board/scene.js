// scene.js — 07-split-flap-board: "What can AI do today?" on a split-flap departure board.
// All data lives in scene.config.js; the board, its flip planner and lamps come from the style.
// Every frame is a pure function of t: no rAF, no clocks, no accumulation.
import { createStage, Timeline } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/split-flap-board/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, PROGRAM, LAMPS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 28 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const board = objs.board;
board.userData.program(PROGRAM); // same planner + same program as the SCORE in scene.config.js
const { blink } = style.motion;
const COLORS = style.spec.lamps.colors;

function lampLevel(l, t) {
  if (t < l.on || t >= l.off) return 0;
  return l.blink ? blink(t, l.on) : Math.min(1, (t - l.on) / 0.05);
}

function renderAt(t) {
  board.userData.update(t);
  for (const row of Object.keys(board.userData.lamps)) {
    for (const c of COLORS) {
      const lv = LAMPS.filter((l) => l.row === row && l.color === c).reduce((m, l) => Math.max(m, lampLevel(l, t)), 0);
      board.userData.setLamp(row, c, lv);
    }
  }
  void tl;
  rig.update(t);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
