// scene.js — 63-kintsugi: "The break becomes beauty". Beats, camera keys, the fracture plan and SCORE live in
// scene.config.js; the linen, the shard meshes (one lathe, per-fragment seams), the gold and the caption come from the style.
// Every frame is a pure function of t: renderAt poses every shard from PLAN.pose(i, t) and sets the crack / gold uniforms.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/kintsugi/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.linen());
const bowl = style.props.bowl(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  bowl.update(t);
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
