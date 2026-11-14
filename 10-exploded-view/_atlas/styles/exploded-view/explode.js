// styles/exploded-view/explode.js — the explosion SCHEDULE, as pure functions (no THREE, no window, no DOM).
// Imported by style.js (to move the parts) AND by scene.config.js (so the SCORE is derived from the same
// schedule: one whoosh per separating part, one snap per reassembling part, screw clicks while they spin).
//
//   const P = explodePlan(PARTS, { outAt: 2.6, outStep: 0.16, backAt: 12.7, backStep: 0.09 });
//   explodeAmount(t, P.byId.lidar) -> 0 (assembled) .. 1 (exploded); overshoots past 1 on the way out,
//                                      rebounds slightly past 0 after the snap.
import { clamp, ease } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";

const X = STYLE_SPEC.explode;

/**
 * explodePlan(parts, opts) -> { parts: [rec], byId, outEnd, backEnd }
 *   parts: [{ id, offset (exploded distance along the axis, m; sign = direction), rank?, outDur?, backDur?,
 *             spin? (true for screws: turns while travelling), ... }]  (extra keys are kept)
 *   opts:  { outAt, outStep = .16, outDur = spec.explode.outDur, order = "outermost",
 *            backAt = Infinity, backStep = .09, backDur = spec.explode.backDur, overshoot, snap, screwTurns }
 *   Separation order: "outermost" sorts by |offset| (largest first; equal |offset| leave together) unless a part
 *   gives an explicit `rank` (0 = first). Reassembly runs the other way (innermost first) so the snap staggers
 *   outward. rec = { ...part, rank, out: {start, dur}, back: {start, dur}, settle (s: outBack first reaches 1) }.
 */
export function explodePlan(parts, o = {}) {
  const outStep = o.outStep ?? 0.16, backStep = o.backStep ?? 0.09;
  const mags = [...new Set(parts.map((p) => Math.abs(p.offset)))].sort((a, b) => b - a);
  const rankOf = (p) => p.rank ?? mags.indexOf(Math.abs(p.offset));
  const maxRank = Math.max(...parts.map(rankOf));
  const recs = parts.map((p) => {
    const rank = rankOf(p);
    const outDur = p.outDur ?? o.outDur ?? X.outDur;
    const backDur = p.backDur ?? o.backDur ?? X.backDur;
    const out = { start: (o.outAt ?? 0) + rank * outStep, dur: outDur };
    const back = { start: (o.backAt ?? Infinity) + (maxRank - rank) * backStep, dur: backDur };
    return { ...p, rank, out, back, settle: out.start + outDur * settleU(o.overshoot ?? X.overshoot) };
  });
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]));
  return {
    parts: recs,
    byId,
    opts: { overshoot: o.overshoot ?? X.overshoot, snap: o.snap ?? X.snap, screwTurns: o.screwTurns ?? X.screwTurns },
    outEnd: Math.max(...recs.map((r) => r.out.start + r.out.dur)),
    backEnd: Math.max(...recs.map((r) => r.back.start + r.back.dur)),
  };
}

/** u in 0..1 where outBack(u, s) first reaches 1 (the moment a part "arrives" before overshooting). */
export function settleU(s = 1.70158) {
  let lo = 0.2, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (ease.outBack(m, s) >= 1) hi = m; else lo = m;
  }
  return hi;
}

/**
 * explodeAmount(t, rec, plan?) -> amount (0 = at rest, 1 = fully exploded). Pure f(t).
 *   out: outBack(overshoot); back: 1 - inCubic, then a damped rebound of snap.amp metres (as a fraction of
 *   |offset|) at snap.freq rad/s decaying at snap.decay /s — the "snap".
 */
export function explodeAmount(t, rec, plan = null) {
  const s = plan?.opts?.overshoot ?? X.overshoot;
  const snap = plan?.opts?.snap ?? X.snap;
  if (t < rec.out.start) return 0;
  let a = ease.outBack(clamp((t - rec.out.start) / rec.out.dur), s);
  if (t >= rec.back.start) {
    const ub = (t - rec.back.start) / rec.back.dur;
    if (ub < 1) a *= 1 - ease.inCubic(clamp(ub));
    else {
      const dt = t - rec.back.start - rec.back.dur;
      a = (snap.amp / Math.max(0.5, Math.abs(rec.offset))) * Math.exp(-snap.decay * dt) * Math.sin(snap.freq * dt);
    }
  }
  return a;
}

/** screwAngle(t, rec, plan?) -> radians a screw has turned (counter-clockwise backing out); follows the amount. */
export function screwAngle(t, rec, plan = null) {
  const turns = plan?.opts?.screwTurns ?? X.screwTurns;
  return clamp(explodeAmount(t, rec, plan), -0.2, 1.2) * turns * Math.PI * 2;
}

/**
 * explodeCues(plan) -> { leave: [{id, t}], arrive: [{id, t}], snap: [{id, t}], spin: [{id, t0, t1}] }
 *   Sound/caption timing straight from the schedule: leave = out.start, arrive = settle, snap = back end,
 *   spin = the window a spinning part (screw) turns on the way out.
 */
export function explodeCues(plan) {
  const P = plan.parts;
  return {
    leave: P.map((r) => ({ id: r.id, t: r.out.start })),
    arrive: P.map((r) => ({ id: r.id, t: r.settle })),
    snap: P.filter((r) => Number.isFinite(r.back.start)).map((r) => ({ id: r.id, t: r.back.start + r.back.dur })),
    spin: P.filter((r) => r.spin).map((r) => ({ id: r.id, t0: r.out.start, t1: r.settle })),
  };
}
