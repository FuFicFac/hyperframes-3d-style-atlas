// compare.mjs <rawDir> <labelA> <labelB> — per-project table from check-frames logs
import { readFileSync, existsSync } from "node:fs";
const [raw, A, B] = process.argv.slice(2);
const projs = readFileSync(`${raw}/times.txt`, "utf8").trim().split("\n").map((l) => l.split(" ")[0]);
const parse = (f) => {
  if (!existsSync(f)) return null;
  const s = readFileSync(f, "utf8");
  const deep = {}; for (const m of s.matchAll(/^deep t=([\d.]+): hash (\w+) mean [\d.]+(?: NaN (\d+) Inf (\d+))?/gm)) deep[m[1]] = { h: m[2], nan: +(m[3] ?? 0), inf: +(m[4] ?? 0) };
  const md5 = {}; for (const m of s.matchAll(/^([\d.]+)\s+renders\/checks\/\S+\s+(\w{32})\s+(.*)$/gm)) md5[m[1]] = { h: m[2], v: m[3] };
  return { det: /^determinism: OK/m.test(s), deepOk: /^deep self-check: OK/m.test(s), psnr: +(s.match(/worst PSNR ([\d.]+) dB/)?.[1] ?? NaN), mp4: /^mp4-vs-code: OK/m.test(s), deep, md5,
    warn: [...s.matchAll(/^deep (warning|PROBLEM)[^\n]*/gm)].map((m) => m[0]), detLine: s.match(/^determinism: .*/m)?.[0] ?? "?" };
};
const rows = [];
let pass = 0, changed = [];
for (const p of projs) {
  const a = parse(`${raw}/${A}/${p}.log`), b = parse(`${raw}/${B}/${p}.log`);
  if (!b) { rows.push(`| ${p} | (no log) |`); continue; }
  const ok = b.det && b.deepOk && b.mp4;
  if (ok) pass++;
  const times = Object.keys(b.deep);
  const same = a ? times.filter((t) => a.deep[t]?.h === b.deep[t].h).length : 0;
  const md5same = a ? Object.keys(b.md5).filter((t) => a.md5[t]?.h === b.md5[t].h).length : 0;
  const nan = Object.values(b.deep).reduce((n, d) => n + d.nan + d.inf, 0);
  if (a && same !== times.length) changed.push(p);
  rows.push(`| ${p} | ${b.det ? "OK" : "FAIL"} | ${b.mp4 ? "OK" : "FAIL"} | ${a ? a.psnr.toFixed(1) : "?"} → ${b.psnr.toFixed(1)} | ${b.deepOk ? "OK" : "FAIL"} | ${nan} | ${same}/${times.length} | ${md5same}/${Object.keys(b.md5).length} |${b.warn.length ? " " + b.warn.join("; ") : ""}`);
}
console.log("| project | determinism | mp4-vs-code | worst PSNR dB before → after | deep | NaN+Inf | in-page hash = old kit | snapshot md5 = old kit |");
console.log("|---|---|---|---|---|---|---|---|");
console.log(rows.join("\n"));
console.log(`\nPASS ${pass}/${projs.length}; in-page hashes changed: ${changed.join(", ") || "none"}`);
