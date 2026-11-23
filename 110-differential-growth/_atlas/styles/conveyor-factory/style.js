// styles/conveyor-factory/style.js — "Conveyor Factory": a bright modern packing line (mint and safety-yellow machines, black
// ribbed belts on steel frames, cartons / totes / parcels, stack lights, signboards, a robot arm) on a cream painted floor.
// Every look number lives in spec.js; every item position, station action and light state is planned by line.js (pure,
// Node-safe). Props are synchronous and seeded; time enters only through userData.update(...) hooks the scene (or the
// packingLine controller) calls from renderAt.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { uploadTexture, canvasTexture } from "../../kit/textures.js";
import { contactShadow, RoundedBoxGeometry } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fbm2 } from "../../kit/noise.js";
import { clamp, rng, smoothstep } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as line from "./line.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------------------------------------ helpers
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** a 2D canvas that is safe to bake (CPU raster: identical on every page load). */
function canvas2d(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, x: c.getContext("2d", { willReadFrequently: true }) };
}
const resetCtx = (x) => {
  x.reset?.();
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
  if ("letterSpacing" in x) x.letterSpacing = "0px";
};

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, Ln = spec.line;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadow = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
  const box = (w, h, d, mat, r = 0.02, seg = 2) => shadow(new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)) : new THREE.BoxGeometry(w, h, d), mat));
  const cyl = (r, h, mat, seg = 24, rb = r) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, rb, h, seg), mat));

  // ---------------------------------------------------------------------------------------------- textures
  /** the ribbed black belt: ribs across the travel direction (u = arc length / tile). One shared texture scrolls for every belt. */
  const beltTex = (() => {
    const B = spec.belt, N = B.px;
    const { c, x } = canvas2d(N, N / 2);
    x.fillStyle = P.belt; x.fillRect(0, 0, N, N / 2);
    const w = N / B.ribs;
    for (let i = 0; i < B.ribs; i++) {
      const x0 = i * w;
      const g = x.createLinearGradient(x0, 0, x0 + w * 0.45, 0);
      g.addColorStop(0, P.belt); g.addColorStop(0.35, P.rib); g.addColorStop(0.65, "#45494d"); g.addColorStop(1, P.belt);
      x.fillStyle = g; x.fillRect(x0 + w * 0.08, 0, w * 0.4, N / 2);
    }
    // worn edges and a faint lengthwise texture
    const R = rng(5);
    for (let k = 0; k < 220; k++) { x.fillStyle = `rgba(255,255,255,${0.015 + R.next() * 0.025})`; x.fillRect(R.next() * N, R.next() * N / 2, 1 + R.next() * 3, 1); }
    x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(0, 0, N, 5); x.fillRect(0, N / 2 - 5, N, 5);
    const t = canvasTexture(c, { anisotropy: 8 });
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  materials.belt.map = beltTex; materials.belt.needsUpdate = true;

  /** kraft board with faint fibres and a printed "this side up" style arrow pair (no text) */
  const kraftTex = (() => {
    const N = 256;
    const { c, x } = canvas2d(N, N);
    const img = x.createImageData(N, N), K = new THREE.Color(P.kraft);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const n = fbm2(i / 18, j / 90, { seed: 3, octaves: 3 }) - 0.5;
      const f = 1 + n * 0.12;
      const o = (j * N + i) * 4;
      img.data[o] = clamp(K.r * 255 * f, 0, 255); img.data[o + 1] = clamp(K.g * 255 * f, 0, 255); img.data[o + 2] = clamp(K.b * 255 * f, 0, 255); img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return canvasTexture(c, { repeat: [1, 1] });
  })();
  materials.kraft.map = kraftTex; materials.kraft.needsUpdate = true;

  /** decals drawn once: shipping tag per type, press stamp mark, QC fail cross, QC pass tick */
  const decal = (w, h, draw) => {
    const { c, x } = canvas2d(w, h);
    draw(x, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  };
  const tagMat = {};
  for (const [type, letter] of [["carton", "C"], ["tote", "T"], ["parcel", "P"]]) {
    tagMat[type] = decal(256, 160, (x, W, H) => {
      x.fillStyle = "#fbfbf7"; rrPath(x, 4, 4, W - 8, H - 8, 14); x.fill();
      x.strokeStyle = "rgba(30,40,50,0.35)"; x.lineWidth = 3; x.stroke();
      const R = rng(letter.charCodeAt(0));
      let bx = 22;
      while (bx < 150) { const bw = 2 + Math.floor(R.next() * 3) * 2; x.fillStyle = "#1f2a33"; x.fillRect(bx, 26, bw, 86); bx += bw + 3 + Math.floor(R.next() * 3) * 2; }
      x.fillStyle = type === "tote" ? P.totes[0] : type === "parcel" ? "#7a62b8" : "#c0602a";
      rrPath(x, 168, 22, 70, 94, 10); x.fill();
      x.fillStyle = "#ffffff"; x.font = `800 72px ${FONTS.sans}`; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(letter, 203, 72);
      x.fillStyle = "#1f2a33"; x.fillRect(22, 124, 120, 10); x.fillRect(22, 140, 80, 6);
    });
  }
  const stampMat = decal(192, 192, (x, W) => {
    x.strokeStyle = "#c8322b"; x.lineWidth = 14; x.globalAlpha = 0.9;
    x.beginPath(); x.arc(W / 2, W / 2, W / 2 - 14, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 6; x.beginPath(); x.arc(W / 2, W / 2, W / 2 - 34, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 16; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(W * 0.32, W * 0.52); x.lineTo(W * 0.45, W * 0.65); x.lineTo(W * 0.7, W * 0.36); x.stroke();
  });
  const failMat = decal(192, 192, (x, W) => {
    x.fillStyle = "#e8392e"; rrPath(x, 10, 10, W - 20, W - 20, 26); x.fill();
    x.strokeStyle = "#ffffff"; x.lineWidth = 22; x.lineCap = "round";
    x.beginPath(); x.moveTo(W * 0.3, W * 0.3); x.lineTo(W * 0.7, W * 0.7); x.moveTo(W * 0.7, W * 0.3); x.lineTo(W * 0.3, W * 0.7); x.stroke();
  });
  const okMat = decal(128, 128, (x, W) => {
    x.fillStyle = P.green; x.beginPath(); x.arc(W / 2, W / 2, W / 2 - 6, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#ffffff"; x.lineWidth = 13; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(W * 0.28, W * 0.52); x.lineTo(W * 0.44, W * 0.67); x.lineTo(W * 0.72, W * 0.36); x.stroke();
  });
  const tapeMat = new THREE.MeshStandardMaterial({ color: P.tape, roughness: 0.35, metalness: 0 });
  const filmMat = new THREE.MeshPhysicalMaterial({ color: "#f4fbff", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false });
  const toteMats = P.totes.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }));

  // ---------------------------------------------------------------------------------------------- floor set
  /**
   * floorSet({ line = spec.line, wall = true }) -> Group: the cream painted concrete floor (yellow walkway lines, hatched
   * zones round the robot cell and the reject bin, saw-cut joints), an outer plain floor to the horizon, a pale panelled
   * back wall with a row of high daylight windows and steel columns.
   */
  function floorSet(o = {}) {
    const F = spec.floorTex, L = o.line ?? Ln;
    const [W, D] = F.size, ppm = F.pxPerMetre;
    const { c, x } = canvas2d(Math.round(W * ppm), Math.round(D * ppm));
    const X = (wx) => (wx - (F.center[0] - W / 2)) * ppm, Z = (wz) => (wz - (F.center[1] - D / 2)) * ppm;
    x.fillStyle = P.floor; x.fillRect(0, 0, c.width, c.height);
    // gentle trowel mottling (large scale, low contrast: cheap to encode), painted at 1/8 resolution and scaled up
    {
      const sw = Math.ceil(c.width / 8), sh = Math.ceil(c.height / 8);
      const m = canvas2d(sw, sh), img = m.x.createImageData(sw, sh);
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        const n = fbm2(i / 20, j / 20, { seed: 9, octaves: 3 }) - 0.5;
        const o2 = (j * sw + i) * 4, k = n > 0 ? 255 : 0;
        img.data[o2] = k; img.data[o2 + 1] = k; img.data[o2 + 2] = k; img.data[o2 + 3] = Math.round(Math.abs(n) * 2 * 255 * 0.09);
      }
      m.x.putImageData(img, 0, 0);
      x.imageSmoothingEnabled = true;
      x.drawImage(m.c, 0, 0, c.width, c.height);
    }
    // saw-cut joints every 3 m
    x.strokeStyle = "rgba(120,105,80,0.28)"; x.lineWidth = 2;
    for (let gx = Math.ceil((F.center[0] - W / 2) / 3) * 3; gx < F.center[0] + W / 2; gx += 3) { x.beginPath(); x.moveTo(X(gx), 0); x.lineTo(X(gx), c.height); x.stroke(); }
    for (let gz = Math.ceil((F.center[1] - D / 2) / 3) * 3; gz < F.center[1] + D / 2; gz += 3) { x.beginPath(); x.moveTo(0, Z(gz)); x.lineTo(c.width, Z(gz)); x.stroke(); }
    // walkway lines (yellow) in front of and behind the line
    x.fillStyle = P.floorLine;
    const lw = 0.1 * ppm;
    x.fillRect(X(-7.6), Z(2.15), (14.9) * ppm, lw);
    x.fillRect(X(-7.6), Z(-1.85), (14.9) * ppm, lw);
    x.fillRect(X(-7.6), Z(-1.85), lw, 4.1 * ppm);
    // white lane-edge dashes along the walkway
    x.fillStyle = P.floorWhite;
    for (let wx = -7.2; wx < 7.0; wx += 0.9) x.fillRect(X(wx), Z(2.75), 0.5 * ppm, 0.07 * ppm);
    // hatched zones: robot cell and reject bin
    const hatch = (x0, z0, x1, z1) => {
      x.save();
      x.beginPath(); x.rect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm); x.clip();
      x.fillStyle = P.floorLine; x.fillRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm);
      x.fillStyle = P.floorDark;
      const step = 0.32 * ppm;
      for (let k = -40; k < 60; k++) {
        const ox = X(x0) + k * step;
        x.beginPath(); x.moveTo(ox, Z(z0)); x.lineTo(ox + step * 0.5, Z(z0)); x.lineTo(ox + step * 0.5 - (z1 - z0) * ppm, Z(z1)); x.lineTo(ox - (z1 - z0) * ppm, Z(z1)); x.closePath(); x.fill();
      }
      x.restore();
      x.fillStyle = P.floor;
      x.fillRect(X(x0) + 0.12 * ppm, Z(z0) + 0.12 * ppm, (x1 - x0 - 0.24) * ppm, (z1 - z0 - 0.24) * ppm);
    };
    const rb = L.robot.base;
    hatch(rb[0] - 0.95, rb[2] - 0.75, rb[0] + 0.95, rb[2] + 0.75);
    hatch(L.chute.x - 0.6, L.chute.z1 - 0.1, L.chute.x + 0.6, L.chute.z1 + 0.85);
    // painted green "safe" footprint markers at the stations (small corner brackets)
    x.strokeStyle = P.floorWhite; x.lineWidth = 0.05 * ppm;
    const tex = canvasTexture(c, { anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = materials.floor.clone();
    mat.map = tex; mat.color.set("#ffffff");
    const g = new THREE.Group();
    g.name = "floorSet";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(F.center[0], 0, F.center[1]);
    floor.receiveShadow = true;
    g.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), materials.floor);
    materials.floor.color.set(P.floor);
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.003; outer.receiveShadow = true;
    g.add(outer);
    if (o.wall !== false) {
      const wz = o.wallZ ?? -3.9, wh = 7;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, wh), materials.wall);
      wall.position.set(0, wh / 2, wz); wall.receiveShadow = true;
      g.add(wall);
      // panel seams + a dado band
      const band = box(60, 0.9, 0.04, materials.mintDark, 0);
      band.position.set(0, 0.45, wz + 0.02); band.castShadow = false;
      g.add(band);
      for (let k = -14; k <= 14; k++) {
        const col = box(0.32, wh, 0.32, materials.steel, 0.01);
        col.position.set(k * 4.2, wh / 2, wz + 0.2);
        if (Math.abs(k) % 2 === 1) { col.material = materials.steelDark; }
        g.add(col);
        const base = box(0.4, 0.9, 0.4, materials.yellow, 0.02);
        base.position.set(k * 4.2, 0.45, wz + 0.2);
        g.add(base);
      }
      for (let k = -12; k <= 12; k++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.5), materials.window);
        win.position.set(k * 4.2 + 2.1, 4.1, wz + 0.01);
        g.add(win);
        const sill = box(3.1, 0.08, 0.1, materials.steel, 0.01);
        sill.position.set(k * 4.2 + 2.1, 3.32, wz + 0.05); sill.castShadow = false;
        g.add(sill);
        for (const dx of [-0.48, 0.48]) {
          const mull = box(0.05, 1.5, 0.05, materials.steel, 0);
          mull.position.set(k * 4.2 + 2.1 + dx, 4.1, wz + 0.04); mull.castShadow = false;
          g.add(mull);
        }
      }
    }
    return g;
  }

  // ---------------------------------------------------------------------------------------------- belts
  /** frames along a path: per vertex p, tangent t, horizontal side s (left of travel), up n. */
  function frames(path) {
    return path.pts.map((p, i) => {
      const a = path.at(path.cum[i]);
      const t = a.t;
      let s = [-t[2], 0, t[0]];
      const l = Math.hypot(s[0], s[2]) || 1; s = [s[0] / l, 0, s[2] / l];
      const n = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]];
      return { p, t, s, n: n[1] < 0 ? n.map((v) => -v) : n, u: path.cum[i] };
    });
  }
  /** sweep a 2D profile [[side, up], ...] (closed loop) along frames -> BufferGeometry (flat-ish normals). */
  function sweep(fr, prof, { closed = true, uScale = 1 } = {}) {
    const pos = [], uv = [], idx = [];
    const np = prof.length;
    fr.forEach((f, i) => {
      for (let k = 0; k < np; k++) {
        const [a, b] = prof[k];
        pos.push(f.p[0] + f.s[0] * a + f.n[0] * b, f.p[1] + f.s[1] * a + f.n[1] * b, f.p[2] + f.s[2] * a + f.n[2] * b);
        uv.push(f.u * uScale, k / (np - 1));
      }
    });
    const segs = closed ? np : np - 1;
    for (let i = 0; i < fr.length - 1; i++) for (let k = 0; k < segs; k++) {
      const a = i * np + k, b = i * np + ((k + 1) % np), c = (i + 1) * np + k, d = (i + 1) * np + ((k + 1) % np);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const rollerMeshes = [];   // every roller that turns with belt speed: { mesh, r }
  /**
   * beltSegment({ path (line.makePath result), width = beltW, legs = true, legStep = 1.45, skipLegs: [[x0, x1]...],
   *   endRollers = [true, true], side = true }) -> Group. Belt ribbon (shared ribbed texture, UV u = arc length / tile),
   *   steel side channels, square-tube legs with feet down to the floor, end drums. Straight, curve, incline and merge
   *   segments are all this one factory with a different path.
   */
  function beltSegment(o = {}) {
    const path = o.path, W = o.width ?? Ln.beltW;
    const fr = frames(path);
    const g = new THREE.Group();
    g.name = `belt-${path.id ?? "segment"}`;
    const ribbon = new THREE.Mesh(sweep(fr, [[W / 2, 0], [-W / 2, 0]], { closed: false, uScale: 1 / spec.belt.tile }), materials.belt);
    // u must run along the belt (texture u), v across: swap the sweep's uv convention
    const uvA = ribbon.geometry.attributes.uv;
    ribbon.receiveShadow = true;
    g.add(ribbon);
    void uvA;
    if (o.side !== false) {
      const ch = [[0, 0.0], [0.05, 0.0], [0.05, -0.16], [0.012, -0.16], [0.012, -0.03], [0, -0.03]];
      for (const sd of [1, -1]) {
        const prof = ch.map(([a, b]) => [sd * (W / 2 + 0.008 + a), b]);
        if (sd < 0) prof.reverse();
        const m = new THREE.Mesh(sweep(fr, prof), materials.steel);
        shadow(m);
        g.add(m);
      }
      // underside skirt (dark) so the belt reads as a solid conveyor from any height
      const sk = new THREE.Mesh(sweep(fr, [[W / 2 + 0.01, -0.035], [W / 2 + 0.01, -0.13], [-W / 2 - 0.01, -0.13], [-W / 2 - 0.01, -0.035]], { closed: false }), materials.joint);
      shadow(sk, false, true);
      g.add(sk);
    }
    if (o.legs !== false) {
      const step = o.legStep ?? 1.45, n = Math.max(1, Math.round(path.length / step));
      const legMat = materials.steelDark;
      for (let k = 0; k <= n; k++) {
        const s = (k / n) * path.length * 0.92 + path.length * 0.04;
        const a = path.at(s);
        if ((o.skipLegs ?? []).some(([x0, x1]) => a.p[0] >= x0 && a.p[0] <= x1)) continue;
        const sd = [-a.t[2], 0, a.t[0]], l = Math.hypot(sd[0], sd[2]) || 1;
        const h = a.p[1] - 0.16;
        for (const sg of [1, -1]) {
          const lx = a.p[0] + (sd[0] / l) * sg * (W / 2 - 0.04), lz = a.p[2] + (sd[2] / l) * sg * (W / 2 - 0.04);
          const leg = box(0.055, h, 0.055, legMat, 0);
          leg.position.set(lx, h / 2, lz);
          g.add(leg);
          const foot = box(0.14, 0.02, 0.14, legMat, 0);
          foot.position.set(lx, 0.01, lz);
          g.add(foot);
        }
        const brace = box(0.04, 0.04, W - 0.08, legMat, 0);
        brace.position.set(a.p[0], 0.25, a.p[2]);
        brace.rotation.y = Math.atan2(-a.t[2], a.t[0]);
        g.add(brace);
      }
    }
    const ends = o.endRollers ?? [true, true];
    [0, path.length].forEach((s, k) => {
      if (!ends[k]) return;
      const a = path.at(s);
      const r = 0.05;
      const drum = cyl(r, W + 0.02, materials.steel, 20);
      const yaw = Math.atan2(-a.t[2], a.t[0]);
      const holder = new THREE.Group();
      holder.position.set(a.p[0] + a.t[0] * (k ? 1 : -1) * 0.0, a.p[1] - r, a.p[2]);
      holder.rotation.y = yaw;
      drum.rotation.x = Math.PI / 2;
      const spin = new THREE.Group();
      spin.add(drum);
      holder.add(spin);
      g.add(holder);
      rollerMeshes.push({ mesh: spin, r, axis: "z" });
    });
    g.userData = { path, frames: fr };
    return g;
  }

  /**
   * rollerBed({ x: [x0, x1], z: [z0, z1], y = beltY, pitch = .09, r = .03, axis = "z" (roller axis), deck = true }) -> Group:
   * a steel-framed bed of free rollers (transfer beds over a split or merge). Rollers turn with belt speed.
   */
  function rollerBed(o = {}) {
    const [x0, x1] = o.x, [z0, z1] = o.z, y = o.y ?? Ln.beltY, r = o.r ?? 0.03, pitch = o.pitch ?? 0.09;
    const g = new THREE.Group();
    g.name = "rollerBed";
    const w = x1 - x0, d = z1 - z0;
    const deck = box(w, 0.03, d, materials.joint, 0);
    deck.position.set((x0 + x1) / 2, y - 0.012, (z0 + z1) / 2);
    g.add(deck);
    for (const zz of [z0, z1]) {
      const rail = box(w + 0.06, 0.12, 0.05, materials.mint, 0.015);
      rail.position.set((x0 + x1) / 2, y - 0.05, zz);
      g.add(rail);
    }
    for (const xx of [x0, x1]) {
      const rail = box(0.05, 0.1, d, materials.mint, 0.015);
      rail.position.set(xx, y - 0.06, (z0 + z1) / 2);
      g.add(rail);
    }
    const n = Math.floor(w / pitch);
    const rg = new THREE.CylinderGeometry(r, r, d - 0.07, 14);
    for (let i = 0; i < n; i++) {
      const spin = new THREE.Group();
      spin.position.set(x0 + (i + 0.5) * (w / n), y + 0.012 - r, (z0 + z1) / 2);
      const m = new THREE.Mesh(rg, materials.steel);
      m.rotation.x = Math.PI / 2;
      m.receiveShadow = true;
      spin.add(m);
      g.add(spin);
      rollerMeshes.push({ mesh: spin, r, axis: "z" });
    }
    for (const xx of [x0 + 0.1, x1 - 0.1]) for (const zz of [z0 + 0.06, z1 - 0.06]) {
      const leg = box(0.05, y - 0.08, 0.05, materials.steelDark, 0);
      leg.position.set(xx, (y - 0.08) / 2, zz);
      g.add(leg);
    }
    return g;
  }

  /**
   * chute({ x, z0, z1, y0, y1, w } = spec.line.chute) -> Group: an inclined gravity roller chute toward the viewer with
   * yellow guard rails and a reject bin at the low end. userData.update(t, rollU) turns the rollers by distance rolled.
   */
  function chute(o = {}) {
    const C = { ...Ln.chute, ...o };
    const g = new THREE.Group();
    g.name = "chute";
    const L = Math.hypot(C.z1 - C.z0, C.y0 - C.y1), tilt = Math.atan2(C.y0 - C.y1, C.z1 - C.z0);
    const pivot = new THREE.Group();
    pivot.position.set(C.x, C.y0, C.z0);
    pivot.rotation.x = tilt;
    g.add(pivot);
    const rolls = [];
    const n = Math.floor(L / 0.1);
    const rg = new THREE.CylinderGeometry(0.03, 0.03, C.w - 0.06, 14);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Group();
      sp.position.set(0, -0.03, (i + 0.5) * (L / n));
      const m = new THREE.Mesh(rg, materials.steel);
      m.rotation.z = Math.PI / 2; m.receiveShadow = true; m.castShadow = true;
      sp.add(m);
      pivot.add(sp);
      rolls.push(sp);
    }
    for (const sx of [-1, 1]) {
      const rail = box(0.05, 0.16, L + 0.05, materials.yellow, 0.02);
      rail.position.set(sx * (C.w / 2 + 0.02), 0.0, L / 2);
      pivot.add(rail);
    }
    const deck = box(C.w, 0.03, L, materials.joint, 0);
    deck.position.set(0, -0.07, L / 2);
    pivot.add(deck);
    // legs
    for (const k of [0.15, 0.85]) {
      const zz = C.z0 + (C.z1 - C.z0) * k, yy = C.y0 + (C.y1 - C.y0) * k - 0.08;
      for (const sx of [-1, 1]) {
        const leg = box(0.045, yy, 0.045, materials.steelDark, 0);
        leg.position.set(C.x + sx * (C.w / 2 - 0.05), yy / 2, zz);
        g.add(leg);
      }
    }
    // reject bin (red), open top, at the low end
    const bin = new THREE.Group();
    const bw = C.w + 0.3, bd = 0.85, bh = 0.5, th = 0.04;
    const binMat = new THREE.MeshPhysicalMaterial({ color: P.red, roughness: 0.45, clearcoat: 0.3 });
    const parts = [[bw, th, bd, 0, th / 2, 0], [th, bh, bd, -bw / 2, bh / 2, 0], [th, bh, bd, bw / 2, bh / 2, 0], [bw, bh, th, 0, bh / 2, -bd / 2], [bw, bh, th, 0, bh / 2, bd / 2]];
    for (const [w, h, d, x, y, z] of parts) { const m = box(w, h, d, binMat, 0.012); m.position.set(x, y, z); bin.add(m); }
    bin.position.set(C.x, 0, C.z1 + bd / 2 - 0.05);
    g.add(bin);
    g.userData = {
      length: L, tilt, bin,
      update(dist) { for (const sp of rolls) sp.rotation.x = -dist / 0.03; },
    };
    return g;
  }

  // ---------------------------------------------------------------------------------------------- items
  /**
   * item({ type: "carton" | "tote" | "parcel", seed }) -> Group (local +x = travel, y up, origin = centre of the item box).
   * userData.apply(pose) with pose from plan.positions(t): position / yaw / pitch / roll and the state changes — tag
   * (after the scanner), stamp mark (press), fill level (filler, totes), film wrap (grows through the wrapper ring:
   * pass sealU), QC cross or tick.
   */
  function item(o = {}) {
    const type = o.type ?? "carton";
    const I = spec.items[type];
    const [Lx, H, Wz] = I.size;
    const g = new THREE.Group();
    g.name = `item-${type}`;
    const R = rng(o.seed ?? 1);
    const body = new THREE.Group();
    g.add(body);
    let fill = null, innerH = 0;
    const top = H / 2 + 0.0025;
    const flat = (mat, w, d, x, z, rot = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
      m.position.set(x, top, z);
      m.renderOrder = 2;
      m.visible = false;
      body.add(m);
      return m;
    };
    let tag, stamp, cross, tick;
    if (type === "carton") {
      body.add(box(Lx, H, Wz, materials.kraft, 0.012));
      const tape = box(Lx + 0.004, 0.004, 0.07, tapeMat, 0);
      tape.position.y = H / 2 + 0.0005; tape.castShadow = false;
      body.add(tape);
      for (const sx of [-1, 1]) { const tp = box(0.004, 0.09, 0.07, tapeMat, 0); tp.position.set(sx * (Lx / 2 + 0.0005), H / 2 - 0.045, 0); tp.castShadow = false; body.add(tp); }
      tag = flat(tagMat.carton, 0.17, 0.106, -Lx * 0.22, Wz * 0.24);
      stamp = flat(stampMat, 0.13, 0.13, Lx * 0.24, Wz * 0.22, 0.3);
      cross = flat(failMat, 0.18, 0.18, Lx * 0.18, -Wz * 0.2);
      tick = flat(okMat, 0.08, 0.08, Lx * 0.28, -Wz * 0.26);
    } else if (type === "parcel") {
      const m = box(Lx, H, Wz, materials.parcel, 0.045, 4);
      m.scale.y = 1;
      body.add(m);
      const seam = box(Lx * 0.92, 0.006, 0.03, new THREE.MeshStandardMaterial({ color: "#d3d8dc", roughness: 0.5 }), 0);
      seam.position.set(0, H / 2 - 0.004, -Wz * 0.34); seam.castShadow = false;
      body.add(seam);
      tag = flat(tagMat.parcel, 0.16, 0.1, -Lx * 0.12, Wz * 0.12);
      stamp = flat(stampMat, 0.11, 0.11, Lx * 0.27, -Wz * 0.08, -0.2);
      cross = flat(failMat, 0.15, 0.15, Lx * 0.24, Wz * 0.1);
      tick = flat(okMat, 0.07, 0.07, Lx * 0.3, Wz * 0.24);
    } else {
      const mat = toteMats[(o.color ?? R.int(0, toteMats.length - 1)) % toteMats.length];
      const th = 0.026;
      const parts = [[Lx, th, Wz, 0, -H / 2 + th / 2, 0], [Lx, H, th, 0, 0, Wz / 2 - th / 2], [Lx, H, th, 0, 0, -Wz / 2 + th / 2], [th, H, Wz - 2 * th, Lx / 2 - th / 2, 0, 0], [th, H, Wz - 2 * th, -Lx / 2 + th / 2, 0, 0]];
      for (const [w, h, d, x, y, z] of parts) { const m = box(w, h, d, mat, 0.01); m.position.set(x, y, z); body.add(m); }
      // rim lip
      for (const [w, d, x, z] of [[Lx + 0.02, 0.03, 0, Wz / 2], [Lx + 0.02, 0.03, 0, -Wz / 2], [0.03, Wz, Lx / 2, 0], [0.03, Wz, -Lx / 2, 0]]) {
        const lip = box(w, 0.02, d, mat, 0.008); lip.position.set(x, H / 2 - 0.01, z); body.add(lip);
      }
      innerH = H - th - 0.02;
      fill = new THREE.Mesh(new THREE.BoxGeometry(Lx - 2 * th - 0.004, 1, Wz - 2 * th - 0.004), materials.fill);
      fill.receiveShadow = true;
      fill.visible = false;
      body.add(fill);
      // tags on the front wall (faces +z = toward the viewer on the line)
      tag = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.106), tagMat.tote);
      tag.position.set(-Lx * 0.18, 0, Wz / 2 + 0.002); tag.visible = false; tag.renderOrder = 2;
      body.add(tag);
      cross = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), failMat);
      cross.position.set(Lx * 0.2, 0, Wz / 2 + 0.002); cross.visible = false; body.add(cross);
      tick = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), okMat);
      tick.position.set(Lx * 0.2, 0.02, Wz / 2 + 0.002); tick.visible = false; body.add(tick);
      stamp = null;
    }
    // film wrap shell (scaled along x as the item passes the wrapper ring)
    const film = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.04), filmMat);
    film.scale.set(Lx + 0.024, H + 0.02, Wz + 0.024);
    film.visible = false; film.renderOrder = 3;
    g.add(film);
    const cs = contactShadow({ w: Lx * 1.35, d: Wz * 1.45, opacity: 0.32, color: "#2b2620", y: -H / 2 + 0.003 });
    g.add(cs);
    g.rotation.order = "YZX";
    g.visible = false;
    g.userData = {
      type, size: I.size, film, fill, tag, stamp, cross, tick, shadow: cs,
      /** apply(pose, { sealU }) — pose from plan.positions(t).get(id) */
      apply(pose, x = {}) {
        if (!pose || !pose.visible || !pose.p) { g.visible = false; return; }
        g.visible = true;
        g.position.set(pose.p[0], pose.p[1], pose.p[2]);
        g.rotation.set(pose.roll ?? 0, pose.yaw ?? 0, pose.pitch ?? 0);
        const S = pose.state;
        tag.visible = S.tagged;
        if (stamp) stamp.visible = S.stamped;
        cross.visible = S.fail;
        tick.visible = S.ok && !S.fail;
        if (fill) {
          fill.visible = S.fill > 0.002;
          const h = Math.max(0.001, S.fill * innerH);
          fill.scale.y = h; fill.position.y = -H / 2 + 0.026 + h / 2;
        }
        const u = clamp(x.sealU ?? (S.sealed ? 1 : 0));
        film.visible = u > 0.002;
        film.scale.x = (Lx + 0.024) * u;
        film.position.x = (Lx + 0.024) * (1 - u) / 2;   // grows from the leading (+x) end backward
        // contact shadow only on flat belts / pallet (hidden while carried or tumbling into the chute)
        cs.visible = pose.mode === "belt" || pose.mode === "pallet";
      },
    };
    return g;
  }

  // ---------------------------------------------------------------------------------------------- stack light
  /**
   * stackLight({ height = .5 }) -> Group (origin = mount point): a slim pole with green / amber / red lenses and a cap.
   * userData.set({ red, amber, green }) — 0 = dim lens, 1 = lit (bloom carries the glow), >1 a brighter flash.
   */
  function stackLight(o = {}) {
    const g = new THREE.Group();
    g.name = "stackLight";
    const pole = cyl(0.018, o.height ?? 0.32, materials.steel, 12);
    pole.position.y = (o.height ?? 0.32) / 2;
    g.add(pole);
    const y0 = (o.height ?? 0.32);
    const lenses = {};
    ["green", "amber", "red"].forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: P[c], roughness: 0.25, metalness: 0, emissive: new THREE.Color(P[c]), emissiveIntensity: 0.05, transparent: false });
      const L = cyl(0.055, 0.085, m, 20);
      L.position.y = y0 + 0.05 + i * 0.092;
      g.add(L);
      const ring = cyl(0.058, 0.008, materials.joint, 20);
      ring.position.y = y0 + 0.005 + i * 0.092;
      g.add(ring);
      lenses[c] = m;
    });
    const cap = cyl(0.058, 0.03, materials.joint, 20);
    cap.position.y = y0 + 0.29;
    g.add(cap);
    const base = cyl(0.04, 0.03, materials.joint, 16);
    g.add(base);
    g.userData = {
      lenses,
      set(L = {}) {
        for (const c of ["green", "amber", "red"]) {
          const k = L[c] ?? 0;
          lenses[c].emissiveIntensity = 0.03 + 1.5 * k;
          lenses[c].color.set(P[c]).multiplyScalar(0.32 + 0.68 * clamp(k));
        }
      },
    };
    g.userData.set({ green: 1 });
    return g;
  }

  // ---------------------------------------------------------------------------------------------- signs + counters
  /** a baked text board texture (CPU canvas, drawn once). */
  function boardMaterial(wPx, hPx, draw, emissive = false) {
    const { c, x } = canvas2d(wPx, hPx);
    draw(x, wPx, hPx);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return emissive
      ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: new THREE.Color("#ffffff"), emissiveMap: t, emissiveIntensity: 0.35 })
      : new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
  }
  /**
   * sign({ text, step, w = 1.45, h = spec.signs.h, hang = 1.4, color }) -> Group (origin = board centre): a hanging
   * overhead signboard (navy panel, white condensed caps, a mint step number disc), two hanger rods up out of frame.
   */
  function sign(o = {}) {
    const Sg = spec.signs, w = o.w ?? 1.45, h = o.h ?? Sg.h;
    const g = new THREE.Group();
    g.name = `sign-${o.text}`;
    const px = 160;
    const mat = boardMaterial(Math.round(w * px * 2), Math.round(h * px * 2), (x, W, H) => {
      x.fillStyle = P.sign; rrPath(x, 0, 0, W, H, H * 0.16); x.fill();
      x.strokeStyle = "rgba(255,255,255,0.18)"; x.lineWidth = 6; rrPath(x, 10, 10, W - 20, H - 20, H * 0.12); x.stroke();
      let tx = H * 0.28;
      if (o.step != null) {
        x.fillStyle = o.color ?? P.mint; x.beginPath(); x.arc(H * 0.56, H / 2, H * 0.34, 0, Math.PI * 2); x.fill();
        x.fillStyle = P.sign; x.font = `800 ${Math.round(H * 0.46)}px ${Sg.font}`; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(String(o.step), H * 0.56, H / 2 + H * 0.02);
        tx = H * 1.08;
      }
      x.fillStyle = P.signInk; x.font = `${Sg.weight} ${Math.round(H * 0.56)}px ${Sg.font}`; x.textAlign = "left"; x.textBaseline = "middle";
      if ("letterSpacing" in x) x.letterSpacing = `${Math.round(H * 0.04)}px`;
      x.fillText(o.text ?? "", tx, H / 2 + H * 0.03);
    });
    const panel = box(w, h, 0.05, materials.sign, 0.02);
    panel.castShadow = false;
    g.add(panel);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.01, h - 0.01), mat);
    face.position.z = 0.0265;
    g.add(face);
    for (const sx of [-1, 1]) {
      const rod = cyl(0.008, o.hang ?? 1.4, materials.steelDark, 6);
      rod.position.set(sx * (w / 2 - 0.12), h / 2 + (o.hang ?? 1.4) / 2, 0);
      rod.castShadow = false;
      g.add(rod);
    }
    return g;
  }
  /**
   * counterBoard({ counters: [{ key, label }], w = 4.6, h = .95, sample = true }) -> Group: a hanging dark display board with
   * amber digit counters and a SAMPLE DATA tag. userData.update(counts) redraws only when a value changes and uploads the
   * texture immediately (uploadTexture), so frames never depend on seek order.
   */
  function counterBoard(o = {}) {
    const C = spec.counter, w = o.w ?? 4.6, h = o.h ?? 0.95, counters = o.counters ?? [];
    const g = new THREE.Group();
    g.name = "counterBoard";
    const W = Math.round(w * 220), H = Math.round(h * 220);
    const { c, x } = canvas2d(W, H);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: new THREE.Color("#ffffff"), emissiveMap: tex, emissiveIntensity: 0.45 });
    const frame = box(w + 0.08, h + 0.08, 0.08, materials.mintDark, 0.03);
    frame.castShadow = false;
    g.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.z = 0.042;
    g.add(face);
    for (const sx of [-1, 1]) {
      const rod = cyl(0.01, o.hang ?? 1.4, materials.steelDark, 6);
      rod.position.set(sx * (w / 2 - 0.3), h / 2 + (o.hang ?? 1.4) / 2, 0);
      rod.castShadow = false;
      g.add(rod);
    }
    let last = null;
    const draw = (vals) => {
      resetCtx(x);
      x.fillStyle = "#1a2229"; x.fillRect(0, 0, W, H);
      const n = Math.max(1, counters.length), cw = W / n;
      counters.forEach((ct, i) => {
        const cx = i * cw;
        if (i) { x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(cx, H * 0.12, 3, H * 0.76); }
        x.fillStyle = "#c9d3da"; x.font = `700 ${Math.round(H * 0.17)}px ${C.labelFont}`; x.textAlign = "center"; x.textBaseline = "middle";
        if ("letterSpacing" in x) x.letterSpacing = `${Math.round(H * 0.012)}px`;
        x.fillText(ct.label, cx + cw / 2, H * 0.22);
        if ("letterSpacing" in x) x.letterSpacing = "0px";
        const v = String(vals[ct.key] ?? 0).padStart(C.digits, "0");
        x.font = `700 ${Math.round(H * 0.46)}px ${C.font}`;
        // unlit segments behind the digits
        x.fillStyle = "rgba(255,180,61,0.10)"; x.fillText("8".repeat(C.digits), cx + cw / 2, H * 0.6);
        x.fillStyle = ct.color ?? P.counter; x.fillText(v, cx + cw / 2, H * 0.6);
      });
      if (o.sample !== false) {
        x.font = `700 ${Math.round(H * 0.1)}px ${C.labelFont}`; x.textAlign = "right"; x.textBaseline = "bottom";
        if ("letterSpacing" in x) x.letterSpacing = `${Math.round(H * 0.01)}px`;
        x.fillStyle = "#ff6b5e"; x.fillText("SAMPLE DATA", W - H * 0.08, H - H * 0.04);
      }
    };
    g.userData = {
      update(vals) {
        const k = JSON.stringify(vals);
        if (k === last) return;
        last = k;
        draw(vals);
        uploadTexture(stage, tex);
      },
    };
    g.userData.update(Object.fromEntries(counters.map((ct) => [ct.key, 0])));
    return g;
  }

  // ---------------------------------------------------------------------------------------------- stations
  /** hood({ x: [x0, x1], z, y, h, w }) -> Group: the infeed hood (mint housing with a dark strip curtain at the exit). */
  function hood(o = {}) {
    const [x0, x1] = o.x ?? Ln.hood.x, z = o.z ?? -0.9, h = o.h ?? Ln.hood.h, w = o.w ?? 1.15;
    const g = new THREE.Group();
    g.name = "hood";
    const len = x1 - x0, t = 0.07;
    const top = box(len, t, w, materials.mint, 0.03); top.position.set((x0 + x1) / 2, h, z); g.add(top);
    for (const sz of [-1, 1]) { const s = box(len, h, t, materials.mint, 0.03); s.position.set((x0 + x1) / 2, h / 2, z + sz * (w / 2 - t / 2)); g.add(s); }
    const back = box(t, h, w, materials.mintDark, 0.02); back.position.set(x0, h / 2, z); g.add(back);
    const lip = box(0.1, 0.16, w + 0.06, materials.yellow, 0.03); lip.position.set(x1, h - 0.02, z); g.add(lip);
    const stripMat = new THREE.MeshStandardMaterial({ color: "#3b4a52", roughness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.15, h - 0.12), stripMat);
      s.rotation.y = Math.PI / 2;
      s.position.set(x1 + 0.01, (h - 0.12) / 2 + 0.06, z - w / 2 + 0.1 + k * ((w - 0.2) / 6));
      g.add(s);
    }
    return g;
  }
  /** archGate({ x, z, w, h, mat, head }) -> Group: two posts and a crossbeam over the belt (scanner / QC base). */
  function archGate(o = {}) {
    const g = new THREE.Group();
    const w = o.w ?? 1.15, h = o.h ?? 1.55, z = o.z ?? -0.9;
    for (const sz of [-1, 1]) {
      const post = box(0.13, h, 0.16, o.mat ?? materials.mint, 0.04);
      post.position.set(0, h / 2, sz * (w / 2));
      g.add(post);
      const foot = box(0.26, 0.04, 0.3, materials.joint, 0.01);
      foot.position.set(0, 0.02, sz * (w / 2));
      g.add(foot);
    }
    const beam = box(0.3, 0.2, w + 0.16, o.mat ?? materials.mint, 0.06);
    beam.position.set(0, h, 0);
    g.add(beam);
    g.position.set(o.x ?? 0, 0, z);
    return g;
  }
  /**
   * scannerGate({ x, z }) -> Group: a mint arch with a dark read head and a light curtain. userData.update({ sweep: -1..1 or
   * null, level }) — the curtain sheet sweeps along the item (x offset) and glows while reading.
   */
  function scannerGate(o = {}) {
    const g = archGate({ ...o, h: 1.58 });
    g.name = "scannerGate";
    const head = box(0.2, 0.08, 0.8, materials.joint, 0.03);
    head.position.set(0, 1.46, 0);
    g.add(head);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.74), new THREE.MeshStandardMaterial({ color: "#66ffd0", emissive: new THREE.Color("#66ffd0"), emissiveIntensity: 1.0 }));
    lens.position.set(0, 1.415, 0);
    g.add(lens);
    const curtainMat = new THREE.MeshBasicMaterial({ color: "#7dffd6", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.62), curtainMat);
    curtain.rotation.y = Math.PI / 2;
    curtain.position.set(0, 1.1, 0);
    g.add(curtain);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.72), new THREE.MeshBasicMaterial({ color: "#a8ffe6", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.rotation.x = -Math.PI / 2;
    g.add(line);
    g.userData = {
      update({ sweep = null, level = 0, itemTop = 1.15 } = {}) {
        const on = sweep != null;
        curtain.visible = line.visible = on;
        lens.material.emissiveIntensity = 1 + 2.2 * level;
        if (!on) return;
        curtain.position.x = sweep * 0.32;
        curtain.material.opacity = 0.16 * level;
        const hh = 1.4 - itemTop;
        curtain.scale.y = Math.max(0.05, hh / 0.62); curtain.position.y = itemTop + hh / 2;
        line.position.set(sweep * 0.32, itemTop + 0.004, 0);
        line.material.opacity = 0.9 * level;
      },
    };
    return g;
  }
  /**
   * diverter({ x, z, len = .95, side = -1 }) -> Group: a yellow pivot post with a swing arm and rubber paddle on the belt edge.
   * userData.update(angle) — 0 = parallel to the belt; positive swings the tip across the belt (toward +z).
   */
  function diverter(o = {}) {
    const g = new THREE.Group();
    g.name = "diverter";
    const len = o.len ?? 0.95;
    const post = cyl(0.07, Ln.beltY + 0.2, materials.yellow, 20);
    post.position.y = (Ln.beltY + 0.2) / 2;
    g.add(post);
    const cap = cyl(0.09, 0.08, materials.joint, 20);
    cap.position.y = Ln.beltY + 0.2;
    g.add(cap);
    const pivot = new THREE.Group();
    pivot.position.y = Ln.beltY + 0.1;
    g.add(pivot);
    const arm = box(len, 0.2, 0.06, materials.yellow, 0.025);
    arm.position.set(len / 2, 0, 0.035);
    pivot.add(arm);
    const pad = box(len - 0.1, 0.14, 0.025, materials.rubber, 0.008);
    pad.position.set(len / 2 + 0.03, 0, 0.07);
    pivot.add(pad);
    // pneumatic cylinder (diagonal brace)
    const cylr = cyl(0.025, 0.42, materials.steel, 12);
    cylr.rotation.z = Math.PI / 2; cylr.position.set(0.25, 0.1, -0.1);
    pivot.add(cylr);
    g.position.set(o.x ?? 0, 0, o.z ?? 0);
    g.userData = { update(a) { pivot.rotation.y = -a; } };
    return g;
  }
  /**
   * press({ x, z }) -> Group: a mint gantry press with a steel ram and a yellow stamping head over the belt.
   * userData.update({ k, top }) — k 0 = up .. 1 = on the item whose top is at y = top.
   */
  function press(o = {}) {
    const g = new THREE.Group();
    g.name = "press";
    const z = o.z ?? -0.9, w = 1.2, H = 2.15;
    for (const sz of [-1, 1]) {
      const col = box(0.2, H, 0.22, materials.mint, 0.05);
      col.position.set(0, H / 2, sz * (w / 2));
      g.add(col);
      const guard = box(0.5, 0.5, 0.06, materials.mintDark, 0.03);
      guard.position.set(0, Ln.beltY + 0.35, sz * (w / 2 - 0.12));
      if (sz > 0) { guard.material = new THREE.MeshPhysicalMaterial({ color: "#d9f2ea", transparent: true, opacity: 0.32, roughness: 0.1, clearcoat: 1, depthWrite: false }); guard.castShadow = false; }
      g.add(guard);
    }
    const housing = box(0.7, 0.55, w + 0.24, materials.mint, 0.1);
    housing.position.set(0, H, 0);
    g.add(housing);
    const band = box(0.72, 0.1, w + 0.26, materials.yellow, 0.03);
    band.position.set(0, H - 0.22, 0);
    g.add(band);
    const ram = cyl(0.05, 1, materials.steel, 16);
    g.add(ram);
    const headG = new THREE.Group();
    const head = box(0.34, 0.12, 0.34, materials.yellow, 0.03);
    headG.add(head);
    const die = box(0.24, 0.03, 0.24, materials.joint, 0.01);
    die.position.y = -0.075;
    headG.add(die);
    g.add(headG);
    const upY = Ln.beltY + 0.65;
    g.position.set(o.x ?? 0, 0, z);
    g.userData = {
      update({ k = 0, top = Ln.beltY } = {}) {
        const yb = upY + (top + 0.09 - upY) * k;      // head bottom
        headG.position.y = yb + 0.06;
        const y1 = H - 0.25, y0 = yb + 0.12;
        ram.scale.y = Math.max(0.01, y1 - y0); ram.position.y = (y0 + y1) / 2;
      },
    };
    g.userData.update({});
    return g;
  }
  /**
   * filler({ x, z }) -> Group: a hopper on a mint C-frame over the belt with a nozzle; a granule stream shows while pouring.
   * userData.update(pour 0..1)
   */
  function filler(o = {}) {
    const g = new THREE.Group();
    g.name = "filler";
    const z = o.z ?? 0, back = -0.72;
    const col = box(0.24, 2.6, 0.26, materials.mint, 0.06);
    col.position.set(0, 1.3, back);
    g.add(col);
    const armB = box(0.24, 0.22, 0.95, materials.mint, 0.06);
    armB.position.set(0, 2.2, back + 0.45);
    g.add(armB);
    const hop = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.11, 0.62, 28, 1, false), materials.yellow));
    hop.position.set(0, 2.15, 0);
    g.add(hop);
    const rim = cyl(0.44, 0.08, materials.yellow, 28);
    rim.position.set(0, 2.48, 0);
    g.add(rim);
    const fillTop = cyl(0.4, 0.02, materials.fill, 28);
    fillTop.position.set(0, 2.5, 0);
    g.add(fillTop);
    const neck = cyl(0.07, 0.42, materials.steel, 16);
    neck.position.set(0, 1.68, 0);
    g.add(neck);
    const valve = box(0.2, 0.12, 0.2, materials.joint, 0.03);
    valve.position.set(0, 1.5, 0);
    g.add(valve);
    const nozzle = cyl(0.045, 0.16, materials.steel, 14, 0.03);
    nozzle.position.set(0, 1.37, 0);
    g.add(nozzle);
    const streamMat = new THREE.MeshStandardMaterial({ color: P.fill, roughness: 0.9, transparent: true, opacity: 0.92 });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 12), streamMat);
    g.add(stream);
    g.position.set(o.x ?? 0, 0, z);
    const y1 = 1.29, y0 = Ln.beltY + 0.12;
    g.userData = {
      update(pour = 0) {
        stream.visible = pour > 0.01;
        const len = (y1 - y0) * pour;
        stream.scale.y = Math.max(0.001, len); stream.position.y = y1 - len / 2;
        valve.material = pour > 0.01 ? materials.yellow : materials.joint;
      },
    };
    g.userData.update(0);
    return g;
  }
  /** qcGate({ x, z }) -> Group: a yellow-and-mint vision arch with a camera dome; userData.update(level) flashes its ring light. */
  function qcGate(o = {}) {
    const g = archGate({ ...o, mat: materials.mint, h: 1.62 });
    g.name = "qcGate";
    const cam = box(0.24, 0.18, 0.24, materials.yellow, 0.05);
    cam.position.set(0, 1.42, 0);
    g.add(cam);
    const lensM = new THREE.MeshStandardMaterial({ color: "#1b2a33", emissive: new THREE.Color("#9fe8ff"), emissiveIntensity: 0.2, roughness: 0.1 });
    const lens = cyl(0.065, 0.05, lensM, 20);
    lens.position.set(0, 1.31, 0);
    g.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 28), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#dff6ff"), emissiveIntensity: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.315, 0);
    g.add(ring);
    g.userData = { update(level = 0) { ring.material.emissiveIntensity = 0.3 + 2.6 * level; lensM.emissiveIntensity = 0.2 + 1.2 * level; } };
    return g;
  }
  /** pusher({ x, z, stroke }) -> Group: a pneumatic side pusher on the far edge. userData.update(k 0..1, stroke). */
  function pusher(o = {}) {
    const g = new THREE.Group();
    g.name = "pusher";
    const z = o.z ?? -0.9;
    const bodyC = box(0.3, 0.22, 0.5, materials.mintDark, 0.05);
    bodyC.position.set(0, Ln.beltY + 0.16, z - 0.72);
    g.add(bodyC);
    const stand = box(0.12, Ln.beltY + 0.05, 0.12, materials.steelDark, 0.02);
    stand.position.set(0, (Ln.beltY + 0.05) / 2, z - 0.72);
    g.add(stand);
    const rod = cyl(0.025, 1, materials.steel, 12);
    rod.rotation.x = Math.PI / 2;
    g.add(rod);
    const pad = box(0.5, 0.2, 0.05, materials.yellow, 0.02);
    g.add(pad);
    g.position.x = o.x ?? 0;
    const stroke = o.stroke ?? 0.86;
    g.userData = {
      update(k = 0) {
        const pz = z - 0.44 + k * stroke;
        pad.position.set(0, Ln.beltY + 0.15, pz);
        const r0 = z - 0.47, r1 = pz - 0.02;
        rod.scale.y = Math.max(0.01, r1 - r0); rod.position.set(0, Ln.beltY + 0.16, (r0 + r1) / 2);
      },
    };
    g.userData.update(0);
    return g;
  }
  /**
   * wrapper({ x, z }) -> Group: a stretch-wrap station — two mint towers, a steel ring around the belt carrying a film roll.
   * userData.update(angle) spins the ring (plan.wrapSpin). Items grow their film as they pass the ring (item sealU).
   */
  function wrapper(o = {}) {
    const g = new THREE.Group();
    g.name = "wrapper";
    const z = o.z ?? -0.9, R = 0.62, cy = Ln.beltY + 0.2;
    const tw = box(0.5, 2.05, 0.26, materials.mint, 0.06);
    tw.position.set(0, 1.025, -0.92);
    g.add(tw);
    const cap = box(0.52, 0.12, 0.28, materials.yellow, 0.04);
    cap.position.set(0, 2.08, -0.92);
    g.add(cap);
    const top = box(0.42, 0.2, 1.05, materials.mint, 0.06);
    top.position.set(0, 1.92, -0.45);
    g.add(top);
    const hub = box(0.3, 0.42, 0.3, materials.mintDark, 0.05);
    hub.position.set(0, 1.62, 0);
    g.add(hub);
    const ringHousing = shadow(new THREE.Mesh(new THREE.TorusGeometry(R + 0.07, 0.05, 12, 56), materials.yellow));
    ringHousing.rotation.y = Math.PI / 2; ringHousing.position.set(-0.07, cy, 0);
    g.add(ringHousing);
    const strut = box(0.12, 1.62 - cy - R - 0.05, 0.12, materials.mintDark, 0.03);
    strut.position.set(-0.07, (1.62 + cy + R + 0.05) / 2 - 0.12, 0);
    g.add(strut);
    const spin = new THREE.Group();
    spin.position.set(0, cy, 0);
    g.add(spin);
    const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 12, 48), materials.steel));
    ring.rotation.y = Math.PI / 2;
    spin.add(ring);
    const roll = cyl(0.06, 0.34, new THREE.MeshPhysicalMaterial({ color: "#dcecf6", roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.85 }), 16);
    roll.position.set(0.02, R - 0.02, 0);
    spin.add(roll);
    const counterW = box(0.08, 0.1, 0.12, materials.joint, 0.02);
    counterW.position.set(0.02, -R + 0.03, 0);
    spin.add(counterW);
    g.position.set(o.x ?? 0, 0, z);
    g.userData = { ringX: o.x ?? 0, update(a = 0) { spin.rotation.x = a; } };
    return g;
  }
  /**
   * robotArm({ base }) -> Group: a yellow six-axis-style arm (pedestal, turret, upper arm, forearm, wrist, suction tool) driven
   * by line.armIK. userData.update(pose) with pose = plan.robot(t) ({ yaw, q1, q2, q3 }).
   */
  function robotArm(o = {}) {
    const Rb = spec.robot, base = o.base ?? Ln.robot.base;
    const g = new THREE.Group();
    g.name = "robotArm";
    const ped = cyl(Rb.pedestal[0] * 0.5, Rb.pedestal[1], materials.joint, 28, Rb.pedestal[0] * 0.6);
    ped.position.y = Rb.pedestal[1] / 2;
    g.add(ped);
    const plate = cyl(Rb.pedestal[0] * 0.7, 0.04, materials.steelDark, 28);
    plate.position.y = 0.02;
    g.add(plate);
    const turret = new THREE.Group();
    turret.position.y = Rb.pedestal[1];
    g.add(turret);
    const tb = cyl(0.27, Rb.shoulderH - Rb.pedestal[1] - 0.06, materials.yellow, 28, 0.3);
    tb.position.y = (Rb.shoulderH - Rb.pedestal[1] - 0.06) / 2;
    turret.add(tb);
    const shoulder = new THREE.Group();
    shoulder.position.y = Rb.shoulderH - Rb.pedestal[1];
    turret.add(shoulder);
    const sj = cyl(0.17, 0.36, materials.joint, 24);
    sj.rotation.x = Math.PI / 2;
    shoulder.add(sj);
    const T = Rb.thick;
    const upper = box(Rb.L1, T * 1.3, T, materials.yellow, 0.06, 3);
    upper.position.set(Rb.L1 / 2, 0, 0.13);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.set(Rb.L1, 0, 0);
    shoulder.add(elbow);
    const ej = cyl(0.12, 0.3, materials.joint, 22);
    ej.rotation.x = Math.PI / 2;
    elbow.add(ej);
    const fore = box(Rb.L2, T * 1.05, T * 0.85, materials.yellow, 0.05, 3);
    fore.position.set(Rb.L2 / 2, 0, -0.05);
    elbow.add(fore);
    const wrist = new THREE.Group();
    wrist.position.set(Rb.L2, 0, 0);
    elbow.add(wrist);
    const wj = cyl(0.075, 0.22, materials.joint, 18);
    wj.rotation.x = Math.PI / 2;
    wrist.add(wj);
    const tool = cyl(0.03, Rb.tool - 0.04, materials.steel, 12);
    tool.rotation.z = Math.PI / 2; tool.position.x = (Rb.tool - 0.04) / 2;
    wrist.add(tool);
    const cup = cyl(0.11, 0.04, materials.rubber, 20, 0.08);
    cup.rotation.z = Math.PI / 2; cup.position.x = Rb.tool - 0.02;
    wrist.add(cup);
    // cable loom along the upper arm
    const loom = cyl(0.025, Rb.L1 * 0.8, materials.joint, 8);
    loom.rotation.z = Math.PI / 2; loom.position.set(Rb.L1 / 2, T * 0.75, 0.13);
    shoulder.add(loom);
    g.position.set(base[0], base[1], base[2]);
    g.userData = {
      update(p) {
        turret.rotation.y = p.yaw;
        shoulder.rotation.z = p.q1;
        elbow.rotation.z = -p.q2;
        wrist.rotation.z = p.q3;
      },
      parts: { turret, shoulder, elbow, wrist },
    };
    return g;
  }
  /** pallet({ center, cols, rows, pitch }) -> Group: a wooden pallet sized to the slot grid. */
  function pallet(o = {}) {
    const PL = { ...Ln.robot.pallet, ...o };
    const g = new THREE.Group();
    g.name = "pallet";
    const w = PL.cols * PL.pitch[0] + 0.12, d = PL.rows * PL.pitch[1] + 0.12, top = PL.top;
    for (let k = 0; k < 9; k++) {
      const s = box(w, 0.025, d / 9 - 0.025, materials.wood, 0.004);
      s.position.set(0, top - 0.0125, -d / 2 + (k + 0.5) * (d / 9));
      g.add(s);
    }
    for (const sx of [-1, 0, 1]) {
      const b = box(0.1, top - 0.025, d, materials.wood, 0.006);
      b.position.set(sx * (w / 2 - 0.05), (top - 0.025) / 2, 0);
      g.add(b);
    }
    g.add(contactShadow({ w: w * 1.12, d: d * 1.15, opacity: 0.3, color: "#2b2620" }));
    g.position.set(PL.center[0], 0, PL.center[2]);
    return g;
  }

  // ---------------------------------------------------------------------------------------------- the whole line
  /**
   * packingLine({ net, plan, signs = true, counters = [...], sample = true, colorOf(item) }) -> Group with userData.update(t):
   * builds every belt, bed, station, stack light, sign, counter board, the robot, the pallet and one item per planned item,
   * and drives all of them from the plan. The convenience assembly; the factories above are usable on their own.
   */
  function packingLine({ net, plan, signs = true, counters, sample = true }) {
    const g = new THREE.Group();
    g.name = "packingLine";
    const St = Object.fromEntries(net.stations.map((s) => [s.id, s]));
    const beds = net.line.beds;
    const skip = beds.map((b) => b.x);
    for (const [id, path] of Object.entries(net.segments)) {
      const belt = beltSegment({ path, skipLegs: [...skip, ...(id === "infeed" ? [net.line.hood.x] : [])], endRollers: [id === "infeed", id === "post"] });
      g.add(belt);
    }
    for (const b of beds) g.add(rollerBed({ x: b.x, z: b.z }));
    const ch = chute();
    g.add(ch);
    const hd = hood({ z: St.scan.p[2] });
    g.add(hd);
    const scn = scannerGate({ x: St.scan.p[0], z: St.scan.p[2] });
    g.add(scn);
    const dv = diverter({ x: St.scan.p[0] + 0.48, z: St.divert.p[2] - Ln.beltW / 2 - 0.1, len: 1.05 });
    g.add(dv);
    const pr = press({ x: St.press.p[0], z: St.press.p[2] });
    g.add(pr);
    const fl = filler({ x: St.fill.p[0], z: St.fill.p[2] });
    g.add(fl);
    const qc = qcGate({ x: St.qc.p[0], z: St.qc.p[2] });
    g.add(qc);
    const ps = pusher({ x: St.push.p[0], z: St.push.p[2] });
    g.add(ps);
    const wr = wrapper({ x: St.wrap.p[0], z: St.wrap.p[2] });
    g.add(wr);
    const rb = robotArm({ base: net.line.robot.base });
    g.add(rb);
    g.add(pallet());
    // stack lights: on the scanner beam, the press housing, the filler arm, the QC beam, a robot cell post
    const lightsAt = {
      scan: [St.scan.p[0], 1.68, St.scan.p[2] - 0.45],
      press: [St.press.p[0], 2.43, St.press.p[2] - 0.48],
      fill: [St.fill.p[0] + 0.85, 0, St.fill.p[2] + 0.62],
      qc: [St.qc.p[0], 1.72, St.qc.p[2] - 0.45],
      pick: [net.line.robot.base[0] + 0.7, 0, net.line.robot.base[2] - 0.7],
    };
    const sl = {};
    for (const [id, p] of Object.entries(lightsAt)) {
      const L = stackLight({ height: id === "pick" ? 1.6 : id === "fill" ? 1.25 : 0.22 });
      L.position.set(...p);
      g.add(L);
      sl[id] = L;
    }
    // overhead signs (numbered steps) and the counter board
    if (signs) {
      const list = [["scan", 1, "SCAN", -0.4], ["divert", 2, "SORT", 0.75], ["press", 3, "PRESS", 0], ["fill", 4, "FILL", 0], ["qc", 5, "CHECK", -0.35], ["wrap", 6, "WRAP", 0.05], ["pick", 7, "PACK", 0.75]];
      for (const [id, step, text, dx] of list) {
        const s = sign({ text, step, w: text.length > 4 ? 1.36 : 1.18 });
        const p = St[id].p;
        s.position.set(p[0] + dx, spec.signs.y, p[2] - 0.15);
        g.add(s);
      }
    }
    const cb = counterBoard({ counters: counters ?? [{ key: "scanned", label: "SCANNED" }, { key: "filled", label: "FILLED" }, { key: "rejected", label: "REJECTED", color: "#ff7a6b" }, { key: "packed", label: "PACKED", color: "#8ff0b6" }], sample });
    cb.position.set(0.9, 3.55, -2.2);
    g.add(cb);
    // items
    const meshes = plan.items.map((it) => {
      const m = item({ type: it.type, seed: 17 + it.i * 7, color: it.i });
      g.add(m);
      return m;
    });
    const ringX = wr.userData.ringX;
    g.userData = {
      stations: { scn, dv, pr, fl, qc, ps, wr, rb, ch }, lights: sl, counterBoard: cb, items: meshes,
      update(t) {
        const pos = plan.positions(t);
        plan.items.forEach((it, k) => {
          const p = pos.get(it.id);
          let sealU;
          if (p?.visible && p.mode === "belt" && it.visits.wrap) sealU = clamp((p.p[0] + it.size[0] / 2 - ringX) / it.size[0]);
          meshes[k].userData.apply(p, { sealU });
        });
        // scanner: curtain sweeps along the item being read
        let sw = null, lvl = 0, itTop = Ln.beltY + 0.4;
        for (const it of plan.items) {
          const V = it.visits.scan;
          if (!V) continue;
          const d = t - V.start;
          if (Math.abs(d) < spec.timing.scanSweep) { sw = -d / spec.timing.scanSweep; lvl = 1 - Math.abs(d) / spec.timing.scanSweep; itTop = Ln.beltY + spec.items.lift + it.size[2]; }
        }
        scn.userData.update({ sweep: sw, level: lvl, itemTop: itTop });
        dv.userData.update(plan.diverter(t));
        pr.userData.update(plan.press(t));
        fl.userData.update(plan.pour(t));
        let qlv = 0;
        for (const it of plan.items) { const V = it.visits.qc; if (V) qlv = Math.max(qlv, 1 - smoothstep(0, 0.35, Math.abs(t - V.start))); }
        qc.userData.update(qlv);
        ps.userData.update(plan.push(t));
        wr.userData.update(plan.wrapSpin(t));
        rb.userData.update(plan.robot(t));
        const L = plan.lights(t);
        for (const [id, m] of Object.entries(sl)) m.userData.set(L[id] ?? { green: 1 });
        cb.userData.update(plan.counts(t));
        // rollers and drums turn with belt speed; the chute rollers with the rejected item's slide
        const dist = plan.beltOffset(t);
        for (const r of rollerMeshes) r.mesh.rotation.z = -dist / r.r;
        let cd = 0;
        for (const it of plan.items) if (it.chute && t > it.chute.t0) cd = Math.max(cd, Math.min(it.chute.len, 0.5 * spec.timing.slideAccel * Math.max(0, t - it.chute.t0 - spec.timing.pushOut) ** 2));
        ch.userData.update(cd);
      },
    };
    return g;
  }

  /** setBelts(t, v) — scroll the shared belt texture (u offset = distance travelled / tile). Call once per frame. */
  function setBelts(t, v = Ln.v) {
    const off = ((v * t) / spec.belt.tile) % 1;
    beltTex.offset.x = -off;
  }

  // ---------------------------------------------------------------------------------------------- overlay
  /** caption() -> overlay caption card for the beat label (bottom left, exact colours): userData.show(text, alpha). */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1300, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = x.measureText(st.text).width, pad = Q.cap * 0.6, bar = 14;
      const pw = Math.min(W - 16, tw + pad * 2 + bar + 8), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = "rgba(40,40,30,0.18)"; rrPath(x, ox + 2, oy + 6, pw, ph, 16); x.fill();
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = "rgba(31,42,51,0.14)"; x.lineWidth = 2; rrPath(x, ox + 1, oy + 1, pw - 2, ph - 2, 15); x.stroke();
      x.fillStyle = Q.rule; rrPath(x, ox + 16, oy + 18, bar, ph - 36, 5); x.fill();
      x.textAlign = "left"; x.textBaseline = "middle"; x.fillStyle = Q.ink;
      x.fillText(st.text, ox + 16 + bar + pad * 0.8, oy + ph / 2 + 2);
    }, { upload: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }
  /** stamp({ text = "SAMPLE DATA" }) -> overlay rubber-stamp tag (right-aligned at spec.stamp.x), always visible. */
  function stamp(o = {}) {
    const Q = { ...spec.stamp, ...o };
    const Wp = 340, Hp = 64;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H) => {
      x.font = `700 ${Q.cap}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = `${Q.cap * 0.12}px`;
      const tw = x.measureText(Q.text).width + Q.cap * 0.12, pw = tw + Q.cap * 1.1, ph = Q.cap * 1.75;
      const ox = W - pw - 4, oy = (H - ph) / 2;
      x.fillStyle = "rgba(251,250,246,0.92)"; rrPath(x, ox, oy, pw, ph, 6); x.fill();
      x.strokeStyle = Q.color; x.lineWidth = 3; rrPath(x, ox, oy, pw, ph, 6); x.stroke();
      x.fillStyle = Q.color; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(Q.text, ox + pw / 2 + Q.cap * 0.06, oy + ph / 2 + 1);
    }, { upload: true });
    mesh.userData.place(Q.x - Wp, Q.y);
    mesh.userData.set({ text: Q.text });
    mesh.userData.opacity(1);
    return mesh;
  }

  const props = {
    floorSet, beltSegment, rollerBed, chute, item, stackLight, sign, counterBoard, hood, scannerGate, diverter, press, filler,
    qcGate, pusher, wrapper, robotArm, pallet, packingLine, caption, stamp,
  };
  const factories = {
    floorSet: (o) => floorSet(o.dims ?? {}),
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: line, motion: line,
    helpers: { setBelts, beltTexture: beltTex, frames, sweep },
  };
}
