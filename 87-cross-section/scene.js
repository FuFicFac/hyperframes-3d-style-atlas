// scene.js — 87-cross-section: "Opening the black box". The plane keys, cut events, signal plan, camera keys and SCORE
// live in scene.config.js; the clipped solid, its cut faces, the slicing sheet, the paper and the caption come from the
// style. Every frame is a pure function of t: plane = planeAt(PLANE, t), pulses = FLOW.pulses(t), outside = outside(t).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/cross-section/style.js";
import { DURATION, CAMERA, SCORE, DUCK, MODEL, PLANE, FLOW, LABELS, CUT_DONE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.5, far: 120, shadows: false, toneMapping: "none" });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA);
const P = style.props, plan = style.plan, PAL = style.palette;

P.ground(MODEL);
const solid = P.solid(MODEL);
const sheet = P.sheet(MODEL);
const out = P.floaters(MODEL.M.rails.tokens + 3); // tokens, the answer block, two rails
const caption = P.caption();

function renderAt(t) {
  const plane = plan.planeAt(PLANE, t, MODEL.origin);
  solid.userData.setPlane(plane);
  // the sheet is the actor of the cut; once the section is open the outlined cut face shows where the plane is
  sheet.userData.set(plane, 1 - smoothstep(CUT_DONE - 0.2, CUT_DONE + 0.9, t));

  // outside the box: tokens ride in, answers come out (this is all the closed box ever shows)
  const o = plan.outside(MODEL, FLOW, t);
  o.tokens.forEach((k, i) => out.userData.set(i, { c: k.c, h: k.half, color: i % 2 ? PAL.tokenAlt : PAL.token, scale: k.scale }));
  const n = o.tokens.length;
  out.userData.set(n, { c: o.answer.c, h: o.answer.half, color: PAL.answer, scale: o.answer.scale });
  o.rails.forEach((r, i) => out.userData.set(n + 1 + i, { c: r.c, h: r.half, color: PAL.rail, scale: 1 }));

  rig.update(t);

  // one label at a time; a label about a part dims the others and points at it on the cut face
  let shown = null, alpha = 0;
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.22, off: L.off, outDur: 0.22 });
    if (a > 0.001 && !shown) { shown = L; alpha = a; }
  }
  solid.userData.setSignal(FLOW.pulses(t), shown?.focus ?? 0, shown?.focus ? alpha : 0);
  caption.userData.show(shown?.text ?? "", alpha, shown?.anchor ? plan.onPlane(MODEL.anchors[shown.anchor], plane) : null);

  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
