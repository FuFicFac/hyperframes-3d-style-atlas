// scene.js — 95-dollhouse-cutaway: "What happens to one question inside an AI system". The house layout, the route
// plan, camera keys and SCORE live in scene.config.js; the house, courier, roof sign and sky come from the style.
// Every frame is a pure function of t: everything below reads PLAN.*At(t) and nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { uploadTexture } from "./_atlas/kit/textures.js";
import { createStyle } from "./_atlas/styles/dollhouse-cutaway/style.js";
import { DURATION, CAMERA, SCORE, DUCK, LAYOUT, PLAN } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 24, near: 2, far: 140, shadows: false, toneMapping: "none", background: 0x2c3a6e });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA);
const P = style.props;

const sky = P.backdrop(LAYOUT);
const house = P.house(LAYOUT);
const courier = P.courier(LAYOUT);
const caption = P.caption(LAYOUT, PLAN.labels);
uploadTexture(stage, ...caption.userData.cards.map((c) => c.userData.texture)); // label canvases are drawn once: upload now

function renderAt(t) {
  sky.userData.update(PLAN.nightAt(t));
  house.userData.update(t, PLAN);
  courier.userData.update(PLAN.courierAt(t));
  const lab = PLAN.labelAt(t);
  caption.userData.show(lab.index, lab.flip);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
