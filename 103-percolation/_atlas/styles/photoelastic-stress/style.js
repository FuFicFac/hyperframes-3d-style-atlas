// styles/photoelastic-stress/style.js — "Photoelastic Stress": a clear notched beam between two polarisers on a light
// box. The look lives in spec.js; WHERE the load is, where the supports are and the colour table live in stressplan.js
// (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   * ONE ShaderMaterial on the beam's faces evaluates the stress tensor per pixel (Flamant point loads + bending +
//     notch term, from uniforms the plan gives for t) and looks the retardation up in the interference-colour table
//     (a 512 × 1 half-float DataTexture baked once at build).
//   * The light-box diffuser is a second ShaderMaterial. Both test whether the camera ray to the pixel passes through
//     the analyser sheet (a rectangle on the plane z = analyser.z) — so the dark field follows the sliding sheet's edge
//     exactly, from any camera.
//   * Loading frame (channel rail, posts, crosshead, screw + handwheel, plunger), roller supports, the sliding third
//     support (carriage + blue jack), the analyser sheet (film + frame + guide rail), the lab bench + wall, and an
//     overlay caption chip with exact colours.
// Props never animate themselves: the scene calls rig.update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import { lerp } from "../../kit/time.js";
import * as stressplan from "./stressplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ---------------------------------------------------------------- shared GLSL: analyser coverage by ray test
const ANALYSER_GLSL = /* glsl */ `
uniform vec4 uAna;      // analyser rect on its plane: x0, x1, y0, y1 (world)
uniform float uAnaZ;    // analyser plane z
uniform float uAnaSoft;
float analyserCover(vec3 P) {
  vec3 C = cameraPosition;
  float den = P.z - C.z;
  float s = (uAnaZ - C.z) / (abs(den) < 1e-5 ? 1e-5 : den);
  vec3 h = C + (P - C) * s;
  float inside = step(0.0, s) * step(s, 1.0);
  float cx = smoothstep(uAna.x - uAnaSoft, uAna.x + uAnaSoft, h.x) * (1.0 - smoothstep(uAna.y - uAnaSoft, uAna.y + uAnaSoft, h.x));
  float cy = smoothstep(uAna.z - uAnaSoft, uAna.z + uAnaSoft, h.y) * (1.0 - smoothstep(uAna.w - uAnaSoft, uAna.w + uAnaSoft, h.y));
  return inside * cx * cy;
}
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const LB = spec.lightbox, AN = spec.analyser, BM = spec.beam, NT = spec.notch, PH = spec.photo, FR = spec.frame;
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
  const box = (w, h, d, mat, x, y, z, r = 0) => {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = shadow(new THREE.Mesh(g, mat)); m.position.set(x, y, z); return m;
  };
  const cyl = (r, h, mat, seg = 32) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat));

  // analyser uniforms are shared by the beam and light-box shaders (one object, updated once per frame)
  const anaU = {
    uAna: { value: new THREE.Vector4(-99, -98, AN.y - AN.h / 2, AN.y + AN.h / 2) },
    uAnaZ: { value: AN.z }, uAnaSoft: { value: AN.soft },
  };

  // ---------------------------------------------------------------- interference colour table (baked once)
  /** colourTable() -> { texture: DataTexture n × 1 RGBA half float (linear), table } */
  function colourTable(o = {}) {
    const T = stressplan.interferenceTable({ n: o.n ?? PH.tableN, rMax: o.rMax ?? PH.rMax, kelvin: o.kelvin ?? PH.kelvin });
    const data = new Uint16Array(T.n * 4);
    for (let i = 0; i < T.n; i++) {
      for (let j = 0; j < 3; j++) data[4 * i + j] = THREE.DataUtils.toHalfFloat(T.rgb[3 * i + j]);
      data[4 * i + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    const tex = new THREE.DataTexture(data, T.n, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    stage.renderer.initTexture(tex);
    return { texture: tex, table: T };
  }

  // ---------------------------------------------------------------- lab: bench + wall
  /** lab() -> Group: a light bench top and a pale wall behind the light box */
  function lab(o = {}) {
    const g = new THREE.Group(); g.name = "lab";
    const size = o.size ?? spec.bench.size;
    if (materials.bench.bumpMap) materials.bench.bumpMap.repeat.set(size / 3, size / 3);
    const bench = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.bench);
    bench.rotation.x = -Math.PI / 2; bench.position.y = spec.bench.y; bench.receiveShadow = true; g.add(bench);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(size, 12), materials.wall);
    wall.position.set(0, 6, -(LB.depth + 0.9)); wall.receiveShadow = true; g.add(wall);
    return g;
  }

  // ---------------------------------------------------------------- light box (housing + diffuser shader)
  /** lightBox() -> Group: white housing; the diffuser goes polariser-grey-white, or deep indigo where the analyser covers */
  function lightBox(o = {}) {
    const g = new THREE.Group(); g.name = "lightbox";
    const W = LB.w, Hh = LB.h, rim = LB.rim, y0 = LB.y0, D = LB.depth;
    const cy = y0 + Hh / 2;
    g.add(box(W + 2 * rim, Hh + 2 * rim, D, materials.housing, 0, cy, LB.z - D / 2, 0.04));
    for (const sx of [-1, 1]) g.add(box(0.12, 0.12, 0.4, materials.rubber, sx * (W / 2 - 0.3), spec.bench.y + 0.06, LB.z - D / 2));
    const mat = new THREE.ShaderMaterial({
      name: "diffuser",
      uniforms: {
        ...anaU,
        uLevel: { value: LB.level }, uTint: { value: new THREE.Vector3(...LB.tint) }, uLeak: { value: new THREE.Vector3(...LB.leak) },
        uFall: { value: LB.falloff }, uHalf: { value: new THREE.Vector2(W / 2, Hh / 2) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec2 vL;
        void main() { vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${ANALYSER_GLSL}
        uniform float uLevel, uFall; uniform vec3 uTint, uLeak; uniform vec2 uHalf;
        varying vec3 vW; varying vec2 vL;
        void main() {
          vec2 q = abs(vL) / uHalf;
          float edge = 1.0 - uFall * smoothstep(0.55, 1.0, max(q.x, q.y)) - 0.5 * uFall * dot(q, q) * 0.5;
          vec3 bright = uLevel * uTint * edge;
          float c = analyserCover(vW);
          gl_FragColor = vec4(mix(bright, uLeak * uLevel * (0.85 + 0.15 * edge), c), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), mat);
    face.position.set(0, cy, LB.z + 0.002); face.name = "diffuser"; face.receiveShadow = false;
    g.add(face);
    g.userData.diffuser = face;
    return g;
  }

  // ---------------------------------------------------------------- the beam (photoelastic shader)
  /** photoMaterial(table) -> ShaderMaterial for the beam faces; userData.set(u) takes plan.uniformsAt(t) */
  function photoMaterial(table, o = {}) {
    const half = NT.width / 2, ang = Math.atan2(NT.depth, half), cy = NT.depth - NT.rho;
    const tl = [NT.x - NT.rho * Math.sin(ang), cy + NT.rho * Math.cos(ang)]; // left flank tangent point
    const mat = new THREE.ShaderMaterial({
      name: "photoelastic",
      uniforms: {
        ...anaU,
        uTable: { value: table.texture }, uRmax: { value: table.table.rMax }, uCf: { value: PH.Cf },
        uF: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uDir: { value: new THREE.Vector4(-1, 1, 1, 1) },
        uBeam: { value: new THREE.Vector4(BM.L, BM.H, (BM.H * BM.H * BM.H) / 12, BM.edge) },
        uNotch: { value: new THREE.Vector4(NT.x, NT.depth, NT.rho, NT.decay) }, uNotchAmp: { value: 0 },
        uFlank: { value: new THREE.Vector4(NT.x - half, tl[0], tl[1], 0) },
        uLevel: { value: LB.level * (o.level ?? 1) }, uGain: { value: PH.gain }, uTint: { value: new THREE.Vector3(...LB.tint) },
        uLeak: { value: new THREE.Vector3(...LB.leak) }, uClear: { value: new THREE.Vector3(...PH.clearTint) },
        uEdgeGlow: { value: PH.edgeGlow }, uClearEdge: { value: PH.clearEdge },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec2 vL;
        void main() { vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${GLSL_SAFE}
        ${ANALYSER_GLSL}
        uniform sampler2D uTable; uniform float uRmax, uCf, uNotchAmp, uLevel, uGain, uEdgeGlow, uClearEdge;
        uniform vec4 uF[4]; uniform vec4 uDir, uBeam, uNotch, uFlank; uniform vec3 uTint, uLeak, uClear;
        varying vec3 vW; varying vec2 vL;
        const float PI = 3.14159265;
        float segDist(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0); return length(p - a - ab * h); }
        void main() {
          float x = vL.x, y = vL.y, H = uBeam.y, I = uBeam.z;
          float sxx = 0.0, syy = 0.0, txy = 0.0, M = 0.0;
          for (int i = 0; i < 4; i++) {
            vec4 f = uF[i]; float dir = uDir[i];
            float s = x - f.x, dy = y - f.y, d = max(0.0, dir * dy);
            float r2 = s * s + dy * dy + f.w * f.w;
            float sr = -2.0 * f.z * d / (PI * r2);
            sxx += sr * s * s / r2; syy += sr * dy * dy / r2; txy += sr * s * dy / r2;
            M += (dir > 0.0 ? f.z : -f.z) * max(0.0, x - f.x);
          }
          sxx += -M * (y - 0.5 * H) / I;
          vec2 rc = vec2(uNotch.x, uNotch.y - uNotch.z);
          float dn = max(0.0, length(vec2(x, y) - rc) - uNotch.z);
          sxx += uNotchAmp * safePow(uNotch.z / (uNotch.z + dn), uNotch.w);
          float diff = sqrt((sxx - syy) * (sxx - syy) + 4.0 * txy * txy);
          float R = uCf * diff;
          vec3 band = texture2D(uTable, vec2(clamp(R / uRmax, 0.0, 1.0) * (511.0 / 512.0) + 0.5 / 512.0, 0.5)).rgb;
          // distance to the beam's machined edges (outline + notch flanks + root arc)
          float hl = 0.5 * uBeam.x;
          float de = min(min(y, H - y), min(x + hl, hl - x));
          vec2 p = vec2(x, y);
          float xr = 2.0 * uNotch.x - uFlank.x, txr = 2.0 * uNotch.x - uFlank.y;
          float dv = min(segDist(p, vec2(uFlank.x, 0.0), uFlank.yz), segDist(p, vec2(xr, 0.0), vec2(txr, uFlank.z)));
          dv = min(dv, abs(length(p - rc) - uNotch.z));
          de = min(de, dv);
          float edgeLine = exp(-de / uBeam.w);
          vec3 dark = band * uGain * uLevel * uTint + uLeak * uLevel + vec3(0.75, 0.8, 0.95) * uEdgeGlow * edgeLine * uLevel;
          vec3 clear = uLevel * uTint * uClear * (1.0 - uClearEdge * edgeLine);
          float c = analyserCover(vW);
          gl_FragColor = vec4(mix(clear, dark, c), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    mat.userData.set = (u) => {
      for (let i = 0; i < 4; i++) mat.uniforms.uF.value[i].set(...u.loads[i]);
      mat.uniforms.uDir.value.set(...u.dirs);
      mat.uniforms.uNotchAmp.value = u.notchAmp;
    };
    return mat;
  }

  /** beam(table) -> Mesh: the notched clear beam (extruded outline); caps carry the photoelastic shader */
  function beam(table, o = {}) {
    const pts = stressplan.notchOutline(BM, NT, 12);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: BM.T, bevelEnabled: false, curveSegments: 12 });
    const photo = photoMaterial(table, o);
    const mesh = new THREE.Mesh(g, [photo, materials.acrylicEdge]);
    mesh.position.set(0, BM.y0, BM.z - BM.T / 2);
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.name = "beam";
    mesh.userData.photo = photo;
    return mesh;
  }

  // ---------------------------------------------------------------- loading frame
  const RL = FR.rail;
  /** roller(len) -> Mesh: a dark steel roller along z */
  function roller(o = {}) {
    const m = cyl(FR.roller.r, o.len ?? FR.roller.len, materials.roller, 28);
    m.rotation.x = Math.PI / 2; m.name = "roller";
    return m;
  }
  /** fixedSupport(x) -> Group: a bridge saddle straddling the channel rail with a roller on top (beam bottom contact) */
  function fixedSupport(x) {
    const g = new THREE.Group(); g.name = "support";
    const yb = BM.y0 - FR.roller.r; // roller centre
    const top0 = 0.93, zc = (RL.z0 + RL.z1) / 2, zw = RL.z1 - RL.z0;
    g.add(box(0.2, top0 - RL.y1, RL.lip, materials.alu, 0, (top0 + RL.y1) / 2, RL.z0 + RL.lip / 2));
    g.add(box(0.2, top0 - RL.front, RL.lip, materials.alu, 0, (top0 + RL.front) / 2, RL.z1 - RL.lip / 2));
    g.add(box(0.26, yb - FR.roller.r + 0.01 - top0, zw, materials.alu, 0, (top0 + yb - FR.roller.r + 0.01) / 2, zc, 0.015));
    const r = roller({ len: BM.T + 0.08 }); r.position.set(0, yb, BM.z); g.add(r);
    g.position.x = x;
    return g;
  }
  /** thirdSupport() -> Group: a carriage inside the channel with a blue screw jack + roller; userData.set(x, lift, visible) */
  function thirdSupport(o = {}) {
    const g = new THREE.Group(); g.name = "thirdSupport";
    const zc = (RL.z0 + RL.z1) / 2, inner = RL.z1 - RL.z0 - 2 * RL.lip - 0.04;
    const car = box(0.4, 0.08, inner, materials.jack, 0, RL.y0 + 0.1, zc, 0.02); g.add(car);
    const yb = BM.y0 - FR.roller.r, drop = spec.third.drop;
    const lifter = new THREE.Group(); g.add(lifter);
    const baseTop = RL.y0 + 0.14;
    // telescoping column (steel) from the carriage to a saddle under the roller; its length follows the lift
    const column = cyl(0.05, 1, materials.steel, 20); g.add(column);
    const saddle = box(0.2, 0.06, inner, materials.jack, 0, 0, zc, 0.015); lifter.add(saddle);
    const r = roller({ len: BM.T + 0.06 }); lifter.add(r); r.position.set(0, 0, BM.z);
    const stripe = box(0.2, 0.02, 0.012, materials.accent, 0, 0, RL.z1 - RL.lip - 0.02); lifter.add(stripe);
    g.userData.set = (x, lift, visible) => {
      g.visible = visible;
      g.position.x = x;
      const yr = yb - drop * (1 - lift);
      r.position.y = yr; saddle.position.y = yr - FR.roller.r - 0.03; stripe.position.y = yr - FR.roller.r - 0.03;
      const top = yr - FR.roller.r - 0.06;
      column.scale.y = Math.max(0.01, top - baseTop); column.position.set(0, (top + baseTop) / 2, zc);
    };
    g.userData.set(spec.third.from, 0, false);
    return g;
  }
  /** loadingFrame() -> Group: channel rail, two posts, crosshead, screw + handwheel, plunger; userData.set(gap, wheel) */
  function loadingFrame(o = {}) {
    const g = new THREE.Group(); g.name = "frame";
    const zc = (RL.z0 + RL.z1) / 2, zw = RL.z1 - RL.z0, Lr = 2 * RL.x;
    // channel rail: floor + two walls (open top between the lips)
    g.add(box(Lr - 0.02, 0.06, zw - 0.03, materials.aluDark, 0, RL.y0 + 0.03, zc)); // inset: no coplanar faces with the walls (z-fighting)
    g.add(box(Lr, RL.y1 - RL.y0, RL.lip, materials.alu, 0, (RL.y0 + RL.y1) / 2, RL.z0 + RL.lip / 2, 0.012));
    g.add(box(Lr, RL.front - RL.y0, RL.lip, materials.alu, 0, (RL.y0 + RL.front) / 2, RL.z1 - RL.lip / 2, 0.012));
    for (const sx of [-1, 1]) g.add(box(0.06, RL.y1 - RL.y0, zw - 0.02, materials.alu, sx * (RL.x - 0.03), (RL.y0 + RL.y1) / 2, zc, 0.012));
    // posts + crosshead
    const PS = FR.posts, CH = FR.crosshead;
    for (const sx of [-1, 1]) {
      const p = cyl(PS.r, PS.top - RL.y1, materials.steel, 28); p.position.set(sx * PS.x, (PS.top + RL.y1) / 2, zc); g.add(p);
      g.add(box(0.36, 0.1, zw + 0.04, materials.aluDark, sx * PS.x, RL.y1 + 0.05, zc, 0.02));
    }
    g.add(box(2 * PS.x + 0.4, CH.h, CH.d, materials.alu, 0, CH.y + CH.h / 2, zc, 0.03));
    for (const sx of [-1, 1]) { const nut = cyl(PS.r * 1.5, 0.06, materials.steel, 6); nut.position.set(sx * PS.x, CH.y + CH.h + 0.03, zc); g.add(nut); }
    // screw, handwheel, plunger (move with the plan)
    const SC = FR.screw, PL = FR.plunger;
    const screw = cyl(SC.r, 1, materials.steel, 20); g.add(screw);
    const wheel = new THREE.Group(); g.add(wheel);
    const rim = shadow(new THREE.Mesh(new THREE.TorusGeometry(SC.wheelR, 0.028, 12, 48), materials.aluDark)); rim.rotation.x = Math.PI / 2; wheel.add(rim);
    for (let k = 0; k < 3; k++) { const sp = box(SC.wheelR * 2, 0.03, 0.03, materials.aluDark, 0, 0, 0); sp.rotation.y = (k * Math.PI) / 3; wheel.add(sp); }
    const knob = cyl(0.035, 0.16, materials.accent, 16); knob.position.set(SC.wheelR, 0.08, 0); wheel.add(knob);
    const hub = cyl(0.07, 0.08, materials.steel, 20); wheel.add(hub);
    const plunger = new THREE.Group(); g.add(plunger);
    plunger.add(box(PL.r * 2.2, PL.h, BM.T + 0.1, materials.alu, 0, PL.noseR + PL.h / 2, BM.z, 0.02));
    const nose = cyl(PL.noseR, BM.T + 0.06, materials.roller, 28); nose.rotation.x = Math.PI / 2; nose.position.set(0, PL.noseR, BM.z); plunger.add(nose);
    const topY = BM.y0 + BM.H;
    g.userData.set = (gap, wheelAngle) => {
      plunger.position.y = topY + gap;
      const sTop = SC.wheelY, sBot = topY + gap + PL.noseR + PL.h;
      screw.scale.y = sTop - sBot; screw.position.set(0, (sTop + sBot) / 2, zc);
      wheel.position.set(0, SC.wheelY, zc); wheel.rotation.y = wheelAngle;
    };
    g.userData.set(0.3, 0);
    return g;
  }

  // ---------------------------------------------------------------- analyser sheet (film + frame + guide rail)
  /** analyserSheet() -> Group: tinted polarising film in a slim frame on a low guide rail; userData.set(u 0..1) slides it in */
  function analyserSheet(o = {}) {
    const g = new THREE.Group(); g.name = "analyser";
    const sheet = new THREE.Group(); g.add(sheet);
    const film = new THREE.Mesh(new THREE.PlaneGeometry(AN.w, AN.h), materials.film);
    materials.film.transparent = true; materials.film.depthWrite = false;
    film.position.set(0, AN.y, AN.z); film.renderOrder = 3; film.name = "film"; sheet.add(film);
    const f = AN.frame, fd = AN.frameDepth;
    sheet.add(box(AN.w + 2 * f, f, fd, materials.aluDark, 0, AN.y + AN.h / 2 + f / 2, AN.z, 0.01));
    sheet.add(box(AN.w + 2 * f, f, fd, materials.aluDark, 0, AN.y - AN.h / 2 - f / 2, AN.z, 0.01));
    for (const sx of [-1, 1]) sheet.add(box(f, AN.h, fd, materials.aluDark, sx * (AN.w / 2 + f / 2), AN.y, AN.z, 0.01));
    const tab = box(0.08, 0.36, 0.05, materials.accent, AN.w / 2 + f + 0.04, AN.y, AN.z, 0.02); sheet.add(tab);
    for (const sx of [-0.4, 0.4]) {
      const leg = box(0.05, AN.y - AN.h / 2 - f - spec.bench.y - 0.05, 0.05, materials.aluDark, sx * AN.w, (AN.y - AN.h / 2 - f + spec.bench.y + 0.05) / 2, AN.z, 0);
      sheet.add(leg);
    }
    const rail = box(15, 0.05, 0.12, materials.alu, -3.5, spec.bench.y + 0.025, AN.z, 0.01); g.add(rail);
    // the sheet is thin film + slim bars: no shadow casting (their long thin shadows alias into stair-steps on the bench)
    g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    g.userData.set = (u) => {
      const x = lerp(AN.from, AN.to, u);
      sheet.position.x = x;
      anaU.uAna.value.set(x - AN.w / 2, x + AN.w / 2, AN.y - AN.h / 2, AN.y + AN.h / 2);
    };
    g.userData.set(0);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (dark plate, a small fringe icon, light text); userData.show(text, alpha) */
  function caption(table, o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1000, Hp = Q.h + 24;
    const T = table.table, enc = (v) => Math.round(255 * Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)));
    const css = (R) => { const c = stressplan.colourAt(T, R); return `rgb(${enc(c[0])},${enc(c[1])},${enc(c[2])})`; };
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.25)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      // icon: nested fringe arcs in true table colours (as under a contact point)
      const cx = ox + pad + ic / 2, cy = oy + ph / 2 + ic * 0.32;
      const rings = [[1150, 0.5], [800, 0.42], [575, 0.34], [450, 0.26], [250, 0.18]];
      for (const [R, rr] of rings) { x.fillStyle = css(R); x.beginPath(); x.arc(cx, cy, ic * rr * 1.7, Math.PI, 0); x.closePath(); x.fill(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * polariscope(plan) -> { group, beam, frame, third, analyser, lightbox, table, update(t) } (adds itself to the scene)
   *   update(t): analyser slide, beam uniforms (loads, reactions, notch term), plunger + handwheel, third support.
   */
  function polariscope(plan, o = {}) {
    const group = new THREE.Group(); group.name = "polariscope";
    const table = o.table ?? colourTable();
    group.add(lab());
    const lb = lightBox(); group.add(lb);
    const fr = loadingFrame(); group.add(fr);
    for (const s of spec.supports) group.add(fixedSupport(s.x));
    const th = thirdSupport(); group.add(th);
    const bm = beam(table); group.add(bm);
    const an = analyserSheet(); group.add(an);
    stage.scene.add(group);
    return {
      group, beam: bm, frame: fr, third: th, analyser: an, lightbox: lb, table,
      update(t) {
        const u = plan.uniformsAt(t);
        an.userData.set(u.analyser);
        bm.userData.photo.userData.set(u);
        fr.userData.set(u.plungerGap, u.wheel);
        th.userData.set(u.third.x, u.third.lift, u.third.visible);
      },
    };
  }

  const props = { lab, lightBox, beam, photoMaterial, colourTable, roller, fixedSupport, thirdSupport, loadingFrame, analyserSheet, caption, polariscope };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: stressplan, motion: stressplan,
  };
}
