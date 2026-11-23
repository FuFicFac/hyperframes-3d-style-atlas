// styles/ferrofluid/style.js — "Ferrofluid": jet-black magnetic liquid in a white dish (style contract, kit-api §3).
//
// The liquid is a RAYMARCHED signed-distance field on a tight bounding box (the liquid-chrome technique, new field):
//   pool    = a height field  y = mound * F(x,z) + meniscus, clipped to the dish radius (F = the magnetic field, field.js)
//   spikes  = a hexagonal (triangular-lattice) array of exact cones. Each point only evaluates the 3 lattice cells of the
//             triangle it is in (any other cone is >= 0.866 pitch away; the march step is capped accordingly), so the cost
//             is 3 cones per step regardless of how many spikes there are. Cone height / sharpness follow F at the cell;
//             the pitch tightens as the field rises. Smooth union (polynomial smin) melts each cone into the pool.
//   shading = black dielectric "oil": Fresnel reflection of an ANALYTIC studio environment (crisp strips; GLSL, no PMREM
//             blur) + the steel magnets traced into the mirror (ray vs cylinder) + 3-tap field AO between spikes.
// The meshes (dish, magnets, set) get a matching procedural studio PMREM (kit/studio.js) built from the same panels.
// Nothing animates itself: the scene calls fluid.userData.set(magnetsAt(t), t) and magnet.userData.update(pos).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createCyclorama } from "../../kit/builders.js";
import { studioEnvironment } from "../../kit/studio.js";
import { screenCanvas } from "../../kit/overlay.js";
import { FONTS } from "../../kit/text.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import * as field from "./field.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const lin = (hex) => new THREE.Color(hex);
const MAXPANELS = 6;

const FLUID_VERT = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const fluidFrag = (M) => /* glsl */ `
#define MAXM ${M.maxMagnets}
#define STEPS ${M.steps}
uniform vec4 uMag[MAXM];      // x, z, strength, face y
uniform vec4 uMagGeo;         // body radius, body height, rod radius, rod top (above face)
uniform float uSigma, uSpacing, uSpikeH, uCurve, uJitter, uThr, uR0, uR1, uBlend, uMound, uRipple;
uniform float uPoolR, uDepth, uMen, uMenW, uTop, uPix;
uniform vec3 uBMin, uBMax;
uniform vec3 uBench, uWall, uCeil, uCeilTop, uBody, uSteel;
uniform float uBenchI, uWallI, uCeilI, uMagRefl;
uniform vec2 uLow, uDish, uGrid;
uniform vec4 uPanR[${MAXPANELS}];
uniform vec4 uPanC[${MAXPANELS}];
uniform float uPanS[${MAXPANELS}];
uniform vec4 uFluid;          // f0, edgeBoost, bodyLight, occlusion
uniform mat4 projectionMatrix; // set by three (used for gl_FragDepth)
varying vec3 vW;
${GLSL_SAFE}
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float h21(vec2 c) { vec2 p = fract(c * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
// exact cone, apex at the origin, base radius q.x at y = q.y (< 0)
float sdCone(vec3 p, vec2 q) {
  vec2 w = vec2(length(p.xz), p.y);
  vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0);
  vec2 b = w - q * vec2(clamp(w.x / q.x, 0.0, 1.0), 1.0);
  float k = sign(q.y);
  float d = min(dot(a, a), dot(b, b));
  float s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
  return sqrt(d) * sign(s);
}
float fieldF(vec2 q) {
  float f = 0.0;
  for (int i = 0; i < MAXM; i++) { vec2 d = q - uMag[i].xy; f += uMag[i].z * exp(-dot(d, d) / (uSigma * uSigma)); }
  return f;
}
float surfH(vec2 q, float F) {
  float r = length(q);
  return uMound * F + uMen * exp(-max(uPoolR - r, 0.0) / uMenW);
}
float spike(vec3 p, vec2 ij) {
  vec2 cr = vec2((ij.x + 0.5 * ij.y) * uSpacing, ij.y * uSpacing * 0.8660254);
  vec2 c = vec2(uGrid.x * cr.x - uGrid.y * cr.y, uGrid.y * cr.x + uGrid.x * cr.y);   // lattice frame -> world
  float F = fieldF(c);
  float g = clamp((F - uThr) / (1.0 - uThr), 0.0, 1.0);
  // sub-threshold: a faint ripple bump; above: a real spike
  float hr = uRipple * smoothstep(uThr * 0.45, uThr, F);
  float h = uSpikeH * safePow(g, uCurve) * (1.0 - uJitter * 0.5 + uJitter * h21(ij)) + hr;
  if (h <= 1e-4 || length(c) > uPoolR - 0.06) return 1e3;
  float R = uSpacing * mix(uR0, uR1, g);
  float sink = 0.012;
  float base = surfH(c, F) - sink;
  vec3 apex = vec3(c.x, base + h + sink, c.y);
  return sdCone(p - apex, vec2(R, -(h + sink)));
}
float map(vec3 p) {
  float F = fieldF(p.xz);
  float dS = (p.y - surfH(p.xz, F)) * 0.85;
  dS = max(dS, length(p.xz) - uPoolR);
  dS = max(dS, -uDepth - p.y);
  if (p.y > uTop) return dS;
  float s = uSpacing;
  vec2 g = vec2(uGrid.x * p.x + uGrid.y * p.z, -uGrid.y * p.x + uGrid.x * p.z);    // world -> lattice frame
  float v = g.y / (s * 0.8660254);
  float u = g.x / s - 0.5 * v;
  vec2 b = floor(vec2(u, v));
  vec2 f = vec2(u, v) - b;
  float c = step(1.0, f.x + f.y);
  float dc = min(spike(p, b + vec2(c)), min(spike(p, b + vec2(1.0, 0.0)), spike(p, b + vec2(0.0, 1.0))));
  float d = smin(dS, dc, uBlend);
  return min(d, s * 0.36);   // cones outside this triangle are >= 0.866 pitch - 0.5 pitch away
}
vec3 calcNormal(vec3 p, float e) {
  const vec2 k = vec2(1.0, -1.0);
  return safeNorm(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}
vec3 envCol(vec3 d) {
  float y = clamp(d.y, -1.0, 1.0);
  float az = atan(d.z, d.x);
  vec3 c;
  if (y < 0.0) c = uBench * uBenchI * (1.0 - 0.97 * smoothstep(uDish.x, uDish.y, -y));   // white dish rim band, then the black pool
  else c = mix(uWall * uWallI, mix(uCeil, uCeilTop, smoothstep(0.25, 0.95, y)) * uCeilI, smoothstep(uLow.x, uLow.y, y));
  for (int i = 0; i < ${MAXPANELS}; i++) {
    vec4 R = uPanR[i];
    float da = abs(mod(az - R.x + 3.14159265, 6.2831853) - 3.14159265);
    float s = max(uPanS[i], 1e-3);
    float m = (1.0 - smoothstep(R.z - s, R.z, da)) * (1.0 - smoothstep(R.w - s, R.w, abs(y - R.y)));
    c = mix(c, uPanC[i].rgb * uPanC[i].a, m * step(0.0001, uPanC[i].a));
  }
  return c;
}
// the steel magnets (body + rod) as seen in the mirror: ray vs vertical cylinders
vec4 magnetHit(vec3 o, vec3 d) {
  float best = 1e9; vec3 col = vec3(0.0);
  for (int i = 0; i < MAXM; i++) {
    vec2 oc = o.xz - uMag[i].xy;
    vec2 dd = d.xz;
    float a = dot(dd, dd);
    for (int j = 0; j < 2; j++) {
      float R = j == 0 ? uMagGeo.x : uMagGeo.z;
      float y0 = uMag[i].w + (j == 0 ? 0.0 : uMagGeo.y);
      float y1 = uMag[i].w + (j == 0 ? uMagGeo.y : uMagGeo.w);
      float b = dot(oc, dd), c = dot(oc, oc) - R * R;
      float h = b * b - a * c;
      if (h > 0.0 && a > 1e-6) {
        float t = (-b - sqrt(h)) / a;
        float y = o.y + d.y * t;
        if (t > 0.0 && y > y0 && y < y1 && t < best) {
          best = t;
          vec3 nc = safeNorm(vec3(oc.x + dd.x * t, 0.0, oc.y + dd.y * t));
          col = envCol(reflect(d, nc)) * uSteel;
        }
      }
    }
  }
  return vec4(col, best < 1e8 ? 1.0 : 0.0);
}
vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 t0 = (uBMin - ro) * inv, t1 = (uBMax - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), tn.z), min(min(tf.x, tf.y), tf.z));
}
float occlusion(vec3 p, vec3 n) {
  float o = 0.0, w = 1.0;
  for (int i = 1; i <= ${M.aoSteps}; i++) { float h = 0.011 * float(i); o += (h - map(p + n * h)) * w; w *= 0.65; }
  return clamp(1.0 - uFluid.w * o * 14.0, 0.15, 1.0);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vW - ro);
  vec2 tb = boxHit(ro, rd);
  float t = max(tb.x, 0.0);
  if (tb.y <= t) discard;
  bool hit = false;
  float dmin = 1e3, tmin = t;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    float px = uPix * t;
    if (d < px * 0.3) { hit = true; break; }
    if (d / px < dmin) { dmin = d / px; tmin = t; }
    t += d * ${M.relax.toFixed(3)};
    if (t > tb.y) break;
  }
  float alpha = 1.0;
  if (!hit) {
    alpha = clamp(1.0 - dmin / 1.2, 0.0, 1.0);
    if (alpha <= 0.0) discard;
    t = tmin;
  }
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p, max(uPix * t * 0.5, 0.0005));
  vec3 v = -rd;
  vec3 r = reflect(rd, n);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = uFluid.x + (1.0 - uFluid.x) * safePow(1.0 - ndv, 5.0) * uFluid.y;
  vec3 env = envCol(r);
  vec4 mh = magnetHit(p + n * 0.003, r);
  env = mix(env, mh.rgb, mh.a * uMagRefl);
  float ao = occlusion(p, n);
  vec3 col = env * fr * ao + uBody * uFluid.z * (0.4 + 0.6 * max(n.y, 0.0)) * ao;
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, E = spec.env, FL = spec.fluid, PO = spec.pool, SP = spec.spikes, FD = spec.field, MA = spec.march;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---- mesh environment: the same panels, as a procedural studio PMREM (dish glaze + steel reflect the strips) ----
  const dirOf = (az, el) => {
    const c = Math.sqrt(Math.max(0, 1 - el * el));
    return [c * Math.cos(az), el, c * Math.sin(az)];
  };
  const studioSpec = {
    ...spec.studio,
    panels: E.panels.map((p) => {
      const [az, el, hw, hh, soft] = p.rect;
      const d = dirOf(az, el).map((v) => v * E.panelRadius);
      const w = 2 * hw * E.panelRadius, h = 2 * hh * E.panelRadius * 1.15;
      return { id: p.id, kind: h > w ? "strip" : "softbox", size: [w, h], pos: d, intensity: p.intensity * 0.6, color: p.color, soft: Math.min(0.45, soft * 4 + 0.1) };
    }).concat([
      { id: "wall", kind: "card", size: [40, 3.2], pos: [0, 0.8, -E.panelRadius], intensity: 0.9, gradient: [[0, "#e9e7e3"], [1, "#e9e7e3"]] },
      { id: "benchBounce", kind: "card", size: [20, 20], pos: [0, -5, 0], intensity: 0.7, gradient: [[0, "#d8d5cf"], [1, "#d8d5cf"]] },
    ]),
  };
  const studio = studioEnvironment(stage, studioSpec, { lights });
  for (const m of Object.values(materials)) if (m.envMapIntensity !== undefined) m.envMapIntensity = spec.studio.envIntensity;
  materials.steel.envMapIntensity = materials.rod.envMapIntensity = spec.studio.steelEnv;

  // ---- the set: pale bench sweeping up into a pale wall ----
  function set(o = {}) {
    const cyc = createCyclorama({ width: 30, depth: 16, height: 8, radius: 3, material: materials.bench, ...o });
    cyc.position.y = spec.bench.y;
    cyc.name = "bench";
    return cyc;
  }

  // ---- glazed white dish (lathe) ----
  function dish(o = {}) {
    const D = { ...spec.dish, ...o };
    const pts = [
      [0.001, D.floor], [D.inner - 0.03, D.floor], [D.inner - 0.005, D.floor + 0.015], [D.inner, D.floor + 0.04],
      [D.inner, D.rimTop - 0.012], [D.inner + 0.006, D.rimTop - 0.003], [D.inner + 0.018, D.rimTop],
      [D.outer - 0.02, D.rimTop], [D.outer - 0.004, D.rimTop - 0.008], [D.outer, D.rimTop - 0.025],
      [D.outer - 0.012, D.foot + 0.05], [D.outer - 0.05, D.foot + 0.008], [D.outer - 0.08, D.foot], [0.001, D.foot],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, D.segments);
    g.computeVertexNormals();
    const m = materials.dish.clone();
    m.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = "dish";
    return mesh;
  }

  // ---- magnet: polished steel cylinder with a red pole band, hanging on a rod; origin = the bottom face ----
  function magnet(o = {}) {
    const G = { ...spec.magnet, ...o };
    const grp = new THREE.Group();
    grp.name = "magnet";
    const body = new THREE.Mesh(new THREE.CylinderGeometry(G.radius, G.radius, G.height, 64), materials.steel);
    body.position.y = G.height / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(G.radius * 1.004, G.radius * 1.004, G.poleBand, 64), materials.pole);
    band.position.y = G.height - G.poleBand / 2 - 0.02;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(G.rod, G.rod, G.rodLength, 20), materials.rod);
    rod.position.y = G.height + G.rodLength / 2;
    for (const m of [body, band, rod]) { m.castShadow = m !== rod; grp.add(m); }   // a 4 m rod shadow streaks across the bench
    grp.userData.update = (pos, visible = true) => { grp.position.set(pos[0], pos[1], pos[2]); grp.visible = visible; return grp; };
    return grp;
  }

  // ---- the ferrofluid (raymarched) ----
  function fluid(o = {}) {
    const MM = { ...MA, ...o };
    const N = MM.maxMagnets;
    const U = {
      uMag: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 5)) },
      uMagGeo: { value: new THREE.Vector4(spec.magnet.radius, spec.magnet.height, spec.magnet.rod, spec.magnet.rodLength) },
      uSigma: { value: FD.sigma }, uSpacing: { value: SP.spacing }, uSpikeH: { value: SP.height }, uCurve: { value: SP.heightCurve },
      uJitter: { value: SP.jitter }, uThr: { value: FD.threshold }, uR0: { value: SP.radius[0] }, uR1: { value: SP.radius[1] },
      uBlend: { value: SP.blend }, uMound: { value: SP.mound }, uRipple: { value: SP.ripple },
      uPoolR: { value: PO.radius }, uDepth: { value: PO.depth }, uMen: { value: PO.meniscus }, uMenW: { value: PO.meniscusWidth },
      uTop: { value: 0.1 }, uPix: { value: 0.001 },
      uBMin: { value: new THREE.Vector3(-1, -1, -1) }, uBMax: { value: new THREE.Vector3(1, 1, 1) },
      uBench: { value: lin(E.bench) }, uWall: { value: lin(E.wall) }, uCeil: { value: lin(E.ceiling) }, uCeilTop: { value: lin(E.ceilingTop) },
      uBody: { value: lin(FL.body) }, uSteel: { value: lin(spec.palette.steel) },
      uBenchI: { value: E.benchI }, uWallI: { value: E.wallI }, uCeilI: { value: E.ceilingI }, uMagRefl: { value: FL.magnetReflect },
      uLow: { value: new THREE.Vector2(...E.lowBand) }, uDish: { value: new THREE.Vector2(...E.dishBand) }, uGrid: { value: new THREE.Vector2(Math.cos(SP.gridAngle), Math.sin(SP.gridAngle)) },
      uPanR: { value: [] }, uPanC: { value: [] }, uPanS: { value: [] },
      uFluid: { value: new THREE.Vector4(FL.f0, FL.edgeBoost, FL.bodyLight, FL.occlusion) },
    };
    for (let i = 0; i < MAXPANELS; i++) {
      const p = E.panels[i];
      U.uPanR.value.push(p ? new THREE.Vector4(p.rect[0], p.rect[1], p.rect[2], p.rect[3]) : new THREE.Vector4());
      const c = p ? lin(p.color) : new THREE.Color(0);
      U.uPanC.value.push(new THREE.Vector4(c.r, c.g, c.b, p ? p.intensity : 0));
      U.uPanS.value.push(p ? p.rect[4] : 0.01);
    }
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FLUID_VERT, fragmentShader: fluidFrag(MM), side: THREE.BackSide, transparent: true, depthWrite: true, depthTest: true });
    mat.name = "ferrofluid";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.frustumCulled = false;
    mesh.name = "ferrofluid";
    mesh.userData = {
      uniforms: U,
      /** set(magnets [{ pos, s }], peak): upload the field for this frame and fit the bounding box to the tallest spike */
      set(mags, peak = 0) {
        for (let i = 0; i < N; i++) {
          const m = mags[i];
          if (m) U.uMag.value[i].set(m.pos[0], m.pos[2], m.s, m.pos[1]);
          else U.uMag.value[i].set(0, 0, 0, 50);
        }
        const pk = Math.min(peak, 1.6);
        U.uSpacing.value = SP.spacing * (1 - SP.tighten * Math.min(pk, 1));
        const top = SP.mound * pk + SP.height * (1 + SP.jitter * 0.5) * (pk > FD.threshold ? 1 : 0) + SP.ripple + PO.meniscus + 0.02;
        U.uTop.value = top;
        const R = PO.radius + 0.01;
        U.uBMin.value.set(-R, -PO.depth - 0.01, -R);
        U.uBMax.value.set(R, top + 0.01, R);
        mesh.position.set(0, (top + 0.01 - PO.depth - 0.01) / 2, 0);
        mesh.scale.set(2 * R, top + 0.02 + PO.depth, 2 * R);
        const cam = stage.camera;
        U.uPix.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / stage.height;
        return mesh;
      },
    };
    return mesh;
  }

  // ---- beat caption: black glossy chip (a tiny spiked-drop icon), white text; overlay = exact colours ----
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1000, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.46);
      const pw = Math.min(W - 16, pad + ic + pad * 0.8 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, ph / 2 - 1); x.stroke();
      // icon: three white spikes on a little pool line
      const cx = ox + pad, base = oy + ph / 2 + ic * 0.42;
      x.fillStyle = Q.ink;
      [[0.18, 0.55], [0.5, 1.0], [0.82, 0.55]].forEach(([u, h]) => {
        const px = cx + u * ic, hw = ic * 0.17;
        x.beginPath(); x.moveTo(px - hw, base); x.quadraticCurveTo(px - hw * 0.25, base - ic * h * 0.45, px, base - ic * h); x.quadraticCurveTo(px + hw * 0.25, base - ic * h * 0.45, px + hw, base); x.closePath(); x.fill();
      });
      x.fillRect(cx - ic * 0.05, base - 2, ic * 1.1, 4);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, cx + ic + pad * 0.8, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { set, dish, magnet, fluid, caption };
  const factories = { set: () => set(), dish: () => dish() };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, sfx: spec.sfx,
    props, factories, studio, plan: field, motion: field,
  };
}
