// scene.js — 100-endless-zoom: "What is inside one AI answer". The chain of worlds, the zoom plan, labels and SCORE live
// in scene.config.js; the worlds, the portal window and the caption come from the style. Every frame is a pure function
// of t: the plan gives the two visible worlds, their scales and the inner world's alpha at t.
import { createStage } from "./_atlas/kit/core.js";
import { createStyle } from "./_atlas/styles/endless-zoom/style.js";
import { DURATION, SCORE, DUCK, PLAN, CHAIN } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.01, far: 60, shadows: false });
const style = createStyle(stage);
const world = style.props.zoomWorld(PLAN, CHAIN);
const caption = style.props.caption();

function renderAt(t) {
  world.update(t);
  caption.userData.show(PLAN.labels(t).map((L) => ({ text: L.text, alpha: L.alpha, dot: style.palette[CHAIN[L.level].builder] })));
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
