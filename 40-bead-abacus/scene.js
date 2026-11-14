// scene.js — 40-bead-abacus: "Votes, counted" (SAMPLE DATA) on a hardwood counting frame. All data, the bead plans and
// the camera live in scene.config.js; frame, beads, nameplates, divider, caption and stamp come from the style.
// Every frame is a pure function of t: renderAt only reads positions/counts from the planned rows and sets them.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/bead-abacus/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, DATA, LABELS, LABEL_FADE, MAIN_AT, HUNDRED_AT, SUN_SHIFT, ROWS, HPLAN, DIVIDER, PCT_AT, PLATE_PCT,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 40 });
const style = createStyle(stage);
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const sun = style.lights.sun;
sun.position.x += SUN_SHIFT[0]; sun.target.position.x += SUN_SHIFT[0];
sun.target.updateMatrixWorld();

const P = style.props;
const teams = P.frame({ rows: DATA.teams.length, beads: 10, labels: DATA.teams.map((d) => d.label), colors: DATA.teams.map((d) => d.color), plates: true });
teams.position.set(MAIN_AT[0], 0, MAIN_AT[1]);
stage.scene.add(teams);
const rows = ROWS.map((plan, r) => P.rowController({ frame: teams, row: r, plan }));

const hundred = P.hundredFrame({});
hundred.position.set(HUNDRED_AT[0], 0, HUNDRED_AT[1]);
stage.scene.add(hundred);
const hun = P.hundredController({ frame: hundred, plan: HPLAN });
const bar = P.divider({ frame: hundred, between: DIVIDER.between, nudge: DIVIDER.nudge });

const caption = P.caption();
if (DATA.sample) P.stamp();

function renderAt(t) {
  rows.forEach((c) => c.update(t));
  hun.update(t, t >= PCT_AT ? PLATE_PCT : undefined, t >= PCT_AT ? PCT_AT : undefined);
  bar.userData.update(t, DIVIDER.at);
  // one caption at a time: the one whose window contains t
  let shown = false;
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: LABEL_FADE.inDur, off: L.off, outDur: LABEL_FADE.outDur });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
