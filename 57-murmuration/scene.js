// scene.js — 57-murmuration: "Simple rules make a shape". The flock plan, beats, camera and SCORE live in
// scene.config.js; the sky, horizon, instanced birds and caption come from the style. Every frame is a pure function
// of t: renderAt writes every bird from FLOCK.positionsAt(t) (closed form); nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/murmuration/style.js";
import { DURATION, CAMERA, SCORE, DUCK, FLOCK, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 42, near: 0.5, far: 900, shadows: false });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const world = style.props.murmuration(FLOCK);
const caption = style.props.caption();

function renderAt(t) {
  rig.update(t);
  world.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.35, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
