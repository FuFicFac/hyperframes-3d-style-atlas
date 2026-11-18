// scene.js — 79-wind-walker: "No brain. Just geometry." Beats, camera keys, the linkage plan and SCORE live in
// scene.config.js; beach, creature, diagram, footprints and caption come from the style. Every frame is a pure function of t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/wind-walker/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, TIMES, HERO_Z } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.3, far: 700 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.beach());
const walker = style.props.walker(PLAN);
const prints = style.props.footprints(PLAN);
stage.scene.add(walker, prints);
const diagram = style.props.diagram(PLAN, walker);
const caption = style.props.caption();

function renderAt(t) {
  const pose = PLAN.pose(t);
  walker.userData.update(t, pose);
  prints.userData.update(t);
  diagram.update(t, {
    ink: 1 - smoothstep(TIMES.ink[0], TIMES.ink[1], t),
    glow: 1 - smoothstep(TIMES.glow[0], TIMES.glow[1], t),
    t0: TIMES.loopT0,
  });
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.camera.position.x += pose.x;          // camera keys are relative to the walking body (assigned by rig.update each frame)
  stage.camera.updateMatrixWorld(true);
  style.helpers.setMist(smoothstep(TIMES.mist[0], TIMES.mist[1], t), Math.max(1, stage.camera.position.z - HERO_Z));
  style.helpers.follow(pose.x, stage.camera);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
