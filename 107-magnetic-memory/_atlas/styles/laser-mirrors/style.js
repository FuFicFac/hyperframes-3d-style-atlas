// styles/laser-mirrors/style.js — "Laser & Mirrors": an optics bench whose beam is traced exactly by beamplan.js.
//   - bench: anodised breadboard (hole-grid canvas texture), beam-stop rails on three sides;
//   - laser head, swivelling mirrors on posts (router mirror in brass with a pointer), drum targets with name plates,
//     a triangular glass splitter on a piston;
//   - beams: a pool of camera-facing additive ribbons (white-hot core + coloured halo + slow haze shimmer), a wide soft
//     spill of the same colour on the bench under each segment, glow sprites at hit points and at the growing head;
//   - an overlay caption chip (exact colours) that never leaves; only its text fades.
// Props never animate themselves: the scene calls bench.update(t), which poses everything from plan.*(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { shadowAll } from "../../kit/core.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture, blobTexture } from "../../kit/textures.js";
import * as beamplan from "./beamplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const BEAM_VERT = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform float uHalf; uniform float uY;
varying vec2 vP; varying float vLen;
void main() {
  float u = position.x, v = position.y;
#ifdef FLAT
  vec3 d = uB - uA; float len = length(d); vec3 dn = d / max(len, 1e-5);
  vec3 sd = vec3(-dn.z, 0.0, dn.x);
  float along = mix(-uHalf, len + uHalf, u);
  vec3 p = uA + dn * along + sd * (v * uHalf); p.y = uY;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
#else
  vec3 a = (viewMatrix * vec4(uA, 1.0)).xyz, b = (viewMatrix * vec4(uB, 1.0)).xyz;
  vec3 d = b - a; float len = length(d); vec3 dn = d / max(len, 1e-5);
  vec3 mid = (a + b) * 0.5; vec3 mv = mid / max(length(mid), 1e-5);
  vec3 sd = cross(dn, mv); float sl = length(sd); sd = sl > 1e-5 ? sd / sl : vec3(0.0, 1.0, 0.0);
  float along = mix(-uHalf, len + uHalf, u);
  vec3 p = a + dn * along + sd * (v * uHalf);
  gl_Position = projectionMatrix * vec4(p, 1.0);
#endif
  vP = vec2(along, v * uHalf); vLen = len;
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uHalf; uniform float uLevel; uniform float uT; uniform float uPhase;
uniform float uCoreK; uniform float uCore; uniform float uHalo; uniform float uHaze;
varying vec2 vP; varying float vLen;
void main() {
  float dx = max(max(-vP.x, vP.x - vLen), 0.0);
  float d = length(vec2(dx, vP.y)) / uHalf;
  float edge = 1.0 - smoothstep(0.7, 1.0, d);
#ifdef FLAT
  vec3 col = uColor * exp(-d * d * 3.2) * uHalo;
#else
  float hz = 1.0 + uHaze * sin(vP.x * 7.0 + uT * 2.6 + uPhase) * sin(vP.x * 2.9 - uT * 1.1 + uPhase * 1.7);
  vec3 col = uColor * exp(-d * d * 5.0) * uHalo * hz + mix(uColor, vec3(1.0), 0.82) * exp(-d * d * uCoreK) * uCore;
#endif
  gl_FragColor = vec4(col * edge * uLevel, 1.0);
}`;

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const W3 = (p, y = 0) => new THREE.Vector3(p[0], y, -p[1]);
  const Y = spec.beamY;
  const colorOf = (name) => new THREE.Color(spec.beamColors[name] ?? name);
  const blob = blobTexture();
  const cyl = (r, h, mat, seg = 28) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // ---------------------------------------------------------------- bench
  /** bench(bounds) -> Group: breadboard top (y = 0), dark sides, beam-stop rails (tall back/left/right, low front) */
  function bench(bounds, o = {}) {
    const Q = { ...spec.bench, ...o }, g = new THREE.Group();
    const w = bounds.x1 - bounds.x0 + 2 * Q.margin, d = bounds.y1 - bounds.y0 + 2 * Q.margin;
    const cx = (bounds.x0 + bounds.x1) / 2, cz = -(bounds.y0 + bounds.y1) / 2;
    const ppm = Q.pxPerMetre, cw = Math.round(w * ppm), ch = Math.round(d * ppm);
    const c = makeCanvas(cw, ch), x = c.getContext("2d");
    x.fillStyle = P.bench; x.fillRect(0, 0, cw, ch);
    const gr = x.createLinearGradient(0, 0, cw, ch);
    gr.addColorStop(0, "rgba(255,255,255,0.07)"); gr.addColorStop(0.5, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,0.09)");
    x.fillStyle = gr; x.fillRect(0, 0, cw, ch);
    const nx = Math.floor(w / Q.holePitch), nz = Math.floor(d / Q.holePitch), r = Q.holeR * ppm;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const px = cw / 2 + (i - nx / 2) * Q.holePitch * ppm, py = ch / 2 + (j - nz / 2) * Q.holePitch * ppm;
      x.fillStyle = "rgba(255,255,255,0.16)"; x.beginPath(); x.arc(px + 1.5, py + 2, r * 1.25, 0, Math.PI * 2); x.fill();
      x.fillStyle = P.benchHole; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: canvasTexture(c, { srgb: true, anisotropy: 8 }), roughness: 0.62, metalness: 0.2 }));
    top.rotation.x = -Math.PI / 2; top.position.set(cx, 0, cz); top.receiveShadow = true;
    const slab = box(w, Q.thickness, d, materials.benchSide); slab.position.set(cx, -Q.thickness / 2 - 0.002, cz); slab.receiveShadow = true;
    g.add(top, slab);
    const rail = (rw, rh, rd, px, pz) => { const m = box(rw, rh, rd, materials.rail); m.position.set(px, rh / 2, pz); m.castShadow = m.receiveShadow = true; g.add(m); };
    const T = Q.railT, bw = bounds.x1 - bounds.x0, bd = bounds.y1 - bounds.y0;
    rail(bw + 2 * T, Q.railH, T, cx, -bounds.y1 - T / 2);
    rail(bw + 2 * T, Q.railFrontH, T, cx, -bounds.y0 + T / 2);
    rail(T, Q.railH, bd, bounds.x0 - T / 2, cz);
    rail(T, Q.railH, bd, bounds.x1 + T / 2, cz);
    return g;
  }

  // ---------------------------------------------------------------- laser head
  /** laser({ p, dir }) -> Group at the nozzle tip, firing along dir; userData.setPower(0..1) */
  function laser(src, o = {}) {
    const Q = { ...spec.laser, ...o }, g = new THREE.Group();
    const lit = new THREE.MeshStandardMaterial({ color: "#2a1420", emissive: colorOf("main"), emissiveIntensity: 0, roughness: 0.4 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(Q.length, Q.height, Q.width, 4, 0.09), materials.body);
    body.position.set(-Q.nozzleL - Q.length / 2, Y, 0);
    const nozzle = cyl(Q.nozzleR, Q.nozzleL + 0.06, materials.dark); nozzle.rotation.z = Math.PI / 2; nozzle.position.set(-Q.nozzleL / 2, Y, 0);
    const eye = cyl(Q.nozzleR * 0.6, 0.03, lit); eye.rotation.z = Math.PI / 2; eye.position.set(0.012, Y, 0);
    const stripe = box(Q.length * 0.62, 0.03, 0.14, lit); stripe.position.set(-Q.nozzleL - Q.length * 0.42, Y + Q.height / 2 + 0.012, 0);
    g.add(body, nozzle, eye, stripe);
    for (let i = 0; i < 4; i++) { const f = box(0.06, 0.05, Q.width * 0.7, materials.dark); f.position.set(-Q.nozzleL - Q.length + 0.16 + i * 0.12, Y + Q.height / 2 + 0.02, 0); g.add(f); }
    for (const fx of [0.3, 0.75]) {
      const post = cyl(0.11, Y - Q.height / 2, materials.steel); post.position.set(-Q.nozzleL - Q.length * fx, (Y - Q.height / 2) / 2, 0);
      const foot = cyl(0.3, 0.09, materials.dark); foot.position.set(post.position.x, 0.045, 0);
      g.add(post, foot);
    }
    shadowAll(g);
    g.position.copy(W3(src.p)); g.rotation.y = Math.atan2(src.dir[1], src.dir[0]);
    g.userData.setPower = (k) => { lit.emissiveIntensity = 0.15 + 2.4 * k; };
    return g;
  }

  // ---------------------------------------------------------------- mirrors
  /** mirror({ p, half, router }) -> Group; userData.setAngle(a) (planner surface angle), setBusy(0..1) (router lamp) */
  // silvered glass: a cool sky gradient + diagonal glints painted into an emissive map, so it reads as a mirror whatever the
  // environment reflects (a flat metal box reflected a grey room and read as a screen)
  const sheen = (() => {
    const S = spec.mirror.sheen, c = makeCanvas(256, 128), x = c.getContext("2d");
    const gr = x.createLinearGradient(0, 0, 0, 128);
    S.sky.forEach((col, i) => gr.addColorStop(i / (S.sky.length - 1), col));
    x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
    for (const [x0, wd, a] of S.glints) {
      x.fillStyle = `rgba(255,255,255,${a})`; x.beginPath();
      x.moveTo(x0 * 256, 128); x.lineTo((x0 + wd) * 256, 128); x.lineTo((x0 + wd + 0.28) * 256, 0); x.lineTo((x0 + 0.28) * 256, 0); x.fill();
    }
    return canvasTexture(c, { srgb: true });
  })();
  const glassMat = new THREE.MeshStandardMaterial({ color: spec.mirror.sheen.base, metalness: 0.85, roughness: 0.12, emissive: 0xffffff, emissiveMap: sheen, emissiveIntensity: spec.mirror.sheen.level });

  function mirror(m, o = {}) {
    const Q = { ...spec.mirror, ...o }, g = new THREE.Group(), frame = m.router ? materials.brass : materials.dark;
    // a ROUND mirror in a ring mount on a post (framed rectangles on a foot read as monitors). The disc's diameter at beam
    // height equals the planner segment (2 * half), and the beam always runs at the disc's centre height.
    const R = m.half, F = Q.frameT, yLow = Y - R - F;
    const base = cyl(Q.baseR * (m.router ? 1.25 : 0.7), Q.baseH, materials.dark); base.position.y = Q.baseH / 2;
    const holder = cyl(Q.postR * 1.7, Q.holderH, materials.dark, 20); holder.position.y = Q.baseH + Q.holderH / 2;
    const post = cyl(Q.postR, yLow, materials.steel); post.position.y = yLow / 2;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Q.glassT, 56), glassMat); glass.rotation.x = Math.PI / 2; glass.position.y = Y;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + F * 0.45, F * 0.75, 12, 64), frame); ring.position.y = Y;
    g.add(base, holder, post, glass, ring);
    for (const s of [-1, 1]) {
      const screw = cyl(Q.knobR * 0.5, Q.barD + 0.1, materials.steel, 16); screw.rotation.x = Math.PI / 2;
      screw.position.set(s * (R + F) * 0.72, Y + (R + F) * 0.72, 0); g.add(screw);
    }
    let lamp = null;
    if (m.router) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Q.baseR * 1.25 + 0.12, 0.045, 10, 48), materials.brass); ring.rotation.x = Math.PI / 2; ring.position.y = 0.045;
      const pointer = box(0.09, 0.05, Q.baseR * 1.25 + 0.3, materials.brass); pointer.position.set(0, Q.baseH + 0.025, (Q.baseR * 1.25 + 0.3) / 2);
      const knob = cyl(Q.knobR, 0.16, materials.brass); knob.position.y = Y + R + F * 1.2 + 0.08;
      lamp = new THREE.MeshStandardMaterial({ color: "#3a2a10", emissive: new THREE.Color(P.brass), emissiveIntensity: 0, roughness: 0.4 });
      const led = cyl(Q.knobR * 0.6, 0.05, lamp); led.position.y = knob.position.y + 0.1;
      g.add(ring, pointer, knob, led);
    }
    shadowAll(g);
    g.position.copy(W3(m.p));
    g.userData.setAngle = (a) => { g.rotation.y = a; };
    g.userData.setBusy = (k) => { if (lamp) lamp.emissiveIntensity = 0.2 + 3.0 * k; };
    return g;
  }

  // ---------------------------------------------------------------- targets
  /** target({ id, p, r, color }) -> Group: sensor drum at beam height + name plate; userData.setGlow(0..1, flare) */
  function target(tg, o = {}) {
    const Q = { ...spec.target, ...o }, g = new THREE.Group(), col = colorOf(tg.color), idle = new THREE.Color(Q.idle);
    const glowMat = new THREE.MeshStandardMaterial({ color: idle.clone(), emissive: col.clone(), emissiveIntensity: 0, roughness: 0.35, metalness: 0.1 });
    const foot = cyl(tg.r * 0.8, 0.1, materials.dark); foot.position.y = 0.05;
    const post = cyl(0.12, Y - Q.bodyH / 2, materials.steel); post.position.y = (Y - Q.bodyH / 2) / 2;
    const drum = cyl(tg.r, Q.bodyH, materials.dark, 40); drum.position.y = Y;
    const band = cyl(tg.r + 0.025, Q.bandH, glowMat, 40); band.position.y = Y;
    const cap = cyl(tg.r * Q.capR, 0.05, glowMat, 40); cap.position.y = Y + Q.bodyH / 2 + 0.02;
    g.add(foot, post, drum, band, cap);
    shadowAll(g);
    const plate = createTextLabel(tg.id, { ...textStyle, height: Q.labelH, color: "#ffffff", background: P.dark, padding: 0.32, radius: 26 });
    plate.position.set(0, Q.labelY, -0.1); plate.rotation.x = Q.labelTilt; plate.castShadow = false;
    const stem = box(0.07, Q.labelY - Y - Q.bodyH / 2 - 0.2, 0.07, materials.steel); stem.position.set(0, (Q.labelY + Y + Q.bodyH / 2 - 0.2) / 2, -0.12);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blob, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012; pool.scale.setScalar(tg.r * 2 * Q.pool);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    halo.position.y = Y + 0.2; halo.scale.setScalar(tg.r * 2 * Q.halo);
    g.add(stem, plate, pool, halo);
    g.position.copy(W3(tg.p));
    const white = new THREE.Color(1, 1, 1), ink = new THREE.Color(P.ink).multiplyScalar(0.72);
    g.userData.setGlow = (v, fl = 0) => {
      glowMat.emissiveIntensity = v * Q.lit * (1 + 0.5 * fl);
      glowMat.color.copy(idle).lerp(col, v * 0.6);
      pool.material.color.copy(col).multiplyScalar(0.5 * v); pool.visible = v > 0.004;
      halo.material.color.copy(col).multiplyScalar(v * (0.5 + 0.7 * fl)); halo.visible = v > 0.004;
      plate.material.color.copy(ink).lerp(col.clone().lerp(white, 0.35), v);
    };
    g.userData.setGlow(0);
    return g;
  }

  // ---------------------------------------------------------------- splitter
  /** splitter({ p, r }) -> Group: glass prism on a piston in a well; userData.setLift(0..1), setGlow(0..1) */
  function splitter(sp, o = {}) {
    const Q = { ...spec.splitter, ...o }, g = new THREE.Group();
    const glassMat = new THREE.MeshPhysicalMaterial({ color: Q.color, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.62, envMapIntensity: 1.6, emissive: new THREE.Color(Q.color), emissiveIntensity: 0.05, side: THREE.DoubleSide });
    const geo = new THREE.CylinderGeometry(sp.r * 1.25, sp.r * 1.25, Q.height, Q.sides);
    const prism = new THREE.Mesh(geo, glassMat); prism.rotation.y = Math.PI / 6;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff }));
    prism.add(edges);
    const piston = cyl(sp.r * 0.5, 1, materials.steel);
    const well = cyl(Q.wellR, 0.012, materials.dark, 40); well.position.y = 0.006; well.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Q.wellR, 0.04, 8, 48), materials.steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
    prism.castShadow = true;
    g.add(well, ring, piston, prism);
    g.position.copy(W3(sp.p));
    g.userData.setLift = (l) => {
      const cy = Q.low - Q.height / 2 + (Y - (Q.low - Q.height / 2)) * l, bottom = cy - Q.height / 2;
      prism.position.y = cy;
      piston.visible = bottom > 0.02; piston.scale.y = Math.max(bottom, 0.02); piston.position.y = Math.max(bottom, 0.02) / 2;
    };
    g.userData.setGlow = (v) => { glassMat.emissiveIntensity = 0.05 + Q.glow * v; };
    g.userData.setLift(0);
    return g;
  }

  // ---------------------------------------------------------------- beams
  /** beams() -> Group with userData.set(beam, t, plan): beam = plan.beam(t). Ribbons + bench spill + hit / head glows. */
  function beams(o = {}) {
    const Q = { ...spec.beam, ...o }, g = new THREE.Group();
    const quad = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);
    const mk = (flat) => new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, defines: flat ? { FLAT: 1 } : {},
      uniforms: {
        uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3(1, 0, 0) }, uHalf: { value: flat ? Q.spillHalf : Q.half }, uY: { value: 0.01 },
        uColor: { value: new THREE.Color() }, uLevel: { value: 1 }, uT: { value: 0 }, uPhase: { value: 0 },
        uCoreK: { value: Q.coreK }, uCore: { value: Q.core }, uHalo: { value: flat ? Q.spill : Q.halo }, uHaze: { value: Q.haze },
      },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const ribbons = [], spills = [];
    for (let i = 0; i < Q.maxSegments; i++) {
      const s = new THREE.Mesh(quad, mk(true)); s.frustumCulled = false; s.visible = false; s.renderOrder = 2; spills.push(s); g.add(s);
      const r = new THREE.Mesh(quad, mk(false)); r.frustumCulled = false; r.visible = false; r.renderOrder = 4; r.material.uniforms.uPhase.value = i * 1.7; ribbons.push(r); g.add(r);
    }
    const glows = [];
    for (let i = 0; i < 24; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      sp.visible = false; sp.renderOrder = 6; glows.push(sp); g.add(sp);
    }
    const white = new THREE.Color(1, 1, 1);
    g.userData.set = (b, t, plan) => {
      let n = 0, k = 0;
      const glow = (p, color, size, level) => {
        if (k >= glows.length) return;
        const sp = glows[k++]; sp.visible = true; sp.position.copy(W3(p, Y)); sp.scale.setScalar(size);
        sp.material.color.copy(colorOf(color)).lerp(white, 0.35).multiplyScalar(level);
      };
      for (const br of b.branches) for (let i = 1; i < br.pts.length && n < ribbons.length; i++) {
        const A = br.pts[i - 1], Bp = br.pts[i];
        if (Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) < 1e-4) continue;
        for (const m of [ribbons[n], spills[n]]) {
          const U = m.material.uniforms;
          U.uA.value.copy(W3(A, Y)); U.uB.value.copy(W3(Bp, Y)); U.uColor.value.copy(colorOf(br.color)); U.uT.value = t;
          m.visible = true;
        }
        n++;
      }
      for (let i = n; i < ribbons.length; i++) ribbons[i].visible = spills[i].visible = false;
      if (b.on) glow(plan.layout.source.p, "main", Q.hitSize * 0.9, Q.hitLevel * 0.8);
      for (const h of b.hits) {
        if (h.kind === "target") continue;
        const fl = h.kind === "wall" || h.kind === "block" || h.kind === "lost" ? 0 : plan.flare(h.id, t);
        const steady = h.kind === "wall" ? 0.55 : h.kind === "splitter" ? 1.2 : 0.8;
        glow(h.p, h.color, Q.hitSize + (Q.flareSize - Q.hitSize) * Math.min(fl, 1), Q.hitLevel * (steady + 1.3 * fl));
      }
      for (const h of b.heads) glow(h.p, h.color, Q.headSize, Q.hitLevel * 1.6);
      for (let i = k; i < glows.length; i++) glows[i].visible = false;
    };
    return g;
  }

  // ---------------------------------------------------------------- the whole bench from a plan
  /** opticsBench(plan) -> Group with update(t): every part posed and lit from plan.*(t) */
  function opticsBench(plan) {
    const L = plan.layout, g = new THREE.Group();
    g.add(bench(L.bounds));
    const las = laser(L.source); g.add(las);
    const mir = L.mirrors.map((m) => { const o = mirror(m); g.add(o); return [m, o]; });
    const tgs = L.targets.map((m) => { const o = target(m); g.add(o); return [m, o]; });
    const spl = L.splitter ? splitter(L.splitter) : null; if (spl) g.add(spl);
    const bm = beams(); g.add(bm);
    g.update = (t) => {
      las.userData.setPower(plan.powerAt(t));
      for (const [m, o] of mir) { o.userData.setAngle(plan.angleAt(m.id, t)); o.userData.setBusy(plan.turning(m.id, t)); }
      for (const [m, o] of tgs) o.userData.setGlow(plan.glow(m.id, t).v, plan.flare(m.id, t));
      if (spl) { spl.userData.setLift(plan.lift(t)); spl.userData.setGlow(plan.glow(L.splitter.id, t).v); }
      bm.userData.set(plan.beam(t), t, plan);
    };
    stage.scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip (bottom centre)
  /** caption() -> overlay chip (dark plate, a short beam mark, white text); userData.show(text, alpha): the plate stays, the text fades */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), mark = 46;
      const pw = Math.min(W - 16, pad + mark + pad * 0.6 + tw + pad), ph = Q.h, ox = Math.round((W - pw) / 2), oy = 6;
      x.fillStyle = "rgba(0,0,0,0.3)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      const mx = ox + pad, my = oy + ph / 2;
      x.strokeStyle = Q.mark; x.lineWidth = 7; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath();
      x.moveTo(mx, my + 14); x.lineTo(mx + 20, my - 14); x.lineTo(mx + mark, my + 6); x.stroke();
      x.strokeStyle = "#ffffff"; x.lineWidth = 2; x.stroke();
      x.globalAlpha = st.a;
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, mx + mark + pad * 0.6, my + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text, a: Math.round(Math.max(0, Math.min(1, a)) * 12) / 12 }); mesh.userData.opacity(text ? 1 : 0); };
    return mesh;
  }

  const props = { bench, laser, mirror, target, splitter, beams, opticsBench, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: beamplan, motion: beamplan,
  };
}
