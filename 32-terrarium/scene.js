// scene.js — 32-terrarium: a sealed bottle garden builds and cycles on a windowsill. Every frame is a pure function
// of t: levels, growth, droplets and light are read from the plan in scene.config.js (style planner growth.js).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/terrarium/style.js";
import { DURATION, SCORE, DUCK, OBJECTS, CAMERA, POURS, GROWTH, DROPS, WAVES, DAY, CORK, TAGS, TAG_POS, NECK_TAG, JAR } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { props, plan } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const prof = objs.jar.userData.profile;
void JAR;

const strata = props.strata(POURS, { profile: prof });
const soil = POURS[POURS.length - 1];
const rock = props.rock(GROWTH.rock);
const moss = props.moss(GROWTH.moss);
const fern = props.fern(GROWTH.ferns);
const stems = GROWTH.stems.map((s) => props.leafyPlant(s));
const vines = GROWTH.vines.map((v) => props.vine(v));
const drops = props.droplets(DROPS, { profile: prof });
const cork = props.cork({ profile: prof });
const neckY = prof.top - 0.18;
const neckTag = props.tag(NECK_TAG.text, { tie: [0.36, neckY, prof.rOut(neckY) * 0.72 + 0.03], hang: 0.3, height: 0.2, yaw: 0.3, stringAngle: 0.75, angle: -0.08 });
stage.scene.add(strata, rock, moss, fern, ...stems, ...vines, drops, cork, neckTag);
const tags = TAGS.map((g) => ({ ...g, o: props.overlayTag(g.text, TAG_POS) }));

const surf = (x, z) => plan.surfaceY(soil, DURATION, x, z, prof);

function renderAt(t) {
  const wet = plan.wetness(DROPS, t);
  strata.userData.update(t, { wet });
  rock.userData.update(t, GROWTH.rock.t);
  moss.userData.update(t, surf);
  fern.userData.update(t);
  for (const s of stems) s.userData.update(t);
  for (const v of vines) v.userData.update(t);
  drops.userData.update(t);
  cork.userData.update(t, CORK);
  neckTag.userData.update(t, { on: NECK_TAG.on });
  style.setDaylight(plan.dayCycle(DAY, t));
  style.setHaze(plan.haze(WAVES, t));
  for (const g of tags) g.o.userData.update(t, { on: g.on, off: g.off });
  rig.update(t);
  style.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
