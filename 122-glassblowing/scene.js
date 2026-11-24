// scene.js — 122-glassblowing: "Breath and fire". Beats, plan, camera keys and SCORE live in scene.config.js; the shop
// (room, furnace, bench, marver, pipe, glass, jacks, breath pulse) and the caption come from the style.
// Every frame is a pure function of t: renderAt sets the camera, then the shop and the caption from the plan.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/glassblowing/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.03, far: 20 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const shop = style.props.hotShop(PLAN);
const caption = style.props.caption();
const CAP = style.spec.caption;

/** exactly one label at all times: at a beat change the old text rolls up out of the plate as the new one rolls in */
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const HOT = rgb(CAP.hotAccent), COLD = rgb(CAP.coldAccent);
function labelAt(t) {
  let i = 0;
  while (i + 1 < LABELS.length && t >= LABELS[i + 1].on - 0.1) i++;
  const L = LABELS[i], prev = LABELS[i - 1];
  const u = prev ? Math.min(1, Math.max(0, (t - (L.on - 0.1)) / CAP.roll)) : 1; // roll starts 0.1 s before the beat
  const c = Math.round(100 * PLAN.clarityAt(t)) / 100;
  const acc = hex(HOT.map((h, k) => h + (COLD[k] - h) * c));
  return u < 1 ? { a: prev.text, b: L.text, u: Math.round(u * 1000) / 1000, acc } : { a: L.text, b: "", u: 0, acc };
}

function renderAt(t) {
  rig.update(t);
  shop.update(t, stage.camera);
  caption.userData.show(labelAt(t));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
