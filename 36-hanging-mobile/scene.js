// scene.js — 36-hanging-mobile: "Add one thing and everything shifts". Data and timing live in scene.config.js (the
// style's pure planner, balance.js); this file builds the gallery and the mobile from the style's props and sets
// everything from t. Pure function of time.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/hanging-mobile/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, PLAN, ROOT } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34 });
const style = createStyle(stage);
const { props, spec } = style;
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

// the mobile (same plan object the SCORE was derived from) + the top thread up to the ceiling hook
const mobile = props.mobile(PLAN);
mobile.position.set(...ROOT);
stage.scene.add(mobile);
const top = props.thread({ length: spec.gallery.ceilingY - 0.08 - ROOT[1] - spec.wire.loopR * 1.6 });
top.position.set(ROOT[0], spec.gallery.ceilingY - 0.08, 0);
stage.scene.add(top);

const label = props.wallLabel(stage, BEATS);

function renderAt(t) {
  mobile.userData.update(t);
  label.userData.update(t);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
