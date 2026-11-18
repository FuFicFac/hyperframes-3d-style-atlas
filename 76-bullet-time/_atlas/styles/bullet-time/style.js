// styles/bullet-time/style.js — "Bullet Time": a frozen splash in a white high-speed-photography studio.
//
// Props (all synchronous; nothing animates itself — the scene calls update(w) with WORLD time from timewarp.js):
//   studio()            calibration-grid floor + four softboxes on stands (parallax references for the camera arc)
//   bowl()              big white ceramic bowl (lathe)
//   ball()              striped ball; userData.update(w)
//   liquid(plan)        liquid surface (cavity + ripples), crown wall with lobes, rebound jet; userData.update(w)
//   droplets(plan)      instanced ballistic droplets + floor splats; userData.update(w)
//   world(plan)         all of the above in one group; userData.update(w)
//   caption()           overlay caption chip; userData.show(text, alpha)
//   gauge()             overlay two-clock gauge (CAMERA vs WORLD); userData.show({ cam, world, impact, mode }, alpha)
// The geometry is rewritten from w every frame (closed forms in timewarp.js): seek-safe in any order.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { gridTexture, paintPixels, canvasTexture } from "../../kit/textures.js";
import { createGround } from "../../kit/builders.js";
import { smoothstep } from "../../kit/time.js";
import * as timewarp from "./timewarp.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;

/** a (ring x profile) grid surface of revolution whose (r, y) profile is rewritten per ring each frame */
function revolveGrid(nTheta, nProfile, material) {
  const cols = nTheta + 1;
  const pos = new Float32Array(cols * nProfile * 3);
  const idx = [];
  for (let i = 0; i < nTheta; i++) for (let j = 0; j < nProfile - 1; j++) {
    const a = i * nProfile + j, b = (i + 1) * nProfile + j;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(cols * nProfile * 3), 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  const prof = new Float64Array(nProfile * 2);
  /** fill(profileAt(theta, out)): rewrite every vertex, recompute normals, weld the seam normals */
  mesh.userData.fill = (profileAt) => {
    for (let i = 0; i < cols; i++) {
      const th = (TAU * (i % nTheta)) / nTheta, c = Math.cos(th), s = Math.sin(th);
      profileAt(th, prof);
      for (let j = 0; j < nProfile; j++) {
        const o = (i * nProfile + j) * 3, r = prof[2 * j];
        pos[o] = r * c; pos[o + 1] = prof[2 * j + 1]; pos[o + 2] = r * s;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal.array, last = nTheta * nProfile * 3;
    for (let j = 0; j < nProfile * 3; j += 3) {
      const x = nrm[j] + nrm[last + j], y = nrm[j + 1] + nrm[last + j + 1], z = nrm[j + 2] + nrm[last + j + 2];
      const l = Math.hypot(x, y, z) || 1;
      nrm[j] = nrm[last + j] = x / l; nrm[j + 1] = nrm[last + j + 1] = y / l; nrm[j + 2] = nrm[last + j + 2] = z / l;
    }
    geo.attributes.normal.needsUpdate = true;
  };
  return mesh;
}

/**
 * createStyle(stage, opts?) -> style      opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- the set
  /** studio() -> Group: calibration-grid floor + softboxes on stands */
  function studio(o = {}) {
    const F = { ...spec.floor, ...o.floor }, SB = { ...spec.softboxes, ...o.softboxes };
    const g = new THREE.Group(); g.name = "studio";
    const cellsPerTile = F.major, tile = F.cell * cellsPerTile;
    const map = gridTexture({ size: 512, cells: cellsPerTile, line: F.line, bg: P.floor, fg: P.grid, major: cellsPerTile, majorColor: P.gridMajor, repeat: [F.size / tile, F.size / tile] });
    map.anisotropy = 16;
    materials.floor.map = map; materials.floor.needsUpdate = true;
    const floor = createGround({ size: F.size, material: materials.floor });
    g.add(floor);
    for (let i = 0; i < SB.n; i++) {
      const az = SB.az0 + (TAU * i) / SB.n;
      const box = new THREE.Group();
      const housing = new THREE.Mesh(new THREE.BoxGeometry(SB.w, SB.h, SB.d), materials.housing);
      housing.position.z = -SB.d / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(SB.w * 0.92, SB.h * 0.94), materials.softbox);
      face.position.z = 0.012;
      box.add(housing, face);
      box.position.set(SB.radius * Math.sin(az), SB.y, SB.radius * Math.cos(az));
      box.lookAt(0, SB.y * (1 - SB.tilt * 3), 0);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, SB.y, 12), materials.stand);
      stand.position.set((SB.radius + SB.d * 0.7) * Math.sin(az), SB.y / 2, (SB.radius + SB.d * 0.7) * Math.cos(az));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.05, 24), materials.stand);
      foot.position.set(stand.position.x, 0.025, stand.position.z);
      for (const m of [housing, stand, foot]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(box, stand, foot);
    }
    return g;
  }

  /** bowl() -> Mesh: white ceramic bowl, foot on the floor, rim at bowl.rimY */
  function bowl(o = {}) {
    const B = { ...spec.bowl, ...o };
    const pts = [];
    const n = 18;
    pts.push(new THREE.Vector2(0.001, 0.0));
    for (let k = 0; k <= n; k++) { const u = k / n; pts.push(new THREE.Vector2(B.footR + (B.rimR - B.footR) * Math.pow(u, B.curve), B.rimY * u)); }
    for (let k = 1; k < 8; k++) { const a = (Math.PI * k) / 8; pts.push(new THREE.Vector2(B.rimR - B.wall / 2 + (B.wall / 2) * Math.cos(a), B.rimY + (B.wall / 2) * Math.sin(a))); }
    pts.push(new THREE.Vector2(B.rimR - B.wall, B.rimY));
    pts.push(new THREE.Vector2(B.liquidR - 0.012, B.liquidY - 0.12));
    const mat = materials.ceramic.clone(); mat.side = THREE.DoubleSide; mat.name = "ceramic";
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, B.segments), mat);
    m.castShadow = true; m.receiveShadow = true; m.name = "bowl";
    return m;
  }

  /** ball() -> Mesh with userData.update(w, plan) */
  function ball(plan) {
    const BL = spec.ball;
    const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255); // sRGB display values
    const a = hex(P.ball), b = hex(P.ballStripe);
    const tex = canvasTexture(paintPixels([256, 128], (u, v) => (Math.abs(v - 0.5) < 0.085 || (Math.abs(u - 0.25) < 0.03 && v > 0.5) ? b : a)), { srgb: true });
    const mat = materials.ball; mat.map = tex; mat.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.SphereGeometry(BL.r, 48, 32), mat);
    m.castShadow = true; m.receiveShadow = true; m.name = "ball";
    m.userData.update = (w) => { const s = plan.ball(w); m.position.set(s.p[0], s.p[1], s.p[2]); m.rotation.set(0.5, 0, s.spin); };
    return m;
  }

  /** liquid(plan) -> Group (surface + crown + jet) with userData.update(w) */
  function liquid(plan) {
    const B = spec.bowl, C = spec.crown, RP = spec.ripples, J = spec.jet;
    const g = new THREE.Group(); g.name = "liquid";
    // -- surface: polar grid, axisymmetric height + analytic normals
    const NR = RP.rings, NT = RP.segments, cols = NT + 1;
    const pos = new Float32Array((NR + 1) * cols * 3), nrm = new Float32Array((NR + 1) * cols * 3);
    const idx = [];
    for (let i = 0; i < NR; i++) for (let j = 0; j < NT; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    sg.setIndex(idx);
    const surface = new THREE.Mesh(sg, materials.liquid);
    surface.receiveShadow = true; surface.frustumCulled = false; surface.name = "surface";
    const cs = Array.from({ length: cols }, (_, j) => [Math.cos((TAU * (j % NT)) / NT), Math.sin((TAU * (j % NT)) / NT)]);
    const fillSurface = (w) => {
      const e = 0.004;
      for (let i = 0; i <= NR; i++) {
        const r = (B.liquidR * i) / NR;
        const y = plan.surfaceY(r, w), sl = (plan.surfaceY(r + e, w) - plan.surfaceY(Math.max(0, r - e), w)) / (r > e ? 2 * e : e + r);
        const l = Math.hypot(sl, 1);
        for (let j = 0; j < cols; j++) {
          const o = (i * cols + j) * 3, c = cs[j][0], s = cs[j][1];
          // winding (a, a+1, b) faces +y; analytic normals from the radial slope
          pos[o] = r * c; pos[o + 1] = y; pos[o + 2] = r * s;
          nrm[o] = (-sl * c) / l; nrm[o + 1] = 1 / l; nrm[o + 2] = (-sl * s) / l;
        }
      }
      sg.attributes.position.needsUpdate = true; sg.attributes.normal.needsUpdate = true;
    };
    // -- crown and jet
    const crown = revolveGrid(C.segments, plan.M, materials.liquid); crown.name = "crown";
    const jet = revolveGrid(J.segments, plan.JM, materials.liquid); jet.name = "jet";
    g.add(surface, crown, jet);
    g.userData.update = (w) => {
      fillSurface(w);
      const st = plan.crown(w);
      crown.visible = !!st;
      if (st) crown.userData.fill((th, out) => plan.crownProfile(th, st, out));
      const js = plan.jet(w);
      jet.visible = !!js;
      if (js) jet.userData.fill((th, out) => plan.jetProfile(js, out));
    };
    return g;
  }

  /** droplets(plan) -> Group (instanced droplets + floor splats) with userData.update(w) */
  function droplets(plan) {
    const D = spec.droplets, n = plan.droplets.length;
    const g = new THREE.Group(); g.name = "droplets";
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), materials.droplet, n);
    drops.castShadow = true; drops.receiveShadow = true; drops.frustumCulled = false;
    const disc = new THREE.CircleGeometry(1, 28); disc.rotateX(-Math.PI / 2);
    const sm = materials.splat; sm.polygonOffset = true; sm.polygonOffsetFactor = -2; sm.polygonOffsetUnits = -2;
    const splats = new THREE.InstancedMesh(disc, sm, Math.max(1, plan.splats.length));
    splats.receiveShadow = true; splats.frustumCulled = false;
    g.add(drops, splats);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const o = {};
    g.userData.update = (w) => {
      for (let i = 0; i < n; i++) {
        plan.droplet(i, w, o);
        if (!o.on || o.s <= 0) { m4.makeScale(0, 0, 0); drops.setMatrixAt(i, m4); continue; }
        const sp = Math.hypot(o.v[0], o.v[1], o.v[2]);
        const st = Math.min(D.stretchMax, 1 + D.stretch * sp), sq = 1 / Math.sqrt(st);
        if (sp > 1e-6) { dir.set(o.v[0] / sp, o.v[1] / sp, o.v[2] / sp); q.setFromUnitVectors(up, dir); } else q.identity();
        p.set(o.p[0], o.p[1], o.p[2]); sc.set(o.r * sq * o.s, o.r * st * o.s, o.r * sq * o.s);
        m4.compose(p, q, sc); drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < splats.count; i++) {
        const s = plan.splats[i];
        const k = s ? smoothstep(0, D.splatIn, w - s.w) : 0;
        if (!(k > 0)) { m4.makeScale(0, 0, 0); splats.setMatrixAt(i, m4); continue; }
        q.setFromAxisAngle(up, -s.ax); p.set(s.x, 0.006, s.z); sc.set(s.r * 1.3 * k, 1, s.r * k);
        m4.compose(p, q, sc); splats.setMatrixAt(i, m4);
      }
      splats.instanceMatrix.needsUpdate = true;
    };
    return g;
  }

  /** world(plan) -> Group: studio + bowl + ball + liquid + droplets; userData.update(w) */
  function world(plan) {
    const g = new THREE.Group(); g.name = "world";
    const b = ball(plan), l = liquid(plan), d = droplets(plan);
    g.add(studio(), bowl(), b, l, d);
    g.userData.update = (w) => { b.userData.update(w); l.userData.update(w); d.userData.update(w); };
    return g;
  }

  // ---------------------------------------------------------------- overlay
  /** caption() -> overlay chip (dark plate, orange marker, white text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const mesh = screenCanvas(stage, Q.maxW + 40, Q.h + 24, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width), pad = Math.round(Q.cap * 0.7), mark = 16;
      const pw = Math.min(W - 16, pad + mark + pad * 0.6 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(20,23,28,0.18)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 14); x.fill();
      x.fillStyle = P.chip; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.fillStyle = P.accent; x.beginPath(); x.roundRect(ox + pad, oy + ph / 2 - 19, 9, 38, 3); x.fill();
      x.fillStyle = P.chipInk; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + mark + pad * 0.6, oy + ph / 2 + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  /**
   * gauge() -> overlay two-clock gauge. userData.show({ cam, world, impact (all 0..1), mode }, alpha):
   *   CAMERA track fills steadily; WORLD track's playhead stops, backs up and runs again; a mode icon per row.
   */
  function gauge(o = {}) {
    const Q = { ...spec.gauge, ...o };
    const icon = (x, cx, cy, mode, col) => {
      x.fillStyle = col;
      const tri = (x0, d) => { x.beginPath(); x.moveTo(x0, cy - 11); x.lineTo(x0 + 17 * d, cy); x.lineTo(x0, cy + 11); x.closePath(); x.fill(); };
      if (mode === "freeze") { x.fillRect(cx - 9, cy - 11, 7, 22); x.fillRect(cx + 3, cy - 11, 7, 22); }
      else if (mode === "rewind") { tri(cx + 1, -1); tri(cx + 15, -1); }
      else if (mode === "slow") { x.fillRect(cx - 12, cy - 11, 5, 22); tri(cx - 3, 1); }
      else tri(cx - 7, 1);
    };
    const mesh = screenCanvas(stage, Q.w, Q.h, (x, W, H, st) => {
      x.fillStyle = "rgba(20,23,28,0.94)"; x.beginPath(); x.roundRect(0, 0, W, H, 14); x.fill();
      const x0 = Q.pad + Q.labelW, x1 = W - Q.pad - Q.iconW, len = x1 - x0;
      const rows = [H * 0.31, H * 0.69];
      x.font = `700 ${Q.label}px ${Q.font}`; x.textBaseline = "middle"; x.textAlign = "left";
      rows.forEach((cy, i) => {
        x.fillStyle = "#c9d1dd"; x.fillText(Q.names[i], Q.pad, cy + 1);
        x.fillStyle = P.track; x.beginPath(); x.roundRect(x0, cy - Q.barH / 2, len, Q.barH, Q.barH / 2); x.fill();
      });
      // camera clock: always running
      x.fillStyle = "#ffffff"; x.beginPath(); x.roundRect(x0, rows[0] - Q.barH / 2, Math.max(Q.barH, (len * st.c) / 1000), Q.barH, Q.barH / 2); x.fill();
      icon(x, x1 + Q.iconW / 2 + 6, rows[0], "play", "#ffffff");
      // world clock: playhead that stops, reverses, runs
      const wx = x0 + (len * st.w) / 1000, zx = x0 + (len * st.z) / 1000;
      x.fillStyle = P.world; x.beginPath(); x.roundRect(x0, rows[1] - Q.barH / 2, Math.max(Q.barH, wx - x0), Q.barH, Q.barH / 2); x.fill();
      x.fillStyle = "#ffffff"; x.fillRect(Math.round(zx) - 1, rows[1] - Q.barH / 2 - 6, 3, Q.barH + 12);
      x.fillStyle = P.accent; x.beginPath(); x.arc(wx, rows[1], Q.barH * 0.95, 0, TAU); x.fill();
      icon(x, x1 + Q.iconW / 2 + 6, rows[1], st.m, st.m === "play" ? "#ffffff" : P.accent);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (s, a = 1) => {
      mesh.userData.set({ c: Math.round(s.cam * 1000), w: Math.round(s.world * 1000), z: Math.round(s.impact * 1000), m: s.mode });
      mesh.userData.opacity(a);
    };
    return mesh;
  }

  const props = { studio, bowl, ball, liquid, droplets, world, caption, gauge };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: timewarp, motion: timewarp,
  };
}
