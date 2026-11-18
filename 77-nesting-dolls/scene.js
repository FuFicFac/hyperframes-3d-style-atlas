// scene.js — 77-nesting-dolls: "There's a smaller one inside". Beats, camera keys, the nesting plan and SCORE live in
// scene.config.js; the table, the dolls, the caption and the dive cover come from the style.
// Every frame is a pure function of t: renderAt poses every doll and lid from PLAN (visibility included).
import { createStage, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/nesting-dolls/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, COVER } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.05, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.table());
const family = style.props.family(PLAN);
const cover = style.props.cover();
const caption = style.props.caption();

function renderAt(t) {
  family.update(t);
  cover.userData.set(smoothstep(COVER.in[0], COVER.in[1], t) * (1 - smoothstep(COVER.out[0], COVER.out[1], t)));
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.25, off: L.off, outDur: 0.25 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
