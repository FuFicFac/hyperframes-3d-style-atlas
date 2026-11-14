// scene.js — 50-pin-art: "This becomes that". The pin plan, beats, camera keys and SCORE live in scene.config.js;
// the desk, acrylic frame, 8400 instanced pins, caption and SAMPLE DATA tag come from the style. Every frame is a
// pure function of t: renderAt writes every pin's extension from PLAN.heightsAt(t); nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/pin-art/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, SAMPLE_TAG } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.2, far: 60 });
const style = createStyle(stage, { finish: "steel" });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const screen = style.props.pinScreen(PLAN);
const caption = style.props.caption();
const tag = style.props.sampleTag();

function renderAt(t) {
  screen.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  tag.userData.show(fadeWindow(t, { on: SAMPLE_TAG.on, inDur: 0.35, off: SAMPLE_TAG.off }));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
