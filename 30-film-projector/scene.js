// scene.js — 30-film-projector: "How a letter travels" (SAMPLE) as a silent film in a screening room.
// Data and timing live in scene.config.js (the style's pure planner, reel.js); this file builds the set from the
// style's props and drives everything from t through helpers.projection. Pure function of time.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/film-projector/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, PLAN, STORY, SET } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 32 });
const style = createStyle(stage);
const { props } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const scene = stage.scene;

// the projected programme (one canvas shared by the screen and the beam)
const prog = props.programme({ pictures: STORY.map((s) => s.picture), titles: STORY.map((s) => s.title), endTitle: "THE END", endSub: "SAMPLE" });
const screen = objs.screen;
screen.userData.material.uniforms.uPic.value = prog.texture;

// light cone + dust motes from the lens tip to the screen
const beam = props.lightCone();
beam.position.set(...SET.lens);
scene.add(beam);
const motes = props.dustMotes({ beam: beam.userData });
motes.position.set(...SET.lens);
scene.add(motes);

// the film-strip set (far off to +X), with its own floating dust
const strip = props.filmStrip({ frames: PLAN.strip, pictures: STORY.map((s) => s.picture), titles: STORY.map((s) => s.title) });
strip.position.set(...SET.strip.origin);
scene.add(strip);
const stripDust = props.dustMotes({ box: [6, 2.4, 2.4], count: 120, seed: 77, level: 0.6 });
stripDust.position.set(SET.strip.origin[0] + 3, SET.strip.origin[1], SET.strip.origin[2] + 0.6);
scene.add(stripDust);

const show = style.helpers.projection({ plan: PLAN, programme: prog, screen, beam, motes, projector: objs.projector, camera: stage.camera });

// looking straight down the cone at the screen, the full haze would veil the picture: thin it per shot
const HAZE = { wide: { beam: 1, motes: 1 }, strip: { beam: 0, motes: 0 }, screen: { beam: 0.16, motes: 0.15 } };

function renderAt(t) {
  rig.update(t);
  const shot = PLAN.shotAt(t);
  show.update(t, HAZE[shot.kind]);
  // light table follows the camera's ride (eased like the camera move)
  if (shot.kind === "strip") {
    const u = Math.min(1, Math.max(0, (t - shot.t) / shot.dur));
    const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    strip.userData.setFocus(shot.from + (shot.to - shot.from) * e);
  }
  stripDust.userData.update({ t, camera: stage.camera, level: 1 });
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
