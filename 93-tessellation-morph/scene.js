// scene.js — 93-tessellation-morph. The morph plan, beats, camera keys and SCORE live in scene.config.js; the wall
// (tiles, ink, backing) and the caption come from the style. Every frame is a pure function of t: the wall rewrites every
// vertex from PLAN.frame(t) / PLAN.poseAt(tile, t); nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/tessellation-morph/style.js";
import { DURATION, BEATS, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const wall = style.props.wall(PLAN);
const caption = style.props.caption();
const spanFrom = BEATS.find((b) => b.id === "space").t;

// slider: before the wide shot, the knob shows the morph value at the middle of the view; after it, the span of values
// visible across the wall (the "whole latent space at once")
function sliderAt(t) {
  const tgt = rig.sample(t).target;
  const m0 = PLAN.field(tgt.x, 0, t);
  if (t < spanFrom + 0.2) return { m0, m1: m0 };
  let lo = Infinity, hi = -Infinity;
  for (let x = -10; x <= 10; x += 0.5) { const m = PLAN.field(x, 0, t); lo = Math.min(lo, m); hi = Math.max(hi, m); }
  return { m0: lo, m1: hi };
}

function renderAt(t) {
  wall.userData.update(t);
  let text = "", a = 0;
  for (const L of LABELS) {
    const v = fadeWindow(t, { on: L.on, inDur: 0.25, off: L.off, outDur: 0.25 });
    if (v > a) { a = v; text = L.text; }
  }
  caption.userData.show(text, 1, sliderAt(t), Math.round(a * 20) / 20);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
