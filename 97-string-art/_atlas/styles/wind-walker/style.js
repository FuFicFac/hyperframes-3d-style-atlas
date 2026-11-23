// styles/wind-walker/style.js — "Wind Walker": a wind-driven walking sculpture on a low-tide beach.
// All numbers live in spec.js; all motion comes from linkage.js (pure planner). Props never animate themselves:
// the scene calls userData.update(t, ...) and every pose is a pure function of t.
//   props.beach()            sand (ripple texture + bump), wet band, sea, surf line, sky dome with a mist veil
//   props.walker(plan)       the creature: static tube frame + crankshaft, 12 linkage legs (instanced tubes, pins, cable
//                            ties, feet) and the sail row.  userData.update(t, pose)
//   props.diagram(plan)      the hero leg as a diagram: ink centre-lines, joint rings, pivots, crank circle, the H–T–F ray,
//                            the foot loop + tracer loop traced as glowing paths, a glowing foot marker.  update(t, levels)
//   props.footprints(plan)   one soft dimple per touchdown (instanced).  update(t)
//   props.caption()          overlay caption chip (exact colours).  userData.show(text, alpha)
//   helpers.setMist(clear, dist), helpers.follow(x, camera)
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { screenLines } from "../../kit/lines.js";
import { paintPixels, canvasTexture, blobTexture } from "../../kit/textures.js";
import { fbm2 } from "../../kit/noise.js";
import { clamp, hash01, smoothstep } from "../../kit/time.js";
import * as linkage from "./linkage.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const srgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ------------------------------------------------------------------ instanced tubes (unit cylinder along +Y)
function tubeBatch(material, capacity, radial = 10, name = "tubes") {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, radial, 1, false), material, capacity);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let n = 0;
  mesh.userData.reset = () => { n = 0; };
  /** add a tube from a to b ([x,y,z]) of radius r; returns its index */
  mesh.userData.add = (a, b, r) => {
    d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    if (len > 1e-9) q.setFromUnitVectors(up, d.divideScalar(len)); else q.identity();
    p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    s.set(r, Math.max(len, 1e-6), r);
    m.compose(p, q, s);
    if (n >= capacity) throw new Error(`wind-walker: ${name} batch full (${capacity})`);
    mesh.setMatrixAt(n, m);
    return n++;
  };
  mesh.userData.commit = () => { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; };
  return mesh;
}

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const L = spec.linkage, G = spec.gait, B = spec.build;
  const fog = stage.scene.fog;
  let mistVeil = null, skyDome = null;

  // ================================================================ beach
  function beach() {
    const Q = spec.beach, g = new THREE.Group();
    g.name = "beach";
    const sandC = srgb(P.sand), wetC = srgb(P.sandWet), lightC = srgb(P.sandLight);
    const per = 6;
    const ripple = (u, v) => {
      const w = fbm2(u * per, v * per, { seed: Q.seed, octaves: 3, period: per });
      const w2 = fbm2(u * per * 3, v * per * 3, { seed: Q.seed + 9, octaves: 2, period: per * 3 });
      return Math.sin(TAU * (Q.ripples * v + Q.rippleWarp * w + 0.25 * w2));
    };
    const colour = paintPixels(Q.texture, (u, v) => {
      const r = ripple(u, v);
      const b = fbm2(u * 4, v * 4, { seed: Q.seed + 31, octaves: 4, period: 4 });
      const wet = smoothstep(0.46, 0.66, b) * Q.blotch;
      const grain = (hash01(Math.floor(u * Q.texture), Math.floor(v * Q.texture), Q.seed) - 0.5) * 0.035;
      let c = mix3(sandC, wetC, wet);
      c = mix3(c, r > 0 ? lightC : wetC, Math.abs(r) * Q.rippleDepth * (r > 0 ? 1.3 : 1.6));
      return [c[0] + grain, c[1] + grain, c[2] + grain];
    });
    const bump = paintPixels(Q.texture / 2, (u, v) => 0.5 + 0.5 * ripple(u, v));
    const rep = [Q.size / Q.tile, Q.size / Q.tile];
    const mat = materials.sand;
    mat.map = canvasTexture(colour, { repeat: rep, anisotropy: 16 });
    mat.bumpMap = canvasTexture(bump, { repeat: rep, srgb: false, anisotropy: 8 });
    mat.bumpScale = Q.bump;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(Q.size, Q.size), mat);
    sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true; sand.name = "sand";
    g.add(sand);
    // wet band, surf line and sea behind the creature (−z)
    const flat = (w, d, z, y, m) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); o.rotation.x = -Math.PI / 2; o.position.set(0, y, z - d / 2); g.add(o); return o; };
    const wetMat = new THREE.MeshStandardMaterial({ color: P.sandWet, roughness: 0.55, transparent: true, opacity: 0.55, depthWrite: false });
    flat(Q.size, Q.wetBand, Q.seaZ + Q.wetBand, 0.006, wetMat).renderOrder = 1;
    flat(Q.size, Q.seaDepth, Q.seaZ, 0.012, materials.sea);
    flat(Q.size, Q.surf, Q.seaZ + Q.surf * 0.5, 0.016, new THREE.MeshStandardMaterial({ color: P.surf, roughness: 0.8 }));
    flat(Q.size, Q.surf * 0.5, Q.seaZ - 3.2, 0.016, new THREE.MeshStandardMaterial({ color: P.surf, roughness: 0.8, transparent: true, opacity: 0.7 }));

    // sky dome: world-space gradient + faint cloud streaks; a veil sphere of the mist colour hides it in the opening
    const K = spec.sky, top = srgb(K.top), mid = srgb(K.mid), hor = srgb(K.horizon);
    const skyTex = canvasTexture(paintPixels([1024, 512], (u, v) => {
      const el = 1 - 2 * v;                       // +1 zenith .. −1 nadir
      if (el < -0.02) return hor;
      const e = clamp(el, 0, 1);
      let c = e < 0.22 ? mix3(hor, mid, smoothstep(0, 0.22, e)) : mix3(mid, top, smoothstep(0.22, 0.85, e));
      const n = fbm2(u * 8, e * 26, { seed: K.seed, octaves: 4, period: 8 });
      const streak = smoothstep(0.55, 0.78, n) * smoothstep(0.04, 0.16, e) * (1 - smoothstep(0.42, 0.7, e)) * K.cloud;
      c = mix3(c, [1, 1, 1], streak);
      return c;
    }), { anisotropy: 4 });
    skyTex.wrapT = THREE.ClampToEdgeWrapping;
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(K.radius, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    skyDome.name = "sky"; skyDome.renderOrder = -10; skyDome.frustumCulled = false;
    mistVeil = new THREE.Mesh(new THREE.SphereGeometry(K.radius * 0.97, 24, 12), new THREE.MeshBasicMaterial({ color: P.mist, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 1 }));
    mistVeil.name = "mistVeil"; mistVeil.renderOrder = -9; mistVeil.frustumCulled = false;
    g.add(skyDome, mistVeil);
    return g;
  }

  // ================================================================ the creature
  /** walker(plan) -> Group (body frame: origin on the crank axis). userData.update(t, pose) */
  function walker(plan) {
    const gait = plan.gait, legs = gait.legs, nS = G.stations;
    const body = new THREE.Group();
    body.name = "walker";
    const zS = (s) => (s - (nS - 1) / 2) * G.spacing;
    const zF = (f) => (f - nS / 2) * G.spacing;           // frame planes sit between / outside the stations (nS + 1 of them)
    const z0 = zF(0) - B.overhang * 0.3, z1 = zF(nS) + B.overhang * 0.3;
    const Pf = [L.pivot[0], L.pivot[1]], Pa = [-L.pivot[0], L.pivot[1]], H = [L.hip[0], L.hip[1]];

    // ---- static frame: rails, A-frames, crankshaft journals, masts, booms
    const S = spec.sails, nF = nS + 1;
    const frame = tubeBatch(materials.tube, 3 + nF * 3 + nF + nF * 3 + 8, 12, "frame");
    const ties = tubeBatch(materials.tie, 400, 10, "ties");
    const tieOn = (a, b, at, r) => {       // a cable tie wrapped round tube a->b at distance `at` from a
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d) || 1, u = d.map((v) => v / len);
      const c = a.map((v, i) => v + u[i] * at), h = B.tieLen / 2;
      ties.userData.add(c.map((v, i) => v - u[i] * h), c.map((v, i) => v + u[i] * h), r * B.tieR);
    };
    const staticTies = [];
    const fAdd = (a, b, r, tie = true) => { frame.userData.add(a, b, r); if (tie) staticTies.push([a, b, r]); };
    fAdd([Pf[0], Pf[1], z0], [Pf[0], Pf[1], z1], B.railR, false);
    fAdd([Pa[0], Pa[1], z0], [Pa[0], Pa[1], z1], B.railR, false);
    fAdd([H[0], H[1], z0], [H[0], H[1], z1], B.railR, false);
    const masts = [];
    for (let f = 0; f < nF; f++) {
      const z = zF(f);
      fAdd([Pa[0], Pa[1], z], [Pf[0], Pf[1], z], B.tubeR * 1.15);
      fAdd([Pf[0], Pf[1], z], [H[0], H[1], z], B.tubeR * 1.15);
      fAdd([Pa[0], Pa[1], z], [H[0], H[1], z], B.tubeR * 1.15);
      // crankshaft journal between the crank webs of neighbouring stations
      const a = f === 0 ? z0 : zS(f - 1) + B.crankWeb, b = f === nF - 1 ? z1 : zS(f) - B.crankWeb;
      fAdd([0, 0, a], [0, 0, b], B.tubeR * 1.2, false);
      // mast + boom + gaff
      const h = S.height[0] + S.height[1] * Math.sin((Math.PI * (f + 0.5)) / nF);
      const base = [H[0], H[1] + S.mastBase, z], topP = [H[0] + S.lean, H[1] + h, z];
      const along = (k) => base.map((v, i) => v + (topP[i] - v) * k);
      const dir = [-Math.cos(S.yaw), 0, Math.sin(S.yaw)];
      const tack = along(S.boomAt / h), head = along(0.97);
      const clew = [tack[0] + dir[0] * S.boom, tack[1] + S.boomRise, tack[2] + dir[2] * S.boom];
      const peak = [head[0] + dir[0] * S.gaff, head[1] - 0.04, head[2] + dir[2] * S.gaff];
      fAdd(base, topP, B.mastR);
      fAdd(tack, clew, B.mastR * 0.85);
      fAdd(head, peak, B.mastR * 0.8);
      masts.push({ f, tack, head, clew, peak });
    }
    frame.userData.commit();
    body.add(frame);

    // ---- legs: dynamic tubes, pins, feet (+ dynamic cable ties appended after the static ones)
    const sticks = linkage.STICKS.filter((s) => s[3] !== "crank");
    const tubes = tubeBatch(materials.tube, legs.length * sticks.length + nS * 3, 10, "legs");
    const pins = tubeBatch(materials.pin, legs.length * linkage.JOINTS.length + nS, 8, "pins");
    const feet = tubeBatch(materials.foot, legs.length, 20, "feet");
    body.add(tubes, pins, feet, ties);

    // ---- sails (cloth grids rewritten from t)
    const [nu, nv] = S.grid, sails = [];
    for (const m of masts) {
      const geo = new THREE.PlaneGeometry(1, 1, nu, nv);
      const mat = materials.sail.clone();
      mat.color.set(P[S.colors[m.f % S.colors.length]] ?? P.sail);
      mat.name = `sail${m.f}`;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = `sail${m.f}`;
      const e1 = m.clew.map((v, i) => v - m.tack[i]), e2 = m.head.map((v, i) => v - m.tack[i]);
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n); n = n.map((v) => v / nl);
      if (n[0] < 0) n = n.map((v) => -v);              // belly downwind (+x)
      sails.push({ ...m, mesh, n });
      body.add(mesh);
    }
    const gustAt = (t) => smoothstep(S.gust.t, S.gust.t + S.gust.dur, t);
    const updateSails = (t) => {
      const g = gustAt(t), belly = S.billow[0] + (S.billow[1] - S.billow[0]) * g + 0.025 * Math.sin(TAU * 0.31 * t);
      for (const s of sails) {
        const pos = s.mesh.geometry.attributes.position;
        let i = 0;
        for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++, i++) {
          const u = iu / nu, v = 1 - iv / nv;      // PlaneGeometry rows run top -> bottom
          const lo = [s.tack[0] + (s.clew[0] - s.tack[0]) * u, s.tack[1] + (s.clew[1] - s.tack[1]) * u, s.tack[2] + (s.clew[2] - s.tack[2]) * u];
          const hi = [s.head[0] + (s.peak[0] - s.head[0]) * u, s.head[1] + (s.peak[1] - s.head[1]) * u, s.head[2] + (s.peak[2] - s.head[2]) * u];
          const wv = Math.sin(Math.PI * v) ** 0.8, wu = Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.02)) ** 0.9;
          const leech = u * u * (0.35 + 0.65 * wv);
          const fl = S.flutter * (0.5 + g) * leech * Math.sin(TAU * (S.flutterHz * t - 1.6 * u - 0.9 * v) + s.f * 1.7);
          const d = belly * wu * wv * (0.75 + 0.25 * v) + fl;
          pos.setXYZ(i, lo[0] + (hi[0] - lo[0]) * v + s.n[0] * d, lo[1] + (hi[1] - lo[1]) * v + s.n[1] * d, lo[2] + (hi[2] - lo[2]) * v + s.n[2] * d);
        }
        pos.needsUpdate = true;
        s.mesh.geometry.computeVertexNormals();
      }
    };

    const nStaticTies = (() => { for (const [a, b, r] of staticTies) { const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); tieOn(a, b, B.tieInset, r); tieOn(a, b, len - B.tieInset, r); } return staticTies.length * 2; })();

    function update(t, pose) {
      const th = pose.theta;
      body.position.set(pose.x, pose.y, 0);
      tubes.userData.reset(); pins.userData.reset(); feet.userData.reset();
      // rebuild the dynamic ties after the static ones (same order every frame)
      ties.userData.reset();
      for (const [a, b, r] of staticTies) { const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); tieOn(a, b, B.tieInset, r); tieOn(a, b, len - B.tieInset, r); }
      // crank webs + pins, one per station
      for (let s = 0; s < nS; s++) {
        const z = zS(s), ang = gait.dir * th + s * G.phaseStep;
        const A = [L.crank * Math.cos(ang), L.crank * Math.sin(ang)];
        tubes.userData.add([0, 0, z - B.crankWeb], [A[0], A[1], z - B.crankWeb], B.tubeR * 1.2);
        tubes.userData.add([0, 0, z + B.crankWeb], [A[0], A[1], z + B.crankWeb], B.tubeR * 1.2);
        tubes.userData.add([A[0], A[1], z - B.crankWeb - 0.02], [A[0], A[1], z + B.crankWeb + 0.02], B.tubeR * 0.9);
      }
      for (let j = 0; j < legs.length; j++) {
        const lg = legs[j], J = gait.leg(j, th), zl = (layer) => lg.z + lg.side * layer * B.layer;
        for (const [a, b, layer] of sticks) {
          const pa = [J[a][0], J[a][1], zl(layer)], pb = [J[b][0], J[b][1], zl(layer)];
          if (b === "F") pb[1] += B.footH * 0.6;
          tubes.userData.add(pa, pb, B.tubeR);
          const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
          if (len > B.tieInset * 3) { tieOn(pa, pb, B.tieInset, B.tubeR); tieOn(pa, pb, len - B.tieInset, B.tubeR); }
        }
        for (const k of linkage.JOINTS) {
          if (k === "A") continue;
          pins.userData.add([J[k][0], J[k][1], zl(0.5)], [J[k][0], J[k][1], zl(3.5)], B.pinR);
        }
        feet.userData.add([J.F[0], J.F[1], zl(2)], [J.F[0], J.F[1] + B.footH, zl(2)], B.footR);
      }
      tubes.userData.commit(); pins.userData.commit(); feet.userData.commit(); ties.userData.commit();
      updateSails(t);
    }
    void nStaticTies;
    body.userData.update = update;
    body.userData.masts = masts;
    body.userData.legZ = (j, layer = 2) => legs[j].z + legs[j].side * layer * B.layer;
    return body;
  }

  // ================================================================ the hero leg as a diagram
  /** diagram(plan, body) -> { update(t, { ink, glow, loopT0 }) }; lines are parented to the body group */
  function diagram(plan, body) {
    const D = spec.diagram, gait = plan.gait, j = plan.hero, lg = gait.legs[j];
    const z = lg.z + lg.side * 2 * B.layer;
    const grp = new THREE.Group();
    grp.name = "diagram";
    body.add(grp);
    const P3 = (p) => [p[0], p[1], z];
    const circle = (c, r, n = 20) => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos((i / n) * TAU), c[1] + r * Math.sin((i / n) * TAU), z]);
    const line = (polys, o) => { const m = screenLines(stage, polys, { depth: "none", blending: "normal", order: "parallel", renderOrder: 6, ...o }); grp.add(m); return m; };
    const J0 = gait.leg(j, 0);
    // static: crank circle (dashed), fixed pivots O / P / H with a ground mark
    const ground = (p) => {
      const r = D.pivot, w = r * 1.9, y = p[1] - r * 2.4;
      const out = [circle(p, r, 16), [[p[0], p[1] - r, z], [p[0] - w * 0.7, y, z]], [[p[0], p[1] - r, z], [p[0] + w * 0.7, y, z]], [[p[0] - w, y, z], [p[0] + w, y, z]]];
      for (let h = -2; h <= 2; h++) out.push([[p[0] + h * w * 0.4 + w * 0.1, y, z], [p[0] + h * w * 0.4 - w * 0.2, y - r * 0.8, z]]);
      return out;
    };
    const fixed = line([...ground(J0.O), ...ground(J0.P), ...ground(J0.H)], { width: D.ink.ring, color: P.ink });
    const crankCircle = line([circle([0, 0], L.crank, 48)], { width: D.ink.circle, color: P.inkSoft, dash: D.ink.dash });
    // dynamic: bars, joint rings, the H–T–F ray
    const barPolys = (J) => [[J.O, J.A], [J.A, J.B, J.T], [J.P, J.B], [J.H, J.M, J.K], [J.K, J.N, J.F], [J.M, J.T], [J.T, J.N]].map((pl) => pl.map(P3));
    const ringPolys = (J) => ["A", "B", "T", "M", "K", "N", "F"].map((k) => circle(J[k], D.ring, 12));
    const bars = line(barPolys(J0), { width: D.ink.bar, color: P.ink });
    const rings = line(ringPolys(J0), { width: D.ink.ring, color: P.ink });
    const ray = line([[P3(J0.H), P3(J0.F)]], { width: D.ink.ray, color: P.inkSoft, dash: D.ink.rayDash });
    // the loops (body frame), starting where the foot is at loopT0
    let loopT0 = null, loopF = null, loopH = null, loopT = null, ptsF = null;
    const buildLoops = (t0) => {
      loopT0 = t0;
      ptsF = plan.loop(j, 240, "F", t0);
      const ptsT = plan.loop(j, 240, "T", t0);
      for (const m of [loopF, loopH, loopT]) if (m) { grp.remove(m); m.geometry.dispose(); }
      loopH = line([ptsF.map(P3)], { width: D.loop.halo, color: P.glow, level: D.loop.haloLevel, renderOrder: 4 });
      loopF = line([ptsF.map(P3)], { width: D.loop.width, color: P.glow, renderOrder: 5 });
      loopT = line([ptsT.map(P3)], { width: D.loop.tracer, color: P.glow, renderOrder: 5 });
    };
    const spark = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), materials.spark);
    spark.name = "footSpark"; spark.castShadow = false;
    grp.add(spark);
    return {
      group: grp,
      update(t, { ink = 1, glow = 1, t0 = 0 } = {}) {
        if (loopT0 !== t0) buildLoops(t0);
        const J = gait.leg(j, plan.clock.theta(t));
        bars.userData.setPolys(barPolys(J)); rings.userData.setPolys(ringPolys(J)); ray.userData.setPolys([[P3(J.H), P3(J.F)]]);
        for (const m of [bars, rings, ray, fixed, crankCircle]) m.userData.setLevel(ink);
        ray.userData.setLevel(ink * 0.9);
        const p = plan.loopProgress(ptsF, t, t0);
        for (const m of [loopF, loopH, loopT]) { m.userData.setProgress(p); m.userData.setLevel(glow); }
        loopH.userData.setLevel(glow);
        const s = D.spark * glow;
        spark.visible = s > 1e-4;
        spark.scale.setScalar(Math.max(s, 1e-4));
        spark.position.set(J.F[0], J.F[1] + D.spark * 0.6, z + B.footR + 0.03);
      },
    };
  }

  // ================================================================ footprints
  function footprints(plan) {
    const Q = spec.prints, n = plan.prints.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: blobTexture({ stops: [[0, 1], [0.45, 0.9], [0.75, 0.35], [1, 0]] }), color: P.print, transparent: true, opacity: Q.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = "footprint";
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    mesh.name = "footprints"; mesh.frustumCulled = false; mesh.renderOrder = 2;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
    const legZ = (pr) => pr.z + pr.side * 2 * B.layer;
    mesh.userData.update = (t) => {
      let c = 0;
      for (let i = 0; i < n; i++) {
        const pr = plan.prints[i];
        if (pr.t > t) break;                       // prints are sorted by time
        const k = smoothstep(0, Q.pop, t - pr.t);
        q.setFromAxisAngle(yAxis, (hash01(pr.leg, pr.n + 99) - 0.5) * 0.9);
        p.set(pr.x, Q.y, legZ(pr));
        s.set(Q.w * (0.6 + 0.4 * k), 1, Q.d * (0.6 + 0.4 * k));
        m.compose(p, q, s);
        mesh.setMatrixAt(c++, m);
      }
      mesh.count = c;
      mesh.instanceMatrix.needsUpdate = true;
    };
    return mesh;
  }

  // ================================================================ overlay caption chip (bottom-left)
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), mark = 30;
      const pw = Math.min(W - 16, pad + mark + pad * 0.6 + tw + pad), ph = Q.h, ox = 6, oy = 6, r = ph / 2;
      x.fillStyle = "rgba(23,38,74,0.16)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, r); x.fill();
      x.fillStyle = P.chip; x.beginPath(); x.roundRect(ox, oy, pw, ph, r); x.fill();
      // the mark: a little crank — circle, arm, pin
      const mx = ox + pad + 13, my = oy + ph / 2;
      x.strokeStyle = P.ink; x.lineWidth = 4; x.beginPath(); x.arc(mx, my, 15, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = P.glow; x.lineWidth = 5; x.lineCap = "round"; x.beginPath(); x.moveTo(mx, my); x.lineTo(mx + 10.6, my - 10.6); x.stroke();
      x.fillStyle = P.glow; x.beginPath(); x.arc(mx + 10.6, my - 10.6, 5.5, 0, Math.PI * 2); x.fill();
      x.fillStyle = P.chipInk; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, mx + mark * 0.6 + pad * 0.6, my + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ================================================================ helpers
  const sun = lights.sun, sunBase = spec.lights.find((l) => l.id === "sun");
  const helpers = {
    /** setMist(clear 0..1, dist): clear 0 = fog begins just behind a plane `dist` from the camera; 1 = the spec's haze */
    setMist(clear, dist) {
      const M = spec.mist, F = spec.world.fog, e = clamp(clear);
      const n0 = dist + M.near, f0 = dist + M.far;
      fog.near = n0 * (F.near / n0) ** e;
      fog.far = f0 * (F.far / f0) ** e;
      if (mistVeil) { mistVeil.material.opacity = 1 - smoothstep(0.15, 0.85, e); mistVeil.visible = mistVeil.material.opacity > 0.002; }
    },
    /** follow(x, camera): keep the sun's shadow box on the creature and the sky centred on the camera */
    follow(x, camera) {
      sun.position.set(sunBase.position[0] + x, sunBase.position[1], sunBase.position[2]);
      sun.target.position.set(sunBase.target[0] + x, sunBase.target[1], sunBase.target[2]);
      sun.target.updateMatrixWorld();
      if (skyDome && camera) { skyDome.position.copy(camera.position); mistVeil.position.copy(camera.position); }
    },
  };

  const props = { beach, walker, diagram, footprints, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    helpers, plan: linkage, motion: linkage,
  };
}
