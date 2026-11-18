// styles/layer-print/style.js — "Layer Print": a desktop 3D printer laying a part down layer by layer. The look lives
// in spec.js; WHERE the nozzle is WHEN lives in slicer.js (THREE-free plan shared with SCORE). This file turns a plan into
// pictures: one bead mesh for the whole print (flattened tubes swept along every extruding move, built ONCE, each vertex
// carrying its deposit time; a frame sets drawRange + a time uniform, so nothing is rebuilt and nothing carries over), a
// thin "planned path" line ahead of the nozzle, the printer (frame, bed, rising gantry, beam, head with a glowing nozzle,
// filament tube), a small workshop set and an overlay caption chip. Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas, canvas2d } from "../../kit/canvas.js";
import { liveTube } from "../../kit/paths.js";
import { clamp } from "../../kit/time.js";
import * as slicer from "./slicer.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const PR = spec.printer, BD = spec.bead;

  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    return m;
  };
  const cyl = (r, h, mat, seg = 28) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  // ---------------------------------------------------------------- bead geometry (built once per plan)
  /**
   * sweepRuns(runs, { w, h, radial, colorOf(run) -> THREE.Color | null }) -> { geometry, segStart, segCum }
   *   Every run ({ pts: [[x, y, z]], times, closed, layer }) becomes a tube with an elliptical cross-section (w wide,
   *   h tall) in its layer plane. Attributes: aTime (deposit time), aLayer, color. Triangles are written in time order;
   *   segStart[k] / segCum[k] = start time of chunk k / index count once it is included (for drawRange).
   */
  function sweepRuns(runs, o = {}) {
    const w = o.w ?? BD.width, h = o.h ?? BD.height, R = o.radial ?? BD.radial;
    let nv = 0, ni = 0;
    for (const r of runs) { const n = r.pts.length; nv += n * R + (r.closed ? 0 : 2); ni += (n - 1) * R * 6 + (r.closed ? 0 : 2 * R * 3); }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const tim = new Float32Array(nv), lay = new Float32Array(nv);
    const idx = new Uint32Array(ni);
    const segStart = [], segCum = [];
    const cs = [], sn = [];
    for (let j = 0; j < R; j++) { cs.push(Math.cos((TAU * j) / R)); sn.push(Math.sin((TAU * j) / R)); }
    let v = 0, q = 0;
    const white = new THREE.Color(1, 1, 1);
    for (const r of runs) {
      const pts = r.pts, n = pts.length, base = v, c = o.colorOf?.(r) ?? white;
      let t0x = 0, t0z = 0, t1x = 0, t1z = 0;
      for (let k = 0; k < n; k++) {
        const p = pts[k];
        const a = k > 0 ? pts[k - 1] : r.closed ? pts[n - 2] : null;
        const b = k < n - 1 ? pts[k + 1] : r.closed ? pts[1] : null;
        let d1x = 0, d1z = 0, d2x = 0, d2z = 0;
        if (a) { const l = Math.hypot(p[0] - a[0], p[2] - a[2]) || 1; d1x = (p[0] - a[0]) / l; d1z = (p[2] - a[2]) / l; }
        if (b) { const l = Math.hypot(b[0] - p[0], b[2] - p[2]) || 1; d2x = (b[0] - p[0]) / l; d2z = (b[2] - p[2]) / l; }
        if (!a) { d1x = d2x; d1z = d2z; }
        if (!b) { d2x = d1x; d2z = d1z; }
        let tx = d1x + d2x, tz = d1z + d2z;
        const tl = Math.hypot(tx, tz);
        if (tl < 1e-4) { tx = d2x; tz = d2z; } else { tx /= tl; tz /= tl; }
        const miter = 1 / Math.max(0.5, tx * d2x + tz * d2z);
        const sx = -tz, sz = tx;   // side = tangent x up
        if (k === 0) { t0x = tx; t0z = tz; }
        if (k === n - 1) { t1x = tx; t1z = tz; }
        for (let j = 0; j < R; j++) {
          const i3 = v * 3, hw = (w / 2) * miter * cs[j];
          pos[i3] = p[0] + sx * hw; pos[i3 + 1] = p[1] + sn[j] * (h / 2); pos[i3 + 2] = p[2] + sz * hw;
          let nx = sx * cs[j] * h, ny = sn[j] * w, nz = sz * cs[j] * h;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nor[i3] = nx / nl; nor[i3 + 1] = ny / nl; nor[i3 + 2] = nz / nl;
          col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
          tim[v] = r.times[k]; lay[v] = r.layer;
          v++;
        }
      }
      let cStart = -1, cEnd = -1;
      if (!r.closed) {
        const cap = (p, tx, tz, sgn, time) => {
          const i3 = v * 3;
          pos[i3] = p[0] + sgn * tx * w * 0.3; pos[i3 + 1] = p[1]; pos[i3 + 2] = p[2] + sgn * tz * w * 0.3;
          nor[i3] = sgn * tx; nor[i3 + 1] = 0; nor[i3 + 2] = sgn * tz;
          col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
          tim[v] = time; lay[v] = r.layer;
          return v++;
        };
        cStart = cap(pts[0], t0x, t0z, -1, r.times[0]);
        cEnd = cap(pts[n - 1], t1x, t1z, 1, r.times[n - 1]);
        for (let j = 0; j < R; j++) { idx[q++] = cStart; idx[q++] = base + j; idx[q++] = base + ((j + 1) % R); }
      }
      for (let k = 0; k < n - 1; k++) {
        for (let j = 0; j < R; j++) {
          const A = base + k * R + j, B = base + k * R + ((j + 1) % R), C = A + R, D = B + R;
          idx[q++] = A; idx[q++] = C; idx[q++] = B; idx[q++] = B; idx[q++] = C; idx[q++] = D;
        }
        segStart.push(r.times[k]); segCum.push(q);
      }
      if (!r.closed) {
        const e = base + (n - 1) * R;
        for (let j = 0; j < R; j++) { idx[q++] = cEnd; idx[q++] = e + ((j + 1) % R); idx[q++] = e + j; }
        segStart.push(r.times[n - 1]); segCum.push(q);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geometry.setAttribute("aTime", new THREE.BufferAttribute(tim, 1));
    geometry.setAttribute("aLayer", new THREE.BufferAttribute(lay, 1));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    geometry.computeBoundingSphere();
    return { geometry, segStart, segCum };
  }
  const countAt = (segStart, segCum, t) => {
    let lo = -1, hi = segStart.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segStart[m] <= t) lo = m; else hi = m - 1; }
    return lo < 0 ? 0 : segCum[lo];
  };
  /** filamentColor(u 0..1 up the height) -> THREE.Color from spec.bead.stops */
  const stopCols = BD.stops.map(([u, hex]) => [u, new THREE.Color(hex)]);
  function filamentColor(u) {
    let i = 0;
    while (i < stopCols.length - 2 && u > stopCols[i + 1][0]) i++;
    const [u0, c0] = stopCols[i], [u1, c1] = stopCols[i + 1];
    return c0.clone().lerp(c1, clamp((u - u0) / (u1 - u0)));
  }

  /**
   * part(plan) -> Mesh: the whole print. userData.update(t) shows every bead laid by t (drawRange up to the segment the
   * nozzle is on, a discard past the nozzle inside it) and makes fresh plastic glow.
   */
  function part(plan) {
    const cols = plan.layers.map((L) => filamentColor(L.i / Math.max(1, plan.n - 1)));
    const { geometry, segStart, segCum } = sweepRuns(plan.beads, { colorOf: (r) => cols[r.layer] });
    const mat = materials.filament.clone();
    const U = { uT: { value: -1 }, uHot: { value: new THREE.Color(BD.hot.color).multiplyScalar(BD.hot.strength) }, uTau: { value: BD.hot.tau } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aTime;\nvarying float vBT;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBT = aTime;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vBT;\nuniform float uT, uTau;\nuniform vec3 uHot;")
        .replace("void main() {", "void main() {\n  if (vBT > uT) discard;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += uHot * exp(-max(uT - vBT, 0.0) / uTau);");
    };
    mat.customProgramCacheKey = () => "layer-print-bead-v1";
    const m = new THREE.Mesh(geometry, mat);
    m.name = "part"; m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    m.userData.update = (t) => {
      U.uT.value = t;
      const c = countAt(segStart, segCum, t);
      geometry.setDrawRange(0, c);
      m.visible = c > 0;
    };
    m.userData.update(-1);
    return m;
  }
  /** ghost(plan) -> Mesh: the planned path of the CURRENT layer, ahead of the nozzle (only layers slow enough to follow) */
  function ghost(plan) {
    const G = spec.ghost;
    const slow = plan.beads.filter((r) => plan.layerT1[r.layer] - plan.layerT0[r.layer] >= G.minLayer);
    const { geometry } = sweepRuns(slow, { w: G.width, h: G.height, radial: 4 });
    const U = { uT: { value: -1 }, uL: { value: 0 } };
    const mat = new THREE.MeshBasicMaterial({ color: G.color });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aTime;\nattribute float aLayer;\nvarying float vBT;\nvarying float vBL;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBT = aTime;\nvBL = aLayer;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vBT;\nvarying float vBL;\nuniform float uT, uL;")
        .replace("void main() {", "void main() {\n  if (vBT <= uT || abs(vBL - uL) > 0.5) discard;");
    };
    mat.customProgramCacheKey = () => "layer-print-ghost-v1";
    const m = new THREE.Mesh(geometry, mat);
    m.name = "ghost"; m.castShadow = m.receiveShadow = false; m.frustumCulled = false;
    m.userData.update = (t) => { U.uT.value = t; U.uL.value = plan.layerAt(t); m.visible = t < plan.t1; };
    m.userData.update(-1);
    return m;
  }

  // ---------------------------------------------------------------- the printer
  /**
   * printer() -> Group: frame, bed, spool + the moving gantry / beam / head / filament tube.
   *   userData.setNozzle(p, level): p = plan nozzle point (bed coordinates, bead centre); the nozzle tip sits on top of
   *   that bead, the beam above it, the gantry at its height. level 0..1 = nozzle glow.
   */
  function printer() {
    const g = new THREE.Group(); g.name = "printer";
    const { post: PO, bed: B, rail, head: H, nozzle: NZ } = PR;
    const alu = materials.aluminium, dark = materials.dark;
    // frame
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(PO.s, PO.h, PO.s, alu, sx * PO.x, PO.h / 2, sz * PO.z));
    for (const y of [PO.s / 2, PO.h - PO.s / 2]) {
      for (const sz of [-1, 1]) g.add(box(2 * PO.x - PO.s, PO.s, PO.s, alu, 0, y, sz * PO.z));
      for (const sx of [-1, 1]) g.add(box(PO.s, PO.s, 2 * PO.z - PO.s, alu, sx * PO.x, y, 0));
    }
    // bed: dark gridded plate on a base, a warm strip on its front edge (heated)
    g.add(box(B.w * 0.9, PR.bedY - B.t, B.d * 0.9, dark, 0, (PR.bedY - B.t) / 2, 0));
    const plate = box(B.w, B.t, B.d, materials.bed, 0, PR.bedY - B.t / 2, 0); plate.name = "bed";
    g.add(plate);
    const strip = box(B.w * 0.5, B.t * 0.3, 0.02, materials.bedGlow, 0, PR.bedY - B.t / 2, B.d / 2 + 0.011);
    strip.castShadow = false; g.add(strip);
    // spool on the top back bar
    const SP = PR.spool, spool = new THREE.Group();
    const wound = cyl(SP.r * 0.84, SP.w, materials.spoolD); spool.add(wound);
    for (const s of [-1, 1]) { const f = cyl(SP.r, 0.035, dark); f.position.y = s * (SP.w / 2 + 0.0175); spool.add(f); }
    spool.rotation.z = Math.PI / 2;
    spool.position.set(SP.x, PO.h + SP.r + 0.1, -PO.z);
    g.add(spool);
    for (const s of [-1, 1]) g.add(box(0.07, SP.r + 0.14, 0.14, dark, SP.x + s * (SP.w / 2 + 0.09), PO.h + (SP.r + 0.14) / 2, -PO.z));
    // gantry (rises): side rails + post carriages
    const xin = PO.x - PO.s / 2 - rail / 2;
    const gy = new THREE.Group(); gy.name = "gantry"; g.add(gy);
    for (const sx of [-1, 1]) {
      gy.add(box(rail, rail, 2 * PO.z - PO.s, alu, sx * xin, 0, 0));
      for (const sz of [-1, 1]) gy.add(box(PO.s + 0.14, 0.36, PO.s + 0.14, dark, sx * PO.x, 0, sz * PO.z));
    }
    // beam (slides front-back)
    const bz = new THREE.Group(); bz.name = "beam"; gy.add(bz);
    bz.add(box(2 * xin - rail, rail, rail, alu));
    for (const sx of [-1, 1]) bz.add(box(0.3, 0.28, 0.36, dark, sx * xin, 0, 0));
    // head (slides left-right); the nozzle tip is at (0, -gantryUp, +beamBack) in beam coordinates
    const hx = new THREE.Group(); hx.name = "head"; bz.add(hx);
    const tip = new THREE.Group(); tip.position.set(0, -PR.gantryUp, PR.beamBack); hx.add(tip);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(NZ.r, NZ.h, 24), materials.brass);
    cone.rotation.x = Math.PI; cone.position.y = NZ.h / 2; cone.castShadow = true; tip.add(cone);
    const hot = new THREE.Mesh(new THREE.SphereGeometry(NZ.tip, 16, 12), materials.nozzleTip.clone());
    hot.position.y = NZ.tip * 0.35; tip.add(hot);
    tip.add(box(0.27, 0.17, 0.23, materials.sock, 0, NZ.h + 0.085, 0));
    const sink = cyl(0.1, 0.26, materials.steel, 20); sink.position.y = NZ.h + 0.17 + 0.13; tip.add(sink);
    for (let k = 0; k < 4; k++) { const fin = cyl(0.15, 0.02, materials.steel, 20); fin.position.y = NZ.h + 0.2 + k * 0.065; tip.add(fin); }
    const shellY = NZ.h + 0.43;
    const shell = new THREE.Mesh(new RoundedBoxGeometry(H.w, H.h, H.d, 4, 0.07), materials.headShell);
    shell.position.set(0, shellY + H.h / 2, 0); shell.castShadow = shell.receiveShadow = true; tip.add(shell);
    tip.add(box(H.w * 0.8, 0.42, 0.24, dark, 0, PR.gantryUp, -PR.beamBack));   // clamp around the beam
    const hang = PR.gantryUp + 0.21 - (shellY + H.h * 0.5);
    tip.add(box(H.w * 0.62, hang, 0.1, dark, 0, shellY + H.h * 0.5 + hang / 2, -PR.beamBack + 0.13));   // carriage plate: head hangs below the beam
    const fan = cyl(0.2, 0.06, dark, 28); fan.rotation.x = Math.PI / 2; fan.position.set(0, shellY + H.h * 0.52, H.d / 2 + 0.03); tip.add(fan);
    const hub = cyl(0.07, 0.07, materials.aluminium, 20); hub.rotation.x = Math.PI / 2; hub.position.copy(fan.position); hub.position.z += 0.01; tip.add(hub);
    const lamp = new THREE.PointLight(PR.light.color, 0, PR.light.distance, 2);
    lamp.position.set(0, 0.06, 0.22); lamp.castShadow = false; tip.add(lamp);
    // filament tube from the spool to the top of the head
    const TB = PR.tube, tube = liveTube(TB.points, 6, TB.r, materials.tube);
    tube.name = "tube"; g.add(tube);
    const from = [SP.x, PO.h + 0.2, -PO.z + 0.2], headTop = shellY + H.h;
    const hotBase = materials.nozzleTip.emissiveIntensity;
    g.userData.setNozzle = (p, level = 1) => {
      const tipY = PR.bedY + p[1] + BD.height / 2;
      gy.position.y = tipY + PR.gantryUp;
      bz.position.z = p[2] - PR.beamBack;
      hx.position.x = p[0];
      hot.material.emissiveIntensity = hotBase * (0.25 + 0.75 * level);
      lamp.intensity = PR.light.intensity * level;
      const to = [p[0], tipY + headTop, p[2]];
      const mid = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + TB.sag, (from[2] + to[2]) / 2];
      const pts = [];
      for (let k = 0; k < TB.points; k++) {
        const u = k / (TB.points - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        pts.push([a * from[0] + b * mid[0] + c * to[0], a * from[1] + b * mid[1] + c * to[1], a * from[2] + b * mid[2] + c * to[2]]);
      }
      tube.userData.set(pts);
    };
    g.userData.setNozzle([0, 1, 0], 1);
    return g;
  }

  // ---------------------------------------------------------------- workshop set
  /** pegboard() -> CanvasTexture: pale board with a sparse grid of soft holes (low contrast: it sits far behind) */
  function pegboard() {
    const cv = newCanvas(256, 256), x = canvas2d(cv);
    x.fillStyle = P.wall; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#c3ccd2";
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(32 + i * 64, 32 + j * 64, 7, 0, TAU); x.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    return tex;
  }
  /** miniPot(material, scale) -> a small smooth earlier prototype of the same shape (set dressing) */
  function miniPot(material, scale = 0.4) {
    const SH = spec.shape, pts = [];
    for (let i = 0; i <= 24; i++) pts.push(new THREE.Vector2(slicer.profileAt(SH.profile, i / 24) * scale, (i / 24) * SH.height * scale));
    const mat = material.clone(); mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** workshop() -> Group: birch bench top, pegboard back wall, three filament spools and two earlier prototypes */
  function workshop(o = {}) {
    const g = new THREE.Group(); g.name = "workshop";
    const size = o.size ?? 44;
    const bench = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.bench);
    if (materials.bench.map) materials.bench.map.repeat.set(size / 5, size / 5);
    bench.rotation.x = -Math.PI / 2; bench.receiveShadow = true; bench.name = "bench"; g.add(bench);
    const wm = materials.wall.clone(); wm.map = pegboard(); wm.map.repeat.set(size / 2, 8); wm.color.set("#ffffff");
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(size, 16), wm);
    wall.position.set(0, 8, o.wallZ ?? -7.5); wall.receiveShadow = true; wall.name = "wall"; g.add(wall);
    const spools = [[-4.35, -3.9, materials.spoolA], [-5.55, -3.3, materials.spoolB], [-6.6, -4.3, materials.spoolC]];
    for (const [x, z, mat] of spools) {
      const s = new THREE.Group(), r = 0.62, w = 0.32;
      s.add(cyl(r * 0.84, w, mat));
      for (const k of [-1, 1]) { const f = cyl(r, 0.035, materials.tube); f.position.y = k * (w / 2 + 0.0175); s.add(f); }
      const hole = cyl(r * 0.22, w + 0.08, materials.dark); s.add(hole);
      const band = cyl(r * 1.0, w * 0.5, mat); band.scale.set(0.9, 1, 0.9); s.add(band);
      s.rotation.x = Math.PI / 2; s.position.set(x, r, z); g.add(s);
    }
    const a = miniPot(materials.spoolA, 0.42); a.position.set(4.5, 0, -3.6); g.add(a);
    const b = miniPot(materials.spoolB, 0.58); b.position.set(5.9, 0, -3.0); g.add(b);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (white pill, dark rule, a 5-bar "layers" icon that fills with progress); userData.show(text, alpha, progress) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1240, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.2}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(20,30,40,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, ph / 2 - 2); x.stroke();
      const cx = ox + pad, cy = oy + (ph - ic) / 2, bh = ic / 5;
      for (let k = 0; k < 5; k++) {
        x.fillStyle = k < st.lit ? Q.bar : Q.barOff;
        x.beginPath(); x.roundRect(cx, cy + (4 - k) * bh + 1.5, ic, bh - 3, (bh - 3) / 2); x.fill();
      }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y - 6);
    mesh.userData.show = (text, a, progress = 0) => { mesh.userData.set({ text, lit: text ? Math.min(5, Math.ceil(progress * 5 - 1e-6)) : 0 }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * printJob(plan) -> { group, printer, part, ghost, update(t) } (adds itself to the scene): workshop + printer + the print.
   *   update(t): beads laid by t, the planned-path line, the head exactly at plan.nozzleAt(t), nozzle glow on while printing.
   */
  function printJob(plan, o = {}) {
    const group = new THREE.Group(); group.name = "print-job";
    if (o.workshop !== false) group.add(workshop(o.workshop));
    const pr = printer(); group.add(pr);
    const onBed = new THREE.Group(); onBed.position.y = PR.bedY; group.add(onBed);
    const pt = part(plan), gh = ghost(plan);
    onBed.add(pt); onBed.add(gh);
    stage.scene.add(group);
    return {
      group, printer: pr, part: pt, ghost: gh,
      update(t) {
        pt.userData.update(t);
        gh.userData.update(t);
        const nz = plan.nozzleAt(t);
        const cool = 1 - clamp((t - plan.t1) / Math.max(1e-6, plan.park.dur));
        pr.userData.setNozzle(nz.p, t < plan.t1 ? 1 : cool);
      },
    };
  }

  const props = { workshop, printer, part, ghost, caption, printJob, miniPot, sweepRuns, filamentColor };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: slicer, motion: slicer,
  };
}
