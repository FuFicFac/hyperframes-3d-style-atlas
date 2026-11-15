// scene.js — 66-multiplane-cel: "Painted on glass". The beats, camera plan, tray slide and SCORE live in
// scene.config.js; the paintings, rig, cel bird and caption come from the style. Every frame is a pure function of t:
// renderAt places the camera from PLAN.cameraAt(t), the sliding tray from PLAN.slideAt(t) and the bird drawing from
// PLAN.birdAt(t); nothing is redrawn per frame except the caption chip when its text changes.
import { createStage } from "./_atlas/kit/core.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/multiplane-cel/style.js";
import { DURATION, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 36, near: 0.05, far: 60 });
const style = createStyle(stage);
const rig = style.props.multiplane(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  rig.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  style.applyCamera(stage.camera, PLAN.cameraAt(t));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
