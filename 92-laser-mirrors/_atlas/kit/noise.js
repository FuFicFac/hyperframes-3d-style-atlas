// noise.js — 3D value noise + fbm (pure, seeded, Node-safe). Promoted from the soft-clay pilot (identical).
// noise3(x, y, z, seed) in [0, 1); fbm3(x, y, z, seed, octaves = 3) ~[0, 1] (lacunarity 2.03, gain .5).
// Use for organic vertex wobble, volumetric dents, cloud/blob displacement without UVs.
// 2D: valueNoise2 / fbm2 (moved here from textures.js in pass 6 so Node planners can import them without THREE;
// textures.js re-exports them, code unchanged).
import { hash01, lerp } from "./time.js";
export function h3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1440662683) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm = (x) => x * x * (3 - 2 * x);
export function noise3(x, y, z, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => h3(ix + dx, iy + dy, iz + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
export function fbm3(x, y, z, seed = 1, oct = 3) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let o = 0; o < oct; o++) { s += a * noise3(x * f, y * f, z * f, seed + o * 101); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}


// ---------- 2D value noise (pure; moved from textures.js, pass 6) ----------

/** Periodic 2D value noise in [0,1). period = lattice cells before it wraps (tileable). */
export function valueNoise2(x, y, seed = 1, period = 256) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (i) => ((i % period) + period) % period;
  const h = (i, j) => hash01(w(i), w(j), seed);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

/** Fractal (fbm) value noise in ~[0,1]. Tileable when `period` divides the sample domain. */
export function fbm2(x, y, { seed = 1, octaves = 4, lacunarity = 2, gain = 0.5, period = 256 } = {}) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + o * 101, period * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

