// styles/art-deco/deco.js — the unfolding planner for "Art Deco". PURE: no THREE, no window, no DOM (Node-safe), so
// scene.config.js imports it for SCORE and framing, and style.js reads the very same plan for the picture.
//
// One plan, mirrored about x = 0:
//   doors     open(t) 0..1 — both leaves slide apart together (inOutCubic).
//   fan       a folding fan: every ray starts stacked on the centre line (90°). The fan's open angle A(t) sweeps
//             0 -> maxOff; ray pair j (j = 1..P, one ray each side) sits at 90° ± min(j * slot, A(t)), so the outermost
//             blade leads, drags the rest, and each ray stops in its slot — "ray by ray, outward from the centre".
//             settle_j = the time A(t) reaches j * slot (solved by bisection on the ease), one note per settle.
//   tiers     tier k telescopes up out of tier k-1 over [start_k, start_k + dur] (outBack, small overshoot); wings
//             (mirrored flanking blocks) rise with tiers 0 and 1. One chord per tier, roots rising up a scale.
//   spire     extends last (outCubic).
//   ornaments mirrored pairs arrive in order and click into place (outBack); one click per pair at its landing.
//   panel     the title panel's frame unfolds from the centre line outward, then the lettering fades in.
//   lights    two searchlights sweep in mirror image: angle(t) = tilt + sweep * sin(2 pi hz (t - on)), left = -right.
import { clamp, smoothstep, ease, toEase } from "../../kit/time.js";

const DEG = Math.PI / 180;

/** time in [t0, t0 + dur] where toEase(e)(u) first reaches f (0..1), by bisection (eases here are monotone) */
function reachTime(t0, dur, e, f) {
  const fn = toEase(e);
  if (f <= 0) return t0;
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (fn(m) >= f) hi = m; else lo = m; }
  return t0 + hi * dur;
}

/** outBack with a gentler overshoot than kit ease.outBack (s = 1.2 instead of 1.70158) */
export function settleEase(u, s = 1.2) {
  u = clamp(u);
  return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
}

/**
 * createPlan(o) -> plan
 *   o.doors     { start, dur }
 *   o.fan       { start, dur, rays (odd), spread (deg, total), ease }
 *   o.tiers     { start, step, dur, count, roots: [Hz], chords: [[semitones]] }
 *   o.spire     { start, dur }
 *   o.ornaments { ids: [string], start, step, dur }
 *   o.panel     { start, dur }
 *   o.lights    { on, tilt, sweep, hz }
 *   o.end       clip end (s)
 */
export function createPlan(o) {
  const end = o.end ?? 15;
  const doors = { start: o.doors.start, dur: o.doors.dur };
  doors.end = doors.start + doors.dur;

  // ---- fan
  const F = o.fan, nRays = F.rays, P = (nRays - 1) / 2, slot = (F.spread / (nRays - 1)) * DEG, maxOff = P * slot;
  const fanEase = F.ease ?? "inOutQuad";
  const rays = [];
  for (let i = 0; i < nRays; i++) {
    const j = Math.abs(i - P), side = Math.sign(i - P);
    rays.push({ i, j, side, final: Math.PI / 2 - side * j * slot, settle: +reachTime(F.start, F.dur, fanEase, (j * slot) / maxOff).toFixed(4) });
  }
  const fan = { start: F.start, dur: F.dur, end: F.start + F.dur, rays, slot, maxOff, pairs: P };
  const openAngle = (t) => maxOff * toEase(fanEase)(clamp((t - F.start) / F.dur));
  /** angle (rad, from +x, counter-clockwise) of ray i at t */
  const rayAngle = (i, t) => { const r = rays[i]; return Math.PI / 2 - r.side * Math.min(r.j * slot, openAngle(t)); };
  /** how open the fan is 0..1 */
  const fanOpen = (t) => (maxOff > 0 ? openAngle(t) / maxOff : 1);

  // ---- tiers
  const T = o.tiers;
  const tiers = [];
  for (let k = 0; k < T.count; k++) {
    const start = +(T.start + k * T.step).toFixed(4);
    tiers.push({ k, start, dur: T.dur, end: +(start + T.dur).toFixed(4), root: T.roots[k % T.roots.length], chord: T.chords[k % T.chords.length] });
  }
  /** tier rise 0..~1.05 (overshoots slightly, settles at 1); 0 before its start */
  const tierRise = (k, t) => { const tr = tiers[k]; return t < tr.start ? 0 : settleEase((t - tr.start) / tr.dur); };
  /** has tier k started (visibility) */
  const tierOn = (k, t) => t >= tiers[k].start;

  // ---- spire
  const spire = { start: o.spire.start, dur: o.spire.dur, end: o.spire.start + o.spire.dur };
  const spireU = (t) => ease.outCubic(clamp((t - spire.start) / spire.dur));

  // ---- ornaments
  const OR = o.ornaments;
  const ornaments = OR.ids.map((id, i) => {
    const start = +(OR.start + i * OR.step).toFixed(4);
    return { id, i, start, dur: OR.dur, land: +(start + OR.dur * 0.62).toFixed(4) };   // settleEase first reaches 1 at ~62 %
  });
  const ornamentU = (id, t) => {
    const or = ornaments.find((x) => x.id === id);
    if (!or || t < or.start) return 0;
    return settleEase((t - or.start) / or.dur, 1.6);
  };
  const ornamentOn = (id, t) => { const or = ornaments.find((x) => x.id === id); return !!or && t >= or.start; };

  // ---- panel
  const panel = { start: o.panel.start, dur: o.panel.dur };
  const panelFrame = (t) => ease.outCubic(clamp((t - panel.start) / panel.dur));
  const panelText = (t) => smoothstep(panel.start + panel.dur * 0.55, panel.start + panel.dur * 1.25, t);

  // ---- searchlights
  const L = o.lights;
  const lightLevel = (t) => smoothstep(L.on, L.on + 0.7, t);
  /** right beam's lean from vertical (rad, + = toward the centre line); the left beam is its mirror */
  const lightAngle = (t) => L.tilt + L.sweep * Math.sin(2 * Math.PI * L.hz * Math.max(0, t - L.on));

  /** sound events from the same plan */
  function events() {
    const ev = [];
    ev.push({ kind: "open", t: doors.start, dur: doors.dur });
    for (const r of rays) if (r.side > 0) ev.push({ kind: "ray", t: r.settle, j: r.j, pairs: P });   // one note per mirrored pair
    for (const tr of tiers) ev.push({ kind: "tier", t: tr.start, k: tr.k, root: tr.root, chord: tr.chord, land: tr.start + tr.dur * 0.55 });
    ev.push({ kind: "spire", t: spire.start, dur: spire.dur, end: spire.end });
    for (const or of ornaments) ev.push({ kind: "click", t: or.land, i: or.i, n: ornaments.length });
    ev.push({ kind: "title", t: panel.start, dur: end - panel.start });
    return ev.sort((a, b) => a.t - b.t);
  }

  return {
    end, doors, fan, tiers, spire, ornaments, panel, lights: L,
    doorOpen: (t) => ease.inOutCubic(clamp((t - doors.start) / doors.dur)),
    openAngle, rayAngle, fanOpen, tierRise, tierOn, spireU, ornamentU, ornamentOn, panelFrame, panelText,
    lightLevel, lightAngle, events,
  };
}

/** voices for kit scoreFromEvents, from spec.sound. Bed is added by the scene (one pad over the clip). */
export function decoVoices(SND) {
  const D5 = 587.33, PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  return {
    open: (e) => [
      { type: "rumble", dur: e.dur + 0.4, gain: SND.open.rumble, pitch: 0.8 },
      { type: "whoosh", dir: "in", dur: e.dur, q: 1.1, pitch: 0.7, gain: SND.open.whoosh },
      { type: "pad", bus: "sfx", root: 146.83, chord: [0, 7, 12], dur: 2.4, attack: 0.05, release: 1.4, brightness: 1500, gain: SND.open.gain },
    ],
    ray: (e) => [{ type: "marimba", hz: D5 * Math.pow(2, PENTA[(e.j - 1) % PENTA.length] / 12), decay: SND.ray.decay, dur: 0.8, gain: SND.ray.gain, mallet: 0.4 }],
    tier: (e) => [
      { type: "pad", bus: "sfx", root: e.root, chord: e.chord, dur: SND.tier.dur, attack: 0.03, release: 0.9, brightness: SND.tier.brightness, gain: SND.tier.gain },
      { type: "thud", gain: 0.3, pitch: 0.7, offset: e.land - e.t },
      { type: "marimba", hz: e.root * 2, notes: [0, e.chord[1], e.chord[2]], step: 0.07, decay: 0.3, dur: 0.9, gain: SND.tier.mallet },
    ],
    spire: (e) => [
      { type: "riser", dur: e.dur, gain: SND.spire.riser, pitch: 1.2 },
      { type: "chime", dur: 1.6, pitch: 1.0, gain: SND.spire.chime, offset: e.dur },
    ],
    click: (e) => [
      { type: "clack", gain: SND.click.gain, pitch: 1.1 + 0.08 * e.i },
      { type: "tick", gain: SND.click.gain * 0.6, pitch: 1.8 },
    ],
    title: (e) => [
      { type: "pad", bus: "sfx", root: 293.66, chord: [0, 4, 7, 12, 16], dur: Math.min(3.2, e.dur), attack: 0.06, release: 1.6, brightness: 2600, gain: SND.title.gain },
      { type: "chime", dur: 2.2, pitch: 1.0, gain: SND.title.chime, offset: 0.25 },
    ],
  };
}
