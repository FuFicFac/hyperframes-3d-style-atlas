// styles/anamorphic/anamorph.js — the anamorphic planner for "Anamorphic Illusion". PURE: no THREE, no window, no DOM
// (Node-safe), so scene.config.js imports it for SCORE + the framing gate and style.js reads the very same plan.
//
// Model. A figure is a set of 2D polylines (stroke-font text, a star, any polylines) laid out on an IMAGE PLANE at
// distance d0 in front of a "sweet spot" eye E, in the eye's camera basis (right R, up U, forward F — built exactly the
// way kit/framing.cameraBasis / three's lookAt build them, so the rig's camera at E looking at E + F matches):
//
//     P(u, v) = E + d0·F + u·R + v·U
//
// The polylines are cut into short chunks (one chunk = one physical piece: a bent rod with rounded ends). Each piece k
// gets ONE seeded depth factor s_k and every point of it is moved along its own eye ray:
//
//     X = E + s_k · (P − E),   radius_k = s_k · r0
//
// A central projection from E maps X back onto P exactly, and the rod's radius scales with distance, so from E every
// piece covers exactly its slice of the figure at constant apparent size: the figure is crisp. From anywhere else the
// pieces sit at very different depths (s from ~0.4 to ~1.7) and parallax tears the figure apart.
// s_k is drawn per piece from a stratified seeded sequence inside the interval that keeps the whole piece inside the room
// box (and away from the eye), so pieces never pierce a wall, the floor or the ceiling.
//
// The same plan gives: piece geometry (style.js), a hanging point + string length per piece, the alignment error of any
// camera pose (RMS NDC distance between where the pieces project and where the flat figure projects — exactly 0 at E),
// and from that error over the camera move: convergence ticks, the lock "snap", and the tear-away notes (SCORE).
import { rng, clamp, smoothstep } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { pathLength, pointAt } from "../../kit/pathmath.js";
import { cameraBasis, projectPoint, sampleCameraKeys, prepareKeys } from "../../kit/framing.js";

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------------------------------------------------------------- figures (2D, u right, v up, metres on the image plane)
/** star polyline (closed), centred: points, outer radius 1, inner ratio, rotation (rad, 0 = a point straight up) */
export function starPoly(points = 5, inner = 0.45, rot = 0) {
  const out = [];
  for (let k = 0; k <= points * 2; k++) {
    const a = rot + (k * Math.PI) / points, r = k % 2 ? inner : 1;
    out.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return out;
}
/** heart polyline (closed), centred, height ~2 */
export function heartPoly(n = 48) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = 16 * Math.sin(a) ** 3, y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    out.push([x / 16, y / 16 + 0.1]);
  }
  return out;
}

/**
 * figurePolys(fig) -> [[ [u,v], ... ], ...] unit-ish polylines, NOT yet scaled/centred
 *   fig: { kind: "text", text } (stroke font, cap 1) | { kind: "star", points, inner, rot } | { kind: "heart" } |
 *        { kind: "polys", polys }
 */
export function figurePolys(fig) {
  if (fig.kind === "text") {
    const L = layoutStrokeText(fig.text, 1, { letterSpacing: fig.letterSpacing ?? 0.3, bendRadius: fig.bend ?? 0.09 });
    const out = [];
    for (const c of L.chars) for (const s of c.strokes) out.push(s.map((p) => [p[0], p[1]]));
    return out;
  }
  if (fig.kind === "star") return [starPoly(fig.points ?? 5, fig.inner ?? 0.45, fig.rot ?? 0)];
  if (fig.kind === "heart") return [heartPoly(fig.n ?? 48)];
  if (fig.kind === "polys") return fig.polys.map((p) => p.map((q) => [q[0], q[1]]));
  throw new Error(`anamorph: unknown figure kind ${fig.kind}`);
}

function bbox2(polys) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of polys) for (const q of p) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
  return { u0, v0, u1, v1, w: u1 - u0, h: v1 - v0 };
}

/** chunkPolyline(pts2, len, step) -> sub-polylines of ~len arc length each (resampled every `step`), sharing endpoints */
export function chunkPolyline(pts, len, step) {
  const P3 = pts.map((p) => [p[0], p[1], 0]);
  const L = pathLength(P3);
  const n = Math.max(1, Math.round(L / len));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * L, b = ((k + 1) / n) * L;
    const m = Math.max(1, Math.ceil((b - a) / step));
    const seg = [];
    for (let j = 0; j <= m; j++) { const q = pointAt(P3, a + ((b - a) * j) / m).p; seg.push([q[0], q[1]]); }
    out.push(seg);
  }
  return out;
}

// ---------------------------------------------------------------- one figure's piece plan
/**
 * planFigure(o) -> figure plan
 *   o: { id, eye [x,y,z], target [x,y,z] (look-at; with eye defines F), figure (see figurePolys),
 *        d0 (m, image-plane distance), fill (fraction of the frame on the limiting axis at the sweet spot), fov (deg),
 *        aspect = 16/9, align [ndcX, ndcY] (figure centre on screen at the sweet spot), radius (rod radius on the image
 *        plane, as a fraction of the figure's height or `radiusAbs` m), chunk (piece arc length on the image plane, m),
 *        step (resample step, m), depth [sMin, sMax], minDist (m from the eye), room { min [x,y,z], max [x,y,z] },
 *        ceiling (y the strings hang from), seed, tones (number of colour shades) }
 *   -> { id, eye, target, basis, d0, fov, pieces: [{ k, s, r, pts [[x,y,z]...], img [[x,y,z]...] (s = 1),
 *        hang [x,y,z] (top point), stringLen, tone, mid }], box (image-plane figure corners at s = 1), sweet: { pos, target, fov } }
 */
export function planFigure(o) {
  const aspect = o.aspect ?? 16 / 9;
  const eye = o.eye.slice(), target = o.target.slice();
  const basis = cameraBasis({ pos: eye, target, roll: 0 });
  const F = mul(basis.back, -1), R = basis.right, U = basis.up;
  const d0 = o.d0;
  const th = Math.tan(((o.fov ?? 40) * Math.PI) / 360);
  const halfH = d0 * th, halfW = halfH * aspect;
  // scale + centre the figure on the image plane
  const raw = figurePolys(o.figure);
  const bb = bbox2(raw);
  const fill = o.fill ?? 0.8;
  const k = Math.min((2 * halfW * fill) / bb.w, (2 * halfH * fill) / bb.h) * (o.scale ?? 1);
  const cu = (o.align?.[0] ?? 0) * halfW, cv = (o.align?.[1] ?? 0) * halfH;
  const polys = raw.map((p) => p.map((q) => [(q[0] - (bb.u0 + bb.u1) / 2) * k + cu, (q[1] - (bb.v0 + bb.v1) / 2) * k + cv]));
  const figH = bb.h * k;
  const r0 = o.radiusAbs ?? (o.radius ?? 0.06) * figH;
  const img = (u, v) => add(add(add(eye, mul(F, d0)), mul(R, u)), mul(U, v));

  // chunks -> pieces
  const chunks = [];
  for (const p of polys) for (const c of chunkPolyline(p, o.chunk ?? 0.5, o.step ?? 0.08)) chunks.push(c);
  const rand = rng(o.seed ?? 1);
  const [sMin, sMax] = o.depth ?? [0.45, 1.65];
  const n = chunks.length;
  // stratified depths: n evenly spaced quantiles, shuffled, jittered within their stratum
  const strata = rand.shuffle([...Array(n).keys()]);
  const room = o.room, minDist = o.minDist ?? 3;
  // avoid: other figure plans — a piece must not cover their strokes as seen from THEIR sweet spot
  const avoid = (o.avoid ?? []).map((f) => {
    const cam = { pos: f.sweet.pos, target: f.sweet.target, fov: f.fov, roll: 0 };
    cam._basis = cameraBasis(cam);
    const thf = Math.tan((f.fov * Math.PI) / 360);
    const pts = [];
    for (const p of f.pieces) for (const q of p.img) { const v = projectPoint(cam, q, aspect); pts.push([v[0] * aspect, v[1]]); }
    return { cam, pts, rf: f.r0 / (f.d0 * thf), th: thf };
  });
  const margin = o.avoidMargin ?? 0.03;
  function clearance(imgPts, sc, r) {
    let worst = Infinity;
    for (const A of avoid) {
      for (const P of imgPts) {
        const X = add(eye, mul(sub(P, eye), sc));
        const v = projectPoint(A.cam, X, aspect);
        if (!(v[2] > 0.2)) continue;
        const rp = r / (v[2] * A.th), x = v[0] * aspect, y = v[1];
        if (Math.abs(x) > aspect + rp || Math.abs(y) > 1 + rp) continue;
        for (const q of A.pts) {
          const d = Math.hypot(x - q[0], y - q[1]) - rp - A.rf - margin;
          if (d < worst) worst = d;
        }
      }
    }
    return worst;
  }
  const pieces = chunks.map((c, i) => {
    const imgPts = c.map((q) => img(q[0], q[1]));
    // interval of s keeping every point inside the room shrunk by the rod radius at sMax, and beyond minDist
    let lo = Math.max(sMin, minDist / d0), hi = sMax;
    const pad = r0 * sMax + (o.wallGap ?? 0.15);
    for (const P of imgPts) {
      const D = sub(P, eye);
      for (let a = 0; a < 3; a++) {
        const mn = room.min[a] + pad, mx = room.max[a] - pad;
        if (Math.abs(D[a]) < 1e-9) { if (eye[a] < mn || eye[a] > mx) { lo = 1; hi = 1; } continue; }
        let s1 = (mn - eye[a]) / D[a], s2 = (mx - eye[a]) / D[a];
        if (s1 > s2) [s1, s2] = [s2, s1];
        lo = Math.max(lo, s1); hi = Math.min(hi, s2);
      }
    }
    let s;
    if (hi <= lo) s = clamp(1, Math.min(lo, hi), Math.max(lo, hi));
    else {
      const want = lo + (hi - lo) * ((strata[i] + 0.15 + 0.7 * rand.next()) / n);
      s = want;
      if (avoid.length) {
        // candidates across [lo, hi]: keep the one nearest `want` whose projection from every other sweet spot clears
        // that figure's strokes; if none clears, the one with the most clearance
        let best = null, bestClear = null;
        for (let c = 0; c <= 24; c++) {
          const sc = c === 0 ? want : lo + ((hi - lo) * (c - 0.5)) / 24;
          const clear = clearance(imgPts, sc, r0 * sc);
          if (clear > 0 && (!best || Math.abs(sc - want) < Math.abs(best - want))) best = sc;
          if (!bestClear || clear > bestClear.clear) bestClear = { sc, clear };
        }
        s = best ?? bestClear.sc;
      }
    }
    const pts = imgPts.map((P) => add(eye, mul(sub(P, eye), s)));
    let top = pts[0];
    for (const p of pts) if (p[1] > top[1]) top = p;
    const r = r0 * s;
    const hang = [top[0], top[1] + r, top[2]];
    const mid = pts[Math.floor(pts.length / 2)];
    return { k: i, s, r, pts, img: imgPts, hang, stringLen: Math.max(0, (o.ceiling ?? room.max[1]) - hang[1]), tone: rand.int(0, (o.tones ?? 3) - 1), mid };
  });
  const corners = [];
  for (const u of [bb.u0, bb.u1]) for (const v of [bb.v0, bb.v1]) corners.push(img((u - (bb.u0 + bb.u1) / 2) * k + cu, (v - (bb.v0 + bb.v1) / 2) * k + cv));
  const sweet = { pos: eye.slice(), target: add(eye, mul(F, d0)), fov: o.fov ?? 40 };
  return { id: o.id, eye, target, basis, d0, fov: o.fov ?? 40, r0, figH, pieces, box: corners, sweet, polys };
}

// ---------------------------------------------------------------- alignment error of a camera pose
/**
 * alignmentError(fig, cam) -> RMS NDC distance between each piece point's projection and the projection of its
 *   image-plane point (s = 1) through the same camera. 0 exactly at the sweet spot; grows with parallax.
 */
export function alignmentError(fig, cam, aspect = 16 / 9) {
  const c = { ...cam, _basis: cameraBasis(cam) };
  let sum = 0, n = 0;
  for (const p of fig.pieces) {
    for (let j = 0; j < p.pts.length; j += Math.max(1, Math.floor(p.pts.length / 3))) {
      const a = projectPoint(c, p.pts[j], aspect), b = projectPoint(c, p.img[j], aspect);
      if (!(a[2] > 0) || !(b[2] > 0)) { sum += 4; n++; continue; }
      sum += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; n++;
    }
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/**
 * errorTrack(figs, keys, { duration, dt = 1/60, fov, drift }) -> { t: [...], e: { [figId]: [...] } }
 *   Replays the camera rig (kit framing.sampleCameraKeys, bit-identical to kit/camera.js) and records each figure's error.
 */
export function errorTrack(figs, keys, o = {}) {
  const dt = o.dt ?? 1 / 60, K = prepareKeys(keys, { fov: o.fov ?? 40 });
  const T = [], E = Object.fromEntries(figs.map((f) => [f.id, []]));
  for (let f = 0; f <= Math.round(o.duration / dt); f++) {
    const t = f * dt;
    const cam = sampleCameraKeys(K, t, { fov: o.fov ?? 40, drift: o.drift ?? null });
    T.push(t);
    for (const fig of figs) E[fig.id].push(alignmentError(fig, cam));
  }
  return { t: T, e: E, dt };
}

/**
 * alignEvents(track, figId, { thresholds, lockEps }) -> events from the error curve of one figure:
 *   { kind: "converge", t, level } each time the error falls through a threshold (descending order = rising notes),
 *   { kind: "lock", t } the first sample with error <= lockEps after a convergence,
 *   { kind: "tear", t, level } each time the error rises back through a threshold after a lock.
 */
export function alignEvents(track, figId, o = {}) {
  const th = (o.thresholds ?? [0.32, 0.16, 0.08, 0.04]).slice().sort((a, b) => b - a);
  const eps = o.lockEps ?? 1e-4;
  const T = track.t, E = track.e[figId], out = [];
  let locked = false;
  for (let i = 1; i < T.length; i++) {
    const a = E[i - 1], b = E[i];
    if (!locked) {
      th.forEach((x, level) => { if (a > x && b <= x) out.push({ kind: "converge", t: T[i], level, fig: figId }); });
      if (b <= eps && a > eps) { out.push({ kind: "lock", t: T[i], fig: figId }); locked = true; }
    } else {
      if (a <= eps && b > eps) out.push({ kind: "release", t: T[i - 1], fig: figId });
      th.slice().reverse().forEach((x, j) => { if (a < x && b >= x) out.push({ kind: "tear", t: T[i], level: j, fig: figId }); });
      if (b > th[0]) locked = false;
    }
  }
  return out;
}

/** lockWindows(events) -> [{ fig, on, off }] from lock / release events (off = Infinity if never released) */
export function lockWindows(events) {
  const out = [];
  for (const e of events) {
    if (e.kind === "lock") out.push({ fig: e.fig, on: e.t, off: Infinity });
    if (e.kind === "release") { const w = [...out].reverse().find((x) => x.fig === e.fig && x.off === Infinity); if (w) w.off = e.t; }
  }
  return out;
}

/**
 * swayWeight(t, windows, { fadeIn = 1.4, fadeOut = .8 }) -> 0..1: hanging pieces may sway only away from every lock
 *   window; it is EXACTLY 0 from (on - .15) to off so locked frames are perfectly aligned and still.
 */
export function swayWeight(t, windows, o = {}) {
  const fi = o.fadeIn ?? 1.4, fo = o.fadeOut ?? 0.8;
  let w = 1;
  for (const W of windows) {
    if (t >= W.on - 0.15 && t <= W.off) return 0;
    if (t < W.on - 0.15) w = Math.min(w, 1 - smoothstep(W.on - 0.15 - fi, W.on - 0.15, t));
    if (t > W.off) w = Math.min(w, smoothstep(W.off, W.off + fo, t));
  }
  return w;
}

/** voices for scoreFromEvents: rising marimba on convergence, a snap (clack + low thud + chime) on lock, falling plucks on tear */
export function alignVoices(snd) {
  return {
    converge: (e) => [{ type: "marimba", gain: snd.converge.gain, hz: snd.converge.notes[e.level % snd.converge.notes.length], decay: 0.25, dur: 0.7 }],
    lock: () => [
      { type: "clack", gain: snd.lock.clack, pitch: 0.9, dur: 0.14 },
      { type: "thud", gain: snd.lock.thud, pitch: 0.7, dur: 0.5 },
      { type: "chime", gain: snd.lock.chime, dur: 1.8, notes: 5, offset: 0.03 },
    ],
    tear: (e) => [{ type: "pluck", gain: snd.tear.gain, hz: snd.tear.notes[e.level % snd.tear.notes.length], decay: 0.6, dur: 0.9 }],
  };
}
