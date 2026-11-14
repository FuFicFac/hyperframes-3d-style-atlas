// scene.js — 29-newspaper-press: "How news gets made" on a broadsheet front page.
// All data lives in scene.config.js; sheets, roller, grease pencil and stack come from the style. Every frame is a pure
// function of t: the sheets are baked once at load; renderAt only sets uniforms / poses from the plan.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/newspaper-press/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, PLAN, PIVOT } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.04, far: 12 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const M = style.motion, S = style.spec;
const A = objs.pageA, B = objs.pageB, stack = objs.stack, roller = objs.roller;
B.userData.local.add(roller);
const circle = PLAN.pencil.circle;
const pencil = style.props.greasePencil(circle.pts, { surfaceAt: B.userData.surfaceAt });
B.userData.local.add(pencil);
const spinA = style.helpers.spinIn(A, PIVOT);
const inkB = style.helpers.inkPass(B, roller);

function renderAt(t) {
  spinA(t, PLAN.spin);
  A.userData.setDevelop(M.developAt(t, PLAN.develop.A));
  if (t >= PLAN.turn.at) A.userData.setTurn(M.turnAt(t, PLAN.turn));
  else A.userData.setTurn(0);
  B.visible = t >= PLAN.spin.land;
  inkB(t, PLAN.ink);
  B.userData.setDevelop(M.developAt(t, PLAN.develop.B));
  pencil.userData.update(M.strokeAt(t, circle), M.pencilPose(t, circle, S));
  stack.userData.setDrop(M.dropPose(t, PLAN.drop, S));
  rig.update(t);
  stage.camera.position.y += M.kickAt(t, PLAN);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
