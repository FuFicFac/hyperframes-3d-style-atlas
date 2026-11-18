// scene.js — 72-typewriter: "One letter at a time". Beats, the typing plan, camera keys and SCORE live in
// scene.config.js; the desk and the machine come from the style. Every frame is a pure function of t:
// renderAt asks the machine to pose itself from the plan at t, then moves the camera and renders.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/typewriter/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.desk());
const machine = style.props.typewriter(PLAN);
stage.scene.add(machine);

function renderAt(t) {
  machine.userData.update(t);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
