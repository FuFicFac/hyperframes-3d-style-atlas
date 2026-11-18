// styles/ship-in-bottle/rigging.js — the ONE plan of the "Ship in a Bottle" style (pure: no THREE, no window, no DOM;
// Node-safe). From the spec's bottle, ship, route and timing blocks this module derives
//   - every mast hinge angle as a closed form of ONE number, the thread length pulled (law of cosines on each stay);
//     masts rise fore to aft because each stay carries exactly the slack of the masts before it,
//   - every rigging thread as a polyline between plan points (straight when taut, sagging by its slack when not),
//   - the insertion route (slide along the bottle axis, then lower onto the sea) and the wire, tail thread and cork,
//   - a clearance proof: the folded bundle fits the neck at every step and the raised ship fits inside the glass
//     (createPlan throws if not), and
//   - the sound events (wood taps, glass clinks, thread creaks, one lock per mast, cork pop).
// style.js reads the plan for the picture; scene.config.js turns plan.events() into SCORE with rigVoices().
// Frames: SHIP-LOCAL = origin at the middle of the flat bottom, +X bow, +Y up, +Z starboard. WORLD = ship-local
// translated by pose(t) (the ship never pitches). The bottle axis is world X at y = bottle.axisY, mouth at +X.
import { clamp, lerp, smoothstep, ease, beat } from "../../kit/time.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len3(sub(a, b));
const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

// ------------------------------------------------------------------------------------------------ bottle profile
/** outerRadius(B, x) -> outer glass radius at axis position x (0 left of the base, the neck radius out to the mouth) */
export function outerRadius(B, x) {
  if (x < B.baseX || x > B.mouthX) return 0;
  if (x < B.baseX + B.heel) { const d = B.baseX + B.heel - x; return B.bodyR - B.heel + Math.sqrt(Math.max(0, B.heel * B.heel - d * d)); }
  if (x <= B.shoulderX[0]) return B.bodyR;
  if (x < B.shoulderX[1]) {
    const u = (x - B.shoulderX[0]) / (B.shoulderX[1] - B.shoulderX[0]);
    return lerp(B.bodyR, B.neckR, 0.5 - 0.5 * Math.cos(Math.PI * u));
  }
  return B.neckR;
}
/** innerRadius(B, x) -> free radius inside the glass at x (0 inside the base glass, Infinity outside the mouth) */
export function innerRadius(B, x) {
  if (x > B.mouthX) return Infinity;
  if (x <= B.baseX + B.wall) return 0;
  return Math.max(0, outerRadius(B, x) - B.wall);
}

// ------------------------------------------------------------------------------------------------ hull lines
/** deckY(H, x) -> deck height at x (sheer: the deck rises toward both ends) */
export function deckY(H, x) { const u = x / H.bow; return H.deck + H.sheer * u * u; }
/** beamAt(H, x) -> half-beam at deck level (transom stern, widest near maxAt, pointed bow) */
export function beamAt(H, x) {
  const u = clamp((x - H.stern) / (H.bow - H.stern)), u0 = (H.maxAt - H.stern) / (H.bow - H.stern);
  if (u <= u0) { const v = (u0 - u) / u0; return H.beam - (H.beam - H.sternBeam) * v * v; }
  const v = (u - u0) / (1 - u0);
  return H.beam * Math.max(0, 1 - Math.pow(v, 2.3));
}

/** resample(pts, n) -> n points evenly spaced by arc length along a polyline */
export function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const L = cum[cum.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = L * (k / (n - 1));
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j];
    out.push(mix3(pts[j], pts[j + 1], seg > 1e-9 ? clamp((s - cum[j]) / seg) : 0));
  }
  return out;
}
/** pointAtArc(pts, s) -> point at arc length s along a polyline (clamped) */
export function pointAtArc(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i], pts[i - 1]);
    if (s <= acc + d || i === pts.length - 1) return mix3(pts[i - 1], pts[i], d > 1e-9 ? clamp((s - acc) / d) : 0);
    acc += d;
  }
  return pts[pts.length - 1];
}

/**
 * createPlan({ spec, end }) -> plan     spec = STYLE_SPEC (uses .bottle .sea .ship .route .cork .timing)
 *   plan.state(c)        -> { phi[], raise[], open[], slack[] } for thread length pulled c (0 = folded, plan.total = raised)
 *   plan.pull(t)         -> c at time t (fold = the plan run backwards, then three pulls)
 *   plan.pose(t)         -> { x, y } world position of the ship origin
 *   plan.local(c)        -> named ship-local points (bases, tops, eyelets, shroud ends)
 *   plan.threads(t)      -> [{ id, kind, pts }] world polylines, each with thread.n points
 *   plan.tail(t), plan.wire(t), plan.cork(t)
 *   plan.clearance       -> { ok, bundleR, neckR, neckGap, pathGap, raisedGap, axisOffset }
 *   plan.events()        -> [{ t, kind, ... }] for kit/schedule.scoreFromEvents
 */
export function createPlan(o = {}) {
  const S = o.spec, B = S.bottle, SH = S.ship, H = SH.hull, T = S.timing, R = S.route, TH = SH.thread;
  const end = o.end ?? 15;
  const bowTip = [SH.bowsprit.tip[0], SH.bowsprit.tip[1], 0];
  const floorY = (x) => {
    if (x <= SH.bowsprit.from[0]) return deckY(H, clamp(x, H.stern, H.bow)) + 0.012;
    const u = clamp((x - SH.bowsprit.from[0]) / (SH.bowsprit.tip[0] - SH.bowsprit.from[0]));
    return lerp(SH.bowsprit.from[1], SH.bowsprit.tip[1], u) + SH.bowsprit.r + 0.008;
  };

  // ---- masts: hinge geometry + the stay that raises each one -------------------------------------------------
  const masts = SH.masts.map((m, i) => {
    const base = [m.x, deckY(H, m.x) + SH.mast.hinge, 0];
    const eye = m.eyelet === "bowsprit" ? bowTip : [m.eyelet[0], deckY(H, m.eyelet[0]) + m.eyelet[1], m.eyelet[2]];
    const e = sub(eye, base), e2 = Math.hypot(e[0], e[1]), eLen = len3(e);
    const beta = Math.atan2(-e[0], e[1]);                        // -sin(phi) ex + cos(phi) ey = e2 cos(phi - beta)
    const dAt = (phi) => Math.sqrt(m.len * m.len + eLen * eLen - 2 * m.len * e2 * Math.cos(phi - beta));
    const dFold = dAt(m.fold), dUp = dAt(m.up);
    if (!(m.fold - beta < Math.PI && dFold > dUp)) throw new Error(`ship-in-bottle: stay of ${m.id} cannot raise it (fold ${m.fold}, beta ${beta.toFixed(3)})`);
    return { ...m, i, base, eye, e2, eLen, beta, dAt, dFold, dUp, delta: dFold - dUp };
  });
  const cum = [0];
  for (const m of masts) cum.push(cum[cum.length - 1] + m.delta);
  const total = cum[masts.length];

  /** phiOf(i, ci): hinge angle of mast i once its own stay has been shortened by ci (closed form) */
  const phiOf = (i, ci) => {
    const m = masts[i], d = m.dFold - clamp(ci, 0, m.delta);
    const k = (m.len * m.len + m.eLen * m.eLen - d * d) / (2 * m.len);
    return clamp(m.beta + Math.acos(clamp(k / m.e2, -1, 1)), m.up, m.fold);
  };
  const state = (c) => {
    const phi = [], raise = [], open = [], slack = [];
    masts.forEach((m, i) => {
      const p = phiOf(i, c - cum[i]);
      const r = clamp((m.fold - p) / (m.fold - m.up));
      phi.push(p); raise.push(r); open.push(smoothstep(SH.sail.openFrom, 1, r)); slack.push(Math.max(0, cum[i] - c));
    });
    return { c, phi, raise, open, slack };
  };
  const dirOf = (phi) => [-Math.sin(phi), Math.cos(phi), 0];      // along the mast
  const fwdOf = (phi) => [Math.cos(phi), Math.sin(phi), 0];        // the mast's forward side (up when folded)

  // shrouds: two per mast, fixed length = their length with the mast up; slack (sagging) when it is folded
  const shrouds = [];
  masts.forEach((m) => {
    const ax = m.x - SH.shroud.aft, ay = deckY(H, ax) + H.rail, az = beamAt(H, ax);
    const at = add(m.base, mul(dirOf(m.up), m.len * SH.shroud.at));
    for (const s of [1, -1]) {
      const anchor = [ax, ay, s * az];
      shrouds.push({ id: `shroud-${m.id}-${s > 0 ? "s" : "p"}`, mast: m.i, anchor, length: dist(at, anchor) });
    }
  });

  /** sagLine(a, b, L): polyline from a to b of free length L — straight when L <= |ab|, else a parabola whose depth
   *  matches the slack (L ~ d + 8 h^2 / 3d), resting on the deck where it would pass through it. */
  const sagLine = (a, b, L, n = TH.n) => {
    const d = dist(a, b), s = Math.max(0, L - d), h = Math.sqrt((3 * d * s) / 8), pts = [];
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), p = mix3(a, b, u);
      p[1] -= 4 * h * u * (1 - u);
      if (k > 0 && k < n - 1) p[1] = Math.max(p[1], floorY(p[0]));
      pts.push(p);
    }
    return pts;
  };

  /** local(c) -> ship-local points for a pull c */
  const local = (c) => {
    const st = state(c);
    const tops = masts.map((m, i) => add(m.base, mul(dirOf(st.phi[i]), m.len)));
    return { st, tops, bases: masts.map((m) => m.base), eyes: masts.map((m) => m.eye), bowTip };
  };
  /** localThreads(c) -> [{ id, kind, pts }] in ship-local coordinates */
  const localThreads = (c) => {
    const { st, tops } = local(c), out = [];
    masts.forEach((m, i) => {
      out.push({ id: `stay-${m.id}`, kind: "stay", mast: i, pts: sagLine(tops[i], m.eye, dist(tops[i], m.eye) + st.slack[i]) });
      if (m.eyelet !== "bowsprit") out.push({ id: `run-${m.id}`, kind: "run", mast: i, pts: resample([m.eye, bowTip], TH.n) });
    });
    for (const s of shrouds) {
      const m = masts[s.mast], at = add(m.base, mul(dirOf(st.phi[s.mast]), m.len * SH.shroud.at));
      out.push({ id: s.id, kind: "shroud", mast: s.mast, pts: sagLine(at, s.anchor, s.length) });
    }
    return out;
  };

  /** sailFrame(i, c) -> { lo, hi, foot, head, width (0..1 of full), amp } for mast i (mast-local: y along the mast) */
  const sailOf = (i, open) => {
    const m = masts[i], Q = SH.sail;
    const w = lerp(Q.closed, Q.open, open);                       // cos(pleat angle)
    return { lo: Q.lo * m.len, hi: Q.hi * m.len, foot: Q.foot * m.len, head: Q.head * m.len, w, sin: Math.sqrt(Math.max(0, 1 - w * w)) };
  };

  /** samples(c) -> ship-local points that bound the ship (hull, bowsprit, mast tips, sail corners) for the clearance proof */
  const samples = (c) => {
    const { st, tops } = local(c), pts = [];
    for (let k = 0; k <= 24; k++) {
      const x = lerp(H.stern, H.bow, k / 24), b = beamAt(H, x), y = deckY(H, x) + H.rail;
      pts.push([x, 0, b * H.bottom], [x, 0, -b * H.bottom], [x, y, b], [x, y, -b]);
    }
    pts.push([bowTip[0], bowTip[1] + SH.bowsprit.r, 0]);
    masts.forEach((m, i) => {
      const d = dirOf(st.phi[i]), f = fwdOf(st.phi[i]), q = sailOf(i, st.open[i]);
      pts.push(add(tops[i], mul(f, SH.mast.rTop)), add(tops[i], mul(f, -SH.mast.rTop)));
      const seg = q.foot / SH.sail.pleats, amp = (seg * q.sin) / 2 + SH.sail.billow * st.open[i];
      for (const [along, width] of [[q.lo, q.foot], [q.hi, q.head]]) for (const sz of [1, -1]) for (const sf of [SH.sail.off + amp, SH.sail.off - amp]) {
        const p = add(add(m.base, mul(d, along)), mul(f, sf));
        pts.push([p[0], p[1], sz * 0.5 * width * q.w]);
      }
    });
    return pts;
  };

  // ---- time: pull(t), pose(t) ---------------------------------------------------------------------------------
  const n = masts.length;
  const pull = (t) => {
    if (t < T.pull[0][0]) {                                        // folding: mizzen first, fore last (the thread is let out)
      let c = total;
      for (let k = 0; k < n; k++) {
        const i = n - 1 - k, [a, b] = T.fold[k];
        if (t >= a) c = lerp(cum[i + 1], cum[i], ease.inOutQuad(clamp((t - a) / (b - a))));
      }
      return c;
    }
    let c = 0;
    for (let i = 0; i < n; i++) {
      const [a, b] = T.pull[i];
      if (t >= a) c = lerp(cum[i], cum[i + 1], ease.inOutSine(clamp((t - a) / (b - a))));
    }
    return c;
  };

  // the folded bundle rides the bottle axis: its own mid-height sits on the axis
  const folded = samples(0);
  const yLo = Math.min(...folded.map((p) => p[1])), yHi = Math.max(...folded.map((p) => p[1]));
  const axisOffset = (yLo + yHi) / 2;
  const ySlide = B.axisY - axisOffset, ySea = B.axisY + S.sea.level - S.sea.press;
  const pose = (t) => ({
    x: lerp(R.xOut, R.xIn, beat(t, T.slide[0], T.slide[1] - T.slide[0], "inOutSine")),
    y: lerp(ySlide, ySea, beat(t, T.lower[0], T.lower[1] - T.lower[0], "inOutSine")),
  });
  const toWorld = (p, ps) => [p[0] + ps.x, p[1] + ps.y, p[2]];

  // ---- clearance proof ----------------------------------------------------------------------------------------
  const gapOf = (pts, ps) => {
    let g = Infinity;
    for (const p of pts) {
      const w = toWorld(p, ps);
      if (w[0] > B.mouthX) continue;                              // still outside the bottle
      g = Math.min(g, innerRadius(B, w[0]) - Math.hypot(w[1] - B.axisY, w[2]));
    }
    return g;
  };
  const neckInner = B.neckR - B.wall;
  const bundleR = Math.max(...folded.map((p) => Math.hypot(p[1] - axisOffset, p[2])));
  let pathGap = Infinity, raisedGap = Infinity;
  for (let t = T.slide[0]; t <= T.lower[1] + 1e-9; t += 1 / 60) pathGap = Math.min(pathGap, gapOf(folded, pose(t)));
  const home = pose(T.lower[1]);
  for (let k = 0; k <= 160; k++) raisedGap = Math.min(raisedGap, gapOf(samples((total * k) / 160), home));
  const clearance = { ok: true, bundleR, neckR: neckInner, neckGap: neckInner - bundleR, pathGap, raisedGap, axisOffset, margin: R.margin };
  if (clearance.neckGap < R.margin) throw new Error(`ship-in-bottle: folded bundle radius ${bundleR.toFixed(3)} does not clear the neck ${neckInner.toFixed(3)} by ${R.margin}`);
  if (pathGap < R.margin) throw new Error(`ship-in-bottle: the insertion route touches the glass (gap ${pathGap.toFixed(3)})`);
  if (raisedGap < R.margin) throw new Error(`ship-in-bottle: the raised ship touches the glass (gap ${raisedGap.toFixed(3)})`);

  // ---- world threads, tail thread, wire, cork -----------------------------------------------------------------
  const threads = (t) => {
    const ps = pose(t);
    return localThreads(pull(t)).map((th) => ({ ...th, pts: th.pts.map((p) => toWorld(p, ps)) }));
  };
  const mouth = [B.mouthX, B.axisY, 0];
  const tailOut = (t) => 6 * beat(t, T.tailOut[0], T.tailOut[1] - T.tailOut[0], "inCubic");
  /** tail(t) -> { visible, pts (TH.n points), ring [x,y,z], knots [[x,y,z]...] }: the ONE thread that leaves the neck */
  const tail = (t) => {
    const ps = pose(t), c = pull(t), w = tailOut(t);
    const eb = toWorld(bowTip, ps), ring = [eb[0] + TH.tail + c + w, B.axisY, 0];
    const path = eb[0] < B.mouthX - 0.2 ? [eb, mouth, ring] : [eb, ring];
    let L = 0;
    for (let i = 1; i < path.length; i++) L += dist(path[i], path[i - 1]);
    const visible = w < L - 0.05;
    const from = pointAtArc(path, w);
    const rest = [from];
    if (path.length === 3 && w < dist(eb, mouth) - 1e-6) rest.push(mouth);
    rest.push(ring);
    const knots = [0, ...TH.marks].map((a) => pointAtArc(path, TH.knot + a + c + w));
    return { visible, pts: resample(rest, TH.n), ring, knots, cut: t >= T.cut };
  };
  /** wire(t) -> { visible, a, b }: the steel wire that pushes the ship (hooked on the foredeck, through the mouth) */
  const wire = (t) => {
    const ps = pose(t), W = SH.wire;
    const hook = toWorld([W.hook[0], deckY(H, W.hook[0]) + W.hook[1], W.hook[2]], ps);
    const aim = [Math.max(B.mouthX, hook[0] + 1), B.axisY, W.hook[2]];
    const d = mul(sub(aim, hook), 1 / dist(aim, hook));
    const off = t < T.wireOut[0]
      ? 7 * (1 - beat(t, T.wireIn[0], T.wireIn[1] - T.wireIn[0], "outCubic"))
      : 9 * beat(t, T.wireOut[0], T.wireOut[1] - T.wireOut[0], "inCubic");
    const a = add(hook, mul(d, off));
    return { visible: t >= T.wireIn[0] && t < T.wireOut[1], a, b: add(a, mul(d, W.len)), hook };
  };
  const corkSeat = B.mouthX - S.cork.seat + S.cork.len / 2;
  /** cork(t) -> { visible, x (centre), spin } */
  const cork = (t) => {
    const u = beat(t, T.cork[0], T.cork[1] - T.cork[0], "inOutCubic");
    return { visible: t >= T.cork[0], x: lerp(S.cork.from, corkSeat, u), spin: (1 - u) * 2.2 };
  };

  // ---- events -------------------------------------------------------------------------------------------------
  const crossing = (xLocal) => {                                   // first time the ship-local x passes the mouth
    for (let t = T.slide[0]; t <= T.slide[1]; t += 1 / 240) if (pose(t).x + xLocal <= B.mouthX) return t;
    return null;
  };
  const sternMost = Math.min(...folded.map((p) => p[0]));
  const events = () => {
    const ev = [{ t: 0, kind: "bed", dur: end, x: 0 }];
    T.fold.forEach(([a, b], k) => {
      const i = n - 1 - k;
      ev.push({ t: a, kind: "rustle", mast: i, dur: b - a, x: R.xOut + masts[i].x });
      ev.push({ t: b, kind: "tap", mast: i, x: R.xOut + masts[i].x });
    });
    ev.push({ t: T.wireIn[1], kind: "hook", x: R.xOut });
    ev.push({ t: T.slide[0], kind: "slide", dur: T.slide[1] - T.slide[0], x: R.xOut });
    const tIn = crossing(sternMost), tThrough = crossing(bowTip[0]);
    if (tIn !== null) ev.push({ t: tIn, kind: "clink", level: 1, x: B.mouthX });
    if (tThrough !== null) ev.push({ t: tThrough, kind: "clink", level: 0.55, x: B.mouthX });
    ev.push({ t: T.lower[1] - 0.06, kind: "land", x: R.xIn });
    ev.push({ t: T.wireOut[0], kind: "wire", dur: T.wireOut[1] - T.wireOut[0], x: B.mouthX });
    T.pull.forEach(([a, b], i) => {
      ev.push({ t: a, kind: "creak", mast: i, dur: b - a, x: B.mouthX });
      ev.push({ t: lerp(a, b, 0.45), kind: "rustle", mast: i, dur: (b - a) * 0.6, x: R.xIn + masts[i].x });
      ev.push({ t: b, kind: "lock", mast: i, x: R.xIn + masts[i].x });
    });
    ev.push({ t: T.cut, kind: "snip", x: B.mouthX });
    ev.push({ t: T.cork[1] - 0.05, kind: "cork", x: B.mouthX });
    ev.push({ t: T.cork[1] + 0.35, kind: "done", x: 0 });
    return ev.filter((e) => e.t < end).sort((a, b) => a.t - b.t);
  };

  return {
    spec: S, masts, cum, total, shrouds, state, local, localThreads, sailOf, samples, dirOf, fwdOf,
    pull, pose, threads, tail, wire, cork, clearance, events, home, ySlide, ySea, mouth, corkSeat, end,
  };
}

/** rigVoices(SND) -> voices for kit/schedule.scoreFromEvents */
export function rigVoices(SND) {
  return {
    bed: (e) => [{ type: "pad", dur: e.dur, root: SND.pad.root, chord: SND.pad.chord, attack: 0.8, release: 1.5, brightness: SND.pad.brightness, gain: SND.pad.gain, pan: 0 }],
    rustle: (e) => [{ type: "paper", dur: Math.max(0.3, e.dur), density: 0.4, gain: SND.rustle.gain }],
    tap: (e) => [
      { type: "marimba", hz: SND.tap.hz * (1 + 0.12 * e.mast), dur: 0.25, decay: 0.045, mallet: 0.9, gain: SND.tap.gain },
      { type: "tick", gain: SND.tap.gain * 0.5, pitch: 0.7 },
    ],
    hook: () => [{ type: "tick", gain: 0.25, pitch: 1.6 }],
    slide: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 0.9, gain: SND.slide.gain }],
    clink: (e) => [
      { type: "marimba", hz: SND.clink.hz, dur: 0.7, decay: 0.16, mallet: 0.3, gain: SND.clink.gain * e.level },
      { type: "marimba", hz: SND.clink.hz * 1.498, dur: 0.5, decay: 0.1, mallet: 0.2, gain: SND.clink.gain * 0.5 * e.level },
    ],
    land: () => [{ type: "squish", dur: 0.3, gain: SND.land.gain }, { type: "thud", dur: 0.25, gain: SND.land.gain * 0.5 }],
    wire: (e) => [{ type: "whoosh", dir: "out", dur: e.dur, q: 2.4, gain: SND.wire.gain }],
    creak: (e) => [{ type: "servo", dur: e.dur * 0.9, hz: SND.creak.hz * (1 + 0.1 * e.mast), hz2: SND.creak.hz * (1.5 + 0.1 * e.mast), grit: 0.7, gain: SND.creak.gain }],
    lock: (e) => [
      { type: "tick", gain: SND.lock.gain, pitch: 1.2 },
      { type: "marimba", hz: SND.lock.hz[e.mast % SND.lock.hz.length], dur: 1.1, decay: 0.3, mallet: 0.4, gain: SND.lock.gain * 0.7 },
    ],
    snip: () => [{ type: "clack", gain: SND.snip.gain, pitch: 2.2 }],
    cork: () => [{ type: "pop", dur: 0.14, gain: SND.cork.gain, pitch: 0.75 }, { type: "thud", dur: 0.3, gain: SND.cork.gain * 0.4 }],
    done: () => [{ type: "chime", dur: 1.6, notes: 4, gain: SND.done.gain }],
  };
}

/** panOf(spec) -> (event) => stereo pan from the event's world x */
export const panOf = (S) => (e) => clamp((e.x ?? 0) / 6, -1, 1) * 0.6;
