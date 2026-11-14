// heightfield.js — JSON-describable terrain height fields + gradient-descent paths. PURE: no THREE, no window, no DOM,
// so Node planners (render-sfx / export-spec via scene.config.js) can import it. Moved out of terrain.js in pass 6
// (code unchanged; terrain.js re-exports both). Noise comes from noise.js (fbm2), not textures.js.
import { fbm2 } from "./noise.js";
import { clamp, smoothstep } from "./time.js";

/**
 * heightField(spec) -> h(x, z, { detail = true }) — terrain height in metres, from plain data.
 *   spec: { offset = 0,
 *           terms: [ { type: "bowl", c:[x,z], k:[kx,kz], max }      soft-saturating paraboloid (max*tanh(q/max))
 *                    { type: "gauss", c:[x,z], amp, sigma:[sx,sz] }  hill (amp > 0) or pit (amp < 0)
 *                    { type: "ridge", a:[x,z], b:[x,z], amp, width } gaussian ridge along segment a-b ],
 *           noise: { amp, scale = 6, octaves = 4, seed = 7 } | null   fbm detail, +-amp
 *           island: { rx, rz, edge = .75, drop } | null }             sinks `drop` m outside the ellipse
 *   detail:false omits the noise (use it for smooth gradients, e.g. descent paths or camera rails).
 */
export function heightField(spec = {}) {
  const { offset = 0, terms = [], noise = null, island = null } = spec;
  return (x, z, { detail = true } = {}) => {
    let h = offset;
    for (const k of terms) {
      if (k.type === "bowl") {
        const dx = x - k.c[0], dz = z - k.c[1];
        const q = k.k[0] * dx * dx + k.k[1] * dz * dz;
        h += k.max ? k.max * Math.tanh(q / k.max) : q;
      } else if (k.type === "gauss") {
        const dx = x - k.c[0], dz = z - k.c[1];
        h += k.amp * Math.exp(-((dx * dx) / (k.sigma[0] ** 2) + (dz * dz) / (k.sigma[1] ** 2)) / 2);
      } else if (k.type === "ridge") {
        const [ax, az] = k.a, [bx, bz] = k.b;
        const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
        const u = clamp(((x - ax) * vx + (z - az) * vz) / L2);
        const dx = x - (ax + u * vx), dz = z - (az + u * vz);
        h += k.amp * Math.exp(-(dx * dx + dz * dz) / (2 * k.width * k.width));
      }
    }
    if (noise && detail) {
      const s = noise.scale ?? 6;
      h += noise.amp * (fbm2(x / s + 100, z / s + 100, { seed: noise.seed ?? 7, octaves: noise.octaves ?? 4, period: 4096 }) - 0.5) * 2;
    }
    if (island) {
      const r = Math.hypot(x / island.rx, z / island.rz);
      h -= island.drop * smoothstep(island.edge ?? 0.75, 1, r);
    }
    return h;
  };
}

/**
 * descentPath(h, { start:[x,z], lr, momentum = 0, steps = 8, eps = 1e-3 }) -> [[x,z], ...] (steps + 1 points)
 * Gradient descent (optional momentum) on h(x, z, { detail: false }); a deterministic precompute.
 */
export function descentPath(h, { start, lr, momentum = 0, steps = 8, eps = 1e-3 }) {
  const H = (x, z) => h(x, z, { detail: false });
  let p = [...start], v = [0, 0];
  const out = [[...p]];
  for (let i = 0; i < steps; i++) {
    const g = [(H(p[0] + eps, p[1]) - H(p[0] - eps, p[1])) / (2 * eps), (H(p[0], p[1] + eps) - H(p[0], p[1] - eps)) / (2 * eps)];
    v = [momentum * v[0] - lr * g[0], momentum * v[1] - lr * g[1]];
    p = [p[0] + v[0], p[1] + v[1]];
    out.push([...p]);
  }
  return out;
}

