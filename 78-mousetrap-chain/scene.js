// scene.js — 78-mousetrap-chain: "One becomes two becomes all". The cascade plan, beats, camera keys and SCORE live in
// scene.config.js; the floor, traps, balls, caption and dot chart come from the style. Every frame is a pure function
// of t: renderAt poses every trap and ball from the plan; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/mousetrap-chain/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, CHART_ON } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const cascade = style.props.cascade(PLAN);
const caption = style.props.caption();
const chart = style.props.genChart(PLAN);

function renderAt(t) {
  cascade.update(t);
  let shown = false;                                   // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  chart.userData.show(t, fadeWindow(t, { on: CHART_ON, inDur: 0.4 }));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
