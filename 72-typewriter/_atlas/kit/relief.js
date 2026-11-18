// relief.js — multi-channel height-map baker for embossing / debossing / letterpress / coins / seals.
// Generalised from the embossed-letterpress pilot's bakeRelief (same algorithm; the style keeps its own copy and
// its relief sheet shader). Each LAYER is drawn white-on-black into a canvas by your draw(ctx, W, H, ppm), then
// blurred twice — a sharp "shoulder" and a wide "pillow" — and packed into channel i % 4 of RGBA DataTextures, so
// up to 4 independently animatable relief layers share one texture (a shader mixes them by per-layer amounts).
// Bake ONCE at build time; animate by changing per-layer heights in uniforms, never by re-baking per frame.
import * as THREE from "three";
import { makeCanvas } from "./textures.js";

/**
 * bakeHeightLayers(layers [{ draw(ctx, W, H, ppm) }], { width = 4, height = 3 (m), pxPerMetre = 300, shoulder = .004 (m),
 *   pillowRadius = .03 (m), wideDownsample = 4, maxLayers = 8 })
 *   -> { sharp: DataTexture[], wide: DataTexture[], size: [W, H] }   (linear data, mipmapped, clamped)
 */
export function bakeHeightLayers(layers, o = {}) {
  const S = { width: 4, height: 3, pxPerMetre: 300, shoulder: 0.004, pillowRadius: 0.03, wideDownsample: 4, maxLayers: 8, ...o };
  if (layers.length > S.maxLayers) throw new Error(`bakeHeightLayers: at most ${S.maxLayers} layers (got ${layers.length})`);
  const ppm = S.pxPerMetre, Wp = Math.round(S.width * ppm), Hp = Math.round(S.height * ppm);
  const ds = S.wideDownsample, Ww = Math.ceil(Wp / ds), Hw = Math.ceil(Hp / ds);
  const mask = makeCanvas(Wp, Hp), mctx = mask.getContext("2d");
  const blur = makeCanvas(Wp, Hp), bctx = blur.getContext("2d", { willReadFrequently: true });
  const wide = makeCanvas(Ww, Hw), wctx = wide.getContext("2d", { willReadFrequently: true });
  const nTex = Math.ceil(S.maxLayers / 4);
  const sharpData = Array.from({ length: nTex }, () => new Uint8Array(Wp * Hp * 4));
  const wideData = Array.from({ length: nTex }, () => new Uint8Array(Ww * Hw * 4));
  layers.forEach((L, i) => {
    mctx.reset?.();
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, Wp, Hp);
    mctx.fillStyle = "#fff";
    mctx.strokeStyle = "#fff";
    L.draw(mctx, Wp, Hp, ppm);
    for (const [ctx, cw, ch, r, out, n] of [[bctx, Wp, Hp, S.shoulder * ppm, sharpData, Wp * Hp], [wctx, Ww, Hw, (S.pillowRadius * ppm) / ds, wideData, Ww * Hw]]) {
      ctx.reset?.();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      ctx.filter = `blur(${r.toFixed(3)}px)`;
      ctx.drawImage(mask, 0, 0, cw, ch);
      ctx.filter = "none";
      const src = ctx.getImageData(0, 0, cw, ch).data, dst = out[i >> 2], c = i & 3;
      for (let p = 0; p < n; p++) dst[p * 4 + c] = src[p * 4];
    }
  });
  const tex = (data, w, hh) => {
    const t = new THREE.DataTexture(data, w, hh, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { sharp: sharpData.map((d) => tex(d, Wp, Hp)), wide: wideData.map((d) => tex(d, Ww, Hw)), size: [Wp, Hp] };
}
