// scene.js — 117-risograph: "Three inks, one picture". Beats, plan, camera keys and SCORE live in scene.config.js; the
// tray, sheet (print shader), drum and the rolling caption come from the style. Every frame is a pure function of t:
// renderAt sets every uniform and pose from PLAN.uniformsAt(t); nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/risograph/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.04, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const press = style.props.risoPress(PLAN);
const caption = style.props.caption();
const ROLL = style.spec.caption.roll;

/** exactly one readable label at every instant: the old line rolls up and out while the new one rolls in */
function labelAt(t) {
  let i = 0;
  while (i + 1 < LABELS.length && t >= LABELS[i + 1].on) i++;
  const L = LABELS[i];
  if (i > 0 && t < L.on + ROLL) return [LABELS[i - 1].text, L.text, (t - L.on) / ROLL];
  return [L.text, "", 0];
}

function renderAt(t) {
  press.update(t);
  caption.userData.show(...labelAt(t));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
