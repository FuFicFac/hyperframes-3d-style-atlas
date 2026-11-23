// styles/slit-scan/timeslice.js — the time-slice planner (pure, Node-safe: no THREE, no window, no DOM).
// Time is a function of screen position. For video time t and screen coordinate x (0 = left .. 1 = right) the
// picture shows the world at   w(t, x) = t - lag(t, x),   lag(t, x) = delay(t) x profile(t, x).
// Nothing is remembered between frames: the renderer draws the same scene posed at K+1 world times per frame.
//   createTimeMap(cfg)  -> the plan: lag / worldTime / delay / nodes / scan / events
//   createToys(T)       -> closed-form toy motion in WORLD time (beam angle, rod height, metronome angle, tick times)
//   sliceVoices(sound)  -> voice table for kit/schedule.scoreFromEvents
import { clamp, toEase } from "../../kit/time.js";

const TAU = Math.PI * 2;

/** Displacement profiles: screen x (0..1) -> 0 (now) .. 1 (oldest). */
export const PROFILES = {
  ramp: (x) => 1 - x,                       // left = the past, right = now
  centre: (x) => Math.abs(2 * x - 1),       // centre = now, both edges = the past
  bands: (x, n = 3) => (x >= 1 ? 0 : 1 - (x * n - Math.floor(x * n))), // n repeated ramps
};

/** keyed scalar: keys [{ t, v, ease }] sorted by t; the ease belongs to the segment ARRIVING at a key; holds outside. */
function keyed(keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * toEase(b.ease ?? "inOutCubic")(clamp(u, 0, 1));
    }
  }
  return keys[keys.length - 1].v;
}

/**
 * createTimeMap({ sweep: { t0, t1 }, delay: [{ t, v, ease }], profile: [{ t, mix: { ramp, centre, bands }, ease }], bands = 3 })
 *   sweep: a scan line crosses the frame from x = 0 at t0 to x = 1 at t1 and FREEZES each column as it passes
 *          (true slit-scan): lag = max(0, (t - t0) - x D), D = t1 - t0. At t1 this equals the live map
 *          delay = D with the ramp profile, so the hand-over to the dial is continuous.
 *   delay: dial keys AFTER the sweep (a key { t: t1, v: D } is prepended). profile: weight keys (default ramp only).
 */
export function createTimeMap(cfg) {
  const { t0, t1 } = cfg.sweep, D = t1 - t0, bands = cfg.bands ?? 3;
  const dKeys = [{ t: t1, v: D }, ...(cfg.delay ?? [])];
  const names = Object.keys(PROFILES);
  const pKeys = [{ t: t1, mix: { ramp: 1 } }, ...(cfg.profile ?? [])];
  const wKeys = Object.fromEntries(names.map((n) => [n, pKeys.map((k) => ({ t: k.t, v: k.mix[n] ?? 0, ease: k.ease }))]));

  /** the dial: 0 before the sweep, the scan line's age during it, the keys after */
  const delay = (t) => (t <= t0 ? 0 : t < t1 ? t - t0 : keyed(dKeys, t));
  const weights = (t) => Object.fromEntries(names.map((n) => [n, keyed(wKeys[n], t)]));
  const profile = (t, x) => {
    let p = 0;
    for (const n of names) { const w = keyed(wKeys[n], t); if (w) p += w * PROFILES[n](x, bands); }
    return p;
  };
  const lag = (t, x) => (t <= t0 ? 0 : t < t1 ? Math.max(0, t - t0 - x * D) : keyed(dKeys, t) * profile(t, x));
  const worldTime = (t, x) => t - lag(t, x);
  /** nodes(t, K, out?) -> lag at the K+1 equally spaced slice nodes x = j / K */
  const nodes = (t, K, out = new Float32Array(K + 1)) => { for (let j = 0; j <= K; j++) out[j] = lag(t, j / K); return out; };
  /** scan(t) -> { x, level }: the scan line (level 0 outside the sweep; short fade at both ends) */
  const scan = (t) => {
    const x = clamp((t - t0) / D, 0, 1);
    const level = t < t0 - 0.25 || t > t1 + 0.35 ? 0 : Math.min(clamp((t - (t0 - 0.25)) / 0.25, 0, 1), clamp((t1 + 0.35 - t) / 0.35, 0, 1));
    return { x, level };
  };

  /**
   * events({ duration, subjects: [{ id, x }], toys, dt = 1/240 }) -> sorted [{ t, kind, ... }]
   *   tick   one per metronome extreme AS SHOWN in that subject's column (w crosses a tick instant, either direction);
   *          ticks within 12 ms merge into one event with n = how many (unison = one loud tick, a time map = a roll)
   *   scan   the scan line crossing each subject          sweep / mapped   the sweep's start and end
   *   tone   one per dial segment { dur, d0, d1 }         snap   the dial reaching 0     fold   a profile change
   */
  const events = ({ duration, subjects = [], toys, dt = 1 / 240 }) => {
    const ev = [];
    const raw = [];
    if (toys) for (const s of subjects) {
      let prev = toys.tickIndex(worldTime(0, s.x));
      for (let k = 1; k * dt <= duration; k++) {
        const idx = toys.tickIndex(worldTime(k * dt, s.x));
        if (idx !== prev) { raw.push({ t: k * dt, x: s.x }); prev = idx; }
      }
    }
    raw.sort((a, b) => a.t - b.t);
    for (const r of raw) {
      const last = ev[ev.length - 1];
      if (last && last.kind === "tick" && r.t - last.t0 < 0.012) { last.n++; last.x = (last.x * (last.n - 1) + r.x) / last.n; }
      else ev.push({ t: r.t, t0: r.t, kind: "tick", n: 1, x: r.x });
    }
    subjects.forEach((s, i) => ev.push({ t: t0 + s.x * D, kind: "scan", x: s.x, i, of: subjects.length }));
    ev.push({ t: t0, kind: "sweep", dur: D }, { t: t1, kind: "mapped" });
    ev.push({ t: t0, kind: "tone", dur: D, d0: 0, d1: D });
    for (let i = 1; i < dKeys.length; i++) {
      const a = dKeys[i - 1], b = dKeys[i];
      if (b.t > a.t) ev.push({ t: a.t, kind: "tone", dur: b.t - a.t, d0: a.v, d1: b.v });
      if (b.v === 0 && a.v > 0) ev.push({ t: b.t, kind: "snap" });
    }
    const lastKey = dKeys[dKeys.length - 1];
    if (lastKey.t < duration) ev.push({ t: lastKey.t, kind: "tone", dur: duration - lastKey.t, d0: lastKey.v, d1: lastKey.v, last: true });
    for (let i = 1; i < pKeys.length; i++) {
      const a = pKeys[i - 1], b = pKeys[i];
      if (JSON.stringify(a.mix) !== JSON.stringify(b.mix)) ev.push({ t: a.t, kind: "fold", dur: b.t - a.t });
    }
    return ev.sort((a, b) => a.t - b.t);
  };

  return { t0, t1, D, delay, weights, profile, lag, worldTime, nodes, scan, events, delayKeys: dKeys, profileKeys: pKeys };
}

/**
 * createToys(T = STYLE_SPEC.toys) -> closed-form motion in WORLD time w (rigid, periodic, defined for every w):
 *   beamAngle(w) rad about the beam's long axis · rodY(w) m · metAngle(w) rad · tickIndex(w) (changes at each extreme)
 */
export function createToys(T) {
  const P = T.metronome.period;
  return {
    beamAngle: (w) => TAU * T.beam.rate * w,
    rodY: (w) => T.rod.y + T.rod.amp * Math.sin((TAU * w) / T.rod.period),
    metAngle: (w) => T.metronome.swing * Math.sin((TAU * w) / P),
    tickIndex: (w) => Math.floor((w - P / 4) / (P / 2)),
    /** x positions of the metronomes (world) */
    metX: () => Array.from({ length: T.metronome.count }, (_, i) => -T.metronome.span / 2 + (T.metronome.span * i) / (T.metronome.count - 1)),
  };
}

/** sliceVoices(S = STYLE_SPEC.sound) -> voices for scoreFromEvents (pan follows the event's screen x). */
export function sliceVoices(S) {
  const hz = (d) => S.tone.base * 2 ** (d / S.tone.octavePer);
  const pan = (e) => clamp((e.x ?? 0.5) * 2 - 1, -1, 1) * 0.7;
  return {
    tick: (e) => [{ type: "tick", gain: e.n > 3 ? S.tick.unison : S.tick.gain * (0.75 + 0.25 * e.n), pitch: 0.8 + 0.5 * e.x, dur: 0.035, pan: pan(e) }],
    scan: (e) => [{ type: "blip", gain: S.scan.gain, dur: 0.07, notes: [0], pitch: 2 ** ((e.i * 2 - 6) / 12), pan: pan(e) }],
    sweep: (e) => [{ type: "whoosh", dir: "out", dur: 0.7, gain: 0.3, pan: -0.5 }],
    mapped: () => [{ type: "chime", gain: 0.32, dur: 1.3, notes: 4, pan: 0.5 }],
    tone: (e) => [{ type: "whir", gain: S.tone.gain * (e.d0 === 0 && e.d1 === 0 ? 0.45 : 1), dur: e.dur + S.tone.overlap, hz: hz(e.d0), hz2: hz(e.d1), grit: S.tone.grit, pan: 0 }],
    snap: () => [{ type: "pop", gain: 0.5 }, { type: "thud", gain: 0.42, dur: 0.35 }],
    fold: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.6, e.dur), gain: 0.26 }, { type: "chime", gain: 0.34, dur: 1.6, notes: 6, offset: e.dur }],
  };
}
