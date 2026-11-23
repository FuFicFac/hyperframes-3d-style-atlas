// styles/schlieren/style.js — "Schlieren": a big round mirror on an optics bench in a dim lab, a candle in front of it,
// a razor blade at the focus. The look lives in spec.js; WHEN the blade moves, how far the field dims, when the plume
// shows and rolls, the breath puff and the split seam live in plumeplan.js (THREE-free planner shared with SCORE).
// This file turns the plan into pictures:
//   * ONE ShaderMaterial on the mirror's glass: for each pixel it casts the camera ray back to the candle's vertical
//     plane, evaluates the plume density there (PLUME_GLSL, a closed form of position and t) and shows its sideways
//     derivative as light / dark on grey — or the plain bright field when the blade is out (ordinary view), or both
//     split by a seam (beat 5).
//   * The candle (wax, wick, brass dish + post, additive flame shader, glow sprite, flame point light), the mirror cell +
//     yoke + post, the knife-edge stand (micrometer block, sliding carriage, razor blade with a lit edge), the pinhole lamp,
//     a box camera, the straw, the optical table + rail + wall, and an overlay caption chip with exact colours.
// Props never animate themselves: the scene calls bench.update(t) and rig.update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { blobTexture } from "../../kit/textures.js";
import * as plumeplan from "./plumeplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const MR = spec.mirror, CN = spec.candle, FL = spec.flame, BL = spec.blade, PL = spec.plume, PF = spec.puff, SW = spec.straw;
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
  const box = (w, h, d, mat, x, y, z, r = 0) => {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = shadow(new THREE.Mesh(g, mat)); m.position.set(x, y, z); return m;
  };
  const cyl = (r, h, mat, seg = 32, r2 = r) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), mat));
  const v3 = (a) => new THREE.Vector3(...a);
  /** flame tip in world space (plume origin) */
  const flameTip = () => plumeplan.flameTip(spec);

  // ---------------------------------------------------------------- lab: optical table, rail, wall
  /** lab() -> Group: dark optical table top with a rail along z and a dark wall behind the mirror */
  function lab(o = {}) {
    const g = new THREE.Group(); g.name = "lab";
    const B = spec.bench, R = spec.rail;
    if (materials.bench.bumpMap) materials.bench.bumpMap.repeat.set(B.w / 1.5, B.d / 1.5);
    g.add(box(B.w, B.thick, B.d, materials.bench, 0, B.y - B.thick / 2, B.z));
    g.add(box(R.w, R.h, R.z1 - R.z0, materials.alu, 0, B.y + R.h / 2, (R.z0 + R.z1) / 2, 0.01));
    const W = spec.wall;
    // back wall: an unlit soft pool of light behind the mirror (rim separation for the black cell), darker toward the edges
    const wallMat = new THREE.ShaderMaterial({
      name: "wall",
      uniforms: { uBase: { value: new THREE.Color(W.base) }, uGlow: { value: new THREE.Color(W.glow) }, uC: { value: new THREE.Vector2(...W.glowAt) }, uR: { value: new THREE.Vector2(...W.glowR) } },
      vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase, uGlow; uniform vec2 uC, uR; varying vec3 vW;
        void main() {
          vec2 d = (vW.xy - uC) / uR;
          float k = exp(-dot(d, d));
          gl_FragColor = vec4(mix(uBase, uGlow, k), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W.w, W.h), wallMat);
    wall.position.set(0, W.h / 2 - 1, W.z); wall.name = "wall"; g.add(wall);
    return g;
  }

  // ---------------------------------------------------------------- the mirror (cell, yoke, post) + disc shader
  /** discMaterial() -> ShaderMaterial for the mirror glass; userData.set(u, t) takes plan.uniformsAt(t) */
  function discMaterial() {
    const tip = flameTip();
    const mat = new THREE.ShaderMaterial({
      name: "schlierenDisc",
      uniforms: {
        uTime: { value: 0 },
        uPl0: { value: new THREE.Vector4(PL.v, PL.w0, PL.spread, PL.decay) },
        uPl1: { value: new THREE.Vector4(PL.rollScale, PL.rollAmp, PL.rollGrow, PL.rollTop) },
        uPl2: { value: new THREE.Vector4(0, PL.h, PL.evolve, PL.pulseLen) },
        uPuff: { value: new THREE.Vector4(-99, PF.sigT, SW.y, PF.sigY) }, uPuffA: { value: PF.A },
        uJet: { value: new THREE.Vector4(0, 0, SW.y, SW.tip) }, uJetW: { value: new THREE.Vector4(PF.jet.w0, PF.jet.spread, PF.jet.amp, 0) },
        uPlane: { value: new THREE.Vector3(...tip) },
        uBright: { value: v3(MR.bright) }, uGrey: { value: v3(MR.grey) }, uLight: { value: v3(MR.light) }, uDark: { value: v3(MR.dark) },
        uField: { value: 0 }, uGain: { value: 0 }, uLamp: { value: 1 }, uContrast: { value: MR.contrast }, uFall: { value: MR.brightFall },
        uR: { value: MR.R }, uBevel: { value: MR.bevel }, uRoom: { value: MR.room },
        uSeam: { value: -99 }, uSeamW: { value: MR.seamLine },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec2 vL;
        void main() { vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${plumeplan.PLUME_GLSL}
        uniform vec3 uPlane, uBright, uGrey, uLight, uDark;
        uniform float uField, uGain, uLamp, uContrast, uFall, uR, uBevel, uRoom, uSeam, uSeamW;
        varying vec3 vW; varying vec2 vL;
        void main() {
          vec3 C = cameraPosition;
          float den = vW.z - C.z;
          float s = (uPlane.z - C.z) / (abs(den) < 1e-5 ? -1e-5 : den);
          vec3 h = C + (vW - C) * s;                    // where this pixel's ray crosses the candle's plane
          vec2 pp = h.xy - uPlane.xy;                   // plume space (flame tip = origin)
          float r = length(vL) / uR;
          float S = schlierenS(pp, uTime) * uContrast;
          S += uRoom * (fbm3n(vec3(vL * 1.6, uTime * 0.12)) - 0.5) * 40.0 * uContrast;   // faint room convection
          S *= uGain;
          float sc = S / sqrt(1.0 + S * S);
          vec3 sch = uGrey + max(sc, 0.0) * (uLight - uGrey) + max(-sc, 0.0) * (uDark - uGrey);
          vec3 ord = uBright * uLamp * (1.0 - uFall * r * r);
          float right = smoothstep(uSeam - 0.002, uSeam + 0.002, vL.x);
          vec3 col = mix(ord, sch, uField * right);
          col *= 1.0 - 0.9 * exp(-pow((vL.x - uSeam) / uSeamW, 2.0));
          col *= 1.0 - 0.45 * smoothstep(1.0 - uBevel / uR, 1.0, r);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    mat.userData.set = (u, t) => {
      const U = mat.uniforms;
      U.uTime.value = t;
      U.uField.value = u.field; U.uGain.value = u.gain; U.uLamp.value = u.lamp;
      U.uPl1.value.w = u.rollY; U.uPl2.value.x = u.sway;
      U.uJet.value.x = u.jet; U.uJet.value.y = u.jetFront; U.uJet.value.w = u.strawX;
      U.uSeam.value = u.seam;
    };
    mat.userData.setPuff = (tPuff) => { mat.uniforms.uPuff.value.x = tPuff; };
    return mat;
  }

  /** mirror() -> Group: black anodised cell (machined ring) + back, glass disc with the schlieren shader, yoke, post, carrier */
  function mirror(o = {}) {
    const g = new THREE.Group(); g.name = "mirror";
    const R = MR.R, c = MR.cell, D = MR.cellDepth;
    // machined ring profile (lathe around the disc axis): outer wall, front lip with a chamfer, inner bore
    const prof = [
      [R - 0.006, -D * 0.6], [R + c, -D * 0.6], [R + c, D * 0.25], [R + c - 0.025, D * 0.4], [R + 0.012, D * 0.4], [R - 0.006, D * 0.18],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const ringGeo = new THREE.LatheGeometry(prof, 128);
    ringGeo.rotateX(Math.PI / 2);
    const ring = shadow(new THREE.Mesh(ringGeo, materials.anodised)); g.add(ring);
    const back = cyl(R + c, MR.back, materials.anodised, 96); back.rotation.x = Math.PI / 2; back.position.z = -D * 0.6 - MR.back / 2; g.add(back);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 160), discMaterial());
    disc.position.z = 0.0; disc.name = "disc"; disc.receiveShadow = false; g.add(disc);
    // yoke: two arms from pivots at the sides down to a cross bar, a post to the carrier on the rail
    const yk = R + c + 0.07, barY = -R - c - 0.14;
    for (const sx of [-1, 1]) {
      const piv = cyl(0.05, 0.12, materials.steel, 24); piv.rotation.z = Math.PI / 2; piv.position.set(sx * (R + c + 0.03), 0, -0.02); g.add(piv);
      const knob = cyl(0.07, 0.05, materials.anodised, 24); knob.rotation.z = Math.PI / 2; knob.position.set(sx * (yk + 0.06), 0, -0.02); g.add(knob);
      g.add(box(0.06, -barY + 0.02, 0.1, materials.anodised, sx * yk, barY / 2, -0.02, 0.012));
    }
    g.add(box(2 * yk + 0.06, 0.07, 0.12, materials.anodised, 0, barY, -0.02, 0.015));
    const postH = MR.y + barY - spec.bench.y;
    const post = cyl(0.045, postH, materials.steel, 24); post.position.set(0, barY - postH / 2, -0.02); g.add(post);
    g.add(box(0.36, 0.06, 0.4, materials.anodised, 0, barY - postH + 0.09, -0.02, 0.015));
    g.position.set(0, MR.y, MR.z);
    g.userData.disc = disc;
    return g;
  }

  // ---------------------------------------------------------------- the candle + flame
  /** flameMaterial() -> additive ShaderMaterial: bluish root, orange body, yellow-white core, soft fresnel edge */
  function flameMaterial() {
    return new THREE.ShaderMaterial({
      name: "flame",
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uCore: { value: new THREE.Color(P.flameCore) }, uBody: { value: new THREE.Color(P.flame) }, uE: { value: FL.emissive }, uH: { value: FL.h } },
      vertexShader: /* glsl */ `
        varying vec3 vN, vV; varying float vY;
        void main() {
          vY = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCore, uBody; uniform float uE, uH;
        varying vec3 vN, vV; varying float vY;
        void main() {
          float u = clamp(vY / uH, 0.0, 1.0);
          float f = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
          vec3 root = vec3(0.12, 0.22, 0.9);
          vec3 col = mix(uBody, uCore, smoothstep(0.25, 0.9, f) * (1.0 - smoothstep(0.55, 1.0, u)));
          col = mix(root, col, smoothstep(0.02, 0.22, u));
          float a = smoothstep(0.0, 0.55, f) * (1.0 - smoothstep(0.8, 1.0, u) * 0.6);
          gl_FragColor = vec4(col * uE * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  /** candle() -> Group: brass post + dish, wax candle with a melted rim, wick, flame (+ glow sprite, point light); userData.set(flicker) */
  function candle(o = {}) {
    const g = new THREE.Group(); g.name = "candle";
    const y0 = CN.y0, top = CN.y0 + CN.h;
    const post = cyl(CN.postR, y0 - 0.03 - spec.bench.y, materials.brass, 20); post.position.y = (y0 - 0.03 + spec.bench.y) / 2; g.add(post);
    g.add(box(0.2, 0.03, 0.2, materials.anodised, 0, spec.bench.y + 0.015, 0, 0.008));
    const dishProf = [[0, 0], [CN.dishR, 0.0], [CN.dishR + 0.01, 0.025], [CN.dishR - 0.006, 0.03], [CN.dishR - 0.012, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y));
    const dish = shadow(new THREE.Mesh(new THREE.LatheGeometry(dishProf, 48), materials.brass)); dish.position.y = y0 - 0.03; g.add(dish);
    // wax: straight body with a softly melted cup at the top
    const r = CN.r, waxProf = [[0, 0], [r, 0], [r, CN.h - 0.004], [r - 0.006, CN.h + 0.004], [r - 0.014, CN.h - 0.008], [r * 0.4, CN.h - 0.014], [0, CN.h - 0.015]].map(([x, y]) => new THREE.Vector2(x, y));
    const wax = shadow(new THREE.Mesh(new THREE.LatheGeometry(waxProf, 48), materials.wax)); wax.position.y = y0; g.add(wax);
    const wick = cyl(0.0035, 0.03, materials.wick, 8); wick.position.y = top + 0.0; wick.rotation.z = 0.12; g.add(wick);
    // flame: lathe teardrop, base at the wick
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24, y = u * FL.h;
      const w = FL.r * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.75) * (1 - 0.55 * u) * (u < 0.12 ? 0.6 + 3.3 * u : 1);
      pts.push(new THREE.Vector2(Math.max(0.0005, w), y));
    }
    pts[0].x = 0.0005; pts[pts.length - 1].x = 0.0005;
    const flame = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), flameMaterial());
    flame.renderOrder = 5; flame.name = "flame";
    const flameRoot = new THREE.Group(); flameRoot.position.y = top + 0.01; flameRoot.add(flame); g.add(flameRoot);
    const glowMat = new THREE.SpriteMaterial({ map: blobTexture(), color: new THREE.Color(P.flame), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    const glow = new THREE.Sprite(glowMat); glow.scale.set(FL.glow, FL.glow * 1.25, 1); glow.position.y = top + FL.h * 0.45; glow.renderOrder = 6; g.add(glow);
    const light = new THREE.PointLight(P.flame, FL.light, 3, 2); light.position.y = top + FL.h * 0.45; light.castShadow = false; g.add(light);
    g.position.set(CN.x, 0, CN.z);
    g.userData.set = (f) => {
      flame.scale.set(f.sx, f.sy, f.sx);
      flameRoot.rotation.z = f.lean;
      glow.scale.set(FL.glow * f.sx, FL.glow * 1.25 * f.sy, 1);
      light.intensity = FL.light * (0.85 + 0.15 * f.sy);
    };
    g.userData.set({ sx: 1, sy: 1, lean: 0 });
    return g;
  }

  // ---------------------------------------------------------------- knife edge (micrometer stand + razor blade)
  /** razorShape() -> THREE.Shape: a rectangular razor blade (local x: 0 = cutting edge on the left), with a centre slot */
  function razorShape() {
    const w = BL.w, h = BL.h, s = new THREE.Shape();
    s.moveTo(0, -h / 2); s.lineTo(w - 0.012, -h / 2); s.quadraticCurveTo(w, -h / 2, w, -h / 2 + 0.012);
    s.lineTo(w, h / 2 - 0.012); s.quadraticCurveTo(w, h / 2, w - 0.012, h / 2); s.lineTo(0, h / 2); s.lineTo(0, -h / 2);
    const slot = new THREE.Path();
    const sx0 = w * 0.38, sx1 = w * 0.82, sh = h * 0.13;
    slot.moveTo(sx0, -sh); slot.lineTo(sx1, -sh); slot.absarc(sx1, 0, sh, -Math.PI / 2, Math.PI / 2, false); slot.lineTo(sx0, sh); slot.absarc(sx0, 0, sh, Math.PI / 2, 1.5 * Math.PI, false);
    s.holes.push(slot);
    return s;
  }
  /** knifeEdge() -> Group: post on a rail carrier, micrometer block with an orange knob, sliding carriage + arm + blade,
   *  lit cutting edge; userData.set(edgeX, cut) */
  function knifeEdge(o = {}) {
    const g = new THREE.Group(); g.name = "knife";
    const k = BL.w / 0.26;                       // stage parts are drawn for a 0.26 m blade, then scaled with it
    const y = BL.y, z = BL.z, by = y - BL.h / 2 - 0.09 * k;
    const blockX = BL.focusX + BL.w * 0.5 + 0.12 * k;
    const postH = by - 0.05 * k - spec.bench.y;
    const post = cyl(0.025 * k, postH, materials.steel, 20); post.position.set(blockX, spec.bench.y + postH / 2, z); g.add(post);
    g.add(box(0.22 * k, 0.05 * k, 0.26 * k, materials.anodised, blockX, spec.bench.y + 0.025 * k, z, 0.01 * k));
    const stageG = new THREE.Group(); stageG.position.set(blockX, by, z); stageG.scale.setScalar(k * 0.62); g.add(stageG);
    stageG.add(box(0.34, 0.1, 0.16, materials.anodised, 0, 0, 0, 0.012));
    const knob = cyl(0.04, 0.06, materials.knob, 24); knob.rotation.z = Math.PI / 2; knob.position.set(0.2, 0, 0); stageG.add(knob);
    const thimble = cyl(0.028, 0.08, materials.steel, 24); thimble.rotation.z = Math.PI / 2; thimble.position.set(0.13, 0, 0); stageG.add(thimble);
    // sliding carriage (moves in x): slide plate, upright arm, blade clamp, blade
    const car = new THREE.Group(); g.add(car);
    const armX = BL.w * 0.75;
    car.add(box(0.14 * k, 0.03 * k, 0.14 * k, materials.alu, armX, by + 0.046 * k, z, 0.006 * k));
    const armH = y - (by + 0.06 * k);
    car.add(box(0.03 * k, armH, 0.03 * k, materials.alu, armX, by + 0.06 * k + armH / 2, z - 0.02 * k, 0.004 * k));
    car.add(box(0.07 * k, BL.h * 0.8, 0.03 * k, materials.anodised, armX, y, z - 0.02 * k, 0.006 * k));
    const bladeGeo = new THREE.ExtrudeGeometry(razorShape(), { depth: BL.t, bevelEnabled: false, curveSegments: 12 });
    const blade = shadow(new THREE.Mesh(bladeGeo, materials.blade)); blade.position.set(0, y, z - BL.t / 2); car.add(blade);
    // the cutting edge catches the converging light once it reaches the focus: a thin bright line along the edge
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.0035, BL.h, BL.t * 1.6), edgeMat);
    edge.position.set(0.0012, y, z); edge.name = "bladeEdge"; car.add(edge);
    g.userData.set = (edgeX, cut) => {
      car.position.x = edgeX;
      const c = Math.min(1, cut * 2), a = 0.25 + BL.glint * c;
      edgeMat.color.setRGB(a, a * 0.93, a * 0.8);
    };
    g.userData.set(BL.from, 0);
    return g;
  }

  /** pinholeLamp() -> Group: small lamp housing aimed at the mirror, glowing pinhole */
  function pinholeLamp(o = {}) {
    const g = new THREE.Group(); g.name = "lamp";
    const L = spec.lamp;
    const body = cyl(0.06, 0.18, materials.camBody, 28); body.rotation.x = Math.PI / 2; g.add(body);
    const cap = cyl(0.064, 0.02, materials.anodised, 28); cap.rotation.x = Math.PI / 2; cap.position.z = -0.1; g.add(cap);
    const pin = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3da").multiplyScalar(4) }));
    pin.rotation.y = Math.PI; pin.position.z = -0.111; g.add(pin);
    const postH = L.y - 0.03 - spec.bench.y;
    const post = cyl(0.018, postH, materials.steel, 16); post.position.y = -postH / 2 - 0.03; g.add(post);
    g.position.set(L.x, L.y, L.z);
    return g;
  }

  /** boxCamera() -> Group: dark camera body + lens barrel pointing at the mirror, on a post */
  function boxCamera(o = {}) {
    const g = new THREE.Group(); g.name = "camera";
    const C = spec.camBox;
    g.add(box(C.w, C.h, C.d, materials.camBody, 0, 0, 0, 0.02));
    const lens = cyl(0.06, 0.12, materials.anodised, 32); lens.rotation.x = Math.PI / 2; lens.position.z = -C.d / 2 - 0.06; g.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.048, 32), materials.lens); glass.rotation.y = Math.PI; glass.position.z = -C.d / 2 - 0.121; g.add(glass);
    const postH = C.y - C.h / 2 - spec.bench.y;
    const post = cyl(0.022, postH, materials.steel, 16); post.position.y = -C.h / 2 - postH / 2; g.add(post);
    g.position.set(C.x, C.y, C.z);
    return g;
  }

  // ---------------------------------------------------------------- the straw (beat 4)
  /** straw() -> Group: a long white straw pointing +x with a red band; userData.set(tipXrel, visible) */
  function straw(o = {}) {
    const g = new THREE.Group(); g.name = "straw";
    const tube = cyl(SW.r, SW.len, materials.straw, 20); tube.rotation.z = Math.PI / 2; tube.position.x = -SW.len / 2; g.add(tube);
    const band = cyl(SW.r * 1.04, 0.05, materials.strawBand, 20); band.rotation.z = Math.PI / 2; band.position.x = -0.12; g.add(band);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(SW.r * 0.8, 20), new THREE.MeshBasicMaterial({ color: 0x050608 }));
    hole.rotation.y = Math.PI / 2; hole.position.x = 0.0015; g.add(hole);
    const tip = flameTip();
    g.userData.set = (xRel, visible) => { g.visible = visible; g.position.set(tip[0] + xRel, tip[1] + SW.y, tip[2]); };
    g.userData.set(SW.hidden, false);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (ivory plate, a small half-grey knife-edge icon, dark text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 980, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.36)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.45)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.fillStyle = Q.accent; x.beginPath(); x.roundRect(ox, oy + ph - 7, pw, 7, [0, 0, 14, 14]); x.fill();
      // icon: a round field, half grey (knife side) with a light/dark wisp
      const cx = ox + pad + ic / 2, cy = oy + ph / 2 - 2, rr = ic / 2;
      x.fillStyle = Q.iconGrey; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.icon; x.beginPath(); x.arc(cx, cy, rr, Math.PI / 2, Math.PI * 1.5); x.fill();
      x.strokeStyle = Q.plate; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + rr * 0.2, cy + rr * 0.8); x.bezierCurveTo(cx - rr * 0.3, cy + rr * 0.2, cx + rr * 0.6, cy - rr * 0.2, cx + rr * 0.1, cy - rr * 0.85); x.stroke();
      x.strokeStyle = Q.ink; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) - 1);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * schlierenBench(plan) -> { group, mirror, disc, candle, knife, lamp, camera, straw, update(t) } (adds itself to the scene)
   *   update(t): disc uniforms (field, gain, rolling height, jet, seam), blade + lit edge, flame flicker, straw.
   */
  function schlierenBench(plan, o = {}) {
    const group = new THREE.Group(); group.name = "schlieren";
    group.add(lab());
    const mi = mirror(); group.add(mi);
    const ca = candle(); group.add(ca);
    const kn = knifeEdge(); group.add(kn);
    const la = pinholeLamp(); group.add(la);
    const cam = boxCamera(); group.add(cam);
    const st = straw(); group.add(st);
    stage.scene.add(group);
    const discMat = mi.userData.disc.material;
    discMat.userData.setPuff(plan.cfg.puff.t);
    return {
      group, mirror: mi, disc: mi.userData.disc, candle: ca, knife: kn, lamp: la, camera: cam, straw: st,
      update(t) {
        const u = plan.uniformsAt(t);
        discMat.userData.set(u, t);
        kn.userData.set(u.bladeX, u.cut);
        ca.userData.set(u.flicker);
        st.userData.set(u.strawX, u.strawOn);
      },
    };
  }

  const props = { lab, mirror, discMaterial, candle, flameMaterial, knifeEdge, razorShape, pinholeLamp, boxCamera, straw, caption, schlierenBench };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: plumeplan, motion: plumeplan, flameTip,
  };
}
