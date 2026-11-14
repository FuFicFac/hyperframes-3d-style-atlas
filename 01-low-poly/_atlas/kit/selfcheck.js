// selfcheck.js — in-page determinism + numeric sanity check (driven by scripts/check-frames.mjs --deep, or call
// it yourself from the browser console). Never used at render time.
//
// What it catches that a plain "seek in reverse order" snapshot can miss:
//  * state carried between renders: canvas 2D state leaking between redraws (font, letterSpacing, globalAlpha,
//    composite op, transforms), textures/geometry rebuilt only on change, caches keyed on the wrong thing,
//    stale world/camera matrices read before the renderer updates them, shaders compiled once per state;
//  * NaN / Inf in the HDR scene (pow() of a negative, divide by zero, normalize(0), anisotropic materials on
//    geometry without tangents) — bloom smears one NaN pixel across the frame, which usually shows up as a
//    black or garbage block in the final frame.
// Method: for every time t it renders t (a) after a "cold" neighbour, (b) after every other probe time in a
// shuffled order, (c) twice in a row, and compares pixel hashes of the WebGL canvas. Any mismatch names the
// time and which visit order disagreed. Then, per time, it scans EVERY pixel of the raw HDR scene for NaN/Inf
// (full resolution since pass 6 — the old 1/8-size, 48 x 48-sample scan missed a NaN once) and looks for pure
// black blocks in the final frame (what NaN looks like after bloom/post, which the scene scan cannot see).
import * as THREE from "three";

/** readCanvas(stage) -> { px: Uint8Array RGBA (bottom row first), w, h } — the default framebuffer (preserveDrawingBuffer). */
export function readCanvas(stage) {
  const gl = stage.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { px, w, h };
}

/** Fast 32-bit FNV-1a over the canvas pixels. canvasHash(stage, read?) -> { hash, meanLevel } (pass a readCanvas() result to reuse it). */
export function canvasHash(stage, read = readCanvas(stage)) {
  const { px } = read;
  let x = 0x811c9dc5, lum = 0;
  for (let i = 0; i < px.length; i += 4) {
    x ^= px[i] | (px[i + 1] << 8) | (px[i + 2] << 16);
    x = Math.imul(x, 0x01000193);
    if ((i & 1023) === 0) lum += px[i] + px[i + 1] + px[i + 2];
  }
  return { hash: (x >>> 0).toString(16).padStart(8, "0"), meanLevel: +(lum / ((px.length / 1024) * 3)).toFixed(1) };
}

/** Name an object for reports: "parentName/childName (MeshStandardMaterial 'name')". */
function describe(obj) {
  const names = [];
  for (let o = obj; o && !o.isScene && names.length < 4; o = o.parent) names.unshift(o.name || o.type);
  const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
  return `${names.join("/")}${m ? ` (${m.type}${m.name ? ` '${m.name}'` : ""})` : ""}`;
}

/** Which mesh is under frame pixel (x, y) (top-left origin)? CPU raycast: shader-displaced vertices are not seen. */
export function objectAtPixel(stage, x, y) {
  try {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x + 0.5) / stage.width) * 2 - 1, 1 - ((y + 0.5) / stage.height) * 2), stage.camera);
    const hit = ray.intersectObject(stage.scene, true).find((h) => h.object.isMesh && h.object.visible);
    return hit ? describe(hit.object) : null;
  } catch {
    return null;
  }
}

/**
 * hdrScan(stage, { scale = 1, grid = 0, locate = true }) -> { nan, inf, samples, w, h, box?, first?, hit? }
 *   Re-renders stage.scene through stage.camera into a FLOAT target (raw lighting values, before tone mapping and
 *   post) at `scale` x the stage size (1 = full resolution, every pixel scanned) and counts NaN / Inf channels.
 *   box = [x0, y0, x1, y1] in FRAME pixels (top-left origin) around every bad pixel; first = [x, y] of the first one;
 *   hit = the mesh a camera ray through `first` meets (a hint, not proof). Call after renderAt(t).
 *   Legacy: { scale: 1/8, grid: 48 } is the pre-pass-6 sparse scan (it sampled ~2300 points and missed a NaN).
 */
export function hdrScan(stage, { scale = 1, grid = 0, locate = true } = {}) {
  const w = Math.max(8, Math.round(stage.width * scale)), h = Math.max(8, Math.round(stage.height * scale));
  const probe = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType });
  const prev = stage.renderer.getRenderTarget();
  stage.renderer.setRenderTarget(probe);
  stage.renderer.render(stage.scene, stage.camera);
  stage.renderer.setRenderTarget(prev);
  const buf = new Float32Array(w * h * 4);
  stage.renderer.readRenderTargetPixels(probe, 0, 0, w, h, buf);
  probe.dispose();
  let nan = 0, inf = 0, n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, first = null;
  const step = grid ? Math.max(1, Math.floor((w * h) / (grid * grid))) : 1;
  for (let i = 0; i < w * h; i += step) {
    let bad = false;
    for (let c = 0; c < 3; c++) {
      const v = buf[i * 4 + c];
      if (v !== v) { nan++; bad = true; }
      else if (v === Infinity || v === -Infinity) { inf++; bad = true; }
    }
    n++;
    if (bad) {
      const px = i % w, py = h - 1 - Math.floor(i / w); // to top-left origin
      if (!first) first = [px, py];
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
  }
  const out = { nan, inf, samples: n, w, h };
  if (first) {
    const k = stage.width / w; // back to frame pixels
    out.box = [Math.floor(x0 * k), Math.floor(y0 * k), Math.ceil((x1 + 1) * k) - 1, Math.ceil((y1 + 1) * k) - 1];
    out.first = [Math.round(first[0] * k), Math.round(first[1] * k)];
    if (locate) out.hit = objectAtPixel(stage, out.first[0], out.first[1]);
  }
  return out;
}

/**
 * blackBlocks(read, { tile = 16, around = 24, min = 2 }) -> { count, box?, first? }
 *   Final-frame symptom detector: tiles (tile x tile px) that are EXACTLY black (0,0,0) while at least `min` of their
 *   4 neighbour tiles average above `around` levels — the square holes bloom/blur passes punch around a NaN pixel.
 *   A legitimately pure-black object on a bright ground can trigger it, so it is a WARNING; the HDR scan is the proof.
 *   Coordinates are frame pixels, top-left origin.
 */
export function blackBlocks({ px, w, h }, { tile = 16, around = 24, min = 2 } = {}) {
  const tx = Math.floor(w / tile), ty = Math.floor(h / tile);
  const black = new Uint8Array(tx * ty), mean = new Float32Array(tx * ty);
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
    let allZero = 1, sum = 0;
    for (let y = j * tile; y < (j + 1) * tile; y++) {
      let o = (y * w + i * tile) * 4;
      for (let x = 0; x < tile; x++, o += 4) {
        const s = px[o] + px[o + 1] + px[o + 2];
        if (s) allZero = 0;
        sum += s;
      }
    }
    black[j * tx + i] = allZero;
    mean[j * tx + i] = sum / (tile * tile * 3);
  }
  let count = 0, box = null, first = null;
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
    if (!black[j * tx + i]) continue;
    let lit = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < tx && b < ty && mean[b * tx + a] > around) lit++;
    }
    if (lit < min) continue;
    count++;
    const X0 = i * tile, Y1 = h - 1 - j * tile, X1 = X0 + tile - 1, Y0 = Y1 - tile + 1; // readPixels rows are bottom-up
    if (!first) first = [X0, Y0];
    box = box ? [Math.min(box[0], X0), Math.min(box[1], Y0), Math.max(box[2], X1), Math.max(box[3], Y1)] : [X0, Y0, X1, Y1];
  }
  return { count, box, first };
}

/**
 * selfCheck(api = window.__atlas, times, { seed = 1, hdrScale = 1 }) -> { ok, problems: [...], warnings, frames: { t: { hash, meanLevel, hdr, blocks } } }
 *   api: the object stage.mount exposes (window.__atlas). times: seconds to probe (4-8 spread over the film).
 */
export function selfCheck(api, times, { seed = 1, hdrScale = 1 } = {}) {
  const { stage } = api;
  const at = (t) => { api.renderAt(t); return canvasHash(stage); };
  const problems = [], warnings = [];
  const ref = {};
  // (a) cold-ish: each time after rendering t = 0
  for (const t of times) { at(0); ref[t] = at(t); }
  // (b) shuffled visit order (deterministic shuffle)
  let s = seed >>> 0;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  const order = [...times, ...times].sort(() => rnd() - 0.5);
  for (const t of order) {
    const h = at(t);
    if (h.hash !== ref[t].hash) problems.push({ t, kind: "order", detail: `t=${t} differs when visited in shuffled order (${h.hash} vs ${ref[t].hash})` });
  }
  // (c) twice in a row (catches "first render after a change is different")
  for (const t of times) {
    const a = at(t), b = at(t);
    if (a.hash !== b.hash) problems.push({ t, kind: "repeat", detail: `t=${t} differs between two consecutive renders` });
  }
  // numeric sanity (full-resolution HDR scan) + black frames / black blocks in the final frame
  const frames = {};
  for (const t of times) {
    api.renderAt(t);
    const read = readCanvas(stage);
    const h = canvasHash(stage, read);
    const blocks = blackBlocks(read);
    const hdr = hdrScan(stage, { scale: hdrScale });
    frames[t] = { ...h, hdr, blocks };
    if (hdr && (hdr.nan || hdr.inf)) {
      problems.push({ t, kind: "nan", box: hdr.box, first: hdr.first, hit: hdr.hit,
        detail: `t=${t}: ${hdr.nan} NaN / ${hdr.inf} Inf channels in the HDR scene (${hdr.w}x${hdr.h} scan), frame px box [${hdr.box}] (x0,y0,x1,y1 top-left), first at (${hdr.first})${hdr.hit ? `, ray hits ${hdr.hit}` : ""} — check pow()/normalize()/divisions in custom shaders, tangents on anisotropic materials` });
    }
    if (blocks.count) warnings.push(`t=${t}: ${blocks.count} pure-black ${16}px block(s) inside lit areas, box [${blocks.box}] (top-left) — the signature of NaN smeared by bloom/post; look at the still (a legitimately pure-black object can also trigger this)`);
    if (h.meanLevel < 1) warnings.push(`t=${t}: frame is (nearly) black (mean level ${h.meanLevel}) — fine if intended (fade from black), else suspect NaN or an unlit scene`);
  }
  // dedupe
  const seen = new Set();
  const uniq = problems.filter((p) => (seen.has(p.detail) ? false : seen.add(p.detail)));
  return { ok: uniq.length === 0, problems: uniq, warnings, frames };
}
