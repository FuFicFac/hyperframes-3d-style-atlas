// scene.js — 68-constructivist-poster: a Constructivist poster that builds itself with force. The layout, build plan,
// beats, camera keys and SCORE live in scene.config.js; the board, cards, wheels, type and caption come from the style.
// Every frame is a pure function of t: renderAt poses every piece from PLAN (closed form); nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/constructivist-poster/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LAYOUT, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 1, far: 90, projection: "orthographic" });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const poster = style.props.buildPoster(LAYOUT, PLAN);
const caption = style.props.caption();

function renderAt(t) {
  poster.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.15, off: L.off, outDur: 0.2 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
