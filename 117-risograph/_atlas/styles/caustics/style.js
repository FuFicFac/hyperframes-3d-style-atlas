// styles/caustics/style.js — "Caustics": a lumpy aqua glass slab in a slim steel frame on a vertical brass rail above a
// white table, a warm beam straight down through it, and the light pattern it casts. The look lives in spec.js; the optics
// (target picture, stirring, ray mesh, glass normals, glass height over time, sound events) live in caustic.js, a
// THREE-free planner shared with SCORE. This file turns the plan into pictures:
//   * causticEngine(plan): ONE draw call per frame. The ray mesh (R x R nodes) is drawn into a half-float target with
//     additive blending; its vertex shader places node i at glass point + s * deflection (s = height / focus height) and
//     its fragment shader writes |det d(glass point)/d(table pixel)| — the light that fell on this bit of glass divided by
//     the area it covers on the table — so brightness is conserved per triangle and folds add up into caustic lines.
//   * the table's material reads that target (4 bilinear taps = the light blur) and adds it as warm light.
//   * the slab: a displaced top (height field integrated from the deflection), a normal map from the SAME deflection
//     (fresnel glass: aqua tint, bright rim), teal edges that glow when light pipes through, a steel frame on pivot pins,
//     a fork + brass carriage on the rail, the lamp head and a faint beam shaft.
//   * an overlay caption chip with exact colours.
// Props never animate themselves: the scene calls bench.update(t) and rig.update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fresnelGlass } from "../../kit/materials.js";
import { uploadTexture } from "../../kit/textures.js";
import { newCanvas } from "../../kit/canvas.js";
import * as caustic from "./caustic.js";
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
  const O = spec.optic, RG = spec.rig, LK = spec.look;
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; };
  const cylY = (r, h, mat, seg = 32) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat));
  const base = { sky: lights.sky.intensity, sun: lights.sun.intensity, fill: lights.fill.intensity, window: lights.window.intensity, env: stage.scene.environmentIntensity ?? 1 };

  // ---------------------------------------------------------------- caustic engine: ray mesh -> half-float target
  /** causticEngine(plan) -> { rt, mesh, render(s), uv: { scale } }: draws the warped ray mesh into rt (picture square at centre) */
  function causticEngine(plan) {
    const size = O.rt, M = O.margin, R = plan.R;
    const rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, samples: O.samples,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    rt.texture.name = "caustic-light";
    const pos = new Float32Array(3 * R * R);
    for (let k = 0; k < R * R; k++) { pos[3 * k] = plan.src[2 * k]; pos[3 * k + 1] = plan.src[2 * k + 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aDef", new THREE.BufferAttribute(plan.def, 2));
    geo.setIndex(new THREE.BufferAttribute(plan.index, 1));
    const mat = new THREE.ShaderMaterial({
      name: "causticRays",
      uniforms: { uS: { value: 0 }, uNdc: { value: 2 / M }, uPx: { value: size / M }, uCap: { value: O.cap } },
      vertexShader: /* glsl */ `
        attribute vec2 aDef;
        uniform float uS, uNdc, uPx;
        varying vec2 vSrc;
        void main() {
          vec2 p = position.xy + uS * aDef;          // where this ray lands on the table (picture units)
          vSrc = position.xy * uPx;                  // where it left the glass, in target pixels
          gl_Position = vec4(p * uNdc, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uCap;
        varying vec2 vSrc;
        void main() {
          // glass area per table pixel = |det of d(glass point) / d(pixel)|: light conserved per triangle (all pixels run this)
          vec2 a = dFdx(vSrc), b = dFdy(vSrc);
          float j = abs(a.x * b.y - a.y * b.x);
          gl_FragColor = vec4(min(j, uCap), 0.0, 0.0, 1.0);
        }`,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.name = "caustic-ray-mesh";
    const scene = new THREE.Scene();
    scene.add(mesh);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    const black = new THREE.Color(0, 0, 0), keep = new THREE.Color();
    function render(s) {
      const r = stage.renderer;
      mat.uniforms.uS.value = s;
      const prevT = r.getRenderTarget(), prevA = r.getClearAlpha();
      r.getClearColor(keep);
      r.setRenderTarget(rt);
      r.setClearColor(black, 0);
      r.clear(true, false, false);
      r.render(scene, cam);
      r.setRenderTarget(prevT);
      r.setClearColor(keep, prevA);
    }
    return { rt, mesh, render, scale: 1 / (O.W * M) };
  }

  // ---------------------------------------------------------------- room: white table (caustic-lit) + pale wall
  /** tableMaterial(engine) -> MeshStandardMaterial that adds the caustic light; userData.u = { uBeam } */
  function tableMaterial(engine) {
    const T = spec.set.table;
    const m = new THREE.MeshStandardMaterial({ color: P.table, roughness: T.roughness, metalness: 0 });
    m.name = "table";
    const U = {
      uCaus: { value: engine.rt.texture }, uBeam: { value: 0 }, uBeamCol: { value: new THREE.Color(P.beam) },
      uMap: { value: new THREE.Vector4(engine.scale, O.blur / O.rt, 0, 0) },
    };
    m.userData.u = U;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCauW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vCauW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCauW;\nuniform sampler2D uCaus;\nuniform float uBeam;\nuniform vec3 uBeamCol;\nuniform vec4 uMap;")
        .replace("#include <opaque_fragment>", `
          vec2 cuv = vec2(vCauW.x, -vCauW.z) * uMap.x + 0.5;
          float co = uMap.y;
          float cau = 0.25 * (texture2D(uCaus, cuv + vec2(co, co)).r + texture2D(uCaus, cuv + vec2(-co, co)).r
                           + texture2D(uCaus, cuv + vec2(co, -co)).r + texture2D(uCaus, cuv + vec2(-co, -co)).r);
          float cin = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
          outgoingLight += diffuseColor.rgb * uBeamCol * (uBeam * cau * cin);
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => "caustics-table-1";
    return m;
  }

  /** room(engine) -> Group: the white table (top lit by the caustic) and the pale back wall with a soft window glow */
  function room(engine) {
    const g = new THREE.Group(); g.name = "room";
    const T = spec.set.table, Wl = spec.set.wall;
    const top = tableMaterial(engine);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(T.w, T.thick, T.d), [materials.tableEdge, materials.tableEdge, top, materials.tableEdge, materials.tableEdge, materials.tableEdge]);
    tb.position.set(0, -T.thick / 2, T.z); tb.receiveShadow = true; tb.name = "table";
    g.add(tb);
    const wallMat = new THREE.ShaderMaterial({
      name: "wall",
      uniforms: {
        uBase: { value: new THREE.Color(Wl.base) }, uGlow: { value: new THREE.Color(Wl.glow) }, uShade: { value: new THREE.Color(Wl.shade) },
        uC: { value: new THREE.Vector2(...Wl.glowAt) }, uR: { value: new THREE.Vector2(...Wl.glowR) }, uRoom: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase, uGlow, uShade; uniform vec2 uC, uR; uniform float uRoom; varying vec3 vW;
        void main() {
          vec2 d = (vW.xy - uC) / uR;
          float k = exp(-dot(d, d));
          vec3 c = mix(mix(uShade, uBase, smoothstep(-0.2, 1.4, vW.y)), uGlow, k);
          gl_FragColor = vec4(c * uRoom, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(Wl.w, Wl.h), wallMat);
    wall.position.set(0, Wl.h / 2 - 0.4, Wl.z); wall.name = "wall";
    g.add(wall);
    g.userData = { table: tb, tableMat: top, wallMat };
    return g;
  }

  // ---------------------------------------------------------------- the glass's own reflection environment
  /** windowEnv() -> PMREM texture of a pale room with a big mullioned window behind the bench (baked once). The lumpy
   *  top reflects it, so the lumps read as a wobbling window — a plain white table shows nothing through clear glass. */
  let windowEnvTex = null;
  function windowEnv() {
    if (windowEnvTex) return windowEnvTex;
    const E = spec.reflect;
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(14, 8, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(E.room).multiplyScalar(E.roomLevel), side: THREE.BackSide })));
    const cw = 512, ch = 384, c = newCanvas(cw, ch), x = c.getContext("2d");
    x.fillStyle = "#000000"; x.fillRect(0, 0, cw, ch);
    const cols = E.panes[0], rows = E.panes[1], m = E.mullion * cw;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x0 = (i / cols) * cw + m / 2, y0 = (j / rows) * ch + m / 2, w = cw / cols - m, h = ch / rows - m;
      const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, E.skyTop); g.addColorStop(1, E.skyLow);
      x.fillStyle = g; x.fillRect(x0, y0, w, h);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(E.size[0], E.size[1]), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(E.level), toneMapped: false }));
    win.position.set(...E.pos); win.lookAt(0, E.pos[1] * 0.4, 0);
    env.add(win);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(E.lamp.size, E.lamp.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(E.lamp.color).multiplyScalar(E.lamp.level), toneMapped: false }));
    lamp.position.set(0, E.lamp.y, 0); lamp.rotation.x = Math.PI / 2;
    env.add(lamp);
    const pmrem = new THREE.PMREMGenerator(stage.renderer);
    windowEnvTex = pmrem.fromScene(env, E.sigma, 0.1, 50).texture;
    pmrem.dispose(); tex.dispose();
    return windowEnvTex;
  }

  // ---------------------------------------------------------------- the glass slab
  /** glassSlab(plan) -> Group centred on the slab's mid-thickness: displaced top (normal map from the deflection), edges */
  function glassSlab(plan) {
    const g = new THREE.Group(); g.name = "glass";
    const W = O.W, th = O.thick, Ng = plan.Ng, N = plan.N;
    const nTex = new THREE.DataTexture(plan.normals, Ng, Ng, THREE.RGBAFormat, THREE.UnsignedByteType);
    nTex.colorSpace = THREE.NoColorSpace;
    nTex.minFilter = THREE.LinearFilter; nTex.magFilter = THREE.LinearFilter; nTex.generateMipmaps = false;
    nTex.needsUpdate = true;
    uploadTexture(stage, nTex);
    const GL = LK.glass;
    const topMat = fresnelGlass({
      color: GL.color, alphaFace: GL.alphaFace, alphaRim: GL.alphaRim, fresnelPower: GL.fresnelPower, rim: GL.rim,
      rimStrength: GL.rimStrength, innerGlow: GL.innerGlow, toLight: GL.toLight, envIntensity: GL.envIntensity,
    });
    topMat.name = "glassTop";
    topMat.normalMap = nTex; topMat.normalScale.set(GL.normalScale, GL.normalScale);
    topMat.envMap = windowEnv(); topMat.envMapIntensity = GL.envIntensity;
    // top: a plane displaced by the integrated height field (bilinear), flat geometric normals (the normal map shades it)
    const seg = 96;
    const geo = new THREE.PlaneGeometry(W, W, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position, uv = geo.attributes.uv;
    const hAt = (u, v) => {
      const fx = u * (N - 1), fy = v * (N - 1);
      const i0 = Math.min(Math.floor(fx), N - 2), j0 = Math.min(Math.floor(fy), N - 2), ax = fx - i0, ay = fy - j0, q = (i, j) => plan.heights[j * N + i];
      return (1 - ay) * ((1 - ax) * q(i0, j0) + ax * q(i0 + 1, j0)) + ay * ((1 - ax) * q(i0, j0 + 1) + ax * q(i0 + 1, j0 + 1));
    };
    for (let k = 0; k < pa.count; k++) {
      const u = uv.getX(k), v = uv.getY(k);
      const edgeFade = Math.min(1, Math.min(u, 1 - u, v, 1 - v) / 0.04);
      pa.setY(k, th / 2 + RG.bumpHeight * hAt(u, v) * edgeFade);
    }
    pa.needsUpdate = true;
    const top = new THREE.Mesh(geo, topMat);
    top.name = "glass-top"; top.renderOrder = 2;
    g.add(top);
    // edges: opaque teal sides (thick glass looks dark green-teal edge-on) that glow when the beam pipes light through
    const E = LK.edge;
    const edgeMat = new THREE.MeshPhysicalMaterial({ color: E.color, roughness: E.roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color(E.emissive), emissiveIntensity: 0 });
    edgeMat.name = "glassEdge";
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const edges = new THREE.Mesh(new THREE.BoxGeometry(W, th, W), [edgeMat, edgeMat, hidden, hidden, edgeMat, edgeMat]);
    edges.name = "glass-edges";
    g.add(edges);
    // underside: a faint tinted pane (seen when the camera is below the slab)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(Math.PI / 2), topMat);
    under.position.y = -th / 2; under.name = "glass-under"; under.renderOrder = 1;
    g.add(under);
    g.userData = { topMat, edgeMat, normalTex: nTex };
    return g;
  }

  // ---------------------------------------------------------------- frame, fork, carriage, rail, lamp, shaft
  /** frame() -> Group of four steel bars around the slab + two brass pivot pins (centred on the slab's mid-thickness) */
  function frame() {
    const g = new THREE.Group(); g.name = "frame";
    const F = RG.frame, FK = RG.fork, W = O.W;
    const off = W / 2 + F.gap + F.bar / 2;
    g.add(box(F.bar, F.h, W + 2 * F.gap + 2 * F.bar, materials.steel, -off, 0, 0));
    g.add(box(F.bar, F.h, W + 2 * F.gap + 2 * F.bar, materials.steel, off, 0, 0));
    g.add(box(W + 2 * F.gap, F.h, F.bar, materials.steel, 0, 0, -off));
    g.add(box(W + 2 * F.gap, F.h, F.bar, materials.steel, 0, 0, off));
    for (const sx of [-1, 1]) {
      const pin = shadow(new THREE.Mesh(new THREE.CylinderGeometry(FK.pinR, FK.pinR, FK.pinL, 20), materials.brass));
      pin.rotation.z = Math.PI / 2;
      pin.position.set(sx * (W / 2 + F.gap + F.bar + FK.pinL / 2), 0, 0);
      g.add(pin);
    }
    return g;
  }
  /** carriageFork() -> Group: two fork arms from the pins back to a cross bar behind the frame, which runs to the brass
   *  carriage on the rail (the rail stands at the back-left corner, clear of the light square) + a clamp knob */
  function carriageFork() {
    const g = new THREE.Group(); g.name = "carriage";
    const F = RG.frame, FK = RG.fork, RL = RG.rail, C = RG.carriage, W = O.W;
    const ax = W / 2 + F.gap + F.bar + FK.pinL + FK.w / 2;
    const z0 = 0.03, z1 = RL.z, len = z0 - z1;
    for (const sx of [-1, 1]) g.add(box(FK.w, FK.h, len, materials.steel, sx * ax, 0, (z0 + z1) / 2));
    const x0 = RL.x, x1 = ax + FK.w / 2;
    g.add(box(x1 - x0, FK.h, FK.w, materials.steel, (x0 + x1) / 2, 0, z1));
    g.add(box(C.w, C.h, C.d, materials.brass, RL.x, 0, RL.z));
    const knob = shadow(new THREE.Mesh(new THREE.CylinderGeometry(C.knobR, C.knobR, 0.03, 24), materials.knob));
    knob.rotation.z = Math.PI / 2; knob.position.set(RL.x - C.w / 2 - 0.015, 0, RL.z);
    g.add(knob);
    return g;
  }
  /** standAndLamp() -> Group: base disc, brass rail, lamp arm, lamp head with a warm diffuser panel */
  function standAndLamp() {
    const g = new THREE.Group(); g.name = "stand";
    const RL = RG.rail, LP = RG.lamp, W = O.W;
    const baseD = cylY(RL.baseR, RL.baseH, materials.darkSteel, 40); baseD.position.set(RL.x, RL.baseH / 2, RL.z); g.add(baseD);
    const rod = cylY(RL.r, RL.top, materials.brass, 24); rod.position.set(RL.x, RL.top / 2, RL.z); g.add(rod);
    const armY = Math.min(LP.y + LP.h / 2 + LP.armR, RL.top - LP.armR);
    const armLen = Math.hypot(RL.x, RL.z);
    const arm = shadow(new THREE.Mesh(new THREE.CylinderGeometry(LP.armR, LP.armR, armLen, 16), materials.brass));
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-RL.x, 0, -RL.z).normalize());
    arm.position.set(RL.x / 2, armY, RL.z / 2); g.add(arm);
    g.add(box(LP.w, LP.h, LP.w, materials.lampBody, 0, LP.y, 0));
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(LP.panel) });
    panelMat.name = "lampPanel";
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.02, W + 0.02).rotateX(Math.PI / 2), panelMat);
    panel.position.set(0, LP.y - LP.h / 2 - 0.001, 0); panel.name = "lamp-panel";
    g.add(panel);
    g.userData = { panelMat, panelY: LP.y - LP.h / 2 - 0.002 };
    return g;
  }
  /** rayLines(plan) -> LineSegments: a sample of the plan's own rays (glass bottom -> where they land on the table),
   *  additive and faint; userData.set(d, level) rewrites the endpoints from the glass height (no state kept) */
  function rayLines(plan) {
    const RL = spec.rays.lines, R = plan.R, W = O.W, n = RL.grid;
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gi = Math.round(((i + 0.5) / n) * (R - 1)), gj = Math.round(((j + 0.5) / n) * (R - 1));
      idx.push(gj * R + gi);
    }
    const pos = new Float32Array(idx.length * 6), col = new Float32Array(idx.length * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const c = new THREE.Color(RL.color);
    for (let k = 0; k < idx.length; k++) {
      col.set([c.r * RL.top, c.g * RL.top, c.b * RL.top, c.r, c.g, c.b], 6 * k);
    }
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.name = "rayLines";
    const lines = new THREE.LineSegments(geo, mat);
    lines.name = "ray-lines"; lines.frustumCulled = false; lines.renderOrder = 4;
    lines.userData.set = (d, level) => {
      const s = d / plan.dFocus;
      for (let k = 0; k < idx.length; k++) {
        const q = 2 * idx[k], sx = plan.src[q], sy = plan.src[q + 1], dx = plan.def[q], dy = plan.def[q + 1];
        pos.set([sx * W, d, -sy * W, (sx + s * dx) * W, 0.0015, -(sy + s * dy) * W], 6 * k);
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = RL.opacity * level;
      lines.visible = level > 0.002;
    };
    lines.userData.set(0, 0);
    return lines;
  }
  /** beamShaft() -> unit box (scaled per frame) with a soft-edged additive glow */
  function beamShaft() {
    const S = RG.shaft;
    const mat = new THREE.ShaderMaterial({
      name: "beamShaft",
      uniforms: { uCol: { value: new THREE.Color(S.color) }, uA: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vL; void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; uniform float uA; varying vec3 vL;
        void main() {
          float e = smoothstep(0.5, 0.36, max(abs(vL.x), abs(vL.z)));
          float fall = mix(1.0, 0.55, vL.y + 0.5);
          gl_FragColor = vec4(uCol * (uA * e * fall), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.name = "beam-shaft"; m.renderOrder = 3; m.frustumCulled = false;
    return m;
  }

  // ---------------------------------------------------------------- overlay caption chip (top right, exact colours)
  /** caption() -> overlay chip (ivory plate, small sun glyph, dark text), right-aligned; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.5), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad + 4), ph = Q.h, ox = W - 10 - pw, oy = 6;
      x.fillStyle = "rgba(40,50,60,0.28)"; x.beginPath(); x.roundRect(ox + 3, oy + 6, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.fillStyle = Q.accent; x.beginPath(); x.roundRect(ox, oy + ph - 8, pw, 8, [0, 0, 16, 16]); x.fill();
      // glyph: a small sun (disc + 8 rays) inside a teal square "glass"
      const cx = ox + pad + ic / 2, cy = oy + ph / 2 - 3, rr = ic / 2;
      x.strokeStyle = Q.icon; x.lineWidth = 3; x.beginPath(); x.roundRect(cx - rr, cy - rr, 2 * rr, 2 * rr, 6); x.stroke();
      x.fillStyle = Q.accent; x.beginPath(); x.arc(cx, cy, rr * 0.36, 0, Math.PI * 2); x.fill();
      x.strokeStyle = Q.accent; x.lineWidth = 3.2; x.lineCap = "round";
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
        x.beginPath(); x.moveTo(cx + c * rr * 0.55, cy + s * rr * 0.55); x.lineTo(cx + c * rr * 0.78, cy + s * rr * 0.78); x.stroke();
      }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) - 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.right - Wp, Q.y - 6);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * causticBench(plan) -> { group, engine, room, glass, frame, carriage, stand, shaft, update(t) } (adds itself to the scene)
   *   update(t): glass height + tilt from the plan, caustic target (one draw), beam level on the table, lamp panel, shaft,
   *   edge glow, room-light dip.
   */
  function causticBench(plan) {
    const group = new THREE.Group(); group.name = "caustics";
    const engine = causticEngine(plan);
    const rm = room(engine); group.add(rm);
    const car = carriageFork(); group.add(car);
    const tiltG = new THREE.Group(); tiltG.name = "tilt"; tiltG.position.y = O.thick / 2; car.add(tiltG);
    car.children.forEach((c) => { if (c !== tiltG) c.position.y += O.thick / 2; });
    const gl = glassSlab(plan); gl.children.forEach((c) => { c.castShadow = false; c.receiveShadow = false; }); tiltG.add(gl);
    const fr = frame(); tiltG.add(fr);
    const st = standAndLamp(); group.add(st);
    const sh = beamShaft(); group.add(sh);
    const rl = rayLines(plan); group.add(rl);
    stage.scene.add(group);
    const tableU = rm.userData.tableMat.userData.u;
    const panelCol = new THREE.Color(RG.lamp.panel), glowCol = new THREE.Color(LK.glass.color);
    return {
      group, engine, room: rm, glass: gl, frame: fr, carriage: car, stand: st, shaft: sh, rays: rl,
      update(t) {
        const d = plan.heightAt(t), s = d / plan.dFocus, beam = plan.beamAt(t), roomK = plan.roomAt(t);
        car.position.y = d;
        tiltG.rotation.x = plan.tiltAt(t);
        engine.render(s);
        tableU.uBeam.value = O.beam * beam;
        // lamp diffuser + shaft from the lamp down to the glass top
        st.userData.panelMat.color.copy(panelCol).multiplyScalar(0.55 + 2.2 * beam);
        const yTop = d + O.thick + 0.004, yLamp = st.userData.panelY;
        sh.scale.set(O.W, Math.max(0.01, yLamp - yTop), O.W);
        sh.position.set(0, (yLamp + yTop) / 2, 0);
        sh.material.uniforms.uA.value = RG.shaft.opacity * beam;
        sh.visible = beam > 0.001;
        rl.userData.set(d, beam * plan.raysAt(t));
        // light piping into the slab's edges, a little inner glow
        gl.userData.edgeMat.emissiveIntensity = LK.edge.glow * beam;
        gl.userData.topMat.envMapIntensity = LK.glass.envIntensity * plan.sheenAt(t);
        gl.userData.topMat.userData.glass.uGlow.value.copy(glowCol).multiplyScalar(LK.glass.innerGlow * (0.4 + 0.9 * beam));
        // room light dips so the picture glows
        lights.sky.intensity = base.sky * roomK;
        lights.sun.intensity = base.sun * roomK;
        lights.fill.intensity = base.fill * roomK;
        lights.window.intensity = base.window * roomK;
        stage.scene.environmentIntensity = base.env * (0.45 + 0.55 * roomK);
        rm.userData.wallMat.uniforms.uRoom.value = 0.35 + 0.65 * roomK;
      },
    };
  }

  const props = { causticEngine, tableMaterial, room, windowEnv, glassSlab, frame, carriageFork, standAndLamp, rayLines, beamShaft, caption, causticBench };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: caustic, motion: caustic,
  };
}
