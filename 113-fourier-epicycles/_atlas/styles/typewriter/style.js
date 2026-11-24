// styles/typewriter/style.js — the "typewriter" style: a generic mid-century manual typewriter on a daylight desk.
//   props.desk()            -> desk top, back wall with window light, a paper stack, a mug, a pencil
//   props.typewriter(plan)  -> the machine; userData.update(t) poses keys, type bars, ribbon, spools, carriage, paper feed,
//                              bell and return lever and shows the glyphs struck so far — all read from the typing plan
//   props.glyphAtlas()      -> { texture, uv(ch) } the baked type face (one canvas, drawn once)
// The plan comes from ./typeplan.js (pure, Node-safe); scene.config.js builds SCORE from the same plan.
// Props never animate themselves: the scene calls update(t). Every frame is a pure function of t (no canvas redraws,
// no accumulation: matrices, a draw range and a texture repeat are ASSIGNED from the plan each frame).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel } from "../../kit/text.js";
import { newCanvas, canvasTexture } from "../../kit/textures.js";
import { hash01, lerp } from "../../kit/time.js";
import * as typeplan from "./typeplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const mesh = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, typeof mat === "string" ? materials[mat] : mat);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

  // ---------------------------------------------------------------- the type face: one atlas, baked once
  let _atlas = null;
  function glyphAtlas() {
    if (_atlas) return _atlas;
    const G = spec.glyphs, chars = [...G.chars], rows = Math.ceil(chars.length / G.cols);
    const c = newCanvas(G.cols * G.cellW, rows * G.cellH), x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.font = `${spec.text.weight} ${G.px}px ${spec.text.font}`;
    x.textAlign = "center"; x.textBaseline = "alphabetic"; x.fillStyle = "#ffffff";
    chars.forEach((ch, k) => x.fillText(ch, ((k % G.cols) + 0.5) * G.cellW, (Math.floor(k / G.cols) + 0.72) * G.cellH));
    // fabric-ribbon ink: seeded speckle in the coverage, colour left white (the ink colour is a vertex colour)
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(d[i + 3] * (1 - G.speckle * hash01(p % c.width, (p / c.width) | 0, 41)));
    }
    x.putImageData(img, 0, 0);
    const texture = canvasTexture(c, { srgb: true, anisotropy: 8 });
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    const uv = (ch) => {
      const k = chars.indexOf(ch);
      if (k < 0) return null;
      const col = k % G.cols, row = Math.floor(k / G.cols);
      return { u0: col / G.cols, u1: (col + 1) / G.cols, v1: 1 - row / rows, v0: 1 - (row + 1) / rows };
    };
    _atlas = { texture, uv, cellAspect: G.cellW / G.cellH };
    return _atlas;
  }
  /** glyphQuads(list) -> BufferGeometry of textured quads in the XY plane; list = [{ ch, x, y, z, w, h, rot, color:[r,g,b], alpha }] */
  function glyphQuads(list) {
    const A = glyphAtlas(), pos = [], uvs = [], col = [], idx = [];
    list.forEach((g, k) => {
      const q = A.uv(g.ch), c = Math.cos(g.rot ?? 0), s = Math.sin(g.rot ?? 0), hw = g.w / 2, hh = g.h / 2;
      [[-hw, -hh, q.u0, q.v0], [hw, -hh, q.u1, q.v0], [hw, hh, q.u1, q.v1], [-hw, hh, q.u0, q.v1]].forEach(([dx, dy, tu, tv]) => {
        pos.push(g.x + dx * c - dy * s, g.y + dx * s + dy * c, g.z ?? 0);
        uvs.push(tu, tv); col.push(...g.color, g.alpha ?? 1);
      });
      idx.push(4 * k, 4 * k + 1, 4 * k + 2, 4 * k, 4 * k + 2, 4 * k + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const inkMaterial = () => {
    const m = new THREE.MeshStandardMaterial({
      map: glyphAtlas().texture, vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    m.name = "ink";
    return m;
  };
  const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

  // ---------------------------------------------------------------- desk set
  function desk(o = {}) {
    const g = new THREE.Group();
    g.name = "desk";
    const top = mesh(new THREE.PlaneGeometry(20, 14), "desk", { cast: false });
    top.rotation.x = -Math.PI / 2; top.position.z = -1;
    g.add(top);
    // back wall with soft slanted window light painted in
    const c = newCanvas(1024, 512), x = c.getContext("2d");
    const grad = x.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#f6efe2"); grad.addColorStop(1, "#e9dfcc");
    x.fillStyle = grad; x.fillRect(0, 0, 1024, 512);
    x.filter = "blur(14px)"; x.fillStyle = "rgba(255,252,240,0.9)";
    for (let k = 0; k < 4; k++) {
      const x0 = 180 + (k % 2) * 250, y0 = 40 + Math.floor(k / 2) * 230;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + 220, y0 + 40); x.lineTo(x0 + 220, y0 + 240); x.lineTo(x0, y0 + 200); x.closePath(); x.fill();
    }
    x.filter = "none";
    const wallMat = materials.wall.clone();
    wallMat.name = "wall"; wallMat.color.set("#ffffff"); wallMat.map = canvasTexture(c, { srgb: true });
    wallMat.map.wrapS = wallMat.map.wrapT = THREE.ClampToEdgeWrapping;
    g.add(at(mesh(new THREE.PlaneGeometry(30, 14), wallMat, { cast: false }), 0, 7, -8));
    // a stack of paper, a mug, a pencil (all off to the sides, behind the carriage's travel)
    const stack = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = mesh(new THREE.BoxGeometry(2.6, 0.035, 3.4), "paperPlain");
      s.position.set((hash01(k, 1) - 0.5) * 0.12, 0.018 + k * 0.036, (hash01(k, 2) - 0.5) * 0.12);
      s.rotation.y = (hash01(k, 3) - 0.5) * 0.12;
      stack.add(s);
    }
    stack.position.set(-4.7, 0, -3.0); stack.rotation.y = 0.22;
    g.add(stack);
    const mug = new THREE.Group();
    mug.add(at(mesh(new THREE.CylinderGeometry(0.5, 0.44, 1.1, 40), "mug"), 0, 0.55, 0));
    const handle = mesh(new THREE.TorusGeometry(0.3, 0.07, 12, 28, Math.PI), "mug");
    handle.rotation.z = -Math.PI / 2; handle.position.set(0.48, 0.56, 0);
    mug.add(handle);
    mug.add(at(mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.02, 40), "graphite", { cast: false }), 0, 1.02, 0));
    mug.position.set(4.1, 0, -3.0); mug.rotation.y = -0.6;
    g.add(mug);
    const pencil = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), "pencil");
    body.rotation.z = Math.PI / 2; pencil.add(body);
    const tip = mesh(new THREE.ConeGeometry(0.05, 0.18, 6), "pencilWood");
    tip.rotation.z = -Math.PI / 2; tip.position.x = 1.04; pencil.add(tip);
    const lead = mesh(new THREE.ConeGeometry(0.018, 0.065, 6), "graphite");
    lead.rotation.z = -Math.PI / 2; lead.position.x = 1.1; pencil.add(lead);
    pencil.position.set(-3.1, 0.05, 1.1); pencil.rotation.y = -0.45;
    g.add(pencil);
    return g;
  }

  // ---------------------------------------------------------------- the machine
  function typewriter(plan, o = {}) {
    const M = spec.machine, K = spec.keyboard, G = spec.page, L = plan.layout;
    const root = new THREE.Group();
    root.name = "typewriter";
    const Pp = V(L.P), U = V(L.u), N = V(L.n), X = new THREE.Vector3(1, 0, 0);
    const W = (xl, yl, zl) => Pp.clone().addScaledVector(X, xl).addScaledVector(U, yl).addScaledVector(N, zl);

    // ---- body: an extruded side profile (the deck), two shoulders, the carriage rail
    const shape = new THREE.Shape();
    M.deck.forEach(([z, y], k) => (k ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    shape.closePath();
    const bev = 0.035;
    const deckGeo = new THREE.ExtrudeGeometry(shape, { depth: M.width - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 4 });
    deckGeo.translate(0, 0, -(M.width - 2 * bev) / 2);
    deckGeo.rotateY(-Math.PI / 2);
    root.add(mesh(deckGeo, "enamel"));
    const Sh = M.shoulder;
    for (const sx of [-1, 1]) {
      root.add(at(mesh(new RoundedBoxGeometry(Sh.w, Sh.y1 - Sh.y0 + 0.1, Sh.z1 - Sh.z0, 4, Sh.radius), "enamel"), sx * Sh.x, (Sh.y0 + Sh.y1) / 2 - 0.05, (Sh.z0 + Sh.z1) / 2));
    }
    const Rl = M.rail;
    root.add(at(mesh(new RoundedBoxGeometry(M.width, Rl.y1 - 0.4, Rl.z1 - Rl.z0, 3, 0.04), "enamel"), 0, (Rl.y1 + 0.4) / 2, (Rl.z0 + Rl.z1) / 2));
    // dark crinkle panel under the basket and a dark strip behind the keys
    const well = mesh(new THREE.BoxGeometry(1.66, 0.02, 1.1), "enamelDark", { cast: false });
    root.add(at(well, 0, 0.571, -0.14));

    // ---- keys: chrome ring, cream top, printed letter, steel stem; the space bar
    const ringGeo = new THREE.CylinderGeometry(K.capR, K.capR * 0.94, K.capH, 36);
    const topGeo = new THREE.CylinderGeometry(K.topR, K.topR, K.capH, 36);
    const stemGeo = new THREE.CylinderGeometry(0.016, 0.016, K.stem, 8);
    stemGeo.translate(0, -K.stem / 2, 0);
    const ink = inkMaterial(), inkCol = rgb(P.ink);
    const keyObjs = {};
    for (const k of L.keys) {
      const g = new THREE.Group();
      g.position.set(k.x, k.y, k.z); g.rotation.x = K.tilt;
      g.add(mesh(ringGeo, "chrome"), at(mesh(topGeo, "keycap"), 0, 0.006, 0), mesh(stemGeo, "steel"));
      const lg = glyphQuads([{ ch: k.id, x: 0, y: 0, w: K.glyphH * glyphAtlas().cellAspect, h: K.glyphH, color: inkCol, alpha: 0.95 }]);
      const letter = mesh(lg, ink, { cast: false });
      letter.rotation.x = -Math.PI / 2; letter.position.y = K.capH / 2 + 0.009;
      g.add(letter);
      g.userData.base = g.position.clone();
      root.add(g);
      keyObjs[k.id] = g;
    }
    const Sp = K.space;
    const space = mesh(new RoundedBoxGeometry(Sp.w, Sp.h, Sp.d, 3, 0.028), "bakelite");
    space.position.set(0, Sp.y, Sp.z); space.rotation.x = K.tilt; space.userData.base = space.position.clone();
    root.add(space);
    keyObjs[" "] = space;
    const keyDown = new THREE.Vector3(0, -Math.cos(K.tilt), -Math.sin(K.tilt));

    // ---- basket: the segment (a dark U) and one type bar per key
    const B = M.basket;
    const seg = mesh(new THREE.TorusGeometry(B.R, B.tube, 10, 48, 2 * B.spread + 0.24), "enamelDark");
    seg.geometry.rotateZ(-Math.PI / 2 - B.spread - 0.12);
    seg.matrixAutoUpdate = false;
    seg.matrix.makeBasis(X, U, N).setPosition(W(0, 0, B.d));
    root.add(seg);
    const barGeo = mergeGeometries([
      new THREE.BoxGeometry(B.barW, L.barLength, B.barT).translate(0, L.barLength / 2, 0),
      new THREE.BoxGeometry(B.slug[0], B.slug[1], B.slug[2]).translate(0, L.barLength - B.slug[1] / 2, 0),
    ]);
    const bars = new THREE.InstancedMesh(barGeo, materials.steel, L.bars.length);
    bars.castShadow = true; bars.receiveShadow = true; bars.frustumCulled = false; bars.name = "typeBars";
    root.add(bars);
    const barAxis = L.bars.map((b) => V(b.axis)), barPivot = L.bars.map((b) => V(b.pivot));
    const _m = new THREE.Matrix4(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
    // type guide: two small chrome prongs either side of the print point
    for (const sx of [-1, 1]) {
      const pr = mesh(new THREE.BoxGeometry(0.022, 0.2, 0.03), "chrome");
      pr.matrixAutoUpdate = false; pr.matrix.makeBasis(X, U, N).setPosition(W(sx * 0.105, -0.19, 0.035));
      root.add(pr);
    }

    // ---- ribbon: two spools, guide posts, a two-colour ribbon that the vibrator lifts on every strike
    const Rb = M.ribbon;
    const bytes = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    const rt = new THREE.DataTexture(new Uint8Array([...bytes(P.inkRed), 255, ...bytes(P.ink), 255]), 1, 2);   // row 0 = lower half (red)
    rt.magFilter = rt.minFilter = THREE.NearestFilter; rt.colorSpace = THREE.SRGBColorSpace; rt.needsUpdate = true;
    const ribbonMat = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.9, side: THREE.DoubleSide });
    ribbonMat.name = "ribbon";
    const strip = () => { const s = mesh(new THREE.PlaneGeometry(1, 1), ribbonMat); s.matrixAutoUpdate = false; root.add(s); return s; };
    const _a = new THREE.Vector3(), _b = new THREE.Vector3();
    const setStrip = (s, a, b) => {
      _a.subVectors(b, a); _b.copy(U).multiplyScalar(Rb.h); _z.crossVectors(_a, _b).normalize();
      s.matrix.makeBasis(_a, _b, _z).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      s.matrixWorldNeedsUpdate = true;
    };
    const rest = W(0, -Rb.restBelow, Rb.off);
    const postP = [-1, 1].map((sx) => new THREE.Vector3(sx * Rb.post[0], rest.y, Rb.post[1]));
    const spoolP = [-1, 1].map((sx) => new THREE.Vector3(sx * Rb.spool[0], Sh.y1 + Rb.spoolH / 2 + 0.02, Rb.spool[1]));
    const sCentre = strip(), sIn = [strip(), strip()], sOut = [strip(), strip()];
    const spools = [-1, 1].map((sx, k) => {
      const g = new THREE.Group();
      g.position.copy(spoolP[k]);
      g.add(mesh(new THREE.CylinderGeometry(Rb.spoolR * 0.74, Rb.spoolR * 0.74, Rb.spoolH - 0.02, 40), "rubber"));
      for (const sy of [-1, 1]) g.add(at(mesh(new THREE.CylinderGeometry(Rb.spoolR, Rb.spoolR, 0.014, 48), "chrome"), 0, sy * (Rb.spoolH / 2), 0));
      for (let h = 0; h < 3; h++) {
        const a = (h / 3) * Math.PI * 2;
        g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 20), "enamelDark", { cast: false }), Math.cos(a) * 0.17, Rb.spoolH / 2 + 0.009, Math.sin(a) * 0.17));
      }
      g.add(at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 20), "chrome"), 0, Rb.spoolH / 2 + 0.03, 0));
      root.add(g);
      const post = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 12), "chrome");
      post.position.copy(postP[k]); post.position.y -= 0.04;
      root.add(post);
      setStrip(sOut[k], postP[k], new THREE.Vector3(sx * (Rb.spool[0] - Rb.spoolR * 0.74), rest.y, Rb.spool[1] + 0.02));
      return g;
    });

    // ---- bell (left shoulder) with a little clapper
    const Bl = M.bell;
    const bell = mesh(new THREE.SphereGeometry(Bl.r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), "chrome");
    bell.position.set(...Bl.pos);
    root.add(bell);
    const clapper = mesh(new THREE.SphereGeometry(0.035, 16, 12), "steel");
    root.add(clapper);

    // ---- carriage (moves in x): base, end plates, platen + knobs, paper rest, bail, lever, the sheet and its glyphs
    const car = new THREE.Group();
    car.name = "carriage";
    root.add(car);
    const C = M.carriage, Pl = M.platen, pc = L.platenC;
    car.add(at(mesh(new RoundedBoxGeometry(C.w, C.h, C.d, 2, 0.03), "enamelDark"), 0, Rl.y1 + C.h / 2 + 0.005, pc[2]));
    for (const sx of [-1, 1]) {
      car.add(at(mesh(new RoundedBoxGeometry(C.endW, C.endH, C.endD, 2, 0.03), "enamel"), sx * (Pl.length / 2 + C.endW / 2 + 0.01), pc[1] - 0.04, pc[2]));
      const knob = mesh(new THREE.CylinderGeometry(Pl.knobR, Pl.knobR, Pl.knobL, 40), "bakelite");
      knob.rotation.z = Math.PI / 2; knob.position.set(sx * (Pl.length / 2 + C.endW + Pl.knobL / 2 + 0.03), pc[1], pc[2]);
      car.add(knob);
    }
    const platen = mesh(new THREE.CylinderGeometry(Pl.r, Pl.r, Pl.length, 48), "rubber");
    platen.rotation.z = Math.PI / 2; platen.position.set(...pc);
    const sleeve = mesh(new THREE.CylinderGeometry(Pl.r + 0.004, Pl.r + 0.004, M.paper.w, 48, 1, true), "paperPlain");
    sleeve.rotation.z = Math.PI / 2; sleeve.position.set(...pc);
    car.add(platen, sleeve);
    // everything on the sheet lives in a frame at the print point: x right, y up the sheet, z out of it
    const tilt = new THREE.Group();
    tilt.position.copy(Pp); tilt.rotation.x = -L.tilt;
    car.add(tilt);
    const Rs = M.rest;
    tilt.add(at(mesh(new RoundedBoxGeometry(Rs.w, Rs.y1 - Rs.y0, 0.02, 2, 0.008), "enamel"), 0, (Rs.y0 + Rs.y1) / 2, -Rs.back));
    const Ba = M.bail;
    const bailRod = mesh(new THREE.CylinderGeometry(Ba.r, Ba.r, Pl.length, 12), "chrome");
    bailRod.rotation.z = Math.PI / 2; bailRod.position.set(0, Ba.up, 0.03);
    tilt.add(bailRod);
    for (const sx of [-1, 1]) {
      const r = mesh(new THREE.CylinderGeometry(Ba.roller, Ba.roller, 0.11, 20), "rubber");
      r.rotation.z = Math.PI / 2; r.position.set(sx * Ba.rollerX, Ba.up, 0.03);
      tilt.add(r);
    }
    const paperMat = materials.paper.clone();
    paperMat.name = "paper"; paperMat.map = materials.paper.map.clone(); paperMat.map.needsUpdate = true;
    const sheetGeo = new THREE.PlaneGeometry(M.paper.w, 1).translate(0, 0.5, 0);
    const sheet = mesh(sheetGeo, paperMat);
    sheet.position.set(0, -M.paper.below, 0);
    tilt.add(sheet);
    const page = new THREE.Group();
    tilt.add(page);
    const A = glyphAtlas(), gh = G.em * (spec.glyphs.cellH / spec.glyphs.px), gw = gh * A.cellAspect;
    const inks = { black: rgb(P.ink), red: rgb(P.inkRed) };
    const typed = mesh(glyphQuads(plan.strikes.map((c, k) => ({
      ch: c.ch, x: L.colX(c.col) + c.jx, y: -c.line * G.lineHeight + c.jy, z: 0.004 + k * 1e-5, w: gw, h: gh, rot: c.rot,
      color: inks[c.ink] ?? inks.black, alpha: c.density,
    }))), ink, { cast: false });
    typed.frustumCulled = false; typed.name = "typedGlyphs";
    page.add(typed);
    // return lever on the left end of the carriage
    const Lv = M.lever;
    const lever = new THREE.Group();
    lever.position.set(...Lv.pivot);
    lever.add(at(mesh(new THREE.BoxGeometry(0.05, 0.03, Lv.len), "chrome"), 0, 0, Lv.len / 2));
    lever.add(at(mesh(new RoundedBoxGeometry(0.16, 0.035, 0.24, 2, 0.015), "chrome"), 0, 0, Lv.len));
    lever.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16), "chrome"));
    car.add(lever);

    /** update(t): pose the whole machine from the plan at time t (assignments only). */
    function update(t) {
      const carX = plan.carriageX(t), feed = plan.feed(t);
      car.position.x = carX;
      // paper: the sheet grows up out of the platen; its texture stays anchored to the top edge
      const len = M.paper.below + M.paper.top + feed * G.lineHeight;
      sheet.scale.y = len;
      paperMat.map.repeat.set(M.paper.w / 1.3, len / 1.3);
      paperMat.map.offset.set(0, -len / 1.3);
      page.position.y = feed * G.lineHeight;
      typed.geometry.setDrawRange(0, 6 * plan.typed(t));
      // keys
      for (const id in keyObjs) {
        const k = keyObjs[id];
        k.position.copy(k.userData.base).addScaledVector(keyDown, K.depth * plan.keyDip(id, t) * (id === " " ? 0.6 : 1));
      }
      // type bars
      for (let i = 0; i < L.bars.length; i++) {
        const d = L.barDir(L.bars[i], plan.barSwing(i, t));
        _y.set(d[0], d[1], d[2]); _z.crossVectors(barAxis[i], _y);
        bars.setMatrixAt(i, _m.makeBasis(barAxis[i], _y, _z).setPosition(barPivot[i]));
      }
      bars.instanceMatrix.needsUpdate = true;
      // ribbon + spools
      const rb = plan.ribbon(t);
      const cy = lerp(-Rb.restBelow, rb.ink === "red" ? Rb.h / 4 : -Rb.h / 4, rb.lift);
      const cl = W(-Rb.half, cy, Rb.off), cr = W(Rb.half, cy, Rb.off);
      setStrip(sCentre, cl, cr); setStrip(sIn[0], postP[0], cl); setStrip(sIn[1], cr, postP[1]);
      const turn = plan.spool(t);
      spools[0].rotation.y = turn; spools[1].rotation.y = turn;
      // lever, bell
      lever.rotation.y = Lv.yaw + Lv.swing * plan.lever(t);
      clapper.position.set(Bl.pos[0] + Bl.r + 0.05 - 0.04 * Math.abs(plan.bell(t)), Bl.pos[1] + 0.05, Bl.pos[2]);
    }
    root.userData.update = update;
    root.userData.carriage = car;
    root.userData.keys = keyObjs;
    update(0);
    return root;
  }

  const props = {
    desk, typewriter, glyphAtlas,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }),
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: typeplan, motion: typeplan,
  };
}
