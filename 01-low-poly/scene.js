// scene.js — 01-low-poly: "How a neural network learns" as gradient descent on a low-poly island.
// Everything below renderAt is a pure function of t; all paths are precomputed at load.
import { createStage, Timeline, THREE, clamp, lerp, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec, animateObjects } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/low-poly/style.js";
import {
  DURATION, BEATS, CAMERA, FOLLOW, OBJECTS, SCORE, DUCK, DESCENT, BALL, HOPS, HOP, LABELS, LABEL_LAYOUT, SCATTER, TERRAIN_RISE, ISLANDS, PAYOFF,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props, helpers } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const ter = objs.terrain;
const groundY = (x, z) => ter.userData.heightAt(x, z);

// ---------- precompute: descent path, hops, flags, trail ----------
const R = BALL.r;
const restY = (x, z) => groundY(x, z) + R / Math.max(0.5, ter.userData.normalAt(x, z).y);
const path = helpers.descentPath(ter.userData.field, DESCENT).map(([x, z]) => new THREE.Vector3(x, restY(x, z), z));
const hops = HOPS.map((h, i) => {
  const a = path[i], b = path[i + 1];
  const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const L = d.length();
  const axis = new THREE.Vector3(d.z, 0, -d.x).normalize();
  return { ...h, a, b, L, dir: d.clone().normalize(), axis, arc: HOP.arcBase + HOP.arcPerM * L };
});
let cum = 0;
const qStart = new THREE.Quaternion();
for (const h of hops) {
  h.s0 = cum;
  cum += h.L;
  h.q0 = qStart.clone();
  qStart.premultiply(new THREE.Quaternion().setFromAxisAngle(h.axis, h.L / R));
}
const totalL = cum;
const end = (i) => hops[i].t + hops[i].dur;

// flags at every visited point except the last (the beacon marks the minimum)
const flags = path.slice(0, -1).map((p, i) => {
  const h = hops[i];
  const side = new THREE.Vector3(-h.dir.z, 0, h.dir.x); // left of travel
  const x = p.x + side.x * HOP.flagOffset, z = p.z + side.z * HOP.flagOffset;
  const f = props.flag({ seed: 100 + i, height: HOP.flagHeight * (i === 0 ? 1.25 : i >= 3 ? 0.8 : 1) });
  f.position.set(x, groundY(x, z) - 0.03, z);
  f.rotation.y = 0.35; // cloth faces the camera side
  f.userData.popAt = i === 0 ? hops[0].t : end(i - 1);
  stage.scene.add(f);
  return f;
});
const trail = props.trail(path.map((p) => [p.x, 0, p.z]), { spacing: 0.4, size: 0.12, groundFn: groundY });
stage.scene.add(trail);

// beacon just behind the final resting point
const last = path[path.length - 1];
const bx = last.x - 0.35, bz = last.z - 1.05;
objs.beacon.position.set(bx, groundY(bx, bz) - 0.05, bz);

// arrow: lies on the slope from the start point, pointing downhill (-gradient)
{
  const p = path[0], dir = hops[0].dir;
  const s = new THREE.Vector3(p.x + dir.x * (R + 0.3), 0, p.z + dir.z * (R + 0.3));
  const e = new THREE.Vector3(s.x + dir.x * 1.9, 0, s.z + dir.z * 1.9);
  s.y = groundY(s.x, s.z) + 0.14;
  e.y = groundY(e.x, e.z) + 0.14;
  const xA = e.clone().sub(s).normalize();
  const n = ter.userData.normalAt((s.x + e.x) / 2, (s.z + e.z) / 2);
  const yA = n.clone().sub(xA.clone().multiplyScalar(n.dot(xA))).normalize();
  const zA = new THREE.Vector3().crossVectors(xA, yA);
  objs.arrow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
  objs.arrow.position.copy(s);
}
// rings sit at the ball, tilted to the slope
for (const r of [objs.ringA, objs.ringB]) {
  const p = path[0];
  r.position.set(p.x, p.y - R * 0.55, p.z);
  r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ter.userData.normalAt(p.x, p.z));
}

// scatter trees + rocks, keeping the path and beacon clear
const along = path.flatMap((p, i) => (i ? [0.25, 0.5, 0.75].map((u) => p.clone().lerp(path[i - 1], u)) : []).concat([p]));
// keep sightlines clear: also avoid a band on the camera side of the path (+x, +z)
const avoidPts = (r) => [...along.map((p) => ({ x: p.x, z: p.z, r })), ...along.map((p) => ({ x: p.x + HOP.sightline[0], z: p.z + HOP.sightline[1], r: r * 1.1 })), ...flags.map((f) => ({ x: f.position.x, z: f.position.z, r: r * 0.7 })), { x: bx, z: bz, r: 1.4 }];
const S = SCATTER;
const forest = props.scatter(ter, { ...S.trees, avoid: avoidPts(S.trees.avoidR), make: (r) => props.tree({ seed: r.int(1, 1e6) }) });
const rocks = props.scatter(ter, { ...S.rocks, avoid: avoidPts(S.rocks.avoidR), make: (r) => props.rock({ seed: r.int(1, 1e6), size: r.range(0.25, 0.6) }) });
for (const g of [forest, rocks]) {
  for (const c of g.children) c.userData.y0 = c.position.y;
  stage.scene.add(g);
}

// distant islands (fogged silhouettes on the horizon)
for (const I of ISLANDS) {
  const r = props.rock({ seed: I.seed, size: I.size, squash: I.squash, color: I.color });
  r.position.set(...I.pos);
  r.castShadow = false;
  stage.scene.add(r);
}

// ending payoff: confetti burst from the gem + light pulses radiating over the valley
const burst = props.burst(PAYOFF.burst);
const gemY = objs.beacon.position.y + 2.8 * 1.1;
burst.position.set(bx, gemY, bz);
stage.scene.add(burst);
const pulses = PAYOFF.pulses.map(() => {
  const r = props.groundPulse(groundY, { color: style.palette.accent, lift: 0.1 });
  stage.scene.add(r);
  return r;
});
const pulseFront = (t) => PAYOFF.pulses.map((p0) => {
  const u = (t - p0) / PAYOFF.pulseDur;
  return u >= 0 && u <= 1 ? { R: 0.6 + PAYOFF.pulseR * ease.outCubic(u), u } : null;
});
const boostAt = (fronts, d) => fronts.reduce((a, f) => a + (f ? Math.exp(-(((f.R - d) / PAYOFF.pulseWidth) ** 2)) * (1 - f.u) : 0), 0);

// banners (screen-pinned)
const banners = LABELS.map((l, i) => {
  const b = tl.get(l.beat);
  const bn = props.banner(l.text, { number: l.n });
  bn.userData.tIn = b.t + l.in;
  bn.userData.tOut = l.out == null ? Infinity : b.t + b.dur + l.out;
  return bn;
});

// ---------- per-frame ----------
const ballPos = new THREE.Vector3();
function ballAt(t) {
  const q = new THREE.Quaternion();
  let squash = 0;
  if (t < hops[0].t) {
    const p = path[0];
    const u = clamp((t - BALL.dropAt) / BALL.dropDur);
    ballPos.set(p.x, p.y + BALL.dropFrom * (1 - ease.outBounce(u)), p.z);
    const c1 = BALL.dropAt + BALL.dropDur * 0.3636;
    if (t > c1) squash = HOP.squash * Math.exp(-(t - c1) * 9);
  } else {
    let i = hops.length - 1;
    for (let k = 0; k < hops.length; k++) if (t < end(k)) { i = k; break; }
    const h = hops[i];
    const u = clamp((t - h.t) / h.dur);
    const x = lerp(h.a.x, h.b.x, u), z = lerp(h.a.z, h.b.z, u);
    const base = Math.max(lerp(h.a.y, h.b.y, u), restY(x, z));
    ballPos.set(x, base + helpers.hopArc(u, h.arc), z);
    q.setFromAxisAngle(h.axis, (h.L / R) * u).multiply(h.q0);
    // squash after landing (most recent landing <= t)
    for (let k = hops.length - 1; k >= 0; k--) if (t >= end(k)) { squash = HOP.squash * Math.exp(-(t - end(k)) * 10); break; }
    if (t < h.t + h.dur && t >= h.t) squash = 0;
  }
  return { q, squash };
}
function traveled(t) {
  for (const h of hops) if (t < h.t + h.dur) return h.s0 + h.L * clamp((t - h.t) / h.dur);
  return totalL;
}
function followW(t) {
  let a = FOLLOW[0], b = FOLLOW[FOLLOW.length - 1];
  if (t >= b.t) return b.w;
  for (let i = 0; i < FOLLOW.length - 1; i++) if (t >= FOLLOW[i].t && t < FOLLOW[i + 1].t) { a = FOLLOW[i]; b = FOLLOW[i + 1]; break; }
  return lerp(a.w, b.w, ease.inOutSine((t - a.t) / (b.t - a.t || 1)));
}

const lookTarget = new THREE.Vector3();
function renderAt(t) {
  animateObjects(objs, tl, t);

  // island rises out of the sea; scatter rides with it, then pops in
  const rise = lerp(TERRAIN_RISE.from, 1, ease.outBack(clamp((t - TERRAIN_RISE.at) / TERRAIN_RISE.dur), 1.2));
  ter.scale.y = rise;
  helpers.growAll(forest, t, S.growAt, { spread: S.spread, dur: S.dur });
  helpers.growAll(rocks, t, S.growAt - 0.2, { spread: S.spread, dur: S.dur });
  for (const g of [forest, rocks]) for (const c of g.children) c.position.y = c.userData.y0 * rise;

  objs.sea.userData.update(t);
  for (const k of ["cloud1", "cloud2", "cloud3", "cloud4"]) objs[k].userData.update(t);

  // ball
  const ball = objs.ball;
  const { q, squash } = ballAt(t);
  const vis = helpers.pop(t, BALL.dropAt - 0.12, 0.25);
  ball.visible = vis > 1e-3;
  ball.position.copy(ballPos);
  ball.quaternion.copy(q);
  ball.scale.set(vis * (1 + squash * 0.6), vis * (1 - squash), vis * (1 + squash * 0.6));
  ball.position.y -= R * squash * 0.9;

  // measure: two ring pulses at the start point
  [objs.ringA, objs.ringB].forEach((r, i) => {
    const u = clamp((t - tl.at("measure", 0.2 + i * 0.3)) / 0.95);
    r.visible = u > 0 && u < 1;
    r.scale.setScalar(lerp(0.6, 2.3, ease.outCubic(u)));
    r.material.opacity = (1 - u) * 0.95;
  });

  // flags + trail + beacon
  const fronts = pulseFront(t);
  for (const f of flags) {
    const k = helpers.pop(t, f.userData.popAt, 0.45, 2.4);
    const b = boostAt(fronts, Math.hypot(f.position.x - bx, f.position.z - bz));
    f.scale.setScalar(Math.max(k * (1 + 0.3 * b), 1e-4));
    f.visible = k > 1e-3;
    f.userData.update(t, 1 + 2.5 * b);
  }
  trail.userData.update(traveled(t) / totalL);
  for (const bd of trail.children) {
    const b = boostAt(fronts, Math.hypot(bd.position.x - bx, bd.position.z - bz));
    if (b > 1e-3) bd.scale.multiplyScalar(1 + 0.9 * b);
  }
  pulses.forEach((r, i) => {
    const f = fronts[i];
    if (!f) return r.userData.update(bx, bz, 1, 0.1, 0);
    r.userData.update(bx, bz, f.R, 0.18 + 0.35 * f.u, 0.95 * (1 - f.u) ** 1.2);
  });
  burst.userData.update(t - PAYOFF.burstAt);
  objs.beacon.userData.update(t);

  // camera: keyed rig + follow blend toward the ball
  const s = rig.sample(t);
  lookTarget.copy(s.target).lerp(ballPos, followW(t));
  stage.camera.position.copy(s.pos);
  stage.camera.lookAt(lookTarget);

  // banners
  const LL = LABEL_LAYOUT;
  for (const bn of banners) {
    bn.userData.set(clamp((t - bn.userData.tIn) / LL.revealDur), clamp((t - bn.userData.tOut) / LL.hideDur));
    helpers.pinToScreen(bn, { x: LL.x, y: LL.y, height: LL.height });
  }

  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
