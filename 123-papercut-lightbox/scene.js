// scene.js — 123-papercut-lightbox: "Depth made of light". Beats, plan, camera keys and SCORE live in scene.config.js;
// the box, the seven sheets, the diffuser and the caption come from the style. Every frame is a pure function of t:
// box.update(t) sets every slide offset, light level, lamp position and colour from the plan.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/papercut-lightbox/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.02, far: 6 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const box = style.props.lightbox(PLAN);
const caption = style.props.caption();

/** exactly one label at all times: at each beat change the new line slides in and pushes the old one out */
function labelAt(t) {
  let i = 0;
  while (i + 1 < LABELS.length && t >= LABELS[i + 1].on) i++;
  const L = LABELS[i];
  if (i === 0) return ["", L.text, 1];
  return [LABELS[i - 1].text, L.text, Math.min(1, (t - L.on) / L.roll)];
}

function renderAt(t) {
  box.update(t);
  caption.userData.show(...labelAt(t));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
