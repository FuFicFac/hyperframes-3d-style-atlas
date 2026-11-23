// scene.config.js — 97-string-art: "A neural network draws curves with straight lines" (style "string-art").
// Plain data + the style's pure winding planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every pluck and tick in SCORE comes from the same plan the picture reads.
// The analogy: each unit of a ReLU network contributes one straight piece; many straight pieces together bend into a
// smooth curve. Here each thread is one straight unit; the curve is the envelope of many.
import { STYLE_SPEC as S } from "./_atlas/styles/string-art/spec.js";
import { layoutBoard, fanSegs, ringSegs, createPlan, stringVoices } from "./_atlas/styles/string-art/winding.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "97-string-art";
export const STYLE = "string-art";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "one", t: 0, dur: 2.8, label: "One unit: a straight line", thread: "threadA" },
  { id: "few", t: 2.8, dur: 2.8, label: "A few units: a rough bend", thread: "threadA" },
  { id: "many", t: 5.6, dur: 2.8, label: "Many units: a smooth curve", thread: "threadA" },
  { id: "straight", t: 8.4, dur: 2.8, label: "Yet every line is straight", thread: "threadC" },
  { id: "anything", t: 11.2, dur: 3.8, label: "Enough lines draw anything", thread: "threadC" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, thread: S.palette[b.thread], on: i ? b.t - 0.02 : -0.3, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.28 : Infinity }));
// (each label fades out over 0.25 s just before its beat ends and the next fades in over 0.25 s: the tag is never empty for long)

// ---------------------------------------------------------------- the one plan
export const LAYOUT = layoutBoard(S.layout);
const ALL = Array.from({ length: 23 }, (_, i) => i + 1), ALL_D = Array.from({ length: 17 }, (_, i) => i + 1);
// the story fan grows OUTWARD from its middle thread, so the region it covers (and the follow camera) only ever widens
const outward = (list) => [...list].sort((p, q) => Math.abs(p - 12) - Math.abs(q - 12) || p - q);
const FIRST = [12], FEW = outward([3, 6, 9, 15, 18, 21]);
const REST = outward(ALL.filter((i) => !FIRST.includes(i) && !FEW.includes(i)));
export const RUNS = [
  { id: "a-one", winder: "A", color: "threadA", t0: B.one.t + 0.25, t1: B.one.t + 1.75, ease: "inOutSine", segs: fanSegs(LAYOUT, "fanA", FIRST) },
  { id: "a-few", winder: "A", color: "threadA", t0: B.few.t + 0.15, t1: B.few.t + 2.3, ease: "inOutSine", hopW: 0.6, segs: fanSegs(LAYOUT, "fanA", FEW) },
  { id: "a-many", winder: "A", color: "threadA", t0: B.many.t + 0.1, t1: B.many.t + 2.3, ease: "inOutQuad", hopW: 0.35, segs: fanSegs(LAYOUT, "fanA", REST) },
  { id: "c-ring", winder: "C", color: "threadC", t0: B.straight.t + 0.15, t1: B.anything.t + 1.7, ease: "linear", hopW: 0.5, segs: ringSegs(LAYOUT, "ring") },
  { id: "b-fan", winder: "B", color: "threadB", t0: B.straight.t + 2.0, t1: B.anything.t + 1.9, ease: "linear", segs: fanSegs(LAYOUT, "fanB", ALL, { mode: "zigzag" }) },
  { id: "d-fan", winder: "D", color: "threadD", t0: B.anything.t - 0.1, t1: B.anything.t + 2.0, ease: "linear", segs: fanSegs(LAYOUT, "fanD", ALL_D, { mode: "zigzag" }) },
];
export const PLAN = createPlan(S, LAYOUT, RUNS);

// ---------------------------------------------------------------- camera keys from fitted shots (azimuth 0 = camera on +Z)
const bw = S.board.w / 2, bh = S.board.h / 2, NZ = S.nail.height;
const box = (x0, y0, x1, y1, z1 = NZ) => [[x0, y0, 0], [x1, y0, 0], [x0, y1, 0], [x1, y1, 0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]];
const FULL = { x0: -1, x1: 1, y0: -1, y1: 1 };
const shot = (pts, az, el, fill = 1, extra = {}) => fitShot(pts, { azimuth: az, elevation: el, fov: S.camera.fov, window: FULL, fill, ...extra });
const K = (t, s, o = {}) => ({ t, pos: s.pos, target: s.target, fov: S.camera.fov, ...o });
// beats 1-3: a FOLLOW camera on the story fan. Every 0.25 s, fit the box of every yellow thread that has started (or starts
// within the next 0.6 s) plus a nail margin; the box only grows, so the camera only widens as threads are added.
const fanBox = (t) => {
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const th of PLAN.threads) if (th.winder === "A" && th.t0 <= t + 0.6) for (const p of [th.a, th.b]) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  const m = 0.14;
  return box(x0 - m, y0 - m, Math.min(bw - 0.02, x1 + m), y1 + m);
};
// a fitted shot is centred on its box; slide it (camera and target together) so the frame never runs past the board edge
const keepOnBoard = (sh, margin = 0.07) => {
  const hh = sh.dist * Math.tan((S.camera.fov * Math.PI) / 360), hw = hh * (16 / 9);
  const ex = bw + S.board.frame - margin, ey = bh + S.board.frame - margin;
  const tx = Math.max(-ex + hw, Math.min(ex - hw, sh.target[0])), ty = Math.max(-ey + hh, Math.min(ey - hh, sh.target[1]));
  const dx = tx - sh.target[0], dy = ty - sh.target[1];
  return { ...sh, pos: [sh.pos[0] + dx, sh.pos[1] + dy, sh.pos[2]], target: [tx, ty, sh.target[2]] };
};
const FOLLOW = (() => {
  const out = [];
  for (let t = 0; t <= B.straight.t - 0.1 + 1e-9; t += 0.25) {
    const u = t / (B.straight.t - 0.1);
    const sh = keepOnBoard(shot(fanBox(t), 0.05 - 0.04 * u, 0.04 - 0.02 * u, 1));
    out.push({ t: +t.toFixed(3), pos: sh.pos, target: sh.target });
  }
  let cur = out;
  for (let pass = 0; pass < 2; pass++) {
    const sm = (k, i) => cur[i][k].map((_, j) => (cur[Math.max(0, i - 1)][k][j] + 2 * cur[i][k][j] + cur[Math.min(cur.length - 1, i + 1)][k][j]) / 4);
    cur = cur.map((o, i) => ({ t: o.t, pos: sm("pos", i), target: sm("target", i) }));
  }
  return cur.map((o) => ({ ...o, fov: S.camera.fov, ease: "linear" }));
})();
const CLOSE0 = shot(box(-0.85, -0.28, 0.15, 0.72), 0.6, 0.24, 1.25, { window: { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.9 } });
const CLOSE1 = shot(box(-1.05, -0.5, 0.0, 0.5), 0.5, 0.2, 1.2, { window: { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.9 } });
const WIDE = shot(box(-bw, -bh, bw, bh, 0), 0, 0, 0.99);
export const CAMERA = [
  ...FOLLOW,
  K(B.straight.t + 1.0, CLOSE0, { ease: "inOutCubic" }),
  K(B.anything.t + 0.1, CLOSE1, { ease: "linear" }),
  K(B.anything.t + 2.4, WIDE, { ease: "inOutCubic" }),
  K(DURATION, WIDE, { ease: "linear" }),
];

// ---------------------------------------------------------------- framing gate
// (1) the board covers the whole frame at every sampled t (no wall showing past its edges);
// (2) the needle of the story being told is in the safe area and clear of the caption tag: A while the fan is wound
//     (beats 1-3), C and B once the pull-back has revealed them (C's needle roams the whole ring during the close-up);
// reports how much of the frame width the wound threads span.
const CAP = pxRect(S.caption.x, S.caption.y, 760, S.caption.h + 8);
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
const BOARD = [[-bw - S.board.frame, -bh - S.board.frame], [bw + S.board.frame, -bh - S.board.frame], [bw + S.board.frame, bh + S.board.frame], [-bw - S.board.frame, bh + S.board.frame]];
const inside = (poly, x, y) => poly.every((p, i) => { const q = poly[(i + 1) % poly.length]; return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) >= 0; });
const STORY = [{ w: "A", from: 0, to: B.straight.t }, ...["B", "C", "D"].map((w) => ({ w, from: B.anything.t + 2.4, to: DURATION }))];
export const FRAMING = (() => {
  const fails = []; let minFill = { v: 9, t: 0 };
  for (let f = 0; f <= DURATION * 15; f++) {
    const t = f / 15, cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    const quad = BOARD.map((p) => projectPoint(cam, [p[0], p[1], 0]));
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (!inside(quad, cx, cy)) { fails.push({ t: +t.toFixed(2), why: "wall", corner: [cx, cy] }); break; }
    const capOn = LABELS.some((L) => t >= L.on - 0.3 && t <= L.off + 0.3);
    for (const st of STORY) {
      if (t < st.from || t > st.to) continue;
      const tip = PLAN.tipAt(st.w, t);
      if (!tip || tip.alpha < 0.5) continue;
      const [x, y] = projectPoint(cam, tip.p);
      if (Math.abs(x) > 0.94 || Math.abs(y) > 0.94) fails.push({ t: +t.toFixed(2), why: "edge", w: st.w, x: +x.toFixed(2), y: +y.toFixed(2) });
      else if (capOn && x > CAP.x0 && x < CAP.x1 && y > CAP.y0 && y < CAP.y1) fails.push({ t: +t.toFixed(2), why: "caption", w: st.w });
    }
    let x0 = 9, x1 = -9;
    for (const th of PLAN.threads) if (PLAN.threadAt(th.id, t) > 0) for (const p of [th.a, th.b]) {
      const [x] = projectPoint(cam, [p[0], p[1], th.z]);
      x0 = Math.min(x0, Math.max(-1, x)); x1 = Math.max(x1, Math.min(1, x));
    }
    if (x1 > x0 && t > 2) { const fill = (x1 - x0) / 2; if (fill < minFill.v) minFill = { v: +fill.toFixed(3), t: +t.toFixed(2) }; }
  }
  const spans = {};
  for (const f of fails) { const k = f.why + (f.w ? ":" + f.w : "") + (f.corner ? ":" + f.corner : ""); const s = spans[k] ?? (spans[k] = [f.t, f.t]); s[1] = f.t; }
  return { ok: fails.length === 0, fails: fails.slice(0, 4), count: fails.length, spans, minFill };
})();
const ENFORCE = true;
if (ENFORCE && !FRAMING.ok && !globalThis.process?.env?.SA_NOGATE) throw new Error(`97-string-art framing: ${JSON.stringify(FRAMING)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a warm bed + the reveal whoosh
export const EVENTS = PLAN.events();
const lastEnd = Math.max(...RUNS.map((r) => r.t1));
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.8, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  { t: B.anything.t + 0.05, type: "whoosh", dir: "out", dur: 2.0, gain: S.sound.whoosh, seed: 9 },
  { t: lastEnd + 0.05, type: "chime", dur: 1.8, notes: 4, gain: S.sound.done.gain, seed: 13 },
  ...scoreFromEvents(EVENTS, stringVoices(S.sound), { seedBase: 197, pan: (e) => (e.x != null ? Math.max(-0.6, Math.min(0.6, e.x / 4.5)) : 0) }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "winding.js: nails laid out from two parabola fans (two nail rows from a corner) and a ring of 73; thread i of a fan joins row-V nail n-i to row-U nail i; the ring figure is chords m -> 2m mod 73, split into 8 closed doubling cycles of 9, each wound as one continuous thread. Each run spreads its segments over [t0, t1] by length (constant needle speed) plus hop costs; threads stack by start time.",
  threads: PLAN.n,
  nails: LAYOUT.nails.length,
  framing: FRAMING.ok ? `ok (narrowest thread span ${FRAMING.minFill.v} of frame width at ${FRAMING.minFill.t}s)` : `FAILS ${JSON.stringify(FRAMING.fails)}`,
};
