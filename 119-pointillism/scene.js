// scene.js — 119-pointillism: "Only dots". Beats, the dot plan, camera keys, the squint and SCORE live in
// scene.config.js; the studio, the canvas, the dots, the brushes, the defocus and the caption plate come from the style.
// Every frame is a pure function of t: the dot shader reads one clock uniform, the brushes read plan.brushPose(b, t),
// the squint reads squintAt(t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/pointillism/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, LABEL_ROLL, squintAt } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.01, far: 30 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props;

stage.scene.add(P.studio());
const dots = P.dots(PLAN);
const brushes = P.brushes(PLAN);
stage.scene.add(dots, brushes);
const squint = P.defocus();
const caption = P.caption();

function renderAt(t) {
  rig.update(t);
  dots.userData.update(t);
  brushes.userData.update(t);
  squint.set(squintAt(t));
  caption.show(LABELS, t, LABEL_ROLL);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
