// sdf.js — pure SDF-primitive scene description for raymarched liquid/morphing surfaces (THREE-free, Node-safe):
// rounded boxes/spheres/capsules with smooth-union radius k, slot fitting, morphs between shape sets, wobbling
// blobs, orbiters, split/merge and droplet plans. Promoted from the liquid-chrome pilot (identical code); the
// raymarching shader stays in that style (styles/liquid-chrome/style.js) — copy it as the reference renderer.
// styles/liquid-chrome/liquid.js — the liquid-metal PLAN (pure, THREE-free, Node-safe).
// The chrome surface is a signed-distance field: a smooth union of "control primitives". Everything here
// produces plain primitive lists; style.js uploads them to the raymarch shader and scene.config.js derives SCORE
// from the same plans (droplet arrivals -> bloops), so sound and picture agree by construction.
//
// A primitive (slot) is a rounded box: { c:[x,y,z], he:[hx,hy,hz], r, rot, yaw, k, w, op }
//   c centre · he half extents BEFORE rounding (all 0 = sphere of radius r; he=[L,0,0] = capsule) · r rounding
//   rot = rotation about Z (applied first) · yaw = rotation about Y · k = smooth-union radius used when this slot
//   joins the field · w = presence 0..1 (0 = gone: the primitive is pushed inside itself, so it never pops) ·
//   op = +1 union, -1 carve (smooth subtraction; dimples, holes).
// Shapes are authored in a local frame (icon ~2 units wide, facing +Z) and moved with place().
// Morphs lerp every parameter slot by slot, so two shapes with the same slot count blend without popping.
import { clamp, lerp, ease, rng, smoothstep, TAU } from "./time.js";

export const prim = (o = {}) => ({ c: [0, 0, 0], he: [0, 0, 0], r: 0.2, rot: 0, yaw: 0, k: 0.06, w: 1, op: 1, ...o });
/** sphere at (x, y[, z]) */
export const sph = (x, y, r, o = {}) => prim({ c: [x, y, o.z ?? 0], r, ...o });
/** capsule from (x1,y1) to (x2,y2), radius r (in the shape plane) */
export const cap = (x1, y1, x2, y2, r, o = {}) => {
  const dx = x2 - x1, dy = y2 - y1;
  return prim({ c: [(x1 + x2) / 2, (y1 + y2) / 2, o.z ?? 0], he: [Math.hypot(dx, dy) / 2, 0, 0], r, rot: Math.atan2(dy, dx), ...o });
};
/** rounded slab centred at (x, y): half size hx, hy (+ hz), rounding r */
export const rbox = (x, y, hx, hy, r, o = {}) => prim({ c: [x, y, o.z ?? 0], he: [hx, hy, o.hz ?? 0], r, ...o });

// ------------------------------------------------------------------------------------------------ shapes
// Every shape: (opts) -> prim[] in a local frame ~2 units wide, centred on 0, facing +Z. opts.t animates
// the shapes that move (wave). Stroke radii ~0.14-0.2 read as puffy chrome tubes at 1080p.
const K_ICON = 0.07;
export const SHAPES = {
  sphere: ({ r = 1 } = {}) => [sph(0, 0, r, { k: 0.3 })],
  /** speech bubble: rounded slab + tail + three carved dots */
  chat: () => [
    rbox(0, 0.14, 0.6, 0.34, 0.3, { k: K_ICON }),
    cap(-0.28, -0.36, -0.62, -0.84, 0.15, { k: 0.12 }),
    sph(-0.42, 0.14, 0.15, { z: 0.31, op: -1, k: 0.05 }),
    sph(0, 0.14, 0.15, { z: 0.31, op: -1, k: 0.05 }),
    sph(0.42, 0.14, 0.15, { z: 0.31, op: -1, k: 0.05 }),
  ],
  /** picture frame: four border tubes + mountain zig-zag + sun */
  frame: () => {
    const W = 0.95, H = 0.74, r = 0.13, rm = 0.1;
    return [
      cap(-W, H, W, H, r, { k: K_ICON }), cap(-W, -H, W, -H, r, { k: K_ICON }),
      cap(-W, -H, -W, H, r, { k: K_ICON }), cap(W, -H, W, H, r, { k: K_ICON }),
      cap(-0.74, -0.66, -0.26, 0.12, rm, { k: 0.06 }), cap(-0.26, 0.12, 0.12, -0.36, rm, { k: 0.06 }),
      cap(0.12, -0.36, 0.4, -0.06, rm, { k: 0.06 }), cap(0.4, -0.06, 0.74, -0.66, rm, { k: 0.06 }),
      sph(0.42, 0.4, 0.17, { k: 0.05 }),
    ];
  },
  /** < / > */
  code: () => [
    cap(-0.4, 0.55, -0.95, 0, 0.15, { k: K_ICON }), cap(-0.95, 0, -0.4, -0.55, 0.15, { k: K_ICON }),
    cap(0.4, 0.55, 0.95, 0, 0.15, { k: K_ICON }), cap(0.95, 0, 0.4, -0.55, 0.15, { k: K_ICON }),
    cap(0.2, 0.68, -0.2, -0.68, 0.14, { k: K_ICON }),
  ],
  /** five audio bars; opts.t makes them pulse (closed form) */
  wave: ({ t = 0, pulse = 0.28 } = {}) => [0.36, 0.7, 1.0, 0.64, 0.34].map((h, i) => {
    const x = -0.84 + i * 0.42;
    const hh = h * 0.72 * (1 - pulse * 0.5 + pulse * 0.5 * Math.sin(t * 5.2 + i * 1.7));
    return cap(x, -hh, x, hh, 0.15, { k: K_ICON });
  }),
  /** play triangle: three edge tubes + a pillow fill */
  play: () => {
    const A = [-0.48, 0.74], B = [-0.48, -0.74], C = [0.82, 0];
    return [cap(...A, ...B, 0.17, { k: 0.1 }), cap(...B, ...C, 0.17, { k: 0.1 }), cap(...C, ...A, 0.17, { k: 0.1 }), sph(-0.05, 0, 0.36, { k: 0.18 })];
  },
  star: () => [
    ...[0, 1, 2, 3, 4].map((i) => { const a = Math.PI / 2 + (i * TAU) / 5; return cap(0, 0, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.19, { k: 0.12 }); }),
    sph(0, 0, 0.32, { k: 0.12 }),
  ],
  heart: () => [
    sph(-0.36, 0.24, 0.4, { k: 0.16 }), sph(0.36, 0.24, 0.4, { k: 0.16 }),
    cap(-0.62, 0.08, 0, -0.74, 0.21, { k: 0.16 }), cap(0.62, 0.08, 0, -0.74, 0.21, { k: 0.16 }), sph(0, -0.02, 0.38, { k: 0.16 }),
  ],
  arrow: () => [cap(-0.92, 0, 0.6, 0, 0.17, { k: K_ICON }), cap(0.92, 0, 0.42, 0.5, 0.17, { k: K_ICON }), cap(0.92, 0, 0.42, -0.5, 0.17, { k: K_ICON })],
  ring: ({ n = 9, R = 0.74, r = 0.17 } = {}) => Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    return cap(Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, r, { k: 0.08 });
  }),
  /** wide liquid pill (pedestal / underline) */
  bar: ({ len = 1, r = 0.22, depth = 0.22 } = {}) => [rbox(0, 0, len, 0, r, { hz: depth, k: 0.2 })],
};

// ------------------------------------------------------------------------------------------------ slot ops
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const centroid = (ps) => {
  const live = ps.filter((p) => p.w > 0.01 && p.op > 0);
  const s = (live.length ? live : ps).reduce((a, p) => [a[0] + p.c[0], a[1] + p.c[1], a[2] + p.c[2]], [0, 0, 0]);
  const n = (live.length ? live : ps).length || 1;
  return [s[0] / n, s[1] / n, s[2] / n];
};
/** hidden placeholder slot (w = 0) */
export const ghost = (c = [0, 0, 0], o = {}) => prim({ c: [...c], r: 0.05, w: 0, ...o });
/** pad a list to exactly n slots with ghosts at its centroid (throws if it has more than n) */
export function fitSlots(prims, n) {
  if (prims.length > n) throw new Error(`liquid.fitSlots: shape has ${prims.length} prims > ${n} slots`);
  const c = centroid(prims);
  return [...prims, ...Array.from({ length: n - prims.length }, () => ghost(c))];
}
/** the "melted" state of a shape: slot 0 a sphere of radius R at the shape centre, the rest ghosts inside it
 *  (ops copied from the target, so carve slots stay carve slots and nothing flips mid-morph) */
export function collapsedLike(target, R, o = {}) {
  const c = o.center ?? centroid(target);
  return target.map((p, i) => (i === 0 ? prim({ c: [...c], r: R, k: o.k ?? 0.3, op: 1 }) : ghost(c, { op: p.op, k: p.k })));
}
/** slot-by-slot blend of two equal-length primitive lists (u 0..1) */
export function mixPrims(A, B, u) {
  if (A.length !== B.length) throw new Error(`liquid.mixPrims: ${A.length} vs ${B.length} slots`);
  u = clamp(u);
  return A.map((a, i) => {
    const b = B[i];
    return {
      c: lerp3(a.c, b.c, u), he: lerp3(a.he, b.he, u), r: lerp(a.r, b.r, u), rot: lerp(a.rot, b.rot, u),
      yaw: lerp(a.yaw, b.yaw, u), k: lerp(a.k, b.k, u), w: lerp(a.w, b.w, u), op: u < 0.5 ? a.op : b.op,
    };
  });
}
/** morph(shapeA -> shapeB) through a liquid "melt": both padded to n slots, A melts to a sphere, B re-forms.
 *  u 0..1. Use when A and B have different slot structures (icon -> icon). */
export function morphThrough(A, B, u, { n = Math.max(A.length, B.length), R = 0.75 } = {}) {
  const a = fitSlots(A, n), b = fitSlots(B, n);
  if (u < 0.5) return mixPrims(a, collapsedLike(a, R), ease.inOutCubic(u * 2));
  return mixPrims(collapsedLike(b, R), b, ease.inOutCubic(u * 2 - 1));
}
/** place(prims, { pos, scale, rot, yaw }) -> world prims (rotate about Z, then Y, then translate).
 *  Valid for shapes whose own slots have yaw 0 (all of SHAPES). */
export function place(prims, { pos = [0, 0, 0], scale = 1, rot = 0, yaw = 0 } = {}) {
  const cr = Math.cos(rot), sr = Math.sin(rot), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return prims.map((p) => {
    const x = p.c[0] * scale, y = p.c[1] * scale, z = p.c[2] * scale;
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    const x2 = x1 * cy + z * sy, z2 = -x1 * sy + z * cy;
    return { ...p, c: [pos[0] + x2, pos[1] + y1, pos[2] + z2], he: p.he.map((v) => v * scale), r: p.r * scale, k: p.k * scale, rot: p.rot + rot, yaw: p.yaw + yaw };
  });
}

// ------------------------------------------------------------------------------------------------ motion
/** wobbling blob: n core spheres circling inside radius R (sums of sines; seeded phases). The smooth union
 *  reads as one viscous drop that never sits still. */
export function wobbleBlob(t, { center = [0, 0, 0], R = 1, n = 4, seed = 1, amp = 0.2, speed = 0.55, k = 0.55 } = {}) {
  const r = rng(seed);
  const ph = Array.from({ length: n }, () => [r.range(0, TAU), r.range(0, TAU), r.range(0, TAU), r.range(0.7, 1.3)]);
  return ph.map(([a, b, c, f], i) => {
    const s = speed * f;
    const off = [Math.sin(t * s + a) * amp * R, Math.sin(t * s * 1.31 + b) * amp * R * 0.8, Math.sin(t * s * 0.83 + c) * amp * R * 0.7];
    return sph(center[0] + off[0], center[1] + off[1], R * (1 - amp * 0.75) * (1 + 0.04 * Math.sin(t * 1.7 + i)), { z: center[2] + off[2], k: k * R });
  });
}
/** satellite droplets orbiting a centre, dipping into the surface (dip 0..1 = how far they sink in at the low point) */
export function orbiters(t, { center = [0, 0, 0], R = 1, n = 3, seed = 7, size = 0.16, dist = 1.45, speed = 0.7, tilt = 0.45, k = 0.35 } = {}) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const a0 = r.range(0, TAU), sp = speed * r.range(0.8, 1.25) * (i % 2 ? -1 : 1), tl = tilt * r.range(-1, 1);
    const a = a0 + t * sp, d = R * dist * (1 + 0.12 * Math.sin(t * 1.3 + a0));
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = Math.sin(a) * d * tl;
    return sph(center[0] + x, center[1] + y, size * R * r.range(0.8, 1.2), { z: center[2] + z, k: k * R });
  });
}
/** pinch-split / melt-merge: one blob at `from` (radius R) -> children at `to[i]` (radius r[i]). u 0..1
 *  (reverse u to merge). k swells mid-way so a stretchy neck forms, then snaps (classic mercury pinch). */
export function splitPrims(u, { from = [0, 0, 0], R = 1, R0 = R * 0.82, to = [], r = [], k = [0.55, 0.15], arc = 0.25 } = {}) {
  const e = ease.inOutCubic(clamp(u));
  const kk = lerp(k[0], k[1], smoothstep(0.35, 1, u)) * (1 + 0.35 * Math.sin(Math.PI * clamp(u)));
  const fromAt = (i) => (Array.isArray(from[0]) ? from[i] : from);   // one point, or one start per child (e.g. wobbleBlob cores)
  const r0At = (i) => (Array.isArray(R0) ? R0[i] : R0);
  return to.map((p, i) => {
    const ri = Array.isArray(r) ? r[i] ?? R * Math.cbrt(1 / to.length) : r;
    const c = lerp3(fromAt(i), p, e);
    c[2] += Math.sin(Math.PI * e) * arc;                       // bow toward the camera while travelling
    return sph(c[0], c[1], lerp(r0At(i), ri, e), { z: c[2], k: kk });
  });
}

// ------------------------------------------------------------------------------------------------ droplets
/**
 * dropletPlan({ count, seed, start, end, center, dist, size, travel, zRange }) -> [{ i, t0, arrive, from, ctrl, dir, r, pan }]
 *   Droplets fly in from all sides of the frame on curved paths and arrive (touch the blob) between start and end.
 *   Pure data: scene.config.js uses `arrive` for the bloop SCORE, style draws them with dropletAt().
 */
export function dropletPlan({ count = 20, seed = 3, start = 0, end = 2, center = [0, 0, 0], dist = [7, 10], size = [0.1, 0.2], travel = [0.8, 1.3], zRange = [-0.4, 0.6] } = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU * 2.618 + r.range(-0.4, 0.4);  // golden-ish spread around the frame
    const dz = r.range(...zRange);
    const s = Math.sqrt(1 - dz * dz);
    const dir = [Math.cos(a) * s, Math.sin(a) * s * 0.75, dz];
    const len = Math.hypot(...dir);
    const dn = dir.map((v) => v / len);
    const D = r.range(...dist);
    const from = dn.map((v, k) => center[k] + v * D);
    const side = r.sign() * r.range(0.25, 0.55) * D;
    const perp = [-dn[1], dn[0], 0];
    const ctrl = dn.map((v, k) => center[k] + v * D * 0.5 + perp[k] * side);
    const arrive = start + ((i + r.range(0, 0.6)) / count) * (end - start);
    out.push({ i, t0: arrive - r.range(...travel), arrive, from, ctrl, dir: dn, r: r.range(...size), pan: clamp(dn[0], -0.8, 0.8) });
  }
  return out.sort((x, y) => x.arrive - y.arrive).map((d, i) => ({ ...d, i }));
}
const bez = (a, b, c, u) => a.map((v, k) => (1 - u) * (1 - u) * v + 2 * (1 - u) * u * b[k] + u * u * c[k]);
/** dropletAt(d, t, { center, R, absorb, k, stretch }) -> prim (ghost before launch / after absorption).
 *  Flight: accelerating quadratic bezier to the surface point, stretched along the velocity (teardrop streak);
 *  then it sinks into the blob and fades (w -> 0) over `absorb` seconds. */
export function dropletAt(d, t, { center = [0, 0, 0], R = 1, absorb = 0.4, k = 0.3, stretch = 0.6 } = {}) {
  if (t < d.t0) return ghost(d.from);
  const surf = d.dir.map((v, k2) => center[k2] + v * R * 0.9);
  if (t < d.arrive) {
    const u = ease.inQuad((t - d.t0) / (d.arrive - d.t0));
    const p = bez(d.from, d.ctrl, surf, u);
    const q = bez(d.from, d.ctrl, surf, Math.min(1, u + 0.02));
    const v = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], vl = Math.hypot(...v) || 1;
    const dir = v.map((x) => x / vl);
    const el = d.r * stretch * clamp(vl * 25);
    return prim({ c: p, he: [el, 0, 0], r: d.r, rot: Math.atan2(dir[1], Math.hypot(dir[0], dir[2])), yaw: Math.atan2(-dir[2], dir[0]), k: k * (0.4 + 0.6 * u) });
  }
  const s = clamp((t - d.arrive) / absorb);
  // sink deep before fading: a drop that shrank while still near the surface would leave a tiny bead
  const p = d.dir.map((v, k2) => center[k2] + v * R * lerp(0.9, 0.3, ease.outCubic(s)));
  return sph(p[0], p[1], d.r * (1 - 0.3 * s), { z: p[2], k, w: 1 - smoothstep(0.55, 1, s) });
}
/** fraction of the plan absorbed by time t (0..1, smooth) — drives the blob's swell */
export function absorbed(plan, t, absorb = 0.4) {
  return plan.reduce((a, d) => a + smoothstep(d.arrive, d.arrive + absorb, t), 0) / Math.max(1, plan.length);
}

// ------------------------------------------------------------------------------------------------ sound events
/** plan -> [{ t, kind, size, pan }] events for kit/schedule.scoreFromEvents */
export function dropletEvents(plan) {
  return plan.map((d) => ({ t: d.arrive, kind: "merge", size: d.r, pan: d.pan }));
}
