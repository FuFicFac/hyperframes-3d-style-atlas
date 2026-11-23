// scene.js — 107-magnetic-memory: "It remembers". The plan, beats, camera keys and SCORE live in scene.config.js; the
// board, instanced tiles, magnet, table and caption come from the style. Every frame is a pure function of t: renderAt
// rewrites every tile matrix and the magnet pose from PLAN at t; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/magnetic-memory/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.1, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const board = style.props.memoryBoard(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  board.update(t);
  // exactly one label at every moment (hard swap at the beat boundary)
  let text = LABELS[0].text;
  for (const L of LABELS) if (t >= L.on) text = L.text;
  caption.userData.show(text, 1);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
