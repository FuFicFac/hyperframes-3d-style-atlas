// scene.js — 89-uv-reveal: "AI's invisible watermark". The torch plan, beats, camera keys and SCORE live in
// scene.config.js; the desk, the two-layer sheet, the torch, its light and the caption chip come from the style.
// Every frame is a pure function of t: renderAt writes the pool + afterglow uniforms, the torch pose and every light
// level from PLAN; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/uv-reveal/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.2, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const set = style.props.uvDesk(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  set.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.2, off: L.off, outDur: 0.2 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
