// post.js — thin, stateless EffectComposer wrapper. No pass reads previous-frame history.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uFocus: { value: 0.5 },
    uRange: { value: 0.15 },
    uBlur: { value: 6.0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes;
    uniform float uFocus; uniform float uRange; uniform float uBlur; varying vec2 vUv;
    void main(){
      float d = max(0.0, abs(vUv.y - uFocus) - uRange);
      float r = uBlur * smoothstep(0.0, 0.35, d);
      vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float fi = float(i); float w = exp(-fi*fi/18.0);
        acc += texture2D(tDiffuse, vUv + uDir * fi * r / uRes) * w; wsum += w;
      }
      gl_FragColor = acc / wsum;
    }`,
};

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uVignette: { value: 0 },
    uVigOffset: { value: 1.0 },
    uGrain: { value: 0 },
    uFrame: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: TiltShiftShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uVignette; uniform float uVigOffset;
    uniform float uGrain; uniform float uFrame; uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= uTint;
      vec2 q = (vUv - 0.5) * vec2(uRes.x/uRes.y, 1.0);
      c.rgb *= mix(1.0, smoothstep(uVigOffset, uVigOffset - 0.9, length(q)), uVignette);
      float n = h(floor(vUv*uRes) + vec2(uFrame*17.0, uFrame*31.0)) - 0.5;
      c.rgb += n * uGrain;
      gl_FragColor = c;
    }`,
};

/**
 * createPost(stage, effects?) -> post  (also sets stage.post so stage.render(t) uses it)
 *   effects: {
 *     bloom?:     { strength = 0.6, radius = 0.4, threshold = 0.85 }  threshold is LINEAR HDR luminance
 *                 BEFORE tone mapping: lit light-colored surfaces exceed 1.0, so light scenes need
 *                 threshold ~2–3 (verified: 0.95 hazes the whole neutral scene; 2.5 is clean).
 *                 Dark/neon scenes: 0.6–1.0 with emissive strength > 1 on the glowing parts.
 *     tiltShift?: { focus = 0.5 (0 bottom..1 top), range = 0.12, blur = 6 }
 *     vignette?:  { darkness = 0.45, offset = 1.0 }
 *     grain?:     { amount = 0.04, fps = 30 }        grain pattern is a hash of floor(t*fps) — stateless
 *     tint?:      0xffffff
 *   }
 *   post.render(t)   renders one frame for time t (no history)
 *   post.passes      { render, bloom?, tiltH?, tiltV?, output, finish }
 *   post.set(effects) live-update params (e.g. bloom strength driven by t inside renderAt)
 */
export function createPost(stage, effects = {}) {
  const { renderer, scene, camera, width, height } = stage;
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  const passes = {};
  passes.render = new RenderPass(scene, camera);
  composer.addPass(passes.render);

  if (effects.bloom) {
    const b = { strength: 0.6, radius: 0.4, threshold: 0.85, ...effects.bloom };
    passes.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), b.strength, b.radius, b.threshold);
    composer.addPass(passes.bloom);
  }
  if (effects.tiltShift) {
    const ts = { focus: 0.5, range: 0.12, blur: 6, ...effects.tiltShift };
    for (const [key, dir] of [["tiltH", [1, 0]], ["tiltV", [0, 1]]]) {
      const p = new ShaderPass(TiltShiftShader);
      p.uniforms.uDir.value.set(...dir);
      p.uniforms.uRes.value.set(width, height);
      p.uniforms.uFocus.value = ts.focus;
      p.uniforms.uRange.value = ts.range;
      p.uniforms.uBlur.value = ts.blur;
      passes[key] = p;
      composer.addPass(p);
    }
  }
  passes.output = new OutputPass(); // tone mapping + sRGB conversion
  composer.addPass(passes.output);
  passes.finish = new ShaderPass(FinishShader);
  passes.finish.uniforms.uRes.value.set(width, height);
  composer.addPass(passes.finish);

  const grainFps = effects.grain?.fps ?? 30;
  const post = {
    composer,
    passes,
    set(e = {}) {
      if (e.bloom && passes.bloom) Object.assign(passes.bloom, e.bloom);
      if (e.tiltShift && passes.tiltH) {
        for (const p of [passes.tiltH, passes.tiltV]) {
          if (e.tiltShift.focus != null) p.uniforms.uFocus.value = e.tiltShift.focus;
          if (e.tiltShift.range != null) p.uniforms.uRange.value = e.tiltShift.range;
          if (e.tiltShift.blur != null) p.uniforms.uBlur.value = e.tiltShift.blur;
        }
      }
      const f = passes.finish.uniforms;
      if (e.vignette) {
        f.uVignette.value = e.vignette.darkness ?? 0.45;
        f.uVigOffset.value = e.vignette.offset ?? 1.0;
      }
      if (e.grain) f.uGrain.value = e.grain.amount ?? 0.04;
      if (e.tint != null) f.uTint.value.set(e.tint);
    },
    /**
     * insertBefore(pass, name = "output", key) — add your own pass into the stack at a known stage: "output" = still
     * LINEAR HDR (after bloom/tilt-shift, before tone mapping); "finish" = display-referred (after tone mapping, before
     * tint/vignette/grain). Stored as passes[key] when given. Returns the pass.
     */
    insertBefore(pass, name = "output", key) {
      const idx = composer.passes.indexOf(passes[name]);
      composer.insertPass(pass, idx < 0 ? composer.passes.length : idx);
      if (key) passes[key] = pass;
      return pass;
    },
    render(t = 0) {
      passes.render.camera = stage.camera; // follow a replaced stage.camera (setProjection, style swaps)
      passes.finish.uniforms.uFrame.value = Math.floor(t * grainFps + 1e-6) % 4096;
      composer.render(0); // delta unused by our passes
    },
  };
  post.set(effects);
  stage.post = post;
  return post;
}

/**
 * focusOn(stage, point [x,y,z], { range, min = .3, max = .7 }) — aim the tilt-shift band at a 3D point
 * (projects it through stage.camera; call after the camera moves, inside renderAt). No-op without tiltShift.
 * Keeps the subject sharp while the top/bottom of frame go soft. (tiny-diorama)
 */
export function focusOn(stage, p, o = {}) {
  const post = stage.post;
  if (!post?.passes?.tiltH) return;
  const cam = stage.camera;
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(...(p.isVector3 ? p.toArray() : p)).project(cam);
  const f = Math.min(Math.max((v.y + 1) / 2, o.min ?? 0.3), o.max ?? 0.7);
  post.set({ tiltShift: { focus: f, ...(o.range != null ? { range: o.range } : {}) } });
}

/**
 * whipBlurPass(stage, taps = 9) -> ShaderPass inserted before tone mapping (post.insertBefore(..., "output", "whip")):
 *   horizontal motion blur for whip pans between sets. pass.userData.set(px): blur length in frame pixels (< .75 =
 *   disabled, zero cost). Per-pixel jittered taps (hash of gl_FragCoord: deterministic). Needs a post stack. (wam-house)
 */
export function whipBlurPass(stage, taps = 9) {
  const pass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uLen: { value: 0 }, uRes: { value: new THREE.Vector2(stage.width, stage.height) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uLen; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        if (uLen < 0.75) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
        float j = h(gl_FragCoord.xy) - 0.5;
        vec4 acc = vec4(0.0);
        for (int i = 0; i < ${taps}; i++) {
          float f = (float(i) + 0.5 + j) / float(${taps}) - 0.5;
          acc += texture2D(tDiffuse, vUv + vec2(f * uLen / uRes.x, 0.0));
        }
        gl_FragColor = acc / float(${taps});
      }`,
  });
  stage.post.insertBefore(pass, "output", "whip");
  pass.enabled = false;
  pass.userData = { set(px) { pass.uniforms.uLen.value = px; pass.enabled = px >= 0.75; } };
  return pass;
}
