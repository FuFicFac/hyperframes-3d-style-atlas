// scene.config.js — 99-pottery-wheel: "Fine-tuning: the same model, reshaped for a job" (style "pottery-wheel").
// Plain data + the style's pure throw planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The camera keys are fitted to the clay's planned profile, and every squelch, hum glide and brush
// stroke in SCORE comes from the same plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/pottery-wheel/spec.js";
import { createPlan, wheelVoices } from "./_atlas/styles/pottery-wheel/throw.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "99-pottery-wheel";
export const STYLE = "pottery-wheel";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "lump", t: 0, dur: 2.6, label: "One lump of clay" },
  { id: "form", t: 2.6, dur: 3.1, label: "Training gives it a form" },
  { id: "bowl", t: 5.7, dur: 2.9, label: "Fine-tune it for one job" },
  { id: "vase", t: 8.6, dur: 3.2, label: "Or reshape it for another" },
  { id: "glaze", t: 11.8, dur: 3.2, label: "Same clay. New purpose." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.2 : Infinity }));

// ---------------------------------------------------------------- the one plan
const SEGMENTS = [
  { t0: B.form.t, t1: B.form.t + 1.3, from: "lump", to: "cone" },                                   // centred + coned up
  { t0: B.form.t + 1.45, t1: B.form.t + 2.85, from: "cone", to: "cylinder" },                       // opened + pulled
  { t0: B.bowl.t + 0.15, t1: B.bowl.t + 1.95, from: "cylinder", to: "bowl" },                       // pressed out into a bowl
  { t0: B.vase.t + 0.1, t1: B.vase.t + 2.9, from: "bowl", to: "vase", via: "collar", stagger: 0.3 }, // the wow: one continuous move
];
export const TIMES = {
  segments: SEGMENTS,
  centre: { t0: 0.9, t1: B.form.t + 0.4 },
  tool: [
    { t0: 0.9, t1: SEGMENTS[1].t1 },
    { t0: SEGMENTS[2].t0, t1: SEGMENTS[2].t1 },
    { t0: SEGMENTS[3].t0, t1: SEGMENTS[3].t1 },
  ],
  rings: { t0: SEGMENTS[1].t0, t1: SEGMENTS[1].t1 },
  glaze: { t0: B.glaze.t + 0.35, t1: B.glaze.t + 2.2 },
  slow: { t0: B.glaze.t, t1: DURATION - 0.4 },
  duration: DURATION,
};
export const PLAN = createPlan(S, TIMES);

// ---------------------------------------------------------------- camera: shots fitted to the planned clay
const AZ = 0.42;          // the rib sits on the camera-right silhouette (spec.tool.azimuth = -AZ)
const clayPts = (t, n = 14) => {
  const e = PLAN.extent(t), out = [];
  for (const [r, y] of e.pts) for (let k = 0; k < n; k++) { const a = (k / n) * 2 * Math.PI; out.push([r * Math.cos(a), y, r * Math.sin(a)]); }
  return out;
};
const span = (t0, t1, dt = 0.1) => { const o = []; for (let t = t0; t <= t1 + 1e-9; t += dt) o.push(...clayPts(t, 10)); return o; };
const WIN = { x0: -0.9, x1: 0.9, y0: -0.6, y1: 0.9 };   // the caption chip sits bottom-left over the splash pan
const shot = (pts, el, fill, align = [0.18, 0]) => fitShot(pts, { azimuth: AZ, elevation: el, fov: S.camera.fov, window: WIN, fill, align });
// elevation per moment: a little above the lump, level-ish for the pulled cylinder, high to look into the bowl, low and heroic for the vase
const ELEV = [[0, 0.32], [B.form.t, 0.3], [B.form.t + 2.9, 0.22], [B.bowl.t + 0.1, 0.24], [B.bowl.t + 2.0, 0.5], [B.vase.t, 0.5], [B.vase.t + 3.0, 0.14], [DURATION, 0.12]];
const elevAt = (t) => { for (let k = 1; k < ELEV.length; k++) if (t <= ELEV[k][0]) { const [t0, e0] = ELEV[k - 1], [t1, e1] = ELEV[k]; const u = (t - t0) / (t1 - t0 || 1); return e0 + (e1 - e0) * u * u * (3 - 2 * u); } return ELEV[ELEV.length - 1][1]; };
const K = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), pos: s.pos, target: s.target, fov: S.camera.fov, ease });
// held shots during holds; followed shots (every 0.3 s, fitted to the clay over the next ~0.5 s) while it changes
const follow = (t0, t1, fill, step = 0.3, ahead = 0.5) => {
  const out = [];
  for (let t = t0; t <= t1 + 1e-9; t += step) out.push({ t, s: shot(span(Math.max(0, t - 0.1), Math.min(DURATION, t + ahead)), elevAt(t), fill) });
  const sm = (k, i) => out[i].s[k].map((_, j) => (out[Math.max(0, i - 1)].s[k][j] + 2 * out[i].s[k][j] + out[Math.min(out.length - 1, i + 1)].s[k][j]) / 4);
  return out.map((o, i) => ({ t: +o.t.toFixed(3), pos: sm("pos", i), target: sm("target", i), fov: S.camera.fov, ease: "linear" }));
};
const FILL = 0.9;
const LUMP = shot(span(0, 2.6, 0.05), 0.32, FILL);
const FORM = follow(B.form.t, SEGMENTS[1].t1 + 0.3, FILL, 0.25, 0.25);
const BOWL = follow(SEGMENTS[2].t0 - 0.1, SEGMENTS[2].t1 + 0.3, FILL);
const VASE = follow(SEGMENTS[3].t0 - 0.1, SEGMENTS[3].t1 + 0.3, FILL);
const END0 = shot(clayPts(B.glaze.t), 0.13, 0.92);
const END1 = shot(clayPts(DURATION), 0.12, 0.95);
export const CAMERA = [
  K(0, LUMP),
  K(B.form.t - 0.2, LUMP),
  ...FORM.map((k, i) => (i ? k : { ...k, ease: "inOutSine" })),
  ...BOWL.map((k, i) => (i ? k : { ...k, ease: "inOutSine" })),
  ...VASE.map((k, i) => (i ? k : { ...k, ease: "inOutSine" })),
  K(B.glaze.t + 0.2, END0),
  K(DURATION, END1, "inOutSine"),
];

// ---------------------------------------------------------------- framing gate: every clay point in the safe area, clear of
// the caption chip while a label is up; reports the smallest height fill (clay height / frame height).
const CAP = pxRect(S.caption.x, S.caption.y, 760, S.caption.h + 10);
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FRAMING = (() => {
  const fails = []; let minFill = { v: 9, t: 0 };
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    const capOn = LABELS.some((L) => t >= L.on - 0.3 && t <= L.off + 0.3);
    let y0 = 9, y1 = -9;
    for (const p of clayPts(t, 16)) {
      const [x, y] = projectPoint(cam, p);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (Math.abs(x) > 0.95 || Math.abs(y) > 0.95) fails.push({ t: +t.toFixed(2), why: "edge", x: +x.toFixed(2), y: +y.toFixed(2) });
      else if (capOn && x > CAP.x0 && x < CAP.x1 && y > CAP.y0 && y < CAP.y1) fails.push({ t: +t.toFixed(2), why: "caption", x: +x.toFixed(2), y: +y.toFixed(2) });
    }
    const fill = (y1 - y0) / 2;
    if (fill < minFill.v) minFill = { v: +fill.toFixed(3), t: +t.toFixed(2) };
  }
  return { ok: fails.length === 0, fails: fails.slice(0, 6), count: fails.length, minFill };
})();
if (!FRAMING.ok && !globalThis.process?.env?.POT_NOGATE) throw new Error(`99-pottery-wheel framing: ${JSON.stringify(FRAMING)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a warm bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.5, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, wheelVoices(S.sound), { seedBase: 199, pan: (e) => e.pan ?? 0 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "throw.js: the clay is one lathe surface; its profile is interpolated per point between named key profiles (lump, cone, cylinder, bowl, collar, vase), staggered bottom-up like a pull, the bowl->vase move a quadratic Bezier through the collar, then rescaled radially every frame so the volume stays constant. Spin angle closed form; centring wobble damps; rib at the velocity-weighted centroid of the profile; glaze a helix front.",
  volume: S.profile.volume,
  framing: FRAMING.ok ? `ok (smallest height fill ${FRAMING.minFill.v} at ${FRAMING.minFill.t}s)` : `FAILS ${JSON.stringify(FRAMING.fails)}`,
};
