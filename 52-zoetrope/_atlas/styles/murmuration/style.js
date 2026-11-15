// styles/murmuration/style.js — "Murmuration": thousands of tiny birds wheel across a dusk sky as one cloud that
// becomes the shape. The look lives in spec.js; WHERE every bird is lives in flock.js (THREE-free closed form shared
// with SCORE). This file turns a flock into pictures:
//   - sky(): a back-side dome with an unlit gradient shader (warm horizon -> cool zenith, low sun glow, static dither)
//   - horizon(): two tree-line silhouettes (near dark, far hazy) and a row of lattice pylons with sagging wires
//   - birds(flock): ONE instanced draw of a 5-triangle bird. JS writes per-instance position / velocity / bank from
//     flock.positionsAt(t) every frame; the vertex shader orients the bird along its velocity, turns its wing plane
//     toward the camera by bank, and flaps the wings from uTime with a per-bird phase. No instanceMatrix is used:
//     the instance position comes from the aPos attribute (checked with birds far from the origin).
//   - caption(): one centred caption over the dark land (overlay, exact colours).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { rng, lerp } from "../../kit/time.js";
import { fbm2 } from "../../kit/noise.js";
import * as flockPlan from "./flock.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const col = (hex) => new THREE.Color(hex);   // linear (ColorManagement converts from sRGB hex)

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- sky dome
  /** sky(o) -> Mesh: back-side sphere around the camera with the dusk gradient + sun glow (unlit, dithered) */
  function sky(o = {}) {
    const K = { ...spec.sky, ...o };
    const sd = new THREE.Vector3(...K.sunDir).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,   // dome radius < camera far: depth-tested, drawn first
      uniforms: {
        uZenith: { value: col(P.zenith) }, uUpper: { value: col(P.upper) }, uLow: { value: col(P.low) },
        uHorizon: { value: col(P.horizon) }, uSun: { value: col(P.sun) }, uGround: { value: col(P.ground) },
        uSunDir: { value: sd }, uBands: { value: new THREE.Vector3(K.bands.low, K.bands.upper, K.bands.zenith) },
        uGlow: { value: K.glow.map(([s, e]) => new THREE.Vector2(s, e)) },
        uDisc: { value: K.sunDisc }, uCore: { value: K.sunCore }, uVig: { value: K.vignette }, uDither: { value: K.dither },
        uRes: { value: new THREE.Vector2(stage.width, stage.height) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uUpper, uLow, uHorizon, uSun, uGround, uSunDir, uBands;
        uniform vec2 uGlow[3]; uniform float uDisc, uCore, uVig, uDither; uniform vec2 uRes;
        varying vec3 vW;
        float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vW - cameraPosition);
          float e = d.y;
          vec3 c = mix(uHorizon, uLow, smoothstep(0.0, uBands.x, e));
          c = mix(c, uUpper, smoothstep(uBands.x, uBands.y, e));
          c = mix(c, uZenith, smoothstep(uBands.y, uBands.z, e));
          float ca = max(dot(d, uSunDir), 0.0);
          float g = 0.0;
          for (int k = 0; k < 3; k++) g += uGlow[k].x * pow(ca, uGlow[k].y);
          float hz = 1.0 - smoothstep(0.0, 0.25, abs(e));            // glow hugs the horizon
          c += uSun * g * (0.45 + 0.55 * hz);
          c = mix(c, uSun * uCore, smoothstep(uDisc, uDisc + 0.00006, ca));
          // below the horizon: dark land, a faint warm sheen right at the horizon
          vec3 gnd = mix(uGround * 1.6 + uHorizon * 0.06, uGround, smoothstep(0.0, 0.08, -e));
          c = mix(c, gnd, smoothstep(0.0005, -0.0015, e));
          vec2 q = gl_FragCoord.xy / uRes - 0.5;
          c *= 1.0 - uVig * dot(q, q) * 1.6;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          gl_FragColor.rgb += (h12(gl_FragCoord.xy) - 0.5) * uDither / 255.0;
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(K.radius, 48, 24), mat);
    m.name = "sky"; m.renderOrder = -10; m.frustumCulled = false;
    return m;
  }

  // ---------------------------------------------------------------- horizon silhouettes
  const flatMat = (hex) => new THREE.MeshBasicMaterial({ color: hex, fog: false, side: THREE.DoubleSide });
  /** treeLine({ z, height: [lo, hi], seed, step, color, width }) -> Mesh: a strip from y = -40 up to a lumpy crown line */
  function treeLine(o = {}) {
    const H = o.height ?? [3, 7], step = o.step ?? 0.6, w = o.width ?? Math.abs(o.z ?? 140) * 1.6, seed = o.seed ?? 3;
    const pos = [];
    const crown = (x) => {
      const big = fbm2(x * 0.012 + 3, 0.5, { seed, octaves: 3 });
      const mid = fbm2(x * 0.09, 2.5, { seed: seed + 1, octaves: 2 });
      const tuft = Math.abs(Math.sin(x * 0.55 + mid * 6)) ** 0.6;
      let h = lerp(H[0], H[1], big) * (0.7 + 0.3 * mid) + tuft * (H[1] - H[0]) * 0.18;
      const gap = fbm2(x * 0.02 + 9, 7, { seed: seed + 2, octaves: 2 });   // open fields between stands of trees
      if (gap < 0.38) h *= 0.18 + (gap / 0.38) * 0.82;
      return h;
    };
    for (let x = -w; x < w; x += step) {
      const a = crown(x), b = crown(x + step);
      pos.push(x, -40, 0, x + step, -40, 0, x + step, b, 0, x, -40, 0, x + step, b, 0, x, a, 0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, flatMat(o.color ?? P.treesNear));
    m.position.z = o.z ?? -140; m.name = "treeLine"; m.frustumCulled = false; m.renderOrder = o.renderOrder ?? -5;
    return m;
  }
  /** pylons({ z, xs, height, width, color }) -> Group: lattice towers (thin boxes) + sagging wires between them */
  function pylons(o = {}) {
    const Q = { ...spec.horizon.pylons, ...o };
    const g = new THREE.Group(); g.name = "pylons";
    const mat = flatMat(o.color ?? P.treesNear);
    const H = Q.height, W = Q.width, th = H * 0.012;
    const bar = (a, b, t = th) => {
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), L = A.distanceTo(Bv);
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, L, t), mat);
      m.position.copy(A).add(Bv).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
      return m;
    };
    const arms = [0.62, 0.8, 0.96];
    const tips = [];
    for (const x of Q.xs) {
      const tw = (y) => lerp(W / 2, W * 0.08, y / H);   // tapering half-width
      g.add(bar([x - W / 2, 0, 0], [x - W * 0.08, H, 0]), bar([x + W / 2, 0, 0], [x + W * 0.08, H, 0]));
      const levels = 7;
      for (let k = 0; k < levels; k++) {
        const y0 = (k / levels) * H * 0.95, y1 = ((k + 1) / levels) * H * 0.95;
        g.add(bar([x - tw(y0), y0, 0], [x + tw(y1), y1, 0], th * 0.6), bar([x + tw(y0), y0, 0], [x - tw(y1), y1, 0], th * 0.6));
      }
      arms.forEach((a, k) => {
        const y = a * H, half = W * (k === 1 ? 1.0 : 0.75);
        g.add(bar([x - half, y, 0], [x + half, y, 0], th * 1.2));
        tips.push({ x, k, y, l: x - half, r: x + half });
      });
      g.add(bar([x, H, 0], [x, H * 1.06, 0], th));
    }
    // wires: catenary-ish sag between neighbouring towers' arm tips (and off-frame at both ends)
    const xs = [...Q.xs].sort((a, b) => a - b), span = xs.length > 1 ? xs[1] - xs[0] : 80;
    const wire = (x0, y0, x1, y1, sag) => {
      const pts = [];
      for (let s = 0; s <= 24; s++) { const u = s / 24; pts.push(new THREE.Vector3(lerp(x0, x1, u), lerp(y0, y1, u) - sag * 4 * u * (1 - u), 0)); }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: o.color ?? P.treesNear, fog: false }));
      ln.frustumCulled = false; return ln;
    };
    for (let k = 0; k < arms.length; k++) {
      const row = tips.filter((p) => p.k === k).sort((a, b) => a.x - b.x);
      for (const side of ["l", "r"]) {
        const ends = [{ x: row[0].x - span, y: row[0].y, [side]: row[0][side] - span }, ...row, { x: row[row.length - 1].x + span, y: row[0].y, [side]: row[row.length - 1][side] + span }];
        for (let i = 0; i < ends.length - 1; i++) g.add(wire(ends[i][side], ends[i].y, ends[i + 1][side], ends[i + 1].y, H * 0.07));
      }
    }
    g.position.z = Q.z;   // no renderOrder on the Group itself: a Group's renderOrder sorts its children before the sky
    g.traverse((c) => { if (c !== g) c.renderOrder = -6; c.frustumCulled = false; });
    return g;
  }
  /** horizon() -> Group: far hazy tree line, pylons, near dark tree line (back to front) */
  function horizon(o = {}) {
    const Hs = { ...spec.horizon, ...o };
    const g = new THREE.Group(); g.name = "horizon";
    g.add(treeLine({ ...Hs.far, color: P.treesFar, renderOrder: -8 }));
    g.add(pylons({ ...Hs.pylons, color: lerpHex(P.treesFar, P.treesNear, 0.55) }));
    g.add(treeLine({ ...Hs.near, color: P.treesNear, renderOrder: -5 }));
    return g;
  }
  function lerpHex(a, b, u) { return "#" + new THREE.Color(a).lerp(new THREE.Color(b), u).getHexString(); }

  // ---------------------------------------------------------------- birds
  /** birdGeometry(span) -> 5 triangles in the bird's local frame: +x forward, +y up, wings along ±z */
  function birdGeometry(span = spec.birds.span) {
    const s = span / 0.21;
    const v = [
      // body lozenge
      0.075, 0, 0, -0.02, 0, 0.014, -0.02, 0, -0.014,
      -0.02, 0, 0.014, -0.06, 0, 0, -0.02, 0, -0.014,
      // tail fan
      -0.05, 0, 0, -0.09, 0, 0.022, -0.09, 0, -0.022,
      // wings (swept, pointed)
      0.028, 0, 0.01, -0.022, 0, 0.01, -0.035, 0, 0.105,
      0.028, 0, -0.01, -0.035, 0, -0.105, -0.022, 0, -0.01,
    ].map((x) => x * s);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return g;
  }

  /**
   * birds(flock) -> Mesh (one instanced draw). userData.update(t) writes positions / headings / bank from
   *   flock.positionsAt(t) and sets the flap clock; nothing carries over between frames.
   */
  function birds(flock, o = {}) {
    const Bs = { ...spec.birds, ...o };
    const n = flock.n;
    const geo = birdGeometry(Bs.span);
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); aPos.setUsage(THREE.DynamicDrawUsage);
    const aVel = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); aVel.setUsage(THREE.DynamicDrawUsage);
    const aBank = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); aBank.setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(n * 4), r = rng(`${spec.flock.seed}:look`);
    for (let i = 0; i < n; i++) {
      seeds[i * 4] = r.next();                                  // flap phase
      seeds[i * 4 + 1] = r.range(Bs.flapHz[0], Bs.flapHz[1]);   // flap rate
      seeds[i * 4 + 2] = r.range(Bs.size[0], Bs.size[1]);       // size
      seeds[i * 4 + 3] = r.next();                              // shade / roll bias
    }
    geo.setAttribute("aPos", aPos); geo.setAttribute("aVel", aVel); geo.setAttribute("aBank", aBank);
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: false,
      uniforms: {
        uTime: { value: 0 }, uFlap: { value: Bs.flapAmp }, uFace: { value: new THREE.Vector2(Bs.faceBase, Bs.faceBank) },
        uDark: { value: col(P.bird) }, uLight: { value: col(P.birdLight) }, uHaze: { value: col(P.low) },
        uHazeR: { value: new THREE.Vector3(Bs.haze.near, Bs.haze.far, Bs.haze.amount) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute vec3 aVel; attribute float aBank; attribute vec4 aSeed;
        uniform float uTime, uFlap; uniform vec2 uFace;
        varying float vFace; varying float vShade; varying float vDepth;
        void main() {
          float sp = length(aVel);
          vec3 f = sp > 1e-4 ? aVel / sp : vec3(1.0, 0.0, 0.0);
          vec3 up0 = abs(f.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 s = normalize(cross(f, up0));
          vec3 u = cross(s, f);
          vec3 toCam = normalize(cameraPosition - aPos);
          vec3 nc = toCam - f * dot(toCam, f);
          float ncl = length(nc);
          nc = ncl > 1e-4 ? nc / ncl : u;
          nc *= dot(nc, u) < 0.0 ? -1.0 : 1.0;
          float m = clamp(uFace.x + uFace.y * aBank + (aSeed.w - 0.5) * 0.3, 0.0, 1.0);
          vec3 up = u + (nc - u) * m;
          float ul = length(up);
          up = ul > 1e-4 ? up / ul : u;
          vec3 side = cross(f, up);
          vec3 p = position;
          float ph = (uTime * aSeed.y + aSeed.x) * 6.2831853;
          float glide = 0.2 + 0.8 * smoothstep(-0.4, 0.5, sin(uTime * 0.9 + aSeed.x * 17.0));
          float fl = sin(ph) * glide * uFlap;
          float span = abs(p.z);
          p.y += span * fl;
          p.z *= 1.0 - 0.3 * abs(fl);
          p *= aSeed.z;
          vec3 w = aPos + f * p.x + up * p.y + side * p.z;
          vFace = abs(dot(up, toCam));
          vShade = aSeed.w;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDark, uLight, uHaze, uHazeR;
        varying float vFace; varying float vShade; varying float vDepth;
        void main() {
          float lite = (1.0 - vFace) * 0.6 + vShade * 0.12;
          vec3 c = mix(uDark, uLight, clamp(lite, 0.0, 1.0));
          c = mix(c, uHaze, smoothstep(uHazeR.x, uHazeR.y, vDepth) * uHazeR.z);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    mat.name = "birds";
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.name = "birds"; mesh.renderOrder = 1;
    mesh.userData.update = (t) => {
      flock.positionsAt(t, aPos.array, aVel.array, aBank.array);
      aPos.needsUpdate = aVel.needsUpdate = aBank.needsUpdate = true;
      mat.uniforms.uTime.value = t;
    };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- caption (overlay)
  /** caption() -> overlay text centred over the land, a short warm rule above it; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const mesh = screenCanvas(stage, Q.w, Q.h, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      x.letterSpacing = `${Q.spacing}px`;
      x.textAlign = "center"; x.textBaseline = "middle";
      const tw = x.measureText(st.text).width;
      x.fillStyle = Q.rule; x.globalAlpha = 0.9;
      x.fillRect(Math.round(W / 2 - 28), 10, 56, 3);
      x.globalAlpha = 1;
      x.shadowColor = Q.shadow; x.shadowBlur = 14; x.shadowOffsetY = 3;
      x.fillStyle = Q.ink;
      x.fillText(st.text, W / 2, H / 2 + 10, Math.min(W - 20, tw + 4));
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one flock
  /** murmuration(flock) -> { sky, horizon, birds, update(t) } (adds itself to the scene) */
  function murmuration(flock, o = {}) {
    const s = sky(o.sky), h = horizon(o.horizon), b = birds(flock, o.birds);
    stage.scene.add(s, h, b);
    return { sky: s, horizon: h, birds: b, update(t) { s.position.copy(stage.camera.position); b.userData.update(t); } };
  }

  const props = { sky, horizon, treeLine, pylons, birds, birdGeometry, caption, murmuration };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: flockPlan, motion: flockPlan,
  };
}
