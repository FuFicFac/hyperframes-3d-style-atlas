// styles/nesting-dolls/nest.js — the ONE plan of the "Nesting Dolls" style (pure: no THREE, no window, no DOM; Node-safe).
// From one lathe profile and a handful of numbers (STYLE_SPEC.nest) this module derives
//   - the shells          one profile, cut into lid + cup sections with a wall, a tenon and a cavity (unit height),
//                         and a check that every doll really fits inside the one before it,
//   - the line-up         where each doll stands, large to small,
//   - the schedule        per level: twist -> lid off -> child rises -> child hops aside -> lid back on -> lock,
//   - the poses           dollPose(k, t) / lidPose(k, t): closed forms of t (visibility included),
//   - the sound events    events(): creak, pop, taps ... pitched higher as the dolls get smaller.
// style.js reads the plan for the picture; scene.config.js turns plan.events() into SCORE with nestVoices().
import { clamp, lerp, ease } from "../../kit/time.js";

// ---------------------------------------------------------------------------------------------------- the profile
/** The silhouette, [radius, height] for a doll of height 1, foot edge to crown (original to this style). */
export const PROFILE = [
  [0.205, 0.0], [0.262, 0.035], [0.293, 0.1], [0.308, 0.19], [0.305, 0.29], [0.282, 0.39], [0.248, 0.48], [0.222, 0.55],
  [0.212, 0.61], [0.22, 0.68], [0.232, 0.76], [0.228, 0.84], [0.195, 0.915], [0.13, 0.968], [0.0, 1.0],
];
const NP = PROFILE.length;
const key = (i) => {
  if (i < 0) return [2 * PROFILE[0][0] - PROFILE[1][0], 2 * PROFILE[0][1] - PROFILE[1][1]];   // straight continuation below the foot
  if (i >= NP) return [-PROFILE[NP - 2][0], PROFILE[NP - 2][1]];                              // mirror across the axis: a smooth crown
  return PROFILE[i];
};
const cr = (a, b, c, d, u) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
/** profileAt(s) -> [r, y] on the Catmull-Rom curve through PROFILE, s in [0, PROFILE.length - 1] */
export function profileAt(s) {
  const sc = clamp(s, 0, NP - 1), i = Math.min(NP - 2, Math.floor(sc)), u = sc - i;
  const a = key(i - 1), b = key(i), c = key(i + 1), d = key(i + 2);
  return [Math.max(0, cr(a[0], b[0], c[0], d[0], u)), clamp(cr(a[1], b[1], c[1], d[1], u), 0, 1)];
}
/** sAtHeight(y) -> curve parameter where the profile reaches height y (the height is monotonic along the curve) */
export function sAtHeight(y) {
  let lo = 0, hi = NP - 1;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (profileAt(m)[1] < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** radiusAt(y) -> outer radius at height y (unit doll) */
export const radiusAt = (y) => profileAt(sAtHeight(clamp(y, 0, 1)))[0];
/** outerPoints(y0, y1, n) -> n + 1 points [r, y] along the outer profile from height y0 up to y1 */
export function outerPoints(y0, y1, n) {
  const s0 = sAtHeight(y0), s1 = sAtHeight(y1), out = [];
  for (let i = 0; i <= n; i++) out.push(profileAt(lerp(s0, s1, i / n)));
  out[0][1] = y0; out[n][1] = y1;
  return out;
}
export const MAX_RADIUS = Math.max(...Array.from({ length: 400 }, (_, i) => profileAt((i / 399) * (NP - 1))[0]));

/**
 * shellSections(N, res = 56) -> the lathe polylines of one unit doll. Every section is a run of [r, y] points;
 * walking a section with the surface normal = (dy, -dr) gives the visible side (style.js relies on that).
 *   painted:  cupOuter, lidOuter, solidOuter           bare wood: foot, cupInside[], lidInside[]
 */
export function shellSections(N, res = 56) {
  const ys = N.split, th = N.tenon.h, wb = N.wall.bottom, wt = N.wall.top;
  const nCup = Math.max(8, Math.round(res * ys)), nLid = Math.max(8, res - nCup);
  const rS = radiusAt(ys), rT = rS - wt - N.tenon.gap;                     // tenon outer radius: just inside the lid wall
  const inBottom = outerPoints(N.floor, ys + th, nCup).map(([r, y]) => [Math.max(0.01, r - wb), y]).reverse();
  const inTop = outerPoints(ys, N.ceiling, nLid).map(([r, y]) => [Math.max(0.01, r - wt), y]).reverse();
  return {
    foot: [[0, 0], [PROFILE[0][0], 0]],
    cupOuter: outerPoints(0, ys, nCup),
    lidOuter: outerPoints(ys, 1, nLid),
    solidOuter: outerPoints(0, 1, res),
    cupInside: [
      [[rS, ys], [rT, ys]],                                                 // the shoulder the lid sits on
      [[rT, ys], [rT, ys + th]],                                            // tenon wall
      [[rT, ys + th], [inBottom[0][0], ys + th]],                           // tenon top
      inBottom,                                                             // cavity wall, top -> floor
      [[inBottom[inBottom.length - 1][0], N.floor], [0, N.floor]],          // cavity floor
    ],
    lidInside: [
      [[0, N.ceiling], [inTop[0][0], N.ceiling]],                           // cavity ceiling
      inTop,                                                                // cavity wall, ceiling -> rim
      [[inTop[inTop.length - 1][0], ys], [rS, ys]],                         // the lid's rim
    ],
  };
}

/** fitReport(N) -> { ok, worst (m of slack for a unit parent, negative = collision), at } : does a child fit its parent's cavity? */
export function fitReport(N) {
  const q = N.ratio, ys = N.split, th = N.tenon.h;
  let worst = Infinity, at = null;
  for (let i = 0; i <= 240; i++) {
    const [r, y] = profileAt((i / 240) * (NP - 1));
    const py = N.floor + q * y;                                             // the child stands on the cavity floor
    const cavity = radiusAt(py) - (py <= ys + th ? N.wall.bottom : N.wall.top);
    const slack = cavity - q * r - N.clearance;
    if (slack < worst) { worst = slack; at = +py.toFixed(3); }
  }
  const head = N.ceiling - (N.floor + q) - N.clearance;
  if (head < worst) { worst = head; at = "ceiling"; }
  return { ok: worst >= 0, worst: +worst.toFixed(4), at };
}

// ---------------------------------------------------------------------------------------------------- the plan
/**
 * createPlan(N = STYLE_SPEC.nest, { end = Infinity }) -> plan
 *   plan = { levels, n, finale, dotOf(k), dollPose(k, t), lidPose(k, t), boxOf(k, t), events(), fit }
 *   levels[k] = { k, scale, H, R, x, solid, open?: { t0, d, twist, lidOut, rise, hop, lidBack, lock }, born?: parent's open }
 *   World: the row runs along +X (largest at the left), every doll faces +Z, the table is y = 0.
 */
export function createPlan(N, o = {}) {
  const n = N.count;
  const fit = fitReport(N);
  if (!fit.ok) throw new Error(`nesting-dolls: a child (ratio ${N.ratio}) does not fit its parent's cavity (slack ${fit.worst} at ${fit.at})`);
  const levels = [];
  for (let k = 0; k < n; k++) {
    const scale = Math.pow(N.ratio, k), H = N.height * scale;
    levels.push({ k, scale, H, R: MAX_RADIUS * H, solid: k === n - 1, x: 0 });
  }
  for (let k = 1; k < n; k++) {
    const a = levels[k - 1], b = levels[k];
    b.x = a.x + a.R + b.R + N.gap[0] + N.gap[1] * (a.H + b.H) * 0.5;
  }
  const mid = (levels[0].x - levels[0].R + levels[n - 1].x + levels[n - 1].R) / 2;
  for (const L of levels) L.x = +(L.x - mid).toFixed(5);

  // schedule: level k opens for cycle * accel^k seconds, one after the other
  let t0 = N.start;
  for (let k = 0; k < n - 1; k++) {
    const d = N.cycle * Math.pow(N.accel, k);
    const ph = (name) => N.phases[name].map((f) => +(t0 + f * d).toFixed(4));
    levels[k].open = { t0, d, twist: ph("twist"), lidOut: ph("lidOut"), rise: ph("rise"), hop: ph("hop"), lidBack: ph("lidBack"), lock: ph("lock") };
    levels[k + 1].born = levels[k].open;
    t0 += d;
  }
  const lastLand = levels[n - 1].born ? levels[n - 1].born.hop[1] : N.start;
  const F = N.finale;
  const knock = [lastLand + F.knockAfter, lastLand + F.knockAfter + F.knockGap];
  const dive = [lastLand + F.diveAfter, lastLand + F.diveAfter + F.dive];
  const emerge = [dive[1], dive[1] + F.emerge];
  const wave = { t0: emerge[1] + F.waveAfter, step: F.waveStep, dur: F.waveDur, hop: F.waveHop };
  const finale = { lastLand, knock, dive, emerge, wave, end: wave.t0 + (n - 1) * wave.step + wave.dur };

  const u01 = (t, [a, b]) => clamp((t - a) / (b - a));
  const riseTop = N.split + N.tenon.h + N.riseClear;
  /** the damped wobble after a landing at time `at` -> vertical scale */
  const squashAt = (t, at, amount = N.squash.amount) => {
    const s = t - at;
    return s < 0 ? 1 : 1 - amount * Math.exp(-s * N.squash.decay) * Math.cos(s * N.squash.hz * Math.PI * 2);
  };

  /**
   * dollPose(k, t) -> { visible, x, y, z, lean (rad about Z), turn (rad about Y), sy (vertical squash; style keeps the volume) }
   *   A child is invisible until its parent's lid lets go, waits on the cavity floor, rises, hops to its place, wobbles.
   */
  function dollPose(k, t) {
    const L = levels[k];
    const p = { visible: true, x: L.x, y: 0, z: 0, lean: 0, turn: 0, sy: 1 };
    if (L.born) {
      const P = levels[k - 1], O = L.born;
      if (t < O.lidOut[0]) p.visible = false;
      if (t < O.hop[0]) {
        p.x = P.x;
        p.y = lerp(N.floor * P.H, riseTop * P.H, ease.inOutCubic(u01(t, O.rise)));
      } else if (t < O.hop[1]) {
        const u = u01(t, O.hop);
        p.x = lerp(P.x, L.x, ease.inOutSine(u));
        p.y = riseTop * P.H * (1 - u) + 4 * N.hopArc * L.H * u * (1 - u);
        p.lean = -N.lean * Math.sin(Math.PI * u);
      } else p.sy *= squashAt(t, O.hop[1]);
    }
    if (L.solid) {                                  // the solid one cannot open: it wiggles and knocks twice
      for (const kt of finale.knock) {
        const s = t - kt;
        if (s > -0.16 && s < 0.3) {
          const w = Math.sin(Math.PI * clamp((s + 0.16) / 0.46));
          p.turn += 0.5 * w * Math.sin((s + 0.16) * 30);
          p.y += 0.05 * L.H * Math.max(0, Math.sin(Math.PI * clamp((s + 0.16) / 0.16)));
        }
        p.sy *= squashAt(t, kt, N.squash.amount * 0.6);
      }
    }
    const tw = finale.wave.t0 + k * finale.wave.step;   // the last wave: everyone hops once, large to small
    if (t > tw) {
      const u = (t - tw) / finale.wave.dur;
      if (u < 1) p.y += 4 * finale.wave.hop * L.H * u * (1 - u);
      else p.sy *= squashAt(t, tw + finale.wave.dur, N.squash.amount * 0.7);
    }
    return p;
  }

  /**
   * lidPose(k, t) -> { x, y, z, turn } in DOLL HEIGHTS, relative to the closed position (0, 0, 0, 0).
   *   twist -> hop off and back to the park spot (rim on the table) -> wait -> hop back on -> twist locked.
   */
  function lidPose(k, t) {
    const O = levels[k].open, p = { x: 0, y: 0, z: 0, turn: 0 };
    if (!O || t <= O.twist[0] || t >= O.lock[1]) return p;
    const A = N.twist, park = N.lidPark;
    const arc = (u, back) => {
      const e = ease.inOutSine(u), w = back ? 1 - e : e;
      p.x = park[0] * w; p.z = park[1] * w;
      p.y = -N.split * (back ? 1 - u : u) + 4 * N.lidArc * u * (1 - u);
    };
    if (t < O.twist[1]) {
      const u = u01(t, O.twist);
      p.turn = A * ease.inOutSine(u) + 0.06 * Math.sin(u * Math.PI * 6) * (1 - u);   // a little stick-slip
    } else if (t < O.lidOut[1]) { const u = u01(t, O.lidOut); arc(u, false); p.turn = A * (1 - ease.outCubic(u)); }
    else if (t < O.lidBack[0]) { p.x = park[0]; p.z = park[1]; p.y = -N.split; }
    else if (t < O.lidBack[1]) { const u = u01(t, O.lidBack); arc(u, true); p.turn = -0.6 * A * ease.inCubic(u); }
    else p.turn = -0.6 * A * (1 - ease.outCubic(u01(t, O.lock)));
    return p;
  }

  /** dotOf(k) -> world point of the yellow dot on doll k's belly when it stands in the row (needs paint.emblem.y) */
  const dotOf = (k, emblemY) => [levels[k].x, emblemY * levels[k].H, radiusAt(emblemY) * levels[k].H];

  /** cycleBox(k) -> [min, max]: everything cycle k needs in frame (the opening doll, its child rising and landing) */
  const cycleBox = (k) => {
    const L = levels[k], C = levels[k + 1];
    const top = Math.max(L.H, (riseTop + N.ratio + 0.02) * L.H);   // the hop's peak pokes a little higher for a moment
    return [[L.x - L.R, 0, -0.15 * L.H], [C.x + C.R, top, 0.6 * L.R]];
  };
  const rowBox = () => [[levels[0].x - levels[0].R, 0, -0.3 * levels[0].R], [levels[n - 1].x + levels[n - 1].R, levels[0].H * (1 + finale.wave.hop * 0.6), 0.5 * levels[0].R]];
  const dollBox = (k, pad = 0.04) => { const L = levels[k]; return [[L.x - L.R, 0, -0.5 * L.R], [L.x + L.R, L.H * (1 + pad), 0.5 * L.R]]; };

  /** events() -> [{ t, kind, k (level that sets the pitch), x, dur? }] for kit/schedule.scoreFromEvents */
  function events() {
    const end = o.end ?? Infinity, ev = [{ t: 0, kind: "bed", k: 0, x: 0, dur: Math.min(end, finale.end + 3) }];
    for (let k = 0; k < n - 1; k++) {
      const L = levels[k], C = levels[k + 1], O = L.open;
      ev.push({ t: O.twist[0], kind: "creak", k, x: L.x, dur: O.twist[1] - O.twist[0] });
      ev.push({ t: O.lidOut[0], kind: "pop", k, x: L.x });
      ev.push({ t: O.lidOut[1], kind: "lid", k, x: L.x });
      ev.push({ t: O.rise[0], kind: "rise", k: k + 1, x: L.x, dur: O.rise[1] - O.rise[0] });
      ev.push({ t: O.hop[1], kind: "land", k: k + 1, x: C.x });
      ev.push({ t: O.lidBack[1], kind: "seat", k, x: L.x });
    }
    for (const kt of finale.knock) ev.push({ t: kt, kind: "knock", k: n - 1, x: levels[n - 1].x });
    ev.push({ t: finale.dive[0], kind: "dive", k: n - 1, x: levels[n - 1].x, dur: finale.dive[1] - finale.dive[0] });
    ev.push({ t: finale.emerge[0], kind: "emerge", k: 0, x: 0, dur: finale.emerge[1] - finale.emerge[0] });
    for (let k = 0; k < n; k++) ev.push({ t: finale.wave.t0 + k * finale.wave.step + finale.wave.dur, kind: "wave", k, x: levels[k].x, last: k === n - 1 });
    return ev.filter((e) => e.t < end).sort((a, b) => a.t - b.t);
  }

  return { N, n, levels, finale, fit, riseTop, dollPose, lidPose, dotOf, cycleBox, rowBox, dollBox, events };
}

/** nestVoices(SND, plan) -> voices for scoreFromEvents. Everything is pitched by the level: smaller doll = higher. */
export function nestVoices(SND, plan) {
  const p = (e) => Math.pow(1 / plan.levels[e.k].scale, SND.pitchPower);
  const note = (e) => SND.scale[Math.min(e.k, SND.scale.length - 1)];
  const size = (e) => 0.55 + 0.45 * plan.levels[e.k].scale;          // small dolls are a little quieter
  return {
    creak: (e) => [
      { type: "penScratch", dur: e.dur, pitch: 0.5 * p(e), speed: 0.6, gain: SND.creak.gain * size(e) },
      { type: "servo", dur: e.dur, hz: SND.creak.hz[0] * p(e), hz2: SND.creak.hz[1] * p(e), grit: 0.85, gain: SND.creak.servo * size(e) },
    ],
    pop: (e) => [
      { type: "pop", pitch: 0.7 * p(e), gain: SND.pop.gain * size(e) },
      { type: "marimba", hz: note(e) * 0.5, dur: 0.3, decay: 0.07, mallet: 0.9, gain: SND.pop.gain * 0.35 * size(e) },
    ],
    lid: (e) => [{ type: "tick", pitch: 0.7 * p(e), gain: SND.lid.gain * size(e) }, { type: "thud", dur: 0.2, pitch: 1.5 * p(e), gain: SND.lid.gain * 0.6 * size(e) }],
    rise: (e) => [{ type: "whoosh", dur: Math.max(0.2, e.dur), dir: "in", pitch: 1.1 * p(e), gain: SND.rise.gain }],
    land: (e) => [
      { type: "marimba", hz: note(e), dur: 0.7, decay: SND.land.decay, mallet: 0.75, gain: SND.land.gain },
      { type: "thud", dur: 0.25, pitch: 1.2 * p(e), gain: SND.land.thud * size(e) },
    ],
    seat: (e) => [
      { type: "clack", pitch: 0.8 * p(e), gain: SND.seat.gain * size(e) },
      { type: "marimba", hz: note(e) * 2, dur: 0.4, decay: 0.08, mallet: 0.6, gain: SND.seat.note, offset: 0.05 },
    ],
    knock: (e) => [{ type: "marimba", hz: note(e) * 2, dur: 0.3, decay: 0.05, mallet: 1, gain: SND.knock.gain }, { type: "tick", pitch: 1.6, gain: SND.knock.gain * 0.5 }],
    dive: (e) => [
      { type: "whoosh", dur: e.dur, dir: "in", gain: SND.dive.gain, pan: 0 },
      { type: "riser", dur: e.dur, gain: SND.dive.riser, pan: 0 },
    ],
    emerge: (e) => [
      { type: "whoosh", dur: Math.min(1, e.dur), dir: "out", gain: SND.emerge.gain, pan: 0 },
      { type: "chime", dur: 1.6, gain: SND.emerge.chime, pan: 0, offset: 0.05 },
    ],
    wave: (e) => e.last
      ? [{ type: "marimba", hz: note(e), dur: 1.2, decay: 0.3, mallet: 0.6, gain: SND.wave.gain }, { type: "marimba", hz: SND.scale[0], dur: 1.4, decay: 0.4, mallet: 0.4, gain: SND.wave.gain * 0.7, pan: 0 }]
      : [{ type: "marimba", hz: note(e), dur: 0.7, decay: 0.16, mallet: 0.7, gain: SND.wave.gain }],
    bed: (e) => [{ type: "pad", dur: e.dur, root: SND.pad.root, chord: SND.pad.chord, attack: 0.5, release: 1.2, brightness: SND.pad.brightness, gain: SND.pad.gain, pan: 0 }],
  };
}

/** panOf(plan) -> (event) => stereo pan from the event's x along the row */
export const panOf = (plan) => (e) => clamp((e.x ?? 0) / (plan.levels[0].R * 2 + Math.abs(plan.levels[0].x)), -1, 1) * 0.5;
