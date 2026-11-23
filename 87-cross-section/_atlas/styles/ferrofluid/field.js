// styles/ferrofluid/field.js — the MAGNETIC FIELD PLAN for "Ferrofluid". Pure functions: no THREE, no window, no DOM.
// Imports only kit/time.js, so scene.config.js (Node: render-sfx, export-spec) and style.js (browser) read the SAME plan:
// the picture's spikes and the SCORE's hum / ticks / plops come from one list of magnets.
//
// A magnet = { id, keys: [{ t, pos: [x, y, z], ease }] } — a closed-form keyed path (y = height above the pool surface).
// Its strength at time t is a pure function of its height: s = smoothstep(far, near, y) ^ curve (0 far away, 1 touching).
// The field on the pool at (x, z) is the sum of Gaussian footprints  F = sum_m s_m * exp(-r_m^2 / sigma^2).
// The shader gets the same numbers (magnets xz + strength) as uniforms every frame; spikes, mound and spacing follow F.
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";

/** keyed path: piecewise, each segment eased by the LATER key's `ease` (default inOutCubic); holds before/after */
export function trackAt(keys, t) {
  if (t <= keys[0].t) return keys[0].pos.slice();
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const u = (ease[b.ease ?? "inOutCubic"] ?? ease.inOutCubic)((t - a.t) / Math.max(b.t - a.t, 1e-6));
      return a.pos.map((v, k) => lerp(v, b.pos[k], u));
    }
  }
  return keys[keys.length - 1].pos.slice();
}

/** strength of one magnet at height y above the pool (F = field spec: { near, far, curve }) */
export function strengthAt(y, F) {
  return smoothstep(F.far, F.near, y) ** (F.curve ?? 1);
}

/** createField(magnets, F) -> plan. F = spec.field: { near, far, curve, sigma, threshold } */
export function createField(magnets, F) {
  const plan = {
    magnets,
    F,
    /** magnetsAt(t) -> [{ id, pos, s }] (pos = world position of the magnet face; s = 0..1) */
    magnetsAt(t) {
      return magnets.map((m) => {
        const pos = trackAt(m.keys, t);
        return { id: m.id, pos, s: strengthAt(pos[1], F) };
      });
    },
    /** field strength on the pool at (x, z) at time t */
    fieldAt(x, z, t, ms = plan.magnetsAt(t)) {
      let f = 0;
      for (const m of ms) {
        const dx = x - m.pos[0], dz = z - m.pos[2];
        f += m.s * Math.exp(-(dx * dx + dz * dz) / (F.sigma * F.sigma));
      }
      return f;
    },
    /** total field "energy" (sum of strengths, 0..n): drives the hum level and the spike spacing */
    total(t) {
      return plan.magnetsAt(t).reduce((a, m) => a + m.s, 0);
    },
    /** peak field on the pool (max over magnets, incl. overlap) */
    peak(t) {
      const ms = plan.magnetsAt(t);
      return ms.reduce((a, m) => Math.max(a, plan.fieldAt(m.pos[0], m.pos[2], t, ms)), 0);
    },
    /**
     * events({ t0, t1, fps, tickStep, humStep }) -> sorted event list for kit/schedule.scoreFromEvents:
     *   erupt    a magnet's strength crosses `threshold` upward  (the crown bursts up)
     *   tick     strength rises through each `tickStep` level, and every ~0.22 s while a strong magnet travels sideways
     *            (new spikes popping up at the leading edge)
     *   collapse strength falls back through `threshold`        (the crown sags into the pool)
     *   hum      one segment every `humStep` s, level = total field (the hum swells with the field)
     * Every event carries pan (from the magnet's x) and the magnet id. Sampled on a fixed grid = deterministic.
     */
    events({ t0 = 0, t1 = 15, fps = 120, tickStep = 0.12, humStep = 0.4, panScale = 0.9, moveTick = 0.22 } = {}) {
      const out = [];
      const dt = 1 / fps;
      const n = Math.round((t1 - t0) * fps);
      let prev = plan.magnetsAt(t0);
      const lastMoveTick = magnets.map(() => -1);
      for (let i = 1; i <= n; i++) {
        const t = t0 + i * dt;
        const cur = plan.magnetsAt(t);
        cur.forEach((m, k) => {
          const p = prev[k];
          const pan = clamp(m.pos[0] * panScale, -1, 1);
          if (p.s < F.threshold && m.s >= F.threshold) out.push({ kind: "erupt", t, id: m.id, pan, level: 1 });
          if (p.s >= F.threshold && m.s < F.threshold) out.push({ kind: "collapse", t, id: m.id, pan, level: 1 });
          if (m.s > p.s && Math.floor(m.s / tickStep) > Math.floor(p.s / tickStep) && m.s > F.threshold * 0.6)
            out.push({ kind: "tick", t, id: m.id, pan, level: m.s });
          const v = Math.hypot(m.pos[0] - p.pos[0], m.pos[2] - p.pos[2]) / dt;
          if (m.s > 0.5 && v > 0.08 && t - lastMoveTick[k] >= moveTick) {
            out.push({ kind: "tick", t, id: m.id, pan, level: m.s * 0.8, moving: true });
            lastMoveTick[k] = t;
          }
        });
        prev = cur;
      }
      for (let t = t0; t < t1 - 1e-6; t += humStep) {
        const tt = Math.round(t * 1000) / 1000;
        out.push({ kind: "hum", t: tt, id: "field", pan: 0, level: plan.total(tt + humStep * 0.5) });
      }
      return out.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
    },
  };
  return plan;
}

/** voices for scoreFromEvents from spec.sound (gains, pitches) */
export function fieldVoices(S) {
  return {
    erupt: (e) => [
      { type: "squish", dur: 0.38, pitch: S.erupt.pitch, gain: S.erupt.gain },
      { type: "bubble", dur: 0.12, pitch: S.erupt.pitch * 1.4, gain: S.erupt.gain * 0.45 },
    ],
    tick: (e) => [{ type: "tick", dur: 0.02, pitch: S.tick.pitch * (0.85 + 0.4 * e.level), gain: S.tick.gain * (e.moving ? 0.8 : 1) * (0.6 + 0.4 * e.level) }],
    collapse: () => [
      { type: "bubble", dur: 0.2, pitch: S.plop.pitch, gain: S.plop.gain },
      { type: "squish", dur: 0.3, pitch: S.plop.pitch * 1.3, gain: S.plop.gain * 0.5 },
    ],
    hum: (e) => (e.level > 0.02 ? [{ type: "hum", dur: S.hum.dur, pitch: 1, gain: S.hum.gain * Math.min(1.4, e.level) }] : []),
  };
}
