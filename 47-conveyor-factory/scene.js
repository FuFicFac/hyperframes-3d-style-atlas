// scene.js — 47-conveyor-factory: "An order, packed" on a bright packing line. The plan, the camera and the score live in
// scene.config.js; belts, stations, items, lights, signs, counters, caption and stamp come from the style. Every frame is
// a pure function of t: renderAt reads positions / states from the precomputed plan and sets them.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/conveyor-factory/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, DATA, LABELS, LABEL_FADE, NET, PLAN } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.3, far: 80 });
const style = createStyle(stage);
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

const P = style.props;
const factory = P.packingLine({ net: NET, plan: PLAN, sample: DATA.sample });
stage.scene.add(factory);
const caption = P.caption();
if (DATA.sample) P.stamp();

function renderAt(t) {
  style.helpers.setBelts(t);
  factory.userData.update(t);
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
