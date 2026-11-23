// styles/constructivist-poster/construct.js — the build planner for "Constructivist Poster". Pure functions: no THREE,
// no window, no DOM (imports only kit/time.js), so scene.config.js can import it in Node for SCORE and the browser
// imports it for the picture. ONE list of pieces (each with a start, a hard-stop "hit" time and a weight) drives
// both: the picture reads strike()/rollAt() for every piece, and events() turns the same list into swishes, hits,
// ratchet ticks and camera servos. Retime a piece and its sound moves with it.
import { clamp, ease, smoothstep } from "../../kit/time.js";

/**
 * strike(t, start, hit, feel) -> 0..1(+) : the percussive move. Before start 0; start..hit a hard ease-in
 * (u^power, fastest at the very end); at hit it stops dead and rings a tiny damped overshoot:
 * 1 + over * sin(2 pi dt / period) * exp(-dt / decay). Closed form in t; nothing carried between frames.
 */
export function strike(t, start, hit, feel = {}) {
  const { power = 3, over = 0.035, period = 0.16, decay = 0.07 } = feel;
  if (t <= start) return 0;
  if (t < hit) return Math.pow((t - start) / Math.max(1e-6, hit - start), power);
  const dt = t - hit;
  return 1 + over * Math.sin((2 * Math.PI * dt) / period) * Math.exp(-dt / decay);
}

/** jolt(t, hit, amp, feel) -> signed decaying shake after a hit (0 before it): for the recoil of whatever got struck */
export function jolt(t, hit, amp = 1, feel = {}) {
  const { period = 0.11, decay = 0.06 } = feel;
  if (t < hit) return 0;
  const dt = t - hit;
  return amp * Math.sin((2 * Math.PI * dt) / period) * Math.exp(-dt / decay);
}

/**
 * createPlan({ pieces, cams, feel, end }) -> plan
 *   pieces: [{ id, kind: "slide"|"drop"|"hinge"|"roll"|"throw"|"ray", start, hit, weight = 1, roll?: { dist, r, spokes } }]
 *   cams:   [{ id, t0, t1, kind: "tilt"|"snap" }]  camera moves (servo sound); the rig keys live in scene.config.js
 *   plan.u(id, t)       percussive progress of a piece (strike)
 *   plan.raw(id, t)     0..1 eased progress without the overshoot (for things that must not pass their target)
 *   plan.rollAt(id, t)  { s, angle } distance travelled along the rail and the wheel's turn (angle = -s / r)
 *   plan.shake(t)       { x, y } frame shake summed over every heavy hit (weight >= 1)
 *   plan.events()       sound events (see constructVoices)
 */
export function createPlan(o) {
  const feel = { power: 3, over: 0.035, period: 0.16, decay: 0.07, ...(o.feel ?? {}) };
  const pieces = o.pieces.map((p) => ({ weight: 1, ...p }));
  const byId = Object.fromEntries(pieces.map((p) => [p.id, p]));
  const cams = o.cams ?? [];
  const get = (id) => {
    const p = byId[id];
    if (!p) throw new Error(`construct: no piece "${id}"`);
    return p;
  };
  const u = (id, t) => { const p = get(id); return strike(t, p.start, p.hit, p.feel ?? feel); };
  const raw = (id, t) => { const p = get(id); return t <= p.start ? 0 : t >= p.hit ? 1 : Math.pow((t - p.start) / (p.hit - p.start), (p.feel ?? feel).power); };

  // roll: inQuad distance (a wheel shoved from rest, stopped dead by whatever it hits)
  const rollS = (p, t) => p.roll.dist * ease.inQuad(clamp((t - p.start) / (p.hit - p.start)));
  const rollAt = (id, t) => {
    const p = get(id);
    const s = rollS(p, t);
    return { s, angle: -s / p.roll.r };
  };

  const shake = (t) => {
    let x = 0, y = 0;
    for (const p of pieces) {
      if (p.weight < 1 || p.kind === "roll") continue;
      const a = (p.shake ?? 0.03) * p.weight;
      x += jolt(t, p.hit, a, { period: 0.09, decay: 0.05 }) * (p.shakeDir?.[0] ?? 0.6);
      y += jolt(t, p.hit + 0.012, a, { period: 0.1, decay: 0.05 }) * (p.shakeDir?.[1] ?? -0.8);
    }
    return { x, y };
  };

  /** ratchet tick times for a roll: every time the wheel turns another 1/spokes of a revolution */
  function rollTicks(p) {
    const step = (2 * Math.PI * p.roll.r) / (p.roll.spokes ?? 4);
    const out = [];
    for (let k = 1; k * step < p.roll.dist; k++) {
      // s = dist * x^2, x = (t - start) / (hit - start)  ->  t = start + (hit - start) * sqrt(s / dist)
      out.push(p.start + (p.hit - p.start) * Math.sqrt((k * step) / p.roll.dist));
    }
    return out;
  }

  function events() {
    const ev = [];
    pieces.forEach((p, i) => {
      const travel = p.hit - p.start;
      if (p.kind === "roll") {
        rollTicks(p).forEach((t, k) => ev.push({ kind: "tick", t, k, weight: p.weight, piece: p.id }));
        ev.push({ kind: "stop", t: p.hit, weight: p.weight, piece: p.id, i });
        return;
      }
      if (p.kind === "throw" || p.kind === "ray") {
        ev.push({ kind: "throw", t: p.start, dur: travel, weight: p.weight, piece: p.id, i });
        ev.push({ kind: "land", t: p.hit, weight: p.weight, piece: p.id, i });
        return;
      }
      ev.push({ kind: "swish", t: Math.max(0, p.start - 0.05), dur: travel + 0.06, weight: p.weight, piece: p.id, i });
      ev.push({ kind: p.kind === "hinge" ? "hingeHit" : "hit", t: p.hit, weight: p.weight, piece: p.id, i });
    });
    for (const c of cams) ev.push({ kind: c.kind === "snap" ? "snap" : "tilt", t: c.t0, dur: c.t1 - c.t0, end: c.t1, piece: c.id });
    if (o.end) ev.push({ kind: "bed", t: 0, dur: o.end });
    return ev.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
  }

  return { pieces, byId, cams, feel, u, raw, rollAt, rollTicks, shake, events, smoothstep };
}

/**
 * constructVoices(SND) -> voices for kit scoreFromEvents. Mechanical, in the picture's rhythm:
 *   swish  = a short "in" whoosh that peaks into the hit (the fast ease-in, heard)
 *   hit    = impact (low body) + clack (the dead stop); heavier pieces sit lower and louder
 *   hingeHit = clack + thud, a door slamming flat
 *   tick   = ratchet click per spoke while a wheel rolls; stop = clack + small thud
 *   throw / land = whoosh out of the cone, clack + pop when the word lands
 *   tilt / snap  = servo glide for the camera; snap ends in a clack
 *   bed    = a low dark pad + hum under everything (sets the mean level)
 */
export function constructVoices(SND) {
  const H = SND.hit, W = SND.swish;
  return {
    swish: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.12, Math.min(0.7, e.dur)), q: W.q, pitch: W.pitch / Math.sqrt(e.weight), gain: W.gain * Math.min(1.3, e.weight) }],
    hit: (e) => [
      { type: "impact", dur: H.dur, pitch: H.pitch / Math.pow(e.weight, 0.5), gain: H.gain * Math.min(1.4, e.weight) },
      { type: "clack", dur: 0.12, pitch: H.clackPitch / Math.pow(e.weight, 0.3), gain: H.clack },
    ],
    hingeHit: (e) => [
      { type: "clack", dur: 0.14, pitch: H.clackPitch * 0.8, gain: H.clack * 1.1 },
      { type: "thud", dur: 0.35, pitch: H.pitch * 1.2, gain: H.gain * 0.8 * e.weight },
    ],
    tick: (e) => [{ type: "click", dur: 0.03, pitch: SND.tick.pitch * (1 + 0.06 * (e.k % 2)), gain: SND.tick.gain }],
    stop: (e) => [
      { type: "clack", dur: 0.12, pitch: H.clackPitch * 1.15, gain: H.clack * 0.9 },
      { type: "thud", dur: 0.25, pitch: H.pitch * 1.6, gain: H.gain * 0.45 },
    ],
    throw: (e) => [{ type: "whoosh", dir: "out", dur: Math.max(0.25, e.dur + 0.15), q: 1.2, pitch: SND.throw.pitch, gain: SND.throw.gain }],
    land: (e) => [
      { type: "clack", dur: 0.1, pitch: H.clackPitch * 1.3, gain: H.clack * 0.8 },
      { type: "pop", dur: 0.12, pitch: 0.7, gain: SND.throw.pop },
    ],
    tilt: (e) => [{ type: "servo", dur: e.dur + 0.1, hz: SND.servo.hz, hz2: SND.servo.hz2, grit: 0.25, gain: SND.servo.gain }],
    snap: (e) => [
      { type: "servo", dur: e.dur + 0.05, hz: SND.servo.hz2 * 1.2, hz2: SND.servo.hz * 0.8, grit: 0.3, gain: SND.servo.gain * 0.8 },
      { type: "impact", t: e.end, dur: H.dur, pitch: H.pitch * 0.9, gain: H.gain },
      { type: "clack", t: e.end, dur: 0.12, pitch: H.clackPitch, gain: H.clack },
    ],
    bed: (e) => [
      { type: "pad", dur: e.dur, root: SND.bed.root, chord: SND.bed.chord, attack: 0.4, release: 1.2, brightness: SND.bed.brightness, gain: SND.bed.gain },
      { type: "hum", dur: e.dur, hz: SND.bed.humHz, gain: SND.bed.hum },
    ],
  };
}
