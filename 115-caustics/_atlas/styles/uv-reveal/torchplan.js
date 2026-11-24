// styles/uv-reveal/torchplan.js — the UV torch plan. Pure, Node-safe: no THREE, no window, no DOM.
// One plan answers everything the picture and the sound need, each a pure function of t:
//   poolAt(t)   -> { x, z, r, h }  centre of the UV pool on the sheet (world XZ, sheet centred on the origin), its radius
//                                  and the lens distance h (the beam half-angle is atan(r / h): the head "zooms")
//   onAt(t)     -> 0..1            torch lamp level
//   roomAt(t)   -> 0..1            room-light level (1 lit room, dims at switch-on, ~0 at the flood)
//   floodAt(t)  -> 0..1            final "everything glows" level
//   trailAt(t)  -> [{ x, z, w }]   afterglow samples (older pool positions, weight e^(-age/tau) x lamp level then)
//   torchAt(t)  -> { lens:[x,y,z], dir:[x,y,z], dist }   lens position and the unit direction pool -> lens
//   events()    -> [{ kind, t, ... }]   switch / hum / sweep legs / mark hits / stamp / lights-off / flood (for SCORE)
// layout(seed) gives the hidden-layer geometry (watermark lattice, stamp, code strip) in sheet pixels, so the baked
// texture, the "which mark does the pool reach when" hit list and the sound all read the same data.
import { clamp, smoothstep, rng } from "../../kit/time.js";

export const PAGE = { w: 3.2, h: 1.8, ppm: 640 };           // sheet metres + bake resolution (2048 x 1152)
export const PX = { w: PAGE.w * PAGE.ppm, h: PAGE.h * PAGE.ppm };

/** sheet pixel (origin top-left, y down) -> world [x, z] (sheet centred on the origin, +z toward the viewer) */
export const pxToWorld = (px, py) => [px / PAGE.ppm - PAGE.w / 2, py / PAGE.ppm - PAGE.h / 2];
/** world [x, z] -> sheet metres from the texture origin (u right, v up), what the shader compares against vMapUv */
export const worldToSheet = (x, z) => [x + PAGE.w / 2, PAGE.h / 2 - z];

/**
 * layout(seed) -> { illus, column, tiles, stamp, strip }
 * All in sheet pixels. tiles = the repeating watermark lattice (rotated grid), minus the ones under the stamp.
 */
export function layout(seed = 7) {
  const R = rng(seed);
  const W = PX.w, H = PX.h;
  const illus = { x: 96, y: 190, w: 900, h: 700 };
  const column = { x: 1080, y: 190, w: 872, h: 800 };
  const stamp = { cx: W / 2, cy: 600, w: 1330, h: 350, rot: -0.15 };
  // paragraphs of dummy text bars (seeded widths)
  const lines = [];
  let y = column.y + 6;
  const paras = [5, 6, 5, 4];
  paras.forEach((n, p) => {
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      lines.push({ x: column.x, y, w: Math.round(column.w * (last ? R.range(0.35, 0.7) : R.range(0.9, 1))), h: 14, para: p });
      y += 34;
    }
    y += 26;
  });
  // rotated lattice of watermark tiles
  const tiles = [];
  const sp = 196, a = -0.5, ca = Math.cos(a), sa = Math.sin(a);
  const inStamp = (px, py) => {
    const dx = px - stamp.cx, dy = py - stamp.cy, c = Math.cos(-stamp.rot), s = Math.sin(-stamp.rot);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) < stamp.w / 2 + 62 && Math.abs(ly) < stamp.h / 2 + 62;
  };
  for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) {
    const px = W / 2 + (i * ca - j * sa) * sp, py = H / 2 + (i * sa + j * ca) * sp;
    if (px < 70 || px > W - 70 || py < 70 || py > H - 70) continue;
    if (inStamp(px, py)) continue;
    tiles.push({ px: Math.round(px), py: Math.round(py), kind: (i + j) & 1 ? "ring" : "glyph", tint: ((i - j) % 3 + 3) % 3, rot: a });
  }
  // code strip along the bottom margin: seeded bar widths
  const strip = [];
  let x = 120;
  while (x < W - 120) {
    const w = R.pick([6, 6, 10, 14, 20]);
    strip.push({ x, w, tint: R.int(0, 2), tall: R.chance(0.3) });
    x += w + R.pick([8, 10, 14, 22]);
  }
  return { illus, column, lines, tiles, stamp, strip, W, H };
}

// ---------------------------------------------------------------- timed Hermite track
/** keys: [{ t, x, z, r, h, stop? }] sorted by t. Tangents: finite differences in time; 0 at `stop` keys and the ends. */
function makeTrack(keys) {
  const n = keys.length, F = ["x", "z", "r", "h"];
  const m = keys.map((k, i) => {
    const o = {};
    for (const f of F) {
      if (k.stop || i === 0 || i === n - 1) o[f] = 0;
      else o[f] = (keys[i + 1][f] - keys[i - 1][f]) / (keys[i + 1].t - keys[i - 1].t);
    }
    return o;
  });
  return (t) => {
    if (t <= keys[0].t) return { x: keys[0].x, z: keys[0].z, r: keys[0].r, h: keys[0].h };
    if (t >= keys[n - 1].t) return { x: keys[n - 1].x, z: keys[n - 1].z, r: keys[n - 1].r, h: keys[n - 1].h };
    let i = 0;
    while (i < n - 2 && t >= keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], d = b.t - a.t, u = (t - a.t) / d;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const o = {};
    for (const f of F) o[f] = h00 * a[f] + h10 * d * m[i][f] + h01 * b[f] + h11 * d * m[i + 1][f];
    return o;
  };
}

/**
 * createPlan({ keys, switchOn, lightsOff, floodDur, legs, torch, end, seed })
 *   keys      [{ t, x, z, r, h, stop? }]  pool centre (world XZ), pool radius and lens distance over time
 *   switchOn  s   the lamp clicks on (room dims over ~0.6 s)
 *   lightsOff s   the final beat: room light off, flood begins
 *   floodDur  s   flood ramp length
 *   legs      [{ t, dur }]             sweep legs (for whooshes)
 *   torch     STYLE_SPEC.torch         lean, poolSoft, afterglow, wobble, room
 */
export function createPlan(o) {
  const { keys, switchOn, lightsOff, floodDur = 1.4, legs = [], torch: T, end = 15, seed = 7 } = o;
  const track = makeTrack(keys);
  const L = layout(seed);
  const lean = (() => { const [x, y, z] = T.lean, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();
  const AG = T.afterglow, WB = T.wobble;

  const onAt = (t) => smoothstep(switchOn, switchOn + 0.12, t);
  const floodAt = (t) => smoothstep(lightsOff, lightsOff + floodDur, t);
  const roomAt = (t) => {
    const dim = smoothstep(switchOn - 0.05, switchOn + 0.6, t);
    const off = smoothstep(lightsOff, lightsOff + 0.7, t);
    return (1 + (T.room.torch - 1) * dim) * (1 - off) + T.room.flood * off;
  };
  const poolAt = (t) => {
    const p = track(t);
    const w = 2 * Math.PI * WB.hz * t;   // hand-held sway (assigned from t, never accumulated)
    return { x: p.x + WB.amp * Math.sin(w), z: p.z + WB.amp * 0.8 * Math.sin(w * 1.37 + 1.1), r: p.r, h: p.h };
  };
  const span = AG.samples * AG.step;
  const trailAt = (t) => {
    const out = [];
    for (let k = 1; k <= AG.samples; k++) {
      const age = k * AG.step, tk = t - age;
      const p = poolAt(tk);
      // e^(-age/tau), tapered to 0 at the end of the sample window (no step at the tail); the trail belongs to the
      // sweep, so it fades out as the flood takes over
      const w = Math.exp(-age / AG.tau) * (1 - smoothstep(0.6 * span, span, age));
      out.push({ x: p.x, z: p.z, r: p.r, w: onAt(tk) * w * (1 - floodAt(t)) });
    }
    return out;
  };
  const torchAt = (t) => {
    const p = poolAt(t), dist = p.h;
    return { lens: [p.x + lean[0] * dist, lean[1] * dist, p.z + lean[2] * dist], dir: lean, dist, pool: p };
  };
  /** glow mask at a world point (what the shader computes), for tests / hit timing */
  const maskAt = (t, x, z) => {
    const p = poolAt(t);
    const d = Math.hypot(x - p.x, z - p.z);
    return onAt(t) * (1 - smoothstep(p.r * T.poolSoft, p.r, d));
  };

  // ---- hits: when does the pool first reach each watermark tile / the stamp? -------------------------------
  const hits = (() => {
    const out = [];
    const anchors = L.tiles.map((q, i) => ({ id: `tile${i}`, p: pxToWorld(q.px, q.py) }));
    for (const a of anchors) {
      for (let f = Math.round(switchOn * 30); f < lightsOff * 30; f++) {
        const t = f / 30;
        if (maskAt(t, a.p[0], a.p[1]) > 0.5) { out.push({ kind: "hit", t, id: a.id, x: a.p[0] }); break; }
      }
    }
    out.sort((p, q) => p.t - q.t);
    // thin to an audible sparkle: at most one ping per 0.2 s
    const thin = [];
    for (const h of out) if (!thin.length || h.t - thin[thin.length - 1].t >= 0.2) thin.push(h);
    return thin;
  })();
  const stampAt = (() => {
    // the stamp counts as "found" when the WIDENED beam (r > 0.7) first lights its left third (where its text starts)
    const [sx, sz] = pxToWorld(L.stamp.cx - (L.stamp.w / 3) * Math.cos(L.stamp.rot), L.stamp.cy - (L.stamp.w / 3) * Math.sin(L.stamp.rot));
    for (let f = Math.round(switchOn * 30); f < lightsOff * 30; f++) {
      const t = f / 30;
      if (poolAt(t).r > 0.7 && maskAt(t, sx, sz) > 0.5) return t;
    }
    return null;
  })();

  const events = () => {
    const ev = [
      { kind: "bed", t: 0, dur: switchOn + 0.6 },
      { kind: "paper", t: 0.05 },
      { kind: "switch", t: switchOn },
      { kind: "bedUv", t: switchOn - 0.2, dur: end - switchOn + 0.2 },
      { kind: "hum", t: switchOn, dur: lightsOff + floodDur - switchOn },
      ...legs.map((l) => ({ kind: "leg", t: l.t, dur: l.dur })),
      ...hits,
      { kind: "lightsOff", t: lightsOff },
      { kind: "flood", t: lightsOff + floodDur * 0.55 },
    ];
    if (stampAt != null) ev.push({ kind: "stamp", t: stampAt });
    return ev.sort((a, b) => a.t - b.t);
  };

  return { keys, switchOn, lightsOff, floodDur, end, layout: L, lean, onAt, floodAt, roomAt, poolAt, trailAt, torchAt, maskAt, hits, stampAt, events };
}

/** SCORE voices for kit/schedule.scoreFromEvents (S = STYLE_SPEC.sound) */
export function torchVoices(S) {
  const pan = (x) => clamp(x / 1.8, -0.7, 0.7);
  const scale = [0, 3, 7, 10, 12, 15, 19];   // minor pentatonic-ish steps for the mark pings
  return {
    bed: (e) => [{ type: "pad", dur: e.dur + 1.2, gain: S.bed.gain, root: S.bed.root, chord: [0, 7, 12, 16], brightness: S.bed.brightness, attack: 0.4, release: 1.2 }],
    bedUv: (e) => [{ type: "pad", dur: e.dur, gain: S.bedUv.gain, root: S.bedUv.root, chord: [0, 7, 12, 15, 22], brightness: S.bedUv.brightness, attack: 0.8, release: 0.6 }],
    paper: () => [{ type: "paper", dur: 0.6, gain: 0.5, fold: false }, { type: "thud", offset: 0.62, dur: 0.25, gain: 0.25 }],
    switch: () => [{ type: "clack", dur: 0.1, gain: 0.7 }, { type: "thud", offset: 0.04, dur: 0.5, gain: 0.4 }],
    hum: (e) => [{ type: "hum", dur: e.dur, hz: S.hum.hz, gain: S.hum.gain }],
    leg: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, gain: S.leg.gain, q: 2.2 }],
    hit: (e, { index }) => [{ type: "blip", dur: 0.07, notes: [scale[index % scale.length] + 12], gain: S.hit.gain, pan: pan(e.x) }],
    stamp: () => [{ type: "chime", dur: 1.4, notes: 4, gain: S.stamp.gain }, { type: "thud", dur: 0.4, gain: 0.45 }],
    lightsOff: () => [{ type: "clack", dur: 0.12, gain: 0.8 }, { type: "riser", dur: 0.75, gain: 0.4 }, { type: "rumble", dur: 2.2, gain: 0.35 }],
    flood: () => [{ type: "chime", sparkle: true, dur: 2.4, notes: 8, gain: S.flood.gain }, { type: "whoosh", dir: "out", dur: 1.4, gain: 0.4 }],
  };
}
