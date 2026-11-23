// styles/snap-through/snap.js — the ONE plan of the "Snap-Through" style (pure: no THREE, no window, no DOM; Node-safe).
// A shallow bistable arch modelled as the classic shallow two-bar (von Mises) arch. With the crown state v (crown height
// c = -v * rise; v = -1 is the bowed-up rest state, v = +1 the flipped rest state) the normalised load that holds the
// arch in place is
//     Q(v) = v^3 - v            (dQ/dv = 0 at v = -1/sqrt(3): the LIMIT POINT, Qmax = 2 / (3 sqrt 3))
// Each weight adds the same load. Below Qmax the arch sits on the near branch (v in [-1, -1/sqrt 3]); past Qmax there
// is no near equilibrium, so it jumps to the far branch (v > 1) — the snap. Removing every weight only brings it back
// to v = +1: the far branch never reaches back past the limit, so there is no small step back.
// From the rig numbers and a schedule (landing times, lift times) this module derives
//   - the crown state v(t): a small damped settle after each load step, a creep + under-damped ring at the snap;
//   - the stack of weights on the tray: carried by the tray, then ballistic (free fall + restitution) when the tray
//     drops away at the snap, re-launched by the ring, until it sticks — precomputed contact by contact;
//   - every weight's pose (ready stack -> arc -> drop down the post; lift up the post -> arc back);
//   - the dial needle (the same deflection) and every sound event.
// style.js reads the plan for the picture; scene.config.js turns plan.events() into SCORE with snapVoices().
import { clamp, spring } from "../../kit/time.js";

export const QMAX = 2 / (3 * Math.sqrt(3));
export const V_LIMIT = -1 / Math.sqrt(3);
/** loadOf(v) -> normalised load that holds crown state v (shallow two-bar arch) */
export const loadOf = (v) => v * v * v - v;

/** solve v^3 - v = Q on [lo, hi] where it is increasing (bisection, 80 steps: exact to double precision) */
function solve(Q, lo, hi) {
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (loadOf(m) < Q) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
/** nearBranch(Q) -> v on the bowed-up branch, or null past the limit load */
export const nearBranch = (Q) => (Q > QMAX ? null : solve(Q, -1, V_LIMIT));
/** farBranch(Q) -> v on the flipped branch (Q >= 0) */
export const farBranch = (Q) => solve(Q, 1, 3);

const sineIO = (u) => { const c = clamp(u, 0, 1); return -(Math.cos(Math.PI * c) - 1) / 2; };
const bez = (a, b, c, d, u) => {
  const m = 1 - u;
  return [0, 1, 2].map((i) => m * m * m * a[i] + 3 * m * m * u * b[i] + 3 * m * u * u * c[i] + u * u * u * d[i]);
};

/**
 * createPlan({ rig, schedule: { lands: [t x weights placed], lifts: [t x weights removed] }, end }) -> plan
 *   rig = STYLE_SPEC.rig. lands[k] = the instant weight k (k = 0..) comes to rest on the stack; the first landing whose
 *   load passes Qmax is the snap. lifts[r] = the instant removal r starts (top of the tray stack first).
 *   plan = { v(t), crown(t) (m above the clamp line), trayTop(t), profile(s) (0..1 shape along the span),
 *            dial(t) (rad), dialLimit (rad), onTray(t), pose(d, t) -> { p:[x,y,z], rx, rz, ry }, air(t),
 *            snapT, snapGo, levels: [{ n, Q, v }], hops: [{ t, dv }], events(), rig, end }
 */
export function createPlan({ rig: R, schedule, end }) {
  const h = R.rise, W = R.weight, nW = W.count, wt = W.thick;
  const lands = schedule.lands, lifts = schedule.lifts;
  if (lifts.length > lands.length) throw new Error("snap-through: more lifts than weights placed");
  if (lands.length > nW - 1) throw new Error("snap-through: the ready stack must keep at least one weight");
  const perWeight = QMAX / R.weightsToLimit;           // weightsToLimit = 5.05: five weights hold, the sixth snaps

  // ---- load steps -> static crown states (near branch until it fails, far branch after)
  const steps = [];                                      // { t, n, Q, v, kind: "add"|"snap"|"remove" }
  let snapT = Infinity, flipped = false, n = 0;
  const seq = [...lands.map((t) => ({ t, d: 1 })), ...lifts.map((t) => ({ t, d: -1 }))].sort((a, b) => a.t - b.t);
  for (const e of seq) {
    n += e.d;
    const Q = n * perWeight;
    let v = flipped ? farBranch(Q) : nearBranch(Q), kind = e.d > 0 ? "add" : "remove";
    if (v === null) { v = farBranch(Q); flipped = true; kind = "snap"; snapT = e.t; }
    steps.push({ t: e.t, n, Q, v, kind });
  }
  const v0 = -1;
  const SN = R.snap, ST = R.settle;
  const snapGo = snapT + SN.creep;                       // the creep ends, the arch goes

  /** v(t): crown state. Settles are damped springs from the previous static state (closed form). */
  function v(t) {
    let prev = v0, cur = null;
    for (const s of steps) { if (s.t > t) break; if (cur) prev = cur.v; cur = s; }
    if (!cur) return v0;
    const tau = t - cur.t;
    if (cur.kind === "snap") {
      if (tau < SN.creep) return prev + (V_LIMIT - prev) * sineIO(tau / SN.creep);   // eases to rest at the limit point
      return V_LIMIT + (cur.v - V_LIMIT) * spring(tau - SN.creep, SN.spring);
    }
    return prev + (cur.v - prev) * spring(tau, ST);
  }
  const crown = (t) => -v(t) * h;
  const trayTop = (t) => R.clampY + crown(t) + R.strip.thick / 2 + R.tray.saddle + R.tray.thick;   // saddle block + tray plate
  const profile = (s) => (Math.abs(s) >= R.span / 2 ? 0 : (1 + Math.cos((2 * Math.PI * s) / R.span)) / 2);
  const onTray = (t) => lands.filter((x) => x <= t).length - lifts.filter((x) => x <= t).length;
  const dial = (t) => (2 * Math.PI * (v(t) + 1)) / R.dial.rev;
  const dialLimit = (2 * Math.PI * (V_LIMIT + 1)) / R.dial.rev;

  // ---- ballistic stack after the snap: free fall under g, contact with the tray, restitution, until it sticks
  const g = R.g, e = R.hop.restitution;
  const dTray = (t) => (trayTop(t + 1e-4) - trayTop(t - 1e-4)) / 2e-4;
  const arcs = [];                                       // [{ t0, t1, y0, v0 }] airborne pieces of the stack bottom
  const hops = [];                                       // contacts: { t, dv } (relative impact speed, for sound)
  let stickT = Infinity;
  if (Number.isFinite(snapT)) {
    let t0 = snapGo, y0 = trayTop(snapGo), vy0 = 0;           // at rest at the limit point (the creep ends at zero speed)
    const yAt = (a, t) => a.y0 + a.v0 * (t - a.t0) - 0.5 * g * (t - a.t0) ** 2;
    for (let k = 0; k < R.hop.maxContacts; k++) {
      const a = { t0, y0, v0: vy0, t1: Infinity };
      let t = t0 + 1e-4, hit = null;
      const tMax = t0 + 3;
      for (; t < tMax; t += 2e-4) if (yAt(a, t) <= trayTop(t)) { hit = t; break; }
      if (hit === null) break;
      let lo = hit - 2e-4, hi = hit;                  // refine the contact instant
      for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (yAt(a, m) <= trayTop(m)) hi = m; else lo = m; }
      a.t1 = hi; arcs.push(a);
      const vs = a.v0 - g * (hi - a.t0), vt = dTray(hi), rel = vt - vs;     // rel > 0: tray catches the stack
      hops.push({ t: hi, dv: rel });
      const out = vt + e * rel;
      if (e * rel < R.hop.stickSpeed) { stickT = hi; break; }
      t0 = hi; y0 = trayTop(hi); vy0 = out;
    }
    if (!Number.isFinite(stickT)) stickT = arcs.length ? arcs[arcs.length - 1].t1 : snapGo;
  }
  /** stackBottom(t) -> y of the bottom of the tray stack (the tray top when carried) */
  function stackBottom(t) {
    for (const a of arcs) if (t >= a.t0 && t < a.t1) return a.y0 + a.v0 * (t - a.t0) - 0.5 * g * (t - a.t0) ** 2;
    return trayTop(t);
  }
  const air = (t) => Math.max(0, stackBottom(t) - trayTop(t));

  // ---- weights: ready stack -> tray (placement j takes disc nW-1-j) and back (removal r takes disc 1+r)
  const RD = R.ready, F = R.flight;
  const readyAt = (level) => [RD.x, RD.baseY + (level + 0.5) * wt, RD.z];
  const postTop = (t) => trayTop(t) + R.post.height;
  // static tray state just BEFORE landing j (j weights already on, settled)
  const staticTray = (count) => R.clampY - (count ? steps.filter((s) => s.kind === "add")[count - 1]?.v ?? v0 : v0) * h + R.strip.thick / 2 + R.tray.saddle + R.tray.thick;
  const place = lands.map((land, j) => {
    const top = staticTray(j);
    const yLand = top + (j + 0.5) * wt;
    const H = [0, top + R.post.height + F.hover + wt / 2, 0];
    const fall = Math.sqrt((2 * (H[1] - yLand)) / g);
    const hoverT = land - fall, t0 = hoverT - F.place;
    return { j, d: nW - 1 - j, land, yLand, H, fall, hoverT, t0 };
  });
  const remove = lifts.map((t0, r) => {
    const level = lands.length - 1 - r, d = nW - 1 - level;
    return { r, d, level, t0, t1: t0 + F.remove, back: readyAt(d) };
  });
  const tilt = (d, a) => {                               // small seeded-by-index wobble while airborne
    const s1 = Math.sin(d * 2.399 + 0.7), s2 = Math.cos(d * 1.711 + 0.3);
    return { rx: a * R.hop.tilt * s1, rz: a * R.hop.tilt * s2, ry: a * R.hop.spin * (d % 2 ? 1 : -1) };
  };

  /** pose(d, t) -> { p: [x, y, z] (disc centre), rx, ry, rz } for disc d (0 = bottom of the ready stack) */
  function pose(d, t) {
    const rest = { p: readyAt(d), rx: 0, ry: 0, rz: 0 };
    const P = place.find((q) => q.d === d), M = remove.find((q) => q.d === d);
    if (!P || t < P.t0) return rest;
    if (t < P.hoverT) {
      const u = sineIO((t - P.t0) / F.place), S = readyAt(d);
      const top = Math.max(S[1] + F.arc, P.H[1]);   // rise first, cross high (clear of the pedestals), then settle over the post
      const p = bez(S, [S[0], top, S[2]], [P.H[0], top, P.H[2]], P.H, u);
      const k = Math.sin(Math.PI * u);
      return { p, rx: 0, ry: k * 0.6, rz: -k * 0.08 };
    }
    if (t < P.land) return { p: [0, P.H[1] - 0.5 * g * (t - P.hoverT) ** 2, 0], rx: 0, ry: 0, rz: 0 };
    if (!M || t < M.t0) {
      const a = air(t), y = stackBottom(t) + (P.j + 0.5) * wt + P.j * R.hop.spread * a;
      return { p: [0, y, 0], ...tilt(d, a) };
    }
    if (t < M.t1) {
      const s = (t - M.t0) / F.remove, from = [0, trayTop(M.t0) + (M.level + 0.5) * wt, 0];
      const up = [0, postTop(M.t0) + F.hover + wt / 2, 0];
      if (s < F.liftShare) return { p: [0, from[1] + (up[1] - from[1]) * sineIO(s / F.liftShare), 0], rx: 0, ry: 0, rz: 0 };
      const u = sineIO((s - F.liftShare) / (1 - F.liftShare));
      const top = Math.max(up[1], M.back[1] + F.arc);
      const p = bez(up, [up[0], top, up[2]], [M.back[0], top, M.back[2]], M.back, u);
      const k = Math.sin(Math.PI * u);
      return { p, rx: 0, ry: -k * 0.6, rz: k * 0.08 };
    }
    return rest;
  }

  const levels = [{ n: 0, Q: 0, v: v0 }, ...steps.map((s) => ({ n: s.n, Q: s.Q, v: s.v, kind: s.kind, t: s.t }))];

  /** events(): every sound cue, from the same schedule and contacts as the picture */
  const events = () => {
    const ev = [];
    // the held tone: one pad segment per load level before the snap (rising), one low changed tone after it
    const adds = steps.filter((s) => s.kind === "add");
    const bounds = [0, ...adds.map((s) => s.t), Number.isFinite(snapT) ? snapT : end];
    for (let i = 0; i + 1 < bounds.length; i++) ev.push({ t: bounds[i], kind: "tone", step: i, dur: bounds[i + 1] - bounds[i] + 0.6 });
    if (Number.isFinite(snapT)) ev.push({ t: snapT, kind: "after", dur: end - snapT });
    for (const q of place) ev.push({ t: q.t0, kind: "pick", d: q.d, x: R.ready.x }, { t: q.land, kind: q.land === snapT ? "lastClink" : "clink", j: q.j, x: 0 });
    if (Number.isFinite(snapT)) ev.push({ t: snapGo, kind: "snap", x: 0 });
    hops.forEach((c, i) => ev.push({ t: c.t, kind: "hop", i, dv: c.dv, x: 0 }));
    for (const m of remove) ev.push({ t: m.t0, kind: "lift", r: m.r, x: 0 }, { t: m.t1, kind: "setDown", r: m.r, x: R.ready.x });
    return ev.filter((x) => x.t < end).sort((a, b) => a.t - b.t);
  };

  return {
    v, crown, trayTop, postTop, profile, onTray, dial, dialLimit, pose, air, stackBottom,
    snapT, snapGo, stickT, steps, levels, hops, arcs, place, remove, perWeight, events, rig: R, end,
  };
}

/** snapVoices(STYLE_SPEC.sound) -> voices for kit/schedule.scoreFromEvents */
export function snapVoices(S) {
  const tone = S.tone, after = S.after;
  return {
    tone: (e) => [{ type: "pad", dur: e.dur, gain: tone.gain * (1 + e.step * tone.swell), root: tone.root * 2 ** ((e.step * tone.stepSemis) / 12), chord: tone.chord, brightness: tone.brightness + e.step * tone.brighten, attack: e.step ? 0.35 : 0.6, release: 0.6 }],
    after: (e) => [{ type: "pad", dur: e.dur, gain: after.gain, root: after.root, chord: after.chord, brightness: after.brightness, attack: 0.08, release: 1.2 }],
    pick: () => [{ type: "tick", gain: S.pick.gain, pitch: 1.2 }],
    clink: (e) => [{ type: "marimba", hz: S.clink.hz * 2 ** ((e.j * 2) / 12), dur: 0.5, decay: S.clink.decay, mallet: 0.9, gain: S.clink.gain }, { type: "click", gain: S.clink.gain * 0.6, pitch: 2.2 }],
    lastClink: () => [{ type: "marimba", hz: S.clink.hz * 2 ** (11 / 12), dur: 0.5, decay: S.clink.decay, mallet: 0.9, gain: S.clink.gain * 1.1 }, { type: "click", gain: S.clink.gain * 0.7, pitch: 2.2 }],
    snap: () => [
      { type: "clack", gain: S.snap.gain, pitch: 0.55 },
      { type: "click", gain: S.snap.gain * 0.9, pitch: 0.7, offset: 0.004 },
      { type: "thud", gain: S.snap.gain * 0.75, dur: 0.5, offset: 0.03 },
      { type: "pluck", hz: S.snap.ring, decay: 0.9, bright: 0.85, dur: 1.4, gain: S.snap.ringGain, offset: 0.02 },
      { type: "pluck", hz: S.snap.ring * 1.5, decay: 0.6, bright: 0.9, dur: 1.0, gain: S.snap.ringGain * 0.6, offset: 0.025 },
    ],
    hop: (e) => [{ type: "marimba", hz: S.clink.hz * 0.84, dur: 0.4, decay: S.clink.decay * 0.8, mallet: 0.95, gain: clamp(S.hop.gain * e.dv / S.hop.ref, 0.03, S.hop.gain) }, { type: "click", gain: clamp(S.hop.gain * 0.7 * e.dv / S.hop.ref, 0.02, S.hop.gain), pitch: 1.8 }],
    lift: () => [{ type: "tick", gain: S.pick.gain, pitch: 0.9 }],
    setDown: (e) => [{ type: "marimba", hz: S.clink.hz * 0.75 * 2 ** (-e.r / 12), dur: 0.45, decay: S.clink.decay, mallet: 0.9, gain: S.clink.gain * 0.85 }],
  };
}

/** panOf(rig) -> event -> stereo pan from x */
export const panOf = (R) => (e) => (e.x === undefined ? 0 : clamp(e.x / (R.span * 0.9), -1, 1) * 0.6);
