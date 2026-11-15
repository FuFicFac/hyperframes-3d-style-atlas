// styles/light-painting/strokes.js — the light-painting planner (pure; no THREE, no window, no DOM; Node-safe).
// A drawing is a list of "moves": a word (kit stroke font) or an icon (star, bulb, spiral, arrow, ring), each placed in
// 3D air with a time window and a colour. The planner turns every move into hand-waved strokes:
//   raw polyline -> corner overshoot (the hand carries past a corner and hooks back) -> light fillet -> resample
//   -> seeded wobble (x/y tremor + slow drift in depth) -> a speed profile (slow at starts, ends and tight turns,
//   seeded hesitation) -> per-sample absolute time T, brightness B and width W (slow = brighter and fatter, fast
//   flicks = thin and dim, as a real long exposure records them) -> occasional "switched off" gaps.
// At time t a trail is everything with T <= t — a closed-form function of t, no accumulation buffer. The same plan
// gives the pen position (penAt), bright pause blobs, the framing boxes and the SOUND events (tick per stroke start,
// a shimmer chunk every ~0.1 s whose level follows pen speed), so picture and SCORE agree by construction.
import { clamp, lerp, smoothstep, rng, ease } from "../../kit/time.js";
import { noise3 } from "../../kit/noise.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { expandStroke, filletPath } from "../../kit/pathmath.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- icons (unit size, centred, x/y plane; z allowed)
/** ICONS[name](o) -> [stroke, ...]; a stroke is [[x, y, z?], ...]. Size ~1 (height). */
export const ICONS = {
  star(o = {}) {
    const n = o.points ?? 5, r0 = 0.5, r1 = r0 * (o.inner ?? 0.42), pts = [];
    for (let i = 0; i <= n * 2; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? r1 : r0;
      pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
    }
    pts.push(mul(add(pts[1], pts[0]), 0.5).map((v, k) => (k === 2 ? 0 : v))); // the hand closes past the start
    return [pts];
  },
  /** bulb: open glass outline (one stroke), then two base bands, then a filament zig */
  bulb() {
    const glass = expandStroke([[-0.16, -0.18], ["a", 0, 0.16, 0.36, 0.36, 208, -28], [0.16, -0.18]], 1);
    const band1 = [[-0.17, -0.27, 0], [0.17, -0.27, 0]];
    const band2 = [[-0.13, -0.37, 0], [0.13, -0.37, 0], [0.04, -0.46, 0], [-0.04, -0.46, 0]];
    const fil = [[-0.1, -0.16, 0], [-0.06, 0.12, 0], [-0.02, 0.02, 0], [0.02, 0.14, 0], [0.06, 0.02, 0], [0.1, 0.12, 0], [0.1, -0.16, 0]];
    return [glass, fil, band1, band2];
  },
  /** spiral: an Archimedean spiral that also recedes in depth (a coil) — `depth` metres per unit size */
  spiral(o = {}) {
    const turns = o.turns ?? 2.6, depth = o.depth ?? 0.6, pts = [], n = Math.ceil(turns * 72);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = u * turns * Math.PI * 2, r = 0.04 + 0.46 * u;
      pts.push([Math.cos(a) * r, Math.sin(a) * r, -depth * (1 - u)]);
    }
    return [pts];
  },
  arrow() {
    return [[[-0.5, -0.1, 0], [-0.1, 0.06, 0], [0.42, 0.02, 0]], [[0.2, 0.22, 0], [0.46, 0.02, 0], [0.22, -0.2, 0]]];
  },
  /** ring: a tilted elliptical loop through depth (wraps around a subject); turns > 1 spirals outward a little */
  ring(o = {}) {
    const turns = o.turns ?? 1.1, rx = o.rx ?? 0.5, ry = o.ry ?? 0.15, rz = o.rz ?? 0.25, grow = o.grow ?? 0.06, a0 = o.a0 ?? Math.PI * 0.9;
    const pts = [], n = Math.ceil(turns * 140);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + u * turns * Math.PI * 2, k = 1 + grow * u;
      pts.push([Math.cos(a) * rx * k, -Math.sin(a) * ry * k, Math.sin(a) * rz * k]);
    }
    return [pts];
  },
};

// ---------------------------------------------------------------- placement
function placer({ at = [0, 0, 0], size = 1, yaw = 0, pitch = 0, roll = 0 }) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  return (p) => {
    let x = p[0] * size, y = p[1] * size, z = (p[2] ?? 0) * size;
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    return [x + at[0], y + at[1], z + at[2]];
  };
}

/** raw strokes for one move (world space, before hand character) */
function rawStrokes(m) {
  if (m.kind === "text") {
    const lay = layoutStrokeText(m.text, m.cap, { letterSpacing: m.letterSpacing ?? 0.3, bendRadius: m.bend ?? 0.05, align: "center" });
    const out = [];
    for (const c of lay.chars) {
      const zc = (m.letterZ ?? [])[c.i] ?? 0; // per-letter depth (the hand drifts toward / away from the lens)
      for (const s of c.strokes) out.push(s.map((p) => [p[0] + m.at[0], p[1] + m.at[1] - m.cap / 2, (p[2] ?? 0) + m.at[2] + zc]));
    }
    return out;
  }
  const f = ICONS[m.icon];
  if (!f) throw new Error(`strokes.js: unknown icon "${m.icon}"`);
  const P = placer(m);
  return f(m.opts ?? {}).map((s) => s.map(P));
}

// ---------------------------------------------------------------- hand character
/** corner overshoot: past each sharp corner the hand carries on a little and hooks back */
function overshoot(pts, H, R) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], P = pts[i], B = pts[i + 1];
    const u = nrm(sub(P, A)), v = nrm(sub(B, P));
    const turn = Math.acos(clamp(dot(u, v), -1, 1));
    if (turn < H.cornerTurn) { out.push(P); continue; }
    const o = H.overshoot * (0.6 + 0.8 * R.next()) * Math.min(1, turn / 1.6);
    const la = len(sub(P, A)), lb = len(sub(B, P));
    out.push(add(P, mul(u, Math.min(o, la * 0.5))));
    out.push(add(P, mul(v, Math.min(o * 0.35, lb * 0.3))));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function resample(pts, step) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / step) + 1), out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < pts.length - 1 && cum[j] < s) j++;
    const seg = cum[j] - cum[j - 1], u = seg > 0 ? clamp((s - cum[j - 1]) / seg) : 0;
    out.push(add(pts[j - 1], mul(sub(pts[j], pts[j - 1]), u)));
  }
  return { pts: out, L };
}

/** build one stroke's samples: wobble, tangents, curvature, slowness profile (relative), gaps */
function shapeStroke(raw, H, seed, R) {
  const step = H.step;
  const base = resample(filletPath(overshoot(raw, H, R), H.fillet), step);
  const W = H.wobble, n = base.pts.length;
  const pts = base.pts.map((p, i) => {
    const s = i * (base.L / (n - 1));
    const tremor = (k, f, a) => (noise3(s * f, k * 7.31, seed * 0.173, 11 + seed) - 0.5) * 2 * a;
    return [
      p[0] + tremor(1, W.freq, W.amp) + tremor(4, W.jitterFreq, W.jitter),
      p[1] + tremor(2, W.freq, W.amp) + tremor(5, W.jitterFreq, W.jitter),
      p[2] + tremor(3, W.freqZ, W.ampZ),
    ];
  });
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = cum[n - 1];
  const tan = pts.map((p, i) => nrm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  // curvature (turn per metre), smoothed over ~±3 samples
  const kraw = pts.map((p, i) => (i === 0 || i === n - 1 ? 0 : Math.acos(clamp(dot(tan[i - 1], tan[i + 1]), -1, 1)) / (2 * step)));
  const curv = kraw.map((_, i) => { let s = 0, c = 0; for (let d = -3; d <= 3; d++) { const k = kraw[i + d]; if (k != null) { s += k; c++; } } return s / c; });
  const S = H.speed;
  const slow = pts.map((p, i) => {
    const s = cum[i];
    return 1
      + S.curv * Math.min(curv[i], 12) / 12 * 3
      + S.start * Math.exp(-s / S.startLen)
      + S.end * Math.exp(-(L - s) / S.endLen)
      + S.noise * (noise3(s * S.noiseFreq, 3.3, seed * 0.31, 29) - 0.5) * 2;
  }).map((w) => Math.max(0.35, w));
  // "switched off": a short gap, sometimes, in longer strokes (never at the very ends)
  const gaps = [];
  if (L > H.gaps.minLen && R.chance(H.gaps.chance)) {
    const at = lerp(0.3, 0.7, R.next()) * L, gl = H.gaps.len * (0.7 + 0.6 * R.next());
    gaps.push([at, at + gl]);
  }
  return { pts, tan, cum, L, slow, curv, gaps };
}

// ---------------------------------------------------------------- plan
/**
 * createDrawing(moves, H, { seed }) -> plan
 *   moves: [{ id, kind: "text"|"icon", text?, cap?, icon?, opts?, at, size?, yaw?, pitch?, roll?, letterZ?, color, t0, t1,
 *             dwell? (s the pen sits at the first point, light on, before moving), group? }]
 *   H: spec.hand (step, fillet, cornerTurn, overshoot, wobble, speed, response, gaps, travel)
 *   plan = { strokes, moves, penAt(t), events({ chunk }), box(t, ids?), finalBox(ids?), drawnFraction(groupOrId, t) }
 *   strokes[k] = { id, move, color, pts, tan, T, B, W, on, tOn, tMove, t1, L, blobs: [{ p, t, b, size }] }
 */
export function createDrawing(moves, H, { seed = 59 } = {}) {
  const R = rng(seed);
  const strokes = [];
  for (const [mi, m] of moves.entries()) {
    const raws = rawStrokes(m);
    const shaped = raws.map((r, k) => shapeStroke(r, H, seed * 31 + mi * 17 + k, R.fork(mi * 101 + k)));
    // time budget: travel gaps between strokes scale with the jump; drawing time ~ length^p
    const dwell = m.dwell ?? H.travel.dwell;
    const travel = shaped.map((s, k) => (k === 0 ? 0 : H.travel.base + H.travel.perM * len(sub(s.pts[0], shaped[k - 1].pts[shaped[k - 1].pts.length - 1]))));
    const tTravel = travel.reduce((a, b) => a + b, 0) + dwell * shaped.length;
    const weights = shaped.map((s) => Math.pow(s.L, H.travel.lenExp));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const avail = m.t1 - m.t0 - tTravel - (m.dwell != null ? m.dwell - H.travel.dwell : 0);
    if (avail <= 0.1) throw new Error(`strokes.js: move ${m.id} has no time to draw (${avail.toFixed(2)} s)`);
    let t = m.t0;
    shaped.forEach((s, k) => {
      t += travel[k];
      const d0 = k === 0 ? dwell : H.travel.dwell;
      const tOn = t, tMove = t + d0, dur = (avail * weights[k]) / wsum;
      // per-segment time ∝ length × slowness; normalised to dur
      const n = s.pts.length, dts = [0];
      let tot = 0;
      for (let i = 1; i < n; i++) { const dt = (s.cum[i] - s.cum[i - 1]) * 0.5 * (s.slow[i] + s.slow[i - 1]); dts.push(dt); tot += dt; }
      const T = new Array(n), V = new Array(n);
      let acc = 0;
      for (let i = 0; i < n; i++) { acc += dts[i] * (dur / tot); T[i] = tMove + acc; }
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        V[i] = (s.cum[b] - s.cum[a]) / Math.max(1e-4, T[b] - T[a]); // m/s
      }
      const vMean = s.L / dur;
      const Rp = H.response;
      const rel = V.map((v) => Math.max(0.05, v / vMean));
      const global = Math.pow(clamp(Rp.vRef / vMean, 0.4, 2.5), Rp.globalExp);
      const B = rel.map((r) => clamp(Math.pow(r, -Rp.brightExp) * global, Rp.brightMin, Rp.brightMax));
      const Wd = rel.map((r) => clamp(Math.pow(r, -Rp.widthExp) * Math.pow(global, 0.5), Rp.widthMin, Rp.widthMax));
      // battery / hand-angle flutter: slow brightness breathing along the stroke
      for (let i = 0; i < n; i++) B[i] *= 1 - Rp.flutter * noise3(s.cum[i] * 1.7, 9.1, k + mi * 13, 43);
      const on = s.cum.map((c) => (s.gaps.some(([g0, g1]) => c > g0 && c < g1) ? 0 : 1));
      // pause blobs: the start (dwell), sharp turns (slow points), the lift-off
      const blobs = [{ p: s.pts[0], t: tOn, tFull: tMove, b: Rp.blobStart * (k === 0 ? 1.25 : 1) * clamp(d0 / 0.12, 0.6, 1.6), size: Rp.blobSize * clamp(Math.sqrt(d0 / 0.12), 0.8, 1.7) }];
      for (let i = 2; i < n - 2; i++) {
        if (s.curv[i] > Rp.blobCurv && s.curv[i] >= s.curv[i - 1] && s.curv[i] >= s.curv[i + 1] && rel[i] < 0.6) {
          const last = blobs[blobs.length - 1];
          if (len(sub(last.p, s.pts[i])) < 0.12) continue;
          blobs.push({ p: s.pts[i], t: T[i], tFull: T[i] + 0.04, b: Rp.blobCorner * clamp(0.6 / rel[i], 1, 2), size: Rp.blobSize * 0.75 });
        }
      }
      blobs.push({ p: s.pts[n - 1], t: T[n - 1], tFull: T[n - 1] + 0.03, b: Rp.blobEnd, size: Rp.blobSize * 0.6 });
      strokes.push({ id: `${m.id}.${k}`, move: m.id, group: m.group ?? m.id, color: m.color, pts: s.pts, tan: s.tan, cum: s.cum, L: s.L, T, B, W: Wd, V, on, tOn, tMove, t1: T[n - 1], blobs });
      t = T[n - 1];
    });
  }
  strokes.sort((a, b) => a.tOn - b.tOn);

  /** pen tip at t: on a stroke (light on), dwelling, or travelling between strokes (light off) */
  function penAt(t) {
    let k = -1;
    for (let i = 0; i < strokes.length; i++) if (strokes[i].tOn <= t) k = i;
    if (k < 0) {
      const s = strokes[0];
      return { p: s.pts[0], on: 0, color: s.color, speed: 0, stroke: -1, drawing: false };
    }
    const s = strokes[k];
    if (t <= s.tMove) return { p: s.pts[0], on: 1, color: s.color, speed: 0, stroke: k, drawing: true };
    if (t <= s.t1) {
      let lo = 0, hi = s.T.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.T[mid] <= t) lo = mid; else hi = mid; }
      const u = clamp((t - s.T[lo]) / Math.max(1e-6, s.T[hi] - s.T[lo]));
      const p = add(s.pts[lo], mul(sub(s.pts[hi], s.pts[lo]), u));
      return { p, on: s.on[lo] * s.on[hi] ? 1 : 0, color: s.color, speed: lerp(s.V[lo], s.V[hi], u), stroke: k, drawing: true, bright: lerp(s.B[lo], s.B[hi], u) };
    }
    const nx = strokes[k + 1];
    const end = s.pts[s.pts.length - 1];
    if (!nx) return { p: end, on: 0, color: s.color, speed: 0, stroke: k, drawing: false };
    const u = ease.inOutSine(clamp((t - s.t1) / Math.max(1e-6, nx.tOn - s.t1)));
    const p = add(end, mul(sub(nx.pts[0], end), u));
    p[2] += Math.sin(Math.PI * u) * H.travel.lift; // the hand pulls back toward the body while the light is off
    return { p, on: 0, color: s.color, speed: 0, stroke: k, drawing: false };
  }

  /** sound events: { t, kind: "start" } per stroke, { t, kind: "shimmer", speed, bright, dur } per chunk while drawing */
  function events({ chunk = 0.1 } = {}) {
    const ev = [];
    strokes.forEach((s, k) => {
      ev.push({ t: s.tOn, kind: "start", stroke: k, group: s.group });
      for (let t = s.tOn; t < s.t1 - 1e-6; t += chunk) {
        const tm = Math.min(s.t1, t + chunk * 0.5), pen = penAt(tm);
        ev.push({ t: +t.toFixed(4), kind: "shimmer", stroke: k, group: s.group, speed: pen.speed, on: pen.on, dur: Math.min(chunk * 1.6, s.t1 - t + 0.06) });
      }
    });
    return ev.sort((a, b) => a.t - b.t);
  }

  /** bounding box of everything drawn by t (optionally only strokes in ids/groups); null if nothing yet */
  function box(t = Infinity, ids = null) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const s of strokes) {
      if (s.tMove > t) continue;
      if (ids && !ids.includes(s.move) && !ids.includes(s.group)) continue;
      for (let i = 0; i < s.pts.length; i++) {
        if (s.T[i] > t) break;
        any = true;
        for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], s.pts[i][a]); mx[a] = Math.max(mx[a], s.pts[i][a]); }
      }
    }
    return any ? [mn, mx] : null;
  }

  /** fraction (0..1) of a move's / group's total length drawn by t */
  function drawnFraction(id, t) {
    let tot = 0, got = 0;
    for (const s of strokes) {
      if (s.move !== id && s.group !== id) continue;
      tot += s.L;
      if (t >= s.t1) got += s.L;
      else if (t > s.tMove) {
        let i = 0; while (i < s.T.length - 1 && s.T[i + 1] <= t) i++;
        got += s.cum[i];
      }
    }
    return tot ? got / tot : 0;
  }

  /** centroid of a move's / group's strokes (for spill lights) */
  function centroid(id) {
    let c = [0, 0, 0], n = 0;
    for (const s of strokes) if (s.move === id || s.group === id) for (const p of s.pts) { c = add(c, p); n++; }
    return n ? mul(c, 1 / n) : [0, 0, 0];
  }

  const end = strokes.reduce((a, s) => Math.max(a, s.t1), 0);
  return { strokes, moves, penAt, events, box, drawnFraction, centroid, end, samples: strokes.reduce((a, s) => a + s.pts.length, 0) };
}

/** painterAt(plan, t, P) -> { body: [x,y,z], hand: [x,y,z], lean } — the ghost follows a lagged average of the pen */
export function painterAt(plan, t, P) {
  let x = 0, z = 0, n = 0;
  for (let k = 0; k < P.lagSamples; k++) {
    const pen = plan.penAt(t - (k * P.lag) / (P.lagSamples - 1));
    x += pen.p[0]; z += pen.p[2]; n++;
  }
  x /= n; z /= n;
  const hand = plan.penAt(t).p;
  const dx = hand[0] - x;
  if (Math.abs(dx) > P.reach) x = hand[0] - Math.sign(dx) * P.reach;
  return { body: [x, 0, z - P.behind], hand, lean: clamp((hand[0] - x) / P.reach, -1, 1) };
}

/** voices for scoreFromEvents (sound palette numbers live in spec.sound) */
export function strokeVoices(SND) {
  return {
    start: () => [{ type: "tick", gain: SND.tick.gain, pitch: SND.tick.pitch }],
    shimmer: (e, c) => {
      if (!e.on) return [];
      const v = c.k(e.speed / SND.shimmer.vRef, 0, 1.6);
      return [{ type: "buzz", dur: e.dur, hz: SND.shimmer.hz * (0.85 + 0.3 * v), flicker: SND.shimmer.flicker, gain: SND.shimmer.gain * (0.35 + 0.65 * v), pitch: 1 }];
    },
  };
}

export { smoothstep };
