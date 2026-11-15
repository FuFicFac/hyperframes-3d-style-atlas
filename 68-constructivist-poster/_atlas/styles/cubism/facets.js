// styles/cubism/facets.js — the Cubism planner. Pure functions: no THREE, no window, no DOM. Imported by style.js
// (the picture) AND by scene.config.js (SCORE), so every crack tick, view swing, paper flip and closing strum in the
// sound comes from the same schedule the facets read.
//
// What it plans:
//   1. partition(): the picture plane (a 16:9 rectangle, plane metres, centred on 0) cut into convex angular facets by
//      seeded straight cuts — about half of them aimed through a focus point, so shards radiate from the subject.
//   2. viewKeys(): one camera per viewpoint of the still life (front three-quarter, bird's-eye table top, left, right,
//      eye level, tilted), each framed with kit fitShot so the still life fills its picture.
//   3. createPlan(): per facet — which viewpoint it shows, when its contour cracks in, when its camera swings from the
//      common view to its own, how it slides / rotates / overlaps, whether and when it flips over to a collage back
//      (paper, wood grain, newsprint with stencilled letters, charcoal drawing, wallpaper), and where it rests in the
//      resolved composition. Plus a few collage cut-outs that slide in from outside, the global palette state
//      (analytic -> synthetic -> bold), and events() for SCORE.
// Every pose is closed-form in t (eased windows of precomputed numbers); nothing accumulates.
import { rng, clamp, lerp, smoothstep, ease } from "../../kit/time.js";
import { fitShot } from "../../kit/framing.js";

// ------------------------------------------------------------------ polygon helpers (2D, convex)
export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}
export function polyCentroid(p) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  a /= 2;
  return Math.abs(a) < 1e-12 ? p[0].slice() : [cx / (6 * a), cy / (6 * a)];
}
/** clip a convex polygon by the half-plane n.p + c >= 0 */
function clipHalf(p, n, c) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const da = n[0] * a[0] + n[1] * a[1] + c, db = n[0] * b[0] + n[1] * b[1] + c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  }
  return out;
}
/** inward edge lines of a CCW convex polygon, relative to `origin`: [nx, ny, c] with n.p + c = distance inside (m) */
export function edgeLines(p, origin = [0, 0]) {
  const L = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const n = [-dy / len, dx / len]; // left normal = inward for CCW
    L.push([n[0], n[1], -(n[0] * (a[0] - origin[0]) + n[1] * (a[1] - origin[1]))]);
  }
  return L;
}

/**
 * partition({ w, h, count, seed, focus:[x,y], aimShare, minShare, maxVerts }) -> [[ [x,y], ... ] CCW polygons]
 * Repeatedly cuts the largest piece with a straight line (through its centroid, or aimed at the focus point) until
 * there are `count` pieces; a cut is retried when a piece would be smaller than minShare of the frame or exceed maxVerts.
 */
export function partition(o) {
  const { w, h, count = 14, seed = 7, focus = [0, 0], aimShare = 0.5, minShare = 0.035, maxVerts = 9 } = o;
  const r = rng(seed);
  const total = w * h;
  let polys = [[[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]];
  let guard = 0;
  while (polys.length < count && guard++ < 400) {
    polys.sort((a, b) => polyArea(b) - polyArea(a));
    const p = polys[0], c = polyCentroid(p);
    let done = false;
    for (let tries = 0; tries < 16 && !done; tries++) {
      let ang;
      const through = [c[0] + r.gaussian(0, 0.06), c[1] + r.gaussian(0, 0.05)];
      if (r.chance(aimShare)) ang = Math.atan2(focus[1] - through[1], focus[0] - through[0]) + r.gaussian(0, 0.12);
      else ang = r.range(0.25, Math.PI - 0.25) * (r.chance(0.5) ? 1 : -1);
      const n = [-Math.sin(ang), Math.cos(ang)], cc = -(n[0] * through[0] + n[1] * through[1]);
      const A = clipHalf(p, n, cc), B = clipHalf(p, [-n[0], -n[1]], -cc);
      if (A.length < 3 || B.length < 3) continue;
      if (Math.abs(polyArea(A)) < minShare * total || Math.abs(polyArea(B)) < minShare * total) continue;
      if (A.length > maxVerts || B.length > maxVerts) continue;
      polys = [A, B, ...polys.slice(1)];
      done = true;
    }
    if (!done) break;
  }
  // CCW, stable order: by centroid angle around the focus, then distance
  polys = polys.map((p) => (polyArea(p) < 0 ? p.slice().reverse() : p));
  polys.sort((a, b) => {
    const ca = polyCentroid(a), cb = polyCentroid(b);
    return Math.atan2(ca[1] - focus[1], ca[0] - focus[0]) - Math.atan2(cb[1] - focus[1], cb[0] - focus[0]);
  });
  return polys;
}

/**
 * viewKeys(subject, views, { fov, fovRT, aspect }) -> per view { k, pos, target, fov, roll }
 * Each view frames the still life with kit fitShot at its own bearing; `fovRT` (wider, for the picture's overscan) is the
 * fov the render-target camera actually uses, so the visible frame is exactly the fitShot frame.
 */
export function viewKeys(subject, views, o = {}) {
  const fov = o.fov ?? 34, aspect = o.aspect ?? 16 / 9;
  return views.map((v, k) => {
    const s = fitShot(subject, { azimuth: v.az, elevation: v.el, roll: v.roll ?? 0, fov, aspect, fill: v.fill ?? 1, align: v.align ?? [0, 0], window: v.window });
    return { k, id: v.id, pos: s.pos, target: s.target, fov: o.fovRT ?? fov, roll: v.roll ?? 0 };
  });
}

/**
 * createPlan(o) -> plan
 *  o: { frame: { w, h }, facets: { count, seed, focus, aimShare, minShare, keepMain }, views: [...] (count only matters),
 *       beats: { still, break, views, collage, resolve } ({ t, dur }), motion: {...}, collage: {...}, extras: [...] }
 */
export function createPlan(o) {
  const F = o.frame, M = o.motion, C = o.collage, B = o.beats;
  const r = rng((o.facets.seed ?? 7) * 31 + 5);
  const polys = partition({ w: F.w, h: F.h, ...o.facets });
  const V = o.views.length;
  const focus = o.facets.focus ?? [0, 0];
  const maxD = Math.hypot(F.w / 2, F.h / 2);

  // ---- views: view 0 is the common front view; 1..V-1 swing out one after another during the break
  const views = o.views.map((v, k) => ({
    k, id: v.id,
    swingAt: k === 0 ? Infinity : B.break.t + M.swing.start + (k - 1) * M.swing.step,
    swingDur: M.swing.dur,
  }));

  // ---- facets
  const keepMain = o.facets.keepMain ?? 2;
  const areas = polys.map((p) => polyArea(p));
  const mainIdx = new Set(areas.map((a, i) => [a, i]).sort((a, b) => b[0] - a[0]).slice(0, keepMain).map((x) => x[1]));
  let vc = 0;
  const facets = polys.map((pts, i) => {
    const c = polyCentroid(pts);
    const view = mainIdx.has(i) ? 0 : 1 + (vc++ % (V - 1));
    const rf = r.fork(100 + i);
    const dist = Math.hypot(c[0] - focus[0], c[1] - focus[1]);
    const away = dist > 1e-6 ? [(c[0] - focus[0]) / dist, (c[1] - focus[1]) / dist] : [1, 0];
    const side = [-away[1], away[0]];
    const sv = views[view];
    const at1 = view === 0 ? B.break.t + M.swing.start + rf.range(0.2, 0.9) : sv.swingAt + 0.12;
    const s1 = rf.range(M.slide1[0], M.slide1[1]), s2 = rf.range(M.slide2[0], M.slide2[1]);
    const lat1 = rf.gaussian(0, M.lateral), lat2 = rf.gaussian(0, M.lateral);
    const d1 = [away[0] * s1 + side[0] * lat1, away[1] * s1 + side[1] * lat1];
    const d2 = [away[0] * s2 + side[0] * lat2, away[1] * s2 + side[1] * lat2];
    const r1 = rf.gaussian(0, M.rot1), r2 = rf.gaussian(0, M.rot2);
    const keep = rf.range(M.finalKeep[0], M.finalKeep[1]);
    const shadeAng = rf.range(0, Math.PI * 2);
    return {
      i, pts, c, area: areas[i], view, dist,
      // edges relative to the centroid (the mesh is built centred on c)
      edges: edgeLines(pts, c),
      radius: Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))),
      crackAt: B.break.t + M.crack.start + M.crack.spread * (dist / maxD),
      at1, at2: B.views.t + M.slide2At[0] + rf.range(0, M.slide2At[1]),
      atF: B.resolve.t + rf.range(0, M.resolveSpread),
      d1, d2, r1, r2, keep,
      z: 0.004 + rf.range(0, 1) * M.zRange,
      scale2: rf.range(M.overlap[0], M.overlap[1]),
      shadeDir: [Math.cos(shadeAng), Math.sin(shadeAng)],
      tint: rf.int(0, (C.tints ?? 3) - 1),
      synth: rf.int(0, (C.synthSets ?? 3) - 1),
      flip: null,
    };
  });
  // flips: the facets chosen to turn over to a collage back, in crack order (outer pieces later)
  const order = facets.slice().sort((a, b) => a.crackAt - b.crackAt || a.i - b.i);
  const flippers = order.filter((f, j) => j % 2 === 1 && f.view !== 0).slice(0, C.flips);
  flippers.forEach((f, j) => {
    const ang = r.range(0, Math.PI);
    f.flip = { at: B.collage.t + C.flipStart + j * C.flipStep, dur: C.flipDur, axis: [Math.cos(ang), Math.sin(ang)], kind: C.kinds[j % C.kinds.length] };
  });

  // ---- collage cut-outs that slide in from outside the frame
  const extras = (o.extras ?? []).map((e, j) => {
    const c = polyCentroid(e.pts);
    const pts = polyArea(e.pts) < 0 ? e.pts.slice().reverse() : e.pts;
    return {
      j, id: e.id, kind: e.kind, pts, c, edges: edgeLines(pts, c),
      from: e.from, enterAt: B.collage.t + C.extraStart + j * C.extraStep, dur: C.extraDur,
      rot: e.rot ?? 0, z: 0.11 + 0.004 * j,
      settle: e.settle ?? [0, 0],
    };
  });

  // ---- poses (offsets from the rest centroid, plane metres)
  const W1 = (t, f) => ease.outCubic(clamp((t - f.at1) / M.slide1Dur));
  const W2 = (t, f) => ease.inOutCubic(clamp((t - f.at2) / M.slide2Dur));
  const WF = (t, f) => ease.inOutCubic(clamp((t - f.atF) / M.resolveDur));
  function facetPose(i, t) {
    const f = facets[i];
    const w1 = W1(t, f), w2 = W2(t, f), wf = WF(t, f);
    let x = f.d1[0] * w1 + f.d2[0] * w2, y = f.d1[1] * w1 + f.d2[1] * w2;
    let rz = f.r1 * w1 + f.r2 * w2;
    // resolve: pull back toward rest by `keep` (a tidy, still-overlapping composition) and square up the rotation
    x = lerp(x, x * f.keep, wf); y = lerp(y, y * f.keep, wf); rz = lerp(rz, rz * 0.35, wf);
    const z = f.z * Math.max(w1, w2) + M.reliefZ * f.z / M.zRange * wf;
    const s = 1 + (f.scale2 - 1) * Math.max(w1 * 0.5, w2);
    let flip = 0;
    if (f.flip) flip = Math.PI * ease.inOutCubic(clamp((t - f.flip.at) / f.flip.dur));
    const lift = f.flip ? 0.06 * Math.sin(flip) : 0;
    return { x, y, z: z + lift, rz, s, flip };
  }
  function extraPose(j, t) {
    const e = extras[j];
    const u = ease.outCubic(clamp((t - e.enterAt) / e.dur));
    const wf = ease.inOutCubic(clamp((t - B.resolve.t - 0.2) / M.resolveDur));
    const x = lerp(e.from[0], 0, u) + e.settle[0] * wf, y = lerp(e.from[1], 0, u) + e.settle[1] * wf;
    return { x, y, z: e.z, rz: e.rot * (1 - u) * 0.6, s: 1, visible: t >= e.enterAt - 1e-6 };
  }
  /** global look state */
  function stateAt(t) {
    const analytic = smoothstep(B.break.t + M.palette.analytic[0], B.break.t + M.palette.analytic[1], t);
    const synth = smoothstep(B.collage.t + M.palette.synth[0], B.collage.t + M.palette.synth[1], t);
    const bold = smoothstep(B.resolve.t + M.palette.bold[0], B.resolve.t + M.palette.bold[1], t);
    const push = ease.inOutSine(clamp((t - B.resolve.t) / (B.resolve.dur)));
    return { analytic, synth, bold, push };
  }
  /** contour level for facet i (0 before its crack) */
  const lineAt = (i, t) => smoothstep(facets[i].crackAt, facets[i].crackAt + M.crack.dur, t);
  /** view swing progress 0..1 for view k */
  const swingAt = (k, t) => (k === 0 ? 0 : ease.inOutCubic(clamp((t - views[k].swingAt) / views[k].swingDur)));

  function events() {
    const ev = [];
    ev.push({ kind: "strum", t: o.strumAt ?? 0.1, chord: "open" });
    ev.push({ kind: "crack", t: B.break.t + M.crack.start - 0.02 });
    facets.forEach((f) => ev.push({ kind: "tick", t: f.crackAt, i: f.i, x: f.c[0] / (F.w / 2) }));
    views.forEach((v) => { if (v.k > 0) ev.push({ kind: "swing", t: v.swingAt, dur: v.swingDur, k: v.k }); });
    facets.forEach((f) => { if (f.i % 2 === 0) ev.push({ kind: "slide", t: f.at2, i: f.i, x: f.c[0] / (F.w / 2) }); });
    facets.forEach((f) => { if (f.flip) ev.push({ kind: "flip", t: f.flip.at + f.flip.dur * 0.45, i: f.i, x: f.c[0] / (F.w / 2), kind2: f.flip.kind }); });
    extras.forEach((e) => ev.push({ kind: "paste", t: e.enterAt + e.dur * 0.7, j: e.j, x: e.from[0] > 0 ? 0.5 : -0.5 }));
    ev.push({ kind: "resolve", t: B.resolve.t + o.motion.resolveSpread + M.resolveDur * 0.8 });
    return ev.sort((a, b) => a.t - b.t);
  }

  return { frame: F, facets, extras, views, facetPose, extraPose, stateAt, lineAt, swingAt, events };
}

/** voices for kit scoreFromEvents, from spec.sound. Pitches: G major-ish, open strings of a guitar. */
export function cubismVoices(SND) {
  const G = 98; // G2
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const hzOf = (st) => G * 2 * Math.pow(2, st / 12);
  return {
    strum: () => [{ type: "pluck", hz: G * 2, notes: [0, 7, 12, 16, 19, 24], step: 0.045, dur: 2.6, decay: 2.2, bright: 0.55, gain: SND.strum }],
    crack: () => [
      { type: "thud", dur: 0.5, pitch: 0.8, gain: SND.crack.thud },
      { type: "clack", dur: 0.14, pitch: 0.7, gain: SND.crack.clack },
    ],
    tick: (e) => [{ type: "tick", pitch: 1.1 + 0.25 * ((e.i * 7) % 5) / 5, gain: SND.tick, pan: clamp(e.x * 0.6, -0.7, 0.7) }],
    swing: (e) => [
      { type: "whoosh", dir: "in", dur: e.dur * 0.9, q: 1.2, pitch: 0.8 + 0.08 * e.k, gain: SND.swing.whoosh, pan: ((e.k % 2) ? -0.35 : 0.35) },
      { type: "pluck", hz: hzOf(scale[(e.k * 2) % scale.length]), dur: 1.4, decay: 1.2, bright: 0.5, gain: SND.swing.pluck, offset: e.dur * 0.85 },
    ],
    slide: (e) => [{ type: "rustle", dur: 0.5, density: 0.3, pitch: 1.1, gain: SND.slide, pan: clamp(e.x * 0.6, -0.7, 0.7) }],
    flip: (e) => [
      { type: "paper", dur: 0.42, fold: true, density: 0.4, gain: SND.flip.paper, pan: clamp(e.x * 0.6, -0.7, 0.7) },
      { type: "marimba", hz: hzOf(scale[(e.i * 3) % scale.length]) * 2, dur: 0.8, decay: 0.22, gain: SND.flip.marimba, offset: 0.06 },
    ],
    paste: (e) => [
      { type: "paper", dur: 0.35, density: 0.5, gain: SND.paste.paper, pan: e.x },
      { type: "thud", dur: 0.25, pitch: 1.6, gain: SND.paste.thud, offset: 0.05 },
    ],
    resolve: () => [
      { type: "pluck", hz: G * 2, notes: [0, 4, 7, 12, 16, 19], step: 0.06, dur: 3.2, decay: 2.8, bright: 0.6, gain: SND.resolve.strum },
      { type: "chime", dur: 2.4, pitch: 0.9, gain: SND.resolve.chime, offset: 0.25 },
    ],
  };
}

/** the bed: one pad per beat (warm -> umber -> bright -> full), overlapping so it never drops out */
export function bedScore(beats, SND, end) {
  const out = [];
  const list = [beats.still, beats.break, beats.views, beats.collage, beats.resolve];
  list.forEach((b, i) => {
    const P = SND.bed[i];
    const last = i === list.length - 1;
    out.push({ t: b.t, type: "pad", root: P.root, chord: P.chord, dur: last ? end - b.t : b.dur + 0.6, attack: i ? 0.5 : 0.25, release: last ? 1.4 : 0.8, brightness: P.brightness, gain: P.gain, seed: 401 + i * 13 });
  });
  return out;
}
