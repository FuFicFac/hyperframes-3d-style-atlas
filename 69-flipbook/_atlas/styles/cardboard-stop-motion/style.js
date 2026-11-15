// styles/cardboard-stop-motion/style.js — "Cardboard Stop-Motion": a hand-built corrugated-cardboard set on a workbench
// under a warm clamp lamp, animated on threes. Implements the style contract (references/kit-api.md §3).
//
// Board = an extruded 2D outline (kit cardGeometry) whose outline is first made "hand-cut" (resampled + low-frequency
// normal wobble + tiny knife kinks, seeded). Its cut-edge triangles get rewritten UVs (u = distance along the edge /
// flute pitch, v = across the thickness) so one small canvas of a corrugated cross-section (two liners, a sine medium,
// dark cavities) tiles along every cut as visible flutes. Faces use a 1 m tileable kraft canvas (fibre, mottling, faint
// flute show-through stripes); drawn-on faces are a per-piece canvas: kraft (or white-top) base + marker ink composited
// with "multiply", strokes from the kit stroke font for lettering, hatched colour fills, wobbly outlines.
//
// Nothing animates itself. The scene evaluates EVERYTHING at pose time (style.plan.poseTime(t)), then calls
// style.stepLights(i) (per-pose lamp flicker), style.stepCamera(rig, tq, i) (stepped camera + jitter) and
// style.jiggle(obj, i, seed, k) (per-pose hand-placement error). Props expose hooks (setPose, show, write, setStand).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { shapes, cardGeometry } from "../../kit/shapes.js";
import { fbm2, paintPixels, makeCanvas, canvasTexture, woodTexture } from "../../kit/textures.js";
import { FONTS } from "../../kit/text.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { pathLength, pointAt, strokeOutline } from "../../kit/pathmath.js";
import { hash01, clamp, lerp, TAU } from "../../kit/time.js";
import * as plan from "./poses.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ------------------------------------------------------------------ pure outline helpers (metres, [x, y] points)
/** roundRectPts(x0, y0, x1, y1, r, n = 5) -> closed outline points (counter-clockwise). */
export function roundRectPts(x0, y0, x1, y1, r = 0, n = 5) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  if (r <= 1e-6) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const out = [];
  const corner = (cx, cy, a0) => { for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
  return out;
}
/** circlePts(r, n, cx, cy) */
export const circlePts = (r, n = 32, cx = 0, cy = 0) => Array.from({ length: n }, (_, k) => [cx + Math.cos((k / n) * TAU) * r, cy + Math.sin((k / n) * TAU) * r]);
/** ellipsePts(rx, ry, n, cx, cy, rot) */
export const ellipsePts = (rx, ry, n = 28, cx = 0, cy = 0, rot = 0) => Array.from({ length: n }, (_, k) => {
  const a = (k / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
  return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
});
/** gearPts(r, teeth, depth, n) -> toothed wheel outline (trapezoid teeth). */
export function gearPts(r, teeth = 12, depth = 0.12, perTooth = 8) {
  const out = [];
  for (let i = 0; i < teeth * perTooth; i++) {
    const a = (i / (teeth * perTooth)) * TAU, f = (i % perTooth) / perTooth;
    const k = f < 0.15 ? f / 0.15 : f < 0.5 ? 1 : f < 0.65 ? 1 - (f - 0.5) / 0.15 : 0;
    const rr = r - depth * r * (1 - k);
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}
/** wonky(points, { seed, amp, freq, kink, step }) -> hand-cut version of a closed outline (resampled, wobbled along normals). */
export function wonky(pts, { seed = 1, amp = 0.018, freq = 2.2, kink = 0.006, step = 0.07 } = {}) {
  const n = pts.length, samp = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) { const u = j / k; samp.push({ p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], s: s + u * L }); }
    s += L;
  }
  const m = samp.length;
  return samp.map(({ p, s: si }, i) => {
    const a = samp[(i - 1 + m) % m].p, b = samp[(i + 1) % m].p;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const off = amp * (2 * fbm2(si * freq, seed * 0.37, { seed, octaves: 2 }) - 1) + kink * (2 * hash01(seed, i, 3) - 1);
    return [p[0] - ty * off, p[1] + tx * off];
  });
}

/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, B = spec.board, MK = spec.marker, TX = spec.textures, LT = spec.lettering;
  const col = (c) => P[c] ?? c;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- textures (built once, seeded)
  const tileCanvas = (base, light, dark, seed, mottleK = 1) => {
    const T = TX.kraft, cb = new THREE.Color(base), cl = new THREE.Color(light), cd = new THREE.Color(dark);
    return paintPixels(T.size, (u, v) => {
      const mot = fbm2(u * 6, v * 6, { seed, octaves: 4, period: 6 });
      const fib = fbm2(u * 96, v * 24, { seed: seed + 9, octaves: 2, period: 96 });   // fibres stretched along v
      const fleck = hash01(Math.floor(u * T.size), Math.floor(v * T.size), seed) ;
      const stripe = 0.5 + 0.5 * Math.cos(u * T.stripes * TAU);                        // flute show-through
      let k = (mot - 0.5) * 2 * T.mottle * mottleK + (fib - 0.5) * T.fibre - stripe * B.showThrough;
      if (fleck > 0.985) k -= 0.12; else if (fleck < 0.012) k += 0.08;
      const c = k < 0 ? cb.clone().lerp(cd, Math.min(1, -k * 2.2)) : cb.clone().lerp(cl, Math.min(1, k * 2.2));
      return [c.r, c.g, c.b];
    });
  };
  const kraftTile = tileCanvas(P.kraft, P.kraftLight, P.kraftDark, TX.kraft.seed);
  const whiteTile = tileCanvas(P.whiteTop, "#f6f1e6", "#d6cbb6", TX.kraft.seed + 5, 0.7);
  const edgeCanvas = (() => {
    const { w: W, h: H } = TX.edge, c = makeCanvas(W, H), g = c.getContext("2d");
    g.fillStyle = P.cavity; g.fillRect(0, 0, W, H);
    const lin = Math.round(H * B.linerFrac);
    // cavity depth shading: darker toward the middle of each cell
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#5a3a22"); grd.addColorStop(0.5, P.cavity); grd.addColorStop(1, "#5a3a22");
    g.fillStyle = grd; g.fillRect(0, lin, W, H - 2 * lin);
    // the corrugated medium: a sine band from liner to liner
    g.strokeStyle = P.flute; g.lineWidth = H * 0.13; g.lineCap = "round";
    g.beginPath();
    for (let x = -2; x <= W + 2; x++) {
      const y = H / 2 - (H / 2 - lin - H * 0.05) * Math.cos((x / W) * TAU);
      x === -2 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = P.kraftDark; g.fillRect(0, 0, W, lin); g.fillRect(0, H - lin, W, lin);
    g.fillStyle = "rgba(255,240,215,0.25)"; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1);
    return c;
  })();

  const kraftMap = canvasTexture(kraftTile, { anisotropy: 8 });
  const whiteMap = canvasTexture(whiteTile, { anisotropy: 8 });
  const edgeMap = canvasTexture(edgeCanvas, { anisotropy: 4 });
  edgeMap.wrapT = THREE.ClampToEdgeWrapping;
  const mats = {
    kraft: Object.assign(materials.kraft.clone(), { name: "kraft", map: kraftMap }),
    whiteTop: Object.assign(materials.kraft.clone(), { name: "whiteTop", map: whiteMap }),
    edge: Object.assign(materials.edge, { map: edgeMap }),
  };
  materials.kraftFace = mats.kraft; materials.whiteTopFace = mats.whiteTop;
  const woodMap = woodTexture({ ...TX.wood, dark: P.woodDark, mid: P.wood, light: "#a87448", seam: TX.wood.seamColor });
  materials.bench.map = woodMap; materials.bench.needsUpdate = true;
  materials.tape.transparent = true;
  for (const m of Object.values(mats)) m.needsUpdate = true;

  // ---------------------------------------------------------------- marker drawing on a face canvas
  function strokePath(g, pts, X, Y, frac = 1) {
    if (pts.length < 2) { g.moveTo(X(pts[0][0]), Y(pts[0][1])); g.lineTo(X(pts[0][0]) + 0.01, Y(pts[0][1])); return; }
    const L = pathLength(pts.map((p) => [p[0], p[1], 0])) * frac;
    g.moveTo(X(pts[0][0]), Y(pts[0][1]));
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s + d >= L) { const u = d > 0 ? (L - s) / d : 0; g.lineTo(X(lerp(a[0], b[0], u)), Y(lerp(a[1], b[1], u))); return; }
      g.lineTo(X(b[0]), Y(b[1])); s += d;
    }
  }
  /** a drawing context in face metres (y up), every mark is marker ink multiplied into the board. */
  function markerHelper(g, bbox, s) {
    const X = (x) => (x - bbox.minX) * s, Y = (y) => (bbox.maxY - y) * s;
    const ink = (color, alpha, fn) => { g.save(); g.globalCompositeOperation = "multiply"; g.globalAlpha = alpha; g.strokeStyle = g.fillStyle = col(color); g.lineCap = g.lineJoin = "round"; fn(); g.restore(); };
    const h = {
      s, X, Y, g, bbox,
      /** line(pts, color, widthM, { closed, frac, alpha }) — wobbly marker line with a faint bleed halo */
      line(pts, color = "ink", w = 0.03, o = {}) {
        const a = o.alpha ?? 1, path = o.closed ? [...pts, pts[0]] : pts;
        ink(color, MK.bleedAlpha * a, () => { g.lineWidth = w * s * (1 + MK.bleed * 2); g.beginPath(); strokePath(g, path, X, Y, o.frac ?? 1); g.stroke(); });
        ink(color, 0.92 * a, () => { g.lineWidth = w * s; g.beginPath(); strokePath(g, path, X, Y, o.frac ?? 1); g.stroke(); });
      },
      /** dot(x, y, r, color) */
      dot(x, y, r, color = "ink") { ink(color, 0.95, () => { g.beginPath(); g.arc(X(x), Y(y), r * s, 0, TAU); g.fill(); }); },
      /** hatch(poly, color, { gap, width, angle, alpha, wash }) — colour fill the way a marker does it: a light wash + strokes */
      hatch(poly, color, o = {}) {
        const gap = o.gap ?? MK.hatch.gap, w = o.width ?? MK.hatch.width, ang = o.angle ?? MK.hatch.angle, a = o.alpha ?? MK.hatch.alpha;
        g.save();
        g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.closePath(); g.clip();
        ink(color, (o.wash ?? MK.hatch.wash) * a, () => { g.fillRect(0, 0, g.canvas.width, g.canvas.height); });
        const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + gap;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        let k = 0;
        for (let d = -R; d <= R; d += gap, k++) {
          const j = (hash01(o.seed ?? 3, k, 1) - 0.5) * gap * 0.5;
          const ox = cx - dy * (d + j), oy = cy + dx * (d + j);
          ink(color, a * (0.75 + 0.25 * hash01(o.seed ?? 3, k, 2)), () => { g.lineWidth = w * s; g.beginPath(); g.moveTo(X(ox - dx * R), Y(oy - dy * R)); g.lineTo(X(ox + dx * R), Y(oy + dy * R)); g.stroke(); });
        }
        g.restore();
      },
      /** text(str, cx, cy, cap, { color, progress (strokes, fractional), seed, align }) -> layout (stroke-font marker lettering, block centred on cx, cy) */
      text(str, cx, cy, cap, o = {}) {
        const L = layoutStrokeText(str, cap, { letterSpacing: LT.letterSpacing, lineHeight: LT.lineHeight, align: o.align ?? "center" });
        const total = cap + (L.lines - 1) * LT.lineHeight * cap, y0 = cy + total / 2 - cap;
        const w = (o.width ?? MK.width) * cap;
        let n = 0;
        const prog = o.progress ?? Infinity;
        for (const c of L.chars) {
          for (const st of c.strokes) {
            if (n >= prog) return L;
            const sd = (o.seed ?? 5) * 31 + n;
            const jx = (hash01(sd, 1) - 0.5) * 2 * MK.wobble * cap, jy = (hash01(sd, 2) - 0.5) * 2 * MK.wobble * cap, rot = (hash01(sd, 3) - 0.5) * 0.06;
            const pts = st.map((p) => { const x = p[0] * Math.cos(rot) - p[1] * Math.sin(rot), y = p[0] * Math.sin(rot) + p[1] * Math.cos(rot); return [cx + x + jx, y0 + y + jy]; });
            h.line(pts, o.color ?? "ink", w, { frac: Math.min(1, prog - n) });
            n++;
          }
        }
        return L;
      },
      /** arrow(pts, color, w, head) — marker arrow along a polyline */
      arrow(pts, color = "ink", w = 0.035, head = 0.16) {
        h.line(pts, color, w);
        const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (const d of [2.5, -2.5]) h.line([[b[0] + Math.cos(ang + d) * head, b[1] + Math.sin(ang + d) * head], b], color, w);
      },
    };
    return h;
  }
  /** printedFace(bbox, { base: "kraft"|"whiteTop", draw(h) }) -> { material, redraw(dynamicDraw, key) } */
  function printedFace(bbox, o = {}) {
    const s = Math.min(B.pxPerMetre, 2048 / Math.max(bbox.w, bbox.h));
    const W = Math.max(8, Math.ceil(bbox.w * s)), H = Math.max(8, Math.ceil(bbox.h * s));
    const baseC = makeCanvas(W, H), bg = baseC.getContext("2d");
    const tile = o.base === "whiteTop" ? whiteTile : kraftTile;
    const pat = bg.createPattern(tile, "repeat");
    pat.setTransform(new DOMMatrix().translate(-bbox.minX * s, bbox.maxY * s).scale(s / tile.width, s / tile.width));
    bg.fillStyle = pat; bg.fillRect(0, 0, W, H);
    if (o.draw) o.draw(markerHelper(bg, bbox, s));
    const live = makeCanvas(W, H), lg = live.getContext("2d");
    lg.drawImage(baseC, 0, 0);
    const texture = canvasTexture(live, { anisotropy: 8 });
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    const material = materials.kraft.clone();
    material.name = "printedFace";
    material.map = texture;
    let lastKey = null;
    return {
      material, canvas: live,
      /** redraw(fn(h), key): reset to the static print, then draw the dynamic layer; only when key changes. */
      redraw(fn, key) {
        if (key === lastKey) return;
        lastKey = key;
        lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalAlpha = 1; lg.globalCompositeOperation = "copy"; lg.filter = "none";
        lg.drawImage(baseC, 0, 0);
        lg.globalCompositeOperation = "source-over";
        if (fn) fn(markerHelper(lg, bbox, s));
        texture.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- board geometry
  function fluteUVs(geo, t) {
    const g = geo.groups.find((q) => q.materialIndex === 2) ?? geo.groups[2];
    if (!g) return;
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = g.start; i < g.start + g.count; i++) uv.setXY(i, uv.getX(i) / B.flutePitch, (pos.getZ(i) + t / 2) / t);
    uv.needsUpdate = true;
  }
  /**
   * cutout(outline [[x,y]...], { thickness, seed, wonk (false | amp scale), face: "kraft"|"whiteTop", draw(h), holes, back })
   *   -> Mesh. Front faces +Z, outline in metres (any anchor). userData: { bbox, outline, thickness, print }.
   */
  function cutout(outline, o = {}) {
    const t = o.thickness ?? B.thickness, seed = o.seed ?? 1;
    const pts = o.wonk === false ? outline : wonky(outline, { ...B.wonk, amp: B.wonk.amp * (o.wonk ?? 1), kink: B.wonk.kink * (o.wonk ?? 1), seed });
    const shape = shapes.poly(pts);
    for (const hole of o.holes ?? []) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const printed = !!o.draw || o.face === "whiteTop";
    const { geo, bbox } = cardGeometry(shape, t, B.curveSegments, printed);
    fluteUVs(geo, t);
    let print = null, face = o.face === "whiteTop" ? mats.whiteTop : mats.kraft;
    if (printed) { print = printedFace(bbox, { base: o.face, draw: o.draw }); face = print.material; }
    const m = new THREE.Mesh(geo, [face, o.back ?? mats.kraft, mats.edge]);
    m.castShadow = m.receiveShadow = true;
    m.userData = { bbox, outline: pts, thickness: t, print };
    return m;
  }

  // ---------------------------------------------------------------- props
  const T = B.thickness, DZ = T + 0.006;      // layer step for stacked cut-out parts
  /** splitPin({ r }) -> brass dome head (faces +Z). Place it on the front face of the front-most piece of a joint. */
  function splitPin(o = {}) {
    const r = o.r ?? 0.045;
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, TAU, 0, Math.PI / 2), materials.brass);
    dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.5, 1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, r * 0.12, 6, 20), materials.brass);
    g.add(dome, rim);
    g.traverse((c) => { c.castShadow = true; });
    g.name = "splitPin";
    return g;
  }
  /** pinned(content, pivotXY, z) -> Group pivot at pivotXY, content shifted so the pin is the origin. */
  const pivot = (x, y, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

  /** tape({ l, w, seed, color }) -> masking tape strip along X, centred, torn zigzag ends, thin. */
  function tape(o = {}) {
    const l = o.l ?? 0.6, w = o.w ?? 0.16, seed = o.seed ?? 3, n = 5, pts = [];
    for (let k = 0; k <= n; k++) pts.push([l / 2 + (k % 2 ? 0.02 : -0.01) + (hash01(seed, k, 1) - 0.5) * 0.02, -w / 2 + (k / n) * w]);
    for (let k = n; k >= 0; k--) pts.push([-l / 2 + (k % 2 ? -0.02 : 0.01) + (hash01(seed, k, 2) - 0.5) * 0.02, -w / 2 + (k / n) * w]);
    const { geo } = cardGeometry(shapes.poly(pts), 0.006, 4, false);
    const m = new THREE.Mesh(geo, materials.tape);
    m.castShadow = false; m.receiveShadow = true;
    m.name = "tape";
    return m;
  }

  /** sheet / cut-out with drawing: doodle({ w, h, draw, face, seed }) -> rectangle card, bottom-centre anchored. */
  const doodle = (o = {}) => cutout(roundRectPts(-(o.w ?? 1) / 2, 0, (o.w ?? 1) / 2, o.h ?? 1, o.r ?? 0.04), o);

  /** box({ w, h, d, seed, draw: { front, side }, tapeTop }) -> closed corrugated box, pivot at the bottom centre. */
  function box(o = {}) {
    const w = o.w ?? 1.6, h = o.h ?? 0.8, d = o.d ?? 0.9, seed = o.seed ?? 11, g = new THREE.Group();
    const panel = (pw, ph, s, draw) => cutout(roundRectPts(-pw / 2, -ph / 2, pw / 2, ph / 2, 0.01), { seed: s, wonk: 0.25, draw });
    const front = panel(w, h, seed, o.draw?.front); front.position.set(0, h / 2, d / 2 - T / 2);
    const back = panel(w, h, seed + 1); back.position.set(0, h / 2, -d / 2 + T / 2); back.rotation.y = Math.PI;
    const left = panel(d - 2 * T, h, seed + 2, o.draw?.side); left.position.set(-w / 2 + T / 2, h / 2, 0); left.rotation.y = -Math.PI / 2;
    const right = panel(d - 2 * T, h, seed + 3, o.draw?.side); right.position.set(w / 2 - T / 2, h / 2, 0); right.rotation.y = Math.PI / 2;
    // top: two flaps meeting in the middle (a visible seam), taped
    const flapA = panel(w, d / 2, seed + 4); flapA.rotation.x = -Math.PI / 2; flapA.position.set(0, h - T / 2, -d / 4);
    const flapB = panel(w, d / 2, seed + 5); flapB.rotation.x = -Math.PI / 2; flapB.position.set(0, h - T / 2 + 0.004, d / 4);
    g.add(front, back, left, right, flapA, flapB);
    if (o.tapeTop !== false) {
      const tp = tape({ l: w * 0.82, w: 0.16, seed: seed + 9 }); tp.rotation.x = -Math.PI / 2; tp.position.set(0, h + 0.01, 0); g.add(tp);
      const tf = tape({ l: 0.16, w: 0.3, seed: seed + 10 }); tf.position.set(0, h - 0.13, d / 2 + 0.004); tf.rotation.z = Math.PI / 2; g.add(tf);
    }
    g.userData = { w, h, d, top: h, front };
    return g;
  }

  /**
   * sign({ w, h, tab, face, seed, badge, badgeColor }) -> standing sign on a tab: a card whose tab drops into a slot.
   *   Pivot = the bottom edge of the card (its tab hangs below y = 0, hide it in a base).
   *   userData.setStand(u): 0 = lying flat backwards, 1 = upright (feed plan.standUp / plan.tipBack).
   *   userData.write(text, strokes, { cap, cx, cy, color }) redraws the marker layer (only when strokes changes).
   */
  function sign(o = {}) {
    const w = o.w ?? 3, h = o.h ?? 1.5, tw = o.tabW ?? 0.6, th = o.tab ?? 0.22;
    const outline = [[-w / 2, 0], [-tw / 2, 0], [-tw / 2, -th], [tw / 2, -th], [tw / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
    const card = cutout(outline, { face: o.face ?? "whiteTop", seed: o.seed ?? 21, wonk: 0.8, draw: o.draw });
    const hinge = new THREE.Group();
    hinge.add(card);
    hinge.userData.card = card;
    hinge.userData.setStand = (u) => { hinge.rotation.x = -(1 - u) * (Math.PI / 2); hinge.visible = u > 0.001 || o.showFlat === true; };
    hinge.userData.write = (text, strokes, q = {}) => {
      const key = `${text}|${Math.round(strokes * 20)}`;
      card.userData.print.redraw((hh) => hh.text(text, q.cx ?? 0, q.cy ?? h / 2, q.cap ?? LT.cap, { progress: strokes, color: q.color ?? "ink", seed: q.seed ?? 7 }), key);
    };
    return hinge;
  }

  /**
   * jointArm({ lengths, widths, seed, draw }) -> chain of strips joined by split pins, hanging down (-Y) from the origin.
   *   userData.joints = [pivot0, pivot1, ...] (rotation.z = angle, + swings toward +X), userData.tip = Group at the end.
   */
  function jointArm(o = {}) {
    const lengths = o.lengths ?? [0.6, 0.5], widths = o.widths ?? [0.18, 0.16], seed = o.seed ?? 40;
    const root = new THREE.Group(), joints = [];
    let parent = root;
    lengths.forEach((L, i) => {
      const jv = i === 0 ? root : pivot(0, -lengths[i - 1], DZ);
      if (i > 0) parent.add(jv);
      const wv = widths[i] ?? widths[widths.length - 1];
      const strip = cutout(roundRectPts(-wv / 2, -L - wv * 0.45, wv / 2, wv * 0.5, wv * 0.5), { seed: seed + i, wonk: 0.6, draw: o.draw?.[i] });
      jv.add(strip);
      const pin = splitPin({ r: Math.min(0.045, wv * 0.25) }); pin.position.z = T / 2 + 0.002; jv.add(pin);
      joints.push(jv);
      parent = jv;
    });
    const tip = pivot(0, -lengths[lengths.length - 1], DZ);
    parent.add(tip);
    root.userData = { joints, tip };
    return root;
  }

  /**
   * puppet({ seed, skin, shirt, hat }) -> split-pin jointed cut-out figure (~2.3 m), pivot at the feet (bottom centre).
   *   userData.joints: { neck, shoulderL, elbowL, shoulderR, elbowR, hipL, hipR } — rotation.z only.
   *   userData.setPose({ name: angle }) ; userData.handR / handL: Groups at the hands (attach tools).
   */
  function puppet(o = {}) {
    const seed = o.seed ?? 60, root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const hipY = 0.98, shY = 1.66, neckY = 1.8;
    const joints = {};
    // legs (behind the torso)
    for (const [s, name] of [[-1, "hipL"], [1, "hipR"]]) {
      const pv = pivot(s * 0.15, hipY, -DZ);
      const leg = cutout(roundRectPts(-0.11, -0.94, 0.11, 0.08, 0.05), { seed: seed + (s > 0 ? 1 : 2), wonk: 0.6, draw: (h) => {
        h.hatch(roundRectPts(-0.13, -0.96, 0.13, 0.1, 0.05), "blue", { seed: seed + 3 });
        h.hatch([[-0.14, -0.96], [0.2 * s + 0.02, -0.96], [0.2 * s + 0.02, -0.8], [-0.14, -0.8]], "ink", { gap: 0.03, alpha: 0.9 });
      } });
      // shoe sticks out forward (toward +x for the right leg, -x for the left)
      const shoe = cutout(roundRectPts(-0.12, -0.08, 0.12, 0.06, 0.05).map(([x, y]) => [x + s * 0.06, y - 0.88]), { seed: seed + 4 + s, wonk: 0.4, draw: (h) => h.hatch(roundRectPts(-0.3, -1.1, 0.3, -0.7, 0), "ink", { alpha: 0.95, gap: 0.03 }) });
      shoe.position.z = -DZ * 0.5;
      pv.add(leg, shoe);
      body.add(pv); joints[name] = pv;
    }
    // torso
    const torsoPts = [[-0.3, 0.86], [0.3, 0.86], [0.36, 1.62], [0.3, 1.78], [-0.3, 1.78], [-0.36, 1.62]];
    const torso = cutout(torsoPts, { seed: seed + 7, wonk: 0.8, draw: (h) => {
      h.hatch([[-0.27, 0.84], [0.27, 0.84], [0.27, 1.4], [-0.27, 1.4]], "blue", { seed: seed + 8 });           // overall bib
      h.line([[-0.2, 1.4], [-0.25, 1.78]], "blue", 0.05); h.line([[0.2, 1.4], [0.25, 1.78]], "blue", 0.05);    // straps
      h.line(roundRectPts(-0.12, 1.02, 0.12, 1.22, 0.03), "ink", 0.022, { closed: true });                      // pocket
      h.dot(-0.2, 1.38, 0.025); h.dot(0.2, 1.38, 0.025);
      h.line([[-0.1, 1.78], [0, 1.68], [0.1, 1.78]], "ink", 0.025);                                             // collar
    } });
    body.add(torso);
    for (const s of [-1, 1]) { const pin = splitPin(); pin.position.set(s * 0.15, hipY, T / 2 + 0.002); body.add(pin); }
    // head (behind the collar) + hat
    const neck = pivot(0, neckY, -DZ);
    const head = cutout(circlePts(0.29, 30, 0, 0.27), { seed: seed + 9, wonk: 0.7, draw: (h) => {
      h.dot(-0.1, 0.3, 0.032); h.dot(0.1, 0.3, 0.032);
      h.line([[-0.12, 0.17], [-0.05, 0.12], [0.05, 0.12], [0.12, 0.17]], "ink", 0.026);
      h.line([[0.0, 0.27], [0.03, 0.22]], "ink", 0.02);
      h.hatch(circlePts(0.05, 12, -0.17, 0.2), "red", { alpha: 0.4, gap: 0.02 }); h.hatch(circlePts(0.05, 12, 0.17, 0.2), "red", { alpha: 0.4, gap: 0.02 });
    } });
    const hatPts = [[-0.42, 0.44], [0.42, 0.44], [0.4, 0.52], [0.2, 0.54], [0.18, 0.74], [-0.18, 0.74], [-0.2, 0.54], [-0.4, 0.52]];
    const hat = cutout(hatPts, { seed: seed + 10, wonk: 0.8, draw: (h) => { h.hatch(hatPts, "yellow", { seed: seed + 11, alpha: 0.9 }); h.line([[-0.19, 0.56], [0.19, 0.56]], "red", 0.05); } });
    hat.position.z = DZ;
    neck.add(head, hat);
    body.add(neck); joints.neck = neck;
    const pinN = splitPin({ r: 0.04 }); pinN.position.set(0, neckY - 0.02, T / 2 + 0.002); body.add(pinN);
    // arms (in front)
    const hands = {};
    for (const [s, sh, el] of [[-1, "shoulderL", "elbowL"], [1, "shoulderR", "elbowR"]]) {
      const arm = jointArm({ lengths: [0.56, 0.5], widths: [0.17, 0.15], seed: seed + 20 + s, draw: [
        (h) => h.hatch(roundRectPts(-0.1, -0.3, 0.1, 0.12, 0), "blue", { seed: seed + 30 + s, alpha: 0.5 }),
        (h) => { h.hatch(circlePts(0.09, 14, 0, -0.5), "red", { alpha: 0.35, gap: 0.02 }); h.line(circlePts(0.09, 14, 0, -0.5), "ink", 0.018, { closed: true }); },
      ] });
      arm.position.set(s * 0.3, shY, DZ);
      body.add(arm);
      joints[sh] = arm.userData.joints[0]; joints[el] = arm.userData.joints[1];
      hands[s > 0 ? "handR" : "handL"] = arm.userData.tip;
    }
    root.userData = {
      joints, body, ...hands,
      setPose(p) { for (const k in p) if (joints[k]) joints[k].rotation.z = p[k]; },
    };
    return root;
  }

  /** wheel({ r, teeth, depth, seed, draw, color }) -> toothed cardboard gear/wheel centred at the origin with a split pin. */
  function wheel(o = {}) {
    const r = o.r ?? 0.6, g = new THREE.Group();
    const pts = o.teeth === 0 ? circlePts(r, 40) : gearPts(r, o.teeth ?? 12, o.depth ?? 0.16);
    const wh = cutout(pts, { seed: o.seed ?? 70, wonk: 0.5, draw: o.draw ?? ((h) => {
      if (o.color) h.hatch(pts, o.color, { seed: (o.seed ?? 70) + 1 });
      h.line(circlePts(r * 0.45, 24), "ink", 0.03, { closed: true });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.3; h.line([[Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12], [Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42]], "ink", 0.03); }
    }) });
    const pin = splitPin({ r: Math.min(0.06, r * 0.1) }); pin.position.z = T / 2 + 0.002;
    g.add(wh, pin);
    g.userData = { disc: wh, setAngle: (a) => { wh.rotation.z = a; } };
    return g;
  }

  /** arrow({ len, w, head, seed, color }) -> cardboard arrow cut-out pointing +X (marker outline + hatch), bottom-left at origin-ish. */
  function arrowCut(o = {}) {
    const L = o.len ?? 1.2, w = o.w ?? 0.24, hd = o.head ?? 0.42;
    const pts = [[0, -w / 2], [L - hd, -w / 2], [L - hd, -w], [L, 0], [L - hd, w], [L - hd, w / 2], [0, w / 2]];
    return cutout(pts, { seed: o.seed ?? 80, draw: (h) => { if (o.color) h.hatch(pts, o.color, { seed: (o.seed ?? 80) + 1 }); h.line(pts.map(([x, y]) => [x * 0.94 + 0.03, y * 0.8]), "ink", 0.025, { closed: true }); } });
  }

  /** swapper(pieces) -> Group holding replacement pieces; userData.show(i) shows piece i only (-1 = none). */
  function swapper(pieces) {
    const g = new THREE.Group();
    pieces.forEach((p) => g.add(p));
    g.userData.pieces = pieces;
    g.userData.show = (i) => pieces.forEach((p, k) => { p.visible = k === i; });
    g.userData.show(-1);
    return g;
  }

  /** bench({ w, d, h }) -> workbench top (wood), top surface at y = 0. */
  function bench(o = {}) {
    const w = o.w ?? 18, d = o.d ?? 10, h = o.h ?? 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [materials.benchSide, materials.benchSide, materials.bench, materials.benchSide, materials.benchSide, materials.benchSide]);
    top.position.y = -h / 2;
    top.receiveShadow = true;
    woodMap.repeat.set(w / TX.wood.metres, d / TX.wood.metres);
    const g = new THREE.Group(); g.add(top);
    return g;
  }

  /** backdrop({ w, h, seed, draw }) -> big standing kraft sheet (bottom-centre anchored) with masking tape on the top corners. */
  function backdrop(o = {}) {
    const w = o.w ?? 13, h = o.h ?? 5.5, g = new THREE.Group();
    const sh = cutout(roundRectPts(-w / 2, 0, w / 2, h, 0.05), { seed: o.seed ?? 5, wonk: 1.4, draw: o.draw });
    g.add(sh);
    for (const s of [-1, 1]) {
      const tp = tape({ l: 0.75, w: 0.18, seed: 30 + s }); tp.position.set(s * (w / 2 - 0.5), h - 0.18, T / 2 + 0.004); tp.rotation.z = s * 0.5; g.add(tp);
    }
    g.userData.sheet = sh;
    return g;
  }

  /** lamp({ }) -> clamp-on work lamp: enamel shade (opening -Y in its local frame), emissive bulb, arm. userData.setLevel(k). */
  function lamp(o = {}) {
    const g = new THREE.Group();
    const prof = [[0.06, 0.38], [0.14, 0.34], [0.2, 0.22], [0.42, -0.08], [0.47, -0.16]].map(([x, y]) => new THREE.Vector2(x, y));
    const shade = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), materials.lampShade);
    materials.lampShade.side = THREE.DoubleSide;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), materials.bulb);
    bulb.position.y = 0.05;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 10), materials.lampMetal);
    arm.position.set(-0.6, 1.3, 0); arm.rotation.z = 0.5;
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), materials.lampMetal); knuckle.position.y = 0.4;
    g.add(shade, bulb, arm, knuckle);
    shade.castShadow = false;
    const base = materials.bulb.emissiveIntensity;
    g.userData = { bulb, shade, setLevel: (k) => { materials.bulb.emissiveIntensity = base * k; } };
    return g;
  }

  /** stick({ len, r }) -> wooden dowel / skewer along +Y from the origin (sun-on-a-stick rigs). */
  function stick(o = {}) {
    const len = o.len ?? 2, m = new THREE.Mesh(new THREE.CylinderGeometry(o.r ?? 0.03, o.r ?? 0.03, len, 8), materials.stick);
    m.position.y = len / 2; m.castShadow = true;
    const g = new THREE.Group(); g.add(m); return g;
  }

  /** tapeRoll({ r, w }) -> a roll of masking tape lying flat on the bench (axis +Y), pivot at its base. */
  function tapeRoll(o = {}) {
    const r = o.r ?? 0.32, w = o.w ?? 0.17, g = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 40, 1, true), materials.tape);
    const top = new THREE.Mesh(new THREE.RingGeometry(r * 0.66, r, 40), materials.tape);
    top.rotation.x = -Math.PI / 2; top.position.y = w / 2;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, w * 1.02, 32, 1, true), materials.tapeCore);
    materials.tapeCore.side = THREE.DoubleSide;
    g.add(outer, top, core);
    g.children.forEach((c) => { c.position.y += w / 2; c.castShadow = c.receiveShadow = true; });
    return g;
  }
  /** markerPen({ len, color }) -> a felt-tip marker lying along +X on the bench (cap coloured), pivot at its centre bottom. */
  function markerPen(o = {}) {
    const len = o.len ?? 1.1, r = o.r ?? 0.07, g = new THREE.Group();
    const capM = new THREE.MeshStandardMaterial({ color: col(o.color ?? "ink"), roughness: 0.45 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len * 0.7, 20), materials.penBody);
    body.rotation.z = Math.PI / 2; body.position.x = -len * 0.12;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, len * 0.32, 20), capM);
    cap.rotation.z = Math.PI / 2; cap.position.x = len * 0.37;
    const end = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.04, 20), capM);
    end.rotation.z = Math.PI / 2; end.position.x = -len * 0.47;
    g.add(body, cap, end);
    g.children.forEach((c) => { c.position.y = r; c.castShadow = c.receiveShadow = true; });
    return g;
  }

  // ---------------------------------------------------------------- per-pose stepping
  const lampBase = lights.lamp?.intensity ?? 0, bounceBase = lights.bounce?.intensity ?? 0;
  const lampProps = [];
  /** stepLights(i, level = 1): lamp + bounce + bulb at pose i with flicker. */
  function stepLights(i, level = 1) {
    const f = plan.flicker(i) * level;
    if (lights.lamp) lights.lamp.intensity = lampBase * f;
    if (lights.bounce) lights.bounce.intensity = bounceBase * f;
    for (const l of lampProps) l.userData.setLevel(f);
  }
  /** stepCamera(rig, tq, i): stepped camera: rig at pose time + per-pose hand jitter. */
  function stepCamera(rig, tq, i) {
    rig.update(tq);
    const j = plan.camJitter(i), cam = stage.camera;
    cam.position.x += j.x; cam.position.y += j.y; cam.position.z += j.z;
    cam.rotateZ(j.roll);
    cam.updateWorldMatrix(true, false);
  }
  /** jiggle(obj, i, seed, k): add per-pose placement error to obj's CURRENT pose (call after setting it from tq). */
  function jiggle(obj, i, seed, k = 1) {
    const j = plan.jitter(i, seed, k);
    obj.position.x += j.x; obj.position.y += j.y; obj.rotation.z += j.rot;
  }

  const props = {
    cutout, doodle, box, sign, splitPin, jointArm, puppet, wheel, arrow: arrowCut, tape, swapper, bench, backdrop, stick, tapeRoll, markerPen,
    lamp: (o) => { const l = lamp(o); lampProps.push(l); return l; },
    label: (text, o = {}) => doodle({ w: o.w ?? 2, h: o.h ?? 0.8, face: "whiteTop", ...o, draw: (h) => h.text(text, 0, (o.h ?? 0.8) / 2, o.cap ?? LT.cap, { color: o.color }) }),
  };
  const factories = {
    bench: (s) => bench(s.dims ?? {}),
    backdrop: (s) => backdrop(s.dims ?? {}),
  };

  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, sfx: spec.sfx,
    plan, motion: plan,
    helpers: { stepLights, stepCamera, jiggle, wonky, roundRectPts, circlePts, ellipsePts, gearPts, strokeOutline, printedFace },
    stepLights, stepCamera, jiggle,
    shapes: { roundRectPts, circlePts, ellipsePts, gearPts, wonky },
  };
}
