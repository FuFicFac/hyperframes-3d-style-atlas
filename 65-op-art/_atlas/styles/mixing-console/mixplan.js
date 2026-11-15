// styles/mixing-console/mixplan.js — the pure mix planner for "Mixing Console". No THREE, no window, no DOM.
// Imported by style.js (the picture) AND by scene.config.js (SCORE, camera shots, framing gate), so what you hear is
// exactly what the meters show: one plan -> control positions, note list, per-note gains, meter responses, sounds.
//
//   parameter tracks (automation)  ->  fader positions, knob angles (detented), button latches (+ press travel)
//   pattern x tempo                ->  notes per channel (velocity, decay or sustain)
//   note gain at onset             =   velocity x channel level x fader law x EQ x mute/solo x master fader
//   meters                         =   closed-form 2nd-order (underdamped) response to the summed note envelopes
//                                      (VU: slow, ~8 % overshoot; LED: fast) — exact at any t, nothing accumulates
//   SCORE                          =   one synthesized event per note with that same gain (+ fader whirs, button
//                                      clacks, knob detent ticks)
//
// Units: seconds, metres (layout), dB / linear gain. Console frame: panel x across (channel 1 on the left), z toward
// the viewer (front edge = +z), y up; the panel tilts up toward the back by `slope` and is placed at `origin`.
import { clamp, lerp, ease, toEase, smoothstep } from "../../kit/time.js";
import { screenExtent, sampleCameraKeys, cameraBasis } from "../../kit/framing.js";

// ------------------------------------------------------------------------------------------------ fader law, gains
/** faderDb(pos 0..1, law [[pos, dB], ...]) -> dB (-Infinity at the bottom stop). Piecewise linear in dB. */
export function faderDb(pos, law) {
  if (pos <= law[0][0] + 1e-6) return -Infinity;
  for (let i = 1; i < law.length; i++) {
    if (pos <= law[i][0]) {
      const [p0, d0] = law[i - 1], [p1, d1] = law[i];
      if (!Number.isFinite(d0)) return lerp(-80, d1, (pos - p0) / (p1 - p0));
      return lerp(d0, d1, (pos - p0) / (p1 - p0));
    }
  }
  return law[law.length - 1][1];
}
export const dbToGain = (db) => (Number.isFinite(db) ? Math.pow(10, db / 20) : 0);
export const faderGain = (pos, law) => dbToGain(faderDb(pos, law));
/** posForDb(dB, law) -> fader position (inverse of faderDb on the finite part) — handy for planning "set to -6 dB". */
export function posForDb(db, law) {
  for (let i = 1; i < law.length; i++) {
    const [p0, d0] = law[i - 1], [p1, d1] = law[i];
    if (Number.isFinite(d0) && db >= d0 && db <= d1) return lerp(p0, p1, (db - d0) / (d1 - d0));
  }
  return db <= law[1][1] ? law[1][0] : law[law.length - 1][0];
}

// ------------------------------------------------------------------------------------------------ EQ
/** eqDb(f Hz, { lo, mid, hi } in -1..1, E = spec.eq) -> dB: low shelf + mid bell + high shelf (smooth on log f). */
export function eqDb(f, k, E) {
  const l2 = (x) => Math.log2(x);
  const lo = 1 / (1 + Math.exp(l2(f / E.lo.hz) * E.lo.slope));
  const hi = 1 / (1 + Math.exp(-l2(f / E.hi.hz) * E.hi.slope));
  const mid = Math.exp(-((l2(f / E.mid.hz)) ** 2) / (2 * E.mid.width * E.mid.width));
  return E.range * ((k.lo ?? 0) * lo + (k.mid ?? 0) * mid + (k.hi ?? 0) * hi);
}
/** eqCurve(k, E, n = 64) -> [{ f, db }] on a log axis from E.fMin to E.fMax (the display curve). */
export function eqCurve(k, E, n = 64) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = E.fMin * Math.pow(E.fMax / E.fMin, i / (n - 1));
    out.push({ f, db: eqDb(f, k, E) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ meter ballistics
/** ballistics({ f0 Hz, zeta < 1 }) -> constants of the unit-DC-gain 2nd-order meter movement. */
export function ballistics({ f0 = 2, zeta = 0.62 } = {}) {
  const w0 = 2 * Math.PI * f0, z = Math.min(0.98, zeta), sig = z * w0, wd = w0 * Math.sqrt(1 - z * z);
  return { w0, sig, wd };
}
/**
 * Response of the meter movement (closed form) at time tau after a note onset:
 *  - decaying note  x = g·e^(-a·tau):  y = g·w0²/(wd·(b²+wd²))·[e^(-σtau)(b·sin wd·tau − wd·cos wd·tau) + wd·e^(-a·tau)], b = a − σ
 *  - sustained note x = g on [0, L):   y = g·(S(tau) − S(tau − L)), S = unit step response (1 − e^(-σt)(cos + σ/wd sin))
 */
function stepResp(B, t) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-B.sig * t) * (Math.cos(B.wd * t) + (B.sig / B.wd) * Math.sin(B.wd * t));
}
export function noteResponse(B, n, tau) {
  if (tau <= 0) return 0;
  if (n.sustain) return stepResp(B, tau) - stepResp(B, tau - n.sustain);
  const a = n.decay, b = a - B.sig, wd = B.wd;
  const k = (B.w0 * B.w0) / (wd * (b * b + wd * wd));
  return k * (Math.exp(-B.sig * tau) * (b * Math.sin(wd * tau) - wd * Math.cos(wd * tau)) + wd * Math.exp(-a * tau));
}
/** the instantaneous meter input (no ballistics) of one note at tau — what the LED peak would see with zero inertia. */
export const noteEnvelope = (n, tau) => (tau < 0 ? 0 : n.sustain ? (tau < n.sustain ? 1 : 0) : Math.exp(-n.decay * tau));

// ------------------------------------------------------------------------------------------------ automation tracks
/**
 * valueTrack(initial, keys [{ at, to, dur, ease }], { settle: { amp, freq, decay } }) -> v(t)
 * Keys must not overlap. A move glides (eased) from the value held at `at` to `to`; `settle` adds the small damped
 * wobble of a motorised fader arriving (fraction of the move size).
 */
export function valueTrack(initial, keys = [], o = {}) {
  const K = [...keys].sort((a, b) => a.at - b.at);
  const starts = [];
  let v = initial;
  for (const k of K) { starts.push(v); v = k.to; }
  const st = o.settle;
  return (t) => {
    let val = initial;
    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      if (t < k.at) break;
      const u = (t - k.at) / k.dur;
      const from = starts[i];
      if (u < 1) { val = lerp(from, k.to, toEase(k.ease ?? "inOutCubic")(u)); break; }
      val = k.to;
      if (st && st.amp) {
        const s = t - k.at - k.dur;
        val += (k.to - from) * st.amp * Math.sin(2 * Math.PI * st.freq * s) * Math.exp(-st.decay * s);
      }
    }
    return val;
  };
}
/** detented(v, { min, max, detents }) -> v snapped through the detents (dwell on each, quick snap between). */
export function detented(v, D) {
  if (!D.detents || D.detents < 2) return v;
  const step = (D.max - D.min) / (D.detents - 1);
  const u = (v - D.min) / step, k = Math.floor(u), f = u - k;
  return D.min + (k + smoothstep(0.32, 0.68, f)) * step;
}
/** latchTrack(initial, keys [{ at, on }]) -> { on(t), press(t) 0..1 travel (fast down, spring up to the latch depth) } */
export function latchTrack(initial, keys = [], P = { down: 0.05, up: 0.12 }) {
  const K = [...keys].sort((a, b) => a.at - b.at);
  return {
    keys: K,
    on(t) { let s = initial; for (const k of K) if (t >= k.at) s = k.on; return s; },
    press(t) {
      let p = 0;
      for (const k of K) {
        const s = t - k.at;
        if (s < 0) break;
        p = s < P.down ? s / P.down : Math.max(0, 1 - (s - P.down) / P.up);
      }
      return p;
    },
  };
}

// ------------------------------------------------------------------------------------------------ the mix plan
const lowerBound = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; } return lo; };

/**
 * planMix(S, { channels, automation, duration }) -> mix
 *   S = STYLE_SPEC (uses S.mix: tempo, law, eq, vu, led, kinds, master; S.knob detents/ranges)
 *   channels: [{ id, label, kind: "kick"|"snare"|"hats"|"bass"|"keys"|"pad", level = 1, fader = .75,
 *                knobs: { gain, hi, mid, lo, pan }, mute = false, solo = false }]
 *   automation: [{ kind: "fader", ch: id | [ids] | "master", at, to: v | [v per id], dur, ease }
 *                | { kind: "knob", ch, name, at, to, dur, ease } | { kind: "button", ch, name: "mute"|"solo", at, on }]
 *   Group moves (ch: [ids]) start, glide and land together, like grouped fader automation.
 * mix: { channels, ids, index(id), fader(id, t), knob(id, name, t) (detented), knobRaw, button(id, name, t) -> { on, press },
 *        gain(id, t) (effective, at a note onset), notes, vu(id, t), led(id, t), peak(id, t), env(id, t),
 *        masterVu(t), masterLed(t), masterPeak(t), eq(id, t) -> { lo, mid, hi }, events (controls), moves, beatAt(n) }
 */
export function planMix(S, o) {
  const M = S.mix, duration = o.duration;
  const chans = o.channels.map((c, i) => ({ level: 1, fader: 0.75, mute: false, solo: false, ...c, index: i, knobs: { gain: 0.5, hi: 0, mid: 0, lo: 0, pan: 0, ...(c.knobs ?? {}) } }));
  const ids = chans.map((c) => c.id), idx = Object.fromEntries(ids.map((id, i) => [id, i]));
  const autos = o.automation ?? [];
  // ---- tracks
  const faderKeys = Object.fromEntries([...ids, "master"].map((id) => [id, []]));
  const knobKeys = {}, btnKeys = {};
  const moves = [];
  for (const a of autos) {
    if (a.kind === "fader") {
      const list = Array.isArray(a.ch) ? a.ch : [a.ch];
      list.forEach((id, j) => {
        const to = Array.isArray(a.to) ? a.to[j] : a.to;
        faderKeys[id].push({ at: a.at, to, dur: a.dur, ease: a.ease ?? M.faderEase });
      });
      moves.push({ kind: "fader", ch: list, at: a.at, dur: a.dur });
    } else if (a.kind === "knob") {
      ((knobKeys[a.ch] ??= {})[a.name] ??= []).push({ at: a.at, to: a.to, dur: a.dur, ease: a.ease ?? "inOutSine" });
      moves.push({ kind: "knob", ch: [a.ch], name: a.name, at: a.at, dur: a.dur });
    } else if (a.kind === "button") {
      ((btnKeys[a.ch] ??= {})[a.name] ??= []).push({ at: a.at, on: a.on });
      moves.push({ kind: "button", ch: [a.ch], name: a.name, at: a.at, on: a.on });
    }
  }
  const settle = M.faderSettle;
  const faderT = Object.fromEntries(ids.map((id) => [id, valueTrack(chans[idx[id]].fader, faderKeys[id], { settle })]));
  faderT.master = valueTrack(M.master.fader, faderKeys.master, { settle });
  const knobT = {}, btnT = {};
  for (const c of chans) {
    knobT[c.id] = {};
    for (const name of Object.keys(c.knobs)) knobT[c.id][name] = valueTrack(c.knobs[name], knobKeys[c.id]?.[name] ?? []);
    btnT[c.id] = { mute: latchTrack(c.mute, btnKeys[c.id]?.mute, S.button.travel), solo: latchTrack(c.solo, btnKeys[c.id]?.solo, S.button.travel) };
  }
  const knobDef = (name) => S.knob.kinds[name] ?? S.knob.kinds.gain;
  const knobRaw = (id, name, t) => knobT[id][name](t);
  const knob = (id, name, t) => detented(knobRaw(id, name, t), knobDef(name));
  const fader = (id, t) => (id === "master" ? faderT.master(t) : faderT[id](t));
  const button = (id, name, t) => ({ on: btnT[id][name].on(t), press: btnT[id][name].press(t) });
  const eqAt = (id, t) => ({ lo: knob(id, "lo", t), mid: knob(id, "mid", t), hi: knob(id, "hi", t) });
  /** the effective channel gain at t (fader law x mute/solo x trim knob); master separately */
  const anySolo = (t) => ids.some((id) => btnT[id].solo.on(t));
  const gain = (id, t) => {
    const c = chans[idx[id]];
    if (btnT[id].mute.on(t)) return 0;
    if (anySolo(t) && !btnT[id].solo.on(t)) return 0;
    const trim = dbToGain((knob(id, "gain", t) - 0.5) * 2 * M.trimRange);
    return c.level * faderGain(fader(id, t), M.law) * trim;
  };
  const masterGain = (t) => faderGain(faderT.master(t), M.law);

  // ---- notes (pattern x tempo); gains fixed at the onset, exactly like the sound
  const beat = 60 / M.tempo, step = beat / 2, bar = beat * 4;
  const nBars = Math.ceil(duration / bar);
  const notes = Object.fromEntries(ids.map((id) => [id, []]));
  const prog = M.progression;
  for (const c of chans) {
    const K = M.kinds[c.kind];
    if (!K) throw new Error(`planMix: unknown channel kind "${c.kind}"`);
    const push = (t, n) => {
      if (t >= duration - 0.02) return;
      const g = gain(c.id, t), mg = g * masterGain(t);
      const eq = eqAt(c.id, t);
      // EQ on the sound: the band the voice sits in scales its gain; the keys get an upper "air" layer from HI
      const bandDb = eqDb(K.bandHz ?? 1000, eq, M.eq);
      const air = Math.max(0, eqDb(K.airHz ?? 8000, eq, M.eq)) / M.eq.range;
      const ng = { ch: c.id, t, vel: n.vel, ...n, g: g * n.vel * dbToGain(bandDb), gm: mg * n.vel * dbToGain(bandDb), air, pan: knob(c.id, "pan", t) };
      notes[c.id].push(ng);
    };
    for (let b = 0; b < nBars; b++) {
      const chord = prog[b % prog.length];
      const t0 = b * bar;
      if (c.kind === "pad") {
        push(t0, { vel: 1, sustain: bar, chord, bar: b });
        continue;
      }
      K.steps.forEach((s, j) => {
        const vel = (K.vel?.[j] ?? 1) * (K.barVel?.[b % (K.barVel?.length || 1)] ?? 1);
        push(t0 + s * step, { vel, decay: K.decay, chord, bar: b, step: s, note: K.notes ? K.notes[j % K.notes.length] : 0 });
      });
    }
  }
  // pad: split a bar where its gain changes (solo / mute / fader), so the pad follows the console like everything else
  const padSplit = (id) => {
    const out = [];
    const cuts = moves.filter((m) => m.kind === "button" || (m.kind === "fader" && (m.ch.includes(id) || m.ch.includes("master")))).flatMap((m) => (m.kind === "button" ? [m.at] : Array.from({ length: Math.ceil(m.dur / M.padSlice) + 1 }, (_, k) => m.at + Math.min(m.dur, k * M.padSlice))));
    for (const n of notes[id]) {
      if (!n.sustain) { out.push(n); continue; }
      const inside = cuts.filter((x) => x > n.t + 1e-6 && x < n.t + n.sustain - 1e-6).sort((a, b) => a - b);
      const edges = [n.t, ...inside, n.t + n.sustain];
      for (let k = 0; k < edges.length - 1; k++) {
        const t = edges[k];
        const g = gain(id, t);
        out.push({ ...n, t, sustain: edges[k + 1] - t, cont: k > 0, g: g * n.vel, gm: g * n.vel * masterGain(t) });
      }
    }
    return out;
  };
  for (const c of chans) if (c.kind === "pad") notes[c.id] = padSplit(c.id);
  for (const id of ids) notes[id].sort((a, b) => a.t - b.t);
  const allNotes = ids.flatMap((id) => notes[id]).sort((a, b) => a.t - b.t || (a.ch < b.ch ? -1 : 1));

  // ---- meters (closed form; per channel = post-fader, master = post-master sum)
  const VU = ballistics(M.vu), LED = ballistics(M.led);
  const meterTrim = (id) => M.kinds[chans[idx[id]].kind].meter ?? 1;
  const WIN = M.window;
  const sumResp = (list, B, t, key, trim, w = null) => {
    let y = 0;
    const i1 = lowerBound(list, t + 1e-9);
    for (let i = i1 - 1; i >= 0; i--) {
      const n = list[i], tau = t - n.t;
      if (tau > WIN + (n.sustain ?? 0) + 2.5) break;            // pads are at most a bar long: nothing older matters
      if (tau > WIN + (n.sustain ?? 0)) continue;
      if (n[key] > 0) y += n[key] * trim * (w ? w(n) : 1) * noteResponse(B, n, tau);
    }
    return y;
  };
  /** constant-power pan weight of a note on one side of the stereo master (-1 = left, +1 = right) — same law as the score */
  const panW = (side) => (n) => { const a = ((clamp(n.pan * 0.8, -0.9, 0.9) + 1) * Math.PI) / 4; return side < 0 ? Math.cos(a) * Math.SQRT2 : Math.sin(a) * Math.SQRT2; };
  const vu = (id, t) => sumResp(notes[id], VU, t, "g", meterTrim(id));
  const led = (id, t) => sumResp(notes[id], LED, t, "g", meterTrim(id));
  const masterVu = (t) => ids.reduce((s, id) => s + sumResp(notes[id], VU, t, "gm", meterTrim(id) * M.master.meter), 0);
  const masterLed = (t) => ids.reduce((s, id) => s + sumResp(notes[id], LED, t, "gm", meterTrim(id) * M.master.meter), 0);
  const masterLedSide = (t, side) => ids.reduce((s, id) => s + sumResp(notes[id], LED, t, "gm", meterTrim(id) * M.master.meter, panW(side)), 0);
  /** peak hold: max of the LED reading over the last `hold` s, sampled on the absolute 1/60 s grid (seek-safe) */
  const peakOf = (f, t) => {
    const H = M.led.hold, dt = 1 / 60;
    let m = f(t);
    for (let k = Math.floor(t / dt); k * dt >= t - H && k >= 0; k--) m = Math.max(m, f(k * dt));
    return m;
  };
  const env = (id, t) => {
    let y = 0;
    for (const n of notes[id]) { const tau = t - n.t; if (tau >= 0 && tau < WIN + (n.sustain ?? 0)) y += n.g * meterTrim(id) * noteEnvelope(n, tau); }
    return y;
  };

  // ---- control sound events (fader whirs, button clacks, knob detent ticks)
  const events = [];
  for (const m of moves) {
    if (m.kind === "fader") events.push({ t: m.at, kind: "faderMove", dur: m.dur, ch: m.ch, n: m.ch.length });
    else if (m.kind === "button") events.push({ t: m.at, kind: "button", ch: m.ch[0], name: m.name, on: m.on });
    else if (m.kind === "knob") {
      const D = knobDef(m.name), stepV = (D.max - D.min) / (D.detents - 1);
      let prev = Math.round((knobRaw(m.ch[0], m.name, m.at) - D.min) / stepV);
      for (let t = m.at; t <= m.at + m.dur + 1e-9; t += 0.002) {
        const k = Math.round((knobRaw(m.ch[0], m.name, t) - D.min) / stepV);
        if (k !== prev) { events.push({ t: +t.toFixed(4), kind: "detent", ch: m.ch[0], name: m.name, k }); prev = k; }
      }
    }
  }
  events.sort((a, b) => a.t - b.t);

  return {
    channels: chans, ids, index: (id) => idx[id], beat, bar, step,
    fader, knob, knobRaw, button, gain, masterGain, eq: eqAt, anySolo,
    notes, allNotes,
    vu, led, env, masterVu, masterLed,
    peak: (id, t) => peakOf((x) => led(id, x), t),
    masterPeak: (t) => peakOf(masterLed, t),
    masterLedSide, masterPeakSide: (t, side) => peakOf((x) => masterLedSide(x, side), t),
    events, moves,
  };
}

// ------------------------------------------------------------------------------------------------ meter faces
/** vuDeflection(y, V = S.mix.vuFace) -> 0..~1.05: a real VU movement is linear in voltage; 0 VU sits at `zero` of full scale. */
export const vuDeflection = (y, V) => clamp((Math.max(0, y) * V.zero), 0, V.peg);
/** the printed VU scale marks (dB -> deflection), for the face artwork */
export const vuMarks = (V) => V.marks.map((db) => ({ db, d: Math.pow(10, db / 20) * V.zero }));
/** ledSegments(y, L = S.mix.ledFace) -> how many segments are lit (fractional for the top one) */
export function ledLit(y, L) {
  const db = 20 * Math.log10(Math.max(1e-6, y));
  return clamp((db - L.floor) / L.stepDb, 0, L.n);
}

// ------------------------------------------------------------------------------------------------ score
/**
 * mixScore(mix, V = S.mix.voices, { seedBase }) -> SCORE entries: one synthesized event per note (gain = the note's
 * post-master gain x the voice level), panned by the channel's pan knob. Pads are music-bus chunks with short
 * crossfades where the console changed their gain.
 */
export function mixScore(mix, V, o = {}) {
  const out = [];
  let seed = o.seedBase ?? 1001;
  const hz = (semi, base) => base * Math.pow(2, semi / 12);
  for (const n of mix.allNotes) {
    const c = mix.channels[mix.index(n.ch)], K = V[c.kind];
    if (!(n.gm > 1e-4)) continue;
    const pan = clamp(n.pan * 0.8, -0.9, 0.9);
    const g = n.gm * K.gain;
    if (c.kind === "kick") out.push({ t: n.t, type: "thud", dur: K.dur, pitch: K.pitch, gain: g, pan, seed: seed++ });
    else if (c.kind === "snare") {
      out.push({ t: n.t, type: "paper", dur: K.dur, density: K.density, pitch: K.pitch, gain: g, pan, seed: seed++ });
      out.push({ t: n.t, type: "thud", dur: K.bodyDur, pitch: K.bodyPitch, gain: g * K.body, pan, seed: seed++ });
    } else if (c.kind === "hats") out.push({ t: n.t, type: "click", dur: K.dur, pitch: K.pitch, gain: g, pan, seed: seed++ });
    else if (c.kind === "bass") {
      const f = hz(n.chord.root + (n.note ?? 0), K.base);
      out.push({ t: n.t, type: "servo", dur: K.dur, hz: f, hz2: f, grit: K.grit, gain: g, pan, seed: seed++ });
    } else if (c.kind === "keys") {
      const tones = n.chord.keys;
      tones.forEach((s) => {
        out.push({ t: n.t, type: "chime", dur: K.dur, pitch: hz(s, K.base) / 880, gain: g / Math.sqrt(tones.length), pan, seed: seed++ });
        if (n.air > 0.02) out.push({ t: n.t, type: "chime", dur: K.airDur, pitch: (2 * hz(s, K.base)) / 880, gain: (g / Math.sqrt(tones.length)) * K.air * n.air, pan, seed: seed++ });
      });
    } else if (c.kind === "pad") {
      out.push({ t: n.t, type: "pad", dur: n.sustain + K.release, root: hz(n.chord.root, K.base), chord: n.chord.pad, attack: n.cont ? K.xfade : K.attack, release: K.release, brightness: K.brightness, gain: g, pan, seed: seed++ });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
/** controlVoices(V = S.mix.controls) -> voices for kit/schedule.scoreFromEvents (fader whir, button clack, knob tick). */
export function controlVoices(V) {
  return {
    faderMove: (e) => [{ type: "whir", dur: e.dur, hz: V.fader.hz, hz2: V.fader.hz2, grit: V.fader.grit, gain: V.fader.gain * Math.min(1.5, 0.8 + 0.2 * e.n) }],
    button: (e) => [
      { type: "clack", dur: 0.1, pitch: V.button.pitch * (e.on ? 1 : 0.9), gain: V.button.gain },
      { type: "click", dur: 0.03, pitch: 0.6, gain: V.button.gain * 0.4, offset: 0.003 },
    ],
    detent: (e) => [{ type: "tick", dur: 0.015, pitch: V.detent.pitch, gain: V.detent.gain }],
  };
}

// ------------------------------------------------------------------------------------------------ layout
/**
 * consoleLayout(S, { channels = 6 }) -> panel geometry in panel space + world mapping.
 *   stripX(i) (channel centre), master: { x0, x1, cx }, width, x0, x1, z (element rows from S.strip.z), toWorld([x,y,z]),
 *   stripBox(i0, i1) -> [min, max] world box from the tape label to the top of the meter bridge (the framing region),
 *   bridge: { z, y, tilt } (meter bridge in panel space), vuWorld(i)
 */
export function consoleLayout(S, o = {}) {
  const C = S.console, n = o.channels ?? 6;
  const W = C.stripW, width = n * W + C.masterW;
  const x0 = -width / 2, x1 = width / 2;
  const sl = C.slope, cs = Math.cos(sl), sn = Math.sin(sl), O = C.origin;
  // panel tilts up toward the back (-z): rotate about +x by +slope (y' = y cos + (-z) sin ...)
  const toWorld = ([x, y, z]) => [O[0] + x, O[1] + y * cs - z * sn, O[2] + y * sn + z * cs];
  const stripX = (i) => x0 + (i + 0.5) * W;
  const master = { x0: x0 + n * W, x1, cx: x0 + n * W + C.masterW / 2 };
  // meter bridge: a hood behind the panel whose face leans back at `tilt` from the panel plane (bottom edge on the
  // panel's back edge z0, top edge at topZ), `d` deep
  const Bz = C.depth / 2, bridge = { z0: -Bz, z1: -Bz - C.bridge.d, h: C.bridge.h, tilt: C.bridge.tilt, topZ: -Bz - C.bridge.h / Math.tan(C.bridge.tilt) };
  /** a point on the bridge face: u = 0..1 from bottom to top edge, x */
  bridge.face = (x, u, lift = 0) => {
    const nz = Math.sin(C.bridge.tilt), ny = Math.cos(C.bridge.tilt);   // face normal (toward the viewer, up)
    return [x, u * C.bridge.h + ny * lift, lerp(bridge.z0, bridge.topZ, u) + nz * lift];
  };
  /**
   * stripBox(i0, i1, { zone = "all" | "front" | "meters" }) -> [min, max] world box over channels i0..i1 ("master" = the
   * master section): "all" = tape label to the top of the meter bridge; "front" = tape label, faders, LED columns and
   * the mute/solo buttons; "meters" = the buttons, the knobs and the meter bridge.
   */
  const stripBox = (i0, i1, { zone = "all" } = {}) => {
    const xa = i0 === "master" ? master.x0 : stripX(i0) - W / 2, xb = i1 === "master" ? master.x1 : stripX(i1) + W / 2;
    const zFront = zone === "meters" ? S.strip.z.buttons + 0.03 : S.strip.z.tape + C.tapeH / 2;
    const pts = [];
    for (const x of [xa, xb]) {
      pts.push(toWorld([x, 0, zFront]), toWorld([x, 0.03, zFront]));
      if (zone === "front") pts.push(toWorld([x, 0.03, S.strip.z.buttons - 0.03]));
      else pts.push(toWorld([x, C.bridge.h, bridge.topZ]));
    }
    const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
    return [min, max];
  };
  return { n, W, width, x0, x1, master, toWorld, stripX, bridge, stripBox, slope: sl };
}

// ------------------------------------------------------------------------------------------------ camera
/**
 * fitShot(pts, { elev, azim, fov, aspect, win, lift }) -> { pos, target, fov }: the closest camera on that bearing
 * whose view puts every point inside the NDC window `win` (below the caption band), centred in it.
 */
export function fitShot(pts, o = {}) {
  const { elev = 0.45, azim = 0, fov = 30, aspect = 16 / 9 } = o;
  const win = { x0: -0.86, x1: 0.86, y0: -0.86, y1: 0.58, ...(o.win ?? {}) };
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  const dir = [Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)];
  const wc = [(win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2], ww = [(win.x1 - win.x0) / 2, (win.y1 - win.y0) / 2];
  const th = Math.tan((fov * Math.PI) / 360);
  const make = (d) => {
    let tgt = [...c];
    for (let it = 0; it < 10; it++) {
      const cam = { pos: [tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d], target: tgt, fov };
      const e = screenExtent(cam, pts, { aspect });
      const mid = [(e.x[0] + e.x[1]) / 2, (e.y[0] + e.y[1]) / 2];
      const B = cameraBasis(cam);
      const dx = (mid[0] - wc[0]) * th * aspect * d, dy = (mid[1] - wc[1]) * th * d;
      tgt = [tgt[0] + B.right[0] * dx + B.up[0] * dy, tgt[1] + B.right[1] * dx + B.up[1] * dy, tgt[2] + B.right[2] * dx + B.up[2] * dy];
    }
    return { pos: [tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d], target: tgt, fov };
  };
  const fits = (d) => {
    const cam = make(d), e = screenExtent(cam, pts, { aspect });
    return !e.behind && (e.x[1] - e.x[0]) / 2 <= ww[0] && (e.y[1] - e.y[0]) / 2 <= ww[1];
  };
  let lo = 0.2, hi = 30;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  const cam = make(hi);
  const r5 = (v) => +v.toFixed(5);
  return { pos: cam.pos.map(r5), target: cam.target.map(r5), fov };
}
/**
 * windowCheck(keys, regions(t) -> [{ id, pts }], { duration, dt, drift, fov, win }) -> { ok, fails, worst }:
 * replays the rig (kit sampleCameraKeys) against an asymmetric window (subject under the caption band).
 */
export function windowCheck(keys, regions, o = {}) {
  const { dt = 1 / 30, drift = null, fov = 30, aspect = 16 / 9 } = o;
  const win = { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.62, ...(o.win ?? {}) };
  const duration = o.duration ?? keys[keys.length - 1].t;
  const fails = [];
  let worst = { over: -Infinity };
  for (let i = 0; i <= Math.round(duration / dt); i++) {
    const t = +Math.min(duration, i * dt).toFixed(6);
    const cam = sampleCameraKeys(keys, t, { drift, fov });
    for (const r of regions(t)) {
      const e = screenExtent(cam, r.pts, { aspect });
      const over = Math.max(win.x0 - e.x[0], e.x[1] - win.x1, win.y0 - e.y[0], e.y[1] - win.y1);
      if (over > worst.over) worst = { t, id: r.id, over: +over.toFixed(4) };
      if (e.behind || over > 0) fails.push({ t, id: r.id, over: +over.toFixed(4) });
    }
  }
  return { ok: fails.length === 0, fails, worst };
}
export { ease };
