// scene.js — 12-studio-product: "On-device AI: the chip in your pocket". Every frame is a pure function of t.
import * as THREE from "three";
import { createStage, Timeline, rng, clamp, smoothstep } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/studio-product/style.js";
import {
  DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, CHIP, ENV_ROT, NEURAL, TRACE, STUDIO, SWEEPS, GLOW, TURNTABLE, TITLES, CALLOUTS,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { props, materials: M, plan } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
void tl; void objs;

// ---------------------------------------------------------------- the hero: an unbranded SoC package --
const C = CHIP;
const table = props.turntable({ keys: TURNTABLE });
table.position.y = C.lift;
stage.scene.add(table);

const sub = props.bevelSlab({ w: C.substrate.w, d: C.substrate.w, h: C.substrate.h, radius: C.substrate.radius, bevel: C.substrate.bevel, materialName: "ceramic" });
table.add(sub);
const top = C.substrate.h;
const pads = props.contactPads({ w: C.substrate.w, d: C.substrate.w, ...C.pads });
pads.position.y = top;
table.add(pads);

const lid = props.bevelSlab({
  w: C.lid.w, d: C.lid.w, h: C.lid.h, radius: C.lid.radius, bevel: C.lid.bevel,
  holes: [{ w: C.window.w, d: C.window.w, radius: C.window.radius }], material: M.brushedMetal,
});
lid.position.y = top;
table.add(lid);

const panel = props.etchedPanel({ w: C.window.w + 0.01, d: C.window.w + 0.01, ...C.grid });
panel.position.y = top + C.lid.h - C.window.recess;
table.add(panel);
const P = panel.userData;

// tiny passives (light satin ceramic bodies) between the pads and the lid
{
  const r = rng(C.smd.seed), g = new THREE.BoxGeometry(0.075, 0.035, 0.04);
  g.translate(0, 0.0175, 0);
  const im = new THREE.InstancedMesh(g, M.ceramicLight, C.smd.count);
  const band = C.lid.w / 2 + 0.065, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let k = 0; k < C.smd.count; k++) {
    const side = k % 4, a = r.range(-0.7, 0.7);
    const x = [a, band, -a, -band][side], z = [band, -a, -band, a][side];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side % 2) * Math.PI / 2);
    im.setMatrixAt(k, m4.compose(new THREE.Vector3(x, top, z), q, new THREE.Vector3(1, 1, 1)));
  }
  im.castShadow = im.receiveShadow = true;
  table.add(im);
}
// solder-ball grid on the underside (silver-tinted gold): what the mirror floor sees of a floating chip
{
  const bga = props.ballGrid({ w: C.substrate.w - 0.16, d: C.substrate.w - 0.16, ...C.bga, materialName: "brushedMetal" });
  table.add(bga);
}
// pin-1 marker: a small lathed accent dot set into the lid corner
{
  const r = C.pin1.r;
  const dot = props.lathedBody([[0, 0], [r, 0], [r, 0.006], [r * 0.82, 0.012], [0, 0.012]], { segments: 48, materialName: "accent" });
  const e = C.lid.w / 2 - C.pin1.inset;
  dot.position.set(-e, top + C.lid.h - 0.004, e);
  table.add(dot);
}
// rim-light trace along the lid's outer top edge
// sits on the bevel ridge (a path below the top plane is hidden behind the lid on the far side)
const trace = props.edgeTrace(style.helpers.roundRectLoop(C.lid.w - C.lid.bevel * 0.5, C.lid.w - C.lid.bevel * 0.5, C.lid.radius, top + C.lid.h + 0.004, 12));
table.add(trace);

const shadow = props.contactShadow({ w: C.substrate.w * 1.45, opacity: 0.7, y: 0.004 });
stage.scene.add(shadow);
objs.set.userData.uniforms.uCenter.value.set(0, 0);

// ---------------------------------------------------------------- type ---------------------------------
const titles = TITLES.map((T) => ({ ...T, g: props.titleLockup(T.text, { sub: T.sub, y: T.y, size: T.size }) }));
const callouts = CALLOUTS.map((c) => ({ ...c, g: props.callout(c.text, { sub: c.sub, dir: c.dir, knee: c.knee, run: c.run }) }));
const nC = P.cellCenter(NEURAL.i0, NEURAL.j0).add(P.cellCenter(NEURAL.i1, NEURAL.j1)).multiplyScalar(0.5);
const neuralCells = [];
for (let j = NEURAL.j0; j <= NEURAL.j1; j++) for (let i = NEURAL.i0; i <= NEURAL.i1; i++) neuralCells.push(`${i},${j}`);
const isNeural = (i, j) => neuralCells.includes(`${i},${j}`);

// ---------------------------------------------------------------- frame --------------------------------
const edgeFade = style.spec.studio.sweep.edgeFade;
function renderAt(t) {
  // light: studio level + travelling sweep strip (PMREM re-bake memoised on inputs)
  const sw = plan.sweepAt(t, SWEEPS, edgeFade);
  style.studio.set({ level: plan.studioLevel(t, STUDIO), sweepU: sw.u, sweepLevel: sw.level, yaw: sw.yaw, rotation: plan.keyed(t, ENV_ROT) });

  table.userData.update(t);

  // rim trace: one lap from black, then the lit edge fades as the studio comes up
  const head = clamp((t - TRACE.on) / TRACE.dur) * 1.35;
  const fadeOut = 1 - smoothstep(TRACE.fadeAt, TRACE.fadeAt + 0.9, t);
  trace.userData.set(head, { level: t >= TRACE.on ? fadeOut : 0, tail: 0.35, full: smoothstep(TRACE.on + TRACE.dur * 0.9, TRACE.on + TRACE.dur + 0.3, t) * 0.55 });

  // etched cores: neural region flares and stays; the wave ripples through every cell; then all idle
  const idle = smoothstep(GLOW.idleOn, GLOW.idleOn + 1.0, t) * GLOW.idle + smoothstep(GLOW.heroOn, GLOW.heroOn + 1.2, t) * (GLOW.hero - GLOW.idle);
  for (const c of GLOW.wave) {
    const neural = isNeural(c.i, c.j) ? plan.pulse(t, GLOW.neuralOn, { rise: 0.35, hold: 0.2, fall: 0.8, floor: GLOW.neural }) : 0;
    const wave = plan.pulse(t, c.on, { rise: 0.1, hold: 0.12, fall: 0.75, floor: 0.0 });
    const breathe = idle * (0.85 + 0.15 * Math.sin(t * 2.4 + c.i * 0.7 + c.j * 0.4));
    P.setCell(c.i, c.j, Math.max(neural, wave, breathe));
  }
  P.commit();

  const cam = rig.update(t);
  stage.scene.updateMatrixWorld(true);
  for (const T of titles) T.g.userData.update(t, { on: T.on, off: T.off });
  const anchor = panel.localToWorld(nC.clone()).toArray();
  for (const c of callouts) c.g.userData.update(t, { anchor, on: c.on, off: c.off });

  style.render(t, { focus: cam.target.toArray() });
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
