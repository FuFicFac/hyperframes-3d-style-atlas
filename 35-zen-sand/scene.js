// scene.js — 35-zen-sand: "clearing the noise" in a raked dry garden. All data lives in scene.config.js.
// Every frame is a pure function of t: the sand height field is rebuilt from the plan for t (no accumulation).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/zen-sand/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 40 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const garden = objs.garden.userData;
const caption = style.props.caption(LABELS);

function renderAt(t) {
  garden.update(t);
  caption.userData.update(t);
  rig.update(t);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
