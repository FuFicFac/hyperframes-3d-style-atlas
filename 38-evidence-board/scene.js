// scene.js — 38-evidence-board: "Why does the fern keep wilting?" on a cork board. All data and the thread plan live in
// scene.config.js; board, items, pins, strings, flags, marker and caption come from the style. Every frame is a pure
// function of t: renderAt only reads poses/points from the plan (no canvas redraws, no carried state).
// Fonts: macOS system faces (American Typewriter, Marker Felt, Noteworthy) — awaited BEFORE any canvas text is drawn.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { loadFonts } from "./_atlas/kit/fontoutline.js";
import { createStyle, FONT_FACES } from "./_atlas/styles/evidence-board/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, PLAN, CONTENT, LABELS } from "./scene.config.js";

await loadFonts({ load: FONT_FACES });
if (document.fonts?.ready) await document.fonts.ready;

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.05, far: 10 });
const style = createStyle(stage);
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const board = style.props.evidence(PLAN, CONTENT);
const caption = style.props.caption(LABELS.map((L) => L.text));

function renderAt(t) {
  board.update(t);
  let idx = -1, a = 0;
  LABELS.forEach((L, i) => { const k = fadeWindow(t, { on: L.on, inDur: 0.3, off: L.off, outDur: 0.3 }); if (k > 0.001 && idx < 0) { idx = i; a = k; } });
  caption.show(idx, a);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
