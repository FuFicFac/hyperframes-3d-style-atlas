// styles/marble-run/marbles.js — PURE marble path scheduling. No THREE, no window, no DOM: imported by
// style.js (browser) AND by a scene's scene.config.js (Node), so the SCORE is generated from exactly the
// impacts the picture shows.
//
// A marble's motion is a chain of closed-form segments authored ahead of time (never simulated per frame):
//   roll   along a polyline of MARBLE-CENTRE points with constant tangential acceleration (slopes: a = 5/7·g·sinθ − μg)
//          and an optional damped hop overlay (landing on a rail); rolling rotation = arc length / radius
//   fall   ballistic arc under g (optionally solved to land exactly on a point)
//   bounce damped vertical hops in place (restitution e) — landing in a jar, on a tray
//   rebound small away-and-back after a clack (half-sine, second softer clack)
//   custom any closed-form pos(τ) + rolled distance(τ) about a fixed axis (coupled pushes, rolling over a lip)
//   hold   rest until an absolute time
// Every segment emits events: { kind: "impact", t, surface, speed, p, id } and { kind: "roll", t0, t1, surface, vMax, id }.
// plan.at(t) -> { p:[x,y,z], q:[x,y,z,w], visible } is a pure function of t (binary search over segments).
//
// Conventions: metres, seconds, Y-up. "up" for rolling = the contact normal (world +Y on rails), so a marble
// moving along d rotates about axis = up × d by angle = distance / r (correct rolling, no slip).
import { clamp } from "../../kit/time.js";
import { expandStroke, filletPath, vec3 } from "../../kit/pathmath.js";

export const ROLL_K = 5 / 7; // solid sphere rolling without slip: a = 5/7 · g · sinθ
const { sub, add, mul, dot, len, nrm } = vec3;
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const UP = [0, 1, 0];

// ---------------------------------------------------------------- quaternions [x, y, z, w]
export const quat = {
  id: () => [0, 0, 0, 1],
  axisAngle(ax, an) {
    const s = Math.sin(an / 2);
    return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(an / 2)];
  },
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },
  norm(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  },
};
/** rolling axis for travel direction d on a surface with normal `up` (fallback +Z for vertical travel). */
export function rollAxis(d, up = UP) {
  const a = cross(up, d);
  const l = len(a);
  return l < 1e-6 ? [0, 0, 1] : mul(a, 1 / l);
}
const rotBy = (q0, axis, angle) => quat.norm(quat.mul(quat.axisAngle(axis, angle), q0));

/** Solve s = v0·τ + ½·a·τ² for τ ≥ 0 (returns Infinity if the marble stops first). */
export function timeForDistance(s, v0, a) {
  if (Math.abs(a) < 1e-9) return v0 > 1e-9 ? s / v0 : Infinity;
  const D = v0 * v0 + 2 * a * s;
  if (D < 0) return Infinity;
  return (-v0 + Math.sqrt(D)) / a;
}

/** Points along the inside of a cone (funnel) for the marble CENTRE: spiral from radius rho0 down to rho1. */
export function funnelSpiral({ center, rMouth, rNeck, height, r, turns = 1.5, startAngle = -Math.PI / 2, dir = 1, steps = 90, rho0, rho1, shape = 1.6 }) {
  const beta = Math.atan2(height, rMouth - rNeck); // wall slope
  const surfY = (R) => center[1] - height + (R - rNeck) * Math.tan(beta); // center[1] = rim height
  const R0 = rho0 ?? rMouth - r * 1.15;
  const R1 = rho1 ?? Math.max(0, rNeck - r * Math.sin(beta) - 0.002);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const rho = R1 + (R0 - R1) * (1 - u) ** shape; // spirals in faster near the neck
    const th = startAngle + dir * turns * 2 * Math.PI * u;
    const Rs = rho + r * Math.sin(beta);
    const y = surfY(Rs) + r * Math.cos(beta);
    pts.push([center[0] + rho * Math.cos(th), y, center[2] + rho * Math.sin(th)]);
  }
  return { pts, beta, surfY };
}

// ---------------------------------------------------------------- the plan (one marble)
export class MarblePlan {
  /**
   * new MarblePlan({ id, r, g = 9.81, start = 0, at:[x,y,z], q = identity })
   * Before `start` the marble is at `at` and plan.at(t).visible is false unless `visibleBefore`.
   */
  constructor({ id = 0, r, g = 9.81, start = 0, at, q, visibleBefore = true }) {
    Object.assign(this, { id, r, g, t0: start, visibleBefore });
    this.t = start;
    this.p = at.slice();
    this.v = [0, 0, 0];
    this.q = q ? q.slice() : quat.id();
    this.spin = { axis: [0, 0, 1], rate: 0 };
    this.segs = [];
    this.events = [];
  }
  get speed() { return len(this.v); }
  _push(seg) { this.segs.push(seg); this.t = seg.t1; return this; }
  impact(surface, speed, extra = {}) {
    this.events.push({ kind: "impact", t: this.t, surface, speed, p: this.p.slice(), id: this.id, ...extra });
    return this;
  }
  mark(name, extra = {}) {
    this.events.push({ kind: "mark", name, t: this.t, p: this.p.slice(), id: this.id, ...extra });
    return this;
  }

  /** kick(v) — set the velocity (a collision with a stop plate, a paddle); emits nothing by itself. */
  kick(v) { this.v = v.slice(); return this; }

  /** hold(until) — rest in place until absolute time `until`. */
  hold(until) {
    if (until <= this.t + 1e-9) return this;
    const p = this.p.slice(), q = this.q.slice();
    this.v = [0, 0, 0];
    this.spin = { axis: this.spin.axis, rate: 0 };
    return this._push({ kind: "hold", t0: this.t, t1: until, pos: () => p, rot: () => q });
  }

  /**
   * roll(points | stroke, { a, mu = 0, vEnd, v0, bend = 0, surface = "wood", up, hop, hopUp }) — along MARBLE-CENTRE points
   *   (the first point is snapped to the current position). Acceleration: `a` if given, else from `vEnd`, else
   *   slope: ROLL_K·g·(drop/length) − mu·g. hop: { v (impact speed normal to the rail), e = .35, min = .25, surface }
   *   overlays damped hops along the rail's up-normal and emits an impact at every touchdown.
   */
  roll(points, o = {}) {
    let pts = filletPath(expandStroke(points), o.bend ?? 0);
    pts = [this.p.slice(), ...pts.slice(1)];
    const n = pts.length;
    const sAt = [0];
    for (let i = 1; i < n; i++) sAt.push(sAt[i - 1] + len(sub(pts[i], pts[i - 1])));
    const L = sAt[n - 1];
    const v0 = o.v0 ?? this.speed;
    let a = o.a;
    if (a === undefined) {
      if (o.vEnd !== undefined) a = (o.vEnd * o.vEnd - v0 * v0) / (2 * L);
      else a = ROLL_K * this.g * ((pts[0][1] - pts[n - 1][1]) / L) - (o.mu ?? 0) * this.g;
    }
    const T = timeForDistance(L, v0, a);
    if (!isFinite(T)) throw new Error(`marble ${this.id}: roll stops before the end (L=${L.toFixed(3)} v0=${v0.toFixed(3)} a=${a.toFixed(3)})`);
    const up = o.up ?? UP;
    const dirs = [], axes = [], Q = [this.q.slice()], ups = [];
    for (let i = 0; i < n - 1; i++) {
      const d = nrm(sub(pts[i + 1], pts[i]));
      dirs.push(d);
      ups.push(nrm(sub(up, mul(d, dot(up, d)))));
      axes.push(rollAxis(d, up));
      Q.push(rotBy(Q[i], axes[i], (sAt[i + 1] - sAt[i]) / this.r));
    }
    const seek = (s) => {
      let i = 0;
      while (i < n - 2 && sAt[i + 1] < s) i++;
      return i;
    };
    // hop overlay (damped parabolas along the local up-normal)
    const hops = [];
    if (o.hop && o.hop.v > 0) {
      const e = o.hop.e ?? 0.35, vmin = o.hop.min ?? 0.25;
      let tk = 0, vk = o.hop.v * e;
      while (vk > vmin && tk < T) {
        const d = (2 * vk) / this.g;
        hops.push({ t: tk, d, v: vk });
        tk += d;
        vk *= e;
      }
    }
    const hopH = (tau) => {
      for (const h of hops) if (tau >= h.t && tau < h.t + h.d) { const x = tau - h.t; return h.v * x - 0.5 * this.g * x * x; }
      return 0;
    };
    const t0 = this.t, r = this.r;
    const sOf = (tau) => clamp(v0 * tau + 0.5 * a * tau * tau, 0, L);
    const pos = (tau) => {
      const s = sOf(tau), i = seek(s);
      const k = sAt[i + 1] > sAt[i] ? (s - sAt[i]) / (sAt[i + 1] - sAt[i]) : 0;
      const p = add(pts[i], mul(sub(pts[i + 1], pts[i]), clamp(k)));
      const h = hops.length ? hopH(tau) : 0;
      return h ? add(p, mul(ups[i], h)) : p;
    };
    const rot = (tau) => {
      const s = sOf(tau), i = seek(s);
      return rotBy(Q[i], axes[i], (s - sAt[i]) / r);
    };
    // impacts for the hops (touchdowns)
    for (const h of hops) {
      const tt = t0 + h.t + h.d;
      if (tt < t0 + T) this.events.push({ kind: "impact", t: tt, surface: o.hop.surface ?? o.surface ?? "wood", speed: h.v, p: pos(h.t + h.d), id: this.id });
    }
    const vEnd = v0 + a * T;
    this.events.push({ kind: "roll", t0, t1: t0 + T, surface: o.surface ?? "wood", vMax: Math.max(v0, vEnd), v0, vEnd, id: this.id, p0x: (pts[0][0] + pts[n - 1][0]) / 2 });
    this._push({ kind: "roll", t0, t1: t0 + T, pos, rot, L, a, v0, sOf, pts });
    this.p = pts[n - 1].slice();
    this.v = mul(dirs[n - 2], vEnd);
    this.q = Q[n - 1];
    this.spin = { axis: axes[n - 2], rate: vEnd / r };
    return this;
  }

  /**
   * fall({ toY } | { to:[x,y,z] } | { toX }, { surface, impact = true }) — ballistic arc from the current state.
   *   toX: fly with the natural velocity until the centre reaches x (hitting a stop plate / backboard).
   *   to: solve the flight time from the vertical motion and set the horizontal velocity so it lands on `to`
   *   (the small "aim" cheat that lets jars and cups catch every marble). Emits an impact on landing.
   */
  fall(target, o = {}) {
    const g = this.g, p0 = this.p.slice();
    let v0 = this.v.slice();
    if (target.toX !== undefined) {
      const T = (target.toX - p0[0]) / v0[0];
      if (!(T > 0)) throw new Error(`marble ${this.id}: toX behind the marble`);
      target = { to: [target.toX, p0[1] + v0[1] * T - 0.5 * g * T * T, p0[2] + v0[2] * T] };
    }
    const ty = target.to ? target.to[1] : target.toY;
    const D = v0[1] * v0[1] + 2 * g * (p0[1] - ty);
    if (D < 0) throw new Error(`marble ${this.id}: fall target above apex`);
    const T = (v0[1] + Math.sqrt(D)) / g;
    if (target.to) v0 = [(target.to[0] - p0[0]) / T, v0[1], (target.to[2] - p0[2]) / T];
    const pos = (tau) => [p0[0] + v0[0] * tau, p0[1] + v0[1] * tau - 0.5 * g * tau * tau, p0[2] + v0[2] * tau];
    const q0 = this.q.slice(), sp = { ...this.spin };
    const rot = (tau) => rotBy(q0, sp.axis, sp.rate * tau);
    this._push({ kind: "fall", t0: this.t, t1: this.t + T, pos, rot });
    this.p = pos(T);
    this.v = [v0[0], v0[1] - g * T, v0[2]];
    this.q = rot(T);
    if (o.impact !== false) this.impact(o.surface ?? "wood", Math.abs(this.v[1]));
    return this;
  }

  /** bounce({ e = .4, min = .3, surface, spinKeep = .5 }) — damped vertical hops in place after a landing. */
  bounce(o = {}) {
    const g = this.g, e = o.e ?? 0.4, vmin = o.min ?? 0.3;
    const hops = [];
    let tk = 0, vk = Math.abs(this.v[1]) * e;
    while (vk > vmin) {
      const d = (2 * vk) / g;
      hops.push({ t: tk, d, v: vk });
      tk += d;
      vk *= e;
    }
    if (!hops.length) { this.v = [0, 0, 0]; return this; }
    const p0 = this.p.slice(), q0 = this.q.slice(), sp = { axis: this.spin.axis, rate: this.spin.rate * (o.spinKeep ?? 0.5) };
    const T = tk;
    const pos = (tau) => {
      for (const h of hops) if (tau >= h.t && tau < h.t + h.d) { const x = tau - h.t; return [p0[0], p0[1] + h.v * x - 0.5 * g * x * x, p0[2]]; }
      return p0;
    };
    // spin decays linearly to 0 over the hops: angle = rate·(τ − τ²/2T)
    const rot = (tau) => rotBy(q0, sp.axis, sp.rate * (Math.min(tau, T) - Math.min(tau, T) ** 2 / (2 * T)));
    for (const h of hops) this.events.push({ kind: "impact", t: this.t + h.t + h.d, surface: o.surface ?? "glass", speed: h.v, p: p0, id: this.id });
    this._push({ kind: "bounce", t0: this.t, t1: this.t + T, pos, rot });
    this.q = rot(T);
    this.v = [0, 0, 0];
    this.spin = { axis: sp.axis, rate: 0 };
    return this;
  }

  /**
   * rebound({ dir, amp, dur = .22, surface }) — after a clack: rolls `amp` metres along `dir` and back
   * (half-sine), with a second softer clack when it returns. Rotation follows the rolled distance.
   */
  rebound(o) {
    const dir = nrm(o.dir), A = o.amp, T = o.dur ?? 0.22, p0 = this.p.slice(), q0 = this.q.slice(), r = this.r;
    const axis = rollAxis(dir, o.up ?? UP);
    const d = (tau) => A * Math.sin(Math.PI * clamp(tau / T));
    const pos = (tau) => add(p0, mul(dir, d(tau)));
    const rot = (tau) => rotBy(q0, axis, d(tau) / r);
    this._push({ kind: "rebound", t0: this.t, t1: this.t + T, pos, rot });
    this.events.push({ kind: "impact", t: this.t, surface: o.surface ?? "glass", speed: (Math.PI * A) / T, p: p0, id: this.id, soft: true });
    this.v = [0, 0, 0];
    this.spin = { axis, rate: 0 };
    return this;
  }

  /**
   * custom(dur, { pos(τ) -> [x,y,z], dist(τ) -> rolled metres, axis, velEnd }) — any closed-form move; rotation =
   * axisAngle(axis, dist(τ)/r) applied on top of the current orientation. Used for coupled pushes and rolling over a lip.
   */
  custom(dur, o) {
    const q0 = this.q.slice(), r = this.r, axis = o.axis ?? [0, 0, 1];
    const pos = o.pos, dist = o.dist ?? (() => 0);
    const rot = (tau) => rotBy(q0, axis, dist(tau) / r);
    this._push({ kind: o.kind ?? "custom", t0: this.t, t1: this.t + dur, pos, rot });
    this.p = pos(dur);
    this.q = rot(dur);
    this.v = o.velEnd ?? [0, 0, 0];
    this.spin = { axis, rate: o.spinEnd ?? len(this.v) / r };
    return this;
  }

  /** at(t) -> { p, q, visible, seg } (pure; clamps before the start and after the end). */
  at(t) {
    const S = this.segs;
    if (!S.length || t < S[0].t0) return { p: S.length ? S[0].pos(0) : this.p, q: S.length ? S[0].rot(0) : this.q, visible: this.visibleBefore || t >= this.t0, seg: null };
    let lo = 0, hi = S.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (S[mid].t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    const s = S[lo];
    const tau = Math.min(t, s.t1) - s.t0;
    return { p: s.pos(tau), q: s.rot(tau), visible: true, seg: s.kind };
  }
  /** time of the first segment boundary / mark after t0 with the given kind (helper for choreography). */
  segEnd(i) { return this.segs[i]?.t1; }
}

// ---------------------------------------------------------------- lips, rows and stops (pure geometry)
/**
 * overLip({ C:[x,y,z], r, side = -1 }) — rolling over a sill/corner at C: centre = C + r·(cosφ, sinφ).
 *   side -1 = leaving towards −x (φ from φ0 > 0 up past π/2). Returns { at(φ), phiRest(yCentre) }.
 */
export function overLip({ C, r }) {
  return {
    at: (phi) => [C[0] + r * Math.cos(phi), C[1] + r * Math.sin(phi), C[2]],
    phiRest: (yCentre) => Math.asin(clamp((yCentre - C[1]) / r, -1, 1)),
  };
}

/** Invert a monotonic f on [a, b] (bisection, 40 steps — deterministic). */
export function invert(f, target, a, b) {
  const inc = f(b) > f(a);
  for (let k = 0; k < 40; k++) {
    const m = (a + b) / 2;
    if ((f(m) < target) === inc) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

// ---------------------------------------------------------------- scoring helpers (events -> kit SCORE)
/**
 * scoreFromEvents(events, { pan(x), voices }) -> SCORE entries using only kit voices:
 *   glass  (marble on marble / glass)  = high clack + short bright chime   ("tink-clack")
 *   wood   (marble on a wooden rail)   = low clack + small thud            ("knock")
 *   brass  (stop pin, sill, gate)      = mid clack + short metallic chime  ("tonk")
 *   roll   (rolling)                   = rumble (pitch rises with speed) + faint grit (paper)
 * Gains scale with impact speed. Same-ms events get distinct seeds.
 */
export function scoreFromEvents(events, o = {}) {
  const pan = o.pan ?? (() => 0);
  const G = { glass: 1, wood: 1, brass: 1, ...(o.gain ?? {}) };
  const out = [];
  let seed = 11;
  for (const e of events) {
    if (e.kind === "impact") {
      const k = clamp(Math.sqrt(e.speed / 2.5), 0.12, 1) * (e.soft ? 0.45 : 1);
      const x = pan(e.p[0]);
      seed += 7;
      if (e.surface === "glass") {
        out.push({ t: e.t, type: "clack", gain: 0.42 * k * G.glass, pitch: 2.1 + 0.15 * ((e.id * 3) % 4), pan: x, seed });
        out.push({ t: e.t, type: "chime", dur: 0.22, gain: 0.11 * k * G.glass, pitch: 2.4 + 0.12 * (e.id % 5), notes: 4, pan: x, seed: seed + 1 });
      } else if (e.surface === "brass") {
        out.push({ t: e.t, type: "clack", gain: 0.4 * k * G.brass, pitch: 1.45, pan: x, seed });
        out.push({ t: e.t, type: "chime", dur: 0.35, gain: 0.08 * k * G.brass, pitch: 1.25, notes: 4, pan: x, seed: seed + 1 });
      } else {
        out.push({ t: e.t, type: "clack", gain: 0.36 * k * G.wood, pitch: 0.62, pan: x, seed });
        out.push({ t: e.t, type: "thud", dur: 0.16, gain: 0.3 * k * G.wood, pitch: 2.6, pan: x, seed: seed + 1 });
      }
    } else if (e.kind === "roll" && e.t1 - e.t0 > 0.12) {
      const v = clamp(e.vMax / 3, 0.2, 1);
      seed += 7;
      const pitch = e.surface === "brass" ? 4.2 : e.surface === "glass" ? 5 : 3;
      out.push({ t: e.t0, type: "rumble", dur: e.t1 - e.t0 + 0.06, gain: (o.rollGain ?? 0.22) * v, pitch: pitch * (0.8 + 0.4 * v), pan: pan(e.p0x ?? 0), seed });
      if (e.surface !== "glass") out.push({ t: e.t0, type: "paper", dur: e.t1 - e.t0 + 0.04, gain: (o.gritGain ?? 0.035) * v, pitch: e.surface === "brass" ? 1.6 : 0.5, density: 0.9, pan: pan(e.p0x ?? 0), seed: seed + 1 });
    }
  }
  return out;
}

/** minSeparation: kit/schedule.js (promoted, identical; plans are { id, r, t0, at(t) -> { p } }). */
export { minSeparation } from "../../kit/schedule.js";
