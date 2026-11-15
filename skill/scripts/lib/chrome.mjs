// scripts/lib/chrome.mjs — zero-dependency headless driver for kit scripts that need a browser.
// Uses the SAME chrome-headless-shell HyperFrames downloads (~/.cache/hyperframes/chrome/) and the
// Chrome DevTools Protocol over Node's built-in WebSocket (Node >= 22). No puppeteer/playwright.
//
//   const srv = await serveDir(projectDir);              // static server, 127.0.0.1:<random port>
//   const page = await openPage(`${srv.url}index.html?player=0`, { width: 1920, height: 1080 });
//   const v = await page.eval("window.__atlas.duration");  // awaits promises, returns by value
//   await page.close(); srv.close();
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir, homedir } from "node:os";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".svg": "image/svg+xml", ".glb": "model/gltf-binary" };

/** Static file server rooted at dir. Returns { port, url, close() }. */
export function serveDir(dir) {
  const root = resolve(dir);
  return new Promise((ok) => {
    const srv = createServer(async (req, res) => {
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
    });
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      ok({ port, url: `http://127.0.0.1:${port}/`, close: () => { srv.closeAllConnections?.(); srv.close(); } });
    });
  });
}

/** Path of the newest chrome-headless-shell HyperFrames has installed (override: ATLAS_CHROME). */
export function findChrome() {
  if (process.env.ATLAS_CHROME) return process.env.ATLAS_CHROME;
  const base = join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (!existsSync(base)) throw new Error(`chrome-headless-shell not found under ${base}. Run any 'npx hyperframes snapshot' once so HyperFrames downloads it.`);
  const vers = readdirSync(base).sort().reverse();
  for (const v of vers) {
    for (const sub of readdirSync(join(base, v))) {
      const bin = join(base, v, sub, "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error(`no chrome-headless-shell binary under ${base}`);
}

// Same GPU flags HyperFrames uses for hardware capture on macOS (Metal ANGLE).
const GPU_ARGS = { hardware: ["--use-gl=angle", "--use-angle=metal", "--enable-gpu-rasterization"], software: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };

/**
 * openPage(url, { width, height, gpu = "hardware", timeout = 60000, log = false }) -> page
 *   page.eval(expr)   Runtime.evaluate with awaitPromise + returnByValue; throws on page exceptions
 *   page.console      array of console messages seen so far ({ type, text })
 *   page.close()
 */
export async function openPage(url, { width = 1920, height = 1080, gpu = "hardware", timeout = 60000, log = false } = {}) {
  const userDir = mkdtempSync(join(tmpdir(), "atlas-chrome-"));
  const args = [
    "--headless", "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "--enable-webgl", "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--hide-scrollbars", "--mute-audio",
    `--window-size=${width},${height}`, "--remote-debugging-port=0", `--user-data-dir=${userDir}`, ...(GPU_ARGS[gpu] ?? GPU_ARGS.hardware), "about:blank",
  ];
  const proc = spawn(findChrome(), args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d));
  const portFile = join(userDir, "DevToolsActivePort");
  const t0 = Date.now();
  while (!existsSync(portFile) || !readFileSync(portFile, "utf8").includes("\n")) {
    if (Date.now() - t0 > 15000) { proc.kill(); throw new Error(`chrome did not start: ${stderr.slice(-800)}`); }
    await new Promise((r) => setTimeout(r, 50));
  }
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageT = targets.find((t) => t.type === "page");
  const ws = new WebSocket(pageT.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const consoleMsgs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
    if (m.id && pending.has(m.id)) {
      const { ok, err } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? err(new Error(`${m.error.message} ${m.error.data ?? ""}`)) : ok(m.result);
    } else if (m.method) {
      if (m.method === "Runtime.consoleAPICalled") {
        const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        consoleMsgs.push({ type: m.params.type, text });
        if (log) console.log(`[page ${m.params.type}] ${text}`);
      }
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        consoleMsgs.push({ type: "exception", text: d.exception?.description ?? d.text });
        if (log) console.log(`[page exception] ${d.exception?.description ?? d.text}`);
      }
      for (const f of listeners.get(m.method) ?? []) f(m.params);
    }
  };
  const send = (method, params = {}) => new Promise((ok, err) => {
    const i = ++id;
    pending.set(i, { ok, err });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const once = (method) => new Promise((ok) => listeners.set(method, [...(listeners.get(method) ?? []), ok]));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  let lt;
  await Promise.race([loaded, new Promise((_, r) => { lt = setTimeout(() => r(new Error(`page load timeout: ${url}`)), timeout); })]).finally(() => clearTimeout(lt));

  async function evalJs(expression, { timeout: to = 600000 } = {}) {
    let timer;
    const r = await Promise.race([
      send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`eval timeout: ${expression.slice(0, 80)}`)), to); }),
    ]).finally(() => clearTimeout(timer));
    if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  /** Poll until expr is truthy (e.g. "!!window.__atlas"). */
  async function waitFor(expr, ms = timeout) {
    const t1 = Date.now();
    for (;;) {
      if (await evalJs(`!!(${expr})`)) return;
      if (Date.now() - t1 > ms) throw new Error(`waitFor timeout: ${expr}\nconsole:\n${consoleMsgs.map((c) => `${c.type}: ${c.text}`).join("\n")}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    eval: evalJs,
    waitFor,
    send,
    console: consoleMsgs,
    async close() {
      let ct;
      try { await Promise.race([send("Browser.close"), new Promise((r) => { ct = setTimeout(r, 1500); })]); } catch {}
      clearTimeout(ct);
      ws.close();
      proc.kill("SIGKILL");
      try { rmSync(userDir, { recursive: true, force: true }); } catch {}
    },
  };
}
