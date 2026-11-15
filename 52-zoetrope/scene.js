// scene.js — 52-zoetrope: a 3D zoetrope. The spin plan, beats, camera keys and SCORE live in scene.config.js; the set,
// turntable, 48 fixed sculptures, strobe lamp, motion-blur pass and caption come from the style. Every frame is a pure
// function of t: renderAt reads the disc angle(s) from SPIN.anglesAt(t) and the lights from the strobe windows.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/zoetrope/style.js";
import { DURATION, CAMERA, SCORE, DUCK, SPIN, STROBE, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.1, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.scene.add(style.props.sweep());
const tt = style.props.turntable();
stage.scene.add(tt.group);
const lamp = style.props.lamp();
stage.scene.add(lamp);
const light = style.props.lighting(STROBE, { lamp });
const blur = style.props.motionBlur(tt);
const caption = style.props.caption();

function renderAt(t) {
  blur.setAngles(SPIN.anglesAt(t));
  const { dark } = light.update(t);
  let shown = false; // one label at a time: the one whose window contains t
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a, dark > 0.5); shown = true; }
  }
  if (!shown) caption.userData.show("", 0, false);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
