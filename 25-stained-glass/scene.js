// scene.js — 25-stained-glass: "What a tree needs". Every frame is a pure function of t: the window plan (lead order, pane
// set times) and the light plan are fixed data; renderAt only evaluates them at t, moves the sun, and renders.
import { createStage, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/stained-glass/style.js";
import { DURATION, SCORE, DUCK, OBJECTS, CAMERA, LIGHT, SUN, CAPTIONS, CAPTION_POS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { plan, props } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const captions = CAPTIONS.map((c) => ({ ...c, g: props.caption(c.text, { swatch: c.swatch, ...CAPTION_POS }) }));
const levelOf = (region, t) => plan.regionLevel(LIGHT, region, t);

function renderAt(t) {
  style.setSun(plan.sunDir(t, SUN));
  objs.window.userData.update(t, levelOf);
  objs.shafts.userData.update(t, 0.15 + 0.85 * smoothstep(LIGHT.up[0], LIGHT.up[1], t));
  for (const c of captions) c.g.userData.update(t, c);
  rig.update(t);
  style.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
