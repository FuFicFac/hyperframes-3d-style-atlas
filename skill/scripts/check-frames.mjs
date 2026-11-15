#!/usr/bin/env node
// check-frames.mjs <projectDir> --times 1,4.5,9 [--out renders/checks] [--no-audio] [--no-sync] [--deep] [--no-mp4-check]
// The verification every style agent does by hand, in one command:
//  0. clears renders/checks/ (stills from earlier runs are deleted) and writes renders/checks/RUN.txt with the
//     run time, the MP4's mtime and the newest code edit, warning when the MP4 pre-dates the code.
//     Pass 7: RUN.txt is written ONCE, at exit (also on a crash), atomically (temp name + rename), and a failed or
//     locked write only prints a warning. Writing it twice per run made Dropbox create "RUN (... conflicted copy ...).txt"
//     on rapid back-to-back runs and could crash a run. Stale "*conflicted copy*" files in the checks folder are removed.
//  0b. sync-kit first (kit/ + styles/ -> <project>/_atlas), so stills never show a stale copy of a style you
//     just edited. --no-sync skips it but still WARNS if _atlas differs from the skill.
//  1. `npx hyperframes snapshot --at <times>` -> renders/checks/t<time>.png (look at them!)
//  2. determinism: snapshot again in REVERSED order and compare decoded-pixel md5 per time
//     (seeking out of order must give identical frames: no accumulation, no Math.random, no clocks)
//  3. audio: ffmpeg volumedetect on sfx.wav (and the newest renders/*.mp4 if there is one)
//  4. --deep: in-page kit/selfcheck.js — each time rendered after t=0, in a shuffled interleaved order and twice
//     in a row (catches canvas-state carry-over, stale matrices, first-state-wins shader programs), plus a
//     NaN/Inf scan of EVERY pixel of the raw HDR scene at full resolution (pass 6; it was 1/8 size and sparse) that
//     names the pixel box and the mesh under it, and a pure-black-block detector on the final frame (warning).
//     Uses HyperFrames' chrome-headless-shell via scripts/lib/chrome.mjs.
// Exit code 1 if any frame differs between the two passes or a snapshot fails.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, statSync, mkdtempSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const proj = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? ".");
const timesArg = flag("--times");
if (!timesArg) {
  console.error("usage: check-frames.mjs <projectDir> --times 1,4.5,9 [--out renders/checks] [--no-audio]");
  process.exit(2);
}
const times = timesArg.split(",").map((s) => s.trim()).filter(Boolean);
const outDir = resolve(proj, flag("--out", "renders/checks"));
const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!args.includes("--no-sync")) {
  execFileSync(process.execPath, [join(SKILL, "scripts/sync-kit.mjs"), proj], { stdio: "ignore" });
  console.log("sync-kit: _atlas refreshed from the skill");
} else {
  const stale = staleFiles(SKILL, join(proj, "_atlas"));
  if (stale.length) console.log(`WARNING: _atlas is STALE (${stale.length} file(s) differ from the skill, e.g. ${stale.slice(0, 3).join(", ")}) — run sync-kit or drop --no-sync`);
}
function staleFiles(skill, atlas) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(join(skill, d), { withFileTypes: true })) {
      const rel = join(d, n.name);
      if (n.isDirectory()) walk(rel);
      else if (n.name.endsWith(".js")) {
        const dest = join(atlas, rel);
        if (!existsSync(dest) || readFileSync(dest, "utf8") !== readFileSync(join(skill, rel), "utf8")) out.push(rel);
      }
    }
  };
  for (const d of ["kit", "styles"]) walk(d);
  return out;
}
mkdirSync(outDir, { recursive: true });
// fresh folder every run: stale stills from an earlier run have misled reviews (they pre-dated the final render).
// Also our own junk: Dropbox "conflicted copy" files and temp files left by an interrupted RUN.txt write.
const removed = readdirSync(outDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f) || f === "RUN.txt" || f.includes("conflicted copy") || /^\.RUN\.txt\..*\.tmp$/.test(f));
const notRemoved = [];
for (const f of removed) { try { rmSync(join(outDir, f), { force: true }); } catch (e) { notRemoved.push(`${f} (${e.code ?? e.message})`); } }
if (removed.length) console.log(`checks: cleared ${removed.length - notRemoved.length} old file(s): ${removed.join(" ")}`);
if (notRemoved.length) console.log(`checks: WARNING could not delete ${notRemoved.join(", ")} — continuing`);
// RUN.txt: collected in memory, written once at exit (atomic temp + rename; never fatal)
const runLines = [];
let runFlushed = false;
function flushRun() {
  if (runFlushed || !runLines.length) return;
  runFlushed = true;
  const dest = join(outDir, "RUN.txt"), tmp = join(outDir, `.RUN.txt.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, runLines.join("\n") + "\n");
    renameSync(tmp, dest);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch {}
    console.log(`checks: WARNING could not write ${relative(proj, dest)} (${e.code ?? e.message}) — the results above are complete`);
  }
}
process.on("exit", flushRun);

const key = (t) => String(+t); // HyperFrames names stills ...-at-<seconds>s.png without trailing zeros
function snap(order) {
  const dir = mkdtempSync(join(tmpdir(), "atlas-snap-"));
  const r = spawnSync("npx", ["hyperframes", "snapshot", "--at", order.join(","), "--no-end", "-o", dir], { cwd: proj, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout?.slice(-2000), r.stderr?.slice(-2000));
    throw new Error("hyperframes snapshot failed");
  }
  const map = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
    const t = f.match(/-at-([\d.]+)s\.png$/)?.[1];
    if (t) map[key(t)] = join(dir, f);
  }
  return { dir, map };
}
/** pixelDiff(a, b) -> { count, max, frac } over decoded RGB pixels (ffmpeg rawvideo). */
function pixelDiff(fa, fb) {
  const raw = (f) => execFileSync("ffmpeg", ["-v", "error", "-i", f, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const A = raw(fa), B = raw(fb);
  if (A.length !== B.length) return { count: Infinity, max: 255, frac: 1 };
  let count = 0, max = 0;
  for (let i = 0; i < A.length; i += 3) {
    const m = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
    if (m) { count++; if (m > max) max = m; }
  }
  return { count, max, frac: count / (A.length / 3) };
}
const md5 = (f) => execFileSync("ffmpeg", ["-v", "error", "-i", f, "-f", "md5", "-"], { encoding: "utf8" }).trim().replace(/^MD5=/, "");

// staleness stamp: MP4 mtime vs newest scene/style code edit
{
  const newest = (files) => files.filter(existsSync).map((f) => ({ f, m: statSync(f).mtimeMs })).sort((x, y) => y.m - x.m)[0];
  const cfgSrc = existsSync(join(proj, "scene.config.js")) ? readFileSync(join(proj, "scene.config.js"), "utf8") : "";
  const styleId = cfgSrc.match(/export const STYLE\s*=\s*"([^"]+)"/)?.[1];
  const styleDir = styleId ? join(SKILL, "styles", styleId) : null;
  const code = [join(proj, "scene.js"), join(proj, "scene.config.js"), join(proj, "index.html"),
    ...(styleDir && existsSync(styleDir) ? readdirSync(styleDir).filter((f) => f.endsWith(".js")).map((f) => join(styleDir, f)) : [])];
  const kitNewest = newest(readdirSync(join(SKILL, "kit")).map((f) => join(SKILL, "kit", f)));
  const nc = newest(code);
  const rd = join(proj, "renders");
  const mp4 = existsSync(rd) ? newest(readdirSync(rd).filter((f) => f.endsWith(".mp4")).map((f) => join(rd, f))) : null;
  const iso = (m) => new Date(m).toISOString().replace("T", " ").slice(0, 19);
  const lines = [`check-frames run: ${iso(Date.now())} UTC`, `times: ${times.join(", ")}`,
    `newest code edit: ${nc ? `${iso(nc.m)} UTC (${nc.f.split("/").slice(-2).join("/")})` : "?"}`,
    `mp4: ${mp4 ? `${mp4.f.split("/").pop()} ${iso(mp4.m)} UTC` : "none"}`,
    `kit last changed: ${kitNewest ? iso(kitNewest.m) + " UTC" : "?"} (kit maintenance proves pixel identity separately)`];
  if (mp4 && nc && mp4.m < nc.m) lines.push("NOTE: the MP4 is older than the newest scene/style edit — see the MP4-vs-code comparison at the end (edits that change no pixels, e.g. kit re-exports, are fine).");
  globalThis.__mp4 = mp4?.f ?? null;
  runLines.push(...lines);
  for (const l of lines) console.log(l);
}
const a = snap(times);
const b = snap([...times].reverse());
let fail = 0;
console.log("time      file                          md5 (in order)                    reversed");
for (const t of times) {
  const k = key(t);
  const fa = a.map[k], fb = b.map[k];
  if (!fa || !fb) { console.log(`${t.padEnd(9)} MISSING`); fail++; continue; }
  const dest = join(outDir, `t${t}.png`);
  try { copyFileSync(fa, dest); } catch (e) { console.log(`checks: WARNING could not copy still t${t}.png (${e.code ?? e.message})`); }
  const ha = md5(fa), hb = md5(fb);
  let verdict = ha === hb ? "SAME" : null;
  if (!verdict) {
    // tolerance: GPU float noise (neon-sign's additive decals + bloom) flips a few pixels by 1 level run to run.
    // That is not a seek-order bug; anything bigger is.
    const d = pixelDiff(fa, fb);
    if (d.max <= 1 && d.frac < 0.0005) verdict = `SAME within GPU noise (±1 on ${d.count} px)`;
    else { verdict = `DIFF ${hb} (${d.count} px, max ${d.max} levels)`; fail++; }
  }
  console.log(`${t.padEnd(9)} ${("renders/checks/t" + t + ".png").padEnd(29)} ${ha}  ${verdict}`);
}
// MP4 vs current code: snapshot at FRAME-ALIGNED times (n / fps) and compare with MP4 frame n (exact index), PSNR.
// The MP4 is lossy, so identical code gives ~32-45 dB; a stale MP4 shows a different picture (< 26 dB somewhere).
if (globalThis.__mp4 && !args.includes("--no-mp4-check")) {
  const fps = Number((existsSync(join(proj, "scene.config.js")) ? readFileSync(join(proj, "scene.config.js"), "utf8") : "").match(/export const FPS\s*=\s*(\d+)/)?.[1] ?? 30);
  const frames = [...new Set(times.map((t) => Math.round(Number(t) * fps)))];
  const al = snap(frames.map((n) => String(+(n / fps).toFixed(6))));
  const psnr = [];
  for (const n of frames) {
    const still = al.map[key(+(n / fps).toFixed(6))];
    if (!still) continue;
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", globalThis.__mp4, "-i", still, "-lavfi", `[0:v]select=eq(n\\,${n}),format=rgb24,setpts=PTS-STARTPTS[a];[1:v]format=rgb24[b];[a][b]psnr`, "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8" });
    psnr.push([n, Number(r.stderr.match(/average:([\d.]+|inf)/)?.[1] ?? NaN)]);
  }
  rmSync(al.dir, { recursive: true, force: true });
  const worst = psnr.reduce((w, p) => (p[1] < w[1] ? p : w), [null, Infinity]);
  const line = worst[0] == null ? "mp4-vs-code: n/a" : worst[1] >= 26
    ? `mp4-vs-code: OK — the MP4 matches the current code (worst PSNR ${worst[1].toFixed(1)} dB, frame ${worst[0]})`
    : `mp4-vs-code: STALE? the MP4 differs from the current code at frame ${worst[0]} (t=${(worst[0] / fps).toFixed(3)}, PSNR ${worst[1].toFixed(1)} dB) — re-render before reviewing the MP4`;
  console.log(line);
  runLines.push(line, ...psnr.map(([n, v]) => `  frame ${n} (t=${(n / fps).toFixed(3)}): ${v.toFixed(1)} dB`));
}
for (const d of [a.dir, b.dir]) rmSync(d, { recursive: true, force: true });
{
  const dl = fail ? `determinism: FAIL (${fail} time(s) differ when seeking out of order)` : `determinism: OK (${times.length} times identical in both seek orders, GPU-noise tolerance ±1 level on < 0.05 % px)`;
  console.log(dl);
  runLines.push(dl);
}

if (!args.includes("--no-audio")) {
  const vd = (f) => {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", f, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const g = (k) => r.stderr.match(new RegExp(`${k}: ([-\\d.]+) dB`))?.[1];
    return r.stderr.includes("does not contain any stream") || !g("mean_volume") ? "no audio stream" : `mean ${g("mean_volume")} dB, max ${g("max_volume")} dB`;
  };
  if (existsSync(join(proj, "sfx.wav"))) console.log(`audio sfx.wav: ${vd(join(proj, "sfx.wav"))}`);
  const rd = join(proj, "renders");
  const mp4 = existsSync(rd) ? readdirSync(rd).filter((f) => f.endsWith(".mp4")).map((f) => join(rd, f)).sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0] : null;
  if (mp4) console.log(`audio ${mp4.split("/").pop()}: ${vd(mp4)}  (${(statSync(mp4).size / 1e6).toFixed(1)} MB)`);
}
if (args.includes("--deep")) {
  const { serveDir, openPage } = await import("./lib/chrome.mjs");
  const srv = await serveDir(proj);
  const page = await openPage(`${srv.url}index.html?player=0`);
  try {
    await page.waitFor("window.__atlas && window.__atlas.stage");
    const r = await page.eval(`import("./_atlas/kit/selfcheck.js").then((m) => m.selfCheck(window.__atlas, ${JSON.stringify(times.map(Number))}))`);
    for (const [t, f] of Object.entries(r.frames)) console.log(`deep t=${t}: hash ${f.hash} mean ${f.meanLevel}${f.hdr ? ` NaN ${f.hdr.nan} Inf ${f.hdr.inf} (${f.hdr.w}x${f.hdr.h} HDR scan)` : ""}${f.blocks?.count ? ` black-blocks ${f.blocks.count}` : ""}`);
    for (const w of r.warnings) console.log(`deep warning: ${w}`);
    for (const p of r.problems) console.log(`deep PROBLEM [${p.kind}]: ${p.detail}`);
    console.log(r.ok ? "deep self-check: OK" : `deep self-check: FAIL (${r.problems.length})`);
    runLines.push(r.ok ? "deep self-check: OK" : `deep self-check: FAIL (${r.problems.length})`);
    if (!r.ok) fail++;
  } finally {
    await page.close();
    srv.close();
  }
}
flushRun();
process.exit(fail ? 1 : 0);
