// styles/embossed-letterpress/pressplan.js — THREE-free press schedule (Node-safe). style.js reads it for the
// picture (die pose, relief amount, sheet dip, camera kick, light keys); scene.config.js reads it for SCORE,
// so every thud lands on the frame where the die touches the paper.
import { clamp, ease, lerp } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";

const P0 = STYLE_SPEC.press;

/**
 * planPresses(presses, opts?) -> plan[]
 *   presses: [{ id, at (contact time, s), x, y (die centre on the card, m), w, h (die face size, m),
 *               from?: [dx,dy,dz] off-frame offset, kind?: "ink"|"foil"|"deboss"|"emboss", layers?: [layerIds] }]
 *   Fills timing from spec.press (approach, settle, hover, dwell, lift, exit, reliefIn) unless overridden per press.
 *   Each plan has: start (die enters), contact, release (die starts lifting), clear (die gone), reveal (die high
 *   enough that the impression is visible).
 */
export function planPresses(presses, opts = {}) {
  return presses.map((p) => {
    const o = { ...P0, ...opts, ...p };
    const contact = o.at;
    return {
      ...o,
      start: contact - o.approach,
      contact,
      release: contact + o.dwell,
      reveal: contact + o.dwell + o.lift * 0.55,
      clear: contact + o.dwell + o.lift + o.exit,
      from: o.from ?? P0.from,
    };
  });
}

/**
 * dieState(t, plan) -> { visible, offset:[x,y,z] (die face centre in card space; z = height of the face above
 *   the sheet, negative = pressed into it), contact (0..1 pressure envelope), relief (0..1), phase }
 *   Pure function of t. Approach: outCubic travel to the hover point, then inQuad straight down (heavy).
 *   Dwell: the face sits ~relief depth below the surface. Lift: outCubic straight up, then inCubic away.
 */
export function dieState(t, p) {
  const { start, contact, release, clear, hover, settle, lift, from } = p;
  const relief = reliefAt(t, p);
  if (t < start || t >= clear) return { visible: false, offset: [p.x + from[0], p.y + from[1], hover + from[2]], contact: 0, relief, phase: t < start ? "before" : "after" };
  let off = [0, 0, 0], z = 0, phase;
  if (t < contact - settle) {
    const u = ease.outCubic(clamp((t - start) / (contact - settle - start)));
    off = from.map((v) => v * (1 - u));
    z = hover;
    phase = "approach";
  } else if (t < contact) {
    const u = ease.inQuad(clamp((t - (contact - settle)) / settle));
    z = hover * (1 - u);
    phase = "settle";
  } else if (t < release) {
    z = -0.0025 * clamp((t - contact) / 0.06);
    phase = "dwell";
  } else if (t < release + lift) {
    const u = ease.outCubic(clamp((t - release) / lift));
    z = lerp(-0.0025, hover, u);
    phase = "lift";
  } else {
    const u = ease.inCubic(clamp((t - release - lift) / p.exit));
    off = from.map((v) => v * u);
    z = hover;
    phase = "exit";
  }
  return { visible: true, offset: [p.x + off[0], p.y + off[1], z + off[2]], contact: contactAt(t, p), relief, phase };
}

/** reliefAt(t, plan) -> 0..1: the impression forms under the die right after contact (outCubic over reliefIn). */
export function reliefAt(t, p) {
  return ease.outCubic(clamp((t - p.contact) / p.reliefIn));
}

/** contactAt(t, plan) -> 0..1 pressure envelope (sheet dip): fast in at contact, held, released with the lift. */
export function contactAt(t, p) {
  if (t < p.contact) return 0;
  const inn = ease.outCubic(clamp((t - p.contact) / 0.07));
  const out = 1 - ease.inOutSine(clamp((t - p.release) / (p.lift * 0.6)));
  return inn * out;
}

/** kickAt(t, plans) -> small damped camera nudge (m) summed over contacts. */
export function kickAt(t, plans, k = P0.kick) {
  let s = 0;
  for (const p of plans) {
    const d = t - p.contact;
    if (d > 0 && d < 1.2) s += k.amount * Math.exp(-d * k.decay) * Math.sin(d * k.freq);
  }
  return s;
}

/** pressEvents(plans) -> [{ t, kind, id, x }] — the sound/visual cue list (approach, contact, lift, reveal). */
export function pressEvents(plans) {
  const ev = [];
  for (const p of plans) {
    ev.push({ t: Math.max(0, p.start + 0.05), kind: "approach", id: p.id, x: p.x });
    ev.push({ t: p.contact, kind: "contact", id: p.id, x: p.x });
    ev.push({ t: p.release, kind: "lift", id: p.id, x: p.x });
    ev.push({ t: p.reveal, kind: p.kind === "foil" ? "foil" : "reveal", id: p.id, x: p.x });
  }
  return ev.sort((a, b) => a.t - b.t);
}

/**
 * keyed(t, keys) -> number: piecewise interpolation of [{ t, v, ease? }] (ease applies to the segment arriving at
 * a key, default inOutSine). Holds before the first and after the last key.
 */
export function keyed(t, keys) {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) return lerp(a.v, b.v, (ease[b.ease ?? "inOutSine"] ?? ease.inOutSine)(clamp((t - a.t) / (b.t - a.t))));
  }
  return keys[keys.length - 1].v;
}

/** flashAt(t, flashes:[{ t, dur, from=-0.7, to=0.7, peak=1 }]) -> { level, pos }: the foil highlight band. */
export function flashAt(t, flashes) {
  let level = 0, pos = -9;
  for (const f of flashes) {
    const u = (t - f.t) / f.dur;
    if (u < 0 || u > 1) continue;
    const l = Math.sin(Math.PI * u) ** 0.6 * (f.peak ?? 1);
    if (l > level) { level = l; pos = lerp(f.from ?? -0.7, f.to ?? 0.7, ease.inOutSine(u)); }
  }
  return { level, pos };
}
