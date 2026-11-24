// styles/city-lights/cityplan.js — the THREE-free planner for "City Lights" (Node-safe: no THREE, no window, no DOM).
// Imported by style.js (picture) AND by the scene's scene.config.js (sound + framing), so the skyline, every window's
// state, the LED signs, the traffic and every sound cue come from ONE plan.
//
//   layoutCity(spec, features, { seed })  -> lots (seeded rows of buildings + the scene's hand-placed feature buildings)
//   planCity(spec, { features, programs, pulses, lanes, banners, duration, seed }) -> plan:
//     plan.lots, plan.atlas {W, H}           window-state atlas layout (one texel per window: front cols, then side cols)
//     plan.fillWindows(t, data)              writes RGBA8 window states for time t into data (W x H x 4) — pure f(t)
//     plan.ledText(id, t)                    the string an LED sign / banner shows at t
//     plan.carsAt(laneId, t)                 [{ x, a }] dash positions + alpha on a traffic lane
//     plan.beaconLevel(lotIndex, t)          rooftop beacon blink 0..1
//     plan.duskAt(t), plan.starsAt(t)        sky deepening 0..1, star visibility 0..1
//     plan.events                            [{ t, kind, ... }] for kit/schedule.scoreFromEvents (cityVoices)
//
// Window programs (per feature lot, in plan options `programs: { [lotId]: [prog, ...] }`):
//   { mode: "bar", tIn, value, max, dur?, sign? }            lit floors = value / max x floors (eased), sign counts up
//   { mode: "fill", tIn, t0, t1, to = 1, sign? }             windows light in reading order, floor by floor
//   { mode: "bitmap", tIn, t0, text | cells, wipe?, scale? }       5x7 dot-matrix word / icon wiped on column by column
//   { mode: "countdown", tIn, steps: [s1, s2, s3], relight?, sign? }  floors go dark from the top in steps
// Every program starts with a TAKEOVER cascade: from tIn each window switches to the program at its own hashed time
// (spec.windows.take.stagger), so the skyline visibly organises itself. Programs hold until `tOut` (default never).
import { clamp, smoothstep, lerp, toEase } from "../../kit/time.js";
import { bitmapTextCells, measureBitmapText } from "../../kit/bitmapfont.js";

// ---------------------------------------------------------------- small pure helpers
/** fast integer hash -> [0, 1) (stateless; used per window, per frame) */
export function ih(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177) ^ Math.imul(d | 0, 1911520717);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** mulberry32 stream (same algorithm as kit rng, inlined so a fork is cheap) */
function stream(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}
export function hexRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const TYPE_IDS = { office: 0, residential: 1, glass: 2, slab: 3 };
const typeIndex = (t) => (typeof t === "number" ? t : TYPE_IDS[t] ?? 0);
/** piecewise-linear keys [[t, v], ...] -> v(t) (holds outside) */
export function keyed(keys, t) {
  if (!keys?.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], (t - keys[i - 1][0]) / Math.max(1e-6, keys[i][0] - keys[i - 1][0]));
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- skyline layout
/**
 * layoutCity(spec, features = [], { seed = 7 }) -> lots
 *   features: [{ id, row = 0, x, z?, cols, colsSide?, cellW, cellWS?, floors, depth = 16, type, beacon?, haze? }]
 *   (hand-placed buildings; seeded fillers never overlap a feature in the same row).
 *   lot = { i, id, row, feature, x, z (centre), w, d, h, floors, colsF, colsS, cellW, cellWS, type, haze, seed, beacon, antenna }
 */
export function layoutCity(S, features = [], o = {}) {
  const C = S.city, fh = C.floorH, seed = o.seed ?? 7;
  const lots = [];
  const add = (l) => { l.i = lots.length; l.h = l.floors * fh; l.beacon ??= l.floors >= C.beaconFloors; l.antenna ??= l.floors >= C.antennaFloors; lots.push(l); return l; };
  for (const f of features) {
    const row = C.rows[f.row ?? 0], d = f.depth ?? 16, cellWS = f.cellWS ?? f.cellW;
    add({ id: f.id, row: f.row ?? 0, feature: true, x: f.x, z: f.z ?? row.z - d / 2 - (f.setback ?? 0), w: f.cols * f.cellW, d,
      floors: f.floors, colsF: f.cols, colsS: f.colsSide ?? Math.max(2, Math.round(d / cellWS)), cellW: f.cellW, cellWS,
      type: typeIndex(f.type), haze: f.haze ?? row.haze, seed: 1000 + lots.length * 97 + seed, beacon: f.beacon, antenna: f.antenna });
  }
  C.rows.forEach((row, ri) => {
    const r = stream(seed * 7919 + ri * 104729 + 11);
    const occ = lots.filter((l) => l.row === ri).map((l) => [l.x - l.w / 2 - 2.5, l.x + l.w / 2 + 2.5]);
    let x = row.x[0] + r.range(0, 4);
    let guard = 0;
    while (x < row.x[1] && guard++ < 400) {
      const cols = r.int(row.cols[0], row.cols[1]), cellW = r.range(row.cellW[0], row.cellW[1]), w = cols * cellW;
      const hit = occ.find(([a, b]) => x + w > a && x < b);
      if (hit) { x = hit[1] + r.range(0, row.gap[0]); continue; }
      const cx = x + w / 2;
      const prof = Math.exp(-(((cx - C.xCenter) / C.profileWidth) ** 2));
      const u = r.next();
      let floors = row.floors[0] + (row.floors[1] - row.floors[0]) * (0.22 + 0.78 * prof) * (0.3 + 0.7 * u ** 1.25);
      if (r.next() < 0.1) floors *= 1.25;
      floors = Math.max(3, Math.round(floors));
      const d = r.range(row.depth[0], row.depth[1]);
      const cellWS = cellW * r.range(0.9, 1.1);
      add({ id: `r${ri}b${lots.length}`, row: ri, feature: false, x: cx, z: row.z - d / 2 - r.range(0, ri === 0 ? 1.5 : 6), w, d,
        floors, colsF: cols, colsS: Math.max(2, Math.round(d / cellWS)), cellW, cellWS, type: typeIndex(r.pick(row.types)),
        haze: row.haze, seed: Math.floor(r.next() * 1e9) });
      x += w + r.range(row.gap[0], row.gap[1]);
    }
  });
  return lots;
}

/** lotBox(lot, spec) -> [[minX, minY, minZ], [maxX, maxY, maxZ]] world box (for kit framing.framingReport) */
export function lotBox(l, S) {
  const y0 = S.city.groundY;
  return [[l.x - l.w / 2, y0, l.z - l.d / 2], [l.x + l.w / 2, y0 + l.h, l.z + l.d / 2]];
}

/**
 * fitShot(box, { fov = 30, aspect = 16/9, y = [-0.5, 0.85], x = 0.85, elev = 0.06 (rad, looking down), az = 0 (rad),
 *   pad = 1 }) -> { pos, target, fov } — a camera key that frames a world box (front face toward +Z) so its height
 *   fills NDC y range `y` and its width stays within |x|. Small-angle fit on the box's front plane; verify with
 *   kit framing.framingReport (the scene does).
 */
export function fitShot(box, o = {}) {
  const fov = o.fov ?? 30, aspect = o.aspect ?? 16 / 9, yr = o.y ?? [-0.5, 0.85], xm = o.x ?? 0.85, elev = o.elev ?? 0.06, az = o.az ?? 0, pad = o.pad ?? 1;
  const [mn, mx] = box;
  const H = (mx[1] - mn[1]) * pad, Wd = (mx[0] - mn[0]) * pad;
  const tf = Math.tan((fov * Math.PI) / 360);
  const halfH = Math.max(H / (yr[1] - yr[0]), Wd / (2 * xm) / aspect);   // frame half-height (m) at the box front
  const d = halfH / tf;
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, z = mx[2];
  const mid = (yr[0] + yr[1]) / 2;
  const target = [cx, cy - mid * halfH, z];
  const pos = [cx + Math.sin(az) * Math.cos(elev) * d, target[1] + Math.sin(elev) * d, z + Math.cos(az) * Math.cos(elev) * d];
  return { pos: pos.map((v) => +v.toFixed(2)), target: target.map((v) => +v.toFixed(2)), fov };
}

/** packAtlas(lots, W) -> { W, H }: shelf-packs one (colsF + colsS) x floors rectangle per lot; sets lot.ax / lot.ay. */
export function packAtlas(lots, W) {
  let x = 0, y = 0, sh = 0;
  for (const l of lots) {
    const w = l.colsF + l.colsS;
    if (x + w > W) { x = 0; y += sh; sh = 0; }
    l.ax = x; l.ay = y;
    x += w; sh = Math.max(sh, l.floors);
  }
  return { W, H: y + sh };
}

/** bitmapGrid(text, cols, floors, { row0, scale = 1 }) -> Uint8Array cols x floors (1 = lit), the 5x7 word centred on the face */
export function bitmapGrid(text, cols, floors, o = {}) {
  const g = new Uint8Array(cols * floors);
  const k = Math.max(1, Math.floor(o.scale ?? 1));      // each font pixel = k x k windows
  const m = measureBitmapText(text, { spacing: 1 });
  const x0 = Math.floor((cols - m.width * k) / 2);
  const y0 = o.row0 ?? Math.floor((floors - m.height * k) / 2);
  for (const c of bitmapTextCells(text, { spacing: 1 })) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    const cx = x0 + c.x * k + a, fy = y0 + c.y * k + b;
    if (cx >= 0 && cx < cols && fy >= 0 && fy < floors) g[fy * cols + cx] = 1;
  }
  return { grid: g, x0, width: m.width * k, chars: String(text).length, scale: k };
}

// ---------------------------------------------------------------- the plan
/**
 * planCity(spec, opts) -> plan  (see file header)
 *   opts: { features, programs = {}, pulses = [], lanes = [], banners = {}, duration = 15, seed = 7 }
 *   pulses: [{ t, x0 = -260, dir = 1 }]  (each = a lub-dub pair of light fronts across the skyline)
 *   lanes:  [{ id, x: [x0, x1], dir, speed, count, density: [[t, d], ...], seed, kind: "head"|"tail" }]
 *   banners: { [id]: { text, scroll = 0 (cells/s), width (cells) } } scrolling LED texts (blimp, ferry)
 */
export function planCity(S, opts = {}) {
  const duration = opts.duration ?? 15;
  const lots = layoutCity(S, opts.features ?? [], { seed: opts.seed ?? 7 });
  const atlas = packAtlas(lots, S.city.atlasW);
  const W = S.windows, N = W.natural, WT = S.windowTypes, PR = S.programs;
  const byId = Object.fromEntries(lots.map((l) => [l.id, l]));
  let xMin = Infinity, xMax = -Infinity;
  for (const l of lots) { xMin = Math.min(xMin, l.x); xMax = Math.max(xMax, l.x); }

  // ---- static per-window table (built once; every frame only evaluates closed forms of t)
  let count = 0;
  for (const l of lots) count += (l.colsF + l.colsS) * l.floors;
  const T = {
    lot: new Uint16Array(count), face: new Uint8Array(count), col: new Uint16Array(count), floor: new Uint16Array(count),
    tOn: new Float32Array(count), tOff: new Float32Array(count), tBack: new Float32Array(count), occ: new Uint8Array(count),
    rgb: new Uint8Array(count * 3), lev: new Float32Array(count), texel: new Uint32Array(count), wx: new Float32Array(count),
    take: new Float32Array(count),
  };
  const warm = W.warm.map(hexRgb), cool = W.cool.map(hexRgb);
  let k = 0;
  for (const l of lots) {
    const type = WT[l.type] ?? WT[0];
    const s = (l.x - xMin) / Math.max(1, xMax - xMin);
    const lotDens = type.density * lerp(W.lotDensity[0], W.lotDensity[1], ih(l.seed, 99));   // some blocks busy, some asleep
    for (let face = 0; face < 2; face++) {
      const cols = face === 0 ? l.colsF : l.colsS;
      for (let f = 0; f < l.floors; f++) for (let c = 0; c < cols; c++, k++) {
        const h0 = ih(l.seed, face, c, f), h1 = ih(l.seed + 1, face, c, f), h2 = ih(l.seed + 2, face, c, f), h3 = ih(l.seed + 3, face, c, f);
        T.lot[k] = l.i; T.face[k] = face; T.col[k] = c; T.floor[k] = f;
        T.occ[k] = h0 < lotDens ? 1 : 0;
        // already-on windows (late offices) + the dusk wave (west -> east, plus floor/jitter)
        T.tOn[k] = h2 < 0.2 ? -10 : N.start + N.dur * (N.wave * s + (1 - N.wave) * h1);
        if (h3 < N.offChance) {
          T.tOff[k] = T.tOn[k] + lerp(N.offAfter[0], N.offAfter[1], ih(l.seed + 4, face, c, f));
          T.tBack[k] = T.tOff[k] + lerp(N.offFor[0], N.offFor[1], ih(l.seed + 5, face, c, f));
        } else { T.tOff[k] = Infinity; T.tBack[k] = Infinity; }
        const isCool = ih(l.seed + 6, face, c, f) < type.cool;
        const pal = isCool ? cool : warm;
        const rgb = pal[Math.floor(ih(l.seed + 7, face, c, f) * pal.length)];
        T.rgb[k * 3] = rgb[0]; T.rgb[k * 3 + 1] = rgb[1]; T.rgb[k * 3 + 2] = rgb[2];
        T.lev[k] = 0.55 + 0.45 * ih(l.seed + 8, face, c, f);
        T.texel[k] = (l.ay + f) * atlas.W + l.ax + (face === 0 ? c : l.colsF + c);
        T.wx[k] = face === 0 ? l.x - l.w / 2 + ((c + 0.5) / l.colsF) * l.w : l.x + l.w / 2;
        T.take[k] = ih(l.seed + 9, face, c, f);
      }
    }
  }
  T.count = count;

  // ---- programs, resolved per lot
  const progs = {};
  for (const [id, list] of Object.entries(opts.programs ?? {})) {
    const l = byId[id];
    if (!l) throw new Error(`planCity: program for unknown lot "${id}"`);
    progs[l.i] = list.map((p) => {
      const q = { tOut: Infinity, ...p };
      if (q.mode === "bar") { q.dur ??= PR.bar.dur; q.t0 ??= q.tIn + W.take.stagger; q.levels = (q.value / q.max) * l.floors; q.color = hexRgb(q.color ?? PR.bar.color); q.e = toEase(q.ease ?? PR.bar.ease); }
      if (q.mode === "fill") { q.to ??= 1; q.color = hexRgb(q.color ?? PR.fill.color); q.head = hexRgb(PR.fill.head); q.e = toEase(q.ease ?? PR.fill.ease); }
      if (q.mode === "bitmap") {
        const b = q.cells ? { grid: q.cells, x0: 0, width: l.colsF, chars: 1 } : bitmapGrid(q.text, l.colsF, l.floors, { row0: q.row0, scale: q.scale });
        Object.assign(q, { grid: b.grid, bx0: b.x0, bw: b.width, chars: b.chars, cell: 6 * (b.scale ?? 1) });
        q.wipe ??= PR.bitmap.wipe; q.t0 ??= q.tIn + W.take.stagger; q.color = hexRgb(q.color ?? PR.bitmap.color);
      }
      if (q.mode === "countdown") { q.color = hexRgb(q.color ?? PR.countdown.color); q.per = Math.ceil(l.floors / q.steps.length); q.stepFloor ??= PR.countdown.stepFloor; }
      return q;
    });
  }

  // program value for one window at t -> [level, r, g, b] or null (= natural)
  const out4 = [0, 0, 0, 0];
  function progAt(q, l, face, c, f, t) {
    if (q.mode === "bar") {
      const L = q.levels * q.e(clamp((t - q.t0) / q.dur));
      const full = Math.floor(L);
      const lit = f < full || (f === full && face === 0 && c < Math.floor((L - full) * l.colsF + 1e-6));
      return set4(lit ? 1 : W_UNLIT, q.color);
    }
    if (q.mode === "fill") {
      const p = q.to * q.e(clamp((t - q.t0) / Math.max(1e-6, q.t1 - q.t0)));
      const n = p * l.floors * l.colsF;
      if (face === 1) return set4(f < Math.floor(n / l.colsF + 1e-6) ? 1 : W_UNLIT, q.color);
      const idx = f * l.colsF + c, head = Math.floor(n);
      if (idx < head) return set4(1, q.color);
      if (idx === head && p > 0 && p < q.to) return set4(0.6 + 0.6 * (n - head), q.head);
      return set4(W_UNLIT, q.color);
    }
    if (q.mode === "bitmap") {
      if (face === 1) return set4(W_UNLIT, q.color);
      const on = q.grid[f * l.colsF + c] === 1;
      const reveal = q.t0 + q.wipe * clamp((c - q.bx0) / Math.max(1, q.bw));
      return set4(on ? 1.15 * smoothstep(reveal, reveal + 0.08, t) : W_UNLIT, q.color);
    }
    if (q.mode === "countdown") {
      const fromTop = l.floors - 1 - f;
      let lit = 1;
      q.steps.forEach((s, i) => {
        const j = fromTop - i * q.per;               // this floor's place inside step i's group
        if (j >= 0 && j < q.per && t >= s + j * q.stepFloor) lit = 0;
      });
      if (q.relight != null && t >= q.relight) return set4(1.25 * smoothstep(q.relight, q.relight + 0.15, t), q.color);
      return set4(lit, q.color);
    }
    return null;
  }
  const W_UNLIT = W.unlit;
  function set4(lev, rgb) { out4[0] = lev; out4[1] = rgb[0]; out4[2] = rgb[1]; out4[3] = rgb[2]; return out4; }

  // pulses: each = two fronts (lub-dub)
  const P = W.pulse;
  const fronts = [];
  for (const p of opts.pulses ?? []) for (let j = 0; j < 2; j++) fronts.push({ t: p.t + j * P.gap, x0: p.x0 ?? xMin - 40, dir: p.dir ?? 1, amp: j === 0 ? 1 : 0.7, life: (xMax - xMin + 120) / P.speed });
  function pulseAt(x, t) {
    let b = 0;
    for (const F of fronts) {
      const dt = t - F.t;
      if (dt < 0 || dt > F.life) continue;
      const fx = F.x0 + F.dir * P.speed * dt;
      const u = (x - fx) / P.width;
      b = Math.max(b, F.amp * Math.exp(-u * u));
    }
    return b;
  }

  /** fillWindows(t, data): RGBA8 per window texel. rgb = sRGB colour, a = level / 2 (so levels up to 2 fit). */
  function fillWindows(t, data) {
    const TK = W.take;
    const anyPulse = fronts.some((F) => t >= F.t && t <= F.t + F.life);
    for (let i = 0; i < count; i++) {
      const li = T.lot[i];
      let lev = 0;
      let r = T.rgb[i * 3], g = T.rgb[i * 3 + 1], b = T.rgb[i * 3 + 2];
      if (T.occ[i]) {
        const on = smoothstep(T.tOn[i], T.tOn[i] + N.flick, t);
        const off = t >= T.tOff[i] && t < T.tBack[i] ? 0 : 1;
        lev = on * off * T.lev[i];
      }
      const list = progs[li];
      if (list) {
        const l = lots[li];
        for (const q of list) {
          const take = q.tIn + TK.stagger * T.take[i];
          if (t < take || t >= q.tOut + TK.stagger * T.take[i] + TK.dur) continue;
          const v = progAt(q, l, T.face[i], T.col[i], T.floor[i], t);
          if (!v) continue;
          const kIn = smoothstep(take, take + TK.dur, t);
          const kOut = Number.isFinite(q.tOut) ? 1 - smoothstep(q.tOut + TK.stagger * T.take[i], q.tOut + TK.stagger * T.take[i] + TK.dur, t) : 1;
          const kk = kIn * kOut;
          const gain = W.programGain / W.gain;
          lev = lerp(lev, v[0] * gain, kk);
          r = lerp(r, v[1], kk); g = lerp(g, v[2], kk); b = lerp(b, v[3], kk);
        }
      }
      if (anyPulse) {
        const pb = pulseAt(T.wx[i], t);
        if (pb > 0.002) {
          lev = Math.max(lev * (1 + pb * P.boost), pb * P.lift);   // lit windows flare, dark ones only glimmer (words stay legible)
          r = lerp(r, 255, pb * P.white); g = lerp(g, 250, pb * P.white); b = lerp(b, 240, pb * P.white);
        }
      }
      const o = T.texel[i] * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b;
      data[o + 3] = Math.max(0, Math.min(255, Math.round(lev * 127.5)));
    }
    return data;
  }

  // ---- LED signs: text from the program that owns the lot (bar value, fill %, countdown digit) or a banner
  const banners = opts.banners ?? {};
  function ledText(id, t) {
    if (banners[id]) return banners[id].text;
    const l = byId[id];
    const list = l ? progs[l.i] ?? [] : [];
    let s = "";
    for (const q of list) {
      if (t < q.tIn) continue;
      if (q.mode === "bar") s = String(Math.round(q.value * q.e(clamp((t - q.t0) / q.dur))));
      else if (q.mode === "fill") s = `${Math.round(100 * q.to * q.e(clamp((t - q.t0) / Math.max(1e-6, q.t1 - q.t0))))}%`;
      else if (q.mode === "countdown") {
        const n = q.steps.filter((x) => t >= x).length;
        s = String(q.steps.length - n);
        if (q.relight != null && t >= q.relight) s = q.final ?? "0";
      }
    }
    return s;
  }
  /** signOn(id, t) -> 0..1: an LED roof sign rises in just before its lot's first program (banners: always 1) */
  function signOn(id, t) {
    if (banners[id]) return 1;
    const l = byId[id], list = l ? progs[l.i] : null;
    if (!list?.length) return 1;
    const t0 = Math.min(...list.map((q) => q.tIn));
    return smoothstep(t0 - 0.35, t0 + 0.05, t);
  }
  /** bannerOffset(id, t) -> scroll offset in LED cells (pure f(t)) */
  const bannerOffset = (id, t) => (banners[id]?.scroll ?? 0) * t;

  // ---- traffic
  const lanes = Object.fromEntries((opts.lanes ?? []).map((L) => [L.id, L]));
  function carsAt(id, t) {
    const L = lanes[id];
    const len = L.x[1] - L.x[0];
    const dens = keyed(L.density, t);
    const out = [];
    for (let j = 0; j < L.count; j++) {
      const sp = L.speed * (0.85 + 0.3 * ih(L.seed, j, 3));
      let s = (ih(L.seed, j, 1) * len + L.dir * sp * t) % len;
      if (s < 0) s += len;
      const a = clamp((dens - ih(L.seed, j, 2)) / 0.05 + 0.5);
      out.push({ x: L.x[0] + s, a, j });
    }
    return out;
  }

  // ---- sky + beacons
  const duskAt = (t) => smoothstep(0, duration, t);
  const st = S.sky.stars;
  const starsAt = (t) => smoothstep(st.fadeIn[0], st.fadeIn[1], t);
  const B = S.beacon;
  function beaconLevel(li, t) {
    const l = lots[li];
    const per = lerp(B.period[0], B.period[1], ih(l.seed, 77));
    const ph = ((t / per + ih(l.seed, 78)) % 1 + 1) % 1;
    return ph < B.duty ? Math.sin((ph / B.duty) * Math.PI) : 0;
  }

  // ---- events (sound): dusk-wave ticks, program floors, word columns, pulses, countdown
  const events = [];
  const SW = S.sound.wave;
  {
    const bins = new Map();
    for (let i = 0; i < count; i++) {
      if (!T.occ[i] || T.face[i] !== 0 || lots[T.lot[i]].row > 1 || T.tOn[i] < 0) continue;
      const b = Math.floor(T.tOn[i] / SW.bin);
      bins.set(b, (bins.get(b) ?? 0) + 1);
    }
    [...bins.entries()].sort((a, b) => a[0] - b[0]).forEach(([b, n]) => {
      if (b * SW.bin > duration - 0.2) return;
      events.push({ t: b * SW.bin + SW.bin * ih(b, 5) * 0.6, kind: "wave", n, gain: Math.min(SW.max, SW.gain * Math.sqrt(n) * 0.5), pitch: 1.6 + ih(b, 6) * 1.6 });
    });
  }
  for (const [li, list] of Object.entries(progs)) {
    const l = lots[li];
    for (const q of list) {
      if (q.mode === "bar") {
        const n = Math.floor(q.levels + 1e-6);
        let prev = 0;
        for (let s = 0; s <= q.dur + 1e-9; s += 1 / 240) {
          const L = Math.floor(q.levels * q.e(clamp(s / q.dur)) + 1e-6);
          for (let f = prev; f < L && f < n; f++) events.push({ t: q.t0 + s, kind: "floor", lot: l.id, floor: f, frac: f / l.floors });
          prev = Math.max(prev, L);
        }
        events.push({ t: q.t0 + q.dur, kind: "barTop", lot: l.id, value: q.value });
      }
      if (q.mode === "fill") {
        const n = Math.floor(q.to * l.floors + 1e-6);
        let prev = 0;
        for (let s = q.t0; s <= q.t1 + 1e-9; s += 1 / 240) {
          const p = q.to * q.e(clamp((s - q.t0) / (q.t1 - q.t0)));
          const F = Math.floor((p * l.floors * l.colsF) / l.colsF + 1e-6);
          for (let f = prev; f < F && f < n; f++) events.push({ t: s, kind: "floor", lot: l.id, floor: f, frac: f / l.floors });
          prev = Math.max(prev, F);
        }
      }
      if (q.mode === "bitmap") for (let ch = 0; ch < q.chars; ch++) {
        if (String(q.text ?? "x")[ch] === " ") continue;
        events.push({ t: q.t0 + q.wipe * clamp(((ch + 0.4) * q.cell) / Math.max(1, q.bw)), kind: "blip", ch });
      }
      if (q.mode === "countdown") {
        q.steps.forEach((s, i) => {
          events.push({ t: s, kind: "step", i, of: q.steps.length });
          for (let j = 0; j < q.per; j++) if (l.floors - 1 - (i * q.per + j) >= 0) events.push({ t: s + j * q.stepFloor, kind: "out", j, i });
        });
        if (q.relight != null) events.push({ t: q.relight, kind: "relight" });
      }
    }
  }
  fronts.forEach((F, j) => events.push({ t: F.t, kind: "pulse", amp: F.amp, j }));
  events.sort((a, b) => a.t - b.t);

  return { lots, byId, atlas, table: T, fillWindows, ledText, signOn, bannerOffset, carsAt, duskAt, starsAt, beaconLevel, pulseAt, events, xMin, xMax, duration };
}

// ---------------------------------------------------------------- sound (shared with scene.config.js)
/** cityVoices(spec.sound) -> voices for kit/schedule.scoreFromEvents(plan.events, voices) */
export function cityVoices(SND) {
  return {
    wave: (e) => [{ type: "tick", gain: e.gain, pitch: e.pitch, dur: 0.02 }],
    floor: (e) => [{ type: "tick", gain: SND.floor.gain, pitch: lerp(SND.floor.pitch[0], SND.floor.pitch[1], e.frac), dur: 0.025 }],
    barTop: () => [{ type: "blip", gain: SND.blip.gain * 1.2, pitch: 1, notes: [7, 12], dur: 0.07 }],
    blip: (e) => [{ type: "blip", gain: SND.blip.gain, pitch: 1 + e.ch * 0.06, notes: [0], dur: 0.06 }],
    pulse: (e) => [{ type: "thud", gain: SND.pulse.gain * e.amp, pitch: SND.pulse.pitch, dur: 0.5 }],
    step: () => [{ type: "clack", gain: SND.countdown.step, pitch: 0.7, dur: 0.1 }],
    out: () => [{ type: "tick", gain: SND.countdown.gain * 0.5, pitch: 0.9, dur: 0.02 }],
    relight: () => [{ type: "chime", gain: 0.18, pitch: 1, notes: 5, dur: 1.6 }],
  };
}
/**
 * cityBed(duration, spec.sound, { swellAt, hornAt }) -> SCORE entries: the city hush (low rumble swells), a warm pad in
 * slow chords (brightness = cutoff in Hz), a warm synth swell (pad + riser) and a distant horn (two low buzz notes + pad).
 */
export function cityBed(duration, SND, o = {}) {
  const out = [];
  const H = SND.hush;
  for (let t = 0, i = 0; t < duration; t += H.every, i++) out.push({ t, type: "rumble", gain: H.gain, dur: H.every * 1.6, pitch: 0.8 + 0.1 * (i % 3), seed: 200 + i });
  const B = SND.bed;
  for (let t = 0, i = 0; t < duration - 0.5; t += B.every, i++) out.push({ t, type: "pad", root: B.root, chord: B.chords[i % B.chords.length], dur: B.every + B.release, attack: B.attack, release: B.release, brightness: B.brightness, gain: B.gain, seed: 300 + i });
  if (o.swellAt != null) {
    const S = SND.swell;
    out.push({ t: o.swellAt, type: "pad", root: S.root, chord: S.chord, dur: Math.min(S.dur, duration - o.swellAt), attack: 1.6, release: 1.4, brightness: S.brightness, gain: S.gain, seed: 401 });
    out.push({ t: o.swellAt - 1.2, type: "riser", gain: 0.08, dur: 1.4, seed: 402 });
  }
  if (o.hornAt != null) {
    const Hn = SND.horn;
    out.push({ t: o.hornAt, type: "buzz", hz: Hn.hz, flicker: 0, gain: Hn.gain, dur: Hn.dur, pan: -0.4, seed: 501 });
    out.push({ t: o.hornAt + 0.05, type: "buzz", hz: Hn.hz * 1.26, flicker: 0, gain: Hn.gain * 0.7, dur: Hn.dur - 0.1, pan: -0.4, seed: 502 });
    out.push({ t: o.hornAt, type: "pad", root: Hn.hz, chord: [0, 4], dur: Hn.dur + 0.6, attack: 0.25, release: 0.8, brightness: 520, gain: 0.22, pan: -0.4, seed: 503 });
  }
  return out;
}
