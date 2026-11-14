// scene.js — 33-card-table: "Three ways to learn" on a card table. All data and the dealer plan live in scene.config.js;
// table, lamp, cards, chips, button and plaque come from the style. Every frame is a pure function of t: renderAt only
// reads poses from the planned tracks and sets them (card meshes are re-bent from their base each time).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/card-table/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, TRACKS, FACES, CHIPS, BUTTON, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 34, near: 0.05, far: 8 });
const style = createStyle(stage);
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

const deck = style.props.deck({ n: TRACKS.length, faces: FACES });
stage.scene.add(deck.group);
const chips = CHIPS.map((T) => { const c = style.props.chip({ color: T.color }); stage.scene.add(c); return c; });
const button = style.props.dealerButton();
stage.scene.add(button);
const plaque = style.props.plaque();

function renderAt(t) {
  deck.cards.forEach((c, i) => c.userData.setPose(TRACKS[i].poseAt(t)));
  chips.forEach((c, k) => c.userData.setPose(CHIPS[k].poseAt(t)));
  button.userData.setPose(BUTTON.poseAt(t));
  // one label at a time: the one whose window contains t
  let shown = false;
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.35, off: L.off, outDur: 0.35 });
    if (a > 0.001 && !shown) { plaque.userData.show(L.text, a); shown = true; }
  }
  if (!shown) plaque.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
