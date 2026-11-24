// scene.js — 121-strange-attractor: "A tiny difference". The Lorenz plan (integrated once, lorenz.js), beats, camera
// keys and SCORE live in scene.config.js; the studio, tubes, beads, cloud, gauge and caption come from the style. Every
// frame is a pure function of t: each tube shows the window of its stored path that ends at tau(t), every bead and
// cloud bead is read from the tables at tau(t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/strange-attractor/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, LABEL_ROLL } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 120 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props;

P.studio();
const att = P.attractor(PLAN);
const cloud = P.cloud(PLAN);
const gauge = P.gauge();
const caption = P.caption();

function renderAt(t) {
  att.update(t);
  cloud.update(t);
  gauge.update(t, PLAN);
  caption.show(LABELS, t, LABEL_ROLL);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
