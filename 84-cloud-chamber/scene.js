// scene.js — 84-cloud-chamber: "Invisible, until you look this way". The event plan, beats, cues, camera keys and SCORE
// live in scene.config.js; the trails, mist, instrument, room, source, magnet and caption come from the style. Every frame
// is a pure function of t: the trail shader ages each planned trail from its own birth time, the room/lamp/source/magnet
// levels are closed-form ramps of t. Nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { smoothstep, lerp, beat } from "./_atlas/kit/time.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/cloud-chamber/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, CUES, SOURCE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.3, far: 120 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props, H = style.helpers;

P.room();
P.chamber();
const mist = P.mist();
const trails = P.trails(PLAN);
const source = P.source({ p: SOURCE.p });
const magnet = P.magnet();
const caption = P.caption();

function renderAt(t) {
  // the room: lit and ordinary at first, then the lights go down and only the light sheet is left
  const room = 1 - smoothstep(CUES.dim[0], CUES.dim[1], t);
  const lamp = smoothstep(CUES.lampOn, CUES.lampOn + 0.12, t);
  H.room(room, lamp);
  mist.update(t, lamp * lerp(1, 0.3, room));
  trails.update(t, lerp(1, 0.07, Math.sqrt(room)));

  source.update(beat(t, CUES.sourceIn[0], CUES.sourceIn[1] - CUES.sourceIn[0], "outCubic"), 1);
  const m = smoothstep(CUES.magnetOn, CUES.magnetOn + 0.15, t);
  magnet.setLevel(m * (0.5 + 0.9 * Math.exp(-Math.max(0, t - CUES.magnetOn) * 1.6)));

  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
