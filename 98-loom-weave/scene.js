// scene.js — 98-loom-weave: a tabletop jacquard loom weaves a little robot row by row while the punched card that drives
// it advances beside the cloth. The pick plan, beats, camera keys and SCORE live in scene.config.js; the loom, cloth and
// card shaders, harness, reed, shuttle and caption come from the style. Every frame is a pure function of t: renderAt
// reads PLAN.at(t) once and writes every part from it; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/loom-weave/style.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, BOOST } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.2, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const loom = style.props.loom(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  loom.update(t, { boost: smoothstep(BOOST.on, BOOST.on + BOOST.dur, t) });
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
