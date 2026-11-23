// styles/kintsugi/fracture.js — the break-and-mend planner for "Kintsugi". PURE: no THREE, no window, no DOM (Node-safe),
// so scene.config.js imports it for SCORE + framing and style.js reads the very same plan for the picture.
//
// The bowl is a lathe: one closed profile (underside -> foot ring -> outer wall -> rounded rim -> inner wall -> floor).
// Every surface point p is labelled by a DIRECTION d = normalize(p - C) (C on the axis inside the bowl), so the outer
// wall, the rim and the inner wall at the same place belong to the same shard and a crack runs through the whole wall.
//
// Fracture (seeded, computed once): d is warped by a sum of sines (big wobble + fine jaggedness),
//   dw = normalize(d + sum_j a_j sin(k_j . d + ph_j))
// then labelled by a weighted spherical Voronoi over the sites s_i: label = argmax_i (dw . s_i + w_i). The signed edge
// distance to the nearest other cell, e = min_b (score_a - score_b) / |s_a - s_b|, times |p - C|, is "metres from the
// seam": the crack hairline, the gold bead and its bump all come from it. style.js evaluates the identical formula per
// fragment in GLSL (crisp seams at any resolution); this file evaluates it in JS for everything the plan needs.
//
// Gold flow: on a (theta, elevation) grid of directions the seam cells are found and a Dijkstra run ALONG THE SEAMS from
// one pour point on the rim gives each seam cell an arrival distance (radians of direction travelled); a second pass
// dilates it to every cell (+ distance) and the grid is baked into a texture. Gold is present where
// front(t) = (t - pour.t) * speed > arrival — so it runs down each crack and splits at junctions. Junction arrival
// times are the "pour" sound cues; shard landing / return times are the impact cues.
//
// Shard motion (closed form, nothing simulated): each shard tips outward and falls to a precomputed resting pose on the
// cloth (convex side down, separated by a precomputed relaxation of footprint circles), bounces twice, rests, then
// rises along an arc and slots back home. A per-frame ground clamp (min y of the shard's sample points) keeps pieces out
// of the table. All functions of t only.
import { clamp, lerp, smoothstep, rng, ease } from "../../kit/time.js";

const PI = Math.PI, TAU = 2 * PI;

// ------------------------------------------------------------------ small vector / quaternion helpers (no THREE)
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const quat = {
  I: [0, 0, 0, 1],
  axisAngle(ax, a) { const s = Math.sin(a / 2), n = v3.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; },
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },
  rotate(q, v) {
    const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  },
  fromUnitVectors(a, b) {
    const r = v3.dot(a, b) + 1;
    if (r < 1e-6) { const ax = Math.abs(a[0]) > Math.abs(a[2]) ? [-a[1], a[0], 0] : [0, -a[2], a[1]]; return quat.normalize([...ax, 0]); }
    const c = v3.cross(a, b);
    return quat.normalize([c[0], c[1], c[2], r]);
  },
  normalize(q) { const l = Math.hypot(...q) || 1; return q.map((x) => x / l); },
  slerp(a, b, t) {
    let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], bb = b;
    if (cos < 0) { cos = -cos; bb = b.map((x) => -x); }
    if (cos > 0.9995) return quat.normalize(a.map((x, i) => x + (bb[i] - x) * t));
    const th = Math.acos(cos), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((x, i) => x * wa + bb[i] * wb);
  },
};
export { v3 };

// ------------------------------------------------------------------ bowl profile (r, y) — shared by geometry and plan
/**
 * bowlProfile(B) -> { segs: [[{ r, y, nr, ny, glaze, rim }]], top, cy, maxR, height }
 * B = spec.bowl. Segments meet at hard edges (separate vertices); normals are outward (into the air).
 */
export function bowlProfile(B) {
  const R = B.rimR, Hr = B.rimY, W = B.wall, fR = B.footR, fH = B.footH, fW = B.footW, U = B.under;
  const r0 = fR + 0.02, y0 = fH + 0.012, fl = B.flare, N = B.steps ?? 80;
  const outer = (s) => [r0 + (R - r0) * (1 - Math.pow(1 - s, fl)), y0 + (Hr - y0) * s];
  const dOuter = (s) => { const dr = (R - r0) * fl * Math.pow(Math.max(1e-9, 1 - s), fl - 1), dy = Hr - y0; const l = Math.hypot(dr, dy); return [dr / l, dy / l]; };
  const nOuter = (s) => { const [tr, ty] = dOuter(s); return [ty, -tr]; };
  const seg = (pts) => pts.map(([r, y, glaze = 1, rim = 0]) => ({ r, y, glaze, rim }));
  const segs = [];
  segs.push(seg([[0, U, 0], [fR - fW - 0.012, U, 0]]));
  segs.push(seg([[fR - fW - 0.012, U, 0], [fR - fW, 0, 0]]));
  segs.push(seg([[fR - fW, 0, 0], [fR, 0, 0]]));
  segs.push(seg([[fR, 0, 0], [fR + 0.012, fH, 0], [r0, y0, 0]]));
  const E = [];
  for (let i = 0; i <= N; i++) { const s = i / N, [r, y] = outer(s); E.push([r, y, s < 0.015 ? 0 : 1, Hr - y < 0.008 ? 1 : 0]); }
  const rc = [R - W / 2, Hr], rr = W / 2;
  for (let i = 1; i < 14; i++) { const a = (i / 14) * PI; E.push([rc[0] + Math.cos(a) * rr, rc[1] + Math.sin(a) * rr, 1, 1]); }
  let inner0 = null;
  for (let i = N; i >= 0; i--) {
    const s = i / N, [r, y] = outer(s), [nr, ny] = nOuter(s);
    const p = [r - nr * W, y - ny * W];
    if (i === 0) inner0 = p;
    E.push([p[0], p[1], 1, Hr - p[1] < 0.008 ? 1 : 0]);
  }
  const NF = 14;
  for (let i = 1; i <= NF; i++) { const rr2 = inner0[0] * (1 - i / NF); E.push([rr2, inner0[1] - 0.012 * (1 - Math.pow(rr2 / inner0[0], 2)), 1, 0]); }
  segs.push(seg(E));
  // normals: (dr, dy) rotated -90deg = (dy, -dr), from neighbour differences
  for (const S of segs) {
    for (let i = 0; i < S.length; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      let dr = b.r - a.r, dy = b.y - a.y; const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
      S[i].nr = dy; S[i].ny = -dr;
    }
  }
  const cy = B.centreY;
  let top = -PI / 2;
  for (const S of segs) for (const p of S) top = Math.max(top, Math.atan2(p.y - cy, p.r));
  return { segs, top, cy, maxR: R, height: Hr + W / 2 };
}

// ------------------------------------------------------------------ the fracture field
/** direction of a bowl point (object space) */
export const dirOf = (p, cy) => v3.norm([p[0], p[1] - cy, p[2]]);
export const elevOf = (d) => Math.asin(clamp(d[1], -1, 1));
export const azOf = (d) => { const a = Math.atan2(d[2], d[0]); return a < 0 ? a + TAU : a; };
export const dirFromAzEl = (az, el) => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];

/**
 * makeField(F, seed) -> { sites: [{ d, w, ring }], waves: [{ k, ph, a }], warp(d), at(d) -> { a, b, e } }
 * F = spec.fracture: { base: { weight }, rings: [{ n, elev, elevJitter, azJitter, weight }], waves: [{ n, freq: [a, b], amp }] }
 */
export function makeField(F, seed = 1) {
  const r = rng(seed);
  const sites = [{ d: [0, -1, 0], w: F.base.weight, ring: 0 }];
  F.rings.forEach((R, ri) => {
    const off = r.range(0, TAU);
    for (let i = 0; i < R.n; i++) {
      const az = off + (i / R.n) * TAU + r.range(-1, 1) * R.azJitter;
      const el = R.elev + r.range(-1, 1) * R.elevJitter;
      sites.push({ d: dirFromAzEl(az, el), w: R.weight ?? 0, ring: ri + 1 });
    }
  });
  const unit = () => v3.norm([r.gaussian(), r.gaussian(), r.gaussian()]);
  const waves = [];
  for (const W of F.waves) for (let j = 0; j < W.n; j++) {
    const k = v3.mul(unit(), r.range(W.freq[0], W.freq[1]));
    waves.push({ k, ph: r.range(0, TAU), a: v3.mul(unit(), W.amp * r.range(0.7, 1.15)) });
  }
  const warp = (d) => {
    let x = d[0], y = d[1], z = d[2];
    for (const w of waves) { const s = Math.sin(w.k[0] * d[0] + w.k[1] * d[1] + w.k[2] * d[2] + w.ph); x += w.a[0] * s; y += w.a[1] * s; z += w.a[2] * s; }
    return v3.norm([x, y, z]);
  };
  const gap = sites.map((A) => sites.map((Bs) => v3.len(v3.sub(A.d, Bs.d)) || 1));
  /** at(d) -> { a: nearest site, b: runner-up, e: chord edge distance (>= 0), dw } */
  const at = (d) => {
    const dw = warp(d);
    let a = 0, sa = -1e9;
    const sc = sites.map((s, i) => { const v = v3.dot(dw, s.d) + s.w; if (v > sa) { sa = v; a = i; } return v; });
    let e = 1e9, b = -1;
    for (let i = 0; i < sites.length; i++) if (i !== a) { const q = (sa - sc[i]) / gap[a][i]; if (q < e) { e = q; b = i; } }
    return { a, b, e, dw, sc };
  };
  return { sites, waves, warp, at, gap };
}

// ------------------------------------------------------------------ the plan
/**
 * createPlan(spec, times) -> plan
 *   spec = STYLE_SPEC (bowl, fracture, shardMotion, gold, chips); times = { land, lift, impact, gather, pour, end }
 */
export function createPlan(S, T) {
  const B = S.bowl, F = S.fracture, M = S.shardMotion, G = S.gold;
  const prof = bowlProfile(B), cy = prof.cy;
  const field = makeField(F, F.seed);
  const N = field.sites.length;
  const r = rng(F.seed + 7);

  // ---- surface samples per shard (coarse lathe of the real profile)
  const samples = Array.from({ length: N }, () => []);
  const NT = 120;
  for (const seg of prof.segs) for (let i = 0; i < seg.length; i += (seg.length > 20 ? 2 : 1)) {
    const P = seg[i];
    for (let j = 0; j < NT; j++) {
      const th = (j / NT) * TAU, p = [P.r * Math.cos(th), P.y, P.r * Math.sin(th)];
      const n = [P.nr * Math.cos(th), P.ny, P.nr * Math.sin(th)];
      const L = field.at(dirOf(p, cy)).a;
      samples[L].push({ p, n, outer: P.ny < 0.2 && P.nr > 0.2 && P.glaze > 0 && P.rim === 0 });
    }
  }
  // ---- shard metadata
  const shards = samples.map((pts, i) => {
    const c = pts.reduce((a, s) => v3.add(a, s.p), [0, 0, 0]).map((x) => x / Math.max(1, pts.length));
    const outerPts = pts.filter((s) => s.outer);
    const n = v3.norm((outerPts.length ? outerPts : pts).reduce((a, s) => v3.add(a, s.n), [0, 0, 0]));
    // keep ~70 evenly spread points for ground clamping / framing
    const step = Math.max(1, Math.floor(pts.length / 70));
    const pick = pts.filter((_, k) => k % step === 0).map((s) => s.p);
    return { id: i, ring: field.sites[i].ring, base: i === 0, c, n, pts: pick, count: pts.length };
  });

  // ---- resting poses on the cloth: convex side down, outward, relaxed apart
  for (const s of shards) {
    if (s.base) { s.q = quat.I; s.L = s.c; s.f = 0.6; continue; }
    const yaw = r.range(-1, 1) * M.restYaw;
    const align = quat.fromUnitVectors(s.n, [0, -1, 0]);
    s.q = quat.mul(quat.axisAngle([0, 1, 0], yaw), align);
    const rp = s.pts.map((p) => quat.rotate(s.q, v3.sub(p, s.c)));
    s.restMinY = Math.min(...rp.map((p) => p[1]));
    s.f = Math.max(...rp.map((p) => Math.hypot(p[0], p[2]))) * M.footprint;
    const h = v3.norm([s.c[0], 0, s.c[2]]);
    s.dirH = h;
    s.rho = M.restRadius[0] + (s.ring - 1) * (M.restRadius[1] - M.restRadius[0]) + r.range(-0.08, 0.08);
  }
  // relaxation (precomputed, fixed iterations): circles must not overlap each other or the base
  const loose = shards.filter((s) => !s.base);
  const xz = loose.map((s) => [s.dirH[0] * s.rho, s.dirH[2] * s.rho]);
  for (let it = 0; it < 400; it++) {
    for (let a = 0; a < loose.length; a++) for (let b = a + 1; b < loose.length; b++) {
      const dx = xz[b][0] - xz[a][0], dz = xz[b][1] - xz[a][1], d = Math.hypot(dx, dz) || 1e-6;
      const need = loose[a].f + loose[b].f + M.gap;
      if (d < need) { const push = (need - d) / 2 * 0.5; xz[a][0] -= (dx / d) * push; xz[a][1] -= (dz / d) * push; xz[b][0] += (dx / d) * push; xz[b][1] += (dz / d) * push; }
    }
    for (let a = 0; a < loose.length; a++) {
      const d = Math.hypot(xz[a][0], xz[a][1]) || 1e-6, need = M.baseClear + loose[a].f;
      if (d < need) { xz[a][0] *= need / d; xz[a][1] *= need / d; }
      const mx = M.maxRadius - loose[a].f;
      if (d > mx) { xz[a][0] *= mx / d; xz[a][1] *= mx / d; }
    }
  }
  loose.forEach((s, k) => { s.L = [xz[k][0], -s.restMinY, xz[k][1]]; });

  // ---- timing
  const impactDir = v3.norm(M.impactDir);
  for (const s of shards) {
    if (s.base) continue;
    const ang = Math.acos(clamp(v3.dot(dirOf(s.c, cy), impactDir), -1, 1));
    s.ts = T.impact + M.crackDelay + ang / M.crackSpeed * 0.5 + r.range(0, M.startJitter);
    s.df = r.range(M.fallDur[0], M.fallDur[1]) + (s.ring - 1) * M.ringFallExtra;
    s.land = s.ts + s.df;
    s.pop = M.pop * (s.ring === 2 ? 1.4 : 1);
  }
  // return order: lower ring first, then rim pieces; azimuthal sweep from the camera side
  const order = loose.slice().sort((a, b) => (a.ring - b.ring) || (azOf(a.dirH) - azOf(b.dirH)));
  order.forEach((s, k) => {
    s.tg = T.gather + k * M.returnStep + r.range(0, M.returnJitter) + (s.ring - 1) * M.ringReturnExtra;
    s.dg = r.range(M.returnDur[0], M.returnDur[1]);
    s.home = s.tg + s.dg;
  });

  // ---- whole-bowl motion before the impact (set down + rock, lift, drop)
  const bowlPose = (t) => {
    if (t >= T.impact) return { q: quat.I, p: [0, 0, 0] };
    let y = 0, tilt = 0;
    if (t < T.land) { const u = clamp(t / T.land); y = M.setDown * (1 - u * u); }
    else if (t < T.lift) { const tau = t - T.land; tilt = M.rock * Math.exp(-tau * 3.2) * Math.sin(TAU * 1.9 * tau); }
    if (t >= T.lift) {
      const tTop = T.lift + (T.impact - T.lift) * 0.68; // rise (ease out), then a gravity fall (u^2) onto the cloth
      if (t < tTop) y = M.liftH * ease.outCubic((t - T.lift) / (tTop - T.lift));
      else { const u = (t - tTop) / (T.impact - tTop); y = M.liftH * (1 - u * u); }
      tilt = M.liftTilt * Math.sin(PI * clamp((t - T.lift) / (T.impact - T.lift)));
    }
    const q = quat.axisAngle([1, 0, 0.35], tilt);
    return { q, p: [0, y + B.footR * Math.abs(Math.sin(tilt)), 0] };
  };

  // ---- one shard's pose at t: world = q * (p - c) + pos ; returns { q, pos } (pos = where c goes)
  const groundClamp = (s, q, pos) => {
    let mn = Infinity;
    for (const p of s.pts) { const w = quat.rotate(q, v3.sub(p, s.c)); mn = Math.min(mn, w[1] + pos[1]); }
    return mn < 0 ? [pos[0], pos[1] - mn, pos[2]] : pos;
  };
  function pose(i, t) {
    const s = shards[i];
    if (s.base || t < T.impact) {
      const bp = bowlPose(t);
      let pos = v3.add(quat.rotate(bp.q, s.c), bp.p);
      if (s.base && t >= T.impact) {           // the base jolts on impact
        const tau = t - T.impact; pos = [pos[0], pos[1] + M.baseJolt * Math.exp(-tau * 14) * Math.abs(Math.sin(tau * 40)), pos[2]];
      }
      return { q: bp.q, pos };
    }
    let q, pos;
    if (t < s.ts) { q = quat.I; pos = s.c; }
    else if (t < s.land) {
      const u = (t - s.ts) / s.df;
      q = quat.slerp(quat.I, s.q, Math.pow(u, 1.5));
      const h = v3.lerp(s.c, s.L, ease.outQuad(u));
      const y = lerp(s.c[1], s.L[1], u * u) + s.pop * 4 * u * (1 - u);
      pos = [h[0], y, h[2]];
    } else if (t < s.tg) {
      const tau = t - s.land;
      const b = M.bounce * Math.exp(-tau / 0.11) * Math.abs(Math.sin(PI * tau / M.bounceT));
      q = s.q; pos = [s.L[0], s.L[1] + b, s.L[2]];
    } else if (t < s.home) {
      const u = (t - s.tg) / s.dg, e = ease.inOutCubic(u);
      q = quat.slerp(s.q, quat.I, ease.inOutSine(clamp(u * 1.15)));
      const h = v3.lerp(s.L, s.c, e);
      pos = [h[0], h[1] + M.arc * (s.ring === 2 ? 1.1 : 1) * Math.sin(PI * e), h[2]];
    } else {
      const tau = t - s.home; // a tiny settle as it seats
      q = quat.I; pos = [s.c[0], s.c[1] + M.seat * Math.exp(-tau * 18) * Math.sin(tau * 45), s.c[2]];
    }
    return { q, pos: groundClamp(s, q, pos) };
  }
  /** world points of shard i at t (for framing) */
  const worldPoints = (i, t) => { const s = shards[i], P = pose(i, t); return s.pts.map((p) => v3.add(quat.rotate(P.q, v3.sub(p, s.c)), P.pos)); };

  // ---- seam grid: labels, seam cells, Dijkstra along seams from the pour point, dilation
  const NU = G.gridU, NV = G.gridV, E0 = -PI / 2, E1 = prof.top;
  const cellDir = (iu, iv) => dirFromAzEl(((iu + 0.5) / NU) * TAU, E0 + ((iv + 0.5) / NV) * (E1 - E0));
  const label = new Int16Array(NU * NV), dirs = new Array(NU * NV);
  for (let iv = 0; iv < NV; iv++) for (let iu = 0; iu < NU; iu++) { const d = cellDir(iu, iv), k = iv * NU + iu; dirs[k] = d; label[k] = field.at(d).a; }
  const idx = (iu, iv) => iv * NU + ((iu % NU) + NU) % NU;
  const seam = new Uint8Array(NU * NV);
  for (let iv = 0; iv < NV; iv++) for (let iu = 0; iu < NU; iu++) {
    const L = label[idx(iu, iv)];
    if (label[idx(iu + 1, iv)] !== L || label[idx(iu - 1, iv)] !== L || (iv + 1 < NV && label[idx(iu, iv + 1)] !== L) || (iv > 0 && label[idx(iu, iv - 1)] !== L)) seam[idx(iu, iv)] = 1;
  }
  const angle = (a, b) => Math.acos(clamp(v3.dot(a, b), -1, 1));
  // pour point: the seam cell nearest the requested rim direction
  const pourWant = dirFromAzEl(T.pourAz ?? G.pourAz, E1 - 0.02);
  let src = -1, best = 1e9;
  for (let k = 0; k < NU * NV; k++) if (seam[k] && Math.floor(k / NU) >= NV - 3) { const a = angle(dirs[k], pourWant); if (a < best) { best = a; src = k; } }
  const dist = new Float64Array(NU * NV).fill(Infinity); // float64: a float32 store would fail the "d > dist[k]" stale check
  // binary-heap Dijkstra over 8-neighbourhoods
  const dijkstra = (allowed, init) => {
    const heap = [];
    const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr2 = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (rr2 < heap.length && heap[rr2][0] < heap[m][0]) m = rr2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (const [k, d] of init) { if (d <= dist[k]) { dist[k] = d; push(k, d); } }
    while (heap.length) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      const iu = k % NU, iv = (k / NU) | 0;
      for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
        if (!du && !dv) continue;
        const jv = iv + dv; if (jv < 0 || jv >= NV) continue;
        const j = idx(iu + du, jv);
        if (!allowed(j)) continue;
        const nd = d + angle(dirs[k], dirs[j]);
        if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
      }
    }
  };
  dijkstra((j) => seam[j] === 1, [[src, 0]]);
  // seam cells not reached along the network (tiny islands): seed them from their nearest reached seam cell
  let maxSeam = 0;
  for (let k = 0; k < NU * NV; k++) if (seam[k] && dist[k] < Infinity) maxSeam = Math.max(maxSeam, dist[k]);
  const unreached = [];
  for (let k = 0; k < NU * NV; k++) if (seam[k] && dist[k] === Infinity) unreached.push(k);
  if (unreached.length) dijkstra((j) => seam[j] === 1, unreached.map((k) => [k, maxSeam * 0.9]));
  for (let k = 0; k < NU * NV; k++) if (seam[k] && dist[k] < Infinity) maxSeam = Math.max(maxSeam, dist[k]);
  // dilate to every cell (arrival of the nearest seam + distance), so the texture is smooth around every seam
  const seamInit = [];
  for (let k = 0; k < NU * NV; k++) if (seam[k] && dist[k] < Infinity) seamInit.push([k, dist[k]]);
  dijkstra(() => true, seamInit);
  const speed = maxSeam / G.flowDur;

  // ---- junctions (3+ shards meet) -> pour sound cues
  const junc = [];
  for (let iv = 0; iv + 1 < NV; iv++) for (let iu = 0; iu < NU; iu++) {
    const s = new Set([label[idx(iu, iv)], label[idx(iu + 1, iv)], label[idx(iu, iv + 1)], label[idx(iu + 1, iv + 1)]]);
    if (s.size >= 3) junc.push({ d: dirs[idx(iu, iv)], dist: dist[idx(iu, iv)] });
  }
  junc.sort((a, b) => a.dist - b.dist);
  const junctions = [];
  for (const j of junc) if (!junctions.some((J) => angle(J.d, j.d) < 0.06)) junctions.push(j);

  // ---- chips: a few seam spots that lose a fragment at the break and fill with gold
  const chips = [];
  {
    const rc = rng(F.seed + 31);
    const cand = [];
    for (let k = 0; k < NU * NV; k++) if (seam[k]) { const el = E0 + (((k / NU) | 0) + 0.5) / NV * (E1 - E0); if (el > S.chips.elev[0] && el < S.chips.elev[1]) cand.push(k); }
    for (let tries = 0; chips.length < S.chips.n && tries < 4000; tries++) {
      const k = cand[rc.int(0, cand.length - 1)], d = dirs[k];
      if (chips.some((c) => angle(c.d, d) < S.chips.minSep)) continue;
      chips.push({ d, r: rc.range(S.chips.radius[0], S.chips.radius[1]), dist: dist[k] });
    }
  }

  // ---- time functions
  const crackFront = (t) => (t < T.impact ? -1 : (t - T.impact) * M.crackSpeed);
  const goldFront = (t) => (t < T.pour ? -1 : (t - T.pour) * speed);
  const broken = (t) => (t >= T.impact ? 1 : 0);

  /** sound events from the plan */
  function events() {
    const ev = [];
    ev.push({ kind: "setDown", t: T.land });
    ev.push({ kind: "lift", t: T.lift });
    ev.push({ kind: "impact", t: T.impact });
    for (const s of loose) {
      ev.push({ kind: "land", t: s.land, k: s.id, ring: s.ring, pan: clamp(s.L[0] / 2.4, -0.8, 0.8) });
      ev.push({ kind: "bounce", t: s.land + M.bounceT, k: s.id, pan: clamp(s.L[0] / 2.4, -0.8, 0.8) });
      ev.push({ kind: "home", t: s.home, k: s.id, pan: clamp(s.c[0] / 1.6, -0.6, 0.6) });
    }
    ev.push({ kind: "gatherSwell", t: T.gather, dur: Math.max(...loose.map((s) => s.home)) - T.gather });
    ev.push({ kind: "pour", t: T.pour, dur: G.flowDur });
    junctions.forEach((j, n) => { const t = T.pour + j.dist / speed; if (t < T.pour + G.flowDur + 0.05) ev.push({ kind: "junction", t, n }); });
    ev.push({ kind: "sealed", t: T.pour + G.flowDur + 0.15 });
    return ev.sort((a, b) => a.t - b.t);
  }

  return {
    profile: prof, field, shards, n: N, pose, bowlPose, worldPoints,
    grid: { nu: NU, nv: NV, e0: E0, e1: E1, dist, seam, label, max: maxSeam },
    pour: { dir: dirs[src], t: T.pour, speed, dur: G.flowDur }, impactDir,
    junctions, chips, crackFront, goldFront, broken, events, times: T,
  };
}

// ------------------------------------------------------------------ voices for kit scoreFromEvents (from spec.sound)
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
export function kintsugiVoices(SND) {
  const clinkHz = (k, base) => base * Math.pow(2, PENTA[(k * 5) % PENTA.length] / 12);
  return {
    setDown: () => [
      { type: "marimba", hz: SND.clink.hz * 0.75, decay: 0.16, mallet: 0.85, gain: SND.clink.gain * 0.9 },
      { type: "thud", dur: 0.25, pitch: 1.6, gain: 0.25 },
    ],
    lift: (e) => [{ type: "whoosh", dir: "in", dur: 0.7, q: 1.2, pitch: 0.9, gain: SND.whoosh }],
    impact: () => [
      { type: "impact", dur: 0.5, pitch: 1.3, gain: SND.impact.thud },
      { type: "clack", pitch: 2.2, gain: SND.impact.crack },
      { type: "rustle", dur: 0.35, density: 0.9, pitch: 2.4, gain: SND.impact.crackle },
      { type: "marimba", hz: SND.clink.hz * 1.4, decay: 0.12, mallet: 1, gain: SND.clink.gain },
    ],
    land: (e) => [
      { type: "marimba", hz: clinkHz(e.k, SND.clink.hz), decay: SND.clink.decay, mallet: 0.95, gain: SND.clink.gain * (e.ring === 2 ? 0.85 : 1) },
      { type: "tick", pitch: 1.8, gain: SND.clink.tick },
    ],
    bounce: (e) => [{ type: "marimba", hz: clinkHz(e.k, SND.clink.hz) * 1.02, decay: SND.clink.decay * 0.7, mallet: 0.9, gain: SND.clink.gain * 0.35 }],
    home: (e) => [
      { type: "clack", pitch: 1.5, gain: SND.home.clack },
      { type: "marimba", hz: clinkHz(e.k + 3, SND.home.hz), decay: 0.1, mallet: 0.7, gain: SND.home.gain },
    ],
    gatherSwell: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.8, e.dur * 0.6), q: 0.9, pitch: 0.7, gain: SND.whoosh * 0.7 }],
    pour: (e) => [
      { type: "pad", bus: "sfx", root: SND.pour.root, chord: [0, 7, 12, 19], dur: e.dur + 0.6, attack: 0.5, release: 1.4, brightness: SND.pour.brightness, gain: SND.pour.gain },
      { type: "rustle", dur: e.dur, density: 0.25, pitch: 2.6, gain: SND.pour.sizzle },
    ],
    junction: (e) => [{ type: "chime", dur: 1.1, notes: 2, pitch: Math.pow(2, PENTA[e.n % PENTA.length] / 12) * SND.junction.pitch, gain: SND.junction.gain }],
    sealed: () => [
      { type: "pluck", hz: SND.koto.hz, notes: [0, 7, 12, 16, 19], step: 0.11, decay: 2.2, bright: 0.5, dur: 3, gain: SND.koto.gain },
      { type: "chime", dur: 2.4, notes: 4, pitch: 1.0, gain: SND.junction.gain * 1.2 },
    ],
  };
}
