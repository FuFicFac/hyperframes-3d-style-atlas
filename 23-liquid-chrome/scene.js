// scene.js — 23-liquid-chrome: "What is a foundation model?" Every frame is a pure function of t.
// The liquid is one raymarched field of 36 slots (4 groups x 9; slot 0 of each group is its core). buildPrims(t)
// assembles the slot list for the current beat from the style's liquid.js helpers; nothing carries over between seeks.
import * as THREE from "three";
import { createStage, clamp, lerp, smoothstep, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { projectToScreen } from "./_atlas/kit/overlay.js";
import { createStyle } from "./_atlas/styles/liquid-chrome/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, LIQ, DROPLETS, TITLE, CAPTIONS, ICON_CAPTIONS, GLINTS,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props, plan: L, env } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

const liquid = props.liquid();
stage.scene.add(liquid);
const sparks = props.sparkles({ capacity: 40 });
stage.scene.add(sparks);

const title = props.inflatedText(TITLE.text);
title.position.set(0, TITLE.y, 0);
const fit = Math.min(1, 10.6 / title.userData.width);
title.scale.setScalar(fit);
stage.scene.add(title);

const captions = CAPTIONS.map((c) => ({ ...c, mesh: props.caption(c.text) }));
const iconCaps = LIQ.icons.map((ic) => props.caption(ic.label, { size: 0.62 }));

// ------------------------------------------------------------------------------------------------ the liquid plan
const { groups: G, slots: NS } = LIQ;
const slot = (g, j) => g * NS + j;
const ABS = LIQ.droplets.absorb;
const blobR = (t) => {
  const a = L.absorbed(DROPLETS, t, ABS);
  return lerp(LIQ.R0, LIQ.R1, a) * (1 + 0.04 * Math.sin(Math.PI * a) * Math.sin(t * 7));
};
const cores = (t, R) => L.wobbleBlob(t, { R, n: G, seed: 1, amp: 0.2, speed: 0.55, k: 0.55 });
const rowPos = (i, t) => [LIQ.icons[i].x, LIQ.iconY + 0.06 * Math.sin(t * 1.6 + i * 1.3), 0];
const spinAngle = (t) => {
  const s = Math.max(0, t - LIQ.ring.from), T = LIQ.ring.settle, w = LIQ.ring.spin;
  return s < T ? (w * s * s) / (2 * T) : w * (s - T / 2);
};
function iconPos(i, t) {
  const row = rowPos(i, t);
  if (t < LIQ.ring.from) return row;
  const th = LIQ.ring.angles[i] + spinAngle(t);
  const ring = [LIQ.ring.R * Math.cos(th), LIQ.ring.y + 0.08 * Math.sin(t * 1.6 + i * 1.3), LIQ.ring.R * Math.sin(th)];
  return L.mixPrims([L.sph(...row, 0)], [L.sph(ring[0], ring[1], 0, { z: ring[2] })], ease.inOutCubic(smoothstep(LIQ.ring.from, LIQ.ring.from + LIQ.ring.settle, t)))[0].c;
}
const camPos = () => stage.camera.position;
function iconTarget(i, t) {
  const p = iconPos(i, t);
  const yaw = Math.atan2(camPos().x - p[0], camPos().z - p[2]);
  const shape = L.SHAPES[LIQ.icons[i].shape]({ t });
  return L.place(L.fitSlots(shape, NS), { pos: p, scale: LIQ.iconScale, yaw });
}
const collapsedAt = (i, t, target) => L.collapsedLike(target, LIQ.morph.R, { center: iconPos(i, t), k: LIQ.split.k[1] });
const coreStart = (t) => cores(t, LIQ.R1).map((p) => p.c);
const coreR0 = (t) => cores(t, LIQ.R1).map((p) => p.r);
const empty = () => Array.from({ length: G * NS }, () => L.ghost());

function buildPrims(t) {
  const out = empty();
  const S = LIQ.split, M = LIQ.morph, ME = LIQ.melt, MG = LIQ.merge, B = LIQ.bar;
  if (t < S.at) {
    // ---- one big blob + orbiting satellites + incoming droplet streams ----
    const R = blobR(t);
    cores(t, R).forEach((p, g) => (out[slot(g, 0)] = p));
    const O = LIQ.orbiters;
    const m = smoothstep(O.mergeAt, O.mergeAt + O.mergeDur, t);
    L.orbiters(t, { R, n: O.n, seed: O.seed, size: O.size, dist: lerp(O.dist, 0.55, ease.inCubic(m)), speed: O.speed }).forEach((p, g) => {
      out[slot(g, 1)] = { ...p, w: 1 - smoothstep(0.75, 1, m) };
    });
    DROPLETS.forEach((d, n) => {
      out[slot(n % G, 2 + Math.floor(n / G))] = L.dropletAt(d, t, { R, absorb: ABS, k: 0.32 });
    });
  } else if (t < MG.at) {
    // ---- pinch-split into four, each re-forms as an icon; orbit; melt back to spheres ----
    const u = (t - S.at) / S.dur;
    const ends = LIQ.icons.map((_, i) => iconPos(i, t));
    const split = L.splitPrims(u, { from: coreStart(S.at), R0: coreR0(S.at), R: LIQ.R1, to: ends, r: M.R, k: S.k });
    for (let i = 0; i < G; i++) {
      const target = iconTarget(i, t);
      const col = collapsedAt(i, t, target);
      const um = (t - (M.at + i * M.stagger)) / M.dur;
      const umelt = (t - (ME.at + i * 0.08)) / ME.dur;
      let ps;
      if (um <= 0) { ps = col.map((p) => ({ ...p })); ps[0] = split[i]; }
      else ps = L.mixPrims(col, target, ease.inOutCubic(clamp(um)) * (1 - ease.inOutCubic(clamp(umelt))));
      ps.forEach((p, j) => (out[slot(i, j)] = p));
    }
  } else if (t < B.at) {
    // ---- melt-merge back into one blob ----
    const u = 1 - (t - MG.at) / MG.dur;
    const R = LIQ.R1;
    const merged = L.splitPrims(clamp(u), { from: coreStart(t), R0: coreR0(t), R, to: LIQ.icons.map((_, i) => iconPos(i, t)), r: M.R, k: S.k });
    merged.forEach((p, g) => (out[slot(g, 0)] = p));
  } else {
    // ---- the blob spreads into a liquid underline; letters landing ripple it ----
    const u = ease.inOutCubic(clamp((t - B.at) / B.dur));
    const blob = cores(t, LIQ.R1);
    // every core flows into the same pill (identical prims: a uniform union, no lumps where segments would meet)
    const bar = L.rbox(0.05 * Math.sin(t * 1.3), B.y + 0.02 * Math.sin(t * 2.1), B.half, 0, B.r, { hz: B.depth, k: B.k });
    blob.forEach((p, g) => (out[slot(g, 0)] = L.mixPrims([p], [bar], u)[0]));
  }
  return out;
}

function ripplesAt(t) {
  const list = [];
  if (t < LIQ.split.at + 0.5) {
    const R = blobR(t);
    for (const d of DROPLETS) {
      const age = t - d.arrive;
      if (age >= 0 && age < 1.3) list.push({ p: d.dir.map((v) => v * R), age, amp: 0.008 + d.r * 0.05 });
    }
  }
  if (t >= TITLE.start) {
    title.userData.chars.forEach((h, k) => {
      const age = t - (TITLE.start + k * TITLE.stagger + 0.2);
      if (age >= 0 && age < 1.4) list.push({ p: [h.userData.home.x * fit, LIQ.bar.y + LIQ.bar.r, 0], age, amp: 0.012 });
    });
  }
  return list.sort((a, b) => a.age - b.age).slice(0, style.spec.liquid.ripple.slots);
}

// ------------------------------------------------------------------------------------------------ glints + flares
function glintPoint(on, t) {
  if (on === "core") return style.helpers.highlightPoint({ c: [0, 0, 0], he: [0, 0, 0], r: blobR(t) }, camPos());
  if (on === "bar") return new THREE.Vector3(LIQ.bar.glint, LIQ.bar.y + 0.2, 0.22);
  if (on.startsWith("icon")) {
    const i = Number(on.slice(4)), p = iconPos(i, t), s = LIQ.iconScale;
    return new THREE.Vector3(p[0] + 0.62 * s, p[1] + 0.55 * s, p[2] + 0.25);
  }
  const k = Number(on.split(":")[1]), h = title.userData.chars[k];
  const cap = style.spec.type.cap;
  return new THREE.Vector3((h.userData.home.x + 0.18 * cap) * fit, TITLE.y + (h.userData.home.y + 0.32 * cap) * fit, 0.2);
}
function sparkList(t) {
  const list = [];
  for (const g of GLINTS) {
    const a = t - g.t;
    if (a < 0 || a > 1.1) continue;
    const lv = smoothstep(0, 0.07, a) * Math.exp(-a * 3.4);
    const p = projectToScreen(stage, glintPoint(g.on, t));
    if (p.behind) continue;
    list.push({ x: p.x, y: p.y, kind: "star", size: g.size * (0.6 + 0.4 * lv), level: style.spec.sparkle.level * lv, rot: a * 0.7 });
  }
  // a soft lens flare riding the blob's sun glint (fades while it is split up)
  const blobOn = (1 - smoothstep(LIQ.split.at, LIQ.split.at + 0.6, t)) + smoothstep(LIQ.merge.at + 0.5, LIQ.merge.at + LIQ.merge.dur, t) * (1 - smoothstep(LIQ.bar.at, LIQ.bar.at + 0.5, t));
  if (blobOn > 0.01) {
    const p = projectToScreen(stage, glintPoint("core", t));
    const swell = smoothstep(LIQ.droplets.end - 0.4, LIQ.droplets.end + 0.2, t) * (1 - smoothstep(LIQ.droplets.end + 0.3, LIQ.split.at, t));
    list.push(...sparks.userData.flare(p.x, p.y, blobOn * (0.55 + 0.9 * swell)));
  }
  const titleOn = smoothstep(TITLE.start + 0.8, TITLE.start + 1.4, t);
  if (titleOn > 0.01) {
    const p = projectToScreen(stage, glintPoint("bar", t));
    list.push(...sparks.userData.flare(p.x, p.y, titleOn * 0.6, { streak: true }));
  }
  return list;
}

// ------------------------------------------------------------------------------------------------ frame
function renderAt(t) {
  rig.update(t);
  stage.sync();
  env.set({ yaw: 0.35 * Math.sin(t * 0.27) + 0.04 * t, iridescence: 0.12 * smoothstep(LIQ.bar.at, LIQ.bar.at + 1, t) });
  objs.backdrop.userData.update(t);
  objs.grid.userData.update(t, 1);

  liquid.userData.set(buildPrims(t), t);
  liquid.userData.setRipples(ripplesAt(t));
  title.userData.update(t, TITLE.start, { stagger: TITLE.stagger });
  sparks.userData.set(sparkList(t));

  for (const c of captions) c.mesh.userData.update(t, { on: c.on, off: c.off, y: -0.76 });
  iconCaps.forEach((m, i) => {
    const p = iconPos(i, t);
    m.userData.update(t, { on: ICON_CAPTIONS.on + i * ICON_CAPTIONS.stagger, off: ICON_CAPTIONS.off, world: [p[0], ICON_CAPTIONS.y, p[2]] });
  });
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
