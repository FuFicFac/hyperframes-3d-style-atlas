// scene.js — 110-differential-growth: "When room runs out". The plan (a stepped simulation run once at load), beats,
// camera keys and SCORE live in scene.config.js; the table, glass hoop, ribbon mesh and caption come from the style.
// Every frame is a pure function of t: renderAt reads the stored curve for t (blending neighbouring frames).
import { createStage, ease, clamp, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/differential-growth/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, TIMES } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.05, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const table = style.props.growthTable(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  // the ribbon stands up out of a flat ring in the first second (outBack), then the stored simulation drives it
  const rise = t <= TIMES.rise0 ? 0 : ease.outBack(clamp((t - TIMES.rise0) / (TIMES.rise1 - TIMES.rise0)));
  // a light band runs the ribbon's whole length once it is packed (material coordinate 0 -> 1)
  const u = clamp((t - TIMES.sweep0) / (TIMES.sweep1 - TIMES.sweep0));
  const sweepGain = smoothstep(TIMES.sweep0 - 0.05, TIMES.sweep0 + 0.35, t) * (1 - smoothstep(TIMES.sweep1 - 0.3, TIMES.sweep1, t));
  table.update(t, { rise, sweep: -0.05 + 1.1 * ease.inOutSine(u), sweepGain: style.spec.ribbon.sweepGain * sweepGain });
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = L.inDur ? fadeWindow(t, { on: L.on, inDur: L.inDur, off: L.off, outDur: L.outDur }) : (t < L.off ? 1 : fadeWindow(t, { on: -1, inDur: 1, off: L.off, outDur: L.outDur }));
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
