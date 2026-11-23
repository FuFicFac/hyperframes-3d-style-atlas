// styles/tiny-planet/style.js — "Tiny Planet": one small faceted globe that fills the frame and grows a world along
// its surface. The look lives in spec.js; every place, height, arrival time, chip path and sound time lives in globe.js
// (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   - the globe: a non-indexed icosphere whose vertex radii and facet colours are rewritten from the plan's arrival
//     times each frame (flat shading, so no normals to recompute);
//   - a lat/long grid of thin ribbons that sinks under the surface where the ground has been read;
//   - instanced trees, houses and cloud puffs posed on the surface from their spherical place (scale = pop from t);
//   - road ribbons revealed by draw range; lamps as additive HDR points whose level is the night factor of their
//     current world normal; word chips as camera-facing quads rebuilt from plan.chipPose(t);
//   - a soft halo behind the globe and an overlay caption plate.
// Props never animate themselves: the scene calls world.update(t) after the camera rig.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture, blobTexture } from "../../kit/textures.js";
import { smoothstep, ease, hash01, clamp } from "../../kit/time.js";
import * as globe from "./globe.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, G = spec.globe, R = G.R;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const col = (hex) => new THREE.Color(hex);
  const { frameAt, rotY, norm, dot } = globe;

  /** tinted(geometry, hex) -> non-indexed copy without uv, with a constant vertex colour */
  function tinted(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute("uv");
    const c = col(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  }
  /** basis quaternion for something standing at direction d, turned yaw degrees about its own up */
  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  function standing(d, yawDeg) {
    const f = frameAt(d), a = yawDeg * globe.D2R, c = Math.cos(a), s = Math.sin(a);
    _x.set(f.east[0] * c + f.north[0] * s, f.east[1] * c + f.north[1] * s, f.east[2] * c + f.north[2] * s);
    _y.set(d[0], d[1], d[2]);
    _z.crossVectors(_x, _y);
    return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  }
  const pop = (t, t0, dur, over = 1.9) => (t <= t0 ? 0 : ease.outBack((t - t0) / dur, over));

  // ---------------------------------------------------------------- the globe surface
  /** surface(plan) -> Mesh; userData.update(t) rewrites radii + facet colours from the plan's arrival times */
  function surface(plan) {
    const geo = new THREE.IcosahedronGeometry(1, G.detail);          // non-indexed: 3 own vertices per facet
    geo.deleteAttribute("uv"); geo.deleteAttribute("normal");
    const pos = geo.attributes.position, n = pos.count, F = n / 3;
    const dir = new Float32Array(n * 3), hV = new Float32Array(n), aV = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = norm([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      dir[i * 3] = d[0]; dir[i * 3 + 1] = d[1]; dir[i * 3 + 2] = d[2];
      hV[i] = plan.surface(d).h;
      const a = plan.landAt(d);
      aV[i] = isFinite(a) ? a : 1e9;
    }
    const bareA = col(P.bare), bareB = col(P.bareDark), front = col(P.front), c = new THREE.Color(), c2 = new THREE.Color();
    const cBare = new Float32Array(F * 3), cFin = new Float32Array(F * 3), aF = new Float32Array(F);
    for (let f = 0; f < F; f++) {
      const i = f * 9;
      const d = norm([dir[i] + dir[i + 3] + dir[i + 6], dir[i + 1] + dir[i + 4] + dir[i + 7], dir[i + 2] + dir[i + 5] + dir[i + 8]]);
      const s = plan.surface(d), j = (hash01(f, G.seed, 21) - 0.5) * 2 * G.faceJitter;
      c.set(P[s.kind]).lerp(c2.set(P[s.kind2]), s.u);
      c.offsetHSL(0, 0, j * (s.kind === "snow" ? 0.35 : 1));
      cFin[f * 3] = c.r; cFin[f * 3 + 1] = c.g; cFin[f * 3 + 2] = c.b;
      c.copy(bareA).lerp(bareB, hash01(f, G.seed, 22));
      cBare[f * 3] = c.r; cBare[f * 3 + 1] = c.g; cBare[f * 3 + 2] = c.b;
      const a = plan.landAt(d);
      aF[f] = isFinite(a) ? a : 1e9;
    }
    const colr = new Float32Array(n * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 1);
    const mesh = new THREE.Mesh(geo, materials.planet);
    mesh.name = "globe"; mesh.frustumCulled = false;
    const p = pos.array;
    mesh.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        const u = (t - aV[i]) / G.rise;
        const k = u <= 0 ? 0 : u >= 1 ? 1 : ease.outBack(u, G.overshoot);
        const r = R + hV[i] * k;
        p[i * 3] = dir[i * 3] * r; p[i * 3 + 1] = dir[i * 3 + 1] * r; p[i * 3 + 2] = dir[i * 3 + 2] * r;
      }
      for (let f = 0; f < F; f++) {
        const u = t - aF[f], f3 = f * 3;
        let r, g, b;
        if (u <= 0) { r = cBare[f3]; g = cBare[f3 + 1]; b = cBare[f3 + 2]; }
        else {
          const k = smoothstep(0, G.tint, u), fl = 0.75 * smoothstep(0, 0.08, u) * (1 - smoothstep(0.1, G.flash, u));
          r = cBare[f3] + (cFin[f3] - cBare[f3]) * k; g = cBare[f3 + 1] + (cFin[f3 + 1] - cBare[f3 + 1]) * k; b = cBare[f3 + 2] + (cFin[f3 + 2] - cBare[f3 + 2]) * k;
          r += (front.r - r) * fl; g += (front.g - g) * fl; b += (front.b - b) * fl;
        }
        const o = f * 9;
        colr[o] = colr[o + 3] = colr[o + 6] = r; colr[o + 1] = colr[o + 4] = colr[o + 7] = g; colr[o + 2] = colr[o + 5] = colr[o + 8] = b;
      }
      pos.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    };
    return mesh;
  }

  /** grid(plan) -> Mesh: lat/long ribbons just above the bare ball; each vertex sinks once its ground has been read */
  function grid(plan) {
    const Q = G.grid, dirs = [], acr = [], arr = [], idx = [];
    const line = (pts, across) => {
      const base = dirs.length;
      pts.forEach((d, k) => { const a = across(d); dirs.push(d, d); acr.push(a, [-a[0], -a[1], -a[2]]); const t = plan.landAt(d); arr.push(isFinite(t) ? t : 1e9, isFinite(t) ? t : 1e9); if (k) { const i = base + k * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); } });
    };
    for (let lat = -90 + Q.step; lat < 90; lat += Q.step) {
      const pts = []; for (let k = 0; k <= Q.seg; k++) pts.push(globe.dirOf(lat, (k / Q.seg) * 360));
      line(pts, (d) => frameAt(d).north);
    }
    for (let lon = 0; lon < 360; lon += Q.step) {
      const pts = []; for (let k = 0; k <= Q.seg / 2; k++) pts.push(globe.dirOf(-82 + (k / (Q.seg / 2)) * 164, lon));
      line(pts, (d) => frameAt(d).east);
    }
    const n = dirs.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    dirs.forEach((d, i) => { nor[i * 3] = d[0]; nor[i * 3 + 1] = d[1]; nor[i * 3 + 2] = d[2]; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, materials.grid); mesh.name = "grid"; mesh.frustumCulled = false;
    const hw = Q.width / 2;
    mesh.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        const r = R + Q.lift - (Q.lift + Q.sink) * smoothstep(-0.05, 0.2, t - arr[i]), d = dirs[i], a = acr[i];
        pos[i * 3] = d[0] * r + a[0] * hw; pos[i * 3 + 1] = d[1] * r + a[1] * hw; pos[i * 3 + 2] = d[2] * r + a[2] * hw;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return mesh;
  }

  // ---------------------------------------------------------------- instanced life
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _mat = new THREE.Matrix4();
  /** instanced(geometry, material, items, { colorOf, radiusOf, yawOf, scaleOf, popDur }) -> InstancedMesh; userData.update(t) */
  function instanced(geo, mat, items, o) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    m.count = items.length; m.frustumCulled = false;
    const quats = items.map((it) => standing(it.dir, o.yawOf ? o.yawOf(it) : it.yaw ?? 0));
    const c = new THREE.Color();
    items.forEach((it, i) => { if (o.colorOf) m.setColorAt(i, c.set(o.colorOf(it))); });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.userData.update = (t) => {
      for (let i = 0; i < items.length; i++) {
        const it = items[i], k = pop(t, it.t, o.popDur), r = o.radiusOf(it), sc = o.scaleOf(it);
        _p.set(it.dir[0] * r, it.dir[1] * r, it.dir[2] * r);
        _s.set(sc[0] * k, sc[1] * (k > 0 ? 0.25 + 0.75 * k : 0), sc[2] * k);
        m.setMatrixAt(i, _mat.compose(_p, quats[i], _s));
      }
      m.instanceMatrix.needsUpdate = true;
    };
    return m;
  }

  /** trees(plan) -> Group of two InstancedMeshes (pines, round trees) */
  function trees(plan) {
    const TR = spec.trees, g = new THREE.Group(); g.name = "trees";
    const trunk = () => { const c = new THREE.CylinderGeometry(0.07, 0.09, 0.3, 5); c.translate(0, 0.15, 0); return tinted(c, P.trunk); };
    const cone = (r, y0, h) => { const c = new THREE.ConeGeometry(r, h, 6); c.translate(0, y0 + h / 2, 0); return tinted(c, "#ffffff"); };
    const pineGeo = mergeGeometries([trunk(), cone(0.36, 0.2, 0.5), cone(0.26, 0.52, 0.48)]);
    const ball = new THREE.IcosahedronGeometry(0.36, 0); ball.translate(0, 0.62, 0);
    const leafGeo = mergeGeometries([trunk(), tinted(ball, "#ffffff")]);
    const o = { popDur: TR.pop, radiusOf: (it) => R + it.h - TR.sink, scaleOf: (it) => [it.size, it.size, it.size] };
    const pines = instanced(pineGeo, materials.tree, plan.trees.filter((t) => !t.leaf), { ...o, colorOf: (it) => P.pine[it.tone] });
    const leafs = instanced(leafGeo, materials.tree, plan.trees.filter((t) => t.leaf), { ...o, colorOf: (it) => P.leaf[it.tone] });
    g.add(pines, leafs);
    g.userData.update = (t) => { pines.userData.update(t); leafs.userData.update(t); };
    return g;
  }

  /** houses(plan) -> Group: cream walls + coloured pyramid roofs (a town's first house may be a tall tower) */
  function houses(plan) {
    const HS = spec.houses, g = new THREE.Group(); g.name = "houses";
    const wallGeo = new THREE.BoxGeometry(1, 0.7, 0.82); wallGeo.translate(0, 0.35, 0);
    const roofGeo = new THREE.ConeGeometry(0.8, 0.58, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.scale(1, 1, 0.84); roofGeo.translate(0, 0.7 + 0.29, 0);
    const scaleOf = (it) => (it.tower ? [it.size * 0.72, HS.tower / 1.28, it.size * 0.72] : [it.size, it.size, it.size]);
    const o = { popDur: HS.pop, radiusOf: (it) => R + it.h - HS.sink, scaleOf };
    const walls = instanced(wallGeo, materials.wall, plan.houses, o);
    const roofs = instanced(roofGeo, materials.roof, plan.houses, { ...o, colorOf: (it) => (it.tower ? P.accent : P.roofs[it.roof]) });
    g.add(walls, roofs);
    g.userData.update = (t) => { walls.userData.update(t); roofs.userData.update(t); };
    return g;
  }

  /** clouds(plan) -> InstancedMesh of faceted puffs drifting slowly in longitude */
  function clouds(plan) {
    const CL = spec.clouds, geo = new THREE.IcosahedronGeometry(1, 1);
    const puffs = plan.clouds.flatMap((c) => c.puffs.map((q) => ({ c, q })));
    const m = new THREE.InstancedMesh(geo, materials.cloud, Math.max(1, puffs.length));
    m.count = puffs.length; m.frustumCulled = false; m.name = "clouds";
    const q4 = new THREE.Quaternion();
    m.userData.update = (t) => {
      puffs.forEach(({ c, q }, i) => {
        const d = plan.cloudDir(c, t), f = frameAt(d), r = R + CL.alt + q.u, k = pop(t, c.t, CL.pop, 1.4) * q.s;
        _p.set(d[0] * r + f.east[0] * q.e + f.north[0] * q.n, d[1] * r + f.east[1] * q.e + f.north[1] * q.n, d[2] * r + f.east[2] * q.e + f.north[2] * q.n);
        _s.set(k, k * 0.72, k);
        m.setMatrixAt(i, _mat.compose(_p, q4.copy(standing(d, 0)), _s));
      });
      m.instanceMatrix.needsUpdate = true;
    };
    return m;
  }

  /** roads(plan) -> Group of ribbons on the plateau; each draws outward by draw range */
  function roads(plan) {
    const RD = spec.roads, g = new THREE.Group(); g.name = "roads";
    const rr = R + G.terrain.flat + RD.lift, hw = RD.width / 2;
    const parts = plan.roads.map((r) => {
      const pos = [], nor = [], idx = [];
      r.pts.forEach((d, k) => {
        const a = r.pts[Math.max(0, k - 1)], b = r.pts[Math.min(r.pts.length - 1, k + 1)];
        const tan = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), s = globe.cross(d, tan);
        pos.push(d[0] * rr + s[0] * hw, d[1] * rr + s[1] * hw, d[2] * rr + s[2] * hw, d[0] * rr - s[0] * hw, d[1] * rr - s[1] * hw, d[2] * rr - s[2] * hw);
        nor.push(d[0], d[1], d[2], d[0], d[1], d[2]);
        if (k) { const i = k * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, materials.road); m.frustumCulled = false; g.add(m);
      return { r, geo };
    });
    g.userData.update = (t) => {
      for (const { r, geo } of parts) {
        let k = 0;
        while (k < r.times.length && r.times[k] <= t) k++;
        geo.setDrawRange(0, Math.max(0, k - 1) * 6);
      }
    };
    return g;
  }

  /** lamps(plan) -> Points (additive, HDR): level = night factor of the lamp's current world normal */
  function lamps(plan) {
    const LP = spec.lamps, n = plan.lamps.length;
    const pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
    plan.lamps.forEach((l, i) => { pos[i * 3] = l.dir[0] * l.r; pos[i * 3 + 1] = l.dir[1] * l.r; pos[i * 3 + 2] = l.dir[2] * l.r; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 1);
    const fov = (spec.camera.fov * Math.PI) / 180;
    const mat = new THREE.PointsMaterial({ map: blobTexture({ size: 64, stops: [[0, 1], [0.18, 0.9], [0.45, 0.22], [1, 0]] }), size: LP.size / Math.tan(fov / 2), sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true });
    mat.name = "lamps";
    const pts = new THREE.Points(geo, mat); pts.name = "lamps"; pts.frustumCulled = false;
    const sun = norm(G.sun), warm = col(P.lamp);
    pts.userData.update = (t, spinRad) => {
      for (let i = 0; i < n; i++) {
        const l = plan.lamps[i], nw = rotY(l.dir, spinRad);
        const k = LP.level * smoothstep(G.night[0], G.night[1], dot(nw, sun)) * smoothstep(0, 0.35, t - l.t) * (l.kind === "road" ? 0.8 : 1) * smoothstep(LP.limb[0], LP.limb[1], nw[2]);
        colr[i * 3] = warm.r * k; colr[i * 3 + 1] = warm.g * k; colr[i * 3 + 2] = warm.b * k;
      }
      geo.attributes.color.needsUpdate = true;
    };
    return pts;
  }

  // ---------------------------------------------------------------- word chips
  /** chipAtlas() -> { texture, cols, rows }: every word as a rounded chip (land = ink, life = accent) */
  function chipAtlas() {
    const C = spec.chips, words = [...C.land, ...C.life], cols = 4, rows = Math.ceil(words.length / cols);
    const [cw, chh] = C.cell, cv = makeCanvas(cols * cw, rows * chh), x = cv.getContext("2d");
    x.clearRect(0, 0, cv.width, cv.height);
    x.font = `${C.weight} ${C.px}px ${C.font}`; x.textAlign = "center"; x.textBaseline = "middle";
    words.forEach((w, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * chh;
      x.fillStyle = i < C.land.length ? P.chip : P.chipLife;
      x.beginPath(); x.roundRect(cx + 5, cy + 5, cw - 10, chh - 10, 22); x.fill();
      x.fillStyle = P.chipText;
      x.fillText(w, cx + cw / 2, cy + chh / 2 + 3, cw - 34);
    });
    const tex = canvasTexture(cv, { anisotropy: 4 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { texture: tex, cols, rows };
  }

  /** chips(plan) -> Mesh of camera-facing quads in WORLD space; userData.update(t, camera) */
  function chips(plan) {
    const C = spec.chips, A = chipAtlas(), n = plan.chips.length;
    const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    plan.chips.forEach((c, i) => {
      const cx = c.word % A.cols, cy = Math.floor(c.word / A.cols);
      const u0 = cx / A.cols, u1 = (cx + 1) / A.cols, v1 = 1 - cy / A.rows, v0 = 1 - (cy + 1) / A.rows;
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
    const mat = new THREE.MeshBasicMaterial({ map: A.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.name = "chips";
    const mesh = new THREE.Mesh(geo, mat); mesh.name = "chips"; mesh.frustumCulled = false;
    const rt = new THREE.Vector3(), up = new THREE.Vector3();
    mesh.userData.update = (t, camera) => {
      rt.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      for (let i = 0; i < n; i++) {
        const q = plan.chipPose(plan.chips[i], t), o = i * 12;
        if (!q || q.s <= 0.001) { pos.fill(0, o, o + 12); continue; }
        const c = Math.cos(q.roll), s = Math.sin(q.roll), hw = (C.w / 2) * q.s, hh = (C.h / 2) * q.s;
        const ax = (rt.x * c + up.x * s) * hw, ay = (rt.y * c + up.y * s) * hw, az = (rt.z * c + up.z * s) * hw;
        const bx = (-rt.x * s + up.x * c) * hh, by = (-rt.y * s + up.y * c) * hh, bz = (-rt.z * s + up.z * c) * hh;
        const [x, y, z] = q.p;
        pos[o] = x - ax - bx; pos[o + 1] = y - ay - by; pos[o + 2] = z - az - bz;
        pos[o + 3] = x + ax - bx; pos[o + 4] = y + ay - by; pos[o + 5] = z + az - bz;
        pos[o + 6] = x + ax + bx; pos[o + 7] = y + ay + by; pos[o + 8] = z + az + bz;
        pos[o + 9] = x - ax + bx; pos[o + 10] = y - ay + by; pos[o + 11] = z - az + bz;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return mesh;
  }

  /** halo() -> soft pale disc behind the globe (separates the ball from the backdrop) */
  function halo() {
    const H = spec.halo;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(H.size, H.size), new THREE.MeshBasicMaterial({ map: blobTexture({ size: 256, stops: [[0, 1], [0.5, 0.9], [0.72, 0.35], [1, 0]] }), color: H.color, transparent: true, opacity: H.opacity, depthWrite: false }));
    m.position.set(0, 0, H.z); m.renderOrder = -5; m.name = "halo"; m.material.name = "halo";
    return m;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (cream, ink edge, a small globe mark); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.6), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.55) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(31,42,68,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 5; x.beginPath(); x.roundRect(ox + 2.5, oy + 2.5, pw - 5, ph - 5, ph / 2 - 2.5); x.stroke();
      // mark: a tiny planet (disc + land blob + night crescent)
      const cx = ox + pad + ic / 2, cy = oy + ph / 2, r = ic / 2;
      x.fillStyle = "#3b93e8"; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#86d45c"; x.beginPath(); x.ellipse(cx - r * 0.2, cy - r * 0.1, r * 0.48, r * 0.36, 0.5, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.dot; x.beginPath(); x.arc(cx + r * 0.32, cy + r * 0.42, r * 0.17, 0, Math.PI * 2); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.55), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * world(plan) -> { group, planet, update(t) } (adds itself to the scene). update(t) turns the globe to plan.spin(t)
   * and reads every radius, colour, scale, draw range, lamp level and chip pose from the plan at t (call it AFTER the
   * camera rig: the chips face the current camera). Nothing carries over between calls.
   */
  function world(plan) {
    const group = new THREE.Group(); group.name = "tiny-planet";
    const planet = new THREE.Group(); planet.name = "planet";
    const sf = surface(plan), gr = grid(plan), rd = roads(plan), tr = trees(plan), hs = houses(plan), cl = clouds(plan), lp = lamps(plan);
    planet.add(sf, gr, rd, tr, hs, cl, lp);
    const ch = chips(plan);
    group.add(halo(), planet, ch);
    stage.scene.add(group);
    const update = (t) => {
      const th = plan.spin(t);
      planet.rotation.y = th;
      sf.userData.update(t); gr.userData.update(t); rd.userData.update(t); tr.userData.update(t); hs.userData.update(t); cl.userData.update(t);
      lp.userData.update(t, th);
      ch.userData.update(t, stage.camera);
    };
    update(0);
    return { group, planet, surface: sf, update };
  }

  const props = { surface, grid, roads, trees, houses, clouds, lamps, chips, halo, caption, world };
  const factories = {};
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx, plan: globe, motion: globe };
}
