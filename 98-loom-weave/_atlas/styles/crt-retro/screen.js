// styles/crt-retro/screen.js — the CRT "program" planner. PURE: no THREE, no window, no DOM; imports only
// kit/time.js and kit/bitmapfont.js, so scene.config.js can import it too and derive the SCORE (one clack per
// key, beeps on replies, power thump/whine) from exactly the schedule the picture draws.
//
//   planScreen(program, { cols, rows, typing, seed }) -> plan
//     program items (processed in order; `after: "<id>"` + `gap` chains an item to the END of an earlier one):
//       { type: "power", at, on: true|false }                    power on / off (tube animation + sounds)
//       { type: "type",  at, row, col, text, cps?, enter?, id }  a human types (seeded cadence, key events)
//       { type: "print", at, row, col, text, cps?, beep?, dim?, scale? }   the machine prints (fast)
//       { type: "prompt", at, row, col, text }                   instant text (e.g. "> "), cursor parks after it
//       { type: "clear", at, dur }                               top-to-bottom beam wipe erases what's on screen
//       { type: "box", at, row0, col0, row1, col1, cps? }        ASCII box traced around its perimeter
//       { type: "bar", at, row, col, len, dur? }                 block bar growing left to right (bar charts)
//       { type: "invert", at, row, col, len, dur? }              inverse-video highlight sweeping over cells
//       { type: "cursor", at, show?, row?, col? }                hide/show or move the cursor
//     `text` may contain "\n" (next row, same col). scale: 2 = double-size characters (2x2 cells).
//   plan = { cols, rows, cells:[{row,col,ch,on,off,scale,dim}], inverts:[...], wipes:[...], cursor:[{t,row,col,scale,show}],
//            power:[{t,on}], events:[{t,kind,ch?,key?,shift?}], items:[{...item, start, end}], end }
//   cursorAt(plan, t) -> { row, col, scale, show, since }   cursorTrail(plan, t, s) -> [{row,col,scale,left,dwell}]
//   powerAt(plan, t) -> { on, phase, u }    keyPresses(plan, typing) -> { [keyId]: [{ down, up }] }
//   KEYBOARD_ROWS, keyFor(ch) -> { key, shift }    GLYPHS (5x7 font + extras), BOX_CHARS
import { rng, clamp } from "../../kit/time.js";
import { FONT_5X7, FONT_W, FONT_H, BOX_CHARS } from "../../kit/bitmapfont.js";

const G = (s) => s.split(" ");
// GLYPHS = the kit 5x7 font, which now includes this style's extra glyphs (promoted 2026-11-13, identical rows)
export const GLYPHS = { ...FONT_5X7 };
export { FONT_W, FONT_H };
/** Box-drawing characters are drawn edge-to-edge across the whole 6x10 cell so neighbours connect. */
export { BOX_CHARS }; // kit/bitmapfont.js [left, up, right, down]
export const CELL = { w: 6, h: 10, glyphTop: 1 }; // font pixels per cell; glyph rows 1..7

// ------------------------------------------------------------------ keyboard layout (pure data)
// [label, width in key units, kind]. kind: "a" alpha (light caps), "m" modifier (dark caps). id = label unless given.
export const KEYBOARD_ROWS = [
  [["ESC", 1, "m"], ["1"], ["2"], ["3"], ["4"], ["5"], ["6"], ["7"], ["8"], ["9"], ["0"], ["-"], ["="], ["BS", 1.5, "m"]],
  [["TAB", 1.5, "m"], ["Q"], ["W"], ["E"], ["R"], ["T"], ["Y"], ["U"], ["I"], ["O"], ["P"], ["["], ["]"], ["\\", 1, "m"]],
  [["CTRL", 1.75, "m"], ["A"], ["S"], ["D"], ["F"], ["G"], ["H"], ["J"], ["K"], ["L"], [";"], ["'"], ["RETURN", 1.75, "m"]],
  [["SHIFT", 2.25, "m", "LSHIFT"], ["Z"], ["X"], ["C"], ["V"], ["B"], ["N"], ["M"], [","], ["."], ["/"], ["SHIFT", 2.25, "m", "RSHIFT"]],
  [["CAPS", 1.75, "m"], ["", 1.25, "m", "FN1"], ["", 8.5, "a", "SPACE"], ["", 1.25, "m", "FN2"], ["", 1.75, "m", "FN3"]],
];
const SHIFTED = { "?": "/", ">": ".", "<": ",", "!": "1", '"': "'", ":": ";", "_": "-", "+": "=", "(": "9", ")": "0", "*": "8", "#": "3", "%": "5" };
/** keyFor(ch) -> { key, shift } : which physical key types this character ("\n" = RETURN, " " = SPACE). */
export function keyFor(ch) {
  if (ch === "\n") return { key: "RETURN", shift: false };
  if (ch === " ") return { key: "SPACE", shift: false };
  if (SHIFTED[ch]) return { key: SHIFTED[ch], shift: true };
  const u = ch.toUpperCase();
  return { key: u, shift: false };
}

// ------------------------------------------------------------------ planner
const DEF_TYPING = { cps: 14, jitter: 0.32, spacePause: 0.05, wordHesitate: 0.12, hesitateLen: 0.16, shiftExtra: 0.05, minGap: 0.04,
  enterGap: 0.14, printCps: 55, boxCps: 160, keyHold: [0.05, 0.085], keyDown: 0.018, keyUp: 0.045 };

export function planScreen(program, o = {}) {
  const cols = o.cols ?? 32, rows = o.rows ?? 14;
  const T = { ...DEF_TYPING, ...(o.typing ?? {}) };
  const seed = o.seed ?? 1966;
  const cells = [], inverts = [], wipes = [], cursor = [], power = [], events = [], items = [];
  const byId = {};
  cursor.push({ t: -Infinity, row: 0, col: 0, scale: 1, show: false });
  const moveCursor = (t, row, col, scale = 1, show = true) => cursor.push({ t, row, col, scale, show });

  program.forEach((it0, idx) => {
    const it = { ...it0 };
    let at = it.at ?? 0;
    if (it.after != null) at = byId[it.after].end + (it.gap ?? 0);
    const r = rng(seed + idx * 7919);
    let end = at;
    const scale = it.scale ?? 1;
    const putChars = (text, times, kind) => {
      let row = it.row ?? 0, col = it.col ?? 0;
      [...text].forEach((ch, k) => {
        if (ch === "\n") { row += scale; col = it.col ?? 0; return; }
        if (ch !== " ") cells.push({ row, col, ch, on: times[k], off: Infinity, scale, dim: !!it.dim, src: idx });
        col += scale;
        if (kind) moveCursor(times[k], row, Math.min(col, cols - scale), scale);
      });
    };
    switch (it.type) {
      case "power": {
        power.push({ t: at, on: it.on !== false });
        events.push({ t: at, kind: it.on !== false ? "powerOn" : "powerOff" });
        if (it.on === false) moveCursor(at, 0, 0, 1, false);
        break;
      }
      case "type": {
        const cps = it.cps ?? T.cps;
        const times = [];
        let t = at;
        const chars = [...it.text];
        chars.forEach((ch, k) => {
          if (k > 0) {
            let gap = (1 / cps) * Math.exp(r.gaussian(0, T.jitter));
            const prev = chars[k - 1];
            if (prev === " ") gap += T.spacePause;
            if (prev === " " && r.chance(T.wordHesitate)) gap += T.hesitateLen * r.range(0.6, 1.4);
            if (keyFor(ch).shift) gap += T.shiftExtra;
            t += Math.max(T.minGap, gap);
          }
          times.push(t);
          if (ch === "\n") return;
          const kf = keyFor(ch);
          events.push({ t, kind: ch === " " ? "space" : "key", ch, key: kf.key, shift: kf.shift });
        });
        moveCursor(at, it.row ?? 0, it.col ?? 0, scale);
        putChars(it.text, times, true);
        end = times.length ? times[times.length - 1] : at;
        if (it.enter) {
          end += T.enterGap;
          events.push({ t: end, kind: "enter", key: "RETURN", shift: false });
        }
        break;
      }
      case "print": case "prompt": {
        const cps = it.type === "prompt" ? Infinity : it.cps ?? T.printCps;
        const chars = [...it.text];
        const times = chars.map((_, k) => at + (Number.isFinite(cps) ? k / cps : 0));
        if (it.beep) events.push({ t: at - 0.04, kind: "beep" });
        if (it.type === "print") times.forEach((tt, k) => { if (chars[k] !== " " && chars[k] !== "\n") events.push({ t: tt, kind: "print", ch: chars[k] }); });
        if (it.type === "prompt") moveCursor(at, it.row ?? 0, it.col ?? 0, scale);
        putChars(it.text, times, it.cursor !== false);
        end = times.length ? times[times.length - 1] : at;
        if (it.cursor === false) moveCursor(end, it.row ?? 0, it.col ?? 0, scale, false);
        break;
      }
      case "clear": {
        const dur = it.dur ?? 0.25;
        wipes.push({ at, dur });
        events.push({ t: at, kind: "clear", dur });
        moveCursor(at, 0, 0, 1, false);
        end = at + dur;
        break;
      }
      case "box": {
        const { row0, col0, row1, col1 } = it;
        const per = [];
        per.push([row0, col0, "┌"]);
        for (let c = col0 + 1; c < col1; c++) per.push([row0, c, "─"]);
        per.push([row0, col1, "┐"]);
        for (let rr = row0 + 1; rr < row1; rr++) per.push([rr, col1, "│"]);
        per.push([row1, col1, "┘"]);
        for (let c = col1 - 1; c > col0; c--) per.push([row1, c, "─"]);
        per.push([row1, col0, "└"]);
        for (let rr = row1 - 1; rr > row0; rr--) per.push([rr, col0, "│"]);
        const cps = it.cps ?? T.boxCps;
        per.forEach(([rr, c, ch], k) => cells.push({ row: rr, col: c, ch, on: at + k / cps, off: Infinity, scale: 1, dim: !!it.dim, src: idx }));
        events.push({ t: at, kind: "trace", dur: per.length / cps });
        end = at + (per.length - 1) / cps;
        break;
      }
      case "bar": {
        const dur = it.dur ?? 0.5;
        const n = Math.max(1, Math.round(it.len));
        for (let k = 0; k < n; k++) cells.push({ row: it.row, col: (it.col ?? 0) + k, ch: "█", on: at + (dur * k) / n, off: Infinity, scale: 1, dim: !!it.dim, src: idx });
        events.push({ t: at, kind: "trace", dur });
        end = at + dur;
        break;
      }
      case "invert": {
        const dur = it.dur ?? 0.25;
        inverts.push({ row: it.row, col: it.col ?? 0, len: it.len, at, dur, off: Infinity, src: idx });
        events.push({ t: at, kind: "invert", dur });
        end = at + dur;
        break;
      }
      case "cursor": {
        const last = cursor[cursor.length - 1];
        moveCursor(at, it.row ?? last.row, it.col ?? last.col, it.scale ?? last.scale, it.show !== false);
        break;
      }
      default: throw new Error(`planScreen: unknown item type "${it.type}"`);
    }
    const rec = { ...it, start: at, end };
    items.push(rec);
    if (it.id) byId[it.id] = rec;
  });

  // a clear erases everything revealed before it, row by row as the beam passes (cell centre)
  const wipeAt = (w, rowCentre) => w.at + w.dur * clamp(rowCentre / rows);
  for (const c of cells) for (const w of wipes) if (w.at >= c.on) { c.off = Math.min(c.off, wipeAt(w, c.row + c.scale / 2)); break; }
  for (const v of inverts) for (const w of wipes) if (w.at >= v.at) { v.off = Math.min(v.off, wipeAt(w, v.row + 0.5)); break; }
  cursor.sort((a, b) => a.t - b.t);
  events.sort((a, b) => a.t - b.t);
  power.sort((a, b) => a.t - b.t);
  const endT = Math.max(...items.map((i) => i.end));
  return { cols, rows, cells, inverts, wipes, cursor, power, events, items, byId, end: endT };
}

/** cursorAt(plan, t) -> current cursor { row, col, scale, show, since } (since = when it last moved). */
export function cursorAt(plan, t) {
  const C = plan.cursor;
  let i = 0;
  for (let k = 0; k < C.length; k++) if (C[k].t <= t) i = k;
  return { ...C[i], since: C[i].t };
}

/** cursorTrail(plan, t, trail) -> cells the cursor left within `trail` s: [{ row, col, scale, left, dwell }]. */
export function cursorTrail(plan, t, trail = 0.25) {
  const C = plan.cursor, out = [];
  for (let k = 1; k < C.length; k++) {
    if (C[k].t > t) break;
    const p = C[k - 1];
    if (t - C[k].t < trail && p.show && (p.row !== C[k].row || p.col !== C[k].col)) out.push({ row: p.row, col: p.col, scale: p.scale, left: C[k].t, dwell: C[k].t - p.t });
  }
  return out;
}

/** powerAt(plan, t) -> { on, at } the last power event at or before t ({ on:false, at:-Infinity } before any). */
export function powerAt(plan, t) {
  let p = { on: false, t: -Infinity };
  for (const e of plan.power) if (e.t <= t) p = e;
  return { on: p.on, at: p.t };
}

/** wipeAt(plan, t) -> { y (0..1 down the screen) } for an active clear beam, or null. */
export function wipeBeam(plan, t) {
  for (const w of plan.wipes) if (t >= w.at && t < w.at + w.dur) return { y: (t - w.at) / w.dur, at: w.at };
  return null;
}

/**
 * keyPresses(plan, typing) -> { [keyId]: [{ down, up }] } : when each 3D key is held. The key bottoms out at the
 * character's reveal time (down = t - keyDown); shift is held around shifted characters. Pure and seeded.
 */
export function keyPresses(plan, typing = {}, seed = 77) {
  const T = { ...DEF_TYPING, ...typing };
  const r = rng(seed);
  const out = {};
  const add = (k, down, up) => (out[k] ??= []).push({ down, up });
  for (const e of plan.events) {
    if (e.kind !== "key" && e.kind !== "space" && e.kind !== "enter") continue;
    const hold = r.range(T.keyHold[0], T.keyHold[1]) * (e.kind === "enter" ? 1.4 : 1);
    add(e.key, e.t - T.keyDown, e.t + hold);
    if (e.shift) add("LSHIFT", e.t - T.keyDown - 0.07, e.t + hold + 0.03);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.down - b.down);
  return out;
}

/** keyDepth(presses, t, typing) -> 0..1 how far a key with these presses is down at t (fast down, springy up). */
export function keyDepth(list, t, typing = {}) {
  const T = { ...DEF_TYPING, ...typing };
  let d = 0;
  if (!list) return 0;
  for (const p of list) {
    if (t < p.down || t > p.up + T.keyUp * 2.2) continue;
    let v;
    if (t < p.down + T.keyDown) v = (t - p.down) / T.keyDown;
    else if (t < p.up) v = 1;
    else {
      const u = (t - p.up) / T.keyUp;
      v = u < 1 ? 1 - u * u * (3 - 2 * u) : -0.12 * Math.sin(Math.PI * (u - 1) / 1.2) * Math.exp(-(u - 1) * 2); // slight overshoot
    }
    d = Math.max(d, v);
  }
  return clamp(d, -0.15, 1);
}

/** Cells drawn at t (on <= t < off): the picture and the glow spill both read this. */
export function visibleCells(plan, t) {
  return plan.cells.filter((c) => c.on <= t && t < c.off);
}

/**
 * typingScore(plan, voices?) -> SCORE events for kit/schedule.scoreFromEvents: per-key clacks, heavier space and
 * return, a soft beep on replies, faint print ticks, trace ticks, the clear sweep, and power on/off thump + whine.
 * Returns plain voice-maker functions; scene.config.js does SCORE = scoreFromEvents(plan.events, typingVoices()).
 */
export function typingVoices(o = {}) {
  const g = { key: 0.34, space: 0.42, enter: 0.5, beep: 0.12, print: 0.03, trace: 0.05, clear: 0.12, power: 1, ...(o.gain ?? {}) };
  const pitchOf = (e) => 0.85 + 0.35 * (((e.ch ?? "A").charCodeAt(0) * 37) % 11) / 10;
  return {
    key: (e) => [{ type: "clack", gain: g.key, pitch: pitchOf(e), dur: 0.09 }, { type: "click", gain: g.key * 0.4, pitch: 1.6, offset: 0.004 }],
    space: () => [{ type: "clack", gain: g.space, pitch: 0.62, dur: 0.12 }, { type: "thud", gain: g.space * 0.18, pitch: 2.4, dur: 0.08 }],
    enter: () => [{ type: "clack", gain: g.enter, pitch: 0.7, dur: 0.13 }, { type: "clack", gain: g.enter * 0.6, pitch: 0.55, dur: 0.12, offset: 0.07 }],
    beep: () => [{ type: "blip", gain: g.beep, pitch: 1.0, dur: 0.11, notes: [0] }],
    print: () => [{ type: "tick", gain: g.print, pitch: 1.8 }],
    trace: (e) => [{ type: "tick", gain: g.trace, pitch: 2.2 }, { type: "tick", gain: g.trace * 0.7, pitch: 2.0, offset: (e.dur ?? 0.3) * 0.5 }],
    clear: (e) => [{ type: "whoosh", gain: g.clear, dir: "out", dur: Math.max(0.25, (e.dur ?? 0.25) * 1.4), pitch: 2.2 }],
    powerOn: () => [
      { type: "thud", gain: 0.55 * g.power, pitch: 0.7, dur: 0.5 },
      { type: "click", gain: 0.35 * g.power, pitch: 0.8, offset: -0.02 },
      { type: "servo", gain: 0.1 * g.power, hz: 180, hz2: 1650, grit: 0.08, dur: 1.4, offset: 0.03 },
      { type: "buzz", gain: 0.06 * g.power, hz: 60, flicker: 0, dur: 0.9, offset: 0.05 },
    ],
    powerOff: () => [
      { type: "click", gain: 0.35 * g.power, pitch: 0.8 },
      { type: "servo", gain: 0.08 * g.power, hz: 1500, hz2: 140, grit: 0.06, dur: 0.9, offset: 0.02 },
      { type: "thud", gain: 0.3 * g.power, pitch: 1.1, dur: 0.3, offset: 0.03 },
    ],
  };
}
