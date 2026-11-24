// styles/risograph/style.js — "Risograph": a sheet of rough off-white paper on a print tray, printed in three flat inks by
// a drum that rolls across it on two rails. The look lives in spec.js; the artwork (POSTER), when each ink goes down, the
// drum's path and the registration error of every layer live in riso.js (THREE-free planner shared with SCORE).
// This file turns the plan into pictures:
//   * ONE print shader, injected into a lit MeshStandardMaterial (so the drum's real shadow and the key light fall on
//     the print): for every pixel and every ink it moves the pixel into that layer's (mis)registered frame, evaluates the
//     poster tone there (posterGLSL, analytic shapes = crisp at any zoom), screens it with an analytic cosine spot at the
//     ink's screen angle (threshold screening: dots clip at shape edges, tone 1 prints solid), roughens the dot edge,
//     drops ink on the paper tooth, mottles the density, reveals it behind the drum's contact line, and overprints
//     paper x PRODUCT(1 - coverage x density x (1 - ink)) in linear light.
//   * The drum (ink sleeve, clamp bar, flanges, axle, brackets on rails), the tray with rim and rails, the table, and an
//     overlay caption whose old line rolls up and out while the new one rolls in (never two texts on top of each other).
// Props never animate themselves: the scene calls press.update(t) and caption.userData.show(...).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { contactShadow } from "../../kit/builders.js";
import { softRectTexture } from "../../kit/textures.js";
import { ease } from "../../kit/time.js";
import * as riso from "./riso.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const SH = spec.sheet, TR = spec.tray, DR = spec.drum, HT = spec.halftone;
  const shadow = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
  const boxMesh = (w, h, d, mat, x, y, z, r = 0) => {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = shadow(new THREE.Mesh(g, mat)); m.position.set(x, y, z); return m;
  };
  if (lights.key) { lights.key.shadow.camera.near = 1; lights.key.shadow.camera.far = 16; }

  // ---------------------------------------------------------------- the print shader
  /** printMaterial(poster = riso.POSTER) -> MeshStandardMaterial with the print injected; userData.set(u) takes plan.uniformsAt(t) */
  function printMaterial(poster = riso.POSTER) {
    const U = {
      uInk: { value: spec.inks.map((k) => new THREE.Color(k.color)) },
      uDens: { value: spec.inks.map((k) => k.density) },
      uAng: { value: spec.inks.map((k) => k.angle) },
      uReg: { value: [0, 1, 2].map(() => new THREE.Vector3()) },
      uLine: { value: [0, 1, 2].map(() => new THREE.Vector2(-99, 1)) },
      uPaper: { value: new THREE.Color(P.paper) },
      uHT: { value: new THREE.Vector4(HT.cell, HT.gain, HT.rough, HT.roughScale) },
      uTex: { value: new THREE.Vector4(HT.toothScale, HT.toothSkip, HT.mottle, HT.mottleScale) },
      uPaperTone: { value: HT.paperTone },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
    mat.name = "risoPrint";
    const decl = /* glsl */ `
      varying vec2 vSheet;
      uniform vec3 uInk[3];
      uniform float uDens[3];
      uniform float uAng[3];
      uniform vec3 uReg[3];
      uniform vec2 uLine[3];
      uniform vec3 uPaper;
      uniform vec4 uHT;   // cell, gain, rough, roughScale
      uniform vec4 uTex;  // toothScale, toothSkip, mottle, mottleScale
      uniform float uPaperTone;
      float rsH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float rsN(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(rsH(i), rsH(i + vec2(1.0, 0.0)), u.x), mix(rsH(i + vec2(0.0, 1.0)), rsH(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      // fbm grain with every octave faded in only once its cell is ~2 px or more (no shimmer in the wide, fine fibre
      // detail in the macro); octaves are rotated so the value-noise lattice never shows. Returns ~[-0.5, 0.5].
      float rsGrain(vec2 p, float freq, float aa, float seed) {
        float n = 0.0; float ws = 0.0; float f = freq; float w = 1.0;
        vec2 q = p;
        for (int o = 0; o < 4; o++) {
          float vis = smoothstep(2.6, 5.0, 1.0 / (f * aa));   // octaves finer than ~3 px stay out (bitrate under moves)
          n += w * vis * (rsN(q * f + seed + float(o) * 19.7) - 0.5);
          ws += w * vis;
          q = mat2(0.8, 0.6, -0.6, 0.8) * q; f *= 2.3; w *= 0.72;
        }
        return n / max(ws, 1e-3) * smoothstep(0.0, 0.6, ws);
      }
      ${riso.posterGLSL(poster)}
      vec3 rsPrint(vec2 p) {
        vec2 fw = fwidth(p);
        float aa = max(max(fw.x, fw.y), 1e-6);                 // one pixel in sheet metres
        float screenOn = smoothstep(2.5, 5.0, uHT.x / aa);      // cells under ~3 px: print the mean tone (no aliasing)
        float tooth = rsGrain(p, uTex.x, aa, 3.1);
        float skip = uTex.y * smoothstep(0.16, 0.3, tooth);     // ink skips on the high points of the tooth
        vec3 col = uPaper * (1.0 - uPaperTone * tooth * 2.0);
        for (int i = 0; i < 3; i++) {
          vec3 rg = uReg[i];
          vec2 pd = p - rg.xy;
          float cr = cos(rg.z); float sr = sin(rg.z);
          vec2 q = vec2(cr * pd.x + sr * pd.y, -sr * pd.x + cr * pd.y);   // this layer's frame (rigid offset + turn)
          vec3 sel = vec3(float(i == 0), float(i == 1), float(i == 2));
          float tone = dot(posterTone(q, aa), sel);
          float a = uAng[i];
          vec2 s = vec2(cos(a) * q.x + sin(a) * q.y, -sin(a) * q.x + cos(a) * q.y) / uHT.x;
          float spot = 0.5 - 0.25 * (cos(6.2831853 * s.x) + cos(6.2831853 * s.y));
          float rough = rsGrain(q, uHT.w, aa, float(i) * 17.31) * uHT.z * 2.0;
          float fv = mix(-uHT.y, 1.0 + uHT.y, tone) - spot + rough;
          float w = max(fwidth(fv), 1e-4) * 0.75;
          float cov = mix(tone, smoothstep(-w, w, fv), screenOn);
          vec2 ln = uLine[i];
          float rev = clamp((ln.x - p.x) * ln.y / max(aa * 1.5, 0.0015) + 0.5, 0.0, 1.0);
          float mott = 1.0 - uTex.z * rsN(q * uTex.w + float(i) * 7.7);
          float k = cov * rev * mott * (1.0 - skip) * uDens[i];
          col *= 1.0 - k * (1.0 - uInk[i]);
        }
        return col;
      }
    `;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSheet;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSheet = position.xy;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + decl)
        .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = rsPrint(vSheet);");
    };
    mat.customProgramCacheKey = () => "risoPrint-v2";
    mat.userData.uniforms = U;
    mat.userData.set = (u) => {
      for (let i = 0; i < 3; i++) {
        U.uReg.value[i].set(u.reg[i][0], u.reg[i][1], u.reg[i][2]);
        U.uLine.value[i].set(u.line[i][0], u.line[i][1]);
      }
    };
    return mat;
  }

  // ---------------------------------------------------------------- sheet, tray, table
  /** sheet(material) -> Group: the printed top (plane, sheet-local xy) over a thin paper body */
  function sheet(mat = printMaterial()) {
    const g = new THREE.Group(); g.name = "sheet";
    const body = boxMesh(SH.width, SH.thick, SH.height, materials.paperEdge, 0, SH.thick / 2, 0);
    body.castShadow = false; g.add(body);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(SH.width, SH.height, 1, 1), mat);
    top.rotation.x = -Math.PI / 2; top.position.y = SH.thick + 0.0004; top.receiveShadow = true; top.name = "print";
    g.add(top);
    const cs = contactShadow({ w: SH.width * 1.05, d: SH.height * 1.07, opacity: 0.3, color: "#10161a", y: 0.0012, texture: softRectTexture({ soft: 0.05, radius: 0.02 }) });
    g.add(cs);
    g.userData.print = top;
    return g;
  }
  /** tray() -> Group: enamel tray (top at y = 0) with a rim and two steel rails for the drum brackets */
  function tray() {
    const g = new THREE.Group(); g.name = "tray";
    const w = SH.width + 2 * TR.marginX, d = SH.height + 2 * TR.marginY;
    g.add(boxMesh(w, TR.thick, d, materials.tray, 0, -TR.thick / 2, 0, 0.01));
    const rim = (ww, dd, x, z) => g.add(boxMesh(ww, TR.rimH, dd, materials.trayRim, x, TR.rimH / 2 - 0.002, z, 0.008));
    rim(w, TR.rim, 0, d / 2 - TR.rim / 2); rim(w, TR.rim, 0, -d / 2 + TR.rim / 2);
    rim(TR.rim, d, w / 2 - TR.rim / 2, 0); rim(TR.rim, d, -w / 2 + TR.rim / 2, 0);
    for (const s of [-1, 1]) g.add(boxMesh(w - 2 * TR.rim - 0.04, 0.03, 0.05, materials.steel, 0, 0.015, s * railZ(), 0.006));
    return g;
  }
  const sleeveLen = () => SH.height + 2 * DR.overhang * 0.3;
  const railZ = () => sleeveLen() / 2 + 0.06 + 0.1;
  /** table() -> big matte plane under the tray */
  function table() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), materials.table);
    m.rotation.x = -Math.PI / 2; m.position.y = -TR.thick; m.receiveShadow = true; m.name = "table";
    return m;
  }

  // ---------------------------------------------------------------- the drum
  /** drum() -> Group (axis along rig z): ink sleeve + clamp bar + flanges + axle + brackets; userData.set(d) takes plan.drumAt(t) */
  function drum() {
    const g = new THREE.Group(); g.name = "drum";
    const spin = new THREE.Group(); g.add(spin);
    const L = sleeveLen(), R = DR.radius;
    const sleeveMat = new THREE.MeshStandardMaterial({ color: spec.inks[0].color, roughness: 0.36, metalness: 0.0 });
    sleeveMat.name = "drumSleeve";
    const sleeve = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 72, 1), sleeveMat));
    sleeve.rotation.x = Math.PI / 2; spin.add(sleeve);
    // clamp bar along the sleeve (shows the roll) + two thin ink-edge rings
    const bar = boxMesh(DR.clampW, 0.022, L * 0.98, materials.darkSteel, 0, R + 0.004, 0, 0.006); spin.add(bar);
    for (const s of [-1, 1]) {
      const fl = shadow(new THREE.Mesh(new THREE.CylinderGeometry(DR.flange, DR.flange, 0.035, 72), materials.steel));
      fl.rotation.x = Math.PI / 2; fl.position.z = s * (L / 2 + 0.017); spin.add(fl);
      const hub = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 32), materials.darkSteel));
      hub.rotation.x = Math.PI / 2; hub.position.z = s * (L / 2 + 0.055); spin.add(hub);
      // bracket: a plate from the rail up to the axle (does not spin)
      const zb = s * railZ();
      g.add(boxMesh(0.16, R + 0.03, 0.04, materials.darkSteel, 0, -(R + 0.03) / 2 + 0.03, zb, 0.01));
      g.add(boxMesh(0.2, 0.05, 0.07, materials.steel, 0, -R + 0.025, zb, 0.012));
    }
    const axle = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2 * railZ() + 0.08, 16), materials.steel));
    axle.rotation.x = Math.PI / 2; g.add(axle);
    const cols = spec.inks.map((k) => new THREE.Color(k.color));
    const tmp = new THREE.Color();
    g.userData.set = (d) => {
      g.visible = d.visible;
      g.position.set(d.x, SH.thick + R + d.lift, 0);
      spin.rotation.z = -d.spin;
      tmp.setRGB(0, 0, 0);
      for (let i = 0; i < 3; i++) tmp.r += cols[i].r * d.ink[i], tmp.g += cols[i].g * d.ink[i], tmp.b += cols[i].b * d.ink[i];
      sleeveMat.color.copy(tmp);
    };
    return g;
  }

  // ---------------------------------------------------------------- overlay caption: old line rolls up and out, new rolls in
  /** caption() -> overlay chip; userData.show(a, b, u): a = current text, b = incoming text, u = roll progress 0..1 */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.w, Hp = Q.h + 22;
    const fontPx = Math.round(Q.cap * 1.38);
    const inkHex = spec.inks.map((k) => k.color);
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      x.font = `${Q.weight} ${fontPx}px ${Q.font}`;
      const icon = Math.round(Q.h * 0.6), pad = Math.round(Q.cap * 0.62);
      const wOf = (s) => (s ? pad + icon + pad * 0.85 + x.measureText(s).width + pad * 1.1 : 0);
      const e = ease.inOutCubic(st.u);
      const pw = Math.round(st.b ? wOf(st.a) + (wOf(st.b) - wOf(st.a)) * e : wOf(st.a));
      const ph = Q.h, ox = Math.round((W - pw) / 2), oy = 6;
      // riso-style hard offset shadow in pink, then the plate with an ink outline
      x.fillStyle = inkHex[0]; x.beginPath(); x.roundRect(ox + 7, oy + 7, pw, ph, 10); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 9); x.stroke();
      // icon: three overlapping ink discs, overprinted (multiply)
      const cx = ox + pad + icon / 2, cy = oy + ph / 2, rr = icon * 0.3;
      x.globalCompositeOperation = "multiply";
      [[-0.42, 0.3], [0.42, 0.3], [0, -0.42]].forEach(([dx, dy], i) => {
        x.fillStyle = inkHex[i]; x.beginPath(); x.arc(cx + dx * rr, cy + dy * rr, rr, 0, Math.PI * 2); x.fill();
      });
      x.globalCompositeOperation = "source-over";
      // text, clipped to the plate: a rolls up and out, b rolls in from below
      x.save(); x.beginPath(); x.rect(ox + 3, oy + 3, pw - 6, ph - 6); x.clip();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      const tx = ox + pad + icon + pad * 0.85, ty = oy + ph / 2 + 2;
      if (st.a && e < 1) x.fillText(st.a, tx, ty - e * ph);
      if (st.b && e > 0) x.fillText(st.b, tx, ty + (1 - e) * ph);
      x.restore();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y - Hp + 8);
    mesh.userData.show = (a, b = "", u = 0) => {
      mesh.userData.set({ a, b: b || "", u: b ? Math.round(u * 240) / 240 : 0 });
      mesh.userData.opacity(a || b ? 1 : 0);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * risoPress(plan) -> { rig, sheet, tray, drum, print, update(t) } (adds itself to the scene)
   *   rig: the tilted group (sheet x -> +X, sheet y -> -Z, turned by spec.sheet.tilt about +Y)
   */
  function risoPress(plan, o = {}) {
    const rig = new THREE.Group(); rig.name = "risoPress";
    rig.rotation.y = SH.tilt;
    const mat = printMaterial(o.poster ?? riso.POSTER);
    const sh = sheet(mat); rig.add(sh);
    const tr = tray(); rig.add(tr);
    const dr = drum(); rig.add(dr);
    stage.scene.add(rig);
    stage.scene.add(table());
    return {
      rig, sheet: sh, tray: tr, drum: dr, print: mat,
      update(t) {
        const u = plan.uniformsAt(t);
        mat.userData.set(u);
        dr.userData.set(u.drum);
      },
    };
  }

  const props = { printMaterial, sheet, tray, table, drum, caption, risoPress };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: riso, motion: riso,
  };
}
