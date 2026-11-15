// styles/shadow-puppets/puppetry.js — the shadow-play planner (pure: no THREE, no window, no DOM; Node-safe).
// Imported by style.js (picture) AND by a scene's scene.config.js (sound), so the taps, swishes and plucks land on the
// motion by construction.
//
// World frame (metres, Y up): the cloth is the plane z = 0, the audience is at +z, puppets and the lamp are BEHIND the
// cloth (z < 0). A puppet at depth d (distance behind the cloth) lit by a lamp at depth L casts a shadow magnified by
//     M = L / (L - d)                                  (1 at the cloth, growing without bound toward the lamp)
// and, for a lamp of radius r, a penumbra (soft edge) of width
//     w = 2 r d / (L - d)                              (0 at the cloth: crisp; wide near the lamp: soft)
// In the caster's own plane that is 2 r (1 - s), s = fraction of the lamp→cloth ray where it crosses the caster — the
// shader in style.js uses exactly that. So "zoom", depth layers and softness come from moving puppets, not the camera.
//
// Actor keys are written in SHADOW SPACE against the home lamp: { t, at: [sx, sy] (where the shadow's origin should land
// on the cloth), size: M (shadow magnification), rot (deg), yaw (deg), op (0..1), ease, tap }. The planner converts every
// key to a physical position (x, y, depth) and interpolates physically, so a later lamp move swings and stretches every
// shadow the way a real lamp would (near-cloth scenery barely moves, near-lamp puppets swing a lot).
import { clamp, lerp, toEase, smoothstep } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";

const D2R = Math.PI / 180;

// ------------------------------------------------------------------ shadow geometry
/** magnification(L, d): shadow scale of a caster at depth d (behind the cloth) for a lamp at depth L. */
export const magnification = (L, d) => L / Math.max(1e-6, L - d);
/** penumbra(r, L, d): full soft-edge width ON THE CLOTH (metres) for lamp radius r. */
export const penumbra = (r, L, d) => (2 * r * d) / Math.max(1e-6, L - d);
/** depthForScale(L, M): the depth that gives magnification M (M >= 1). */
export const depthForScale = (L, M) => L * (1 - 1 / Math.max(1, M));
/** lampDepth(lamp) = -lamp.z (lamp = { x, y, z (negative), r }). */
export const lampDepth = (lamp) => -lamp.z;
/** shadowPoint(lamp, [x, y, z]) -> [sx, sy]: where a point behind the cloth lands on the cloth. */
export function shadowPoint(lamp, p) {
  const k = lamp.z / (lamp.z - p[2]); // ray lamp + k (p - lamp) meets z = 0 at k (> 1 for a caster between lamp and cloth)
  return [lamp.x + (p[0] - lamp.x) * k, lamp.y + (p[1] - lamp.y) * k];
}
/** placeForShadow(lamp, [sx, sy], M) -> { x, y, d }: physical placement whose origin's shadow lands at [sx, sy] with scale M. */
export function placeForShadow(lamp, at, M) {
  const d = depthForScale(lampDepth(lamp), M);
  return { x: lamp.x + (at[0] - lamp.x) / M, y: lamp.y + (at[1] - lamp.y) / M, d };
}
/** shadowExtent(lamp, pose, bbox [minx, miny, maxx, maxy]) -> { min:[x,y], max:[x,y], M, soft }: the shadow's box on the cloth
 *  for a flat caster (no yaw) at pose { x, y, d, rot (deg), scale }. Used for framing checks in Node. */
export function shadowExtent(lamp, pose, bbox) {
  const c = Math.cos((pose.rot ?? 0) * D2R), s = Math.sin((pose.rot ?? 0) * D2R), k = pose.scale ?? 1;
  const pts = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map(([u, v]) =>
    shadowPoint(lamp, [pose.x + k * (c * u - s * v), pose.y + k * (s * u + c * v), -pose.d]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const L = lampDepth(lamp);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)], M: magnification(L, pose.d), soft: penumbra(lamp.r ?? 0, L, pose.d) };
}

// ------------------------------------------------------------------ keyed tracks
/** sampleKeys(keys, t, fields) -> { field: value }: hold before the first / after the last key; segment i -> i+1 uses
 *  keys[i+1].ease (default inOutSine). Fields missing on a key hold their previous value. */
export function sampleKeys(keys, t, fields) {
  const out = {};
  if (!keys?.length) return out;
  // forward-fill missing fields so every key is complete
  const full = [];
  let prev = {};
  for (const k of keys) { prev = { ...prev, ...k }; full.push(prev); }
  let i = 0;
  while (i < full.length - 1 && t >= full[i + 1].t) i++;
  const a = full[i], b = full[Math.min(i + 1, full.length - 1)];
  const u = b === a || t <= a.t ? 0 : toEase(b.ease ?? "inOutSine")(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
  for (const f of fields) {
    const va = a[f], vb = b[f];
    if (va == null && vb == null) continue;
    if (Array.isArray(va ?? vb)) out[f] = (va ?? vb).map((x, j) => lerp(x, (vb ?? va)[j], u));
    else out[f] = lerp(va ?? vb, vb ?? va, u);
  }
  return out;
}

/** swing(t, { amp (deg), rate (Hz), phase (rad), on: [t0, t1], ramp = .25 }) -> deg: a walk/flap oscillation, eased in/out. */
export function swing(t, o) {
  const [t0, t1] = o.on ?? [-Infinity, Infinity];
  const ramp = o.ramp ?? 0.25;
  const w = smoothstep(t0, t0 + ramp, t) * (1 - smoothstep(t1 - ramp, t1, t));
  if (w <= 0) return 0;
  return (o.amp ?? 0) * Math.sin(2 * Math.PI * (o.rate ?? 1) * (t - (Number.isFinite(t0) ? t0 : 0)) + (o.phase ?? 0)) * w;
}
/** swingTimes(o) -> times where the swing passes through zero going one way (a footfall / wing beat) inside on:[t0,t1]. */
export function swingTimes(o, { every = 1 } = {}) {
  const [t0, t1] = o.on ?? [0, 0];
  const out = [];
  const rate = o.rate ?? 1, ph = o.phase ?? 0;
  // zero crossings of sin(2π rate (t - t0) + ph): t = t0 + (kπ - ph) / (2π rate)
  for (let k = Math.ceil(ph / Math.PI); ; k++) {
    const t = t0 + (k * Math.PI - ph) / (2 * Math.PI * rate);
    if (t > t1 - (o.ramp ?? 0.25)) break;
    if (t >= t0 + (o.ramp ?? 0.25) * 0.5 && k % every === 0) out.push(+t.toFixed(4));
  }
  return out;
}

// ------------------------------------------------------------------ the show plan
/**
 * planShow(show) -> plan
 *   show = {
 *     lamp: { home: { x, y, z, r }, keys: [{ t, x, y, z, r, level, ease }] },
 *     actors: { [id]: { keys: [{ t, at:[sx,sy], size:M, rot, yaw, op, scale, ease, tap }], limbs: { [part]: { base, keys:[{t,a,ease}], swing:{...}, steps } },
 *                       swish: true|false (an entrance swish on the first move), kind: "puppet"|"scenery"|"title" } },
 *     theme: [{ t, notes: [semitones], step, gain }]   (plucked-string phrases; t usually from BEATS)
 *     ripple: { base, swish, tau }
 *   }
 *   plan.lamp(t) -> { x, y, z, r, level }
 *   plan.pose(id, t) -> { x, y, z, rot, yaw, op, scale, d, M, limbs: { part: deg } }   (physical, home-lamp placement)
 *   plan.events -> [{ t, kind: "swish"|"step"|"tap"|"lamp"|"pluck", id, ... }] sorted (feed kit schedule.scoreFromEvents)
 *   plan.ripple(t) -> cloth ripple level (base + decaying bumps after each swish)
 */
export function planShow(show) {
  const home = show.lamp.home;
  const lampKeys = show.lamp.keys?.length ? show.lamp.keys : [{ t: 0, ...home }];
  const actors = {};
  for (const [id, a] of Object.entries(show.actors ?? {})) {
    let carry = {};
    const filled = a.keys.map((k) => (carry = { ...carry, ease: undefined, tap: undefined, ...k }));
    const phys = filled.map((k) => {
      const M = k.size ?? 1;
      const p = placeForShadow(home, k.at ?? [0, home.y], M);
      return { t: k.t, x: p.x, y: p.y, d: p.d, rot: k.rot ?? 0, yaw: k.yaw ?? 0, op: k.op ?? 1, scale: k.scale ?? 1, ease: k.ease, tap: k.tap };
    });
    actors[id] = { ...a, phys };
  }
  const lamp = (t) => {
    const s = sampleKeys(lampKeys, t, ["x", "y", "z", "r", "level"]);
    return { x: s.x ?? home.x, y: s.y ?? home.y, z: s.z ?? home.z, r: s.r ?? home.r, level: s.level ?? 1 };
  };
  const pose = (id, t) => {
    const a = actors[id];
    if (!a) throw new Error(`planShow: no actor "${id}"`);
    const s = sampleKeys(a.phys, t, ["x", "y", "d", "rot", "yaw", "op", "scale"]);
    const limbs = {};
    for (const [part, L] of Object.entries(a.limbs ?? {})) {
      let ang = L.base ?? 0;
      if (L.keys?.length) ang += sampleKeys(L.keys, t, ["a"]).a ?? 0;
      if (L.swing) ang += swing(t, L.swing);
      limbs[part] = ang;
    }
    const Lh = lampDepth(home);
    return { ...s, z: -s.d, M: magnification(Lh, s.d), limbs };
  };

  // ---- events (sound + ripple) ----
  const events = [];
  for (const [id, a] of Object.entries(actors)) {
    const P = a.phys;
    // swish: every key segment that moves far (> .6 m physical) with swish enabled; first move always if swish
    for (let i = 1; i < P.length; i++) {
      const dist = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].d - P[i - 1].d);
      if (a.swish !== false && dist > (a.swishMin ?? 0.6)) events.push({ t: P[i - 1].t, kind: "swish", id, dur: P[i].t - P[i - 1].t, dist, depth: P[i].d });
      if (P[i].tap) events.push({ t: P[i].t, kind: "tap", id, depth: P[i].d });
    }
    for (const [part, L] of Object.entries(a.limbs ?? {})) {
      if (L.swing && L.steps) for (const t of swingTimes(L.swing, { every: L.steps === true ? 1 : L.steps })) events.push({ t, kind: "step", id, part });
      for (const k of L.keys ?? []) if (k.tap) events.push({ t: k.t, kind: "tap", id, part });
    }
  }
  for (let i = 1; i < lampKeys.length; i++) {
    const A = lampKeys[i - 1], B = lampKeys[i];
    const dist = Math.hypot((B.x ?? A.x) - A.x, (B.y ?? A.y) - A.y, (B.z ?? A.z) - A.z);
    if (dist > 0.05) events.push({ t: A.t, kind: "lamp", dur: B.t - A.t, dist });
  }
  for (const ph of show.theme ?? []) {
    (ph.notes ?? []).forEach((n, j) => events.push({ t: +(ph.t + j * (ph.step ?? 0.22)).toFixed(4), kind: "pluck", note: n, j, gain: ph.gain ?? 1, phrase: ph.id }));
  }
  events.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));

  const R = { base: 0.35, swish: 0.9, tau: 0.9, ...(show.ripple ?? {}) };
  const swishes = events.filter((e) => e.kind === "swish" || e.kind === "lamp");
  const ripple = (t) => {
    let v = R.base;
    for (const e of swishes) {
      const end = e.t + (e.dur ?? 0);
      if (t < e.t) continue;
      const during = t <= end ? Math.sin(Math.PI * clamp((t - e.t) / Math.max(0.1, end - e.t))) : 0;
      const after = t > end ? Math.exp(-(t - end) / R.tau) : 0;
      v += R.swish * Math.max(during * 0.6, after) * Math.min(1, (e.dist ?? 1) / 2);
    }
    return Math.min(v, R.max ?? 1.4);
  };
  return { home, lamp, pose, events, ripple, actors };
}

// ------------------------------------------------------------------ cut-out shapes (local metres, y up)
/** Plain 2D polygon helpers for cut-out designs. A part's cut = { fill: [poly], strokes: [{ pts, w }], holes: [{ poly, gel }] }. */
export const cut = {
  poly: (pts) => pts.map((p) => [p[0], p[1]]),
  rect: (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  ellipse: (cx, cy, rx, ry, n = 40, a0 = 0) => Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * 2 * Math.PI; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  }),
  circle: (cx, cy, r, n = 48) => cut.ellipse(cx, cy, r, r, n),
  diamond: (cx, cy, w, h) => [[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]],
  star: (cx, cy, r1, r2, n = 5, a0 = Math.PI / 2) => Array.from({ length: 2 * n }, (_, i) => {
    const a = a0 + (i * Math.PI) / n, r = i % 2 ? r2 : r1; return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }),
  /** crescent: the part of circle (cx, cy, r) not covered by the same circle shifted by off [dx, dy] (|off| < 2r) */
  crescent: (cx, cy, r, off, n = 40) => {
    const d = Math.hypot(off[0], off[1]), ang = Math.atan2(off[1], off[0]);
    const h = Math.acos(Math.min(1, d / (2 * r))); // intersection points sit at ang ± h on the first circle
    const out = [];
    for (let i = 0; i <= n; i++) { const a = ang + h + (i / n) * (2 * Math.PI - 2 * h); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    const ox = cx + off[0], oy = cy + off[1];
    for (let i = 1; i < n; i++) { const a = ang + Math.PI + h - (i / n) * 2 * h; out.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]); }
    return out;
  },
  /** leaf / petal: pointed ellipse from a to b with half-width w */
  leaf: (a, b, w, n = 16) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, out = [];
    for (let i = 0; i <= n; i++) { const u = i / n, h = Math.sin(Math.PI * u) * w; out.push([a[0] + dx * u + nx * h, a[1] + dy * u + ny * h]); }
    for (let i = n - 1; i > 0; i--) { const u = i / n, h = Math.sin(Math.PI * u) * w; out.push([a[0] + dx * u - nx * h, a[1] + dy * u - ny * h]); }
    return out;
  },
  /** hills: a band from x0 to x1 with a bumpy top (bumps arcs), bottom at y0 */
  hills: (x0, x1, y0, h, bumps = 3, { seed = 1, step = 0.04 } = {}) => {
    const out = [[x0, y0]];
    const n = Math.max(8, Math.round((x1 - x0) / step));
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = lerp(x0, x1, u);
      const ph = seed * 1.7;
      const y = y0 + h * (0.55 + 0.32 * Math.sin(u * bumps * Math.PI * 2 + ph) + 0.13 * Math.sin(u * bumps * 5.3 * Math.PI + ph * 2.3));
      out.push([x, y]);
    }
    out.push([x1, y0]);
    return out;
  },
  /** zigzag band (folk-neutral border trim): triangles along a line */
  zigzag: (x0, x1, y, h, n) => {
    const out = [[x0, y]];
    for (let i = 0; i < n; i++) { const a = lerp(x0, x1, i / n), b = lerp(x0, x1, (i + 1) / n); out.push([(a + b) / 2, y + h], [b, y]); }
    return out;
  },
  /** title(text, cap, { weight = .2 (× cap), letterSpacing }) -> strokes for a cut-out title in the kit stroke font */
  title: (text, cap, { weight = 0.2, letterSpacing = 0.3, y = 0 } = {}) => {
    const L = layoutStrokeText(text, cap, { letterSpacing, bendRadius: 0.05 });
    return { strokes: L.chars.flatMap((c) => c.strokes.map((s) => ({ pts: s.map((p) => [p[0], p[1] + y]), w: weight * cap }))), width: L.width };
  },
};

/** cutBounds(cut, pad = 0) -> [minx, miny, maxx, maxy] of a part's fill polygons + strokes (+ pad). */
export function cutBounds(c, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p, r = 0) => { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); };
  for (const poly of c.fill ?? []) for (const p of poly) add(p);
  for (const s of c.strokes ?? []) for (const p of s.pts) add(p, s.w / 2);
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/** themeFromBeats(beats, phrases { [beatId]: { notes, step, offset, gain } }) -> theme entries for planShow (t from BEATS). */
export function themeFromBeats(beats, phrases) {
  return beats.filter((b) => phrases[b.id]).map((b) => ({ id: b.id, t: b.t + (phrases[b.id].offset ?? 0.1), ...phrases[b.id] }));
}
