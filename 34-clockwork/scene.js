// scene.js — 34-clockwork: a mechanical movement where one balance paces everything. Layout, beats and plans live in
// scene.config.js (escapement + gear train + cam from the style's planner, train.js). This file builds the movement
// from style props and, every frame, sets every angle from those plans. Pure function of t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/clockwork/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, CAPTIONS, ESC, LAYOUT, ESCAPEMENT as esc, BALANCE, FORK_TIP, PIN_R, TRAIN, WHEELS,
  BARREL, CAM, FOLLOW, ESC_Z, LEVER, BELL, BRIDGES, PLATE_JEWELS, leverAngle,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props } = style;
const scene = stage.scene;
const add = (o, p) => { if (p) o.position.set(p[0], p[1], p[2] ?? 0); scene.add(o); return o; };
const A = TRAIN.arbors;

// ---- plate + plate jewels
const objs = objectsFromSpec(scene, OBJECTS, style.materials, { factories: style.factories });
for (const j of PLATE_JEWELS) add(props.jewel(), [j[0], j[1], 0]);

// ---- the train
const sets = {};
for (const [id, w] of Object.entries(WHEELS)) sets[id] = add(props.wheelSet({ ...w }), A[id].pos);
const escWheel = props.escapeWheel({ teeth: ESC.teeth, rTip: ESC.rTip, rRoot: ESC.rRoot });
escWheel.position.z = ESC_Z;
sets.escape.userData.spin.add(escWheel);
const barrel = add(props.barrel({ ...BARREL }), A.barrel.pos);

// ---- escapement + balance
const anchor = add(props.anchor({ layout: LAYOUT, wheelCenter: ESC.center, rTip: ESC.rTip, forkTo: FORK_TIP, thickness: 0.05 }), [LAYOUT.pivot[0], LAYOUT.pivot[1], ESC_Z]);
anchor.add(props.arbor({ z0: -ESC_Z, z1: 0.72 - ESC_Z }));
const balance = add(props.balance({ r: BALANCE.r, z: BALANCE.z, rollerZ: BALANCE.rollerZ, pinR: PIN_R, pinDir: BALANCE.pinDir, hairspring: { studAngle: -0.9 } }), BALANCE.center);

// ---- strike work: cam on the fourth arbor (above the train bridge), lever, hammer, bell
const cam = props.cam({ ...CAM, dir: FOLLOW.cam.dir });
add(cam, [A.fourth.pos[0], A.fourth.pos[1], CAM.z]);
add(props.arbor({ z0: 0.72, z1: CAM.z + 0.1 }), A.fourth.pos);
const lever = add(props.strikeLever({ pivot: LEVER.pivot, nose: LEVER.nose, hammer: LEVER.hammer, headR: LEVER.headR, headZ: BELL.z - LEVER.z - 0.08, headH: 0.16 }), [LEVER.pivot[0], LEVER.pivot[1], LEVER.z]);
add(props.bell(BELL), BELL.center);

// ---- bridges
for (const b of BRIDGES) add(props.bridge(b));

// ---- captions (overlay enamel plaques, one at a time)
const plaques = CAPTIONS.map((c) => ({ c, m: props.plaque(c.text) }));

const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

function renderAt(t) {
  // one driver: the escape wheel; everything else is a tooth ratio away
  for (const id of Object.keys(sets)) sets[id].userData.setAngle(TRAIN.angle(id, t));
  barrel.userData.setAngle(TRAIN.angle("barrel", t));
  anchor.userData.setAngle(esc.anchor(t));
  balance.userData.update(esc.balance(t));
  cam.rotation.z = FOLLOW.camAngle(t);
  lever.userData.setAngle(leverAngle(FOLLOW.lift(t)));

  for (const { c, m } of plaques) m.userData.show(t, c.in, c.out);

  rig.update(t);
  const k = rig.sample ? rig.sample(t) : null;
  const tg = k?.target ?? [0, 0, 0];
  const cp = stage.camera.position;
  style.helpers.dof.setFocus(Math.hypot(cp.x - tg[0], cp.y - tg[1], cp.z - tg[2]));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
