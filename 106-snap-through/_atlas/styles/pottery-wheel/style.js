// styles/pottery-wheel/style.js — "Pottery Wheel": wet clay thrown on a wheel in a sunlit plaster studio.
// The look lives in spec.js; WHAT shape the clay has, how fast it spins, where the rib presses and how far the glaze has
// climbed lives in throw.js (THREE-free planner shared with SCORE). This file turns the plan into pictures:
//   - the clay: ONE grid mesh (profile points x angle) whose positions, normals, colours and gloss are rewritten from
//     plan.profileAt(t) every frame (pure function of t): slip streaks + centring wobble are fixed to the clay and turn
//     with the closed-form spin angle; the glaze front is a helix (brushed on while it spins) with ridges breaking warm;
//   - a steel wheel head with turned rings and marks (turns with the same angle), a wet slurry ring, a pale splash pan,
//     the wheel body, wood floor, a plaster wall with the window's sun patch, and a shelf of finished pots (soft in DoF);
//   - a wooden rib on a handle at plan.toolAt(t) and a glaze brush at plan.brushAt(t);
//   - an overlay caption chip (exact colours).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { paintPixels, canvasTexture, woodTexture } from "../../kit/textures.js";
import { depthOfField } from "../../kit/studio.js";
import { fbm2 } from "../../kit/noise.js";
import { clamp, smoothstep, rng, TAU } from "../../kit/time.js";
import * as throwPlan from "./throw.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const C = (h) => new THREE.Color(h);
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }; // linear rgb (vertex colours are linear)

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const dof = opts.post === false ? { setFocus() {} } : depthOfField(stage, { relativeAperture: spec.dof.relativeAperture, maxblur: spec.dof.maxblur }); // scene calls dof.setFocus(d) EVERY frame

  // ---------------------------------------------------------------- the room
  function room() {
    const g = new THREE.Group();
    const R = spec.room, Wh = spec.wheel, SP = spec.sunPatch;
    const wallH = R.wallH, wallW = R.wallW, y0 = Wh.floorY;
    // plaster wall with the window's light patch (painted once): sheared 2x2 panes, soft edges, thin mullion shadows
    const pl = lin(P.plaster), sh = lin(P.plasterShade), sun = lin(P.sun);
    const toS = (c) => c.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    const wallCan = paintPixels([1024, 512], (u, v) => {
      const X = (u - 0.5) * wallW, Y = y0 + (1 - v) * wallH;
      const n = fbm2(u * 22, v * 11, { seed: 31, octaves: 4, period: 22 }) - 0.5;
      const big = fbm2(u * 4, v * 2, { seed: 9, octaves: 2, period: 4 }) - 0.5;
      let m = clamp(0.62 + n * 0.5 + big * 0.5);
      // patch coordinates (sheared parallelogram)
      const px = (X - SP.cx - (Y - SP.cy) * SP.skew) / SP.w + 0.5, py = (Y - SP.cy) / SP.h + 0.5;
      const edge = (a) => smoothstep(0, SP.soft, a) * smoothstep(0, SP.soft, 1 - a);
      let s = edge(px) * edge(py);
      const mull = Math.min(Math.abs(px - 0.5), Math.abs(py - 0.5));
      s *= smoothstep(SP.mullion * 0.5, SP.mullion * 1.6, mull);
      const base = [0, 1, 2].map((k) => sh[k] + (pl[k] - sh[k]) * m);
      const c = [0, 1, 2].map((k) => base[k] + (sun[k] - base[k]) * s * 0.9);
      return toS(c);
    });
    const wallMat = materials.plaster.clone();
    wallMat.map = canvasTexture(wallCan, { repeat: [1, 1] });
    wallMat.map.wrapS = wallMat.map.wrapT = THREE.ClampToEdgeWrapping;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), wallMat);
    wall.position.set(0, y0 + wallH / 2, R.wallZ);
    wall.receiveShadow = true;
    g.add(wall);
    // wood floor
    const floorMat = materials.floor.clone();
    floorMat.map = woodTexture({ size: 1024, boards: 6, seed: 41, light: "#d9c7ae", mid: "#cbb698", dark: "#b49d80", seam: "#9a8468", contrast: 0.2, repeat: [2, 2] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wallW, 8), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, y0, R.wallZ + 4);
    floor.receiveShadow = true;
    g.add(floor);
    // shelves of finished pots against the wall (soft in the depth of field)
    const shelfMat = materials.wood;
    const pots = [
      { x: -3.3, h: 0.42, w: 0.17, kind: "vase", c: "#3f7f74" }, { x: -2.85, h: 0.26, w: 0.24, kind: "bowl", c: "#e8dcc4" },
      { x: -2.4, h: 0.5, w: 0.19, kind: "bottle", c: "#9c4f2e" }, { x: -1.95, h: 0.3, w: 0.2, kind: "jar", c: "#c99a3c" },
      { x: -1.5, h: 0.38, w: 0.16, kind: "vase", c: "#2f5f86" }, { x: -1.05, h: 0.22, w: 0.25, kind: "bowl", c: "#6f8f5c" },
      { x: 1.2, h: 0.36, w: 0.18, kind: "jar", c: "#e9e1cf" }, { x: 1.65, h: 0.48, w: 0.17, kind: "bottle", c: "#3f7f74" },
      { x: 2.1, h: 0.24, w: 0.26, kind: "bowl", c: "#b5553a" }, { x: 2.55, h: 0.4, w: 0.18, kind: "vase", c: "#c99a3c" },
      { x: 3.0, h: 0.3, w: 0.2, kind: "jar", c: "#2f5f86" },
    ];
    const shelfY = R.shelfY;
    for (const side of [-1, 1]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 0.34), shelfMat);
      plank.position.set(side * 2.25, shelfY - 0.03, R.wallZ + 0.17);
      plank.castShadow = plank.receiveShadow = true;
      g.add(plank);
    }
    const profileOf = (kind, w, h) => {
      const K = {
        vase: [[0, 0], [w * 0.55, 0], [w * 0.9, h * 0.25], [w, h * 0.45], [w * 0.55, h * 0.78], [w * 0.38, h * 0.9], [w * 0.5, h]],
        bowl: [[0, 0], [w * 0.45, 0], [w * 0.8, h * 0.45], [w, h]],
        bottle: [[0, 0], [w * 0.7, 0], [w * 0.95, h * 0.2], [w, h * 0.45], [w * 0.4, h * 0.68], [w * 0.22, h * 0.8], [w * 0.24, h]],
        jar: [[0, 0], [w * 0.7, 0], [w, h * 0.35], [w * 0.95, h * 0.75], [w * 0.7, h * 0.92], [w * 0.72, h]],
      }[kind];
      return K.map(([r, y]) => new THREE.Vector2(r, y));
    };
    pots.forEach((p, k) => {
      const geo = new THREE.LatheGeometry(new THREE.SplineCurve(profileOf(p.kind, p.w, p.h)).getPoints(24), 40);
      const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: p.c, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide }));
      m.position.set(p.x, shelfY, R.wallZ + 0.17 + (k % 2 ? 0.04 : -0.03));
      m.castShadow = true;
      g.add(m);
    });
    return g;
  }

  // ---------------------------------------------------------------- the wheel (head + slurry + pan + body)
  function wheel(plan) {
    const g = new THREE.Group();
    const Wh = spec.wheel;
    // wheel head top: brushed steel with turned rings, a couple of pencil marks and dried clay smears (turns with the clay)
    const steel = lin(P.steel);
    const toS = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    const headCan = paintPixels(512, (u, v) => {
      const x = u * 2 - 1, y = v * 2 - 1, rr = Math.hypot(x, y), a = Math.atan2(y, x);
      let l = 1 + 0.06 * Math.sin(rr * 260) * Math.sin(rr * 37) + 0.05 * (fbm2(u * 40, v * 40, { seed: 5, octaves: 2, period: 40 }) - 0.5);
      // radial marks (centring guides) and two clay smears
      for (let k = 0; k < Wh.marks; k++) {
        const ak = (k / Wh.marks) * TAU, da = Math.abs(((a - ak + 3 * Math.PI) % TAU) - Math.PI);
        if (rr > 0.55 && rr < 0.93 && da * rr < 0.012) l *= 0.45;
      }
      for (const ring of [0.62, 0.86]) if (Math.abs(rr - ring) < 0.006) l *= 0.6;
      const smear = smoothstep(0.35, 0.0, Math.abs(((a - 0.8 + 3 * Math.PI) % TAU) - Math.PI)) * smoothstep(0.03, 0, Math.abs(rr - 0.74));
      const smear2 = smoothstep(0.5, 0.0, Math.abs(((a + 2.2 + 3 * Math.PI) % TAU) - Math.PI)) * smoothstep(0.04, 0, Math.abs(rr - 0.9));
      const clay = lin(P.clayLight);
      const s = Math.max(smear, smear2) * 0.85;
      return [0, 1, 2].map((k) => toS(steel[k] * l * (1 - s) + clay[k] * s));
    });
    const headTop = materials.steel.clone();
    headTop.map = canvasTexture(headCan, { repeat: [1, 1] });
    const headSide = materials.steel.clone();
    headSide.color = C(P.steel);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(Wh.headR, Wh.headR * 0.985, Wh.headT, 128, 1), [headSide, headTop, headSide]);
    head.position.y = -Wh.headT / 2;
    head.castShadow = false; head.receiveShadow = true;
    g.add(head);
    // wet slurry ring around the foot (radial alpha), resized with the foot each frame
    const slurryMat = materials.slurry.clone();
    slurryMat.alphaMap = canvasTexture(paintPixels(256, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; return 1 - smoothstep(0.6, 0.98, r) * (0.55 + 0.45 * smoothstep(0.8, 0.98, r)); }), { srgb: false });
    slurryMat.alphaMap.wrapS = slurryMat.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
    slurryMat.transparent = true; slurryMat.depthWrite = false;
    slurryMat.polygonOffset = true; slurryMat.polygonOffsetFactor = -2; slurryMat.polygonOffsetUnits = -2;
    const slurry = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), slurryMat);
    slurry.rotation.x = -Math.PI / 2; slurry.position.y = 0.004; slurry.renderOrder = 1; slurry.receiveShadow = false;
    g.add(slurry);
    // splash pan (lathe, double-sided) with a little slurry pooled in it
    const pr = Wh.panR, pts = [[0.2, -0.13], [pr - 0.06, -0.13], [pr - 0.02, -0.11], [pr, 0.02], [pr + 0.02, 0.07], [pr + 0.05, 0.075], [pr + 0.06, 0.06], [pr + 0.04, -0.2]];
    const pan = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 128), materials.pan.clone());
    pan.material.side = THREE.DoubleSide;
    pan.receiveShadow = true; pan.castShadow = false;
    g.add(pan);
    const pool = new THREE.Mesh(new THREE.RingGeometry(Wh.headR + 0.02, pr - 0.05, 96), materials.slurry);
    pool.rotation.x = -Math.PI / 2; pool.position.y = -0.125; pool.receiveShadow = true;
    g.add(pool);
    // body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(pr + 0.02, Wh.bodyR, -0.2 - Wh.floorY, 96), materials.body);
    body.position.y = (Wh.floorY - 0.2) / 2;
    body.receiveShadow = true;
    g.add(body);
    g.userData.update = (t) => {
      head.rotation.y = -plan.spinAngle(t);
      const p = plan.profileAt(t);
      const foot = p.r[plan.nb] * (1 + spec.wobble.amp * plan.wobbleAt(t).A);
      const d = (foot + 0.13) * 2;
      slurry.scale.set(d, d, 1);
      const wb = plan.wobbleAt(t);
      slurry.position.x = wb.ex; slurry.position.z = wb.ez;
    };
    return g;
  }

  // ---------------------------------------------------------------- the clay
  function clay(plan) {
    const N = plan.N, SEG = spec.profile.segments, J = SEG + 1, NV = N * J;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), col = new Float32Array(NV * 3), gl = new Float32Array(NV);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aGloss", new THREE.BufferAttribute(gl, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < SEG; j++) {
      const a = i * J + j, b = (i + 1) * J + j, c = i * J + j + 1, d = (i + 1) * J + j + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 2.2);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.14 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGloss;\nvarying float vGloss;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGloss = aGloss;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGloss;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * vGloss, 0.04, 1.0);")
        .replace("#include <clearcoat_normal_fragment_begin>", "#include <clearcoat_normal_fragment_begin>");
    };
    mat.customProgramCacheKey = () => "pottery-clay-v1";
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const cosT = new Float64Array(J), sinT = new Float64Array(J);
    for (let j = 0; j < J; j++) { const a = (j / SEG) * TAU; cosT[j] = Math.cos(a); sinT[j] = Math.sin(a); }
    const lam = plan.lam, part = plan.part;
    const cClay = lin(P.clay), cDark = lin(P.clayDark), cSlip = lin(P.slip), cG = lin(P.glaze), cGD = lin(P.glazeDeep), cGB = lin(P.glazeBreak);
    const WB = spec.wobble, ST = spec.streaks, GZ = spec.glaze, rings = spec.profile.rings;
    const rr = new Float64Array(NV);

    mesh.userData.update = (t) => {
      const pr = plan.profileAt(t), wb = plan.wobbleAt(t), gf = plan.glazeAt(t);
      const A = wb.A * WB.amp, phi = wb.phi;
      // positions
      for (let j = 0; j < J; j++) {
        const th = (j / SEG) * TAU, tc = th + phi; // clay-fixed angle
        for (let i = 0; i < N; i++) {
          let r = pr.r[i];
          if (A > 1e-5 && r > 0) {
            let L = 0;
            for (const [m, p, q, a] of WB.terms) L += a * Math.sin(m * tc + p + q * lam[i]);
            r *= 1 + A * L * smoothstep(0, 0.05, pr.y[i] + 0.02);
          }
          const v = i * J + j;
          rr[v] = r;
          pos[v * 3] = r * cosT[j] + wb.ex;
          pos[v * 3 + 1] = pr.y[i];
          pos[v * 3 + 2] = r * sinT[j] + wb.ez;
        }
      }
      // normals: finite differences on the grid (wraps around), axis points fall back to the profile normal
      for (let i = 0; i < N; i++) {
        const ia = Math.max(0, i - 1), ib = Math.min(N - 1, i + 1);
        for (let j = 0; j < J; j++) {
          const ja = j === 0 ? SEG - 1 : j - 1, jb = j === SEG ? 1 : j + 1;
          const a = ia * J + j, b = ib * J + j, c = i * J + ja, d = i * J + jb;
          const sx = pos[b * 3] - pos[a * 3], sy = pos[b * 3 + 1] - pos[a * 3 + 1], sz = pos[b * 3 + 2] - pos[a * 3 + 2];
          const tx = pos[d * 3] - pos[c * 3], ty = pos[d * 3 + 1] - pos[c * 3 + 1], tz = pos[d * 3 + 2] - pos[c * 3 + 2];
          let nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
          const fx = pr.nr[i] * cosT[j], fy = pr.ny[i], fz = pr.nr[i] * sinT[j];
          let L = Math.hypot(nx, ny, nz);
          const tl = Math.hypot(tx, ty, tz), sl = Math.hypot(sx, sy, sz);
          if (L < 1e-9 || tl < 1e-6 || sl < 1e-6) { nx = fx; ny = fy; nz = fz; L = Math.hypot(nx, ny, nz) || 1; }
          else {
            if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; }
            const k = smoothstep(0.01, 0.05, pr.r[i]); // near the axis the grid differences are tiny: lean on the profile normal
            nx = (nx / L) * k + fx * (1 - k); ny = (ny / L) * k + fy * (1 - k); nz = (nz / L) * k + fz * (1 - k);
            L = Math.hypot(nx, ny, nz) || 1;
          }
          const v = i * J + j;
          nor[v * 3] = nx / L; nor[v * 3 + 1] = ny / L; nor[v * 3 + 2] = nz / L;
        }
      }
      // colours + gloss: slip streaks (clay-fixed), helix glaze front with ridges breaking warm
      for (let j = 0; j < J; j++) {
        const th = (j / SEG) * TAU, tc = th + phi;
        const saw = ((((tc / TAU) % 1) + 1) % 1) - 0.5; // helix: front height steps once per turn
        for (let i = 0; i < N; i++) {
          const v = i * J + j, L = lam[i];
          let s = 0;
          for (let k = 0; k < ST.freq.length; k++) s += Math.sin(ST.freq[k] * tc + 2.3 * k + (3 + k) * L * 2.1) / (k + 1.4);
          const wet = s * ST.amp;
          let cr = cClay[0] * (1 + wet), cg = cClay[1] * (1 + wet), cb = cClay[2] * (1 + wet);
          // a creamy slip film on the upper wall once thrown, darker wet clay low down
          const slipK = 0.18 * smoothstep(0.4, 1, L) * (part[i] === 1 ? 1 : 0.5);
          cr += (cSlip[0] - cr) * slipK; cg += (cSlip[1] - cg) * slipK; cb += (cSlip[2] - cb) * slipK;
          const low = part[i] === 0 ? 1 : 0.4 * (1 - smoothstep(0, 0.12, L));
          cr += (cDark[0] - cr) * low; cg += (cDark[1] - cg) * low; cb += (cDark[2] - cb) * low;
          let gloss = 1 - 0.35 * clamp(s * 0.5 + 0.5);
          if (gf > -0.05 && part[i] !== 0 && L > GZ.footBare) {
            const front = gf + GZ.spiral * saw;
            const gA = 1 - smoothstep(front - GZ.soft, front + GZ.soft, L);
            if (gA > 0) {
              const ridge = Math.max(0, Math.sin(L * rings * TAU + (part[i] === 2 ? 1.1 : 0)));
              const brk = clamp(0.05 * ridge * ridge + smoothstep(0.95, 1, L) * 0.45);
              const deep = 0.18 * (1 - ridge) + (part[i] === 2 ? 0.3 : 0);
              let gr = cG[0] + (cGD[0] - cG[0]) * deep, gg = cG[1] + (cGD[1] - cG[1]) * deep, gb = cG[2] + (cGD[2] - cG[2]) * deep;
              gr += (cGB[0] - gr) * brk; gg += (cGB[1] - gg) * brk; gb += (cGB[2] - gb) * brk;
              // fresh wet edge: a little brighter right at the front
              const edge = smoothstep(GZ.soft * 3, 0, Math.abs(L - front)) * 0.25;
              gr *= 1 + edge; gg *= 1 + edge; gb *= 1 + edge;
              cr += (gr - cr) * gA; cg += (gg - cg) * gA; cb += (gb - cb) * gA;
              gloss += (0.42 - gloss) * gA;
            }
          }
          col[v * 3] = cr; col[v * 3 + 1] = cg; col[v * 3 + 2] = cb;
          gl[v] = gloss;
        }
      }
      for (const k of ["position", "normal", "color", "aGloss"]) geo.attributes[k].needsUpdate = true;
    };
    return mesh;
  }

  // ---------------------------------------------------------------- tools
  const basis = new THREE.Matrix4(), vX = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3();
  // place a group so local +X = outward surface normal, +Y = profile tangent (up the wall), at world point p
  function orient(g, az, nr, ny, tr, ty, p) {
    const er = [Math.cos(az), 0, Math.sin(az)];
    vX.set(nr * er[0], ny, nr * er[2]).normalize();
    vY.set(tr * er[0], ty, tr * er[2]).normalize();
    vZ.crossVectors(vX, vY).normalize();
    basis.makeBasis(vX, vY, vZ);
    g.quaternion.setFromRotationMatrix(basis);
    g.position.copy(p);
  }

  // a handle in WORLD space: from an anchor, outward (radial at azimuth az, turned by yaw toward the camera side) and up
  const up = new THREE.Vector3(0, 1, 0), hDir = new THREE.Vector3();
  function placeHandle(m, anchor, az, tilt, yaw, len) {
    const a = az + yaw;
    hDir.set(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)).normalize();
    m.quaternion.setFromUnitVectors(up, hDir);
    m.position.copy(anchor).addScaledVector(hDir, len / 2);
  }

  function rib(plan) {
    const T = spec.tool, g = new THREE.Group();
    // kidney-shaped wooden rib: convex working edge at local x = 0 (lying along the wall), body toward +x
    const w = T.ribW, h = T.ribH, s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.012, h * 0.42, w * 0.2, h * 0.62, w * 0.48, h * 0.58);
    s.bezierCurveTo(w * 0.86, h * 0.54, w * 1.02, h * 0.3, w * 0.9, h * 0.1);
    s.bezierCurveTo(w * 0.8, -h * 0.04, w * 0.62, -h * 0.02, w * 0.58, -h * 0.22);
    s.bezierCurveTo(w * 0.52, -h * 0.46, w * 0.2, -h * 0.56, 0.012, -h * 0.4);
    s.bezierCurveTo(0, -h * 0.25, 0, -h * 0.1, 0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: T.ribT, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 24 });
    geo.translate(0, 0, -T.ribT / 2);
    const card = new THREE.Mesh(geo, materials.wood);
    card.castShadow = true;
    g.add(card);
    // a dowel fixed to the rib's back, running out of frame toward the potter's hand
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(T.handleR, T.handleR * 1.2, T.handle, 16), materials.woodDark);
    hd.castShadow = true;
    const p = new THREE.Vector3(), anchor = new THREE.Vector3();
    g.userData.handle = hd;
    g.userData.update = (t) => {
      const tl = plan.toolAt(t), wb = plan.wobbleAt(t);
      g.visible = hd.visible = tl.on > 0.01;
      if (!g.visible) return;
      const rEnv = tl.r * (1 + spec.wobble.amp * wb.A * 1.4) + Math.hypot(wb.ex, wb.ez);
      const back = T.gap + T.retract * (1 - tl.on) * (1 - tl.on);
      const az = T.azimuth;
      const lift = 0.35 * (1 - tl.on) * (1 - tl.on); // it leaves upward and outward, never down into the pan
      p.set((rEnv + tl.nr * back) * Math.cos(az), tl.y + tl.ny * back + lift, (rEnv + tl.nr * back) * Math.sin(az));
      orient(g, az, tl.nr, tl.ny, tl.tr, tl.ty, p);
      anchor.set(w * 0.62, h * 0.12, T.ribT * 0.5 + T.handleR * 0.6).applyQuaternion(g.quaternion).add(p);
      placeHandle(hd, anchor, az, T.handleTilt, T.handleYaw, T.handle);
    };
    return g;
  }

  function brush(plan) {
    const B = spec.brush, g = new THREE.Group();
    // head in a local frame: bristle tip at the origin pointing -x (into the clay), body toward +x; level, facing the camera
    const headMat = materials.bristle.clone();
    const tipMat = new THREE.MeshPhysicalMaterial({ color: P.glaze, roughness: 0.2, clearcoat: 0.6 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(B.headT, B.headH, B.headW), headMat);
    head.position.set(B.headT / 2 + 0.03, 0, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.034, B.headH * 1.03, B.headW * 1.03), tipMat);
    tip.position.set(0.017, 0, 0);
    const ferrule = new THREE.Mesh(new THREE.BoxGeometry(0.07, B.headH * 0.78, B.headW * 0.86), materials.ferrule);
    ferrule.position.set(B.headT + 0.065, 0, 0);
    for (const m of [head, tip, ferrule]) { m.castShadow = true; g.add(m); }
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(B.handleR, B.handleR * 1.25, B.len, 16), materials.wood);
    hd.castShadow = true;
    g.userData.handle = hd;
    const p = new THREE.Vector3(), anchor = new THREE.Vector3();
    g.userData.update = (t) => {
      const b = plan.brushAt(t);
      g.visible = hd.visible = b.on > 0.01;
      if (!g.visible) return;
      const back = 0.003 + 0.55 * (1 - b.on) * (1 - b.on);
      const az = B.azimuth;
      p.set((b.r + back) * Math.cos(az), b.y, (b.r + back) * Math.sin(az));
      orient(g, az, 1, 0, 0, 1, p); // radial / up frame (the brush stays level)
      anchor.set(B.headT + 0.09, 0, 0).applyQuaternion(g.quaternion).add(p);
      placeHandle(hd, anchor, az, B.tilt, B.yaw, B.len);
    };
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip (bottom-left, over the splash pan)
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), mark = 40;
      const pw = Math.min(W - 16, pad + mark + pad * 0.7 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(40,28,18,0.2)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, ph / 2 - 1); x.stroke();
      // the mark: a small throwing spiral
      const cx = ox + pad + mark / 2 - 4, cy = oy + ph / 2;
      x.strokeStyle = Q.accent; x.lineWidth = 4; x.lineCap = "round"; x.beginPath();
      for (let k = 0; k <= 60; k++) { const a = (k / 60) * TAU * 2.2, r = 2 + (k / 60) * 15; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); k ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + mark + pad * 0.7, cy + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { room, wheel, clay, rib, brush, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: throwPlan, motion: throwPlan, dof, rng,
  };
}
