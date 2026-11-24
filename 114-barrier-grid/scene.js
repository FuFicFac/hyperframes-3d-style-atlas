// scene.js — 114-barrier-grid: "The stripes hold the motion". Beats, plan, camera keys and SCORE live in scene.config.js;
// the desk, the interlaced card, the striped acetate and the caption come from the style.
// Every frame is a pure function of t: renderAt sets the sheet's offset/height/visibility (and the print's shadow
// uniforms) from PLAN.uniformsAt(t), the caption from LABELS, the camera from CAMERA.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { depthOfField } from "./_atlas/kit/studio.js";
import { createStyle } from "./_atlas/styles/barrier-grid/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 12, near: 0.02, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const grid = style.props.barrierGrid(PLAN);
const caption = style.props.caption();
// macro depth of field: focus = distance to the rig target every frame (head-on shots are one flat plane: no blur)
const dof = depthOfField(stage, { relativeAperture: style.spec.dof?.relativeAperture ?? 0.006, maxblur: style.spec.dof?.maxblur ?? 0.006 });
console.log(`[barrier-grid] plan fingerprint ${PLAN.fingerprint()}`);

/** exactly one label at all times: at each beat change the chip dips to 30 % and swaps text */
function labelAt(t) {
  let i = 0;
  while (i + 1 < LABELS.length && t >= LABELS[i + 1].on) i++;
  const L = LABELS[i], next = LABELS[i + 1];
  let a = 0.3 + 0.7 * Math.min(1, Math.max(0, t - L.on) / L.inDur);
  if (i === 0) a = 1;
  if (next) a = Math.min(a, 0.3 + 0.7 * Math.min(1, (next.on - t) / L.outDur));
  return [L.text, a];
}

function renderAt(t) {
  grid.update(t);
  caption.userData.show(...labelAt(t));
  rig.update(t);
  const c = stage.camera.position, tg = stage.camera.userData.rigTarget;
  dof.setFocus(Math.hypot(tg.x - c.x, tg.y - c.y, tg.z - c.z));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
