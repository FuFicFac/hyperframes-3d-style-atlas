// scene.js — 67-mosaic: a fish over waves, set tile by tile. The tile plan, beats, camera keys and SCORE live in
// scene.config.js; the bench, tray, plaster bed (sinopia + grout), instanced tesserae, sweep light and caption come from
// the style. Every frame is a pure function of t: renderAt writes every tile from PLAN.stateAt(i, t); nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/mosaic/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, SWEEP } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.3, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const panel = style.props.mosaicPanel(PLAN, { sweep: SWEEP });
const caption = style.props.caption();

function renderAt(t) {
  panel.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
