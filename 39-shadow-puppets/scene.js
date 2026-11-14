// scene.js — 39-shadow-puppets: "The Tall Tale". Every frame is a pure function of t: the show plan (PLAN) gives each
// puppet's physical pose, the lamp and the ripple level; renderAt applies them, renders the shadow projector, then the frame.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/shadow-puppets/style.js";
import { DURATION, SCORE, DUCK, OBJECTS, CAMERA, PLAN, DESIGNS, CARD, TITLE, CAPTIONS, CAPTION_POS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadows: false });
const style = createStyle(stage);
const { props } = style;
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
props.lamp();
// layers: far scenery first; every puppet is a real cut-out behind the cloth AND a caster in the projector
const actors = {
  hillsFar: props.scenery(DESIGNS.hillsFar, { name: "hillsFar", cardT: CARD.hillsFar }),
  moon: props.scenery(DESIGNS.moon, { name: "moon" }),
  tree: props.scenery(DESIGNS.tree, { name: "tree" }),
  title: props.titleCut(TITLE.text, { cap: TITLE.cap, weight: TITLE.weight, name: "title" }),
  fox: props.puppet(DESIGNS.fox, { name: "fox" }),
  hillsNear: props.scenery(DESIGNS.hillsNear, { name: "hillsNear" }),
};
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const captions = CAPTIONS.map((c) => ({ ...c, g: props.caption(c.text, CAPTION_POS) }));

function renderAt(t) {
  style.update({ t, lamp: PLAN.lamp(t), ripple: PLAN.ripple(t) });
  for (const [id, p] of Object.entries(actors)) p.userData.update(PLAN.pose(id, t));
  for (const c of captions) c.g.userData.update(t, c);
  rig.update(t);
  style.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
