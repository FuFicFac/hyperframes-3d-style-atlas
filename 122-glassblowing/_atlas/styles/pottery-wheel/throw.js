// styles/pottery-wheel/throw.js — the THROW PLAN (pure, Node-safe: no THREE, no window, no DOM).
// Plain data in (STYLE_SPEC + a list of timed shaping segments from the scene), plain data out. style.js reads it for the
// picture and scene.config.js reads it for the camera fits and SCORE, so every squelch and every hum glide comes from
// the same plan as the clay.
//
//   keyProfile(S, name)  -> { r:[], y:[] }  smoothed + arc-length resampled key profile (N points, same N for every key)
//   createPlan(S, P)     -> plan:
//     plan.N, plan.lam[i]          profile fraction (0 foot .. 1 lip; inner wall mirrored lip -> floor), part[i]
//     plan.profileAt(t)            -> { r, y, nr, ny }   volume-normalised, with throwing rings (Float64Array each)
//     plan.spinAngle(t), spinRps(t)
//     plan.wobbleAt(t)             -> { A, phi, ex, ez }  lumpiness amplitude (1 -> 0 while centring) + off-centre offset
//     plan.toolAt(t)               -> { on, i, r, y, tr, ty, nr, ny }  rib contact where the profile moves fastest
//     plan.glazeAt(t)              -> front (in lam units; < 0 none, > 1 all) ; plan.brushAt(t) -> { on, i, r, y, ... }
//     plan.extent(t)               -> { rMax, yMax }  for framing
//     plan.events()                -> [{ t, kind, ... }] for kit/schedule.scoreFromEvents
import { clamp, smoothstep, TAU } from "../../kit/time.js";

const easeIO = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const easeIO5 = (u) => { u = clamp(u); return u * u * u * (u * (u * 6 - 15) + 10); };

// centripetal-ish uniform Catmull-Rom through pts (open), dense samples
function spline(pts, per = 24) {
  const out = [];
  const P = (k) => pts[Math.max(0, Math.min(pts.length - 1, k))];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    for (let s = 0; s < per; s++) {
      const u = s / per, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// resample a polyline at arc-length fractions fr[]
function resample(pts, fr) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1] || 1;
  let j = 0;
  return fr.map((f) => {
    const s = f * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1, u = clamp((s - cum[j]) / seg);
    return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u];
  });
}

export function counts(S) {
  const c = S.profile.counts;
  return { nb: c.bottom, no: c.outer, ni: c.inner, N: c.bottom + c.outer + c.inner };
}

/** keyProfile(S, name) -> { r: number[], y: number[] } (N points: bottom, outer, inner) */
export function keyProfile(S, name) {
  const K = S.keys[name];
  const { nb, no, ni } = counts(S);
  const foot = K.outer[0];
  const bottom = Array.from({ length: nb }, (_, k) => [foot[0] * (k / nb), 0]);
  // one spline through outer + inner so the lip is rounded; split at the lip control point
  const all = [...K.outer, ...K.inner];
  const per = 24, dense = spline(all, per);
  const lipK = (K.outer.length - 1) * per;
  const outerD = dense.slice(0, lipK + 1), innerD = dense.slice(lipK);
  const outer = resample(outerD, Array.from({ length: no }, (_, k) => k / (no - 1)));
  const inner = resample(innerD, Array.from({ length: ni }, (_, k) => (k + 1) / ni));
  const pts = [...bottom, ...outer, ...inner];
  return { r: pts.map((p) => Math.max(0, p[0])), y: pts.map((p) => Math.max(0, p[1])) };
}

/** volume of the solid of revolution bounded by the profile and the axis (Pappus over the closed polygon) */
export function volume(r, y) {
  let a = 0;
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n; // closes along the axis from the inner floor back to (0, 0)
    a += (r[i] + r[j]) * (r[i] * y[j] - r[j] * y[i]);
  }
  return Math.abs((2 * Math.PI * a) / 6);
}

/**
 * createPlan(S, P)
 *   P = { segments: [{ t0, t1, from, to, via?, stagger? }], centre: { t0, t1 }, tool: [{ t0, t1 }] (rib on windows),
 *         rings: { t0, t1 }, glaze: { t0, t1 }, slow: { t0, t1 }, duration }
 */
export function createPlan(S, P) {
  const { nb, no, ni, N } = counts(S);
  const names = Object.keys(S.keys);
  const KEYS = Object.fromEntries(names.map((n) => [n, keyProfile(S, n)]));
  const V0 = S.profile.volume ?? volume(KEYS.lump.r, KEYS.lump.y);
  // lam: 0 at the foot .. 1 at the lip on the outer wall; inner wall from the lip (1) back down to the floor (0)
  const lam = new Float64Array(N), part = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (i < nb) { lam[i] = 0; part[i] = 0; }
    else if (i < nb + no) { lam[i] = (i - nb) / (no - 1); part[i] = 1; }
    else { lam[i] = 1 - (i - nb - no + 1) / ni; part[i] = 2; }
  }
  const segs = P.segments.slice().sort((a, b) => a.t0 - b.t0);
  const HN = Object.fromEntries(names.map((n) => { const y = KEYS[n].y, m = Math.max(...y, 1e-6); return [n, y.map((v) => v / m)]; })); // height fractions
  const W = S.profile.stagger;

  // symmetric (un-normalised) profile at t
  function rawAt(t, out) {
    let si = -1;
    for (let k = 0; k < segs.length; k++) if (t >= segs[k].t0) si = k;
    const r = out.r, y = out.y;
    if (si < 0) { const A = KEYS[segs[0].from]; for (let i = 0; i < N; i++) { r[i] = A.r[i]; y[i] = A.y[i]; } return out; }
    const sg = segs[si];
    const A = KEYS[sg.from], B = KEYS[sg.to], C = sg.via ? KEYS[sg.via] : null;
    const u = clamp((t - sg.t0) / (sg.t1 - sg.t0));
    const w = sg.stagger ?? W;
    // stagger by HEIGHT in the source shape (what sits at the same height moves together): foot first, lip last;
    // the top of a solid lump (its collapsed inner wall) moves with the lip, the floor of an open pot with the foot
    const hA = HN[sg.from];
    for (let i = 0; i < N; i++) {
      const ui = (sg.via ? easeIO : easeIO5)((u * (1 + w) - w * hA[i]));
      if (C) {
        const qr = 2 * C.r[i] - (A.r[i] + B.r[i]) / 2, qy = 2 * C.y[i] - (A.y[i] + B.y[i]) / 2;
        const a = (1 - ui) * (1 - ui), b = 2 * ui * (1 - ui), c = ui * ui;
        r[i] = a * A.r[i] + b * qr + c * B.r[i];
        y[i] = a * A.y[i] + b * qy + c * B.y[i];
      } else {
        r[i] = A.r[i] + (B.r[i] - A.r[i]) * ui;
        y[i] = A.y[i] + (B.y[i] - A.y[i]) * ui;
      }
      if (r[i] < 0) r[i] = 0;
      if (y[i] < 0) y[i] = 0;
    }
    return out;
  }
  const buf = () => ({ r: new Float64Array(N), y: new Float64Array(N) });

  // 2D outward normals of a profile (central differences; degenerate spans fall back to "up")
  function normals(r, y, nr, ny) {
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      let tr = r[b] - r[a], ty = y[b] - y[a];
      const L = Math.hypot(tr, ty);
      if (L < 1e-7) { nr[i] = 0; ny[i] = 1; continue; }
      tr /= L; ty /= L;
      nr[i] = ty; ny[i] = -tr;
    }
  }
  const ringAmp = (t) => S.profile.ringAmp * smoothstep(P.rings.t0, P.rings.t1, t);

  /** profileAt(t) -> { r, y, nr, ny } volume-normalised + rings */
  function profileAt(t) {
    const o = rawAt(t, buf());
    const k = Math.sqrt(V0 / Math.max(1e-6, volume(o.r, o.y)));
    for (let i = 0; i < N; i++) o.r[i] *= k;
    const nr = new Float64Array(N), ny = new Float64Array(N);
    normals(o.r, o.y, nr, ny);
    const amp = ringAmp(t);
    if (amp > 0) {
      for (let i = nb; i < N; i++) {
        const L = lam[i];
        const taper = smoothstep(0.05, 0.14, L) * (1 - smoothstep(0.9, 0.97, L));
        const ph = L * S.profile.rings * TAU + (part[i] === 2 ? 1.1 : 0);
        const d = amp * taper * Math.sin(ph) * (0.65 + 0.35 * Math.sin(L * 5.3 + 0.7)); // uneven, like finger pressure
        o.r[i] = Math.max(0, o.r[i] + nr[i] * d);
        o.y[i] += ny[i] * d;
      }
      normals(o.r, o.y, nr, ny);
    }
    o.nr = nr; o.ny = ny; o.k = k;
    return o;
  }

  // ---- spin: piecewise-linear rps, closed-form angle
  const rps0 = S.spin.rps, rps1 = S.spin.endRps;
  const spinRps = (t) => rps0 + (rps1 - rps0) * easeIO((t - P.slow.t0) / (P.slow.t1 - P.slow.t0));
  function spinAngle(t) {
    // integral of rps0 + (rps1 - rps0) * smoothstep(u), u = (t - a) / d
    const a = P.slow.t0, d = P.slow.t1 - P.slow.t0;
    const u = clamp((t - a) / d);
    const intS = d * (u * u * u - 0.5 * u * u * u * u); // ∫0^u (3v² - 2v³) dv * d
    const tail = Math.max(0, t - P.slow.t1);
    return TAU * (rps0 * t + (rps1 - rps0) * (intS + tail));
  }

  // ---- centring wobble
  function wobbleAt(t) {
    const A = 1 - smoothstep(P.centre.t0, P.centre.t1, t);
    const phi = spinAngle(t);
    const off = S.wobble.offset * A;
    return { A, phi, ex: off * Math.cos(phi + 0.9), ez: -off * Math.sin(phi + 0.9) };
  }

  // ---- tool: rib where the profile changes fastest (velocity-weighted centroid on the outer wall)
  const toolOn = (t) => {
    let on = 0;
    for (const w of P.tool) on = Math.max(on, smoothstep(w.t0 - 0.45, w.t0, t) * (1 - smoothstep(w.t1, w.t1 + 0.45, t)));
    return on;
  };
  function speedField(t) {
    const h = 1 / 60;
    const a = profileSym(t - h), b = profileSym(t + h);
    const v = new Float64Array(N);
    for (let i = nb; i < nb + no; i++) v[i] = Math.hypot(b.r[i] - a.r[i], b.y[i] - a.y[i]) / (2 * h);
    return v;
  }
  // volume-normalised symmetric profile without rings (cheap, used for speeds)
  function profileSym(t) {
    const o = rawAt(t, buf());
    const k = Math.sqrt(V0 / Math.max(1e-6, volume(o.r, o.y)));
    for (let i = 0; i < N; i++) o.r[i] *= k;
    return o;
  }
  function toolIndex(t) {
    const v = speedField(t);
    const pr = profileSym(t), nr = new Float64Array(N), ny = new Float64Array(N);
    normals(pr.r, pr.y, nr, ny);
    let sw = 0, si = 0, vmax = 0;
    for (let i = nb; i < nb + no; i++) {
      const L = lam[i];
      if (L < 0.06 || L > 0.96) continue;
      // a rib works the SIDE of the wall: weight by how horizontal the surface normal is
      const side = Math.max(0, nr[i]);
      const w = Math.pow(v[i], 4) * side * side;
      sw += w; si += w * i; vmax = Math.max(vmax, v[i]);
    }
    const fallback = nb + Math.round(0.3 * (no - 1));
    const eps = 1e-4; // m/s^4 scale: below ~0.1 m/s the rib eases back to mid-wall
    return { i: (si + eps * fallback) / (sw + eps), vmax };
  }
  function toolAt(t) {
    const on = toolOn(t);
    const { i: fi, vmax } = toolIndex(t);
    const pr = profileAt(t);
    const i0 = Math.floor(fi), i1 = Math.min(N - 1, i0 + 1), f = fi - i0;
    const L = (a) => a[i0] + (a[i1] - a[i0]) * f;
    const r = L(pr.r), y = L(pr.y), nr = L(pr.nr), ny = L(pr.ny);
    const nl = Math.hypot(nr, ny) || 1;
    return { on, i: fi, r, y, nr: nr / nl, ny: ny / nl, tr: -ny / nl, ty: nr / nl, vmax };
  }

  // ---- glaze front + brush
  function glazeAt(t) {
    const g = P.glaze;
    return -0.06 + 1.16 * easeIO((t - g.t0) / (g.t1 - g.t0));
  }
  function brushAt(t) {
    const g = P.glaze;
    const on = smoothstep(g.t0 - 0.5, g.t0, t) * (1 - smoothstep(g.t1, g.t1 + 0.5, t));
    const front = clamp(glazeAt(t), 0.04, 0.97);
    const pr = profileAt(t);
    const fi = nb + front * (no - 1);
    const i0 = Math.floor(fi), i1 = Math.min(N - 1, i0 + 1), f = fi - i0;
    const L = (a) => a[i0] + (a[i1] - a[i0]) * f;
    const nr = L(pr.nr), ny = L(pr.ny), nl = Math.hypot(nr, ny) || 1;
    return { on, i: fi, r: L(pr.r), y: L(pr.y), nr: nr / nl, ny: ny / nl, tr: -ny / nl, ty: nr / nl };
  }

  /** extent(t) -> { rMax, yMax, pts:[[r,y]] (every 6th point) } incl. wobble growth */
  function extent(t) {
    const pr = profileAt(t), wb = wobbleAt(t);
    let rMax = 0, yMax = 0;
    const grow = 1 + S.wobble.amp * wb.A * 1.6;
    const pts = [];
    for (let i = 0; i < N; i++) {
      rMax = Math.max(rMax, pr.r[i] * grow); yMax = Math.max(yMax, pr.y[i]);
      if (i % 6 === 0 && i >= nb && i < nb + no) pts.push([pr.r[i] * grow + Math.hypot(wb.ex, wb.ez), pr.y[i]]);
    }
    return { rMax: rMax + Math.hypot(wb.ex, wb.ez), yMax, pts };
  }

  /** events for SCORE (all derived from the same P) */
  function events() {
    const ev = [];
    // wheel hum: steady, then a glide down as the wheel slows
    ev.push({ t: 0, kind: "hum", dur: P.slow.t0 + 0.2, rpsA: rps0, rpsB: rps0 });
    ev.push({ t: P.slow.t0, kind: "hum", dur: P.duration - P.slow.t0, rpsA: rps0, rpsB: rps1 });
    // centring: wet slaps that get softer as the wobble damps
    const c = P.centre;
    for (let k = 0; k < 4; k++) {
      const t = c.t0 + (k / 4) * (c.t1 - c.t0);
      ev.push({ t, kind: "squish", level: 1 - 0.18 * k, pitch: 0.9 + 0.06 * k, pan: -0.15 });
    }
    // every shaping segment: a squelch at contact and one where the profile moves fastest; the rib slides in/out
    segs.forEach((sg, k) => {
      ev.push({ t: sg.t0 + 0.04, kind: "squish", level: 0.9, pitch: 0.85 + 0.08 * k, pan: 0.2 });
      let best = { v: 0, t: (sg.t0 + sg.t1) / 2 };
      for (let tt = sg.t0 + 0.05; tt < sg.t1; tt += 0.05) { const { vmax } = toolIndex(tt); if (vmax > best.v) best = { v: vmax, t: tt }; }
      ev.push({ t: best.t, kind: "squelch", level: 0.75, pitch: 1.05 + 0.06 * k, pan: 0.25, dur: Math.min(0.9, (sg.t1 - sg.t0) * 0.45) });
    });
    P.tool.forEach((w) => { ev.push({ t: w.t0 - 0.4, kind: "toolIn", pan: 0.35 }); ev.push({ t: w.t1 + 0.05, kind: "toolOut", pan: 0.35 }); });
    // glaze: brush strokes once per wheel revolution while the front climbs, then a bright finishing chord
    const g = P.glaze;
    let lastRev = Math.floor(spinAngle(g.t0) / TAU);
    for (let t = g.t0; t <= g.t1; t += 1 / 60) {
      const rev = Math.floor(spinAngle(t) / TAU);
      if (rev !== lastRev) { ev.push({ t, kind: "brush", pan: -0.3 }); lastRev = rev; }
    }
    ev.push({ t: g.t0, kind: "brush", pan: -0.3 });
    ev.push({ t: g.t1 + 0.1, kind: "finish" });
    return ev.sort((a, b) => a.t - b.t);
  }

  return { N, nb, no, ni, lam, part, KEYS, V0, profileAt, profileSym, spinAngle, spinRps, wobbleAt, toolAt, toolOn, glazeAt, brushAt, extent, events };
}

/** wheelVoices(SND, S) -> voices for kit/schedule.scoreFromEvents */
export function wheelVoices(SND) {
  const hz = (rps) => SND.hum.hz0 + SND.hum.hzPerRps * rps;
  return {
    hum: (e) => [{ type: "whir", dur: e.dur, hz: hz(e.rpsA), hz2: hz(e.rpsB), grit: SND.hum.grit, gain: SND.hum.gain }],
    squish: (e) => [{ type: "squish", dur: 0.34, pitch: SND.squish.pitch * (e.pitch ?? 1), gain: SND.squish.gain * (e.level ?? 1) }],
    squelch: (e) => [
      { type: "squish", dur: 0.42, pitch: SND.squish.pitch * (e.pitch ?? 1) * 0.8, gain: SND.squish.gain * 0.8 * (e.level ?? 1) },
      { type: "rustle", dur: e.dur ?? 0.6, density: 0.25, pitch: 0.6, gain: SND.squish.gain * 0.35, offset: 0.05 },
    ],
    toolIn: () => [{ type: "whoosh", dir: "in", dur: 0.45, q: 1.1, pitch: 1.2, gain: SND.tool.gain }],
    toolOut: () => [{ type: "whoosh", dir: "out", dur: 0.4, q: 1.1, pitch: 1.3, gain: SND.tool.gain * 0.8 }],
    brush: () => [{ type: "rustle", dur: 0.5, density: 0.5, pitch: 1.4, gain: SND.brush.gain }],
    finish: () => [
      { type: "marimba", hz: SND.finish.hz, notes: [0, 4, 7, 12], step: 0.11, decay: 0.5, mallet: 0.6, gain: SND.finish.gain },
      { type: "chime", dur: 1.6, notes: 5, gain: 0.16, offset: 0.25 },
    ],
  };
}
