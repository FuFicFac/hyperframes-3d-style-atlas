// scene.js — 18-floating-screens: "How RAG works". Every frame is a pure function of t.
import * as THREE from "three";
import { createStage, clamp, smoothstep, toEase } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/floating-screens/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, QUESTION, ANSWER, DOCS, HITS, CHIPS, SOURCES, SIZE, TYPE_Q, TYPE_SEARCH, TYPE_A,
  SEND_AT, SENT_AT, SOURCES_AT, TRACKS, CHIP_OUT, CHIP_T, SNIPPET_U, RINGS, SEARCH, MODEL, LINKS, CURSOR, BOT_DOTS, HAZE, FOCUS, LABELS, ANSWER_ON,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const { props, choreo: C, palette: P } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
void objs;
const dpm = style.spec.ui.dpPerMetre;
const q = (x, k = 0.02) => Math.round(x / k) * k; // quantise animated face state (memo key)

// =============================================================== UI faces (topic code, style.ui painter)
const CHAT_IN = { x: 20, h: 50 };
function drawChat(ctx, W, H, s, U) {
  const top = U.chrome(ctx, W, H, { title: "Assistant", icon: "spark", right: "avatar" });
  const ix = CHAT_IN.x, iw = W - 40, ih = CHAT_IN.h, iy = H - ih - 18;
  U.roundRect(ctx, ix, iy, iw, ih, 16);
  ctx.fillStyle = P.surface2; ctx.fill();
  ctx.lineWidth = s.focus ? 1.8 : 1; ctx.strokeStyle = s.focus ? P.accentMid : P.line; ctx.stroke();
  if (s.q > 0) {
    const r = U.text(ctx, QUESTION, ix + 18, iy + ih / 2 - 11.5, { size: 17, weight: 500, count: s.q });
    if (s.caret) U.caret(ctx, r.caret[0] + 1, iy + 14, 22);
  } else {
    U.text(ctx, "Ask about your company docs…", ix + 18, iy + ih / 2 - 11.5, { size: 17, weight: 450, color: P.muted });
    if (s.caret) U.caret(ctx, ix + 15, iy + 14, 22);
  }
  U.button(ctx, ix + iw - 44, iy + 7, 36, 36, null, { icon: "up", pressed: s.pressed, radius: 12 });

  if (!s.sent) { // designed empty state
    U.avatar(ctx, W / 2, top + 62, 24, { gradient: [P.accent, "#9b8cff"], icon: "spark" });
    U.text(ctx, "How can I help?", W / 2, top + 96, { size: 25, weight: 700, align: "center" });
    U.text(ctx, "Answers from your company knowledge base", W / 2, top + 132, { size: 14, weight: 450, color: P.ink2, align: "center" });
    const sug = ["Shipping times", "Pricing tiers", "Onboarding"];
    ctx.font = U.font(600, 13);
    const ws = sug.map((t) => ctx.measureText(t).width + 2 * 11 + 16 + 5);
    let x = W / 2 - (ws.reduce((a, b) => a + b, 0) + 10 * (sug.length - 1)) / 2;
    sug.forEach((t, i) => { x += U.pill(ctx, x, top + 170, t, { fill: P.surface, border: P.line, color: P.ink2, icon: "chat", iconColor: P.muted, padX: 11 }) + 10; void i; });
    return;
  }
  // user bubble (pops in from its bottom-right corner)
  const by = top + 20, bh = 45, k = s.sent;
  ctx.save();
  ctx.translate(W - 22, by + bh); ctx.scale(k, k); ctx.translate(-(W - 22), -(by + bh));
  ctx.globalAlpha = clamp(k * 1.5);
  U.bubble(ctx, W - 22, by, 380, QUESTION, { side: "user", size: 18 });
  ctx.restore();
  ctx.globalAlpha = 1;
  if (s.bot === "none") return;
  const y0 = by + bh + 20;
  U.avatar(ctx, 38, y0 + 19, 16, { gradient: [P.accent, "#9b8cff"], icon: "spark" });
  if (s.bot === "dots") {
    U.roundRect(ctx, 64, y0, 74, 40, [17, 17, 17, 5]); ctx.fillStyle = P.surface2; ctx.fill();
    U.dots(ctx, 84, y0 + 21, s.dph, { r: 3.6 });
    return;
  }
  const b = U.bubble(ctx, 64, y0, W - 64 - 22, ANSWER, { side: "bot", size: 17, count: s.a, grow: true, caret: s.a < ANSWER.length });
  const py = y0 + b.h + 12;
  if (s.src[0] > 0) {
    ctx.globalAlpha = clamp(s.src[0] * 2);
    U.caps(ctx, "Sources", 68, py + 7, { size: 10.5 });
    ctx.globalAlpha = 1;
  }
  let px = 136;
  SOURCES.forEach((name, i) => {
    const u = s.src[i];
    if (u <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(u * 2);
    ctx.translate(px, py + 13); ctx.scale(0.7 + 0.3 * u, 0.7 + 0.3 * u); ctx.translate(-px, -(py + 13));
    const w = U.pill(ctx, px, py, name, { size: 13, icon: "doc", fill: P.accentSoft, border: P.accentMid, color: P.accentDark });
    ctx.restore();
    px += w + 10;
  });
}

function drawSearch(ctx, W, H, s, U) {
  U.searchBar(ctx, 16, 16, W - 32, 52, { query: QUESTION, count: s.q, caret: s.caret, placeholder: "Search your knowledge base", focus: s.q > 0 ? 1 : 0 });
  ctx.fillStyle = P.line; ctx.fillRect(16, 82, W - 32, 1);
  U.roundRect(ctx, 16, 96, 36, 36, 10); ctx.fillStyle = P.accentSoft; ctx.fill();
  U.icon(ctx, "book", 34, 114, 20, P.accent);
  U.text(ctx, "Knowledge base", 64, 94, { size: 15, weight: 650 });
  U.text(ctx, "7 documents · 41 pages", 64, 115, { size: 12, weight: 450, color: P.muted });
  if (s.done) {
    U.pill(ctx, W - 16 - 196, 101, "2 relevant passages", { size: 13, icon: "check", fill: "#e6f6ee", border: "#bfe8d3", color: "#0b7a50" });
  } else {
    U.caps(ctx, s.prog > 0 ? `Searching · ${Math.min(7, Math.floor(s.prog * 7 + 0.001))}/7` : "Ready", W - 16 - 170, 98, { size: 10.5 });
    U.progress(ctx, W - 16 - 170, 120, 170, s.prog, { h: 7 });
  }
  let tx = 16;
  for (const t of ["Policy", "Support", "Legal", "Product"]) tx += U.tag(ctx, tx, H - 30, t) + 6;
  U.text(ctx, "Semantic search", W - 16, H - 31, { size: 11.5, weight: 500, color: P.muted, align: "right" });
}

function drawDoc(i) {
  const D = DOCS[i];
  return (ctx, W, H, s, U) => U.docPage(ctx, W, H, {
    title: D.title, meta: D.meta, seed: D.seed, paragraphs: D.paragraphs,
    icon: D.hit ? "doc" : ["doc", "book", "globe", "lock", "clock"][i % 5],
    highlight: D.hit && s.u > 0 ? { para: D.hit.para, u: s.u, text: D.hit.text, size: 12 } : null,
  });
}

// prompt card layout (dp) — the chips land on these slots
const PR = { slotX: 22, slotY: [146, 204] };
function drawPrompt(ctx, W, H, s, U) {
  const top = U.chrome(ctx, W, H, { title: "Prompt", icon: "sliders", right: "RAG" });
  U.caps(ctx, "Question", 22, top + 16);
  U.text(ctx, QUESTION, 22, top + 32, { size: 19, weight: 650 });
  U.caps(ctx, "Context · 2 passages", 22, top + 76);
  const cw = SIZE.chip[0] * dpm, ch = SIZE.chip[1] * dpm;
  ctx.setLineDash([5, 5]); ctx.lineWidth = 1.4; ctx.strokeStyle = P.accentMid;
  for (const y of PR.slotY) { U.roundRect(ctx, PR.slotX, y, cw, ch, ch / 2); ctx.stroke(); }
  ctx.setLineDash([]);
  U.code(ctx, 22, H - 92, W - 44, { size: 12, lines: [
    [["system", "kw"], [": ", "plain"], ['"Answer only from the context."', "str"]],
    [["cite_sources", "fn"], [": ", "plain"], ["true", "num"]],
  ] });
}
function drawModel(ctx, W, H, s, U) {
  const cx = W / 2, cy = 112;
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 92);
  g.addColorStop(0, "rgba(91,77,245,0.18)"); g.addColorStop(1, "rgba(91,77,245,0)");
  ctx.fillStyle = g; ctx.fillRect(cx - 100, cy - 100, 200, 200);
  U.avatar(ctx, cx, cy, 44, { gradient: [P.accent, "#a597ff"], icon: "spark" });
  U.text(ctx, "Language model", cx, cy + 62, { size: 21, weight: 700, align: "center" });
  const st = ["Ready", "Reading context", "Generating answer", "Answer ready"][s.phase];
  ctx.font = U.font(500, 14);
  const tw = ctx.measureText(st).width + (s.phase === 2 ? 24 : 0);
  U.text(ctx, st, cx - tw / 2, cy + 94, { size: 14, weight: 500, color: s.phase === 3 ? "#0b7a50" : P.ink2 });
  if (s.phase === 2) U.dots(ctx, cx + tw / 2 - 14, cy + 105, s.dph, { r: 2.4, color: P.accent });
  U.progress(ctx, 40, H - 44, W - 80, s.p, { h: 7 });
}
function drawModelBack(ctx, W, H, s, U) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#6a5cff"); g.addColorStop(1, "#4335d6");
  ctx.fillStyle = g; U.roundRect(ctx, 0, 0, W, H, style.spec.ui.radius); ctx.fill();
  U.icon(ctx, "spark", W / 2, H / 2 - 12, 92, "#ffffff");
  U.caps(ctx, "Model", W / 2, H / 2 + 52, { size: 13, color: "rgba(255,255,255,0.85)", align: "center", tracking: 0.3 });
}

// =============================================================== build
const frosted = props.frosted({ w: SIZE.frosted[0], h: SIZE.frosted[1], name: "frosted" });
const chat = props.card({ w: SIZE.chat[0], h: SIZE.chat[1], name: "chat", draw: drawChat, state: { q: 0 } });
const search = props.card({ w: SIZE.search[0], h: SIZE.search[1], name: "search", draw: drawSearch, state: { q: 0, prog: 0 } });
const docs = DOCS.map((d, i) => props.card({ w: SIZE.doc[0], h: SIZE.doc[1], name: `doc${i}`, draw: drawDoc(i), state: { u: 0 } }));
const prompt = props.card({ w: SIZE.prompt[0], h: SIZE.prompt[1], name: "prompt", draw: drawPrompt });
const model = props.card({ w: SIZE.model[0], h: SIZE.model[1], name: "model", draw: drawModel, back: drawModelBack, backState: () => ({}), state: { phase: 0, p: 0, dph: 0 } });
const chips = CHIPS.map((c, i) => props.chip({ text: c.text, w: SIZE.chip[0], h: SIZE.chip[1], name: `chip${i}` }));
for (const o of [frosted, chat, search, ...docs, prompt, model, ...chips]) stage.scene.add(o);

const cur = props.cursor();
chat.userData.flip.add(cur);
const rings = props.pulseRings({ r: 0.36, count: 3, width: 0.03 });
rings.position.set(0, SIZE.model[1] / 2 - 112 / dpm, style.spec.card.thickness / 2 + 0.004);
model.userData.flip.add(rings);
const linkQ = props.connector({ dots: 1, name: "link-query" });
const linkA = props.connector({ dots: 1, name: "link-answer" });
const linkChips = CHIPS.map((_, i) => props.connector({ dots: 0, name: `link-chip${i}`, width: 2.4 }));
stage.scene.add(linkQ, linkA, ...linkChips);
const labels = LABELS.map((L) => ({ ...L, m: props.stepLabel(L.text, { number: L.number }) }));

// helpers ------------------------------------------------------------------------------------------------
const tmp = new THREE.Object3D();
const local = (pz, xyz) => { style.helpers.applyPose(tmp, pz); tmp.updateMatrixWorld(true); return tmp.localToWorld(new THREE.Vector3(...xyz)).toArray(); };
const cardPt = (g, xyz) => { g.updateMatrixWorld(true); return g.userData.flip.localToWorld(new THREE.Vector3(...xyz)).toArray(); };
// chip start = the highlighted snippet on its lifted doc, at the moment it detaches
const snippetY = SIZE.doc[1] / 2 - 161 / dpm;
const chipKeys = CHIPS.map((c, i) => {
  const dp = C.track(CHIP_T.detach[i], TRACKS.docs[c.doc]);
  const start = { p: local(dp, [0, snippetY, 0.06]), r: dp.r, s: dp.s * 0.62, o: 0 };
  return [{ t: 0, pose: start }, { t: CHIP_T.detach[i], pose: CHIP_OUT[i], spring: "settle" }];
});
const slotLocal = PR.slotY.map((y) => [
  (PR.slotX + (SIZE.chip[0] * dpm) / 2) / dpm - SIZE.prompt[0] / 2,
  SIZE.prompt[1] / 2 - (y + (SIZE.chip[1] * dpm) / 2) / dpm,
  style.spec.card.thickness / 2 + 0.035 / 2 + 0.012,
]);
const chatPts = { start: [2.3, -2.1, 0.7], input: [-0.3, -1.12, 0.32], send: [1.49, -1.13, 0.3], away: [2.9, -2.4, 0.9] };
const pulse = (t, start, dur) => (t > start && t < start + dur ? Math.sin(Math.PI * (t - start) / dur) : 0);

// =============================================================== frame
function renderAt(t) {
  // ---- poses
  for (const [g, key] of [[frosted, "frosted"], [chat, "chat"], [search, "search"], [prompt, "prompt"]]) g.userData.setPose(C.track(t, TRACKS[key]));
  const mp = C.track(t, TRACKS.model);
  const pulseK = 0.05 * pulse(t, MODEL.pulse, 0.5) + 0.025 * pulse(t, MODEL.pulse + 0.45, 0.5);
  model.userData.setPose({ ...mp, s: mp.s * (1 + pulseK) });
  model.userData.setFlip(t < MODEL.flip ? Math.PI : C.flipAngle(t, MODEL.flip, { from: Math.PI, to: Math.PI * 2, spring: "settle" }));
  docs.forEach((d, i) => d.userData.setPose(C.track(t, TRACKS.docs[i])));

  // ---- haze (receding cards fade toward the backdrop) + focus rings
  chat.userData.setHaze(C.ramp(t, HAZE.chat));
  search.userData.setHaze(C.ramp(t, HAZE.search));
  model.userData.setHaze(C.ramp(t, HAZE.model));
  docs.forEach((d, i) => {
    const hit = HITS.includes(i);
    d.userData.setHaze(hit ? 0 : C.ramp(t, HAZE.docs));
    const scan = 0.55 * pulse(t, RINGS.scan[i], 0.42);
    const hr = hit ? C.window01(t, RINGS.hit[HITS.indexOf(i)], RINGS.hitOff, { inDur: 0.3, outDur: 0.4 }) : 0;
    d.userData.setRing(Math.max(scan, hr));
  });

  // ---- chips: detach -> out pose -> fly along a bezier into their prompt slot -> ride the prompt into the model
  prompt.updateMatrixWorld(true);
  const chipLinks = [];
  chips.forEach((ch, i) => {
    const fly = C.progress(t, CHIP_T.fly[i], { ease: "inOutCubic", dur: CHIP_T.flyDur });
    const out = C.track(t, chipKeys[i]);
    const slot = cardPt(prompt, slotLocal[i]);
    const pp = C.track(t, TRACKS.prompt);
    const path = C.bezierPath(CHIP_OUT[i].p, slot, { bend: 0.3, lift: [0, 0.35, 0.7] });
    let pz = out;
    if (fly > 0) {
      const p = C.along(path, fly).p;
      pz = { p, r: out.r.map((v, k) => v + (pp.r[k] - v) * fly), s: out.s + (pp.s - out.s) * fly, o: Math.min(out.o, fly < 1 ? 1 : pp.o) };
    }
    ch.userData.setPose(pz);
    const draw = toEase("outCubic")(clamp((t - CHIP_T.fly[i] + 0.3) / 0.45));
    const lvl = (1 - smoothstep(CHIP_T.fly[i] + CHIP_T.flyDur - 0.2, CHIP_T.fly[i] + CHIP_T.flyDur + 0.05, t)) * (t > CHIP_T.fly[i] - 0.3 ? 1 : 0);
    chipLinks[i] = { a: CHIP_OUT[i].p, b: slot, progress: draw, level: lvl * 0.85, bend: 0.3, lift: [0, 0.35, 0.7], arrowOn: true };
  });

  // ---- UI faces (pure functions of t; redrawn only when the quantised state changes)
  const nq = C.typedCount(t, TYPE_Q);
  const sent = t >= SENT_AT ? q(clamp(C.progress(t, SENT_AT, { spring: "pop" }), 0, 1.3), 0.02) : 0;
  const pressed = Math.max(...CURSOR.clicks.map((c) => q(pulse(t, c, 0.3), 0.1)));
  const botDots = t >= BOT_DOTS && t < ANSWER_ON;
  chat.userData.setState({
    q: t < SENT_AT ? nq : 0,
    caret: t >= CURSOR.clicks[0] && t < SENT_AT + 0.2 && C.caretOn(t, { typingUntil: TYPE_Q.end }),
    focus: t >= CURSOR.clicks[0] && t < SENT_AT + 0.3,
    pressed, sent,
    bot: t >= ANSWER_ON ? "answer" : botDots ? "dots" : "none",
    dph: botDots ? q(t, 1 / 30) : 0,
    a: C.typedCount(t, TYPE_A),
    src: SOURCES_AT.map((s) => q(clamp(C.progress(t, s, { spring: "pop" }), 0, 1.25), 0.02)),
  });
  const sq = C.typedCount(t, TYPE_SEARCH);
  search.userData.setState({
    q: sq, caret: sq > 0 && t < SEARCH.done && C.caretOn(t, { typingUntil: TYPE_SEARCH.end }),
    prog: q(C.progress(t, SEARCH.progress[0], { ease: "inOutSine", dur: SEARCH.progress[1] - SEARCH.progress[0] }), 0.01),
    done: t >= SEARCH.done,
  });
  docs.forEach((d, i) => {
    const k = HITS.indexOf(i);
    d.userData.setState({ u: k < 0 ? 0 : q(C.progress(t, SNIPPET_U[k][0], { ease: "inOutCubic", dur: SNIPPET_U[k][1] - SNIPPET_U[k][0] }), 0.02) });
  });
  const phase = t >= MODEL.done ? 3 : t >= MODEL.pulse ? 2 : t >= MODEL.flip - 0.3 ? 1 : 0;
  model.userData.setState({ phase, p: q(phase === 3 ? 1 : phase === 2 ? clamp((t - MODEL.pulse) / (MODEL.done - MODEL.pulse)) * 0.9 : 0.1 * (phase === 1), 0.01), dph: phase === 2 ? q(t, 1 / 30) : 0 });
  rings.userData.set(t, MODEL.pulse, { period: 0.85, level: t < MODEL.done + 0.6 ? 1 : 0 });

  // ---- cursor (child of the chat card: it hovers 0.3 m above the face and shadows it)
  const ck = CURSOR.keys.map(([tk, k]) => [tk, chatPts[k]]);
  const click = Math.max(...CURSOR.clicks.map((c) => (t >= c && t < c + 0.55 ? (t - c) / 0.55 : 0)));
  cur.userData.set({ pos: C.ramp(t, ck, "inOutCubic"), click, presence: C.window01(t, CURSOR.on, CURSOR.off, { inDur: 0.25, outDur: 0.3 }) });

  // ---- camera, then connectors that need it
  const cam = rig.update(t);
  stage.scene.updateMatrixWorld(true);
  const qa = cardPt(chat, [SIZE.chat[0] / 2 - 0.05, 0.75, 0.05]), qb = cardPt(search, [-SIZE.search[0] / 2 + 0.05, 0.1, 0.05]);
  linkQ.userData.update({
    a: qa, b: qb, camera: stage.camera, bend: 0.3, lift: [0, 0.55, 0.5],
    progress: toEase("inOutCubic")(clamp((t - LINKS.query.draw[0]) / (LINKS.query.draw[1] - LINKS.query.draw[0]))),
    level: 1 - smoothstep(LINKS.query.off, LINKS.query.off + 0.4, t),
    dots: [clamp((t - LINKS.query.dot[0]) / (LINKS.query.dot[1] - LINKS.query.dot[0]))],
  });
  const aa = cardPt(model, [-SIZE.model[0] / 2 + 0.05, 0.1, 0.05]), ab = cardPt(chat, [SIZE.chat[0] / 2 - 0.05, 0.2, 0.05]);
  linkA.userData.update({
    a: aa, b: ab, camera: stage.camera, bend: 0.3, lift: [0, 0.5, 0.6],
    progress: toEase("inOutCubic")(clamp((t - LINKS.answer.draw[0]) / (LINKS.answer.draw[1] - LINKS.answer.draw[0]))),
    level: 1 - smoothstep(LINKS.answer.off, LINKS.answer.off + 0.45, t),
    dots: [clamp((t - LINKS.answer.dot[0]) / (LINKS.answer.dot[1] - LINKS.answer.dot[0]))],
  });

  linkChips.forEach((ln, i) => ln.userData.update({ ...chipLinks[i], camera: stage.camera })); // after the camera moved
  for (const L of labels) L.m.userData.update(t, { on: L.on, off: L.off });
  style.render(t, { focus: C.ramp(t, FOCUS) });
  void cam;
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
