// scene.js — 45-lab-glassware: measure, pour, mix, tip, fizz (SAMPLE DATA). Every frame is a pure function of t: each
// volume, pose, colour, drop and bubble is read from the plan in scene.config.js (style planner liquids.js).
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { fadeWindow } from "./_atlas/kit/schedule.js";
import { clamp, smoothstep } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/lab-glassware/style.js";
import {
  DURATION, SCORE, DUCK, OBJECTS, CAMERA, DATA, COL, CYL, BEAK, BUR, BEAKER_AT, TIP, CYL_A, CYL_B, RACK_AT, FLASK_AT,
  FILL_A, FILL_B, POUR_A, POUR_B, SWIRL, DROP_VOL, BUR_V0, BUR_ZERO, DROPS, FIZZ_BUBBLES, FILL_BUBBLES, FOAM, TUBES, FLASK_UNITS,
  LABELS, LABEL_FADE, READOUTS, DROP_TAG,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.2, far: 40 });
const style = createStyle(stage);
const { props: Pr, plan: L, palette: P, helpers: H } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const scene = stage.scene;
const add = (v) => { scene.add(v); if (v.userData.ground) scene.add(v.userData.ground); return v; };

// ---- vessels ------------------------------------------------------------------------------------------
const cylMarks = (letter, color) => ({
  yA: CYL.floor - 0.01, yB: CYL.top - 0.012, x0: 0.14,
  ticks: H.unitTicks(CYL, { max: 100, minor: 2, mid: 10, major: 20 }),
  patch: { y0: L.heightFor(CYL, L.fromUnits(106)), y1: CYL.top - 0.03, text: letter, color, x0: 0.16, x1: 0.62, cap: 0.7 },
});
const cylA = add(Pr.cylinder({ color: COL.A, bubbles: 14, marks: cylMarks("A", COL.A) }));
const cylB = add(Pr.cylinder({ color: COL.B, bubbles: 14, marks: cylMarks("B", "#c28f00") }));
const beaker = add(Pr.beaker({
  color: COL.A, foam: true, bubbles: 70,
  marks: { yA: BEAK.floor - 0.005, yB: BEAK.top - 0.02, x0: 0.05, lenK: 0.28, ticks: H.unitTicks(BEAK, { max: 150, minor: 10, mid: 50, major: 50 }),
    patch: { y0: BEAK.floor + 0.035, y1: BEAK.floor + 0.12, text: "MIX", x0: 0.6, x1: 0.95, cap: 0.55 } },
}));
const reading = (r) => L.heightFor(BUR, BUR_V0 - L.fromUnits(r));
const burette = add(Pr.burette({
  color: COL.C,
  marks: { yA: BUR.floor + 0.01, yB: BUR.top - 0.008, span: 2.3, ppm: 2400, x0: 0.12, lenK: 0.4, cap: 0.024,
    ticks: H.unitTicks(BUR, { max: 2.8, minor: 0.1, mid: 0.5, major: 1, reading }) },
}));
const flask = add(Pr.flask({ color: P.D, marks: { yA: 0.04, yB: 0.36, x0: 0.18, lenK: 0.3, ticks: H.unitTicks(L.vesselProfile("flask"), { max: 40, minor: 10, mid: 20, major: 20 }) } }));
const funnel = add(Pr.funnel({}));
const rack = objs.rack;
const tubes = TUBES.map((d, i) => {
  const v = Pr.testTube({ color: d.color ?? d.layers[0].color });
  const s = rack.userData.slots[i];
  v.position.set(RACK_AT[0] + s[0], RACK_AT[1] + s[1], RACK_AT[2] + s[2]);
  scene.add(v);
  return { v, d };
});

// static liquids: flask, funnel position, tubes (set once; renderAt re-applies them, which is cheap and seek-safe)
const FL = flask.userData.profile, TB = tubes[0].v.userData.profile;
flask.position.set(...FLASK_AT);
funnel.position.set(FLASK_AT[0], FLASK_AT[1] + FL.dims.H - 0.11, FLASK_AT[2]);
function setStatics() {
  flask.userData.liquid.userData.set({ level: FLASK_AT[1] + L.heightFor(FL, L.fromUnits(FLASK_UNITS)), color: P.D });
  flask.userData.ground.userData.set({ x: FLASK_AT[0], z: FLASK_AT[2], fill: 0.6, color: P.D });
  funnel.userData.ground.visible = false;
  for (const { v, d } of tubes) {
    const y0 = v.position.y;
    if (d.layers) {
      let acc = 0; const layers = [];
      d.layers.forEach((l) => { acc += L.fromUnits(l.units); layers.push({ color: l.color, y: L.heightFor(TB, acc) }); });
      v.userData.liquid.userData.set({ level: y0 + layers[layers.length - 1].y, layers });
    } else v.userData.liquid.userData.set({ level: y0 + L.heightFor(TB, L.fromUnits(d.units)), color: d.color });
    v.userData.ground.visible = false;
  }
}

// ---- moving liquid ----------------------------------------------------------------------------------------
const streamA = Pr.stream({ color: COL.A }), streamB = Pr.stream({ color: COL.B });
const drops = Pr.drops({ color: COL.C, r: DROPS.r });
scene.add(streamA, streamB, drops);
burette.position.set(...TIP);
beaker.position.set(...BEAKER_AT);
const BK = beaker.userData, BF = BK.profile.floor;

// ---- overlay --------------------------------------------------------------------------------------------
const captions = LABELS.map((l) => ({ ...l, o: Pr.caption(l.text) }));
if (DATA.sample) Pr.stamp();
const readouts = READOUTS.map((r) => ({ ...r, o: Pr.readout(r.text, { side: r.side, color: r.color }) }));
const dropTags = DROPS.drops.map((d) => Pr.readout(`${d.i} drop${d.i > 1 ? "s" : ""}`, { side: "right", color: d.flip ? COL.react : COL.C }));

// ---------------------------------------------------------------------------------------------------------
function cylinderState(v, fill, pour, bubblesPlan, t) {
  const pose = L.pourPose(pour, t);
  const V = t < fill.t1 ? L.fillVolume(fill, t) : pose.V;
  v.userData.setPose(pose);
  let level = pose.tilt < 1e-5 ? pose.origin[1] + L.heightFor(CYL, V) : pose.level;
  if (pose.phase === "rest" && t < pour.tLift) level += L.fillWobble(fill, t);
  const depth = level - (pose.origin[1] + CYL.floor);
  v.userData.liquid.userData.set({ level, visible: V > 1e-7, men: Math.min(0.012, Math.max(0, depth) * 0.5) });
  const lvlLocal = level - pose.origin[1];
  const list = pose.tilt < 1e-5 ? bubblesPlan.map((b) => L.bubbleAt(b, t, CYL.floor, lvlLocal)).filter(Boolean) : [];
  v.userData.bubbles.userData.set(list, CYL.rIn);
  v.userData.ground.userData.set({ x: pose.origin[0], z: pose.origin[2], lift: pose.lift, fill: L.heightFrac(CYL, V) });
  return { pose, V, level };
}

function renderAt(t) {
  setStatics();
  const a = cylinderState(cylA, FILL_A, POUR_A, FILL_BUBBLES[0], t);
  const b = cylinderState(cylB, FILL_B, POUR_B, FILL_BUBBLES[1], t);

  // beaker: receives exactly what left the cylinders (a fall-time later) + every landed drop
  const rA = L.received(POUR_A, t), rB = L.received(POUR_B, t), nLand = L.dropsLanded(DROPS, t);
  const Vb = rA + rB + nLand * DROP_VOL;
  const lvlL = L.heightFor(BEAK, Vb), lvlW = BEAKER_AT[1] + lvlL;
  const mix = L.mixDyes([{ hex: COL.A, v: rA }, { hex: COL.B, v: rB }]);
  const sw = L.swirlState(t, SWIRL);
  const tipL = [TIP[0] - BEAKER_AT[0], lvlL - 0.01, TIP[2] - BEAKER_AT[2]];
  const last = L.lastDrop(DROPS, t);
  const bloom = last && !last.flip ? Math.exp(-last.age * 3.2) * smoothstep(0, 0.05, last.age) : 0;
  const rip = [];
  [[POUR_A, a, streamA, COL.A], [POUR_B, b, streamB, COL.B]].forEach(([p, , s, c]) => {
    const sp = L.streamPoints(p, t, lvlW);
    s.userData.set(sp, c);
    const tl = t - (p.tFlow + p.fall);
    const amp = clamp(L.pourRate(p, t - p.fall) / (p.rateMax / 2)) * 0.7;
    const land = sp?.landing ?? [p.lip[0] + p.side * p.v0 * p.fall * 0.8, 0, p.lip[2]];
    rip.push(tl > 0 && amp > 0.02 ? [land[0] - BEAKER_AT[0], land[2] - BEAKER_AT[2], tl, amp] : null);
  });
  rip.push(last ? [tipL[0], tipL[2], last.age, 0.9 * Math.exp(-2.4 * last.age)] : null);
  BK.liquid.userData.set({
    level: lvlW, visible: Vb > 1e-7, men: Math.min(0.012, (lvlL - BF) * 0.5),
    color: mix, colA: COL.A, colB: COL.B, swirl: sw.amount, phase: sw.phase,
    reactR: L.reactFront(DROPS, t, { spread: 0.9, maxR: 0.62 }), reactPos: tipL, reactCol: COL.react,
    dropK: bloom, dropR: 0.025 + 0.11 * clamp(last ? last.age / 0.45 : 0), dropPos: tipL, dropCol: COL.C, rip,
  });
  const flipped = t >= DROPS.flipT;
  const bcol = flipped ? COL.react : mix;
  const fh = L.foamHeight(t, FOAM);
  BK.foam.userData.set({ level: lvlW + fh, low: lvlW - 0.004, color: COL.react, visible: fh > 0.002 });
  BK.bubbles.userData.set(FIZZ_BUBBLES.map((q) => L.bubbleAt(q, t, BF, lvlL)).filter(Boolean), BK.profile.rIn, bcol);
  BK.ground.userData.set({ x: BEAKER_AT[0], z: BEAKER_AT[2], y: BEAKER_AT[1], fill: L.heightFrac(BEAK, Vb), color: bcol });

  // burette: falls one drop volume per released drop
  const nRel = L.dropsReleased(DROPS, t);
  burette.userData.liquid.userData.set({ level: TIP[1] + L.heightFor(BUR, BUR_V0 - nRel * DROP_VOL), color: COL.C });
  burette.userData.ground.visible = false;
  drops.userData.set(L.dropState(DROPS, t));
  void BUR_ZERO;

  // overlay: one caption at a time, readouts anchored to the menisci
  let shown = false;
  for (const c of captions) {
    const al = fadeWindow(t, { on: c.on, inDur: LABEL_FADE.inDur, off: c.off ?? Infinity, outDur: LABEL_FADE.outDur });
    c.o.userData.show(!shown && al > 0.001 ? al : 0);
    if (al > 0.001) shown = true;
  }
  rig.update(t);
  const anchor = { A: [CYL_A[0] - CYL.dims.R - 0.012, a.level, CYL_A[2]], B: [CYL_B[0] + CYL.dims.R + 0.012, b.level, CYL_B[2]], mix: [BEAKER_AT[0] + BEAK.dims.R + 0.012, lvlW, 0] };
  for (const r of readouts) r.o.userData.update({ at: anchor[r.id], alpha: fadeWindow(t, { on: r.on, inDur: 0.3, off: r.off, outDur: 0.3 }) });
  const tagA = fadeWindow(t, { on: DROP_TAG.on, inDur: 0.2, off: DROP_TAG.off, outDur: 0.3 });
  dropTags.forEach((o, i) => o.userData.update({ at: [TIP[0] + 0.05, TIP[1] - 0.06, TIP[2]], alpha: nLand === i + 1 ? tagA : 0 }));
  style.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
