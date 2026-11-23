// styles/marionette/strings.js — the string rig planner for "Marionette". Pure and Node-safe: no THREE, no window.
// One control plan (keys + sine windows on the bar's channels and on each string's pull) decides
//   - where the control bar is and how it is tilted                  (channels x y z pitch roll yaw rock, pull:<tag>),
//   - where every joint of the puppet is                              (closed form: fixed string lengths, IK, pendulum hang),
//   - which strings are taut (straight) and which are slack (sag by their spare length),
//   - the sound events                                                (steps, plucks, creaks, tag drops: scanned from the same plan).
// style.js reads plan.pose(t) for the picture; scene.config.js turns plan.events() into SCORE with rigVoices().
//
// Conventions: metres, Y up. The puppet stands at the origin facing +Z. Bar-local origin = the grip at the BACK eyelet,
// +Z toward the audience; bar rotation = Ry(yaw) Rz(roll) Rx(pitch) (three.js Euler order "YZX"): positive pitch lowers
// the front of the bar (bow), positive roll raises the +X end, rock is the leg bar's own roll.
import { clamp, lerp, smoothstep, toEase, ease, TAU } from "../../kit/time.js";

// ---------------------------------------------------------------- small vector kit (arrays)
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const DOWN = [0, -1, 0];

/** barRotation(pitch, roll, yaw) -> (v) => Ry(yaw) Rz(roll) Rx(pitch) v */
export function barRotation(pitch, roll, yaw) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return (v) => {
    const x1 = v[0], y1 = v[1] * cp - v[2] * sp, z1 = v[1] * sp + v[2] * cp;
    const x2 = x1 * cr - y1 * sr, y2 = x1 * sr + y1 * cr;
    return [x2 * cy + z1 * sy, y2, -x2 * sy + z1 * cy];
  };
}

/**
 * lowestOnCircle(C1, r1, C2, r2, g) -> the point on the circle (sphere C1,r1) ∩ (sphere C2,r2) that lies furthest along g
 * ("lowest" when g is gravity), or null when the spheres do not meet. This is where a rigid limb of length r1 pivoting at
 * C1 comes to rest when a taut string of length r2 from C2 holds its end.
 */
export function lowestOnCircle(C1, r1, C2, r2, g = DOWN) {
  const D = sub(C2, C1), d = len(D);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d < 1e-9) return null;
  const x = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - x * x));
  const u = mul(D, 1 / d);
  let e = sub(g, mul(u, dot(g, u)));
  if (len(e) < 1e-6) e = [1, 0, 0];
  return add(add(C1, mul(u, x)), mul(norm(e), h));
}

/** twoBone(S, W, a, b, pole) -> the middle joint of a two-bone chain S -(a)- E -(b)- W bent toward `pole` */
export function twoBone(S, W, a, b, pole) {
  const D = sub(W, S), d = Math.max(1e-6, Math.min(len(D), a + b));
  const u = norm(D);
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  let p = sub(pole, mul(u, dot(pole, u)));
  if (len(p) < 1e-6) p = [0, 0, 1];
  return add(add(S, mul(u, x)), mul(norm(p), h));
}

/**
 * stringPoints(a, b, slack, n, side, sagMax) -> n points from eyelet a to hook b. Taut (slack ≈ 0): a straight line.
 * Slack: a belly whose depth follows from the spare length (shallow-arc rule: spare ≈ 8 d² / 3 c), hanging down and a
 * little to `side`, lowest nearer the bottom end.
 */
export function stringPoints(a, b, slack = 0, n = 14, side = [1, 0, 0], sagMax = 0.42) {
  const out = [];
  const C = sub(b, a), c = len(C) || 1e-6, u = mul(C, 1 / c);
  let d = slack > 1e-4 ? Math.min(sagMax, Math.sqrt((3 * c * slack) / 8)) : 0;
  let e = add(sub(DOWN, mul(u, dot(DOWN, u))), mul(sub(side, mul(u, dot(side, u))), 0.8));
  e = len(e) < 1e-6 ? [1, 0, 0] : norm(e);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), w = d * 4 * k * (1 - k) * (0.55 + 0.9 * k);
    out.push([a[0] + C[0] * k + e[0] * w, a[1] + C[1] * k + e[1] * w, a[2] + C[2] * k + e[2] * w]);
  }
  return out;
}

// ---------------------------------------------------------------- the control: keyed tracks + sine windows
function track(keys, t) {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1], k1 = keys[i];
    if (t < k1.t) return lerp(k0.v, k1.v, toEase(k1.ease ?? "inOutSine")((t - k0.t) / (k1.t - k0.t)));
  }
  return keys[keys.length - 1].v;
}
const windowAmp = (w, t) => smoothstep(w.from, w.from + (w.fade ?? 0.3), t) * (1 - smoothstep(w.to - (w.fade ?? 0.3), w.to, t));

export const BAR_CHANNELS = ["x", "y", "z", "pitch", "roll", "yaw", "rock"];

/**
 * createPlan({ puppet, rig, strings, tags, control, end }) -> plan
 *   control = { keys: { <channel>: [{ t, v, ease }] }, waves: [{ ch, from, to, amp, hz, phase, fade }], tagDrops: { <tagId>: t } }
 *     channels: x y z (bar offset from rest, m), pitch roll yaw (rad), rock (leg bar, rad), "pull:<tagId>" (m of string drawn in).
 *     tagDrops: when each name tag drops down its strand (absent = hanging from the start).
 *   plan.channels(t), plan.pose(t) (everything the picture needs), plan.events() (sound), plan.rest (lengths), plan.stringPoints.
 */
export function createPlan({ puppet: P, rig: R, strings: ST, tags: TG, control, end = 15 }) {
  const keys = control.keys ?? {}, waves = control.waves ?? [], tagDrops = control.tagDrops ?? {};
  const names = [...new Set([...BAR_CHANNELS, ...Object.keys(keys), ...waves.map((w) => w.ch)])];
  const value = (ch, t) => {
    let v = track(keys[ch], t);
    for (const w of waves) if (w.ch === ch && t > w.from && t < w.to) v += w.amp * Math.sin(TAU * w.hz * (t - w.from) + (w.phase ?? 0)) * windowAmp(w, t);
    return v;
  };
  const channels = (t) => { const c = {}; for (const n of names) c[n] = value(n, t); return c; };

  // ---- rest geometry and the fixed string lengths --------------------------------------------------------------
  const reach = P.upperArm + P.foreArm, leg = P.thigh + P.shin;
  const hipY0 = leg + P.hipDrop, waistY0 = hipY0 + P.waist, headTop0 = waistY0 + P.torsoLen;
  const eyeLocal = (c) => ({
    back: [0, 0, 0],
    head: [0, 0, R.headZ],
    handL: [-R.handBar.eyelet, 0, R.handBar.z],
    handR: [R.handBar.eyelet, 0, R.handBar.z],
    kneeL: [-R.legBar.eyelet * Math.cos(c.rock), R.legBar.y - R.legBar.eyelet * Math.sin(c.rock), R.legBar.z],
    kneeR: [R.legBar.eyelet * Math.cos(c.rock), R.legBar.y + R.legBar.eyelet * Math.sin(c.rock), R.legBar.z],
  });
  const restEye = eyeLocal({ rock: 0 });
  const barRest = [0, R.barY, -R.headZ];
  const L = {
    head: R.barY - headTop0,
    back: len(sub(barRest, [0, hipY0 + P.backHook[0], P.backHook[1]])),
    hand: R.barY - R.wristRest,
    knee: len(sub(add(barRest, restEye.kneeR), [P.hipHalf, P.shin, P.kneeHook])) + R.kneeSlack,
  };
  const pullOf = Object.fromEntries(ST.list.map((s) => [s.id, `pull:${s.tag}`]));

  // ---- planned damped sway: every key move leaves a decaying swing (effective gravity tilt), closed form ---------
  const impulses = [];
  for (const [ch, list] of Object.entries(keys)) {
    const base = ch.startsWith("pull:") ? "pull" : ch;
    const gain = R.swayGain[base];
    if (!gain) continue;
    for (let i = 1; i < list.length; i++) {
      const dv = list[i].v - list[i - 1].v, dur = list[i].t - list[i - 1].t;
      if (Math.abs(dv) < 1e-6 || dur <= 0) continue;
      const speed = dv / dur;
      impulses.push({ t: list[i].t, ax: clamp(gain[0] * speed, -R.sway.cap, R.sway.cap), az: clamp(gain[1] * speed, -R.sway.cap, R.sway.cap), only: base === "pull" ? ch.slice(5) : null });
    }
  }
  /** sway(t, hz, only) -> [sx, sz]: sum of the decaying swings still ringing at t (impulses tied to one tag only move that part) */
  const sway = (t, hz, only = null) => {
    let sx = 0, sz = 0;
    for (const im of impulses) {
      const s = t - im.t;
      if (s <= 0 || s > R.sway.tau * 8) continue;
      if (im.only && im.only !== only) continue;
      const k = Math.exp(-s / R.sway.tau) * Math.sin(TAU * hz * s);
      sx += im.ax * k; sz += im.az * k;
    }
    return [clamp(sx, -R.sway.cap, R.sway.cap), clamp(sz, -R.sway.cap, R.sway.cap)];
  };
  const gravity = (s, k = 1) => norm([s[0] * k, -1, s[1] * k]);

  // ---- one frame --------------------------------------------------------------------------------------------------
  function pose(t) {
    const c = channels(t), cl = channels(t - R.lag);
    const barPos = [barRest[0] + c.x, barRest[1] + c.y, barRest[2] + c.z];
    const rot = barRotation(c.pitch, c.roll, c.yaw);
    const EL = eyeLocal(c);
    const eye = {};
    for (const k of Object.keys(EL)) eye[k] = add(barPos, rot(EL[k]));

    // body: trails the bar, stands under the head eyelet, yaws partly with it
    const sb = sway(t, R.sway.hz.body);
    const psi = 0.6 * cl.yaw;
    const fwd = [Math.sin(psi), 0, Math.cos(psi)], right = [Math.cos(psi), 0, -Math.sin(psi)];
    const rootX = barRest[0] + cl.x + R.headZ * Math.sin(cl.yaw) + sb[0] * 0.4;
    const rootZ = barRest[2] + cl.z + R.headZ * Math.cos(cl.yaw) + sb[1] * 0.25;
    // hips: held by the back string (fixed length) — lower the bar and the knees fold, lift it and the feet leave the floor
    const hookX = rootX + fwd[0] * P.backHook[1], hookZ = rootZ + fwd[2] * P.backHook[1];
    const dh = Math.hypot(eye.back[0] - hookX, eye.back[2] - hookZ);
    const hookY = eye.back[1] - Math.sqrt(Math.max(0.01, L.back * L.back - dh * dh));
    const hip = [rootX, Math.max(0.6, hookY - P.backHook[0]), rootZ];
    const lift = hip[1] - hipY0;                                  // > 0: hanging clear of the floor
    const air = smoothstep(0, 0.12, lift);
    const waist = [hip[0], hip[1] + P.waist, hip[2]];

    // torso: a rod of length torsoLen from the waist, its top held by the head string (pendulum under the head eyelet)
    const rel = sub(eye.head, waist), ay = rel[1], as = dot(rel, fwd), d = Math.hypot(ay, as);
    const T = P.torsoLen, Lh = L.head;
    let theta;
    if (d >= T + Lh - 1e-9) theta = Math.atan2(as, ay);
    else {
      const a = (T * T - Lh * Lh + d * d) / (2 * d), h = Math.sqrt(Math.max(0, T * T - a * a));
      const uy = ay / d, us = as / d, ny = uy >= 0 ? -us : us, ns = uy >= 0 ? uy : -uy;   // the forward-falling branch
      theta = Math.atan2(a * us + h * ns, a * uy + h * ny);
    }
    theta += sb[1] * 0.45;
    const lean = Math.atan2(dot(rel, right), Math.max(0.2, ay)) * 0.5 + sb[0] * 0.3;       // sideways tilt toward the head eyelet
    const st = Math.sin(theta), ct = Math.cos(theta);
    const upT = [fwd[0] * st, ct, fwd[2] * st], fwT = [fwd[0] * ct, -st, fwd[2] * ct];
    const tw = (lx, ly, lz) => [
      waist[0] + right[0] * lx + upT[0] * ly + fwT[0] * lz,
      waist[1] + right[1] * lx + upT[1] * ly + fwT[1] * lz,
      waist[2] + right[2] * lx + upT[2] * ly + fwT[2] * lz,
    ];
    const neckH = T - P.head.h - 0.05;
    const neck = tw(0, neckH, 0);
    const headPitch = theta * (1 + P.headNod);
    const hs = Math.sin(headPitch), hc = Math.cos(headPitch);
    const headUp = [fwd[0] * hs, hc, fwd[2] * hs];
    const headC = add(neck, mul(headUp, 0.05 + P.head.h / 2));
    const headTop = add(neck, mul(headUp, 0.05 + P.head.h));

    // arms: the wrist hangs straight under its eyelet when the arm can reach that point, else on the lowest point the
    // string allows with the arm at full stretch; a slack string leaves the arm hanging from the shoulder
    const arms = [-1, 1].map((sg, i) => {
      const id = i ? "handR" : "handL", tag = ST.list.find((s) => s.id === id).tag;
      const g = gravity(sway(t, R.sway.hz.arm * (1 + 0.08 * i), tag));
      const S = tw(sg * P.shoulder[0], P.shoulder[1], 0), A = eye[id];
      const ell = L.hand - (c[pullOf[id]] ?? 0);
      const W0 = add(S, mul(norm(add(g, add(mul(right, sg * 0.1), mul(fwd, 0.06)))), reach * 0.995));
      const taut = len(sub(A, W0)) - ell;
      let W = W0;
      if (taut > 0) {
        let W1 = add(A, mul(g, ell));
        if (len(sub(W1, S)) > reach * 0.995) W1 = lowestOnCircle(S, reach * 0.995, A, ell, g) ?? add(S, mul(norm(sub(A, S)), reach * 0.995));
        W = mix(W0, W1, smoothstep(0, R.blend, taut));
        const r = len(sub(W, S));
        if (r > reach * 0.995) W = add(S, mul(sub(W, S), (reach * 0.995) / r));
      }
      const pole = add(add(mul(g, 1), mul(right, sg * 0.35)), mul(fwd, -0.55));           // elbows hang down, out and back
      const E = twoBone(S, W, P.upperArm, P.foreArm, pole);
      return { id, S, E, W, A, slack: Math.max(0, ell - len(sub(A, W))), pull: c[pullOf[id]] ?? 0 };
    });

    // legs: the thigh is one rigid bone, so a taut knee string puts the knee on the lowest point of
    // (sphere hip, thigh) ∩ (sphere eyelet, string); the shin hangs from the knee and the foot stops on the floor
    const legs = [-1, 1].map((sg, i) => {
      const id = i ? "kneeR" : "kneeL";
      const g = gravity(sway(t, R.sway.hz.leg * (1 + 0.08 * i), "feedback"));
      const gs = gravity(sway(t, R.sway.hz.leg * (1 + 0.08 * i), "feedback"), air);       // a standing leg does not swing
      const H = [hip[0] + right[0] * sg * P.hipHalf, hip[1] - P.hipDrop, hip[2] + right[2] * sg * P.hipHalf];
      const A = eye[id], ell = L.knee - (c[pullOf[id]] ?? 0);
      const Ak = sub(A, mul(fwd, P.kneeHook));                   // the hook sits in front of the knee: solve for the knee centre
      // slack solution: hang straight, or (hips lower than the legs are long) stand with the knee folded forward
      let F0 = add(H, mul(gs, leg)), K0;
      if (F0[1] >= 0) K0 = add(H, mul(gs, P.thigh));
      else { F0 = [H[0], 0, H[2]]; K0 = twoBone(H, F0, P.thigh, P.shin, add(fwd, [0, 0.2, 0])); }
      const hook0 = add(K0, mul(fwd, P.kneeHook));
      const taut = len(sub(A, hook0)) - ell;
      let K = K0, F = F0;
      if (taut > 0) {
        const K1 = lowestOnCircle(H, P.thigh, Ak, ell, g) ?? add(H, mul(norm(sub(Ak, H)), P.thigh));
        const k = smoothstep(0, R.blend, taut);
        K = add(H, mul(norm(sub(mix(K0, K1, k), H)), P.thigh));
        const F1 = add(K1, mul(g, P.shin));
        F = add(K, mul(norm(sub(mix(F0, F1, k), K)), P.shin));
      }
      if (F[1] < 0) {                                           // the foot stops on the floor: the shin leans back from the knee
        const r = Math.sqrt(Math.max(0, P.shin * P.shin - K[1] * K[1]));
        let hdir = [F[0] - K[0], 0, F[2] - K[2]];
        hdir = len(hdir) < 1e-5 ? mul(fwd, -1) : norm(hdir);
        F = K[1] >= P.shin ? [K[0], K[1] - P.shin, K[2]] : [K[0] + hdir[0] * r, 0, K[2] + hdir[2] * r];
      }
      const hook = add(K, mul(fwd, P.kneeHook));
      return { id, H, K, F, A, hook, slack: Math.max(0, ell - len(sub(A, hook))), onFloor: F[1] <= R.footEps };
    });

    // name tags: each hangs from the tag rail on its own strand; pulling a tag down draws its string in by the same length
    const stg = sway(t, R.sway.hz.tag);
    const tags = TG.list.map((q) => {
      const eyelet = add(barPos, rot([q.x, 0, R.tagRail.z]));
      const td = tagDrops[q.id] ?? -Infinity, s = t - td;
      const pull = c[`pull:${q.id}`] ?? 0;
      if (s < 0) return { id: q.id, eyelet, top: eyelet, dir: DOWN, angle: 0, scale: 0, pull: 0 };
      const u = clamp(s / TG.drop.dur);
      const strand = TG.rows[q.row] * ease.outBack(u) + pull;
      const swing = Number.isFinite(s) ? TG.drop.swing * Math.exp(-s / TG.drop.swingTau) * Math.sin(TAU * TG.drop.swingHz * s) : 0;
      const angle = swing + stg[0] * 0.8;
      const dir = norm([Math.sin(angle), -Math.cos(angle), stg[1] * 0.5]);
      return { id: q.id, eyelet, top: add(eyelet, mul(dir, strand)), dir, angle, scale: smoothstep(0, 0.16, s), pull };
    });

    const strings = [
      { id: "head", a: eye.head, b: headTop, slack: 0, side: [1, 0, 0] },
      { id: "back", a: eye.back, b: [hookX, hookY, hookZ], slack: 0, side: [1, 0, 0] },
      { id: "handL", a: arms[0].A, b: arms[0].W, slack: arms[0].slack, side: [-1, 0, 0.3] },
      { id: "handR", a: arms[1].A, b: arms[1].W, slack: arms[1].slack, side: [1, 0, 0.3] },
      { id: "kneeL", a: legs[0].A, b: legs[0].hook, slack: legs[0].slack, side: [-1, 0, 0.5] },
      { id: "kneeR", a: legs[1].A, b: legs[1].hook, slack: legs[1].slack, side: [1, 0, 0.5] },
    ];
    return {
      t, c,
      bar: { pos: barPos, pitch: c.pitch, roll: c.roll, yaw: c.yaw, rock: c.rock },
      eye, hip, waist, yaw: psi, pitch: theta, lean, neck, headC, headTop, headPitch, lift,
      arms, legs, tags, strings,
    };
  }

  // ---- sound events: scanned from the same plan (pure, done once) ------------------------------------------------
  let cache = null;
  function events() {
    if (cache) return cache;
    const ev = [];
    const dt = 1 / 120;
    let prev = pose(0);
    for (let i = 1; i * dt <= end + 1e-9; i++) {
      const t = i * dt, p = pose(t);
      p.legs.forEach((lg, k) => {
        if (lg.onFloor && !prev.legs[k].onFloor) ev.push({ t, kind: "step", side: k, x: lg.F[0], speed: (prev.legs[k].F[1] - lg.F[1]) / dt });
      });
      p.strings.forEach((s, k) => {
        if (s.slack <= 0.004 && prev.strings[k].slack > 0.004) ev.push({ t, kind: "taut", id: s.id, x: s.b[0] });
      });
      prev = p;
    }
    for (const [ch, list] of Object.entries(keys)) {
      for (let i = 1; i < list.length; i++) {
        const dv = list[i].v - list[i - 1].v;
        if (Math.abs(dv) < 1e-6) continue;
        const pull = ch.startsWith("pull:");
        ev.push({ t: list[i - 1].t, kind: pull ? (dv > 0 ? "pull" : "release") : "creak", ch, amount: Math.abs(dv), dur: list[i].t - list[i - 1].t, x: 0 });
      }
    }
    for (const w of waves) {                                     // a quiet wooden knock at each swing of a waved channel
      if (w.ch === "rock" || w.ch === "y" || w.ch === "x" || w.ch === "yaw") continue;
      const n = Math.floor((w.to - w.from) * w.hz * 2);
      for (let k = 0; k < n; k++) {
        const t = w.from + (k + 0.5) / (2 * w.hz), a = windowAmp(w, t);
        if (a > 0.4) ev.push({ t, kind: "knock", ch: w.ch, level: a, x: 0 });
      }
    }
    for (const q of TG.list) if (Number.isFinite(tagDrops[q.id])) ev.push({ t: tagDrops[q.id] + TG.drop.dur * 0.55, kind: "tag", id: q.id, x: q.x, row: q.row });
    cache = ev.filter((e) => e.t >= 0 && e.t < end).sort((a, b) => a.t - b.t);
    return cache;
  }

  return {
    channels, pose, events, sway, impulses, end,
    rest: { hipY: hipY0, waistY: waistY0, headTop: headTop0, reach, leg, lengths: L, barRest },
    stringPoints: (s) => stringPoints(s.a, s.b, s.slack, ST.points, s.side, ST.sagMax),
  };
}

/**
 * rigVoices(SND) -> voices for kit scoreFromEvents: wood on wood for steps and knocks, a plucked string when one takes
 * the weight, a short gritty glide for a creak, a wooden bar note for each name tag.
 */
export function rigVoices(SND) {
  return {
    step: (e) => [
      { type: "clack", gain: SND.step.gain * clamp(0.55 + e.speed * 0.25, 0.5, 1.1), pitch: e.side ? 0.82 : 0.74 },
      { type: "marimba", hz: SND.step.hz * (e.side ? 1 : 0.891), dur: 0.5, decay: 0.09, mallet: 0.8, gain: SND.step.wood },
    ],
    knock: (e) => [{ type: "clack", gain: SND.knock.gain * e.level, pitch: 1.5 }, { type: "tick", gain: SND.knock.gain * 0.5 * e.level, pitch: 1.2 }],
    creak: (e) => [{ type: "servo", dur: clamp(e.dur * 0.7, 0.18, 0.5), hz: SND.creak.hz, hz2: SND.creak.hz * 1.22, grit: 0.55, gain: SND.creak.gain * clamp(0.6 + e.amount, 0.6, 1.3) }],
    taut: () => [{ type: "pluck", hz: SND.pluck.hz, dur: 0.5, decay: 0.3, bright: 0.5, gain: SND.pluck.gain }],
    pull: () => [
      { type: "pluck", hz: SND.pull.hz, dur: 0.9, decay: 0.6, bright: 0.7, gain: SND.pull.gain },
      { type: "tick", gain: 0.25, pitch: 1.4 },
    ],
    release: () => [{ type: "pluck", hz: SND.pull.hz * 0.75, dur: 0.6, decay: 0.35, bright: 0.5, gain: SND.pull.gain * 0.6 }],
    tag: (e) => [
      { type: "marimba", hz: SND.tag.hz * (e.row ? 1.335 : 1) * (1 + 0.06 * e.x), dur: 0.7, decay: 0.16, mallet: 0.6, gain: SND.tag.gain },
      { type: "clack", gain: 0.2, pitch: 1.9 },
    ],
  };
}

/** panOf(e) -> stereo pan from an event's x on the stage */
export const panOf = (e) => clamp((e.x ?? 0) / 2.4, -1, 1) * 0.45;
