// scene.js — 31-weather-map: "What's coming" on a physical broadcast weather map. Built from weather-map props;
// every frame is a pure function of t (the weather plan is closed form; town states come from solved events).
import { createStage, clamp, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { pop } from "./_atlas/kit/motion.js";
import { createStyle } from "./_atlas/styles/weather-map/style.js";
import { DURATION, CAMERA, SCORE, DUCK, WEATHER, WEATHER_EVENTS, SHOW, CAPTIONS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const X = style.props, W = style.plan;
const P = W.weatherPlan(WEATHER, style.spec);
const add = (o) => (stage.scene.add(o), o);

// ---------------------------------------------------------------- the physical map
add(X.table());
add(X.landmass());
add(X.sea());
const bands = add(X.tempBands(P));
const clouds = add(X.cloudLayer(P, { seed: 31 }));

// ---------------------------------------------------------------- graphics layer
const iso = add(X.isobars(P));
const fronts = WEATHER.fronts.map((f) => add(X.front(P, f.kind)));
const wind = add(X.windField(P));
const H = add(X.pressureMarker("H"));
const L = add(X.pressureMarker("L"));

// ---------------------------------------------------------------- towns: pins + pre-baked state cards
const towns = WEATHER.places.map((pl, i) => {
  const temps = Object.fromEntries(W.STATES.map((s) => [s, `${P.placeTemp(pl, s)}°`]));
  return { pl, i, pin: add(X.placeMarker(pl)), card: X.placeCard(pl.name, { temps }), state: W.stateTimeline(WEATHER_EVENTS, pl.id, "sun") };
});
const lower = X.lowerThird(CAPTIONS);

const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const win = (t, [a, b]) => smoothstep(a, b, t);

function renderAt(t) {
  bands.userData.update(t, win(t, SHOW.bands));
  clouds.userData.update(t);
  iso.userData.update(t, win(t, SHOW.isobars));
  fronts.forEach((fr) => fr.userData.update(t));
  wind.userData.update(t, win(t, SHOW.arrows));
  towns.forEach(({ pin, i }) => pin.userData.set(pop(t, SHOW.places.start + i * SHOW.places.step - 0.15, 0.4, 1.4)));

  rig.update(t);
  // camera-facing letters + overlay anchors read this frame's camera pose
  H.userData.update(t, P.H(t), pop(t, SHOW.highPop, 0.5, 1.7));
  L.userData.update(t, P.L(t), pop(t, SHOW.lowPop, 0.5, 1.7));
  towns.forEach(({ pin, card, state, i }) => {
    const s = state(t);
    card.userData.update(t, { anchor: pin.userData.top, on: SHOW.places.start + i * SHOW.places.step, ...s });
  });
  const cap = CAPTIONS.find((c) => t >= c.on - 0.01 && t <= c.off + 0.01);
  lower.update(t, { i: cap ? cap.i : -1, on: cap?.on ?? 0, off: cap?.off ?? 0, barOn: SHOW.barOn });
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
