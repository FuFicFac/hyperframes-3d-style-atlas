// styles/impasto/strokes.js — the stroke planner for "Impasto". PURE: no THREE, no window, no DOM (Node-safe), so
// scene.config.js imports it for SCORE and style.js reads the very same plan for the picture.
//
// Canvas coords: x in [0, W] left -> right, y in [0, H] bottom -> top (metres). A composition is a list of REGIONS (moon,
// stars, sky, cypress, village, far hills, fields), each with a seeded vector FIELD (vortices, wind, contours, flame) and
// a palette. Strokes:
//   1. seed points: a jittered grid (per-region spacing) + concentric rings around the moon and the stars;
//   2. each stroke's centreline is the field's streamline through its seed point, integrated once (RK2, ds = 1 cm) from
//      s = -L/2 to s = flowMax + L/2, stored as samples; heading = streamline tangent, curvature = turning over the stroke
//      length (the picture bends each instance into a constant-curvature arc);
//   3. a SCHEDULE gives each stroke a start time and a duration, per region group, accelerating within a beat (the first
//      strokes are slow enough to read and hear, later ones become a time-lapse);
//   4. at time t a stroke's progress = outCubic((t - start) / dur); after `flow.t0` it slides along its own streamline by
//      s(t) = v * G(t) (G = eased ramp then linear) — a pure function of t, nothing integrated per frame;
//   5. an UNDERPAINT grid records, per cell, the earliest paint time and the colour of the stroke that covers it, so the
//      gaps between strokes show a thin wash of the right colour once the brush has passed.
// Sound comes from the same schedule: one brush stroke sound per stroke start (merged when strokes start closer than
// `sound.minGap`), a wet "lift" plop at the end of every slow stroke, beat accents and a flow swell.
import { clamp, lerp, smoothstep, rng, ease } from "../../kit/time.js";
import { fbm2 } from "../../kit/noise.js";

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

/** createPlan(o) -> plan. o = { W, H, seed, comp (composition), size (per-region stroke sizes), schedule, flow, under } */
export function createPlan(o) {
  const W = o.W, H = o.H, C = o.comp, seed = o.seed ?? 64;
  const R = rng(seed);
  const nx = (x) => x / W, ny = (y) => y / H;

  // ------------------------------------------------------------------ composition curves (normalised u, v)
  const horizon = (u) => C.horizon[0] + C.horizon[1] * Math.sin(2.1 * u + 0.5) + C.horizon[2] * Math.sin(5.3 * u + 1.2);
  const horizonD = (u) => C.horizon[1] * 2.1 * Math.cos(2.1 * u + 0.5) + C.horizon[2] * 5.3 * Math.cos(5.3 * u + 1.2);
  const nearH = (u) => C.near[0] + C.near[1] * Math.sin(3.0 * u + 2.0) + C.near[2] * Math.sin(7.0 * u + 0.4);
  const nearHD = (u) => C.near[1] * 3.0 * Math.cos(3.0 * u + 2.0) + C.near[2] * 7.0 * Math.cos(7.0 * u + 0.4);
  const cyp = C.cypress;
  const cypCx = (y) => cyp.x * W + cyp.sway * Math.sin(y * 2.6 + 0.4);
  const cypHw = (y) => { const k = clamp(y / (cyp.top * H)); return k >= 1 ? 0 : cyp.hw * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + k * 0.82)), 0.75) * (1 - 0.3 * k); };
  const moon = { x: C.moon.x * W, y: C.moon.y * H, r: C.moon.r, halo: C.moon.halo };
  const stars = C.stars.map(([u, v, s]) => ({ x: u * W, y: v * H, r: C.star.r * s, halo: C.star.halo * s }));
  const vort = C.vortices.map((q) => ({ x: q.x * W, y: q.y * H, R: q.R, s: q.s }));
  const vil = C.village;
  const inVillage = (u, v) => u > vil.u0 && u < vil.u1 && v > nearH(u) + vil.v0 && v < nearH(u) + vil.v1 && v < horizon(u) - 0.01;

  /** region(x, y) -> id (priority: cypress > moon > star > sky > village > hills > fields) */
  function region(x, y) {
    if (Math.abs(x - cypCx(y)) < cypHw(y)) return "cypress";
    if (Math.hypot(x - moon.x, y - moon.y) < moon.halo) return "moon";
    for (let k = 0; k < stars.length; k++) if (Math.hypot(x - stars[k].x, y - stars[k].y) < stars[k].halo) return "star" + k;
    const u = nx(x), v = ny(y);
    if (v > horizon(u)) return "sky";
    if (inVillage(u, v)) return "village";
    if (v > nearH(u)) return "hills";
    return "fields";
  }
  const kindOf = (reg) => (reg.startsWith("star") ? "star" : reg);

  // ------------------------------------------------------------------ fields (unnormalised direction vectors)
  const swirl = (x, y, c, R0, s) => {
    const dx = x - c.x, dy = y - c.y, r = Math.hypot(dx, dy) + 1e-6, f = s * Math.exp(-((r / R0) ** 2));
    return [(-dy / r) * f, (dx / r) * f];
  };
  function field(reg, x, y) {
    const k = kindOf(reg);
    if (k === "moon" || k === "star") {
      const c = k === "moon" ? moon : stars[+reg.slice(4)];
      const dx = x - c.x, dy = y - c.y, r = Math.hypot(dx, dy) + 1e-6;
      return [-dy / r, dx / r]; // concentric halo rings, counter-clockwise
    }
    if (k === "sky") {
      let fx = C.wind, fy = C.wind * 0.3 * Math.sin(x * 1.6 + y * 2.5 + 0.7);
      for (const q of vort) { const [a, b] = swirl(x, y, q, q.R, q.s); fx += a; fy += b; }
      const [a, b] = swirl(x, y, moon, moon.halo * 1.5, 1.2); fx += a; fy += b;
      for (const s of stars) { const [c, d] = swirl(x, y, s, s.halo * 1.6, 0.9); fx += c; fy += d; }
      return [fx, fy];
    }
    if (k === "cypress") {
      const cx = cypCx(y), hw = Math.max(0.05, cypHw(y));
      // flame: long upward licks that sway in S-curves and lean gently toward the centreline near the tip
      const k = clamp(y / (cyp.top * H));
      return [0.45 * Math.sin(y * 5.5 + (x - cx) * 6) - 0.18 * k * (x - cx) / hw, 1];
    }
    const u = nx(x), v = ny(y);
    if (k === "hills" || k === "village") {
      if (k === "village") return [1, 0.08 * Math.sin(x * 7)];
      const tt = clamp((v - nearH(u)) / Math.max(0.02, horizon(u) - nearH(u)));
      return [1, (H / W) * lerp(nearHD(u), horizonD(u), tt) + 0.12 * Math.sin(x * 4 + y * 6)];
    }
    // fields: rolling furrows that follow the near-hill line and flatten toward the bottom edge
    const tt = clamp(v / Math.max(0.05, nearH(u)));
    return [1, (H / W) * nearHD(u) * tt + 0.35 * Math.sin(x * 3.1 + y * 5.3) * (1 - 0.5 * tt)];
  }
  const dirAt = (reg, x, y, sgn) => { const [a, b] = field(reg, x, y), l = Math.hypot(a, b) + 1e-9; return [(a / l) * sgn, (b / l) * sgn]; };
  /** streamline samples from s0 to s1 (ds) through (x, y): Float32Array of [x, y] */
  function streamline(reg, x, y, s0, s1, ds) {
    const nb = Math.round(-s0 / ds), nf = Math.round(s1 / ds), n = nb + nf + 1, P = new Float32Array(n * 2);
    P[2 * nb] = x; P[2 * nb + 1] = y;
    for (const [sgn, cnt] of [[1, nf], [-1, nb]]) {
      let px = x, py = y;
      for (let i = 1; i <= cnt; i++) {
        const [ax, ay] = dirAt(reg, px, py, sgn), [bx, by] = dirAt(reg, px + ax * ds * 0.5, py + ay * ds * 0.5, sgn);
        px += bx * ds; py += by * ds;
        const j = nb + sgn * i; P[2 * j] = px; P[2 * j + 1] = py;
      }
    }
    return { P, n, nb };
  }

  // ------------------------------------------------------------------ colours
  const PAL = C.palette;
  function colours(reg, x, y, r) {
    const k = kindOf(reg), u = nx(x), v = ny(y), nz = fbm2(x * 1.3, y * 1.3, { seed: seed + 5, octaves: 3 });
    let list;
    if (k === "moon") { const d = Math.hypot(x - moon.x, y - moon.y); list = d < moon.r ? PAL.moonCore : d < moon.r * 1.9 ? PAL.moonRing : PAL.moonHalo; }
    else if (k === "star") { const s = stars[+reg.slice(4)], d = Math.hypot(x - s.x, y - s.y); list = d < s.r ? PAL.starCore : PAL.starHalo; }
    else if (k === "sky") {
      // light bands spiral through the big swirl; elsewhere cobalt/ultramarine with light streaks
      const q = vort[0], d = Math.hypot(x - q.x, y - q.y), a = Math.atan2(y - q.y, x - q.x);
      const band = (d / C.bandPitch + a / TAU * 0.6 + nz * 0.8) % 1;
      if (d < q.R * 1.15) list = band < 0.42 ? PAL.skyLight : PAL.skyMid;
      else list = r.chance(0.22 + 0.25 * nz) ? PAL.skyLight : v > 0.9 ? PAL.skyDeep : PAL.skyMid;
    }
    else if (k === "cypress") list = PAL.cypress;
    else if (k === "village") list = r.chance(0.18) ? PAL.window : r.chance(0.3) ? PAL.roof : PAL.wall;
    else if (k === "hills") list = PAL.hills;
    else list = v < nearH(u) * 0.45 ? PAL.fieldsLow : PAL.fields;
    const a = r.pick(list);
    let b = r.pick(list); if (b === a) b = r.pick(list);
    return [a, b];
  }

  // ------------------------------------------------------------------ seed points
  const pts = [];
  const haloOf = (x, y) => Math.hypot(x - moon.x, y - moon.y) < moon.halo + 0.02 || stars.some((s) => Math.hypot(x - s.x, y - s.y) < s.halo + 0.01);
  const grid = (cell, keep) => {
    const nxC = Math.ceil(W / cell), nyC = Math.ceil(H / cell);
    for (let j = 0; j < nyC; j++) for (let i = 0; i < nxC; i++) {
      const x = (i + 0.5 + R.range(-0.42, 0.42)) * cell, y = (j + 0.5 + R.range(-0.42, 0.42)) * cell;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const reg = region(x, y);
      if (keep(reg, x, y)) pts.push({ x, y, reg });
    }
  };
  const S = o.size;
  grid(S.cell, (reg, x, y) => !haloOf(x, y) && reg !== "cypress" && reg !== "village");
  grid(S.cypressCell, (reg) => reg === "cypress");
  grid(S.villageCell, (reg) => reg === "village");
  const ring = (c, radii, pitch, reg) => {
    for (const rr of radii) {
      const n = Math.max(3, Math.round((TAU * rr) / pitch)), a0 = R.range(0, TAU);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * TAU + R.range(-0.08, 0.08), r2 = rr + R.range(-0.012, 0.012);
        const x = c.x + Math.cos(a) * r2, y = c.y + Math.sin(a) * r2;
        if (region(x, y) === "cypress") continue;
        pts.push({ x, y, reg, ring: rr });
      }
    }
  };
  ring(moon, C.moon.rings, S.moonPitch, "moon");
  stars.forEach((s, k) => ring(s, C.star.rings.map((q) => q * (s.r / C.star.r)), S.starPitch, "star" + k));

  // ------------------------------------------------------------------ strokes
  const DS = 0.01;
  const flowSpeed = (k) => o.flow.speed[k] ?? 0;
  const G = (t) => { const tp = Math.max(0, t - o.flow.t0), rp = o.flow.ramp; return tp < rp ? (tp * tp) / (2 * rp) : tp - rp / 2; };
  const flowEnd = G(o.flow.t1 ?? 15);
  const strokes = pts.map((p, idx) => {
    const k = kindOf(p.reg), sz = S[k] ?? S.sky, r = R.fork(idx + 17);
    const L = Math.min(sz.L * r.range(0.82, 1.18), p.ring ? p.ring * 2.4 + 0.05 : Infinity), Wd = sz.W * r.range(0.85, 1.15), Ht = sz.H * r.range(0.8, 1.2);
    const v = flowSpeed(k) * r.range(0.75, 1.25);
    const fMax = v * flowEnd + 0.02;
    const sl = streamline(p.reg, p.x, p.y, -L / 2 - DS, fMax + L / 2 + DS, DS);
    const [cA, cB] = colours(p.reg, p.x, p.y, r);
    return { i: idx, reg: p.reg, kind: k, x: p.x, y: p.y, L, W: Wd, H: Ht, v, cA, cB, seed: r.next(), flip: r.chance(0.5) ? 1 : -1, sl, ring: p.ring ?? 0 };
  });

  /** pose on the streamline at arc offset s (from the seed point): [x, y, heading, curvature] (canvas coords) */
  function poseAt(st, s) {
    const { P, n, nb } = st.sl;
    const at = (q) => { const f = clamp(nb + q / DS, 0, n - 1.001), i = Math.floor(f), w = f - i; return [lerp(P[2 * i], P[2 * i + 2], w), lerp(P[2 * i + 1], P[2 * i + 3], w)]; };
    const c = at(s), a = at(s - DS), b = at(s + DS);
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h0 = at(s - st.L / 2), h1 = at(s - st.L / 2 + DS), e0 = at(s + st.L / 2 - DS), e1 = at(s + st.L / 2);
    const thA = Math.atan2(h1[1] - h0[1], h1[0] - h0[0]), thB = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]);
    let kap = wrap(thB - thA) / st.L;
    const kmax = 2.4 / st.L; kap = clamp(kap, -kmax, kmax);
    return [c[0], c[1], th, kap];
  }

  // ------------------------------------------------------------------ schedule (start, dur per stroke)
  // groups in painting order; inside a group a sort key decides the order; times accelerate (x^accel).
  const groupOf = (st) => {
    if (st.kind === "moon") return "moon";
    if (st.kind === "star") return "stars";
    return st.kind;
  };
  const keyOf = {
    moon: (st) => st.ring * 10 + Math.atan2(st.y - moon.y, st.x - moon.x) * 0.05,
    stars: (st) => { const k = +st.reg.slice(4), s = stars[k]; return Math.hypot(moon.x - s.x, moon.y - s.y) * 4 + k * 0.1 + Math.hypot(st.x - s.x, st.y - s.y); },
    sky: (st) => { const q = vort[0]; return Math.hypot(st.x - q.x, st.y - q.y) + 0.12 * Math.sin(Math.atan2(st.y - q.y, st.x - q.x) * 2) + st.seed * 0.15; },
    hills: (st) => st.x * 0.3 - st.y + st.seed * 0.3,
    village: (st) => st.x + st.seed * 0.2,
    fields: (st) => -st.y * 1.2 + st.x * 0.15 + st.seed * 0.3,
    cypress: (st) => st.y + st.seed * 0.12,
  };
  for (const g of o.schedule) {
    const list = strokes.filter((st) => g.groups.includes(groupOf(st)));
    list.sort((a, b) => (g.groups.indexOf(groupOf(a)) - g.groups.indexOf(groupOf(b))) * 1e3 + keyOf[groupOf(a)](a) - keyOf[groupOf(b)](b));
    // the first `lead[0]` strokes go down one at a time, `lead[1]` s apart (readable + audible); the rest share the
    // remaining span with start = t_lead + span' * x^pace (pace < 1: gaps shrink = the painting accelerates)
    const n = list.length, [nl, gap] = g.lead ?? [0, 0], lead = Math.min(nl, n);
    const tl = g.t0 + lead * gap, rest = n - lead, span = g.t1 - tl;
    list.forEach((st, j) => {
      if (j < lead) { st.start = g.t0 + j * gap; st.dur = g.dur[0]; }
      else {
        const x = rest > 1 ? (j - lead) / (rest - 1) : 0;
        st.dur = lerp(g.dur[0], g.dur[1], Math.pow(x, 0.5));
        st.start = tl + (span - st.dur) * Math.pow(x, g.pace ?? 1);
      }
      st.group = g.id;
    });
  }
  strokes.sort((a, b) => a.start - b.start);
  strokes.forEach((st, j) => { st.order = j; });
  const N = strokes.length;

  /** progress 0..1 of stroke st at t */
  const progressAt = (st, t) => ease.outCubic(clamp((t - st.start) / st.dur));
  /** flow offset (m along the stroke's own streamline) at t */
  const flowAt = (st, t) => st.v * G(t);
  /** state(t, out Float32Array(N*5)) -> per stroke (in paint order): x, y, heading, curvature, progress */
  function stateAt(t, out = new Float32Array(N * 5)) {
    for (let j = 0; j < N; j++) {
      const st = strokes[j], p = poseAt(st, flowAt(st, t)), b = j * 5;
      out[b] = p[0]; out[b + 1] = p[1]; out[b + 2] = p[2]; out[b + 3] = p[3]; out[b + 4] = progressAt(st, t);
    }
    return out;
  }
  const paintedBy = (t) => { let c = 0; for (const st of strokes) if (t >= st.start + st.dur) c++; return c; };

  // ------------------------------------------------------------------ underpaint grid
  const U = o.under, gw = U.w, gh = U.h, ut = new Float32Array(gw * gh).fill(Infinity), uc = new Array(gw * gh).fill(null);
  for (const st of strokes) {
    const steps = 20;
    for (let k = 0; k <= steps; k++) {
      const s = -st.L / 2 + (k / steps) * st.L, p = poseAt(st, s), tt = st.start + st.dur * (k / steps) * 0.8 + U.delay;
      const rad = st.W * 0.5 * U.reach, ci = (p[0] / W) * gw, cj = (p[1] / H) * gh, ri = (rad / W) * gw + 0.5;
      for (let j = Math.floor(cj - ri); j <= Math.ceil(cj + ri); j++) for (let i = Math.floor(ci - ri); i <= Math.ceil(ci + ri); i++) {
        if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
        if (Math.hypot(i + 0.5 - ci, j + 0.5 - cj) > ri) continue;
        const q = j * gw + i;
        if (tt < ut[q]) { ut[q] = tt; uc[q] = st.cA; }
      }
    }
  }
  for (let pass = 0; pass < U.dilate; pass++) {
    const t2 = ut.slice(), c2 = uc.slice();
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const q = j * gw + i; if (uc[q]) continue;
      let best = Infinity, bc = null;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= gw || b >= gh) continue;
        const r = b * gw + a; if (uc[r] && ut[r] + U.dilateLag < best) { best = ut[r] + U.dilateLag; bc = uc[r]; }
      }
      if (bc) { t2[q] = best; c2[q] = bc; }
    }
    ut.set(t2); for (let q = 0; q < uc.length; q++) uc[q] = c2[q];
  }
  let uncovered = 0;
  for (let q = 0; q < uc.length; q++) if (!uc[q]) uncovered++;
  /** underpaint -> { w, h, tmax, time: Float32Array (s, Infinity = never), color: hex|null } (row 0 = canvas bottom) */
  const underpaint = { w: gw, h: gh, time: ut, color: uc, uncovered };

  // ------------------------------------------------------------------ sound events
  function events(SND, beats) {
    const ev = [];
    let last = -Infinity;
    for (const st of strokes) {
      if (st.start - last >= SND.minGap) {
        ev.push({ kind: "brush", t: +st.start.toFixed(4), dur: st.dur, x: st.x / W, size: st.L * st.W, slow: st.dur >= SND.slowDur, order: st.order });
        last = st.start;
      }
      if (st.dur >= SND.slowDur) ev.push({ kind: "lift", t: +(st.start + st.dur * 0.86).toFixed(4), x: st.x / W, order: st.order });
    }
    for (const b of beats) ev.push({ kind: "beat", t: b.t, id: b.id, k: beats.indexOf(b) });
    ev.push({ kind: "flow", t: o.flow.t0, dur: (o.flow.t1 ?? 15) - o.flow.t0 });
    return ev.sort((a, b) => a.t - b.t);
  }

  return {
    W, H, n: N, strokes, region, field, poseAt, progressAt, flowAt, stateAt, paintedBy, underpaint, events,
    moon, stars, vortices: vort, horizon, nearH, G,
    groups: o.schedule.map((g) => ({ id: g.id, t0: g.t0, t1: g.t1, count: strokes.filter((s) => s.group === g.id).length })),
  };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function impastoVoices(SND, beats) {
  return {
    brush: (e) => [
      { type: "penScratch", dur: clamp(e.dur * 1.1, 0.09, 0.42), pitch: SND.brush.pitch, speed: 0.55, gain: SND.brush.gain * (e.slow ? 1 : SND.brush.fast), pan: (e.x - 0.5) * 1.2 },
      { type: "rustle", dur: clamp(e.dur * 1.2, 0.1, 0.45), density: 0.55, pitch: 0.7, gain: SND.brush.body * (e.slow ? 1 : SND.brush.fast), pan: (e.x - 0.5) * 1.2 },
    ],
    lift: (e) => [{ type: "squish", dur: 0.22, pitch: 1.5, gain: SND.lift.gain, pan: (e.x - 0.5) * 1.2 }],
    beat: (e) => [{ type: "marimba", hz: SND.beat.notes[e.k % SND.beat.notes.length], decay: 0.5, dur: 1.4, gain: SND.beat.gain, mallet: 0.3 }],
    flow: (e) => [
      { type: "whoosh", dir: "in", dur: 1.6, q: 0.7, pitch: 0.6, gain: SND.flow.whoosh, offset: -0.6 },
      { type: "pad", bus: "music", root: SND.flow.root, chord: SND.flow.chord, dur: e.dur + 0.4, attack: 1.2, release: 1.4, brightness: SND.flow.brightness, gain: SND.flow.gain },
    ],
  };
}
