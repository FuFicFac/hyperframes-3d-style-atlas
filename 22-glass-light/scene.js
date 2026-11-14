// scene.js — 22-glass-light: "Multimodal AI: many inputs, one model". Every frame is a pure function of t:
// pieces are placed from keyed transforms, then every beam is RE-TRACED through the current pieces (optics.js).
import * as THREE from "three";
import { createStage, clamp, smoothstep, toEase } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/glass-light/style.js";
import { DURATION, SCORE, DUCK, OBJECTS, CAMERA, FOCUS, INPUTS, WHITE, SPEED, PIECES, CUES, CAPTIONS, TITLE, CAPTION_POS, CORE, BEATS } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { props, optics } = style;
const { beamItems, causticFor } = style.helpers;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const col = (h) => new THREE.Color(h);

// ---- dynamic light layers ----
const beams = props.beams({ capacity: 96 });
const spill = props.spill({ capacity: 96 });
const caustics = props.caustics({ capacity: 24 });
const glints = props.glints({ capacity: 32 });
const dust = props.dust();
const spillL = props.spillLights();
stage.scene.add(beams, spill, caustics, glints, dust, spillL);

const captions = CAPTIONS.map((c) => ({ ...c, g: props.caption(c.text, { sub: c.sub, ...CAPTION_POS }) }));
const title = props.titleLockup(TITLE.text, { y: TITLE.y, size: TITLE.size });

// ---- keyed transforms (closed form) ----
function keyed(t, keys, field) {
  if (t <= keys[0].t) return keys[0][field];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t < b.t) { const u = toEase(b.ease ?? "inOutCubic")((t - a.t) / (b.t - a.t)); return a[field].map((v, k) => v + (b[field][k] - v) * u); }
  }
  return keys[keys.length - 1][field];
}
const keyedV = (t, keys) => keyed(t, keys.map((k) => ({ ...k, v: k.v })), "v");

const BANDS = optics.BANDS, MID = 3;
const whiteDir = optics.vec.nrm(WHITE.dir);
const wCol = col(WHITE.color);
const inCols = INPUTS.map((i) => col(i.color));

function renderAt(t) {
  // 1. pieces
  for (const p of PIECES) {
    const g = objs[p.id];
    g.position.set(...keyed(t, p.keys, "pos"));
    g.rotation.set(...keyed(t, p.keys, "rot"));
  }
  stage.scene.updateMatrixWorld(true);
  const pieces = PIECES.map((p) => objs[p.id].userData.piece());

  let fanAnchor = [3.6, 0, -1.4];
  const items = [], flats = [], decals = [], gl = [], glows = [], lightsList = [];
  const fuse = smoothstep(CUES.fuse - 0.3, CUES.fuse + 0.9, t);

  // 2. the three inputs
  INPUTS.forEach((inp, k) => {
    const em = objs[`emit-${inp.id}`];
    const lvl = smoothstep(inp.on, inp.on + 0.12, t) * (0.85 + 0.15 * smoothstep(inp.on + 0.12, inp.on + 0.5, t));
    em.userData.setLevel(lvl);
    if (lvl <= 0) return;
    const head = (t - inp.on) * SPEED;
    const path = optics.trace(em.userData.ray(), pieces, { stop: { piece: "core", point: CORE }, maxLen: 10 });
    const ex = optics.firstEvent(path, "exit", inp.piece);
    const pulse = smoothstep(CUES.encoded, CUES.encoded + 0.8, t) * (ex ? 1 : 0);
    items.push(...beamItems(path, { color: inCols[k], level: lvl, head, pulse, pulseFrom: ex ? ex.s : 0 }));
    flats.push(...beamItems(path.segments.filter((s) => !s.inside), { color: inCols[k], level: lvl, head }));
    for (const e of path.events) if ((e.kind === "enter" || e.kind === "exit") && e.s < head) gl.push({ p: e.p, color: inCols[k], level: 1.6 * lvl, size: 38 });
    if (ex && ex.s < head) {
      glows.push({ p: ex.p, color: inCols[k].clone().multiplyScalar(1.2 * lvl), radius: 0.32 });
      decals.push({ p: [ex.p[0] + 0.3, 0, ex.p[2]], dir: [1, 0], length: 0.32, width: 0.14, color: inCols[k].clone().multiplyScalar(0.55 * lvl) });
    }
    lightsList.push({ p: [inp.pos[0] + 0.9, 0.7, inp.pos[2] + 0.25], color: inCols[k], level: lvl * 0.6 });
  });

  // 3. the fused core
  const coreCol = new THREE.Color(1.0, 0.92, 0.85);
  if (fuse > 0) {
    glows.unshift({ p: CORE, color: coreCol.clone().multiplyScalar(0.75 * fuse), radius: 0.36 + 0.12 * fuse });
    lightsList.push({ p: [CORE[0], 0.9, CORE[2] + 0.9], color: coreCol, level: 1.2 * fuse });
    decals.push({ p: [0, 0, 0.1], dir: [1, 0], length: 0.95, width: 0.8, color: coreCol.clone().multiplyScalar(0.22 * fuse) });
    gl.push({ p: [CORE[0] - 0.02, CORE[1] + 0.02, CORE[2]], color: coreCol, level: 1.3 * fuse, size: 64 });
  }
  objs.core.userData.material.userData.glass.uSelf.value.copy(coreCol).multiplyScalar(0.05 * fuse);

  // 4. the answer: white beam to the prism, spectrum fan after it
  if (t >= WHITE.on) {
    const head = (t - WHITE.on) * SPEED;
    const lvl = smoothstep(WHITE.on, WHITE.on + 0.15, t);
    const spec = optics.spectrum({ o: CORE, d: whiteDir }, pieces, { maxLen: 9 });
    const mid = spec[MID].path;
    const enterMid = optics.firstEvent(mid, "enter", "prism");
    const sP = enterMid ? enterMid.s : Infinity;
    const wSegs = optics.clipPath(mid.segments, 0, sP);
    items.push(...beamItems(wSegs, { color: wCol, level: 1.25 * lvl, head }));
    flats.push(...beamItems(wSegs.filter((s) => !s.inside), { color: wCol, level: lvl, head }));
    if (enterMid && head > sP) {
      gl.push({ p: enterMid.p, color: wCol, level: 2.2, size: 52 });
      glows.push({ p: enterMid.p, color: wCol.clone().multiplyScalar(1.4), radius: 0.35 });
      lightsList.push({ p: [enterMid.p[0], 0.8, enterMid.p[2] + 0.5], color: wCol, level: 0.9 });
    }
    spec.forEach((b, i) => {
      const e = optics.firstEvent(b.path, "enter", "prism");
      if (!e) return;
      const c = new THREE.Color().setRGB(...b.rgb, THREE.SRGBColorSpace);
      const segs = optics.clipPath(b.path.segments, e.s);
      items.push(...beamItems(segs, { color: c, level: 0.62 * lvl, head, width: 0.045 }));
      flats.push(...beamItems(segs.filter((s) => !s.inside), { color: c, level: 0.6 * lvl, head }));
      const end = b.path.end;
      const land = smoothstep(end.s, end.s + 0.6, head);
      const d = causticFor(b.path, c, land * 1.5, { width: 0.11 });
      if (d) decals.push(d);
      const xe = optics.firstEvent(b.path, "exit", "prism");
      if (xe && xe.s < head && (i === 0 || i === BANDS.length - 1)) gl.push({ p: xe.p, color: c, level: 1.4, size: 30 });
    });
    const landMid = mid.end;
    if (landMid.kind === "floor") lightsList.push({ p: [landMid.p[0], 0.35, landMid.p[2]], color: col("#ffe9d0"), level: 0.8 * smoothstep(landMid.s, landMid.s + 0.6, head) });
    fanAnchor = landMid.p;
  }

  beams.userData.set(items, t);
  spill.userData.set(flats, t);
  caustics.userData.set(decals);
  glints.userData.set(gl);
  style.setGlow(glows);
  spillL.userData.set(lightsList);

  // 5. camera, dust, type
  const cam = rig.update(t);
  dust.userData.update(t, items, stage.camera);
  const anchors = { lensT: objs.lensT.position.toArray(), core: [CORE[0], CORE[1] + 0.15, CORE[2]], fan: fanAnchor };
  for (const c of captions) c.g.userData.update(t, { on: c.on, off: c.off, anchor: c.anchor ? anchors[c.anchor] : null });
  title.userData.update(t, { on: TITLE.on });

  style.render(t, { focus: keyedV(t, FOCUS) });
  void cam; void BEATS; void clamp;
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
