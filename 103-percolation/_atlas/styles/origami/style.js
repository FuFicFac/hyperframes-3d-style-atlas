// styles/origami/style.js — "Origami": two-sided kami sheets folded on screen into faceted models on a pale ash
// table in window light. Implements the style contract (references/kit-api.md §3). The fold maths, model library
// and fold timeline are in ./folds.js (pure, Node-safe) so a scene's SCORE comes from the same schedule.
//
// Nothing animates itself: scenes call model.userData.update(t) (or setPose/setWipe), tag.userData.setReveal(u),
// and move the returned groups from renderAt(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { paperTexture, bumpFromNoise, makeCanvas, canvasTexture, fbm2, valueNoise2, paintPixels, softRectTexture } from "../../kit/textures.js";
import { screenLines } from "../../kit/lines.js";
import { clamp, hash01, rng, smoothstep } from "../../kit/time.js";
import { slabGeometry } from "../../kit/shapes.js";
import { chiyogamiCanvas } from "../../kit/textures.js";
import { STYLE_SPEC } from "./spec.js";
import * as folds from "./folds.js";
export { STYLE_SPEC, folds };

const { buildFolds, pose, stripPoints, foldTimeline, model: modelDef } = folds;

// ---------------------------------------------------------------------------------------------- paper shader
// Patched MeshStandardMaterial: raw sheet UV (= flat coords) drives the crease lines (revealed per step through a
// uniform array) and an optional chiyogami pattern that wipes across the sheet. Fibre map multiplies both.
const PAPER_PARS = /* glsl */ `
varying vec2 vSheetUv;
uniform sampler2D uCrease; uniform float uCreaseVis[48]; uniform float uCreaseDark; uniform float uCreaseDepth;
uniform sampler2D uPattern; uniform float uUsePat; uniform vec2 uPatRepeat; uniform float uWipe; uniform float uWipeSoft; uniform vec3 uWipeAxis;
`;
const PAPER_FRAG = /* glsl */ `
{
  #ifdef USE_MAP
  vec3 fib = texture2D(map, vMapUv).rgb;
  #else
  vec3 fib = vec3(1.0);
  #endif
  if (uUsePat > 0.5) {
    float c = dot(vec3(vSheetUv, 1.0), uWipeAxis);
    float W = uWipe * (1.0 + uWipeSoft);
    float w = 1.0 - smoothstep(W - uWipeSoft, W, c);
    vec3 pat = texture2D(uPattern, vSheetUv * uPatRepeat).rgb * fib;
    diffuseColor.rgb = mix(diffuseColor.rgb, pat, w);
  }
  vec4 cr = texture2D(uCrease, vSheetUv);
  int ci = int(cr.r * 255.0 + 0.5) - 1;
  float vis = (ci >= 0 && ci < 48) ? uCreaseVis[ci] : 0.0;
  diffuseColor.rgb *= 1.0 - uCreaseDark * cr.g * vis;
}`;
// Crease SHADING: a soft groove (crease texture B channel, per-step reveal) is added to the fibre height inside
// three's bump path, so a crease reads as a lit/shaded dent that changes with the light, not as a drawn line.
const PAPER_BUMP = /* glsl */ `
#define dHdxy_fwd dHdxy_fwd_three
#include <bumpmap_pars_fragment>
#undef dHdxy_fwd
#ifdef USE_BUMPMAP
float creaseH(vec2 uv) {
  vec4 cr = texture2D(uCrease, uv);
  int ci = int(cr.r * 255.0 + 0.5) - 1;
  float vis = (ci >= 0 && ci < 48) ? uCreaseVis[ci] : 0.0;
  return -uCreaseDepth * cr.b * vis;
}
float paperH(vec2 uv) { return bumpScale * texture2D(bumpMap, uv).x + creaseH(uv); }
vec2 dHdxy_fwd() {
  vec2 dSTdx = dFdx(vBumpMapUv), dSTdy = dFdy(vBumpMapUv);
  float Hll = paperH(vBumpMapUv);
  return vec2(paperH(vBumpMapUv + dSTdx) - Hll, paperH(vBumpMapUv + dSTdy) - Hll);
}
#endif
`;
function patchPaper(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSheetUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSheetUv = uv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + PAPER_PARS)
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + PAPER_FRAG)
      .replace("#include <bumpmap_pars_fragment>", PAPER_BUMP);
  };
  mat.customProgramCacheKey = () => "origamiPaper2";
  mat.needsUpdate = true;
  return mat;
}

// ---------------------------------------------------------------------------------------------- geometry
// slabGeometry: kit/shapes.js (promoted, identical)
// ---------------------------------------------------------------------------------------------- chiyogami
// chiyogamiCanvas: kit/textures.js (promoted, identical)
export { chiyogamiCanvas };

// ---------------------------------------------------------------------------------------------- createStyle
/**
 * createStyle(stage, opts?) -> style        opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, PAPER = spec.paper, TUNE = spec.tuning;
  const col = (c) => P[c] ?? c;
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  const key = lights.key;
  if (key?.target && !key.target.parent) stage.scene.add(key.target);

  // shared paper textures: kozo fibre strands (seeded, tileable: every strand is drawn at its 9 wrap offsets) over a
  // fine even grain. Light and dark strands so the sheet reads as paper, not as a flat colour or a smudged one.
  function fibreCanvas(o) {
    const N = o.size, c = makeCanvas(N, N), x = c.getContext("2d"), R = rng(o.seed);
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, N, N);
    const img = x.getImageData(0, 0, N, N), d = img.data;
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const i = (yy * N + xx) * 4, cl = fbm2((xx / N) * 4, (yy / N) * 4, { seed: o.seed, octaves: 3, period: 4 }) - 0.5;
      const v = 255 * (1 - o.cloud * (cl + 0.5) - (hash01(xx, yy, o.seed) * o.grain));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    x.putImageData(img, 0, 0);
    x.lineCap = "round";
    for (let k = 0; k < o.strands; k++) {
      const px = R.range(0, N), py = R.range(0, N), a = R.range(0, Math.PI * 2), L = R.range(o.length[0], o.length[1]) * N, bend = R.range(-0.5, 0.5) * L;
      const ex = px + Math.cos(a) * L, ey = py + Math.sin(a) * L, mx = (px + ex) / 2 - Math.sin(a) * bend, my = (py + ey) / 2 + Math.cos(a) * bend;
      const dark = R.next() < o.darkShare;
      x.strokeStyle = dark ? `rgba(150,138,118,${R.range(0.04, 0.09)})` : `rgba(255,255,255,${R.range(0.25, 0.6)})`;
      x.lineWidth = R.range(0.6, 1.6);
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(mx + ox, my + oy, ex + ox, ey + oy); x.stroke(); }
    }
    return c;
  }
  const fibreCv = fibreCanvas(PAPER.fibre);
  const fibre = canvasTexture(fibreCv);
  const fibreBump = canvasTexture(fibreCv, { srgb: false });
  const patCache = {};
  const patternTexture = (preset) => {
    const p = typeof preset === "string" ? spec.chiyogami[preset] : preset;
    const k = JSON.stringify(p);
    if (!patCache[k]) {
      const t = canvasTexture(chiyogamiCanvas({ ...p, ground: col(p.ground), ink: col(p.ink), accent: col(p.accent) }));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      patCache[k] = { tex: t, tiles: p.tiles ?? 6 };
    }
    return patCache[k];
  };
  const emptyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  emptyTex.needsUpdate = true;

  // ---- crease texture: R = step index + 1 (nearest crease, dilated), G = line coverage. Sheet-UV space.
  function creaseTexture(plan) {
    const N = PAPER.crease.texSize, bb = plan.bbox;
    const data = new Uint8Array(N * N * 4), best = new Float32Array(N * N).fill(1e9);
    for (let i = 0; i < N * N; i++) data[i * 4 + 3] = 255;
    const sx = bb.w / N, sz = bb.h / N, hw = PAPER.crease.width / 2, aa = 0.6 * Math.max(sx, sz), gw = PAPER.crease.groove;
    const margin = Math.max(hw + 3 * Math.max(sx, sz), 2.5 * gw);
    for (const c of plan.creases) {
      const [ax, az] = c.a, [bx, bz] = c.b, dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - margin - bb.minX) / sx)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + margin - bb.minX) / sx));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - margin - bb.minZ) / sz)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + margin - bb.minZ) / sz));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = bb.minX + (i + 0.5) * sx, z = bb.minZ + (j + 0.5) * sz;
        const s = clamp(((x - ax) * dx + (z - az) * dz) / ll);
        const dist = Math.hypot(x - ax - dx * s, z - az - dz * s);
        if (dist > margin) continue;
        const p = j * N + i;
        const cov = 1 - smoothstep(hw - aa, hw + aa, dist);
        if (dist < best[p]) { best[p] = dist; data[p * 4] = c.step + 1; }
        data[p * 4 + 1] = Math.max(data[p * 4 + 1], Math.round(cov * 255));
        data[p * 4 + 2] = Math.max(data[p * 4 + 2], Math.round(Math.exp(-(dist * dist) / (2 * gw * gw)) * 255));
      }
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  /**
   * paperSet({ front, back, plan?, pattern?, wipeAxis?, roughness? }) -> { front, back, edge, stripFront, stripBack, U }
   * Two-sided kami materials sharing one uniform block U (crease reveal, pattern wipe).
   */
  function paperSet(o = {}) {
    const U = {
      uCrease: { value: o.plan ? creaseTexture(o.plan) : emptyTex },
      uCreaseVis: { value: new Array(48).fill(0) },
      uCreaseDark: { value: PAPER.crease.dark }, uCreaseDepth: { value: PAPER.crease.depth },
      uPattern: { value: emptyTex }, uUsePat: { value: 0 }, uPatRepeat: { value: new THREE.Vector2(1, 1) },
      uWipe: { value: 0 }, uWipeSoft: { value: TUNE.wipeSoft }, uWipeAxis: { value: new THREE.Vector3(...(o.wipeAxis ?? [-1, 0, 1])) },
    };
    if (o.pattern) {
      const p = patternTexture(o.pattern);
      U.uPattern.value = p.tex; U.uUsePat.value = 1; U.uPatRepeat.value.set(p.tiles, p.tiles);
    }
    const mk = (base, color, side = THREE.FrontSide) => {
      const m = base.clone();
      m.color.set(col(color));
      m.map = fibre.clone(); m.map.repeat.set(PAPER.fibre.repeatPerSheet, PAPER.fibre.repeatPerSheet); m.map.needsUpdate = true;
      m.bumpMap = fibreBump; m.bumpScale = PAPER.bump.strength;
      m.side = side;
      return patchPaper(m, U);
    };
    const front = mk(materials.paperFront, o.front ?? "kami"), back = mk(materials.paperBack, o.back ?? "washi");
    const stripFront = mk(materials.paperFront, o.front ?? "kami", THREE.DoubleSide), stripBack = mk(materials.paperBack, o.back ?? "washi", THREE.DoubleSide);
    return { front, back, edge: materials.paperEdge, stripFront, stripBack, U };
  }

  // ---------------------------------------------------------------------------------------- fold model
  /**
   * foldModel({ model = "dart", modelOpts, def?, front = "kami", back = "washi", pattern?, wipeAxis?, seed, cues?,
   *             guides = true, castShadow = true }) -> Group
   *   The group is the MODEL FRAME (unfolded sheet in its XZ plane, front up, resting on y = 0): position/rotate it.
   *   userData: plan, timeline (from cues), update(t), setPose({ theta, hop, prog }), setWipe(u), materials, facets.
   */
  function foldModel(o = {}) {
    const def = o.def ?? modelDef(o.model ?? "dart", o.modelOpts ?? {});
    const plan = buildFolds(def, { thickness: PAPER.thickness, pitch: PAPER.pitch, seed: o.seed ?? 7, imperfect: PAPER.imperfect });
    const mats = paperSet({ front: o.front, back: o.back, plan, pattern: o.pattern, wipeAxis: o.wipeAxis });
    const root = new THREE.Group();
    root.name = `origami:${def.id}`;
    const inner = new THREE.Group();
    inner.position.y = PAPER.thickness / 2 + 0.0008;
    root.add(inner);
    const bb = plan.bbox, th = PAPER.thickness;
    const uvOf = ([x, z]) => [(x - bb.minX) / bb.w, (z - bb.minZ) / bb.h];
    const R = rng(o.seed ?? 7);
    const facets = plan.facets.map((f) => {
      const ang = R.range(0, Math.PI * 2), dir = [Math.cos(ang), Math.sin(ang)], tone = 1 + R.range(-1, 1) * PAPER.sheen.tone;
      const ext = Math.max(...f.poly.map(([x, z]) => Math.abs((x - f.centroid[0]) * dir[0] + (z - f.centroid[1]) * dir[1]))) || 1;
      const colorOf = ([x, z]) => tone * (1 - PAPER.sheen.gradient * 0.5 * (1 + ((x - f.centroid[0]) * dir[0] + (z - f.centroid[1]) * dir[1]) / ext));
      const m = new THREE.Mesh(slabGeometry(f.poly, th, uvOf, colorOf), [mats.front, mats.back, mats.edge]);
      m.matrixAutoUpdate = false;
      m.castShadow = o.castShadow ?? true;
      m.receiveShadow = true;
      m.name = `facet${f.id}`;
      inner.add(m);
      return m;
    });
    // bend strips (rounded crease edges): two ribbons (front / back surface) per strip, rebuilt per frame
    const K = PAPER.bendSegments;
    const strips = plan.strips.map((s) => {
      const idx = [];
      for (let j = 0; j < K; j++) { const a = j, b = j + 1, c = K + 1 + j, d = K + 2 + j; idx.push(a, c, b, b, c, d); }
      const uv = [];
      for (let e = 0; e < 2; e++) for (let j = 0; j <= K; j++) uv.push(...uvOf(s.edge[e]));
      const mkR = (mat) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * (K + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(2 * (K + 1) * 3).fill(0.97), 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, mat);
        m.castShadow = o.castShadow ?? true; m.receiveShadow = true; m.frustumCulled = false; m.visible = false;
        inner.add(m);
        return m;
      };
      return { front: mkR(mats.stripFront), back: mkR(mats.stripBack) };
    });
    // crease guides: dashed (valley) / dash-dot (mountain) lines drawn on before each fold, in the anchor's frame
    const G = spec.guide;
    const guides = plan.steps.map((st) => {
      if (!st.guide || o.guides === false || st.mode === "turn") return null;
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      const dash = st.kind === "mountain" ? G.mountain : G.valley;
      const line = screenLines(stage, [st.guide], { width: G.width, color: col("guide"), level: G.level, dash, blending: "normal", bias: 0.02 });
      line.visible = false;
      holder.add(line);
      inner.add(holder);
      return { holder, line };
    });
    let timeline = o.cues ? foldTimeline(plan, o.cues) : null;
    const _m = new THREE.Matrix4();

    function setPose(state) {
      const posed = pose(plan, state.theta, state.hop);
      facets.forEach((m, i) => { m.matrix.fromArray(posed.M[i]); m.matrixWorldNeedsUpdate = true; });
      strips.forEach((s, i) => {
        const on = posed.strip[i] && Math.abs(posed.strip[i].th) > 1e-4;
        s.front.visible = s.back.visible = !!on;
        if (!on) return;
        for (const [mesh, off] of [[s.front, th / 2], [s.back, -th / 2]]) {
          const pts = stripPoints(plan, posed, i, { K, offset: off });
          mesh.geometry.attributes.position.array.set(pts);
          mesh.geometry.attributes.position.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
        }
      });
      const vis = mats.U.uCreaseVis.value;
      for (let k = 0; k < Math.min(48, state.prog.length); k++) vis[k] = state.prog[k];
      root.userData.posed = posed;
      return posed;
    }
    function update(t) {
      if (!timeline) return null;
      const state = timeline.at(t);
      const posed = setPose(state);
      guides.forEach((g, k) => {
        if (!g) return;
        const c = timeline.cueOf(plan.steps[k].id);
        if (!c) { g.line.visible = false; return; }
        const draw = clamp((t - (c.at - G.lead)) / (G.lead * 0.75));
        const fade = 1 - clamp((t - c.at) / (c.dur * G.fade / 0.5 * 0.5 + 1e-6));
        const lvl = draw > 0 ? fade : 0;
        const st = plan.steps[k];
        _m.fromArray(st.anchor >= 0 ? posed.M[st.anchor] : folds.M4.I());
        g.holder.matrix.copy(_m); g.holder.matrixWorldNeedsUpdate = true;
        g.line.userData.setProgress(draw);
        g.line.userData.setLevel(lvl);
      });
      return state;
    }
    const setWipe = (u) => { mats.U.uWipe.value = clamp(u); };
    Object.assign(root.userData, {
      plan, materials: mats, facets, strips, inner,
      get timeline() { return timeline; },
      setCues(c) { timeline = foldTimeline(plan, c); return timeline; },
      setPose, update, setWipe,
    });
    return root;
  }

  // ---------------------------------------------------------------------------------------- props
  /** sheet({ size, front, back, pattern }) — a plain flat sheet (a foldModel with no steps) */
  const sheet = (o = {}) => foldModel({ ...o, def: modelDef("sheet", { size: o.size ?? 1 }), guides: false });

  /** sheetStack({ count = 6, size = .7, presets = [...], seed }) -> Group of loose chiyogami sheets (userData.sheets, top last) */
  function sheetStack(o = {}) {
    const { count = 6, size = 0.7, seed = 5 } = o;
    const presets = o.presets ?? Object.keys(spec.chiyogami).filter((k) => /Red|Gold/.test(k));
    const R = rng(seed);
    const g = new THREE.Group();
    g.name = "origami:stack";
    const sheets = [];
    const th = PAPER.thickness, S = size / 2;
    const poly = [[-S, -S], [S, -S], [S, S], [-S, S]];
    for (let i = 0; i < count; i++) {
      const p = patternTexture(presets[i % presets.length]);
      const front = materials.paperFront.clone();
      front.vertexColors = true;
      front.color.set("#ffffff");
      front.map = p.tex.clone(); front.map.repeat.set(p.tiles * size / 2.5, p.tiles * size / 2.5); front.map.needsUpdate = true;
      front.bumpMap = fibreBump; front.bumpScale = PAPER.bump.strength;
      const back = materials.paperBack.clone();
      back.map = fibre; back.bumpMap = fibreBump; back.bumpScale = PAPER.bump.strength;
      const tone = 1 + R.range(-1, 1) * PAPER.sheen.tone, ang = R.range(0, Math.PI * 2);
      const m = new THREE.Mesh(slabGeometry(poly, th, ([x, z]) => [(x + S) / size, (z + S) / size], ([x, z]) => tone * (1 - PAPER.sheen.gradient * 0.5 * (1 + (x * Math.cos(ang) + z * Math.sin(ang)) / (S * 1.42)))), [front, back, materials.paperEdge]);
      m.castShadow = m.receiveShadow = true;
      m.position.set(R.range(-0.035, 0.035), th / 2 + 0.0008 + i * TUNE.stackPitch, R.range(-0.035, 0.035));
      m.rotation.y = R.range(-0.16, 0.16);
      m.userData.home = { position: m.position.clone(), rotationY: m.rotation.y };
      g.add(m);
      sheets.push(m);
    }
    g.userData.sheets = sheets;
    return g;
  }

  // ---- desk: a calm oak-veneer writing desk (fine straight grain, low contrast, no plank seams) + matching roughness.
  // Tileable: grain lines are sin(2π(v·lines + warp)), warp = periodic fbm, so the tile repeats seamlessly.
  let _desk = null;
  function deskTextures() {
    if (_desk) return _desk;
    const T = spec.textures.desk, C = (h) => new THREE.Color(h);
    const dark = C(T.dark), mid = C(T.mid), light = C(T.light);
    // 1D streak noise across the grain (tileable in v), its coordinate bent by a tileable 2D warp: irregular
    // fine streaks of varying width and strength, like sliced oak, never the regular stripes of a sine
    const streak = (y, seed) => { let a = 0.5, f = 1, sum = 0, n = 0; for (let o = 0; o < 3; o++) { sum += a * valueNoise2(y * f, 0.5, seed + o * 17, T.lines * f); n += a; a *= 0.5; f *= 2; } return sum / n; };
    const f = (u, v) => {
      const warp = fbm2(u * 3, v * 3, { seed: T.seed, octaves: 3, period: 3 }) - 0.5;
      const y = v * T.lines + warp * T.warp;
      const g = Math.pow(streak(y, T.seed + 3), 2.2) * 0.75 + (hash01(Math.floor(y * 6), 7, T.seed) - 0.5) * 0.12;
      const blot = fbm2(u * 2, v * 2, { seed: T.seed + 7, octaves: 4, period: 2 });
      return { g, blot };
    };
    const col = paintPixels([T.size, T.size], (u, v, x, y) => {
      const { g, blot } = f(u, v);
      const k = (blot - 0.5) * T.blotch, pore = (hash01(x, y, T.seed) - 0.5) * T.pore;
      const c = light.clone().lerp(mid, clamp(0.35 + blot * 0.5)).lerp(dark, clamp(g * T.contrast));
      return [c.r + k + pore, c.g + k + pore, c.b + k * 0.9 + pore];
    });
    const rough = paintPixels([T.size / 2, T.size / 2], (u, v) => { const { g, blot } = f(u, v); return clamp(T.roughness + g * T.roughVar - (blot - 0.5) * T.roughVar); });
    _desk = { map: canvasTexture(col), rough: canvasTexture(rough, { srgb: false }) };
    return _desk;
  }

  /** table({ size = 40 }) -> calm light-oak desk plane at y = 0 (receives shadows). Name kept for old scenes. */
  function table(o = {}) {
    const size = o.size ?? 40, T = spec.textures.desk;
    const m = materials.table.clone();
    const d = deskTextures();
    m.map = d.map.clone(); m.map.repeat.set(size / T.metresPerTile, size / T.metresPerTile); m.map.needsUpdate = true;
    m.roughnessMap = d.rough.clone(); m.roughnessMap.repeat.copy(m.map.repeat); m.roughnessMap.needsUpdate = true;
    m.roughness = 1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = "table";
    return mesh;
  }
  const desk = table;

  /**
   * contact(model, { opacity, soft, pad }) -> Mesh: a soft contact shadow on the desk under a foldModel (or any group
   * whose userData.posed comes from setPose). Call userData.update() AFTER the model's pose/position are set for this
   * frame: it measures the posed paper near the desk (in the model's yaw frame) and fits a soft rounded rect under it.
   * On only while the model stands (top above spec.contact.stand[0..1] m); fades out as its lowest point lifts. Pure.
   */
  let _softRect = null;
  function contact(model, o = {}) {
    const K = { ...spec.contact, ...o };
    _softRect ??= softRectTexture({ soft: 0.42, radius: 0.3 });
    const mat = new THREE.MeshBasicMaterial({ map: _softRect, color: col(K.color), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = "contactShadow";
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.order = "YXZ";
    m.renderOrder = 1;
    m.name = "contact";
    const plan = model.userData.plan, inner = model.userData.inner, v = new THREE.Vector3();
    m.userData.update = () => {
      const posed = model.userData.posed;
      model.updateWorldMatrix(true, false);
      const yaw = model.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, low = Infinity, high = -Infinity, near = 0, all = 0;
      plan.facets.forEach((f, i) => {
        const M = posed ? posed.M[i] : null;
        for (const [x, z] of f.poly) {
          const p = M ? folds.M4.point(M, [x, 0, z]) : [x, 0, z];
          v.set(p[0], p[1] + inner.position.y, p[2]).applyMatrix4(model.matrixWorld);
          low = Math.min(low, v.y); high = Math.max(high, v.y);
          all++;
          if (v.y > K.reach) continue;
          near++;
          const a = c * v.x - s * v.z, b = s * v.x + c * v.z; // into the model's yaw frame
          x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b);
        }
      });
      // only for paper that STANDS (tall, and only a small share of its corners on the desk; a flat sheet gets its contact from the shadow map, and the bbox of an L-shaped flat
      // model would darken empty desk); fades out as the lowest point lifts off the desk
      const on = isFinite(x0) ? (1 - smoothstep(0, K.reach, low)) * smoothstep(K.stand[0], K.stand[1], high) * (1 - smoothstep(K.nearShare[0], K.nearShare[1], near / all)) : 0;
      m.visible = on > 0.01 && model.visible;
      if (!m.visible) return;
      const w = x1 - x0 + 2 * K.pad, d = z1 - z0 + 2 * K.pad, ca = (x0 + x1) / 2, cb = (z0 + z1) / 2;
      m.position.set(c * ca + s * cb, K.y, -s * ca + c * cb);
      m.rotation.set(-Math.PI / 2, yaw, 0);
      m.scale.set(Math.max(w, K.min), Math.max(d, K.min), 1);
      mat.opacity = K.opacity * on;
    };
    return m;
  }

  /** windowShade() -> invisible shoji lattice between the key light and the table: soft window-bar shadows */
  function windowShade(o = {}) {
    const W = { ...spec.window, ...o };
    const g = new THREE.Group();
    g.name = "windowShade";
    if (!W.enabled || !key) return g;
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const bar = (w, h, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat); b.position.set(x, y, 0); b.castShadow = true; b.receiveShadow = false; g.add(b); };
    for (let i = 1; i <= W.mullions; i++) bar(W.bar, W.height, -W.width / 2 + (i * W.width) / (W.mullions + 1), 0);
    for (let j = 1; j <= W.transoms; j++) bar(W.width, W.bar, 0, -W.height / 2 + (j * W.height) / (W.transoms + 1));
    const tgt = key.target.position.clone(), L = key.position.clone().sub(tgt).normalize();
    g.position.copy(tgt).addScaledVector(L, W.distance);
    g.lookAt(key.position);
    g.translateX(W.offset[0]); g.translateY(W.offset[1]);
    return g;
  }

  /**
   * tag(text, { kicker?, seal = "折", width? }) -> Mesh for the OVERLAY: a washi strip with ink type, a vermilion seal
   * and deckled ends. Origin = left edge, vertical centre; 1 unit = strip height. userData.setReveal(u) slides the
   * strip out from the left (0..1); userData.aspect. Pin with kit pinToScreen(stage, tag, { x, y, height }).
   */
  function tag(text, o = {}) {
    const L = spec.label, k = L.pxPerUnit;
    const font = spec.text.font, wt = spec.text.weight;
    const mainPx = Math.round(L.mainSize * k), kickPx = Math.round(L.kickerSize * k);
    const kicker = o.kicker ?? null;
    const meas = makeCanvas(8, 8).getContext("2d");
    const spacing = (px) => `${(L.letterSpacing * px).toFixed(1)}px`;
    meas.font = `${wt} ${mainPx}px ${font}`; if ("letterSpacing" in meas) meas.letterSpacing = spacing(mainPx);
    const wMain = meas.measureText(text).width;
    meas.font = `${wt} ${kickPx}px ${font}`; if ("letterSpacing" in meas) meas.letterSpacing = spacing(kickPx);
    const wKick = kicker ? meas.measureText(kicker).width : 0;
    const sealPx = Math.round(L.sealSize * k), padX = L.padX * k, padY = L.padY * k, gap = 0.32 * k, M = Math.round(0.22 * k);
    const innerH = (kicker ? kickPx * 1.2 : 0) + mainPx * 1.05;
    const H = Math.round(innerH + 2 * padY), Wd = Math.round(padX * 2 + sealPx + gap + Math.max(wMain, wKick));
    const c = makeCanvas(Wd + 2 * M, H + 2 * M), x = c.getContext("2d");
    const R = rng(o.seed ?? text.length * 7 + 3);
    // deckled outline (torn ends, cut top/bottom)
    const pts = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) pts.push([M + Wd - R.range(0, L.deckle * k), M + (i * H) / steps]);
    for (let i = steps; i >= 0; i--) pts.push([M + R.range(0, L.deckle * k), M + (i * H) / steps]);
    const path = () => { x.beginPath(); x.moveTo(pts[0][0], M); x.lineTo(...pts[0]); pts.forEach((p) => x.lineTo(p[0], p[1])); x.closePath(); };
    x.save(); path(); x.shadowColor = `rgba(70,50,30,${L.shadow})`; x.shadowBlur = 0.12 * k; x.shadowOffsetY = 0.05 * k; x.fillStyle = col("strip"); x.fill(); x.restore();
    x.save(); path(); x.clip();
    x.fillStyle = col("strip"); x.fillRect(0, 0, c.width, c.height);
    // fibre
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data, seed = 11;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      const i = (yy * c.width + xx) * 4;
      if (d[i + 3] === 0) continue;
      const f = (fbm2(xx / 90, yy / 9, { seed, octaves: 2, period: 64 }) - 0.5) * L.fibre * 255 + (hash01(xx, yy, seed) - 0.5) * 7;
      d[i] = clamp(d[i] + f, 0, 255); d[i + 1] = clamp(d[i + 1] + f, 0, 255); d[i + 2] = clamp(d[i + 2] + f * 1.1, 0, 255);
    }
    x.putImageData(img, 0, 0);
    x.restore();
    // re-draw shadow under (putImageData replaced it inside the clip only)
    // seal
    const sx = M + padX, sy = M + (H - sealPx) / 2;
    x.save();
    x.fillStyle = col("hanko");
    const rr = sealPx * 0.12;
    x.beginPath(); x.moveTo(sx + rr, sy); x.arcTo(sx + sealPx, sy, sx + sealPx, sy + sealPx, rr); x.arcTo(sx + sealPx, sy + sealPx, sx, sy + sealPx, rr); x.arcTo(sx, sy + sealPx, sx, sy, rr); x.arcTo(sx, sy, sx + sealPx, sy, rr); x.closePath(); x.fill();
    x.fillStyle = col("strip"); x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `700 ${Math.round(sealPx * 0.66)}px ${font}`;
    x.fillText(o.seal ?? L.seal, sx + sealPx / 2, sy + sealPx / 2 + sealPx * 0.03);
    // ink wear on the seal
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 40; i++) { x.globalAlpha = R.range(0.05, 0.25); x.beginPath(); x.arc(sx + R.range(0, sealPx), sy + R.range(0, sealPx), R.range(1, sealPx * 0.06), 0, Math.PI * 2); x.fill(); }
    x.restore();
    // type
    const tx = sx + sealPx + gap;
    x.fillStyle = col("sumi"); x.textAlign = "left"; x.textBaseline = "alphabetic";
    let ty = M + padY;
    if (kicker) {
      x.font = `${wt} ${kickPx}px ${font}`; if ("letterSpacing" in x) x.letterSpacing = spacing(kickPx);
      x.fillStyle = col("hanko");
      ty += kickPx * 0.95; x.fillText(kicker, tx, ty); ty += kickPx * 0.25;
      x.fillStyle = col("sumi");
    }
    x.font = `${wt} ${mainPx}px ${font}`; if ("letterSpacing" in x) x.letterSpacing = spacing(mainPx);
    ty += mainPx * 0.86; x.fillText(text, tx, ty);
    const tex = canvasTexture(c);
    const aspect = c.width / c.height;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, -0.5, 0, aspect, -0.5, 0, aspect, 0.5, 0, 0, 0.5, 0], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `tag:${text}`;
    mesh.renderOrder = 10;
    mesh.userData.aspect = aspect;
    mesh.userData.units = c.height / k; // strip height in label units (pin height = unit x units)
    mesh.userData.setReveal = (u) => {
      u = clamp(u);
      const pa = geo.attributes.position.array, ua = geo.attributes.uv.array;
      pa[3] = pa[6] = aspect * u; ua[2] = ua[4] = u;
      geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
      mesh.visible = u > 0.001;
    };
    return mesh;
  }

  const props = { foldModel, sheet, sheetStack, table, desk, contact, windowShade, tag };
  const factories = {
    table: (s) => table({ size: s.dims?.size ?? 40 }),
    foldModel: (s) => foldModel({ model: s.dims?.model ?? "dart", modelOpts: s.dims?.modelOpts ?? {}, front: s.dims?.front, back: s.dims?.back, pattern: s.dims?.pattern, seed: s.dims?.seed }),
    sheetStack: (s) => sheetStack(s.dims ?? {}),
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    helpers: { paperSet, chiyogamiCanvas, patternTexture, creaseTexture },
    motion: folds, plan: folds,
  };
}
