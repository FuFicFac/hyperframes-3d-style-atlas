#!/usr/bin/env node
// export-blender.mjs <projectDir> [--out export] [--refs 0,3.5,7.2] [--glb-time 0] [--no-glb] [--no-bake] [--no-sync]
// One command: everything a Blender rebuild needs, written to <project>/export/:
//   scene.spec.json   style + scene plain data (same as export-spec.mjs)
//   manifest.json     renderer settings, lights (units, softness as sun angle / source radius), materials,
//                     textures + labels index, audio, reference frames, file list, verification counts
//   bake.json         per-frame capture from the REAL renderAt(t): camera, every node's world matrix +
//                     visibility (sparse), light + material values, post params, deforming meshes
//   geometry.glb      the whole scene graph (GLTFExporter r181), node names = bake ids
//   textures/*.png    every canvas texture and text label;   refs/frame_NNNN.png  reference frames
// Browser work runs in HyperFrames' own chrome-headless-shell via CDP (scripts/lib/chrome.mjs).
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { serveDir, openPage } from "./lib/chrome.mjs";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const proj = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--") ) ?? ".");
const outDir = resolve(proj, flag("--out", "export"));
const t0 = Date.now();
const log = (m) => console.log(`export-blender: ${m} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

if (!args.includes("--no-sync")) execFileSync(process.execPath, [join(SKILL, "scripts/sync-kit.mjs"), proj], { stdio: "ignore" });
const cfg = await import(pathToFileURL(join(proj, "scene.config.js")).href);
const fps = cfg.FPS ?? 30, duration = cfg.DURATION, frames = Math.round(duration * fps);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "textures"), { recursive: true });
mkdirSync(join(outDir, "refs"), { recursive: true });
execFileSync(process.execPath, [join(SKILL, "scripts/export-spec.mjs"), proj, "--out", join(outDir, "scene.spec.json")], { stdio: "ignore" });
log("scene.spec.json");

const srv = await serveDir(proj);
const page = await openPage(`${srv.url}index.html?player=0`, { width: 1920, height: 1080 });
let manifest;
try {
  await page.waitFor("window.__atlas && window.__atlas.stage");
  await page.eval(`import("./_atlas/kit/export.js").then((m) => m.install())`);
  const stat = await page.eval("window.__atlasExport.static()");
  log(`renderer/lights/materials/textures (${stat.nodeCount} nodes)`);

  const readBig = async (key, len) => {
    let s = "";
    // CDP replies over ~4 MB stall Node's WebSocket here (observed) -> read in 1 MB chunks
    for (let i = 0; i < len; i += 1e6) s += await page.eval(`window.__atlasExport.chunk(${JSON.stringify(key)}, ${i}, 1e6)`);
    return s;
  };
  const dataUrlToFile = (url, file) => writeFileSync(file, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));

  for (const name of await page.eval("window.__atlasExport.fileNames()")) dataUrlToFile(await readBig("file", await page.eval(`window.__atlasExport.file(${JSON.stringify(name)})`)), join(outDir, "textures", name));
  log(`textures (${readdirSync(join(outDir, "textures")).length} png)`);

  let bakeInfo = null;
  if (!args.includes("--no-bake")) {
    const n = await page.eval(`window.__atlasExport.bake(${fps}, ${frames})`);
    const json = await readBig("bake", n);
    writeFileSync(join(outDir, "bake.json"), json);
    const b = JSON.parse(json);
    bakeInfo = { file: "bake.json", frames: b.frames, fps: b.fps, cameraFrames: b.camera.matrixWorld.length, nodes: Object.keys(b.nodes).length, animatedNodes: Object.values(b.nodes).filter((x) => x.keys.length > 1 || x.vis.length > 1).length, lights: Object.keys(b.lights).length, animatedMaterials: Object.values(b.materials).filter((x) => x.length > 1).length, deforming: b.deforming };
    log(`bake.json (${frames} frames, ${(json.length / 1e6).toFixed(1)} MB)`);
  }

  let glbInfo = null;
  if (!args.includes("--no-glb")) {
    const gt = Number(flag("--glb-time", 0));
    const n = await page.eval(`window.__atlasExport.glb(${gt})`);
    const buf = Buffer.from(await readBig("glb", n), "base64");
    writeFileSync(join(outDir, "geometry.glb"), buf);
    glbInfo = { file: "geometry.glb", bytes: buf.length, sampledAt: gt, nodeNames: "bake ids", note: "transforms are the state at sampledAt; animate from bake.json" };
    log(`geometry.glb (${(buf.length / 1e6).toFixed(1)} MB)`);
  }

  const refTimes = (flag("--refs") ?? defaultRefs(cfg, duration, fps)).toString().split(",").map(Number);
  const refs = [];
  for (const t of refTimes) {
    const f = Math.min(frames - 1, Math.round(t * fps));
    const file = `refs/frame_${String(f).padStart(4, "0")}.png`;
    dataUrlToFile(await readBig("ref", await page.eval(`window.__atlasExport.ref(${f / fps})`)), join(outDir, file));
    refs.push({ file, frame: f, t: f / fps });
    if (process.env.ATLAS_DEBUG) log(`ref ${file}`);
  }
  log(`refs (${refs.length})`);

  // ---- verification (fails the command if anything is off) ----
  const verify = { errors: [] };
  const bad = (m) => verify.errors.push(m);
  if (glbInfo) {
    verify.glbStructure = checkGlb(join(outDir, "geometry.glb"));
    if (verify.glbStructure.error) bad(`glb: ${verify.glbStructure.error}`);
    const rel = relative(proj, join(outDir, "geometry.glb")).split("/").map(encodeURIComponent).join("/");
    verify.glbLoader = await page.eval(`import("three/addons/loaders/GLTFLoader.js").then(async ({ GLTFLoader }) => {
      const g = await new GLTFLoader().loadAsync("./${rel}");
      let meshes = 0, nodes = 0, tris = 0;
      g.scene.traverse((o) => { nodes++; if (o.isMesh) { meshes++; const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } });
      return { parsedBy: "GLTFLoader r181", nodes, meshes, triangles: Math.round(tris) };
    })`);
    if (!(verify.glbLoader.meshes > 0)) bad("glb: GLTFLoader found no meshes");
  }
  if (bakeInfo) {
    if (bakeInfo.frames !== frames || bakeInfo.cameraFrames !== frames) bad(`bake: ${bakeInfo.cameraFrames} camera frames, expected ${frames} (= duration ${duration} x fps ${fps})`);
    verify.bakeFrames = `${bakeInfo.cameraFrames} == ${duration} x ${fps}`;
  }
  verify.pngs = [...readdirSync(join(outDir, "textures")).map((f) => join("textures", f)), ...refs.map((r) => r.file)].map((f) => {
    const b = readFileSync(join(outDir, f));
    const ok = b.length > 100 && b.readUInt32BE(0) === 0x89504e47;
    if (!ok) bad(`png: ${f} empty or not PNG`);
    return { f, bytes: b.length, size: ok ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null };
  });
  log(verify.errors.length ? `VERIFY FAILED: ${verify.errors.join("; ")}` : `verified: glb parses (${verify.glbLoader?.meshes} meshes, ${verify.glbLoader?.triangles} tris), bake ${verify.bakeFrames}, ${verify.pngs.length} PNGs non-empty`);

  const audio = ["sfx.wav", "vo.wav"].filter((f) => existsSync(join(proj, f))).map((f) => ({ role: f.startsWith("vo") ? "voiceover" : "sfx", path: `../${f}`, absPath: join(proj, f), ...wavInfo(join(proj, f)), offsetSeconds: 0, mix: "summed at gain 1 (index.html data-volume=1); sfx.wav is already limited to ~-1 dBFS" }));
  const warnings = page.console.filter((c) => c.type === "warning" || c.type === "error" || c.type === "exception").map((c) => c.text);
  manifest = {
    format: "3d-style-atlas/blender-export@1",
    project: relative(dirname(proj), proj), exportedAt: new Date().toISOString(), fps, duration, frames, frameRule: "frame n <-> t = n / fps",
    files: { spec: "scene.spec.json", bake: bakeInfo?.file ?? null, glb: glbInfo?.file ?? null, textures: "textures/", refs: "refs/" },
    renderer: stat.renderer, lights: stat.lights, materials: stat.materials, textures: stat.textures, labels: stat.labels,
    bake: bakeInfo, glb: glbInfo, refs, audio, verify, pageWarnings: warnings,
  };
  if (verify.errors.length) process.exitCode = 1;
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
} finally {
  await page.close();
  srv.close();
}
log(`done -> ${outDir}`);
process.exit(process.exitCode ?? 0);

function defaultRefs(cfg, duration, fps) {
  const ts = [0, ...(cfg.BEATS ?? []).map((b) => b.t + Math.min(0.6, b.dur * 0.5)), duration - 1 / fps];
  const pick = ts.length <= 5 ? ts : [ts[0], ts[Math.round(ts.length * 0.3)], ts[Math.round(ts.length * 0.55)], ts[Math.round(ts.length * 0.8)], ts[ts.length - 1]];
  return [...new Set(pick.map((t) => +t.toFixed(3)))].join(",");
}
function wavInfo(f) {
  const b = readFileSync(f);
  const sr = b.readUInt32LE(24), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  let off = 12, dataLen = 0;
  while (off < b.length - 8) { const id = b.toString("ascii", off, off + 4), len = b.readUInt32LE(off + 4); if (id === "data") { dataLen = len; break; } off += 8 + len; }
  return { sampleRate: sr, channels: ch, bits, seconds: +(dataLen / (sr * ch * (bits / 8))).toFixed(3), bytes: statSync(f).size };
}

/** Structural GLB check: header, chunk layout, JSON parse, every bufferView/accessor inside the BIN chunk. */
function checkGlb(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "glTF") return { error: "bad magic" };
  const version = b.readUInt32LE(4), length = b.readUInt32LE(8);
  if (version !== 2 || length !== b.length) return { error: `version ${version}, header length ${length} vs file ${b.length}` };
  const jl = b.readUInt32LE(12);
  if (b.toString("ascii", 16, 20) !== "JSON") return { error: "first chunk not JSON" };
  const json = JSON.parse(b.toString("utf8", 20, 20 + jl));
  const bo = 20 + jl, bl = b.readUInt32LE(bo);
  if (b.toString("ascii", bo + 4, bo + 8) !== "BIN\0") return { error: "second chunk not BIN" };
  for (const [i, v] of (json.bufferViews ?? []).entries()) if ((v.byteOffset ?? 0) + v.byteLength > bl) return { error: `bufferView ${i} outside BIN` };
  for (const [i, a] of (json.accessors ?? []).entries()) if (a.bufferView != null && a.bufferView >= json.bufferViews.length) return { error: `accessor ${i} bad bufferView` };
  return { version, bytes: b.length, nodes: json.nodes?.length ?? 0, meshes: json.meshes?.length ?? 0, materials: json.materials?.length ?? 0, images: json.images?.length ?? 0, accessors: json.accessors?.length ?? 0, binBytes: bl, generator: json.asset?.generator };
}
