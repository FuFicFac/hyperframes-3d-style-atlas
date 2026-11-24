// styles/caustics/caustic.js — the Node-safe planner for "caustics" (plain data in, plain data out; no THREE, no window,
// no DOM). Imported by style.js (picture) AND by the demo's scene.config.js (SCORE), so every sound cue and every frame
// read the same plan. Everything iterative runs ONCE here, when the module is called; renderAt only reads the results.
//
// What it plans
//   1. TARGET   a bold, original smiling-sun icon rasterised analytically (signed distances, 1-texel anti-aliasing) into an
//               n x n brightness map with a floor (spec.target.floor, ~8 %) so no region of the light patch is ever empty.
//   2. STIR     a smooth, exactly area-preserving "stirring" of the unit square: a few twists (each turns points about a
//               centre by an angle that depends only on the distance — closed form, exactly invertible). Even light stays
//               even under it, but WHERE each ray ends up is scrambled, so the glass's lumps (and the light at the wrong
//               height) show no hint of the picture: on the way to focus the light swirls, then unwinds into it.
//   3. MAP      a crossing-free cumulative-sum mapping (Knothe–Rosenblatt): x by the column cumulative distribution, then y
//               by the conditional row distribution at that x (adjacent columns blended). Uniform light -> the target.
//   4. RAYS     an R x R ray mesh, regular in STIRRED space: node g sits on the glass at x = STIR^-1(g) and lands at
//               x + s * def,  def = MAP(g) - x,  s = glass height / focus height (small-angle refraction: the sideways
//               offset grows linearly with distance). s = 0: even light; s = 1: the picture; s > 1: it over-focuses.
//               (Meshing in stirred space keeps every triangle compact at s = 1, so the picture is clean; the mesh is
//               twisted on the glass instead, where it only has to tile the square.)
//   5. GLASS    the slab's surface: a normal field derived from the SAME deflection (slope ∝ def) and a height field
//               (least-squares integral of def, Gauss–Seidel) for the visible lumps. The glass on screen is the glass that
//               makes the picture.
//   6. TIME     glass height d(t) from keyed segments (the only animated optical input), focus sharpness, beam level, room
//               dip, and the event list the sound is built from.
// Motion type: analytical approximation — small-angle refraction, and a cumulative-sum mapping in place of a true
// optimal-transport solve, so the deflection field is not exactly curl-free (no real slab could make it exactly).
import { clamp, smoothstep, toEase } from "../../kit/time.js";

// ---------------------------------------------------------------- 1. target: the smiling sun
/** signed distance helpers (picture units: x right, y up, centred, square side 1) */
const len = (x, y) => Math.sqrt(x * x + y * y);
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return [len(pax - bax * h, pay - bay * h), h];
}
/** sunCoverage(x, y, S, aa) -> 0..1 brightness of the icon (before the floor) */
export function sunCoverage(x, y, S, aa) {
  const cov = (sd) => clamp(0.5 - sd / aa, 0, 1);
  // disc
  let bright = cov(len(x, y) - S.disc);
  // rays: tapered round-ended bars
  for (let k = 0; k < S.rays; k++) {
    const a = S.rayPhase + (k * 2 * Math.PI) / S.rays;
    const ca = Math.cos(a), sa = Math.sin(a);
    const [d, h] = sdSegment(x, y, ca * S.ray0, sa * S.ray0, ca * S.ray1, sa * S.ray1);
    const w = S.rayW0 + (S.rayW1 - S.rayW0) * h;
    bright = Math.max(bright, cov(d - w));
  }
  // eyes (dark ellipses, approximate distance)
  let dark = 0;
  for (const sx of [-1, 1]) {
    const ex = (x - sx * S.eyeX) / S.eyeRx, ey = (y - S.eyeY) / S.eyeRy;
    dark = Math.max(dark, cov((len(ex, ey) - 1) * Math.min(S.eyeRx, S.eyeRy)));
  }
  // smile: an arc with round ends (angles in radians, measured from +x, counter-clockwise)
  {
    const dx = x, dy = y - S.smileY;
    let ang = Math.atan2(dy, dx); if (ang < 0) ang += 2 * Math.PI;
    let d;
    if (ang >= S.smileA0 && ang <= S.smileA1) d = Math.abs(len(dx, dy) - S.smileR);
    else {
      const e0 = [Math.cos(S.smileA0) * S.smileR, Math.sin(S.smileA0) * S.smileR], e1 = [Math.cos(S.smileA1) * S.smileR, Math.sin(S.smileA1) * S.smileR];
      d = Math.min(len(dx - e0[0], dy - e0[1]), len(dx - e1[0], dy - e1[1]));
    }
    dark = Math.max(dark, cov(d - S.smileW));
  }
  return bright * (1 - dark);
}
/** sunTarget(n, S) -> Float64Array n*n, row j = 0 at the BOTTOM (y up), values floor..1 */
export function sunTarget(n, S) {
  const T = new Float64Array(n * n), aa = 1.25 / n;
  for (let j = 0; j < n; j++) {
    const y = (j + 0.5) / n - 0.5;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n - 0.5;
      T[j * n + i] = S.floor + (1 - S.floor) * sunCoverage(x / S.scale, y / S.scale, S, aa / S.scale);
    }
  }
  return T;
}

// ---------------------------------------------------------------- 2. stir: exact area-preserving twists
// A twist turns every point about a centre c by an angle that depends only on its distance r from c:
//   angle(r) = A * (1 - (r / rho)^(2p))^2  for r < rho, 0 outside (p = 1 by default; larger p turns the outer rings too).
// Turning by an angle that depends only on r keeps every ring on itself, so area is preserved EXACTLY (Jacobian 1),
// and the inverse is the same turn backwards — closed form, no stepping. Discs stay inside the unit square, so the
// square maps onto itself. A list of twists is applied in order (and undone in reverse order).
function twistOne(x, y, tw, sign) {
  const dx = x - tw.c[0], dy = y - tw.c[1];
  const q = (dx * dx + dy * dy) / (tw.r * tw.r);
  if (q >= 1) return [x, y];
  const w = 1 - (tw.p ? q ** tw.p : q), ang = sign * tw.A * w * w;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return [tw.c[0] + ca * dx - sa * dy, tw.c[1] + sa * dx + ca * dy];
}
/** stirForward(twists, x, y) -> P(x, y);  stirInverse(twists, x, y) -> P^-1(x, y)  (unit-square coordinates) */
export function stirForward(twists, x, y) { let p = [x, y]; for (let i = 0; i < twists.length; i++) p = twistOne(p[0], p[1], twists[i], 1); return p; }
export function stirInverse(twists, x, y) { let p = [x, y]; for (let i = twists.length - 1; i >= 0; i--) p = twistOne(p[0], p[1], twists[i], -1); return p; }

// ---------------------------------------------------------------- 3. map: cumulative sums (Knothe–Rosenblatt)
function buildMap(T, n) {
  const colMass = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += T[j * n + i]; colMass[i] = s; total += s; }
  const cdfX = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cdfX[i + 1] = cdfX[i] + colMass[i] / total;
  cdfX[n] = 1;
  const cdfY = new Float64Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    const o = i * (n + 1);
    for (let j = 0; j < n; j++) cdfY[o + j + 1] = cdfY[o + j] + T[j * n + i] / colMass[i];
    cdfY[o + n] = 1;
  }
  /** u in [0,1] (uniform) -> x in [0,1] */
  const mapX = (u) => {
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdfX[mid] <= u) lo = mid; else hi = mid; }
    const w = cdfX[lo + 1] - cdfX[lo];
    return (lo + (w > 0 ? clamp((u - cdfX[lo]) / w, 0, 1) : 0.5)) / n;
  };
  /** (x, v) -> y: invert the conditional row CDF at x (columns either side blended linearly) */
  const mapY = (x, v) => {
    const c = x * n - 0.5;
    let i0 = Math.floor(c); const a = clamp(c - i0, 0, 1);
    i0 = clamp(i0, 0, n - 1); const i1 = Math.min(i0 + 1, n - 1);
    const o0 = i0 * (n + 1), o1 = i1 * (n + 1);
    const F = (k) => (1 - a) * cdfY[o0 + k] + a * cdfY[o1 + k];
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F(mid) <= v) lo = mid; else hi = mid; }
    const f0 = F(lo), w = F(lo + 1) - f0;
    return (lo + (w > 0 ? clamp((v - f0) / w, 0, 1) : 0.5)) / n;
  };
  return { mapX, mapY, total: total / (n * n) };
}

// ---------------------------------------------------------------- 5. glass height: least-squares integral of def
function integrateHeight(def, R, N, iters) {
  // sample def on an N x N grid (bilinear from the R x R ray grid), then solve lap(h) = div(def) by Gauss–Seidel
  const sample = (u, v, c) => {
    const fx = u * (R - 1), fy = v * (R - 1);
    const i0 = Math.min(Math.floor(fx), R - 2), j0 = Math.min(Math.floor(fy), R - 2);
    const ax = fx - i0, ay = fy - j0, q = (i, j) => def[2 * (j * R + i) + c];
    return (1 - ay) * ((1 - ax) * q(i0, j0) + ax * q(i0 + 1, j0)) + ay * ((1 - ax) * q(i0, j0 + 1) + ax * q(i0 + 1, j0 + 1));
  };
  const gx = new Float64Array(N * N), gy = new Float64Array(N * N), h = new Float64Array(N * N), div = new Float64Array(N * N);
  const dh = 1 / (N - 1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { gx[j * N + i] = sample(i * dh, j * dh, 0); gy[j * N + i] = sample(i * dh, j * dh, 1); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const ip = Math.min(i + 1, N - 1), im = Math.max(i - 1, 0), jp = Math.min(j + 1, N - 1), jm = Math.max(j - 1, 0);
    div[j * N + i] = (gx[j * N + ip] - gx[j * N + im]) / ((ip - im) * dh) + (gy[jp * N + i] - gy[jm * N + i]) / ((jp - jm) * dh);
  }
  for (let it = 0; it < iters; it++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const ip = Math.min(i + 1, N - 1), im = Math.max(i - 1, 0), jp = Math.min(j + 1, N - 1), jm = Math.max(j - 1, 0);
      h[j * N + i] = 0.25 * (h[j * N + ip] + h[j * N + im] + h[jp * N + i] + h[jm * N + i] - dh * dh * div[j * N + i]);
    }
  }
  let mean = 0; for (let k = 0; k < N * N; k++) mean += h[k]; mean /= N * N;
  let mx = 1e-9; for (let k = 0; k < N * N; k++) { h[k] -= mean; mx = Math.max(mx, Math.abs(h[k])); }
  const out = new Float32Array(N * N); for (let k = 0; k < N * N; k++) out[k] = h[k] / mx; // normalised to ±1
  return out;
}

// ---------------------------------------------------------------- 6. time: glass height keys
/** keyed(t, keys) keys = [[t, value, ease?], ...] -> piecewise eased value (holds before / after) */
export function keyed(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i], [t0, v0] = keys[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * toEase(e || "inOutCubic")((t - t0) / Math.max(1e-9, t1 - t0));
  }
  return keys[keys.length - 1][1];
}

/**
 * createCausticPlan(cfg) -> plan
 *   cfg = { target: spec.target, stir: spec.stir, rays: spec.rays, glass: spec.glass,
 *           height: [[t, d, ease], ...]  glass height above the table in metres,
 *           tilt:   [[t, radians, ease], ...] slab tilt on its pivots (beat 1),
 *           beam:   { on, rise }, room: { dipAt, dipDur, dip, back?, backDur? }, events: { ... } }
 *   plan = { cfg, R, src (Float32 2R², picture units ±0.5), def (Float32 2R², at s = 1), index (Uint32 triangles),
 *            n, target (Float32 n²), Ng, gdef (Float32 2Ng², def on a regular glass grid), normals (Uint8 RGBA Ng²,
 *            tangent-space), heights (Float32 N², ±1), N,
 *            dFocus, heightAt(t), tiltAt(t), sAt(t), sharpAt(t), beamAt(t), roomAt(t), events(), stats }
 */
export function createCausticPlan(cfg) {
  const TG = cfg.target, ST = cfg.stir, RY = cfg.rays, GL = cfg.glass;
  const n = TG.n, R = RY.n;
  const T = sunTarget(n, TG);
  const map = buildMap(T, n);

  const twists = ST.amount > 0 ? ST.twists.map((w) => ({ ...w, A: w.A * ST.amount })) : [];

  // RAYS: regular grid in stirred space g; glass position x = STIR^-1(g); picture units centred on 0 (x right, y up)
  const src = new Float32Array(2 * R * R), def = new Float32Array(2 * R * R);
  let maxDef = 0;
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const gu = i / (R - 1), gv = j / (R - 1);
    const [xu, xv] = stirInverse(twists, gu, gv);
    const tx = map.mapX(gu), ty = map.mapY(tx, gv);
    const k = 2 * (j * R + i);
    src[k] = xu - 0.5; src[k + 1] = xv - 0.5;
    def[k] = tx - xu; def[k + 1] = ty - xv;
    maxDef = Math.max(maxDef, len(def[k], def[k + 1]));
  }
  const index = new Uint32Array(6 * (R - 1) * (R - 1));
  {
    let p = 0;
    for (let j = 0; j < R - 1; j++) for (let i = 0; i < R - 1; i++) {
      const a = j * R + i, b = a + 1, c = a + R, d = c + 1;
      // alternate the diagonal so the grid has no preferred direction
      if ((i + j) & 1) { index[p++] = a; index[p++] = b; index[p++] = d; index[p++] = a; index[p++] = d; index[p++] = c; }
      else { index[p++] = a; index[p++] = b; index[p++] = c; index[p++] = b; index[p++] = d; index[p++] = c; }
    }
  }

  // GLASS: the deflection on a REGULAR glass grid (Ng x Ng): def(x) = MAP(STIR(x)) - x; tangent-space normals with
  // slope ∝ def, RGBA8, row 0 = bottom (v up) like a texture
  const Ng = GL.normalGrid;
  const gdef = new Float32Array(2 * Ng * Ng);
  const normals = new Uint8Array(4 * Ng * Ng);
  for (let j = 0; j < Ng; j++) for (let i = 0; i < Ng; i++) {
    const xu = i / (Ng - 1), xv = j / (Ng - 1);
    const [gu, gv] = stirForward(twists, xu, xv);
    const tx = map.mapX(gu), ty = map.mapY(tx, gv);
    const k = j * Ng + i;
    gdef[2 * k] = tx - xu; gdef[2 * k + 1] = ty - xv;
    const sx = GL.slope * gdef[2 * k], sy = GL.slope * gdef[2 * k + 1];
    const il = 1 / Math.sqrt(sx * sx + sy * sy + 1);
    normals[4 * k] = Math.round(255 * (0.5 + 0.5 * -sx * il));
    normals[4 * k + 1] = Math.round(255 * (0.5 + 0.5 * -sy * il));
    normals[4 * k + 2] = Math.round(255 * (0.5 + 0.5 * il));
    normals[4 * k + 3] = 255;
  }
  const N = GL.heightGrid;
  const heights = integrateHeight(gdef, Ng, N, GL.heightIters);

  // TIME
  const dFocus = cfg.focus;
  const heightAt = (t) => keyed(t, cfg.height);
  const tiltAt = (t) => keyed(t, cfg.tilt);
  const sAt = (t) => heightAt(t) / dFocus;
  const sharpAt = (t) => Math.exp(-(((sAt(t) - 1) / cfg.sharpWidth) ** 2));
  const beamAt = (t) => smoothstep(cfg.beam.on, cfg.beam.on + cfg.beam.rise, t);
  const roomAt = (t) => {
    const R0 = cfg.room;
    let k = 1 - R0.dip * smoothstep(R0.dipAt, R0.dipAt + R0.dipDur, t);
    if (R0.back != null) k += R0.dip * R0.back * smoothstep(R0.backAt, R0.backAt + R0.backDur, t);
    return k;
  };

  /** events() -> [{ t, kind, ... }] for scoreFromEvents: every time comes from the keys above (plain data) */
  function events() {
    const E = cfg.events, out = [];
    for (const e of E) out.push({ ...e });
    return out.sort((a, b) => a.t - b.t);
  }

  // mean brightness of the target relative to its peak (for exposure): light is conserved, so the bright strokes are
  // 1 / mean times the even patch.
  let tMean = 0; for (let k = 0; k < n * n; k++) tMean += T[k]; tMean /= n * n;
  const target = Float32Array.from(T);
  return {
    cfg, R, src, def, index, n, target, normals, Ng, gdef, heights, N, dFocus,
    heightAt, tiltAt, sAt, sharpAt, beamAt, roomAt, events,
    stats: { maxDef: +maxDef.toFixed(4), targetMean: +tMean.toFixed(4), peakGain: +(1 / tMean).toFixed(3) },
  };
}

/** planHash(plan) -> 8-hex FNV-1a of the ray deflections (diagnostic: Node and Chrome may differ in the last bits of
 *  Math.sin; only the picture reads def, no sound decision depends on it) */
export function planHash(plan) {
  let h = 0x811c9dc5;
  const b = new Uint8Array(plan.def.buffer, plan.def.byteOffset, plan.def.byteLength);
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
}
