// styles/vortex-rings/style.js — "Vortex Rings": white smoke rings fired from a drum along a black, side-lit glass tank.
// The look lives in spec.js; WHERE each ring is and HOW BIG it is lives in rings.js (THREE-free planner, integrated once
// at load and shared with SCORE). This file turns a plan into pictures:
//   - smoke(plan, i): ONE instanced sprite cloud per ring. Every sprite is pinned to (azimuth, roll phase, distance from
//     the core in core radii); the vertex shader places it from the ring's (x, R, a, spin) uniforms, which the scene
//     reads from the plan at t. Wake sprites are shed at a fixed planned time, then hang and fade. Nothing accumulates.
//   - drum(): lacquered shell, painted face with the hole (and a dark throat), brass hoops + tension rods, a cream skin
//     at the back that dimples when tapped, a felt mallet on a swing arm; update(t, taps) poses it from the tap list.
//   - tank(): dark glossy floor, black back wall with the light sheet grazing it, faint glass edges.
//   - caption(): overlay chip, exact colours, drawn after post.
// Props never animate themselves: the scene calls update(t) from renderAt.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { clamp, lerp, rng, ease, TAU } from "../../kit/time.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as rings from "./rings.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/** malletAngle(t, taps, M) -> rad away from the skin (0 = touching). Pure function of t and the tap list. */
export function malletAngle(t, taps, M) {
  const wind = 0.32, lift = 0.75;
  let a = M.raised;
  for (let k = 0; k < taps.length; k++) {
    const T = taps[k].t, prev = k ? taps[k - 1].t : -Infinity;
    const restFrom = prev === -Infinity ? M.raised : M.rebound;
    if (t < T - wind - lift) { if (k === 0 || t >= prev) a = restFrom; break; }
    if (t < T - wind) { a = lerp(restFrom, M.raised, ease.inOutSine((t - (T - wind - lift)) / lift)); break; }
    if (t < T) { a = M.raised * (1 - ease.inCubic((t - (T - wind)) / wind)); break; }
    // after the strike: a quick bounce off the skin to the rest angle
    a = M.rebound * ease.outCubic((t - T) / 0.28);
  }
  return a;
}

/** skinDip(t, taps, dip) -> m the skin is pushed in: a damped ring after every tap */
export function skinDip(t, taps, dip) {
  let d = 0;
  for (const tp of taps) {
    const u = t - tp.t;
    if (u < 0) continue;
    d += dip * (0.75 + 0.5 * (tp.hard ?? 0)) * Math.exp(-u * 7) * Math.cos(TAU * 7.5 * u);
  }
  return d;
}

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, SM = spec.smoke, D = spec.drum, TK = spec.tank;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  stage.scene.background = new THREE.Color(P.bg);
  materials.hole.side = THREE.DoubleSide;
  materials.skin.side = THREE.DoubleSide;

  // ---------------------------------------------------------------- smoke
  const smokeVS = /* glsl */ `
    attribute vec4 aA;   // theta, phi, rho (core radii), seed
    attribute vec4 aB;   // size, level, shed time, kind (1 = wake)
    attribute vec4 aS;   // shed x, shed r, ring speed at shed, hole radius share
    uniform float uT; uniform float uLaunch; uniform float uX; uniform float uR; uniform float uA; uniform float uSpin;
    uniform float uX0; uniform float uHole; uniform float uForm; uniform float uWob; uniform float uA0;
    uniform float uWakeLife; uniform float uWakeDrift; uniform vec3 uLight; uniform float uLit; uniform float uShade;
    uniform vec3 uLitCol; uniform vec3 uShadeCol; uniform float uLevel; uniform float uStreak;
    varying vec2 vUv; varying vec3 vCol; varying float vSeed;
    void main() {
      float th = aA.x, ph = aA.y, rho = aA.z, sd = aA.w;
      float age = uT - uLaunch;
      vec3 er = vec3(0.0, cos(th), sin(th));
      vec3 ex = vec3(1.0, 0.0, 0.0);
      float wob = uWob * (sin(3.0 * th + 1.7 + 0.6 * uT) * 0.6 + sin(5.0 * th + 0.4 - 0.8 * uT) * 0.4);
      float R = uR * (1.0 + wob);
      float psi = ph - uSpin / max(1.0, rho * rho);
      float ra = rho * uA;
      vec3 n = cos(psi) * er + sin(psi) * ex;
      vec3 p = vec3(uX, 0.0, 0.0) + R * er + ra * n;
      // birth: the puff leaves the hole as a disc and rolls up into the ring
      float f = eo(clamp(age / uForm, 0.0, 1.0));
      vec3 p0 = vec3(uX0 - 0.2 + 0.35 * fract(sd * 3.17), 0.0, 0.0) + uHole * aS.w * er;
      p = mix(p0, p, f);
      // wake: shed at a planned time, then it hangs, drifts a little and fades
      float since = uT - aB.z;
      float w = aB.w * step(0.0, since);
      float tau = max(since, 0.0);
      vec3 pw = vec3(aS.x + uWakeDrift * aS.z * tau * (1.0 - 0.25 * tau / uWakeLife), 0.0, 0.0)
              + aS.y * (1.0 + 0.05 * tau) * er + 0.06 * tau * vec3(0.0, -0.4, 0.0) * fract(sd * 9.1);
      p = mix(p, pw, w);
      float vis = smoothstep(0.0, 0.12, age) * (1.0 - w * smoothstep(0.0, uWakeLife, tau)) * mix(1.0, 0.4, w);
      // side light: the half of the roll facing the lamp is warm and bright, the far half cold and dim
      vec3 nn = normalize(mix(n, er, clamp(w + (1.0 - f) + (1.0 - min(rho, 1.0)) * 0.5, 0.0, 1.0)));
      float l = clamp(dot(nn, uLight) * 0.5 + 0.5, 0.0, 1.0);
      l = l * l * (3.0 - 2.0 * l);
      vCol = mix(uShadeCol * uShade, uLitCol * uLit, l) * aB.y * uLevel * vis;
      vSeed = sd;
      vUv = position.xy;
      float size = aB.x * (uA / uA0) * (1.0 + w * (0.8 + 2.5 * tau / uWakeLife));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      // streak along the roll: the sprite is stretched along the direction the smoke is moving round the core
      vec3 tw = normalize(mix(-sin(psi) * er + cos(psi) * ex, ex, w));
      vec3 tv = mat3(modelViewMatrix) * tw;
      float L = length(tv.xy);
      vec2 d = L > 1e-4 ? tv.xy / L : vec2(1.0, 0.0);
      vec2 pp = vec2(-d.y, d.x);
      float stretch = 1.0 + uStreak * clamp(L, 0.0, 1.0) * (1.0 - w);
      mv.xy += (position.x * stretch * d + position.y * pp) * size;
      gl_Position = projectionMatrix * mv;
    }`;
  const smokeVSfull = /* glsl */ `float eo(float x) { float y = 1.0 - x; return 1.0 - y * y * y; }\n` + smokeVS;
  const smokeFS = /* glsl */ `
    varying vec2 vUv; varying vec3 vCol; varying float vSeed;
    void main() {
      float r2 = dot(vUv, vUv);
      float a = exp(-r2 * 3.0) * clamp(1.0 - r2, 0.0, 1.0);
      float s = vSeed * 37.0;
      float lump = 0.62 + 0.38 * sin(vUv.x * 2.6 + s) * sin(vUv.y * 2.3 + s * 1.7);
      gl_FragColor = vec4(vCol * a * lump, 1.0);
    }`;

  /** smoke(plan, i, { seed }) -> { mesh, update(t) }: one ring's sprite cloud, placed from plan.state(i, t) */
  function smoke(plan, i, o = {}) {
    const ring = plan.rings[i];
    const N = o.count ?? SM.count;
    const R = rng(o.seed ?? 108 + i * 31);
    const A = new Float32Array(N * 4), B = new Float32Array(N * 4), S = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) {
      const theta = ((k + R.next()) / N) * TAU;
      // the cross-section is a rolled-up sheet: a few spiral arms (plus some loose fill), wound tighter toward the core
      const rho = 0.06 + (SM.rhoMax - 0.06) * Math.pow(R.next(), SM.rhoPow);
      const arm = R.int(0, SM.arms - 1);
      const loose = R.next() < SM.loose;
      const phi = loose ? R.next() * TAU : (arm / SM.arms) * TAU + SM.wind * Math.log(rho / 0.35) + R.gaussian(0, SM.armSpread);
      const seed = R.next();
      const q = rho / SM.rhoMax;
      const size = lerp(SM.size[0], SM.size[1], R.next()) * (0.8 + 0.7 * q);
      const level = 1.2 - 0.85 * q * q;
      const wake = R.next() < SM.wake ? 1 : 0;
      let shedT = 1e6, sx = 0, sr = 0, su = 0;
      if (wake) {
        shedT = ring.launch + SM.form + 0.2 + R.next() * (plan.end + 2 - ring.launch);
        if (shedT < plan.end) {
          const st = plan.state(i, shedT);
          sx = st.x - (0.6 + 0.6 * R.next()) * st.a;
          sr = st.R + (R.next() - 0.5) * 1.6 * st.a;
          su = st.U;
        } else shedT = 1e6;
      }
      A.set([theta, phi, rho, seed], k * 4);
      B.set([size, level, shedT, wake], k * 4);
      S.set([sx, sr, su, 0.25 + 0.75 * Math.sqrt(R.next())], k * 4);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute("aA", new THREE.InstancedBufferAttribute(A, 4));
    g.setAttribute("aB", new THREE.InstancedBufferAttribute(B, 4));
    g.setAttribute("aS", new THREE.InstancedBufferAttribute(S, 4));
    g.instanceCount = N;
    const L = new THREE.Vector3(...SM.light).normalize();
    const U = {
      uT: { value: 0 }, uLaunch: { value: ring.launch }, uX: { value: ring.x0 }, uR: { value: ring.R0 }, uA: { value: ring.a0 },
      uSpin: { value: 0 }, uX0: { value: ring.x0 }, uHole: { value: D.hole }, uForm: { value: SM.form }, uWob: { value: SM.wobble },
      uA0: { value: 0.2 }, uWakeLife: { value: SM.wakeLife }, uWakeDrift: { value: SM.wakeDrift }, uLight: { value: L },
      uLit: { value: SM.lit }, uShade: { value: SM.shade }, uLitCol: { value: new THREE.Color(P.smokeLit) },
      uShadeCol: { value: new THREE.Color(P.smokeShade) }, uLevel: { value: SM.level }, uStreak: { value: SM.streak },
    };
    const mat = new THREE.ShaderMaterial({
      name: `smoke${i}`, vertexShader: smokeVSfull, fragmentShader: smokeFS, uniforms: U,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `smoke${i}`; mesh.frustumCulled = false; mesh.renderOrder = 5;
    stage.scene.add(mesh);
    return {
      mesh,
      update(t, level = 1) {
        const s = plan.state(i, t);
        mesh.visible = s.alive && level > 0;
        U.uT.value = t; U.uX.value = s.x; U.uR.value = s.R; U.uA.value = s.a; U.uSpin.value = s.spin * SM.spinScale;
        U.uLevel.value = SM.level * level;
        return s;
      },
    };
  }

  // ---------------------------------------------------------------- the drum
  /** drum() -> { group, update(t, taps) }: shell along -X from the face at x = 0, hole facing +X, skin at the back */
  function drum() {
    const G = new THREE.Group(); G.name = "drum";
    const xm = -D.len / 2;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.len, 72, 1, true), materials.shell);
    shell.rotation.z = Math.PI / 2; shell.position.x = xm; shell.name = "shell";
    // painted face with the hole, and a dark throat behind it
    const face = new THREE.Mesh(new THREE.RingGeometry(D.hole, D.r, 96, 2), materials.face);
    face.rotation.y = Math.PI / 2; face.position.x = 0.002; face.name = "face";
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(D.hole, D.hole, D.tube, 72, 1, true), materials.hole);
    throat.rotation.z = Math.PI / 2; throat.position.x = -D.tube / 2; throat.name = "throat";
    const back = new THREE.Mesh(new THREE.CircleGeometry(D.hole * 1.02, 72), materials.hole);
    back.rotation.y = Math.PI / 2; back.position.x = -D.tube; back.name = "throatBack";
    const lip = new THREE.Mesh(new THREE.TorusGeometry(D.hole, 0.03, 12, 96), materials.brass);
    lip.rotation.y = Math.PI / 2; lip.position.x = 0.01; lip.name = "lip";
    G.add(shell, face, throat, back, lip);
    for (const x of [0, -D.len]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(D.r + D.hoop * 0.4, D.hoop, 16, 96), materials.brass);
      hoop.rotation.y = Math.PI / 2; hoop.position.x = x; hoop.name = "hoop";
      G.add(hoop);
    }
    for (let k = 0; k < D.rods; k++) {
      const a = (k + 0.5) / D.rods * TAU;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, D.len, 10), materials.brass);
      rod.rotation.z = Math.PI / 2; rod.position.set(xm, Math.cos(a) * (D.r + 0.07), Math.sin(a) * (D.r + 0.07)); rod.name = "rod";
      G.add(rod);
    }
    // the skin: rewritten from t (dimple), never accumulated
    const skinGeo = new THREE.RingGeometry(0.0001, D.r, 64, 12);
    const base = skinGeo.attributes.position.array.slice();
    const skin = new THREE.Mesh(skinGeo, materials.skin);
    skin.rotation.y = -Math.PI / 2; skin.position.x = -D.len - 0.004; skin.name = "skin";
    G.add(skin);
    // stand: two cradles to the floor
    for (const x of [-0.45, -D.len + 0.45]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, -TK.y[0] - D.r + 0.25, 0.16), materials.steel);
      leg.position.set(x, TK.y[0] + (-TK.y[0] - D.r + 0.25) / 2, 0); leg.name = "leg";
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.8), materials.steel);
      foot.position.set(x, TK.y[0] + 0.03, 0); foot.name = "foot";
      G.add(leg, foot);
    }
    // mallet: a post behind the drum, a swing arm in the x-y plane, a felt head that meets the skin centre
    const M = D.mallet;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, M.pivot[1] - TK.y[0], 16), materials.steel);
    post.position.set(M.pivot[0], (M.pivot[1] + TK.y[0]) / 2, -0.35); post.name = "malletPost";
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 16), materials.brass);
    axle.rotation.x = Math.PI / 2; axle.position.set(M.pivot[0], M.pivot[1], -0.17); axle.name = "axle";
    G.add(post, axle);
    const pivot = new THREE.Group(); pivot.position.set(...M.pivot); pivot.name = "malletPivot";
    // strike direction: from the pivot to the skin centre (minus the head radius)
    const hit = new THREE.Vector3(-D.len - M.head * 0.95, 0.12, 0).sub(new THREE.Vector3(...M.pivot));
    const armLen = hit.length();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, armLen, 12), materials.wood);
    arm.position.y = -armLen / 2; arm.name = "arm";
    const head = new THREE.Mesh(new THREE.SphereGeometry(M.head, 32, 20), materials.felt);
    head.position.y = -armLen; head.name = "malletHead";
    const swing = new THREE.Group(); swing.add(arm, head);
    const hitAngle = Math.atan2(hit.x, -hit.y); // rotation about z that points -Y at the hit
    pivot.add(swing);
    G.add(pivot);
    G.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    stage.scene.add(G);
    const pos = skinGeo.attributes.position;
    return {
      group: G,
      update(t, taps) {
        // angle away from the skin = rotating the head toward -X (away from the drum)
        swing.rotation.z = hitAngle - malletAngle(t, taps, M);
        const d = skinDip(t, taps, D.skinDip);
        for (let v = 0; v < pos.count; v++) {
          const x = base[v * 3], y = base[v * 3 + 1];
          const q = clamp((x * x + y * y) / (D.r * D.r));
          pos.array[v * 3 + 2] = -d * (1 - q); // local -z = world +x after the rotation: into the drum
        }
        pos.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- the tank
  /** tank() -> Group: dark glossy floor, black back wall with the grazing light sheet, faint glass edges */
  function tank() {
    const G = new THREE.Group(); G.name = "tank";
    const [x0, x1] = TK.x, [y0, y1] = TK.y, [z0, z1] = TK.z;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 30, 40), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, y0, 0); floor.name = "floor";
    const wallMat = new THREE.ShaderMaterial({
      name: "backWall",
      uniforms: { uBase: { value: new THREE.Color(P.wall) }, uSheet: { value: new THREE.Color(P.sheet) }, uBand: { value: spec.wall.band },
        uBandY: { value: spec.wall.bandY }, uLevel: { value: spec.wall.level }, uX: { value: new THREE.Vector2(x0, x1) } },
      vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase; uniform vec3 uSheet; uniform float uBand; uniform float uBandY; uniform float uLevel; uniform vec2 uX;
        varying vec3 vW;
        void main() {
          float b = exp(-pow((vW.y - uBandY) / uBand, 2.0));
          float ends = smoothstep(uX.x - 0.5, uX.x + 3.0, vW.x) * (1.0 - smoothstep(uX.y - 3.0, uX.y + 0.5, vW.x));
          float seam = 1.0 - 0.35 * smoothstep(0.03, 0.0, abs(fract(vW.x / 3.0) - 0.5) - 0.47);
          vec3 c = uBase + uSheet * uLevel * (0.25 + 0.75 * b) * (0.3 + 0.7 * ends) * seam;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 30, y1 - y0 + 8), wallMat);
    wall.position.set((x0 + x1) / 2, (y0 + y1) / 2, z0); wall.name = "backWall";
    G.add(floor, wall);
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glass).multiplyScalar(TK.edgeLevel), blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, fog: false });
    edgeMat.name = "glassEdge";
    const e = TK.edge, bar = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMat); m.position.set(x, y, z); m.name = "glassEdge"; G.add(m); };
    for (const z of [z0, z1]) bar(x1 - x0, e, e, (x0 + x1) / 2, y0 + e, z);
    bar(x1 - x0, e, e, (x0 + x1) / 2, y1, z0);
    for (const x of [x0, x1]) for (const z of [z0, z1]) bar(e, y1 - y0, e, x, (y0 + y1) / 2, z);
    for (const x of [x0, x1]) bar(e, e, z1 - z0, x, y0 + e, 0);
    stage.scene.add(G);
    return G;
  }

  // ---------------------------------------------------------------- overlay
  /** caption() -> chip top-left (warm dot, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width), pad = 34, dot = 13;
      const pw = Math.min(W - 12, pad + dot * 2 + 22 + tw + pad), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 18); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 17); x.stroke();
      const cy = oy + ph / 2;
      // a tiny ring glyph instead of a dot
      x.strokeStyle = Q.dot; x.lineWidth = 6; x.beginPath(); x.arc(ox + pad + dot, cy, dot, 0, TAU); x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + dot * 2 + 22, cy + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { smoke, drum, tank, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    helpers: { malletAngle, skinDip }, plan: rings, motion: rings,
  };
}
