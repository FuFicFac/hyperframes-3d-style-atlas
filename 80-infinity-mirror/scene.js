// scene.js — 80-infinity-mirror: "A copy of a copy of a copy". Beats, the recursion plan, camera keys and SCORE live in
// scene.config.js; the gallery, the instanced generations and the overlay chips come from the style.
// Every frame is a pure function of t: renderAt asks the plan for each generation's matrix and tint at t.
import { createStage, clamp } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/infinity-mirror/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.2, far: 160, shadows: false });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const gallery = style.props.gallery();
const tunnel = style.props.tunnel(PLAN);
const caption = style.props.caption();
const counter = style.props.counter();

function renderAt(t) {
  tunnel.update(t);
  gallery.update({ on: PLAN.galleryOn(t), glass: PLAN.glassLevel(t), glow: clamp(PLAN.lit(t) / PLAN.bulbs.length) });
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  counter.userData.show(PLAN.counter(t));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
