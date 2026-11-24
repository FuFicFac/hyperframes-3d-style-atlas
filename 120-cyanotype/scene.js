// scene.js — 120-cyanotype: "Sunlight makes the print". The plan (sun, drops, lifts, dose, slide, water), beats, camera
// keys and SCORE live in scene.config.js; the table, board, sheet shader, objects, pins, tray, water and caption come
// from the style. Every frame is a pure function of t: renderAt asks the plan for the state at t and poses everything.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/cyanotype/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, labelAt } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.05, far: 30 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const print = style.props.sunPrint(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  print.update(t);
  caption.userData.show(labelAt(t)); // exactly one label (rolling between beats)
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
