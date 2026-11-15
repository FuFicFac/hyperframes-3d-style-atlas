// styles/flipbook/style.js — "Flipbook": a pencil flipbook riffled under a thumb. The look lives in spec.js; WHEN each
// page leaves the thumb and WHAT is drawn on it lives in riffle.js (THREE-free planner shared with SCORE). This file
// turns the plan into pictures: one bent-page mesh per page (vertices rewritten from plan.pageState(k, t) each frame),
// a pool of 2D canvases that paint the pencil drawings (page k -> slot k % pool, redrawn only when the slot's page or
// the pencil progress changes, uploaded right after the redraw), a landed-stack block, a chipboard back, a walnut clamp
// bar with brass screws, a stylised thumb, a pencil, a wooden desk and an overlay caption on a strip of masking tape.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, canvasTexture, uploadTexture } from "../../kit/textures.js";
import { newCanvas } from "../../kit/canvas.js";
import { hash01, clamp, lerp } from "../../kit/time.js";
import { valueNoise2 } from "../../kit/noise.js";
import * as riffle from "./riffle.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, PG = spec.page, DR = spec.drawing;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const W = PG.width, D = PG.depth, zH = -D / 2;
  const boardTop = spec.pad.board, base = boardTop + spec.pad.base;
  const pageY = (k) => base + k * PG.thickness;
  /** page coords (X 0..aspect, Y 0..1) on a FLAT page k -> world [x, y, z] */
  const pageToWorld = (k, X, Y) => [(X / riffle.PAGE_ASPECT - 0.5) * W, pageY(k) + 0.0008, zH + (1 - Y) * D];

  // ---------------------------------------------------------------- desk
  function desk(o = {}) {
    const size = o.size ?? spec.desk.size;
    const tex = woodTexture({ size: 1024, ...spec.desk.wood, repeat: [spec.desk.repeat, spec.desk.repeat] });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0 });
    mat.name = "desk";
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "desk";
    return m;
  }

  // ---------------------------------------------------------------- paper textures
  const [CW, CH] = PG.canvas;
  /** the shared paper base: cream with fibre grain and soft blotches (baked once) */
  const paperBase = (() => {
    const c = newCanvas(CW, CH), x = c.getContext("2d");
    const img = x.createImageData(CW, CH), d = img.data;
    const base = new THREE.Color(P.paper);
    const br = base.r * 255, bg = base.g * 255, bb = base.b * 255;
    for (let py = 0; py < CH; py++) for (let px = 0; px < CW; px++) {
      const g = (hash01(px, py, 69) - 0.5) * 255 * DR.paperFibre;
      const fib = (hash01(px >> 2, py, 7) - 0.5) * 6;
      const bl = (valueNoise2(px / 220, py / 220, 11) - 0.5) * 9;
      const i = 4 * (py * CW + px), v = g + fib + bl;
      d[i] = br + v; d[i + 1] = bg + v; d[i + 2] = bb + v * 1.1; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a faint darker band under the clamp bar and soft edge darkening
    const gr = x.createLinearGradient(0, 0, 0, CH * 0.08);
    gr.addColorStop(0, "rgba(120,100,70,0.12)"); gr.addColorStop(1, "rgba(120,100,70,0)");
    x.fillStyle = gr; x.fillRect(0, 0, CW, CH * 0.08);
    return c;
  })();
  /** paper tooth: a tile of seeded specks that knocks graphite out of the lines (grain) */
  const tooth = (() => {
    const S = 512, c = newCanvas(S, S), x = c.getContext("2d");
    const img = x.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const h = hash01(px, py, 31), streak = valueNoise2(px / 3, py / 9, 5, 512 / 3);
      const a = clamp((h * 0.75 + streak * 0.6 - 0.55) * 2.4);
      const i = 4 * (py * S + px); d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    return c;
  })();
  const layer = newCanvas(CW, CH);
  const backTex = (() => {
    const c = newCanvas(512, 320), x = c.getContext("2d");
    x.drawImage(paperBase, 0, 0, 512, 320);
    return canvasTexture(c, {});
  })();

  const drawCache = new Map(); // keyed by page index only: drawingFor is pure
  const drawingOf = (k, last) => {
    if (!drawCache.has(k)) drawCache.set(k, riffle.drawingFor(k, { last, boil: DR.boil, lineW: DR.lineW }));
    return drawCache.get(k);
  };

  /** paintPage(ctx, k, { last, progress }) — the whole page from scratch (no state carried between draws) */
  function paintPage(x, k, { last, progress = 1 }) {
    x.reset?.();
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
    x.drawImage(paperBase, 0, 0);
    const dr = drawingOf(k, last);
    const sx = CW / riffle.PAGE_ASPECT, sy = CH;
    const path = (c, pts, upto = 1) => {
      const n = pts.length - 1, f = clamp(upto) * n, m = Math.floor(f);
      c.beginPath();
      c.moveTo(pts[0][0] * sx, (1 - pts[0][1]) * sy);
      for (let i = 1; i <= m; i++) c.lineTo(pts[i][0] * sx, (1 - pts[i][1]) * sy);
      if (m < n && f > m) { const a = pts[m], b = pts[m + 1], u = f - m; c.lineTo(lerp(a[0], b[0], u) * sx, (1 - lerp(a[1], b[1], u)) * sy); }
    };
    x.lineCap = "round"; x.lineJoin = "round";
    // smudges first (under the lines)
    for (const s of dr.smudges) {
      const g = x.createRadialGradient(s.x * sx, (1 - s.y) * sy, 0, s.x * sx, (1 - s.y) * sy, s.r * sy);
      g.addColorStop(0, `rgba(60,60,66,${s.a})`); g.addColorStop(1, "rgba(60,60,66,0)");
      x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    }
    // construction + hatching straight onto the paper (light graphite)
    for (const st of dr.strokes) {
      if (st.kind !== "construct" && st.kind !== "hatch") continue;
      x.strokeStyle = st.kind === "construct" ? DR.construct : DR.hatch;
      x.globalAlpha = st.a * (st.kind === "construct" ? 0.55 : 0.8);
      x.lineWidth = st.w * sy; path(x, st.pts); x.stroke();
    }
    x.globalAlpha = 1;
    // bold lines on a layer: three graphite passes, then the paper tooth knocks grain out, then multiply onto the page
    const L = layer.getContext("2d");
    L.reset?.();
    L.setTransform(1, 0, 0, 1, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = "source-over";
    L.clearRect(0, 0, CW, CH);
    L.lineCap = "round"; L.lineJoin = "round"; L.strokeStyle = DR.line;
    dr.strokes.forEach((st, j) => {
      if (st.kind !== "line" && st.kind !== "number") return;
      const upto = k === 0 && j === dr.finishStroke ? progress : 1;
      if (upto <= 0) return;
      for (const [wm, a] of DR.passes) { L.globalAlpha = a * st.a; L.lineWidth = st.w * sy * wm; path(L, st.pts, upto); L.stroke(); }
    });
    L.globalAlpha = DR.grain; L.globalCompositeOperation = "destination-out";
    const pat = L.createPattern(tooth, "repeat");
    const ox = Math.floor(hash01(k, 1) * 512), oy = Math.floor(hash01(k, 2) * 512);
    L.translate(-ox, -oy); L.fillStyle = pat; L.fillRect(0, 0, CW + 512, CH + 512);
    L.setTransform(1, 0, 0, 1, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = "source-over";
    x.globalCompositeOperation = "multiply"; x.drawImage(layer, 0, 0); x.globalCompositeOperation = "source-over";
  }

  /** pencil tip on page 0 at stroke progress p -> page coords [X, Y] */
  function finishPoint(p, last) {
    const dr = drawingOf(0, last), pts = dr.strokes[dr.finishStroke].pts;
    const n = pts.length - 1, f = clamp(p) * n, m = Math.min(n - 1, Math.floor(f)), u = f - m;
    return [lerp(pts[m][0], pts[m + 1][0], u), lerp(pts[m][1], pts[m + 1][1], u)];
  }

  // ---------------------------------------------------------------- page mesh (bendable)
  function pageGeometry() {
    const nx = PG.nx, ns = PG.ns, nv = (nx + 1) * (ns + 1);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
    for (let i = 0; i <= ns; i++) for (let j = 0; j <= nx; j++) { const v = i * (nx + 1) + j; uv[2 * v] = j / nx; uv[2 * v + 1] = 1 - i / ns; }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nx; j++) {
      const a = i * (nx + 1) + j, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // ---------------------------------------------------------------- pencil
  /** pencil() -> Group with the graphite tip at the origin, body along the spec tilt direction */
  function pencil(o = {}) {
    const S = { ...spec.pencil, ...o }, r = S.radius, L = S.length;
    const g = new THREE.Group(); g.name = "pencil";
    const inner = new THREE.Group(); g.add(inner);
    const coneH = r * 4.2, tipH = coneH * 0.28;
    const paint = new THREE.MeshStandardMaterial({ color: P.pencil, roughness: 0.45, metalness: 0, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: "#e9c896", roughness: 0.8, flatShading: true });
    const lead = new THREE.MeshStandardMaterial({ color: "#2e2e33", roughness: 0.5, metalness: 0.2 });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, tipH, 12), lead); tip.position.y = tipH / 2; tip.rotation.x = Math.PI; inner.add(tip);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.3, coneH - tipH, 6), wood); cone.position.y = tipH + (coneH - tipH) / 2; inner.add(cone);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), paint); body.position.y = coneH + L / 2; inner.add(body);
    const fer = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, r * 2.6, 20), new THREE.MeshStandardMaterial({ color: "#c9ccd2", roughness: 0.3, metalness: 0.9 }));
    fer.position.y = coneH + L + r * 1.3; inner.add(fer);
    const er = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, r * 2.2, 20), new THREE.MeshStandardMaterial({ color: "#e88f8f", roughness: 0.8 }));
    er.position.y = coneH + L + r * 3.7; inner.add(er);
    inner.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    const dir = new THREE.Vector3(...S.tilt).normalize();
    inner.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return g;
  }

  // ---------------------------------------------------------------- thumb
  /** thumb() -> Group: a stylised thumb, pad tip at the origin, pointing down its local -Y; nail on the +Z side */
  function thumb(o = {}) {
    const S = { ...spec.thumb, ...o }, r = S.radius, L = S.length;
    const g = new THREE.Group(); g.name = "thumb";
    const inner = new THREE.Group(); g.add(inner);
    const geo = new THREE.CapsuleGeometry(r, L, 8, 24);
    geo.scale(1.08, 1, 0.82);
    const flesh = new THREE.Mesh(geo, materials.skin); flesh.position.y = r + L / 2; inner.add(flesh);
    const knuckle = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, r * 0.05, 6, 24, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: "#c98d70", roughness: 0.7 }));
    knuckle.position.set(0, r + L * 0.55, r * 0.72); knuckle.rotation.set(0, 0, Math.PI * 1.1); inner.add(knuckle);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 24, 12), materials.nail);
    nail.scale.set(0.95, 1.25, 0.32); nail.position.set(0, r * 1.25, r * 0.66); inner.add(nail);
    inner.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  // ---------------------------------------------------------------- clamp bar
  function clampBar(topY) {
    const B = spec.bar, g = new THREE.Group(); g.name = "clampBar";
    const h = topY - boardTop + B.height, w = W + 0.18;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, B.depth), materials.bar);
    bar.position.set(0, boardTop + h / 2, zH - B.depth / 2 + B.overlap);
    bar.castShadow = bar.receiveShadow = true; g.add(bar);
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(B.screwR, B.screwR, 0.025, 28), materials.brass);
      head.position.set(sx * (w / 2 - 0.12), boardTop + h + 0.012, bar.position.z); head.castShadow = true; g.add(head);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(B.screwR * 1.6, 0.006, 0.008), new THREE.MeshStandardMaterial({ color: "#5c4520", roughness: 0.5 }));
      slot.position.set(head.position.x, head.position.y + 0.013, head.position.z); slot.rotation.y = sx * 0.6; g.add(slot);
    }
    return g;
  }

  // ---------------------------------------------------------------- the flipbook
  /**
   * flipbook(plan, { thumbX }) -> { group, pages, pencil, thumb, update(t, { progress, pencil: { on, lift, out } }) }
   *   plan = riffle.createRiffle(...). update(t): every page's bend from plan.pageState(k, t); the drawn range gets the
   *   pool canvases (slot k % pool, repainted only when its page or the pencil progress changes); the landed-stack
   *   block grows with the settled count; the thumb sits at the fan's pinch point and flicks at each release.
   */
  function flipbook(plan, o = {}) {
    const N = plan.n, last = N - 1;
    const group = new THREE.Group(); group.name = "flipbook";
    group.add(desk());
    const board = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * spec.pad.overhang, spec.pad.board, D + 2 * spec.pad.overhang), materials.board);
    board.position.set(0, spec.pad.board / 2, 0); board.castShadow = board.receiveShadow = true; group.add(board);
    const edgeMat = new THREE.MeshStandardMaterial({ color: P.paperEdge, roughness: 0.95 });
    const block = new THREE.Mesh(new THREE.BoxGeometry(W, 1, D), edgeMat);
    block.castShadow = block.receiveShadow = true; group.add(block);
    group.add(clampBar(pageY(N) + 0.004));

    // pool of drawing canvases
    const slots = Array.from({ length: PG.pool }, (_, i) => {
      const c = newCanvas(CW, CH);
      const tex = canvasTexture(c, { anisotropy: 8 });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.FrontSide, shadowSide: THREE.DoubleSide });
      mat.name = `page-slot-${i}`;
      return { c, tex, mat, key: null };
    });
    const blankFront = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.92, side: THREE.FrontSide, shadowSide: THREE.DoubleSide });
    // per-page back tones (slight variation so the fanned pages read as separate sheets)
    const pages = [];
    const geomOpts = { W, D, nx: PG.nx, ns: PG.ns, z0: zH };
    for (let k = 0; k < N; k++) {
      const g = pageGeometry();
      const tone = new THREE.Color(P.paperBack).multiplyScalar(0.94 + 0.08 * hash01(k, 77));
      const backMat = new THREE.MeshStandardMaterial({ map: backTex, color: tone, roughness: 0.95, side: THREE.BackSide });
      const front = new THREE.Mesh(g, blankFront), back = new THREE.Mesh(g, backMat);
      front.castShadow = true; front.receiveShadow = true; back.receiveShadow = true;
      front.frustumCulled = back.frustumCulled = false;
      front.name = `page-${k}`; back.name = `page-${k}-back`;
      group.add(front, back);
      pages.push({ k, g, front, back, out: g.attributes.position.array });
    }
    const pen = pencil(); group.add(pen);
    const th = thumb(); group.add(th);
    stage.scene.add(group);
    const thumbX = o.thumbX ?? W * 0.3;
    const tAxis = new THREE.Vector3(0.18, 0.62, -0.76).normalize();
    th.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tAxis);
    const lastRelease = plan.pages[N - 1].release;
    const pinchBuf = new Float32Array(3 * (PG.nx + 1) * (PG.ns + 1));

    return {
      group, pages, pencil: pen, thumb: th, slots, pageToWorld, finishPoint: (p) => finishPoint(p, last),
      update(t, u = {}) {
        const progress = u.progress ?? 1;
        const [s0, s1] = plan.drawnRange(t);
        // landed-stack block: from the board up to just under the settled top page
        const topY = pageY(s0) - PG.thickness * 0.5;
        const h = Math.max(0.001, topY - boardTop);
        block.scale.set(1, h, 1); block.position.set(0, boardTop + h / 2, 0);
        for (const p of pages) {
          const st = plan.pageState(p.k, t);
          const vis = st.mode !== "buried";
          p.front.visible = p.back.visible = vis;
          if (!vis) continue;
          riffle.bendPage(st, { ...geomOpts, y0: pageY(p.k) }, p.out);
          p.g.attributes.position.needsUpdate = true;
          p.g.computeVertexNormals();
          if (p.k >= s0 && p.k <= s1) {
            const s = slots[p.k % PG.pool], pr = p.k === 0 ? progress : 1, key = `${p.k}|${pr}`;
            if (s.key !== key) { paintPage(s.c.getContext("2d"), p.k, { last, progress: pr }); s.key = key; uploadTexture(stage, s.tex); }
            p.front.material = s.mat;
          } else p.front.material = blankFront;
        }
        // thumb: at the free-edge pinch point of a page in the inner held pose (closed form: independent of which
        // pages are still held), flicking at each release; withdraws after the last page goes
        const nextK = Math.min(N - 1, plan.releasedCount(t) + 1);
        riffle.bendPage({ phi: plan.held.phi0, kappa: plan.held.free - plan.held.phi0, twist: 0 }, { ...geomOpts, y0: pageY(nextK) }, pinchBuf);
        const j = Math.round((thumbX / W + 0.5) * PG.nx), o3 = 3 * (PG.ns * (PG.nx + 1) + j);
        const away = clamp((t - lastRelease - 0.15) / 0.8);
        const flick = plan.thumbPulse(t) * 0.025 + away * away * 0.9;
        th.position.set(thumbX + tAxis.x * flick, pinchBuf[o3 + 1] + tAxis.y * flick + 0.01, pinchBuf[o3 + 2] + tAxis.z * flick);
        th.visible = away < 1;
        // pencil
        const pc = u.pencil ?? { on: false };
        pen.visible = !!pc.on;
        if (pc.on) {
          const [X, Y] = finishPoint(pc.p ?? progress, last), w = pageToWorld(0, X, Y);
          pen.position.set(w[0] + (pc.out ?? 0) * 1.4, w[1] + (pc.lift ?? 0) * 0.35, w[2] + (pc.out ?? 0) * 0.5);
          pen.rotation.set(0, 0, (pc.out ?? 0) * -0.2);
        }
      },
    };
  }

  // ---------------------------------------------------------------- overlay caption: a strip of masking tape
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1000, Hp = Q.h + 30;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.9), pw = Math.min(Wc - 20, tw + 2 * pad), ph = Q.h;
      const ox = Math.round((Wc - pw) / 2), oy = 10;
      // torn ends: zig-zag left/right edges (seeded from the text, stable)
      const zz = (side) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([side + (hash01(i, side, st.text.length) - 0.5) * 10, oy + (ph * i) / 8]); return pts; };
      const L = zz(ox), R = zz(ox + pw);
      x.save(); x.translate(0, 0);
      x.fillStyle = "rgba(60,40,10,0.18)";
      x.beginPath(); L.forEach((p, i) => (i ? x.lineTo(p[0] + 3, p[1] + 5) : x.moveTo(p[0] + 3, p[1] + 5))); [...R].reverse().forEach((p) => x.lineTo(p[0] + 3, p[1] + 5)); x.closePath(); x.fill();
      x.fillStyle = Q.tape;
      x.beginPath(); L.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); [...R].reverse().forEach((p) => x.lineTo(p[0], p[1])); x.closePath(); x.fill();
      x.strokeStyle = Q.tapeEdge; x.lineWidth = 2; x.stroke();
      x.restore();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "center";
      x.fillText(st.text, Wc / 2, oy + ph / 2 + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y - 10);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { desk, pencil, thumb, clampBar, flipbook, caption };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: riffle, motion: riffle, pageToWorld, paintPage,
  };
}
