// scene.js — 37-domino-run: "One small push". The rally plan, beats, camera keys and SCORE live in scene.config.js;
// the floor, tiles, stairs, bridge, ball, flag, banner and caption come from the style. Every frame is a pure function
// of t: renderAt reads tile angles from plan.anglesAt(t) and gadget poses from the same plan; nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/domino-run/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.05, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const rally = style.props.rally(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  rally.update(t);
  let shown = false;                                   // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  const c = rig.sample ? rig.sample(t).target : null;
  const tgt = c ? [c.x ?? c[0], c.z ?? c[2]] : [0, 0];
  rally.reflect(tgt);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
