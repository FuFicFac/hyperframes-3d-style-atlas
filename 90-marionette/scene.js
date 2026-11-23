// scene.js — 90-marionette: "Who pulls the strings?". Beats, camera keys, the control plan and SCORE live in
// scene.config.js; the stage, the puppet, the bar, the strings, the tags and the caption come from the style.
// Every frame is a pure function of t: renderAt asks the plan for one pose and places everything from it.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/marionette/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.stageSet());
const puppet = style.props.marionette(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  puppet.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.22, off: L.off, outDur: 0.2 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
