// scene.js — 108-vortex-rings: "A push that travels". The ring plan (integrated once, rings.js), taps, beats, camera
// keys and SCORE live in scene.config.js; the tank, drum, smoke and caption come from the style. Every frame is a pure
// function of t: the mallet and skin are closed forms of the tap list, each smoke cloud is placed from plan.state(i, t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/vortex-rings/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, LABEL_FADE, TAPS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.3, far: 120 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props;

P.tank();
const drum = P.drum();
const smoke = PLAN.rings.map((_, i) => P.smoke(PLAN, i));
const caption = P.caption();

function renderAt(t) {
  drum.update(t, TAPS);
  for (const s of smoke) s.update(t);

  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: LABEL_FADE, off: L.off, outDur: LABEL_FADE });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
