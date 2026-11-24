// framing.js — camera framing maths without THREE (pure, Node-safe; pass 6). Generalised from the local copies in
// styles/chalkboard/chalk.js (boardShot / sampleCameraKeys / framingReport), styles/card-table/dealer.js (tableShot /
// sampleKeys / framingReport) and the subway-map / circuit-board planners — those keep their own copies.
//
// Why: "the label clipped at the top of frame mid-move" shipped more than once. Shots should be computed, and the build
// should REPLAY the camera exactly as kit/camera.js will play it (eases, arc paths, roll, drift and orbit) and prove that
// every region that must be seen stays inside the safe area at every sample — mid-move included — before rendering.
//
//   import { sampleCameraKeys, projectPoint, framingReport, boxCorners } from "./_atlas/kit/framing.js";
//   const rep = framingReport([{ id: "title", pts: boxCorners([-2, 1.6, 0], [2, 2.2, 0]), from: 1.2, to: 6 }], CAMERA,
//                             { duration: DURATION, drift: STYLE_SPEC.camera.drift, fov: STYLE_SPEC.camera.fov });
//   if (!rep.ok) console.table(rep.spans);
import { toEase, clamp } from "./time.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const k = 1 / (Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1); return [a[0] * k, a[1] * k, a[2] * k]; }; // as Vector3.normalize
const arr = (v, d) => (v == null ? d.slice() : v.isVector3 ? [v.x, v.y, v.z] : [v[0], v[1], v[2]]);
// Vector3.lerp: x += (b - x) * u (same operation order as three, so the numbers are bit-identical)
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

/**
 * prepareKeys(keys, { fov = 35 }) -> keys normalised exactly as createCameraRig does (sorted by t, defaults filled:
 *   target [0,0,0], fov = opts.fov — the rig uses camera.fov, i.e. the style's spec.camera.fov —, roll 0,
 *   ease "inOutCubic", path "linear", viewHeight null). sampleCameraKeys calls it; reuse the result in hot loops.
 */
export function prepareKeys(keys, { fov = 35 } = {}) {
  if (keys?.prepared) return keys;
  const K = keys.map((k) => ({
    t: k.t, pos: arr(k.pos), target: arr(k.target, [0, 0, 0]), fov: k.fov ?? fov, roll: k.roll ?? 0,
    ease: k.ease ?? "inOutCubic", path: k.path ?? "linear", viewHeight: k.viewHeight ?? null,
  }));
  K.sort((a, b) => a.t - b.t);
  K.prepared = true;
  return K;
}

/**
 * sampleCameraKeys(keys, t, { drift = null, fov = 35 }) -> { pos, target, fov, roll, viewHeight }
 *   The camera pose kit/camera.js createCameraRig(camera, keys, { drift }).sample(t) produces — same eases, "arc" paths,
 *   roll, viewHeight, drift sway and drift orbit, same floating-point operations (scripts/test-kit.mjs checks it is
 *   bit-identical to the rig at thousands of times). Pass the fov the rig's camera has (spec.camera.fov) for keys
 *   that omit fov. Arrays out ([x, y, z]), no THREE.
 */
export function sampleCameraKeys(keys, t, { drift = null, fov = 35 } = {}) {
  const K = prepareKeys(keys, { fov });
  let a = K[0], b = K[0], u = 0;
  if (t >= K[K.length - 1].t) a = b = K[K.length - 1];
  else if (t > K[0].t) {
    for (let i = 0; i < K.length - 1; i++) {
      if (t >= K[i].t && t < K[i + 1].t) { a = K[i]; b = K[i + 1]; u = toEase(b.ease)(clamp((t - a.t) / (b.t - a.t))); break; }
    }
  }
  const target = lerp3(a.target, b.target, u);
  let pos;
  if (b.path === "arc" && a !== b) {
    const oa = sub(a.pos, a.target), ob = sub(b.pos, b.target);
    const ra = Math.hypot(oa[0], oa[2]), rb = Math.hypot(ob[0], ob[2]);
    const aa = Math.atan2(oa[0], oa[2]);
    let da = Math.atan2(ob[0], ob[2]) - aa;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const az = aa + da * u, r = ra + (rb - ra) * u;
    pos = [target[0] + Math.sin(az) * r, target[1] + oa[1] + (ob[1] - oa[1]) * u, target[2] + Math.cos(az) * r];
  } else pos = lerp3(a.pos, b.pos, u);
  const viewHeight = a.viewHeight != null && b.viewHeight != null ? a.viewHeight + (b.viewHeight - a.viewHeight) * u : b.viewHeight ?? a.viewHeight;
  const f = a.fov + (b.fov - a.fov) * u;
  const roll = a.roll + (b.roll - a.roll) * u;
  if (drift) {
    const { amp = 0.15, speed = 0.25, orbit = 0 } = drift;
    if (orbit) {
      // Vector3.applyAxisAngle((0,1,0), orbit * t) = applyQuaternion(setFromAxisAngle(...)), written out term for term
      const off = sub(pos, target), half = (orbit * t) / 2, s = Math.sin(half);
      const qx = 0 * s, qy = 1 * s, qz = 0 * s, qw = Math.cos(half);
      const [vx, vy, vz] = off;
      const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
      const o2 = [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
      pos = [target[0] + o2[0], target[1] + o2[1], target[2] + o2[2]];
    }
    pos[0] += Math.sin(t * speed * 2.1) * amp;
    pos[1] += Math.sin(t * speed * 1.3 + 1.7) * amp * 0.5;
    pos[2] += Math.cos(t * speed * 1.7 + 0.4) * amp * 0.6;
  }
  return { pos, target, fov: f, roll, viewHeight };
}

/**
 * cameraBasis(cam) -> { right, up, back } — the camera's world axes, built the way three's Object3D.lookAt (camera
 *   variant, up = +Y, including its tiny nudge when looking straight up/down) + rotateZ(roll) build them (three then
 *   goes through a quaternion, so expect agreement to ~1e-12, not bit identity).
 *   The camera looks along -back.
 */
export function cameraBasis(cam) {
  const UP = [0, 1, 0];
  let z = sub(cam.pos, cam.target);
  if (z[0] === 0 && z[1] === 0 && z[2] === 0) z = [0, 0, 1];
  z = norm(z);
  let x = cross(UP, z);
  if (x[0] * x[0] + x[1] * x[1] + x[2] * x[2] === 0) { z = norm([z[0], z[1], z[2] + 0.0001]); x = cross(UP, z); }
  x = norm(x);
  let y = cross(z, x);
  const r = cam.roll ?? 0;
  if (r) {
    const c = Math.cos(r), s = Math.sin(r);
    const xr = [x[0] * c + y[0] * s, x[1] * c + y[1] * s, x[2] * c + y[2] * s];
    y = [y[0] * c - x[0] * s, y[1] * c - x[1] * s, y[2] * c - x[2] * s];
    x = xr;
  }
  return { right: x, up: y, back: z };
}

/**
 * projectPoint(cam, p, { aspect = 16/9, ortho = false } | aspect) -> [ndcX, ndcY, depth]
 *   cam = { pos, target, fov (deg), roll?, viewHeight? } (a sampleCameraKeys result). NDC as three's Vector3.project:
 *   -1..1, y up. depth = distance in front of the camera along the view axis (<= 0 = behind: NDC is meaningless then).
 *   ortho: an orthographic camera framed like the rig does (viewHeight, else 2·distance·tan(fov/2)).
 *   [x, y] destructuring works like the chalkboard / card-table copies.
 */
export function projectPoint(cam, p, opts = {}) {
  const o = typeof opts === "number" ? { aspect: opts } : opts;
  const aspect = o.aspect ?? 16 / 9;
  const B = cam._basis ?? cameraBasis(cam);
  const v = sub(p, cam.pos), depth = -dot(v, B.back);
  const vx = dot(v, B.right), vy = dot(v, B.up);
  if (o.ortho) {
    const vh = cam.viewHeight ?? 2 * Math.hypot(...sub(cam.pos, cam.target)) * Math.tan(((cam.fov ?? 35) * Math.PI) / 360);
    return [vx / ((vh / 2) * aspect), vy / (vh / 2), depth];
  }
  const th = Math.tan(((cam.fov ?? 35) * Math.PI) / 360);
  return [vx / depth / (th * aspect), vy / depth / th, depth];
}

/** boxCorners(min [x,y,z], max [x,y,z]) -> the 8 corners (a flat box with min[i] === max[i] gives duplicates; fine). */
export function boxCorners(min, max) {
  const out = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** screenExtent(cam, pts, opts) -> { m: max |NDC|, x: [min, max], y: [min, max], behind: bool } of points through cam. */
export function screenExtent(cam, pts, opts = {}) {
  const c = { ...cam, _basis: cam._basis ?? cameraBasis(cam) };
  let m = 0, behind = false;
  const xs = [Infinity, -Infinity], ys = [Infinity, -Infinity];
  for (const p of pts) {
    const [x, y, d] = projectPoint(c, p, opts);
    if (!(d > 0) && !opts.ortho) { behind = true; continue; }
    m = Math.max(m, Math.abs(x), Math.abs(y));
    xs[0] = Math.min(xs[0], x); xs[1] = Math.max(xs[1], x); ys[0] = Math.min(ys[0], y); ys[1] = Math.max(ys[1], y);
  }
  return { m: behind ? Infinity : m, x: xs, y: ys, behind };
}

/**
 * framingReport(regions, keys, opts) -> { ok, worst: { t, id, ndc }, fails: [{ t, id, ndc, behind, reason, over }], spans: [{ id, from, to, worst, reasons }], samples }
 *   Replays the camera (sampleCameraKeys) every `dt` s over [t0, duration] and lists every moment a REQUIRED region
 *   leaves the safe area, plus `spans` = those moments merged per region into time ranges (what to fix).
 *   regions: [{ id, pts: [[x,y,z], ...] | box: [min, max], from = -Inf, to = +Inf, required = true, window?, keepOut? }]
 *            (required while from <= t <= to), or a function (t) -> [{ id, pts | box }] (everything it returns is
 *            required at t). pts may also be a function (t) -> points, for moving regions.
 *   opts: { duration (s; default = last key t), t0 = 0, dt = 1/30, drift, fov = 35 (keys without fov), aspect = 16/9,
 *           ortho = false, safe = 0.9 (|NDC| limit: 0.9 = nothing in the outer 5 % of the frame),
 *           window, keepOut }                                                                    (window/keepOut: pass 7)
 *   window: { x0, x1, y0, y1 } in NDC (y up) — an ASYMMETRIC safe window, e.g. { x0: -.9, x1: .9, y0: -.62, y1: .9 }
 *           keeps the subject above a bottom caption band. Missing sides default to ±safe. A region's own `window`
 *           overrides it. Without any window the test is exactly the old one (max |NDC| > safe).
 *   keepOut: [{ id, x0, x1, y0, y1, from = -Inf, to = +Inf }] NDC rectangles that overlay UI occupies (caption band,
 *           lower third, logo bug) — use pxRect() for pixel boxes. A required region whose projected bounding
 *           rectangle overlaps an active keep-out is a fail (reason "keepOut:<id>"). A region with `keepOut: false`
 *           (the caption itself) or `keepOut: ["band"]` (only those ids are ignored) is exempt accordingly.
 *   fails[].reason: "safe" (old test) | "window" | "behind" | "keepOut:<id>";  over = how far past the window edge (NDC).
 *   A region whose points go behind the camera counts as out (ndc = Infinity).
 */
export function framingReport(regions, keys, opts = {}) {
  const { dt = 1 / 30, drift = null, fov = 35, aspect = 16 / 9, ortho = false, safe = 0.9, t0 = 0 } = opts;
  const K = prepareKeys(keys, { fov });
  const duration = opts.duration ?? K[K.length - 1].t;
  const pick = typeof regions === "function" ? regions : (t) => regions.filter((r) => r.required !== false && t >= (r.from ?? -Infinity) && t <= (r.to ?? Infinity));
  const winOf = (w) => (w ? { x0: w.x0 ?? -safe, x1: w.x1 ?? safe, y0: w.y0 ?? -safe, y1: w.y1 ?? safe } : null);
  const gWin = winOf(opts.window);
  const keepOut = opts.keepOut ?? [];
  const fails = [];
  let worst = { t: null, id: null, ndc: 0 }, samples = 0;
  const n = Math.max(0, Math.round((duration - t0) / dt));
  for (let i = 0; i <= n; i++) {
    const t = +Math.min(duration, t0 + i * dt).toFixed(6);
    const cam = sampleCameraKeys(K, t, { drift, fov });
    cam._basis = cameraBasis(cam);
    const kos = keepOut.filter((k) => t >= (k.from ?? -Infinity) && t <= (k.to ?? Infinity));
    for (const r of pick(t)) {
      const pts = r.box ? boxCorners(r.box[0], r.box[1]) : typeof r.pts === "function" ? r.pts(t) : r.pts;
      const e = screenExtent(cam, pts, { aspect, ortho });
      samples++;
      const ndc = e.behind ? Infinity : +e.m.toFixed(4);
      if (ndc > worst.ndc) worst = { t, id: r.id, ndc };
      const win = r.window ? winOf(r.window) : gWin;
      if (e.behind) { fails.push({ t, id: r.id, ndc, behind: true, reason: "behind", over: Infinity }); continue; }
      if (!win) { if (ndc > safe) fails.push({ t, id: r.id, ndc, behind: false, reason: "safe", over: +(ndc - safe).toFixed(4) }); }
      else {
        const over = Math.max(win.x0 - e.x[0], e.x[1] - win.x1, win.y0 - e.y[0], e.y[1] - win.y1);
        if (over > 0) fails.push({ t, id: r.id, ndc, behind: false, reason: "window", over: +over.toFixed(4) });
      }
      if (r.keepOut === false) continue;
      for (const k of kos) {
        if (Array.isArray(r.keepOut) && r.keepOut.includes(k.id)) continue;
        const ox = Math.min(e.x[1], k.x1) - Math.max(e.x[0], k.x0), oy = Math.min(e.y[1], k.y1) - Math.max(e.y[0], k.y0);
        if (e.x[1] > k.x0 && e.x[0] < k.x1 && e.y[1] > k.y0 && e.y[0] < k.y1) fails.push({ t, id: r.id, ndc, behind: false, reason: `keepOut:${k.id}`, over: +Math.min(ox, oy).toFixed(4) });
      }
    }
  }
  // merge consecutive failing samples per region into spans
  const spans = [], open = new Map();
  for (const f of fails) {
    const s = open.get(f.id);
    if (s && f.t - s.to <= dt * 1.5 + 1e-9) { s.to = f.t; if (f.ndc > s.worst) s.worst = f.ndc; if (!s.reasons.includes(f.reason)) s.reasons.push(f.reason); }
    else { const ns = { id: f.id, from: f.t, to: f.t, worst: f.ndc, reasons: [f.reason] }; spans.push(ns); open.set(f.id, ns); }
  }
  return { ok: fails.length === 0, worst, fails, spans, samples };
}

/**
 * pxRect(x, y, w, h, { width = 1920, height = 1080 }) -> { x0, x1, y0, y1 } in NDC (y up) for a top-left-origin pixel box
 *   (e.g. an overlay.screenCanvas placed at (x, y) with size w × h) — for framingReport keepOut / window.
 */
export function pxRect(x, y, w, h, { width = 1920, height = 1080 } = {}) {
  return { x0: (x / width) * 2 - 1, x1: ((x + w) / width) * 2 - 1, y0: 1 - ((y + h) / height) * 2, y1: 1 - (y / height) * 2 };
}

/** subjectPoints(subject) -> [[x,y,z], ...] from points, { box:[min,max] }, { pts:[...] } or an array mixing them. */
export function subjectPoints(subject) {
  const out = [];
  const add = (s) => {
    if (!s) return;
    if (Array.isArray(s) && s.length === 3 && typeof s[0] === "number") out.push([s[0], s[1], s[2]]);
    else if (Array.isArray(s)) for (const x of s) add(x);
    else if (s.box) out.push(...boxCorners(s.box[0], s.box[1]));
    else if (s.min && s.max) out.push(...boxCorners(s.min, s.max));
    else if (s.pts) add(s.pts);
  };
  add(subject);
  return out;
}

/**
 * fitShot(subject, opts) -> { pos, target, fov, viewHeight?, dist, extent: { x: [min, max], y: [min, max] } }
 *   A camera KEY (feed it to createCameraRig / framingReport) that fits `subject` into a screen window seen from a
 *   given direction. Generalised from bead-abacus / conveyor-factory fitShot and city-lights fitShot (pass 7); the
 *   local copies in styles stay as they are.
 *   subject: points [[x,y,z], ...], a box { box: [min, max] }, or an array mixing points / boxes / { pts }.
 *   opts: {
 *     azimuth = 0      rad around +Y; 0 = camera on the +Z side looking toward -Z, π/2 = on the +X side   (alias azim, az)
 *     elevation = 0.35 rad above the horizontal (looking down at the subject)                                 (alias elev)
 *     fov = 35 (deg), aspect = 16/9, ortho = false (orthographic: returns viewHeight and a pos `dist` back)
 *     window = { x0: -.9, x1: .9, y0: -.9, y1: .9 }  NDC window the subject must sit in (y up). Leave room for a
 *                      caption: { y0: -.6 } keeps the subject above a bottom band.  Missing sides = ±0.9.
 *     fill = 0.9       how much of the window the subject fills on its LIMITING axis (1 = touching the window edges).
 *     align = [0, 0]   where the subject sits inside the window: -1 = left/bottom edge, 0 = centred, 1 = right/top.
 *     distance: [min = 0.05, max = 500] search range (m), iterations = 10 (target re-centring passes), round = 5
 *     roll = 0
 *   }
 *   The camera looks along -dir(azimuth, elevation); its distance is the smallest that fits (binary search over the
 *   exact kit/framing projection), then the target is shifted in the image plane so the subject's projected box sits
 *   at `align` inside the window. Check the whole move afterwards with framingReport (fills are per key, not per move).
 */
export function fitShot(subject, o = {}) {
  const pts = subjectPoints(subject);
  if (!pts.length) throw new Error("fitShot: no points in subject");
  const az = o.azimuth ?? o.azim ?? o.az ?? 0, el = o.elevation ?? o.elev ?? 0.35;
  const fov = o.fov ?? 35, aspect = o.aspect ?? 16 / 9, ortho = !!o.ortho, roll = o.roll ?? 0;
  const fill = clamp(o.fill ?? 0.9, 1e-3, 1);
  const w = { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.9, ...(o.window ?? {}) };
  const [ax, ay] = o.align ?? [0, 0];
  const [dMin, dMax] = o.distance ?? [0.05, 500];
  const iters = o.iterations ?? 10;
  const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const half = [((w.x1 - w.x0) / 2) * fill, ((w.y1 - w.y0) / 2) * fill];
  const wc = [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2];
  const c0 = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  const th = Math.tan((fov * Math.PI) / 360);
  const camAt = (tgt, d, vh) => ({ pos: [tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d], target: tgt, fov, roll, ...(vh != null ? { viewHeight: vh } : {}) });
  // place: shift the target in the image plane until the projected box sits at `align` within the window
  const place = (d, vh) => {
    let tgt = [...c0], e = null;
    for (let it = 0; it < iters; it++) {
      const cam = camAt(tgt, d, vh);
      e = screenExtent(cam, pts, { aspect, ortho });
      if (e.behind) return { cam, e };
      const sx = (e.x[1] - e.x[0]) / 2, sy = (e.y[1] - e.y[0]) / 2;
      const want = [wc[0] + ax * Math.max(0, (w.x1 - w.x0) / 2 - sx), wc[1] + ay * Math.max(0, (w.y1 - w.y0) / 2 - sy)];
      const mid = [(e.x[0] + e.x[1]) / 2, (e.y[0] + e.y[1]) / 2];
      const B = cameraBasis(cam);
      const hh = ortho ? vh / 2 : th * d; // half frame height in world units at the target plane
      const dx = (mid[0] - want[0]) * hh * aspect, dy = (mid[1] - want[1]) * hh;
      tgt = [tgt[0] + B.right[0] * dx + B.up[0] * dy, tgt[1] + B.right[1] * dx + B.up[1] * dy, tgt[2] + B.right[2] * dx + B.up[2] * dy];
    }
    const cam = camAt(tgt, d, vh);
    return { cam, e: screenExtent(cam, pts, { aspect, ortho }) };
  };
  const fits = (r) => !r.e.behind && (r.e.x[1] - r.e.x[0]) / 2 <= half[0] + 1e-9 && (r.e.y[1] - r.e.y[0]) / 2 <= half[1] + 1e-9;
  let res;
  if (ortho) {
    // orthographic: extent scales exactly with 1/viewHeight; stand the camera off far enough to see everything
    const span = Math.max(...pts.map((p) => Math.hypot(p[0] - c0[0], p[1] - c0[1], p[2] - c0[2])));
    const d = Math.max(dMin, span * 2 + 1);
    const probe = place(d, 2);
    const sx = (probe.e.x[1] - probe.e.x[0]) / 2, sy = (probe.e.y[1] - probe.e.y[0]) / 2;
    const vh = 2 * Math.max(sx / half[0], sy / half[1]);
    res = place(d, vh);
    res.d = d;
  } else {
    let lo = dMin, hi = dMax;
    for (let i = 0; i < 56; i++) { const m = (lo + hi) / 2; if (fits(place(m))) hi = m; else lo = m; }
    res = place(hi);
    res.d = hi;
  }
  const dec = o.round ?? 5, r = (v) => (dec == null ? v : +v.toFixed(dec));
  const out = { pos: res.cam.pos.map(r), target: res.cam.target.map(r), fov, dist: r(res.d), extent: { x: res.e.x.map((v) => +v.toFixed(4)), y: res.e.y.map((v) => +v.toFixed(4)) } };
  if (roll) out.roll = roll;
  if (ortho) out.viewHeight = r(res.cam.viewHeight);
  return out;
}
