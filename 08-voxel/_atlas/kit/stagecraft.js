// stagecraft.js — theatre pieces. Promoted from the spotlight-stage pilot (same code, style constants -> options).
//  * followSpot(opts) -> Group: hard SpotLight (real pool + shadows) + additive volumetric-looking cone beam with
//    view-angle soft edges and drifting dust; userData.aim(p), setLevel(k), setTime(t).
//  * pleatedCurtain(opts) -> Group: two pleated cloth halves; userData.setOpen(u) gathers them (pure in u).
//  * archOutline(halfWidth, height, rise, y0, n) / archBand(outer, inner): U-shaped arch / proscenium outlines
//    as point lists (one polygon: holes that cross an outline do not triangulate — see shapes.withHoles).
import * as THREE from "three";
import { configureShadow } from "./lights.js";
import { rng, clamp, lerp, smoothstep, TAU } from "./time.js";
import { shapes } from "./shapes.js";

// ---- follow-spot beam shader (additive, view-angle soft edges, drifting dust) ----
export const BEAM_SHADER = {
  vertexShader: /* glsl */ `
    varying float vAlong; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
    void main(){
      vAlong = -position.y;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vView = mv.xyz;
      vN = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uLevel; uniform float uOpacity; uniform float uSoft; uniform float uDust; uniform float uScale; uniform float uTime;
    varying float vAlong; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
    float hh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hh(i), hh(i+vec3(1,0,0)), f.x), mix(hh(i+vec3(0,1,0)), hh(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(hh(i+vec3(0,0,1)), hh(i+vec3(1,0,1)), f.x), mix(hh(i+vec3(0,1,1)), hh(i+vec3(1,1,1)), f.x), f.y), f.z); }
    void main(){
      float facing = abs(dot(normalize(vN), normalize(-vView)));
      float edge = pow(facing, uSoft);
      float along = smoothstep(0.0, 0.05, vAlong) * mix(0.35, 1.0, smoothstep(0.2, 0.85, vAlong));
      vec3 q = vWorld * uScale + vec3(0.0, uTime * 0.25, uTime * 0.12);
      float d = vn(q) * 0.6 + vn(q * 2.7) * 0.4;
      float dust = 1.0 - uDust + uDust * 2.0 * d;
      gl_FragColor = vec4(uColor * (uLevel * uOpacity * edge * along * dust), 1.0);
    }`,
};

/**
 * followSpot({ from = [0, 8, 9], to = [0, 0, 0], angle = .16, color, intensity = 900, shadow = true, beam = true, beamOpacity = .16,
 *              penumbra = .32, beamSoftness = 1.6, dust = .35, dustScale = 2.4, softness = 3, mapSize = 2048 })
 *   -> Group: a hard SpotLight (real pool + real cut-out shadows) with a visible additive cone beam.
 *   userData.aim([x,y,z]) re-aims light and beam; setLevel(k) (0 = off); setTime(t) drifts the dust; light, beam.
 */
export function followSpot({ from = [0, 8, 9], to = [0, 0, 0], angle = 0.16, color = "#ffe9c4", intensity = 900, shadow = true, beam = true, beamOpacity = 0.16, penumbra = 0.32, beamSoftness = 1.6, dust = 0.35, dustScale = 2.4, softness = 3, mapSize = 2048 } = {}) {
  const g = new THREE.Group();
  const light = new THREE.SpotLight(color, 0, 0, angle, penumbra, 2);
  light.position.set(...from);
  g.add(light, light.target);
  if (shadow) configureShadow(light, { softness, mapSize, near: 1, far: 45, bias: -0.0004, normalBias: 0.02 });
  let cone = null;
  const uniforms = {
    uColor: { value: new THREE.Color(color) }, uLevel: { value: 0 }, uOpacity: { value: beamOpacity }, uSoft: { value: beamSoftness },
    uDust: { value: dust }, uScale: { value: dustScale }, uTime: { value: 0 },
  };
  if (beam) {
    const geo = new THREE.ConeGeometry(1, 1, 48, 1, true).translate(0, -0.5, 0); // apex at origin, opening down -Y
    cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...BEAM_SHADER, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone.position.set(...from);
    cone.frustumCulled = false;
    cone.renderOrder = 5;
    g.add(cone);
  }
  const down = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3();
  g.userData = {
    light, beam: cone,
    aim(p) {
      light.target.position.set(...p);
      light.target.updateMatrixWorld();
      if (cone) {
        dir.set(p[0] - from[0], p[1] - from[1], p[2] - from[2]);
        const L = dir.length() * 1.12;
        dir.normalize();
        cone.quaternion.setFromUnitVectors(down, dir);
        const R = Math.tan(angle) * L;
        cone.scale.set(R, L, R);
      }
    },
    setLevel(k) {
      light.intensity = intensity * k;
      uniforms.uLevel.value = k;
      if (cone) cone.visible = k > 1e-4;
    },
    setTime(t) { uniforms.uTime.value = t; },
  };
  g.userData.aim(to);
  g.userData.setLevel(0);
  return g;
}

/**
 * pleatedCurtain({ width, height, z = -0.3, seed = 3, material, cloth: { segments, folds, foldDepth, gatherGrow, openGap,
 *   hemLift, valleyShade } }) -> Group: a two-half pleated stage curtain (vertex colours darken fold valleys:
 *   give the material vertexColors: true).
 * userData.setOpen(u): 0 = closed (halves meet at x = 0), 1 = fully gathered into the wings with swag.
 */
export const CURTAIN_DEFAULTS = { segments: [150, 40], folds: 11, foldDepth: 0.17, gatherGrow: 1.5, openGap: [0.32, 0.72], hemLift: 0.55, valleyShade: 0.38 };
export function pleatedCurtain({ width = 8, height = 5, z = -0.3, seed = 3, material, cloth = {} } = {}) {
  const V = { ...CURTAIN_DEFAULTS, ...cloth };
  const velvet = material ?? new THREE.MeshPhysicalMaterial({ color: "#a2101f", roughness: 0.82, sheen: 1, vertexColors: true });
  const g = new THREE.Group();
  g.name = "curtain";
  const [sx, sy] = V.segments;
  const outer = width / 2 + 0.55;
  const halves = [-1, 1].map((side, k) => {
    const geo = new THREE.PlaneGeometry(1, 1, sx, sy);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const mesh = new THREE.Mesh(geo, velvet);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.z = z - k * 0.05;
    g.add(mesh);
    const r = rng(seed * 31 + k);
    const amps = Array.from({ length: V.folds + 2 }, () => r.range(0.7, 1.3));
    return { side, geo, mesh, amps, phase: r.range(0, TAU), wav: r.range(0.5, 1.5) };
  });
  let last = -1;
  function setOpen(u) {
    u = clamp(u, 0, 1);
    if (Math.abs(u - last) < 1e-7) return;
    last = u;
    for (const hf of halves) {
      const pos = hf.geo.attributes.position, colA = hf.geo.attributes.color, s = hf.side;
      for (let iy = 0; iy <= sy; iy++) {
        const v = 1 - iy / sy;
        const uo = clamp((u - 0.1 * (1 - v)) / 0.9);                // bottom lags the track
        const gap = lerp(V.openGap[0], V.openGap[1], smoothstep(0, 1, v)) - 0.22 * Math.exp(-(((v - 0.33) / 0.16) ** 2)) * uo;
        const xi = lerp(s * -0.04, s * (width / 2 - gap), uo);
        const comp = Math.abs(xi - s * outer) / (outer + 0.04);       // 1 closed .. small gathered
        const A = V.foldDepth * lerp(V.gatherGrow, 1, comp) * (1 + 0.25 * (1 - v));
        for (let ix = 0; ix <= sx; ix++) {
          const a = s < 0 ? ix / sx : 1 - ix / sx;                     // 0 at the outer edge, 1 at the inner edge
          const fi = a * V.folds;
          const amp = lerp(hf.amps[Math.floor(fi)], hf.amps[Math.floor(fi) + 1], fi - Math.floor(fi));
          const th = TAU * fi + hf.phase + 0.5 * Math.sin(v * 2.3 * hf.wav + hf.phase) * (1 - 0.5 * comp);
          const fold = Math.sin(th) + 0.22 * Math.sin(2 * th + 1.1);
          const x = lerp(s * outer, xi, a);
          const lift = V.hemLift * uo * (1 - v) ** 2 * a ** 1.5;
          const y = v * height + lift * (1 - v);
          const i = iy * (sx + 1) + ix;
          pos.setXYZ(i, x, y, A * amp * fold);
          const shade = 1 - V.valleyShade * (0.5 - 0.5 * fold / 1.22);
          colA.setXYZ(i, shade, shade, shade);
        }
      }
      pos.needsUpdate = colA.needsUpdate = true;
      hf.geo.computeVertexNormals();
      hf.geo.computeBoundingSphere();
    }
  }
  setOpen(0);
  g.userData = { setOpen };
  return g;
}

/**
 * archOutline({ halfWidth, height, rise, y0 = 0, n = 40 }) -> [[x, y], ...]: an open U from (-halfWidth, y0) up
 * the left jamb, over a semicircular-ish (elliptical) head of height `rise`, down the right jamb to (halfWidth, y0).
 */
export function archOutline({ halfWidth, height, rise, y0 = 0, n = 40 }) {
  const hw = halfWidth, top = height;
  const pts = [[-hw, y0], [-hw, top - rise]];
  for (let i = 1; i < n; i++) { const a = Math.PI - (i / n) * Math.PI; pts.push([hw * Math.cos(a), top - rise + rise * Math.sin(a)]); }
  pts.push([hw, top - rise], [hw, y0]);
  return pts;
}
/** archBand(outerPts, innerPts) -> THREE.Shape: the U-shaped band between two arch outlines (one polygon, no hole). */
export const archBand = (outer, inner) => shapes.poly([...outer, ...inner.slice().reverse()]);
