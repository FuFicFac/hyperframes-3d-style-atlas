// scene.js — 83-slit-scan: "Every column is a different moment". Beats, the time map, camera and SCORE live in
// scene.config.js; the bench, the multi-pass time camera and the overlay UI come from the style.
// Every frame is a pure function of t: the time camera re-renders every slice from MAP at t; nothing carries over.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/slit-scan/style.js";
import { DURATION, CAMERA, SCORE, DUCK, MAP, LABELS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 24, near: 1, far: 80, toneMapping: "none" });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const bench = style.props.bench();
const cam = style.props.timeCamera(bench);
const ui = style.props.ui(LABELS);

function renderAt(t) {
  rig.update(t);
  cam.set(MAP, t);     // slice lags + scan line for this video time
  ui.update(t, MAP);
  stage.render(t);     // K+1 scissored slice renders -> composite -> overlay
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
