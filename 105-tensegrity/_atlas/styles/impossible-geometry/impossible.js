// styles/impossible-geometry/impossible.js — the style's pure planner (no THREE, no window, no DOM; Node-safe).
// Imported by style.js (picture) AND by scene.config.js (camera keys, traveller schedule, SCORE), so the stairs,
// the walker, the camera's "magic" direction and the footsteps all come from ONE plan.
//
// The trick, in one line: under an orthographic camera with view direction v, a point can slide along v without
// moving on screen. So build a REAL open chain of steps whose last step, continued one more step, lands exactly
// k·v away from the first step. From the magic view the chain closes into an endless loop; from anywhere else it
// is an open spiral with its two ends metres apart in depth.
//
//   penroseStairs(o)       -> plan: cells (step blocks), h (rise), k (depth gap), offset (= k·v), magic {az, el, dir}
//   cellBox(plan, i, o)    -> [min, max] of a step block (top at the step height, `thick` deep)
//   walkerAt(plan, s)      -> traveller pose on the chain at continuous step parameter s (hop between cells,
//                             wraps from the last cell to the first: an invisible teleport along v)
//   stepTimes(plan, walk, t0, t1) -> landings [{ t, i, lap }] (one per step; SCORE + picture read the same list)
//   shepard(i, n, o)       -> [{ ratio, gain }] Shepard-tone partials for step i of an n-step octave (ever-rising)
//   magicDir(az, el), viewAngle(a, b), sealFade(angle, o) -> seam-cut strength from how far the camera is off magic
import { clamp, smoothstep } from "../../kit/time.js";

const DIRS = { "+x": [1, 0], "-x": [-1, 0], "+z": [0, 1], "-z": [0, -1] };

/** magicDir(az, el) -> unit vector from the subject TOWARD the camera (azimuth 0 = camera on +Z; az>0 swings to +X). */
export const magicDir = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** viewAngle(a, b) -> angle in radians between two unit directions. */
export const viewAngle = (a, b) => Math.acos(clamp(dot(a, b), -1, 1));

/**
 * penroseStairs({ flights = [[+x,7],[-z,3],[-x,3],[+z,7]], run = 1, width = run, el = 45deg, thick = 1.2,
 *                 origin = [0,0,0] }) -> plan
 *   flights: [dir, moves] in walking order; moves along +x minus moves along -x must equal +z minus -z (= m), so the
 *   horizontal gap points along (1,0,1) and the magic azimuth is 45deg. The rise per step is solved so the closing
 *   step (last cell -> "cell N") lands exactly k·v from cell 0:  N·h = |gap_h|·tan(el).
 *   plan = { cells:[{ i, x, y, z, dir:[dx,dz], corner }], n, h, run, width, thick, offset:[ox,oy,oz], k, magic:{ az, el, dir } }
 */
export function penroseStairs(o = {}) {
  const flights = o.flights ?? [["+x", 7], ["-z", 3], ["-x", 3], ["+z", 7]];
  const run = o.run ?? 1, width = o.width ?? run, thick = o.thick ?? 1.2;
  const el = o.el ?? Math.PI / 4;
  const [x0, y0, z0] = o.origin ?? [0, 0, 0];
  const moves = flights.flatMap(([d, n]) => Array.from({ length: n }, () => DIRS[d]));
  const n = moves.length;
  const gx = moves.reduce((a, m) => a + m[0], 0) * run, gz = moves.reduce((a, m) => a + m[1], 0) * run;
  if (Math.abs(gx - gz) > 1e-9 || gx <= 0) throw new Error("penroseStairs: x and z gaps must be equal and positive (magic azimuth 45deg)");
  const az = Math.atan2(gx, gz);
  const gapH = Math.hypot(gx, gz);
  const h = (gapH * Math.tan(el)) / n;
  const dir = magicDir(az, el);
  const k = Math.hypot(gapH, gapH * Math.tan(el));
  const cells = [];
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const mv = moves[i], prev = moves[(i - 1 + n) % n];
    cells.push({ i, x: x0 + cx, y: y0 + i * h, z: z0 + cz, dir: mv, corner: mv[0] !== prev[0] || mv[1] !== prev[1] });
    cx += mv[0] * run; cz += mv[1] * run;
  }
  const offset = [gx, n * h, gz];
  return { cells, n, h, run, width, thick, offset, k, magic: { az, el, dir }, flights };
}

/** cellBox(plan, i, { pad = 0, thick = plan.thick }) -> [[minx,miny,minz],[maxx,maxy,maxz]]: step block (top = step height). */
export function cellBox(plan, i, o = {}) {
  const c = plan.cells[i], hw = plan.run / 2 + (o.pad ?? 0), T = o.thick ?? plan.thick;
  return [[c.x - hw, c.y - T, c.z - hw], [c.x + hw, c.y + (o.pad ?? 0), c.z + hw]];
}

/** virtualCell(plan, j) -> the cell position for ANY integer j (j >= n continues past the end: cell j mod n + lap·offset). */
export function virtualCell(plan, j) {
  const n = plan.n, lap = Math.floor(j / n), c = plan.cells[((j % n) + n) % n];
  return [c.x + lap * plan.offset[0], c.y + lap * plan.offset[1], c.z + lap * plan.offset[2]];
}

/**
 * walkerAt(plan, s, { hop = .55 (fraction of a step spent in the air), lift = .45 (arc height in rises) })
 *   s = continuous step parameter (integer = standing on cell s mod n). Returns
 *   { pos:[x,y,z] (feet), heading (rad about +Y, 0 = facing +Z), i (cell it leaves), lap, u (0..1 hop), air }.
 *   On the last cell it hops toward the VIRTUAL next cell (cell 0 + offset) and, at the landing instant, the
 *   integer part wraps to cell 0: from the magic view the two are the same screen point.
 */
export function walkerAt(plan, s, o = {}) {
  const hop = o.hop ?? 0.55, lift = o.lift ?? 0.45;
  const n = plan.n, j = Math.floor(s), u = s - j;
  const lap = Math.floor(j / n), i = ((j % n) + n) % n;
  const a = plan.cells[i];
  const b = i === n - 1 ? virtualCell(plan, n) : virtualCell(plan, i + 1);
  const w = clamp((u - (1 - hop)) / hop); // stand first, then hop
  const e = w * w * (3 - 2 * w);
  const arc = 4 * w * (1 - w) * lift * plan.h + 4 * w * (1 - w) * 0.06 * plan.run;
  const pos = [a.x + (b[0] - a.x) * e, a.y + (b[1] - a.y) * e + arc, a.z + (b[2] - a.z) * e];
  const heading = Math.atan2(a.dir[0], a.dir[1]);
  return { pos, heading, i, lap, u, air: w > 0 && w < 1, squash: w > 0 ? 1 : 1 - 0.12 * Math.sin(Math.PI * clamp(u / (1 - hop))) };
}

/** walkParam(walk, t) -> s: s0 + rate·(t - t0) (closed form, linear in t). walk = { s0, rate, t0 = 0 } */
export const walkParam = (walk, t) => walk.s0 + walk.rate * (t - (walk.t0 ?? 0));

/**
 * stepTimes(plan, walk, t0, t1, { hop = .55 }) -> [{ t, i, lap }]: every landing (the instant the walker's feet touch
 *   cell i) in [t0, t1). Landing on cell 0 after cell n-1 is the invisible teleport (i = 0, lap + 1).
 */
export function stepTimes(plan, walk, t0, t1) {
  const out = [];
  const sA = walkParam(walk, t0), sB = walkParam(walk, t1);
  for (let j = Math.ceil(sA); j < sB; j++) {
    const t = (walk.t0 ?? 0) + (j - walk.s0) / walk.rate;
    if (t < t0 || t >= t1) continue;
    const n = plan.n;
    out.push({ t: +t.toFixed(4), i: ((j % n) + n) % n, lap: Math.floor(j / n), j });
  }
  return out;
}

/** seamCrossings(plan, walk, t0, t1) -> times the walker lands on cell 0 coming from the last cell (the teleport). */
export const seamCrossings = (plan, walk, t0, t1) => stepTimes(plan, walk, t0, t1).filter((e) => e.i === 0).map((e) => e.t);

/**
 * shepard(i, n, { octaves = 4, base = 1, centre = octaves / 2, width = .9 }) -> [{ ratio, gain }]
 *   Step i of an n-step octave: partial o sits at ratio 2^(o + i/n); a bell-shaped weight over log-frequency fades the
 *   top partial out as the bottom one fades in, so after n steps the chord is identical — it climbs for ever.
 */
export function shepard(i, n, o = {}) {
  const oct = o.octaves ?? 4, c = o.centre ?? oct / 2, w = o.width ?? 0.9, base = o.base ?? 1;
  const f = (((i % n) + n) % n) / n;
  const out = [];
  for (let k = 0; k < oct; k++) {
    const x = k + f;
    out.push({ ratio: base * 2 ** x, gain: Math.exp(-0.5 * ((x - c) / w) ** 2) });
  }
  return out;
}

/** sealFade(angle, { full = .2deg, gone = 7deg }) -> 1 at the magic view, smoothly 0 a few degrees off it. */
export function sealFade(angle, o = {}) {
  const a = o.full ?? (0.2 * Math.PI) / 180, b = o.gone ?? (7 * Math.PI) / 180;
  return 1 - smoothstep(a, b, angle);
}

/**
 * orbitKey(t, target, az, el, viewHeight, { dist = 40, ease, path }) -> ortho camera key on a bearing (constant distance).
 *   Use path "arc" on keys that swing azimuth so the camera orbits the target instead of cutting across.
 */
export function orbitKey(t, target, az, el, viewHeight, o = {}) {
  const d = o.dist ?? 40, v = magicDir(az, el), r = (x) => +x.toFixed(5);
  const key = { t, pos: target.map((c, i) => r(c + v[i] * d)), target: target.map(r), viewHeight: r(viewHeight) };
  if (o.ease) key.ease = o.ease;
  if (o.path) key.path = o.path;
  return key;
}
