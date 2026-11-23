// scene.js — 105-tensegrity: "Nothing touches". Beats, camera keys, the plan and SCORE live in scene.config.js; the
// table, tower, weight, snips and caption come from the style. Every frame is a pure function of t: renderAt poses every
// strut, cord, cut end, contact glint, the weight and the snips from PLAN; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/tensegrity/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, LABEL_FADE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.1, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const machine = style.props.rig(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  machine.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: LABEL_FADE.in, off: L.off, outDur: LABEL_FADE.out });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
