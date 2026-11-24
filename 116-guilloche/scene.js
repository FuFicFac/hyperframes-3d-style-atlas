// scene.js — 116-guilloche: "Two dials, endless lace". The plan (ring times, disc angle, dials, enamel), beats, camera
// keys and SCORE live in scene.config.js; the bench, chuck, disc shader, cutter arm, dials and caption come from the
// style. Every frame is a pure function of t: renderAt asks the plan for the state at t and poses everything from it.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/guilloche/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, labelAt } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.05, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const engine = style.props.roseEngine(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  engine.update(t);
  const L = labelAt(t); // exactly one label: the current beat's
  caption.userData.show(L.text, L.alpha);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
