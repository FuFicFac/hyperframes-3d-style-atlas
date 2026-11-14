// scene.js — 48-city-lights: "Every window, a pixel". Timing, the skyline layout, every window program, traffic and
// sound live in scene.config.js (the style's pure planner, cityplan.js); this file builds the world from the style's
// props and sets everything from t. Pure function of time: the window atlas, LED atlas and traffic are rewritten from
// the plan every frame, and the water re-renders the mirrored world before each frame.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { framingReport } from "./_atlas/kit/framing.js";
import { createStyle } from "./_atlas/styles/city-lights/style.js";
import { DURATION, BEATS, CAMERA, SCORE, DUCK, PLAN, SIGNS, LANES, BLIMP, REGIONS } from "./scene.config.js";

await document.fonts.ready;

const stage = createStage({ canvas: "#stage", fov: 30, shadows: false, toneMapping: "neutral" });
const style = createStyle(stage);
const { props, root } = style;
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

// framing gate: every beat's subject (plus room for its roof sign) inside the safe area for the whole beat
const fr = framingReport(REGIONS, CAMERA, { duration: DURATION, drift: style.camera.drift, fov: style.camera.fov, safe: 0.92 });
if (!fr.ok) console.warn(`[atlas] city-lights framing: ${JSON.stringify(fr.spans).slice(0, 300)}`);

// ---- world (everything under root is mirrored into the water)
const sky = props.sky();
const city = props.skyline(PLAN);
const beacons = props.beacons(PLAN);
const ledSys = props.leds(PLAN);
const signs = SIGNS.map((s) => props.ledSign(ledSys, PLAN.byId[s.lot], { id: s.lot, cols: s.cols, pitch: s.pitch, legs: s.legs }));
const traffic = props.traffic(PLAN, LANES);
const blimp = props.blimp(ledSys, { id: "blimp" });
root.add(sky, city, beacons, ...signs, props.bridge(), props.quay(), traffic, blimp);
const water = props.water();
stage.scene.add(water);

const caption = props.caption(stage, BEATS);
const sample = props.tag(stage, "SAMPLE DATA · VALUES ARE ILLUSTRATIVE", { from: BEATS[1].t });

function renderAt(t) {
  sky.userData.update(t, PLAN);
  city.userData.update(t);
  beacons.userData.update(t);
  ledSys.update(t);
  for (const s of signs) s.userData.update(t, PLAN);
  traffic.userData.update(t);
  const u = Math.min(1, Math.max(0, (t - BLIMP.t0) / (BLIMP.t1 - BLIMP.t0)));
  blimp.position.set(BLIMP.from[0] + (BLIMP.to[0] - BLIMP.from[0]) * u, BLIMP.from[1] + (BLIMP.to[1] - BLIMP.from[1]) * u + Math.sin(t * 0.7) * 0.6, BLIMP.from[2]);
  blimp.userData.update(t);
  water.userData.update(t);
  caption.userData.update(t);
  sample.userData.update(t);
  rig.update(t);
  stage.sync();                               // fresh matrices before the mirrored pre-pass
  water.userData.renderReflection(root);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
