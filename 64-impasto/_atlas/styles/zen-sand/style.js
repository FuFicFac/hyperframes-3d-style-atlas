// styles/zen-sand/style.js — createStyle(stage, opts) for "Zen Sand" (see STYLE.md).
// Everything drawn is IN the sand: sandplan.js plans the tools and rebuilds the height field from t; this file turns
// that field into two DataTextures (tangent-space normals + albedo with self-shadow) on a flat sand plane lit by the
// scene's low sun, and builds the tray, stones, moss, tools and the caption tag. Props never animate themselves:
// the scene calls garden.userData.update(t) (or each prop's update/setPose) from renderAt.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { plaqueCanvas } from "../../kit/textures.js";
import { noise3 } from "../../kit/noise.js";
import { rng, clamp, lerp, smoothstep, hash01 } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as sandplan from "./sandplan.js";
export { STYLE_SPEC };

/** plan (x, y) on the sand -> world [x, h, -y] */
export const toWorld = (x, y, h = 0) => [x, h, -y];

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const P = spec.palette, T = spec.tray;

  // ---------------------------------------------------------------------------------------------- tray + table
  function tray(o = {}) {
    const w = o.w ?? T.w, d = o.d ?? T.d, r = o.rail ?? T.rail, top = o.railHeight ?? T.railHeight, dep = o.depth ?? T.depth;
    const g = new THREE.Group();
    g.name = "tray";
    const H = top + dep, cy = (top - dep) / 2;
    const rail = (len, along) => {
      const geo = new THREE.BoxGeometry(along === "x" ? len : r, H, along === "x" ? r : len);
      const m = new THREE.Mesh(geo, materials.rail);
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    const back = rail(w + 2 * r, "x"); back.position.set(0, cy, -(d / 2 + r / 2));
    const front = rail(w + 2 * r, "x"); front.position.set(0, cy, d / 2 + r / 2);
    const left = rail(d, "z"); left.position.set(-(w / 2 + r / 2), cy, 0);
    const right = rail(d, "z"); right.position.set(w / 2 + r / 2, cy, 0);
    g.add(back, front, left, right);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(o.tableSize ?? 30, o.tableSize ?? 30), materials.table);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -dep;
    table.receiveShadow = true;
    table.name = "table";
    g.add(table);
    return g;
  }

  // ---------------------------------------------------------------------------------------------- sand field
  /**
   * sandField(plan, { ppm, stones }) -> Mesh (flat plane, y = 0) whose normal map + albedo come from the plan's height
   * field. userData.update(t) rebuilds the field for t and uploads both textures (renderer.initTexture) before render.
   */
  function sandField(plan, o = {}) {
    const S = spec.sand;
    const F = sandplan.createSandField(plan, {
      ppm: o.ppm ?? S.ppm, stones: o.stones ?? [], sandColor: P.sand, sandDeep: P.sandDeep,
      shade: { ...S.shade, azimuth: spec.sun.azimuth, elevation: spec.sun.elevation, ...o.shade },
    });
    const first = F.at(-0.001);
    const tex = (data, srgb) => {
      const t = new THREE.DataTexture(data, F.W, F.H, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 8;
      t.flipY = false;
      t.needsUpdate = true;
      return t;
    };
    const colorTex = tex(first.color, true), normalTex = tex(first.normal, false);
    const mat = new THREE.MeshStandardMaterial({ map: colorTex, normalMap: normalTex, roughness: S.roughness, metalness: 0 });
    mat.normalScale.set(S.normalScale, S.normalScale);
    mat.name = "sand";
    const tw = plan.opts.tray.w, td = plan.opts.tray.d;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tw, td), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = "sand";
    mesh.userData.field = F;
    mesh.userData.update = (t) => {
      F.at(t); // rewrites the arrays the textures point at — content is a pure function of t
      colorTex.needsUpdate = true;
      normalTex.needsUpdate = true;
      stage.renderer.initTexture(colorTex);
      stage.renderer.initTexture(normalTex);
    };
    return mesh;
  }

  // ---------------------------------------------------------------------------------------------- stones + moss
  /** stone({ rx, ry, h, seed }) -> smooth dark pebble (noise-lumped ellipsoid), sunk ~25 % into the sand. Place with toWorld. */
  function stone(o = {}) {
    const SS = spec.stones, rx = o.rx ?? 0.3, ry = o.ry ?? 0.25, h = o.h ?? 0.18, seed = o.seed ?? SS.seedBase;
    const ico = new THREE.IcosahedronGeometry(1, SS.detail);
    ico.deleteAttribute("uv"); ico.deleteAttribute("normal");
    const geo = mergeVertices(ico); // shared vertices -> smooth normals (icosahedron is non-indexed = faceted)
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = noise3(v.x * 1.3 + 3, v.y * 1.3, v.z * 1.3, seed) - 0.5 + 0.35 * (noise3(v.x * 3.1, v.y * 3.1, v.z * 3.1, seed + 9) - 0.5);
      const flat = v.y < 0 ? 1 : 1 - 0.18 * v.y * v.y; // a slightly flatter crown
      v.multiplyScalar((1 + SS.lump * 2 * n) * flat);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materials.stone);
    m.scale.set(rx, h, ry);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    m.position.y = h * 0.25;
    g.rotation.y = o.yaw ?? 0;
    g.name = "stone";
    return g;
  }
  /** moss({ r, seed, height }) -> a small cushion of moss (merged blobs with vertex colours). */
  function moss(o = {}) {
    const r = o.r ?? 0.12, R = rng(o.seed ?? 21), hgt = o.height ?? 0.05, n = o.count ?? 70;
    const base = new THREE.IcosahedronGeometry(1, 1);
    const cA = new THREE.Color(P.moss), cB = new THREE.Color(P.mossLight), c = new THREE.Color();
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = R.range(0, Math.PI * 2), d = Math.sqrt(R.next()) * r, x = Math.cos(a) * d * (o.sx ?? 1.25), z = Math.sin(a) * d;
      const dome = Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
      const s = R.range(0.018, 0.034) * (0.6 + 0.4 * dome);
      const g = base.clone();
      g.scale(s, s * R.range(0.7, 1.1), s);
      g.translate(x, dome * hgt * R.range(0.75, 1) - s * 0.2, z);
      c.copy(cA).lerp(cB, clamp(R.range(0, 0.7) + 0.35 * dome));
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      parts.push(g.toNonIndexed());
    }
    const geo = mergeGeometries(parts.map((g) => { g.deleteAttribute("uv"); return g; }), false);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materials.moss);
    m.castShadow = m.receiveShadow = true;
    m.name = "moss";
    return m;
  }

  // ---------------------------------------------------------------------------------------------- tools
  // Each tool: a Group whose origin is its CONTACT point on the sand; local +x = direction of travel.
  // userData.setPose(pose) takes a sandplan.toolPose() result.
  const applyPose = (g, p) => {
    g.visible = p.visible;
    g.position.set(p.x, p.z, -p.y);
    g.rotation.y = p.heading;
  };
  /** rake({ tines, spacing }) -> wooden rake: head bar, peg tines, long handle trailing at `pitch`. */
  function rake(o = {}) {
    const R = spec.tools.rake, n = o.tines ?? 5, sp = o.spacing ?? 0.07, hw = n * sp + 0.07;
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(R.headDepth, 0.045, hw), materials.tool);
    head.position.y = R.tineLen + 0.012;
    body.add(head);
    const tineGeo = new THREE.CylinderGeometry(0.009, 0.006, R.tineLen + 0.02, 8);
    for (let k = 0; k < n; k++) {
      const t = new THREE.Mesh(tineGeo, materials.tool);
      t.position.set(0, (R.tineLen + 0.02) / 2 - 0.012, -(n * sp) / 2 + sp / 2 + k * sp);
      body.add(t);
    }
    const pivot = new THREE.Group();
    pivot.position.y = R.tineLen + 0.03;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, R.handle, 10), materials.tool);
    handle.position.y = R.handle / 2;
    pivot.add(handle);
    body.add(pivot);
    body.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    g.name = "rake";
    g.userData.setPose = (p) => {
      applyPose(g, p);
      const pitch = lerp(R.pitch, R.restPitch, p.rest);
      pivot.rotation.z = Math.PI / 2 - pitch;            // handle trails behind (-x) and up
      body.rotation.x = -Math.PI / 2 * smoothstep(0.55, 1, p.rest); // lies on its back on the rail at rest
    };
    return g;
  }
  /** stylus() -> a pale wooden dowel with a rounded tip, leaning back against the direction of travel. */
  function stylus() {
    const S = spec.tools.stylus;
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r * 0.75, S.len, 12), materials.tool);
    shaft.position.y = S.len / 2 + 0.02;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(S.r * 0.8, 12, 8), materials.tool);
    tip.position.y = 0.012;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(S.r * 0.75, S.r * 0.8, 0.02, 12), materials.tool);
    cone.position.y = 0.02;
    body.add(shaft, tip, cone);
    body.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    g.name = "stylus";
    g.userData.setPose = (p) => {
      applyPose(g, p);
      body.rotation.z = lerp(S.lean, Math.PI / 2 - 0.02, p.rest); // lies flat along the rail at rest
    };
    return g;
  }
  /** ball() -> a polished dark stone ball with a pale band so its roll reads; spin = rolled distance / r. */
  function ball() {
    const B = spec.tools.ball;
    const g = new THREE.Group(), spin = new THREE.Group();
    g.add(spin);
    spin.position.y = B.r - 0.01;
    const sph = new THREE.Mesh(new THREE.SphereGeometry(B.r, 32, 20), materials.ball);
    const band = new THREE.Mesh(new THREE.TorusGeometry(B.r * 0.995, B.r * 0.07, 8, 40), materials.tool);
    const band2 = band.clone();
    band2.rotation.y = Math.PI / 2;
    spin.add(sph, band, band2);
    spin.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    g.name = "ball";
    g.userData.setPose = (p) => {
      applyPose(g, p);
      spin.rotation.z = -(p.dist ?? 0) / B.r;
    };
    return g;
  }
  /** board({ len }) -> the smoothing board: a plank on edge with a short handle, dragged along +x. */
  function board(o = {}) {
    const B = spec.tools.board, len = o.len ?? B.len;
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(B.thick, B.width, len), materials.tool);
    plank.position.set(-B.thick / 2, B.width / 2 - 0.008, 0);
    body.add(plank);
    for (const z of [-len * 0.22, len * 0.22]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, B.handle, 8), materials.tool);
      post.position.set(-B.thick / 2 - Math.sin(0.25) * B.handle / 2, B.width + Math.cos(0.25) * B.handle / 2 - 0.01, z);
      post.rotation.z = 0.25;
      body.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, len * 0.5, 10), materials.tool);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(-B.thick / 2 - Math.sin(0.25) * B.handle, B.width + Math.cos(0.25) * B.handle - 0.01, 0);
    body.add(bar);
    body.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    g.name = "board";
    g.userData.setPose = (p) => {
      applyPose(g, p);
      body.rotation.z = lerp(B.lean, Math.PI / 2, smoothstep(0.5, 1, p.rest)); // leans back while dragging, flat at rest
    };
    return g;
  }

  // ---------------------------------------------------------------------------------------------- labels
  const C = spec.caption;
  const capFont = (px) => `${spec.text.weight} ${px}px ${textStyle.font}`;
  function drawTag(ctx, W, H, st) {
    if (!st.text) return;
    ctx.font = capFont(C.size);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${(C.tracking * C.size).toFixed(1)}px`;
    const tw = ctx.measureText(st.text).width, padL = 74, padR = 40, h = H - 30, w = Math.min(W - 24, tw + padL + padR);
    const x = 8, y = 8, r = 14;
    ctx.save();
    ctx.shadowColor = "rgba(20,12,6,0.45)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    ctx.fillStyle = P.tag;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(255,240,210,0.22)"); g.addColorStop(1, "rgba(90,55,25,0.18)");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 22; i++) { // seeded wood grain
      const yy = y + h * hash01(i, 3, 41), amp = 2 + 5 * hash01(i, 5, 41), ph = 6 * hash01(i, 7, 41);
      ctx.strokeStyle = `rgba(110,70,35,${(0.06 + 0.1 * hash01(i, 9, 41)).toFixed(3)})`;
      ctx.lineWidth = 1 + 2 * hash01(i, 11, 41);
      ctx.beginPath();
      for (let xx = x; xx <= x + w; xx += 12) { const yv = yy + Math.sin(xx * 0.012 + ph) * amp; if (xx === x) ctx.moveTo(xx, yv); else ctx.lineTo(xx, yv); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(70,45,22,0.45)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r); ctx.stroke();
    // string hole
    ctx.fillStyle = "#3b2a1b"; ctx.beginPath(); ctx.arc(x + 34, y + h / 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,235,200,0.5)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 34, y + h / 2 + 1, 10.5, 0.2, Math.PI - 0.2); ctx.stroke();
    // engraved text: light lower edge, then ink
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,240,214,0.6)"; ctx.fillText(st.text, x + padL, y + h / 2 + 3 + 1.5);
    ctx.fillStyle = P.ink; ctx.fillText(st.text, x + padL, y + h / 2 + 3);
  }
  /**
   * caption(labels) -> overlay wooden tag (exact colours, drawn after post). labels = [{ t0, t1, text }]; userData.update(t)
   * shows the label whose window holds t (fade in at t0, out ending at t1), with a 10 px settle. One fixed screen spot.
   */
  function caption(labels = [], o = {}) {
    const m = screenCanvas(stage, C.w, C.h, drawTag);
    const x = o.x ?? C.x, y = o.y ?? C.y;
    m.userData.update = (t) => {
      const L = labels.find((l) => t >= l.t0 && t < l.t1);
      if (!L) { m.userData.opacity(0); return; }
      const a = smoothstep(L.t0, L.t0 + C.fadeIn, t) * (1 - smoothstep(L.t1 - C.fadeOut, L.t1, t));
      m.userData.set({ text: L.text });
      m.userData.place(x, y + (1 - smoothstep(L.t0, L.t0 + C.fadeIn, t)) * 10);
      m.userData.opacity(a);
    };
    return m;
  }
  /** woodTag(text, { cap }) -> a small 3D wooden tag (stamped text) to lie on the rail or sand; faces +Y. */
  function woodTag(text, o = {}) {
    const cap = o.cap ?? 0.07;
    const pc = plaqueCanvas(String(text).toUpperCase(), { kind: "stamped", cap, font: textStyle.font, weight: 600, seed: o.seed ?? 3 });
    const tex = new THREE.CanvasTexture(pc.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mats = [materials.tool, materials.tool, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), materials.tool, materials.tool, materials.tool];
    const m = new THREE.Mesh(new THREE.BoxGeometry(pc.w, 0.012, pc.h), mats);
    m.castShadow = m.receiveShadow = true;
    m.name = "woodTag";
    return m;
  }

  // ---------------------------------------------------------------------------------------------- the whole garden
  /**
   * garden({ plan, stones: [{ x, y, rx, ry, h, seed, yaw }], moss: [{ x, y, r, seed }], tools = ["rake","stylus","ball","board"], ppm })
   *   -> Group: tray + table, sand field, stones, moss, tools. userData.update(t): rebuild the sand for t and pose every
   *   tool from the same plan the SCORE was built from. userData.parts = { tray, sand, stones, moss, tools }.
   */
  function garden(o) {
    const g = new THREE.Group();
    g.name = "garden";
    const tr = tray(), stonesSpec = o.stones ?? [];
    const sand = sandField(o.plan, { ppm: o.ppm, stones: stonesSpec.map((s) => ({ x: s.x, y: s.y, rx: s.rx, ry: s.ry })) });
    const stoneObjs = stonesSpec.map((s, i) => { const st = stone({ ...s, seed: s.seed ?? 3 + i * 7 }); st.position.set(...toWorld(s.x, s.y)); return st; });
    const mossObjs = (o.moss ?? []).map((m) => { const mm = moss(m); mm.position.set(...toWorld(m.x, m.y)); return mm; });
    const make = { rake, stylus, ball, board };
    const tools = {};
    for (const name of o.tools ?? ["rake", "stylus", "ball", "board"]) {
      const opRake = o.plan.ops.find((op) => op.tool === "rake" && !op.pre);
      tools[name] = name === "rake" ? rake({ tines: opRake?.tines ?? 5, spacing: opRake?.spacing ?? 0.07 }) : make[name]();
    }
    g.add(tr, sand, ...stoneObjs, ...mossObjs, ...Object.values(tools));
    g.userData.parts = { tray: tr, sand, stones: stoneObjs, moss: mossObjs, tools };
    g.userData.update = (t) => {
      sand.userData.update(t);
      for (const [name, tool] of Object.entries(tools)) tool.userData.setPose(sandplan.toolPose(o.plan, name, t));
    };
    return g;
  }

  const props = { tray, sandField, stone, moss, rake, stylus, ball, board, caption, woodTag, garden };
  const factories = {
    // OBJECTS dims: { program, stones, moss, tools?, ppm? } — plans the program with spec.plan (same result as the
    // scene.config planSand call that built the SCORE: the planner is deterministic)
    garden: (objSpec) => garden({ ...objSpec.dims, plan: objSpec.dims.plan ?? sandplan.planSand(objSpec.dims.program, spec.plan) }),
  };

  return {
    spec,
    palette: spec.palette,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories,
    plan: sandplan,
    helpers: { toWorld },
    sfx: spec.sfx,
  };
}
