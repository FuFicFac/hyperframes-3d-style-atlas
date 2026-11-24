// scene.config.js — 114-barrier-grid: "The stripes hold the motion" (style "barrier-grid").
// Plain data + the style's pure barrier planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set the slide-in, the run, the single steps and the swing of the striped sheet; the
// picture (the sheet's x offset, its height, the print's shadow uniforms) and every sound cue read the same plan.
import { STYLE_SPEC as S } from "./_atlas/styles/barrier-grid/spec.js";
import { createBarrierPlan } from "./_atlas/styles/barrier-grid/barrier.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "114-barrier-grid";
export const STYLE = "barrier-grid";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "The stripes hold the motion";

// ---------------------------------------------------------------- beats (storyboard: times + labels as written)
export const BEATS = [
  { id: "scrambled", t: 0.0, dur: 2.8, label: "A scrambled print" },
  { id: "lay", t: 2.8, dur: 2.8, label: "Lay stripes over it" },
  { id: "slide", t: 5.6, dur: 3.4, label: "Slide them: it moves" },
  { id: "slit", t: 9.0, dur: 3.0, label: "Each slit shows one frame" },
  { id: "six", t: 12.0, dur: 3.0, label: "Six pictures in one print" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, inDur: i ? 0.22 : 0.2, outDur: 0.22 }));

// ---------------------------------------------------------------- the plan (from the beats)
const G = S.grid, W = G.strip, N = G.frames;
// slide-in: the sheet's left edge starts just past the frame's right edge (wide framing) and lands on frame 0
const OFF = Math.ceil((1.02 - (-S.card.picW / 2) - S.acetate.left) / W);
export const PLAN_CFG = {
  N, w: W, gap: G.gap,
  slide: { t0: B.lay.t + 0.15, t1: B.lay.t + 1.45, from: OFF, to: 0, ease: "inOutSine" },
  drop: { t0: B.lay.t + 1.3, t1: B.lay.t + 1.6, hover: 0.022 },
  run: { t0: B.slide.t + 0.15, up: 1.0, cruise: 1.6, down: 0.6, strips: 30 },
  steps: { times: [0.65, 1.0, 1.35, 1.7, 2.05].map((x) => B.slit.t + x), dur: 0.13, ease: "inOutCubic" },
  swing: { t0: B.six.t + 0.2, t1: B.six.t + 2.8, amp: 18 },          // 3 flaps forward, 3 back, cosine-smooth
  tick: { maxRate: S.sound.tick.maxRate },
};
export const PLAN = createBarrierPlan(PLAN_CFG);

// ---------------------------------------------------------------- camera: head-on long lens (fov 12°) except the macro
const fov = S.camera.fov, TAN = Math.tan((fov * Math.PI) / 360);
/** head-on key: frame height H (m) centred on (x, y) */
const head = (t, x, y, H, ease) => ({ t, pos: [x, y, H / 2 / TAN], target: [x, y, 0], fov, ...(ease ? { ease } : {}) });
/** oblique macro key: camera below the sheet's bottom edge looking up the card at elevation `el`, distance d, yaw */
const macro = (t, x, y, d, el, yaw, ease) => ({
  t, pos: [x - d * Math.cos(el) * Math.sin(yaw), y - d * Math.cos(el) * Math.cos(yaw), d * Math.sin(el)], target: [x, y, 0], fov, ...(ease ? { ease } : {}),
});
export const WIDE = { x: 0, y: -0.08, H: 1.1 };                     // beats 2-3: the whole card
export const TIGHT = { x: 0, y: -0.035, H: 0.93 };                  // beat 5: the bird fills the frame (≈ 90 % of its width)
const M = { x: 0.52, y: -0.392, el: 0.47, yaw: 0 };
const DIVE = { t0: B.slit.t - 0.15, t1: B.slit.t + 0.5 };            // beat 4's camera move lands within ~0.5 s of the label
const BACK = { t0: B.slit.t + 2.5, t1: B.six.t + 0.1 };
export const CAMERA = [
  head(0, 0.5, -0.19, 0.42),
  head(B.lay.t + 0.55, 0.54, -0.11, 0.42, "linear"),                // beat 1: drift over the scrambled wing fan (head out of frame)
  head(B.lay.t + 1.55, WIDE.x, WIDE.y, WIDE.H, "inOutCubic"),       // pull back behind the sheet's leading edge: the whole
                                                                    // scrambled print is never seen before the sheet covers it
  head(DIVE.t0, WIDE.x, WIDE.y, WIDE.H),                            // beats 2-3: hold (no parallax, no bitrate)
  macro(DIVE.t1, M.x, M.y, 0.5, M.el, M.yaw, "outCubic"),           // beat 4: quick dive to the oblique macro at the sheet's edge
  macro(BACK.t0, M.x + 0.01, M.y, 0.46, M.el, M.yaw, "linear"),     //   (slow push while it steps one strip at a time)
  head(BACK.t1, TIGHT.x, TIGHT.y, TIGHT.H, "inOutCubic"),           // beat 5: head-on, tighter on the bird
  head(DURATION, TIGHT.x, TIGHT.y, TIGHT.H),
];

// ---------------------------------------------------------------- framing gate (head-on shots)
// the print (picture + index comb) must stay clear of the caption chip and inside the safe area; strips ≥ 6.5 px
const CAP = S.caption;
const CAPR = pxRect(CAP.cx - 560, CAP.y + 6, 1120, CAP.h);
const PIC = S.card;
// key content: beats 2-3 = the bird's reach down to the bottom of the index comb; beat 5 = the bird itself (its six
// frames span x ±0.734, y −0.353..0.376 m: measured from barrier.birdFrames)
const BIRD = { x: 0.74, y0: -0.36, y1: 0.38 };
const PRINT_PTS = [[-PIC.picW / 2, BIRD.y1, 0], [PIC.picW / 2, BIRD.y1, 0], [-PIC.picW / 2, PIC.band.y0, 0], [PIC.picW / 2, PIC.band.y0, 0]];
const BIRD_PTS = [[-BIRD.x, BIRD.y1, 0], [BIRD.x, BIRD.y1, 0], [-BIRD.x, BIRD.y0, 0], [BIRD.x, BIRD.y0, 0]];
function frameCheck() {
  let capOverlap = -9, minStripPx = 99, maxEdge = 0;
  const holds = [[B.lay.t + 1.55, DIVE.t0, PRINT_PTS], [B.six.t + 0.15, DURATION, BIRD_PTS]];
  for (const [t0, t1, PTS] of holds) {
    for (let t = t0; t <= t1 + 1e-9; t += 1 / 30) {
      const cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov });
      const pts = PTS.map((p) => projectPoint(cam, p));
      const yMin = Math.min(...pts.map((p) => p[1]));
      capOverlap = Math.max(capOverlap, yMin < CAPR.y1 ? CAPR.y1 - yMin : -(yMin - CAPR.y1));
      for (const p of pts) maxEdge = Math.max(maxEdge, Math.abs(p[0]), Math.abs(p[1]));
      const a = projectPoint(cam, [0, 0, 0]), b = projectPoint(cam, [W, 0, 0]);
      minStripPx = Math.min(minStripPx, ((b[0] - a[0]) / 2) * 1920);
    }
  }
  return { capOverlap: +capOverlap.toFixed(3), maxEdge: +maxEdge.toFixed(3), minStripPx: +minStripPx.toFixed(2) };
}
export const FRAMING = frameCheck();
if ((FRAMING.capOverlap > 0 || FRAMING.maxEdge > 0.92 || FRAMING.minStripPx < 6.5) && !globalThis.process?.env?.BG_NOGATE) {
  throw new Error(`114-barrier-grid framing: ${JSON.stringify(FRAMING)}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const VOICES = {
  tick: (e) => [{ type: "marimba", hz: SND.tick.notes[e.frame], decay: SND.tick.decay, mallet: 0.35, dur: 0.5, gain: SND.tick.gain, pan: e.dir * 0.12 }],
  step: () => [{ type: "click", pitch: 0.7, gain: SND.step.gain }, { type: "rustle", dur: 0.16, density: 0.2, pitch: 2.4, gain: SND.slide.gain * 0.5 }],
  hiss: (e) => [{ type: "rustle", dur: e.dur, density: 0.14, pitch: 2.3, gain: SND.slide.gain * Math.min(1, Math.max(0.18, e.rate / 16)) }],
  slide: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.2, q: 0.9, pitch: 1.25, pan: -0.25, gain: SND.whoosh.gain }],
  land: () => [{ type: "thud", pitch: 1.35, dur: 0.35, gain: SND.land.gain }, { type: "paper", dur: 0.3, density: 0.4, gain: SND.land.gain * 0.45 }],
  settle: () => [{ type: "chime", dur: 1.6, pitch: 1.0, gain: SND.settle.gain }],
  cam: (e) => [{ type: "whoosh", dir: e.dir, dur: e.dur, q: 1.1, pitch: 0.8, gain: SND.cam.gain }],
};
export const EVENTS = [
  ...PLAN.events({ end: DURATION }),
  { t: DIVE.t0, kind: "cam", dir: "in", dur: DIVE.t1 - DIVE.t0 + 0.15 },
  { t: BACK.t0, kind: "cam", dir: "out", dur: BACK.t1 - BACK.t0 },
].sort((a, b) => a.t - b.t);
export const SCORE = [
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12, 16], dur: DURATION, attack: 0.6, release: 1.5, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 7 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 411 }),
];
export const DUCK = [];

export const NOTES = {
  title: TITLE,
  mechanism: "barrier.js: six frames of an original bird (front view, uneven capsules + circles + triangles); the print shader shows frame (i mod 6) in strip i, analytic AA; the barrier is a real plane 4 mm above with opaque 5 strips / clear 1; its x offset (strips) is the only animated input — offset k uncovers strips i ≡ k (mod 6) = frame k.",
  offsets: { landed: PLAN.bases.base1, afterRun: PLAN.bases.base2, afterSteps: PLAN.bases.base3, slideFrom: OFF },
  ticks: EVENTS.filter((e) => e.kind === "tick").length,
  planFingerprint: PLAN.fingerprint(),
  framing: FRAMING,
};
