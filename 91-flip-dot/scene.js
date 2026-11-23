// scene.js — 91-flip-dot: "How an AI image appears out of noise". The flip plan, beats, camera keys and SCORE live
// in scene.config.js; the wall, housing, 2304 instanced discs and the caption chip come from the style. Every frame
// is a pure function of t: renderAt writes every disc's angle from PLAN.anglesAt(t); nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/flip-dot/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const sign = style.props.sign(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  sign.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.12, off: L.off, outDur: 0.12 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
