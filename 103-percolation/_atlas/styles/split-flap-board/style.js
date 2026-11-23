// styles/split-flap-board/style.js — "Split-Flap Board": a mechanical departure board in a dim hall.
// Implements the style contract (references/kit-api.md §3).
//
// Board frame: the face is the XY plane, the flap hinge plane is z = 0, +Z faces the viewer, origin at
// the board centre. Every cell is a true split-flap: static top half + static bottom half + one flap
// that rotates about the axle (angle 0 = up, PI = down). Character halves come from ONE glyph atlas
// (each glyph drawn as a whole flap face); a vertex-shader remap picks the glyph per instance, so the
// halves of a character line up exactly across the axle gap.
//
// Nothing animates itself: scenes call board.userData.update(t) from renderAt(t). Flip state comes from
// the pure planner in ./flaps.js (also imported by scene.config.js so the SCORE follows the picture).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { makeCanvas, canvasTexture, paintPixels, fbm2, noiseTexture } from "../../kit/textures.js";
import { createTextLabel } from "../../kit/text.js";
import { hash01, clamp, lerp } from "../../kit/time.js";
import * as FLAPS from "./flaps.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, FLAPS };

const PI = Math.PI;

/**
 * createStyle(stage, opts?) -> style        opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, B = spec.board, A = spec.atlas, TUNE = spec.tuning, L = spec.lamps;
  const col = (c) => P[c] ?? c;
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------------------------------------
  // Surface textures: brushed aluminium streaks, hall wall
  // ---------------------------------------------------------------------------------------------
  const TB = spec.textures.brushed;
  const brushedCanvas = paintPixels(TB.size, (u, v) => {
    const n = fbm2(u * 3, v * TB.streak, { seed: TB.seed, octaves: 3, period: 4096 });
    const fine = fbm2(u * 40, v * TB.streak * 3, { seed: TB.seed + 1, octaves: 2, period: 4096 });
    return clamp(0.78 + TB.contrast * (n - 0.5) * 2 + 0.08 * (fine - 0.5));
  });
  const brushedMap = canvasTexture(brushedCanvas, { repeat: [0.35, 0.35] });
  const brushedRough = canvasTexture(brushedCanvas, { repeat: [0.35, 0.35], srgb: false });
  for (const t of [brushedMap, brushedRough]) t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  const brushed = materials.brushed;
  brushed.map = brushedMap;
  brushed.roughnessMap = brushedRough;
  if ("anisotropy" in brushed) brushed.anisotropy = spec.brushedAnisotropy;
  brushed.needsUpdate = true;
  materials.frame.map = brushedMap;
  materials.frame.needsUpdate = true;
  if (materials.housing.bumpMap) materials.housing.bumpMap.repeat.set(1.2, 1.2);
  const wallTex = noiseTexture({ ...spec.textures.wall, repeat: [3, 2] });
  materials.wall.map = wallTex;
  materials.wall.needsUpdate = true;

  // ---------------------------------------------------------------------------------------------
  // Glyph atlas: one whole flap face per character (+ one solid "edge" cell for flap rims)
  // ---------------------------------------------------------------------------------------------
  function glyphAtlas() {
    const cs = A.charset, n = cs.length + 1, edge = cs.length;
    const cols = A.cols, rows = Math.ceil(n / cols), [cw, chh] = A.cellPx;
    const c = makeCanvas(cols * cw, rows * chh);
    const ctx = c.getContext("2d");
    // cap height of the font at 100 px -> font size for the requested cap height
    ctx.font = `${A.weight} 100px ${A.font}`;
    const capRatio = (ctx.measureText("H").actualBoundingBoxAscent || 70) / 100;
    const px = (A.capHeight * chh) / capRatio;
    const cap = A.capHeight * chh;
    for (let g = 0; g < n; g++) {
      const ox = (g % cols) * cw, oy = Math.floor(g / cols) * chh, mid = oy + chh / 2;
      if (g === edge) {
        ctx.fillStyle = P.edge;
        ctx.fillRect(ox, oy, cw, chh);
        continue;
      }
      // flap face: lighter toward the outer edges, shaded toward the axle (hinge occlusion)
      const sh = A.hingeShade;
      const gt = ctx.createLinearGradient(0, oy, 0, mid);
      gt.addColorStop(0, P.flapLight);
      gt.addColorStop(0.75, P.flap);
      gt.addColorStop(1, `rgba(6,6,7,${0.6 + sh})`);
      ctx.fillStyle = P.flap;
      ctx.fillRect(ox, oy, cw, chh);
      ctx.fillStyle = gt;
      ctx.fillRect(ox, oy, cw, chh / 2);
      const gb = ctx.createLinearGradient(0, mid, 0, oy + chh);
      gb.addColorStop(0, `rgba(6,6,7,${0.6 + sh})`);
      gb.addColorStop(0.22, P.flap);
      gb.addColorStop(1, P.flapLight);
      ctx.fillStyle = gb;
      ctx.fillRect(ox, mid, cw, chh / 2);
      // worn rim lines at the outer edges (catch light at the flap's free edge)
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(ox, oy, cw, 3);
      ctx.fillRect(ox, oy + chh - 3, cw, 3);
      const ch = cs[g];
      if (ch === " ") continue;
      ctx.save();
      ctx.font = `${A.weight} ${px}px ${A.font}`;
      const w = ctx.measureText(ch).width;
      const sx = Math.min(1, (A.glyphWidth * cw) / Math.max(1, w));
      ctx.translate(ox + cw / 2, mid + cap / 2);
      ctx.scale(sx, 1);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = P.glyph;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
    const texture = canvasTexture(c, { anisotropy: 8 });
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return { texture, canvas: c, charset: cs, cols, rows, edge, cellPx: [cw, chh] };
  }
  const atlas = glyphAtlas();

  /** The flap material: map = atlas, per-instance glyph pick in the vertex shader (aGlyph, aSide). */
  function flapMaterial(base = materials.flap) {
    const m = base.clone();
    m.map = atlas.texture;
    const inset = (1.5 / atlas.cellPx[0]).toFixed(5), insetV = (1.5 / atlas.cellPx[1]).toFixed(5);
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aSide;\nattribute vec2 aGlyph;")
        .replace("#include <uv_vertex>", `#include <uv_vertex>
#ifdef USE_MAP
{
  float gi = aSide < 0.5 ? aGlyph.x : (aSide < 1.5 ? aGlyph.y : ${atlas.edge}.0);
  gi = floor(gi + 0.5);
  vec2 gc = vec2(mod(gi, ${atlas.cols}.0), floor(gi / ${atlas.cols}.0));
  vec2 uu = clamp(uv, vec2(${inset}, ${insetV}), vec2(1.0 - ${inset}, 1.0 - ${insetV}));
  vMapUv = vec2((gc.x + uu.x) / ${atlas.cols}.0, 1.0 - (gc.y + 1.0 - uu.y) / ${atlas.rows}.0);
}
#endif`);
    };
    m.customProgramCacheKey = () => `split-flap-atlas-${atlas.cols}x${atlas.rows}`;
    return m;
  }
  const flapMat = flapMaterial();

  // ---------------------------------------------------------------------------------------------
  // Flap geometry (cell-local, axle on the X axis at y = 0, z = 0)
  // ---------------------------------------------------------------------------------------------
  /** Half-flap outline: y from inner (axle side) to outer edge, outer corners rounded. */
  function halfShape(w, yIn, yOut, r) {
    const s = new THREE.Shape(), d = Math.sign(yOut - yIn);
    s.moveTo(-w / 2, yIn);
    s.lineTo(w / 2, yIn);
    s.lineTo(w / 2, yOut - d * r);
    s.quadraticCurveTo(w / 2, yOut, w / 2 - r, yOut);
    s.lineTo(-w / 2 + r, yOut);
    s.quadraticCurveTo(-w / 2, yOut, -w / 2, yOut - d * r);
    s.closePath();
    return s;
  }
  /** Flat face from a shape: z, facing ±Z, uv v = vOf(y) in glyph-cell units, aSide. */
  function faceGeo(shape, z, facing, vOf, side) {
    const g = new THREE.ShapeGeometry(shape, 4);
    const pos = g.attributes.position, uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, z);
      uv.setXY(i, (x + B.cellW / 2) / B.cellW, vOf(y));
      nrm.setXYZ(i, 0, 0, facing);
    }
    // ShapeGeometry winds CCW toward +Z; flip for a -Z face
    if (facing < 0 && shape) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(new Array(pos.count).fill(side), 1));
    return g;
  }
  const W = B.cellW, H = B.cellH, gap = B.axleGap / 2, R = B.flapCorner, T = B.flapThickness;
  const vFront = (y) => 0.5 + y / H;   // static halves and the flap front: glyph v follows y
  const vBack = (y) => 0.5 - y / H;    // flap back: after the half-turn, local y maps to world -y
  const geoTop = faceGeo(halfShape(W, gap, H / 2, R), -0.007, 1, vFront, 0);
  const geoBottom = faceGeo(halfShape(W, -gap, -H / 2, R), -0.007, 1, vFront, 0);
  const flapFront = faceGeo(halfShape(W, gap, H / 2, R), T / 2, 1, vFront, 0);
  const flapBack = faceGeo(halfShape(W, gap, H / 2, R), -T / 2, -1, vBack, 1);
  // rim: the free edge of the flap (faces +Y when up) — samples the solid edge cell
  const rim = new THREE.PlaneGeometry(W - 2 * R, T);
  rim.rotateX(-PI / 2);
  rim.translate(0, H / 2, 0);
  rim.setAttribute("aSide", new THREE.Float32BufferAttribute(new Array(rim.attributes.position.count).fill(2), 1));
  const geoFlap = mergeGeometries([flapFront, flapBack, rim]);

  // ---------------------------------------------------------------------------------------------
  // Flap bank: all cells of a layout as instanced meshes
  // ---------------------------------------------------------------------------------------------
  /**
   * flapBank(layout) -> Group { userData: { cellMatrix[i], write(i, state), commit() } }
   *   Instanced: static tops, static bottoms, moving flaps (front + back + rim), spools, axles, fins.
   */
  function flapBank(layout) {
    const cells = layout.cells, n = cells.length;
    const group = new THREE.Group();
    group.name = "flapBank";
    const mkInst = (geo, mat, count, name, glyphs) => {
      const g = geo.clone();
      if (glyphs) g.setAttribute("aGlyph", new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2));
      const m = new THREE.InstancedMesh(g, mat, count);
      m.name = name;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m);
      return m;
    };
    const top = mkInst(geoTop, flapMat, n, "flapTops", true);
    const bottom = mkInst(geoBottom, flapMat, n, "flapBottoms", true);
    const flap = mkInst(geoFlap, flapMat, n, "flaps", true);
    top.receiveShadow = bottom.receiveShadow = true;
    flap.castShadow = flap.receiveShadow = true;

    // per-cell module transform with seeded misalignment
    const cellMatrix = cells.map((c) => {
      const j = (k) => hash01(B.seed, c.i, k) * 2 - 1;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(c.x + j(1) * B.misalign.x, c.y + j(2) * B.misalign.y, 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), j(3) * B.misalign.rot),
        new THREE.Vector3(c.s, c.s, c.s),
      );
      top.setMatrixAt(c.i, m);
      bottom.setMatrixAt(c.i, m);
      return m;
    });

    // mechanism hints: side spools, axle rod, divider fins (static)
    const spoolGeo = new THREE.CylinderGeometry(B.spoolR, B.spoolR, 0.012, 20).rotateZ(PI / 2);
    const axleGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 1, 8).rotateZ(PI / 2);
    const finGeo = new THREE.BoxGeometry(0.008, 1, 0.07);
    const spools = mkInst(spoolGeo, materials.spool, n * 2, "spools");
    const axles = mkInst(axleGeo, materials.axle, n, "axles");
    const fins = [];
    for (const c of cells) {
      const row = layout.rows[c.row], blk = row.blocks[c.block];
      fins.push({ x: c.x - (B.pitch * c.s) / 2, c });
      if (blk.cells[blk.cells.length - 1] === c.i) fins.push({ x: c.x + (B.pitch * c.s) / 2, c });
    }
    const finMesh = mkInst(finGeo, materials.slot, fins.length, "fins");
    const tmp = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    cells.forEach((c) => {
      for (const sgn of [-1, 1]) {
        tmp.compose(v.set(c.x + sgn * (W / 2 + 0.009) * c.s, c.y, -0.004), q0, sc.set(c.s, c.s, c.s));
        spools.setMatrixAt(c.i * 2 + (sgn > 0 ? 1 : 0), tmp);
      }
      tmp.compose(v.set(c.x, c.y, -0.014), q0, sc.set(B.pitch * c.s, c.s, c.s));
      axles.setMatrixAt(c.i, tmp);
    });
    fins.forEach((f, k) => {
      tmp.compose(v.set(f.x, f.c.y, -0.03), q0, sc.set(1, (H + 2 * B.slotPad[1] - 0.02) * f.c.s, 1));
      finMesh.setMatrixAt(k, tmp);
    });
    spools.castShadow = true;

    const aTop = top.geometry.attributes.aGlyph, aBot = bottom.geometry.attributes.aGlyph, aFlap = flap.geometry.attributes.aGlyph;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), rot = new THREE.Matrix4(), fm = new THREE.Matrix4();
    group.userData = {
      cellMatrix,
      /** write(i, { top, bottom, front, back, angle }) — angle null hides the moving flap. */
      write(i, s) {
        aTop.array[i * 2] = s.top;
        aBot.array[i * 2] = s.bottom;
        aFlap.array[i * 2] = s.front;
        aFlap.array[i * 2 + 1] = s.back;
        if (s.angle == null) flap.setMatrixAt(i, zero);
        else flap.setMatrixAt(i, fm.multiplyMatrices(cellMatrix[i], rot.makeRotationX(s.angle)));
      },
      commit() {
        aTop.needsUpdate = aBot.needsUpdate = aFlap.needsUpdate = true;
        flap.instanceMatrix.needsUpdate = true;
      },
      meshes: { top, bottom, flap, spools, axles, fins: finMesh },
    };
    return group;
  }

  // ---------------------------------------------------------------------------------------------
  // Housing: face plate with slots, brushed header strip, frame, back box, hangers, printed labels
  // ---------------------------------------------------------------------------------------------
  const zBack = -0.06;
  function plateWithSlots(x0, x1, y0, y1, slots, mat, front, name) {
    const s = new THREE.Shape();
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    for (const sl of slots) {
      const h = new THREE.Path();
      h.moveTo(sl.x0, sl.y0); h.lineTo(sl.x0, sl.y1); h.lineTo(sl.x1, sl.y1); h.lineTo(sl.x1, sl.y0); h.closePath();
      s.holes.push(h);
    }
    const bt = 0.006;
    const geo = new THREE.ExtrudeGeometry(s, { depth: front - zBack - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.005, bevelSegments: 2, curveSegments: 4 });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = zBack + bt;
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  /** Painted label on the housing (lit, so the raking light grazes it). */
  function paintLabel(text, o = {}) {
    const m = createTextLabel(text, { ...textStyle, color: col(o.color ?? "paint"), height: o.height ?? textStyle.height, padding: 0.12, lit: true, fontSize: 112, letterSpacing: o.letterSpacing ?? 6 });
    m.material.roughness = 0.75;
    m.material.polygonOffset = true;
    m.material.polygonOffsetFactor = -2;
    m.receiveShadow = true;
    return m;
  }

  /**
   * housing(layout) -> Group: powder-coated face plate (slot per row block), brushed header strip,
   * brushed frame bars, back box, hanger rods, screws, printed column/row labels, slot back panels.
   */
  function housing(layout) {
    const g = new THREE.Group();
    g.name = "housing";
    const Wb = layout.width, Hb = layout.height, front = B.recess;
    const hx = Wb / 2, hy = Hb / 2;
    const hdr = layout.header;
    const headerSlots = layout.slots.filter((s) => s.kind === "header");
    const bodySlots = layout.slots.filter((s) => s.kind !== "header");
    const splitY = hdr ? hdr.y0 : hy;
    g.add(plateWithSlots(-hx, hx, -hy, splitY, bodySlots, materials.housing, front, "facePlate"));
    if (hdr) g.add(plateWithSlots(-hx, hx, splitY, hy, headerSlots, brushed, front + 0.012, "headerStrip"));
    // slot back panels (deep shadowed channel behind the flaps)
    for (const sl of layout.slots) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(sl.x1 - sl.x0, sl.y1 - sl.y0), materials.slot);
      p.position.set((sl.x0 + sl.x1) / 2, (sl.y0 + sl.y1) / 2, -0.055);
      p.receiveShadow = true;
      g.add(p);
    }
    // brushed frame bars
    const fb = B.frameBar, fd = front - zBack + 0.07, fz = (front + 0.03 + zBack - 0.04) / 2;
    const bar = (w, h, x, y) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, fd, 3, Math.min(0.03, h / 3)), materials.frame);
      m.position.set(x, y, fz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    bar(Wb + fb, fb, 0, hy);
    bar(Wb + fb, fb, 0, -hy);
    bar(fb, Hb - fb, -hx, 0);
    bar(fb, Hb - fb, hx, 0);
    // back box (reads as housing depth under lateral parallax)
    const box = new THREE.Mesh(new RoundedBoxGeometry(Wb - 0.04, Hb - 0.04, B.housingDepth, 2, 0.02), materials.housing);
    box.position.z = zBack - B.housingDepth / 2;
    box.castShadow = box.receiveShadow = true;
    g.add(box);
    // hanger rods + clamps (hint that the board hangs from the hall ceiling)
    for (const sx of [-0.33, 0.33]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 6, 14), materials.axle);
      rod.position.set(sx * Wb, hy + 3, zBack - B.housingDepth / 2);
      g.add(rod);
      const clamp = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.12, 0.3, 2, 0.02), materials.frame);
      clamp.position.set(sx * Wb, hy + fb / 2 + 0.05, zBack - B.housingDepth / 2);
      clamp.castShadow = true;
      g.add(clamp);
    }
    // screws on the header strip and frame corners
    const screwGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 16).rotateX(PI / 2);
    const screws = [];
    if (hdr) {
      const yc = (hdr.y0 + hy - fb / 2) / 2;
      screws.push([-hx + 0.25, yc], [hx - 0.25, yc]);
    }
    screws.push([-hx + 0.22, -hy + fb / 2 + 0.13], [hx - 0.22, -hy + fb / 2 + 0.13]);
    for (const [x, y] of screws) {
      const s = new THREE.Mesh(screwGeo, materials.bezel);
      s.position.set(x, y, front + (hdr && y > splitY ? 0.018 : 0.006));
      g.add(s);
    }
    // printed labels
    for (const lb of layout.labels) {
      const m = paintLabel(lb.text, { height: lb.kind === "row" ? 0.2 : textStyle.height });
      const w = m.scale.x;
      m.position.set(lb.align === "left" ? lb.x + w / 2 - 0.02 : lb.x, lb.y, front + 0.0015);
      g.add(m);
    }
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // Indicator lamp
  // ---------------------------------------------------------------------------------------------
  /** lamp({ color, r }) -> Group facing +Z; userData.setLevel(0..1) drives the lens emission. */
  function lamp(o = {}) {
    const color = col(o.color ?? "amber"), r = o.r ?? L.r;
    const g = new THREE.Group();
    g.name = `lamp:${o.color ?? "amber"}`;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(r * 1.22, r * 0.26, 10, 32), materials.bezel);
    bezel.castShadow = true;
    g.add(bezel);
    const well = new THREE.Mesh(new THREE.CircleGeometry(r * 1.1, 28), materials.slot);
    well.position.z = -0.004;
    g.add(well);
    const lensMat = materials.lampOff.clone();
    const tint = new THREE.Color(color).multiplyScalar(spec.lamps.offTint);
    lensMat.color.copy(tint);
    lensMat.emissive = new THREE.Color(color);
    lensMat.emissiveIntensity = L.offStrength;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, PI * 2, 0, PI / 2).rotateX(PI / 2), lensMat);
    lens.scale.z = 0.55;
    g.add(lens);
    g.userData.setLevel = (v) => {
      lensMat.emissiveIntensity = lerp(L.offStrength, L.onStrength, clamp(v));
    };
    g.userData.lens = lens;
    return g;
  }

  /** Blink level (pure): square-ish wave with soft edges, 0 before `from`. */
  const blink = (t, from, hz = L.blinkHz, duty = L.blinkDuty) => {
    if (t < from) return 0;
    const ph = ((t - from) * hz) % 1;
    return ph < duty ? clamp(ph / 0.04) : clamp(1 - (ph - duty) / 0.06);
  };

  // ---------------------------------------------------------------------------------------------
  // Board: housing + flap bank + lamps + schedule
  // ---------------------------------------------------------------------------------------------
  /**
   * board(def) -> Group. def: see flaps.layoutBoard (header, columns, rows, footer, lamps, rowLabels).
   * userData:
   *   layout, plan                       pure data (flaps.js)
   *   setRowText(row, text, at, { block, align }) -> { start, arrive }   (build time; schedules flips)
   *   program([{ row, block, text, at }]) -> items with arrive
   *   update(t)                          sets every cell from the plan (pure function of t)
   *   lamps[row][color] -> lamp group;   setLamp(row, color, level)
   */
  function board(def) {
    const layout = FLAPS.layoutBoard(def, B);
    const plan = FLAPS.createPlan(layout, A.charset, TUNE, def.seed ?? B.seed);
    const g = new THREE.Group();
    g.name = "splitFlapBoard";
    g.add(housing(layout));
    const bank = flapBank(layout);
    g.add(bank);
    const lamps = {};
    for (const lp of layout.lamps) {
      const m = lamp({ color: lp.color });
      m.position.set(lp.x, lp.y, B.recess + 0.006);
      (lamps[lp.row] ??= {})[lp.color] = m;
      g.add(m);
    }
    const nCells = layout.cells.length;
    g.userData = {
      layout, plan, lamps, bank,
      setRowText(row, text, at, o = {}) {
        return FLAPS.addText(plan, { row, text, at, ...o });
      },
      program(items) {
        return items.map((it) => FLAPS.addText(plan, it));
      },
      state(i, t) {
        return FLAPS.cellState(plan.segs[i], t, A.charset, TUNE);
      },
      update(t) {
        for (let i = 0; i < nCells; i++) bank.userData.write(i, FLAPS.cellState(plan.segs[i], t, A.charset, TUNE));
        bank.userData.commit();
      },
      setLamp(row, color, level) {
        lamps[row]?.[color]?.userData.setLevel(level);
      },
      blink,
    };
    return g;
  }

  /** hall({ w, h, z }) -> back wall of the dim hall (receives the key light's falloff). */
  function hall(o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w ?? 44, o.h ?? 26), materials.wall);
    m.position.z = o.z ?? -1.9;
    m.receiveShadow = true;
    m.name = "hallWall";
    return m;
  }

  const props = { board, housing, flapBank, lamp, glyphAtlas: () => atlas, flapMaterial, hall, paintLabel };
  return {
    spec,
    palette: P,
    materials: { ...materials, flapAtlas: flapMat },
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      board: (o) => board(o.dims ?? {}),
      hall: (o) => hall(o.dims ?? {}),
    },
    motion: { ...FLAPS, blink },
    helpers: { atlas },
    sfx: spec.sfx,
  };
}
