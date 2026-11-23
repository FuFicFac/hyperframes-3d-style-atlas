// styles/clockwork/train.js — the "Clockwork" planner. Pure functions: NO THREE, no window, no DOM. Imported by
// style.js (geometry + picture) AND by scene.config.js (SCORE), so every tick lands on an escapement step and every
// bell stroke on the cam drop that causes it — by construction.
//
// Conventions: the movement lies in the XY plane (the main plate faces +Z, the camera looks toward -Z); angles are
// radians, positive = counter-clockwise seen from the camera; lengths in metres (a macro "movement" ~9 m wide);
// time in seconds.
//
// What is here:
//   * gearOutline(teeth, module, opts)       involute wheel / pinion outline (closed 2D polygon, CCW)
//   * ratchetOutline(teeth, rTip, rRoot, o)  escape-wheel (club/ratchet) outline, teeth leaning clockwise
//   * spokeHoles(rIn, rHub, spokes, width)   window polygons between straight spokes (holes for the wheel shape)
//   * camOutline(cam) / camRadius(cam, u)    snail cam with N lobes (slow rise, sharp drop)
//   * hairspringPoints(angle, o)             Archimedean spiral whose inner end turns with the balance
//   * escapement(o)                          oscillator + anchor + escape wheel as closed forms of t; tick list
//   * planTrain({ arbors, driver })          meshed gear placement + every arbor's angle(t) from ONE driver
//   * camFollower(o)                         follower / hammer lift from the cam angle, drop + strike events
//   * meshReport(train, a, b, times)         numeric check that two meshed outlines interlock (no overlap)
import { clamp, TAU } from "../../kit/time.js";

const inv = (a) => Math.tan(a) - a;                     // involute function
const frac = (x) => x - Math.floor(x);
const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// ---------------------------------------------------------------------------------------------- outlines
/**
 * gearOutline(z, m, { pressureDeg = 20, addendum = 1, dedendum = 1.25, backlash = 0.06, flank = 7, tip = 3, root = 4 })
 *   -> [[x, y], ...] closed CCW polygon. Tooth 0 is centred on +X (local angle 0). True involute flanks from the base
 *   circle (or the root, if higher) to the tip, radial run-in below the base circle, arc tip and arc root.
 *   Pitch radius r = m·z/2, tip = r + addendum·m, root = r − dedendum·m. backlash (× m) thins every tooth.
 */
export function gearOutline(z, m, o = {}) {
  const { pressureDeg = 20, addendum = 1, dedendum = 1.25, backlash = 0.06, flank = 7, tip = 3, root = 4 } = o;
  const a = (pressureDeg * Math.PI) / 180;
  const r = (m * z) / 2, rb = r * Math.cos(a), ra = r + addendum * m, rf = Math.max(0.2 * r, r - dedendum * m);
  const psi = (Math.PI * m / 2 - backlash * m) / (2 * r); // half tooth angle at the pitch circle
  const d = (rho) => psi + inv(a) - inv(Math.acos(Math.min(1, rb / Math.max(rb, rho))));
  const r0 = Math.max(rb, rf);
  const dTip = Math.max(0.12 * psi, d(ra));
  const pts = [];
  const step = TAU / z;
  for (let i = 0; i < z; i++) {
    const c = i * step;
    // trailing (clockwise-side) flank: root -> tip
    if (rf < rb) pts.push(P(rf, c - d(rb)));
    for (let k = 0; k <= flank; k++) { const rho = r0 + ((ra - r0) * k) / flank; pts.push(P(rho, c - Math.max(d(rho), k === flank ? dTip : -1))); }
    for (let k = 1; k < tip; k++) pts.push(P(ra, c - dTip + (2 * dTip * k) / tip));
    for (let k = flank; k >= 0; k--) { const rho = r0 + ((ra - r0) * k) / flank; pts.push(P(rho, c + Math.max(d(rho), k === flank ? dTip : -1))); }
    if (rf < rb) pts.push(P(rf, c + d(rb)));
    // root arc to the next tooth
    const a0 = c + d(r0), a1 = c + step - d(r0);
    for (let k = 1; k < root; k++) pts.push(P(rf, a0 + ((a1 - a0) * k) / root));
  }
  return pts;
}

/**
 * ratchetOutline(z, rTip, rRoot, { lean = .14, tipW = .06, back = 6 }) -> CCW polygon: escape wheel with pointed
 *   club-ish teeth whose LOCKING face leads when the wheel turns CLOCKWISE. Tooth i tip at angle i·2π/z.
 *   `lean`, `tipW` in fractions of the tooth pitch.
 */
export function ratchetOutline(z, rTip, rRoot, o = {}) {
  const { lean = 0.14, tipW = 0.06, back = 6 } = o;
  const p = TAU / z, pts = [];
  for (let i = 0; i < z; i++) {
    const c = i * p;
    pts.push(P(rRoot, c + lean * p));             // foot of the locking face
    pts.push(P(rTip, c));                          // leading tip (locking corner)
    pts.push(P(rTip, c + tipW * p));               // impulse tip
    for (let k = 1; k <= back; k++) {             // long concave back to the next root
      const u = k / back, ang = c + tipW * p + u * (0.86 - tipW) * p;
      const rr = rTip - (rTip - rRoot) * Math.pow(u, 0.62);
      pts.push(P(rr, ang));
    }
  }
  return pts;
}

/** spokeHoles(rIn, rHub, n, width, { phase = 0, seg = 10 }) -> [polygon, ...]: windows between n straight spokes. */
export function spokeHoles(rIn, rHub, n, width, o = {}) {
  const { phase = 0, seg = 10 } = o;
  const holes = [];
  const half = width / 2;
  for (let j = 0; j < n; j++) {
    const a0 = phase + (j * TAU) / n, a1 = a0 + TAU / n;
    const dO = Math.asin(Math.min(0.99, half / rIn)), dI = Math.asin(Math.min(0.99, half / rHub));
    if (a1 - dI - (a0 + dI) <= 0.05) continue;
    const h = [];
    for (let k = 0; k <= seg; k++) h.push(P(rIn, a0 + dO + ((a1 - dO - (a0 + dO)) * k) / seg));
    for (let k = seg; k >= 0; k--) h.push(P(rHub, a0 + dI + ((a1 - dI - (a0 + dI)) * k) / seg));
    holes.push(h.reverse()); // holes clockwise
  }
  return holes;
}

/** camRadius(cam, u): radius of the snail cam at LOCAL angle u. cam = { lobes, rMin, rMax, rise = .88, dir = +1 }. */
export function camRadius(cam, u) {
  const L = TAU / cam.lobes, v = frac((-(cam.dir ?? 1) * u) / L);
  return cam.rMin + (cam.rMax - cam.rMin) * Math.min(1, v / (cam.rise ?? 0.88));
}
/** camOutline(cam, perLobe = 48) -> CCW polygon (drops are exact radial edges). */
export function camOutline(cam, perLobe = 48) {
  const L = TAU / cam.lobes, pts = [];
  for (let j = 0; j < cam.lobes; j++) {
    for (let k = 0; k <= perLobe; k++) {
      // walk CCW in local angle; the drop sits at multiples of L
      const u = j * L + (k / perLobe) * L * (1 - 1e-4) + (k === 0 ? 1e-4 * L : 0);
      pts.push(P(camRadius(cam, u), u));
    }
  }
  return pts;
}

/**
 * hairspringPoints(angle, { r0 = .1, r1 = .5, turns = 11, n = 420, studAngle = 0, z = 0 }) -> [[x, y, z], ...]
 *   Archimedean spiral from the collet (r0, turns with the balance by `angle`) to the stud (r1, fixed at studAngle).
 *   The winding share of the balance angle falls linearly along the spring: the spring "breathes".
 */
export function hairspringPoints(angle, o = {}) {
  const { r0 = 0.1, r1 = 0.5, turns = 11, n = 420, studAngle = 0, z = 0 } = o;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const r = r0 + (r1 - r0) * s;
    const a = studAngle - (1 - s) * turns * TAU + (1 - s) * angle;
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- escapement
/**
 * escapement({ teeth = 15, period = 1, t0 = .25, amplitude = 2.2, pinAngle = .3, lift = .12, drop = .07,
 *              recoil = .06, recoilDur = .09, theta0 = 0, sign = -1 })
 *   A balance (or pendulum) swings as amplitude·sin(2π(t − t0)/period); it passes centre every period/2 — a BEAT.
 *   At each beat the anchor is flipped by the impulse pin (the fork follows the balance only within ±pinAngle) and the
 *   escape wheel advances half a tooth pitch in `drop` seconds, overshoots by `recoil` (fraction of the step) and
 *   settles back over `recoilDur`. Escape wheel turns CLOCKWISE.
 *   -> { beat, halfPitch, steps(t), wheel(t), anchor(t), balance(t), tickTimes(t0, t1), stepOf(t), tickAt(n) }
 */
export function escapement(o = {}) {
  const E = { teeth: 15, period: 1, t0: 0.25, amplitude: 2.2, pinAngle: 0.3, lift: 0.12, drop: 0.07, recoil: 0.06, recoilDur: 0.09, theta0: 0, sign: -1, ...o };
  const beat = E.period / 2, halfPitch = Math.PI / E.teeth;
  const g = (tau) => {
    if (tau <= 0) return 0;
    if (tau < E.drop) { const u = tau / E.drop; return (1 + E.recoil) * (1 - (1 - u) * (1 - u)); }
    const u = clamp((tau - E.drop) / E.recoilDur);
    return 1 + E.recoil * (1 - u * u * (3 - 2 * u));
  };
  const tickAt = (n) => E.t0 + n * beat;
  const stepOf = (t) => Math.floor((t - E.t0) / beat + 1e-9);
  const steps = (t) => { const n = stepOf(t); return n + g(t - tickAt(n)); };
  const balance = (t) => E.sign * E.amplitude * Math.sin((TAU * (t - E.t0)) / E.period);
  return {
    ...E, beat, halfPitch, g, tickAt, stepOf, steps, balance,
    /** escape wheel angle (rad): theta0 − halfPitch·steps(t)  (clockwise) */
    wheel: (t) => E.theta0 - halfPitch * steps(t),
    /** anchor (pallet fork) angle: ±lift, crossing over only while the impulse pin is in the fork. Fork and roller
     *  turn OPPOSITE ways (like two meshed wheels), hence the minus; with the default sign = -1 the anchor is at +lift
     *  (entry pallet in) after even beats, matching escapementLayout().theta0. */
    anchor: (t) => -E.lift * clamp(balance(t) / E.pinAngle, -1, 1),
    /** beat instants within [a, b]: { t, n, kind: "tick"|"tock" } */
    tickTimes(a, b) {
      const out = [];
      for (let n = Math.ceil((a - E.t0) / beat - 1e-9) + 0; tickAt(n) <= b + 1e-9; n++) out.push({ t: tickAt(n), n: n + 0, kind: Math.abs(n % 2) === 0 ? "tick" : "tock" });
      return out;
    },
    /** invert the step shape: time after the beat at which the wheel has advanced `f` (0..1+recoil) of a step */
    timeInStep(f) {
      if (f <= 0) return 0;
      let lo = 0, hi = E.drop;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (g(mid) < f) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    },
  };
}

/**
 * escapementLayout({ center:[x,y], teeth, rTip, axisDeg = 20, pivotDist, palletSpan = 2.5, lock = .13 })
 *   Where the anchor pivot and its two pallets sit for an escape wheel at `center`, symmetric about the axis that
 *   points from the wheel to the anchor (and on to the balance). Pallets are palletSpan·pitch apart, so they lock
 *   teeth alternately on half-pitch steps. Returns { pivot, entry:{angle}, exit:{angle}, theta0, axis } where theta0 is
 *   the wheel angle that puts a tooth's locking corner `lock`·pitch behind the entry pallet when the entry pallet is in.
 */
export function escapementLayout(o) {
  const { center, teeth, rTip, axisDeg = 20, pivotDist, palletSpan = 2.5, lock = 0.13 } = o;
  const p = TAU / teeth, axis = (axisDeg * Math.PI) / 180;
  const entry = axis + (palletSpan / 2) * p, exit = axis - (palletSpan / 2) * p;
  const pivot = [center[0] + pivotDist * Math.cos(axis), center[1] + pivotDist * Math.sin(axis)];
  // state "entry in" happens after even ticks (steps odd): wheel angle theta0 − halfPitch ≡ entry + lock·p (mod p)
  const theta0 = entry + lock * p + p / 2;
  return { pivot, axis, entry: { angle: entry }, exit: { angle: exit }, theta0, pitch: p, rTip };
}

// ---------------------------------------------------------------------------------------------- the train
/**
 * planTrain({ module, arbors, driver }) -> train
 *   arbors: [{ id, pos:[x,y] }                                    // the driver arbor (first; angle = driver(t))
 *            { id, mesh: { with, theirs, mine, dirDeg, module? } } // placed so its `mine`-tooth element meshes the
 *          ]                                                       // `theirs`-tooth element of arbor `with`
 *   Centre distance = module·(mine + theirs)/2 along dirDeg. Each arbor's angle is LINEAR in the driver angle:
 *   θ = c + k·θdriver with k = −k_with·theirs/mine (directions alternate) and c chosen so a tooth of one element faces
 *   a gap of the other on the line of centres (phases aligned). Tooth 0 of every element sits at local angle 0.
 *   -> { arbors: { id: { pos, c, k, dir, teeth } }, angle(id, t), ratio(a, b), list }
 */
export function planTrain({ module = 0.05, arbors, driver }) {
  const A = {};
  for (const a of arbors) {
    if (!a.mesh) { A[a.id] = { ...a, pos: a.pos, c: 0, k: 1 }; continue; }
    const M = a.mesh, par = A[M.with];
    if (!par) throw new Error(`planTrain: ${a.id} meshes with unknown/later arbor ${M.with}`);
    const m = M.module ?? module, phi = (M.dirDeg * Math.PI) / 180, dist = (m * (M.mine + M.theirs)) / 2;
    const pos = [par.pos[0] + dist * Math.cos(phi), par.pos[1] + dist * Math.sin(phi)];
    const zA = M.theirs, zB = M.mine, q = zA / zB;
    // θB = φ + π − π/zB + q·φ − q·θA   with θA = cA + kA·θd
    const c = phi + Math.PI - Math.PI / zB + q * phi - q * par.c;
    A[a.id] = { ...a, pos, c, k: -q * par.k, dist };
  }
  for (const a of Object.values(A)) a.dir = Math.sign(a.k);
  const train = {
    arbors: A,
    list: arbors.map((a) => a.id),
    driver,
    angle: (id, t) => A[id].c + A[id].k * driver(t),
    /** turns of arbor b per turn of arbor a (signed: negative = opposite direction) */
    ratio: (a, b) => A[b].k / A[a].k,
  };
  return train;
}

// ---------------------------------------------------------------------------------------------- cam + follower
/** turnDir(train, arbor, esc) -> +1 if the arbor turns counter-clockwise as time runs, else -1 (k × driver direction). */
export const turnDir = (train, arbor, esc) => Math.sign(train.arbors[arbor].k) * (esc ? -1 : 1) || 1; // escape wheel turns clockwise
/**
 * camFollower({ train, arbor, cam:{lobes,rMin,rMax,rise}, contactDeg, phase, esc, t0, t1, fall = .075, bounce = .05,
 *               bounceDur = .32 }) -> { lift(t), drops, strikes, camAngle(t) }
 *   The cam turns with `arbor` (+ phase). The follower presses on it at world angle contactDeg. lift(t) is the
 *   follower's radius: it rides the ramp, and after each drop falls (inQuad, `fall` s) to rMin — the STRIKE — then
 *   bounces once and rests on the cam. Drops happen only while the escape wheel steps, so each strike is planned
 *   from the escapement: drops[i] = { t, n } (n = beat index), strikes[i] = { t, kind: "strike" }.
 */
export function camFollower(o) {
  const { train, arbor, cam, contactDeg, phase = 0, esc, t0 = 0, t1 = 15, fall = 0.075, bounce = 0.05, bounceDur = 0.32 } = o;
  const ar = train.arbors[arbor];
  const C = { ...cam, dir: turnDir(train, arbor, esc) };
  const gam = (contactDeg * Math.PI) / 180, L = TAU / C.lobes;
  const camAngle = (t) => train.angle(arbor, t) + phase;
  const w = (theta) => (-C.dir * (gam - theta)) / L;          // lobe coordinate: integer crossings = drops
  const drops = [];
  const thetaAt = (s) => ar.c + ar.k * (esc.theta0 - esc.halfPitch * s) + phase;
  // a drop can only happen while the escape wheel steps: test every beat's step n -> n + 1 for an integer crossing of w
  for (const tk of esc.tickTimes(t0 - esc.beat, t1)) {
    const n = tk.n, wa = w(thetaAt(n)), wb = w(thetaAt(n + 1));
    const edge = wb > wa ? Math.floor(wb) : Math.floor(wa);
    if (edge > Math.min(wa, wb) && edge <= Math.max(wa, wb)) {
      const f = (edge - wa) / (wb - wa);                     // fraction of the step at which the edge passes
      const t = tk.t + esc.timeInStep(f);
      if (t >= t0 && t <= t1) drops.push({ t, n });
    }
  }
  const strikes = drops.map((d) => ({ t: d.t + fall, kind: "strike", n: d.n }));
  const camR = (t) => camRadius(C, gam - camAngle(t));
  const lift = (t) => {
    let r = camR(t);
    for (const d of drops) {
      const tau = t - d.t;
      if (tau < 0 || tau > fall + bounceDur) continue;
      const rTop = C.rMax;
      if (tau < fall) { const u = tau / fall; r = Math.max(r, rTop - (rTop - C.rMin) * u * u); }
      else { const u = (tau - fall) / bounceDur; r = Math.max(r, C.rMin + bounce * Math.sin(Math.PI * Math.min(1, u * 1.6)) * Math.exp(-3 * u)); }
    }
    return r;
  };
  return { cam: C, contact: gam, camAngle, lift, drops, strikes, camR };
}

/**
 * alignCamPhase({ train, arbor, cam, contactDeg, esc, target }) -> phase so that a drop occurs on the escapement step
 *   at (or just after) `target` seconds: the drop edge is placed half a step past the contact at that step.
 */
export function alignCamPhase({ train, arbor, contactDeg, esc, target }) {
  const ar = train.arbors[arbor];
  void turnDir;
  const n = Math.ceil((target - esc.t0) / esc.beat - 1e-9);
  const th = (s) => ar.c + ar.k * (esc.theta0 - esc.halfPitch * s);
  const mid = (th(n) + th(n + 1)) / 2;                      // cam angle half-way through that step
  // lobe coordinate w = -dir (gam - (mid + phase)) / L is an integer when phase = gam - mid
  return (contactDeg * Math.PI) / 180 - mid;
}

// ---------------------------------------------------------------------------------------------- verification
const inPoly = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const place = (poly, pos, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return poly.map(([x, y]) => [pos[0] + c * x - s * y, pos[1] + s * x + c * y]); };
/**
 * meshReport(train, a, b, outlineA, outlineB, times) -> { overlaps, worst, samples }: counts outline vertices of
 *   each element lying inside the other at every sampled time (0 = teeth interlock without interpenetrating) and
 *   the smallest vertex clearance seen. Run it in Node before rendering.
 */
export function meshReport(train, a, b, outA, outB, times) {
  let overlaps = 0, samples = 0;
  for (const t of times) {
    const PA = place(outA, train.arbors[a].pos, train.angle(a, t)), PB = place(outB, train.arbors[b].pos, train.angle(b, t));
    for (const p of PA) if (inPoly(p, PB)) overlaps++;
    for (const p of PB) if (inPoly(p, PA)) overlaps++;
    samples++;
  }
  return { overlaps, samples };
}
