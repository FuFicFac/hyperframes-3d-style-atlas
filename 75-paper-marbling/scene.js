// scene.js — 75-paper-marbling: "Every pass reshapes the pattern". The recipe, beats, camera keys and SCORE live in
// scene.config.js; the table, tray, bath shader, tools, sheet and caption come from the style.
// Every frame is a pure function of t: renderAt asks PLAN for the operation state, tool poses and sheet shape at t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/paper-marbling/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, JARS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.3, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const marbling = style.props.marbling(PLAN, { jars: JARS });
const caption = style.props.caption();

function renderAt(t) {
  marbling.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
