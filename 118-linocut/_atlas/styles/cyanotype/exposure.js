// styles/cyanotype/exposure.js — the cyanotype planner. Pure: no THREE, no window, no DOM. Imported by style.js (the
// picture) and by the demo's scene.config.js (camera, framing gate, SCORE), so picture and sound share one plan.
//
// What it plans
//   - the SUN: a piecewise-linear level I(t) (0 = shade, 1 = full sun) and its running integral S(t) in closed form
//     (sum of trapezoids + one partial segment). S is the dose an uncovered point of the paper has received at t.
//   - the OBJECTS: each has a drop (toss in, land, settle), a lift (rise, fly off) and a coverage channel. While it lies
//     on the paper it blocks the sun, so the dose under it is S(t) minus what fell while it was there:
//         dose(p, t) = S(t) - sum_i mask_i(p) * ( S(min(t, off_i)) - S(min(t, on_i)) )
//     on_i = landing time, off_i = the moment its shadow leaves the print (a little after the lift starts). The scene
//     passes S(t) and the four covered integrals to the paper shader; mask_i(p) is the object's baked silhouette.
//   - the PRINT RESPONSE: k(d) = (1 - exp(-d / tau)) / (1 - exp(-Sfull / tau)), tau = cfg.tau * Sfull, so the open
//     paper reaches k = 1 exactly when the sun goes away. (Art-directed curve: no chemistry is simulated.)
//   - beat 5: pins pop, the sheet slides into the tray, the water front crosses the sheet.
//   - SILHOUETTES: fern frond, key, feather and lace as plain 2D polygons / circle lists (metres, object-local,
//     y up as seen from above). style.js turns the same data into meshes AND into the print masks.
//   - EVENTS for the score (land, settle, sun, lift, pin, slide, tray, wash, chime).
// Every time the score and the picture share comes from the config with + - * / only, so Node and Chrome agree to the
// bit; fingerprint(plan) is recorded by the demo and checked in both.
import { clamp, ease, rng } from "../../kit/time.js";

const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;

// ------------------------------------------------------------------------------------------------ the sun
/** sunLevel(keys, t) -> piecewise-linear level; keys = [[t, level], ...] ascending; holds outside */
export function sunLevel(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let j = 0; j < keys.length - 1; j++) {
    const [t0, v0] = keys[j], [t1, v1] = keys[j + 1];
    if (t <= t1) return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1;
  }
  return keys[keys.length - 1][1];
}
/** sunDose(keys, t) -> integral of the level from keys[0].t (or 0) to t, closed form */
export function sunDose(keys, t) {
  let S = 0;
  const tStart = Math.min(0, keys[0][0]);
  if (t <= tStart) return 0;
  // before the first key the level holds at keys[0][1]
  if (keys[0][0] > tStart) S += keys[0][1] * (Math.min(t, keys[0][0]) - tStart);
  for (let j = 0; j < keys.length - 1; j++) {
    const [t0, v0] = keys[j], [t1, v1] = keys[j + 1];
    if (t <= t0) return S;
    if (t >= t1) { S += ((t1 - t0) * (v0 + v1)) / 2; continue; }
    const dt = t - t0, v = t1 > t0 ? v0 + ((v1 - v0) * dt) / (t1 - t0) : v1;
    return S + (dt * (v0 + v)) / 2;
  }
  const [tl, vl] = keys[keys.length - 1];
  return S + vl * (t - tl);
}

// ------------------------------------------------------------------------------------------------ the plan
/**
 * createPlan(cfg) -> plan
 * cfg = {
 *   duration, sun: [[t, level]], tau (fraction of the full dose),
 *   objects: [{ id, ch (mask channel 0..3), pos: [x, z], rot,
 *               drop: { t0, dur, from: [dx, h, dz], spin, kind: "toss"|"glide", sway?, settle?, bounce? },
 *               lift: { t0, dur, to: [dx, h, dz], spin, kind?, leave? (fraction of dur until the shadow has gone) } }],
 *   pins: { t0, step, dur, rise, to: [[dx, dz] x4] },
 *   slide: { t0, dur, dx, rise, y0, y1 },
 *   wash: { t0, dur, x0, x1, develop },
 *   chimes: [t, ...]
 * }
 */
export function createPlan(cfg) {
  const sun = cfg.sun;
  const S = (t) => sunDose(sun, t);
  const objs = cfg.objects.map((o) => {
    const land = o.drop.t0 + o.drop.dur;
    const off = o.lift.t0 + o.lift.dur * (o.lift.leave ?? 0.2);
    return { ...o, land, on: land, off, gone: o.lift.t0 + o.lift.dur };
  });
  // the full open-paper dose: the sun is down for good after its last key (level 0 at the end)
  const Sfull = S(cfg.duration);
  const tau = (cfg.tau ?? 0.7) * Sfull;
  const kNorm = 1 - Math.exp(-Sfull / tau);

  /** covered integral of object i up to t: S(min(t, off)) - S(min(t, on)) */
  const covered = (o, t) => S(Math.min(t, o.off)) - S(Math.min(t, o.on));
  /** k for a dose */
  const response = (d) => (1 - Math.exp(-Math.max(0, d) / tau)) / kNorm;

  // ---- object poses (all closed forms of t) ----
  function objectAt(i, t) {
    const o = objs[i], D = o.drop, L = o.lift;
    const P = { visible: true, x: o.pos[0], y: 0, z: o.pos[1], rot: o.rot, tiltX: 0, tiltZ: 0, phase: "rest" };
    if (t < D.t0) return { ...P, visible: false, phase: "before" };
    if (t >= o.gone) return { ...P, visible: false, phase: "gone" };
    if (t < o.land) {
      const u = (t - D.t0) / D.dur;
      P.phase = "drop";
      if (D.kind === "glide") {
        // a feather: drifts in, sinking, rocking side to side
        const h = ease.outSine(u);
        P.x += D.from[0] * (1 - h); P.z += D.from[2] * (1 - h);
        P.y = D.from[1] * Math.pow(1 - u, 1.4);
        const sway = D.sway ?? 0.35;
        P.tiltX = sway * Math.sin(TAU * 1.25 * u) * (1 - u);
        P.tiltZ = 0.5 * sway * Math.sin(TAU * 0.8 * u + 0.6) * (1 - u);
        P.rot += (D.spin ?? 0) * (1 - ease.outCubic(u));
      } else {
        // tossed: slows a little horizontally, falls accelerating
        const h = ease.outQuad(u);
        P.x += D.from[0] * (1 - h); P.z += D.from[2] * (1 - h);
        P.y = D.from[1] * (1 - u * u);
        P.rot += (D.spin ?? 0) * (1 - ease.outCubic(u));
        P.tiltX = (D.tilt ?? 0.25) * (1 - u);
      }
      return P;
    }
    if (t < L.t0) {
      // settle after landing: one small damped hop + rock
      const v = t - o.land, st = D.settle ?? 0.45;
      if (v < st) {
        const w = v / st, damp = Math.exp(-4 * w);
        P.y = (D.bounce ?? 0.006) * Math.abs(Math.sin(Math.PI * 2 * w)) * damp;
        P.tiltX = (D.rock ?? 0.03) * Math.sin(TAU * 1.5 * w) * damp;
      }
      return P;
    }
    // lift: rise, then fly off (accelerating), turning
    const u = (t - L.t0) / L.dur;
    P.phase = "lift";
    const a = ease.inCubic(u);
    P.x += L.to[0] * a; P.z += L.to[2] * a;
    P.y = L.to[1] * ease.outQuad(Math.min(1, u * 1.6));
    P.rot += (L.spin ?? 0) * ease.inQuad(u);
    if (L.kind === "flutter") {
      P.tiltX = 0.45 * Math.sin(TAU * 1.6 * u) * u;
      P.tiltZ = 0.25 * Math.sin(TAU * 1.1 * u + 1.0) * u;
    } else {
      P.tiltX = -0.35 * ease.inQuad(u);
    }
    return P;
  }

  // ---- beat 5 ----
  const PN = cfg.pins, SL = cfg.slide, W = cfg.wash;
  function pinAt(j, t) {
    const t0 = PN.t0 + j * PN.step, u = clamp((t - t0) / PN.dur);
    if (u >= 1) return { visible: false, y: 0, dx: 0, dz: 0, spin: 0 };
    const to = PN.to[j];
    return { visible: true, y: PN.rise * ease.outQuad(u), dx: to[0] * ease.inQuad(u), dz: to[1] * ease.inQuad(u), spin: 3 * u };
  }
  function sheetAt(t) {
    const u = clamp((t - SL.t0) / SL.dur);
    const s = ease.inOutCubic(u);
    // up over the tray wall and down into the tray (a hump in y, base level eased from board to tray floor)
    const y = lerp(SL.y0, SL.y1, ease.inOutSine(clamp((u - 0.55) / 0.45))) + SL.rise * Math.sin(Math.PI * clamp(u * 1.05));
    return { x: SL.dx * s, y, u, tilt: 0.05 * Math.sin(Math.PI * u) };
  }
  /** wash front position (sheet-local x, m): -inf before, +inf after */
  function washAt(t) {
    if (t < W.t0) return -Infinity;
    const u = (t - W.t0) / W.dur;
    if (u > 1.35) return Infinity;
    return lerp(W.x0, W.x1, ease.inOutSine(clamp(u)) * 0.85 + 0.15 * clamp(u)) + (u > 1 ? (u - 1) * 2 : 0);
  }

  // ---- events (sound) ----
  const ev = [];
  objs.forEach((o, i) => {
    ev.push({ kind: "land", t: o.land, obj: o.id, i });
    if ((o.drop.settle ?? 0.45) > 0.2 && o.drop.kind !== "glide") ev.push({ kind: "settle", t: o.land + (o.drop.settle ?? 0.45) * 0.5, obj: o.id, i });
    ev.push({ kind: "lift", t: o.lift.t0, dur: o.lift.dur, obj: o.id, i });
  });
  ev.push({ kind: "sunOn", t: sun[1][0], dur: sun[2][0] - sun[1][0] });
  const sunDownAt = sun[sun.length - 2][0];
  ev.push({ kind: "sunOff", t: sunDownAt, dur: sun[sun.length - 1][0] - sunDownAt });
  for (let j = 0; j < 4; j++) ev.push({ kind: "pin", t: PN.t0 + j * PN.step, i: j });
  ev.push({ kind: "slide", t: SL.t0, dur: SL.dur });
  ev.push({ kind: "tray", t: SL.t0 + SL.dur * 0.97 });
  ev.push({ kind: "wash", t: W.t0, dur: W.dur });
  (cfg.chimes ?? []).forEach((t, i) => ev.push({ kind: "chime", t, i }));
  ev.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));

  return {
    cfg, objects: objs, Sfull, tau, kNorm, events: ev, sunDownAt,
    sunAt: (t) => sunLevel(sun, t), doseAt: S, covered, response, objectAt, pinAt, sheetAt, washAt,
    /** the four covered integrals at t, by mask channel */
    coverAt(t) { const c = [0, 0, 0, 0]; objs.forEach((o) => { c[o.ch] = covered(o, t); }); return c; },
    /** the print value k at t for a point covered by object id (fully) or open (id = null) */
    kAt(id, t) { const o = objs.find((q) => q.id === id); return response(S(t) - (o ? covered(o, t) : 0)); },
  };
}

/** fingerprint(plan) -> short hex of every event time + the dose constants (rounded to 1e-6): print it in Node and the page */
export function fingerprint(plan) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const x = Math.round(v * 1e6) | 0; h ^= x & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= x >>> 16; h = Math.imul(h, 16777619) >>> 0; };
  plan.events.forEach((e) => { mix(e.t); mix(e.dur ?? 0); });
  mix(plan.Sfull);
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ------------------------------------------------------------------------------------------------ silhouettes
// All in metres, object-local, x along the object, y "up" as seen from above (world z = -y before the object's turn).

/**
 * fernFrond({ length, pairs, leaf, width, bend, seed }) -> { pinnae: [poly], rachis: poly, bbox }
 * A once-pinnate frond: tapering rachis + stipe, alternate pinnae angled toward the tip, each a lobed lanceolate leaf.
 */
export function fernFrond(o = {}) {
  const L = o.length ?? 0.78, n = o.pairs ?? 19, Lp = o.leaf ?? 0.17, Wp = o.width ?? 0.024, bend = o.bend ?? 0.06;
  const R = rng(o.seed ?? 120);
  const stipe = o.stipe ?? 0.12;
  // centre line: from the stipe end (-stipe) to the tip (L), bowed sideways
  const C = (s) => [s * L, bend * L * Math.sin(Math.PI * clamp(s)) * 0.5 + bend * L * 0.25 * s * s];
  const Tn = (s) => { const a = C(s - 0.002), b = C(s + 0.002); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  const pinnae = [];
  const s0 = 0.06;
  for (let i = 0; i < 2 * n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const q = i / (2 * n - 1);
    const s = s0 + (0.97 - s0) * Math.pow(q, 0.92) + (side > 0 ? 0 : 0.012);
    const grow = Math.min(1, 0.45 + 0.55 * (s / 0.28));
    const len = Lp * grow * Math.pow(1 - s, 0.75) * (0.92 + 0.16 * R.next()) + 0.012;
    const wid = Wp * (0.55 + 0.45 * grow) * Math.pow(1 - 0.6 * s, 1) * (0.9 + 0.2 * R.next());
    const base = C(s), tn = Tn(s);
    const nrm = [-tn[1] * side, tn[0] * side];
    const ang = (1.05 - 0.45 * s) + 0.08 * (R.next() - 0.5); // angle from the rachis tangent toward the tip
    const dir = [tn[0] * Math.cos(ang) + nrm[0] * Math.sin(ang), tn[1] * Math.cos(ang) + nrm[1] * Math.sin(ang)];
    const perp = [-dir[1], dir[0]];
    const curl = 0.18 * len; // the pinna bends toward the tip
    const lobes = 4 + Math.round(3 * grow);
    const top = [], bot = [];
    const N = 22;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const hw = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + 0.82 * u)), 0.65) * (1 - 0.15 * u) * (1 + 0.2 * Math.abs(Math.sin(Math.PI * lobes * u)) - 0.1);
      const bx = base[0] + dir[0] * len * u + tn[0] * curl * u * u * side * 0, by = base[1] + dir[1] * len * u + tn[1] * curl * u * u;
      const cx = bx + tn[0] * curl * u * u * 0.6, cy = by;
      top.push([cx + perp[0] * hw, cy + perp[1] * hw]);
      bot.push([cx - perp[0] * hw, cy - perp[1] * hw]);
    }
    // close: top edge out, rounded tip, bottom edge back; start inside the rachis so the leaf joins it
    const poly = [[base[0] - dir[0] * 0.004, base[1] - dir[1] * 0.004], ...top, ...bot.reverse()];
    pinnae.push({ poly, s, side, len });
  }
  // rachis: a tapered strip along the centre line, stipe included
  const left = [], right = [];
  const M = 60;
  for (let k = 0; k <= M; k++) {
    const s = -stipe / L + (1 + stipe / L) * (k / M);
    const p = C(s), tn = Tn(s);
    const hw = lerp(0.0062, 0.0012, clamp((s + stipe / L) / (1 + stipe / L)));
    left.push([p[0] - tn[1] * hw, p[1] + tn[0] * hw]);
    right.push([p[0] + tn[1] * hw, p[1] - tn[0] * hw]);
  }
  const rachis = [...left, ...right.reverse()];
  return { pinnae, rachis, bbox: bboxOf([rachis, ...pinnae.map((p) => p.poly)]), centre: C };
}

/** keyOutline({ scale }) -> { outer: poly, hole: poly, bbox } — an old warded key, bow at the origin, shaft along +x */
export function keyOutline(o = {}) {
  const k = o.scale ?? 1;
  const R0 = 0.068 * k, hs = 0.0125 * k;
  const bow = (phi) => R0 * (1 + 0.1 * Math.cos(4 * phi));
  // find phi where the bow meets the shaft edge (y = hs)
  let pa = 0.17;
  for (let it = 0; it < 30; it++) pa = Math.asin(Math.min(0.99, hs / bow(pa)));
  const outer = [];
  const NB = 96;
  for (let j = 0; j <= NB; j++) {
    const phi = pa + ((TAU - 2 * pa) * j) / NB;
    const r = bow(phi);
    outer.push([r * Math.cos(phi), r * Math.sin(phi)]);
  }
  const xb = bow(pa) * Math.cos(pa);
  const X = (v) => v * k;
  // bottom edge (y = -hs) toward the bit, the bit with two wards, the rounded tip, back along the top edge with the collar
  outer.push(
    [X(0.086), -hs], [X(0.086), -X(0.024)], [X(0.104), -X(0.024)], [X(0.104), -hs],
    [X(0.292), -hs], [X(0.292), -X(0.074)], [X(0.304), -X(0.074)], [X(0.304), -X(0.05)], [X(0.314), -X(0.05)], [X(0.314), -X(0.074)],
    [X(0.328), -X(0.074)], [X(0.328), -X(0.058)], [X(0.338), -X(0.058)], [X(0.338), -X(0.074)], [X(0.352), -X(0.074)], [X(0.352), -hs],
  );
  for (let j = 0; j <= 10; j++) { const a = -Math.PI / 2 + (Math.PI * j) / 10; outer.push([X(0.352) + hs * 0.9 * Math.cos(a), hs * Math.sin(a)]); }
  outer.push([X(0.104), hs], [X(0.104), X(0.024)], [X(0.086), X(0.024)], [X(0.086), hs], [xb, hs]);
  const hole = [];
  for (let j = 0; j < 48; j++) { const a = (TAU * j) / 48; hole.push([0.034 * k * Math.cos(a), 0.034 * k * Math.sin(a)]); }
  return { outer, hole, bbox: bboxOf([outer]) };
}

/**
 * featherOutline({ length, lead, trail, splits, seed }) -> { vane: poly, rachis: [[x,y]], quill, downFrom, bbox }
 * A contour feather: curved rachis along +x, a narrow leading vane (y > 0) and a wider trailing vane (y < 0), with a few
 * splits in the trailing vane that run along the barbs (toward the tip). Downy barbs near the base are drawn by style.js.
 */
export function featherOutline(o = {}) {
  const L = o.length ?? 0.5, A = o.lead ?? 0.034, B = o.trail ?? 0.056, sv = o.vaneFrom ?? 0.2;
  const bend = o.bend ?? 0.05;
  const C = (s) => [s * L, bend * L * s * s];
  const Tn = (s) => { const dx = L, dy = 2 * bend * L * s, l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  const prof = (s) => { const q = clamp((s - sv) / (1 - sv)); return Math.pow(q, 0.3) * Math.pow(Math.max(0, 1 - Math.pow(q, 2.4)), 0.5); };
  const splits = o.splits ?? [{ s: 0.42, depth: 0.7, w: 0.012 }, { s: 0.63, depth: 0.55, w: 0.01 }, { s: 0.8, depth: 0.5, w: 0.008 }];
  const leadSplits = o.leadSplits ?? [{ s: 0.55, depth: 0.5, w: 0.008 }];
  const N = 90;
  const edge = (side, wmax, sp) => {
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const s = sv + ((1 - sv) * k) / N;
      const c = C(s), tn = Tn(s), nr = [-tn[1] * side, tn[0] * side];
      let w = wmax * prof(s);
      // barbs lean toward the tip: the edge point sits a little further along than its root on the rachis
      const lean = 0.55 * w;
      let px = c[0] + nr[0] * w + tn[0] * lean, py = c[1] + nr[1] * w + tn[1] * lean;
      pts.push([px, py, s, w]);
    }
    // cut the splits: replace the edge points near each split by a V running in along the barb direction
    const out = [];
    for (const p of pts) {
      const s = p[2];
      const hit = sp.find((q) => Math.abs(s - q.s) < q.w / L);
      if (hit) {
        const d = 1 - Math.abs(s - hit.s) / (hit.w / L);
        const k2 = 1 - hit.depth * Math.pow(d, 0.6);
        const c = C(s), tn = Tn(s), nr = [-tn[1] * side, tn[0] * side];
        const w = p[3] * k2;
        out.push([c[0] + nr[0] * w + tn[0] * 0.55 * w, c[1] + nr[1] * w + tn[1] * 0.55 * w]);
      } else out.push([p[0], p[1]]);
    }
    return out;
  };
  const top = edge(1, A, leadSplits), bot = edge(-1, B, splits);
  const vane = [...top, ...bot.reverse()];
  const rachis = [];
  for (let k = 0; k <= 40; k++) rachis.push(C(k / 40));
  return { vane, rachis, centre: C, tangent: Tn, length: L, vaneFrom: sv, bbox: bboxOf([vane, [C(0), C(1)]]) };
}

/**
 * laceLayout({ length, height, motif }) -> { w, h, edgeY, scallops: [{x, y, r}], holes: [{x, y, r}], petals: [{x, y, r, a}], eyelets }
 * A straight-edged lace strip: eyelet row along the top, a flower motif repeat (round centre + 6 petal holes), a net of
 * small holes between, a scalloped bottom edge with picots. Coordinates: x 0..w along the strip, y 0 (bottom) .. h (top).
 */
export function laceLayout(o = {}) {
  const w = o.length ?? 0.9, h = o.height ?? 0.15, m = o.motif ?? 0.1;
  const nM = Math.round(w / m), step = w / nM;
  const edgeY = 0.028; // scallop band height
  const scallops = [], holes = [], petals = [], eyelets = [], net = [];
  const nS = nM * 2, ss = w / nS;
  for (let i = 0; i < nS; i++) scallops.push({ x: (i + 0.5) * ss, y: edgeY, r: ss * 0.5 });
  for (let i = 0; i < nM; i++) {
    const cx = (i + 0.5) * step, cy = edgeY + (h - edgeY) * 0.48;
    holes.push({ x: cx, y: cy, r: 0.0105 });
    for (let j = 0; j < 6; j++) {
      const a = (TAU * j) / 6 + Math.PI / 6;
      petals.push({ x: cx + Math.cos(a) * 0.026, y: cy + Math.sin(a) * 0.026, r: 0.0105, a });
    }
    // net holes between motifs (diamond lattice)
    for (const [dx, dy] of [[-0.5, 0.33], [-0.5, -0.33], [-0.5, 0], [0.5, 0.33], [0.5, -0.33]]) {
      if (dx > 0 && i < nM - 1) continue;
      const x = cx + dx * step, y = cy + dy * (h - edgeY) * 0.62;
      if (x < 0.012 || x > w - 0.012) continue;
      net.push({ x, y, r: 0.0068 });
    }
  }
  const nE = Math.round(w / 0.022);
  for (let i = 0; i < nE; i++) eyelets.push({ x: ((i + 0.5) * w) / nE, y: h - 0.014, r: 0.0042 });
  return { w, h, edgeY, step, scallops, holes, petals, net, eyelets };
}

/** bboxOf(polys) -> { minX, maxX, minY, maxY } */
export function bboxOf(polys) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX, maxX, minY, maxY };
}

/** placeLocal(pos, rot, [px, py]) -> world [x, z] of an object-local point (object at pos [x, z], turned rot about +Y) */
export function placeLocal(pos, rot, p) {
  const lx = p[0], lz = -p[1], c = Math.cos(rot), s = Math.sin(rot);
  return [pos[0] + lx * c + lz * s, pos[1] - lx * s + lz * c];
}
