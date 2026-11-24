// scene.js — 113-fourier-epicycles: "Circles that draw". Beats, the epicycle plan, camera keys and SCORE live in
// scene.config.js; the table, the brass chain, the ink and the caption plate come from the style. Every frame is a pure
// function of t: renderAt asks the plan where every joint is and how far each outline is drawn.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/fourier-epicycles/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, LABEL_ROLL, LIFT } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.02, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props;

stage.scene.add(P.table({ center: [0, -0.07] }));
const ink = P.inkLines(PLAN);
const chain = P.chain(PLAN);
stage.scene.add(ink, chain);
const caption = P.caption();
const tanH = Math.tan((style.camera.fov * Math.PI) / 360);

function renderAt(t) {
  rig.update(t);
  const cam = stage.camera, tg = cam.userData.rigTarget;
  const dist = tg ? Math.hypot(cam.position.x - tg.x, cam.position.y - tg.y, cam.position.z - tg.z) : 3;
  const ppm = stage.height / (2 * tanH * dist); // screen px per metre at the paper

  const u = smoothstep(LIFT.t0, LIFT.t1, t);
  chain.userData.update(t, { ppm, lift: LIFT.height * u * u, alpha: 1 - u });
  ink.userData.update(t, ppm);
  caption.show(LABELS, t, LABEL_ROLL);

  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
