// styles/film-projector/reel.js — the projection plan. PURE: no THREE, no window, no DOM; imports only kit/time.js
// and the plain-data spec, so scene.config.js imports it too and the SCORE (sprocket clatter at the simulated film
// frame rate, the 2-pop, a piano-like sting per intertitle card, flaps of the loose tail, motor hum and run-down)
// comes from exactly the schedule the picture reads.
//
//   planFilm({ leader: { t, dur }, beats: [{ id, t, dur, title, picture }], tail: { t, dur }, ride, cardDelay })
//     -> plan = {
//          fps, pitch, shots:[{ kind: "wide"|"strip"|"screen", t, dur, id, beat?, from?, to?, side? }],
//          strip:[{ kind: "start"|"leader"|"picture"|"end", n?, beat? }] (film-strip frame layout),
//          events:[{ t, kind, ... }], times:{ ... }, beats,
//          filmUsed(t), frameAt(t), lamp(t), motor(t), programme(t), wear(f, mode), reels(t), stripFrame(k)
//        }
//   projectorVoices(plan) -> voices for kit/schedule.scoreFromEvents;  projectorBed(plan, duration) -> bed SCORE.
import { clamp, hash01, ease, smoothstep } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";

const R = STYLE_SPEC.reel, W = STYLE_SPEC.wear, L = STYLE_SPEC.leader, ST = STYLE_SPEC.strip, SND = STYLE_SPEC.sound;

/**
 * planFilm(o) -> plan. o = {
 *   leader: { t = 0, dur = 2, numbers = [3, 2, 1] }   countdown leader (start mark, then one number per `leader.per` s)
 *   beats: [{ id, t, dur, title, picture }]            each beat = strip ride (`ride` s) then the screen with its card
 *   tail: { t, dur, endCard = .55, runout = .17 }      end card -> clear runout -> white tail-out -> lamp off
 *   ride = .75, cardDelay = .2 (s after the cut to the screen)
 * }
 */
export function planFilm(o) {
  const fps = W.fps, v = R.speed, pitch = v / fps;
  const leader = { t: 0, dur: 2, numbers: [3, 2, 1], ...o.leader };
  const beats = o.beats;
  const ride = o.ride ?? 0.75, cardDelay = o.cardDelay ?? 0.2;
  const tailIn = { endCard: 1.5, runout: 0.15, ...o.tail };
  const tail = { ...tailIn, dur: tailIn.dur ?? 2 };
  const per = L.per;
  const lead0 = Math.max(0, leader.dur - leader.numbers.length * per);

  // ---- tail timing: end card -> runout (clear leader) -> film leaves the gate (white) -> lamp off + motor run-down
  const tEnd = tail.t;
  const tRunout = tEnd + tail.endCard;
  const tEmpty = tRunout + tail.runout;                      // tail leaves the gate, feed reel empty
  const tLampOff = tail.t + tail.dur - R.lampOffDur - 0.05;   // lamp dies just before the clip ends
  const tStop = tLampOff;                                      // motor switched off with the lamp
  const Ts = R.stopDur;

  // ---- film transport: metres of film run (closed form; constant speed, then a linear run-down)
  const filmUsed = (t) => {
    if (t <= 0) return 0;
    if (t <= tStop) return v * t;
    const u = Math.min(t - tStop, Ts);
    return v * tStop + v * (u - (u * u) / (2 * Ts));
  };
  const motor = (t) => (t < tStop ? 1 : clamp(1 - (t - tStop) / Ts));
  const frameAt = (t) => Math.floor(filmUsed(t) / pitch + 1e-9);
  const timeOfFilm = (s) => { // inverse of filmUsed (for clicks at each film frame)
    if (s <= v * tStop) return s / v;
    const ds = (s - v * tStop) / v;
    const disc = Ts * Ts - 2 * Ts * ds;
    return disc < 0 ? Infinity : tStop + Ts - Math.sqrt(disc);
  };

  // ---- lamp: quick strike at the start, dies at tLampOff
  const lamp = (t) => smoothstep(0, R.lampRamp, t) * (1 - ease.inQuad(clamp((t - tLampOff) / R.lampOffDur)));

  // ---- reels: pack radius from film metres (area conservation), angle = integral of v/r (closed form)
  const sEmpty = filmUsed(tEmpty);
  const kk = (R.packR0 ** 2 - R.hubR ** 2) / sEmpty;     // r^2 change per metre
  const feedAngle0 = (s) => (2 / kk) * (R.packR0 - Math.sqrt(Math.max(R.hubR ** 2, R.packR0 ** 2 - kk * s)));
  const takeAngle0 = (s) => (2 / kk) * (Math.sqrt(R.hubR ** 2 + kk * s) - R.hubR);
  const reels = (t) => {
    const s = filmUsed(t);
    const feedR = Math.sqrt(Math.max(R.hubR ** 2, R.packR0 ** 2 - kk * Math.min(s, sEmpty)));
    const takeR = Math.sqrt(R.hubR ** 2 + kk * Math.min(s, sEmpty));
    let feed = feedAngle0(Math.min(s, sEmpty));
    if (t > tEmpty) { // empty feed reel coasts down (no film pulling it)
      const w0 = v / R.hubR, lam = R.coastDecay;
      feed += (w0 / lam) * (1 - Math.exp(-lam * (t - tEmpty)));
    }
    let take = takeAngle0(Math.min(s, sEmpty));
    // once the tail is free nothing holds the take-up back: its slip clutch spins it up to spindle speed
    if (s > sEmpty) take += ((s - sEmpty) / v) * R.spindle;
    return { feed: { angle: feed, r: feedR }, takeup: { angle: take, r: takeR }, film: s, loose: t > tEmpty };
  };

  // ---- film-strip layout (what the camera rides along) and the shots
  const strip = [{ kind: "start" }, ...leader.numbers.map((n) => ({ kind: "leader", n })), ...beats.map((b, i) => ({ kind: "picture", beat: i })), { kind: "end" }];
  const stripIndex = (kind, key) => strip.findIndex((f) => f.kind === kind && (key == null || f.n === key || f.beat === key));
  const shots = [{ kind: "wide", id: "open", t: leader.t, dur: leader.dur }];
  beats.forEach((b, i) => {
    const from = i === 0 ? stripIndex("leader", leader.numbers[leader.numbers.length - 1]) : stripIndex("picture", i - 1);
    shots.push({ kind: "strip", id: `${b.id}-strip`, t: b.t, dur: ride, beat: i, from, to: stripIndex("picture", i) });
    shots.push({ kind: "screen", id: `${b.id}-screen`, t: b.t + ride, dur: b.dur - ride, beat: i, side: i % 2 ? -1 : 1 });
  });
  shots.push({ kind: "wide", id: "tail", t: tail.t, dur: tail.dur });

  // card times: the first film frame at/after cut + cardDelay (so the sting lands on the frame that shows it)
  const frameTime = (f) => timeOfFilm(f * pitch);
  const firstFrameAfter = (t) => Math.ceil(filmUsed(t) / pitch - 1e-9);
  const cards = beats.map((b) => { const f = firstFrameAfter(b.t + ride + cardDelay); return { f, t: frameTime(f) }; });
  const beatFrame0 = beats.map((b) => firstFrameAfter(b.t));
  const endCardF = firstFrameAfter(tEnd);

  // ---- what the projector shows at t (plain state; the style draws it, the canvas is keyed by this JSON)
  const programme = (t) => {
    const f = frameAt(t);
    if (t < leader.t + lead0) return { kind: "start" };
    if (t < leader.t + leader.dur) {
      const k = Math.min(leader.numbers.length - 1, Math.floor((t - leader.t - lead0) / per));
      const f0 = firstFrameAfter(leader.t + lead0 + k * per);
      return { kind: "leader", n: leader.numbers[k], sweep: clamp((f - f0) / (per * fps)) };
    }
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      if (t >= b.t && t < b.t + b.dur) {
        return { kind: "picture", beat: i, anim: Math.max(0, f - beatFrame0[i]), card: clamp((f - cards[i].f + 1) / STYLE_SPEC.intertitle.fadeFrames) };
      }
    }
    if (t < tRunout) return { kind: "end", card: clamp((f - endCardF + 1) / STYLE_SPEC.intertitle.fadeFrames) };
    if (t < tEmpty) return { kind: "runout" };
    return { kind: "blank" };
  };
  /** wear mode at t: "film" (normal print), "runout" (clear leader, dirtier), "none" (no film in the gate). */
  const wearMode = (t) => (t >= tEmpty ? "none" : t >= tRunout ? "runout" : "film");

  // ---- events (for the SCORE)
  const events = [];
  events.push({ t: 0, kind: "lampOn" });
  const sMax = filmUsed(tStop + Ts);
  for (let n = 1; n * pitch <= sMax - 1e-9; n++) {
    const t = timeOfFilm(n * pitch);
    if (t > tStop + Ts) break;
    events.push({ t, kind: "sprocket", n, level: motor(t) });
  }
  const twoIdx = leader.numbers.indexOf(2);
  if (twoIdx >= 0) events.push({ t: frameTime(firstFrameAfter(leader.t + lead0 + twoIdx * per)), kind: "twoPop" });
  beats.forEach((b, i) => {
    events.push({ t: b.t, kind: "ride", dur: ride, beat: i });
    events.push({ t: cards[i].t, kind: "card", beat: i, chord: i % (SND.chords.length - 1) });
  });
  events.push({ t: frameTime(endCardF), kind: "endCard", chord: SND.chords.length - 1 });
  events.push({ t: tRunout, kind: "runout" });
  events.push({ t: tEmpty, kind: "tailOut" });
  // the loose tail slaps each take-up reel spoke (R.flaps per revolution) until the motor has stopped
  const takeAt = (t) => reels(t).takeup.angle;
  const a0 = takeAt(tEmpty);
  for (let n = 1; n < 40; n++) {
    const target = a0 + (n * Math.PI * 2) / R.flaps;
    if (takeAt(tStop + Ts) < target) break;
    let lo = tEmpty, hi = tStop + Ts;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (takeAt(mid) < target) lo = mid; else hi = mid; }
    events.push({ t: hi, kind: "flap", n, level: motor(hi) });
  }
  events.push({ t: tLampOff, kind: "lampOff" });
  events.push({ t: tStop, kind: "motorStop", dur: Ts });
  events.sort((a, b) => a.t - b.t);

  return {
    fps, pitch, speed: v, leader, beats, tail, ride, cardDelay, shots, strip, events, cards,
    times: { tEnd, tRunout, tEmpty, tLampOff, tStop, stopDur: Ts, sEmpty },
    filmUsed, frameAt, motor, lamp, reels, programme, wearMode, frameTime,
    wear: (f, mode = "film") => wearAt(f, mode),
    shotAt: (t) => { let s = shots[0]; for (const x of shots) if (t >= x.t) s = x; return s; },
    stripFrame,
  };
}

/**
 * wearAt(f, mode) -> { weave:[x,y], flicker, scratches:[[x, alpha, width, polarity]...], specks:[[x, y, r, polarity]...] }
 * Pure hash of the film frame index f (image uv units; polarity 1 = bright, 0 = dark). mode "none" = clean light.
 */
export function wearAt(f, mode = "film") {
  const h = (...k) => hash01(f, ...k);
  if (mode === "none") return { weave: [0, 0], flicker: 1 + W.flicker * 0.5 * (h(91) * 2 - 1), scratches: [], specks: [] };
  const run = mode === "runout";
  const wy = W.weave[1] * (0.65 * (h(1) * 2 - 1) + 0.35 * Math.sin(f * 0.37));
  const wx = W.weave[0] * (0.7 * (h(2) * 2 - 1) + 0.3 * Math.sin(f * 0.23 + 1.3));
  const fl = (run ? W.runout.flicker : W.flicker) * (0.7 * (h(3) * 2 - 1) + 0.3 * Math.sin(f * 1.7));
  const scratches = [];
  const S = W.scratch;
  for (let k = 0; k < S.slots; k++) {
    const r = Math.floor((f + k * 5) / S.run);
    if (hash01(r, k, 77) < S.chance * (run ? 1.6 : 1)) {
      const x = 0.12 + 0.76 * hash01(r, k, 78) + S.wander * (h(10 + k) * 2 - 1);
      const a = S.alpha[0] + (S.alpha[1] - S.alpha[0]) * hash01(r, k, 79);
      const w = S.width[0] + (S.width[1] - S.width[0]) * hash01(r, k, 80);
      scratches.push([x, a, w, hash01(r, k, 81) < 0.6 ? 1 : 0]);
    }
  }
  const specks = [];
  const P = W.specks;
  const dens = run ? W.runout.density : P.density;
  for (let i = 0; i < P.slots; i++) {
    if (h(20 + i) >= dens) continue;
    const rr = (P.r[0] + (P.r[1] - P.r[0]) * h(40 + i) ** 2) * (run ? W.runout.rScale : 1);
    specks.push([0.04 + 0.92 * h(30 + i), 0.04 + 0.92 * h(50 + i), rr, h(60 + i) < P.bright ? 1 : 0]);
  }
  return { weave: [wx, wy], flicker: 1 + fl, scratches, specks };
}

/**
 * stripFrame(k) -> { x, z, nx, nz, angle }: centre and outward normal of film-strip frame k in strip-local
 * coordinates (the strip bends around a vertical axis at z = -arcR so its centre faces +Z; frame 0 sits at x = 0).
 */
export function stripFrame(k) {
  const a = (k * ST.pitch) / ST.arcR;
  return { x: ST.arcR * Math.sin(a), z: ST.arcR * (Math.cos(a) - 1), nx: Math.sin(a), nz: Math.cos(a), angle: a };
}

/** projectorVoices(plan) -> { [event kind]: (e) => [voices] } for kit/schedule.scoreFromEvents. */
export function projectorVoices(plan) {
  const C = SND.clatter, S = SND.sting;
  const sting = (e, long = false) => [
    { type: "pad", root: S.root, chord: SND.chords[e.chord], attack: S.attack, release: long ? S.release * 1.4 : S.release, dur: long ? S.dur * 1.5 : S.dur, brightness: S.brightness, gain: S.gain, bus: "sfx" },
    { type: "chime", pitch: (S.root * 2 ** (SND.chords[e.chord][0] / 12) * 2) / 880, dur: 1.2, gain: S.chime },
  ];
  return {
    lampOn: () => [{ type: "thud", pitch: 0.7, gain: 0.32 }, { type: "click", pitch: 0.6, gain: 0.25 }],
    sprocket: (e) => [{ type: C.type, pitch: C.pitch * (e.n % 2 ? 1 : 1.18) * (0.75 + 0.25 * e.level), gain: C.gain * (e.n % 4 === 0 ? C.accent : 1) * (0.4 + 0.6 * e.level), pan: 0.18 }],
    twoPop: () => [{ type: "blip", pitch: SND.twoPop.hz / 880, dur: SND.twoPop.dur, gain: SND.twoPop.gain }],
    ride: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 0.8, pitch: 0.55, gain: 0.13 }],
    card: (e) => sting(e),
    endCard: (e) => sting(e, true),
    runout: () => [{ type: "rustle", dur: 0.25, density: 0.8, pitch: 1.4, gain: 0.08 }],
    tailOut: () => [{ type: "clack", pitch: 0.8, gain: 0.3 }, { type: "paper", dur: 0.08, density: 0.9, pitch: 1.2, gain: 0.25 }],
    flap: (e) => [{ type: "paper", dur: 0.07, density: 0.95, pitch: 1.1, gain: 0.3 * (0.4 + 0.6 * e.level), pan: 0.15 }, { type: "click", pitch: 0.55, gain: 0.12 * (0.4 + 0.6 * e.level), pan: 0.15 }],
    lampOff: () => [{ type: "click", pitch: 0.5, gain: 0.3 }, { type: "thud", pitch: 1.1, gain: 0.18 }],
    motorStop: (e) => [{ type: "servo", hz: SND.whir.hz, hz2: 28, dur: e.dur + 0.15, grit: 0.25, gain: SND.whir.gain * 1.6 }],
  };
}

/** projectorBed(plan, duration) -> SCORE entries: motor hum, whir and a low room rumble while the motor runs. */
export function projectorBed(plan, duration) {
  const end = Math.min(duration, plan.times.tStop + 0.05);
  return [
    { t: 0, type: "hum", dur: end, hz: SND.hum.hz, gain: SND.hum.gain },
    { t: 0, type: "whir", dur: end, hz: SND.whir.hz, hz2: SND.whir.hz, gain: SND.whir.gain, seed: 3 },
    { t: 0, type: "rumble", dur: duration, gain: SND.rumble.gain, pitch: 0.8, seed: 4 },
  ];
}
