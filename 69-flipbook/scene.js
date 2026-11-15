// scene.js — 69-flipbook: "Drawings come alive". The release plan, beats, camera keys and SCORE live in scene.config.js;
// the desk, pad, bent pages, pencil drawings, thumb, pencil and caption come from the style.
// Every frame is a pure function of t: renderAt rewrites every page from PLAN.pageState(k, t); nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { ease, clamp } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/flipbook/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, PENCIL } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32, near: 0.1, far: 40 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const book = style.props.flipbook(PLAN);
const caption = style.props.caption();

function renderAt(t) {
  // opening: the pencil finishes the ball's outline on page 0, lifts and leaves
  const u = clamp((t - PENCIL.t0) / (PENCIL.t1 - PENCIL.t0));
  const progress = PENCIL.p0 + (1 - PENCIL.p0) * ease.inOutSine(u);
  const lift = ease.outCubic(clamp((t - PENCIL.lift[0]) / (PENCIL.lift[1] - PENCIL.lift[0])));
  const out = ease.inCubic(clamp((t - PENCIL.out[0]) / (PENCIL.out[1] - PENCIL.out[0])));
  book.update(t, { progress, pencil: { on: t < PENCIL.out[1], p: progress, lift, out } });
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
