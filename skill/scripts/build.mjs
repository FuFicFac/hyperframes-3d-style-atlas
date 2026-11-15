#!/usr/bin/env node
// build.mjs <projectDir> [--crf 22] [--quality standard] [--out renders/<ID>.mp4] [--skip-render]
//           [--skip-check] [--blender] [--checks 1,4.5,9]
// One command for a scene: sync-kit -> render-sfx -> export-spec -> lint (0 errors AND 0 warnings)
// -> check -> render (encode default below) [-> export-blender] [-> check-frames]. Exits non-zero on the
// first failing step and says which.
//
// Encode default: --quality standard (x264 preset medium) with --crf 22. Measured on 03-neon-sign
// (the worst case: 15 s, 1080p30, grain on): CRF 18 = 33.4 MB, 22 = 9.4 MB, 24 = 4.9 MB, 26 = 2.8 MB. 22 shows
// no banding on the dark wall (3x-brightened crop); 24 starts to smear the grain into blocks.
import { spawnSync } from "node:child_process";
import { existsSync, statSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENCODE_DEFAULTS = { quality: "standard", crf: 22 };
const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const proj = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? ".");
if (!existsSync(join(proj, "index.html")) || !existsSync(join(proj, "scene.config.js"))) {
  console.error(`build: ${proj} needs index.html and scene.config.js (scaffold with scripts/new-scene.mjs)`);
  process.exit(2);
}
const t0 = Date.now();
const step = (name, cmd, argv, { json = false } = {}) => {
  process.stdout.write(`build: ${name} ... `);
  const r = spawnSync(cmd, argv, { cwd: proj, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status !== 0 && !json) {
    console.log(`FAILED (${secs}s)\n${(r.stdout ?? "").slice(-3000)}${(r.stderr ?? "").slice(-3000)}`);
    process.exit(1);
  }
  console.log(`ok (${secs}s)`);
  return r;
};
const node = (script, extra = []) => [join(SKILL, "scripts", script), proj, ...extra];

step("sync-kit", process.execPath, node("sync-kit.mjs"));
step("render-sfx", process.execPath, node("render-sfx.mjs"));
step("export-spec", process.execPath, node("export-spec.mjs"));

process.stdout.write("build: lint ... ");
const lint = spawnSync("npx", ["hyperframes", "lint", "--json"], { cwd: proj, encoding: "utf8" });
let L;
try { L = JSON.parse(lint.stdout); } catch { console.log(`FAILED (unparseable)\n${lint.stdout}${lint.stderr}`); process.exit(1); }
if (L.errorCount || L.warningCount) {
  console.log(`FAILED: ${L.errorCount} errors, ${L.warningCount} warnings`);
  for (const f of L.findings) console.log(`  ${f.severity ?? ""} ${f.code ?? f.rule ?? ""}: ${f.message ?? JSON.stringify(f)}`);
  process.exit(1);
}
console.log("ok (0 errors, 0 warnings)");

if (!args.includes("--skip-check")) step("check", "npx", ["hyperframes", "check"]);

const cfg = await import(pathToFileURL(join(proj, "scene.config.js")).href);
const id = cfg.ID ?? proj.split("/").pop();
const out = flag("--out", `renders/${id}.mp4`);
if (!args.includes("--skip-render")) {
  const quality = flag("--quality", ENCODE_DEFAULTS.quality);
  const crf = flag("--crf", String(ENCODE_DEFAULTS.crf));
  step(`render (quality ${quality}, crf ${crf})`, "npx", ["hyperframes", "render", "--output", out, "--fps", String(cfg.FPS ?? 30), "--quality", quality, "--crf", crf, "--quiet"]);
  const f = join(proj, out);
  if (!existsSync(f)) {
    // Dropbox can race HyperFrames' atomic rename and leave "<name> (... conflicted copy ...).mp4" instead (seen once)
    const dir = dirname(f), stem = basename(f, ".mp4");
    const c = existsSync(dir) ? readdirSync(dir).find((n) => n.startsWith(stem) && n.includes("conflicted copy") && n.endsWith(".mp4")) : null;
    if (c && statSync(join(dir, c)).mtimeMs > t0) { renameSync(join(dir, c), f); console.log(`build: recovered ${out} from Dropbox "${c}"`); }
    else { console.log(`build: render produced no ${out}`); process.exit(1); }
  }
  console.log(`build: ${out} ${(statSync(f).size / 1e6).toFixed(1)} MB`);
}
if (args.includes("--blender")) step("export-blender", process.execPath, node("export-blender.mjs", ["--no-sync"]));
if (flag("--checks")) {
  const r = spawnSync(process.execPath, node("check-frames.mjs", ["--times", flag("--checks")]), { cwd: proj, stdio: "inherit" });
  if (r.status !== 0) { console.log("build: check-frames FAILED"); process.exit(1); }
}
console.log(`build: done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
