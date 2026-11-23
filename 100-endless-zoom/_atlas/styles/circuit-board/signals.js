// styles/circuit-board/signals.js — the circuit-board planner: octilinear trace routing, part pin positions,
// the signal (pulse) schedule and the macro tracking camera, as pure functions. NO THREE, no window, no DOM:
// style.js imports it for the picture AND scene.config.js imports it, so the SCORE (launch blips, via ticks,
// arrival clicks, LED pops) and the camera keys come from the same plan, and render-sfx / export-spec run in Node.
// Board coordinates: x right, z toward the viewer, metres; the board top is y = 0.
import { clamp, smoothstep, lerp, toEase } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";

const S = STYLE_SPEC;
const EPS = 1e-6;
const P2 = (p) => (Array.isArray(p) ? p : p.at);

// ============================================================================ routing =================
/**
 * octiRoute(waypoints, { chamfer, lead }) -> route
 *   waypoints: [[x, z] | { at: [x, z], via?: true, lead?: "straight"|"diag" }]. Between two waypoints the
 *   router goes straight along the major axis and diagonally (45°) for the rest — `lead` says which comes first
 *   ("straight" default, set per leg on the leg's END waypoint). 90° corners are then cut into two 45° bends of
 *   `chamfer` metres (real PCB style). Waypoints flagged `via` become vias.
 *   route = { pts: [[x, z]], cum: [s], length, vias: [{ at, s }], from, to }
 */
export function octiRoute(waypoints, { chamfer = S.trace.chamfer, lead = "straight" } = {}) {
  const W = waypoints.map((w) => (Array.isArray(w) ? { at: w } : w));
  let pts = [W[0].at.slice()];
  for (let i = 1; i < W.length; i++) {
    const a = pts[pts.length - 1], b = W[i].at;
    const dx = b[0] - a[0], dz = b[1] - a[1], ax = Math.abs(dx), az = Math.abs(dz);
    const diag = Math.min(ax, az), straight = Math.max(ax, az) - diag;
    if (diag > EPS && straight > EPS) {
      const sx = Math.sign(dx), sz = Math.sign(dz);
      const st = ax > az ? [sx * straight, 0] : [0, sz * straight];
      const mid = (W[i].lead ?? lead) === "diag" ? [a[0] + sx * diag, a[1] + sz * diag] : [a[0] + st[0], a[1] + st[1]];
      pts.push(mid);
    }
    pts.push(b.slice());
  }
  pts = dedupe(pts);
  if (chamfer > 0) pts = chamferCorners(pts, chamfer);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const route = { pts, cum, length: cum[cum.length - 1], from: pts[0], to: pts[pts.length - 1] };
  route.vias = W.filter((w) => w.via).map((w) => ({ at: w.at.slice(), s: projectS(route, w.at) }));
  return route;
}

function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1];
    if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) > EPS) out.push(pts[i]);
  }
  // drop collinear interior points
  const o2 = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const a = o2[o2.length - 1], b = out[i], c = out[i + 1];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) > 1e-9) o2.push(b);
  }
  if (out.length > 1) o2.push(out[out.length - 1]);
  return o2;
}

function chamferCorners(pts, c) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(n[0] - b[0], n[1] - b[1]);
    const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], d2 = [(n[0] - b[0]) / l2, (n[1] - b[1]) / l2];
    const dot = d1[0] * d2[0] + d1[1] * d2[1];
    if (Math.abs(dot) < 0.05) { // a right angle: cut it into two 45° bends
      const k = Math.min(c, l1 * 0.45, l2 * 0.45);
      out.push([b[0] - d1[0] * k, b[1] - d1[1] * k], [b[0] + d2[0] * k, b[1] + d2[1] * k]);
    } else out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** projectS(route, [x, z]) -> arc length of the closest point on the route. */
export function projectS(route, p) {
  let best = { d: Infinity, s: 0 };
  const { pts, cum } = route;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz || 1;
    const u = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / L2);
    const d = Math.hypot(a[0] + vx * u - p[0], a[1] + vz * u - p[1]);
    if (d < best.d) best = { d, s: cum[i - 1] + u * Math.sqrt(L2) };
  }
  return best.s;
}

/** routePoint(route, s) -> { at: [x, z], dir: [dx, dz] } (s clamped to the route). */
export function routePoint(route, s) {
  const { pts, cum } = route;
  s = clamp(s, 0, route.length);
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, u = (s - cum[i - 1]) / L;
  return { at: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
}

// ============================================================================ parts / pins ============
/**
 * Part specs (plain data, shared by scene.config.js and the 3D factories):
 *   { kind: "qfp", at, body: [w, d, h], perSide, pitch, name }      pins on all four sides
 *   { kind: "soic", at, body: [w, d, h], perSide, pitch, name }     pins on the N (-z) and S (+z) long sides
 *   { kind: "header", at, pins, axis: "x"|"z" }                     through-hole pin header
 *   { kind: "resistor"|"capacitor"|"led", at, axis: "x"|"z" }       0805-size two-pad parts
 * partPin(part, side, i) -> [x, z] pad centre in board coordinates.
 *   qfp/soic sides: "W" "E" (i runs along +z), "N" "S" (i runs along +x). header: side ignored, i = pin.
 *   two-pad parts: side "a" (-axis end) | "b" (+axis end).
 */
export function partPin(part, side, i = 0) {
  const [x0, z0] = part.at;
  const C = S.chip;
  if (part.kind === "qfp" || part.kind === "soic") {
    const [w, d] = part.body, n = part.perSide, p = part.pitch;
    const off = (i - (n - 1) / 2) * p;
    const ox = w / 2 + C.padOut, oz = d / 2 + C.padOut;
    if (side === "W") return [x0 - ox, z0 + off];
    if (side === "E") return [x0 + ox, z0 + off];
    if (side === "N") return [x0 + off, z0 - oz];
    return [x0 + off, z0 + oz];
  }
  if (part.kind === "header") {
    const H = S.header, off = (i - (part.pins - 1) / 2) * H.pitch;
    return part.axis === "x" ? [x0 + off, z0] : [x0, z0 + off];
  }
  const L = (part.kind === "led" ? S.led.length : S.passive.length) / 2 + 0.02;
  const sgn = side === "a" ? -1 : 1;
  return part.axis === "z" ? [x0, z0 + sgn * L] : [x0 + sgn * L, z0];
}

/** chipPads(part) -> [{ side, i, at }] every pad of a qfp/soic. */
export function chipPads(part) {
  const sides = part.kind === "soic" ? ["N", "S"] : ["W", "E", "N", "S"];
  const out = [];
  for (const side of sides) for (let i = 0; i < part.perSide; i++) out.push({ side, i, at: partPin(part, side, i) });
  return out;
}

// ============================================================================ signal plan =============
/**
 * planSignals(nets, { speed }) -> { pulses, byId, events, arrive(id), launch(id) }
 *   nets: [{ id, route, start?: t | after?: netId, delay = 0, speed?, target?: partId, targetKind?, gain? }]
 *   A pulse launches at `start` (or `delay` after the `after` net's pulse ARRIVES) and runs the route at
 *   constant speed. events (sorted): { t, kind: "launch"|"via"|"arrive", net, at, target?, targetKind?, gain }.
 */
export function planSignals(nets, { speed = S.pulse.speed } = {}) {
  const byId = {};
  const pulses = [];
  for (const n of nets) {
    let t0 = n.start;
    if (t0 == null) {
      const prev = byId[n.after];
      if (!prev) throw new Error(`planSignals: net ${n.id} runs after unknown net ${n.after}`);
      t0 = prev.t1 + (n.delay ?? 0);
    }
    const v = n.speed ?? speed;
    const p = { ...n, t0, speed: v, length: n.route.length, t1: t0 + n.route.length / v };
    p.vias = n.route.vias.map((vv) => ({ ...vv, t: t0 + vv.s / v }));
    byId[n.id] = p;
    pulses.push(p);
  }
  const events = [];
  for (const p of pulses) {
    const g = p.gain ?? 1;
    events.push({ t: p.t0, kind: "launch", net: p.id, at: p.route.from, gain: g, travel: p.t1 - p.t0 });
    for (const v of p.vias) events.push({ t: v.t, kind: "via", net: p.id, at: v.at, gain: g });
    events.push({ t: p.t1, kind: "arrive", net: p.id, at: p.route.to, target: p.target, targetKind: p.targetKind, gain: g });
  }
  events.sort((a, b) => a.t - b.t || a.net.localeCompare(b.net));
  const arrive = (id) => byId[id].t1;
  const launch = (id) => byId[id].t0;
  return { pulses, byId, events, arrive, launch };
}

/**
 * pulseAt(t, pulse, { tail }) -> { head (m along the route; may run past the end so the tail drains into
 *   the pad), level (0..1), powered (0..1 afterglow level), active }
 */
export function pulseAt(t, p, { tail = S.pulse.tail } = {}) {
  if (t < p.t0) return { head: 0, level: 0, powered: 0, active: false };
  const head = (t - p.t0) * p.speed;
  const drain = p.length + tail;
  const level = smoothstep(p.t0, p.t0 + 0.08, t) * (1 - smoothstep(drain / p.speed + p.t0 - 0.15, drain / p.speed + p.t0, t));
  return { head: Math.min(head, drain), level, powered: smoothstep(p.t0, p.t0 + 0.3, t), active: level > 0.001 };
}

/** headPoint(t, pulse) -> [x, z] of the pulse head (clamped to the route). */
export const headPoint = (t, p) => routePoint(p.route, clamp((t - p.t0) * p.speed, 0, p.length)).at;

/** powerAt(t, on, { rise = .25, from = 0 }) -> 0..1 smooth switch-on (0 before `on`). */
export const powerAt = (t, on, { rise = 0.25 } = {}) => smoothstep(on, on + rise, t);

/** flashAt(t, on, dur) -> 0..1 quick flash (via flashes, pad hits). */
export function flashAt(t, on, dur = S.pulse.viaFlash.dur) {
  if (t < on) return 0;
  const u = (t - on) / dur;
  return u > 1 ? 0 : smoothstep(0, 0.12, u) * (1 - smoothstep(0.12, 1, u));
}

/** revealAt(t, on, dur = spec.silk.wipe) -> 0..1 silkscreen print-on wipe progress (eased). */
export const revealAt = (t, on, dur = S.silk.wipe) => toEase("inOutSine")(clamp((t - on) / dur));

// ============================================================================ camera ==================
/**
 * Macro tracking camera. shots (in time order): {
 *   t, blend = .8 (s, transition INTO this shot, centred on t),
 *   kind: "hold" (focus: [x, y, z]) | "track" (net: id, lead = 0 m ahead of the head, y = .02),
 *   dist, az (deg; 0 = looking from +z, + = from the +x side), el (deg above the board), fov }
 * cameraAt(t, shots, plan) -> { pos, target, fov } — each shot is evaluated live (a track shot follows the
 *   pulse head) and shots cross-fade with a smootherstep over `blend`, so the camera is C1 and a pure f(t).
 */
export function cameraAt(t, shots, plan) {
  const val = (sh) => {
    let target;
    if (sh.kind === "track") {
      const p = plan.byId[sh.net];
      const s = clamp((t - p.t0) * p.speed + (sh.lead ?? 0), 0, p.length);
      const a = routePoint(p.route, s).at;
      target = [a[0] + (sh.offset?.[0] ?? 0), sh.y ?? 0.02, a[1] + (sh.offset?.[1] ?? 0)];
    } else target = sh.focus.slice();
    return { target, dist: sh.dist, az: sh.az, el: sh.el, fov: sh.fov };
  };
  let v = val(shots[0]);
  for (let k = 1; k < shots.length; k++) {
    const sh = shots[k], b = sh.blend ?? 0.8;
    if (t <= sh.t - b / 2) break;
    const u = clamp((t - (sh.t - b / 2)) / b), w = u * u * u * (u * (u * 6 - 15) + 10);
    const n = val(sh);
    v = { target: v.target.map((x, i) => lerp(x, n.target[i], w)), dist: lerp(v.dist, n.dist, w), az: lerp(v.az, n.az, w), el: lerp(v.el, n.el, w), fov: lerp(v.fov, n.fov, w) };
  }
  const az = (v.az * Math.PI) / 180, el = (v.el * Math.PI) / 180;
  const pos = [v.target[0] + v.dist * Math.sin(az) * Math.cos(el), v.target[1] + v.dist * Math.sin(el), v.target[2] + v.dist * Math.cos(az) * Math.cos(el)];
  return { pos, target: v.target, fov: v.fov };
}

/** cameraKeys(shots, plan, { t0 = 0, t1, fps = 30 }) -> kit camera-rig keys sampled every frame (ease linear). */
export function cameraKeys(shots, plan, { t0 = 0, t1, fps = 30 } = {}) {
  const keys = [];
  const n = Math.round((t1 - t0) * fps);
  const r = (x) => Math.round(x * 1e5) / 1e5;
  for (let k = 0; k <= n; k++) {
    const t = t0 + k / fps, c = cameraAt(t, shots, plan);
    keys.push({ t: r(t), pos: c.pos.map(r), target: c.target.map(r), fov: r(c.fov), ease: "linear" });
  }
  return keys;
}

// ============================================================================ sound ===================
/**
 * signalVoices(o) -> voices map for kit/schedule.scoreFromEvents(plan.events, voices).
 *   launch = a short rising blip + a gliding whir for the trip; via = a tick; arrive = a click plus
 *   a chime (chip) or a pop + sparkle (LED). Gains scale by the event's `gain`.
 */
export function signalVoices({ level = 1 } = {}) {
  return {
    launch: (e) => [
      { type: "blip", notes: [0, 7], dur: 0.05, pitch: 1.6, gain: 0.16 * level * e.gain },
      { type: "whir", dur: Math.max(0.3, e.travel), hz: 420, hz2: 760, grit: 0.08, gain: 0.07 * level * e.gain },
    ],
    via: (e) => [{ type: "tick", pitch: 1.4, gain: 0.2 * level * e.gain }],
    arrive: (e) => e.targetKind === "led"
      ? [{ type: "pop", pitch: 1.3, gain: 0.32 * level * e.gain }, { type: "sparkle", dur: 0.9, pitch: 1.2, gain: 0.07 * level * e.gain }]
      : [{ type: "click", pitch: 0.9, gain: 0.3 * level * e.gain }, { type: "chime", dur: 1.8, pitch: e.targetKind === "memory" ? 0.75 : 0.6, gain: 0.16 * level * e.gain }],
  };
}
