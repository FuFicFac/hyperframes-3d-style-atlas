// styles/wam-house/rundown.js — the channel package's RUNDOWN: pure timing plans for every component
// (THREE-free, no window, Node-safe; imports only kit/time.js). style.js reads a plan for the picture and
// scene.config.js reads the SAME plan for SCORE and camera keys, so sound and cuts land on the picture.
//
// House rule encoded here: THE RULE draws on first; every other element is timed from the rule's END.
import { clamp, ease, lerp } from "../../kit/time.js";

/** back-out with a chosen overshoot s (1.25 ≈ 6 % overshoot; kit outBack is 1.70158 ≈ 10 %). */
export const outBackS = (u, s = 1.25) => { u = clamp(u); const v = u - 1; return 1 + (s + 1) * v * v * v + s * v * v; };
/** 0 → 1 over [on, on + dur] with an ease name from kit/time.js (or a function). */
export const prog = (t, on, dur, e = "linear") => (dur <= 0 ? (t >= on ? 1 : 0) : (typeof e === "function" ? e : ease[e])(clamp((t - on) / dur)));
/** characters shown at t for a type-on of n chars at cps. */
export const typed = (t, on, n, cps = 38) => Math.max(0, Math.min(n, Math.floor((t - on) * cps + 1e-6) + (t >= on ? 1 : 0)));

/** riseSchedule(text, start, { stagger }) -> [{ ch, i, on }] for every non-space glyph (spaces keep their slot). */
export function riseSchedule(text, start, { stagger = 0.055 } = {}) {
  const out = [];
  let k = 0;
  [...text].forEach((ch, i) => { if (ch !== " ") out.push({ ch, i, on: start + k++ * stagger }); });
  return out;
}

// ------------------------------------------------------------------------------------------- plans -----
// Every plan returns times (s) plus `events`: [{ t, kind, ...}] for the sound layer (see `voices` below).

/** IDENT: rule draws → capitals rise → tagline types; the sonic logo starts with the rule. */
export function identPlan(t0, { text = "WHY AI MATTERS", tagline = "", rule = 0.42, stagger = 0.055, rise = 0.5 } = {}) {
  const ruleOn = t0, ruleEnd = t0 + rule;
  const letters = riseSchedule(text, ruleEnd - 0.08, { stagger });
  const landAt = letters.length ? letters[letters.length - 1].on + rise * 0.62 : ruleEnd;
  const tagOn = landAt + 0.05;
  const logoAt = landAt - 0.56;          // the 4th (big) logo note lands with the last letter
  return {
    t0, rule: { on: ruleOn, dur: rule }, letters, rise, landAt,
    tag: { on: tagOn, n: tagline.length, cps: 40 },
    events: [
      { t: ruleOn, kind: "ruleDraw" },
      { t: logoAt, kind: "logo" },
      { t: tagOn, kind: "type", n: tagline.length },
    ],
  };
}

/** LOWER THIRD: rule → paper name plate unfolds down from it → name letters rise → mono line types → out. */
export function lowerThirdPlan(t0, { hold = 1.6, name = "", sub = "", stagger = 0.03 } = {}) {
  const rule = { on: t0, dur: 0.3 };
  const plate = { on: rule.on + rule.dur - 0.06, dur: 0.28 };
  const nameOn = plate.on + 0.08;
  const subOn = plate.on + plate.dur;
  const readyAt = Math.max(nameOn + name.replace(/ /g, "").length * stagger + 0.3, subOn + sub.length / 44);
  const out = { on: readyAt + hold, dur: 0.32 };
  return {
    t0, rule, plate, name: { on: nameOn, stagger, dur: 0.32 }, sub: { on: subOn, n: sub.length, cps: 44 }, readyAt, out,
    end: out.on + out.dur,
    events: [
      { t: rule.on, kind: "ruleDraw", small: true },
      { t: plate.on, kind: "unfold" },
      { t: subOn, kind: "type", n: sub.length },
      { t: out.on, kind: "out" },
    ],
  };
}

/** CHAPTER CARD: card flips in (spring), the rule fills chapter k of n on the card, label holds. */
export function chapterPlan(t0, { index = 1, count = 3 } = {}) {
  const flip = { on: t0, settle: t0 + 0.55 };
  const rule = { on: t0 + 0.42, dur: 0.42 };
  return {
    t0, flip, rule, index, count, stack: { on: t0 - 0.05, step: 0.07 },
    events: [
      { t: flip.on, kind: "flip" },
      { t: flip.on + 0.36, kind: "land", soft: true },
      { t: rule.on, kind: "ruleDraw", small: true },
    ],
  };
}

/** KEY STAT: rule plinth draws → digits rise → value counts up (pure f(t)) → lands; label types; sample tag. */
export function statPlan(t0, { value = 3, decimals = 1, countDur = 1.15, label = "", tagOn = null } = {}) {
  const rule = { on: t0, dur: 0.38 };
  const rise = { on: rule.on + rule.dur - 0.08, dur: 0.45 };
  const count = { on: rise.on + 0.12, dur: countDur };
  const landAt = count.on + count.dur;
  // a tick each time the shown value passes a whole number (and the final value)
  const ticks = [];
  for (let k = 1; k <= Math.floor(value); k++) ticks.push(count.on + countDur * invOutCubic(k / value));
  return {
    t0, rule, rise, count, landAt, value, decimals,
    label: { on: rise.on + 0.3, n: label.length, cps: 44 },
    tag: { on: tagOn ?? rule.on + 0.2 },
    events: [
      { t: rule.on, kind: "ruleDraw" },
      ...ticks.map((t, k) => ({ t, kind: "count", k })),
      { t: landAt, kind: "land" },
      { t: rise.on + 0.3, kind: "type", n: label.length },
    ],
  };
}
// t for outCubic(u) = y  →  u = 1 - (1 - y)^(1/3)
function invOutCubic(y) { return 1 - Math.cbrt(1 - clamp(y)); }

/** shown value of a key stat at t (pure). */
export function statValue(t, plan) {
  const u = prog(t, plan.count.on, plan.count.dur, "outCubic");
  return plan.value * u;
}
/** text for a key stat: decimals while counting, the clean final value once landed ("3×"). */
export function statText(v, plan, { suffix = "×" } = {}) {
  const done = v >= plan.value - 1e-9;
  const fin = Number.isInteger(plan.value) ? String(plan.value) : plan.value.toFixed(plan.decimals);
  return (done ? fin : v.toFixed(plan.decimals)) + suffix;
}

/** END CARD: rule → CTA capitals rise → mono line → the ident bug settles in its corner; short logo reprise. */
export function endPlan(t0, { text = "SUBSCRIBE", line = "", rule = 0.42, stagger = 0.06, rise = 0.5 } = {}) {
  const ruleEnd = t0 + rule;
  const letters = riseSchedule(text, ruleEnd - 0.08, { stagger });
  const landAt = letters.length ? letters[letters.length - 1].on + rise * 0.62 : ruleEnd;
  const lineOn = landAt + 0.05;
  const bug = { on: lineOn + 0.35, dur: 0.55 };
  return {
    t0, rule: { on: t0, dur: rule }, letters, rise, landAt, line: { on: lineOn, n: line.length, cps: 40 }, bug,
    events: [
      { t: t0, kind: "ruleDraw" },
      { t: landAt, kind: "land" },
      { t: lineOn, kind: "type", n: line.length },
      { t: bug.on + 0.3, kind: "logo", reprise: true },
    ],
  };
}

/** QUOTE (paper card variant): card slides up, rule draws down its left edge, attribution types. */
export function quotePlan(t0, { attribution = "" } = {}) {
  return {
    t0, slide: { on: t0, dur: 0.5 }, rule: { on: t0 + 0.35, dur: 0.4 }, attr: { on: t0 + 0.75, n: attribution.length, cps: 40 },
    events: [{ t: t0, kind: "slide" }, { t: t0 + 0.35, kind: "ruleDraw", small: true }, { t: t0 + 0.75, kind: "type", n: attribution.length }],
  };
}

// ------------------------------------------------------------------------------------------- camera ----
/**
 * whipCamera(sets, { dur, settle, dolly }) -> camera keys for kit/camera.js.
 *   sets: [{ x, arrive, pos:[dx,y,z], target:[dx,y,z], fov }] in order. Set 0 is framed from t = 0. Each later set
 *   is reached by a WHIP (lateral truck, inOutExpo, `dur` s, ending at `arrive`) that overshoots the hold pose by
 *   `dolly` m of distance, then a short outCubic dolly-in (`settle` s). Then the camera is locked until the next whip.
 */
export function whipCamera(sets, { dur = 0.45, settle = 0.6, dolly = 0.55 } = {}) {
  const keys = [];
  const pose = (s, back = 0) => ({
    pos: [s.x + s.pos[0], s.pos[1], s.pos[2] + back],
    target: [s.x + s.target[0], s.target[1], s.target[2]],
    fov: s.fov,
  });
  sets.forEach((s, i) => {
    if (i === 0) {
      keys.push({ t: 0, ...pose(s, dolly * 0.6) });
      keys.push({ t: s.arrive + settle, ...pose(s), ease: "outCubic" });
    } else {
      const prev = sets[i - 1];
      keys.push({ t: s.arrive - dur, ...pose(prev), ease: "linear" });   // locked hold until the whip starts
      keys.push({ t: s.arrive, ...pose(s, dolly), ease: "inOutExpo" });   // the whip
      keys.push({ t: s.arrive + settle, ...pose(s), ease: "outCubic" });  // the settle dolly
    }
  });
  return keys;
}
/** whip windows [{ start, end, from, to }] for blur/sound. */
export const whipWindows = (sets, dur = 0.45) => sets.slice(1).map((s, i) => ({ start: s.arrive - dur, end: s.arrive, from: sets[i].x, to: s.x }));

// ------------------------------------------------------------------------------------------- sound -----
/** sonicLogo(t0, logo = spec.sonicLogo, { gain = 1, from = 0 }) -> SCORE-ready entries (from = first note index). */
export function sonicLogo(t0, logo, { gain = 1, from = 0, seed = 300 } = {}) {
  const blips = logo.filter((n) => n.type === "blip");
  const skipped = new Set(blips.slice(0, from));
  const firstDt = blips[from]?.dt ?? 0;
  return logo
    .filter((n) => !skipped.has(n))
    .map((n, i) => {
      const { dt, gain: g = 1, ...rest } = n;
      return { ...rest, t: t0 + dt - firstDt, gain: g * gain, seed: seed + i };
    });
}

/**
 * voices(spec) -> the house sound palette for kit/schedule.scoreFromEvents: event kind -> voices.
 *   ruleDraw: a crisp tick + a short bright whoosh (the rule "zips" on)   type: a few soft ticks
 *   unfold/flip/slide: paper    land: thud    count: tick ladder rising in pitch    out: short whooshOut
 *   logo: the sonic logo (reprise = last two notes only)
 */
export function voices(spec) {
  return {
    ruleDraw: (e) => [
      { type: "whoosh", dur: e.small ? 0.28 : 0.4, pitch: 1.9, gain: e.small ? 0.16 : 0.22, q: 2.4 },
      { type: "tick", gain: 0.3, pitch: 1.6, offset: 0.02 },
    ],
    type: (e) => Array.from({ length: Math.min(6, Math.ceil((e.n ?? 8) / 5)) }, (_, k) => ({ type: "tick", gain: 0.09, pitch: 1.2 + 0.08 * (k % 3), offset: k * 0.115 })),
    unfold: () => [{ type: "paper", dur: 0.3, gain: 0.22, density: 0.5 }],
    flip: () => [{ type: "fold", dur: 0.42, gain: 0.32 }, { type: "whoosh", dur: 0.35, pitch: 1.4, gain: 0.14 }],
    slide: () => [{ type: "rustle", dur: 0.4, gain: 0.22 }],
    land: (e) => [{ type: "thud", gain: e.soft ? 0.32 : 0.55, pitch: e.soft ? 1.2 : 0.9, dur: 0.45 }],
    count: (e) => [{ type: "tick", gain: 0.26, pitch: 1.1 + 0.18 * e.k }, { type: "blip", gain: 0.08, pitch: 0.5946, notes: [e.k * 2], dur: 0.05 }],
    out: () => [{ type: "whooshOut", dur: 0.32, pitch: 1.6, gain: 0.16 }],
    logo: (e) => sonicLogo(e.t, spec.sonicLogo, { from: e.reprise ? 2 : 0, gain: e.reprise ? 0.8 : 1 }).map((n) => ({ ...n, seed: undefined })),
  };
}
/** whoosh entries for every whip (peak lands on arrival). */
export const whipSounds = (wins) => wins.map((w) => ({ t: w.start - 0.05, type: "whoosh", dur: 0.55, pitch: 0.9, gain: 0.34, q: 1.2 }));
/** the low bed: one pad across the piece (+ a quieter fifth-up layer), on the music bus. */
export const bed = (spec, duration) => [
  { t: 0, type: "pad", dur: duration, root: spec.bed.root, chord: spec.bed.chord, brightness: spec.bed.brightness, attack: 1.0, release: 1.8, gain: spec.bed.gain },
];
export { lerp };
