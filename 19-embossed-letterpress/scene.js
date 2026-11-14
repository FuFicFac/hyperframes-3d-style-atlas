// scene.js — 19-embossed-letterpress: "The three parts of a good prompt". Every frame is a pure function of t.
import { createStage, Timeline, smoothstep, ease, clamp } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { focusOn } from "./_atlas/kit/post.js";
import { createStyle } from "./_atlas/styles/embossed-letterpress/style.js";
import {
  DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, CARD, LAYERS, PRESSED_AT_START, GROW, PRESSES, LIGHT, FLASHES,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadows: false });
const style = createStyle(stage);
const { props, plan } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
void tl;

// the card: one sheet, every mark a relief layer
const card = props.reliefSheet({ width: CARD.width, height: CARD.height, layers: LAYERS });
stage.scene.add(card);
for (const id of PRESSED_AT_START) card.userData.setPress(id, 1);
const board = objs.board;

// one die per press, riding in the card's frame
const dies = PRESSES.map((p) => {
  const d = props.pressDie({ w: p.w, h: p.h });
  card.userData.content.add(d);
  return d;
});
const light = props.rakingLight({ plane: card });

function renderAt(t) {
  // slide the card onto the board; its shadow sliver follows
  const su = ease.outCubic(clamp((t - CARD.slide.at) / CARD.slide.dur));
  const off = CARD.slide.from.map((v) => v * (1 - su));
  card.userData.setSlide(off);
  board.userData.setCaster({ x: off[0], y: off[1], w: CARD.width, h: CARD.height }, 0.006);

  // presses: die pose, relief under it, sheet dip, die shadow (presses never overlap in time)
  let active = null;
  PRESSES.forEach((p, i) => {
    const st = plan.dieState(t, p);
    dies[i].userData.setState(st);
    card.userData.setPress(p.id, st.relief);
    if (st.visible) active = { st, p, die: dies[i] };
  });
  for (const g of GROW) card.userData.setPress(g.id, ease.inOutSine(clamp((t - g.t) / g.dur)));
  card.userData.setDie(active?.st, active?.die);
  if (active) card.userData.setDip({ x: active.p.x, y: active.p.y, w: active.p.w, h: active.p.h }, active.st.contact);
  else card.userData.setDip({ x: 0, y: 0, w: 0.1, h: 0.1 }, 0);

  // raking key + foil highlight band
  light.set({ azimuth: plan.keyed(t, LIGHT.azimuth), elevation: plan.keyed(t, LIGHT.elevation), intensity: plan.keyed(t, LIGHT.intensity) });
  const fl = plan.flashAt(t, FLASHES);
  card.userData.setFlash(fl.level, fl.pos);

  // camera: macro drift + a tiny nudge on each contact
  const cam = rig.update(t);
  stage.camera.position.z += plan.kickAt(t, PRESSES);
  light.syncView(stage.camera);
  focusOn(stage, cam.target.toArray(), { min: 0.42, max: 0.6 });
  void smoothstep;
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
