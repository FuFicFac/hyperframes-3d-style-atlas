#!/usr/bin/env node
// render-sfx.mjs <projectDir> [--out sfx.wav] [--sr 48000]
// Imports <projectDir>/scene.config.js (DURATION, SCORE, optional DUCK, SFX_SEED) and writes a
// 16-bit stereo WAV synthesized by kit/sound.js. Deterministic: same config -> byte-identical file.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderScore, encodeWav } from "../kit/sound.js";

const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const proj = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? ".");
const out = resolve(proj, flag("--out", "sfx.wav"));
const sr = Number(flag("--sr", 48000));

const cfg = await import(pathToFileURL(join(proj, "scene.config.js")).href);
if (!cfg.DURATION || !Array.isArray(cfg.SCORE)) throw new Error("scene.config.js must export DURATION and SCORE");
const t0 = Date.now();
const buf = renderScore(cfg.SCORE, { duration: cfg.DURATION, sampleRate: sr, duck: cfg.DUCK ?? [], seed: cfg.SFX_SEED ?? 1 });
writeFileSync(out, encodeWav(buf));
let peak = 0;
for (const ch of [buf.left, buf.right]) for (const v of ch) peak = Math.max(peak, Math.abs(v));
console.log(`render-sfx: ${cfg.SCORE.length} events, ${cfg.DURATION}s @ ${sr} Hz, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(2)} dBFS -> ${out} (${Date.now() - t0} ms)`);
