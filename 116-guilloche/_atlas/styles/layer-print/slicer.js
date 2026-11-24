// styles/layer-print/slicer.js — the toolpath plan for "Layer Print" (a desktop 3D printer laying a part down layer by
// layer). PURE: no THREE, no window, no DOM; imports only kit/time.js, so scene.config.js, render-sfx and export-spec run
// it in plain Node and the picture and the SCORE read the same plan.
//
//   shape  = vaseShape({...})            an original lobed, twisted pot: radius(theta, y)
//   layers = sliceShape(shape, {...})    per layer: outer perimeter, inner perimeter, then infill (floor: rectilinear
//                                        scan lines at +/-45 deg; wall: a zigzag between the two perimeters)
//   plan   = planPrint(layers, {...})    one continuous nozzle move list ("runs": travel / outer / inner / infill), each
//                                        with a start/end time taken from timing stages; plan.nozzleAt(t) is the nozzle
//                                        point, every bead vertex carries the time the nozzle passes it, plan.events()
//                                        are the stepper sounds.
// Plan coordinates: x right, z toward the camera, y up from the bed surface (metres, toy scale). A path point [x, z].
import { clamp, lerp, smoothstep } from "../../kit/time.js";

const TAU = Math.PI * 2;

/** profileAt(keys [[u, r], ...], u) -> r: smooth (cubic Hermite, finite-difference tangents) through the keys */
export function profileAt(keys, u) {
  const n = keys.length;
  if (u <= keys[0][0]) return keys[0][1];
  if (u >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && u > keys[i + 1][0]) i++;
  const [u0, r0] = keys[i], [u1, r1] = keys[i + 1];
  const slope = (a, b) => (keys[b][1] - keys[a][1]) / (keys[b][0] - keys[a][0]);
  const m0 = i > 0 ? slope(i - 1, i + 1) : slope(i, i + 1);
  const m1 = i + 2 < n ? slope(i, i + 2) : slope(i, i + 1);
  const h = u1 - u0, s = (u - u0) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * r0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * r1 + (s3 - s2) * h * m1;
}

/**
 * vaseShape({ height, lobes, lobe, twist, profile }) -> { ..., radius(theta, y), rMax }
 *   profile: [[u 0..1, radius m], ...] up the height; `lobes` soft flutes of relative depth `lobe`, twisting `twist` rad
 *   over the full height.
 */
export function vaseShape(o = {}) {
  const S = { height: 2.3, lobes: 6, lobe: 0.06, twist: 0.7, profile: [[0, 1.0], [0.42, 1.42], [0.82, 1.0], [1, 1.2]], ...o };
  const radius = (theta, y) => {
    const u = clamp(y / S.height);
    return profileAt(S.profile, u) * (1 + S.lobe * Math.cos(S.lobes * (theta - S.twist * u)));
  };
  let rMax = 0;
  for (let i = 0; i <= 60; i++) rMax = Math.max(rMax, profileAt(S.profile, i / 60) * (1 + S.lobe));
  return { ...S, radius, rMax };
}

/** scan-line fill of a closed polygon [[x, z], ...]: boustrophedon polyline, lines `pitch` apart at `angle` rad */
export function rectilinearFill(poly, pitch, angle) {
  const d = [Math.cos(angle), Math.sin(angle)], nr = [-d[1], d[0]];
  let c0 = Infinity, c1 = -Infinity;
  for (const p of poly) { const c = p[0] * nr[0] + p[1] * nr[1]; c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  const lines = Math.max(1, Math.floor((c1 - c0) / pitch));
  const start = (c0 + c1) / 2 - ((lines - 1) / 2) * pitch;
  const out = [];
  let flip = false;
  for (let li = 0; li < lines; li++) {
    const c = start + li * pitch;
    let s0 = Infinity, s1 = -Infinity;
    for (let k = 0; k < poly.length - 1; k++) {
      const a = poly[k], b = poly[k + 1];
      const ca = a[0] * nr[0] + a[1] * nr[1] - c, cb = b[0] * nr[0] + b[1] * nr[1] - c;
      if ((ca > 0) === (cb > 0)) continue;
      const f = ca / (ca - cb), x = lerp(a[0], b[0], f), z = lerp(a[1], b[1], f), s = x * d[0] + z * d[1];
      s0 = Math.min(s0, s); s1 = Math.max(s1, s);
    }
    if (!(s1 - s0 > pitch * 0.5)) continue;
    const A = [c * nr[0] + s0 * d[0], c * nr[1] + s0 * d[1]], B = [c * nr[0] + s1 * d[0], c * nr[1] + s1 * d[1]];
    if (flip) out.push(B, A); else out.push(A, B);
    flip = !flip;
  }
  return out;
}

/**
 * sliceShape(shape, { layerHeight, bead, wall, ringPts, zigs, floorLayers, seam }) -> layers
 *   layers[i] = { i, y (bead centre height), floor, paths: [{ kind: "outer"|"inner"|"infill", closed, scan, pts: [[x, z], ...] }] }
 *   Print order inside a layer is the array order: outer perimeter, inner perimeter, infill.
 */
export function sliceShape(shape, o = {}) {
  const lh = o.layerHeight ?? 0.05, bw = o.bead ?? 0.085, wall = o.wall ?? 0.34;
  const N = o.ringPts ?? 96, zigs = o.zigs ?? 36, floorLayers = o.floorLayers ?? 2, seam = o.seam ?? -Math.PI / 2;
  const n = Math.round(shape.height / lh);
  const layers = [];
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) * lh;
    const loop = (inset) => {
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const th = seam + (TAU * (k % N)) / N, r = shape.radius(th, y) - inset;
        pts.push([r * Math.cos(th), r * Math.sin(th)]);
      }
      return pts;
    };
    const floor = i < floorLayers;
    const paths = [{ kind: "outer", closed: true, pts: loop(bw / 2) }];
    if (floor) {
      paths.push({ kind: "inner", closed: true, pts: loop(bw * 1.5) });
      paths.push({ kind: "infill", closed: false, scan: true, pts: rectilinearFill(loop(bw * 2.35), bw, i % 2 ? -Math.PI / 4 : Math.PI / 4) });
    } else {
      paths.push({ kind: "inner", closed: true, pts: loop(wall - bw / 2) });
      const a = bw * 1.45, b = wall - bw * 1.45, M = 2 * zigs, pts = [];
      for (let k = 0; k <= M; k++) {
        const th = seam + (TAU * (k % M)) / M, r = shape.radius(th, y) - ((k + i) % 2 ? a : b);
        pts.push([r * Math.cos(th), r * Math.sin(th)]);
      }
      paths.push({ kind: "infill", closed: true, pts });
    }
    layers.push({ i, y, floor, paths });
  }
  return layers;
}

const dist3 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const ease = (u) => smoothstep(0, 1, u);

/**
 * planPrint(layers, opts) -> plan
 *   opts: {
 *     stages: [{ id, t0, t1, accel = 1, to: [layer, pathIndex] | null }]   consecutive timing windows; a stage owns every
 *              path before `to` (exclusive) that no earlier stage owns. Inside a stage a move lasts
 *              length / (speeds[kind] x accel^(layer - first layer of the stage)), scaled so the stage fills t0..t1:
 *              accel > 1 = each layer faster than the one before (the honest time compression).
 *     speeds:  { travel, outer, inner, infill } relative feed rates
 *     home:    [x, y, z] nozzle rest point;  approach: { t0 } when the head leaves home (arrives at stages[0].t0)
 *     park:    { dur, lift, to: [x, y, z] } after the last move
 *     slow:    layers at least this long (s) get one motor cue per path; faster ones are grouped;  group: min group length (s)
 *   }
 *   plan: { runs, beads (extruding runs), layers, n, t0, t1, tEnd, height, rMax, layerT0, layerT1,
 *           nozzleAt(t) -> { p: [x, y, z], ext, layer, kind, moving }, layerAt(t), progress(t) 0..1, events(), stats }
 *   run:  { kind, ext, layer, path, closed, pts: [[x, y, z]], cum, len, t0, t1, times (per point), stage }
 */
export function planPrint(layers, o = {}) {
  const speeds = { travel: 3, outer: 1, inner: 1.15, infill: 1.6, ...(o.speeds ?? {}) };
  const stages = o.stages;
  const stageOf = (i, j) => {
    for (let s = 0; s < stages.length; s++) {
      const to = stages[s].to;
      if (!to || i < to[0] || (i === to[0] && j < to[1])) return s;
    }
    return stages.length - 1;
  };
  // ---- the move list
  const runs = [];
  let cursor = null;
  const push = (run) => {
    const cum = [0];
    for (let k = 1; k < run.pts.length; k++) cum.push(cum[k - 1] + dist3(run.pts[k - 1], run.pts[k]));
    run.cum = cum; run.len = cum[cum.length - 1];
    if (run.len > 1e-7) runs.push(run);
  };
  for (const L of layers) {
    L.paths.forEach((P, j) => {
      if (P.pts.length < 2) return;
      const pts = P.pts.map((q) => [q[0], L.y, q[1]]);
      const stage = stageOf(L.i, j);
      if (cursor) push({ kind: "travel", ext: false, layer: L.i, path: j, closed: false, pts: [cursor, pts[0]], stage });
      push({ kind: P.kind, ext: true, layer: L.i, path: j, closed: !!P.closed, scan: !!P.scan, pts, stage });
      cursor = pts[pts.length - 1];
    });
  }
  // ---- timing: per stage, durations proportional to length / speed
  stages.forEach((S, s) => {
    const mine = runs.filter((r) => r.stage === s);
    if (!mine.length) return;
    const first = mine[0].layer, accel = S.accel ?? 1;
    let sum = 0;
    for (const r of mine) { r.w = r.len / (speeds[r.kind] * Math.pow(accel, r.layer - first)); sum += r.w; }
    let t = S.t0;
    for (const r of mine) {
      const d = (r.w / sum) * (S.t1 - S.t0);
      r.t0 = t; r.t1 = t + d; t += d;
      r.times = r.cum.map((c) => r.t0 + (c / r.len) * d);
    }
  });
  const n = layers.length;
  const T0 = runs[0].t0, T1 = runs[runs.length - 1].t1;
  const beads = runs.filter((r) => r.ext);
  const layerT0 = new Array(n).fill(Infinity), layerT1 = new Array(n).fill(-Infinity);
  for (const r of beads) { layerT0[r.layer] = Math.min(layerT0[r.layer], r.t0); layerT1[r.layer] = Math.max(layerT1[r.layer], r.t1); }
  const startT = runs.map((r) => r.t0);
  const first = runs[0].pts[0], last = runs[runs.length - 1].pts[runs[runs.length - 1].pts.length - 1];
  const home = o.home ?? [first[0], first[1] + 1, first[2]];
  const tA = o.approach?.t0 ?? T0 - 0.5;
  const PK = { dur: 1, lift: 0.5, to: home, ...(o.park ?? {}) };
  const lifted = [last[0], last[1] + PK.lift, last[2]];

  /** nozzleAt(t) -> where the nozzle is (bead centre height), and what it is doing */
  function nozzleAt(t) {
    if (t <= T0) {
      const u = ease(clamp((t - tA) / Math.max(1e-6, T0 - tA)));
      return { p: mix3(home, first, u), ext: false, layer: 0, kind: "approach", moving: t > tA };
    }
    if (t >= T1) {
      const u = clamp((t - T1) / PK.dur), u1 = ease(clamp(u / 0.35)), u2 = ease(clamp((u - 0.25) / 0.75));
      return { p: mix3(mix3(last, lifted, u1), PK.to, u2), ext: false, layer: n - 1, kind: "park", moving: u < 1 };
    }
    let lo = 0, hi = runs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (startT[m] <= t) lo = m; else hi = m - 1; }
    const r = runs[lo];
    if (t >= r.t1) return { p: r.pts[r.pts.length - 1].slice(), ext: false, layer: r.layer, kind: "pause", moving: false };
    const s = ((t - r.t0) / (r.t1 - r.t0)) * r.len;
    let a = 0, b = r.cum.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (r.cum[m] <= s) a = m; else b = m; }
    const f = (s - r.cum[a]) / Math.max(1e-9, r.cum[b] - r.cum[a]);
    return { p: mix3(r.pts[a], r.pts[b], f), ext: r.ext, layer: r.layer, kind: r.kind, moving: true };
  }
  /** layerAt(t) -> index of the layer being printed (0 before the start, n - 1 after the end) */
  function layerAt(t) {
    let i = 0;
    while (i < n - 1 && layerT0[i + 1] <= t) i++;
    return i;
  }
  /** progress(t) -> 0..1 share of layers done (fractional inside the current layer) */
  function progress(t) {
    if (t <= T0) return 0;
    if (t >= T1) return 1;
    const i = layerAt(t);
    return (i + clamp((t - layerT0[i]) / Math.max(1e-6, layerT1[i] - layerT0[i]))) / n;
  }

  /** events(): the stepper sounds, from the same runs the picture reads */
  function events() {
    const ev = [], slow = o.slow ?? 0.45, minGroup = o.group ?? 0.4;
    ev.push({ kind: "home", t: tA, dur: Math.max(0.15, T0 - tA) });
    let g = null;
    const flush = () => { if (g) { ev.push({ kind: "run", mode: "fast", t: g.t0, dur: g.t1 - g.t0, speed: g.v0, speed2: g.v1, layers: g.n }); g = null; } };
    for (let i = 0; i < n; i++) {
      const mine = beads.filter((r) => r.layer === i);
      if (!mine.length) continue;
      const dur = layerT1[i] - layerT0[i], len = mine.reduce((a, r) => a + r.len, 0);
      const fast = dur < slow;
      if (i > 0) ev.push({ kind: "layer", t: layerT0[i], i, fast, u: i / (n - 1) });
      if (!fast) {
        flush();
        for (const r of mine) {
          const d = r.t1 - r.t0;
          if (r.scan && d >= 0.8) {
            for (let k = 0; k + 1 < r.pts.length; k += 2) ev.push({ kind: "zig", t: r.times[k], dur: Math.max(0.05, r.times[Math.min(k + 2, r.pts.length - 1)] - r.times[k]), dir: (k / 2) % 2, u: k / r.pts.length });
          } else ev.push({ kind: "run", mode: r.kind, t: r.t0, dur: d, speed: r.len / d, speed2: r.len / d, layers: 1 });
        }
      } else {
        const v = len / dur;
        if (!g) g = { t0: layerT0[i], t1: layerT1[i], v0: v, v1: v, n: 1 };
        else { g.t1 = layerT1[i]; g.v1 = v; g.n++; }
        if (g.t1 - g.t0 >= minGroup) flush();
      }
    }
    flush();
    ev.push({ kind: "park", t: T1, dur: PK.dur });
    ev.push({ kind: "done", t: T1 + PK.dur * 0.85 });
    return ev.map((e) => ({ ...e, t: +e.t.toFixed(4) })).sort((a, b) => a.t - b.t);
  }

  const top = layers[n - 1].y;
  let rMax = 0;
  for (const r of beads) if (r.kind === "outer") for (const p of r.pts) rMax = Math.max(rMax, Math.hypot(p[0], p[2]));
  return {
    runs, beads, layers, n, t0: T0, t1: T1, tA, tEnd: T1 + PK.dur, height: top + (top - layers[n - 2].y) / 2, rMax, home, park: PK,
    layerT0, layerT1, nozzleAt, layerAt, progress, events,
    stats: {
      layers: n, moves: runs.length, beads: beads.length, points: beads.reduce((a, r) => a + r.pts.length, 0),
      metres: +beads.reduce((a, r) => a + r.len, 0).toFixed(1),
      layerSeconds: [0, 1, 2, Math.floor(n / 2), n - 1].map((i) => [i, +(layerT1[i] - layerT0[i]).toFixed(3)]),
    },
  };
}

/** printVoices(spec.sound) -> voices for kit scoreFromEvents: stepper servo/whir per move, a tick per layer change */
export function printVoices(SND) {
  const hzOf = (v) => SND.motor.hzLo * Math.pow(2, clamp(Math.log2(Math.max(1e-6, v) / SND.motor.refSpeed) / SND.motor.octSpan) * SND.motor.octaves);
  const pan = (e) => clamp(Math.sin(e.t * 2.3) * 0.35, -0.5, 0.5);
  return {
    home: (e) => [{ type: "servo", dur: e.dur, hz: 150, hz2: 80, grit: 0.2, gain: SND.home.gain }],
    run: (e) => {
      const fast = e.mode === "fast", infill = e.mode === "infill";
      const hz = hzOf(e.speed) * (e.mode === "inner" ? 1.12 : infill ? 1.26 : 1);
      return [{ type: infill ? "servo" : "whir", dur: Math.max(0.08, e.dur * 0.98), hz, hz2: fast ? hzOf(e.speed2) * 1.06 : hz * 1.05, grit: infill ? 0.4 : 0.15, gain: fast ? SND.fast.gain : SND.run.gain, pan: pan(e) }];
    },
    zig: (e) => [{ type: "servo", dur: Math.max(0.05, e.dur * 0.92), hz: e.dir ? SND.zig.hzA : SND.zig.hzB, hz2: e.dir ? SND.zig.hzB : SND.zig.hzA, grit: 0.35, gain: SND.zig.gain, pan: e.dir ? 0.3 : -0.3 }],
    layer: (e) => [{ type: "tick", dur: 0.03, pitch: lerp(SND.tick.pitchLo, SND.tick.pitchHi, e.u), gain: e.fast ? SND.tick.fast : SND.tick.gain }],
    park: (e) => [{ type: "servo", dur: e.dur, hz: 170, hz2: 70, grit: 0.2, gain: SND.home.gain }],
    done: () => [{ type: "chime", dur: 1.6, notes: 4, gain: SND.done.gain }],
  };
}
