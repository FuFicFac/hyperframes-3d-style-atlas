// styles/bead-abacus/beads.js — the bead planner: counts over time -> bead positions, landings and sound events.
// Pure: no THREE, no window, no DOM (Node-safe). Imported by style.js (the picture) AND by scene.config.js (SCORE,
// camera shots, framing gate), so every clack, slide whirr and marimba note lands on exactly the frame the beads do.
//
// ROD FRAME: a rod's inner span runs s = 0 (inner face of the LEFT post) .. s = L (inner face of the right post).
// Bead i (0 = leftmost) is COUNTED when it rests against the left stack: s = (i + .5) * pitch, and UNCOUNTED when it
// rests against the right stack: s = L - (n - i - .5) * pitch. Every bead travels the same distance D = L - n * pitch,
// so a moving group slides as one rigid block. Count c = beads 0..c-1 on the left.
//
//   frameLayout(S, o)                 -> rod length, row positions, label / plate / frame extents (metres, frame-local)
//   planRow({ n, initial, keys }, S)  -> row plan: moves, events, xAt(i, t), countAt(t), lastLand(t), positions(t)
//      keys: [{ at, count, mode: "block" | "each", stagger, dur }]   (a key slides beads until the row shows `count`)
//   planHundred({ keys: [{ at, value }] }, S)  -> 10 row plans filling a 10x10 frame row by row; valueAt(t)
//   carryKeys(...)                    -> keys for a ones rod + a tens rod that show "ten beads return, one moves on"
//   notePitch(count, S.sound.note)    -> pitch multiplier for the marimba-like note that follows the count
//   collectEvents(...plans)           -> sorted events; beadVoices(S.sound) -> voices for kit/schedule.scoreFromEvents
//   fitShot(pts, o) / framingCheck(keys, regions, o)   camera keys that frame a region below the caption; replay check
import { clamp, ease } from "../../kit/time.js";
import { sampleCameraKeys, screenExtent, cameraBasis } from "../../kit/framing.js";

// ------------------------------------------------------------------------------------------------ layout
/** pitch(S) -> centre-to-centre distance of resting beads along a rod (bead thickness + gap). */
export const beadPitch = (S) => S.bead.T + S.bead.gap;

/**
 * frameLayout(S, { rows = 3, beads = 10, travel = S.frame.travel (in bead pitches), rowPitch = S.frame.rowPitch,
 *   labels = true, plates = true | "total" | false, plateW, labelW }) -> {
 *   n, rows, pitch, L (inner rod span), D (travel distance), rowZ[r] (row 0 = far side = top of screen),
 *   rodY, inner: { x0, x1, z0, z1 }, outer: { x0, x1, z0, z1, h }, label: { x, w }, plate: { x, w }, box: [min, max] }
 * Frame-local metres: origin = frame centre on the table, rods along +X, y up. Labels sit left of the frame,
 * number plates right of it.
 */
export function frameLayout(S, o = {}) {
  const F = S.frame, n = o.beads ?? 10, rows = o.rows ?? 3;
  const pitch = beadPitch(S);
  const travel = o.travel ?? F.travel;
  const rowPitch = o.rowPitch ?? F.rowPitch;
  const L = n * pitch + travel * pitch;
  const D = L - n * pitch;
  const depthIn = (rows - 1) * rowPitch + 2 * F.margin;
  const rowZ = Array.from({ length: rows }, (_, r) => (r - (rows - 1) / 2) * rowPitch);
  const inner = { x0: -L / 2, x1: L / 2, z0: -depthIn / 2, z1: depthIn / 2 };
  const outer = { x0: -L / 2 - F.postW, x1: L / 2 + F.postW, z0: -depthIn / 2 - F.railD, z1: depthIn / 2 + F.railD, h: F.postH };
  const P = S.plate;
  const labelW = o.labelW ?? P.labelW, plateW = o.plateW ?? P.W;
  const label = o.labels === false ? null : { w: labelW, x: outer.x0 - P.gap - labelW / 2 };
  const totalW = o.plateW ?? P.W * 1.9;
  const plate = o.plates === false ? null
    : o.plates === "total" ? { w: totalW, x: outer.x1 + P.gap + totalW / 2, total: true }
    : { w: plateW, x: outer.x1 + P.gap + plateW / 2 };
  const xMin = label ? label.x - labelW / 2 : outer.x0, xMax = plate ? plate.x + plateW / 2 : outer.x1;
  const box = [[xMin, 0, outer.z0], [xMax, Math.max(F.postH, P.h), outer.z1]];
  return { n, rows, pitch, L, D, rowPitch, rowZ, rodY: F.rodY, inner, outer, label, plate, box };
}

/** worldBox(layout, at = [x, z], yaw = 0) -> [min, max] of the frame's box placed at `at` (yaw 0 or ±PI/2 only). */
export function worldBox(layout, at = [0, 0], yaw = 0) {
  const [a, b] = layout.box;
  const turned = Math.abs(Math.sin(yaw)) > 0.5;
  const x0 = turned ? a[2] : a[0], x1 = turned ? b[2] : b[0], z0 = turned ? a[0] : a[2], z1 = turned ? b[0] : b[2];
  return [[at[0] + Math.min(x0, x1), a[1], at[1] + Math.min(z0, z1)], [at[0] + Math.max(x0, x1), b[1], at[1] + Math.max(z0, z1)]];
}

// ------------------------------------------------------------------------------------------------ slide profile
/** slideU(u, S.slide) -> 0..1: a pushed group — quick off the mark, still moving when it meets the stack (so it clacks). */
export function slideU(u, P) {
  const k = clamp(u);
  const arrive = P.arrive ?? 0.3;                       // share of linear motion: the speed left at contact
  return (1 - arrive) * ease.outCubic(k) + arrive * k;
}
/** settle(tau, S.slide) -> metres the group sits back from its contact point tau s after landing (tiny damped hops). */
export function settle(tau, P) {
  if (tau <= 0) return 0;
  const hop = P.hop ?? 0.07, hops = P.hops ?? 3;
  if (tau >= hop * hops) return 0;
  return (P.bounce ?? 0.004) * Math.abs(Math.sin((Math.PI * tau) / hop)) * Math.exp(-tau * (P.decay ?? 22));
}

// ------------------------------------------------------------------------------------------------ one row
/**
 * planRow({ id, n = 10, initial = 0, keys = [], layout }, S) -> row
 *   keys: [{ at, count, mode = "block", stagger = S.slide.stagger, dur }] in time order. A "block" key moves every bead
 *   between the current and the target count as one rigid group; "each" moves them one at a time (one clack, one
 *   note per bead). Removing beads works the same way to the right (highest bead first in "each" mode).
 *   A key must start after the previous key's last bead has landed (checked; throws otherwise).
 * row = { id, n, L, D, pitch, moves: [{ at, dur, land, lo, hi, dir, countAfter }], events, end,
 *         xAt(i, t) (s along the rod, metres), positions(t) -> [s], countAt(t) (landed count), lastLand(t) -> time | -Infinity,
 *         targetAt(t) (the count being moved toward) }
 */
export function planRow(cfg, S) {
  const P = S.slide;
  const n = cfg.n ?? 10;
  const pitch = beadPitch(S);
  const L = cfg.layout?.L ?? n * pitch + (S.frame.travel * pitch);
  const D = L - n * pitch;
  const id = cfg.id ?? "row";
  const moves = [];
  let count = cfg.initial ?? 0, free = -Infinity;
  for (const k of cfg.keys ?? []) {
    const target = Math.max(0, Math.min(n, Math.round(k.count)));
    if (target === count) continue;
    if (k.at < free - 1e-6) throw new Error(`beads.planRow(${id}): key at ${k.at} starts before the previous move landed (${free.toFixed(3)})`);
    const dir = target > count ? -1 : 1;                 // -1 = toward the left (counting), +1 = back to the right
    const lo = Math.min(count, target), hi = Math.max(count, target);
    const mode = k.mode ?? "block";
    if (mode === "each") {
      const step = k.stagger ?? P.stagger;
      const m = hi - lo;
      for (let j = 0; j < m; j++) {
        const i = dir < 0 ? lo + j : hi - 1 - j;
        const at = k.at + j * step, dur = k.dur ?? P.dur;
        moves.push({ at, dur, land: at + dur, lo: i, hi: i + 1, dir, countAfter: dir < 0 ? i + 1 : i, beads: 1 });
      }
    } else {
      const dur = k.dur ?? P.dur + P.perBead * (hi - lo);
      moves.push({ at: k.at, dur, land: k.at + dur, lo, hi, dir, countAfter: target, beads: hi - lo });
    }
    count = target;
    free = Math.max(...moves.map((m) => m.land));
  }
  const counted = (i) => (i + 0.5) * pitch;
  const uncounted = (i) => L - (n - i - 0.5) * pitch;
  const initial = cfg.initial ?? 0;
  // per-bead move lists (time order) — computed once at plan time
  const perBead = Array.from({ length: n }, () => []);
  for (const m of moves) for (let i = m.lo; i < m.hi; i++) perBead[i].push(m);
  const lands = moves.map((m) => m.land).sort((a, b) => a - b);

  const xAt = (i, t) => {
    const list = perBead[i];
    let last = null;
    for (const m of list) { if (m.at <= t) last = m; else break; }
    if (!last) return i < initial ? counted(i) : uncounted(i);
    const from = last.dir < 0 ? uncounted(i) : counted(i);
    const to = last.dir < 0 ? counted(i) : uncounted(i);
    if (t < last.land) return from + (to - from) * slideU((t - last.at) / last.dur, P);
    return to - last.dir * settle(t - last.land, P);   // rebounds away from the stack it hit
  };
  const countAt = (t) => {
    let c = initial;
    for (const m of moves) if (m.land <= t) c = m.countAfter;
    return c;
  };
  const lastLand = (t) => {
    let best = -Infinity;
    for (const x of lands) if (x <= t) best = x;
    return best;
  };
  const targetAt = (t) => {
    let c = initial;
    for (const m of moves) if (m.at <= t) c = m.countAfter;
    return c;
  };
  const events = [];
  for (const m of moves) {
    events.push({ t: m.at, kind: "slide", row: id, dur: m.dur, beads: m.beads, dir: m.dir });
    events.push({ t: m.land, kind: "clack", row: id, beads: m.beads, count: m.countAfter, dir: m.dir });
  }
  return {
    id, n, L, D, pitch, moves, events, end: moves.length ? Math.max(...moves.map((m) => m.land)) : 0,
    xAt, positions: (t) => Array.from({ length: n }, (_, i) => xAt(i, t)), countAt, lastLand, targetAt,
    counted, uncounted,
  };
}

// ------------------------------------------------------------------------------------------------ hundred frame
/**
 * planHundred({ keys: [{ at, value, stagger = S.hundred.stagger, mode }], initial = 0, layout, noteStep = 5 }, S) -> {
 *   rows: [planRow x 10], events, valueAt(t), lastLand(t), end }
 * A 10 x 10 frame shows a value 0..100: row r holds clamp(value - 10 r, 0, 10). Rows that change move one after
 * another (top row first when filling, bottom first when emptying), `stagger` s apart.
 */
export function planHundred(cfg, S) {
  const H = S.hundred;
  const rowsK = Array.from({ length: 10 }, () => []);
  let value = cfg.initial ?? 0;
  for (const k of cfg.keys ?? []) {
    const v = Math.max(0, Math.min(100, Math.round(k.value)));
    const changed = [];
    for (let r = 0; r < 10; r++) {
      const a = clamp(value - 10 * r, 0, 10), b = clamp(v - 10 * r, 0, 10);
      if (a !== b) changed.push({ r, count: b });
    }
    if (v < value) changed.reverse();
    changed.forEach((c, j) => rowsK[c.r].push({ at: k.at + j * (k.stagger ?? H.stagger), count: c.count, mode: k.mode ?? "block" }));
    value = v;
  }
  const init = cfg.initial ?? 0;
  const rows = rowsK.map((keys, r) => planRow({ id: `h${r}`, n: 10, initial: clamp(init - 10 * r, 0, 10), keys, layout: cfg.layout }, S));
  // the total moves with the landings: sum of the landed counts
  const valueAt = (t) => rows.reduce((s, R) => s + R.countAt(t), 0);
  const lastLand = (t) => Math.max(...rows.map((R) => R.lastLand(t)));
  const events = collectEvents(...rows).map((e) => ({ ...e }));
  // a clack's note follows the frame total after that landing (one scale step per `noteStep` beads)
  for (const e of events) if (e.kind === "clack") { e.total = valueAt(e.t + 1e-6); e.count = Math.round(e.total / (cfg.noteStep ?? 5)); }
  return { rows, events, valueAt, lastLand, end: Math.max(0, ...rows.map((R) => R.end)) };
}

// ------------------------------------------------------------------------------------------------ carry
/**
 * carryKeys({ ones, tens, add, at, step = S.slide.stagger, pause = .25 }, S) -> { ones: keys, tens: keys, end }
 * Adds `add` to a two-rod place-value display (ones rod + tens rod), one bead at a time; when the ones rod reaches
 * ten, all ten slide back as a block and one tens bead moves on — the carry, shown as moves.
 */
export function carryKeys({ ones = 0, tens = 0, add = 1, at = 0, step, pause = 0.25 }, S) {
  const P = S.slide, st = step ?? P.stagger;
  const out = { ones: [], tens: [] };
  let t = at, o = ones, ten = tens, left = add;
  while (left > 0) {
    const room = 10 - o, k = Math.min(room, left);
    out.ones.push({ at: t, count: o + k, mode: "each", stagger: st });
    t += (k - 1) * st + P.dur + pause;
    o += k; left -= k;
    if (o === 10) {
      out.ones.push({ at: t, count: 0, mode: "block" });
      out.tens.push({ at: t + 0.12, count: ten + 1, mode: "block" });
      t += P.dur + P.perBead * 10 + pause + 0.12;
      o = 0; ten += 1;
    }
  }
  return { ...out, end: t, result: ten * 10 + o };
}

// ------------------------------------------------------------------------------------------------ sound
/** notePitch(count, { scale = [0,2,4,7,9], base = .5 }) -> pitch multiplier: pentatonic steps rising with the count. */
export function notePitch(count, N = {}) {
  const scale = N.scale ?? [0, 2, 4, 7, 9], base = N.base ?? 0.5;
  const c = Math.max(0, Math.round(count));
  const step = Math.floor(c / scale.length) * 12 + scale[c % scale.length];
  return base * 2 ** (Math.min(step, N.maxSemis ?? 30) / 12);
}
/** collectEvents(...plans) -> one sorted event list (plans: planRow / planHundred results or raw event arrays). */
export function collectEvents(...src) {
  const out = [];
  for (const s of src.flat()) {
    if (!s) continue;
    if (Array.isArray(s.events)) out.push(...s.events);
    else if (s.t != null) out.push(s);
  }
  return out.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
}
/** beadVoices(S.sound) -> voices for kit/schedule.scoreFromEvents: slide -> whir, clack -> wooden clack + click + note. */
export function beadVoices(snd = {}) {
  const W = snd.slide ?? {}, C = snd.clack ?? {}, K = snd.click ?? {}, N = snd.note ?? {};
  return {
    slide: (e) => [{ type: "whir", dur: Math.max(0.12, e.dur * 0.95), gain: (W.gain ?? 0.1) * Math.min(1.6, 0.7 + 0.12 * e.beads), hz: W.hz ?? 150, hz2: W.hz2 ?? 95, grit: W.grit ?? 0.15 }],
    clack: (e) => {
      const g = Math.min(1.5, Math.sqrt(e.beads));
      const v = [
        { type: "clack", dur: 0.12, gain: (C.gain ?? 0.4) * (0.75 + 0.25 * g), pitch: (C.pitch ?? 0.6) * (e.dir < 0 ? 1 : 0.92) },
        { type: "click", dur: 0.03, gain: (K.gain ?? 0.12) * g, pitch: K.pitch ?? 0.45, offset: 0.004 },
      ];
      if (N.gain && e.dir < 0 && !e.silentNote) v.push({ type: "chime", dur: N.dur ?? 1.3, gain: N.gain, pitch: notePitch(e.count, N), offset: 0.006 });
      return v;
    },
  };
}

// ------------------------------------------------------------------------------------------------ camera
/**
 * fitShot(pts, { elev = .95 (rad above horizontal), azim = 0 (rad; 0 = from +Z), fov = 30, aspect = 16/9,
 *   win = { x0: -.86, x1: .86, y0: -.84, y1: .62 } (NDC window the points must fill: under the caption band) })
 *   -> { pos, target, fov }: the closest camera on that bearing whose view puts every point inside `win`,
 *   centred in it. Works through kit/framing (the same projection the rig and the framing gate use).
 */
export function fitShot(pts, o = {}) {
  const { elev = 0.95, azim = 0, fov = 30, aspect = 16 / 9 } = o;
  const win = { x0: -0.86, x1: 0.86, y0: -0.84, y1: 0.62, ...(o.win ?? {}) };
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  const dir = [Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)];
  const wc = [(win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2], ww = [(win.x1 - win.x0) / 2, (win.y1 - win.y0) / 2];
  const th = Math.tan((fov * Math.PI) / 360);
  const make = (d) => {
    let tgt = [...c];
    for (let it = 0; it < 8; it++) {
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
  let lo = 0.3, hi = 40;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  const cam = make(hi);
  const r5 = (v) => +v.toFixed(5);
  return { pos: cam.pos.map(r5), target: cam.target.map(r5), fov };
}

/**
 * framingCheck(keys, regions(t) -> [{ id, pts }], { duration, dt = 1/30, drift, fov, aspect, win }) -> { ok, fails, worst }
 * Replays the camera (kit/framing sampleCameraKeys = the rig) and checks every required region against an
 * ASYMMETRIC window (the subject must stay under the caption band, not only inside the 90 % safe area).
 */
export function framingCheck(keys, regions, o = {}) {
  const { dt = 1 / 30, drift = null, fov = 30, aspect = 16 / 9 } = o;
  const win = { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.66, ...(o.win ?? {}) };
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
