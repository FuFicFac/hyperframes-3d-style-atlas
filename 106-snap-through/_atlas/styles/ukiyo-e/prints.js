// styles/ukiyo-e/prints.js — the printing-session planner for "Ukiyo-e". PURE: no THREE, no window, no DOM (Node-safe),
// so scene.config.js imports it for SCORE, and style.js reads the very same plan for the picture.
//
// A print is made in PASSES. One pass = one carved block:
//   enter  [t0, contact]       the block glides in from the off-stage pose to a hinge along the sheet's FAR edge, then
//                              swings down (angle `from` -> 0), closing like a lid onto the sheet (slam ease)
//   press  [contact, open0]    flat on the sheet; optional baren rubbing strokes over its back (the key block)
//   open   [open0, open1]      it swings back up (0 -> `to`) — the new layer is revealed under it, near edge first
//   exit   [open1, exit1]      it rises and slides away out of the top of frame
// The layer a pass prints becomes visible at `contact` (it is hidden under the block until it opens).
// A seal pass is the same idea with a small stone seal coming straight down. A final "parallax" window lifts the
// printed layers off the paper in proportion to their order (closed form).
// Every function is a closed form of t; nothing is accumulated.
import { clamp, smoothstep, ease } from "../../kit/time.js";

/** default timing (seconds / radians / metres); spec.timing overrides */
export const TIMING = { close: 0.7, glide: 0.42, hold: 0.15, open: 0.5, exit: 0.3, from: 1.45, to: 1.75, exitRise: 3.0, exitBack: 1.2 };

/**
 * createPrintPlan({ passes, timing, seal, parallax, end }) -> plan
 *   passes: [{ id, layer, t, baren?: { strokes, dur }, note }]   (t = when the block starts to swing down)
 *   seal:   { id, layer, t, drop = .4, hold = .15, up = .45 } | null
 *   parallax: { t, dur, lift }  — layer k of N rises lift * (k + 1) / N (key on top rises most)
 */
export function createPrintPlan(o) {
  const T = { ...TIMING, ...(o.timing ?? {}) };
  const end = o.end ?? 15;
  const passes = o.passes.map((p, i) => {
    const contact = p.t + T.close;
    const barenDur = p.baren ? p.baren.dur : 0;
    const open0 = contact + T.hold + barenDur;
    const open1 = open0 + T.open;
    const exit1 = open1 + T.exit;
    const strokes = [];
    if (p.baren) {
      const n = p.baren.strokes, d = barenDur / n;
      for (let k = 0; k < n; k++) strokes.push({ k, t0: contact + T.hold * 0.5 + k * d, t1: contact + T.hold * 0.5 + (k + 1) * d });
    }
    return { ...p, i, t0: p.t, contact, open0, open1, exit1, baren0: p.baren ? contact + T.hold * 0.5 : Infinity, baren1: p.baren ? open0 - T.hold * 0.5 : -Infinity, strokes };
  });
  const seal = o.seal ? (() => {
    const s = { drop: 0.4, hold: 0.15, up: 0.45, ...o.seal };
    return { ...s, t0: s.t, contact: s.t + s.drop, up0: s.t + s.drop + s.hold, up1: s.t + s.drop + s.hold + s.up };
  })() : null;
  const par = o.parallax ?? { t: Infinity, dur: 1, lift: 0 };
  const layers = passes.map((p) => p.layer).concat(seal ? [seal.layer] : []);

  /** block pose for pass i at t: { visible, angle (rad, about the far-edge hinge, 0 = flat), y (m above rest), z (m, - = away) } */
  function blockPose(i, t) {
    const p = passes[i];
    if (!p || t < p.t0 || t > p.exit1) return { visible: false, angle: T.from, y: 0, z: 0, press: 0 };
    if (t < p.contact) {
      // phase A (first `glide` of the close): glide in from the off-stage pose (where blocks exit to) to the hinge,
      // standing at `from`; phase B: swing down onto the sheet (slam ease)
      const u = (t - p.t0) / T.close, g = T.glide;
      if (u < g) {
        const a = ease.outCubic(u / g);
        return { visible: true, angle: T.to + (T.from - T.to) * a, y: (T.exitRise + 0.02) * (1 - a), z: -T.exitBack * (1 - a), press: 0 };
      }
      return { visible: true, angle: T.from * (1 - ease.inCubic((u - g) / (1 - g))), y: 0, z: 0, press: 0 };
    }
    if (t < p.open0) {
      const k = (t - p.contact) / 0.12; // a short squash right after contact
      return { visible: true, angle: 0, y: 0, z: 0, press: k < 1 ? Math.sin(Math.PI * k) : 0 };
    }
    if (t < p.open1) {
      const u = (t - p.open0) / T.open;
      return { visible: true, angle: T.to * ease.inOutSine(u), y: 0.02 * smoothstep(0, 0.3, u), z: 0, press: 0 };
    }
    const u = (t - p.open1) / T.exit;
    return { visible: true, angle: T.to, y: 0.02 + T.exitRise * ease.inCubic(u), z: -T.exitBack * ease.inCubic(u), press: 0 };
  }

  /** printed amount of each layer at t (0/1 step at contact) keyed by layer id */
  function printed(t) {
    const out = {};
    for (const p of passes) out[p.layer] = t >= p.contact ? 1 : 0;
    if (seal) out[seal.layer] = t >= seal.contact ? 1 : 0;
    return out;
  }

  /** baren at t: { on, u, v (sheet coords -0.5..0.5, v + = near), press 0..1, k } — rubs in overlapping loops across the block */
  function barenAt(t) {
    for (const p of passes) {
      if (!p.baren) continue;
      const enter0 = p.baren0 - 0.25, leave1 = p.baren1 + 0.3;
      if (t < enter0 || t > leave1) continue;
      const n = p.strokes.length, span = p.baren1 - p.baren0;
      const s = clamp((t - p.baren0) / span);            // 0..1 across all strokes
      const k = Math.min(n - 1, Math.floor(s * n)), ks = s * n - k;
      // zig-zag rows across the width, each stroke a loop-de-loop going left->right or right->left
      const dir = k % 2 ? -1 : 1;
      const row = n > 1 ? k / (n - 1) : 0.5;
      const uu = dir * (ease.inOutSine(ks) - 0.5) * 0.72 + 0.06 * Math.sin(ks * Math.PI * 6);
      const vv = (row - 0.5) * 0.55 + 0.07 * Math.cos(ks * Math.PI * 6);
      const inn = smoothstep(enter0, p.baren0, t), out = 1 - smoothstep(p.baren1, leave1, t);
      const press = Math.min(inn, out);
      // enter from the right edge / leave to the right edge
      const startU = 0.75, startV = 0.1;
      return { on: true, u: lerpN(startU, uu, Math.min(inn, out)), v: lerpN(startV, vv, Math.min(inn, out)), press, k, rise: 1 - press };
    }
    return { on: false, u: 0, v: 0, press: 0, k: -1, rise: 1 };
  }

  /** seal stamp pose at t: { visible, y (m above contact), press } */
  function sealPose(t) {
    if (!seal || t < seal.t0 - 0.0001 || t > seal.up1) return { visible: false, y: 1, press: 0 };
    if (t < seal.contact) return { visible: true, y: 0.9 * (1 - ease.inCubic((t - seal.t0) / seal.drop)), press: 0 };
    if (t < seal.up0) return { visible: true, y: 0, press: 1 };
    return { visible: true, y: 1.2 * ease.inCubic((t - seal.up0) / seal.up), press: 0 };
  }

  /** layer lift (m) at t for a layer of stacking rank k (0 = lowest) of n */
  function liftAt(t, k, n = layers.length) {
    return par.lift * ((k + 1) / n) * ease.inOutSine(clamp((t - par.t) / par.dur));
  }

  /** which pass is "current" at t (for labels/debug): last pass started */
  function passAt(t) { let c = null; for (const p of passes) if (t >= p.t0) c = p; return c; }

  /** sound events from the same schedule */
  function events() {
    const ev = [];
    for (const p of passes) {
      ev.push({ kind: "swing", t: p.t0, dur: T.close, i: p.i });
      ev.push({ kind: "contact", t: p.contact, i: p.i, key: !!p.baren });
      for (const s of p.strokes) ev.push({ kind: "rub", t: s.t0, dur: s.t1 - s.t0, k: s.k });
      ev.push({ kind: "peel", t: p.open0, dur: T.open, i: p.i });
      ev.push({ kind: "reveal", t: p.open0 + T.open * 0.45, note: p.note ?? p.i, i: p.i });
    }
    if (seal) {
      ev.push({ kind: "sealDrop", t: seal.t0, dur: seal.drop });
      ev.push({ kind: "seal", t: seal.contact });
    }
    ev.push({ kind: "bed", t: 0, dur: end });
    return ev.sort((a, b) => a.t - b.t);
  }

  return { timing: T, passes, seal, parallax: par, layers, end, blockPose, printed, barenAt, sealPose, liftAt, passAt, events };
}
const lerpN = (a, b, k) => a + (b - a) * k;

/** semitone offsets of a Japanese "in" (miyako-bushi) scale over two octaves: reveal notes climb it */
export const IN_SCALE = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20];

/** voices for kit scoreFromEvents, from spec.sound */
export function printVoices(SND) {
  const hz = (n) => SND.reveal.root * Math.pow(2, IN_SCALE[n % IN_SCALE.length] / 12);
  return {
    bed: (e) => [{ type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: e.dur, attack: 1.2, release: 2.5, brightness: SND.bed.brightness, gain: SND.bed.gain }],
    swing: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.1, offset: -0.05, q: 1.2, pitch: 0.7, gain: SND.swing.gain }],
    contact: (e) => [
      { type: "thud", dur: 0.4, pitch: 0.9, gain: SND.contact.thud * (e.key ? 1.15 : 1) },
      { type: "clack", dur: 0.1, pitch: 0.55, gain: SND.contact.clack },
    ],
    rub: (e) => [{ type: "rustle", dur: e.dur * 1.05, density: SND.rub.density, pitch: 0.8, gain: SND.rub.gain }],
    peel: (e) => [{ type: "paper", dur: e.dur, density: 0.3, gain: SND.peel.gain }],
    reveal: (e) => [{ type: "pluck", hz: hz(e.note), dur: 1.6, decay: 1.4, bright: 0.55, gain: SND.reveal.gain }],
    sealDrop: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.05, q: 1.6, pitch: 1.1, gain: SND.swing.gain * 0.7 }],
    seal: () => [
      { type: "thud", dur: 0.35, pitch: 1.3, gain: SND.seal.thud },
      { type: "chime", dur: 2.2, pitch: 0.75, notes: 4, gain: SND.seal.chime },
      { type: "pluck", hz: SND.reveal.root * 2, notes: [0, 7, 12], step: 0.11, dur: 2.2, decay: 1.8, bright: 0.5, gain: SND.reveal.gain * 0.9 },
    ],
  };
}
