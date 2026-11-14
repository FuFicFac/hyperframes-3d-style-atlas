// scene.js — 44-star-chart: "How a song comes together" as two invented constellations on a planetarium dome.
// All data and the sky plan live in scene.config.js; dome, stars, gold atlas graphics, horizon, pointer and caption come
// from the style. Every frame is a pure function of t: renderAt only reads the plan (no canvas redraws, no carried state).
// Fonts: macOS system serif faces (Hoefler Text / Baskerville) — awaited BEFORE any canvas text is drawn.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { loadFonts } from "./_atlas/kit/fontoutline.js";
import { createStyle, FONT_FACES } from "./_atlas/styles/star-chart/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS } from "./scene.config.js";

await loadFonts({ load: FONT_FACES });
if (document.fonts?.ready) await document.fonts.ready;

const stage = createStage({ canvas: "#stage", fov: 54, near: 0.5, far: 420 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const chart = style.props.starChart(PLAN);
const caption = style.props.caption(LABELS.map((L) => L.text));

function renderAt(t) {
  chart.update(t);
  let idx = -1, a = 0;
  LABELS.forEach((L, i) => { const k = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 }); if (k > 0.001 && idx < 0) { idx = i; a = k; } });
  caption.show(idx, a);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
