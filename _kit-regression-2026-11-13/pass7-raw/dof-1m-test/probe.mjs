const SK = "/Users/user/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas";
const { serveDir, openPage } = await import(SK + "/scripts/lib/chrome.mjs");
const proj = process.argv[2];
const srv = await serveDir(proj);
const res = {};
for (const mode of ["none", "ap0", "nofocus", "setfocus", "relative"]) {
  const page = await openPage(`${srv.url}index.html?player=0&mode=${mode}`);
  await page.waitFor("window.__atlas && window.__atlas.stage");
  res[mode] = await page.eval(`(() => { const st = window.__atlas.stage; window.__atlas.renderAt(1);
    const c = document.createElement("canvas"); c.width = st.width; c.height = st.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(st.renderer.domElement, 0, 0);
    const reg = (cx, cy, r) => { let s = 0, n = 0; for (let y = cy - r; y < cy + r; y++) { const d = x.getImageData(cx - r, y, 2 * r + 1, 1).data; for (let i = 0; i < 2 * r; i++) { s += Math.abs(d[i * 4 + 1] - d[i * 4 + 5]); n++; } } return +(s / n).toFixed(2); };
    const P = (p) => { const v = new window.__atlas.stage.THREE.Vector3(...p).project(st.camera); return [Math.round((v.x + 1) / 2 * st.width), Math.round((1 - v.y) / 2 * st.height)]; };
    const near = P([-0.11, 0, 0.25]), mid = P([0, 0, 0]), far = P([0.32, 0, -0.6]);
    return { near: reg(...near, 40), focusCard: reg(...mid, 40), far: reg(...far, 30), focus: st.post?.passes?.dof?.uniforms.focus.value, aperture: st.post?.passes?.dof?.uniforms.aperture.value }; })()`);
  await page.close();
}
console.log(JSON.stringify(res, null, 1));
srv.close();
