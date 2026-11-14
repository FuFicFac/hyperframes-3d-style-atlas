// styles/star-chart/skyplan.js — the Star Chart planner. PURE: no THREE, no window, no DOM (imports only kit/time.js and
// kit/framing.js), so style.js (picture) and scene.config.js (camera keys, framing gate, SCORE) read the same plan.
//
// The sky is INVENTED and a pure function of time:
//   * a seeded star catalogue on the unit sphere (directions, magnitudes, colours, twinkle phases) — never the real sky;
//   * the celestial sphere turns about a pole at altitude `lat` toward the north (world +Z): world(c, t) = Rx(β)·Ry(-θ(t))·c,
//     β = 90° - lat, θ(t) a closed-form spin (fast "time-lapse" at the start, easing to a slow drift);
//   * constellations are authored in WORLD alt/az at a reference time (where you want them on screen) and converted to
//     celestial coordinates, so they rise, drift and set with everything else;
//   * every highlight, line draw, figure fade, name write, pointer sweep, link and shooting star is an event on one clock.
//
// Frames: world = Y up, observer at the origin looking south (-Z); +X = west (screen right), -X = east (screen left).
// az is measured from SOUTH toward WEST in degrees (az < 0 = left of south), alt above the horizon in degrees.
// Celestial "local" frame = the frame of the turning group in style.js: local +Y = the pole, local -Z = the meridian at t = 0.
import { rng, clamp, smoothstep, ease } from "../../kit/time.js";
import { sampleCameraKeys, projectPoint, cameraBasis } from "../../kit/framing.js";

export const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ vector maths
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const k = 1 / (Math.hypot(a[0], a[1], a[2]) || 1); return [a[0] * k, a[1] * k, a[2] * k]; },
};
const { add, sub, mul, dot, cross, norm } = v3;

/** slerp(a, b, u) between unit vectors (great-circle interpolation). */
export function slerp(a, b, u) {
  const c = clamp(dot(a, b), -1, 1), w = Math.acos(c);
  if (w < 1e-6) return norm(add(a, mul(sub(b, a), u)));
  const s = Math.sin(w);
  return add(mul(a, Math.sin((1 - u) * w) / s), mul(b, Math.sin(u * w) / s));
}
/** angle between unit vectors (rad). */
export const angle = (a, b) => Math.acos(clamp(dot(a, b), -1, 1));

// ------------------------------------------------------------------------------------------------ the turning sky
/** θ(t) in radians: spin rate eases from w0 to w1 deg/s with time constant tau (closed form, no accumulation). */
export function spinAngle(S, t) {
  const { w0, w1, tau } = S.sky.spin;
  return D2R * (w1 * t + (w0 - w1) * tau * (1 - Math.exp(-t / tau)));
}
/** current spin rate (rad/s). */
export function spinRate(S, t) {
  const { w0, w1, tau } = S.sky.spin;
  return D2R * (w1 + (w0 - w1) * Math.exp(-t / tau));
}
export const tilt = (S) => (90 - S.sky.lat) * D2R;

/** celestial local -> world direction at time t (Rx(β)·Ry(-θ)). Works for any vector (directions and tangents). */
export function toWorld(S, c, t) {
  const a = -spinAngle(S, t), ca = Math.cos(a), sa = Math.sin(a);
  const x = c[0] * ca + c[2] * sa, y = c[1], z = -c[0] * sa + c[2] * ca;
  const b = tilt(S), cb = Math.cos(b), sb = Math.sin(b);
  return [x, y * cb - z * sb, y * sb + z * cb];
}
/** world -> celestial local at time t (inverse of toWorld). */
export function fromWorld(S, w, t) {
  const b = -tilt(S), cb = Math.cos(b), sb = Math.sin(b);
  const x = w[0], y = w[1] * cb - w[2] * sb, z = w[1] * sb + w[2] * cb;
  const a = spinAngle(S, t), ca = Math.cos(a), sa = Math.sin(a);
  return [x * ca + z * sa, y, -x * sa + z * ca];
}
/** altAz(az, alt) in degrees -> world unit vector. */
export function altAz(az, alt) {
  const A = az * D2R, h = alt * D2R;
  return [Math.cos(h) * Math.sin(A), Math.sin(h), -Math.cos(h) * Math.cos(A)];
}
/** world unit vector -> { az, alt } degrees. */
export function toAltAz(w) {
  return { az: Math.atan2(w[0], -w[2]) / D2R, alt: Math.asin(clamp(w[1], -1, 1)) / D2R };
}
/** screen tangent basis at a world direction: R = screen right, U = screen up (world-up projected). */
export function tangentBasis(w) {
  const R = norm(cross(w, [0, 1, 0]));
  return { R, U: cross(R, w) };
}
/** pole (unit, celestial local) of the great circle through two world alt/az points at time t. */
export function circlePole(S, through, t) {
  const a = fromWorld(S, altAz(...through[0]), t), b = fromWorld(S, altAz(...through[1]), t);
  return norm(cross(a, b));
}
/** great circle (polyline of unit vectors) about pole p, n segments. */
export function greatCircle(p, n = 180) {
  const ref = Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(p, ref)), e2 = cross(p, e1);
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; out.push(add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)))); }
  return out;
}

// ------------------------------------------------------------------------------------------------ the catalogue
/**
 * catalogue(S) -> { n, dir: [[x,y,z]] (celestial local unit), mag: [], color: [hex], phase: [], rate: [], band: pole }
 *   Seeded. A share of the stars crowds a gaussian band about the Milky-Way great circle; magnitudes follow
 *   N(<m) ∝ 10^(0.5 m) (few bright, many faint); colours drawn from spec.catalogue.colors weights.
 */
export function catalogue(S) {
  const C = S.catalogue, r = rng(C.seed);
  const pole = circlePole(S, S.milkyWay.through, S.milkyWay.at);
  const ref = Math.abs(pole[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(pole, ref)), e2 = cross(pole, e1);
  const wsum = C.colors.reduce((s, c) => s + c[1], 0);
  const out = { n: C.count, dir: [], mag: [], color: [], phase: [], rate: [], pole };
  for (let i = 0; i < C.count; i++) {
    let d;
    if (r.chance(C.bandFrac)) {
      const lon = r.range(0, TAU), lat = r.gaussian(0, C.bandSigma * D2R);
      d = norm(add(add(mul(e1, Math.cos(lon) * Math.cos(lat)), mul(e2, Math.sin(lon) * Math.cos(lat))), mul(pole, Math.sin(lat))));
    } else {
      const z = r.range(-1, 1), ph = r.range(0, TAU), q = Math.sqrt(1 - z * z);
      d = [q * Math.cos(ph), z, q * Math.sin(ph)];
    }
    const u = Math.max(1e-6, r.next());
    const mag = Math.max(C.magMin, C.magMax + 2 * Math.log10(u));
    let pick = r.range(0, wsum), col = C.colors[0][0];
    for (const [hex, w] of C.colors) { if (pick < w) { col = hex; break; } pick -= w; }
    out.dir.push(d); out.mag.push(mag); out.color.push(col);
    out.phase.push(r.range(0, TAU)); out.rate.push(r.range(S.twinkle.rate[0], S.twinkle.rate[1]));
  }
  return out;
}
/** point size (px) and linear intensity of a star of magnitude m. */
export function starLook(S, m) {
  const C = S.catalogue;
  return {
    size: C.sizeMin + C.sizeK * Math.max(0, C.magMax - m),
    flux: C.intensity * Math.pow(10, -0.4 * (m - C.magRef) * C.fluxGamma),
  };
}

// ------------------------------------------------------------------------------------------------ engraved figures
// 2D polylines in constellation units (x right, y up; the constellation's stars live in about [-1, 1]).
const arc = (cx, cy, rx, ry, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const bez = (p0, p1, p2, p3, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const u = i / n, v = 1 - u;
  return [0, 1].map((k) => v * v * v * p0[k] + 3 * v * v * u * p1[k] + 3 * v * u * u * p2[k] + u * u * u * p3[k]);
});
const seg = (a, b) => [a, b];
const PI = Math.PI;
/** FIGURES[name]() -> [polyline2D]. Original engraved-atlas outlines; add your own as plain functions. */
export const FIGURES = {
  drum() {
    const out = [
      arc(0, 0.3, 1.05, 0.3, 0, TAU, 48),                       // drumhead
      arc(0, 0.2, 1.05, 0.3, PI, TAU, 28),                      // upper hoop (front half)
      arc(0, -0.72, 1.05, 0.3, PI, TAU, 28),                    // bottom rim (front half)
      arc(0, -0.62, 1.05, 0.3, PI, TAU, 28),                    // lower hoop
      seg([-1.05, 0.3], [-1.05, -0.72]), seg([1.05, 0.3], [1.05, -0.72]),
    ];
    // tension cords: a zigzag between the hoops across the front
    const zz = [];
    for (let k = 0; k <= 8; k++) { const a = PI + (k / 8) * PI; const up = k % 2 === 0; zz.push([1.05 * Math.cos(a), (up ? 0.2 : -0.62) + 0.3 * Math.sin(a)]); }
    out.push(zz);
    // engraved hatching on the shadow side
    for (let k = 0; k < 5; k++) { const x = -0.98 + k * 0.07, top = 0.2 + 0.3 * -Math.sqrt(Math.max(0, 1 - (x / 1.05) ** 2)); out.push(seg([x, top - 0.04], [x, -0.62 + 0.3 * -Math.sqrt(Math.max(0, 1 - (x / 1.05) ** 2)) + 0.06])); }
    // two sticks resting across the head, ball tips
    out.push(seg([0.25, 0.42], [1.22, 1.08]), arc(1.27, 1.12, 0.06, 0.06, 0, TAU, 12));
    out.push(seg([-0.3, 0.45], [-1.15, 1.02]), arc(-1.2, 1.06, 0.06, 0.06, 0, TAU, 12));
    return out;
  },
  lyre() {
    const L = bez([-0.32, -0.72], [-0.95, -0.55], [-0.35, 0.25], [-0.82, 0.86], 30);
    const Rr = L.map(([x, y]) => [-x, y]);
    const out = [
      L, Rr,
      arc(-0.92, 0.95, 0.12, 0.12, -0.2 * PI, 1.2 * PI, 16),           // curled horn tips
      arc(0.92, 0.95, 0.12, 0.12, -0.2 * PI, -1.2 * PI, 16),
      bez([-0.8, 0.66], [-0.3, 0.58], [0.3, 0.58], [0.8, 0.66], 20),    // yoke (below the Hook-Chorus line)
      arc(0, -0.82, 0.52, 0.2, 0, TAU, 40),                             // sound box
      arc(0, -0.82, 0.38, 0.12, 0, TAU, 32),
    ];
    for (const x of [-0.24, -0.08, 0.08, 0.24]) out.push(seg([x, -0.68], [x, 0.6]));   // strings
    for (let k = 0; k < 6; k++) { const p = L[8 + k * 3]; out.push(seg([p[0] - 0.02, p[1] - 0.05], [p[0] - 0.13, p[1] + 0.04])); } // hatching
    return out;
  },
  compass() {
    const out = [arc(0, 0, 1, 1, 0, TAU, 64), arc(0, 0, 0.85, 0.85, 0, TAU, 56)];
    for (let k = 0; k < 4; k++) { const a = (k * PI) / 2; out.push([[0, 0], [Math.cos(a) * 1.2, Math.sin(a) * 1.2]]); out.push([[Math.cos(a + PI / 4) * 0.25, Math.sin(a + PI / 4) * 0.25], [Math.cos(a) * 1.2, Math.sin(a) * 1.2], [Math.cos(a - PI / 4) * 0.25, Math.sin(a - PI / 4) * 0.25]]); }
    return out;
  },
};

// ------------------------------------------------------------------------------------------------ the plan
/**
 * planSky(S, input) -> plan (plain data + query functions). input:
 *   constellations: [{ id, name, centre: [az, alt], at: tRef (s), scale: deg per unit,
 *                      stars: [{ name, xy: [x, y], mag, side?: "r"|"l" }], lines: [[i, j]], order?: [star indices],
 *                      light: t first star, step: s between stars, figure: FIGURES key | [polyline2D], figureAt, figureXY?, figureScale?,
 *                      plateAt, plateXY: [x, y] (units) }]
 *   links:   [{ a: [ci, si], b: [ci, si], at, dur }]
 *   pointer: [{ t, star: [ci, si] } | { t, link: k, dur }]   (sweeps between stops; arrives AT t)
 *   pointerOff: t     shooting: [{ t, dur, from: [az, alt], to: [az, alt] }]
 *   grid: { at, dur }   ecliptic: { at, dur }   finale: t (everything brightens)
 */
export function planSky(S, input) {
  const L = S.lines;
  const plan = { S, constellations: [], links: [], events: [], shooting: [], pointer: null, grid: input.grid, ecliptic: input.ecliptic, finale: input.finale ?? Infinity };
  plan.eclipticPole = circlePole(S, S.ecliptic.through, S.ecliptic.at);
  plan.milkyWayPole = circlePole(S, S.milkyWay.through, S.milkyWay.at);

  input.constellations.forEach((c, ci) => {
    const C = altAz(...c.centre), { R, U } = tangentBasis(C), s = c.scale * D2R;
    const W = (xy) => norm(add(C, add(mul(R, xy[0] * s), mul(U, xy[1] * s))));
    const loc = (w) => fromWorld(S, w, c.at);
    const order = c.order ?? c.stars.map((_, i) => i);
    const lightT = new Array(c.stars.length);
    order.forEach((si, k) => { lightT[si] = c.light + k * c.step; });
    const stars = c.stars.map((st, i) => ({ ...st, i, dir: loc(W(st.xy)), lit: lightT[i] }));
    // lines: a great-circle arc between the two stars, shortened by the atlas gap at both ends; drawn after the later star lights
    const lines = c.lines.map(([i, j], k) => {
      const a = stars[i].dir, b = stars[j].dir, w = angle(a, b), g = (L.gapDeg * D2R) / Math.max(w, 1e-6);
      const n = Math.max(4, Math.ceil(w / (0.6 * D2R)));
      const pts = Array.from({ length: n + 1 }, (_, q) => slerp(a, b, g + (1 - 2 * g) * (q / n)));
      const at = Math.max(stars[i].lit, stars[j].lit) + L.delay;
      return { k, i, j, pts, at, end: at + L.dur };
    });
    // a ring round each star (engraved star symbol), drawn as it lights
    const rings = stars.map((st) => {
      const { R: r1, U: u1 } = tangentBasis(st.dir), rr = (L.ringDeg * D2R) * (1 + Math.max(0, 2 - st.mag) * 0.18);
      const pts = Array.from({ length: 33 }, (_, q) => { const a = PI / 2 + (q / 32) * TAU; return norm(add(st.dir, add(mul(r1, Math.cos(a) * rr), mul(u1, Math.sin(a) * rr)))); });
      return { pts, at: st.lit + 0.04, end: st.lit + 0.04 + L.ringDur };
    });
    const figXY = c.figureXY ?? [0, 0], figS = c.figureScale ?? 1;
    const figure2D = (typeof c.figure === "string" ? FIGURES[c.figure]() : c.figure ?? []);
    const figure = figure2D.map((pl) => pl.map(([x, y]) => loc(W([figXY[0] + x * figS, figXY[1] + y * figS]))));
    const plateXY = c.plateXY ?? [0, -1.35];
    const frame = { C: loc(C), R: loc(R), U: loc(U), scale: s };        // tangent frame in celestial local (for labels)
    const con = {
      id: c.id, name: c.name, ci, at: c.at, stars, lines, rings, figure, frame,
      figureAt: c.figureAt, figureDur: S.figure.dur, plateAt: c.plateAt, plateDur: S.plate.writeDur,
      plate: { dir: loc(W(plateXY)), xy: plateXY },
      unitDir: (xy) => loc(W(xy)),
    };
    plan.constellations.push(con);
    stars.forEach((st) => plan.events.push({ t: st.lit, kind: "star", ci, si: st.i, mag: st.mag }));
    lines.forEach((ln) => plan.events.push({ t: ln.at, kind: "line", ci, k: ln.k, dur: L.dur }));
    plan.events.push({ t: c.figureAt, kind: "figure", ci });
    plan.events.push({ t: c.plateAt, kind: "plate", ci });
  });

  (input.links ?? []).forEach((lk, k) => {
    const A = plan.constellations[lk.a[0]].stars[lk.a[1]].dir, B = plan.constellations[lk.b[0]].stars[lk.b[1]].dir;
    const w = angle(A, B), g = (L.gapDeg * D2R) / w, n = Math.ceil(w / (0.5 * D2R));
    const pts = Array.from({ length: n + 1 }, (_, q) => slerp(A, B, g + (1 - 2 * g) * (q / n)));
    plan.links.push({ k, a: lk.a, b: lk.b, A, B, pts, at: lk.at, end: lk.at + lk.dur, dur: lk.dur });
    plan.events.push({ t: lk.at, kind: "link", k, dur: lk.dur });
    plan.events.push({ t: lk.at + lk.dur, kind: "linked", k });
  });

  // pointer: stops in celestial local; it sweeps (eased slerp) INTO each stop, arriving at stop.t; a link stop glides along the link
  if (input.pointer?.length) {
    const P = S.pointer, keys = [];
    for (const st of input.pointer) {
      if (st.link != null) {
        const lk = plan.links[st.link];
        keys.push({ t: st.t, dir: lk.A, ease: "inOutCubic" });
        keys.push({ t: st.t + st.dur, dir: lk.B, ease: "inOutSine" });
      } else {
        const d = plan.constellations[st.star[0]].stars[st.star[1]].dir;
        keys.push({ t: st.t, dir: d, ease: "inOutCubic" });
      }
    }
    // insert a hold before every sweep so the arrow rests on a star, then travels for `sweep` seconds
    const K = [];
    keys.forEach((k, i) => {
      if (i > 0 && k.ease === "inOutCubic") {
        const prev = K[K.length - 1], hold = Math.max(prev.t, k.t - P.sweep);
        if (hold > prev.t + 1e-6) K.push({ t: hold, dir: prev.dir, ease: "linear" });
      }
      K.push(k);
    });
    plan.pointer = { keys: K, on: K[0].t - P.fadeIn, off: input.pointerOff ?? Infinity };
    K.forEach((k, i) => { if (i > 0 && angle(K[i - 1].dir, k.dir) > 0.5 * D2R) plan.events.push({ t: K[i - 1].t, kind: "sweep", dur: k.t - K[i - 1].t }); });
  }

  (input.shooting ?? []).forEach((s, k) => {
    plan.shooting.push({ k, t: s.t, dur: s.dur, A: altAz(...s.from), B: altAz(...s.to) });
    plan.events.push({ t: s.t, kind: "shoot", k, dur: s.dur });
  });
  if (input.grid) plan.events.push({ t: input.grid.at, kind: "grid", dur: input.grid.dur });
  if (input.ecliptic) plan.events.push({ t: input.ecliptic.at, kind: "ecliptic", dur: input.ecliptic.dur });
  if (Number.isFinite(plan.finale)) plan.events.push({ t: plan.finale, kind: "finale" });
  plan.events.sort((a, b) => a.t - b.t);
  return plan;
}

// ------------------------------------------------------------------------------------------------ queries (f(t))
/** star highlight 0..~1.7: rises as it lights, flares, settles to 1; the finale lifts every star a little. */
export function starHighlight(plan, st, t) {
  const H = plan.S.hero;
  if (t < st.lit) return 0;
  const k = smoothstep(st.lit, st.lit + H.rise, t);
  const flare = t > st.lit + H.rise ? Math.exp(-(t - st.lit - H.rise) / H.flareDecay) : k;
  return k * (1 + H.flare * flare) + H.finaleBoost * smoothstep(plan.finale, plan.finale + 0.8, t);
}
/** a 0..1 progress on [a, b]. */
export const progress = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
/** plot clock for a set of timed polylines: { T0, T1, windows } so screenLines can draw each on its own interval. */
export function plotClock(items) {
  const T0 = Math.min(...items.map((x) => x.at)), T1 = Math.max(...items.map((x) => x.end));
  return { T0, T1, windows: items.map((x) => [(x.at - T0) / (T1 - T0), (x.end - T0) / (T1 - T0)]), p: (t) => progress(t, T0, T1) };
}
/** figure: { draw 0..1, level 0..1 }. */
export function figureState(plan, con, t) {
  const d = progress(t, con.figureAt, con.figureAt + con.figureDur);
  return { draw: ease.inOutSine(d), level: smoothstep(con.figureAt, con.figureAt + con.figureDur * 0.6, t) };
}
/** name plate write-on 0..1. */
export const plateState = (plan, con, t) => ease.inOutSine(progress(t, con.plateAt, con.plateAt + con.plateDur));
/** pointer: { vis 0..1, dir (celestial local), moving 0..1 }. */
export function pointerState(plan, t) {
  const P = plan.pointer;
  if (!P) return { vis: 0, dir: [0, 0, -1], moving: 0 };
  const K = P.keys;
  let dir = K[0].dir, moving = 0;
  if (t >= K[K.length - 1].t) dir = K[K.length - 1].dir;
  else if (t > K[0].t) for (let i = 0; i < K.length - 1; i++) {
    if (t >= K[i].t && t < K[i + 1].t) {
      const u = (t - K[i].t) / (K[i + 1].t - K[i].t);
      dir = slerp(K[i].dir, K[i + 1].dir, ease[K[i + 1].ease](u));
      moving = angle(K[i].dir, K[i + 1].dir) > 1e-4 ? Math.sin(Math.PI * u) : 0;
      break;
    }
  }
  const vis = smoothstep(P.on, P.on + plan.S.pointer.fadeIn, t) * (1 - smoothstep(P.off, P.off + 0.5, t));
  return { vis, dir, moving };
}
/** shooting star k at t -> { vis, head, tail } (world unit vectors) or null. */
export function shootingState(plan, k, t) {
  const s = plan.shooting[k], u = (t - s.t) / s.dur;
  if (u <= 0 || u >= 1) return null;
  const len = (plan.S.shooting.lenDeg * D2R) / angle(s.A, s.B);
  const h = ease.outQuad(u), tl = Math.max(0, h - len * Math.min(1, u * 3));
  return { vis: Math.sin(Math.PI * Math.pow(u, 0.7)), head: slerp(s.A, s.B, h), tail: slerp(s.A, s.B, tl) };
}

// ------------------------------------------------------------------------------------------------ camera + framing
/** points (world, radius R) of constellation ci at time t: stars + figure extent + plate. */
export function constellationPoints(plan, ci, t, { R = 100, figure = true, plate = true } = {}) {
  const con = plan.constellations[ci], S = plan.S, out = [];
  con.stars.forEach((st) => out.push(mul(toWorld(S, st.dir, t), R)));
  if (figure) con.figure.forEach((pl) => pl.forEach((d, q) => { if (q % 4 === 0) out.push(mul(toWorld(S, d, t), R)); }));
  if (plate) {
    const hw = (S.plate.widthUnits ?? 1.1);
    for (const dx of [-hw, hw]) for (const dy of [-0.18, 0.18]) out.push(mul(toWorld(S, con.unitDir([con.plate.xy[0] + dx, con.plate.xy[1] + dy]), t), R));
  }
  return out;
}
export function linkPoints(plan, k, t, R = 100) {
  return plan.links[k].pts.filter((_, q) => q % 3 === 0).map((d) => mul(toWorld(plan.S, d, t), R));
}
/**
 * fitShot(points, { pos, x: [x0, x1], y: [y0, y1], aspect, minFov, maxFov }) -> { pos, target, fov }
 *   Aims the (roll-free, up = +Y) camera so the points' gnomonic box sits inside the NDC window x × y.
 */
export function fitShot(points, o = {}) {
  const pos = o.pos ?? [0, 0, 0], aspect = o.aspect ?? 16 / 9, x = o.x ?? [-0.8, 0.8], y = o.y ?? [-0.5, 0.8];
  const dirs = points.map((p) => norm(sub(p, pos)));
  let T = norm(dirs.reduce((s, d) => add(s, d), [0, 0, 0])), th = 0.5;
  for (let it = 0; it < 6; it++) {
    const { R, U } = tangentBasis(T);
    let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
    for (const d of dirs) { const z = dot(d, T), X = dot(d, R) / z, Y = dot(d, U) / z; xa = Math.min(xa, X); xb = Math.max(xb, X); ya = Math.min(ya, Y); yb = Math.max(yb, Y); }
    th = Math.max((xb - xa) / ((x[1] - x[0]) * aspect), (yb - ya) / (y[1] - y[0]));
    const fmin = Math.tan(((o.minFov ?? 20) * D2R) / 2), fmax = Math.tan(((o.maxFov ?? 70) * D2R) / 2);
    th = clamp(th, fmin, fmax);
    const Xc = (xa + xb) / 2 - ((x[0] + x[1]) / 2) * th * aspect, Yc = (ya + yb) / 2 - ((y[0] + y[1]) / 2) * th;
    T = norm(add(T, add(mul(R, Xc), mul(U, Yc))));
  }
  return { pos, target: add(pos, mul(T, 100)), fov: +((2 * Math.atan(th)) / D2R).toFixed(3) };
}
/**
 * framingGate(keys, regions(t) -> [{ id, pts }], { duration, fov, x, y, dt }) -> { ok, worst, fails, spans }
 *   Replays the camera exactly (kit/framing sampleCameraKeys) and checks every required region stays inside the
 *   asymmetric window (x, y in NDC) — the caption band at the bottom included — mid-move as well as at the keys.
 */
export function framingGate(keys, regions, o = {}) {
  const { duration, fov = 50, x = [-0.9, 0.9], y = [-0.9, 0.9], dt = 1 / 30, drift = null } = o;
  const fails = [];
  let worst = { over: -Infinity };
  for (let i = 0; i <= Math.round(duration / dt); i++) {
    const t = +Math.min(duration, i * dt).toFixed(6);
    const cam = sampleCameraKeys(keys, t, { fov, drift });
    cam._basis = cameraBasis(cam);
    for (const r of regions(t)) {
      let over = -Infinity;
      for (const p of r.pts) {
        const [px, py, d] = projectPoint(cam, p);
        const o2 = d <= 0 ? Infinity : Math.max(x[0] - px, px - x[1], y[0] - py, py - y[1]);
        over = Math.max(over, o2);
      }
      if (over > worst.over) worst = { over: +over.toFixed(3), t, id: r.id };
      if (over > 0) fails.push({ t, id: r.id, over });
    }
  }
  const spans = [];
  for (const f of fails) {
    const s = spans.find((q) => q.id === f.id && f.t - q.to <= dt * 1.5 + 1e-9);
    if (s) { s.to = f.t; s.worst = Math.max(s.worst, f.over); } else spans.push({ id: f.id, from: f.t, to: f.t, worst: f.over });
  }
  return { ok: fails.length === 0, worst, fails, spans };
}

// ------------------------------------------------------------------------------------------------ sound
/**
 * skyVoices(sound) -> voices for kit/schedule.scoreFromEvents: soft glass pings per star pitched by brightness
 * (pentatonic: brighter = higher), a breath of air per line, a shimmer when a figure fades up, a low bell when a name
 * writes, a soft swish per pointer sweep, a riser into each link, a bright streak for a shooting star.
 */
export function skyVoices(snd) {
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  return {
    star: (e) => {
      const idx = Math.round(clamp((snd.ping.magTop - e.mag) / snd.ping.magStep, 0, PENTA.length - 1));
      return [{ type: "chime", dur: 2.2, gain: snd.ping.gain, pitch: snd.ping.pitch * Math.pow(2, PENTA[idx] / 12) }];
    },
    line: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.15, gain: snd.line.gain, pitch: snd.line.pitch, q: 2.4 }],
    figure: () => [{ type: "sparkle", dur: 1.2, notes: 7, gain: snd.figure.gain, pitch: snd.figure.pitch }],
    plate: () => [{ type: "chime", dur: 2.8, gain: snd.plate.gain, pitch: snd.plate.pitch }],
    sweep: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.3, e.dur), gain: snd.sweep.gain, pitch: snd.sweep.pitch, q: 1.2 }],
    link: (e) => [{ type: "riser", dur: e.dur, gain: snd.link.gain, pitch: snd.link.pitch }],
    linked: () => [{ type: "chime", dur: 3, gain: snd.linked.gain, pitch: snd.linked.pitch }, { type: "sparkle", dur: 1.4, notes: 9, gain: snd.linked.gain * 0.6, pitch: 1.1 }],
    shoot: (e) => [{ type: "whoosh", dir: "out", dur: e.dur + 0.3, gain: snd.shoot.gain, pitch: snd.shoot.pitch, q: 3 }, { type: "sparkle", dur: 0.8, notes: 5, gain: snd.shoot.gain * 0.5, pitch: 1.4, offset: 0.05 }],
    grid: (e) => [{ type: "sparkle", dur: e.dur, notes: 10, gain: snd.grid.gain, pitch: 0.8 }],
    ecliptic: () => [],
    finale: () => [{ type: "chime", dur: 3.2, gain: snd.linked.gain * 0.8, pitch: snd.plate.pitch * 1.5 }],
  };
}
