// styles/endless-zoom/style.js — "Endless Zoom": one unbroken zoom inward through nested worlds that ends where it began.
// The look lives in spec.js; WHEN each world is on screen, at what scale, how far faded in, which label and which sound
// lives in zoom.js (THREE-free planner shared with SCORE). This file turns the plan into pictures:
//   - six world builders (chat, tokens, numbers, network, chip, switch), each a small bright 3D relief authored at unit
//     size around a portal at its origin; every builder is told the portal's outline and face colour (= next world);
//   - zoomWorld(plan, chain): scales the outer world directly and renders the inner world into a half-float target that
//     the outer world's PORTAL WINDOW (a rounded-rect / circle SDF mesh on the portal face) shows with the plan's alpha.
//     The same camera renders both passes, so the inner world's 3D relief and parallax are exact through the window;
//   - the camera: a fixed dolly distance (the zoom is the world's scale) with a periodic sway for parallax;
//   - an overlay caption chip with the current world's colour key.
// Props never animate themselves: the scene calls world.update(t).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { softRectTexture, blobTexture, gridTexture, newCanvas } from "../../kit/textures.js";
import { rng, hash01, clamp } from "../../kit/time.js";
import * as zoom from "./zoom.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const FRAME = { hw: 8 / 9, hh: 0.5 }; // a level's frame at scale 1 (16:9, height 1)

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, RL = spec.relief, G = spec.glow;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const font = FONTS[spec.text.font] ?? spec.text.font;
  const textStyle = { font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- shared building blocks
  const matCache = new Map();
  /** mat(color, { rough, metal, emissive, glow, own }) -> MeshStandardMaterial (cached unless own) */
  function mat(color, o = {}) {
    const key = JSON.stringify([color, o]);
    if (!o.own && matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0 });
    if (o.glow) { m.emissive = new THREE.Color(o.emissive ?? color); m.emissiveIntensity = o.glow; }
    m.name = `ez:${color}`;
    if (!o.own) matCache.set(key, m);
    return m;
  }
  const flatMat = (color, map) => { const m = new THREE.MeshBasicMaterial({ color, map: map ?? null }); m.name = `ez-flat:${color}`; return m; };

  /** glowInstanced(color, intensity): standard material whose emission is scaled per instance by attribute aGlow. */
  function glowInstanced(color, intensity, o = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.45, metalness: 0, emissive: new THREE.Color(o.emissive ?? color), emissiveIntensity: intensity });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;");
    };
    m.customProgramCacheKey = () => "ez-glow-instanced";
    m.name = `ez-glow:${color}`;
    return m;
  }

  /** rrShape(w, h, r) -> THREE.Shape: centred rounded rectangle (r = w/2 = h/2 gives a circle). */
  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.max(1e-5, Math.min(r, w / 2, h / 2));
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  const geoCache = new Map();
  /** slabGeo(w, h, r, depth, bevel): extruded rounded rect, outer size w x h, TOP FACE AT z = 0, bottom at -depth. */
  function slabGeo(w, h, r, depth, bevel = RL.bevel) {
    const key = [w, h, r, depth, bevel].map((v) => v.toFixed(5)).join();
    if (geoCache.has(key)) return geoCache.get(key);
    const bs = Math.min(bevel, w / 5, h / 5, depth / 3);
    const sw = w - 2 * bs, sh = h - 2 * bs;
    const g = new THREE.ExtrudeGeometry(rrShape(sw, sh, r - bs), {
      depth: Math.max(1e-5, depth - 2 * bs), bevelEnabled: bs > 1e-5, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 14,
    });
    g.translate(0, 0, -(depth - bs));
    g.computeVertexNormals();
    geoCache.set(key, g);
    return g;
  }
  /** slab(w, h, r, depth, material, x, y, zTop) -> Mesh */
  function slab(w, h, r, depth, material, x = 0, y = 0, zTop = 0) {
    const m = new THREE.Mesh(slabGeo(w, h, r, depth), material);
    m.position.set(x, y, zTop);
    return m;
  }
  const shadowTex = softRectTexture({ soft: RL.shadow.soft, radius: 0.14, size: 128 });
  const roundShadowTex = blobTexture({ size: 128, stops: [[0, 1], [0.55, 0.85], [0.8, 0.3], [1, 0]] });
  /** dropShadow(w, h, x, y, z, { round, opacity, offset }) -> soft shadow plane on the level's floor */
  function dropShadow(w, h, x, y, z, o = {}) {
    const k = 1 + 2 * RL.shadow.soft, off = o.offset ?? 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.round ? w * 1.25 : w * k, o.round ? h * 1.25 : h * k), new THREE.MeshBasicMaterial({
      map: o.round ? roundShadowTex : shadowTex, color: P.shadow, transparent: true, opacity: o.opacity ?? RL.shadow.opacity, depthWrite: false,
    }));
    m.position.set(x + RL.shadow.dx * off, y + RL.shadow.dy * off, z);
    m.name = "shadow";
    return m;
  }

  // text: measure in world units with one CPU canvas, then create each label at the resolution its zoom range needs
  const measureCtx = newCanvas(8, 8).getContext("2d");
  /** textWidth(str, em, weight) -> world width of the glyph run at em size em */
  function textWidth(str, em, weight = 800) {
    measureCtx.font = `${weight} 100px ${font}`;
    return (measureCtx.measureText(str).width / 100) * em;
  }
  /** fontPx(em, nearX, nearY, maxS): canvas px so the word stays crisp up to the largest scale at which it is on screen */
  function fontPx(em, nearX, nearY, maxS) {
    const sMax = Math.min(maxS, FRAME.hw / Math.max(Math.abs(nearX), 0.04), FRAME.hh / Math.max(Math.abs(nearY), 0.04));
    return Math.round(clamp(em * 1080 * sMax * 1.1, 96, 640) / 16) * 16;
  }
  /** word(str, { em, x (left edge), y (centre), z, color, weight, maxS }) -> label mesh placed in level units */
  function word(str, o) {
    const em = o.em, w = textWidth(str, em, o.weight ?? 800);
    const near = (a, b) => (a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)));
    const px = fontPx(em, near(o.x, o.x + w), near(o.y - em * 0.4, o.y + em * 0.4), o.maxS ?? 8);
    const pad = 0.12;
    const m = createTextLabel(str, { height: em, fontSize: px, font, weight: o.weight ?? 800, color: o.color ?? P.ink, padding: pad, align: "left" });
    m.position.set(o.x - em * pad + m.scale.x / 2, o.y + em * 0.035, o.z ?? 0.0015);
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; m.material.polygonOffsetUnits = -2;
    m.userData.width = w;
    return m;
  }

  // ---------------------------------------------------------------- level shell + portal window
  function levelShell(id, bg, map) {
    const group = new THREE.Group(); group.name = `level:${id}`; group.visible = false;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), flatMat(bg, map));
    card.position.z = RL.bgDepth; card.name = `bg:${id}`; group.add(card);
    return { group, card };
  }
  /**
   * portalWindow(shape) -> Mesh: a plane exactly covering the portal outline; its shader masks the outline with an
   * anti-aliased rounded-box SDF and shows the inner world's render target, sampled at the same screen pixel.
   */
  function portalWindow(shape, rt) {
    const geo = new THREE.PlaneGeometry(shape.hw * 2.02, shape.hh * 2.02);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      name: "portal-window", transparent: true, depthWrite: false,
      uniforms: {
        tInner: { value: rt.texture }, uAlpha: { value: 0 }, uRes: { value: new THREE.Vector2(stage.width, stage.height) },
        uB: { value: new THREE.Vector2(shape.hw, shape.hh) }, uR: { value: shape.r },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tInner; uniform float uAlpha; uniform vec2 uRes; uniform vec2 uB; uniform float uR;
        varying vec2 vP;
        void main() {
          vec2 q = abs(vP) - uB + uR;
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;
          float aa = max(fwidth(d), 1e-6);
          float m = 1.0 - smoothstep(-aa, aa, d);
          vec3 c = texture2D(tInner, gl_FragCoord.xy / uRes).rgb;
          gl_FragColor = vec4(c, uAlpha * m);
        }`,
    }));
    m.name = "portal-window";
    m.renderOrder = 4;
    m.position.z = spec.zoom.portalLift;
    m.visible = false;
    return m;
  }

  // ================================================================ WORLD BUILDERS
  // Each: (ctx) -> { group, update(local, t, S) }. ctx = { portal: {hw,hh,r,kind}, face: next bg colour, bg, R, blink(t), ... }
  // Portal face top at z = 0; the window floats spec.zoom.portalLift above it.

  // ---------------------------------------------------------------- 0. chat app: an answer bubble ending in a glowing cursor
  function buildChat(ctx) {
    const { group } = levelShell("chat", P.chat);
    const C = ctx.portal, em = 0.066, lineGap = 0.112, zBub = -0.014, zPanel = -0.032, zSh = zPanel + 0.0012;
    const cursorRight = -C.hw - 0.024; // last line ends here
    // answer text: two lines, the second ends at the cursor
    const l2 = ["like", "this"], l1 = ["One", "word", "at", "a", "time,"];
    const sp = em * 0.28, wl2 = l2.reduce((a, s) => a + textWidth(s, em), 0) + sp * (l2.length - 1);
    const x0 = cursorRight - wl2;
    const line = (words, y) => { let x = x0; for (const s of words) { const m = word(s, { em, x, y, z: zBub + 0.0015, maxS: ctx.R }); group.add(m); x += m.userData.width + sp; } return x; };
    const right1 = line(l1, lineGap);
    line(l2, 0);
    // answer bubble (white), slight tail at bottom-left
    const bx0 = x0 - 0.055, bx1 = Math.max(right1, 0) + 0.06, by0 = -0.072, by1 = lineGap + 0.068;
    const bw = bx1 - bx0, bh = by1 - by0;
    group.add(slab(bw, bh, 0.05, 0.02, mat(P.bubble, { rough: 0.6 }), (bx0 + bx1) / 2, (by0 + by1) / 2, zBub));
    group.add(dropShadow(bw, bh, (bx0 + bx1) / 2, (by0 + by1) / 2, zSh));
    // avatar: a coral disc with a small four-point star, left of the bubble's foot
    const av = [bx0 - 0.075, by0 + 0.035];
    group.add(slab(0.08, 0.08, 0.04, 0.016, mat(P.cursor, { rough: 0.45 }), av[0], av[1], zBub));
    group.add(dropShadow(0.08, 0.08, av[0], av[1], zSh, { round: true }));
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.009 : 0.026; i ? star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const starM = new THREE.Mesh(new THREE.ShapeGeometry(star), mat(P.white, { glow: 0.3 })); starM.position.set(av[0], av[1], zBub + 0.001); group.add(starM);
    // the question, top right (user bubble, blue)
    const qEm = 0.058, q = ["How", "do", "you", "answer?"], qsp = qEm * 0.28;
    const qw = q.reduce((a, s) => a + textWidth(s, qEm), 0) + qsp * (q.length - 1);
    const qx1 = 0.62, qx0 = qx1 - qw, qy = 0.33;
    group.add(slab(qw + 0.1, 0.12, 0.05, 0.02, mat(P.userBubble, { rough: 0.5 }), (qx0 + qx1) / 2, qy, zBub));
    group.add(dropShadow(qw + 0.1, 0.12, (qx0 + qx1) / 2, qy, zSh));
    { let x = qx0; for (const s of q) { const m = word(s, { em: qEm, x, y: qy, z: zBub + 0.0015, color: P.white, maxS: 3 }); group.add(m); x += m.userData.width + qsp; } }
    // the app window: a light panel on the world's peach key, a sidebar of conversations, a header
    const panelMat = mat(P.panel, { rough: 0.8 });
    group.add(slab(1.72, 0.92, 0.06, 0.016, panelMat, 0, 0.0, zPanel));
    group.add(dropShadow(1.72, 0.92, 0, 0, RL.bgDepth + 0.001, { opacity: 0.22, offset: 1.5 }));
    group.add(slab(0.2, 0.86, 0.04, 0.008, mat(P.sidebar, { rough: 0.8 }), -0.74, -0.0, zPanel + 0.004));
    for (let i = 0; i < 6; i++) {
      const y = 0.33 - i * 0.12;
      group.add(slab(0.16, 0.085, 0.03, 0.006, mat(i === 0 ? "#ffd0b2" : "#fff6ef", { rough: 0.7 }), -0.74, y, zPanel + 0.008));
      group.add(slab(0.1 - (i % 3) * 0.018, 0.016, 0.008, 0.003, mat("#d9c3b4"), -0.75 - (i % 3) * 0.009, y, zPanel + 0.0095));
    }
    group.add(slab(1.36, 0.075, 0.03, 0.006, mat("#fff9f4", { rough: 0.8 }), 0.16, 0.405, zPanel + 0.004));
    group.add(slab(0.05, 0.05, 0.025, 0.006, mat(P.cursor), -0.48, 0.405, zPanel + 0.007));
    group.add(slab(0.26, 0.02, 0.01, 0.003, mat("#cdb8a8"), -0.29, 0.405, zPanel + 0.0075));
    // input bar at the bottom: field + placeholder + send button
    const iy = -0.245;
    group.add(slab(1.3, 0.1, 0.05, 0.02, mat(P.inputBar, { rough: 0.6 }), 0.1, iy, zBub));
    group.add(dropShadow(1.3, 0.1, 0.1, iy, zSh, { opacity: 0.18 }));
    group.add(word("Message", { em: 0.05, x: -0.5, y: iy, z: zBub + 0.0015, color: P.placeholder, weight: 600, maxS: 2.5 }));
    group.add(slab(0.075, 0.075, 0.0375, 0.016, mat(P.cursor), 0.68, iy, zBub + 0.004));
    const arrow = new THREE.Shape([[0, 0.022], [0.018, 0.002], [0.007, 0.002], [0.007, -0.02], [-0.007, -0.02], [-0.007, 0.002], [-0.018, 0.002]].map(([x, y]) => new THREE.Vector2(x, y)));
    const arrowM = new THREE.Mesh(new THREE.ShapeGeometry(arrow), mat(P.white)); arrowM.position.set(0.68, iy, zBub + 0.0055); group.add(arrowM);
    // THE CURSOR = portal: a raised coral pill whose face is the token world's colour; it blinks by glowing
    const cursorMat = mat(P.cursor, { glow: G.cursor, rough: 0.4, own: true });
    const cursor = slab(C.hw * 2, C.hh * 2, C.r, 0.016, cursorMat, 0, 0, 0);
    group.add(cursor);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 3.4, C.hh * 4.2), new THREE.MeshBasicMaterial({ map: roundShadowTex, color: P.cursor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }));
    halo.position.z = zBub + 0.001; group.add(halo);
    return {
      group,
      update(local, t) {
        const b = ctx.blink(t);
        cursorMat.emissiveIntensity = G.cursor * (0.35 + 0.65 * b);
        halo.material.opacity = 0.06 + 0.2 * b;
      },
    };
  }

  // ---------------------------------------------------------------- 1. tokens: the text cut into coloured tiles
  function buildTokens(ctx) {
    const { group } = levelShell("tokens", P.tokens);
    const C = ctx.portal, th = C.hh * 2, pitch = th + 0.05, em = 0.082, gap = 0.034, depth = 0.04;
    const rows = {
      3: ["The", "model", "reads", "tok", "ens", "not", "letters", "at", "all"],
      2: ["Every", "word", "is", "split", "into", "tok", "ens", "first"],
      1: ["Sure", "!", "I", "build", "each", "an", "swer", "slow", "ly"],
      0: { left: ["One", "word", "at", "a", "time", ",", "like"], right: ["is", "next", "up", "now"] },
      [-1]: ["Each", "token", "is", "a", "piece", "of", "a", "word"],
      [-2]: ["play", "ing", "think", "ing", "token", "izer", "split", "s"],
      [-3]: ["sub", "word", "pieces", "make", "every", "thing"],
    };
    const tiles = [];
    let colour = 0;
    const addTile = (str, x, y, w, ri) => {
      const g = new THREE.Group(); g.position.set(x, y, 0);
      const c = P.tilePastels[colour++ % P.tilePastels.length];
      g.add(slab(w, th, C.r, depth, mat(c, { rough: 0.55 })));
      const near = Math.max(0, Math.abs(x) - w / 2);
      g.add(word(str, { em, x: -textWidth(str, em) / 2, y: 0, z: 0.0015, color: P.tileInk, maxS: Math.min(ctx.R, FRAME.hw / Math.max(near, 0.04), FRAME.hh / Math.max(Math.abs(y) - th / 2, 0.04)) }));
      group.add(g);
      group.add(dropShadow(w, th, x, y, RL.bgDepth + 0.001));
      tiles.push({ g, ph: hash01(tiles.length, 7) * Math.PI * 2, ri });
    };
    const widthOf = (s) => Math.max(0.15, textWidth(s, em) + 0.1);
    for (const [rk, list] of Object.entries(rows)) {
      const ri = +rk, y = ri * pitch;
      if (ri === 0) {
        // centre row: the portal tile at the origin, words packed outward on both sides
        let x = -C.hw - gap;
        for (const s of [...list.left].reverse()) { const w = widthOf(s); addTile(s, x - w / 2, y, w, 0); x -= w + gap; }
        x = C.hw + gap;
        for (let i = 0; x < 1.15; i++) { const s = list.right[i % list.right.length], w = widthOf(s); addTile(s, x + w / 2, y, w, 0); x += w + gap; }
        continue;
      }
      let x = -1.2 + hash01(ri + 9, 3) * 0.2;
      for (let i = 0; x < 1.2; i++) { const s = list[i % list.length], w = widthOf(s); addTile(s, x + w / 2, y, w, ri); x += w + gap; }
    }
    // THE PORTAL TILE: electric blue (the numbers world), white text
    const portal = new THREE.Group();
    portal.add(slab(C.hw * 2, C.hh * 2, C.r, depth + 0.01, mat(ctx.face, { rough: 0.45 })));
    const portalWord = word("this", { em, x: -textWidth("this", em) / 2, y: 0, z: 0.0015, color: P.white, maxS: ctx.R });
    portal.add(portalWord);
    group.add(portal);
    group.add(dropShadow(C.hw * 2, C.hh * 2, 0, 0, RL.bgDepth + 0.001, { opacity: 0.34 }));
    return {
      group,
      update(local, t, S, innerAlpha = 0) {
        portalWord.material.opacity = 1 - clamp(innerAlpha * 2.2);
        portalWord.visible = innerAlpha < 0.46;
        for (const tl of tiles) tl.g.position.z = -0.012 + 0.009 * Math.sin(local * 2.4 + tl.ph + tl.ri * 0.7);
      },
    };
  }

  // ---------------------------------------------------------------- 2. numbers: one token as a column of glowing values
  function buildNumbers(ctx) {
    const grid = gridTexture({ size: 256, cells: 4, line: 2, bg: P.numbers, fg: P.grid, repeat: [28, 28] });
    const { group } = levelShell("numbers", P.numbers, grid);
    const C = ctx.portal, pitch = C.hh * 2 + 0.068, axis = -0.74, railEnd = 0.74;
    const rows = [-2, -1, 0, 1, 2];
    const base = { [-2]: 0.42, [-1]: -0.34, 0: 0, 1: 0.5, 2: -0.18 };
    const knobMat = mat(P.knob, { glow: G.knob, rough: 0.35 });
    const litMat = mat(P.railLit, { glow: G.railLit, rough: 0.4 });
    const railMat = mat(P.rail, { rough: 0.5 });
    const items = rows.map((ri) => {
      const y = ri * pitch;
      group.add(slab(railEnd - axis, 0.036, 0.018, 0.02, railMat, (axis + railEnd) / 2, y, -0.03));
      const lit = slab(1, 0.05, 0.004, 0.02, litMat, 0, y, -0.022);
      group.add(lit);
      const knob = ri === 0 ? null : slab(C.hw * 2, C.hh * 2, C.r, 0.05, knobMat, base[ri], y, -0.004);
      if (knob) group.add(knob);
      const sh = dropShadow(C.hw * 2, C.hh * 2, base[ri], y, RL.bgDepth + 0.001, { opacity: 0.3 });
      group.add(sh);
      return { ri, y, lit, knob, sh, ph: hash01(ri + 4, 11) * 6.28 };
    });
    // the portal knob: gold face (the network world), raised to z = 0
    group.add(slab(C.hw * 2, C.hh * 2, C.r, 0.054, mat(ctx.face, { glow: G.knob, rough: 0.35 }), 0, 0, 0));
    // the vector's brackets
    const bm = mat(P.bracket, { rough: 0.5 });
    for (const s of [-1, 1]) {
      const x = s * 0.86;
      group.add(slab(0.032, 1.3, 0.012, 0.03, bm, x, 0, -0.01));
      group.add(slab(0.1, 0.032, 0.012, 0.03, bm, x - s * 0.034, 0.634, -0.01));
      group.add(slab(0.1, 0.032, 0.012, 0.03, bm, x - s * 0.034, -0.634, -0.01));
    }
    return {
      group,
      update(local) {
        for (const it of items) {
          const v = it.ri === 0 ? 0 : base[it.ri] + 0.07 * Math.sin(local * 1.9 + it.ph);
          if (it.knob) { it.knob.position.x = v; it.sh.position.x = v + RL.shadow.dx; }
          const len = Math.max(0.001, v - axis);
          it.lit.scale.x = len; it.lit.position.x = axis + len / 2;
        }
      },
    };
  }

  // ---------------------------------------------------------------- 3. network: layers of nodes, pulses flowing right
  function buildNetwork(ctx) {
    const { group } = levelShell("network", P.network);
    const C = ctx.portal, deep = -0.36;
    group.children[0].position.z = deep;
    const layers = [
      { x: -1.2, z: -0.2, ys: [-0.9, -0.45, 0, 0.45, 0.9] },
      { x: -0.6, z: -0.1, ys: [-0.675, -0.225, 0.225, 0.675] },
      { x: 0, z: 0, ys: [-0.9, -0.45, 0, 0.45, 0.9] },
      { x: 0.6, z: -0.1, ys: [-0.675, -0.225, 0.225, 0.675] },
      { x: 1.2, z: -0.2, ys: [-0.9, -0.45, 0, 0.45, 0.9] },
    ];
    const nodeR = 0.15, nodes = [];
    for (const [li, L] of layers.entries()) for (const y of L.ys) nodes.push({ li, x: L.x, y, z: L.z, portal: L.x === 0 && y === 0 });
    const bodyMat = mat(P.node, { rough: 0.35 }), rimMat = mat(P.nodeRim, { rough: 0.5 });
    for (const n of nodes) {
      const r = n.portal ? C.hw + 0.022 : nodeR;
      group.add(slab(r * 2, r * 2, r, 0.05, bodyMat, n.x, n.y, n.z - 0.0015));
      if (!n.portal) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.8, 48), rimMat);
        ring.position.set(n.x, n.y, n.z + 0.0005); group.add(ring);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 32), rimMat);
        dot.position.set(n.x, n.y, n.z + 0.0005); group.add(dot);
      }
      const k = (n.z - deep) / 0.36;
      group.add(dropShadow(r * 2, r * 2, n.x, n.y, deep + 0.001, { round: true, offset: 1 + 2.4 * k, opacity: 0.22 }));
    }
    // the portal node's face: green (the chip world)
    group.add(slab(C.hw * 2, C.hh * 2, C.r, 0.002, mat(ctx.face, { rough: 0.45 }), 0, 0, 0));
    // links: every node to every node in the next layer (one instanced cylinder)
    const links = [];
    for (const a of nodes) for (const b of nodes) if (b.li === a.li + 1) links.push([a, b]);
    const cyl = new THREE.CylinderGeometry(0.011, 0.011, 1, 8, 1); cyl.rotateX(Math.PI / 2);
    const linkMesh = new THREE.InstancedMesh(cyl, mat(P.link, { rough: 0.5 }), links.length);
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), m4 = new THREE.Matrix4(), fwd = new THREE.Vector3(0, 0, 1);
    links.forEach(([a, b], i) => {
      const A = new THREE.Vector3(a.x, a.y, a.z - 0.03), B = new THREE.Vector3(b.x, b.y, b.z - 0.03);
      v.subVectors(B, A); const len = v.length();
      q.setFromUnitVectors(fwd, v.clone().normalize()); sc.set(1, 1, len);
      m4.compose(A.clone().add(B).multiplyScalar(0.5), q, sc); linkMesh.setMatrixAt(i, m4);
    });
    group.add(linkMesh);
    // pulses: one bead per link, travelling left -> right on the level's own clock
    const bead = new THREE.SphereGeometry(0.026, 16, 10);
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(links.length).fill(1), 1); bead.setAttribute("aGlow", glow);
    const pulses = new THREE.InstancedMesh(bead, glowInstanced(P.pulse, G.pulse), links.length);
    pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pulses.frustumCulled = false; linkMesh.frustumCulled = false;
    group.add(pulses);
    const phases = links.map((_, i) => hash01(i, 21));
    const dummy = new THREE.Object3D();
    return {
      group,
      update(local) {
        links.forEach(([a, b], i) => {
          const u = (((local * 0.85 + phases[i]) % 1) + 1) % 1;
          const vis = u > 0.12 && u < 0.88 ? 1 : 0;
          dummy.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z - 0.03 + (b.z - a.z) * u + 0.012);
          dummy.scale.setScalar(vis * (0.7 + 0.3 * Math.sin(u * Math.PI)));
          dummy.updateMatrix(); pulses.setMatrixAt(i, dummy.matrix);
        });
        pulses.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- 4. chip: a package on a board, its die a grid of switches
  function buildChip(ctx) {
    const { group } = levelShell("chip", P.chip);
    const C = ctx.portal, zPcb = RL.bgDepth;
    // gold traces fanning out from the pins (45-degree bends), one merged geometry
    const tr = rng("ez-traces"), seg = [];
    const ribbon = (ax, ay, bx, by, w) => {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), g = new THREE.PlaneGeometry(len + w, w);
      g.rotateZ(Math.atan2(dy, dx)); g.translate((ax + bx) / 2, (ay + by) / 2, zPcb + 0.0008); seg.push(g);
    };
    const pins = 14, pkg = 0.92, pinPitch = (pkg - 0.12) / (pins - 1);
    for (let s = 0; s < 4; s++) for (let i = 0; i < pins; i++) {
      const u = -pkg / 2 + 0.06 + i * pinPitch, out = 0.53;
      const rot = (x, y) => [[x, y], [-y, x], [-x, -y], [y, -x]][s];
      const bend = 0.08 + tr.range(0, 0.25), len = 0.3 + tr.range(0, 0.9), dir = Math.sign(u) || 1;
      const p0 = rot(u, out), p1 = rot(u, out + bend), p2 = rot(u + dir * 0.12, out + bend + 0.12), p3 = rot(u + dir * 0.12, out + bend + 0.12 + len);
      ribbon(...p0, ...p1, 0.012); ribbon(...p1, ...p2, 0.012); ribbon(...p2, ...p3, 0.012);
      const via = new THREE.CircleGeometry(0.018, 16); via.translate(p3[0], p3[1], zPcb + 0.001); seg.push(via);
    }
    group.add(new THREE.Mesh(mergeGeometries(seg.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute("uv"); return g; })), mat(P.pcbTrace, { rough: 0.35, metal: 0.5 })));
    // package, pins, die
    group.add(dropShadow(pkg, pkg, 0, 0, zPcb + 0.002, { opacity: 0.4, offset: 1.6 }));
    group.add(slab(pkg, pkg, 0.03, 0.05, mat(P.chipBody, { rough: 0.5 }), 0, 0, -0.02));
    const pinGeo = slabGeo(0.032, 0.09, 0.006, 0.014), pinMat = mat(P.chipPin, { rough: 0.3, metal: 0.6 });
    for (let s = 0; s < 4; s++) for (let i = 0; i < pins; i++) {
      const u = -pkg / 2 + 0.06 + i * pinPitch, m = new THREE.Mesh(pinGeo, pinMat);
      const r = pkg / 2 + 0.03;
      m.position.set(...[[u, r], [-r, u], [-u, -r], [r, -u]][s], -0.05); m.rotation.z = (s * Math.PI) / 2; group.add(m);
    }
    const die = 0.76;
    group.add(slab(die, die, 0.02, 0.014, mat(P.die, { rough: 0.3, metal: 0.55 }), 0, 0, -0.006));
    // the switch grid (instanced, per-cell glow from the level clock), the centre cell left out (it is the portal)
    const px = C.hw * 2 + 0.016, py = C.hh * 2 + 0.018, cols = 7, rowsN = 9, cells = [];
    for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
      const x = (i - (cols - 1) / 2) * px, y = (j - (rowsN - 1) / 2) * py;
      if (i === (cols - 1) / 2 && j === (rowsN - 1) / 2) continue;
      cells.push({ x, y, i: cells.length });
    }
    const cg = slabGeo(C.hw * 2, C.hh * 2, C.r, 0.006).clone();
    const cglow = new THREE.InstancedBufferAttribute(new Float32Array(cells.length), 1); cglow.setUsage(THREE.DynamicDrawUsage); cg.setAttribute("aGlow", cglow);
    const cellMesh = new THREE.InstancedMesh(cg, glowInstanced(P.cell, G.cellLit, { emissive: P.cellLit }), cells.length);
    const d = new THREE.Object3D();
    for (const c of cells) { d.position.set(c.x, c.y, 0); d.updateMatrix(); cellMesh.setMatrixAt(c.i, d.matrix); }
    group.add(cellMesh);
    // the portal cell: violet (the switch world)
    group.add(slab(C.hw * 2, C.hh * 2, C.r, 0.0065, mat(ctx.face, { rough: 0.4 }), 0, 0, 0));
    return {
      group,
      update(local) {
        const bin = Math.floor(local * 7 + 100);
        for (const c of cells) cglow.setX(c.i, hash01(c.i, bin, 5) > 0.64 ? 1 : 0);
        cglow.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- 5. switch: two contacts, a gate, a spark across the gap
  function buildSwitch(ctx) {
    const pattern = gridTexture({ size: 256, cells: 2, line: 3, bg: P.switch, fg: "#9a60ff", repeat: [20, 20] });
    const { group } = levelShell("switch", P.switch, pattern);
    const C = ctx.portal;
    const padMat = mat(P.pad, { rough: 0.38, metal: 0.15 });
    for (const s of [-1, 1]) {
      const w = 0.78, x = s * (C.hw + 0.07 + w / 2);
      group.add(slab(w, 0.36, 0.06, 0.07, padMat, x, 0, -0.006));
      group.add(dropShadow(w, 0.36, x, 0, RL.bgDepth + 0.001, { opacity: 0.34, offset: 1.4 }));
      group.add(slab(w * 0.7, 0.05, 0.02, 0.012, mat("#ffe39a", { rough: 0.3, metal: 0.4 }), x, 0.11, -0.004));
    }
    const gateMat = mat(P.gate, { glow: G.gate, rough: 0.4, own: true });
    group.add(slab(0.8, 0.11, 0.04, 0.04, gateMat, 0, 0.33, -0.01));
    group.add(dropShadow(0.8, 0.11, 0, 0.33, RL.bgDepth + 0.001, { opacity: 0.3 }));
    group.add(slab(0.8, 0.06, 0.02, 0.03, mat("#6c35d6", { rough: 0.5 }), 0, -0.3, -0.02));
    // arcs: jagged ribbons from the spark to the contacts, three variants per side, one shown per blink cycle
    const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.arc).multiplyScalar(G.arc), transparent: true, depthWrite: false });
    arcMat.name = "ez-arc";
    const variants = [0, 1, 2].map((vi) => {
      const r = rng(`ez-arc-${vi}`), parts = [];
      for (const s of [-1, 1]) for (let b = 0; b < 2; b++) {
        const pts = [[s * C.hw * 0.8, r.range(-0.03, 0.03)]], end = [s * (C.hw + 0.075), r.range(-0.12, 0.12)];
        for (let k = 1; k < 5; k++) { const u = k / 5; pts.push([pts[0][0] + (end[0] - pts[0][0]) * u, pts[0][1] + (end[1] - pts[0][1]) * u + r.range(-0.035, 0.035)]); }
        pts.push(end);
        for (let k = 0; k + 1 < pts.length; k++) {
          const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay), g = new THREE.PlaneGeometry(len + 0.006, b ? 0.006 : 0.009);
          g.rotateZ(Math.atan2(by - ay, bx - ax)); g.translate((ax + bx) / 2, (ay + by) / 2, 0.0012); parts.push(g);
        }
      }
      const m = new THREE.Mesh(mergeGeometries(parts), arcMat); m.visible = false; m.renderOrder = 3; group.add(m);
      return m;
    });
    // THE SPARK = portal: a white-hot disc whose face is the chat world's cream, with a coral core = the cursor-to-be
    const sparkMat = mat(ctx.face, { glow: G.spark, rough: 0.5, own: true });
    group.add(slab(C.hw * 2, C.hh * 2, C.r, 0.02, sparkMat, 0, 0, 0));
    const core = ctx.core;
    const coreMat = mat(P.cursor, { glow: G.cursor, rough: 0.4, own: true });
    const coreM = slab(core.hw * 2, core.hh * 2, core.r, 0.001, coreMat, 0, 0, 0.0009);
    group.add(coreM);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 6, C.hh * 6), new THREE.MeshBasicMaterial({ map: roundShadowTex, color: "#f3e6ff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    halo.position.z = -0.021; halo.renderOrder = 2; group.add(halo);
    // starburst rays behind the disc (additive), turning slowly on the level clock
    const burst = new THREE.Shape(), spikes = 14;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2, rr = i % 2 ? C.hw * 1.05 : C.hw * (i % 4 ? 2.4 : 3.3);
      i ? burst.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : burst.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const rays = new THREE.Mesh(new THREE.ShapeGeometry(burst), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1dc").multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    rays.position.z = -0.0215; rays.renderOrder = 2; group.add(rays);
    return {
      group,
      update(local, t, S, innerAlpha = 0) {
        const b = ctx.blink(t), cyc = ctx.blinkCycle(t);
        sparkMat.emissiveIntensity = G.spark * (0.6 + 0.4 * b);
        rays.rotation.z = local * 0.5;
        rays.scale.setScalar(0.8 + 0.3 * b);
        rays.material.opacity = (0.2 + 0.55 * b) * (1 - innerAlpha) ** 2;
        coreMat.emissiveIntensity = G.cursor * (0.35 + 0.65 * b);
        gateMat.emissiveIntensity = G.gate * b;
        const flick = Math.floor(local * 11 + 50) + cyc;
        variants.forEach((m, i) => { m.visible = b > 0.15 && innerAlpha < 0.5 && i === ((flick % 3) + 3) % 3; });
        halo.material.opacity = (0.3 + 0.5 * b) * (1 - innerAlpha) ** 2;
      },
    };
  }

  const BUILDERS = { chat: buildChat, tokens: buildTokens, numbers: buildNumbers, network: buildNetwork, chip: buildChip, switch: buildSwitch };

  // ================================================================ the zoom world
  /**
   * zoomWorld(plan, chain) -> { levels, rt, update(t) } (adds itself to the scene).
   *   chain[m] = { builder, window: "rrect"|"circle" } in plan.levels order; level m's portal = chain[m+1]'s window / R_m.
   *   update(t): camera sway, inner world -> render target, outer world + portal window; all from plan.state(t).
   */
  function zoomWorld(plan, chain) {
    const N = chain.length;
    const rt = new THREE.WebGLRenderTarget(stage.width, stage.height, { type: THREE.HalfFloatType, samples: 4 });
    rt.texture.name = "inner-world";
    const levels = chain.map((L, m) => {
      const next = chain[(m + 1) % N], R = plan.levels[m].R;
      const portal = zoom.portalSize(zoom.SHAPES[next.window], R);
      // the switch's spark carries the next world's cursor at its exact size (the reveal: the spark IS the cursor)
      const nextPortal = zoom.portalSize(zoom.SHAPES[chain[(m + 2) % N].window], plan.levels[(m + 1) % N].R);
      const core = { hw: nextPortal.hw / R, hh: nextPortal.hh / R, r: nextPortal.r / R };
      const ctx = { portal, face: P[next.builder], bg: P[L.builder], R, core, blink: plan.blink, blinkCycle: plan.blinkCycle };
      const built = BUILDERS[L.builder](ctx);
      const win = portalWindow(portal, rt);
      built.group.add(win);
      stage.scene.add(built.group);
      return { ...built, win, bg: new THREE.Color(P[L.builder]), id: L.builder };
    });
    const cam = stage.camera, D = 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), sway = spec.camera.sway;
    function placeCamera(t) {
      const w = (Math.PI * 2 * t) / plan.duration;
      const yaw = sway.yaw * Math.sin(w), pitch = sway.pitch * Math.sin(2 * w + 0.7);
      cam.position.set(D * Math.sin(yaw) * Math.cos(pitch), D * Math.sin(pitch), D * Math.cos(yaw) * Math.cos(pitch));
      cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    }
    const renderer = stage.renderer, scene = stage.scene;
    return {
      levels, rt, D,
      update(t) {
        const st = plan.state(t);
        placeCamera(t);
        for (const L of levels) { L.group.visible = false; L.win.visible = false; }
        const inner = levels[st.inner], outer = levels[st.outer];
        inner.group.scale.setScalar(st.Sin);
        inner.update(plan.localTime(st.inner, t), t, st.Sin, 0);
        outer.group.scale.setScalar(st.Sout);
        outer.update(plan.localTime(st.outer, t), t, st.Sout, st.alpha);
        if (st.alpha > 0.001) {
          inner.group.visible = true;
          inner.group.updateMatrixWorld(true);
          scene.background = inner.bg;
          renderer.setRenderTarget(rt);
          renderer.clear();
          renderer.render(scene, cam);
          renderer.setRenderTarget(null);
          inner.group.visible = false;
          outer.win.visible = true;
          outer.win.material.uniforms.uAlpha.value = st.alpha;
        }
        outer.group.visible = true;
        scene.background = outer.bg;
        return st;
      },
    };
  }

  // ---------------------------------------------------------------- overlay caption: one label, the world's colour dot
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o }, Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${font}`;
      const tw = Math.round(x.measureText(st.text).width), pad = Math.round(Q.cap * 0.75), dotW = Q.dot * 2 + 22;
      const pw = Math.min(W - 12, tw + 2 * pad + dotW), ph = Q.h, ox = Math.round((W - pw) / 2), oy = 10;
      x.fillStyle = "rgba(20,12,36,0.86)"; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.fillStyle = st.dot; x.beginPath(); x.arc(ox + pad + Q.dot, oy + ph / 2, Q.dot, 0, Math.PI * 2); x.fill();
      x.strokeStyle = "rgba(255,255,255,0.85)"; x.lineWidth = 3; x.stroke();
      x.fillStyle = "#ffffff"; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + dotW, oy + ph / 2 + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Math.round((stage.width - Wp) / 2), Q.y);
    mesh.userData.show = (text, a, dot) => { mesh.userData.set({ text: a > 0.003 ? text : "", dot }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { zoomWorld, caption, slab, slabGeo, dropShadow, word, portalWindow };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    builders: BUILDERS, plan: zoom, motion: zoom,
  };
}
