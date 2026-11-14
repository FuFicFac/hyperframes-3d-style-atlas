// scene.js — 46-mixing-console: "Balancing a mix" (SAMPLE DATA) on a vintage analogue console. The mix plan, camera
// and score live in scene.config.js; the console, tape machine, caption and stamp come from the style.
// Every frame is a pure function of t: renderAt reads control positions and meter readings from the plan and sets them.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { ease } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/mixing-console/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, CHANNELS, MIX, LABELS, LABEL_FADE, EQ_FOR, JOG } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.25, far: 12 });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props;

const desk = P.consoleDesk({ channels: CHANNELS });
stage.scene.add(desk);
const ctl = P.mixController({ desk, mix: MIX });
const machine = objs.tapeMachine;

const caption = P.caption();
P.stamp();

function renderAt(t) {
  ctl.update(t, { eqFor: EQ_FOR, jog: ease.inOutSine((t - JOG.at) / JOG.dur) * JOG.turns * Math.PI * 2 });
  machine.userData.update(t);
  let shown = false;
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: LABEL_FADE.inDur, off: L.off, outDur: LABEL_FADE.outDur });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
