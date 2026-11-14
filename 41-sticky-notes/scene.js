// scene.js — 41-sticky-notes: a planning wall (brainstorm -> cluster -> vote -> move work across).
// All data lives in scene.config.js; the wall, notes, pad, dots, ink and pen come from the style (wallBoard(PLAN)).
// Every frame is a pure function of t: no rAF, no clocks, no accumulation (note meshes are rebuilt from the plan).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/sticky-notes/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.3, far: 40 });
const style = createStyle(stage);
const factories = { ...style.factories, wallBoard: () => style.props.wallBoard(PLAN) };
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const wall = objs.wall.userData;
const cap = style.props.caption(LABELS);

function renderAt(t) {
  wall.update(t);
  // one caption at a time: in with the beat, out 0.4 s before the next
  let idx = -1, a = 0;
  BEATS.forEach((b, i) => {
    const end = b.t + b.dur, last = i === BEATS.length - 1;
    if (t >= b.t && t < end) {
      idx = i;
      a = smoothstep(b.t + 0.05, b.t + 0.35, t) * (last ? 1 : 1 - smoothstep(end - 0.42, end - 0.12, t));
    }
  });
  cap.show(idx, a);
  rig.update(t);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
