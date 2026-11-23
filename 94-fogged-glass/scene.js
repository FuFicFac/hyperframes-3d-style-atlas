// scene.js — 94-fogged-glass: "The context window — why AI forgets the start of a long chat". The stroke / drip plan,
// beats, camera keys and SCORE live in scene.config.js; the pane, its fog shader, the frame and the caption chip come
// from the style. Every frame is a pure function of t: renderAt repaints the fog mask from PLAN and writes the drop and
// reveal uniforms; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/fogged-glass/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const set = style.props.windowSet(PLAN);
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
