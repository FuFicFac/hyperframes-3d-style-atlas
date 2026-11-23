// scene.js — 101-ripple-interference: "Timing decides the pattern". Beats, camera keys, the plan and SCORE live in
// scene.config.js; the bench, tank, water shader, dippers, corks and caption come from the style. Every frame is a pure
// function of t: renderAt sets the water's time uniform, poses the dippers and corks from PLAN, picks the caption.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/ripple-interference/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const tank = style.props.rig(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  tank.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.2, off: L.off, outDur: 0.2 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
