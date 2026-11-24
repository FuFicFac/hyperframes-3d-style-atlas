// styles/tessellation-morph/style.js — "Tessellation Morph": a wall of interlocking, bevelled cut-paper tiles in two
// colours whose shared edge curves morph (plain tile -> fish -> bird) without ever opening a gap. The geometry is
// planned in tiling.js (pure, Node-safe); this file only turns a plan's frame(t) into meshes.
//
// Props never animate themselves: the scene calls wall.userData.update(t) and caption.userData.show(...).
//   wall(plan)  -> Group: one dynamic tile mesh (bevelled tops, chamfers, side walls; folded + flown for flying tiles),
//                 one ink mesh (eyes, gill / wing lines, beak — scaled in by detailWeight), the coral backing plane.
//   caption()   -> overlay plate: label + a morph slider whose ticks are tiny silhouettes of the key shapes.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { clamp, hash01 } from "../../kit/time.js";
import * as tilingPlan from "./tiling.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const hexRGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }; // linear (Color converts sRGB hex)

/**
 * createStyle(stage, opts?) -> style   (opts: { post = true })
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, TL = spec.tile;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  if (materials.tile.map) { materials.tile.map.wrapS = materials.tile.map.wrapT = THREE.RepeatWrapping; }
  materials.tile.shadowSide = THREE.DoubleSide;

  /** the style's tiling (key shapes from the spec) — scene.config.js builds the same one in Node */
  const makeTiling = () => tilingPlan.makeTiling({ a: spec.tiling.a, b: spec.tiling.b, keys: spec.tiling.keys, per: spec.tiling.per });

  // ------------------------------------------------------------------------------------------------ the wall
  function wall(plan, o = {}) {
    const { tiles, n, size, tiling } = plan;
    const R = 4 * n, NT = tiles.length, V = 5 * R;              // per tile: top R, chamfer 2R, side 2R
    const half = 2 * n + 1, topTris = 2 * (half - 2), triPer = topTris + 4 * R;
    const pos = new Float32Array(NT * V * 3), col = new Float32Array(NT * V * 3), uv = new Float32Array(NT * V * 2);
    const idx = new Uint32Array(NT * triPer * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(NT * V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geo, materials.tile);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = "tiles";

    // static: colours (per tile tint; chamfer and side a touch darker) + the side / chamfer index pattern
    const cream = hexRGB(P.cream), navy = hexRGB(P.navy);
    tiles.forEach((T, k) => {
      const base = T.parity ? navy : cream, tint = 1 + TL.tint * (hash01(T.i, T.j, 7) - 0.5) * 2;
      for (let v = 0; v < V; v++) {
        const f = tint * (v < R ? 1 : v < 3 * R ? TL.chamferShade : TL.sideShade);
        const o3 = (k * V + v) * 3;
        col[o3] = base[0] * f; col[o3 + 1] = base[1] * f; col[o3 + 2] = base[2] * f;
      }
      let w = (k * triPer + topTris) * 3;
      const b0 = k * V;
      for (const [r0, r1] of [[R, 2 * R], [3 * R, 4 * R]]) {     // quads between ring r0 (upper) and ring r1 (lower)
        for (let q = 0; q < R; q++) {
          const q2 = (q + 1) % R, a = b0 + r0 + q, b = b0 + r0 + q2, c = b0 + r1 + q, d = b0 + r1 + q2;
          idx[w++] = a; idx[w++] = c; idx[w++] = b;  idx[w++] = b; idx[w++] = c; idx[w++] = d;
        }
      }
    });

    // ---- ink: eyes, strokes, beak per tile for every key shape that has details (templates in cell units)
    const keyDetails = spec.tiling.keys.map((K, ki) => ({ ki, d: K.details ?? [] })).filter((x) => x.d.length);
    const prims = [];   // { ki, colour: "ink"|"beak", c: [cx, cy], verts: [[x, y]...], tris: [[a,b,c]...] }
    for (const { ki, d } of keyDetails) {
      for (const D of d) {
        if (D.type === "eye") {
          const S = 18, verts = [[D.at[0], D.at[1]]], tris = [];
          for (let s = 0; s < S; s++) { const an = (s / S) * Math.PI * 2; verts.push([D.at[0] + D.r * Math.cos(an), D.at[1] + D.r * Math.sin(an)]); }
          for (let s = 0; s < S; s++) tris.push([0, 1 + s, 1 + ((s + 1) % S)]);
          prims.push({ ki, colour: "ink", c: D.at, verts, tris });
        } else if (D.type === "stroke") {
          const p = D.pts, verts = [], tris = [];
          for (let i = 0; i < p.length; i++) {
            const pa = p[Math.max(0, i - 1)], pb = p[Math.min(p.length - 1, i + 1)];
            let dx = pb[0] - pa[0], dy = pb[1] - pa[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
            const taper = i === 0 || i === p.length - 1 ? 0.55 : 1, hw = (D.w / 2) * taper;
            verts.push([p[i][0] - dy * hw, p[i][1] + dx * hw], [p[i][0] + dy * hw, p[i][1] - dx * hw]);
            if (i) { const a = 2 * (i - 1); tris.push([a, a + 1, a + 2], [a + 1, a + 3, a + 2]); }
          }
          const c = p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]);
          prims.push({ ki, colour: "ink", c, verts, tris });
        } else if (D.type === "beak") {
          const c = D.pts.reduce((s, q) => [s[0] + q[0] / 3, s[1] + q[1] / 3], [0, 0]);
          prims.push({ ki, colour: "beak", c, verts: D.pts, tris: [[0, 1, 2]] });
        }
      }
    }
    const IV = prims.reduce((s, p) => s + p.verts.length, 0), IT = prims.reduce((s, p) => s + p.tris.length, 0);
    const ipos = new Float32Array(NT * IV * 3), icol = new Float32Array(NT * IV * 3), iidx = new Uint32Array(NT * IT * 3);
    const beak = hexRGB(P.accent);
    tiles.forEach((T, k) => {
      const inkC = T.parity ? cream : hexRGB(P.ink);
      let v0 = k * IV, w = k * IT * 3;
      for (const pr of prims) {
        const c = pr.colour === "beak" ? beak : inkC;
        for (let v = 0; v < pr.verts.length; v++) { const o3 = (v0 + v) * 3; icol[o3] = c[0]; icol[o3 + 1] = c[1]; icol[o3 + 2] = c[2]; }
        for (const tr of pr.tris) {
          // orient CCW (+Z facing)
          const A = pr.verts[tr[0]], B = pr.verts[tr[1]], C = pr.verts[tr[2]];
          const ccw = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) > 0;
          iidx[w++] = v0 + tr[0]; iidx[w++] = v0 + (ccw ? tr[1] : tr[2]); iidx[w++] = v0 + (ccw ? tr[2] : tr[1]);
        }
        v0 += pr.verts.length;
      }
    });
    const igeo = new THREE.BufferGeometry();
    igeo.setAttribute("position", new THREE.BufferAttribute(ipos, 3).setUsage(THREE.DynamicDrawUsage));
    igeo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(NT * IV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    igeo.setAttribute("color", new THREE.BufferAttribute(icol, 3));
    igeo.setIndex(new THREE.BufferAttribute(iidx, 1));
    const ink = new THREE.Mesh(igeo, materials.ink);
    ink.receiveShadow = true; ink.castShadow = false; ink.frustumCulled = false; ink.name = "ink";
    materials.ink.polygonOffset = true; materials.ink.polygonOffsetFactor = -2; materials.ink.polygonOffsetUnits = -2;

    // ---- coral backing (shows only through the holes flying tiles leave)
    const B = plan.bounds, pad = 3;
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 + 2 * pad, B.y1 - B.y0 + 2 * pad), materials.backing);
    backing.position.set((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, -0.01); backing.receiveShadow = true; backing.name = "backing";

    const group = new THREE.Group(); group.name = "tessellation-wall";
    group.add(backing, mesh, ink);

    // ---- per-frame scratch (fully rewritten from t every call)
    const ring = new Float64Array(2 * R), inset = new Float64Array(2 * R);
    const contourLo = Array.from({ length: half }, () => new THREE.Vector2()), contourUp = Array.from({ length: half }, () => new THREE.Vector2());
    const bw = TL.bevelW, bh = TL.bevelH, uvs = 1 / TL.uvScale;
    const nrm = geo.attributes.normal.array, inrm = igeo.attributes.normal.array;

    // flight transform: fold about the body chord K -> K + a + b (at the top face), then rotate about the tile centre and move
    const xf = { on: false, kx: 0, ky: 0, ux: 1, uy: 0, h: 0, c: 1, s: 0, cx: 0, cy: 0, m: new THREE.Matrix4(), v: new THREE.Vector3(), e: new THREE.Euler() };
    function setFlight(T, h, pose) {
      xf.on = !!pose;
      if (!pose) return;
      const N = [T.kx + (tiling.a[0] + tiling.b[0]) * size, T.ky + (tiling.a[1] + tiling.b[1]) * size];
      const L = Math.hypot(N[0] - T.kx, N[1] - T.ky);
      xf.kx = T.kx; xf.ky = T.ky; xf.ux = (N[0] - T.kx) / L; xf.uy = (N[1] - T.ky) / L; xf.h = h;
      xf.c = Math.cos(pose.flap); xf.s = Math.sin(pose.flap); xf.cx = T.cx; xf.cy = T.cy;
      xf.e.set(pose.roll, pose.pitch, pose.yaw, "ZYX");
      xf.m.makeRotationFromEuler(xf.e).setPosition(T.cx + pose.x, T.cy + pose.y, h + pose.z);
    }
    // side: +1 upper half, -1 lower half, 0 = decide by position
    function put(arr, o3, x, y, z, side) {
      if (!xf.on) { arr[o3] = x; arr[o3 + 1] = y; arr[o3 + 2] = z; return; }
      const dx = x - xf.kx, dy = y - xf.ky;
      const s = dx * xf.ux + dy * xf.uy, w = -dx * xf.uy + dy * xf.ux, zr = z - xf.h;
      const sg = side || (w >= 0 ? 1 : -1), sn = sg * xf.s;
      const w2 = w * xf.c - zr * sn, z2 = w * sn + zr * xf.c;
      const lx = xf.kx + s * xf.ux - w2 * xf.uy - xf.cx, ly = xf.ky + s * xf.uy + w2 * xf.ux - xf.cy;
      xf.v.set(lx, ly, z2).applyMatrix4(xf.m);
      arr[o3] = xf.v.x; arr[o3 + 1] = xf.v.y; arr[o3 + 2] = xf.v.z;
    }

    function update(t) {
      const fr = plan.frame(t);
      for (let k = 0; k < NT; k++) {
        const T = tiles[k], h = plan.heights[T.parity] + fr.tileZ[k];
        plan.ring(T, fr.edgePts, ring);
        // inset ring (mitred, clamped); the chord ends K (q 0) and N (q 2n) move along the chord so the fold axis stays exact
        for (let q = 0; q < R; q++) {
          const qp = (q + R - 1) % R, qn = (q + 1) % R;
          let d1x = ring[2 * q] - ring[2 * qp], d1y = ring[2 * q + 1] - ring[2 * qp + 1];
          let d2x = ring[2 * qn] - ring[2 * q], d2y = ring[2 * qn + 1] - ring[2 * q + 1];
          const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1; d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
          let mx = -d1y - d2y, my = d1x + d2x; const ml = Math.hypot(mx, my);
          if (ml < 1e-6) { mx = -d1y; my = d1x; } else { mx /= ml; my /= ml; }
          const cosA = mx * -d1y + my * d1x, len = Math.min(TL.miterMax * bw, bw / Math.max(0.2, cosA));
          inset[2 * q] = ring[2 * q] + mx * len; inset[2 * q + 1] = ring[2 * q + 1] + my * len;
        }
        {
          const ex = ring[4 * n] - ring[0], ey = ring[4 * n + 1] - ring[1], L = Math.hypot(ex, ey), ux = ex / L, uy = ey / L, d = bw * TL.chordInset;
          inset[0] = ring[0] + ux * d; inset[1] = ring[1] + uy * d;
          inset[4 * n] = ring[4 * n] - ux * d; inset[4 * n + 1] = ring[4 * n + 1] - uy * d;
        }
        setFlight(T, h, plan.poseAt(T, t));
        const b0 = k * V;
        for (let q = 0; q < R; q++) {
          const side = q === 0 || q === 2 * n ? 0 : q < 2 * n ? -1 : 1;
          const ix = inset[2 * q], iy = inset[2 * q + 1], ox = ring[2 * q], oy = ring[2 * q + 1];
          put(pos, (b0 + q) * 3, ix, iy, h, side);
          put(pos, (b0 + R + q) * 3, ix, iy, h, side);
          put(pos, (b0 + 2 * R + q) * 3, ox, oy, h - bh, side);
          put(pos, (b0 + 3 * R + q) * 3, ox, oy, h - bh, side);
          put(pos, (b0 + 4 * R + q) * 3, ox, oy, 0, side);
          const u2 = (b0 + q) * 2;
          uv[u2] = ix * uvs; uv[u2 + 1] = iy * uvs;
          uv[u2 + 2 * R] = ix * uvs; uv[u2 + 2 * R + 1] = iy * uvs;
          for (const r of [2, 3, 4]) { uv[u2 + 2 * r * R] = ox * uvs; uv[u2 + 2 * r * R + 1] = oy * uvs + (r === 4 ? h * uvs : 0); }
        }
        // top face: two halves split on the chord, each ear-clipped, padded with degenerate triangles
        for (let q = 0; q < half; q++) {
          contourLo[q].set(inset[2 * q], inset[2 * q + 1]);
          const qu = (2 * n + q) % R; contourUp[q].set(inset[2 * qu], inset[2 * qu + 1]);
        }
        let w = k * triPer * 3;
        const wEnd = w + topTris * 3;
        for (const [cont, off] of [[contourLo, 0], [contourUp, 2 * n]]) {
          const faces = THREE.ShapeUtils.triangulateShape(cont, []);
          for (const f of faces) {
            if (w >= wEnd) break;
            const A = cont[f[0]], Bv = cont[f[1]], C = cont[f[2]];
            const ccw = (Bv.x - A.x) * (C.y - A.y) - (Bv.y - A.y) * (C.x - A.x) > 0;
            const g = (j) => b0 + ((f[j] + off) % R);
            idx[w++] = g(0); idx[w++] = g(ccw ? 1 : 2); idx[w++] = g(ccw ? 2 : 1);
          }
        }
        while (w < wEnd) idx[w++] = b0;
        // ink
        const m = fr.tileM[k];
        let v0 = k * IV;
        for (const pr of prims) {
          const wgt = tilingPlan.detailWeight(pr.ki, m, spec.tiling.detail), zi = h + TL.inkLift;
          for (let v = 0; v < pr.verts.length; v++) {
            const lx = pr.c[0] + (pr.verts[v][0] - pr.c[0]) * wgt, ly = pr.c[1] + (pr.verts[v][1] - pr.c[1]) * wgt;
            const x = T.kx + lx * size, y = T.ky + ly * size;
            put(ipos, (v0 + v) * 3, x, y, zi, 0);
          }
          v0 += pr.verts.length;
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.index.needsUpdate = true;
      nrm.fill(0); geo.computeVertexNormals();
      igeo.attributes.position.needsUpdate = true;
      inrm.fill(0); igeo.computeVertexNormals();
    }
    group.userData = { update, mesh, ink, backing, plan };
    stage.scene.add(group);
    return group;
  }

  // ------------------------------------------------------------------------------------------------ caption
  /**
   * caption() -> overlay plate (exact colours): label on top, a morph slider under it whose three ticks are tiny
   * silhouettes of the key shapes. userData.show(text, alpha, { m0, m1 }, textAlpha) — m0 === m1 draws a knob, else a
   * span; the plate stays up while the text cross-fades (textAlpha, quantise it to keep redraws rare).
   */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const tiling = makeTiling();
    const icons = spec.tiling.keys.map((_, k) => tiling.outline(k));
    const Wp = Q.w + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      const pw = Q.w, ph = Q.h, ox = 20, oy = 6;
      x.fillStyle = "rgba(20,38,59,0.28)"; x.beginPath(); x.roundRect(ox + 3, oy + 8, pw, ph, 18); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 18); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 5, oy + 5, pw - 10, ph - 10, 14); x.stroke();
      if (st.text && st.ta > 0) {
        x.globalAlpha = st.ta;
        x.font = `${Q.weight} ${Q.cap * 1.32}px ${Q.font}`; x.fillStyle = Q.ink; x.textAlign = "center"; x.textBaseline = "alphabetic";
        x.fillText(st.text, ox + pw / 2, oy + Q.textY);
        x.globalAlpha = 1;
      }
      // slider
      const sx0 = ox + Q.slider.x0, sx1 = ox + pw - Q.slider.x0, sy = oy + Q.slider.y, K = icons.length;
      const X = (m) => sx0 + ((sx1 - sx0) * m) / (K - 1);
      x.strokeStyle = Q.dim; x.lineWidth = 6; x.lineCap = "round"; x.beginPath(); x.moveTo(sx0, sy); x.lineTo(sx1, sy); x.stroke();
      if (st.m1 - st.m0 > 0.02) {
        const g = x.createLinearGradient(X(st.m0), 0, X(st.m1), 0); g.addColorStop(0, Q.ink); g.addColorStop(1, Q.accent);
        x.strokeStyle = g; x.lineWidth = 10; x.beginPath(); x.moveTo(X(st.m0), sy); x.lineTo(X(st.m1), sy); x.stroke();
      }
      icons.forEach((ring, k) => {
        const cx = X(k), s = Q.slider.icon, near = st.m1 - st.m0 > 0.02 ? (k >= st.m0 - 0.05 && k <= st.m1 + 0.05) : Math.abs(st.m0 - k) < 0.5;
        x.save(); x.translate(cx - s / 2 - (k === 0 ? 0 : 0), sy - Q.slider.lift); x.scale(s, -s);
        x.beginPath(); for (let q = 0; q < ring.length / 2; q++) { const px = ring[2 * q], py = ring[2 * q + 1]; q ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath();
        x.restore(); x.fillStyle = near ? Q.ink : Q.dim; x.fill();
      });
      if (st.m1 - st.m0 <= 0.02) {
        x.fillStyle = Q.accent; x.beginPath(); x.arc(X(st.m0), sy, 12, 0, Math.PI * 2); x.fill();
        x.strokeStyle = Q.ink; x.lineWidth = 3; x.stroke();
      }
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y - 6);
    mesh.userData.show = (text, a, sl = { m0: 0, m1: 0 }, ta = 1) => {
      const r = (v) => Math.round(clamp(v, 0, icons.length - 1) * 100) / 100;
      mesh.userData.set({ text, ta, m0: r(sl.m0), m1: r(sl.m1) });
      mesh.userData.opacity(a);
    };
    return mesh;
  }

  const props = { wall, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: tilingPlan, motion: tilingPlan, makeTiling,
  };
}
