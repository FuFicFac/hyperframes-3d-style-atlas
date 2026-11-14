// scene.js — 00-smoke: neutral style, data from scene.config.js, everything a pure function of t.
import { createStage, Timeline } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec, animateObjects } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/neutral/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

function renderAt(t) {
  animateObjects(objs, tl, t);
  // hand-written extras go here, e.g. a squash on landing:
  const land = tl.p("drop", t) > 0.36 ? Math.exp(-(t - tl.at("drop", 0.327)) * 9) : 0;
  objs.cube.scale.set(1 + land * 0.12, 1 - land * 0.18, 1 + land * 0.12);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
