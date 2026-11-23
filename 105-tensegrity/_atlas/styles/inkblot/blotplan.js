// styles/inkblot/blotplan.js — the blot plan (pure, Node-safe: no THREE, no window, no DOM).
// One plan drives the picture AND the sound:
//   * WHEN each drop lands (and its splashes), the bead it makes, and the pressed blob it becomes;
//   * the hinge angle of the folding half, the press (rub) amount, the peel, the bleed and the wet sheen — all closed forms of t;
//   * the ink FIELD itself: fieldAt(a, b, t) = sum of smooth elliptical blobs (minus voids) in half-space; the card shader
//     evaluates the same sum per pixel from blobState(t) (plus noise warps) on both halves, so the blot is mirrored;
//   * the READINGS: pencil outlines (half-space polylines) with per-stroke draw-on windows;
//   * events(plan) -> plips, fold, slap, rubs, peel, pencil scratches for kit/schedule.scoreFromEvents.
// HALF-SPACE: a = distance from the crease (>= 0), b = up the sheet (+b = away from the viewer = world -z).
import { clamp, lerp, smoothstep, ease, hash01, rng } from "../../kit/time.js";

const RAD = Math.PI / 180;

// ---------------------------------------------------------------- curves
/** catmull(points [[a,b]...], per = 8, closed = false) -> smooth polyline through the points (centripetal-ish uniform CR). */
export function catmull(pts, per = 8, closed = false) {
  const n = pts.length;
  if (n < 3) return pts.map((p) => [p[0], p[1]]);
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let j = 0; j < per; j++) {
      const u = j / per, u2 = u * u, u3 = u2 * u;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
      out.push([Math.max(0, f(0)), f(1)]);
    }
  }
  out.push(closed ? [out[0][0], out[0][1]] : [pts[n - 1][0], pts[n - 1][1]]);
  return out;
}
/** ellipse(c, rx, ry, rotDeg = 0, n = 28, from = 0, to = 360) -> polyline (clipped to a >= 0). */
export function ellipse(c, rx, ry, rot = 0, n = 28, from = 0, to = 360) {
  const cr = Math.cos(rot * RAD), sr = Math.sin(rot * RAD), out = [];
  for (let i = 0; i <= n; i++) {
    const th = (from + ((to - from) * i) / n) * RAD, x = rx * Math.cos(th), y = ry * Math.sin(th);
    out.push([Math.max(0, c[0] + x * cr - y * sr), c[1] + x * sr + y * cr]);
  }
  return out;
}
export const polyLength = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };

// ---------------------------------------------------------------- the three readings of the default blot (original drawings)
// Control points in half-space; "c" = smooth open curve, "o" = smooth closed curve, "l" = straight polyline, "e" = ellipse.
const C = (pts, per) => catmull(pts, per ?? 8, false);
const O = (pts, per) => catmull(pts, per ?? 8, true);
export const READINGS = [
  {
    id: "moth", label: "A moth?",
    strokes: [
      // upper wing
      C([[0.11, 0.3], [0.26, 0.6], [0.72, 0.77], [1.24, 0.8], [1.55, 0.7], [1.52, 0.4], [1.36, 0.08], [1.1, -0.06], [0.7, 0.0], [0.36, 0.02], [0.12, 0.1]]),
      // lower wing
      C([[0.12, 0.0], [0.5, -0.04], [0.9, -0.22], [1.08, -0.52], [0.92, -0.74], [0.56, -0.7], [0.3, -0.8], [0.12, -0.68], [0.1, -0.42]]),
      // body + head
      C([[0, 0.4], [0.105, 0.3], [0.125, 0.0], [0.105, -0.4], [0, -0.66]]),
      C([[0.1, 0.4], [0.165, 0.52], [0.12, 0.64], [0, 0.68]]),
      // antenna with feather ticks
      C([[0.07, 0.66], [0.15, 0.76], [0.27, 0.86], [0.42, 0.9]]),
      [[0.17, 0.78], [0.23, 0.73]], [[0.25, 0.845], [0.31, 0.79]], [[0.34, 0.885], [0.39, 0.83]],
      // eyespots
      ellipse([0.56, 0.37], 0.2, 0.15, 10), ellipse([0.5, -0.33], 0.13, 0.11, 0),
      // veins
      C([[0.14, 0.26], [0.7, 0.62], [1.3, 0.74]]), C([[0.14, 0.2], [0.85, 0.2], [1.44, 0.3]]), C([[0.14, -0.08], [0.6, -0.34], [0.98, -0.62]]),
      // body segments
      [[0, 0.14], [0.118, 0.14]], [[0, -0.06], [0.124, -0.06]], [[0, -0.26], [0.118, -0.26]], [[0, -0.46], [0.09, -0.46]],
    ],
  },
  {
    id: "faces", label: "Two faces?",
    strokes: [
      // profile, looking in toward the crease: crown, forehead, brow, nose, lips, chin, jaw, neck
      C([[0.66, 0.8], [0.4, 0.74], [0.25, 0.58], [0.26, 0.44], [0.2, 0.32], [0.09, 0.15], [0.15, 0.085], [0.225, 0.06], [0.185, -0.01], [0.235, -0.065], [0.185, -0.125], [0.23, -0.2], [0.2, -0.3], [0.28, -0.4], [0.5, -0.47], [0.56, -0.62], [0.5, -0.84]], 10),
      // back of the head and nape
      C([[0.66, 0.8], [1.02, 0.82], [1.4, 0.68], [1.56, 0.36], [1.47, 0.04], [1.24, -0.2], [1.16, -0.5], [1.26, -0.84]]),
      // eye + lid + brow
      O([[0.4, 0.37], [0.55, 0.46], [0.72, 0.38], [0.56, 0.3]]),
      C([[0.36, 0.52], [0.55, 0.58], [0.76, 0.51]]),
      // mouth, nostril
      C([[0.235, -0.065], [0.32, -0.075], [0.41, -0.05]]),
      C([[0.2, 0.1], [0.25, 0.13], [0.27, 0.09]]),
      // ear
      C([[1.0, 0.3], [1.1, 0.4], [1.2, 0.28], [1.1, 0.06], [1.0, 0.1]]),
      // jaw line
      C([[0.5, -0.47], [0.86, -0.34], [1.02, -0.02]]),
    ],
  },
  {
    id: "mask", label: "A mask?",
    strokes: [
      // outline
      C([[0, 0.78], [0.5, 0.86], [1.1, 0.84], [1.56, 0.66], [1.62, 0.22], [1.4, -0.3], [1.0, -0.72], [0.45, -0.84], [0, -0.86]]),
      // slanted eye hole + brow
      O([[0.3, 0.3], [0.52, 0.5], [0.86, 0.46], [0.62, 0.25]]),
      C([[0.18, 0.5], [0.56, 0.68], [1.02, 0.6]]),
      // nose
      C([[0.07, 0.27], [0.09, -0.02], [0.18, -0.13], [0.1, -0.2], [0, -0.19]]),
      // mouth (a wide grin) + teeth
      C([[0, -0.36], [0.3, -0.35], [0.6, -0.24]]),
      C([[0.6, -0.24], [0.34, -0.55], [0, -0.6]]),
      [[0.13, -0.36], [0.13, -0.585]], [[0.27, -0.355], [0.27, -0.55]], [[0.41, -0.32], [0.41, -0.48]],
      // cheek marks
      C([[0.92, 0.12], [1.12, -0.04], [1.18, -0.3]]), C([[1.08, 0.2], [1.3, 0.02], [1.34, -0.2]]),
      // forehead mark
      C([[0, 0.6], [0.1, 0.52], [0, 0.42]]),
    ],
  },
];

// ---------------------------------------------------------------- the plan
/**
 * createBlot({ blot, ink, sheet, timing, readings = READINGS, readAt = [t...] }) -> plan
 *   blot / ink / sheet / timing: the STYLE_SPEC blocks (override freely). readAt: start time of each reading (default: after the
 *   peel, back to back). Everything on the plan is a closed form of t.
 */
export function createBlot(o = {}) {
  const INK = o.ink, SH = o.sheet, T = { ...o.timing };
  // blot.scale shrinks / grows the whole design (drops, splashes, voids and the readings drawn for it) about the crease centre
  const K = o.blot.scale ?? 1;
  const sc = (d) => ({ ...d, a: d.a * K, b: d.b * K, ...(d.rx != null ? { rx: d.rx * K, ry: d.ry * K } : {}), ...(d.r != null ? { r: d.r * K } : {}) });
  const B = { ...o.blot, drops: o.blot.drops.map(sc), sats: (o.blot.sats ?? []).map(sc), voids: (o.blot.voids ?? []).map(sc), beadMin: o.blot.beadMin * K };
  const Wh = SH.width / 2, Hh = SH.height / 2;
  const R = rng(B.seed ?? 1);
  const MAX = INK.maxBlobs ?? 24;

  // ---- drops: landing times spread over the drip window in list order (slightly irregular, seeded)
  const D = T.drip, n = B.drops.length;
  const drops = B.drops.map((d, i) => {
    const u = n > 1 ? i / (n - 1) : 0;
    const land = +(lerp(D.first, D.last, Math.pow(u, 1.3)) + (i && i < n - 1 ? R.range(-0.04, 0.04) : 0)).toFixed(3);
    const bead = Math.max(B.beadMin, B.bead * Math.sqrt(d.rx * d.ry));
    return { ...d, kind: "drop", index: i, land, fall: D.fall, bead, a0: Math.max(d.a, bead * 1.15), b0: d.b };
  });
  const byId = Object.fromEntries(drops.map((d) => [d.id, d]));
  const sats = (B.sats ?? []).map((s, i) => {
    const p = byId[s.parent] ?? drops[i % drops.length];
    return { ...s, kind: "sat", index: n + i, rx: s.r * 1.25, ry: s.r * 1.25, rot: 0, land: +(p.land + 0.03 + 0.02 * hash01(i, 7)).toFixed(3), bead: s.r * 0.8, a0: s.a, b0: s.b };
  });
  const voids = (B.voids ?? []).map((v, i) => ({ ...v, kind: "void", index: n + sats.length + i }));
  const blobs = [...drops, ...sats, ...voids];
  if (blobs.length > MAX) throw new Error(`blotplan: ${blobs.length} blobs > ink.maxBlobs ${MAX}`);
  for (const d of [...drops, ...sats]) {
    if (d.a0 + d.bead > Wh - 0.05 || Math.abs(d.b) + Math.max(d.rx, d.ry) > Hh - 0.02) throw new Error(`blotplan: drop ${d.id ?? d.index} leaves the sheet`);
  }

  // ---- fold / press / peel
  const F = T.fold, P = T.press, PE = T.peel;
  /** hinge angle of the folding half: 0 = open flat, PI = shut on the inked half. */
  const hingeAngle = (t) => {
    if (t <= F.start) return 0;
    if (t < F.shut) { const u = (t - F.start) / (F.shut - F.start); return Math.PI * (0.25 * ease.inOutSine(u) + 0.75 * ease.inCubic(u)); } // lifts, then falls shut
    if (t <= PE.start) return Math.PI;
    if (t < PE.open) {
      const u = (t - PE.start) / (PE.open - PE.start);
      return Math.PI * (1 - (0.35 * ease.inOutSine(u) + 0.65 * ease.inOutCubic(u))); // sticky start, eased landing
    }
    return 0;
  };
  /** 0..1 how far the ink has been pressed out (only changes while the card is shut). */
  const pressAmount = (t) => smoothstep(P.start, P.end, t);
  /** 0..1 capillary bleed after the peel starts. */
  const bleed = (t) => (t <= PE.start ? 0 : 1 - Math.exp(-(t - PE.start) / T.bleed));
  /** 1 = wet (glossy), -> 0 as it dries after the peel. */
  const wet = (t) => (t <= PE.start ? 1 : Math.exp(-(t - PE.start) / T.dry));
  /** is the folding half carrying ink yet (it takes the print once shut) */
  const printed = (t) => t >= F.shut;

  // ---- blob state at time t -> flat arrays for the shader (and fieldAt)
  const N = blobs.length;
  function blobState(t, A = new Float32Array(MAX * 4), Bv = new Float32Array(MAX * 4)) {
    const p = pressAmount(t), bl = bleed(t);
    A.fill(0); Bv.fill(0);
    for (let i = 0; i < MAX; i++) { Bv[i * 4] = 1; Bv[i * 4 + 1] = 1; }
    for (let i = 0; i < N; i++) {
      const d = blobs[i], j = i * 4;
      let a, b, rx, ry, w, rot;
      if (d.kind === "void") {
        a = d.a; b = d.b; rx = d.rx; ry = d.ry; rot = d.rot ?? 0; w = -d.strength * p;
      } else {
        const tau = t - d.land;
        if (tau <= 0) continue;
        const pop = ease.outBack(clamp(tau / D.pop)), soak = 1 + 0.14 * (1 - Math.exp(-tau / 1.4));
        const rb = d.bead * pop * soak;
        a = lerp(d.a0, d.a, p); b = lerp(d.b0, d.b, p);
        const grow = 1 + 0.045 * bl;
        rx = lerp(rb, d.rx, p) * grow; ry = lerp(rb, d.ry, p) * grow; rot = (d.rot ?? 0) * p; w = 1;
      }
      A[j] = a; A[j + 1] = b; A[j + 2] = Math.cos(rot * RAD); A[j + 3] = Math.sin(rot * RAD);
      Bv[j] = 1 / (rx * rx); Bv[j + 1] = 1 / (ry * ry); Bv[j + 2] = w; Bv[j + 3] = d.col ?? 0;
    }
    return { A, B: Bv, n: N, press: p, bleed: bl, wet: wet(t), printed: printed(t) };
  }
  /** fieldAt(a, b, t | state) -> the blob sum (ink where > 1), without the shader's noise warps. */
  function fieldAt(a, b, tOrState) {
    const S = typeof tOrState === "number" ? blobState(tOrState) : tOrState;
    let f = 0;
    for (let i = 0; i < S.n; i++) {
      const j = i * 4, w = S.B[j + 2];
      if (w === 0) continue;
      const dx = a - S.A[j], dy = b - S.A[j + 1], c = S.A[j + 2], s = S.A[j + 3];
      const x = dx * c + dy * s, y = -dx * s + dy * c;
      f += w * Math.exp(-INK.k * (x * x * S.B[j] + y * y * S.B[j + 1] - 1));
    }
    return f;
  }
  /** pseudo signed distance (m) of the same field: > 0 inside the ink. */
  const inkDistance = (a, b, tOrState) => Math.log(Math.max(fieldAt(a, b, tOrState), 1e-3)) * INK.distScale;

  /** falling droplet i at time t -> { a, b, y, r } in half-space + height, or null (not in the air). */
  function dropAir(i, t) {
    const d = drops[i], t0 = d.land - d.fall;
    if (t < t0 || t >= d.land) return null;
    const u = (t - t0) / d.fall;
    return { a: d.a0, b: d.b0, y: D.height * (1 - Math.pow(u, 1.7)), r: d.bead * 0.62, stretch: 1 + 0.5 * u };
  }

  // ---- the press: a disc that slides in over the shut card, rubs in loops, slides away (half-space of the INKED half)
  function pressPose(t) {
    const tin = F.shut + 0.02, tout = P.end + 0.45;
    if (t <= tin - 0.5 || t >= tout) return null;
    const cA = Wh * 0.5, off = Wh + 1.6;
    const u = (t - P.start) / (P.end - P.start);
    const th = u * (P.rubs ?? 3) * 2 * Math.PI;
    const rubA = cA + 0.42 * Wh * Math.sin(th * 0.5) * 0.9, rubB = 0.3 * Hh * Math.sin(th);
    let a, b;
    if (t < P.start) { const e = ease.outCubic(clamp((t - (tin - 0.5)) / (P.start - tin + 0.5))); a = lerp(off, cA, e); b = lerp(0.3, 0, e); }
    else if (t <= P.end) { a = rubA; b = rubB; }
    else { const e = ease.inCubic(clamp((t - P.end) / (tout - P.end))); a = lerp(cA + 0.42 * Wh * Math.sin((P.rubs ?? 3) * Math.PI) * 0.9, off, e); b = lerp(0, -0.25, e); }
    return { a, b, spin: th * 0.35, down: smoothstep(P.start - 0.12, P.start + 0.05, t) * (1 - smoothstep(P.end - 0.02, P.end + 0.15, t)) };
  }

  // ---- readings: stroke windows
  const RD = T.read;
  const reads = (o.readings ?? READINGS).map((r, k) => {
    const pts = r.strokes.map((st) => st.map((p) => [p[0] * K, p[1] * K]));
    const lens = pts.map(polyLength), total = lens.reduce((s, x) => s + x, 0);
    const gapL = total * 0.012; // pen-up between strokes, in length units
    const full = total + gapL * (r.strokes.length - 1);
    let acc = 0;
    const strokes = pts.map((pts, i) => { const s = { pts, len: lens[i], g0: acc / full, g1: (acc + lens[i]) / full }; acc += lens[i] + gapL; return s; });
    return { id: r.id, label: r.label, index: k, strokes, total };
  });
  const firstRead = PE.open + 0.15;
  const span = RD.draw + RD.hold + RD.fade + RD.gap;
  reads.forEach((r, k) => {
    r.t0 = o.readAt?.[k] ?? +(firstRead + k * span).toFixed(3);
    r.draw = RD.draw; r.hold = RD.hold; r.fade = RD.fade;
    r.tEnd = r.t0 + RD.draw + RD.hold + RD.fade;
    for (const s of r.strokes) { s.t = +(r.t0 + s.g0 * RD.draw).toFixed(3); s.dur = +((s.g1 - s.g0) * RD.draw).toFixed(3); }
  });
  /** readingState(k, t) -> { progress 0..1 (draw-on, matches the baked order channel), alpha 0..1 } */
  const readingState = (k, t) => {
    const r = reads[k];
    return { progress: clamp((t - r.t0) / r.draw), alpha: t < r.t0 ? 0 : 1 - smoothstep(r.t0 + r.draw + r.hold, r.tEnd, t) };
  };

  // ---- bounds of the pressed blot (half-space), for framing and tests
  const final = blobState(1e6);
  let bounds = { a1: 0, b0: Infinity, b1: -Infinity };
  for (let ia = 0; ia <= 90; ia++) for (let ib = 0; ib <= 85; ib++) {
    const a = (ia / 90) * Wh, b = -Hh + (ib / 85) * 2 * Hh;
    if (fieldAt(a, b, final) > 1) { bounds.a1 = Math.max(bounds.a1, a); bounds.b0 = Math.min(bounds.b0, b); bounds.b1 = Math.max(bounds.b1, b); }
  }

  return {
    Wh, Hh, MAX, drops, sats, voids, blobs, timing: T, readings: reads, bounds,
    hingeAngle, pressAmount, bleed, wet, printed, blobState, fieldAt, inkDistance, dropAir, pressPose, readingState,
  };
}

// ---------------------------------------------------------------- events + voices
/** events(plan) -> [{ t, kind, ... }] sorted: drip, splash, lift, shut, rub, squelch, peel, open, read, stroke. */
export function events(plan) {
  const T = plan.timing, ev = [];
  for (const d of plan.drops) ev.push({ t: d.land, kind: "drip", size: d.bead, a: d.a0, index: d.index });
  for (const s of plan.sats) ev.push({ t: s.land, kind: "splash", size: s.bead, a: s.a0, index: s.index });
  ev.push({ t: T.fold.start, kind: "lift", dur: T.fold.shut - T.fold.start });
  ev.push({ t: T.fold.shut, kind: "shut" });
  const rubs = T.press.rubs ?? 3, pd = (T.press.end - T.press.start) / rubs;
  for (let i = 0; i < rubs; i++) {
    ev.push({ t: +(T.press.start + i * pd).toFixed(3), kind: "rub", dur: pd, i });
    ev.push({ t: +(T.press.start + (i + 0.35) * pd).toFixed(3), kind: "squelch", i });
  }
  ev.push({ t: T.peel.start, kind: "peel", dur: T.peel.open - T.peel.start });
  ev.push({ t: T.peel.open, kind: "open" });
  for (const r of plan.readings) {
    ev.push({ t: r.t0, kind: "read", k: r.index });
    // merge short strokes into scratches of at least 60 ms
    let cur = null;
    for (const s of r.strokes) {
      if (cur && s.t - (cur.t + cur.dur) < 0.03 && cur.dur < 0.09) { cur.dur = +(s.t + s.dur - cur.t).toFixed(3); continue; }
      if (cur) ev.push(cur);
      cur = { t: s.t, kind: "stroke", dur: s.dur, k: r.index };
    }
    if (cur) ev.push(cur);
  }
  return ev.sort((x, y) => x.t - y.t);
}

/** blotVoices(SND) -> voices for kit/schedule.scoreFromEvents (SND = STYLE_SPEC.sound). */
export function blotVoices(SND) {
  return {
    drip: (e) => [
      { type: "bubble", dur: 0.09, pitch: clamp(0.14 / (e.size + 0.04), 0.7, 2.4), gain: SND.plip.gain },
      { type: "pop", dur: 0.07, pitch: clamp(0.1 / (e.size + 0.04), 0.5, 1.6), gain: SND.plip.gain * 0.45 },
    ],
    splash: (e) => [{ type: "bubble", dur: 0.05, pitch: 2.2 + 1.2 * hash01(e.index, 3), gain: SND.plip.gain * 0.35 }],
    lift: (e) => [
      { type: "paper", dur: e.dur, density: 0.3, pitch: 0.8, gain: SND.fold.gain },
      { type: "whoosh", dir: "in", dur: e.dur, q: 0.9, pitch: 0.9, gain: SND.fold.gain * 0.3 },
    ],
    shut: () => [
      { type: "paper", dur: 0.14, density: 0.7, pitch: 1.0, gain: SND.slap.gain },
      { type: "thud", dur: 0.28, pitch: 1.5, gain: SND.slap.gain * 0.8 },
    ],
    rub: (e) => [{ type: "rustle", dur: e.dur * 0.95, density: 0.5, pitch: 0.6 + 0.08 * e.i, gain: SND.rub.gain }],
    squelch: (e) => [{ type: "squish", dur: 0.3, pitch: 1.2 - 0.12 * e.i, gain: SND.squelch.gain }],
    peel: (e) => [
      { type: "paper", dur: e.dur * 0.8, density: 0.55, pitch: 1.3, gain: SND.peel.gain },
      { type: "squish", dur: 0.36, pitch: 1.7, gain: SND.squelch.gain * 0.8, offset: 0.05 },
    ],
    open: () => [{ type: "thud", dur: 0.22, pitch: 1.9, gain: SND.slap.gain * 0.45 }, { type: "paper", dur: 0.1, density: 0.6, pitch: 1.2, gain: SND.slap.gain * 0.5 }],
    read: (e) => [{ type: "marimba", hz: SND.read.notes[e.k % SND.read.notes.length], decay: 0.3, gain: SND.read.gain }],
    stroke: (e) => [{ type: "penScratch", dur: Math.max(0.06, e.dur), speed: 1.1, pitch: 0.9 + 0.1 * (e.k % 3), gain: SND.pencil.gain }],
  };
}
