// styles/card-table/dealer.js — the dealer: plans every card, chip and button move as pure data + pure f(t).
// No THREE, no window, no DOM (Node-safe). Imported by style.js (picture) AND scene.config.js (SCORE + camera), so
// every riffle tick, deal whoosh, landing slide, flip snap and chip clink is derived from the plan the picture reads.
//
// POSE (one card): { p: [x, y, z] (card centre, world m), yaw (rad about +Y; 0 = card top points to -Z, away from the
//   viewer), flip (0 = face up, PI = face down; turns about the card's long axis), bend (bow across the width, signed,
//   in card-geometry sense), curl (bow along the length, + = both ends lift toward the viewer side of the table),
//   peel (inner-end lift for riffles, fraction of half length), peelEnd (+1 lifts the card's top end, -1 its bottom end),
//   dim (0..1 "not chosen" fade), vis (0 = hidden, e.g. a chip before its drop) }.  Chips / the dealer button use the same pose (p, yaw; the rest ignored).
//
//   cardDims(S) / restY(S, layer)            stock sizes; the resting centre height of layer n of a pile
//   pose(o)                                  a full pose with defaults
//   track(initial, { id, kind })             -> { add(seg), poseAt(t), events, end }   piecewise pose track
//      segment kinds: "deal" (arc + spin + landing slide), "flip", "slide" (eased move, optional lift arc),
//                     "drop" (chips/buttons: fall from above + tiny bounce; pose.vis = 0 before it), "hold" (wait)
//   planRiffle(cfg, S)                       -> { tracks, order, end, events, ... }   cut + riffle + square as tracks
//   layouts: rowPoses / fanPoses / spreadPoses / stackPoses  -> pose arrays (feed them to "slide"/"deal" segments)
//   wave(tracks, seg, { at, step })           one segment per track, staggered (flip a row in a wave, deal a round)
//   collectEvents(...tracksOrPlans)          -> sorted [{ t, kind, ... }] for kit/schedule.scoreFromEvents
//   dealerVoices(S.sound)                    -> voices for scoreFromEvents
//   tableShot(box, opts) / sampleKeys / framingReport   camera keys that frame table regions, and a replay check
import { clamp, lerp, smoothstep, ease, rng, TAU } from "../../kit/time.js";

// ------------------------------------------------------------------------------------------------ basics
export const cardDims = (S) => {
  const C = S.card;
  return { W: C.W, H: C.H, th: C.th, pitch: C.th + (C.gap ?? 0.0002) };
};
/** restY(S, layer) -> centre height of a flat card resting at pile layer `layer` (0 = on the cloth). */
export const restY = (S, layer = 0) => {
  const d = cardDims(S);
  return d.th / 2 + 0.0004 + layer * d.pitch;
};
export const pose = (o = {}) => ({
  p: [...(o.p ?? [0, 0, 0])], yaw: o.yaw ?? 0, flip: o.flip ?? 0, bend: o.bend ?? 0, curl: o.curl ?? 0,
  peel: o.peel ?? 0, peelEnd: o.peelEnd ?? 1, dim: o.dim ?? 0, vis: o.vis ?? 1,
});
const lerpPose = (a, b, u) => pose({
  p: [lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u), lerp(a.p[2], b.p[2], u)],
  yaw: lerp(a.yaw, b.yaw, u), flip: lerp(a.flip, b.flip, u), bend: lerp(a.bend, b.bend, u), curl: lerp(a.curl, b.curl, u),
  peel: lerp(a.peel, b.peel, u), peelEnd: u < 0.5 ? a.peelEnd : b.peelEnd, dim: lerp(a.dim, b.dim, u), vis: b.vis,
});
/** card long-axis unit vector in world XZ for a yaw (card geometry +Y = the card's top). */
export const axisOf = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
const E = (name) => (typeof name === "function" ? name : ease[name] ?? ease.inOutCubic);

// ------------------------------------------------------------------------------------------------ segments
// Each evaluator: (seg, t) -> pose, valid for seg.at <= t <= seg.at + seg.dur. seg.from is filled in by track.add.
const EVAL = {
  hold: (s) => s.from,
  slide(s, t) {
    const u = clamp((t - s.at) / s.dur), e = E(s.ease ?? "inOutCubic")(u);
    const q = lerpPose(s.from, s.to, e);
    q.p[1] += (s.lift ?? 0) * Math.sin(Math.PI * u);
    q.bend += (s.bend ?? 0) * Math.sin(Math.PI * u);
    return q;
  },
  deal(s, t) {
    const { flight, slideDur } = s;
    const tau = t - s.at;
    const [fx, , fz] = s.from.p, [tx, ty, tz] = s.to.p;
    const dx = tx - fx, dz = tz - fz, L = Math.hypot(dx, dz) || 1;
    const touch = [tx - (dx / L) * s.slide, ty, tz - (dz / L) * s.slide];
    const yawEnd = s.to.yaw - s.spin * s.turns * TAU;          // the spin happens in the air; the slide finishes it
    const yawTouch = lerp(s.from.yaw, yawEnd, 0.9);
    if (tau < flight) {
      const v = clamp(tau / flight), e = 1 - Math.pow(1 - v, 1.7);   // thrown: fast off the deck, easing into the cloth
      const q = pose({ ...s.from });
      q.p = [lerp(fx, touch[0], e), lerp(s.from.p[1], ty, v) + s.height * 4 * v * (1 - v), lerp(fz, touch[2], e)];
      q.yaw = lerp(s.from.yaw, yawTouch, e);
      q.flip = lerp(s.from.flip, s.to.flip, ease.inOutSine(v));
      q.bend = s.bend * Math.sin(Math.PI * v) * (1 - 0.4 * v);      // the stock flexes off the thumb, then flattens
      q.dim = lerp(s.from.dim, s.to.dim, v);
      return q;
    }
    const w = clamp((tau - flight) / slideDur), e = ease.outCubic(w);
    const q = pose({ ...s.to });
    q.p = [lerp(touch[0], tx, e), ty, lerp(touch[2], tz, e)];
    q.yaw = lerp(yawTouch, yawEnd, e);                             // the slide finishes the spin (yawEnd == to.yaw mod 2PI)
    return q;
  },
  flip(s, t) {
    const u = clamp((t - s.at) / s.dur), e = ease.inOutSine(u);
    const q = lerpPose(s.from, s.to, e);
    const th = q.flip;
    // the card turns about its long axis: lift the centre so the low edge clears the cloth, plus a small hop
    q.p[1] = lerp(s.from.p[1], s.to.p[1], e) + (s.W / 2) * Math.abs(Math.sin(th)) + s.clear * Math.sin(Math.PI * u);
    q.bend = lerp(s.from.bend, s.to.bend, e) + s.bendAmt * Math.sin(Math.PI * u) * s.spin;
    return q;
  },
  drop(s, t) {
    const u = clamp((t - s.at) / s.dur);
    const q = pose({ ...s.to });
    const k = s.land;                                  // contact fraction
    if (u < k) {
      const v = u / k;
      q.p = [lerp(s.from.p[0], s.to.p[0], ease.outSine(v)), lerp(s.from.p[1], s.to.p[1], v * v), lerp(s.from.p[2], s.to.p[2], ease.outSine(v))];
      q.yaw = lerp(s.from.yaw, s.to.yaw, ease.outSine(v));
    } else {
      const w = (u - k) / (1 - k);
      q.p[1] += s.bounce * Math.abs(Math.sin(w * Math.PI * 2)) * (1 - w) * (1 - w);
    }
    return q;
  },
};

/**
 * track(initial, { id, kind = "card" }) -> { id, kind, segs, add(seg), poseAt(t), events, end }
 *   initial: a pose, or a function (t) -> pose (e.g. a riffle) used until the first added segment starts.
 *   add(seg): seg = { kind, at, dur?, to, ... }; `from` = the pose at seg.at under the segments so far (computed once,
 *   at plan time — no state carried between frames). Segments must be added in time order and must not overlap.
 *   Defaults come from S via `S` on the segment (deal/flip/move/chip tuning) — see the helpers below.
 */
export function track(initial, { id = "", kind = "card" } = {}) {
  const T = { id, kind, segs: [], events: [], end: 0 };
  const base = typeof initial === "function" ? initial : () => pose(initial);
  T.poseAt = (t) => {
    let s = null;
    for (const g of T.segs) { if (g.at <= t) s = g; else break; }
    if (!s) return base(t);
    if (t >= s.at + s.dur) return pose(s.to);
    return EVAL[s.kind](s, t);
  };
  T.add = (seg) => {
    const last = T.segs[T.segs.length - 1];
    if (last && seg.at < last.at + last.dur - 1e-6) throw new Error(`dealer.track(${id}): segment at ${seg.at} overlaps the previous one (ends ${last.at + last.dur})`);
    const prev = T.poseAt(seg.at);
    const to = pose({ ...prev, vis: 1, ...seg.to, p: seg.to?.p ?? prev.p });
    // a drop starts from a point above its target (the hand), not from the previous pose
    const from = seg.kind === "drop" ? pose({ ...to, p: seg.fromOverride, yaw: to.yaw + 0.6 }) : prev;
    const s = { ...seg, from, to };
    T.segs.push(s);
    T.end = s.at + s.dur;
    const ev = (t, k, o = {}) => T.events.push({ t, kind: k, id, obj: kind, ...o });
    if (s.kind === "deal") { ev(s.at, "deal", { dur: s.flight }); ev(s.at + s.flight, "land", { dur: s.slideDur }); }
    else if (s.kind === "flip") { ev(s.at, "flipLift", { dur: s.dur }); ev(s.at + s.dur, "snap"); }
    else if (s.kind === "slide" && !s.silent) ev(s.at, kind === "card" ? "slide" : kind === "button" ? "buttonSlide" : "chipSlide", { dur: s.dur, dist: Math.hypot(to.p[0] - from.p[0], to.p[2] - from.p[2]) });
    else if (s.kind === "drop") ev(s.at + s.dur * s.land, kind === "button" ? "button" : "chip", { layer: seg.layer ?? 0 });
    return T;
  };
  return T;
}

// ---- segment builders with spec defaults (so scenes never hand-type tuning numbers)
/** dealSeg(S, at, to, o) — a dealt card: arc + spin + soft landing slide. dur = flight + slideDur. */
export function dealSeg(S, at, to, o = {}) {
  const D = { ...S.deal, ...o };
  return { kind: "deal", at, dur: D.flight + D.slideDur, to, flight: D.flight, slideDur: D.slideDur, slide: D.slide, height: D.height, turns: D.turns, spin: o.spin ?? 1, bend: D.bend };
}
/** flipSeg(S, at, o) — turn over in place (face down <-> face up). o.to may override; o.dir = +1 | -1 turn direction. */
export function flipSeg(S, at, o = {}) {
  const F = { ...S.flip, ...o };
  return { kind: "flip", at, dur: F.dur, to: o.to ?? {}, W: S.card.W, clear: F.clear, bendAmt: F.bend, spin: o.dir ?? 1, flipBy: o.dir ?? 1 };
}
/** slideSeg(S, at, to, o) — eased move along the cloth (o.lift arcs it over things; o.dur default S.move.dur). */
export function slideSeg(S, at, to, o = {}) {
  return { kind: "slide", at, dur: o.dur ?? S.move.dur, to, ease: o.ease ?? "inOutCubic", lift: o.lift ?? 0, bend: o.bend ?? 0, silent: !!o.silent };
}
/** dropSeg(S, at, to, o) — chip/button falls onto `to` (o.from offset above it), tiny bounce; one clink at contact. */
export function dropSeg(S, at, to, o = {}) {
  const C = S.chip, h = o.height ?? C.drop;
  const off = o.offset ?? [0.03, 0, 0.04];
  return { kind: "drop", at, dur: o.dur ?? 0.3, to, land: 0.55, bounce: o.bounce ?? C.bounce, layer: o.layer ?? 0, height: h,
    fromOverride: [to.p[0] + off[0], to.p[1] + h, to.p[2] + off[2]] };
}
// ------------------------------------------------------------------------------------------------ riffle
/**
 * planRiffle({ at, n = 24, center = [x, z], yaw = PI/2, seed = 1, flip = PI }, S)
 *   -> { at, splitEnd, rStart, rEnd, sqAt, end, releases: [{ t, card, half, merged }], order: merged -> card,
 *        layerOf: card -> merged layer, tracks: [track per card], events }
 *   Card i starts at pile layer i (0 = bottom). The top half (A) is cut away along +card axis, the bottom half (B) slides
 *   along -axis; inner ends peel up and cards drop bottom-first alternately (seeded clumps) into one interleaved pile,
 *   which is then squared at the centre. Returns per-card tracks (functions of t) you can extend with deal/flip/slide.
 */
export function planRiffle(cfg, S) {
  const R = S.riffle, n = cfg.n ?? 24, yaw = cfg.yaw ?? Math.PI / 2, flip = cfg.flip ?? Math.PI;
  const [cx, cz] = cfg.center ?? [0, 0];
  const ax = axisOf(yaw);
  const hB = Math.floor(n / 2), hA = n - hB;
  const r = rng(`riffle:${cfg.seed ?? 1}`);
  const at = cfg.at, splitEnd = at + R.split, rStart = splitEnd + 0.08;
  // release sequence: bottom-first from each half, mostly alternating with seeded clumps
  const seq = [];
  let a = 0, b = 0, prev = r.chance(0.5) ? "A" : "B";
  while (a < hA || b < hB) {
    let pick;
    if (a >= hA) pick = "B"; else if (b >= hB) pick = "A";
    else pick = r.chance(0.72) ? (prev === "A" ? "B" : "A") : prev;
    seq.push(pick); prev = pick;
    if (pick === "A") a++; else b++;
  }
  const releases = [];
  let t = rStart + 0.12, ia = 0, ib = 0;
  seq.forEach((h, k) => {
    const card = h === "A" ? hB + ia++ : ib++;
    releases.push({ t, card, half: h, merged: k });
    t += R.pace * (1 + R.jitter * (r.next() * 2 - 1));
  });
  const rEnd = releases[releases.length - 1].t + R.fall;
  const sqAt = rEnd + R.settle, end = sqAt + R.square;
  const layerOf = new Array(n), relOf = new Array(n);
  releases.forEach((x) => { layerOf[x.card] = x.merged; relOf[x.card] = x; });
  const order = releases.map((x) => x.card);
  const jit = Array.from({ length: n }, (_, i) => ({ yaw: (r.next() - 0.5) * 0.03, off: (r.next() - 0.5) * 0.008 }));
  const sm = (t0, d, tt) => smoothstep(t0, t0 + d, tt);
  const relCount = (tt, half) => releases.reduce((s, x) => s + (half && x.half !== half ? 0 : sm(x.t, R.fall, tt)), 0);
  const peelEnv = (tt) => sm(rStart, 0.14, tt) * (1 - sm(rEnd - 0.06, 0.16, tt));
  const at3 = (off, y, side = 0) => [cx + ax[0] * off + side * ax[1] * 0, y, cz + ax[1] * off];

  function poseAt(i, tt) {
    const half = i >= hB ? "A" : "B", s = half === "A" ? 1 : -1, j = half === "A" ? i - hB : i;
    const rel = relOf[i], J = jit[i];
    const base = { yaw, flip };
    if (tt <= at) return pose({ ...base, p: at3(0, restY(S, i)) });
    if (tt < rStart) {                                                     // the cut
      const u = clamp((tt - at) / R.split), e = ease.inOutCubic(u);
      const off = s * R.gapX * e;
      let y;
      if (half === "A") y = lerp(restY(S, i), restY(S, j), smoothstep(0.55, 1, u)) + R.lift * Math.sin(Math.PI * u);
      else y = restY(S, i);
      return pose({ ...base, p: at3(off, y) });
    }
    if (tt < rel.t) {                                                      // held in a half, inner end peeled up
      const y = restY(S, relCount(tt) + (j - relCount(tt, half)));
      const depth = 1 - j / (half === "A" ? hA : hB) * 0.35;               // lower cards bend a bit more (thumb pressure)
      return pose({ ...base, p: at3(s * R.gapX, y), peel: R.peel * peelEnv(tt) * depth, peelEnd: -s });
    }
    const y = restY(S, rel.merged);
    if (tt < sqAt) {                                                       // dropped into the interleaved pile
      const u = sm(rel.t, R.fall, tt);
      const off = lerp(s * R.gapX, s * R.mergeX + J.off, u);
      return pose({ ...base, yaw: yaw + J.yaw * u, p: at3(off, y), peel: R.peel * peelEnv(rel.t) * (1 - u) * 0.6, peelEnd: -s });
    }
    const u = ease.inOutCubic(clamp((tt - sqAt) / R.square));             // squared up at the centre
    return pose({ ...base, yaw: yaw + J.yaw * (1 - u), p: at3(lerp(s * R.mergeX + J.off, 0, u), y), curl: 0.03 * Math.sin(Math.PI * u) });
  }
  const tracks = Array.from({ length: n }, (_, i) => track((tt) => poseAt(i, tt), { id: `deck${i}` }));
  const events = [
    { t: at, kind: "split", dur: R.split },
    { t: rStart, kind: "riffle", dur: rEnd - rStart },
    ...releases.map((x, k) => ({ t: x.t, kind: "riffleTick", k })),
    { t: sqAt, kind: "square", dur: R.square },
    { t: end - 0.04, kind: "tap" },
  ];
  // the plan's resting state after the square, per card (start pose for deal/flip segments)
  const restPose = (i) => pose({ yaw, flip, p: at3(0, restY(S, layerOf[i])) });
  return { at, splitEnd, rStart, rEnd, sqAt, end, releases, order, layerOf, tracks, events, restPose, n, yaw, center: [cx, cz] };
}

// ------------------------------------------------------------------------------------------------ layouts
/** rowPoses(n, S, { center = [x, z], step = W + .05, yaw = 0, flip = 0, jitter = 0, seed }) -> poses in a straight row. */
export function rowPoses(n, S, o = {}) {
  const [cx, cz] = o.center ?? [0, 0], step = o.step ?? S.card.W + 0.05, r = rng(`row:${o.seed ?? 1}`), jt = o.jitter ?? 0;
  return Array.from({ length: n }, (_, i) => pose({
    p: [cx + (i - (n - 1) / 2) * step + jt * (r.next() - 0.5) * 0.02, restY(S, o.layer ?? 0), cz + jt * (r.next() - 0.5) * 0.02],
    yaw: (o.yaw ?? 0) + jt * (r.next() - 0.5) * 0.06, flip: o.flip ?? 0,
  }));
}
/** fanPoses(n, S, { pivot = [x, z], radius = .7 H, spread = .9 rad, yaw = 0, flip = 0 }) -> a hand fanned about a pivot near the cards' bottoms. */
export function fanPoses(n, S, o = {}) {
  const [px, pz] = o.pivot ?? [0, 0.2], rad = o.radius ?? S.card.H * 0.7, spread = o.spread ?? 0.9;
  return Array.from({ length: n }, (_, i) => {
    const a = (o.yaw ?? 0) + (n > 1 ? lerp(spread / 2, -spread / 2, i / (n - 1)) : 0);
    const ax = axisOf(a);
    return pose({ p: [px + ax[0] * rad, restY(S, i), pz + ax[1] * rad], yaw: a, flip: o.flip ?? 0 });
  });
}
/** spreadPoses(n, S, { from = [x, z], to = [x, z], yaw = 0, flip = PI }) -> an overlapping ribbon (a table spread). */
export function spreadPoses(n, S, o = {}) {
  const [x0, z0] = o.from ?? [-0.4, 0], [x1, z1] = o.to ?? [0.4, 0];
  return Array.from({ length: n }, (_, i) => {
    const u = n > 1 ? i / (n - 1) : 0;
    return pose({ p: [lerp(x0, x1, u), restY(S, i), lerp(z0, z1, u)], yaw: o.yaw ?? 0, flip: o.flip ?? Math.PI });
  });
}
/** stackPoses(n, S, { center = [x, z], yaw = 0, flip = PI, jitter = .004, seed }) -> a squared pile (layer i = i). */
export function stackPoses(n, S, o = {}) {
  const [cx, cz] = o.center ?? [0, 0], r = rng(`stack:${o.seed ?? 1}`), jt = o.jitter ?? 0.004;
  return Array.from({ length: n }, (_, i) => pose({
    p: [cx + (r.next() - 0.5) * jt, restY(S, o.layer0 ?? 0 + i), cz + (r.next() - 0.5) * jt], yaw: (o.yaw ?? 0) + (r.next() - 0.5) * jt * 4, flip: o.flip ?? Math.PI,
  }));
}
/** chipY(S, layer) -> centre height of chip `layer` in a stack. */
export const chipY = (S, layer = 0) => S.chip.h / 2 + 0.0004 + layer * S.chip.pitch;

/** wave(tracks, make(i) -> seg | null, { at, step = .16 }) — staggers one segment per track: make receives (i, at_i). */
export function wave(tracks, make, { at, step = 0.16 } = {}) {
  tracks.forEach((T, i) => { const s = make(i, at + i * step); if (s) T.add(s); });
  return tracks;
}

/** collectEvents(...sources) -> sorted events; a source is a track, a plan with .events, or an array of either. */
export function collectEvents(...src) {
  const out = [];
  const take = (x) => { if (!x) return; if (Array.isArray(x)) x.forEach(take); else if (x.events) out.push(...x.events); };
  src.forEach(take);
  return out.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------------------------------------ sound
/** dealerVoices(S.sound) -> voices for kit/schedule.scoreFromEvents(events, voices). */
export function dealerVoices(snd = {}) {
  const g = (k, d) => (snd[k] ?? {}).gain ?? d;
  return {
    split: (e) => [
      { type: "paper", dur: e.dur, density: 0.5, pitch: 1.3, gain: g("split", 0.38) },
      { type: "whoosh", dur: e.dur * 0.9, pitch: 1.8, gain: g("split", 0.38) * 0.25 },
    ],
    riffle: (e) => [{ type: "rustle", dur: e.dur + 0.05, density: 0.9, pitch: 1.7, gain: g("riffle", 0.32) * 0.55 }],
    riffleTick: (e, c) => [{ type: "tick", dur: 0.022, pitch: (snd.riffle?.pitch ?? 2.4) * (0.86 + 0.28 * ((e.k * 7) % 5) / 4), gain: g("riffle", 0.32) * (0.75 + 0.25 * ((e.k * 3) % 4) / 3) }],
    square: (e) => [{ type: "paper", dur: e.dur, density: 0.7, pitch: 1.1, gain: g("square", 0.42) * 0.8 }],
    tap: () => [
      { type: "thud", dur: 0.16, pitch: 2.2, gain: g("square", 0.42) * 0.7 },
      { type: "click", dur: 0.025, pitch: 0.7, gain: g("square", 0.42) * 0.45 },
    ],
    deal: (e) => [
      { type: "whoosh", dir: "out", dur: Math.max(0.2, e.dur * 0.9), pitch: snd.deal?.pitch ?? 1.6, gain: g("deal", 0.22) },
      { type: "click", dur: 0.02, pitch: 1.4, gain: g("deal", 0.22) * 0.6 },
    ],
    land: (e) => [{ type: "paper", dur: Math.max(0.18, e.dur * 0.9), density: 0.85, pitch: 0.95, gain: g("land", 0.42) }],
    flipLift: (e) => [{ type: "whoosh", dur: e.dur * 0.8, pitch: 2.0, gain: g("flip", 0.5) * 0.18 }],
    snap: () => [
      { type: "click", dur: 0.03, pitch: 0.85, gain: g("flip", 0.5) * 0.7 },
      { type: "paper", dur: 0.12, density: 0.9, pitch: 1.2, gain: g("flip", 0.5) * 0.5 },
    ],
    slide: (e) => [{ type: "rustle", dur: e.dur * 0.95, density: 0.55, pitch: 0.8, gain: g("slide", 0.32) * clamp(0.5 + (e.dist ?? 0.1) * 3, 0.5, 1) }],
    chipSlide: (e) => [{ type: "rustle", dur: e.dur * 0.9, density: 0.4, pitch: 0.6, gain: g("slide", 0.32) * 0.8 }],
    buttonSlide: (e) => [{ type: "rustle", dur: e.dur * 0.9, density: 0.4, pitch: 0.55, gain: g("slide", 0.32) * 0.7 }],
    chip: (e) => [
      { type: "clack", dur: 0.08, pitch: (snd.chip?.pitch ?? 2.6) * (1 + 0.05 * ((e.layer ?? 0) % 3)), gain: g("chip", 0.36) },
      { type: "tick", dur: 0.02, pitch: 3.2, gain: g("chip", 0.36) * 0.5, offset: 0.035 },
    ],
    button: () => [
      { type: "thud", dur: 0.2, pitch: 1.5, gain: g("button", 0.5) },
      { type: "clack", dur: 0.08, pitch: 1.4, gain: g("button", 0.5) * 0.5 },
    ],
  };
}

// ------------------------------------------------------------------------------------------------ camera
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** projectPoint({ pos, target, fov }, p, aspect) -> [ndcX, ndcY] (perspective, up = +Y; same maths as three lookAt). */
export function projectPoint(cam, p, aspect = 16 / 9) {
  const f = nrm(sub(cam.target, cam.pos)), r = nrm(cross(f, [0, 1, 0])), u = cross(r, f);
  const v = sub(p, cam.pos), z = dot(v, f), th = Math.tan(((cam.fov ?? 34) * Math.PI) / 360);
  return [dot(v, r) / z / (th * aspect), dot(v, u) / z / th];
}
const corners = (b, yTop) => {
  const [x0, z0, x1, z1] = b, out = [];
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, yTop]) out.push([x, y, z]);
  return out;
};
/**
 * tableShot(box = [x0, z0, x1, z1], { elev = .9 (rad above horizontal), azim = 0 (rad; 0 = from +Z), fov = 34, aspect,
 *   safe = .8 (fit |NDC| <= safe), yTop = .03, shift = [0, 0] (NDC: where the box centre should sit, e.g. [0, -.1] lower) })
 *   -> { pos, target, fov }: the closest camera on that bearing that keeps the whole box inside the safe area.
 */
export function tableShot(box, o = {}) {
  const { elev = 0.9, azim = 0, fov = 34, aspect = 16 / 9, safe = 0.8, yTop = 0.03 } = o;
  const shift = o.shift ?? [0, 0];
  const c = [(box[0] + box[2]) / 2, 0, (box[1] + box[3]) / 2];
  const dir = [Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)];
  const pts = corners(box, yTop);
  const make = (d) => {
    // move the aim point so the box centre lands at `shift` (small-angle: offset in the view plane)
    const th = Math.tan((fov * Math.PI) / 360);
    const f = nrm([-dir[0], -dir[1], -dir[2]]), r = nrm(cross(f, [0, 1, 0])), up = cross(r, f);
    const tgt = [c[0] - r[0] * shift[0] * th * aspect * d - up[0] * shift[1] * th * d, c[1] - r[1] * shift[0] * th * aspect * d - up[1] * shift[1] * th * d, c[2] - r[2] * shift[0] * th * aspect * d - up[2] * shift[1] * th * d];
    return { pos: [tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d], target: tgt, fov };
  };
  const fits = (d) => { const cam = make(d); return pts.every((p) => { const [x, y] = projectPoint(cam, p, aspect); return Math.abs(x) <= safe && Math.abs(y) <= safe; }); };
  let lo = 0.15, hi = 12;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  const cam = make(hi);
  return { pos: cam.pos.map((v) => +v.toFixed(5)), target: cam.target.map((v) => +v.toFixed(5)), fov };
}
/** sampleKeys(keys, t, drift?) -> { pos, target, fov }: the kit camera rig's linear-path evaluation (eases + drift). */
export function sampleKeys(keys, t, drift = null) {
  const K = keys;
  let a = K[0], b = K[0], u = 0;
  if (t >= K[K.length - 1].t) a = b = K[K.length - 1];
  else if (t > K[0].t) for (let i = 0; i < K.length - 1; i++) if (t >= K[i].t && t < K[i + 1].t) { a = K[i]; b = K[i + 1]; u = E(b.ease ?? "inOutCubic")(clamp((t - a.t) / (b.t - a.t))); break; }
  const L = (p, q) => p.map((v, k) => lerp(v, q[k], u));
  const pos = L(a.pos, b.pos), target = L(a.target, b.target), fov = lerp(a.fov ?? 34, b.fov ?? 34, u);
  if (drift) {
    const { amp = 0.15, speed = 0.25 } = drift;
    pos[0] += Math.sin(t * speed * 2.1) * amp; pos[1] += Math.sin(t * speed * 1.3 + 1.7) * amp * 0.5; pos[2] += Math.cos(t * speed * 1.7 + 0.4) * amp * 0.6;
  }
  return { pos, target, fov };
}
/**
 * framingReport(keys, mustSee(t) -> [{ id, pts: [[x,y,z], ...] }], { duration, dt = .05, drift, limit = .9, aspect })
 *   -> { ok, worst: { t, id, ndc }, fails: [...] }: replays the camera and checks every must-see point stays in frame.
 */
export function framingReport(keys, mustSee, o = {}) {
  const { duration, dt = 0.05, drift = null, limit = 0.9, aspect = 16 / 9 } = o;
  const fails = [];
  let worst = { ndc: 0 };
  for (let i = 0; i <= Math.round(duration / dt); i++) {
    const t = +(i * dt).toFixed(4), cam = sampleKeys(keys, t, drift);
    for (const m of mustSee(t)) for (const p of m.pts) {
      const [x, y] = projectPoint(cam, p, aspect), v = Math.max(Math.abs(x), Math.abs(y));
      if (v > worst.ndc) worst = { t, id: m.id, ndc: +v.toFixed(3) };
      if (v > limit) fails.push({ t, id: m.id, ndc: +v.toFixed(3) });
    }
  }
  return { ok: fails.length === 0, worst, fails };
}
/** cardCorners(pose, S) -> the 4 corners (world) of a flat card in pose (ignores bend): for framingReport. */
export function cardCorners(q, S) {
  const { W, H } = S.card, ax = axisOf(q.yaw), sx = [-ax[1], ax[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [q.p[0] + sx[0] * a * W / 2 + ax[0] * b * H / 2, q.p[1], q.p[2] + sx[1] * a * W / 2 + ax[1] * b * H / 2]);
}
