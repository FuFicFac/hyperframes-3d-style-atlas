// scene.js — 15-felt-stitch: "AI agents working as a team" on a felt story board. Data lives in scene.config.js.
// Pure function of time: object motion is evaluated at tq = onTwos(t) (15 poses/s), the camera at t.
import { createStage, clamp, lerp, ease, hash01 } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/felt-stitch/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, Z, GROUND_Y, AGENTS, AGENT_SIZE, TAG, ENTER, CARD, CAPTION, CAPTIONS, CAPTION_SEW, PEEL,
  SPLIT, SMALL, TASKS, WORK, TASK_HOME_Y, ROUTE_LIFT, CHECK, RESULT,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props, plan: M } = style;
const THREE = stage.THREE;
const scene = stage.scene;
const objs = objectsFromSpec(scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: { amp: 0, speed: 0 } }); // locked-off (bitrate, see CAMERA)
const BT = objs.board.userData.top;            // backdrop felt surface z
const show = (o, v) => { o.visible = v; };
const jitter = (o, tq, seed, a = 0.012) => { const i = Math.floor(tq * 15 + 1e-6); o.rotation.z += (hash01(seed, i, 1) - 0.5) * 2 * a; };

// ---------------------------------------------------------------- characters + name tags
const agents = AGENTS.map((a, i) => {
  const holder = new THREE.Group();
  holder.position.set(a.x, GROUND_Y, Z.content);
  const ch = props.character({ color: a.color, w: AGENT_SIZE.w, h: AGENT_SIZE.h, emblem: a.emblem, seamColor: a.seam, seed: a.seed });
  holder.add(ch);
  scene.add(holder);
  const tw = M.embroideredText(a.name, TAG.cap).width;
  const tag = props.patch({ text: a.name, cap: TAG.cap, w: tw + TAG.pad * 2, h: TAG.h, color: TAG.color, thread: TAG.thread, border: "blanket", borderColor: a.color === "plumLight" ? "plum" : a.color, seed: 500 + i });
  tag.userData.sew(1, 1);
  tag.position.set(a.x, TAG.y, Z.content + 0.12);
  scene.add(tag);
  return { a, holder, ch, tag, i };
});
const agentBy = Object.fromEntries(agents.map((g) => [g.a.id, g]));
const headY = GROUND_Y + AGENT_SIZE.h;

// ---------------------------------------------------------------- beat 1: the task card (+ needle)
const card = props.card({ w: CARD.w, h: CARD.h, color: CARD.color, text: CARD.text, cap: CARD.cap, thread: CARD.thread, seed: 31 });
const cardHinge = props.hinged(card, { at: "top", h: CARD.h });
const cardHolder = new THREE.Group();
cardHolder.add(cardHinge);
scene.add(cardHolder);
const cardNeedle = props.needle({ thread: CARD.thread });
card.userData.border.add(cardNeedle);

// ---------------------------------------------------------------- captions (one region)
const captions = CAPTIONS.map((c, i) => {
  const p = props.patch({ text: c.text, cap: CAPTION.cap, color: CAPTION.color, thread: CAPTION.thread, border: "running", borderColor: "coral", seed: 600 + i * 7 });
  const h = props.hinged(p, { at: "top", h: p.userData.h });
  h.position.set(CAPTION.x, CAPTION.y + p.userData.h / 2, Z.caption);
  scene.add(h);
  return { c, p, h };
});

// ---------------------------------------------------------------- beat 2: split path + small task cards
const splitPath = props.stitchedPath([CARD.pos, ...SPLIT.pathPts], { color: "cream", z: BT, bend: 0.45 });
scene.add(splitPath);
const splitEnd = SPLIT.pathPts[SPLIT.pathPts.length - 1];
const tasks = TASKS.map((tk, i) => {
  const c = props.card({ w: SMALL.w, h: SMALL.h, color: SMALL.color, thread: SMALL.thread, lines: WORK.lines, seed: 700 + i * 5 });
  c.userData.border.userData.setProgress(1);
  const holder = new THREE.Group();
  holder.add(c);
  scene.add(holder);
  const ag = agentBy[tk.to];
  const home = [ag.a.x + tk.off[0], TASK_HOME_Y + tk.off[1]];
  // route to the agent: lift over the middle
  const mid = [(tk.fan[0] + home[0]) / 2, Math.max(tk.fan[1], home[1]) + ROUTE_LIFT[i]];
  const route = props.stitchedPath([tk.fan, mid, home], { color: "cream", z: BT, bend: 0.9 });
  scene.add(route);
  const st = CHECK.stack[i];
  const mid2 = [(home[0] + st[0]) / 2, Math.max(home[1], st[1]) + 0.4 + 0.32 * i];
  const route2 = props.stitchedPath([home, mid2, [st[0], st[1]]], { color: "mustard", z: BT, bend: 0.9 });
  scene.add(route2);
  return { tk, c, holder, home, route, route2, i };
});

// ---------------------------------------------------------------- beat 3: sparks (felt stars + pom-poms)
const sparkColors = ["mustard", "coral", "white", "tealLight", "blush", "mustard", "white"];
const sparkPools = ["researcher", "writer"].map((id, j) => {
  const ag = agentBy[id];
  const items = Array.from({ length: WORK.sparks }, (_, i) => {
    const o = i % 2 ? props.pomPom({ r: WORK.pomR, color: sparkColors[(i + j) % sparkColors.length], seed: 900 + i + j * 20 }) : props.spark({ size: WORK.sparkSize, color: sparkColors[(i + 2 * j) % sparkColors.length], seed: 950 + i });
    scene.add(o);
    o.visible = false;
    return o;
  });
  return { ag, items, j };
});

// ---------------------------------------------------------------- beat 4: felt tick (+ needle)
const tick = props.feltTick({ size: CHECK.tick.size, color: "leaf", stitch: "white" });
const tickHinge = props.hinged(tick, { at: "top", h: CHECK.tick.size * 0.75 });
tickHinge.position.set(CHECK.tick.pos[0], CHECK.tick.pos[1] + CHECK.tick.size * 0.375, Z.travel + 0.2);
scene.add(tickHinge);
const tickNeedle = props.needle({ thread: "white", length: 0.7 });
tick.userData.stitch.add(tickNeedle);

// ---------------------------------------------------------------- beat 5: report + banner (+ needle)
const R = RESULT.report;
const report = props.report({ w: R.w, h: R.h, color: "white", accent: "coral", cap: 0.22, rosetteR: 0.36 });
const reportHinge = props.hinged(report, { at: "top", h: R.h });
reportHinge.position.set(R.pos[0], R.pos[1] + R.h / 2, Z.content + 0.3);
scene.add(reportHinge);
const BN = RESULT.banner;
const banner = props.patch({ text: BN.text, cap: BN.cap, color: BN.color, thread: BN.thread, border: "running", borderColor: BN.border, shape: "banner", seed: 801 });
const bannerHinge = props.hinged(banner, { at: "top", h: banner.userData.h });
bannerHinge.position.set(BN.pos[0], BN.pos[1] + banner.userData.h / 2, Z.caption);
scene.add(bannerHinge);
const bannerNeedle = props.needle({ thread: BN.thread });
banner.userData.text.add(bannerNeedle);

// ---------------------------------------------------------------- helpers
/** flop-in / peel-out angle for a hinged piece; returns null while it should be hidden. */
function flopAngle(tq, tin, tout = Infinity) {
  if (tq < tin) return null;
  if (tq >= tout + PEEL) return null;
  return tq < tout ? M.flop(tq, tin) : M.peel(tq, tout, PEEL);
}
function sewNeedle(nd, stitch, tq, start, dur) {
  const vis = tq >= start - 0.12 && tq <= start + dur + 0.2;
  if (!vis) { nd.userData.update({ visible: false }); return; }
  const p = M.sewProgress(tq, start, dur);
  const h = stitch.userData.headAt(Math.min(p, 0.999));
  const lift = tq > start + dur ? (tq - start - dur) * 2.5 : tq < start ? (start - tq) * 2.5 : 0;
  nd.userData.update({ tip: [h.p[0] + lift * 0.4, h.p[1] + lift * 0.6, h.p[2] + lift], anchor: stitch.userData.anchorAt(Math.min(p, 0.999)), dip: tq >= start && tq <= start + dur ? nd.userData.dipAt(h.f) : 0 });
}

function renderAt(t) {
  const tq = M.onTwos(t);

  // ---- characters: flop up from the ground strip, hops, work wobble, final cheer ----
  for (const g of agents) {
    const { a, holder, ch, tag, i } = g;
    const s0 = ENTER.start + i * ENTER.step;
    show(holder, tq >= s0);
    show(tag, tq >= s0);
    holder.rotation.set(tq >= s0 ? M.flop(tq, s0, { from: 1.25, stiffness: 120, damping: 9 }) : 0, 0, 0);
    let y = 0, sc = [1, 1, 1];
    const hops = [];
    if (a.id === "planner") hops.push(SPLIT.hop);
    if (a.id === "checker") hops.push(CHECK.hop);
    hops.push(RESULT.cheer + i * RESULT.cheerStep);
    for (const hs of hops) {
      if (tq >= hs - 0.2 && tq < hs + 1.4) { const h = M.hop(tq, hs, { dur: 0.5, height: hs >= RESULT.cheer ? RESULT.cheerHeight : undefined }); y = h.y; sc = h.scale; }
    }
    ch.position.y = y;
    ch.scale.set(...sc);
    let rz = 0;
    if (a.id === "researcher" || a.id === "writer") rz = M.wobble(tq, WORK.start, WORK.end, { seed: i * 1.3 });
    ch.rotation.z = rz;
    if (Math.abs(rz) > 1e-4) ch.position.y += Math.abs(Math.sin((tq - WORK.start) * 10.4)) * 0.05;
  }

  // ---- beat 1: card flops onto the board, needle sews its border; beat 2: rides the path ----
  const cAng = flopAngle(tq, CARD.flop);
  show(cardHolder, cAng !== null && tq < SPLIT.burst);
  card.userData.sew(M.sewProgress(tq, CARD.sewStart, CARD.sewDur), 1);
  sewNeedle(cardNeedle, card.userData.border, tq, CARD.sewStart, CARD.sewDur);
  if (tq < SPLIT.ride) {
    cardHolder.position.set(CARD.pos[0], CARD.pos[1] + CARD.h / 2, Z.content);
    cardHolder.scale.setScalar(1);
    cardHinge.userData.setAngle(cAng ?? 0);
    cardHolder.rotation.z = 0;
  } else {
    const tr = M.travel(tq, SPLIT.ride, SPLIT.rideDur, splitPath.userData.path);
    const k = lerp(1, SPLIT.rideScale, ease.outCubic(clamp((tq - SPLIT.ride) / (SPLIT.rideDur * 0.6))));
    cardHolder.position.set(tr.p[0], tr.p[1] + (CARD.h / 2) * k, lerp(Z.content, Z.travel, clamp((tq - SPLIT.ride) / 0.2)));
    cardHolder.scale.setScalar(k);
    cardHinge.userData.setAngle(-0.12 * Math.sin(Math.PI * tr.u));
    cardHolder.rotation.z = 0.25 * Math.sin(Math.PI * tr.u) * Math.sign(tr.t[0] || 1) * 0.5;
    jitter(cardHolder, tq, 3);
  }
  // split path: sewn, then unpicked at the end
  // split path: sewn, then unpicked once the task cards have left the planner (keeps the board readable)
  splitPath.userData.setProgress(tq < WORK.pathSew ? M.sewProgress(tq, SPLIT.pathSew, SPLIT.pathDur) : 1 - M.sewProgress(tq, WORK.pathSew, 0.45));

  // ---- captions ----
  for (const { c, p, h } of captions) {
    const ang = flopAngle(tq, c.in, c.out);
    show(h, ang !== null);
    if (ang === null) continue;
    h.userData.setAngle(ang);
    p.userData.sew(1, M.sewProgress(tq, c.in + 0.3, CAPTION_SEW));
  }

  // ---- small task cards: burst -> fan -> route to agents -> work (lines sewn) -> route to checker -> gather ----
  for (const T of tasks) {
    const { tk, c, holder, home, route, route2, i } = T;
    const born = SPLIT.burst + i * 0.07;
    show(holder, tq >= born && tq < RESULT.gather + RESULT.gatherDur);
    const unp = tq < RESULT.unpick ? 1 : 1 - M.sewProgress(tq, RESULT.unpick, RESULT.unpickDur);
    route.userData.setProgress(tq < CHECK.t0 ? M.sewProgress(tq, WORK.pathSew + i * 0.08, WORK.pathDur) : 1 - M.sewProgress(tq, CHECK.t0, 0.4));
    route2.userData.setProgress(Math.min(unp, M.sewProgress(tq, CHECK.pathSew + i * 0.06, CHECK.pathDur)));
    c.userData.text.userData.setProgress(M.sewProgress(tq, WORK.start + 0.15 + i * 0.12, WORK.end - WORK.start - 0.45));
    if (!holder.visible) continue;
    const tw = WORK.travel + i * WORK.stagger, tc = CHECK.travel + i * CHECK.stagger;
    let pos, rot = 0, s = 1, z = Z.travel;
    if (tq < tw) {
      const u = clamp((tq - born) / SPLIT.fanDur);
      pos = [lerp(splitEnd[0], tk.fan[0], ease.outBack(u, 1.6)), lerp(splitEnd[1] + 0.4, tk.fan[1], ease.outBack(u, 1.6))];
      s = Math.max(1e-3, M.flop(tq, born, { from: 1, stiffness: 160, damping: 10 }) * -1 + 1);
      rot = tk.rot * u;
    } else if (tq < tc) {
      const tr = M.travel(tq, tw, WORK.travelDur, route.userData.path);
      pos = [tr.p[0], tr.p[1]];
      rot = lerp(tk.rot, -tk.rot * 0.6, tr.u) + 0.18 * Math.sin(Math.PI * tr.u);
    } else if (tq < RESULT.gather) {
      const tr = M.travel(tq, tc, CHECK.travelDur, route2.userData.path);
      pos = [tr.p[0], tr.p[1]];
      rot = lerp(-tk.rot * 0.6, CHECK.stack[i][2], tr.u) + 0.15 * Math.sin(Math.PI * tr.u);
      z = Z.travel + i * 0.03 * tr.u;
    } else {
      const u = ease.inOutSine(clamp((tq - RESULT.gather) / RESULT.gatherDur));
      const st = CHECK.stack[i];
      pos = [lerp(st[0], R.pos[0], u), lerp(st[1], R.pos[1], u) + 0.6 * Math.sin(Math.PI * u)];
      rot = lerp(st[2], 0, u);
      s = lerp(1, 0.35, u);
      z = Z.travel + 0.4;
    }
    holder.position.set(pos[0], pos[1], z);
    holder.rotation.set(0, 0, rot);
    holder.scale.setScalar(s);
    jitter(holder, tq, 10 + i);
  }

  // ---- sparks while working ----
  for (const { ag, items, j } of sparkPools) {
    const sp = M.sparks(tq, WORK.start + 0.1 + j * 0.09, { n: WORK.sparks, seed: 40 + j, every: WORK.sparkEvery, spread: 1.0, up: 3.0, gravity: 6.8, life: 0.85 });
    items.forEach((o) => (o.visible = false));
    for (const s of sp) {
      const o = items[s.i];
      o.visible = s.s > 0.02 && tq < WORK.end + 0.6;
      o.position.set(ag.a.x + s.p[0] * 0.9 + (s.i % 2 ? 0.55 : -0.55), headY - 0.25 + s.p[1], Z.content + 0.6);
      o.rotation.z = s.r;
      o.scale.setScalar(Math.max(1e-3, s.s));
    }
  }

  // ---- beat 4: felt tick flops onto the result stack and is sewn down ----
  const tAng = flopAngle(tq, CHECK.tickFlop);
  show(tickHinge, tAng !== null && tq < RESULT.gather + RESULT.gatherDur);
  if (tAng !== null) {
    tickHinge.userData.setAngle(tAng);
    tick.userData.setProgress(M.sewProgress(tq, CHECK.tickSew, CHECK.tickSewDur));
    if (tq >= RESULT.gather) {
      const u = ease.inOutSine(clamp((tq - RESULT.gather) / RESULT.gatherDur));
      tickHinge.position.set(lerp(CHECK.tick.pos[0], R.pos[0], u), lerp(CHECK.tick.pos[1], R.pos[1], u) + CHECK.tick.size * 0.375 + 0.6 * Math.sin(Math.PI * u), Z.travel + 0.45);
      tickHinge.scale.setScalar(Math.max(1e-3, lerp(1, 0.3, u)));
    } else {
      tickHinge.position.set(CHECK.tick.pos[0], CHECK.tick.pos[1] + CHECK.tick.size * 0.375, Z.travel + 0.2);
      tickHinge.scale.setScalar(1);
    }
  }
  sewNeedle(tickNeedle, tick.userData.stitch, tq, CHECK.tickSew, CHECK.tickSewDur);

  // ---- beat 5: report + banner ----
  const rAng = flopAngle(tq, RESULT.reportFlop);
  show(reportHinge, rAng !== null);
  if (rAng !== null) reportHinge.userData.setAngle(rAng);
  const bAng = flopAngle(tq, RESULT.bannerFlop);
  show(bannerHinge, bAng !== null);
  if (bAng !== null) {
    bannerHinge.userData.setAngle(bAng);
    banner.userData.sew(1, M.sewProgress(tq, RESULT.bannerSew, RESULT.bannerSewDur));
  }
  sewNeedle(bannerNeedle, banner.userData.text, tq, RESULT.bannerSew, RESULT.bannerSewDur);

  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
