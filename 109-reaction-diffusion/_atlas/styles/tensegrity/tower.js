// styles/tensegrity/tower.js — the ONE plan of the "Tensegrity" style (pure: no THREE, no window, no DOM; Node-safe).
// From the tower numbers in spec.tower this module derives
//   - the topology of a stacked strut-and-cord tower: `levels` twisted three-strut prisms; the top of each level and the
//     bottom of the next meet in one zig-zag ring of six cords (they overlap, so the ring hangs the upper level);
//   - three SOLVED poses (static balance, struts nearly rigid, cords tension-only elastic, bottom feet pinned):
//       P1 standing under prestress, P2 with the brass weight on the top three nodes, P3 with the weight AND one cord cut,
//       where strut-to-strut contact (a stiff repulsion at two strut radii) is what finally holds the slumped shape;
//   - every cord's tension in every pose (brightness and pluck pitch), the light-up order, the cut, the contacts;
//   - the slump path P2 -> P3: the solver's own damped descent, recorded and resampled by distance (an art-directed
//     clock runs along it; it is not a time-accurate rigid-body simulation);
//   - the weight's and the snips' planned flights, and every sound event.
// Solving is a fixed number of deterministic damped-relaxation steps on plain arrays (no RNG at all): the same numbers on
// every load, in Node (render-sfx, export-spec) and in the page. style.js reads the plan; scene.config.js builds SCORE.
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------- topology + first guess
/**
 * buildTower(T) -> { X0, fixed, struts: [{ a, b, L0, lv }], cords: [{ a, b, kind, lv, rest }], topNodes, n }
 *   Node 6i+j = bottom j of level i, 6i+3+j = top j. Struts B[j] -> T[j+1]; "vert" cords B[j] -> T[j]; "ring" cords join
 *   each bottom node of level i+1 to the two nearest top nodes of level i; one "top" triangle closes the last level.
 *   Cord rest lengths = prestrain x guess length (the guess is then relaxed to the real balance, P1).
 */
export function buildTower(T) {
  const X0 = [], fixed = [], struts = [], cords = [];
  let phi = T.phase ?? 0;
  for (let i = 0; i < T.levels; i++) {
    const yb = i * (T.H - T.overlap), yt = yb + T.H;
    for (let j = 0; j < 3; j++) { const a = (phi + j * 120) * DEG; X0.push([T.radius * Math.cos(a), yb, T.radius * Math.sin(a)]); fixed.push(i === 0); }
    for (let j = 0; j < 3; j++) { const a = (phi + T.twist + j * 120) * DEG; X0.push([T.radius * Math.cos(a), yt, T.radius * Math.sin(a)]); fixed.push(false); }
    phi += T.step;
  }
  const B = (i, j) => 6 * i + ((j + 3) % 3), Tp = (i, j) => 6 * i + 3 + ((j + 3) % 3);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  for (let i = 0; i < T.levels; i++) {
    for (let j = 0; j < 3; j++) struts.push({ a: B(i, j), b: Tp(i, j + 1), lv: i });
    for (let j = 0; j < 3; j++) cords.push({ a: B(i, j), b: Tp(i, j), kind: "vert", lv: i });
    if (T.diag) for (let j = 0; j < 3; j++) cords.push({ a: B(i, j), b: Tp(i, j + 2), kind: "diag", lv: i });
    if (i + 1 < T.levels) for (let j = 0; j < 3; j++) {
      cords.push({ a: B(i + 1, j), b: Tp(i, j), kind: "ring", lv: i + 0.5 });
      cords.push({ a: B(i + 1, j), b: Tp(i, j + 1), kind: "ring", lv: i + 0.5 });
    }
    if (i === T.levels - 1) for (let j = 0; j < 3; j++) cords.push({ a: Tp(i, j), b: Tp(i, j + 1), kind: "top", lv: i });
  }
  for (const s of struts) s.L0 = dist(X0[s.a], X0[s.b]);
  for (const c of cords) c.rest = dist(X0[c.a], X0[c.b]) * T.prestrain;
  const L = T.levels - 1;
  return { X0, fixed, struts, cords, topNodes: [Tp(L, 0), Tp(L, 1), Tp(L, 2)], n: X0.length };
}

// ---------------------------------------------------------------------------------------------- the static solver
/** closest points between segments p1-q1 and p2-q2 (no allocation): writes [d, s, t] into out */
function segClosest(X, a1, b1, a2, b2, out) {
  const p1x = X[3 * a1], p1y = X[3 * a1 + 1], p1z = X[3 * a1 + 2], p2x = X[3 * a2], p2y = X[3 * a2 + 1], p2z = X[3 * a2 + 2];
  const d1x = X[3 * b1] - p1x, d1y = X[3 * b1 + 1] - p1y, d1z = X[3 * b1 + 2] - p1z;
  const d2x = X[3 * b2] - p2x, d2y = X[3 * b2 + 1] - p2y, d2z = X[3 * b2 + 2] - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  const c = d1x * rx + d1y * ry + d1z * rz, b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
  let s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const dx = p1x + d1x * s - (p2x + d2x * t), dy = p1y + d1y * s - (p2y + d2y * t), dz = p1z + d1z * s - (p2z + d2z * t);
  out[0] = Math.sqrt(dx * dx + dy * dy + dz * dz); out[1] = s; out[2] = t; out[3] = dx; out[4] = dy; out[5] = dz;
  return out;
}

/**
 * relax(model, X0 (flat Float64Array or [[x,y,z]]), opts) -> { X: Float64Array, snaps: [Float64Array] }
 *   opts: { iters, load (total, shared by the top nodes), cut (cord index or -1), contact (centre distance, 0 = off),
 *           damp, dt, S (spec.tower.solver), snapEvery }
 *   Damped relaxation: v = damp v + F dt / m; x += v dt. Struts: stiff two-way springs (ks); cords: EA strain, tension only;
 *   contact: ks_c x overlap along the closest-point line, shared to the strut ends by the closest-point weights.
 */
export function relax(model, X0, o) {
  const S = o.S, n = model.n;
  const X = X0 instanceof Float64Array ? Float64Array.from(X0) : Float64Array.from(X0.flat());
  const V = new Float64Array(3 * n), F = new Float64Array(3 * n), cc = new Float64Array(6);
  const damp = o.damp ?? S.damp, dt = S.dt, im = dt / S.mass, ks = S.ks, EA = S.EA, kc = S.kContact;
  const cut = o.cut ?? -1, contact = o.contact ?? 0, load = o.load ?? 0, snaps = [];
  const st = model.struts, cs = model.cords;
  for (let it = 0; it < o.iters; it++) {
    F.fill(0);
    for (let k = 0; k < st.length; k++) {
      const s = st[k], a = 3 * s.a, b = 3 * s.b;
      const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const f = (-ks * (L - s.L0)) / L;
      F[b] += dx * f; F[b + 1] += dy * f; F[b + 2] += dz * f; F[a] -= dx * f; F[a + 1] -= dy * f; F[a + 2] -= dz * f;
    }
    for (let k = 0; k < cs.length; k++) {
      if (k === cut) continue;
      const s = cs[k], a = 3 * s.a, b = 3 * s.b;
      const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L <= s.rest) continue;
      const f = -(EA * (L - s.rest)) / s.rest / L;
      F[b] += dx * f; F[b + 1] += dy * f; F[b + 2] += dz * f; F[a] -= dx * f; F[a + 1] -= dy * f; F[a + 2] -= dz * f;
    }
    if (load) for (const i of model.topNodes) F[3 * i + 1] -= load / model.topNodes.length;
    if (contact) {
      for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
        const A = st[i], B = st[j];
        segClosest(X, A.a, A.b, B.a, B.b, cc);
        if (cc[0] >= contact) continue;
        const k = (kc * (contact - cc[0])) / Math.max(cc[0], 1e-6), s = cc[1], t = cc[2];
        for (let c = 0; c < 3; c++) {
          const f = cc[3 + c] * k;
          F[3 * A.a + c] += f * (1 - s); F[3 * A.b + c] += f * s; F[3 * B.a + c] -= f * (1 - t); F[3 * B.b + c] -= f * t;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (model.fixed[i]) continue;
      for (let c = 0; c < 3; c++) { const q = 3 * i + c; V[q] = V[q] * damp + F[q] * im; X[q] += V[q] * dt; }
      if (X[3 * i + 1] < S.floor) { X[3 * i + 1] = S.floor; V[3 * i + 1] = 0; }
    }
    if (o.snapEvery && it % o.snapEvery === 0) snaps.push(Float64Array.from(X));
  }
  if (o.snapEvery) snaps.push(Float64Array.from(X));
  return { X, snaps };
}

const nodeAt = (X, i) => [X[3 * i], X[3 * i + 1], X[3 * i + 2]];
const distX = (X, a, b) => Math.hypot(X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]);

/** tensions(model, X, S, cut) -> [T per cord] (0 when slack or cut) */
export function tensions(model, X, S, cut = -1) {
  return model.cords.map((c, k) => (k === cut ? 0 : Math.max(0, (S.EA * (distX(X, c.a, c.b) - c.rest)) / c.rest)));
}

/** strutGaps(model, X) -> [{ i, j, d, s, t, p }] surface-to-axis gaps for every strut pair (p = midpoint of the closest points) */
export function strutGaps(model, X) {
  const out = [], cc = new Float64Array(6), st = model.struts;
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    segClosest(X, st[i].a, st[i].b, st[j].a, st[j].b, cc);
    const a = st[i], s = cc[1];
    const p1 = [0, 1, 2].map((c) => X[3 * a.a + c] + (X[3 * a.b + c] - X[3 * a.a + c]) * s);
    out.push({ i, j, d: cc[0], s, t: cc[2], p: [p1[0] - cc[3] / 2, p1[1] - cc[4] / 2, p1[2] - cc[5] / 2] });
  }
  return out;
}

/** strutPair(model, X, i, j) -> { d, p } gap and closest-point midpoint of struts i and j */
export function strutPair(model, X, i, j) {
  const cc = new Float64Array(6), A = model.struts[i], B = model.struts[j];
  segClosest(X, A.a, A.b, B.a, B.b, cc);
  const s = cc[1], p1 = [0, 1, 2].map((c) => X[3 * A.a + c] + (X[3 * A.b + c] - X[3 * A.a + c]) * s);
  return { d: cc[0], p: [p1[0] - cc[3] / 2, p1[1] - cc[4] / 2, p1[2] - cc[5] / 2] };
}

// ---------------------------------------------------------------------------------------------- the plan
/**
 * createPlan({ tower: spec.tower, timing, end }) -> plan
 *   timing = { lightFrom, lightStep, place: { lift, land }, flexDur, snips: { lift, arrive, open, close }, cut, slump: { from, dur },
 *              retreat: { from, dur } }  (seconds)
 *   plan = { model, P1, P2, P3, T1, T2, T3, Tref, cut, cutPoint, contacts, path, nodes(t) -> flat array, tension(t) -> [..],
 *            glow(t) -> [..], lit(t) -> [..], order, weight(t), snips(t), cutHalves(t), slumpU(t), events(), pitch(T, L) }
 */
export function createPlan({ tower: TW, timing: TM, end }) {
  const S = TW.solver;
  const model = buildTower(TW);
  const n = model.n, cut = TW.cut;
  const r1 = relax(model, model.X0, { S, iters: S.iters });
  const P1 = r1.X;
  const P2 = relax(model, P1, { S, iters: S.itersLoad, load: TW.load }).X;
  const contactD = 2 * TW.strutRadius;
  // the slump: a heavier-damped descent (no ringing) recorded as it goes, then relaxed further to the settled P3
  const rs = relax(model, P2, { S, iters: S.itersSlump, load: TW.load, cut, contact: contactD, damp: S.dampSlump, snapEvery: S.snapEvery });
  let P3 = rs.X;
  if (S.itersSettle) { P3 = relax(model, rs.X, { S, iters: S.itersSettle, load: TW.load, cut, contact: contactD }).X; rs.snaps.push(P3); }
  const T1 = tensions(model, P1, S), T2 = tensions(model, P2, S), T3 = tensions(model, P3, S, cut);
  const Tref = Math.max(...T2);

  // resample the recorded descent by distance travelled (max node move per step) into K evenly spaced states
  const K = S.pathStates, raw = rs.snaps, cum = [0];
  for (let i = 1; i < raw.length; i++) {
    let m = 0;
    for (let q = 0; q < 3 * n; q += 3) m = Math.max(m, Math.hypot(raw[i][q] - raw[i - 1][q], raw[i][q + 1] - raw[i - 1][q + 1], raw[i][q + 2] - raw[i - 1][q + 2]));
    cum.push(cum[i - 1] + m);
  }
  const total = cum[cum.length - 1] || 1;
  const path = [];
  for (let k = 0, i = 0; k < K; k++) {
    const d = (k / (K - 1)) * total;
    while (i < cum.length - 2 && cum[i + 1] < d) i++;
    const u = cum[i + 1] > cum[i] ? clamp((d - cum[i]) / (cum[i + 1] - cum[i]), 0, 1) : 0;
    const Y = new Float64Array(3 * n);
    for (let q = 0; q < 3 * n; q++) Y[q] = lerp(raw[i][q], raw[i + 1][q], u);
    path.push(Y);
  }
  const pathAt = (u, out) => {
    // u in [0, 1 + overshoot]: piecewise-linear through the states; beyond 1 extrapolates along the last step
    const x = Math.max(0, u) * (K - 1), i = Math.min(K - 2, Math.floor(x)), f = x - i;
    for (let q = 0; q < 3 * n; q++) out[q] = path[i][q] + (path[i + 1][q] - path[i][q]) * f;
    return out;
  };

  // ---- time maps
  const flex = (t) => {        // 0 -> 1 with a small damped bounce after the weight lands (art-directed)
    const s = t - TM.place.land;
    if (s <= 0) return 0;
    const w = (2 * Math.PI) / TW.flex.period;
    return 1 - Math.exp(-s / TW.flex.decay) * Math.cos(w * s) * (1 - TW.flex.lead) - TW.flex.lead * Math.exp(-s / 0.05);
  };
  const slumpU = (t) => {      // eased run along the descent path: slow start (the cord lets go), fast middle, a tiny settle
    const s = (t - TM.slump.from) / TM.slump.dur;
    if (s <= 0) return 0;
    if (s >= 1) { const z = (t - TM.slump.from - TM.slump.dur); return 1 + TW.slumpSettle * Math.exp(-z / 0.18) * Math.sin(z * 18); }
    return ease.inOutCubic(s);
  };
  const scratch = new Float64Array(3 * n);
  const nodes = (t, out = new Float64Array(3 * n)) => {
    if (t >= TM.slump.from) return pathAt(slumpU(t), out);
    const f = flex(t);
    for (let q = 0; q < 3 * n; q++) out[q] = P1[q] + (P2[q] - P1[q]) * f;
    return out;
  };
  const tension = (t) => tensions(model, nodes(t, scratch), S, t >= TM.cut ? cut : -1);

  // ---- light-up order (beat 2): bottom to top by cord midpoint height, then around the tower
  const mid = model.cords.map((c) => [0, 1, 2].map((q) => (P1[3 * c.a + q] + P1[3 * c.b + q]) / 2));
  const order = model.cords.map((c, k) => k).sort((a, b) => (mid[a][1] - mid[b][1]) || (Math.atan2(mid[a][2], mid[a][0]) - Math.atan2(mid[b][2], mid[b][0])));
  const onAt = new Array(model.cords.length);
  order.forEach((k, r) => { onAt[k] = TM.lightFrom + r * TM.lightStep; });
  const lit = (t) => onAt.map((t0) => smoothstep(t0, t0 + TW.glow.rise, t));
  const pulse = (t) => {       // the press: every cord flashes as the load arrives, then settles to its solved share
    const s = t - TM.place.land;
    return s < 0 ? 0 : (1 - Math.exp(-s / 0.025)) * Math.exp(-s / TW.glow.pulseDecay);
  };
  const glow = (t) => {
    const T = tension(t), L = lit(t), p = pulse(t);
    return T.map((v, k) => L[k] * clamp(v / Tref, 0, 1.25) * (1 + TW.glow.pulse * p) + p * TW.glow.pulseFloor * L[k]);
  };

  // ---- the cut: snips close at the cord's `cutAt` fraction
  const cc = model.cords[cut];
  const cutPoint = (t) => { const X = nodes(Math.min(t, TM.cut)); return [0, 1, 2].map((q) => lerp(X[3 * cc.a + q], X[3 * cc.b + q], TW.cutAt)); };
  const cp = cutPoint(TM.cut);
  const cdir = (() => { const X = nodes(TM.cut); const d = [0, 1, 2].map((q) => X[3 * cc.b + q] - X[3 * cc.a + q]); const l = Math.hypot(...d); return d.map((v) => v / l); })();

  // ---- contacts in the slumped pose, each with the moment it closes along the slump
  const gaps3 = strutGaps(model, P3).filter((g) => g.d < contactD + TW.contactTol);
  const timeOfU = (u) => {     // first t at which slumpU reaches u (sampled; slumpU is monotone up to 1)
    for (let t = TM.slump.from; t <= TM.slump.from + TM.slump.dur; t += 1 / 240) if (slumpU(t) >= u) return t;
    return TM.slump.from + TM.slump.dur;
  };
  const contacts = gaps3.map((g) => {
    let k = K - 1;
    for (let i = 0; i < K; i++) { const gi = strutGaps(model, path[i]).find((h) => h.i === g.i && h.j === g.j); if (gi.d < contactD + TW.contactTol) { k = i; break; } }
    return { ...g, t: timeOfU(k / (K - 1)) };
  });

  // a lift-then-reach flight: up first, in late, so nothing passes through the tower on its way to the top
  const flight = (a, b, u, arc) => {
    const h = smoothstep(0.2, 1, u), v = smoothstep(0, 0.75, u);
    return [lerp(a[0], b[0], h), lerp(a[1], b[1], v) + Math.sin(Math.PI * u) * arc, lerp(a[2], b[2], h)];
  };
  // ---- the brass weight: waits on the table, flies to the top centroid, then rides the top triangle
  const topFrame = (X) => {
    const [a, b, c] = model.topNodes.map((i) => nodeAt(X, i));
    const cen = [0, 1, 2].map((q) => (a[q] + b[q] + c[q]) / 3);
    const u = [0, 1, 2].map((q) => b[q] - a[q]), v = [0, 1, 2].map((q) => c[q] - a[q]);
    let nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nrm) || 1; nrm = nrm.map((x) => x / l); if (nrm[1] < 0) nrm = nrm.map((x) => -x);
    return { cen, nrm, pts: [a, b, c] };
  };
  const W = TW.weight;
  const weight = (t) => {
    const on = topFrame(nodes(t));
    const seat = { pos: on.cen.map((x, q) => x + on.nrm[q] * W.seat), up: on.nrm };
    if (t >= TM.place.land) return { ...seat, onTop: true, arms: on.pts, travel: 1 };
    const rest = { pos: [W.home[0], W.home[1], W.home[2]], up: [0, 1, 0] };
    if (t <= TM.place.lift) return { ...rest, onTop: false, arms: null, travel: 0 };
    const u = ease.inOutCubic((t - TM.place.lift) / (TM.place.land - TM.place.lift));
    const target = topFrame(P1).cen.map((x) => x);
    target[1] += W.seat;
    const pos = flight(rest.pos, target, u, W.arc);
    return { pos, up: [0, 1, 0], onTop: false, arms: null, travel: u };
  };

  const SN = TW.snips;
  // ---- snips: wait on the table, fly to the cut point (blades across the cord), open, close, retreat
    // blade plane spanned by the snips' axis `ax` (horizontal, outward from the tower, perpendicular to the cord) and the cord
  const out = [cp[0], 0, cp[2]]; const ol = Math.hypot(out[0], out[2]) || 1;
  // outward and tilted down by `tilt`: the snips come up from below the cord, so their blade plane faces out and up
  let ax = [(out[0] / ol) * Math.cos(SN.tilt ?? 0), -Math.sin(SN.tilt ?? 0), (out[2] / ol) * Math.cos(SN.tilt ?? 0)];
  const dd = ax[0] * cdir[0] + ax[1] * cdir[1] + ax[2] * cdir[2];
  ax = [ax[0] - cdir[0] * dd, ax[1] - cdir[1] * dd, ax[2] - cdir[2] * dd];
  { const l = Math.hypot(...ax); ax = ax.map((v) => v / l); }
  const pivotAxis = [ax[1] * cdir[2] - ax[2] * cdir[1], ax[2] * cdir[0] - ax[0] * cdir[2], ax[0] * cdir[1] - ax[1] * cdir[0]];
  const work = cp.map((x, q) => x + ax[q] * SN.bite);           // the pivot sits outside the cord by `bite`
  const snips = (t) => {
    const lift = smoothstep(TM.snips.lift, TM.snips.arrive, t), back = smoothstep(TM.retreat.from, TM.retreat.from + TM.retreat.dur, t);
    const openA = SN.open * (smoothstep(TM.snips.open, TM.snips.open + 0.45, t) - smoothstep(TM.snips.close, TM.cut, t));
    const ua = ease.inOutCubic(lift), ub = ease.inOutCubic(back);
    // out along an arc to the cord, then down to `rest` on the table after the cut
    const u = ua * (1 - ub);
    const pos = ub > 0 ? flight(SN.rest ?? SN.home, work, u, SN.arc) : flight(SN.home, work, u, SN.arc);
    return { pos, axis: ax, pivotAxis, cord: cdir, travel: u, retreat: ub, open: Math.max(0, openA), home: SN.home };
  };

  // ---- the two cut ends: recoil toward their anchors and swing down
  const cutHalves = (t) => {
    if (t < TM.cut) return null;
    const X = nodes(t), s = t - TM.cut;
    const rec = 1 - TW.recoil * (1 - Math.exp(-s / 0.06));
    const swing = smoothstep(0, 0.7, s);
    const half = (ai, frac, sign) => {
      const A = nodeAt(X, ai), len = cc.rest * frac * rec;
      const d0 = cdir.map((v) => v * sign);
      const dir = [d0[0] * (1 - swing), d0[1] * (1 - swing) - swing, d0[2] * (1 - swing)];
      const dl = Math.hypot(...dir) || 1;
      const wob = Math.exp(-s / 0.5) * Math.sin(s * 9) * 0.12 * swing;
      const E = [A[0] + (dir[0] / dl) * len + ax[0] * wob, A[1] + (dir[1] / dl) * len, A[2] + (dir[2] / dl) * len + ax[2] * wob];
      return { A, E, len };
    };
    return [half(cc.a, TW.cutAt, 1), half(cc.b, 1 - TW.cutAt, -1)];
  };

  // pitch: an ideal string's frequency goes as sqrt(tension) / length, scaled into a comfortable register
  const pitch = (T, L) => TW.sound.root * Math.sqrt(Math.max(T, 1e-6) / Tref) * (TW.sound.refLength / L);
  const lenAt = (X, k) => distX(X, model.cords[k].a, model.cords[k].b);

  const events = () => {
    const ev = [{ t: 0, kind: "bed", dur: TM.cut + 0.6, chord: TW.sound.bed.chord, root: TW.sound.bed.root }];
    ev.push({ t: TM.cut, kind: "bed", dur: end - TM.cut, chord: TW.sound.bed.chordAfter, root: TW.sound.bed.rootAfter, fade: true });
    order.forEach((k, r) => ev.push({ t: onAt[k], kind: "pluck", k, hz: pitch(T1[k], lenAt(P1, k)), x: mid[k][0] }));
    ev.push({ t: TM.place.lift, kind: "lift" }, { t: TM.place.land, kind: "land" });
    const strum = (X, T, cut0) => model.cords.map((c, k) => ({ k, hz: pitch(T[k], lenAt(X, k)), T: T[k] })).filter((v) => v.k !== cut0 && v.T > Tref * 0.12);
    ev.push({ t: TM.place.land + 0.08, kind: "strum", notes: uniq(strum(P2, T2, -1)) });
    ev.push({ t: TM.snips.lift, kind: "snipsMove" }, { t: TM.snips.open, kind: "snipsOpen" }, { t: TM.cut, kind: "snip" });
    for (const c of contacts) ev.push({ t: c.t, kind: "knock", x: c.p[0] });
    ev.push({ t: TM.slump.from + TM.slump.dur + 0.05, kind: "strum", notes: uniq(strum(P3, T3, cut)), detune: true });
    ev.push({ t: TM.retreat.from, kind: "snipsMove" });
    return ev.sort((a, b) => a.t - b.t);
  };
  // the strum plays each distinct pitch once (symmetry makes many cords share one), low to high
  const uniq = (list) => {
    const out = [];
    for (const v of list.sort((a, b) => a.hz - b.hz)) if (!out.length || Math.abs(1200 * Math.log2(v.hz / out[out.length - 1])) > 8) out.push(v.hz);
    return out;
  };

  /** contactAt(X, c) -> [x, y, z] midpoint of the closest points of contact pair c in pose X */
  const contactAt = (X, c) => strutPair(model, X, c.i, c.j).p;
  return {
    contactAt, model, n, P1, P2, P3, T1, T2, T3, Tref, cut, cutCord: cc, cutPoint, cutDir: cdir, contacts, path, pathAt, nodes, tension, glow,
    lit, onAt, order, flex, slumpU, weight, snips, cutHalves, topFrame, pitch, events, timing: TM, end, tower: TW,
    nodeAt: (X, i) => nodeAt(X, i),
  };
}

/** towerVoices(spec.tower.sound) -> voices for kit/schedule.scoreFromEvents */
export function towerVoices(S) {
  return {
    bed: (e) => [{ type: "pad", dur: e.dur, gain: S.bed.gain, root: e.root, chord: e.chord, brightness: S.bed.brightness, attack: e.fade ? 0.5 : 0.8, release: 1.0 }],
    pluck: (e) => [{ type: "pluck", hz: e.hz, gain: S.pluck.gain, dur: S.pluck.dur, decay: S.pluck.decay, bright: S.pluck.bright }],
    strum: (e) => {
      const root = e.notes[0];
      const notes = e.notes.map((h) => 12 * Math.log2(h / root));
      return [{ type: "pluck", hz: root, notes, step: S.strum.step, gain: S.strum.gain * (e.detune ? 0.9 : 1), dur: S.strum.dur, decay: e.detune ? S.strum.decay * 0.6 : S.strum.decay, bright: e.detune ? 0.35 : S.pluck.bright }];
    },
    lift: () => [{ type: "whoosh", dir: "in", dur: 0.7, gain: S.move.gain }],
    land: () => [{ type: "thud", gain: S.land.gain, dur: 0.35 }, { type: "clack", gain: S.land.gain * 0.55, pitch: 0.7 }],
    snipsMove: () => [{ type: "whoosh", dir: "out", dur: 0.5, gain: S.move.gain * 0.8 }],
    snipsOpen: () => [{ type: "click", gain: S.snip.gain * 0.5, pitch: 1.4 }],
    snip: () => [{ type: "clack", gain: S.snip.gain, pitch: 1.9 }, { type: "click", gain: S.snip.gain * 0.8, pitch: 2.2, offset: 0.01 }, { type: "pluck", hz: S.root * 2.4, gain: S.snip.gain * 0.6, dur: 0.5, decay: 0.12, bright: 0.9, offset: 0.005 }],
    knock: () => [{ type: "marimba", hz: S.knock.hz, gain: S.knock.gain, dur: 0.4, decay: 0.07, mallet: 0.9 }, { type: "clack", gain: S.knock.gain * 0.5, pitch: 0.55 }],
  };
}

/** panOf(radius) -> event -> stereo pan from the event's x */
export const panOf = (r) => (e) => (e.x === undefined ? 0 : clamp(e.x / (r * 1.5), -1, 1) * 0.6);
