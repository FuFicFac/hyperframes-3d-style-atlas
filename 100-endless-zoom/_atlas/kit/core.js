// core.js — stage creation + HyperFrames wiring. Re-exports all pure helpers from time.js.
import * as THREE from "three";
export * from "./time.js";
export { THREE };

const TONE = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  none: THREE.NoToneMapping,
};
/** Shadow filter types. NOTE: light shadow `softness` (shadow.radius) only affects "pcf" and "vsm";
 *  "pcfsoft" has a fixed small kernel (verified in the r181 shader). applyStyleSpec resolves the
 *  style's world.shadowType (default "auto": pcf when any light sets shadow.softness). */
export const SHADOW_TYPES = { pcfsoft: THREE.PCFSoftShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap, basic: THREE.BasicShadowMap };

/**
 * createStage(opts) -> stage
 *   opts: { canvas = "#stage", width = 1920, height = 1080, background = 0x101014 | null (transparent),
 *           fov = 35, near = 0.1, far = 200, shadows = true, shadowType = "pcfsoft"|"pcf"|"vsm"|"basic",
 *           toneMapping = "aces"|"agx"|"neutral"|"none", exposure = 1, antialias = true,
 *           projection = "perspective"|"orthographic" }   orthographic: see makeOrthoCamera()
 *   stage: { THREE, renderer, scene, camera, canvas, width, height, post: null, overlay: null, render(t), mount(renderAt, meta) }
 * Everything is synchronous. Renderer is pinned to width x height at pixelRatio 1.
 */
export function createStage(opts = {}) {
  const {
    canvas = "#stage",
    width = 1920,
    height = 1080,
    background = 0x101014,
    fov = 35,
    near = 0.1,
    far = 200,
    shadows = true,
    toneMapping = "aces",
    exposure = 1,
    antialias = true,
    projection = "perspective",
  } = opts;
  const el = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
  if (!el) throw new Error(`createStage: canvas ${canvas} not found`);

  const renderer = new THREE.WebGLRenderer({
    canvas: el,
    antialias,
    alpha: background == null,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE[toneMapping] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = !!shadows;
  renderer.shadowMap.type = SHADOW_TYPES[opts.shadowType ?? "pcfsoft"];
  renderer.shadowMap.autoUpdate = true;

  const scene = new THREE.Scene();
  if (background != null) scene.background = new THREE.Color(background);
  const camera = projection === "orthographic" ? makeOrthoCamera({ fov, near, far, aspect: width / height }) : new THREE.PerspectiveCamera(fov, width / height, near, far);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 0, 0);

  const stage = {
    THREE,
    renderer,
    scene,
    camera,
    canvas: el,
    width,
    height,
    post: null, // set by post.js createPost(); stage.render() uses it when present
    overlay: null, // set by overlay.js getOverlay(); drawn AFTER post (exact colours, no blur/grain/bloom)
    time: 0,
    /**
     * sync() — make every world matrix (scene graph + stage.camera, which is NOT in the scene graph) current.
     * Call it in renderAt after you move things and BEFORE you read matrixWorld / project points yourself;
     * the renderer only refreshes matrices inside render(), so earlier reads see the PREVIOUS seek's pose
     * (a seek-order bug). Kit readers (rig.update, projectToScreen, worldPoint) already refresh what they read.
     */
    sync() {
      scene.updateMatrixWorld(true);
      stage.camera.updateWorldMatrix(true, false);
      return stage;
    },
    /**
     * Render one frame with the CURRENT stage.camera (it may be replaced, e.g. by setProjection). Uses
     * stage.post if attached (its render pass is re-pointed at stage.camera), else a plain render; then the overlay.
     */
    render(t = stage.time) {
      if (stage.post) stage.post.render(t);
      else renderer.render(scene, stage.camera);
      if (stage.overlay && stage.overlay.scene.children.length) stage.overlay.render(t);
    },
    /**
     * Wire renderAt(t) to HyperFrames and (in a plain browser) the preview player.
     * meta: { duration, score?, title? } — score is the SCORE array, used by the preview player.
     */
    mount(renderAt, meta = {}) {
      const run = (t) => {
        stage.time = t;
        renderAt(t);
      };
      const api = { renderAt: run, stage, duration: meta.duration ?? 5, score: meta.score ?? [], meta, previewDriven: false };
      window.__atlas = api;
      window.addEventListener("hf-seek", (e) => {
        if (api.previewDriven) return; // preview player owns time when active
        const t = e?.detail?.time ?? window.__hfThreeTime ?? 0;
        run(Number(t) || 0);
      });
      run(Number(window.__hfThreeTime) || 0);
      if (isPreviewContext()) {
        import("./player.js").then((m) => m.attachPlayer(api)).catch((err) => console.warn("[atlas] player failed", err));
      }
      return api;
    },
  };
  return stage;
}

/**
 * True only when the page is opened directly in a normal browser tab (e.g. via scripts/serve.mjs):
 * top-level window, not automation-driven (HyperFrames render/inspect run headless Chrome with
 * navigator.webdriver = true), no HyperFrames virtual-time/render globals. Override: ?player=1 / ?player=0.
 */
export function isPreviewContext() {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("player") === "0") return false;
  if (q.get("player") === "1") return true;
  try {
    if (window.top !== window) return false; // HyperFrames studio / <hyperframes-player> iframe
  } catch {
    return false;
  }
  if (navigator.webdriver) return false;
  if (window.__HF_VIRTUAL_TIME__ || window.__HF_EXPORT_RENDER_SEEK_CONFIG) return false;
  if (/HeadlessChrome/i.test(navigator.userAgent)) return false;
  return true;
}

/**
 * makeOrthoCamera({ fov = 35, near = .1, far = 200, aspect = 16/9, viewHeight = null }) -> OrthographicCamera
 *   An orthographic camera the kit rig can drive like a perspective one: it keeps `fov` (degrees) and, each
 *   rig.update, sets its frustum so the TARGET plane frames exactly what a perspective camera with that fov
 *   would (half-height = distance x tan(fov / 2)), unless a key/opt gives `viewHeight` (world units, full frame
 *   height). Parallel edges stay parallel: use for elevations, plans, isometric and technical looks.
 */
export function makeOrthoCamera({ fov = 35, near = 0.1, far = 200, aspect = 16 / 9, viewHeight = null } = {}) {
  const h = (viewHeight ?? 10) / 2;
  const cam = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, near, far);
  cam.fov = fov;
  cam.aspect = aspect;
  cam.userData.viewHeight = viewHeight;
  return cam;
}

/** setOrthoFrame(camera, viewHeight) — full frame height in world units; keeps aspect; updates projection. */
export function setOrthoFrame(cam, viewHeight) {
  const h = viewHeight / 2, a = cam.aspect ?? (cam.right - cam.left) / (cam.top - cam.bottom);
  cam.left = -h * a; cam.right = h * a; cam.top = h; cam.bottom = -h;
  cam.updateProjectionMatrix();
}

/**
 * setProjection(stage, "orthographic"|"perspective", { viewHeight }) -> camera. Replaces stage.camera, copying
 * position / orientation / near / far / fov. stage.render, post and overlay projection all follow stage.camera.
 */
export function setProjection(stage, kind, o = {}) {
  const old = stage.camera;
  const aspect = stage.width / stage.height;
  const cam = kind === "orthographic"
    ? makeOrthoCamera({ fov: old.fov, near: old.near, far: old.far, aspect, viewHeight: o.viewHeight ?? null })
    : new THREE.PerspectiveCamera(old.fov ?? 35, aspect, old.near, old.far);
  cam.position.copy(old.position);
  cam.quaternion.copy(old.quaternion);
  if (o.viewHeight != null && cam.isOrthographicCamera) setOrthoFrame(cam, o.viewHeight);
  cam.updateProjectionMatrix();
  if (old.parent) { old.parent.add(cam); old.parent.remove(old); }
  stage.camera = cam;
  return cam;
}

/** worldPoint(obj, local = [0,0,0]) -> THREE.Vector3 world position of a local point, with obj's whole parent chain refreshed first. */
export function worldPoint(obj, local = [0, 0, 0]) {
  obj.updateWorldMatrix(true, false);
  return new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld);
}

/** Enable cast+receive shadows on every mesh under root (convenience). */
export function shadowAll(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}
