// styles/tiny-planet/globe.js — the Tiny Planet planner. PURE: no THREE, no window, no DOM (imports only kit/time.js and
// kit/noise.js), so style.js (picture) and scene.config.js (SCORE, framing/visibility proofs, in Node) share one plan.
//
// Everything lives in spherical coordinates on a unit globe: a place is [lat, lon] in DEGREES (lon 0 faces +Z, +lon
// turns toward +X, lat +90 = +Y) or its unit direction d = dirOf(lat, lon). The globe turns about +Y by spin(t); a local
// direction d is at world direction rotY(d, spin(t)).
//
// What the plan decides:
//   terrain   surface(d) -> final height above the bare ball + colour band, from continent caps + 3D fbm, flattened
//             under towns and roads;
//   reading   "reads" are streams of word chips that land at a place; from the landing a front spreads along the
//             surface (outQuad). landAt(d) / lifeAt(d) are the closed-form times the first front of each kind reaches
//             d (reads only reach their own side: the near cap or the far cap), so the far side stays bare until read;
//   features  trees, houses, roads, lamps and clouds, each with its place and the time its front arrives;
//   motion    spin(t), chipPose(chip, t);
//   proofs    bareVisible(t) (share of the visible disc still bare), coverage (every place is reached by the end);
//   sound     events() -> one list for kit/schedule.scoreFromEvents with planetVoices().
import { clamp, lerp, smoothstep, ease, rng, hash01 } from "../../kit/time.js";
import { fbm3 } from "../../kit/noise.js";

export const D2R = Math.PI / 180;
export const dirOf = (lat, lon) => { const a = lat * D2R, o = lon * D2R, c = Math.cos(a); return [c * Math.sin(o), Math.sin(a), c * Math.cos(o)]; };
export const latLonOf = (d) => [Math.asin(clamp(d[1], -1, 1)) / D2R, Math.atan2(d[0], d[2]) / D2R];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** angle between two unit directions, DEGREES */
export const angle = (a, b) => Math.acos(clamp(dot(a, b), -1, 1)) / D2R;
/** rotY(v, th) -> v turned about +Y by th radians (same sense as Object3D.rotation.y) */
export const rotY = (v, th) => { const c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
/** slerp between unit directions */
export function slerp(a, b, u) {
  const w = Math.acos(clamp(dot(a, b), -1, 1));
  if (w < 1e-6) return [a[0], a[1], a[2]];
  const s = Math.sin(w), ka = Math.sin((1 - u) * w) / s, kb = Math.sin(u * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}
/** frameAt(d) -> { east, north, up } tangent basis at d (east = toward +lon) */
export function frameAt(d) {
  const l = Math.hypot(d[0], d[2]);
  const east = l < 1e-6 ? [1, 0, 0] : [d[2] / l, 0, -d[0] / l];
  return { east, north: cross(d, east), up: d };
}
/** offset(d, bearingDeg, distDeg) -> the direction distDeg away from d along the surface (bearing 0 = north, 90 = east) */
export function offset(d, bearing, dist) {
  const f = frameAt(d), b = bearing * D2R, a = dist * D2R, cb = Math.cos(b), sb = Math.sin(b), ca = Math.cos(a), sa = Math.sin(a);
  return norm([d[0] * ca + (f.north[0] * cb + f.east[0] * sb) * sa, d[1] * ca + (f.north[1] * cb + f.east[1] * sb) * sa, d[2] * ca + (f.north[2] * cb + f.east[2] * sb) * sa]);
}
/** fibonacci(n) -> n evenly spread unit directions */
export function fibonacci(n) {
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * g; out.push([r * Math.sin(a), y, r * Math.cos(a)]); }
  return out;
}

/** spinAt(spin, t) -> radians. spin = { deg0, rate (deg/s), turns: [{ t, dur, deg, ease }] } */
export function spinAt(spin, t) {
  let a = (spin.deg0 ?? 0) + (spin.rate ?? 0) * t;
  for (const k of spin.turns ?? []) a += k.deg * ease[k.ease ?? "inOutCubic"]((t - k.t) / k.dur);
  return a * D2R;
}

/**
 * createPlan({ spec, world, end }) -> plan
 *   world = { nearPole: [lat, lon], nearCap (deg), edgeNoise (deg), continents: [{ at, r, amp }],
 *             towns: [{ id, at, r, houses, tower }], roads: [[ [lat, lon], ... ]], reads: [{ id, kind: "land"|"life",
 *             side: "near"|"far", at, t, dur, reach, count }], clouds (count), spin, finale }
 */
export function createPlan({ spec, world, end = 15 }) {
  const G = spec.globe, T = G.terrain, R = G.R, seed = G.seed;
  const nearPole = dirOf(...world.nearPole);
  const spin = (t) => spinAt(world.spin, t);

  // ------------------------------------------------------------------ towns and roads (they flatten the terrain)
  const towns = world.towns.map((w) => ({ ...w, dir: dirOf(...w.at) }));
  const RD = spec.roads;
  const roads = world.roads.map((way, i) => {
    const pts = [];
    for (let k = 0; k < way.length - 1; k++) {
      const a = dirOf(...way[k]), b = dirOf(...way[k + 1]), n = Math.max(1, Math.round(angle(a, b) / RD.step));
      for (let j = k ? 1 : 0; j <= n; j++) pts.push(norm(slerp(a, b, j / n)));
    }
    return { id: `road-${i}`, pts };
  });
  const roadPts = roads.flatMap((r) => r.pts);
  const roadDist = (d) => { let m = -1; for (const p of roadPts) { const q = d[0] * p[0] + d[1] * p[1] + d[2] * p[2]; if (q > m) m = q; } return Math.acos(clamp(m, -1, 1)) / D2R; };
  /** flat(d) -> { m: 0..1 plateau mask, town: 0..1 inside a town } */
  const flat = (d) => {
    let m = 0, town = 0;
    for (const w of towns) { const a = angle(d, w.dir); m = Math.max(m, 1 - smoothstep(w.r * 1.05, w.r * 1.5, a)); if (a < w.r * 1.08) town = 1; }
    if (roadPts.length) m = Math.max(m, 1 - smoothstep(3.2, 6.5, roadDist(d)));
    return { m, town };
  };

  // ------------------------------------------------------------------ terrain
  const conts = world.continents.map((c) => ({ ...c, dir: dirOf(...c.at) }));
  const f = T.noiseFreq;
  /**
   * surface(d) -> { h (m above the bare ball), land, kind, kind2, u, mask }: the finished surface at d.
   * colour = mix(palette[kind], palette[kind2], u).
   */
  function surface(d) {
    let e = 0;
    for (const c of conts) { const a = angle(d, c.dir) / c.r; e += c.amp * Math.exp(-a * a); }
    e += T.noise * (fbm3(d[0] * f + 7.3, d[1] * f + 1.1, d[2] * f + 4.7, seed, 4) - 0.5);
    const fl = flat(d);
    if (fl.m > 0) e = lerp(e, Math.max(e, T.sea + 0.16), fl.m);
    const x = e - T.sea, lat = Math.abs(Math.asin(clamp(d[1], -1, 1)) / D2R);
    const iceEdge = T.ice + 7 * (fbm3(d[0] * 4 + 3, d[1] * 4, d[2] * 4 + 9, seed + 5, 2) - 0.5);
    if (lat > iceEdge) return { h: T.iceH + 0.03 * smoothstep(0, 12, lat - iceEdge), land: true, kind: "snow", kind2: "shallow", u: 0.12, mask: 0, x };
    if (x <= 0) {
      const u = smoothstep(0, 0.3, -x);
      return x > -0.055 ? { h: 0, land: false, kind: "shallow", kind2: "ocean", u: smoothstep(0, 0.055, -x), mask: 0, x } : { h: 0, land: false, kind: "ocean", kind2: "oceanDeep", u, mask: 0, x };
    }
    const k = smoothstep(0, 0.42, x);
    const ridge = 1 - Math.abs(2 * fbm3(d[0] * T.ridgeFreq + 2.2, d[1] * T.ridgeFreq + 8.1, d[2] * T.ridgeFreq + 5.5, seed + 31, 3) - 1);
    let h = T.hBase * smoothstep(0, T.coast, x) + T.hMax * Math.pow(k, 1.25) * Math.pow(ridge, T.ridgePow);
    h = lerp(h, T.flat, fl.m);
    if (fl.town) return { h, land: true, kind: "plaza", kind2: "sand", u: 0.2, mask: fl.m, x };
    if (x < T.coast) return { h, land: true, kind: "sand", kind2: "grass", u: smoothstep(T.coast * 0.6, T.coast, x) * 0.5, mask: fl.m, x };
    if (h > T.snowAt) return { h, land: true, kind: "snow", kind2: "rock", u: 0, mask: fl.m, x };
    if (h > T.rockAt) return { h, land: true, kind: "rock", kind2: "snow", u: smoothstep(T.rockAt, T.snowAt, h) * 0.35, mask: fl.m, x };
    const g = fbm3(d[0] * 3.1 + 11, d[1] * 3.1 + 4, d[2] * 3.1 + 2, seed + 77, 2);
    return { h, land: true, kind: "grass", kind2: "meadow", u: smoothstep(0.38, 0.62, g), mask: fl.m, x, alt: h };
  }

  // ------------------------------------------------------------------ reading: fronts and arrival times
  const edgeN = world.edgeNoise ?? 0;
  /** sideOf(d) -> "near" | "far": which cap a place belongs to (ragged edge) */
  const sideOf = (d) => (angle(d, nearPole) <= world.nearCap + edgeN * 2 * (fbm3(d[0] * 2.6 + 1, d[1] * 2.6 + 6, d[2] * 2.6 + 3, seed + 9, 2) - 0.5) ? "near" : "far");
  const CH = spec.chips;
  const reads = world.reads.map((r, i) => ({ count: CH.count, ...r, index: i, dir: dirOf(...r.at) }));
  const arrive = (d, kind, side) => {
    let best = Infinity;
    for (const r of reads) {
      if (r.kind !== kind || r.side !== side) continue;
      const a = angle(d, r.dir);
      if (a > r.reach) continue;
      const t = r.t + r.dur * (1 - Math.sqrt(1 - a / r.reach));   // inverse of front = reach * outQuad((t - t0) / dur)
      if (t < best) best = t;
    }
    return best;
  };
  /** landAt(d) -> time the terrain front reaches d (Infinity = never read) */
  const landAt = (d) => arrive(d, "land", sideOf(d));
  /** lifeAt(d) -> time trees / houses / lamps may appear at d: the "life" front, never before the land has risen */
  const lifeAt = (d) => Math.max(arrive(d, "life", sideOf(d)), landAt(d) + G.rise * 0.75);

  // ------------------------------------------------------------------ word chips
  const chips = [];
  for (const r of reads) {
    const q = rng(seed * 131 + r.index * 17 + 3), words = r.kind === "land" ? CH.land : CH.life;
    for (let j = 0; j < r.count; j++) {
      chips.push({
        read: r.index, j, kind: r.kind, tau: r.t + j * CH.gap, word: (r.kind === "land" ? 0 : CH.land.length) + q.int(0, words.length - 1),
        dir: offset(r.dir, q.range(0, 360), q.range(0, 2.2)), jx: q.range(-1, 1), jy: q.range(-1, 1), roll: q.range(-1, 1) * CH.roll,
      });
    }
  }
  /** chipPose(c, t) -> null | { p: [x, y, z] WORLD, s: 0..1 scale, roll } — a pure function of t */
  function chipPose(c, t) {
    if (t < c.tau - CH.fall || t > c.tau + CH.absorb) return null;
    const n = rotY(c.dir, spin(c.tau));
    const a = norm([n[0] * CH.bias[0], n[1] * CH.bias[0] + CH.bias[1], n[2] * CH.bias[2]]);
    const u = clamp((c.tau - t) / CH.fall), s = CH.drop * u;
    // lateral jitter: perpendicular to the approach, converging on the landing point
    const side = norm(cross(a, [0, 0, 1])), up2 = cross(side, a), j = CH.jitter * CH.drop * u;
    const rr = R + 0.06;
    const p = [n[0] * rr + a[0] * s + (side[0] * c.jx + up2[0] * c.jy) * j, n[1] * rr + a[1] * s + (side[1] * c.jx + up2[1] * c.jy) * j, n[2] * rr + a[2] * s + (side[2] * c.jx + up2[2] * c.jy) * j];
    const sc = t > c.tau ? 1 - clamp((t - c.tau) / CH.absorb) : smoothstep(1, 0.86, u);
    return { p, s: sc, roll: c.roll * (0.4 + 0.6 * u) };
  }

  // ------------------------------------------------------------------ features
  // houses
  const HS = spec.houses, houses = [];
  for (const w of towns) {
    const q = rng(seed * 977 + houses.length * 13 + Math.round(w.at[1] * 10));
    const mine = [];
    let tries = 0;
    while (mine.length < w.houses && tries++ < 4000) {
      const d = offset(w.dir, q.range(0, 360), Math.sqrt(q.next()) * w.r * 0.94);
      if (roadPts.length && roadDist(d) < HS.gap * 0.95) continue;
      const size = q.range(HS.size[0], HS.size[1]), need = (size / R / D2R) * 1.28;
      if (mine.some((o) => angle(o.dir, d) < Math.max(need, HS.gap))) continue;
      const tower = !!w.tower && mine.length === 0;
      mine.push({ town: w.id, dir: d, size, yaw: q.range(0, 360), roof: q.int(0, spec.palette.roofs.length - 1), tower, jit: q.next() });
    }
    for (const o of mine) {
      const s = surface(o.dir);
      houses.push({ ...o, h: s.h, t: lifeAt(o.dir) + o.jit * 0.3 });
    }
  }
  // roads: each sample point has a time; the ribbon draws outward
  for (const r of roads) {
    const cum = [0];
    for (let k = 1; k < r.pts.length; k++) cum.push(cum[k - 1] + angle(r.pts[k - 1], r.pts[k]));
    const len = cum[cum.length - 1] || 1, t0 = lifeAt(r.pts[0]) + 0.15;
    let run = t0;
    r.times = r.pts.map((p, k) => (run = Math.max(run, t0 + RD.draw * (cum[k] / len), lifeAt(p))));
    r.t0 = t0; r.t1 = run; r.len = len; r.cum = cum;
  }
  // lamps: one per house, one every few road samples (alternating sides)
  const LP = spec.lamps, lamps = [];
  for (const o of houses) lamps.push({ kind: "house", dir: o.dir, r: R + o.h + (o.tower ? HS.tower * 1.04 : o.size * 1.38), t: o.t + LP.delay });
  for (const r of roads) {
    for (let k = 2; k < r.pts.length - 1; k += RD.lampEvery) {
      const f2 = frameAt(r.pts[k]), tan = norm([r.pts[k + 1][0] - r.pts[k - 1][0], r.pts[k + 1][1] - r.pts[k - 1][1], r.pts[k + 1][2] - r.pts[k - 1][2]]);
      const sidev = cross(f2.up, tan), sg = (k / RD.lampEvery) % 2 < 1 ? 1 : -1, off = 1.5 * D2R * sg;
      const d = norm([r.pts[k][0] + sidev[0] * off, r.pts[k][1] + sidev[1] * off, r.pts[k][2] + sidev[2] * off]);
      if (!isFinite(r.times[k])) continue;
      lamps.push({ kind: "road", dir: d, r: R + T.flat + LP.lift, t: r.times[k] + LP.delay });
    }
  }
  // trees
  const TR = spec.trees, trees = [];
  fibonacci(TR.candidates).forEach((d0, i) => {
    const d = offset(d0, hash01(i, seed, 1) * 360, hash01(i, seed, 2) * 1.6);
    const s = surface(d);
    if (!s.land || s.kind !== "grass" || s.mask > 0.03 || s.h > TR.maxAlt || s.x < T.coast * 1.3) return;
    const n = fbm3(d[0] * TR.freq + 5, d[1] * TR.freq + 2, d[2] * TR.freq + 8, seed + 177, 2);
    if (n < 1 - TR.density - 0.06 + 0.12 * hash01(i, seed, 3)) return;
    const t = lifeAt(d);
    if (!isFinite(t)) return;
    const leaf = hash01(i, seed, 4) < TR.leafShare;
    trees.push({ dir: d, h: s.h, size: lerp(TR.height[0], TR.height[1], hash01(i, seed, 5)) * (leaf ? 0.85 : 1), leaf, tone: Math.floor(hash01(i, seed, 6) * 3), yaw: hash01(i, seed, 7) * 360, t: t + hash01(i, seed, 8) * 0.3 });
  });
  // clouds: small puff groups drifting in longitude; kept well inside their cap so none strays over unread ground
  const CL = spec.clouds, clouds = [];
  {
    const q = rng(seed * 53 + 7);
    let tries = 0;
    while (clouds.length < (world.clouds ?? 0) && tries++ < 600) {
      const lat = q.range(-48, 56), lon = q.range(0, 360), d = dirOf(lat, lon), an = angle(d, nearPole);
      const far = an > world.nearCap;
      if (far ? an < world.nearCap + 26 : an > world.nearCap - 30) continue;
      if (clouds.some((c) => angle(dirOf(c.lat, c.lon), d) < 30)) continue;
      const t = lifeAt(d);
      if (!isFinite(t)) continue;
      const size = q.range(CL.size[0], CL.size[1]), n = q.int(3, 4), puffs = [];
      for (let k = 0; k < n; k++) puffs.push({ e: (k - (n - 1) / 2) * size * 0.95 + q.range(-0.03, 0.03), n: q.range(-0.05, 0.05), u: k % 2 ? size * 0.25 : 0, s: size * (k === 0 || k === n - 1 ? 0.72 : 1) * q.range(0.9, 1.1) });
      clouds.push({ lat, lon, size, puffs, t: t + 0.35 + q.next() * 0.4, side: far ? "far" : "near" });
    }
  }
  const cloudDir = (c, t) => dirOf(c.lat, c.lon + CL.rate * (t - c.t) * (c.side === "far" ? -0.3 : 0.3));

  // ------------------------------------------------------------------ proofs
  const probes = fibonacci(3000);
  const probeLand = probes.map(landAt), probeLife = probes.map(lifeAt);
  const coverage = {
    unreached: probeLand.filter((t) => !isFinite(t)).length,
    lastLand: Math.max(...probeLand.filter(isFinite)),
    lastLife: Math.max(...probeLife.filter(isFinite)),
    lastFeature: Math.max(...trees.map((o) => o.t + TR.pop), ...houses.map((o) => o.t + HS.pop), ...roads.map((r) => r.t1), ...clouds.map((c) => c.t + CL.pop)),
  };
  /** bareVisible(t) -> share (0..1) of the visible disc (orthographic) whose ground has not been read yet at t */
  function bareVisible(t) {
    const th = spin(t);
    let bare = 0, all = 0;
    for (let i = -15; i <= 15; i++) for (let j = -15; j <= 15; j++) {
      const x = i / 15.5, y = j / 15.5, r2 = x * x + y * y;
      if (r2 >= 1) continue;
      all++;
      if (landAt(rotY([x, y, Math.sqrt(1 - r2)], -th)) > t) bare++;
    }
    return bare / all;
  }
  /** grown(t) -> share of all places whose land has risen at t */
  const grown = (t) => probeLand.filter((a) => a + G.rise <= t).length / probes.length;

  // ------------------------------------------------------------------ sound events
  function events() {
    const ev = [{ kind: "bed", t: 0, dur: end }];
    const lonPan = (d, t) => clamp(rotY(d, spin(t))[0] * 0.75, -0.8, 0.8);
    for (const r of reads) {
      ev.push({ kind: "stream", t: r.t - CH.fall * 0.8, dur: CH.fall * 0.8 + r.count * CH.gap, pan: lonPan(r.dir, r.t), life: r.kind === "life" });
      ev.push({ kind: "rise", t: r.t, pan: lonPan(r.dir, r.t), life: r.kind === "life", dur: r.dur });
    }
    for (const c of chips) ev.push({ kind: "chip", t: c.tau, j: c.j, read: c.read, life: c.kind === "life", pan: lonPan(c.dir, c.tau) });
    const S = spec.sound;
    [...trees].sort((a, b) => a.t - b.t).forEach((o, i) => { if (i % S.tree.every === 0) ev.push({ kind: "tree", t: o.t, i, pan: lonPan(o.dir, o.t) }); });
    [...houses].sort((a, b) => a.t - b.t).forEach((o, i) => { if (i % S.house.every === 0) ev.push({ kind: "house", t: o.t, i, pan: lonPan(o.dir, o.t) }); });
    for (const w of towns) {
      const ts = lamps.filter((l) => angle(l.dir, w.dir) < w.r * 1.6).map((l) => l.t).sort((a, b) => a - b);
      if (ts.length && isFinite(ts[0])) ev.push({ kind: "lamp", t: ts[Math.floor(ts.length / 2)], pan: lonPan(w.dir, ts[0]) });
    }
    for (const k of world.spin.turns ?? []) { ev.push({ kind: "turn", t: k.t, dur: k.dur }); ev.push({ kind: "reveal", t: k.t + k.dur * 0.72 }); }
    if (world.finale != null) ev.push({ kind: "finale", t: world.finale });
    return ev.filter((e) => isFinite(e.t) && e.t < end - 0.05).sort((a, b) => a.t - b.t);
  }

  return {
    R, end, spin, surface, sideOf, landAt, lifeAt, reads, chips, chipPose, towns, roads, houses, lamps, trees, clouds, cloudDir,
    coverage, bareVisible, grown, events, nearPole,
  };
}

/** planetVoices(SND) -> voices for kit/schedule.scoreFromEvents */
export function planetVoices(SND) {
  return {
    bed: (e) => [{ type: "pad", dur: e.dur, root: SND.pad.root, chord: SND.pad.chord, attack: 0.9, release: 1.6, brightness: SND.pad.brightness, gain: SND.pad.gain, pan: 0 }],
    stream: (e) => [{ type: "whoosh", dir: "in", dur: Math.min(1.6, e.dur), q: 1.1, gain: SND.stream.gain }],
    chip: (e) => {
      const sc = SND.chip.scale, st = sc[(e.j * 3 + e.read * 2) % sc.length] + (e.life ? 12 : 0);
      return [{ type: "marimba", hz: SND.chip.hz * Math.pow(2, st / 12), dur: 0.3, decay: 0.07, mallet: 0.7, gain: SND.chip.gain * (e.j % 2 ? 0.8 : 1) }];
    },
    rise: (e) => (e.life ? [{ type: "chime", dur: 1.0, notes: 4, gain: SND.rise.gain * 0.45 }] : [{ type: "rumble", dur: Math.min(2.2, e.dur), gain: SND.rise.gain }, { type: "squish", dur: 0.3, gain: SND.rise.gain * 0.5, offset: 0.05 }]),
    tree: (e) => [{ type: "bubble", dur: 0.09, pitch: 0.9 + 0.5 * ((e.i * 7) % 5) / 5, gain: SND.tree.gain }],
    house: (e) => [{ type: "pluck", hz: SND.house.hz * Math.pow(2, [0, 4, 7, 12, 9][e.i % 5] / 12), dur: 0.6, decay: 0.5, gain: SND.house.gain }, { type: "tick", gain: SND.house.gain * 0.5 }],
    lamp: () => [{ type: "chime", sparkle: true, dur: 1.2, notes: 6, gain: SND.lamp.gain }],
    turn: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 0.8, gain: SND.turn.gain, pan: -0.2 }, { type: "servo", dur: e.dur, hz: 70, hz2: 140, grit: 0.1, gain: SND.turn.gain * 0.22 }],
    reveal: () => [{ type: "thud", dur: 0.6, gain: SND.reveal.gain }, { type: "pluck", hz: SND.reveal.hz, dur: 2.0, decay: 1.8, bright: 0.3, gain: SND.reveal.gain * 0.9, offset: 0.02 }],
    finale: () => [{ type: "chime", sparkle: true, dur: 1.6, notes: 8, gain: SND.finale.gain }, { type: "marimba", hz: 349.23, notes: [0, 4, 7, 12], step: 0.1, dur: 1.2, decay: 0.3, gain: SND.finale.gain * 0.6 }],
  };
}
