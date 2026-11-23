// scene.js — 104-chromatography: "What is in the black?". The plan, beats, camera keys and SCORE live in
// scene.config.js; the bench, jar, strip shader, pen, rack and caption come from the style.
// Every frame is a pure function of t: renderAt asks PLAN for the front, the dyes, the strip pose and the pen at t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/chromatography/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, SLOTS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.05, far: 30 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const lab = style.props.labBench(PLAN, { slots: SLOTS });
const caption = style.props.caption();

function renderAt(t) {
  lab.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = L.inDur ? fadeWindow(t, { on: L.on, inDur: L.inDur, off: L.off, outDur: L.outDur }) : (t < L.off ? 1 : fadeWindow(t, { on: -1, inDur: 1, off: L.off, outDur: L.outDur }));
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
