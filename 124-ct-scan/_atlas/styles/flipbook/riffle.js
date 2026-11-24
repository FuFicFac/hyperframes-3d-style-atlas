// styles/flipbook/riffle.js — the flipbook planner for "Flipbook". PURE: no THREE, no window, no DOM (Node-safe), so
// scene.config.js imports it for SCORE + framing and style.js reads the very same plan for the picture.
//
// Two plans share one page index k (page k carries drawing k):
//  1. RELEASE PLAN — when the thumb lets go of each page. Pages 1..N-1 start bent back over the binding in a fan held by
//     the thumb; page 0 lies flat (the first drawing). Release times come from explicit slow times plus a piecewise-linear
//     rate curve [[t, pagesPerSecond]] integrated at 1 ms (a page leaves at each whole-number crossing). Each page then
//     falls (flip duration from the local rate), lands, gives one small bounce and settles. pageState(k, t) is a closed
//     form of t: { mode: "flat"|"held"|"air"|"buried", phi (hinge angle, rad, 0 = flat, pi/2 = upright), kappa (total
//     bend hinge -> free edge, rad), twist (corner lead, rad), lift }.
//  2. DRAWING PLAN — drawingFor(k) returns the pencil drawing on page k as polylines in page units (X 0..aspect left ->
//     right, Y 0..1 bottom -> top): construction lines, hatching, bold outlines, a page number. The character is an
//     original: a ball that bounces twice, sprouts wings at the top of the third hop, becomes a bird, loops round the
//     page and flies off the top right, dropping one feather that drifts down to the ground line. Line boil: every page
//     displaces every stroke by a smooth seeded wobble (seed = page), so no two pages trace the same line.
// events() turns the release plan into sound: a thumb tick per release, a paper slap per landing, a marimba note when a
// page carrying a bounce contact lands, a chime when the wings appear, and the pencil scratch of the opening.
import { clamp, lerp, smoothstep, rng, hash01 } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";

const PI = Math.PI, TAU = PI * 2;

// =============================================================================================== release plan
/**
 * createRiffle(o) -> plan
 *   o: { slow: [t...] (explicit release times), rate: [[t, pagesPerSec]...] (piecewise linear, 0 outside), stopAt,
 *        maxPages, flip: { slow, fast, rateSlow, rateFast }, bounce: { dur, phi, kappa }, held: { phi0, step, free },
 *        fall: { lag, twist, accel }, pool }
 */
export function createRiffle(o) {
  const rel = [...(o.slow ?? [])];
  const R = o.rate ?? [];
  if (R.length > 1) {
    const dt = 0.001, t0 = R[0][0], t1 = Math.min(R[R.length - 1][0], o.stopAt ?? Infinity);
    let acc = 0, seg = 0;
    for (let t = t0; t < t1; t += dt) {
      while (seg < R.length - 2 && t > R[seg + 1][0]) seg++;
      const a = R[seg], b = R[seg + 1];
      const r = lerp(a[1], b[1], clamp((t - a[0]) / (b[0] - a[0])));
      acc += r * dt;
      if (acc >= 1) { acc -= 1; rel.push(+t.toFixed(4)); }
    }
  }
  rel.sort((a, b) => a - b);
  const maxPages = o.maxPages ?? 400;
  const release = rel.slice(0, maxPages - 1);
  const N = release.length + 1; // page 0 never flips
  const F = { slow: 0.85, fast: 0.3, rateSlow: 1.5, rateFast: 12, ...(o.flip ?? {}) };
  const BO = { dur: 0.16, phi: 0.05, kappa: 0.16, ...(o.bounce ?? {}) };
  const HE = { phi0: 1.62, step: 0.0042, free: 2.62, ...(o.held ?? {}) };
  const FA = { lag: 0.55, twist: 0.22, accel: 0.62, ...(o.fall ?? {}) };
  const pages = [{ k: 0, release: -Infinity, flip: 0, land: -Infinity, settle: -Infinity }];
  for (let i = 0; i < release.length; i++) {
    const r = release[i];
    const gapPrev = i > 0 ? r - release[i - 1] : Infinity, gapNext = i + 1 < release.length ? release[i + 1] - r : Infinity;
    const localRate = 1 / Math.max(1e-3, Math.min(gapPrev, gapNext));
    const u = clamp((localRate - F.rateSlow) / (F.rateFast - F.rateSlow));
    const flip = lerp(F.slow, F.fast, Math.sqrt(u));
    pages.push({ k: i + 1, release: r, flip, land: r + flip, settle: r + flip + BO.dur, rate: localRate });
  }
  const releasedSmooth = (t) => { // continuous count of released pages (eased over 80 ms around each release)
    let c = 0;
    for (let k = 1; k < N; k++) { const r = pages[k].release; if (t >= r + 0.08) c++; else if (t > r - 0.0001) c += smoothstep(r, r + 0.08, t); else break; }
    return c;
  };
  const releasedCount = (t) => { let c = 0; for (let k = 1; k < N; k++) if (t >= pages[k].release) c++; else break; return c; };
  const settledTop = (t) => { let s = 0; for (let k = 1; k < N; k++) if (t >= pages[k].settle) s = k; return s; };

  /** pageState(k, t) -> { mode, phi, kappa, twist } (pure) */
  function pageState(k, t) {
    const p = pages[k];
    if (k === 0) return { mode: settledTop(t) > 0 ? "buried" : "flat", phi: 0, kappa: 0, twist: 0 };
    if (t < p.release) {
      // held in the fan: rank 0 = next to go. Hinge angle steps back per rank; free edges pinched near angle HE.free.
      const rank = Math.max(0, k - 1 - releasedSmooth(t));
      const phi = HE.phi0 + HE.step * rank;
      return { mode: "held", phi, kappa: HE.free - phi, twist: 0, rank };
    }
    if (t < p.land) {
      const u = (t - p.release) / p.flip;
      const e = FA.accel * u * u + (1 - FA.accel) * u; // starts slow, lands fast (gravity-ish)
      const phi0 = HE.phi0, k0 = HE.free - HE.phi0;
      const phi = phi0 * (1 - e);
      const kappa = k0 * Math.pow(1 - u, 3) + FA.lag * Math.sin(PI * u) * Math.sqrt(1 - u) * (0.7 + 0.3 * (p.flip / F.slow));
      const twist = FA.twist * Math.sin(PI * u);
      return { mode: "air", phi, kappa, twist, u };
    }
    if (t < p.settle) {
      const v = (t - p.land) / BO.dur, s = Math.sin(PI * v) * (1 - v * 0.4);
      return { mode: "air", phi: BO.phi * s, kappa: BO.kappa * Math.sin(PI * Math.min(1, v * 1.25)), twist: 0, u: 1 };
    }
    return { mode: settledTop(t) === k ? "flat" : "buried", phi: 0, kappa: 0, twist: 0 };
  }

  /** pages whose front (drawing) can be seen at t: the settled top page and every airborne page; contiguous range */
  function drawnRange(t) {
    const s = settledTop(t), r = releasedCount(t);
    return [s, Math.max(s, r)];
  }
  // pool check: every drawn range must fit the canvas pool (slot = k % pool)
  const pool = o.pool ?? 8;
  let maxDrawn = 0;
  for (let i = 0; i <= 3000; i++) { const [a, b] = drawnRange((i / 3000) * ((pages[N - 1]?.settle ?? 0) + 0.5)); maxDrawn = Math.max(maxDrawn, b - a + 1); }
  if (maxDrawn > pool) throw new Error(`riffle: ${maxDrawn} pages visible at once > pool ${pool}`);

  /** a short pulse at every release (the thumb flicks up a hair as each page slips out) */
  function thumbPulse(t) {
    let v = 0;
    for (let k = 1; k < N; k++) { const d = t - pages[k].release; if (d < -0.05) break; if (d < 0.25) v = Math.max(v, Math.exp(-((d - 0.03) ** 2) / 0.002)); }
    return v;
  }

  return { n: N, pages, release, pageState, settledTop, releasedCount, releasedSmooth, drawnRange, thumbPulse, maxDrawn, pool, held: HE };
}

/**
 * bendPage(state, opts) -> fills `out` (Float32Array 3 * (nx+1) * (ns+1)) with vertex positions of one bent page.
 *   Rows i = 0..ns go from the hinge (s = 0) to the free edge (s = D); columns j = 0..nx go x = -W/2 .. W/2.
 *   Angle along the page: theta(s, x) = phi + kappa * s/D + twist * (x/W) * s/D, clamped to [0, pi - .02] (never
 *   through the stack or the desk), integrated by the midpoint rule from the hinge at (y0, z0). Pure.
 */
export function bendPage(st, { W, D, nx, ns, y0, z0 }, out) {
  const ds = D / ns;
  for (let j = 0; j <= nx; j++) {
    const xr = j / nx - 0.5, x = xr * W;
    let y = y0, z = z0;
    for (let i = 0; i <= ns; i++) {
      const o3 = 3 * (i * (nx + 1) + j);
      out[o3] = x; out[o3 + 1] = y; out[o3 + 2] = z;
      if (i === ns) break;
      const sm = (i + 0.5) / ns;
      const th = clamp(st.phi + st.kappa * sm + st.twist * xr * sm, 0, PI - 0.02);
      y += Math.sin(th) * ds; z += Math.cos(th) * ds;
    }
  }
  return out;
}

// =============================================================================================== drawing plan
export const PAGE_ASPECT = 1.6;
const G = 0.2; // ground line height (page units)

// bounces: each hop k0 -> k1 from x0 to x1 with apex height h (above resting height)
const HOPS = [
  { k0: 0, k1: 16, x0: 0.34, x1: 0.72, h: 0.42 },
  { k0: 16, k1: 30, x0: 0.72, x1: 1.02, h: 0.32 },
  { k0: 30, k1: 44, x0: 1.02, x1: 1.3, h: 0.28 }, // never comes down: the wings take over at the apex
];
const R0 = 0.165; // ball radius
const WING = { grow0: 34, grow1: 42, morph0: 37, morph1: 46, flapPeriod: 5 };
// flight: Catmull-Rom through [k, x, y] (from the apex of the third hop to off the top-right corner)
const FLIGHT = [[37, 1.16, 0.64], [44, 1.04, 0.64], [52, 0.8, 0.62], [59, 0.56, 0.57], [65, 0.48, 0.52], [71, 0.7, 0.5], [77, 1.04, 0.6], [82, 1.2, 0.52], [87, 1.02, 0.42], [92, 0.84, 0.385]];
const PERCH = { k0: 87, k1: 92 }; // wings fold and legs come down as the bird lands on the ground line
const FEATHER = { k0: 53, len: 0.15 };
export const STORY = { HOPS, R0, WING, FLIGHT, FEATHER, G };

const crPoint = (P, k) => {
  if (k <= P[0][0]) return [P[0][1], P[0][2]];
  let i = 0;
  while (i < P.length - 2 && k > P[i + 1][0]) i++;
  const p1 = P[i], p2 = P[i + 1], p0 = P[Math.max(0, i - 1)], p3 = P[Math.min(P.length - 1, i + 2)];
  const u = clamp((k - p1[0]) / (p2[0] - p1[0]));
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
};

/** poseAt(k) -> the character on page k: { x, y, sx, sy, rot, wing (0..1), morph (0..1), flap (rad), face (+1 right / -1 left), contact, speed, alive } */
export function poseAt(k) {
  const hop = HOPS.find((h) => k >= h.k0 && k < h.k1) ?? HOPS[HOPS.length - 1];
  const wing = smoothstep(WING.grow0, WING.grow1, k), morph = smoothstep(WING.morph0, WING.morph1, k);
  let x, y, sx = 1, sy = 1, rot = 0, contact = false, speed = 0, face = 1;
  // ball on its hop
  const u = clamp((k - hop.k0) / (hop.k1 - hop.k0));
  const bx = lerp(hop.x0, hop.x1, u), by = G + R0 + 4 * hop.h * u * (1 - u);
  const vy = 4 * hop.h * (1 - 2 * u), vx = hop.x1 - hop.x0;
  if (k === 0) { sx = 1.1; sy = 0.9; contact = true; }
  else if (u === 0 && k > 0) { sx = 1.26; sy = 0.76; contact = true; }
  else {
    const st = 0.2 * Math.pow(Math.abs(1 - 2 * u), 2) * (1 - wing);
    sy = 1 + st; sx = 1 / sy; rot = Math.atan2(vy, vx) - PI / 2; speed = Math.abs(1 - 2 * u);
  }
  x = bx; y = contact ? G + R0 * sy : by;
  // flight takes over from the third apex
  const fly = smoothstep(WING.morph0, WING.morph0 + 4, k);
  if (k >= WING.morph0) {
    const [fx, fy] = crPoint(FLIGHT, k);
    const kk = Math.min(k, FLIGHT[FLIGHT.length - 1][0] - 0.6); // past the last point keep the final heading
    const [ax, ay] = crPoint(FLIGHT, kk + 0.5), [bx2, by2] = crPoint(FLIGHT, kk - 0.5);
    x = lerp(x, fx, fly); y = lerp(y, fy, fly);
    face = ax - bx2 >= 0 ? 1 : -1;
    rot = lerp(rot, Math.atan2(ay - by2, Math.abs(ax - bx2)) * 0.6, fly);
    sx = lerp(sx, 1, fly); sy = lerp(sy, 1, fly);
  }
  const perch = smoothstep(PERCH.k0, PERCH.k1, k);
  rot *= 1 - perch;
  const flap = k >= WING.grow0 ? Math.sin(((k - WING.grow0) / WING.flapPeriod) * TAU) * (1 - perch) : 0;
  return { x, y, sx, sy, rot, wing, morph, flap, face, contact, speed, perch, alive: x < 1.95 && y < 1.2 };
}

/** featherAt(k) -> { x, y, rot, on } — one feather shaken loose at FEATHER.k0, drifting down to the ground line */
function featherAt(k, last) {
  if (k < FEATHER.k0) return { on: false };
  const [x0, y0] = crPoint(FLIGHT, FEATHER.k0);
  const u = clamp((k - FEATHER.k0) / Math.max(1, last - 3 - FEATHER.k0));
  const fall = 1 - Math.pow(1 - u, 1.4);
  const y = lerp(y0 - 0.02, G + 0.02, fall);
  const x = x0 + 0.06 + 0.1 * Math.sin(u * PI * 3.2) * (1 - u) - 0.22 * u;
  const rot = 0.7 * Math.sin(u * PI * 3.2 + 0.6) * (1 - u) + (u > 0.97 ? 0 : 0) - 0.08;
  return { on: true, x, y, rot, rest: u >= 1 };
}

// ---- geometry helpers (page units) ----
const ellipse = (cx, cy, rx, ry, rot = 0, a0 = 0, a1 = TAU, n = 56) => {
  const pts = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, px = Math.cos(a) * rx, py = Math.sin(a) * ry;
    pts.push([cx + px * c - py * s, cy + px * s + py * c]);
  }
  return pts;
};
const xf = (pts, cx, cy, rot, fx = 1) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.map(([px, py]) => { const qx = px * fx; return [cx + qx * c - py * s, cy + qx * s + py * c]; });
};
const quad = (a, b, c, n = 14) => { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1]]); } return out; };

/** boil(points, seed, j, amp) -> wobbled copy: low-frequency seeded displacement along the stroke (line boil) */
function boil(pts, seed, j, amp) {
  const r = rng(seed * 977 + j * 131 + 7);
  const f1 = r.range(5, 9), f2 = r.range(11, 19), p1 = r.range(0, TAU), p2 = r.range(0, TAU), p3 = r.range(0, TAU), p4 = r.range(0, TAU);
  const ox = r.gaussian(0, amp * 0.6), oy = r.gaussian(0, amp * 0.6);
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    return [p[0] + ox + amp * (Math.sin(f1 * s + p1) * 0.7 + Math.sin(f2 * s + p2) * 0.3), p[1] + oy + amp * (Math.sin(f1 * s + p3) * 0.7 + Math.sin(f2 * s + p4) * 0.3)];
  });
}

/**
 * drawingFor(k, { last, boil, pencilStroke }) -> { strokes: [{ pts, w, a, kind }], smudges: [{ x, y, r, a }], number }
 *   kinds: "construct" (light, thin), "hatch" (mid), "line" (bold graphite), "number". w is in page units of height
 *   (multiply by canvas height px). The LAST "line" stroke of page 0 is the one the pencil finishes in the opening
 *   (`finishStroke` index in the result).
 */
export function drawingFor(k, o = {}) {
  const last = o.last ?? 90, amp = o.boil ?? 0.0032, seed = (o.seed ?? 69) + k * 17;
  const P = poseAt(k), F = featherAt(k, last);
  const S = [], push = (pts, w, a, kind) => S.push({ pts, w, a, kind });
  let bodyIndex = -1;
  const LW = o.lineW ?? 0.0095, CW = LW * 0.3, HW = LW * 0.36;
  const r = R0;
  // ground line (with a little overshoot) + a few grass ticks
  push([[0.08, G + 0.004], [0.55, G - 0.002], [1.05, G + 0.003], [1.52, G - 0.001]], LW * 0.8, 0.95, "line");
  for (const gx of [0.2, 0.26, 1.36, 1.43]) push([[gx, G], [gx + 0.012, G + 0.035]], LW * 0.5, 0.85, "line");
  // the bird/ball
  if (P.alive) {
    const rx = r * P.sx * lerp(1, 1.28, P.morph), ry = r * P.sy * lerp(1, 0.86, P.morph);
    // construction: a light circle a touch larger, its cross, and (while bouncing) the current hop's arc
    push(ellipse(P.x, P.y, rx * 1.12, ry * 1.12, P.rot, 0, TAU, 40), CW, 0.5, "construct");
    push([[P.x - rx * 1.3, P.y], [P.x + rx * 1.3, P.y]], CW, 0.45, "construct");
    push([[P.x, P.y - ry * 1.3], [P.x, P.y + ry * 1.3]], CW, 0.45, "construct");
    if (P.wing < 0.5) {
      const hop = HOPS.find((h) => k >= h.k0 && k < h.k1) ?? HOPS[0], arc = [];
      for (let i = 0; i <= 24; i++) { const u = i / 24; arc.push([lerp(hop.x0, hop.x1, u), G + R0 + 4 * hop.h * u * (1 - u)]); }
      push(arc, CW, 0.35, "construct");
    }
    // ground shadow: a hatched flat ellipse that shrinks as the ball rises
    const hgt = clamp((P.y - G - r) / 0.6);
    const shw = r * (1.15 - 0.7 * hgt);
    if (hgt < 0.95) {
      push(ellipse(P.x, G - 0.012, shw, 0.018, 0, 0, TAU, 28), HW, 0.5 * (1 - hgt), "hatch");
      for (let i = -3; i <= 3; i++) { const hx = P.x + (i / 3.5) * shw * 0.8; push([[hx - 0.012, G - 0.022], [hx + 0.012, G - 0.002]], HW, 0.55 * (1 - hgt), "hatch"); }
    }
    // body outline
    const body = ellipse(P.x, P.y, rx, ry, P.rot, 0.35, 0.35 + TAU + 0.12, 64);
    bodyIndex = S.length;
    push(body, LW, 1, "line");
    // highlight arc (upper left)
    push(ellipse(P.x, P.y, rx * 0.66, ry * 0.66, P.rot, 1.95, 2.75, 10), LW * 0.6, 0.9, "line");
    // shading: parallel diagonal hatching in the lower-right crescent (inside the body, outside an offset disc)
    {
      const c = Math.cos(P.rot), sn = Math.sin(P.rot);
      const inside = (qx, qy) => { const dx = qx - P.x, dy = qy - P.y, lx = dx * c + dy * sn, ly = -dx * sn + dy * c; return (lx / rx) ** 2 + (ly / ry) ** 2 < 0.86; };
      const lit = (qx, qy) => Math.hypot(qx - (P.x - rx * 0.32), qy - (P.y + ry * 0.32)) < Math.min(rx, ry) * 1.02;
      for (let i = -6; i <= 6; i++) {
        const d = i * Math.min(rx, ry) * 0.16, seg = [];
        for (let q = -1.2; q <= 1.2; q += 0.05) {
          const qx = P.x + q * rx * 0.7071 + d * 0.7071, qy = P.y + q * rx * 0.7071 - d * 0.7071;
          if (inside(qx, qy) && !lit(qx, qy)) seg.push([qx, qy]);
          else if (seg.length) break;
        }
        if (seg.length > 2) push(seg, HW, 0.8, "hatch");
      }
    }
    // motion lines behind a fast ball (opposite the direction of travel)
    if (P.speed > 0.55 && P.wing < 0.3 && !P.contact) {
      const dx = -Math.cos(P.rot + PI / 2), dy = -Math.sin(P.rot + PI / 2), nx = -dy, ny = dx;
      for (let i = -1; i <= 1; i++) {
        const oo = i * r * 0.5, len = r * (0.9 - Math.abs(i) * 0.3);
        const a0 = [P.x + dx * r * 1.3 + nx * oo, P.y + dy * r * 1.3 + ny * oo];
        push([a0, [a0[0] + dx * len, a0[1] + dy * len]], LW * 0.55, 0.85, "line");
      }
    }
    // dust puffs on a contact page
    if (P.contact && k > 0) for (const sgn of [-1, 1]) push(ellipse(P.x + sgn * r * 1.5, G + 0.04, 0.04, 0.03, 0, sgn > 0 ? -1.2 : 1.6, sgn > 0 ? 2.6 : 5.4, 14), LW * 0.6, 0.9, "line");
    // bird parts (local frame: +x = facing, +y = up; mirrored by face), scaled in by morph / wing
    const B = (pts) => xf(pts, P.x, P.y, P.rot, P.face);
    if (P.morph > 0.02) {
      const m = P.morph;
      // beak: an open-ish triangle at the front
      push(B([[rx * 0.9, ry * 0.26], [rx * (0.9 + 0.55 * m), ry * 0.08], [rx * 0.9, -ry * 0.1]]), LW * 0.85, m, "line");
      push(B([[rx * 0.92, ry * 0.08], [rx * (0.9 + 0.4 * m), ry * 0.08]]), LW * 0.5, m, "line");
      // eye: a filled dot (two tiny rings) + a brow tick
      const eye = B([[rx * 0.45, ry * 0.36]])[0];
      push(ellipse(eye[0], eye[1], 0.016 * m + 0.003, 0.02 * m + 0.003, 0, 0, TAU, 12), LW * 1.1, m, "line");
      // head tuft: two small curls
      for (const o2 of [0, 1]) push(B(quad([rx * (0.05 + 0.12 * o2), ry * 0.97], [rx * (0.0 + 0.12 * o2), ry * (1.25 + 0.1 * m)], [rx * (-0.18 + 0.12 * o2), ry * (1.2 + 0.15 * m)], 8)), LW * 0.6, m, "line");
      // tail: three closed feather loops fanning out behind
      for (let i = -1; i <= 1; i++) {
        const a2 = PI + 0.35 * i + 0.25, L2 = rx * (0.55 + 0.25 * m) * (1 - 0.12 * Math.abs(i));
        const r0 = [-rx * 0.86, ry * 0.05 + i * ry * 0.08], tip = [r0[0] + Math.cos(a2) * L2, r0[1] + Math.sin(a2) * L2];
        const nrm = [-Math.sin(a2) * L2 * 0.28, Math.cos(a2) * L2 * 0.28];
        const loop = [...quad(r0, [(r0[0] + tip[0]) / 2 + nrm[0], (r0[1] + tip[1]) / 2 + nrm[1]], tip, 8), ...quad(tip, [(r0[0] + tip[0]) / 2 - nrm[0], (r0[1] + tip[1]) / 2 - nrm[1]], r0, 8).slice(1)];
        push(B(loop), LW * 0.7, m, "line");
      }
    }
    if (P.perch > 0.02) for (const lx of [0.15, -0.2]) {
      const top = [rx * lx, -ry * 0.92], foot = [rx * lx + 0.004, -ry * 0.92 - 0.055 * P.perch];
      push(B([top, foot]), LW * 0.7, P.perch, "line");
      push(B([[foot[0] - 0.03, foot[1]], [foot[0] + 0.035, foot[1]]]), LW * 0.6, P.perch, "line");
    }
    if (P.wing > 0.02) {
      // wing angle sweeps from up-and-back (flap = +1) to back-and-down (flap = -1); leaf shape with a scalloped trailing edge
      const L = r * 2.05 * P.wing;
      for (const [sc, wv, al, off] of [[0.72, 0.6, 0.75, 0.18], [1, 0.95, 1, 0]]) { // far wing first, near wing on top
        const a = lerp(lerp(4.15, 1.5, (P.flap + 1) / 2), 3.45, P.perch) + off * (1 - P.perch), Lw = L * sc * lerp(1, 0.62, P.perch);
        const root = [-rx * 0.1 + off * rx * 0.4, ry * 0.42];
        const dir = [Math.cos(a), Math.sin(a)], nrm = [-dir[1], dir[0]];
        const tip = [root[0] + dir[0] * Lw, root[1] + dir[1] * Lw];
        const lead = quad(root, [root[0] + dir[0] * Lw * 0.45 + nrm[0] * Lw * 0.32, root[1] + dir[1] * Lw * 0.45 + nrm[1] * Lw * 0.32], tip, 14);
        const trail = [tip];
        for (let i = 1; i <= 3; i++) {
          const f = i / 3, q = [tip[0] + (root[0] - tip[0]) * f, tip[1] + (root[1] - tip[1]) * f], pa = trail[trail.length - 1];
          const bump = [(pa[0] + q[0]) / 2 - nrm[0] * Lw * 0.13, (pa[1] + q[1]) / 2 - nrm[1] * Lw * 0.13];
          trail.push(...quad(pa, bump, q, 6).slice(1));
        }
        push(B(lead), LW * wv, al, "line");
        push(B(trail), LW * wv * 0.9, al, "line");
        // two feather lines inside the near wing
        if (sc === 1) for (const f of [0.4, 0.68]) push(B([[root[0] + dir[0] * Lw * f * 0.6, root[1] + dir[1] * Lw * f * 0.6], [root[0] + dir[0] * Lw * f - nrm[0] * Lw * 0.06, root[1] + dir[1] * Lw * f - nrm[1] * Lw * 0.06]]), HW, 0.8, "hatch");
      }
    }
  }
  // feather
  if (F.on) {
    const L = FEATHER.len, spine = xf(quad([-L / 2, 0], [0, 0.02], [L / 2, 0.005], 12), F.x, F.y, F.rot);
    push(spine, LW * 0.7, 1, "line");
    const vane = [];
    for (const sgn of [1, -1]) vane.push(xf(quad([-L * 0.3, 0.004 * sgn], [0, sgn * 0.045 + 0.01], [L / 2, 0.005], 12), F.x, F.y, F.rot));
    for (const v of vane) push(v, LW * 0.55, 0.9, "line");
    for (let i = 0; i < 5; i++) { const a = -0.25 + i * 0.12; const p = xf([[L * a, 0.006], [L * (a + 0.06), 0.035]], F.x, F.y, F.rot); push(p, LW * 0.35, 0.8, "hatch"); }
  }
  // page number, bottom right, in single-stroke pencil numerals
  const num = layoutStrokeText(String(k + 1), 0.045, { align: "right", letterSpacing: 0.3 });
  for (const ch of num.chars) for (const st of ch.strokes) push(st.map((p) => [1.5 + p[0], 0.06 + p[1]]), LW * 0.42, 0.85, "number");
  // line boil: every stroke wobbles by its own page-seeded displacement (construction lines boil a little more)
  const strokes = S.map((s, j) => ({ ...s, pts: o.boil === 0 ? s.pts : boil(s.pts, seed, j, s.kind === "construct" ? amp * 1.5 : s.kind === "number" ? amp * 0.4 : amp) }));
  // smudges: graphite rubbed off by the hand, a soft one near the drawing and a thumb mark at the corner
  const rr = rng(seed + 3);
  const smudges = [
    { x: 1.45 + rr.range(-0.04, 0.04), y: 0.12 + rr.range(-0.03, 0.03), r: 0.09, a: 0.07 },
    { x: (P.alive ? P.x : 0.8) + rr.range(-0.12, 0.12), y: G - 0.03 + rr.range(-0.02, 0.02), r: 0.07, a: 0.06 },
  ];
  // index of the stroke the pencil finishes on page 0 (the body outline)
  const finishStroke = bodyIndex;
  return { strokes, smudges, finishStroke, pose: P };
}

// =============================================================================================== sound
/**
 * events(plan, { pencil: [{ t, dur }], last }) -> [{ kind, t, ... }]
 *   release (thumb tick), land (paper slap; slow pages also get a soft air whoosh), contact (marimba when a page that
 *   carries a bounce contact lands), wings (chime when the page where the wings appear lands), pencil (scratch).
 */
export function events(plan, o = {}) {
  const ev = [];
  for (const p of plan.pages) {
    if (p.k === 0) continue;
    ev.push({ kind: "release", t: p.release, k: p.k, slow: p.flip > 0.5 });
    ev.push({ kind: "land", t: p.land, k: p.k, slow: p.flip > 0.5, flip: p.flip });
    const P = poseAt(p.k);
    if (P.contact) ev.push({ kind: "contact", t: p.land, k: p.k, note: HOPS.findIndex((h) => h.k0 === p.k) });
    if (p.k === WING.grow0 + 2) ev.push({ kind: "wings", t: p.land, k: p.k });
  }
  for (const s of o.pencil ?? []) ev.push({ kind: "pencil", t: s.t, dur: s.dur });
  return ev.sort((a, b) => a.t - b.t);
}

/** voices for kit scoreFromEvents, from spec.sound */
export function riffleVoices(SND) {
  return {
    release: (e) => [{ type: "tick", gain: SND.tick.gain * (e.slow ? 1.2 : 1), pitch: SND.tick.pitch * (0.92 + 0.16 * hash01(e.k, 5)) }],
    land: (e) => {
      const out = [{ type: "paper", dur: e.slow ? 0.16 : 0.07, density: 0.6, pitch: SND.slap.pitch * (0.9 + 0.2 * hash01(e.k, 9)), gain: SND.slap.gain * (e.slow ? 1.3 : 1) }];
      if (e.slow) {
        out.push({ type: "whoosh", dir: "in", dur: Math.min(0.7, e.flip), q: 0.9, pitch: 1.6, gain: SND.air.gain, offset: -Math.min(0.7, e.flip) * 0.9 });
        out.push({ type: "thud", dur: 0.2, pitch: 2.2, gain: SND.slap.thud });
      }
      return out;
    },
    contact: (e) => [{ type: "marimba", hz: SND.contact.notes[Math.max(0, e.note) % SND.contact.notes.length], decay: 0.25, gain: SND.contact.gain }],
    wings: () => [{ type: "chime", dur: 1.6, pitch: 1.2, sparkle: true, notes: 5, gain: SND.wings.gain }],
    pencil: (e) => [{ type: "penScratch", dur: e.dur, speed: 1.1, pitch: 0.95, gain: SND.pencil.gain }],
  };
}
