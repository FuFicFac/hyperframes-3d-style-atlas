// styles/microscope-slide/culture.js — the pure planner for "Microscope slide" (Node-safe: no THREE, no window, no DOM).
//
// Two plans, both closed-form functions of t:
//   1. LINEAGE — every cell has a birth time, an optional division (start + duration) and two daughters. A cell's
//      centre is ASSIGNED from t: its birth position + an eased push along the division axis + a smooth seeded drift
//      measured from its birth time (so it is continuous across the split and never accumulated). The division is a
//      phase p = 0..1 that maps to a readable sequence (round up -> chromatin condenses -> band at the equator ->
//      two sets pulled to the poles -> waist pinches -> two cells with re-formed nuclei). The shape is two SDF lobes
//      joined by a smooth union whose blend k shrinks to 0, so the pinch comes for free.
//   2. OPTICS — the microscope: objective (field radius in µm, magnification tag) with "click" keys hidden by a
//      dark blink, stage position (view centre), and the focal plane z (a focus rack is just keys on z).
// The picture (style.js) and SCORE (scene.config.js -> kit/schedule.scoreFromEvents) both read these plans.
// The division sequence is a SIMPLIFIED ILLUSTRATION of mitosis, not a biological simulation.
import { clamp, lerp, smoothstep, ease, rng, TAU } from "../../kit/time.js";

const sm = smoothstep;
const io = ease.inOutCubic;
const ios = ease.inOutSine;

/** smooth seeded drift (µm), a sum of slow sines: pure f(seed, t) */
export function driftAt(seed, t, amp = 1, speed = 1) {
  const r = rng(seed * 7919 + 13);
  const a = [r(), r(), r(), r(), r(), r()].map((v) => v * TAU);
  const w = [0.21 + r() * 0.1, 0.13 + r() * 0.08, 0.17 + r() * 0.1, 0.11 + r() * 0.07];
  const s = speed;
  return [
    amp * (Math.sin(t * w[0] * s + a[0]) + 0.6 * Math.sin(t * w[1] * s * 1.7 + a[1])),
    amp * (Math.cos(t * w[2] * s + a[2]) + 0.6 * Math.sin(t * w[3] * s * 1.9 + a[3])),
  ];
}

/**
 * divisionShape(p, R, L) -> per-phase shape + stain parameters for a dividing cell.
 *   p: phase 0..1; R: the parent radius when division starts; L: lineage knobs (daughterScale, sEndK, nucK).
 *   sep = half the distance between the two lobes, rL = lobe radius, k = smooth-union blend (0 = plain min).
 */
export function divisionShape(p, R, L) {
  const rd = R * L.daughterScale;
  const sEnd = rd * L.sEndK;
  const round = sm(0, 0.15, p);
  const sep = sEnd * (0.42 * io(sm(0.48, 0.7, p)) + 0.58 * io(sm(0.66, 0.97, p)));
  const rTarget = lerp(R, rd, sm(0.48, 0.97, p));
  const k = R * 1.15 * (1 - sm(0.6, 0.985, p));
  // compensate the smooth-union bulge at the outer tips so the cell keeps its size
  const h = k > 1e-6 ? Math.max(k - 2 * sep, 0) / k : 0;
  const rL = rTarget - (k / 4) * h * h;
  const e1 = io(sm(0.5, 0.68, p));
  const bandX = lerp(0.6 * sEnd * e1, sep, sm(0.7, 0.95, p));
  return {
    round,
    sep, rL, k,
    nucA: 1 - sm(0.14, 0.3, p),
    proA: sm(0.12, 0.26, p) * (1 - sm(0.33, 0.42, p)),
    bandA: sm(0.3, 0.4, p) * (1 - sm(0.8, 0.93, p)),
    bandX,
    dNucA: sm(0.8, 0.96, p),
    nucR: p < 0.5 ? R * L.nucK : rd * L.nucK,
    glow: round * (1 - sm(0.88, 1, p)),
    stage: p < 0.14 ? "rounding" : p < 0.32 ? "prophase" : p < 0.5 ? "metaphase" : p < 0.68 ? "anaphase" : p < 0.95 ? "telophase" : "abscission",
  };
}

/**
 * createCulture({ roots, lineage, horizon }) -> plan
 *   roots: [{ id, pos:[x,y] µm, r µm, z µm, angle, seed, elong?, divide?: { t, dur }, next?: [{ delay, dur, jitter }] }]
 *     `next[g-1]` times the division of generation g (daughters = 1, granddaughters = 2 ...); missing = no division.
 *   lineage: { daughterScale, sEndK, nucK, push, pushDur, growth, growDur, drift: { amp, speed }, wobble, spin, elong }
 *   plan.at(t) -> [cellState]   plan.cells (all records)   plan.divisions   plan.events()   plan.extent(id, t)
 */
export function createCulture({ roots, lineage: L, horizon = 1e9 }) {
  const cells = [];
  const byId = {};
  const add = (c) => { cells.push(c); byId[c.id] = c; return c; };

  const radiusAt = (c, t) => {
    const age = t - c.tBirth;
    return c.r0 * (1 + (c.gen ? L.growth * ease.outSine(clamp(age / L.growDur)) : 0));
  };
  const angleAt = (c, t) => {
    const tt = c.divide ? Math.min(t, c.divide.t) : t; // frozen once division starts (it divides along its long axis)
    return c.angle0 + L.spin * Math.sin(tt * 0.19 + c.seed * 3.1) + 0.12 * Math.sin(tt * 0.07 + c.seed);
  };
  const tRef = (c) => (c.gen ? c.tBirth : 0);
  const centreAt = (c, t) => {
    const age = Math.max(0, t - c.tBirth);
    const d1 = driftAt(c.seed, t, L.drift.amp, L.drift.speed);
    const d0 = driftAt(c.seed, tRef(c), L.drift.amp, L.drift.speed);
    const push = c.gen ? L.push * c.r0 * io(clamp(age / L.pushDur)) : 0;
    return [c.pos[0] + c.dir[0] * push + d1[0] - d0[0], c.pos[1] + c.dir[1] * push + d1[1] - d0[1]];
  };

  function spawn(c, root) {
    if (!c.divide) return;
    const tEnd = c.divide.t + c.divide.dur;
    if (tEnd > horizon) return;
    const R = radiusAt(c, c.divide.t);
    const rd = R * L.daughterScale;
    const sEnd = rd * L.sEndK;
    const axis = angleAt(c, c.divide.t);
    const ctr = centreAt(c, tEnd);
    const g = c.gen + 1;
    const nx = root.next?.[g - 1];
    const r = rng(c.seed * 31 + 7);
    for (const s of [1, -1]) {
      const dir = [Math.cos(axis) * s, Math.sin(axis) * s];
      const d = add({
        id: `${c.id}${s > 0 ? "a" : "b"}`, root: root.id, parent: c.id, gen: g, seed: Math.floor(c.seed * 2 + (s > 0 ? 1 : 2) + g * 97),
        tBirth: tEnd, pos: [ctr[0] + dir[0] * sEnd, ctr[1] + dir[1] * sEnd], dir, r0: rd, z: c.z + (r() - 0.5) * 0.6,
        angle0: axis + Math.PI / 2 + (r() - 0.5) * 0.5, elong: c.elong * (0.8 + r() * 0.4), divide: null, children: [],
      });
      if (nx) {
        const jit = (r() - 0.5) * 2 * (nx.jitter ?? 0);
        d.divide = { t: tEnd + nx.delay + jit, dur: nx.dur };
      }
      c.children.push(d.id);
      spawn(d, root);
    }
  }

  for (const root of roots) {
    const c = add({
      id: root.id, root: root.id, parent: null, gen: 0, seed: root.seed, tBirth: -1e9, pos: root.pos, dir: [0, 0], r0: root.r,
      z: root.z ?? 0, angle0: root.angle ?? 0, elong: root.elong ?? L.elong, divide: root.divide ?? null, children: [],
    });
    spawn(c, root);
  }

  /** stateOf(c, t) -> null when the cell does not exist at t; otherwise every number the shader needs */
  function stateOf(c, t) {
    if (t < c.tBirth) return null;
    const tEnd = c.divide && c.children.length ? c.divide.t + c.divide.dur : Infinity;
    if (t >= tEnd) return null;
    const age = t - c.tBirth;
    const settle = c.gen ? sm(0, 1.4, age) : 1; // daughters are born round, then relax
    const [x, y] = centreAt(c, t);
    const r = radiusAt(c, t);
    const r2 = rng(c.seed * 17 + 3);
    const nox = (r2() - 0.5) * 0.3 * r, noy = (r2() - 0.5) * 0.24 * r;
    let st = {
      id: c.id, x, y, angle: angleAt(c, t), z: c.z, seed: (c.seed % 997) / 997,
      sep: 0, rL: r, k: 0, elong: c.elong * settle, wob: L.wobble * settle,
      nucA: 1, nox: nox * settle, noy: noy * settle, nucR: r * L.nucK,
      proA: 0, bandA: 0, bandX: 0, dNucA: 0, glow: 0, phase: -1, stage: "interphase", r,
    };
    if (c.divide && t >= c.divide.t) {
      const p = clamp((t - c.divide.t) / c.divide.dur);
      const R = radiusAt(c, c.divide.t);
      const s = divisionShape(p, R, L);
      const keep = 1 - s.round;
      st = {
        ...st, sep: s.sep, rL: s.rL, k: s.k, elong: st.elong * keep, wob: st.wob * keep,
        nucA: s.nucA, nox: st.nox * keep, noy: st.noy * keep, nucR: s.nucR,
        proA: s.proA, bandA: s.bandA, bandX: s.bandX, dNucA: s.dNucA, glow: s.glow, phase: p, stage: s.stage, r: R,
      };
    }
    return st;
  }

  const at = (t) => cells.map((c) => stateOf(c, t)).filter(Boolean);

  /** extent(id, t) -> [cx, cy, reach]: a circle that contains the cell (or its descendants alive at t) */
  function extent(id, t) {
    const live = at(t).filter((s) => s.id.startsWith(id));
    if (!live.length) return null;
    const cx = live.reduce((a, s) => a + s.x, 0) / live.length, cy = live.reduce((a, s) => a + s.y, 0) / live.length;
    let reach = 0;
    for (const s of live) {
      const own = (s.sep + s.rL) * (1 + s.elong) * (1 + s.wob);
      reach = Math.max(reach, Math.hypot(s.x - cx, s.y - cy) + own);
    }
    return [cx, cy, reach];
  }

  const divisions = cells.filter((c) => c.divide && c.children.length).map((c) => ({
    id: c.id, gen: c.gen, root: c.root, t: c.divide.t, dur: c.divide.dur, tEnd: c.divide.t + c.divide.dur,
    pos: () => centreAt(c, c.divide.t + c.divide.dur * 0.9),
  }));

  /**
   * events({ visible }) -> [{ t, kind, ... }] for scoreFromEvents. kinds: "round" (division starts), "align"
   * (chromosomes reach the equator), "split" (the waist closes). visible(e) filters out divisions outside the field.
   */
  function events({ visible = () => true } = {}) {
    const out = [];
    for (const d of divisions) {
      const p = d.pos();
      const base = { id: d.id, gen: d.gen, root: d.root, x: p[0], y: p[1] };
      for (const [kind, f] of [["round", 0.02], ["align", 0.4], ["split", 0.93]]) {
        const e = { ...base, t: +(d.t + d.dur * f).toFixed(4), kind };
        if (visible(e)) out.push(e);
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  return { cells, byId, at, stateOf, extent, divisions, events, centreAt: (id, t) => centreAt(byId[id], t), radiusAt: (id, t) => radiusAt(byId[id], t) };
}

// ---------------------------------------------------------------- optics
const keyLerp = (keys, t, get) => {
  if (t <= keys[0].t) return get(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) {
      if (b.click) return get(a); // objective changes are steps, hidden by the blink
      const u = (ease[b.ease] ?? ios)(clamp((t - a.t) / (b.t - a.t)));
      const va = get(a), vb = get(b);
      return Array.isArray(va) ? va.map((v, j) => lerp(v, vb[j], u)) : lerp(va, vb, u);
    }
  }
  return get(keys[keys.length - 1]);
};

/**
 * createOptics({ view: [{ t, umR, center:[x,y], mag, click?, ease? }], focus: [{ t, z, ease? }], blink: { dur, dark, blur } })
 *   view keys: field radius (µm across the field-stop radius), stage centre, magnification tag. A key with click: true
 *   is an objective change AT key.t: the value steps at key.t, hidden inside a dark blink [t - dur/2, t + dur/2].
 *   optics.at(t) -> { umR, center, mag, focusZ, blink (0..1), blur (µm extra blur) }
 *   optics.events() -> [{ t, kind: "objective" | "focus", ... }]
 */
export function createOptics({ view, focus, blink }) {
  const clicks = view.filter((k) => k.click);
  function blinkAt(t) {
    let b = 0;
    for (const k of clicks) {
      const u = (t - (k.t - blink.dur / 2)) / blink.dur;
      if (u > 0 && u < 1) b = Math.max(b, Math.sin(Math.PI * u) ** 2);
    }
    return b;
  }
  function at(t) {
    const umR = keyLerp(view, t, (k) => k.umR);
    const center = keyLerp(view, t, (k) => k.center);
    const magKey = [...view].reverse().find((k) => k.t <= t) ?? view[0];
    const b = blinkAt(t);
    return { umR, center, mag: magKey.mag, focusZ: keyLerp(focus, t, (k) => k.z), blink: b * blink.dark, blur: b * blink.blur };
  }
  function events() {
    const out = clicks.map((k) => ({ t: k.t - blink.dur * 0.35, kind: "objective", mag: k.mag }));
    for (let i = 0; i < focus.length - 1; i++) {
      const a = focus[i], b = focus[i + 1], dz = Math.abs(b.z - a.z);
      if (dz > 0.3) out.push({ t: a.t, kind: "focus", dur: b.t - a.t, dz, up: b.z > a.z });
    }
    return out.sort((x, y) => x.t - y.t);
  }
  return { at, events, clicks };
}

/**
 * fieldFit(plan, optics, ids, { t0, t1, dt, safe }) -> { ok, worst: { t, id, fill } }: how much of the field radius the
 * given cells (with their descendants) fill; fill > safe = touching the field stop. A build gate like kit/framing.
 */
export function fieldFit(plan, optics, ids, { t0 = 0, t1, dt = 1 / 30, safe = 0.9 } = {}) {
  let worst = { fill: 0 };
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const o = optics.at(t);
    for (const id of ids) {
      const e = plan.extent(id, t);
      if (!e) continue;
      const fill = (Math.hypot(e[0] - o.center[0], e[1] - o.center[1]) + e[2]) / o.umR;
      if (fill > worst.fill) worst = { t: +t.toFixed(3), id, fill: +fill.toFixed(3) };
    }
  }
  return { ok: worst.fill <= safe, worst };
}

/** cultureVoices(snd) -> voices for kit/schedule.scoreFromEvents (one entry per event kind). */
export function cultureVoices(snd) {
  return {
    round: (e) => [{ type: "bubble", gain: snd.round.gain, pitch: snd.round.pitch, dur: 0.14 }],
    align: (e) => [{ type: "marimba", gain: snd.align.gain * (e.gen ? 0.6 : 1), hz: snd.align.hz, decay: 0.5, dur: 1.2, notes: [0, 7], step: 0.09 }],
    split: (e) => [
      { type: "pluck", gain: snd.split.gain * (e.gen ? 0.75 : 1), hz: snd.split.hz * (e.gen ? 1.5 : 1), decay: 1.4, dur: 1.6, bright: 0.45 },
      { type: "pop", gain: snd.split.pop * (e.gen ? 0.7 : 1), pitch: 0.55, dur: 0.12, offset: 0.02 },
    ],
    objective: (e) => [
      { type: "clack", gain: snd.objective.click, pitch: 0.7, dur: 0.12 },
      { type: "thud", gain: snd.objective.clunk, pitch: 1.4, dur: 0.3, offset: 0.09 },
    ],
    focus: (e) => [{ type: "whir", gain: snd.focus.gain * clamp(Math.sqrt(e.dz / 6), 0.35, 1), hz: e.up ? 150 : 200, hz2: e.up ? 200 : 150, dur: Math.min(e.dur, 2.2) }],
  };
}
