// styles/wireframe-hologram/holo.js — pure planning helpers for the Wireframe Hologram style.
// No THREE, no window, no DOM: imported by style.js (picture) AND by scene.config.js (SCORE), so glitch slices,
// node firings and pulse arrivals that you SEE are the same events you HEAR.
//   glitchAt(t, G)                 -> { on, bands:[{ y, h, dx }] }     seeded glitch slices (stateless per slot)
//   glitchEvents(t0, t1, G)        -> [t]                              slot start times with a glitch (for SFX)
//   phases(u, M)                   -> { points, edges, faces }         one materialise run split into lagged phases
//   holoLevel(t, F)                -> multiplier ~1 ± hum              hum shimmer + per-frame jitter
//   layerGraph(layers, opts)       -> { nodes, edges }                 seeded sparse fan-in between layers
//   forwardPlan(graph, opts)       -> { fire[], edgeT[], waves[] }     forward-pass timing: who fires when
//   pulseAt(t, t0, dur)            -> u | null                         dash head position along an edge
import { hash01, clamp, rng } from "../../kit/time.js";

/** Seeded glitch slices. G = spec.glitch (+ optional forced: [[t, dur]]). Stateless: a pure hash of the slot. */
export function glitchAt(t, G) {
  const slot = Math.floor(t * G.fps + 1e-6);
  const p = G.rate / G.fps;
  let on = hash01(slot, G.seed) < p;
  for (const [ft, fd] of G.forced ?? []) if (t >= ft && t < ft + fd) on = true;
  if (!on) return { on: false, bands: [] };
  const n = hash01(slot, G.seed, 7) < 0.4 ? 2 : 1;
  const bands = [];
  for (let k = 0; k < n; k++) {
    const y = G.yRange[0] + (G.yRange[1] - G.yRange[0]) * hash01(slot, G.seed, 11 + k);
    const h = G.bandH[0] + (G.bandH[1] - G.bandH[0]) * hash01(slot, G.seed, 23 + k);
    const dx = (hash01(slot, G.seed, 37 + k) * 2 - 1) * G.maxShift;
    bands.push({ y, h, dx });
  }
  return { on: true, bands };
}

/** Times (slot starts) in [t0, t1) where a glitch begins (consecutive glitch slots count once). */
export function glitchEvents(t0, t1, G) {
  const out = [];
  let prev = false;
  for (let s = Math.ceil(t0 * G.fps); s / G.fps < t1; s++) {
    const on = glitchAt(s / G.fps + 1e-4, G).on;
    if (on && !prev) out.push(+(s / G.fps).toFixed(4));
    prev = on;
  }
  return out;
}

/** Split one materialise run u (0..1) into points -> edges -> faces phases. M = spec.materialise. */
export function phases(u, M) {
  const ph = (lag) => clamp((u - lag) / M.span);
  return { points: ph(0), edges: ph(M.edgesLag), faces: ph(M.facesLag) };
}

/** Hum shimmer + per-frame jitter multiplier (F = spec.flicker). */
export function holoLevel(t, F) {
  const frame = Math.floor(t * F.fps + 1e-6);
  return 1 + F.hum * Math.sin(t * F.humHz * Math.PI * 2) + (hash01(frame, 4049) - 0.5) * 2 * F.jitter;
}

/**
 * layerGraph(layers, { fanIn = 4, seed = 1, prefer }) -> { nodes, edges }
 *   layers: [{ id, positions: [[x,y,z]...], fanIn? }]. Every node of layer k+1 gets `fanIn` incoming edges from
 *   distinct nodes of layer k. prefer(layerIndex, nodeIndex) -> weight (> 0) biases the choice (e.g. lit pixels).
 *   nodes: [{ layer, i, p }] (flat), edges: [{ a, b, layer }] (indices into nodes, layer = source layer).
 */
export function layerGraph(layers, o = {}) {
  const r = rng(o.seed ?? 1);
  const nodes = [], base = [];
  layers.forEach((L, li) => { base.push(nodes.length); L.positions.forEach((p, i) => nodes.push({ layer: li, i, p })); });
  const edges = [];
  for (let li = 0; li < layers.length - 1; li++) {
    const src = layers[li].positions.map((_, i) => i);
    const fan = layers[li + 1].fanIn ?? o.fanIn ?? 4;
    layers[li + 1].positions.forEach((_, j) => {
      const w = src.map((i) => Math.max(1e-6, o.prefer ? o.prefer(li, i) : 1));
      const picked = new Set();
      while (picked.size < Math.min(fan, src.length)) {
        let tot = 0;
        src.forEach((i) => { if (!picked.has(i)) tot += w[i]; });
        let x = r.next() * tot;
        for (const i of src) {
          if (picked.has(i)) continue;
          x -= w[i];
          if (x <= 0) { picked.add(i); break; }
        }
      }
      for (const i of picked) edges.push({ a: base[li] + i, b: base[li + 1] + j, layer: li });
    });
  }
  return { nodes, edges, base };
}

/**
 * forwardPlan(graph, { start, hop = .7, travel = .55, spread = .18, seed = 2, active(nodeIndex) -> bool for layer 0,
 *   strength(nodeIndex) -> 0..1 (optional override) })
 *   Layer 0 nodes that are `active` fire at `start` (+ seeded spread). An edge carries a pulse if its source fired;
 *   it leaves at the source's fire time and arrives `travel` s later; a node fires at its first arrival (+ small
 *   seeded jitter). Layers advance roughly every `hop` s. Returns:
 *   fire[n] = fire time (Infinity = never), act[n] = 0..1 activation, edgeT[e] = { t0, dur } | null,
 *   waves[k] = { t, n } (first arrival into layer k+1, nodes firing) for SFX.
 */
export function forwardPlan(graph, o) {
  const { nodes, edges } = graph;
  const r = rng(o.seed ?? 2);
  const travel = o.travel ?? 0.55, spread = o.spread ?? 0.18;
  const fire = nodes.map(() => Infinity), act = nodes.map(() => 0);
  nodes.forEach((n, k) => {
    if (n.layer === 0 && o.active(k)) { fire[k] = o.start + r.next() * spread; act[k] = 1; }
  });
  const edgeT = edges.map(() => null);
  const layersN = Math.max(...nodes.map((n) => n.layer)) + 1;
  const waves = [];
  for (let li = 0; li < layersN - 1; li++) {
    const inc = new Map();
    edges.forEach((e, ei) => {
      if (e.layer !== li || !Number.isFinite(fire[e.a])) return;
      const t0 = fire[e.a] + (o.hopJitter ?? 0.08) * r.next();
      edgeT[ei] = { t0, dur: travel };
      const arr = inc.get(e.b) ?? [];
      arr.push(t0 + travel);
      inc.set(e.b, arr);
    });
    let first = Infinity, count = 0;
    for (const [b, arr] of inc) {
      const s = o.strength ? o.strength(b, arr.length) : clamp(arr.length / 4);
      act[b] = s;
      if (s <= 0.05) continue;
      fire[b] = Math.min(...arr) + 0.04 * r.next();
      first = Math.min(first, fire[b]);
      count++;
    }
    waves.push({ t: first, n: count });
  }
  return { fire, act, edgeT, waves };
}

/** Dash head position (0..1) along an edge for a pulse that leaves at t0 and takes dur; null outside. */
export function pulseAt(t, t0, dur, tail = 0.25) {
  const u = (t - t0) / dur;
  return u < 0 || u > 1 + tail ? null : u;
}
