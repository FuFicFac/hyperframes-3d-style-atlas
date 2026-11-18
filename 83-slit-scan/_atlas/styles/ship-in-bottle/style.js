// styles/ship-in-bottle/style.js — "Ship in a Bottle": a clear bottle on a cradle on a bright modeller's bench, and a
// small wooden ship that is folded flat, slid through the neck and raised by one thread. The look lives in spec.js;
// every hinge angle, thread point, route position and sound time lives in rigging.js (THREE-free planner shared with
// SCORE). This file turns a plan into pictures: thin fresnel glass (kit) with painted soft highlight streaks, a lofted
// hull with vertex-colour strakes, masts on hinge pivots, pleated paper sails whose vertices are rewritten from the
// plan's open value, live thread tubes fed plan polylines, a putty sea filling the bottom of the bottle, the slip, wire,
// pull ring, cork, bench dressing and an overlay caption plate. Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture, woodTexture, gridTexture, speckleTexture } from "../../kit/textures.js";
import { fresnelGlass } from "../../kit/materials.js";
import { liveTube, rodGeometry } from "../../kit/paths.js";
import { contactShadow } from "../../kit/builders.js";
import { smoothstep, lerp, TAU } from "../../kit/time.js";
import * as rigging from "./rigging.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, B = spec.bottle, SH = spec.ship, H = SH.hull;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const box = (w, h, d, mat, x, y, z) => { const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; };
  const col = (hex) => new THREE.Color(hex);

  // ---------------------------------------------------------------- glass
  const G = spec.glass;
  const glassMat = fresnelGlass({ color: G.color, alphaFace: G.alphaFace, alphaRim: G.alphaRim, fresnelPower: G.fresnelPower, rimStrength: G.rimStrength, envIntensity: G.envIntensity, roughness: G.roughness, clearcoat: G.clearcoat, toLight: [-4.5, 8.5, 6] });
  glassMat.name = "glass";
  const thickMat = fresnelGlass({ color: G.color, alphaFace: G.thick.alphaFace, alphaRim: G.thick.alphaRim, fresnelPower: G.fresnelPower, rimStrength: G.rimStrength, envIntensity: G.envIntensity, roughness: G.roughness, clearcoat: G.clearcoat, toLight: [-4.5, 8.5, 6] });
  thickMat.name = "glass:thick";

  /** soft highlight texture: white, alpha fades to 0 at every edge */
  function streakTexture() {
    const W = 64, Hh = 256, cv = makeCanvas(W, Hh), x = cv.getContext("2d"), img = x.createImageData(W, Hh);
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = (j + 0.5) / Hh;
      const a = Math.pow(Math.sin(Math.PI * u), 2) * smoothstep(0, 0.14, v) * (1 - smoothstep(0.86, 1, v));
      const k = (j * W + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
    }
    x.putImageData(img, 0, 0);
    return canvasTexture(cv, { anisotropy: 4 });
  }

  /** bottle() -> Group: outer + inner glass walls (one lathe about X), thick base and lip, painted highlight streaks */
  function bottle() {
    const g = new THREE.Group(); g.name = "bottle"; g.position.y = B.axisY;
    const pts = [];
    const xs = [];
    const N1 = 14, N2 = 26;
    for (let k = 0; k <= N1; k++) xs.push(B.baseX + (B.heel * k) / N1);
    xs.push(B.shoulderX[0]);
    for (let k = 1; k <= N2; k++) xs.push(lerp(B.shoulderX[0], B.shoulderX[1], k / N2));
    const lipX = B.mouthX - B.lip.len;
    xs.push(lipX - 0.02);
    pts.push(new THREE.Vector2(0.0001, B.baseX));
    for (const x of xs) pts.push(new THREE.Vector2(rigging.outerRadius(B, x), x));
    // the lip: a rounded collar
    for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; pts.push(new THREE.Vector2(B.neckR + B.lip.extra * Math.sin(a) * 0.9 + B.lip.extra * 0.1, lipX + (B.lip.len * (1 - Math.cos(a))) / 2)); }
    pts.push(new THREE.Vector2(B.neckR - B.wall, B.mouthX));
    // inner wall back to the base
    for (let k = xs.length - 1; k >= 0; k--) { const r = rigging.innerRadius(B, xs[k]); if (r > 0.01) pts.push(new THREE.Vector2(r, Math.max(xs[k], B.baseX + B.wall))); }
    pts.push(new THREE.Vector2(0.0001, B.baseX + B.wall));
    const geo = new THREE.LatheGeometry(pts, B.radial);
    geo.rotateZ(-Math.PI / 2);                                   // lathe axis +Y -> world +X
    const glass = new THREE.Mesh(geo, glassMat); glass.name = "glass:walls"; glass.renderOrder = 5;
    g.add(glass);
    // thick base ring and lip (read as heavier glass)
    const base = new THREE.Mesh(new THREE.RingGeometry(B.bodyR - B.heel - 0.3, B.bodyR - 0.03, B.radial, 1), thickMat);
    base.rotation.y = Math.PI / 2; base.position.x = B.baseX + B.wall * 0.5; base.renderOrder = 6; g.add(base);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(B.neckR + B.lip.extra * 0.5, B.lip.extra * 0.75, 12, B.radial), thickMat);
    lip.rotation.y = Math.PI / 2; lip.position.x = B.mouthX - B.lip.len / 2; lip.renderOrder = 6; g.add(lip);
    // painted highlights
    const tex = streakTexture();
    const streak = (r, x0, x1, at, width, opacity) => {
      const sg = new THREE.CylinderGeometry(r, r, x1 - x0, 24, 1, true, -at - width / 2, width);
      sg.rotateZ(-Math.PI / 2);
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.position.x = (x0 + x1) / 2; m.renderOrder = 7; m.name = "glass:streak";
      g.add(m);
    };
    for (const s of G.streaks) streak(B.bodyR + 0.006, B.baseX + 0.35, B.shoulderX[0] + 0.05, s.at, s.width, s.opacity);
    streak(B.neckR + 0.005, B.shoulderX[1] + 0.02, B.mouthX - B.lip.len - 0.02, G.streaks[0].at, 0.4, G.streaks[0].opacity);
    return g;
  }

  /** cradle() -> Group: two wooden saddles joined by dowel rails */
  function cradle() {
    const C = spec.cradle, g = new THREE.Group(); g.name = "cradle";
    const zt = Math.sqrt(B.bodyR * B.bodyR - (C.top - B.axisY) ** 2);
    const a1 = Math.atan2(C.top - B.axisY, zt);
    const s = new THREE.Shape();
    s.moveTo(-C.halfWidth, 0); s.lineTo(C.halfWidth, 0); s.lineTo(C.halfWidth, C.top); s.lineTo(zt, C.top);
    s.absarc(0, B.axisY, B.bodyR + 0.004, a1, Math.PI - a1, true);
    s.lineTo(-C.halfWidth, C.top); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: C.thick, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 40 });
    geo.translate(0, 0, -C.thick / 2);
    geo.rotateY(-Math.PI / 2);                                   // shape x -> world z
    for (const x of C.saddles) { const m = shadow(new THREE.Mesh(geo, materials.cradle)); m.position.x = x; g.add(m); }
    const len = C.saddles[1] - C.saddles[0];
    for (const z of [-0.7, 0.7]) {
      const r = shadow(new THREE.Mesh(new THREE.CylinderGeometry(C.rail, C.rail, len, 16), materials.cradle));
      r.rotation.z = Math.PI / 2; r.position.set((C.saddles[0] + C.saddles[1]) / 2, 0.14, z); g.add(r);
    }
    return g;
  }

  /** sea() -> Mesh: blue putty filling the bottom of the bottle (world coordinates), sculpted waves, lighter crests */
  function sea() {
    const Q = spec.sea, M = Q.nz + Q.nb, pos = [], colr = [], idx = [];
    const deep = col(P.seaDeep), mid = col(P.sea), foam = col(P.foam), c = new THREE.Color();
    for (let i = 0; i <= Q.nx; i++) {
      const x = lerp(Q.x[0], Q.x[1], i / Q.nx);
      const L = Q.level - Q.drop * smoothstep(Q.fall[0], Q.fall[1], x);
      const ri = Math.max(0.02, rigging.innerRadius(B, x) - 0.004);
      const Wd = Math.sqrt(Math.max(ri * ri - L * L, 1e-4)) * 0.995;
      for (let j = 0; j <= Q.nz; j++) {
        const v = (j / Q.nz) * 2 - 1, z = v * Wd;
        const wv = 0.6 * Math.sin(5.2 * x + 2.2 * Math.sin(2.4 * z)) + 0.4 * Math.sin(9.1 * x - 3.3 * z + 1.0);
        const edge = Math.sqrt(Math.max(0, 1 - v * v));
        pos.push(x, B.axisY + L + Q.wave * wv * edge, z);
        c.copy(mid).lerp(deep, 0.5 - 0.5 * wv).lerp(foam, smoothstep(0.62, 1, wv) * 0.55 * edge);
        colr.push(c.r, c.g, c.b);
      }
      const a0 = Math.atan2(L, Wd);
      for (let k = 1; k < Q.nb; k++) {
        const a = lerp(a0, -Math.PI - a0, k / Q.nb);
        pos.push(x, B.axisY + ri * Math.sin(a), ri * Math.cos(a));
        colr.push(deep.r, deep.g, deep.b);
      }
    }
    for (let i = 0; i < Q.nx; i++) for (let m = 0; m < M; m++) {
      const a = i * M + m, b = i * M + ((m + 1) % M), d = a + M, e = b + M;
      idx.push(a, b, d, b, e, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = shadow(new THREE.Mesh(geo, materials.sea), false, true); m.name = "sea";
    return m;
  }

  // ---------------------------------------------------------------- the ship
  /** hullGeometry() -> lofted waterline hull: red boot, walnut side, cream strake + bulwark, pale deck, transom */
  function hullGeometry() {
    const pos = [], colr = [];
    const cRed = col(P.hullRed), cWood = col(P.hullWood), cCream = col(P.hullCream), cDeck = col(P.deck);
    const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colr.push(k.r, k.g, k.b); };
    const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
    const rows = (x) => {
      const b = rigging.beamAt(H, x), D = rigging.deckY(H, x);
      return [[0, b * H.bottom], [0.36 * D, b * lerp(H.bottom, 1, 0.78)], [0.76 * D, b], [D + H.rail, b], [D, Math.max(0, b - 0.014)]];
    };
    const bands = [cRed, cWood, cCream];
    for (let k = 0; k < H.stations; k++) {
      const x0 = lerp(H.stern, H.bow, k / H.stations), x1 = lerp(H.stern, H.bow, (k + 1) / H.stations);
      const r0 = rows(x0), r1 = rows(x1);
      for (const s of [1, -1]) {
        for (let b = 0; b < 3; b++) {
          const A = [x0, r0[b][0], s * r0[b][1]], Bq = [x1, r1[b][0], s * r1[b][1]], C = [x1, r1[b + 1][0], s * r1[b + 1][1]], D = [x0, r0[b + 1][0], s * r0[b + 1][1]];
          if (s > 0) quad(A, Bq, C, D, bands[b]); else quad(Bq, A, D, C, bands[b]);
        }
      }
      quad([x0, r0[4][0], r0[4][1]], [x1, r1[4][0], r1[4][1]], [x1, r1[4][0], -r1[4][1]], [x0, r0[4][0], -r0[4][1]], cDeck);   // deck
    }
    const t = rows(H.stern);
    for (let b = 0; b < 3; b++) quad([H.stern, t[b][0], -t[b][1]], [H.stern, t[b][0], t[b][1]], [H.stern, t[b + 1][0], t[b + 1][1]], [H.stern, t[b + 1][0], -t[b + 1][1]], b === 2 ? cCream : cWood);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function sailTexture() {
    const cv = makeCanvas(256, 256), x = cv.getContext("2d");
    x.fillStyle = P.sail; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "rgba(170,140,90,0.10)";
    for (let k = 0; k < 9; k++) x.fillRect(0, 14 + k * 28, 256, 2);            // faint laid-paper lines
    x.fillStyle = P.sailStripe;
    x.fillRect(0, 40, 256, 20); x.fillRect(0, 70, 256, 8);                      // two red bands near the head (canvas top = v 1)
    return canvasTexture(cv, { anisotropy: 8 });
  }

  /** sail(plan, i) -> Mesh in MAST-LOCAL coordinates (y along the mast, x = its forward side, z across); userData.setOpen(u) */
  function sail(plan, i) {
    const Q = SH.sail, N = Q.pleats, Rr = 4;
    const pos = new Float32Array((N + 1) * (Rr + 1) * 3), uv = [], idx = [];
    for (let r = 0; r <= Rr; r++) for (let j = 0; j <= N; j++) uv.push(j / N, r / Rr);
    for (let r = 0; r < Rr; r++) for (let j = 0; j < N; j++) {
      const a = r * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = shadow(new THREE.Mesh(geo, materials.sail)); m.name = `sail-${plan.masts[i].id}`; m.frustumCulled = false;
    m.userData.setOpen = (open) => {
      const q = plan.sailOf(i, open);
      for (let r = 0; r <= Rr; r++) {
        const v = r / Rr, along = lerp(q.lo, q.hi, v), width = lerp(q.foot, q.head, v), seg = width / N;
        for (let j = 0; j <= N; j++) {
          const k = (r * (N + 1) + j) * 3, w = (j / N) * 2 - 1;
          pos[k] = Q.off + (j % 2 ? 1 : -1) * seg * q.sin * 0.5 + Q.billow * open * (1 - w * w) * Math.sin(Math.PI * v);
          pos[k + 1] = along;
          pos[k + 2] = (j - N / 2) * seg * q.w;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      m.rotation.y = q.yaw;                                       // braced round the mast as it opens
    };
    m.userData.setOpen(1);
    return m;
  }

  /** ship(plan) -> Group at the ship origin; userData.set(state) poses every hinge and sail from plan.state(c) */
  function ship(plan) {
    const g = new THREE.Group(); g.name = "ship";
    if (!materials.sail.map) { materials.sail.map = sailTexture(); materials.sail.needsUpdate = true; }
    g.add(shadow(new THREE.Mesh(hullGeometry(), materials.hull)));
    const bs = SH.bowsprit;
    g.add(shadow(new THREE.Mesh(rodGeometry([bs.from[0], bs.from[1], 0], [bs.tip[0], bs.tip[1], 0], bs.r, 10), materials.mast)));
    const eye = (p, r = 0.02) => { const e = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), materials.brass)); e.position.set(p[0], p[1], p[2]); g.add(e); };
    eye([bs.tip[0], bs.tip[1], 0], 0.024);
    // deck dressing clear of the folded masts: two small hatches off the centre line
    for (const [x, z] of [[0.28, 0.1], [-0.3, -0.1], [-0.82, 0.07]]) g.add(box(0.14, 0.012, 0.07, materials.mast, x, rigging.deckY(H, x) + 0.006, z));
    const W = SH.wire, hook = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), materials.brass);
    hook.position.set(W.hook[0], rigging.deckY(H, W.hook[0]) + W.hook[1], W.hook[2]); g.add(hook);
    const parts = plan.masts.map((m, i) => {
      const pivot = new THREE.Group(); pivot.position.set(m.base[0], m.base[1], 0); pivot.name = `mast-${m.id}`;
      const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(SH.mast.rTop, SH.mast.r, m.len, 12), materials.mast));
      pole.position.y = m.len / 2; pivot.add(pole);
      const truck = shadow(new THREE.Mesh(new THREE.SphereGeometry(SH.mast.rTop * 1.7, 12, 8), materials.brass)); truck.position.y = m.len; pivot.add(truck);
      const s = sail(plan, i); pivot.add(s);
      if (m.id === "main") {
        const fg = new THREE.BufferGeometry();
        fg.setAttribute("position", new THREE.Float32BufferAttribute([0, m.len - 0.015, 0, 0, m.len - 0.105, 0, -SH.flag, m.len - 0.06, 0], 3));
        fg.computeVertexNormals();
        pivot.add(shadow(new THREE.Mesh(fg, materials.flag)));
      }
      g.add(pivot);
      g.add(box(0.06, SH.mast.hinge, 0.07, materials.brass, m.base[0], m.base[1] - SH.mast.hinge / 2, 0));   // the hinge staple
      if (m.eyelet !== "bowsprit") eye(m.eye, 0.018);
      return { pivot, sail: s };
    });
    g.userData.set = (st) => {
      parts.forEach((p, i) => { p.pivot.rotation.z = st.phi[i]; p.sail.userData.setOpen(st.open[i]); });
    };
    g.userData.set(plan.state(plan.total));
    return g;
  }

  // ---------------------------------------------------------------- bench dressing
  /** bench() -> Group: pale wood bench top, cutting mat with a grid, back wall, a few modeller's things */
  function bench() {
    const g = new THREE.Group(); g.name = "bench";
    const Wd = spec.wood;
    if (!materials.bench.map) {
      materials.bench.map = woodTexture({ size: 1024, boards: Wd.boards, seed: Wd.seed, dark: Wd.dark, mid: Wd.mid, light: Wd.light, seam: Wd.seam, contrast: Wd.contrast, grainFreq: Wd.grainFreq, repeat: [Wd.size / Wd.tile, Wd.size / Wd.tile] });
      materials.bench.needsUpdate = true;
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(Wd.size, Wd.size), materials.bench);
    top.rotation.x = -Math.PI / 2; top.receiveShadow = true; g.add(top);
    const Mt = spec.mat;
    if (!materials.mat.map) {
      materials.mat.map = gridTexture({ size: 512, cells: 4, line: 3, bg: P.mat, fg: P.matLine, major: 4, majorColor: P.matLine, repeat: [Mt.w / (Mt.cell * 4), Mt.d / (Mt.cell * 4)] });
      materials.mat.needsUpdate = true;
    }
    const mat = shadow(new THREE.Mesh(new THREE.BoxGeometry(Mt.w, 0.02, Mt.d), [materials.wall, materials.wall, materials.mat, materials.wall, materials.wall, materials.wall]), false, true);
    mat.position.set(Mt.x, 0.01, Mt.z); g.add(mat);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), materials.wall); wall.position.set(0, 15, -9); g.add(wall);
    // a spool of thread
    const spool = new THREE.Group(); spool.position.set(-3.6, 0.02, -1.7);
    for (const y of [0.03, 0.57]) { const f = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), materials.spool)); f.position.y = y; spool.add(f); }
    const wound = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.48, 32), materials.thread)); wound.position.y = 0.3; spool.add(wound);
    g.add(spool);
    // a pencil lying in front
    const pencil = new THREE.Group(); pencil.position.set(-2.6, 0.06, 2.2); pencil.rotation.y = 0.35;
    const shaft = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), materials.pencil)); shaft.rotation.z = Math.PI / 2; pencil.add(shaft);
    const tip = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), materials.plank)); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.82; pencil.add(tip);
    g.add(pencil);
    return g;
  }

  /** slip(plan) -> Group: the plank outside the mouth, at the height the folded ship slides in at */
  function slip(plan) {
    const Q = spec.slip, g = new THREE.Group(); g.name = "slip";
    const len = Q.x[1] - Q.x[0], xm = (Q.x[0] + Q.x[1]) / 2, top = plan.ySlide;
    g.add(box(len, Q.thick, Q.halfWidth * 2, materials.plank, xm, top - Q.thick / 2, 0));
    for (const x of [Q.x[0] + 0.45, Q.x[1] - 0.45]) g.add(box(0.2, top - Q.thick - 0.02, Q.halfWidth * 2 - 0.08, materials.cradle, x, 0.02 + (top - Q.thick - 0.02) / 2, 0));
    return g;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (cream, blue edge, a small bottle icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.86);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(30,50,70,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 20); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 20); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 18); x.stroke();
      // icon: a bottle on its side with a little sail inside
      const cx = ox + pad, cy = oy + ph / 2, bw = ic * 0.66, bh = ic * 0.42;
      x.strokeStyle = Q.icon; x.lineWidth = 5; x.lineJoin = "round";
      x.beginPath(); x.roundRect(cx, cy - bh / 2, bw, bh, 9); x.stroke();
      x.beginPath(); x.rect(cx + bw, cy - bh * 0.2, ic * 0.26, bh * 0.4); x.stroke();
      x.fillStyle = Q.icon; x.beginPath(); x.moveTo(cx + bw * 0.42, cy - bh * 0.32); x.lineTo(cx + bw * 0.42, cy + bh * 0.2); x.lineTo(cx + bw * 0.78, cy + bh * 0.2); x.closePath(); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * workshop(plan) -> { group, ship, update(t) } (adds itself to the scene)
   *   update(t): ship pose, hinge angles, sails, every thread, the tail + ring + knots, the wire and the cork — all
   *   read from the plan at t; nothing carries over between calls.
   */
  function workshop(plan) {
    const group = new THREE.Group(); group.name = "workshop";
    group.add(bench(), cradle(), sea(), slip(plan));
    const sh = ship(plan); group.add(sh);
    const TH = SH.thread;
    const tubes = plan.threads(0).map((th) => {
      const m = liveTube(TH.n, 5, th.kind === "shroud" ? TH.r * 0.8 : TH.r, materials.thread);
      m.castShadow = false; m.name = `thread-${th.id}`; group.add(m); return m;
    });
    const tail = liveTube(TH.n, 5, TH.r, materials.thread); tail.castShadow = false; tail.name = "thread-tail"; group.add(tail);
    const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 10, 28), materials.brass)); ring.name = "pull-ring"; group.add(ring);
    const knots = [0, ...TH.marks].map((_, k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(k ? 0.02 : 0.028, 12, 8), materials.knot); group.add(m); return m; });
    const W = SH.wire;
    const wire = shadow(new THREE.Mesh(new THREE.CylinderGeometry(W.r, W.r, 1, 8), materials.steel), true, false); wire.name = "wire"; group.add(wire);
    const CK = spec.cork;
    if (!materials.cork.map) { materials.cork.map = speckleTexture({ size: 256, density: 0.5, base: P.cork, dot: ["#a97c48", "#dab583", "#8f6638"], radius: [1, 3], seed: 82 }); materials.cork.needsUpdate = true; }
    const cg = new THREE.CylinderGeometry(CK.r[0], CK.r[1], CK.len, 40); cg.rotateZ(Math.PI / 2);   // small end toward -X (into the neck)
    const cork = shadow(new THREE.Mesh(cg, materials.cork)); cork.name = "cork"; group.add(cork);
    const cs = contactShadow({ w: 6.4, d: 2.9, opacity: 0.2, y: 0.026 }); cs.position.x = 0.2; group.add(cs);
    const bt = bottle(); group.add(bt);                          // glass last: it draws over everything inside it
    stage.scene.add(group);

    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    const update = (t) => {
      const ps = plan.pose(t), st = plan.state(plan.pull(t));
      sh.position.set(ps.x, ps.y, 0);
      sh.userData.set(st);
      plan.threads(t).forEach((th, k) => tubes[k].userData.set(th.pts));
      const tl = plan.tail(t);
      tail.visible = tl.visible; tail.userData.set(tl.pts);
      ring.visible = tl.visible; ring.position.set(tl.ring[0] + 0.075, tl.ring[1], tl.ring[2]);
      knots.forEach((m, k) => { m.visible = tl.visible && !tl.cut; m.position.set(tl.knots[k][0], tl.knots[k][1], tl.knots[k][2]); });
      const w = plan.wire(t);
      wire.visible = w.visible;
      d.set(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]);
      const L = d.length();
      wire.scale.set(1, L, 1);
      wire.position.set((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, (w.a[2] + w.b[2]) / 2);
      wire.quaternion.setFromUnitVectors(up, d.multiplyScalar(1 / L));
      const ck = plan.cork(t);
      cork.visible = ck.visible; cork.position.set(ck.x, B.axisY, 0); cork.rotation.x = ck.spin;
    };
    update(0);
    return { group, ship: sh, bottle: bt, update };
  }

  const props = { bottle, cradle, sea, ship, bench, slip, caption, workshop };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: rigging, motion: rigging, glass: { glassMat, thickMat },
  };
}
