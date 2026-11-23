// overlay.js — a UI layer drawn AFTER post-processing, straight to the canvas.
// Use it for screen-fixed labels, captions, numbers and chips that must keep exact palette colours:
// no tone mapping (materials are toneMapped:false), no bloom, no tilt-shift blur, no grain/vignette.
// It has its own orthographic camera, so it does not depend on the 3D camera's fov or drift.
//
// Overlay coordinates: x, y in NDC (-1..1, y up; (0,0) = frame centre). Sizes are fractions of the
// FRAME HEIGHT: `height: 0.06` makes one object unit 6 % of the frame height.
import * as THREE from "three";
import { canvas2d } from "./canvas.js";

/**
 * getOverlay(stage) -> overlay   (created on first call; stage.render(t) then draws it after post)
 *   overlay = { scene, camera, add(obj), remove(obj), render(t) }
 *   Rendered with autoClear off + clearDepth, so overlay objects always sit on top of the frame and
 *   sort among themselves by renderOrder / depth.
 */
export function getOverlay(stage) {
  if (stage.overlay) return stage.overlay;
  const { renderer, width, height } = stage;
  const aspect = width / height;
  const scene = new THREE.Scene();
  scene.name = "overlay";
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, -100, 100);
  camera.position.z = 10;
  const ov = {
    scene,
    camera,
    aspect,
    add(obj) {
      scene.add(obj);
      exactColours(obj);
      return obj;
    },
    remove(obj) {
      scene.remove(obj);
    },
    render() {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = auto;
    },
  };
  stage.overlay = ov;
  return ov;
}

/** Make every material under obj overlay-safe: toneMapped off, fog off (exact sRGB colours). */
export function exactColours(obj) {
  obj.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      m.toneMapped = false;
      m.fog = false;
      m.needsUpdate = true;
    }
  });
  return obj;
}

/**
 * pinToScreen(stage, obj, { x = 0, y = 0, height = 0.06, world = null, offset = [0, 0] }) -> obj
 *   Puts obj on the overlay (once) and places its origin at NDC (x, y); 1 object unit = `height` x frame
 *   height, multiplied by the object's own scale at its FIRST pin (a text label of height 1 stays one line
 *   tall and keeps its aspect; it used to be squashed to 1 x 1). With `world: [x,y,z]` the anchor follows that 3D point through stage.camera (call every frame
 *   after the camera moves); `offset` is added in NDC. obj.userData.offscreen = true when the point is
 *   behind the camera (obj is hidden). Keep UI inside |x| <= 0.9, |y| <= 0.9 (outer 5 % is unsafe).
 */
const _v = new THREE.Vector3();
export function pinToScreen(stage, obj, o = {}) {
  const ov = getOverlay(stage);
  if (obj.parent !== ov.scene) ov.add(obj);
  const { height = 0.06, offset = [0, 0] } = o;
  let { x = 0, y = 0 } = o;
  obj.userData.offscreen = false;
  if (o.world) {
    const p = projectToScreen(stage, o.world);
    x = p.x;
    y = p.y;
    obj.userData.offscreen = p.behind;
  }
  const s = height * 2;
  // the object's own scale at its FIRST pin (e.g. a text label's plane size) is kept and multiplied, so
  // labels keep their aspect; pinScale is an optional extra per-axis multiplier (e.g. a fold on y)
  const base = (obj.userData.pinBase ??= obj.scale.toArray());
  const keep = obj.userData.pinScale ?? [1, 1, 1];
  obj.position.set((x + offset[0]) * ov.aspect, y + offset[1], 0);
  obj.scale.set(s * base[0] * keep[0], s * base[1] * keep[1], s * base[2] * keep[2]);
  if (obj.userData.offscreen) obj.visible = false;
  return obj;
}

/** projectToScreen(stage, [x,y,z] | Vector3) -> { x, y, behind } in NDC through stage.camera. */
export function projectToScreen(stage, p) {
  const cam = stage.camera;
  cam.updateWorldMatrix(true, false); // parents too: never project through last frame's matrices
  _v.set(...(p.isVector3 ? p.toArray() : p));
  const viewZ = _v.clone().applyMatrix4(cam.matrixWorldInverse).z;
  _v.project(cam);
  return { x: _v.x, y: _v.y, behind: viewZ > 0 };
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 5, wam-house)
/**
 * screenCanvas(stage, wPx, hPx, draw(ctx, W, H, state), { upload = false }) -> Mesh on the overlay, drawn 1:1 in screen
 *   pixels (exact colours, never blurred). userData.place(xPx, yPx) = top-left corner in frame px; .set(state) redraws
 *   only when the JSON state changes; .opacity(a).
 *   upload: true (pass 6) uploads the (blank) canvas once at build and again inside every set() that redraws
 *   (renderer.initTexture, as textures.uploadTexture does)
 *   instead of lazily during stage.render — the determinism-safe choice for canvases redrawn in renderAt (style-authoring
 *   §5). Default false keeps the original lazy upload (existing styles stay pixel-identical).
 *   willReadFrequently (pass 7): opt-in (default false = old GPU canvas); true = CPU-rasterised, repeatable across page loads.
 */
export function screenCanvas(stage, wPx, hPx, draw, { upload = false, willReadFrequently } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = wPx; canvas.height = hPx;
  // pass 7: OPT-IN here (default false = the old GPU canvas). Turning it on by default exposed a latent ±1-level, 1-pixel
  // order flake in bead-abacus' own GPU nameplate canvas (pass7.md), so screenCanvas keeps the old default; new styles pass
  // { willReadFrequently: true } (and create their own canvases with kit/canvas.js newCanvas).
  canvas2d(canvas, { willReadFrequently: willReadFrequently ?? false });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const geo = new THREE.PlaneGeometry(wPx / hPx, 1);
  geo.translate(wPx / hPx / 2, -0.5, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 10;
  let last = null;
  mesh.userData = {
    W: wPx, H: hPx, canvas,
    place(x, y, scale = 1) {
      mesh.userData.pinScale = [scale, scale, 1];
      pinToScreen(stage, mesh, { x: (x / stage.width) * 2 - 1, y: 1 - (y / stage.height) * 2, height: hPx / stage.height });
    },
    set(state = {}) {
      const k = JSON.stringify(state);
      if (k === last) return;
      last = k;
      const ctx = canvas.getContext("2d");
      ctx.reset?.();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, wPx, hPx);
      draw(ctx, wPx, hPx, state);
      tex.needsUpdate = true;
      if (upload) stage.renderer.initTexture(tex);
    },
    opacity(a) { mesh.material.opacity = a; mesh.visible = a > 0.003; },
  };
  getOverlay(stage);
  mesh.userData.place(0, 0);
  mesh.visible = false;
  if (upload) stage.renderer.initTexture(tex); // allocate GPU storage at build, not at the first render
  return mesh;
}

