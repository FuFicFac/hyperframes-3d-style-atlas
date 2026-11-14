// scene.js — 10-exploded-view: "Inside a robot vacuum" as a premium exploded teardown.
// The robot is assembled from exploded-view props; everything in renderAt is a pure function of t.
import { createStage, THREE, clamp, lerp, ease, envelope } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { pinToScreen } from "./_atlas/kit/overlay.js";
import { createStyle } from "./_atlas/styles/exploded-view/style.js";
import {
  DURATION, BEATS, CAMERA, SCORE, DUCK, ROBOT, SCREWS, WHEEL_X, PARTS, PLAN, POSE, FLOOR_Y, FOCUS, CALLOUTS, UI, SPIN,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props: X } = style;
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- parts (assembly-local, base at y = 0)
const G = () => new THREE.Group();
const put = (parent, obj, [x = 0, y = 0, z = 0] = [], rot = null) => {
  obj.position.set(x, y, z);
  if (rot) obj.rotation.set(...rot);
  parent.add(obj);
  return obj;
};

function lidarTurret() {
  const g = G(), rotor = G();
  put(g, X.drum({ r: 0.6, h: 0.16, chamfer: 0.03, material: "plasticGraphite" }));
  put(g, X.ring({ r: 0.63, h: 0.05, wall: 0.06, material: "metal" }), [0, 0.11, 0]);
  put(g, rotor, [0, 0.16, 0]);
  put(rotor, X.drum({ r: 0.5, h: 0.38, chamfer: 0.035, material: "accent" }));
  put(rotor, X.ring({ r: 0.515, h: 0.11, wall: 0.03, chamfer: 0.008, material: "smoke", phiStart: -0.75, phiLength: 1.5 }), [0, 0.12, 0]);
  put(rotor, X.drum({ r: 0.4, h: 0.07, chamfer: 0.02, material: "metal" }), [0, 0.38, 0]);
  put(rotor, X.drum({ r: 0.12, h: 0.04, chamfer: 0.01, material: "plasticBlack" }), [0, 0.45, 0]);
  g.userData.spin = (a) => (rotor.rotation.y = a);
  return g;
}
function topCover() {
  const g = G();
  const holes = [{ x: 0, z: ROBOT.lidarZ, r: 0.64 }, ...SCREWS.map(([x, z]) => ({ x, z, r: 0.07 })), { x: 0, z: 0.95, r: 0.15 }, { x: -0.42, z: 0.95, r: 0.09 }, { x: 0.42, z: 0.95, r: 0.09 }];
  put(g, X.plate({ shape: "circle", r: ROBOT.r, h: 0.15, bevel: 0.055, holes, material: "plasticGraphite" }), [0, 0.25, 0]);
  put(g, X.ring({ r: ROBOT.r - 0.012, h: 0.25, wall: 0.05, material: "plasticGraphite" }));
  put(g, X.ring({ r: ROBOT.r + 0.005, h: 0.13, wall: 0.04, material: "smoke", phiStart: -0.85, phiLength: 1.7 }), [0, 0.08, 0]);
  put(g, X.drum({ r: 0.12, h: 0.06, chamfer: 0.02, material: "metal" }), [0, 0.37, 0.95]);
  for (const s of [-1, 1]) put(g, X.drum({ r: 0.07, h: 0.05, chamfer: 0.015, material: "plasticBlack" }), [s * 0.42, 0.37, 0.95]);
  return g;
}
function screwSet() {
  const g = G(), list = SCREWS.map(([x, z]) => put(g, X.screw({ r: 0.05, length: 0.34, head: 0.09 }), [x, 0, z]));
  g.userData.turn = (a) => list.forEach((s, i) => s.userData.turn(a + i * 0.7));
  return g;
}
function mainBoard() {
  const b = X.pcb({ w: 2.3, d: 1.45, h: 0.05, radius: 0.16, seed: "vacuum-brain", chips: 5, caps: 7, leds: 3, coils: 2, connectors: 3, mainAt: [-0.35, 0.05] });
  return b;
}
function batteryPack() {
  const g = G();
  put(g, X.roundedBox({ w: 1.75, h: 0.12, d: 0.62, radius: 0.04, material: "plasticBlack" }));
  for (let i = 0; i < 4; i++) {
    const z = -0.21 + i * 0.14;
    put(g, X.drum({ r: 0.067, h: 1.42, chamfer: 0.02, material: "plasticWhite", segments: 28 }), [-0.71, 0.19, z], [0, 0, -Math.PI / 2]);
    for (const s of [-1, 1]) put(g, X.drum({ r: 0.045, h: 0.03, chamfer: 0.008, material: "metal", segments: 20 }), [s > 0 ? 0.73 : -0.76, 0.19, z], [0, 0, -Math.PI / 2]);
  }
  for (const s of [-1, 1]) put(g, X.roundedBox({ w: 0.035, h: 0.18, d: 0.52, radius: 0.01, material: "metal" }), [s * 0.79, 0.1, 0]);
  put(g, X.roundedBox({ w: 0.5, h: 0.04, d: 0.6, radius: 0.015, material: "plasticBlack" }), [0, 0.27, 0]);
  put(g, X.roundedBox({ w: 0.24, h: 0.1, d: 0.14, radius: 0.015, material: "plasticWhite" }), [0.5, 0.27, 0.12]);
  return g;
}
function dustBin() {
  const g = G();
  put(g, X.roundedBox({ w: 1.35, h: 0.42, d: 0.72, radius: 0.09, material: "smoke" }));
  for (let i = 0; i < 9; i++) put(g, X.roundedBox({ w: 0.035, h: 0.3, d: 0.46, radius: 0.012, material: "plasticWhite" }), [-0.36 + i * 0.09, 0.05, -0.02]);
  put(g, X.roundedBox({ w: 0.5, h: 0.06, d: 0.12, radius: 0.025, material: "plasticGrey" }), [0, 0.42, 0.24]);
  return g;
}
function chassis() {
  const g = G();
  const holes = [
    { x: -WHEEL_X, z: 0, w: 0.32, d: 0.86 }, { x: WHEEL_X, z: 0, w: 0.32, d: 0.86 },
    { x: 0, z: 0.34, w: 1.75, d: 0.5 }, { x: 1.0, z: 1.02, r: 0.08 }, { x: 0, z: 1.3, r: 0.13 },
  ];
  put(g, X.plate({ shape: "circle", r: ROBOT.r, h: 0.1, bevel: 0.03, holes, material: "plasticGrey" }));
  put(g, X.ring({ r: ROBOT.r - 0.07, h: ROBOT.wallH, wall: 0.05, material: "plasticGrey" }), [0, 0.06, 0]);
  put(g, X.ring({ r: ROBOT.r + 0.04, h: 0.32, wall: 0.1, chamfer: 0.03, material: "rubber", phiStart: -Math.PI / 2 - 0.15, phiLength: Math.PI + 0.3 }), [0, 0.1, 0]);
  for (const s of [-1, 1]) put(g, X.roundedBox({ w: 0.42, h: 0.4, d: 1.0, radius: 0.05, material: "plasticBlack" }), [s * WHEEL_X, 0.08, 0]);
  // suction motor: fan in a housing + coil stator
  const fanAt = [1.02, 0.1, -0.86];
  put(g, X.ring({ r: 0.32, h: 0.24, wall: 0.04, material: "plasticBlack" }), fanAt);
  const fan = put(g, X.fan({ blades: 9, r: 0.28, hub: 0.1, h: 0.1, material: "metal", hubMaterial: "darkMetal" }), [fanAt[0], fanAt[1] + 0.02, fanAt[2]]);
  put(g, X.coil({ r: 0.1, turns: 7, wire: 0.02, length: 0.2 }), [fanAt[0] - 0.42, 0.1, fanAt[2] + 0.22]);
  put(g, X.wheel({ r: 0.11, w: 0.08, hub: 0.05, spokes: 3, tread: 2 }), [0, 0.0, 1.3]);
  g.userData.fan = fan;
  return g;
}
function driveWheel(s) {
  // one wheel module (s = -1 left, +1 right): tyre + spoked rim, gearbox housing, brass reduction gear, motor can
  const m = G();
  const w = put(m, X.wheel({ r: 0.38, w: 0.24, hub: 0.18, spokes: 5, tread: 8 }));
  put(m, X.roundedBox({ w: 0.12, h: 0.42, d: 0.7, radius: 0.04, material: "plasticBlack" }), [-s * 0.22, -0.2, 0]);
  put(m, X.gear({ teeth: 20, r: 0.2, tooth: 0.04, h: 0.05, bore: 0.04, windows: 4, material: "brass" }), [-s * 0.3, 0.02, 0.05], [0, 0, (s * Math.PI) / 2]);
  put(m, X.drum({ r: 0.085, h: 0.34, chamfer: 0.02, material: "metal", segments: 28 }), [-s * 0.32, -0.08, -0.22], [0, 0, (s * Math.PI) / 2]);
  m.userData.roll = (a) => w.userData.roll(a);
  return m;
}
function rollerBrush() {
  const g = G();
  const r = put(g, X.roller({ r: 0.22, length: 1.62, flights: 2, turns: 1.3, core: "plasticBlack", vanes: "plasticGrey", caps: "plasticGrey" }), [0, 0.0, 0]);
  g.userData.roll = (a) => r.userData.roll(a);
  return g;
}
function sideBrush() {
  const g = G(), rot = G();
  put(g, rot);
  put(rot, X.drum({ r: 0.13, h: 0.09, chamfer: 0.025, material: "plasticBlack" }));
  put(rot, X.drum({ r: 0.06, h: 0.03, chamfer: 0.01, material: "metal" }), [0, 0.09, 0]);
  for (let i = 0; i < 3; i++) {
    const arm = put(rot, G(), [0, 0.03, 0], [0, (i / 3) * Math.PI * 2, 0]);
    put(arm, X.roundedBox({ w: 0.06, h: 0.035, d: 0.4, radius: 0.015, material: "plasticBlack" }), [0, 0, 0.3]);
    const tuft = put(arm, X.lathe([[0, 0], [0.05, 0], [0.075, 0.42], [0, 0.44]], { material: "plasticWhite", segments: 16 }), [0, 0.0, 0.48], [Math.PI / 2 - 0.14, 0, 0]);
    tuft.castShadow = true;
  }
  g.userData.spin = (a) => (rot.rotation.y = a);
  return g;
}

const build = { lidar: lidarTurret, screws: screwSet, cover: topCover, board: mainBoard, battery: batteryPack, bin: dustBin, chassis, wheelL: () => driveWheel(-1), wheelR: () => driveWheel(1), roller: rollerBrush, sideBrush };
const objects = Object.fromEntries(PARTS.map((p) => [p.id, build[p.id]()]));
const robot = X.assembly(PARTS.map((p) => ({ ...p, object: objects[p.id] })), { plan: PLAN, floorY: FLOOR_Y });
stage.scene.add(robot, robot.userData.shadows);
const A = robot.userData;

// ---------------------------------------------------------------- pose (pivot quaternion: tilt the axis, yaw about it)
const Y = new THREE.Vector3(0, 1, 0);
const poseQ = ({ axis, yaw }) => {
  const q = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...axis).normalize());
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw));
};
const PQ = POSE.keys.map((k) => ({ t: k.t, q: poseQ(k) })), Q = new THREE.Quaternion();
const poseAt = (t) => {
  if (t <= PQ[0].t) return Q.copy(PQ[0].q);
  for (let i = 1; i < PQ.length; i++) if (t < PQ[i].t) return Q.copy(PQ[i - 1].q).slerp(PQ[i].q, ease.inOutCubic((t - PQ[i - 1].t) / (PQ[i].t - PQ[i - 1].t)));
  return Q.copy(PQ[PQ.length - 1].q);
};

// ---------------------------------------------------------------- overlay UI
const title = X.titleBlock(UI.title, { kicker: UI.kicker });
const legend = X.legend(PARTS.filter((p, i) => PARTS.findIndex((q) => q.n === p.n) === i).map((p) => ({ n: p.n, name: p.name })), { width: UI.legendW });
const callouts = CALLOUTS.map((c) => ({ ...c, h: X.callout({ n: c.n, title: c.title, sub: c.sub, side: c.side, anchors: c.anchors.length, height: UI.calloutH }) }));

// ---------------------------------------------------------------- closed-form spins
/** integral of a trapezoid boost (0 before a, ramps to 1 over r, holds, ramps back to 0 ending at b), pure f(t). */
const boostInt = (t, a, b, r) => {
  const seg = (x0, x1, f) => { const lo = clamp(t, x0, x1); return f(lo - x0); };
  const up = seg(a, a + r, (d) => (d * d) / (2 * r));
  const hold = seg(a + r, b - r, (d) => d);
  const down = seg(b - r, b, (d) => d - (d * d) / (2 * r));
  return up + hold + down;
};
const beatInt = (t, id, r = 0.5) => boostInt(t, B[id].t, B[id].t + B[id].dur, r);

function renderAt(t) {
  // pose: upright & yawed -> hero tilt
  A.setPose(poseAt(t));
  A.update(t);

  // part life
  objects.lidar.userData.spin(SPIN.lidarRate * t + (SPIN.lidarFast - SPIN.lidarRate) * beatInt(t, "lidar", 0.6));
  objects.chassis.userData.fan.userData.spin(SPIN.rollerRate * 1.6 * beatInt(t, "work", 0.4));
  for (const id of ["wheelL", "wheelR"]) objects[id].userData.roll(-SPIN.wheelRate * beatInt(t, "work", 0.5));
  objects.roller.userData.roll(-SPIN.rollerRate * beatInt(t, "work", 0.4));
  objects.sideBrush.userData.spin(SPIN.sideRate * beatInt(t, "work", 0.4));

  // focus: one beat at a time; others fade toward the backdrop
  let weights = {}, legendW = {}, k = 0;
  for (const f of FOCUS) {
    const b = B[f.beat], e = envelope(t, b.t + 0.05, b.t + b.dur - 0.2, 0.45, 0.35);
    if (e > k) { k = e; weights = Object.fromEntries(f.parts.map((id) => [id, 1])); legendW = Object.fromEntries(f.legend.map((n) => [n, 1])); }
  }
  A.setFocus(weights, k);
  const brain = envelope(t, B.brain.t + 0.3, B.brain.t + B.brain.dur - 0.2, 0.2, 0.3);
  objects.board.userData.setLeds(1 + brain * (1.5 + 1.5 * Math.max(0, Math.sin(t * 17))));

  // camera, then silhouettes / axis lines / floor blobs from the final camera
  rig.update(t);
  A.sync(stage.camera);

  // overlay
  title.userData.set(clamp((t - UI.titleAt) / 0.8));
  pinToScreen(stage, title, { x: UI.titleXY[0], y: UI.titleXY[1], height: UI.titleH });
  legend.userData.set(clamp((t - UI.legendAt) / 1.3));
  legend.userData.setActive(Object.fromEntries(Object.entries(legendW).map(([n, w]) => [n, w * k])));
  pinToScreen(stage, legend, { x: UI.legendXY[0], y: UI.legendXY[1], height: UI.legendH });
  for (const c of callouts) {
    c.h.set(clamp((t - c.in) / UI.revealDur), clamp((t - c.out) / UI.hideDur));
    c.h.setActive(1);
    const anchors = c.anchors.map(([id, p]) => A.worldOf(id, p === "chip" ? objects.board.userData.chip : p));
    c.h.place({ anchors, label: c.label });
  }
  stage.render(t);
}

const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
