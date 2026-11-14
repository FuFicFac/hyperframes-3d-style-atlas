// scene.js — 28-cardboard-stop-motion: "How to plant a seed" on a cardboard workbench set. Data lives in scene.config.js.
// Pure function of time: EVERYTHING is evaluated at pose time tq = floor(t*10)/10 (on threes) — objects, the camera, the
// lamp flicker and the grain (stage.render(tq)) — plus seeded per-pose jitter keyed by the pose index.
import { createStage, clamp, lerp, worldPoint } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/cardboard-stop-motion/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, SET, SIGN, SOIL, HILL, SUN, PUPPET, SPROUT, LABELS, TOOLS, HAND_R, LEFT, NECK,
  DIG_STROKES, SEED_DROP, MOUND_AT, POUR, CHEER,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props, plan: PL, shapes: SH } = style;
const THREE = stage.THREE;
const scene = stage.scene;
objectsFromSpec(scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: null });
const T = style.spec.board.thickness;

// ---------------------------------------------------------------- backdrop (marker doodles) + lamp
const cloud = (h, cx, cy, s) => {
  const bumps = [[-0.55, 0, 0.32], [-0.15, 0.18, 0.42], [0.35, 0.08, 0.36], [0.7, -0.04, 0.26]];
  for (const [x, y, r] of bumps) h.line(SH.circlePts(r * s, 26, cx + x * s, cy + y * s).filter(([, py]) => py > cy - 0.12 * s), "blue", 0.035);
  h.line([[cx - 0.85 * s, cy - 0.12 * s], [cx + 0.95 * s, cy - 0.12 * s]], "blue", 0.035);
};
const backdrop = props.backdrop({ w: SET.backdrop.w, h: SET.backdrop.h, seed: 5, draw: (h) => {
  cloud(h, -1.6, 4.25, 0.85);
  cloud(h, 1.4, 4.7, 0.6);
  for (const [x, y, s] of [[0.2, 3.65, 0.16], [0.6, 3.9, 0.12], [-0.25, 3.95, 0.1]]) h.line([[x - s, y + s * 0.5], [x, y], [x + s, y + s * 0.6]], "ink", 0.028);
  h.line([[-7, 0.95], [7, 0.95]], "kraftDark", 0.03, { alpha: 0.5 });
} });
backdrop.position.set(0.4, 0, SET.backdrop.z);
scene.add(backdrop);

const lamp = props.lamp();
lamp.position.set(...SET.lamp.pos);
lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...SET.lamp.target).sub(new THREE.Vector3(...SET.lamp.pos)).normalize());
scene.add(lamp);
const roll = props.tapeRoll(); roll.position.set(...SET.roll); scene.add(roll);
const pen = props.markerPen({ color: "red" }); pen.position.set(...SET.pen); pen.rotation.y = 0.35; scene.add(pen);
const pen2 = props.markerPen({ color: "ink" }); pen2.position.set(SET.pen[0] + 0.25, 0, SET.pen[2] + 0.35); pen2.rotation.y = 0.15; scene.add(pen2);

// ---------------------------------------------------------------- sign box + one card per label
const SB = SIGN.box;
const signBox = props.box({ w: SB.w, h: SB.h, d: SB.d, seed: 15, draw: { front: (h) => {
  h.arrow([[-0.75, -0.1], [-0.75, 0.2]], "ink", 0.03, 0.09); h.arrow([[0.75, -0.1], [0.75, 0.2]], "ink", 0.03, 0.09);
} } });
signBox.position.set(SB.x, 0, SB.z);
scene.add(signBox);
const cards = LABELS.map((l, i) => {
  const s = props.sign({ w: SIGN.w, h: SIGN.h, seed: 21 + i * 3, draw: (h) => {
    const b = SIGN.badge;
    h.hatch(SH.circlePts(b.r, 28, b.x, SIGN.h / 2), "red", { seed: 40 + i, alpha: 0.8 });
    h.line(SH.circlePts(b.r, 28, b.x, SIGN.h / 2), "ink", 0.03, { closed: true });
    h.text(String(l.n), b.x, SIGN.h / 2, 0.3, { seed: 50 + i });
  } });
  s.position.set(SB.x, SB.h, SB.z + 0.05);
  scene.add(s);
  return { l, s, seed: 300 + i };
});

// ---------------------------------------------------------------- soil strip: replacement pieces flat / dip / hole / mound
function soilOutline(kind) {
  const pts = [[SOIL.x0, 0], [SOIL.x1, 0]];
  const n = 40, c = SOIL.hole, hw = SOIL.holeW / 2;
  for (let k = n; k >= 0; k--) {
    const x = lerp(SOIL.x0, SOIL.x1, k / n);
    let y = SOIL.h + 0.035 * Math.sin(x * 3.1) + 0.02 * Math.sin(x * 7.3);
    const u = clamp(1 - Math.abs(x - c) / hw, 0, 1), bell = Math.sin((u * Math.PI) / 2) ** 1.5;
    if (kind === 1) y -= 0.1 * bell;
    if (kind === 2) y -= SOIL.holeD * bell;
    if (kind === 3) y += 0.1 * bell;
    pts.push([x, y]);
  }
  return pts;
}
const soilPieces = [0, 1, 2, 3].map((kind) => props.cutout(soilOutline(kind), { seed: 90, draw: (h) => {
  h.hatch(soilOutline(kind).map(([x, y]) => [x, y > 0.05 ? y : -0.1]).concat([[SOIL.x1, -0.1]]), "#6b4426", { seed: 91, gap: 0.05, alpha: 0.75, wash: 0.35 });
  for (let k = 0; k < 14; k++) { const x = lerp(SOIL.x0 + 0.2, SOIL.x1 - 0.2, (k + 0.5) / 14); h.dot(x + Math.sin(k * 7.1) * 0.08, 0.15 + ((k * 37) % 10) / 40, 0.02 + (k % 3) * 0.008, "ink"); }
} }));
const soil = props.swapper(soilPieces);
soil.position.z = SOIL.z;
scene.add(soil);

// ---------------------------------------------------------------- hill + sun on a stick
const hillPts = [[-HILL.w / 2, 0], [HILL.w / 2, 0]];
for (let k = 24; k >= 0; k--) { const x = lerp(-HILL.w / 2, HILL.w / 2, k / 24), u = x / (HILL.w / 2); hillPts.push([x, Math.max(0.15, HILL.h * (1 - u * u) ** 0.8 + 0.06 * Math.sin(k * 1.3))]); }
const hill = props.cutout(hillPts, { seed: 95, draw: (h) => {
  h.hatch(hillPts, "green", { seed: 96, alpha: 0.7, angle: -0.6 });
  h.line(hillPts.slice(2), "#1f5a33", 0.04);
  for (const [x, y] of [[-0.8, 1.0], [0.5, 1.3], [1.0, 0.6], [-0.2, 0.55]]) h.line([[x - 0.08, y], [x, y + 0.1], [x + 0.08, y]], "#1f5a33", 0.03);
} });
hill.position.set(HILL.x, 0, HILL.z);
scene.add(hill);
const sunRig = new THREE.Group();
const rays = props.wheel({ r: SUN.rays, teeth: 10, depth: 0.32, seed: 101, color: "orange", draw: (h) => h.hatch(SH.gearPts(SUN.rays, 10, 0.32), "orange", { seed: 102, alpha: 0.85 }) });
rays.position.z = -T - 0.01;
const sunDisc = props.cutout(SH.circlePts(SUN.r, 36), { seed: 103, draw: (h) => {
  h.hatch(SH.circlePts(SUN.r, 36), "yellow", { seed: 104, alpha: 0.95 });
  h.dot(-0.15, 0.08, 0.04); h.dot(0.15, 0.08, 0.04);
  h.line([[-0.18, -0.12], [0, -0.22], [0.18, -0.12]], "ink", 0.03);
} });
const sunStick = props.stick({ len: 3.2 });
sunStick.position.set(0, -3.2, -T - 0.05);
sunRig.add(rays, sunDisc, sunStick);
scene.add(sunRig);

// ---------------------------------------------------------------- puppet + tools
const pup = props.puppet({ seed: 60 });
scene.add(pup);
const J = pup.userData.joints;
const handR = pup.userData.handR;
const spade = new THREE.Group();
const blade = [[-0.13, -0.72], [0.13, -0.72], [0.12, -0.95], [0, -1.06], [-0.12, -0.95]];
spade.add(props.cutout(SH.roundRectPts(-0.035, -0.75, 0.035, 0.12, 0.03), { seed: 110, draw: (h) => h.hatch(SH.roundRectPts(-0.1, -0.8, 0.1, 0.2, 0), "#7a4a22", { seed: 111, alpha: 0.6 }) }));
const bladeCut = props.cutout(blade, { seed: 112, draw: (h) => { h.hatch(blade, "#6f7b86", { seed: 113, alpha: 0.75 }); h.line(blade, "ink", 0.022, { closed: true }); } });
bladeCut.position.z = T + 0.004;
spade.add(bladeCut);
spade.position.z = T + 0.004;
handR.add(spade);
const canG = new THREE.Group();
const canBody = SH.roundRectPts(0.0, -0.42, 0.56, 0.0, 0.06);
canG.add(props.cutout(canBody, { seed: 120, draw: (h) => { h.hatch(canBody, "blue", { seed: 121 }); h.line([[0.08, -0.12], [0.48, -0.12]], "ink", 0.025); } }));
const spoutPath = [[0.5, -0.32], [0.85, -0.05], [0.98, 0.08]];
const spoutPts = style.helpers.strokeOutline(spoutPath, 0.045);
const spoutCut = props.cutout(spoutPts, { seed: 122, wonk: 0.3, draw: (h) => h.hatch(spoutPts, "blue", { seed: 123 }) });
spoutCut.position.z = -T - 0.004;
canG.add(spoutCut);
const handlePts = style.helpers.strokeOutline([[0.08, -0.02], [0.12, 0.18], [0.3, 0.26], [0.46, 0.18], [0.5, -0.02]], 0.04);
const handleCut = props.cutout(handlePts, { seed: 124, wonk: 0.3, draw: (h) => h.hatch(handlePts, "blue", { seed: 125, alpha: 0.6 }) });
handleCut.position.z = -T - 0.004;
canG.add(handleCut);
const spoutTip = new THREE.Group(); spoutTip.position.set(1.0, 0.06, 0); canG.add(spoutTip);
canG.position.set(-0.3, -0.25 + 0.0, T + 0.004);
const canPivot = new THREE.Group(); canPivot.add(canG); handR.add(canPivot);
const seedPts = SH.ellipsePts(0.085, 0.06, 18);
const seed = props.cutout(seedPts, { seed: 130, thickness: 0.05, draw: (h) => { h.hatch(seedPts, "#5b3a1c", { seed: 131, alpha: 0.9 }); h.line([[-0.03, 0.0], [0.03, 0.01]], "kraftLight", 0.012); } });
scene.add(seed);
const drops = Array.from({ length: 4 }, (_, k) => {
  const dp = [[0, 0.15], [0.08, -0.03], [0.06, -0.1], [0, -0.13], [-0.06, -0.1], [-0.08, -0.03]];
  const d = props.cutout(dp, { seed: 140 + k, thickness: 0.04, wonk: 0.3, draw: (h) => h.hatch(dp, "#7fb6f0", { seed: 150 + k, alpha: 0.9, gap: 0.025 }) });
  scene.add(d);
  return d;
});

// ---------------------------------------------------------------- sprout: five replacement stages
const GREEN = "green", DARK = "#1f5a33";
function sproutStage(s) {
  const g = new THREE.Group();
  const Hs = [0.62, 0.9, 1.2, 1.5, 1.62][s];
  const stemPath = [[0, 0], [0.03, Hs * 0.35], [-0.02, Hs * 0.7], [0.0, Hs]];
  const stemPts = style.helpers.strokeOutline(stemPath, 0.035 + s * 0.004);
  g.add(props.cutout(stemPts, { seed: 160 + s, wonk: 0.3, draw: (h) => h.hatch(stemPts, GREEN, { seed: 161, gap: 0.03 }) }));
  const leaves = [[0.18, 0.12, 0.6], [0.2, 0.13, 2.5], [0.24, 0.14, 0.45], [0.24, 0.14, 2.7]].slice(0, s === 0 ? 2 : s < 3 ? 3 : 4);
  leaves.forEach(([rx, ry, rot], k) => {
    const cy = Hs * (k < 2 ? 0.92 : 0.5) - (s === 0 ? 0.02 : 0);
    const cx = Math.cos(rot) * rx * 0.95;
    const lp = SH.ellipsePts(rx * (s === 0 ? 0.7 : 1), ry * (s === 0 ? 0.7 : 1), 20, cx, cy + Math.sin(rot) * ry, rot);
    const leaf = props.cutout(lp, { seed: 170 + s * 5 + k, wonk: 0.4, draw: (h) => { h.hatch(lp, GREEN, { seed: 171 + k, gap: 0.03 }); h.line([[lp[10][0] * 0.3 + cx * 0.7, cy], [cx + Math.cos(rot) * rx * 0.6, cy + Math.sin(rot) * rx * 0.6]], DARK, 0.018); } });
    leaf.position.z = (k % 2 ? -1 : 1) * (T + 0.004);
    g.add(leaf);
  });
  if (s >= 3) {
    const R = s === 3 ? 0.13 : 0.3;
    const fp = Array.from({ length: 60 }, (_, k) => { const a = (k / 60) * Math.PI * 2, r = s === 3 ? R * (1 + 0.2 * Math.sin(a * 2)) : R * (0.62 + 0.38 * Math.abs(Math.cos(a * 3))); return [Math.cos(a) * r, Hs + Math.sin(a) * r]; });
    const fl = props.cutout(fp, { seed: 190 + s, wonk: 0.4, draw: (h) => {
      h.hatch(fp, s === 3 ? GREEN : "red", { seed: 191, gap: 0.03, alpha: 0.9 });
      if (s === 4) { h.hatch(SH.circlePts(0.1, 18, 0, Hs), "yellow", { seed: 192, gap: 0.02 }); h.line(SH.circlePts(0.1, 18, 0, Hs), "ink", 0.018, { closed: true }); }
    } });
    fl.position.z = 2 * (T + 0.004);
    g.add(fl);
  }
  return g;
}
const sprout = props.swapper([0, 1, 2, 3, 4].map(sproutStage));
sprout.position.set(SPROUT.x, SPROUT.y, SPROUT.z);
scene.add(sprout);

// ---------------------------------------------------------------- helpers
function ik(S, Tg, L1, L2) {
  const dx = Tg[0] - S[0], dy = Tg[1] - S[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const phi = Math.atan2(dx, -dy);
  const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const be = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  return { a: phi - al, b: Math.PI - be };
}
const inWin = (tq, w) => tq >= w[0] && tq < w[1];

function renderAt(t) {
  const { i, tq } = PL.posed(t);

  // ---- light + camera (stepped) ----
  style.stepLights(i, 1 + 0.16 * PL.prog(tq, SUN.rise, SUN.riseDur, "inOutQuad"));

  // ---- sign cards: stand up on the tab, write on, tip back ----
  for (const c of cards) {
    const { l, s } = c;
    let u = 0;
    if (tq >= l.stand) u = tq < l.tip ? PL.standUp(tq, l.stand) : PL.tipBack(tq, l.tip);
    s.userData.setStand(u);
    s.rotation.z = 0; s.position.set(SB.x, SB.h, SB.z + 0.05);
    if (u > 0) {
      s.userData.write(l.text, PL.inked(tq, l.write), { cx: SIGN.textX, cy: SIGN.h / 2, cap: SIGN.cap, seed: c.seed });
      style.jiggle(s, i, c.seed, PL.jitterK(tq, [[l.stand, 0.4], [l.tip, 0.4]]));
    }
  }

  // ---- soil replacement ----
  let soilK = 0;
  if (tq >= DIG_STROKES[0]) soilK = 1;
  if (tq >= DIG_STROKES[1]) soilK = 2;
  if (tq >= MOUND_AT) soilK = 3;
  soil.userData.show(soilK);

  // ---- puppet: slide in (walking on hip pins), arms by IK, cheer ----
  const px = PL.move(tq, PUPPET.walk, PUPPET.walkDur, PUPPET.from, PUPPET.x, "linear");
  const w = PL.walk(tq, PUPPET.walk, PUPPET.walkDur);
  pup.position.set(px, w.bob, PUPPET.z);
  pup.rotation.set(0, 0, 0);
  style.jiggle(pup, i, 61, PL.jitterK(tq, [[PUPPET.walk, PUPPET.walkDur]]));
  const S = [px + PUPPET.shoulder[0], PUPPET.shoulder[1] + w.bob];
  const hk = PL.keyed(tq, HAND_R), hand = [hk[0] + px - PUPPET.x, hk[1] + w.bob];
  let { a, b } = ik(S, hand, PUPPET.L1, PUPPET.L2);
  let la = PL.keyed(tq, LEFT), lb = 0.1;
  if (tq >= CHEER.start) {
    const up = Math.floor(PL.poseIndex(tq - CHEER.start + 1e-6) / CHEER.every) % 2;
    a = up ? 2.75 : 2.35; b = up ? 0.15 : 0.4; la = -(up ? 2.75 : 2.35); lb = -(up ? 0.15 : 0.4);
  }
  pup.userData.setPose({ shoulderR: a, elbowR: b, shoulderL: la, elbowL: lb, hipL: w.l, hipR: w.r, neck: PL.keyed(tq, NECK) });
  Object.values(J).forEach((jn, k) => { jn.rotation.z += PL.jitter(i, 70 + k, 0.5).rot; });

  // tools: spade, seed in hand, watering can
  spade.visible = inWin(tq, TOOLS.spade);
  canPivot.visible = inWin(tq, TOOLS.can);
  const tilt = tq < POUR.end ? PL.prog(tq, POUR.tilt, POUR.tiltDur, "outQuad") : 1 - PL.prog(tq, POUR.end, POUR.tiltDur, "inQuad");
  canPivot.rotation.z = -(a + b) + POUR.can * tilt;
  seed.visible = inWin(tq, TOOLS.seed) || (tq >= SEED_DROP.release && tq < SEED_DROP.release + SEED_DROP.fall + 0.05);
  if (tq < SEED_DROP.release) seed.position.set(hand[0], hand[1] - 0.12, PUPPET.z + 0.3);
  else { const u = PL.prog(tq, SEED_DROP.release, SEED_DROP.fall); seed.position.set(SEED_DROP.hand[0] + 0.1 * u, lerp(SEED_DROP.hand[1] - 0.12, 0.3, u * u), SOIL.z - 0.12); }
  seed.rotation.set(0, 0, 0.4 * PL.prog(tq, SEED_DROP.release, SEED_DROP.fall));

  // drops from the spout (positions are a closed form of tq; the can is held still while pouring)
  const tip = canPivot.visible ? worldPoint(spoutTip) : new THREE.Vector3();
  const e0 = POUR.tilt + POUR.tiltDur;
  drops.forEach((d, m) => { d.visible = false; });
  if (tq >= e0 && tq < POUR.end + POUR.fall) {
    const k1 = Math.floor((tq - e0) * POUR.rate + 1e-6);
    for (let k = Math.max(0, k1 - 3); k <= k1; k++) {
      const ek = e0 + k / POUR.rate;
      if (ek >= POUR.end || tq < ek || tq >= ek + POUR.fall) continue;
      const u = (tq - ek) / POUR.fall, d = drops[k % drops.length];
      d.visible = true;
      d.position.set(tip.x + 0.06 * u, lerp(tip.y, SOIL.h - 0.05, u * u), SOIL.z - 0.1);
      d.rotation.set(0, 0, 0);
      style.jiggle(d, i, 160 + k, 1);
    }
  }

  // ---- sun slides up behind the hill; ray gear turns once per pose ----
  sunRig.position.set(SUN.x, PL.move(tq, SUN.rise, SUN.riseDur, SUN.yLow, SUN.yHigh, "outQuad"), SUN.z);
  sunRig.rotation.set(0, 0, 0);
  style.jiggle(sunRig, i, 105, PL.jitterK(tq, [[SUN.rise, SUN.riseDur]]));
  rays.userData.setAngle(tq >= SUN.rise ? -PL.poseIndex(tq - SUN.rise) * SUN.spin : 0);

  // ---- sprout replacement ----
  sprout.userData.show(PL.swapIndex(tq, SPROUT.start, SPROUT.stages, SPROUT.hold));
  sprout.rotation.set(0, 0, 0); sprout.position.set(SPROUT.x, SPROUT.y, SPROUT.z);
  style.jiggle(sprout, i, 165, 0.6);

  style.stepCamera(rig, tq, i);
  stage.render(tq);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
