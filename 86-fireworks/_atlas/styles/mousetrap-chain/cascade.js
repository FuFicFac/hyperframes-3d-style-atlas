// styles/mousetrap-chain/cascade.js — the chain-reaction planner for "Mousetrap Chain". Pure and Node-safe: no THREE,
// no window, no DOM; imports only kit/time.js. style.js reads the plan for the picture, scene.config.js reads the
// same plan for SCORE, beats and camera, so sound and picture agree by construction.
//
// The plan is an event-driven simulation run ONCE at load (seeded, no stepping at render time):
//   - a grid of set traps, each loaded with two balls; one ball is bounced in and lands on the first trap's pedal;
//   - a landing on a set trap snaps it (generation = the ball's generation + 1) and throws its two balls;
//   - every thrown ball is aimed at a set trap nobody else is aiming at (so generations double: 1, 2, 4, 8 ...)
//     until none are left; after that balls fly free;
//   - every ball then takes a few damped bounces and a short decelerating roll to rest. Each leg is a closed-form
//     ballistic arc, so ballAt(i, t) is a pure function of t;
//   - balls of the first `cleanGens` generations steer their bounces into the aisles so the doubling stays exact
//     while it is still countable; later balls are allowed to trip traps by accident (the eruption).
// Units: metres, seconds, Y up. Floor = XZ plane, +z toward the viewer. A trap's long axis is z: pedal on the +z
// half, the set hammer (with the two balls on it) on the -z half.
import { rng, clamp, smoothstep } from "../../kit/time.js";

const TAU = Math.PI * 2;

/** trapLayout(S) -> [{ i, c, r, x, z }] for spec.grid (row 0 = far, last row = nearest the viewer). */
export function trapLayout(S) {
  const G = S.grid, out = [];
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
    out.push({ i: out.length, c, r, x: (c - (G.cols - 1) / 2) * G.pitchX, z: (r - (G.rows - 1) / 2) * G.pitchZ });
  }
  return out;
}

/** gridBox(S, margin = 0) -> { min: [x, y, z], max: [x, y, z] } around every trap footprint. */
export function gridBox(S, margin = 0, top = S.trap.h) {
  const G = S.grid, T = S.trap;
  const hx = ((G.cols - 1) / 2) * G.pitchX + T.w / 2 + margin, hz = ((G.rows - 1) / 2) * G.pitchZ + T.l / 2 + margin;
  return { min: [-hx, 0, -hz], max: [hx, top, hz] };
}

/** hammerAngle(tau, S) -> radians (0 = set, lying on the -z half; PI = sprung, on the pedal), with a small rebound. */
export function hammerAngle(tau, S) {
  const H = S.trap.snap;
  if (!(tau > 0)) return 0;
  if (tau < H.dur) { const u = tau / H.dur; return Math.PI * u * u; }
  const s = tau - H.dur;
  return Math.PI - H.rebound * Math.exp(-s / H.decay) * Math.abs(Math.sin(s * H.rate));
}

/**
 * planCascade(S, overrides?) -> plan
 *   S = STYLE_SPEC (grid, trap, ball, cascade blocks).  overrides: any key of S.cascade (seed, first, t0 ...).
 *   plan = { traps, balls, events, gens, snapT, genOf, first, tEnd, tStorm, counts,
 *            ballAt(i, t, out) -> out {x, y, z, on}, trapPose(i, t, out) -> out {dx, dy, dz, yaw, angle},
 *            countsAt(t) -> [snapped traps per generation], heightAt(x, z), track(i) (for kit minSeparation) }
 *   events = [{ t, kind: "snap", trap, gen, x, z } | { t, kind: "tick", ball, speed, x, z, on: "trap"|"floor", n }]
 */
export function planCascade(S, overrides = {}) {
  const G = S.grid, TR = S.trap, B = S.ball;
  const C = { ...S.cascade, ...overrides };
  const g = C.gravity, r = B.r;
  const traps = trapLayout(S), n = traps.length;
  const bounds = gridBox(S, C.boundsMargin);
  const colX = (c) => (c - (G.cols - 1) / 2) * G.pitchX, rowZ = (q) => (q - (G.rows - 1) / 2) * G.pitchZ;
  const cell = (x, z) => {
    const c = Math.round(x / G.pitchX + (G.cols - 1) / 2), q = Math.round(z / G.pitchZ + (G.rows - 1) / 2);
    return c < 0 || c >= G.cols || q < 0 || q >= G.rows ? -1 : q * G.cols + c;
  };
  /** how far inside trap i's footprint (x, z) is (negative = outside) */
  const inside = (i, x, z) => Math.min(TR.w / 2 - Math.abs(x - traps[i].x), TR.l / 2 - Math.abs(z - traps[i].z));
  /** trap whose footprint (grown by margin) contains (x, z), or -1 */
  const trapAt = (x, z, margin = 0) => { const i = cell(x, z); return i >= 0 && inside(i, x, z) > -margin ? i : -1; };
  /** floor height under a ball centre: a smooth bump over every trap base (balls ride up onto the boards) */
  const heightAt = (x, z) => { const i = cell(x, z); return i < 0 ? 0 : TR.h * smoothstep(-0.03, 0.03, inside(i, x, z)); };

  const first = C.first[1] * G.cols + C.first[0];
  const seatY = TR.h + TR.seat + r, pedalY = TR.h + TR.pedalT + r;
  const pedalOf = (i) => [traps[i].x, pedalY, traps[i].z + TR.pedalZ];

  function simulate(codaBall) {
    const R = rng(C.seed);
    const snapT = new Array(n).fill(Infinity), genOf = new Array(n).fill(0), claimed = new Array(n).fill(false);
    const jit = traps.map((_, i) => { const q = rng(C.seed * 131 + i * 17 + 5); return { dx: q.range(-1, 1) * TR.snap.shift, dz: q.range(-1, 1) * TR.snap.shift, yaw: q.range(-1, 1) * TR.snap.yaw }; });
    const balls = [];
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      balls.push({ id: balls.length, trap: i, k, home: [traps[i].x + (k ? 1 : -1) * TR.seatX, seatY, traps[i].z + TR.seatZ], segs: [], gen: -1, t0: Infinity, bounces: 0, rest: null, tRest: Infinity, R: rng(C.seed * 977 + balls.length * 31 + 3) });
    }
    const events = [], Q = [];
    const pop = () => { let m = 0; for (let i = 1; i < Q.length; i++) if (Q[i].t < Q[m].t) m = i; return Q.splice(m, 1)[0]; };
    const okPoint = (x, z) => { const i = trapAt(x, z, C.aisleMargin); return i < 0 || snapT[i] < Infinity; };

    /** a ballistic leg from p0 to p1 taking tau seconds; queues the landing */
    function fly(b, T, p0, p1, tau) {
      const v = [(p1[0] - p0[0]) / tau, (p1[1] - p0[1] + 0.5 * g * tau * tau) / tau, (p1[2] - p0[2]) / tau];
      b.segs.push({ kind: "fly", t0: T, t1: T + tau, p0: [...p0], v });
      Q.push({ t: T + tau, ball: b.id, p: [...p1], v: [v[0], v[1] - g * tau, v[2]] });
    }
    /** where a bounce leaving p0 with velocity v comes down (on the floor or on a board) */
    function landing(p0, v) {
      let he = r, tau = 0, x = p0[0], z = p0[2];
      for (let k = 0; k < 3; k++) {
        tau = (v[1] + Math.sqrt(Math.max(0, v[1] * v[1] + 2 * g * (p0[1] - he)))) / g;
        x = p0[0] + v[0] * tau; z = p0[2] + v[2] * tau;
        he = r + heightAt(x, z);
      }
      return { tau: Math.max(tau, 0.02), p: [x, he, z] };
    }
    const keepIn = (p0, v) => {   // turn a leg that would leave the playing area back toward it
      const L = landing(p0, v);
      if (L.p[0] < bounds.min[0] || L.p[0] > bounds.max[0]) v[0] = -v[0];
      if (L.p[2] < bounds.min[2] || L.p[2] > bounds.max[2]) v[2] = -v[2];
      return v;
    };

    function snap(i, T, gen) {
      snapT[i] = T; genOf[i] = gen;
      events.push({ t: T, kind: "snap", trap: i, gen, x: traps[i].x, z: traps[i].z });
      const reach = C.reach[Math.min(gen, C.reach.length - 1)] ?? Infinity;
      let sibling = null;
      for (let k = 0; k < 2; k++) {
        const b = balls[i * 2 + k];
        b.gen = gen; b.t0 = T;
        // aim at a set trap nobody is aiming at
        const free = [];
        for (let j = 0; j < n; j++) if (!claimed[j] && snapT[j] === Infinity && j !== i) free.push(j);
        let target = -1;
        if (free.length) {
          const dist = (j) => Math.hypot(traps[j].x - traps[i].x, traps[j].z - traps[i].z);
          const fromFirst = (j) => Math.hypot(traps[j].x - traps[first].x, traps[j].z - traps[first].z);
          let cand = free.filter((j) => dist(j) >= C.throwMin && dist(j) <= C.throwMax && fromFirst(j) <= reach);
          if (sibling != null && cand.length > 1) {    // the two balls of one trap leave in clearly different directions
            const a0 = Math.atan2(traps[sibling].z - traps[i].z, traps[sibling].x - traps[i].x);
            const apart = cand.filter((j) => { let d = Math.abs(Math.atan2(traps[j].z - traps[i].z, traps[j].x - traps[i].x) - a0); if (d > Math.PI) d = TAU - d; return d > 1.2; });
            if (apart.length) cand = apart;
          }
          if (!cand.length) { free.sort((a, c) => dist(a) - dist(c)); cand = free.slice(0, 3); }
          target = R.pick(cand);
          claimed[target] = true; sibling = target;
        }
        if (target >= 0) {
          const p1 = pedalOf(target);
          p1[0] += R.range(-1, 1) * C.aimJitter; p1[2] += R.range(-1, 1) * C.aimJitter;
          const d = Math.hypot(p1[0] - b.home[0], p1[2] - b.home[2]);
          const base = C.flight[Math.min(gen, C.flight.length - 1)];
          const tau = base + C.flightPerMetre * d + R.range(-1, 1) * C.flightJitter * (gen >= 3 ? 1 : 0.35);
          fly(b, T, b.home, p1, Math.max(0.35, tau));
        } else {                                       // no set traps left: a free lob
          const a = R.range(0, TAU), d = R.range(C.free.dist[0], C.free.dist[1]);
          let x = b.home[0] + Math.cos(a) * d, z = b.home[2] + Math.sin(a) * d;
          x = clamp(x, bounds.min[0], bounds.max[0]); z = clamp(z, bounds.min[2], bounds.max[2]);
          fly(b, T, b.home, [x, r + heightAt(x, z), z], R.range(C.free.tau[0], C.free.tau[1]));
        }
      }
    }

    function roll(b, T, p, v) {
      const a0 = Math.atan2(v[2], v[0]);
      let end = [p[0], p[2]], dur = 0.3;
      for (let k = 0; k < 30; k++) {
        const a = k < 10 ? a0 + b.R.gaussian(0, 0.5) : b.R.range(0, TAU);
        const d = b.R.range(C.roll.dist[0], C.roll.dist[1]) * (k < 20 ? 1 : 0.4);
        end = [clamp(p[0] + Math.cos(a) * d, bounds.min[0], bounds.max[0]), clamp(p[2] + Math.sin(a) * d, bounds.min[2], bounds.max[2])];
        dur = b.R.range(C.roll.dur[0], C.roll.dur[1]);
        if (b.gen >= C.cleanGens || okPoint(end[0], end[1])) break;
      }
      b.segs.push({ kind: "roll", t0: T, t1: T + dur, a: [p[0], p[2]], b: end });
      b.rest = end; b.tRest = T + dur;
    }

    function onLand(ev) {
      const b = balls[ev.ball], [x, , z] = ev.p;
      const coda = b.id === codaBall;
      const ti = trapAt(x, z, 0);
      let hit = false;
      if (ti >= 0 && snapT[ti] === Infinity) { snap(ti, ev.t, b.gen + 1); hit = true; }
      const vyIn = -ev.v[1], vh = Math.hypot(ev.v[0], ev.v[2]);
      events.push({ t: ev.t, kind: "tick", ball: b.id, speed: Math.abs(vyIn), x, z, on: ti >= 0 ? "trap" : "floor", n: b.bounces });
      b.bounces++;
      let vy = vyIn * (coda ? C.coda.restitution : C.restitution * b.R.range(0.85, 1.1));
      if (hit) vy = Math.max(vy, C.kick * b.R.range(0.85, 1.15));
      if (b.bounces > (coda ? C.coda.bounces : C.bounces) || vy < C.minBounce) return roll(b, ev.t, ev.p, ev.v);
      const a0 = Math.atan2(ev.v[2], ev.v[0]);
      const clean = b.gen < C.cleanGens;
      let v = null, L = null;
      for (let k = 0; k < 40; k++) {
        const a = k < 12 ? a0 + b.R.gaussian(0, C.scatter) : b.R.range(0, TAU);
        const sp = Math.max(C.minSpeed, vh * (coda ? C.coda.friction : C.friction)) * b.R.range(0.6, 1.25);
        v = keepIn(ev.p, [Math.cos(a) * sp, vy, Math.sin(a) * sp]);
        L = landing(ev.p, v);
        if (!clean || okPoint(L.p[0], L.p[2])) break;
      }
      b.segs.push({ kind: "fly", t0: ev.t, t1: ev.t + L.tau, p0: [...ev.p], v });
      Q.push({ t: ev.t + L.tau, ball: b.id, p: L.p, v: [v[0], v[1] - g * L.tau, v[2]] });
    }

    // the one ball: bounced in from the side along an aisle (spec cascade.drop.hops), then onto the first trap's pedal
    const drop = { id: balls.length, trap: -1, k: 0, home: [0, -5, 0], segs: [], gen: 0, t0: C.drop.at, bounces: 1, rest: null, tRest: Infinity, R: rng(C.seed * 977 + 1) };
    balls.push(drop);
    {
      const D = C.drop, f = traps[first];
      const pts = D.hops.map((h) => [f.x + h.p[0] * G.pitchX, r, f.z + h.p[1] * G.pitchZ]);
      let p0 = [pts[0][0] + D.from[0], D.from[1], pts[0][2] + D.from[2]], T = D.at;
      D.hops.forEach((h, k) => {                       // hops along the floor (aisle crossings), each a tick
        const tau = h.t - T, p1 = pts[k];
        const v = [(p1[0] - p0[0]) / tau, (p1[1] - p0[1] + 0.5 * g * tau * tau) / tau, (p1[2] - p0[2]) / tau];
        drop.segs.push({ kind: "fly", t0: T, t1: h.t, p0, v });
        events.push({ t: h.t, kind: "tick", ball: drop.id, speed: Math.abs(v[1] - g * tau), x: p1[0], z: p1[2], on: "floor", n: k });
        p0 = p1; T = h.t;
      });
      fly(drop, T, p0, pedalOf(first), C.t0 - T);
    }
    while (Q.length) onLand(pop());

    // settle: push resting balls apart so none interpenetrate in the final frame
    const live = balls.filter((b) => b.rest);
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i].rest, c = live[j].rest;
        let dx = c[0] - a[0], dz = c[1] - a[1], d = Math.hypot(dx, dz);
        const need = 2 * r + 0.006;
        if (d >= need) continue;
        if (d < 1e-6) { dx = Math.cos(i * 2.399 + j); dz = Math.sin(i * 2.399 + j); d = 1; }
        const push = (need - d) / 2 + 1e-4;
        a[0] -= (dx / d) * push; a[1] -= (dz / d) * push; c[0] += (dx / d) * push; c[1] += (dz / d) * push;
        moved = true;
      }
      if (!moved) break;
    }
    return { snapT, genOf, balls, events, jit };
  }

  // pass 1 finds the ball that lands last from a throw; pass 2 gives it a long dribble (the coda before silence).
  let sim = simulate(-1);
  if (C.coda.on) {
    let last = -1, tl = -1;
    for (const b of sim.balls) if (b.trap >= 0 && b.segs.length && b.segs[0].t1 > tl) { tl = b.segs[0].t1; last = b.id; }
    sim = simulate(last);
    sim.coda = last;
  }
  const { snapT, genOf, balls, jit } = sim;
  const events = sim.events.sort((a, b) => a.t - b.t);
  const maxGen = Math.max(...genOf);
  const gens = [];
  for (let k = 0; k <= maxGen; k++) gens.push([]);
  traps.forEach((_, i) => { if (snapT[i] < Infinity) gens[genOf[i]].push(snapT[i]); });
  gens.forEach((a) => a.sort((x, y) => x - y));
  const tEnd = Math.max(...balls.map((b) => (b.tRest < Infinity ? b.tRest : 0)));

  /** ballAt(i, t, out?) -> { x, y, z, on }  (on = false while the dropped ball has not entered yet) */
  function ballAt(i, t, out = {}) {
    const b = balls[i];
    out.on = true;
    if (t < b.t0 || !b.segs.length) { out.x = b.home[0]; out.y = b.home[1]; out.z = b.home[2]; out.on = b.trap >= 0; return out; }
    let s = b.segs[0];
    for (let k = 1; k < b.segs.length && b.segs[k].t0 <= t; k++) s = b.segs[k];
    if (s.kind === "fly") {
      const u = Math.min(t, s.t1) - s.t0;
      out.x = s.p0[0] + s.v[0] * u; out.y = s.p0[1] + s.v[1] * u - 0.5 * g * u * u; out.z = s.p0[2] + s.v[2] * u;
    } else {
      const u = clamp((t - s.t0) / (s.t1 - s.t0)), k = 1 - (1 - u) * (1 - u);
      out.x = s.a[0] + (s.b[0] - s.a[0]) * k; out.z = s.a[1] + (s.b[1] - s.a[1]) * k;
      out.y = r + heightAt(out.x, out.z);
    }
    return out;
  }

  /** trapPose(i, t, out?) -> { dx, dy, dz, yaw, angle }: the hop + the small permanent shove of a snapped trap, hammer angle */
  function trapPose(i, t, out = {}) {
    const tau = t - snapT[i], H = TR.snap;
    if (!(tau > 0)) { out.dx = out.dy = out.dz = out.yaw = out.angle = 0; return out; }
    const k = 1 - Math.exp(-tau / H.settle), u = tau / H.hopDur;
    out.dx = jit[i].dx * k; out.dz = jit[i].dz * k; out.yaw = jit[i].yaw * k;
    out.dy = u < 1 ? H.hop * 4 * u * (1 - u) : 0;
    out.angle = hammerAngle(tau, S);
    return out;
  }

  /** countsAt(t) -> traps snapped so far, per generation (index 0 unused) */
  function countsAt(t) {
    return gens.map((a) => { let c = 0; while (c < a.length && a[c] <= t) c++; return c; });
  }
  const genTime = (k) => (gens[k] && gens[k].length ? gens[k][0] : Infinity);
  /** airborneAt(t) -> balls in a ballistic leg at t */
  const airborneAt = (t) => { let c = 0; for (const b of balls) for (const s of b.segs) if (s.kind === "fly" && s.t0 <= t && t < s.t1) { c++; break; } return c; };
  /** track(i) -> { id, r, t0, at(t) -> { p } } for kit/schedule.minSeparation */
  const track = (i) => ({ id: i, r, t0: balls[i].t0, at: (t) => { const o = ballAt(i, t); return { p: [o.x, o.y, o.z] }; } });

  return {
    traps, balls, events, gens, snapT, genOf, first, coda: sim.coda ?? -1, tEnd, maxGen,
    sprung: snapT.filter((t) => t < Infinity).length,
    counts: gens.map((a) => a.length),
    ballAt, trapPose, countsAt, genTime, airborneAt, heightAt, track,
  };
}

/**
 * soundEvents(plan, { snapBin, tickBin, minSpeed }) -> thinned events for kit/schedule.scoreFromEvents:
 *   one "snap" per snapBin window (count = traps in it) and one "tick" per tickBin window (count, loudest speed),
 *   so the eruption is a dense roar of distinct hits rather than hundreds of stacked identical ones.
 */
export function soundEvents(plan, o = {}) {
  const { snapBin = 0.02, tickBin = 0.03, minSpeed = 0.8 } = o;
  const out = [];
  const bins = new Map();
  for (const e of plan.events) {
    if (e.kind === "tick" && e.speed < minSpeed) continue;
    const w = e.kind === "snap" ? snapBin : tickBin;
    const key = `${e.kind}:${Math.floor(e.t / w)}`;
    const cur = bins.get(key);
    if (!cur) bins.set(key, { t: e.t, kind: e.kind, count: 1, speed: e.speed ?? 0, x: e.x, z: e.z, gen: e.gen ?? 0, on: e.on });
    else { cur.count++; if ((e.speed ?? 0) > cur.speed) { cur.speed = e.speed; cur.x = e.x; cur.on = e.on; } }
  }
  for (const v of bins.values()) out.push(v);
  return out.sort((a, b) => a.t - b.t);
}

/** cascadeVoices(sound) -> voices map for scoreFromEvents (sound = spec.sound). */
export function cascadeVoices(Q) {
  return {
    snap: (e, c) => {
      const k = Math.min(Q.snap.maxBoost, Math.sqrt(e.count));
      return [
        { type: "clack", gain: Q.snap.gain * k, pitch: Q.snap.pitch * (0.9 + 0.2 * ((e.gen * 37 + Math.round(e.t * 1000)) % 7) / 6), dur: 0.1 },
        { type: "thud", gain: Q.snap.body * k, pitch: 1.7, dur: 0.12 },
      ];
    },
    tick: (e, c) => {
      const k = Math.min(Q.tick.maxBoost, Math.sqrt(e.count)) * c.k(e.speed / 4.5, 0.25, 1);
      return [e.on === "trap"
        ? { type: "pop", gain: Q.tick.gain * k, pitch: Q.tick.pitchTrap * (0.92 + 0.16 * ((Math.round(e.t * 977)) % 5) / 4), dur: 0.05 }
        : { type: "tick", gain: Q.tick.gain * 1.25 * k, pitch: Q.tick.pitchFloor * (0.9 + 0.2 * ((Math.round(e.t * 613)) % 5) / 4), dur: 0.02 }];
    },
  };
}
