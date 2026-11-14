// inpage.mjs <projectDir> <times> — deep selfCheck hashes only (no snapshots)
const SK = "/Users/user/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas";
const { serveDir, openPage } = await import(SK + "/scripts/lib/chrome.mjs");
const [proj, times] = process.argv.slice(2);
const srv = await serveDir(proj);
const page = await openPage(`${srv.url}index.html?player=0`);
await page.waitFor("window.__atlas && window.__atlas.stage");
const r = await page.eval(`import("./_atlas/kit/selfcheck.js").then((m) => m.selfCheck(window.__atlas, ${JSON.stringify(times.split(",").map(Number))}))`);
console.log(Object.entries(r.frames).map(([t, f]) => `${t}=${f.hash}`).join(" "), r.ok ? "OK" : "FAIL");
await page.close(); srv.close();
