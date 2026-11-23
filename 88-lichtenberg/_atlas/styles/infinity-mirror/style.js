// styles/infinity-mirror/style.js — "Infinity Mirror": recursion you can count. The look lives in spec.js; WHEN each
// reflection appears, how dim and green it is, how far the mirrors lean and where the camera flies live in
// recursion.js (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   - the real layer (bulb hoop, figure) is built ONCE; every reflection is one more instance of the same geometry
//     (InstancedMesh, instance n = generation n, matrix T_n from the plan, per-instance tint = reflectance^n x exposure);
//     no render-to-texture, no screen-space tricks, so the camera can fly through it and every frame is f(t);
//   - one unlit HDR material for all of it (vertex colour x instance tint, a limb-darkening term so bulbs read round);
//   - the gallery: a dark wall with a pool of warm light and a hole for the box, a pale frame, a floor, a faint
//     additive sheen for the front glass (all hidden while the camera is inside the tunnel);
//   - overlay caption + generation counter chips (exact colours, drawn after post).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as recursion from "./recursion.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const lin = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };   // linear working colour

/** paint(geo, rgb, order = -1): give every vertex the same HDR colour and switch-on order (-1 = always on). */
function paint(geo, rgb, order = -1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new Float32Array(n * 3), ord = new Float32Array(n).fill(order);
  for (let i = 0; i < n; i++) col.set(rgb, i * 3);
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aOrder", new THREE.BufferAttribute(ord, 1));
  g.deleteAttribute("uv");
  return g;
}

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- the one material of the tunnel
  /** generationMaterial(): unlit HDR, vertex colour x per-instance tint; bulbs with aOrder >= uLit are still off. */
  function generationMaterial() {
    return new THREE.ShaderMaterial({
      name: "generation",
      side: THREE.DoubleSide,   // odd generations are mirror images: their winding is reversed
      uniforms: { uLit: { value: 1e6 }, uLimb: { value: spec.bulbs.limb }, uOff: { value: 0.03 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aOrder; attribute vec3 aTint;
        uniform float uLit; uniform float uOff;
        varying vec3 vCol; varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 p = vec4(position, 1.0);
          vec3 n = normal;
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
            n = mat3(instanceMatrix) * n;
          #endif
          vec4 mv = modelViewMatrix * p;
          vN = mat3(modelViewMatrix) * n;
          vV = -mv.xyz;
          float on = mix(clamp(uLit - aOrder, 0.0, 1.0), 1.0, step(aOrder, -0.5));
          vCol = aColor * aTint * mix(uOff, 1.0, on);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLimb;
        varying vec3 vCol; varying vec3 vN; varying vec3 vV;
        void main() {
          vec3 n = vN / max(length(vN), 1e-6);
          vec3 v = vV / max(length(vV), 1e-6);
          float f = abs(dot(n, v));
          gl_FragColor = vec4(vCol * mix(uLimb, 1.0, f * f), 1.0);
        }`,
    });
  }

  // ---------------------------------------------------------------- real-layer geometry
  /** hoopGeometry(): the slim rounded-rectangle hoop the bulbs sit on (tube swept round recursion.hoopPath). */
  function hoopGeometry() {
    const H = spec.hoop, seg = 160, rad = 8, pts = recursion.hoopPath(H, seg).points;
    const pos = [], nor = [], idx = [];
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
      const a = (j / rad) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), [x, y, nx, ny] = pts[i];
      pos.push(x + nx * c * H.tube, y + ny * c * H.tube, s * H.tube); nor.push(nx * c, ny * c, s);
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
      const a = i * rad + j, b = ((i + 1) % seg) * rad + j, c = ((i + 1) % seg) * rad + ((j + 1) % rad), d = i * rad + ((j + 1) % rad);
      idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return paint(g, lin(P.hoop, spec.hoop.level / 0.04));
  }
  /** bulbsGeometry(plan): every bulb of the hoop in one geometry, colour and switch-on order per bulb. */
  function bulbsGeometry(plan) {
    const B = spec.bulbs;
    return mergeGeometries(plan.bulbs.map((b) => {
      const g = new THREE.SphereGeometry(B.radius, 18, 12);
      g.translate(b.x, b.y, 0);
      return paint(g, lin(P[b.colour], b.colour === "warm" ? B.level : B.colourLevel), b.i);
    }));
  }
  /** figureGeometry(): a small robot, feet at the origin, symmetric front/back (odd generations show its back). */
  function figureGeometry() {
    const F = spec.figure, body = lin(P.figure, F.level), dark = lin(P.figureDark, 1.0), eye = lin(P.eye, F.eyeLevel), tip = lin(P.coral, F.eyeLevel);
    const box = (w, h, d, x, y, z, r, c) => { const g = new RoundedBoxGeometry(w, h, d, 3, r); g.translate(x, y, z); return paint(g, c); };
    const parts = [
      box(0.12, 0.2, 0.14, -0.11, 0.1, 0, 0.03, body), box(0.12, 0.2, 0.14, 0.11, 0.1, 0, 0.03, body),          // legs
      box(0.44, 0.4, 0.24, 0, 0.4, 0, 0.07, body),                                                             // body
      box(0.1, 0.3, 0.12, -0.3, 0.42, 0, 0.04, body), box(0.1, 0.3, 0.12, 0.3, 0.42, 0, 0.04, body),            // arms
      box(0.56, 0.38, 0.3, 0, 0.83, 0, 0.09, body),                                                            // head
      box(0.42, 0.2, 0.32, 0, 0.84, 0, 0.05, dark),                                                            // visor (shows front and back)
      box(0.03, 0.16, 0.03, 0, 1.1, 0, 0.012, body),                                                           // antenna
    ];
    const ball = (r, x, y, z, c) => { const g = new THREE.SphereGeometry(r, 14, 10); g.translate(x, y, z); return paint(g, c); };
    for (const z of [0.15, -0.15]) parts.push(ball(0.055, -0.1, 0.84, z, eye), ball(0.055, 0.1, 0.84, z, eye));
    parts.push(ball(0.06, 0, 1.21, 0, tip));
    parts.push(box(0.2, 0.05, 0.26, 0, 0.42, 0, 0.02, eye));                                                    // chest light band
    const g = mergeGeometries(parts);
    g.scale(F.scale, F.scale, F.scale);
    return g;
  }

  // ---------------------------------------------------------------- the tunnel: one instance per generation
  /**
   * tunnel(plan) -> { group, update(t) } (adds itself to the scene).
   * update(t): instance n of every part gets the plan's T_n (x the part's own pop) and the plan's tint for generation n.
   */
  function tunnel(plan, o = {}) {
    const group = new THREE.Group(); group.name = "infinity-tunnel";
    const count = plan.N + 1, mat = generationMaterial();
    const feet = [spec.figure.x, -spec.hoop.h / 2 + spec.hoop.tube, 0];
    const defs = [
      { id: "hoop", geo: hoopGeometry() },
      { id: "bulbs", geo: bulbsGeometry(plan) },
      ...(o.figure === false ? [] : [{ id: "figure", geo: figureGeometry(), anchor: feet, scale: (n, t) => plan.figureScale(n, t) }]),
    ];
    const parts = defs.map((d) => {
      const mesh = new THREE.InstancedMesh(d.geo, mat, count);
      mesh.name = `generations-${d.id}`; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      tint.setUsage(THREE.DynamicDrawUsage);
      d.geo.setAttribute("aTint", tint);
      group.add(mesh);
      return { ...d, mesh, tint };
    });
    stage.scene.add(group);
    const m4 = new THREE.Matrix4(), loc = new THREE.Matrix4();
    return {
      group, parts, material: mat,
      update(t) {
        mat.uniforms.uLit.value = plan.lit(t);
        for (let n = 0; n < count; n++) {
          const T = plan.matrix(n, t), c = plan.tint(n, t);
          for (const p of parts) {
            m4.set(...T);
            if (p.anchor) {
              const s = Math.max(0, p.scale(n, t));
              loc.makeScale(s, s, s).setPosition(p.anchor[0], p.anchor[1], p.anchor[2]);
              m4.multiply(loc);
            }
            p.mesh.setMatrixAt(n, m4);
            p.tint.setXYZ(n, c[0], c[1], c[2]);
          }
        }
        for (const p of parts) { p.mesh.instanceMatrix.needsUpdate = true; p.tint.needsUpdate = true; }
      },
    };
  }

  // ---------------------------------------------------------------- the gallery: wall, floor, frame, glass
  function poolMaterial(base, { floor = false, level = 1 } = {}) {
    const G = spec.gallery, A = spec.aperture;
    return new THREE.ShaderMaterial({
      name: floor ? "gallery-floor" : "gallery-wall",
      uniforms: {
        uBase: { value: new THREE.Color(base) }, uPoolCol: { value: new THREE.Color(P.wallPool) },
        uC: { value: new THREE.Vector2(...(floor ? [0, G.wallZ + 1.2] : G.pool.centre)) }, uR: { value: G.pool.radius * (floor ? 0.8 : 1) },
        uPool: { value: G.pool.level * level }, uAmb: { value: G.pool.ambient },
        uHalf: { value: new THREE.Vector2(A.w / 2 + G.frame.bar, A.h / 2 + G.frame.bar) },
        uSpill: { value: floor ? 0 : G.spill.level }, uReach: { value: G.spill.reach }, uSpillCol: { value: new THREE.Color(G.spill.colour) },
        uGlow: { value: 1 }, uFloor: { value: floor ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uFloor; varying vec2 vP;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = mix(w.xy, w.xz, uFloor); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase, uPoolCol, uSpillCol; uniform vec2 uC, uHalf;
        uniform float uR, uPool, uAmb, uSpill, uReach, uGlow;
        varying vec2 vP;
        void main() {
          vec2 q = (vP - uC) / uR;
          float pool = exp(-dot(q, q) * 1.6);
          vec3 col = uBase * (uAmb + uPool * pool * uPoolCol);
          float e = length(max(abs(vP) - uHalf, 0.0));
          col += uSpillCol * uSpill * uGlow * exp(-e / uReach);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }
  /**
   * gallery() -> { group, update({ on, glass, glow }) } (adds itself to the scene): the wall with the box's aperture cut
   * out, the frame, the floor and the glass sheen. on = 0 hides it all (camera inside the tunnel).
   */
  function gallery() {
    const G = spec.gallery, A = spec.aperture, D = spec.cavity.depth;
    const group = new THREE.Group(); group.name = "gallery";
    const shape = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector2((x * G.wallW) / 2, (y * G.wallH) / 2)));
    shape.holes.push(new THREE.Path([[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([x, y]) => new THREE.Vector2((x * A.w) / 2, (y * A.h) / 2))));
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape), poolMaterial(P.wall));
    wall.position.z = G.wallZ; wall.name = "wall"; group.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(G.wallW, 40), poolMaterial(P.floor, { floor: true, level: G.floorLevel }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, G.floorY, G.wallZ + 20); floor.name = "floor"; group.add(floor);
    // frame: four bars from the wall to a little in front of the glass
    const b = G.frame.bar, zf = G.frame.front, dz = zf - G.wallZ, zc = G.wallZ + dz / 2;
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), materials.frame); m.position.set(x, y, zc); m.name = "frame-bar"; group.add(m); };
    bar(A.w + 2 * b, b, 0, A.h / 2 + b / 2); bar(A.w + 2 * b, b, 0, -A.h / 2 - b / 2);
    bar(b, A.h, -A.w / 2 - b / 2, 0); bar(b, A.h, A.w / 2 + b / 2, 0);
    // the box's side walls between the wall plane and the glass, seen from inside the aperture at an angle
    const liner = new THREE.MeshBasicMaterial({ color: 0x050506 });
    const lin4 = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, G.wallZ + D / 2), liner); m.position.set(x, y, (G.wallZ - D / 2) / 2); group.add(m); };
    lin4(A.w + 2 * b, 0.02, 0, A.h / 2 + 0.01); lin4(A.w + 2 * b, 0.02, 0, -A.h / 2 - 0.01);
    lin4(0.02, A.h, -A.w / 2 - 0.01, 0); lin4(0.02, A.h, A.w / 2 + 0.01, 0);
    // the half-silvered glass: only a faint sheen (soft diagonal reflections of the room, a cool edge)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(A.w, A.h), new THREE.ShaderMaterial({
      name: "front-glass", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uLevel: { value: G.glass.level }, uStreaks: { value: G.glass.streaks }, uEdge: { value: G.glass.edge }, uTint: { value: new THREE.Color(P.glassTint) }, uOn: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uLevel, uStreaks, uEdge, uOn; uniform vec3 uTint; varying vec2 vUv;
        void main() {
          float d = vUv.x * 1.9 + vUv.y * 0.9;
          float s = 0.5 + 0.5 * sin(d * uStreaks + 0.6);
          float band = s * s * s * (0.35 + 0.65 * vUv.y);
          vec2 e = min(vUv, 1.0 - vUv);
          float edge = exp(-min(e.x * 2.07, e.y) / 0.035);
          gl_FragColor = vec4(uTint * (uLevel * band + uEdge * edge) * uOn, 1.0);
        }`,
    }));
    glass.position.z = D / 2; glass.name = "front-glass"; glass.renderOrder = 5; group.add(glass);
    stage.scene.add(group);
    return {
      group, wall, floor, glass,
      update({ on = 1, glass: gl = 1, glow = 1 } = {}) {
        group.visible = on > 0.001;
        glass.visible = gl > 0.001;
        glass.material.uniforms.uOn.value = gl;
        wall.material.uniforms.uGlow.value = glow;
      },
    };
  }

  // ---------------------------------------------------------------- overlay chips
  const chipFont = FONTS[spec.text.font] ?? spec.text.font;
  /** caption() -> overlay chip, bottom centre; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o }, Wp = Q.maxW + 24, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${chipFont}`;
      const tw = Math.round(x.measureText(st.text).width), pad = Math.round(Q.cap * 0.8);
      const pw = Math.min(W - 12, tw + 2 * pad), ph = Q.h, ox = Math.round((W - pw) / 2), oy = 6;
      x.fillStyle = P.chip; x.globalAlpha = 0.9; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill(); x.globalAlpha = 1;
      x.strokeStyle = P.chipEdge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, ph / 2 - 1); x.stroke();
      x.fillStyle = P.ink; x.textBaseline = "middle"; x.textAlign = "center";
      x.fillText(st.text, W / 2, oy + ph / 2 + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Math.round((stage.width - Wp) / 2), Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** counter() -> overlay chip, bottom right: a small label and the generation count; userData.show({ label, n } | null) */
  function counter(o = {}) {
    const Q = { ...spec.counter, ...o }, Wp = Q.w, Hp = Q.h + 12;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.label) return;
      const ph = Q.h, oy = 6, num = String(st.n).padStart(2, "0");
      x.font = `700 ${Q.cap}px ${FONTS.mono}`;
      const nw = Math.round(x.measureText("00").width);
      x.font = `600 ${Math.round(Q.cap * 0.62)}px ${chipFont}`;
      const lw = Math.round(x.measureText(st.label).width), pad = 26, pw = pad + lw + 16 + nw + pad, ox = W - pw - 4;
      x.fillStyle = P.chip; x.globalAlpha = 0.9; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill(); x.globalAlpha = 1;
      x.strokeStyle = P.chipEdge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      x.textBaseline = "middle"; x.textAlign = "left";
      x.fillStyle = P.green; x.fillText(st.label, ox + pad, oy + ph / 2 + 2);
      x.font = `700 ${Q.cap}px ${FONTS.mono}`;
      x.fillStyle = P.ink; x.fillText(num, ox + pad + lw + 16, oy + ph / 2 + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(stage.width - Q.right - Wp, Q.y);
    mesh.userData.show = (c) => { mesh.userData.set(c ? { label: c.label, n: c.n } : { label: "" }); mesh.userData.opacity(c ? 1 : 0); };
    return mesh;
  }

  const props = { tunnel, gallery, caption, counter, hoopGeometry, bulbsGeometry, figureGeometry, generationMaterial };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: recursion, motion: recursion,
  };
}
