// styles/neutral/spec.js — STYLE_SPEC for the neutral reference style. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians, three.js light units.
import { LIGHT_PRESETS } from "../../kit/presets.js";

export const STYLE_SPEC = {
  id: "microscope-slide",
  name: "Neutral Studio",
  description: "Matte clay primitives on a warm grey studio floor, soft three-point light, gentle grain.",
  palette: {
    bg: "#d8d4cc",
    floor: "#d9d5cd",
    ink: "#1d1f24",
    primary: "#e4572e",
    secondary: "#2e86ab",
    accent: "#f3a712",
    neutral: "#f2efe9",
  },
  world: {
    background: "#d8d4cc",
    fog: { color: "#d8d4cc", near: 18, far: 40 },
    environment: "room", // RoomEnvironment PMREM for soft reflections; null = none
    environmentIntensity: 0.35,
    toneMapping: "aces",
    exposure: 1.0,
  },
  materials: {
    floor: { type: "standard", baseColor: "#d9d5cd", roughness: 0.95, metalness: 0 },
    clayPrimary: { type: "standard", baseColor: "#e4572e", roughness: 0.55, metalness: 0, bump: { source: "bumpNoise", scale: 24, octaves: 3, seed: 11, strength: 0.6, description: "fine fbm value-noise, 24 cells/tile" } },
    claySecondary: { type: "standard", baseColor: "#2e86ab", roughness: 0.5, metalness: 0 },
    clayAccent: { type: "physical", baseColor: "#f3a712", roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    clayNeutral: { type: "standard", baseColor: "#f2efe9", roughness: 0.7, metalness: 0 },
  },
  lights: LIGHT_PRESETS.soft,
  post: {
    vignette: { darkness: 0.35, offset: 1.1 },
    grain: { amount: 0.025, fps: 30 },
  },
  camera: { fov: 35, near: 0.1, far: 200, drift: { amp: 0.06, speed: 0.4 } },
  text: { font: "sans", weight: 800, color: "#1d1f24", height: 0.55 },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "blip", bed: "pad" },
  motion: [
    "Objects enter by dropping with outBounce (land = thud) or scaling up with outBack (pop).",
    "Camera: one slow inOutCubic move per 2–3 s, tiny drift during holds; never cut.",
    "Labels rise 0.3 m while fading in over ~0.6 s (outCubic).",
  ],
};
