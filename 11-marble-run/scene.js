// scene.js — 11-marble-run: "What is a context window?" on a wooden marble machine. Data + choreography live in
// scene.config.js (PLAN = closed-form marble schedules from the style's marbles.js). This file only builds the
// machine from style props and applies PLAN.plans[i].at(t) every frame. Pure function of t.
import { createStage, clamp, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/marble-run/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, PLAN, COLORS, R, Z, HOPPER, FUNNEL, RAIL1, RAIL2, TUBE, FLAG, COUNTER, CHUTE, JAR,
  BACKSTOP, COUNTS, LABELS, HOOK, CAPTIONS, FINAL, SWING, ARROWS, WALL,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props } = style;
const scene = stage.scene;
const add = (o) => (scene.add(o), o);

// ---- set: pegboard (arrows painted in world metres) + bench
const objs = objectsFromSpec(scene, OBJECTS.filter((o) => o.id !== "wall"), style.materials, { factories: style.factories });
const wall = add(props.wall({ w: WALL.w, h: WALL.h, arrows: ARROWS, origin: [WALL.cx - WALL.w / 2, WALL.y0] }));
wall.position.set(WALL.cx, WALL.y0 + WALL.h / 2, 0);

// ---- machine
const hopper = add(props.hopper({ ...HOPPER, r: R }));
add(props.rail({ path: RAIL1.pts, r: R, extend: [0.02, 0.1] }));
add(props.funnel(FUNNEL));
add(props.wireTrack({ path: RAIL2.pts, r: R, bend: RAIL2.bend, extend: [0.22, 0.0] }));
add(props.tube(TUBE));
add(props.rail({ path: CHUTE.pts, r: R, extend: [0.3, 0.02] }));
const jar = add(props.jar({ ...JAR, backstop: BACKSTOP.top }));
jar.position.set(...JAR.pos);
const flag = add(props.flag({ len: FLAG.len }));
flag.position.set(...FLAG.pivot);
add(props.standoff([FLAG.pivot[0], FLAG.pivot[1], FLAG.pivot[2] - 0.03], 0.022));
const counter = add(props.counter({ digits: COUNTER.digits, label: COUNTER.label }));
counter.position.set(...COUNTER.pos);
for (const [k, l] of Object.entries(LABELS)) {
  const p = add(props.plaque({ text: l.text, cap: l.cap, kind: l.kind, seed: k.length }));
  p.position.set(...l.pos);
}
add(props.hook({ len: HOOK[2] + 0.04 })).position.set(HOOK[0], HOOK[1], 0);

// ---- marbles (+ the caustic spot in each one's wall shadow)
const marbles = PLAN.plans.map((p, i) => {
  const m = add(props.marble({ r: R, color: COLORS[i % COLORS.length], seed: 7 + i }));
  const spot = add(props.caustic(COLORS[i % COLORS.length]));
  return { p, m, spot };
});

// ---- captions: stamped ply tags dropped onto the hook; the final one is engraved brass
const tags = CAPTIONS.map((c, i) => ({ c, g: add(props.plaque({ text: c.text, cap: c.cap, kind: "wood", hang: 0.18, seed: 20 + i })) }));
const finalTag = add(props.plaque({ text: FINAL.text, cap: FINAL.cap, kind: FINAL.kind, hang: 0.18, seed: 40 }));
function swingTag(g, tin, tout, t) {
  if (t < tin || t > tout + SWING.out) { g.visible = false; return; }
  g.visible = true;
  const tau = t - tin, drop = 0.22;
  let y = HOOK[1], rz = 0;
  if (tau < drop) y += 2.4 * (1 - ease.inQuad(tau / drop));
  else {
    const s = tau - drop;
    rz = SWING.amp * Math.exp(-SWING.zeta * s) * Math.sin(SWING.omega * s); // damped pendulum after it lands on the hook
  }
  if (t > tout) { const u = (t - tout) / SWING.out; y += 2.6 * ease.inQuad(u); rz += 0.06 * u; }
  g.position.set(HOOK[0], y, HOOK[2] + 0.06);
  g.rotation.set(0, 0, rz);
}

const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const outletX = HOPPER.outlet[0];

function renderAt(t) {
  let gate = 0;
  for (const { p, m, spot } of marbles) {
    const s = p.at(t);
    m.userData.setPose(s);
    const inBin = s.p[0] < HOPPER.x1 - 0.02 && s.p[1] > HOPPER.y0;
    spot.visible = s.visible && !inBin;
    if (spot.visible) style.helpers.placeCaustic(spot, s.p, R);
    if (s.visible) gate = Math.max(gate, clamp(1 - Math.abs(s.p[0] - (outletX + 0.05)) / (R * 1.6)) * (s.p[1] > HOPPER.y0 ? 1 : 0));
  }
  hopper.userData.setGate(ease.outCubic(gate));

  // trip flag + counter: driven by the flag-crossing times from the plan
  let a = 0, v = 0;
  for (const tk of COUNTS) {
    const s = t - tk + 0.07;
    if (s > 0 && s < 1.6) a += s < 0.07 ? -0.75 * Math.sin((s / 0.07) * Math.PI / 2) : -0.75 * Math.exp(-5 * (s - 0.07)) * Math.cos(13 * (s - 0.07));
    v += ease.inOutCubic(clamp((t - tk - 0.06) / 0.2));
  }
  flag.userData.setAngle(a);
  counter.userData.setValue(v);

  tags.forEach(({ c, g }) => swingTag(g, c.in, c.out, t));
  swingTag(finalTag, FINAL.in, DURATION + 1, t);

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
