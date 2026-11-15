// scene.js — 70-art-deco: "Art Deco". Beats, the deco PLAN, camera keys and SCORE live in scene.config.js; the doorway,
// sunburst, tower, crown, searchlights, title panel, floor and caption come from the style. Every frame is a pure function
// of t: renderAt sets every door, ray, tier, ornament, beam and fade from PLAN at t; nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/art-deco/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, DOOR_HIDE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.3, far: 140 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const P = style.props;

stage.scene.add(P.floor());
stage.scene.add(P.plinth());
const sun = P.sunburst(PLAN); stage.scene.add(sun);
const doors = P.doorway(PLAN); stage.scene.add(doors);
const tower = P.tower(PLAN);
const crown = P.crown(PLAN);
const beams = P.searchlights(PLAN);
const panel = P.panel(PLAN, { title: "ART DECO", sub: "SYMMETRY  ·  TERRACES  ·  GOLD" });
const caption = P.caption();

function renderAt(t) {
  doors.userData.update(t, t < DOOR_HIDE);
  sun.userData.update(t);
  tower.update(t);
  crown.update(t);
  beams.update(t);
  panel.update(t);
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
