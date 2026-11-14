// flake.mjs <proj> <T> <others csv> <iters> — render T many times after other times; distinct frames + diff boxes
const SK = "/Users/user/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas";
const { serveDir, openPage } = await import(SK + "/scripts/lib/chrome.mjs");
const [proj, T, others, iters = "40", runs = "3"] = process.argv.slice(2);
const srv = await serveDir(proj);
for (let k = 0; k < +runs; k++) {
const page = await openPage(`${srv.url}index.html?player=0`);
await page.waitFor("window.__atlas && window.__atlas.stage");
console.log(await page.eval(`(() => { const A = window.__atlas, st = A.stage, O = [${others}];
  const grab = () => { const c = document.createElement("canvas"); c.width = st.width; c.height = st.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(st.renderer.domElement, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const frames = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < ${iters}; i++) { A.renderAt(O[Math.floor(rnd() * O.length)]); if (rnd() < 0.5) A.renderAt(O[Math.floor(rnd() * O.length)]); A.renderAt(${T}); frames.push(grab()); }
  const ref = frames[0]; const res = [];
  frames.forEach((d, j) => { let n = 0, mx = 0, b = [1e9, 1e9, -1, -1]; for (let i = 0; i < d.length; i += 4) { const m = Math.max(Math.abs(d[i]-ref[i]), Math.abs(d[i+1]-ref[i+1]), Math.abs(d[i+2]-ref[i+2])); if (m) { n++; mx = Math.max(mx, m); const px = (i/4) % st.width, py = Math.floor(i/4/st.width); b = [Math.min(b[0],px), Math.min(b[1],py), Math.max(b[2],px), Math.max(b[3],py)]; } } if (n) res.push(j + ":" + n + "px max" + mx + " box " + b.join(",")); });
  return "differs from first: " + (res.join(" | ") || "none"); })()`));
await page.close();
}
srv.close();
