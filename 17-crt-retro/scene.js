// scene.js — 17-crt-retro: "ELIZA, 1966: the first chatbot" on a beige CRT terminal at night.
// All data lives in scene.config.js; the hardware, screen program and CRT shader come from the style.
// Every frame is a pure function of t: no rAF, no clocks, no accumulation.
import { createStage, Timeline } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/crt-retro/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, PROGRAM, CAPTIONS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.05, far: 12 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const ws = objs.workstation.userData;
ws.program(PROGRAM); // same planner + same program as the SCORE in scene.config.js
const caps = CAPTIONS.map((c) => ({ ...c, mesh: style.props.caption(c.text) }));

function renderAt(t) {
  void tl;
  ws.update(t);
  rig.update(t);
  for (const c of caps) c.mesh.userData.update(t, c);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
