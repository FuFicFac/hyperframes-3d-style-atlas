// styles/laser-mirrors/beamplan.js — the beam planner: an exact 2D ray tracer over an optics bench + the hit plan.
// Pure and Node-safe: no THREE, no window, no DOM (imports only kit/time.js). Shared by the picture (style.js reads
// plan.beam(t) every frame) and the sound (scene.config.js turns plan.events() into SCORE), so a ping can never drift from
// the bounce it belongs to.
//
// Bench coordinates are 2D, top view: x to the right, y AWAY from the viewer (world = [x, beamHeight, -y]).
// A mirror is a zero-thickness two-sided segment: centre p, half-width `half`, `angle` = direction of its surface line
// (radians, mod pi). A target is an absorbing circle. The splitter is a circle that, once engaged, ends the incoming beam
// and emits child beams at fixed deflections from the incoming direction. Everything is a closed form of t:
// mirror angles are eased between SOLVED aim angles, the beam is traced from scratch for whatever t is asked.
import { clamp, ease as EASE } from "../../kit/time.js";

const EPS = 1e-7;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const rot = (a, r) => { const c = Math.cos(r), s = Math.sin(r); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; };
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** distance along the ray o + t d (d unit) to segment a-b, or Infinity */
export function raySegment(o, d, a, b) {
  const e = sub(b, a), den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-12) return Infinity;
  const w = sub(a, o);
  const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
  return t > EPS && u >= 0 && u <= 1 ? t : Infinity;
}
/** distance along the ray to the first crossing INTO circle (c, r), or Infinity (a ray starting inside ignores it) */
export function rayCircle(o, d, c, r) {
  const w = sub(o, c), b = dot(w, d), q = dot(w, w) - r * r;
  if (q <= 0) return Infinity;
  const disc = b * b - q;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > EPS ? t : Infinity;
}
/** mirror reflection of unit direction d in a surface whose line runs at `angle` */
export function reflect(d, angle) {
  const n = [-Math.sin(angle), Math.cos(angle)], k = 2 * dot(d, n);
  return norm([d[0] - k * n[0], d[1] - k * n[1]]);
}
/** surface angle (mod pi, in (-pi/2, pi/2]) a mirror at `at` needs to send a ray arriving from `from` on to `to` */
export function solveMirror(from, at, to) {
  const din = norm(sub(at, from)), dout = norm(sub(to, at));
  const n = sub(dout, din);
  if (len(n) < 1e-9) throw new Error("beamplan.solveMirror: straight-through is not a reflection");
  return wrapPi(Math.atan2(n[1], n[0]) + Math.PI / 2);
}
export const wrapPi = (a) => { let x = a % Math.PI; if (x > Math.PI / 2) x -= Math.PI; if (x <= -Math.PI / 2) x += Math.PI; return x; };
/** the representation of angle b (mod pi) nearest to a: the short way round for a two-sided mirror */
export const nearAngle = (a, b) => a + wrapPi(b - a);
export const mirrorEnds = (m) => { const e = [Math.cos(m.angle) * m.half, Math.sin(m.angle) * m.half]; return [sub(m.p, e), add(m.p, e)]; };

/**
 * trace(world, origin, dir, { color, maxBounces = 14 }) -> branches
 *   world = { bounds: { x0, x1, y0, y1 }, mirrors: [{ id, p, angle, half }], targets: [{ id, p, r }],
 *             blockers: [{ id, p, r }], splitter: { id, p, r, on, fan: [{ id, defl, color }] } | null }
 *   branch = { id, color, parent, pts: [[x, y], ...], cum: [0, ...], length, hits: [{ kind, id, p, s }], end: { kind, id, p, s } }
 * Branch 0 is the source beam; an engaged splitter ends it at the point nearest the splitter centre and adds one child
 * branch per fan entry (children ignore the splitter). hits = mirror bounces in order; end = target | wall | block | splitter.
 */
export function trace(world, origin, dir, o = {}) {
  const out = [];
  const run = (id, color, parent, from, d0, useSplitter) => {
    let p = from, d = norm(d0), s = 0;
    const br = { id, color, parent, pts: [p], cum: [0], length: 0, hits: [], end: null };
    out.push(br);
    const kids = [];
    for (let bounce = 0; bounce <= (o.maxBounces ?? 14); bounce++) {
      let best = Infinity, hit = null;
      for (const m of world.mirrors) {
        const [a, b] = mirrorEnds(m), t = raySegment(p, d, a, b);
        if (t < best) { best = t; hit = { kind: "mirror", m }; }
      }
      for (const g of world.targets) { const t = rayCircle(p, d, g.p, g.r); if (t < best) { best = t; hit = { kind: "target", m: g }; } }
      for (const g of world.blockers ?? []) { const t = rayCircle(p, d, g.p, g.r); if (t < best) { best = t; hit = { kind: "block", m: g }; } }
      const sp = world.splitter;
      if (useSplitter && sp && sp.on) { const t = rayCircle(p, d, sp.p, sp.r); if (t < best) { best = t; hit = { kind: "splitter", m: sp }; } }
      const B = world.bounds;
      const tw = Math.min(d[0] > 0 ? (B.x1 - p[0]) / d[0] : d[0] < 0 ? (B.x0 - p[0]) / d[0] : Infinity, d[1] > 0 ? (B.y1 - p[1]) / d[1] : d[1] < 0 ? (B.y0 - p[1]) / d[1] : Infinity);
      if (tw < best) { best = Math.max(tw, 0); hit = { kind: "wall", m: { id: "wall" } }; }
      if (!hit || !isFinite(best)) break;
      let q = add(p, mul(d, best));
      if (hit.kind === "splitter") { const tm = dot(sub(hit.m.p, p), d); best = tm; q = add(p, mul(d, tm)); }
      s += best;
      br.pts.push(q); br.cum.push(s);
      if (hit.kind === "mirror") { br.hits.push({ kind: "mirror", id: hit.m.id, p: q, s }); d = reflect(d, hit.m.angle); p = q; continue; }
      br.end = { kind: hit.kind, id: hit.m.id, p: q, s };
      if (hit.kind === "splitter") for (const f of hit.m.fan) kids.push([`${id}/${f.id}`, f.color, id, q, rot(d, f.defl)]);
      break;
    }
    br.length = s;
    if (!br.end) br.end = { kind: "lost", id: "lost", p: br.pts[br.pts.length - 1], s };
    for (const k of kids) run(k[0], k[1], k[2], k[3], k[4], false);
  };
  run("main", o.color ?? "main", null, origin, dir, true);
  return out;
}

/** the part of a traced branch within path length [0, limit]: { pts, head: [x, y] | null (still growing), full } */
export function clipBranch(br, limit) {
  if (limit >= br.length) return { pts: br.pts, head: null, full: true };
  if (limit <= 0) return { pts: [], head: null, full: false };
  const pts = [br.pts[0]];
  for (let i = 1; i < br.pts.length; i++) {
    if (br.cum[i] <= limit) { pts.push(br.pts[i]); continue; }
    const u = (limit - br.cum[i - 1]) / (br.cum[i] - br.cum[i - 1]);
    const h = [br.pts[i - 1][0] + (br.pts[i][0] - br.pts[i - 1][0]) * u, br.pts[i - 1][1] + (br.pts[i][1] - br.pts[i - 1][1]) * u];
    pts.push(h);
    return { pts, head: h, full: false };
  }
  return { pts, head: null, full: true };
}

/**
 * createPlan(layout, timing) -> plan
 *   layout = { bounds, source: { p, dir }, mirrors: [{ id, p, half, router? }], targets: [{ id, p, r, color }],
 *              blockers?, splitter?: { id, p, r, fan: [{ id, to: targetId, color }] },
 *              routes: { <name>: [mirrorId, ..., targetId] }, start: <route name> }
 *   timing = { power, launch, speed (m/s), turns: [{ t, dur, mirror, route, ease? }],
 *              split?: { t (rise starts), dur, engage (lift 0..1 at which the glass meets the beam), travel (s), ease? },
 *              end, scanHz = 240 }
 * Every mirror is aimed by solving its route (solveMirror); a `turn` re-aims one mirror at the angle another route needs.
 * plan.beam(t) traces the bench exactly as it stands at t; plan.events() / plan.glow / plan.flare come from one fine scan
 * of that same pure function (a precomputed plan, not a simulation: nothing is carried from frame to frame).
 */
export function createPlan(layout, timing) {
  const L = layout, T = { scanHz: 240, ...timing };
  const node = Object.fromEntries([...L.mirrors.map((m) => [m.id, m]), ...L.targets.map((g) => [g.id, g])]);
  // ---- solve the aim of every mirror on every route
  const aim = {}; // aim[mirrorId][route] = angle
  for (const [name, ids] of Object.entries(L.routes)) {
    const chain = [L.source.p, ...ids.map((id) => { if (!node[id]) throw new Error(`beamplan: route ${name} names unknown node ${id}`); return node[id].p; })];
    ids.forEach((id, i) => { if (i < ids.length - 1) (aim[id] ??= {})[name] = solveMirror(chain[i], chain[i + 1], chain[i + 2]); });
  }
  const turnsOf = (id) => T.turns.filter((u) => u.mirror === id).sort((a, b) => a.t - b.t);
  const keys = {}; // per mirror: [{ t, dur, a0, a1, ease }]
  const base = {};
  for (const m of L.mirrors) {
    const mine = aim[m.id] ?? {};
    const first = mine[L.start] ?? Object.values(mine)[0] ?? m.angle ?? 0;
    const fixedAngles = Object.values(mine);
    if (!turnsOf(m.id).length && fixedAngles.some((a) => Math.abs(wrapPi(a - first)) > 1e-6)) throw new Error(`beamplan: fixed mirror ${m.id} is on routes that need different angles; give it a turn`);
    base[m.id] = first;
    let a = first;
    keys[m.id] = turnsOf(m.id).map((u) => {
      if (mine[u.route] == null) throw new Error(`beamplan: mirror ${m.id} is not on route ${u.route}`);
      const k = { t: u.t, dur: u.dur, a0: a, a1: nearAngle(a, mine[u.route]), ease: EASE[u.ease ?? "inOutSine"] };
      a = k.a1; return k;
    });
  }
  const angleAt = (id, t) => { let a = base[id]; for (const k of keys[id]) if (t >= k.t) a = k.a0 + (k.a1 - k.a0) * k.ease(clamp((t - k.t) / k.dur)); return a; };
  const turning = (id, t) => keys[id].some((k) => t >= k.t && t <= k.t + k.dur) ? 1 : 0;

  // ---- splitter: fan deflections solved for the route that passes over it; engaged when the lift reaches `engage`
  const SP = L.splitter ?? null, split = T.split ?? null;
  let fan = [], tEngage = Infinity;
  const liftEase = EASE[split?.ease ?? "inOutCubic"];
  const lift = (t) => (split ? liftEase(clamp((t - split.t) / split.dur)) : 0);
  if (SP && split) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (liftEase(mid) < split.engage) lo = mid; else hi = mid; }
    tEngage = split.t + hi * split.dur;
  }
  const worldAt = (t) => ({
    bounds: L.bounds,
    mirrors: L.mirrors.map((m) => ({ id: m.id, p: m.p, half: m.half, angle: angleAt(m.id, t) })),
    targets: L.targets, blockers: L.blockers ?? [],
    splitter: SP ? { id: SP.id, p: SP.p, r: SP.r, on: t >= tEngage, fan } : null,
  });
  if (SP && split) {
    // incoming direction at the splitter just before it engages = the ray of the route in force then
    const pre = trace({ ...worldAt(tEngage - 1e-6), splitter: { id: SP.id, p: SP.p, r: SP.r, on: true, fan: [] } }, L.source.p, L.source.dir)[0];
    if (pre.end.kind !== "splitter") throw new Error(`beamplan: the beam does not cross the splitter when it engages (ends at ${pre.end.id})`);
    const k = pre.pts.length - 1, din = norm(sub(pre.pts[k], pre.pts[k - 1]));
    fan = SP.fan.map((f) => { const to = norm(sub(node[f.to].p, pre.end.p)); return { id: f.id ?? f.to, to: f.to, color: f.color, defl: Math.atan2(din[0] * to[1] - din[1] * to[0], dot(din, to)) }; });
  }

  /** the beam at time t: visible polylines, reached hits, growing heads, which targets are struck */
  function beam(t) {
    const res = { on: t >= T.launch, branches: [], hits: [], heads: [], lit: {}, end: null };
    if (!res.on) return res;
    const tr = trace(worldAt(t), L.source.p, L.source.dir);
    const u = split ? clamp((t - tEngage) / split.travel) : 1;
    for (const br of tr) {
      const limit = br.parent ? (u >= 1 ? Infinity : u * br.length) : T.speed * (t - T.launch);
      const c = clipBranch(br, limit);
      if (c.pts.length < 2) continue;
      res.branches.push({ id: br.id, color: br.color, pts: c.pts });
      if (c.head) res.heads.push({ p: c.head, color: br.color, branch: br.id });
      for (const h of br.hits) if (h.s <= limit) res.hits.push({ ...h, color: br.color, branch: br.id });
      if (c.full) {
        res.hits.push({ ...br.end, color: br.color, branch: br.id });
        if (br.end.kind === "target") res.lit[br.end.id] = br.color;
        if (!br.parent) res.end = br.end;
      }
    }
    return res;
  }

  // ---- one fine scan -> rising edges (events) and struck intervals per element
  const events = [], spans = {}; // spans[id] = [{ on, off, color }]
  {
    const N = Math.ceil(T.end * T.scanHz), prev = new Map(), lastRise = {};
    for (let k = 0; k <= N; k++) {
      const t = k / T.scanHz, b = beam(t), now = new Map();
      for (const h of b.hits) if (h.kind === "mirror" || h.kind === "target" || h.kind === "splitter") now.set(`${h.id}|${h.branch}`, h);
      for (const [key, h] of now) if (!prev.has(key)) {
        (spans[h.id] ??= []).push({ on: t, off: Infinity, color: h.color, key });
        const quiet = t - (lastRise[h.id] ?? -9) >= (T.minGap ?? 0.14);
        lastRise[h.id] = t;
        if (quiet) events.push({ t, kind: h.kind === "mirror" ? "bounce" : h.kind, id: h.id, p: h.p, color: h.color, branch: h.branch, x: h.p[0] });
      }
      for (const [key, h] of prev) if (!now.has(key)) { const sp = spans[h.id].findLast((q) => q.key === key && q.off === Infinity); if (sp) sp.off = t; }
      prev.clear(); for (const kv of now) prev.set(kv[0], kv[1]);
    }
    events.push({ t: T.power, kind: "power", x: L.source.p[0] }, { t: T.launch, kind: "launch", x: L.source.p[0] });
    for (const u of T.turns) events.push({ t: u.t, kind: "turn", id: u.mirror, dur: u.dur, route: u.route, x: node[u.mirror].p[0] });
    if (SP && split) events.push({ t: split.t, kind: "rise", dur: tEngage - split.t, x: SP.p[0] }, { t: tEngage, kind: "engage", x: SP.p[0] });
    events.sort((a, b) => a.t - b.t);
  }
  /** 0..1 struck level of an element (fast attack, slow release) and the colour of the beam striking it */
  function glow(id, t, { attack = 0.07, release = 0.4 } = {}) {
    let v = 0, color = null;
    for (const s of spans[id] ?? []) {
      if (t < s.on) continue;
      const up = 1 - Math.exp(-(Math.min(t, s.off) - s.on) / attack);
      const lv = t <= s.off ? up : up * Math.exp(-(t - s.off) / release);
      if (lv >= v) { v = lv; color = s.color; }
    }
    return { v, color };
  }
  /** decaying pulse summed over every arrival on an element: the flare when a beam first lands */
  function flare(id, t, tau = 0.22) {
    let v = 0;
    for (const e of events) { if (e.t > t) break; if (e.id === id && (e.kind === "bounce" || e.kind === "target" || e.kind === "engage")) v += Math.exp(-(t - e.t) / tau); }
    return Math.min(v, 1.6);
  }
  /** check that every route, held on its own, ends on its target (used as a build gate) */
  function verify() {
    const out = {};
    for (const [name, ids] of Object.entries(L.routes)) {
      const w = { bounds: L.bounds, targets: L.targets, blockers: L.blockers ?? [], splitter: null, mirrors: L.mirrors.map((m) => ({ id: m.id, p: m.p, half: m.half, angle: aim[m.id]?.[name] ?? base[m.id] })) };
      const br = trace(w, L.source.p, L.source.dir)[0], got = [...br.hits.map((h) => h.id), br.end.id];
      out[name] = { ok: got.join(">") === ids.join(">"), got, length: br.length };
    }
    return out;
  }
  return {
    layout: L, timing: T, aim, base, keys, fan, tEngage,
    angleAt, turning, lift, worldAt, beam, events: () => events.map((e) => ({ ...e })), spans, glow, flare, verify,
    powerAt: (t) => clamp((t - T.power) / 0.35),
  };
}

/** SCORE voices for kit/schedule.scoreFromEvents. S = spec.sound */
export function benchVoices(S) {
  const step = (n) => Math.pow(2, n / 12);
  return {
    power: () => [{ type: "click", gain: S.power.click }, { type: "riser", dur: S.power.riser, gain: S.power.gain, offset: 0.02 }],
    launch: () => [{ type: "whoosh", dir: "out", dur: 0.45, pitch: 1.5, gain: S.launch.gain }, { type: "blip", notes: [12], dur: 0.07, gain: S.launch.blip }],
    bounce: (e, { index }) => [{ type: "marimba", hz: S.ping.hz * step(S.ping.scale[index % S.ping.scale.length]), decay: S.ping.decay, dur: 0.5, mallet: 0.8, gain: e.branch === "main" ? S.ping.gain : S.ping.gain * 0.7 }],
    target: (e) => [{ type: "chime", dur: S.chime.dur, pitch: S.chime.pitch[e.id] ?? 1, notes: 4, gain: S.chime.gain }, { type: "marimba", hz: 660 * (S.chime.pitch[e.id] ?? 1), decay: 0.3, dur: 0.9, gain: S.chime.bell }],
    turn: (e) => [{ type: "servo", dur: e.dur, hz: S.servo.hz, hz2: S.servo.hz2, grit: 0.2, gain: S.servo.gain }, { type: "tick", gain: S.servo.tick, offset: e.dur }],
    rise: (e) => [{ type: "whir", dur: Math.max(0.2, e.dur), hz: 90, hz2: 190, gain: S.split.whir }],
    engage: () => [{ type: "clack", gain: S.split.clack }, { type: "whoosh", dir: "out", dur: 0.7, pitch: 1.2, gain: S.split.whoosh }, { type: "chime", sparkle: true, dur: 1.6, gain: S.split.sparkle, offset: 0.05 }],
  };
}
