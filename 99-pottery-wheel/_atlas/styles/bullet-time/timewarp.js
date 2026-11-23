// styles/bullet-time/timewarp.js — the two clocks (pure, Node-safe: no THREE, no window, no DOM).
//
//   1. createWarp(...)      video time t -> WORLD time w(t). The world's rate dw/dt is piecewise linear in t
//                           (run 1, ramp, freeze 0, reverse < 0, forward, release), so w is piecewise quadratic: exact,
//                           closed form, no stepping. crossings(we) finds every t where w(t) passes a world time we
//                           (forward or reversed) — that is where a world event's sound goes.
//   2. cameraPath(...)      the camera's own clock: one never-stopping Catmull-Rom arc over azimuth / radius /
//                           elevation / target, sampled into dense keys for the kit rig (cameraKeys).
//   3. createSplash(S)      the world: a ball bounces in and plunges into a bowl of liquid. Ball, crown wall, lobes,
//                           droplets, floor splats, cavity, ripples and rebound jet are all closed-form functions of w.
//   4. timedEvents / bulletVoices   world events x crossings -> SCORE entries (kit/schedule.scoreFromEvents).
import { rng, clamp, lerp, smoothstep } from "../../kit/time.js";

export const G = 9.81;
const TAU = Math.PI * 2;

// ================================================================================================= 1. world clock
/**
 * createWarp({ w0, rate0 = 1, phases: [{ at, rate, ramp = .3, id? }], duration }) -> warp
 *   At video time `at` the world rate starts a LINEAR ramp to `rate`, taking `ramp` seconds. Phases must not overlap.
 *   warp.w(t), warp.rate(t), warp.mode(t) ("play" | "slow" | "freeze" | "rewind"), warp.range -> [wMin, wMax],
 *   warp.crossings(we) -> [{ t, dir: 1 | -1, rate }], warp.ramps() -> [{ t, dur, from, to, id }],
 *   warp.gridCrossings(step, { minRate, maxRate }) -> jog ticks: every multiple of `step` the world clock passes.
 */
export function createWarp({ w0 = 0, rate0 = 1, phases = [], duration = 15 } = {}) {
  const keys = [{ t: 0, rate: rate0 }];
  const rampList = [];
  let r = rate0, last = 0;
  for (const p of phases) {
    const ramp = p.ramp ?? 0.3;
    if (p.at < last - 1e-9) throw new Error(`timewarp: phase at ${p.at} overlaps the previous ramp (ends ${last})`);
    keys.push({ t: p.at, rate: r }, { t: p.at + ramp, rate: p.rate });
    rampList.push({ t: p.at, dur: ramp, from: r, to: p.rate, id: p.id ?? null });
    r = p.rate; last = p.at + ramp;
  }
  const W = [w0]; // world time at each key
  for (let i = 1; i < keys.length; i++) W.push(W[i - 1] + 0.5 * (keys[i - 1].rate + keys[i].rate) * (keys[i].t - keys[i - 1].t));
  const seg = (t) => { let i = 0; while (i < keys.length - 1 && t >= keys[i + 1].t) i++; return i; };
  const rate = (t) => {
    if (t <= 0) return keys[0].rate;
    const i = seg(t);
    if (i >= keys.length - 1) return keys[keys.length - 1].rate;
    const a = keys[i], b = keys[i + 1], T = b.t - a.t;
    return T > 0 ? a.rate + ((b.rate - a.rate) * (t - a.t)) / T : b.rate;
  };
  const w = (t) => {
    if (t <= 0) return w0 + keys[0].rate * t;
    const i = seg(t);
    const a = keys[i], dt = t - a.t;
    if (i >= keys.length - 1) return W[i] + a.rate * dt;
    const b = keys[i + 1], T = b.t - a.t;
    return T > 0 ? W[i] + a.rate * dt + ((b.rate - a.rate) / T) * dt * dt * 0.5 : W[i];
  };
  const mode = (t) => { const q = rate(t); return Math.abs(q) < 0.004 ? "freeze" : q < 0 ? "rewind" : q < 0.75 ? "slow" : "play"; };
  const N = Math.ceil(duration * 240);
  let wMin = Infinity, wMax = -Infinity;
  for (let k = 0; k <= N; k++) { const v = w((k / N) * duration); wMin = Math.min(wMin, v); wMax = Math.max(wMax, v); }
  const crossings = (we, t0 = 0, t1 = duration) => {
    const out = [];
    const n = Math.ceil((t1 - t0) * 240);
    let ta = t0, fa = w(ta) - we;
    for (let k = 1; k <= n; k++) {
      const tb = t0 + ((t1 - t0) * k) / n, fb = w(tb) - we;
      if ((fa < 0 && fb >= 0) || (fa > 0 && fb <= 0)) {
        let lo = ta, hi = tb, flo = fa;
        for (let it = 0; it < 40; it++) { const mid = 0.5 * (lo + hi), fm = w(mid) - we; if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid; }
        const t = 0.5 * (lo + hi);
        out.push({ t, dir: fa < 0 ? 1 : -1, rate: rate(t) });
      }
      ta = tb; fa = fb;
    }
    return out;
  };
  const gridCrossings = (step, { minRate = 0, maxRate = Infinity } = {}) => {
    const out = [];
    for (let k = Math.ceil(wMin / step); k * step <= wMax; k++) {
      for (const c of crossings(k * step + step * 0.5)) if (Math.abs(c.rate) >= minRate && Math.abs(c.rate) <= maxRate) out.push({ ...c, w: k * step + step * 0.5, k });
    }
    return out.sort((a, b) => a.t - b.t);
  };
  return { keys, w, rate, mode, duration, range: [wMin, wMax], crossings, gridCrossings, ramps: () => rampList.map((x) => ({ ...x })) };
}

// ================================================================================================= 2. camera clock
/**
 * cameraPath(way) -> { at(t) -> { pos, target, az, r, el } }
 *   way: [{ t, az (rad, 0 = camera on +Z), r (m), el (rad above horizontal), target: [x, y, z] }]
 *   Catmull-Rom (Hermite with finite-difference tangents, zero at both ends) over every channel: one smooth,
 *   never-stopping move. It has nothing to do with the world clock — that is the point.
 */
export function cameraPath(way) {
  const ch = way.map((k) => [k.az, k.r, k.el, k.target[0], k.target[1], k.target[2]]);
  const T = way.map((k) => k.t), n = way.length;
  const tan = ch.map((v, i) => v.map((_, j) => (i === 0 || i === n - 1 ? 0 : (ch[i + 1][j] - ch[i - 1][j]) / (T[i + 1] - T[i - 1]))));
  const at = (t) => {
    const tt = clamp(t, T[0], T[n - 1]);
    let i = 0; while (i < n - 2 && tt >= T[i + 1]) i++;
    const h = T[i + 1] - T[i], u = (tt - T[i]) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const v = ch[i].map((_, j) => h00 * ch[i][j] + h10 * h * tan[i][j] + h01 * ch[i + 1][j] + h11 * h * tan[i + 1][j]);
    const [az, r, el, x, y, z] = v;
    return { az, r, el, target: [x, y, z], pos: [x + r * Math.cos(el) * Math.sin(az), y + r * Math.sin(el), z + r * Math.cos(el) * Math.cos(az)] };
  };
  return { way, at };
}
/** cameraKeys(path, duration, { step = .1, fov }) -> dense linear keys for kit createCameraRig. */
export function cameraKeys(path, duration, { step = 0.1, fov = 35 } = {}) {
  const keys = [], n = Math.round(duration / step);
  for (let k = 0; k <= n; k++) { const t = +(k * step).toFixed(4), c = path.at(t); keys.push({ t, pos: c.pos, target: c.target, fov, ease: "linear" }); }
  return keys;
}

// ================================================================================================= 3. the world
/** beta bump: 0 at u <= 0 and u >= 1, 1 at u = a / (a + b). */
export function bump(u, a, b) {
  if (!(u > 0 && u < 1)) return 0;
  const p = a / (a + b);
  return (Math.pow(u, a) * Math.pow(1 - u, b)) / (Math.pow(p, a) * Math.pow(1 - p, b));
}

/**
 * createSplash(S = STYLE_SPEC) -> plan. Everything is a function of world time w (seconds; impact at w = 0):
 *   plan.ball(w) -> { p: [x,y,z], spin }                      bounce in, plunge, sink
 *   plan.crown(w) -> state | null,  plan.crownProfile(theta, state, out) -> fills out[2j], out[2j+1] = (r, y)
 *   plan.crownTip(theta, w) -> [x, y, z]                       the rim point above a lobe
 *   plan.surfaceY(r, w)                                        cavity, swell, travelling ripples
 *   plan.jet(w) -> state | null,  plan.jetProfile(state, out)  rebound column
 *   plan.droplets [{ id, kind, w0, life, p0, v0, r, land }]    plan.droplet(i, w, out) -> out.on / p / v / s
 *   plan.splats [{ w, x, z, r, ax }]                           floor marks left by droplets that miss the bowl
 *   plan.events() -> [{ w, kind, ... }]                        world events for the sound
 *   plan.points(w) -> [[x,y,z]...]                             subject points for framing checks
 */
export function createSplash(S) {
  const B = S.bowl, BL = S.ball, C = S.crown, CV = S.cavity, RP = S.ripples, J = S.jet, D = S.droplets;
  const ys = B.liquidY;
  const M = 2 * (C.steps + 1) + C.cap; // profile points per crown ring

  // ---------------------------------------------------------------- ball
  const yi = ys + BL.dip * BL.r;                                   // centre height at impact
  const wb = BL.bounceW;
  const vyi = (BL.r - yi + 0.5 * G * wb * wb) / wb;                // vertical velocity at impact (negative)
  const xb = BL.vx * wb;                                           // floor bounce position
  const vyUp = vyi - G * wb;                                       // just after the bounce
  const vyIn = -vyUp / BL.restitution;                             // just before it
  const vxIn = BL.vx / 0.92;
  const sink = -vyi * BL.sinkTau;                                  // so the plunge starts at the impact speed
  const ball = (w) => {
    if (w < wb) { const d = w - wb; return { p: [xb + vxIn * d, BL.r + vyIn * d - 0.5 * G * d * d, 0], spin: BL.spin * w * 1.15 }; }
    if (w < 0) return { p: [BL.vx * w, yi + vyi * w - 0.5 * G * w * w, 0], spin: BL.spin * w };
    return {
      p: [BL.vx * BL.driftTau * (1 - Math.exp(-w / BL.driftTau)), yi - sink * (1 - Math.exp(-w / BL.sinkTau)), 0],
      spin: BL.spin * BL.spinTau * (1 - Math.exp(-w / BL.spinTau)),
    };
  };

  // ---------------------------------------------------------------- crown
  const baseR = (w) => Math.min(C.r0 + C.spread * Math.sqrt(Math.max(0, w)), B.liquidR - 0.22);
  const crown = (w) => {
    const f = bump(w / C.life, C.riseExp, C.fallExp);
    if (!(f > 0)) return null;
    return { w, f, H: C.height * f, Rb: baseR(w), la: C.lobeAmp * smoothstep(C.lobeIn[0], C.lobeIn[1], w), tk: Math.sqrt(Math.min(1, f * 3)) };
  };
  const lobe = (th) => Math.pow(0.5 + 0.5 * Math.cos(C.lobes * th + C.lobePhase), C.lobeSharp);
  const lobeAngle = (k) => (TAU * k - C.lobePhase) / C.lobes;
  const ring = (th, st) => {
    const L = lobe(th), Hh = st.H * (1 + st.la * (L - C.lobeBias));
    const beadK = 0.55 + 0.9 * L * (st.la / C.lobeAmp);
    return { L, Hh, beadK };
  };
  const centre = (s, st, q) => [st.Rb + C.lean * q.Hh * Math.pow(s, C.leanExp), ys - C.sink + (q.Hh + C.sink) * s];
  const half = (s, st, q) => st.tk * (lerp(C.thBase, C.thTop, s) + C.bead * q.beadK * Math.exp(-(((1 - s) / 0.14) ** 2)));
  const crownProfile = (th, st, out) => {
    const q = ring(th, st);
    let j = 0;
    for (let k = 0; k <= C.steps; k++) {                           // outer face, base -> rim
      const s = k / C.steps, c = centre(s, st, q), h = half(s, st, q) + st.tk * C.foot * Math.exp(-s / 0.07);
      out[j++] = c[0] + h; out[j++] = c[1];
    }
    const c1 = centre(1, st, q), h1 = half(1, st, q);
    for (let k = 1; k <= C.cap; k++) {                             // round rim
      const a = (Math.PI * k) / (C.cap + 1);
      out[j++] = c1[0] + h1 * Math.cos(a); out[j++] = c1[1] + h1 * Math.sin(a) * 1.25;
    }
    for (let k = C.steps; k >= 0; k--) {                           // inner face, rim -> base
      const s = k / C.steps, c = centre(s, st, q), h = half(s, st, q) + st.tk * C.foot * 0.6 * Math.exp(-s / 0.07);
      out[j++] = Math.max(0.02, c[0] - h); out[j++] = c[1];
    }
    return out;
  };
  const crownTip = (th, w) => {
    const st = crown(w);
    if (!st) return [baseR(w) * Math.cos(th), ys, baseR(w) * Math.sin(th)];
    const q = ring(th, st), c = centre(1, st, q), h = half(1, st, q);
    return [c[0] * Math.cos(th), c[1] + h * 1.25, c[0] * Math.sin(th)];
  };

  // ---------------------------------------------------------------- liquid surface
  const surfaceY = (r, w) => {
    if (!(w > 0)) return ys;
    const Rb = baseR(w), edge = 1 - smoothstep(B.liquidR - 0.2, B.liquidR, r);
    let dy;
    if (r < Rb) {
      const x = r / Rb;
      dy = -CV.depth * bump(w / CV.life, CV.riseExp, CV.fallExp) * Math.pow(1 - x * x, 1.3);
    } else {
      const d = r - Rb, f = bump(w / C.life, C.riseExp, C.fallExp);
      const amp = smoothstep(0, 0.08, w) * Math.exp(-Math.max(0, w - RP.hold) / RP.decay);
      dy = C.swell * f * Math.exp(-d / 0.22) + amp * RP.amp * Math.sin(RP.k * d - RP.omega * w) * Math.exp(-d / RP.reach) * (1 - Math.exp(-d / 0.15));
    }
    return ys + dy * edge;
  };

  // ---------------------------------------------------------------- rebound jet
  const jetH = (w) => J.height * bump((w - J.start) / J.life, J.riseExp, J.fallExp);
  const jet = (w) => {
    const H = jetH(w);
    if (!(H > 0.004)) return null;
    return { w, H, k: Math.min(1, H / 0.35), bulb: J.bulb * (1 - smoothstep(J.pinch - 0.06, J.pinch + 0.03, w)) };
  };
  const JM = J.steps + 1 + 5; // column points + cap
  const jetR = (q, st) => st.k * (J.neck * (1 - 0.35 * q) + (J.base - J.neck) * Math.exp(-q / 0.11)) + st.bulb * Math.exp(-(((q - 0.9) / 0.08) ** 2));
  const jetProfile = (st, out) => {
    let j = 0;
    for (let k = 0; k <= J.steps; k++) { const q = k / J.steps; out[j++] = jetR(q, st); out[j++] = ys - 0.04 + (st.H + 0.04) * q; }
    const rt = jetR(1, st);
    for (let k = 1; k <= 5; k++) { const a = (Math.PI / 2) * (k / 5); out[j++] = Math.max(0.0005, rt * Math.cos(a)); out[j++] = ys + st.H + rt * Math.sin(a); }
    return out;
  };

  // ---------------------------------------------------------------- droplets (ballistic) and floor splats
  const R = rng(D.seed);
  const droplets = [];
  const add = (kind, w0, p0, v0, r, extra = {}) => {
    // land on the liquid if it comes down inside the bowl, else on the floor
    const disc = v0[1] * v0[1] + 2 * G * (p0[1] - ys);
    let life = (v0[1] + Math.sqrt(Math.max(0, disc))) / G, land = "liquid";
    const xs = p0[0] + v0[0] * life, zs = p0[2] + v0[2] * life, rs = Math.hypot(xs, zs);
    if (rs > B.rimR + 0.02) {
      const fy = r * 0.6;
      life = (v0[1] + Math.sqrt(v0[1] * v0[1] + 2 * G * (p0[1] - fy))) / G; land = "floor";
    } else if (rs > B.liquidR - 0.02) land = "rim";
    droplets.push({ id: droplets.length, kind, w0, life, p0, v0, r, land, ...extra });
  };
  const eps = 1e-3;
  for (let k = 0; k < C.lobes; k++) {
    const th = lobeAngle(k), er = [Math.cos(th), 0, Math.sin(th)], et = [-Math.sin(th), 0, Math.cos(th)];
    const mk = (kind, w0, Q, rr) => {
      const a = crownTip(th, w0 - eps), b = crownTip(th, w0 + eps), p = crownTip(th, w0);
      const out = R.range(Q.out[0], Q.out[1]), up = R.range(Q.up[0], Q.up[1]), sw = R.range(-1, 1) * (D.lobe.swirl ?? 0);
      const v = [0, 1, 2].map((i) => (b[i] - a[i]) / (2 * eps) + er[i] * out + et[i] * sw + (i === 1 ? up : 0));
      add(kind, w0, [p[0], p[1] + rr * 0.5, p[2]], v, rr, { lobe: k });
    };
    const w1 = R.range(D.lobe.pinch[0], D.lobe.pinch[1]);
    mk("lobe", w1, D.lobe, R.range(D.lobe.r[0], D.lobe.r[1]));
    mk("second", w1 + R.range(D.second.delay[0], D.second.delay[1]), D.second, R.range(D.second.r[0], D.second.r[1]));
  }
  for (let i = 0; i < D.spray.n; i++) {
    const Q = D.spray, th = (TAU * (i + R.range(-0.4, 0.4))) / Q.n * 1 + R.range(0, 0.2);
    const sp = R.range(Q.speed[0], Q.speed[1]), el = R.range(Q.elev[0], Q.elev[1]), rr = R.range(Q.r[0], Q.r[1]);
    const r0 = C.r0 * R.range(Q.ring[0], Q.ring[1]);
    add("spray", R.range(Q.launch[0], Q.launch[1]), [r0 * Math.cos(th), ys + 0.03, r0 * Math.sin(th)],
      [sp * Math.cos(el) * Math.cos(th), sp * Math.sin(el), sp * Math.cos(el) * Math.sin(th)], rr);
  }
  {
    const w0 = J.pinch, e = 2e-3, vy = (jetH(w0 + e) - jetH(w0 - e)) / (2 * e);
    add("jet", w0, [0, ys + jetH(w0) + J.dropR * 0.4, 0], [0.06, vy + 0.55, 0.04], J.dropR);
  }
  const splats = droplets.filter((d) => d.land === "floor").map((d) => {
    const x = d.p0[0] + d.v0[0] * d.life, z = d.p0[2] + d.v0[2] * d.life;
    return { id: d.id, w: d.w0 + d.life, x, z, r: d.r * D.splatScale, ax: Math.atan2(d.v0[2], d.v0[0]) };
  });
  const droplet = (i, w, out = {}) => {
    const d = droplets[i], tau = w - d.w0;
    if (!(tau > 0 && tau < d.life)) { out.on = false; return out; }
    out.on = true;
    out.p = [d.p0[0] + d.v0[0] * tau, d.p0[1] + d.v0[1] * tau - 0.5 * G * tau * tau, d.p0[2] + d.v0[2] * tau];
    out.v = [d.v0[0], d.v0[1] - G * tau, d.v0[2]];
    out.s = smoothstep(0, D.growIn, tau) * (1 - smoothstep(d.life - 0.012, d.life, tau));
    out.r = d.r;
    return out;
  };

  // ---------------------------------------------------------------- world events (for the sound)
  const events = () => {
    const ev = [{ w: wb, kind: "bounce", x: xb }, { w: 0, kind: "impact", x: 0 }, { w: J.start + 0.06, kind: "jetRise", x: 0 }];
    for (const d of droplets) {
      if (d.kind === "lobe") ev.push({ w: d.w0, kind: "pinch", x: d.p0[0], k: d.lobe });
      if (d.kind === "jet") ev.push({ w: d.w0, kind: "jetPinch", x: 0 });
      const x = d.p0[0] + d.v0[0] * d.life;
      ev.push({ w: d.w0 + d.life, kind: d.land === "floor" ? "splat" : "plip", x, r: d.r, id: d.id });
    }
    return ev.sort((a, b) => a.w - b.w);
  };

  // ---------------------------------------------------------------- subject points (framing)
  const points = (w, { droplets: withDrops = true } = {}) => {
    const pts = [];
    for (let k = 0; k < 12; k++) { const a = (TAU * k) / 12; pts.push([B.rimR * Math.cos(a), B.rimY, B.rimR * Math.sin(a)], [B.footR * Math.cos(a), 0, B.footR * Math.sin(a)]); }
    pts.push(ball(w).p);
    if (crown(w)) for (let k = 0; k < C.lobes; k++) pts.push(crownTip(lobeAngle(k), w));
    const jt = jet(w); if (jt) pts.push([0, ys + jt.H + 0.1, 0]);
    if (withDrops) { const o = {}; for (let i = 0; i < droplets.length; i++) if (droplet(i, w, o).on) pts.push(o.p); }
    return pts;
  };

  return {
    spec: S, ys, M, JM, bounce: { w: wb, x: xb }, impactSpeed: -vyi,
    ball, crown, crownProfile, crownTip, lobeAngle, baseR, surfaceY, jet, jetProfile, jetH,
    droplets, droplet, splats, events, points,
  };
}

// ================================================================================================= 4. sound follows w
/**
 * timedEvents(warp, worldEvents) -> [{ t, kind, dir, rate (|dw/dt| at the crossing), ...event }]: each world event,
 * once for every time the world clock passes it — forward or backward.
 */
export function timedEvents(warp, worldEvents) {
  const out = [];
  for (const e of worldEvents) for (const c of warp.crossings(e.w)) out.push({ ...e, t: c.t, dir: c.dir, rate: Math.abs(c.rate) });
  return out.sort((a, b) => a.t - b.t);
}
/** clockEvents(warp, SND) -> ramp whirs + jog ticks + a chime at every freeze: the sound of the world clock itself. */
export function clockEvents(warp, SND) {
  const out = [];
  for (const r of warp.ramps()) {
    out.push({ t: r.t, kind: "ramp", from: r.from, to: r.to, dur: r.dur });
    if (Math.abs(r.to) < 0.004 && Math.abs(r.from) > 0.5) out.push({ t: r.t + r.dur, kind: "freeze" });
  }
  for (const c of warp.gridCrossings(SND.tick.step, { minRate: SND.tick.minRate, maxRate: SND.tick.maxRate })) out.push({ t: c.t, kind: "tick", dir: c.dir, rate: Math.abs(c.rate), k: c.k });
  return out.sort((a, b) => a.t - b.t);
}
/** bulletVoices(SND) -> voices for kit/schedule.scoreFromEvents. Slow crossings play lower; reversed ones softer. */
export function bulletVoices(SND) {
  const sp = (e) => lerp(SND.slowPitch, 1, clamp(e.rate ?? 1, 0, 1));
  const gn = (e) => (e.dir < 0 ? 0.7 : 1) * lerp(0.75, 1, clamp(e.rate ?? 1, 0, 1));
  const pan = (e) => clamp((e.x ?? 0) / 3, -0.7, 0.7);
  return {
    bounce: (e) => [
      { type: "thud", dur: 0.3, pitch: 1.5 * sp(e), gain: SND.bounce.thud * gn(e), pan: pan(e) },
      { type: "tick", pitch: 0.8 * sp(e), gain: SND.bounce.tick * gn(e), pan: pan(e) },
    ],
    impact: (e) => (e.dir > 0
      ? [
        { type: "squish", dur: 0.42, pitch: 1.1 * sp(e), gain: SND.impact.squish * gn(e) },
        { type: "thud", dur: 0.4, pitch: 0.9 * sp(e), gain: SND.impact.thud * gn(e) },
        { type: "whoosh", dir: "out", dur: 0.5 / sp(e), q: 1.2, pitch: 1.5 * sp(e), gain: SND.impact.whoosh * gn(e) },
      ]
      // reversed: the splash is sucked back in — a whoosh that PEAKS at the crossing, then a soft plop
      : [
        { type: "whoosh", dir: "in", dur: 0.9, q: 1.4, pitch: 1.3, gain: SND.impact.reverse, offset: -0.63 },
        { type: "squish", dur: 0.3, pitch: 0.8, gain: SND.impact.squish * 0.4 },
      ]),
    pinch: (e) => [{ type: "pop", dur: 0.07, pitch: (1.7 + 0.08 * (e.k % 5)) * sp(e), gain: SND.pinch.gain * gn(e), pan: pan(e) }],
    plip: (e) => [{ type: "bubble", dur: 0.09, pitch: lerp(SND.plip.pitch[0], SND.plip.pitch[1], clamp((e.r - 0.02) / 0.08, 0, 1)) * sp(e), gain: SND.plip.gain * gn(e) * clamp(e.r / 0.06, 0.5, 1.4), pan: pan(e) }],
    splat: (e) => [{ type: "tick", pitch: 0.7 * sp(e), gain: SND.splat.gain * gn(e), pan: pan(e) }, { type: "bubble", dur: 0.06, pitch: 0.8 * sp(e), gain: SND.splat.gain * 0.6 * gn(e), pan: pan(e) }],
    jetRise: (e) => [{ type: "whoosh", dir: "in", dur: 0.45 / sp(e), q: 2, pitch: 1.8 * sp(e), gain: SND.jet.gain * gn(e) }],
    jetPinch: (e) => [{ type: "pop", dur: 0.12, pitch: 0.9 * sp(e), gain: SND.jet.gain * gn(e) }, { type: "bubble", dur: 0.12, pitch: 0.7 * sp(e), gain: SND.jet.gain * gn(e) }],
    ramp: (e) => [{ type: "servo", dur: e.dur + 0.22, hz: SND.ramp.hz + SND.ramp.span * Math.abs(e.from), hz2: SND.ramp.hz + SND.ramp.span * Math.abs(e.to), grit: 0.12, gain: SND.ramp.gain * (Math.abs(e.from - e.to) > 0.6 ? 1 : 0.6) }],
    freeze: () => [{ type: "chime", dur: 1.6, notes: 2, pitch: 1.5, gain: SND.freeze.gain }],
    tick: (e) => [{ type: "tick", pitch: e.dir < 0 ? 1.5 : 2.1, gain: SND.tick.gain, pan: e.dir < 0 ? -0.15 : 0.15 }],
  };
}
