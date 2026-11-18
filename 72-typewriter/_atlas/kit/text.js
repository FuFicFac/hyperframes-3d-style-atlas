// text.js — text labels as CanvasTexture planes. Deterministic: system font stacks only by default.
import * as THREE from "three";
import { canvas2d } from "./canvas.js";

/** Default stacks resolve to fonts present on macOS + headless Chrome (no network, no async load). */
export const FONTS = {
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'Menlo, "SF Mono", Monaco, "Courier New", monospace',
  rounded: '"Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif',
  display: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
};

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (!maxWidth) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * createTextLabel(text, opts) -> THREE.Mesh (PlaneGeometry, centered; faces +Z)
 *   opts: {
 *     height = 0.6        world-units height of ONE line of text (plane scales with line count)
 *     fontSize = 128      canvas px per line (resolution; 128 is crisp at 1080p for most sizes)
 *     font = FONTS.sans   CSS font-family stack;  weight = 700;  italic = false
 *     color = "#ffffff";  background = null (transparent) | css color;  radius = 0 (bg corner px)
 *     padding = 0.25      fraction of fontSize around text
 *     maxWidth = 0        wrap width in canvas px (0 = no wrap);  align = "center"|"left"|"right"
 *     lineHeight = 1.15;  letterSpacing = 0 (px);  stroke = null | {color, width}
 *     lit = false         false: MeshBasicMaterial with toneMapped off; true: MeshStandardMaterial.
 *                         EXACT colours need one of: (a) no post stack, or (b) the overlay —
 *                         pinToScreen(stage, label, ...) from overlay.js. With a post stack active the
 *                         OutputPass tone-maps EVERYTHING in the 3D scene, toneMapped:false labels
 *                         included (measured: #808080 -> #8d8d8d under ACES), and bloom/blur/grain apply.
 *     castShadow = false  uses alphaTest so shadows follow glyph shapes
 *     anisotropy = 8;  depthWrite = true;  side = THREE.FrontSide
 *     willReadFrequently = CANVAS_DEFAULTS (true since pass 7): CPU-rasterised canvas, repeatable across page loads
 *                         (kit/canvas.js); false = the old GPU canvas.
 *   }
 *   mesh.userData.setText(newText) redraws (keep calls out of renderAt hot paths if text is static).
 */
export function createTextLabel(text, opts = {}) {
  const o = {
    height: 0.6, fontSize: 128, font: FONTS.sans, weight: 700, italic: false, color: "#ffffff",
    background: null, radius: 0, padding: 0.25, maxWidth: 0, align: "center", lineHeight: 1.15,
    letterSpacing: 0, stroke: null, lit: false, castShadow: false, anisotropy: 8, depthWrite: true,
    side: THREE.FrontSide, willReadFrequently: undefined, ...opts,
  };
  const canvas = document.createElement("canvas");
  canvas2d(canvas, { willReadFrequently: o.willReadFrequently }); // pass 7: first context decides CPU vs GPU raster
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = o.anisotropy;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;

  const matOpts = { map: tex, transparent: true, side: o.side, depthWrite: o.depthWrite, alphaTest: o.castShadow ? 0.5 : 0.01 };
  const mat = o.lit ? new THREE.MeshStandardMaterial({ ...matOpts, roughness: 0.8 }) : new THREE.MeshBasicMaterial({ ...matOpts, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.castShadow = o.castShadow;
  mesh.name = `label:${String(text).slice(0, 24)}`;

  function draw(str) {
    const ctx = canvas.getContext("2d");
    const fontStr = `${o.italic ? "italic " : ""}${o.weight} ${o.fontSize}px ${o.font}`;
    ctx.font = fontStr;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${o.letterSpacing}px`;
    const lines = wrapLines(ctx, str, o.maxWidth);
    const pad = Math.round(o.fontSize * o.padding);
    const lh = o.fontSize * o.lineHeight;
    const textW = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    const W = Math.ceil(textW + pad * 2 + (o.stroke?.width ?? 0) * 2);
    const H = Math.ceil(lh * lines.length + pad * 2);
    // A CanvasTexture's GPU storage is allocated once (immutable texStorage2D in r181) at its first upload, so
    // re-uploading a canvas of a DIFFERENT size reads into the old-size storage: the result then depends on
    // which string was drawn first (seek-order dependent). Dispose so the next upload re-allocates.
    const resized = canvas.width !== W || canvas.height !== H;
    canvas.width = W; // resizing resets ctx state
    canvas.height = H;
    if (resized && uploaded) tex.dispose();
    ctx.font = fontStr;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${o.letterSpacing}px`;
    ctx.clearRect(0, 0, W, H);
    if (o.background) {
      ctx.fillStyle = o.background;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(0, 0, W, H, o.radius) : ctx.rect(0, 0, W, H);
      ctx.fill();
    }
    ctx.textBaseline = "middle";
    ctx.textAlign = o.align;
    const x = o.align === "left" ? pad : o.align === "right" ? W - pad : W / 2;
    lines.forEach((l, i) => {
      const y = pad + lh * (i + 0.5);
      if (o.stroke) {
        ctx.lineJoin = "round";
        ctx.lineWidth = o.stroke.width;
        ctx.strokeStyle = o.stroke.color;
        ctx.strokeText(l, x, y);
      }
      ctx.fillStyle = o.color;
      ctx.fillText(l, x, y);
    });
    tex.image = canvas;
    tex.needsUpdate = true;
    uploaded = true; // conservatively assume the GPU copy exists from now on (dispose() on an un-uploaded texture is a no-op)
    current = str;
    const worldH = o.height * lines.length * o.lineHeight * (H / (lh * lines.length));
    mesh.scale.set(worldH * (W / H), worldH, 1);
    mesh.userData.aspect = W / H;
    mesh.userData.lines = lines;
  }
  let uploaded = false, current = String(text);
  draw(text);
  /** setText(str): redraws only when str changes (cheap to call every frame from renderAt). */
  mesh.userData.setText = (s) => { if (String(s) !== current || mesh.userData.lines?.join("\n") !== String(s)) draw(s); };
  mesh.userData.texture = tex;
  // If a non-system font is used and arrives late, redraw once fonts settle (HyperFrames waits for
  // document.fonts before capture; renderAt reads the current texture on every seek).
  // Redraw the CURRENT text (not the original: a setText before the fonts settled must survive).
  if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => draw(current));
  return mesh;
}
