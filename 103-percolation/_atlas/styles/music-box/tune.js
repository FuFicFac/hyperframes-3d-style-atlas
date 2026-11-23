// styles/music-box/tune.js — the ONE plan of the "Music Box" style (pure: no THREE, no window, no DOM; Node-safe).
// A tune is a note list. From that one list this module derives
//   - where every pin sits on the cylinder   (angle around = WHEN it plays, position along the axis = WHICH tooth),
//   - how every comb tooth moves              (pressed down by its pin, released, decaying vibration: closed form of t),
//   - the sound events                        (one pitched note per pin at the exact release time, ratchet clicks, bed).
// style.js reads the plan for the picture; scene.config.js turns plan.events() into SCORE with tuneVoices().
// The melody below ("Pinwheel Lullaby") is original to this style: C-major pentatonic, written for 12 teeth.
import { clamp, lerp, TAU } from "../../kit/time.js";

/** the comb: one tooth per pitch, low (long tooth, left) to high (short tooth, right). C-major pentatonic, C4..D6. */
export const SCALE = [
  { name: "C4", hz: 261.63 }, { name: "D4", hz: 293.66 }, { name: "E4", hz: 329.63 }, { name: "G4", hz: 392.0 },
  { name: "A4", hz: 440.0 }, { name: "C5", hz: 523.25 }, { name: "D5", hz: 587.33 }, { name: "E5", hz: 659.25 },
  { name: "G5", hz: 783.99 }, { name: "A5", hz: 880.0 }, { name: "C6", hz: 1046.5 }, { name: "D6", hz: 1174.66 },
];

/**
 * "Pinwheel Lullaby" (original). notes = [step, tooth]; time = t0 + step * stepDur.
 *   A  (steps 0-20)  a lilting melody on the upper teeth over sparse low notes
 *   B  (steps 22-33) one run straight up the comb: on the cylinder it is a DIAGONAL of pins ("across = which note")
 *   C  (steps 35-41) four chords: each is a ROW of pins along the axis ("around = when it plays")
 *   D  (steps 43-52) a falling close and a last five-pin chord
 */
export const TUNE = {
  name: "Pinwheel Lullaby",
  t0: 0.75,
  step: 0.25,
  notes: [
    // A: melody (teeth 5-10) over a rocking accompaniment (teeth 0-5)
    [0, 7], [0, 0], [1, 4], [2, 8], [2, 1], [3, 9], [3, 5], [4, 10], [4, 2], [5, 0], [6, 9], [6, 3], [7, 5], [8, 8], [8, 4],
    [9, 2], [10, 7], [10, 1], [10, 3], [11, 6], [12, 5], [12, 0], [14, 6], [14, 4], [15, 7], [16, 8], [16, 2], [17, 5], [17, 0],
    [18, 7], [18, 1], [19, 4], [20, 6], [20, 3],
    // B: the run up the comb
    [22, 0], [23, 1], [24, 2], [25, 3], [26, 4], [27, 5], [28, 6], [29, 7], [30, 8], [31, 9], [32, 10], [33, 11],
    // C: four chords = four rows of pins
    [35, 0], [35, 5], [35, 7], [35, 9], [37, 3], [37, 6], [37, 8], [37, 10], [39, 4], [39, 5], [39, 9], [39, 11], [41, 1], [41, 2], [41, 7], [41, 10],
    // D: the close
    [43, 8], [44, 9], [44, 4], [45, 11], [46, 10], [46, 5], [47, 9], [47, 1], [48, 8], [48, 3], [50, 7], [50, 2], [51, 6],
    [52, 0], [52, 3], [52, 5], [52, 8], [52, 10],
  ],
};

/**
 * createPlan({ movement, tune = TUNE, scale = SCALE, end }) -> plan
 *   movement = STYLE_SPEC.movement (cylinder, pins, comb, vibration, drive numbers).
 *   plan = { teeth, notes, pins, omega, amp, contact, cylAngle(t), crankAngle(t), wormAngle(t), deflection(i, t),
 *            energy(i, t), events(), tune, scale, end }
 * Geometry convention (shared with style.js): the cylinder axis is X; it turns so its top moves toward +Z (the comb,
 * the viewer). An angle `a` is measured from +Y toward +Z; the tooth tips sit at a = PI / 2 (axis height, front).
 * A pin planned for time T sits at psi = PI/2 + aRel - omega * T on the cylinder, so at t = T it is aRel past the
 * tip line: that is the instant it slips off the tooth = the pluck = the note.
 */
export function createPlan(o = {}) {
  const M = o.movement, tune = o.tune ?? TUNE, scale = o.scale ?? SCALE;
  const C = M.cylinder, PN = M.pins, CB = M.comb, V = M.vib;
  const n = CB.teeth;
  if (scale.length < n) throw new Error(`music-box: scale has ${scale.length} pitches for ${n} teeth`);
  const omega = TAU / C.period;                       // rad / s
  const Rp = C.radius + PN.height;                    // pin tip radius
  const amp = Rp * (Math.sin(PN.aRel) + Math.sin(PN.aPre)); // tip travel while the pin holds the tooth = pluck amplitude (m)
  const contact = (PN.aPre + PN.aRel) / omega;        // seconds a pin holds its tooth
  const end = o.end ?? C.period;

  const teeth = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    teeth.push({
      i, u, name: scale[i].name, hz: scale[i].hz,
      x: CB.x0 + i * CB.pitch,
      length: lerp(CB.lengthLow, CB.lengthHigh, u),
      visHz: lerp(V.hz[0], V.hz[1], u),               // what the eye sees (the audible pitch aliases at 30 fps)
      tau: lerp(V.tau[0], V.tau[1], u),               // 1/e decay of the visible vibration
      times: [],
    });
  }

  const notes = tune.notes
    .map(([s, tooth], k) => ({ k, step: s, tooth, t: tune.t0 + s * tune.step }))
    .sort((a, b) => a.t - b.t || a.tooth - b.tooth)
    .map((nt, idx) => {
      const T = teeth[nt.tooth];
      if (!T) throw new Error(`music-box: note ${nt.k} uses tooth ${nt.tooth} (comb has ${n})`);
      return { ...nt, idx, hz: T.hz, name: T.name, x: T.x, u: T.u, psi: Math.PI / 2 + PN.aRel - omega * nt.t };
    });
  for (const nt of notes) {
    if (nt.t < contact) throw new Error(`music-box: note at ${nt.t}s starts before its pin can reach the tooth (${contact.toFixed(2)}s)`);
    if (nt.t > C.period - contact) throw new Error(`music-box: note at ${nt.t}s is past one cylinder turn (${C.period}s)`);
    teeth[nt.tooth].times.push(nt.t);
  }
  let minGap = Infinity;
  for (const T of teeth) for (let j = 1; j < T.times.length; j++) minGap = Math.min(minGap, T.times[j] - T.times[j - 1]);
  if (minGap < CB.minGap) throw new Error(`music-box: a tooth is re-plucked after ${minGap.toFixed(2)}s (min ${CB.minGap}s: the pin holds it ${contact.toFixed(2)}s)`);

  const cylAngle = (t) => omega * t;
  const crankAngle = (t) => -M.drive.ratio * omega * t;           // the crank pinion meshes the cylinder wheel
  const wormAngle = (t) => M.governor.ratio * omega * t;          // the governor worm: one turn per wheel tooth

  /** last pluck time <= t and next pluck time > t on tooth i (or null) */
  const around = (i, t) => {
    const L = teeth[i].times;
    let last = null, next = null;
    for (let j = 0; j < L.length; j++) { if (L[j] <= t) last = L[j]; else { next = L[j]; break; } }
    return { last, next };
  };

  /**
   * deflection(i, t) -> metres at the tooth tip (negative = pressed down). Closed form:
   *   free   = -amp * exp(-s / tau) * cos(2 PI visHz s),  s = t - last pluck        (0 before the first pluck)
   *   held   = -Rp * (sin(a) + sin(aPre)),  a = aRel - omega * (next - t) in [-aPre, aRel]   (the pin on top of the tip)
   *   result = min(free, held): the pin is a one-sided stop above the tip. At t = next both equal -amp (continuous).
   */
  const deflection = (i, t) => {
    const T = teeth[i], { last, next } = around(i, t);
    let free = 0;
    if (last !== null) { const s = t - last; free = -amp * Math.exp(-s / T.tau) * Math.cos(TAU * T.visHz * s); }
    if (next !== null) {
      const a = PN.aRel - omega * (next - t);
      if (a >= -PN.aPre) return Math.min(free, -Rp * (Math.sin(a) + Math.sin(PN.aPre)));
    }
    return free;
  };
  /** energy(i, t) -> 0..1: how strongly tooth i is ringing (1 at the pluck, exp decay): drives the tooth's warm tint */
  const energy = (i, t) => {
    const { last } = around(i, t);
    return last === null ? 0 : clamp(Math.exp(-(t - last) / (teeth[i].tau * V.glowTau)));
  };

  /** events() -> [{ t, kind: "pluck" | "ratchet" | "bed", ... }] for kit/schedule.scoreFromEvents */
  const events = () => {
    const ev = [{ t: 0, kind: "bed", dur: end, x: 0 }];
    for (const nt of notes) if (nt.t < end) ev.push({ t: nt.t, kind: "pluck", tooth: nt.tooth, hz: nt.hz, u: nt.u, x: nt.x });
    // the crank's ratchet clicks once per pinion tooth: crank angle = k * TAU / clicks
    const dt = TAU / M.drive.clicks / (M.drive.ratio * omega);
    for (let k = 1; k * dt < end - 0.05; k++) ev.push({ t: k * dt, kind: "ratchet", k, x: M.drive.x });
    return ev.sort((a, b) => a.t - b.t);
  };

  return {
    movement: M, tune, scale, end, teeth, notes, pins: notes, omega, amp, contact, minGap, pinTip: Rp,
    cylAngle, crankAngle, wormAngle, deflection, energy, events,
  };
}

/** tuneVoices(SND) -> voices for scoreFromEvents. One marimba-style bar note + a quiet plucked octave per pin. */
export function tuneVoices(SND) {
  return {
    pluck: (e) => [
      { type: "marimba", hz: e.hz, dur: SND.note.dur, decay: lerp(SND.note.decay[0], SND.note.decay[1], e.u), mallet: SND.note.mallet, gain: SND.note.gain * Math.pow(523.25 / e.hz, SND.note.tilt) },
      { type: "pluck", hz: e.hz * 2, dur: SND.shimmer.dur, decay: SND.shimmer.decay, bright: SND.shimmer.bright, gain: SND.shimmer.gain },
      { type: "tick", gain: SND.note.tick, pitch: 1.8 },
    ],
    ratchet: () => [{ type: "tick", gain: SND.ratchet.gain, pitch: SND.ratchet.pitch }],
    bed: (e) => [
      { type: "whir", dur: e.dur, hz: SND.whir.hz, hz2: SND.whir.hz, grit: SND.whir.grit, gain: SND.whir.gain, pan: -0.35 },
      { type: "pad", dur: e.dur, root: SND.pad.root, chord: SND.pad.chord, attack: 0.6, release: 1.2, brightness: SND.pad.brightness, gain: SND.pad.gain, pan: 0 },
    ],
  };
}

/** panOf(movement) -> (event) => stereo pan from the event's x along the comb */
export const panOf = (M) => (e) => clamp((e.x ?? 0) / (M.cylinder.length * 0.5), -1, 1) * 0.45;
