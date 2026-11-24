// styles/ct-scan/volume.js — the CT planner for "CT Scan". THREE-free, DOM-free, Node-safe (imports kit/time.js only).
// It does two jobs, both run ONCE when the page (or Node) loads:
//   1. bakeVolume(): the hidden object — a sealed cardboard box with an original toy robot inside — is a list of
//      signed-distance primitives in three materials (cardboard, plastic, metal). They are rasterised into a voxel grid
//      (default 116 x 128 x 96, 6.25 mm voxels) as per-material COVERAGE (RGBA bytes: R card, G plastic, B metal), with a
//      one-voxel anti-aliased edge. Only + - * / sqrt abs min max floor are used, so Node and Chrome bake identical bytes
//      (the checksum goes into the fingerprint). The parts that turn — two gears and the wind-up key's bow — are NOT
//      baked: they are analytic (gearSd / keySd here, the same formulas in the style's GLSL) so they can spin in beat 5.
//   2. createPlan(): every time-dependent quantity as a closed-form function of t (box lift, scan plane, slice draw-in,
//      card peel / flight / stack spacing, the stack closing, the cross-fade to the volume, the tip-up, the slow turn,
//      the dial, the key / gear angles) plus an event list the SCORE is built from. Nothing steps.
// Local volume frame: metres, origin at the BOTTOM CENTRE of the box, y up, the robot faces +z.
import { clamp, ease } from "../../kit/time.js";

const PI = Math.PI;
const lerp = (a, b, u) => a + (b - a) * u;
const len2 = (x, y) => Math.sqrt(x * x + y * y);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// ------------------------------------------------------------------------------------------------ the box
export const BOX = { w: 0.72, h: 0.8, d: 0.6, wall: 0.018 };
export const MATERIALS = ["card", "plastic", "metal"];

// ------------------------------------------------------------------------------------------------ SDF primitives
/** rounded box: centre c, half-size h, corner radius r */
function sdRBox(x, y, z, c, h, r) {
  const qx = Math.abs(x - c[0]) - h[0] + r, qy = Math.abs(y - c[1]) - h[1] + r, qz = Math.abs(z - c[2]) - h[2] + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
/** capped cylinder along axis "x" | "y" | "z": centre c, radius r, half-length hl */
function sdCyl(x, y, z, c, axis, r, hl) {
  const dx = x - c[0], dy = y - c[1], dz = z - c[2];
  const [a, u, v] = axis === "x" ? [dx, dy, dz] : axis === "y" ? [dy, dx, dz] : [dz, dx, dy];
  const dr = len2(u, v) - r, da = Math.abs(a) - hl;
  return len2(Math.max(dr, 0), Math.max(da, 0)) + Math.min(Math.max(dr, da), 0);
}
function sdSph(x, y, z, c, r) { return len3(x - c[0], y - c[1], z - c[2]) - r; }
/** capsule from a to b, radius r */
function sdCap(x, y, z, a, b, r) {
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const hh = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return len3(px - bx * hh, py - by * hh, pz - bz * hh) - r;
}
/** torus around the y axis: centre c, ring radius R, tube r */
function sdTorusY(x, y, z, c, R, r) { return len2(len2(x - c[0], z - c[2]) - R, y - c[1]) - r; }

// ------------------------------------------------------------------------------------------------ the robot (original)
// A chunky wind-up toy: rounded feet, round legs with metal knee pins, hips with a metal axle, a HOLLOW chest with a round
// window in front (two meshing metal gears inside on metal axles), a metal key shaft out of the back, waving arms with
// metal shoulder pins and round hands, a neck of three metal rings, a hollow head with metal eyes and a metal mouth
// slot, two splayed metal antennae with ball tips. Every number in metres, local frame (bottom centre of the box).
export const ROBOT = {
  feet: { y: 0.046, h: [0.055, 0.028, 0.085], x: 0.075, z: 0.018, r: 0.018 },
  legs: { x: 0.075, y0: 0.07, y1: 0.19, r: 0.036 },
  knees: { y: 0.118, r: 0.013, hl: 0.05 },
  hips: { c: [0, 0.215, 0], h: [0.125, 0.03, 0.075], r: 0.022, axle: { r: 0.013, hl: 0.142 } },
  torso: { c: [0, 0.358, 0], h: [0.15, 0.113, 0.092], r: 0.034, shell: 0.017, window: { c: [0, 0.37], r: 0.082 } },
  axles: { r: 0.009, z0: -0.084, z1: 0.07 },
  arms: {
    shoulder: { y: 0.432, x: 0.168, pin: { r: 0.016, hl: 0.024 } },
    right: { to: [-0.27, 0.575, 0.03], r: 0.03, hand: 0.042 },   // waving (robot's right = -x)
    left: { to: [0.262, 0.3, 0.05], r: 0.03, hand: 0.042 },
  },
  neck: { y: [0.48, 0.494, 0.508], R: 0.034, r: 0.0085 },
  head: { c: [0, 0.596, 0], h: [0.122, 0.082, 0.096], r: 0.034, shell: 0.017 },
  ears: { x: 0.122, hl: 0.014, r: 0.032 },
  eyes: { y: 0.61, x: 0.05, r: 0.026, z0: 0.08, z1: 0.106 },
  mouth: { c: [0, 0.548, 0.094], h: [0.05, 0.011, 0.011], r: 0.006 },
  antennae: { from: 0.035, base: 0.674, tip: [0.105, 0.738], r: 0.0095, ball: 0.021 },
};
// The turning metal (analytic, also in the GLSL): gear A (12 teeth) on the key's axle, gear B (8 teeth) meshing with it.
export const GEARS = [
  { id: "A", c: [-0.043, 0.37, 0.026], R: 0.07, depth: 0.016, th: 0.022, teeth: 12, holes: 5, holeR: 0.0135, holeAt: 0.037 },
  { id: "B", c: [0, 0, 0.026], R: 0.046, depth: 0.016, th: 0.022, teeth: 8, holes: 3, holeR: 0.0105, holeAt: 0.022 },
];
{ // B sits at the meshing distance from A, down and to the right (exact, sqrt only)
  const A = GEARS[0], B = GEARS[1];
  const dist = A.R + B.R - A.depth * 1.05, dir = [0.93, -0.3676];
  const n = len2(dir[0], dir[1]);
  B.c = [A.c[0] + (dir[0] / n) * dist, A.c[1] + (dir[1] / n) * dist, A.c[2]];
}
export const KEY = { axis: [GEARS[0].c[0], GEARS[0].c[1]], shaft: { r: 0.0105, z0: -0.084, z1: -0.188 }, bow: { z: -0.212, lobeR: 0.036, lobeAt: 0.047, holeR: 0.0145, th: 0.0105, bar: 0.013 } };
/** gear axles (through both chest walls), analytic like the gears so they stay crisp in close-ups */
export const AXLES = { r: 0.009, z0: -0.084, z1: 0.07 };

/** the static parts: [{ m: 0 card | 1 plastic | 2 metal, sd(x,y,z), bb: [[x0,y0,z0],[x1,y1,z1]] }] */
export function modelParts(box = BOX, R = ROBOT) {
  const P = [];
  const add = (m, bb, sd) => P.push({ m, bb, sd });
  const hw = box.w / 2, hd = box.d / 2, t = box.wall;
  // the box: hollow shell (cardboard); a strip of paper tape over the lid seam (cardboard too)
  add(0, [[-hw, 0, -hd], [hw, box.h, hd]], (x, y, z) => Math.max(
    sdRBox(x, y, z, [0, box.h / 2, 0], [hw, box.h / 2, hd], 0.006),
    -sdRBox(x, y, z, [0, box.h / 2, 0], [hw - t, box.h / 2 - t, hd - t], 0.002)));
  add(0, [[-hw, box.h - 0.03, -0.06], [hw, box.h, 0.06]], (x, y, z) => sdRBox(x, y, z, [0, box.h - 0.008, 0], [hw, 0.008, 0.05], 0.003));
  // feet + legs + knee pins
  for (const s of [-1, 1]) {
    const F = R.feet;
    add(1, bbOf([s * F.x, F.y, F.z], F.h), (x, y, z) => sdRBox(x, y, z, [s * F.x, F.y, F.z], F.h, F.r));
    const L = R.legs;
    add(1, [[s * L.x - L.r, L.y0 - 0.01, -L.r], [s * L.x + L.r, L.y1 + 0.01, L.r]], (x, y, z) => sdCyl(x, y, z, [s * L.x, (L.y0 + L.y1) / 2, 0], "y", L.r, (L.y1 - L.y0) / 2));
    const K = R.knees;
    add(2, [[s * L.x - K.hl, K.y - K.r, -K.r], [s * L.x + K.hl, K.y + K.r, K.r]], (x, y, z) => sdCyl(x, y, z, [s * L.x, K.y, 0], "x", K.r, K.hl));
  }
  // hips + axle
  const Hp = R.hips;
  add(1, bbOf(Hp.c, Hp.h), (x, y, z) => sdRBox(x, y, z, Hp.c, Hp.h, Hp.r));
  add(2, [[-Hp.axle.hl, Hp.c[1] - Hp.axle.r, -Hp.axle.r], [Hp.axle.hl, Hp.c[1] + Hp.axle.r, Hp.axle.r]], (x, y, z) => sdCyl(x, y, z, Hp.c, "x", Hp.axle.r, Hp.axle.hl));
  // torso: hollow shell with a round window in the front wall
  const T = R.torso;
  const inner = [T.h[0] - T.shell, T.h[1] - T.shell, T.h[2] - T.shell];
  add(1, bbOf(T.c, T.h), (x, y, z) => {
    let d = Math.max(sdRBox(x, y, z, T.c, T.h, T.r), -sdRBox(x, y, z, T.c, inner, T.r - T.shell));
    if (z > 0) d = Math.max(d, -sdCyl(x, y, z, [T.window.c[0], T.window.c[1], T.c[2] + T.h[2]], "z", T.window.r, T.shell * 2));
    return d;
  });
  // (the gear axles and the key shaft are analytic metal, like the gears and the key bow: see AXLES / KEY.shaft)
  // arms: shoulder pins (metal), capsule arms + round hands (plastic)
  const A = R.arms;
  for (const [s, side] of [[-1, A.right], [1, A.left]]) {
    const sh = [s * A.shoulder.x, A.shoulder.y, 0];
    add(2, [[sh[0] - A.shoulder.pin.hl, sh[1] - A.shoulder.pin.r, -A.shoulder.pin.r], [sh[0] + A.shoulder.pin.hl, sh[1] + A.shoulder.pin.r, A.shoulder.pin.r]],
      (x, y, z) => sdCyl(x, y, z, sh, "x", A.shoulder.pin.r, A.shoulder.pin.hl));
    const a0 = [s * (A.shoulder.x + 0.012), A.shoulder.y, 0];
    add(1, bbSeg(a0, side.to, side.r), (x, y, z) => sdCap(x, y, z, a0, side.to, side.r));
    add(1, bbOf(side.to, [side.hand, side.hand, side.hand]), (x, y, z) => sdSph(x, y, z, side.to, side.hand)); // round hands
  }
  // neck rings (metal)
  const N = R.neck;
  for (const y0 of N.y) add(2, [[-N.R - N.r, y0 - N.r, -N.R - N.r], [N.R + N.r, y0 + N.r, N.R + N.r]], (x, y, z) => sdTorusY(x, y, z, [0, y0, 0], N.R, N.r));
  // head: hollow shell, ears (plastic); eyes, mouth (metal)
  const Hd = R.head;
  const hin = [Hd.h[0] - Hd.shell, Hd.h[1] - Hd.shell, Hd.h[2] - Hd.shell];
  add(1, bbOf(Hd.c, Hd.h), (x, y, z) => Math.max(sdRBox(x, y, z, Hd.c, Hd.h, Hd.r), -sdRBox(x, y, z, Hd.c, hin, Hd.r - Hd.shell)));
  const E = R.ears;
  for (const s of [-1, 1]) add(1, [[s * E.x - E.hl, Hd.c[1] - E.r, -E.r], [s * E.x + E.hl, Hd.c[1] + E.r, E.r]], (x, y, z) => sdCyl(x, y, z, [s * E.x, Hd.c[1], 0], "x", E.r, E.hl));
  const Ey = R.eyes;
  for (const s of [-1, 1]) add(2, [[s * Ey.x - Ey.r, Ey.y - Ey.r, Ey.z0], [s * Ey.x + Ey.r, Ey.y + Ey.r, Ey.z1]], (x, y, z) => sdCyl(x, y, z, [s * Ey.x, Ey.y, (Ey.z0 + Ey.z1) / 2], "z", Ey.r, (Ey.z1 - Ey.z0) / 2));
  const M = R.mouth;
  add(2, bbOf(M.c, M.h), (x, y, z) => sdRBox(x, y, z, M.c, M.h, M.r));
  // antennae (metal): splayed capsules with ball tips
  const An = R.antennae;
  for (const s of [-1, 1]) {
    const a = [s * An.from, An.base, 0], b = [s * An.tip[0], An.tip[1], 0];
    add(2, bbSeg(a, b, An.r), (x, y, z) => sdCap(x, y, z, a, b, An.r));
    add(2, bbOf(b, [An.ball, An.ball, An.ball]), (x, y, z) => sdSph(x, y, z, b, An.ball));
  }
  return P;
}
function bbOf(c, h) { return [[c[0] - h[0], c[1] - h[1], c[2] - h[2]], [c[0] + h[0], c[1] + h[1], c[2] + h[2]]]; }
function bbSeg(a, b, r) { return [[Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]]; }

// ------------------------------------------------------------------------------------------------ analytic turning metal
// The SAME formulas live in the style's GLSL. Here they are used for the gear phases and the Node-side slice check.
/** gearSd(x, y, z, g, ang): gear g (axis along z) turned by ang (rad) */
export function gearSd(x, y, z, g, ang, phase = 0) {
  const qx = x - g.c[0], qy = y - g.c[1], qz = z - g.c[2];
  const r = len2(qx, qy), a = Math.atan2(qy, qx) - ang - phase;
  const tooth = clamp(Math.cos(g.teeth * a) * 1.8, -1, 1);
  let d = r - (g.R - g.depth * 0.5 + g.depth * 0.5 * tooth);
  const sector = (2 * PI) / g.holes, k = Math.floor(a / sector + 0.5), ha = k * sector + ang + phase;
  d = Math.max(d, -(len2(qx - g.holeAt * Math.cos(ha), qy - g.holeAt * Math.sin(ha)) - g.holeR));
  return Math.max(d, Math.abs(qz) - g.th / 2);
}
/** keySd(x, y, z, ang): the key's bow (a flat two-lobed plate containing the shaft axis), turned by ang about z */
export function keySd(x, y, z, ang) {
  const B = KEY.bow;
  const qx = x - KEY.axis[0], qy = y - KEY.axis[1];
  const c = Math.cos(ang), s = Math.sin(ang);
  const u = c * qx + s * qy, w = -s * qx + c * qy, zz = z - B.z;
  const bx = Math.abs(u) - B.lobeAt;
  const lobe = len2(bx, zz) - B.lobeR, hole = len2(bx, zz) - B.holeR;
  const bar = Math.max(Math.abs(u) - B.lobeAt, Math.abs(zz) - B.bar);
  return Math.max(Math.max(Math.min(lobe, bar), -hole), Math.abs(w) - B.th);
}
/** gear phases so a tooth of A sits in a gap of B at the contact line (A turns +ang, B turns -ang * nA / nB) */
export function gearPhases() {
  const A = GEARS[0], B = GEARS[1];
  const phi = Math.atan2(B.c[1] - A.c[1], B.c[0] - A.c[0]);
  return { A: phi, B: phi + PI - PI / B.teeth, ratio: A.teeth / B.teeth };
}

// ------------------------------------------------------------------------------------------------ the bake
/**
 * bakeVolume({ nx=116, ny=128, nz=96, soft=1 }) -> { data (Uint8Array RGBA, x fastest then y then z), nx, ny, nz,
 *   vox: [vx,vy,vz], proj (Uint8Array RGBA nx*nz: top-down material thickness, normalised), counts, checksum, ms? }
 * Coverage per material = clamp(0.5 - sd / (soft * voxel), 0, 1), max over that material's parts; then metal wins over
 * plastic, plastic over cardboard (cov_plastic <= 1 - metal, cov_card <= 1 - metal - plastic).
 */
export function bakeVolume({ nx = 116, ny = 128, nz = 96, soft = 1, box = BOX } = {}) {
  const vx = box.w / nx, vy = box.h / ny, vz = box.d / nz;
  const N = nx * ny * nz;
  const cov = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  const ramp = soft * Math.max(vx, vy, vz);
  for (const part of modelParts(box)) {
    const [mn, mx] = part.bb;
    const i0 = Math.max(0, Math.floor((mn[0] + box.w / 2) / vx) - 2), i1 = Math.min(nx - 1, Math.ceil((mx[0] + box.w / 2) / vx) + 2);
    const j0 = Math.max(0, Math.floor(mn[1] / vy) - 2), j1 = Math.min(ny - 1, Math.ceil(mx[1] / vy) + 2);
    const k0 = Math.max(0, Math.floor((mn[2] + box.d / 2) / vz) - 2), k1 = Math.min(nz - 1, Math.ceil((mx[2] + box.d / 2) / vz) + 2);
    const A = cov[part.m];
    for (let k = k0; k <= k1; k++) {
      const z = (k + 0.5) * vz - box.d / 2;
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * vy, row = (k * ny + j) * nx;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * vx - box.w / 2;
          const c = 0.5 - part.sd(x, y, z) / ramp;
          if (c > A[row + i]) A[row + i] = c > 1 ? 1 : c;
        }
      }
    }
  }
  const data = new Uint8Array(N * 4);
  const counts = [0, 0, 0];
  const pr = [new Float32Array(nx * nz), new Float32Array(nx * nz), new Float32Array(nx * nz)];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = (k * ny + j) * nx + i;
    const m = cov[2][n], p = Math.min(cov[1][n], 1 - m), c = Math.min(cov[0][n], 1 - m - p);
    const b = [Math.round(c * 255), Math.round(p * 255), Math.round(m * 255)];
    data[n * 4] = b[0]; data[n * 4 + 1] = b[1]; data[n * 4 + 2] = b[2]; data[n * 4 + 3] = Math.max(b[0], b[1], b[2]);
    for (let q = 0; q < 3; q++) { if (b[q] > 127) counts[q]++; pr[q][k * nx + i] += b[q] / 255 * vy; }
  }
  // top-down projection (metres of each material along y), box-blurred 2 x 5 taps, scaled so 0.1 m -> 255
  const proj = new Uint8Array(nx * nz * 4);
  const blur = (src) => {
    let a = src;
    for (let pass = 0; pass < 2; pass++) {
      const h = new Float32Array(nx * nz), v = new Float32Array(nx * nz);
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { let s = 0; for (let d = -2; d <= 2; d++) s += a[k * nx + Math.min(nx - 1, Math.max(0, i + d))]; h[k * nx + i] = s / 5; }
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { let s = 0; for (let d = -2; d <= 2; d++) s += h[Math.min(nz - 1, Math.max(0, k + d)) * nx + i]; v[k * nx + i] = s / 5; }
      a = v;
    }
    return a;
  };
  const pb = pr.map(blur);
  for (let n = 0; n < nx * nz; n++) {
    for (let q = 0; q < 3; q++) proj[n * 4 + q] = Math.min(255, Math.round((pb[q][n] / 0.1) * 255));
    proj[n * 4 + 3] = 255;
  }
  // checksum: FNV-1a over a strided sample of the bytes + the counts (exact integers in both Node and Chrome)
  let h = 2166136261 >>> 0;
  for (let n = 0; n < data.length; n += 7) { h ^= data[n]; h = Math.imul(h, 16777619) >>> 0; }
  for (const c of counts) { h ^= c & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= c >>> 16; h = Math.imul(h, 16777619) >>> 0; }
  return { data, nx, ny, nz, vox: [vx, vy, vz], proj, counts, checksum: (h >>> 0).toString(16).padStart(8, "0") };
}

// ------------------------------------------------------------------------------------------------ the panel layout
/**
 * panelLayout(P, box=BOX) -> panel geometry, relative to the panel centre (metres, x right, y up):
 *   P = { inner (screen inner height), gap, pad, bezel, gauge, gaugeGap, cols, rows }
 *   hero: the big current-slice view (landscape: the slice turned 90 deg, box.w wide x box.d tall, scaled to `inner`)
 *   gauge: a thin scan-height strip right of the hero; grid: cols x rows thumbnails (portrait cards) on the right.
 */
export function panelLayout(P, box = BOX) {
  const Hs = P.inner;
  const heroS = Hs / box.d, heroW = box.w * heroS;
  const cellH = (Hs - (P.rows - 1) * P.gap) / P.rows, cellS = cellH / box.w, cellW = box.d * cellS;
  const gridW = P.cols * cellW + (P.cols - 1) * P.gap;
  const innerW = heroW + P.gaugeGap + P.gauge + P.gaugeGap + gridW;
  const screenW = innerW + 2 * P.pad, screenH = Hs + 2 * P.pad;
  const x0 = -innerW / 2;
  const hero = { cx: x0 + heroW / 2, cy: 0, w: heroW, h: Hs, s: heroS };
  const gauge = { cx: x0 + heroW + P.gaugeGap + P.gauge / 2, cy: 0, w: P.gauge, h: Hs };
  const gx0 = x0 + heroW + 2 * P.gaugeGap + P.gauge;
  const cells = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    cells.push([gx0 + cellW / 2 + c * (cellW + P.gap), Hs / 2 - cellH / 2 - r * (cellH + P.gap)]);
  }
  return { screenW, screenH, outerW: screenW + 2 * P.bezel, outerH: screenH + 2 * P.bezel, hero, gauge, cells, cellW, cellH, cellS, heroFrac: heroW / innerW };
}

// ------------------------------------------------------------------------------------------------ the plan
const easeF = (name) => ease[name] ?? ease.inOutCubic;
const win = (t, t0, dur) => clamp((t - t0) / dur, 0, 1);

/**
 * createPlan(cfg) -> plan. cfg (all times in s, positions in world metres):
 *   duration, box: { scanY, t0, t1, stop } (the box rises through the scan plane: top at t0, bottom at t1),
 *   slices: { n, top, bottom } (slice heights, local y, top first), panel: { c:[x,y,z], layout: panelLayout(...) },
 *   draw: { t0, gaps:[s], step, durs:[s], dur, lastHold, toCell, heroZoom }, peel: { t0, step, swing, fly, bulge },
 *   row: { c:[x,y,z] (centre of the CLOSED lying block), spread }, close: { t0, step, dur },
 *   fade: { t0, dur }, tip: { t0, dur, lift }, turn: { t0, t1, from, to }, panelLift: { t0, dur, dy },
 *   dial: [{ t0, dur }] (one per material removed), key: { t0, ramp, rate (rev/s) }, reveal: t
 */
export function createPlan(cfg, { volume = true } = {}) {
  const C = cfg;
  const H = BOX.h;
  const n = C.slices.n;
  const heights = Array.from({ length: n }, (_, k) => C.slices.top + ((C.slices.bottom - C.slices.top) * k) / (n - 1));
  const vol = volume ? bakeVolume(C.bake ?? {}) : null;
  const gp = gearPhases();

  // ---- box + scan
  const speed = H / (C.box.t1 - C.box.t0);
  const boxY = (t) => { // bottom of the box (world y)
    const y0 = C.box.scanY - H;
    if (t <= C.box.t1) return y0 + speed * (t - C.box.t0);
    const u = clamp((t - C.box.t1) / C.box.stop, 0, 1); // ease to a stop: v -> 0 over `stop` s
    return C.box.scanY + speed * C.box.stop * 0.5 * (1 - (1 - u) * (1 - u));
  };
  const scanAt = (t) => {
    const f = (t - C.box.t0) / (C.box.t1 - C.box.t0);
    return { on: f > 0 && f < 1, frac: clamp(f, 0, 1), y: C.box.scanY, local: H * (1 - clamp(f, 0, 1)) };
  };

  // ---- panel: each slice draws in LARGE in the hero view, holds until the next one starts, then shrinks into its
  // thumbnail cell (turning 90 deg back to portrait). Draw times: slow first ones (cfg.draw.gaps), then a steady step.
  const P = C.panel, LY = P.layout;
  const cellCentre = (k) => [P.c[0] + LY.cells[k][0], P.c[1] + LY.cells[k][1], P.c[2]];
  const heroCentre = [P.c[0] + LY.hero.cx, P.c[1] + LY.hero.cy, P.c[2]];
  const DR = C.draw;
  const drawT = (k) => {
    let t = DR.t0;
    for (let j = 0; j < k; j++) t += j < DR.gaps.length ? DR.gaps[j] : DR.step;
    return t;
  };
  const drawDur = (k) => (k < DR.durs.length ? DR.durs[k] : DR.dur);
  const drawAt = (k, t) => clamp((t - drawT(k)) / drawDur(k), 0, 1);
  const leaveT = (k) => (k < n - 1 ? drawT(k + 1) : drawT(n - 1) + DR.lastHold);
  /** the scan-height marker on the gauge: local height of the slice in the hero (eased between slices) */
  const gaugeAt = (t) => {
    let k = -1;
    for (let j = 0; j < n; j++) if (t >= drawT(j)) k = j;
    if (k < 0) return { on: 0, h: heights[0] };
    const u = easeF("outCubic")(clamp((t - drawT(k)) / Math.min(0.25, drawDur(k)), 0, 1));
    const h = k === 0 ? heights[0] : lerp(heights[k - 1], heights[k], u);
    return { on: easeF("outCubic")(clamp((t - drawT(0)) / 0.2, 0, 1)), h, k };
  };

  // ---- the row (lying block): card k at x = xL + sum of the gaps above it; gaps close from the feet end
  const R = C.row;
  const dh = heights.length > 1 ? heights[0] - heights[1] : 0.04;  // slice spacing (local)
  const x0 = R.c[0] - H / 2; // box bottom when closed (local y = 0)
  const xLow = x0 + heights[n - 1];
  const gapAt = (j, t) => { // gap between card j+1 and card j (j = 0..n-2), j = n-2 is the lowest pair
    const order = n - 2 - j; // the feet end closes first
    const u = easeF("inOutCubic")(win(t, C.close.t0 + order * C.close.step, C.close.dur));
    return dh * lerp(R.spread, 1, u);
  };
  const rowX = (k, t) => { let x = xLow; for (let j = n - 2; j >= k; j--) x += gapAt(j, t); return x; };
  const closeT = (k) => (k >= n - 1 ? C.close.t0 : C.close.t0 + (n - 2 - k) * C.close.step + C.close.dur); // when card k lands

  // ---- hero -> thumbnail -> peel + flight (world poses; rz = in-plane turn, ry = door swing about +y: the card hinges
  // on its LEFT edge and swings toward +z)
  const peelT = (k) => C.peel.t0 + k * C.peel.step;
  const sPanel = LY.cellS;
  const cardAt = (k, t) => {
    const c = cellCentre(k);
    const shown = t >= drawT(k);
    // hero phase and the shrink into the cell
    const ut = easeF("inOutCubic")(win(t, leaveT(k), C.draw.toCell));
    const panelPos = [lerp(heroCentre[0], c[0], ut), lerp(heroCentre[1], c[1], ut), c[2] + 0.004 + 0.012 * Math.sin(PI * ut) + 0.002 * (ut <= 0 ? 1 : 0)];
    const panelS = lerp(LY.hero.s, sPanel, ut);
    const rz = (PI / 2) * (1 - ut);
    // peel (door swing) and flight to the row
    const halfW = (BOX.d / 2) * sPanel;            // card width in the cell (the card's u axis spans the box depth)
    const tp = peelT(k);
    const us = easeF("inOutCubic")(win(t, tp, C.peel.swing));
    const uf = easeF("inOutCubic")(win(t, tp + C.peel.swing, C.peel.fly));
    const zoom = lerp(C.draw.heroZoom ?? 1, 1, ut);   // the hero view is magnified on the robot; back to 1 in the cell
    if (us <= 0) return { pos: panelPos, ry: 0, rz, s: panelS, zoom, base: 1, peel: 0, fly: 0, onPanel: true, visible: shown, hero: ut < 1 };
    const ry = -PI / 2 * us;
    const hx = c[0] - halfW;
    const swung = [hx + halfW * Math.cos(ry), c[1], c[2] + 0.006 - halfW * Math.sin(ry) + 0.02 * us];
    const target = [rowX(k, t), R.c[1], R.c[2]];
    const bulge = C.peel.bulge * Math.sin(PI * uf);
    const pos = uf <= 0 ? swung : [lerp(swung[0], target[0], uf), lerp(swung[1], target[1], uf), lerp(swung[2], target[2], uf) + bulge];
    const s = lerp(sPanel, 1, uf);
    const base = lerp(1, 0, clamp(us * 1.4, 0, 1));
    return { pos, ry, rz: 0, s, zoom: 1, base, peel: us, fly: uf, onPanel: false, visible: true, hero: false };
  };

  // ---- cross-fade, tip-up, turn, panel lift
  const closeAt = (t) => easeF("inOutSine")(win(t, C.close.t0, (n - 2) * C.close.step + C.close.dur));
  const fadeAt = (t) => easeF("inOutSine")(win(t, C.fade.t0, C.fade.dur)); // 0 cards .. 1 volume
  const tipAt = (t) => easeF("inOutCubic")(win(t, C.tip.t0, C.tip.dur));
  const turnAt = (t) => lerp(C.turn.from, C.turn.to, easeF("inOutSine")(win(t, C.turn.t0, C.turn.t1 - C.turn.t0)));
  const blockAt = (t) => { // reco group: centre + rotation (tip about z: -pi/2 lying -> 0 upright, then yaw)
    const u = tipAt(t);
    const yL = R.c[1], yU = R.c[1] - BOX.w / 2 + H / 2;
    return { c: [R.c[0], lerp(yL, yU, u) + C.tip.lift * Math.sin(PI * u), R.c[2]], rz: -PI / 2 * (1 - u), yaw: turnAt(t), tip: u };
  };
  const panelLiftAt = (t) => C.panelLift.dy * easeF("inOutCubic")(win(t, C.panelLift.t0, C.panelLift.dur));

  // ---- the dial: material visibility (card, plastic, metal) and the dial angle (0, 1, 2 detents)
  const dialAt = (t) => {
    const u = C.dial.map((d) => easeF("inOutCubic")(win(t, d.t0, d.dur)));
    return { pos: u.reduce((a, b) => a + b, 0), vis: [1 - u[0], 1 - (u[1] ?? 0), 1], on: easeF("outCubic")(win(t, C.dialShow.t0, C.dialShow.dur)) };
  };

  // ---- the key (and gear A, same axle) angle: speed ramps linearly 0 -> rate over `ramp` s (closed form, polynomial)
  const K = C.key;
  const w = 2 * PI * K.rate;
  const keyAt = (t) => {
    const tau = t - K.t0;
    if (tau <= 0) return 0;
    return tau < K.ramp ? (w * tau * tau) / (2 * K.ramp) : w * (tau - K.ramp / 2);
  };
  const gearsAt = (t) => { const a = keyAt(t); return { A: a, B: -a * gp.ratio, key: a, phaseA: gp.A, phaseB: gp.B }; };
  // quarter-turn times of the key (ratchet clicks): solve keyAt(t) = q * pi / 2 exactly (sqrt only)
  const keyClicks = [];
  for (let q = 1; q < 200; q++) {
    const th = (q * PI) / 2;
    const thR = (w * K.ramp) / 2;
    const tau = th <= thR ? Math.sqrt((2 * K.ramp * th) / w) : th / w + K.ramp / 2;
    const t = K.t0 + tau;
    if (t >= C.duration - 0.05) break;
    keyClicks.push(t);
  }

  // ---- events (SCORE is built from these)
  const ev = [];
  const E = (kind, t, extra = {}) => ev.push({ kind, t: Math.round(t * 1e6) / 1e6, ...extra });
  E("glide", 0, { dur: C.box.t0 + 0.4 });
  E("scanOn", C.box.t0);
  E("scan", C.box.t0, { dur: C.box.t1 - C.box.t0 });
  E("scanOff", C.box.t1);
  E("toPanel", C.moves.toPanel.t, { dur: C.moves.toPanel.dur });
  for (let k = 0; k < n; k++) E("draw", drawT(k), { k, dur: drawDur(k), first: k === 0 });
  for (let k = 0; k < n; k++) E("peel", peelT(k), { k, dur: C.peel.swing });
  for (let k = 0; k < n; k++) E("land", peelT(k) + C.peel.swing + C.peel.fly, { k });
  E("swing", C.moves.swing.t, { dur: C.moves.swing.dur });
  E("close", C.close.t0, { dur: (n - 2) * C.close.step + C.close.dur });
  for (let k = n - 2; k >= 0; k--) E("snap", closeT(k), { k });
  E("reveal", C.reveal);
  E("tip", C.tip.t0, { dur: C.tip.dur });
  E("stand", C.tip.t0 + C.tip.dur);
  C.dial.forEach((d, i) => {
    E("fade", d.t0, { i, dur: d.dur, material: MATERIALS[i] });
    for (let j = 1; j <= 3; j++) E("detent", d.t0 + (d.dur * j) / 3.2, { i, j });
  });
  E("metal", C.dial[C.dial.length - 1].t0 + C.dial[C.dial.length - 1].dur);
  keyClicks.forEach((t, q) => E("ratchet", t, { q }));
  ev.sort((a, b) => a.t - b.t || (a.k ?? 0) - (b.k ?? 0));

  return {
    cfg: C, heights, volume: vol, gearPhase: gp, events: ev, keyClicks,
    boxY, scanAt, cellCentre, heroCentre, drawT, drawAt, leaveT, gaugeAt, peelT, cardAt, rowX, closeT, closeAt, fadeAt, tipAt, turnAt, blockAt, panelLiftAt, dialAt, keyAt, gearsAt,
  };
}

/** fingerprint(plan) -> short hex of every event time (rounded to 1e-6) + the volume checksum: print it in Node and the page */
export function fingerprint(plan) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const x = Math.round(v * 1e6) | 0; h ^= x & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= x >>> 16; h = Math.imul(h, 16777619) >>> 0; };
  plan.events.forEach((e) => { mix(e.t); mix(e.dur ?? 0); });
  plan.heights.forEach(mix);
  let s = (h >>> 0).toString(16).padStart(8, "0");
  if (plan.volume) s += "-" + plan.volume.checksum;
  return s;
}

/** sliceGrey(vol, h, u, v, grey=[.38,.68,1]) -> 0..1 (Node-side check: nearest-voxel grey of slice h at card uv) */
export function sliceGrey(vol, h, u, v, grey = [0.38, 0.68, 1]) {
  const i = Math.min(vol.nx - 1, Math.max(0, Math.floor((1 - v) * vol.nx)));  // v -> local -x
  const k = Math.min(vol.nz - 1, Math.max(0, Math.floor(u * vol.nz)));         // u -> local z
  const j = Math.min(vol.ny - 1, Math.max(0, Math.floor((h / BOX.h) * vol.ny)));
  const n = ((k * vol.ny + j) * vol.nx + i) * 4;
  return Math.min(1, (vol.data[n] * grey[0] + vol.data[n + 1] * grey[1] + vol.data[n + 2] * grey[2]) / 255);
}
