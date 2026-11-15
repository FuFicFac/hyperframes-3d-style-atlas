// scene.js — 60-microscope-slide: the view down a light microscope. The lineage + optics plans, beats, labels and SCORE live in
// scene.config.js; the brightfield shader, eyepiece and overlay chips come from the style. Every frame is a pure function of t:
// renderAt writes every uniform from PLAN.at(t) / OPTICS.at(t); nothing carries over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { createStyle } from "./_atlas/styles/microscope-slide/style.js";
import { DURATION, SCORE, DUCK, PLAN, OPTICS, LABELS, SAMPLE_TAG, SCALE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 35, near: 0.1, far: 10 });
const style = createStyle(stage);
const field = style.props.microscopeField(PLAN, OPTICS);
const caption = style.props.caption();
const bar = style.props.scaleBar();
const mag = style.props.magTag();
const tag = style.props.sampleTag();

function renderAt(t) {
  const { optics } = field.userData.update(t);
  let shown = false; // one label at a time
  for (const L of LABELS) {
    const a = fadeWindow(t, { on: L.on, inDur: 0.35, off: L.off, outDur: 0.3 });
    if (a > 0.001 && !shown) { caption.userData.show(L.text, a); shown = true; }
  }
  if (!shown) caption.userData.show("", 0);
  const um = SCALE[optics.mag];
  const px = (um / optics.umR) * style.field.R;
  const ui = fadeWindow(t, { on: SAMPLE_TAG.on, inDur: 0.4, off: SAMPLE_TAG.off }) * (1 - optics.blink * 0.85);
  bar.userData.show({ um, px: Math.round(px) }, ui);
  mag.userData.show(optics.mag, ui);
  tag.userData.show(ui);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
