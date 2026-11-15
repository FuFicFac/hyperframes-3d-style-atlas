// scene.js — 56-thermal-camera: a desk seen through a thermal imager. The heat plan, beats, camera keys and SCORE live in
// scene.config.js; the set, the thermal shader, the sensor pass and the HUD come from the style. Every frame is a pure
// function of t: renderAt writes every vertex temperature from PLAN at t; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/thermal-camera/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.05, far: 20 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const set = style.props.deskSet(PLAN);
const hud = style.props.hud();

function renderAt(t) {
  rig.update(t);          // first: the plume billboards face the camera
  set.update(t);
  let text = "", a = 0;   // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const v = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (v > 0.001) { text = L.text; a = v; break; }
  }
  hud.update(PLAN.spot(t).T, text, a);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
