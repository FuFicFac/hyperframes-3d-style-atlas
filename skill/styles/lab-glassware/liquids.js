// styles/lab-glassware/liquids.js — the THREE-free planner for "Lab Glassware" (pure, Node-safe; style.plan).
// Liquids are quantities. Everything here is a pure function of its inputs (and of t): no THREE, no window, no DOM.
// style.js imports it for the picture and scene.config.js imports it for SCORE, so every trickle, drip, clink and
// fizz in the sound is read from the same plan the picture uses.
//
//   vesselProfile(kind, dims)          -> profile: inner radius curve, glass shell loop, volume-vs-height table
//   volumeAt(prof, h) / heightFor(prof, V)        upright volume curve and its inverse (graduations, fills)
//   volumeBelow(prof, c, tilt)         volume under a world-horizontal plane in a vessel tilted by `tilt` (disc slices)
//   planeFor(prof, V, tilt)            plane constant that holds volume V at that tilt (bisection)
//   tiltForLip(prof, V)                tilt at which volume V just reaches the pouring lip (bisection)
//   planFill / fillVolume / fillWobble levels that rise to an exact graduation and settle
//   planPour / pourPose / transferred / pourRate / streamPoints / received   pours with conserved volume
//   planDrops / dropState / dropsReleased / dropsLanded / lastDrop / reactFront   burette drops + the planned flip
//   mixDyes / hexToLin / linToHex      dye (Beer-Lambert, subtractive) colour blending
//   swirlState                         spiral mixing that winds up and settles
//   planBubbles / bubbleAt / foamHeight               fizz and the foam head
//   events(...)                        every audible moment, ready for kit/schedule.scoreFromEvents
// Conventions: vessel local frame = axis +Y, the pouring lip on local +x * side. A tilt of `th` (>= 0) turns the lip
// DOWN: world height of a local point (x, y) relative to the vessel origin = -x*side*sin(th) + y*cos(th).
import { clamp, lerp, smoothstep, rng, toEase, TAU } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";

const PI = Math.PI;
const UNIT = STYLE_SPEC.units.per;
export const units = (V) => V / UNIT;          // m^3 -> printed units
export const fromUnits = (u) => u * UNIT;      // printed units -> m^3

// ------------------------------------------------------------------------------------------------ profiles
function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
/** linear interpolation of r over a y-sorted [[r, y]] list */
function interpR(list, y) {
  if (y <= list[0][1]) return list[0][0];
  for (let i = 1; i < list.length; i++) {
    if (y <= list[i][1]) {
      const [r0, y0] = list[i - 1], [r1, y1] = list[i];
      return lerp(r0, r1, (y - y0) / ((y1 - y0) || 1));
    }
  }
  return list[list.length - 1][0];
}

/**
 * vesselProfile(kind, dims) -> {
 *   kind, dims, shell: [[r, y]] (closed glass shell for a lathe: outer up, rounded rim, inner down),
 *   inner: [[r, y]] inner wall bottom -> top (y-sorted), rIn(y), floor, top, lipR, y0 (lowest glass point),
 *   tab: { ys, rs, dy } slices for the tilted volume integral, cum (upright cumulative volume), capacity,
 *   rTable(n) -> n inner radii sampled floor..top (for the shader) }
 *   kinds: beaker | cylinder | flask | tube | burette | funnel (dims default to STYLE_SPEC.vessels[kind])
 */
export function vesselProfile(kind, dims = {}) {
  const D = { ...(STYLE_SPEC.vessels[kind] ?? {}), ...dims };
  const shell = [], inner = [];
  let floor = 0, top = D.H, y0 = 0;
  const rimArc = (rO, rI, H, n = 8) => arc((rO + rI) / 2, H, (rO - rI) / 2, 0, PI, n);   // outer -> over -> inner
  if (kind === "beaker" || kind === "cylinder") {
    const base = kind === "cylinder" ? D.foot : 0;
    const R = D.R, Ri = D.R - D.wall, c = D.corner, ci = Math.max(0.004, c * 0.7);
    y0 = base;
    floor = base + D.base;
    shell.push([1e-4, base], [R - c, base], ...arc(R - c, base + c, c, -PI / 2, 0, 6).slice(1), [R, D.H - D.wall]);
    shell.push(...rimArc(R + D.lip * 0.25, Ri, D.H - D.wall * 0.5, 10));
    shell.push([Ri, floor + ci], ...arc(Ri - ci, floor + ci, ci, 0, -PI / 2, 5).slice(1), [1e-4, floor]);
    inner.push(...arc(Ri - ci, floor + ci, ci, -PI / 2, 0, 5).map(([r, y]) => [r, y]), [Ri, D.H - D.wall * 0.5]);
    top = D.H - D.wall * 0.5;
  } else if (kind === "flask") {
    const R = D.R, w = D.wall, c = D.corner, nR = D.neckR, yN = D.H - D.neckH, yC = c * 0.9;
    floor = D.base;
    const coneO = (y) => lerp(R, nR, clamp((y - yC) / (yN - yC)));
    shell.push([1e-4, 0], [R - c, 0], ...arc(R - c, c, c, -PI / 2, 0, 6).slice(1));
    for (let i = 1; i <= 8; i++) { const y = lerp(c, yN, i / 8); shell.push([coneO(y), y]); }
    shell.push([nR, D.H - w]);
    shell.push(...rimArc(nR + D.lip * 0.6, nR - w, D.H - w * 0.5, 10));
    const ri = (y) => (y >= yN ? nR - w : coneO(y) - w * 1.15);
    for (let i = 8; i >= 0; i--) { const y = lerp(floor + c * 0.6, yN, i / 8); shell.push([ri(y), y]); }
    shell.push([ri(floor + c * 0.6) - c * 0.45, floor], [1e-4, floor]);
    inner.push([ri(floor + c * 0.6) - c * 0.45, floor]);
    for (let i = 0; i <= 8; i++) { const y = lerp(floor + c * 0.6, yN, i / 8); inner.push([ri(y), y]); }
    inner.push([nR - w, D.H - w * 0.5]);
    top = D.H - w * 0.5;
  } else if (kind === "tube") {
    const R = D.R, Ri = R - D.wall;
    floor = D.wall;
    shell.push(...arc(0, R, R, -PI / 2, 0, 10).map(([x, y], i) => [i === 0 ? 1e-4 : x, y]), [R, D.H - D.wall]);
    shell.push(...rimArc(R + D.lip * 0.4, Ri, D.H - D.wall * 0.5, 8));
    shell.push(...arc(0, R, Ri, 0, -PI / 2, 10).map(([x, y], i, a) => [i === a.length - 1 ? 1e-4 : x, y]));
    inner.push(...arc(0, R, Ri, -PI / 2, 0, 10).map(([x, y], i) => [i === 0 ? 1e-4 : x, y]), [Ri, D.H - D.wall * 0.5]);
    top = D.H - D.wall * 0.5;
  } else if (kind === "burette") {
    const R = D.R, Ri = R - D.wall, tH = D.tipH, tr = D.tipR;
    floor = tH;                              // the graduated tube; the tip below it stays full
    shell.push([tr * 0.45, 0], [tr, 0], [tr * 1.4, tH * 0.45], [R * 0.62, tH * 0.82], [R, tH], [R, D.H - D.wall]);
    shell.push(...rimArc(R + D.lip * 0.3, Ri, D.H - D.wall * 0.5, 8));
    shell.push([Ri, tH], [Ri * 0.55, tH * 0.82], [tr * 0.7, tH * 0.45], [tr * 0.45, 0]);
    inner.push([Ri, tH], [Ri, D.H - D.wall * 0.5]);
    top = D.H - D.wall * 0.5;
  } else if (kind === "funnel") {
    const R = D.R, w = D.wall, sR = D.stemR, sH = D.stemH;
    shell.push([sR - w, 0], [sR, 0], [sR, sH], [R, D.H - w]);
    shell.push(...rimArc(R + D.lip * 0.3, R - w * 1.4, D.H - w * 0.5, 8));
    shell.push([sR - w, sH + w * 0.6], [sR - w, 0]);
    inner.push([sR - w, 0], [sR - w, sH], [R - w * 1.4, D.H - w * 0.5]);
    floor = 0; top = D.H - w * 0.5;
  } else throw new Error(`lab-glassware: unknown vessel kind "${kind}"`);

  inner.sort((a, b) => a[1] - b[1]);
  const rIn = (y) => interpR(inner, clamp(y, floor, top));
  const lipR = rIn(top);
  // slices for the integral (mid-points) + upright cumulative volume
  const N = 140, dy = (top - floor) / N, ys = new Float64Array(N), rs = new Float64Array(N), cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    ys[i] = floor + (i + 0.5) * dy; rs[i] = rIn(ys[i]);
    cum[i + 1] = cum[i] + PI * rs[i] * rs[i] * dy;
  }
  const prof = {
    kind, dims: D, shell, inner, rIn, floor, top, lipR, y0,
    tab: { ys, rs, dy, N }, cum, capacity: cum[N],
    rTable(n = 48) { return Array.from({ length: n }, (_, i) => rIn(lerp(floor, top, i / (n - 1)))); },
  };
  return prof;
}

/** volumeAt(prof, h) -> m^3 below local height h, upright. */
export function volumeAt(prof, h) {
  const { tab, cum } = prof;
  const x = (h - prof.floor) / tab.dy;
  if (x <= 0) return 0;
  if (x >= tab.N) return cum[tab.N];
  const i = Math.floor(x);
  return cum[i] + (cum[i + 1] - cum[i]) * (x - i);
}
/** heightFor(prof, V) -> local height of the surface holding V upright (inverse of volumeAt). */
export function heightFor(prof, V) {
  const { tab, cum } = prof;
  if (V <= 0) return prof.floor;
  if (V >= cum[tab.N]) return prof.top;
  let lo = 0, hi = tab.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= V) lo = m; else hi = m; }
  return prof.floor + (lo + (V - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1)) * tab.dy;
}

/** area of a disc of radius r where x <= e. */
function segLE(r, e) {
  if (e >= r) return PI * r * r;
  if (e <= -r) return 0;
  return r * r * (PI - Math.acos(e / r)) + e * Math.sqrt(r * r - e * e);
}
/**
 * volumeBelow(prof, c, th) -> m^3 of the vessel's inner volume where (world height relative to the vessel origin)
 *   -x*sin(th) + y*cos(th) <= c  (th >= 0 tilts the lip side down). Disc slices along the axis, exact segments.
 */
export function volumeBelow(prof, c, th) {
  if (th < 1e-5) return volumeAt(prof, c);
  const { ys, rs, dy, N } = prof.tab, s = Math.sin(th), co = Math.cos(th);
  let V = 0;
  for (let i = 0; i < N; i++) {
    const d = (ys[i] * co - c) / s;   // liquid where x >= d
    V += segLE(rs[i], -d) * dy;
  }
  return V;
}
function cRange(prof, th) {
  const { ys, rs, N } = prof.tab, s = Math.sin(th), co = Math.cos(th);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, ys[i] * co - rs[i] * s); hi = Math.max(hi, ys[i] * co + rs[i] * s); }
  return [lo - 0.01, hi + 0.01];
}
/** planeFor(prof, V, th) -> c: the plane constant (world height above the vessel origin) holding V at tilt th. */
export function planeFor(prof, V, th) {
  if (th < 1e-5) return heightFor(prof, V);
  let [lo, hi] = cRange(prof, th);
  if (V <= 0) return lo;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (volumeBelow(prof, m, th) < V) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** lipC(prof, th) -> plane constant through the pouring lip at tilt th. */
export const lipC = (prof, th) => -prof.lipR * Math.sin(th) + prof.top * Math.cos(th);
/** tiltForLip(prof, V, thMax = 1.66) -> the tilt at which volume V just reaches the lip (0 if it is already full). */
export function tiltForLip(prof, V, thMax = 1.66) {
  if (V >= volumeBelow(prof, lipC(prof, 0), 0)) return 0;
  let lo = 0, hi = thMax;
  if (volumeBelow(prof, lipC(prof, hi), hi) > V) return hi;
  for (let k = 0; k < 34; k++) { const m = (lo + hi) / 2; if (volumeBelow(prof, lipC(prof, m), m) > V) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------------------------------------ fills
/** planFill({ V (m^3), t0, dur, V0 = 0, wobble = .006, omega = 15, zeta = 5.5 }) -> fill plan */
export function planFill(o) { return { V0: 0, wobble: 0.006, omega: 15, zeta: 5.5, ease: "inOutSine", ...o, t1: o.t0 + o.dur }; }
/** fillVolume(f, t) -> m^3 at t (eases from V0 to V over [t0, t1]). */
export function fillVolume(f, t) { return lerp(f.V0, f.V, toEase(f.ease)(clamp((t - f.t0) / f.dur))); }
/** fillWobble(f, t) -> m of level wobble after the fill lands (damped). */
export function fillWobble(f, t) {
  if (t < f.t1) return 0;
  const tau = t - f.t1;
  return f.wobble * Math.exp(-f.zeta * tau) * Math.sin(f.omega * tau);
}

// ------------------------------------------------------------------------------------------------ pours
const flowE = (u) => { u = clamp(u); return u - Math.sin(TAU * u) / TAU; };       // 0..1, zero slope at both ends
const flowR = (u) => (u <= 0 || u >= 1 ? 0 : 1 - Math.cos(TAU * u));               // derivative of flowE (peak 2)
/**
 * planPour({ id, prof, side = +1, V0, V1 = 0, rest: [x,y,z] (vessel origin on the bench), lip: [x,y,z] (world
 *   pivot while pouring), tLift, move = .6, flow = 1.8, back = .35, down = .6, hop = .12, v0 = .3, g = 9.8,
 *   r0 = .016 (stream radius at peak flow), dstY (world surface height used for the fall time), thMax = 1.66 (rad; past
 *   90 degrees so the last of it leaves), backTo = .55 (tilt kept, as a fraction, while it pulls back) })
 *   -> pour plan with tFlow, tEnd, tBack, tDown, thStart, thEnd, restLip, fall (s), rateMax (m^3/s)
 */
export function planPour(o) {
  const p = { side: 1, V1: 0, move: 0.6, flow: 1.8, back: 0.35, down: 0.6, hop: 0.12, v0: 0.3, g: 9.8, r0: 0.016, thMax: 1.66, backTo: 0.55, ...o };
  p.tFlow = p.tLift + p.move; p.tEnd = p.tFlow + p.flow; p.tBack = p.tEnd + p.back; p.tDown = p.tBack + p.down;
  p.thStart = tiltForLip(p.prof, p.V0, p.thMax);
  p.thEnd = tiltForLip(p.prof, Math.max(p.V1, p.prof.capacity * 0.004), p.thMax);
  p.restLip = [p.rest[0] + p.side * p.prof.lipR, p.rest[1] + p.prof.top, p.rest[2]];
  p.fall = Math.sqrt(Math.max(0.02, 2 * (p.lip[1] - (p.dstY ?? p.rest[1])) / p.g));
  p.rateMax = ((p.V0 - p.V1) / p.flow) * 2;
  return p;
}
/** transferred(p, t) -> m^3 that has left the source by t. */
export const transferred = (p, t) => (p.V0 - p.V1) * flowE((t - p.tFlow) / p.flow);
/** pourRate(p, t) -> m^3/s leaving the lip at t. */
export const pourRate = (p, t) => ((p.V0 - p.V1) / p.flow) * flowR((t - p.tFlow) / p.flow);
/** received(p, t) -> m^3 that has arrived in the target by t (the stream's fall time later). */
export const received = (p, t) => transferred(p, t - p.fall);
/**
 * pourPose(p, t) -> { pivot: [x,y,z] (world lip), tilt (>= 0), rotZ (= -side*tilt), origin: [x,y,z], V (source m^3),
 *   level (world y of the source surface), lift (0..1, how far off the bench), phase }
 */
export function pourPose(p, t) {
  const io = toEase("inOutSine"), ic = toEase("inOutCubic");
  let pivot, tilt, V = p.V0, phase = "rest", lift = 0;
  const bump = (u) => p.hop * Math.sin(PI * clamp(u));
  if (t < p.tLift) { pivot = p.restLip; tilt = 0; }
  else if (t < p.tFlow) {
    const u = (t - p.tLift) / p.move, e = io(u);
    pivot = [lerp(p.restLip[0], p.lip[0], e), lerp(p.restLip[1], p.lip[1], e) + bump(u), lerp(p.restLip[2], p.lip[2], e)];
    tilt = p.thStart * ic(clamp((u - 0.15) / 0.85)); phase = "move"; lift = e;
  } else if (t < p.tEnd) {
    V = p.V0 - transferred(p, t); pivot = p.lip; phase = "pour"; lift = 1;
    tilt = Math.max(p.thStart, tiltForLip(p.prof, Math.max(V, p.prof.capacity * 0.004), p.thMax));
  } else if (t < p.tBack) {
    // stop the flow: tip back to a resting tilt while still over the target (keeps the body clear of it)
    const u = (t - p.tEnd) / p.back;
    V = p.V1; pivot = p.lip; tilt = lerp(p.thEnd, p.thEnd * p.backTo, ic(u)); phase = "back"; lift = 1;
  } else if (t < p.tDown) {
    const u = (t - p.tBack) / p.down, e = io(u);
    V = p.V1; tilt = p.thEnd * p.backTo * (1 - ic(clamp(u / 0.8))); phase = "down"; lift = 1 - e;
    pivot = [lerp(p.lip[0], p.restLip[0], e), lerp(p.lip[1], p.restLip[1], e) + bump(u) * 0.6, lerp(p.lip[2], p.restLip[2], e)];
  } else { V = p.V1; pivot = p.restLip; tilt = 0; phase = "rest"; }
  const a = -p.side * tilt, ca = Math.cos(a), sa = Math.sin(a);
  const lx = p.side * p.prof.lipR, ly = p.prof.top;
  const origin = [pivot[0] - (lx * ca - ly * sa), pivot[1] - (lx * sa + ly * ca), pivot[2]];
  const c = tilt < 1e-5 ? heightFor(p.prof, V) : planeFor(p.prof, V, tilt);
  return { pivot, tilt, rotZ: a, origin, V, level: origin[1] + c, lift, phase };
}
/**
 * streamPoints(p, t, surfaceY, n = 24) -> null | { pts: [[x,y,z]], radii: [r] } — the falling stream at t.
 *   Each point is a parcel that left the lip at tau = t - age with the flow rate of that moment; it falls ballistically
 *   (horizontal speed grows with the rate) and stops at the target surface. Radius thins as the parcel speeds up.
 */
export function streamPoints(p, t, surfaceY, n = 24) {
  const aHit = Math.sqrt(Math.max(0, 2 * (p.lip[1] - surfaceY) / p.g));
  const a0 = Math.max(0, t - p.tEnd), a1 = Math.min(aHit, t - p.tFlow);
  if (!(a1 > a0 + 1e-4)) return null;
  const pts = [], radii = [];
  for (let k = 0; k < n; k++) {
    const a = lerp(a0, a1, k / (n - 1)), tau = t - a;
    const rho = clamp(pourRate(p, tau) / (p.rateMax / 2), 0, 2) / 2;   // 0..1
    const v = p.v0 * (0.55 + 0.45 * rho);
    const wob = 0.004 * Math.sin(tau * 23.0 + k * 0.0) * rho;
    pts.push([p.lip[0] + p.side * v * a + p.side * 0.004, p.lip[1] - 0.5 * p.g * a * a, p.lip[2] + wob]);
    const speed = Math.hypot(v, p.g * a);
    radii.push(p.r0 * Math.sqrt(rho) * Math.sqrt(Math.max(v, 0.35) / Math.max(speed, 0.35)));
  }
  return { pts, radii, landing: pts[pts.length - 1], landed: a1 >= aHit - 1e-4 };
}

// ------------------------------------------------------------------------------------------------ drops
/**
 * planDrops({ start, every = .45, count, flipAt (1-based drop that tips it), tip: [x,y,z], surfaceY, form = .32,
 *   g = 9.8, r = .014, vol (m^3 per drop) }) -> { drops: [{ i, tForm, tRel, tHit, flip }], ...cfg, flipT }
 */
export function planDrops(o) {
  const c = { every: 0.45, form: 0.32, g: 9.8, r: 0.014, ...o };
  const fall = Math.sqrt(2 * Math.max(0.01, c.tip[1] - c.surfaceY) / c.g);
  c.drops = Array.from({ length: c.count }, (_, k) => {
    const tRel = c.start + k * c.every;
    return { i: k + 1, tForm: tRel - c.form, tRel, tHit: tRel + fall, flip: k + 1 === c.flipAt };
  });
  c.fall = fall;
  c.flipT = c.drops.find((d) => d.flip)?.tHit ?? Infinity;
  return c;
}
/** dropState(plan, t) -> [{ i, p: [x,y,z], s (scale 0..1), stretch, phase: "form"|"fall" }] visible drops at t. */
export function dropState(plan, t) {
  const out = [];
  for (const d of plan.drops) {
    if (t < d.tForm || t >= d.tHit) continue;
    if (t < d.tRel) {
      const u = (t - d.tForm) / plan.form;
      out.push({ i: d.i, p: [plan.tip[0], plan.tip[1] - plan.r * 0.9 * u, plan.tip[2]], s: Math.sqrt(u), stretch: 1 + 0.25 * u, phase: "form" });
    } else {
      const a = t - d.tRel;
      out.push({ i: d.i, p: [plan.tip[0], plan.tip[1] - plan.r * 0.9 - 0.5 * plan.g * a * a, plan.tip[2]], s: 1, stretch: 1 + Math.min(0.6, plan.g * a * 0.18), phase: "fall" });
    }
  }
  return out;
}
export const dropsReleased = (plan, t) => plan.drops.filter((d) => t >= d.tRel).length;
export const dropsLanded = (plan, t) => plan.drops.filter((d) => t >= d.tHit).length;
/** lastDrop(plan, t) -> { i, age, flip } of the most recent landed drop, or null. */
export function lastDrop(plan, t) {
  let L = null;
  for (const d of plan.drops) if (t >= d.tHit) L = d;
  return L ? { i: L.i, age: t - L.tHit, flip: L.flip } : null;
}
/** reactFront(plan, t, { spread = .9, maxR = .5 }) -> radius (m) of the spreading colour front after the flip drop (0 before). */
export function reactFront(plan, t, { spread = 0.9, maxR = 0.5 } = {}) {
  if (t < plan.flipT) return 0;
  return maxR * toEase("outCubic")(clamp((t - plan.flipT) / spread));
}

// ------------------------------------------------------------------------------------------------ colour
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export function hexToLin(hex) { const n = parseInt(hex.slice(1), 16); return [s2l(((n >> 16) & 255) / 255), s2l(((n >> 8) & 255) / 255), s2l((n & 255) / 255)]; }
export function linToHex(c) { return "#" + c.map((v) => Math.round(clamp(l2s(clamp(v))) * 255).toString(16).padStart(2, "0")).join(""); }
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/**
 * mixDyes([{ hex, v }], sat = 1.3) -> hex: subtractive dye mixing. Transmittances multiply (volume-weighted geometric mean in
 *   linear light — Beer-Lambert), then the result is rescaled to the volume-weighted mean luminance so a blend is not
 *   muddier than its inputs (blue + yellow -> green, not grey); `sat` pushes chroma back up a little.
 */
export function mixDyes(parts, sat = 1.3) {
  const P = parts.filter((p) => p.v > 0);
  if (!P.length) return parts[0]?.hex ?? "#ffffff";
  const W = P.reduce((a, p) => a + p.v, 0);
  const lc = [0, 0, 0];
  let L = 0;
  for (const p of P) {
    const c = hexToLin(p.hex), w = p.v / W;
    for (let k = 0; k < 3; k++) lc[k] += w * Math.log(Math.max(1e-3, c[k]));
    L += w * lum(c);
  }
  const m = lc.map(Math.exp);
  const k = L / Math.max(1e-4, lum(m));
  const sc = m.map((v) => v * Math.min(k, 6)), Ls = lum(sc);
  const out = sc.map((v) => Math.max(0, Ls + (v - Ls) * sat));
  const mx = Math.max(...out);
  return linToHex(mx > 1 ? out.map((v) => v / mx) : out);
}

/**
 * swirlState(t, { t0, t1, omega, tau, settle }) -> { amount (0..1), phase (rad) }: the spiral winds up while
 *   liquid is arriving (t0..t1) and settles after t1 (phase decays exponentially, amount fades over `settle`).
 */
export function swirlState(t, o) {
  const { t0, t1, omega = 7, tau = 1.1, settle = 1.6 } = o;
  if (t < t0) return { amount: 0, phase: 0 };
  const amount = smoothstep(t0, t0 + 0.35, t) * (1 - smoothstep(t1, t1 + settle, t));
  const phase = t < t1 ? omega * (t - t0) : omega * (t1 - t0) + omega * tau * (1 - Math.exp(-(t - t1) / tau));
  return { amount, phase };
}

// ------------------------------------------------------------------------------------------------ fizz + foam
/**
 * planBubbles({ t0, t1, count, theta: [a, b] (local angles, 0 = facing +Z), size: [min, max], speed: [min, max],
 *   accel = .6, seed }) -> [{ tb, theta, r, v, acc, ph }]  birth times spread over t0..t1 (denser early).
 */
export function planBubbles(o) {
  const r = rng(o.seed ?? 5), out = [];
  for (let i = 0; i < o.count; i++) {
    const u = (i + r.next()) / o.count;
    out.push({ tb: lerp(o.t0, o.t1, u ** 1.25), theta: r.range(o.theta[0], o.theta[1]), r: r.range(o.size[0], o.size[1]),
      v: r.range(o.speed[0], o.speed[1]), acc: o.accel ?? 0.6, ph: r.range(0, TAU), y0: r.range(0, 0.05) });
  }
  return out.sort((a, b) => a.tb - b.tb);
}
/** bubbleAt(b, t, floorY, levelY) -> null | { y (local), theta, r, pop (0..1 near the surface) } */
export function bubbleAt(b, t, floorY, levelY) {
  if (t < b.tb) return null;
  const a = t - b.tb;
  const y = floorY + 0.02 + b.y0 + b.v * a + 0.5 * b.acc * a * a;
  if (y > levelY - b.r * 0.5) return null;
  const grow = Math.min(1, 0.55 + a * 1.5);
  return { y, theta: b.theta + 0.05 * Math.sin(a * 9 + b.ph), r: b.r * grow, pop: smoothstep(levelY - b.r * 3, levelY - b.r * 0.5, y) };
}
/** foamHeight(t, { t0, rise, peak, settle, rest }) -> m of foam above the liquid at t (rises, overshoots, settles). */
export function foamHeight(t, o) {
  const { t0, rise = 1.5, peak = 0.12, settle = 1.6, rest = 0.08 } = o;
  if (t < t0) return 0;
  if (t < t0 + rise) return peak * toEase("outCubic")((t - t0) / rise);
  return lerp(peak, rest, toEase("inOutSine")(clamp((t - t0 - rise) / settle)));
}

// ------------------------------------------------------------------------------------------------ events (sound)
/**
 * events({ fills: [{ id, f, prof }], pours: [{ p, dst: { prof, V0 (m^3 before), others: [pours into it] } }], drops,
 *   fizz: { t0, t1, bubbles }, foam: { t0, rise }, trickleEvery = .042 }) -> [{ t, kind, ... }] sorted.
 *   kinds: trickle (frac = how full the receiving vessel is, 0..1), mark (a fill lands on its graduation), lift, set,
 *   pourStart, swirl, form, drip (i, flip), flip, fizz (dur), pop, foam (dur).
 */
export function events(o) {
  const ev = [], every = o.trickleEvery ?? 0.042;
  for (const F of o.fills ?? []) {
    const { f, prof } = F;
    for (let t = f.t0 + 0.04; t < f.t1 - 0.05; t += every) {
      const V = fillVolume(f, t), frac = heightFrac(prof, V);
      ev.push({ t, kind: "trickle", frac, id: F.id, gain: 0.55 + 0.45 * Math.sin(PI * clamp((t - f.t0) / f.dur)) });
    }
    ev.push({ t: f.t1, kind: "mark", id: F.id, frac: heightFrac(prof, f.V) });
  }
  for (const P of o.pours ?? []) {
    const { p, dst } = P;
    ev.push({ t: p.tLift, kind: "lift", id: p.id, x: p.rest[0] });
    ev.push({ t: p.tFlow, kind: "pourStart", id: p.id, x: p.lip[0] });
    for (let t = p.tFlow + p.fall; t < p.tEnd + p.fall - 0.05; t += every) {
      const rate = pourRate(p, t - p.fall) / (p.rateMax / 2);
      if (rate < 0.05) continue;
      const Vd = dst.V0 + dst.pours.reduce((a, q) => a + received(q, t), 0);
      ev.push({ t, kind: "trickle", frac: heightFrac(dst.prof, Vd), id: p.id, x: p.lip[0], gain: Math.min(1, 0.35 + 0.65 * rate) });
    }
    ev.push({ t: p.tDown, kind: "set", id: p.id, x: p.rest[0] });
  }
  if (o.swirl) ev.push({ t: o.swirl.t0, kind: "swirl", dur: o.swirl.t1 - o.swirl.t0 + 0.6 });
  if (o.drops) {
    for (const d of o.drops.drops) {
      ev.push({ t: d.tRel, kind: "form", i: d.i });
      ev.push({ t: d.tHit, kind: "drip", i: d.i, flip: d.flip });
    }
    if (Number.isFinite(o.drops.flipT)) ev.push({ t: o.drops.flipT + 0.02, kind: "flip" });
  }
  if (o.fizz) {
    ev.push({ t: o.fizz.t0, kind: "fizz", dur: o.fizz.t1 - o.fizz.t0 + 0.8 });
    (o.fizz.bubbles ?? []).forEach((b, k) => { if (k % 4 === 0) ev.push({ t: b.tb + 0.55, kind: "pop", k }); });
  }
  if (o.foam) ev.push({ t: o.foam.t0, kind: "foam", dur: o.foam.rise });
  return ev.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
}
/** heightFrac(prof, V) -> 0..1 how high the surface stands in the vessel. */
export function heightFrac(prof, V) { return clamp((heightFor(prof, V) - prof.floor) / (prof.top - prof.floor)); }

/** malletPitch(step, { scale, base }) -> pitch multiplier for a mallet note `step` steps up a pentatonic scale. */
export function malletPitch(step, M = STYLE_SPEC.sound.mallet) {
  const sc = M.scale, n = sc.length, oct = Math.floor(step / n), k = ((step % n) + n) % n;
  return M.base * 2 ** ((sc[k] + 12 * oct) / 12);
}
/**
 * labVoices(S.sound) -> voices for kit/schedule.scoreFromEvents. trickle -> a short rising bubble chirp whose pitch
 *   follows how full the receiving vessel is; mark -> a clean mallet note; lift/set -> glass clinks; drip -> a plink;
 *   flip -> mallet chord + sparkle; fizz -> crackle; pop -> tiny bubble; foam -> soft riser; swirl -> soft whoosh.
 */
export function labVoices(snd = STYLE_SPEC.sound) {
  const T = snd.trickle, C = snd.clink, St = snd.set, Dp = snd.drip, M = snd.mallet;
  return {
    trickle: (e, ctx) => {
      const j = ((ctx.index * 7919) % 97) / 97;
      return [{ type: "bubble", dur: 0.035 + 0.025 * j, gain: T.gain * e.gain * (0.7 + 0.5 * j), pitch: lerp(T.lo, T.hi, e.frac) * (0.88 + 0.24 * j) }];
    },
    mark: (e) => [{ type: "chime", dur: 1.2, gain: M.gain * 0.8, pitch: malletPitch(Math.round(e.frac * 8), M) }],
    lift: () => [{ type: "chime", dur: 0.35, gain: C.gain * 0.5, pitch: C.pitch * 1.1 }],
    set: () => [{ type: "clack", dur: 0.1, gain: St.gain, pitch: St.pitch }, { type: "chime", dur: 0.4, gain: C.gain, pitch: C.pitch, offset: 0.005 }],
    pourStart: () => [{ type: "whoosh", dur: 0.5, gain: 0.05, pitch: 1.6, dir: "in" }],
    swirl: (e) => [{ type: "whoosh", dur: Math.min(2.2, e.dur), gain: 0.045, pitch: 0.7, dir: "out" }],
    form: () => [{ type: "tick", gain: 0.03, pitch: 2.2 }],
    drip: (e) => [{ type: "bubble", dur: 0.07, gain: Dp.gain * (e.flip ? 1.2 : 1), pitch: Dp.pitch }, { type: "click", gain: 0.06, pitch: 1.8, offset: 0.002 }],
    flip: () => [
      { type: "chime", dur: 1.6, gain: M.gain, pitch: malletPitch(5, M) },
      { type: "chime", dur: 1.6, gain: M.gain * 0.8, pitch: malletPitch(7, M), offset: 0.12 },
      { type: "chime", dur: 1.4, gain: 0.08, pitch: 1.4, sparkle: true, notes: 7, offset: 0.2 },
    ],
    fizz: (e) => [{ type: "paper", dur: e.dur, gain: snd.fizz.gain, pitch: 2.4, density: 0.85 }],
    pop: (e) => [{ type: "bubble", dur: 0.03, gain: 0.04, pitch: 2.4 + (e.k % 5) * 0.15 }],
    foam: (e) => [{ type: "riser", dur: e.dur, gain: 0.05, pitch: 1.2 }],
  };
}
