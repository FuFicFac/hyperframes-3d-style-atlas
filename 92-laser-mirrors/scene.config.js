// scene.config.js — 92-laser-mirrors: "How an AI agent routes a request" on an optics bench (style "laser-mirrors").
// Plain data + the style's pure beam planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The picture reads PLAN.beam(t); every ping, servo and chime in SCORE comes from PLAN.events().
import { STYLE_SPEC as S } from "./_atlas/styles/laser-mirrors/spec.js";
import { createPlan, benchVoices, mirrorEnds } from "./_atlas/styles/laser-mirrors/beamplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "92-laser-mirrors";
export const STYLE = "laser-mirrors";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "request", t: 0, dur: 2.3, label: "A request enters the agent" },
  { id: "search", t: 2.3, dur: 3.1, label: "Mirrors route it to SEARCH" },
  { id: "code", t: 5.4, dur: 3.1, label: "One small turn: now CODE" },
  { id: "answer", t: 8.5, dur: 2.7, label: "Turn again: the ANSWER" },
  { id: "all", t: 11.2, dur: 3.8, label: "Split: every tool at once" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one caption chip that never leaves: each text fades out over 0.15 s just before the next beat and the next fades in
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t : -0.2, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.17 : Infinity }));

// ---------------------------------------------------------------- the bench (2D top view: x right, y away from the viewer)
export const LAYOUT = {
  bounds: { x0: -6, x1: 6, y0: -3.6, y1: 3.6 },
  source: { p: [-4.5, -2.3], dir: [1, 0] },
  mirrors: [
    { id: "M1", p: [0, -2.3], half: 0.64, router: true },
    { id: "A1", p: [-2.59, 0.34], half: 0.62 },
    { id: "A2", p: [-5.0, -0.9], half: 0.58 },
    { id: "C1", p: [-0.95, 0.0], half: 0.55 },
    { id: "C2", p: [4.4, -1.2], half: 0.6 },
  ],
  targets: [
    { id: "SEARCH", p: [-4.8, 2.55], r: 0.46, color: "cyan" },
    { id: "ANSWER", p: [0, 2.55], r: 0.46, color: "green" },
    { id: "CODE", p: [4.8, 2.55], r: 0.46, color: "amber" },
  ],
  blockers: [{ id: "laser", p: [-5.25, -2.3], r: 0.7 }],
  splitter: { id: "SPLIT", p: [0, 0.6], r: 0.42, fan: [{ to: "SEARCH", color: "cyan" }, { to: "ANSWER", color: "green" }, { to: "CODE", color: "amber" }] },
  routes: { SEARCH: ["M1", "A1", "A2", "SEARCH"], CODE: ["M1", "C1", "C2", "CODE"], ANSWER: ["M1", "ANSWER"] },
  start: "SEARCH",
};
export const TIMES = {
  power: 0.2, launch: 0.6, speed: 4.6,
  turns: [
    { t: B.code.t + 0.3, dur: 1.7, mirror: "M1", route: "CODE" },
    { t: B.answer.t + 0.3, dur: 1.3, mirror: "M1", route: "ANSWER" },
  ],
  split: { t: B.all.t + 0.2, dur: 1.0, engage: S.splitter.engage, travel: 0.6 },
  end: DURATION,
};
export const PLAN = createPlan(LAYOUT, TIMES);
export const ROUTES = PLAN.verify();
for (const [k, v] of Object.entries(ROUTES)) if (!v.ok) throw new Error(`92-laser-mirrors: route ${k} ends ${v.got.join(">")}`);

// ---------------------------------------------------------------- camera: fitted shots, locked during holds
const W3 = (p, y = 0) => [p[0], y, -p[1]];
const partPts = (ids) => [
  ...LAYOUT.mirrors.filter((m) => !ids || ids.includes(m.id)).flatMap((m) => [-0.8, 0.8].flatMap((dx) => [-0.8, 0.8].flatMap((dy) => [W3([m.p[0] + dx, m.p[1] + dy], 0), W3([m.p[0] + dx, m.p[1] + dy], S.beamY + m.half + 0.15)]))),
  ...LAYOUT.targets.filter((g) => !ids || ids.includes(g.id)).flatMap((g) => [W3([g.p[0] - 1.25, g.p[1] - 0.6], 0), W3([g.p[0] + 1.25, g.p[1] - 0.6], 0), W3([g.p[0] - 1.25, g.p[1]], S.target.labelY + 0.42), W3([g.p[0] + 1.25, g.p[1]], S.target.labelY + 0.42)]),
];
const LASER = [W3([-6.35, -3.0], 0), W3([-6.35, -1.6], S.beamY + S.laser.height / 2 + 0.06), W3([-4.4, -3.0], 0)];
// the bench itself (top corners + back-rail tops): the wide shots frame the whole table, so a beam sweeping to a wall stays in
const BX = LAYOUT.bounds.x1 + S.bench.margin, BY0 = LAYOUT.bounds.y0 - S.bench.margin, BY1 = LAYOUT.bounds.y1 + S.bench.margin;
const BENCH = [W3([-BX, BY0], 0), W3([BX, BY0], 0), W3([-BX, BY1], S.bench.railH), W3([BX, BY1], S.bench.railH)];
const PARTS = [...partPts(), ...LASER];
const ALL = [...PARTS, ...BENCH];
const WIN = { x0: -0.95, x1: 0.95, y0: -0.7, y1: 0.86 };
const shot = (pts, az, el, fill = 1, extra = {}) => fitShot(pts, { azimuth: az, elevation: el, fov: S.camera.fov, window: WIN, fill, ...extra });
const K = (t, s, o = {}) => ({ t, pos: s.pos, target: s.target, fov: S.camera.fov, ...o });
const OPEN = shot([...LASER, ...partPts(["M1", "A1", "A2"])], -0.1, 0.8, 1);
const WIDE = shot(ALL, 0, 0.9, 1);
// the finale frames the parts only, so the bench overfills the frame edge to edge (its outer rim may crop)
const END = shot(PARTS, 0.12, 0.72, 1);
export const CAMERA = [
  K(0, OPEN),
  K(1.5, OPEN),
  K(3.6, WIDE, { ease: "inOutSine" }),
  K(B.all.t + 0.3, WIDE),
  K(B.all.t + 2.4, END, { ease: "inOutSine" }),
  K(DURATION, END),
];

// ---------------------------------------------------------------- framing gate: beam path, struck parts and name
// plates inside the safe area and clear of the caption chip for the whole clip
const CAP = pxRect(S.caption.x - 470, S.caption.y - 6, 940, S.caption.h + 12);
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FRAMING = (() => {
  const fails = [];
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    const pts = [];
    for (const br of PLAN.beam(t).branches) for (const p of br.pts) pts.push(["beam", W3(p, S.beamY)]);
    if (t > 3.6) for (const p of PARTS) pts.push(["part", p]);
    for (const [id, p] of pts) {
      const [x, y] = projectPoint(cam, p);
      if (Math.abs(x) > 0.97 || Math.abs(y) > 0.96) fails.push({ t, why: "edge", id, x: +x.toFixed(2), y: +y.toFixed(2) });
      else if (id === "beam" && x > CAP.x0 && x < CAP.x1 && y > CAP.y0 && y < CAP.y1) fails.push({ t, why: "caption", id });
    }
  }
  return { ok: fails.length === 0, count: fails.length, fails: fails.slice(0, 6) };
})();
if (!FRAMING.ok && !globalThis.process?.env?.LM_NOGATE) throw new Error(`92-laser-mirrors framing: ${JSON.stringify(FRAMING)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the hit plan + a hum and a quiet pad
export const EVENTS = PLAN.events();
const hum0 = TIMES.power + 0.1;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.5, release: 1.5, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  { t: hum0, type: "hum", dur: DURATION - hum0, hz: S.sound.hum.hz, gain: S.sound.hum.gain, seed: 9 },
  ...scoreFromEvents(EVENTS, benchVoices(S.sound), { seedBase: 192, pan: (e) => Math.max(-0.7, Math.min(0.7, (e.x ?? 0) / 7)) }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "beamplan.js: exact 2D ray tracer (two-sided mirror segments, absorbing target circles, a splitter that fans child beams); mirror aims are SOLVED per route, a turn eases one mirror between two solved aims and the beam is re-traced from scratch at every t; events/glow come from one 240 Hz scan of that pure function.",
  routes: ROUTES,
  routerTurnsDeg: PLAN.keys.M1.map((k) => +(((k.a1 - k.a0) * 180) / Math.PI).toFixed(1)),
  engage: +PLAN.tEngage.toFixed(3),
  events: EVENTS.length,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.fails)}`,
  mirrorEnds: Object.fromEntries(LAYOUT.mirrors.map((m) => [m.id, mirrorEnds({ ...m, angle: PLAN.base[m.id] }).map((p) => p.map((v) => +v.toFixed(2)))])),
};
