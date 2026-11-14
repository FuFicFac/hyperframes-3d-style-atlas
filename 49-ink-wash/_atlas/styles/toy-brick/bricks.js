// styles/toy-brick/bricks.js — the BUILD PLAN as pure functions (no THREE, no window, no DOM). Imported by
// style.js (the picture) AND by a scene's scene.config.js (SCORE = one plastic click per snap, from the same
// schedule), so render-sfx / export-spec still run in Node.
//
// Units here are GRID units: x / z in studs (pitch P), y in PLATES (plate = 0.4 P, brick = 3 plates).
// A part = { type, size: [sx, sz] (footprint in studs, world-aligned), color, at: [gx, gz] (min corner stud),
//            level (plates above the baseplate top), dir? ("+x"|"-x"|"+z"|"-z": slope descends toward), h? (plates),
//            t? (explicit start), dur?, mode? ("drop"|"fly"), from? (fly start, see brickPose), out? ({ t, dur }) }
import { clamp, lerp, ease, hash01, smoothstep } from "../../kit/time.js";

/** Height of each part type in plates (override per part with `h`). */
export const TYPE_H = { brick: 3, plate: 1, tile: 1, slope: 3, round: 3, roundPlate: 1, arch: 3, trans: 3 };
export const heightOf = (p) => p.h ?? TYPE_H[p.type] ?? 3;
/** Which types carry studs on top (slopes: back row only; tiles: none). */
export const hasStuds = (type) => type !== "tile";

/**
 * parseLayout(lines) -> parts. Compact one-line-per-part form (objects pass through untouched):
 *   "brick 2x4 red @3,4 ^0"   type WxD colour @gx,gz ^level  [+x|-x|+z|-z] [t=1.2] [h=6] [trans]
 *   colour = a palette name or "#hex" (resolved by style.js). "trans" marks a transparent piece.
 */
export function parseLayout(lines) {
  return lines.map((l) => {
    if (typeof l !== "string") return l;
    const tok = l.trim().split(/\s+/);
    const p = { type: tok[0], size: [1, 1], color: "white", at: [0, 0], level: 0 };
    for (const s of tok.slice(1)) {
      if (/^\d+x\d+$/.test(s)) p.size = s.split("x").map(Number);
      else if (s[0] === "@") p.at = s.slice(1).split(",").map(Number);
      else if (s[0] === "^") p.level = Number(s.slice(1));
      else if (/^[+-][xz]$/.test(s)) p.dir = s;
      else if (s.startsWith("t=")) p.t = Number(s.slice(2));
      else if (s.startsWith("h=")) p.h = Number(s.slice(2));
      else if (s === "trans") p.trans = true;
      else p.color = s;
    }
    return p;
  });
}

/** centre of a part's footprint at its base, grid units { x, y, z }. */
export const partBase = (p) => ({ x: p.at[0] + p.size[0] / 2, y: p.level, z: p.at[1] + p.size[1] / 2 });

/**
 * planBuild(parts, { start = 0, step = .16, dur = .42, order = "bottomUp"|"given", mode = "drop", from = 14,
 *   hover = .35, press = .2, seed = 1, stepped = 0 }) -> { parts, events, end }
 *   Every part gets t0 (start of its move), land (the snap = the click), dur, mode, order index k.
 *   bottomUp: sort by level, then back-to-front (z), then left-to-right (x) — a sensible build order.
 *   Explicit `t` on a part wins over the running schedule. events: [{ t, kind: "snap"|"lift", i, type, area,
 *   size, color, x, z, level }] — feed them to kit schedule.scoreFromEvents for the clicks.
 */
export function planBuild(input, o = {}) {
  const { start = 0, step = 0.16, dur = 0.42, order = "bottomUp", mode = "drop", from = 14, hover = 0.35, press = 0.2, seed = 1, stepped = 0 } = o;
  const parts = parseLayout(input).map((p, i) => ({ ...p, src: i }));
  const sorted = order === "bottomUp"
    ? [...parts].sort((a, b) => a.level - b.level || a.at[1] - b.at[1] || a.at[0] - b.at[0] || a.src - b.src)
    : parts;
  const out = sorted.map((p, k) => {
    const d = p.dur ?? dur;
    const t0 = p.t ?? start + k * step;
    return { ...p, k, i: k, t0, dur: d, land: t0 + d, mode: p.mode ?? mode, from: p.from ?? from, hover: p.hover ?? hover, press: p.press ?? press, seed: p.seed ?? seed * 131 + k, stepped: p.stepped ?? stepped };
  });
  const events = [];
  for (const p of out) {
    const area = p.size[0] * p.size[1];
    if (p.mode === "fly") events.push({ t: p.t0, kind: "lift", i: p.i, type: p.type, area, size: p.size, color: p.color, x: p.at[0], z: p.at[1], level: p.level });
    events.push({ t: p.land, kind: "snap", i: p.i, type: p.type, area, size: p.size, color: p.color, x: p.at[0], z: p.at[1], level: p.level, trans: !!p.trans });
    if (p.out) events.push({ t: p.out.t, kind: "unsnap", i: p.i, type: p.type, area, size: p.size, color: p.color, x: p.at[0], z: p.at[1], level: p.level });
  }
  events.sort((a, b) => a.t - b.t);
  return { parts: out, events, end: Math.max(...out.map((p) => p.land), start) };
}

/**
 * unbuild(plan, { start, step = .1, dur = .45 }) -> the same plan with `out` times, top-down (reverse order).
 * The picture lifts each part off its studs (tiny pop), rises and shrinks away. Re-run planBuild's event
 * pass yourself if you need `unsnap` events: use unbuildEvents(plan).
 */
export function unbuild(plan, { start = 0, step = 0.1, dur = 0.45 } = {}) {
  const n = plan.parts.length;
  const parts = plan.parts.map((p) => ({ ...p, out: { t: start + (n - 1 - p.k) * step, dur } }));
  return { ...plan, parts };
}
export const unbuildEvents = (plan) => plan.parts.filter((p) => p.out).map((p) => ({ t: p.out.t, kind: "unsnap", i: p.i, type: p.type, area: p.size[0] * p.size[1], size: p.size, color: p.color, x: p.at[0], z: p.at[1], level: p.level }));

/** quantise t to a pose rate for stop-motion "brickfilm" (15 = on twos at 30 fps). */
export const onTwos = (t, fps = 15) => (fps ? Math.floor(t * fps + 1e-6) / fps : t);

/**
 * brickPose(p, t) -> { visible, x, y, z (grid units: footprint centre, base height), rx, ry, rz, sx, sy, sz, phase }
 *   drop: appears `from` plates above, falls (outCubic, slowing like a hand) to `hover` plates above its seat
 *     with a decaying tilt, then PRESSES down (inQuad, `press` of dur) and lands at p.land with a volume-keeping
 *     squash wobble (~6 %, 0.25 s) — the click.
 *   fly: starts at p.from = { x, y, z, rx, ry, rz } (grid units, e.g. lying in a pile), hops on an arc to the
 *     hover point while turning upright, then the same press + snap.
 *   out (p.out = { t, dur }): unsnaps with a small pop up, rises and shrinks away (inBack).
 *   p.stepped (fps) quantises the part's time (stop-motion); keep the camera on raw t.
 */
export function brickPose(p, tRaw) {
  const t = onTwos(tRaw, p.stepped);
  const b = partBase(p);
  const rest = { visible: true, x: b.x, y: b.y, z: b.z, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, phase: "settled" };
  if (t < p.t0) {
    // a fly-in part waits visibly at its pile pose; a drop-in part is not there yet
    if (p.mode === "fly" && typeof p.from === "object" && !p.hideBefore) {
      const F = p.from;
      return { ...rest, x: F.x, y: F.y, z: F.z, rx: F.rx ?? 0, ry: F.ry ?? 0, rz: F.rz ?? 0, phase: "wait" };
    }
    return { ...rest, visible: false, phase: "wait" };
  }
  const pressAt = p.t0 + p.dur * (1 - p.press);
  if (t < p.land) {
    let x = b.x, y = b.y + p.hover, z = b.z, rx = 0, ry = 0, rz = 0, s = 1;
    if (t < pressAt) {
      const u = clamp((t - p.t0) / (pressAt - p.t0));
      if (p.mode === "fly" && typeof p.from === "object") {
        const F = p.from, e = ease.inOutCubic(u);
        x = lerp(F.x, b.x, e); z = lerp(F.z, b.z, e);
        const arc = 4 * (p.arc ?? 9) * u * (1 - u);
        y = lerp(F.y, b.y + p.hover, ease.outQuad(u)) + arc;
        const k = 1 - ease.outCubic(u);
        rx = (F.rx ?? 0) * k; ry = (F.ry ?? 0) * k; rz = (F.rz ?? 0) * k;
      } else {
        const e = ease.outCubic(u);
        y = b.y + p.hover + (p.from - p.hover) * (1 - e);
        const k = (1 - e) * (1 - e);
        rx = (hash01(p.seed, 1) - 0.5) * 0.5 * k; rz = (hash01(p.seed, 2) - 0.5) * 0.5 * k; ry = (hash01(p.seed, 3) - 0.5) * 0.6 * k;
        s = lerp(0.55, 1, ease.outCubic(clamp(u / 0.18)));
      }
    } else {
      const v = clamp((t - pressAt) / (p.land - pressAt));
      y = b.y + p.hover * (1 - ease.inQuad(v));
    }
    return { visible: true, x, y, z, rx, ry, rz, sx: s, sy: s, sz: s, phase: t < pressAt ? "move" : "press" };
  }
  // landed: squash wobble (bottom-anchored, volume-keeping)
  const tau = t - p.land;
  let sy = 1;
  if (tau < 0.4) sy = 1 - (p.squash ?? 0.06) * Math.exp(-tau * 14) * Math.cos(tau * 46);
  const sxz = 1 / Math.sqrt(sy);
  let pose = { ...rest, sx: sxz, sy, sz: sxz };
  if (p.out && t >= p.out.t) {
    const v = clamp((t - p.out.t) / p.out.dur);
    const pop = v < 0.25 ? Math.sin((v / 0.25) * Math.PI) * 0.5 : 0;
    const k = ease.inBack(clamp((v - 0.15) / 0.85), 1.6);
    const s = 1 - smoothstep(0.6, 1, v);
    pose = {
      visible: v < 1, x: b.x + (hash01(p.seed, 5) - 0.5) * 6 * k, y: b.y + pop + k * (p.outRise ?? 16), z: b.z + (hash01(p.seed, 6) - 0.5) * 4 * k,
      rx: (hash01(p.seed, 7) - 0.5) * 1.5 * k, ry: (hash01(p.seed, 8) - 0.5) * 2 * k, rz: (hash01(p.seed, 9) - 0.5) * 1.5 * k,
      sx: s, sy: s, sz: s, phase: "out",
    };
  }
  return pose;
}

/** studSteps(t, start, n, stepDur = .14, overshoot = 1.6) -> 0..n: whole-stud staircase (slide a sub-assembly
 *  along the grid one stud per step, each with a tiny outBack snap). Same shape as kit voxels.cubeSteps. */
export function studSteps(t, start, n, stepDur = 0.14, overshoot = 1.6) {
  let s = 0;
  for (let m = 0; m < n; m++) s += ease.outBack(clamp((t - start - m * stepDur) / stepDur), overshoot);
  return s;
}

/**
 * activePart(plan, t, blend = .3) -> { x, y, z } grid point to focus on: the footprint centre (top) of the most
 * recently started part, eased from the previous one over `blend` s (closed form; for DoF / camera targets).
 */
export function activePart(plan, t, blend = 0.3) {
  const ps = [...plan.parts].sort((a, b) => a.t0 - b.t0);
  let cur = null, prev = null;
  for (const p of ps) { if (p.t0 <= t) { prev = cur; cur = p; } }
  if (!cur) cur = ps[0];
  const top = (p) => { const b = partBase(p); return { x: b.x, y: b.y + heightOf(p) / 2, z: b.z }; };
  const c = top(cur);
  if (!prev) return c;
  const q = top(prev), e = ease.inOutCubic(clamp((t - cur.t0) / blend));
  return { x: lerp(q.x, c.x, e), y: lerp(q.y, c.y, e), z: lerp(q.z, c.z, e) };
}

/**
 * occupancy(parts) -> Map("x,y,z" -> part index) of every (stud, plate) cell a part fills (bounding box;
 * slopes/arches count their whole box). validateLayout(parts, { baseLevel = 0 }) -> { overlaps:[{a,b,cell}],
 * floating:[i] }: no two parts may share a cell, and every part above baseLevel must have at least one occupied
 * cell directly under its footprint (clutch). Run it in Node on a scene's layout before rendering.
 */
export function occupancy(parts, overlaps = []) {
  const m = new Map();
  parseLayout(parts).forEach((p, i) => {
    const h = heightOf(p);
    for (let x = 0; x < p.size[0]; x++) for (let z = 0; z < p.size[1]; z++) for (let y = 0; y < h; y++) {
      const key = `${p.at[0] + x},${p.level + y},${p.at[1] + z}`;
      if (m.has(key)) overlaps.push({ a: m.get(key), b: i, cell: key });
      else m.set(key, i);
    }
  });
  return m;
}
export function validateLayout(parts, { baseLevel = 0 } = {}) {
  const list = parseLayout(parts);
  const overlaps = [];
  const occ = occupancy(list, overlaps);
  const floating = [];
  list.forEach((p, i) => {
    if (p.level <= baseLevel || p.free) return;
    let ok = false;
    for (let x = 0; x < p.size[0] && !ok; x++) for (let z = 0; z < p.size[1] && !ok; z++) if (occ.has(`${p.at[0] + x},${p.level - 1},${p.at[1] + z}`)) ok = true;
    if (!ok) floating.push(i);
  });
  return { overlaps, floating };
}
