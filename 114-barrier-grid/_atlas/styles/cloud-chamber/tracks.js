// styles/cloud-chamber/tracks.js — the event planner for "Cloud Chamber" (pure: no THREE, no window, Node-safe).
// A cloud chamber shows nothing but EVENTS: a particle crosses the mist, a trail condenses along its path in an instant,
// and from then on the trail only ages. So the whole film is one seeded list of events, each with a curve built once:
//   createPlan({ seed, phases }, STYLE_SPEC) -> plan
//     phases: [{ t0, t1, field = 0, rate: { muon, beta, alpha } (events / s, background, anywhere in the tank),
//                source?: { p: [x, z], dir (rad, 0 = +x), spread (rad), r0 = .12, rate: { ray, beta } } }]
//   plan.tracks: [{ id, kind, t (birth), reveal (s head-to-tail), life, width, bright, warm, len, field, fromSource,
//                   pts [[x,y,z]], tan [[x,y,z]], u [0..1], s [m], wander [[x,y,z]] (unit-ish sideways drift per sample) }]
//   plan.events() -> [{ t, kind, x, len, fromSource }] for SCORE (one tick per trail); plan.aliveAt(t); plan.box()
// The picture (style.js) and the sound (scene.config.js via trackVoices + kit scoreFromEvents) read the SAME list.
import { rng, clamp, TAU } from "../../kit/time.js";

const STEP = 0.05; // m between samples

/** inside the sensitive area (x/z), with the glass margin */
function inside(T, x, z) {
  const hx = T.w / 2 - T.margin, hz = T.d / 2 - T.margin;
  return Math.abs(x) <= hx && Math.abs(z) <= hz;
}
/** distance along heading (c, s) from (x, z) to the tank wall */
function toWall(T, x, z, c, s) {
  const hx = T.w / 2 - T.margin, hz = T.d / 2 - T.margin;
  const tx = Math.abs(c) < 1e-9 ? Infinity : ((c > 0 ? hx : -hx) - x) / c;
  const tz = Math.abs(s) < 1e-9 ? Infinity : ((s > 0 ? hz : -hz) - z) / s;
  return Math.max(0, Math.min(tx, tz));
}

/**
 * buildTrack(ev, K, spec) -> track: integrates the heading once.
 *   heading' = curvature(u) + seeded wobble (+ rare kinks); curvature = field · q / radius, and for spiral kinds the
 *   radius shrinks along the path (the particle loses energy), so the trail winds inward.
 */
function buildTrack(ev, K, spec, R) {
  const T = spec.tank, F = spec.field;
  let { x, z, heading: th } = ev;
  const L = ev.len;
  const n = Math.max(2, Math.ceil(L / STEP) + 1);
  const y0 = ev.y0, y1 = ev.y1;
  const f = ev.field;
  const wob = K.wobble * (f > 0 && K.spiral ? 0.3 : 1), kink = f > 0 && K.spiral ? 0 : K.kink;
  const pts = [], s = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    pts.push([x, y0 + (y1 - y0) * u, z]); s.push(i * STEP);
    if (i === n - 1) break;
    const rad = F.radius * (K.spiral ? 1 - F.shrink * u : 1);
    th += (f * K.q / rad) * STEP + wob * R.gaussian(0, 1) * Math.sqrt(STEP) * 0.5;
    if (kink && R.chance(kink)) th += R.gaussian(0, 0.8);
    const nx = x + Math.cos(th) * STEP, nz = z + Math.sin(th) * STEP;
    if (!inside(T, nx, nz)) break; // the trail ends at the glass
    x = nx; z = nz;
  }
  const m = pts.length;
  const len = (m - 1) * STEP;
  const tan = [], u = [], wander = [];
  const p1 = R.range(0, TAU), p2 = R.range(0, TAU), f1 = R.range(1.6, 3.2), f2 = R.range(5, 9), side = R.sign();
  for (let i = 0; i < m; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    tan.push([dx, dy, dz]);
    u.push(m > 1 ? i / (m - 1) : 0);
    // sideways (in the plane of the mist) drift: smooth along the trail so it curdles instead of shredding
    const w = side * (K.wander ?? 1) * (0.6 * Math.sin(s[i] * f1 + p1) + 0.4 * Math.sin(s[i] * f2 + p2));
    const hl = Math.hypot(dx, dz) || 1;
    wander.push([(-dz / hl) * w, 0, (dx / hl) * w]);
  }
  return {
    id: ev.id, kind: ev.kind, t: ev.t, reveal: len / K.speed, life: ev.life, width: K.width * ev.wMul * (f > 0 && K.spiral ? F.spiralWidth ?? 1 : 1), bright: K.bright * ev.bMul * (f > 0 && K.spiral ? F.spiralBright ?? 1 : 1),
    warm: K.warm, len, field: f, fromSource: !!ev.fromSource, seed: ev.seed, pts, tan, u, s, wander,
  };
}

/** stratified event times: n = rate × duration, one per slot with seeded jitter (even traffic, no clumps or droughts) */
function slotTimes(t0, t1, rate, R) {
  const n = Math.round(rate * (t1 - t0));
  const out = [];
  for (let i = 0; i < n; i++) out.push(t0 + ((i + R.range(0.08, 0.92)) / n) * (t1 - t0));
  return out;
}

/**
 * createPlan({ seed = 84, phases }, spec) -> plan (see the header).
 */
export function createPlan({ seed = 84, phases = [] } = {}, spec) {
  const T = spec.tank, KINDS = spec.kinds;
  const R = rng(seed);
  const raw = [];
  const hx = T.w / 2 - T.margin, hz = T.d / 2 - T.margin;
  const [my0, my1] = T.mist;
  phases.forEach((ph, pi) => {
    const field = ph.field ?? 0;
    // ---- background: anywhere, any direction
    for (const kind of Object.keys(ph.rate ?? {})) {
      const K = KINDS[kind];
      if (!K || !(ph.rate[kind] > 0)) continue;
      for (const t of slotTimes(ph.t0, ph.t1, ph.rate[kind], R)) {
        let x = R.range(-hx, hx), z = R.range(-hz, hz), heading = R.range(0, TAU), len = R.range(...K.len);
        if (kind === "muon") {
          // a needle from wall to wall: walk back to the glass, then go all the way across
          const c = Math.cos(heading), s = Math.sin(heading);
          const back = toWall(T, x, z, -c, -s);
          x -= c * back * 0.999; z -= s * back * 0.999;
          len = Math.min(len, toWall(T, x, z, c, s));
          if (len < 2.2) { // a corner-clipper: aim it through the middle instead
            heading = Math.atan2(-z * 0.5 - z, -x * 0.5 - x) + R.range(-0.3, 0.3);
            len = Math.min(K.len[1], toWall(T, x, z, Math.cos(heading), Math.sin(heading)));
          }
        } else if (kind === "beta" && field > 0) {
          // spirals need room: keep their start away from the glass
          x *= 0.72; z *= 0.6;
        }
        raw.push({ t, kind, x, z, heading, len, field, phase: pi });
      }
    }
    // ---- the source: a fan out of one point
    const S = ph.source;
    if (S) {
      let k = 0;
      for (const kind of Object.keys(S.rate ?? {})) {
        const K = KINDS[kind];
        if (!K || !(S.rate[kind] > 0)) continue;
        for (const t of slotTimes(ph.t0, ph.t1, S.rate[kind], R)) {
          // golden-ratio angles: successive rays land far apart, the fan fills evenly
          const a = ((k++ * 0.6180339887 + R.range(-0.06, 0.06)) % 1 + 1) % 1;
          const heading = (S.dir ?? 0) + (a * 2 - 1) * (S.spread ?? Math.PI);
          const r0 = (S.r0 ?? 0.12) * R.range(0.8, 1.5);
          const x = S.p[0] + Math.cos(heading) * r0, z = S.p[1] + Math.sin(heading) * r0;
          raw.push({ t, kind, x, z, heading, len: R.range(...K.len), field, phase: pi, fromSource: true });
        }
      }
    }
  });
  raw.sort((a, b) => a.t - b.t);
  const tracks = raw.map((ev, i) => {
    const K = KINDS[ev.kind];
    const Rt = rng(seed * 7919 + i * 131 + 17); // one generator per trail: editing a rate does not reshuffle the others' shapes
    const steep = ev.kind === "muon" ? 1 : 0.35;
    const ym = Rt.range(my0 + 0.08, my1 - 0.08), dy = Rt.range(-1, 1) * (my1 - my0) * 0.5 * steep;
    return buildTrack({
      ...ev, id: i, seed: Rt.range(0, 100), life: Rt.range(...K.life), wMul: Rt.range(0.85, 1.2), bMul: Rt.range(0.8, 1.15),
      y0: clamp(ym - dy, my0, my1), y1: clamp(ym + dy, my0, my1),
    }, K, spec, Rt);
  }).filter((tr) => tr.len >= 0.2);
  tracks.forEach((tr, i) => { tr.id = i; });

  const samples = tracks.reduce((a, tr) => a + tr.pts.length, 0);
  return {
    tracks, samples, phases,
    /** one event per trail, for SCORE */
    events() { return tracks.map((tr) => ({ t: tr.t, kind: tr.kind, x: tr.pts[0][0], len: tr.len, fromSource: tr.fromSource, id: tr.id })); },
    /** how many trails are visible at t (for notes / tuning) */
    aliveAt(t) { let n = 0; for (const tr of tracks) if (t >= tr.t && t < tr.t + tr.life) n++; return n; },
    /** the sensitive volume (for framing) */
    box() { return [[-T.w / 2, 0, -T.d / 2], [T.w / 2, T.mist[1], T.d / 2]]; },
    /** phase index at t */
    phaseAt(t) { let k = 0; phases.forEach((p, i) => { if (t >= p.t0) k = i; }); return k; },
  };
}

/**
 * trackVoices(SND, tank) -> voices for kit/schedule.scoreFromEvents: one Geiger tick per trail, pitch and level by kind
 * (heavy stubs = low fat click, needles = sharp tick, threads = faint high tick). Source rays are thinned in level so
 * a 20-per-second fountain crackles instead of roaring.
 */
export function trackVoices(SND) {
  const v = (name) => (e) => {
    const q = SND.tick[name];
    const k = 0.75 + 0.25 * clamp(e.len / 3, 0, 1);
    return [{ type: "tick", gain: q.gain * k, pitch: q.pitch * (0.94 + 0.12 * ((e.id * 0.6180339887) % 1)), dur: q.dur }];
  };
  return { alpha: v("alpha"), ray: v("ray"), muon: v("muon"), beta: v("beta") };
}

/** stereo position of an event: left wall = -0.6, right wall = +0.6 */
export function trackPan(tank) {
  return (e) => clamp((e.x / (tank.w / 2)) * 0.6, -0.6, 0.6);
}
