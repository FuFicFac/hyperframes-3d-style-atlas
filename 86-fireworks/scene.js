// scene.js — 86-fireworks: "Temperature — one prompt, many answers". The shell plan, beats, camera and SCORE live in
// scene.config.js; the sky, skyline, water, star sprites and caption come from the style. Every frame is a pure
// function of t: the star sprites are evaluated in the vertex shader from the plan's closed form (uTime = t), the
// flash light comes from PLAN.flashAt(t); nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { ease, clamp, lerp } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/fireworks/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, CITY, LABELS, GAUGE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 40, near: 1, far: 1500, shadows: false });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const world = style.props.harbour(PLAN, CITY);
const caption = style.props.caption();

/** gauge temperature at t: holds each beat's T, slides to the next at the beat start */
function gaugeAt(t) {
  let T = GAUGE.keys[0].T;
  for (let i = 1; i < GAUGE.keys.length; i++) {
    const k = GAUGE.keys[i];
    T = lerp(T, k.T, ease.inOutCubic(clamp((t - k.t) / GAUGE.slide)));
  }
  return T;
}

function renderAt(t) {
  rig.update(t);
  world.update(t);
  let text = "", alpha = 0; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.2, off: L.off, outDur: 0.2 });
    if (a > 0.001 && !text) { text = L.text; alpha = a; }
  }
  caption.userData.show(text, alpha, gaugeAt(t));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
