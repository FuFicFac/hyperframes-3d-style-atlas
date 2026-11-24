// styles/thermal-camera/heat.js — the heat plan: every part's temperature as a closed-form function of t.
// Pure functions: no THREE, no window, no DOM (imports only kit/time.js), so scene.config.js can import it in Node and
// derive SCORE from the same plan the picture reads (render-sfx / export-spec run in Node).
//
// Model (all closed forms, no stepping):
//   level(src, t)   heat source envelope 0..1: 0 before `on`; 1 - exp(-(t-on)/up) while on; after `off` the value at
//                   `off` decays as exp(-(t-off)/down).
//   reach(src,k,t)  conduction front distance k * sqrt(t - on) (frozen at `off`): heat creeps along a part.
//   part(id, s, t)  ambient + standby + dT * level * exp(-s/lambda) * (1 - smoothstep(R - w, R + w, s)),
//                   s = distance of a point from the part's source (m).
//   print           residual heat after contact: amplitude rises during contact (rise), decays after lift (fade);
//                   the footprint keeps its shape (signed distance to the hand outline) and blurs as w + spread*sqrt(age).
//   puffs(t)        exhaust plume: puff slots emitted at `rate`, each carrying the source level AT ITS EMISSION TIME,
//                   rising and fading over its life — the plume thins out on its own after switch-off.
// Temperatures are degrees C and INVENTED (SAMPLE DATA).
import { clamp, smoothstep, lerp, ease } from "../../kit/time.js";

/** source envelope 0..1. src = { on, off, up, down } */
export function level(src, t) {
  if (!src || !(t > src.on)) return 0;
  const a = 1 - Math.exp(-(Math.min(t, src.off) - src.on) / src.up);
  return t <= src.off ? a : a * Math.exp(-(t - src.off) / src.down);
}

/** conduction front reach (m) */
export function reach(src, k, t) {
  if (!src) return 0;
  return k * Math.sqrt(Math.max(0, Math.min(t, src.off) - src.on));
}

// ---------------------------------------------------------------- 2D signed distances (hand outline)
function sdRoundRect(x, z, hw, hl, r) {
  const qx = Math.abs(x) - (hw - r), qz = Math.abs(z) - (hl - r);
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - r;
}
function sdSegment(x, z, ax, az, bx, bz, r) {
  const px = x - ax, pz = z - az, vx = bx - ax, vz = bz - az;
  const h = clamp((px * vx + pz * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return Math.hypot(px - vx * h, pz - vz * h) - r;
}

/**
 * handShape(H) -> { palm, fingers: [{ a:[x,z], b:[x,z], r }], thumb } in hand-local metres (x right, z toward the wrist,
 * fingers toward -z), already scaled by H.scale. The style builds the 3D hand from the SAME shape, so the print matches.
 */
export function handShape(H) {
  const s = H.scale;
  const P = H.palm;
  const palm = { w: P.w * s, l: P.l * s, t: P.t * s, r: Math.min(P.r * s, (P.t * s) / 2 * 0.95, (P.w * s) / 2) };
  const front = -palm.l / 2 + 0.004 * s;
  const fingers = H.fingers.map(([fx, len, r, splay]) => {
    const ax = fx * s, az = front;
    return { a: [ax, az], b: [ax + Math.sin(splay) * len * s, az - Math.cos(splay) * len * s], r: r * s };
  });
  const thumb = { a: [H.thumb.from[0] * s, H.thumb.from[1] * s], b: [H.thumb.to[0] * s, H.thumb.to[1] * s], r: H.thumb.r * s };
  return { palm, fingers, thumb };
}

/** signed distance (m) from a hand-local point to the hand outline (negative inside) */
export function handSDF(shape, x, z) {
  const p = shape.palm;
  let d = sdRoundRect(x, z, p.w / 2, p.l / 2, Math.min(p.w, p.l) * 0.28);
  for (const f of [...shape.fingers, shape.thumb]) d = Math.min(d, sdSegment(x, z, f.a[0], f.a[1], f.b[0], f.b[1], f.r));
  return d;
}

/** world (x, z) -> hand-local (x, z) for a hand centred at c = [x, z] with yaw (three.js rotation.y) */
export function toHandLocal(x, z, c, yaw) {
  const dx = x - c[0], dz = z - c[1], co = Math.cos(yaw), si = Math.sin(yaw);
  return [dx * co - dz * si, dx * si + dz * co];
}

/**
 * towerPoints(tower) -> anchor points of the PC tower, tower-local (origin bottom centre, open side +z) and world.
 * The style builds the parts around these and the scene aims the crosshair at them, so the spot reading's distance
 * from the heat source is the same number the picture uses.
 */
export function towerPoints(T) {
  const bz = -T.thick / 2 + T.wallT + 0.003;            // motherboard plane
  const [cx, cy] = T.cpu;
  const base = [cx, cy, bz + 0.018];                    // cooler base block centre (the source for sink / sinkBase)
  const fins = [cx, cy + 0.0075, bz + 0.098];           // fin stack centre
  const gpu = [-0.02, 0.15, bz + 0.06];                 // GPU die
  const w = (p) => [p[0] + T.x, p[1], p[2] + T.z];
  return { bz, cpu: [cx, cy, bz], base, fins, gpu, world: { base: w(base), fins: w(fins), gpu: w(gpu), top: w([cx, T.h, 0]) } };
}

// ---------------------------------------------------------------- keyed positions (hand path)
function sampleKeys(keys, t) {
  if (t <= keys[0].t) return keys[0].pos.slice();
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const u = (ease[b.ease ?? "inOutCubic"] ?? ease.inOutCubic)(clamp((t - a.t) / (b.t - a.t || 1)));
      return a.pos.map((v, k) => lerp(v, b.pos[k], u));
    }
  }
  return keys[keys.length - 1].pos.slice();
}

/**
 * createHeatPlan(spec, cfg) -> plan
 *   spec: STYLE_SPEC (heat, ambient, range, hand, set)
 *   cfg: {
 *     sources: { cpu: { on, off }, gpu, display, shell, fan },        // times from BEATS
 *     hand: { keys: [{ t, pos:[x,y,z], ease? }], show: [t0, t1], contact: [t0, t1], at: [x, z] },
 *     plume: { at: [x, y, z] },
 *     spots: [{ id, from, to, kind: "part"|"desk"|"wall", part?, s?, point:[x,y,z] }],   // spot reading windows
 *   }
 */
export function createHeatPlan(spec, cfg) {
  const HT = spec.heat, A = spec.ambient, R = spec.range;
  const src = {};
  for (const [id, s] of Object.entries(cfg.sources)) src[id] = { on: s.on, off: s.off, up: s.up ?? HT.sources[id]?.up ?? 1, down: s.down ?? HT.sources[id]?.down ?? 1 };
  const shape = handShape(spec.hand);
  const H = cfg.hand;
  const yaw = spec.hand.yaw;
  const PR = HT.print;

  const plan = {
    spec, cfg, src, shape, yaw,
    level: (id, t) => level(src[id], t),
    reach: (id, k, t) => reach(src[id], k, t),
    /** normalised temperature for the palette */
    toU: (T) => (T - R.min) / (R.max - R.min),

    /** temperature (C) of a part at distance s (m) from its source; base = ambient + standby offset */
    part(id, s, t, base = A.room) {
      const p = HT.parts[id];
      const S = src[p.src];
      let k = level(S, t);
      if (k <= 0) return base;
      if (p.lambda) k *= Math.exp(-s / p.lambda);
      if (p.k) { const Rr = reach(S, p.k, t); k *= 1 - smoothstep(Rr - p.w, Rr + p.w, s); }
      return base + p.dT * k;
    },

    // ---- residual print (hand on desk)
    printAmp(t) {
      const [c0, c1] = H.contact;
      if (!(t > c0)) return 0;
      const a = PR.dT * (1 - Math.exp(-(Math.min(t, c1) - c0) / PR.rise));
      return t <= c1 ? a : a * Math.exp(-(t - c1) / PR.fade);
    },
    printWidth(t) { return PR.width + PR.spread * Math.sqrt(Math.max(0, t - H.contact[1])); },
    /** signed distance from world (x, z) to the hand outline at the print location */
    printSDF(x, z) { const [lx, lz] = toHandLocal(x, z, H.at, yaw); return handSDF(shape, lx, lz); },
    /** desk temperature from precomputed per-point distances: dPrint (printSDF), dTower (outside tower footprint) */
    desk(dPrint, dTower, t) {
      let T = A.desk ?? A.room;
      T += plan.part("deskHalo", Math.max(0, dTower), t, 0);
      const amp = plan.printAmp(t);
      if (amp > 0.01) { const w = plan.printWidth(t); T += amp * (1 - smoothstep(-w, w, dPrint)); }
      return T;
    },

    // ---- the hand
    handPose(t) {
      const visible = t >= H.show[0] && t <= H.show[1];
      return { visible, pos: sampleKeys(H.keys, t), yaw };
    },
    handTemp(t) { return { palm: spec.hand.skin, fingers: spec.hand.fingerSkin, arm: spec.hand.skin - 0.6 }; },
    handDown(t) { return t >= H.contact[0] && t <= H.contact[1]; },

    // ---- exhaust plume
    puffs(t) {
      const P = HT.plume, S = src.fan, out = [];
      if (!S || !(t > S.on)) return out;
      const life = P.puffs / P.rate;
      for (let i = 0; i < P.puffs; i++) {
        const since = t - S.on - i / P.rate;
        if (since < 0) continue;
        const age = since % life, te = t - age, p = age / life;
        const k = level(S, te);
        if (k < 0.01) continue;
        const env = smoothstep(0, 0.12, p) * (1 - smoothstep(0.55, 1, p));
        const seed = Math.floor(since / life) * 7 + i * 13;
        out.push({
          i,
          x: cfg.plume.at[0] + P.wobble * Math.sin(seed * 1.7 + p * 4.0),
          y: cfg.plume.at[1] + P.rise * ease.outQuad(p),
          z: cfg.plume.at[2] + P.wobble * 0.6 * Math.cos(seed * 2.3 + p * 3.1),
          size: lerp(P.size[0], P.size[1], p),
          alpha: P.alpha * env,
          T: A.room + P.dT * k * (1 - 0.55 * p),
        });
      }
      return out;
    },

    // ---- spot reading (the crosshair is the camera target; null while the camera moves)
    spotAt(t) { return cfg.spots.find((s) => t >= s.from && t <= s.to) ?? null; },
    spot(t) {
      const s = plan.spotAt(t);
      if (!s) return { id: null, T: null };
      let T;
      if (s.kind === "part") T = plan.part(s.part, s.s ?? 0, t, A.room + (s.standby ?? 0));
      else if (s.kind === "desk") T = plan.handDown(t) ? spec.hand.skin : plan.desk(plan.printSDF(s.point[0], s.point[2]), 1, t);
      else T = A.wall;
      return { id: s.id, T };
    },

    /** sound/picture events, all from the same times */
    events() {
      const ev = [];
      if (src.cpu) ev.push({ t: src.cpu.on, kind: "spin" }, { t: src.cpu.on + 0.25, kind: "fan", dur: src.cpu.off - src.cpu.on }, { t: src.cpu.off, kind: "down" });
      if (src.display) ev.push({ t: src.display.on, kind: "display" });
      ev.push({ t: H.contact[0], kind: "touch" }, { t: H.contact[1], kind: "lift" });
      return ev.sort((a, b) => a.t - b.t);
    },
  };
  return plan;
}

/** ironbow lookup (Node-safe; the HUD scale bar and tests use it; the shader does the same in GLSL) -> [r,g,b] 0..1 sRGB */
export function ironbow(stops, u) {
  u = clamp(u, 0, 1);
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const f = (u - a) / (b - a || 1), A = hex(ca), B = hex(cb);
      return A.map((v, k) => lerp(v, B[k], f));
    }
  }
  return hex(stops[stops.length - 1][1]);
}
