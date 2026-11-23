// scene.js — 109-reaction-diffusion: "Rules, not a plan". The simulation, beats, camera keys and SCORE live in
// scene.config.js; the bench, glass dish, gel shader, drops, bottle, lid and caption come from the style.
// Every frame is a pure function of t: renderAt picks the two stored simulation states around t (the simulation ran
// once at load, in scene.config.js) and poses the drops from their landing times; nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/reaction-diffusion/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, labelAt, colonyAt, wipeAt } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.05, far: 30 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const petri = style.props.petriDish(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  petri.update(t, { colony: colonyAt(t), wipe: wipeAt(t) });
  const L = labelAt(t); // exactly one label: the current beat's
  caption.userData.show(L.text, L.alpha);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
