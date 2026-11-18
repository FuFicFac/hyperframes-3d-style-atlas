// scene.js — 74-layer-print: "Built one layer at a time". The toolpath plan, beats, camera keys and SCORE live in
// scene.config.js; the workshop, printer, bead mesh, planned-path line and caption come from the style. Every frame is a
// pure function of t: the part shows the beads whose deposit time has passed, the head sits on PLAN.nozzleAt(t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/layer-print/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.3, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const job = style.props.printJob(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  job.update(t);
  const prog = PLAN.progress(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a, prog); shown = true; }
  }
  if (!shown) caption.userData.show("", 0, 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
