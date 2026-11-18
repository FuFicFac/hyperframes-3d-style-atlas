// styles/pinball-table/pinplan.js — the pinball planner. Pure functions: NO THREE, no window, no DOM.
// Imported by style.js (picture) and by a scene's scene.config.js (camera, framing gate and SCORE), so the ball, the
// flippers, the lamps, the score reels and every sound come from ONE plan.
//
//   script (contact schedule) --planBall--> segments + events --> ball pos(t), flipperAngle(side, t), plungerOffset(t)
//   events --lampPlan rules--> lamp level(id, t)          events --reelPlan--> reel roll(k, t), value(t), pulses
//   events + pulses --pinballVoices / scoreFromEvents--> SCORE
//
// Field frame (see spec.js): x across, v up the table from the flipper end, h above the surface. Ball centre = h + r.
import { clamp, lerp, ease } from "../../kit/time.js";
import { framingReport, projectPoint, sampleCameraKeys } from "../../kit/framing.js";
export { framingReport, sampleCameraKeys, projectPoint };

const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const len = (a) => Math.hypot(a[0], a[1]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// ------------------------------------------------------------------------------------------------ layout
/**
 * layout(S) -> resolved field geometry (field frame), shared by picture, planner and framing:
 *   { r, flippers: { L, R }, bumpers: { id: { c, r, cap } }, slings: { L, R: { A, B, C, n } }, bank: { c, n, t, targets },
 *     orbit, ramp: { pts (dense [x, v, h]), cum, length, plasticEnd (arc length where the wire starts) }, lamps: [{ ...def, at }] }
 */
export function layout(S) {
  const r = S.table.ballR, F = S.flipper;
  const flippers = {};
  for (const side of ["L", "R"]) {
    const sx = side === "L" ? -1 : 1;
    flippers[side] = { side, sx, pivot: [sx * F.pivotX, F.v], len: F.len, rp: F.rp, rt: F.rt, rest: F.restDeg * D2R, up: F.upDeg * D2R };
  }
  const bumpers = Object.fromEntries(S.bumpers.list.map((b) => [b.id, { id: b.id, c: b.at.slice(), r: S.bumpers.r, cap: b.cap, word: b.word }]));
  const slings = {};
  for (const side of ["L", "R"]) {
    const m = side === "L" ? 1 : -1, L = S.slings.L;
    const A = [L.A[0] * m, L.A[1]], B = [L.B[0] * m, L.B[1]], C = [L.C[0] * m, L.C[1]];
    const e = sub(C, B);
    let n = nrm([e[1], -e[0]]);
    if (dot(n, sub(A, B)) > 0) n = mul(n, -1);         // face normal points away from the triangle
    slings[side] = { side, A, B, C, n };
  }
  const K = S.bank;
  const bn = nrm(sub(K.aimAt, K.c));
  const bt = [-bn[1], bn[0]][0] > 0 ? [-bn[1], bn[0]] : [bn[1], -bn[0]];   // reading direction: left to right
  const targets = K.letters.map((letter, k) => ({ k, letter, c: add(K.c, mul(bt, (k - (K.letters.length - 1) / 2) * K.pitch)) }));
  const bank = { c: K.c.slice(), n: bn, t: bt, targets };
  // ramp: up-leg, hairpin, return; densified with arc length
  const R = S.ramp, pts = [];
  R.up.forEach((p) => pts.push(p.slice()));
  const turnN = 18;
  for (let i = 0; i <= turnN; i++) {
    const a = (i / turnN) * Math.PI;
    pts.push([R.turn.c[0] + Math.cos(a) * R.turn.r, R.turn.c[1] + Math.sin(a) * R.turn.r, R.turn.h]);
  }
  const plasticIdx = pts.length - 1 + R.wireFrom;
  R.down.forEach((p) => pts.push(p.slice()));
  const dense = densify(pts, 0.02);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
  // arc length at the plastic/wire joint
  let plasticEnd = 0;
  { const P = pts[plasticIdx]; let best = Infinity; dense.forEach((q, i) => { const d = Math.hypot(q[0] - P[0], q[1] - P[1]); if (d < best) { best = d; plasticEnd = cum[i]; } }); }
  const ramp = { pts: dense, cum, length: cum[cum.length - 1], plasticEnd, corners: pts };
  // lamps
  const ring = S.ring, nRing = S.lamps.filter((l) => l.ring != null).length;
  const lamps = S.lamps.map((d) => {
    let at = d.at;
    if (d.bankIndex != null) at = add(targets[d.bankIndex].c, mul(bn, K.insertOff));
    if (d.ring != null) {
      const a = (ring.from + ((ring.to - ring.from) * d.ring) / Math.max(1, nRing - 1)) * D2R;
      at = [ring.c[0] + Math.cos(a) * ring.r, ring.c[1] + Math.sin(a) * ring.r];
    }
    return { ...d, at };
  });
  return { r, flippers, bumpers, slings, bank, orbit: S.orbit, shooter: S.shooter, lane: S.leftLane, inlane: S.inlane, ramp, lamps };
}

function densify(pts, step) {
  const out = [pts[0].slice()];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), lerp(a[2], b[2], k / n)]);
  }
  return out;
}

/** pathAt(ramp, s) -> [x, v, h] at arc length s (clamped). Binary search over the cumulative table. */
export function pathAt(P, s) {
  s = clamp(s, 0, P.length);
  let lo = 0, hi = P.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] <= s) lo = m; else hi = m; }
  const u = (s - P.cum[lo]) / Math.max(1e-9, P.cum[hi] - P.cum[lo]);
  const a = P.pts[lo], b = P.pts[hi];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

// ------------------------------------------------------------------------------------------------ flippers
/** flipperShape(tau, F, hold) -> 0..1: snap up (outQuad, F.rise), hold, fall back (inQuad, F.fall). */
export function flipperShape(tau, F, hold = F.hold) {
  if (tau < 0) return 0;
  if (tau < F.rise) return ease.outQuad(tau / F.rise);
  if (tau < F.rise + hold) return 1;
  const u = (tau - F.rise - hold) / F.fall;
  return u >= 1 ? 0 : 1 - ease.inQuad(u);
}
/** flipperAngleFrom(flips, S, side, t) -> the left-equivalent angle (radians, field plane, CCW from +x) */
export function flipperAngleFrom(flips, S, side, t) {
  const F = S.flipper;
  let k = 0;
  for (const f of flips) if (f.side === side) k = Math.max(k, flipperShape(t - f.t, F, f.hold ?? F.hold));
  return lerp(F.restDeg * D2R, F.upDeg * D2R, k);
}
/** flipperAxis(fl, a) -> { dir, nrm } in the field plane (nrm = the up-table face). Right flipper mirrors the left. */
export function flipperAxis(fl, a) {
  return fl.sx < 0 ? { dir: [Math.cos(a), Math.sin(a)], nrm: [-Math.sin(a), Math.cos(a)] } : { dir: [-Math.cos(a), Math.sin(a)], nrm: [Math.sin(a), Math.cos(a)] };
}
/** flipperFace(fl, d, a, r) -> ball-centre point resting on the flipper's up-table face, d metres from the pivot. */
export function flipperFace(fl, d, a, r) {
  const { dir, nrm: n } = flipperAxis(fl, a);
  const rad = lerp(fl.rp, fl.rt, clamp(d / fl.len));
  return add(add(fl.pivot, mul(dir, d)), mul(n, rad + r));
}

// ------------------------------------------------------------------------------------------------ the ball plan
/** profile f(u) = u + k u (1 - u): constant acceleration; k > 0 slows down, k < 0 speeds up (|k| <= 1). */
const prof = (u, k) => u + k * u * (1 - u);
function profInv(q, k) {
  if (Math.abs(k) < 1e-6) return q;
  const b = 1 + k, disc = Math.max(0, b * b - 4 * k * q);
  return (b - Math.sqrt(disc)) / (2 * k);
}

/**
 * planBall(S, script, { flips = [] }) -> plan
 *   script: an ordered contact schedule. Each step advances the clock:
 *     { do: "plunger", pull: [t0, t1], release }                 ball waits on the plunger tip; pulled back; launched at release
 *     { do: "fly", to, dur, end?, marks? }                      ballistic arc on the tilted field to `to` in `dur` s
 *     { do: "orbit", to (deg), dur, k?, marks?: [{ at (deg), ...event }] }   roll around the orbit rail
 *     { do: "ramp", dur, k?, marks?: [{ s (0..1 of length) | at: "wire" | "top", ...event }] }   roll the ramp path
 *     { do: "flip", side, d?, ride = .03, hold? }               flipper fires now; the ball rides its face for `ride` s
 *     { do: "hold", dur? }                                      ball rests (to the end if no dur)
 *   targets `to`: { pt: [x, v] } | { orbit: deg } | { bumper: id, ang: deg } | { sling: side, u } | { bank: k (float target index) }
 *              | { flipper: side, d } (on the face at the angle it has on arrival) | { lane: v } | { inlane: side, v } | { ramp: 0 | 1 }
 *   end / marks: event objects ({ kind, id, ... }) emitted at the step end / at the mark (fly marks: { v } crossings).
 *   opts.flips: extra flipper actions not tied to the ball ([{ side, t, hold }], e.g. a cradle hold to the end).
 * Returns { lay, segs, events, flips, pos(t) -> [x, v, h], flipperAngle(side, t), plungerOffset(t), end }.
 */
export function planBall(S, script, opts = {}) {
  const lay = layout(S), r = lay.r, G = S.table.G, F = S.flipper;
  const flips = (opts.flips ?? []).map((f) => ({ ...f }));
  const segs = [], events = [];
  const angle = (side, t) => flipperAngleFrom(flips, S, side, t);
  const sh = S.shooter;
  let t = 0, p = [sh.x, sh.rest, 0], plunger = null;
  const resolve = (to, tEnd) => {
    if (to.pt) return [to.pt[0], to.pt[1], to.h ?? 0];
    if (to.orbit != null) { const a = to.orbit * D2R; return [lay.orbit.c[0] + Math.cos(a) * lay.orbit.R, lay.orbit.c[1] + Math.sin(a) * lay.orbit.R, 0]; }
    if (to.bumper) { const b = lay.bumpers[to.bumper], a = to.ang * D2R; return [b.c[0] + Math.cos(a) * (b.r + r), b.c[1] + Math.sin(a) * (b.r + r), 0]; }
    if (to.sling) { const s = lay.slings[to.sling], q = add(add(s.B, mul(sub(s.C, s.B), to.u ?? 0.5)), mul(s.n, S.slings.rubber + 0.004 + r)); return [q[0], q[1], 0]; }
    if (to.bank != null) { const B = lay.bank, q = add(add(B.c, mul(B.t, (to.bank - (B.targets.length - 1) / 2) * S.bank.pitch)), mul(B.n, S.bank.d / 2 + r)); return [q[0], q[1], 0]; }
    if (to.flipper) { const q = flipperFace(lay.flippers[to.flipper], to.d, angle(to.flipper, tEnd), r); return [q[0], q[1], 0]; }
    if (to.lane != null) return [lay.lane.x, to.lane, 0];
    if (to.inlane) return [(to.inlane === "L" ? -1 : 1) * lay.inlane.x, to.v, 0];
    if (to.ramp != null) return pathAt(lay.ramp, to.ramp * lay.ramp.length);
    throw new Error("pinplan: unknown target " + JSON.stringify(to));
  };
  const emit = (e, tt, at) => {
    if (!e) return;
    for (const x of Array.isArray(e) ? e : [e]) { const { dt = 0, ...rest } = x; events.push({ ...rest, t: tt + dt, at: at ? at.slice() : undefined }); }
  };

  for (const st of script) {
    if (st.do === "plunger") {
      const rest = p.slice(), dist = sh.pull;
      plunger = { pull: st.pull, release: st.release, dist };
      const off = (tt) => plungerOffsetFrom(plunger, tt);
      segs.push({ t0: t, t1: st.release, kind: "plunger", roll: false, eval: (tt) => [rest[0], rest[1] - Math.max(0, off(tt)), 0] });
      emit({ kind: "pull", dur: st.pull[1] - st.pull[0] }, st.pull[0]);
      emit({ kind: "launch" }, st.release);
      t = st.release;
      p = [rest[0], rest[1] - dist, 0];
    } else if (st.do === "fly") {
      const T = st.dur, q = resolve(st.to, t + T), p0 = p.slice(), t0 = t;
      const a = [0, -G];
      const v0 = [(q[0] - p0[0]) / T - 0.5 * a[0] * T, (q[1] - p0[1]) / T - 0.5 * a[1] * T];
      const ev = (tt) => { const s = clamp(tt - t0, 0, T); return [p0[0] + v0[0] * s + 0.5 * a[0] * s * s, p0[1] + v0[1] * s + 0.5 * a[1] * s * s, lerp(p0[2], q[2], s / T)]; };
      segs.push({ t0, t1: t0 + T, kind: "fly", roll: (st.roll ?? true) && p0[2] < 0.005 && q[2] < 0.005, eval: ev, v0, a });
      for (const m of st.marks ?? []) {
        // first time the ball crosses v = m.v (quadratic in s)
        const A = 0.5 * a[1], Bq = v0[1], C = p0[1] - m.v;
        let s = null;
        if (Math.abs(A) < 1e-9) s = -C / Bq;
        else { const D = Bq * Bq - 4 * A * C; if (D >= 0) { const r1 = (-Bq - Math.sqrt(D)) / (2 * A), r2 = (-Bq + Math.sqrt(D)) / (2 * A); s = [r1, r2].filter((x) => x >= 0 && x <= T).sort((x, y) => x - y)[0] ?? null; } }
        if (s != null) emit(strip(m), t0 + s, ev(t0 + s));
      }
      t = t0 + T; p = q;
      emit(st.end, t, q);
    } else if (st.do === "orbit") {
      const O = lay.orbit, t0 = t, T = st.dur, k = st.k ?? 0;
      const a0 = Math.atan2(p[1] - O.c[1], p[0] - O.c[0]), a1 = st.to * D2R;
      const ev = (tt) => { const u = prof(clamp((tt - t0) / T), k), a = lerp(a0, a1, u); return [O.c[0] + Math.cos(a) * O.R, O.c[1] + Math.sin(a) * O.R, 0]; };
      segs.push({ t0, t1: t0 + T, kind: "orbit", roll: true, eval: ev });
      for (const m of st.marks ?? []) { const q = ((m.at * D2R) - a0) / (a1 - a0); if (q >= 0 && q <= 1) { const tt = t0 + profInv(q, k) * T; emit(strip(m), tt, ev(tt)); } }
      t = t0 + T; p = ev(t);
      emit(st.end, t, p);
    } else if (st.do === "ramp") {
      const P = lay.ramp, t0 = t, T = st.dur, k = st.k ?? 0;
      const fracOf = (x) => (x === "wire" ? P.plasticEnd / P.length : x === "top" ? topFrac(P) : x);
      const f0 = fracOf(st.from ?? 0), f1 = fracOf(st.to ?? 1);
      const ev = (tt) => pathAt(P, lerp(f0, f1, prof(clamp((tt - t0) / T), k)) * P.length);
      segs.push({ t0, t1: t0 + T, kind: "ramp", roll: false, eval: ev });
      for (const m of st.marks ?? []) {
        const q = (fracOf(m.at ?? m.s) - f0) / (f1 - f0);
        if (q < 0 || q > 1) continue;
        const tt = t0 + profInv(q, k) * T;
        emit(strip(m), tt, ev(tt));
      }
      t = t0 + T; p = ev(t);
      emit(st.end, t, p);
    } else if (st.do === "flip") {
      const fl = lay.flippers[st.side], hold = st.hold ?? F.hold, t0 = t, ride = st.ride ?? 0.03;
      flips.push({ side: st.side, t: t0, hold });
      // distance along the flipper where the ball sits now
      const rel = sub([p[0], p[1]], fl.pivot), ax = flipperAxis(fl, angle(st.side, t0 - 1e-6));
      const d = st.d ?? clamp(dot(rel, ax.dir), 0.02, fl.len);
      const ev = (tt) => { const q = flipperFace(fl, d, angle(st.side, clamp(tt, t0, t0 + ride)), r); return [q[0], q[1], 0]; };
      segs.push({ t0, t1: t0 + ride, kind: "ride", roll: false, eval: ev });
      emit({ kind: "flip", side: st.side, ...(st.event ?? {}) }, t0);
      t = t0 + ride; p = ev(t);
    } else if (st.do === "raise") {
      // a flipper action that does not touch the ball now (a cradle catch, or a hold to the end)
      flips.push({ side: st.side, t: t + (st.dt ?? 0), hold: st.hold ?? F.hold });
      emit({ kind: "flip", side: st.side, quiet: !!st.quiet }, t + (st.dt ?? 0));
    } else if (st.do === "ride") {
      // the ball sits on a flipper face at distance d and follows it (cradled, or carried down as the flipper drops)
      const fl = lay.flippers[st.side], t0 = t, T = st.dur;
      const rel = sub([p[0], p[1]], fl.pivot), ax = flipperAxis(fl, angle(st.side, t0));
      const d = st.d ?? clamp(dot(rel, ax.dir), 0.02, fl.len);
      const ev = (tt) => { const q = flipperFace(fl, d, angle(st.side, clamp(tt, t0, t0 + T)), r); return [q[0], q[1], 0]; };
      segs.push({ t0, t1: t0 + T, kind: "ride", roll: false, eval: ev });
      t = t0 + T; p = ev(t);
    } else if (st.do === "hold") {
      const q = p.slice(), t0 = t, T = st.dur ?? Infinity;
      segs.push({ t0, t1: t0 + T, kind: "hold", roll: false, eval: () => q.slice() });
      t = t0 + T;
      emit(st.end, t, q);
    } else throw new Error("pinplan: unknown step " + st.do);
  }
  events.sort((a, b) => a.t - b.t);
  const plan = {
    lay, segs, events, flips, plunger, end: t,
    pos(tt) {
      if (tt <= segs[0].t0) return segs[0].eval(segs[0].t0);
      for (let i = segs.length - 1; i >= 0; i--) if (tt >= segs[i].t0) return segs[i].eval(Math.min(tt, segs[i].t1));
      return segs[0].eval(segs[0].t0);
    },
    flipperAngle: (side, tt) => angle(side, tt),
    plungerOffset: (tt) => (plunger ? plungerOffsetFrom(plunger, tt) : 0),
  };
  return plan;
}
const strip = (m) => { const { v, at, s, ...e } = m; return { ...e, ...(typeof at === "string" ? { mark: at } : {}) }; };
function topFrac(P) { let best = 0, idx = 0; P.pts.forEach((q, i) => { if (q[1] > best) { best = q[1]; idx = i; } }); return P.cum[idx] / P.length; }

/** plunger offset (metres pulled back toward the player): eased pull, hold, a fast release with a small rebound. */
export function plungerOffsetFrom(pl, t) {
  const [a, b] = pl.pull;
  if (t < a) return 0;
  if (t < b) return pl.dist * ease.inOutSine((t - a) / (b - a));
  if (t < pl.release) return pl.dist;
  const s = t - pl.release, snap = 0.035;
  if (s < snap) return pl.dist * (1 - ease.inQuad(s / snap));
  const w = s - snap;
  return -pl.dist * 0.18 * Math.sin(w * 55) * Math.exp(-w * 18);
}

// ------------------------------------------------------------------------------------------------ verification
/**
 * clearance(plan, S, { dt, t0, t1 }) -> { worst: { d, t, obj }, hits: [...] }: the ball must not pass THROUGH a pop
 *   bumper, a drop target that is still up, or a post, except within `near` s of a planned contact with it.
 */
export function clearance(plan, S, o = {}) {
  const { dt = 1 / 240, t0 = 0, t1 = plan.end, near = 0.03, dropTimes = {} } = o;
  const lay = plan.lay, r = lay.r;
  const obs = [
    ...Object.values(lay.bumpers).map((b) => ({ id: `bumper:${b.id}`, c: b.c, R: b.r + r * 0.97, kinds: ["bumper"], match: b.id })),
    ...S.posts.map((p, i) => ({ id: `post:${i}`, c: p, R: 0.02 + r * 0.98 })),
  ];
  const contacts = plan.events.filter((e) => e.at);
  let worst = { d: Infinity };
  const hits = [];
  for (let t = Math.max(t0, 0); t <= Math.min(t1, plan.end === Infinity ? t1 : plan.end); t += dt) {
    const p = plan.pos(t);
    if (p[2] > 0.02) continue;                                     // up on the ramp
    for (const ob of obs) {
      const d = Math.hypot(p[0] - ob.c[0], p[1] - ob.c[1]) - ob.R;
      if (d >= 0) continue;
      const ok = contacts.some((e) => Math.abs(e.t - t) <= near && (ob.kinds ?? []).includes(e.kind) && e.id === ob.match);
      if (!ok) { hits.push({ t: +t.toFixed(3), obj: ob.id, d: +d.toFixed(4) }); if (d < worst.d) worst = { d, t, obj: ob.id }; }
    }
  }
  void dropTimes;
  return { ok: hits.length === 0, worst, hits };
}

// ------------------------------------------------------------------------------------------------ contact pulses
/** pulse(times, t, { rise = .012, decay = .1 }) -> 0..1: the strongest recent contact (kick rings, sling rubbers, rollovers). */
export function pulse(times, t, o = {}) {
  const { rise = 0.012, decay = 0.1 } = o;
  let k = 0;
  for (const tc of times) {
    if (t < tc) continue;
    const s = t - tc;
    k = Math.max(k, s < rise ? s / rise : Math.exp(-(s - rise) / decay));
  }
  return k;
}
/** dropFrac(tDrop, t, fall) -> 0..1: a drop target sinking (accelerating) with a small bottom bounce. */
export function dropFrac(tDrop, t, fall = 0.075) {
  if (!(t >= tDrop)) return 0;
  const s = t - tDrop;
  if (s < fall) return ease.inQuad(s / fall);
  const w = s - fall;
  return 1 - 0.06 * Math.abs(Math.sin(w * 40)) * Math.exp(-w * 25);
}

// ------------------------------------------------------------------------------------------------ lamps
/**
 * lampPlan(rules) -> { level(id, t) }: insert lamp levels as a pure function of time (1 = fully lit; flashes add on top).
 *   rules: [{ id | ids, type, ... }]
 *     base  { level }                       resting level (bumper caps idle at ~.55)
 *     on    { t, fade = .05 }               latched on from t        off { t }   latched off from t
 *     blink { from, to, hz = 4, duty = .5 } override inside the window (next-shot arrows, completion blinks)
 *     chase { ids (ordered), from, to, rate = 8 (steps/s), tail = 1.5, keep = false }  a running light along ids
 *     flash { t, amt = 1.2, dur = .16 }     an exponential flash added on top (contacts)
 */
export function lampPlan(rules) {
  const by = new Map();
  const put = (id, r) => { if (!by.has(id)) by.set(id, []); by.get(id).push(r); };
  for (const r of rules) {
    if (r.type === "chase") r.ids.forEach((id, i) => put(id, { ...r, index: i, n: r.ids.length }));
    else (r.ids ?? [r.id]).forEach((id) => put(id, r));
  }
  for (const list of by.values()) list.sort((a, b) => (a.t ?? a.from ?? 0) - (b.t ?? b.from ?? 0));
  function level(id, t) {
    const list = by.get(id);
    if (!list) return 0;
    let L = 0, base = 0, latch = null;
    for (const r of list) {
      if (r.type === "base") base = r.level;
      else if ((r.type === "on" || r.type === "off") && t >= r.t) latch = r;
    }
    L = base;
    if (latch && latch.type === "on") L = Math.max(base, clamp((t - latch.t) / (latch.fade ?? 0.05)));
    for (const r of list) {
      if (r.type === "blink" && t >= r.from && t < r.to) {
        const ph = ((t - r.from) * (r.hz ?? 4)) % 1;
        const duty = r.duty ?? 0.5;
        L = ph < duty ? clamp(ph / 0.04) : clamp(1 - (ph - duty) / 0.06);
        if (r.floor != null) L = Math.max(L, r.floor);
      } else if (r.type === "chase" && t >= r.from && t < r.to) {
        const ph = (t - r.from) * (r.rate ?? 8);
        const d = (((ph - r.index) % r.n) + r.n) % r.n;
        const c = d < 1 ? 1 : Math.max(0, 1 - (d - 1) / (r.tail ?? 1.5));
        L = r.keep ? Math.max(L, c) : c;
      }
    }
    for (const r of list) if (r.type === "flash" && t >= r.t) L += (r.amt ?? 1.2) * Math.exp(-(t - r.t) / (r.dur ?? 0.16));
    return L;
  }
  return { level, ids: [...by.keys()] };
}

// ------------------------------------------------------------------------------------------------ score reels
/**
 * reelPlan(awards, { reels = 6, gap = .085, roll = .07, start = 0 }) -> { pulses, roll(k, t), value(t), final }
 *   awards: [{ t, reel, n }] (n pulses of 10^reel). Pulses queue like an EM score motor: each >= gap after the last.
 *   roll(k, t): reel k's position in digit steps (fractional while rolling, small overshoot) — angle = roll * 36 deg.
 */
export function reelPlan(awards, o = {}) {
  const { reels = 6, gap = 0.085, roll = 0.07, start = 0 } = o;
  const req = [];
  awards.slice().sort((a, b) => a.t - b.t).forEach((a) => { for (let i = 0; i < a.n; i++) req.push({ t: a.t, reel: a.reel, src: a.kind }); });
  const pulses = [];
  let last = -Infinity, S = start;
  for (const q of req) {
    const tp = Math.max(q.t + 0.02, last + gap);
    last = tp;
    const before = S, after = S + 10 ** q.reel;
    S = after;
    const steps = [];
    for (let k = 0; k < reels; k++) steps.push(Math.floor(after / 10 ** k) - Math.floor(before / 10 ** k));
    pulses.push({ t: tp, reel: q.reel, steps, total: after, src: q.src });
  }
  const back = (u) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; };
  const base = (k) => Math.floor(start / 10 ** k);
  return {
    pulses,
    final: S,
    roll(k, t) {
      let v = base(k);
      for (const p of pulses) {
        if (t < p.t) break;
        if (!p.steps[k]) continue;
        v += p.steps[k] * (t >= p.t + roll ? 1 : back(clamp((t - p.t) / roll)));
      }
      return v;
    },
    value(t) { let v = start; for (const p of pulses) { if (t < p.t + roll) break; v = p.total; } return v; },
  };
}
/** awardsFromEvents(events, S) -> [{ t, reel, n, kind }] using spec.score.awards { kind: [reel, n] } */
export function awardsFromEvents(events, S) {
  const A = S.score.awards, out = [];
  for (const e of events) { const a = A[e.kind]; if (a) out.push({ t: e.t, reel: a[0], n: a[1], kind: e.kind }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ world mapping + shots
/** fieldToWorld(S, [x, v, h]) -> world [x, y, z] (the field's near-edge centre is the world origin; tilted about X). */
export function fieldToWorld(S, p) {
  const a = S.table.tiltDeg * D2R, c = Math.cos(a), s = Math.sin(a);
  const h = p[2] ?? 0;
  return [p[0], h * c + p[1] * s, h * s - p[1] * c];
}
/** backglassFrame(S) -> { center, bottom, w, h } world placement of the backglass panel (upright, facing +Z). */
export function backglassFrame(S) {
  const T = S.table, BG = S.backglass;
  const far = fieldToWorld(S, [0, T.L + T.wallT, T.wallH]);
  const bottom = [0, far[1] + BG.lift, far[2] - BG.back];
  return { bottom, center: [0, bottom[1] + BG.h / 2, bottom[2]], w: BG.w, h: BG.h };
}
/**
 * fieldShot(pts, { elev, azim = 0, fov, aspect = 16/9, safe = .85, shift = [0, 0] }) -> { pos, target, fov }
 *   Fits world points inside |NDC| <= safe from a view direction (elev/azim radians, camera on the +Z side for azim 0),
 *   aiming at the points' box centre, then nudged so that centre lands at `shift` (NDC). Binary search on distance.
 */
export function fieldShot(pts, o = {}) {
  const { elev = 0.6, azim = 0, fov = 36, aspect = 16 / 9, safe = 0.85 } = o;
  const shift = o.shift ?? [0, 0];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  const c = mn.map((v, k) => (v + mx[k]) / 2);
  const dir = [Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)];
  const f = [-dir[0], -dir[1], -dir[2]];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n3 = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const rgt = n3(cr(f, [0, 1, 0])), up = cr(rgt, f);
  const th = Math.tan((fov * Math.PI) / 360);
  const make = (d) => {
    const ox = shift[0] * th * aspect * d, oy = shift[1] * th * d;
    const tgt = [0, 1, 2].map((k) => c[k] - rgt[k] * ox - up[k] * oy);
    return { pos: tgt.map((v, k) => v + dir[k] * d), target: tgt, fov };
  };
  const fits = (d) => { const cam = make(d); return pts.every((p) => { const [x, y, z] = projectPoint(cam, p, aspect); return z > 0 && Math.abs(x) <= safe && Math.abs(y) <= safe; }); };
  let lo = 0.1, hi = 30;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  const cam = make(hi);
  return { pos: cam.pos.map((v) => +v.toFixed(5)), target: cam.target.map((v) => +v.toFixed(5)), fov };
}

// ------------------------------------------------------------------------------------------------ sound
/**
 * pinballVoices(sound) -> voices for kit/schedule.scoreFromEvents: one entry per event kind. Pulses (reel steps) sound a
 * reel click plus a chime pitched by the reel; completions ring the bell.
 */
export function pinballVoices(Snd) {
  const g = (k, f = 1) => (Snd[k]?.gain ?? 0.3) * f;
  return {
    pull: (e) => [{ type: "servo", dur: Math.max(0.3, e.dur), hz: 160, hz2: 300, grit: 0.7, gain: g("pull") }],
    launch: () => [
      { type: "thud", dur: 0.32, pitch: 1.25, gain: g("launch") },
      { type: "clack", dur: 0.12, pitch: 0.7, gain: g("launch", 0.7) },
      { type: "whoosh", dir: "out", dur: 0.45, gain: g("launch", 0.25) },
    ],
    rollover: () => [{ type: "click", pitch: 1.35, gain: g("rollover") }, { type: "click", pitch: 1.05, gain: g("rollover", 0.6), offset: 0.03 }],
    bumper: () => [
      { type: "thud", dur: 0.22, pitch: 1.7, gain: g("bumper") },
      { type: "clack", dur: 0.12, pitch: 0.85, gain: g("bumper", 0.8) },
      { type: "pop", dur: 0.07, pitch: 0.55, gain: g("bumper", 0.25) },
    ],
    sling: () => [{ type: "clack", dur: 0.12, pitch: 0.75, gain: g("sling") }, { type: "thud", dur: 0.18, pitch: 1.5, gain: g("sling", 0.7) }],
    target: () => [{ type: "clack", dur: 0.1, pitch: 1.25, gain: g("target") }, { type: "thud", dur: 0.15, pitch: 1.9, gain: g("target", 0.5), offset: 0.02 }],
    flip: () => [{ type: "clack", dur: 0.12, pitch: 0.6, gain: g("flip") }, { type: "thud", dur: 0.14, pitch: 1.2, gain: g("flip", 0.6) }],
    rampEnter: () => [{ type: "whoosh", dir: "in", dur: 0.5, gain: g("ramp", 0.6) }, { type: "click", pitch: 0.8, gain: g("ramp", 0.8) }],
    wire: () => [{ type: "clack", dur: 0.1, pitch: 2.1, gain: g("wire") }, { type: "click", pitch: 1.8, gain: g("wire", 0.7), offset: 0.05 }],
    land: () => [{ type: "thud", dur: 0.16, pitch: 2.3, gain: g("wire", 0.9) }, { type: "click", pitch: 1.2, gain: g("wire", 0.5) }],
    pulse: (e) => [
      { type: "click", dur: 0.03, pitch: 0.9, gain: g("reel") },
      { type: "chime", dur: 0.9, pitch: (Snd.chime.pitch[e.reel] ?? 1), gain: g("chime") },
    ],
    bell: () => [
      { type: "chime", dur: 2.4, pitch: Snd.bell.pitch, gain: g("bell") },
      { type: "chime", dur: 2.2, pitch: Snd.bell.pitch * 1.0045, gain: g("bell", 0.7), offset: 0.004 },
    ],
  };
}
/** rollScore(plan, Snd, { minDur = .3 }) -> rumble entries for every rolling-on-the-field segment (ball noise). */
export function rollScore(plan, Snd, o = {}) {
  const { minDur = 0.3, end = Infinity } = o;
  return plan.segs.filter((s) => s.roll && s.t1 - s.t0 >= minDur && s.t0 < end).map((s, i) => ({
    t: s.t0, type: "rumble", dur: Math.min(s.t1, end) - s.t0, pitch: 1.6, gain: Snd.roll.gain, seed: 500 + i * 13,
  }));
}
