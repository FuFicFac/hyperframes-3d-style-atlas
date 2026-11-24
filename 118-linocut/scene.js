// scene.js — 118-linocut: "Cut away what isn't". Beats, plan, camera keys, the present pose and SCORE live in
// scene.config.js; the bench, block, gouge, curls, roller, paper, baren and the caption come from the style.
// Every frame is a pure function of t: bench.update(t) sets every uniform and pose from the plan.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/linocut/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, PRESENT } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.02, far: 8 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const bench = style.props.linocutBench(PLAN, { present: PRESENT });
const caption = style.props.caption();

/** exactly one label at all times: at each beat change the old line rolls up and out while the new one rolls in */
function labelAt(t) {
  let i = 0;
  while (i + 1 < LABELS.length && t >= LABELS[i + 1].on) i++;
  const L = LABELS[i];
  if (i === 0) return ["", L.text, 1];
  return [LABELS[i - 1].text, L.text, Math.min(1, (t - L.on) / L.roll)];
}

function renderAt(t) {
  bench.update(t);
  caption.userData.show(...labelAt(t));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
