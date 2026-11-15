// styles/impossible-geometry/style.js — Impossible Geometry: sunlit pastel-stone architecture under an orthographic
// camera that lies. Every surface uses an UNLIT three-tone shader whose tones are fixed to the SUN (top / +Z / +X), not
// to the camera, so faces stay true while the camera orbits; fine edge lines come from each block face's UV border in
// screen pixels (fwidth), so they are occlusion-correct for free.
//
// THE SEAM. The stair is a real open chain (impossible.js). From the magic view its last step sits right in front of
// the first step's VIRTUAL copy (cell 0 + k·v). The far end ("B" pieces) is physically nearer the camera than the
// first steps ("A" pieces), so plain depth testing would draw it over them. Fix, in the fragment shader of every B
// material: cast a ray from the fragment AWAY from the camera; if it enters an A box within `depth` (= the k·v gap,
// faded out as the camera leaves the magic direction), the fragment lies in the tunnel between A and its virtual copy
// — it would be hidden behind the virtual copy — so it is discarded and the real A shows through. From the magic view
// that is exactly the picture of a closed staircase; off-axis the cut shrinks to nothing and the chain is honest.
// Props are synchronous + seeded; time enters only through userData.update(t) hooks and style.updateSeam(...).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { overlayText } from "../../kit/callouts.js";
import { pinToScreen } from "../../kit/overlay.js";
import { blobTexture } from "../../kit/textures.js";
import { screenLines } from "../../kit/lines.js";
import { mixHex, hexToRgb } from "../../kit/iso.js";
import { clamp, ease } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as plan from "./impossible.js";
export { STYLE_SPEC };

const MAX_BOXES = 10;
const MAX_CYLS = 8; // vertical cylinders (the walker's body/head/hat when it stands on the A end)

const TONE_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() {
  vUv = uv;
  vN = mat3(modelMatrix) * normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const TONE_FS = /* glsl */ `
uniform vec3 uTop; uniform vec3 uLeft; uniform vec3 uRight; uniform vec3 uBack; uniform vec3 uEdge;
uniform float uEdgeK; uniform float uEdgeW; uniform vec2 uEdgeAxes;
uniform float uCut; uniform float uDepth; uniform vec3 uView;
uniform vec3 uBoxMin[${MAX_BOXES}]; uniform vec3 uBoxMax[${MAX_BOXES}]; uniform int uBoxCount;
uniform vec4 uCyl[${MAX_CYLS}]; uniform int uCylCount; // (cx, cz, r, unused) + y range in uCylY
uniform vec2 uCylY[${MAX_CYLS}];
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() {
  // derivatives first, unconditionally (never inside a per-fragment branch)
  vec2 fw = max(fwidth(vUv), vec2(1e-6));
  vec2 dd = min(vUv, 1.0 - vUv) / fw;
  float ed = min(mix(1e6, dd.x, uEdgeAxes.x), mix(1e6, dd.y, uEdgeAxes.y));
  float line = 1.0 - smoothstep(uEdgeW - 0.6, uEdgeW + 0.6, ed);
  // the seam tunnel cut (B pieces only; uCut is a per-material uniform, uDepth fades with the camera angle)
  if (uCut > 0.5 && uDepth > 1e-4) {
    vec3 d = -uView;
    vec3 inv = vec3(1.0) / (sign(d) * max(abs(d), vec3(1e-5)) + vec3(step(0.0, -abs(d)) * 1e-5));
    for (int j = 0; j < ${MAX_BOXES}; j++) {
      if (j >= uBoxCount) break;
      vec3 t0 = (uBoxMin[j] - vW) * inv;
      vec3 t1 = (uBoxMax[j] - vW) * inv;
      vec3 tl = min(t0, t1), th = max(t0, t1);
      float tn = max(max(tl.x, tl.y), tl.z);
      float tf = min(min(th.x, th.y), th.z);
      if (tf >= tn && tn > 1e-3 && tn < uDepth) discard;
    }
    for (int j = 0; j < ${MAX_CYLS}; j++) {
      if (j >= uCylCount) break;
      vec2 o = vW.xz - uCyl[j].xy; vec2 dx = d.xz;
      float a = max(dot(dx, dx), 1e-8), b = dot(o, dx), c = dot(o, o) - uCyl[j].z * uCyl[j].z;
      float disc = b * b - a * c;
      if (disc < 0.0) continue;
      float sq = sqrt(disc);
      float ta = (-b - sq) / a, tb = (-b + sq) / a;
      float y0 = (uCylY[j].x - vW.y) * inv.y, y1 = (uCylY[j].y - vW.y) * inv.y;
      float tn = max(ta, min(y0, y1)), tf = min(tb, max(y0, y1));
      if (tf >= tn && tn > 1e-3 && tn < uDepth) discard;
    }
  }
  vec3 n = normalize(vN + vec3(0.0, 1e-6, 0.0));
  vec3 side = abs(n.x) > abs(n.z) ? (n.x > 0.0 ? uRight : uBack) : (n.z > 0.0 ? uLeft : uBack);
  vec3 c = n.y > 0.55 ? uTop : (n.y < -0.55 ? uBack : side);
  c = mix(c, mix(c, uEdge, uEdgeK), line);
  gl_FragColor = vec4(c, 1.0);
}`;
const v3 = (hex) => new THREE.Vector3(...hexToRgb(hex));

/**
 * createStyle(stage, opts?) -> style
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, P = spec.palette, S = spec.stairs;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const col = (c) => (c == null ? P.stone : P[c] ?? c);

  // ---------------------------------------------------------------- shared seam uniforms (one object, every material)
  const seamU = {
    uDepth: { value: 0 },
    uView: { value: new THREE.Vector3(0, 1, 0) },
    uBoxMin: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector3()) },
    uBoxMax: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector3()) },
    uBoxCount: { value: 0 },
    uCyl: { value: Array.from({ length: MAX_CYLS }, () => new THREE.Vector4()) },
    uCylY: { value: Array.from({ length: MAX_CYLS }, () => new THREE.Vector2()) },
    uCylCount: { value: 0 },
  };
  const tonesOf = (hex) => {
    const t = (q) => (q && q.k ? mixHex(hex, q.toward, q.k) : hex);
    return { top: t(spec.tones.top), left: t(spec.tones.left), right: t(spec.tones.right), back: t(spec.tones.back) };
  };
  const cache = new Map();
  /** toneMat(base, { cut = false, edges = "both"|"v"|"none", unique }) -> ShaderMaterial (exact sRGB, sun-fixed tones). */
  function toneMat(base, o = {}) {
    const hex = col(base), edges = o.edges ?? "both", cut = !!o.cut;
    const key = `${hex}|${edges}|${cut}`;
    if (!o.unique && cache.has(key)) return cache.get(key);
    const T = tonesOf(hex);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: v3(T.top) }, uLeft: { value: v3(T.left) }, uRight: { value: v3(T.right) }, uBack: { value: v3(T.back) },
        uEdge: { value: v3(spec.edges.toward) }, uEdgeK: { value: spec.edges.k }, uEdgeW: { value: spec.edges.widthPx },
        uEdgeAxes: { value: new THREE.Vector2(edges === "none" ? 0 : edges === "v" ? 0 : 1, edges === "none" ? 0 : 1) },
        uCut: { value: cut ? 1 : 0 },
        ...seamU,
      },
      vertexShader: TONE_VS, fragmentShader: TONE_FS,
    });
    m.name = `tone:${hex}${cut ? ":B" : ""}`;
    m.userData.tones = T;
    if (!o.unique) cache.set(key, m);
    return m;
  }
  const mesh = (geo, color, o = {}) => new THREE.Mesh(geo, toneMat(color, o));
  const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---------------------------------------------------------------- props
  /** block({ min, max, color, cut, edges }) -> box Mesh spanning a world AABB. */
  function block(o) {
    const [a, b] = [o.min, o.max];
    const m = mesh(boxGeo(b[0] - a[0], b[1] - a[1], b[2] - a[2]), o.color ?? "stone", o);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return m;
  }
  /**
   * stairs(P = penroseStairs(...)) -> Group of step blocks. userData: { plan, steps[], aBoxes [[min,max]...] }
   *   Cells < seamCells are the A end (no cut, their boxes feed the tunnel test); cells >= farFrom are the B end (cut).
   */
  function stairs(P) {
    const g = new THREE.Group();
    const steps = P.cells.map((c, i) => {
      const [mn, mx] = plan.cellBox(P, i);
      const m = block({ min: mn, max: mx, color: i % 2 ? "stoneAlt" : "stone", cut: i >= S.farFrom });
      m.userData.cell = i;
      g.add(m);
      return m;
    });
    const aBoxes = P.cells.slice(0, S.seamCells).map((c, i) => plan.cellBox(P, i));
    g.userData = { plan: P, steps, aBoxes };
    return g;
  }
  /**
   * tower({ at:[x, yTop, z], w = .86, len = 2.4, cap = 1.0, color, trim, door: "+z"|"+x"|null, cut })
   *   A hanging stone tower under a corner step: trim band, shaft, arched door, inverted pyramid cap.
   *   userData.boxes = AABBs of its box parts (feed them to the seam if the tower belongs to the A end).
   */
  function tower(o) {
    const [x, y, z] = o.at, w = o.w ?? 0.86, len = o.len ?? 2.4, cap = o.cap ?? 1.0, cut = !!o.cut;
    const g = new THREE.Group();
    const boxes = [];
    const add = (mn, mx, color, extra = {}) => { g.add(block({ min: mn, max: mx, color, cut, ...extra })); boxes.push([mn, mx]); };
    const tw = w / 2 + 0.07;
    add([x - tw, y - 0.16, z - tw], [x + tw, y, z + tw], o.trim ?? "trim");
    add([x - w / 2, y - 0.16 - len, z - w / 2], [x + w / 2, y - 0.16, z + w / 2], o.color ?? "tower");
    add([x - tw, y - 0.3 - len, z - tw], [x + tw, y - 0.16 - len, z + tw], o.trim ?? "trim");
    const pyr = mesh(new THREE.ConeGeometry((tw * Math.SQRT2), cap, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI), o.color ?? "tower", { cut, edges: "none" });
    pyr.position.set(x, y - 0.3 - len - cap / 2, z);
    g.add(pyr);
    if (o.door) {
      const dw = w * 0.36, dh = Math.min(len * 0.42, 0.9);
      const s = new THREE.Shape();
      s.moveTo(-dw / 2, 0); s.lineTo(dw / 2, 0); s.lineTo(dw / 2, dh - dw / 2); s.absarc(0, dh - dw / 2, dw / 2, 0, Math.PI, false); s.lineTo(-dw / 2, 0);
      for (const face of [].concat(o.door)) {
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false, curveSegments: 12 });
        const dm = mesh(geo, "door", { cut, edges: "none" });
        const yb = y - 0.16 - len + 0.18;
        if (face === "+z") dm.position.set(x, yb, z + w / 2 - 0.01);
        else { dm.rotation.y = Math.PI / 2; dm.position.set(x + w / 2 - 0.01, yb, z); }
        g.add(dm);
      }
    }
    g.userData.boxes = boxes;
    return g;
  }
  /** flag({ at:[x,y,z], pole = 1.1, w = .55, hgt = .34, color, cut }) -> Group; userData.update(t) ripples the cloth (pure f(t)). */
  function flag(o) {
    const [x, y, z] = o.at, pole = o.pole ?? 1.1, w = o.w ?? 0.55, hh = o.hgt ?? 0.34, cut = !!o.cut;
    const g = new THREE.Group();
    g.add(block({ min: [x - 0.03, y, z - 0.03], max: [x + 0.03, y + pole, z + 0.03], color: "ink", cut, edges: "none" }));
    const geo = new THREE.PlaneGeometry(w, hh, 10, 1);
    const base = geo.attributes.position.array.slice();
    const cloth = mesh(geo, o.color ?? "flag", { cut, edges: "none", unique: true });
    cloth.material.side = THREE.DoubleSide; // unique material: shares the seam uniforms, never cached
    cloth.position.set(x + w / 2 + 0.03, y + pole - hh / 2 - 0.02, z);
    g.add(cloth);
    g.userData.update = (t) => {
      const p = geo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const u = (base[i] + w / 2) / w;
        p[i + 2] = base[i + 2] + Math.sin(t * 5.2 - u * 5.0) * 0.06 * u;
        p[i + 1] = base[i + 1] - 0.03 * u * u;
      }
      geo.attributes.position.needsUpdate = true;
    };
    g.userData.cloth = cloth;
    return g;
  }
  /** tree({ at:[x,y,z], h = .9, r = .42, cut }) -> faceted round tree (trunk + icosahedron crown). */
  function tree(o) {
    const [x, y, z] = o.at, h = o.h ?? 0.9, r = o.r ?? 0.42, cut = !!o.cut;
    const g = new THREE.Group();
    g.add(block({ min: [x - 0.06, y, z - 0.06], max: [x + 0.06, y + h * 0.55, z + 0.06], color: "trunk", cut, edges: "none" }));
    const crown = mesh(new THREE.IcosahedronGeometry(r, 1), "leaf", { cut, edges: "none" });
    crown.position.set(x, y + h * 0.55 + r * 0.8, z);
    g.add(crown);
    return g;
  }
  /** walker({ h = .62, color, head }) -> little figure (origin = feet). userData { body, head, mats, box(pos) }. */
  function walker(o = {}) {
    const h = o.h ?? 0.62;
    const g = new THREE.Group();
    const mBody = toneMat(o.color ?? "walker", { unique: true, edges: "none" });
    const mHead = toneMat(o.head ?? "walkerHead", { unique: true, edges: "none" });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.2, h * 0.27, h * 0.62, 20, 1).translate(0, h * 0.31, 0), mBody);
    const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.2, 20, 14).translate(0, h * 0.8, 0), mHead);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(h * 0.17, h * 0.22, 16).translate(0, h * 1.03, 0), mBody);
    g.add(body, head, hat);
    const r = h * 0.3;
    g.userData = {
      mats: [mBody, mHead], h,
      /** AABB of the figure standing at pos (for the seam: the walker's own tunnel when it is on the A end). */
      box: (pos) => [[pos[0] - r, pos[1], pos[2] - r], [pos[0] + r, pos[1] + h * 1.15, pos[2] + r]],
      /** vertical cylinders hugging body / head / hat at pos: [cx, cz, r, y0, y1] (the seam tunnel of the walker). */
      cyls: (pos, sy = 1) => [
        [0, 0.62, 0.21], [0.66, 0.76, 0.16], [0.76, 0.88, 0.19], [0.88, 0.92, 0.16], [0.92, 1.02, 0.125], [1.02, 1.1, 0.06],
      ].map(([y0, y1, r]) => [pos[0], pos[2], h * r, pos[1] + h * y0 * sy, pos[1] + h * y1 * sy]), // slightly INSIDE the silhouette
      setCut: (on) => { mBody.uniforms.uCut.value = on ? 1 : 0; mHead.uniforms.uCut.value = on ? 1 : 0; },
    };
    return g;
  }
  /** groundShadow({ at:[x,y,z], w, d, rot }) -> soft flat blob on the (invisible) ground. */
  function groundShadow(o) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(o.w, o.d).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture({ size: 256 }), color: spec.shadow.color, transparent: true, opacity: spec.shadow.opacity, depthWrite: false, toneMapped: false }),
    );
    m.position.set(o.at[0], o.at[1] + spec.shadow.lift, o.at[2]);
    if (o.rot) m.rotation.y = o.rot;
    m.renderOrder = -1;
    return m;
  }
  /**
   * gapLine(a, b) -> dashed screen-space line between the two ends of the chain (the closing step's virtual landing and
   *   the real first step). It lies along v, so from the magic view it collapses to a dot; userData.set(level).
   */
  function gapLine(a, b) {
    const G = spec.gap;
    const m = screenLines(stage, [[a, b]], { width: G.widthPx, color: G.color, dash: G.dash, depth: "none", blending: "normal" });
    m.userData.set = (k) => { m.visible = k > 0.003; m.userData.setLevel(k * G.level); };
    m.userData.set(0);
    return m;
  }
  /** label(text, { x, y, align }) -> overlay caption; userData.update(t, { on, off }) fades + rises it in. */
  function label(text, o = {}) {
    const L = spec.overlay;
    const m = overlayText(text, { height: 1, weight: spec.text.weight, tracking: L.tracking, color: col(o.color ?? "label"), font: textStyle.font });
    const x = o.x ?? 0, y = o.y ?? 0.8;
    m.userData.update = (t, w) => {
      const a = clamp((t - w.on) / L.inDur) * (1 - clamp((t - (w.off - L.outDur)) / L.outDur));
      m.visible = a > 0.002;
      m.material.opacity = ease.outCubic(a);
      const dy = (1 - ease.outCubic(clamp((t - w.on) / L.inDur))) * -L.rise;
      pinToScreen(stage, m, { x, y: y + dy, height: L.labelH * 0.5 });
    };
    m.userData.update(-1, { on: 0, off: 1 });
    return m;
  }

  // ---------------------------------------------------------------- the seam controller
  const _v = new THREE.Vector3();
  /**
   * updateSeam({ boxes [[min,max]...], cyls [[cx,cz,r,y0,y1]...], toCamera [x,y,z] (unit, subject -> camera), magic (plan.magic), k (plan.k) })
   *   Sets the shared tunnel uniforms. depth = k · fade(angle off magic) · (v · w): the cut is the exact seam at the
   *   magic view and shrinks smoothly to nothing a few degrees off it. Returns { angle, fade, depth }.
   */
  function updateSeam(o) {
    const cy = o.cyls ?? [];
    const nc = Math.min(MAX_CYLS, cy.length);
    for (let i = 0; i < MAX_CYLS; i++) {
      const c = i < nc ? cy[i] : [0, 0, 0, 0, -1];
      seamU.uCyl.value[i].set(c[0], c[1], c[2], 0); seamU.uCylY.value[i].set(c[3], c[4]);
    }
    seamU.uCylCount.value = nc;
    const n = Math.min(MAX_BOXES, o.boxes.length);
    for (let i = 0; i < MAX_BOXES; i++) {
      const b = i < n ? o.boxes[i] : [[0, 0, 0], [-1, -1, -1]];
      seamU.uBoxMin.value[i].set(...b[0]); seamU.uBoxMax.value[i].set(...b[1]);
    }
    seamU.uBoxCount.value = n;
    const w = o.toCamera, v = o.magic.dir;
    _v.set(...w).normalize();
    seamU.uView.value.copy(_v);
    const angle = plan.viewAngle([_v.x, _v.y, _v.z], v);
    const fade = plan.sealFade(angle, { full: (spec.seam.fullDeg * Math.PI) / 180, gone: (spec.seam.goneDeg * Math.PI) / 180 });
    const depth = o.k * fade * (v[0] * _v.x + v[1] * _v.y + v[2] * _v.z);
    seamU.uDepth.value = depth;
    return { angle, fade, depth };
  }

  const props = { block, stairs, tower, flag, tree, walker, groundShadow, gapLine, label };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera,
    props, factories: {}, sfx: spec.sfx,
    plan, motion: plan,
    helpers: { toneMat, mesh, updateSeam, MAX_BOXES },
  };
}
