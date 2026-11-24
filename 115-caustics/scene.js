// scene.js — 115-caustics: "The glass hides a picture". Beats, plan, camera keys and SCORE live in scene.config.js; the
// bench (table, slab, frame, rail, lamp, caustic engine) and the caption come from the style.
// Every frame is a pure function of t: renderAt sets the glass height, beam, room light and camera from the plan.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/caustics/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 38, near: 0.03, far: 30 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const bench = style.props.causticBench(PLAN);
const caption = style.props.caption();

/** exactly one label at all times: at each beat change the chip dips to 30 % and swaps text */
function labelAt(t) {
  let i = 0;
  while (i + 1 < LABELS.length && t >= LABELS[i + 1].on) i++;
  const L = LABELS[i], next = LABELS[i + 1];
  let a = 0.3 + 0.7 * Math.min(1, Math.max(0, t - L.on) / L.inDur);
  if (next) a = Math.min(a, 0.3 + 0.7 * Math.min(1, (next.on - t) / L.outDur));
  return [L.text, a];
}

function renderAt(t) {
  bench.update(t);
  caption.userData.show(...labelAt(t));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
