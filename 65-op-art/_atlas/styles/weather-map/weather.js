// styles/weather-map/weather.js — the weather planner: pure functions of plain data and time.
// NO THREE, no window, no DOM. Imports only kit/time.js and kit/noise.js, so it runs in Node (render-sfx, export-spec,
// scene.config.js) and in the browser (style.js). The picture and the sound read the SAME plan:
//   landField(spec.land)            -> h(x, z)            invented relief (seeded coastline, hills, seabed)
//   weatherPlan(cfg, spec)          -> { L(t), H(t), pressureAt, windAt, frontAt, tempAt, weatherAt, placeEvents, ... }
// Map coordinates: [x, z] on the table (metres), +x = east, +z = south (toward the viewer in the overview).
// A low (L) moves along keyed points; its two fronts are RIGID curves attached to it (local frame = map axes), so a
// front's position at t is "curve + L(t)". Weather at a place is a function of which side of each front it is on —
// so when the front reaches a place, its weather changes, and the change times are found by sampling that function.
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";
import { fbm3 } from "../../kit/noise.js";

const gauss = (dx, dz, sx, sz = sx) => Math.exp(-((dx * dx) / (sx * sx) + (dz * dz) / (sz * sz)) / 2);

/**
 * landField(L) -> h(x, z): metres above sea level (negative = seabed, clamped at L.floor).
 *   L = { seed, center:[x,z], radius:[rx,rz], warp, warpScale, height, coastRamp, floor, seaSlope,
 *         hills:[{ c:[x,z], amp, sigma }], bays:[{ c:[x,z], amp, sigma }], islets:[{ c:[x,z], r, amp }], detail:{ amp, scale } }
 *   continent value c = 1 - warped elliptic radius (- bays); c > 0 is land. Everything is invented and seeded.
 */
export function landField(L) {
  const [cx, cz] = L.center, [rx, rz] = L.radius;
  const ws = 1 / (L.warpScale ?? 5);
  return (x, z) => {
    const w = (fbm3(x * ws + 17.31, z * ws - 4.77, 0.5, L.seed, 4) - 0.5) * 2 * (L.warp ?? 0.3);
    let c = 1 - Math.hypot((x - cx) / rx, (z - cz) / rz) - w;
    for (const b of L.bays ?? []) c -= b.amp * gauss(x - b.c[0], z - b.c[1], b.sigma);
    for (const i of L.islets ?? []) c = Math.max(c, i.amp * (1 - Math.hypot(x - i.c[0], z - i.c[1]) / i.r) - w * 0.6);
    if (c <= 0) return Math.max(L.floor, c * L.seaSlope);
    const ramp = smoothstep(0, L.coastRamp ?? 0.18, c);
    let h = c * 0.35;
    for (const k of L.hills ?? []) h += k.amp * gauss(x - k.c[0], z - k.c[1], k.sigma);
    const d = L.detail ?? { amp: 0, scale: 2 };
    h += (fbm3(x / d.scale + 3.1, z / d.scale - 7.9, 2.5, L.seed + 9, 4) - 0.45) * d.amp;
    return Math.max(1e-4, h * ramp * L.height);
  };
}

/** keyed2(keys [{ t, at:[x,z], ease? }]) -> f(t) -> [x, z]; holds before the first / after the last key. */
export function keyed2(keys) {
  return (t) => {
    if (t <= keys[0].t) return [...keys[0].at];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t <= b.t) {
        const u = (ease[b.ease ?? "inOutSine"] ?? ease.inOutSine)((t - a.t) / (b.t - a.t));
        return [lerp(a.at[0], b.at[0], u), lerp(a.at[1], b.at[1], u)];
      }
    }
    return [...keys[keys.length - 1].at];
  };
}

/** Front frame: u = direction along the front (from the low outward), n = (u.z, -u.x) = the side the symbols face. */
export function frontFrame(f) {
  const l = Math.hypot(f.axis[0], f.axis[1]);
  const u = [f.axis[0] / l, f.axis[1] / l];
  return { u, n: [u[1], -u[0]] };
}
/** Local point on a front at arc parameter s (metres along u): [x, z] relative to the low centre. */
export function frontPoint(f, s) {
  const { u, n } = frontFrame(f);
  const o = f.c1 * s + f.c2 * s * s;
  return [u[0] * s + n[0] * o, u[1] * s + n[1] * o];
}
/** Signed offset of a local point q from a front: { s, off } — off > 0 = ahead (symbol side), off < 0 = behind. */
export function frontOffset(f, q) {
  const { u, n } = frontFrame(f);
  const s = q[0] * u[0] + q[1] * u[1];
  return { s, off: q[0] * n[0] + q[1] * n[1] - (f.c1 * s + f.c2 * s * s) };
}

export const STATES = ["sun", "rain", "cloud", "storm", "clear"];

/**
 * weatherPlan(cfg, spec) -> plan. cfg (scene data):
 *   { low:  { keys:[{t, at, ease}], appear, deepen, sigma },
 *     high: { keys, appear, amp, sigma },
 *     base, grad:[gx, gz],                     pressure (hPa, SAMPLE) = base + grad·x + high - low
 *     fronts:[{ id, kind:"cold"|"warm", axis, c1, c2, len, grow:[t0, t1] }],
 *     bands: { cloudAhead, stormBehind, lowRadius },  weather-state geometry (metres)
 *     temp:  { base, perZ, perX, warm, cold, soft },  temperature field (SAMPLE)
 *     places:[{ id, name, at:[x,z], base }] }
 */
export function weatherPlan(cfg, spec = {}) {
  const L = keyed2(cfg.low.keys), H = keyed2(cfg.high.keys);
  const lowOn = (t) => smoothstep(cfg.low.appear, cfg.low.appear + (cfg.low.deepen ?? 1), t);
  const highOn = (t) => smoothstep(cfg.high.appear, cfg.high.appear + 0.8, t);
  const fronts = cfg.fronts;
  const F = Object.fromEntries(fronts.map((f) => [f.kind, f]));
  const grow = (f, t) => ease.inOutSine(clamp((t - f.grow[0]) / (f.grow[1] - f.grow[0])));

  const pressureAt = (x, z, t) => {
    const [lx, lz] = L(t), [hx, hz] = H(t);
    return cfg.base + cfg.grad[0] * x + cfg.grad[1] * z
      + cfg.high.amp * highOn(t) * gauss(x - hx, z - hz, cfg.high.sigma)
      - cfg.low.amp * lowOn(t) * gauss(x - lx, z - lz, cfg.low.sigma);
  };
  /** geostrophic-style wind (northern hemisphere: low pressure on the left, anticlockwise round L) */
  const windAt = (x, z, t, e = 0.05) => {
    const dpx = (pressureAt(x + e, z, t) - pressureAt(x - e, z, t)) / (2 * e);
    const dpz = (pressureAt(x, z + e, t) - pressureAt(x, z - e, t)) / (2 * e);
    return [dpz, -dpx];
  };
  /** front offsets for a world point (null when that front does not exist yet / there) */
  const frontAt = (kind, p, t) => {
    const f = F[kind];
    if (!f) return null;
    const [lx, lz] = L(t);
    const r = frontOffset(f, [p[0] - lx, p[1] - lz]);
    return { ...r, live: grow(f, t) * f.len, on: lowOn(t) };
  };
  const B = cfg.bands;
  /** weather state at a world point: sun | cloud (just ahead of the warm front) | rain (warm sector / near the low) | storm (just behind the cold front) | clear */
  const weatherAt = (p, t) => {
    if (lowOn(t) < 0.5) return "sun";
    const c = frontAt("cold", p, t), w = frontAt("warm", p, t);
    const [lx, lz] = L(t);
    const coldLive = c && c.s > -1.5 && c.s <= c.live + 0.6;
    const warmLive = w && w.s > -0.5 && w.s <= w.live + 0.6;
    if (coldLive && c.off < 0) return -c.off < B.stormBehind ? "storm" : "clear";
    if (warmLive && w.off < 0 && (!c || c.off > 0)) return "rain";
    if (warmLive && w.off >= 0 && w.off < B.cloudAhead) return "cloud";
    if (Math.hypot(p[0] - lx, p[1] - lz) < B.lowRadius) return "rain";
    return "sun";
  };
  const T = cfg.temp;
  /** temperature field (SAMPLE DATA): the GLSL in style.js evaluates the same formula from the same numbers */
  const tempAt = (x, z, t) => {
    const on = lowOn(t);
    let v = T.base + T.perZ * z + T.perX * x;
    const c = frontAt("cold", [x, z], t), w = frontAt("warm", [x, z], t);
    if (c && w) {
      const behind = smoothstep(T.soft, -T.soft, c.off) * smoothstep(-2.5, -1, c.s) * smoothstep(c.live + 0.5, c.live - 0.5, c.s);
      const sector = smoothstep(-T.soft, T.soft, c.off) * smoothstep(T.soft, -T.soft, w.off) * smoothstep(-0.5, 0.5, w.s)
        * smoothstep(w.live + 0.5, w.live - 0.5, w.s);
      v += on * (T.warm * sector + T.cold * behind);
    }
    return v;
  };
  /** state-change events per place: [{ t, kind:"weather", place, i, from, to }] — sampled at 1/240 s, refined by bisection */
  const placeEvents = (t0, t1, dt = 1 / 240) => {
    const out = [];
    cfg.places.forEach((pl, i) => {
      let prev = weatherAt(pl.at, t0), tp = t0;
      for (let t = t0 + dt; t <= t1 + 1e-9; t += dt) {
        const s = weatherAt(pl.at, t);
        if (s !== prev) {
          let a = tp, b = t;
          for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (weatherAt(pl.at, m) === prev) a = m; else b = m; }
          out.push({ t: +b.toFixed(4), kind: "weather", place: pl.id, i, from: prev, to: s });
          prev = s;
        }
        tp = t;
      }
    });
    return out.sort((a, b) => a.t - b.t);
  };
  const DT = cfg.stateTemp ?? { sun: 0, rain: -1, cloud: 2, storm: -4, clear: -5 };
  const placeTemp = (pl, state) => Math.round(pl.base + (DT[state] ?? 0));

  return {
    cfg, L, H, lowOn, highOn, grow, fronts, F,
    pressureAt, windAt, frontAt, weatherAt, tempAt, placeEvents, placeTemp,
    frontPoint, frontOffset, frontFrame,
  };
}

/**
 * stateTimeline(events, placeId, initial) -> at(t) -> { state, since, prev }: the place's weather state at t and when it
 *   last changed (pure lookup into the precomputed events; use it for icon swaps).
 */
export function stateTimeline(events, placeId, initial = "sun") {
  const ev = events.filter((e) => e.place === placeId);
  return (t) => {
    let state = initial, since = -Infinity, prev = null;
    for (const e of ev) { if (e.t <= t) { prev = state; state = e.to; since = e.t; } }
    return { state, since, prev };
  };
}
