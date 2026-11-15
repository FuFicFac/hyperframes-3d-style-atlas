// scene.js — 64-impasto: a night landscape painted stroke by stroke in thick oil. The stroke plan, beats, raking-light
// keys, camera keys and SCORE live in scene.config.js; the canvas, the instanced strokes, the raking light and the
// caption come from the style. Every frame is a pure function of t: renderAt rewrites every stroke from PLAN.stateAt(t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/impasto/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, RAKE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.08, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const painting = style.props.painting(PLAN, { rake: RAKE });
const caption = style.props.caption();

function renderAt(t) {
  painting.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
