// effects.js — closed-form one-shot effects (pure in their time argument). Promoted from the low-poly polish.
//  * burst(material, { count, seed, size, colors, speed, up, gravity, life, floor, geometry }) -> InstancedMesh
//    confetti/debris from the origin: ballistic arcs, spin, shrink-out. userData.update(tau) with tau = seconds
//    since the burst (tau < 0 or > life hides it). Seek-safe: positions are computed from tau, never integrated.
//  * groundPulse(groundFn(x, z), { segments, color, lift }) -> Mesh: a flat ring band that hugs a surface; for
//    shockwaves / light pulses radiating across terrain. userData.update(cx, cz, radius, width, opacity).
import * as THREE from "three";
import { rng, smoothstep, TAU } from "./time.js";

export function burst(material, o = {}) {
  const r = rng(o.seed ?? 61);
  const { count = 44, size = 0.13, speed = [2.5, 5], up = [4.5, 7.5], gravity = 9.8, life = 1.7, floor = -2 } = o;
  const colors = (o.colors ?? ["#f5bf3c", "#e5573a", "#fff6e6", "#2f7f8e"]).map((c) => new THREE.Color(c));
  const geo = o.geometry ?? new THREE.TetrahedronGeometry(size, 0);
  const m = new THREE.InstancedMesh(geo, material, count);
  m.castShadow = true;
  m.frustumCulled = false;
  m.name = "burst";
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = r.range(0, TAU), v = r.range(...speed);
    parts.push({ vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: r.range(...up), axis: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), spin: r.range(6, 14), s: r.range(0.7, 1.3) });
    m.setColorAt(i, colors[i % colors.length]);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3();
  m.userData.update = (tau) => {
    const on = tau >= 0 && tau <= life;
    m.visible = on;
    if (!on) return;
    parts.forEach((p, i) => {
      const y = Math.max(floor, p.vy * tau - 0.5 * gravity * tau * tau);
      Pp.set(p.vx * tau, y, p.vz * tau);
      Q.setFromAxisAngle(p.axis, p.spin * tau);
      const k = p.s * (1 - smoothstep(life * 0.55, life, tau)) * Math.min(1, tau * 12);
      S.setScalar(Math.max(k, 1e-4));
      m.setMatrixAt(i, M.compose(Pp, Q, S));
    });
    m.instanceMatrix.needsUpdate = true;
  };
  m.userData.update(-1);
  return m;
}

export function groundPulse(groundFn, o = {}) {
  const { segments = 72, lift = 0.12 } = o;
  const n = segments;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const idx = [];
  for (let k = 0; k < n; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: o.color ?? "#f5bf3c", transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.name = "groundPulse";
  m.userData.update = (cx, cz, R, w, opacity) => {
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      [R - w / 2, R + w / 2].forEach((rr, j) => {
        const x = cx + ca * Math.max(0, rr), z = cz + sa * Math.max(0, rr);
        pos.set([x, groundFn(x, z) + lift, z], (k * 2 + j) * 3);
      });
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = opacity;
    m.visible = opacity > 1e-3;
  };
  m.userData.update(0, 0, 1, 0.1, 0);
  return m;
}
