// styles/terrarium/growth.js — PURE planner for the terrarium style. No THREE, no window, no DOM: imported by
// style.js (picture) AND by a scene's scene.config.js (Node), so the SCORE is built from exactly the pours, sprouts,
// leaves, droplets and light changes the picture shows.
//
//   jarProfile(kind, o)          glass profiles (bottle / bowl / cloche): outer + inner radius functions, mouth, floor
//   planPours(jar, layers, o)    strata that pour in and settle: level(t), mound(t), grains (spawn/land times)
//   planGrowth(jar, o)           seeded growth plan: moss cushions, fern fronds, leafy stems, a vine along a path
//   frondShape(frond, t)         2D centreline + leaflets of an unfurling fern frond at time t (circinate coil)
//   stemShape(stem, t)           visible stem polyline + leaf scales of a leafy plant at time t
//   vineShape(vine, t)           visible vine polyline + leaf scales at time t
//   planDroplets(jar, waves)     condensation: droplets condense, bead, some run down and feed the soil
//   dropletAt(d, t)              { on, y, theta, r, stretch } — pure
//   wetness(drops, t)            soil darkening from droplets that have landed (closed form)
//   dayCycle(keys, t)            { sun, night, az } from light keys (day -> dusk -> night -> dawn)
//   events(...)                  every plan's timed events, for kit/schedule.scoreFromEvents
//
// Conventions: metres, seconds, Y-up, jar axis = +Y through the origin, theta = azimuth from +Z toward +X.
import { rng, clamp, smoothstep, lerp, ease, TAU } from "../../kit/time.js";

const outCubic = ease.outCubic, inOutSine = ease.inOutSine, outBack = ease.outBack;

// ===================================================================== jar profiles ======================
/**
 * jarProfile(kind, o) -> { kind, rOut(y), rIn(y), floor, mouth:{ r, y }, top, glass, lip, samples:[y...], closedTop }
 *   kind "bottle": apothecary bottle (flat base, rounded heel, slight belly, shoulder, neck, lip) — corked.
 *        "bowl":   fishbowl (sphere cut flat at the base, open mouth with a rolled lip).
 *        "cloche": bell dome over a wooden plate (open at the bottom, knob on top).
 *   o: { R (body radius), H (shoulder height), neckR, neckH, glass (wall thickness), bulge, heel }
 *   rOut / rIn are the outer / inner wall radius at height y (0 outside the glass range).
 */
export function jarProfile(kind = "bottle", o = {}) {
  const glass = o.glass ?? 0.05;
  if (kind === "bowl") {
    const R = o.R ?? 1.15, yc = R * 0.86, rM = o.neckR ?? 0.62;
    const yM = yc + Math.sqrt(R * R - rM * rM);
    const rOut = (y) => (y < 0 || y > yM ? 0 : Math.sqrt(Math.max(0, R * R - (y - yc) ** 2)));
    const rIn = (y) => (y < glass || y > yM ? 0 : Math.sqrt(Math.max(0, (R - glass) ** 2 - (y - yc) ** 2)));
    return { kind, rOut, rIn, floor: glass, mouth: { r: rM, y: yM }, top: yM, glass, lip: 0.04, R, closedTop: false, ...samples(0, yM) };
  }
  if (kind === "cloche") {
    const R = o.R ?? 1.1, hS = o.H ?? 1.2, Rd = R, top = hS + Rd * 0.92;
    const rOut = (y) => (y < 0 || y > top ? 0 : y <= hS ? R : Math.sqrt(Math.max(0, Rd * Rd - ((y - hS) / 0.92) ** 2)) * (R / Rd));
    const rIn = (y) => Math.max(0, rOut(y + glass * 0.5) - glass);
    return { kind, rOut, rIn, floor: o.plate ?? 0.08, mouth: { r: 0, y: top }, top, glass, lip: 0, R, closedTop: true, ...samples(0, top) };
  }
  // bottle
  const R = o.R ?? 1.05, H = o.H ?? 1.85, rN = o.neckR ?? 0.46, nH = o.neckH ?? 0.3, bulge = o.bulge ?? 0.035, c = o.heel ?? 0.16;
  const yS = H, yN = H + (o.shoulder ?? 0.42), yM = yN + nH;
  const body = (y) => R * (1 + bulge * Math.sin(Math.PI * clamp(y / yS)));
  const rOut = (y) => {
    if (y < 0 || y > yM) return 0;
    if (y < c) return body(c) - c + Math.sqrt(Math.max(0, c * c - (c - y) ** 2));
    if (y <= yS) return body(y);
    if (y <= yN) { const u = (y - yS) / (yN - yS); return rN + (body(yS) - rN) * (0.5 + 0.5 * Math.cos(Math.PI * u)) ** 0.9; }
    return rN + 0.02 * smoothstep(yM - 0.1, yM, y);
  };
  const rIn = (y) => (y < glass || y > yM ? 0 : Math.max(0.01, rOut(y) - glass - (y < c + glass ? (1 - clamp((y - glass) / c)) * glass * 0.6 : 0)));
  return { kind, rOut, rIn, floor: glass, mouth: { r: rN - glass, y: yM }, top: yM, glass, lip: 0.045, R, neckR: rN, closedTop: false, ...samples(0, yM) };
}
function samples(y0, y1, n = 72) {
  return { y0, y1, samples: Array.from({ length: n + 1 }, (_, i) => y0 + ((y1 - y0) * i) / n) };
}

// ===================================================================== strata pours ======================
/**
 * planPours(jar, layers, { start, gap, pour, settle, mouthY, g, seed }) -> pours[]
 *   layers: [{ id, depth, grains = 70, size:[min,max], mound, residual }]
 *   pour = { t0, t1, tS (settled), yB, yT (final top), mound, residual, grains:[{ t, x, z, s, tLand, yLand }] }
 *   Grains spawn above the mouth (mouthY) inside the stream radius, fall under g and vanish into the surface.
 */
export function planPours(jar, layers, o = {}) {
  const r = rng(o.seed ?? 7);
  const g = o.g ?? 7.5, mouthY = o.mouthY ?? jar.top + 0.9, pour = o.pour ?? 0.9, gap = o.gap ?? 0.15, settle = o.settle ?? 0.6;
  let t = o.start ?? 0.3, yB = jar.floor;
  const out = [];
  for (const L of layers) {
    const compact = L.compact ?? 0.04;
    const p = { id: L.id, t0: t, t1: t + (L.pour ?? pour), yB, depth: L.depth, yT: yB + L.depth * (1 - compact), mound: L.mound ?? 0.12, residual: L.residual ?? 0.12, compact, grains: [] };
    p.tS = p.t1 + (L.settle ?? settle);
    const N = L.grains ?? 70, sr = L.stream ?? 0.09;
    const fallT = Math.sqrt((2 * Math.max(0.1, mouthY - yB)) / g);   // first grains land as the pour starts
    for (let i = 0; i < N; i++) {
      const ts = p.t0 - fallT + (i / N) * (p.t1 - p.t0) * 0.98 + r.range(0, 0.02);
      const a = r.range(0, TAU), rr = sr * Math.sqrt(r.next());
      const gr = { t: ts, x: Math.cos(a) * rr, z: Math.sin(a) * rr, s: r.range(...(L.size ?? [0.025, 0.05])), spin: r.range(0, TAU), tLand: Infinity, yLand: 0 };
      // landing: first tau where the grain falls below the surface (fine step, plan-time only)
      for (let tau = 0; tau < 3; tau += 1 / 240) {
        const y = mouthY - 0.5 * g * tau * tau;
        const ys = surfaceY(p, gr.t + tau, gr.x, gr.z, jar);
        if (y <= ys) { gr.tLand = gr.t + tau; gr.yLand = ys; break; }
      }
      p.grains.push(gr);
    }
    p.g = g; p.mouthY = mouthY;
    out.push(p);
    yB = p.yT;
    t = p.t1 + gap;
  }
  return out;
}
/** fill fraction 0..1 of a pour at t (outQuad-ish: fast at first, slows as the stream thins). */
export const pourFill = (p, t) => 1 - (1 - clamp((t - p.t0) / (p.t1 - p.t0))) ** 1.6;
/** current top level of the flat part (without the mound); compacts by `compact` while settling. */
export function pourLevel(p, t) {
  if (t < p.t0) return p.yB;
  const f = pourFill(p, t);
  const k = smoothstep(p.t1, p.tS, t);
  return p.yB + p.depth * f * (1 - p.compact * k);   // settles a hair lower (compaction) once the stream stops
}
/** mound height at the centre: grows under the stream, then slumps to `residual` with a small damped wobble. */
export function pourMound(p, t) {
  if (t < p.t0) return 0;
  const grow = smoothstep(p.t0, p.t0 + 0.35, t);
  const u = clamp((t - p.t1) / (p.tS - p.t1));
  const slump = t < p.t1 ? 0 : 1 - Math.exp(-5 * u) * Math.cos(9 * u);
  return p.mound * grow * lerp(1, p.residual / Math.max(p.mound, 1e-6), clamp(slump, 0, 1.08));
}
/** surface height of a pour at (x, z): flat level + mound (smooth cone with a rounded top). */
export function surfaceY(p, t, x, z, jar) {
  const lvl = pourLevel(p, t);
  if (t < p.t0) return p.yB;
  const R = Math.max(0.2, jar.rIn(Math.max(lvl, jar.floor + 0.01)));
  const d = Math.hypot(x, z) / R;
  return lvl + pourMound(p, t) * Math.max(0, 1 - d * d) ** 1.4;
}
/** grain position at t, or null when not in the air. */
export function grainAt(p, gr, t) {
  if (t < gr.t || t >= gr.tLand) return null;
  const tau = t - gr.t;
  return { x: gr.x, y: p.mouthY - 0.5 * p.g * tau * tau, z: gr.z, rot: gr.spin + tau * 7 };
}

// ===================================================================== growth plan =======================
/**
 * planGrowth(jar, { soilY, start, seed, ferns, leafy, vine, moss, rock }) -> { ferns[], stems[], vines[], moss[], rock }
 *   ferns: [{ at:[x,z], t0, dur, fronds, L, az0 }]    each frond: { az, L, tilt, arch, leaflets, t0, dur, base }
 *   leafy: [{ at:[x,z], t0, dur, H, nodes, lean, az }] each stem: { base, H, lean, az, nodes:[{ s, az, size, tIn }] }
 *   vine:  { pts:[[x,y,z]...], t0, dur, every }        leaves every `every` metres, alternating sides
 *   moss:  { t0, dur, count, seeds:[[x,z]...], speed }  cushions spread outward from the seed points
 */
export function planGrowth(jar, o = {}) {
  const r = rng(o.seed ?? 23), soilY = o.soilY;
  const ferns = [], stems = [], vines = [], moss = [];
  const Rin = jar.rIn(soilY + 0.02);
  for (const F of o.ferns ?? []) {
    const n = F.fronds ?? 6;
    for (let i = 0; i < n; i++) {
      const az = (F.az0 ?? 0) + (i / n) * TAU + r.range(-0.25, 0.25);
      const delay = (i / n) * (F.stagger ?? 0.9) + r.range(0, 0.15);
      ferns.push({
        id: `fern${ferns.length}`, base: [F.at[0], soilY, F.at[1]], az, L: (F.L ?? 0.9) * r.range(0.82, 1.08), tilt: r.range(1.05, 1.32),
        arch: r.range(1.1, 1.6), leaflets: F.leaflets ?? 16, t0: F.t0 + delay, dur: (F.dur ?? 2.6) * r.range(0.9, 1.08), coil: F.coil ?? 2.6,
        width: F.width ?? 0.2,
      });
    }
  }
  for (const S of o.leafy ?? []) {
    const nodes = [];
    const N = S.nodes ?? 7, H = S.H ?? 0.8;
    const grow = (s) => S.t0 + (S.dur ?? 2.6) * Math.cbrt(s / H) * 0.85; // stem tip passes height s (outCubic inverse-ish)
    for (let j = 0; j < N; j++) {
      const s = H * (0.18 + 0.8 * (j / (N - 1)) ** 0.95);
      nodes.push({ s, az: (S.az ?? 0) + j * 2.4 + r.range(-0.2, 0.2), size: (S.leaf ?? 0.22) * (1.05 - 0.45 * (j / (N - 1))) * r.range(0.9, 1.1), tIn: grow(s) + 0.08, tilt: r.range(0.35, 0.6) });
    }
    stems.push({ id: `stem${stems.length}`, base: [S.at[0], soilY, S.at[1]], H, lean: S.lean ?? [0.08, 0.03], t0: S.t0, dur: S.dur ?? 2.6, nodes, r0: S.r0 ?? 0.022 });
  }
  if (o.vine) {
    const V = o.vine, L = polyLen(V.pts), every = V.every ?? 0.09, leaves = [];
    for (let s = every * 0.6, k = 0; s < L - 0.02; s += every, k++) leaves.push({ s, side: k % 2 ? 1 : -1, size: (V.leaf ?? 0.075) * r.range(0.8, 1.15), tIn: V.t0 + (V.dur ?? 2.4) * Math.sqrt(s / L) * 0.98 + 0.05 });
    vines.push({ id: "vine0", pts: V.pts, L, t0: V.t0, dur: V.dur ?? 2.4, leaves, r0: V.r0 ?? 0.014 });
  }
  if (o.moss) {
    const M = o.moss, seeds = M.seeds ?? [[0, 0]];
    for (let i = 0; i < (M.count ?? 120); i++) {
      let x, z, tries = 0;
      do { const a = r.range(0, TAU), d = Rin * 0.95 * Math.sqrt(r.next()); x = Math.cos(a) * d; z = Math.sin(a) * d; tries++; }
      while (tries < 20 && (M.avoid ?? []).some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar));
      const near = Math.min(...seeds.map(([sx, sz]) => Math.hypot(x - sx, z - sz)));
      moss.push({ x, z, s: r.range(...(M.size ?? [0.07, 0.15])), h: r.range(0.45, 0.75), tIn: M.t0 + near / (M.speed ?? 0.8) + r.range(0, 0.25), tone: r.next(), spin: r.range(0, TAU) });
    }
  }
  const rock = o.rock ? { ...o.rock, base: [o.rock.at[0], soilY, o.rock.at[1]] } : null;
  return { ferns, stems, vines, moss, rock, soilY };
}
function polyLen(P) { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]); return s; }

/**
 * frondShape(f, t, n = 36) -> { len, pts:[[x,y]...] (x outward, y up, metres), tangents, leaflets:[{ s, x, y, a, len, open }], u, grow }
 *   Growth: the stem extends while still coiled (grow), then unrolls from base to tip (u). The coiled part carries an
 *   increasing curvature (a circinate crozier); open part keeps a gentle outward arch. Pure function of t.
 */
export function frondShape(f, t, n = 36) {
  const k = clamp((t - f.t0) / f.dur);
  const grow = outCubic(clamp(k / 0.55));
  const u = inOutSine(clamp((k - 0.22) / 0.78));
  const len = Math.max(1e-4, f.L * (0.12 + 0.88 * grow));
  const ds = len / n, pts = [[0, 0]], tan = [];
  let a = f.tilt, x = 0, y = 0;
  const coilK = (f.coil * TAU) / Math.max(f.L * 0.3, 0.05);  // coil curvature scale (turns over ~30 % of L)
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n;                                   // normalised arc position
    const open = s < u + 1e-6;
    const w = open ? 0 : (s - u) / Math.max(1 - u, 1e-3);      // depth into the coil 0..1
    const kap = -f.arch / f.L * (0.4 + 0.9 * s) - (open ? 0 : coilK * (0.25 + 1.6 * w) * (1 - u) ** 0.4);
    tan.push([Math.cos(a), Math.sin(a)]);
    a += kap * ds;
    x += Math.cos(a) * ds; y += Math.sin(a) * ds;
    pts.push([x, y]);
  }
  tan.push([Math.cos(a), Math.sin(a)]);
  const leaflets = [];
  const M = f.leaflets;
  for (let j = 0; j < M; j++) {
    const sN = 0.12 + 0.86 * (j / (M - 1));                    // position along the final frond
    const sv = sN * f.L;
    if (sv > len) break;
    const i = Math.min(n, Math.round((sv / len) * n));
    const open = smoothstep(sv / len + 0.02, sv / len + 0.2, u);
    const taper = Math.sin(Math.PI * (0.18 + 0.8 * sN)) ** 0.9 * (1 - 0.55 * sN);
    leaflets.push({ s: sv, i, x: pts[i][0], y: pts[i][1], t: tan[i], len: f.width * taper * (0.22 + 0.78 * open), open });
  }
  return { len, pts, tan, leaflets, u, grow };
}

/** stemShape(st, t, n = 20) -> { pts:[[x,y,z]...] world, h, leaves:[{ node, scale, p }] } — leaves pop as the tip passes. */
export function stemShape(st, t, n = 20) {
  const k = clamp((t - st.t0) / st.dur);
  const h = Math.max(1e-3, st.H * outCubic(k));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = (h * i) / n, q = s / st.H;
    pts.push([st.base[0] + st.lean[0] * q * q, st.base[1] + s, st.base[2] + st.lean[1] * q * q]);
  }
  const leaves = st.nodes.map((nd) => {
    const sc = t < nd.tIn ? 0 : outBack(clamp((t - nd.tIn) / 0.55));
    const q = nd.s / st.H;
    return { node: nd, scale: sc, p: [st.base[0] + st.lean[0] * q * q, st.base[1] + nd.s, st.base[2] + st.lean[1] * q * q] };
  });
  return { pts, h, leaves };
}

/** vineShape(v, t, n = 40) -> { pts (visible part, resampled), head (m), leaves:[{ leaf, scale, p, d }] } */
export function vineShape(v, t, n = 40) {
  const head = v.L * outCubic(clamp((t - v.t0) / v.dur));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(polyPoint(v.pts, (Math.max(head, 1e-3) * i) / n).p);
  const leaves = v.leaves.map((lf) => {
    const at = polyPoint(v.pts, lf.s);
    return { leaf: lf, scale: t < lf.tIn ? 0 : outBack(clamp((t - lf.tIn) / 0.45)), p: at.p, d: at.d };
  });
  return { pts, head, leaves };
}
export function polyPoint(P, s) {
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (s <= l || i === P.length - 1) {
      const u = clamp(s / (l || 1));
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], d: [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1), (b[2] - a[2]) / (l || 1)] };
    }
    s -= l;
  }
  return { p: P[0], d: [0, 1, 0] };
}
/** moss cushion scale at t (0 before its spread front arrives). */
export const mossScale = (m, t) => (t < m.tIn ? 0 : outBack(clamp((t - m.tIn) / 0.5)));

// ===================================================================== droplets ==========================
/**
 * planDroplets(jar, waves, { soilY, seed }) -> drops[]
 *   waves: [{ t0, t1, count, theta:[a,b], y:[a,b], size:[a,b], run, runAt, seed }]
 *     count droplets condense between t0 and t1 at seeded spots on the INNER wall (theta range around the camera side);
 *     `run` of them (the biggest) start to run at runAt + i·spacing, accelerate down the wall and land on the soil.
 *   drop = { id, theta, y0, r, tC (appear), tB (full bead), run: null | { tR, a, tL, yL } }
 */
export function planDroplets(jar, waves, o = {}) {
  const drops = [];
  const soilY = o.soilY;
  waves.forEach((W, wi) => {
    const r = rng(W.seed ?? 31 + wi * 17);
    const list = [];
    for (let i = 0; i < W.count; i++) {
      const tC = W.t0 + (W.t1 - W.t0) * Math.pow(r.next(), 0.8);
      list.push({ id: `w${wi}d${i}`, wave: wi, theta: r.range(...W.theta), y0: r.range(...W.y), r: r.range(...(W.size ?? [0.012, 0.03])), tC, tB: tC + r.range(0.5, 1.0), run: null });
    }
    const runners = [...list].sort((a, b) => b.r - a.r).slice(0, W.run ?? 0);
    runners.forEach((d, k) => {
      d.r *= 1.25;
      const tR = Math.max(d.tB, (W.runAt ?? W.t1) + k * (W.runSpacing ?? 0.18) + r.range(0, 0.08));
      const a = W.accel ?? 1.4, yL = soilY + 0.02, fall = d.y0 - yL;
      d.run = { tR, a, tL: tR + Math.sqrt((2 * fall) / a), yL, wob: r.range(0, TAU) };
    });
    drops.push(...list);
  });
  return drops;
}
/** dropletAt(d, t) -> { on, theta, y, r, stretch, fade } — condense (grow), bead, run (accelerate, elongate), absorb. */
export function dropletAt(d, t) {
  if (t < d.tC) return { on: false };
  const grow = outCubic(clamp((t - d.tC) / (d.tB - d.tC)));
  let y = d.y0, theta = d.theta, stretch = 1, r = d.r * (0.25 + 0.75 * grow);
  if (d.run && t >= d.run.tR) {
    if (t >= d.run.tL) return { on: false };
    const tau = t - d.run.tR;
    y = d.y0 - 0.5 * d.run.a * tau * tau;
    theta += 0.012 * Math.sin(tau * 9 + d.run.wob) * clamp(tau * 3);
    stretch = 1 + clamp(d.run.a * tau * 0.9, 0, 1.4);
    r *= 1 - 0.25 * clamp((t - d.run.tR) / (d.run.tL - d.run.tR));
  }
  return { on: true, theta, y, r, stretch };
}
/** wetness(drops, t, { per = .12, max = 1 }) -> 0..1 soil darkening from droplets already landed. */
export function wetness(drops, t, o = {}) {
  let w = 0;
  for (const d of drops) if (d.run) w += (o.per ?? 0.12) * smoothstep(d.run.tL, d.run.tL + 0.5, t);
  return clamp(w, 0, o.max ?? 1);
}
/** haze(waves, t) -> 0..1 condensation fog on the upper glass (rises with each wave, clears as droplets run). */
export function haze(waves, t) {
  let h = 0;
  for (const W of waves) {
    const up = smoothstep(W.t0 - 0.3, W.t1, t);
    const clear = W.runAt != null ? smoothstep(W.runAt, W.runAt + (W.clear ?? 2.2), t) : 0;
    h = Math.max(h, up * (1 - 0.65 * clear) * (W.haze ?? 0.6));
  }
  return h;
}

// ===================================================================== day / night =======================
/**
 * dayCycle(keys, t) -> { sun, night, az, warm }
 *   keys: [{ t, sun (0 night .. 1 full sun), az (sun azimuth offset, rad) }], interpolated with inOutSine.
 */
export function dayCycle(keys, t) {
  let a = keys[0], b = keys[keys.length - 1];
  if (t <= a.t) b = a;
  else if (t >= b.t) a = b;
  else for (let i = 1; i < keys.length; i++) if (t < keys[i].t) { a = keys[i - 1]; b = keys[i]; break; }
  const u = a === b ? 0 : inOutSine((t - a.t) / (b.t - a.t));
  const sun = lerp(a.sun, b.sun, u), az = lerp(a.az ?? 0, b.az ?? 0, u);
  return { sun, night: clamp(1 - sun * 1.6), az, warm: clamp(1 - Math.abs(sun - 0.45) * 2.2) };
}

// ===================================================================== events (for the score) ============
/**
 * events({ pours, growth, drops, day, cork }) -> [{ t, kind, ... }] sorted.
 *   kinds: pour (t0..t1, layer), grain (landing, layer), settle, rock, sprout, unfurl, leaf, moss, cork,
 *          bead, run, drip, dusk, night, dawn
 */
export function events({ pours = [], growth = null, drops = [], day = [], cork = null, grainEvery = 3 } = {}) {
  const E = [];
  for (const p of pours) {
    E.push({ t: p.t0, kind: "pour", layer: p.id, dur: p.t1 - p.t0 + 0.4 });
    p.grains.forEach((g, i) => { if (i % grainEvery === 0 && Number.isFinite(g.tLand)) E.push({ t: g.tLand, kind: "grain", layer: p.id, x: g.x }); });
    E.push({ t: p.t1 + 0.12, kind: "settle", layer: p.id });
  }
  if (growth) {
    if (growth.rock) E.push({ t: growth.rock.t, kind: "rock", x: growth.rock.base[0] });
    const sprouted = new Set();
    for (const f of growth.ferns) {
      const key = f.base.join();
      if (!sprouted.has(key)) { sprouted.add(key); E.push({ t: f.t0, kind: "sprout", x: f.base[0] }); }
      E.push({ t: f.t0 + f.dur * 0.45, kind: "unfurl", x: f.base[0], dur: f.dur * 0.5 });
    }
    for (const s of growth.stems) {
      E.push({ t: s.t0, kind: "sprout", x: s.base[0] });
      for (const n of s.nodes) E.push({ t: n.tIn, kind: "leaf", x: s.base[0] });
    }
    for (const v of growth.vines) {
      E.push({ t: v.t0, kind: "sprout", x: v.pts[0][0] });
      v.leaves.forEach((lf, i) => { if (i % 2 === 0) E.push({ t: lf.tIn, kind: "leaf", x: polyPoint(v.pts, lf.s).p[0], small: true }); });
    }
    const m = [...growth.moss].sort((a, b) => a.tIn - b.tIn);
    for (let i = 0; i < m.length; i += 12) E.push({ t: m[i].tIn, kind: "moss", x: m[i].x });
  }
  for (const d of drops) {
    if (d.run) {
      E.push({ t: d.tB, kind: "bead", x: Math.sin(d.theta) });
      E.push({ t: d.run.tR, kind: "run", x: Math.sin(d.theta) });
      E.push({ t: d.run.tL, kind: "drip", x: Math.sin(d.theta) });
    }
  }
  for (let i = 1; i < day.length; i++) {
    const a = day[i - 1], b = day[i];
    if (b.sun < a.sun - 0.2) E.push({ t: a.t, kind: b.sun < 0.15 ? "night" : "dusk", dur: b.t - a.t });
    if (b.sun > a.sun + 0.2) E.push({ t: a.t, kind: "dawn", dur: b.t - a.t });
  }
  if (cork) E.push({ t: cork.tSeat, kind: "cork" });
  return E.sort((a, b) => a.t - b.t);
}

/** cork(t, { tIn, tSeat, lift }) -> { y offset above the seated position, tilt } — drops in and seats with a small bounce. */
export function corkAt(c, t) {
  if (t < c.tIn) return { on: false, dy: c.lift, tilt: 0 };
  if (t < c.tSeat) { const u = (t - c.tIn) / (c.tSeat - c.tIn); return { on: true, dy: c.lift * (1 - ease.inCubic(u)), tilt: 0.12 * (1 - u) }; }
  const v = t - c.tSeat;
  return { on: true, dy: 0.025 * Math.exp(-9 * v) * Math.abs(Math.sin(v * 22)), tilt: 0.02 * Math.exp(-7 * v) * Math.sin(v * 18) };
}
