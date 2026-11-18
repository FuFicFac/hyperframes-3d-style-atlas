// styles/marble-run/style.js — "Marble Run": a handmade wooden marble machine on a workshop pegboard.
// Implements the style contract (references/kit-api.md §3).
//
// Geometry is authored around MARBLE-CENTRE paths: a rail/wire/tube factory takes the polyline the marble
// centre follows and builds its support underneath (grooved maple rail, two brass wires, glass tube), so
// the picture and the pure scheduler (./marbles.js — also imported by scene.config.js for the SCORE) can
// never disagree about where a marble rests. Nothing animates itself: scenes call
// `marble.userData.setPose(state)` with `plan.at(t)`, and `setGate(u)`, `setAngle(a)`, `setValue(v)` on mechanisms.
//
// Glass (marbles, tube, funnel, jar) is MeshPhysicalMaterial with a premultiplied fresnel-alpha patch:
// low alpha facing the camera, high at the rim, reflections/speculars at full strength — reads as glass
// without the transmission pass (which cannot see other transmissive objects).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { woodTexture, makeCanvas, canvasTexture, blobTexture, fbm2, plaqueCanvas, digitDrumTexture } from "../../kit/textures.js";
import { pathFrames, profileSweep } from "../../kit/paths.js";
import { fresnelGlass } from "../../kit/materials.js";
import { odometerValues } from "../../kit/schedule.js";
import { tubeAlong, rodGeometry, filletPath, expandStroke, vec3 } from "../../kit/paths.js";
import { rng, hash01, clamp } from "../../kit/time.js";
import * as MARBLES from "./marbles.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const { sub, add, mul, dot, len, nrm } = vec3;
const cross = MARBLES.cross;
const V = (a) => new THREE.Vector3(...a);

/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette;
  const col = (c) => P[c] ?? c;
  const textStyle = { font: spec.text.stamped, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const key = lights.key;
  if (key?.target && !key.target.parent) stage.scene.add(key.target);
  const toLight = key ? nrm(sub(key.position.toArray(), key.target.position.toArray())) : [-0.5, 0.6, 0.6];
  const shadow = (o, cast = true, recv = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; };

  // ---------------------------------------------------------------- shared textures
  const woodMat = (name, colors, seed, repeat = [1, 1]) => {
    const m = materials[name].clone();
    m.map = woodTexture({ size: 512, boards: 1, seed, grainFreq: 9, grainWarp: 1.4, contrast: 0.42, dark: col(colors[0]), mid: col(colors[1]), light: col(colors[2]), seam: col(colors[1]), repeat });
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    return m;
  };
  const maple = woodMat("maple", ["mapleDark", "maple", "mapleLight"], 31);
  const walnut = woodMat("walnut", ["walnutDark", "walnut", "walnutLight"], 47);
  const brass = materials.brass, brassDark = materials.brassDark;

  // ---------------------------------------------------------------- glass
  /** glassMaterial(kind = "vessel" | "marble", tint) -> kit materials.fresnelGlass with this style's spec.glass[kind]. */
  function glassMaterial(kind = "vessel", tint = P.glassTint, o = {}) {
    const g = { ...spec.glass[kind], ...o };
    const m = fresnelGlass({ color: tint, roughness: g.roughness, clearcoat: g.clearcoat, envIntensity: g.envIntensity, alphaFace: g.alphaFace, alphaRim: g.alphaRim,
      fresnelPower: g.fresnelPower, rim: g.rim, rimStrength: g.rimStrength, innerGlow: g.innerGlow ?? 0, toLight, doubleSide: kind === "vessel", depthWrite: !!g.depthWrite });
    m.name = `glass:${kind}`;
    return m;
  }
  const vesselGlass = glassMaterial("vessel");

  // pathFrames / sweepProfile: kit/paths.js pathFrames / profileSweep (promoted, identical code)
  const resample = (pts, step = 0.08) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(len(sub(b, a)) / step));
      for (let k = 1; k <= n; k++) out.push(add(a, mul(sub(b, a), k / n)));
    }
    return out;
  };
  const extendEnds = (pts, back = 0, front = 0) => {
    const a = pts[0], b = pts[1], y = pts[pts.length - 1], z = pts[pts.length - 2];
    return [add(a, mul(nrm(sub(a, b)), back)), ...pts, add(y, mul(nrm(sub(y, z)), front))];
  };

  const sweepProfile = profileSweep;

  // ---------------------------------------------------------------- small hardware
  const screwGeo = new THREE.CylinderGeometry(1, 1, 0.35, 16).rotateX(Math.PI / 2);
  function screw(p, rr = spec.wall.screwRadius) {
    const s = new THREE.Mesh(screwGeo, brass);
    s.scale.setScalar(rr);
    s.position.set(p[0], p[1], p[2] + rr * 0.17);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(rr * 1.6, rr * 0.22, rr * 0.2), brassDark);
    slot.position.set(p[0], p[1], p[2] + rr * 0.36);
    slot.rotation.z = hash01(Math.round(p[0] * 100), Math.round(p[1] * 100)) * Math.PI;
    const g = new THREE.Group();
    g.add(s, slot);
    return g;
  }
  /** standoff from a point on a part back to the wall (z = 0): brass rod + screw head. */
  function standoff(p, rr = 0.03) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rodGeometry([p[0], p[1], 0.005], p, rr, 10), brass));
    g.add(screw([p[0], p[1], 0], rr * 1.9));
    return shadow(g);
  }

  // ---------------------------------------------------------------- wall: pegboard with painted arrows
  /**
   * wall({ w = 20, h = 12, arrows: [{ from:[x,y], to:[x,y], color }], origin }) -> Mesh (XY plane at z = 0, centred on its position).
   * Hole grid, hardboard mottle + bump, hand-painted arrows in wall metres (relative to the wall centre unless `origin` is given).
   */
  function wall(o = {}) {
    const W = o.w ?? 20, H = o.h ?? 12, ppm = spec.wall.pxPerMetre, pitch = spec.wall.holePitch, hr = spec.wall.holeRadius;
    const cw = Math.round(W * ppm), ch = Math.round(H * ppm);
    const c = makeCanvas(cw, ch), b = makeCanvas(cw, ch);
    const x = c.getContext("2d"), y = b.getContext("2d");
    x.fillStyle = P.pegboard; x.fillRect(0, 0, cw, ch);
    y.fillStyle = "#808080"; y.fillRect(0, 0, cw, ch);
    // mottle: big soft blotches + fine fibre speckle (seeded)
    const R = rng(o.seed ?? 77);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${R.chance(0.5) ? "70,45,25" : "255,235,200"},${R.range(0.01, 0.03)})`;
      x.beginPath(); x.arc(R.range(0, cw), R.range(0, ch), R.range(40, 160), 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 26000; i++) {
      const g = R.range(0, 1);
      x.fillStyle = `rgba(${g < 0.5 ? "60,38,20" : "250,230,200"},${R.range(0.05, 0.16)})`;
      x.fillRect(R.range(0, cw), R.range(0, ch), R.range(1, 3), 1);
      y.fillStyle = `rgba(${g < 0.5 ? "0,0,0" : "255,255,255"},0.18)`;
      y.fillRect(R.range(0, cw), R.range(0, ch), 2, 1);
    }
    // painted arrows (under the holes: paint does not fill the holes)
    const ox = o.origin?.[0] ?? -W / 2, oy = o.origin?.[1] ?? -H / 2;
    const X = (v) => (v - ox) * ppm, Y = (v) => ch - (v - oy) * ppm;
    for (const [ai, a] of (o.arrows ?? []).entries()) {
      const A = rng(500 + ai);
      const [x0, y0] = [X(a.from[0]), Y(a.from[1])], [x1, y1] = [X(a.to[0]), Y(a.to[1])];
      const ang = Math.atan2(y1 - y0, x1 - x0), wpx = (a.width ?? 0.075) * ppm, head = (a.head ?? 0.26) * ppm;
      x.lineCap = "round"; x.lineJoin = "round";
      for (let k = 0; k < 7; k++) {
        x.strokeStyle = col(a.color ?? "paint");
        x.globalAlpha = 0.16 + A.range(0, 0.12);
        x.lineWidth = wpx * A.range(0.55, 1.05);
        const j = () => A.range(-0.12, 0.12) * wpx;
        const ex = x1 - Math.cos(ang) * head * 0.55, ey = y1 - Math.sin(ang) * head * 0.55;
        x.beginPath(); x.moveTo(x0 + j(), y0 + j());
        x.quadraticCurveTo((x0 + ex) / 2 + j() * 2, (y0 + ey) / 2 - wpx * 0.6 + j(), ex + j(), ey + j()); x.stroke();
        x.beginPath();
        for (const s of [1, -1]) {
          x.moveTo(x1 + j(), y1 + j());
          x.lineTo(x1 - Math.cos(ang + s * 0.55) * head + j(), y1 - Math.sin(ang + s * 0.55) * head + j());
        }
        x.stroke();
      }
      x.globalAlpha = 1;
    }
    // holes: dark bore + a light lower-right bevel; bump: black pits
    const hp = hr * ppm;
    for (let gy = pitch / 2; gy < H; gy += pitch)
      for (let gx = pitch / 2; gx < W; gx += pitch) {
        const px = gx * ppm, py = gy * ppm;
        x.fillStyle = "rgba(255,240,215,0.22)"; x.beginPath(); x.arc(px + hp * 0.3, py + hp * 0.3, hp * 1.1, 0, Math.PI * 2); x.fill();
        x.fillStyle = P.hole; x.beginPath(); x.arc(px, py, hp, 0, Math.PI * 2); x.fill();
        y.fillStyle = "#000"; y.beginPath(); y.arc(px, py, hp * 1.05, 0, Math.PI * 2); y.fill();
      }
    const m = materials.pegboard.clone();
    m.map = canvasTexture(c);
    m.bumpMap = canvasTexture(b, { srgb: false });
    m.bumpScale = o.bump ?? 1.4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m);
    mesh.receiveShadow = true;
    mesh.name = "wall";
    return mesh;
  }

  /** bench({ w = 20, d = 1.7, h = 1.2 }) -> walnut workbench, top at y = 0, back edge at z = 0. */
  function bench(o = {}) {
    const W = o.w ?? 20, D = o.d ?? 1.7, Hh = o.h ?? 1.2;
    const g = new THREE.Group();
    const top = walnut.clone();
    top.map = woodTexture({ size: 1024, boards: 5, seed: 9, grainFreq: 14, dark: P.walnutDark, mid: P.walnut, light: P.walnutLight, repeat: [W / 5, 1] });
    top.map.wrapS = THREE.RepeatWrapping;
    const t = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D), top);
    t.position.set(0, -0.06, D / 2);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, 0.1), walnut);
    apron.position.set(0, -0.12 - Hh / 2, D - 0.12);
    g.add(t, apron);
    return shadow(g, false, true);
  }

  // ---------------------------------------------------------------- rails and tracks
  const RAIL = spec.rail, WIRE = spec.wire;
  /** grooved-rail cross-section for marble radius r: top at n = 0, groove of half-width w·r. */
  function railProfile(r) {
    const gw = RAIL.grooveHalfWidth * r, hw = gw + RAIL.wall * r, H = RAIL.height * r;
    const pr = [[-hw, -H], [hw, -H], [hw, 0], [gw, 0]];
    for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI; pr.push([gw * Math.cos(a), -gw * Math.sin(a) * 0.9]); }
    pr.push([-gw, 0], [-hw, 0]);
    return { pr, hw, H };
  }
  /**
   * rail({ path (marble-centre points), r, bend = 0, extend:[back, front], standoffs = true, stopEnd = false }) -> Group
   * Grooved maple rail under a marble-centre path; brass standoffs to the wall every ~1.2 m.
   */
  function rail(o) {
    const r = o.r ?? spec.marble.r;
    const lift = Math.sqrt(1 - RAIL.grooveHalfWidth ** 2) * r;
    let pts = filletPath(expandStroke(o.path), o.bend ?? 0);
    pts = extendEnds(pts, o.extend?.[0] ?? 0.12, o.extend?.[1] ?? 0.12);
    const fr = pathFrames(resample(pts, 0.1)).map((f) => ({ ...f, p: sub(f.p, mul(f.N, lift)) }));
    const { pr, hw, H } = railProfile(r);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(sweepProfile(fr, pr, { uScale: 1.6 }), maple);
    g.add(mesh);
    if (o.standoffs !== false) {
      const L = fr.length, n = Math.max(2, Math.round((fr.length * 0.1) / 1.2) + 1);
      for (let k = 0; k < n; k++) {
        const f = fr[Math.round(((k + 0.5) / n) * (L - 1))];
        const p = add(f.p, add(mul(f.N, -H * 0.5), mul(f.B, -hw)));
        if (p[2] > 0.02) g.add(standoff(p, 0.028));
      }
    }
    if (o.stopEnd) {
      const f = fr[fr.length - 1];
      const pin = stopPin({ r: 0.035, h: 2 * hw + 0.04 });
      pin.position.set(...add(f.p, mul(f.N, r * 0.7)));
      pin.rotation.y = Math.atan2(f.B[0], f.B[2]);
      g.add(pin);
    }
    g.userData = { path: pts, lift };
    return shadow(g);
  }

  /** wireTrack({ path, r, bend, extend, ties = .55 }) -> Group: two brass wires the marble rides on + U ties + standoffs. */
  function wireTrack(o) {
    const r = o.r ?? spec.marble.r, rw = WIRE.radius, w = WIRE.halfGap * r;
    const hgt = Math.sqrt((r + rw) ** 2 - w * w);
    let pts = filletPath(expandStroke(o.path), o.bend ?? 0);
    pts = extendEnds(pts, o.extend?.[0] ?? 0.1, o.extend?.[1] ?? 0.02);
    const fr = pathFrames(resample(pts, 0.05));
    const g = new THREE.Group();
    for (const s of [1, -1]) {
      const line = fr.map((f) => add(f.p, add(mul(f.N, -hgt), mul(f.B, s * w))));
      g.add(new THREE.Mesh(tubeAlong(line, { radius: rw, radial: 10 }), brass));
    }
    const step = Math.max(1, Math.round((o.ties ?? 0.55) / 0.05));
    for (let i = 0; i < fr.length; i += step) {
      const f = fr[i];
      const a = add(f.p, add(mul(f.N, -hgt), mul(f.B, w))), b = add(f.p, add(mul(f.N, -hgt), mul(f.B, -w)));
      const lo = (q) => add(q, mul(f.N, -0.09));
      g.add(new THREE.Mesh(tubeAlong([a, lo(a), lo(b), b], { radius: rw * 0.7, bend: 0.03, radial: 8 }), brass));
      if (i % (step * 2) === 0) {
        const m = lo(add(mul(a, 0.5), mul(b, 0.5)));
        g.add(new THREE.Mesh(rodGeometry([m[0], m[1], 0.005], m, 0.02, 8), brass));
        g.add(screw([m[0], m[1], 0], 0.04));
      }
    }
    g.userData = { path: pts, lift: hgt };
    return shadow(g);
  }

  // ---------------------------------------------------------------- vessels
  /** funnel({ center:[x, rimY, z], rMouth, rNeck, height, neck }) -> Group: glass cone + brass rim ring + neck collar + bracket. */
  function funnel(o) {
    const { rMouth, rNeck, height, neck = 0.14 } = o;
    const pts = [new THREE.Vector2(rNeck, -height - neck), new THREE.Vector2(rNeck, -height)];
    for (let k = 1; k <= 12; k++) { const u = k / 12; pts.push(new THREE.Vector2(rNeck + (rMouth - rNeck) * u, -height + height * u)); }
    pts.push(new THREE.Vector2(rMouth + 0.012, 0.01));
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), vesselGlass);
    cone.renderOrder = 3;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rMouth + 0.01, 0.026, 10, 56).rotateX(Math.PI / 2), brass);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(rNeck + 0.025, rNeck + 0.025, 0.09, 32, 1, true), brass);
    collar.position.y = -height - neck + 0.045;
    collar.material = brass;
    const collarIn = new THREE.Mesh(new THREE.CylinderGeometry(rNeck + 0.004, rNeck + 0.004, 0.09, 32, 1, true), brassDark);
    collarIn.material = brassDark.clone(); collarIn.material.side = THREE.BackSide;
    collarIn.position.y = collar.position.y;
    g.add(cone, rim, collar, collarIn);
    shadow(rim); shadow(collar);
    // bracket: two short horizontal brass arms from the back of the rim straight back to the wall (end-on from the front)
    const c = o.center;
    for (const sgn of [-1, 1]) {
      const a = sgn * 0.7, p = [Math.sin(a) * (rMouth + 0.01), 0, -Math.cos(a) * (rMouth + 0.01)];
      g.add(shadow(new THREE.Mesh(rodGeometry(p, [p[0], p[1], -c[2] + 0.005], 0.02, 10), brass)));
      g.add(screw([p[0], p[1], -c[2]], 0.04));
    }
    g.position.set(...c);
    return g;
  }

  /**
   * tube({ xL, xR, y, z, rIn, wall, sill }) -> Group: horizontal glass tube (open ends), brass end collars, a brass sill
   * across the bottom of the LEFT mouth (height `sill`; the row rests against its corner), and two wall clamps.
   */
  function tube(o) {
    const { xL, xR, y, z, rIn, sill } = o, wl = o.wall ?? 0.026, Lt = xR - xL;
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(rIn + wl / 2, rIn + wl / 2, Lt, 56, 1, true).rotateZ(Math.PI / 2);
    const glass = new THREE.Mesh(geo, vesselGlass);
    glass.position.set((xL + xR) / 2, y, z);
    glass.renderOrder = 3;
    g.add(glass);
    for (const [x0, s] of [[xL, 1], [xR, -1]]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rIn + wl + 0.02, rIn + wl + 0.02, 0.1, 48, 1, true).rotateZ(Math.PI / 2), brass);
      ring.position.set(x0 + s * 0.05, y, z);
      const lipR = new THREE.Mesh(new THREE.TorusGeometry(rIn + wl + 0.01, 0.016, 8, 48).rotateY(Math.PI / 2), brass);
      lipR.position.set(x0, y, z);
      g.add(ring, lipR);
    }
    if (sill) {
      const s = new THREE.Mesh(new RoundedBoxGeometry(0.06, sill + 0.02, rIn * 1.3, 2, 0.012), brass);
      s.position.set(xL - 0.03, y - rIn + (sill - 0.02) / 2, z);
      g.add(s);
    }
    for (const x0 of [xL + 0.4, xR - 0.4]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rIn + wl + 0.014, rIn + wl + 0.014, 0.05, 48, 1, true).rotateZ(Math.PI / 2), brass);
      band.position.set(x0, y, z);
      g.add(band, standoff([x0, y - rIn - wl - 0.01, z - 0.08], 0.03));   // foot under the tube, so it never shows through the glass
    }
    g.traverse((m) => { if (m.isMesh && m !== glass) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /** jar({ rIn, h, glass, backstop: top|null }) -> Group at the jar's base centre: glass jar + brass rim; optional brass backstop plate (−x side). */
  function jar(o) {
    const ri = o.rIn, wl = o.glass ?? 0.03, ro = ri + wl, h = o.h;
    const pts = [[0.001, 0], [ro - 0.03, 0], [ro, 0.03], [ro, h], [ri, h], [ri, wl + 0.02], [ri - 0.02, wl], [0.001, wl]].map((q) => new THREE.Vector2(q[0], q[1]));
    const g = new THREE.Group();
    const j = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), vesselGlass);
    j.renderOrder = 3;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(ro - 0.004, 0.022, 10, 48).rotateX(Math.PI / 2), brass);
    rim.position.y = h;
    g.add(j, shadow(rim));
    if (o.backstop) {
      const top = o.backstop - h;
      const plate = new THREE.Mesh(new RoundedBoxGeometry(0.03, top + 0.12, 0.36, 2, 0.01), brass);
      plate.position.set(-ri - 0.015, h + top / 2 - 0.03, 0);
      g.add(shadow(plate));
    }
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(ro * 3.2, ro * 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), color: "#000", transparent: true, opacity: 0.35, depthWrite: false }));
    cs.position.y = 0.004;
    g.add(cs);
    return g;
  }

  /** tray({ slots = 5, pitch = 2.2·r, r }) -> walnut tray with dimpled slots; userData.slot(i) -> local marble-centre [x,y,z]. */
  function tray(o = {}) {
    const r = o.r ?? spec.marble.r, n = o.slots ?? 5, pitch = o.pitch ?? 2.2 * r, W = n * pitch + 0.16, D = 2 * r + 0.16;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, 0.06, D, 2, 0.02), walnut);
    base.position.y = 0.03;
    g.add(base);
    for (const s of [1, -1]) {
      const lip = new THREE.Mesh(new RoundedBoxGeometry(W, 0.12, 0.04, 2, 0.015), walnut);
      lip.position.set(0, 0.09, s * (D / 2 - 0.02));
      const end = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.12, D, 2, 0.015), walnut);
      end.position.set(s * (W / 2 - 0.02), 0.09, 0);
      g.add(lip, end);
    }
    const dimple = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.012, 6, 24).rotateX(Math.PI / 2), materials.walnut);
    const sx = (i) => -W / 2 + 0.08 + pitch * (i + 0.5);
    for (let i = 0; i < n; i++) { const d = dimple.clone(); d.position.set(sx(i), 0.062, 0); g.add(d); }
    const dip = r - Math.sqrt(r * r - (r * 0.55) ** 2);
    g.userData.slot = (i) => [sx(i), 0.06 + r - dip, 0];
    return shadow(g);
  }

  /** stopPin({ r = .035, h = .3 }) -> brass pin along +Z with a domed head (a stop, a gate, a peg). */
  function stopPin(o = {}) {
    const rr = o.r ?? 0.035, h = o.h ?? 0.3;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, h, 14).rotateX(Math.PI / 2), brass);
    const head = new THREE.Mesh(new THREE.SphereGeometry(rr * 1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), brass);
    head.position.z = h / 2;
    g.add(body, head);
    return shadow(g);
  }

  /** flag({ len = .3, color = "paint", flag = .16 }) -> trip lever pivoting at its origin about Z: lower arm hangs down (tripped by a
   *  passing marble), a painted pennant rides above. userData.setAngle(a) (+a swings the lower tip toward +x). */
  function flag(o = {}) {
    const L = o.len ?? 0.3, fs = o.flag ?? 0.16;
    const g = new THREE.Group(), arm = new THREE.Group();
    arm.add(new THREE.Mesh(rodGeometry([0, -L, 0], [0, L * 0.9, 0], 0.012, 8), brass));
    const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(fs * 1.35, -fs * 0.42), new THREE.Vector2(0, -fs * 0.84)]);
    const pen = new THREE.Mesh(new THREE.ShapeGeometry(tri), materials.paint.clone());
    pen.material.side = THREE.DoubleSide;
    pen.position.set(0.006, L * 0.9, 0);
    arm.add(pen);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), brass);
    tip.position.y = -L;
    arm.add(tip);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16).rotateX(Math.PI / 2), brassDark);
    g.add(arm, hub);
    g.userData.setAngle = (a) => { arm.rotation.z = a; };
    return shadow(g);
  }

  /**
   * liftWheel({ R = .7, pockets = 8, r, thickness = .12 }) -> maple disc with marble pockets cut in its rim, brass hub.
   * userData.setAngle(a) turns it about Z; userData.pocket(i, a) -> local marble-centre [x,y,z] for pocket i at angle a.
   */
  function liftWheel(o = {}) {
    const r = o.r ?? spec.marble.r, Rr = o.R ?? 0.7, n = o.pockets ?? 8, th = o.thickness ?? 0.12;
    const sh = new THREE.Shape();
    const N = n * 24;
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const local = ((a / (Math.PI * 2)) * n) % 1;
      const d = Math.abs(local - 0.5) * (Math.PI * 2 * Rr) / n;           // arc distance from the pocket centre
      const dip = d < r * 0.95 ? Math.sqrt(r * r * 0.9 - Math.min(d * d, r * r * 0.9)) : 0;
      const rad = Rr - dip;
      if (k === 0) sh.moveTo(rad * Math.cos(a), rad * Math.sin(a)); else sh.lineTo(rad * Math.cos(a), rad * Math.sin(a));
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -th / 2);
    const disc = new THREE.Mesh(geo, maple);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, th + 0.08, 20).rotateX(Math.PI / 2), brass);
    const spin = new THREE.Group();
    spin.add(disc, hub);
    const g = new THREE.Group();
    g.add(spin);
    const pocketA = (i) => ((i + 0.5) / n) * Math.PI * 2;
    g.userData.setAngle = (a) => { spin.rotation.z = a; };
    g.userData.pocket = (i, a = 0) => { const ang = pocketA(i) + a, rr = Rr - Math.sqrt(r * r * 0.9) + r * 0.95; return [rr * Math.cos(ang), rr * Math.sin(ang), 0]; };
    return shadow(g);
  }

  // ---------------------------------------------------------------- lettering: engraved brass / stamped ply
  const FONT_FOR = { brass: spec.text.engraved, wood: spec.text.stamped };
  function letterCanvas(text, kind, cap, { pad = [0.28, 0.2], seed = 1, ppm = 360 } = {}) {
    // kit textures.plaqueCanvas (promoted, identical drawing); brass = "engraved", wood = "stamped"
    return plaqueCanvas(text, { kind: kind === "brass" ? "engraved" : "stamped", cap, pad, seed, ppm, font: FONT_FOR[kind] ?? FONT_FOR.wood, weight: 700, metal: P.brass, ink: P.ink, wood: { mid: P.ply, seam: P.ply } });
  }

  /**
   * plaque({ text, cap = .27, kind = "brass" | "wood", depth, screws = true, hang = null | length }) -> Group
   *   Engraved brass plaque (dark-filled letters, bevel glint, border) or ink-stamped birch-ply tag. Origin = centre of the
   *   front face, unless `hang` is set: then the origin is the hook pin and the tag hangs `hang` metres below it on two strings
   *   (rotate the group about Z to swing it). userData.size = [w, h].
   */
  function plaque(o) {
    const kind = o.kind ?? "brass", cap = o.cap ?? 0.27;
    const L = letterCanvas(o.text, kind, cap, { seed: o.seed ?? 3 });
    const d = o.depth ?? (kind === "brass" ? 0.035 : 0.05);
    const body = new THREE.Mesh(new RoundedBoxGeometry(L.w, L.h, d, 2, kind === "brass" ? 0.012 : 0.02), kind === "brass" ? brass : woodMat("ply", ["#c9a877", "ply", "#f0dcb4"], 71));
    body.position.z = -d / 2;
    const fm = kind === "brass" ? brass.clone() : materials.ply.clone();
    fm.map = canvasTexture(L.canvas);
    fm.color.set("#ffffff");
    if (L.rm) { fm.roughnessMap = fm.metalnessMap = canvasTexture(L.rm, { srgb: false }); fm.roughness = 1; fm.metalness = spec.plaque.metalness; fm.envMapIntensity = spec.plaque.env; }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(L.w - 0.02, L.h - 0.02), fm);
    face.position.z = 0.0015;
    const inner = new THREE.Group();
    inner.add(body, face);
    if (o.screws !== false && !o.hang) for (const s of [-1, 1]) inner.add(screw([s * (L.w / 2 - 0.09), 0, 0.001], 0.035));
    shadow(inner);
    face.castShadow = false;
    const g = new THREE.Group();
    if (o.hang) {
      inner.position.y = -o.hang - L.h / 2;
      const topY = -o.hang;
      for (const s of [-1, 1]) {
        const a = [s * (L.w / 2 - 0.12), topY - 0.04, -d / 2], b = [0, -0.02, -d / 2];
        g.add(shadow(new THREE.Mesh(tubeAlong([a, b], { radius: 0.008, radial: 6, caps: false }), materials.string)));
        g.add(shadow(new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 14), brass)).translateX(a[0]).translateY(a[1]).translateZ(0.003));
      }
    }
    g.add(inner);
    g.userData.size = [L.w, L.h];
    return g;
  }

  /** hook({ len = .22 }) -> brass pegboard hook (a peg pin out of a hole with an upturned tip) at the origin (wall point). */
  function hook(o = {}) {
    const L = o.len ?? 0.22;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(tubeAlong([[0, 0, 0], [0, 0, L], [0, 0.07, L + 0.03]], { radius: 0.018, bend: 0.04, radial: 10 }), brass));
    g.add(screw([0, 0, 0], 0.045));
    return shadow(g);
  }

  // ---------------------------------------------------------------- counter (odometer drums)
  let digitTex = null;
  const digitTexture = () => (digitTex ??= digitDrumTexture({ font: spec.text.stamped })); // kit textures.digitDrumTexture
  /**
   * counter({ digits = 2, label = "TOKENS" }) -> brass mechanical counter: engraved label, a window of odometer drums.
   *   userData.setValue(v) (fractional v rolls the drums; tens roll as the units pass 9 -> 0). Origin = centre of the front face.
   */
  function counter(o = {}) {
    const n = o.digits ?? 2, dw = 0.27, Rd = 0.27;
    const W = n * dw + 0.36, H = 0.78, D = 0.36;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 3, 0.04), brass);
    box.position.z = -D / 2;
    g.add(box);
    const lab = plaque({ text: o.label ?? "TOKENS", cap: 0.1, kind: "brass", screws: false, depth: 0.01 });
    lab.position.set(0, H / 2 - 0.15, 0.006);
    g.add(lab);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(n * dw + 0.06, 0.25), new THREE.MeshStandardMaterial({ color: "#120b06", roughness: 0.9 }));
    win.position.set(0, -0.08, 0.002);
    g.add(win);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 4, Math.PI * 2).rotateZ(Math.PI / 4), brassDark);
    bezel.scale.set((n * dw + 0.1) / 1.414, 0.3 / 1.414, 1);
    bezel.position.set(0, -0.08, 0.01);
    g.add(bezel);
    const dm = new THREE.MeshStandardMaterial({ map: digitTexture(), roughness: 0.55 });
    const drums = [];
    for (let i = 0; i < n; i++) {
      const holder = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(Rd, Rd, dw - 0.03, 40), dm);
      drum.rotation.z = -Math.PI / 2;
      holder.add(drum);
      holder.position.set((i - (n - 1) / 2) * dw, -0.08, -Rd + 0.035);
      g.add(holder);
      drums.push(holder);
    }
    for (const s of [-1, 1]) g.add(screw([s * (W / 2 - 0.08), -H / 2 + 0.08, 0.001], 0.03));
    const roll = (v) => -2 * Math.PI * (v + 0.5) / 10;
    g.userData.setValue = (v) => {
      const vals = odometerValues(v, n); // kit schedule.odometerValues (same carry maths)
      for (let i = 0; i < n; i++) drums[i].rotation.x = roll(vals[i]);
    };
    g.userData.setValue(0);
    return shadow(g);
  }

  // ---------------------------------------------------------------- hopper (bin with an outlet gate)
  /**
   * hopper({ x0, x1, y0, y1, depth, outlet:[x,y,z], r, label, pile, seed, colors }) -> Group in world coordinates:
   *   walnut bin screwed to the wall, ink-stamped label tag on the front, a heap of marbles showing over the rim, and an
   *   outlet in the right wall with a hinged brass flap. userData.setGate(u) (0 closed .. 1 open).
   */
  function hopper(o) {
    const r = o.r ?? spec.marble.r, { x0, x1, y0, y1, depth } = o, th = 0.07;
    const g = new THREE.Group();
    const W = x1 - x0, H = y1 - y0, cx = (x0 + x1) / 2;
    const panel = (w, h, d, p) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.015), walnut); m.position.set(...p); return m; };
    g.add(panel(W, H + 0.3, th, [cx, y0 + (H + 0.3) / 2, th / 2]));                 // back (taller)
    g.add(panel(W + 0.02, H, th, [cx, y0 + H / 2, depth - th / 2]));                 // front
    g.add(panel(th, H + 0.1, depth, [x0 + th / 2, y0 + (H + 0.1) / 2, depth / 2]));    // left
    const oy = o.outlet[1], gapTop = oy + r + 0.05;
    g.add(panel(th, y1 + 0.1 - gapTop, depth, [x1 - th / 2, (gapTop + y1 + 0.1) / 2, depth / 2])); // right (above the outlet)
    const floorY = oy - r - 0.02;
    g.add(panel(th, floorY - y0 + 0.02, depth, [x1 - th / 2, (y0 + floorY) / 2, depth / 2]));      // right (below)
    const fl = panel(W, th, depth, [cx, y0 + th / 2, depth / 2]);
    g.add(fl);
    // label tag on the front
    const tag = plaque({ text: o.label ?? "YOUR\nCONVERSATION", cap: o.cap ?? 0.22, kind: "wood", seed: 12 });
    tag.position.set(cx, y0 + H / 2, depth + 0.03);
    g.add(tag);
    // heap peeking over the rim (decorative, static)
    const R = rng(o.seed ?? 5);
    const cols = o.colors ?? P.marbles;
    const n = o.pile ?? 14;
    for (let i = 0; i < n; i++) {
      const row = i % 2, k = Math.floor(i / 2);
      const m = marble({ r, color: cols[(i * 7 + 3) % cols.length], seed: 100 + i });
      const px = x0 + 0.25 + (k + 0.5 * row) * ((W - 0.5) / Math.ceil(n / 2)) + R.range(-0.04, 0.04);
      m.position.set(px, y1 - 0.06 + (row ? 0.17 : 0) + R.range(-0.03, 0.04), row ? depth * 0.38 : depth * 0.66);
      m.quaternion.setFromEuler(new THREE.Euler(R.range(0, 6), R.range(0, 6), R.range(0, 6)));
      g.add(m);
    }
    // outlet flap (brass), hinged on a pin at the top of the opening, swings out to +x
    const flapPivot = new THREE.Group();
    flapPivot.position.set(x1 + 0.005, gapTop, o.outlet[2]);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(0.025, 2 * r + 0.06, 2 * r + 0.08, 2, 0.008), brass);
    flap.position.y = -(r + 0.03);
    flapPivot.add(flap, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2 * r + 0.14, 10).rotateX(Math.PI / 2), brassDark));
    g.add(flapPivot);
    g.userData.setGate = (u) => { flapPivot.rotation.z = clamp(u) * 1.25; };
    for (const sx of [x0 + 0.12, x1 - 0.12]) g.add(screw([sx, y1 + 0.18, th + 0.001], 0.045));
    return shadow(g);
  }

  // ---------------------------------------------------------------- marbles
  const MB = spec.marble;
  const ribbonCache = new Map();
  function ribbonGeometry(r) {
    if (ribbonCache.has(r)) return ribbonCache.get(r);
    const Rb = MB.ribbon, Lr = Rb.length * r, Wr = Rb.width * r, parts = [];
    for (let v = 0; v < Rb.vanes; v++) {
      const geo = new THREE.PlaneGeometry(Lr, Wr, 28, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const u = x / Lr, taper = Math.cos(u * Math.PI) ** 0.6;      // vanes taper toward the poles
        const a = Rb.twist * Math.PI * u + (v * Math.PI) / Rb.vanes;
        const yy = y * taper;
        p.setXYZ(i, x, yy * Math.cos(a), yy * Math.sin(a));
      }
      geo.computeVertexNormals();
      parts.push(geo);
    }
    const merged = new THREE.BufferGeometry();
    let total = 0; for (const q of parts) total += q.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), idx = [];
    let o = 0;
    for (const q of parts) {
      pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3);
      for (const k of q.index.array) idx.push(k + o);
      o += q.attributes.position.count;
    }
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    merged.setIndex(idx);
    ribbonCache.set(r, merged);
    return merged;
  }
  const shellGeo = new THREE.SphereGeometry(1, 40, 28);
  const glassCache = new Map(), ribbonMatCache = new Map();
  /**
   * marble({ r, color, seed }) -> Group: glass shell (fresnel alpha, sharp highlight) + twisted cat's-eye vanes.
   *   userData.setPose({ p, q, visible }) applies a MarblePlan state.
   */
  function marble(o = {}) {
    const r = o.r ?? MB.r, c = new THREE.Color(o.color ?? P.marbles[0]);
    const key_ = c.getHexString();
    if (!glassCache.has(key_)) {
      const tint = new THREE.Color(P.glassTint).lerp(c, spec.glass.marble.tintMix);
      glassCache.set(key_, glassMaterial("marble", tint));
      const rm = materials.ribbon.clone();
      rm.color.copy(c);
      rm.emissive = c.clone().multiplyScalar(MB.ribbon.emissive);
      ribbonMatCache.set(key_, rm);
    }
    const g = new THREE.Group();
    const shell = new THREE.Mesh(shellGeo, glassCache.get(key_));
    shell.scale.setScalar(r);
    shell.renderOrder = 2;
    shell.castShadow = true;
    const rib = new THREE.Mesh(ribbonGeometry(r), ribbonMatCache.get(key_));
    rib.castShadow = true;
    rib.rotation.set(hash01(o.seed ?? 1, 1) * 6, hash01(o.seed ?? 1, 2) * 6, 0);
    g.add(rib, shell);
    g.userData.color = c;
    g.userData.setPose = (s) => {
      g.visible = s.visible !== false;
      g.position.set(s.p[0], s.p[1], s.p[2]);
      g.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    };
    return g;
  }

  /** caustic(color) -> additive bright spot for a marble's wall shadow; place with placeCaustic(spot, p, r). */
  const blob = blobTexture({ stops: [[0, 1], [0.3, 0.7], [0.65, 0.18], [1, 0]] });
  const C = spec.glass.caustic;
  function caustic(color) {
    const m = new THREE.MeshBasicMaterial({ map: blob, color: new THREE.Color(color).lerp(new THREE.Color("#fff6e0"), 0.35).multiplyScalar(C.boost), transparent: true, opacity: C.opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    s.renderOrder = 1;
    return s;
  }
  const L0 = key ? nrm(sub(key.target.position.toArray(), key.position.toArray())) : [0.5, -0.6, -0.6];
  /** placeCaustic(spot, p, r, wallZ = 0): spot lands where the key light focuses through the marble onto the wall. */
  function placeCaustic(spot, p, r, wallZ = 0) {
    const s = (wallZ + 0.004 - p[2]) / L0[2];
    spot.position.set(p[0] + L0[0] * s, p[1] + L0[1] * s, wallZ + 0.004);
    const k = C.size * 2 * r * (1 + 0.25 * p[2]);
    spot.scale.set(k, k * 0.82, 1);
  }

  const props = {
    wall, bench, rail, wireTrack, funnel, tube, jar, tray, stopPin, flag, liftWheel, counter, hopper, plaque, hook, marble, caustic, standoff, screw,
  };
  const factories = {
    wall: (s) => wall({ ...s.dims }),
    bench: (s) => bench({ ...s.dims }),
  };
  return {
    spec, palette: P, materials: { ...materials, mapleWood: maple, walnutWood: walnut, vesselGlass }, lights, post, textStyle,
    camera: spec.camera, props, factories, sfx: spec.sfx,
    helpers: { glassMaterial, sweepProfile, pathFrames, placeCaustic, railProfile, lightDir: L0 },
    motion: MARBLES,
  };
}
