// scene.js — 05-tiny-diorama: "Where does your prompt go?" on one floating diorama tile.
// Everything below renderAt is a pure function of t; every path is precomputed at load.
import { createStage, Timeline, THREE, clamp, lerp, ease, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec, animateObjects } from "./_atlas/kit/spec.js";
import { growAll, pop } from "./_atlas/kit/motion.js";
import { pathLength, pointAt } from "./_atlas/kit/pathmath.js";
import { createStyle } from "./_atlas/styles/tiny-diorama/style.js";
import {
  DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, TILE, HOUSE, DC, DESK, ROAD, POLES, POLE_H, CABLE, CARS, PEGS, SCATTER,
  PACKET, TYPING, SCREEN_ON, POWER, TOKENS, GLOW_DONE, PINS, CAPTIONS, UI, FOCUS, VIEW,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props, helpers } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const tile = objs.tile;
stage.scene.add(tile.userData.dropShadow);

// ---------- precompute: cable, packet path, token paths ----------
const poleTop = (i) => [POLES[i][0], POLE_H - 0.12, POLES[i][1]];
const cable = props.cable([CABLE.houseAnchor, poleTop(0), poleTop(1), CABLE.dcAnchor], { sag: CABLE.sag });
tile.add(cable);

const deskLocal = (v) => { // desk-local offset -> tile-local point
  const c = Math.cos(DESK.rot), s = Math.sin(DESK.rot);
  return [DESK.pos[0] + v[0] * c + v[2] * s, v[1], DESK.pos[2] - v[0] * s + v[2] * c];
};
const laptop = deskLocal([0, 0.62 * DESK.scale, -0.08 * DESK.scale]);
const aboveLaptop = [laptop[0], laptop[1] + 0.55, laptop[2]];
const dcInside = [CABLE.dcAnchor[0] + 0.5, CABLE.dcAnchor[1], CABLE.dcAnchor[2]];
const outPath = [laptop, aboveLaptop, ...cable.userData.pts, dcInside];
const outLen = pathLength(outPath);

// tokens: a row above the data centre, laid along the screen-horizontal diagonal (1,0,-1)/√2
const rowDir = VIEW.right; // screen-horizontal on the tile
const rowPos = (k) => {
  const o = ((k + 0.5) / TOKENS.n - 0.5) * TOKENS.row.spread;
  const f = TOKENS.row.forward; // nudge toward the camera so the row floats over the roof, not behind it
  return [DC.pos[0] + rowDir[0] * o + VIEW.toward[0] * f, TOKENS.row.y, DC.pos[2] + rowDir[2] * o + VIEW.toward[2] * f];
};
const backCable = [...cable.userData.pts].reverse();
const tokens = Array.from({ length: TOKENS.n }, (_, k) => {
  const m = props.token({ color: TOKENS.colors[k], size: TOKENS.size });
  const start = rowPos(k);
  const path = [start, [CABLE.dcAnchor[0] + 0.25, CABLE.dcAnchor[1] + 0.35, CABLE.dcAnchor[2]], ...backCable, aboveLaptop, laptop];
  m.userData = { ...m.userData, k, start, path, L: pathLength(path), popAt: TOKENS.first + k * TOKENS.step, leave: TOKENS.leave + k * TOKENS.leaveStep };
  tile.add(m);
  return m;
});

// ---------- set dressing: scatter, cars, pegs ----------
const avoid = [
  { x: HOUSE.pos[0], z: HOUSE.pos[2], r: 1.9 }, { x: DC.pos[0], z: DC.pos[2], r: 2.6 }, { x: DC.pos[0] + 1.2, z: DC.pos[2] + 1.2, r: 1.4 },
  { x: DESK.pos[0], z: DESK.pos[2], r: 1.15 },
  ...POLES.map(([x, z]) => ({ x, z, r: 0.7 })),
  ...PEGS.map((p) => ({ x: p.pos[0], z: p.pos[2], r: 0.6 })),
  ...objs.road.userData.path.filter((_, i) => i % 3 === 0).map((p) => ({ x: p[0], z: p[2], r: 0.95 })),
  ...cable.userData.pts.filter((_, i) => i % 4 === 0).map((p) => ({ x: p[0], z: p[2], r: 0.7 })),
  { x: CARS[1].park[0], z: CARS[1].park[2], r: 0.9 },
  { x: DC.pos[0] - 0.6, z: DC.pos[2] - 2.3, r: 1.7 }, // clear sky behind the token row
  // back-left quarter: bushes only (tall trees there rise into the caption when the camera pushes to the house)
  { x: -5.2, z: -2.6, r: 2.3, trees: true }, { x: -3.0, z: -3.0, r: 2.0, trees: true }, { x: -4.8, z: -0.2, r: 1.4, trees: true }, // tall trees behind the roof reach the caption
  // back strip stays low (bushes only): tall trees on the far edge would reach up into the caption
  ...Array.from({ length: 15 }, (_, i) => ({ x: -7 + i, z: -TILE.depth / 2, r: 1.15, trees: true })),
  // sightline corridor: nothing tall between the camera (+x,+z) and the house / desk / cable
  ...[...cable.userData.pts.filter((_, i) => i % 4 === 0), [HOUSE.pos[0], 0, HOUSE.pos[2]], [DESK.pos[0], 0, DESK.pos[2]], [DC.pos[0], 0, DC.pos[2] + 1], CARS[1].park]
    .flatMap((p) => [1.3].map((d) => ({ x: p[0] + VIEW.toward[0] * d, z: p[2] + VIEW.toward[2] * d, r: 0.9 }))),
];
const SC = SCATTER;
const trees = props.scatter({ size: [TILE.size, TILE.depth], ...SC.trees, avoid, make: (r) => props.tree({ seed: r.int(1, 1e6) }) });
const bushes = props.scatter({ size: [TILE.size, TILE.depth], ...SC.bushes, avoid: [...avoid.filter((a) => !a.trees), ...trees.children.map((c) => ({ x: c.position.x, z: c.position.z, r: 0.7 }))], make: (r) => props.bush({ seed: r.int(1, 1e6), size: r.range(0.22, 0.34) }) });
tile.add(trees, bushes);

const movingCar = props.car({ seed: CARS[0].seed, color: CARS[0].color });
const parkedCar = props.car({ seed: CARS[1].seed, color: CARS[1].color });
parkedCar.position.set(...CARS[1].park);
parkedCar.rotation.y = CARS[1].yaw;
tile.add(movingCar, parkedCar);

const user = props.peg({ color: DESK.user.color, seed: 9, height: DESK.user.height });
user.position.set(...deskLocal(DESK.user.local));
user.rotation.y = DESK.rot + 0.5;
tile.add(user);
const pegs = PEGS.map((p) => {
  const g = props.peg({ color: p.color, seed: p.seed });
  g.position.set(...p.pos);
  g.rotation.y = p.seed * 1.3;
  tile.add(g);
  return g;
});

// ---------- overlay UI ----------
const kicker = props.kicker(UI.kicker);
const captions = CAPTIONS.map((c) => ({ ...c, obj: props.caption(c.text, { number: c.n }) }));
const pins = PINS.map((p) => ({ ...p, obj: props.pinMarker({ number: p.n, tag: p.tag, side: p.side }) }));

// ---------- per-frame helpers ----------
const V = new THREE.Vector3();
const toWorld = (p) => tile.localToWorld(V.set(p[0], p[1], p[2])).toArray();
const along = (path, s) => pointAt(path, s).p;
const dropPiece = (obj, base, d, t) => {
  const r = helpers.dropIn(t, d.at, d.dur, d.from);
  obj.visible = r.started;
  obj.position.set(base[0], base[1] + r.y, base[2]);
  obj.scale.set(1 + r.squash * 0.4, Math.max(1e-3, 1 - r.squash), 1 + r.squash * 0.4);
};
const decayPulse = (t, times, k = 6) => {
  let v = 0;
  for (const s of times) if (t >= s) v = Math.max(v, Math.exp(-(t - s) * k));
  return v;
};
// the packet starts at the laptop: path segment 0 is laptop -> aboveLaptop; skip it so launch begins above the laptop
const outStart = Math.hypot(aboveLaptop[1] - laptop[1]);
const packetAt = (t) => {
  const u = ease.inOutSine(clamp((t - PACKET.launch) / (PACKET.arrive - PACKET.launch)));
  return along(outPath, lerp(outStart, outLen, u));
};
const focusAt = (t) => {
  if (t >= PACKET.launch && t <= PACKET.arrive) return packetAt(t); // follow the packet along the cable
  let a = FOCUS[0], b = FOCUS[FOCUS.length - 1];
  if (t >= b.t) return b.p;
  for (let i = 0; i < FOCUS.length - 1; i++) if (t >= FOCUS[i].t && t < FOCUS[i + 1].t) { a = FOCUS[i]; b = FOCUS[i + 1]; break; }
  const u = ease.inOutSine((t - a.t) / (b.t - a.t || 1));
  return a.p.map((v, i) => lerp(v, b.p[i], u));
};
const tokenArrivals = tokens.map((m) => m.userData.leave + TOKENS.travel);

function renderAt(t) {
  animateObjects(objs, tl, t);

  // tile: drop in with a bounce, then a very gentle bob
  tile.userData.update(t, { dropAt: TILE.dropAt, dropDur: TILE.dropDur, dropFrom: TILE.dropFrom });
  objs.road.visible = true;

  // buildings drop in; trees/bushes pop; desk, pegs, poles pop
  dropPiece(objs.house, HOUSE.pos, HOUSE.drop, t);
  dropPiece(objs.dc, DC.pos, DC.drop, t);
  growAll(trees, t, SC.popAt, { spread: SC.spread, dur: SC.dur });
  growAll(bushes, t, SC.popAt + 0.15, { spread: SC.spread, dur: SC.dur });
  const kd = pop(t, DESK.popAt, 0.45);
  objs.desk.scale.setScalar(Math.max(1e-4, kd * DESK.scale));
  objs.desk.visible = kd > 1e-3;
  const typing = t > TYPING[0] - 0.1 && t < TYPING[TYPING.length - 1] + 0.2 ? decayPulse(t, TYPING, 14) : 0;
  const ku = pop(t, DESK.popAt + 0.1, 0.45);
  user.scale.set(Math.max(1e-4, ku), Math.max(1e-4, ku * (1 - typing * 0.05)), Math.max(1e-4, ku));
  pegs.forEach((g, i) => {
    const k = pop(t, 1.25 + i * 0.12, 0.45);
    g.scale.setScalar(Math.max(1e-4, k));
    g.visible = k > 1e-3;
    g.userData.head.position.y = 0.54 + Math.max(0, Math.sin(t * 5 + i * 2)) * 0.025;
  });
  [objs.pole1, objs.pole2].forEach((p, i) => {
    const k = pop(t, 1.3 + i * 0.1, 0.45);
    p.scale.set(Math.max(1e-4, k), Math.max(1e-4, k), Math.max(1e-4, k));
    p.visible = k > 1e-3;
  });
  cable.userData.setReveal(clamp((t - CABLE.revealAt) / CABLE.revealDur));

  // cars: one loops the road (grows in/out at the road ends), one parked by the data centre
  {
    const road = objs.road.userData, L = road.length, sp = CARS[0].speed, t0 = 1.6;
    const s = t < t0 ? 0 : ((t - t0) * sp + CARS[0].offset) % L;
    const a = road.at(s);
    movingCar.position.set(a.p[0], 0.035, a.p[2]);
    movingCar.rotation.y = a.yaw;
    movingCar.userData.setRoll(s);
    const k = t < t0 ? 0 : Math.min(smoothstep(0, 0.45, s), smoothstep(L, L - 0.45, s));
    movingCar.scale.setScalar(Math.max(1e-4, k));
    movingCar.visible = k > 1e-3;
    const pk = pop(t, 1.45, 0.45);
    parkedCar.scale.setScalar(Math.max(1e-4, pk));
    parkedCar.visible = pk > 1e-3;
  }

  // 1: laptop screen wakes, flickers with each key; answer tokens brighten it later
  const arrived = tokenArrivals.filter((a) => t >= a).length;
  const screen = t < SCREEN_ON ? 0 : 0.55 * smoothstep(SCREEN_ON, SCREEN_ON + 0.25, t) + typing * 0.35 + decayPulse(t, tokenArrivals, 8) * 0.5 + (arrived / TOKENS.n) * 0.35;
  objs.desk.userData.setScreen(screen);

  // 2: packet charges above the laptop, rides the cable, dives into the data centre
  {
    const p = objs.packet;
    let sc = 0;
    if (t >= PACKET.chargeAt && t < PACKET.arrive + 0.25) {
      sc = pop(t, PACKET.chargeAt, 0.5, 2.2) * (1 + 0.12 * Math.sin((t - PACKET.chargeAt) * 18) * (t < PACKET.launch ? 1 : 0));
      if (t > PACKET.arrive) sc *= 1 - ease.inCubic(clamp((t - PACKET.arrive) / 0.25));
    }
    p.position.set(...(t < PACKET.launch ? aboveLaptop : packetAt(t)));
    p.scale.setScalar(Math.max(1e-4, sc));
    p.visible = sc > 1e-3;
  }

  // 3: data centre powers up — fans spin up, racks pulse word by word, tokens pop into a row
  const pw = smoothstep(POWER.at, POWER.at + 0.5, t);
  objs.dc.userData.setPower(pw);
  objs.dc.userData.setFan(helpers.spinAngle(t, POWER.at, POWER.fanRate, POWER.fanRamp) + 0.4);
  for (let i = 0; i < objs.dc.userData.racks; i++) {
    const times = tokens.filter((m) => m.userData.k % objs.dc.userData.racks === i).map((m) => m.userData.popAt - 0.08);
    const flash = decayPulse(t, [POWER.at + i * 0.08, ...times], 5);
    objs.dc.userData.setRack(i, pw * 0.3 + flash * 0.9);
  }
  objs.ringDC.userData.setPulse(clamp((t - POWER.at) / 0.9));

  // 4: tokens leave one by one and stream home along the cable into the laptop
  for (const m of tokens) {
    const d = m.userData;
    let sc = pop(t, d.popAt, 0.4, 2.4);
    if (t < d.leave) {
      m.position.set(d.start[0], d.start[1] + Math.sin(t * 3 + d.k) * 0.05, d.start[2]);
      m.rotation.set(0, 0.6 + Math.sin(t * 1.5 + d.k) * 0.2, 0);
    } else {
      const u = ease.inOutSine(clamp((t - d.leave) / TOKENS.travel));
      m.position.set(...along(d.path, u * d.L));
      m.rotation.set(u * 3, 0.6 + u * 5, 0);
      sc *= lerp(1, TOKENS.travelScale, smoothstep(0, 0.15, u)) * (1 - smoothstep(0.93, 1, u));
    }
    m.scale.setScalar(Math.max(1e-4, sc));
    m.visible = sc > 1e-3;
  }

  // 5: house windows glow, pulse ring at the house
  objs.house.userData.setGlow(smoothstep(GLOW_DONE - 0.1, GLOW_DONE + 0.5, t));
  objs.ringHouse.userData.setPulse(clamp((t - GLOW_DONE) / 1.0));

  // camera + tilt-shift focus on the look target
  const cam = rig.update(t);
  tile.updateMatrixWorld(true); // toWorld below must see this frame's drop/bob
  helpers.focusOn(toWorld(focusAt(t)));

  // overlay: kicker, one caption at a time, pin markers anchored to 3D points
  kicker.userData.set(smoothstep(UI.kickerAt, UI.kickerAt + 0.5, t));
  helpers.pin(kicker, { x: 0, y: UI.kickerY, height: UI.kickerH });
  for (const c of captions) {
    const o = c.obj;
    o.userData.set(clamp((t - c.in) / UI.revealDur), c.out == null ? 0 : clamp((t - c.out) / UI.hideDur));
    helpers.pin(o, { x: 0, y: UI.capY + (o.userData.lift ?? 0) * UI.capH * 2, height: UI.capH });
  }
  tile.updateMatrixWorld(true);
  for (const p of pins) {
    let a = p.anchor;
    if (a === "user") { const q = user.position; a = [q.x, q.y + DESK.user.height + 0.25, q.z]; }
    else if (a === "packet") { const q = t < PACKET.launch ? aboveLaptop : packetAt(t); a = [q[0], q[1] + 0.22, q[2]]; }
    else if (a === "stream") { const q = cable.userData.at(0.5); a = [q[0], q[1] + 0.08, q[2]]; } // tip on the cable: keeps the head clear of the caption
    p.obj.userData.set(clamp((t - p.in) / 0.55), clamp((t - p.out) / 0.3), t);
    helpers.pin(p.obj, { world: toWorld(a), height: UI.pinH });
  }

  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
