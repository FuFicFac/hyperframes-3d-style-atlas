// styles/spotlight-stage/style.js — "Spotlight Stage": a Victorian toy theatre seen from the stalls.
// Implements the style contract (references/kit-api.md §3).
//
// Stage frame: x across the stage, y up from the boards (y = 0), z toward the audience. Proscenium at
// z = 0, house curtain just behind it, backdrop at spec.stage.backdropZ, apron + footlights in front.
// Nothing animates itself: the scene calls curtain.userData.setOpen(u), spot.userData.aim(p)/setLevel(k),
// sign.userData.setDrop(y, swing) etc. from renderAt(t) with values from the pure cues in ./cues.js.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { configureShadow } from "../../kit/lights.js";
import { paintPixels, canvasTexture, printedMaterial, woodTexture, fbm2 } from "../../kit/textures.js";
import { FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, smoothstep, TAU } from "../../kit/time.js";
import { shapes, cardGeometry } from "../../kit/shapes.js";
import { sweepGeometry, rodGeometry } from "../../kit/paths.js";
import * as cues from "./cues.js";
import { followSpot as kitFollowSpot } from "../../kit/stagecraft.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, shapes, cues };

const HALF_PI = Math.PI / 2;

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, ST = spec.stage, O = ST.opening, F = ST.frame, V = spec.velvet, SP = spec.spots, PA = spec.paint;
  const col = (c) => P[c] ?? c;
  const headFont = spec.text.font, subFont = spec.text.subFont;

  // directional light targets must live in the scene graph
  for (const l of Object.values(lights)) if (l?.target && !l.target.parent) stage.scene.add(l.target);

  // ---- velvet: sheen colour + vertex-colour fold shading ----
  const velvet = materials.velvet;
  velvet.sheenColor = new THREE.Color(V.sheenColor);
  velvet.sheenRoughness = V.sheenRoughness;
  velvet.vertexColors = true;
  velvet.side = THREE.DoubleSide;
  velvet.needsUpdate = true;

  // ---- gouache grime multiplied over every painted face ----
  const grime = paintPixels(256, (u, v) => {
    const n = fbm2(u * 6, v * 6, { seed: 77, octaves: 4, period: 6 });
    const s = fbm2(u * 40, v * 3, { seed: 78, octaves: 2, period: 40 }); // brush drag
    return clamp(1 - PA.grime * (0.6 * n + 0.4 * s));
  });
  const paintOpts = (background) => ({ pxPerMetre: PA.pxPerMetre, background, colors: P, font: headFont, weight: spec.text.weight, textColor: P.ink, multiply: { canvas: grime, repeatPerMetre: 0.6 } });

  /** outline path of a shape (outer + holes) drawn into a print helper. */
  const tracePath = (h, shape) => (c) => {
    const draw = (pts) => { pts.forEach((p, i) => (i ? c.lineTo(h.X(p.x), h.Y(p.y)) : c.moveTo(h.X(p.x), h.Y(p.y)))); c.closePath(); };
    draw(shape.getPoints(32));
    for (const hole of shape.holes) draw(hole.getPoints(32));
  };

  // ---------------------------------------------------------------------------------------------
  // Painted card pieces (the cut-out vocabulary)
  // ---------------------------------------------------------------------------------------------
  /**
   * paintedCard(shape, { color = "cream", ink = true, hatch = null, draw = null, thickness, back = "plywood", castShadow = true })
   *   -> Mesh. Flat gouache colour, optional engraving hatch (hatch = { from: 0..1 across x, angle, spacing }),
   *   your extra artwork draw(h) (kit printTexture helper, shape metres), and an ink outline along the cut.
   */
  function paintedCard(shape, { color = "cream", ink = true, hatch = null, draw = null, thickness = PA.cardThickness, back = "plywood", castShadow = true, outline = PA.outline } = {}) {
    const { geo, bbox } = cardGeometry(shape, thickness, 24, true);
    const front = printedMaterial(materials.paint, bbox, (h) => {
      if (hatch) {
        const c = h.ctx, H = PA.hatch;
        c.save();
        c.beginPath(); tracePath(h, shape)(c); c.clip();
        const x0 = bbox.minX + bbox.w * (hatch.from ?? 0.55);
        c.beginPath(); c.rect(h.X(x0), 0, h.W, h.H); c.clip();
        c.strokeStyle = col(hatch.color ?? "ink");
        c.globalAlpha = hatch.alpha ?? H.alpha;
        c.lineWidth = H.width * h.s;
        const sp = (hatch.spacing ?? H.spacing) * h.s, a = hatch.angle ?? 0.9;
        const dx = Math.cos(a), dy = Math.sin(a), L = h.W + h.H;
        c.beginPath();
        for (let k = -L; k < L; k += sp) { c.moveTo(k * dy + dx * -L, -k * dx + dy * -L); c.lineTo(k * dy + dx * L, -k * dx + dy * L); }
        c.stroke();
        c.restore();
      }
      draw?.(h);
      if (ink) h.stroke(typeof ink === "string" ? ink : "ink", outline * 2, tracePath(h, shape));
    }, paintOpts(col(color)));
    const backMat = back === "plywood" ? materials.plywood : materials[back] ?? materials.plywood;
    const m = new THREE.Mesh(geo, [front, backMat, materials.plyEdge]);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.userData.bbox = bbox;
    m.userData.thickness = thickness;
    return m;
  }

  /**
   * cutout({ parts, stick = null | { dir = ±1, length = 7 }, base = true }) -> Group (origin bottom-centre, faces +Z)
   *   parts: [{ shape, color, ink?, hatch?, draw?, layer = i }] stacked front-to-back by layer (higher = nearer).
   *   stick: the Victorian toy-theatre slide wire running from the foot into the wing along x.
   */
  function cutout({ parts, stick = null, base = true } = {}) {
    const g = new THREE.Group();
    parts.forEach((p, i) => {
      const m = paintedCard(p.shape, p);
      m.position.z = (p.layer ?? i) * (PA.cardThickness + PA.layerGap);
      g.add(m);
    });
    if (base) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.16), materials.plywood);
      b.position.set(0, 0.035, -0.09);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    }
    if (stick) {
      const dir = stick.dir ?? 1, L = stick.length ?? 7;
      const r = new THREE.Mesh(rodGeometry([0, 0.05, -0.1], [dir * L, 0.05, -0.1], 0.012, 8), materials.wire);
      r.castShadow = true;
      g.add(r);
    }
    g.userData = { kind: "cutout" };
    return g;
  }

  /**
   * sceneryFlat({ shape | w,h, color, draw, hatch, ink, mount = "track"|"wire"|"none", wireTop = 9 }) -> Group
   *   A painted flat, origin bottom-centre. "track": a wooden foot + brace behind (slides on a floor track).
   *   "wire": two wires from the top corners up to world-ish height wireTop (relative to the flat's resting
   *   origin; userData.setWire(yNow) keeps them reaching the flies as it drops).
   */
  function sceneryFlat({ shape = null, w = 2, h = 2.4, color = "teal", draw = null, hatch = null, ink = true, mount = "track", wireTop = 9 } = {}) {
    const sh = shape ?? shapes.rect(w, h);
    const g = new THREE.Group();
    const card = paintedCard(sh, { color, draw, hatch, ink, thickness: 0.04 });
    g.add(card);
    const bb = card.userData.bbox;
    const wires = [];
    if (mount === "track") {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(Math.min(bb.w * 0.8, 1.2), 0.06, 0.34), materials.plywood);
      foot.position.set(0, 0.03, -0.17);
      const brace = paintedCard(shapes.poly([[0, 0], [0.34, 0], [0, Math.min(1.1, bb.h * 0.55)]]), { color: "plywood", ink: false, thickness: 0.025 });
      brace.rotation.y = HALF_PI;
      brace.position.set(0, 0, -0.03);
      foot.castShadow = foot.receiveShadow = true;
      g.add(foot, brace);
    } else if (mount === "wire") {
      for (const sx of [-1, 1]) {
        const wmesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 6).translate(0, 0.5, 0), materials.wire);
        wmesh.position.set(sx * bb.w * 0.36, bb.maxY, 0);
        wmesh.scale.y = Math.max(0.01, wireTop - bb.maxY);
        g.add(wmesh);
        wires.push(wmesh);
      }
    }
    g.userData = {
      kind: "flat", width: bb.w, height: bb.h, card,
      /** keep wires reaching y = wireTop (in the parent frame) when the flat hangs at height yNow. */
      setWire(yNow) { for (const wm of wires) wm.scale.y = Math.max(0.01, wireTop - yNow - bb.maxY); },
    };
    return g;
  }

  /**
   * foldingScreen({ panels = 3, panelW = .8, h = 2.4, fold = .38, color = "mustard", trim = "rouge", label = "", labelColor = "ink" }) -> Group
   *   Hinged painted screen, zig-zag folded (centre panel faces +Z, side panels angle back). Origin bottom-centre.
   */
  function foldingScreen({ panels = 3, panelW = 0.8, h = 2.4, fold = 0.38, color = "mustard", trim = "rouge", label = "", labelColor = "ink" } = {}) {
    const g = new THREE.Group();
    const mid = (panels - 1) / 2;
    const panel = (i) => paintedCard(shapes.roundRect(panelW, h, 0.08), {
      color, thickness: 0.035,
      draw: (hh) => {
        const ins = 0.09;
        hh.roundRect(-panelW / 2 + ins, ins, panelW - 2 * ins, h - 2 * ins, 0.06, trim);
        hh.roundRect(-panelW / 2 + ins + 0.04, ins + 0.04, panelW - 2 * ins - 0.08, h - 2 * ins - 0.08, 0.05, color);
        hh.stroke("ink", 0.012, (c) => c.roundRect(hh.X(-panelW / 2 + ins + 0.09), hh.Y(h - ins - 0.09), (panelW - 2 * ins - 0.18) * hh.s, (h - 2 * ins - 0.18) * hh.s, 0.04 * hh.s));
        if (i === Math.round(mid) && label) {
          hh.circle(0, h * 0.56, panelW * 0.36, "cream");
          hh.stroke("ink", 0.02, (c) => c.arc(hh.X(0), hh.Y(h * 0.56), panelW * 0.36 * hh.s, 0, TAU));
          hh.text(label, 0, h * 0.555, panelW * 0.6, { color: labelColor, font: headFont });
        }
      },
    });
    // centre panel at origin; neighbours hinge off its edges and angle back alternately
    const centre = panel(Math.round(mid));
    g.add(centre);
    for (const side of [-1, 1]) {
      let parent = centre;
      for (let k = 1; k <= mid; k++) {
        const hingeG = new THREE.Group();
        hingeG.position.x = side * panelW / 2;
        hingeG.rotation.y = side * fold * (k % 2 ? 1 : -1) * (k === 1 ? 1 : 2);
        const p = panel(Math.round(mid) + side * k);
        p.position.x = side * panelW / 2;
        hingeG.add(p);
        parent.add(hingeG);
        parent = p;
      }
    }
    g.userData = { kind: "flat", width: panels * panelW * Math.cos(fold), height: h };
    return g;
  }

  /** bubble({ text, w = 2.1, h = .8, tail = -0.35, color = "cream", textColor = "ink", size }) -> Mesh (origin at the tail tip). */
  function bubble({ text, w = 2.1, h = 0.8, tail = -0.35, color = "cream", textColor = "ink", size = null } = {}) {
    const tl = 0.32;
    const sh = shapes.bubble(w, h, 0.28, { tail: { x: tail, w: 0.3, len: tl, at: tail * 0.5 } });
    return paintedCard(sh, {
      color, thickness: 0.03,
      draw: (hh) => {
        let s = size ?? h * 0.46;
        const wm = hh.measure(text, s, { font: headFont });
        if (wm > w - 0.34) s *= (w - 0.34) / wm;
        hh.text(text, 0, tl + h / 2 - s * 0.03, s, { color: textColor, font: headFont });
      },
    });
  }

  /**
   * hangingSign({ text, sub = "", w = 5.8, h = 1.4, color = "parchment", border = "rouge", textColor = "ink", subColor = "rouge", wireTop = 9 })
   *   -> Group whose origin is the hang point (top-centre of the board). Multi-line text with "\n". The theatrical
   *   serif auto-fits the board. userData.setDrop(y, swing) sets the hang height and the pendulum angle.
   */
  function hangingSign({ text, sub = "", w = 5.8, h = 1.4, color = "parchment", border = "rouge", textColor = "ink", subColor = "rouge", wireTop = 9 } = {}) {
    const g = new THREE.Group();
    const lines = String(text).split("\n");
    const board = paintedCard(shapes.roundRect(w, h, 0.12, { y: -h }), {
      color, thickness: 0.05, ink: false, back: "plywood",
      draw: (hh) => {
        const b = 0.11;
        hh.roundRect(-w / 2, -h, w, h, 0.12, border);
        hh.roundRect(-w / 2 + b, -h + b, w - 2 * b, h - 2 * b, 0.07, color);
        hh.stroke("goldDeep", 0.018, (c) => c.roundRect(hh.X(-w / 2 + b + 0.06), hh.Y(-b - 0.06), (w - 2 * b - 0.12) * hh.s, (h - 2 * b - 0.12) * hh.s, 0.05 * hh.s));
        for (const sx of [-1, 1]) for (const sy of [0, 1]) {               // corner diamonds
          const cx = sx * (w / 2 - b - 0.2), cy = sy ? -b - 0.2 : -h + b + 0.2, r = 0.07;
          hh.fill(border, (c) => { c.moveTo(hh.X(cx), hh.Y(cy + r)); c.lineTo(hh.X(cx + r), hh.Y(cy)); c.lineTo(hh.X(cx), hh.Y(cy - r)); c.lineTo(hh.X(cx - r), hh.Y(cy)); c.closePath(); });
        }
        const subH = sub ? h * 0.2 : 0;
        const availW = w - 2 * b - 0.75, availH = h - 2 * b - 0.3 - subH * 1.15;
        let s = Math.min(availH / (lines.length * 1.08), h * 0.5);
        for (const ln of lines) { const m = hh.measure(ln, s, { font: headFont }); if (m > availW) s *= availW / m; }
        const block = lines.length * s * 1.08 + (sub ? subH * 1.15 : 0);
        let y = -h / 2 + block / 2 - s * 0.54;
        for (const ln of lines) { hh.text(ln, 0, y, s, { color: textColor, font: headFont }); y -= s * 1.08; }
        if (sub) {
          const yy = y + s * 0.54 - subH * 0.62;
          hh.text(sub, 0, yy, subH, { color: subColor, font: subFont, italic: true });
          const sw = hh.measure(sub, subH, { font: subFont }) / 2 + 0.25;
          for (const sx of [-1, 1]) hh.rect(sx > 0 ? sw : -sw - 0.6, yy - 0.012, 0.6, 0.024, subColor);
        }
      },
    });
    board.material[2] = materials.gold; // gilded cut edge
    g.add(board);
    const wires = [];
    for (const sx of [-1, 1]) {
      const wm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 6).translate(0, 0.5, 0), materials.wire);
      wm.position.set(sx * (w / 2 - 0.45), 0, 0);
      g.add(wm);
      wires.push(wm);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 14), materials.gold);
      ring.position.set(sx * (w / 2 - 0.45), 0.02, 0.03);
      g.add(ring);
    }
    g.userData = {
      kind: "sign", width: w, height: h,
      setDrop(y, swing = 0) {
        g.position.y = y;
        g.rotation.z = swing;
        for (const wm of wires) wm.scale.y = Math.max(0.01, wireTop - y);
        g.visible = y - h < wireTop - 0.05;
      },
    };
    g.userData.setDrop(wireTop + h);
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // The house: proscenium, floor, masking, backdrop, curtains, footlights, audience
  // ---------------------------------------------------------------------------------------------
  /** arch outline (points) of the opening offset outward by d; bottom at y0. */
  function archPts(d, y0, n = 40) {
    const hw = O.width / 2 + d, rise = O.archRise + d * 0.6, top = O.height + d;
    const pts = [[-hw, y0], [-hw, top - rise]];
    for (let i = 1; i < n; i++) { const a = Math.PI - (i / n) * Math.PI; pts.push([hw * Math.cos(a), top - rise + rise * Math.sin(a)]); }
    pts.push([hw, top - rise], [hw, y0]);
    return pts;
  }

  function damaskTexture() {
    const T = spec.textures.wall;
    const base = new THREE.Color(P.houseWall), hi = new THREE.Color("#5a1822"), lo = new THREE.Color("#2a070d");
    const c = paintPixels(T.size, (u, v) => {
      const du = Math.abs(((u * 4) % 1) - 0.5), dv = Math.abs(((v * 3 + (Math.floor(u * 4) % 2) * 0.5) % 1) - 0.5);
      const lozenge = du * 1.5 + dv;
      const motif = smoothstep(0.42, 0.36, lozenge) * smoothstep(0.18, 0.24, lozenge) + smoothstep(0.08, 0.04, lozenge);
      const n = fbm2(u * 8, v * 8, { seed: T.seed, octaves: 3, period: 8 });
      const k = clamp(0.5 + motif * 0.35 + (n - 0.5) * 0.35);
      const a = k < 0.5 ? lo : base, b = k < 0.5 ? base : hi, kk = k < 0.5 ? k * 2 : (k - 0.5) * 2;
      return [lerp(a.r, b.r, kk), lerp(a.g, b.g, kk), lerp(a.b, b.b, kk)];
    });
    return canvasTexture(c, { repeat: [1, 1] });
  }

  /**
   * proscenium() -> Group: damask house wall with the arch cut out, a bevelled gilded frame, a projecting
   * gilded bead around the opening, a cartouche crest and two gilt columns. Faces +Z at z ≈ wall.z.
   */
  function proscenium() {
    const g = new THREE.Group();
    g.name = "proscenium";
    const yb = -ST.floor.drop;
    // wall: one simple polygon notched around the frame (holes touching the outline do not triangulate)
    const W = ST.wall;
    const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
    const ring = (dOut, dIn, y0) => shapes.poly([...archPts(dOut, y0), ...archPts(dIn, y0).reverse()]);
    const wallPts = [[-W.width / 2, yb], ...archPts(F.width * 0.9, yb), [W.width / 2, yb], [W.width / 2, yb + W.height], [-W.width / 2, yb + W.height]];
    const wallGeo = new THREE.ShapeGeometry(new THREE.Shape(V2(wallPts)), 24);
    const wallMat = materials.houseWall;
    wallMat.map = damaskTexture();
    wallMat.map.repeat.set(1 / spec.textures.wall.metres, 1 / spec.textures.wall.metres); // ShapeGeometry UVs are metres
    wallMat.needsUpdate = true;
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.z = W.z;
    wall.receiveShadow = true;
    g.add(wall);
    // gilded frame (a U-shaped band: outer arch out, inner arch back)
    const frameGeo = new THREE.ExtrudeGeometry(ring(F.width, 0, yb), { depth: F.depth, bevelEnabled: true, bevelThickness: F.bevel, bevelSize: F.bevel, bevelSegments: 4, curveSegments: 24 });
    const frame = new THREE.Mesh(frameGeo, materials.gold);
    frame.position.z = W.z;
    frame.castShadow = frame.receiveShadow = true;
    g.add(frame);
    // projecting bead around the opening
    const bead = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(F.bead, -0.02, yb), { depth: F.beadDepth, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 4, curveSegments: 24 }), materials.gold);
    bead.position.z = W.z;
    bead.castShadow = bead.receiveShadow = true;
    g.add(bead);
    // inner dark reveal (thickness of the arch seen inside the opening)
    const reveal = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(0.03, -0.04, yb), { depth: 0.6, bevelEnabled: false, curveSegments: 24 }), materials.goldDeep);
    reveal.position.z = W.z - 0.6;
    g.add(reveal);
    // cartouche crest
    const top = O.height + F.width;
    const cart = new THREE.Mesh(new THREE.ExtrudeGeometry(shapes.scallop(F.cartoucheR, 16, 0.1, { y: 0 }), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12 }), materials.gold);
    cart.position.set(0, top + 0.05, W.z + F.depth);
    cart.castShadow = true;
    g.add(cart);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(F.cartoucheR * 0.62, F.cartoucheR * 0.62, 0.06, 40), materials.velvet);
    disc.rotation.x = HALF_PI;
    disc.position.set(0, top + 0.05, W.z + F.depth + 0.22);
    const discCol = new Float32Array(disc.geometry.attributes.position.count * 3).fill(0.9);
    disc.geometry.setAttribute("color", new THREE.BufferAttribute(discCol, 3));
    g.add(disc);
    const starM = new THREE.Mesh(new THREE.ExtrudeGeometry(shapes.star(F.cartoucheR * 0.45, F.cartoucheR * 0.18, 5), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }), materials.gold);
    starM.position.set(0, top + 0.05, W.z + F.depth + 0.25);
    g.add(starM);
    // columns
    const cx = O.width / 2 + F.width + F.columnR + 0.16, ch = O.height + F.width * 0.5 - yb;
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(F.columnR, F.columnR * 1.08, ch, 28), materials.gold);
      c.position.set(s * cx, yb + ch / 2, W.z + F.columnR + 0.05);
      c.castShadow = c.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(F.columnR * 3, 0.22, F.columnR * 3), materials.gold);
      cap.position.set(s * cx, yb + ch + 0.11, W.z + F.columnR + 0.05);
      const base = cap.clone();
      base.position.y = 0.11 - 0.0;
      cap.castShadow = base.castShadow = true;
      g.add(c, cap, base);
    }
    return g;
  }

  /**
   * stageFloor({ width = 14, tracks = [] }) -> Group: plank boards (y = 0) from the backdrop to the apron lip,
   * a dark apron front with a gilt edge, optional floor tracks (grooves along x at the given z's).
   */
  function stageFloor({ width = 14, tracks = [] } = {}) {
    const FL = ST.floor, T = spec.textures.boards;
    const g = new THREE.Group();
    const depth = FL.depth + FL.apron;
    const tex = woodTexture({ size: T.size, boards: T.boards, seed: T.seed, grainFreq: T.grainFreq, grainWarp: T.grainWarp, contrast: T.contrast, dark: P.boardsDark, mid: P.boards, light: P.boardsLight, seam: P.seam });
    tex.center.set(0.5, 0.5);
    tex.rotation = HALF_PI; // boards run up/down stage
    tex.repeat.set(depth / T.metres, width / T.metres);
    const boards = materials.boards;
    boards.map = tex;
    if (boards.bumpMap) boards.bumpMap.repeat.set(width / 2, depth / 2);
    boards.needsUpdate = true;
    const geo = new THREE.BoxGeometry(width, FL.drop, depth);
    const slab = new THREE.Mesh(geo, [materials.apron, materials.apron, boards, materials.apron, materials.apron, materials.apron]);
    slab.position.set(0, -FL.drop / 2, FL.apron - depth / 2);
    slab.receiveShadow = true;
    g.add(slab);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.07), materials.gold);
    lip.position.set(0, -0.035, FL.apron + 0.01);
    g.add(lip);
    for (const z of tracks) {
      const tr = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.035), new THREE.MeshBasicMaterial({ color: P.seam, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      tr.rotation.x = -HALF_PI;
      tr.position.set(0, 0.001, z);
      g.add(tr);
    }
    return g;
  }

  /** masking() -> Group: black velour legs at the side of each wing depth (hide flats waiting offstage). */
  function masking() {
    const g = new THREE.Group();
    const M = ST.masking;
    for (const z of M.depths) for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.PlaneGeometry(M.legW, 7), materials.masking);
      leg.position.set(s * (M.legX + M.legW / 2), 3.5, z);
      leg.receiveShadow = true;
      g.add(leg);
    }
    return g;
  }

  const painters = {
    /** night sky, moon, stars, clouds, rolling hills and a chimneyed town: generic Victorian drop. */
    night(h, w, hh, seed = 5) {
      const r = rng(seed);
      const c = h.ctx;
      const grd = c.createLinearGradient(0, 0, 0, h.H);
      grd.addColorStop(0, P.night); grd.addColorStop(0.75, P.nightLight); grd.addColorStop(1, "#8fa6c4");
      c.fillStyle = grd; c.fillRect(0, 0, h.W, h.H);
      for (let i = 0; i < 70; i++) h.circle(r.range(-w / 2, w / 2), r.range(hh * 0.45, hh * 0.98), r.range(0.012, 0.03), "moon");
      h.circle(w * 0.3, hh * 0.78, 0.55, "moon");
      h.circle(w * 0.3 + 0.22, hh * 0.78 + 0.12, 0.5, "night");
      for (let i = 0; i < 4; i++) {                                // painted cloud wisps
        const cx = r.range(-w / 2, w / 2), cy = r.range(hh * 0.55, hh * 0.85);
        c.globalAlpha = 0.5;
        for (let k = 0; k < 3; k++) h.fill("slateLight", (g2) => g2.ellipse(h.X(cx + (k - 1) * 0.55), h.Y(cy + k * 0.04), (0.7 - k * 0.12) * h.s, 0.07 * h.s, 0, 0, TAU));
        c.globalAlpha = 1;
      }
      // town skyline
      let x = -w / 2;
      while (x < w / 2) {
        const bw = r.range(0.4, 0.9), bh = r.range(0.6, 1.5);
        h.rect(x, 0, bw, hh * 0.18 + bh, "city");
        if (r.chance(0.45)) h.rect(x + bw * 0.6, hh * 0.18 + bh, 0.12, r.range(0.4, 0.9), "city");
        for (let k = 0; k < 4; k++) if (r.chance(0.5)) h.rect(x + 0.1 + k * 0.18, hh * 0.18 + bh * r.range(0.2, 0.8), 0.07, 0.1, "mustard");
        x += bw + r.range(0, 0.15);
      }
      // hills
      h.fill("hills", (g2) => { g2.moveTo(h.X(-w / 2), h.Y(0)); for (let i = 0; i <= 40; i++) { const u = i / 40; g2.lineTo(h.X(-w / 2 + u * w), h.Y(hh * 0.16 + 0.35 * Math.sin(u * 7 + 1) + 0.18 * Math.sin(u * 17))); } g2.lineTo(h.X(w / 2), h.Y(0)); g2.closePath(); });
    },
  };

  /** backdrop({ w = 11.5, h = 6.5, paint = "night" | (h, w, hh) => void, seed }) -> Mesh: the painted cloth at backdropZ. */
  function backdrop({ w = 11.5, h = 6.5, paint = "night", seed = 5 } = {}) {
    const bbox = { minX: -w / 2, maxX: w / 2, minY: 0, maxY: h, w, h };
    const fn = typeof paint === "function" ? paint : painters[paint];
    const mat = printedMaterial(materials.backdrop, bbox, (hp) => fn(hp, w, h, seed), { ...paintOpts(P.night), pxPerMetre: 150 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(0, h / 2, ST.backdropZ);
    m.receiveShadow = true;
    m.name = "backdrop";
    return m;
  }

  /**
   * curtain({ width, height, z = -0.3, seed = 3 }) -> Group: the two-half house curtain (pleated velvet).
   * userData.setOpen(u): 0 = closed (halves meet at x = 0), 1 = fully gathered into the wings with swag.
   */
  function curtain({ width = O.width, height = O.height + 0.25, z = -0.3, seed = 3 } = {}) {
    const g = new THREE.Group();
    g.name = "curtain";
    const [sx, sy] = V.segments;
    const outer = width / 2 + 0.55;
    const halves = [-1, 1].map((side, k) => {
      const geo = new THREE.PlaneGeometry(1, 1, sx, sy);
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
      const mesh = new THREE.Mesh(geo, velvet);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.z = z - k * 0.05;
      g.add(mesh);
      const r = rng(seed * 31 + k);
      const amps = Array.from({ length: V.folds + 2 }, () => r.range(0.7, 1.3));
      return { side, geo, mesh, amps, phase: r.range(0, TAU), wav: r.range(0.5, 1.5) };
    });
    let last = -1;
    function setOpen(u) {
      u = clamp(u, 0, 1);
      if (Math.abs(u - last) < 1e-7) return;
      last = u;
      for (const hf of halves) {
        const pos = hf.geo.attributes.position, colA = hf.geo.attributes.color, s = hf.side;
        for (let iy = 0; iy <= sy; iy++) {
          const v = 1 - iy / sy;
          const uo = clamp((u - 0.1 * (1 - v)) / 0.9);                // bottom lags the track
          const gap = lerp(V.openGap[0], V.openGap[1], smoothstep(0, 1, v)) - 0.22 * Math.exp(-(((v - 0.33) / 0.16) ** 2)) * uo;
          const xi = lerp(s * -0.04, s * (width / 2 - gap), uo);
          const comp = Math.abs(xi - s * outer) / (outer + 0.04);       // 1 closed .. small gathered
          const A = V.foldDepth * lerp(V.gatherGrow, 1, comp) * (1 + 0.25 * (1 - v));
          for (let ix = 0; ix <= sx; ix++) {
            const a = s < 0 ? ix / sx : 1 - ix / sx;                     // 0 at the outer edge, 1 at the inner edge
            const fi = a * V.folds;
            const amp = lerp(hf.amps[Math.floor(fi)], hf.amps[Math.floor(fi) + 1], fi - Math.floor(fi));
            const th = TAU * fi + hf.phase + 0.5 * Math.sin(v * 2.3 * hf.wav + hf.phase) * (1 - 0.5 * comp);
            const fold = Math.sin(th) + 0.22 * Math.sin(2 * th + 1.1);
            const x = lerp(s * outer, xi, a);
            const lift = V.hemLift * uo * (1 - v) ** 2 * a ** 1.5;
            const y = v * height + lift * (1 - v);
            const i = iy * (sx + 1) + ix;
            pos.setXYZ(i, x, y, A * amp * fold);
            const shade = 1 - V.valleyShade * (0.5 - 0.5 * fold / 1.22);
            colA.setXYZ(i, shade, shade, shade);
          }
        }
        pos.needsUpdate = colA.needsUpdate = true;
        hf.geo.computeVertexNormals();
        hf.geo.computeBoundingSphere();
      }
    }
    setOpen(0);
    g.userData = { setOpen };
    return g;
  }

  /** valance({ width, z = -0.12 }) -> Group: the fixed swagged border across the top, with gold fringe and tassels. */
  function valance({ width = O.width + 1.4, z = -0.12 } = {}) {
    const VA = V.valance;
    const g = new THREE.Group();
    const topY = O.height + 0.3, nx = 200, ny = 14;
    const geo = new THREE.PlaneGeometry(1, 1, nx, ny);
    const pos = geo.attributes.position, colArr = new Float32Array(pos.count * 3);
    const hem = [];
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const v = 1 - iy / ny, a = ix / nx;
      const s = (a * VA.swags) % 1;
      const dip = VA.sag * Math.sin(Math.PI * s);
      const bottom = topY - VA.height - dip;
      const y = lerp(bottom, topY, v);
      const fold = Math.sin(TAU * VA.folds * a);
      const zz = VA.foldDepth * fold * (1 - 0.6 * v) + 0.14 * Math.sin(Math.PI * s) * (1 - v) ** 1.5;
      pos.setXYZ(iy * (nx + 1) + ix, (a - 0.5) * width, y, zz);
      const shade = 1 - V.valleyShade * (0.5 - 0.5 * fold) * (1 - 0.5 * v);
      colArr.set([shade, shade, shade], (iy * (nx + 1) + ix) * 3);
      if (iy === ny) hem.push([(a - 0.5) * width, y - 0.01, z + zz]);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, velvet);
    m.position.z = z;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    const fringe = new THREE.Mesh(sweepGeometry(hem, VA.fringe, 8), materials.gold);
    fringe.castShadow = true;
    g.add(fringe);
    for (let k = 0; k <= VA.swags; k++) {
      const x = (k / VA.swags - 0.5) * width, y = topY - VA.height;
      const tas = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 12), materials.gold);
      tas.position.set(x, y - 0.17, z + 0.06);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), materials.gold);
      knob.position.set(x, y + 0.02, z + 0.06);
      tas.castShadow = true;
      g.add(tas, knob);
    }
    return g;
  }

  /**
   * footlights({ width = O.width - .4, z = apron - .22 }) -> Group: a hooded trough of amber bulbs along the
   * apron edge plus a few real point lights shining up. userData.setLevel(k) (0..1+).
   */
  function footlights({ width = O.width - 0.4, z = ST.floor.apron - 0.22 } = {}) {
    const FT = spec.footlights;
    const g = new THREE.Group();
    const hood = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, FT.height, 0.06), materials.hood);
    hood.position.set(0, FT.height / 2, z + 0.14);
    hood.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.03, 0.3), materials.hood);
    back.position.set(0, 0.015, z);
    g.add(hood, back);
    const bulbMat = materials.bulb.clone();
    const base = bulbMat.emissiveIntensity;
    const bulbGeo = new THREE.SphereGeometry(0.06, 14, 10);
    for (let i = 0; i < FT.count; i++) {
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(lerp(-width / 2, width / 2, i / (FT.count - 1)), 0.09, z);
      g.add(b);
    }
    const pls = [];
    for (let i = 0; i < FT.lights; i++) {
      const pl = new THREE.PointLight(FT.color, FT.intensity, FT.distance, 2);
      pl.position.set(lerp(-width / 2 + 1, width / 2 - 1, FT.lights > 1 ? i / (FT.lights - 1) : 0.5), 0.35, z - 0.05);
      g.add(pl);
      pls.push(pl);
    }
    g.userData = {
      setLevel(k) {
        for (const pl of pls) pl.intensity = FT.intensity * k;
        bulbMat.emissiveIntensity = base * k;
      },
    };
    return g;
  }

  // followSpot (+ its beam shader): kit/stagecraft.js (promoted, identical code); style values passed as defaults
  const followSpot = (o = {}) => kitFollowSpot({ color: P.spot, beamOpacity: SP.beamOpacity, penumbra: SP.penumbra, beamSoftness: SP.beamSoftness, dust: SP.dust, dustScale: SP.dustScale, softness: SP.softness, mapSize: SP.mapSize, ...o });

  /**
   * audience({ perRow = 9, rows = 2, width = 11, z = 3.4, rowGap = 1.1, scale = 1.25, seed = 9 }) -> Group
   *   Front-row head-and-shoulder silhouettes (top hats, bowlers, bonnets, buns) on the auditorium floor.
   */
  function audience({ perRow = 9, rows = 2, width = 11, z = 3.4, rowGap = 1.1, scale = 1.25, seed = 9 } = {}) {
    const g = new THREE.Group();
    const r = rng(seed);
    const yb = -ST.floor.drop;
    const mat = materials.audience;
    const mk = (shape) => { const { geo } = cardGeometry(shape, 0.04, 16); return new THREE.Mesh(geo, mat); };
    for (let row = 0; row < rows; row++) for (let i = 0; i < perRow; i++) {
      const p = new THREE.Group();
      const x = (i / (perRow - 1) - 0.5) * width + r.range(-0.25, 0.25) + (row % 2) * 0.5;
      const sh = r.range(0.95, 1.08);
      p.add(mk(shapes.roundRect(0.62 * sh, 0.5, 0.2, { y: 0 })));
      p.add(mk(shapes.rect(0.13, 0.18, { y: 0.42 })));
      const hy = 0.72;
      p.add(mk(shapes.ellipse(0.13 * sh, 0.16, { y: hy })));
      const hat = r.int(0, 4);
      if (hat === 0) { p.add(mk(shapes.rect(0.36, 0.04, { y: hy + 0.1 }))); p.add(mk(shapes.rect(0.22, 0.26, { y: hy + 0.12 }))); }
      else if (hat === 1) { p.add(mk(shapes.rect(0.34, 0.035, { y: hy + 0.1 }))); p.add(mk(shapes.ellipse(0.13, 0.11, { y: hy + 0.14 }))); }
      else if (hat === 2) { p.add(mk(shapes.ellipse(0.2, 0.17, { y: hy + 0.06 }))); p.add(mk(shapes.ellipse(0.05, 0.13, { x: 0.15, y: hy + 0.2, rot: -0.6 }))); }
      else if (hat === 3) p.add(mk(shapes.circle(0.08, { y: hy + 0.17 })));
      p.scale.setScalar(scale * r.range(0.95, 1.05));
      p.position.set(x, yb + 0.55 + row * 0.22, z + row * rowGap);
      p.rotation.z = r.range(-0.06, 0.06);
      g.add(p);
    }
    g.name = "audience";
    return g;
  }

  /**
   * theatre({ tracks = [], paint = "night", seed = 3 }) -> Group: the whole fixed house (proscenium, floor,
   * masking, backdrop, curtain, valance, footlights). userData: { curtain, footlights, backdrop, floor }.
   */
  function theatre({ tracks = [], paint = "night", seed = 3 } = {}) {
    const g = new THREE.Group();
    g.name = "theatre";
    const pros = proscenium(), floor = stageFloor({ tracks }), mask = masking(), bd = backdrop({ paint, seed });
    const cur = curtain({ seed }), val = valance(), foot = footlights();
    g.add(pros, floor, mask, bd, cur, val, foot);
    g.userData = { curtain: cur, footlights: foot, backdrop: bd, floor, proscenium: pros, valance: val };
    return g;
  }

  const props = { theatre, proscenium, stageFloor, masking, backdrop, curtain, valance, footlights, followSpot, audience, paintedCard, cutout, sceneryFlat, foldingScreen, bubble, hangingSign };
  const factories = {
    theatre: (o) => theatre(o.dims ?? {}),
    audience: (o) => audience(o.dims ?? {}),
  };
  const textStyle = { font: headFont, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, shapes, motion: cues, painters, sfx: spec.sfx,
  };
}
