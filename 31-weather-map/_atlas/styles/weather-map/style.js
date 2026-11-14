// styles/weather-map/style.js — "Weather Map": a broadcast weather map made physical.
// createStyle(stage, opts) -> { spec, palette, materials, lights, post, textStyle, camera, props, factories, sfx, plan, motion, helpers }
// Every look number lives in spec.js; all weather timing lives in weather.js (THREE-free planner, also imported by
// scene.config.js so the SCORE comes from the same plan). Props are synchronous and seeded; time enters only through
// userData.update(t, ...) hooks that the scene calls from renderAt. Nothing is carried between frames.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { clamp, ease, smoothstep, rng, hash01 } from "../../kit/time.js";
import { createTextLabel } from "../../kit/text.js";
import { screenCanvas, projectToScreen } from "../../kit/overlay.js";
import { sweepGeometry } from "../../kit/paths.js";
import { pop as popU } from "../../kit/motion.js";
import * as plan from "./weather.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;
const f = (x) => (Number.isInteger(x) ? `${x}.0` : `${x}`); // number -> GLSL float literal
const vec3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${f(+c.r.toFixed(5))}, ${f(+c.g.toFixed(5))}, ${f(+c.b.toFixed(5))})`; };

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = spec.palette;
  const font = spec.text.stack;
  const textStyle = { font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const M = spec.map, G = spec.layers.graphics;
  stage.renderer.localClippingEnabled = true;
  const W2 = M.w / 2, D2 = M.d / 2;
  // graphics never leave the map rectangle (fronts that start off-map, puffs at the edge)
  const mapClip = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), W2), new THREE.Plane(new THREE.Vector3(-1, 0, 0), W2),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), D2), new THREE.Plane(new THREE.Vector3(0, 0, -1), D2),
  ];
  const shadowy = (o, cast = true, receive = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; };
  const inMap = (x, z, m = 0.6) => clamp(Math.min(W2 - Math.abs(x), D2 - Math.abs(z)) / m);
  const tint = (hex, k = 0.25) => { const m = materials.graphic.clone(); m.color.set(hex); m.emissive.set(hex); m.emissiveIntensity = k; m.clippingPlanes = mapClip; return m; };

  // ---------------------------------------------------------------- land
  const landH = plan.landField(spec.land);
  const ramp = (stops, cols, v) => {
    const c = new THREE.Color();
    if (v <= stops[0]) return c.set(cols[0]);
    for (let i = 1; i < stops.length; i++) if (v <= stops[i]) return c.set(cols[i - 1]).lerp(new THREE.Color(cols[i]), (v - stops[i - 1]) / (stops[i] - stops[i - 1]));
    return c.set(cols[cols.length - 1]);
  };
  let reliefGeo = null;
  /** shared displaced grid (built once): vertex colours = hypsometric land tint + depth-shaded seabed + a sand rim */
  function reliefGeometry() {
    if (reliefGeo) return reliefGeo;
    const g = new THREE.PlaneGeometry(M.w, M.d, M.segX, M.segZ);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const landStops = [0, 0.1, 0.28, 0.5, 0.72, 1].map((k) => k * spec.land.peak);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = landH(x, z);
      pos.setY(i, h);
      let c;
      // land ramp only (the sand rim and the seabed are coloured per pixel from height in landmass()'s shader)
      c = ramp(landStops, pal.land, Math.max(0, h));
      c.toArray(col, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    reliefGeo = g;
    return g;
  }

  /** landmass() -> Mesh: the relief model (land + seabed) of the invented landmass; userData { heightAt(x,z), w, d } */
  function landmass() {
    // shoreline + seabed colours come from the interpolated HEIGHT per pixel (vertex colours alone step along the grid)
    const mat = materials.relief.clone();
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <color_fragment>", `#include <color_fragment>
        {
          float y = vWP.y;
          vec3 sea = mix(${vec3(pal.seaShallow)}, ${vec3(pal.seaMid)}, smoothstep(0.0, 0.16, -y));
          sea = mix(sea, ${vec3(pal.seaDeep)}, smoothstep(0.16, 0.4, -y));
          vec3 landc = mix(${vec3(pal.coast)}, diffuseColor.rgb, smoothstep(0.014, 0.032, y));
          diffuseColor.rgb = y < 0.0 ? mix(${vec3(pal.coast)}, sea, smoothstep(0.0, 0.025, -y)) : landc;
        }`);
    };
    mat.customProgramCacheKey = () => "weather-map-relief";
    const m = new THREE.Mesh(reliefGeometry(), mat);
    m.name = "landmass";
    m.castShadow = true; m.receiveShadow = true;
    m.userData = { heightAt: (x, z) => Math.max(0, landH(x, z)), w: M.w, d: M.d };
    return m;
  }

  /** sea({ level }) -> Mesh: glossy translucent water sheet at sea level over the depth-shaded seabed */
  function sea(o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.d), materials.water);
    m.rotation.x = -Math.PI / 2; m.position.y = o.level ?? 0;
    m.receiveShadow = true; m.name = "sea"; m.renderOrder = 1;
    return m;
  }

  /** table() -> Group: dark studio table + the map's frame and plinth (hides the relief's cut edges) */
  function table() {
    const g = new THREE.Group(); g.name = "table";
    const yT = M.floorY - M.plinth;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), materials.table);
    top.rotation.x = -Math.PI / 2; top.position.y = yT; top.receiveShadow = true;
    g.add(top);
    const fw = M.frame, h = M.frameH - yT;
    const bar = (w, d, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.frame); b.position.set(x, yT + h / 2, z); g.add(b); };
    bar(M.w + 2 * fw, fw, 0, -D2 - fw / 2); bar(M.w + 2 * fw, fw, 0, D2 + fw / 2);
    bar(fw, M.d, -W2 - fw / 2, 0); bar(fw, M.d, W2 + fw / 2, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(M.w, M.plinth, M.d), materials.frame);
    base.position.y = yT + M.plinth / 2 - 0.01; g.add(base);
    shadowy(g, true, true);
    top.castShadow = false;
    return g;
  }

  // ---------------------------------------------------------------- temperature bands (draped on the land)
  /**
   * tempBands(weatherPlan) -> Mesh draped over the land (shares the relief grid; lit, receives cloud shadows).
   *   Colour = the plan's temperature field quantised into bands (spec.bandsKnob.step degrees), dark band edges.
   *   The GLSL is generated from the SAME numbers as plan.tempAt (cfg.temp, the fronts) — no second copy of the data.
   *   userData.update(t, level 0..1)
   */
  function tempBands(P) {
    const cfg = P.cfg, T = cfg.temp, K = spec.bandsKnob;
    const fr = (kind) => { const fd = P.F[kind], { u, n } = plan.frontFrame(fd); return { u, n, c1: fd.c1, c2: fd.c2 }; };
    const C = fr("cold"), Wf = fr("warm");
    const uniforms = { uL: { value: new THREE.Vector2() }, uLive: { value: new THREE.Vector2() }, uOn: { value: 0 }, uMix: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    const cols = pal.temps;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      const front = (F) => `{ vec2 u = vec2(${f(F.u[0])}, ${f(F.u[1])}); vec2 n = vec2(${f(F.n[0])}, ${f(F.n[1])});
        s = dot(q, u); off = dot(q, n) - (${f(F.c1)} * s + ${f(F.c2)} * s * s); }`;
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vWP; uniform vec2 uL; uniform vec2 uLive; uniform float uOn; uniform float uMix;
        vec3 bandCol(float k) {
          ${cols.map((c, i) => `if (k < ${f(i + 0.5)}) return ${vec3(c)};`).join("\n          ")}
          return ${vec3(cols[cols.length - 1])};
        }`).replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec2 p = vWP.xz, q = p - uL;
          float tv = ${f(T.base)} + ${f(T.perZ)} * p.y + ${f(T.perX)} * p.x;
          float s, off, cs, co, ws, wo;
          ${front(C)} cs = s; co = off;
          ${front(Wf)} ws = s; wo = off;
          float behind = smoothstep(${f(T.soft)}, ${f(-T.soft)}, co) * smoothstep(-2.5, -1.0, cs) * smoothstep(uLive.x + 0.5, uLive.x - 0.5, cs);
          float sector = smoothstep(${f(-T.soft)}, ${f(T.soft)}, co) * smoothstep(${f(T.soft)}, ${f(-T.soft)}, wo) * smoothstep(-0.5, 0.5, ws)
                       * smoothstep(uLive.y + 0.5, uLive.y - 0.5, ws);
          tv += uOn * (${f(T.warm)} * sector + ${f(T.cold)} * behind);
          float b = (tv - ${f(K.min)}) / ${f(K.step)};
          float k = clamp(floor(b), 0.0, ${f(cols.length - 1)});
          float fr = fract(b), w = fwidth(b) * 1.2;
          float edge = 1.0 - smoothstep(0.0, w, min(fr, 1.0 - fr));
          vec3 bc = bandCol(k) * (1.0 - ${f(K.edge)} * edge);
          float landm = smoothstep(0.012, 0.05, vWP.y);
          diffuseColor.rgb = bc;
          diffuseColor.a = uMix * ${f(K.mix)} * landm * (1.0 + 0.6 * edge);
        }`);
    };
    mat.customProgramCacheKey = () => "weather-map-tempbands";
    const m = new THREE.Mesh(reliefGeometry(), mat);
    m.name = "tempBands"; m.receiveShadow = true; m.renderOrder = 2;
    m.userData.update = (t, level = 1) => {
      const [lx, lz] = P.L(t);
      uniforms.uL.value.set(lx, lz);
      uniforms.uLive.value.set(P.grow(P.F.cold, t) * P.F.cold.len, P.grow(P.F.warm, t) * P.F.warm.len);
      uniforms.uOn.value = P.lowOn(t);
      uniforms.uMix.value = level;
      m.visible = level > 0.002;
    };
    return m;
  }

  // ---------------------------------------------------------------- isobars (glass graphics layer)
  /**
   * isobars(weatherPlan, { y }) -> Mesh: a map-sized plane on the graphics layer whose shader draws pressure contours every
   *   spec.isobar.step hPa from the SAME pressure formula as plan.pressureAt (constant pixel width via fwidth, dark halo).
   *   userData.update(t, level)
   */
  function isobars(P, o = {}) {
    const cfg = P.cfg, I = spec.isobar;
    const uniforms = { uL: { value: new THREE.Vector2() }, uH: { value: new THREE.Vector2() }, uLA: { value: 0 }, uHA: { value: 0 }, uLevel: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vXZ; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec2 vXZ; uniform vec2 uL; uniform vec2 uH; uniform float uLA; uniform float uHA; uniform float uLevel;
        float g(vec2 d, float s) { return exp(-dot(d, d) / (2.0 * s * s)); }
        void main() {
          vec2 p = vXZ;
          float pr = ${f(cfg.base)} + ${f(cfg.grad[0])} * p.x + ${f(cfg.grad[1])} * p.y + uHA * g(p - uH, ${f(cfg.high.sigma)}) - uLA * g(p - uL, ${f(cfg.low.sigma)});
          float v = pr / ${f(I.step)};
          float fw = max(fwidth(v), 1e-5);
          float d = abs(fract(v + 0.5) - 0.5) / fw;          // distance to the nearest isobar in pixels
          float core = 1.0 - smoothstep(${f(I.px - 0.6)}, ${f(I.px + 0.6)}, d);
          float halo = 1.0 - smoothstep(${f(I.px + I.halo - 0.8)}, ${f(I.px + I.halo + 0.8)}, d);
          float edge = smoothstep(0.0, 1.4, min(${f(W2)} - abs(p.x), ${f(D2)} - abs(p.y)));
          vec3 c = mix(vec3(0.03, 0.07, 0.14), ${vec3(pal.isobar)}, core);
          float a = max(core, halo * ${f(I.haloAlpha)}) * uLevel * edge;
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.d), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = o.y ?? G; m.renderOrder = 5; m.name = "isobars";
    m.userData.update = (t, level = 1) => {
      uniforms.uL.value.set(...P.L(t)); uniforms.uH.value.set(...P.H(t));
      uniforms.uLA.value = cfg.low.amp * P.lowOn(t); uniforms.uHA.value = cfg.high.amp * P.highOn(t);
      uniforms.uLevel.value = level; m.visible = level > 0.002;
    };
    return m;
  }

  // ---------------------------------------------------------------- fronts
  /**
   * front(weatherPlan, kind "cold"|"warm") -> Group on the graphics layer: a thick coloured tube along the planned curve with
   *   marching symbols (blue triangles / red semicircles) on its advancing side. Rigid in the low's frame: it grows out of
   *   the low over the front's grow window, then rides with it. Clipped to the map. userData.update(t)
   */
  function front(P, kind) {
    const fd = P.F[kind], FR = spec.front;
    const col = kind === "cold" ? pal.cold : pal.warm;
    const mat = tint(col, 0.3);
    const N = 120, pts = [];
    for (let i = 0; i < N; i++) { const s = (i / (N - 1)) * fd.len, [x, z] = plan.frontPoint(fd, s); pts.push([x, 0, z]); }
    const tubeGeo = sweepGeometry(pts, FR.radius, 10);
    const tube = new THREE.Mesh(tubeGeo, mat);
    tube.frustumCulled = false;
    const g = new THREE.Group(); g.name = `front:${kind}`;
    g.add(tube);
    // symbol geometry: flat extruded shape; shape-x along the front, shape-y = advancing side
    const b = FR.symbol;
    const sh = new THREE.Shape();
    if (kind === "cold") { sh.moveTo(-b / 2, 0); sh.lineTo(b / 2, 0); sh.lineTo(0, b * 0.9); sh.closePath(); }
    else { sh.moveTo(-b / 2, 0); sh.absarc(0, 0, b / 2, Math.PI, 0, true); sh.closePath(); }
    const symGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 16 });
    symGeo.rotateX(-Math.PI / 2);
    const syms = [];
    for (let s = FR.spacing * 0.75; s < fd.len - 0.2; s += FR.spacing) {
      const [x, z] = plan.frontPoint(fd, s);
      const { u, n } = plan.frontFrame(fd);
      const k = fd.c1 + 2 * fd.c2 * s;
      let tx = u[0] + n[0] * k, tz = u[1] + n[1] * k; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      const piv = new THREE.Group();
      piv.position.set(x, -0.01, z);
      piv.rotation.y = Math.atan2(-tz, tx);
      const mesh = new THREE.Mesh(symGeo, mat);
      mesh.frustumCulled = false;
      mesh.position.z = -FR.radius * 0.4;   // tuck the base under the tube
      piv.add(mesh); g.add(piv);
      syms.push({ s, piv });
    }
    shadowy(g, true, false);
    const segs = N - 1, perSeg = 10 * 6;
    g.userData = {
      def: fd,
      update(t) {
        const live = P.grow(fd, t) * fd.len, on = P.lowOn(t);
        g.visible = live > 0.02 && on > 0.01;
        if (!g.visible) return;
        const [lx, lz] = P.L(t);
        g.position.set(lx, G + 0.03, lz);
        tube.geometry.setDrawRange(0, Math.max(1, Math.floor((live / fd.len) * segs)) * perSeg);
        const mw = FR.march;
        for (const { s, piv } of syms) {
          const appear = clamp((live - s) / 0.5);
          const wave = Math.pow(Math.max(0, Math.sin(TAU * (s / mw.wave - t * mw.rate))), 2);
          const sc = appear > 0 ? ease.outBack(appear) * (1 + mw.amp * wave) : 0;
          piv.visible = sc > 0.002;
          piv.scale.setScalar(Math.max(0.001, sc));
        }
      },
    };
    return g;
  }

  // ---------------------------------------------------------------- H / L centres
  /**
   * pressureMarker("H"|"L", { color }) -> Group: a white disc with a coloured ring on the graphics layer and a big bold
   *   letter that always faces the camera. userData.update(t, at:[x,z], u 0..1 pop)
   */
  function pressureMarker(letter, o = {}) {
    const MK = spec.marker, col = o.color ?? (letter === "H" ? pal.high : pal.low);
    const g = new THREE.Group(); g.name = `marker:${letter}`;
    const inner = new THREE.Group(); g.add(inner);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, transparent: true, opacity: 0.88, emissive: 0xffffff, emissiveIntensity: 0.15 });
    discMat.clippingPlanes = mapClip;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(MK.disc, MK.disc, 0.05, 56), discMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(MK.disc, 0.07, 10, 64), tint(col, 0.35));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
    const lab = createTextLabel(letter, { font, weight: 900, color: col, height: MK.letter, padding: 0.12, stroke: { color: "#ffffff", width: 14 } });
    lab.material.toneMapped = true; lab.material.clippingPlanes = mapClip;
    const bill = new THREE.Group(); bill.position.y = MK.letter * 0.42; bill.add(lab);
    inner.add(disc, ring, bill);
    disc.castShadow = ring.castShadow = true;
    g.userData = {
      update(t, at, u, camera = stage.camera) {
        g.visible = u > 0.002;
        inner.scale.setScalar(Math.max(0.001, u));
        g.position.set(at[0], G + 0.02, at[1]);
        bill.quaternion.copy(camera.quaternion);
      },
    };
    g.userData.update(-1, [0, 0], 0);
    return g;
  }

  // ---------------------------------------------------------------- clouds + rain (ride in the low's frame)
  /**
   * cloudLayer(weatherPlan, { seed }) -> Group: soft flattened cloud puffs (one InstancedMesh, real shadows) laid out along
   *   both fronts and round the low, plus falling rain streaks under the cold-front band and the warm sector. Each puff
   *   appears as its front grows past it, fades at the map edge, and billows gently. userData.update(t)
   */
  function cloudLayer(P, o = {}) {
    const R = rng(o.seed ?? 31), CL = spec.clouds, [y0, y1] = spec.layers.cloud;
    const puffs = [];
    const along = (kind, s0, step, offs, rad, rain) => {
      const fd = P.F[kind], { n } = plan.frontFrame(fd);
      for (let s = s0; s < fd.len; s += step) {
        const [x, z] = plan.frontPoint(fd, s);
        const k = R.int(1, 2);
        for (let j = 0; j < k; j++) {
          const off = R.range(offs[0], offs[1]);
          puffs.push({ kind, s, x: x + n[0] * off + R.range(-0.25, 0.25), z: z + n[1] * off + R.range(-0.25, 0.25),
            r: R.range(rad[0], rad[1]), y: R.range(y0, y1), ph: R.range(0, TAU), rain: rain && R.chance(0.7) });
        }
      }
    };
    along("cold", 0.3, 0.45, [-1.2, -0.3], [0.3, 0.5], true);   // narrow band just behind the cold front
    along("warm", 0.6, 0.7, [0.45, 2.3], [0.32, 0.55], false);     // broad shield ahead of the warm front
    along("warm", 1.0, 1.0, [-1.6, -0.5], [0.25, 0.4], true);    // patchy warm-sector cloud
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU * 1.1, r = 0.4 + i * 0.2; puffs.push({ kind: "low", s: 0, x: Math.cos(a) * r, z: Math.sin(a) * r * 0.8, r: R.range(0.35, 0.55), y: R.range(y0, y1), ph: R.range(0, TAU), rain: false }); }
    // every puff is a little cluster: a body plus two smaller lobes on top (reads as a cumulus, not a disc)
    const subs = [];
    puffs.forEach((p, i) => {
      subs.push({ i, dx: 0, dy: 0, dz: 0, k: 1 });
      for (let j = 0; j < 2; j++) { const a = R.range(0, TAU); subs.push({ i, dx: Math.cos(a) * 0.45, dy: R.range(0.25, 0.45), dz: Math.sin(a) * 0.45, k: R.range(0.5, 0.7) }); }
    });
    const geo = new THREE.SphereGeometry(1, 20, 14);
    const mesh = new THREE.InstancedMesh(geo, materials.cloud, subs.length);
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = "clouds";
    // rain streaks
    const drops = [];
    puffs.forEach((p, i) => { if (p.rain) for (let k = 0; k < CL.rainPer; k++) drops.push({ i, a: R.range(0, TAU), d: Math.sqrt(R.next()) * p.r * 0.75, ph: R.next(), sp: R.range(2.2, 2.9) }); });
    const rainMat = new THREE.MeshBasicMaterial({ color: pal.rain, transparent: true, opacity: 0.7, depthWrite: false });
    const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, CL.rainLen, 0.016), rainMat, Math.max(1, drops.length));
    rain.frustumCulled = false; rain.name = "rain";
    const g = new THREE.Group(); g.name = "cloudLayer"; g.add(mesh, rain);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const live = { cold: 0, warm: 0 };
    const puffScale = [], pw = [];
    g.userData = {
      puffs,
      update(t) {
        const [lx, lz] = P.L(t), on = P.lowOn(t);
        live.cold = P.grow(P.F.cold, t) * P.F.cold.len; live.warm = P.grow(P.F.warm, t) * P.F.warm.len;
        puffs.forEach((p, i) => {
          const wx = lx + p.x + Math.sin(t * 0.35 + p.ph) * 0.08, wz = lz + p.z + Math.cos(t * 0.3 + p.ph) * 0.06;
          const reveal = p.kind === "low" ? on : clamp((live[p.kind] - p.s) / 0.8) * on;
          const edge = clamp((Math.min(W2 - Math.abs(wx), D2 - Math.abs(wz)) - p.r * 0.9) / 0.8);
          const k = ease.outCubic(reveal) * edge * p.r * (1 + 0.05 * Math.sin(t * 0.8 + p.ph * 2));
          puffScale[i] = k;
          pw[i] = [wx, wz];
        });
        subs.forEach((u, j) => {
          const k = puffScale[u.i], p = puffs[u.i], [wx, wz] = pw[u.i];
          const r = Math.max(1e-3, k * u.k);
          ps.set(wx + u.dx * k, p.y + u.dy * k * CL.flatten, wz + u.dz * k);
          sc.set(r, Math.max(1e-3, r * CL.flatten), r);
          mesh.setMatrixAt(j, m4.compose(ps, q, sc));
        });
        mesh.instanceMatrix.needsUpdate = true;
        drops.forEach((d, j) => {
          const p = puffs[d.i], k = puffScale[d.i] / p.r;
          const wx = lx + p.x + Math.cos(d.a) * d.d, wz = lz + p.z + Math.sin(d.a) * d.d;
          const top = p.y - p.r * CL.flatten * 0.5, bot = landH(wx, wz) > 0 ? landH(wx, wz) : 0;
          const u = (d.ph + t * d.sp / Math.max(0.5, top - bot)) % 1;
          ps.set(wx, top - u * (top - bot) - CL.rainLen / 2, wz);
          const vis = k > 0.6 ? clamp((k - 0.6) / 0.3) : 0;
          sc.set(vis, vis * clamp((1 - u) * 6), vis);
          rain.setMatrixAt(j, m4.compose(ps, q, sc));
        });
        rain.instanceMatrix.needsUpdate = true;
        g.visible = on > 0.002;
      },
    };
    g.userData.update(-1);
    return g;
  }

  // ---------------------------------------------------------------- wind arrows
  /**
   * windField(weatherPlan, { cols, rows }) -> InstancedMesh of flat white arrows on the graphics layer that FLOW along the
   *   plan's wind field: each arrow glides through its cell along the local wind and fades at the ends of its cycle
   *   (phase = fract(t·rate + hash)), so the field moves without carrying state. Length follows wind speed.
   *   userData.update(t, level)
   */
  function windField(P, o = {}) {
    const A = spec.arrows, cols = o.cols ?? A.cols, rows = o.rows ?? A.rows;
    const L = A.length, w = A.width;
    const sh = new THREE.Shape();
    sh.moveTo(-L / 2, -w * 0.18); sh.lineTo(L / 2 - w * 0.9, -w * 0.18); sh.lineTo(L / 2 - w * 0.9, -w / 2); sh.lineTo(L / 2, 0);
    sh.lineTo(L / 2 - w * 0.9, w / 2); sh.lineTo(L / 2 - w * 0.9, w * 0.18); sh.lineTo(-L / 2, w * 0.18); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mat = tint(pal.arrow, 0.35);
    const n = cols * rows;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = "windField";
    const cw = M.w / cols, cd = M.d / rows;
    const cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push({ x: -W2 + (i + 0.5) * cw, z: -D2 + (j + 0.5) * cd, ph: hash01(i, j, 77) });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    mesh.userData.update = (t, level = 1) => {
      cells.forEach((c, k) => {
        const ph = (c.ph + t * A.rate) % 1;
        let [vx, vz] = P.windAt(c.x, c.z, t);
        const sp = Math.hypot(vx, vz);
        const dx = sp > 1e-6 ? vx / sp : 1, dz = sp > 1e-6 ? vz / sp : 0;
        const travel = (ph - 0.5) * Math.min(cw, cd) * 0.95;
        const x = c.x + dx * travel, z = c.z + dz * travel;
        [vx, vz] = P.windAt(x, z, t);
        const s2 = Math.hypot(vx, vz), mag = clamp(s2 / A.vRef, 0, 1.25);
        const fade = Math.sin(Math.PI * ph);
        const k2 = mag < A.minLevel ? 0 : level * fade * (0.45 + 0.55 * mag) * inMap(x, z, 0.8);
        ps.set(x, G + 0.05, z);
        q.setFromAxisAngle(up, Math.atan2(-vz, vx));
        sc.set(Math.max(1e-3, k2), 1, Math.max(1e-3, k2));
        mesh.setMatrixAt(k, m4.compose(ps, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = level > 0.002;
    };
    return mesh;
  }

  // ---------------------------------------------------------------- places
  /** placeMarker({ at:[x,z] }) -> Group: white puck on the land + slim pole up to the graphics layer + bead; userData { top:[x,y,z], set(u) } */
  function placeMarker(o) {
    const [x, z] = o.at, y = Math.max(0, landH(x, z));
    const g = new THREE.Group(); g.name = "place";
    g.position.set(x, y, z);
    const inner = new THREE.Group(); g.add(inner);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.08, 32), materials.pin); puck.position.y = 0.04;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, G - y, 10), materials.pole); pole.position.y = (G - y) / 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), materials.pin); bead.position.y = G - y;
    inner.add(puck, pole, bead);
    shadowy(g, true, true);
    g.userData = { top: [x, G + 0.08, z], set: (u) => { g.visible = u > 0.002; inner.scale.set(1, Math.max(0.001, u), 1); } };
    g.userData.set(0);
    return g;
  }

  // icons (canvas paths; pure drawing, no fonts)
  function drawIcon(ctx, kind, cx, cy, r) {
    const sun = (x, y, rr, rays = true) => {
      ctx.fillStyle = pal.sun; ctx.strokeStyle = pal.sun; ctx.lineCap = "round";
      if (rays) { ctx.lineWidth = rr * 0.22; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr * 1.3); ctx.lineTo(x + Math.cos(a) * rr * 1.7, y + Math.sin(a) * rr * 1.7); ctx.stroke(); } }
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    };
    const cloud = (x, y, s, fill = "#f2f5f9") => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x - s * 0.55, y + s * 0.1, s * 0.42, 0, TAU); ctx.arc(x - s * 0.05, y - s * 0.22, s * 0.55, 0, TAU);
      ctx.arc(x + s * 0.5, y + s * 0.05, s * 0.45, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x - s * 0.97, y + s * 0.05, s * 1.92, s * 0.47, s * 0.23); ctx.fill();
    };
    if (kind === "sun") sun(cx, cy, r * 0.52);
    else if (kind === "clear") { sun(cx + r * 0.28, cy - r * 0.3, r * 0.4); cloud(cx - r * 0.12, cy + r * 0.22, r * 0.62); }
    else if (kind === "cloud") { cloud(cx + r * 0.25, cy - r * 0.28, r * 0.5, "#c5cfdb"); cloud(cx - r * 0.08, cy + r * 0.12, r * 0.7); }
    else if (kind === "rain" || kind === "storm") {
      cloud(cx, cy - r * 0.22, r * 0.72, kind === "storm" ? "#aab5c4" : "#e9eef4");
      if (kind === "rain") {
        ctx.strokeStyle = pal.drop; ctx.lineWidth = r * 0.12; ctx.lineCap = "round";
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * r * 0.42, cy + r * 0.38); ctx.lineTo(cx + i * r * 0.42 - r * 0.14, cy + r * 0.75); ctx.stroke(); }
      } else {
        ctx.fillStyle = pal.bolt; ctx.beginPath();
        ctx.moveTo(cx + r * 0.08, cy + r * 0.12); ctx.lineTo(cx - r * 0.3, cy + r * 0.62); ctx.lineTo(cx - r * 0.02, cy + r * 0.6);
        ctx.lineTo(cx - r * 0.16, cy + r * 1.0); ctx.lineTo(cx + r * 0.32, cy + r * 0.42); ctx.lineTo(cx + r * 0.04, cy + r * 0.44); ctx.lineTo(cx + r * 0.2, cy + r * 0.12);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  const fontPx = (px, wgt = 800) => `${wgt} ${px}px ${font}`;
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const W = stage.width, H = stage.height;
  const fadeIO = (t, on, off, inD = 0.3, outD = 0.3) => clamp(Math.min((t - on) / inD, (off - t) / outD));

  /**
   * placeCard(name, { states, temps, px }) -> overlay Group of pre-baked cards (one canvas per weather state: icon + name +
   *   temperature; drawn ONCE at build — nothing is redrawn in renderAt). The card hangs above a 3D anchor with a pointer.
   *   userData.update(t, { anchor:[x,y,z], state, since, prev, on, off? }) — the new state's card pops in, the old one shrinks out.
   */
  function placeCard(name, o = {}) {
    const px = o.px ?? spec.text.cardPx, states = o.states ?? plan.STATES;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = fontPx(px, 800);
    const nameW = Math.ceil(probe.measureText(name).width);
    const Hc = Math.round(px * 3.0), icon = Math.round(px * 2.6);
    const Wc = icon + Math.max(nameW, px * 2.6) + Math.round(px * 1.1);
    const pin = Math.round(px * 0.45);
    const cards = {};
    for (const st of states) {
      const m = screenCanvas(stage, Wc + 8, Hc + pin + 8, (ctx, w, h, s) => {
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        ctx.fillStyle = pal.navy; rr(ctx, 4, 4, Wc, Hc, px * 0.38); ctx.fill();
        ctx.beginPath(); ctx.moveTo(4 + Wc / 2 - pin, 4 + Hc - 1); ctx.lineTo(4 + Wc / 2, 4 + Hc + pin); ctx.lineTo(4 + Wc / 2 + pin, 4 + Hc - 1); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = s.state === "storm" ? pal.accent : pal.tag; ctx.fillRect(4, 4 + px * 0.38, px * 0.16, Hc - px * 0.76);
        drawIcon(ctx, s.state, 4 + icon * 0.55, 4 + Hc * 0.47, icon * 0.4);
        ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
        ctx.font = fontPx(px * 0.72, 700); ctx.fillStyle = "#b9c8dc"; ctx.fillText(s.name, 4 + icon, 4 + Hc * 0.4);
        ctx.font = fontPx(px * 1.35, 800); ctx.fillStyle = pal.white; ctx.fillText(s.temp, 4 + icon, 4 + Hc * 0.83);
      });
      m.userData.set({ state: st, name, temp: o.temps?.[st] ?? "" });
      m.userData.opacity(0);
      cards[st] = m;
    }
    const prewarm = () => { for (const k in cards) { const tex = cards[k].material.map; stage.renderer.initTexture(tex); } };
    prewarm();
    const g = new THREE.Group();
    g.userData = {
      cards, w: Wc, h: Hc + pin,
      update(t, c) {
        const a = fadeIO(t, c.on, c.off ?? Infinity, 0.3, 0.3);
        const p = projectToScreen(stage, c.anchor);
        const sx = (p.x * 0.5 + 0.5) * W, sy = (0.5 - p.y * 0.5) * H;
        for (const k in cards) cards[k].userData.opacity(0);
        const inside = clamp((0.97 - Math.max(Math.abs(p.x), Math.abs(p.y))) / 0.08);
        if (a * inside <= 0 || p.behind) return;
        const show = (st, s, alpha) => {
          const m = cards[st]; if (!m || s <= 0.002) return;
          const cw = (Wc + 8) * s, ch = (Hc + pin + 8) * s;
          const x = clamp(sx - cw / 2, 0.05 * W, 0.95 * W - cw), y = clamp(sy - ch - 6 * s, 0.05 * H, 0.95 * H - ch);
          m.userData.place(x, y, s);
          m.userData.opacity(alpha * inside);
        };
        const dt = t - c.since;
        const intro = popU(t, c.on, 0.45, 1.6);
        if (c.prev && dt < 0.42) {
          show(c.prev, 1 - ease.inCubic(clamp(dt / 0.16)), a);
          show(c.state, ease.outBack(clamp((dt - 0.1) / 0.32)) * intro, a);
        } else show(c.state, intro, a);
      },
    };
    return g;
  }

  // ---------------------------------------------------------------- lower third
  /**
   * lowerThird(captions [{ text, sub }], { x, y, px }) -> overlay controller: a fixed broadcast bar (red "FORECAST" tab,
   *   navy bar, yellow "SAMPLE DATA" chip) plus one pre-baked headline per caption that wipes in/out. ONE fixed region,
   *   visible in every shot. userData.update(t, { i, on, off, barOn })
   */
  function lowerThird(captions, o = {}) {
    const px = o.px ?? spec.text.lowerPx;
    const BW = Math.round(px * 18.5), BH = Math.round(px * 1.95), TAB = Math.round(px * 0.62);
    const x0 = o.x ?? Math.round(0.06 * W), y0 = o.y ?? Math.round(0.775 * H);
    const bar = screenCanvas(stage, BW + 12, BH + TAB + 12, (ctx) => {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      ctx.fillStyle = pal.navy; rr(ctx, 6, 6 + TAB, BW, BH, 6); ctx.fill(); ctx.restore();
      ctx.fillStyle = pal.accent; rr(ctx, 6, 6, px * 4.4, TAB + 6, 5); ctx.fill();
      ctx.fillStyle = pal.navy; ctx.fillRect(6, 6 + TAB, px * 4.4, 6);
      ctx.fillStyle = pal.accent; ctx.fillRect(6, 6 + TAB, px * 0.22, BH);
      ctx.font = fontPx(Math.round(px * 0.36), 800); ctx.fillStyle = pal.white; ctx.textBaseline = "middle";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      ctx.fillText("FORECAST", 6 + px * 0.42, 6 + TAB * 0.56);
      // SAMPLE DATA chip (right end of the bar)
      ctx.font = fontPx(Math.round(px * 0.32), 800);
      const label = "SAMPLE DATA · INVENTED MAP", tw = ctx.measureText(label).width;
      ctx.fillStyle = pal.tag; rr(ctx, 6 + BW - tw - px * 0.6, 6, tw + px * 0.6, TAB + 6, 5); ctx.fill();
      ctx.fillStyle = pal.navy; ctx.fillRect(6 + BW - tw - px * 0.6, 6 + TAB, tw + px * 0.6, 6);
      ctx.fillStyle = pal.ink; ctx.fillText(label, 6 + BW - tw - px * 0.3, 6 + TAB * 0.56);
    });
    bar.userData.set({ v: 1 });
    const heads = captions.map((c) => {
      const m = screenCanvas(stage, BW - Math.round(px * 0.6), BH - 4, (ctx, w, h, s) => {
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.font = fontPx(px, 800); ctx.fillStyle = pal.white;
        if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
        ctx.fillText(s.text, px * 0.32, h * 0.42);
        if (s.sub) { ctx.font = fontPx(Math.round(px * 0.34), 700); ctx.fillStyle = pal.tag; if ("letterSpacing" in ctx) ctx.letterSpacing = "2px"; ctx.fillText(s.sub, px * 0.34, h * 0.85); }
      });
      m.userData.set({ text: c.text, sub: c.sub ?? "" });
      m.userData.opacity(0);
      return m;
    });
    for (const m of [bar, ...heads]) { m.renderOrder = 20; stage.renderer.initTexture(m.material.map); }
    bar.userData.opacity(0);
    const ctl = {
      update(t, c) {
        const ba = clamp((t - (c.barOn ?? 0)) / 0.35);
        bar.userData.opacity(ba);
        bar.userData.place(x0 - (1 - ease.outCubic(ba)) * 40, y0);
        heads.forEach((m) => m.userData.opacity(0));
        if (c.i < 0) return;
        const a = fadeIO(t, c.on, c.off, 0.3, 0.25);
        if (a <= 0) return;
        const slide = (1 - ease.outCubic(clamp((t - c.on) / 0.4))) * 30;
        heads[c.i].userData.place(x0 + px * 0.3 + slide, y0 + TAB + 6 + 2);
        heads[c.i].userData.opacity(a * ba);
      },
    };
    return ctl;
  }

  const props = { landmass, sea, table, tempBands, isobars, front, pressureMarker, cloudLayer, windField, placeMarker, placeCard, lowerThird };
  return {
    spec,
    palette: pal,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {},
    sfx: spec.sfx,
    plan,
    motion: plan,
    helpers: { landH, drawIcon, mapClip, inMap },
  };
}
