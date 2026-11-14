// lights.js — build lights from plain-data specs; presets live in presets.js.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { LIGHT_PRESETS } from "./presets.js";
export { LIGHT_PRESETS };

/**
 * configureShadow(light, { softness = 4, mapSize = 2048, extent = 8, near = 0.5, far = 40,
 *                          bias = -0.0004, normalBias = 0.02 })
 * softness = PCFSoft blur radius; extent = half-width of a directional light's ortho shadow frustum (m).
 */
export function configureShadow(light, o = {}) {
  const { softness = 4, mapSize = 2048, extent = 8, near = 0.5, far = 40, bias = -0.0004, normalBias = 0.02 } = o;
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = bias;
  light.shadow.normalBias = normalBias;
  light.shadow.radius = softness;
  const cam = light.shadow.camera;
  cam.near = near;
  cam.far = far;
  if (cam.isOrthographicCamera) {
    cam.left = cam.bottom = -extent;
    cam.right = cam.top = extent;
  }
  cam.updateProjectionMatrix();
  return light;
}

/**
 * lightsFromSpec(scene, rig, { intensity = 1 }) -> { group, [id]: light }
 *   rig: array of light specs (see presets.js / kit-api.md):
 *     { id, type: "directional"|"spot"|"point"|"hemisphere"|"ambient", color, groundColor?, intensity,
 *       position?, target?, angle?, penumbra?, distance?, decay?, shadow?: configureShadow opts }
 */
export function lightsFromSpec(scene, rig, { intensity = 1 } = {}) {
  const group = new THREE.Group();
  group.name = "lights";
  const out = { group };
  rig.forEach((s, i) => {
    const I = (s.intensity ?? 1) * intensity;
    let l;
    switch (s.type) {
      case "directional": l = new THREE.DirectionalLight(s.color, I); break;
      case "spot": l = new THREE.SpotLight(s.color, I, s.distance ?? 0, s.angle ?? Math.PI / 6, s.penumbra ?? 0.3, s.decay ?? 2); break;
      case "point": l = new THREE.PointLight(s.color, I, s.distance ?? 0, s.decay ?? 2); break;
      case "hemisphere": l = new THREE.HemisphereLight(s.color, s.groundColor ?? "#444444", I); break;
      case "ambient": l = new THREE.AmbientLight(s.color, I); break;
      default: throw new Error(`lightsFromSpec: unknown type "${s.type}"`);
    }
    if (s.position) l.position.set(...s.position);
    if (l.target) {
      l.target.position.set(...(s.target ?? [0, 0, 0]));
      group.add(l.target);
    }
    if (s.shadow) configureShadow(l, s.shadow === true ? {} : s.shadow);
    l.name = s.id ?? `light${i}`;
    group.add(l);
    out[l.name] = l;
  });
  scene.add(group);
  return out;
}

/** addLights(scene, preset = "soft", opts) — shorthand for lightsFromSpec(scene, LIGHT_PRESETS[preset], opts). */
export function addLights(scene, preset = "soft", opts = {}) {
  const rig = LIGHT_PRESETS[preset];
  if (!rig) throw new Error(`addLights: unknown preset "${preset}"`);
  return lightsFromSpec(scene, rig, opts);
}

/** useRoomEnvironment(renderer, scene, intensity = 1) — neutral PBR reflections (PMREM, sync, no network). */
export function useRoomEnvironment(renderer, scene, intensity = 1) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  return env;
}
