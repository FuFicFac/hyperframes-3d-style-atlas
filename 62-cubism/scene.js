// scene.js — 62-cubism: "One object, many views". Beats, the facet plan, viewpoint camera keys and SCORE live in
// scene.config.js; the still life, render targets, facet shader and caption come from the style.
// Every frame is a pure function of t: each viewpoint camera, facet pose and palette value is computed from t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/cubism/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, VIEW_CAMS, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.1, far: 40, background: 0xd9ccb0 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const picture = style.props.picture(PLAN, VIEW_CAMS);
const caption = style.props.caption();

function renderAt(t) {
  picture.update(t);
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
