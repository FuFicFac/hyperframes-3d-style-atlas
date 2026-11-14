// scene.js — 20-isometric-pastel: "The AI stack" — four floors (chips, data centres, models, apps) stack up on a dot grid.
// Built from isometric-pastel props; every frame is a pure function of t (no accumulation, seeded props only).
import { createStage, THREE, clamp, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { hopArc } from "./_atlas/kit/motion.js";
import { createStyle } from "./_atlas/styles/isometric-pastel/style.js";
import { riseU } from "./_atlas/styles/isometric-pastel/iso.js";
import {
  DURATION, CAMERA, SCORE, DUCK, SLAB, FLOORS, PLAN, CHIPS, TRACES, RACKS, COOLERS, LED_RATE, CORE, STORES, CABLES, RIPPLE,
  DEVICES, PEOPLE, SCREEN, HOP, UI, BEATS,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const X = style.props;
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- ground + plot mark
const ground = X.ground();
stage.scene.add(ground);
const mark = X.groundMark({ w: SLAB.w + 0.5, d: SLAB.d + 0.5, bar: 0.07, dash: 0.32, color: "#c3bbd9" });
stage.scene.add(mark);

// ---------------------------------------------------------------- floors
const risers = []; // { obj, at, dur, mode: "y" | "all", over }
const rise = (obj, at, dur = 0.42, mode = "y", over = 1.6) => (risers.push({ obj, at, dur, mode, over }), obj);
const put = (parent, obj, x = 0, y = 0, z = 0) => { obj.position.set(x, y, z); parent.add(obj); return obj; };

const slabs = [], decks = [], loops = [];
FLOORS.forEach((f) => {
  const s = X.slab({ w: SLAB.w, d: SLAB.d, h: SLAB.h, color: f.color, posts: f.posts, number: f.n });
  const deck = put(s, new THREE.Group(), 0, SLAB.h, 0);
  slabs.push(s); decks.push(deck);
});
// posts rise once the floor's content is in
const POSTS_AT = [B.chips.t + 1.15, PLAN.land[1] + 0.85, PLAN.land[2] + 0.95, Infinity];
slabs.forEach((s, i) => s.userData.posts.forEach((p, k) => rise(p, POSTS_AT[i] + k * 0.04, 0.35)));

// 1 — chips
for (const [x, z, w, d] of TRACES) put(decks[0], X.block({ w, h: 0.012, d, color: "#c9ddf8", shadow: false }), x, 0.001, z);
for (const c of CHIPS) rise(put(decks[0], X.chip({ size: c.size, h: 0.18, die: c.die, pinCount: c.size > 0.9 ? 5 : 4 }), c.x, 0, c.z), c.at, 0.36, "all", 2.2);

// 2 — data centres
for (const r of RACKS) {
  const rack = put(decks[1], X.serverRack({ seed: r.seed, rate: LED_RATE, led: "mint", color: "cloud" }), r.x, 0, r.z);
  rise(rack, r.at, 0.4); loops.push((t) => rack.userData.update(t));
}
for (const c of COOLERS) {
  const u = put(decks[1], X.coolingUnit({ w: 1.05, h: 0.95, d: 1.05, color: "sky", rate: 1.1 }), c.x, 0, c.z);
  rise(u, c.at, 0.4); loops.push((t) => u.userData.update(t));
}

// 3 — models: plinth + stacked core cubes, data stores, cables with packets, ripples
const plinth = rise(put(decks[2], X.block({ ...CORE.plinth, color: "rose" })), CORE.at, 0.35);
const cubes = [];
let cy = CORE.plinth.h + CORE.gap;
CORE.cubes.forEach((c, i) => {
  const m = put(decks[2], X.block({ w: c.s, h: c.s, d: c.s, color: c.color, unique: true }), 0, cy, 0);
  m.userData.baseY = cy; cy += c.s + CORE.gap;
  rise(m, CORE.at + 0.12 + i * 0.12, 0.38, "all", 2.0);
  cubes.push(m);
});
for (const s of STORES) {
  const b = put(decks[2], X.block({ w: 0.8, h: 0.62, d: 0.8, color: "sky" }), s.x, 0, s.z);
  for (let k = 0; k < 3; k++) X.inset(b, { face: "left", v: -0.18 + k * 0.17, w: 0.56, h: 0.07, color: "lilac" });
  X.inset(b, { face: "top", w: 0.4, h: 0.4, color: "butter" });
  rise(b, s.at, 0.36);
}
const cables = STORES.map((s) => put(decks[2], X.route(s.path, { kind: "cable", radius: CABLES.radius, bend: CABLES.bend, color: "lilac" })));
const flows = cables.map((c) => put(decks[2], X.packets(c, { size: CABLES.packet, speed: CABLES.speed, spacing: CABLES.spacing, color: "accent" })));
const ripples = [0, 1].map(() => put(decks[2], X.ripple({ size: RIPPLE.size, grow: RIPPLE.grow, bar: 0.09, color: "accent", fadeTo: "mint" }), 0, 0.002, 0));

// 4 — apps: devices + capsule people
const devices = DEVICES.map((d) => {
  const dv = put(decks[3], X.device({ kind: d.kind, w: d.w, h: d.h, phase: d.phase, period: SCREEN.period, screen: "sky", ui: ["butter", "rose", "cloud"] }), d.x, 0, d.z);
  rise(dv, d.at, 0.4);
  return dv;
});
const people = PEOPLE.map((p, i) => {
  const m = put(decks[3], X.person({ h: 1.25, color: p.color, seed: 40 + i }), p.x, 0, p.z);
  rise(m, p.at, 0.34, "all", 2.4);
  return m;
});

// ---------------------------------------------------------------- stack + flat long shadows
const stack = X.stack(slabs, PLAN);
stage.scene.add(stack);
slabs.forEach((s, i) => {
  style.castShadows(decks[i], s);
  s.userData.posts.forEach((p) => style.castShadows(p, s));
  style.castShadows(s, ground, { only: (m) => m === s.userData.body }); // slabs only: thin post shadows read as stray lines
});

// ---------------------------------------------------------------- finale pulse props: corner climber + slab collars
const climber = X.block({ w: 0.34, h: 0.34, d: 0.34, color: "accent", shadow: false });
stage.scene.add(climber);
const collars = slabs.map((s) => {
  const c = new THREE.Group(), w = SLAB.w + 0.12, d = SLAB.d + 0.12, b = 0.07, h = 0.22;
  for (const [x, z, bw, bd] of [[0, -d / 2, w + b, b], [0, d / 2, w + b, b], [-w / 2, 0, b, d], [w / 2, 0, b, d]]) c.add(put(new THREE.Group(), X.block({ w: bw, h, d: bd, color: "accent", shadow: false }), x, 0, z));
  put(s, c, 0, SLAB.h / 2 - h / 2, 0);
  c.visible = false;
  return c;
});

// ---------------------------------------------------------------- overlay
const kicker = X.kicker(UI.kicker.text, { x: UI.kicker.x, y: UI.kicker.y });
const captions = UI.captions.map((c) => ({ c, g: X.caption({ n: c.n, title: c.title, sub: c.sub, color: c.color, x: c.x, y: c.y }) }));
const final = X.caption({ title: UI.final.title, x: UI.final.x, y: UI.final.y, size: UI.final.size });
const tags = UI.tags.map((g) => ({ g, m: X.tag({ n: g.n, title: g.title, color: g.color, side: "right" }) }));

const rig = createCameraRig(stage.camera, CAMERA, { drift: null });

function renderAt(t) {
  stack.userData.update(t);
  mark.userData.set(clamp((t - 0.1) / 0.5));
  for (const r of risers) {
    r.obj.visible = t >= r.at;
    const u = Math.max(0.001, riseU(t, r.at, r.dur, r.over));
    if (r.mode === "y") r.obj.scale.set(1, u, 1);
    else r.obj.scale.setScalar(u);
  }
  for (const f of loops) f(t);
  // models: core bobs on a fixed clock and glows; cables draw on; packets flow; ripples loop
  cubes.forEach((m, i) => {
    const on = t >= CORE.at + 0.6;
    m.position.y = m.userData.baseY + (on ? 0.06 * Math.max(0, Math.sin(((t - CORE.at - 0.6) / 1.8) * Math.PI * 2 - i * 0.9)) : 0);
  });
  cubes[1].material.userData.setMix("#ffffff", t > RIPPLE.at ? 0.22 * (0.5 + 0.5 * Math.cos(((t - RIPPLE.at) / RIPPLE.period) * Math.PI * 2)) : 0);
  cables.forEach((c, i) => c.userData.setDraw(clamp((t - CABLES.drawAt - i * 0.06) / CABLES.drawDur)));
  flows.forEach((f) => f.userData.update(t, CABLES.flowAt));
  ripples.forEach((r, k) => {
    const u = (t - RIPPLE.at) / (RIPPLE.period * 2) - k * 0.5;
    r.userData.set(t < RIPPLE.at || u < 0 ? 0 : u - Math.floor(u));
  });
  // apps: screens tick, people hop on the loop
  devices.forEach((d) => d.userData.update(t, SCREEN.on));
  people.forEach((m, i) => {
    const k = t - HOP.at - PEOPLE[i].hop;
    const ph = k < 0 ? -1 : k % HOP.period;
    m.position.y = ph >= 0 && ph < HOP.dur ? hopArc(ph / HOP.dur, HOP.height) : 0;
  });
  // finale pulse: an accent block climbs the front corner; each floor's collar pops as it passes (bottom -> top)
  const PA = PLAN.pulseAt, mid = (i) => slabs[i].position.y + SLAB.h / 2;
  climber.visible = t >= PA[0] - 0.25 && t < PA[3] + 0.35;
  if (climber.visible) {
    let y = mid(0) - 0.6;
    if (t >= PA[0]) y = mid(3);
    for (let i = 0; i < 3; i++) if (t >= PA[i] && t < PA[i + 1]) y = mid(i) + (mid(i + 1) - mid(i)) * ease.inOutSine((t - PA[i]) / (PA[i + 1] - PA[i]));
    if (t < PA[0]) y = mid(0) - 0.6 + 0.6 * ease.outCubic((t - PA[0] + 0.25) / 0.25);
    climber.position.set(SLAB.w / 2 + 0.35, y - 0.17, SLAB.d / 2 + 0.35);
    climber.scale.setScalar(Math.max(0.001, Math.min(1, (t - PA[0] + 0.25) / 0.12, (PA[3] + 0.35 - t) / 0.2)));
  }
  collars.forEach((c, i) => {
    const k = stack.userData.pulse(t, i, { rise: 0.07, fall: 0.5 });
    c.visible = k > 0.002;
    c.scale.set(1 + 0.04 * k, Math.max(0.001, k), 1 + 0.04 * k);
  });

  rig.update(t);
  style.updateShadows();
  kicker.userData.update(t, UI.kicker);
  captions.forEach(({ c, g }) => g.userData.update(t, c));
  final.userData.update(t, UI.final);
  tags.forEach(({ g, m }, i) => {
    const y = slabs[i].position.y + SLAB.h * 0.5;
    const anchor = [SLAB.w / 2, y, -SLAB.d / 2];
    m.userData.update(t, { on: g.on, off: g.off, anchor, at: [UI.tagX, null] });
  });
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
