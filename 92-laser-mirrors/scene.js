// scene.js — 92-laser-mirrors: "How an AI agent routes a request". Beats, the bench layout, the beam plan, camera keys and
// SCORE live in scene.config.js; the bench, laser, mirrors, targets, splitter, beams and the caption chip come from the style.
// Every frame is a pure function of t: bench.update(t) re-traces the beam from the mirror angles at t (beamplan.js).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/laser-mirrors/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.5, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const bench = style.props.opticsBench(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  bench.update(t);
  let shown = false; // one label at a time; the chip itself never leaves
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.15, off: L.off, outDur: 0.15 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show(LABELS[0].text, 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
