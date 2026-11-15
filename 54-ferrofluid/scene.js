// scene.js — 54-ferrofluid. Every frame is a pure function of t: the field plan (scene.config.js FIELD, the style's
// field.js) gives the magnets' positions and strengths at t; the fluid shader, the magnet meshes and the caption read it.
import { createStage, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/ferrofluid/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, FIELD, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props } = style;
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

const fluid = props.fluid();
stage.scene.add(fluid);
const magnets = FIELD.magnets.map(() => { const m = props.magnet(); stage.scene.add(m); return m; });
const caption = props.caption();

function renderAt(t) {
  rig.update(t);
  const ms = FIELD.magnetsAt(t);
  ms.forEach((m, i) => magnets[i].userData.update(m.pos));
  fluid.userData.set(ms, FIELD.peak(t));
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = smoothstep(L.on, L.on + 0.35, t) * (1 - smoothstep(L.off - 0.35, L.off, t));
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  stage.sync();
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
