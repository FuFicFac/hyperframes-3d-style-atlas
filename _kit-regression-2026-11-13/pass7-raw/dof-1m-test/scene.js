// 1 m DoF test scene: three checker cards at 0.75 m, 1.0 m (target) and 1.6 m from the camera.
// ?mode=none|nofocus|setfocus|ap0|relative   ?kit=... (which _atlas copy) — rendered at t=1
import { createStage, THREE } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createPost } from "./_atlas/kit/post.js";
import { depthOfField } from "./_atlas/kit/studio.js";
import { gridTexture } from "./_atlas/kit/textures.js";
const mode = new URLSearchParams(location.search).get("mode") ?? "nofocus";
const stage = createStage({ canvas: "#stage", background: 0x202024, fov: 30, near: 0.05, far: 20, shadows: false, toneMapping: "neutral" });
stage.scene.add(new THREE.AmbientLight(0xffffff, 3));
const mk = (x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: gridTexture({ size: 256, cells: 16, line: 2, bg: "#f0f0f0", fg: "#111111" }) })); m.position.set(x, 0, z); stage.scene.add(m); return m; };
mk(-0.11, 0.25); mk(0, 0); mk(0.32, -0.6);
createPost(stage, {});
const dof = mode === "none" ? null : depthOfField(stage, mode === "ap0" ? { aperture: 0, maxblur: 0.005 } : mode === "relative" ? { relativeAperture: 0.006, maxblur: 0.005 } : { aperture: 0.0022, maxblur: 0.005 });
const rig = createCameraRig(stage.camera, [{ t: 0, pos: [0, 0, 1], target: [0, 0, 0] }]);
function renderAt(t) { rig.update(t); if (mode === "setfocus") dof.setFocus(1); stage.render(t); }
stage.mount(renderAt, { duration: 5, score: [] });
