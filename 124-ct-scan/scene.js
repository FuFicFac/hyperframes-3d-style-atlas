// scene.js — 124-ct-scan: "Slice by slice". The plan (box lift, scan, slice draw-in, peel, row, close, fade, tip, turn,
// dial, key), beats, camera keys and SCORE live in scene.config.js; the room, scanner, panel, slice cards, volume,
// caption and dial come from the style. Every frame is a pure function of t: renderAt asks the plan for the state at t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/ct-scan/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, labelAt } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.05, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const ct = style.props.ctScan(PLAN);
const caption = style.props.caption();
const dial = style.props.dial();

function renderAt(t) {
  ct.update(t);
  caption.userData.show(labelAt(t)); // exactly one label (sliding between beats)
  dial.userData.show(PLAN.dialAt(t));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
