// styles/origami/folds.js — PURE rigid-facet fold engine + model library + fold timeline. No THREE, no window:
// imported by style.js (picture) AND by a scene's scene.config.js (Node), so the SCORE is derived from the same
// fold schedule the picture uses (one paper-fold sound per fold step). Everything is a pure function of inputs.
//
// Model frame: the unfolded sheet lies in the XZ plane (y = 0), FRONT face up (+y). "Flat" coordinates [x, z] are
// positions on the unfolded sheet; they never change, so they double as the sheet's UV space (pattern, fibre and
// crease lines stay glued to the paper through every fold).
//
// How a fold works (buildFolds): a step names a crease in the CURRENT folded state (axis line A->B in model
// space), the side that moves (a point P) and the direction it swings toward (N). At build time every facet the
// cutting plane crosses is split (through all layers, or only those passing `filter`), the moved facets rotate
// about the crease by the step's final angle, and the next step sees that folded state. The axis is stored in
// the frame of a stationary "anchor" facet next to the crease, so at runtime (pose) a later crease rides on the
// facets folded by earlier steps — steps nest. Layers never z-fight: a flat (~180°) fold pivots about a crease
// lifted so the flap lands one paper pitch above whatever stack it covers; an open fold pivots about the outer
// surface of the moving stack. A bend strip (swept crease edge) joins the two sides of every crease.

import { clamp, lerp, toEase, rng, hash01 } from "../../kit/time.js";

const EPS = 1e-6;
const D2R = Math.PI / 180;

// ------------------------------------------------------------------------------------------- vec / mat helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V3 = { sub, add, scl, dot, cross, len, norm };

/** Column-major 4x4 (same layout as THREE.Matrix4.elements). Rigid transforms only. */
export const M4 = {
  I: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  point: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
  dir: (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]],
  /** rotation by angle th about the line through P with unit direction u */
  rot(P, u, th) {
    const c = Math.cos(th), s = Math.sin(th), t = 1 - c, [x, y, z] = u;
    const R = [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
    const RP = M4.dir(R, P);
    R[12] = P[0] - RP[0]; R[13] = P[1] - RP[1]; R[14] = P[2] - RP[2];
    return R;
  },
  inv(m) { // rigid inverse: [R^T | -R^T t]
    const o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    const t = M4.dir(o, [m[12], m[13], m[14]]);
    o[12] = -t[0]; o[13] = -t[1]; o[14] = -t[2];
    return o;
  },
};

// ------------------------------------------------------------------------------------------- 2D polygon helpers
const centroid2 = (poly) => {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], w = p[0] * q[1] - q[0] * p[1];
    a += w; cx += (p[0] + q[0]) * w; cz += (p[1] + q[1]) * w;
  }
  if (Math.abs(a) < 1e-12) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return [cx / (3 * a), cz / (3 * a)];
};
const area2 = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
export const polyCentroid = centroid2;

/** Split a convex polygon by per-vertex signed distances d (computed in 3D). Returns [pos, neg] (flat coords). */
function splitPoly(poly, d) {
  const pos = [], neg = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, a = poly[i], b = poly[j], da = d[i], db = d[j];
    if (da >= -EPS) pos.push(a);
    if (da <= EPS) neg.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const s = da / (da - db), p = [lerp(a[0], b[0], s), lerp(a[1], b[1], s)];
      pos.push(p); neg.push(p);
    }
  }
  return [dedupe(pos), dedupe(neg)];
}
function dedupe(poly) {
  const out = [];
  for (const p of poly) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p); }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop();
  return out;
}
/** SAT overlap depth of two convex 2D polygons (> 0 = interiors overlap by that much). */
function overlap2(A, B) {
  let best = Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], n = [-(q[1] - p[1]), q[0] - p[0]], l = Math.hypot(n[0], n[1]);
    if (l < 1e-12) continue;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of A) { const s = (v[0] * n[0] + v[1] * n[1]) / l; a0 = Math.min(a0, s); a1 = Math.max(a1, s); }
    for (const v of B) { const s = (v[0] * n[0] + v[1] * n[1]) / l; b0 = Math.min(b0, s); b1 = Math.max(b1, s); }
    best = Math.min(best, Math.min(a1, b1) - Math.max(a0, b0));
  }
  return best;
}
/** distance of 2D point to the infinite line through p,q */
const lineDist = (v, p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; return Math.abs((v[0] - p[0]) * dz - (v[1] - p[1]) * dx) / l; };

// ------------------------------------------------------------------------------------------- sheets
export const square = (S = 1) => [[-S, -S], [S, -S], [S, S], [-S, S]];
export const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
export const diamond = (D = 1) => [[D, 0], [0, D], [-D, 0], [0, -D]];

// ------------------------------------------------------------------------------------------- build
/**
 * buildFolds(def, { thickness, pitch, seed, imperfect }) -> plan (plain data)
 *   def = { id, sheet: [[x,z]...] (convex, flat coords), steps: [Step] }
 *   Step (geometric, the default) = { id, axis: [A, B] (model space, current folded state), side: P (point on the
 *          moving side), toward: N (direction the flap swings to), angle (deg, magnitude), filter?: ([cx,cz]) => bool
 *          (only facets whose FLAT centroid passes are cut/moved: fold one wall of a stack), crease?: true (fold
 *          and unfold: leaves a crease line), exact?: true (no seeded imperfection), dur?, label? }
 *   Step (flat) = { id, line: [[x,z],[x,z]] (flat sheet coords), side: [x,z] (flat), kind: "valley"|"mountain",
 *          angle, ... } — single-layer creases (pleats, fans) placed on the sheet itself.
 *   Step (turn) = { id, all: true, axis: [A,B] | axisFrom: stepId, axisMid?: true (through the stack's mid-height),
 *          angle (deg, SIGNED, right-hand about A->B), hop?: m (lift during the turn) } — rigid move of everything.
 *   thickness: slab thickness of one paper layer; pitch: layer spacing (> thickness, the air gap between layers).
 *   imperfect: { flat: [lo, hi] deg short of 180 (paper springs back), open: deg ± on open folds }.
 */
export function buildFolds(def, o = {}) {
  const th = o.thickness ?? def.thickness ?? 0.003;
  const pitch = o.pitch ?? def.pitch ?? th * 1.45;
  const R = rng(o.seed ?? def.seed ?? 7);
  const imp = { flat: [0.03, 0.1], open: 1.4, ...(def.imperfect ?? {}), ...(o.imperfect ?? {}) };
  const mk = (poly, M = M4.I(), moves = [], lines = []) => ({ poly, M, moves, lines, children: null });
  let leaves = [mk(def.sheet.map((p) => [...p]))];
  const pts = (f) => f.poly.map(([x, z]) => M4.point(f.M, [x, 0, z]));
  const leafOf = (f) => (f.children ? leafOf(f.children[0]) : f);
  const descend = (f, out = []) => { if (f.children) f.children.forEach((c) => descend(c, out)); else out.push(f); return out; };
  const steps = [];
  const byId = {};

  def.steps.forEach((s, k) => {
    const id = s.id ?? `s${k}`;
    const st = { id, k, label: s.label ?? id, dur: s.dur ?? null, crease: !!s.crease, hop: s.hop ?? 0, mode: s.all ? "turn" : s.line ? "flat" : "geo" };
    byId[id] = st;
    // ---------------------------------------------------------------- rigid turn of everything
    if (s.all) {
      let A, B;
      if (s.axisFrom) {
        const r = byId[s.axisFrom];
        const Ma = r.anchor ? leafOf(r.anchor).M : M4.I();
        A = M4.point(Ma, r.Aloc); B = add(A, M4.dir(Ma, r.aloc));
      } else { A = s.axis[0]; B = s.axis[1]; }
      if (s.axisMid) {
        let lo = Infinity, hi = -Infinity;
        for (const f of leaves) for (const p of pts(f)) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
        const m = (lo + hi) / 2; A = [A[0], m, A[2]]; B = [B[0], m, B[2]];
      }
      const a = norm(sub(B, A));
      const thB = (s.angle ?? 0) * D2R;
      Object.assign(st, { kind: "turn", moved: leaves.slice(), anchor: null, Aloc: A, aloc: a, thBuild: thB, sign: Math.sign(thB) || 1, alpha: Math.abs(s.angle ?? 0), d: 0, x: (A[0] + B[0]) / 2, guide: null });
      if (!st.crease) { const Rm = M4.rot(A, a, thB); for (const f of leaves) { f.M = M4.mul(Rm, f.M); f.moves.push(k); } }
      else for (const f of leaves) f.moves.push(k);
      steps.push(st);
      return;
    }
    // ---------------------------------------------------------------- classify + cut
    const filter = s.filter ? (f) => s.filter(centroid2(f.poly)) : () => true;
    let distOf, A, a, nc, Nt;
    if (st.mode === "flat") {
      const [p, q] = s.line, sp = s.side;
      const sg = Math.sign((q[0] - p[0]) * (sp[1] - p[1]) - (q[1] - p[1]) * (sp[0] - p[0])) || 1;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      distOf = (f) => f.poly.map((v) => (sg * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]))) / l);
    } else {
      A = s.axis[0]; a = norm(sub(s.axis[1], A));
      const w = sub(s.side, A); nc = norm(sub(w, scl(a, dot(w, a))));
      Nt = norm(s.toward);
      distOf = (f) => pts(f).map((p) => dot(sub(p, A), nc));
    }
    const next = [], moved = [], stat = [], onPlane = new Map(); // facet -> on-plane flat vertices
    for (const f of leaves) {
      if (!filter(f)) { next.push(f); stat.push(f); continue; }
      const d = distOf(f);
      const pos = d.some((x) => x > EPS), neg = d.some((x) => x < -EPS);
      if (pos && neg) {
        const [pp, nn] = splitPoly(f.poly, d);
        if (Math.abs(area2(pp)) < 1e-10 || Math.abs(area2(nn)) < 1e-10) { (Math.abs(area2(pp)) > Math.abs(area2(nn)) ? moved : stat).push(f); next.push(f); continue; }
        const seg = pp.filter((v) => nn.some((u) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1e-9));
        const cp = mk(pp, f.M.slice(), f.moves.slice(), f.lines.slice()), cn = mk(nn, f.M.slice(), f.moves.slice(), f.lines.slice());
        if (seg.length >= 2) { const L = { k, p: seg[0], q: seg[1] }; cp.lines.push(L); cn.lines.push(L); onPlane.set(cp, seg); onPlane.set(cn, seg); }
        f.children = [cp, cn];
        next.push(cp, cn); moved.push(cp); stat.push(cn);
      } else {
        const on = f.poly.filter((v, i) => Math.abs(d[i]) <= EPS);
        if (on.length >= 2) { f.lines.push({ k, p: on[0], q: on[on.length - 1] }); onPlane.set(f, on); }
        (pos ? moved : stat).push(f);
        next.push(f);
      }
    }
    leaves = next;
    if (!moved.length) throw new Error(`origami/folds: step "${id}" moves nothing (check axis/side/filter)`);
    // ---------------------------------------------------------------- anchor: a stationary facet on the crease
    const onStat = stat.filter((f) => onPlane.has(f));
    const cand = onStat.filter(filter).length ? onStat.filter(filter) : onStat.length ? onStat : stat;
    let anchor = null, best = Infinity;
    const mid = A ? scl(add(s.axis[0], s.axis[1]), 0.5) : null;
    for (const f of cand) {
      let dd;
      if (st.mode === "flat") { const c = centroid2(onPlane.get(f) ?? f.poly); dd = Math.hypot(c[0] - (s.line[0][0] + s.line[1][0]) / 2, c[1] - (s.line[0][1] + s.line[1][1]) / 2); }
      else dd = Math.min(...pts(f).map((p) => len(sub(p, mid))));
      if (dd < best) { best = dd; anchor = f; }
    }
    // ---------------------------------------------------------------- axis, swing direction, layer lift
    if (st.mode === "flat") {
      if (!anchor) throw new Error(`origami/folds: flat step "${id}" needs a stationary facet on its line`);
      const Ma = anchor.M, [p, q] = s.line;
      A = M4.point(Ma, [p[0], 0, p[1]]);
      a = norm(sub(M4.point(Ma, [q[0], 0, q[1]]), A));
      const sp = s.side, l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const perp = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l], sgn = Math.sign(perp[0] * (sp[0] - p[0]) + perp[1] * (sp[1] - p[1])) || 1;
      nc = norm(M4.dir(Ma, [perp[0] * sgn, 0, perp[1] * sgn]));
      Nt = norm(M4.dir(Ma, [0, s.kind === "mountain" ? -1 : 1, 0]));
    }
    // effective swing normal: the moving layers' own normal, oriented toward N, perpendicular to the axis
    let Ne = [0, 0, 0];
    for (const f of moved) { let n = M4.dir(f.M, [0, 1, 0]); if (dot(n, Nt) < 0) n = scl(n, -1); Ne = add(Ne, n); }
    Ne = sub(Ne, scl(a, dot(Ne, a)));
    let N = len(Ne) > 0.3 * moved.length ? norm(Ne) : norm(sub(Nt, scl(a, dot(Nt, a))));
    const sign = dot(cross(a, nc), N) >= 0 ? 1 : -1;
    const hN = (p) => dot(sub(p, A), N);
    const movedPts = moved.flatMap(pts);
    const hinge = moved.flatMap((f) => (onPlane.get(f) ?? []).map(([x, z]) => M4.point(f.M, [x, 0, z])));
    const HmAll = Math.max(...movedPts.map(hN));
    const HmHinge = hinge.length ? Math.max(...hinge.map(hN)) : HmAll;
    const alpha = s.angle ?? 180;
    const flatFold = alpha >= 150;
    let dLift;
    if (flatFold) {
      // where does the flap land? reflect the moving facets across the crease (in the stack plane) and find the
      // highest stationary layer under that footprint
      const e2 = cross(N, a); // in-plane basis (a, e2)
      const proj = (p) => [dot(sub(p, A), a), dot(sub(p, A), e2)];
      const Rf = M4.rot(A, a, Math.PI);
      const land = moved.map((f) => pts(f).map((p) => proj(M4.point(Rf, p))));
      let Hs = -Infinity;
      for (const g of stat) {
        const gp = pts(g), g2 = gp.map(proj);
        if (Math.abs(area2(g2)) < 1e-9) continue;
        if (land.some((L) => Math.abs(area2(L)) > 1e-9 && overlap2(L, g2) > 1e-4)) Hs = Math.max(Hs, ...gp.map(hN));
      }
      dLift = Hs === -Infinity ? HmAll + th / 2 : Math.max((Hs + pitch + HmAll) / 2, HmHinge + th / 2);
    } else dLift = HmHinge + th / 2;
    let mag = alpha;
    if (!s.exact && !st.crease) mag = flatFold ? alpha - R.range(imp.flat[0], imp.flat[1]) : alpha + R.range(-imp.open, imp.open);
    const thB = sign * mag * D2R;
    const As = add(A, scl(N, dLift));
    // guide (where the crease will be drawn before the fold): the crease's extent along the axis, on the stack top
    const allOn = [...onPlane.entries()].flatMap(([f, vs]) => vs.map(([x, z]) => M4.point(f.M, [x, 0, z])));
    let t0 = Infinity, t1 = -Infinity, Hc = -Infinity;
    for (const p of allOn) { const tt = dot(sub(p, A), a); t0 = Math.min(t0, tt); t1 = Math.max(t1, tt); Hc = Math.max(Hc, hN(p)); }
    const lift = Hc + th / 2 + 0.0025;
    const g0 = add(add(A, scl(a, t0)), scl(N, lift)), g1 = add(add(A, scl(a, t1)), scl(N, lift));
    const Ma = anchor ? anchor.M : M4.I(), Mi = M4.inv(Ma);
    Object.assign(st, {
      kind: st.crease ? "crease" : st.mode === "flat" ? s.kind ?? "valley" : s.kind ?? (dot(N, [0, 1, 0]) > 0.5 ? "valley" : "fold"),
      moved, anchor, sign, alpha, d: dLift, thBuild: thB, flatFold,
      Aloc: M4.point(Mi, As), aloc: M4.dir(Mi, a), Nloc: M4.dir(Mi, N),
      guide: isFinite(t0) ? [M4.point(Mi, g0), M4.point(Mi, g1)] : null,
      x: isFinite(t0) ? (g0[0] + g1[0]) / 2 : As[0],
    });
    const Rm = M4.rot(As, a, thB);
    for (const f of moved) { if (!st.crease) f.M = M4.mul(Rm, f.M); f.moves.push(k); }
    steps.push(st);
  });

  // ---------------------------------------------------------------- finalise: leaf ids, step sets, strips
  leaves.forEach((f, i) => (f.id = i));
  const facets = leaves.map((f) => ({ id: f.id, poly: f.poly, moves: f.moves, centroid: centroid2(f.poly), lines: f.lines.map((l) => l.k) }));
  const outSteps = steps.map((st) => ({
    id: st.id, k: st.k, kind: st.kind, label: st.label, mode: st.mode, crease: st.crease, hop: st.hop, dur: st.dur,
    moved: [...new Set(st.moved.flatMap((f) => descend(f).map((l) => l.id)))].sort((x, y) => x - y),
    anchor: st.anchor ? leafOf(st.anchor).id : -1,
    Aloc: st.Aloc, aloc: st.aloc, Nloc: st.Nloc ?? null, sign: st.sign, alpha: st.alpha, thBuild: st.thBuild, d: st.d,
    flatFold: !!st.flatFold, guide: st.guide, x: st.x,
  }));
  // strips: an edge shared (in flat coords = physically continuous paper) by a facet moved by step k and one that
  // is not, where both carry step k's crease line through that edge
  const strips = [];
  const edges = (f) => f.poly.map((p, i) => [p, f.poly[(i + 1) % f.poly.length]]);
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const F = leaves[i], G = leaves[j];
    const ks = F.lines.filter((l) => G.lines.some((m) => m === l));
    if (!ks.length) continue;
    for (const L of ks) {
      const mf = F.moves.includes(L.k), mg = G.moves.includes(L.k);
      if (mf === mg) continue;
      const [f, g] = mf ? [F, G] : [G, F];
      for (const [p, q] of edges(f)) {
        if (lineDist(p, L.p, L.q) > 1e-7 || lineDist(q, L.p, L.q) > 1e-7) continue;
        for (const [u, v] of edges(g)) {
          if (lineDist(u, L.p, L.q) > 1e-7 || lineDist(v, L.p, L.q) > 1e-7) continue;
          // overlap of [p,q] and [u,v] along the line
          const dx = L.q[0] - L.p[0], dz = L.q[1] - L.p[1], ll = dx * dx + dz * dz;
          const par = (w) => ((w[0] - L.p[0]) * dx + (w[1] - L.p[1]) * dz) / ll;
          const a0 = Math.max(Math.min(par(p), par(q)), Math.min(par(u), par(v)));
          const a1 = Math.min(Math.max(par(p), par(q)), Math.max(par(u), par(v)));
          if (a1 - a0 < 1e-6) continue;
          const at = (s) => [L.p[0] + dx * s, L.p[1] + dz * s];
          strips.push({ step: L.k, f: f.id, g: g.id, edge: [at(a0), at(a1)] });
        }
      }
    }
  }
  const xs = def.sheet.map((p) => p[0]), zs = def.sheet.map((p) => p[1]);
  const bbox = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  bbox.w = bbox.maxX - bbox.minX; bbox.h = bbox.maxZ - bbox.minZ;
  return { id: def.id, sheet: def.sheet, bbox, thickness: th, pitch, facets, steps: outSteps, strips, creases: strips.map((s) => ({ step: s.step, a: s.edge[0], b: s.edge[1] })) };
}

// ------------------------------------------------------------------------------------------- runtime pose
/**
 * pose(plan, theta[], hop?[]) -> { M: [mat4 per facet], strip: [{ pre, A, a, th, post } | null] }
 *   theta[k]: current signed angle of step k (rad); hop[k]: lift (m, +y) of a turn step. Steps apply in order, each
 *   about its axis carried by its anchor facet's CURRENT transform (nesting). Pure; allocation per call is small.
 */
export function pose(plan, theta, hop = null) {
  const n = plan.facets.length;
  const M = new Array(n);
  for (let i = 0; i < n; i++) M[i] = M4.I();
  const strip = plan.strips.map(() => null);
  const byStep = plan.steps.map(() => []);
  plan.strips.forEach((s, i) => byStep[s.step].push(i));
  for (const st of plan.steps) {
    const th = theta[st.k] ?? 0, hp = hop ? hop[st.k] ?? 0 : 0;
    if (Math.abs(th) < 1e-7 && !hp) continue;
    const Ma = st.anchor >= 0 ? M[st.anchor] : null;
    const A = Ma ? M4.point(Ma, st.Aloc) : st.Aloc, a = Ma ? M4.dir(Ma, st.aloc) : st.aloc;
    const R = M4.rot(A, a, th);
    if (hp) R[13] += hp;
    for (const si of byStep[st.k]) { const s = plan.strips[si]; strip[si] = { pre: M[s.f].slice(), g0: M[s.g].slice(), A, a, th }; }
    for (const f of st.moved) M[f] = M4.mul(R, M[f]);
  }
  // strips follow their stationary partner after their own step
  plan.strips.forEach((s, i) => { const r = strip[i]; if (r) r.post = M4.mul(M[s.g], M4.inv(r.g0)); });
  return { M, strip };
}

/**
 * stripPoints(plan, posed, i, { K = 8, offset = 0 }) -> Float32Array (2 x (K+1) x 3): the crease edge of strip i
 * swept from 0 to its step's current angle (offset = distance along the facet's own normal, ±thickness/2 for
 * the two paper surfaces). Rows: endpoint 0 / endpoint 1; columns: sweep fraction 0..1. null when flat (θ≈0).
 */
export function stripPoints(plan, posed, i, { K = 8, offset = 0 } = {}) {
  const s = plan.strips[i], r = posed.strip[i];
  if (!r) return null;
  const out = new Float32Array(2 * (K + 1) * 3);
  const ends = s.edge.map(([x, z]) => M4.point(r.pre, [x, offset, z]));
  for (let j = 0; j <= K; j++) {
    const R = M4.mul(r.post, M4.rot(r.A, r.a, (r.th * j) / K));
    for (let e = 0; e < 2; e++) {
      const p = M4.point(R, ends[e]);
      out.set(p, (e * (K + 1) + j) * 3);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- timeline
/**
 * foldTimeline(plan, cues, { missing = "flat", defaultDur = .5 }) -> { at(t), events, cueOf(id) }
 *   cues: { [stepId]: { at, dur, ease, keys: [{ at, dur, to (deg, magnitude), ease }], flap: { from, period, amp (deg), ramp } } }
 *   at(t) -> { theta: Float64Array (signed rad), hop: Float64Array (m), prog: Float64Array (0..1 crease reveal) }
 *   events: one per cued step { t, kind: "fold"|"crease"|"turn", step, dur, x, angle, flat } (+ "refold" per key):
 *   SCORE = scoreFromEvents(events, voices) gives one paper-fold sound per fold, exactly on the picture.
 *   Flat (~180°) folds ease in-out and never overshoot (they would pass through the stack); open folds settle
 *   with a small overshoot like springy paper; crease steps fold to `alpha` and open again.
 */
export function foldTimeline(plan, cues = {}, o = {}) {
  const { missing = "flat", defaultDur = 0.5 } = o;
  const C = plan.steps.map((st) => {
    const c = cues[st.id];
    if (!c) return missing === "done" ? { at: -1e9, dur: 1e-3 } : null;
    return { dur: st.dur ?? defaultDur, ...c };
  });
  const settle = (u) => { // open folds: ease out with ~4 % overshoot, exactly 1 at u = 1
    if (u <= 0) return 0; if (u >= 1) return 1;
    const e = 1 - Math.pow(1 - u, 3);
    return e + 0.22 * Math.sin(Math.PI * u) * u * u * (1 - u);
  };
  function at(t) {
    const n = plan.steps.length, theta = new Float64Array(n), hop = new Float64Array(n), prog = new Float64Array(n);
    plan.steps.forEach((st, k) => {
      const c = C[k];
      if (!c) return;
      const u = clamp((t - c.at) / c.dur);
      let th;
      if (st.crease) {
        const hump = smooth(0, 0.42, u) * (1 - smooth(0.58, 1, u));
        th = st.sign * st.alpha * D2R * hump;
        prog[k] = smooth(0.1, 0.45, u);
      } else {
        const e = c.ease ? toEase(c.ease)(u) : st.flatFold || st.kind === "turn" ? toEase("inOutCubic")(u) : settle(u);
        th = st.thBuild * e;
        prog[k] = smooth(0.05, 0.7, u);
      }
      let prev = st.thBuild;
      for (const key of c.keys ?? []) {
        if (t < key.at) break;
        const v = toEase(key.ease ?? "inOutCubic")(clamp((t - key.at) / key.dur));
        const target = st.sign * key.to * D2R;
        th = lerp(prev, target, v);
        prev = target;
      }
      if (c.flap && t > c.flap.from) {
        const r = smooth(c.flap.from, c.flap.from + (c.flap.ramp ?? 0.4), t);
        th += st.sign * c.flap.amp * D2R * r * Math.sin((2 * Math.PI * (t - c.flap.from)) / c.flap.period);
      }
      theta[k] = th;
      if (st.hop) hop[k] = st.hop * Math.sin(Math.PI * u);
    });
    return { theta, hop, prog };
  }
  const events = [];
  plan.steps.forEach((st, k) => {
    const c = C[k];
    if (!c || c.at < -1e8) return;
    events.push({ t: c.at, kind: st.crease ? "crease" : st.kind === "turn" ? "turn" : "fold", step: st.id, dur: c.dur, x: st.x, angle: st.alpha, flat: st.flatFold, seed: k });
    for (const key of c.keys ?? []) events.push({ t: key.at, kind: "refold", step: st.id, dur: key.dur, x: st.x, angle: key.to, seed: 50 + k });
  });
  events.sort((a, b) => a.t - b.t);
  return { at, events, cueOf: (id) => C[plan.steps.findIndex((s) => s.id === id)] ?? null };
}
const smooth = (e0, e1, x) => { const u = clamp((x - e0) / (e1 - e0)); return u * u * (3 - 2 * u); };

/** sequence(ids, { start, gap = .1, dur = .5, pair = [] }) -> cues: steps one after another; ids listed in `pair` start
 * `pairLag` after the previous one (symmetric left/right folds). */
export function sequence(ids, { start = 0, gap = 0.1, dur = 0.5, pairs = [], pairLag = 0.18 } = {}) {
  const cues = {};
  let t = start;
  ids.forEach((id, i) => {
    const d = typeof dur === "object" ? dur[id] ?? dur.default ?? 0.5 : dur;
    if (i > 0 && pairs.includes(id)) { const p = cues[ids[i - 1]]; cues[id] = { at: p.at + pairLag, dur: d }; t = Math.max(t, p.at + pairLag + d + gap); return; }
    cues[id] = { at: t, dur: d };
    t += d + gap;
  });
  return cues;
}

// ------------------------------------------------------------------------------------------- model library
// Every model is a single sheet folded by rigid steps that are geometrically honest (no stretching, no layer passes
// through another). Coordinates assume the flat sheet centred at the origin, front up, before any fold.
const T225 = Math.tan(Math.PI / 8); // 0.4142: the dart's second edge-to-centre fold

export const MODELS = {
  /** a plain sheet (no folds) */
  sheet: ({ size = 1 } = {}) => ({ id: "sheet", sheet: square(size), steps: [] }),

  /** fold in half along x (z<0 half over the z>0 half); angle 180 = folded card, <180 = a standing greeting card */
  card: ({ size = 1, angle = 180 } = {}) => ({
    id: "card", sheet: square(size),
    steps: [{ id: "half", axis: [[-2 * size, 0, 0], [2 * size, 0, 0]], side: [0, 0, -1], toward: [0, 1, 0], angle, label: "fold in half" }],
  }),

  /** blintz: all four corners to the centre (a smaller square, four flaps meeting in the middle) */
  blintz: ({ size: S = 1 } = {}) => ({ id: "blintz", sheet: square(S), steps: blintzSteps(S, "") }),

  /** fortune-teller base: blintz, turn over (with a hop), blintz again (16 layers in the middle, all flat) */
  fortune: ({ size: S = 1 } = {}) => ({
    id: "fortune", sheet: square(S),
    steps: [
      ...blintzSteps(S, "a"),
      { id: "turn", all: true, axis: [[-2 * S, 0, 0], [2 * S, 0, 0]], axisMid: true, angle: 180, hop: S * 0.55, label: "turn over" },
      ...[[1, 0], [0, 1], [-1, 0], [0, -1]].map(([cx, cz], i) => ({
        id: `b${i}`, label: "corner to centre",
        axis: cx ? [[cx * S / 2, 0, -S], [cx * S / 2, 0, S]] : [[-S, 0, cz * S / 2], [S, 0, cz * S / 2]],
        side: [cx * S, 0, cz * S], toward: [0, 1, 0], angle: 180,
      })),
    ],
  }),

  /** accordion / fan: `pleats` parallel creases across a w x h strip, alternating valley/mountain, each `angle` deg */
  accordion: ({ w = 2, h = 1, pleats = 6, angle = 150 } = {}) => ({
    id: "accordion", sheet: rect(w, h),
    steps: Array.from({ length: pleats - 1 }, (_, i) => {
      const x = -w / 2 + ((i + 1) * w) / pleats;
      return { id: `p${i}`, line: [[x, -h], [x, h]], side: [x + 1, 0], kind: i % 2 ? "mountain" : "valley", angle, label: i % 2 ? "mountain fold" : "valley fold" };
    }),
  }),

  /**
   * dart: the classic paper plane from a square (nose +x). crease, corners to centre, edges to centre (22.5°),
   * fold in half (flaps inside), stand on the keel, wings down. `tune: true` appends fine-tune folds: winglets up.
   *   keel = wing-root height above the keel (fraction of S), dihedral = deg the wings sit above level,
   *   winglet = lateral distance of the winglet crease from the keel (fraction of S).
   */
  dart: ({ size: S = 1, keel = 0.3, dihedral = 6, tune = false, winglet = 0.33, crease = true, flip = true } = {}) => {
    const h = keel * S, w = winglet * S, X = 2.4 * S;
    // flip: start colour-up, turn the sheet over first (as real folders do) so the finished dart is colour-out.
    // The turn mirrors model z, so the half that ends up as the upper wall is flat z > 0.
    const upper = flip ? ([, z]) => z > 0 : ([, z]) => z < 0, lower = flip ? ([, z]) => z < 0 : ([, z]) => z > 0;
    const steps = [];
    if (flip) steps.push({ id: "turn", all: true, axis: [[-X, 0, 0], [X, 0, 0]], axisMid: true, angle: 180, hop: S * 0.5, dur: 0.6, label: "turn over" });
    if (crease) steps.push({ id: "crease", axis: [[-X, 0, 0], [X, 0, 0]], side: [0, 0, -1], toward: [0, 1, 0], angle: 178, crease: true, dur: 0.7, label: "crease the centre" });
    steps.push(
      { id: "cornerL", axis: [[S, 0, 0], [0, 0, S]], side: [S, 0, S], toward: [0, 1, 0], angle: 180, label: "corner to centre" },
      { id: "cornerR", axis: [[S, 0, 0], [0, 0, -S]], side: [S, 0, -S], toward: [0, 1, 0], angle: 180, label: "corner to centre" },
      { id: "edgeL", axis: [[S, 0, 0], [-S, 0, 2 * T225 * S]], side: [-S, 0, S], toward: [0, 1, 0], angle: 180, label: "edge to centre" },
      { id: "edgeR", axis: [[S, 0, 0], [-S, 0, -2 * T225 * S]], side: [-S, 0, -S], toward: [0, 1, 0], angle: 180, label: "edge to centre" },
      { id: "half", axis: [[-X, 0, 0], [X, 0, 0]], side: [0, 0, -1], toward: [0, 1, 0], angle: 180, label: "fold in half" },
      { id: "stand", all: true, axisFrom: "half", angle: -90, label: "stand on the keel" },
      { id: "wingL", axis: [[-X, h, 0], [X, h, 0]], side: [0, h + 1, 0], toward: [0, 0, -1], angle: 90 - dihedral, filter: upper, label: "wing down" },
      { id: "wingR", axis: [[-X, h, 0], [X, h, 0]], side: [0, h + 1, 0], toward: [0, 0, 1], angle: 90 - dihedral, filter: lower, label: "wing down" },
    );
    if (tune) {
      const lift = h + w * Math.sin(dihedral * D2R);
      steps.push(
        { id: "tipL", axis: [[-X, lift, -w], [X, lift, -w]], side: [0, lift, -w - 1], toward: [0, 1, 0], angle: 92, filter: upper, label: "winglet up" },
        { id: "tipR", axis: [[-X, lift, w], [X, lift, w]], side: [0, lift, w + 1], toward: [0, 1, 0], angle: 92, filter: lower, label: "winglet up" },
      );
    }
    return { id: tune ? "dart-tuned" : "dart", sheet: square(S), steps };
  },

  /**
   * glider: delta-wing "bird" from a square held as a diamond (nose +z after standing; yaw the root to point it).
   * diagonal fold, fold in half, stand on the keel, wings down. Re-angle the wing steps (cue `flap`) to flap.
   */
  glider: ({ size: S = 1, keel = 0.28, dihedral = 8 } = {}) => {
    const D = S * Math.SQRT2, h = keel * D, X = 2.5 * D;
    return {
      id: "glider", sheet: diamond(D),
      steps: [
        { id: "diagonal", axis: [[-X, 0, 0], [X, 0, 0]], side: [0, 0, -1], toward: [0, 1, 0], angle: 180, label: "fold the diagonal" },
        { id: "half", axis: [[0, 0, -X], [0, 0, X]], side: [-1, 0, D / 2], toward: [0, 1, 0], angle: 180, label: "fold in half" },
        { id: "stand", all: true, axisFrom: "half", angle: 90, label: "stand on the keel" },
        { id: "wingL", axis: [[0, h, -X], [0, h, X]], side: [0, h + 1, 0], toward: [-1, 0, 0], angle: 90 - dihedral, filter: ([x]) => x < 0, label: "wing down" },
        { id: "wingR", axis: [[0, h, -X], [0, h, X]], side: [0, h + 1, 0], toward: [1, 0, 0], angle: 90 - dihedral, filter: ([x]) => x > 0, label: "wing down" },
      ],
    };
  },

  /**
   * swan: the traditional kite-base swan, done with honest rigid folds only. Diamond sheet, tail at flat +z, neck from
   * the flat -z point. kite (edges to centre), turn over, narrow the kite again, fold in half (spine = belly), fold
   * the neck up and the head forward (both are flat folds through the whole stack: same silhouette as the inside
   * reverse folds a folder would use), raise the tail, stand on the belly. Finished: a standing swan, beak toward -z,
   * back toward +y. size = half the sheet's side (the sheet is 2·size square).
   *   neckAt (fraction of the half-diagonal, flat z of the neck crease on the spine), neckLean (deg the neck leans
   *   forward of vertical), headLen (fraction), headDrop (deg the beak points below level), tail (deg the tail lifts; 0 = off).
   */
  swan: ({ size: S = 1, neckAt = -0.08, neckLean = 12, headLen = 0.2, headDrop = 16, tail = 36, tailAt = 0.56 } = {}) => {
    const D = S * Math.SQRT2, X = 2.6 * D;
    const k1 = Math.tan(22.5 * D2R), k2 = Math.tan(11.25 * D2R);
    // where a crease from the neck point at angle a (from the spine) meets the diamond's upper edge |x| = D - z
    const hitTop = (k) => { const z = D * (1 - k) / (1 + k); return [k * (z + D), z]; };
    const [x1, z1] = hitTop(k1), [x2, z2] = hitTop(k2);
    // after "half" the stack lies on x >= 0 (spine x = 0, back edge x = k2 (z + D) along the neck)
    const zs = neckAt * D;
    const up = [Math.cos(neckLean * D2R), -Math.sin(neckLean * D2R)];            // neck direction after the fold (x, z)
    const bis = norm([up[0] + 0, 0, up[1] - 1]);                                   // bisector of (0,-1) and up
    const nk = [bis[0], bis[2]];
    const sN = (k2 * (zs + D)) / (nk[0] - k2 * nk[1]);                             // crease meets the back edge
    const neckB = [nk[0] * sN, zs + nk[1] * sN];
    // the tip after the neck fold (reflect (0,-D) across the neck crease)
    const v = [0, -D - zs], pr = v[0] * nk[0] + v[1] * nk[1];
    const tip = [2 * pr * nk[0] - v[0], zs + 2 * pr * nk[1] - v[1]];
    const hl = headLen * D, C = [tip[0] - up[0] * hl, tip[1] - up[1] * hl];
    const hd = [-Math.sin(headDrop * D2R), -Math.cos(headDrop * D2R)];             // beak direction (x, z)
    const hb = norm([up[0] + hd[0], 0, up[1] + hd[1]]);
    // tail: fold the +z point up across a crease through (0, tailAt·D) leaning back
    const zt = tailAt * D, tb = [Math.sin((tail / 2) * D2R), 0, Math.cos((tail / 2) * D2R)];
    const steps = [
      { id: "kiteL", axis: [[0, 0, -D], [-x1, 0, z1]], side: [-D, 0, 0], toward: [0, 1, 0], angle: 180, label: "edge to centre" },
      { id: "kiteR", axis: [[0, 0, -D], [x1, 0, z1]], side: [D, 0, 0], toward: [0, 1, 0], angle: 180, label: "edge to centre" },
      { id: "turn", all: true, axis: [[0, 0, -X], [0, 0, X]], axisMid: true, angle: 180, hop: S * 0.45, dur: 0.6, label: "turn over" },
      { id: "narrowL", axis: [[0, 0, -D], [-x2, 0, z2]], side: [-D, 0, 0], toward: [0, 1, 0], angle: 180, label: "edges to centre again" },
      { id: "narrowR", axis: [[0, 0, -D], [x2, 0, z2]], side: [D, 0, 0], toward: [0, 1, 0], angle: 180, label: "edges to centre again" },
      { id: "half", axis: [[0, 0, -X], [0, 0, X]], side: [-1, 0, 0], toward: [0, 1, 0], angle: 180, label: "fold in half" },
      { id: "neck", axis: [[0, 0, zs], [neckB[0], 0, neckB[1]]], side: [0, 0, -D], toward: [0, 1, 0], angle: 180, label: "neck up" },
      { id: "head", axis: [[C[0], 0, C[1]], [C[0] + hb[0], 0, C[1] + hb[2]]], side: [tip[0], 0, tip[1]], toward: [0, 1, 0], angle: 180, filter: ([, z]) => z < -0.2 * D, label: "head" },
    ];
    if (tail) steps.push({ id: "tail", axis: [[0, 0, zt], [tb[0], 0, zt + tb[2]]], side: [0, 0, D], toward: [0, 1, 0], angle: 180, filter: ([, z]) => z > 0.3 * D, label: "tail up" });
    // explicit spine axis: the "half" anchor facet is later moved by the neck fold, so axisFrom would ride on the neck
    steps.push({ id: "stand", all: true, axis: [[0, 0, -X], [0, 0, X]], angle: 90, label: "stand it up" });
    return { id: "swan", sheet: diamond(D), steps };
  },

  /**
   * heart: the classic one-sheet heart, all flat folds. Diamond sheet, heart top toward flat -z (away from a camera
   * on +z). top corner to centre, bottom corner to the top edge, both sides up along the centre, turn over, blunt the
   * lobe tops and side points, turn back: a clean colour heart. Start colour-down (front = the paper's white side).
   */
  heart: ({ size: S = 1, top = 0.665, side = 0.52, hop = 0.42 } = {}) => {
    const D = S * Math.SQRT2, X = 2.6 * D, Z = (zt) => -zt * D; // heart-up zt -> model z
    const steps = [
      { id: "top", axis: [[-X, 0, Z(0.5)], [X, 0, Z(0.5)]], side: [0, 0, Z(1)], toward: [0, 1, 0], angle: 180, label: "top corner to centre" },
      { id: "bottom", axis: [[-X, 0, Z(-0.25)], [X, 0, Z(-0.25)]], side: [0, 0, Z(-1)], toward: [0, 1, 0], angle: 180, label: "bottom to the top edge" },
      { id: "sideR", axis: [[0, 0, Z(-0.25)], [D, 0, Z(0.75)]], side: [0.9 * D, 0, Z(-0.1)], toward: [0, 1, 0], angle: 180, label: "sides up" },
      { id: "sideL", axis: [[0, 0, Z(-0.25)], [-D, 0, Z(0.75)]], side: [-0.9 * D, 0, Z(-0.1)], toward: [0, 1, 0], angle: 180, label: "sides up" },
      { id: "turn", all: true, axis: [[0, 0, -X], [0, 0, X]], axisMid: true, angle: 180, hop: S * hop, dur: 0.6, label: "turn over" },
      { id: "tops", axis: [[-X, 0, Z(top)], [X, 0, Z(top)]], side: [0, 0, Z(1)], toward: [0, 1, 0], angle: 180, label: "blunt the tops" },
      { id: "pointR", axis: [[side * D, 0, -X], [side * D, 0, X]], side: [D, 0, Z(0.375)], toward: [0, 1, 0], angle: 180, label: "blunt the sides" },
      { id: "pointL", axis: [[-side * D, 0, -X], [-side * D, 0, X]], side: [-D, 0, Z(0.375)], toward: [0, 1, 0], angle: 180, label: "blunt the sides" },
      { id: "reveal", all: true, axis: [[0, 0, -X], [0, 0, X]], axisMid: true, angle: -180, hop: S * hop, dur: 0.6, label: "turn over" },
    ];
    return { id: "heart", sheet: diamond(D), steps };
  },
};
function blintzSteps(S, p) {
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => ({
    id: `${p}c${i}`, label: "corner to centre",
    axis: [[sx * S, 0, 0], [0, 0, sz * S]], side: [sx * S, 0, sz * S], toward: [0, 1, 0], angle: 180,
  }));
}
export const MODEL_NAMES = Object.keys(MODELS);

/** model(name, opts) -> def (shorthand) */
export const model = (name, opts = {}) => {
  if (!MODELS[name]) throw new Error(`origami: unknown model "${name}" (have ${MODEL_NAMES.join(", ")})`);
  return MODELS[name](opts);
};

/**
 * checkLayers(plan, theta, { samples }) -> { minGap, worst } — verification helper: for every pair of facets that are
 * (nearly) parallel and overlap in projection, the smallest separation of their planes (< thickness = touching /
 * interpenetrating). Use it on the final pose of a new model.
 */
export function checkLayers(plan, theta) {
  const P = pose(plan, theta);
  const F = plan.facets.map((f, i) => {
    const pts3 = f.poly.map(([x, z]) => M4.point(P.M[i], [x, 0, z]));
    return { i, pts3, n: M4.dir(P.M[i], [0, 1, 0]) };
  });
  let minGap = Infinity, worst = null;
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const a = F[i], b = F[j];
    if (Math.abs(dot(a.n, b.n)) < 0.995) continue;
    const n = a.n, e1 = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), e2 = cross(n, e1);
    const pr = (p) => [dot(p, e1), dot(p, e2)];
    if (overlap2(a.pts3.map(pr), b.pts3.map(pr)) < 1e-3) continue;
    const gap = Math.abs(dot(sub(b.pts3[0], a.pts3[0]), n));
    if (gap < minGap) { minGap = gap; worst = [i, j]; }
  }
  return { minGap, worst };
}
export { hash01 };
