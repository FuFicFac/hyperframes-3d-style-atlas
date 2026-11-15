#!/usr/bin/env node
// serve.mjs <projectDir> [--port 4321] — zero-dependency static server for the standalone preview
// player (ES modules don't load from file://). Open http://localhost:4321/ in a normal browser.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) ?? ".");
const port = Number(args.includes("--port") ? args[args.indexOf("--port") + 1] : 4321);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith("/")) p += "index.html";
  const file = join(root, p);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if (!(await stat(file)).isFile()) throw 0;
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`serve: ${root} at http://localhost:${port}/`));
