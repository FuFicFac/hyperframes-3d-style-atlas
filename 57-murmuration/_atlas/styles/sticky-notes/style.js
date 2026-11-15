// styles/sticky-notes/style.js — "Sticky Notes": a workshop wall of paper notes that peel, fly, slap and curl.
// Every note is a real bent mesh: a flat grid rebuilt from the flat sheet each frame by integrating the bend angle
// (notes.js sheetAngle: strip flat, hinge at the strip line, travelling peel bend, progressive resting curl, breeze wave)
// down each column, then normals recomputed. All timing comes from the pure planner (notes.js), shared with the SCORE.
// Marker ink = ribbon meshes whose vertices carry the time they are drawn (draw-on = a uniform, no texture uploads).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { makeCanvas, canvasTexture, noiseTexture, uploadTexture } from "../../kit/textures.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { rng, hash01, clamp, smoothstep } from "../../kit/time.js";
import * as NOTES from "./notes.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const { noteState, sheetAngle, sheetPoint, breezeLift, dotState, penAt, padUnder } = NOTES;

/**
 * createStyle(stage, opts?) -> style
 *   props: wall(o), board(o), note({ color, text, seed }), pad(plan), dot(color), markerInk(plan), markerPen(color),
 *          caption(labels), wallBoard(plan, o)  (everything from a plan: board + pad + notes + dots + ink + pen; update(t))
 *   plan:  the notes.js module (planBoard, noteState, sheetAngle, boardShot, stickyVoices, malletPhrase, ...)
 */
export function createStyle(stage, opts = {}) {
  const S = STYLE_SPEC, P = S.palette, BD = S.board, NS = S.note, H = S.hand;
  const { materials, lights, post } = applyStyleSpec(stage, S, opts);
  stage.renderer.shadowMap.enabled = true;
  const textStyle = { font: S.text.font, weight: S.text.weight, color: S.text.color, height: S.text.height };
  const noteHex = (c) => P.notes[c] ?? c;
  const inkHex = (c) => P.markers[c] ?? c;
  const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const rbox = (w, h, d, mat, r = 0) => shadowed(new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat));

  // ---------------------------------------------------------------- textures
  materials.wall.map = noiseTexture({ ...S.textures.wall, repeat: [6, 3] });
  materials.wall.needsUpdate = true;
  materials.board.map = ghostTexture();
  materials.board.roughness = BD.gloss;
  materials.board.needsUpdate = true;

  /** whiteboard: near-white with faint half-erased marker ghosts and wipe arcs (baked once). */
  function ghostTexture() {
    const G = BD.ghost, W = 1680, Hh = Math.round((W * BD.h) / BD.w);
    const cv = makeCanvas(W, Hh), x = cv.getContext("2d"), r = rng(`ghost:${G.seed}`);
    x.fillStyle = P.board; x.fillRect(0, 0, W, Hh);
    x.lineCap = "round"; x.lineJoin = "round";
    for (let i = 0; i < G.smears; i++) {
      const cx = r.range(0.05, 0.95) * W, cy = r.range(0.08, 0.92) * Hh, R = r.range(60, 220);
      x.strokeStyle = `rgba(90,96,110,${(G.level * r.range(0.5, 1.2)).toFixed(3)})`;
      x.lineWidth = r.range(10, 34);
      x.beginPath(); x.ellipse(cx, cy, R, R * r.range(0.3, 0.6), r.range(-0.4, 0.4), r.range(0, 3), r.range(3.5, 6)); x.stroke();
    }
    for (let i = 0; i < 26; i++) {   // ghost scribbles (old words that were wiped)
      const cx = r.range(0.05, 0.9) * W, cy = r.range(0.1, 0.9) * Hh;
      x.strokeStyle = `rgba(70,80,100,${(G.level * 0.7).toFixed(3)})`;
      x.lineWidth = r.range(3, 6);
      x.beginPath(); x.moveTo(cx, cy);
      for (let k = 0; k < 7; k++) x.lineTo(cx + k * r.range(12, 22), cy + r.range(-14, 14));
      x.stroke();
    }
    const t = canvasTexture(cv, { srgb: true, anisotropy: 8 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  // shared paper fibre overlay (alpha speckle), drawn into every note face
  const fibre = (() => {
    const N = NS.canvas, cv = makeCanvas(N), x = cv.getContext("2d"), img = x.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
      const h = hash01(xx, y, 77), h2 = hash01(xx >> 2, y >> 1, 78);
      const v = (h - 0.5) * 0.6 + (h2 - 0.5) * 0.4;
      const k = (y * N + xx) * 4;
      const dark = v < 0 ? 1 : 0;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = dark ? 60 : 255;
      img.data[k + 3] = Math.round(Math.abs(v) * 255 * NS.paper.fibre * 6);
    }
    x.putImageData(img, 0, 0);
    return cv;
  })();

  const faceCanvases = [];
  /** paint a note face: colour, fibre, faint edge shade, the word in marker hand (integer positions). */
  function paintFace(cv, hex, text, seed) {
    const N = cv.width, x = cv.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
    x.fillStyle = hex; x.fillRect(0, 0, N, N);
    x.globalAlpha = 1; x.drawImage(fibre, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, N);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.75, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(60,40,0,${NS.paper.edge})`);
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.fillStyle = `rgba(255,255,255,0.10)`; x.fillRect(0, 0, N, Math.round(N * NS.strip * 0.9)); // the adhesive band reads a touch lighter
    if (text) {
      const r = rng(`face:${seed}`);
      let px = Math.round(N * H.size);
      x.font = `${H.weight} ${px}px ${H.font}`;
      // wrap: explicit \n, else split two words if too wide; shrink to fit
      let lines = String(text).split("\n");
      const maxW = N * 0.86;
      if (lines.length === 1 && x.measureText(lines[0]).width > maxW && lines[0].includes(" ")) {
        const w = lines[0].split(" "), mid = Math.ceil(w.length / 2);
        lines = [w.slice(0, mid).join(" "), w.slice(mid).join(" ")];
      }
      while (Math.max(...lines.map((l) => x.measureText(l).width)) > maxW && px > 40) { px -= 4; x.font = `${H.weight} ${px}px ${H.font}`; }
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = H.ink;
      const lh = px * H.lineHeight, y0 = N * H.y - ((lines.length - 1) * lh) / 2;
      const tilt = r.range(-0.05, 0.05);
      x.translate(Math.round(N / 2), Math.round(y0)); x.rotate(tilt);
      lines.forEach((l, i) => {
        const dx = Math.round(r.range(-6, 6)), dy = Math.round(i * lh);
        x.globalAlpha = 0.95; x.fillText(l, dx, dy);
        x.globalAlpha = 0.25; x.fillText(l, dx + 1, dy + 1); // marker bleed
      });
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- wall + board
  const ZB = BD.backing, F = BD.frame, LG = BD.ledge;
  function wall(o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w ?? 14, o.h ?? 8), materials.wall);
    m.position.set(0, o.y ?? 0.4, -ZB - 0.003);
    m.receiveShadow = true;
    return m;
  }
  function board(o = {}) {
    const g = new THREE.Group();
    const surf = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(BD.w, BD.h), materials.board), false, true);
    g.add(surf);
    const back = rbox(BD.w + 2 * F.width, BD.h + 2 * F.width, ZB, materials.frameDark);
    back.position.z = -ZB / 2 - 0.001; g.add(back);
    const zR = F.front - F.depth / 2;
    const hor = (y) => { const b = rbox(BD.w + 2 * F.width, F.width, F.depth, materials.frame, F.radius); b.position.set(0, y, zR); g.add(b); };
    const ver = (x) => { const b = rbox(F.width, BD.h + 2 * F.width, F.depth, materials.frame, F.radius); b.position.set(x, 0, zR); g.add(b); };
    hor(BD.h / 2 + F.width / 2); hor(-BD.h / 2 - F.width / 2); ver(-BD.w / 2 - F.width / 2); ver(BD.w / 2 + F.width / 2);
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {        // corner caps (grey plastic)
      const c = rbox(F.width * 1.25, F.width * 1.25, F.depth * 1.1, materials.frameDark, 0.008);
      c.position.set(sx * (BD.w / 2 + F.width / 2), sy * (BD.h / 2 + F.width / 2), zR + 0.002); g.add(c);
    }
    // ledge: aluminium shelf + front lip, full width
    const ledgeTop = -BD.h / 2 - F.width - LG.gap;
    const lw = BD.w + 2 * F.width - 0.1;
    const shelf = rbox(lw, LG.thick, LG.depth, materials.frame, 0.006);
    shelf.position.set(0, ledgeTop - LG.thick / 2, -ZB + LG.depth / 2); g.add(shelf);
    const lip = rbox(lw, LG.lip, LG.lipThick, materials.frame, 0.004);
    lip.position.set(0, ledgeTop + LG.lip / 2 - 0.004, -ZB + LG.depth - LG.lipThick / 2); g.add(lip);
    const brk = rbox(lw, 0.03, 0.03, materials.frameDark, 0.004); brk.position.set(0, ledgeTop - LG.thick - 0.012, -ZB + 0.02); g.add(brk);
    // markers + eraser lying on the ledge
    const R = rng("ledge");
    const items = o.ledgeItems ?? [{ kind: "pen", color: "black", x: -1.5 }, { kind: "pen", color: "blue", x: -1.32 }, { kind: "pen", color: "red", x: -1.18 }, { kind: "eraser", x: -0.6 }, { kind: "pen", color: "green", x: 0.55 }];
    for (const it of items) {
      if (it.kind === "pen") {
        const p = markerPen(it.color, { lying: true });
        p.rotation.set(0, R.range(-0.2, 0.2), Math.PI / 2);
        p.position.set(it.x, ledgeTop + S.marker.pen.r, -ZB + R.range(0.05, 0.1));
        g.add(p);
      } else {
        const e = rbox(0.15, 0.045, 0.06, materials.eraser, 0.01);
        e.position.set(it.x, ledgeTop + 0.0225, -ZB + 0.07); e.rotation.y = R.range(-0.15, 0.15); g.add(e);
        const felt = rbox(0.148, 0.012, 0.058, new THREE.MeshStandardMaterial({ color: "#d9d6cf", roughness: 1 }), 0.004);
        felt.position.set(it.x, ledgeTop + 0.006, -ZB + 0.07); felt.rotation.y = e.rotation.y; g.add(felt);
      }
    }
    g.userData.ledgeTop = ledgeTop;
    g.userData.surface = surf;
    return g;
  }

  // ---------------------------------------------------------------- notes
  function noteGeometry() {
    const nx = NS.segX, ny = NS.segY, L = NS.size;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3), uv = new Float32Array((nx + 1) * (ny + 1) * 2), idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      pos[k * 3] = (i / nx - 0.5) * L; pos[k * 3 + 1] = -(j / ny) * L; pos[k * 3 + 2] = 0;
      uv[k * 2] = i / nx; uv[k * 2 + 1] = 1 - j / ny;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * note({ color, text, seed }) -> Group (origin = top-centre; sheet hangs down -y; faces +z)
   *   userData.bend(st, breezeAt(xLocal) | null) rebuilds the sheet from the flat grid (memoised on its full input),
   *   userData.surface(u, v) -> { p, n, th } on the current bend (u across -0.5..0.5, v down 0..1), userData.face (canvas).
   */
  function note(o = {}) {
    const hex = noteHex(o.color ?? "yellow");
    const cv = makeCanvas(NS.canvas);
    paintFace(cv, hex, o.text ?? "", o.seed ?? o.text ?? "n");
    faceCanvases.push(() => { paintFace(cv, hex, o.text ?? "", o.seed ?? o.text ?? "n"); tex.needsUpdate = true; uploadTexture(stage, tex); });
    const tex = canvasTexture(cv, { srgb: true, anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    uploadTexture(stage, tex);
    const geo = noteGeometry();
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: materials.paper.roughness, metalness: 0, side: THREE.FrontSide });
    const backC = new THREE.Color(hex).multiplyScalar(NS.paper.back);
    const backM = new THREE.MeshStandardMaterial({ color: backC, roughness: materials.paper.roughness, metalness: 0, side: THREE.BackSide });
    const g = new THREE.Group();
    const mf = shadowed(new THREE.Mesh(geo, front)), mb = shadowed(new THREE.Mesh(geo, backM));
    mf.frustumCulled = mb.frustumCulled = false;
    g.add(mf, mb);
    const nx = NS.segX, ny = NS.segY, L = NS.size, pos = geo.attributes.position.array;
    let key = null, cur = null, cols = null;
    g.userData.bend = (st, breeze) => {
      const bz = Array.from({ length: nx + 1 }, (_, i) => (breeze ? breeze((i / nx - 0.5) * L) : 0));
      const k = JSON.stringify([st.hinge, st.curl, st.peelS, st.peelA, st.peelLen ?? null, st.roll ?? null, st.breeze, bz]); // the FULL bend input
      cur = st; cols = bz;
      if (k === key) return;
      key = k;
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * L;
        let y = 0, z = 0;
        pos[i * 3] = x; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
        for (let j = 1; j <= ny; j++) {
          const s0 = ((j - 1) / ny) * L, s1 = (j / ny) * L, th = sheetAngle(st, (s0 + s1) / 2, x, NS, bz[i]);
          y -= (s1 - s0) * Math.cos(th); z += (s1 - s0) * Math.sin(th);
          const q = (j * (nx + 1) + i) * 3;
          pos[q] = x; pos[q + 1] = y; pos[q + 2] = z;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    };
    g.userData.surface = (u, v) => {
      const x = u * L, bi = Math.round((u + 0.5) * nx);
      return sheetPoint(cur ?? { hinge: 0, curl: 0, peelS: null, peelA: 0, breeze: 0 }, x, v * L, NS, cols ? cols[clamp(bi, 0, nx)] : 0);
    };
    g.userData.face = cv;
    g.userData.color = o.color;
    return g;
  }

  /** dot(color) -> a glossy vinyl dot sticker (cylinder, axis +y). */
  const dotGeo = new THREE.CylinderGeometry(S.dot.r, S.dot.r, S.dot.h, 40, 1);
  function dot(color = "red") {
    const m = materials.dot.clone();
    m.color.set(P.dots[color] ?? color);
    return shadowed(new THREE.Mesh(dotGeo, m), true, false);
  }

  /** pad(plan) -> a leaning pad of notes on the ledge (multi-colour sheet edges + a blank sheet under the queued notes). */
  function pad(plan, o = {}) {
    const pp = plan ? plan.pad : NOTES.padPose(S), L = NS.size, T = S.pad.thick;
    const g = new THREE.Group();
    // sides: stripes of sheet colours (thin paper layers)
    const sc = makeCanvas(64, 256), sx = sc.getContext("2d"), sh = S.pad.sheets;
    for (let y = 0; y < 256; y++) {
      const c = new THREE.Color(noteHex(sh[Math.floor(y / 256 * 12) % sh.length]));
      c.multiplyScalar(0.92 + 0.08 * hash01(y, 3));
      sx.fillStyle = `#${c.getHexString()}`; sx.fillRect(0, y, 64, 1);
      if (y % 3 === 0) { sx.fillStyle = "rgba(0,0,0,0.06)"; sx.fillRect(0, y, 64, 1); }
    }
    const sideTex = canvasTexture(sc, { srgb: true });
    const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9 });
    const under = plan ? padUnder(plan) : sh[0];
    const top = new THREE.MeshStandardMaterial({ color: noteHex(under), roughness: 0.88 });
    // box faces order: +x, -x, +y, -y, +z, -z (in the block frame: x across, y up the sheet, z = sheet normal)
    const block = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L, L, T), [side, side, side, side, top, side]));
    const blockG = new THREE.Group();
    blockG.add(block);
    block.position.set(0, -L / 2, -T / 2 - 0.0022);
    blockG.position.set(...pp.top);
    blockG.rotation.x = -pp.lean;
    g.add(blockG);
    g.userData.top = top;
    return g;
  }

  // ---------------------------------------------------------------- marker ink (draw-on ribbons)
  const inkTime = { value: 0 };
  function inkMaterial(color) {
    const m = new THREE.MeshStandardMaterial({ color: inkHex(color), roughness: 0.32, metalness: 0, transparent: true, opacity: 0.94,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uInkTime = inkTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aT; attribute float aV; attribute float aS; varying float vT; varying float vV; varying float vS;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvT = aT; vV = aV; vS = aS;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uInkTime; varying float vT; varying float vV; varying float vS;")
        .replace("#include <color_fragment>", `#include <color_fragment>
  if (vT > uInkTime) discard;
  float edge = abs(vV);
  float streak = 0.5 + 0.5 * sin(vS * 160.0 + sin(vS * 37.0) * 2.0 + vV * 2.3);
  diffuseColor.rgb *= mix(1.0, 0.8, smoothstep(0.5, 0.98, edge)) * (0.93 + 0.07 * streak);
  diffuseColor.a *= 1.0 - smoothstep(0.82, 1.0, edge);`);
    };
    m.customProgramCacheKey = () => "sticky-ink";
    return m;
  }
  /**
   * markerInk(plan) -> Group of ribbon meshes (one per marker colour). Each vertex carries the time its point is drawn,
   *   so draw-on is just userData.update(t) (a uniform). Pre-drawn marks (pre: true) are always there.
   */
  function markerInk(plan) {
    const g = new THREE.Group(), W = S.marker.width / 2, Z = S.marker.z;
    const byColor = {};
    for (const st of plan.strokes) (byColor[st.color] ??= []).push(st);
    for (const [color, list] of Object.entries(byColor)) {
      const P3 = [], T = [], V = [], A = [], I = [];
      const vert = (x, y, t, v, s) => { P3.push(x, y, Z); T.push(t); V.push(v); A.push(s); return T.length - 1; };
      for (const st of list) {
        const pts = st.pts, n = pts.length, dur = st.t1 - st.t0;
        let s = 0, prevL = -1, prevR = -1;
        const tAt = (s2) => st.t0 + (st.len > 0 ? (s2 / st.len) * dur : 0);
        const cap = (p, dir, t, s2, back) => {   // half-disc fan at an end
          const c = vert(p[0], p[1], t, 0, s2), K = 8, ids = [];
          for (let k = 0; k <= K; k++) {
            const a = Math.atan2(dir[1], dir[0]) + (back ? Math.PI / 2 + (Math.PI * k) / K : -Math.PI / 2 + (Math.PI * k) / K);
            ids.push(vert(p[0] + Math.cos(a) * W, p[1] + Math.sin(a) * W, t, 0.95, s2));
          }
          for (let k = 0; k < K; k++) I.push(c, ids[k], ids[k + 1]);
        };
        for (let i = 0; i < n; i++) {
          if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1];
          const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const t = tAt(s);
          const L2 = vert(pts[i][0] - ty * W, pts[i][1] + tx * W, t, -1, s), R2 = vert(pts[i][0] + ty * W, pts[i][1] - tx * W, t, 1, s);
          if (prevL >= 0) I.push(prevL, prevR, L2, L2, prevR, R2);
          prevL = L2; prevR = R2;
          if (i === 0) cap(pts[0], [tx, ty], t, 0, true);
          if (i === n - 1) cap(pts[i], [tx, ty], st.t1, s, false);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(P3, 3));
      geo.setAttribute("aT", new THREE.Float32BufferAttribute(T, 1));
      geo.setAttribute("aV", new THREE.Float32BufferAttribute(V, 1));
      geo.setAttribute("aS", new THREE.Float32BufferAttribute(A, 1));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(T.length * 3).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
      geo.setIndex(I);
      const mesh = new THREE.Mesh(geo, inkMaterial(color));
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      g.add(mesh);
    }
    g.userData.update = (t) => { inkTime.value = t; };
    return g;
  }

  /** markerPen(color, { lying }) -> a whiteboard marker; origin at the TIP, body along +y (tilt it for writing). */
  function markerPen(color = "black", o = {}) {
    const M = S.marker.pen, g = new THREE.Group(), c = inkHex(color);
    const capM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
    const tipM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const tip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(M.r * 0.45, 0.018, 16, 1), tipM)); tip.rotation.x = Math.PI; tip.position.y = 0.009;
    const nose = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(M.r * 0.8, M.r * 0.55, 0.016, 20), materials.penBody)); nose.position.y = 0.026;
    const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(M.r, M.r, M.len * 0.62, 24), materials.penBody)); body.position.y = 0.034 + M.len * 0.31;
    const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(M.r * 1.02, M.r * 1.02, 0.022, 24), capM)); band.position.y = 0.034 + M.len * 0.5;
    const capE = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(M.r * 1.08, M.r * 1.08, M.len * 0.3, 24), capM)); capE.position.y = 0.034 + M.len * 0.62 + M.len * 0.15;
    g.add(tip, nose, body, band, capE);
    if (o.lying) g.position.y = 0;
    return g;
  }

  // ---------------------------------------------------------------- caption (overlay, exact colours)
  /**
   * caption(labels) -> { meshes, show(i, alpha) }: one pre-drawn paper label per beat (marker hand on a paper strip with
   *   a note-coloured tab), fixed bottom-left inside the safe area. Drawn at build (and again when fonts are ready).
   */
  function caption(labels) {
    const C = S.caption, Wp = 1100, Hp = C.h + 40;
    const draw = (x, W, Hh, st) => {
      const tx = st.text;
      x.font = `${S.text.weight} ${Math.round(C.cap * 1.28)}px ${S.text.font}`;
      const tw = Math.ceil(x.measureText(tx).width);
      const pw = Math.min(W - 40, tw + 96 + 46), ph = C.h, ox = 14, oy = 16;
      x.save();
      x.translate(ox, oy); x.rotate(-0.012);
      x.fillStyle = "rgba(40,30,10,0.16)"; x.fillRect(4, 7, pw, ph);           // soft drop shadow
      x.fillStyle = C.paper; x.fillRect(0, 0, pw, ph);
      x.strokeStyle = C.edge; x.lineWidth = 2; x.strokeRect(1, 1, pw - 2, ph - 2);
      x.fillStyle = st.accent ?? C.accent; x.fillRect(0, 0, 46, ph);          // note-coloured tab
      x.fillStyle = "rgba(0,0,0,0.06)"; x.fillRect(46, 0, 3, ph);
      x.fillStyle = C.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(tx, 46 + 40, Math.round(ph / 2 + 3));
      x.restore();
    };
    const accents = [P.notes.yellow, P.notes.pink, P.notes.blue, P.notes.green, P.notes.orange];
    const meshes = labels.map((text, i) => {
      const m = screenCanvas(stage, Wp, Hp, draw, { upload: true });
      m.userData.place(C.x, C.y - Hp / 2);
      m.userData.set({ text, accent: accents[i % accents.length] });
      m.userData.opacity(0);
      faceCanvases.push(() => { m.userData.set({ text, accent: accents[i % accents.length], redraw: 1 }); });
      return m;
    });
    return { meshes, show: (i, a) => meshes.forEach((m, k) => m.userData.opacity(k === i ? a : 0)) };
  }

  // ---------------------------------------------------------------- the whole wall from a plan
  /**
   * wallBoard(plan, o) -> Group with userData.update(t): board + wall + pad + every planned note (bent each frame) +
   *   dots riding their notes + marker ink + the marker pen riding the stroke tip.
   */
  function wallBoard(plan, o = {}) {
    const g = new THREE.Group();
    g.add(wall(o.wall ?? {}));
    const b = board(o.board ?? {}); g.add(b);
    const pd = pad(plan); g.add(pd);
    const ink = markerInk(plan); g.add(ink);
    const notesG = {};
    for (const id of plan.order) {
      const n = plan.notes[id], nm = note({ color: n.color, text: n.text, seed: id });
      nm.visible = false;
      notesG[id] = nm; g.add(nm);
    }
    const dots = plan.dots.map((d) => { const m = dot(d.color); m.visible = false; notesG[d.on].add(m); return m; });
    const pens = {};
    for (const c of new Set(plan.marks.map((m) => m.color))) { const p = markerPen(c); p.visible = false; pens[c] = p; g.add(p); }
    const penDir = new THREE.Vector3(...S.marker.pen.dir).normalize();
    const qPen = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), penDir);
    g.userData.update = (t) => {
      ink.userData.update(t);
      for (const id of plan.order) {
        const nm = notesG[id], st = noteState(plan, id, t);
        nm.visible = st.visible;
        if (!st.visible) continue;
        nm.position.set(...st.pos);
        nm.rotation.set(st.rot[0], st.rot[1], st.rot[2], "XYZ");
        const cr = Math.cos(st.rot[2]);
        const bz = plan.breezes.length && st.breeze > 0 ? (x) => breezeLift(plan, st.pos[0] + x * cr, t) : null;
        nm.userData.bend(st, bz);
      }
      plan.dots.forEach((d, i) => {
        const m = dots[i], ds = dotState(d, t, S.timing.dotDrop);
        m.visible = ds.visible && notesG[d.on].visible;
        if (!m.visible) return;
        const sp = notesG[d.on].userData.surface(d.u, d.v);
        const off = S.dot.h / 2 + 0.0004 + (i % 3) * 0.0003 + ds.lift; // tiny per-dot step: no z-fighting where dots touch
        m.position.set(sp.p[0] + sp.n[0] * off, sp.p[1] + sp.n[1] * off, sp.p[2] + sp.n[2] * off);
        m.rotation.set(Math.PI / 2 - sp.th, 0, 0);
        m.scale.set(ds.scale, 1, ds.scale);
      });
      const pen = penAt(plan, t);
      for (const [c, p] of Object.entries(pens)) {
        p.visible = !!pen && pen.color === c && pen.level > 0.01;
        if (!p.visible) continue;
        p.position.set(pen.x, pen.y, pen.z);
        p.quaternion.copy(qPen);
        p.scale.setScalar(0.6 + 0.4 * pen.level);
      }
    };
    g.userData.parts = { board: b, pad: pd, ink, notes: notesG, dots, pens };
    return g;
  }

  // fonts: system hand fonts resolve locally; when the font set reports ready, repaint every canvas once and upload.
  if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(() => { for (const f of faceCanvases) f(); });

  const props = { wall, board, note, pad, dot, markerInk, markerPen, caption, wallBoard };
  const factories = {
    wall: (o) => wall(o.dims ?? {}),
    board: (o) => board(o.dims ?? {}),
  };
  return {
    spec: S, palette: P, materials, lights, post, textStyle, camera: S.camera, props, factories, sfx: S.sfx,
    plan: NOTES, motion: NOTES,
    helpers: { paintFace, noteGeometry, inkTime },
  };
}
