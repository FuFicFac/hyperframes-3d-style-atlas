// scene.js — 97-string-art: "A neural network draws curves with straight lines". Beats, camera keys, the winding plan and
// SCORE live in scene.config.js; the board, nails, threads, wraps, needles and the caption tag come from the style.
// Every frame is a pure function of t: renderAt asks the plan how far each thread is drawn and where each needle is.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/string-art/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LAYOUT, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.1, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.board());
stage.scene.add(style.props.nails(LAYOUT));
const threads = style.props.threads(PLAN);
const wraps = style.props.wraps(PLAN);
const needles = style.props.needles(PLAN);
stage.scene.add(threads, wraps, needles);
const caption = style.props.caption();

function renderAt(t) {
  threads.userData.update(t);
  wraps.userData.update(t);
  needles.userData.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.25, off: L.off, outDur: 0.25 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a, L.thread); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
