// scene.js — 04-soft-clay: "What is training data?" in clay. Data lives in scene.config.js.
// Pure function of time: object motion is evaluated at tq = onTwos(t) (15 poses/s), the camera at t.
import { createStage, clamp, lerp, ease, spring } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/soft-clay/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, MACHINE, ITEMS, HOP, OUTPUT, KNEAD, LABELS, LABEL_DROP, PLAQUE } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props, motion: M } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const scene = stage.scene;
const machine = objs.machine;
const mud = machine.userData;
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const setS = (o, s, k = 1) => o.scale.set(Math.max(1e-4, s[0] * k), Math.max(1e-4, s[1] * k), Math.max(1e-4, s[2] * k));
const yawTo = (pos, t) => { const c = rig.sample(t).pos; return Math.atan2(c.x - pos[0], c.z - pos[2]); };

// ---- examples ----
const MOUTH = add3(MACHINE.pos, [0, mud.mouth[1] + 0.1 + MACHINE.mouthLift, 0]);
const items = ITEMS.map((it) => {
  const holder = new stage.THREE.Group();
  const p = props[it.make](it.opts);
  holder.add(p);
  scene.add(holder);
  return { it, holder, p };
});

// ---- output: marble lump -> brain ----
const marble = props.marble({ r: OUTPUT.marbleR, colors: ["tomato", "sky", "mint", "grape", "sun"], seed: 71 });
const brain = props.brain({ r: OUTPUT.brainR, seed: 81 });
const rays = props.rays({ n: 9, r0: 0.95, r1: 1.4, r: 0.05, color: "sun" });
scene.add(marble, brain, rays);
const CHUTE = add3(MACHINE.pos, [mud.chute[0], mud.chute[1] + 0.1, mud.chute[2]]);

// ---- beat labels (hung plaques) + final plaque ----
const labels = LABELS.map((l, i) => {
  const g = props.plaque({ text: l.text, cap: l.cap, color: l.color, letterColor: l.letter, rim: l.rim, hang: 4.5, seed: 200 + i * 7, pad: 0.3 });
  g.rotation.y = yawTo(l.pos, (l.in + l.out) / 2);
  g.userData.showLetters(99);
  scene.add(g);
  return { l, g };
});
const plaque = props.plaque({
  text: PLAQUE.text, cap: PLAQUE.cap, color: "cream", rim: "tangerine", seed: 300, pad: 0.45, depth: 0.2,
  colors: (ch, i, word) => PLAQUE.words[(word - 1) % PLAQUE.words.length],
});
plaque.rotation.set(PLAQUE.lean, yawTo(PLAQUE.pos, DURATION), 0);
scene.add(plaque);

function renderAt(t) {
  const tq = M.onTwos(t);
  style.setPose(t);

  // ---- machine: gulps on each arrival, kneads, big squeeze at output ----
  let k = 0;
  for (const it of ITEMS) k += 0.55 * (1 - M.jiggle(tq, it.hop + HOP.dur + 0.05, 1));
  k += M.knead(tq, KNEAD.start, KNEAD.end, { cycles: KNEAD.cycles });
  k += 0.9 * (1 - M.jiggle(tq, OUTPUT.squash, 1));
  const crankT = clamp(tq - KNEAD.start, 0, KNEAD.end - KNEAD.start + 0.3);
  mud.setKnead(k, crankT);
  machine.position.set(...MACHINE.pos);
  machine.rotation.set(0, 0, 0.035 * M.knead(tq, KNEAD.start + 0.08, KNEAD.end, { cycles: KNEAD.cycles * 1.5 }));
  style.applyBoil(machine, tq, 5, 0.004);

  // ---- examples: pop in, crouch, hop, sink into the funnel ----
  items.forEach(({ it, holder, p }, i) => {
    const base = it.scale;
    holder.rotation.set(0, it.rotY, 0);
    if (tq < it.pop) { holder.visible = false; return; }
    holder.visible = true;
    const end = it.hop + HOP.dur;
    if (tq < it.hop - style.spec.tuning.anticipation) {
      holder.position.set(...it.pos);
      setS(p, M.squashPop(tq, it.pop), base);
      p.rotation.set(0, 0, 0);
    } else if (tq < end) {
      const h = M.hop(tq, it.hop, HOP.dur, it.pos, MOUTH, { height: HOP.height, land: false, spin: HOP.spin * (i % 2 ? -1 : 1) });
      holder.position.set(...h.pos);
      holder.rotation.y = lerp(it.rotY, 0, h.u);
      setS(p, h.scale, base);
      p.rotation.set(...h.rot);
    } else if (tq < end + HOP.sink) {
      const u = (tq - end) / HOP.sink;
      holder.position.set(MOUTH[0], MOUTH[1] - 0.95 * ease.inQuad(u), MOUTH[2]);
      holder.rotation.y = 0;
      setS(p, M.vol(1 + 0.45 * u), base * (1 - 0.55 * u));
      p.rotation.set(0, 0, 0);
    } else { holder.visible = false; return; }
    style.applyBoil(holder, tq, 11 + i);
  });

  // ---- output ----
  const O = OUTPUT;
  marble.visible = tq >= O.emerge;
  const mo = M.morph(tq, O.morph, O.morphDur);
  if (marble.visible) {
    marble.rotation.set(0, 0, 0);
    if (tq < O.drop) {
      const u = ease.outCubic((tq - O.emerge) / O.emergeDur);
      marble.position.set(CHUTE[0] - 0.35 + 0.55 * u, CHUTE[1] - O.marbleR * 0.8, CHUTE[2]);
      const sx = 1 + 0.35 * Math.sin(Math.min(1, u) * Math.PI);
      setS(marble, [sx, 1 / Math.sqrt(sx), 1 / Math.sqrt(sx)], lerp(0.55, 1, u));
    } else if (tq < O.roll) {
      const from = [CHUTE[0] + 0.2, CHUTE[1] - O.marbleR * 0.8, CHUTE[2]];
      const h = M.hop(tq, O.drop, O.dropDur, from, O.land, { height: 0.15, anticipation: 0.001 });
      marble.position.set(...h.pos);
      setS(marble, h.scale);
    } else {
      const u = ease.inOutSine(clamp((tq - O.roll) / O.rollDur));
      const x = lerp(O.land[0], O.rest[0], u), z = lerp(O.land[2], O.rest[2], u);
      marble.position.set(x, 0, z);
      marble.rotation.z = -(x - O.land[0]) / O.marbleR;
      marble.position.y = 0;
      const sq = M.vol(M.jiggle(tq, O.drop + O.dropDur, 0.3));
      setS(marble, mo.swapped ? [0, 0, 0] : [sq[0] * mo.a[0], sq[1] * mo.a[1], sq[2] * mo.a[2]]);
      if (mo.swapped) marble.visible = false;
    }
    style.applyBoil(marble, tq, 31, 0.02);
  }
  brain.visible = mo.swapped;
  if (brain.visible) {
    brain.position.set(...O.rest);
    brain.rotation.set(0, -0.35, 0);
    const settle = M.jiggle(tq, O.morph + O.morphDur, 0.12);
    const sv = M.vol(settle);
    setS(brain, [mo.b[0] * sv[0], mo.b[1] * sv[1], mo.b[2] * sv[2]]);
    style.applyBoil(brain, tq, 41, 0.006);
  }
  const glow = ease.outCubic(clamp((tq - O.glow) / O.glowDur));
  brain.userData.setGlow(glow * (0.85 + 0.15 * Math.sin(tq * 5.0)));
  rays.position.set(O.rest[0], O.brainR * 0.85 + 0.1, O.rest[2]);
  rays.rotation.set(0, yawTo(O.rest, O.rays + 1), 0);
  rays.userData.setOpen(clamp((tq - O.rays) / 0.4));
  rays.visible = tq >= O.rays;

  // ---- beat labels: drop on their strings with a spring, then fly back up ----
  for (const { l, g } of labels) {
    if (tq < l.in || tq > l.out + LABEL_DROP) { g.visible = false; continue; }
    g.visible = true;
    let y, sq = 1;
    if (tq < l.out) {
      y = l.pos[1] + 3.2 * (1 - spring(tq - l.in, { stiffness: 140, damping: 11 }));
      sq = M.jiggle(tq, l.in + LABEL_DROP * 0.55, 0.12);
    } else {
      const u = (tq - l.out) / LABEL_DROP;
      y = l.pos[1] + 3.6 * ease.inBack(u, 1.6);
      sq = 1 + 0.18 * Math.sin(u * Math.PI);
    }
    g.position.set(l.pos[0], y, l.pos[2]);
    setS(g, M.vol(sq));
    g.rotation.z = 0.04 * Math.sin((tq - l.in) * 4.2) * Math.exp(-(tq - l.in) * 1.2);
  }

  // ---- final plaque: drops onto the table, splats, letters pop on one per pose ----
  plaque.visible = tq >= PLAQUE.drop - 0.001;
  if (plaque.visible) {
    const u = clamp((tq - PLAQUE.drop) / PLAQUE.dropDur);
    const y = 3.4 * (1 - ease.inQuad(u));
    plaque.position.set(PLAQUE.pos[0], y, PLAQUE.pos[2]);
    const sq = u < 1 ? 1 + 0.2 * u : M.jiggle(tq, PLAQUE.drop + PLAQUE.dropDur, 0.22);
    setS(plaque, M.vol(sq));
    plaque.userData.showLetters((tq - PLAQUE.lettersAt) / PLAQUE.letterStep, 2.5);
  }

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
