#!/usr/bin/env node
// export-spec.mjs <projectDir> [--out scene.spec.json]
// Writes ONE renderer-agnostic JSON file: conventions + the style's STYLE_SPEC + the scene's
// plain data from scene.config.js (duration, fps, beats, score, camera keys, objects). Intended as
// the hand-off format for non-Three translators (e.g. Blender).
import { writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const proj = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? ".");
const out = resolve(proj, flag("--out", "scene.spec.json"));

const cfg = await import(pathToFileURL(join(proj, "scene.config.js")).href);
const styleId = cfg.STYLE ?? "neutral";
// Prefer the project's synced copy (what actually renders); fall back to the skill's styles/.
const local = join(proj, "_atlas", "styles", styleId, "spec.js");
const specPath = existsSync(local) ? local : join(SKILL, "styles", styleId, "spec.js");
const { STYLE_SPEC } = await import(pathToFileURL(specPath).href);

const doc = {
  format: "3d-style-atlas/spec@1",
  conventions: {
    units: "metres (1 unit = 1 m)",
    axes: "Y-up, right-handed; camera looks down -Z by default; ground is the XZ plane at y = 0",
    color: "sRGB hex strings",
    angles: "radians (Euler XYZ order for rotation)",
    lightIntensity: "three.js physical units (directional/hemisphere/ambient: lux-like; spot/point: candela, decay 2)",
    time: "seconds from composition start",
    easing: "named functions from kit/time.js `ease` (formulas in references/kit-api.md)",
    camera: "fov is vertical field of view in degrees (three.js convention); sensor-agnostic",
  },
  style: STYLE_SPEC,
  scene: {
    id: cfg.ID ?? proj.split("/").pop(),
    style: styleId,
    duration: cfg.DURATION,
    fps: cfg.FPS ?? 30,
    resolution: cfg.RESOLUTION ?? [1920, 1080],
    beats: cfg.BEATS ?? [],
    camera: cfg.CAMERA ?? [],
    objects: cfg.OBJECTS ?? [],
    score: cfg.SCORE ?? [],
    duck: cfg.DUCK ?? [],
    notes: cfg.NOTES ?? null,
  },
};
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`export-spec: ${styleId} + ${doc.scene.id} -> ${out}`);
