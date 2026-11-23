// scene.js — 112-schlieren: "The air was moving". Beats, plan, camera keys and SCORE live in scene.config.js; the
// optics bench (mirror + disc shader, candle, knife edge, lamp, camera, straw) and the caption come from the style.
// Every frame is a pure function of t: renderAt sets every uniform and pose from PLAN.uniformsAt(t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/schlieren/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.1, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const bench = style.props.schlierenBench(PLAN);
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
