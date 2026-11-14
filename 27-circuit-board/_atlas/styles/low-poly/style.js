// styles/low-poly/style.js — Low-Poly Miniature (see STYLE.md and references/kit-api.md).
// Every prop is synchronous and seeded (rng / hash01 only). Props never animate themselves: anything
// time-dependent is exposed as obj.userData.update(t | progress) — a pure function the scene calls
// from renderAt. Faceting = non-indexed geometry + flat normals + one vertex colour per triangle.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { heightField, descentPath } from "../../kit/terrain.js";
import { pop, hopArc } from "../../kit/motion.js";
import { pinToScreen as overlayPin } from "../../kit/overlay.js";
import { rng, hash01, hashString, clamp, lerp, smoothstep, ease } from "../../kit/time.js";
import { burst as kitBurst, groundPulse as kitGroundPulse } from "../../kit/effects.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const seedOf = (s) => (typeof s === "string" ? hashString(s) : (s ?? 1) >>> 0);
const C = (c) => new THREE.Color(c);

// ---------------------------------------------------------------- pure helpers (no THREE state)

// heightField, descentPath, pop, hopArc: promoted to kit/terrain.js + kit/motion.js (identical code).
export { heightField, descentPath, pop, hopArc };

// ---------------------------------------------------------------- geometry helpers

function jitterColor(base, r1, r2, j) {
  const c = base.clone();
  c.offsetHSL((r1 - 0.5) * 2 * (j.hue ?? 0), 0, (r2 - 0.5) * 2 * (j.lightness ?? 0));
  return c;
}

/**
 * facetize(geometry, tone | (faceIndex, centroid, normal) => Color, { jitter, seed }) -> non-indexed geometry
 * with flat normals and one (jittered) vertex colour per triangle.
 */
export function facetize(geometry, tone, { jitter = STYLE_SPEC.terrainColors.jitter, seed = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute?.("uv");
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const base = typeof tone === "function" ? null : C(tone);
  const cen = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f = 0; f < pos.count / 3; f++) {
    cen.set(0, 0, 0);
    for (let k = 0; k < 3; k++) cen.x += pos.getX(f * 3 + k) / 3, cen.y += pos.getY(f * 3 + k) / 3, cen.z += pos.getZ(f * 3 + k) / 3;
    n.set(nor.getX(f * 3), nor.getY(f * 3), nor.getZ(f * 3));
    const b = base ?? C(tone(f, cen, n));
    const c = jitterColor(b, hash01(f, seed, 11), hash01(f, seed, 23), jitter);
    for (let k = 0; k < 3; k++) c.toArray(col, (f * 3 + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Move every vertex by a hash of its quantized position (shared corners stay welded). */
function chip(geometry, amount, seed) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const q = [Math.round(x * 997), Math.round(y * 997), Math.round(z * 997)];
    pos.setXYZ(i, x + (hash01(...q, seed, 1) - 0.5) * amount, y + (hash01(...q, seed, 2) - 0.5) * amount, z + (hash01(...q, seed, 3) - 0.5) * amount);
  }
  pos.needsUpdate = true;
  return geometry;
}

function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------------------------------------------------------------- createStyle

/**
 * createStyle(stage, opts?) -> style      opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const { scene, camera } = stage;

  // sky: world.sky is applied by the kit (applyStyleSpec -> skyTexture); fog colour matches the horizon

  // faceted materials: base colour moves into per-face vertex colours (material colour = white)
  for (const k of ["terrain", "facet", "water", "cloud", "hero", "marker", "pole", "glow"]) {
    const m = materials[k];
    m.userData.tone = m.color.clone();
    m.color.set(0xffffff);
    m.vertexColors = true;
    m.needsUpdate = true;
  }
  const tone = (k) => materials[k].userData.tone;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ------------------------------------------------------------ terrain
  /**
   * terrain({ width = 32, depth = 24, segX = 52, segZ = 40, field | height(x,z), seed = 3, jitter = .32,
   *           range: [lo, hi]?, waterLevel = 0 }) -> Mesh
   *   userData.heightAt(x, z)   exact height of the faceted surface (barycentric on its triangles)
   *   userData.normalAt(x, z)   face normal (THREE.Vector3) under (x, z)
   */
  function terrain(o = {}) {
    const { width = 32, depth = 24, segX = 52, segZ = 40, seed = 3, jitter = 0.32, waterLevel = 0 } = o;
    const h = o.height ?? heightField(o.field ?? { noise: { amp: 1.5, scale: 6, seed } });
    const dx = width / segX, dz = depth / segZ, x0 = -width / 2, z0 = -depth / 2;
    const V = [];
    for (let j = 0; j <= segZ; j++) {
      for (let i = 0; i <= segX; i++) {
        const edge = i === 0 || j === 0 || i === segX || j === segZ;
        const x = x0 + i * dx + (edge ? 0 : (hash01(i, j, seed, 5) - 0.5) * 2 * jitter * dx);
        const z = z0 + j * dz + (edge ? 0 : (hash01(i, j, seed, 9) - 0.5) * 2 * jitter * dz);
        V.push([x, h(x, z), z]);
      }
    }
    const vid = (i, j) => j * (segX + 1) + i;
    const tris = []; // per cell: two triangles (alternating diagonal), each [a,b,c] counter-clockwise from above
    for (let j = 0; j < segZ; j++) {
      for (let i = 0; i < segX; i++) {
        const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
        if ((i + j) % 2) tris.push([a, c, b], [b, c, d]);
        else tris.push([a, c, d], [a, d, b]);
      }
    }
    const pos = new Float32Array(tris.length * 9);
    tris.forEach((t, f) => t.forEach((v, k) => pos.set(V[v], f * 9 + k * 3)));
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const ys = V.map((v) => v[1]).filter((y) => y > waterLevel);
    const [lo, hi] = o.range ?? [waterLevel, Math.max(...ys)];
    const TC = spec.terrainColors;
    const bands = TC.bands.map(([p, c]) => [p, C(c)]);
    geo = facetize(geo, (f, cen, n) => {
      const hn = (cen.y - lo) / (hi - lo);
      if (hn < 0) return C(P.sand).multiplyScalar(0.85);
      if (n.y < TC.steepAt && hn > 0.08) return C(TC.steepColor);
      let c = bands[0][1];
      for (const [p, bc] of bands) if (hn >= p) c = bc;
      return c;
    }, { seed, jitter: TC.jitter });
    const m = mesh(geo, materials.terrain, true, true);
    m.name = "terrain";

    // exact surface queries
    const cellTris = (i, j) => { const k = (j * segX + i) * 2; return [tris[k], tris[k + 1]]; };
    const hit = (x, z) => {
      const ci = Math.floor((x - x0) / dx), cj = Math.floor((z - z0) / dz);
      for (let s = 0; s < 9; s++) {
        const i = ci + (s % 3) - 1, j = cj + Math.floor(s / 3) - 1;
        if (i < 0 || j < 0 || i >= segX || j >= segZ) continue;
        for (const t of cellTris(i, j)) {
          const [A, B, Cc] = t.map((v) => V[v]);
          const det = (B[2] - Cc[2]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[2] - Cc[2]);
          const l1 = ((B[2] - Cc[2]) * (x - Cc[0]) + (Cc[0] - B[0]) * (z - Cc[2])) / det;
          const l2 = ((Cc[2] - A[2]) * (x - Cc[0]) + (A[0] - Cc[0]) * (z - Cc[2])) / det;
          const l3 = 1 - l1 - l2;
          if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return { A, B, C: Cc, y: l1 * A[1] + l2 * B[1] + l3 * Cc[1] };
        }
      }
      return null;
    };
    m.userData.heightAt = (x, z) => hit(x, z)?.y ?? h(x, z);
    m.userData.normalAt = (x, z) => {
      const r = hit(x, z);
      if (!r) return new THREE.Vector3(0, 1, 0);
      const a = new THREE.Vector3(...r.A), b = new THREE.Vector3(...r.B), c = new THREE.Vector3(...r.C);
      const n = b.sub(a).cross(c.sub(a)).normalize();
      return n.y < 0 ? n.negate() : n;
    };
    m.userData.field = h;
    m.userData.bounds = { x0, z0, x1: -x0, z1: -z0 };
    return m;
  }

  // ------------------------------------------------------------ water
  /**
   * water({ size = 90, segments = 46, level = 0, amp = .08, seed = 5 }) -> Mesh
   *   userData.update(t)  bobs each lattice point (sum of sines) — facets tilt and glint
   */
  function water(o = {}) {
    const { size = 90, segments = 46, level = 0, amp = 0.08, seed = 5 } = o;
    const n = segments, d = size / n, x0 = -size / 2;
    const L = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      L.push([x0 + i * d + (hash01(i, j, seed, 1) - 0.5) * 0.6 * d, x0 + j * d + (hash01(i, j, seed, 2) - 0.5) * 0.6 * d, hash01(i, j, seed, 3) * TAU_]);
    }
    const id = (i, j) => j * (n + 1) + i;
    const ref = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), e = id(i + 1, j + 1);
      if ((i + j) % 2) ref.push(a, c, b, b, c, e);
      else ref.push(a, c, e, a, e, b);
    }
    const pos = new Float32Array(ref.length * 3);
    ref.forEach((v, k) => pos.set([L[v][0], level, L[v][1]], k * 3));
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const deep = C(P.waterDeep), shallow = tone("water");
    geo = facetize(geo, (f) => (hash01(f, seed, 77) < 0.35 ? deep.clone().lerp(shallow, 0.5) : shallow), { seed, jitter: { lightness: 0.035, hue: 0.01 } });
    const m = mesh(geo, materials.water, false, true);
    m.name = "water";
    const P_ = geo.attributes.position;
    m.userData.update = (t) => {
      for (let k = 0; k < ref.length; k++) {
        const [x, z, ph] = L[ref[k]];
        P_.setY(k, level + amp * (Math.sin(t * 1.3 + x * 0.55 + ph) * 0.6 + Math.sin(t * 0.9 - z * 0.7 + ph * 0.5) * 0.4));
      }
      P_.needsUpdate = true;
      geo.computeVertexNormals();
    };
    m.userData.update(0);
    return m;
  }
  const TAU_ = Math.PI * 2;

  // ------------------------------------------------------------ vegetation, rocks, clouds
  /** tree({ seed, height = 1.6, kind: "pine"|"round"|"auto" }) -> Group (origin at the ground) */
  function tree(o = {}) {
    const r = rng(seedOf(o.seed ?? 1));
    const H = o.height ?? r.range(1.2, 2.1);
    const kind = o.kind && o.kind !== "auto" ? o.kind : r.chance(0.7) ? "pine" : "round";
    const g = new THREE.Group();
    g.name = `tree:${kind}`;
    const trunkH = H * (kind === "pine" ? 0.28 : 0.42);
    g.add(mesh(facetize(new THREE.CylinderGeometry(H * 0.045, H * 0.07, trunkH, 5), P.trunk, { seed: r.int(1, 1e6) }), materials.facet).translateY(trunkH / 2));
    const leaf = r.chance(0.5) ? P.foliage : P.foliageLight;
    if (kind === "pine") {
      const tiers = r.int(2, 3);
      for (let k = 0; k < tiers; k++) {
        const s = 1 - k * 0.24, ch = H * 0.5 * s;
        const cone = mesh(facetize(new THREE.ConeGeometry(H * 0.3 * s, ch, r.int(5, 7)), leaf, { seed: r.int(1, 1e6) }), materials.facet);
        cone.position.y = trunkH * 0.75 + k * H * 0.22 + ch / 2;
        cone.rotation.y = r.range(0, TAU_);
        g.add(cone);
      }
    } else {
      const crown = mesh(facetize(chip(new THREE.IcosahedronGeometry(H * 0.32, 0), H * 0.08, r.int(1, 1e6)), leaf, { seed: r.int(1, 1e6) }), materials.facet);
      crown.position.y = trunkH + H * 0.22;
      crown.scale.set(1, r.range(1.05, 1.3), 1);
      g.add(crown);
    }
    g.rotation.y = r.range(0, TAU_);
    return g;
  }

  /** rock({ seed, size = .5, squash = .65, color }) -> Mesh (origin at the ground, slightly sunk) */
  function rock(o = {}) {
    const r = rng(seedOf(o.seed ?? 2));
    const s = o.size ?? 0.5;
    const geo = chip(new THREE.IcosahedronGeometry(s, 0), s * 0.35, r.int(1, 1e6));
    const m = mesh(facetize(geo, o.color ?? P.rock, { seed: r.int(1, 1e6), jitter: { lightness: 0.07, hue: 0.01 } }), materials.facet);
    m.scale.set(r.range(0.9, 1.3), o.squash ?? r.range(0.5, 0.8), r.range(0.9, 1.2));
    m.rotation.y = r.range(0, TAU_);
    m.userData.sink = s * 0.25;
    m.name = "rock";
    return m;
  }

  /**
   * cloud({ seed, size = 1.4, drift = [.25, 0, 0], bob = .08 }) -> Group
   *   userData.update(t)  drifts linearly from its placed position and bobs (call after positioning)
   */
  function cloud(o = {}) {
    const r = rng(seedOf(o.seed ?? 3));
    const s = o.size ?? 1.4;
    const g = new THREE.Group();
    g.name = "cloud";
    const puffs = r.int(3, 5);
    for (let k = 0; k < puffs; k++) {
      const u = puffs === 1 ? 0 : k / (puffs - 1) - 0.5;
      const ps = s * (0.55 - Math.abs(u) * 0.35) * r.range(0.85, 1.15);
      const p = mesh(facetize(chip(new THREE.IcosahedronGeometry(ps, 1), ps * 0.12, r.int(1, 1e6)), tone("cloud"), { seed: r.int(1, 1e6), jitter: { lightness: 0.03, hue: 0 } }), materials.cloud, true, false);
      p.position.set(u * s * 1.6, ps * 0.35 + r.range(-0.05, 0.1) * s, r.range(-0.2, 0.2) * s);
      p.scale.y = 0.72;
      g.add(p);
    }
    const drift = o.drift ?? [0.25, 0, 0], bob = o.bob ?? 0.08, ph = r.range(0, TAU_);
    g.userData.update = (t) => {
      const b = g.userData.base ?? (g.userData.base = { position: g.position.toArray() });
      const p0 = b.position;
      g.position.set(p0[0] + drift[0] * t, p0[1] + drift[1] * t + Math.sin(t * 0.8 + ph) * bob, p0[2] + drift[2] * t);
    };
    return g;
  }

  /**
   * scatter(terrain, { count, seed, make(r, i) -> Object3D, area:[x0,x1,z0,z1]?, minH, maxH,
   *                    minNormalY = .8, avoid: [{ x, z, r }], spacing = .9, tries = 40 }) -> Group
   * Each child gets userData.delay (0..1, seeded) for staggered pop-in via growAll().
   */
  function scatter(ter, o = {}) {
    const r = rng(seedOf(o.seed ?? 4));
    const b = ter.userData.bounds;
    const [ax0, ax1, az0, az1] = o.area ?? [b.x0, b.x1, b.z0, b.z1];
    const { count = 20, minH = 0.3, maxH = Infinity, minNormalY = 0.8, avoid = [], spacing = 0.9, tries = 40 } = o;
    const g = new THREE.Group();
    g.name = "scatter";
    const placed = [];
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < tries; k++) {
        const x = r.range(ax0, ax1), z = r.range(az0, az1);
        const y = ter.userData.heightAt(x, z);
        if (y < minH || y > maxH) continue;
        if (ter.userData.normalAt(x, z).y < minNormalY) continue;
        if (avoid.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r)) continue;
        if (placed.some((p) => (x - p[0]) ** 2 + (z - p[1]) ** 2 < spacing * spacing)) continue;
        const obj = o.make(r.fork(i), i);
        obj.position.set(x, y - (obj.userData.sink ?? 0), z);
        obj.userData.delay = r.next();
        obj.userData.baseScale = obj.scale.toArray();
        placed.push([x, z]);
        g.add(obj);
        break;
      }
    }
    return g;
  }

  // ------------------------------------------------------------ markers
  /** flagCloth geometry with welded, waveable vertices. Returns { geo, update(t, amp) }. */
  function flagCloth(w, h, seed, color) {
    // roles: 0 top@pole, 1 bottom@pole, 2 mid-top, 3 mid-bottom, 4 tip
    const roles = [0, 1, 3, 0, 3, 2, 2, 3, 4];
    const base = [[0, 0, 0], [0, -h, 0], [w * 0.5, -h * 0.12, 0], [w * 0.5, -h * 0.88, 0], [w, -h * 0.5, 0]];
    const pos = new Float32Array(roles.length * 3);
    roles.forEach((rl, k) => pos.set(base[rl], k * 3));
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo = facetize(geo, color, { seed, jitter: { lightness: 0.06, hue: 0.01 } });
    const A = geo.attributes.position;
    const update = (t, amp = 0.12, ph = 0) => {
      roles.forEach((rl, k) => {
        const b = base[rl];
        const s = rl >= 4 ? 1 : rl >= 2 ? 0.55 : 0;
        A.setXYZ(k, b[0] * (1 - 0.06 * s * s), b[1], amp * s * Math.sin(t * 5.2 + ph - s * 1.6));
      });
      A.needsUpdate = true;
      geo.computeVertexNormals();
    };
    update(0);
    return { geo, update };
  }

  /**
   * flag({ seed, height = .7, color = palette.accent, width }) -> Group (origin at the ground)
   *   userData.update(t)  waves the cloth
   */
  function flag(o = {}) {
    const s = seedOf(o.seed ?? 6);
    const H = o.height ?? 0.7, W = o.width ?? H * 0.55;
    const g = new THREE.Group();
    g.name = "flag";
    g.add(mesh(facetize(new THREE.CylinderGeometry(H * 0.022, H * 0.03, H, 5), tone("pole"), { seed: s }), materials.pole).translateY(H / 2));
    const cloth = flagCloth(W, H * 0.38, s, o.color ?? tone("marker"));
    const cm = mesh(cloth.geo, materials.marker);
    cm.material = materials.marker.clone();
    cm.material.side = THREE.DoubleSide;
    cm.position.y = H * 0.98;
    g.add(cm);
    const ph = hash01(s, 9) * TAU_;
    g.userData.update = (t, k = 1) => cloth.update(t, H * 0.1 * k, ph);
    return g;
  }

  /**
   * beacon({ seed, height = 2.4 }) -> Group: rock cairn + tall pole + big flag + glowing gem
   *   userData.update(t)  spins the gem, waves the flag
   */
  function beacon(o = {}) {
    const s = seedOf(o.seed ?? 8), r = rng(s);
    const H = o.height ?? 2.4;
    const g = new THREE.Group();
    g.name = "beacon";
    [[0.42, 0.12], [0.32, 0.36], [0.22, 0.56]].forEach(([sz, y], k) => {
      const rk = rock({ seed: r.int(1, 1e6), size: sz * (H / 2.4), squash: 0.6 });
      rk.position.y = y * (H / 2.4);
      g.add(rk);
    });
    const f = flag({ seed: s + 1, height: H, width: H * 0.42 });
    g.add(f);
    const gem = mesh(facetize(new THREE.OctahedronGeometry(H * 0.09, 0), tone("glow"), { seed: s }), materials.glow, true, false);
    gem.position.y = H + H * 0.1;
    gem.scale.y = 1.4;
    g.add(gem);
    g.userData.gem = gem;
    g.userData.update = (t) => {
      f.userData.update(t);
      gem.rotation.y = t * 1.6;
      gem.position.y = H * 1.1 + Math.sin(t * 2.2) * H * 0.02;
    };
    return g;
  }

  /** hero({ r = .4, seed, detail = 1, color }) -> Mesh: faceted ball, the subject that moves. */
  function hero(o = {}) {
    const R = o.r ?? 0.4;
    const m = mesh(facetize(new THREE.IcosahedronGeometry(R, o.detail ?? 1), o.color ?? tone("hero"), { seed: seedOf(o.seed ?? 12), jitter: { lightness: 0.06, hue: 0.01 } }), materials.hero);
    m.name = "hero";
    m.userData.r = R;
    return m;
  }

  /** arrow({ length = 1.6, width = .5, color }) -> Mesh: flat faceted arrow lying on XZ, pointing +X. */
  function arrow(o = {}) {
    const Lg = o.length ?? 1.6, W = o.width ?? 0.5, hl = W * 1.1, sw = W * 0.38;
    const sh = new THREE.Shape([
      new THREE.Vector2(0, -sw / 2), new THREE.Vector2(Lg - hl, -sw / 2), new THREE.Vector2(Lg - hl, -W / 2),
      new THREE.Vector2(Lg, 0), new THREE.Vector2(Lg - hl, W / 2), new THREE.Vector2(Lg - hl, sw / 2), new THREE.Vector2(0, sw / 2),
    ]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const m = mesh(facetize(geo, o.color ?? tone("marker"), { seed: 31, jitter: { lightness: 0.05, hue: 0 } }), materials.marker, true, false);
    m.name = "arrow";
    return m;
  }

  /** ring({ r = .8, width = .1, segments = 10, color }) -> Mesh: flat faceted ring on XZ (pulses, halos). */
  function ring(o = {}) {
    const R = o.r ?? 0.8, w = o.width ?? 0.1;
    const geo = new THREE.RingGeometry(R - w, R, o.segments ?? 10, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = materials.marker.clone();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;
    const m = mesh(facetize(geo, o.color ?? tone("marker"), { seed: 41 }), mat, false, false);
    m.name = "ring";
    return m;
  }

  /**
   * trail(points:[[x,y,z],...], { spacing = .45, size = .09, color, groundFn(x,z)?, lift = .05 }) -> Group
   * Small faceted beads every `spacing` m along the polyline (y from groundFn when given).
   *   userData.update(u)  reveals beads up to fraction u of the length (each pops in)
   *   userData.length     total polyline length (m)
   */
  function trail(points, o = {}) {
    const { spacing = 0.45, size = 0.09, groundFn = null, lift = 0.05 } = o;
    const g = new THREE.Group();
    g.name = "trail";
    const geo = facetize(new THREE.OctahedronGeometry(size, 0), o.color ?? P.paper, { seed: 51, jitter: { lightness: 0.05, hue: 0 } });
    const segs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]);
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      segs.push({ a, b, s0: total, L });
      total += L;
    }
    const beads = [];
    for (let s = spacing * 0.5; s < total; s += spacing) {
      const sg = segs.find((q) => s >= q.s0 && s <= q.s0 + q.L) ?? segs[segs.length - 1];
      const p = sg.a.clone().lerp(sg.b, (s - sg.s0) / (sg.L || 1));
      if (groundFn) p.y = groundFn(p.x, p.z);
      const m = mesh(geo, materials.facet, true, false);
      m.position.set(p.x, p.y + lift + size, p.z);
      m.userData.s = s / total;
      g.add(m);
      beads.push(m);
    }
    g.userData.length = total;
    g.userData.update = (u) => {
      for (const b of beads) {
        const k = clamp((u - b.userData.s) * total / (spacing * 3));
        const sc = b.userData.s <= u ? ease.outBack(k, 2.2) : 0;
        b.scale.setScalar(sc);
        b.visible = sc > 1e-4;
      }
    };
    g.userData.update(0);
    return g;
  }

  // ------------------------------------------------------------ banner labels (screen-pinned)
  /**
   * banner(text, { number, height = 1 }) -> Group: flat paper ribbon + octagon number chip.
   * Natural size: 1 unit tall (pin with pinToScreen). Origin = chip centre; ribbon extends to +X.
   *   userData.set(reveal 0..1, hide 0..1)  unfold left->right (outBack), fold away upward
   *   userData.width                         ribbon length in units
   * Renders on top of the scene (depthTest off, fog off, renderOrder 10).
   */
  function banner(text, o = {}) {
    const B = spec.banner;
    const g = new THREE.Group();
    g.name = `banner:${text}`;
    const mats = [];
    const flatMat = () => {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
      mats.push(m);
      return m;
    };
    const tri = (pts, cols) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.flat()), 3));
      const c = new Float32Array(pts.length * 3);
      cols.forEach((cc, f) => { for (let k = 0; k < 3; k++) C(cc).toArray(c, (f * 3 + k) * 3); });
      geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      const m = new THREE.Mesh(geo, flatMat());
      m.renderOrder = 10;
      return m;
    };
    const label = createTextLabel(text, { ...textStyle, color: B.ink, height: 0.56, padding: 0.06, letterSpacing: B.letterSpacing });
    label.material.depthTest = false;
    label.material.fog = false;
    label.renderOrder = 12;
    mats.push(label.material);
    const R = 0.66; // chip radius
    const tw = label.scale.x;
    const x0 = R * 0.55, x1 = R + 0.22 + tw + 0.36, n = 0.28, hh = 0.5;
    // ribbon: 4 facets with alternating paper tones, swallowtail notch at the right
    const ribbonG = new THREE.Group();
    const xm = (x0 + x1) / 2;
    ribbonG.add(tri(
      [[x0, -hh, 0], [xm, -hh, 0], [x0, hh, 0], [x0, hh, 0], [xm, -hh, 0], [xm, hh, 0],
        [xm, -hh, 0], [x1, -hh, 0], [xm, hh, 0], [xm, hh, 0], [x1, -hh, 0], [x1 - n, 0, 0],
        [xm, hh, 0], [x1 - n, 0, 0], [x1, hh, 0]],
      [B.paper, B.paperShade, B.paper, B.paperShade, B.paper],
    ));
    // paper depth: a darker offset sheet behind
    const sh = tri([[x0, -hh - 0.09, 0], [x1 + 0.06, -hh - 0.09, 0], [x0, hh - 0.09, 0], [x0, hh - 0.09, 0], [x1 + 0.06, -hh - 0.09, 0], [x1 + 0.06, hh - 0.09, 0]], [B.fold, B.fold]);
    sh.position.set(0.05, 0, -0.01);
    sh.renderOrder = 9;
    ribbonG.add(sh);
    label.position.set(R + 0.22 + tw / 2, 0.01, 0.01);
    ribbonG.add(label);
    g.add(ribbonG);
    // chip: octagon, 8 facets alternating chip / chipShade, number on top
    const chipG = new THREE.Group();
    const oct = [], cols = [];
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * TAU_ + Math.PI / 8, a1 = ((k + 1) / 8) * TAU_ + Math.PI / 8;
      oct.push([0, 0, 0.02], [Math.cos(a0) * R, Math.sin(a0) * R, 0.02], [Math.cos(a1) * R, Math.sin(a1) * R, 0.02]);
      cols.push(k % 2 ? B.chip : B.chipShade);
    }
    const chipM = tri(oct, cols);
    chipM.renderOrder = 13;
    chipG.add(chipM);
    if (o.number != null) {
      const num = createTextLabel(String(o.number), { ...textStyle, color: B.chipText, height: 0.66, padding: 0.04 });
      num.material.depthTest = false;
      num.material.fog = false;
      num.renderOrder = 14;
      num.position.z = 0.03;
      mats.push(num.material);
      chipG.add(num);
    }
    g.add(chipG);
    g.userData.width = x1 + 0.1;
    g.userData.set = (reveal, hide = 0) => {
      const c = ease.outBack(clamp(reveal / 0.45), 2.2);
      chipG.scale.setScalar(Math.max(1e-4, c));
      chipG.rotation.z = (1 - clamp(reveal / 0.45)) * -0.9;
      const rb = ease.outBack(clamp((reveal - 0.2) / 0.8), 1.4);
      ribbonG.scale.set(Math.max(1e-4, rb), 1, 1);
      label.material.opacity = clamp((reveal - 0.45) / 0.4);
      const hd = ease.inBack(clamp(hide), 1.6);
      g.userData.pinScale = [1, Math.max(1e-4, 1 - hd), 1]; // fold, applied by the overlay pin
      g.userData.lift = hd * 0.6;
      g.visible = reveal > 0 && hide < 1;
      for (const m of mats) if (m !== label.material) m.opacity = 1 - clamp(hide * 1.5 - 0.5);
    };
    g.userData.set(0, 0);
    return g;
  }

  /**
   * pinToScreen(obj, { x = -.8, y = .7, height = .1 }) — kit overlay pin (drawn AFTER post: exact colours, no
   * tilt-shift / grain / vignette). 1 unit = `height` x frame height. Adds obj.userData.lift (units) as a
   * vertical offset so banners rise while folding away. Call every frame.
   */
  function pinToScreen(obj, o = {}) {
    const { x = -0.8, y = 0.7, height = 0.1 } = o;
    return overlayPin(stage, obj, { x, y, height, offset: [0, (obj.userData.lift ?? 0) * height * 2] });
  }

  // groundPulse, burst: kit/effects.js (promoted, identical code); this style supplies its colours/material/geometry
  const groundPulse = (groundFn, o = {}) => kitGroundPulse(groundFn, { color: P.accent, ...o });
  const burst = (o = {}) => kitBurst(materials.facet, {
    ...o,
    seed: seedOf(o.seed ?? 61),
    colors: o.colors ?? [P.accent, P.primary, P.paper, P.secondary, P.foliageLight],
    geometry: facetize(new THREE.TetrahedronGeometry(o.size ?? 0.13, 0), "#ffffff", { seed: 62, jitter: { lightness: 0.08, hue: 0 } }),
  });

  // ------------------------------------------------------------ motion helpers
  /** growAll(group, t, start, { spread = 1, dur = .5 }) — pop children in, staggered by userData.delay. */
  function growAll(group, t, start, { spread = 1, dur = 0.5, overshoot = 1.9 } = {}) {
    for (const c of group.children) {
      const k = pop(t, start + (c.userData.delay ?? 0) * spread, dur, overshoot);
      const b = c.userData.baseScale ?? [1, 1, 1];
      c.scale.set(b[0] * Math.max(k, 1e-4), b[1] * Math.max(k, 1e-4), b[2] * Math.max(k, 1e-4));
      c.visible = k > 1e-4;
    }
  }

  const props = { terrain, water, tree, rock, cloud, scatter, flag, beacon, hero, arrow, ring, trail, banner, burst, groundPulse };

  // factories for objectsFromSpec (primitive: "procedural", factory: <name>, params: {...})
  const factories = {
    terrain: (os) => terrain(os.params ?? {}),
    water: (os) => water(os.params ?? {}),
    tree: (os) => tree(os.params ?? {}),
    rock: (os) => rock(os.params ?? {}),
    cloud: (os) => cloud(os.params ?? {}),
    flag: (os) => flag(os.params ?? {}),
    beacon: (os) => beacon(os.params ?? {}),
    hero: (os) => hero(os.params ?? {}),
    arrow: (os) => arrow(os.params ?? {}),
    ring: (os) => ring(os.params ?? {}),
  };

  return {
    spec,
    palette: P,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories,
    helpers: { heightField, descentPath, pop, hopArc, growAll, pinToScreen, facetize },
    sfx: spec.sfx,
  };
}
