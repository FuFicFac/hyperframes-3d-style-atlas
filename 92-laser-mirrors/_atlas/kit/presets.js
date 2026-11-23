// presets.js — plain-data presets (JSON-serializable, Node-safe). Consumed by lightsFromSpec().
// Units: metres, Y-up, colors sRGB hex strings, intensities in three.js physical units
// (directional/hemisphere: lux-like scalar; spot/point: candela with decay 2).

export const LIGHT_PRESETS = {
  // soft three-point: warm key with shadows, cool fill, rim, hemisphere ambient
  soft: [
    { id: "ambient", type: "hemisphere", color: "#f3f6ff", groundColor: "#3a3530", intensity: 0.55 },
    { id: "key", type: "directional", color: "#fff1e0", intensity: 3.0, position: [5, 8, 6], target: [0, 0, 0], shadow: { softness: 3, mapSize: 2048, extent: 8 } },
    { id: "fill", type: "directional", color: "#cfe0ff", intensity: 0.6, position: [-6, 3, 4], target: [0, 0, 0] },
    { id: "rim", type: "directional", color: "#ffffff", intensity: 1.0, position: [-2, 5, -8], target: [0, 0, 0] },
  ],
  // bright even product light
  studio: [
    { id: "ambient", type: "hemisphere", color: "#ffffff", groundColor: "#8a8a8a", intensity: 1.4 },
    { id: "key", type: "directional", color: "#ffffff", intensity: 2.0, position: [3, 10, 7], target: [0, 0, 0], shadow: { softness: 6, mapSize: 2048, extent: 8 } },
    { id: "fill", type: "directional", color: "#ffffff", intensity: 0.8, position: [-8, 4, 5], target: [0, 0, 0] },
    { id: "rim", type: "directional", color: "#ffffff", intensity: 0.8, position: [0, 6, -9], target: [0, 0, 0] },
  ],
  // dramatic overhead spot + low ambient
  stage: [
    { id: "ambient", type: "hemisphere", color: "#8090b0", groundColor: "#101018", intensity: 0.25 },
    { id: "key", type: "spot", color: "#fff4e6", intensity: 220, position: [2, 12, 4], target: [0, 0, 0], angle: 0.45, penumbra: 0.45, distance: 40, decay: 2, shadow: { softness: 4, mapSize: 2048 } },
    { id: "rim", type: "directional", color: "#9fc4ff", intensity: 0.9, position: [-4, 4, -8], target: [0, 0, 0] },
  ],
  // ambient only, no shadows (toon / paper-cut / flat looks)
  flat: [{ id: "ambient", type: "hemisphere", color: "#ffffff", groundColor: "#bbbbbb", intensity: 2.6 }],
};
