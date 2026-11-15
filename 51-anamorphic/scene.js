// scene.js — 51-anamorphic: "One angle. One message." The figure plans, camera keys, lock windows and SCORE live in
// scene.config.js; the room, pieces, strings, tape marks and caption come from the style. Every frame is a pure function
// of t: pieces hang exactly where the plan put them (sway weight is exactly 0 inside lock windows); only the camera moves.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow, pulse } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/anamorphic/style.js";
import { swayWeight } from "./_atlas/styles/anamorphic/anamorph.js";
import { DURATION, CAMERA, SCORE, DUCK, FIG_A, FIG_B, LOCKS, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 40, near: 0.2, far: 80 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.room());
stage.scene.add(style.props.tapeMark(FIG_A.eye));
stage.scene.add(style.props.tapeMark(FIG_B.eye));
const setA = style.props.pieceSet(FIG_A, { colors: style.palette.figA });
const setB = style.props.pieceSet(FIG_B, { colors: style.palette.figB });
stage.scene.add(setA, setB);
const caption = style.props.caption();
const lock = Object.fromEntries(LOCKS.map((w) => [w.fig, w]));

// how strongly figure `id` is "being read": 1 inside its lock window, eased in over the approach, out after release
const focus = (t, id) => fadeWindow(t, { on: lock[id].on - 0.9, inDur: 0.9, off: lock[id].off, outDur: 0.6 });

function renderAt(t) {
  const sway = swayWeight(t, LOCKS);
  const fA = focus(t, "A"), fB = focus(t, "B");
  setA.userData.update(t, { sway, dim: fB, glow: pulse(t, lock.A.on, { rise: 0.06, hold: 0.12, fall: 0.8 }) });
  setB.userData.update(t, { sway, dim: fA, glow: pulse(t, lock.B.on, { rise: 0.06, hold: 0.12, fall: 0.8 }) });
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
