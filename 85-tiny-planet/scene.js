// scene.js — 85-tiny-planet: "A model builds its world from what it reads". Beats, camera keys, the globe plan and
// SCORE live in scene.config.js; the globe, its life, the word chips, halo and caption come from the style.
// Every frame is a pure function of t: renderAt reads the plan at t; nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/tiny-planet/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.5, far: 80, shadows: false });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const world = style.props.world(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  rig.update(t);                       // first: the word chips face the current camera
  world.update(t);
  let shown = false;                   // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.25, off: L.off, outDur: 0.25 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
