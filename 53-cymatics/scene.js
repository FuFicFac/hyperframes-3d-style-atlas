// scene.js — 53-cymatics: "Sound has a shape". The mode list, beats, camera keys and SCORE live in scene.config.js;
// the bench, plate, driver, generator, 24k instanced sand grains, caption and frequency readout come from the style.
// Every frame is a pure function of t: renderAt writes every grain from PLAN.positionsAt(t); nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/cymatics/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.2, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const plate = style.props.chladniPlate(PLAN);
const caption = style.props.caption();
const readout = style.props.readout();

function renderAt(t) {
  plate.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  const md = PLAN.modeAt(t); // the readout shows the frequency SCORE is playing right now
  readout.userData.show(md ? md.hz : 0, md ? Math.min(1, PLAN.toneEnv(t) * 1.5) : 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
