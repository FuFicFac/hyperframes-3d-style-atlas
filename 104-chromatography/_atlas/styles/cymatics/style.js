// styles/cymatics/style.js — "Cymatics": a Chladni plate. The look lives in spec.js; WHERE every grain is and WHICH
// tone plays lives in chladni.js (THREE-free planner shared with SCORE). This file turns a plan into pictures:
// ONE InstancedMesh for every sand grain (low-poly icosahedron, per-grain seeded rotation/size/tint baked once; the
// translation column is rewritten from plan.positionsAt(t) every frame), a segmented anodised plate slab whose
// vertices bend with the current mode shape, a speaker-driver post, a light lab bench, a function-generator box whose
// knob turns with the pitch, a sand jar, and an overlay caption chip + frequency readout (exact colours).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { rng, lerp, clamp, smoothstep } from "../../kit/time.js";
import * as chladni from "./chladni.js";
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
  const PL = spec.plate, SD = spec.sand;
  const L = PL.size, half = L / 2;
  const toWorld = (x, y) => [(x - 0.5) * L, (y - 0.5) * L];

  /** flex height (m) at plate coords for a shape blend [{ mode, weight }] */
  const flexAt = (shape, x, y) => {
    let h = 0;
    for (const s of shape) h += s.weight * chladni.displacement(s.mode, x, y);
    return (h / 2) * PL.flex;
  };

  // ---------------------------------------------------------------- bench
  /** bench({ size }) -> light matte lab-bench top (a plane) */
  function bench(o = {}) {
    const size = o.size ?? spec.bench.size;
    const mat = materials.bench;
    if (mat.bumpMap) mat.bumpMap.repeat.set(size / 3, size / 3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = spec.bench.y;
    m.receiveShadow = true; m.name = "bench";
    return m;
  }

  // ---------------------------------------------------------------- plate (bending slab) + driver
  /** plate() -> Mesh: anodised slab (segmented box). userData.update(shape) bends every vertex by the mode shape. */
  function plate(o = {}) {
    const seg = o.segments ?? PL.segments, th = PL.thickness;
    const g = new THREE.BoxGeometry(L, th, L, seg, 1, seg);
    g.translate(0, PL.y - th / 2, 0);
    const pos = g.attributes.position, base = Float32Array.from(pos.array);
    const E = materials.plateEdge, T = materials.plate; // box groups: +x, -x, +y (top), -y, +z, -z
    const mesh = new THREE.Mesh(g, [E, E, T, T, E, E]);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = "plate";
    let lastKey = null;
    mesh.userData.update = (shape) => {
      const key = shape.map((s) => `${s.mode.k}:${s.weight.toFixed(5)}`).join("|");
      if (key === lastKey) return;
      lastKey = key;
      const A = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const X = base[3 * i], Z = base[3 * i + 2];
        A[3 * i + 1] = base[3 * i + 1] + (shape.length ? flexAt(shape, X / L + 0.5, Z / L + 0.5) : 0);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    };
    mesh.userData.update([]);
    return mesh;
  }

  /** driver() -> Group: speaker-driver can on the bench with a post up to the plate centre and a brass coupling */
  function driver() {
    const D = PL.post, g = new THREE.Group(); g.name = "driver";
    const can = new THREE.Mesh(new THREE.CylinderGeometry(D.driverR, D.driverR * 1.08, D.driverH, 48), materials.driver);
    can.position.y = D.driverH / 2; can.castShadow = can.receiveShadow = true; g.add(can);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(D.driverR * 0.8, 0.018, 12, 48), materials.brass);
    ring.rotation.x = -Math.PI / 2; ring.position.y = D.driverH + 0.004; g.add(ring);
    const postH = PL.y - PL.thickness - D.driverH;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(D.r * 0.5, D.r * 0.5, postH, 24), materials.brass);
    post.position.y = D.driverH + postH / 2; post.castShadow = true; g.add(post);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(D.r * 0.7, D.r * 0.7, 0.02, 6), materials.brass);
    nut.position.y = PL.y + 0.006; g.add(nut);
    return g;
  }

  // ---------------------------------------------------------------- bench props: function generator, sand jar, cable
  /** generator({ position }) -> Group: a function-generator box; userData.setPitch(u 0..1) turns the knob */
  function generator(o = {}) {
    const g = new THREE.Group(); g.name = "generator";
    const W = 0.78, H = 0.34, Dp = 0.52;
    const box = new THREE.Mesh(new RoundedBoxGeometry(W, H, Dp, 3, 0.03), materials.box);
    box.position.y = H / 2; box.castShadow = box.receiveShadow = true; g.add(box);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, H * 0.78), new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.5 }));
    face.position.set(0, H / 2, Dp / 2 + 0.002); g.add(face);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.42, H * 0.3), new THREE.MeshStandardMaterial({ color: "#0d1a14", emissive: P.display, emissiveIntensity: 0.9, roughness: 0.3 }));
    disp.position.set(-W * 0.17, H * 0.6, Dp / 2 + 0.004); g.add(disp);
    const knob = new THREE.Group();
    const kc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.066, 0.05, 28), materials.knob);
    kc.rotation.x = Math.PI / 2; knob.add(kc);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.4 }));
    mark.position.set(0, 0.03, 0.03); knob.add(mark);
    knob.position.set(W * 0.27, H * 0.5, Dp / 2 + 0.03); g.add(knob);
    for (const [x, c] of [[-W * 0.32, P.accent], [-W * 0.02, "#e9e5dd"]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
      b.rotation.x = Math.PI / 2; b.position.set(x, H * 0.26, Dp / 2 + 0.01); g.add(b);
    }
    if (o.position) g.position.set(...o.position);
    if (o.rotationY) g.rotation.y = o.rotationY;
    g.userData.setPitch = (u) => { knob.rotation.z = lerp(2.2, -2.2, clamp(u)); };
    g.userData.setPitch(0);
    return g;
  }

  /** jar({ position }) -> Group: a short glass jar half full of the same sand + a brass scoop beside it */
  function jar(o = {}) {
    const g = new THREE.Group(); g.name = "jar";
    const r = 0.17, h = 0.3;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, h * 0.5, 40), new THREE.MeshStandardMaterial({ color: P.sand, roughness: 0.95 }));
    sand.position.y = h * 0.25; g.add(sand);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = h / 2; glass.renderOrder = 2; g.add(glass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 40), new THREE.MeshStandardMaterial({ color: "#e8eef2", roughness: 0.2 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = h; g.add(rim);
    const scoop = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.32, 4, 12), materials.brass);
    scoop.rotation.z = Math.PI / 2; scoop.rotation.y = 0.5; scoop.position.set(0.05, 0.02, r + 0.12); scoop.castShadow = true; g.add(scoop);
    g.traverse((m) => { if (m.isMesh && m !== glass) m.castShadow = true; });
    if (o.position) g.position.set(...o.position);
    return g;
  }

  /** cable(from, to) -> Mesh: a slack cable lying on the bench between two points (xz) */
  function cable(from, to, o = {}) {
    const a = new THREE.Vector3(from[0], 0.02, from[1]), b = new THREE.Vector3(to[0], 0.02, to[1]);
    const m1 = a.clone().lerp(b, 0.33).add(new THREE.Vector3(0, 0, o.sag ?? 0.35));
    const m2 = a.clone().lerp(b, 0.66).add(new THREE.Vector3(0, 0, (o.sag ?? 0.35) * 0.6));
    const curve = new THREE.CatmullRomCurve3([a, m1, m2, b]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.016, 8, false), materials.cable);
    mesh.castShadow = true; mesh.name = "cable";
    return mesh;
  }

  // ---------------------------------------------------------------- sand
  /** sand(plan) -> InstancedMesh of every grain; userData.update(t, shape) writes every grain's translation */
  function sand(plan, o = {}) {
    const n = plan.n, r = rng((o.seed ?? SD.seed) + 1);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78, metalness: 0, flatShading: true });
    mat.name = "sand";
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = "sand"; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = true;
    const RS = new Float32Array(n * 9), rad = new Float32Array(n);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), zero = new THREE.Vector3();
    const cA = new THREE.Color(P.sand), cB = new THREE.Color(P.sandShade), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = r.range(SD.size[0], SD.size[1]);
      rad[i] = s;
      e.set(r.range(0, 6.283), r.range(0, 6.283), r.range(0, 6.283));
      q.setFromEuler(e);
      sc.set(s * r.range(0.85, 1.25), s * r.range(0.6, 0.9), s * r.range(0.85, 1.25));
      m4.compose(zero, q, sc);
      const el = m4.elements;
      RS.set([el[0], el[1], el[2], el[4], el[5], el[6], el[8], el[9], el[10]], i * 9);
      c.copy(cA).lerp(cB, r.range(0, 1) * SD.tint * 4 > 1 ? r.range(0.3, 0.8) : r.range(0, 0.25));
      mesh.setColorAt(i, c);
    }
    mesh.instanceColor.needsUpdate = true;
    const out = new Float32Array(n * 3), M = mesh.instanceMatrix.array;
    const hopH = o.hop ?? SD.hop;
    mesh.userData.update = (t, shape) => {
      plan.positionsAt(t, out);
      for (let i = 0; i < n; i++) {
        const x = out[3 * i], y = out[3 * i + 1];
        const X = (x - 0.5) * L, Z = (y - 0.5) * L;
        const Y = PL.y + (shape.length ? flexAt(shape, x, y) : 0) + rad[i] * 0.55 + out[3 * i + 2] * hopH;
        const b = i * 16, k = i * 9;
        M[b] = RS[k]; M[b + 1] = RS[k + 1]; M[b + 2] = RS[k + 2]; M[b + 3] = 0;
        M[b + 4] = RS[k + 3]; M[b + 5] = RS[k + 4]; M[b + 6] = RS[k + 5]; M[b + 7] = 0;
        M[b + 8] = RS[k + 6]; M[b + 9] = RS[k + 7]; M[b + 10] = RS[k + 8]; M[b + 11] = 0;
        M[b + 12] = X; M[b + 13] = Y; M[b + 14] = Z; M[b + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    mesh.userData.update(0, []);
    return mesh;
  }

  // ---------------------------------------------------------------- overlay: caption chip + frequency readout
  /** caption() -> overlay chip (dark plate, a small sand-wave icon, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, oy = 6;
      const ox = Q.align === "center" ? Math.round((W - pw) / 2) : 6;
      x.fillStyle = "rgba(0,0,0,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      // icon: a tiny diamond nodal figure in sand dots
      const cx = ox + pad + ic / 2, cy = oy + ph / 2, rr = ic * 0.42;
      x.fillStyle = Q.wave;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, s = Math.abs(Math.cos(a)) + Math.abs(Math.sin(a));
        x.beginPath(); x.arc(cx + (Math.cos(a) / s) * rr, cy + (Math.sin(a) / s) * rr, 2.6, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.align === "center" ? Q.x - Wp / 2 : Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** readout() -> overlay frequency chip, right-aligned at spec.readout.x; userData.show(hz, alpha). Shows the hz the SCORE plays. */
  function readout(o = {}) {
    const Q = { ...spec.readout, ...o };
    const Wp = 460, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.hz) return;
      const num = String(st.hz), unit = " Hz";
      x.font = `700 ${Q.cap * 1.3}px ${spec.caption.font}`;
      const tn = Math.round(x.measureText(num).width);
      x.font = `600 ${Q.cap}px ${spec.caption.font}`;
      const tu = Math.round(x.measureText(unit).width);
      const pad = 28, wave = 54, pw = pad + wave + 18 + tn + tu + pad, ph = Q.h, ox = W - pw - 6, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 13); x.stroke();
      // sine glyph: more cycles for higher pitch (cycles = hz / 110)
      x.strokeStyle = Q.ink; x.lineWidth = 3.5; x.lineCap = "round"; x.beginPath();
      const cyc = st.hz / 110;
      for (let k = 0; k <= 60; k++) {
        const u = k / 60, px = ox + pad + u * wave, py = oy + ph / 2 - Math.sin(u * cyc * Math.PI * 2) * ph * 0.18;
        if (k) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.stroke();
      x.textBaseline = "middle"; x.textAlign = "left";
      x.fillStyle = Q.ink; x.font = `700 ${Q.cap * 1.3}px ${spec.caption.font}`;
      x.fillText(num, ox + pad + wave + 18, oy + Math.round(ph / 2) + 2);
      x.fillStyle = Q.unit; x.font = `600 ${Q.cap}px ${spec.caption.font}`;
      x.fillText(unit, ox + pad + wave + 18 + tn, oy + Math.round(ph / 2) + 4);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp, Q.y);
    mesh.userData.show = (hz, a) => { mesh.userData.set({ hz: a > 0.003 ? hz : 0 }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * chladniPlate(plan, { generator: [x,z], jar: [x,z] }) -> { group, plate, sand, generator, update(t) } (adds itself)
   *   update(t): plate flex from plan.shapeAt(t), every grain from plan.positionsAt(t), generator knob from the
   *   current mode's index (0..1 across the plan's modes).
   */
  function chladniPlate(plan, o = {}) {
    const group = new THREE.Group(); group.name = "chladni";
    group.add(bench());
    const pl = plate(); group.add(pl);
    group.add(driver());
    const gp = o.generator ?? [1.95, -0.55];
    const gen = generator({ position: [gp[0], 0, gp[1]], rotationY: o.generatorRot ?? -0.5 }); group.add(gen);
    const jp = o.jar ?? [-1.95, -0.45];
    group.add(jar({ position: [jp[0], 0, jp[1]] }));
    group.add(cable([gp[0] - 0.3, gp[1] - 0.2], [0, -0.3], { sag: -0.5 }));
    const sd = sand(plan, o); group.add(sd);
    stage.scene.add(group);
    const K = plan.modes.length;
    return {
      group, plate: pl, sand: sd, generator: gen,
      update(t) {
        const shape = plan.shapeAt(t);
        pl.userData.update(shape);
        sd.userData.update(t, shape);
        let u = 0; // the knob turns up over 0.4 s before each tone step
        for (const md of plan.modes) u += smoothstep(md.t - 0.4, md.t, t) / K;
        gen.userData.setPitch(u);
      },
    };
  }

  const props = { bench, plate, driver, generator, jar, cable, sand, caption, readout, chladniPlate };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: chladni, motion: chladni, toWorld, half,
  };
}
