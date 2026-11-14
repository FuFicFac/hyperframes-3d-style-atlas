// scene.js — 42-inflatable: "Just add air". Timing and the inflation plan live in scene.config.js (the style's pure
// planner, inflate.js); this file builds the cast from the style's props and sets everything from t. Every skin is
// rebuilt from its flat outline each frame (style.js makeSkin). Pure function of time.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle, loadFonts } from "./_atlas/styles/inflatable/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, PLAN, WORD, DIGITS, HEART, STAR, FLOATS } from "./scene.config.js";

await loadFonts();

const stage = createStage({ canvas: "#stage", fov: 32 });
const style = createStyle(stage);
const { props } = style;
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

// ---- cast
const cast = {};
const word = props.word(WORD.text, { cap: WORD.cap, colors: WORD.colors, ids: WORD.ids });
stage.scene.add(word.group);
word.letters.forEach((L, i) => { cast[word.ids[i]] = L; });

const d4 = props.digit(DIGITS.from.n, { cap: DIGITS.cap, finish: "foil", color: DIGITS.from.color, id: "d4", seed: 91 });
const d5 = props.digit(DIGITS.to.n, { cap: DIGITS.cap, finish: "foil", color: DIGITS.to.color, id: "d5", seed: 97 });
const heart = props.heart({ w: HEART.w, color: HEART.color, id: "heart", seed: 13, valve: "neck" });
const star = props.star({ r: STAR.r, finish: "foil", color: STAR.color, id: "star", seed: 17 });
Object.assign(cast, { d4, d5, heart, star });
d4.userData.home = DIGITS.from.home; d5.userData.home = DIGITS.to.home;
heart.userData.home = HEART.home; star.userData.home = STAR.home;
for (const o of [d4, d5, heart, star]) stage.scene.add(o);

const contacts = Object.fromEntries(Object.entries(cast).map(([id, o]) => {
  const c = props.contact(o);
  stage.scene.add(c);
  return [id, c];
}));

// ribbons + weights for the floating balloons
const strings = Object.entries(FLOATS).map(([id, F], i) => {
  const w = props.weight({ color: id === "heart" ? "silver" : id === "star" ? "rose" : "gold" });
  const r = props.ribbon({ seed: i + 2 });
  stage.scene.add(w, r);
  return { id, obj: cast[id], w, r, w0: F.weight[0], w1: F.weight[1] };
});

const caption = props.caption(stage, BEATS);
const sample = props.tag(stage, "SAMPLE DATA", { from: BEATS[1].t, x: -0.86, y: 0.665, align: "left" });

const ids = Object.keys(cast);
function renderAt(t) {
  for (const id of ids) {
    const P = PLAN.pose(id, t);
    cast[id].userData.setPose(P);
    contacts[id].userData.update(P);
  }
  for (const s of strings) {
    const u = PLAN.pose(s.id, t).float;
    s.w.position.set(s.w0[0] + (s.w1[0] - s.w0[0]) * u, 0, s.w0[2] + (s.w1[2] - s.w0[2]) * u);
    s.w.updateWorldMatrix(true, false);   // fresh matrix before localToWorld (stale-matrix trap)
    const tie = s.obj.userData.tie();
    const top = s.w.localToWorld(s.w.userData.top.clone());
    s.r.userData.update(tie, top, t);
  }
  caption.userData.update(t);
  sample.userData.update(t);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
