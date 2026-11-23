// scene.js — 99-pottery-wheel: "Fine-tuning: the same model, reshaped for a job". Beats, camera keys, the throw plan and
// SCORE live in scene.config.js; the studio, the wheel, the clay, the rib, the brush and the caption come from the style.
// Every frame is a pure function of t: renderAt rewrites the clay from PLAN.profileAt(t) and poses everything else from t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/pottery-wheel/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.room());
const wheel = style.props.wheel(PLAN);
const clay = style.props.clay(PLAN);
const rib = style.props.rib(PLAN);
const brush = style.props.brush(PLAN);
stage.scene.add(wheel, clay, rib, brush, rib.userData.handle, brush.userData.handle);
const caption = style.props.caption();

function renderAt(t) {
  wheel.userData.update(t);
  clay.userData.update(t);
  rib.userData.update(t);
  brush.userData.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  // focus on the clay's axis at half its height (every frame: setFocus is sticky, so skipping frames would depend on seek order)
  const cam = stage.camera, yMid = 0.5 * PLAN.extent(t).yMax;
  cam.updateWorldMatrix(true, false);
  const e = cam.matrixWorld.elements;
  style.dof.setFocus(Math.max(0.5, -((0 - e[12]) * e[8] + (yMid - e[13]) * e[9] + (0 - e[14]) * e[10])));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
