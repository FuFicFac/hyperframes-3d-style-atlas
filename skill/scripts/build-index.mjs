#!/usr/bin/env node
// build-index.mjs [--pilot <dir>] [--out references/style-index.json]
// Regenerates the style catalogue from the files themselves, so it stays current as styles are added:
//   styles/<id>/spec.js   -> id, name, description, palette size, toneMapping, sfx bed
//   styles/<id>/STYLE.md  -> one-line summary, good-for / avoid-for, prop factory names (from the props tables)
//   styles/<id>/*.js      -> fourth module(s) (anything besides spec.js/style.js) and whether each is Node-safe
//   pilot projects        -> demo project path, demo topic (scene.js header line), mp4 path + size
// Category is a keyword GUESS (documented as such in the output); edit `CATEGORY_RULES` to tune it.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
// Demos moved to the Panther drive on 2026-11-15; pass --pilot <folder> to use a clone elsewhere.
const PILOT = resolve(flag("--pilot", "/Volumes/Panther/3D Style Atlas"));
const OUT = resolve(SKILL, flag("--out", "references/style-index.json"));
const ROOT = resolve(SKILL, "../.."); // D Second Brain: paths in the index are relative to it
// Demo paths outside D Second Brain (the Panther drive, a clone) are stored absolute, not as a ../../ chain.
const demoPath = (p) => { const r = relative(ROOT, p); return r.startsWith("..") ? p : r; };

const CATEGORY_RULES = [
  ["reference / neutral", /\bneutral\b|reference/i],
  ["brand / channel", /\bhouse\b|brand|channel ident/i],
  ["material / abstract", /glass|chrome|liquid|optic|refract/i],
  ["print / flat graphic", /letterpress|emboss|isometric|pastel|flat graphic|\bprint\b/i],
  ["technical / diagrammatic", /blueprint|exploded|hidden-line|technical|drafting|schematic/i],
  ["pixel / voxel", /voxel|pixel|8-bit/i],
  ["mechanical / kinetic", /marble|rube|machine|gear|kinetic|contraption/i],
  ["theatrical / narrative", /\bstage\b|theatre|theater|curtain|spotlight|puppet/i],
  ["screen / UI / sci-fi", /crt|terminal|hologram|wireframe|floating-screens|\bui\b|interface|screen/i],
  ["toy / playful", /toy|brick|lego|plastic/i],
  ["product / commercial", /product|packshot|commercial/i],
  ["retro / signage / typographic", /neon|split-flap|signage|\bsign\b|departure|typograph/i],
  ["miniature / world-building", /diorama|miniature|tilt-shift|low-poly|island/i],
  ["handmade / tactile", /clay|paper|pop-up|felt|stitch|origami|fold|craft|cardboard/i],
];
// id + name decide first (most specific); the long description is only a fallback
const guessCategory = (idName, text) => (CATEGORY_RULES.find(([, re]) => re.test(idName)) ?? CATEGORY_RULES.find(([, re]) => re.test(text)))?.[0] ?? "other";

function propsFromMd(md) {
  const names = new Set();
  const sec = md.split(/\n## /).filter((s) => /^(Prop|Props|Factories|Pieces|Parts|Components)/i.test(s));
  for (const s of sec) for (const m of s.matchAll(/^\|\s*`([A-Za-z_][\w.]*)\s*\(/gm)) names.add(m[1]);
  return [...names];
}
function firstParagraph(md) {
  const body = md.split("\n").slice(1).join("\n").trim();
  const para = body.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
  const first = para.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? para;
  return first.length > 240 ? first.slice(0, 237) + "..." : first;
}
const lineAfter = (md, label) => md.match(new RegExp(`\\*\\*${label}:?\\*\\*:?\\s*([\\s\\S]+?)(?=\\n\\s*\\n|\\n\\*\\*|$)`, "i"))?.[1]?.replace(/\\s+/g, " ").trim() ?? null;

const demos = {};
if (existsSync(PILOT)) {
  for (const d of readdirSync(PILOT).sort()) {
    const cfg = join(PILOT, d, "scene.config.js");
    if (!existsSync(cfg)) continue;
    const src = readFileSync(cfg, "utf8");
    const style = src.match(/export const STYLE\s*=\s*"([^"]+)"/)?.[1];
    if (!style) continue;
    const head = existsSync(join(PILOT, d, "scene.js")) ? readFileSync(join(PILOT, d, "scene.js"), "utf8").split("\n") : [];
    const comment = head.slice(0, head.findIndex((l) => !l.startsWith("//")) >>> 0 || 3).map((l) => l.replace(/^\/\/\s?/, "")).join(" ");
    const cleaned = comment.replace(/^scene\.js\s*[—-]\s*/, "").replace(new RegExp(`^${d}:?\\s*`), "").trim();
    const topic = (cleaned.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? cleaned).slice(0, 200) || null;
    const mp4 = join(PILOT, d, "renders", `${d}.mp4`);
    (demos[style] ??= []).push({
      project: demoPath(join(PILOT, d)),
      topic,
      mp4: existsSync(mp4) ? demoPath(mp4) : null,
      mp4MB: existsSync(mp4) ? +(statSync(mp4).size / 1e6).toFixed(1) : null,
    });
  }
}

const styles = [];
for (const id of readdirSync(join(SKILL, "styles")).sort()) {
  const dir = join(SKILL, "styles", id);
  if (!existsSync(join(dir, "spec.js"))) continue;
  const { STYLE_SPEC: S } = await import(pathToFileURL(join(dir, "spec.js")).href);
  const md = existsSync(join(dir, "STYLE.md")) ? readFileSync(join(dir, "STYLE.md"), "utf8") : "";
  const extra = readdirSync(dir).filter((f) => f.endsWith(".js") && !["spec.js", "style.js"].includes(f)).map((f) => {
    const src = readFileSync(join(dir, f), "utf8");
    return { file: f, nodeSafe: !/from\s+["']three["']|\bwindow\.|document\./.test(src) };
  });
  const summary = md ? firstParagraph(md) : S.description;
  styles.push({
    id: S.id ?? id,
    name: S.name ?? id,
    description: S.description ?? summary,
    summary,
    category: guessCategory(`${id} ${S.name}`, `${S.description} ${summary}`),
    goodFor: lineAfter(md, "Good for"),
    avoidFor: lineAfter(md, "Avoid for"),
    toneMapping: S.world?.toneMapping ?? "aces",
    props: propsFromMd(md),
    fourthModule: extra.length ? extra : null,
    hasNodeSafeFourthModule: extra.some((e) => e.nodeSafe),
    demos: demos[id] ?? [],
    files: { spec: relative(ROOT, join(dir, "spec.js")), style: relative(ROOT, join(dir, "style.js")), card: md ? relative(ROOT, join(dir, "STYLE.md")) : null },
  });
}

const doc = {
  format: "3d-style-atlas/style-index@1",
  generatedBy: "Skills/3d-style-atlas/scripts/build-index.mjs (re-run after adding or changing a style)",
  generatedAt: new Date().toISOString(),
  pathsRelativeTo: "D Second Brain/ (demo project and mp4 paths are absolute when the demos live outside it)",
  notes: "category is a keyword guess; props come from the STYLE.md props tables; demo topic is the first line of the demo's scene.js.",
  count: styles.length,
  styles,
};
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");

// ---- human-readable catalogue: references/STYLES.md, grouped by category ----
const mdOut = resolve(SKILL, flag("--md", "references/STYLES.md"));
const esc = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const short = (x, n = 160) => { const v = esc(x); return v.length > n ? v.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : v; };
const cats = [...new Set(styles.map((s) => s.category))].sort((a, b) => (a === "reference / neutral") - (b === "reference / neutral") || a.localeCompare(b));
const lines = [
  "# 3d-style-atlas — style catalogue",
  "",
  `Generated by \`scripts/build-index.mjs\` from each \`styles/<id>/spec.js\` + \`STYLE.md\` and the pilot demos (${styles.length} entries, ${new Date().toISOString().slice(0, 10)}). Do not edit by hand: re-run the script. Machine-readable version: \`style-index.json\`. Category is a keyword guess.`,
  "",
];
for (const c of cats) {
  lines.push(`## ${c}`, "", "| id | name | description | good for | demo topic | demo MP4 | 4th module |", "|---|---|---|---|---|---|---|");
  for (const st of styles.filter((x) => x.category === c)) {
    const d = st.demos[0];
    const fm = st.fourthModule ? `yes (${st.fourthModule.map((f) => f.file).join(", ")})` : "no";
    lines.push(`| \`${st.id}\` | ${esc(st.name)} | ${short(st.summary)} | ${short(st.goodFor, 120)} | ${short(d?.topic, 90)} | ${d?.mp4 ? `\`${d.mp4}\`` : "—"} | ${fm} |`);
  }
  lines.push("");
}
writeFileSync(mdOut, lines.join("\n"));
console.log(`build-index: ${relative(process.cwd(), mdOut)} (${cats.length} categories)`);
console.log(`build-index: ${styles.length} styles -> ${relative(process.cwd(), OUT)}`);
for (const s of styles) console.log(`  ${s.id.padEnd(18)} ${s.category.padEnd(30)} props ${String(s.props.length).padStart(2)}  demo ${s.demos[0]?.project.split("/").pop() ?? "-"}  ${s.fourthModule ? "4th:" + s.fourthModule.map((f) => f.file + (f.nodeSafe ? "" : "(!)")).join(",") : ""}`);
