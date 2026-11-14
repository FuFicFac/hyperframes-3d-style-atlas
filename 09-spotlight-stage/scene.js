// scene.js — 09-spotlight-stage: "The Turing Test" on a toy-theatre stage. Data lives in scene.config.js;
// this file builds the demo's cut-out actors from the style's props and drives every curtain / flat / sign /
// spot from t with the style's pure cues. Pure function of time: no rAF, no accumulation.
import { createStage, clamp, lerp, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { hopArc } from "./_atlas/kit/motion.js";
import { createStyle } from "./_atlas/styles/spotlight-stage/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, SET, CUE, AIM_POINTS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props, shapes: S, motion: M } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const house = objs.theatre.userData;
const scene = stage.scene;

// ---------------------------------------------------------------------------------------------
// Cut-out actors (built standing in their XY plane, feet on y = 0, facing +Z)
// ---------------------------------------------------------------------------------------------
function judge() {
  const curls = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) curls.push({ shape: S.circle(0.12, { x: sx * 0.27, y: 1.5 + k * 0.13 }), color: "cream", hatch: { from: sx > 0 ? 0.4 : 0.9 }, layer: 1 });
  return props.cutout({
    parts: [
      { shape: S.poly([[-0.66, 0], [0.66, 0], [0.64, 1.22], [0.44, 1.46], [-0.44, 1.46], [-0.64, 1.22]]), color: "#3a2b3d", hatch: { from: 0.55, color: "#120b14", alpha: 0.5 }, layer: 0 },
      ...curls,
      { shape: S.rect(0.2, 0.26, { y: 1.22 }), color: "cream", layer: 2 },
      { shape: S.ellipse(0.24, 0.29, { y: 1.74 }), color: "skin", hatch: { from: 0.7, alpha: 0.2 }, layer: 3 },
      { shape: S.ellipse(0.31, 0.15, { y: 2.0 }), color: "cream", hatch: { from: 0.6 }, layer: 4 },
      { shape: S.circle(0.04, { x: -0.09, y: 1.76 }), color: "ink", ink: false, layer: 5 },
      { shape: S.circle(0.04, { x: 0.09, y: 1.76 }), color: "ink", ink: false, layer: 5 },
      { shape: S.rect(0.11, 0.025, { x: -0.09, y: 1.84 }), color: "ink", ink: false, layer: 5 },
      { shape: S.rect(0.11, 0.025, { x: 0.09, y: 1.84 }), color: "ink", ink: false, layer: 5 },
      { shape: S.rect(0.14, 0.03, { y: 1.6 }), color: "rouge", ink: false, layer: 5 },
      { shape: S.ellipse(0.13, 0.08, { x: -0.36, y: 1.12 }), color: "skin", layer: 6 },
      { shape: S.ellipse(0.13, 0.08, { x: 0.36, y: 1.12 }), color: "skin", layer: 6 },
    ],
  });
}

function desk() {
  const w = 2.4, h = 1.08;
  return props.sceneryFlat({
    shape: S.poly([[-w / 2, 0], [w / 2, 0], [w / 2 + 0.08, h], [-w / 2 - 0.08, h]]), color: "#6e3a20", hatch: { from: 0.7 }, mount: "track",
    draw: (hh) => {
      hh.rect(-w / 2 - 0.1, h - 0.12, w + 0.2, 0.12, "#4a2412");
      for (const sx of [-1, 1]) hh.roundRect(sx * 0.82 - 0.26, 0.14, 0.52, 0.66, 0.04, "#5a2d17");
      hh.roundRect(-0.6, 0.36, 1.2, 0.4, 0.06, "gold");
      hh.stroke("ink", 0.015, (c) => c.roundRect(hh.X(-0.56), hh.Y(0.72), 1.12 * hh.s, 0.32 * hh.s, 0.05 * hh.s));
      hh.text("JUDGE", 0, 0.555, 0.25, { color: "ink" });
    },
  });
}

function human() {
  return props.cutout({
    stick: { dir: -1, length: 7 },
    parts: [
      { shape: S.poly([[-0.55, 0], [0.55, 0], [0.3, 1.3], [-0.3, 1.3]]), color: "teal", hatch: { from: 0.6 } },
      { shape: S.ellipse(0.25, 0.3, { y: 1.62 }), color: "#5a3420" },
      { shape: S.ellipse(0.2, 0.25, { y: 1.58 }), color: "skin" },
      { shape: S.rect(0.4, 0.06, { y: 1.27 }), color: "cream", ink: false },
    ],
  });
}

function robot() {
  return props.cutout({
    stick: { dir: 1, length: 7 },
    parts: [
      { shape: S.rect(0.2, 0.6, { x: -0.25 }), color: "slate", layer: 0 },
      { shape: S.rect(0.2, 0.6, { x: 0.25 }), color: "slate", layer: 0 },
      { shape: S.poly([[-0.5, 0.65], [-0.82, 0.95], [-0.72, 1.05], [-0.45, 0.85]]), color: "slateLight", layer: 0 },
      { shape: S.poly([[0.5, 0.65], [0.82, 1.25], [0.72, 1.3], [0.45, 0.85]]), color: "slateLight", layer: 0 },
      { shape: S.roundRect(1.05, 0.95, 0.08, { y: 0.55 }), color: "slate", hatch: { from: 0.62 }, layer: 1,
        draw: (h) => { h.circle(-0.22, 0.98, 0.11, "mustard"); h.circle(0.05, 0.98, 0.07, "rouge"); h.rect(-0.35, 0.7, 0.7, 0.06, "slateLight"); h.rect(-0.35, 0.8, 0.7, 0.03, "slateLight"); } },
      { shape: S.rect(0.24, 0.1, { y: 1.5 }), color: "slateLight", layer: 1 },
      { shape: S.roundRect(0.8, 0.56, 0.08, { y: 1.58 }), color: "slateLight", hatch: { from: 0.66 }, layer: 2,
        draw: (h) => { h.rect(-0.22, 1.66, 0.44, 0.1, "ink"); for (let i = 0; i < 4; i++) h.rect(-0.18 + i * 0.12, 1.66, 0.03, 0.1, "slateLight"); } },
      { shape: S.circle(0.11, { x: -0.18, y: 1.94 }), color: "cream", layer: 3 },
      { shape: S.circle(0.11, { x: 0.18, y: 1.94 }), color: "cream", layer: 3 },
      { shape: S.circle(0.05, { x: -0.16, y: 1.94 }), color: "ink", ink: false, layer: 4 },
      { shape: S.circle(0.05, { x: 0.2, y: 1.94 }), color: "ink", ink: false, layer: 4 },
      { shape: S.rect(0.04, 0.18, { y: 2.14 }), color: "ink", ink: false, layer: 1 },
      { shape: S.circle(0.07, { y: 2.35 }), color: "rouge", layer: 1 },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// Build the set
// ---------------------------------------------------------------------------------------------
const judgeG = judge(); judgeG.position.set(SET.judge.x, 0, SET.judge.z); scene.add(judgeG);
const deskG = desk(); deskG.position.set(SET.desk.x, 0, SET.desk.z); scene.add(deskG);
const humanG = human(); humanG.position.set(SET.human.x, 0, SET.human.z); scene.add(humanG);
const robotG = robot(); robotG.position.set(SET.robot.x, 0, SET.robot.z); scene.add(robotG);
const screenA = props.foldingScreen({ panelW: 0.76, h: 2.5, color: "mustard", trim: "rouge", label: "A" });
const screenB = props.foldingScreen({ panelW: 0.76, h: 2.5, color: "tealLight", trim: "teal", label: "B" });
screenA.position.z = SET.screenA.z; screenB.position.z = SET.screenB.z;
scene.add(screenA, screenB);
const bubbleA = props.bubble({ text: SET.bubbleA.text, w: 2.3, h: 0.78, tail: 0.3 });
const bubbleB = props.bubble({ text: SET.bubbleB.text, w: 2.0, h: 0.78, tail: -0.3 });
bubbleA.position.set(SET.bubbleA.x, SET.bubbleA.y, SET.bubbleA.z);
bubbleB.position.set(SET.bubbleB.x, SET.bubbleB.y, SET.bubbleB.z);
scene.add(bubbleA, bubbleB);

const mkSign = (s) => { const g = props.hangingSign({ text: s.text, sub: s.sub ?? "", w: s.w, h: s.h, wireTop: SET.wireTop }); g.position.z = SET.signZ; scene.add(g); return g; };
const titleSign = mkSign(SET.title), whichSign = mkSign(SET.which), captionSign = mkSign(SET.caption);

const special = props.followSpot({ from: SET.special.from, to: SET.special.to, angle: SET.special.angle, intensity: SET.special.intensity });
const follow = props.followSpot({ from: SET.follow.from, to: AIM_POINTS.A, angle: SET.follow.angle, intensity: SET.follow.intensity });
scene.add(special, follow);
const aimKeys = CUE.aims.map((a) => ({ t: a.t, p: AIM_POINTS[a.p] }));
const wash = style.lights.wash, washBase = wash.intensity;

// ---------------------------------------------------------------------------------------------
function renderAt(t) {
  // house
  const open = M.curtain(t, CUE.curtainOpen, CUE.curtainClose);
  house.curtain.userData.setOpen(open);
  house.footlights.userData.setLevel(lerp(0.55, 1, clamp((t - CUE.curtainOpen) / 1.2)));
  wash.intensity = washBase * lerp(0.35, 1, clamp((t - CUE.curtainOpen) / 1.6)) * lerp(1, 0.6, clamp((t - CUE.followOn) / 0.6)) * lerp(1, 1.4, clamp((t - CUE.captionDrop) / 1));

  // signs
  const sign = (g, s, start, out) => { const d = M.drop(t, start, { from: 7.4, to: s.hang, out }); g.userData.setDrop(d.y, d.swing); g.visible = g.visible && d.visible; };
  sign(titleSign, SET.title, CUE.titleDrop, CUE.titleOut);
  sign(whichSign, SET.which, CUE.whichDrop, CUE.whichOut);
  sign(captionSign, SET.caption, CUE.captionDrop, null);

  // screens slide in on their tracks; B slides away for the reveal
  const a = M.slide(t, CUE.slideA, SET.screenA.from, SET.screenA.x);
  screenA.position.x = a.x; screenA.rotation.z = a.rot;
  const bIn = M.slide(t, CUE.slideB, SET.screenB.from, SET.screenB.x);
  const bOut = M.slide(t, CUE.slideBAway, SET.screenB.x, SET.screenB.away, { ease: "inOutCubic" });
  const b = t < CUE.slideBAway ? bIn : bOut;
  screenB.position.x = b.x; screenB.rotation.z = b.rot;
  // the actors ride in behind the screens on their slide wires
  humanG.position.x = a.x + SET.human.x - SET.screenA.x; humanG.rotation.z = a.rot * 0.6;
  robotG.position.x = bIn.x + SET.robot.x - SET.screenB.x;

  // bubbles pop up above the screens, pop away when the question comes
  const pa = M.popIn(t, CUE.bubbleA) * M.popOut(t, CUE.bubblesOut);
  const pb = M.popIn(t, CUE.bubbleB) * M.popOut(t, CUE.bubblesOut + 0.05);
  bubbleA.scale.setScalar(Math.max(pa, 1e-4)); bubbleA.visible = pa > 1e-3;
  bubbleB.scale.setScalar(Math.max(pb, 1e-4)); bubbleB.visible = pb > 1e-3;

  // robot: a little hop once revealed
  const hu = clamp((t - CUE.robotHop) / 0.42);
  robotG.position.y = hopArc(hu, 0.22);
  robotG.rotation.z = t < CUE.slideBAway ? bIn.rot * 0.6 : t > CUE.robotHop ? 0.05 * Math.sin((t - CUE.robotHop) * 14) * Math.exp(-(t - CUE.robotHop) * 3) : 0;

  // spots
  special.userData.setLevel(M.snap(t, CUE.judgeSpot) * lerp(1, 0.5, clamp((t - CUE.specialDim) / 0.5)));
  special.userData.setTime(t);
  follow.userData.aim(M.aim(t, aimKeys));
  follow.userData.setLevel(M.snap(t, CUE.followOn, { off: CUE.followOff, offDur: 0.8 }));
  follow.userData.setTime(t);

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
