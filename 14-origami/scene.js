// scene.js — 14-origami: "One square, no cuts" — two kami sheets on a writing desk fold into a standing swan and a
// heart; the heart then stands up beside the swan. Data + choreography live in scene.config.js (fold cues ->
// folds.js timelines). Pure function of t.
import { createStage, clamp, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { pinToScreen } from "./_atlas/kit/overlay.js";
import { createStyle } from "./_atlas/styles/origami/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, SWAN, SWAN_CUES, HEART, HEART_CUES, LAND, HEART_RISE, SWAN_TURN, TAGS, TAG_POS, TAG_ANIM } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props } = style;
const scene = stage.scene;

objectsFromSpec(scene, OBJECTS, style.materials, { factories: style.factories });

// ---- the two models, each with a soft contact shadow on the desk
const mk = (m, cues) => {
  const g = props.foldModel({ ...m, cues });
  scene.add(g);
  const c = props.contact(g);
  scene.add(c);
  return { g, c, m };
};
const swan = mk(SWAN, SWAN_CUES);
const heart = mk(HEART, HEART_CUES);

// ---- labels: washi strips on the overlay (exact colours)
const tags = TAGS.map((g) => {
  const m = props.tag(g.text, { kicker: g.kicker });
  pinToScreen(stage, m, { x: TAG_POS.x, y: TAG_POS.y, height: TAG_POS.unit * m.userData.units });
  m.userData.setReveal(0);
  return { g, m };
});

const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

function place(M, t, delay) {
  const land = ease.outCubic(clamp((t - LAND.at - delay) / LAND.dur));
  M.g.position.set(M.m.pos[0], M.m.pos[1] + LAND.from * (1 - land), M.m.pos[2]);
  M.g.rotation.set(LAND.tilt * (1 - land), M.m.yaw, -LAND.tilt * 0.6 * (1 - land), "YXZ");
}

function renderAt(t) {
  // folds (angles, strips, crease reveal, guides) from each fold timeline
  swan.g.userData.update(t);
  heart.g.userData.update(t);

  // both sheets land on the desk
  place(swan, t, 0);
  place(heart, t, LAND.lag);

  // hero: the swan turns a little toward us; the heart stands up (pivoting near its bottom point) to face the camera
  const sw = ease.inOutSine(clamp((t - SWAN_TURN.at) / SWAN_TURN.dur));
  if (sw > 0) {
    swan.g.rotation.y = SWAN.yaw + SWAN_TURN.yaw * sw;
    swan.g.position.x += SWAN_TURN.slide[0] * sw; swan.g.position.z += SWAN_TURN.slide[2] * sw;
  }
  const hr = ease.inOutCubic(clamp((t - HEART_RISE.at) / HEART_RISE.dur));
  if (hr > 0) {
    heart.g.position.x += HEART_RISE.slide[0] * hr;
    heart.g.position.y += HEART_RISE.lift * Math.sin((Math.PI / 2) * hr);
    heart.g.position.z += HEART_RISE.slide[2] * hr;
    heart.g.rotation.x = HEART_RISE.tilt * hr;
  }

  swan.c.userData.update();
  heart.c.userData.update();

  // labels: unroll in, slide back out
  for (const { g: L, m } of tags) {
    const rin = ease.outCubic(clamp((t - L.in) / TAG_ANIM.inDur));
    const rout = ease.inCubic(clamp((t - L.out) / TAG_ANIM.outDur));
    m.userData.setReveal(rin * (1 - rout));
    m.material.opacity = rin * (1 - rout);
  }

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
