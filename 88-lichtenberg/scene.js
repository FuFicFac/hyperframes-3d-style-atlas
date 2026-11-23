// scene.js — 88-lichtenberg: "How a model searches for an answer". The burn plan, beats, camera keys and SCORE live in
// scene.config.js; the board, electrodes, tip flares, smoke and caption come from the style. Every frame is a pure
// function of t: renderAt sets one time uniform and rewrites the flares / wisps from PLAN; nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/lichtenberg/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.05, far: 30 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const burn = style.props.burnBoard(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  rig.update(t);
  const sh = burn.shake(t); // a few millimetres on the connection, assigned from t on top of the rig pose
  stage.camera.position.x += sh[0]; stage.camera.position.z += sh[2];
  burn.update(t, stage.camera);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    if (t < L.on || t >= L.off + 0.12 || shown) continue;
    caption.userData.show(L.text, smoothstep(L.on, L.on + 0.14, t) * (1 - smoothstep(L.off, L.off + 0.12, t)));
    shown = true;
  }
  if (!shown) caption.userData.show("", 0);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
