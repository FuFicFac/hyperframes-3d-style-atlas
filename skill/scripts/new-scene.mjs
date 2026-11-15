#!/usr/bin/env node
// new-scene.mjs <projectDir> --style <id> [--duration 6] [--id <ID>] [--force]
// Scaffolds a valid HyperFrames project wired to a style: index.html, scene.config.js, scene.js,
// package.json — then syncs the kit, renders sfx.wav and writes scene.spec.json. The result passes
// `npx hyperframes lint` / `check` as-is, so a new style agent starts from a green build:
//   node scripts/new-scene.mjs ../../Builder/HyperFrames/3d-style-atlas-pilot/04-my-style --style my-style
//   node scripts/build.mjs <projectDir>
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const proj = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "");
const style = flag("--style");
if (!proj || !style) {
  console.error("usage: new-scene.mjs <projectDir> --style <id> [--duration 6] [--id ID] [--force]");
  process.exit(2);
}
const specFile = join(SKILL, "styles", style, "spec.js");
if (!existsSync(specFile)) {
  console.error(`new-scene: no styles/${style}/spec.js (have: ${readdirSync(join(SKILL, "styles")).join(", ")})`);
  process.exit(2);
}
if (existsSync(join(proj, "scene.config.js")) && !args.includes("--force")) {
  console.error(`new-scene: ${proj} already has scene.config.js (use --force to overwrite)`);
  process.exit(2);
}
const { STYLE_SPEC: S } = await import(pathToFileURL(specFile).href);
const D = Number(flag("--duration", 6));
const ID = flag("--id", basename(proj));
const bg = S.world?.background ?? S.palette?.bg ?? "#101014";
const mats = Object.keys(S.materials ?? {});
const fov = S.camera?.fov ?? 35;
// spec.sfx values are meant to be VOICES names, but several specs also carry descriptive notes there ("bedNote",
// "squish: bubble+thud+paper (layered)", ...). The scaffold must only ever emit a real voice name, so each role is
// validated against kit/sound.js VOICES and falls back to a safe default (with a note) — a fresh scene always renders.
const { VOICES } = await import(pathToFileURL(join(SKILL, "kit", "sound.js")).href);
const voice = (role, fallback) => {
  const v = S.sfx?.[role];
  if (typeof v === "string" && VOICES[v]) return v;
  if (v != null) console.log(`new-scene: spec.sfx.${role} = ${JSON.stringify(v).slice(0, 60)} is not a voice name — using "${fallback}"`);
  return fallback;
};
const sfx = { bed: voice("bed", "pad"), enter: voice("enter", "pop"), ui: voice("ui", "click"), move: voice("move", "whoosh") };
// the bed's voice options: pad needs a cutoff in Hz (brightness) and a root; sustained non-pad beds just need dur
const bedOpts = sfx.bed === "pad" ? ", root: 196, brightness: 900" : "";
const moveOpts = /^whoosh/.test(sfx.move) ? `, dir: "in", dur: 1.2` : "";
mkdirSync(proj, { recursive: true });

writeFileSync(join(proj, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js"></script>
    <script type="importmap">
      {
        "imports": {
          "three": "./_atlas/vendor/three/three.module.min.js",
          "three/addons/": "./_atlas/vendor/three/addons/"
        }
      }
    </script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: ${bg}; }
      [data-composition-id="main"] { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: ${bg}; }
      #stage { position: absolute; inset: 0; display: block; width: 1920px; height: 1080px; }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1920" data-height="1080">
      <canvas id="stage" class="clip" width="1920" height="1080" data-start="0" data-duration="${D}" data-track-index="0"></canvas>
      <audio id="sfx" data-start="0" data-duration="${D}" data-track-index="2" data-volume="1" src="sfx.wav"></audio>
    </div>
    <script>
      // Three.js owns all motion (driven by hf-seek); HyperFrames still requires a registered timeline.
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
    <script type="module" src="./scene.js"></script>
  </body>
</html>
`);

writeFileSync(join(proj, "scene.config.js"), `// scene.config.js — plain data for ${ID} (style "${style}"). No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec / export-blender (Node). Units: metres, Y-up, radians, s, sRGB hex.
// Scaffolded by new-scene.mjs: replace the placeholder hero/label with the style's own props.
export const ID = ${JSON.stringify(ID)};
export const STYLE = ${JSON.stringify(style)};
export const DURATION = ${D};   // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "enter", t: 0.4, dur: 0.8 },
  { id: "title", t: 1.6, dur: 0.7 },
  { id: "move", t: 2.6, dur: ${Math.max(1, D - 3.4).toFixed(1)} },
];

export const CAMERA = [
  { t: 0, pos: [4.5, 3.2, 8.5], target: [0, 0.9, 0], fov: ${fov} },
  { t: ${D}, pos: [-3.8, 2.8, 7.6], target: [0, 1.0, 0], fov: ${fov}, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "ground", primitive: "ground", dims: { size: 60 } },
  {
    // placeholder: default grey material. Style materials: ${mats.join(", ") || "(none)"} — some styles
    // turn materials into vertex-colour materials in style.js (black on plain primitives); prefer style.props/factories.
    id: "hero", primitive: "roundedBox", dims: { w: 1.2, h: 1.2, d: 1.2, radius: 0.1 },
    position: [0, 0.6, 0],
    anim: [{ prop: "scale", beat: "enter", from: 0, to: 1, ease: "outBack" }],
  },
  {
    id: "label", primitive: "text", text: ${JSON.stringify(ID.toUpperCase())}, dims: { height: 0.45 }, position: [0, 2.0, 0],
    anim: [
      { prop: "position", beat: "title", from: [0, 1.7, 0], to: [0, 2.0, 0], ease: "outCubic" },
      { prop: "opacity", beat: "title", from: 0, to: 1, ease: "outCubic" },
    ],
  },
];

// SCORE: cue times derive from BEATS so retiming a beat retimes its sound.
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;
export const SCORE = [
  { t: 0, type: ${JSON.stringify(sfx.bed)}, dur: DURATION, gain: 0.18${bedOpts} },   // bed (spec.sfx.bed)
  { t: at("enter"), type: ${JSON.stringify(sfx.enter)}, gain: 0.6 },
  { t: at("title"), type: ${JSON.stringify(sfx.ui)}, gain: 0.4 },
  { t: at("move", -0.1), type: ${JSON.stringify(sfx.move)}${moveOpts}, gain: 0.35 },
];
export const DUCK = []; // duckFromBeats(beatsFromSrt(vo_srt)) once a voiceover exists
`);

writeFileSync(join(proj, "scene.js"), `// scene.js — ${ID}: style "${style}". Every frame is a pure function of t (see references/style-authoring.md).
import { createStage, Timeline } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec, animateObjects } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/${style}/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

function renderAt(t) {
  animateObjects(objs, tl, t); // data-driven tracks first
  // hand-written motion here, derived ONLY from t / tl.p(id, t) / prop.userData.update(t)
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
`);
if (!existsSync(join(proj, "package.json"))) writeFileSync(join(proj, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2) + "\n");

for (const s of ["sync-kit.mjs", "render-sfx.mjs", "export-spec.mjs"]) execFileSync(process.execPath, [join(SKILL, "scripts", s), proj], { stdio: "inherit" });
console.log(`new-scene: ${proj} (style ${style}, ${D}s). Next: node "${join(SKILL, "scripts/build.mjs")}" "${proj}"`);
