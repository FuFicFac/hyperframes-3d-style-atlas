// styles/inflatable/style.js — "Inflatable": glossy vinyl and mirror-foil balloon objects in a bright seamless studio.
//
// HOW THE SKIN WORKS (the signature mechanic). Every inflatable is a 2D outline (glyph, digit, star, heart, arrow,
// speech bubble, any polygon). At build time a regular vertex grid is laid over the outline and a signed distance
// field is sampled at every vertex (distance to the edge, the arc-length phase of the nearest edge point, the inward
// gradient) plus a mask texture (d, wrinkle phase, along-edge variation). The flat grid is cut to the outline by that
// mask (alphaMap + alphaTest at d = 0, so shadows cut the same way). EVERY FRAME, skin.update(pose) rebuilds both
// layers (front and back) from the flat grid: pillow height = profile(distance-to-edge) x an air front that spreads
// from the middle out x fill^.6, the edge pulls in and scallops between pinch points, crumple fades with fill, then
// squeeze / squash / fold deformations; normals are recomputed. Nothing is carried between frames.
// Wrinkles radiating from the seam and the welded flange are drawn in the fragment shader from the mask (phase lines
// are perpendicular to the edge), so they stay crisp at any mesh resolution; their amplitude follows fill.
//
// FONTS: letters are traced from a macOS system face (Arial Rounded MT Bold). `await loadFonts()` before building
// letters (scene.js does it with top-level await).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { createCyclorama, contactShadow } from "../../kit/builders.js";
import { studioEnvironment } from "../../kit/studio.js";
import { glyphOutline, kerning, loadFonts as kitLoadFonts } from "../../kit/fontoutline.js";
import { getOverlay } from "../../kit/overlay.js";
import { overlayText } from "../../kit/callouts.js";
import { liveTube } from "../../kit/paths.js";
import { uploadTexture } from "../../kit/textures.js";
import { fbm3 } from "../../kit/noise.js";
import { clamp, lerp, smoothstep, toEase } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as inflate from "./inflate.js";
export { STYLE_SPEC };
export { inflate };

const TAU = Math.PI * 2;

/** loadFonts(spec) -> Promise<{ family: bool }>: wait for the system face before tracing letters. */
export async function loadFonts(spec = STYLE_SPEC) {
  return kitLoadFonts({ load: spec.font.load, families: ["Arial Rounded MT Bold"], timeout: 3000 });
}

// ------------------------------------------------------------------------------------------------ distance field
/**
 * buildField(loops, lambda) -> field: segments of every loop (outer + holes) with arc length; per loop the wrinkle
 *   period is adjusted so the loop holds a whole number of periods (no phase seam). field.sampleGrid(x0, y0, step,
 *   nx, ny) -> { d (signed, + inside), ph (phase rad), loop } Float32Arrays, scanline inside test + bucketed nearest.
 */
function buildField(loops, lambda) {
  const segs = [];
  let li = 0;
  const all = [];
  for (const L of loops) { all.push(L.outer); for (const h of L.holes ?? []) all.push(h); }
  for (const pts of all) {
    const n = pts.length;
    let tot = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; tot += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const periods = Math.max(3, Math.round(tot / lambda));
    const k = (periods * TAU) / tot; // phase per metre
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 1e-9) segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], len, s0: s, k, loop: li });
      s += len;
    }
    li++;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) { x0 = Math.min(x0, s.ax, s.bx); x1 = Math.max(x1, s.ax, s.bx); y0 = Math.min(y0, s.ay, s.by); y1 = Math.max(y1, s.ay, s.by); }
  const C = Math.max(x1 - x0, y1 - y0) / 28, G = 30;
  const gx0 = x0 - C, gy0 = y0 - C;
  const cells = Array.from({ length: G * G }, () => []);
  const ci = (v, o) => clamp(Math.floor((v - o) / C), 0, G - 1);
  segs.forEach((s, i) => {
    for (let iy = ci(Math.min(s.ay, s.by), gy0); iy <= ci(Math.max(s.ay, s.by), gy0); iy++)
      for (let ix = ci(Math.min(s.ax, s.bx), gx0); ix <= ci(Math.max(s.ax, s.bx), gx0); ix++) cells[iy * G + ix].push(i);
  });
  function nearest(px, py) {
    const cx = ci(px, gx0), cy = ci(py, gy0);
    let best = Infinity, bs = -1, bu = 0;
    const seen = new Set();
    for (let r = 0; r < G; r++) {
      for (let iy = cy - r; iy <= cy + r; iy++) {
        if (iy < 0 || iy >= G) continue;
        for (let ix = cx - r; ix <= cx + r; ix++) {
          if (ix < 0 || ix >= G) continue;
          if (r > 0 && iy !== cy - r && iy !== cy + r && ix !== cx - r && ix !== cx + r) continue;
          for (const i of cells[iy * G + ix]) {
            if (seen.has(i)) continue;
            seen.add(i);
            const s = segs[i];
            const ex = s.bx - s.ax, ey = s.by - s.ay;
            const u = clamp(((px - s.ax) * ex + (py - s.ay) * ey) / (s.len * s.len));
            const qx = s.ax + ex * u - px, qy = s.ay + ey * u - py;
            const dd = qx * qx + qy * qy;
            if (dd < best) { best = dd; bs = i; bu = u; }
          }
        }
      }
      // distance from the query to any cell outside ring r is at least (r - 1) * C (query may sit outside the grid)
      const outside = Math.max(0, gx0 - px, px - (gx0 + G * C), gy0 - py, py - (gy0 + G * C));
      if (bs >= 0 && Math.sqrt(best) <= r * C - outside) break;
    }
    const s = segs[bs];
    return { d: Math.sqrt(best), ph: (s.s0 + bu * s.len) * s.k, loop: s.loop };
  }
  function rowCrossings(y) {
    const xs = [];
    for (const s of segs) {
      if ((s.ay > y) !== (s.by > y)) xs.push(s.ax + ((y - s.ay) * (s.bx - s.ax)) / (s.by - s.ay));
    }
    return xs.sort((a, b) => a - b);
  }
  function sampleGrid(sx, sy, step, nx, ny, stepY = step) {
    const N = nx * ny, d = new Float32Array(N), ph = new Float32Array(N), loop = new Uint8Array(N);
    for (let j = 0; j < ny; j++) {
      const y = sy + j * stepY, xs = rowCrossings(y);
      let p = 0;
      for (let i = 0; i < nx; i++) {
        const x = sx + i * step;
        while (p < xs.length && xs[p] < x) p++;
        const inside = p % 2 === 1;
        const q = nearest(x, y), k = j * nx + i;
        d[k] = inside ? q.d : -q.d;
        ph[k] = q.ph;
        loop[k] = q.loop;
      }
    }
    return { d, ph, loop };
  }
  return { segs, bounds: { min: [x0, y0], max: [x1, y1] }, nearest, sampleGrid };
}

// ------------------------------------------------------------------------------------------------ skin
/**
 * makeSkin(loops, { finish, cell, seed, K }) -> { geometry, mask, info, update(pose) -> stats }
 *   K = spec.skin. Geometry: front grid then back grid (same uv), indexed, cut by the mask texture.
 */
function makeSkin(loops, o) {
  const K = o.K, cell = o.cell ?? K.cell, finish = o.finish ?? "vinyl";
  const field = buildField(loops, K.wrinkle.lambda);
  const fat = o.fatten ?? 0;
  const B = field.bounds, pad = K.seam + cell * 3 + fat;
  const bx0 = B.min[0] - pad, by0 = B.min[1] - pad, bw = B.max[0] - B.min[0] + pad * 2, bh = B.max[1] - B.min[1] + pad * 2;
  const nx = Math.ceil(bw / cell) + 1, ny = Math.ceil(bh / cell) + 1;
  const F = field.sampleGrid(bx0, by0, cell, nx, ny);
  if (fat) for (let v = 0; v < F.d.length; v++) F.d[v] += fat;   // dilate the outline (chubbier letters)
  // keep vertices near/inside the outline, and quads with any corner inside
  const keep = new Int32Array(nx * ny).fill(-1);
  const quads = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, dq = c + 1;
    if (F.d[a] > 0 || F.d[b] > 0 || F.d[c] > 0 || F.d[dq] > 0) quads.push([a, b, c, dq]);
  }
  const ids = [];
  for (const q of quads) for (const v of q) if (keep[v] < 0) { keep[v] = ids.length; ids.push(v); }
  const N = ids.length;
  const X = new Float32Array(N), Y = new Float32Array(N), D = new Float32Array(N), PH = new Float32Array(N);
  const GX = new Float32Array(N), GY = new Float32Array(N), P = new Float32Array(N), CR = new Float32Array(N), WX = new Float32Array(N), WY = new Float32Array(N);
  const at = (i, j) => F.d[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
  let inr = 0;
  for (let k = 0; k < N; k++) {
    const v = ids[k], i = v % nx, j = (v / nx) | 0;
    X[k] = bx0 + i * cell; Y[k] = by0 + j * cell; D[k] = F.d[v]; PH[k] = F.ph[v];
    let gx = (at(i + 1, j) - at(i - 1, j)) / (2 * cell), gy = (at(i, j + 1) - at(i, j - 1)) / (2 * cell);
    const gl = Math.hypot(gx, gy) || 1; GX[k] = gx / gl; GY[k] = gy / gl;
    inr = Math.max(inr, D[k]);
  }
  // pillow profile: circular cap from distance-to-edge (vertical tangent at the seam), blurred over the medial ridge
  const R = Math.max(cell * 4, inr * K.tube);
  const prof = new Float32Array(nx * ny);
  for (let v = 0; v < nx * ny; v++) {
    const dd = Math.max(0, F.d[v] - K.seam);
    prof[v] = dd >= R ? 1 : Math.sqrt(Math.max(0, R * R - (R - dd) * (R - dd))) / R;
  }
  let blur = prof;
  for (let p = 0; p < K.blur; p++) {
    const nb = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      if (F.d[v] <= K.seam) { nb[v] = 0; continue; }
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const ww = di === 0 && dj === 0 ? 2 : 1;
        s += blur[jj * nx + ii] * ww; w += ww;
      }
      nb[v] = s / w;
    }
    blur = nb;
  }
  let pmax = 0;
  for (let k = 0; k < N; k++) {
    const v = ids[k], dd = Math.max(0, D[k] - K.seam);
    const e = smoothstep(0, R * 0.55, dd);
    P[k] = lerp(prof[v], blur[v], e);
    pmax = Math.max(pmax, P[k]);
  }
  const seed = o.seed ?? 7;
  for (let k = 0; k < N; k++) {
    P[k] /= pmax || 1;
    CR[k] = (fbm3(X[k] * K.crumpleFreq, Y[k] * K.crumpleFreq, 0.37, seed, 3) - 0.5) * 2;
    WX[k] = (fbm3(X[k] * 2.1, Y[k] * 2.1, 5.1, seed + 11, 2) - 0.5) * 2;
    WY[k] = (fbm3(X[k] * 2.1, Y[k] * 2.1, 9.7, seed + 23, 2) - 0.5) * 2;
  }
  const crown = (finish === "foil" ? K.foilThick : K.vinylThick) * Math.min(R, K.crownCap ?? 0.2);

  // geometry: front (k) + back (N + k)
  const pos = new Float32Array(N * 6), uv = new Float32Array(N * 4);
  for (let k = 0; k < N; k++) {
    const u = (X[k] - bx0) / bw, v = (Y[k] - by0) / bh;
    uv[k * 2] = u; uv[k * 2 + 1] = v; uv[(N + k) * 2] = u; uv[(N + k) * 2 + 1] = v;
  }
  const idx = [];
  for (const [a, b, c, dq] of quads) {
    const A = keep[a], Bv = keep[b], Cv = keep[c], Dv = keep[dq];
    idx.push(A, Bv, Dv, A, Dv, Cv);                       // front faces +z
    idx.push(N + A, N + Dv, N + Bv, N + A, N + Cv, N + Dv); // back faces -z
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(N * 2 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));

  // mask texture: R,B = cos/sin wrinkle phase, G = signed distance (0.5 at the edge), A = along-edge variation
  const mw = Math.min(K.maskMax, Math.ceil(bw / K.maskPx)), mh = Math.min(K.maskMax, Math.ceil(bh / K.maskPx));
  const MF = field.sampleGrid(bx0 + bw / mw / 2, by0 + bh / mh / 2, bw / mw, mw, mh, bh / mh);
  if (fat) for (let v = 0; v < MF.d.length; v++) MF.d[v] += fat;
  const DR = K.dRange ?? 0.08;
  const data = new Uint8Array(mw * mh * 4);
  for (let k = 0; k < mw * mh; k++) {
    const ph = MF.ph[k], lp = MF.loop[k];
    data[k * 4] = Math.round(255 * (0.5 + 0.5 * Math.cos(ph)));
    data[k * 4 + 1] = Math.round(255 * clamp(0.5 + MF.d[k] / (2 * DR)));
    data[k * 4 + 2] = Math.round(255 * (0.5 + 0.5 * Math.sin(ph)));
    data[k * 4 + 3] = Math.round(255 * clamp(0.5 + 0.32 * Math.sin(ph / 6.3 + lp * 1.7) + 0.18 * Math.sin(ph / 2.7 + 0.9)));
  }
  const mask = new THREE.DataTexture(data, mw, mh, THREE.RGBAFormat, THREE.UnsignedByteType);
  mask.colorSpace = THREE.NoColorSpace;
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.generateMipmaps = true;
  mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
  mask.needsUpdate = true;

  const BB = { min: [B.min[0] - fat, B.min[1] - fat], max: [B.max[0] + fat, B.max[1] + fat] };
  const cx = (BB.min[0] + BB.max[0]) / 2, cy = (BB.min[1] + BB.max[1]) / 2, hw = (BB.max[0] - BB.min[0]) / 2, hh = (BB.max[1] - BB.min[1]) / 2;
  const info = { bounds: BB, fatten: fat, cx, cy, hw, hh, R, crown, N, inradius: inr, dRange: DR, quads: quads.length };

  // valve / neck anchors (vertex indices)
  let valveK = 0, neckK = 0, best = -Infinity, low = Infinity;
  for (let k = 0; k < N; k++) {
    const yRel = (Y[k] - BB.min[1]) / (2 * hh);
    const score = P[k] - 2.2 * yRel - 0.4 * Math.abs((X[k] - cx) / hw + 0.35);
    if (P[k] > 0.55 && score > best) { best = score; valveK = k; }
    if (D[k] >= 0 && D[k] <= K.seam * 0.5 && Math.abs(X[k] - cx) < hw * 0.6 && Y[k] < low) { low = Y[k]; neckK = k; }
  }
  info.valveK = valveK; info.neckK = neckK;

  const nor = geometry.attributes.normal.array;
  /** update(pose) — rebuild both layers from the flat grid. Returns { minY(a, sy), ... } helpers for floor contact. */
  function update(Pz) {
    const f = clamp(Pz.fill), limp = (1 - f) ** 1.5;
    const th = K.front * (1 - f) * 1.15 - 0.1;
    const amp = crown * f ** 0.6 * (1 + (Pz.bulge ?? 0));
    const pull = K.pull * crown * f ** 1.2;
    const q = Pz.squeeze ?? 0, qs = Pz.squeezeSide ?? 1;
    const sq = Pz.squash ?? 0, sd = Pz.squashDir ?? 1;
    const fold = (Pz.fold ?? 0) * (Pz.foldAngle ?? 1.25);
    const yF = BB.min[1] + hh * 2 * 0.42, band = hh * 2 * 0.12;
    const cr = K.crumple * limp, wob = K.wobbleXY * limp;
    for (let k = 0; k < N; k++) {
      let x = X[k], y = Y[k];
      const p = P[k];
      const w = smoothstep(th - 0.3, th + 0.05, p);
      let z = amp * p * w;
      // edge pull-in with scallops between pinch points (the outline shrinks as the skin puffs)
      const dl = pull * (1 - p) ** 1.5 * (1 + K.scallop * Math.cos(PH[k] / K.scallopEvery));
      x += GX[k] * dl + WX[k] * wob;
      y += GY[k] * dl + WY[k] * wob;
      // squeeze: the air shifts toward side qs; the squeezed half thins, the other bulges and pushes out
      if (q > 0) {
        const u = clamp(((x - cx) / hw) * qs, -1, 1);
        z *= Math.max(0.15, 1 + q * 0.9 * u);
        x += qs * q * 0.22 * hw * (u + 1) * (u + 1) * 0.25;
        y += (y - cy) * q * 0.06 * Math.max(0, u);
      }
      // contact squash on side sd: the near half flattens, the shape spreads vertically and puffs a little
      if (sq > 0) {
        const rel = x - cx;
        x = cx + rel * (1 - sq * (rel * sd > 0 ? 1 : 0.25));
        y = cy + (y - cy) * (1 + sq * 0.35);
        z *= 1 + sq * 0.3;
      }
      let zb = CR[k] * cr;
      let zf = zb + z, zk = zb - z;
      // fold: the upper part bends forward about a soft hinge band (deflate sag)
      if (fold !== 0) {
        const a = fold * smoothstep(yF - band, yF + band, y);
        if (a !== 0) {
          const ca = Math.cos(a), sa = Math.sin(a), ry = y - yF;
          const yfA = yF + ry * ca - zf * sa, zfA = ry * sa + zf * ca;
          const ykA = yF + ry * ca - zk * sa, zkA = ry * sa + zk * ca;
          const i3 = k * 3, j3 = (N + k) * 3;
          pos[i3] = x; pos[i3 + 1] = yfA; pos[i3 + 2] = zfA;
          pos[j3] = x; pos[j3 + 1] = ykA; pos[j3 + 2] = zkA;
          continue;
        }
      }
      const i3 = k * 3, j3 = (N + k) * 3;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = zf;
      pos[j3] = x; pos[j3 + 1] = y; pos[j3 + 2] = zk;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.attributes.normal.needsUpdate = true;
  }
  /** lowest world-y offset (relative to the pivot at outline bottom) for a pivot tilt `a` (0 upright, pi/2 lying) and y scale. */
  function minY(a, sy) {
    const ca = Math.cos(a), sa = Math.sin(a);
    let m = Infinity;
    for (let k = 0; k < N; k++) {
      if (D[k] < 0) continue;
      for (const kk of [k, N + k]) {
        const v = (pos[kk * 3 + 1] - BB.min[1]) * sy * ca + pos[kk * 3 + 2] * sa;
        if (v < m) m = v;
      }
    }
    return m;
  }
  const vertex = (k, out = new THREE.Vector3()) => out.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const normal = (k, out = new THREE.Vector3()) => out.set(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]);
  return { geometry, mask, info, update, minY, vertex, normal, field };
}

// ------------------------------------------------------------------------------------------------ material
const SKIN_GLSL_COMMON = /* glsl */ `
uniform float uLimpReach, uFill, uWrAmp, uWrReach, uWrResid, uWrLimp, uWrOct, uSeam, uDRange, uWeldAmp, uWeldDark, uWeldRough, uRidges;
// Mikkelsen bump with UNNORMALISED screen derivatives (scaled x1000 to keep numbers away from denormals): height is
// in metres, so wrinkle depth does not change with distance or resolution. Guarded against a zero vector (NaN).
vec3 ifPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surf_pos) * 1000.0, sy = dFdy(surf_pos) * 1000.0;
  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * 1000.0 * r1 + dHdxy.y * 1000.0 * r2);
  vec3 n = abs(det) * surf_norm - grad;
  float l2 = dot(n, n);
  return l2 > 1e-20 ? n * inversesqrt(l2) : surf_norm;
}
`;

function skinMaterial(base, mask, U) {
  const m = base.clone();
  m.alphaMap = mask;
  m.alphaTest = 0.5;
  m.side = THREE.FrontSide;
  const uniforms = {
    uLimpReach: { value: U.limpReach }, uFill: { value: 0 }, uWrAmp: { value: U.amp }, uWrReach: { value: U.reach }, uWrResid: { value: U.resid }, uWrLimp: { value: U.limp },
    uWrOct: { value: U.octave }, uSeam: { value: U.seam }, uDRange: { value: U.dRange }, uWeldAmp: { value: U.weldAmp },
    uWeldDark: { value: U.weldDark }, uWeldRough: { value: U.weldRough }, uRidges: { value: U.ridges },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + SKIN_GLSL_COMMON)
      .replace("#include <color_fragment>", `#include <color_fragment>
  vec4 ifM = texture2D(alphaMap, vAlphaMapUv);
  float ifD = (ifM.g - 0.5) * 2.0 * uDRange;
  vec2 ifCS = ifM.rb * 2.0 - 1.0;
  float ifLimp = 1.0 - uFill;
  float ifReach = uWrReach * (1.0 + uLimpReach * ifLimp);
  float ifAmp = uWrAmp * (0.45 + ifM.a) * exp(-max(ifD - uSeam, 0.0) / ifReach) * mix(uWrResid, 1.0 + uWrLimp, ifLimp);
  float ifH = ifAmp * (ifCS.x + uWrOct * (ifCS.x * ifCS.x - ifCS.y * ifCS.y)) * smoothstep(uSeam * 0.7, uSeam * 1.25, ifD);
  // anti-alias: fade wrinkles where one wrinkle period shrinks to a couple of pixels (grazing views, distance)
  float ifFw = length(fwidth(ifCS));
  ifH *= 1.0 - smoothstep(0.35, 0.9, ifFw);
  float ifT = clamp(ifD / uSeam, 0.0, 1.0);
  float ifSeam = 1.0 - smoothstep(0.86, 1.04, ifT);
  ifH += uWeldAmp * sin(ifT * 3.14159265 * uRidges) * ifSeam;
  diffuseColor.rgb *= 1.0 - uWeldDark * ifSeam;`)
      .replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\n  diffuseColor.a = 1.0;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, max(roughnessFactor, uWeldRough), ifSeam);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n  normal = ifPerturb(-vViewPosition, normal, vec2(dFdx(ifH), dFdy(ifH)), faceDirection);")
      .replace("#include <clearcoat_normal_fragment_begin>", "#ifdef USE_CLEARCOAT\n  vec3 clearcoatNormal = normal;\n#endif");
  };
  m.customProgramCacheKey = () => "inflatable-skin-v1";
  return m;
}

// ------------------------------------------------------------------------------------------------ style
/**
 * createStyle(stage, opts?) -> style. opts: { post = true }.
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, SK = spec.skin;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const studio = studioEnvironment(stage, spec.studio, {});
  studio.set({ level: 1 });

  const colorOf = (c) => (P[c] ?? c);
  const finishBase = (finish) => {
    const m = (finish === "foil" ? materials.foil : materials.vinyl).clone();
    const Fz = spec.finishes[finish] ?? {};
    for (const [k, v] of Object.entries(Fz)) if (k in m) m[k] = v;
    return m;
  };

  // ---- glyph outlines (metres, pen origin at 0, baseline y = 0)
  const glyphLoops = (ch, cap, font = spec.font.family) => {
    const g = glyphOutline(ch, { font, tracePx: spec.font.tracePx, simplify: spec.font.simplify });
    const s = cap / g.capPx;
    return {
      loops: g.shapes.map(({ outer, holes }) => ({ outer: outer.map(([x, y]) => [x * s, y * s]), holes: holes.map((h) => h.map(([x, y]) => [x * s, y * s])) })),
      advance: g.advance * s, inkL: g.inkL * s, inkR: g.inkR * s,
    };
  };

  /**
   * inflatable(loops, { finish = "vinyl"|"foil", color, seed, valve = "front"|"neck"|null, cell, id }) -> Group
   *   A balloon/pool-toy skin from any 2D outline (metres, y up). Pivot = bottom centre of the outline, on the floor.
   *   userData.setPose(pose) (pose from inflate.js plan.pose(id, t)), userData.skin, userData.info,
   *   userData.tie() -> world point under the neck (ribbon tie), userData.home.
   */
  function inflatable(loops, o = {}) {
    const finish = o.finish ?? "vinyl";
    const skin = makeSkin(loops, { finish, K: SK, cell: o.cell, seed: o.seed, fatten: o.fatten ?? (o.isGlyph ? SK.fattenGlyph : 0) });
    uploadTexture(stage, skin.mask);
    const W = SK.wrinkle, WD = SK.weld;
    const mat = skinMaterial(finishBase(finish), skin.mask, {
      amp: W.amp * (finish === "foil" ? W.foilAmp : 1), reach: W.reach, resid: W.resid * (finish === "foil" ? 1.6 : 1), limp: finish === "foil" ? W.foilLimp : W.limp, limpReach: W.limpReach, octave: W.octave,
      seam: SK.seam, dRange: skin.info.dRange, weldAmp: WD.amp, weldDark: WD.darken * (finish === "foil" ? 0.5 : 1), weldRough: WD.rough, ridges: WD.ridges,
    });
    mat.color.set(colorOf(o.color ?? (finish === "foil" ? "gold" : "pink")));
    mat.name = `skin-${finish}`;
    const mesh = new THREE.Mesh(skin.geometry, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = o.id ?? "inflatable";
    const I = skin.info;
    mesh.position.set(-I.cx, -I.bounds.min[1], 0);
    const scaler = new THREE.Group(), pivot = new THREE.Group(), group = new THREE.Group();
    scaler.add(mesh); pivot.add(scaler); group.add(pivot);
    group.name = o.id ?? "inflatable";

    // valve (vinyl: a little plug on the front skin) or neck tab (foil: a crimped tab under the bottom edge)
    let valve = null, neck = null;
    const V = spec.valve, sz = clamp(I.hh / 0.55, 0.6, 1.4);
    if ((o.valve ?? (finish === "foil" ? "neck" : "front")) === "front") {
      const vm = materials.valve.clone();
      vm.color.set(colorOf(o.color ?? "pink")).lerp(new THREE.Color("#ffffff"), 0.45);
      valve = new THREE.Group();
      const baseM = new THREE.Mesh(new THREE.CylinderGeometry(V.r * sz, V.r * sz * 1.08, V.h * sz, 28), vm);
      const capM = new THREE.Mesh(new THREE.CylinderGeometry(V.capR * sz * 0.9, V.capR * sz, V.capH * sz, 24), vm);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(V.r * sz * 0.75, V.h * sz * 0.22, 8, 24, Math.PI * 0.9), vm);
      baseM.position.y = V.h * sz * 0.5; capM.position.y = V.h * sz + V.capH * sz * 0.5;
      strap.rotation.x = Math.PI / 2; strap.position.set(V.r * sz * 0.9, V.h * sz * 0.6, 0); strap.rotation.z = 0.4;
      valve.add(baseM, capM, strap);
      valve.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      mesh.add(valve);
    } else if ((o.valve ?? "neck") === "neck") {
      const nm = finishBase(finish);
      nm.color.copy(mat.color);
      neck = new THREE.Group();
      const tab = new THREE.Mesh(new THREE.BoxGeometry(V.neck.w * sz, V.neck.l * sz, 0.006), nm);
      tab.position.y = -V.neck.l * sz * 0.5;
      const crimp = new THREE.Mesh(new THREE.CylinderGeometry(V.neck.w * sz * 0.32, V.neck.w * sz * 0.32, 0.03 * sz, 16), nm);
      crimp.position.y = -V.neck.l * sz * 0.92;
      neck.add(tab, crimp);
      neck.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      mesh.add(neck);
      neck.userData.tieLocal = new THREE.Vector3(0, -V.neck.l * sz - 0.01, 0);
    }

    const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
    group.userData = {
      skin, info: I, mesh, pivot, scaler, material: mat, valve, neck, finish, home: [0, 0, 0],
      /** setPose(pose): rebuild the skin from the flat outline and place the object (floor contact solved exactly). */
      setPose(Pz) {
        mat.userData.uniforms.uFill.value = clamp(Pz.fill);
        skin.update(Pz);
        const stand = Pz.stand ?? 1;
        const a = (1 - stand) * (Math.PI / 2);
        const sy = Pz.sy ?? 1, sx = Pz.sx ?? 1;
        scaler.scale.set(sx, sy, 1);
        pivot.rotation.set(-a, 0, (Pz.rock ?? 0) + (Pz.sway ?? 0));
        const m = skin.minY(a, sy);
        pivot.position.set(0, -m + (Pz.lift ?? 0), 0);
        const h = group.userData.home, off = Pz.offset ?? [0, 0, 0];
        group.position.set(h[0] + off[0], h[1] + off[1], h[2] + off[2]);
        if (valve) {
          skin.vertex(I.valveK, _v); skin.normal(I.valveK, _n);
          valve.position.copy(_v).addScaledVector(_n, -0.004);
          valve.quaternion.copy(_q.setFromUnitVectors(UP, _n));
          valve.visible = Pz.fill > 0.25;
          valve.scale.setScalar(clamp((Pz.fill - 0.2) * 2, 0.3, 1));
        }
        if (neck) {
          skin.vertex(I.neckK, _v);
          neck.position.copy(_v);
        }
      },
      /** tie() -> world position of the ribbon tie point (bottom of the neck, or the bottom centre). */
      tie(out = new THREE.Vector3()) {
        group.updateWorldMatrix(true, true);
        if (neck) return neck.localToWorld(out.copy(neck.userData.tieLocal));
        return mesh.localToWorld(skin.vertex(I.neckK, out));
      },
    };
    group.userData.setPose({ fill: o.fill ?? 0, stand: o.fill ?? 0 });
    return group;
  }

  /** letter(ch, { cap, finish, color, ... }) -> inflatable Group (+ userData.advance, inkL, inkR). */
  function letter(ch, o = {}) {
    const cap = o.cap ?? 1.1;
    const gl = glyphLoops(ch, cap, o.font);
    const obj = inflatable(gl.loops, { isGlyph: true, ...o });
    Object.assign(obj.userData, { advance: gl.advance, inkL: gl.inkL, inkR: gl.inkR, ch });
    return obj;
  }

  /**
   * word(text, { cap, colors[], finish, tracking, ids }) -> { group, letters: [Group], ids, width, layout }
   *   Letters laid out with kerning + spec.font.tracking; each letter is its own inflatable (centred at its slot x).
   *   letters[i].userData.home is set to its slot (relative to the word group, which sits at x = 0 centre).
   */
  function word(text, o = {}) {
    const cap = o.cap ?? 1.1, tracking = o.tracking ?? spec.font.tracking;
    const chars = [...text];
    const colors = o.colors ?? ["pink", "lemon", "mint", "sky", "tangerine", "grape"];
    const font = o.font ?? spec.font.family;
    let pen = 0;
    const slots = [];
    chars.forEach((ch, i) => {
      const g = glyphOutline(ch, { font, tracePx: spec.font.tracePx, simplify: spec.font.simplify });
      const s = cap / g.capPx;
      if (i > 0) pen += kerning(chars[i - 1], ch, font, spec.font.tracePx) * s;
      slots.push({ ch, x: pen, inkL: g.inkL * s, inkR: g.inkR * s, adv: g.advance * s });
      pen += g.advance * s + tracking * cap;
    });
    const x0 = slots[0].x + slots[0].inkL, x1 = slots[slots.length - 1].x + slots[slots.length - 1].inkR, width = x1 - x0;
    const group = new THREE.Group();
    const letters = [], ids = [];
    slots.forEach((sl, i) => {
      if (sl.ch === " ") return;
      const id = (o.ids?.[i]) ?? `${o.prefix ?? "w"}${i}`;
      const L = letter(sl.ch, { cap, font, finish: o.finish, color: colors[i % colors.length], seed: 31 + i * 7, id, valve: o.valve });
      const cx = L.userData.info.cx;
      L.userData.home = [sl.x + cx - x0 - width / 2, 0, 0];
      group.add(L);
      letters.push(L); ids.push(id);
    });
    return { group, letters, ids, width, cap };
  }

  const shape = (loops, o) => inflatable(loops, o);
  const factoriesOutline = inflate.OUTLINES;

  /** studioSet({ width, depth, height, radius, z }) -> the bright seamless sweep (receives shadows). */
  function studioSet(o = {}) {
    const S = { ...spec.set, ...o };
    const m = createCyclorama({ width: S.width, depth: S.depth, height: S.height, radius: S.radius, material: materials.sweep });
    m.position.z = S.z + S.depth / 2 - S.depth / 2;
    m.position.z = S.z + S.depth / 2;
    m.receiveShadow = true;
    m.name = "studioSet";
    return m;
  }

  /** contact(obj) -> soft contact blob under an inflatable; userData.update() follows the object (call after setPose). */
  function contact(obj, o = {}) {
    const I = obj.userData.info;
    const c = contactShadow({ w: I.hw * 2.3, d: Math.max(0.5, I.hw * 0.9), opacity: o.opacity ?? spec.set.contact });
    const _p = new THREE.Vector3();
    c.userData.update = (Pz) => {
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(_p);
      const air = Math.max(0, _p.y - (obj.userData.home[1] ?? 0)) + (Pz.lift ?? 0);
      const stand = clamp(Pz.stand ?? 1);
      c.position.set(_p.x, 0.004, _p.z + (1 - stand) * -I.hh);
      c.scale.set(1, 1 + (1 - stand) * 2.2, 1);
      c.material.opacity = (o.opacity ?? spec.set.contact) * (0.35 + 0.65 * clamp(Pz.fill * 1.4)) / (1 + air * 2.5);
    };
    return c;
  }

  /** weight({ color }) -> a small foil-wrapped balloon weight (cylinder with a crinkled top). */
  function weight(o = {}) {
    const Wt = spec.weight;
    const m = materials.weight.clone();
    if (o.color) m.color.set(colorOf(o.color));
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(Wt.r * 0.92, Wt.r, Wt.h, 32), m);
    body.position.y = Wt.h / 2;
    const top = new THREE.Mesh(new THREE.SphereGeometry(Wt.r * 0.55, 20, 10, 0, TAU, 0, Math.PI / 2), m);
    top.position.y = Wt.h; top.scale.y = 0.6;
    g.add(body, top);
    g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    g.userData.top = new THREE.Vector3(0, Wt.h * 1.25, 0);
    return g;
  }

  /**
   * ribbon({ color, seed }) -> curly ribbon tube; userData.update(tieWorld, anchorWorld, t, { slack }) draws it from the
   * balloon tie down to the weight: curls near the tie, a gentle sway, sag when slack, never below the floor.
   */
  function ribbon(o = {}) {
    const Rb = { ...spec.ribbon, ...o };
    const m = materials.ribbon.clone();
    if (o.color) m.color.set(colorOf(o.color));
    const tube = liveTube(Rb.n, 6, Rb.r, m);
    tube.name = "ribbon";
    const ph = (o.seed ?? 1) * 1.37;
    const pts = Array.from({ length: Rb.n }, () => [0, 0, 0]);
    tube.userData.update = (A, Bp, t) => {
      const dx = Bp.x - A.x, dy = Bp.y - A.y, dz = Bp.z - A.z;
      const L = Math.hypot(dx, dy, dz);
      const slack = clamp(1.4 - L / 1.6, 0, 1);
      for (let i = 0; i < Rb.n; i++) {
        const u = i / (Rb.n - 1);
        const curl = Math.exp(-u * 5) * Rb.curlR * (1 - slack * 0.5);
        const ang = u * TAU * Rb.curls * 2 + ph;
        const sw = Rb.sway * Math.sin((TAU * t) / Rb.swayPeriod + ph + u * 2.2) * Math.sin(Math.PI * u);
        const sag = Rb.sag * slack * Math.sin(Math.PI * u) * L;
        let x = A.x + dx * u + Math.cos(ang) * curl + sw;
        let y = A.y + dy * u - sag;
        let z = A.z + dz * u + Math.sin(ang) * curl + sw * 0.4;
        y = Math.max(Rb.r * 1.2, y);
        pts[i][0] = x; pts[i][1] = y; pts[i][2] = z;
      }
      tube.userData.set(pts);
    };
    return tube;
  }

  /**
   * caption(stage, beats, { x, y, height, colors, holdLast }) -> overlay Group: a white balloon-pill caption with a
   *   coloured dot, one beat label at a time (beats: [{ t, dur, label }]); pops in (outBack), fades out. update(t).
   */
  function caption(stg, beats, o = {}) {
    const C = { ...spec.caption, ...o }, ov = getOverlay(stg), g = new THREE.Group();
    const colors = (o.colors ?? ["pink", "sky", "lemon", "mint", "grape"]).map(colorOf);
    const H = C.height;
    const items = beats.filter((b) => b.label).map((b, i) => {
      const txt = overlayText(b.label, { height: H, weight: C.weight, tracking: C.tracking, color: P.captionInk, font: C.font });
      const padX = H * C.pad[0], padY = H * C.pad[1], dotS = H * C.dot * 2, gap = H * 0.42;
      const w = padX * 2 + dotS + gap + txt.userData.w - H * 0.24, h = txt.userData.h * 0.62 + padY * 2;
      const r = h / 2;
      const pill = new THREE.Shape();
      pill.moveTo(r, -h / 2); pill.lineTo(w - r, -h / 2); pill.absarc(w - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
      pill.lineTo(r, h / 2); pill.absarc(r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
      const card = new THREE.Mesh(new THREE.ShapeGeometry(pill, 24), new THREE.MeshBasicMaterial({ color: P.captionCard, transparent: true, depthTest: false }));
      const shadow = new THREE.Mesh(card.geometry, new THREE.MeshBasicMaterial({ color: "#3a2a40", transparent: true, depthTest: false }));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(dotS / 2, 40), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, depthTest: false }));
      const shine = new THREE.Mesh(new THREE.CircleGeometry(dotS * 0.16, 20), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthTest: false }));
      shadow.position.set(0.004, -0.009, -0.01);
      dot.position.set(padX + dotS / 2, 0, 0.01);
      shine.position.set(padX + dotS * 0.36, dotS * 0.17, 0.015);
      txt.position.set(padX + dotS + gap + txt.userData.w / 2 - H * 0.12, -H * 0.03, 0.02);
      card.renderOrder = 1; shadow.renderOrder = 0; dot.renderOrder = 2; shine.renderOrder = 3; txt.renderOrder = 4;
      const item = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(shadow, card, dot, shine, txt);
      item.add(inner);
      item.userData = { b, w, h, inner, mats: [card.material, shadow.material, dot.material, shine.material, txt.material], base: [1, C.shadow, 1, 0.9, 1] };
      g.add(item);
      return item;
    });
    ov.add(g);
    const outBack = toEase("outBack");
    g.userData.items = items;
    g.userData.update = (t) => {
      const x0 = C.x * ov.aspect, y0 = C.y;
      items.forEach((it, i) => {
        const { b, inner, h } = it.userData;
        const last = i === items.length - 1 && C.holdLast !== false;
        const off = last ? Infinity : b.t + b.dur - C.fadeOut - 0.05;
        const a = smoothstep(b.t, b.t + C.fadeIn, t) * (Number.isFinite(off) ? 1 - smoothstep(off, off + C.fadeOut, t) : 1);
        it.visible = a > 0.002;
        if (!it.visible) return;
        const s = lerp(0.6, 1, outBack(clamp((t - b.t) / C.pop)));
        it.position.set(x0, y0, 0);
        inner.scale.setScalar(s);
        inner.position.set(0, (1 - s) * h * 0.3, 0);
        it.userData.mats.forEach((m, k) => { m.opacity = a * it.userData.base[k]; });
      });
    };
    g.userData.update(0);
    return g;
  }

  /** tag(stage, text, { from, to, x, y }) -> small overlay sub-caption (e.g. "SAMPLE DATA"); update(t). */
  function tag(stg, text, o = {}) {
    const C = { ...spec.caption.sub, ...o }, ov = getOverlay(stg);
    const txt = overlayText(text, { height: C.height, weight: C.weight, tracking: C.tracking, color: C.color, font: spec.caption.font });
    const g = new THREE.Group();
    g.add(txt);
    ov.add(g);
    g.userData.update = (t) => {
      const a = smoothstep(o.from ?? 0, (o.from ?? 0) + 0.3, t) * (Number.isFinite(o.to ?? Infinity) ? 1 - smoothstep(o.to, o.to + 0.3, t) : 1);
      g.visible = a > 0.002;
      txt.material.opacity = a;
      g.position.set((o.x ?? 0) * ov.aspect + (o.align === "left" ? txt.userData.w / 2 : 0), o.y ?? 0, 0);
    };
    txt.material.transparent = true;
    g.userData.update(0);
    return g;
  }

  const props = {
    inflatable, letter, word, shape,
    digit: (n, o = {}) => letter(String(n), o),
    star: (o = {}) => inflatable(inflate.OUTLINES.star(o.r ?? 0.55, o), o),
    heart: (o = {}) => inflatable(inflate.OUTLINES.heart(o.w ?? 1.1), o),
    arrow: (o = {}) => inflatable(inflate.OUTLINES.arrow(o.len ?? 1.2, o), o),
    bubble: (o = {}) => inflatable(inflate.OUTLINES.bubble(o.w ?? 1.3, o.h ?? 0.9, o), o),
    circle: (o = {}) => inflatable(inflate.OUTLINES.circle(o.r ?? 0.5), o),
    polygon: (pts, o = {}) => inflatable(inflate.OUTLINES.poly(pts, o.round ?? 0.03), o),
    studioSet, contact, weight, ribbon, caption, tag,
  };
  const factories = {
    studioSet: (s) => studioSet(s.dims ?? {}),
  };

  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, sfx: spec.sfx, studio,
    plan: (actors, extra = {}) => inflate.planInflatables(actors, { K: spec.plan, sound: spec.sound, ...extra }),
    motion: inflate,
    helpers: { glyphLoops, makeSkin, outlines: factoriesOutline },
  };
}
