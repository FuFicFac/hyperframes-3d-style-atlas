// scene.js — 71-galton-board: "Chance has a shape". Beats, camera keys, the ball plan and SCORE live in scene.config.js;
// the desk, board, balls, bell curve and caption come from the style. Every frame is a pure function of t: renderAt
// poses every ball from PLAN.pos(i, t), flashes the struck pegs from PLAN.pegGlow and sets the curve's draw progress.
import { createStage, clamp } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/galton-board/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, CURVE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.4, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
style.props.desk();
const board = style.props.board();
const balls = style.props.balls(PLAN);
const curve = style.props.curve(CURVE.pts);
const caption = style.props.caption();
const easeInOut = (u) => u * u * (3 - 2 * u);

function renderAt(t) {
  balls.update(t);
  board.update(PLAN, t);
  curve.userData.setProgress(easeInOut(clamp((t - CURVE.on) / CURVE.dur)));
  let shown = false; // one label at a time
  for (const Lb of LABELS) {
    const a = fadeWindow(t, { on: Lb.on, inDur: 0.3, off: Lb.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(Lb.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
