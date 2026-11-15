// scene.js — 55-point-cloud: a LiDAR scan made only of dots. The scan plan, beats, camera keys and SCORE live in
// scene.config.js; the dot clouds, laser fans, tripods, caption and dot counter come from the style. Every frame is a
// pure function of t: drawRange = dots revealed by t, the laser column and head yaw come from the plan; nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { clamp } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/point-cloud/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, SHOW2, HIDE_NEAR } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 40, near: 0.05, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const scene = style.props.scanScene(PLAN);
const caption = style.props.caption();
const counter = style.props.counter();
const [tri1, tri2] = scene.scanners;

function renderAt(t) {
  rig.update(t);
  scene.update(t);
  const c = stage.camera.position, o = PLAN.scans[0].origin;
  tri1.userData.setShow(Math.hypot(c.x - o[0], c.y - o[1], c.z - o[2]) < HIDE_NEAR ? 0 : 1);
  tri2.userData.setShow(clamp((t - SHOW2.on) / SHOW2.dur));
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  const n = PLAN.countAt(t);
  counter.userData.show(n, n > 0 ? 1 : 0);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
