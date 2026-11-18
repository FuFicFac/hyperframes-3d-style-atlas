// scene.js — 76-bullet-time: "Stop. Look closer." Beats, the two clocks (WARP, CAMPATH), the splash plan and SCORE live in
// scene.config.js; the studio, bowl, ball, liquid, droplets, caption and gauge come from the style.
// Every frame is a pure function of t: w = WARP.w(t) poses the whole world; the camera rig reads t directly.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/bullet-time/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, WARP, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.3, far: 90 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const world = style.props.world(PLAN);
stage.scene.add(world);
const caption = style.props.caption();
const gauge = style.props.gauge();
const [W0, W1] = WARP.range;

function renderAt(t) {
  const w = WARP.w(t);                    // clock 1: the world
  world.userData.update(w);
  gauge.userData.show({ cam: t / DURATION, world: (w - W0) / (W1 - W0), impact: (0 - W0) / (W1 - W0), mode: WARP.mode(t) }, 1);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.25, off: L.off, outDur: 0.25 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);                          // clock 2: the camera
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
