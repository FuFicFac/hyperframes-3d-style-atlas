// scene.js — 59-light-painting: "Made of time, not matter". The stroke plan, beats, shutter times, camera keys and SCORE
// live in scene.config.js; the trails, blobs, pen flare, painter ghost, wet ground, night backdrop, bokeh, caption,
// exposure chip and shutter blades come from the style. Every frame is a pure function of t: the trail shader shows
// samples whose plan time is <= t, the pen is plan.penAt(t), the ghost poses are painterAt(t - k·lag). Nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/light-painting/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, SHUTTER, SPILL_GROUPS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.3, far: 120 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props, H = style.helpers;

P.backdrop();
P.ground();
P.bokeh();
const trails = P.trails(PLAN);
const blobs = P.blobs(PLAN);
const pen = P.pen();
const ghost = P.painter(PLAN);
const spill = P.spill(PLAN, SPILL_GROUPS);
const caption = P.caption();
const chip = P.indicator();
const blades = P.shutter();

function renderAt(t) {
  // the exposure only records while the shutter is open
  const open = t >= SHUTTER.open;
  const tt = Math.min(t, SHUTTER.close); // nothing new reaches the film after the shutter closes
  trails.update(open ? tt : -1);
  blobs.update(open ? tt : -1);
  const live = open && t < SHUTTER.close ? 1 : 0;
  pen.update(PLAN.penAt(tt), live);
  ghost.update(t, { freezeAt: SHUTTER.close, level: open ? 1 - 0.45 * H.develop(t, SHUTTER) : 0 });
  spill.update(open ? tt : -1);
  H.develop(t, SHUTTER);
  blades.close(H.shutterClosure(t, SHUTTER));

  chip.userData.show(t < SHUTTER.open ? { mode: "closed", secs: 0 } : t < SHUTTER.close
    ? { mode: "open", secs: Math.floor((t - SHUTTER.open) * 10) / 10 }
    : { mode: "done", secs: Math.floor((SHUTTER.close - SHUTTER.open) * 10) / 10 });
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
