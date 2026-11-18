// styles/murmuration/flock.js — the flock planner. Pure and Node-safe: no THREE, no window, no DOM.
// Imported by style.js (the picture) and by scene.config.js (the SCORE + framing gate), so the sound follows the
// exact same birds the camera sees.
//
// There is NO simulation. Bird i at time t is a closed form:
//   home_i(t) = P_0[i] + sum_k (P_{k+1}[i] - P_k[i]) * u_k,i(t) + bulge_k,i * sin(pi u_k,i)      (formation blend)
//   u_k,i(t)  = ease((t - t_k - delay_k,i) / dur_k)                                            (pour order)
//   p_i(t)    = body( home + A(t) * s_i * flow(home, t) + loop_i(t) + waves(home, t) )
// flow = per-axis 3D value noise (kit/noise.js), loop = a small personal circle, waves = travelling bands that
// compress positions toward their centre and set a per-bird "bank" (wings turned to the camera = darker).
// Heading = (p(t + dt) - p(t)) / dt of the same closed form — nothing is carried between frames.
import { clamp, lerp, smoothstep, rng, hash01, ease as EASE } from "../../kit/time.js";
import { noise3 } from "../../kit/noise.js";

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ formation shapes (signed distance, metres)
function catmull(pts, segs) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < segs; s++) {
      const u = s / segs, u2 = u * u, u3 = u2 * u;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * u + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * u3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** shapeSdf(form) -> { d(x,y,z), box: [min, max] } for kinds blob | ribbon | arrow | torus */
export function shapeSdf(f) {
  if (f.kind === "blob") {
    const [cx, cy, cz] = f.center, [a, b, c] = f.radii, m = Math.min(a, b, c), w = f.wobble ?? 0, sd = f.seed ?? 3;
    return {
      d: (x, y, z) => {
        const qx = (x - cx) / a, qy = (y - cy) / b, qz = (z - cz) / c;
        return (Math.hypot(qx, qy, qz) - 1) * m + (noise3(x * 0.22 + 7, y * 0.22, z * 0.22, sd) - 0.5) * 2 * w;
      },
      box: [[cx - a - w, cy - b - w, cz - c - w], [cx + a + w, cy + b + w, cz + c + w]],
    };
  }
  if (f.kind === "ribbon") {
    const line = catmull(f.path, f.segs ?? 16);
    const L = [0];
    for (let i = 1; i < line.length; i++) L.push(L[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1], line[i][2] - line[i - 1][2]));
    const total = L[L.length - 1];
    const R = Array.isArray(f.radius) ? f.radius : [f.radius, f.radius];
    const rAt = (s) => {   // piecewise-linear radius profile over arc length (R = [r0, r1, ...])
      const x = s * (R.length - 1), k = Math.min(R.length - 2, Math.floor(x));
      return lerp(R[k], R[k + 1], x - k);
    };
    const rMax = Math.max(...R);
    const mn = [0, 1, 2].map((a) => Math.min(...line.map((p) => p[a])) - rMax);
    const mx = [0, 1, 2].map((a) => Math.max(...line.map((p) => p[a])) + rMax);
    return {
      d: (x, y, z) => {
        let best = Infinity, bs = 0;
        for (let i = 0; i < line.length - 1; i++) {
          const A = line[i], B = line[i + 1];
          const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2];
          const ll = ex * ex + ey * ey + ez * ez || 1;
          const u = clamp(((x - A[0]) * ex + (y - A[1]) * ey + (z - A[2]) * ez) / ll);
          const dx = x - A[0] - ex * u, dy = y - A[1] - ey * u, dz = z - A[2] - ez * u;
          const dd = dx * dx + dy * dy + dz * dz;
          if (dd < best) { best = dd; bs = (L[i] + u * (L[i + 1] - L[i])) / total; }
        }
        return Math.sqrt(best) - rAt(bs);
      },
      box: [mn, mx],
    };
  }
  if (f.kind === "arrow") {
    // pointing +x in its own plane: shaft x in [-tail, neck], |y| < shaft; head = triangle base at neck (|y| < head), tip at x = tip
    const [cx, cy, cz] = f.center, rot = f.rot ?? 0, cr = Math.cos(rot), sr = Math.sin(rot);
    const { tail, neck, tip, shaft, head, depth } = f;
    const ex = tip - neck, len = Math.hypot(ex, head), nx = head / len, ny = ex / len;   // outward normal of the upper edge
    const d2 = (x, y) => {
      const ay = Math.abs(y);
      const dShaft = Math.max(-tail - x, x - neck - 0.4, ay - shaft);
      const dHead = Math.max(neck - x, (x - neck) * nx + (ay - head) * ny);
      return Math.min(dShaft, dHead);
    };
    const ext = Math.max(tail, tip) + 1;
    return {
      d: (x, y, z) => {
        const lx = x - cx, ly = y - cy;
        const u = lx * cr + ly * sr, v = -lx * sr + ly * cr;
        return Math.max(d2(u, v), Math.abs(z - cz) - depth);
      },
      box: [[cx - ext, cy - ext, cz - depth - 1], [cx + ext, cy + ext, cz + depth + 1]],
    };
  }
  if (f.kind === "torus") {
    const [cx, cy, cz] = f.center, R = f.R, r = f.r, yaw = f.yaw ?? 0, cyw = Math.cos(yaw), syw = Math.sin(yaw);
    return {
      d: (x, y, z) => {
        const lx = x - cx, ly = y - cy, lz = z - cz;
        const u = lx * cyw - lz * syw, w = lx * syw + lz * cyw;   // ring in its local xy plane, turned by yaw about y
        return Math.hypot(Math.hypot(u, ly) - R, w) - r;
      },
      box: [[cx - R - r, cy - R - r, cz - R - r], [cx + R + r, cy + R + r, cz + R + r]],
    };
  }
  throw new Error(`flock: unknown formation kind ${f.kind}`);
}

/**
 * sampleFormation(form, n, { seed, halo: { soft, prob }, columns }) -> { pts: Float32Array(3n), core: [min, max] }
 *   Seeded rejection sampling inside the shape (uniform volume density) plus a soft halo outside it, then a
 *   rank-grid ordering (columns by x, each column by y) so bird i lands in the same rough place in every formation.
 */
export function sampleFormation(form, n, o = {}) {
  const { d, box } = shapeSdf(form);
  const R = rng(`${o.seed ?? 1}:${form.id}`);
  const soft = form.soft ?? o.halo?.soft ?? 0.9, prob = form.halo ?? o.halo?.prob ?? 0.45;
  const lo = box[0].map((v) => v - soft * 2.5), hi = box[1].map((v) => v + soft * 2.5);
  const P = new Float32Array(n * 3);
  const core = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 4000) {
    const x = R.range(lo[0], hi[0]), y = R.range(lo[1], hi[1]), z = R.range(lo[2], hi[2]);
    const dv = d(x, y, z);
    const ok = dv <= 0 || (dv < soft * 2.5 && R.next() < prob * Math.exp(-((dv / soft) ** 2)));
    if (!ok) continue;
    P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
    if (dv <= 0) for (let a = 0; a < 3; a++) { const v = P[k * 3 + a]; if (v < core[0][a]) core[0][a] = v; if (v > core[1][a]) core[1][a] = v; }
    k++;
  }
  if (k < n) throw new Error(`flock: could not sample formation ${form.id}`);
  // rank grid: sort by x, cut into columns of equal count, sort each column by y
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => P[a * 3] - P[b * 3] || a - b);
  const C = o.columns ?? 72, per = Math.ceil(n / C);
  const out = new Float32Array(n * 3);
  let w = 0;
  for (let c = 0; c < C; c++) {
    const col = idx.slice(c * per, (c + 1) * per).sort((a, b) => P[a * 3 + 1] - P[b * 3 + 1] || a - b);
    for (const i of col) { out[w * 3] = P[i * 3]; out[w * 3 + 1] = P[i * 3 + 1]; out[w * 3 + 2] = P[i * 3 + 2]; w++; }
  }
  return { pts: out, core };
}

// ------------------------------------------------------------------ the plan
const keyed = (keys, t) => {   // smooth piecewise interpolation of [[t, v], ...]
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      return lerp(a, b, smoothstep(t0, t1, t));
    }
  }
  return keys[keys.length - 1][1];
};

/**
 * createFlock(spec.flock, spec.birds, plan) -> flock
 *   plan = { forms: [{ id, kind, ... }], moves: [{ to: formId, t, dur, spread, dir: [dx, dy], ease, bulge, bulgeMode }],
 *            waves: [{ id, t, dir: [dx, dy], speed, width, amp, heave, extent, center }],
 *            flow: [[t, amp], ...], body: { sway: [ax, ay, wx, wy], yaw: [[t, rad], ...], pivot: [x, y, z] } }
 *   moves are applied in order from forms[0]; move k goes from the previous formation to `to`.
 *   flock.positionsAt(t, pos, vel?, bank?) fills Float32Arrays (3n, 3n, n). flock.stats(t) / events() for sound.
 */
export function createFlock(F, B, plan) {
  const n = plan.count ?? B.count;
  const seed = F.seed ?? 1;
  const forms = plan.forms.map((f) => ({ ...f, ...sampleFormation(f, n, { seed, halo: F.halo, columns: F.columns }) }));
  const byId = Object.fromEntries(forms.map((f) => [f.id, f]));
  // per-bird constants
  const r = rng(`${seed}:birds`);
  const orbR = new Float32Array(n), orbW = new Float32Array(n), orbP = new Float32Array(n), orbA = new Float32Array(n * 6);
  const strag = new Float32Array(n), lag = new Float32Array(n), sgn = new Float32Array(n), bz = new Float32Array(n);
  const noff = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    orbR[i] = r.range(F.orbit[0], F.orbit[1]); orbW[i] = r.range(F.orbitW[0], F.orbitW[1]) * r.sign(); orbP[i] = r.range(0, TAU);
    // a random plane for the loop: two orthonormal vectors
    const a = r.range(0, TAU), b = Math.acos(r.range(-1, 1));
    const ux = Math.sin(b) * Math.cos(a), uy = Math.sin(b) * Math.sin(a), uz = Math.cos(b);
    let vx = -uy, vy = ux, vz = 0; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    const wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
    orbA.set([vx, vy, vz, wx, wy, wz], i * 6);
    const isStrag = r.next() < F.straggle.share;
    strag[i] = isStrag ? F.straggle.flow : r.range(0.75, 1.2);
    lag[i] = isStrag ? r.range(F.straggle.lag[0], F.straggle.lag[1]) : 0;
    sgn[i] = r.next() < 0.78 ? 1 : -1;
    bz[i] = r.range(-1, 1);
    noff[i * 3] = r.range(-0.6, 0.6); noff[i * 3 + 1] = r.range(-0.6, 0.6); noff[i * 3 + 2] = r.range(-0.6, 0.6);
  }
  // moves: source / target arrays + per-bird delays (birds furthest along `dir` in the source go first)
  let prev = forms[0];
  const moves = plan.moves.map((m, k) => {
    const to = byId[m.to];
    const src = prev.pts, dst = to.pts;
    const d = m.dir ?? [1, 0], dl = Math.hypot(d[0], d[1]) || 1, dx = d[0] / dl, dy = d[1] / dl;
    let pmin = Infinity, pmax = -Infinity;
    const proj = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = src[i * 3] * dx + src[i * 3 + 1] * dy; proj[i] = p; if (p < pmin) pmin = p; if (p > pmax) pmax = p; }
    const delay = new Float32Array(n);
    const jit = m.jitter ?? 0.12;
    for (let i = 0; i < n; i++) delay[i] = (m.spread ?? 0.8) * (pmax - proj[i]) / (pmax - pmin || 1) + jit * hash01(i, k, seed) + lag[i];
    // the centre of the source cloud (for radial bursts)
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += src[i * 3]; cy += src[i * 3 + 1]; cz += src[i * 3 + 2]; }
    const mv = { ...m, k, src, dst, delay, ease: EASE[m.ease ?? "inOutSine"] ?? EASE.inOutSine, c: [cx / n, cy / n, cz / n], from: prev.id };
    mv.first = m.t; mv.last = m.t + m.dur + Math.max(...delay);
    prev = to;
    return mv;
  });
  const waves = (plan.waves ?? []).map((w) => {
    const dl = Math.hypot(w.dir[0], w.dir[1]) || 1;
    const ext = w.extent ?? 30;
    const travel = (ext + 6 * w.width) / w.speed;
    return { ...w, dx: w.dir[0] / dl, dy: w.dir[1] / dl, s0: -ext / 2 - 3 * w.width, travel, cross: w.t + (ext / 2 + 3 * w.width) / w.speed, end: w.t + travel };
  });
  const body = plan.body ?? {};
  const sway = body.sway ?? [0, 0, 0, 0], pivot = body.pivot ?? [0, 0, 0];
  const flowKeys = plan.flow ?? [[0, 1]], yawKeys = body.yaw ?? [[0, 0]];
  const fq = F.flowFreq, fs = F.flowSpeed;

  /** one evaluation of every bird at t: pos (3n) and optional bank (n) */
  function evalAt(t, pos, bank, stride = 1) {
    const A = keyed(flowKeys, t), yaw = keyed(yawKeys, t), cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const sx = sway[0] * Math.sin(sway[2] * t), sy = sway[1] * Math.sin(sway[3] * t + 1.1);
    const act = waves.filter((w) => t > w.t - 0.01 && t < w.end + 0.01);
    const P0 = forms[0].pts, tz = t * fs;
    for (let i = 0; i < n; i += stride) {
      const j = i * 3;
      let x = P0[j], y = P0[j + 1], z = P0[j + 2];
      for (let q = 0; q < moves.length; q++) {
        const m = moves[q];
        const tt = t - m.t - m.delay[i];
        if (tt <= 0) continue;   // deltas add up, so overlapping moves stay continuous
        const u = m.ease(Math.min(1, tt / m.dur));
        const S = m.src, D = m.dst;
        const ex = D[j] - S[j], ey = D[j + 1] - S[j + 1], ez = D[j + 2] - S[j + 2];
        x += ex * u; y += ey * u; z += ez * u;
        if (u < 1 && m.bulge) {
          const b = Math.sin(Math.PI * u) * m.bulge;
          if (m.bulgeMode === "radial") {
            const rx = S[j] - m.c[0], ry = S[j + 1] - m.c[1], rz = S[j + 2] - m.c[2], rl = Math.hypot(rx, ry, rz) || 1;
            x += (rx / rl) * b; y += (ry / rl) * b; z += (rz / rl) * b * 0.6;
          } else {
            const el = Math.hypot(ex, ey) || 1;   // swirl: sideways to the travel, mostly one way round
            x += (-ey / el) * b * sgn[i]; y += (ex / el) * b * sgn[i]; z += bz[i] * b * 0.5;
          }
        }
      }
      // noise flow (per axis value noise at the home position, evolving in t)
      const a = A * strag[i];
      const nx = x * fq + noff[j], ny = y * fq + noff[j + 1], nz = z * fq + noff[j + 2];
      x += (noise3(nx, ny, nz + tz, seed + 11) - 0.5) * 2 * a;
      y += (noise3(nx + 31.7, ny, nz - tz, seed + 23) - 0.5) * 1.4 * a;
      z += (noise3(nx, ny + 17.3, nz + tz * 0.7, seed + 37) - 0.5) * 2 * a;
      // personal loop
      const ph = orbW[i] * t + orbP[i], c = Math.cos(ph) * orbR[i], s = Math.sin(ph) * orbR[i], o6 = i * 6;
      x += orbA[o6] * c + orbA[o6 + 3] * s; y += orbA[o6 + 1] * c + orbA[o6 + 4] * s; z += orbA[o6 + 2] * c + orbA[o6 + 5] * s;
      // density waves: compress toward the band centre + heave + bank
      let bk = 0;
      for (const w of act) {
        const sd = x * w.dx + y * w.dy - (w.center ?? 0) - (w.s0 + w.speed * (t - w.t));
        const g = Math.exp(-((sd / w.width) ** 2)) * smoothstep(w.t, w.t + 0.25, t) * (1 - smoothstep(w.end - 0.25, w.end, t));
        if (g < 1e-3) continue;
        const pull = -sd * g * w.amp;
        x += w.dx * pull - w.dy * g * (w.heave ?? 0); y += w.dy * pull + w.dx * g * (w.heave ?? 0);
        if (g > bk) bk = g;
      }
      // body: turn about the pivot, then sway
      const lx = x - pivot[0], lz = z - pivot[2];
      pos[j] = pivot[0] + lx * cyw + lz * syw + sx;
      pos[j + 1] = y + sy;
      pos[j + 2] = pivot[2] - lx * syw + lz * cyw;
      if (bank) bank[i] = bk;
    }
  }

  const tmp = new Float32Array(n * 3);
  const h = F.velDt ?? 1 / 60;
  /** positionsAt(t, pos, vel?, bank?) — vel = finite difference over h of the same closed form (m/s) */
  function positionsAt(t, pos, vel, bank, stride = 1) {
    evalAt(t, pos, bank, stride);
    if (!vel) return;
    evalAt(t + h, tmp, null, stride);
    for (let i = 0; i < n; i += stride) for (let a = 0; a < 3; a++) vel[i * 3 + a] = (tmp[i * 3 + a] - pos[i * 3 + a]) / h;
  }

  /** stats(t, stride) -> { speed: mean |v| (m/s), bank: mean bank (0..1), spread: rms distance from centroid } on every stride-th bird */
  function stats(t, stride = 12) {
    const p = new Float32Array(n * 3), v = new Float32Array(n * 3), b = new Float32Array(n);
    positionsAt(t, p, v, b, stride);
    let sp = 0, bk = 0, m = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i += stride) { sp += Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]); bk += b[i]; cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; m++; }
    cx /= m; cy /= m; cz /= m;
    let rr = 0;
    for (let i = 0; i < n; i += stride) rr += (p[i * 3] - cx) ** 2 + (p[i * 3 + 1] - cy) ** 2 + (p[i * 3 + 2] - cz) ** 2;
    return { speed: sp / m, bank: bk / m, spread: Math.sqrt(rr / m) };
  }

  /** formBox(id, pad) -> [min, max] of the formation's core (inside the shape), padded; for framing gates */
  function formBox(id, pad = 0) {
    const c = byId[id].core;
    return [c[0].map((v) => v - pad), c[1].map((v) => v + pad)];
  }

  /**
   * events(sound, { t0, t1, sampleDt }) -> [{ t, kind, ... }] for kit/schedule.scoreFromEvents:
   *   rush (level = flock speed, normalised to the clip's max), flutter (level = compression = mean bank + inverse spread),
   *   wave (one per density wave, at the moment it crosses the flock centre), burst (radial bursts), call (seeded).
   */
  function events(S, { t0 = 0, t1 = 15, sampleDt = 0.15 } = {}) {
    const samples = [];
    for (let t = t0; t <= t1 + 1e-9; t += sampleDt) samples.push({ t: +t.toFixed(4), ...stats(t, 24) });
    const at = (t) => {
      const k = Math.max(0, Math.min(samples.length - 2, Math.floor((t - t0) / sampleDt)));
      const a = samples[k], b = samples[k + 1], u = clamp((t - a.t) / (b.t - a.t));
      return { speed: lerp(a.speed, b.speed, u), bank: lerp(a.bank, b.bank, u), spread: lerp(a.spread, b.spread, u) };
    };
    const vmax = Math.max(...samples.map((s) => s.speed)), smin = Math.min(...samples.map((s) => s.spread)), smax = Math.max(...samples.map((s) => s.spread));
    const out = [];
    for (let t = t0; t < t1 - 0.3; t += S.rush.step) {
      const st = at(t + S.rush.dur * 0.6);
      out.push({ t: +t.toFixed(4), kind: "rush", level: clamp(st.speed / vmax), alt: out.length % 2 });
    }
    for (let t = t0 + 0.1; t < t1 - 0.3; t += S.flutter.step) {
      const st = at(t + S.flutter.dur * 0.5);
      const comp = clamp(0.6 * (1 - (st.spread - smin) / (smax - smin || 1)) + 2.5 * st.bank);
      out.push({ t: +t.toFixed(4), kind: "flutter", level: comp });
    }
    for (const w of waves) out.push({ t: +Math.max(0, w.cross - 0.7 * S.wave.dur).toFixed(4), kind: "wave", id: w.id, amp: w.amp });
    for (const m of moves) if (m.bulgeMode === "radial") out.push({ t: m.t, kind: "burst", id: m.to });
    const R = rng(`${seed}:calls`);
    for (let c = 0; c < S.calls.count; c++) {
      out.push({ t: +R.range(t0 + 0.8, t1 - 0.6).toFixed(3), kind: "call", gain: R.range(S.calls.gain[0], S.calls.gain[1]), pitch: R.range(S.calls.pitch[0], S.calls.pitch[1]), pan: R.range(-0.7, 0.7), shape: R.int(0, 2) });
    }
    return out.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));
  }

  return { n, forms, byId, moves, waves, positionsAt, stats, formBox, events, flowAt: (t) => keyed(flowKeys, t) };
}

/** flockVoices(sound) -> voices for kit/schedule.scoreFromEvents(flock.events(sound), voices) */
export function flockVoices(S) {
  const g = (r, x) => lerp(r[0], r[1], x);
  return {
    rush: (e) => [{ type: "whoosh", dur: S.rush.dur, dir: e.alt ? "out" : "in", q: S.rush.q, pitch: g(S.rush.pitch, (e.t * 0.37) % 1), gain: g(S.rush.gain, e.level), pan: Math.sin(e.t * 0.9) * 0.35 }],
    flutter: (e) => [{ type: "rustle", dur: S.flutter.dur, density: S.flutter.density, pitch: S.flutter.pitch, gain: g(S.flutter.gain, e.level), pan: Math.cos(e.t * 0.7) * 0.3 }],
    wave: (e) => [{ type: "whoosh", dur: S.wave.dur, dir: "in", q: 1.1, pitch: S.wave.pitch, gain: S.wave.gain * clamp(e.amp / 0.55, 0.5, 1) }],
    burst: () => [
      { type: "whoosh", dur: S.burst.dur, dir: "out", q: 0.8, pitch: S.burst.pitch, gain: S.burst.gain },
      { type: "rustle", dur: 1.2, density: 0.8, pitch: 1.1, gain: S.burst.gain * 0.35 },
    ],
    call: (e) => [{ type: "blip", dur: 0.035, pitch: e.pitch, notes: [[0, 4, -3], [7, 2], [0, -5, 3, 0]][e.shape], gain: e.gain, pan: e.pan }],
  };
}
