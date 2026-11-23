// scene.js — 96-pendulum-wave: "How AI tags word order". Beats, camera keys, the plan and SCORE live in scene.config.js;
// the bench, frame, pendulums, plank, caption and fingerprint cards come from the style. Every frame is a pure function
// of t: renderAt poses every ball, string, trail ghost, lamp and card from PLAN; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/pendulum-wave/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, CARDS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.3, far: 90 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const machine = style.props.rig(PLAN);
const caption = style.props.caption();
const cards = style.props.cards(PLAN);

function renderAt(t) {
  machine.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  const alpha = 1 - Math.min(1, Math.max(0, (t - CARDS.alpha.off) / CARDS.alpha.dur));
  cards.update(t, { titles: CARDS.titles(t), alpha }); // after the rig: the dots start from the projected balls
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
