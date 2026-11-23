// styles/string-art/winding.js — the winding planner for "String Art". Pure functions: NO THREE, NO window, NO DOM
// (imports only kit/time.js), so scene.config.js imports it in Node too and SCORE comes from the same plan as the picture.
//
//   layoutBoard(spec.layout)            -> nails (deduplicated), fans (two nail rows from a corner, arms Lu/Lv or L), rings
//   fanSegs(L, fanId, indices, o)       -> nail-to-nail segments of a parabola fan (thread i: row v nail n-i -> row u nail i)
//   ringCycles(L, ringId, mult = 2)     -> closed cycles of the map m -> mult*m (mod N); each cycle = one continuous thread
//   ringSegs(L, ringId, o)              -> the cycles as segments (continuous inside a cycle, a hop between cycles)
//   createPlan(spec, L, runs)           -> { threads, winders, threadAt, tipAt, events, ... }
//
// A RUN is one winder (needle) laying a list of segments between t0 and t1:
//   { id, winder, color, t0, t1, segs: [{ a, b, hop?, kind? }], ease?: "inOutSine"|"linear", hopW?: metres-equivalent }
// `hop: true` on a segment means the needle lifts and travels to `a` before drawing it (no thread on the way).
// Time inside a run is spread by length (constant needle speed), with each hop costing hopW + 0.35 x its distance.
// Thread height: every thread gets z = z0 + order x dz by start time, so later threads sit on earlier ones.
import { clamp, ease } from "../../kit/time.js";

const key2 = (p) => `${Math.round(p[0] * 1000)}|${Math.round(p[1] * 1000)}`;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** layoutBoard(layout) -> { nails:[{ id, p:[x,y], group }], fans:{ id: { ...fan, rowU:[ids], rowV:[ids] } }, rings:{ id: { ...ring, ids:[ids] } } } */
export function layoutBoard(layout) {
  const nails = [], byKey = new Map();
  const add = (p, group) => {
    const k = key2(p);
    if (byKey.has(k)) return byKey.get(k);
    const id = nails.length;
    nails.push({ id, p: [p[0], p[1]], group });
    byKey.set(k, id);
    return id;
  };
  const fans = {}, rings = {};
  for (const f of layout.fans ?? []) {
    const rowU = [], rowV = [];
    const Lu = f.Lu ?? f.L, Lv = f.Lv ?? f.L;   // arm lengths (equal arms: L)
    for (let j = 0; j <= f.n; j++) {
      const su = (Lu * j) / f.n, sv = (Lv * j) / f.n;
      rowU.push(add([f.corner[0] + f.u[0] * su, f.corner[1] + f.u[1] * su], f.id));
      rowV.push(add([f.corner[0] + f.v[0] * sv, f.corner[1] + f.v[1] * sv], f.id));
    }
    fans[f.id] = { ...f, rowU, rowV };
  }
  for (const r of layout.rings ?? []) {
    const ids = [];
    for (let k = 0; k < r.N; k++) {
      const a = r.phase + (2 * Math.PI * k) / r.N;
      ids.push(add([r.center[0] + r.R * Math.cos(a), r.center[1] + r.R * Math.sin(a)], r.id));
    }
    rings[r.id] = { ...r, ids };
  }
  return { nails, fans, rings, P: (id) => nails[id].p };
}

/**
 * fanSegs(L, fanId, indices, { mode = "separate" | "zigzag" }) -> segments.
 * Thread i (1..n-1) joins row-V nail (n - i) to row-U nail i; the envelope is a parabola tangent to both rows.
 * "separate": each thread is its own strand (the needle hops between them, starting at the end nearest the last one).
 * "zigzag": one continuous thread — alternate directions, joined by short runs along the nail row (kind "arm").
 */
export function fanSegs(L, fanId, indices, o = {}) {
  const f = L.fans[fanId], mode = o.mode ?? "separate";
  const out = [];
  let last = null, dir = 0;
  for (const i of indices) {
    let a = f.rowV[f.n - i], b = f.rowU[i];
    if (mode === "zigzag") {
      if (dir % 2 === 1) [a, b] = [b, a];
      if (last != null && last !== a) out.push({ a: last, b: a, kind: "arm", fan: fanId });
      out.push({ a, b, kind: "thread", fan: fanId, i });
      dir++;
    } else {
      if (last != null && dist(L.P(last), L.P(b)) < dist(L.P(last), L.P(a))) [a, b] = [b, a];
      out.push({ a, b, kind: "thread", fan: fanId, i, hop: last != null });
    }
    last = out[out.length - 1].b;
  }
  return out;
}

/** ringCycles(L, ringId, mult = 2) -> [[k0, k1, ...]] closed cycles of k -> mult*k mod N (k = 0 is the fixed point, skipped) */
export function ringCycles(L, ringId, mult = 2) {
  const r = L.rings[ringId], N = r.N, seen = new Uint8Array(N), out = [];
  seen[0] = 1;
  for (let k = 1; k < N; k++) {
    if (seen[k]) continue;
    const cyc = [];
    let m = k;
    while (!seen[m]) { seen[m] = 1; cyc.push(m); m = (m * mult) % N; }
    if (m !== k) throw new Error(`string-art: k -> ${mult}k mod ${N} is not a permutation (use N odd / coprime to mult)`);
    out.push(cyc);
  }
  return out;
}

/** ringSegs(L, ringId, { mult = 2, order }) -> segments: each cycle continuous (k -> 2k -> 4k ... -> k), hop between cycles */
export function ringSegs(L, ringId, o = {}) {
  const r = L.rings[ringId];
  let cycles = ringCycles(L, ringId, o.mult ?? 2);
  if (o.order) cycles = o.order.map((i) => cycles[i]);
  const out = [];
  cycles.forEach((cyc, ci) => {
    for (let j = 0; j < cyc.length; j++) {
      const k = cyc[j], k2 = cyc[(j + 1) % cyc.length];
      out.push({ a: r.ids[k], b: r.ids[k2], kind: "chord", ring: ringId, k, cycle: ci, hop: j === 0 && ci > 0 });
    }
  });
  return out;
}

/**
 * createPlan(spec, L, runs) -> plan
 *   plan.threads[i] = { id, run, winder, color, a:[x,y], b:[x,y], na, nb, kind, z, t0, t1, idx, order, len }
 *   plan.threadAt(i, t) -> drawn fraction 0..1 (the run's ease inside each segment)
 *   plan.tipAt(winder, t) -> { p:[x,y,z], dir:[dx,dy], alpha, drawing, color } | null
 *   plan.events() -> [{ kind: "pluck"|"lift"|"runStart"|"runEnd", t, ... }] for SCORE (scoreFromEvents)
 */
export function createPlan(spec, L, runs) {
  const T = spec.thread, N = spec.needle;
  const threads = [], hops = [];
  const runInfo = runs.map((run) => {
    const hopW = run.hopW ?? 0.5;
    const items = [];
    let prevB = null;
    for (const s of run.segs) {
      const A = L.P(s.a), B = L.P(s.b);
      if (s.hop && prevB != null) items.push({ type: "hop", from: prevB, to: s.a, w: hopW + 0.35 * dist(L.P(prevB), A) });
      items.push({ type: "seg", s, w: Math.max(0.02, dist(A, B)) });
      prevB = s.b;
    }
    const W = items.reduce((acc, it) => acc + it.w, 0), span = run.t1 - run.t0;
    let t = run.t0;
    const segIdx = [];
    for (const it of items) {
      const dt = (it.w / W) * span;
      if (it.type === "seg") {
        const s = it.s;
        threads.push({
          id: threads.length, run: run.id, winder: run.winder, color: run.color, kind: s.kind ?? "thread",
          a: L.P(s.a), b: L.P(s.b), na: s.a, nb: s.b, t0: t, t1: t + dt, len: dist(L.P(s.a), L.P(s.b)),
          ease: run.ease ?? "linear", idx: segIdx.length, i: s.i ?? s.k ?? segIdx.length, cycle: s.cycle ?? 0,
          strandStart: segIdx.length === 0 || !!s.hop,
        });
        segIdx.push(threads.length - 1);
      } else hops.push({ run: run.id, winder: run.winder, from: it.from, to: it.to, t0: t, t1: t + dt });
      t += dt;
    }
    return { ...run, threads: segIdx };
  });
  // winding order -> height
  const byStart = threads.map((th) => th.id).sort((p, q) => threads[p].t0 - threads[q].t0 || p - q);
  byStart.forEach((id, order) => { threads[id].order = order; threads[id].z = T.z0 + order * T.dz; });

  const threadAt = (i, t) => {
    const th = threads[i];
    if (t <= th.t0) return 0;
    if (t >= th.t1) return 1;
    return ease[th.ease]((t - th.t0) / (th.t1 - th.t0));
  };

  const winders = [...new Set(runs.map((r) => r.winder))];
  // tipAt: the needle point of a winder at t (drawing, hopping, or parked at a run's ends while fading)
  const tipAt = (w, t) => {
    const rs = runInfo.filter((r) => r.winder === w && r.threads.length);
    for (const r of rs) {
      const first = threads[r.threads[0]], last = threads[r.threads[r.threads.length - 1]];
      if (t < r.t0 - N.fadeIn || t > r.t1 + N.fadeOut) continue;
      const alpha = Math.min(clamp((t - (r.t0 - N.fadeIn)) / N.fadeIn), clamp((r.t1 + N.fadeOut - t) / N.fadeOut));
      if (t < r.t0) {
        const u = clamp((t - (r.t0 - N.fadeIn)) / N.fadeIn);
        return { p: [first.a[0], first.a[1], first.z + N.lift * (1 - ease.outCubic(u))], dir: dirOf(first), alpha, drawing: false, color: r.color };
      }
      if (t > r.t1) {
        const u = clamp((t - r.t1) / N.fadeOut);
        return { p: [last.b[0], last.b[1], last.z + N.lift * ease.inCubic(u)], dir: dirOf(last), alpha, drawing: false, color: r.color };
      }
      for (const id of r.threads) {
        const th = threads[id];
        if (t >= th.t0 && t <= th.t1) {
          const f = threadAt(id, t);
          return { p: [th.a[0] + (th.b[0] - th.a[0]) * f, th.a[1] + (th.b[1] - th.a[1]) * f, th.z], dir: dirOf(th), alpha, drawing: true, color: r.color, thread: id };
        }
      }
      for (const h of hops) {
        if (h.run !== r.id || t < h.t0 || t > h.t1) continue;
        const u = ease.inOutSine((t - h.t0) / (h.t1 - h.t0)), A = L.P(h.from), B = L.P(h.to);
        const zA = threads.find((th) => th.run === r.id && th.t1 <= h.t0 + 1e-9 && th.nb === h.from)?.z ?? T.z0;
        const lift = N.lift * Math.sin(Math.PI * u) + 0.01;
        const d = [B[0] - A[0], B[1] - A[1]], m = Math.hypot(d[0], d[1]) || 1;
        return { p: [A[0] + d[0] * u, A[1] + d[1] * u, zA + lift], dir: [d[0] / m, d[1] / m], alpha, drawing: false, color: r.color };
      }
    }
    return null;
  };

  const events = () => {
    const ev = [];
    for (const r of runInfo) {
      if (!r.threads.length) continue;
      ev.push({ kind: "runStart", t: r.t0, run: r.id, winder: r.winder, n: r.threads.length });
      const n = r.threads.length;
      r.threads.forEach((id, j) => {
        const th = threads[id];
        ev.push({ kind: "pluck", t: th.t1, run: r.id, thread: id, j, n, rate: n / Math.max(0.1, r.t1 - r.t0), len: th.len, x: th.b[0], y: th.b[1], segKind: th.kind });
      });
      ev.push({ kind: "runEnd", t: r.t1, run: r.id, winder: r.winder, n });
    }
    for (const h of hops) ev.push({ kind: "lift", t: h.t0, run: h.run, dur: h.t1 - h.t0 });
    return ev.sort((p, q) => p.t - q.t);
  };

  return { L, threads, hops, runs: runInfo, winders, threadAt, tipAt, events, n: threads.length };
}

function dirOf(th) {
  const d = [th.b[0] - th.a[0], th.b[1] - th.a[1]], m = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / m, d[1] / m];
}

/** stringVoices(spec.sound) -> voices for kit/schedule.scoreFromEvents: plucks rise in pitch with the thread index */
export function stringVoices(S) {
  const P = S.pluck, steps = P.steps;
  const hzAt = (j, n) => P.hz * Math.pow(2, steps[Math.min(steps.length - 1, Math.floor((j / Math.max(1, n)) * steps.length))] / 12);
  return {
    pluck: (e) => {
      if (e.segKind === "arm") return [{ type: "tick", gain: S.tick.gain * 0.6 }];
      // dense runs: thin the plucks (every few threads) and soften them, keep a tick for the rest
      const every = e.rate > 14 ? 3 : e.rate > 6 ? 2 : 1;
      if (e.j % every !== 0) return [{ type: "tick", gain: S.tick.gain * 0.7 }];
      const g = P.gain * (e.rate > 6 ? 0.55 : 1);
      return [{ type: "pluck", hz: hzAt(e.j, e.n), decay: P.decay * (e.rate > 6 ? 0.6 : 1), bright: P.bright, dur: 1.1, gain: g }];
    },
    lift: (e) => (e.dur > 0.12 ? [{ type: "tick", gain: S.tick.gain * 0.5 }] : []),
    runStart: () => [{ type: "tick", gain: S.tick.gain }],
    runEnd: () => [],
  };
}
