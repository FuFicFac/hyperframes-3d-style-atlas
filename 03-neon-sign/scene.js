// scene.js — 03-neon-sign: "What is a token?" Every frame is a pure function of t.
import { createStage, Timeline } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle, flicker } from "./_atlas/styles/neon-sign/style.js";
import {
  DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, LAYOUT, CHUNKS, CHUNK_STAGGER, BRACKET_DELAY,
  PLATE_ON, ARROW_ON, CAPTION_ON,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { props } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const sent = objs.sentence;
const SY = LAYOUT.sentence.y;

// Derived props: an under-bracket and an ID number per token chunk, centred on the chunk's letters.
const chunkEls = CHUNKS.map((c) => {
  const r = sent.userData.charRange(c.i0, c.i1);
  const cx = (r.x0 + r.x1) / 2, w = r.x1 - r.x0 + LAYOUT.bracket.inset * 2;
  const bracket = props.neonIcon("underBracket", { w, h: LAYOUT.bracket.h, color: c.color, cap: LAYOUT.bracket.cap, spill: 0 });
  bracket.position.set(cx, LAYOUT.bracket.y, 0);
  const id = props.neonText(c.id, { height: LAYOUT.ids.height, color: c.color, spill: 0 });
  id.position.set(cx, LAYOUT.ids.y, 0);
  stage.scene.add(bracket, id);
  return { ...c, parts: r.parts, bracket, id };
});
// Divider tubes centred in the gap between consecutive chunks (sentence-local x -> world).
const dividers = chunkEls.slice(1).map((c, k) => {
  const prev = chunkEls[k], a = sent.userData.charRange(prev.i0, prev.i1).x1, b = sent.userData.charRange(c.i0, c.i1).x0;
  const d = props.neonIcon("divider", { size: LAYOUT.divider.height, color: LAYOUT.divider.color, cap: LAYOUT.bracket.cap, spill: 0, emissiveGain: LAYOUT.divider.gain, glowGain: 0.6 });
  d.position.set((a + b) / 2, SY + LAYOUT.sentence.height / 2, 0);
  stage.scene.add(d);
  return { el: d, on: c.on + LAYOUT.divider.lead };
});
const chunkOfPart = new Map();
chunkEls.forEach((c, k) => c.parts.forEach((p, j) => chunkOfPart.set(p, { k, j })));

// Cable runs on the wall to the transformer (world coords; z handled by cableRun).
const tr = objs.transformer, tin = tr.userData.inputs.map(([x, y]) => [x + tr.position.x, y + tr.position.y]);
const feedW = (el, which = "last") => {
  const e = el.userData.ends ?? [el.userData.feed];
  const f = which === "last" ? e[e.length - 1] : e[0];
  return [f[0] + el.position.x, f[1] + el.position.y];
};
const bus = LAYOUT.cableBusY;
const sF = feedW(sent), cF = feedW(objs.caption), qF = feedW(objs.question);
// Runs keep clear of lettering: sentence + plate cables go out to the right of the sign, then down.
const sRight = sent.position.x + sent.userData.bounds.x1 + LAYOUT.cableSide;
const pR = [objs.plate.userData.width / 2 - 0.02, LAYOUT.plate.y];
stage.scene.add(
  props.cableRun(sF, [sRight, bus + 0.05], { viaY: sF[1] - 0.02, viaX: sRight }),
  props.cableRun([sRight, bus + 0.05], tin[1], { viaY: bus + 0.05, clips: false }),
  props.cableRun(cF, tin[0], { viaY: bus }),
  props.cableRun(pR, [sRight - 0.06, bus + 0.1], { viaY: pR[1] - 0.001, viaX: sRight - 0.06 }),
  props.cableRun(qF, [qF[0] + 0.35, 4.2], { viaY: qF[1] + 0.25 }),
);

function renderAt(t) {
  objs.question.userData.update(t, { on: tl.at("question"), stagger: LAYOUT.question.stagger, seed: LAYOUT.question.seed });

  // sentence: warm-white letters, then each token chunk re-lights in its own colour
  const sOn = tl.at("sentence");
  sent.userData.parts.forEach((p, i) => {
    const ck = chunkOfPart.get(i);
    const c = ck && chunkEls[ck.k];
    const reOn = c ? c.on + ck.j * CHUNK_STAGGER : Infinity;
    if (t < reOn) sent.userData.setPart(i, flicker(t, sOn + i * LAYOUT.sentence.stagger, LAYOUT.sentence.seed * 97 + i), LAYOUT.sentence.color);
    else sent.userData.setPart(i, flicker(t, reOn, 500 + i * 13, { dur: 0.32 }), c.color);
  });
  sent.userData.sync();

  chunkEls.forEach((c, k) => {
    c.bracket.userData.update(t, { on: c.on + BRACKET_DELAY, seed: 700 + k });
    c.id.userData.update(t, { on: c.idOn, stagger: LAYOUT.ids.stagger, seed: 800 + k * 7 });
  });
  dividers.forEach((d, k) => d.el.userData.update(t, { on: d.on, seed: 750 + k }));
  objs.plate.userData.update(t, { on: PLATE_ON, seed: 901 });
  objs.arrow.userData.update(t, { on: ARROW_ON, seed: 911 });
  objs.caption.userData.update(t, { on: CAPTION_ON, stagger: LAYOUT.caption.stagger, seed: LAYOUT.caption.seed });

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
