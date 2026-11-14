// scene.js — 21-chalkboard: "Why AI makes things up" on a classroom chalkboard.
// All data lives in scene.config.js; the board, chalk painter, floating chalk, eraser and dust come from the style.
// Every frame is a pure function of t: no rAF, no clocks, no accumulation (the board canvas cache is a seek-safe prefix).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/chalkboard/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, PLAN } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 30 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const board = objs.board.userData;
board.setPlan(PLAN); // same plan as the SCORE in scene.config.js

function renderAt(t) {
  board.update(t);
  rig.update(t);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
