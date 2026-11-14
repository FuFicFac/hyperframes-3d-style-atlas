// scene.config.js — 46-mixing-console: "Balancing a mix" on a vintage analogue console (SAMPLE DATA levels).
// Plain data + the style's pure mix planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The SCORE is the mix itself: one synthesized event per planned note, at the gain the console
// gives it (fader law x EQ x mute/solo x master) — the same gains that drive the VU needles and LED columns.
import { STYLE_SPEC as S } from "./_atlas/styles/mixing-console/spec.js";
import { planMix, mixScore, controlVoices, consoleLayout, fitShot, windowCheck } from "./_atlas/styles/mixing-console/mixplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "46-mixing-console";
export const STYLE = "mixing-console";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats (one short label each)
export const BEATS = [
  { id: "rhythm", t: 0, dur: 3.2, label: "Push the rhythm group up" },
  { id: "balance", t: 3.2, dur: 3.0, label: "Bass up, keys down" },
  { id: "eq", t: 6.2, dur: 3.2, label: "Solo the keys, shape EQ" },
  { id: "mute", t: 9.4, dur: 2.8, label: "Mute the hats" },
  { id: "mix", t: 12.2, dur: 2.8, label: "Hear the balanced mix" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABEL_FADE = { inDur: 0.2, outDur: 0.12 };
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.06 : 0.15, off: BEATS[i + 1] ? BEATS[i + 1].t - LABEL_FADE.outDur : Infinity }));

// ---- the console: six channels (names on the console tape) + master. Levels are SAMPLE DATA (stamped on screen).
export const CHANNELS = [
  { id: "kick", label: "KICK", kind: "kick", level: 1.0, fader: 0, knobs: { gain: 0.55, lo: 0.2, pan: 0 } },
  { id: "snare", label: "SNARE", kind: "snare", level: 0.95, fader: 0, knobs: { gain: 0.5, hi: 0.2, pan: 0.1 } },
  { id: "hats", label: "HATS", kind: "hats", level: 0.9, fader: 0, knobs: { gain: 0.45, hi: 0.3, lo: -0.4, pan: 0.4 } },
  { id: "bass", label: "BASS", kind: "bass", level: 1.0, fader: 0.5, knobs: { gain: 0.5, lo: 0.3, mid: -0.1, pan: 0 } },
  { id: "keys", label: "KEYS", kind: "keys", level: 0.95, fader: 0.8, knobs: { gain: 0.5, pan: -0.3 } },
  { id: "pad", label: "PAD", kind: "pad", level: 0.9, fader: 0.64, knobs: { gain: 0.45, hi: -0.2, pan: 0 } },
];
const at = (id, off = 0) => B[id].t + off;
export const AUTOMATION = [
  // rhythm: three faders as one automated group
  { kind: "fader", ch: ["kick", "snare", "hats"], at: at("rhythm", 0.6), to: [0.74, 0.7, 0.66], dur: 1.25 },
  // balance: turn this up, that down
  { kind: "fader", ch: "bass", at: at("balance", 0.55), to: 0.77, dur: 0.95 },
  { kind: "fader", ch: "keys", at: at("balance", 1.45), to: 0.68, dur: 0.95 },
  // eq: solo the keys, then cut MID and lift HI — the curve reshapes
  { kind: "button", ch: "keys", name: "solo", at: at("eq", 0.45) },
  { kind: "knob", ch: "keys", name: "mid", at: at("eq", 1.0), to: -0.5, dur: 0.55 },
  { kind: "knob", ch: "keys", name: "hi", at: at("eq", 1.75), to: 0.8, dur: 0.75 },
  { kind: "button", ch: "keys", name: "solo", at: at("mute", 0.3) },
  // mute: the hats drop out of the mix
  { kind: "button", ch: "hats", name: "mute", at: at("mute", 1.1) },
  // mix: the master comes up a touch
  { kind: "fader", ch: "master", at: at("mix", 0.5), to: 0.8, dur: 1.1 },
].map((a) => (a.kind === "button" ? { ...a, on: a.on ?? true } : a));
// button toggles: the second press on the keys solo releases it
{
  const seen = {};
  for (const a of AUTOMATION) if (a.kind === "button") { const k = `${a.ch}.${a.name}`; a.on = !seen[k]; seen[k] = a.on; }
}
export const MIX = planMix(S, { channels: CHANNELS, automation: AUTOMATION, duration: DURATION });
export const EQ_FOR = "keys";
export const JOG = { at: at("mix", 0.3), dur: 2.2, turns: 0.6 };   // the shuttle wheel spins up in the final wide

// ---- layout + camera: computed shots (strips from the tape label to the top of the meter bridge, under the caption)
export const LAYOUT = consoleLayout(S, { channels: CHANNELS.length });
const FOV = S.camera.fov;
const box = (i0, i1, o) => boxCorners(...LAYOUT.stripBox(i0, i1, o));
const WIN = { x0: -0.86, x1: 0.86, y0: -0.86, y1: 0.56 };
const shot = (pts, elev, azim, win = WIN) => fitShot(pts, { elev, azim, fov: FOV, win });
export const REGIONS = {
  rhythm: box(0, 2, { zone: "front" }), balance: box(3, 4, { zone: "front" }), eq: box(4, "master", { zone: "meters" }),
  mute: box(1, 3, { zone: "front" }), mix: box(0, "master"),
};
const SHOTS = {
  open: shot(REGIONS.rhythm, 0.4, -0.22),
  rhythm: shot(REGIONS.rhythm, 0.46, -0.1),
  balance: shot(REGIONS.balance, 0.46, 0.08),
  eq: shot(REGIONS.eq, 0.3, 0.1),
  mute: shot(REGIONS.mute, 0.46, -0.06),
  mix: shot(REGIONS.mix, 0.36, 0.0, { x0: -0.87, x1: 0.87, y0: -0.88, y1: 0.64 }),
};
const key = (t, s, e = "inOutSine") => ({ t, ...s, ease: e });
const MOVE = 0.9;
export const CAMERA = [
  key(0, SHOTS.open),
  key(at("rhythm", 2.6), SHOTS.rhythm, "inOutSine"),
  key(at("balance", 0), SHOTS.rhythm),
  key(at("balance", MOVE), SHOTS.balance),
  key(at("eq", 0), SHOTS.balance),
  key(at("eq", MOVE), SHOTS.eq),
  key(at("mute", 0), SHOTS.eq),
  key(at("mute", MOVE), SHOTS.mute),
  key(at("mix", 0), SHOTS.mute),
  key(at("mix", 1.4), SHOTS.mix, "inOutCubic"),
  key(DURATION, { ...SHOTS.mix, pos: SHOTS.mix.pos.map((v, i) => SHOTS.mix.target[i] + (v - SHOTS.mix.target[i]) * 0.985) }, "linear"),
];

// ---- framing gate: the strips being adjusted (with their meters) stay inside the window under the caption
const regions = (t) => {
  const b = [...BEATS].reverse().find((x) => t >= x.t);
  if (!b) return [];
  const settled = b.id === "rhythm" ? true : t >= b.t + (b.id === "mix" ? 1.4 : MOVE);
  return settled ? [{ id: b.id, pts: REGIONS[b.id] }] : [];
};
export const FRAMING = windowCheck(CAMERA, regions, { duration: DURATION, drift: S.camera.drift, fov: FOV, win: { y1: 0.68 } });   // caption card bottom = NDC 0.70
export const FRAMING_KIT = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.9 });
if (!FRAMING.ok || !FRAMING_KIT.ok) throw new Error(`framing gate failed: ${JSON.stringify(FRAMING.fails.slice(0, 3))} ${JSON.stringify(FRAMING_KIT.spans.slice(0, 3))}`);

export const OBJECTS = [
  { id: "room", primitive: "procedural", factory: "studioRoom", procedural: "slatted walnut studio wall 2.7 m behind the console + dark floor", dims: {} },
  { id: "tapeMachine", primitive: "procedural", factory: "tapeMachine", procedural: "reel-to-reel tape machine behind the console: walnut cabinet, brushed faceplate, two turning aluminium reels, head block", dims: {} },
];

// ---- SCORE: the mix (one event per note at the console's gain) + the controls (fader whirs, button clacks, detent ticks)
export const SCORE = [
  ...mixScore(MIX, S.mix.voices, { seedBase: 2001 }),
  ...scoreFromEvents(MIX.events, controlVoices(S.mix.controls), { seedBase: 701 }),
  ...LABELS.map((L, i) => ({ t: L.on, type: "tick", dur: 0.015, gain: 0.05, pitch: 0.9, seed: 31 + i })),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  data: "SAMPLE DATA: channel levels, fader positions and meter readings are placeholders (stamped on screen).",
  mechanism: "mixplan.js: automation tracks -> fader/knob/button positions; a 120 bpm four-bar pattern -> notes; each note's gain = velocity x level x fader law x EQ x mute/solo x master at its onset; meters = closed-form 2nd-order needle response to those notes; SCORE = the same notes synthesized.",
  framing: `window check ${FRAMING.ok ? "ok" : "FAIL"} (worst over ${FRAMING.worst.over} at ${FRAMING.worst.t}s); kit 90% safe ${FRAMING_KIT.ok ? "ok" : "FAIL"} (worst ${FRAMING_KIT.worst.ndc})`,
  events: MIX.events.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind, ch: e.ch })),
};
