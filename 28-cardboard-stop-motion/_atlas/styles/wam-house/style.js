// styles/wam-house/style.js — "Why AI Matters — House": the channel's reusable 3D package.
// Navy newsroom studio (grid floor, horizon line, haze, blurred-mirror floor), extruded League Gothic capitals
// traced from the real font, THE RULE (one emissive green bar that draws on first and becomes plinth /
// underline / progress bar / divider), warm paper cards, Space Mono data labels, and 1:1 screen-pixel overlay
// components (lower third, data label, sample tag, ident bug). Everything is synchronous and seeded; time
// enters only through update(t, plan) calls. Timing plans live in ./rundown.js (THREE-free, Node-safe).
//
// FONTS: call `await loadFonts()` BEFORE building display type (scene.js does it with top-level await), and
// name the families in index.html CSS so the HyperFrames compiler embeds them (spec.fonts.css).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createCyclorama } from "../../kit/builders.js";
import { clamp, lerp, spring, rng, hash01 } from "../../kit/time.js";
import { gridTexture, gradientTexture, blobTexture, paperTexture, canvasTexture } from "../../kit/textures.js";
import { getOverlay, pinToScreen, projectToScreen } from "../../kit/overlay.js";
import { studioEnvironment, reflectiveSweep } from "../../kit/studio.js";
import { glyphOutline as kitGlyphOutline, glyphGeometry as kitGlyphGeometry, layoutLine as kitLayoutLine } from "../../kit/fontoutline.js";
import { whipBlurPass as kitWhipBlurPass } from "../../kit/post.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as rundown from "./rundown.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, rundown };

const { outBackS, prog, typed } = rundown;

// ======================================================================= fonts ===========================
/**
 * loadFonts(spec = STYLE_SPEC) -> Promise<{ [family]: true|false }> — waits (≤ spec.fonts.loadTimeout ms) for the
 * embedded faces, then reports which families really resolved (document.fonts.check after load). Also stored on
 * window.__wamFonts. Fallback stacks keep everything legible when a face is missing.
 */
export async function loadFonts(spec = STYLE_SPEC) {
  const F = spec.fonts;
  if (typeof document === "undefined" || !document.fonts) return {};
  const timeout = new Promise((r) => setTimeout(r, F.loadTimeout ?? 4000));
  await Promise.race([Promise.all(F.load.map((f) => document.fonts.load(f).catch(() => null))), timeout]);
  const report = {};
  for (const fam of F.css) {
    const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, "") === fam);
    report[fam] = faces.some((f) => f.status === "loaded");
  }
  window.__wamFonts = report;
  return report;
}

// glyph outlines / kerning / extruded glyph geometry / line layout: kit/fontoutline.js (promoted, identical code);
// these wrappers supply this style's font and type settings as defaults.
export const glyphOutline = (ch, { font = STYLE_SPEC.fonts.display, tracePx = STYLE_SPEC.type.tracePx, simplify = STYLE_SPEC.type.simplify } = {}) => kitGlyphOutline(ch, { font, tracePx, simplify });
export const glyphGeometry = (ch, cap, T = STYLE_SPEC.type, font = STYLE_SPEC.fonts.display) => kitGlyphGeometry(ch, cap, T, font);
export const layoutLine = (text, cap, { tracking = STYLE_SPEC.type.tracking, T = STYLE_SPEC.type, font = STYLE_SPEC.fonts.display } = {}) => kitLayoutLine(text, cap, { tracking, T, font });

// ======================================================================= THE RULE ========================
/**
 * rule({ length, height, depth, bevel, material }) -> Group whose origin is the rule's LEFT-BOTTOM-CENTRE.
 *   The bar spans x 0..length, y 0..height, z ±depth/2. userData.setDraw(u, { from = "left" }) scales it on;
 *   userData.update(t, { on, dur, out, outDur }) = draw on (outExpo) / retract to the right (inExpo).
 *   Same geometry everywhere: on the floor it is a plinth, on a card a progress bar, in a quote a margin rule.
 */
export function rule(o = {}, mats) {
  const R = { ...STYLE_SPEC.rule, ...o };
  const L = R.length ?? 4;
  const geo = new RoundedBoxGeometry(L, R.height, R.depth, 2, Math.min(R.bevel, R.height / 2.05, R.depth / 2.05));
  geo.translate(L / 2, R.height / 2, 0);
  const bar = new THREE.Mesh(geo, o.material ?? mats.rule);
  bar.castShadow = o.castShadow ?? true;
  bar.receiveShadow = true;
  const g = new THREE.Group();
  g.name = "wam:rule";
  g.add(bar);
  g.userData = {
    bar, length: L, height: R.height, depth: R.depth,
    setDraw(u, { from = "left" } = {}) {
      u = clamp(u);
      bar.visible = u > 0.002;
      bar.scale.x = Math.max(1e-4, u);
      bar.position.x = from === "left" ? 0 : L * (1 - u);
    },
    update(t, { on = 0, dur = R.draw, out = Infinity, outDur = 0.3 } = {}) {
      if (t >= out) g.userData.setDraw(1 - prog(t, out, outDur, "inExpo"), { from: "right" });
      else g.userData.setDraw(prog(t, on, dur, "outExpo"));
    },
  };
  g.userData.setDraw(0);
  return g;
}

// ======================================================================= DISPLAY TYPE ====================
/**
 * displayType(text, { cap = 1.1, tones, wordTones, plinth = true, tracking, mats }) -> Group (origin = ink centre
 *   at the baseline; with a plinth the letters stand on THE RULE's top face).
 *   tones: (i, ch, word) -> material key ("face" | "faceBlue" | "faceGreen" | "faceRed"); wordTones: [key per word].
 *   userData.update(t, plan) with plan = rundown.identPlan / endPlan (letters[].on, rise, rule) — letters rise out of
 *   the rule's top face (clipped at the slot), 6 % overshoot; plan.out (optional) sinks them in reverse order.
 *   userData.width, .letters [{ mesh, ch, i }], .rule (the plinth Group or null), .clip (THREE.Plane).
 */
export function displayType(text, o = {}, mats) {
  const T = STYLE_SPEC.type, RS = STYLE_SPEC.rule;
  const cap = o.cap ?? 1.1;
  const lay = layoutLine(text, cap, { tracking: o.tracking ?? T.tracking });
  const g = new THREE.Group();
  g.name = `wam:type:${text}`;
  const baseY = o.plinth === false ? 0 : RS.height;
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const words = text.split(" ");
  const wordOf = (i) => [...text].slice(0, i).filter((c) => c === " ").length;
  const toneOf = (i, ch) => (o.tones ? o.tones(i, ch, words[wordOf(i)]) : o.wordTones ? o.wordTones[wordOf(i)] ?? "face" : "face");
  const matCache = {};
  const matFor = (key) => {
    if (!matCache[key]) {
      const face = mats[key].clone(), side = mats.side.clone();
      for (const m of [face, side]) { m.clippingPlanes = [clip]; m.clipShadows = true; }
      matCache[key] = [face, side];
    }
    return matCache[key];
  };
  const letters = [];
  const off = -(lay.x0 + lay.width / 2);
  for (const s of lay.slots) {
    if (s.ch === " ") continue;
    const mesh = new THREE.Mesh(glyphGeometry(s.ch, cap), matFor(toneOf(s.i, s.ch)));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(s.x + off, baseY, 0);
    mesh.userData.home = mesh.position.clone();
    g.add(mesh);
    letters.push({ mesh, ch: s.ch, i: s.i });
  }
  let plinth = null;
  if (o.plinth !== false) {
    const over = o.overhang ?? RS.overhang * cap / 1.1;
    plinth = rule({ length: lay.width + 2 * over }, mats);
    plinth.position.set(-lay.width / 2 - over, 0, 0);
    g.add(plinth);
  }
  const rise = (u) => -cap * 1.15 * (1 - outBackS(u, T.rise.overshoot));
  g.userData = {
    width: lay.width, cap, letters, rule: plinth, clip, baseY, materials: matCache,
    /** move the clip plane with the group (call after positioning the group; scene does it via update). */
    update(t, plan = {}) {
      g.updateWorldMatrix(true, false);
      const wy = new THREE.Vector3(0, baseY, 0).applyMatrix4(g.matrixWorld).y;
      clip.constant = -wy + 1e-4;
      if (plinth && plan.rule) plinth.userData.update(t, { ...plan.rule, out: plan.out?.on ?? Infinity, outDur: plan.out?.dur ?? 0.3 });
      const dur = plan.rise ?? T.rise.dur;
      const sched = new Map((plan.letters ?? []).map((l) => [l.i, l.on]));
      const n = letters.length;
      letters.forEach((L, k) => {
        const on = sched.get(L.i) ?? Infinity;
        let y = rise(clamp((t - on) / dur));
        if (plan.out) { const so = plan.out.on + (n - 1 - k) * 0.02; y = Math.min(y, -cap * 1.15 * prog(t, so, plan.out.dur ?? T.rise.sink, "inCubic")); }
        L.mesh.position.y = L.mesh.userData.home.y + y;
        L.mesh.visible = t >= on && y > -cap * 1.14;
      });
    },
  };
  return g;
}

// ======================================================================= KEY STAT ========================
/**
 * keyStat({ cap = 2.3, tone = "faceRed", suffix = "×", maxChars = 4, plan }) -> Group: a count-up number in
 *   display capitals on THE RULE. The digits are re-chosen every frame from rundown.statValue(t, plan) — a pure
 *   function of t (glyph geometries are cached; slots swap geometry). userData.update(t, plan). The plinth is
 *   sized for the FINAL text; the number re-centres as it grows.
 */
export function keyStat(o = {}, mats) {
  const cap = o.cap ?? 2.3, suffix = o.suffix ?? "×", tone = o.tone ?? "faceRed";
  const plan = o.plan;
  const g = new THREE.Group();
  g.name = "wam:keyStat";
  const RS = STYLE_SPEC.rule;
  const finalText = rundown.statText(plan.value, plan, { suffix });
  const finLay0 = layoutLine(finalText, cap);
  const countLay = layoutLine(`${"0".repeat(String(Math.floor(plan.value)).length)}.${"0".repeat(plan.decimals)}${suffix}`, cap);
  const finLay = countLay.width > finLay0.width ? countLay : finLay0;
  const over = RS.overhang * 1.8;
  const plinth = rule({ length: finLay.width + 2 * over }, mats);
  plinth.position.set(-finLay.width / 2 - over, 0, 0);
  g.add(plinth);
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const face = mats[tone].clone(), side = mats.side.clone();
  for (const m of [face, side]) { m.clippingPlanes = [clip]; m.clipShadows = true; }
  const maxChars = o.maxChars ?? 5;
  const slots = Array.from({ length: maxChars }, () => {
    const m = new THREE.Mesh(glyphGeometry("0", cap), [face, side]);
    m.castShadow = m.receiveShadow = true;
    m.visible = false;
    g.add(m);
    return m;
  });
  // warm the glyph cache for every character the counter can show
  for (const ch of `0123456789.${suffix}`) glyphGeometry(ch, cap);
  g.userData = {
    rule: plinth, finalText, width: finLay.width, finalWidth: finLay0.width, cap,
    update(t, p = plan) {
      g.updateWorldMatrix(true, false);
      clip.constant = -new THREE.Vector3(0, RS.height, 0).applyMatrix4(g.matrixWorld).y + 1e-4;
      plinth.userData.update(t, { ...p.rule, out: p.out?.on ?? Infinity });
      const txt = rundown.statText(rundown.statValue(t, p), p, { suffix });
      const lay = layoutLine(txt, cap);
      const off = -(lay.x0 + lay.width / 2);
      const u = clamp((t - p.rise.on) / p.rise.dur);
      const y = -cap * 1.15 * (1 - outBackS(u, STYLE_SPEC.type.rise.overshoot));
      slots.forEach((m, k) => {
        const s = lay.slots[k];
        if (!s || t < p.rise.on) { m.visible = false; return; }
        m.geometry = glyphGeometry(s.ch, cap);
        m.position.set(s.x + off, RS.height + y, 0);
        m.visible = true;
      });
    },
  };
  return g;
}

// ======================================================================= PAPER CARDS =====================
let paperFibre = null;
function fibreCanvas() {
  if (!paperFibre) { const C = STYLE_SPEC.card; paperFibre = paperTexture({ size: 512, base: STYLE_SPEC.palette.paper, fiber: C.fibre, grain: C.grain, seed: C.seed }).image; }
  return paperFibre;
}
/** canvas painter helpers for card faces and overlay UI (px units). */
export const ui = {
  font: (px, kind = "mono", weight = 400) => `${weight} ${px}px ${STYLE_SPEC.fonts[kind]}`,
  text(ctx, s, x, y, { px = 40, kind = "mono", weight = 400, color = STYLE_SPEC.palette.ink, tracking = 0, align = "left", baseline = "alphabetic" } = {}) {
    ctx.font = ui.font(px, kind, weight);
    ctx.letterSpacing = `${tracking * px}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    ctx.letterSpacing = "0px";
    return w;
  },
  measure(ctx, s, { px = 40, kind = "mono", weight = 400, tracking = 0 } = {}) {
    ctx.font = ui.font(px, kind, weight);
    ctx.letterSpacing = `${tracking * px}px`;
    const w = ctx.measureText(s).width;
    ctx.letterSpacing = "0px";
    return w;
  },
  /** a ruler: baseline hairline with ticks every `step` px, every 5th taller. */
  ticks(ctx, x, y, w, { step = 14, h = 8, major = 5, color = STYLE_SPEC.palette.mute, line = 2 } = {}) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, line);
    for (let k = 0, px = x; px <= x + w + 0.5; k++, px += step) ctx.fillRect(Math.round(px), y - (k % major === 0 ? h * 1.8 : h), line, k % major === 0 ? h * 1.8 : h);
  },
  /** balance(ctx, s, maxW, opts) -> lines: wrap, then re-split 2-line results so both lines are near equal. */
  balance(ctx, s, maxW, opts) {
    const lines = ui.wrap(ctx, s, maxW, opts);
    if (lines.length !== 2) return lines;
    const w = s.split(/\s+/);
    let best = lines, bw = Infinity;
    for (let k = 1; k < w.length; k++) {
      const a = w.slice(0, k).join(" "), b = w.slice(k).join(" ");
      const m = Math.max(ui.measure(ctx, a, opts), ui.measure(ctx, b, opts));
      if (m <= maxW && m < bw) { bw = m; best = [a, b]; }
    }
    return best;
  },
  wrap(ctx, s, maxW, opts) {
    const out = [];
    let line = "";
    for (const w of s.split(/\s+/)) {
      const test = line ? `${line} ${w}` : w;
      if (line && ui.measure(ctx, test, opts) > maxW) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    return out;
  },
};

/**
 * paperCard({ w, h, draw(ctx, W, H, state), back, state }) -> Group (pivot at the card centre; faces +Z).
 *   A slightly thick warm-paper slab (rounded box) with a printed canvas face (≈ spec.card.pxPerMetre). Redraws
 *   only when the JSON state changes. userData.setState(s), .setPose({ pos, rot, scale }), .W/.H (px), .face.
 */
export function paperCard(o = {}, mats) {
  const C = STYLE_SPEC.card;
  const w = o.w ?? 5.6, h = o.h ?? 3.15;
  const g = new THREE.Group();
  g.name = "wam:card";
  const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, C.thickness, 2, Math.min(C.radius, C.thickness / 2.05)), [mats.paperEdge, mats.paperEdge, mats.paperEdge, mats.paperEdge, mats.paper, mats.paper]);
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);
  const W = Math.round(w * C.pxPerMetre), H = Math.round(h * C.pxPerMetre);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: C.selfLit ?? 0 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  face.position.z = C.thickness / 2 + 0.0015;
  face.receiveShadow = true;
  g.add(face);
  const backCanvas = document.createElement("canvas");
  backCanvas.width = 512; backCanvas.height = Math.round(512 * h / w);
  const bctx = backCanvas.getContext("2d");
  bctx.fillStyle = bctx.createPattern(fibreCanvas(), "repeat");
  bctx.fillRect(0, 0, backCanvas.width, backCanvas.height);
  const backTex = canvasTexture(backCanvas);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 }));
  back.rotation.y = Math.PI;
  back.position.z = -C.thickness / 2 - 0.0015;
  g.add(back);
  let last = null;
  const draw = (state) => {
    const ctx = canvas.getContext("2d");
    ctx.reset?.();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ctx.createPattern(fibreCanvas(), "repeat");
    ctx.fillRect(0, 0, W, H);
    o.draw?.(ctx, W, H, state ?? {});
    tex.needsUpdate = true;
  };
  g.userData = {
    W, H, w, h, face, slab, canvas,
    setState(s = {}) { const k = JSON.stringify(s); if (k !== last) { last = k; draw(s); } },
    setPose({ pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) { g.position.set(...pos); g.rotation.set(...rot); g.scale.setScalar(scale); },
    /** card-face px -> local metres (x right, y up, on the face plane). */
    local(px, py) { return new THREE.Vector3(-w / 2 + (px / W) * w, h / 2 - (py / H) * h, C.thickness / 2 + 0.002); },
  };
  g.userData.setState(o.state ?? {});
  return g;
}

/**
 * chapterCard({ index, count, title, kicker, show }) -> Group: a paper card printed with "CHAPTER", the big
 *   "01 / 03" index, a ruler, the serif headline and a 1..count progress track; THE RULE lies on the face as the
 *   progress fill for chapter `index`. userData.update(t, plan = rundown.chapterPlan) flips it in on a spring
 *   (rotation about Y from ~150°, landing square to camera) and draws the rule.
 */
export function chapterCard(o = {}, mats) {
  const P = STYLE_SPEC.palette, C = STYLE_SPEC.card;
  const index = o.index ?? 1, count = o.count ?? 3;
  const pad2 = (n) => String(n).padStart(2, "0");
  const M = 130; // face margin px
  const track = { y: 0, h: 26 };
  const card = paperCard({
    w: o.w ?? 5.6, h: o.h ?? 3.15,
    draw(ctx, W, H) {
      const top = M + 40;
      const cw = ui.text(ctx, o.kicker ?? "CHAPTER", M, top, { px: 50, weight: 700, color: P.inkSoft, tracking: 0.16 });
      ui.text(ctx, `${pad2(index)} / ${pad2(count)}`, M + cw + 34, top + 10, { px: 92, weight: 700, color: P.ink, tracking: 0.04 });
      ui.text(ctx, o.brand ?? "WHY AI MATTERS", W - M, top, { px: 40, color: P.inkSoft, tracking: 0.16, align: "right" });
      ui.ticks(ctx, M, top + 52, W - 2 * M, { step: 16, h: 9, color: "rgba(10,20,36,0.35)" });
      const lines = ui.balance(ctx, o.title ?? "Chapter title", W - 2 * M, { px: 196, kind: "serif" });
      lines.slice(0, 2).forEach((l, k) => ui.text(ctx, l, M - 6, top + 300 + k * 205, { px: 196, kind: "serif", color: P.ink }));
      // progress track
      track.y = H - M - 20;
      const gap = 18, segW = (W - 2 * M - gap * (count - 1)) / count;
      for (let k = 0; k < count; k++) {
        const x = M + k * (segW + gap);
        ctx.fillStyle = "rgba(10,20,36,0.12)";
        ctx.fillRect(x, track.y, segW, track.h);
        ui.text(ctx, pad2(k + 1), x, track.y - 24, { px: 42, weight: 700, color: k + 1 === index ? P.ink : "rgba(10,20,36,0.45)", tracking: 0.1 });
      }
      track.segW = segW; track.gap = gap;
    },
  }, mats);
  // the progress fill = THE RULE, lying on the face over segment `index`
  const U = card.userData;
  const x0 = M + (index - 1) * (track.segW + track.gap);
  const segM = (track.segW / U.W) * U.w, hM = (track.h / U.H) * U.h;
  const fill = rule({ length: segM, height: hM, depth: 0.05, bevel: 0.012, castShadow: false }, mats);
  const p = U.local(x0, track.y + track.h);
  fill.position.set(p.x, p.y, p.z + 0.02);
  card.add(fill);
  const g = new THREE.Group();
  g.name = "wam:chapterCard";
  g.add(card);
  card.position.y = U.h / 2 + 0.02;
  // the rest of the rundown: later chapters stacked behind, offset up-right (header + placeholder bars only)
  const stack = [];
  if (o.stack) for (let k = index + 1; k <= count; k++) {
    const c = paperCard({
      w: U.w, h: U.h,
      draw(ctx, W, H) {
        const top = M + 40;
        const cw = ui.text(ctx, o.kicker ?? "CHAPTER", M, top, { px: 40, weight: 700, color: P.inkSoft, tracking: 0.16 });
        ui.text(ctx, `${pad2(k)} / ${pad2(count)}`, M + cw + 34, top + 6, { px: 64, weight: 700, color: P.ink, tracking: 0.04 });
        ui.ticks(ctx, M, top + 44, W - 2 * M, { step: 16, h: 9, color: "rgba(10,20,36,0.35)" });
      },
    }, mats);
    const j = k - index;
    c.userData.home = [0.55 * j, U.h / 2 + 0.02 + 0.32 * j, -0.55 * j];
    c.rotation.y = -0.05 * j;
    g.add(c);
    stack.push(c);
  }
  g.userData = {
    card, fill, stack,
    update(t, plan) {
      stack.forEach((c, j) => {
        const u = outBackS(clamp((t - plan.stack.on - j * plan.stack.step) / 0.45), 1.1);
        c.visible = u > 0;
        const [hx, hy, hz] = c.userData.home;
        c.position.set(hx + 2.2 * (1 - u), hy, hz);
      });
      const sp = spring(Math.max(0, t - plan.flip.on), C.flip);
      const vis = t >= plan.flip.on;
      card.visible = vis;
      card.rotation.y = -2.6 * (1 - sp);
      card.position.z = -1.2 * (1 - sp);
      card.position.x = 1.4 * (1 - sp);
      fill.userData.update(t, plan.rule);
    },
  };
  return g;
}

/**
 * quoteCard({ quote, attribution, w, h }) -> Group: paper card with a large serif quote, mono attribution and THE
 *   RULE standing on the face as a vertical margin bar. userData.update(t, plan = rundown.quotePlan): slides up
 *   from below the floor line with a stiff spring, the rule draws down, attribution types on.
 */
export function quoteCard(o = {}, mats) {
  const P = STYLE_SPEC.palette, C = STYLE_SPEC.card;
  const M = 150;
  let typedN = 0;
  const attr = o.attribution ?? "";
  const card = paperCard({
    w: o.w ?? 5.6, h: o.h ?? 3.15,
    draw(ctx, W, H, st) {
      const lines = ui.wrap(ctx, `“${o.quote ?? "Quote"}”`, W - 2 * M - 120, { px: 150, kind: "serif" });
      lines.slice(0, 4).forEach((l, k) => ui.text(ctx, l, M + 80, M + 170 + k * 172, { px: 150, kind: "serif", color: P.ink }));
      ui.ticks(ctx, M + 80, H - M - 72, 300, { step: 14, h: 8, color: "rgba(10,20,36,0.35)" });
      ui.text(ctx, attr.slice(0, st.n ?? attr.length), M + 80, H - M, { px: 44, weight: 700, color: P.inkSoft, tracking: 0.14 });
    },
    state: { n: 0 },
  }, mats);
  const U = card.userData;
  const bar = rule({ length: U.h - 2 * (M / U.H) * U.h, height: 0.07, depth: 0.05, bevel: 0.012, castShadow: false }, mats);
  bar.rotation.z = -Math.PI / 2;
  const p = U.local(M, M);
  bar.position.set(p.x, p.y, p.z + 0.02);
  card.add(bar);
  const g = new THREE.Group();
  g.name = "wam:quoteCard";
  g.add(card);
  g.userData = {
    card, bar,
    update(t, plan) {
      const sp = spring(Math.max(0, t - plan.slide.on), C.flip);
      card.visible = t >= plan.slide.on;
      card.position.y = U.h / 2 + 0.02 - 1.0 * (1 - sp);
      card.rotation.x = -0.35 * (1 - sp);
      bar.userData.update(t, plan.rule);
      typedN = typed(t, plan.attr.on, attr.length, plan.attr.cps);
      U.setState({ n: typedN });
    },
  };
  return g;
}

// ======================================================================= OVERLAY UI (screen px) ===========
// screenCanvas: kit/overlay.js (promoted, identical code)
export { screenCanvas };

/**
 * dataLabel(stage, text, { px, color, index, align = "center", ticks = true }) -> overlay label: small mono caps
 *   over a tick ruler, with an optional index chip ("02"). userData.update(t, { on, cps, off, anchor:[x,y,z] | at:[xPx,yPx] })
 *   types it on (the ruler draws with it), holds, and cuts out at `off`. Anchors project a 3D point (centre-top).
 */
export function dataLabel(stage, text, o = {}) {
  const P = STYLE_SPEC.palette, OV = STYLE_SPEC.overlay;
  const px = o.px ?? OV.monoPx, tr = o.tracking ?? OV.monoTracking;
  const probe = document.createElement("canvas").getContext("2d");
  const idx = o.index ? `${o.index}` : "";
  const idxW = idx ? ui.measure(probe, idx, { px, weight: 700, tracking: 0.06 }) + px * 0.9 : 0;
  const tw = ui.measure(probe, text, { px, weight: 700, tracking: tr });
  const sp = o.scrim === false ? 0 : Math.round(px * 0.6);   // navy scrim keeps labels clean over reflections
  const W = Math.ceil(idxW + tw + 8 + 2 * sp), H = Math.ceil(px * 2.1 + sp * 0.8);
  const n = text.length;
  const mesh = screenCanvas(stage, W, H, (ctx, W2, H2, st) => {
    const k = st.n / n;
    if (sp) {
      const g = ctx.createLinearGradient(0, 0, W2, 0);
      g.addColorStop(0, "rgba(10,20,36,0)"); g.addColorStop(0.12, "rgba(10,20,36,0.78)"); g.addColorStop(0.88, "rgba(10,20,36,0.78)"); g.addColorStop(1, "rgba(10,20,36,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, px * 0.25, W2, H2 - px * 0.25);
      ctx.translate(sp, sp * 0.4);
      W2 -= 2 * sp;
    }
    if (o.ticks !== false) ui.ticks(ctx, 0, Math.round(px * 0.55), Math.round((W2 - 4) * k), { step: 12, h: Math.round(px * 0.16), color: P.mute, line: 2 });
    let x = 0;
    if (idx) {
      ctx.fillStyle = P.paper;
      ctx.fillRect(0, px * 0.82, idxW - px * 0.4, px * 1.18);
      ui.text(ctx, idx, px * 0.25, px * 1.75, { px, weight: 700, color: P.ink, tracking: 0.06 });
      x = idxW;
    }
    ui.text(ctx, text.slice(0, st.n), x, px * 1.75, { px, weight: 700, color: o.color ?? P.paper, tracking: tr });
  });
  mesh.userData.update = (t, { on = 0, cps = 40, off = Infinity, anchor, at, dy = 0 } = {}) => {
    const shown = t >= on && t < off;
    mesh.visible = shown;
    if (!shown) return;
    mesh.userData.set({ n: typed(t, on, n, cps) });
    let x, y;
    if (anchor) { const p = projectToScreen(stage, anchor); x = (p.x + 1) / 2 * stage.width; y = (1 - p.y) / 2 * stage.height; }
    else [x, y] = at;
    const left = (o.align ?? "center") === "center" ? x - W / 2 : o.align === "right" ? x - W : x;
    mesh.userData.place(Math.round(left), Math.round(y + dy));
  };
  mesh.userData.size = [W, H];
  return mesh;
}

/** sampleTag(stage, text = "SAMPLE DATA") -> small boxed mono tag (outline, muted): marks placeholder numbers. */
export function sampleTag(stage, text = "SAMPLE DATA", o = {}) {
  const P = STYLE_SPEC.palette;
  const px = o.px ?? 24;
  const probe = document.createElement("canvas").getContext("2d");
  const tw = ui.measure(probe, text, { px, weight: 700, tracking: 0.16 });
  const W = Math.ceil(tw + px * 1.4), H = Math.ceil(px * 1.9);
  const mesh = screenCanvas(stage, W, H, (ctx, W2, H2) => {
    ctx.strokeStyle = P.mute; ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(1, 1, W2 - 2, H2 - 2);
    ui.text(ctx, text, px * 0.62, H2 / 2 + px * 0.36, { px, weight: 700, color: P.mute, tracking: 0.16 });
  });
  mesh.userData.update = (t, { on = 0, off = Infinity, anchor, at } = {}) => {
    const shown = t >= on && t < off;
    mesh.visible = shown;
    if (!shown) return;
    mesh.userData.set({});
    let x, y;
    if (anchor) { const p = projectToScreen(stage, anchor); x = (p.x + 1) / 2 * stage.width; y = (1 - p.y) / 2 * stage.height; }
    else [x, y] = at;
    mesh.userData.place(Math.round(x), Math.round(y));
    mesh.userData.opacity(prog(t, on, 0.2));
  };
  return mesh;
}

/**
 * lowerThird(stage, { name, sub }) -> overlay lower third at the bottom-left title-safe corner:
 *   THE RULE (green, 12 px) draws → a paper plate unfolds down from it with the name in display caps (letters
 *   rise inside the plate) → a navy strip types the mono line → out: plates fold back up, rule retracts right.
 *   userData.update(t, plan = rundown.lowerThirdPlan).
 */
export function lowerThird(stage, o = {}) {
  const P = STYLE_SPEC.palette, L = STYLE_SPEC.overlay.lowerThird;
  const name = o.name ?? "NAME", sub = o.sub ?? "ROLE";
  const probe = document.createElement("canvas").getContext("2d");
  const nameW = ui.measure(probe, name, { px: L.namePx, kind: "display", tracking: 0.02 });
  const subW = ui.measure(probe, sub, { px: L.subPx, weight: 700, tracking: 0.14 });
  const W = Math.ceil(Math.max(nameW, subW) + 2 * L.padX), plateH = Math.round(L.namePx * 1.12), subH = Math.round(L.subPx * 1.9);
  const H = L.ruleH + plateH + subH;
  const chars = [...name];
  const xs = [];
  { let x = L.padX; for (const ch of chars) { xs.push(x); x += ui.measure(probe, ch, { px: L.namePx, kind: "display" }) + 0.02 * L.namePx; } }
  const mesh = screenCanvas(stage, W, H, (ctx, W2, H2, st) => {
    const r0 = st.r0 * W2, r1 = st.r1 * W2;
    // plates first (under the rule)
    const ph = Math.round(plateH * st.plate);
    if (ph > 0) {
      ctx.fillStyle = P.paper;
      ctx.fillRect(r0, L.ruleH, W2 - r0, ph);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, L.ruleH, W2, ph); ctx.clip();
      ctx.font = ui.font(L.namePx, "display");
      ctx.fillStyle = P.ink; ctx.textBaseline = "alphabetic";
      chars.forEach((ch, k) => { const dy = st.rise[k] ?? 1; if (dy < 1) ctx.fillText(ch, xs[k], L.ruleH + plateH * 0.9 + dy * plateH); });
      ctx.restore();
    }
    const sh = Math.round(subH * st.sub);
    if (sh > 0) {
      ctx.fillStyle = P.bg;
      ctx.fillRect(r0, L.ruleH + plateH, W2 - r0, sh);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, L.ruleH + plateH, W2, sh); ctx.clip();
      ui.text(ctx, sub.slice(0, st.n), L.padX, L.ruleH + plateH + subH * 0.66, { px: L.subPx, weight: 700, color: P.paper, tracking: 0.14 });
      ctx.restore();
    }
    if (r1 > r0) { ctx.fillStyle = P.green; ctx.fillRect(r0, 0, r1 - r0, L.ruleH); }
  });
  const q = (v) => Math.round(v * 60) / 60;
  mesh.userData.update = (t, p) => {
    const shown = t >= p.rule.on && t < p.end;
    mesh.visible = shown;
    if (!shown) return;
    const outU = prog(t, p.out.on, p.out.dur, "inCubic");
    const fold = clamp(outU / 0.55), retract = clamp((outU - 0.45) / 0.55);
    const st = {
      r0: q(prog(retract, 0, 1, "inExpo")),
      r1: q(prog(t, p.rule.on, p.rule.dur, "outExpo")),
      plate: q(prog(t, p.plate.on, p.plate.dur, "outCubic") * (1 - fold)),
      sub: q(prog(t, p.plate.on + p.plate.dur * 0.6, p.plate.dur, "outCubic") * (1 - fold)),
      rise: chars.map((ch, k) => q(1 - outBackS(clamp((t - p.name.on - k * p.name.stagger) / p.name.dur), 1.2))),
      n: typed(t, p.sub.on, sub.length, p.sub.cps),
    };
    mesh.userData.set(st);
    mesh.userData.place(L.x, L.y);
  };
  mesh.userData.size = [W, H];
  return mesh;
}

/**
 * identBug(stage, { text = "WHY AI MATTERS" }) -> the small channel mark for a corner: WHY blue, AI green, MATTERS
 *   paper (the established splash colouring) over a short green rule. userData.update(t, { on, dur, off, at:[xPx,yPx] })
 *   settles it into place from 1.5× scale and +60 px offset (back-out).
 */
export function identBug(stage, o = {}) {
  const P = STYLE_SPEC.palette, B = STYLE_SPEC.overlay.bug;
  const px = o.px ?? B.px;
  const words = (o.text ?? "WHY AI MATTERS").split(" ");
  const colours = o.colours ?? [P.blue, P.green, P.paper];
  const probe = document.createElement("canvas").getContext("2d");
  const space = px * 0.22;
  const ws = words.map((w) => ui.measure(probe, w, { px, kind: "display", tracking: 0.02 }));
  const W = Math.ceil(ws.reduce((a, b) => a + b, 0) + space * (words.length - 1) + 4), H = Math.ceil(px * 1.2);
  const mesh = screenCanvas(stage, W, H, (ctx) => {
    let x = 0;
    words.forEach((w, k) => { x += ui.text(ctx, w, x, px * 0.95, { px, kind: "display", color: colours[k % colours.length], tracking: 0.02 }) + space; });
    ctx.fillStyle = P.green;
    ctx.fillRect(0, Math.round(px * 1.06), Math.round(W * 0.42), Math.max(4, Math.round(px * 0.1)));
  });
  mesh.userData.update = (t, { on = 0, dur = 0.55, off = Infinity, at = [B.x, B.y] } = {}) => {
    const shown = t >= on && t < off;
    mesh.visible = shown;
    if (!shown) return;
    mesh.userData.set({});
    const u = outBackS(clamp((t - on) / dur), 1.3);
    const s = lerp(1.5, 1, u);
    mesh.userData.place(Math.round(at[0] + 60 * (1 - u)), Math.round(at[1] + 60 * (1 - u)), s);
    mesh.userData.opacity(prog(t, on, dur * 0.4));
  };
  mesh.userData.size = [W, H];
  return mesh;
}

// ======================================================================= STUDIO ==========================
/**
 * studioSet(stage, { sets:[x...], bokeh:[x...] }, mats) -> { floor, haze, horizon, follow(x) }
 *   The navy studio: a wide cyclorama whose floor is a blurred mirror with a faint 1 m grid (4 m majors), a thin
 *   lit horizon line + glow, soft additive haze pools behind every set, optional out-of-focus bokeh behind
 *   "darker hold" sets. follow(x) re-centres the mirror fade on the active set.
 */
export function studioSet(stage, o = {}, mats) {
  const S = STYLE_SPEC.set, F = STYLE_SPEC.floor;
  const fl = S.floor;
  const cells = 4;
  const grid = gridTexture({ size: 512, cells, line: 2, bg: S.grid.bg, fg: S.grid.line, major: cells, majorColor: S.grid.majorLine });
  const profileLen = (fl.depth - fl.radius) + (Math.PI / 2) * fl.radius + (fl.height - fl.radius);
  grid.repeat.set(fl.width / (cells * S.gridCell), profileLen / (cells * S.gridCell));
  grid.anisotropy = 16;
  const floorMat = mats.floor.clone();
  floorMat.color.set("#ffffff");
  floorMat.map = grid;
  const floor = reflectiveSweep(stage, floorMat, { ...F, sweep: { width: fl.width, depth: fl.depth, height: fl.height, radius: fl.radius } });
  floor.position.x = fl.centerX;
  stage.scene.add(floor);
  // horizon line (HDR, fog-free so it reads at distance) + a soft glow band above it
  const H = S.horizon;
  const hz = new THREE.Group();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(H.width, H.thickness), new THREE.MeshBasicMaterial({ color: new THREE.Color(H.color).multiplyScalar(H.strength), fog: false }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(fl.centerX, 0.012, H.z);
  const glowTex = gradientTexture({ size: 256, stops: [[0, "#ffffff", 0], [0.5, "#ffffff", 1], [1, "#ffffff", 0]], angle: 90 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(H.width, 1.6), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(H.color).multiplyScalar(H.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.set(fl.centerX, 0.1, H.z - 0.05);
  glow.userData.noDepth = true;
  hz.add(line, glow);
  stage.scene.add(hz);
  // haze pools
  const blob = blobTexture({ size: 256, stops: [[0, 1], [0.3, 0.7], [0.65, 0.2], [1, 0]] });
  const haze = new THREE.Group();
  for (const x of o.sets ?? [0]) for (const h of S.haze) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...h.size), new THREE.MeshBasicMaterial({ map: blob, color: new THREE.Color(h.color).multiplyScalar(h.opacity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(x + h.pos[0], h.pos[1], h.pos[2]);
    m.userData.noDepth = true;
    haze.add(m);
  }
  // bokeh discs (out-of-focus studio practicals) behind the darker "host" sets
  const R = rng(o.seed ?? 5);
  const disc = blobTexture({ size: 128, stops: [[0, 0.9], [0.72, 0.8], [0.86, 0.35], [1, 0]] });
  const pal = [STYLE_SPEC.palette.blue, STYLE_SPEC.palette.paper, "#5d8ff0", STYLE_SPEC.palette.green];
  for (const x of o.bokeh ?? []) for (let k = 0; k < 14; k++) {
    const r = R.range(0.35, 0.9), c = pal[k % 4 === 3 ? 3 : R.int(0, 2)];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r, r), new THREE.MeshBasicMaterial({ map: disc, color: new THREE.Color(c).multiplyScalar(R.range(0.08, 0.22) * (c === STYLE_SPEC.palette.green ? 0.5 : 1)), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(x + R.range(-6.5, 6.5), R.range(0.8, 4.2), R.range(-8, -3));
    m.userData.noDepth = true;
    haze.add(m);
  }
  stage.scene.add(haze);
  floor.userData.hide.push(glow);
  return {
    floor, haze, horizon: hz,
    follow(x) { floor.userData.uniforms.uCenter.value.set(x, 0); },
  };
}

// ======================================================================= WHIP BLUR =======================
/** whipBlurPass: kit/post.js (promoted, identical shader) with this style's tap count. */
export const whipBlurPass = (stage, taps = STYLE_SPEC.whip.taps) => kitWhipBlurPass(stage, taps);

// ======================================================================= createStyle =====================
/**
 * createStyle(stage, opts?) -> style
 *   style.props: rule, displayType, keyStat, paperCard, chapterCard, quoteCard, studioSet, dataLabel, sampleTag,
 *     lowerThird, identBug, screenCanvas.  style.rundown = the plan module.  style.ui = card painter helpers.
 *   style.lightsAt(x, level) moves the light rig to the set at x (and scales it).  style.whip(px) sets the blur.
 *   style.render(t, { setX }) = mirror pass + stage.render.  Call `await loadFonts()` before building type.
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  stage.renderer.localClippingEnabled = true;
  for (const k of Object.keys(materials)) if (materials[k].isMeshStandardMaterial) materials[k].envMapIntensity = 1;
  materials.side.envMapIntensity = 1.6;
  const studio = studioEnvironment(stage, spec.studio, { lights: {} });
  const textStyle = { font: spec.fonts.display, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const blur = post ? whipBlurPass(stage) : { userData: { set() {} } };
  // light rig: remember spec-relative positions; lightsAt(x) offsets them to the active set
  const rigBase = Object.entries(lights).filter(([, l]) => l?.isLight).map(([id, l]) => ({ l, p: l.position.clone(), tp: l.target?.position.clone(), i: l.intensity }));
  let studioSetRef = null;
  const props = {
    rule: (o = {}) => rule(o, materials),
    displayType: (text, o = {}) => displayType(text, o, materials),
    keyStat: (o = {}) => keyStat(o, materials),
    paperCard: (o = {}) => paperCard(o, materials),
    chapterCard: (o = {}) => chapterCard(o, materials),
    quoteCard: (o = {}) => quoteCard(o, materials),
    studioSet: (o = {}) => (studioSetRef = studioSet(stage, o, materials)),
    dataLabel: (text, o = {}) => dataLabel(stage, text, o),
    sampleTag: (text, o = {}) => sampleTag(stage, text, o),
    lowerThird: (o = {}) => lowerThird(stage, o),
    identBug: (o = {}) => identBug(stage, o),
    screenCanvas: (w, h, draw) => screenCanvas(stage, w, h, draw),
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
    factories: {
      studio: (s) => props.studioSet(s.dims ?? {}).floor,
      rule: (s) => props.rule(s.dims ?? {}),
      displayType: (s) => props.displayType(s.text ?? s.dims?.text ?? "TITLE", s.dims ?? {}),
    },
    rundown,
    ui,
    studio,
    helpers: { glyphOutline, glyphGeometry, layoutLine, loadFonts },
    lightsAt(x, level = 1) {
      for (const r of rigBase) {
        r.l.position.set(r.p.x + x, r.p.y, r.p.z);
        if (r.tp) { r.l.target.position.set(r.tp.x + x, r.tp.y, r.tp.z); r.l.target.updateMatrixWorld(); }
        r.l.intensity = r.i * level;
      }
    },
    whip(px) { blur.userData.set(Math.min(px, 520)); },
    render(t, { setX = 0 } = {}) {
      if (studioSetRef) {
        studioSetRef.follow(setX);
        studioSetRef.floor.userData.renderReflection(stage.renderer, stage.scene, stage.camera);
      }
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
