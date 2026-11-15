#!/usr/bin/env node
// test-kit.mjs — tiny Node tests for the kit's pure maths (pass 6; pass 7 adds sound pluck/marimba + golden hash of the old
// voices, canvas.js defaults, framingReport window/keepOut and fitShot checked through the real rig). No dependencies, no browser:
//   node scripts/test-kit.mjs            exits 1 on any failure
// Covers: open-ended smoothstep / invLerp / remap / lerp / beat / envelope (no NaN for infinite edges), Node-safety of the
// pure modules (time, noise, heightfield, pathmath, framing, schedule, choreo...), framing.sampleCameraKeys == the real
// kit/camera.js rig (bit-identical) at thousands of times, framing.projectPoint == THREE's Vector3.project, the
// octilinear router, and the selfcheck black-block detector on a synthetic frame. THREE is loaded from vendor/ through a
// resolve hook (node:module register) only for the comparisons; the pure modules are imported BEFORE the hook exists,
// which is the Node-safety proof.
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..");
const kit = (f) => pathToFileURL(join(SKILL, "kit", f)).href;
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log(`FAIL ${msg}`); } };
const finite = (v) => typeof v === "number" && !Number.isNaN(v);

// ---------------------------------------------------------------- 1. Node-safety (before THREE is resolvable)
const PURE = ["time.js", "noise.js", "heightfield.js", "pathmath.js", "framing.js", "schedule.js", "choreo.js", "strokefont.js", "bitmapfont.js", "iso.js", "optics.js", "sdf.js", "sound.js", "canvas.js"];
const mods = {};
for (const f of PURE) {
  try { mods[f] = await import(kit(f)); ok(true); } catch (e) { ok(false, `import kit/${f} in Node: ${e.message.split("\n")[0]}`); }
}
const T = mods["time.js"];

// ---------------------------------------------------------------- 2. open-ended ranges
{
  const { smoothstep, invLerp, remap, lerp, beat, envelope, clamp } = T;
  const I = Infinity;
  const cases = [
    ["smoothstep(I, I, 3)", smoothstep(I, I, 3), 0], ["1 - smoothstep(off=I, off+d, t)", 1 - smoothstep(I, I + 0.5, 3), 1],
    ["smoothstep(-I, 0, 3)", smoothstep(-I, 0, 3), 1], ["smoothstep(0, I, 3)", smoothstep(0, I, 3), 0],
    ["smoothstep(0, 1, I)", smoothstep(0, 1, I), 1], ["smoothstep(0, 1, -I)", smoothstep(0, 1, -I), 0],
    ["smoothstep(2, 2, 2)", smoothstep(2, 2, 2), 1], ["smoothstep(-I, -I, 0)", smoothstep(-I, -I, 0), 1],
    ["invLerp(-I, 0, 3)", invLerp(-I, 0, 3), 1], ["invLerp(0, I, I)", invLerp(0, I, I), 1], ["invLerp(I, I, 1)", invLerp(I, I, 1), 0],
    ["remap(5, 0, I, 10, 20)", remap(5, 0, I, 10, 20), 10], ["remap(5, -I, 0, 10, 20)", remap(5, -I, 0, 10, 20), 20],
    ["lerp(0, I, 0)", lerp(0, I, 0), 0], ["lerp(I, 0, 1)", lerp(I, 0, 1), 0], ["lerp(I, I, .5)", lerp(I, I, 0.5), I],
    ["beat(3, I, 1)", beat(3, I, 1), 0], ["beat(3, -I, I)", beat(3, -I, I), 1], ["beat(3, 0, I)", beat(3, 0, I), 0],
    ["envelope(3, 1, I)", envelope(3, 1, I), 1], ["envelope(3, 1, I, .3, I)", envelope(3, 1, I, 0.3, I), 1],
    ["envelope(0, I, I)", envelope(0, I, I), 0],
  ];
  for (const [name, v, want] of cases) ok(finite(v) && v === want, `${name} = ${v}, want ${want}`);
  // finite inputs: bit-identical to the plain formulas (no behaviour change for existing scenes)
  const R = T.rng(42);
  let diff = 0;
  for (let i = 0; i < 20000; i++) {
    const a = R.range(-50, 50), b = R.range(-50, 50), x = R.range(-80, 80), u = R.range(-0.5, 1.5);
    const tt = clamp((x - a) / (b - a));
    if (lerp(a, b, u) !== a + (b - a) * u || invLerp(a, b, x) !== (x - a) / (b - a) || smoothstep(a, b, x) !== tt * tt * (3 - 2 * tt)) diff++;
  }
  ok(diff === 0, `finite inputs bit-identical to the plain formulas (${diff} / 20000 differ)`);
  for (const e of Object.keys(T.ease)) ok(finite(T.ease[e](0.37)), `ease.${e}`);
}

// ---------------------------------------------------------------- 3. heightfield / noise in Node
{
  const { heightField, descentPath } = mods["heightfield.js"];
  const h = heightField({ terms: [{ type: "bowl", c: [0, 0], k: [0.1, 0.1], max: 3 }, { type: "gauss", c: [2, 1], amp: -1, sigma: [1, 1] }], noise: { amp: 0.3, seed: 3 }, island: { rx: 9, rz: 7, drop: 2 } });
  ok(finite(h(1.3, -2.2)) && finite(h(1.3, -2.2, { detail: false })), "heightField evaluates in Node");
  ok(descentPath(h, { start: [4, 3], lr: 0.4, steps: 6 }).length === 7, "descentPath in Node");
  ok(mods["noise.js"].fbm2(0.3, 0.7, { seed: 4 }) >= 0, "noise.fbm2 in Node");
}

// ---------------------------------------------------------------- 4. octilinear router
{
  const P = mods["pathmath.js"];
  const angOK = (pts) => pts.every((p, i) => { if (!i) return true; const d = [p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]]; const a = (Math.atan2(d[1], d[0]) * 180) / Math.PI; return Math.abs(a / 45 - Math.round(a / 45)) < 1e-6; });
  const wp = [[0, 0], [5, 2], [5, 6, "d"], [1, 9], [-3, 9]];
  const r0 = P.octilinearRoute(wp, { bend: "none" });
  ok(angOK(r0.corners), "octilinear corners run at 0/45/90 deg");
  const rc = P.octilinearRoute(wp, { bend: "chamfer", chamfer: 0.3 });
  ok(angOK(rc.pts), "chamfered route stays octilinear");
  const rr = P.octilinearRoute(wp, { bend: "round", radius: 0.6, step: 0.05 });
  ok(Math.abs(rr.length - P.pathLength(rr.pts)) < 1e-9 && rr.length < r0.length, "rounded route: length table consistent, shorter than corners");
  let monotone = true, prev = -1;
  for (let s = 0; s <= rr.length; s += rr.length / 400) { const q = rr.at(s); const s2 = rr.project(q.p); if (Math.abs(s2 - s) > 1e-6) monotone = false; if (s2 < prev - 1e-9) monotone = false; prev = s2; }
  ok(monotone, "route.at / route.project round-trip");
  ok(Math.abs(rr.stationS([5, 2]) - rr.project(rr.world([5, 2]))) < 1e-12, "stationS");
  const ref = P.octilinearCorners([[0, 0], [3, 1, "s"]]), refD = P.octilinearCorners([[0, 0], [3, 1, "d"]]);
  ok(JSON.stringify(ref) === "[[0,0],[2,0],[3,1]]" && JSON.stringify(refD) === "[[0,0],[1,1],[3,1]]", `elbow order: ${JSON.stringify(ref)} ${JSON.stringify(refD)}`);
}

// ---------------------------------------------------------------- 7. pass 7: sound — existing voices bit-identical, pluck + marimba
{
  const { renderScore, VOICES } = mods["sound.js"];
  const { createHash } = await import("node:crypto");
  // fixed score over every pre-pass-7 voice and alias; golden hash recorded with the pass-6 kit (scratch copy) on 2026-11-13
  const types = ["whoosh","whooshIn","whooshOut","pop","click","tick","paper","rustle","fold","thud","impact","riser","chime","sparkle","bubble","rumble","clack","blip","buzz","hum","pad","squish","penScratch","murmur","servo","whir"];
  const score = types.map((type, i) => ({ t: 0.05 + i * 0.37, type, gain: 0.5, pan: ((i % 5) - 2) / 2, seed: i + 2, ...(type === "blip" ? { notes: [0, 4, 7] } : {}), ...(type === "pad" ? { dur: 4, root: 196, brightness: 900 } : {}) }));
  const b = renderScore(score, { duration: 12, duck: [{ start: 3, end: 5 }] });
  const h = createHash("sha256"); h.update(Buffer.from(b.left.buffer)); h.update(Buffer.from(b.right.buffer));
  const hex = h.digest("hex");
  ok(hex === "f19013f5b74bda9bfcf0dc4814f370540bc91017b2ea58f08141bbe345c5be16", `existing voices bit-identical to the pass-6 kit (sha256 ${hex.slice(0, 16)}…)`);
  console.log(`sound: fixed 26-voice score sha256 ${hex.slice(0, 16)}… (pass-6 golden f19013f5b74bda9b…)`);
  const f0 = (x, s0 = 2400, W = 4096) => { let best = 0, bl = 0; for (let l = 30; l < 1400; l++) { let c = 0; for (let i = 0; i < W; i++) c += x[s0 + i] * x[s0 + i + l]; if (c > best) { best = c; bl = l; } } return 48000 / bl; };
  for (const [type, o, want] of [["pluck", { hz: 220 }, 220], ["pluck", { hz: 330, bright: 0.2 }, 330], ["marimba", { hz: 440 }, 440], ["marimba", { hz: 196 }, 196]]) {
    const x = VOICES[type](48000, o, T.rng(9)), y = VOICES[type](48000, o, T.rng(9));
    const finiteAll = x.every(Number.isFinite), same = x.every((v, i) => v === y[i]);
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
    const f = f0(x), tail = x.slice(-480).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    ok(finiteAll && same && Math.abs(f / want - 1) < 0.01 && pk > 0.2 && pk < 1.2 && tail < 0.02 * pk, `${type} ${JSON.stringify(o)}: f0 ${f.toFixed(1)} Hz (want ${want}), peak ${pk.toFixed(2)}, tail ${tail.toExponential(1)}, deterministic ${same}`);
  }
  // marimba partials ~1 : 4 : 10 — spectrum peaks by DFT probe
  {
    const x = VOICES.marimba(48000, { hz: 300, mallet: 0 }, T.rng(3)), W = 2048;
    const mag = (f) => { let re = 0, im = 0; for (let i = 0; i < W; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W); re += x[i + 100] * w * Math.cos((2 * Math.PI * f * i) / 48000); im += x[i + 100] * w * Math.sin((2 * Math.PI * f * i) / 48000); } return Math.hypot(re, im); };
    const m1 = mag(300), m4 = mag(1200), m10 = mag(3000), off = mag(2100);
    ok(m4 > 5 * off && m10 > 2 * off && m1 > m4 && m4 > m10, `marimba partials 1:4:10 present (${m1.toFixed(0)} / ${m4.toFixed(0)} / ${m10.toFixed(0)}, off-partial ${off.toFixed(0)})`);
  }
  const s2 = renderScore([{ t: 0.1, type: "pluck", hz: 196, notes: [0, 4, 7] }, { t: 0.6, type: "marimba", hz: 523 }], { duration: 2 });
  ok(s2.left.every(Number.isFinite), "renderScore with pluck + marimba");
}

// ---------------------------------------------------------------- 8. pass 7: canvas defaults (Node-safe module)
{
  const C = mods["canvas.js"];
  ok(C.CANVAS_DEFAULTS.willReadFrequently === true && C.wrf(undefined) === true && C.wrf(false) === false, "canvas.js: willReadFrequently on by default, per-call opt-out");
  const calls = [];
  const fake = { getContext: (k, a) => (calls.push([k, a]), {}) };
  C.canvas2d(fake); C.canvas2d(fake, { willReadFrequently: false });
  ok(calls[0][1]?.willReadFrequently === true && calls[1][1] === undefined, `canvas2d passes the attribute only when on: ${JSON.stringify(calls)}`);
}

// ---------------------------------------------------------------- 5. framing vs the real rig (THREE from vendor/)
const threeUrl = pathToFileURL(join(SKILL, "vendor/three/three.module.min.js")).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (s === "three") return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true }; return n(s, c); }`)}`, import.meta.url);
{
  const THREE = await import("three");
  const { createCameraRig } = await import(kit("camera.js"));
  const F = mods["framing.js"];
  const keySets = [
    { name: "linear eases", drift: null, keys: [{ t: 0, pos: [4, 3, 9], target: [0, 1, 0], fov: 32 }, { t: 3, pos: [-3, 2.5, 7], target: [0.5, 1.2, 0], ease: "outCubic" }, { t: 7.5, pos: [0, 6, 4], target: [0, 0, 0], fov: 40, ease: "inOutSine" }, { t: 11, pos: [1, 2, 12], target: [0, 1, 0], ease: "outBack" }] },
    { name: "arc + roll + drift", drift: { amp: 0.2, speed: 0.4 }, keys: [{ t: 0.5, pos: [6, 2, 0], target: [0, 1, 0], roll: 0.05 }, { t: 4, pos: [0, 3, 6], target: [0, 1, 0], path: "arc", roll: -0.1 }, { t: 9, pos: [-5, 1, -4], target: [1, 0, 0], path: "arc", ease: "inOutExpo" }] },
    { name: "orbit drift + viewHeight", drift: { amp: 0.1, speed: 0.3, orbit: 0.07 }, keys: [{ t: 0, pos: [8, 8, 8], target: [0, 0, 0], viewHeight: 6 }, { t: 6, pos: [8, 9, -8], target: [1, 0, 0], viewHeight: 4, path: "arc" }, { t: 6, pos: [3, 3, 3], target: [0, 0, 0] }, { t: 12, pos: [3, 4, 5], target: [0, 0.5, 0], ease: "outElastic" }] },
  ];
  for (const ks of keySets) {
    const cam = new THREE.PerspectiveCamera(37, 16 / 9, 0.1, 200);
    const rig = createCameraRig(cam, ks.keys, { drift: ks.drift });
    let same = 0, n = 0, maxNdc = 0;
    for (let i = 0; i <= 3000; i++) {
      const t = -0.5 + i * (13 / 3000);
      const a = rig.sample(t), b = F.sampleCameraKeys(ks.keys, t, { drift: ks.drift, fov: 37 });
      n++;
      if (a.pos.x === b.pos[0] && a.pos.y === b.pos[1] && a.pos.z === b.pos[2] && a.target.x === b.target[0] && a.target.y === b.target[1] && a.target.z === b.target[2] && a.fov === b.fov && a.roll === b.roll && a.viewHeight === b.viewHeight) same++;
      if (i % 25 === 0) {
        rig.update(t);
        for (const p of [[0.3, 1.1, -0.4], [2, 0.2, 1], [-1.5, 2, 0.5]]) {
          const v = new THREE.Vector3(...p).project(cam), q = F.projectPoint(b, p, { aspect: 16 / 9 });
          maxNdc = Math.max(maxNdc, Math.abs(v.x - q[0]), Math.abs(v.y - q[1]));
        }
      }
    }
    ok(same === n, `framing.sampleCameraKeys vs createCameraRig.sample [${ks.name}]: ${same}/${n} bit-identical`);
    ok(maxNdc < 1e-9, `framing.projectPoint vs THREE Vector3.project [${ks.name}]: max |dNDC| ${maxNdc.toExponential(2)}`);
    console.log(`framing [${ks.name}]: ${same}/${n} samples bit-identical to the rig; projectPoint max |dNDC| vs THREE ${maxNdc.toExponential(2)}`);
  }
  // framingReport: a label that drifts out of frame mid-move is reported as a span
  const keys = [{ t: 0, pos: [0, 1.5, 8], target: [0, 1.5, 0], fov: 30 }, { t: 4, pos: [4, 1.5, 6], target: [3, 1.5, 0], fov: 30 }];
  const rep = F.framingReport([{ id: "title", box: [[-2.2, 2.2, 0], [-0.4, 2.6, 0]], from: 0, to: 4 }, { id: "late", pts: [[0, 0, 0]], from: 9, to: 10 }], keys, { duration: 4, dt: 0.05 });
  ok(!rep.ok && rep.spans.length === 1 && rep.spans[0].id === "title" && rep.spans[0].to === 4 && rep.spans[0].from > 0.5, `framingReport span ${JSON.stringify(rep.spans)}`);
  const rep2 = F.framingReport(() => [{ id: "centre", pts: [[0, 1.5, 0]] }], [{ t: 0, pos: [0, 1.5, 8], target: [0, 1.5, 0] }], { duration: 2 });
  ok(rep2.ok && rep2.worst.ndc === 0, "framingReport: centred point never fails");
  const rep3 = F.framingReport([{ id: "behind", pts: [[0, 1.5, 9]] }], [{ t: 0, pos: [0, 1.5, 8], target: [0, 1.5, 0] }], { duration: 0.1 });
  ok(!rep3.ok && rep3.fails[0].behind, "framingReport: a point behind the camera fails");

  // ------------------------------------------------------------- 6b. pass 7: framingReport window / keepOut, fitShot vs the real rig
  {
    const k0 = [{ t: 0, pos: [0, 1.5, 8], target: [0, 1.5, 0], fov: 30 }];
    const reg = [{ id: "low", pts: [[0, 0.2, 0]] }];  // NDC y ≈ -0.36 at this camera
    const plain = F.framingReport(reg, k0, { duration: 0.1 });
    const win = F.framingReport(reg, k0, { duration: 0.1, window: { y0: -0.3 } });
    const band = F.framingReport(reg, k0, { duration: 0.1, keepOut: [{ id: "caption", ...F.pxRect(0, 700, 1920, 380) }] });
    const exempt = F.framingReport([{ ...reg[0], keepOut: false }], k0, { duration: 0.1, keepOut: [{ id: "caption", ...F.pxRect(0, 700, 1920, 380) }] });
    ok(plain.ok && !win.ok && win.fails[0].reason === "window" && !band.ok && band.fails[0].reason === "keepOut:caption" && exempt.ok,
      `framingReport window/keepOut: plain ${plain.ok}, window ${win.fails[0]?.reason}, band ${band.fails[0]?.reason}, exempt ${exempt.ok}`);
    const pr = F.pxRect(0, 700, 1920, 380);
    ok(Math.abs(pr.y1 - (1 - 1400 / 1080)) < 1e-12 && pr.y0 === -1 && pr.x0 === -1 && pr.x1 === 1, `pxRect ${JSON.stringify(pr)}`);
    // old behaviour unchanged when neither window nor keepOut is given (same fails as before the change)
    ok(rep.fails.every((f) => f.reason === "safe" || f.reason === "behind"), "framingReport without window: old safe test");

    // fitShot: fit, then play the key through the REAL rig + THREE projection and measure
    const subjects = [
      { name: "flat board", s: { box: [[-1.2, 0, -0.02], [1.2, 0.9, 0.02]] }, o: { azimuth: 0, elevation: 0.05, fov: 30 } },
      { name: "table from above-left", s: { box: [[-0.6, 0.7, -0.4], [0.6, 0.78, 0.4]] }, o: { azimuth: -0.6, elevation: 0.9, fov: 32, window: { y0: -0.6 }, fill: 0.85 } },
      { name: "points + box, 1 m scale", s: [[0.1, 0.05, 0.1], { box: [[-0.2, 0, -0.1], [0.15, 0.12, 0.08]] }], o: { azimuth: 2.4, elevation: 0.4, fov: 28, window: { x0: -0.9, x1: 0.5 }, fill: 1 } },
      { name: "skyline, aligned top", s: { box: [[-40, 0, -5], [40, 18, 5]] }, o: { azimuth: 0.1, elevation: 0.06, fov: 30, window: { y0: -0.5, y1: 0.85 }, align: [0, 1], fill: 0.95 } },
    ];
    for (const { name, s: subj, o } of subjects) {
      const key = F.fitShot(subj, o);
      const cam = new THREE.PerspectiveCamera(o.fov, 16 / 9, 0.01, 1000);
      createCameraRig(cam, [{ t: 0, ...key }]).update(0);
      const pts = F.subjectPoints(subj).map((p) => new THREE.Vector3(...p).project(cam));
      const xs = pts.map((v) => v.x), ys = pts.map((v) => v.y);
      const w = { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.9, ...(o.window ?? {}) }, fill = o.fill ?? 0.9;
      const tol = 2e-4; // keys are rounded to 1e-5 m
      const inside = Math.min(...xs) >= w.x0 - tol && Math.max(...xs) <= w.x1 + tol && Math.min(...ys) >= w.y0 - tol && Math.max(...ys) <= w.y1 + tol;
      const fx = (Math.max(...xs) - Math.min(...xs)) / (w.x1 - w.x0), fy = (Math.max(...ys) - Math.min(...ys)) / (w.y1 - w.y0);
      const fillGot = Math.max(fx, fy);
      const dir = [key.pos[0] - key.target[0], key.pos[1] - key.target[1], key.pos[2] - key.target[2]], dl = Math.hypot(...dir);
      const el = Math.asin(dir[1] / dl), az = Math.atan2(dir[0], dir[2]);
      const want = [o.azimuth ?? 0, o.elevation ?? 0.35];
      ok(inside && Math.abs(fillGot - fill) < 2e-3 && Math.abs(el - want[1]) < 1e-4 && Math.abs(Math.atan2(Math.sin(az - want[0]), Math.cos(az - want[0]))) < 1e-4,
        `fitShot [${name}] through the rig: inside window ${inside}, fill ${fillGot.toFixed(4)} (want ${fill}), elev ${el.toFixed(4)}, azim ${az.toFixed(4)}`);
      console.log(`fitShot [${name}]: dist ${key.dist}, rig-projected x [${Math.min(...xs).toFixed(3)}, ${Math.max(...xs).toFixed(3)}] y [${Math.min(...ys).toFixed(3)}, ${Math.max(...ys).toFixed(3)}], fill ${fillGot.toFixed(4)}`);
    }
    // align [0, 1]: the skyline's top edge sits on the window top
    {
      const o = subjects[3].o, key = F.fitShot(subjects[3].s, o), cam = F.sampleCameraKeys([{ t: 0, ...key }], 0, { fov: 30 });
      const e = F.screenExtent(cam, F.subjectPoints(subjects[3].s));
      ok(Math.abs(e.y[1] - 0.85) < 2e-3, `fitShot align top: y max ${e.y[1].toFixed(4)} (window top 0.85)`);
    }
    // ortho
    {
      const subj = { box: [[-1, 0, -1], [1, 0.5, 1]] }, key = F.fitShot(subj, { ortho: true, azimuth: Math.PI / 4, elevation: 0.6155, fov: 30, fill: 1 });
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100); cam.aspect = 16 / 9; cam.fov = 30;
      createCameraRig(cam, [{ t: 0, ...key }]).update(0);
      const ys = F.subjectPoints(subj).map((p) => new THREE.Vector3(...p).project(cam).y);
      ok(Math.abs(Math.max(...ys) - 0.9) < 1e-3 && Math.abs(Math.min(...ys) + 0.9) < 1e-3, `fitShot ortho through the rig: y [${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}]`);
    }
    // the local copy it generalises: bead-abacus fitShot (fill 1, centred) gives the same key
    {
      const { fitShot: beadFit } = await import(pathToFileURL(join(SKILL, "styles/bead-abacus/beads.js")).href);
      const pts = F.boxCorners([-0.5, 0, -0.1], [0.5, 0.4, 0.1]);
      const o = { elev: 0.95, azim: 0.3, fov: 30, win: { x0: -0.86, x1: 0.86, y0: -0.84, y1: 0.62 } };
      const a = beadFit(pts, o), b = F.fitShot(pts, { elevation: o.elev, azimuth: o.azim, fov: 30, window: o.win, fill: 1 });
      const dd = Math.max(...a.pos.map((v, i) => Math.abs(v - b.pos[i])), ...a.target.map((v, i) => Math.abs(v - b.target[i])));
      ok(dd < 1e-3, `kit fitShot == bead-abacus local fitShot (max |d| ${dd.toExponential(2)} m)`);
    }
  }

  // ------------------------------------------------------------- 6. selfcheck black-block detector (synthetic frame)
  const { blackBlocks } = await import(kit("selfcheck.js"));
  const w = 320, h = 160, px = new Uint8Array(w * h * 4).fill(140);
  for (let y = 48; y < 80; y++) for (let x = 96; x < 128; x++) { const o = (y * w + x) * 4; px[o] = px[o + 1] = px[o + 2] = 0; }
  const bb = blackBlocks({ px, w, h });
  ok(bb.count >= 1 && bb.box[0] === 96 && bb.box[2] === 127, `blackBlocks finds a planted hole: ${JSON.stringify(bb)}`);
  const dark = blackBlocks({ px: new Uint8Array(w * h * 4), w, h });
  ok(dark.count === 0, "blackBlocks ignores an all-black frame (no lit neighbours)");
}

console.log(fails ? `test-kit: ${fails} FAILED, ${passes} passed` : `test-kit: all ${passes} checks passed`);
process.exit(fails ? 1 : 0);
