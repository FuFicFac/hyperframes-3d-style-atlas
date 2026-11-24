// styles/strange-attractor/style.js — "Strange Attractor": the Lorenz butterfly as a glossy wire sculpture in a bright
// studio. The look lives in spec.js; WHERE every path is lives in lorenz.js (THREE-free planner, integrated once at load
// and shared with SCORE). This file turns a plan into pictures:
//   - attractor(plan): two thick lacquered tubes (coral, teal), each ONE static mesh of the whole display path with a
//     per-vertex sim time; the shader shows only the last `trail` tau before now (tapered tail, pointed start) and
//     discards the future, so the tube "draws itself" with no per-frame geometry. A custom depth material applies the
//     same window to the shadow. A glowing bead rides each head. While the twins agree, both tubes lie on the coral's
//     path as a twisted two-colour strand (lorenz.strand); they open to their true paths at the fork.
//   - cloud(plan): 200 instanced glossy beads read from the cloud tables, each with a short screen-space ribbon tail
//     (one static mesh, same time-window trick).
//   - studio(): pale floor fading into the pale backdrop (fog), soft key light with shadow, procedural studio env.
//   - gauge(): small unlabelled overlay dial (exact colours) showing the gap between the two beads.
//   - caption(): bottom-centre overlay plate; labels roll like a counter wheel (old out, new in, clipped: never overprint).
// Props never animate themselves: the scene calls update(t) from renderAt.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { clamp, smoothstep } from "../../kit/time.js";
import { screenCanvas } from "../../kit/overlay.js";
import { studioEnvironment } from "../../kit/studio.js";
import * as lorenz from "./lorenz.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/** piecewise-linear lookup in [[x, y], ...] */
export function pwl(knots, x) {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1], [x1, y1] = knots[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return knots[knots.length - 1][1];
}

/** gauge reading 0..1 from the gap (Lorenz units) */
export const gaugeValue = (gap, G) => clamp(Math.pow(Math.max(0, gap) / G.max, G.power), 0, 1);

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, W = spec.world, TB = spec.tube;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  stage.scene.background = new THREE.Color(P.bg);
  const S = W.scale, LIFT = W.lift;
  /** Lorenz (x, y, z) -> world [x, y, z] */
  const toWorld = lorenz.worldMap(S, LIFT);

  // ---------------------------------------------------------------- studio
  function studio() {
    const G = new THREE.Group(); G.name = "studio";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = "floor";
    G.add(floor);
    stage.scene.fog = new THREE.Fog(P.bg, spec.backdrop.fogNear ?? 16, spec.backdrop.fogFar ?? 46);
    const env = studioEnvironment(stage, spec.studio, {});
    env.set({ level: 1 });
    stage.scene.add(G);
    if (lights.key) { lights.key.castShadow = true; }
    return { group: G, env };
  }

  // ---------------------------------------------------------------- the windowed tube material
  const WIN_VS_HEAD = /* glsl */ `
    attribute float aTau; attribute vec3 aCenter;
    uniform float uTau; uniform float uTrail; uniform float uTaper; uniform float uStart; uniform float uGrow;
    varying float vAge;`;
  const WIN_VS_BODY = /* glsl */ `
    float age = uTau - aTau;
    vAge = age;
    float sT = clamp((uTrail - age) / uTaper, 0.0, 1.0);
    float sS = clamp((aTau - uStart) / uTaper, 0.0, 1.0);
    float sc = min(sT * sT * (3.0 - 2.0 * sT), sqrt(sS)) * uGrow;
    vec3 transformed = aCenter + (vec3(position) - aCenter) * sc;`;
  /** patch a material (colour or depth) to show only the trail window; uniforms are shared objects */
  function windowed(mat, U, depth = false) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + WIN_VS_HEAD)
        .replace("#include <begin_vertex>", WIN_VS_BODY);
      sh.fragmentShader = "varying float vAge;\nuniform float uTrail;\n" + sh.fragmentShader;
      sh.fragmentShader = depth
        ? sh.fragmentShader.replace("void main() {", "void main() {\n  if (vAge < 0.0 || vAge > uTrail) discard;")
        : sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  if (vAge < 0.0 || vAge > uTrail) discard;");
    };
    mat.customProgramCacheKey = () => (depth ? "sa-window-depth" : "sa-window");
    return mat;
  }

  /** tubeGeometry(centres (Lorenz, Float64Array 3n), taus, from, to, radius, radial) — swept tube with aTau/aCenter */
  function tubeGeometry(D, tau, j0, j1, r, R) {
    const n = j1 - j0;
    const pos = new Float32Array(n * R * 3), nor = new Float32Array(n * R * 3), cen = new Float32Array(n * R * 3), at = new Float32Array(n * R);
    const C = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
      const w = toWorld(D[3 * (j0 + i)], D[3 * (j0 + i) + 1], D[3 * (j0 + i) + 2]);
      C[3 * i] = w[0]; C[3 * i + 1] = w[1]; C[3 * i + 2] = w[2];
    }
    let nx = 0, ny = 1, nz = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = C[3 * b] - C[3 * a], ty = C[3 * b + 1] - C[3 * a + 1], tz = C[3 * b + 2] - C[3 * a + 2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      if (i === 0 && Math.abs(ty) > 0.9) { nx = 1; ny = 0; nz = 0; }
      const dp = nx * tx + ny * ty + nz * tz;
      nx -= dp * tx; ny -= dp * ty; nz -= dp * tz;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      for (let k = 0; k < R; k++) {
        const ang = (k / R) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const ox = c * nx + s * bx, oy = c * ny + s * by, oz = c * nz + s * bz;
        const v = i * R + k;
        pos[3 * v] = C[3 * i] + r * ox; pos[3 * v + 1] = C[3 * i + 1] + r * oy; pos[3 * v + 2] = C[3 * i + 2] + r * oz;
        nor[3 * v] = ox; nor[3 * v + 1] = oy; nor[3 * v + 2] = oz;
        cen[3 * v] = C[3 * i]; cen[3 * v + 1] = C[3 * i + 1]; cen[3 * v + 2] = C[3 * i + 2];
        at[v] = tau[j0 + i];
      }
    }
    const idx = new Uint32Array((n - 1) * R * 6);
    let q = 0;
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < R; k++) {
      const a = i * R + k, b = i * R + ((k + 1) % R), c = a + R, d = b + R;
      idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; // outward-facing
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("aCenter", new THREE.BufferAttribute(cen, 3));
    g.setAttribute("aTau", new THREE.BufferAttribute(at, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  // ---------------------------------------------------------------- the two tubes + beads
  /**
   * attractor(plan) -> { group, strand, update(t) -> { a, b } (world head positions) }
   */
  function attractor(plan, o = {}) {
    const G = new THREE.Group(); G.name = "attractor";
    const st = lorenz.strand(plan, { every: TB.every, rOff: (TB.strandOffset * TB.radius) / S, twist: TB.twist, w0: TB.open[0], w1: TB.open[1], ramp: TB.ramp });
    const mk = (name, D, j0, j1, start, mat) => {
      const U = { uTau: { value: 0 }, uTrail: { value: 3 }, uTaper: { value: TB.taper }, uStart: { value: start }, uGrow: { value: 1 } };
      const geo = tubeGeometry(D, st.tau, j0, j1, TB.radius, TB.radial);
      const m = windowed(mat.clone(), U);
      m.name = name;
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.customDepthMaterial = windowed(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), U, true);
      G.add(mesh);
      return { mesh, U };
    };
    const tauB = st.tau.subarray(st.j0);
    const coral = mk("tubeCoral", st.A, 0, st.n, 0, materials.coral);
    // the twin's display samples are indexed from 0 in st.B; build with an offset tau table
    const tealGeo = (() => {
      const D = st.B, n = st.n - st.j0;
      return { D, n };
    })();
    const U2 = { uTau: { value: 0 }, uTrail: { value: 3 }, uTaper: { value: TB.taper }, uStart: { value: plan.tauTw }, uGrow: { value: 1 } };
    const tGeo = tubeGeometry(tealGeo.D, tauB, 0, tealGeo.n, TB.radius, TB.radial);
    const tMat = windowed(materials.teal.clone(), U2); tMat.name = "tubeTeal";
    const tMesh = new THREE.Mesh(tGeo, tMat);
    tMesh.name = "tubeTeal"; tMesh.castShadow = true; tMesh.frustumCulled = false;
    tMesh.customDepthMaterial = windowed(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), U2, true);
    G.add(tMesh);
    const teal = { mesh: tMesh, U: U2 };

    const B = spec.bead;
    const beadGeo = new THREE.SphereGeometry(B.radius, 40, 24);
    const beadA = new THREE.Mesh(beadGeo, materials.beadCoral); beadA.name = "beadCoral"; beadA.castShadow = true;
    const beadB = new THREE.Mesh(beadGeo, materials.beadTeal); beadB.name = "beadTeal"; beadB.castShadow = true;
    G.add(beadA, beadB);
    stage.scene.add(G);

    // display head = the display centreline interpolated at tau(t)
    const headOf = (D, tauArr, n, tq) => {
      const t0 = tauArr[0], dt = tauArr[1] - tauArr[0];
      const f = clamp((tq - t0) / dt, 0, n - 1);
      const i = Math.min(n - 2, Math.floor(f)), u = f - i;
      return toWorld(D[3 * i] + (D[3 * i + 3] - D[3 * i]) * u, D[3 * i + 1] + (D[3 * i + 4] - D[3 * i + 1]) * u, D[3 * i + 2] + (D[3 * i + 5] - D[3 * i + 2]) * u);
    };
    const trailOf = (t) => pwl(TB.trail, t);
    return {
      group: G, strand: st, coral, teal, beadA, beadB, toWorld, headOf,
      head(t) {
        const tq = plan.T.tau(t);
        return { a: headOf(st.A, st.tau, st.n, tq), b: t >= plan.twinAt ? headOf(st.B, tauB, st.n - st.j0, tq) : null };
      },
      update(t) {
        const tq = plan.T.tau(t), trail = trailOf(t);
        for (const k of [coral, teal]) { k.U.uTau.value = tq; k.U.uTrail.value = trail; }
        const a = headOf(st.A, st.tau, st.n, tq);
        beadA.position.set(a[0], a[1], a[2]);
        const grow = smoothstep(0, 0.25, t);
        beadA.scale.setScalar(Math.max(0.001, grow));
        const on = t >= plan.twinAt;
        teal.mesh.visible = on;
        beadB.visible = on;
        if (on) {
          const b = headOf(st.B, tauB, st.n - st.j0, tq);
          beadB.position.set(b[0], b[1], b[2]);
          // the twin bead swells out of the coral one
          beadB.scale.setScalar(Math.max(0.001, smoothstep(plan.twinAt, plan.twinAt + 0.35, t)));
        }
        return { a, b: on ? [beadB.position.x, beadB.position.y, beadB.position.z] : null };
      },
    };
  }

  // ---------------------------------------------------------------- the cloud
  function cloud(plan, o = {}) {
    const CL = spec.cloud, C = plan.cloud, N = C.count;
    const G = new THREE.Group(); G.name = "cloud";
    const geo = new THREE.SphereGeometry(CL.bead, 20, 12);
    const mat = materials.cloud.clone(); mat.name = "cloudBeads";
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.name = "cloudBeads"; mesh.castShadow = true; mesh.frustumCulled = false;
    const cols = CL.colors.map((c) => new THREE.Color(c));
    const colOf = (i) => {
      const u = (i / N) * (cols.length - 1), k = Math.min(cols.length - 2, Math.floor(u));
      return cols[k].clone().lerp(cols[k + 1], u - k);
    };
    for (let i = 0; i < N; i++) mesh.setColorAt(i, colOf(i));
    mesh.instanceColor.needsUpdate = true;
    G.add(mesh);

    // ribbon tails: one static mesh, every bead's whole path; the shader shows the last `tail` tau
    const every = 3, nS = Math.floor((C.n) / every);
    const verts = N * nS * 2;
    const aP = new Float32Array(verts * 3), aQ = new Float32Array(verts * 3), aS = new Float32Array(verts), aT = new Float32Array(verts), aC = new Float32Array(verts * 3);
    const idx = new Uint32Array(N * (nS - 1) * 6);
    let v = 0, q = 0;
    for (let i = 0; i < N; i++) {
      const Pp = C.P[i], c = colOf(i), base = v;
      for (let s = 0; s < nS; s++) {
        const k = s * every, k2 = Math.min(C.n, k + every);
        const p = toWorld(Pp[3 * k], Pp[3 * k + 1], Pp[3 * k + 2]), p2 = toWorld(Pp[3 * k2], Pp[3 * k2 + 1], Pp[3 * k2 + 2]);
        for (const side of [-1, 1]) {
          aP.set(p, 3 * v); aQ.set(p2, 3 * v); aS[v] = side; aT[v] = C.tau0 + k * C.h; aC.set([c.r, c.g, c.b], 3 * v);
          v++;
        }
        if (s < nS - 1) {
          const a = base + 2 * s, b = a + 1, cc = a + 2, d = a + 3;
          idx[q++] = a; idx[q++] = b; idx[q++] = cc; idx[q++] = b; idx[q++] = d; idx[q++] = cc;
        }
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(aP, 3));
    tg.setAttribute("aQ", new THREE.BufferAttribute(aQ, 3));
    tg.setAttribute("aSide", new THREE.BufferAttribute(aS, 1));
    tg.setAttribute("aTau", new THREE.BufferAttribute(aT, 1));
    tg.setAttribute("aCol", new THREE.BufferAttribute(aC, 3));
    tg.setIndex(new THREE.BufferAttribute(idx, 1));
    const TU = {
      uTau: { value: 0 }, uTail: { value: CL.tail }, uWidth: { value: CL.tailWidth }, uRes: { value: new THREE.Vector2(stage.width, stage.height) },
      uLevel: { value: 1 }, uStart: { value: C.tau0 },
    };
    const tmat = new THREE.ShaderMaterial({
      name: "cloudTails", uniforms: TU, transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aQ; attribute float aSide; attribute float aTau; attribute vec3 aCol;
        uniform float uTau; uniform float uTail; uniform float uWidth; uniform vec2 uRes; uniform float uStart;
        varying float vAge; varying vec3 vCol; varying float vK;
        void main() {
          float age = uTau - aTau;
          vAge = age; vCol = aCol;
          vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 b = projectionMatrix * modelViewMatrix * vec4(aQ, 1.0);
          vec2 d = (b.xy / b.w - a.xy / a.w) * uRes;
          float L = length(d);
          vec2 nrm = L > 1e-4 ? vec2(-d.y, d.x) / L : vec2(0.0, 1.0);
          float k = clamp(1.0 - age / uTail, 0.0, 1.0);
          float born = clamp((aTau - uStart) / (0.4 * uTail), 0.0, 1.0);
          vK = k;
          a.xy += nrm * aSide * (uWidth * k * born / uRes) * a.w;
          gl_Position = a;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTail; uniform float uLevel;
        varying float vAge; varying vec3 vCol; varying float vK;
        void main() {
          float a = smoothstep(0.0, 0.35, vK) * uLevel * 0.85;
          vec4 c = vec4(vCol, a);
          if (vAge < 0.0 || vAge > uTail) discard;
          gl_FragColor = c;
          #include <colorspace_fragment>
        }`,
    });
    const tails = new THREE.Mesh(tg, tmat);
    tails.name = "cloudTails"; tails.frustumCulled = false; tails.renderOrder = 3;
    G.add(tails);
    stage.scene.add(G);
    const m4 = new THREE.Matrix4(), pq = [0, 0, 0];
    return {
      group: G, mesh, tails,
      update(t) {
        const on = t >= C.at;
        G.visible = on;
        if (!on) return;
        const pop = smoothstep(C.at, C.at + CL.pop, t);
        const sc = Math.max(0.001, pop);
        for (let i = 0; i < N; i++) {
          plan.cloudAt(i, t, pq);
          const w = toWorld(pq[0], pq[1], pq[2]);
          m4.makeScale(sc, sc, sc).setPosition(w[0], w[1], w[2]);
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
        TU.uTau.value = plan.T.tau(t);
      },
    };
  }

  // ---------------------------------------------------------------- gauge (overlay)
  function gauge(o = {}) {
    const Q = { ...spec.gauge, ...o };
    const m = 12, Wc = Q.w + 2 * m, Hc = Q.h + 2 * m;
    const cx = m + Q.w / 2, cy = m + Q.h - 22, R = Q.h * 0.56;
    const a0 = Math.PI, a1 = 2 * Math.PI;
    const c = screenCanvas(stage, Wc, Hc, (x, Wd, Hd, st) => {
      x.save();
      x.shadowColor = "rgba(40, 32, 20, 0.22)"; x.shadowBlur = 12; x.shadowOffsetY = 3;
      x.fillStyle = P.dial; x.beginPath(); x.roundRect(m, m, Q.w, Q.h, 20); x.fill();
      x.restore();
      x.strokeStyle = P.dialEdge; x.lineWidth = 3; x.beginPath(); x.roundRect(m + 1.5, m + 1.5, Q.w - 3, Q.h - 3, 19); x.stroke();
      // track
      x.lineCap = "round";
      x.strokeStyle = P.dialTrack; x.lineWidth = 14; x.beginPath(); x.arc(cx, cy, R, a0, a1); x.stroke();
      // fill: teal (together) to coral (apart)
      const v = st.v ?? 0, av = a0 + (a1 - a0) * v;
      if (v > 0.004) {
        const gr = x.createLinearGradient(cx - R, cy, cx + R, cy);
        gr.addColorStop(0, P.teal); gr.addColorStop(0.5, P.gold); gr.addColorStop(1, P.coral);
        x.strokeStyle = gr; x.lineWidth = 14; x.beginPath(); x.arc(cx, cy, R, a0, av); x.stroke();
      }
      // ticks
      x.strokeStyle = P.dialEdge; x.lineCap = "butt";
      for (let k = 0; k <= 10; k++) {
        const a = a0 + (a1 - a0) * (k / 10), r0 = R + 12, r1 = R + (k % 5 === 0 ? 24 : 19);
        x.lineWidth = k % 5 === 0 ? 4 : 2.5;
        x.beginPath(); x.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); x.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); x.stroke();
      }
      // needle
      x.strokeStyle = P.dialEdge; x.lineWidth = 5; x.lineCap = "round";
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + (R - 4) * Math.cos(av), cy + (R - 4) * Math.sin(av)); x.stroke();
      // hub: half coral, half teal
      x.fillStyle = P.teal; x.beginPath(); x.arc(cx, cy, 11, Math.PI / 2, Math.PI * 1.5); x.fill();
      x.fillStyle = P.coral; x.beginPath(); x.arc(cx, cy, 11, -Math.PI / 2, Math.PI / 2); x.fill();
      x.strokeStyle = P.dialEdge; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 11, 0, Math.PI * 2); x.stroke();
    }, { upload: true, willReadFrequently: true });
    c.renderOrder = 12;
    c.userData.place(Q.x - m, Q.y - m);
    return {
      mesh: c,
      update(t, plan) {
        const a = smoothstep(plan.twinAt - 0.1, plan.twinAt + 0.35, t);
        const v = Math.round(gaugeValue(plan.sep(t), Q) * 720) / 720;
        c.userData.set({ v });
        c.userData.opacity(a);
        return v;
      },
    };
  }

  // ---------------------------------------------------------------- caption plate (overlay, bottom centre)
  /** caption() -> { plate, texts, show(labels, t, { roll, lead }) } — labels: [{ text, on }] in order */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const m = 14, Wc = Q.w + 2 * m, Hc = Q.h + 2 * m;
    const iconX = m + 70;
    const plate = screenCanvas(stage, Wc, Hc, (x) => {
      x.save();
      x.shadowColor = "rgba(30, 24, 16, 0.3)"; x.shadowBlur = 14; x.shadowOffsetY = 4;
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(m, m, Q.w, Q.h, Q.radius); x.fill();
      x.restore();
      x.strokeStyle = Q.edge; x.lineWidth = 2.5; x.beginPath(); x.roundRect(m + 6, m + 6, Q.w - 12, Q.h - 12, Q.radius - 6); x.stroke();
      // the icon: two loops of a figure eight, coral and teal
      const cy = m + Q.h / 2;
      x.lineWidth = 5; x.lineCap = "round";
      x.strokeStyle = P.coral; x.beginPath(); x.ellipse(iconX - 17, cy, 17, 12, -0.35, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = P.teal; x.beginPath(); x.ellipse(iconX + 17, cy, 17, 12, 0.35, 0, Math.PI * 2); x.stroke();
    }, { upload: true, willReadFrequently: true });
    plate.userData.place(Q.x - m, Q.y - m);
    plate.userData.set({ v: 1 });
    plate.userData.opacity(1);
    plate.renderOrder = 10;
    const textX = (iconX + 46 + Wc - m - 30) / 2;
    const rollH = Math.round(Q.h * 0.72);
    const texts = [0, 1].map(() => {
      const c = screenCanvas(stage, Wc, Hc, (x, Wd, Hd, st) => {
        if (!st.text) return;
        x.save();
        x.beginPath(); x.roundRect(m + 8, m + 8, Q.w - 16, Q.h - 16, Q.radius - 8); x.clip();
        x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
        x.fillStyle = Q.text; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(st.text, textX, m + Q.h / 2 + 2 + (st.dy ?? 0));
        x.restore();
      }, { upload: true, willReadFrequently: true });
      c.renderOrder = 11;
      c.userData.place(Q.x - m, Q.y - m);
      return c;
    });
    /**
     * show(labels, t, { roll = .26, lead = .04 }): label i holds until the roll to label i+1, which runs over
     * [on - lead - roll, on - lead]: the old line rolls up out of the plate's window while the new one rolls up into it
     * (clipped, so the two never overprint). Always exactly one label; returns the index of the arriving/shown label.
     */
    function show(labels, t, o2 = {}) {
      const roll = o2.roll ?? 0.26, lead = o2.lead ?? 0.04;
      let i = 0;
      for (let k = 1; k < labels.length; k++) if (t >= labels[k].on - lead - roll) i = k;
      const u = i === 0 ? 1 : smoothstep(labels[i].on - lead - roll, labels[i].on - lead, t);
      const cur = texts[i % 2], prev = texts[(i + 1) % 2];
      if (u >= 1) {
        cur.userData.set({ text: labels[i].text, dy: 0 }); cur.userData.opacity(1);
        prev.userData.set({ text: "" }); prev.userData.opacity(0);
      } else {
        const qz = (v) => Math.round(v * 2) / 2;
        prev.userData.set({ text: labels[i - 1].text, dy: qz(-u * rollH) }); prev.userData.opacity(1);
        cur.userData.set({ text: labels[i].text, dy: qz((1 - u) * rollH) }); cur.userData.opacity(1);
      }
      return i;
    }
    return { plate, texts, show };
  }

  const props = { studio, attractor, cloud, gauge, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    helpers: { toWorld, pwl, gaugeValue }, plan: lorenz, motion: lorenz,
  };
}
