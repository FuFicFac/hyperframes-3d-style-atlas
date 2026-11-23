// scene.js — 106-snap-through: "Then, all at once". Beats, camera keys, the plan and SCORE live in scene.config.js;
// the bench, rig, strip, tray, weights, dial gauge and caption come from the style. Every frame is a pure function of t:
// renderAt bends the strip, poses every weight and the needle from PLAN; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/snap-through/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, SHAKE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const machine = style.props.rig(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  machine.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a, t >= PLAN.snapGo + 0.08); shown = true; }
  }
  if (!shown) caption.userData.show("", 0, false);
  rig.update(t);
  const [dx, dy] = style.helpers.shake(t, PLAN, SHAKE.amp); // assigned on top of the rig's pose for this t
  stage.camera.position.x += dx;
  stage.camera.position.y += dy;
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
