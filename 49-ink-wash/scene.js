// scene.js — 49-ink-wash: "a short journey" painted in brush and ink. All data lives in scene.config.js.
// Every frame is a pure function of t: the ink layer is re-rendered from the plan for t (no accumulation).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/ink-wash/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.1, far: 40 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const painting = objs.painting.userData;
const caption = style.props.caption(LABELS);

function renderAt(t) {
  painting.update(t);
  caption.userData.update(t);
  rig.update(t);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
