// scene.js — 58-impossible-geometry: "The endless stair". A walker climbs a stone staircase that loops for ever; the
// camera swings off the one angle where that is true, the loop splits open, then it swings back and the loop seals.
// Every frame is a pure function of t (closed-form walker, keyed camera, seam uniforms set from the camera pose).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/impossible-geometry/style.js";
import { walkerAt, walkParam } from "./_atlas/styles/impossible-geometry/impossible.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, WALK, TOWERS, TOWER, FLAG_CELL, TREE_LEDGE, LABELS, CAPTION, SUBJECT, toCamera, fadeOf } from "./scene.config.js";
import { virtualCell } from "./_atlas/styles/impossible-geometry/impossible.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const X = style.props, S = style.spec.stairs;

// ---------------------------------------------------------------- architecture
const stairs = X.stairs(PLAN);
stage.scene.add(stairs);
const aBoxes = [...stairs.userData.aBoxes];
for (const tw of TOWERS) {
  const c = PLAN.cells[tw.cell];
  const isA = tw.cell < S.seamCells, isB = tw.cell >= S.farFrom;
  const g = X.tower({ at: [c.x, c.y - PLAN.thick, c.z], w: TOWER.w, len: tw.len, cap: TOWER.cap, door: tw.door, cut: isB });
  stage.scene.add(g);
  if (isA) aBoxes.push(...g.userData.boxes.slice(0, 2)); // trim + shaft: the A end's virtual copy hides the far end
}
const fc = PLAN.cells[FLAG_CELL];
const flag = X.flag({ at: [fc.x + 0.42, fc.y, fc.z - 0.42], cut: FLAG_CELL >= S.farFrom });
stage.scene.add(flag);
const lc = PLAN.cells[TREE_LEDGE.cell];
const ledgeMin = [lc.x - 4 + TREE_LEDGE.min[0], lc.y + TREE_LEDGE.min[1], lc.z + 3 + TREE_LEDGE.min[2]];
const ledgeMax = [lc.x - 4 + TREE_LEDGE.max[0], lc.y + TREE_LEDGE.max[1], lc.z + 3 + TREE_LEDGE.max[2]];
stage.scene.add(X.block({ min: ledgeMin, max: ledgeMax, color: "trim", cut: true }));
stage.scene.add(X.tree({ at: [(ledgeMin[0] + ledgeMax[0]) / 2, ledgeMax[1], (ledgeMin[2] + ledgeMax[2]) / 2], h: 0.8, r: 0.36, cut: true }));

// soft flat ground shadow under the whole structure
const xs = SUBJECT.map((p) => p[0]), ys = SUBJECT.map((p) => p[1]), zs = SUBJECT.map((p) => p[2]);
const gy = Math.min(...ys) - 1.2;
stage.scene.add(X.groundShadow({ at: [(Math.min(...xs) + Math.max(...xs)) / 2, gy, (Math.min(...zs) + Math.max(...zs)) / 2], w: (Math.max(...xs) - Math.min(...xs)) * 1.25, d: (Math.max(...zs) - Math.min(...zs)) * 1.25 }));

// ---------------------------------------------------------------- walker
const walker = X.walker({ h: 0.8 });
stage.scene.add(walker);

// dashed line joining the chain's two ends (virtual landing after the last step -> the real first step)
const lift = (p) => [p[0], p[1] + 0.03, p[2]];
const gap = X.gapLine(lift(virtualCell(PLAN, PLAN.n)), lift(virtualCell(PLAN, 0)));
stage.scene.add(gap);

// ---------------------------------------------------------------- captions
const labels = LABELS.map((l) => ({ l, m: X.label(l.text, { x: CAPTION.x, y: CAPTION.y }) }));

const rig = createCameraRig(stage.camera, CAMERA, { drift: null });

function renderAt(t) {
  // walker: closed-form pose on the chain
  const w = walkerAt(PLAN, walkParam(WALK, t));
  walker.position.set(...w.pos);
  walker.rotation.y = w.heading;
  walker.scale.set(1, w.squash, 1);
  const onA = w.i < S.seamCells, onB = w.i >= S.farFrom;
  walker.userData.setCut(onB);
  flag.userData.update(t);

  // camera, then the seam uniforms from the same pose
  rig.update(t);
  style.helpers.updateSeam({ boxes: aBoxes, cyls: onA ? walker.userData.cyls(w.pos, w.squash) : [], toCamera: toCamera(t), magic: PLAN.magic, k: PLAN.k });

  gap.userData.set(1 - fadeOf(t));
  labels.forEach(({ l, m }) => m.userData.update(t, l));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
